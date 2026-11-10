import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { STORMSHIFT_RECEIVER_COLLISION as COLLISION } from '../src/data/stormshiftReceiverCollision.js';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { captureEntityRecord, spawnSpecFromRecord, RECORD_KIND } from '../src/world/worldRecords.js';
import { anvilReceiverFixture, relocateAnvilObserver } from './fixtures/anvil-receiver-native.mjs';

const file = 'wholeships/ship_stormshift_receiver_v01.glb';
function boot() {
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, { ...traffic, update() {} }] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic'); owner.ensureAnvilWorker(sim.state, sim.spawn, { x: 14000, z: 6000 });
  const receiver = sim.state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(sim.state, 'receiver'));
  return { sim, owner, receiver };
}
function assertBody(entity) {
  assert.equal(entity.data.trafficRole, 'stormshift_receiver');
  assert.equal(entity.physicsBody.collisionProxyManifest.id, COLLISION.id);
  const visual = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(visual.file, file); assert.equal(visual.assetId, 'SF_STORMSHIFT_RECEIVER_V01');
}

test('only the original receiving worker adopts the authored cradle; ordinary and foreign haulers keep their bodies', () => {
  const t = boot();
  try {
    assertBody(t.receiver);
    const canonical = makeShipEntitySpec('ship_mule');
    for (const key of ['mass', 'radius', 'flightModel', 'propulsion']) assert.deepEqual(t.receiver[key], canonical[key], key);
    const foreign = t.sim.spawn(makeShipEntitySpec('ship_mule', { factionId: 'faction_mts', pos: { x: 20000, z: 9000 } }));
    Object.assign(foreign.data, { worldRecordId: 'foreign-receiver', trafficRole: 'hauler', itinerary: structuredClone(t.receiver.data.itinerary) });
    const before = structuredClone(foreign);
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.deepEqual(structuredClone(foreign), before, 'itinerary text cannot give a foreign body the original worker authority');
    assert.equal(wholeShipVisualForEntity(foreign, { requiredWholeShip: true }).file, 'wholeships/helios_span_mts.glb');
    foreign.data.trafficRole = 'stormshift_receiver'; foreign.data.itinerary.role = 'hauler';
    assert.equal(wholeShipVisualForEntity(foreign, { requiredWholeShip: true }).file, 'wholeships/helios_span_mts.glb', 'copied role alone cannot select the cradle');
  } finally { t.sim.dispose(); }
});

test('legacy original rebind preserves physical state and finite cargo, then native admission uses the same fixed27 solids once', async () => {
  const t = boot(); const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    const receiver = t.receiver;
    receiver.data.trafficRole = 'hauler'; receiver.physicsBody = { ...receiver.physicsBody, collisionProxyManifest: undefined };
    receiver.vel = { x: 3, z: -2 }; receiver.angVel = .02;
    const before = structuredClone({ pos: receiver.pos, vel: receiver.vel, rot: receiver.rot, angVel: receiver.angVel,
      mass: receiver.mass, radius: receiver.radius, cargo: receiver.data.cargoManifest, itinerary: receiver.data.itinerary });
    const revision = receiver.physicsBody.revision;
    native.syncFromEntities([receiver]);
    const old = native.records.get(receiver.id);
    const oldNativePos = old.body.translation(), oldNativeVel = old.body.linvel();
    t.owner.ensureAnvilWorker(t.sim.state, t.sim.spawn, receiver.data.itinerary.center);
    assertBody(receiver); assert.equal(receiver.physicsBody.revision, revision + 1);
    assert.deepEqual(structuredClone({ pos: receiver.pos, vel: receiver.vel, rot: receiver.rot, angVel: receiver.angVel,
      mass: receiver.mass, radius: receiver.radius, cargo: receiver.data.cargoManifest, itinerary: receiver.data.itinerary }), before);
    native.syncFromEntities([receiver]);
    const rec = native.records.get(receiver.id);
    assert.equal(rec.colliders.length, 27); assert.ok(Math.abs(rec.body.mass() - receiver.mass) < .02);
    assert.deepEqual(rec.body.translation(), oldNativePos); assert.deepEqual(rec.body.linvel(), oldNativeVel);
    const handle = rec.body.handle, nativePos = rec.body.translation(), nativeVel = rec.body.linvel();
    t.owner.ensureAnvilWorker(t.sim.state, t.sim.spawn, receiver.data.itinerary.center);
    native.syncFromEntities([receiver]);
    assert.equal(receiver.physicsBody.revision, revision + 1);
    assert.equal(native.records.get(receiver.id).body.handle, handle);
    assert.deepEqual(rec.body.translation(), nativePos); assert.deepEqual(rec.body.linvel(), nativeVel);
    const record = captureEntityRecord(receiver, { sectorId: PLANET_SITE.sectorId, kind: RECORD_KIND.CONVOY, tick: t.sim.state.tick });
    const spec = spawnSpecFromRecord(record);
    assert.equal(spec.data.trafficRole, 'stormshift_receiver');
    assert.equal(wholeShipVisualForEntity(spec, { requiredWholeShip: true }).file, file);
    for (const key of ['pos', 'vel']) for (const axis of ['x', 'z'])
      assert.equal(spec[key][axis], receiver[key][axis], `${key}.${axis}`);
    for (const key of ['rot', 'angVel', 'hull']) assert.equal(spec[key], receiver[key], key);
    assert.deepEqual(spec.data.cargoManifest, receiver.data.cargoManifest);
  } finally { native.dispose(); t.sim.dispose(); }
});

test('actual production Continue and ordinary residency return preserve the same original cradle and cargo', async () => {
  const f = await anvilReceiverFixture();
  try {
    let receiver = f.actor('receiver'); assert.ok(receiver); assertBody(receiver);
    const recordId = receiver.data.worldRecordId, cargo = structuredClone(receiver.data.cargoManifest);
    const snapshot = JSON.parse(JSON.stringify(f.runtime.getSystem('save').serialize('receiver-live-cradle')));
    assert.equal(f.runtime.getSystem('save').loadEnvelope(snapshot), true); f.state.mode = 'flight';
    assert.equal(await f.physics.prepareBackend(f.state), true); f.step();
    receiver = f.actor('receiver'); assert.ok(receiver); assertBody(receiver);
    assert.equal(receiver.data.worldRecordId, recordId); assert.deepEqual(receiver.data.cargoManifest, cargo);
    const watched = structuredClone(receiver);
    f.world.relocatePlayerInSector({ x: receiver.pos.x + 18000, z: receiver.pos.z + 18000, heading: 0 }, { reason: 'receiver-cradle-residency' });
    // Match the existing production route's distant-residency observation, past
    // the normal two-second activity grace; never force the actor into a shelf.
    f.step(600); assert.equal(f.actor('receiver'), undefined);
    const retained = f.state.world.records.byId[recordId];
    assert.equal(retained.trafficRole, 'stormshift_receiver'); assert.deepEqual(retained.cargoManifest, cargo);
    relocateAnvilObserver(f, retained || watched, 'receiver-cradle-residency-return');
    for (let i = 0; i < 120 && !f.actor('receiver'); i++) f.step();
    receiver = f.actor('receiver'); assert.ok(receiver); assertBody(receiver);
    assert.equal(receiver.data.worldRecordId, recordId); assert.deepEqual(receiver.data.cargoManifest, cargo);
    // World promotion precedes near-physics admission. Observe that same public
    // boundary instead of assuming an entity-list appearance already owns Rapier.
    for (let i = 0; i < 120 && !f.physics._sg02.records.has(receiver.id); i++) f.step();
    assert.ok(f.physics._sg02.records.has(receiver.id), 'promoted original receives its native body');
    assert.equal(f.physics._sg02.records.get(receiver.id).colliders.length, 27);
  } finally { f.close(); }
});
