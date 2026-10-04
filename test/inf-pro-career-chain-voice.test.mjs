// INF-pro — the career chain keeps its voice at settlement.
//
// Weakness found by looking (2026-10-04): a repeatable career chain went dark at the exact moments
// a player needs steering. Missions' settlement debrief is generic per mission type, and
// careerContracts emitted only machine receipts (`sectorsim:impulse`, `careerContract:consequence`)
// that no UI consumes — so nothing said where the NEXT leg posts, that a failed leg re-posts at its
// home board, or that clearing the chain moved the sector. The catalog authors all three sentences;
// this pins the settlement voice that now carries them, on seed 4242.
//
// Player-facing law under test:
//   • one `comms:popup` per settled leg, in the chain's own channel (sender = contract title);
//   • mid-chain success names the leg count and the next leg's title AND board station;
//   • failure carries the stage's authored recovery copy verbatim plus the re-post board;
//   • chain close carries the authored sector consequence and the reopen station;
//   • nothing else moves: the impulse, receipt, consequence and completed events are unchanged,
//     a double settle stays silent, and the voice is deterministic (no Math.random / Date.now).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPEATABLE_CAREER_CONTRACTS,
} from '../src/data/careerContracts.js';
import {
  careerContracts,
  ensureCareerContractState,
} from '../src/systems/careerContracts.js';

const SEED = 4242;

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn)); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function identityReceipts() {
  return Object.fromEntries(['hauler', 'hunter', 'prospector'].map((careerId) => [careerId, {
    careerId,
    status: 'completed',
    lane: careerId === 'hauler' ? 'freight' : careerId === 'hunter' ? 'warrant' : 'extraction',
    verb: careerId === 'hauler' ? 'carry' : careerId === 'hunter' ? 'intercept' : 'survey',
  }]));
}

function baseState({ seed = SEED, simTime = 0 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime,
    mode: 'flight',
    playerId: 1,
    player: { credits: 500000, cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 }, stats: {} },
    careers: { origins: { __meta: { identityReceipts: identityReceipts(), upgradeReceipts: {} } } },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: { refreshSec: 600 } },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {
      faction_scn: { rep: 500 }, faction_mts: { rep: 500 }, faction_dmc: { rep: 500 }, faction_free: { rep: 500 },
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in career contract settlement voice'); };
  Date.now = () => { throw new Error('Date.now forbidden in career contract settlement voice'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

function popups(bus) {
  return bus.log.filter((entry) => entry.name === 'comms:popup').map((entry) => entry.payload);
}

/** The missions system boards an offered slot synchronously on the live route; mirror that here,
 *  because `_offerAtStation` drops the pending mapping unless the run turns OFFERED during the
 *  `mission:offered` emit. */
function autoBoard(bus) {
  bus.on('mission:offered', (offer) => {
    bus.emit('mission:offerBoarded', {
      offerId: offer.id, stationId: offer.stationId, source: offer.source,
      causeFingerprint: offer.cause.fingerprint,
    });
  });
}

function boardAcceptComplete(bus, stationId, missionId, outcome) {
  bus.emit('dock:docked', { stationId });
  const offer = bus.log.filter((entry) => entry.name === 'mission:offered').at(-1).payload;
  bus.emit('mission:accepted', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
  bus.emit(outcome ? 'mission:completed' : 'mission:failed', {
    missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint,
  });
  return offer;
}

test('seed 4242: a mid-chain leg settle names the leg count, the next leg, and its board station', () => guarded(() => {
  const state = baseState();
  const bus = new Bus();
  const sys = { ...careerContracts };
  sys.init({ state, bus });
  autoBoard(bus);

  const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_relief_circuit');
  boardAcceptComplete(bus, 'station_helios', 'm_voice_1', true);

  const lines = popups(bus);
  assert.equal(lines.length, 1, 'exactly one settlement voice line per settled leg');
  const line = lines[0];
  assert.equal(line.sender, def.title, 'the chain speaks in its own channel, not a raw id');
  assert.equal(line.category, 'personal');
  assert.equal(line.factionId, def.actor.factionId, 'the comms trace takes the actor faction');
  assert.match(line.text, /Leg 1\/3 of The Three-Port Relief Circuit cleared\./);
  assert.match(line.text, /Carry the Forge Fuel Allotment — posts at Ceres Refinery\./,
    'the sentence names the next leg and the authored place it posts');

  // The rest of the settlement contract is untouched by the voice.
  assert.equal(eventCount(bus, 'sectorsim:impulse'), 1);
  assert.equal(eventCount(bus, 'careerContract:consequence'), 1);
  assert.equal(eventCount(bus, 'careerContract:completed'), 0);
  const run = ensureCareerContractState(state).runs[def.id];
  assert.equal(run.status, 'ready');
  assert.equal(run.stageIndex, 1);
  sys.destroy();
}));

test('seed 4242: a failed leg carries the authored recovery copy verbatim and names the re-post board', () => guarded(() => {
  const state = baseState();
  const bus = new Bus();
  const sys = { ...careerContracts };
  sys.init({ state, bus });
  autoBoard(bus);

  const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_wreck_reclamation');
  const stage = def.stages[0];
  boardAcceptComplete(bus, 'station_reach', 'm_voice_fail', false);

  const lines = popups(bus);
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.equal(line.sender, def.title);
  assert.equal(line.category, 'trap', 'a failure lands in the alert lane, like the debrief it follows');
  assert.ok(line.text.startsWith(stage.recoveryText),
    'the catalog authored a recovery sentence for this exact moment — it renders verbatim');
  assert.match(line.text, /The failed leg re-posts at Reach Station\./);
  const run = ensureCareerContractState(state).runs[def.id];
  assert.equal(run.status, 'recovering');
  assert.equal(run.attempt, 1);
  sys.destroy();
}));

test('seed 4242: closing the chain speaks the authored sector consequence once and stays silent on a double settle', () => guarded(() => {
  const state = baseState();
  const bus = new Bus();
  const sys = { ...careerContracts };
  sys.init({ state, bus });
  autoBoard(bus);

  const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_relief_circuit');
  boardAcceptComplete(bus, 'station_helios', 'm_voice_s1', true);
  boardAcceptComplete(bus, 'station_ceres', 'm_voice_s2', true);
  boardAcceptComplete(bus, 'station_forge', 'm_voice_s3', true);
  // A duplicate settle event for the same mission must not speak twice.
  bus.emit('mission:completed', { missionId: 'm_voice_s3', source: 'careerContract', causeFingerprint: 'unknown' });

  const lines = popups(bus);
  assert.equal(lines.length, 3, 'one voice line per leg, none duplicated');
  const close = lines[2];
  assert.equal(close.sender, def.title);
  assert.equal(close.category, 'personal');
  assert.ok(close.text.startsWith(`That closes ${def.title}.`),
    'the close names the chain before anything else');
  assert.ok(close.text.includes(def.consequence),
    'the sector consequence the impulse actually applies is said aloud');
  assert.match(close.text, /It reopens at Helios Station next board cycle\./);
  assert.equal(eventCount(bus, 'careerContract:completed'), 1);
  assert.equal(eventCount(bus, 'sectorsim:impulse'), 3);
  const run = ensureCareerContractState(state).runs[def.id];
  assert.equal(run.status, 'completed');
  sys.destroy();
}));

function eventCount(bus, name) {
  return bus.log.filter((entry) => entry.name === name).length;
}
