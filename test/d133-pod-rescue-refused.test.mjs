/**
 * D133 — a refused rescue accept must not latch the pod. survivorPod._chooseRescue used to set
 * rec.rescueSelected = true before missions ran its accept preflight; when the preflight
 * refused (destination standing lost between the offer's berth re-resolve and the choice, or
 * the offer row itself gone), the wreck card resolved on survivorPod:rescueSelected anyway —
 * no contract, a serialized latch, and the tethered prompt never came back.
 *
 * The latch now lands only when the synchronous accept actually produced a live rescue
 * mission; a refusal rolls it back and emits survivorPod:rescueBlocked so the card stays for
 * the retry. The card itself resolves on mission:accepted, not on the choice event.
 *
 * Harness shape mirrors test/bp011-wreck-failure-content.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import { survivorPod } from '../src/systems/survivorPod.js';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

function baseState() {
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
      tether: { active: false, targetId: null },
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
    entities: new Map(),
    salvage: { points: [] },
    survivorPod: { promotedByPoint: {}, promotedBySector: {}, seq: 0 },
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

function initMissions(state, bus) {
  const missionSystem = { ...missions };
  missionSystem.init({
    state,
    bus,
    helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null },
  });
  return missionSystem;
}

// The pod + its board offer, exactly the shape bp011's rescue fixture uses.
function podFixture(state) {
  const entity = {
    id: 7001, alive: true, type: 'wreck', pos: { x: 50, z: 50 },
    data: {},
  };
  state.entities.set(entity.id, entity);
  state.salvage.points.push({
    id: 'zone_derelict_01:sal9', sectorId: 'sector_helios_prime', zoneId: 'zone_derelict_01',
    pos: { x: 50, z: 50 }, entityId: entity.id, isCommunicator: true,
    wreckMissionId: 'wm_survivor_pod', offered: true,
  });
  const rec = {
    salvagePointId: 'zone_derelict_01:sal9', entityId: entity.id, sectorId: 'sector_helios_prime',
    zoneId: 'zone_derelict_01', wreckMissionId: 'wm_survivor_pod', factionId: 'faction_scn',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    oxygenStartedAt: 0, oxygenDueAt: 500, oxygenDecayWindow_s: 240,
    minRewardMultiplier: 0.45, rewardMultiplier: 1,
    stripPool: { cmdty_salvage_electronics: 2, cmdty_medical: 1 }, stripCredits: 280,
    rescueSelected: false, stripped: false,
  };
  state.survivorPod.promotedByPoint[rec.salvagePointId] = rec;
  state.survivorPod.promotedBySector[rec.sectorId] = rec;
  const offer = {
    id: 'salvage_zone_derelict_01:sal9', source: 'salvage', type: 'passenger_transport',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    factionId: 'faction_scn', title: 'The Survivor Pod', reward_cr: 750, collateral_cr: 0,
    riskTier: 1, duration_s: 2400, salvagePointId: rec.salvagePointId,
    params: { passengers: 1, cmdtyId: null, qty: 1, survivorPodId: rec.salvagePointId, salvagePointId: rec.salvagePointId },
    choice: { prompt: 'The pod is failing.', options: [{ id: 'rescue', label: 'Rescue' }, { id: 'strip', label: 'Strip' }] },
  };
  return { entity, rec, offer };
}

test('D133: a refused rescue rolls the latch back and the pod can be rescued on the retry', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  const { entity, rec, offer } = podFixture(state);
  bus.emit('mission:offered', offer);
  assert.ok(state.missions.boards.station_helios.slots.some((o) => o.id === offer.id));

  // The refusal the ledger names: between the offer's berth re-resolve and the rescue choice
  // the row is no longer there to accept — the offer never reaches a contract.
  const board = state.missions.boards.station_helios;
  board.slots = board.slots.filter((o) => o.id !== offer.id);

  state.player.tether = { active: true, targetId: entity.id };
  bus.emit('survivorPod:choose', { salvagePointId: rec.salvagePointId, optionId: 'rescue' });

  assert.equal(
    state.missions.active.some((m) => m.params && m.params.survivorPodId === rec.salvagePointId),
    false,
    'no rescue contract exists after the refused accept',
  );
  assert.equal(rec.rescueSelected, false,
    'the latch rolls back — the pod was not rescued');
  assert.equal(
    count(bus, 'survivorPod:rescueBlocked', (p) => p.reason === 'accept_refused' && p.salvagePointId === rec.salvagePointId),
    1,
    'the card is told the accept refused so it stays for the retry',
  );

  // The retry the ledger promises: the offer survives on the board, the pilot chooses rescue
  // again, and this time the contract lands.
  bus.emit('mission:offered', offer);
  bus.emit('survivorPod:choose', { salvagePointId: rec.salvagePointId, optionId: 'rescue' });
  const accepted = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(accepted, 'the retry commits the passenger mission');
  assert.equal(rec.rescueSelected, true, 'the latch lands only once a live contract exists');

  podSys.destroy && podSys.destroy();
});

test('D133: a committed rescue ignores a stray second choice — no double accept', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  const { entity, rec, offer } = podFixture(state);
  bus.emit('mission:offered', offer);
  state.player.tether = { active: true, targetId: entity.id };
  bus.emit('survivorPod:choose', { salvagePointId: rec.salvagePointId, optionId: 'rescue' });
  assert.ok(state.missions.active.some((m) => m.sourceOfferId === offer.id));
  assert.equal(rec.rescueSelected, true);

  const selections = count(bus, 'survivorPod:rescueSelected');
  bus.emit('survivorPod:choose', { salvagePointId: rec.salvagePointId, optionId: 'rescue' });
  assert.equal(count(bus, 'survivorPod:rescueSelected'), selections,
    'a latched pod emits no second rescueSelected');
  assert.equal(
    state.missions.active.filter((m) => m.params && m.params.survivorPodId === rec.salvagePointId).length,
    1,
    'still exactly one rescue contract',
  );

  podSys.destroy && podSys.destroy();
});
