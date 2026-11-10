import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEB_DEF_ID } from '../src/combat/tetherWebs.js';
import { TetherWebFx, tetherWebFormationAccent } from '../src/render/combat/tetherWebFx.js';

function web(overrides = {}) {
  return { defId: WEB_DEF_ID, state: 'active', ownerId: 2, targetId: 3,
    restLength: 100, createdTick: 600, ...overrides };
}

function fixture(t, byId = { web: web() }) {
  // Scene objects and instance matrices need no DOM, GPU or WebGL renderer.
  const scene = new THREE.Scene();
  const fx = new TetherWebFx(scene, (x, z, out) => { out.x = x - 1000; out.z = z; });
  t.after(() => fx.dispose());
  const state = {
    simTime: 10,
    settings: { video: { motionReduce: false } },
    entities: new Map([
      [2, { alive: true, pos: { x: 1000, z: 0 } }],
      [3, { alive: true, pos: { x: 1080, z: 20 } }],
      [4, { alive: false, pos: { x: 1040, z: 10 } }],
    ]),
    combat: { attachments: { byId } },
  };
  return { fx, state };
}

function widthAt(fx, instance = 0) {
  const matrix = fx.mesh.instanceMatrix.array;
  const start = instance * 16;
  return Math.hypot(matrix[start], matrix[start + 1], matrix[start + 2]);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);
}

test('formation decays once over 30 authoritative ticks, independent of the creation epoch', () => {
  for (const createdTick of [0, 600, 216000]) {
    const link = web({ createdTick });
    let previous = 1;
    for (let ticks = 0; ticks <= 60; ticks++) {
      const accent = tetherWebFormationAccent(link, (createdTick + ticks) / 60);
      assert.ok(accent >= 0 && accent <= previous);
      if (ticks === 0) assert.equal(accent, 1);
      if (ticks === 15) close(accent, 0.5);
      if (ticks >= 30) assert.equal(accent, 0);
      previous = accent;
    }
  }
});

test('formation clamps future and expired ticks and ignores unavailable or invalid timestamps', () => {
  assert.equal(tetherWebFormationAccent(web(), 9), 1);
  assert.equal(tetherWebFormationAccent(web(), 1e9), 0);
  for (const createdTick of [undefined, null, NaN, Infinity, -1, 0.5, '600']) {
    assert.equal(tetherWebFormationAccent(web({ createdTick }), 10), 0);
  }
  for (const simTime of [undefined, null, NaN, Infinity, -1, '10']) {
    assert.equal(tetherWebFormationAccent(web(), simTime), 0);
  }
});

test('inactive and non-web attachments have no accent and submit no cable instances', t => {
  const byId = {
    broken: web({ state: 'broken' }),
    pending: web({ state: 'pending' }),
    other: web({ defId: 'tether_standard' }),
  };
  for (const link of Object.values(byId)) assert.equal(tetherWebFormationAccent(link, 10), 0);
  assert.equal(tetherWebFormationAccent(null, 10), 0);
  const { fx, state } = fixture(t, byId);
  fx.update(state);
  assert.equal(fx.mesh.count, 0);
  assert.equal(fx.mesh.visible, false);

  byId.active = web();
  byId.dead = web({ targetId: 4 });
  byId.missing = web({ targetId: 99 });
  fx.update(state);
  assert.equal(fx.mesh.count, 20, 'only the active web with live endpoints has two braided strands');
  assert.equal(fx.mesh.visible, true);
  byId.active.state = 'broken';
  fx.update(state);
  assert.equal(fx.mesh.count, 0);
  assert.equal(fx.mesh.visible, false);
});

test('fresh width settles per link while the physical braid and paused frames stay fixed', t => {
  const { fx, state } = fixture(t, { fresh: web(), old: web({ createdTick: 540 }) });
  fx.update(state);
  assert.equal(fx.mesh.count, 40);
  close(widthAt(fx), 0.624);
  close(widthAt(fx, 20), 0.48);
  const freshMatrices = fx.mesh.instanceMatrix.array.slice(0, 40 * 16);
  fx.update(state);
  assert.deepEqual(fx.mesh.instanceMatrix.array.slice(0, 40 * 16), freshMatrices);

  state.simTime = 10.25;
  fx.update(state);
  close(widthAt(fx), 0.552);
  close(widthAt(fx, 20), 0.48);
  state.simTime = 10.5;
  fx.update(state);
  close(widthAt(fx), 0.48);
  for (let instance = 0; instance < 40; instance++) {
    // The segment's longitudinal axis/length and center retain the original physical curve.
    for (const component of [4, 5, 6, 12, 13, 14]) {
      const index = instance * 16 + component;
      assert.equal(fx.mesh.instanceMatrix.array[index], freshMatrices[index]);
    }
  }
  state.entities.get(3).pos.x += 20;
  fx.update(state);
  assert.notEqual(fx.mesh.instanceMatrix.array[19 * 16 + 12], freshMatrices[19 * 16 + 12],
    'the cable still follows its actual moving endpoint');
});

test('reduced motion suppresses formation width while preserving the active cable', t => {
  assert.equal(tetherWebFormationAccent(web(), 10, true), 0);
  const { fx, state } = fixture(t);
  state.settings.video.motionReduce = true;
  fx.update(state);
  assert.equal(fx.mesh.count, 20);
  assert.equal(fx.mesh.visible, true);
  close(widthAt(fx), 0.48);
  state.simTime = 10.25;
  fx.update(state);
  close(widthAt(fx), 0.48);
});
