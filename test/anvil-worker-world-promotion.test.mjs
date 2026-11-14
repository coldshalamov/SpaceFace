import test from 'node:test';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
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
import { STORMSHIFT_RECEIVER_COLLISION } from '../src/data/stormshiftReceiverCollision.js';

// Compact seeded boundary regression, not a replay of a saved harvesting route.
// Fixture setup supplies a loaded return and a separated tender. After native preparation,
// only raw keys and ordinary sim ticks run: world owns residency, traffic owns
// work, and spawnBudget owns admission. Active work pins preserve native bodies beyond
// the local residency radius. Legacy shelf restoration is separately covered in
// anvil-worker-residency-integration.test.mjs; no direct promotion call is used here.
// Planet harvesting, save/UI Continue, rendering and the production manifest are excluded.
const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };

test('ordinary world ticks retain working Anvil originals with native hardware and finite custody', async () => {
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
        original: entity, manifest: structuredClone(entity.data.cargoManifest), stable: 0, generation: null });
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
      promoted.set(role, { tick: state.tick, id: event.id });
    });

    // Native preparation is complete; participant poses, manifests and phases are read-only below.
    const start = { ...player.pos };
    for (let n = 0; n < 120; n++) sim.step();
    assert.equal(shelved.size, 0, 'active work retains both original workers beyond the local radius');
    for (const e of expected.values()) {
      assert.equal(bodies(e.recordId).length, 1);
      assert.strictEqual(bodies(e.recordId)[0], e.original);
      assert.equal(e.original.data.anvilWorkLiveness, true);
      assert.equal(e.original.data.transitCritical, true);
      assert.equal(rows(e.recordId).length, 0);
      assert.equal(budget.ownerForEntity(e.id), e.requester, 'native work keeps its admission binding');
    }
    const radius = farActorTableRadius(state).enter;
    assert.ok(Math.hypot(collector.pos.x - player.pos.x, collector.pos.z - player.pos.z) > radius);
    const keys = sim.registry.get('input'), approachStartTick = state.tick;
    applyFlightKeyEvent(keys, { code: 'KeyW', pressed: true });
    for (let n = 0; n < 600 && ([...expected.values()].some(e => e.stable < 120) || Math.hypot(player.pos.x - start.x, player.pos.z - start.z) <= 500); n++) {
      sim.step();
      assert.ok(facade._sg02.records.has(player.id));
      assert.ok(budget.current() <= budget.max());
      let total = 0;
      for (const [role, e] of expected) {
        const local = bodies(e.recordId), distant = rows(e.recordId);
        assert.equal(local.length, 1, 'one native durable worker');
        assert.equal(distant.length, 0, 'no duplicate far-table carrier');
        assert.strictEqual(local[0], e.original);
        const carrier = local[0];
        assert.deepEqual(carrier.data.cargoManifest, e.manifest);
        total += carrier.data.cargoManifest.totalQty;
        const native = local[0] && facade._sg02.records.get(local[0].id);
        assert.ok(native, 'active work stays physically admitted every tick');
        const entity = local[0];
        assert.equal(wholeShipVisualForEntity(entity, { requiredWholeShip: true }).file,
          role === 'collector' ? 'wholeships/ship_stormshift_collector_v01.glb' : 'wholeships/ship_stormshift_receiver_v01.glb',
          'active residency retains the dedicated visual identity');
        assert.equal(entity.data.anvilWorkLiveness, true);
        assert.equal(entity.id, e.id);
        assert.equal(native.entity, entity);
        assert.equal(native.body.mass(), canonical.mass);
        if (role === 'receiver') assert.equal(native.colliders.length, 27, 'the original cradle keeps every fixed authored solid');
        else assert.ok(native.colliders.length >= 2,
          'native collector retains compound collision hardware rather than a generic capsule');
        assert.equal(entity.mass, canonical.mass); assert.equal(entity.radius, canonical.radius);
        assert.deepEqual(entity.propulsion, canonical.propulsion);
        assert.deepEqual(entity.data.fittings, canonical.data.fittings);
        assert.deepEqual(entity.data.weapons, canonical.data.weapons);
        assert.equal(entity.physicsBody.collisionProxyManifest?.id,
          role === 'collector' ? STORMSHIFT_COLLECTOR_COLLISION.id : STORMSHIFT_RECEIVER_COLLISION.id);
        assert.equal(budget.ownerForEntity(entity.id), e.requester);
        if (e.generation !== entity.occupantGeneration) e.stable = 0;
        e.generation = entity.occupantGeneration; e.stable++;
      }
      assert.equal(total, 4, 'finite seeded traffic custody is neither lost nor duplicated');
    }
    applyFlightKeyEvent(keys, { code: 'KeyW', pressed: false });
    applyFlightKeyEvent(keys, { code: 'Digit0', pressed: true });
    assert.equal(promoted.size, 0, 'raw approach must retain the same originals');
    assert.equal(shelved.size, 0, 'working originals never leave native residency');
    for (const e of expected.values()) assert.ok(e.stable >= 120, '120 consecutive native ticks per worker');
    assert.ok(Math.hypot(player.pos.x - start.x, player.pos.z - start.z) > 500,
      'ordinary raw input must move the observer while the originals keep working');
    console.log(JSON.stringify({ route: 'seeded-ordinary-world-worker-residency',
      approachTicks: state.tick - approachStartTick, promotions: Object.fromEntries(promoted),
      cargoTotal: 4, nativeStableTicks: Object.fromEntries([...expected].map(([role, e]) => [role, e.stable])),
      budgetUsed: budget.current(), budgetCap: budget.max() }));
  } finally { sim.dispose(); }
});
