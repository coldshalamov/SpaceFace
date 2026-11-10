// NXB-051 — hull contact marks stay on the real hull through yaw, bank, LOD and refit.
// A pooled identity does not inherit another ship's transient flash, and disposing the
// visual pool keeps the persistent scar record.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

const WEAPON = 'wpn_pulse_laser_s';

function ship(id, x, z) {
  const hull = new THREE.Group();
  hull.name = 'hull';
  const mesh = new THREE.Group();
  mesh.name = `ship-${id}`;
  mesh.add(hull);
  mesh.userData.hull = hull;
  mesh.userData.sfStableEntityKey = `ship:${id}`;
  mesh.userData.sfBoundEntityId = id;
  mesh.position.set(x, 0, z);
  return { id, hull, mesh };
}

function worldPoint(anchor, slot) {
  return anchor.localToWorld(new THREE.Vector3(slot.localX, slot.localY, slot.localZ));
}

function closest(pool, point) {
  let best = Infinity;
  for (let i = 0; i < pool.mesh.count; i++) {
    best = Math.min(best, Math.hypot(
      pool.pos.getX(i) - point.x,
      pool.pos.getY(i) - point.y,
      pool.pos.getZ(i) - point.z,
    ));
  }
  return best;
}

function harness(ships) {
  const entities = new Map();
  const meshes = new Map();
  for (const entry of ships) {
    entities.set(entry.id, { id: entry.id, alive: true, type: 'ship' });
    meshes.set(entry.id, entry.mesh);
  }
  const state = {
    simTime: 0,
    playerId: 1,
    settings: { video: {} },
    entities,
    entityList: [],
    render: { meshes },
  };
  const scene = new THREE.Scene();
  const presenter = new WeaponVfxPresenter({ scene, state });
  const step = (dt = 1 / 60) => {
    state.simTime += dt;
    presenter.update(dt, { state });
  };
  const hit = (id, x, z) => presenter.handleHit({
    weaponId: WEAPON,
    targetId: id,
    pos: { x, z },
    normal: { x: 1, z: 0 },
    approach: { x: -1, z: 0 },
  }, false);
  return { presenter, state, entities, meshes, scene, step, hit };
}

test('a scorch stays on the real hull through yaw and bank', () => {
  const body = ship(7, 20, -5);
  const h = harness([body]);
  try {
    h.hit(7, 31, -5);
    h.step();
    const slot = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7 && !s.persistent);
    assert.equal(slot.attached, true);
    const parked = worldPoint(body.hull, slot);
    assert.ok(closest(h.presenter.scorches, parked) < 1e-3);

    body.mesh.rotation.y = Math.PI / 2;
    h.step();
    const yawed = worldPoint(body.hull, slot);
    assert.ok(yawed.distanceTo(parked) > 5, 'yaw moves the struck plate');
    assert.ok(closest(h.presenter.scorches, yawed) < 1e-3, 'mark follows yaw');
    assert.ok(closest(h.presenter.scorches, parked) > 1, 'mark does not stay parked in world space');

    body.mesh.rotation.y = 0;
    body.hull.rotation.x = Math.PI / 2;
    h.step();
    const banked = worldPoint(body.hull, slot);
    assert.ok(banked.distanceTo(parked) > 0.2, 'bank moves the real hull');
    assert.ok(closest(h.presenter.scorches, banked) < 1e-3, 'mark follows the hull child');
    assert.ok(closest(h.presenter.scorches, parked) > 0.2, 'bank does not leave the mark on the yaw root');
  } finally {
    h.presenter.dispose();
  }
});

test('LOD swap and refit keep the same mark on the replacement hull', () => {
  const body = ship(7, 20, -5);
  const h = harness([body]);
  try {
    h.hit(7, 31, -5);
    h.step();
    const slot = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7);
    const local = { x: slot.localX, y: slot.localY, z: slot.localZ };

    const lod = new THREE.Group();
    body.mesh.remove(body.hull);
    body.mesh.add(lod);
    body.mesh.userData.hull = lod;
    lod.rotation.x = Math.PI / 2;
    h.step();
    assert.equal(slot.alive, 1);
    assert.deepEqual({ x: slot.localX, y: slot.localY, z: slot.localZ }, local);
    const onLod = worldPoint(lod, slot);
    assert.ok(closest(h.presenter.scorches, onLod) < 1e-3, 'LOD hull carries the same local mark');

    h.meshes.delete(7);
    h.step();
    assert.equal(slot.alive, 1, 'a live ship keeps the mark through a mesh gap');
    assert.equal(h.presenter.scorches.mesh.count, 0, 'the gap does not draw a world-floating card');
    assert.deepEqual({ x: slot.localX, y: slot.localY, z: slot.localZ }, local);

    const refit = ship(7, 80, 15);
    refit.mesh.rotation.y = Math.PI / 2;
    refit.hull.rotation.z = 0.4;
    h.meshes.set(7, refit.mesh);
    h.step();
    const onRefit = worldPoint(refit.hull, slot);
    assert.ok(onRefit.distanceTo(onLod) > 10);
    assert.ok(closest(h.presenter.scorches, onRefit) < 1e-3, 'refit projects the same local mark');
  } finally {
    h.presenter.dispose();
  }
});

test('a completed flash expires without erasing the persistent scar', () => {
  const body = ship(7, 20, -5);
  const h = harness([body]);
  try {
    h.hit(7, 31, -5);
    h.presenter.retainHullMark(7, 31, 0.35, -5, 1, 0, 0, 'weapon:1:starboard beam');
    h.step(5);
    const flash = h.presenter.scorches.slots.find((s) => s.targetId === 7 && !s.persistent && s.alive);
    const scar = h.presenter.scorches.slots.find((s) => s.persistent && s.alive);
    assert.equal(flash, undefined);
    assert.ok(scar);
    assert.ok(closest(h.presenter.scorches, worldPoint(body.hull, scar)) < 1e-3);
    h.presenter.dispose();
    assert.equal(h.presenter.scorches.retainedScars[0].scarId, 'weapon:1:starboard beam');
    assert.ok(Math.abs(h.presenter.scorches.retainedScars[0].localX - scar.localX) < 1e-6);
  } finally {
    h.presenter.dispose();
  }
});

test('a pooled replacement does not inherit transient marks, and dispose keeps the scar', () => {
  const a = ship(7, 20, -5);
  const b = ship(8, 200, 40);
  const h = harness([a, b]);
  try {
    a.mesh.userData.impactMarks = [{ at: 1 }];
    h.hit(7, 31, -5);
    h.hit(8, 212, 40);
    const scarIndex = h.presenter.retainHullMark(7, 31, 0.35, -5, 1, 0, 0, 'slam:4:bow');
    h.step();
    const flash = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7 && !s.persistent);
    const scar = h.presenter.scorches.slots[scarIndex];
    const other = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 8);
    assert.equal(flash.alive, 1);
    assert.equal(scar.persistent, true);

    const materialId = h.presenter.scorches.material.uuid;
    const geometryId = h.presenter.scorches.geometry.uuid;
    h.presenter.releasePooledTransientMarks(7);
    h.step();
    assert.equal(flash.alive, 0, 'releasing the pooled ship drops its transient flash');
    assert.equal(scar.alive, 1, 'the persistent scar stays');
    assert.equal(other.alive, 1, 'another ship keeps its own mark');
    assert.equal(h.presenter.scorches.material.uuid, materialId);
    assert.equal(h.presenter.scorches.geometry.uuid, geometryId);
    assert.deepEqual(a.mesh.userData.impactMarks, [{ at: 1 }]);
    const onA = worldPoint(a.hull, scar);
    const onB = worldPoint(b.hull, other);
    assert.ok(h.presenter.scorches.mesh.count >= 1);
    assert.ok(closest(h.presenter.scorches, onA) < 1e-3);
    assert.ok(closest(h.presenter.scorches, onB) < 1e-3);

    a.mesh.userData.sfStableEntityKey = 'ship:9';
    a.mesh.userData.sfBoundEntityId = 9;
    a.mesh.position.set(400, 0, 0);
    h.step();
    assert.equal(scar.alive, 1);
    assert.equal(flash.alive, 0);
    assert.ok(h.presenter.scorches.mesh.count >= 1);
    const stolen = worldPoint(a.hull, scar);
    assert.ok(closest(h.presenter.scorches, stolen) > 1, 'the reused mesh does not show the old scar');
    assert.ok(closest(h.presenter.scorches, onB) < 1e-3, 'the other ship is undisturbed');

    h.entities.delete(8);
    h.meshes.delete(8);
    h.step();
    assert.equal(other.alive, 0, 'a departed ship does not leave a floating flash');
    assert.equal(h.presenter.scorches.mesh.count, 0);
    assert.equal(scar.alive, 1);

    h.presenter.dispose();
    assert.equal(h.presenter.scorches.retainedScars.length, 1);
    assert.equal(h.presenter.scorches.retainedScars[0].scarId, 'slam:4:bow');
    assert.ok(Math.abs(h.presenter.scorches.retainedScars[0].localX - scar.localX) < 1e-6);
    assert.equal(h.scene.children.includes(h.presenter.scorches.mesh), false);
    assert.deepEqual(a.mesh.userData.impactMarks, [{ at: 1 }]);
    assert.equal(a.mesh.userData.heatScorch, undefined);
  } finally {
    h.presenter.dispose();
  }
});

test('an unattached mark does not stick to a bystander hull', () => {
  const bystander = ship(7, 20, -5);
  const h = harness([bystander]);
  try {
    h.hit(99, 5, 5);
    h.step();
    const slot = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 99);
    assert.equal(slot.attached, false);
    const before = { x: slot.localX, y: slot.localY, z: slot.localZ };
    bystander.mesh.rotation.y = 1.2;
    bystander.hull.rotation.x = 0.8;
    h.step();
    assert.deepEqual({ x: slot.localX, y: slot.localY, z: slot.localZ }, before);
    const parked = new THREE.Vector3(before.x, before.y, before.z);
    assert.ok(closest(h.presenter.scorches, parked) < 1e-3);
    const stuck = worldPoint(bystander.hull, slot);
    assert.ok(stuck.distanceTo(parked) > 1);
    assert.ok(closest(h.presenter.scorches, stuck) > 1, 'the bystander does not inherit the mark');
  } finally {
    h.presenter.dispose();
  }
});
