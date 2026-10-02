// Thirty-wave Foundry arc (PQ-133.07a).
// Pure data + composition. No bus, state, or spawnBudget import.
// Waves 1–10 stay the authored template. Waves 11–30 reuse that template with
// role, bearing, and arena-phase swaps — and, since FB-026 flattened the hull-level
// curve, rising body counts and rotated gates inside the shared spawn budget.

import {
  SURVIVAL_ENDLESS_OVERLAYS,
  SURVIVAL_ENDLESS_START_WAVE,
  SURVIVAL_GATE_GROUPS,
  peakConcurrentDemand,
  templateQuestionOf,
} from './survivalWaves.js';

export const SURVIVAL_ARC_LENGTH = 30;
export const SURVIVAL_TEMPLATE_BLOCK = 10;
// Copies of spawnBudget.js DEFAULT_MAX / HARD_MAX. Do not import those privates.
export const SPAWN_BUDGET_DEFAULT_MAX = 24;
export const SPAWN_BUDGET_HARD_MAX = 40;

export const WAVE_20_SYSTEM_EVENT = Object.freeze({
  id: 'foundry_plate_theft',
  wave: 20,
});

/**
 * PQ-133.07 (CRU-043) — the wave-thirty FINALE, the second authored system event of the arc.
 *
 * Wave 30 does not replay the wave-ten Foreman: the composed elite is the Forge Regent
 * (`forge_regent`, the Mirrorjaw core under a wider crown, see src/data/enemies.js), and the room's
 * own system is named exactly once so the run machine and the results read the finale as an event
 * rather than one more boss wave. Only the arenas whose authored wave-ten elite is the Mirrorjaw
 * core are crowned; the others keep their own dreadnought boss.
 */
export const WAVE_30_SYSTEM_EVENT = Object.freeze({
  id: 'forge_regent_crown',
  wave: 30,
});

/** The composed finale hull for the thirty-wave Foundry arc. */
export const WAVE_30_FINALE_ENEMY_ID = 'forge_regent';

/** Wave-ten elite ids the finale regent grows from — the Mirrorjaw core, never the dreadnought. */
const WAVE_30_CORE_ENEMY_IDS = Object.freeze(['mirrorjaw_foreman']);

export function templateWaveOf(wave) {
  return ((wave - 1) % SURVIVAL_TEMPLATE_BLOCK) + 1;
}

/** Planner act index: 0 / 1 / 2. */
export function actIndexForWave(wave) {
  if (!Number.isInteger(wave) || wave < 1) return 0;
  if (wave <= 10) return 0;
  if (wave <= 20) return 1;
  return 2;
}

/** Planner difficulty: 1 / 2 / 3. Tightens batch gaps only; never raises count. */
export function difficultyForWave(wave) {
  return actIndexForWave(wave) + 1;
}

function clonePackage(pkg) {
  return {
    atTick: pkg.atTick,
    gateGroup: pkg.gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count: pkg.count,
    batchSize: pkg.batchSize,
    batchGapTicks: pkg.batchGapTicks,
  };
}

function rebuildBlockingRoles(previous, packages) {
  const spawned = new Set(packages.map((pkg) => pkg.role));
  const roles = [];
  for (const role of previous || []) {
    if (spawned.has(role) && !roles.includes(role)) roles.push(role);
  }
  for (const role of spawned) {
    if (!roles.includes(role)) roles.push(role);
  }
  return roles;
}

function diversifyGates(packages) {
  const unique = [];
  for (const pkg of packages) {
    if (!unique.includes(pkg.gateGroup)) unique.push(pkg.gateGroup);
  }
  if (unique.length !== 1 || packages.length === 0) return packages;
  const n = SURVIVAL_GATE_GROUPS.length;
  if (n < 3) return packages;
  const authored = unique[0];
  const authoredIndex = Math.max(0, SURVIVAL_GATE_GROUPS.indexOf(authored));
  const third = SURVIVAL_GATE_GROUPS[(authoredIndex + 2) % n] || authored;
  const next = packages.map(clonePackage);
  next[next.length - 1].gateGroup = third;
  return next;
}

function swapActRoles(packages, wave, act) {
  const template = templateWaveOf(wave);
  const next = packages.map(clonePackage);
  for (const pkg of next) {
    if (pkg.role !== 'mass') continue;
    if (act === 1) {
      if (pkg.enemyId === 'wasp_swarmer') pkg.enemyId = 'choir_zealot';
      continue;
    }
    if (pkg.enemyId !== 'wasp_swarmer' && pkg.enemyId !== 'choir_zealot') continue;
    if (template === 3 || template === 7) {
      pkg.role = 'reach';
      pkg.enemyId = 'lancer_sniper';
    } else if (template === 4 || template === 6) {
      pkg.role = 'disruptor';
      pkg.enemyId = 'mine_layer_jackal';
    } else if (template === 8) {
      pkg.role = 'anchor';
      pkg.enemyId = 'field_anchor_controller';
    } else {
      pkg.role = 'pressure';
      pkg.enemyId = 'reaver_pirate';
    }
  }
  return next;
}

function composeArenaPhase(phase, act) {
  if (phase === 'boss' || act <= 0) return phase;
  if (act === 1) {
    if (phase === 'idle') return 'shutter_slow';
    if (phase === 'shutter_slow') return 'shutter_alternating';
    return phase;
  }
  if (phase === 'idle' || phase === 'shutter_slow') return 'shutter_lane_close';
  if (phase === 'shutter_alternating' || phase === 'furnace_active') return 'absorbent_screen';
  return phase;
}

function applyWave20Overlay(packages) {
  const next = [];
  for (const pkg of packages) {
    if (pkg.role !== 'mass' || !Number.isInteger(pkg.count) || pkg.count < 2) {
      next.push(clonePackage(pkg));
      continue;
    }
    const escorts = Math.min(2, pkg.count);
    const rest = pkg.count - escorts;
    next.push({
      atTick: pkg.atTick,
      gateGroup: pkg.gateGroup,
      role: 'support',
      enemyId: 'pd_screen_escort',
      count: escorts,
      batchSize: Math.min(Number.isInteger(pkg.batchSize) ? pkg.batchSize : escorts, escorts),
      batchGapTicks: pkg.batchGapTicks,
    });
    if (rest > 0) {
      next.push({
        atTick: pkg.atTick,
        gateGroup: pkg.gateGroup,
        role: 'mass',
        enemyId: pkg.enemyId === 'wasp_swarmer' ? 'choir_zealot' : pkg.enemyId,
        count: rest,
        batchSize: Math.min(Number.isInteger(pkg.batchSize) ? pkg.batchSize : rest, rest),
        batchGapTicks: pkg.batchGapTicks,
      });
    }
  }
  return next;
}

/**
 * Wave-thirty crown. The authored elite package is rewritten in place to the Forge Regent — same
 * slot, same bearing, same schedule — so body count and arrival timing are untouched and only the
 * hull the player must solve changes. Arenas with no Mirrorjaw core keep their own boss.
 */
function crownFinaleBoss(packages) {
  const next = packages.map(clonePackage);
  for (const pkg of next) {
    if (pkg.role === 'elite' && WAVE_30_CORE_ENEMY_IDS.includes(pkg.enemyId)) {
      pkg.enemyId = WAVE_30_FINALE_ENEMY_ID;
    }
  }
  return next;
}

/**
 * FB-026 — the arc's difficulty is composition, not hit points. levelForWave is flat, so
 * the rising acts have to carry their own pressure: the same wave's question re-asked by
 * MORE bodies arriving on NEW bearings (batch gaps already tighten upstream through
 * applyDifficulty). Elite packages never grow — a hunt or a boss fields the hull it was
 * authored with; the pressure lands in the company it keeps. The sum is clamped to the
 * 24-body peak budget the planner enforces, trimming the largest grown package first.
 */
function applyActPressure(packages, act) {
  if (act <= 0) return packages;
  const share = act === 1 ? 4 : 2; // act II: +count/4; act III: +count/2 — min one body
  const next = packages.map(clonePackage);
  for (const pkg of next) {
    if (pkg.role === 'elite') continue;
    if (!Number.isInteger(pkg.count) || pkg.count < 1) continue;
    pkg.count += Math.max(1, Math.floor(pkg.count / share));
  }
  // Never exceed the cap the planner enforces. Walk the grown packages largest-first and
  // hand bodies back until the wave fits — deterministic, and only ever trims the
  // act-growth, never the authored count.
  for (let guard = 0; guard < 64 && peakConcurrentDemand(next) > SPAWN_BUDGET_DEFAULT_MAX; guard++) {
    let largest = null;
    for (const pkg of next) {
      if (pkg.role === 'elite') continue;
      if (!largest || pkg.count > largest.count) largest = pkg;
    }
    if (!largest || largest.count <= 1) break;
    largest.count -= 1;
  }
  // The same wave re-asked through different doors: shift every gate by `act` slots so an
  // act's ingress never reads as a replay of the template's.
  const gates = SURVIVAL_GATE_GROUPS;
  for (const pkg of next) {
    const index = gates.indexOf(pkg.gateGroup);
    if (index < 0) continue;
    pkg.gateGroup = gates[(index + act) % gates.length];
  }
  return next;
}

/**
 * Act composition for one planned wave. Identity for Act I except the wave-20 overlay.
 * Later acts re-ask the same wave with more bodies and rotated bearings.
 */
export function composeArcWave({ packages, blockingRoles, arenaPhase, objective, wave }) {
  const act = actIndexForWave(wave);
  let nextPackages = packages;
  let nextRoles = blockingRoles;
  let nextPhase = arenaPhase;
  let nextObjective = objective;
  let systemEvent = null;

  if (act > 0) {
    nextPackages = swapActRoles(nextPackages, wave, act);
    nextPackages = diversifyGates(nextPackages);
    nextRoles = rebuildBlockingRoles(nextRoles, nextPackages);
    nextPhase = composeArenaPhase(arenaPhase, act);
  }

  if (wave === 20) {
    nextPackages = applyWave20Overlay(nextPackages);
    nextRoles = rebuildBlockingRoles(nextRoles, nextPackages);
    nextObjective = { kind: 'system_event' };
    systemEvent = { id: WAVE_20_SYSTEM_EVENT.id, wave: 20 };
  }

  // PQ-133.07 — wave thirty is the arc's finale. The objective stays the boss kind (the finale is
  // still won by clearing the elite), but the elite itself is crowned and the system is named, so
  // the run machine can surface the second (and last) authored system event of the arc.
  if (wave === 30) {
    nextPackages = crownFinaleBoss(nextPackages);
    nextRoles = rebuildBlockingRoles(nextRoles, nextPackages);
    systemEvent = { id: WAVE_30_SYSTEM_EVENT.id, wave: 30 };
  }

  if (act > 0) {
    nextPackages = applyActPressure(nextPackages, act);
    nextRoles = rebuildBlockingRoles(nextRoles, nextPackages);
  }

  return {
    packages: nextPackages,
    blockingRoles: nextRoles,
    arenaPhase: nextPhase,
    objective: nextObjective,
    systemEvent,
    question: templateQuestionOf(wave),
  };
}

/** Endless cycle 0 begins at wave 31. Pure function of wave number; no accumulated state. */
export function endlessCycleOf(wave) {
  if (!Number.isInteger(wave) || wave < SURVIVAL_ENDLESS_START_WAVE) return 0;
  return Math.floor((wave - SURVIVAL_ENDLESS_START_WAVE) / SURVIVAL_TEMPLATE_BLOCK);
}

function applyEndlessOverlay(packages, overlay, cycle) {
  const next = packages.map(clonePackage);
  for (const pkg of next) {
    if (pkg.enemyId === 'dreadnought_boss') continue;
    if (pkg.role === 'mass' && overlay.massEnemyId) {
      pkg.enemyId = overlay.massEnemyId;
      if (overlay.massRole) pkg.role = overlay.massRole;
    } else if (pkg.role === 'pressure' && overlay.pressureEnemyId) {
      pkg.enemyId = overlay.pressureEnemyId;
      if (overlay.pressureRole) pkg.role = overlay.pressureRole;
    } else if (pkg.role === 'control' && overlay.controlEnemyId) {
      pkg.enemyId = overlay.controlEnemyId;
      if (overlay.controlRole) pkg.role = overlay.controlRole;
    }
  }
  const n = SURVIVAL_GATE_GROUPS.length;
  if (n > 0 && next.length > 0) {
    const last = next[next.length - 1];
    if (last.enemyId !== 'dreadnought_boss') {
      const current = SURVIVAL_GATE_GROUPS.indexOf(last.gateGroup);
      const from = current < 0 ? 0 : current;
      last.gateGroup = SURVIVAL_GATE_GROUPS[(from + cycle + 1) % n];
    }
  }
  return next;
}

/**
 * Endless composition for one planned wave. Starts from the arc composer so
 * Act III specialist swaps still apply, then overlays a cycle-indexed mix.
 * Never changes the sum of package counts.
 */
export function composeEndlessWave({ packages, blockingRoles, arenaPhase, objective, wave }) {
  const arc = composeArcWave({ packages, blockingRoles, arenaPhase, objective, wave });
  const cycle = endlessCycleOf(wave);
  const slot = cycle % SURVIVAL_ENDLESS_OVERLAYS.length;
  const overlay = SURVIVAL_ENDLESS_OVERLAYS[slot];
  const nextPackages = applyEndlessOverlay(arc.packages, overlay, cycle);
  const nextRoles = rebuildBlockingRoles(arc.blockingRoles, nextPackages);
  const nextPhase = overlay && overlay.arenaPhase ? overlay.arenaPhase : arc.arenaPhase;
  return {
    packages: nextPackages,
    blockingRoles: nextRoles,
    arenaPhase: nextPhase,
    objective: arc.objective,
    systemEvent: arc.systemEvent,
    endlessOverlay: overlay ? overlay.id : null,
    endlessCycle: cycle,
    question: templateQuestionOf(wave),
  };
}

export function bodyCount(packages) {
  if (!Array.isArray(packages)) return 0;
  let total = 0;
  for (const pkg of packages) {
    if (pkg && Number.isInteger(pkg.count) && pkg.count > 0) total += pkg.count;
  }
  return total;
}
