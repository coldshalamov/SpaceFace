import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  MAX_CIVILIAN_MANIFEST_PAYLOADS,
  enforceCivilianManifestPayloadCap,
} from '../src/systems/lootShards.js';
import { traffic as trafficDefinition } from '../src/systems/traffic.js';
import { world as worldDefinition } from '../src/systems/world.js';

const CERES = 'sector_ceres_belt';

function payloadSpec(sequence, payloadType = CIVILIAN_MANIFEST_PAYLOAD_TYPE) {
  return {
    type: 'payload',
    pos: { x: sequence * 3, z: -sequence * 2 },
    vel: { x: 0, z: 0 },
    radius: 4,
    mass: 24,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {
      payloadType,
      salvagePool: { cmdty_food: 1 },
    },
  };
}

test('residency demotion recycles an entity id without creating an index ghost', () => {
  const demoteDuringUpdate = {
    name: 'testResidencyDemoter',
    init(ctx) {
      this.world = ctx.registry.get('world');
      this.done = false;
    },
    update() {
      if (this.done) return;
      this.done = true;
      this.world._setSectorTier(CERES, RESIDENCY_TIER.RECORD_ONLY, {
        reason: 'entity_lifecycle_regression',
      });
    },
  };
  const sim = createSimulation({
    seed: 47001,
    systems: [worldDefinition, demoteDuringUpdate],
    updateOrder: [demoteDuringUpdate],
  });
  const resident = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 120, z: 80 },
    radius: 8,
    mass: 80,
    hull: 100,
    hullMax: 100,
    collides: true,
    homeSectorId: CERES,
    data: {
      homeSectorId: CERES,
      ai: { archetype: 'brawler' },
      weapons: [{ id: 'test_cannon' }],
    },
  });
  const recycledId = resident.id;

  sim.step();

  assert.equal(sim.state.entities.has(recycledId), false, 'demotion removes the old resident');
  assert.ok(sim.state.freeIds.includes(recycledId), 'demotion returns the resident id to core');

  const replacement = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: -40, z: 25 },
    radius: 7,
    mass: 65,
    hull: 90,
    hullMax: 90,
    collides: true,
    data: {
      ai: { archetype: 'interceptor' },
      weapons: [{ id: 'test_laser' }],
    },
  });
  const index = sim.state.entityIndex;

  assert.equal(replacement.id, recycledId, 'the next spawn reuses the residency-freed id');
  assert.ok(index.collidables.includes(replacement), 'recycled spawn must enter collision index');
  assert.ok(index.physicsBodies.includes(replacement), 'recycled spawn must enter physics index');
  assert.ok(index.aiShips.includes(replacement), 'recycled spawn must enter AI index');
  assert.ok(index.weaponShips.includes(replacement), 'recycled spawn must enter weapons index');
  assert.ok(index.radarContacts.includes(replacement), 'recycled spawn must enter radar index');
});

test('repeated civilian manifest cap disposal does not retain dead payload index entries', () => {
  const capPressure = {
    name: 'testManifestCapPressure',
    init(ctx) {
      this.state = ctx.state;
      this.helpers = ctx.helpers;
      this.sequence = 0;
    },
    update() {
      for (let i = 0; i < 3; i++) {
        this.helpers.spawnEntity(payloadSpec(this.sequence++));
      }
      enforceCivilianManifestPayloadCap(
        this.state,
        this.helpers.removeEntity,
        MAX_CIVILIAN_MANIFEST_PAYLOADS,
      );
    },
  };
  const sim = createSimulation({ seed: 47002, systems: [capPressure] });

  sim.runTicks(12);

  const live = sim.state.entityList.filter((entity) => entity && entity.alive !== false
    && entity.type === 'payload'
    && entity.data?.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
  const index = sim.state.entityIndex;

  assert.equal(live.length, MAX_CIVILIAN_MANIFEST_PAYLOADS, 'manifest body cap stays at six');
  assert.equal(index.payloads.length, live.length, 'payload index retained disposed manifest bodies');
  assert.equal(index.collidables.length, live.length, 'collision index retained disposed manifest bodies');
  assert.equal(index.physicsBodies.length, live.length, 'physics index retained disposed manifest bodies');
  assert.equal(index.radarContacts.length, live.length, 'radar index retained disposed manifest bodies');
  assert.equal(index._indexedIds.size, live.length, 'indexed-id set retained disposed manifest bodies');
});

test('traffic salvor payload disposal uses the core lifecycle indexes', () => {
  const salvorPressure = {
    name: 'testTrafficSalvorPressure',
    init(ctx) {
      this.helpers = ctx.helpers;
      this.traffic = ctx.registry.get('traffic');
      this.sequence = 0;
    },
    update() {
      const payload = this.helpers.spawnEntity(payloadSpec(this.sequence++, 'traffic_salvage'));
      this.traffic._despawnSalvagePayload(payload, 'test_salvor_absorbed');
    },
  };
  const sim = createSimulation({
    seed: 47003,
    systems: [trafficDefinition, salvorPressure],
    updateOrder: [salvorPressure],
  });

  sim.runTicks(12);

  const index = sim.state.entityIndex;
  assert.equal(sim.state.entityList.filter((entity) => entity?.type === 'payload').length, 0);
  assert.equal(index.payloads.length, 0, 'payload index retained traffic-disposed bodies');
  assert.equal(index.collidables.length, 0, 'collision index retained traffic-disposed bodies');
  assert.equal(index.physicsBodies.length, 0, 'physics index retained traffic-disposed bodies');
  assert.equal(index.radarContacts.length, 0, 'radar index retained traffic-disposed bodies');
  assert.equal(index._indexedIds.size, 0, 'indexed-id set retained traffic-disposed bodies');
});
