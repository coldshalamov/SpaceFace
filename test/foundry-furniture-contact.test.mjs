import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { survivalArena } from '../src/systems/survivalArena.js';
import { makeEntity } from '../src/core/entity.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { foundryFurnitureShape } from '../src/data/foundryFurniture.js';
import { resolveCollisionProxyManifest, validateCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { surfaceResponseFor } from '../src/core/surfaceContact.js';
import { sweepCollisionProxyInto } from '../src/core/collisionProxySweep.js';

const near = (a, b, epsilon = 1e-4) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const clone = value => JSON.parse(JSON.stringify(value));
const toys = () => [
  { id: 'foundry_gate_a', kind: 'gate', solid: true, material: 'gate', radius: 16, pos: { x: 200, z: -90 } },
  { id: 'foundry_furnace', kind: 'furnace', solid: true, material: 'furnace', radius: 34, pos: { x: -200, z: -90 } },
  { id: 'foundry_shutter_a', kind: 'shutter', solid: true, dynamic: true, material: 'shutter',
    radius: 20, pos: { x: 200, z: 90 } },
];

function roomFixture(toys) {
  const state = { tick: 10, simTime: 10 / 60, entities: new Map(), entityList: [], nextEntityId: 1 };
  const helpers = { spawnEntity(spec) {
    const entity = makeEntity({ ...spec, id: state.nextEntityId++ });
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  const host = Object.create(survivalArena);
  Object.assign(host, { state, ctx: { helpers }, _roomIds: [], _roomSolids: new Map() });
  host._materializeRoom(toys, 3);
  return { state, helpers, host, bodies: state.entityList.slice() };
}

function nativeContacts(owner, a, b) {
  let contacts = 0;
  for (const ca of owner.records.get(a.id).colliders) {
    for (const cb of owner.records.get(b.id).colliders) {
      owner.world.contactPair(ca, cb, manifold => { contacts += manifold.numSolverContacts(); });
    }
  }
  return contacts;
}

test('gate leaves visually empty space free of actual native contact', async t => {
  const h = roomFixture([{ id: 'foundry_gate_a', kind: 'gate', solid: true, material: 'gate',
    radius: 16, pos: { x: 0, z: 0 } }]);
  const gate = h.bodies[0];
  const visual = createVisualFactory().build(gate);
  const box = new THREE.Box3().setFromObject(visual);
  const probe = h.helpers.spawnEntity({ type: 'payload', pos: { x: 8, z: 0 }, radius: 0.5,
    mass: 1, alive: true, collides: true,
    physicsBody: { radius: 0.5, shape: 'ball', dynamic: true, mass: 1, material: 'payload' } });
  assert.ok(box.max.x < probe.pos.x - probe.radius, 'probe starts entirely outside the visible gate');
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(h.state.entityList);
    owner.step(1 / 60, 11);
    const contacts = nativeContacts(owner, gate, probe);
    t.diagnostic(JSON.stringify({ gateVisibleMaxX: box.max.x, initialProbeX: 8, probeRadius: 0.5,
      solverContacts: contacts, afterProbeX: probe.pos.x, afterProbeZ: probe.pos.z }));
    assert.equal(contacts, 0, 'no native collision outside the visible post');
    assert.ok(Math.abs(probe.pos.x - 8) < 1e-5, 'native solver does not displace the clear probe');
  } finally { owner.dispose(); }
});

test('furniture proxies match the actual renderer bounds and preserve materialization contracts', () => {
  const authored = toys();
  const h = roomFixture(authored), factory = createVisualFactory();
  for (const [i, entity] of h.bodies.entries()) {
    const toy = authored[i], shape = foundryFurnitureShape(entity);
    const manifest = resolveCollisionProxyManifest(entity);
    assert.equal(validateCollisionProxyManifest(manifest).ok, true);
    assert.equal(manifest.id, `foundry:furniture-${toy.kind}`);
    assert.deepEqual(entity.pos, makeEntity({ pos: toy.pos }).pos);
    assert.equal(entity.rot, 0);
    assert.equal(entity.radius, toy.radius);
    assert.equal(entity.mass, toy.dynamic ? 800 : Math.max(400, Math.round(toy.radius ** 2 * 2.5)));
    assert.equal(entity.physicsBody.dynamic, toy.dynamic === true);
    assert.equal(entity.physicsBody.inertiaY, Math.round(entity.mass * toy.radius ** 2 * 0.4));
    assert.equal(entity.physicsBody.material, 'station');
    assert.equal(entity.physicsBody.revision, 0);
    assert.equal(entity.data.surfaceMaterial, toy.material);
    assert.equal(surfaceResponseFor(entity.data.surfaceMaterial), toy.kind === 'furnace' ? 'absorb' : 'none');
    const visual = factory.build(entity);
    visual.updateWorldMatrix(true, true);
    // Measure the BODY against the contact manifest. The work lamp is a small fitting on top of
    // the body (and is polygon-tested separately in swarm-overhaul-foundry-read); including it in
    // the body AABB would make the vertical assertion about the lamp, not the solid.
    const box = new THREE.Box3();
    visual.traverse((node) => {
      if (!node.isMesh) return;
      if (node.material && node.material.name === 'sf-arena-lamp') return;
      box.expandByObject(node);
    });
    const points = manifest.compactHull || manifest.primitives.flatMap(p => [
      { x: p.x - p.hx, z: p.z - p.hz }, { x: p.x + p.hx, z: p.z + p.hz },
    ]);
    near(box.min.x, Math.min(...points.map(p => p.x)) * entity.radius);
    near(box.max.x, Math.max(...points.map(p => p.x)) * entity.radius);
    near(box.min.z, Math.min(...points.map(p => p.z)) * entity.radius);
    near(box.max.z, Math.max(...points.map(p => p.z)) * entity.radius);
    near(box.max.y, shape.body.height * shape.scale / 2);
    assert.equal(manifest.flags.renderable, false);
    assert.equal(manifest.flags.targetable, false);
    assert.equal(manifest.flags.radarVisible, false);
  }
});

function localPoint(entity, x, z) {
  const c = Math.cos(entity.rot), s = Math.sin(entity.rot);
  return { x: entity.pos.x + c * x - s * z, z: entity.pos.z + s * x + c * z };
}

function nativeRay(owner, entity, x, fromZ = 100) {
  const origin = localPoint(entity, x, fromZ);
  const ray = new owner.RAPIER.Ray({ ...origin, y: 0 },
    { x: Math.sin(entity.rot), y: 0, z: -Math.cos(entity.rot) });
  const hits = owner.records.get(entity.id).colliders
    .map(c => c.castRayAndGetNormal(ray, 200, true)).filter(Boolean);
  return hits.sort((a, b) => a.timeOfImpact - b.timeOfImpact)[0] || null;
}

test('native faces follow rotated hex, furnace mouth/body and shutter box; end and mouth-side gaps stay open', async t => {
  const h = roomFixture(toys());
  for (const [i, entity] of h.bodies.entries()) entity.rot = [0.37, -0.63, 1.12][i];
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(h.bodies);
    owner.step(1 / 60, 11);
    const [gate, furnace, shutter] = h.bodies;
    for (const [entity, localX, faceZ] of [
      [gate, 0, 3.2], [furnace, 0, 17.85], [furnace, 12, 16.15], [shutter, 0, 4.2],
    ]) {
      const hit = nativeRay(owner, entity, localX);
      assert.ok(hit, `${entity.data.roomKind} visible face is solid`);
      near(hit.timeOfImpact, 100 - faceZ, 2e-4);
      const out = {};
      const sweep = sweepCollisionProxyInto(out, entity, resolveCollisionProxyManifest(entity),
        localPoint(entity, localX, 100), localPoint(entity, localX, -100), 0);
      assert.equal(sweep, true);
      near(out.t * 200, hit.timeOfImpact, 2e-4);
      t.diagnostic(JSON.stringify({ kind: entity.data.roomKind, rot: entity.rot, localX, faceZ,
        nativeDistance: hit.timeOfImpact, sweepDistance: out.t * 200 }));
    }
    for (const [entity, x] of [[gate, 3.3], [furnace, 20.55], [shutter, 16]]) {
      assert.equal(nativeRay(owner, entity, x), null, `${entity.data.roomKind} end remains open`);
      assert.equal(sweepCollisionProxyInto({}, entity, resolveCollisionProxyManifest(entity),
        localPoint(entity, x, 100), localPoint(entity, x, -100), 0), false);
    }
    const besideMouth = localPoint(furnace, 10, 17.3);
    assert.equal(owner.records.get(furnace.id).colliders.some(c => c.containsPoint({ ...besideMouth, y: 0 })), false,
      'adding the mouth does not fill the empty space either side of it');
    assert.equal(sweepCollisionProxyInto({}, furnace, resolveCollisionProxyManifest(furnace),
      localPoint(furnace, 10, 18), localPoint(furnace, 10, 17), 0.1), false);
    assert.equal(owner.records.get(shutter.id).spec.dynamic, true);
    near(shutter.pos.x, 200); near(shutter.pos.z, 90);
  } finally { owner.dispose(); }
});

test('legacy unproxied scalar rooms and current native saves retain the corrected geometry', async () => {
  const h = roomFixture(toys());
  const legacy = clone(h.bodies);
  for (const entity of legacy) {
    delete entity.physicsBody.collisionProxyManifest;
    assert.deepEqual(resolveCollisionProxyManifest(entity), resolveCollisionProxyManifest(h.state.entities.get(entity.id)));
  }
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const restored = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(legacy); owner.step(1 / 60, 11);
    const saved = clone(owner.exportWorldSnapshot());
    const incoming = legacy.map(entity => {
      const spec = clone(entity);
      delete spec.prevPos; // Runtime integration history is not a durable entity-constructor input.
      return makeEntity(spec);
    });
    assert.equal(restored.adoptWorldSnapshot(saved, incoming,
      { entityIdRemap: new Map(incoming.map(entity => [String(entity.id), entity.id])) }), true);
    for (const entity of incoming) {
      const before = owner.records.get(entity.id), after = restored.records.get(entity.id);
      assert.equal(after.proxyId, before.proxyId);
      assert.equal(after.colliders.length, before.colliders.length);
      assert.equal(after.body.mass(), before.body.mass());
      assert.deepEqual(after.colliders.map(c => c.shapeType()), before.colliders.map(c => c.shapeType()));
    }
    assert.equal(nativeRay(restored, incoming[0], 3.3), null);
    near(nativeRay(restored, incoming[1], 0).timeOfImpact, 82.15, 2e-4);
  } finally { owner.dispose(); restored.dispose(); }
  const generic = makeEntity({ type: 'station', radius: 16, data: { roomKind: 'gate' } });
  assert.equal(resolveCollisionProxyManifest(generic), null, 'generic stations are not Foundry furniture');
});

test('stale radius-ball native cache is refused and ordinary scalar reconstruction restores the post', async () => {
  const h = roomFixture([toys()[0]]);
  const incoming = clone(h.bodies[0]);
  delete incoming.physicsBody.collisionProxyManifest;
  const oldBall = clone(incoming);
  // Select the unchanged station-ball path to construct the legacy native shape.
  // Identity, mass, radius, pose and contact material stay the same; the saved
  // contract records no proxy, as it did before furniture had a footprint.
  oldBall.data.roomOwner = 'legacy-unproxied-room';
  const oldOwner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const current = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    oldOwner.syncFromEntities([oldBall]); oldOwner.step(1 / 60, 11);
    assert.equal(oldOwner.records.get(oldBall.id).colliders[0].shapeType(), 0);
    const saved = clone(oldOwner.exportWorldSnapshot());
    assert.equal(current.adoptWorldSnapshot(saved, [incoming],
      { entityIdRemap: new Map([[String(incoming.id), incoming.id]]) }), false);
    assert.equal(current.records.size, 0, 'rejected cache does not install a stale ball');
    current.rebuildWorldFromEntities([incoming]);
    assert.equal(current.records.get(incoming.id).proxyId, 'foundry:furniture-gate');
    assert.equal(nativeRay(current, incoming, 3.3), null);
    near(nativeRay(current, incoming, 0).timeOfImpact, 96.8, 2e-4);
  } finally { oldOwner.dispose(); current.dispose(); }
});
