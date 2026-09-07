// Missing-three proof (PQ-163.02): boost, draw-to-fly, and the well enter the first-hour rail.
//
// After the rescue grab, each verb is taught by doing, then silence, with a Range fallback.
// Funnel events fire on use. No invented unaided-tester percentages.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { FLIGHT_DRILL_BEATS } from '../src/onboarding/flightDrill.js';
import {
  RESCUE_PROOF_SEED,
  rescueBeatLine,
  rescuePodAtBeacon,
  rescueRockHitDerelict,
} from '../src/onboarding/rescueOpening.js';
import {
  FIRST_HOUR_S,
  MISSING_THREE_BEATS,
  MISSING_THREE_GATE,
  MISSING_THREE_ORDER,
  MISSING_THREE_PREREQ,
  buildFirstHourVerbEvent,
  freshMissingThreeState,
  missingThreeBeatLine,
  missingThreeBoosting,
  missingThreeRangeRungId,
  missingThreeStrokeActive,
  missingThreeWithinHour,
} from '../src/onboarding/missingThree.js';
import { MISSING_THREE_BEAT_LINES } from '../src/ui/hudAttention.js';
import {
  RANGE_RAIL_ROWS,
  rangeRungIndex,
  resolveRescueEntryRung,
} from '../src/ui/screens/range.js';
import { onboarding } from '../src/systems/onboarding.js';

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
  const seen = { rescue: [], firsthour: [], rangePrompt: [] };
  bus.on('rescue:started', (p) => seen.rescue.push({ event: 'rescue:started', ...p }));
  bus.on('rescue:beat', (p) => seen.rescue.push({ event: 'rescue:beat', ...p }));
  bus.on('rescue:complete', (p) => seen.rescue.push({ event: 'rescue:complete', ...p }));
  bus.on('firsthour:started', (p) => seen.firsthour.push({ event: 'firsthour:started', ...p }));
  bus.on('firsthour:verb', (p) => seen.firsthour.push({ event: 'firsthour:verb', ...p }));
  bus.on('firsthour:beat', (p) => seen.firsthour.push({ event: 'firsthour:beat', ...p }));
  bus.on('firsthour:complete', (p) => seen.firsthour.push({ event: 'firsthour:complete', ...p }));
  bus.on('onboarding:rangePrompt', (p) => seen.rangePrompt.push(p));
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
  assert.ok(rescueRockHitDerelict(rock, derelict), 'the proof setup is a genuine hit');
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
  assert.ok(rescuePodAtBeacon(pod, beacon), 'the proof setup is a genuine delivery');
  tick(h);
}

function driveRescueToGrab(h) {
  driveDrillTo(h, 'tether');
  completeSwing(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  const scout = rescueActor(h, 'scout');
  h.bus.emit('tether:whipImpact', {
    targetId: h.state.onboarding.rescue.ids.rock,
    victimId: scout.id,
    relSpeed: 24,
  });
  tick(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'disengage');
  completeGrab(h);
}

test('missing-three contract: three verbs after grab, one line each, Range-backed', () => {
  assert.deepEqual(MISSING_THREE_ORDER, ['boost', 'stroke', 'well']);
  assert.deepEqual(MISSING_THREE_BEATS.map((b) => b.key), MISSING_THREE_ORDER);
  assert.deepEqual(MISSING_THREE_PREREQ, { boost: 'grab', stroke: 'boost', well: 'stroke' });
  assert.deepEqual(MISSING_THREE_GATE, { boost: 'seam', stroke: 'seam', well: 'seam' });
  for (const key of MISSING_THREE_ORDER) {
    const line = missingThreeBeatLine(key);
    assert.ok(line, `missing-three beat needs its verb line: ${key}`);
    assert.equal(line, MISSING_THREE_BEAT_LINES[key], 'copy is owned by hudAttention');
    assert.ok(line.trim().split(/\s+/).length <= 12, `line too long: ${line}`);
    assert.doesNotMatch(line, /\b(?:Key[A-Z]|Arrow|LMB|RMB|Space|Shift|[WASDFG]|Digit)\b/,
      `copy must not hard-code a physical binding: ${line}`);
  }
  assert.equal(missingThreeRangeRungId('boost'), 'boost_keep_speed');
  assert.equal(missingThreeRangeRungId('stroke'), 'draw_the_stroke');
  assert.equal(missingThreeRangeRungId('well'), 'well_pulls_light');
  assert.equal(rangeRungIndex('swing_do_not_pull'), 2, 'swing rung index stays put');
  assert.equal(rangeRungIndex('boost_keep_speed'), 4);
  assert.equal(rangeRungIndex('draw_the_stroke'), 5);
  assert.equal(rangeRungIndex('well_pulls_light'), 6);
  assert.ok(RANGE_RAIL_ROWS.some((row) => row.id === 'boost_keep_speed'));
  assert.ok(missingThreeBoosting({ input: { boost: true } }, null));
  assert.ok(missingThreeStrokeActive({ autoTargetPath: { active: true, points: [{}, {}] } }));
  assert.equal(missingThreeWithinHour(100, 0, FIRST_HOUR_S), true);
  assert.equal(missingThreeWithinHour(4000, 0, FIRST_HOUR_S), false);
  assert.deepEqual(JSON.parse(JSON.stringify(freshMissingThreeState())), freshMissingThreeState());
  assert.deepEqual(buildFirstHourVerbEvent('boost', 12, { prompted: true, unprompted: false, taught: false }), {
    type: 'firsthour:verb',
    verb: 'boost',
    prompted: true,
    unprompted: false,
    taught: false,
    withinHour: true,
    atS: 12,
  });
});

test('drill rail and rescue stay untouched: B0 is thrust, swing still gates burst', () => {
  assert.deepEqual(
    FLIGHT_DRILL_BEATS.map((beat) => beat.key),
    ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'],
  );
  const h = boot();
  launchDefaultRoute(h);
  tick(h);
  assert.equal(h.state.onboarding.currentBeat, 0, 'B0 still opens the rail');
  driveDrillTo(h, 'tether');
  assert.equal(h.state.onboarding.rescue.current, 'swing');
  assert.equal(tutorialLines(h).at(-1), rescueBeatLine('swing'));
});

test('harness boots never stage the missing-three rail (golden-safe)', () => {
  const h = boot();
  h.bus.emit('game:started', { source: 'sf-sim', scenario: '47a' });
  assert.equal(h.state.onboarding.missingThree, undefined);
  assert.deepEqual(h.seen.firsthour, []);
});

test('Range fallback lands on the current missing-three rung', () => {
  assert.equal(resolveRescueEntryRung({
    onboarding: { missingThree: { current: 'boost' } },
  }), 4);
  assert.equal(resolveRescueEntryRung({
    onboarding: { missingThree: { current: 'stroke' } },
  }), 5);
  assert.equal(resolveRescueEntryRung({
    onboarding: { missingThree: { current: 'well' } },
  }), 6);
  assert.equal(resolveRescueEntryRung({
    onboarding: { rescue: { current: 'swing' } },
  }), 2, 'rescue swing still owns SWING, DO NOT PULL');
  assert.equal(resolveRescueEntryRung({
    onboarding: { rangePromptActive: true },
  }), 2, 'first-latch prompt still opens on the swing rung');
  assert.equal(resolveRescueEntryRung({
    onboarding: { rangePromptActive: true, rangePromptRungId: 'boost_keep_speed' },
  }), 4);
});

test('the three verbs complete in play after the rescue grab, then seam may start', () => {
  const h = boot();
  launchDefaultRoute(h);
  driveRescueToGrab(h);
  const st = h.state;
  assert.equal(st.onboarding.rescue.completed, true);
  assert.equal(st.onboarding.missingThree.current, 'boost');
  assert.equal(tutorialLines(h).at(-1), missingThreeBeatLine('boost'));
  assert.equal(resolveRescueEntryRung(st), 4);

  const gatedBeat = st.onboarding.currentBeat;
  tick(h);
  assert.equal(st.onboarding.currentBeat, gatedBeat, 'seam waits for the missing three');

  st.input.boost = true;
  tick(h);
  assert.equal(st.onboarding.missingThree.beats.boost.state, 'done');
  const boostVerb = h.seen.firsthour.find((e) => e.event === 'firsthour:verb' && e.verb === 'boost');
  assert.ok(boostVerb);
  assert.equal(boostVerb.prompted, true);
  assert.equal(boostVerb.unprompted, false);

  st.input.boost = false;
  advanceTime(h);
  tick(h);
  assert.equal(st.onboarding.missingThree.current, 'stroke');
  assert.equal(tutorialLines(h).at(-1), missingThreeBeatLine('stroke'));
  assert.equal(resolveRescueEntryRung(st), 5);

  st.input.autoTargetPath = {
    active: true,
    drawing: false,
    points: [{ x: 0, z: 0 }, { x: 40, z: 10 }, { x: 80, z: 20 }],
  };
  tick(h);
  assert.equal(st.onboarding.missingThree.beats.stroke.state, 'done');

  st.input.autoTargetPath = { active: false, drawing: false, points: [] };
  advanceTime(h);
  tick(h);
  assert.equal(st.onboarding.missingThree.current, 'well');
  assert.equal(tutorialLines(h).at(-1), missingThreeBeatLine('well'));
  assert.ok(st.onboarding.missingThree.ids.scrap != null, 'well lesson stages light scrap');
  assert.equal(resolveRescueEntryRung(st), 6);

  h.bus.emit('fields:deployed', { kind: 'well', sourceId: st.playerId, fieldId: 'field_well_test' });
  tick(h);
  assert.equal(st.onboarding.missingThree.beats.well.state, 'done');
  assert.equal(st.onboarding.missingThree.completed, true);
  const complete = h.seen.firsthour.find((e) => e.event === 'firsthour:complete');
  assert.ok(complete);
  assert.deepEqual(complete.beats, ['boost', 'stroke', 'well']);

  const threeLines = tutorialLines(h).filter((t) => Object.values(MISSING_THREE_BEAT_LINES).includes(t));
  assert.deepEqual(threeLines, [
    missingThreeBeatLine('boost'),
    missingThreeBeatLine('stroke'),
    missingThreeBeatLine('well'),
  ]);

  advanceTime(h);
  tick(h);
  const seam = FLIGHT_DRILL_BEATS.length; // seam is the first beat after the drill
  assert.equal(st.onboarding.currentBeat, seam, 'seam opens after the three verbs and silence');
});

test('a later unprompted use is recorded without inventing a tester percentage', () => {
  const h = boot();
  launchDefaultRoute(h);
  driveRescueToGrab(h);
  h.state.input.boost = true;
  tick(h);
  h.state.input.boost = false;
  tick(h);
  h.state.input.boost = true;
  tick(h);
  const uses = h.seen.firsthour.filter((e) => e.event === 'firsthour:verb' && e.verb === 'boost');
  assert.ok(uses.length >= 2, 'prompted then unprompted uses both fire');
  assert.equal(uses[0].prompted, true);
  assert.equal(uses[1].unprompted, true);
  assert.equal(uses[1].taught, true);
  assert.equal(uses.some((e) => e.percent != null || e.rate != null), false,
    'funnel never invents a tester percentage');
});
