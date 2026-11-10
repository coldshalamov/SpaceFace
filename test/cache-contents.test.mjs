// Sealed caches open into real cargo: the plain unowned caches carry an authored frozen
// `contents` lot, and investigating the cache pops that lot as a real, ropeable cargo pod
// beside the marker — the same payoff seam the Kettle Line strongbox rides (world.js
// _spawnCachePayoffs, beside _spawnKettleLinePayoff). The chain-owned caches keep their own
// investigate→choice→cargo chains and must never carry `contents`.
//
// Run: node --test test/cache-contents.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const LATCH = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard').maxLength;

// The seven plain unowned caches this program authored, and the lots they seal.
const AUTHORED_CACHES = [
  { poiId: 'poi_helios_locker', sectorId: 'sector_helios_prime', name: 'Bonded Cold Locker',
    commodityId: 'cmdty_ore_silverium', amount: 3 },
  { poiId: 'poi_survey',        sectorId: 'sector_ceres_belt',   name: 'Survey Cache',
    commodityId: 'cmdty_ore_copper', amount: 4 },
  { poiId: 'poi_stash',         sectorId: 'sector_sker_haven',   name: 'Stash Cache',
    commodityId: 'cmdty_stolen_goods', amount: 2 },
  { poiId: 'poi_rhea_claim',     sectorId: 'sector_rhea_cinder', name: 'Burned Survey Cache',
    commodityId: 'cmdty_ore_goldium', amount: 2 },
  { poiId: 'poi_eris_drop',      sectorId: 'sector_eris_margin', name: 'Quiet Drop Point',
    commodityId: 'cmdty_salvage_electronics', amount: 3 },
  { poiId: 'poi_eris_dead_drop', sectorId: 'sector_eris_margin', name: 'Margin Dead Drop',
    commodityId: 'cmdty_art', amount: 1 },
  { poiId: 'poi_phoebe_vault',   sectorId: 'sector_phoebe_echo', name: 'Silent Vault',
    commodityId: 'cmdty_exotic_xenium', amount: 1 },
];

// Full investigate→choice→cargo chains already live here; a `contents` row would double-pay.
const CHAIN_OWNED_CACHES = ['poi_helios_bay7', 'poi_blackmkt', 'poi_vesta_ore_cache', 'poi_hcache'];

test('authored cache contents are real commodities; chain-owned caches stay sealed', () => {
  const commodityIds = new Set(COMMODITIES.map((row) => row.id));
  for (const cache of AUTHORED_CACHES) {
    const sector = SECTORS.find((row) => row.id === cache.sectorId);
    assert.ok(sector, `${cache.sectorId} exists`);
    const poi = (sector.pois || []).find((row) => row && row.id === cache.poiId);
    assert.ok(poi, `${cache.poiId} exists in ${cache.sectorId}`);
    assert.ok(poi.contents, `${cache.poiId} carries authored contents`);
    assert.equal(poi.contents.commodityId, cache.commodityId, `${cache.poiId} seals the authored commodity`);
    assert.ok(commodityIds.has(poi.contents.commodityId), `${poi.contents.commodityId} is a real commodity`);
    assert.ok(Number.isInteger(poi.contents.amount) && poi.contents.amount >= 1,
      `${cache.poiId} amount is a whole lot >= 1`);
  }
  for (const poiId of CHAIN_OWNED_CACHES) {
    const poi = SECTORS.flatMap((sector) => sector.pois || []).find((row) => row && row.id === poiId);
    assert.ok(poi, `${poiId} exists`);
    assert.equal(poi.contents, undefined, `${poiId} stays chain-owned: no contents row`);
  }
});

function bootInSector(sectorId) {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world, mining] });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(sectorId);
  return { sim, state, player, worldSystem: sim.registry.get('world') };
}

function cachePayoffPods(state) {
  return state.entityList.filter((entity) => entity
    && entity.alive !== false && entity.data && entity.data.cachePayoff === true);
}

function investigatePoi(worldSystem, sectorId, poiId, completedAt) {
  return worldSystem._onSignalInvestigated({
    signalId: `signal:poi:${poiId}`,
    sourceId: poiId,
    sectorId,
    completedAt,
  });
}

// The live shape every authored cache must satisfy: sealed until the investigated receipt
// lands, then exactly one anchored pod of the authored lot beside the marker — a legal
// Massline target — and still exactly one pod when the receipt repeats.
function assertCachePopsLive(cache) {
  const { sim, state, player, worldSystem } = bootInSector(cache.sectorId);
  assert.equal(cachePayoffPods(state).length, 0, `${cache.poiId}: sealed before the cache is read`);

  assert.equal(investigatePoi(worldSystem, cache.sectorId, cache.poiId, 30), true,
    `${cache.poiId} accepts the investigated receipt`);
  const pods = cachePayoffPods(state);
  assert.equal(pods.length, 1, `${cache.poiId}: investigating pops exactly one pod`);
  const pod = pods[0];
  assert.equal(pod.type, 'payload');
  assert.equal(pod.data.commodityId, cache.commodityId, 'the pod carries the authored commodity');
  assert.equal(pod.data.amount, cache.amount, 'the pod carries the authored amount');
  assert.equal(pod.data.originId, cache.poiId, 'the pod remembers which cache opened');
  assert.equal(pod.data.ownerId, cache.poiId);
  assert.equal(pod.data.name, `${cache.name} — opened`);
  assert.equal(isAttachable(pod, state.playerId, state), true, 'the pod is a legal Massline target');
  const row = state.world.activeSector.pois.find((entry) => entry && entry.poiId === cache.poiId);
  assert.ok(row && row.pos, `${cache.poiId} is materialized with a live position`);
  const distance = Math.hypot(pod.pos.x - row.pos.x, pod.pos.z - row.pos.z);
  assert.ok(distance <= LATCH, `pod sits ${distance.toFixed(1)} WU from the cache, inside latch ${LATCH}`);

  assert.equal(investigatePoi(worldSystem, cache.sectorId, cache.poiId, 40), true,
    'a repeated investigated receipt still lands');
  assert.equal(cachePayoffPods(state).length, 1, `${cache.poiId}: no duplicate pod on a repeated receipt`);

  sim.registry.get('mining')._splitCargoPod(player, pod);
  const pickups = state.entityList.filter((entity) => entity
    && entity.alive !== false && entity.type === 'pickup'
    && entity.data && entity.data.commodityId === cache.commodityId
    && entity.data.amount >= 1);
  assert.ok(pickups.length >= 1, `splitting the ${cache.poiId} pod spills the authored lot`);
}

test('seed 4242: investigating the Helios locker pops exactly one silver lot, idempotently', () => {
  assertCachePopsLive(AUTHORED_CACHES[0]);
});

test('seed 4242: investigating the Rhea burned survey cache pops exactly one gold lot, idempotently', () => {
  assertCachePopsLive(AUTHORED_CACHES[3]);
});
