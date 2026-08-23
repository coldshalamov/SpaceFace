// PQ-023 `gold-corridor-required-cues` — dense-scene cue arbitration.
//
// This module is the single declared source of the per-tick presentation lane budget and the rule
// that decides which cue keeps a slot when a tick saturates. It is deliberately renderer/audio/DOM
// free and allocation free on the decision path so the orchestrator can call it per cue.
//
// It replaces two defects measured at b6b6422d (see
// design/graphics-sprints/handoffs/2026-07-28-pq023-corridor-cues-audit.md):
//
//  1. `.none` lane placeholders consumed real budget. `cueRecipes.laneSet()` stamps `camera.none`,
//     `audio.none`, `ui.none` and `accessibility.none` onto recipes that drive no such channel, and
//     the old accounting charged every declared lane. Because the camera lane caps at 3, THREE cues
//     of any kind in one tick exhausted it and every later cue in that tick was dropped. The adapter
//     already skips `.none` lanes (`presentationAdapters._applyVfx` returns null on `vfx.none`);
//     only the budget accounting disagreed.
//
//  2. Suppression was first-come-first-served, so a critical cue that arrived late in a saturated
//     tick lost its slot to flavor. Measured: a `tether.break` (importance 0.92, tagged `critical`,
//     a member of CRITICAL_SLICE_EVENT_IDS) was dropped while three `mining.drill.contact` cues
//     (importance 0.46) survived on arrival order alone.
//
// The fix is RESERVATION, not sorting and not deferral. `_emitCue` is a streaming API — it cannot
// sort cues that have not arrived yet, and buffering to tick end would change emission ordering into
// the adapters. Each lane's cap is split into a critical reserve plus a general pool: critical cues
// may draw the whole cap, flavor may draw only the general pool. Totals are UNCHANGED, so the rule
// is a no-op below saturation and only membership changes at saturation.

import { CRITICAL_SLICE_EVENT_IDS } from './cueSchema.js';
import { deriveVfxAdmissionMetadata } from './vfxAdmissionPriority.js';

/**
 * Maximum cues that may claim each lane within one simulation tick. Totals are identical to the
 * pre-PQ-023 `DEFAULT_LANE_BUDGETS_PER_TICK` — this leaf redistributes the cap, it does not raise it.
 */
export const CUE_LANE_BUDGETS = Object.freeze({
  camera: 3,
  vfx: 8,
  audio: 6,
  ui: 6,
  accessibility: 6,
});

/**
 * How many mechanically critical cues can legitimately land in the SAME tick. A corridor engagement
 * can collapse a shield, disable a subsystem and snap a massline on one frame, so the reserve has to
 * be sized to that co-occurrence — a smaller reserve still drops critical state, just later.
 *
 * Measured: with a reserve of 2 the dense-combat gate dropped exactly one critical cue per saturated
 * tick (6 of 18), because ten flavor cues consumed the general audio pool and only two reserved
 * slots remained for three critical cues. See scripts/check-pq023-corridor-cues.mjs.
 */
export const CRITICAL_COOCCURRENCE = 3;

/**
 * Slots inside each lane cap that only a critical cue may claim. The general pool is
 * `CUE_LANE_BUDGETS[lane] - CUE_LANE_CRITICAL_RESERVE[lane]`.
 *
 * Camera reserves 1 of 3 rather than CRITICAL_COOCCURRENCE: camera is the channel most able to fight
 * aiming, and the packet's non-goals forbid camera motion that steals control. The reserve there
 * guarantees ONE critical kick can land, deliberately not three stacking on one frame.
 */
export const CUE_LANE_CRITICAL_RESERVE = Object.freeze({
  camera: 1,
  vfx: CRITICAL_COOCCURRENCE,
  audio: CRITICAL_COOCCURRENCE,
  ui: CRITICAL_COOCCURRENCE,
  accessibility: CRITICAL_COOCCURRENCE,
});

const CRITICAL_ID_SET = new Set(CRITICAL_SLICE_EVENT_IDS);
const CRITICAL_TAG = 'critical';

/** A lane value of `<lane>.none` declares "this recipe drives no such channel". */
export function isNoneLane(value) {
  return typeof value === 'string' && value.endsWith('.none');
}

/**
 * Critical identity reuses the two markers the codebase already carries — the
 * CRITICAL_SLICE_EVENT_IDS list and the `critical` recipe tag. Deliberately NOT a new priority
 * field: a parallel ranking would have to be kept in sync with both of those by hand.
 */
export function isCriticalCue(event, recipe) {
  const id = (event && event.id) || (recipe && recipe.id) || null;
  if (id && CRITICAL_ID_SET.has(id)) return true;
  const tags = (recipe && recipe.tags) || (event && event.tags) || null;
  if (Array.isArray(tags)) {
    for (let i = 0; i < tags.length; i += 1) if (tags[i] === CRITICAL_TAG) return true;
  }
  return false;
}

/** Per-tick slots available to this cue on this lane. */
export function laneLimitFor(lane, critical) {
  const total = CUE_LANE_BUDGETS[lane] || 1;
  if (critical) return total;
  return total - (CUE_LANE_CRITICAL_RESERVE[lane] || 0);
}

/**
 * @returns {string|null} `lane_budget:<lane>` when this cue cannot claim every lane it drives,
 * otherwise null. Lanes declared `.none` are never charged and never block.
 */
export function laneBudgetReason(lanes, critical, laneCounts) {
  if (!lanes) return null;
  const counts = laneCounts || {};
  // Sorted so the reported blocking lane is stable regardless of recipe key order.
  const laneNames = Object.keys(lanes).sort();
  for (let i = 0; i < laneNames.length; i += 1) {
    const lane = laneNames[i];
    if (isNoneLane(lanes[lane])) continue;
    if ((counts[lane] || 0) >= laneLimitFor(lane, critical)) return `lane_budget:${lane}`;
  }
  return null;
}

/** Charge one slot on each lane this cue actually drives. Mutates and returns `laneCounts`. */
export function chargeCueLanes(lanes, laneCounts) {
  const counts = laneCounts || {};
  if (!lanes) return counts;
  for (const lane of Object.keys(lanes)) {
    if (isNoneLane(lanes[lane])) continue;
    counts[lane] = (counts[lane] || 0) + 1;
  }
  return counts;
}

/**
 * Structural-fx cue kind. This is NOT a new presentation recipe and does not charge lane budgets —
 * kill / hard-collision / bank-shot receipts request the arcade pool through the same admission
 * metadata every other VFX already uses (`deriveVfxAdmissionMetadata`).
 */
export const STRUCTURAL_FX_CUE_KIND = 'vfx.arcade_structural';

export const STRUCTURAL_FX_FAMILIES = Object.freeze({
  kill: 'kill',
  collision: 'collision',
  bank: 'bank',
});

function hasBankFlag(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.bank === true || payload.ricochet === true || payload.bounce === true) return true;
  const cause = payload.cause;
  return cause === 'bank' || cause === 'ricochet' || cause === 'deflect';
}

/** Classify a domain or presentation receipt into a structural family, or null. */
export function structuralFxFamilyFromReceipt(eventName, payload) {
  const name = typeof eventName === 'string' ? eventName : '';
  if (name === 'entity:killed') return STRUCTURAL_FX_FAMILIES.kill;
  if (name === 'combat:collisionConsequence') {
    return payload && payload.control === 'tumble' ? STRUCTURAL_FX_FAMILIES.collision : null;
  }
  if (name === 'projectile:bank' || name === 'projectile:ricochet' || name === 'combat:bankShot') {
    return STRUCTURAL_FX_FAMILIES.bank;
  }
  if (name === 'projectile:hit' && hasBankFlag(payload)) return STRUCTURAL_FX_FAMILIES.bank;
  if (payload && (payload.lane === STRUCTURAL_FX_CUE_KIND || payload.kind === STRUCTURAL_FX_CUE_KIND)) {
    const family = payload.family || payload.cause;
    if (family === STRUCTURAL_FX_FAMILIES.kill
      || family === STRUCTURAL_FX_FAMILIES.collision
      || family === STRUCTURAL_FX_FAMILIES.bank) return family;
  }
  return null;
}

/**
 * Admit a structural-fx request. Returns null when the receipt is not a structural family.
 * Priority is `deriveVfxAdmissionMetadata` — this does not mint a recipe or charge lane slots.
 */
export function admitStructuralFxCue(eventName, payload, state) {
  const family = structuralFxFamilyFromReceipt(eventName, payload);
  if (!family) return null;
  const admission = deriveVfxAdmissionMetadata(payload || {}, state);
  return {
    kind: STRUCTURAL_FX_CUE_KIND,
    family,
    admissionPriority: admission.admissionPriority,
    importance: admission.importance,
    playerRelevance: admission.playerRelevance,
    proximity: admission.proximity,
    severity: admission.severity,
    targetRelevance: admission.targetRelevance,
    playerCaused: admission.playerCaused,
    currentTarget: admission.currentTarget,
    sourceId: admission.sourceId,
    targetId: admission.targetId,
  };
}

/**
 * The packet's required budget declaration, as data so tests can assert it rather than trusting
 * prose. Instance/pool figures name the module that actually enforces them — this leaf declares the
 * contract and does not re-implement pooling that already exists.
 */
export const CUE_BUDGET_DECLARATION = Object.freeze({
  schema: 'spaceface.cueBudgetDeclaration.v1',
  leafId: 'PQ-023.gold-corridor-required-cues',
  lanes: CUE_LANE_BUDGETS,
  criticalReserve: CUE_LANE_CRITICAL_RESERVE,
  exhaustionBehavior: Object.freeze({
    rule: 'reservation',
    generalPoolExhausted: 'flavor cues are suppressed with lane_budget:<lane>',
    criticalReservePreserved: 'critical cues may claim the full lane cap and survive flavor saturation',
    ordering: 'streaming; arrival order never promotes a flavor cue over a critical one',
    nonePlaceholdersCharged: false,
  }),
  cadence: Object.freeze({
    laneCountsResetPerTick: true,
    dedupeWindowTicksOwner: 'cueRecipes.<id>.dedupeWindowTicks',
    dedupeSweepIntervalTicks: 60,
  }),
  instancing: Object.freeze({
    projectileAndImpactSprites: 'src/render/combat/instancedSpritePool.js',
    beams: 'src/render/combat/persistentBeams.js',
    destructionPhases: 'src/render/combat/phasedExplosions.js',
    arcadeStructuralFx: 'src/render/combat/arcadeStructuralFx.js',
    worldSiteFixtures: 'src/render/worldSitePresentation.js (<=12 fixtures, <=12 animations per stage)',
  }),
  structuralFx: Object.freeze({
    kind: STRUCTURAL_FX_CUE_KIND,
    families: STRUCTURAL_FX_FAMILIES,
    pool: 'src/render/combat/arcadeStructuralFx.js',
    admission: 'deriveVfxAdmissionMetadata',
    laneBudgetsCharged: false,
  }),
  allocation: Object.freeze({
    hotPathAllocation: false,
    decisionPathAllocation: false,
    note: 'laneBudgetReason/chargeCueLanes allocate only the sorted lane-name array per decision',
  }),
  lightsAndPost: Object.freeze({
    perCueEventLights: 'recipe.budgets.lights (0 under reduced-flash)',
    postProcessing: 'unchanged by this leaf; no full-screen pass added',
  }),
  cleanup: Object.freeze({
    fixtureDisposal: 'worldSitePresentation.dispose() removes mounts and disposes geometry+material',
    hiddenEffectsAsleep: 'no idle rAF; fixture updates are driven by the caller',
  }),
});

export default CUE_BUDGET_DECLARATION;
