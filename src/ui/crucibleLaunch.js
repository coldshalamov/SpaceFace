// Crucible launch route (PQ-133 / CRU-018).
//
// A Crucible run starts on the ORDINARY New Game path: buildSandboxLaunchConfig produces a normal
// launch config carrying a validated survivalSetup, requestSandboxGame stages it and emits game:new,
// and main.js's real startNewGame does the reset, ship construction and scene bootstrap. There is no
// second bootstrap, no alternate registry, and no Crucible-only physics.
//
// It also remembers the setup the current run launched with, so "run it again, same seed" replays
// the run as it BEGAN — before any drafted weapon changed the loadout.

import { validateCombatLabSetup } from '../contracts/combatLabSetupSchema.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../data/combatLabSetups.js';
import { applyWeaponsColdLoadout } from '../systems/survivalMutators.js';
import { buildSandboxLaunchConfig, requestSandboxGame } from './sandbox/sandboxSetup.js';
import { SWARM_RULESET } from '../data/swarmMode.js';
import { normalizeBestLine } from '../systems/survivalRecords.js';

/** v1 ships one authored arena. The other two Combat Lab arenas are wave-authored but unpolished. */
export const CRUCIBLE_ARENA_ID = 'helios_core';

/**
 * WHAT THE CRUCIBLE BUTTON PLAYS.
 *
 * Swarm is the default: clear a finite pack, spend or save, then launch the next
 * round. It has no last round. The authored thirty-wave Gauntlet remains under `scored`.
 */
export const CRUCIBLE_DEFAULT_RULESET = SWARM_RULESET;
// The fresh Crucible route teaches shove physics immediately; benchmark package IDs stay stable.
export const CRUCIBLE_DEFAULT_STARTER_ID = 'ricochet_runner';
export function crucibleStarterIdForSetup(setup) {
  const loadout = Array.isArray(setup?.loadout) ? setup.loadout : [];
  const match = COMBAT_LAB_STARTER_PACKAGES.find(entry => entry.hullId === setup?.hullId
    && entry.loadout.length === loadout.length
    && entry.loadout.every(slot => loadout.some(actual => actual?.slotIndex === slot.slotIndex && actual?.defId === slot.defId)));
  return match?.id || CRUCIBLE_DEFAULT_STARTER_ID;
}
export const CRUCIBLE_RULESETS = Object.freeze([SWARM_RULESET, 'scored']);

export function normalizeCrucibleRuleset(ruleset) {
  return CRUCIBLE_RULESETS.includes(ruleset) ? ruleset : CRUCIBLE_DEFAULT_RULESET;
}
export const CRUCIBLE_SEED_MIN = 1;
export const CRUCIBLE_SEED_MAX = 0xffffffff;

let lastSetup = null;

/** Build (and validate) a Crucible setup from a starter package id and a seed. */
export function crucibleSetupFor({
  starterId, seed, arenaId = CRUCIBLE_ARENA_ID, ruleset = CRUCIBLE_DEFAULT_RULESET,
} = {}) {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterId)
    || COMBAT_LAB_STARTER_PACKAGES.find(entry => entry.id === CRUCIBLE_DEFAULT_STARTER_ID);
  if (!starter) return { ok: false, issues: [{ path: 'starterId', message: 'Default Crucible starter is missing' }] };
  const result = validateCombatLabSetup({
    schema: 'spaceface.combatLabSetup.v1',
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    // Survival ignores enemyPackageId — the wave owner decides what spawns — but the shared
    // schema requires a legal value.
    enemyPackageId: 'wasp_flight',
    arenaId,
    seed: normalizeSeed(seed),
    wave: 1,
  });
  // The ruleset is not part of the closed setup schema, so it travels alongside the validated
  // value where the launch config can pick it up.
  if (result && result.ok && result.value) {
    result.ruleset = normalizeCrucibleRuleset(ruleset);
  }
  return result;
}

export function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return CRUCIBLE_SEED_MIN;
  const i = Math.trunc(n);
  if (i < CRUCIBLE_SEED_MIN) return CRUCIBLE_SEED_MIN;
  if (i > CRUCIBLE_SEED_MAX) return CRUCIBLE_SEED_MAX;
  return i;
}

/** The ordinary launch config, with the Crucible setup and its ruleset riding along. */
export function crucibleLaunchConfig(setup, ruleset = CRUCIBLE_DEFAULT_RULESET) {
  return buildSandboxLaunchConfig({}, {
    survivalSetup: setup,
    survivalRuleset: normalizeCrucibleRuleset(ruleset),
  });
}

/**
 * Launch a run. Remembers the setup so the results screen can replay this exact seed, then goes
 * through the real New Game request.
 */
export function requestCrucibleRun(bus, setup, ruleset = CRUCIBLE_DEFAULT_RULESET) {
  if (!setup) return false;
  const resolved = normalizeCrucibleRuleset(ruleset);
  const dailyDateKey = typeof setup.dailyDateKey === 'string' && setup.dailyDateKey
    ? setup.dailyDateKey
    : null;
  const weeklyMutatorId = typeof setup.weeklyMutatorId === 'string' && setup.weeklyMutatorId
    ? setup.weeklyMutatorId
    : null;
  const ghostHash = Number.isInteger(setup.ghostHash)
    ? (setup.ghostHash >>> 0)
    : (typeof setup.ghostHash === 'string' && /^\d+$/.test(setup.ghostHash)
      ? Number(setup.ghostHash) >>> 0
      : null);
  const launchSetup = { ...setup };
  delete launchSetup.dailyDateKey;
  delete launchSetup.weeklyMutatorId;
  delete launchSetup.ghostHash;
  if (weeklyMutatorId === 'weapons_cold') {
    launchSetup.loadout = applyWeaponsColdLoadout(launchSetup.loadout);
  }
  lastSetup = {
    ...launchSetup,
    ruleset: resolved,
    loadout: (launchSetup.loadout || []).map((entry) => ({ ...entry })),
  };
  if (dailyDateKey) lastSetup.dailyDateKey = dailyDateKey;
  if (weeklyMutatorId) lastSetup.weeklyMutatorId = weeklyMutatorId;
  if (ghostHash != null) lastSetup.ghostHash = ghostHash;
  requestSandboxGame(bus, crucibleLaunchConfig(launchSetup, resolved));
  return true;
}

/**
 * PQ-146 Best Line practice: map a stored causal line back to the run it was earned on. Same
 * seed, the recorded ruleset's underlying mode ('practice' lines relaunch under their parent
 * ruleset — the practice flag rides separately), and the recorded arena when it still exists.
 * Returns null for a line that cannot name its seed — never a guessed launch.
 */
export function practiceLaunchFor(line) {
  const normalized = normalizeBestLine(line);
  if (!normalized || !Number.isInteger(normalized.seed)) return null;
  const rules = normalized.recordRules && typeof normalized.recordRules === 'object'
    ? normalized.recordRules : {};
  const ruleset = rules.mode === 'scored' ? 'scored' : SWARM_RULESET;
  return {
    seed: normalized.seed,
    ruleset,
    arenaId: typeof rules.arenaId === 'string' && rules.arenaId ? rules.arenaId : null,
  };
}

/** The setup the live (or most recent) run launched with, or null before the first launch. */
export function lastCrucibleSetup() {
  if (!lastSetup) return null;
  return { ...lastSetup, loadout: lastSetup.loadout.map((entry) => ({ ...entry })) };
}

/** The ruleset the live (or most recent) run launched under. */
export function lastCrucibleRuleset() {
  return lastSetup ? normalizeCrucibleRuleset(lastSetup.ruleset) : CRUCIBLE_DEFAULT_RULESET;
}

/**
 * INF-010 — one explicit retry snapshot: the selected seed, kit (hull + loadout), arena and
 * ruleset as the run BEGAN, deep-copied so later mutation cannot silently change the challenge.
 * Carries no campaign possessions and no asset handles: the retry replays through the ordinary
 * New Game route, which reuses resident assets and performs a clean run reset. Null when no run
 * has launched yet (the results screen then returns to setup instead).
 */
export function buildCrucibleRetryRequest(setup = lastCrucibleSetup(), ruleset = lastCrucibleRuleset()) {
  if (!setup) return null;
  const resolvedRuleset = normalizeCrucibleRuleset(ruleset ?? setup.ruleset);
  const retrySetup = {
    ...setup,
    loadout: Array.isArray(setup.loadout) ? setup.loadout.map((entry) => ({ ...entry })) : [],
    ruleset: resolvedRuleset,
  };
  return { setup: retrySetup, ruleset: resolvedRuleset };
}

/** Test/lifecycle seam: forget the remembered setup. */
export function clearCrucibleSetup() {
  lastSetup = null;
}
