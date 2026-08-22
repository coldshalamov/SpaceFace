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

/** v1 ships one authored arena. The other two Combat Lab arenas are wave-authored but unpolished. */
export const CRUCIBLE_ARENA_ID = 'helios_core';
export const CRUCIBLE_SEED_MIN = 1;
export const CRUCIBLE_SEED_MAX = 0xffffffff;

let lastSetup = null;

/** Build (and validate) a Crucible setup from a starter package id and a seed. */
export function crucibleSetupFor({ starterId, seed, arenaId = CRUCIBLE_ARENA_ID } = {}) {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterId)
    || COMBAT_LAB_STARTER_PACKAGES[0];
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

/** The ordinary launch config, with the Crucible setup riding along. */
export function crucibleLaunchConfig(setup) {
  return buildSandboxLaunchConfig({}, { survivalSetup: setup });
}

/**
 * Launch a run. Remembers the setup so the results screen can replay this exact seed, then goes
 * through the real New Game request.
 */
export function requestCrucibleRun(bus, setup) {
  if (!setup) return false;
  lastSetup = { ...setup, loadout: (setup.loadout || []).map((entry) => ({ ...entry })) };
  requestSandboxGame(bus, crucibleLaunchConfig(setup));
  return true;
}

/** The setup the live (or most recent) run launched with, or null before the first launch. */
export function lastCrucibleSetup() {
  if (!lastSetup) return null;
  return { ...lastSetup, loadout: lastSetup.loadout.map((entry) => ({ ...entry })) };
}

/** Test/lifecycle seam: forget the remembered setup. */
export function clearCrucibleSetup() {
  lastSetup = null;
}
