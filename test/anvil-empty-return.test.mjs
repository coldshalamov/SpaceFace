import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { traffic } from '../src/systems/traffic.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { world } from '../src/systems/world.js';
import { ANVIL_WORK, anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };
function fixture(t, distance, relativeSpeed = 0, native = false) {
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424213, systems: [worldRecords, trafficWork, fields, planetRuntime, ...(native ? [flightV3, physics] : [])] });
  t.after(() => sim.dispose());
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  sim.step();
  const owner = sim.registry.get('traffic');
  const collector = state.entities.get(state.planet.witnessId);
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  assert.ok(collector && receiver);
  collector.data.itinerary.phase = 'return';
  collector.pos = { x: receiver.pos.x - distance, z: receiver.pos.z };
  collector.vel = { x: relativeSpeed + 3, z: -2 };
  receiver.vel = { x: 3, z: -2 };
  assert.equal(collector.data.cargoManifest.totalQty, 0);
  return { sim, state, owner, collector, receiver };
}

for (const [label, distance, speed] of [
  ['936 WU before the receiver', 936, 0],
  ['outside the existing transfer range', ANVIL_WORK.transferRange + 0.01, 0],
  ['inside the berth but moving too fast', 40, ANVIL_WORK.transferSpeed + 0.01],
]) test(`empty return cannot finish ${label}`, t => {
  const f = fixture(t, distance, speed);
  const before = { pos: { ...f.collector.pos }, vel: { ...f.collector.vel }, sequence: f.collector.data.itinerary.sequence };
  f.owner._stepAnvilWork(SIM_DT, f.state);
  assert.equal(f.collector.data.itinerary.phase, 'return');
  assert.equal(f.collector.data.itinerary.sequence, before.sequence);
  assert.deepEqual(f.collector.pos, before.pos, 'controller must not teleport the worker');
  assert.deepEqual(f.collector.vel, before.vel, 'controller must not overwrite native velocity');
  assert.equal(f.collector.data.cargoManifest.totalQty, 0);
  assert.equal(f.receiver.data.cargoManifest.totalQty, 0);
  assert.ok(f.collector.data.intent, 'ordinary flight steering still runs');
});

test('empty return finishes at the existing range and relative-speed limits without a transfer event', t => {
  const f = fixture(t, ANVIL_WORK.transferRange, ANVIL_WORK.transferSpeed);
  let transfers = 0;
  f.sim.bus.on('traffic:anvilTransfer', () => transfers++);
  f.owner._stepAnvilWork(SIM_DT, f.state);
  assert.equal(f.collector.data.itinerary.phase, 'berthed');
  assert.equal(f.state.world.records.byId[f.collector.data.worldRecordId].itinerary.phase, 'berthed');
  assert.equal(transfers, 0);
  assert.equal(f.collector.data.cargoManifest.totalQty, 0);
  assert.equal(f.receiver.data.cargoManifest.totalQty, 0);
});

test('a foreign job or missing receiver cannot complete an empty return', t => {
  const f = fixture(t, 40);
  f.collector.data.jobId = 'foreign-job';
  f.owner._stepAnvilWork(SIM_DT, f.state);
  assert.equal(f.collector.data.itinerary.phase, 'return');
  f.collector.data.jobId = null; f.receiver.alive = false;
  f.owner._stepAnvilWork(SIM_DT, f.state);
  assert.equal(f.collector.data.itinerary.phase, 'return');
  assert.equal(f.collector.data.intent.brake, true);
});


test('an empty collector reaches its berth through ordinary native flight', async t => {
  const f = fixture(t, 936, 0, true);
  f.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await f.sim.registry.get('physics').prepareBackend(f.state), true);
  const observer = f.sim.spawn({ type: 'ship', isPlayer: true, team: 0, hull: 100,
    pos: { x: f.collector.pos.x, z: f.collector.pos.z + 100 }, collides: false, physicsBody: false });
  f.state.playerId = observer.id;
  let ticks = 0;
  while (ticks < 60 * 120 && f.collector.data.itinerary.phase === 'return') {
    observer.pos.x = f.collector.pos.x; observer.pos.z = f.collector.pos.z + 100;
    f.sim.step(SIM_DT); ticks++;
  }
  const distance = Math.hypot(f.collector.pos.x - f.receiver.pos.x, f.collector.pos.z - f.receiver.pos.z);
  const relativeSpeed = Math.hypot(f.collector.vel.x - f.receiver.vel.x, f.collector.vel.z - f.receiver.vel.z);
  assert.equal(f.collector.data.itinerary.phase, 'berthed');
  assert.ok(ticks > 1, 'return cannot complete before flying to the receiver');
  assert.ok(distance <= ANVIL_WORK.transferRange, 'native post-step position remains in the berth');
  assert.ok(relativeSpeed <= ANVIL_WORK.transferSpeed, 'ordinary flight settles before berthing');
  assert.equal(f.collector.data.cargoManifest.totalQty, 0);
  assert.equal(f.receiver.data.cargoManifest.totalQty, 0);
  console.log({ emptyReturnTicks: ticks, distance, relativeSpeed });
});
