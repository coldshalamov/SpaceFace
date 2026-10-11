// THE WORLD ANSWERS — C11 heat × contracts.
//
// WANTED at an outlaw-friendly dock → the board offers a double-pay deniable job whose ambush
// clause is REAL: rolled once at accept (state.rng, chance 0.6 at heat level 1 → 1.0 at level 5),
// then staked out at the drop through the director's authored-encounter seam.
//
//   node --test test/world-answers-c11-deniable-jobs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DENIABLE_AMBUSH_CLAUSE,
  DENIABLE_CAUSE_TAG,
  DENIABLE_PAY_SCALE,
  deniableAmbushChance,
  selectEconContract,
  isCalmField,
} from '../src/data/economyContractTemplates.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { quoteMissionEconomics } from '../src/economy/economyMissionTerms.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';

const BLACKMARKET_STATION = 'station_smuggler'; // sector_pallas_drift · faction_quiet · type blackmarket
const BLACKMARKET_SECTOR = 'sector_pallas_drift';

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

function makeHarness({ seed = 4242, heat = 0.5, sectorId = BLACKMARKET_SECTOR } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = heat;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.world = state.world || {};
  state.world.currentSectorId = sectorId;
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
  bus.on('economy:grantCredits', (p) => { state.player.credits += Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  bus.on('economy:chargeCredits', (p) => { state.player.credits -= Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  const helpers = {
    voice: { say: () => true },
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
  return { state, bus, missions, econ, director, helpers };
}

function accept(h, offerId) {
  const ok = h.missions.acceptMission(offerId);
  if (!ok) {
    const toast = h.bus.emitLog.filter((e) => e.evt === 'toast').map((e) => e.payload && e.payload.text).pop();
    assert.fail(`accept refused: ${toast}`);
  }
  return ok;
}

function deniableRows(h, stationId) {
  const board = h.state.missions.boards && h.state.missions.boards[stationId];
  return ((board && board.slots) || []).filter((o) => o && o.cause && o.cause.tag === DENIABLE_CAUSE_TAG);
}

test('selectEconContract stays backward compatible: no ctx → no deniable template; calm stays calm', () => {
  const calm = {
    danger: 0.2, pricePressure: 0, trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
  };
  assert.equal(selectEconContract(calm), null);
  assert.equal(isCalmField(calm), true);
  assert.equal(selectEconContract(calm, { wanted: false, outlawFriendly: true }), null);
  assert.equal(selectEconContract(calm, { wanted: true, outlawFriendly: false }), null);
  const picked = selectEconContract(calm, { wanted: true, outlawFriendly: true, heatLevel: 3, blackmarket: true });
  assert.ok(picked && picked.template.key === 'deniable_job');
  // The deniable job also fires over a missing field signal (contextual template).
  assert.equal(selectEconContract(null, { wanted: true, outlawFriendly: true, heatLevel: 1 }).template.key, 'deniable_job');
  assert.equal(selectEconContract(null), null);
});

test('ambush chance rises 0.6 → 1.0 with the heat level', () => {
  assert.equal(deniableAmbushChance(1), 0.6);
  assert.ok(Math.abs(deniableAmbushChance(3) - 0.8) < 1e-9);
  assert.equal(deniableAmbushChance(5), 1);
  assert.equal(deniableAmbushChance(0), 0.6, 'clamps to the floor');
  assert.equal(deniableAmbushChance(99), 1, 'clamps to the ceiling');
});

test('WANTED at a blackmarket dock → one deniable offer at ~2x the lawful pay with the clause printed', () => {
  const h = makeHarness({ seed: 4242, heat: 0.5 });
  h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  const rows = deniableRows(h, BLACKMARKET_STATION);
  assert.equal(rows.length, 1, 'exactly one deniable row boards');
  const offer = rows[0];
  assert.equal(offer.source, 'economyContract');
  assert.equal(offer.type, 'cargo_delivery', 'a shipped missions.js type — the accept path is unchanged');
  assert.ok(offer.cause.line.includes(DENIABLE_AMBUSH_CLAUSE));
  assert.equal(offer.brief, DENIABLE_AMBUSH_CLAUSE);
  assert.equal(offer.cause.deniable.payScale, DENIABLE_PAY_SCALE);

  // The lawful equivalent: the same run, same params, quoted by the canonical pricer.
  const dest = SECTORS.find((s) => s.id === offer.destSectorId);
  assert.ok(dest, 'destination sector is real');
  const lawful = quoteMissionEconomics({
    type: 'cargo_delivery', tier: offer.economyTerms.tier, riskTier: offer.riskTier,
    distance: offer.distance, params: offer.params, preloadedCargo: true, fieldPressure: 0,
  });
  assert.equal(offer.economyTerms.lawfulRewardCr, lawful.rewardCr, 'baseline is the real lawful quote');
  assert.equal(offer.reward_cr, Math.ceil(lawful.rewardCr * 2));
  const ratio = offer.reward_cr / lawful.rewardCr;
  assert.ok(ratio >= 2 && ratio < 2.01, `~2x pay (got ${ratio})`);
  assert.equal(offer.economyTerms.rewardCr, offer.reward_cr, 'the terms the card reads stay honest');
  assert.equal(offer.cause.deniable.wantedLevel, 3);
  assert.equal(offer.cause.deniable.ambushChance, deniableAmbushChance(3));
});

test('not wanted, or wanted at a lawful dock → no deniable offer', () => {
  const clean = makeHarness({ seed: 4242, heat: 0 });
  clean.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  assert.equal(deniableRows(clean, BLACKMARKET_STATION).length, 0);
  assert.equal(clean.bus.emitLog.filter((e) => e.evt === 'mission:offered'
    && e.payload && e.payload.cause && e.payload.cause.tag === DENIABLE_CAUSE_TAG).length, 0);

  const lawful = makeHarness({ seed: 4242, heat: 0.7, sectorId: 'sector_helios_prime' });
  lawful.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(deniableRows(lawful, 'station_helios').length, 0, 'Concord space does not fence for a fugitive');
});

test('a crime AFTER a calm dock in the same epoch still reaches the fence; re-dock does not duplicate', () => {
  const h = makeHarness({ seed: 4242, heat: 0 });
  h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  assert.equal(deniableRows(h, BLACKMARKET_STATION).length, 0);
  h.state.player.heat = 0.5;
  h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  assert.equal(deniableRows(h, BLACKMARKET_STATION).length, 1);
});

test('same seed twice → same offer and the same ambush verdict at accept (seed 4242)', () => {
  const run = () => {
    const h = makeHarness({ seed: 4242, heat: 0.5 });
    h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
    const offer = deniableRows(h, BLACKMARKET_STATION)[0];
    assert.ok(offer, 'deniable offer boarded');
    const creditsBefore = h.state.player.credits;
    accept(h, offer.id); // the unchanged accept path takes it
    assert.equal(h.state.player.credits, creditsBefore, 'accept moves no credits (deniable pays on delivery)');
    const inst = h.state.missions.active.find((m) => m.sourceOfferId === offer.id);
    assert.ok(inst, 'accepted instance is live');
    assert.equal(inst.reward_cr, offer.reward_cr, 'pay passes through the existing accept path unchanged');
    const ledger = h.state.encounterDirector.stats.deniableClauses;
    assert.ok(ledger && ledger[inst.id], 'the director decided the clause at accept');
    return { offer, row: { ...ledger[inst.id] }, ledger, h, inst };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.row, b.row, 'same seed ⇒ same decision, bit for bit');
  assert.deepEqual(a.offer, b.offer);
  assert.equal(a.row.level, 3);
  assert.equal(a.row.chance, deniableAmbushChance(3));
  assert.equal(a.row.hit, a.row.roll < a.row.chance);
  assert.equal(a.row.sectorId, a.offer.destSectorId);
  assert.equal(a.row.stationId, a.offer.destStationId);

  // Decided ONCE: a duplicate accepted event never re-rolls.
  a.h.bus.emit('mission:accepted', { missionId: a.inst.id });
  assert.deepEqual(a.h.state.encounterDirector.stats.deniableClauses[a.inst.id], a.row);

  // Another seed decides from its own stream (different roll).
  const other = makeHarness({ seed: 7, heat: 0.5 });
  other.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
  const otherOffer = deniableRows(other, BLACKMARKET_STATION)[0];
  accept(other, otherOffer.id);
  const otherRow = Object.values(other.state.encounterDirector.stats.deniableClauses)[0];
  assert.notEqual(otherRow.roll, a.row.roll);
});

test('top heat tier always stakes out the drop (chance 1.0); the verdict is state.rng once', () => {
  for (const seed of [1, 2, 3, 4242, 99]) {
    const h = makeHarness({ seed, heat: 1 });
    h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
    const offer = deniableRows(h, BLACKMARKET_STATION)[0];
    assert.ok(offer, `seed ${seed}: offer`);
    accept(h, offer.id);
    const row = Object.values(h.state.encounterDirector.stats.deniableClauses)[0];
    assert.equal(row.level, 5);
    assert.equal(row.chance, 1);
    assert.equal(row.hit, true, `seed ${seed}: level 5 is a certain ambush`);
  }
});

test('the clause is real: a hit seeds a live ambush_snare at the destination drop, once', () => {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const { state, bus } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  const DEST_SECTOR = 'sector_ceres_belt';
  const DEST_STATION = 'station_ceres';
  state.world.currentSectorId = DEST_SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.player.heat = 1; // level 5 → chance 1.0
  state.missions.active.push({
    id: 'm_deniable_1', type: 'cargo_delivery', status: 'active', source: 'economyContract',
    destStationId: DEST_STATION, destSectorId: DEST_SECTOR,
    cause: { tag: DENIABLE_CAUSE_TAG, axis: 'heat', line: 'x' },
  });
  const fired = [];
  bus.on('ambush:clauseFired', (p) => fired.push(p));
  bus.emit('mission:accepted', { missionId: 'm_deniable_1' });
  const dir = state.encounterDirector;
  const row = dir.stats.deniableClauses.m_deniable_1;
  assert.equal(row.hit, true);

  const drop = director._deniableDropPoint(row);
  assert.ok(drop && Number.isFinite(drop.x) && Number.isFinite(drop.z));

  // Far from the drop: staked out but quiet.
  player.pos.x = drop.x + 9000; player.pos.z = drop.z;
  state.simTime = 20;
  director.update(1, state);
  assert.equal(dir.live['deniable:m_deniable_1'], undefined);
  assert.equal(row.armedAt, null);

  // Fly up to the drop: arms, then springs after the breath.
  player.pos.x = drop.x + 900; player.pos.z = drop.z;
  state.simTime = 40;
  director.update(1, state);
  assert.equal(typeof row.armedAt, 'number', 'armed on approach');
  state.simTime = 40 + 7;
  director.update(1, state);
  const live = dir.live['deniable:m_deniable_1'];
  assert.ok(live, 'the ambush is a live encounter at the destination');
  assert.equal(live.shapeId, 'ambush_snare');
  assert.equal(live.sectorId, DEST_SECTOR);
  assert.equal(row.fired, true);
  assert.equal(fired.length, 1);

  // Once: further ticks never re-request.
  state.simTime = 80;
  director.update(1, state);
  assert.equal(fired.length, 1);
});

test('a missed roll (or a finished job) never springs an ambush; the clause retires with the mission', () => {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const { state, bus } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.player.heat = 0.2; // level 1
  state.missions.active.push({
    id: 'm_deniable_2', type: 'cargo_delivery', status: 'active', source: 'economyContract',
    destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
    cause: { tag: DENIABLE_CAUSE_TAG, axis: 'heat', line: 'x' },
  });
  bus.emit('mission:accepted', { missionId: 'm_deniable_2' });
  const dir = state.encounterDirector;
  const row = dir.stats.deniableClauses.m_deniable_2;
  row.hit = false; // force the miss; the tick must respect it
  const drop = director._deniableDropPoint(row);
  player.pos.x = drop.x; player.pos.z = drop.z;
  state.simTime = 50;
  director.update(1, state);
  state.simTime = 70;
  director.update(1, state);
  assert.equal(dir.live['deniable:m_deniable_2'], undefined);

  // Mission leaves the active list → ledger row retires.
  state.missions.active.length = 0;
  state.simTime = 90;
  director.update(1, state);
  assert.equal(dir.stats.deniableClauses.m_deniable_2, undefined);
});

test('an ordinary accepted mission is never touched by the clause listener', () => {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const { state, bus } = sim;
  state.missions.active.push({ id: 'm_plain', type: 'cargo_delivery', status: 'active', cause: { tag: 'route_scarcity' } });
  bus.emit('mission:accepted', { missionId: 'm_plain' });
  bus.emit('mission:accepted', { missionId: 'm_nope' });
  assert.equal(state.encounterDirector.stats.deniableClauses, undefined);
});
