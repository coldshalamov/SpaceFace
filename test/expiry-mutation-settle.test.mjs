// SWP-TXN regression (review R-e82fb7a): drive the REAL _expireMission path — which
// runs _mutateInsteadOfFail first — for a fence-route leg and a deniable clause. A
// real deadline expiry usually mutates into a restitution successor, so the emitted
// mission:expired carries mutatedToMissionId; the settlement must still land exactly
// once on the recorded missionId, and the successor (no fence_route/deniable cause)
// must never re-key either ledger.
//
//   node --test test/expiry-mutation-settle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  DENIABLE_CAUSE_TAG,
} from '../src/data/economyContractTemplates.js';
import { deniableBoardEpoch, deniableSeedsOf } from '../src/data/deniableAftermath.js';
import {
  FENCE_BY_ID, FENCE_ROUTE_CAUSE_TAG, fenceRowOf,
} from '../src/data/fences.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const FENCE = 'station_smuggler';
const FENCE_SECTOR = 'sector_pallas_drift';
const SMUGGLER = FENCE_BY_ID.get('fence_oriel_pask');

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
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

function makeHarness({ seed = 4242, heat = 0.5, withHeat = true } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 20000;
  state.player.heat = heat;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  state.world = state.world || {};
  state.world.currentSectorId = FENCE_SECTOR;
  state.ui = state.ui || {};
  state.missions = state.missions || {};
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.completedLog = [];
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.missions.config = state.missions.config || { refreshSec: 600, maxActive: 8 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const bus = makeBus();
  const lines = [];
  bus.on('economy:grantCredits', (p) => { state.player.credits += Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  bus.on('economy:chargeCredits', (p) => { state.player.credits -= Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  const helpers = {
    voice: { say: (row) => { lines.push(row); return true; } },
    hash32: (...parts) => {
      let h = 2166136261;
      for (const p of parts) {
        const s = String(p);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      }
      return h >>> 0;
    },
    mulberry32: (seedIn) => {
      let a = seedIn >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  bus.emit('game:started');
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.ui.trackedMissionId = null;
  if (state.nav) state.nav.waypoint = null;
  const econ = Object.assign({}, economyContracts);
  econ.init({ state, bus, helpers });
  const director = Object.assign({}, encounterDirector);
  director.init({ state, bus, helpers, registry: null });
  let heatSys = null;
  if (withHeat) { heatSys = Object.assign({}, heatProto); heatSys.init({ state, bus }); }
  return { state, bus, missions, econ, director, lines };
}

const receipts = (h, name) => h.bus.emitLog.filter((e) => e.evt === name).map((e) => e.payload);
const board = (h, stationId) => ((h.state.missions.boards[stationId] || {}).slots || []);
const jobRows = (h, stationId) => board(h, stationId).filter((o) => o && o.cause
  && (o.cause.tag === DENIABLE_CAUSE_TAG || o.cause.tag === FENCE_ROUTE_CAUSE_TAG));
const thank = (h, fence) => h.bus.emit('deniable:fenceThanked', {
  schemaVersion: 1, stationId: fence.stationId,
  sectorId: FENCE_SECTOR, tick: 0,
});

test('a real expiry on a fence-route leg mutates AND settles the route once', () => {
  const h = makeHarness({ seed: 4242 });
  for (let i = 0; i < 2; i++) thank(h, SMUGGLER);
  h.bus.emit('dock:docked', { stationId: SMUGGLER.stationId });
  const offer = jobRows(h, SMUGGLER.stationId)[0];
  assert.equal(offer.cause.tag, FENCE_ROUTE_CAUSE_TAG);
  assert.ok(h.missions.acceptMission(offer.id) !== false);
  const inst = h.state.missions.active.find((m) => m.sourceOfferId === offer.id || m.id === offer.id);
  assert.ok(inst);
  assert.equal(fenceRowOf(h.state, SMUGGLER.id).route.status, 'running');
  assert.equal(fenceRowOf(h.state, SMUGGLER.id).route.missionId, inst.id);

  const expiredPayloadsBefore = receipts(h, 'mission:expired').length;
  // The REAL path: _expireMission runs _mutateInsteadOfFail first.
  h.missions._expireMission(inst, 0);
  const expired = receipts(h, 'mission:expired');
  assert.equal(expired.length, expiredPayloadsBefore + 1);
  const payload = expired[expired.length - 1];
  // The real deadline path refiles the leg as a restitution successor — the event
  // carries the pointer. The settle must still land on the leg that actually lapsed.
  assert.equal(payload.mutationTag, 'restitution');
  const successor = h.state.missions.active.find((m) => m.id === payload.mutatedToMissionId);
  assert.ok(successor, 'a live restitution successor posted on the expiry');

  const row = fenceRowOf(h.state, SMUGGLER.id);
  assert.equal(row.route, null, 'route cleared exactly once');
  assert.equal(row.jobsLost, 1);
  assert.equal(row.lastOutcome, 'lost');
  // If a successor posted, it must not re-key the route or match the clause ledger.
  if (successor) {
    assert.notEqual(successor.cause && successor.cause.tag, FENCE_ROUTE_CAUSE_TAG);
    h.bus.emit('mission:completed', { missionId: successor.id });
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).route, null, 'successor completion never re-opens the route');
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).jobsLost, 1);
  }
});

test('a real expiry on a deniable job with a fired snare emboldens once; the successor gets no clause', () => {
  const h = makeHarness({ seed: 4242, heat: 0.2, withHeat: false });
  h.bus.emit('dock:docked', { stationId: FENCE });
  const offer = jobRows(h, FENCE).filter((o) => o.cause.tag === DENIABLE_CAUSE_TAG)[0];
  assert.ok(offer, 'a deniable offer boarded');
  assert.ok(h.missions.acceptMission(offer.id) !== false);
  const inst = h.state.missions.active.find((m) => m.sourceOfferId === offer.id);
  const row = h.state.encounterDirector.stats.deniableClauses[inst.id];
  assert.ok(row);
  row.hit = true;
  row.fired = true;

  h.missions._expireMission(inst, 0);
  const expired = receipts(h, 'mission:expired');
  const payload = expired[expired.length - 1];
  assert.equal(payload.mutationTag, 'restitution');
  const successor = h.state.missions.active.find((m) => m.id === payload.mutatedToMissionId);
  assert.ok(successor, 'a live restitution successor posted on the expiry');

  const bold = receipts(h, 'deniable:fenceEmboldened');
  assert.equal(bold.length, 1, 'exactly one emboldened receipt even with a mutation successor live');
  const seeds = deniableSeedsOf(h.state);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].beat, 'emboldened');
  if (successor) {
    assert.notEqual(successor.cause && successor.cause.tag, DENIABLE_CAUSE_TAG);
    assert.equal(h.state.encounterDirector.stats.deniableClauses[successor.id], undefined,
      'the successor never carries a clause row');
  }
});
