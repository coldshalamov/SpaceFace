import { missionDockAttention } from '../src/ui/station/missionDockAttention.js';
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


test('berth attention follows real partial delivery and clears after ordinary docking', () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 10 });
  addCargo(h.state, ORE, 4);
  const before = JSON.stringify(h.state.player.cargo);
  const cue = missionDockAttention(h.state, 'station_ceres');
  assert.equal(cue.kind, 'turn_in'); assert.match(cue.reason, /4\/10/);
  assert.equal(JSON.stringify(h.state.player.cargo), before);
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, 'completed'); assert.equal(m.params.deliveredUnits, 4);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'accept');
  assert.notEqual(missionDockAttention(h.state, 'station_ceres').focusMissionId, m.id);
});
test('sibling seals cannot light a false delivery; owner also refuses the same hold', () => {
  const h = makeHarness();
  freightMission(h, { qty: 6, preloaded: true, id: 'sibling', destStationId: 'station_aster' });
  const m = freightMission(h, { qty: 6, id: 'loose' }); addCargo(h.state, ORE, 6);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'active');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, 'active'); assert.equal(h.state.player.cargo.items[ORE], 6);
});
test('own sealed remainder, not original quantity, determines berth readiness', () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 10, preloaded: true });
  m.params.sealedRemaining = 4; addCargo(h.state, ORE, 4);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'turn_in');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' }); assert.equal(m.status, 'completed');
});
test('required berth condition blocks even a full hold until owner records satisfaction', () => {
  const h = makeHarness(); const m = freightMission(h, {}); addCargo(h.state, ORE, 10);
  m.clauses = [{ conditionId: 'soft_berth' }];
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'active');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' }); assert.equal(m.status, 'active');
  m._clauseState = { soft_berth: { satisfied: true } };
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'turn_in');
});
test('persistent assay sample remains authorized while story freight cannot settle short', () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 1 });
  m.params.cmdtyId = 'cmdty_47a_assay_sample';
  m.storyTag = 'campaign47a:b0:recovery'; h.state.story.persistentCargo = [m.params.cmdtyId];
  addCargo(h.state, m.params.cmdtyId, 1);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'turn_in');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, 'completed');
  assert.equal(h.state.player.cargo.items.cmdty_47a_assay_sample || 0, 0);
  const short = freightMission(h, { qty: 10 }); short.storyTag = 'campaign47a:b1:honest_work';
  addCargo(h.state, ORE, 1);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'active');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' }); assert.equal(short.status, 'active');
});

test('a B0 tag does not unlock a different persistent commodity', () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 1 });
  m.storyTag = 'campaign47a:b0:recovery'; h.state.story.persistentCargo = [ORE]; addCargo(h.state, ORE, 1);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'active');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, 'active'); assert.equal(h.state.player.cargo.items[ORE], 1);
});

for (const aboard of [0, 4, 10]) test(`unaccounted seal with stale zero remainder reads actual docking terms (${aboard} aboard)`, () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 10, preloaded: true });
  Object.assign(m.params, { sealAccounted: false, sealedRemaining: 0, sealedDelivered: 1 });
  if (aboard) addCargo(h.state, ORE, aboard);
  const before = JSON.stringify(m);
  const cue = missionDockAttention(h.state, 'station_ceres');
  assert.equal(cue.kind, aboard ? 'turn_in' : 'active');
  if (aboard === 4) assert.match(cue.reason, /4\/10/);
  assert.equal(JSON.stringify(m), before, 'read does not account the seal');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, aboard ? 'completed' : 'active');
  if (!aboard) assert.equal(m.params.sealedRemaining, 10);
  if (aboard === 4) assert.equal(m.params.deliveredUnits, 4);
});
test('selection changes prefer a genuinely ready job over tracked reserved freight', () => {
  const h = makeHarness();
  freightMission(h, { qty: 6, preloaded: true, id: 'sibling', destStationId: 'station_aster' });
  const blocked = freightMission(h, { qty: 6, id: 'blocked' });
  const ready = freightMission(h, { qty: 1, id: 'ready' }); ready.params.cmdtyId = 'cmdty_electronics';
  addCargo(h.state, ORE, 6); addCargo(h.state, 'cmdty_electronics', 1); h.state.ui.trackedMissionId = blocked.id;
  assert.equal(missionDockAttention(h.state, 'station_ceres').focusMissionId, ready.id);
  ready.status = 'completed'; assert.equal(missionDockAttention(h.state, 'station_ceres').focusMissionId, blocked.id);
});

test('salvage successor keeps real short-recovery settlement, ordinary salvage does not', () => {
  const h = makeHarness(); const m = freightMission(h, { qty: 10 });
  m.type = 'salvage_retrieval'; addCargo(h.state, ORE, 4);
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'active');
  m.mutationTag = 'recovery';
  assert.equal(missionDockAttention(h.state, 'station_ceres').kind, 'turn_in');
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(m.status, 'completed'); assert.equal(m.params.completionMethod, 'partial_recovery');
});
