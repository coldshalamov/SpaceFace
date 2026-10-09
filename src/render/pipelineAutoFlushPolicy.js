// When leftover FX compiles share the present beat, Intel TDR's. Opening still
// drains through waitForCaptured / flushQueuedThrough, which ignore this flag.
// Auto-flush on rAF must stay deferred until the first playable stamp exists.
//
// Picture policies for the glass (admission width, residency motion, poles,
// present bookkeeping) live here so a test can pin them without booting WebGL.

import {
  ADMISSION_SLICE_MIN_ITEMS,
  ADMISSION_SLICE_TARGET_MS,
  admissionSliceOverHardLimit,
  shouldContinueAdmissionSlice,
} from './admissionSliceBudget.js';

export const FIRST_FLIGHT_PIPELINE_HOLD_S = 20;

export const ADMISSION_SLICE_UNCLOCKED_YIELD_CAP = 6;
export const LIVING_MACHINE_FLOOR = 0.35;
export const CRUCIBLE_POLE_SPECIMEN_CAP = 48;
export const HITCH_RING_LENGTH = 16;
export const HITCH_PRESENT_MS = 33.4;
export const POSE_JUMP_WU = 1e6;
export const ARRIVAL_ROSTER_ID_SAMPLE = 64;
export const ARRIVAL_ROSTER_MISS_PRESENTS = 600;
export const PRESENT_INPUT_EDGE_CAP = 32;
export const VISIBILITY_OFF_GLASS_PRESENTS = 8;

const ARRIVAL_TYPES = new Set(['ship', 'station', 'asteroid', 'wreck', 'payload', 'beacon']);
const _archetypeCounts = new Map();
const _batchPick = { archetype: null, rows: 0, draws: 0 };

export function shouldDeferPipelineAutoFlush({
  postOpeningReleased = false,
  firstPlayableFrameAt = null,
  mode = null,
  simTime = 0,
  holdSeconds = FIRST_FLIGHT_PIPELINE_HOLD_S,
} = {}) {
  // Live formula as of the pre-campaign dirty tree: once post-opening
  // admission is released, auto-flush is allowed. Unreleased opening still
  // defers while loading, until first playable, or through the first-flight hold.
  if (postOpeningReleased === true) return false;
  return mode === 'loading'
    || !Number.isFinite(firstPlayableFrameAt)
    || (Number(simTime) || 0) < holdSeconds;
}

/**
 * Belt-tail decode starts. Never above the shared decode budget. The floor of 2
 * is the budget's own floor; a tighter budget wins so this lane cannot starve
 * the present thread by outrunning resolveDecodeTaskBudgetLimit.
 */
export function beltTailDecodeConcurrency(cores, budgetLimit) {
  const budget = Number.isFinite(Number(budgetLimit)) && Number(budgetLimit) > 0
    ? Math.floor(Number(budgetLimit))
    : 2;
  const fromCores = Number.isFinite(Number(cores)) ? Math.max(2, Math.floor(Number(cores)) - 2) : budget;
  return Math.min(budget, fromCores);
}

/** True once the ambient slice has finished its minimum item and spent its clock. */
export function ambientAdmissionShouldYield(options = {}) {
  const itemsDone = Math.max(0, Math.floor(Number(options.itemsDone) || 0));
  const minItems = Number.isFinite(Number(options.minItems))
    ? Math.floor(Number(options.minItems))
    : ADMISSION_SLICE_MIN_ITEMS;
  if (itemsDone < minItems) return false;
  const startedAtMs = Number.isFinite(Number(options.startedAtMs)) ? Number(options.startedAtMs) : 0;
  const elapsedMs = Number(options.elapsedMs);
  const nowMs = Number.isFinite(Number(options.nowMs))
    ? Number(options.nowMs)
    : startedAtMs + (Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (admissionSliceOverHardLimit({ startedAtMs, nowMs, hardMs: options.hardMs })) return true;
  return !shouldContinueAdmissionSlice({
    startedAtMs,
    nowMs,
    itemsDone,
    targetMs: options.targetMs ?? ADMISSION_SLICE_TARGET_MS,
    minItems,
  });
}

/**
 * Yield the live-geometry drain uses. A resolved promise while the slice has
 * room lets several fast ambient roots finish in one present (one microtask is
 * enough for a sync compile to settle). Once the slice clock or a tight
 * compile-wait run is spent, hand the thread to the next present so a long
 * link cannot occupy the frame. minItems stays 1.
 */
export function createAmbientAdmissionYield(yieldToNextPresent, now) {
  const clock = typeof now === 'function' ? now : () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  );
  let startedAt = 0;
  let itemsDone = 0;
  let open = false;
  let tightYields = 0;
  let lastAt = 0;
  return function ambientAdmissionYield() {
    const t = clock();
    if (!open) {
      open = true;
      startedAt = t;
      itemsDone = 0;
      tightYields = 0;
      lastAt = t;
    }
    if (t - lastAt < 0.05) tightYields += 1;
    else tightYields = 0;
    lastAt = t;
    const elapsed = t - startedAt;
    let yieldNow = ambientAdmissionShouldYield({
      elapsedMs: elapsed,
      itemsDone,
      startedAtMs: startedAt,
      nowMs: t,
    });
    if (!yieldNow && itemsDone >= ADMISSION_SLICE_MIN_ITEMS
        && tightYields >= ADMISSION_SLICE_UNCLOCKED_YIELD_CAP) {
      yieldNow = true;
    }
    itemsDone += 1;
    if (!yieldNow) return Promise.resolve();
    open = false;
    const next = typeof yieldToNextPresent === 'function' ? yieldToNextPresent() : undefined;
    return Promise.resolve(next);
  };
}

export function openingAdmissionBlocksControl(pendingHandles) {
  return (Number(pendingHandles) || 0) > 0;
}

/** A hold refuses the draw. It does not shrink the visible cohort. */
export function openingAdmissionKeepsVisibleCohort(beforeCount, afterCount) {
  return (afterCount | 0) === (beforeCount | 0);
}

/**
 * One score for decorative motion. The player always stays awake. Off-glass
 * sleeps. A ship or station on the glass stays awake even when it is stopped.
 * Ambient props sleep unless they are close or moving. Presentation only.
 */
export function livingMachineScore({
  isPlayer = false,
  onGlass = false,
  distanceWu = Infinity,
  speedWu = 0,
  role = '',
  glassRadiusWu = 800,
} = {}) {
  if (isPlayer) return 1;
  if (!onGlass) return 0;
  const roleName = String(role || '');
  const roleBoost = roleName === 'ship' || roleName === 'station' || roleName === 'place' ? 0.4 : 0.08;
  const radius = Number.isFinite(Number(glassRadiusWu)) && Number(glassRadiusWu) > 0
    ? Number(glassRadiusWu)
    : 800;
  const dist = Number.isFinite(Number(distanceWu)) ? Math.max(0, Number(distanceWu)) : radius;
  const proximity = Math.max(0, 1 - dist / radius);
  const speed = Number.isFinite(Number(speedWu)) ? Math.max(0, Number(speedWu)) : 0;
  const motion = Math.min(1, speed / 40);
  return Math.min(1, proximity * 0.45 + motion * 0.35 + roleBoost);
}

export function livingMachineStaysInMotion(score, floor = LIVING_MACHINE_FLOOR) {
  return Number(score) >= floor;
}

/** Plain opaque standard/physical families whose production draw is the instanced chunk. */
export function redundantDirectSpecimen(material) {
  if (!material || typeof material !== 'object') return false;
  const data = material.userData || {};
  if (data.playerHull === true || data.spacefacePlayerHull === true) return false;
  if (material.transparent === true || material.alphaHash === true) return false;
  if (Number(material.transmission) > 0) return false;
  // Material.prototype.onBeforeCompile is a function on every Three material.
  // Only an own hook compiles a program the instanced chunk does not already draw.
  if (Object.hasOwn(material, 'onBeforeCompile')) return false;
  if (data.roughnessBreakup === true) return false;
  const type = material.type || '';
  return type === 'MeshStandardMaterial' || type === 'MeshPhysicalMaterial';
}

/**
 * Extra shader poles for the crucible warm. The instanced twin already links
 * this material's own side, clearcoat, and alphaTest. The opposite side, a
 * clearcoat of 0.12, and an alphaTest of 0.02 are programs the live hull does
 * not compile — do not mount them. A plain opaque hull adds zero extra links.
 */
export function cruciblePoleVariants(material) {
  if (!material) return [];
  return [];
}

export function cruciblePoleSpecimenKey(material, pole) {
  const family = material && (material.uuid || material.name || material.type) || 'material';
  const side = pole && pole.side != null ? pole.side : 0;
  const clearcoat = pole && Number(pole.clearcoat) > 0 ? 1 : 0;
  const alphaTest = pole && Number(pole.alphaTest) > 0 ? 1 : 0;
  return `${family}|instanced|${side}|${clearcoat}|${alphaTest}`;
}

export function publishGeometryPending(renderState, stats) {
  if (!renderState) return 0;
  const queued = stats && Number.isFinite(Number(stats.queued)) ? Math.max(0, Number(stats.queued)) : 0;
  renderState.geometryPending = queued;
  return queued;
}

export function presentPublicationsForFrameDebt() {
  return 1;
}

/** Nearby work only. The universe count is not a scan budget. */
export function spatialInteractionLimit(nearby) {
  return Math.max(0, Math.floor(Number(nearby) || 0));
}

export function consumePresentInputEdge(latch, action, down, present) {
  if (!latch || action == null) return false;
  let record = latch[action];
  if (!record) {
    record = { down: false, present: -1 };
    latch[action] = record;
  }
  const now = down === true;
  const rising = now && record.down !== true && record.present !== present;
  record.down = now;
  if (!rising) return false;
  record.present = present;
  return true;
}

export function createHitchRing() {
  const slots = new Array(HITCH_RING_LENGTH);
  for (let i = 0; i < HITCH_RING_LENGTH; i++) slots[i] = { present: 0, dtMs: 0 };
  return { slots, next: 0, count: 0 };
}

export function noteHitchRing(ring, present, dtMs, threshold = HITCH_PRESENT_MS) {
  if (!ring || !ring.slots || !Number.isFinite(Number(dtMs)) || Number(dtMs) < threshold) return ring;
  const slot = ring.slots[ring.next];
  slot.present = present | 0;
  slot.dtMs = Number(dtMs);
  ring.next = (ring.next + 1) % ring.slots.length;
  if (ring.count < ring.slots.length) ring.count += 1;
  return ring;
}

/**
 * Pose deltas inside the envelope are not a bug. A jump with no matching writer
 * stays unattributed — that is "not reproduced", not a second defect.
 */
export function attributePoseJump({ dx = 0, dz = 0, writers = null } = {}) {
  const dist = Math.hypot(Number(dx) || 0, Number(dz) || 0);
  if (!(dist >= POSE_JUMP_WU)) return { jumped: false, reason: 'within-envelope' };
  if (writers && typeof writers === 'object') {
    const names = Object.keys(writers);
    for (let i = 0; i < names.length; i++) {
      const writer = writers[names[i]];
      if (!writer) continue;
      const writerDist = Math.hypot(Number(writer.dx) || 0, Number(writer.dz) || 0);
      if (Math.abs(writerDist - dist) <= 1) {
        return { jumped: true, attributed: true, writer: names[i], reason: 'writer' };
      }
    }
  }
  return { jumped: true, attributed: false, reason: 'not-reproduced' };
}

export function buildArrivalRoster(entities, options = {}) {
  const list = Array.isArray(entities) ? entities : [];
  const byteCeiling = Number(options.byteCeiling) > 0 ? Number(options.byteCeiling) : Number.POSITIVE_INFINITY;
  const maxIds = Math.max(1, Math.floor(byteCeiling / 64));
  const ids = [];
  const programKeys = [];
  const seenPrograms = new Set();
  let truncated = false;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (!ARRIVAL_TYPES.has(entity.type)) continue;
    if (ids.length >= maxIds) {
      truncated = true;
      break;
    }
    ids.push(entity.id);
    const key = entity.programKey || entity.archetype || entity.type;
    if (key != null && !seenPrograms.has(key)) {
      seenPrograms.add(key);
      programKeys.push(String(key));
    }
  }
  const sampleLimit = spatialInteractionLimit(
    Math.min(ARRIVAL_ROSTER_ID_SAMPLE, ids.length),
    list.length,
  );
  return {
    sectorId: options.sectorId == null ? null : String(options.sectorId),
    seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : null,
    count: ids.length,
    ids,
    idSample: ids.slice(0, sampleLimit),
    programKeys,
    presentOrigin: Number.isFinite(Number(options.presentOrigin)) ? Number(options.presentOrigin) : 0,
    truncated,
  };
}

// Stepped twin: yields per batchRows scanned rows so the sector:enter emit can
// drive the entityList census across the paced slice clock instead of paying it
// inside the emit tail. Row order and verdicts identical to the sync build.
export function* buildArrivalRosterSteps(entities, options = {}, batchRows = 1024) {
  // Snapshot: the caller passes the live entityList and this walk suspends —
  // a swap-pop mid-walk would teleport an unvisited member behind the cursor.
  const list = Array.isArray(entities) ? entities.slice() : [];
  const byteCeiling = Number(options.byteCeiling) > 0 ? Number(options.byteCeiling) : Number.POSITIVE_INFINITY;
  const maxIds = Math.max(1, Math.floor(byteCeiling / 64));
  const ids = [];
  const programKeys = [];
  const seenPrograms = new Set();
  let truncated = false;
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && i % batchRows === 0) yield;
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (!ARRIVAL_TYPES.has(entity.type)) continue;
    if (ids.length >= maxIds) {
      truncated = true;
      break;
    }
    ids.push(entity.id);
    const key = entity.programKey || entity.archetype || entity.type;
    if (key != null && !seenPrograms.has(key)) {
      seenPrograms.add(key);
      programKeys.push(String(key));
    }
  }
  const sampleLimit = spatialInteractionLimit(
    Math.min(ARRIVAL_ROSTER_ID_SAMPLE, ids.length),
    list.length,
  );
  return {
    sectorId: options.sectorId == null ? null : String(options.sectorId),
    seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : null,
    count: ids.length,
    ids,
    idSample: ids.slice(0, sampleLimit),
    programKeys,
    presentOrigin: Number.isFinite(Number(options.presentOrigin)) ? Number(options.presentOrigin) : 0,
    truncated,
  };
}

export function noteArrivalRosterMiss(renderState, ids, entityId, present, origin) {
  if (!renderState) return 0;
  const current = renderState.arrivalRosterMiss | 0;
  if (!ids || typeof ids.has !== 'function' || entityId == null) return current;
  const window = (present | 0) - (origin | 0);
  if (window < 0 || window > ARRIVAL_ROSTER_MISS_PRESENTS) return current;
  if (ids.has(entityId)) return current;
  renderState.arrivalRosterMiss = current + 1;
  return renderState.arrivalRosterMiss;
}

/**
 * The non-player archetype with the most visible rows. Draws is 1 when that
 * archetype collapses to one batch, else 0. Does not hide meshes.
 */
export function selectNonPlayerArchetype(snapshot, playerEntityId, out = _batchPick) {
  out.archetype = null;
  out.rows = 0;
  out.draws = 0;
  if (!snapshot || !snapshot.columns || !snapshot.columns.archetype) return out;
  const archetype = snapshot.columns.archetype;
  const flags = snapshot.columns.flags;
  const entityId = snapshot.columns.entityId;
  const count = snapshot.count | 0;
  _archetypeCounts.clear();
  let playerArchetype = null;
  const playerId = playerEntityId == null ? null : (playerEntityId >>> 0);
  for (let i = 0; i < count; i++) {
    if (flags && (flags[i] & 1) === 0) continue;
    const arch = archetype[i];
    if (playerId != null && entityId && entityId[i] === playerId) {
      playerArchetype = arch;
      continue;
    }
    _archetypeCounts.set(arch, (_archetypeCounts.get(arch) || 0) + 1);
  }
  for (const [arch, rows] of _archetypeCounts) {
    if (playerArchetype != null && arch === playerArchetype) continue;
    if (rows > out.rows) {
      out.archetype = arch;
      out.rows = rows;
      out.draws = 1;
    }
  }
  return out;
}
