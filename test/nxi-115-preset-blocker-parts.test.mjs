// NXI-115 — a partially available saved loadout names exactly which required parts
// prevent application: missing owned stock (counted, named) stays distinguishable
// from slot-cause blockers (unavailable id, wrong fit, research). Covers ships.js
// dryRunLoadoutPresetApply (structured slotBlockers + missingParts) and
// loadoutPresets.formatLoadoutApplyReason (the composed apply-state text the
// Shipworks preset lozenge + build-record drawer show).
//
// NXI-116 — a stale preset that references catalog-gone ids keeps its named record
// and refuses with explicit missing ids; the live ship is untouched.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { dryRunLoadoutPresetApply } from '../src/systems/ships.js';
import {
  buildLoadoutPresetRailModel,
  formatLoadoutApplyReason,
  presetsForHull,
} from '../src/ui/ship/loadoutPresets.js';
import { SHIPS } from '../src/data/ships.js';

const KESTREL = 'ship_kestrel';
const GUN = 'wpn_autocannon_s';            // weapon S   → slot 0
const SHIELD = 'mod_shield_booster_s';     // shield S   → slot 1
const MINING = 'mod_mining_laser_s';       // mining S   → slot 4
const SCANNER = 'mod_cargo_scanner_s';     // utility S  → slot 5
const BIG_CARGO = 'mod_cargo_pod_m';       // cargo M on a cargo S slot → incompatible
const GHOST = 'mod_ghost_module';          // not in any catalog
const GONE = 'wpn_archived_beam_x';        // also not in any catalog
const SLOT_COUNT = 7; // kestrel: weapon S, shield S, engine M, cargo S, mining S, utility S, thruster S

function bootPlayer({ inventory = [] } = {}) {
  const state = createGameState(4242);
  state.player.ownedShips = [{ defId: KESTREL, fittings: new Array(SLOT_COUNT).fill(null) }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = inventory.slice();
  return state.player;
}

function emptyTarget() {
  return new Array(SLOT_COUNT).fill(null);
}

test('missing stock is enumerated by name and count, not collapsed to a number', () => {
  const player = bootPlayer({ inventory: [{ defId: SHIELD }] });
  const target = emptyTarget();
  target[1] = SHIELD;   // held — covered
  target[4] = MINING;   // not held — missing 1
  target[5] = SCANNER;  // not held — missing 1
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    targetFittings: target,
    moduleInventory: player.moduleInventory,
    player,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'missing_modules');
  assert.equal(plan.missingCount, 2);
  assert.deepEqual(
    plan.missingParts.map((p) => [p.defId, p.missing]),
    [[MINING, 1], [SCANNER, 1]],
  );
  assert.equal(plan.missingParts[0].name, 'Mining Laser S');
  assert.equal(plan.missingParts[0].need, 1);
  assert.equal(plan.missingParts[0].have, 0);

  const state = formatLoadoutApplyReason(plan);
  assert.equal(state.ok, false);
  assert.equal(state.reason, 'missing_modules');
  assert.ok(state.text.includes('1× Mining Laser S'), state.text);
  assert.ok(state.text.includes('1× Cargo Scanner S'), state.text);
});

test('an incompatible slot names its part, and missing stock beside it stays named', () => {
  const player = bootPlayer();
  const target = emptyTarget();
  target[3] = BIG_CARGO; // cargo M cannot go in the S cargo slot
  target[5] = SCANNER;   // a real, fittable part the hold does not stock
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    targetFittings: target,
    moduleInventory: [],
    player,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'incompatible_slot');
  assert.equal(plan.slotBlockers.length, 1);
  assert.equal(plan.slotBlockers[0].defId, BIG_CARGO);
  assert.equal(plan.slotBlockers[0].name, 'Cargo Pod M');
  assert.equal(plan.slotBlockers[0].slotIndex, 3);
  // The incompatible part is named under the slot cause, never double-listed as
  // missing stock; the unrelated missing module still is.
  assert.deepEqual(plan.missingParts.map((p) => p.defId), [SCANNER]);

  const state = formatLoadoutApplyReason(plan);
  assert.equal(state.reason, 'incompatible_slot');
  assert.ok(state.text.includes('Cargo Pod M'), state.text);
  assert.ok(state.text.toLowerCase().includes('not in hold: 1× cargo scanner s'), state.text);
});

test('a stale preset keeps its name and refuses with explicit missing ids (NXI-116)', () => {
  const player = bootPlayer();
  const target = emptyTarget();
  target[0] = GHOST; // slot 0 — first blocker in slot order
  target[3] = GONE;  // second unavailable id
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    targetFittings: target,
    moduleInventory: [],
    player,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'unknown_module', 'first blocker in slot order stays primary');
  assert.deepEqual(plan.slotBlockers.map((b) => b.defId), [GHOST, GONE]);

  const state = formatLoadoutApplyReason(plan);
  assert.ok(state.text.includes(GHOST), state.text);
  assert.ok(state.text.includes(GONE), state.text);
  assert.ok(state.text.toLowerCase().includes('unavailable'), state.text);

  // The unresolved preset itself is still inspectable: the rail model keeps the
  // player's named record (label key + fittings) and the live ship is untouched.
  player.loadoutPresets = [{
    id: 'lp_stale', hullDefId: KESTREL, labelKey: 'prospector',
    fittings: target.slice(), createdAt: 10,
  }];
  const kept = presetsForHull(player, KESTREL);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].labelKey, 'prospector');
  const rail = buildLoadoutPresetRailModel({
    player,
    hullDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    selectedPresetId: 'lp_stale',
    canRefit: true,
    dryRunApply: (preset) => dryRunLoadoutPresetApply({
      shipDefId: KESTREL,
      currentFittings: player.ownedShips[0].fittings,
      targetFittings: preset && preset.fittings,
      moduleInventory: player.moduleInventory,
      player,
    }),
  });
  const row = rail.presets.find((p) => p.id === 'lp_stale');
  assert.equal(row.label, 'Prospector', 'the named choice is not renamed or dropped');
  assert.equal(row.applyState.ok, false);
  assert.ok(row.applyState.text.includes(GHOST), row.applyState.text);
  assert.equal(player.ownedShips[0].fittings.every((id) => id === null), true,
    'the current ship remains usable — the stale preset mutates nothing');
});

test('first blocker in slot order is the primary reason (neighbouring semantics kept)', () => {
  const player = bootPlayer();
  const target = emptyTarget();
  target[3] = BIG_CARGO; // incompatible at slot 3
  target[5] = GHOST;     // unknown at slot 5
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    targetFittings: target,
    moduleInventory: [],
    player,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'incompatible_slot', 'slot 3 wins over slot 5 as before');
  assert.deepEqual(plan.slotBlockers.map((b) => b.reason), ['incompatible_slot', 'unknown_module']);
});

test('a fully available preset still dry-runs to a plan (neighbouring success)', () => {
  const player = bootPlayer({ inventory: [{ defId: SHIELD }, { defId: SCANNER }] });
  const target = emptyTarget();
  target[1] = SHIELD;
  target[5] = SCANNER;
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: player.ownedShips[0].fittings,
    targetFittings: target,
    moduleInventory: player.moduleInventory,
    player,
  });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(formatLoadoutApplyReason(plan).text, '');
});
