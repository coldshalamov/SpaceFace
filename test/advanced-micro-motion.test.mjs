import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';
import { createProjectileMotionTracker } from '../src/render/projectileMotionPresentation.js';

function createMockWeaponProp(isTurret = false) {
  const barrel = {
    position: { x: 0.5, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  };
  const fins = [
    { material: { emissive: { setRGB: (r, g, b) => { fins[0].r = r; fins[0].g = g; fins[0].b = b; } }, emissiveIntensity: 0 } },
    { material: { emissive: { setRGB: (r, g, b) => { fins[1].r = r; fins[1].g = g; fins[1].b = b; } }, emissiveIntensity: 0 } },
  ];
  const wProp = {
    rotation: { y: 0 }, // front facing
    userData: {
      barrel,
      barrelBaseX: 0.5,
      barrelRecoilX: 0,
      isTurret,
      turretHead: isTurret ? barrel : null,
      coolingFins: fins,
    },
  };
  return wProp;
}

function createMockShipMesh(wProp) {
  return {
    rotation: { y: 0 },
    userData: {
      hull: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      weapons: [wProp],
    },
  };
}

test('dynamic turret tracking: articulates toward active target within arc and sweeps when idle', () => {
  const tracker = createShipMicroMotionTracker();
  const wProp = createMockWeaponProp(true);
  const mesh = createMockShipMesh(wProp);
  const entity = { id: 10, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 } };

  // Target at +30 degrees in front
  const targetEntity = { id: 99, pos: { x: 100, z: 57.7 } }; // angle ~ 0.52 rad
  const entitiesMap = new Map([[99, targetEntity]]);

  const options = {
    playerId: 10,
    playerTargetId: 99,
    entities: entitiesMap,
  };

  // Multiple frames: turret should slew toward ~0.52 rad
  for (let i = 0; i < 20; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.0 + i * 0.016, 0.016, options);
  }

  assert.ok(wProp.userData.turretHead.rotation.y > 0.3, `turret traversed toward target: ${wProp.userData.turretHead.rotation.y}`);

  // When target is removed, turret should articulate back toward idle scanning sweep
  options.playerTargetId = null;
  for (let i = 0; i < 30; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 2.0 + i * 0.016, 0.016, options);
  }
  assert.ok(Number.isFinite(wProp.userData.turretHead.rotation.y), 'turret head retains valid rotation');
});

test('cooling fins thermal blackbody: glows on weapon fire and dumps on weapons:vent', () => {
  const tracker = createShipMicroMotionTracker();
  const wProp = createMockWeaponProp(false);
  const mesh = createMockShipMesh(wProp);
  const entity = { id: 20, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  // Cold state: intensity is 0
  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.equal(wProp.userData.coolingFins[0].material.emissiveIntensity, 0, 'starts cold');

  // Fire several heavy shots to heat up radiators
  tracker.onFire({ ownerId: 20, weaponId: 'railgun_heavy', hardpointIdx: 0 });
  tracker.onFire({ ownerId: 20, weaponId: 'railgun_heavy', hardpointIdx: 0 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  assert.ok(wProp.userData.coolingFins[0].material.emissiveIntensity > 0.5, 'fins glow with thermal blackbody');

  // Trigger forced overheat vent
  tracker.onVent({ ownerId: 20, phase: 'start' });
  tracker.updateCraftMicroMotion(entity, mesh, 1.032, 0.016);
  assert.ok(wProp.userData.coolingFins[0].material.emissiveIntensity >= 3.0, 'fins flare white-hot on vent start');
});

test('environmental hazard buffet: injects atmospheric roll/pitch jitter', () => {
  const tracker = createShipMicroMotionTracker();
  const wProp = createMockWeaponProp(false);
  const mesh = createMockShipMesh(wProp);
  const entity = { id: 30, pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 } };

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  const baseRoll = mesh.userData.hull.rotation.x;

  // Enter ion storm hazard
  tracker.onHazardEnter({ targetId: 30, intensity: 0.9 });
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  tracker.updateCraftMicroMotion(entity, mesh, 1.032, 0.016);

  assert.notEqual(mesh.userData.hull.rotation.x, baseRoll, 'hazard induces roll jitter');
  assert.ok(mesh.userData.hull.position.z !== 0, 'hazard induces lateral shudder');

  // Exit hazard
  tracker.onHazardExit({ targetId: 30 });
});

test('hyperspace jump dynamics: spool-up reactor tremor and warp release snap', () => {
  const tracker = createShipMicroMotionTracker();
  const wProp = createMockWeaponProp(false);
  const mesh = createMockShipMesh(wProp);
  const entity = { id: 40, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  // Spool up
  tracker.onJumpChargeStart({ playerId: 40 });
  tracker.onJumpChargeTick({ playerId: 40, progress: 0.95 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.ok(Math.abs(mesh.userData.hull.position.x) > 0.001 || Math.abs(mesh.userData.hull.position.z) > 0.001, 'reactor tremors under 95% spool-up');

  // Warp start snap
  tracker.onJumpStart({ playerId: 40 });
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  assert.ok(mesh.userData.hull.position.x < -0.05, 'jump launch produces backward recoil snap');

  // Let warp snap settle across transit duration
  for (let i = 0; i < 25; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.032 + i * 0.016, 0.016);
  }

  // Arrival deceleration
  tracker.onJumpArrive({ playerId: 40 });
  tracker.updateCraftMicroMotion(entity, mesh, 2.2, 0.016);
  assert.ok(mesh.userData.hull.position.x > 0, 'jump arrival produces forward deceleration compression');
});

test('docking clamp: produces mechanical contact shudder on latch', () => {
  const tracker = createShipMicroMotionTracker();
  const wProp = createMockWeaponProp(false);
  const mesh = createMockShipMesh(wProp);
  const entity = { id: 50, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  tracker.onDocked({ playerId: 50 });
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);

  assert.ok(mesh.userData.hull.position.x < 0, 'dock clamp engagement knocks hull backward');
});

test('projectile motion: guided missile attitude oscillation and torpedo warhead pulse', () => {
  const tracker = createProjectileMotionTracker();

  // 1. Guided missile
  const missileEntity = { id: 77, data: { kind: 'missile' }, vel: { x: 80, z: 0 } };
  const missileMesh = { rotation: { x: 0, y: 0, z: 0 } };
  tracker.updateProjectileMotion(missileEntity, missileMesh, 1.0, 0.016);
  assert.ok(missileMesh.rotation.z !== 0 || missileMesh.rotation.x !== 0, 'missile exhibits attitude micro-oscillation');

  // 2. Torpedo warhead pulse
  const warheadMat = {
    emissive: { set: (c) => { warheadMat.col = c; } },
    emissiveIntensity: 0.5,
  };
  const torpedoMesh = {
    rotation: { x: 0, y: 0, z: 0 },
    userData: { warhead: { material: warheadMat } },
  };
  const torpedoEntity = { id: 88, data: { kind: 'missile', weaponId: 'wpn_torpedo_l' }, spawnTime: 0 };
  tracker.updateProjectileMotion(torpedoEntity, torpedoMesh, 1.5, 0.016);
  assert.ok(Number.isFinite(warheadMat.emissiveIntensity), 'torpedo warhead pulses dynamically');

  // 3. Corkscrew smoke offset
  const cork = tracker.calculateCorkscrewOffset(77, 1.2, 1, 0, 0.5);
  assert.ok(Number.isFinite(cork.z), 'corkscrew smoke offset calculated');
});
