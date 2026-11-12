// PQ-163.03: the store-page sentence is shown once; leftover clauses are performed
// before minute ten. No invented stranger-playtest percentage.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
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
  STORE_FLIGHT_SENTENCE,
  STORE_SENTENCE_WINDOW_S,
  STORE_CLAUSE_READBACK,
  allStoreClausesPerformedBefore,
  buildFirstHourSentenceEvent,
  freshStoreSentenceState,
  stampStoreClause,
  storeSentenceLine,
  strangerReadback,
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
    freeIds: [],
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

// Both harnesses step the REAL registry (createSimulation), not system update() directly: a
// flight tick runs the production full-tick branch (core preStep/sweep + onboarding in update
// order), and a docked tick runs the production frozen branch — keepalive only — where the
// HIDDEN_KEEPALIVE_SERVICES onboarding row (dockSentenceKeepalive) is the caller that delivers
// the deferred store sentence. Driving sys.update by hand would bypass that freeze gate, which
// is exactly the branch this file exists to prove.
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
  const seen = { rescue: [], firsthour: [], sentence: [], toast: [] };
  const sim = createSimulation({ seed: RESCUE_PROOF_SEED, state, bus, helpers, systems: [onboarding] });
  bus.on('rescue:started', (p) => seen.rescue.push({ event: 'rescue:started', ...p }));
  bus.on('rescue:beat', (p) => seen.rescue.push({ event: 'rescue:beat', ...p }));
  bus.on('rescue:complete', (p) => seen.rescue.push({ event: 'rescue:complete', ...p }));
  bus.on('firsthour:started', (p) => seen.firsthour.push({ event: 'firsthour:started', ...p }));
  bus.on('firsthour:verb', (p) => seen.firsthour.push({ event: 'firsthour:verb', ...p }));
  bus.on('firsthour:beat', (p) => seen.firsthour.push({ event: 'firsthour:beat', ...p }));
  bus.on('firsthour:complete', (p) => seen.firsthour.push({ event: 'firsthour:complete', ...p }));
  bus.on('firsthour:sentence', (p) => seen.sentence.push({ event: 'firsthour:sentence', ...p }));
  bus.on('toast', (p) => seen.toast.push(p));
  return { bus, state, sys: sim.registry.get('onboarding'), helpers, spawned, seen, sim };
}

// The live default route carries `helpers.voice` (voiceArbiter, registry slot 352 — before
// onboarding at 459). boot() above has no voice helper, so it only exercises the raw-toast
// fallback. This second harness wires the real arbiter in registry init + update order so the
// branch a player actually takes is the one under test — through the same real registry steps.
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
  const seen = { surface: [], clear: [], toast: [] };
  // Registry update order: the arbiter steps first, then onboarding may enqueue.
  const sim = createSimulation({
    seed: RESCUE_PROOF_SEED, state, bus, helpers, systems: [voiceArbiter, onboarding],
  });
  bus.on('voice:surface', (p) => seen.surface.push({ atS: state.simTime, ...p }));
  bus.on('voice:clear', (p) => seen.clear.push({ atS: state.simTime, ...p }));
  bus.on('toast', (p) => seen.toast.push({ atS: state.simTime, ...p }));
  return {
    bus, state, sys: sim.registry.get('onboarding'), arb: sim.registry.get('voiceArbiter'),
    helpers, seen, sim,
    step: (dt = 0.25) => sim.step(dt),
  };
}

function launchDefaultRoute(h) {
  h.bus.emit('game:started', {});
  return h.state.onboarding;
}

function tick(h, dt = 0.25) {
  h.sim.step(dt);
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

// Production route order (onboarding.js BEATS): the tether attach leads; the movement
// drills follow it. Raid/claimed sit between disengage and seam for the full-route tests.
const DRILL_KEYS = ['tether', 'raid', 'claimed', 'thrust', 'brake', 'marker', 'focus', 'burst', 'disengage'];
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
      tick(h); // the route opens on the tether beat: one tick stages its derelict
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
    } else if (key === 'raid') {
      // The raid beat: latch the staged raider, fling him, and the throw-kill resolves it.
      advanceTime(h);
      tick(h);
      const raid = h.state.onboarding.raid;
      assert.ok(raid && raid.ids.raider != null, 'raid lesson stages its raider');
      const raider = h.state.entities.get(raid.ids.raider);
      raider.vel.x = 200;
      h.bus.emit('tether:latched', { targetId: raider.id });
      h.bus.emit('tether:released', { targetId: raider.id });
      h.bus.emit('entity:killed', { id: raider.id, killerId: st.entities.get(st.playerId).id, type: 'ship' });
      tick(h);
    } else if (key === 'disengage') {
      const trainer = trainerOf();
      assert.ok(trainer, 'disengage lesson needs its trainer');
      trainer.pos.x = player.pos.x + 901;
      trainer.pos.z = player.pos.z;
      tick(h);
    } else if (key === 'claimed') {
      advanceTime(h);
      tick(h);
      const claimed = h.state.onboarding.claimed;
      assert.ok(claimed == null || claimed.resolved || (claimed.ids && claimed.ids.pickups.length >= 1), 'claimed lesson stages its spill');
  if (claimed && claimed.active) {
    assert.ok(claimed.ids.pickups.length >= 1, 'claimed spill present');
  }
      h.bus.emit('pickup:collected', {
        pickupId: claimed.ids.pickups[0],
        collectorId: h.state.playerId,
        kind: 'cargo',
        amount: 4,
        commodityId: 'cmdty_salvage_electronics',
        pos: { x: h.state.entities.get(h.state.playerId).pos.x, z: h.state.entities.get(h.state.playerId).pos.z },
      });
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

// Thesis-first route: raid + claimed run between the rescue grab and the movement verbs.
function completeRaid(h) {
  const st = h.state;
  advanceTime(h);
  tick(h);
  const raid = st.onboarding.raid;
  assert.ok(raid && raid.ids.raider != null, 'raid lesson stages its raider');
  const player = st.entities.get(st.playerId);
  const raider = st.entities.get(raid.ids.raider);
  h.bus.emit('tether:latched', { targetId: raider.id });
  raider.vel.x = 200;
  h.bus.emit('tether:released', { targetId: raider.id });
  h.bus.emit('entity:killed', { id: raider.id, killerId: player.id, type: 'ship' });
  tick(h);
  assert.ok(st.onboarding.beatDoneAt.raid != null, 'a throw kill completes the raid');
}

function completeClaimed(h) {
  const st = h.state;
  advanceTime(h);
  tick(h);
  const claimed = st.onboarding.claimed;
  assert.ok(claimed == null || claimed.resolved || (claimed.ids && claimed.ids.pickups.length >= 1), 'claimed lesson stages its spill');
  if (claimed && claimed.active) {
    assert.ok(claimed.ids.pickups.length >= 1, 'claimed spill present');
  }
  h.bus.emit('pickup:collected', {
    pickupId: claimed.ids.pickups[0],
    collectorId: st.playerId,
    kind: 'cargo',
    amount: 4,
    commodityId: 'cmdty_salvage_electronics',
    pos: { x: st.entities.get(st.playerId).pos.x, z: st.entities.get(st.playerId).pos.z },
  });
  tick(h);
  assert.ok(st.onboarding.beatDoneAt.claimed != null, 'the claimed beat resolves');
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
  completeRaid(h);
  completeClaimed(h);
  completeLeftoverBoost(h);
}

test('store sentence is one exact line and does not import hudAttention', () => {
  assert.equal(STORE_SENTENCE, 'Light ships are ammunition. Swing a rock. Keep the speed.');
  assert.equal(storeSentenceLine(), STORE_SENTENCE);
  assert.equal(STORE_SENTENCE.includes('\n'), false, 'exactly one line');
  // X3: the in-flight lesson is one sentence; Adventure glass rejects multi-sentence prose.
  assert.equal(STORE_FLIGHT_SENTENCE, 'Light ships are ammunition.');
  assert.equal(/[.!?]\s+[A-Z]/.test(STORE_FLIGHT_SENTENCE), false,
    'the flight line is one sentence the glass can admit');
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

test('default New Game glass-gates the sentence in flight and shows it once at the dock', () => {
  const h = boot();
  launchDefaultRoute(h);
  assert.ok(h.state.onboarding.rescue, 'default route stages the leftover rescue');
  assert.equal(h.state.onboarding.storeSentence.line, STORE_SENTENCE);
  const started = h.seen.rescue.filter((e) => e.event === 'rescue:started');
  assert.equal(started.length, 1);

  // X3/W5: the store hook is prose, not a flight receipt — the Adventure glass refuses a
  // tutorial-channel sentence over rescue-start flight, so it defers instead of drawing.
  assert.equal(h.state.onboarding.storeSentence.shown, false,
    'the sentence must not draw over rescue-start flight');
  assert.equal(h.seen.sentence.length, 0, 'firsthour:sentence waits for an admitted surface');
  assert.equal(tutorialLines(h).filter((t) => t === STORE_FLIGHT_SENTENCE).length, 0);
  assert.equal(h.seen.toast.filter((t) => t && t.text === STORE_FLIGHT_SENTENCE).length, 0);

  // The deferred line lands once on the first glass-legal surface — the dock that owns the
  // store page it hooks — then silence.
  h.state.ui = { docked: true };
  tick(h);
  assert.equal(h.state.onboarding.storeSentence.shown, true);
  assert.equal(h.seen.sentence.length, 1, 'firsthour:sentence fires exactly once');
  assert.equal(h.seen.sentence[0].type, 'firsthour:sentence');
  assert.equal(h.seen.sentence[0].shown, true);
  assert.equal(h.seen.sentence[0].atS, h.state.simTime, 'shownAt is the admitted surface time');
  const said = tutorialLines(h).filter((t) => t === STORE_FLIGHT_SENTENCE);
  assert.equal(said.length, 1, 'tutorial voice speaks the sentence once');
  const toasts = h.seen.toast.filter((t) => t && t.text === STORE_FLIGHT_SENTENCE);
  assert.equal(toasts.length, 1, 'the line is actually shown once');
  assert.equal(toasts[0].id, 'firsthour:sentence');
  assert.equal(toasts[0].channel, 'tutorial',
    'the fallback carries the tutorial channel so the receipt lane agrees with the glass');

  // Silence: no second display if rescue:started is emitted again.
  h.bus.emit('rescue:started', { type: 'rescue:started', beats: ['swing', 'shove', 'grab'], atS: 11 });
  tick(h);
  assert.equal(h.seen.sentence.length, 1);
  assert.equal(tutorialLines(h).filter((t) => t === STORE_FLIGHT_SENTENCE).length, 1);
  assert.equal(h.seen.toast.filter((t) => t && t.text === STORE_FLIGHT_SENTENCE).length, 1);
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
  // The whole drive ran on the flight glass, so the sentence is still deferred — the
  // clauses were learned by doing, and the hook still waits for the dock.
  assert.equal(rec.shown, false, 'no sentence over the action, even after the whole drill');
  assert.equal(tutorialLines(h).filter((t) => t === STORE_FLIGHT_SENTENCE).length, 0);
  st.ui = { docked: true };
  tick(h);
  assert.equal(rec.shown, true);
  assert.equal(rec.clauses.swing.performed, true);
  assert.equal(rec.clauses.ammunition.performed, true);
  assert.equal(rec.clauses.speed.performed, true);
  assert.ok(rec.clauses.swing.atS < 600);
  assert.ok(rec.clauses.ammunition.atS < 600);
  assert.ok(rec.clauses.speed.atS < 600);
  assert.equal(allStoreClausesPerformedBefore(rec, 600), true);
  assert.equal(tutorialLines(h).filter((t) => t === STORE_FLIGHT_SENTENCE).length, 1);
  assert.equal(h.seen.sentence.length, 1);
  assert.equal(h.seen.sentence.some((e) => e.percent != null || e.rate != null), false,
    'funnel never invents a stranger-playtest percentage');

  const readback = strangerReadback(rec);
  console.log(readback.line);
  assert.equal(readback.seed, 16303);
  assert.equal(readback.complete, true);
  assert.equal(readback.textOnly, false);
  assert.equal(readback.line.startsWith('STRANGER_READBACK '), true);
  for (const clause of STORE_CLAUSES) {
    assert.equal(readback.clauses.includes(clause), true, `readback includes ${clause}`);
    assert.match(readback.line, new RegExp(STORE_CLAUSE_READBACK[clause].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('stranger readback fails closed when the sentence was only text', () => {
  const shownOnly = freshStoreSentenceState();
  shownOnly.shown = true;
  shownOnly.shownAt = 10;
  const empty = strangerReadback(shownOnly);
  assert.equal(empty.complete, false);
  assert.equal(empty.textOnly, true);
  assert.equal(empty.clauses.length, 0);
  assert.equal(empty.line, 'STRANGER_READBACK');
  console.log(`${empty.line} TEXT_ONLY`);
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
  assert.equal(tutorialLines(h).includes(STORE_FLIGHT_SENTENCE), false);
  assert.equal(h.seen.toast.some((t) => t && t.text === STORE_FLIGHT_SENTENCE), false);
});

test('with the live voice arbiter wired, the sentence is delivered at the dock and takes the floor once', () => {
  const h = bootLive();
  assert.equal(typeof h.helpers.voice.say, 'function', 'the live route hands onboarding a voice helper');
  launchDefaultRoute(h);

  // In flight the glass refuses the line: it never even reaches the arbiter queue, so no
  // floor and no fallback toast for the whole rescue drive.
  for (let i = 0; i < 120; i++) h.step();   // 30 s of sim on the flight glass
  assert.equal(h.seen.surface.filter((s) => s.text === STORE_FLIGHT_SENTENCE).length, 0,
    'the one-voice floor must not show the store hook over flight');
  assert.equal(h.seen.toast.filter((t) => t.text === STORE_FLIGHT_SENTENCE).length, 0);
  assert.equal(h.state.onboarding.storeSentence.shown, false);

  // The dock freeze skips every non-keepalive system — the arbiter among them — so the
  // keepalive dock caller delivers the line (once) into the arbiter queue, and no docked
  // tick can promote it to the floor: the frozen world steps no queue.
  h.state.ui = { docked: true };
  for (let i = 0; i < 40; i++) h.step();
  assert.equal(h.state.onboarding.storeSentence.shown, true,
    'the HIDDEN_KEEPALIVE dock caller delivers the line at the admitted surface');
  assert.equal(h.seen.surface.filter((s) => s.text === STORE_FLIGHT_SENTENCE).length, 0,
    'a frozen dock cannot take the one-voice floor — nothing steps the arbiter');

  // Launch: the arbiter's first flight tick promotes the delivered line — exactly once,
  // while its ttl is still live.
  h.state.ui = { docked: false };
  for (let i = 0; i < 40; i++) h.step();
  const shown = h.seen.surface.filter((s) => s.text === STORE_FLIGHT_SENTENCE);
  assert.equal(shown.length, 1, 'the sentence takes the one-voice floor exactly once');
  assert.equal(shown[0].id, 'firsthour:sentence');
  assert.equal(shown[0].channel, 'tutorial', 'tutorial channel survives the tutorialProtect policy');
  const mirrored = h.seen.toast.filter((t) => t.text === STORE_FLIGHT_SENTENCE);
  assert.equal(mirrored.length, 1, 'one visible surface, not two');
  assert.equal(mirrored[0]._fromVoice, true, 'the shown copy is the arbiter mirror');
  assert.ok(h.seen.clear.some((c) => c.id === 'firsthour:sentence'),
    'the floor is released again — one line, then silence');

  // Silence: a second rescue:started must not re-take the floor.
  h.bus.emit('rescue:started', { type: 'rescue:started', beats: ['swing', 'shove', 'grab'], atS: h.state.simTime });
  for (let i = 0; i < 40; i++) h.step();
  assert.equal(h.seen.surface.filter((s) => s.text === STORE_FLIGHT_SENTENCE).length, 1);
  assert.equal(h.seen.toast.filter((t) => t.text === STORE_FLIGHT_SENTENCE).length, 1);
});
