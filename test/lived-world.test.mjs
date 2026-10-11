import assert from 'node:assert/strict';
import test from 'node:test';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { SECTORS } from '../src/data/sectors.js';
import { LIVED_SECTOR_OVERLAYS, livedOverlayFor } from '../src/data/livedSectorOverlays.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { pickLaneErrand, armLaneErrands, applyLaneErrandIntent, LANE_ERRANDS, laneContractOwns } from '../src/systems/laneErrands.js';
import { livedNextAtFor, pickLivedVignette } from '../src/systems/livedWorldDirector.js';
import { advance, createJob } from '../src/systems/npcJobs.js';

const LIVED_SITUATIONS = [
  'toll', 'patrol', 'hunt', 'distress', 'salvage', 'trade', 'convoy', 'claim',
  'anomaly', 'wreck', 'yard', 'archive', 'escort', 'puzzle', 'wake',
];
const LIVED_PLACES = [
  'civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint',
  'refinery_approach', 'mining_belt', 'colony', 'derelict_field',
  'outlaw_zone', 'radiation_field', 'nebula_fog', 'ambush_lane',
  'anomaly_deep', 'planetary_mass',
];

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

test('generated lived vignettes cover situations and configured places evenly', () => {
  const generated = Object.values(ENCOUNTERS).filter((enc) => (
    enc.livedVignette === true && enc.id.startsWith('lived_')
  ));
  const counts = new Map(LIVED_SITUATIONS.map((situation) => [situation, 0]));
  for (const enc of generated) {
    assert.ok(counts.has(enc.shape.situation), `${enc.id} has unknown situation ${enc.shape.situation}`);
    counts.set(enc.shape.situation, counts.get(enc.shape.situation) + 1);
  }
  assert.equal(generated.length, 176);
  for (const [situation, count] of counts) {
    assert.ok(count >= 6, `${situation} appears only ${count} times`);
    assert.ok(count / generated.length <= 0.15, `${situation} appears in ${count}/${generated.length}`);
  }
  const places = new Set(generated.map((enc) => enc.shape.place));
  for (const place of LIVED_PLACES) assert.ok(places.has(place), `missing generated place ${place}`);
});

test('every sector has a frozen six-line lived overlay with unique lines', () => {
  assert.ok(Object.isFrozen(LIVED_SECTOR_OVERLAYS));
  assert.equal(Object.keys(LIVED_SECTOR_OVERLAYS).length, SECTORS.length);
  const allLines = [];
  for (const sector of SECTORS) {
    const overlay = livedOverlayFor(sector.id);
    assert.ok(overlay, `missing lived overlay for ${sector.id}`);
    assert.equal(overlay.sectorId, sector.id);
    assert.ok(overlay.crew);
    assert.ok(Object.isFrozen(overlay));
    assert.ok(Object.isFrozen(overlay.situations));
    assert.ok(Object.isFrozen(overlay.lines));
    assert.equal(overlay.lines.length, 6, sector.id);
    for (const situation of overlay.situations) {
      assert.ok(LIVED_SITUATIONS.includes(situation), `${sector.id} has unknown situation ${situation}`);
    }
    allLines.push(...overlay.lines);
  }
  assert.equal(new Set(allLines).size, allLines.length, 'overlay lines must be unique across sectors');
  assert.equal(livedOverlayFor('sector_missing'), null);
  assert.equal(livedOverlayFor('toString'), null);
});

test('lived overlay selection is deterministic and prefers matching authored candidates', () => {
  const overlay = livedOverlayFor('sector_sker_haven');
  const candidates = [
    { id: 'authored_trade', shape: { situation: 'trade' } },
    { id: 'authored_anomaly', shape: { situation: 'anomaly' } },
    { id: 'lived_toll', shape: { situation: 'toll' } },
  ];
  const args = { candidates, overlay, seed: 47, sectorId: overlay.sectorId, zoneKey: 'trade_lane', day: 2 };
  const first = pickLivedVignette(args);
  const second = pickLivedVignette(args);
  assert.equal(first.id, second.id);
  assert.equal(first.id, 'authored_trade');

  const fallback = pickLivedVignette({
    ...args,
    candidates: [
      { id: 'lived_trade', shape: { situation: 'trade' } },
      { id: 'lived_anomaly', shape: { situation: 'anomaly' } },
    ],
  });
  assert.equal(fallback.shape.situation, 'trade');
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

test('lived overlays replace only the work line and label spawned crew', () => {
  const spec = {
    id: 'unit_lived_overlay',
    title: 'GENERIC CREW',
    factionId: 'faction_free',
    start: 'spawn',
    cast: [
      { role: 'hull_0', archetype: 'mule_trader', dx: 0, dz: 0, scanLabel: 'OLD LABEL A' },
      { role: 'hull_1', archetype: 'mule_trader', dx: 4, dz: 0, scanLabel: 'OLD LABEL B' },
    ],
    phases: [
      { id: 'spawn', verb: 'spawn', next: 'work_line' },
      { id: 'work_line', verb: 'say', line: 'VOICE: Holding. This does not hurry.', channel: 'info', next: 'done' },
      { id: 'done', verb: 'resolve', outcome: 'done' },
    ],
  };
  const runtime = compileVignette(spec);

  function run(data) {
    const said = [];
    let spawned;
    const live = {
      id: 'L1',
      shapeId: spec.id,
      vars: {},
      ids: [],
      roles: {},
      anchor: { x: 0, z: 0 },
      phase: 'telegraph',
      data,
      shape: { title: spec.title },
    };
    const state = { encounterDirector: { stats: {} }, entities: new Map() };
    const d = {
      now: () => 100,
      say(_live, _channel, text) { said.push(text); },
      spawnShips(_live, ships) {
        spawned = ships;
        return ships.map((_ship, index) => index + 1);
      },
      resolve() {},
      abort(_live, reason) { throw new Error(`abort ${reason}`); },
    };
    runtime.fire(d, live, state);
    return { said, spawned };
  }

  const plain = run(undefined);
  assert.equal(plain.said[0], 'VOICE: Holding. This does not hurry.');
  assert.deepEqual(plain.spawned.map((ship) => ship.scanLabel), ['OLD LABEL A', 'OLD LABEL B']);
  const overlayLine = 'We haul through the Quarry Cathedral after the seam unloads.';
  const overlaid = run({ livedOverlay: { sectorId: 'sector_ceres_belt', crew: 'DMC SEAM CREW', line: overlayLine } });
  assert.equal(overlaid.said[0], overlayLine);
  assert.deepEqual(overlaid.spawned.map((ship) => ship.scanLabel), ['DMC SEAM CREW 1', 'DMC SEAM CREW 2']);
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
  delete hull.data.trafficRole;
  job.payload = job.payload || {};
  job.payload.freightRole = 'tug';
  armLaneErrands(runtime, 126);
  assert.equal(entry.errand, null, 'a freightRole tug on a booked load is not an errand');
});

test('a failed lived fire waits out two ambient gaps before asking again', () => {
  assert.equal(livedNextAtFor(100, 100, true), 190);
  assert.equal(livedNextAtFor(100, 100, false), 130);
  assert.equal(livedNextAtFor(100, 40, false), 115);
});
