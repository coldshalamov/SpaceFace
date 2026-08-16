import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  DAMAGE_STATES as sharedStates,
  REPAIR_EASE_SECONDS,
  attachDamageStateDriver,
  damageStateFor as sharedDamageStateFor,
} from '../src/render/ships/shipDamage.js';
import {
  DAMAGE_STATES as kestrelStates,
  attachDamageStateDriver as attachKestrelDamage,
  damageStateFor as kestrelDamageStateFor,
} from '../src/render/ships/kestrelDamage.js';
import { DRESSING_ROLES } from '../src/render/ships/shipDamageDressing.js';

function makePart(name, role, { emissive = 1.4, size = [0.4, 0.2, 0.2], pos = [0, 0, 0] } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color: 0x667788, emissive: 0x44ccee, emissiveIntensity: emissive }),
  );
  mesh.name = name;
  if (role) mesh.userData.damageRole = role;
  mesh.position.set(pos[0], pos[1], pos[2]);
  return mesh;
}

function makeShip(kind) {
  const root = new THREE.Group();
  root.name = kind === 'kestrel' ? 'KestrelRoot' : 'GenericRoot';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(10, 3, 5),
    new THREE.MeshStandardMaterial({ color: 0x445566 }),
  );
  core.name = kind === 'kestrel' ? 'Kestrel_Pressure_Hull' : 'CoreHull';
  hull.add(core);

  const navA = makePart('NavA', 'navLight', { pos: [1, 0.4, -2.2] });
  const navB = makePart('NavB', 'navLight', { pos: [1, 0.4, 2.2] });
  const armor = makePart('Armor', 'armor', { emissive: 0, pos: [0, 0.6, 1.6] });
  const pod = makePart('UtilityPod', 'secondary', { emissive: 0, size: [1.2, 0.6, 0.7], pos: [-1.2, 1.1, 2.0] });
  const driveCore = makePart('DriveCore', 'driveCore', { emissive: 2.2, size: [0.5, 0.5, 0.5], pos: [-4.6, 0, 0] });
  const plume = makePart('Plume', 'plume', { emissive: 1.1, size: [1.4, 0.4, 0.4], pos: [-5.4, 0, 0] });
  plume.material.transparent = true;
  plume.material.opacity = 0.30;

  hull.add(navA, navB, armor, pod, driveCore, plume);
  root.add(hull);

  if (kind === 'kestrel') attachKestrelDamage(root, hull, 0.30);
  else {
    attachDamageStateDriver(root, hull, {
      navLights: [navA, navB],
      driveCore,
      plume,
      plumeBaseOpacity: 0.30,
      secondary: [pod],
      armor: [armor],
    });
  }

  return {
    root,
    hull,
    core,
    navA,
    navB,
    armor,
    pod,
    driveCore,
    plume,
    entity: {
      id: kind,
      hull: 1000,
      hullMax: 1000,
      disabled: false,
      vel: { x: 4, y: 0, z: -2 },
      input: { axes: { thrust: 1 }, actions: { firePrimary: true } },
      control: { mode: 'fly', locked: false },
      timeScale: 1,
    },
  };
}

function tick(ship, hull, now, extra = {}) {
  if (hull != null) ship.entity.hull = hull;
  Object.assign(ship.entity, extra);
  ship.root.userData.updateDamageState(ship.entity, now);
}

function visibleRoles(root) {
  const dressing = root.userData.damageDressing;
  const roles = [];
  for (let i = 0; i < dressing.meshes.length; i++) {
    const mesh = dressing.meshes[i];
    if (mesh.visible) roles.push(mesh.userData.damageDressingRole);
  }
  return roles;
}

function countNodes(root) {
  let n = 0;
  root.traverse(() => { n += 1; });
  return n;
}

function hasBannedPrimitive(root) {
  let banned = false;
  root.traverse((obj) => {
    if (obj.isSprite || obj.isPoints || obj.type === 'Sprite' || obj.type === 'Points') banned = true;
  });
  return banned;
}

function repairTime(fromFrac, toFrac, bandFrac) {
  return REPAIR_EASE_SECONDS * ((bandFrac - fromFrac) / (toFrac - fromFrac));
}

test('shared resolver uses exact 75/50/25/disabled/destruction thresholds', () => {
  assert.equal(sharedDamageStateFor, kestrelDamageStateFor);
  assert.equal(sharedStates, kestrelStates);
  assert.equal(sharedDamageStateFor(1), 'operational');
  assert.equal(sharedDamageStateFor(0.75), 'operational');
  assert.equal(sharedDamageStateFor(0.749), 'stressed');
  assert.equal(sharedDamageStateFor(0.50), 'stressed');
  assert.equal(sharedDamageStateFor(0.499), 'damaged');
  assert.equal(sharedDamageStateFor(0.25), 'damaged');
  assert.equal(sharedDamageStateFor(0.249), 'critical');
  assert.equal(sharedDamageStateFor(0.01), 'critical');
  assert.equal(sharedDamageStateFor(0), 'destruction');
  assert.equal(sharedDamageStateFor(-1), 'destruction');
  assert.equal(sharedDamageStateFor(0.80, false), 'operational');
  assert.equal(sharedDamageStateFor(0.80, true), 'disabled');
  assert.equal(sharedDamageStateFor(0, true), 'disabled');
  assert.equal(sharedDamageStateFor(0, false), 'destruction');
  assert.equal(sharedDamageStateFor(0.10, true), 'disabled');
});

test('player Kestrel adapter and generic ships share the same driver and dressing', () => {
  const generic = makeShip('generic');
  const kestrel = makeShip('kestrel');

  assert.equal(generic.root.userData.damageDriver, 'shipDamage');
  assert.equal(kestrel.root.userData.damageDriver, 'shipDamage');
  assert.equal(generic.root.userData.damageDressing.meshes.length, 8);
  assert.equal(kestrel.root.userData.damageDressing.meshes.length, 8);
  assert.deepEqual(
    generic.root.userData.damageDressing.meshes.map((m) => m.userData.damageDressingRole),
    DRESSING_ROLES,
  );
  assert.equal(
    generic.root.userData.damageDressing.meshes[0].geometry,
    kestrel.root.userData.damageDressing.meshes[0].geometry,
  );

  tick(generic, 600, 0);
  tick(kestrel, 600, 0);
  assert.equal(generic.root.userData.damageState, 'stressed');
  assert.equal(kestrel.root.userData.damageState, 'stressed');
  assert.deepEqual(visibleRoles(generic.root), visibleRoles(kestrel.root));
});

test('every hull band exposes the intended fixed 3D geometry without sprites or child growth', () => {
  const ship = makeShip('generic');
  const before = countNodes(ship.root);
  assert.equal(hasBannedPrimitive(ship.root), false);
  assert.ok(ship.root.userData.damageDressing.meshes.every((mesh) => mesh.isMesh && !mesh.isSprite));

  tick(ship, 1000, 0);
  assert.equal(ship.root.userData.damageState, 'operational');
  assert.deepEqual(visibleRoles(ship.root), []);

  tick(ship, 600, 0.1);
  assert.equal(ship.root.userData.damageState, 'stressed');
  assert.ok(visibleRoles(ship.root).includes('scorch'));
  assert.equal(visibleRoles(ship.root).includes('breach'), false);
  assert.equal(visibleRoles(ship.root).includes('beacon'), false);

  tick(ship, 350, 0.2);
  assert.equal(ship.root.userData.damageState, 'damaged');
  assert.deepEqual(visibleRoles(ship.root).filter((role) => role !== 'hotContact').sort(), ['breach', 'scorch', 'wake0']);
  assert.ok(ship.navA.material.emissiveIntensity < 0.5);

  tick(ship, 100, 0.3);
  assert.equal(ship.root.userData.damageState, 'critical');
  assert.deepEqual(visibleRoles(ship.root).filter((role) => role !== 'hotContact').sort(), [
    'breach', 'scorch', 'vent', 'wake0', 'wake1', 'wake2',
  ]);
  assert.equal(ship.pod.visible, false);
  assert.equal(ship.core.visible, true);
  assert.equal(ship.driveCore.visible, true);

  tick(ship, 800, 0.4, { disabled: true });
  assert.equal(ship.root.userData.damageState, 'disabled');
  assert.deepEqual(visibleRoles(ship.root), ['beacon']);
  assert.equal(ship.navA.material.emissiveIntensity, 0);
  assert.equal(ship.navB.material.emissiveIntensity, 0);
  assert.equal(ship.plume.visible, false);
  assert.equal(ship.root.userData.damageDressing.meshes.filter((mesh) => mesh.visible).length, 1);

  tick(ship, 0, 0.5, { disabled: false });
  assert.equal(ship.root.userData.damageState, 'destruction');
  assert.deepEqual(visibleRoles(ship.root), []);
  assert.equal(ship.navA.material.emissiveIntensity, 0);
  assert.equal(ship.plume.visible, false);

  for (let i = 0; i < 48; i++) tick(ship, 100, 1 + i * 0.016, { disabled: false });
  assert.equal(countNodes(ship.root), before);
  assert.equal(ship.root.userData.damageDressing.group.children.length, 8);
  assert.equal(hasBannedPrimitive(ship.root), false);
});

test('downward damage is immediate and a full repair clears band-by-band over bounded time', () => {
  const ship = makeShip('kestrel');

  tick(ship, 1000, 0);
  assert.equal(ship.root.userData.damageState, 'operational');

  tick(ship, 100, 0);
  assert.equal(ship.root.userData.damageState, 'critical');
  assert.ok(visibleRoles(ship.root).includes('vent'));
  assert.equal(ship.root.userData.damagePresentFrac, 0.1);

  tick(ship, 1000, 0);
  assert.equal(ship.root.userData.damageState, 'critical', 'same timestamp must not snap a full repair clean');
  assert.ok(visibleRoles(ship.root).includes('vent'));

  const tDamaged = repairTime(0.1, 1, 0.25);
  tick(ship, 1000, tDamaged + 0.01);
  assert.equal(ship.root.userData.damageState, 'damaged');
  assert.equal(visibleRoles(ship.root).includes('vent'), false);
  assert.ok(visibleRoles(ship.root).includes('breach'));

  const tStressed = repairTime(0.1, 1, 0.50);
  tick(ship, 1000, tStressed + 0.01);
  assert.equal(ship.root.userData.damageState, 'stressed');
  assert.equal(visibleRoles(ship.root).includes('breach'), false);
  assert.ok(visibleRoles(ship.root).includes('scorch'));

  const tOperational = repairTime(0.1, 1, 0.75);
  tick(ship, 1000, tOperational + 0.01);
  assert.equal(ship.root.userData.damageState, 'operational');
  assert.deepEqual(visibleRoles(ship.root), []);

  tick(ship, 200, 4);
  tick(ship, 1000, 0.2);
  assert.ok(ship.root.userData.damagePresentFrac < 1);
  assert.ok(Number.isFinite(ship.root.userData.damagePresentFrac));
  assert.notEqual(ship.root.userData.damageState, 'operational');
});

test('the render driver never mutates hull, velocity, input, or control', () => {
  const ship = makeShip('generic');
  const vel = { ...ship.entity.vel };
  const input = ship.entity.input;
  const actions = { ...input.actions };
  const axes = { ...input.axes };
  const control = ship.entity.control;
  const controlCopy = { ...control };

  tick(ship, 400, 0);
  tick(ship, 400, 0.5, { disabled: true });
  tick(ship, 0, 1.0, { disabled: false });
  tick(ship, 1000, 1.1);
  tick(ship, 1000, 3.0);

  assert.equal(ship.entity.hull, 1000);
  assert.equal(ship.entity.hullMax, 1000);
  assert.deepEqual(ship.entity.vel, vel);
  assert.equal(ship.entity.input, input);
  assert.deepEqual(ship.entity.input.actions, actions);
  assert.deepEqual(ship.entity.input.axes, axes);
  assert.equal(ship.entity.control, control);
  assert.deepEqual(ship.entity.control, controlCopy);
  assert.equal(ship.entity.timeScale, 1);
  assert.equal(ship.entity.disabled, false);
});
