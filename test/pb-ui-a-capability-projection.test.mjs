// PB-UI-A (build_map §1C row 147) — SF-242 + SF-251 capability comparison + draft fit
// projection, SIM HALVES ONLY. Closed ALREADY SATISFIED on master: both packets are covered
// children of SHIPPED parents (NXB-029 for SF-242, NXB-018 for SF-251 — build_map §1C H rows
// 184/181), and the instruments this row names already exist as pure consumers of the
// derived-stats owner:
//   • comparison   — ui/presenters/engineeringPreview.js presentLoadoutDelta (two fits, one
//                    hull) + presentHullCompare (two hulls, stock basis), every number from
//                    ships.getDerivedStats, honest tone via authored higherIsBetter;
//   • projection   — presentModuleFitPreview (candidate module onto a live fit, install vs
//                    replace, never touching the live array) and ships.dryRunLoadoutPresetApply
//                    (whole-loadout dry run with enumerated blockers);
//   • draft side   — survivalDraft offers carry replaces/replacesName + available/
//                    unavailableReason ('No compatible slot'), rendered live by the armory.
// This file pins those properties against the EXISTING implementation — no parallel sim code:
//   1. the comparison is honest (deltas equal owner-minus-owner; a real gain/loss pair) and
//      symmetric (A→B is the exact mirror of B→A);
//   2. the projection never mutates the live ship, its fittings array or the player;
//   3. unknown modules/ships fail closed with named reasons, never zeros.
// Pure presenters need no sim clock; the seeded state (fixed seed 4242) sources a real player
// object so the no-mutation proof runs against live-shaped data.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { dryRunLoadoutPresetApply } from '../src/systems/ships.js';
import {
  forwardAccelFor,
  governedFightSpeedFor,
  governedYawRateFor,
  travelSpeedFor,
} from '../src/systems/shipCapabilities.js';
import {
  presentLoadoutDelta,
  presentModuleFitPreview,
  presentHullCompare,
  PREVIEW_METRICS,
} from '../src/ui/presenters/engineeringPreview.js';
import { SHIPS } from '../src/data/ships.js';

const KESTREL = 'ship_kestrel';
const SHIELD_MODULE = 'mod_shield_booster_s'; // shield S: +60 shieldFlat, mass 3
const GUN_A = 'wpn_pulse_laser_s'; // weapon S, mass 2, no tech gate
const GUN_B = 'wpn_autocannon_s'; // weapon S, mass 4, no tech gate
const BIG_CARGO = 'mod_cargo_pod_m'; // cargo M — wrong type for kestrel's S weapon/shield slots
const UNKNOWN_MODULE = 'mod_ghost_module'; // not in any catalog
const UNKNOWN_HULL = 'ship_definitely_not_real';
const KESTREL_SLOT_COUNT = buildSlotCount(KESTREL);

function buildSlotCount(defId) {
  const def = SHIPS.find((s) => s.id === defId);
  const raw = def && def.slots ? def.slots : {};
  return Object.values(raw).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
}

/** A real, live-shaped player from the fixed-seed state, owning one fitted kestrel. */
function bootPlayer() {
  const state = createGameState(4242);
  state.player.ownedShips = [{ defId: KESTREL, fittings: new Array(KESTREL_SLOT_COUNT).fill(null) }];
  state.player.activeShipIndex = 0;
  state.player.ownedShips[0].fittings[0] = GUN_A; // a live fit: one gun mounted
  return state.player;
}

function deepSnapshot(value) {
  return JSON.stringify(value);
}

test('capability comparison is honest: deltas are owner numbers and show a real gain/loss pair', () => {
  const player = bootPlayer();
  const live = player.ownedShips[0].fittings;

  const after = live.slice();
  after[1] = SHIELD_MODULE; // mount the shield booster in the empty shield slot
  const delta = presentLoadoutDelta({ defId: KESTREL, beforeFittings: live, afterFittings: after, player });

  assert.equal(delta.ok, true, 'a legal candidate fit previews');
  assert.ok(delta.rows.length > 0, 'delta rows exist');

  // Every number is the derived-stats owner's own: row.delta === getDerivedStats(after) - before.
  // NXB-030: the motion rows resolve through the capability owner's live-profile reads — the
  // governed fight cap, burn ceiling, kernel yaw ceiling and forward accel — because those are
  // the numbers the flight kernel actually commands.
  const ownerRead = {
    operationalMass: (d) => d.operationalMass ?? d.mass,
    maxSpeed: governedFightSpeedFor,
    travelCeiling: travelSpeedFor,
    turnRate: governedYawRateFor,
    thrust: forwardAccelFor,
  };
  const ownerBefore = getDerivedStats(KESTREL, delta.beforeFittings, player);
  const ownerAfter = getDerivedStats(KESTREL, delta.afterFittings, player);
  for (const row of delta.rows) {
    const resolve = ownerRead[row.key] || ((d) => d[row.key]);
    const beforeVal = resolve(ownerBefore);
    const afterVal = resolve(ownerAfter);
    assert.ok(Number.isFinite(beforeVal) && Number.isFinite(afterVal), `row ${row.key} reads finite owner numbers`);
    assert.equal(row.before, beforeVal, `row ${row.key} before side is the owner value`);
    assert.equal(row.after, afterVal, `row ${row.key} after side is the owner value`);
    assert.ok(Math.abs(row.delta - (afterVal - beforeVal)) < 1e-9, `row ${row.key} delta is after-minus-before`);
    const improved = row.higherIsBetter ? row.delta > 0 : row.delta < 0;
    const expectedTone = Math.abs(row.delta) < 1e-6 ? 'same' : (improved ? 'better' : 'worse');
    assert.equal(row.tone, expectedTone, `row ${row.key} tone follows its authored higherIsBetter law`);
  }

  // SF-242's shape: one gained physical use and one lost capability from the same candidate —
  // the shield is gained, and the added module mass is an honest loss (mass: higherIsBetter=false).
  const shieldRow = delta.rows.find((r) => r.key === 'shieldMax');
  assert.ok(shieldRow, 'shieldMax is compared');
  assert.equal(shieldRow.tone, 'better', 'the shield gain reads as a gain');
  assert.ok(shieldRow.delta > 0, 'shieldMax rises by the module contribution');
  const massRow = delta.rows.find((r) => r.key === 'operationalMass');
  assert.ok(massRow, 'operational mass is compared');
  assert.equal(massRow.tone, 'worse', 'the mass cost reads as a loss');

  // An identical candidate is a no-op: every row same, delta zero.
  const noop = presentLoadoutDelta({ defId: KESTREL, beforeFittings: live, afterFittings: live.slice(), player });
  assert.equal(noop.ok, true);
  assert.equal(noop.rows.length, PREVIEW_METRICS.length, 'the full metric set is compared');
  for (const row of noop.rows) {
    assert.equal(row.tone, 'same', `identical fits read same on ${row.key}`);
    assert.equal(row.delta, 0, `identical fits claim no delta on ${row.key}`);
  }
});

test('capability comparison is symmetric: A→B is the exact mirror of B→A', () => {
  const player = bootPlayer();
  const live = player.ownedShips[0].fittings;
  const after = live.slice();
  after[1] = SHIELD_MODULE;

  const forward = presentLoadoutDelta({ defId: KESTREL, beforeFittings: live, afterFittings: after, player });
  const backward = presentLoadoutDelta({ defId: KESTREL, beforeFittings: after, afterFittings: live, player });

  assert.equal(forward.ok, true);
  assert.equal(backward.ok, true);
  assert.equal(forward.rows.length, backward.rows.length, 'both directions compare the same metric set');
  for (let i = 0; i < forward.rows.length; i++) {
    const a = forward.rows[i];
    const b = backward.rows[i];
    assert.equal(a.key, b.key);
    assert.equal(a.before, b.after, `row ${a.key}: forward.after is backward.before`);
    assert.equal(a.after, b.before, `row ${a.key}: forward.before is backward.after`);
    assert.ok(Math.abs(a.delta + b.delta) < 1e-9, `row ${a.key}: deltas negate exactly`);
    const expectedMirror = a.tone === 'same' ? 'same' : (a.tone === 'better' ? 'worse' : 'better');
    assert.equal(b.tone, expectedMirror, `row ${a.key}: tone mirrors, never inverts the law`);
  }
});

test('hull comparison reads the same derived-stats owner and answers the current hull honestly', () => {
  const player = bootPlayer();

  const self = presentHullCompare(KESTREL, player);
  assert.ok(self, 'comparing the active hull answers');
  assert.equal(self.kind, 'current', 'the active hull is named as current, not fabricated into a versus');

  const versus = presentHullCompare('ship_wasp', player);
  assert.ok(versus, 'a second hull produces a comparison');
  assert.equal(versus.kind, 'compare');
  assert.ok(Array.isArray(versus.compare.rows) && versus.compare.rows.length > 0, 'versus rows exist');
  // Owner authority: the stock numbers are exactly getDerivedStats with zeroed hangar cargo.
  const stockPlayer = { ...player, cargo: { ...player.cargo, usedMass: 0 } };
  const cand = getDerivedStats('ship_wasp', versus.candidateFittings, stockPlayer);
  const cur = getDerivedStats(KESTREL, versus.currentFittings, stockPlayer);
  assert.equal(versus.candidateDerived.shieldMax, cand.shieldMax, 'candidate shield is the owner value');
  assert.equal(versus.currentDerived.shieldMax, cur.shieldMax, 'current shield is the owner value');
  for (const row of versus.compare.rows) {
    assert.ok(['better', 'worse', 'same'].includes(row.tone), 'each row takes an honest tone');
  }

  assert.equal(presentHullCompare(UNKNOWN_HULL, player), null, 'an unknown hull answers nothing, not zeros');
});

test('draft fit projection previews a candidate without mutating the live ship or player', () => {
  const player = bootPlayer();
  const live = player.ownedShips[0].fittings;
  const liveRef = live;
  const snapshot = deepSnapshot({ player, live });

  // Install projection: shield booster lands in the empty shield slot.
  const install = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: SHIELD_MODULE, player });
  assert.equal(install.ok, true, 'a legal candidate projects');
  assert.equal(install.mode, 'install');
  assert.equal(install.slotIndex, 1);
  assert.equal(install.afterFittings[1], SHIELD_MODULE, 'the projected fit carries the candidate');
  assert.notEqual(install.afterFittings, live, 'the projection hands back a copy, not the live array');

  // Replace projection: a second gun over the mounted one names what leaves the fit.
  const replace = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: GUN_B, slotIndex: 0, player });
  assert.equal(replace.ok, true);
  assert.equal(replace.mode, 'replace');
  assert.equal(replace.beforeFittings[0], GUN_A, 'the displaced fitting is named');
  assert.equal(replace.afterFittings[0], GUN_B);

  // Whole-loadout dry run (the preset apply path): plans the swap, moves nothing.
  const target = live.slice();
  target[0] = GUN_B;
  target[1] = SHIELD_MODULE;
  const plan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: live,
    targetFittings: target,
    moduleInventory: [{ defId: GUN_B }, { defId: SHIELD_MODULE }],
    player,
  });
  assert.equal(plan.ok, true, 'an ownable candidate loadout dry-runs to a plan');
  assert.deepEqual([...plan.takeByDefId.entries()].map(([k, v]) => [k, v]).sort(), [['mod_shield_booster_s', 1], ['wpn_autocannon_s', 1]].sort());

  // The live ship is untouched: same array, same contents, same player — bit for bit.
  assert.equal(player.ownedShips[0].fittings, liveRef, 'the live fittings array identity survives');
  assert.equal(deepSnapshot({ player, live }), snapshot, 'projection mutated nothing on the live ship or player');
  assert.equal(live[1], null, 'the empty shield slot is still empty in the live fit');
});

test('unknown and incompatible candidates fail closed with named reasons, never zeros', () => {
  const player = bootPlayer();
  const live = player.ownedShips[0].fittings;

  // Unknown module: not ok, no rows, projected fit equals the current fit.
  const unknown = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: UNKNOWN_MODULE, player });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unknown_module');
  assert.ok(unknown.detail && unknown.detail.length > 0, 'an unknown module explains itself');
  assert.deepEqual(unknown.afterFittings, live.slice(), 'a refused candidate projects the unchanged fit');
  assert.deepEqual(unknown.rows, [], 'a refused candidate claims no stat deltas');

  // Unknown hull: refused before any slot math.
  const unknownShip = presentModuleFitPreview({ defId: UNKNOWN_HULL, fittings: [], moduleId: GUN_A, player });
  assert.equal(unknownShip.ok, false);
  assert.equal(unknownShip.reason, 'unknown_ship');

  // Type mismatch: cargo hardware on the weapon hardpoint.
  const wrongType = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: BIG_CARGO, slotIndex: 0, player });
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.reason, 'type_mismatch');

  // Size mismatch: M shield on the kestrel's S shield slot.
  const wrongSize = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: 'mod_shield_capacitor_m', slotIndex: 1, player });
  assert.equal(wrongSize.ok, false);
  assert.equal(wrongSize.reason, 'size_mismatch');

  // Out-of-range slot and empty removal fail closed too.
  const badSlot = presentModuleFitPreview({ defId: KESTREL, fittings: live, moduleId: GUN_B, slotIndex: 99, player });
  assert.equal(badSlot.ok, false);
  assert.equal(badSlot.reason, 'unknown_slot');
  const emptyRemove = presentModuleFitPreview({ defId: KESTREL, fittings: live, remove: true, slotIndex: 1, player });
  assert.equal(emptyRemove.ok, false);
  assert.equal(emptyRemove.reason, 'remove_empty');

  // The whole-loadout dry run refuses unknown hardware with the same named reason.
  const badPlan = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: live,
    targetFittings: [UNKNOWN_MODULE, ...new Array(KESTREL_SLOT_COUNT - 1).fill(null)],
    moduleInventory: [],
    player,
  });
  assert.equal(badPlan.ok, false);
  assert.equal(badPlan.reason, 'unknown_module');
  assert.ok(badPlan.text && badPlan.text.length > 0, 'the dry run names the refusal');

  // And an unloadable plan (hardware not owned) refuses without a phantom grant.
  const missing = dryRunLoadoutPresetApply({
    shipDefId: KESTREL,
    currentFittings: live,
    targetFittings: (() => { const t = live.slice(); t[1] = SHIELD_MODULE; return t; })(),
    moduleInventory: [], // the shield booster is not owned
    player,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing_modules');
});
