import test from 'node:test';
import assert from 'node:assert/strict';
import { fightBeat, readTarget } from '../scripts/player-truth/driver.mjs';
import { publishRadarHostileCourse } from '../src/ui/radar.js';

function canvas() {
  return { tagName: 'CANVAS',
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
}

function vector3() {
  return class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  };
}

test('fighter selects and fires a target that becomes canvas-reachable during radar search', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const surface = canvas();
  const radar = { offsetParent: {}, attrs: new Map(),
    getAttribute: key => radar.attrs.get(key) ?? null,
    setAttribute: (key, value) => radar.attrs.set(key, value),
    removeAttribute: key => radar.attrs.delete(key) };
  const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const target = { id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 }, data: { runRole: 'enemy' } };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: null },
    run: { kind: 'survival', phase: 'active' }, entityList: [player],
    render: { camera: {}, meshes: new Map(), renderer: { domElement: surface } } };
  let targetVisible = false; let fireDown = 0; let selected = 0; const held = new Set();
  const addTarget = () => {
    if (targetVisible) return;
    targetVisible = true;
    state.entityList.push(target);
  };
  const page = {
    evaluate: async (fn, arg) => fn(arg),
    waitForTimeout: async () => { state.simTime += 0.2; addTarget(); },
    keyboard: {
      down: async key => held.add(key),
      up: async key => held.delete(key),
      press: async () => {},
    },
    mouse: {
      move: async () => {},
      click: async (x, y, { button } = {}) => {
        assert.equal(button, 'right'); assert.equal(x, 550); assert.equal(y, 300);
        selected++; state.player.targetId = target.id;
      },
      down: async () => { fireDown++; },
      up: async () => {},
    },
  };
  try {
    globalThis.window = { SF: { THREE: { Vector3: vector3() }, state,
      ctx: { helpers: { worldToScreen: () => ({ x: 550, y: 300, onScreen: true, behind: false }) } } } };
    globalThis.document = {
      elementFromPoint: () => surface,
      querySelector: selector => selector === '.sf-radar-semantic-canvas' ? radar : null,
    };
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: 'Nearest hostile at 12 o\'clock, dial bearing 90 degrees.', mode: 'flight', simTime: 10 });
    assert.equal((await readTarget()).none, true);
    await fightBeat(page, 0);
    assert.equal(targetVisible, true);
    assert.equal(selected, 1, 'the fresh observation is selected in the same beat');
    assert.equal(fireDown, 1, 'the same public-input beat reaches firing');
    assert.equal(state.player.targetId, target.id);
    assert.equal(held.size, 0, 'radar keys are released before the selection/fire path completes');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('readTarget reports bounded public rejection causes without admitting covered or hidden bodies', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const surface = canvas();
  const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const hidden = { id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 }, data: { runRole: 'enemy' } };
  const covered = { id: 3, alive: true, type: 'ship', team: 3, pos: { x: 20, z: 0 }, data: { runRole: 'enemy' } };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: null }, entityList: [player, hidden, covered],
    render: { camera: {}, scene: {}, meshes: new Map([[hidden.id, { visible: false, matrixWorld: hidden.pos }]]), renderer: { domElement: surface } } };
  try {
    globalThis.window = { SF: { THREE: { Vector3: vector3() }, state,
      ctx: { helpers: { worldToScreen: () => ({ x: 700, y: 300, onScreen: true, behind: false }) } } } };
    globalThis.document = { elementFromPoint: x => x === 700 ? { tagName: 'ASIDE' } : surface,
      querySelector: () => null };
    const result = await readTarget();
    assert.equal(result.none, true);
    assert.deepEqual(result.rejects, ['hidden', 'covered']);
    assert.ok(result.rejects.length <= 4);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
