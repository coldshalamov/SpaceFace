import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { missionOwnsReward } from '../src/combat/rewardEligibility.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { lootShardItemsFor, lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { missions } from '../src/systems/missions.js';
import {
  captureEntityRecord,
  createEmptyRecordsBag,
  deserializeRecordsBag,
  serializeRecordsBag,
  spawnSpecFromRecord,
  upsertRecord,
} from '../src/world/worldRecords.js';

const BASE_PRICE = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity.basePrice]));
const REWARD_TEST_SECTOR = 'sector_reward_test';

function commodityValue(items) {
  return (items || []).reduce((total, item) => (
    total + (BASE_PRICE.get(item.commodityId) || 0) * (item.qty || 0)
  ), 0);
}

function withLootFlags(fn) {
  const priorFlags = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try { return fn(); }
  finally {
    MASSLINE2_FLAGS.enabled = priorFlags.enabled;
    MASSLINE2_FLAGS.lootShards = priorFlags.lootShards;
  }
}

function shardDropsOf(run) {
  return run.lootDrops.filter((drop) => drop.items?.every((item) => item.commodityId));
}

function authoredDropsOf(run) {
  return run.lootDrops.filter((drop) => drop.items?.some((item) => item.id));
}

function authoredPickupReceipts(run) {
  return run.state.entityList
    .filter((entity) => entity.type === 'pickup' && entity.data?.commodityId === 'cmdty_ore')
    .map((entity) => ({
      pos: { x: entity.pos.x, z: entity.pos.z },
      vel: { x: entity.vel.x, z: entity.vel.z },
      amount: entity.data.amount,
    }));
}

function bootRewardScenario({
  missionTarget = false,
  hostile = true,
  authoredReward = true,
  playerKill = true,
  preSpawnCount = 0,
  seed = 0x47a,
  stableIdentity = 'reward-target-alpha',
  targetType = 'ship',
  rewardMarker = null,
  deferKill = false,
  collisionRoute = false,
} = {}) {

  const sim = createSimulation({
    seed,
    systems: collisionRoute
      ? [physics, economy, missions, combat, lootShards, mining, cargo, collisionConsequences]
      : [economy, missions, combat, lootShards, mining, cargo],
  });
  const { state, bus, registry } = sim;
  state.mode = 'flight';

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  registry.get('economy').newGame();
  state.player.credits = 0;

  for (let i = 0; i < preSpawnCount; i++) {
    sim.spawn({
      type: 'marker', pos: { x: -100 - i, z: 0 }, radius: 1, mass: 1,
      data: { kind: 'identity-offset', sequence: i },
    });
  }
  const killer = playerKill ? player : sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 40, z: 0 },
    hull: 50, hullMax: 50, data: { shipClass: 'fighter', encounter: true },
  });

  const missionId = 'test_hunter_contract';
  const target = sim.spawn({
    type: targetType, team: hostile ? 1 : 2, factionId: 'faction_reach', pos: { x: 80, z: 0 },
    hull: 50, hullMax: 50,
    data: {
      shipClass: 'fighter',
      worldRecordId: stableIdentity,
      ...(hostile ? { encounter: true } : {}),
      ...(authoredReward ? {
        bountyCr: 120,
        lootTableId: 'test_contract_loot',
        loot: {
          creditsRange: [80, 80],
          guaranteed: [{ id: 'cmdty_ore', qtyRange: [1, 1] }],
          drops: [],
        },
      } : {}),
      ...(missionTarget ? {
        missionId,
        missionTag: missionId,
        missionPinned: true,
      } : {}),
      ...((rewardMarker && rewardMarker.data) || {}),
    },
    flags: { ...((rewardMarker && rewardMarker.flags) || {}) },
  });

  if (missionTarget) {
    state.missions.active.push({
      id: missionId,
      title: 'Bring In the Writ',
      type: 'bounty_hunt',
      status: 'active',
      targetEntityIds: [target.id],
      objectiveProgress: 0,
      objectiveTarget: 1,
      reward_cr: 500,
      collateral_cr: 0,
      riskTier: 1,
      factionId: null,
      params: {},
      clauses: [],
    });
  }

  const creditEvents = [];
  const lootDrops = [];
  const killedEvents = [];
  bus.on('credits:changed', (payload) => creditEvents.push(structuredClone(payload)));
  bus.on('loot:drop', (payload) => lootDrops.push(structuredClone(payload)));
  bus.on('entity:killed', (payload) => killedEvents.push(structuredClone(payload)));

  if (!deferKill) {
    if (collisionRoute) {
      Object.assign(player, {
        pos: { x: -8, z: 0 }, vel: { x: 120, z: 0 }, radius: 10, mass: 20,
      });
      Object.assign(target, {
        pos: { x: 8, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 20,
        hull: 1, hullMax: 1, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
      });
      const previousCollisionConsequences = COMBAT_FLAGS.weaponImpulseConsequences;
      COMBAT_FLAGS.weaponImpulseConsequences = true;
      try {
        withLootFlags(() => registry.get('physics').resolvePair(
          player,
          target,
          16,
          16,
          0,
          bus,
          state,
        ));
      } finally {
        COMBAT_FLAGS.weaponImpulseConsequences = previousCollisionConsequences;
      }
    } else {
      withLootFlags(() => registry.get('combat').kill(target, killer.id));
    }
  }
  return { sim, state, bus, player, killer, target, creditEvents, lootDrops, killedEvents };
}

function rematerializeAuthoredRewardTarget(run) {
  const target = run.target;
  target.homeSectorId = REWARD_TEST_SECTOR;
  target.data.homeSectorId = REWARD_TEST_SECTOR;
  target.data.sectorId = REWARD_TEST_SECTOR;
  target.data.durable = true;
  const authored = {
    bountyCr: target.data.bountyCr,
    lootTableId: target.data.lootTableId,
    loot: structuredClone(target.data.loot),
  };
  const bag = createEmptyRecordsBag();
  const record = captureEntityRecord(target, {
    seed: run.state.meta.seed,
    sectorId: REWARD_TEST_SECTOR,
    tick: run.state.tick,
  });
  assert.ok(record);
  upsertRecord(bag, record);
  const saved = JSON.parse(JSON.stringify(serializeRecordsBag(bag)));
  const loaded = deserializeRecordsBag(saved);
  const spec = spawnSpecFromRecord(loaded.byId[record.recordId]);
  assert.ok(spec);
  // Test-only loot table data is not in the authored enemy catalog that production rematerialization
  // rehydrates from, so restore that authored payload while retaining the saved durable identity.
  Object.assign(spec.data, authored);
  target.alive = false;
  return run.sim.spawn(spec);
}

test('contract target settles once through missions without generic bounty or loot', () => {
  const run = bootRewardScenario({ missionTarget: true });

  assert.equal(run.state.player.credits, 500);
  assert.deepEqual(run.creditEvents.map((event) => event.reason), ['mission:test_hunter_contract']);
  assert.equal(run.killedEvents[0]?.bountyCr, 0,
    'generic bounty presentation is also reserved for the mission owner');
  assert.equal(run.lootDrops.length, 0);
  assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
    'the beam-salvage wreck remains the one post-kill wreck path');
  assert.equal(run.state.missions.active.length, 0);
  assert.equal(run.state.missions.completedLog[0]?.success, 1);
  run.sim.dispose();
});

test('every durable mission marker reserves both authored loot and shards for missions', () => {
  const cases = [
    ['missionId', { data: { missionId: 'reserved-by-id' } }],
    ['missionTag', { data: { missionTag: 'reserved-by-tag' } }],
    ['data.missionPinned', { data: { missionPinned: true } }],
    ['flags.missionPinned', { flags: { missionPinned: true } }],
  ];
  for (const [label, rewardMarker] of cases) {
    const run = bootRewardScenario({
      rewardMarker,
      stableIdentity: `reward-marker-${label}`,
    });
    assert.equal(missionOwnsReward(run.target), true, label);
    assert.equal(run.killedEvents[0]?.bountyCr, 0, `${label} suppresses generic bounty presentation`);
    assert.deepEqual(run.creditEvents, [], `${label} excludes generic credits`);
    assert.deepEqual(run.lootDrops, [], `${label} excludes authored drops and shards`);
    assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false, label);
    assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
      `${label} leaves ordinary wreck salvage intact`);
    run.sim.dispose();
  }
});

test('pinned-only mission ownership survives saved world-record rematerialization', () => {
  const run = bootRewardScenario({
    rewardMarker: { data: { missionPinned: true } },
    stableIdentity: 'reward-pinned-only-rematerialized',
    deferKill: true,
  });
  const rematerialized = rematerializeAuthoredRewardTarget(run);
  assert.equal(rematerialized.data.missionId, null);
  assert.equal(rematerialized.data.missionTag, null);
  assert.equal(rematerialized.data.missionPinned, true);
  assert.equal(missionOwnsReward(rematerialized), true);

  run.bus.emit('save:loaded', { slot: 'reward-test' });
  withLootFlags(() => run.sim.registry.get('combat').kill(rematerialized, run.player.id));

  assert.equal(run.killedEvents[0]?.bountyCr, 0);
  assert.deepEqual(run.creditEvents, []);
  assert.deepEqual(run.lootDrops, []);
  assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1);
  run.sim.dispose();
});

test('ambient player kill keeps its authored bounty and loot', () => {
  const run = bootRewardScenario({ missionTarget: false });
  const repeat = bootRewardScenario({ missionTarget: false, preSpawnCount: 3 });

  assert.equal(run.state.player.credits, 200);
  assert.deepEqual(run.creditEvents.map((event) => event.reason), ['bounty', 'loot']);
  assert.equal(run.lootDrops.length, 2);

  const authoredDrop = run.lootDrops.find((drop) => drop.items?.some((item) => item.id));
  const repeatAuthoredDrop = repeat.lootDrops.find((drop) => drop.items?.some((item) => item.id));
  const shardDrop = shardDropsOf(run)[0];
  const repeatShardDrop = shardDropsOf(repeat)[0];
  assert.deepEqual(authoredDrop?.items, [{ id: 'cmdty_ore', qty: 1 }]);
  assert.deepEqual(authoredDrop, repeatAuthoredDrop,
    'authored loot is stable across live entity-id remaps for one durable victim identity');
  assert.deepEqual(authoredPickupReceipts(run), authoredPickupReceipts(repeat),
    'authored pickup placement uses the same identity-bound reward stream');
  assert.ok(shardDrop, 'live lootShards listener emits through loot:drop');
  assert.equal(shardDrop.credits, undefined, 'shards never mint credits directly');
  assert.equal(shardDrop.items.length, 3, 'accepted hostile kill creates a visible multi-pickup burst');
  assert.notEqual(run.target.id, repeat.target.id, 'rematerialized identity is not coupled to a live entity id');
  assert.deepEqual(shardDrop.items, repeatShardDrop?.items,
    'same seed plus durable victim identity produces the same bounded burst after rematerialization');
  assert.equal(shardDrop.items.filter((item) => item.commodityId === 'cmdty_scrap_metal').length, 2);
  assert.equal(shardDrop.items.filter((item) => item.commodityId === 'cmdty_salvage_electronics').length, 1);
  for (const item of shardDrop.items.filter((entry) => entry.commodityId === 'cmdty_scrap_metal')) {
    assert.ok(item.qty >= 4 && item.qty <= 6, `scrap shard quantity ${item.qty} stays bounded`);
  }
  assert.equal(shardDrop.items.find((item) => item.commodityId === 'cmdty_salvage_electronics')?.qty, 2);
  assert.ok(commodityValue(shardDrop.items) >= 174, 'burst base commodity value is at least 174cr');
  assert.ok(commodityValue(shardDrop.items) <= 206, 'burst base commodity value is at most 206cr');

  const pickups = run.state.entityList.filter((entity) => entity.type === 'pickup');
  assert.equal(pickups.length, 4, 'three shard pickups coexist with the authored loot pickup');
  assert.equal(pickups.filter((entity) => (
    entity.data?.commodityId === 'cmdty_scrap_metal'
      || entity.data?.commodityId === 'cmdty_salvage_electronics'
  )).length, 3);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
    'instant shards do not replace beam salvage');

  run.sim.step();
  assert.ok(run.state.miningRuntime.diagnostics.pickupsMagnetized >= 3,
    'the live mining path magnetizes the shard burst toward the player');
  run.sim.dispose();
  repeat.sim.dispose();
});

test('hostile craft contact death enters the same three-pickup reward fountain', () => {
  const run = bootRewardScenario({
    collisionRoute: true,
    hostile: true,
    authoredReward: false,
    stableIdentity: 'reward-contact-hostile',
  });
  const shardDrop = shardDropsOf(run)[0];

  assert.equal(run.killedEvents.length, 1, 'collision consequence crosses combat death once');
  assert.equal(run.killedEvents[0].killerId, run.player.id,
    'pre-contact player approach survives through the death receipt');
  assert.ok(shardDrop, 'hostile collision death remains reward eligible');
  assert.equal(shardDrop.items.length, 3, 'the accepted kill creates the bounded visible burst');
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'pickup').length, 3);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
    'instant collision rewards preserve the durable wreck salvage route');
  run.sim.dispose();
});

test('stateless shard rolls follow current New Game seed and replay durable identity after load', () => {
  const original = {
    id: 71, type: 'ship', data: { worldRecordId: 'reward-durable-victim' },
  };
  const rematerialized = {
    id: 9071, type: 'ship', data: { worldRecordId: 'reward-durable-victim' },
  };
  assert.deepEqual(lootShardItemsFor(0x47a, original), lootShardItemsFor(0x47a, rematerialized),
    'save/load entity-id remaps preserve the reward roll through durable identity');
  assert.deepEqual(
    lootShardItemsFor(0x47a, { ...original, type: 'drone' }),
    lootShardItemsFor(0x47a, rematerialized),
    'durable identity survives world-record subtype normalization as well as live-id remapping',
  );
  assert.notDeepEqual(lootShardItemsFor(0x47a, original), lootShardItemsFor(0x47b, original),
    'a different run seed changes the per-victim roll');

  const run = bootRewardScenario({
    authoredReward: false,
    seed: 0x47a,
    stableIdentity: 'reward-durable-victim',
  });
  const nextSeed = 0x47b;
  run.state.meta.seed = nextSeed;
  run.bus.emit('game:newGame', { seed: nextSeed });
  const newRunVictim = run.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 90, z: 0 },
    hull: 50, hullMax: 50,
    data: {
      worldRecordId: 'reward-durable-victim',
      shipClass: 'fighter',
      encounter: true,
    },
  });
  withLootFlags(() => run.bus.emit('entity:killed', {
    id: newRunVictim.id,
    killerId: run.player.id,
    type: newRunVictim.type,
    pos: { ...newRunVictim.pos },
  }));
  assert.deepEqual(shardDropsOf(run).at(-1)?.items, lootShardItemsFor(nextSeed, newRunVictim),
    'the already-initialized system reads the replacement New Game seed instead of an old cursor');

  run.bus.emit('save:loaded', { slot: 'reward-test' });
  const loadedVictim = run.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 100, z: 0 },
    hull: 50, hullMax: 50,
    data: {
      worldRecordId: 'reward-durable-victim',
      shipClass: 'fighter',
      encounter: true,
    },
  });
  withLootFlags(() => run.bus.emit('entity:killed', {
    id: loadedVictim.id,
    killerId: run.player.id,
    type: loadedVictim.type,
    pos: { ...loadedVictim.pos },
  }));
  assert.deepEqual(shardDropsOf(run).at(-1)?.items, lootShardItemsFor(nextSeed, loadedVictim),
    'save/load replay needs no private RNG continuation and reproduces the identity-bound roll');
  run.sim.dispose();
});

test('authored combat loot follows current run seed and saved durable victim identity', () => {
  const originalSeed = 0x47a;
  const nextSeed = 0x47b;
  const stableIdentity = 'authored-reward-durable-victim';
  const original = bootRewardScenario({ seed: originalSeed, stableIdentity });
  const freshNext = bootRewardScenario({ seed: nextSeed, stableIdentity });

  const changed = bootRewardScenario({
    seed: originalSeed,
    stableIdentity,
    deferKill: true,
  });
  changed.state.meta.seed = nextSeed;
  changed.bus.emit('game:newGame', { seed: nextSeed });
  changed.state.player.credits = 0;
  changed.creditEvents.length = 0;
  withLootFlags(() => changed.sim.registry.get('combat').kill(changed.target, changed.player.id));

  assert.deepEqual(authoredDropsOf(changed), authoredDropsOf(freshNext),
    'an initialized combat system reads the replacement New Game seed');
  assert.deepEqual(authoredPickupReceipts(changed), authoredPickupReceipts(freshNext));
  assert.notDeepEqual(authoredPickupReceipts(changed), authoredPickupReceipts(original),
    'changed run seed changes the identity-bound authored pickup roll');

  const loaded = bootRewardScenario({
    seed: nextSeed,
    stableIdentity,
    deferKill: true,
  });
  const decoy = loaded.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: -120, z: 0 },
    hull: 20, hullMax: 20,
    data: {
      shipClass: 'fighter', encounter: true, worldRecordId: 'authored-reward-decoy',
      bountyCr: 1, lootTableId: 'test_contract_loot',
      loot: {
        creditsRange: [1, 9],
        guaranteed: [{ id: 'cmdty_ore', qtyRange: [1, 3] }],
        drops: [],
      },
    },
  });
  withLootFlags(() => loaded.sim.registry.get('combat').kill(decoy, loaded.player.id));
  const priorPickupIds = new Set(
    loaded.state.entityList.filter((entity) => entity.type === 'pickup').map((entity) => entity.id),
  );
  const rematerialized = rematerializeAuthoredRewardTarget(loaded);
  assert.notEqual(rematerialized.id, loaded.target.id);
  loaded.bus.emit('save:loaded', { slot: 'reward-test' });
  const dropCountBefore = loaded.lootDrops.length;
  withLootFlags(() => loaded.sim.registry.get('combat').kill(rematerialized, loaded.player.id));
  const loadedAuthoredDrop = loaded.lootDrops
    .slice(dropCountBefore)
    .find((drop) => drop.items?.some((item) => item.id));
  const loadedPickupReceipts = loaded.state.entityList
    .filter((entity) => entity.type === 'pickup'
      && !priorPickupIds.has(entity.id)
      && entity.data?.commodityId === 'cmdty_ore')
    .map((entity) => ({
      pos: { x: entity.pos.x, z: entity.pos.z },
      vel: { x: entity.vel.x, z: entity.vel.z },
      amount: entity.data.amount,
    }));

  assert.deepEqual(loadedAuthoredDrop, authoredDropsOf(freshNext)[0],
    'save/rematerialization reproduces the durable victim authored loot roll after unrelated rewards');
  assert.deepEqual(loadedPickupReceipts, authoredPickupReceipts(freshNext),
    'pickup presentation also remains independent of a private combat RNG cursor');

  original.sim.dispose();
  freshNext.sim.dispose();
  changed.sim.dispose();
  loaded.sim.dispose();
});

test('neutral player kill never receives the hostile shard burst', () => {
  const run = bootRewardScenario({ hostile: false, authoredReward: false });

  assert.equal(run.state.player.credits, 0);
  assert.deepEqual(run.creditEvents, []);
  assert.deepEqual(run.lootDrops, []);
  assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
    'neutral destruction still leaves the existing beam-salvage wreck');
  run.sim.dispose();
});

test('non-player kills stay excluded from the player reward fountain', () => {
  const run = bootRewardScenario({ playerKill: false, authoredReward: true });

  assert.equal(run.target.data.bountyCr, 120, 'the killed NPC carried authored credits and loot');
  assert.ok(run.target.data.loot, 'the regression exercises the authored loot path');
  assert.deepEqual(run.creditEvents, []);
  assert.deepEqual(run.lootDrops, []);
  assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 1,
    'the existing ship-wreck salvage path is independent of shard eligibility');
  run.sim.dispose();
});

test('hostile drone kills retain the pre-existing three-pickup shard eligibility', () => {
  const run = bootRewardScenario({ targetType: 'drone', authoredReward: false });
  const shardDrop = shardDropsOf(run)[0];

  assert.ok(shardDrop);
  assert.equal(shardDrop.items.length, 3);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'pickup').length, 3);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'wreck').length, 0,
    'drone rewards do not broaden the ship-only beam-salvage wreck owner');
  run.sim.dispose();
});
