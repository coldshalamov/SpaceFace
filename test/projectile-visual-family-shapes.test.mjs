import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import {
  CHASE_CAMERA_DISTANCE,
  CHASE_CAMERA_FOV_DEG,
  CHASE_CAMERA_VIEWPORT_HEIGHT,
  DEFAULT_BOLT_MIN_PIXELS,
  FLIGHT_MODE,
  projectileSkipsVisualFactoryMesh,
  resolveFloorWidth,
  resolveWeaponRecipe,
  worldSizeForPixels,
} from '../src/render/weapons/index.js';

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

test('energy families skip tube meshes and use the energy-card presenter', () => {
  const pulse = buildProjectile('wpn_pulse_laser_s', 'energy');
  const plasma = buildProjectile('wpn_plasma_cannon_m', 'thermal');
  const flak = buildProjectile('wpn_flak_turret_s', 'kinetic');
  const emp = buildProjectile('wpn_emp_disruptor_m', 'emp');
  for (const mesh of [pulse, plasma, flak, emp]) {
    assert.equal(mesh.userData.weaponPresenter, 'energy-card');
    assert.equal(geometryTypes(mesh).includes('CylinderGeometry'), false);
    assert.equal(geometryTypes(mesh).includes('CapsuleGeometry'), false);
    assert.equal(geometryTypes(mesh).includes('SphereGeometry'), false);
  }
  assert.equal(projectileSkipsVisualFactoryMesh({
    type: 'projectile',
    data: { weaponId: 'wpn_pulse_laser_s', damageType: 'energy' },
  }), true);
  assert.equal(resolveWeaponRecipe('wpn_pulse_laser_s').flight.mode, FLIGHT_MODE.ENERGY_CARD);
});

test('missile exhaust remains attached directional geometry rather than an energy card', () => {
  const missile = buildProjectile('wpn_missile_rack_m', 'explosive', 'missile');
  let sprites = 0;
  missile.traverse((object) => { if (object.isSprite) sprites++; });
  assert.equal(sprites, 0);
  assert.ok(missile.getObjectByName('ProjectileMissileExhaust'));
  assert.equal(resolveWeaponRecipe('wpn_missile_rack_m').flight.mode, FLIGHT_MODE.MESH);
});

test('pulse energy card has a chase-camera pixel floor and a saturated cyan recipe', () => {
  const recipe = resolveWeaponRecipe('wpn_pulse_laser_s');
  assert.equal(recipe.variant, 'pulse-bolt');
  assert.equal(recipe.flight.coreColor, '#34cfff');
  assert.notEqual(recipe.flight.coreColor.toLowerCase(), '#ffffff');
  assert.ok(recipe.flight.intensity > 1 && recipe.flight.intensity < 3.2);
  assert.equal(recipe.muzzle.flipbook, true);
  assert.equal(recipe.shield.contact, true);
  assert.equal(recipe.hull.scorch, true);
  const floor = worldSizeForPixels(
    CHASE_CAMERA_DISTANCE,
    DEFAULT_BOLT_MIN_PIXELS,
    CHASE_CAMERA_FOV_DEG,
    CHASE_CAMERA_VIEWPORT_HEIGHT,
  );
  assert.ok(floor > 1.4 && floor < 2.0, `12px at chase camera is a readable bolt width, got ${floor}`);
  const width = resolveFloorWidth(
    recipe.flight.width,
    CHASE_CAMERA_DISTANCE,
    recipe.flight.pixelFloor,
    CHASE_CAMERA_FOV_DEG,
    CHASE_CAMERA_VIEWPORT_HEIGHT,
  );
  const viewHeight = 2 * CHASE_CAMERA_DISTANCE * Math.tan((CHASE_CAMERA_FOV_DEG * Math.PI / 180) / 2);
  const widthPx = width / viewHeight * CHASE_CAMERA_VIEWPORT_HEIGHT;
  assert.ok(widthPx >= 12 && widthPx < 40, `pulse card width at chase camera, got ${widthPx.toFixed(1)} px`);
  assert.ok(recipe.flight.dashLength > 6 && recipe.flight.dashLength < 14);
});

test.after(() => invalidateVisualFactoryCaches());
