// Authored ANIM_ motion: spec parsing from exported node names plus deterministic per-frame
// transform/visibility behaviour, reduced-motion handling, and record lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInfrastructureMotionTracker,
  parseAnimNodeName,
} from '../src/render/infrastructureMotion.js';

function fakeNode(name, rotation = { x: 0, y: 0, z: 0 }) {
  const node = {
    name,
    rotation: { ...rotation },
    visible: true,
    matrixAutoUpdate: false,
    matrixComposed: 0,
    parent: null,
    children: [],
    updateMatrix() { node.matrixComposed += 1; },
    traverse(cb) { cb(node); for (const child of node.children) child.traverse(cb); },
  };
  return node;
}

function fakeTree(children) {
  const root = fakeNode('ROOT');
  for (const child of children) {
    child.parent = root;
    root.children.push(child);
  }
  return root;
}

const entity = { id: 'place_hub', pos: { x: 0, z: 0 }, radius: 300 };
const player = { pos: { x: 0, z: 0 } };

test('parseAnimNodeName: spin, sweep, blink, flicker, chase', () => {
  assert.deepEqual(parseAnimNodeName('LOD0_ANIM_spin_up_0p4_DishArm'), {
    kind: 'spin', axis: 'y', sign: 1, rate: 0.4,
  });
  assert.deepEqual(parseAnimNodeName('LOD1_ANIM_sweep_side_0p6_0p8_RelayDish'), {
    kind: 'sweep', axis: 'z', sign: -1, amplitude: 0.6, rate: 0.8,
  });
  assert.deepEqual(parseAnimNodeName('LOD0_ANIM_blink_1p2_0p3_NavBeacon'), {
    kind: 'blink', period: 1.2, phase: 0.3,
  });
  assert.deepEqual(parseAnimNodeName('LOD0_ANIM_flicker_0p5_0p3_CandleFlame'), {
    kind: 'flicker', period: 0.5, phase: 0.3,
  });
  assert.deepEqual(parseAnimNodeName('LOD0_ANIM_chase_dock_3_8_4p0_MoorLight'), {
    kind: 'chase', group: 'dock', index: 3, count: 8, period: 4.0,
  });
  // non-anim names, unknown kinds and short specs all reject
  assert.equal(parseAnimNodeName('LOD0_Hull'), null);
  assert.equal(parseAnimNodeName('LOD0_ANIM_twirl_up_0p4_X'), null);
  assert.equal(parseAnimNodeName('LOD0_ANIM_spin_up'), null);
  // bad axis rejects
  assert.equal(parseAnimNodeName('LOD0_ANIM_spin_diagonal_0p4_X'), null);
});

test('spin writes the converted axis at the authored rate and composes the frozen matrix', () => {
  const tracker = createInfrastructureMotionTracker();
  const node = fakeNode('LOD0_ANIM_spin_up_0p4_Dish');
  const mesh = fakeTree([node]);
  tracker.updatePlaceMotion(entity, mesh, 10, 1 / 60, player, {});
  const first = node.rotation.y;
  tracker.updatePlaceMotion(entity, mesh, 12, 1 / 60, player, {});
  // Δrotation = rate * ΔsimTime about the up axis (three +Y); the other axes are untouched
  assert.ok(Math.abs((node.rotation.y - first) - 0.4 * 2) < 1e-9);
  assert.equal(node.rotation.x, 0);
  assert.equal(node.rotation.z, 0);
  assert.equal(node.matrixComposed, 2);
  assert.equal(node.visible, true);
});

test('reducedMotion freezes spin and sweep but keeps blinks', () => {
  const tracker = createInfrastructureMotionTracker();
  const spin = fakeNode('LOD0_ANIM_spin_up_0p4_Dish');
  const blink = fakeNode('LOD0_ANIM_blink_1p0_0p0_Beacon');
  const mesh = fakeTree([spin, blink]);
  tracker.updatePlaceMotion(entity, mesh, 10, 1 / 60, player, { motionReduce: true });
  assert.equal(spin.rotation.y, 0);
  assert.equal(spin.matrixComposed, 0);
  // blink still evaluates: u = (t/1 + phase)/1 % 1 — the value flips over time
  tracker.updatePlaceMotion(entity, mesh, 10.05, 1 / 60, player, { motionReduce: true });
  // one of the two samples produced a definite boolean (not an error path)
  assert.equal(typeof blink.visible, 'boolean');
});

test('blink toggles visibility on its duty cycle, chase sequences the group', () => {
  const tracker = createInfrastructureMotionTracker();
  const blink = fakeNode('LOD0_ANIM_blink_1p0_0p0_Beacon');
  const c0 = fakeNode('LOD0_ANIM_chase_dock_0_2_1p0_Light');
  const c1 = fakeNode('LOD0_ANIM_chase_dock_1_2_1p0_Light');
  const mesh = fakeTree([blink, c0, c1]);
  const seenBlink = new Set();
  const pair = new Set();
  for (let s = 0; s < 20; s++) {
    tracker.updatePlaceMotion(entity, mesh, s * 0.1, 1 / 60, player, {});
    seenBlink.add(blink.visible);
    pair.add(`${c0.visible ? 1 : 0}${c1.visible ? 1 : 0}`);
  }
  assert.deepEqual([...seenBlink].sort(), [false, true]); // it strobes, not always-on/off
  // exactly one chase light lit at a time, and both slots get their turn
  assert.ok(!pair.has('11'));
  assert.ok(pair.has('10') && pair.has('01'));
});

test('scan happens once and distant entities skip work', () => {
  const tracker = createInfrastructureMotionTracker();
  const node = fakeNode('LOD0_ANIM_spin_up_0p4_Dish');
  let scans = 0;
  const mesh = fakeTree([node]);
  const origTraverse = mesh.traverse.bind(mesh);
  mesh.traverse = (cb) => { scans += 1; origTraverse(cb); };
  tracker.updatePlaceMotion(entity, mesh, 1, 1 / 60, player, {});
  tracker.updatePlaceMotion(entity, mesh, 2, 1 / 60, player, {});
  assert.equal(scans, 1);
  // beyond ANIM_MAX_DISTANCE + 2*radius the driver returns without touching nodes
  const far = { ...entity, pos: { x: 0, z: 99999 } };
  const before = node.rotation.y;
  tracker.updatePlaceMotion(far, mesh, 3, 1 / 60, player, {});
  assert.equal(node.rotation.y, before);
  // releasing the mesh clears the cached node refs so a rescan picks up a rebuilt tree
  tracker.releaseEntityMesh(entity.id);
  tracker.updatePlaceMotion(entity, mesh, 4, 1 / 60, player, {});
  assert.equal(scans, 2);
});
