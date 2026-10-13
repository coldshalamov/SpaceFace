import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { foundryPlateShape, foundryPlateProxy } from '../src/data/foundryPlate.js';
import { planArenaInstall, survivalArena } from '../src/systems/survivalArena.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { resolveCollisionProxyManifest, validateCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { physics } from '../src/core/physics.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';

const near = (actual, expected, epsilon = 1e-4) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `${actual} != ${expected}`);
function fixture() {
  const state = { tick: 10, simTime: 10 / 60, world: {}, entities: new Map(), entityList: [], nextEntityId: 1 };
  const helpers = { spawnEntity(spec) {
    const entity = makeEntity({ ...spec, id: state.nextEntityId++ });
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  const host = Object.create(survivalArena); host.state = state; host.ctx = { helpers };
  host._roomIds = []; host._roomSolids = new Map();
  const install = planArenaInstall({ arenaId: 'helios_core', arenaPhase: 'idle', wave: 3, seed: 13304,
    anchor: { x: 700, z: -300 }, laneGate: 'ne' });
  const toys = install.toys.filter(toy => toy.kind === 'plate');
  host._materializeRoom(toys, 3);
  return { state, host, toys, plates: state.entityList, helpers };
}

test('the authored bank, live slab and native proxy share width, normal and reference mass', () => {
  const h = fixture(); const factory = createVisualFactory();
  for (let i = 0; i < h.plates.length; i++) {
    const plate = h.plates[i]; const toy = h.toys[i]; const shape = foundryPlateShape(plate);
    near(shape.halfWidth, toy.halfWidth); near(shape.radius, toy.radius);
    near(-Math.sin(plate.rot), toy.normal.x); near(Math.cos(plate.rot), toy.normal.z);
    assert.equal(plate.mass, 1690); assert.equal(plate.physicsBody.inertiaY, 456976);
    assert.equal(plate.physicsBody.dynamic, false); assert.equal(plate.hull, 101040);
    assert.equal(resolvePhysicsBodySpec(plate).mass, 1690);
    const manifest = resolveCollisionProxyManifest(plate);
    assert.equal(validateCollisionProxyManifest(manifest).ok, true);
    near(manifest.primitives[0].hx * plate.radius, shape.halfWidth);
    near(manifest.primitives[0].hz * plate.radius, shape.halfDepth);
    const visual = factory.build(plate); assert.ok(visual);
    const box = new THREE.Box3().setFromObject(visual);
    near(box.max.x, shape.halfWidth); near(box.max.z, shape.halfDepth); near(box.max.y, shape.halfHeight);
    const body = visual.children.find(object => object.isMesh);
    assert.equal(body.material.color.getHex(), 0x2c2926);
    assert.equal(body.material.roughness, 0.94); assert.equal(body.material.metalness, 0.06);
    const restored = JSON.parse(JSON.stringify(plate));
    assert.deepEqual(foundryPlateShape(restored), shape);
    assert.deepEqual(foundryPlateProxy(shape), plate.physicsBody.collisionProxyManifest);
  }
});

test('actual native OBB contact lands on the visible bank face at its authored inward normal', async () => {
  const h = fixture(); const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(h.plates); owner.step(1 / 60, 11);
    for (let i = 0; i < h.plates.length; i++) {
      const plate = h.plates[i]; const shape = foundryPlateShape(plate); const n = h.toys[i].normal;
      const tangent = { x: n.z, z: -n.x }; const offset = shape.halfWidth * 0.8;
      const origin = { x: plate.pos.x + tangent.x * offset + n.x * 100, y: 0,
        z: plate.pos.z + tangent.z * offset + n.z * 100 };
      const ray = new owner.RAPIER.Ray(origin, { x: -n.x, y: 0, z: -n.z });
      const collider = owner.records.get(plate.id).colliders[0];
      assert.equal(collider.shapeType(), 1, 'Rapier cuboid, not a radius26 ball');
      const hit = collider.castRayAndGetNormal(ray, 200, true); assert.ok(hit);
      near(hit.timeOfImpact, 100 - shape.halfDepth, 1e-3);
      near(hit.normal.x, n.x, 1e-5); near(hit.normal.z, n.z, 1e-5);
      const missOrigin = { x: plate.pos.x + tangent.x * (shape.halfWidth + 3) + n.x * 100, y: 0,
        z: plate.pos.z + tangent.z * (shape.halfWidth + 3) + n.z * 100 };
      assert.equal(collider.castRayAndGetNormal(new owner.RAPIER.Ray(missOrigin,
        { x: -n.x, y: 0, z: -n.z }), 200, true), null, 'empty bounding-circle corners remain passable');
    }
  } finally { owner.dispose(); }
});

test('production projectile receipt and bank reflection retain the off-center slab face normal', () => {
  const h = fixture(); const plate = h.plates[0]; const n = h.toys[0].normal;
  const tangent = { x: n.z, z: -n.x }; const shape = foundryPlateShape(plate);
  const at = (distance) => ({ x: plate.pos.x + tangent.x * 38 + n.x * distance,
    z: plate.pos.z + tangent.z * 38 + n.z * distance });
  const projectile = h.helpers.spawnEntity({ type: 'projectile', radius: 0.7, collides: true,
    pos: at(0), ownerId: 900, vel: { x: -n.x * 300, z: -n.z * 300 },
    data: { damageType: 'kinetic', damage: 1 } });
  // prevPos is a runtime integration record, not part of the factory's durable schema.
  projectile.prevPos = at(100);
  const bus = createBus(); let payload;
  bus.on('projectile:hit', value => { payload = value; });
  const host = Object.create(physics); host.init({ state: h.state, bus, helpers: h.helpers });
  host.sweepProjectiles(1 / 3, h.state);
  assert.ok(payload, 'actual production sweep issued the receipt');
  assert.equal(payload.targetId, plate.id);
  const faceDistance = (payload.pos.x - plate.pos.x) * n.x + (payload.pos.z - plate.pos.z) * n.z;
  near(faceDistance, shape.halfDepth + projectile.radius);
  near(payload.normal.x, n.x, 1e-5); near(payload.normal.z, n.z, 1e-5);
  assert.deepEqual(payload.normal, payload.receipt.normal);
  const compiled = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] });
  assert.equal(compiled.ok, true);
  const result = resolveRicochet(createLineage({ spec: compiled.spec }), compiled.spec, payload.receipt, projectile);
  assert.equal(result.ok, true); near(result.velocity.x, n.x * 300, 1e-3); near(result.velocity.z, n.z * 300, 1e-3);
});

test('legacy room plates resolve the canonical datum without expanding nonplate toys', () => {
  const legacy = foundryPlateShape({ radius: 26, data: { roomKind: 'plate' } });
  assert.equal(legacy.referenceRadius, 26); assert.equal(legacy.halfWidth, 48);
  assert.equal(legacy.halfDepth, 16.900000000000002);
  const h = fixture();
  h.host._materializeRoom([{ id: 'gate', kind: 'gate', solid: true, radius: 16, pos: { x: -400, z: -400 } }], 3);
  const gate = h.state.entityList.at(-1);
  assert.equal(gate.radius, 16); assert.equal(gate.physicsBody.collisionProxyManifest, undefined);
  assert.equal(gate.mass, 640); assert.equal(gate.rot, 0);
});
