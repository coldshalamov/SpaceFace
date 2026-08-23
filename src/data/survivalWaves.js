// Survival wave-recipe catalog and pure validator (CRU-009).
// Data only: no runtime writes, no imports from src/systems/**.
// Recipe field names follow design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md Appendix A.2.
// Waves 1–10 per arena are the template block for the thirty-wave Foundry arc
// (survivalActs.js). Do not change recipe bodies: waves 1, 5 and 10 are pinned.

import { COMBAT_LAB_ARENAS } from './combatLabSetups.js';
import { ENEMY_TYPES } from './enemies.js';

export const SURVIVAL_WAVE_SCHEMA_VERSION = 1;

// Role slots from §21.3 (lines 2949–2962): Mass, Pressure, Control, Reach,
// Support, Anchor, Disruptor, Elite. Not every wave uses every slot.
export const SURVIVAL_WAVE_ROLES = Object.freeze([
  'mass',
  'pressure',
  'control',
  'reach',
  'support',
  'anchor',
  'disruptor',
  'elite',
]);

// Gate groups a recipe may name. Corner gates from Appendix A.1 spawnGates
// (line 6038: nw, ne, sw, se). diagonal_a / rear from Appendix A.2 packages
// (lines 6063, 6072). front / diagonal_b are the pincer complements implied
// by §21.4 Pincer (lines 2976–2978: two or more spawn directions).
export const SURVIVAL_GATE_GROUPS = Object.freeze([
  'nw',
  'ne',
  'sw',
  'se',
  'front',
  'rear',
  'diagonal_a',
  'diagonal_b',
]);

// DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
const SPAWN_BUDGET_DEFAULT_MAX = 24;

const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ROLE_SET = new Set(SURVIVAL_WAVE_ROLES);
const GATE_SET = new Set(SURVIVAL_GATE_GROUPS);
const ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

/**
 * Peak concurrent demand is the no-death occupancy of the spawn timeline:
 * every scheduled body occupies a slot from its spawn tick through wave
 * completion. A pure planner has no death model, so this equals total
 * package count. Cap is 24 (src/systems/spawnBudget.js:26 DEFAULT_MAX).
 */
export function peakConcurrentDemand(packages) {
  if (!Array.isArray(packages)) return 0;
  let total = 0;
  for (const pkg of packages) {
    if (!pkg || typeof pkg !== 'object') continue;
    if (!Number.isInteger(pkg.count) || pkg.count < 0) continue;
    total += pkg.count;
  }
  return total;
}

// Recipe completion uses Appendix A.2 `blockingRolesResolved`.
// The planner's output `completionRules` uses `blockingRoles` — the fight-instance
// list of roles that actually spawned. The names stay different on purpose:
// the recipe is an authoring record; the plan is a fight instance.

export function validateWaveRecipe(recipe) {
  try {
    return validateWaveRecipeInner(recipe);
  } catch {
    return { ok: false, issues: [issue('', 'invalid recipe')] };
  }
}

function validateWaveRecipeInner(recipe) {
  const issues = [];
  if (!isPlainObject(recipe)) {
    return { ok: false, issues: [issue('', 'recipe must be an object')] };
  }

  if (typeof recipe.id !== 'string' || recipe.id.length === 0) {
    issues.push(issue('id', 'id must be a non-empty string'));
  }

  if (recipe.schemaVersion !== SURVIVAL_WAVE_SCHEMA_VERSION) {
    issues.push(issue('schemaVersion', `schemaVersion must be ${SURVIVAL_WAVE_SCHEMA_VERSION}`));
  }

  if (typeof recipe.arenaId !== 'string' || !ARENA_IDS.has(recipe.arenaId)) {
    issues.push(issue('arenaId', 'unknown arenaId'));
  }

  if (!Number.isInteger(recipe.wave) || recipe.wave < 1) {
    issues.push(issue('wave', 'wave must be an integer >= 1'));
  }

  if (!isPlainObject(recipe.objective) || typeof recipe.objective.kind !== 'string' || recipe.objective.kind.length === 0) {
    issues.push(issue('objective', 'missing objective'));
  }

  if (!Number.isFinite(recipe.threatBudget) || recipe.threatBudget < 0) {
    issues.push(issue('threatBudget', 'threatBudget must be a non-negative finite number'));
  }

  if (typeof recipe.arenaPhase !== 'string' || recipe.arenaPhase.length === 0) {
    issues.push(issue('arenaPhase', 'arenaPhase must be a non-empty string'));
  }

  const packages = recipe.packages;
  const providedRoles = new Set();
  if (!Array.isArray(packages)) {
    issues.push(issue('packages', 'packages must be an array'));
  } else {
    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const path = `packages[${i}]`;
      if (!isPlainObject(pkg)) {
        issues.push(issue(path, 'package must be an object'));
        continue;
      }
      if (!Number.isInteger(pkg.atTick) || pkg.atTick < 0) {
        issues.push(issue(`${path}.atTick`, 'atTick must be a non-negative integer'));
      }
      if (typeof pkg.gateGroup !== 'string' || !GATE_SET.has(pkg.gateGroup)) {
        issues.push(issue(`${path}.gateGroup`, 'unknown gateGroup'));
      }
      if (typeof pkg.role !== 'string' || !ROLE_SET.has(pkg.role)) {
        issues.push(issue(`${path}.role`, 'unknown role'));
      } else {
        providedRoles.add(pkg.role);
      }
      if (typeof pkg.enemyId !== 'string' || !ENEMY_IDS.has(pkg.enemyId)) {
        issues.push(issue(`${path}.enemyId`, 'unknown enemyId'));
      }
      if (!Number.isInteger(pkg.count) || pkg.count < 1) {
        issues.push(issue(`${path}.count`, 'count must be an integer >= 1'));
      }
      if (pkg.batchSize != null) {
        if (!Number.isInteger(pkg.batchSize) || pkg.batchSize < 1) {
          issues.push(issue(`${path}.batchSize`, 'batchSize must be an integer >= 1'));
        } else if (Number.isInteger(pkg.count) && pkg.batchSize > pkg.count) {
          issues.push(issue(`${path}.batchSize`, 'batchSize must not exceed count'));
        }
      }
      if (pkg.batchGapTicks != null && (!Number.isInteger(pkg.batchGapTicks) || pkg.batchGapTicks < 0)) {
        issues.push(issue(`${path}.batchGapTicks`, 'batchGapTicks must be a non-negative integer'));
      }
    }

    const peak = peakConcurrentDemand(packages);
    // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
    if (peak > 24) {
      issues.push(issue('packages', `peak concurrent demand ${peak} exceeds 24`));
    }
  }

  if (!isPlainObject(recipe.completion)) {
    issues.push(issue('completion', 'completion must be an object'));
  } else {
    const completion = recipe.completion;
    if (typeof completion.requiredPackagesMaterialized !== 'boolean') {
      issues.push(issue('completion.requiredPackagesMaterialized', 'requiredPackagesMaterialized must be a boolean'));
    }
    if (!Number.isInteger(completion.cleanupTicks) || completion.cleanupTicks < 0) {
      issues.push(issue('completion.cleanupTicks', 'cleanupTicks must be a non-negative integer'));
    }
    if (!Array.isArray(completion.blockingRolesResolved)) {
      issues.push(issue('completion.blockingRolesResolved', 'blockingRolesResolved must be an array'));
    } else {
      for (let i = 0; i < completion.blockingRolesResolved.length; i++) {
        const role = completion.blockingRolesResolved[i];
        const path = `completion.blockingRolesResolved[${i}]`;
        if (typeof role !== 'string' || !ROLE_SET.has(role)) {
          issues.push(issue(path, 'unknown role'));
        } else if (Array.isArray(packages) && !providedRoles.has(role)) {
          issues.push(issue(path, 'blockingRoles entry that no package provides'));
        }
      }
    }
  }

  if (!isPlainObject(recipe.rewards)) {
    issues.push(issue('rewards', 'rewards must be an object'));
  } else {
    if (!Number.isInteger(recipe.rewards.xp) || recipe.rewards.xp < 0) {
      issues.push(issue('rewards.xp', 'xp must be a non-negative integer'));
    }
    if (!Number.isInteger(recipe.rewards.credits) || recipe.rewards.credits < 0) {
      issues.push(issue('rewards.credits', 'credits must be a non-negative integer'));
    }
  }

  return { ok: issues.length === 0, issues };
}

function pkg(atTick, gateGroup, role, enemyId, count, batchSize, batchGapTicks) {
  const size = batchSize == null ? count : batchSize;
  const gap = batchGapTicks == null ? 0 : batchGapTicks;
  return {
    atTick,
    gateGroup,
    role,
    enemyId,
    count,
    batchSize: size,
    batchGapTicks: gap,
  };
}

/**
 * A third bearing for the waves whose question is "you are surrounded".
 * tenWaveBlock only receives two authored gates, so a wave that wants a genuine third side
 * derives one deterministically: walk the gate list from the one after gateB and take the first
 * id that is neither authored gate. Every live arena pair yields a distinct third bearing
 * (nw/se -> front, ne/sw -> se, diagonal_a/rear -> diagonal_b) rather than collapsing onto one.
 */
function thirdGate(gateA, gateB) {
  const n = SURVIVAL_GATE_GROUPS.length;
  const start = Math.max(0, SURVIVAL_GATE_GROUPS.indexOf(gateB)) + 1;
  for (let k = 0; k < n; k++) {
    const gate = SURVIVAL_GATE_GROUPS[(start + k) % n];
    if (gate !== gateA && gate !== gateB) return gate;
  }
  return gateA;
}

function waveRecipe({
  arenaId,
  wave,
  shape,
  objectiveKind,
  threatBudget,
  packages,
  arenaPhase,
  blockingRoles,
  cleanupTicks,
  xp,
  credits,
}) {
  return {
    id: `${arenaId}_w${String(wave).padStart(2, '0')}_${shape}`,
    schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
    arenaId,
    wave,
    objective: { kind: objectiveKind },
    threatBudget,
    packages,
    arenaPhase,
    completion: {
      requiredPackagesMaterialized: true,
      blockingRolesResolved: blockingRoles,
      cleanupTicks,
    },
    rewards: { xp, credits },
  };
}

// Ten-wave block from §21.5 (lines 3014–3027), using only live ENEMY_TYPES ids.
//
// AUTHORING RULES THIS BLOCK OBEYS (each one is a real constraint, not a preference):
//
//  * Difficulty rises through COMPOSITION, never HP (§33 fails a leaf for HP inflation as
//    difficulty). Nothing here can scale stats anyway — levelForWave() is the only scaler and it
//    runs 1..4 across the whole block. The levers are which archetypes, how many, from where,
//    in what batches, and when.
//  * Every wave's LAST batch must land by tick 200. The wave 1–7 walk in
//    test/crucible-wave-materialization.js ticks 200 and then requires the wave to be clearable;
//    a batch scheduled later leaves a package owed and the run never advances.
//  * cleanupTicks stays <= 180 outside the boss for the same walk (it ticks 181 to leave cleanup).
//  * Peak concurrent demand stays well under 24 (spawnBudget DEFAULT_MAX). Nothing here exceeds 14.
//  * Only six distinct SILHOUETTES exist across fifteen archetypes (wasp/choir share drone_swarm,
//    lancer/ghost share sniper_lance, bruiser/pd-screen/anchor share bruiser_armor,
//    reaver/mine-layer share pirate_swoop, corsair/tether share corsair_blade). Two archetypes
//    that share a silhouette are never on camera at the same time unless the wave's question IS
//    the misread — see wave 8.
//  * patrol_lawman, customs_cutter and mule_trader are deliberately absent. The first two are
//    factionLawful, so scanner.isHostileToPlayer sends them down the WANTED gate a Crucible run
//    never sets: they spawn INERT, and as a blocking role they would stall the run forever.
//    mule_trader is a fleeing_trader (alwaysFlee, defensiveOnly) marked illegalToKill.
//
// Waves 1, 5 and 10 are held byte-identical on every field the PLAN can see. Their content is
// asserted in three files this lane does not own: the seed-47 snapshot in
// test/crucible-wave-planner.js (waves 1/5/10), the wave-1 body count and roles in
// test/crucible-wave-materialization.js, and the wave-1 / wave-10 chip arithmetic in
// test/crucible-credit-pickup.js. Their questions were already distinct, so nothing was lost.
function tenWaveBlock(arenaId, gateA, gateB) {
  const gateC = thirdGate(gateA, gateB);
  return [
    // Q: Can you turn, track and kill six identical things that all want the same thing?
    // One gate, one archetype, one arrival, a quiet room. Nothing to prioritise — the only
    // question is whether you can fly and shoot at all.
    waveRecipe({
      arenaId, wave: 1, shape: 'intro_mass',
      objectiveKind: 'resolve_hostiles', threatBudget: 8,
      packages: [pkg(0, gateA, 'mass', 'wasp_swarmer', 6)],
      arenaPhase: 'idle', blockingRoles: ['mass'], cleanupTicks: 180,
      xp: 52, credits: 12,
    }),
    // Q: The second group arrives from the far side while you are still committed to the first —
    // do you finish the kill or break off? Same quiet room as wave 1 on purpose: the only new
    // thing is that the fight now has a behind.
    waveRecipe({
      arenaId, wave: 2, shape: 'split_arrival',
      objectiveKind: 'resolve_hostiles', threatBudget: 10,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 5),
        pkg(75, gateB, 'pressure', 'reaver_pirate', 3),
      ],
      arenaPhase: 'idle', blockingRoles: ['mass', 'pressure'], cleanupTicks: 180,
      xp: 64, credits: 16,
    }),
    // Q: Can you keep your own Massline when something on the far end is pulling back?
    // The tether raider arrives ALONE and telegraphs its attach, so the specialist is legible
    // before the chaff shows up to punish you for staring at it.
    waveRecipe({
      arenaId, wave: 3, shape: 'tether_specialist',
      objectiveKind: 'resolve_hostiles', threatBudget: 12,
      packages: [
        pkg(0, gateB, 'control', 'tether_control_raider', 1),
        pkg(90, gateA, 'mass', 'wasp_swarmer', 8, 4, 45),
      ],
      arenaPhase: 'shutter_slow', blockingRoles: ['control', 'mass'], cleanupTicks: 180,
      xp: 76, credits: 20,
    }),
    // Q: One hull that will not be shaken, a salted wake, and chaff from a third side — can you
    // still choose where to be? The brawler commits for ~90-120 ticks before it breaks away, so
    // "just outrun it" is off the table for exactly as long as the mines are being laid.
    waveRecipe({
      arenaId, wave: 4, shape: 'three_gate_anvil',
      objectiveKind: 'resolve_hostiles', threatBudget: 14,
      packages: [
        pkg(0, gateA, 'pressure', 'bruiser_brawler', 1),
        pkg(60, gateC, 'disruptor', 'mine_layer_jackal', 1),
        pkg(105, gateB, 'mass', 'wasp_swarmer', 8, 4, 45),
      ],
      arenaPhase: 'loose_plate', blockingRoles: ['pressure', 'disruptor', 'mass'], cleanupTicks: 180,
      xp: 88, credits: 24,
    }),
    // Q: Can you pick the one hull that matters out of the noise and kill it before the noise
    // kills you? The chaff is already on you when the elite arrives, so this is target priority
    // under load rather than a duel.
    waveRecipe({
      arenaId, wave: 5, shape: 'elite_hunt',
      objectiveKind: 'elite_hunt', threatBudget: 16,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 6),
        pkg(60, gateB, 'elite', 'corsair_raider', 1),
      ],
      arenaPhase: 'furnace_active', blockingRoles: ['mass', 'elite'], cleanupTicks: 180,
      xp: 100, credits: 28,
    }),
    // Q: Can you fight while the room itself drags you sideways toward the thing you have to kill?
    // The anchor controller is the only enemy carrying a fieldAnchor: in live play it registers a
    // ~235wu snare well on spawn, and the well only ends when the hull does (or is displaced).
    // Everything else in the wave is timed to arrive while you are still inside that radius.
    waveRecipe({
      arenaId, wave: 6, shape: 'anchor_field',
      objectiveKind: 'resolve_hostiles', threatBudget: 18,
      packages: [
        pkg(0, gateA, 'anchor', 'field_anchor_controller', 1),
        pkg(60, gateB, 'pressure', 'reaver_pirate', 2),
        pkg(105, gateA, 'mass', 'wasp_swarmer', 6, 3, 45),
      ],
      arenaPhase: 'absorbent_screen', blockingRoles: ['anchor', 'pressure', 'mass'], cleanupTicks: 180,
      xp: 112, credits: 32,
    }),
    // Q: Can you close on a shooter that leaves after every shot and comes back on a new bearing,
    // while the lanes keep flipping under you? The ghosts sit at ~780wu and disengage on contact;
    // the zealot pack trickles in four at a time so you can never fully commit to the chase.
    waveRecipe({
      arenaId, wave: 7, shape: 'ghost_choir',
      objectiveKind: 'resolve_hostiles', threatBudget: 20,
      packages: [
        pkg(0, gateA, 'reach', 'quiet_ghost', 2),
        pkg(45, gateB, 'mass', 'choir_zealot', 8, 4, 45),
      ],
      arenaPhase: 'shutter_alternating', blockingRoles: ['reach', 'mass'], cleanupTicks: 180,
      xp: 124, credits: 36,
    }),
    // Q: The second seven wear the same silhouette as the first seven and are NOT the same
    // problem — do you re-read the room, or trust the read you already paid for? This is the one
    // wave where the shared drone_swarm silhouette is the point: a zealot carries ~40% more
    // effective HP than a wasp and a missile rack the wasp does not have (the speed difference,
    // 125 vs 118, is not something a player can see). They arrive from another door while the
    // room is closing, so the first read has already been paid for by the time it goes wrong.
    waveRecipe({
      arenaId, wave: 8, shape: 'twin_flood',
      objectiveKind: 'resolve_hostiles', threatBudget: 22,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 7),
        pkg(90, gateB, 'pressure', 'choir_zealot', 7),
      ],
      arenaPhase: 'shutter_lane_close', blockingRoles: ['mass', 'pressure'], cleanupTicks: 180,
      xp: 136, credits: 40,
    }),
    // Q: Four things that each punish a different habit land on top of each other — does your
    // build have a second answer? The screen eats missiles, the lances punish holding still, the
    // raiders punish tunnel vision, the swarm punishes a slow clear. None of them hard-counters a
    // build; each of them taxes one. Keeps a `reach` and a `support` package on purpose: the
    // planner's wave-9 build-pressure branch rewrites exactly those two slots.
    waveRecipe({
      arenaId, wave: 9, shape: 'exam',
      objectiveKind: 'resolve_hostiles', threatBudget: 24,
      packages: [
        pkg(0, gateA, 'support', 'pd_screen_escort', 2),
        pkg(30, gateB, 'reach', 'lancer_sniper', 2),
        pkg(90, gateC, 'elite', 'corsair_raider', 2),
        pkg(120, gateA, 'mass', 'wasp_swarmer', 8, 4, 30),
      ],
      arenaPhase: 'furnace_active',
      blockingRoles: ['support', 'reach', 'elite', 'mass'], cleanupTicks: 180,
      xp: 148, credits: 44,
    }),
    // Q: Can you hold a firing line on a slow fortress while its screen keeps arriving behind you?
    // The dreadnought is a system, not a health bar — it telegraphs a broadside you cross the bow
    // to beat, and the escort refreshes in threes so you never get a clean uninterrupted pass.
    waveRecipe({
      arenaId, wave: 10, shape: 'boss',
      objectiveKind: 'boss', threatBudget: 28,
      packages: [
        pkg(0, gateA, 'elite', 'dreadnought_boss', 1),
        pkg(90, gateB, 'mass', 'wasp_swarmer', 6, 3, 90),
      ],
      arenaPhase: 'boss', blockingRoles: ['elite', 'mass'], cleanupTicks: 240,
      xp: 160, credits: 48,
    }),
  ];
}

export const SURVIVAL_WAVES = freezeDeep([
  ...tenWaveBlock('helios_core', 'nw', 'se'),
  ...tenWaveBlock('ceres_belt', 'ne', 'sw'),
  ...tenWaveBlock('tethys_hub', 'diagonal_a', 'rear'),
]);
