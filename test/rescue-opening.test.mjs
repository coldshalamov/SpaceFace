// Rescue-opening proof (PQ-163.00): the tow-rig opening completes on a fixed seed.
//
// Drives the REAL onboarding system over the event bus on seed 47: staging is
// deterministic, the three verbs (swing-release, shove, grab-and-run) complete in play,
// the drill rail is untouched (B0 still thrust), and the funnel records complete/fail
// per beat. No invented percentages — the funnel events are the deliverable.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { FLIGHT_DRILL_BEATS } from '../src/onboarding/flightDrill.js';
import {
  RESCUE_BEATS,
  RESCUE_GATE,
  RESCUE_ORDER,
  RESCUE_PREREQ,
  RESCUE_PROOF_SEED,
  freshRescueState,
  makeRescueCastSpecs,
  rescueBeatLine,
  rescuePodAtBeacon,
  rescueRangeRungId,
  rescueRockHitDerelict,
  rescueScoutAtAsteroid,
} from '../src/onboarding/rescueOpening.js';
import { RESCUE_BEAT_LINES } from '../src/ui/hudAttention.js';
import { resolveRescueEntryRung } from '../src/ui/screens/range.js';
import { onboarding } from '../src/systems/onboarding.js';

// ── Minimal DOM stub: the system builds its status panel on the presentation route. ──────
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

// ── Harness (mirrors flight-drill-onboarding.test.mjs) ────────────────────────────────────
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
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function bootRescue() {
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
  const seen = { rescue: [], shove: [], toast: 0 };
  bus.on('rescue:started', (p) => seen.rescue.push({ event: 'rescue:started', ...p }));
  bus.on('rescue:beat', (p) => seen.rescue.push({ event: 'rescue:beat', ...p }));
  bus.on('rescue:complete', (p) => seen.rescue.push({ event: 'rescue:complete', ...p }));
  bus.on('combat:shove', (p) => seen.shove.push(p));
  bus.on('toast', () => { seen.toast += 1; });
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned, seen };
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

// Drive the drill rail forward to the DONE of the named beat (mirrors the drill's own
// proof). Resumes where the last call stopped: the drill retires old training actors on
// trainer spawn, and an open rescue verb gates its drill beat, so replaying from thrust
// would fight both. Rescue verbs are completed explicitly in the gaps between calls.
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
      tick(h); // enters marker, spawns the trainer
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

// Complete the current rescue verb the honest way the fiction demands.
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
  assert.ok(rescueRockHitDerelict(rock, derelict), 'the proof setup is a genuine hit');
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
  assert.ok(rescuePodAtBeacon(pod, beacon), 'the proof setup is a genuine delivery');
  tick(h);
}

// ── Contract ──────────────────────────────────────────────────────────────────────────────
test('rescue contract: three verbs in order, one line each, drill-gated, range-backed', () => {
  assert.deepEqual(RESCUE_ORDER, ['swing', 'shove', 'grab']);
  assert.deepEqual(RESCUE_BEATS.map((b) => b.key), RESCUE_ORDER);
  assert.deepEqual(RESCUE_PREREQ, { swing: 'tether', shove: 'burst', grab: 'disengage' });
  assert.deepEqual(RESCUE_GATE, { swing: 'burst', shove: 'disengage', grab: 'seam' });
  for (const key of RESCUE_ORDER) {
    const line = rescueBeatLine(key);
    assert.ok(line, `rescue beat needs its verb line: ${key}`);
    assert.equal(line, RESCUE_BEAT_LINES[key], 'copy is owned by hudAttention');
    assert.ok(line.trim().split(/\s+/).length <= 12, `rescue line too long: ${line}`);
    assert.doesNotMatch(line, /\b(?:Key[A-Z]|Arrow|LMB|RMB|Space|Shift|[WASDFG])\b/,
      `copy must not hard-code a physical binding: ${line}`);
  }
  assert.equal(rescueRangeRungId('swing'), 'swing_do_not_pull', 'the swing owns the first drill rung');
  assert.equal(rescueRangeRungId('shove'), null, 'no rung, no pointer: never a wrong lesson');
  assert.equal(rescueRangeRungId('grab'), null, 'no rung, no pointer: never a wrong lesson');
  // The Range entry helper lands a mid-rescue player on the swing drill, else rail top.
  assert.equal(resolveRescueEntryRung({ onboarding: { rescue: { current: 'swing' } } }), 2);
  assert.equal(resolveRescueEntryRung({ onboarding: { rescue: { current: 'shove' } } }), 0);
  assert.equal(resolveRescueEntryRung({ onboarding: null }), 0);
  // Fresh funnel state is plain JSON (save-safe).
  assert.deepEqual(JSON.parse(JSON.stringify(freshRescueState())), freshRescueState());
});

test('drill rail untouched: B0 is still thrust and the flight drill keeps its order', () => {
  assert.deepEqual(
    FLIGHT_DRILL_BEATS.map((beat) => beat.key),
    ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'],
  );
  const h = bootRescue();
  launchDefaultRoute(h);
  tick(h);
  assert.equal(h.state.onboarding.currentBeat, 0, 'B0 still opens the rail');
  const lines = tutorialLines(h);
  assert.ok(lines.length >= 1, 'B0 speaks once');
  assert.ok(!lines.some((t) => t === rescueBeatLine('swing')), 'no rescue verb before its drill prereq');
});

test('staging is deterministic on the fixed seed and stages a towable tableau', () => {
  const first = makeRescueCastSpecs({ x: 0, z: 0 }, mulberry32(RESCUE_PROOF_SEED));
  const second = makeRescueCastSpecs({ x: 0, z: 0 }, mulberry32(RESCUE_PROOF_SEED));
  assert.deepEqual(first, second, 'same seed stages the same tableau');
  const other = makeRescueCastSpecs({ x: 0, z: 0 }, mulberry32(RESCUE_PROOF_SEED + 1));
  assert.notDeepEqual(first, other, 'the tableau is seeded, not static');

  const h = bootRescue();
  launchDefaultRoute(h);
  const ids = h.state.onboarding.rescue.ids;
  assert.deepEqual(Object.keys(ids).sort(), ['asteroid', 'beacon', 'derelict', 'pod', 'rock', 'scout']);
  for (const slot of Object.keys(ids)) {
    assert.ok(ids[slot] != null, `rescue slot staged in play: ${slot}`);
  }
  const scout = rescueActor(h, 'scout');
  assert.equal(scout.flags.invuln, true, 'the scout survives the lesson');
  assert.deepEqual(scout.data.weapons, [], 'the scout cannot shoot back');
  assert.equal(scout.data.ai.passive, true, 'the scout never acts tactically');
  assert.equal(scout.mass, 16, 'the scout is light enough for the starter gun to shove');
  assert.equal(scout.team, 1, 'the scout is not on the player team');
  const pod = rescueActor(h, 'pod');
  assert.equal(pod.data.tetherPayload, true, 'the pod is a towable payload');
  const started = h.seen.rescue.find((e) => e.event === 'rescue:started');
  assert.ok(started, 'the funnel opens with rescue:started');
  assert.deepEqual(started.beats, ['swing', 'shove', 'grab']);
});

test('harness boots with a scenario payload never stage the rescue (golden-safe)', () => {
  const h = bootRescue();
  h.bus.emit('game:started', { source: 'sf-sim', scenario: '47a' });
  assert.equal(h.state.onboarding.rescue, undefined, 'the slice harness keeps its own cast');
  assert.equal(h.state.entityList.length, 1, 'no rescue bodies enter the harness snapshot');
  assert.deepEqual(h.seen.rescue, [], 'no funnel events on a harness boot');
});

test('the three beats complete in play on the fixed seed: swing, shove, grab-and-run', () => {
  const h = bootRescue();
  launchDefaultRoute(h);
  const st = h.state;
  const player = st.entities.get(st.playerId);

  driveDrillTo(h, 'tether');
  // The swing opens in the tether gap and gates the burst: one verb at a time.
  assert.equal(st.onboarding.rescue.current, 'swing');
  assert.equal(tutorialLines(h).at(-1), rescueBeatLine('swing'));
  assert.equal(st.nav.waypoint.markerId, 'rescue:swing');
  const gatedBeat = st.onboarding.currentBeat;
  tick(h);
  assert.equal(st.onboarding.currentBeat, gatedBeat, 'the burst waits for the swing');

  // Latch the rock, winch tight, cut — then the rock does the work through the wreck.
  const pickupsBefore = h.spawned.filter((e) => e.type === 'pickup').length;
  completeSwing(h);
  assert.equal(st.onboarding.rescue.beats.swing.state, 'done');
  assert.equal(st.onboarding.rescue.current, null);
  assert.ok(h.spawned.filter((e) => e.type === 'pickup').length >= pickupsBefore + 2,
    'the vacuum shows itself: scrap shakes loose');
  const swingDone = h.seen.rescue.find((e) => e.event === 'rescue:beat' && e.beat === 'swing');
  assert.deepEqual(
    { beat: swingDone.beat, result: swingDone.result },
    { beat: 'swing', result: 'complete' },
  );

  // Silence, then the drill resumes and the burst opens the shove.
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  assert.equal(st.onboarding.rescue.current, 'shove');
  assert.equal(tutorialLines(h).at(-1), rescueBeatLine('shove'));
  assert.equal(st.nav.waypoint.markerId, 'rescue:shove');

  // The starter gun moves the scout; the asteroid stops it. Whip receipts count too.
  const scout = rescueActor(h, 'scout');
  h.bus.emit('combat:fire', { ownerId: player.id, weaponId: 'wpn_pulse_laser_s' });
  assert.equal(st.onboarding.rescue.shoveShots, 1, 'the shove tracks starter-gun fire');
  h.bus.emit('tether:whipImpact', { targetId: st.onboarding.rescue.ids.rock, victimId: scout.id, relSpeed: 24 });
  tick(h);
  assert.equal(st.onboarding.rescue.beats.shove.state, 'done');
  assert.equal(h.seen.shove.length, 1, 'a real shove emits the honest combat:shove event');
  assert.equal(h.seen.shove[0].targetId, scout.id);

  // Silence, disengage, and the grab opens with the pod as the mark.
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'disengage');
  assert.ok(st.onboarding.beatDoneAt.disengage != null);
  assert.equal(st.onboarding.rescue.current, 'grab');
  assert.equal(tutorialLines(h).at(-1), rescueBeatLine('grab'));
  assert.equal(st.nav.waypoint.markerId, 'rescue:grab');

  // Latch the pod and run it home at speed.
  assert.match(st.nav.waypoint.label, /Escape Pod/, 'unlatched: the pod is the mark');
  completeGrab(h);
  assert.equal(st.onboarding.rescue.beats.grab.state, 'done');
  assert.equal(st.onboarding.rescue.completed, true);
  const complete = h.seen.rescue.find((e) => e.event === 'rescue:complete');
  assert.ok(complete, 'the funnel closes with rescue:complete');
  assert.deepEqual(complete.beats, ['swing', 'shove', 'grab']);

  // One voice the whole way: exactly one line per verb, each the beat's verb.
  const lines = tutorialLines(h);
  const rescueLines = lines.filter((t) => Object.values(RESCUE_BEAT_LINES).includes(t));
  assert.deepEqual(rescueLines, [rescueBeatLine('swing'), rescueBeatLine('shove'), rescueBeatLine('grab')]);
});

test('shove also completes on contact proof: scout into the asteroid at speed', () => {
  const h = bootRescue();
  launchDefaultRoute(h);
  driveDrillTo(h, 'tether');
  completeSwing(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  assert.equal(h.state.onboarding.rescue.current, 'shove');
  const scout = rescueActor(h, 'scout');
  const asteroid = rescueActor(h, 'asteroid');
  scout.pos.x = asteroid.pos.x + 40;
  scout.pos.z = asteroid.pos.z;
  scout.vel.x = 20;
  scout.vel.z = 0;
  assert.ok(rescueScoutAtAsteroid(scout, asteroid), 'the proof setup is a genuine shove');
  tick(h);
  assert.equal(h.state.onboarding.rescue.beats.shove.state, 'done');
  assert.equal(h.seen.shove.length, 1);
});

test('failures record the beat, restage the body, and retry without a wall', () => {
  const h = bootRescue();
  launchDefaultRoute(h);
  driveDrillTo(h, 'tether');
  assert.equal(h.state.onboarding.rescue.current, 'swing');

  // The rock is destroyed mid-swing: fail, fresh rock, same verb still current.
  const rockId = h.state.onboarding.rescue.ids.rock;
  h.bus.emit('entity:killed', { id: rockId, killerId: 999, type: 'asteroid' });
  const fail = h.seen.rescue.find((e) => e.event === 'rescue:beat' && e.result === 'fail');
  assert.ok(fail, 'destruction records a fail');
  assert.equal(fail.beat, 'swing', 'the fail names its beat');
  assert.equal(h.state.onboarding.rescue.beats.swing.fails, 1);
  assert.equal(h.state.onboarding.rescue.current, 'swing', 'the beat retries: no wall');
  const freshRockId = h.state.onboarding.rescue.ids.rock;
  assert.ok(freshRockId != null && freshRockId !== rockId, 'a fresh rock is staged');
  assert.equal(tutorialLines(h).at(-1), rescueBeatLine('swing'), 'the verb is re-spoken once');

  // Finish the swing after the fail: the funnel carries the fail count.
  const rock = rescueActor(h, 'rock');
  const derelict = rescueActor(h, 'derelict');
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, before: 80, after: 40 });
  h.bus.emit('tether:released', { targetId: rock.id });
  rock.pos.x = derelict.pos.x + 20;
  rock.pos.z = derelict.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  tick(h);
  const done = h.seen.rescue.find((e) => e.event === 'rescue:beat' && e.beat === 'swing' && e.result === 'complete');
  assert.ok(done);
  assert.equal(done.fails, 1);

  // An escaped scout fails the shove and is brought back into the tableau.
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  const scout = rescueActor(h, 'scout');
  const player = h.state.entities.get(h.state.playerId);
  scout.pos.x = player.pos.x + 2000;
  scout.pos.z = player.pos.z;
  tick(h);
  const shoveFail = h.seen.rescue.find((e) => e.event === 'rescue:beat' && e.beat === 'shove' && e.result === 'fail');
  assert.ok(shoveFail, 'an escaped scout records the fail');
  const resetScout = rescueActor(h, 'scout');
  const backInRange = Math.hypot(resetScout.pos.x - player.pos.x, resetScout.pos.z - player.pos.z);
  assert.ok(backInRange <= 1500, 'the scout is brought back: retry, not wall');
});

test('a kill before its beat never yanks the rail', () => {
  const h = bootRescue();
  launchDefaultRoute(h);
  const podId = h.state.onboarding.rescue.ids.pod;
  h.bus.emit('entity:killed', { id: podId, killerId: 999, type: 'payload' });
  assert.equal(h.state.onboarding.rescue.current, null, 'no beat is current yet, none starts early');
  assert.deepEqual(h.seen.rescue.filter((e) => e.result === 'fail'), [], 'no fail without an attempt');
  assert.ok(h.state.onboarding.rescue.ids.pod !== podId, 'the body is still restaged');
});
