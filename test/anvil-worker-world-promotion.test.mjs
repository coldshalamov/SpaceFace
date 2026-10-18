import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { farActorTableRadius } from '../src/world/farActorTable.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { ZONE_TETHYS_ANVIL } from '../src/data/authoredPlaces.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { STORMSHIFT_COLLECTOR_COLLISION } from '../src/data/stormshiftCollectorCollision.js';

// Compact seeded boundary regression, not a replay of a saved harvesting route.
// Fixture setup supplies a loaded return and a separated tender. After native preparation,
// only raw keys and ordinary sim ticks run: world owns shelving/promotion, traffic owns
// work, and spawnBudget owns admission. No direct far-table mutation or promotion call.
// Planet harvesting, save/UI Continue, rendering and the production manifest are excluded.
const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };

test('ordinary world ticks promote both Anvil workers with native hardware and finite custody', async () => {
  const sim = createSimulation({ seed: 424214,
    systems: [spawnBudget, world, trafficWork, input, flightV3, physics] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    const center = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);
    const player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', {
      pos: { x: center.x + 3150, z: center.z - 2000 }, rot: Math.PI / 2 }), isPlayer: true });
    state.playerId = player.id;
    const worldOwner = sim.registry.get('world'), work = sim.registry.get('traffic');
    worldOwner.enterSector(PLANET_SITE.sectorId, { continuous: true, noTeleport: true, placePlayer: false });
    const collector = work.ensureAnvilWorker(state, sim.spawn, center);
    const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
    assert.ok(collector && receiver);

    // Explicit initial fixture state, constructed with existing owners rather than a generated save.
    // Keep the tender distant enough that this boundary check cannot also settle the loaded return.
    receiver.pos.x = center.x + 3600;
    collector.data.itinerary.phase = 'collect';
    assert.equal(work.acceptAnvilHarvest(collector, { siteId: PLANET_SITE.id,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty: 4 }), 4);
    collector.data.itinerary.phase = 'return';
    const budget = sim.helpers.spawnBudget, canonical = makeShipEntitySpec('ship_mule');
    const expected = new Map();
    for (const [role, entity] of [['collector', collector], ['receiver', receiver]]) {
      worldOwner.upsertWorldRecord(entity);
      const recordId = entity.data.worldRecordId, requester = `world:record:${recordId}`;
      assert.equal(budget.request(1, requester), 1);
      assert.equal(budget.bindEntity(entity.id, requester), true);
      expected.set(role, { id: entity.id, recordId, requester,
        manifest: structuredClone(entity.data.cargoManifest), stable: 0, generation: null });
    }
    const facade = sim.registry.get('physics');
    assert.equal(await facade.prepareBackend(state), true);
    const bodies = recordId => state.entityList.filter(e => e.alive !== false
      && state.entities.get(e.id) === e && e.data?.worldRecordId === recordId);
    const rows = recordId => (state.world.farActors?.rows || [])
      .filter(e => e.alive !== false && e.data?.worldRecordId === recordId);
    const promoted = new Map(), shelved = new Set();
    sim.bus.on('world:farActorShelved', event => {
      if ([...expected.values()].some(e => e.id === event.id)) shelved.add(event.id);
    });
    sim.bus.on('world:farActorRestored', event => {
      const role = event.entity?.data?.itinerary?.role, e = expected.get(role);
      if (!e || event.entity.data.worldRecordId !== e.recordId) return;
      assert.equal(promoted.has(role), false, 'no second incarnation during the short approach');
      assert.ok(shelved.has(e.id), 'the same worker was shelved by the ordinary world owner');
      assert.deepEqual(event.entity.data.cargoManifest, e.manifest);
      promoted.set(role, { tick: state.tick, id: event.id });
    });

    // Native preparation is complete; participant poses, manifests and phases are read-only below.
    const start = { ...player.pos };
    for (let n = 0; n < 120 && shelved.size < 2; n++) sim.step();
    assert.equal(shelved.size, 2, 'ordinary world update must actually shelf both distant workers');
    for (const e of expected.values()) {
      assert.equal(bodies(e.recordId).length, 0);
      assert.equal(rows(e.recordId).length, 1);
      assert.equal(budget.ownerForEntity(e.id), null, 'shelving releases the worker budget binding');
    }
    const radius = farActorTableRadius(state).enter;
    assert.ok(Math.hypot(collector.pos.x - player.pos.x, collector.pos.z - player.pos.z) > radius);
    const keys = sim.registry.get('input'), approachStartTick = state.tick;
    applyFlightKeyEvent(keys, { code: 'KeyW', pressed: true });
    for (let n = 0; n < 600 && [...expected.values()].some(e => e.stable < 120); n++) {
      sim.step();
      assert.ok(facade._sg02.records.has(player.id));
      assert.ok(budget.current() <= budget.max());
      let total = 0;
      for (const [role, e] of expected) {
        const local = bodies(e.recordId), distant = rows(e.recordId);
        assert.equal(local.length + distant.length, 1, 'one live OR shelved durable worker');
        const carrier = local[0] || distant[0];
        assert.deepEqual(carrier.data.cargoManifest, e.manifest);
        total += carrier.data.cargoManifest.totalQty;
        const native = local[0] && facade._sg02.records.get(local[0].id);
        if (!native) { e.stable = 0; e.generation = null; continue; }
        const entity = local[0];
        assert.ok(promoted.has(role), 'ordinary promotion must precede native observation');
        assert.equal(entity.id, e.id);
        assert.equal(native.entity, entity);
        assert.equal(native.body.mass(), canonical.mass);
        assert.ok(native.colliders.length >= (role === 'collector' ? 2 : 1),
          'native collector retains compound collision hardware rather than a generic capsule');
        assert.equal(entity.mass, canonical.mass); assert.equal(entity.radius, canonical.radius);
        assert.deepEqual(entity.propulsion, canonical.propulsion);
        assert.deepEqual(entity.data.fittings, canonical.data.fittings);
        assert.deepEqual(entity.data.weapons, canonical.data.weapons);
        assert.equal(entity.physicsBody.collisionProxyManifest?.id,
          role === 'collector' ? STORMSHIFT_COLLECTOR_COLLISION.id : undefined);
        assert.equal(budget.ownerForEntity(entity.id), e.requester);
        if (e.generation !== entity.occupantGeneration) e.stable = 0;
        e.generation = entity.occupantGeneration; e.stable++;
      }
      assert.equal(total, 4, 'finite seeded traffic custody is neither lost nor duplicated');
    }
    applyFlightKeyEvent(keys, { code: 'KeyW', pressed: false });
    applyFlightKeyEvent(keys, { code: 'Digit0', pressed: true });
    assert.equal(promoted.size, 2, 'raw approach must reach both workers within 600 ticks');
    for (const e of expected.values()) assert.ok(e.stable >= 120, '120 consecutive native ticks per worker');
    assert.ok(Math.hypot(player.pos.x - start.x, player.pos.z - start.z) > 500,
      'ordinary raw input must actually move the observer across the residency boundary');
    console.log(JSON.stringify({ route: 'seeded-ordinary-world-worker-promotion',
      approachTicks: state.tick - approachStartTick, promotions: Object.fromEntries(promoted),
      cargoTotal: 4, nativeStableTicks: Object.fromEntries([...expected].map(([role, e]) => [role, e.stable])),
      budgetUsed: budget.current(), budgetCap: budget.max() }));
  } finally { sim.dispose(); }
});
