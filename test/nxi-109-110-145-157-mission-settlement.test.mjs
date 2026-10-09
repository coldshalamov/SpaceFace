// NXI-109 — a fixed-terms delivery pays its recorded terms after ordinary market movement.
// NXI-110 — holding the freight makes it available; only station acceptance completes the handover.
// NXI-145 — cancelling one of two subject-sharing contracts leaves the other reachable.
// NXI-157 — a refused turn-in is read-only: cargo unchanged, no delivery event, terms still owed.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as missionData from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import { sellableCargoQuantity } from '../src/systems/cargo.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const rows = this.handlers.get(name) || []; rows.push(fn); this.handlers.set(name, rows); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
  of(name) { return this.log.filter((e) => e.name === name).map((e) => e.payload); }
}

function baseState({ seed = 91 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(missionData.MISSION_TUNING)),
    },
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
    factions: {
      faction_scn: { rep: 500 },
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    economy: { markets: {} },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot(state) {
  const bus = new Bus();
  const sys = { ...missions };
  sys.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  return { bus, sys };
}

let nextMissionId = 900;
function deliveryMission(over = {}) {
  return {
    id: 'm' + nextMissionId++,
    type: 'cargo_delivery',
    status: 'active',
    title: 'Freight run',
    factionId: 'faction_scn',
    stationId: 'station_helios',
    destStationId: 'station_forge',
    destSectorId: 'sector_forge',
    reward_cr: 5000,
    collateral_cr: 0,
    objectiveProgress: 0,
    objectiveTarget: 10,
    targetEntityIds: [],
    params: { cmdtyId: 'cmdty_ore_iron', qty: 10 },
    ...over,
  };
}

test('NXI-109: an active contract pays its recorded terms after ordinary market movement', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = deliveryMission({ reward_cr: 5000 });
  state.missions.active.push(m);
  state.player.cargo.items.cmdty_ore_iron = 10;
  state.player.cargo.usedVolume = 10;

  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));

  // Ordinary market movement while the contract is live: the book at the destination repriced.
  state.economy.markets.station_forge = {
    cmdty_ore_iron: { stock: 0, baseEq: 20, lastBuy: 9999, lastSell: 9999, demandMult: 3 },
  };

  bus.emit('dock:docked', { stationId: 'station_forge' });

  assert.equal(m.status, 'completed', 'delivery settled at the dock');
  const reward = grants.find((g) => g.reason === `mission:${m.id}`);
  assert.ok(reward, 'a reward grant posted');
  assert.equal(reward.amount, 5000, 'the recorded terms pay, not the moved listing');
});

test('NXI-110: picking up the freight does not complete the handover; the dock does', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = deliveryMission();
  state.missions.active.push(m);

  // Freight aboard, still at lane: possession alone is availability, not delivery.
  state.player.cargo.items.cmdty_ore_iron = 10;
  state.player.cargo.usedVolume = 10;
  bus.emit('mission:updated', { missionId: m.id });

  assert.equal(m.status, 'active', 'held freight does not close the contract');
  assert.equal(bus.of('cargo:delivered').length, 0, 'no delivery event without acceptance');
  assert.equal(bus.of('mission:completed').length, 0);

  bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(m.status, 'completed', 'station acceptance completes it');
  assert.equal(bus.of('cargo:delivered').length, 1, 'delivery event fires exactly at acceptance');
});

test('NXI-145: cancelling one of two subject-sharing contracts keeps the other reachable', () => {
  const state = baseState();
  const { bus } = boot(state);
  const mark = { id: 77, type: 'ship', alive: true, data: {}, pos: { x: 0, z: 0 } };
  state.entities.set(77, mark);
  state.entityList.push(mark);
  const first = deliveryMission({ targetEntityIds: [77] });
  const second = deliveryMission({ targetEntityIds: [77] });
  state.missions.active.push(first, second);

  bus.emit('ui:abandonMission', { missionId: first.id });
  assert.equal(first.status, 'failed', 'the cancelled contract settles');
  assert.equal(mark.alive, true, 'the shared subject survives — the second contract still owns it');
  assert.equal(second.status, 'active', 'the sibling contract is untouched');

  // And when the last claimant lets go, the body still sweeps (no forever pinning).
  bus.emit('ui:abandonMission', { missionId: second.id });
  assert.equal(mark.alive, false, 'sole claim swept normally');
});

// NXB-037 — two active jobs may reference one physical subject: observed evidence informs both
// contracts, each distinct promised payment settles once, and the body is swept only when the
// last live claim releases.
test('NXB-037: one kill settles both contracts that own the mark — each pays once', () => {
  const state = baseState();
  const { bus } = boot(state);
  const mark = { id: 77, type: 'ship', alive: true, data: { physicalRole: 'demolition_tower' }, pos: { x: 0, z: 0 } };
  state.entities.set(77, mark);
  state.entityList.push(mark);
  const first = deliveryMission({ id: 'mA', type: 'demolition', targetEntityIds: [77], reward_cr: 700 });
  const second = deliveryMission({ id: 'mB', type: 'demolition', targetEntityIds: [77], reward_cr: 900 });
  state.missions.active.push(first, second);

  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));

  bus.emit('entity:killed', { id: 77, killerId: 1, pos: { x: 0, z: 0 } });

  assert.equal(first.status, 'completed', 'first contract settles on the shared evidence');
  assert.equal(second.status, 'completed', 'second contract settles on the same evidence');
  const paidA = grants.filter((g) => g.reason === 'mission:mA');
  const paidB = grants.filter((g) => g.reason === 'mission:mB');
  assert.equal(paidA.length, 1, 'contract A pays its recorded terms exactly once');
  assert.equal(paidA[0].amount, 700);
  assert.equal(paidB.length, 1, 'contract B pays its recorded terms exactly once');
  assert.equal(paidB[0].amount, 900);
  assert.equal(mark.alive, false, 'the body sweeps once the last claimant settles');
});

// NXB-037 — a cancelled contract releases only its own sealed reservation (its freight is
// physically pulled from the hold); the surviving contract's reserved cargo stays aboard,
// still sealed and unsellable.
test('NXB-037: cancelling one sealed contract leaves the sibling reservation intact', () => {
  const state = baseState();
  const { bus } = boot(state);
  const a = deliveryMission({
    id: 'mA', preloadedCargo: true,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 6, sealedRemaining: 6, sealedDelivered: 0, sealAccounted: true },
  });
  const b = deliveryMission({
    id: 'mB', preloadedCargo: true,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 6, sealedRemaining: 6, sealedDelivered: 0, sealAccounted: true },
  });
  state.missions.active.push(a, b);
  state.player.cargo.items.cmdty_ore_iron = 12;
  state.player.cargo.usedVolume = 12;

  assert.equal(sellableCargoQuantity(state, 'cmdty_ore_iron'), 0, 'both reservations lock the hold');
  bus.emit('ui:abandonMission', { missionId: 'mA' });

  assert.equal(a.status, 'failed', 'the cancelled contract settles');
  assert.equal(b.status, 'active', 'the sibling contract is untouched');
  assert.equal(b.params.sealedRemaining, 6, 'the sibling reservation is not released');
  assert.equal(
    state.player.cargo.items.cmdty_ore_iron,
    6,
    'only the cancelled contract\'s freight leaves the hold',
  );
  assert.equal(
    sellableCargoQuantity(state, 'cmdty_ore_iron'),
    0,
    'everything still aboard belongs to the surviving sealed claim',
  );
});

test('NXI-157: a refused turn-in leaves cargo aboard, fires no delivery, and keeps the term owed', () => {
  const state = baseState();
  const { bus } = boot(state);
  const m = deliveryMission({ clauses: [{ conditionId: 'soft_berth' }] });
  state.missions.active.push(m);
  state.player.cargo.items.cmdty_ore_iron = 10;
  state.player.cargo.usedVolume = 10;

  bus.emit('dock:docked', { stationId: 'station_forge' });

  assert.equal(m.status, 'active', 'the blocked turn-in does not settle');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 10, 'held cargo unchanged by the refusal');
  assert.equal(bus.of('cargo:delivered').length, 0, 'no successful delivery event fired');
  assert.equal(bus.of('mission:completed').length, 0);
  const pending = bus.of('mission:conditionPending');
  assert.equal(pending.length, 1, 'the refusal names the term still owed');
  assert.equal(pending[0].conditionId, 'soft_berth');
});
