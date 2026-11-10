// A voided contract says the deposit came back only when a deposit was charged.
// Seed 4242. A bounty mark destroyed by someone else voids the writ: no standing
// lost, and the deposit returns only if one was taken. A writ with no deposit
// must not tell the pilot the money came back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../src/systems/missions.js';

function voidWrit(collateral, reason, causeLabel) {
  const events = [];
  const handlers = new Map();
  const bus = {
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
      return () => {};
    },
    off() {},
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
  const state = {
    meta: { seed: 4242 },
    simTime: 100,
    tick: 60,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 5000,
      cargo: { capVolume: 40, usedVolume: 0, items: {} },
      stats: {},
      researchPoints: 0,
      heat: 0,
    },
    ui: {},
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    world: {
      currentSectorId: 'sector_ceres_belt',
      activeSector: { id: 'sector_ceres_belt', stations: [] },
      sectors: {},
    },
    sectorSim: { sectors: {}, field: { nodes: {} } },
    rng: () => 0.5,
  };
  const system = { ...missions };
  system.init({
    state,
    bus,
    helpers: { voice: { say() { return false; } } },
    registry: { get: () => null },
  });
  const mission = {
    id: 'bounty-void-4242',
    status: 'active',
    type: 'bounty_hunt',
    title: 'Warrant on Kess',
    stationId: 'station_ceres_refinery',
    destStationId: 'station_ceres_refinery',
    factionId: 'faction_reach',
    reward_cr: 900,
    collateral_cr: collateral,
    objectiveProgress: 0,
    objectiveTarget: 1,
    targetEntityIds: [7],
    params: causeLabel ? { externalCauseLabel: causeLabel } : {},
  };
  state.missions.active.push(mission);
  system._failMission(mission, 0, reason);
  return {
    status: mission.status,
    grants: events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.payload),
    rep: events.filter((e) => e.name === 'faction:repDelta').map((e) => e.payload),
    toasts: events.filter((e) => e.name === 'toast').map((e) => e.payload.text),
    popups: events.filter((e) => e.name === 'comms:popup').map((e) => e.payload.text),
  };
}

test('a voided bounty with no deposit does not say the deposit was refunded', () => {
  const out = voidWrit(0, 'target_lost');
  assert.equal(out.status, 'failed');
  assert.deepEqual(out.grants, []);
  assert.deepEqual(out.rep, []);
  assert.equal(out.toasts.length, 1);
  assert.equal(out.toasts[0], 'Contract void: the mark for Warrant on Kess was destroyed.');
  assert.equal(out.toasts[0].includes('deposit'), false);
  assert.equal(out.popups.length, 1);
  assert.match(out.popups[0], /The contract is void — no standing lost\./);
  assert.equal(out.popups[0].includes('deposit'), false);
});

test('a voided bounty that took a deposit still says the deposit came back', () => {
  const out = voidWrit(250, 'target_lost');
  assert.deepEqual(out.grants, [{ amount: 250, reason: 'collateral_refund:bounty-void-4242' }]);
  assert.deepEqual(out.rep, []);
  assert.equal(out.toasts[0], 'Contract void: the mark for Warrant on Kess was destroyed — deposit refunded.');
  assert.match(out.popups[0], /deposit refunded, no standing lost\./);
});

test('a voided objective with no deposit names the cause and not a refund', () => {
  const out = voidWrit(0, 'failed_external', 'a patrol cutter');
  assert.deepEqual(out.grants, []);
  assert.equal(out.toasts[0], 'Contract void: Warrant on Kess — a patrol cutter.');
  assert.equal(out.toasts[0].includes('deposit'), false);
});
