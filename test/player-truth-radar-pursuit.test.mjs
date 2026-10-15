import test from 'node:test';
import assert from 'node:assert/strict';
import { radarHostileCourseText, publishRadarHostileCourse } from '../src/ui/radar.js';
import { readTarget, fightBeat } from '../scripts/player-truth/driver.mjs';

function radarCanvas() {
  const attributes = new Map();
  return { offsetParent: {}, getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) };
}

test('visible-pack retreat releases yaw before a slow observer can stretch the turn past its bearing', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const canvas = { tagName: 'CANVAS', classList: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 }, rot: Math.PI - 1.5, hull: 260, hullMax: 260 };
  const enemies = [20, 30, 40].map((x, i) => ({ id: i + 2, alive: true, team: 3, type: 'ship',
    pos: { x, z: 0 }, data: { runRole: 'enemy' } }));
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 },
    run: { kind: 'survival', phase: 'active' }, entityList: [player, ...enemies],
    render: { camera: {}, renderer: { domElement: canvas } } };
  const held = new Set(); const taps = [];
  const step = seconds => {
    state.simTime += seconds;
    player.rot += (held.has('KeyD') ? 1 : held.has('KeyA') ? -1 : 0) * 4.5 * seconds;
  };
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => step(0.15),
    __ptObserve: async () => {
      assert.ok(!held.has('KeyA') && !held.has('KeyD'), 'observer latency must not prolong yaw');
      step(1.2); return null;
    },
    keyboard: { down: async key => held.add(key), up: async key => held.delete(key),
      press: async (key, { delay = 0 } = {}) => {
        taps.push({ key, delay }); held.add(key); step(delay / 1000); held.delete(key);
      } },
    mouse: { move: async () => {}, down: async () => {}, up: async () => {} } };
  try {
    globalThis.window = { SF: { state, THREE: { Vector3: class {} }, ctx: { helpers: {
      worldToScreen: pos => ({ x: 500 + pos.x, y: 300, onScreen: true, behind: false }),
    } } } };
    globalThis.document = { querySelector: () => null, elementFromPoint: () => canvas };
    const before = Math.abs((await readTarget()).away);
    await fightBeat(page, 1);
    assert.ok(taps.some(tap => tap.key === 'KeyD'));
    assert.ok(taps.every(tap => tap.delay <= 80));
    assert.ok(Math.abs((await readTarget()).away) < before, 'public escape bearing improves despite slow observation');
    assert.equal(held.size, 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

for (const releases of [true, false]) test(`visible-target fighter ${releases ? 'cuts before steering and fire' : 'waits when the public tether stays attached'}`, async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldStyle = globalThis.getComputedStyle;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  const payload = { offsetParent: {}, hidden: false, getBoundingClientRect: () => ({ width: 50, height: 20 }) };
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const enemy = { id: 2, alive: true, team: 3, type: 'ship', pos: { x: 20, z: 0 }, data: { runRole: 'enemy' } };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 },
    run: { kind: 'survival', phase: 'active' }, entityList: [player, enemy],
    render: { camera: {}, meshes: new Map([[2, { visible: true, matrixWorld: enemy.pos }]]), renderer: { domElement: canvas } } };
  let attached = true, fired = 0;
  const order = [], held = new Set();
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => { state.simTime += 0.2; },
    keyboard: { press: async key => { order.push(key); if (releases) attached = false; },
      down: async key => { assert.equal(attached, false, 'a known line must release before steering'); held.add(key); },
      up: async key => held.delete(key) },
    mouse: { move: async () => {}, down: async () => {
      assert.equal(attached, false, 'a known line must release before firing'); fired++; order.push('fire');
    }, up: async () => {} } };
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state } };
    globalThis.document = { elementFromPoint: () => canvas,
      querySelector: selector => attached && selector === '.orr-cluster__payload' ? payload : null };
    globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    await fightBeat(page, 1);
    assert.equal(order[0], 'Space', 'cut through the default public tether binding');
    assert.equal(fired, releases ? 1 : 0);
    assert.equal(held.size, 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = oldStyle;
  }
});

test('the public radar describes only a currently painted hostile course and clears empty/menu readings', () => {
  const canvas = radarCanvas(); const baseLabel = 'Local tactical radar.';
  const marks = [{ x: 50, y: 10 }, { x: 51, y: 50 }];
  const courseText = radarHostileCourseText(marks, 50, null, 1);
  assert.equal(courseText, "Nearest hostile at 12 o'clock, dial bearing 0 degrees.", 'an unpainted closer mark cannot become a cue');
  publishRadarHostileCourse(canvas, { baseLabel, courseText, mode: 'flight', simTime: 10 });
  assert.equal(canvas.getAttribute('aria-label'), `${baseLabel} ${courseText}`);
  assert.equal(canvas.getAttribute('data-radar-bearing-sim'), '10');
  publishRadarHostileCourse(canvas, { baseLabel, courseText: radarHostileCourseText([], 50), mode: 'flight', simTime: 11 });
  assert.equal(canvas.getAttribute('aria-label'), baseLabel);
  assert.equal(canvas.getAttribute('data-radar-bearing-sim'), null);
  publishRadarHostileCourse(canvas, { baseLabel, courseText, mode: 'menu', simTime: 12 });
  assert.equal(canvas.getAttribute('aria-label'), baseLabel);
  assert.equal(canvas.getAttribute('data-radar-bearing-sim'), null);
  assert.equal(radarHostileCourseText([], 50, { x: 10, y: 50 }), "Nearest hostile at 9 o'clock, dial bearing 270 degrees.");
});

test('the actor pursues the actual public radar bearing, then reacquires a canvas shot without hidden target coordinates', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  const radar = radarCanvas();
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 }, run: { kind: 'survival', phase: 'active' },
    entityList: [player], render: { camera: {}, meshes: new Map(), renderer: { domElement: canvas } } };
  const held = new Set(); const keys = []; let fireDown = 0; const points = []; const history = [];
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => {
    history.push({ sim: state.simTime, held: [...held] });
    state.simTime += 0.2;
    if (held.has('KeyD')) player.rot += 0.5;
    if (held.has('KeyA')) player.rot -= 0.5;
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 50, y: 10 }], 50), mode: 'flight', simTime: state.simTime });
  },
    keyboard: { down: async (key) => { held.add(key); keys.push(key); }, up: async (key) => held.delete(key), press: async () => {} },
    mouse: { move: async (x, y) => points.push([x, y]), down: async () => { fireDown++; }, up: async () => {} } };
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state } };
    globalThis.document = { elementFromPoint: () => canvas,
      querySelector: (selector) => selector === '.sf-radar-semantic-canvas' ? radar : null };
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 50, y: 10 }], 50), mode: 'flight', simTime: 10 });
    assert.equal((await readTarget()).radarRel, Math.PI / 2, 'the visible 12 oclock bearing maps to +Z');
    await fightBeat(page, 0);
    assert.deepEqual(keys, ['KeyW', 'KeyD', 'ShiftLeft']); assert.equal(fireDown, 0);
    assert.ok(state.simTime >= 12.4 && state.simTime <= 12.8, 'the fresh public course gets a sustained bounded chase');
    assert.ok(history.some(sample => sample.held.includes('KeyD') && sample.held.includes('KeyW')),
      'the actor keeps public forward thrust while turning onto a large radar error');
    assert.ok(history.some(sample => sample.held.includes('KeyW')),
      'forward resumes after the nose reaches the public course');
    const boostSamples = history.filter(sample => sample.held.includes('ShiftLeft')).length;
    assert.ok(boostSamples >= 1 && boostSamples < history.length,
      'the default boost is a bounded public pulse after alignment');
    assert.equal(held.size, 0);
    state.entityList.push({ id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 }, data: { runRole: 'enemy' } });
    state.render.meshes.set(2, { visible: true, matrixWorld: { x: 10, z: 0 } });
    assert.equal((await readTarget()).none, undefined, 'a reachable hostile takes precedence over the radar search');
    await fightBeat(page, 1);
    assert.equal(fireDown, 1); assert.deepEqual(points, [[550, 300]]); assert.equal(held.size, 0);
    state.entityList.pop(); state.simTime = 20;
    assert.equal((await readTarget()).radarRel, null, 'a stale public radar frame cannot steer');
    radar.offsetParent = null;
    assert.equal((await readTarget()).radarRel, null, 'a hidden radar cannot provide a cue');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

for (const interruption of ['stale', 'visible', 'error']) test(`sustained radar chase releases forward, turn and boost on ${interruption}`, async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  const radar = radarCanvas();
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 }, rot: Math.PI / 2, hull: 260, hullMax: 260 };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 },
    run: { kind: 'survival', phase: 'active' }, entityList: [player],
    render: { camera: {}, meshes: new Map(), renderer: { domElement: canvas } } };
  const held = new Set(); let boosted = false;
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => {
    boosted ||= held.has('KeyW') && held.has('ShiftLeft');
    if (interruption === 'error') throw new Error('radar observation interrupted');
    state.simTime += interruption === 'stale' ? 0.6 : 0.2;
    if (interruption === 'visible') {
      state.entityList.push({ id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 }, data: { runRole: 'enemy' } });
      state.render.meshes.set(2, { visible: true, matrixWorld: { x: 10, z: 0 } });
    }
  }, keyboard: { down: async key => held.add(key), up: async key => held.delete(key), press: async () => {} },
    mouse: { move: async () => {}, click: async () => {}, down: async () => {}, up: async () => {} } };
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state } };
    globalThis.document = { elementFromPoint: () => canvas,
      querySelector: selector => selector === '.sf-radar-semantic-canvas' ? radar : null };
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 50, y: 10 }], 50), mode: 'flight', simTime: 10 });
    if (interruption === 'error') await assert.rejects(fightBeat(page, 1), /radar observation interrupted/);
    else await fightBeat(page, 1);
    assert.ok(boosted, 'an aligned public course uses held forward plus the default boost');
    assert.ok(state.simTime < 11, 'stale bearings and a newly visible hull stop the chase promptly');
    assert.equal(held.size, 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('radar pursuit releases all public keys when a legitimate phase transition freezes time', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  const radar = radarCanvas();
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const state = { mode: 'flight', simTime: 10, playerId: 1, run: { kind: 'survival', phase: 'active' },
    entityList: [player], render: { camera: {}, meshes: new Map(), renderer: { domElement: canvas } } };
  const held = new Set();
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => { throw new Error('waited on paused clock'); },
    keyboard: { down: async (key) => { held.add(key); state.run.phase = 'draft'; }, up: async (key) => held.delete(key) } };
  try {
    globalThis.window = { SF: { THREE: { Vector3: class {} }, state } };
    globalThis.document = { elementFromPoint: () => canvas, querySelector: () => radar };
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 50, y: 10 }], 50), mode: 'flight', simTime: 10 });
    await fightBeat(page, 0);
    assert.equal(held.size, 0); assert.equal(state.simTime, 10);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
