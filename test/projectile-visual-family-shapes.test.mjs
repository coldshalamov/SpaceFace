import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

function buildProjectile(weaponId, damageType = 'kinetic', kind = 'bullet') {
  return createVisualFactory().build({
    id: `test:${weaponId}`,
    type: 'projectile',
    radius: 0.7,
    team: 0,
    data: { weaponId, damageType, kind },
  });
}

function geometryTypes(root) {
  const types = [];
  root.traverse((object) => {
    if (object.isMesh && object.geometry) types.push(object.geometry.type);
  });
  return types;
}

test('plasma and flak bodies are directional shapes, not glowing balls', () => {
  const plasma = buildProjectile('wpn_plasma_cannon_m', 'thermal');
  const flak = buildProjectile('wpn_flak_turret_s', 'kinetic');
  assert.ok(!geometryTypes(plasma).includes('SphereGeometry'));
  assert.ok(!geometryTypes(flak).includes('SphereGeometry'));
  assert.ok(geometryTypes(plasma).includes('CapsuleGeometry'));
  assert.ok(geometryTypes(flak).includes('CapsuleGeometry'));
});

test('missile exhaust is attached directional geometry rather than halo beads', () => {
  const missile = buildProjectile('wpn_missile_rack_m', 'explosive', 'missile');
  let sprites = 0;
  missile.traverse((object) => { if (object.isSprite) sprites++; });
  assert.equal(sprites, 0);
  assert.ok(missile.getObjectByName('ProjectileMissileExhaust'));
});

test('EMP has a distinct forked disruption body', () => {
  const emp = buildProjectile('wpn_emp_disruptor_m', 'emp');
  assert.ok(emp.getObjectByName('ProjectileEmpSpine'));
  assert.ok(emp.getObjectByName('ProjectileEmpFork'));
});

test('pulse laser is one tapered directional packet without a capsule bead', () => {
  const pulse = buildProjectile('wpn_pulse_laser_s', 'energy');
  assert.equal(geometryTypes(pulse).includes('SphereGeometry'), false);
  assert.equal(geometryTypes(pulse).includes('CapsuleGeometry'), false,
    'rounded capsule ends merge with the sheath as a detached glowing bead at the game camera');
  const bounds = new THREE.Box3().setFromObject(pulse);
  const size = bounds.getSize(new THREE.Vector3());
  assert(size.x > size.z * 10,
    `pulse silhouette must stay tracer-like instead of resolving as a bar-and-ball pair: ${size.x}/${size.z}`);
  assert(size.x < 3.2,
    `starter pulse must remain a compact packet at the game camera instead of a screen-scale white bar: ${size.x}`);
  const core = pulse.getObjectByName('ProjectilePulseCore');
  const sheath = pulse.getObjectByName('ProjectilePulseSheath');
  assert.ok(core?.material?.uniforms?.uColorA?.value,
    'pulse core must expose its authored energy color for acceptance checks');
  assert.notEqual(core.material.uniforms.uColorA.value.getHexString(), 'ffffff',
    'a pure-white HDR core collapses the starter pulse into a generic bloom dash at the game camera');
  const pulseHsl = { h: 0, s: 0, l: 0 };
  core.material.uniforms.uColorA.value.getHSL(pulseHsl);
  assert.ok(pulseHsl.l < 0.72,
    `starter pulse core must be a saturated cyan energy color, not near-white: lightness ${pulseHsl.l}`);
  assert.ok(core.material.uniforms.uIntensity.value <= 1.1,
    `starter pulse core intensity must preserve cyan structure under bloom: ${core.material.uniforms.uIntensity.value}`);
  assert.ok(sheath?.material?.uniforms?.uIntensity?.value <= 0.7,
    `starter pulse sheath must remain subordinate to the packet silhouette: ${sheath?.material?.uniforms?.uIntensity?.value}`);
});

test.after(() => invalidateVisualFactoryCaches());
