// NXB-028 — a damaged/short freight delivery settles explicit partial terms instead of a binary
// "not carrying" refusal. Recorded terms (reward_cr / contracted qty) price the delivered
// fraction; sealed sibling reservations are never paid as delivered; the mission terminates once
// so retry/reload cannot recollect.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  missions as missionsProto,
  partialDeliverySettlement,
} from '../src/systems/missions.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import { createGameState } from '../src/core/gameState.js';

const ORE = 'cmdty_ore_iron';

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeHarness({ seed = 91 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui = state.ui || {};
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.completedLog = [];
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.missions.config = { refreshSec: 600, maxActive: 8 };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  const ceres = {
    id: 11, type: 'station', alive: true,
    pos: { x: 900, z: 200 },
    data: { stationId: 'station_ceres', name: 'Ceres Refinery' },
  };
  state.entities.set(11, ceres);
  state.entityList.push(ceres);

  const bus = makeBus();
  bus.on('economy:grantCredits', (p) => {
    state.player.credits += Math.max(0, Math.round(Number(p && p.amount) || 0));
  });
  bus.on('economy:chargeCredits', (p) => {
    state.player.credits -= Math.max(0, Math.round(Number(p && p.amount) || 0));
  });
  const helpers = {
    voice: { say: () => true },
    hash32: () => 1,
    mulberry32: (s) => () => 0.5,
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  const clauses = Object.assign({}, contractClausesSystem);
  clauses.init({ state, bus, helpers, registry: { get: () => null } });
  bus.emit('game:started');
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.ui.trackedMissionId = null;
  if (state.nav) state.nav.waypoint = null;
  return { state, bus, missions };
}

function freightMission(h, { qty = 10, rewardCr = 1000, preloaded = false, id = 'm_test', destStationId = 'station_ceres' } = {}) {
  const m = {
    id, type: 'cargo_delivery', stationId: 'station_helios', factionId: 'faction_dmc',
    params: { cmdtyId: ORE, qty },
    objectiveProgress: 0,
    acceptedAt_s: h.state.simTime,
    deadline_s: null,
    reward_cr: rewardCr, collateral_cr: 0,
    destStationId, destSectorId: 'sector_ceres_belt',
    targetEntityIds: [],
    needsTargets: false,
    status: 'active',
    storyTag: null,
    preloadedCargo: preloaded,
  };
  if (preloaded) {
    m.params.sealedRemaining = qty;
    m.params.sealedDelivered = 0;
    m.params.sealAccounted = true;
  }
  h.state.missions.active.push(m);
  return m;
}

const evs = (h, name) => h.bus.emitLog.filter((e) => e.evt === name);
const grants = (h) => evs(h, 'economy:grantCredits')
  .reduce((sum, e) => sum + (Number(e.payload && e.payload.amount) || 0), 0);

test('NXB-028: a short loose delivery settles delivered units on recorded terms, once', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });
  addCargo(h.state, ORE, 4);

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed');
  assert.equal(m.params.completionMethod, 'partial_delivery');
  assert.equal(m.params.deliveredUnits, 4);
  assert.equal(m.params.shortfallUnits, 6);
  assert.equal(m.reward_cr, 400, '4/10 units at recorded 1000cr terms');
  assert.equal(h.state.player.cargo.items[ORE] || 0, 0);
  assert.equal(h.state.player.credits, 5000 + 400);
  const delivered = evs(h, 'cargo:delivered');
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].payload.qty, 4);
  assert.equal(delivered[0].payload.missionId, 'm_test');
});

test('NXB-028: ineligible sealed sibling units are not paid as delivered', () => {
  const h = makeHarness();
  // Sibling sealed contract holds a reservation on 6 of the same commodity.
  // A different destination keeps it pending so its reservation persists at ceres.
  freightMission(h, { qty: 6, rewardCr: 600, preloaded: true, id: 'm_sealed', destStationId: 'station_aster' });
  const loose = freightMission(h, { qty: 10, rewardCr: 1000, id: 'm_loose' });
  addCargo(h.state, ORE, 10); // 4 free + 6 reserved by the sibling

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(loose.status, 'completed');
  assert.equal(loose.params.deliveredUnits, 4, 'only the unreserved four can be delivered');
  assert.equal(loose.reward_cr, 400);
  assert.equal(h.state.player.cargo.items[ORE] || 0, 6, 'the sibling reservation stays aboard');
  const sealed = h.state.missions.active.find((row) => row.id === 'm_sealed');
  assert.ok(sealed, 'the sibling contract is untouched and still active');
  assert.equal(sealed.params.sealedRemaining, 6);
});

test('NXB-028: a sealed manifest short of its own reservation settles partial once', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 2000, preloaded: true });
  addCargo(h.state, ORE, 10);
  removeCargo(h.state, ORE, 7); // 3 of the sealed 10 were lost on the lane

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed');
  assert.equal(m.params.completionMethod, 'partial_delivery');
  assert.equal(m.params.deliveredUnits, 3);
  assert.equal(m.reward_cr, 600, '3/10 of the recorded 2000cr manifest terms');
  assert.equal(h.state.player.cargo.items[ORE] || 0, 0);
  assert.equal(h.state.player.credits, 5000 + 600);

  // A re-dock after settlement re-collects nothing — the completed mission is gone.
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(grants(h), 600, 'a second dock cannot collect the same terms twice');
});

test('NXB-028: a full hold still settles the whole contract unchanged', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });
  addCargo(h.state, ORE, 10);

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed');
  assert.notEqual(m.params.completionMethod, 'partial_delivery');
  assert.equal(m.reward_cr, 1000);
  assert.equal(h.state.player.cargo.items[ORE] || 0, 0);
  assert.equal(h.state.player.credits, 5000 + 1000);
});

// PB-ECON-B (row 107) — the graded damage clause: `fragile_graded` forfeits only its premium on
// a crack; the surviving units still settle short on recorded terms instead of voiding.
test('PB-ECON-B: a graded fragile contract cracks to partial terms, premium forfeited', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });
  m.clauses = [{
    id: 'fragile_graded', event: 'cargo:fragileLost',
    label: 'Fragile — graded terms', rewardMult: 1.15,
  }];
  addCargo(h.state, ORE, 10);
  removeCargo(h.state, ORE, 4); // the crack physically spills four units

  h.bus.emit('cargo:fragileLost', { totalQty: 4, items: [{ commodityId: ORE, qty: 4 }] });

  assert.equal(m.status, 'active', 'graded terms keep the contract alive after a crack');
  const broken = evs(h, 'mission:conditionBroken');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].payload.conditionId, 'fragile_graded');
  assert.equal(broken[0].payload.onBreach, 'forfeit');

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed');
  assert.equal(m.params.completionMethod, 'partial_delivery');
  assert.equal(m.params.deliveredUnits, 6);
  assert.equal(h.state.player.credits, 5000 + 600, 'recorded per-unit terms, premium forfeited');
});

test('PB-ECON-B: an unbroken graded contract still pays its premium on the full load', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });
  m.clauses = [{
    id: 'fragile_graded', event: 'cargo:fragileLost',
    label: 'Fragile — graded terms', rewardMult: 1.15,
  }];
  addCargo(h.state, ORE, 10);

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed');
  assert.notEqual(m.params.completionMethod, 'partial_delivery');
  assert.equal(h.state.player.credits, 5000 + 1150, 'full freight plus the honored premium');
});

test('NXB-028: an empty hold keeps the binary refusal — nothing settles', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'active');
  assert.equal(grants(h), 0);
  assert.equal(evs(h, 'cargo:delivered').length, 0);
});

test('partialDeliverySettlement is null for a full hold and for empty aboard', () => {
  const h = makeHarness();
  const m = freightMission(h, { qty: 10, rewardCr: 1000 });
  addCargo(h.state, ORE, 10);
  assert.equal(partialDeliverySettlement(m, h.state), null, 'full hold takes the normal path');
  removeCargo(h.state, ORE, 10);
  assert.equal(partialDeliverySettlement(m, h.state), null, 'nothing aboard settles nothing');
});
