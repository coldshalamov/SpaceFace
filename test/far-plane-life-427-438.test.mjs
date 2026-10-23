// Rows 427 (fill the frame, not the path) and 438 (the horizon is busy).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

const farPlaneLife = await import('../src/render/farPlaneLife.js');

function makeState(entities = []) {
  const listeners = new Map();
  return {
    state: {
      settings: { video: { particleQuality: 'medium', motionReduce: false } },
      render: {},
      world: { frameOrigin: { x: 0, z: 0 }, entities },
      camera: { focus: { x: 0, y: 0, z: 0 }, obj: { position: { x: 0, y: 0, z: 0 } } },
    },
    bus: {
      on(name, fn) { listeners.set(name, fn); },
      emit(name, p) { const fn = listeners.get(name); if (fn) fn(p); },
    },
  };
}

function instancePos(mesh, i) {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

test('two counter-flow sheets exist above and below the plane, render-only', () => {
  const scene = new THREE.Scene();
  const { state, bus } = makeState();
  const stack = farPlaneLife.init(scene, state, bus);
  try {
    assert.equal(farPlaneLife.activeSheets().length, 2);
    const [high, deep] = farPlaneLife.activeSheets();
    assert.ok(high.spec.y > 0 && deep.spec.y < 0, 'one sheet above, one below');
    assert.ok(deep.spec.factor < high.spec.factor, 'deeper sheet parallaxes less');
    // every ship gets a valid matrix after an update tick
    farPlaneLife.update(0.016);
    const p = instancePos(high.mesh, 0);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  } finally {
    farPlaneLife.dispose();
    assert.equal(scene.children.length, 0, 'dispose removes all groups');
  }
});

test('stream silhouettes move along their lane heading, never toward the plane', () => {
  const scene = new THREE.Scene();
  const { state, bus } = makeState();
  farPlaneLife.init(scene, state, bus);
  try {
    const sheet = farPlaneLife.activeSheets()[0];
    const s = sheet.ships[0];
    const x0 = s.x, z0 = s.z;
    farPlaneLife.update(0.05);
    const dx = s.x - x0, dz = s.z - z0;
    const moved = Math.hypot(dx, dz);
    assert.ok(moved > 0.5, 'ship advances along its lane');
    const dot = (dx * Math.cos(s.heading) + dz * Math.sin(s.heading)) / moved;
    assert.ok(dot > 0.99, 'motion is along the lane heading');
    assert.equal(s.yieldOff, 0, 'no yield impulse when focus is far from the lane edge case');
  } finally {
    farPlaneLife.dispose();
  }
});

test('ships bank off-axis inside the yield radius, then recover', () => {
  const scene = new THREE.Scene();
  const { state, bus } = makeState();
  farPlaneLife.init(scene, state, bus);
  try {
    const sheet = farPlaneLife.activeSheets()[0];
    const s = sheet.ships[0];
    // park a ship right on the wrapped focus point
    s.x = 0; s.z = 0;
    for (let i = 0; i < 60; i++) farPlaneLife.update(0.05);
    assert.ok(s.yieldOff > 20, `yield impulse ${s.yieldOff} must visibly displace`);
    // move it far away; yield recovers
    s.x = 4000; s.z = 4000;
    for (let i = 0; i < 80; i++) farPlaneLife.update(0.05);
    assert.ok(s.yieldOff < 1, 'yield relaxes after the focus passes');
  } finally {
    farPlaneLife.dispose();
  }
});

test('distant combat:hit beyond the far range queues a flash; a close one does not', () => {
  const scene = new THREE.Scene();
  const { state, bus } = makeState();
  farPlaneLife.init(scene, state, bus);
  try {
    bus.emit('combat:hit', { pos: { x: 50, z: 0 } }); // too close — draws itself
    const lit0 = stackFlashes(scene);
    assert.equal(lit0, 0);
    bus.emit('combat:hit', { pos: { x: 5000, z: 0 } }); // off-screen far fight
    assert.equal(stackFlashes(scene), 1);
    farPlaneLife.update(0.5);
    assert.equal(stackFlashes(scene), 1, 'flash persists mid-life');
    for (let i = 0; i < 30; i++) farPlaneLife.update(0.1);
    assert.equal(stackFlashes(scene), 0, 'flash retires after its life');
  } finally {
    farPlaneLife.dispose();
  }
  function stackFlashes(sc) {
    const g = sc.children.find((c) => c.name === 'FarLife_BattleFlashes');
    return g ? g.children.filter((c) => c.visible).length : -1;
  }
});

test('far miners mirror onto the deep sheet with beams; near/on-plane miners do not', () => {
  const scene = new THREE.Scene();
  const entities = [
    { pos: { x: 1500, z: 0 }, rot: 0.5, data: { role: 'miner' } },   // far miner -> beam
    { pos: { x: 100, z: 0 }, rot: 0, data: { role: 'miner' } },      // too close
    { pos: { x: 9000, z: 0 }, rot: 0, data: { role: 'miner' } },     // beyond mirror range
    { pos: { x: 1500, z: 50 }, rot: 0, data: { role: 'hauler' } },   // not a miner
  ];
  const { state, bus } = makeState(entities);
  farPlaneLife.init(scene, state, bus);
  try {
    farPlaneLife.update(0.05); // triggers the 1 Hz miner scan immediately
    const beams = scene.children.find((c) => c.name === 'FarLife_MiningBeams');
    assert.ok(beams, 'beam group exists');
    const mesh = beams.children[0];
    const live = [];
    for (let i = 0; i < mesh.count; i++) {
      const p = instancePos(mesh, i);
      if (p.y > -9000) live.push(p);
    }
    assert.equal(live.length, 1, 'exactly the in-range far miner mirrors a beam');
    assert.ok(Math.abs(live[0].x - 1500) < 60, 'beam anchored near the real miner pos');
  } finally {
    farPlaneLife.dispose();
  }
});

test('repeated init/dispose cycles leave no scene residue', () => {
  const scene = new THREE.Scene();
  const { state, bus } = makeState();
  for (let i = 0; i < 3; i++) {
    farPlaneLife.init(scene, state, bus);
    farPlaneLife.update(0.016);
    farPlaneLife.dispose();
  }
  assert.equal(scene.children.length, 0);
});
