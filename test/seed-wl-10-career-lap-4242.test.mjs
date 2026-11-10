// SEED-WL-10 — closing a career chain a second time names whose circuit it was.
// The first close stays the sentence the board already spoke. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { REPEATABLE_CAREER_CONTRACTS } from '../src/data/careerContracts.js';
import { careerContracts, ensureCareerContractState } from '../src/systems/careerContracts.js';

const SEED = 4242;

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
    return () => {};
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState(simTime = 0) {
  return {
    meta: { seed: SEED, playtimeS: 0 },
    seed: SEED,
    tick: 0,
    simTime,
    mode: 'flight',
    playerId: 1,
    player: { credits: 500000, cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 }, stats: {} },
    careers: { origins: { __meta: { identityReceipts: Object.fromEntries(['hauler', 'hunter', 'prospector'].map((careerId) => [careerId, {
      careerId, status: 'completed',
      lane: careerId === 'hauler' ? 'freight' : careerId === 'hunter' ? 'warrant' : 'extraction',
      verb: careerId === 'hauler' ? 'carry' : careerId === 'hunter' ? 'intercept' : 'survey',
    }])), upgradeReceipts: {} } } },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: { refreshSec: 600 } },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_scn: { rep: 500 }, faction_mts: { rep: 500 }, faction_dmc: { rep: 500 }, faction_free: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    ui: { docked: false },
    settings: { gameplay: { tutorialHints: false } },
  };
}

function popups(bus) {
  return bus.log.filter((entry) => entry.name === 'comms:popup').map((entry) => entry.payload);
}

function boardAcceptComplete(bus, stationId, missionId) {
  bus.emit('dock:docked', { stationId });
  const offer = bus.log.filter((entry) => entry.name === 'mission:offered').at(-1).payload;
  bus.emit('mission:accepted', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
  bus.emit('mission:completed', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
}

test('seed 4242: the first close is unchanged and the next close names the second circuit', () => {
  const state = baseState(0);
  const bus = new Bus();
  bus.on('mission:offered', (offer) => {
    bus.emit('mission:offerBoarded', {
      offerId: offer.id, stationId: offer.stationId, source: offer.source,
      causeFingerprint: offer.cause.fingerprint,
    });
  });
  const sys = { ...careerContracts };
  sys.init({ state, bus });
  const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_relief_circuit');

  boardAcceptComplete(bus, 'station_helios', 'm_lap_1');
  boardAcceptComplete(bus, 'station_ceres', 'm_lap_2');
  boardAcceptComplete(bus, 'station_forge', 'm_lap_3');
  const firstClose = popups(bus).at(-1);
  assert.equal(firstClose.text, `That closes ${def.title}. ${def.consequence} It reopens at Helios Station next board cycle.`);
  assert.equal(firstClose.text.includes('circuit'), false);
  assert.equal(ensureCareerContractState(state).runs[def.id].cycle, 0);
  assert.equal(ensureCareerContractState(state).runs[def.id].status, 'completed');

  // Other chains are still waiting on their first board. Hold them so the next Helios dock
  // reopens this circuit instead of posting a different contract.
  state.missions.active.push({ id: 'held', status: 'active', cause: { fingerprint: 'held' } });
  for (const run of Object.values(ensureCareerContractState(state).runs)) {
    if (run.contractId === def.id) continue;
    run.status = 'active';
    run.missionId = 'held';
    run.fingerprint = 'held';
  }

  state.simTime = 600;
  boardAcceptComplete(bus, 'station_helios', 'm_lap_4');
  boardAcceptComplete(bus, 'station_ceres', 'm_lap_5');
  boardAcceptComplete(bus, 'station_forge', 'm_lap_6');
  const secondClose = popups(bus).at(-1);
  assert.equal(
    secondClose.text,
    `That closes ${def.title} — ${def.actor.name}'s 2nd circuit. ${def.consequence} It reopens at Helios Station next board cycle.`,
  );
  assert.equal(ensureCareerContractState(state).runs[def.id].cycle, 1);
  assert.equal(ensureCareerContractState(state).runs[def.id].status, 'completed');
  sys.destroy();
});
