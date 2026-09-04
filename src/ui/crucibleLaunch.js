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
import { buildSandboxLaunchConfig, requestSandboxGame } from './sandbox/sandboxSetup.js';
import { SWARM_RULESET } from '../data/swarmMode.js';

/** v1 ships one authored arena. The other two Combat Lab arenas are wave-authored but unpolished. */
export const CRUCIBLE_ARENA_ID = 'helios_core';

/**
 * WHAT THE CRUCIBLE BUTTON PLAYS.
 *
 * Swarm is the default and the headline: constant pressure, a kill quota, no menu four waves out
 * of five, and no last wave. The authored thirty-wave arc is still here under `scored` — it is a
 * different, slower ruleset and it is not what "Crucible" means from the main menu.
 */
export const CRUCIBLE_DEFAULT_RULESET = SWARM_RULESET;
// The fresh Crucible route teaches shove physics immediately; benchmark package IDs stay stable.
export const CRUCIBLE_DEFAULT_STARTER_ID = 'physics_toolkit';
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
  lastSetup = {
    ...setup,
    ruleset: resolved,
    loadout: (setup.loadout || []).map((entry) => ({ ...entry })),
  };
  requestSandboxGame(bus, crucibleLaunchConfig(setup, resolved));
  return true;
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

/** Test/lifecycle seam: forget the remembered setup. */
export function clearCrucibleSetup() {
  lastSetup = null;
}
