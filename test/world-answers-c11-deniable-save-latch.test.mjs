// THE WORLD ANSWERS — C11 deniable job, save/load latch.
//
// The per-station-epoch deniable latch is an instance field. A Continue boots a fresh
// economyContracts, so the latch is empty even though the board was saved. Re-docking at the
// same station in the same epoch must not post a second deniable row.
//
//   node --test test/world-answers-c11-deniable-save-latch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { DENIABLE_CAUSE_TAG } from '../src/data/economyContractTemplates.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { isPlayerWanted } from '../src/systems/heat.js';
import { createGameState } from '../src/core/gameState.js';

const BLACKMARKET_STATION = 'station_smuggler'; // sector_pallas_drift · faction_quiet · type blackmarket
const BLACKMARKET_SECTOR = 'sector_pallas_drift';
const SEEDS = [4242, 8008];

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
  const economy = Object.assign({}, economyProto);
  economy.init({ state, bus, helpers, registry: { get: () => null } });
  const econ = Object.assign({}, economyContracts);
  econ.init({ state, bus, helpers });
  const director = Object.assign({}, encounterDirector);
  director.init({ state, bus, helpers, registry: null });
  return { state, bus, missions, economy, econ, director, helpers };
}

function deniableRows(h, stationId) {
  const board = h.state.missions.boards && h.state.missions.boards[stationId];
  return ((board && board.slots) || []).filter((o) => o && o.cause && o.cause.tag === DENIABLE_CAUSE_TAG);
}

function cloneSave(value) {
  return structuredClone(value);
}

test('a deniable offer survives save/load and a same-epoch re-dock posts no second row', () => {
  for (const seed of SEEDS) {
    const h = makeHarness({ seed, heat: 0.5 });
    assert.equal(isPlayerWanted(h.state), true, `seed ${seed}: the pilot is WANTED`);
    h.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
    const before = deniableRows(h, BLACKMARKET_STATION);
    assert.equal(before.length, 1, `seed ${seed}: one deniable offer before save`);
    const offerId = before[0].id;
    const simTime = h.state.simTime;

    const saved = {
      economyContracts: cloneSave(h.econ.serialize()),
      missions: cloneSave(h.missions.serialize()),
      economy: cloneSave(h.economy.serialize()),
    };
    assert.equal(Object.hasOwn(saved.economyContracts, 'deniableLatch'), false,
      'the in-memory deniable latch is not a save key');

    // Fresh systems, same seed. Heat is player state (not one of these three blobs); Continue
    // restores it with the pilot, so the reloaded harness is WANTED the same way.
    const h2 = makeHarness({ seed, heat: 0.5 });
    h2.missions.deserialize(saved.missions);
    h2.econ.deserialize(saved.economyContracts);
    h2.economy.deserialize(saved.economy);
    h2.state.simTime = simTime;
    h2.state.player.heat = 0.5;
    h2.state.world.currentSectorId = BLACKMARKET_SECTOR;
    assert.equal(isPlayerWanted(h2.state), true, `seed ${seed}: Continue is still WANTED`);
    assert.equal(h2.state.simTime, simTime);

    const latchKey = `${BLACKMARKET_STATION}:${h2.econ._epoch()}`;
    assert.equal(h2.econ._deniableLatch.has(latchKey), false,
      `seed ${seed}: the fresh system does not remember the epoch latch`);
    assert.equal(deniableRows(h2, BLACKMARKET_STATION).length, 1,
      `seed ${seed}: the restored board still carries the offer`);

    h2.bus.emit('dock:docked', { stationId: BLACKMARKET_STATION });
    const after = deniableRows(h2, BLACKMARKET_STATION);
    assert.deepEqual(after.map((row) => row.id), [offerId],
      `seed ${seed}: re-dock must not post a second deniable offer (got ${after.map((row) => row.id).join(', ')})`);
  }
});
