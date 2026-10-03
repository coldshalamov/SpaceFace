// PB-UI-C (SF-241 + SF-246) — the sim halves of trade-confirm truth and mission next-action.
//
// SF-241: after a confirm, the screen's truth is DERIVABLE from the economy's own receipts —
// the executed quantity, the settled total, and the hold/purse residue the move left behind.
// A partial execution is reported as one, never papered over. Receipts are settled through the
// live economy code path (afterTrade → recordTradeLedger), the same one the Market screen hits.
//
// SF-246: the next action derives from the mission owner's canonical record at query time —
// carry truth through cargo's own seal readers, clause blocks through the condition catalog,
// destroyed bounty targets never pointed at — no parallel state machine, no phase cache.
//
// Headless; fixed seed; no Math.random anywhere in the paths under test.
import assert from 'node:assert/strict';
import test from 'node:test';

import { economy } from '../src/systems/economy.js';
import { projectTradeOutcome, findTradeReceipt, latestTradeReceipt, tradeResidue } from '../src/ui/sim/tradeTruth.js';
import { missionNextActionRow, nextMissionAction, trackedMission } from '../src/ui/sim/missionNextAction.js';

const PLAYER = 1;

function makeState({ seed = 4242, simTime = 420 } = {}) {
  return {
    meta: { seed },
    simTime,
    playerId: PLAYER,
    player: {
      credits: 5000,
      cargo: { items: {}, capVolume: 40, capMass: 60 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { trackedMissionId: null },
    missions: { active: [] },
  };
}

function makeEconomy(state, emitted = []) {
  return {
    ...economy,
    state,
    bus: { emit: (name, payload) => emitted.push({ name, payload }) },
    snapshotIntel() {},
  };
}

// ── SF-241: the receipt the confirm can be checked against ──────────────────────────────────────

test('a confirmed buy is derivable from the economy receipt: quantity, total and residue agree', () => {
  const state = makeState();
  const system = makeEconomy(state);
  const receipt = system.afterTrade(state, 'station_helios', 'cmdty_ore_iron', 'buy', 10, 25, 250, 0, { basePrice: 20 });
  state.player.credits = 4750; // the purse the trade actually left
  state.player.cargo.items.cmdty_ore_iron = 10;

  const projection = projectTradeOutcome(state, { commodityId: 'cmdty_ore_iron', side: 'buy', qty: 10, total: 250 });
  assert.equal(projection.found, true);
  assert.equal(projection.receipt.receiptId, receipt.receiptId);
  assert.equal(projection.executedQty, 10);
  assert.equal(projection.quantityAgrees, true);
  assert.equal(projection.totalAgrees, true);
  assert.equal(projection.agrees, true);
  assert.equal(projection.partialFill, false);
  assert.deepEqual(projection.deviations, []);
  assert.equal(projection.residue.holdQty, 10);
  assert.equal(projection.residue.credits, 4750);
});

test('a partial execution is reported as the truth it is, not as the confirmed quantity', () => {
  const state = makeState();
  const system = makeEconomy(state);
  // The market settled 6 of the confirmed 10.
  system.afterTrade(state, 'station_helios', 'cmdty_ore_iron', 'sell', 6, 40, 240, 0, { basePrice: 20 });

  const projection = projectTradeOutcome(state, { commodityId: 'cmdty_ore_iron', side: 'sell', qty: 10, total: 400 });
  assert.equal(projection.found, true);
  assert.equal(projection.executedQty, 6);
  assert.equal(projection.partialFill, true);
  assert.equal(projection.quantityAgrees, false);
  assert.equal(projection.totalAgrees, false);
  assert.equal(projection.agrees, false);
  assert.deepEqual(
    projection.deviations.map((d) => d.field).sort(),
    ['qty', 'total'],
  );
  const qtyRow = projection.deviations.find((d) => d.field === 'qty');
  assert.equal(qtyRow.expected, 10);
  assert.equal(qtyRow.actual, 6);
});

test('no settlement reads as no settlement, never as a fabricated receipt', () => {
  const state = makeState();
  const projection = projectTradeOutcome(state, { commodityId: 'cmdty_unobtainium', side: 'buy', qty: 4 });
  assert.equal(projection.found, false);
  assert.equal(projection.receipt, null);
  assert.equal(projection.agrees, false);
  assert.equal(projection.deviations[0].field, 'settlement');
});

test('the confirmation can re-read the exact receipt its tradeCompleted event published', () => {
  const state = makeState();
  const emitted = [];
  const system = makeEconomy(state, emitted);
  system.afterTrade(state, 'station_ceres', 'cmdty_water', 'buy', 3, 12, 36, 0, { basePrice: 10 });
  system.afterTrade(state, 'station_helios', 'cmdty_water', 'buy', 5, 11, 55, 0, { basePrice: 10 });

  const event = emitted.filter((e) => e.name === 'economy:tradeCompleted').pop().payload;
  const receipt = findTradeReceipt(state, { receiptId: event.receiptId });
  assert.equal(receipt.tradeSequence, event.tradeSequence);
  assert.equal(receipt.qty, 5);
  assert.equal(receipt.stationId, 'station_helios');

  // Latest-receipt reads honor the sequence pin: nothing older leaks through after the cap.
  assert.equal(latestTradeReceipt(state, { commodityId: 'cmdty_water', afterSequence: 2 }), null);
  assert.equal(latestTradeReceipt(state, { commodityId: 'cmdty_water' }).tradeSequence, 2);
  assert.deepEqual(tradeResidue(state, 'cmdty_water'), { holdQty: 0, holdSellableQty: 0, credits: 5000 });
});

test('a sealed stack is unavailable residue: the hold shows it, the sellable read does not', () => {
  const state = makeState();
  state.player.cargo.items.cmdty_ore_iron = 12;
  // No contract data aboard → the seal reader leaves the whole stack sellable.
  assert.equal(tradeResidue(state, 'cmdty_ore_iron').holdSellableQty, 12);
  assert.equal(tradeResidue(state, 'cmdty_ore_iron').holdQty, 12);
});

// ── SF-246: the next action derives from the mission owner's record ────────────────────────────

function deliveryMission(overrides = {}) {
  return {
    id: 'm_delivery',
    status: 'active',
    title: 'Iron for Ceres',
    type: 'cargo_delivery',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres',
    reward_cr: 900,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 10 },
    ...overrides,
  };
}

test('the tracked active mission wins over the first; nothing active derives nothing', () => {
  const state = makeState();
  assert.equal(nextMissionAction(state), null);
  state.missions.active = [deliveryMission({ id: 'm_first' }), deliveryMission({ id: 'm_second' })];
  state.ui.trackedMissionId = 'm_second';
  assert.equal(trackedMission(state).id, 'm_second');
  assert.equal(nextMissionAction(state).missionId, 'm_second');
});

test('a short hold derives acquire with the real shortfall, and the short-manifest branch', () => {
  const state = makeState();
  state.missions.active = [deliveryMission()];
  state.player.cargo.items.cmdty_ore_iron = 3;

  const row = nextMissionAction(state);
  assert.equal(row.phase, 'acquire');
  assert.equal(row.action.kind, 'acquire');
  assert.equal(row.action.commodityId, 'cmdty_ore_iron');
  assert.equal(row.action.qty, 7);
  // The owner's own partial-settlement reader says 3 units could settle short right now.
  assert.equal(row.action.partialDeliverable, 3);
});

test('a satisfied hold derives turn-in at the recorded destination berth', () => {
  const state = makeState();
  state.missions.active = [deliveryMission()];
  state.player.cargo.items.cmdty_ore_iron = 12; // over-carry is capped by the contract

  const row = nextMissionAction(state);
  assert.equal(row.phase, 'turn_in');
  assert.equal(row.action.kind, 'dock');
  assert.equal(row.action.stationId, 'station_ceres');
  assert.equal(row.action.qty, 10);
  assert.equal(row.carry.deliverable, 10);
});

test('a destination in another sector derives travel before the berth matters', () => {
  const state = makeState();
  state.missions.active = [deliveryMission({
    type: 'passenger_transport',
    params: {},
  })];

  const row = nextMissionAction(state);
  assert.equal(row.phase, 'travel');
  assert.equal(row.action.kind, 'travel');
  assert.equal(row.action.sectorId, 'sector_ceres');

  state.world.currentSectorId = 'sector_ceres';
  const local = missionNextActionRow(state, state.missions.active[0]);
  assert.equal(local.phase, 'turn_in');
});

test('an unsatisfied blocking contract term derives the settle-first phase, with its text', () => {
  const state = makeState();
  state.missions.active = [deliveryMission({
    clauses: [{ conditionId: 'soft_berth' }],
  })];
  state.player.cargo.items.cmdty_ore_iron = 12;

  const row = nextMissionAction(state);
  assert.equal(row.phase, 'blocked');
  assert.equal(row.action.kind, 'settle_clause');
  assert.equal(row.action.clauseId, 'soft_berth');
  assert.equal(row.blockedClauses[0].id, 'soft_berth');
  assert.ok(row.blockedClauses[0].pendingText.length > 0);
});

test('a bounty whose named targets are all dead derives target_lost, never a stale point', () => {
  const state = makeState();
  const entities = new Map([
    ['e1', { id: 'e1', alive: false }],
    ['e2', { id: 'e2', alive: false }],
  ]);
  state.entities = entities;
  state.missions.active = [{
    id: 'm_bounty',
    status: 'active',
    type: 'bounty_hunt',
    objectiveTarget: 2,
    objectiveProgress: 0,
    targetEntityIds: ['e1', 'e2'],
  }];
  const row = nextMissionAction(state);
  assert.equal(row.phase, 'target_lost');
  assert.equal(row.action.kind, 'report');

  // A live target (or a finished tally) is not a lost one.
  entities.get('e2').alive = true;
  assert.equal(nextMissionAction(state).phase, 'perform');
  assert.equal(nextMissionAction(state).action.kind, 'engage');
  // An unspawned target is unknown, not dead: the hunt keeps pointing.
  entities.delete('e2');
  entities.delete('e1');
  assert.equal(nextMissionAction(state).phase, 'perform');
});

test('interrupted and partial continuations stay derivable: progress, recovery and the clock', () => {
  const state = makeState();
  state.missions.active = [deliveryMission({
    type: 'patrol_clear',
    params: {},
    objectiveProgress: 3,
    objectiveTarget: 5,
    deadline_s: 480,
    mutationTag: 'salvage',
  })];
  const row = nextMissionAction(state);
  assert.equal(row.phase, 'perform');
  assert.deepEqual(row.progress, { have: 3, need: 5, done: false });
  assert.equal(row.recovery, true, 'the salvage-mutation branch is a live continuation, not a failure');
  assert.equal(row.clock.remainingS, 60);
  assert.equal(row.clock.urgent, true);

  // The owner's progress met its target → close out at the recorded berth.
  state.missions.active[0].objectiveProgress = 5;
  const done = nextMissionAction(state);
  assert.equal(done.phase, 'done');
  assert.equal(done.action.kind, 'dock');
});

test('a failed mission is a failure row, not a next action the HUD can point at', () => {
  const state = makeState();
  state.missions.active = [deliveryMission({ status: 'failed' })];
  assert.equal(nextMissionAction(state), null);
  assert.equal(missionNextActionRow(state, state.missions.active[0]), null);
});
