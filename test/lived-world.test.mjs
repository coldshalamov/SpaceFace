import assert from 'node:assert/strict';
import test from 'node:test';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { SECTORS } from '../src/data/sectors.js';
import { hash32 } from '../src/core/rng.js';
import { LIVED_SECTOR_OVERLAYS, livedOverlayFor } from '../src/data/livedSectorOverlays.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { applyMotion, compileVignette } from '../src/systems/vignetteInterpreter.js';
import { pickLaneErrand, armLaneErrands, applyLaneErrandIntent, LANE_ERRANDS, laneContractOwns } from '../src/systems/laneErrands.js';
import {
  livedNextAtFor,
  livedScenePlacement,
  livedSceneRequestData,
  pickLivedVignette,
} from '../src/systems/livedWorldDirector.js';
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

function runVignetteChoice(runtime, encounter, spec, choiceId) {
  const choices = (spec && spec.choices) || encounter.choices;
  const timeoutChoice = (spec && spec.timeoutChoice) || encounter.timeoutChoice;
  const title = (spec && spec.title) || encounter.title;
  const id = (spec && spec.id) || encounter.id;
  let now = 100;
  let nextId = 1;
  const calls = { offers: [], grants: [], reps: [], resolved: [], aborts: [] };
  const state = { encounterDirector: { stats: {} }, entities: new Map() };
  const live = {
    id: `test:${id}`,
    shapeId: id,
    vars: {},
    ids: [],
    roles: {},
    anchor: { x: 0, z: 0 },
    phase: 'telegraph',
    data: { sceneAxis: { ux: 1, uz: 0 } },
    shape: { choices, timeoutChoice, title },
  };
  const d = {
    now: () => now,
    player: () => ({ pos: { x: 30, z: 10 } }),
    say() {},
    offerChoices(_live, ids, timeout, deadlineAt) {
      calls.offers.push({ ids: [...ids], timeout, deadlineAt });
    },
    spawnShips(row, ships) {
      const ids = ships.map((ship) => {
        const entityId = nextId++;
        state.entities.set(entityId, {
          id: entityId,
          type: 'ship',
          alive: true,
          pos: { ...ship.pos },
          rot: 0,
          data: {},
        });
        row.ids.push(entityId);
        row.roles[entityId] = ship.role;
        return entityId;
      });
      return ids;
    },
    spawnProp() {
      return { id: nextId++, data: {} };
    },
    entsOf(row) {
      return row.ids.map((entityId) => state.entities.get(entityId))
        .filter((entity) => entity && entity.type === 'ship');
    },
    grant(amount, reason) { calls.grants.push({ amount, reason }); },
    rep(factionId, delta, reason) { calls.reps.push({ factionId, delta, reason }); },
    resolve(row, outcome) {
      calls.resolved.push(outcome);
      row.phase = 'done';
    },
    abort(_row, reason) {
      calls.aborts.push(reason);
      throw new Error(`abort ${reason}`);
    },
  };

  runtime.fire(d, live, state);
  let steps = 0;
  while (live.phase !== 'offer' && live.phase !== 'done' && steps++ < 100) {
    assert.ok(Number.isFinite(live.deadlineAt), `${id} phase ${live.phase} has no deadline`);
    now = live.deadlineAt + 0.01;
    runtime.tick(d, live, state, now);
  }
  assert.equal(live.phase, 'offer', `${id} did not reach its offer`);
  if (choiceId === timeoutChoice) {
    now = live.deadlineAt + 0.01;
    runtime.tick(d, live, state, now);
  } else {
    runtime.choose(d, live, state, choiceId);
  }
  assert.equal(live.phase, 'done', `${id} choice ${choiceId} did not finish`);
  return { calls, spawned: live.plan.ships };
}

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

test('ambient scenes compile, use the lived trigger contract, and cover every non-Bolus sector', () => {
  const modules = ENCOUNTER_MODULES.filter((module) => module.default && module.default.ambientScene === true);
  assert.equal(modules.length, 16);
  const validMotions = new Set(['hold', 'orbit', 'creep', 'ring', 'weave', 'depart', 'face', 'chase', 'tow', 'column', 'vulture']);
  const covered = new Set();
  const noRunnerScenes = new Set(['scene_funeral_column', 'scene_pilgrim_lamp_walk', 'scene_fissure_haul_out']);
  for (const module of modules) {
    const enc = module.default;
    const spec = module.spec;
    assert.ok(spec, `${enc.id} exports its compiled source spec`);
    assert.doesNotThrow(() => compileVignette(spec), enc.id);
    assert.equal(enc.livedVignette, true, enc.id);
    assert.equal(enc.tier, 'ambient', enc.id);
    assert.equal(enc.deck, 'civilian', enc.id);
    assert.equal(enc.pressureCost, 6, enc.id);
    assert.equal(enc.script, 'selfRegistered', enc.id);
    assert.equal(enc.fallbackScript, 'whisper', enc.id);
    assert.equal(enc.gates.externalOnly, true, enc.id);
    assert.equal(enc.ambientScene, true, enc.id);
    assert.deepEqual(enc.zoneTypes, LIVED_PLACES, enc.id);
    assert.ok(Array.isArray(enc.sectorIds) && enc.sectorIds.length > 0, enc.id);
    assert.ok(Array.isArray(spec.choices), `${enc.id} spec choices are an array`);
    assert.ok(Array.isArray(enc.choices), `${enc.id} encounter choices are an array`);
    assert.ok(spec.cast.every((member) => member.scanLabel), `${enc.id} cast has role labels`);
    for (const sectorId of enc.sectorIds) covered.add(sectorId);

    const phases = new Map(spec.phases.map((phase) => [phase.id, phase]));
    const run = phases.get('run');
    const offer = phases.get('offer');
    const prop = phases.get('prop');
    assert.equal(phases.get('spawn').next, prop ? 'prop' : 'hail');
    if (prop) assert.equal(prop.next, 'hail');
    assert.ok(run && validMotions.has(run.motion), `${enc.id} uses a valid run motion`);
    assert.equal(run.verb, 'motion');
    assert.equal(run.seconds, 6);
    assert.equal(phases.get('hail').primary, true);
    assert.equal(phases.get('hail').next, 'run');
    assert.equal(phases.get('a0').next, 'offer');
    assert.equal(offer.windowS, 22);
    assert.equal(offer.motion, run.motion);
    assert.deepEqual(offer.onChoice, { a: 'say_a', b: 'say_b', c: 'say_c' });
    assert.equal(spec.timeoutChoice, 'c');
    assert.equal(phases.get('say_c').next, 'resolve_c');
    assert.equal(phases.get('resolve_c').verb, 'resolve');
    assert.equal(spec.choices.find((choice) => choice.id === 'c').id, 'c');
    assert.equal(phases.get('grant_a').amount, 30);
    assert.equal(phases.get('rep_a').factionId, enc.factionId);
    assert.equal(phases.get('rep_a').delta, 2);
    assert.equal(phases.has('rep_c'), false);
    if (noRunnerScenes.has(enc.id)) {
      assert.equal(phases.get('rep_b_authority').factionId, enc.factionId);
      assert.equal(phases.get('rep_b_authority').delta, -1);
      assert.equal(phases.has('rep_b_runner'), false);
    } else {
      assert.equal(phases.get('rep_b_runner').delta, 1);
      assert.equal(phases.get('rep_b_authority').factionId, enc.factionId);
      assert.equal(phases.get('rep_b_authority').delta, -1);
    }
  }
  assert.equal(covered.has('sector_the_bolus'), false);
  for (const sector of SECTORS) {
    if (sector.id !== 'sector_the_bolus') assert.ok(covered.has(sector.id), `no ambient scene for ${sector.id}`);
  }
});

test('every ambient vignette executes a/b choices and times out through c', () => {
  const modules = ENCOUNTER_MODULES.filter((module) => (
    module.default && module.default.ambientScene === true
  ));
  for (const module of modules) {
    const encounter = module.default;
    const spec = module.spec;
    for (const choiceId of ['a', 'b', 'c']) {
      let result;
      assert.doesNotThrow(() => {
        result = runVignetteChoice(compileVignette(spec), encounter, spec, choiceId);
      }, `${encounter.id} choice ${choiceId}`);
      assert.deepEqual(result.calls.aborts, [], encounter.id);
      assert.deepEqual(result.calls.offers[0].ids, ['a', 'b', 'c'], encounter.id);
      assert.equal(result.calls.offers[0].timeout, 'c', encounter.id);
      assert.deepEqual(result.calls.resolved, [choiceId], encounter.id);
      assert.deepEqual(
        result.spawned.map((ship) => ship.scanLabel),
        spec.cast.map((member) => member.scanLabel),
        encounter.id,
      );

      if (choiceId === 'a') {
        assert.deepEqual(result.calls.grants, [{ amount: 30, reason: spec.id }], encounter.id);
        assert.deepEqual(result.calls.reps, [{
          factionId: spec.factionId,
          delta: 2,
          reason: spec.id,
        }], encounter.id);
      } else if (choiceId === 'b') {
        assert.deepEqual(result.calls.grants, [], encounter.id);
        const runnerRep = spec.phases.find((phase) => phase.id === 'rep_b_runner');
        const authorityRep = spec.phases.find((phase) => phase.id === 'rep_b_authority');
        const expectedReps = [];
        if (runnerRep) {
          expectedReps.push({
            factionId: runnerRep.factionId,
            delta: 1,
            reason: spec.id,
          });
        }
        expectedReps.push({
          factionId: authorityRep.factionId,
          delta: -1,
          reason: spec.id,
        });
        assert.deepEqual(result.calls.reps, expectedReps, encounter.id);
      } else {
        assert.deepEqual(result.calls.grants, [], encounter.id);
        assert.deepEqual(result.calls.reps, [], encounter.id);
      }
    }
  }
});

test('a sample of generated lived and HAND scenes still resolves through every choice', () => {
  const lived = ENCOUNTER_MODULES.filter((module) => (
    module.default && module.default.livedVignette === true
      && module.default.id.startsWith('lived_')
  )).slice(0, 10);
  const hand = ENCOUNTER_MODULES.filter((module) => (
    module.default && module.default.livedVignette === true
      && !module.default.ambientScene
      && !module.default.id.startsWith('lived_')
  )).slice(0, 3);
  assert.equal(lived.length, 10);
  assert.equal(hand.length, 3);

  for (const module of [...lived, ...hand]) {
    const encounter = module.default;
    const choices = encounter.choices.map((choice) => choice.id);
    for (const choiceId of choices) {
      let result;
      assert.doesNotThrow(() => {
        result = runVignetteChoice(module.runtime, encounter, null, choiceId);
      }, `${encounter.id} choice ${choiceId}`);
      assert.deepEqual(result.calls.aborts, [], encounter.id);
      assert.deepEqual(result.calls.resolved, [choiceId], encounter.id);
    }
  }
});

test('ambient scene data omits overlay crew while non-ambient scenes keep it', () => {
  const overlay = livedOverlayFor('sector_helios_prime');
  const axis = { ux: -1, uz: 0 };
  const ambientData = livedSceneRequestData({
    ambient: true,
    overlay,
    seed: 47,
    encounterId: 'scene_fare_dodger_chase',
    day: 2,
    axis,
  });
  assert.deepEqual(ambientData, { sceneAxis: axis });
  assert.equal(ambientData.crew, undefined);
  assert.equal(ambientData.livedOverlay, undefined);

  const livedData = livedSceneRequestData({
    ambient: false,
    overlay,
    seed: 47,
    encounterId: 'lived_scene',
    day: 2,
  });
  assert.equal(livedData.livedOverlay.crew, overlay.crew);
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

test('ambient selection respects sector and cooldown, and varies within a day', () => {
  const now = 1217;
  const sectorId = 'sector_sker_haven';
  const zoneKey = 'outlaw-zone';
  const day = Math.floor(now / 600);
  const ambient = {
    id: 'scene_test_ambient',
    ambientScene: true,
    sectorIds: [sectorId],
    shape: { situation: 'hunt' },
  };
  const ordinary = { id: 'authored_fallback', shape: { situation: 'trade' } };
  const seed = Array.from({ length: 10000 }, (_, value) => value).find((candidate) => (
    hash32(candidate, sectorId, zoneKey, day, Math.floor(now / 6), 'lived-ambient') % 3 === 0
      && hash32(candidate, sectorId, zoneKey, day, Math.floor((now + 6) / 6), 'lived-ambient') % 3 !== 0
  ));
  assert.notEqual(seed, undefined);
  const args = { candidates: [ordinary, ambient], seed, sectorId, zoneKey, day, now };
  assert.equal(pickLivedVignette(args).id, ambient.id);
  assert.equal(pickLivedVignette({ ...args, now: now + 6 }).id, ordinary.id);
  assert.equal(pickLivedVignette({
    ...args,
    ambientLastAt: { [ambient.id]: now - 1199 },
  }).id, ordinary.id);
  assert.equal(pickLivedVignette({
    ...args,
    sectorId: 'sector_elsewhere',
  }).id, ordinary.id);
});

test('ambient placement is deterministic, forward, and perpendicular to the player heading', () => {
  const player = {
    pos: { x: 10, z: 20 },
    vel: { x: 0, z: 8 },
    rot: 0,
  };
  const args = [player, 47, 'sector_helios_prime', 'trade_lane', 4, 'scene_fare_dodger_chase'];
  const placement = livedScenePlacement(...args);
  assert.deepEqual(livedScenePlacement(...args), placement);
  assert.deepEqual(placement.centre, { x: 10, z: 220 });
  assert.ok(Math.abs((placement.centre.x - player.pos.x) * 0 + (placement.centre.z - player.pos.z) * 1 - 200) < 1e-12);
  assert.ok(Math.abs(placement.axis.ux * 0 + placement.axis.uz * 1) < 1e-12);
  assert.ok(Math.abs(placement.anchor.x + placement.axis.ux * 320 - placement.centre.x) < 1e-12);
  assert.ok(Math.abs(placement.anchor.z + placement.axis.uz * 320 - placement.centre.z) < 1e-12);

  const fallback = livedScenePlacement({
    pos: { x: -5, z: 3 }, vel: { x: 3, z: 4 }, rot: 0,
  }, 47, 'sector_helios_prime', 'trade_lane', 4, 'scene_fare_dodger_chase');
  assert.deepEqual(fallback.centre, { x: 195, z: 3 });
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

test('ambient motions steer along their scene axis and preserve existing motion intents', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  const d = { entsOf: (live) => live.ships, player: () => ({ pos: { x: 30, z: 10 } }) };
  const holdShips = [
    { pos: { x: 0, z: 0 }, rot: 0.3, data: {} },
    { pos: { x: 0, z: 0 }, rot: -0.2, data: {} },
  ];
  const holdLive = { vars: { motionOrigin: { x: 5, z: -7 }, motionT0: 0 }, data: {}, ships: holdShips };
  applyMotion(d, holdLive, 'hold', 0);
  assert.deepEqual(holdShips.map((ship) => ship.data.intent), [
    { tx: 30, tz: 10, fire: false, moveZ: 0, moveX: 0, aimAngle: 0.3 },
    { tx: 30, tz: 10, fire: false, moveZ: 0, moveX: 0, aimAngle: -0.2 },
  ]);

  const angle = -2.4939306811526896;
  const moveAngle = Math.atan2(-0.7497352943715063, -0.6617378547232061);
  const orbitShips = [
    { pos: { x: 45, z: -31 }, rot: 0.3, data: {} },
    {
      pos: { x: -155 - Math.cos(angle) * 100, z: -7 - Math.sin(angle) * 100 },
      rot: angle - moveAngle,
      data: {},
    },
  ];
  const orbitLive = { vars: { motionOrigin: { x: 5, z: -7 }, motionT0: 0 }, data: {}, ships: orbitShips };
  applyMotion(d, orbitLive, 'orbit', 0);
  const orbitLead = orbitShips[0].data.intent;
  assert.deepEqual(
    { tx: orbitLead.tx, tz: orbitLead.tz, fire: orbitLead.fire, aimAngle: orbitLead.aimAngle },
    { tx: 165, tz: -7, fire: false, aimAngle: 0.19739555984988078 },
  );
  close(orbitLead.moveZ, 0.9947407808046376);
  close(orbitLead.moveX, -0.10242450392450109);
  const orbitFollower = orbitShips[1].data.intent;
  assert.equal(orbitFollower.tx, -155);
  close(orbitFollower.tz, -6.9999999999999805);
  close(orbitFollower.moveZ, -0.6617378547232061);
  close(orbitFollower.moveX, -0.7497352943715063);
  close(orbitFollower.aimAngle, angle);

  const runner = { pos: { x: 0, z: 0 }, rot: 0, data: {} };
  const chaser = { pos: { x: -20, z: 10 }, rot: 0, data: {} };
  const chaseLive = {
    vars: { motionOrigin: { x: 10, z: 20 }, motionT0: 0 },
    data: { sceneAxis: { ux: 0, uz: 1 } },
    ships: [runner, chaser],
  };
  applyMotion(d, chaseLive, 'chase', 0);
  assert.deepEqual([runner.data.intent.tx, runner.data.intent.tz], [10, 720]);
  assert.deepEqual([chaser.data.intent.tx, chaser.data.intent.tz], [-60, 0]);

  const tug = { pos: { x: 2, z: 3 }, rot: Math.PI / 2, data: {} };
  const towed = { pos: { x: 10, z: 12 }, rot: 0, data: {} };
  const towLive = {
    vars: { motionOrigin: { x: 0, z: 0 }, motionT0: 0 },
    data: { sceneAxis: { ux: 1, uz: 0 } },
    ships: [tug, towed],
  };
  applyMotion(d, towLive, 'tow', 0);
  close(tug.data.intent.tx, 500);
  close(tug.data.intent.tz, 0);
  close(Math.hypot(tug.data.intent.moveZ, tug.data.intent.moveX), 0.22);
  close(towed.data.intent.tx, 2);
  close(towed.data.intent.tz, -52);

  const columnShips = [{ pos: { x: 0, z: 0 }, data: {} }, { pos: { x: 0, z: 0 }, data: {} }];
  applyMotion(d, {
    vars: { motionOrigin: { x: 0, z: 0 }, motionT0: 0 },
    data: { sceneAxis: { ux: 1, uz: 0 } },
    ships: columnShips,
  }, 'column', 0);
  assert.deepEqual(columnShips.map((ship) => ship.data.intent.tx), [700, 610]);

  const vulture = { pos: { x: 0, z: 0 }, data: {} };
  applyMotion(d, {
    vars: { motionOrigin: { x: 12, z: -4 }, motionT0: 0 },
    data: {},
    ships: [vulture],
  }, 'vulture', 0);
  assert.deepEqual([vulture.data.intent.tx, vulture.data.intent.tz], [107, -4]);
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
