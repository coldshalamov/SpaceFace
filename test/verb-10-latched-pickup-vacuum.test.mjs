import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CREDIT_CHIP_KIND } from '../src/data/killRewards.js';
import { isMasslineLatchedPickup, mining } from '../src/systems/mining.js';

test('isMasslineLatchedPickup identifies Massline-latched pickups across authorities', () => {
  const state = createGameState(123);
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 5,
  };
  state.entities.set(player.id, player);
  state.playerId = player.id;

  const chip = {
    id: 10,
    type: 'pickup',
    alive: true,
    pos: { x: 10, z: 0 },
    vel: { x: 0, z: 0 },
    data: { kind: CREDIT_CHIP_KIND, amount: 250 },
  };

  // Initially unlatched
  assert.equal(isMasslineLatchedPickup(state, player, chip), false);

  // Latched via state.player.tether mirror
  state.player.tether = { active: true, targetId: chip.id };
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);
  state.player.tether = null;

  // Latched via player entity tether mirror
  player.tether = { active: true, targetId: String(chip.id) };
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);
  player.tether = null;

  // Latched via combat.attachments authority
  state.combat = state.combat || {};
  state.combat.attachments = {
    byId: {
      att1: {
        id: 'att1',
        ownerId: player.id,
        targetId: chip.id,
        state: 'active',
      },
    },
  };
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);

  // Broken attachment does not block
  state.combat.attachments.byId.att1.state = 'broken';
  assert.equal(isMasslineLatchedPickup(state, player, chip), false);

  // Detached attachment does not block
  state.combat.attachments.byId.att1.state = 'detached';
  assert.equal(isMasslineLatchedPickup(state, player, chip), false);

  // Attachment owned by another ship does not latch for player
  state.combat.attachments.byId.att1.state = 'active';
  state.combat.attachments.byId.att1.ownerId = 999;
  assert.equal(isMasslineLatchedPickup(state, player, chip), false);
  state.combat.attachments.byId = {};

  // Latched via masslineTelemetry
  state.player.masslineTelemetry = { targetId: chip.id };
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);
  state.player.masslineTelemetry = null;

  // Latched via entity.data flag
  chip.data.masslineLatched = true;
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);
  chip.data.masslineLatched = false;

  chip.data.latched = true;
  assert.equal(isMasslineLatchedPickup(state, player, chip), true);
  chip.data.latched = false;
});

test('mining _updatePickups skips Massline-latched pickup while vacuuming unlatched pickup', () => {
  const state = createGameState(456);
  const bus = createBus();
  const player = {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: { derived: { magnetRange: 400 } },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  // Unlatched pickup near player (within magnet range, e.g. 50 WU away)
  const freeChip = {
    id: 101,
    type: 'pickup',
    alive: true,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 2,
    data: { kind: CREDIT_CHIP_KIND, amount: 100 },
  };
  state.entities.set(freeChip.id, freeChip);
  state.entityList.push(freeChip);

  // Massline-latched pickup near player (e.g. 40 WU away, attached to player's rope)
  const latchedChip = {
    id: 102,
    type: 'pickup',
    alive: true,
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 10 },
    radius: 2,
    data: { kind: CREDIT_CHIP_KIND, amount: 300 },
  };
  state.entities.set(latchedChip.id, latchedChip);
  state.entityList.push(latchedChip);

  // Set Massline attachment on latchedChip
  state.combat = state.combat || {};
  state.combat.attachments = {
    byId: {
      rope1: {
        id: 'rope1',
        ownerId: player.id,
        targetId: latchedChip.id,
        state: 'active',
        defId: 'tether_standard',
      },
    },
  };

  let collectedReceipts = [];
  bus.on('pickup:collected', (p) => collectedReceipts.push(p));

  const ctx = { state, bus, helpers: {}, registry: null };
  mining.init(ctx);

  const initialLatchedVel = { ...latchedChip.vel };

  // Step mining update
  mining._updatePickups(1 / 60, state);

  // 1. Free chip was magnetized (vel modified toward player)
  assert.notEqual(freeChip.vel.x, 0, 'free chip must be magnetized by vacuum');

  // 2. Latched chip was NOT magnetized (its velocity was untouched by updatePickups)
  assert.equal(latchedChip.vel.x, initialLatchedVel.x, 'latched chip x velocity must be untouched');
  assert.equal(latchedChip.vel.z, initialLatchedVel.z, 'latched chip z velocity must be untouched');

  // 3. Latched chip remains alive
  assert.equal(latchedChip.alive, true, 'latched chip must remain alive in world on the rope');

  // Now place both inside direct collect radius (e.g. 2 WU away)
  freeChip.pos.x = 2;
  latchedChip.pos.x = 2;

  collectedReceipts = [];
  mining._updatePickups(1 / 60, state);

  // Free chip was collected
  assert.ok(collectedReceipts.some((r) => r.pickupId === freeChip.id), 'free chip must be collected on overlap');

  // Latched chip was NOT collected
  assert.ok(!collectedReceipts.some((r) => r.pickupId === latchedChip.id), 'latched chip must NOT be collected while on rope');
  assert.equal(latchedChip.alive, true, 'latched chip must remain alive and not swallowed into hold');

  // Release/cut Massline attachment
  state.combat.attachments.byId.rope1.state = 'broken';

  // Now update pickups again
  mining._updatePickups(1 / 60, state);

  // Now that it is unlatched, it can be collected
  assert.ok(collectedReceipts.some((r) => r.pickupId === latchedChip.id), 'once unlatched, chip can be collected');

  if (typeof mining.destroy === 'function') mining.destroy();
  mining.bus = null;
});
