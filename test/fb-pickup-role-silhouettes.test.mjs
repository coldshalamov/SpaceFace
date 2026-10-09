// FB-075 — pods, ore, chips, volatile pickups and small wrecks read by silhouette at chase
// distance. The five world roles share the fragmentFamilies silhouette vocabulary; visualFactory
// selects it where a role has no richer authored build, and pickupMotionPresentation keeps the
// tumble while giving volatile lots a hotter hazard ping.
//
// Camera math: the default chase camera resolves ~5.96 px/WU at zoom 144 on a 1280x800 frame
// (see fragmentFamilies.js SIZING). A role silhouette's authored geometry is normalized to the
// unit sphere, so its on-screen width at the smallest sensible pickup radius is what the floor
// is pinned against.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PICKUP_ROLE,
  PICKUP_ROLE_LIST,
  PICKUP_ROLE_SILHOUETTE,
  buildPickupRoleGeometry,
  pickupRoleForEntity,
  pickupRoleGeometryHash,
} from '../src/render/vfx/fragmentFamilies.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { globalPickupMotion } from '../src/render/pickupMotionPresentation.js';
import * as THREE from 'three';

const PX_PER_WU_AT_ZOOM_144 = 5.96;

function entity(overrides) {
  return {
    id: 'fb075-stub', alive: true, radius: 2.2,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    ...overrides,
  };
}

test('all five world roles resolve from the entity record', () => {
  assert.equal(pickupRoleForEntity(entity({ type: 'pickup', data: { freightCustodyPod: true } })), PICKUP_ROLE.POD);
  assert.equal(pickupRoleForEntity(entity({ type: 'payload', data: { salvagePool: { cmdty_ore_iron: 4 } } })), PICKUP_ROLE.POD);
  assert.equal(pickupRoleForEntity(entity({ type: 'pickup', data: { kind: 'credit_chip' } })), PICKUP_ROLE.CHIP);
  assert.equal(pickupRoleForEntity(entity({ type: 'payload', data: { volatileClass: 'explosive' } })), PICKUP_ROLE.VOLATILE);
  assert.equal(pickupRoleForEntity(entity({ type: 'pickup', data: { volatileLamp: 'violet' } })), PICKUP_ROLE.VOLATILE);
  assert.equal(pickupRoleForEntity(entity({ type: 'wreck', data: {} })), PICKUP_ROLE.WRECK);
  assert.equal(pickupRoleForEntity(entity({ type: 'pickup', data: { commodityId: 'cmdty_ore_iron' } })), null,
    'a plain commodity pickup has no body-level role — its category shape is the identity');
});

test('each role ships its own silhouette recipe — five hashes, no collisions', () => {
  const hashes = new Map();
  for (const role of PICKUP_ROLE_LIST) {
    assert.equal(typeof PICKUP_ROLE_SILHOUETTE[role], 'string', `${role} has a silhouette name`);
    const geometry = buildPickupRoleGeometry(role);
    assert.ok(geometry && geometry.getAttribute('position').count > 12, `${role} builds real geometry`);
    assert.ok(geometry.boundingSphere && geometry.boundingSphere.radius > 0.5,
      `${role} is unit-fit, got ${geometry.boundingSphere && geometry.boundingSphere.radius}`);
    geometry.dispose();
    const hash = pickupRoleGeometryHash(role);
    assert.ok(Number.isInteger(hash), `${role} hash is deterministic`);
    assert.ok(!hashes.has(hash), `${role} silhouette must not collide with ${hashes.get(hash)}`);
    hashes.set(hash, role);
  }
  assert.equal(hashes.size, PICKUP_ROLE_LIST.length);
});

test('every role silhouette keeps the projected-width floor at the chase camera', () => {
  // Smallest pickup radius the role can plausibly fly at: the jettisoned-pod floor is 3 wu and
  // a credit chip is 2.2 wu — pin the floor at radius 1 so any real spawn clears it by a mile.
  const smallestRadius = 1;
  for (const role of PICKUP_ROLE_LIST) {
    const geometry = buildPickupRoleGeometry(role);
    const widthPx = geometry.boundingSphere.radius * 2 * smallestRadius * PX_PER_WU_AT_ZOOM_144;
    geometry.dispose();
    assert.ok(widthPx >= 6, `${role} projects ${widthPx.toFixed(1)}px at zoom 144 — under 6px it is a speck`);
  }
});

test('visualFactory selects the role: volatile pods are bottles, not canisters', () => {
  const factory = createVisualFactory();
  try {
    const canister = factory.build(entity({ type: 'payload', radius: 3, data: { salvagePool: { cmdty_ore_iron: 4 } } }));
    const bottle = factory.build(entity({ type: 'payload', radius: 3, data: { volatileClass: 'explosive', volatileLamp: 'amber' } }));
    assert.ok(canister && bottle);
    assert.equal(bottle.userData.pickupRole, PICKUP_ROLE.VOLATILE);
    assert.equal(canister.userData.pickupRole, PICKUP_ROLE.POD);
    assert.equal(bottle.userData.visualLanguage, 'volatile-pressure-bottle');
    const bottleGeo = bottle.children[0].geometry;
    const canisterGeo = canister.children[0].geometry;
    assert.notEqual(bottleGeo, canisterGeo, 'the hazard bottle is not the sealed canister');
    bottleGeo.computeBoundingSphere(); canisterGeo.computeBoundingSphere();
    assert.ok(bottleGeo.boundingSphere.radius > canisterGeo.boundingSphere.radius * 0.8,
      'the bottle fills the same unit envelope — no silent shrink');
  } finally {
    invalidateVisualFactoryCaches();
  }
});

test('pod and chip keep their authored builds and carry the role stamp', () => {
  const factory = createVisualFactory();
  try {
    const pod = factory.build(entity({ type: 'pickup', radius: 3, data: { freightCustodyPod: true, salvagePool: { cmdty_ore_iron: 4 } } }));
    assert.equal(pod.userData.pickupRole, PICKUP_ROLE.POD);
    assert.equal(pod.userData.visualLanguage, 'sealed-cargo-canister',
      'the authored canister stays — the role stamp is identity, not a rebuild');
    const chip = factory.build(entity({ type: 'pickup', radius: 2.2, data: { kind: 'credit_chip' } }));
    assert.equal(chip.userData.pickupRole, PICKUP_ROLE.CHIP);
    assert.equal(chip.userData.pickupVisual, 'credit_chip');
    const ore = factory.build(entity({ type: 'pickup', radius: 2.2, data: { commodityId: 'cmdty_ore_iron' } }));
    assert.equal(ore.userData.pickupRole, PICKUP_ROLE.ORE, 'raw ore resolves the ore role');
    assert.equal(ore.userData.pickupShape, 'raw_ore', 'the kit faceted block is the ore silhouette');
  } finally {
    invalidateVisualFactoryCaches();
  }
});

test('a volatile pickup pings hotter on the transponder strobe than an inert one', () => {
  const mkMesh = () => {
    const g = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    g.add(child);
    return g;
  };
  const peak = (data) => {
    const e = entity({ id: `fb075-${data ? 'vol' : 'inert'}`, type: 'pickup', data: data || {} });
    const mesh = mkMesh();
    let max = 0;
    // Sweep two strobe cycles — deterministic sim time, no wall clock.
    for (let t = 0; t < 3.4; t += 0.016) {
      globalPickupMotion.updatePickupMotion(e, mesh, t, 0.016, null, { motionReduce: false });
      max = Math.max(max, mesh.children[0].scale.x);
    }
    return max;
  };
  const inert = peak(null);
  const hazard = peak({ volatileClass: 'explosive' });
  assert.ok(hazard > inert + 0.002,
    `volatile strobe (${hazard.toFixed(4)}) must kick harder than inert (${inert.toFixed(4)})`);
});
