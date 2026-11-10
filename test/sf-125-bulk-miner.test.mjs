// SF-125 — bulk-miner with a meaningful exit decision.
//
// The packet's promise: a Drill Amp plus cargo capacity is a long-haul extraction build
// where the money question is WHEN to leave, not whether a timer failed you:
//   - the amp widens the rich-core release window for real (playerModSum fold)
//   - holding the beam to the sweet spot pays the multiplier into the hold
//   - releasing early is a legitimate exit: the bonus is simply not earned — ordinary
//     ore already in the hold is untouched, nothing is confiscated
//   - a full hold does not destroy yield: what the hold refuses spills or stays parked
//   - the loaded return genuinely flies different (mass on the same physics)
//
// Asserted against the live owners:
//   systems/mining.js    richCorePlan / _maybeExposeRichCore / _updateRichCoreCharge /
//                        _resolveRichCore with the real _directAddCargo/_spawnPickup/
//                        _parkUnreleasedOre paths (spawnEntity stubbed at the seam)
//   systems/ships.js     cargo mass -> handling, cargo pod -> capacity
//   data/synergies.js    the authored bulk_miner tell
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mining,
  richCorePlan,
  richCoreWindowPctForTier,
  RICH_CORE_DURATION_S,
  RICH_CORE_WINDOW_LO,
  RICH_CORE_WINDOW_HI,
} from '../src/systems/mining.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { synergiesForFittings } from '../src/data/synergies.js';
import { MODULES } from '../src/data/modules.js';

// ship_drifter slot order: 0-1 weapon/M, 2 shield/M, 3 engine/M, 4-5 cargo/M,
// 6 mining/M, 7-8 utility/M, 9 thruster/M.
const DRIFTER = 'ship_drifter';
const BULK_FIT = (() => {
  const f = new Array(10).fill(null);
  f[3] = 'mod_engine_fusion_m';
  f[4] = 'mod_cargo_pod_m';
  f[7] = 'mod_drill_amp';
  return f;
})();

const DRILL_AMP = MODULES.find((m) => m.id === 'mod_drill_amp');

// An asteroid id that actually carries a core on this seed (15% authored chance — the
// test finds one instead of faking the roll).
function coredRock(seed, tier = 2) {
  for (let i = 1; i < 500; i += 1) {
    const ast = { id: `ast_${i}`, type: 'asteroid', alive: true, pos: { x: 50, z: 0 }, radius: 14, mass: 8, data: { tier } };
    if (richCorePlan(seed, ast, null).hasCore) return ast;
  }
  throw new Error('no cored rock within 500 ids — the plan changed under the test');
}

function miningHarness(capVolume = 400, seed = 7, fittings = []) {
  const spawned = [];
  const emitted = [];
  const player = {
    id: 'player', type: 'ship', pos: { x: 0, z: 0 }, radius: 10, mass: 48, alive: true,
    data: { fittings },
  };
  const entities = new Map([[player.id, player]]);
  const state = {
    playerId: 'player',
    entities,
    simTime: 100,
    tick: 600,
    meta: { seed },
    rng: () => 0.5, // deterministic scatter midpoint — the sim's own rng slot
    player: {
      cargo: { items: {}, capVolume, usedVolume: 0, usedMass: 0 },
      mining: {},
    },
  };
  const system = Object.create(mining);
  system.state = state;
  system.bus = { emit: (id, payload) => emitted.push({ id, payload }), on: () => {} };
  system.registry = { get: () => null };
  system.helpers = {
    spawnEntity(spec) {
      const pod = { id: spawned.length + 900, alive: true, ...spec };
      spawned.push(pod);
      entities.set(pod.id, pod);
      return pod;
    },
  };
  return { system, state, emitted, spawned };
}

function emitMining(system, state, ast, { holdFor = 1.2, firing = true } = {}) {
  // Drive the charge update like a held beam, then release: chargeStartedAt -> release
  // resolves with the elapsed progress — the same rhythm the beam owner ticks.
  const core = state.player.mining && state.player.mining.richCore;
  system._updateRichCoreCharge(true, 1 / 60, state);
  state.simTime += holdFor;
  system._updateRichCoreCharge(false, 1 / 60, state);
  return core;
}

test('the amp is a real widened window, not a label: plan + fitted bonus, clamped', () => {
  const ast = coredRock(7);
  const plan = richCorePlan(7, ast, null);
  assert.ok(plan.hasCore);
  const { system, state } = miningHarness(400, 7, BULK_FIT);
  const core = system._maybeExposeRichCore(ast, null, state.entities.get('player'));
  assert.ok(core, 'the amp-fitted pilot still gets the deterministic opportunity');
  const expected = Math.min(0.5, Math.max(RICH_CORE_WINDOW_LO, plan.windowPct + DRILL_AMP.mods.richCoreRingPctBonus));
  assert.ok(Math.abs(core.windowPct - expected) < 1e-9,
    `window ${core.windowPct} must equal plan ${plan.windowPct} + amp ${DRILL_AMP.mods.richCoreRingPctBonus}`);
  assert.equal(core.durationS, RICH_CORE_DURATION_S);
  assert.equal(core.expiresAt, 100 + RICH_CORE_DURATION_S, 'the opportunity has an honest clock');
  // And without the module the same rock offers the narrower authored window.
  const bare = miningHarness(400, 7, []);
  const bareCore = bare.system._maybeExposeRichCore({ ...ast, data: { ...ast.data } }, null, bare.state.entities.get('player'));
  assert.ok(Math.abs(bareCore.windowPct - plan.windowPct) < 1e-9);
  assert.ok(core.windowPct > bareCore.windowPct, 'the amp buys reaction time, not yield');
  // The window law itself widens forgiving at low tiers and tightens on rich rock.
  assert.equal(richCoreWindowPctForTier(0), RICH_CORE_WINDOW_HI);
  assert.equal(richCoreWindowPctForTier(5), RICH_CORE_WINDOW_LO);
});

test('taking the core pays the multiplier through the real cargo path', () => {
  const ast = coredRock(7);
  const { system, state, emitted } = miningHarness(400, 7, BULK_FIT);
  const core = system._maybeExposeRichCore(ast, null, state.entities.get('player'));
  emitMining(system, state, ast, { holdFor: core.durationS * 0.5 });
  const done = emitted.find((e) => e.id === 'mining:richCoreCompleted');
  assert.ok(done, 'a sweet-spot release completes the core');
  assert.equal(done.payload.asteroidId, ast.id);
  const qty = Math.max(3, Math.min(8, Math.round(core.multiplier || 3)));
  assert.equal(state.player.cargo.items[core.commodityId], qty,
    'the multiplier pays as real ore in the hold');
  assert.ok(core.resolved);
  assert.equal(state.player.mining.richCore, undefined, 'the opportunity clears after resolution');
});

test('leaving early is a decision, not a failure: early release fizzles the bonus, keeps the hold', () => {
  const ast = coredRock(7);
  const { system, state, emitted } = miningHarness(400, 7, BULK_FIT);
  // Ordinary ore already aboard — the exit decision must never touch it.
  state.player.cargo.items.cmdty_ore_iron = 40;
  state.player.cargo.usedVolume = 40;
  state.player.cargo.usedMass = 120;
  const core = system._maybeExposeRichCore(ast, null, state.entities.get('player'));
  emitMining(system, state, ast, { holdFor: core.durationS * 0.05 }); // release far from center
  const fizzle = emitted.find((e) => e.id === 'mining:richCoreFizzle');
  assert.ok(fizzle, 'a missed window reads as a fizzle, not a punishment');
  assert.equal(emitted.filter((e) => e.id === 'mining:richCoreCompleted').length, 0);
  assert.equal(state.player.cargo.items[core.commodityId], undefined,
    'no bonus ore — but nothing taken either');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 40, 'the ordinary haul is untouched');
  assert.ok(core.resolved);
});

test('overstaying is honestly missed: the window closes and the same fizzle law applies', () => {
  const ast = coredRock(7);
  const { system, state, emitted } = miningHarness(400, 7, BULK_FIT);
  const core = system._maybeExposeRichCore(ast, null, state.entities.get('player'));
  // Never release — let expiresAt pass; the resolver treats it as progress 1 (a miss).
  state.simTime = core.expiresAt + 0.5;
  system._updateRichCoreCharge(true, 1 / 60, state);
  assert.ok(core.resolved);
  assert.ok(emitted.some((e) => e.id === 'mining:richCoreFizzle'));
});

test('yield is conserved across a full hold: accepted + spilled + parked equals the bonus', () => {
  const ast = coredRock(7);
  // A hold with exactly two units of room left.
  const { system, state, emitted, spawned } = miningHarness(2, 7, BULK_FIT);
  state.entities.set(ast.id, ast); // the rock must exist for rejected ore to park on it
  const core = system._maybeExposeRichCore(ast, null, state.entities.get('player'));
  emitMining(system, state, ast, { holdFor: core.durationS * 0.5 });
  const qty = Math.max(3, Math.min(8, Math.round(core.multiplier || 3)));
  const accepted = state.player.cargo.items[core.commodityId] || 0;
  const spilledUnits = spawned
    .filter((pod) => pod.data && pod.data.commodityId === core.commodityId)
    .reduce((s, pod) => s + pod.data.amount, 0);
  const parkedUnits = (ast.data.parkedOre || [])
    .filter((lot) => lot.commodityId === core.commodityId)
    .reduce((s, lot) => s + lot.qty, 0);
  const bufferedUnits = (system._unreleasedOre || [])
    .filter((lot) => lot.commodityId === core.commodityId)
    .reduce((s, lot) => s + lot.qty, 0);
  assert.equal(accepted + spilledUnits + parkedUnits + bufferedUnits, qty,
    `accepted ${accepted} + spilled ${spilledUnits} + parked ${parkedUnits} + buffered ${bufferedUnits} must conserve ${qty}`);
  assert.ok(accepted < qty, 'the hold actually refused — this is the conservation case');
  const yieldEvent = emitted.find((e) => e.id === 'mining:yield' && e.payload.richCore);
  assert.ok(yieldEvent);
  assert.equal(yieldEvent.payload.qty, qty);
  assert.equal(yieldEvent.payload.acceptedAmount, accepted, 'the receipt says what the hold took');
  for (const pod of spawned) {
    assert.equal(pod.type, 'pickup');
    assert.ok(pod.data.despawnAt > state.simTime || pod.data.despawnAt === undefined,
      'spilled ore is physical and scoopable, not deleted');
  }
});

test('repeated cores are independent opportunities, not a stuck flag', () => {
  const { system, state } = miningHarness(400, 7, BULK_FIT);
  const a = coredRock(7);
  const first = system._maybeExposeRichCore(a, null, state.entities.get('player'));
  emitMining(system, state, a, { holdFor: first.durationS * 0.5 });
  let b = null;
  for (let i = 500; i < 1000 && !b; i += 1) {
    const candidate = { id: `ast_${i}`, type: 'asteroid', alive: true, pos: { x: 60, z: 0 }, radius: 14, mass: 8, data: { tier: 2 } };
    if (richCorePlan(7, candidate, null).hasCore) b = candidate;
  }
  const second = system._maybeExposeRichCore(b, null, state.entities.get('player'));
  assert.ok(second && second !== first, 'a second rock is a fresh decision');
  assert.equal(second.resolved, false);
  assert.ok(!second.resolved);
});

test('the loaded return flies different: pod capacity plus hold mass on the same physics', () => {
  const empty = getDerivedStats(DRIFTER, BULK_FIT, { isPlayer: true, cargo: { usedMass: 0 } });
  const loaded = getDerivedStats(DRIFTER, BULK_FIT, { isPlayer: true, cargo: { usedMass: 300 } });
  const bare = getDerivedStats(DRIFTER, new Array(10).fill(null).map((_, i) => (i === 3 ? 'mod_engine_fusion_m' : null)), { isPlayer: true });
  assert.ok(empty.cargoCap > bare.cargoCap, 'the pod is where the haul capacity comes from');
  assert.ok(loaded.turnRate < empty.turnRate, 'a full hold turns worse on the way home');
  assert.ok(loaded.propulsion.mainAccel < empty.propulsion.mainAccel, 'and accelerates slower');
  assert.ok(synergiesForFittings(BULK_FIT).some((row) => row.id === 'bulk_miner'),
    'the authored tell names this exact fit');
});
