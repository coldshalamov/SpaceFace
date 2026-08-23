// Thirty-wave Foundry arc (PQ-133.07a).
// Pure data + composition. No bus, state, or spawnBudget import.
// Waves 1–10 stay the authored template. Waves 11–30 reuse that template with
// role, bearing, and arena-phase swaps. Body counts never rise.

import {
  SURVIVAL_ENDLESS_OVERLAYS,
  SURVIVAL_ENDLESS_START_WAVE,
  SURVIVAL_GATE_GROUPS,
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
 * Act composition for one planned wave. Identity for Act I except the wave-20 overlay.
 * Never changes the sum of package counts.
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

  return {
    packages: nextPackages,
    blockingRoles: nextRoles,
    arenaPhase: nextPhase,
    objective: nextObjective,
    systemEvent,
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
