// PQ-163.03: the store-page sentence is shown once; leftover clauses are performed
// before minute ten. No invented stranger-playtest percentage.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { FLIGHT_DRILL_BEATS } from '../src/onboarding/flightDrill.js';
import {
  RESCUE_PROOF_SEED,
  rescuePodAtBeacon,
  rescueRockHitDerelict,
  rescueScoutAtAsteroid,
} from '../src/onboarding/rescueOpening.js';
import {
  STORE_CLAUSES,
  STORE_SENTENCE,
  STORE_SENTENCE_WINDOW_S,
  allStoreClausesPerformedBefore,
  buildFirstHourSentenceEvent,
  freshStoreSentenceState,
  stampStoreClause,
  storeSentenceLine,
} from '../src/onboarding/storeSentence.js';
import { onboarding } from '../src/systems/onboarding.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

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

function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;
  return {
    meta: { seed: RESCUE_PROOF_SEED },
    simTime: 10,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: {
      boost: false,
      autoTargetPath: { active: false, drawing: false, points: [] },
    },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function boot() {
  const bus = createBus();
  const state = makeState();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(onboarding);
  const seen = { rescue: [], firsthour: [], sentence: [], toast: [] };
  bus.on('rescue:started', (p) => seen.rescue.push({ event: 'rescue:started', ...p }));
  bus.on('rescue:beat', (p) => seen.rescue.push({ event: 'rescue:beat', ...p }));
  bus.on('rescue:complete', (p) => seen.rescue.push({ event: 'rescue:complete', ...p }));
  bus.on('firsthour:started', (p) => seen.firsthour.push({ event: 'firsthour:started', ...p }));
  bus.on('firsthour:verb', (p) => seen.firsthour.push({ event: 'firsthour:verb', ...p }));
  bus.on('firsthour:beat', (p) => seen.firsthour.push({ event: 'firsthour:beat', ...p }));
  bus.on('firsthour:complete', (p) => seen.firsthour.push({ event: 'firsthour:complete', ...p }));
  bus.on('firsthour:sentence', (p) => seen.sentence.push({ event: 'firsthour:sentence', ...p }));
  bus.on('toast', (p) => seen.toast.push(p));
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned, seen };
}

// The live default route carries `helpers.voice` (voiceArbiter, registry slot 352 — before
// onboarding at 459). boot() above has no voice helper, so it only exercises the raw-toast
// fallback. This second harness wires the real arbiter in registry init + update order so the
// branch a player actually takes is the one under test.
function bootLive() {
  const bus = createBus();
  const state = makeState();
  const helpers = {
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
  };
  const arb = Object.create(voiceArbiter);
  const sys = Object.create(onboarding);
  const ctx = { state, bus, helpers, registry: null };
  arb.init(ctx);
  sys.init(ctx);
  const seen = { surface: [], clear: [], toast: [] };
  bus.on('voice:surface', (p) => seen.surface.push({ atS: state.simTime, ...p }));
  bus.on('voice:clear', (p) => seen.clear.push({ atS: state.simTime, ...p }));
  bus.on('toast', (p) => seen.toast.push({ atS: state.simTime, ...p }));
  // Registry update order: the arbiter steps first, then onboarding may enqueue.
  const step = (dt = 0.25) => { state.simTime += dt; arb.update(dt, state); sys.update(dt, state); };
  return { bus, state, sys, arb, helpers, seen, step };
}

function launchDefaultRoute(h) {
  h.bus.emit('game:started', {});
  return h.state.onboarding;
}

function tick(h, dt = 0.25) {
  h.sys.update(dt, h.state);
}

function advanceTime(h, seconds = 5) {
  h.state.simTime += seconds;
}

function tutorialLines(h) {
  return (h.state.onboarding.tutorialLog || []).map((entry) => entry.text);
}

function rescueActor(h, slot) {
  const id = h.state.onboarding.rescue.ids[slot];
  return id == null ? null : h.state.entities.get(id);
}

const DRILL_KEYS = ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'];
function driveDrillTo(h, beatKey) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const sys = h.sys;
  const derelictOf = () => st.entities.get(sys._derelictId);
  const trainerOf = () => (sys._trainerId != null ? st.entities.get(sys._trainerId) : null);

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
    assert.ok(st.onboarding.beatDoneAt[key] != null, `drill beat must DONE: ${key}`);
  }
  h._drivenIdx = target + 1;
}

function completeSwing(h) {
  const rock = rescueActor(h, 'rock');
  const derelict = rescueActor(h, 'derelict');
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, before: 80, after: 50 });
  h.bus.emit('tether:released', { targetId: rock.id });
  rock.pos.x = derelict.pos.x + 20;
  rock.pos.z = derelict.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  assert.ok(rescueRockHitDerelict(rock, derelict), 'swing setup is a genuine hit');
  tick(h);
}

function completeShove(h) {
  const scout = rescueActor(h, 'scout');
  const asteroid = rescueActor(h, 'asteroid');
  scout.pos.x = asteroid.pos.x + 40;
  scout.pos.z = asteroid.pos.z;
  scout.vel.x = 20;
  scout.vel.z = 0;
  assert.ok(rescueScoutAtAsteroid(scout, asteroid), 'shove setup is a genuine scout-into-asteroid');
  tick(h);
}

function completeGrab(h) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const pod = rescueActor(h, 'pod');
  const beacon = rescueActor(h, 'beacon');
  h.bus.emit('tether:latched', { targetId: pod.id });
  player.vel.x = 30;
  player.vel.z = 0;
  pod.pos.x = beacon.pos.x;
  pod.pos.z = beacon.pos.z;
  assert.ok(rescuePodAtBeacon(pod, beacon), 'grab setup is a genuine delivery');
  tick(h);
}

function completeLeftoverBoost(h) {
  h.state.input.boost = true;
  tick(h);
}

function driveLeftoverRescueAndBoost(h) {
  driveDrillTo(h, 'tether');
  completeSwing(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  completeShove(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'disengage');
  completeGrab(h);
  completeLeftoverBoost(h);
}

test('store sentence is one exact line and does not import hudAttention', () => {
  assert.equal(STORE_SENTENCE, 'Light ships are ammunition. Swing a rock. Keep the speed.');
  assert.equal(storeSentenceLine(), STORE_SENTENCE);
  assert.equal(STORE_SENTENCE.includes('\n'), false, 'exactly one line');
  assert.deepEqual(STORE_CLAUSES, ['swing', 'ammunition', 'speed']);
  assert.equal(STORE_SENTENCE_WINDOW_S, 600);
  assert.deepEqual(buildFirstHourSentenceEvent(12), {
    type: 'firsthour:sentence',
    shown: true,
    atS: 12,
  });
  const rec = freshStoreSentenceState();
  assert.equal(rec.shown, false);
  assert.equal(stampStoreClause(rec, 'swing', 40), true);
  assert.equal(stampStoreClause(rec, 'swing', 41), false, 'clause stamps once');
  assert.equal(stampStoreClause(rec, 'shove', 80), true);
  assert.equal(stampStoreClause(rec, 'boost', 120), true);
  assert.equal(allStoreClausesPerformedBefore(rec, 600), true);
  const src = readFileSync(fileURLToPath(new URL('../src/onboarding/storeSentence.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /hudAttention/, 'sentence copy must not live in or import hudAttention');
});

test('drill table is untouched: B0 is still thrust in leftover order', () => {
  assert.deepEqual(
    FLIGHT_DRILL_BEATS.map((beat) => beat.key),
    ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'],
  );
});

test('default New Game shows the sentence once on rescue:started', () => {
  const h = boot();
  launchDefaultRoute(h);
  assert.ok(h.state.onboarding.rescue, 'default route stages the leftover rescue');
  assert.equal(h.state.onboarding.storeSentence.shown, true);
  assert.equal(h.state.onboarding.storeSentence.line, STORE_SENTENCE);
  const started = h.seen.rescue.filter((e) => e.event === 'rescue:started');
  assert.equal(started.length, 1);
  assert.equal(h.seen.sentence.length, 1, 'firsthour:sentence fires exactly once');
  assert.deepEqual(h.seen.sentence[0], {
    event: 'firsthour:sentence',
    type: 'firsthour:sentence',
    shown: true,
    atS: 10,
  });
  const said = tutorialLines(h).filter((t) => t === STORE_SENTENCE);
  assert.equal(said.length, 1, 'tutorial voice speaks the sentence once');
  const toasts = h.seen.toast.filter((t) => t && t.text === STORE_SENTENCE);
  assert.equal(toasts.length, 1, 'the line is actually shown once');
  assert.equal(toasts[0].id, 'firsthour:sentence');

  // Silence: no second display if rescue:started is emitted again.
  h.bus.emit('rescue:started', { type: 'rescue:started', beats: ['swing', 'shove', 'grab'], atS: 11 });
  assert.equal(h.seen.sentence.length, 1);
  assert.equal(tutorialLines(h).filter((t) => t === STORE_SENTENCE).length, 1);
  assert.equal(h.seen.toast.filter((t) => t && t.text === STORE_SENTENCE).length, 1);
});

test('leftover rescue + boost perform each clause before 600s; sentence stays once', () => {
  const h = boot();
  launchDefaultRoute(h);
  driveLeftoverRescueAndBoost(h);
  const st = h.state;
  assert.ok(st.simTime < STORE_SENTENCE_WINDOW_S, 'proof stays inside minute ten');
  assert.equal(st.onboarding.rescue.beats.swing.state, 'done');
  assert.equal(st.onboarding.rescue.beats.shove.state, 'done');
  assert.equal(st.onboarding.rescue.completed, true);
  assert.equal(st.onboarding.missingThree.beats.boost.state, 'done', 'leftover keep-the-speed boost');
  const rec = st.onboarding.storeSentence;
  assert.equal(rec.shown, true);
  assert.equal(rec.clauses.swing.performed, true);
  assert.equal(rec.clauses.ammunition.performed, true);
  assert.equal(rec.clauses.speed.performed, true);
  assert.ok(rec.clauses.swing.atS < 600);
  assert.ok(rec.clauses.ammunition.atS < 600);
  assert.ok(rec.clauses.speed.atS < 600);
  assert.equal(allStoreClausesPerformedBefore(rec, 600), true);
  assert.equal(tutorialLines(h).filter((t) => t === STORE_SENTENCE).length, 1);
  assert.equal(h.seen.sentence.length, 1);
  assert.equal(h.seen.sentence.some((e) => e.percent != null || e.rate != null), false,
    'funnel never invents a stranger-playtest percentage');
});

test('47-A scenario payload still skips the rail and never shows the sentence', () => {
  const h = boot();
  h.bus.emit('game:started', { source: 'sf-sim', scenario: '47a' });
  assert.equal(h.state.onboarding.rescue, undefined);
  assert.equal(h.state.onboarding.missingThree, undefined);
  assert.equal(h.state.onboarding.storeSentence, undefined);
  assert.equal(h.state.entityList.length, 1, 'no rescue bodies enter the harness snapshot');
  assert.deepEqual(h.seen.rescue, []);
  assert.deepEqual(h.seen.sentence, []);
  assert.equal(tutorialLines(h).includes(STORE_SENTENCE), false);
  assert.equal(h.seen.toast.some((t) => t && t.text === STORE_SENTENCE), false);
});

test('with the live voice arbiter wired, the sentence reaches the floor exactly once', () => {
  const h = bootLive();
  assert.equal(typeof h.helpers.voice.say, 'function', 'the live route hands onboarding a voice helper');
  launchDefaultRoute(h);
  // say() only ENQUEUES (it returns true on accept, not on display), so the raw-toast fallback is
  // skipped on this route. Nothing is shown until the arbiter promotes the entry to the floor.
  assert.equal(h.seen.toast.filter((t) => t.text === STORE_SENTENCE && !t._fromVoice).length, 0,
    'the fallback toast must not fire when the arbiter accepted the line');

  for (let i = 0; i < 120; i++) h.step();   // 30 s of sim past a ttl-8 line

  const shown = h.seen.surface.filter((s) => s.text === STORE_SENTENCE);
  assert.equal(shown.length, 1, 'the sentence takes the one-voice floor exactly once');
  assert.equal(shown[0].id, 'firsthour:sentence');
  assert.equal(shown[0].channel, 'tutorial', 'tutorial channel survives the tutorialProtect policy');
  const mirrored = h.seen.toast.filter((t) => t.text === STORE_SENTENCE);
  assert.equal(mirrored.length, 1, 'one visible surface, not two');
  assert.equal(mirrored[0]._fromVoice, true, 'the shown copy is the arbiter mirror');
  assert.ok(h.seen.clear.some((c) => c.id === 'firsthour:sentence'),
    'the floor is released again — one line, then silence');

  // Silence: a second rescue:started must not re-take the floor.
  h.bus.emit('rescue:started', { type: 'rescue:started', beats: ['swing', 'shove', 'grab'], atS: h.state.simTime });
  for (let i = 0; i < 40; i++) h.step();
  assert.equal(h.seen.surface.filter((s) => s.text === STORE_SENTENCE).length, 1);
  assert.equal(h.seen.toast.filter((t) => t.text === STORE_SENTENCE).length, 1);
});
