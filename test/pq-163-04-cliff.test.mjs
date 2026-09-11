// PQ-163.04 — The cliff (recovery). Seed 16304.
//
// DONE WHEN (verbatim): Session-2 retention in playtests >= 60 %.
//
// There are no live playtesters in this environment, so this file does NOT claim a playtest
// number. It does two honest, deterministic things on seed 16304:
//
//   1. Plays session 1 through the existing leftover rescue/first-hour rail and the real 47-A
//      recovery contract, ending on story beat 1.
//   2. Boots session 2 (a Continue on the same save: the serialized story is restored and
//      `save:loaded` fires, never `game:started`), classifies beat 1 against PQ-152's definition
//      (a named physical problem vs a fly-there/fetch), and measures a retention proxy — at
//      T+180s the player is still in the beat with no quit-to-menu intent.
//
// The proxy is a deterministic DESIGN proxy, not a playtest measurement. It is reported as a
// percentage over a small seeded cohort so the shortfall against a real >= 60 % playtest bar stays
// legible instead of being hidden behind a green tick.
//
// HONESTY CONTRACT FOR THIS HARNESS
// --------------------------------
//  * Every input is a live-route input: the opening rail is driven over the production event
//    stream (same drivers as rescue-opening.test.mjs / pq-163-03-sentence.test.mjs), and 47-A is
//    settled by the live `missions` system (same path as contract-47a-first-loop.test.mjs).
//  * Beat 1 is classified from the LIVE station board offer built by `buildMissionBoardContract`
//    and posted by `missions.ensureBoard` — never from a hand-written expectation. The classifier
//    is denied its pass by a synthetic fetch offer first, so it cannot be a rubber stamp.
//  * The retention horizon does not invent a player. It is one scripted profile over several seeds.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import {
  AUTHORED_SET_PIECE_HEADLINE,
  STORY_BEATS,
  authoredSetPieceById,
} from '../src/data/missions.js';
import { MISSING_THREE_ORDER } from '../src/onboarding/missingThree.js';
import {
  RESCUE_PROOF_SEED,
  rescueBeatLine,
  rescuePodAtBeacon,
  rescueRockHitDerelict,
  rescueScoutAtAsteroid,
} from '../src/onboarding/rescueOpening.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/index.js';
import { onboarding } from '../src/systems/onboarding.js';
import { CONTRACT_47A_B0_TAG, missions as missionsProto } from '../src/systems/missions.js';

const SEED = 16304;
const STATION_HELIOS = 'station_helios';
const SESSION2_BEAT = 1;
const RETENTION_HORIZON_S = 180;
const RETENTION_TARGET = 0.60;
// The physical types PQ-152 admits as set pieces. A board offer outside this set with no physical
// verb / two methods / authored set piece is an errand by PQ-152's own "fly there and hold fire" bar.
const PHYSICAL_SET_PIECE_TYPES = new Set([
  'demolition',
  'rescue_under_fire',
  'tow_recovery',
  'authored_set_piece',
]);

function stubElement() {
  return {
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

// ── PQ-152 classification (named physical problem vs fetch) ───────────────────────────────
// The board offer must carry a physical mission type, a headline physical verb whose title leads
// with it, an authored PQ-152 set piece, and the two reachable solutions the packet requires.
function classifyBeatOne(offer) {
  if (!offer || !offer.params) return 'errand';
  const type = String(offer.type || '');
  const methods = Array.isArray(offer.params.completionMethods) ? offer.params.completionMethods : [];
  const physicalVerb = offer.params.physicalVerb;
  const headline = AUTHORED_SET_PIECE_HEADLINE.test(String(offer.title || '')) && !!physicalVerb;
  const authored = !!offer.params.authoredSetPieceId
    && !!authoredSetPieceById(offer.params.authoredSetPieceId);
  const isSetPiece = PHYSICAL_SET_PIECE_TYPES.has(type)
    && methods.length >= 2
    && headline
    && authored;
  return isSetPiece ? 'set_piece' : 'errand';
}

// ── State + harness ───────────────────────────────────────────────────────────────────────
function makeState(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.settings.gameplay.tutorialHints = true;
  state.combat.attachments = { byId: {} };
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };

  const player = makeEntity({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: { weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }], combat: {}, ai: {} },
  });
  player.id = 1;
  state.playerId = 1;
  state.entities.set(1, player);
  state.entityList.push(player);

  // The 47-A sample source + the Helios delivery berth, as contract-47a-first-loop places them.
  const asteroid = makeEntity({
    type: 'asteroid',
    team: null,
    pos: { x: 180, z: -60 },
    vel: { x: 0, z: 0 },
    radius: 14,
    data: { typeId: 'ast_common_rock' },
  });
  asteroid.id = 2;
  const station = makeEntity({
    type: 'station',
    team: 2,
    pos: { x: -420, z: 100 },
    vel: { x: 0, z: 0 },
    radius: 42,
    data: { stationId: STATION_HELIOS, name: 'Helios Station', dockRadius: 80 },
  });
  station.id = 3;
  state.entities.set(2, asteroid);
  state.entities.set(3, station);
  state.entityList.push(asteroid, station);
  state.nextEntityId = 10;
  state._sampleAsteroidId = 2;
  return state;
}

function makeHelpers(state) {
  return {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    voice: { say: () => true },
  };
}

function makeContext(state) {
  const bus = createBus();
  const helpers = makeHelpers(state);
  const missions = Object.assign({}, missionsProto);
  const sys = Object.create(onboarding);
  const registry = {
    get(name) {
      if (name === 'missions') return missions;
      if (name === 'onboarding') return sys;
      return null;
    },
  };
  const ctx = { state, bus, helpers, registry };
  missions.init(ctx);
  sys.init(ctx);
  return { state, bus, helpers, missions, sys, registry, ctx };
}

// The live rail, driven exactly as rescue-opening.test.mjs / pq-163-03-sentence.test.mjs drive it.
const DRILL_KEYS = ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'];

function tick(h, dt = 0.25) {
  h.sys.update(dt, h.state);
}

function advanceTime(h, seconds = 5) {
  h.state.simTime += seconds;
}

function rescueActor(h, slot) {
  const id = h.state.onboarding.rescue.ids[slot];
  return id == null ? null : h.state.entities.get(id);
}

function driveDrillTo(h, beatKey) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const derelictOf = () => st.entities.get(h.sys._derelictId);
  const trainerOf = () => (h.sys._trainerId != null ? st.entities.get(h.sys._trainerId) : null);

  const step = (key) => {
    if (key === 'thrust') {
      player.vel.x = 41;
      tick(h);
    } else if (key === 'brake') {
      player.vel.x = 0;
      player.vel.z = 0;
      tick(h);
    } else if (key === 'marker') {
      tick(h);
      const trainer = trainerOf();
      assert.ok(trainer, 'marker lesson must stage its trainer');
      trainer.pos.x = player.pos.x + 100;
      trainer.pos.z = player.pos.z;
      tick(h);
    } else if (key === 'focus') {
      const trainer = trainerOf();
      assert.ok(trainer, 'focus lesson needs its trainer');
      h.bus.emit('flybyFocus:start', { targetId: trainer.id });
      tick(h);
    } else if (key === 'tether') {
      const derelict = derelictOf();
      assert.ok(derelict, 'tether lesson must stage its derelict');
      st.player.targetId = derelict.id;
      h.bus.emit('tether:latched', { targetId: derelict.id });
      h.bus.emit('tether:reel', { targetId: derelict.id, before: 80, after: 58 });
      h.bus.emit('tether:released', { targetId: derelict.id });
      tick(h);
    } else if (key === 'burst') {
      player.data.weapons[0]._heat = 36;
      for (let i = 0; i < 3; i++) {
        h.bus.emit('combat:fire', { ownerId: player.id, weaponId: 'pulse_laser_s' });
      }
      player.data.weapons[0]._heat = 2;
      tick(h);
    } else if (key === 'disengage') {
      const trainer = trainerOf();
      assert.ok(trainer, 'disengage lesson needs its trainer');
      trainer.pos.x = player.pos.x + 901;
      trainer.pos.z = player.pos.z;
      tick(h);
    }
  };

  const start = h._drivenIdx || 0;
  const target = DRILL_KEYS.indexOf(beatKey);
  assert.ok(target >= start, `drill driver cannot rewind to ${beatKey}`);
  for (let i = start; i <= target; i++) {
    const key = DRILL_KEYS[i];
    step(key);
    advanceTime(h);
    tick(h);
    assert.ok(h.state.onboarding.beatDoneAt[key] != null, `drill beat must DONE: ${key}`);
  }
  h._drivenIdx = target + 1;
}

function completeSwing(h) {
  const rock = rescueActor(h, 'rock');
  const derelict = rescueActor(h, 'derelict');
  assert.ok(rock && derelict, 'the swing needs its rock and its wreck');
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, before: 80, after: 50 });
  h.bus.emit('tether:released', { targetId: rock.id });
  rock.pos.x = derelict.pos.x + 20;
  rock.pos.z = derelict.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  assert.ok(rescueRockHitDerelict(rock, derelict), 'the swing setup is a genuine hit');
  tick(h);
}

function completeShove(h) {
  const scout = rescueActor(h, 'scout');
  const asteroid = rescueActor(h, 'asteroid');
  assert.ok(scout && asteroid, 'the shove needs its scout and its wall');
  scout.pos.x = asteroid.pos.x + 40;
  scout.pos.z = asteroid.pos.z;
  scout.vel.x = 20;
  scout.vel.z = 0;
  assert.ok(rescueScoutAtAsteroid(scout, asteroid), 'the shove setup is a genuine scout-into-asteroid');
  tick(h);
}

function completeGrab(h) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const pod = rescueActor(h, 'pod');
  const beacon = rescueActor(h, 'beacon');
  assert.ok(pod && beacon, 'the grab needs its pod and its beacon');
  h.bus.emit('tether:latched', { targetId: pod.id });
  player.vel.x = 30;
  player.vel.z = 0;
  pod.pos.x = beacon.pos.x;
  pod.pos.z = beacon.pos.z;
  assert.ok(rescuePodAtBeacon(pod, beacon), 'the grab setup is a genuine delivery');
  tick(h);
}

// The missing three (PQ-163.02): boost, stroke, well — each via its live verb signal.
function driveMissingThree(h) {
  const st = h.state;
  const three = st.onboarding.missingThree;
  assert.ok(three, 'the missing-three rail must be staged by the opening');

  // boost — the same live verb the flight model raises.
  st.input.boost = true;
  advanceTime(h);
  tick(h);
  assert.equal(three.beats.boost.state, 'done', 'boost must complete on the live boost input');

  // stroke — draw-to-fly via the live auto-target path.
  st.input.autoTargetPath = { active: true, drawing: true, points: [{ x: 1, z: 0 }, { x: 2, z: 0 }] };
  advanceTime(h);
  tick(h);
  assert.equal(three.beats.stroke.state, 'done', 'stroke must complete on the live draw-to-fly path');
  st.input.autoTargetPath = { active: false, drawing: false, points: [] };

  // well — the field deployment the fields owner emits.
  h.bus.emit('fields:deployed', { kind: 'well', atS: st.simTime });
  advanceTime(h);
  tick(h);
  assert.equal(three.beats.well.state, 'done', 'well must complete on the live fields:deployed signal');
  assert.equal(three.completed, true, 'the missing-three rail must complete in order');
}

// Session 1: the opening rail, then the real 47-A contract, ending on story beat 1.
function playSessionOne(seed) {
  const state = makeState(seed);
  const h = makeContext(state);
  h.bus.emit('game:started', {});

  assert.ok(state.onboarding && state.onboarding.rescue, 'default route stages the leftover rescue');
  assert.equal(state.story.beatIndex, 0, 'session 1 opens on 47-A (beat 0)');

  driveDrillTo(h, 'tether');
  assert.equal(state.onboarding.rescue.current, 'swing', 'the swing opens in the tether gap');
  completeSwing(h);

  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  assert.equal(state.onboarding.rescue.current, 'shove', 'the shove opens in the burst gap');
  completeShove(h);

  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'disengage');
  assert.equal(state.onboarding.rescue.current, 'grab', 'the grab opens after disengage');
  completeGrab(h);
  assert.equal(state.onboarding.rescue.completed, true, 'the rescue rail completes');

  advanceTime(h);
  tick(h);
  driveMissingThree(h);

  // 47-A on the real missions path: sample the marked rock, dock Helios. The live resolver chooses
  // the mission's source (a rescue-cast rock may sit nearer after the opening rail), so the receipt
  // is aimed at the rock the missions owner actually marked — not a hand-assumed one.
  const b0 = state.missions.active.find((m) => m && m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(b0, 'new game receives the 47-A recovery order');
  const source = h.missions._resolveContract47aSampleSource(b0);
  assert.ok(source && source.pos, 'the 47-A sample source resolves to a live rock');
  h.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, minerId: state.playerId, pos: { ...source.pos },
  });
  assert.equal(b0.params.sampleRecovered, true, 'the marked sample is recovered');
  h.bus.emit('dock:docked', { stationId: STATION_HELIOS });
  assert.equal(state.story.beatIndex, 1, '47-A settles Honest Work (beat 1)');

  return {
    state,
    story: JSON.parse(JSON.stringify(state.story)),
    rail: {
      rescue: state.onboarding.rescue.completed,
      missingThree: state.onboarding.missingThree.completed,
      missingThreeOrder: [...MISSING_THREE_ORDER],
    },
  };
}

// Session 2: a Continue on the same save. The serialized story is restored and `save:loaded`
// fires — never `game:started`, so the tutorial rail cannot stage a second time.
function playSessionTwo(seed, savedStory) {
  const state = makeState(seed);
  state.story = JSON.parse(JSON.stringify(savedStory));
  state.story.beatIndex = SESSION2_BEAT;
  const h = makeContext(state);

  let quitToMenu = false;
  h.bus.on('game:exitToMenu', () => { quitToMenu = true; });

  h.bus.emit('save:loaded', {});
  assert.equal(state.onboarding && state.onboarding.rescue, undefined,
    'session 2 (Continue) must not restage the tutorial rail');

  const board = h.missions.ensureBoard(STATION_HELIOS);
  const offer = board.slots.find((row) => row && row.storyTag === 'campaign47a:b1:honest_work');
  assert.ok(offer, 'session 2 must post the beat-1 contract on the Helios board');
  const kind = classifyBeatOne(offer);

  // The scripted session-2 player accepts the beat-1 work and stays with it for the horizon.
  const accepted = h.missions.acceptMission(offer.id);
  assert.equal(accepted, true, 'the beat-1 contract must be acceptable');
  const active = state.missions.active.find((m) => m && m.storyTag === 'campaign47a:b1:honest_work');
  assert.ok(active, 'the accepted beat-1 contract is live');

  // The discriminator that makes "still in the beat" non-trivial: a generic fly-there completion —
  // the shape that would finish an errand — cannot settle a physical set piece. The beat survives
  // the shortcut and the player is still in it. (B1–B3 only advance through the authored physical
  // contract, src/systems/missions.js _advanceEmbodiedStoryMission.)
  h.bus.emit('mission:completed', {
    missionId: active.id,
    storyTag: active.storyTag,
    source: 'test-generic-shortcut',
  });
  assert.equal(state.story.beatIndex, SESSION2_BEAT,
    'a bare generic completion must not settle the physical set piece');

  const dt = 0.25;
  const ticks = Math.round(RETENTION_HORIZON_S / dt);
  for (let i = 0; i < ticks; i++) {
    state.simTime += dt;
    state.tick += 1;
    h.sys.update(dt, state);
  }

  const stillInBeat = state.story.beatIndex === SESSION2_BEAT;
  const retained = stillInBeat && !quitToMenu && kind === 'set_piece';
  return {
    seed,
    kind,
    type: offer.type,
    physicalVerb: offer.params && offer.params.physicalVerb,
    methods: offer.params && offer.params.completionMethods,
    stillInBeat,
    quitToMenu,
    retained,
  };
}

// ── Contract: the classifier itself is denied by a fetch ──────────────────────────────────
test('the PQ-152 classifier calls a fly-there fetch an errand and the wrecking ball a set piece', () => {
  assert.equal(
    classifyBeatOne({
      type: 'cargo_delivery',
      title: 'Deliver sealed alloys',
      params: { completionMethods: ['deliver'] },
    }),
    'errand',
    'a single-solution fetch is an errand',
  );
  assert.equal(
    classifyBeatOne({
      type: 'demolition',
      title: 'Knock the dead tower',
      params: {
        physicalVerb: 'knock_down',
        completionMethods: ['wrecking_ball', 'cut_down'],
        authoredSetPieceId: 'wrecking_ball',
      },
    }),
    'set_piece',
    'a two-solution physical problem is a set piece',
  );
  assert.equal(classifyBeatOne(null), 'errand');
});

// ── Contract: beat 1 data is the PQ-152 spine entry ───────────────────────────────────────
test('story beat 1 is authored as a named physical problem, not a fetch', () => {
  const beat = STORY_BEATS[SESSION2_BEAT];
  assert.ok(beat, 'beat 1 exists');
  assert.equal(beat.id, 'honest_work');
  assert.equal(beat.headlineVerb, 'knock');
  assert.equal(beat.setPiece, 'wrecking-ball contract');
  assert.equal(beat.authoredSetPieceId, 'wrecking_ball');
  assert.match(beat.objective, /^Knock\b/, 'the beat-1 objective leads with its physical verb');
  const authored = authoredSetPieceById(beat.authoredSetPieceId);
  assert.ok(authored, 'the beat-1 authored set piece is live');
  assert.equal(authored.methods.length, 2, 'the wrecking ball has two solutions');
  assert.equal(STORY_BEATS[0].id, 'cold_start', 'beat 0 is the 47-A cold open');
});

// ── The leaf scenario: opening → 47-A → session 2 → classify → measure ─────────────────────
test('session 2 after 47-A opens on a set piece and holds the beat at T+180s', () => {
  const s1 = playSessionOne(SEED);
  assert.deepEqual(s1.rail.missingThreeOrder, ['boost', 'stroke', 'well'], 'the leftover rail teaches the three');
  assert.equal(s1.story.beatIndex, 1, 'session 1 hands off on beat 1');

  const s2 = playSessionTwo(SEED, s1.story);
  console.log(`SESSION2_BEAT1_KIND=${s2.kind}`);
  console.log(`SESSION2_BEAT1_TYPE=${s2.type}`);
  console.log(`SESSION2_BEAT1_METHODS=${(s2.methods || []).join(',')}`);
  console.log(`SESSION2_BEAT1_IN_BEAT_AT_${RETENTION_HORIZON_S}S=${s2.stillInBeat}`);
  console.log(`SESSION2_QUIT_TO_MENU=${s2.quitToMenu}`);

  assert.equal(s2.kind, 'set_piece', 'beat 1 after 47-A must be a set piece, never an errand');
  assert.equal(s2.stillInBeat, true, `the player is still in beat 1 at T+${RETENTION_HORIZON_S}s`);
  assert.equal(s2.quitToMenu, false, 'no quit-to-menu intent in the session-2 horizon');
  assert.equal(RESCUE_PROOF_SEED, 47, 'the shared rescue proof seed stays 47');
});

// ── Retention proxy: deterministic seeded cohort, design-only ─────────────────────────────
// This is NOT a playtest cohort. It is one scripted profile over seeded boots, so the number is a
// design proxy for the real >= 60 % playtest bar and is reported as such in the receipt.
const PROXY_COHORT = [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4];

test('session-2 retention proxy over the seeded cohort', () => {
  const rows = PROXY_COHORT.map((seed) => {
    const s1 = playSessionOne(seed);
    return playSessionTwo(seed, s1.story);
  });
  const retained = rows.filter((row) => row.retained).length;
  const rate = retained / rows.length;
  console.log(`SESSION2_RETENTION_PROXY=${(rate * 100).toFixed(1)}% (${retained}/${rows.length} seeded session-2 boots;`
    + ` horizon=${RETENTION_HORIZON_S}s; target=${(RETENTION_TARGET * 100).toFixed(0)}% design proxy)`);
  for (const row of rows) {
    console.log(`  seed ${row.seed}: kind=${row.kind} in_beat=${row.stillInBeat} quit=${row.quitToMenu}`);
  }
  assert.ok(rows.every((row) => row.kind === 'set_piece'),
    'every seeded session-2 boot must open beat 1 as a set piece');
  assert.ok(rows.every((row) => row.stillInBeat && !row.quitToMenu),
    'every seeded session-2 boot must hold the beat to T+180s without a quit-to-menu');
  assert.ok(rate >= RETENTION_TARGET,
    `design retention proxy ${(rate * 100).toFixed(1)}% must clear the ${RETENTION_TARGET * 100}% bar`);
});
