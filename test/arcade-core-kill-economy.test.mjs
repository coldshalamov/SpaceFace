// AC-01: victim-scaled hostile kill bursts and physical credit chips.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { missionOwnsReward } from '../src/combat/rewardEligibility.js';
import {
  classifyKillRewardVictim,
  creditChipItemsOf,
  CREDIT_CHIP_KIND,
  isCreditChipItem,
  KILL_BURST_EJECT_SPEED_MIN,
  KILL_BURST_VEL_INHERIT,
  materialItemsOf,
} from '../src/data/killRewards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { lootShardItemsFor, lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

function stubCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

function withLootFlags(fn) {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try { return fn(); }
  finally {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
}

function victim(partial = {}) {
  const data = { ...(partial.data || {}) };
  return {
    id: partial.id ?? 11,
    type: partial.type || 'ship',
    mass: partial.mass,
    data,
  };
}

function bootKill({
  seed = 0x47a,
  hostile = true,
  playerKill = true,
  missionTarget = false,
  shipClass = 'fighter',
  extraData = {},
  vel = { x: 80, z: 20 },
  cargoCap = 200,
  cargoItems = {},
} = {}) {
  const sim = createSimulation({
    seed,
    systems: [economy, lootShards, mining, cargo, combat],
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
  state.player.cargo = {
    items: { ...cargoItems },
    usedVolume: 0,
    usedMass: 0,
    capVolume: cargoCap,
  };

  const target = sim.spawn({
    type: 'ship',
    team: hostile ? 1 : 2,
    factionId: 'faction_reach',
    pos: { x: 40, z: 0 },
    vel: { x: vel.x, z: vel.z },
    hull: 40,
    hullMax: 40,
    mass: extraData.mass,
    data: {
      shipClass,
      encounter: hostile,
      worldRecordId: extraData.worldRecordId || `ac01-${shipClass}`,
      ...extraData,
    },
  });
  if (extraData.mass != null) target.mass = extraData.mass;

  if (missionTarget) {
    target.data.missionId = 'ac01_reserved';
    target.data.missionPinned = true;
  }

  const grants = [];
  const lootDrops = [];
  const cargoChanged = [];
  bus.on('economy:grantCredits', (payload) => grants.push(structuredClone(payload)));
  bus.on('loot:drop', (payload) => lootDrops.push(structuredClone(payload)));
  bus.on('cargo:changed', (payload) => cargoChanged.push(structuredClone(payload)));

  if (playerKill) {
    withLootFlags(() => registry.get('combat').kill(target, player.id));
  } else {
    const npc = sim.spawn({
      type: 'ship', team: 1, pos: { x: 20, z: 0 }, hull: 40, hullMax: 40,
      data: { shipClass: 'fighter', encounter: true },
    });
    withLootFlags(() => registry.get('combat').kill(target, npc.id));
  }

  return { sim, state, bus, player, target, grants, lootDrops, cargoChanged };
}

function shardDropOf(run) {
  return run.lootDrops.find((drop) => (
    Array.isArray(drop.items)
      && drop.items.length > 0
      && drop.items.every((item) => item.commodityId || isCreditChipItem(item))
  )) || null;
}

test('victim tiers produce materially different bursts', () => {
  const seed = 0x91c;
  const light = lootShardItemsFor(seed, victim({
    id: 1, data: { shipClass: 'fighter', worldRecordId: 'tier-light' },
  }));
  const medium = lootShardItemsFor(seed, victim({
    id: 2, data: { shipClass: 'brawler', aiArchetype: 'brawler', worldRecordId: 'tier-medium' },
  }));
  const heavy = lootShardItemsFor(seed, victim({
    id: 3, data: { shipClass: 'gunship', worldRecordId: 'tier-heavy' },
  }));
  const ace = lootShardItemsFor(seed, victim({
    id: 4, data: { shipClass: 'fighter', namedAceId: 'ace_yara_no_cut', worldRecordId: 'tier-ace' },
  }));

  assert.equal(classifyKillRewardVictim(victim({ data: { shipClass: 'fighter' } })), 'light');
  assert.equal(classifyKillRewardVictim(victim({
    data: { shipClass: 'fighter', aiArchetype: 'brawler' },
  })), 'medium');
  assert.equal(classifyKillRewardVictim(victim({ data: { shipClass: 'gunship' } })), 'heavy');
  assert.equal(classifyKillRewardVictim(victim({
    data: { shipClass: 'fighter', namedAceId: 'ace_yara_no_cut' },
  })), 'ace');
  assert.equal(classifyKillRewardVictim(victim({ mass: 80, data: {} })), 'heavy');
  assert.equal(classifyKillRewardVictim(victim({ data: {} })), 'light', 'missing class falls back safely');

  const lightIds = new Set(materialItemsOf(light).map((item) => item.commodityId));
  const mediumIds = new Set(materialItemsOf(medium).map((item) => item.commodityId));
  const heavyIds = new Set(materialItemsOf(heavy).map((item) => item.commodityId));
  const aceIds = new Set(materialItemsOf(ace).map((item) => item.commodityId));

  assert.equal(lightIds.has('cmdty_munitions'), false);
  assert.equal(mediumIds.has('cmdty_munitions'), true);
  assert.equal(heavyIds.has('cmdty_comp_hullplate'), true);
  assert.equal(aceIds.has('cmdty_quantum_cores'), true);
  assert.ok(materialItemsOf(medium).length > materialItemsOf(light).length);
  assert.ok(materialItemsOf(heavy).length > materialItemsOf(medium).length);
  assert.ok(
    creditChipItemsOf(ace).reduce((sum, item) => sum + item.credits, 0)
      > creditChipItemsOf(light).reduce((sum, item) => sum + item.credits, 0),
  );
});

test('identical seed and victim reproduce; identity remaps stay stable', () => {
  const original = victim({
    id: 71, type: 'ship', data: { worldRecordId: 'ac01-durable', shipClass: 'gunship' },
  });
  const rematerialized = victim({
    id: 9071, type: 'ship', data: { worldRecordId: 'ac01-durable', shipClass: 'gunship' },
  });
  assert.deepEqual(lootShardItemsFor(0x47a, original), lootShardItemsFor(0x47a, rematerialized));
  assert.deepEqual(
    lootShardItemsFor(0x47a, { ...original, type: 'drone' }),
    lootShardItemsFor(0x47a, rematerialized),
  );
  assert.notDeepEqual(lootShardItemsFor(0x47a, original), lootShardItemsFor(0x47b, original));
});

test('different victim identity changes the bounded roll', () => {
  const a = lootShardItemsFor(0x47a, victim({
    id: 8, data: { worldRecordId: 'victim-a', shipClass: 'fighter' },
  }));
  const b = lootShardItemsFor(0x47a, victim({
    id: 9, data: { worldRecordId: 'victim-b', shipClass: 'fighter' },
  }));
  assert.notDeepEqual(a, b);
  for (const item of a.filter((entry) => entry.commodityId === 'cmdty_scrap_metal')) {
    assert.ok(item.qty >= 12 && item.qty <= 18);
  }
  for (const item of b.filter((entry) => entry.commodityId === 'cmdty_scrap_metal')) {
    assert.ok(item.qty >= 12 && item.qty <= 18);
  }
});

test('materials ignore kill-style metadata', () => {
  const base = victim({
    id: 21,
    data: { worldRecordId: 'style-neutral', shipClass: 'brawler', aiArchetype: 'brawler' },
  });
  const styled = victim({
    id: 21,
    data: {
      worldRecordId: 'style-neutral',
      shipClass: 'brawler',
      aiArchetype: 'brawler',
      killStyle: 'ram',
      style: ' ram ',
      styleMultiplier: 4,
      presentation: { cause: 'collision', multiplier: 3, tag: 'smash' },
    },
  });
  assert.deepEqual(materialItemsOf(lootShardItemsFor(0x55, base)), materialItemsOf(lootShardItemsFor(0x55, styled)));
  assert.deepEqual(lootShardItemsFor(0x55, base), lootShardItemsFor(0x55, styled));
});

test('mission and civilian kills stay fail-closed', () => {
  const mission = bootKill({ missionTarget: true, shipClass: 'gunship' });
  assert.equal(missionOwnsReward(mission.target), true);
  assert.equal(mission.lootDrops.length, 0);
  assert.equal(mission.grants.some((grant) => String(grant.reason || '').startsWith('kill:credit_chip')), false);
  assert.equal(mission.state.entityList.some((entity) => entity.type === 'pickup'), false);
  mission.sim.dispose();

  const civilian = bootKill({ hostile: false, shipClass: 'fighter' });
  assert.equal(civilian.lootDrops.length, 0);
  assert.equal(civilian.grants.length, 0);
  assert.equal(civilian.state.entityList.some((entity) => entity.type === 'pickup'), false);
  civilian.sim.dispose();
});

test('death drops physical chips without granting credits; collection grants once', () => {
  const run = bootKill({
    authored: false,
    shipClass: 'fighter',
    extraData: { worldRecordId: 'ac01-collect' },
    cargoCap: 0,
  });
  const drop = shardDropOf(run);
  assert.ok(drop);
  assert.equal(drop.credits, undefined);
  const chips = creditChipItemsOf(drop.items);
  assert.equal(chips.length, 1);
  assert.ok(chips[0].credits > 0);
  assert.equal(run.grants.length, 0, 'no economy grant at death');
  assert.equal(run.state.player.credits, 0);

  const chipPickup = run.state.entityList.find((entity) => (
    entity.type === 'pickup' && entity.data?.kind === CREDIT_CHIP_KIND
  ));
  assert.ok(chipPickup);
  assert.equal(chipPickup.data.commodityId, undefined);
  const cargoBefore = structuredClone(run.state.player.cargo.items);

  chipPickup.pos = { x: run.player.pos.x + 4, z: run.player.pos.z };
  chipPickup.vel = { x: 0, z: 0 };
  run.sim.step();

  const chipGrants = run.grants.filter((grant) => String(grant.reason || '').startsWith('kill:credit_chip'));
  assert.equal(chipGrants.length, 1);
  assert.equal(chipGrants[0].amount, chips[0].credits);
  assert.equal(chipGrants[0].reason, chips[0].grantReason);
  assert.equal(run.state.player.credits, chips[0].credits);
  assert.equal(chipPickup.alive, false);
  assert.deepEqual(run.state.player.cargo.items, cargoBefore);
  assert.equal(run.cargoChanged.length, 0);

  run.sim.step();
  assert.equal(run.grants.filter((grant) => String(grant.reason || '').startsWith('kill:credit_chip')).length, 1);
  run.sim.dispose();
});

test('kill-burst pickups inherit victim velocity plus radial ejection', () => {
  const vel = { x: 90, z: -30 };
  const run = bootKill({
    shipClass: 'fighter',
    extraData: { worldRecordId: 'ac01-eject' },
    vel,
  });
  const drop = shardDropOf(run);
  assert.ok(drop);
  assert.equal(drop.vel.x, vel.x);
  assert.equal(drop.vel.z, vel.z);

  const pickups = run.state.entityList.filter((entity) => entity.type === 'pickup' && entity.data?.kind !== undefined);
  const burst = run.state.entityList.filter((entity) => (
    entity.type === 'pickup'
      && (entity.data?.commodityId || entity.data?.kind === CREDIT_CHIP_KIND)
  ));
  assert.ok(burst.length >= 7);
  const inheritX = vel.x * KILL_BURST_VEL_INHERIT;
  const inheritZ = vel.z * KILL_BURST_VEL_INHERIT;
  let ejectCount = 0;
  for (const pickup of burst) {
    const rx = pickup.vel.x - inheritX;
    const rz = pickup.vel.z - inheritZ;
    const eject = Math.hypot(rx, rz);
    assert.ok(eject + 1e-6 >= KILL_BURST_EJECT_SPEED_MIN, `eject ${eject} must include radial impulse`);
    ejectCount += 1;
  }
  assert.ok(ejectCount === burst.length);
  const headings = new Set(burst.map((pickup) => (
    Math.round(Math.atan2(pickup.vel.z - inheritZ, pickup.vel.x - inheritX) * 8)
  )));
  assert.ok(headings.size > 1, 'radial ejection must fan out, not share one heading');
  void pickups;
  run.sim.dispose();
});

test('renderer selects a distinct minted credit-chip object', () => {
  const factory = createVisualFactory();
  const ore = factory.build({
    id: 'ac01-ore',
    type: 'pickup',
    radius: 2.2,
    data: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 4 },
  });
  const chip = factory.build({
    id: 'ac01-chip',
    type: 'pickup',
    radius: 2.2,
    data: { kind: CREDIT_CHIP_KIND, amount: 80, credits: 80 },
  });
  assert.equal(ore.userData.pickupPresentationId, 'ore');
  assert.equal(ore.userData.visualLanguage, 'split-ore-cluster');
  assert.ok(ore.getObjectByName('PickupOreSplitCore'));
  assert.equal(chip.userData.pickupVisual, 'credit_chip');
  assert.equal(chip.userData.visualLanguage, 'minted-credit-chip');
  assert.equal(chip.userData.gem, undefined);
  assert.ok(chip.getObjectByName('CreditChipBody'));
  assert.ok(chip.getObjectByName('CreditChipStamp'));
  const chipGeos = [];
  chip.traverse((object) => {
    if (object.isMesh) chipGeos.push(object.geometry?.type);
  });
  assert.equal(chipGeos.includes('OctahedronGeometry'), false);
  assert.ok(chipGeos.includes('CylinderGeometry'));
  assert.ok(chipGeos.includes('BoxGeometry'));
  invalidateVisualFactoryCaches();
});
