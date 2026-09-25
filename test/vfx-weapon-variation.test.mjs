import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EnergyBoltPool } from '../src/render/weapons/energyBoltPool.js';
import { WeaponRibbonPool, RIBBON_PROFILE } from '../src/render/weapons/ribbonPool.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { collectStatusAttachedVictims, planStatusAttachedEmit } from '../src/render/statusAttachedVfx.js';

function bolt(entityId, x) {
  return {
    entityId, x, y: 0, z: 0, prevX: x - 1, prevY: 0, prevZ: 0, ax: 1, ay: 0, az: 0,
    length: 7, width: 2, intensity: 2, variant: 1,
    coreR: 1, coreG: 0.9, coreB: 0.5, sheathR: 1, sheathG: 0.2, sheathB: 0.1,
  };
}

test('projectile variation belongs to identity across sorting and frame reordering', () => {
  const pool = new EnergyBoltPool(new THREE.Scene(), { capacity: 4 });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 0);
  camera.lookAt(1, 0, 0);
  camera.updateMatrixWorld();
  pool.setCamera(camera, 1000);
  pool.beginFrame(0.016);
  pool.writeBolt(bolt('near', 5));
  pool.writeBolt(bolt('far', 30));
  const near = [pool.variation.getX(0), pool.variation.getY(0)];
  const far = [pool.variation.getX(1), pool.variation.getY(1)];
  assert.notDeepEqual(near, far, 'two otherwise identical shots have different internal phase and structure');
  pool.commit();
  for (const [id, expected] of [['near', near], ['far', far]]) {
    const slot = pool.byEntity.get(id);
    assert.deepEqual([pool.variation.getX(slot), pool.variation.getY(slot)], expected);
  }
  const time = pool.material.uniforms.uBoltTime.value;
  pool.beginFrame(0.05, { id: 'reduced-motion' });
  pool.writeBolt(bolt('far', 40));
  pool.writeBolt(bolt('near', 8));
  assert.deepEqual([pool.variation.getX(1), pool.variation.getY(1)], near);
  assert.equal(pool.material.uniforms.uBoltTime.value, time);
  assert.equal(pool.mesh.parent.children.filter((mesh) => mesh.isInstancedMesh).length, 1);
  pool.dispose();
});

test('wakes evolve by local age but retain the exact path and retire under reduced motion', () => {
  const pool = new WeaponRibbonPool(null, { capacity: 3, segments: 6 });
  const spec = { x: 0, y: 0, z: 0, width: 0.9, linger: 0.2, profile: RIBBON_PROFILE.BRAID };
  const a = pool.spawn({ ...spec, entityId: 101 });
  const b = pool.spawn({ ...spec, entityId: 202 });
  assert.notEqual(pool.phase[a], pool.phase[b]);
  pool.pushHead(101, 3, 0, 0);
  const path = pool.hist.slice();
  pool.update(0.05, { x: 0, y: 30, z: 20 });
  assert.ok(pool.age[a] > 0);
  assert.deepEqual(pool.hist, path, 'material flow never manufactures a flight path');
  const age = pool.age[a];
  pool.update(0.05, { x: 0, y: 30, z: 20 }, { id: 'reduced-motion-and-flash' });
  assert.equal(pool.age[a], age);
  assert.equal(pool.geometry.attributes.aShape.getW(a * pool.segments * 2), age);
  assert.equal(pool.material.uniforms.uModulation.value, 0);
  pool.pushHead(101, 5, 0, 0);
  assert.equal(pool.hist[a * pool.segments * 3], 5, 'real source motion still updates');
  pool.release(101);
  pool.update(0.3, { x: 0, y: 30, z: 20 }, { id: 'reduced-motion' });
  assert.equal(pool.alive[a], 0, 'accessibility never strands a retired wake');
  pool.dispose();
});

test('live weapon presenter forwards accessibility to seeded wakes', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const projectile = {
    id: 7, type: 'projectile', alive: true, team: 0,
    pos: { x: 4, z: 0 }, prevPos: { x: 1, z: 0 }, vel: { x: 100, z: 0 },
    data: { weaponId: 'wpn_emp_disruptor_m' },
  };
  const state = { entityList: [projectile], entities: new Map(), settings: {}, render: { meshes: new Map() } };
  presenter.update(0.016, { state, interpolationAlpha: 1 });
  const slot = presenter.ribbons.byEntity.get(7);
  const age = presenter.ribbons.age[slot];
  assert.ok(age > 0);
  state.settings.video = { motionReduce: true };
  projectile.pos.x = 9;
  presenter.update(0.016, { state, interpolationAlpha: 1 });
  assert.equal(presenter.ribbons.age[slot], age);
  assert.equal(presenter.ribbons.hist[slot * presenter.ribbons.segments * 3], 9);
  presenter.dispose();
});

test('status parcels vary by hull and cadence, inherit velocity and keep expiry authority', () => {
  const ship = { id: 3, alive: true, radius: 8, pos: { x: 80, z: 40 }, vel: { x: 50, z: -20 } };
  const active = { stacks: 2, expiresTick: 130 };
  const state = {
    tick: 10, entities: new Map([[3, ship]]),
    combat: { entities: { 3: { statuses: { status_burning: active, status_goo: active } } } },
  };
  const victim = { ...collectStatusAttachedVictims(state).find((row) => row.kind === 'burn') };
  const first = planStatusAttachedEmit(victim, 0.08);
  assert.deepEqual(first, planStatusAttachedEmit(victim, 0.08), 'same causal state reconstructs the same parcel');
  const next = planStatusAttachedEmit({ ...victim, tick: 20 }, 0.08);
  const other = planStatusAttachedEmit({ ...victim, entityId: 4 }, 0.08);
  assert.notDeepEqual(first.sprites, next.sprites);
  assert.notDeepEqual(first.sprites, other.sprites);
  const stationary = planStatusAttachedEmit({ ...victim, vx: 0, vz: 0 }, 0.08);
  assert.ok(Math.abs(first.sprites[0].vx - stationary.sprites[0].vx - 36) < 1e-9);
  assert.ok(Math.abs(first.sprites[0].vz - stationary.sprites[0].vz + 14.4) < 1e-9);
  const reduced = planStatusAttachedEmit(victim, 0.08, { motionReduce: true });
  assert.deepEqual(reduced.sprites, planStatusAttachedEmit({ ...victim, tick: 100 }, 0.08, { motionReduce: true }).sprites);
  assert.ok(reduced.sprites.every((p) => p.vx === 0 && p.vz === 0));
  for (const kind of ['burn', 'goo']) {
    const row = { ...collectStatusAttachedVictims(state).find((item) => item.kind === kind), remainingS: 0.05 };
    const plan = planStatusAttachedEmit(row, 0.2);
    assert.ok(plan.sprites.every((p) => p.life <= 0.05 && Math.abs(p.offset) <= ship.radius * 0.35));
  }
  assert.deepEqual(active, { stacks: 2, expiresTick: 130 });
  assert.deepEqual(ship.vel, { x: 50, z: -20 });
});
