// NXI-204 — a gameplay scar is preserved separately from a transient flash.
//
// Done sentence: "A completed flash can disappear without erasing the ship's persistent
// history or replaying the hit on load." The landed NXB-051 lifetime distinction: transient
// flashes live in src/render/actionVfx.js (slots expire by recipe life; a sim-time jump back
// — the load path — clears them via `now<this.time → clear()`) and in the scorch pool's
// non-persistent slots, while the durable scar is a plain body-local record
// (presenter.retainHullMark → persistent slot → contactMarks.dispose retainedScars: scarId +
// local frame coordinates, no particle system, nothing serialized into the save).
// Harness mimics test/next-wave-nxb-051.test.mjs (the parent's focused gate).

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { ActionVfx } from '../src/render/actionVfx.js';

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

function presenterHarness(ships) {
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
  return { presenter, state, step };
}

test('a completed flash expires while the persistent scar stays on the record as plain data', () => {
  const body = ship(7, 20, -5);
  const h = presenterHarness([body]);
  try {
    // The hit's transient flash and the durable gameplay scar land together.
    h.presenter.handleHit({
      weaponId: 'wpn_pulse_laser_s',
      targetId: 7,
      pos: { x: 31, z: -5 },
      normal: { x: 1, z: 0 },
      approach: { x: -1, z: 0 },
    }, false);
    const scarIndex = h.presenter.retainHullMark(7, 31, 0.35, -5, 1, 0, 0, 'weapon:9:starboard beam');
    h.step();
    const flash = h.presenter.scorches.slots.find((s) => s.alive && s.targetId === 7 && !s.persistent);
    const scar = h.presenter.scorches.slots[scarIndex];
    assert.ok(flash, 'the hit flash is transient');
    assert.equal(scar.persistent, true);

    // The flash completes and disappears; the scar is not erased with it.
    h.step(6);
    assert.equal(flash.alive, 0, 'the completed flash disappears');
    assert.equal(scar.alive, 1, 'the persistent scar survives the flash expiry');

    // The durable record is plain data in the body-local frame — no particle system, no
    // drawable to serialize. (The save never receives either; only this record is durable.)
    h.presenter.dispose();
    const record = h.presenter.scorches.retainedScars[0];
    assert.equal(record.scarId, 'weapon:9:starboard beam');
    assert.equal(typeof record.localX, 'number');
    assert.equal(typeof record.localY, 'number');
    assert.equal(typeof record.localZ, 'number');
    for (const key of Object.keys(record)) {
      const value = record[key];
      assert.ok(value === null || ['number', 'string'].includes(typeof value),
        `record field ${key} must stay plain data, not a live object`);
    }
  } finally {
    h.presenter.dispose();
  }
});

test('a load (sim time moving back) clears the completed flash without replaying the hit or touching the scar', () => {
  const body = ship(7, 20, -5);
  const h = presenterHarness([body]);
  const scene = new THREE.Scene();
  const entities = new Map([[7, { id: 7, alive: true, type: 'ship', pos: { x: 20, z: -5 }, rot: 0, radius: 5 }]]);
  const actionState = { simTime: 100, playerId: 1, entities, settings: { video: {} } };
  const actionVfx = new ActionVfx(scene);
  try {
    // A transient action receipt (the hit-family flash on the same body) plus the durable scar.
    assert.equal(actionVfx.emit('bombs:detonated', { targetId: 7, pos: { x: 26, z: -5 } }, actionState), true);
    actionVfx.update(actionState);
    assert.equal(actionVfx.inspect().active, 1, 'the flash is live before expiry');
    const scarIndex = h.presenter.retainHullMark(7, 31, 0.35, -5, 1, 0, 0, 'slam:2:bow');
    h.step();
    const scar = h.presenter.scorches.slots[scarIndex];
    assert.equal(scar.alive, 1);

    // Let the flash complete.
    actionState.simTime += 2;
    actionVfx.update(actionState);
    assert.equal(actionVfx.inspect().active, 0, 'the completed flash expires by recipe life');

    // LOAD: the restored save resumes at an earlier sim time. The flash layer clears —
    // the hit does not replay — and the scar layer is not reached by that clear.
    const recordBefore = JSON.stringify(scar);
    actionState.simTime = 40;
    actionVfx.update(actionState);
    assert.equal(actionVfx.inspect().active, 0, 'no flash replays after load');
    assert.equal(actionVfx.inspect().particles, 0, 'no particle matter replays after load');
    assert.equal(scar.alive, 1, 'the persistent scar is untouched by the load clear');
    assert.equal(JSON.stringify(scar), recordBefore, 'the scar record is byte-identical across load');
    h.presenter.dispose();
    assert.equal(h.presenter.scorches.retainedScars.length, 1);
    assert.equal(h.presenter.scorches.retainedScars[0].scarId, 'slam:2:bow',
      'the durable history survives the load cycle');
  } finally {
    actionVfx.dispose();
    h.presenter.dispose();
  }
});
