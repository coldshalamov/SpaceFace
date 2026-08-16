// Plan 04 — a player-caused atmospheric execution leaves its physical reward along the real plunge.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TUMBLE_STATUS_ID, COLLISION_TUMBLE_KIND } from '../src/combat/tumbleStatus.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { PLANET_FLAGS, PLANET_REWARD_SCATTER_KIND, PLANET_SITE } from '../src/data/planets.js';
import { ZONE_TETHYS_ANVIL } from '../src/data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { cargo } from '../src/systems/cargo.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const CENTER = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);

function radiusOf(entity) {
  return Math.hypot(entity.pos.x - CENTER.x, entity.pos.z - CENTER.z);
}

function radialVelocityOf(entity) {
  const dx = entity.pos.x - CENTER.x;
  const dz = entity.pos.z - CENTER.z;
  const r = Math.hypot(dx, dz) || 1;
  return entity.vel.x * (dx / r) + entity.vel.z * (dz / r);
}

test('burn-up scatters the unchanged reward along the physical descent and recovers material at the rim', async () => {
  const prior = {
    planet: PLANET_FLAGS.enabled,
    fields: FIELD_FLAGS.enabled,
    massline2: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;

  const sim = createSimulation({
    seed: 0xac0404,
    systems: [economy, cargo, fields, planetRuntime, physics, combat, lootShards, mining],
  });
  const { state, bus } = sim;
  const physicsSystem = sim.registry.get('physics');
  let prepared = false;
  try {
    state.mode = 'flight';
    state.world.currentSectorId = PLANET_SITE.sectorId;
    state.bounds = {
      radius: PLANET_SITE.bands.influence + 1000,
      hardRadius: PLANET_SITE.bands.influence + 1400,
      center: { x: CENTER.x, z: CENTER.z },
    };
    const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []);
    const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0,
      isPlayer: true,
      player: state.player,
      fittings,
      pos: { x: CENTER.x, z: CENTER.z + 1800 },
      rot: Math.PI / 2,
    }));
    state.playerId = player.id;
    state.player.cargo = {
      items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500,
    };

    const hostileSpec = makeEnemySpawnSpec('marauder_brawler', 1, {
      x: CENTER.x,
      z: CENTER.z + 840,
    });
    hostileSpec.data.encounter = true;
    hostileSpec.data.worldRecordId = 'plan04-burn-scatter-victim';
    const hostile = sim.spawn(hostileSpec);
    hostile.hull = 48;
    hostile.hullMax = 48;
    hostile.armorHp = 0;
    hostile.armorMax = 0;
    hostile.armorFlat = 0;
    hostile.shield = 0;
    hostile.shieldMax = 0;
    hostile.vel.x = 60;
    hostile.vel.z = -20;
    hostile.angVel = 2.2;

    state.combat.entities[String(hostile.id)] = {
      statuses: {
        [TUMBLE_STATUS_ID]: {
          id: TUMBLE_STATUS_ID,
          attackerId: player.id,
          expiresTick: state.tick + 1,
          data: {
            kind: COLLISION_TUMBLE_KIND,
            source: 'collision',
            startedAt: state.simTime,
            until: state.simTime + SIM_DT,
          },
        },
      },
      pendingStatuses: [],
    };

    const kills = [];
    const drops = [];
    const collections = [];
    let burstPickupIds = [];
    bus.on('entity:killed', (payload) => { if (payload?.id === hostile.id) kills.push(structuredClone(payload)); });
    bus.on('loot:drop', (payload) => {
      if (payload?.source !== 'kill_burst') return;
      drops.push(structuredClone(payload));
      // mining's listener runs first and materializes this exact event synchronously; combat may
      // add a separate authored loot pickup after entity:killed returns.
      burstPickupIds = state.entityList
        .filter((entity) => entity.type === 'pickup')
        .map((entity) => entity.id);
    });
    bus.on('pickup:collected', (payload) => collections.push(structuredClone(payload)));

    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    prepared = await physicsSystem.prepareBackend(state, { reset: true });
    assert.equal(prepared, true, 'the live SG-02 physics owner starts');

    const entryAt = state.simTime;
    while (hostile.alive !== false && state.simTime - entryAt < 6.1) sim.step(SIM_DT);
    assert.equal(hostile.alive, false, 'the uncontrolled hostile burns on the production trajectory');
    assert.ok(state.simTime - entryAt >= 3 && state.simTime - entryAt <= 6,
      `the complete execution remains in the authored 3-6 second show (${(state.simTime - entryAt).toFixed(2)}s)`);
    assert.equal(kills.length, 1);
    assert.equal(kills[0].killerId, player.id, 'the short player tumble keeps kill credit');
    assert.equal(kills[0].presentation.style.id, 'burn_up');
    assert.equal(kills[0].presentation.style.multiplier, 2);

    assert.equal(drops.length, 1, 'one reward authority publishes one burst');
    const drop = drops[0];
    assert.equal(drop.rewardScatter.kind, PLANET_REWARD_SCATTER_KIND);
    assert.ok(drop.rewardScatter.path.length >= 3);
    assert.ok(drop.rewardScatter.path.length <= PLANET_SITE.rewardScatter.maxPathPoints);
    assert.equal(drop.items.length, burstPickupIds.length,
      'scatter changes placement, never the rolled reward count');

    const pickups = state.entityList.filter((entity) => (
      burstPickupIds.includes(entity.id) && entity.alive !== false
    ));
    assert.equal(pickups.length, drop.items.length);
    const nearestPathIndices = new Set();
    for (const pickup of pickups) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      for (let i = 0; i < drop.rewardScatter.path.length; i++) {
        const point = drop.rewardScatter.path[i];
        const distance = Math.hypot(pickup.pos.x - point.x, pickup.pos.z - point.z);
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = i; }
      }
      // mining adds a 6-10 WU radial spawn offset and physics advances the newly created body once
      // later in the lethal tick; the source point still owns the visible cluster.
      assert.ok(nearestDistance <= 17, `pickup remains attached to a sampled descent point (${nearestDistance})`);
      nearestPathIndices.add(nearestIndex);
    }
    assert.ok(nearestPathIndices.size >= 3, 'the burst occupies the path rather than one death point');
    const radialVelocities = pickups.map(radialVelocityOf);
    assert.ok(radialVelocities.some((speed) => speed > 35), 'a bounded subset is flung back toward the rim');
    assert.ok(radialVelocities.some((speed) => speed < 35), 'the whole burst is not replaced by one outward spray');

    const material = pickups
      .filter((entity) => entity.data?.commodityId && radialVelocityOf(entity) > 35)
      .sort((a, b) => radiusOf(b) - radiusOf(a))[0];
    assert.ok(material, 'the outward subset includes a physical material pickup');
    const scatterAt = state.simTime;
    const materialStartRadius = radiusOf(material);
    let materialMaxRadius = materialStartRadius;
    while (material.alive !== false
      && radiusOf(material) < PLANET_SITE.bands.reentry
      && state.simTime - scatterAt < 3) {
      sim.step(SIM_DT);
      materialMaxRadius = Math.max(materialMaxRadius, radiusOf(material));
    }
    assert.ok(radiusOf(material) >= PLANET_SITE.bands.reentry,
      `the physical outward impulse carries material back to the atmosphere rim (start=${materialStartRadius.toFixed(1)}, max=${materialMaxRadius.toFixed(1)}, alive=${material.alive !== false})`);
    const radialX = (material.pos.x - CENTER.x) / (radiusOf(material) || 1);
    const radialZ = (material.pos.z - CENTER.z) / (radiusOf(material) || 1);
    player.pos.x = CENTER.x + radialX * (radiusOf(material) + 12);
    player.pos.z = CENTER.z + radialZ * (radiusOf(material) + 12);
    player.vel.x = 0;
    player.vel.z = 0;
    const commodityId = material.data.commodityId;
    const before = state.player.cargo.items[commodityId] || 0;
    for (let i = 0; i < 10 && material.alive !== false; i++) sim.step(SIM_DT);
    assert.equal(material.alive, false, 'the rim interception settles through the physical pickup owner');
    assert.ok((state.player.cargo.items[commodityId] || 0) > before, 'cargo owner receives the recovered material');
    assert.ok(collections.some((payload) => payload.pickupId === material.id && payload.collectorId === player.id));
  } finally {
    if (prepared && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
    PLANET_FLAGS.enabled = prior.planet;
    FIELD_FLAGS.enabled = prior.fields;
    MASSLINE2_FLAGS.enabled = prior.massline2;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
});
