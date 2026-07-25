import assert from 'node:assert/strict';
import test from 'node:test';

import {
  input,
  resolveMiddleMouseCourseIntent,
} from '../src/systems/input.js';
import {
  controlPrompt,
  setPromptScheme,
} from '../src/ui/controlPrompts.js';

function makeState(target) {
  const player = {
    id: 'player',
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
  };
  const entities = new Map([[player.id, player]]);
  if (target) entities.set(target.id, target);
  return {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: player.id,
    player: { targetId: target?.id ?? null, tether: { active: false, targetId: null } },
    entities,
    ui: { screenStack: [] },
    settings: {},
    nav: {},
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      autoFire: false,
    },
  };
}

function makeInputHarness(events) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._prevM1 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = {
    emit(type, payload) {
      events.push({ type, payload });
    },
  };
  host.gamepad = null;
  host.touch = null;
  return host;
}

test('MMB resolves a selected non-ship object into one world-owned local course intent', () => {
  const target = {
    id: 'cathedral_hull',
    type: 'wreck',
    alive: true,
    name: 'Cathedral Hull',
    pos: { x: -11980, z: 10888 },
    radius: 140,
    data: {
      worldSiteTargetable: true,
      worldSiteComponentId: 'cathedral_hull',
    },
  };
  assert.deepEqual(resolveMiddleMouseCourseIntent(makeState(target)), {
    pos: { x: -11980, z: 10888 },
    targetEntityId: target.id,
    label: 'Cathedral Hull',
    reason: 'Course to Cathedral Hull',
    waypointKind: 'local',
    arrivalRadius: 170,
    autopilot: true,
  });
});

test('MMB emits once per physical edge and a release permits one later course request', () => {
  const target = {
    id: 'relay',
    type: 'station',
    alive: true,
    pos: { x: 120, z: -40 },
    radius: 12,
    data: { name: 'Recovery Relay' },
  };
  const state = makeState(target);
  const events = [];
  const host = makeInputHarness(events);

  host._m1 = true;
  host.update(1 / 60, state);
  host.update(1 / 60, state);
  assert.equal(events.filter((event) => event.type === 'ui:setCourse').length, 1);

  host._m1 = false;
  host.update(1 / 60, state);
  host._m1 = true;
  host.update(1 / 60, state);
  const courses = events.filter((event) => event.type === 'ui:setCourse');
  assert.equal(courses.length, 2);
  assert.equal(courses[1].payload.targetEntityId, target.id);
  assert.equal(courses[1].payload.autopilot, true);
});

test('MMB never restores ship/drone pursuit and rejects dead or non-finite targets', () => {
  for (const target of [
    { id: 'ship', type: 'ship', alive: true, pos: { x: 20, z: 0 } },
    { id: 'drone', type: 'drone', alive: true, pos: { x: 20, z: 0 } },
    { id: 'dead', type: 'wreck', alive: false, pos: { x: 20, z: 0 } },
    { id: 'bad-pos', type: 'wreck', alive: true, pos: { x: Number.NaN, z: 0 } },
  ]) {
    const state = makeState(target);
    assert.equal(resolveMiddleMouseCourseIntent(state), null, target.id);
    const events = [];
    const host = makeInputHarness(events);
    host._m1 = true;
    host.update(1 / 60, state);
    assert.equal(events.some((event) => event.type === 'ui:setCourse'), false, target.id);
  }
});

test('moving non-ship objects produce coordinate snapshots, never live target-following ids', () => {
  for (const type of ['freighter', 'payload', 'pickup', 'projectile']) {
    const target = {
      id: `${type}-moving`,
      type,
      alive: true,
      pos: { x: 40, z: -10 },
      vel: { x: 12, z: 3 },
      data: type === 'payload' ? { worldSiteTargetable: true } : {},
    };
    const course = resolveMiddleMouseCourseIntent(makeState(target));
    assert.deepEqual(course.pos, target.pos, type);
    assert.equal('targetEntityId' in course, false, type);
  }
});

test('MMB pressed while a modal owns input cannot leak into a deferred post-modal course edge', () => {
  const target = {
    id: 'cathedral_hull',
    type: 'wreck',
    alive: true,
    pos: { x: 90, z: 20 },
    data: {
      worldSiteTargetable: true,
      worldSiteComponentId: 'cathedral_hull',
    },
  };
  const state = makeState(target);
  const events = [];
  const host = makeInputHarness(events);

  state.ui.screenStack.push('pause');
  host._m1 = true;
  host.update(1 / 60, state);
  state.ui.screenStack.length = 0;
  host.update(1 / 60, state);
  assert.equal(events.some((event) => event.type === 'ui:setCourse'), false);

  host._m1 = true;
  host.update(1 / 60, state);
  assert.equal(events.filter((event) => event.type === 'ui:setCourse').length, 1);
});

test('player-facing keyboard prompts teach only the shipped selected-object course', () => {
  for (const scheme of ['classic', 'helm-assist', 'pilot']) {
    setPromptScheme(scheme);
    for (const key of ['flight', 'combat']) {
      const prompt = controlPrompt(key, 'kbm');
      assert.match(prompt, /MMB course selected non-ship object/i, `${scheme}/${key}`);
      assert.doesNotMatch(prompt, /MMB[^•]*pursu|pursu[^•]*MMB/i, `${scheme}/${key}`);
    }
  }
});
