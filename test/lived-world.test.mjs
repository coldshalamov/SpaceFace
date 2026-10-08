import assert from 'node:assert/strict';
import test from 'node:test';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { pickLaneErrand, armLaneErrands, applyLaneErrandIntent, LANE_ERRANDS, laneContractOwns } from '../src/systems/laneErrands.js';
import { livedNextAtFor } from '../src/systems/livedWorldDirector.js';
import { advance, createJob } from '../src/systems/npcJobs.js';

test('lived vignettes stay out of the seeded day planner', () => {
  const lived = Object.values(ENCOUNTERS).filter((enc) => enc.livedVignette === true);
  assert.ok(lived.length >= 100, `expected a thick lived catalog, got ${lived.length}`);
  const ids = new Set(lived.map((enc) => enc.id));
  for (const enc of lived) {
    assert.equal(enc.gates.externalOnly, true, enc.id);
    assert.equal(enc.pressureCost, 6, enc.id);
    assert.equal(enc.script, 'selfRegistered');
    assert.equal(enc.fallbackScript, 'whisper');
    assert.equal(enc.deck, 'civilian');
    assert.ok(enc.primaryLine && enc.primaryLine.length > 12, enc.id);
  }
  const sectors = ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_sker_haven', 'sector_veil_nebula'];
  for (const sectorId of sectors) {
    const zones = zonesForSector(sectorId);
    for (let day = 0; day < 3; day++) {
      for (const seed of [1, 7, 47, 1234]) {
        for (const item of planEncounters(seed, sectorId, day, zones)) {
          assert.equal(ids.has(item.shapeId), false, `${item.shapeId} leaked into ${sectorId}`);
        }
      }
    }
  }
});

test('a vignette hails, offers, and resolves without writing credits itself', () => {
  const spec = {
    id: 'unit_kettle',
    title: 'KETTLE',
    factionId: 'faction_free',
    start: 'spawn',
    cast: [{ role: 'hull_0', archetype: 'mule_trader', dx: 0, dz: 0, scanLabel: 'BRACK' }],
    choices: [
      { id: 'a', label: 'Mug', playerLine: 'Mug.' },
      { id: 'c', label: 'Leave', playerLine: 'Leaving.' },
    ],
    timeoutChoice: 'c',
    phases: [
      { id: 'spawn', verb: 'spawn', next: 'hail' },
      { id: 'hail', verb: 'say', line: 'BRACK: Kettle is on.', channel: 'info', primary: true, next: 'offer' },
      { id: 'offer', verb: 'offer', windowS: 10, motion: 'hold', onChoice: { a: 'pay', c: 'done_c' } },
      { id: 'pay', verb: 'grant', amount: 36, reason: 'unit_kettle', next: 'done_a' },
      { id: 'done_a', verb: 'resolve', outcome: 'a' },
      { id: 'done_c', verb: 'resolve', outcome: 'c' },
    ],
  };
  const runtime = compileVignette(spec);
  const said = [];
  const granted = [];
  const resolved = [];
  const live = {
    id: 'L1', shapeId: spec.id, vars: {}, ids: [], roles: {},
    anchor: { x: 0, z: 0 }, phase: 'telegraph',
    shape: { choices: spec.choices, timeoutChoice: 'c', title: spec.title },
  };
  const state = { encounterDirector: { stats: {} }, entities: new Map() };
  const d = {
    now: () => 100,
    player: () => ({ pos: { x: 30, z: 10 } }),
    say(_l, _c, text) { said.push(text); },
    offerChoices() {},
    spawnShips(row, ships) {
      const id = 7;
      state.entities.set(id, { id, alive: true, pos: { ...ships[0].pos }, rot: 0, data: {} });
      row.ids.push(id);
      row.roles[id] = ships[0].role;
      return [id];
    },
    entsOf: (row) => row.ids.map((id) => state.entities.get(id)).filter(Boolean),
    resolve(_l, outcome) { resolved.push(outcome); },
    abort(_l, reason) { throw new Error(`abort ${reason}`); },
    grant(amount) { granted.push(amount); },
    rep() {},
  };
  runtime.fire(d, live, state);
  assert.equal(said[0], 'BRACK: Kettle is on.');
  assert.equal(live.phase, 'offer');
  runtime.tick(d, live, state, 104);
  assert.equal(resolved.length, 0);
  runtime.choose(d, live, state, 'a');
  assert.deepEqual(granted, [36]);
  assert.deepEqual(resolved, ['a']);
  assert.equal(state.encounterDirector.stats.livedSeen.unit_kettle, 'a');
  assert.equal(state.player, undefined);
});

test('lane errands are deterministic and do not freeze the job clock', () => {
  const first = pickLaneErrand(9, 'wr_hauler', 3, 'hauler', true);
  const second = pickLaneErrand(9, 'wr_hauler', 3, 'hauler', true);
  assert.equal(first.id, second.id);
  assert.ok(LANE_ERRANDS.length >= 24);
  const job = createJob({
    id: 'job_hauler_test',
    kind: 'hauler',
    route: [
      { id: 'a', pos: { x: 0, z: 0 } },
      { id: 'b', pos: { x: 400, z: 0 } },
    ],
  });
  const before = job.simTime;
  const runtime = {
    state: {
      mode: 'flight',
      meta: { seed: 9 },
      simTime: 10,
      playerId: 1,
      entities: new Map([
        [1, { id: 1, alive: true, pos: { x: 20, z: 0 } }],
        [2, { id: 2, alive: true, pos: { x: 30, z: 4 }, rot: 0, data: {} }],
      ]),
    },
    bus: { emit() {} },
    _byId() { return { job_1: entry }; },
    _writeIntent() {},
  };
  const entry = {
    job,
    worldRecordId: 'wr_hauler',
    entityId: 2,
    control: null,
  };
  armLaneErrands(runtime, 10);
  advance(job, 2);
  assert.ok(job.simTime > before, 'errand arming must not be what advances the clock, and advance still runs');
  assert.equal(entry.job.phase === 'flee', false);
});

test('lane errands yield flee, formation, and a tug on a booked load', () => {
  const hull = { id: 2, alive: true, pos: { x: 30, z: 4 }, rot: 0, data: {} };
  const job = createJob({
    id: 'job_yield',
    kind: 'hauler',
    route: [
      { id: 'a', pos: { x: 0, z: 0 } },
      { id: 'b', pos: { x: 400, z: 0 } },
    ],
  });
  job.phase = 'flee';
  const entry = { job, worldRecordId: 'wr_yield', entityId: 2, control: null, errand: {
    id: 'kettle_pause', motion: 'brake', until: 99, line: 'hold', said: false, origin: { x: 0, z: 0 }, started: 1,
  } };
  const writes = [];
  const runtime = {
    state: {
      mode: 'flight',
      meta: { seed: 9 },
      simTime: 12,
      playerId: 1,
      entities: new Map([
        [1, { id: 1, alive: true, pos: { x: 20, z: 0 } }],
        [2, hull],
      ]),
    },
    bus: { emit() {} },
    _byId() { return { job_1: entry }; },
    _writeIntent(...args) { writes.push(args); },
  };
  assert.equal(laneContractOwns(entry, hull, 12), true);
  assert.equal(applyLaneErrandIntent(runtime, entry, hull, 12), false);
  assert.equal(entry.errand, null);
  assert.equal(writes.length, 0);
  job.phase = 'transit';
  hull.data.activityActorSlotId = 'ceres_ambush_escort';
  armLaneErrands(runtime, 12);
  assert.equal(entry.errand, null);
  hull.data.activityActorSlotId = null;
  hull.data.trafficRole = 'tug';
  hull.data.towTargetId = 44;
  armLaneErrands(runtime, 84);
  assert.equal(entry.errand, null);
});

test('a failed lived fire waits out two ambient gaps before asking again', () => {
  assert.equal(livedNextAtFor(100, 100, true), 190);
  assert.equal(livedNextAtFor(100, 100, false), 130);
  assert.equal(livedNextAtFor(100, 40, false), 115);
});
