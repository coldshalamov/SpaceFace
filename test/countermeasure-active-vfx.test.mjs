import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ActionVfx } from '../src/render/actionVfx.js';

function fixture(kind, durationS) {
  const effect = { originX: kind === 'ecm' ? 0 : -18, originZ: 0, cfg: { kind, durationS } };
  const ship = { id: 1, alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 8,
    data: { cm: { effect, effectT: durationS } } };
  const state = { simTime: 10, playerId: 1, entities: new Map([[1, ship]]), settings: { video: {} } };
  const scene = new THREE.Scene(), out = new ActionVfx(scene);
  assert.ok(out.emit('countermeasure:deployed', { shipId: 1, kind, durationS }, state));
  return { state, ship, effect, out, scene };
}

for (const [kind, duration, surfaces] of [['chaff', 3.5, 7], ['ecm', 4, 4], ['decoy', 8, 5]]) {
  test(`${kind} keeps a distinct active mechanism after ignition, then retires finitely`, () => {
    const { state, ship, out, scene } = fixture(kind, duration);
    try {
      state.simTime += duration - .3;
      ship.data.cm.effectT = .3;
      out.update(state);
      assert.equal(out.live, 1, 'gameplay is still active after the brief deployment cue');
      assert.equal(out.batch.count, surfaces, 'steady mechanism replaces the spent deployment burst');
      assert.ok(out.batch.attributes.every(a => a.array.every(Number.isFinite)));
      assert.equal(out.particles.live, 0, 'sustain is not repeated burst particles');
      state.simTime += .3;
      ship.data.cm.effectT = 0;
      ship.data.cm.effect = null;
      out.update(state);
      state.simTime += .25;
      out.update(state);
      assert.equal(out.live, 0);
      assert.equal(out.mesh.visible, false);
    } finally {
      out.dispose();
      assert.equal(scene.children.length, 0);
    }
  });
}

test('ECM follows its emitter while released chaff and decoy keep their world seat', () => {
  for (const kind of ['chaff', 'ecm', 'decoy']) {
    const { state, ship, out } = fixture(kind, 8);
    try {
      ship.pos.x = 90;
      ship.pos.z = 45;
      state.simTime += 3;
      out.update(state);
      assert.deepEqual([out.slots[0].x, out.slots[0].z], kind === 'ecm' ? [90, 45] : [-18, 0]);
    } finally { out.dispose(); }
  }
});

test('effect cancellation, source death, and recycled identity close the retained mechanism early', () => {
  for (const cause of ['cancel', 'death', 'recycle']) {
    const { state, ship, out } = fixture('ecm', 8);
    try {
      state.simTime += 2;
      out.update(state);
      if (cause === 'cancel') ship.data.cm.effect = null;
      if (cause === 'death') ship.alive = false;
      if (cause === 'recycle') state.entities.set(1, { ...ship });
      state.simTime += .1;
      out.update(state);
      state.simTime += .25;
      out.update(state);
      assert.equal(out.live, 0, cause);
    } finally { out.dispose(); }
  }
});

test('reduced motion fixes the active geometry and reduced flash softens it without hiding state', () => {
  for (const kind of ['chaff', 'ecm', 'decoy']) {
    const { state, out } = fixture(kind, 8);
    try {
      state.settings.accessibility = { motionPreference: 'reduce' };
      state.simTime += 2;
      out.update(state);
      const first = out.batch.attributes.slice(0, 4).map(a => Array.from(a.array));
      state.simTime += 1;
      out.update(state);
      assert.deepEqual(out.batch.attributes.slice(0, 4).map(a => Array.from(a.array)), first, kind);
      assert.equal(out.particles.live, 0);
      const alpha = out.batch.attributes[3].getW(0);
      state.settings.video.flashReduce = true;
      out.update(state);
      assert.ok(out.batch.attributes[3].getW(0) > 0);
      assert.ok(out.batch.attributes[3].getW(0) < alpha);
    } finally { out.dispose(); }
  }
});

test('paused sim preserves the retained effect and a clock rewind clears it', () => {
  const { state, out } = fixture('decoy', 8);
  try {
    state.simTime += 3;
    out.update(state);
    out.update(state);
    assert.equal(out.live, 1);
    state.simTime = 0;
    out.update(state);
    assert.equal(out.live, 0);
  } finally { out.dispose(); }
});
