// A weapon hit has to be seen where it lands, at the camera the player actually plays on.
//
// Three defects made the light weapons' contact answer vanish at the 144 WU chase camera:
//   1. an impact attached to a moving target re-resolved from the world pose it had just been
//      written back as, so the contact walked off the hull a frame after it spawned;
//   2. the strips never sent their working heat, so the shader's emission (all of it gated on
//      heat) was zero: dim flat pigment, nothing above the bloom threshold (standard B8);
//   3. strips are authored in world units, so a 0.15 WU ribbon is one pixel at the chase camera.
// This file pins the fix for each at the pool, with no GPU: the descriptor handed to the batch is
// the contract the shader consumes.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  BYSTANDER_SOURCE_HEAT_SCALE,
  IMPACT_HEAT,
  IMPACT_KIND,
  IMPACT_MIN_STRIP_PX,
  SOURCE_HEAT,
  WeaponDischargePool,
} from '../src/render/forceLanguage/weaponDischargePool.js';

const IMPACT_FLASH = { life: 0.16, size0: 1.9, size1: 3.3, opacity0: 1.15, opacity1: 1.15, r: 0.2, g: 0.8, b: 1, pxw: 0 };
const SOURCE_FLASH = { life: 0.11, size0: 1.55, size1: 2.6, opacity0: 1.35, opacity1: 1.35, pxw: 0 };

/** Records every descriptor the pool hands to the batch (36 floats: iOrigin .. iPivot). */
function recordedPool(capacity = 8) {
  const pool = new WeaponDischargePool(new THREE.Scene(), { capacity });
  const rows = [];
  const add = pool.batch.add.bind(pool.batch);
  pool.batch.add = (values) => { rows.push(Array.from(values)); return add(values); };
  return { pool, rows };
}

test('an attached impact stays pinned to its hull-local anchor while the hull sits far from the origin', () => {
  const { pool } = recordedPool();
  const mesh = { position: new THREE.Vector3(240, 0.0, -130), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6) };
  const local = new THREE.Vector3(3.2, 0.35, -1.4);
  // Same contract as WeaponVfxPresenter._resolveSurfacePose for an IMPACT slot: slot.x/y/z are
  // target-local going in, world coming out.
  const resolve = (slot) => {
    const out = resolve.out;
    const p = new THREE.Vector3(slot.x, slot.y, slot.z).applyQuaternion(mesh.quaternion).add(mesh.position);
    out.x = p.x; out.y = p.y; out.z = p.z; out.ax = 1; out.ay = 0; out.az = 0;
    return out;
  };
  resolve.out = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
  assert.equal(pool.spawnImpact({ x: local.x, y: local.y, z: local.z, ax: 1, ay: 0, az: 0, attached: true, slant: 0, targetId: 7 },
    IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH }), true);
  const expected = local.clone().applyQuaternion(mesh.quaternion).add(mesh.position);
  const slot = pool.slots.find((s) => s.alive);
  for (let frame = 0; frame < 8; frame++) {
    pool.update(1 / 60, resolve);
    assert.ok(Math.abs(slot.x - expected.x) < 1e-4 && Math.abs(slot.z - expected.z) < 1e-4,
      `frame ${frame}: the contact must stay on the hull (${slot.x.toFixed(2)}, ${slot.z.toFixed(2)} vs ${expected.x.toFixed(2)}, ${expected.z.toFixed(2)})`);
  }
  // The hull turns: the anchor follows the hull instead of integrating its own drift.
  mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
  const turned = local.clone().applyQuaternion(mesh.quaternion).add(mesh.position);
  pool.update(1 / 60, resolve);
  assert.ok(Math.abs(slot.x - turned.x) < 1e-4 && Math.abs(slot.z - turned.z) < 1e-4, 'the contact rides the turning hull');
});

test('contact and muzzle strips carry working heat so the hit has a hot seat above the bloom threshold', () => {
  const impact = recordedPool();
  impact.pool.spawnImpact({ x: 0, y: 0.35, z: 0, ax: 1, ay: 0, az: 0, attached: false, slant: 0 }, IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH });
  impact.pool.update(1 / 60);
  assert.ok(impact.rows.length >= 5, 'slit, hot seat, fan blades and ring all draw');
  for (const row of impact.rows) {
    assert.equal(row.length, 36, 'the descriptor carries iLife/iBehavior/iPivot explicitly');
    assert.deepEqual(row.slice(24, 28), [0, 0, -1, 1], 'legacy iLife defaults are preserved (not a cycle-driven strip)');
    assert.ok(row[35] > 0.4 && row[35] <= 1, `working heat (iPivot.w) must ride the descriptor, got ${row[35]}`);
  }
  assert.ok(impact.rows.some((row) => row[35] === Math.fround(IMPACT_HEAT)), 'the contact seat uses the full impact heat');

  const source = recordedPool();
  source.pool.spawn({ variant: 'pulse-bolt' }, { x: 0, y: 0.4, z: 0, ax: 1, ay: 0, az: 0 }, 1, { ...SOURCE_FLASH }, 1);
  source.pool.update(1 / 60);
  assert.ok(source.rows.length > 0);
  assert.ok(source.rows.every((row) => row[35] === Math.fround(SOURCE_HEAT)), 'every muzzle strip carries source heat');

  // A muzzle that is not the player's own is cooler, so a crowded fight cannot stack its bloom.
  const npc = recordedPool();
  npc.pool.spawn({ variant: 'pulse-bolt' }, { x: 0, y: 0.4, z: 0, ax: 1, ay: 0, az: 0 }, 9, { ...SOURCE_FLASH }, 0.45);
  npc.pool.update(1 / 60);
  assert.ok(npc.rows.length > 0);
  assert.ok(npc.rows.every((row) => row[35] === Math.fround(SOURCE_HEAT * BYSTANDER_SOURCE_HEAT_SCALE)), 'NPC muzzles run cooler than the player muzzle');
  assert.ok(BYSTANDER_SOURCE_HEAT_SCALE < 1 && BYSTANDER_SOURCE_HEAT_SCALE > 0.5, 'cooler, not dark');
});

test('strip thickness never falls under the pixel floor at the camera it was spawned for, and never shrinks authored size', () => {
  const chase = recordedPool();
  const pxw = 0.134; // world units per pixel at the 144 WU chase camera, 1000 px tall
  chase.pool.spawnImpact({ x: 0, y: 0.35, z: 0, ax: 1, ay: 0, az: 0, attached: false, slant: 0 }, IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH, pxw });
  chase.pool.update(1 / 60);
  const floor = pxw * IMPACT_MIN_STRIP_PX;
  for (const row of chase.rows) assert.ok(row[9] >= floor - 1e-9, `strip width ${row[9]} is under the ${IMPACT_MIN_STRIP_PX} px floor (${floor})`);

  // Close zoom: one pixel is a sliver of a world unit, the authored cross-section is untouched.
  const close = recordedPool();
  close.pool.spawnImpact({ x: 0, y: 0.35, z: 0, ax: 1, ay: 0, az: 0, attached: false, slant: 0 }, IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH, pxw: 0.054 });
  close.pool.update(1 / 60);
  const unfloored = recordedPool();
  unfloored.pool.spawnImpact({ x: 0, y: 0.35, z: 0, ax: 1, ay: 0, az: 0, attached: false, slant: 0 }, IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH, pxw: 0 });
  unfloored.pool.update(1 / 60);
  const widths = (rows) => rows.map((row) => row[9]).sort((a, b) => a - b);
  const w0 = widths(unfloored.rows);
  const w1 = widths(close.rows);
  assert.equal(w1.length, w0.length);
  for (let i = 0; i < w0.length; i++) assert.ok(w1[i] >= w0[i] - 1e-9, 'a floor only ever thickens');

  // Wide camera: the whole footprint scales up so a hit is still a shape, not a speck.
  const wide = recordedPool();
  wide.pool.spawnImpact({ x: 0, y: 0.35, z: 0, ax: 1, ay: 0, az: 0, attached: false, slant: 0 }, IMPACT_KIND.HULL, 'pulse-bolt', { ...IMPACT_FLASH, pxw: 0.31 });
  const slot = wide.pool.slots.find((s) => s.alive);
  assert.ok(slot.width >= 0.31 * 12 - 1e-9 && slot.length >= 0.31 * 46 - 1e-9, 'footprint floors apply at the wide camera');
});

test('the strip batch is sized for the extra hot-seat strip at full slot occupancy', () => {
  const { pool } = recordedPool(48);
  assert.ok(pool.batch.capacity >= 48 * 9, `batch capacity ${pool.batch.capacity} must hold nine strips per slot`);
});
