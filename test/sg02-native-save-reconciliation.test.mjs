import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { writePhysicsBodyResponse } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
function actor(id, x = 0, mass = 24) {
  return { id, type: 'ship', alive: true, isPlayer: id === 1, radius: 3, mass,
    pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    data: { defId: 'ship_kestrel' }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 3, mass, inertiaY: mass * 2,
      dynamic: true, shape: 'ball', ccd: false, revision: 0 } };
}
async function ownerFor(entities, options = {}) {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, ...options });
  owner.syncFromEntities(entities);
  return owner;
}
function rope(owner, id, z) {
  assert.ok(owner.createAttachment({ attachmentId: id, defId: 'test_legacy_rope', ownerId: 1, targetId: 2,
    sourceSocketId: `source_${id}`, targetSocketId: `target_${id}`,
    sourceAnchorLocal: { x: 0, y: 0, z }, targetAnchorLocal: { x: 0, y: 0, z: -z },
    restLength: 50, spring: { mode: 'legacy_rope' } }));
}
function adapter(owner, entities) {
  const state = createGameState(44);
  state.mode = 'flight'; state.tick = 12;
  state.entityList = entities; state.entities = new Map(entities.map(e => [e.id, e]));
  state.playerId = entities.find(e => e.isPlayer)?.id || entities[0]?.id;
  const system = Object.create(physics);
  system.init({ state, bus: createBus(), helpers: {} });
  system._sg02 = owner;
  return system;
}

test('native bodies use explicit saved-to-current IDs, not current occupants of saved IDs', async () => {
  const original = [actor(1, 0, 24), actor(2, 50, 240)];
  const source = await ownerFor(original), target = await ownerFor([]);
  try {
    const saved = clone(source.exportWorldSnapshot());
    const current = original.map(e => ({ ...clone(e), id: e.id === 1 ? 2 : 1 }));
    assert.equal(target.adoptWorldSnapshot(saved, current, { entityIdRemap: new Map([['1', 2], ['2', 1]]) }), true);
    assert.equal(target.records.get(2).body.mass(), 24);
    assert.equal(target.records.get(1).body.mass(), source.records.get(2).body.mass());
    assert.equal(target.records.size, 2);
  } finally { source.dispose(); target.dispose(); }
});

test('valid authored mass/shape changes and an omitted actor choose whole-owner fallback', async () => {
  const entities = [actor(1), actor(2, 50, 240)];
  const source = await ownerFor(entities), target = await ownerFor([actor(77, 120)]);
  try {
    const payload = clone(source.exportWorldSnapshot()), oldWorld = target.world, oldRecords = target.records;
    const changed = clone(entities);
    changed[0].physicsBody.mass = 60; changed[0].physicsBody.inertiaY = 120;
    assert.equal(target.adoptWorldSnapshot(payload, changed), false);
    assert.equal(target.world, oldWorld); assert.equal(target.records, oldRecords);
    target.rebuildWorldFromEntities(changed);
    assert.ok(Math.abs(target.records.get(1).body.mass() - 60) < 1e-5);
    assert.equal(target.world.bodies.len(), 2);
    assert.equal(target.adoptWorldSnapshot(payload, [clone(entities[0])]), false);
    target.rebuildWorldFromEntities([clone(entities[0])]);
    assert.equal(target.world.bodies.len(), 1);
    assert.equal(target.records.has(2), false);
    const resized = clone(entities); resized[0].physicsBody.radius = 8;
    assert.equal(target.adoptWorldSnapshot(payload, resized), false);
    const shifted = clone(entities); shifted[0].pos.x += 0.001;
    assert.equal(target.adoptWorldSnapshot(payload, shifted), false);
  } finally { source.dispose(); target.dispose(); }
});

test('two same-pair ropes retain distinct joint handles and ordered local anchors', async () => {
  const entities = [actor(1), actor(2, 40)];
  const source = await ownerFor(entities), target = await ownerFor([]);
  try {
    rope(source, 'rope_a', 2); rope(source, 'rope_b', 5);
    const payload = clone(source.exportWorldSnapshot());
    payload.attachments = Object.fromEntries(Object.entries(payload.attachments).reverse());
    assert.equal(target.adoptWorldSnapshot(payload, clone(entities), {
      resolveAttachmentContract: id => payload.attachments[id],
    }), true);
    assert.equal(target.world.impulseJoints.len(), 2);
    for (const id of ['rope_a', 'rope_b']) {
      const attachment = target.attachments.get(id);
      assert.equal(String(attachment.contactJoint.handle), payload.attachments[id].joint.handle);
      assert.deepEqual({ ...attachment.contactJoint.anchor1() }, payload.attachments[id].sourceAnchorLocal);
      assert.deepEqual({ ...attachment.contactJoint.anchor2() }, payload.attachments[id].targetAnchorLocal);
    }
    assert.notEqual(target.attachments.get('rope_a').contactJoint.handle, target.attachments.get('rope_b').contactJoint.handle);
  } finally { source.dispose(); target.dispose(); }
});

test('candidate failure leaves old world, all maps, and incoming sleeping mirrors untouched', async () => {
  const original = [actor(1), actor(2, 50)];
  const source = await ownerFor(original), target = await ownerFor([actor(91, 100)]);
  try {
    const incoming = clone(original); incoming.forEach(e => { e.physicsSleeping = true; });
    const old = { world: target.world, records: target.records, dynamic: target.dynamicRecords,
      colliders: target._colliderOwners, attachments: target.attachments, rebound: target._reboundEntityIds };
    const real = target._adoptRecord; let calls = 0;
    target._adoptRecord = function(...args) { if (++calls === 2) throw new Error('injected assembly failure'); return real.apply(this, args); };
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), incoming), false);
    assert.equal(calls, 2);
    assert.equal(target.world, old.world); assert.equal(target.records, old.records);
    assert.equal(target.dynamicRecords, old.dynamic); assert.equal(target._colliderOwners, old.colliders);
    assert.equal(target.attachments, old.attachments); assert.equal(target._reboundEntityIds, old.rebound);
    assert.equal(target.world.bodies.len(), 1);
    assert.ok(incoming.every(e => e.physicsSleeping === true));
    target.step(DT);
    assert.equal(target.records.get(91).body.isValid(), true);
  } finally { source.dispose(); target.dispose(); }
});

test('saved frame origin is used before record mirrors are built; valid continuation remains exact', async () => {
  const entities = [actor(1, 1000), actor(2, 1060)];
  const source = await ownerFor(entities, { frameOrigin: { x: 1000, z: -500 }, frameOriginSeq: 7 });
  const target = await ownerFor([]);
  try {
    source.records.get(1).body.setLinvel({ x: 6, y: 0, z: 1 }, true);
    source.step(DT);
    const current = clone(entities);
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), current), true);
    assert.deepEqual(target.quantizedSnapshot(), source.quantizedSnapshot());
    for (let i = 0; i < 12; i++) { source.step(DT); target.step(DT); }
    assert.deepEqual(current.map(e => [e.pos, e.vel, e.rot]), entities.map(e => [e.pos, e.vel, e.rot]));
  } finally { source.dispose(); target.dispose(); }
});

test('save barrier waits for semantic rebinding, then distinguishes native from old-save fallback', async () => {
  const original = [actor(1)]; const source = await ownerFor(original);
  const target = await ownerFor([actor(88, 500)]);
  const restored = clone(original); restored[0].id = 7;
  const system = adapter(target, restored);
  try {
    const oldWorld = target.world;
    system.deserialize(clone(source.exportWorldSnapshot()), { deferNative: true });
    system._resetSg02AfterLoad();
    assert.equal(target.world, oldWorld);
    system.completeRestore({ entityIdRemap: new Map([['1', 7]]) });
    assert.deepEqual(system.state.physicsRuntime.nativeRestore, { mode: 'native', exact: true, reason: null });
    assert.equal(target.records.get(7).body.mass(), 24);
    system.deserialize(null, { deferNative: true });
    system.completeRestore({ entityIdRemap: new Map([['1', 7]]) });
    assert.deepEqual(system.state.physicsRuntime.nativeRestore, { mode: 'scalar', exact: false, reason: 'legacy_missing' });
    assert.equal(target.world.bodies.len(), 1);
    const schemaOne = { ...clone(source.exportWorldSnapshot()), schema: 1 };
    system.deserialize(schemaOne, { deferNative: true });
    system.completeRestore({ entityIdRemap: new Map([['1', 7]]) });
    assert.equal(system.state.physicsRuntime.nativeRestore.reason, 'legacy_native_schema');
  } finally { source.dispose(); target.dispose(); }
});

test('a still-pending site body at final boundary produces explicit scalar fallback', async () => {
  const entities = [actor(1)]; const source = await ownerFor(entities), target = await ownerFor([]);
  const system = adapter(target, clone(entities));
  try {
    system.deserialize(clone(source.exportWorldSnapshot()), { deferNative: true });
    system.completeRestore({ entityIdRemap: new Map([['1', 1]]), pendingBodyRefs: ['ceres-ref:site:pending'] });
    assert.deepEqual(system.state.physicsRuntime.nativeRestore,
      { mode: 'scalar', exact: false, reason: 'unresolved_semantic_bodies' });
    assert.equal(target.world.bodies.len(), 1);
  } finally { source.dispose(); target.dispose(); }
});

test('actual native collider and mass drift cannot be certified by unchanged authored metadata', async () => {
  const entities = [actor(1)]; const source = await ownerFor(entities), target = await ownerFor([]);
  try {
    const rec = source.records.get(1);
    rec.collider.setShape(new source.RAPIER.Ball(9));
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), clone(entities)), false,
      'a self-consistent native fingerprint is insufficient when the authored collider says radius 3');
    rec.collider.setShape(new source.RAPIER.Ball(3));
    rec.body.setAdditionalMassProperties(90, { x: 0, y: 0, z: 0 }, { x: 1, y: 180, z: 1 },
      { x: 0, y: 0, z: 0, w: 1 }, true);
    rec.body.recomputeMassPropertiesFromColliders();
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), clone(entities)), false,
      'the actual native mass must match the authored mass and captured response multiplier');
  } finally { source.dispose(); target.dispose(); }
});

test('a removed or changed semantic attachment rejects the complete native owner', async () => {
  const entities = [actor(1), actor(2, 40)], source = await ownerFor(entities), target = await ownerFor([actor(99, 200)]);
  try {
    rope(source, 'rope_a', 2); const payload = clone(source.exportWorldSnapshot());
    const before = target.world;
    assert.equal(target.adoptWorldSnapshot(payload, clone(entities), { attachments: {} }), false);
    const semantic = { ...payload.attachments.rope_a, id: 'rope_a', state: 'active', restLength: 60 };
    assert.equal(target.adoptWorldSnapshot(payload, clone(entities), { attachments: { rope_a: semantic } }), false);
    assert.equal(target.world, before); assert.equal(target.world.impulseJoints.len(), 0);
  } finally { source.dispose(); target.dispose(); }
});

test('regenerated fixed scenery matches identity, contract and pose instead of a recycled numeric ID', async () => {
  const ship = actor(1), station = actor(2, 100);
  station.isPlayer = false; station.type = 'station'; station.physicsBody.dynamic = false;
  station.data.stationId = 'station_test';
  const source = await ownerFor([ship, station]), target = await ownerFor([]);
  try {
    const current = [clone(ship), { ...clone(station), id: 3 }];
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), current,
      { entityIdRemap: new Map([['1', 1]]) }), true);
    assert.equal(target.records.has(2), false); assert.equal(target.records.get(3).body.isFixed(), true);
  } finally { source.dispose(); target.dispose(); }
});

test('cancelled save restoration releases its physics barrier without adopting the interrupted snapshot', async () => {
  const entities = [actor(1)], source = await ownerFor(entities), target = await ownerFor([actor(88, 200)]);
  const system = adapter(target, clone(entities));
  try {
    system.deserialize(clone(source.exportWorldSnapshot()), { deferNative: true });
    system.cancelRestore();
    assert.equal(system._nativeRestoreDeferred, false);
    assert.equal(system._pendingSg02Snapshot, null);
    system._finishNativeRestore();
    assert.equal(system.state.physicsRuntime.nativeRestore.exact, false);
    assert.equal(target.world.bodies.len(), 1);
    assert.equal(target.records.has(88), false);
  } finally { source.dispose(); target.dispose(); }
});

test('publication rejects a read-only incoming sleeping mirror before any owner or entity mutation', async () => {
  const entities = [actor(1), actor(2, 50)], source = await ownerFor(entities), target = await ownerFor([actor(88, 200)]);
  try {
    const incoming = clone(entities); incoming[0].physicsSleeping = true;
    Object.defineProperty(incoming[1], 'physicsSleeping', { value: true, writable: false, configurable: false });
    const world = target.world, records = target.records, colliders = target._colliderOwners;
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), incoming), false);
    assert.equal(target.world, world); assert.equal(target.records, records); assert.equal(target._colliderOwners, colliders);
    assert.equal(incoming[0].physicsSleeping, true); assert.equal(incoming[1].physicsSleeping, true);
    assert.equal(target.records.get(88).body.isValid(), true);
  } finally { source.dispose(); target.dispose(); }
});

test('cleanup failure after publication never frees or rejects the newly installed native owner', async () => {
  const entities = [actor(1)], source = await ownerFor(entities), target = await ownerFor([actor(88, 200)]);
  try {
    const previous = target.world, free = previous.free.bind(previous);
    previous.free = () => { free(); throw new Error('injected cleanup notification failure'); };
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), clone(entities)), true);
    assert.notEqual(target.world, previous); assert.equal(target.records.get(1).body.isValid(), true);
    assert.equal(target.diagnostics().nativeCleanupFailed, true);
    target.step(DT); assert.equal(target.world.bodies.len(), 1);
  } finally { source.dispose(); target.dispose(); }
});

test('a valid snapshot under different fixed-step or integration settings falls back without native adoption', async () => {
  const entities = [actor(1)], source = await ownerFor(entities);
  const target = await ownerFor([], { fixedDt: 1 / 30 });
  const sameStep = await ownerFor([]);
  try {
    const payload = clone(source.exportWorldSnapshot());
    assert.equal(payload.runtime.engineVersion, source.RAPIER.version());
    assert.equal(target.adoptWorldSnapshot(payload, clone(entities)), false);
    target.rebuildWorldFromEntities(clone(entities));
    assert.equal(target.world.bodies.len(), 1);
    sameStep.world.integrationParameters.numSolverIterations = 4;
    assert.equal(sameStep.adoptWorldSnapshot(payload, clone(entities)), false);
  } finally { source.dispose(); target.dispose(); sameStep.dispose(); }
});


test('unrepresented retired projectile pool requires non-exact reconstruction before subsequent reuse', async () => {
  const ship = actor(1), projectile = actor(2, 500);
  projectile.type = 'projectile'; projectile.data = {}; projectile.physicsBody.material = 'projectile';
  const source = await ownerFor([ship, projectile]), target = await ownerFor([]);
  try {
    projectile.alive = false; source.syncFromEntities([ship]);
    assert.equal([...source._ghostProjectilePool.values()].flat().length, 1);
    const current = clone(ship);
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), [current]), false);
    target.rebuildWorldFromEntities([current]);
    const incoming = clone(projectile); incoming.alive = true; incoming.id = 3;
    target.syncFromEntities([current, incoming]); target.step(DT);
    assert.equal(target.world.bodies.len(), 2);
    assert.equal(target.records.get(3).body.isValid(), true);
    assert.equal([...target._ghostProjectilePool.values()].flat().length, 0);
  } finally { source.dispose(); target.dispose(); }
});

test('native body and attachment mutation order survives nonnumeric insertion history', async () => {
  const entities = [actor(3, 100), actor(1), actor(2, 40)];
  const source = await ownerFor(entities), target = await ownerFor([]);
  try {
    rope(source, '2', 2); rope(source, '1', 5);
    const payload = clone(source.exportWorldSnapshot());
    assert.equal(target.adoptWorldSnapshot(payload, clone(entities), {
      resolveAttachmentContract: id => payload.attachments[id],
    }), true);
    assert.deepEqual([...target.records.keys()], [3, 1, 2]);
    assert.deepEqual([...target.dynamicRecords].map(rec => rec.entity.id), [3, 1, 2]);
    assert.deepEqual([...target.attachments.keys()], ['2', '1']);
  } finally { source.dispose(); target.dispose(); }
});

test('the actual save owner retains a compatible compound-hull native world and reports deliberate reset fallback', async () => {
  const sim = createSimulation({ seed: 47, systems: [physics, save] });
  sim.state.mode = 'flight';
  const spec = actor(1); spec.physicsBody.shape = 'capsule';
  const player = sim.spawn({ ...spec, hull: 100, hullMax: 100 });
  sim.state.playerId = player.id;
  const system = sim.registry.get('physics'), saver = sim.registry.get('save');
  try {
    assert.equal(await system.prepareBackend(sim.state), true);
    const payload = saver.serialize('native-compound');
    assert.equal(saver.loadEnvelope(payload, 'native-compound'), true);
    assert.deepEqual(sim.state.physicsRuntime.nativeRestore, { mode: 'native', exact: true, reason: null });
    assert.equal(system._sg02.records.get(sim.state.playerId).colliders.length > 1, true);
    assert.equal(await system.prepareBackend(sim.state, { reset: true }), true);
    assert.equal(sim.state.physicsRuntime.nativeRestore.exact, false);
  } finally { system._sg02?.dispose(); }
});


test('native response-mass and sleeping-policy mirrors continue without an extra wake or stale scale', async () => {
  const entities = [actor(1), actor(2, 80)];
  entities[1].activity = { simTier: 'S2_ABSTRACT' }; entities[1].physicsSleeping = true;
  const source = await ownerFor(entities), target = await ownerFor([]);
  try {
    writePhysicsBodyResponse(entities[0], { massScale: 2, inertiaScale: 3 });
    source.step(DT);
    const current = clone(entities);
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), current), true);
    assert.equal(target.records.get(1).effectiveMass, 48);
    assert.equal(target.records.get(1).effectiveInertiaY, 144);
    assert.equal(target.records.get(2).body.isSleeping(), true);
    for (let tick = 0; tick < 3; tick++) { source.step(DT); target.step(DT); }
    assert.equal(target.records.get(1).body.mass(), source.records.get(1).body.mass());
    assert.equal(target.records.get(2).body.isSleeping(), source.records.get(2).body.isSleeping());
    assert.equal(target.records.get(2)._createdCanSleep, source.records.get(2)._createdCanSleep);
    assert.deepEqual(current.map(e => [e.pos, e.vel, e.rot]), entities.map(e => [e.pos, e.vel, e.rot]));
  } finally { source.dispose(); target.dispose(); }
});


test('a reused raw numeric ID cannot adopt a known previous life, while an explicit save remap can', async () => {
  const original = actor(1); original.occupantGeneration = 17;
  const source = await ownerFor([original]), target = await ownerFor([]);
  try {
    const payload = clone(source.exportWorldSnapshot());
    const current = { ...clone(original), occupantGeneration: 18 };
    assert.equal(payload.bodies['1'].sourceLife, 17);
    assert.equal(target.adoptWorldSnapshot(payload, [current]), false);
    assert.equal(target.records.size, 0);
    assert.equal(target.adoptWorldSnapshot(payload, [current], { entityIdRemap: new Map([['1', 1]]) }), true);
    assert.equal(target.records.get(1).entity.occupantGeneration, 18);
  } finally { source.dispose(); target.dispose(); }
});


test('malformed remaps, aliased world records and ambiguous fixed identities reject atomically', async () => {
  const entities = [actor(1), actor(2, 60)];
  entities.forEach(entity => { entity.data.worldRecordId = 'shared_saved_record'; });
  const source = await ownerFor(entities), target = await ownerFor([actor(77, 200)]);
  try {
    const payload = clone(source.exportWorldSnapshot()), world = target.world, records = target.records;
    for (const entityIdRemap of [{}, new Map([[1, 1]]), new Map([['1', null]]),
      new Map([['1', 1], ['2', 1]]), new Map([['1', 1]]), new Map([['1', 999], ['2', 2]])]) {
      assert.equal(target.adoptWorldSnapshot(payload, clone(entities), { entityIdRemap }), false);
      assert.equal(target.world, world); assert.equal(target.records, records);
    }
    const station = actor(3, 100); station.type = 'station'; station.physicsBody.dynamic = false;
    station.data = { worldSiteId: 'generic_site', worldSiteComponentId: 'hull', persistenceOwner: 'world' };
    source.syncFromEntities([station]);
    const fixedPayload = clone(source.exportWorldSnapshot());
    const twins = [clone(station), { ...clone(station), id: 4 }];
    assert.equal(target.adoptWorldSnapshot(fixedPayload, twins, { entityIdRemap: new Map() }), false);
    const foreign = { ...clone(station), id: 5, data: { ...station.data, worldSiteId: 'foreign_site' } };
    assert.equal(target.adoptWorldSnapshot(fixedPayload, [foreign], { entityIdRemap: new Map() }), false);
    const restored = { ...clone(station), id: 5 };
    assert.equal(target.adoptWorldSnapshot(fixedPayload, [restored], { entityIdRemap: new Map() }), true);
  } finally { source.dispose(); target.dispose(); }
});

test('old schemas, missing and extra bodies, duplicate orders and stale handles never partially adopt', async () => {
  const entities = [actor(1), actor(2, 60)], source = await ownerFor(entities), target = await ownerFor([actor(99, 200)]);
  try {
    const payload = clone(source.exportWorldSnapshot()), before = target.world, records = target.records;
    const variants = [];
    for (const schema of [1, 2]) variants.push({ ...clone(payload), schema });
    const missing = clone(payload); delete missing.bodies['2']; missing.bodyOrder.pop(); variants.push(missing);
    const extra = clone(payload); extra.bodies['3'] = clone(extra.bodies['2']); extra.bodyOrder.push('3'); variants.push(extra);
    const duplicate = clone(payload); duplicate.dynamicBodyOrder = ['1', '1']; variants.push(duplicate);
    for (const handle of ['999', '', null, '00']) {
      const stale = clone(payload); stale.bodies['2'].handle = handle; variants.push(stale);
    }
    const alias = clone(payload); alias.bodies['2'].handle = alias.bodies['1'].handle; variants.push(alias);
    for (const bad of variants) {
      assert.equal(target.adoptWorldSnapshot(bad, clone(entities)), false);
      assert.equal(target.world, before); assert.equal(target.records, records);
      assert.equal(target.records.get(99).body.isValid(), true);
    }
    assert.equal(target.adoptWorldSnapshot(payload, [...clone(entities), actor(3, 100)]), false);
  } finally { source.dispose(); target.dispose(); }
});

test('native contact settings and actual installed collider event policy cannot be forged by metadata', async () => {
  const entities = [actor(1)], source = await ownerFor(entities), target = await ownerFor([]);
  try {
    const payload = clone(source.exportWorldSnapshot());
    const badRevision = clone(payload); badRevision.nativeGeometryRevision = 'old-shallow';
    assert.equal(target.adoptWorldSnapshot(badRevision, clone(entities)), false);
    const badParameters = clone(payload); badParameters.nativeGeometryParameters.normalizedPredictionDistance += 1;
    assert.equal(target.adoptWorldSnapshot(badParameters, clone(entities)), false);
    source.world.gravity = { x: 0, y: -1, z: 0 };
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), clone(entities)), false);
    source.world.gravity = { x: 0, y: 0, z: 0 };
    source.records.get(1).collider.setContactForceEventThreshold(999);
    assert.equal(target.adoptWorldSnapshot(clone(source.exportWorldSnapshot()), clone(entities)), false);
  } finally { source.dispose(); target.dispose(); }
});

test('repeated native restore preserves contact episode budget and exact subsequent kinematics', async () => {
  const entities = [actor(1), actor(2, 60)], source = await ownerFor(entities), target = await ownerFor([]);
  try {
    source.records.get(1)._playerContactLastTick = 0;
    source.records.get(1)._playerContactCumulativeDeltaV = 2.5;
    source.records.get(1).body.setLinvel({ x: 5, y: 0, z: 2 }, true);
    source.step(DT);
    const payload = clone(source.exportWorldSnapshot()), incoming = clone(entities);
    for (let i = 0; i < 4; i++) {
      assert.equal(target.adoptWorldSnapshot(payload, incoming), true);
      assert.equal(target.records.get(1)._playerContactLastTick, source.records.get(1)._playerContactLastTick);
      assert.equal(target.records.get(1)._playerContactCumulativeDeltaV, 2.5);
      assert.deepEqual(target.quantizedSnapshot(), source.quantizedSnapshot());
    }
    for (let i = 0; i < 30; i++) { source.step(DT); target.step(DT); }
    assert.deepEqual(incoming.map(e => [e.pos, e.vel, e.rot]), entities.map(e => [e.pos, e.vel, e.rot]));
  } finally { source.dispose(); target.dispose(); }
});

test('scalar rebuild publication failure rolls back staged coincident positions and all live ownership', async () => {
  const target = await ownerFor([actor(99, 200)]);
  try {
    const entities = [actor(1), actor(2)];
    entities.forEach(entity => { entity.prevPos = { ...entity.pos }; });
    Object.defineProperty(entities[1], 'physicsSleeping', { value: true, writable: false, configurable: false });
    const positions = entities.map(entity => clone([entity.pos, entity.prevPos]));
    const world = target.world, records = target.records;
    assert.throws(() => target.rebuildWorldFromEntities(entities), /entity_mirror_not_writable/);
    assert.deepEqual(entities.map(entity => [entity.pos, entity.prevPos]), positions);
    assert.equal(target.world, world); assert.equal(target.records, records);
    assert.equal(target.records.get(99).body.isValid(), true);
  } finally { target.dispose(); }
});
