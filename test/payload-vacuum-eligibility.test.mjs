import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { spawnPayloadEntity } from '../src/combat/industrialBeam.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { survivorPod } from '../src/systems/survivorPod.js';

const DT = 1 / 60;

function boot({ seed = 77, playerVel = { x: 0, z: 0 }, withCargo = false } = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  state.mode = 'flight';
  state.nextEntityId = 500;
  const player = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: playerVel.x, z: playerVel.z },
    radius: 6, flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const collected = [];
  bus.on('pickup:collected', (p) => collected.push(p));
  const registry = { get: (name) => (withCargo && name === 'cargo' ? cargo : null) };
  mining.init({ state, bus, helpers: {}, registry });
  if (withCargo) cargo.init({ state, bus, helpers: {} });
  return { state, bus, player, collected };
}

function giveBody(entity) {
  entity.physicsBody = { shape: 'ball', radius: entity.radius, mass: entity.mass, dynamic: true };
}

function queuedImpulseCount(entity) {
  const command = consumePhysicsCommand(entity);
  return command ? command.impulses.length : 0;
}

function spawnPod(state, spec) {
  return spawnPayloadEntity(state, spec, null);
}

test('a causal survivor pod from a dead enemy is never vacuumed, even with a live Massline elsewhere', () => {
  const { state, bus, player, collected } = boot({ playerVel: { x: 180, z: 0 }, withCargo: true });
  survivorPod.init({ state, bus, helpers: {}, registry: null });
  try {
    const tetheredEnemy = {
      id: 9, type: 'ship', team: 1, alive: true,
      pos: { x: -600, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {},
    };
    state.entities.set(tetheredEnemy.id, tetheredEnemy);
    state.entityList.push(tetheredEnemy);
    state.combat.attachments = {
      byId: {
        rope1: { id: 'rope1', ownerId: player.id, targetId: tetheredEnemy.id, state: 'active' },
      },
    };
    state.player.tether = { active: true, targetId: tetheredEnemy.id };

    const victim = {
      id: 42, type: 'ship', team: 1, alive: false,
      factionId: 'faction_raiders',
      pos: { x: 140, z: 40 }, vel: { x: -30, z: 12 }, rot: 0,
      radius: 12, data: {},
    };
    state.entities.set(victim.id, victim);
    state.entityList.push(victim);

    const pod = survivorPod._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod && pod.alive === true, 'real spawn seam must produce a live pod');
    assert.equal(pod.type, 'payload');
    assert.equal(pod.data.payloadType, 'survivor_pod');
    assert.equal(pod.data.tetherRole, 'survivor_pod');
    assert.equal(pod.data.masslineTetherable, true);
    assert.ok(!pod.data.tetherPayload, 'causal pods are not stamped tetherPayload');
    assert.ok(pod.data.salvagePool && Object.keys(pod.data.salvagePool).length === 0,
      'causal pods spawn with an empty salvage pool — nothing the hold can accept');
    giveBody(pod);

    state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      pickups: [],
      payloads: [pod],
    };

    const pos0 = { x: pod.pos.x, z: pod.pos.z };
    const vel0 = { x: pod.vel.x, z: pod.vel.z };
    assert.ok(Math.hypot(pod.pos.x - player.pos.x, pod.pos.z - player.pos.z) < 800,
      'pod must spawn inside the cargo magnet radius');

    consumePhysicsCommand(pod);
    for (let i = 0; i < 30; i++) mining._updatePickups(DT, state);

    assert.equal(pod.vel.x, vel0.x, 'vacuum must not rewrite the pod velocity');
    assert.equal(pod.vel.z, vel0.z, 'vacuum must not rewrite the pod velocity');
    assert.equal(pod.pos.x, pos0.x);
    assert.equal(pod.pos.z, pos0.z);
    assert.equal(pod.alive, true, 'an uncollectible pod must stay in the world');
    assert.equal(queuedImpulseCount(pod), 0, 'vacuum must not queue physics impulses on the pod');
    assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 0,
      'no collection receipt may be emitted for the pod');
  } finally {
    survivorPod.destroy();
  }
});

test('payloads with no collectible content are untouched at magnet range and on overlap', () => {
  const variants = [
    { name: 'absent pool', pool: 'absent' },
    { name: 'empty pool', pool: {} },
    { name: 'zero-only pool', pool: { cmdty_scrap_metal: 0 } },
    { name: 'fractional-below-one pool', pool: { cmdty_scrap_metal: 0.5 } },
    { name: 'string pool', pool: { cmdty_scrap_metal: '5' } },
    { name: 'NaN pool', pool: { cmdty_scrap_metal: Number.NaN } },
    { name: 'Infinity pool', pool: { cmdty_scrap_metal: Number.POSITIVE_INFINITY } },
    { name: 'empty pool + zero commodity amount', pool: {}, commodityId: 'cmdty_scrap_metal', amount: 0 },
    { name: 'empty pool + fractional commodity amount', pool: {}, commodityId: 'cmdty_scrap_metal', amount: 0.4 },
    { name: 'tetherPayload tow shell (existing guard)', pool: {}, tetherPayload: true },
  ];
  for (const variant of variants) {
    for (const overlap of [false, true]) {
      const { state, collected } = boot();
      const pod = spawnPod(state, {
        pos: overlap ? { x: 4, z: 0 } : { x: 120, z: 0 },
        vel: { x: -3, z: 2 },
        salvagePool: variant.pool === 'absent' ? undefined : variant.pool,
        payloadType: 'survivor_pod',
      });
      if (variant.pool === 'absent') delete pod.data.salvagePool;
      if (variant.commodityId) pod.data.commodityId = variant.commodityId;
      if (variant.amount != null) pod.data.amount = variant.amount;
      if (variant.tetherPayload) pod.data.tetherPayload = true;
      giveBody(pod);
      const vel0 = { x: pod.vel.x, z: pod.vel.z };
      const label = `${variant.name} @ ${overlap ? 'overlap' : 'range'}`;

      consumePhysicsCommand(pod);
      mining._updatePickups(DT, state);
      mining._updatePickups(DT, state);

      assert.equal(pod.vel.x, vel0.x, `${label}: must not be magnetized`);
      assert.equal(pod.vel.z, vel0.z, `${label}: must not be magnetized`);
      assert.equal(pod.alive, true, `${label}: must not be consumed`);
      assert.equal(queuedImpulseCount(pod), 0, `${label}: must not queue impulses`);
      assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 0,
        `${label}: must not emit a collection receipt`);
    }
  }
});

test('a payload with a real salvage pool still homes, scoops once, and cannot double-fill the hold', () => {
  const { state, collected } = boot({ withCargo: true });
  const pod = spawnPod(state, {
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    salvagePool: { cmdty_scrap_metal: 3 },
    payloadType: 'survivor_pod',
  });
  pod.data.tetherPayload = true;
  giveBody(pod);

  mining._updatePickups(DT, state);
  assert.ok(pod.vel.x < -1, `collectible payload must home toward the ship (vel.x ${pod.vel.x})`);
  assert.equal(pod.alive, true, 'homing alone must not consume the pod');

  pod.pos.x = 4;
  pod.pos.z = 0;
  mining._updatePickups(DT, state);

  const receipts = collected.filter((p) => p.pickupId === pod.id);
  assert.equal(receipts.length, 1, 'overlap must emit exactly one collection receipt');
  assert.equal(receipts[0].commodityId, 'cmdty_scrap_metal');
  assert.equal(receipts[0].acceptedAmount, 3);
  assert.equal(pod.alive, false, 'a fully accepted pool consumes the payload body');
  assert.equal(state.player.cargo.items.cmdty_scrap_metal, 3);

  mining._updatePickups(DT, state);
  mining._updatePickups(DT, state);
  assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 1,
    'a dead payload cannot emit a second receipt');
  assert.equal(state.player.cargo.items.cmdty_scrap_metal, 3, 'cargo cannot duplicate');
});

test('commodityId + whole amount collects through the fallback when the pool is absent or empty', () => {
  for (const pool of ['absent', 'empty']) {
    const { state, collected } = boot({ withCargo: true });
    const pod = spawnPod(state, {
      pos: { x: 120, z: 0 },
      vel: { x: 0, z: 0 },
      salvagePool: pool === 'absent' ? undefined : {},
    });
    if (pool === 'absent') delete pod.data.salvagePool;
    pod.data.kind = 'cargo';
    pod.data.commodityId = 'cmdty_scrap_metal';
    pod.data.amount = 4;
    giveBody(pod);

    mining._updatePickups(DT, state);
    assert.ok(pod.vel.x < -1, `${pool} pool: commodity payload must still home (vel.x ${pod.vel.x})`);

    pod.pos.x = 4;
    pod.pos.z = 0;
    mining._updatePickups(DT, state);
    assert.equal(pod.alive, false, `${pool} pool: overlap must consume the payload`);
    assert.equal(state.player.cargo.items.cmdty_scrap_metal, 4);
    assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 1);
  }
});

test('a non-empty but uncollectible pool wins over a valid commodity fallback (collector precedence)', () => {
  const { state, collected } = boot({ withCargo: true });
  const pod = spawnPod(state, {
    pos: { x: 4, z: 0 },
    vel: { x: 2, z: -1 },
    salvagePool: { cmdty_scrap_metal: 'junk' },
  });
  pod.data.commodityId = 'cmdty_scrap_metal';
  pod.data.amount = 4;
  giveBody(pod);
  const vel0 = { x: pod.vel.x, z: pod.vel.z };

  consumePhysicsCommand(pod);
  mining._updatePickups(DT, state);
  mining._updatePickups(DT, state);

  assert.equal(pod.vel.x, vel0.x, 'invalid pool + valid commodity fields must not magnetize');
  assert.equal(pod.vel.z, vel0.z);
  assert.equal(pod.alive, true);
  assert.equal(queuedImpulseCount(pod), 0);
  assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 0);
  assert.deepEqual(state.player.cargo.items, {});
});

test('a live player rope still blocks the vacuum on collectible payload cargo; a broken rope frees it', () => {
  const { state, player, collected } = boot({ withCargo: true });
  const pod = spawnPod(state, {
    pos: { x: 30, z: 0 },
    vel: { x: 5, z: 0 },
    salvagePool: { cmdty_scrap_metal: 2 },
  });
  state.combat.attachments = {
    byId: {
      ropeP: { id: 'ropeP', ownerId: player.id, targetId: pod.id, state: 'active' },
    },
  };

  mining._updatePickups(DT, state);
  assert.equal(pod.vel.x, 5, 'roped cargo must not be magnetized');
  assert.equal(pod.vel.z, 0);
  assert.equal(pod.alive, true);
  assert.equal(collected.filter((p) => p.pickupId === pod.id).length, 0);

  state.combat.attachments.byId.ropeP.state = 'broken';
  pod.pos.x = 4;
  pod.pos.z = 0;
  mining._updatePickups(DT, state);

  assert.ok(collected.some((p) => p.pickupId === pod.id),
    'broken rope frees the collectible payload for the scoop');
  assert.equal(pod.alive, false);
  assert.equal(state.player.cargo.items.cmdty_scrap_metal, 2);
});
