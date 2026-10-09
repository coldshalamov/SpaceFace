// NXI-203 — the parent mark stays attached through a whole-hull LOD switch.
//
// Done sentence: "The mark neither floats at the old transform nor forces mixed half-hull
// LODs." The landed NXB-051 owner (src/render/weapons/presenter.js + contactMarks.js)
// re-resolves markAnchor(mesh) = mesh.userData.hull every update and re-projects the SAME
// body-local slot, while the instanced pool compacts per frame — so a whole-hull visual-root
// swap (partsLibrary setActiveRoot) re-binds the mark without leaving a stale instance at the
// old transform and without the mark system holding the old hull alive. LOD selection itself
// is untouched. Harness mimics test/next-wave-nxb-051.test.mjs (the parent's focused gate).

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

test('a whole-hull LOD switch re-binds the mark: one instance, on the new hull, none at the old transform', () => {
  const body = ship(7, 20, -5);
  const h = harness([body]);
  try {
    h.hit(7, 31, -5);
    h.step();
    const slot = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7);
    assert.equal(slot.attached, true);
    const localIdentity = { x: slot.localX, y: slot.localY, z: slot.localZ };
    const onOldHull = worldPoint(body.hull, slot);

    // The whole-hull switch the live route performs (partsLibrary setActiveRoot): the old
    // visual root is replaced under the same boundary and userData.hull is repointed.
    const lod = new THREE.Group();
    lod.name = 'hull-lod1';
    lod.rotation.set(Math.PI / 3, Math.PI / 5, 0.3);
    body.mesh.remove(body.hull);
    body.mesh.add(lod);
    body.mesh.userData.hull = lod;
    h.step();

    // Body-local identity is the binding: the same slot, re-projected — never re-captured.
    assert.deepEqual({ x: slot.localX, y: slot.localY, z: slot.localZ }, localIdentity);
    // Exactly one instance is drawn: no stale copy floats at the old transform and no
    // second "half" of the hull is kept alive by the mark system.
    assert.equal(h.presenter.scorches.mesh.count, 1,
      'the LOD switch must not leave a duplicate mark at the old anchor');
    const onLod = worldPoint(lod, slot);
    assert.ok(closest(h.presenter.scorches, onLod) < 1e-3, 'the mark sits on the selected LOD hull');
    assert.ok(closest(h.presenter.scorches, onOldHull) > 0.5,
      'nothing is drawn at the replaced hull\'s old world transform');

    // Neighbour success: the switched hull keeps carrying the mark as it moves.
    lod.rotation.y += 0.9;
    h.step();
    const moved = worldPoint(lod, slot);
    assert.ok(moved.distanceTo(onLod) > 0.2, 'the LOD hull really moved');
    assert.ok(closest(h.presenter.scorches, moved) < 1e-3, 'the mark follows the selected hull');
    assert.equal(h.presenter.scorches.mesh.count, 1);
  } finally {
    h.presenter.dispose();
  }
});

test('a staged switch through the fallback root re-binds without duplicating or retiring the mark', () => {
  const body = ship(7, 20, -5);
  const h = harness([body]);
  try {
    h.hit(7, 31, -5);
    h.step();
    const slot = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7);
    const localIdentity = { x: slot.localX, y: slot.localY, z: slot.localZ };
    const onOldHull = worldPoint(body.hull, slot);

    // The live staged switch (partsLibrary): the boundary first falls back to the stand-in
    // root, then the authored root takes over. userData.hull is always SOME body frame.
    const fallback = new THREE.Group();
    fallback.rotation.set(0.6, 1.1, 0.9);
    body.mesh.remove(body.hull);
    body.mesh.add(fallback);
    body.mesh.userData.hull = fallback;
    h.step();
    assert.equal(slot.alive, 1, 'the staged switch must not retire the mark');
    assert.deepEqual({ x: slot.localX, y: slot.localY, z: slot.localZ }, localIdentity);
    assert.equal(h.presenter.scorches.mesh.count, 1, 'exactly one mark during the staged switch');
    assert.ok(closest(h.presenter.scorches, worldPoint(fallback, slot)) < 1e-3,
      'the mark rides the currently bound body frame');
    assert.ok(closest(h.presenter.scorches, onOldHull) > 0.5,
      'nothing is drawn at the replaced hull\'s old world transform');

    // Completing the switch re-binds the same identity to the final root.
    const authored = new THREE.Group();
    authored.rotation.z = 0.7;
    body.mesh.remove(fallback);
    body.mesh.add(authored);
    body.mesh.userData.hull = authored;
    h.step();
    assert.equal(h.presenter.scorches.mesh.count, 1, 'still exactly one mark after the switch completes');
    assert.ok(closest(h.presenter.scorches, worldPoint(authored, slot)) < 1e-3,
      'the completed switch re-binds the same body-local mark');
    assert.ok(closest(h.presenter.scorches, worldPoint(fallback, slot)) > 0.2,
      'the intermediate root is not kept alive by the mark');
  } finally {
    h.presenter.dispose();
  }
});
