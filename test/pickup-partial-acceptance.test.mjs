// Synchronous pickup acceptance regressions for cargo, physics, and mining collection owners.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import {
  resolvePickupAcceptance,
  successfulPickupAmount,
} from '../src/core/pickupAcceptance.js';
import { physics } from '../src/core/physics.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { onboarding } from '../src/systems/onboarding.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { pickupFloatingTextSpec } from '../src/ui/floatingText.js';
import { audio } from '../src/audio/audioSystem.js';
import { vfx } from '../src/render/vfx.js';

const COMMODITY_ID = 'cmdty_scrap_metal';
const DT = 1 / 60;

function entity(spec, id) {
  const value = makeEntity(spec);
  value.id = id;
  return value;
}

function baseState(capVolume, amount) {
  const player = entity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, data: { intent: {}, miningBeam: { tierId: 'beam_mk1' } },
  }, 1);
  const pickup = entity({
    type: 'pickup', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 2.2,
    data: { kind: 'cargo', commodityId: COMMODITY_ID, amount },
  }, 2);
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    rng: () => 0.5,
    playerId: player.id,
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: 100 },
      moduleInventory: [],
      magnetRange: 0,
      miningBeam: { tierId: 'beam_mk1' },
    },
    input: { fireGroup: 0 },
    entities: new Map([[player.id, player], [pickup.id, pickup]]),
    entityList: [player, pickup],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      pickups: [pickup],
      shipLike: [player],
      collidable: [player, pickup],
      asteroids: [],
    },
  };
  return { state, player, pickup };
}

function bootPhysics({ capVolume, amount, spatial = false }) {
  const { state, player, pickup } = baseState(capVolume, amount);
  const bus = createBus();
  cargo.init({ state, bus, helpers: {} });
  physics.init({ state, bus, helpers: {} });
  const events = [];
  const fullEvents = [];
  bus.on('pickup:collected', (payload) => events.push(structuredClone(payload)));
  bus.on('cargo:full', (payload) => fullEvents.push(structuredClone(payload)));
  if (spatial) {
    // Exercise the production spatial branch (length product >= threshold) while returning the
    // same authoritative live pickup from the query.
    state.entityIndex.pickups = [pickup, ...Array.from({ length: 127 }, (_, index) => ({
      id: 1000 + index, type: 'pickup', alive: false,
    }))];
    state.spatialHash = {
      diagnostics: { activeBuckets: 1 },
      queryRadius(_x, _z, _r, out) { out.push(pickup); return out; },
    };
  }
  return { state, player, pickup, events, fullEvents, bus, collect: () => physics.collectPickups(state) };
}

function assertAcceptance(event, { amount, accepted, rejected }) {
  assert.equal(event.amount, amount);
  assert.equal(event.acceptedAmount, accepted);
  assert.equal(event.rejectedAmount, rejected);
  assert.equal(event.acceptedAmount + event.rejectedAmount, event.amount);
  assert.equal(event.commodityId, COMMODITY_ID);
  if (rejected > 0) assert.ok(event.acceptanceRetryAt > 0);
}

for (const spatial of [false, true]) {
  const route = spatial ? 'spatial physics' : 'full-scan physics';

  test(`${route}: zero capacity leaves the pickup unchanged, then a later full acceptance consumes it once`, () => {
    const h = bootPhysics({ capVolume: 0, amount: 5, spatial });
    h.collect();
    assert.equal(h.pickup.alive, true);
    assert.equal(h.pickup.data.amount, 5);
    assert.deepEqual(h.state.player.cargo.items, {});
    assertAcceptance(h.events[0], { amount: 5, accepted: 0, rejected: 5 });
    for (let i = 0; i < 20; i++) h.collect();
    assert.equal(h.events.length, 1, 'retry backoff suppresses an overlap event storm');
    assert.equal(h.fullEvents.length, 1, 'cargo:full emits once during the bounded retry window');

    h.state.player.cargo.capVolume = 5;
    h.state.simTime = h.events[0].acceptanceRetryAt;
    h.collect();
    assert.equal(h.pickup.alive, false);
    assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
    assertAcceptance(h.events[1], { amount: 5, accepted: 5, rejected: 0 });
    h.collect();
    assert.equal(h.events.length, 2, 'dead pickup cannot duplicate cargo on a later collection pass');
    assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
  });

  test(`${route}: partial acceptance retains only the rejected remainder and completes without duplication`, () => {
    const h = bootPhysics({ capVolume: 2, amount: 5, spatial });
    h.collect();
    assert.equal(h.pickup.alive, true);
    assert.equal(h.pickup.data.amount, 3);
    assert.equal(h.pickup.data.pickupAcceptanceRetryCollectorId, h.player.id);
    assert.equal(h.state.player.cargo.items[COMMODITY_ID], 2);
    assertAcceptance(h.events[0], { amount: 5, accepted: 2, rejected: 3 });
    for (let i = 0; i < 20; i++) h.collect();
    assert.equal(h.events.length, 1, 'partial remainder observes the same bounded retry window');
    assert.equal(h.fullEvents.length, 1);

    h.state.player.cargo.capVolume = 5;
    h.state.simTime = h.events[0].acceptanceRetryAt;
    h.collect();
    assert.equal(h.pickup.alive, false);
    assert.equal('pickupAcceptanceRetryAt' in h.pickup.data, false);
    assert.equal('pickupAcceptanceRetryCollectorId' in h.pickup.data, false);
    assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
    assertAcceptance(h.events[1], { amount: 3, accepted: 3, rejected: 0 });
  });
}

test('physics pair-resolution contact honors the same partial contract and retry backoff', () => {
  const h = bootPhysics({ capVolume: 2, amount: 5 });
  physics.resolvePair(h.pickup, h.player, 1, 1, 0, h.bus, h.state);
  assert.equal(h.pickup.alive, true);
  assert.equal(h.pickup.data.amount, 3);
  assert.equal(h.pickup.data.pickupAcceptanceRetryCollectorId, h.player.id);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 2);
  assertAcceptance(h.events[0], { amount: 5, accepted: 2, rejected: 3 });

  for (let i = 0; i < 20; i++) physics.resolvePair(h.pickup, h.player, 1, 1, 0, h.bus, h.state);
  assert.equal(h.events.length, 1);
  assert.equal(h.fullEvents.length, 1);

  h.state.player.cargo.capVolume = 5;
  h.state.simTime = h.events[0].acceptanceRetryAt;
  physics.resolvePair(h.pickup, h.player, 1, 1, 0, h.bus, h.state);
  assert.equal(h.pickup.alive, false);
  assert.equal('pickupAcceptanceRetryAt' in h.pickup.data, false);
  assert.equal('pickupAcceptanceRetryCollectorId' in h.pickup.data, false);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
  assertAcceptance(h.events[1], { amount: 3, accepted: 3, rejected: 0 });
});

test('physics retry belongs only to the rejecting collector, preserving player-first and NPC-first races', () => {
  const playerFirst = bootPhysics({ capVolume: 2, amount: 5 });
  const raider = entity({
    type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
  }, 9);
  playerFirst.state.entities.set(raider.id, raider);
  playerFirst.state.entityList.push(raider);
  playerFirst.state.entityIndex.shipLike = [playerFirst.player, raider];

  playerFirst.collect();
  assert.equal(playerFirst.events.length, 2, 'NPC can take the remainder in the same collection pass');
  assertAcceptance(playerFirst.events[0], { amount: 5, accepted: 2, rejected: 3 });
  assert.equal(playerFirst.events[1].collectorId, raider.id);
  assert.equal(playerFirst.events[1].amount, 3);
  assert.equal('acceptedAmount' in playerFirst.events[1], false, 'NPC remains a legacy full consumer');
  assert.equal(playerFirst.pickup.alive, false);
  assert.equal(playerFirst.state.player.cargo.items[COMMODITY_ID], 2);
  assert.equal('pickupAcceptanceRetryAt' in playerFirst.pickup.data, false);
  assert.equal('pickupAcceptanceRetryCollectorId' in playerFirst.pickup.data, false);

  const npcFirst = bootPhysics({ capVolume: 5, amount: 5 });
  const drone = entity({
    type: 'drone', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4,
  }, 10);
  npcFirst.state.entities.set(drone.id, drone);
  npcFirst.state.entityList.push(drone);
  npcFirst.state.entityIndex.shipLike = [drone, npcFirst.player];

  npcFirst.collect();
  assert.equal(npcFirst.events.length, 1);
  assert.equal(npcFirst.events[0].collectorId, drone.id);
  assert.equal(npcFirst.pickup.alive, false);
  assert.deepEqual(npcFirst.state.player.cargo.items, {}, 'later player overlap cannot duplicate NPC custody');
});

test('legacy saved retry deadlines are player-owned but do not reserve the pickup from another collector', () => {
  const h = bootPhysics({ capVolume: 0, amount: 4 });
  h.pickup.data.pickupAcceptanceRetryAt = 8;
  h.collect();
  assert.equal(h.events.length, 0, 'old deadline without collector still suppresses the player');

  const npc = entity({
    type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
  }, 11);
  h.state.entities.set(npc.id, npc);
  h.state.entityList.push(npc);
  h.state.entityIndex.shipLike = [h.player, npc];
  h.collect();
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].collectorId, npc.id);
  assert.equal(h.pickup.alive, false);
  assert.equal('pickupAcceptanceRetryAt' in h.pickup.data, false);
  assert.equal('pickupAcceptanceRetryCollectorId' in h.pickup.data, false);
});

function bootMining({ capVolume, amount }) {
  const { state, player, pickup } = baseState(capVolume, amount);
  const bus = createBus();
  const registry = { get(name) { return name === 'cargo' ? cargo : null; } };
  // Production listener order: mining registers before cargo, sees the real cargo owner in the
  // registry, and yields; cargo then mutates the same synchronous payload before emit returns.
  mining.init({ state, bus, helpers: {}, registry });
  cargo.init({ state, bus, helpers: {} });
  const events = [];
  const fullEvents = [];
  bus.on('pickup:collected', (payload) => events.push(structuredClone(payload)));
  bus.on('cargo:full', (payload) => fullEvents.push(structuredClone(payload)));
  return { state, player, pickup, events, fullEvents, collect: () => mining.update(DT, state) };
}

test('mining direct overlap preserves zero/partial remainder and later consumes only what cargo accepts', () => {
  const h = bootMining({ capVolume: 2, amount: 5 });
  h.collect();
  assert.equal(h.pickup.alive, true);
  assert.equal(h.pickup.data.amount, 3);
  assert.equal(h.pickup.data.pickupAcceptanceRetryCollectorId, h.player.id);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 2);
  assertAcceptance(h.events[0], { amount: 5, accepted: 2, rejected: 3 });

  for (let i = 0; i < 20; i++) h.collect();
  assert.equal(h.events.length, 1, 'partial overlap cannot emit again inside the retry window');
  assert.equal(h.fullEvents.length, 1);

  h.state.simTime = h.events[0].acceptanceRetryAt;
  h.collect();
  assert.equal(h.pickup.alive, true, 'zero acceptance on the now-full hold leaves the remainder live');
  assert.equal(h.pickup.data.amount, 3);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 2);
  assertAcceptance(h.events[1], { amount: 3, accepted: 0, rejected: 3 });
  for (let i = 0; i < 20; i++) h.collect();
  assert.equal(h.events.length, 2, 'zero acceptance is also backoff bounded');
  assert.equal(h.fullEvents.length, 2);

  h.state.player.cargo.capVolume = 5;
  h.state.simTime = h.events[1].acceptanceRetryAt;
  h.collect();
  assert.equal(h.pickup.alive, false);
  assert.equal('pickupAcceptanceRetryAt' in h.pickup.data, false);
  assert.equal('pickupAcceptanceRetryCollectorId' in h.pickup.data, false);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
  assertAcceptance(h.events[2], { amount: 3, accepted: 3, rejected: 0 });
  h.collect();
  assert.equal(h.events.length, 3);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
});

test('mining beam pickup collection publishes the same downstream acceptance receipt and retains remainder', () => {
  const h = bootMining({ capVolume: 2, amount: 5 });
  h.pickup.pos.set(10, 0, 0);
  mining._activeBeamLine = { ax: 0, az: 0, bx: 20, bz: 0 };

  const partial = mining._collectPickupOnBeamLine(h.pickup, h.player);
  assert.equal(partial.accepted, 2);
  assert.equal(h.pickup.alive, true);
  assert.equal(h.pickup.data.amount, 3);
  assert.equal(h.pickup.data.pickupAcceptanceRetryCollectorId, h.player.id);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 2);
  assertAcceptance(h.events[0], { amount: 5, accepted: 2, rejected: 3 });

  const deferred = mining._collectPickupOnBeamLine(h.pickup, h.player);
  assert.equal(deferred.deferred, true);
  assert.equal(h.events.length, 1, 'beam contact honors the same no-storm retry window');

  h.state.player.cargo.capVolume = 5;
  h.state.simTime = h.events[0].acceptanceRetryAt;
  const completed = mining._collectPickupOnBeamLine(h.pickup, h.player);
  assert.equal(completed.accepted, 3);
  assert.equal(h.pickup.alive, false);
  assert.equal('pickupAcceptanceRetryAt' in h.pickup.data, false);
  assert.equal('pickupAcceptanceRetryCollectorId' in h.pickup.data, false);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], 5);
  assertAcceptance(h.events[1], { amount: 3, accepted: 3, rejected: 0 });
});

test('mining overlap and beam retries are player-scoped, including legacy saved deadlines', () => {
  for (const route of ['overlap', 'beam']) {
    const foreignRetry = bootMining({ capVolume: 4, amount: 4 });
    foreignRetry.pickup.data.pickupAcceptanceRetryAt = 10;
    foreignRetry.pickup.data.pickupAcceptanceRetryCollectorId = 99;
    if (route === 'beam') {
      foreignRetry.pickup.pos.set(10, 0, 0);
      mining._activeBeamLine = { ax: 0, az: 0, bx: 20, bz: 0 };
      const accepted = mining._collectPickupOnBeamLine(foreignRetry.pickup, foreignRetry.player);
      assert.equal(accepted.accepted, 4);
    } else {
      foreignRetry.collect();
    }
    assert.equal(foreignRetry.events.length, 1, `${route} ignores another collector's retry`);
    assert.equal(foreignRetry.pickup.alive, false);
    assert.equal('pickupAcceptanceRetryAt' in foreignRetry.pickup.data, false);
    assert.equal('pickupAcceptanceRetryCollectorId' in foreignRetry.pickup.data, false);

    const legacyPlayerRetry = bootMining({ capVolume: 4, amount: 4 });
    legacyPlayerRetry.pickup.data.pickupAcceptanceRetryAt = 10;
    if (route === 'beam') {
      legacyPlayerRetry.pickup.pos.set(10, 0, 0);
      mining._activeBeamLine = { ax: 0, az: 0, bx: 20, bz: 0 };
      const deferred = mining._collectPickupOnBeamLine(legacyPlayerRetry.pickup, legacyPlayerRetry.player);
      assert.equal(deferred.deferred, true);
    } else {
      legacyPlayerRetry.collect();
    }
    assert.equal(legacyPlayerRetry.events.length, 0, `${route} treats old deadline as player-owned`);
    assert.equal(legacyPlayerRetry.pickup.alive, true);
  }
});

test('non-finite, non-positive, and missing pickup quantities fail closed without events or cargo', () => {
  const invalidAmounts = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -4,
    0,
    0.5,
    '5',
    true,
  ];
  for (const amount of invalidAmounts) {
    const scan = bootPhysics({ capVolume: 20, amount });
    scan.collect();
    assert.equal(scan.pickup.alive, false, `full-scan invalid amount ${String(amount)}`);
    assert.equal(scan.events.length, 0);
    assert.deepEqual(scan.state.player.cargo.items, {});
    assert.equal(addCargo(scan.state, COMMODITY_ID, amount), 0);

    const pair = bootPhysics({ capVolume: 20, amount });
    physics.resolvePair(pair.pickup, pair.player, 1, 1, 0, pair.bus, pair.state);
    assert.equal(pair.pickup.alive, false, `pair invalid amount ${String(amount)}`);
    assert.equal(pair.events.length, 0);
    assert.deepEqual(pair.state.player.cargo.items, {});

    const mine = bootMining({ capVolume: 20, amount });
    mine.collect();
    assert.equal(mine.pickup.alive, false, `mining invalid amount ${String(amount)}`);
    assert.equal(mine.events.length, 0);
    assert.deepEqual(mine.state.player.cargo.items, {});
  }
});

test('cargo rejects forged invalid pickup payloads and invalid module events without minting or feedback authority', () => {
  const h = bootPhysics({ capVolume: 20, amount: 1 });
  for (const amount of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, '5', true]) {
    const payload = {
      pickupId: 700,
      collectorId: h.player.id,
      kind: 'cargo',
      amount,
      commodityId: COMMODITY_ID,
      pos: { x: 0, z: 0 },
    };
    h.bus.emit('pickup:collected', payload);
    assert.equal(payload.acceptedAmount, 0);
    assert.equal(payload.rejectedAmount, 0);
    assert.equal(payload.invalidAmount, true);
  }
  const missingQuantity = {
    pickupId: 701,
    collectorId: h.player.id,
    kind: 'module',
    commodityId: 'module_missing_qty',
    pos: { x: 0, z: 0 },
  };
  h.bus.emit('pickup:collected', missingQuantity);
  assert.equal(missingQuantity.acceptedAmount, 0);
  assert.equal(missingQuantity.rejectedAmount, 0);
  assert.equal(missingQuantity.invalidAmount, true);
  assert.equal(successfulPickupAmount(missingQuantity), 0);
  assert.equal(pickupFloatingTextSpec(missingQuantity), null);

  const missingIdentity = {
    pickupId: 702,
    collectorId: h.player.id,
    kind: 'module',
    amount: 1,
    commodityId: '',
    pos: { x: 0, z: 0 },
  };
  h.bus.emit('pickup:collected', missingIdentity);
  assert.equal(missingIdentity.acceptedAmount, 0);
  assert.equal(missingIdentity.rejectedAmount, 1);
  assert.equal(missingIdentity.invalidAmount, true);
  assert.equal(successfulPickupAmount(missingIdentity), 0);
  assert.equal(pickupFloatingTextSpec(missingIdentity), null);
  assert.deepEqual(h.state.player.cargo.items, {});
  assert.equal(h.state.player.moduleInventory.length, 0);
});

test('player module acceptance is explicit while NPC pickup consumers retain legacy full-consume behavior', () => {
  const moduleHarness = bootPhysics({ capVolume: 0, amount: 1 });
  moduleHarness.pickup.data.kind = 'module';
  moduleHarness.pickup.data.commodityId = 'module_fixture';
  moduleHarness.collect();
  assert.equal(moduleHarness.pickup.alive, false);
  assert.equal(moduleHarness.state.player.moduleInventory.length, 1);
  assert.equal(moduleHarness.events[0].acceptedAmount, 1);
  assert.equal(moduleHarness.events[0].rejectedAmount, 0);

  const npcHarness = bootPhysics({ capVolume: 5, amount: 4 });
  const npc = entity({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 8 }, 9);
  npcHarness.state.entities.set(npc.id, npc);
  npcHarness.state.entityList.push(npc);
  npcHarness.state.entityIndex.shipLike = [npc];
  npcHarness.collect();
  assert.equal(npcHarness.pickup.alive, false);
  assert.deepEqual(npcHarness.state.player.cargo.items, {});
  assert.equal(npcHarness.events[0].collectorId, npc.id);
  assert.equal('acceptedAmount' in npcHarness.events[0], false);
  assert.equal('rejectedAmount' in npcHarness.events[0], false);
});

test('explicit zero acceptance cannot fake progression, text, audio, or presentation activity', () => {
  const zero = {
    pickupId: 800,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_ore_iron',
    amount: 9,
    acceptedAmount: 0,
    rejectedAmount: 9,
    pos: { x: 2, z: 3 },
  };
  const partial = { ...zero, pickupId: 801, acceptedAmount: 2, rejectedAmount: 7 };
  const legacy = {
    pickupId: 802,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_ore_iron',
    amount: 3,
    pos: { x: 2, z: 3 },
  };

  assert.equal(successfulPickupAmount(zero), 0);
  assert.equal(successfulPickupAmount(partial), 2);
  assert.equal(successfulPickupAmount(legacy), 3, 'absence of both fields preserves legacy consume');
  assert.deepEqual(resolvePickupAcceptance({ amount: 5, rejectedAmount: 3 }), {
    requested: 5,
    accepted: 0,
    rejected: 5,
    successfulAmount: 0,
    legacyFullConsume: false,
  }, 'a rejected-only payload cannot infer or fake an accepted amount');

  onboarding.state = {
    playerId: 1,
    simTime: 0,
    onboarding: { active: true, finished: false, currentBeat: -1, oreCollected: 0 },
  };
  onboarding._miningRockId = null;
  onboarding._recordOreCollected(zero);
  assert.equal(onboarding.state.onboarding.oreCollected, 0);
  onboarding._recordOreCollected(partial);
  assert.equal(onboarding.state.onboarding.oreCollected, 2);
  onboarding._recordOreCollected(legacy);
  assert.equal(onboarding.state.onboarding.oreCollected, 5);

  presentationOrchestrator.state = { playerId: 1, tick: 47 };
  presentationOrchestrator._lastMiningCargoTick = -Infinity;
  presentationOrchestrator._onMiningPickupCollected(zero);
  assert.equal(presentationOrchestrator._lastMiningCargoTick, -Infinity);
  presentationOrchestrator._onMiningPickupCollected(partial);
  assert.equal(presentationOrchestrator._lastMiningCargoTick, 47);

  assert.equal(pickupFloatingTextSpec(zero), null);
  assert.deepEqual(pickupFloatingTextSpec(partial), {
    qty: 2,
    text: '+2 Iron Ore',
    cls: 'sf-ft--ore',
  });
  assert.equal(pickupFloatingTextSpec(legacy).text, '+3 Iron Ore');

  const originalPlay = audio.play;
  const plays = [];
  try {
    audio.play = (...args) => { plays.push(args); };
    audio._onPickupCollected(zero);
    assert.equal(plays.length, 0);
    audio._onPickupCollected(partial);
    audio._onPickupCollected(legacy);
    assert.equal(plays.length, 2);
  } finally {
    audio.play = originalPlay;
  }

});

test('pickup VFX resolves into the exact winning collector and only legacy receipts fall back to player', () => {
  const player = entity({ type: 'ship', team: 0, pos: { x: 0, z: 0 } }, 1);
  const raider = entity({ type: 'ship', team: 1, pos: { x: 54, z: -12 } }, 9);
  const entities = new Map([[player.id, player], [raider.id, raider]]);
  const lights = [];
  const sink = Object.assign(Object.create(vfx), {
    state: { playerId: player.id, entities },
    helpers: { player: () => player },
    _scene: {},
    _ent: (id) => entities.get(id) || null,
    _spawnSprite() {},
    _spawnParticle() {},
    _flashLight(pos) { lights.push({ ...pos }); },
    _c0: { set() {} },
    _c1: { set() {} },
  });
  const base = {
    pickupId: 900,
    kind: 'cargo',
    commodityId: COMMODITY_ID,
    amount: 2,
    pos: { x: 10, z: 3 },
  };

  sink._onPickup({ ...base, collectorId: raider.id });
  assert.deepEqual(lights.pop(), { x: raider.pos.x, z: raider.pos.z });

  sink._onPickup({ ...base, pickupId: 901 });
  assert.deepEqual(lights.pop(), { x: player.pos.x, z: player.pos.z });

  sink._onPickup({ ...base, pickupId: 902, collectorId: 999 });
  assert.equal(lights.length, 0, 'an explicit missing collector cannot fabricate player collection');
});
