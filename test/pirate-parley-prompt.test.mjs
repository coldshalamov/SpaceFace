import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parleyDemandText,
  parleyHailerText,
  parleyReceiptText,
  parleyRemainingSeconds,
  shouldSurfaceParley,
} from '../src/ui/pirateParleyPrompt.js';

function state(overrides = {}) {
  const hailer = { id: 'raider-1', factionId: 'faction_reach', data: { callsign: 'CUTLASS-7' } };
  return {
    mode: 'flight', simTime: 10,
    world: { currentSectorId: 'sector_tethys_junction' },
    ui: { docked: false },
    player: { cargo: { items: { cmdty_refined_metals: 12 } } },
    entities: new Map([[hailer.id, hailer]]), entityList: [hailer],
    ...overrides,
  };
}

const demand = {
  squadId: 'sq-toll', hailerId: 'raider-1', factionId: 'faction_reach',
  deadlineAt: 18, demand: { kind: 'cargo', commodityId: 'cmdty_refined_metals', amount: 3, qty: 3 },
};

test('surface exposes a concrete sender, demand, motive window and deterministic countdown', () => {
  const s = state();
  assert.equal(shouldSurfaceParley(demand, s), true);
  assert.equal(parleyHailerText(demand, s), 'CUTLASS-7 · Crimson Reach');
  assert.equal(parleyDemandText(demand.demand), 'JETTISON 3 METALS');
  assert.equal(parleyDemandText({ kind: 'credits', amount: 1200 }), 'TRANSFER 1,200 CREDITS');
  assert.equal(parleyRemainingSeconds(demand.deadlineAt, s.simTime), 8);
  assert.equal(parleyRemainingSeconds(demand.deadlineAt, 99), 0);
});

test('surface refuses Helios, empty-hold, docked, expired and malformed demands', () => {
  assert.equal(shouldSurfaceParley(demand, state({ world: { currentSectorId: 'sector_helios_prime' } })), false);
  assert.equal(shouldSurfaceParley(demand, state({ player: { cargo: { items: {} } } })), false);
  assert.equal(shouldSurfaceParley(demand, state({ ui: { docked: true } })), false);
  assert.equal(shouldSurfaceParley({ ...demand, deadlineAt: 9 }, state()), false);
  assert.equal(shouldSurfaceParley({ ...demand, demand: { kind: 'cargo', amount: 0 } }, state()), false);
});

test('receipts name the exact disengagement or escalation cause', () => {
  assert.match(parleyReceiptText({ outcome: 'complied', payment: { kind: 'credits', amount: 300 } }), /300 credits transferred.*disengaging/i);
  assert.match(parleyReceiptText({ outcome: 'evaded' }), /clear of intercept radius.*disengaging/i);
  assert.match(parleyReceiptText({ outcome: 'decoyed' }), /committed to the dropped pod.*disengaging/i);
  assert.match(parleyReceiptText({ outcome: 'refused' }), /refused the toll.*weapons free/i);
  assert.match(parleyReceiptText({ outcome: 'timeout' }), /window expired.*weapons free/i);
  assert.match(parleyReceiptText({ outcome: 'player_attack' }), /you fired during parley.*weapons free/i);
});
