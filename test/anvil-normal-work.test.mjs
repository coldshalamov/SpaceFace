import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { save } from '../src/save/saveSystem.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { world } from '../src/systems/world.js';
import { ANVIL_WORK, anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

// Real production work, flight, field, band and physics handlers; unrelated traffic generators
// are excluded. This is focused fixed-seed evidence, not full production-manifest acceptance.
const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };
function boot() {
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424213, systems: [worldRecords, trafficWork, fields, planetRuntime, flightV3, physics] });
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.step();
  const owner = sim.registry.get('traffic'), planet = sim.registry.get('planetRuntime');
  const collector = state.entities.get(state.planet.witnessId);
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  return { sim, state, owner, planet, collector, receiver };
}
function qty(e) { return e.data.cargoManifest.totalQty; }
function step(t, n = 1) { for (let i = 0; i < n; i++) t.sim.step(SIM_DT); }
function skim(t, speed = 70) {
  t.collector.pos.x = t.state.planet.center.x + 980; t.collector.pos.z = t.state.planet.center.z;
  t.collector.vel.x = 0; t.collector.vel.z = speed;
  t.collector.data.itinerary.phase = 'collect';
  t.planet._tickShips(SIM_DT, t.state, t.state.planet, PLANET_SITE);
}
function harvest(t, dt = 1) { t.planet._tickWorkerHarvest(dt, t.state, t.state.planet, PLANET_SITE); }

test('Anvil normal work: real flight/field/physics fly one finite load into a real receiver', async () => {
  const t = boot();
  assert.ok(t.collector && t.receiver);
  assert.equal(t.collector.physicsBody.collisionProxyManifest.id, 'stormshift-collector:fixed-cheeks:v1');
  assert.equal(t.receiver.physicsBody?.collisionProxyManifest, undefined);
  assert.equal(t.collector.data.defId, 'ship_mule', 'authored collector retains the canonical Mule gameplay def');
  assert.equal(await t.sim.registry.get('physics').prepareBackend(t.state), true);
  // Non-physical observation point keeps local activity awake without injecting participant
  // poses or introducing a moving static collider into the worker's flight test.
  const observer = t.sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: t.state.planet.center.x + 1400, z: t.state.planet.center.z + 700 }, collides: false, hull: 100, physicsBody: false });
  t.state.playerId = observer.id;
  const start = { ...t.collector.pos };
  const phases = new Set(); let minRadius = Infinity; let maxTravel = 0;
  for (let i = 0; i < 60 * 360 && qty(t.receiver) === 0; i++) {
    observer.pos.x = t.collector.pos.x + 100; observer.pos.z = t.collector.pos.z + 100;
    step(t); phases.add(t.collector.data.itinerary.phase);
    maxTravel = Math.max(maxTravel, Math.hypot(t.collector.pos.x - start.x, t.collector.pos.z - start.z));
    minRadius = Math.min(minRadius, Math.hypot(t.collector.pos.x - t.state.planet.center.x, t.collector.pos.z - t.state.planet.center.z));
  }
  console.log({ seconds: t.state.simTime, phases: [...phases], pos: t.collector.pos, vel: t.collector.vel, held: qty(t.collector), received: qty(t.receiver), minRadius });
  assert.ok(maxTravel > 500);
  assert.ok(qty(t.receiver) > 0, 'normal route delivers without pose injection or phase forcing');
  assert.ok(qty(t.receiver) <= ANVIL_WORK.capacity);
  assert.equal(qty(t.collector), 0);
  assert.ok(minRadius > PLANET_SITE.bands.danger, 'normal shallow route avoids danger');
  assert.ok(phases.has('collect') && phases.has('return'));
  t.sim.dispose();
});

test('Anvil harvest: stopped, absent thermal admission, closed, dead and superseded actors yield nothing', () => {
  for (const mode of ['stopped', 'untracked', 'closed', 'dead', 'superseded']) {
    const t = boot(); skim(t);
    if (mode === 'stopped') t.collector.vel.z = 0;
    if (mode === 'untracked') t.planet._scratchIds.length = 0;
    if (mode === 'closed') t.collector.data.itinerary.phase = 'return';
    if (mode === 'dead') t.collector.alive = false;
    if (mode === 'superseded') t.state.entities.set(t.collector.id, { ...t.collector, data: { ...t.collector.data } });
    harvest(t, 20); assert.equal(qty(t.collector), 0, mode);
  }
});

test('Anvil manifest capacity and once-only transfer conserve accepted units, including reentrant events', () => {
  const t = boot(); skim(t); harvest(t, 40);
  assert.equal(qty(t.collector), ANVIL_WORK.capacity);
  harvest(t, 40); assert.equal(qty(t.collector), ANVIL_WORK.capacity);
  t.collector.data.itinerary.phase = 'return';
  t.collector.pos = { x: t.receiver.pos.x - 60, z: t.receiver.pos.z }; t.collector.vel = { x: 0, z: 0 };
  t.receiver.vel = { x: 0, z: 0 };
  let calls = 0;
  t.sim.bus.on('traffic:anvilTransfer', () => { calls++; assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0); });
  assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), ANVIL_WORK.capacity);
  assert.equal(calls, 1); assert.equal(qty(t.collector), 0); assert.equal(qty(t.receiver), ANVIL_WORK.capacity);
  assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0);
  assert.equal(t.state.world.records.byId[t.receiver.data.worldRecordId].cargoManifest.totalQty, ANVIL_WORK.capacity);
});

test('Anvil interrupted return retains finite cargo and cannot transfer remotely or into a dead/full receiver', () => {
  const t = boot(); skim(t); harvest(t, 40); t.collector.data.itinerary.phase = 'return';
  assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0);
  t.receiver.alive = false; t.owner._stepAnvilWork(SIM_DT, t.state);
  assert.equal(qty(t.collector), 12); assert.equal(t.collector.data.intent.brake, true);
  assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0);
  t.receiver.alive = true;
  t.owner._setTrafficManifest(t.receiver, null, t.owner._buildMinerManifest(t.receiver, 0, PLANET_SITE.harvest.commodityShallow, 48));
  t.collector.pos = { ...t.receiver.pos }; t.collector.vel = { x: 0, z: 0 }; t.receiver.vel = { x: 0, z: 0 };
  assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0); assert.equal(qty(t.collector), 12);
});

test('Anvil registration reuses one witness and never resurrects a retained destroyed worker', () => {
  const t = boot();
  assert.equal(t.owner.ensureAnvilWorker(t.state, t.sim.spawn, t.state.planet.center), t.collector);
  assert.equal(t.state.entityList.filter(e => e.data?.anvilSlingWitness).length, 1);
  t.collector.alive = false;
  t.sim.registry.get('world').upsertWorldRecord(t.collector);
  assert.equal(t.owner.ensureAnvilWorker(t.state, t.sim.spawn, t.state.planet.center), null);
});


test('real save/load preserves a loaded return through world records and never transfers it twice', () => {
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424213, systems: [world, npcJobsRuntime, traffic, fields, planetRuntime, save] });
  try {
    const state = sim.state; state.mode = 'flight';
    const player = sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100,
      pos: { x: 0, z: 0 }, radius: 6, flags: { persistent: true } });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(PLANET_SITE.sectorId);
    sim.step();
    const owner = sim.registry.get('traffic');
    const collector = state.entities.get(state.planet.witnessId);
    const recordId = collector.data.worldRecordId;
    collector.data.itinerary.phase = 'collect';
    assert.equal(owner.acceptAnvilHarvest(collector, { siteId: PLANET_SITE.id,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty: 12 }), 12);
    collector.data.itinerary.phase = 'return';
    const saver = sim.registry.get('save');
    const envelope = saver.serialize('anvil-loaded-return');
    assert.equal(saver.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'anvil-loaded-return'), true);
    state.mode = 'flight'; sim.step();
    const restored = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === recordId);
    const receiver = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
    assert.ok(restored && receiver); assert.equal(qty(restored), 12);
    assert.equal(restored.physicsBody.collisionProxyManifest.id, 'stormshift-collector:fixed-cheeks:v1');
    const revision = restored.physicsBody.revision;
    owner._stepAnvilWork(SIM_DT, state);
    assert.equal(restored.physicsBody.revision, revision, 'repeat binding cannot churn physics geometry');
    assert.equal(restored.data.itinerary.phase, 'return');
    assert.equal(state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === recordId).length, 1);
    restored.pos.x = receiver.pos.x - 60; restored.pos.z = receiver.pos.z;
    restored.vel.x = 0; restored.vel.z = 0; receiver.vel.x = 0; receiver.vel.z = 0;
    assert.equal(owner._transferAnvilLoad(restored, receiver), 12);
    const delivered = saver.serialize('anvil-delivered');
    assert.equal(saver.loadEnvelope(JSON.parse(JSON.stringify(delivered)), 'anvil-delivered'), true);
    state.mode = 'flight'; sim.step();
    const after = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === recordId);
    const stored = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
    assert.equal(qty(after), 0); assert.equal(qty(stored), 12);
    assert.equal(owner._transferAnvilLoad(after, stored), 0);
  } finally { sim.dispose(); }
});


test('Anvil thermal cap never gives a crowded-out collector free production', () => {
  const t = boot(); skim(t);
  const center = t.state.planet.center;
  const crowd = Array.from({ length: 7 }, (_, i) => t.sim.spawn({ type: 'ship', alive: true,
    pos: { x: center.x + 990, z: center.z + i }, vel: { x: 0, z: 20 }, hull: 100, mass: 20 }));
  t.planet.helpers = { ...t.planet.helpers, queryRadius(_pos, _radius, out) { out.push(...crowd, t.collector); } };
  t.planet._tickShips(SIM_DT, t.state, t.state.planet, PLANET_SITE);
  harvest(t, 20);
  assert.equal(Object.keys(t.state.planet.ships).length, 7);
  assert.equal(t.state.planet.ships[t.collector.id], undefined);
  assert.equal(qty(t.collector), 0);
  assert.equal(t.collector.data.stormshiftCollectorOn, false);
});

test('Anvil handoff rejects excessive relative speed, malformed inventory and a claimed movement owner', () => {
  for (const cause of ['speed', 'manifest', 'job', 'duplicate']) {
    const t = boot(); skim(t); harvest(t, 40);
    t.collector.data.itinerary.phase = 'return';
    t.collector.pos = { ...t.receiver.pos }; t.collector.vel = { x: 0, z: 0 }; t.receiver.vel = { x: 0, z: 0 };
    if (cause === 'speed') t.collector.vel.x = 30;
    if (cause === 'manifest') t.collector.data.cargoManifest.lines[0].qty = 1;
    if (cause === 'job') t.collector.data.jobId = 'job:foreign';
    if (cause === 'duplicate') t.sim.spawn({ type: 'ship', hull: 100, data: { ...t.receiver.data } });
    assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0, cause);
    assert.equal(qty(t.receiver), 0, cause);
  }
});
