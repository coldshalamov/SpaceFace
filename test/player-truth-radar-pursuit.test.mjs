import test from 'node:test';
import assert from 'node:assert/strict';
import { radarHostileCourseText, publishRadarHostileCourse } from '../src/ui/radar.js';
import { readTarget, fightBeat } from '../scripts/player-truth/driver.mjs';

function radarCanvas() {
  const attributes = new Map();
  return { offsetParent: {}, getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) };
}

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
  const held = new Set(); const keys = []; let fireDown = 0; const points = [];
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => { state.simTime += 0.2; },
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
    assert.deepEqual(keys, ['KeyD', 'KeyW']); assert.equal(fireDown, 0);
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
