import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { SIM_DT } from '../src/core/sim.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { insertFarActor, findFarActorForTargetIdentity } from '../src/world/farActorTable.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
async function boot() {
  const host = createSimHost();
  await host.init({ profile: 'production', seed: 424213, scenarioContract: contract });
  const { state, registry, runtime } = host.host;
  state.mode = 'flight'; registry.get('world').enterSector(PLANET_SITE.sectorId);
  registry.get('planetRuntime').update(0, state);
  const frame = state.entities.get(state.planet.orchardFrameId);
  const collector = state.entities.get(state.planet.witnessId);
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  assert.ok(frame && collector && receiver);
  const player = runtime.spawn({ type: 'ship', isPlayer: true, team: 0,
    pos: { x: frame.pos.x + 200, z: frame.pos.z }, vel: { x: 0, z: 0 }, collides: false,
    hull: 100, hullMax: 100, physicsBody: false, data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
  state.playerId = player.id;
  assert.equal(await registry.get('physics').prepareBackend(state), true);
  return { host, state, registry, frame, collector, receiver, player };
}

test('stationary orchard visitor gets the original worker and a real finite first pod', async () => {
  const h = await boot();
  try {
    const { host, state, collector, receiver, registry } = h;
    const id = collector.id, identity = collector.data.worldRecordId;
    assert.equal(state.world.records.byId[identity].kind, 'convoy');
    let first = null;
    for (let i = 0; i < 60 * 55; i++) {
      host.host.stepper.step(SIM_DT, host.host.tickBoundary);
      if (state.sites.anvilOrchard.sourceRemaining < 48) { first = state.simTime; break; }
    }
    assert.ok(first > 0, 'physically flown harvesting filled a socket');
    assert.ok(first < 55, `first unit arrived after ${first}s in this configured scenario`);
    assert.strictEqual(state.entities.get(id), collector);
    assert.ok(registry.get('physics')._sg02.records.get(id));
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 47);
    assert.equal(state.sites.anvilOrchard.lots[0].units, 1);
    const pod = state.entityList.find(e => e.data?.worldRecordId === state.sites.anvilOrchard.lots[0].id);
    assert.ok(pod && registry.get('physics')._sg02.records.get(pod.id), 'the lot owns a native pod');
    assert.equal(state.world.records.byId[identity].kind, 'convoy');
    assert.strictEqual(state.entities.get(receiver.id), receiver);
  } finally { h.host.shutdown(); }
});

test('already shelved shift resumes the same finite record, and a destroyed record is not replaced', async () => {
  const h = await boot();
  try {
    const { host, state, registry, collector } = h, traffic = registry.get('traffic');
    const identity = collector.data.worldRecordId;
    collector.data.itinerary.phase = 'collect';
    assert.equal(traffic.acceptAnvilHarvest(collector, { siteId: PLANET_SITE.id, commodityId: PLANET_SITE.harvest.commodityShallow, qty: 3 }), 3);
    collector.data.itinerary.phase = 'return';
    registry.get('world').upsertWorldRecord(collector);
    const pose = { x: collector.pos.x, z: collector.pos.z };
    const helpers = host.host.sim.helpers;
    insertFarActor(state, collector, state.simTime, helpers);
    helpers.removeEntity(collector.id, { immediate: true, reason: 'virtualize' });
    const key = { kind: 'worldRecord', worldRecordId: identity };
    assert.ok(findFarActorForTargetIdentity(state, key));
    const restored = traffic.ensureAnvilWorker(state, helpers.spawnEntity, state.planet.center);
    assert.ok(restored && restored !== collector);
    assert.equal(restored.data.worldRecordId, identity);
    assert.equal(restored.data.cargoManifest.totalQty, 3);
    assert.deepEqual({ x: restored.pos.x, z: restored.pos.z }, pose);
    assert.equal(findFarActorForTargetIdentity(state, key), null);
    assert.equal(state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === identity).length, 1);
    traffic._stepAnvilWork(SIM_DT, state);
    assert.equal(state.planet.witnessId, restored.id);
    assert.equal(state.planet.witnessGeneration, restored.occupantGeneration);
    assert.equal(restored.data.transitCritical, true);
    restored.data.playerOwned = true;
    traffic._stepAnvilWork(SIM_DT, state);
    assert.notEqual(restored.data.transitCritical, true, 'captured ship loses the shift-owned pin');
    assert.equal(restored.data.cargoManifest.totalQty, 3);
    delete restored.data.playerOwned;
    restored.alive = false;
    registry.get('world').upsertWorldRecord(restored);
    assert.equal(traffic.ensureAnvilWorker(state, helpers.spawnEntity, state.planet.center), null);
  } finally { h.host.shutdown(); }
});
