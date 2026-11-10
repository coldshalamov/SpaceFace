// PQ-208.01 — the two declared-but-unwired keys are real verbs.
//
// microJumpBlink (Pale-Coil Warp Drive): a dash blinks the ship 240 WU along its
// heading without thrust, once per encounter.
// reactiveMissileKnockback (Choir-Bell Aegis): an incoming player-targeted missile is
// knocked back outward with its homing killed, once per encounter — so it can strike
// something else, never the player.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CHOIR_BELL_KNOCKBACK_SPEED,
  PALE_COIL_BLINK_DISTANCE,
  uniqueLootAbilities,
} from '../src/systems/uniqueLootAbilities.js';

function makeHarness(seed, fittings) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = createBus();
  const receipts = [];
  bus.on('uniqueLoot:paleCoilBlink', (r) => receipts.push({ ev: 'blink', ...r }));
  bus.on('uniqueLoot:choirBellPulse', (r) => receipts.push({ ev: 'pulse', ...r }));
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 26, factionId: 'player', data: { fittings: fittings.slice() },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const system = Object.create(uniqueLootAbilities);
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, player, receipts };
}

function addEnemy(harness, id) {
  const enemy = {
    id, type: 'ship', team: 1, alive: true, pos: { x: -300, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, factionId: 'faction_reach', data: { ai: { encounterId: 'enc-kb' } },
  };
  harness.state.entities.set(enemy.id, enemy);
  harness.state.entityList.push(enemy);
  return enemy;
}

function addMissile(harness, id, targetId) {
  const missile = {
    id, type: 'projectile', team: 1, alive: true, pos: { x: -100, z: 0 }, vel: { x: 200, z: 0 },
    radius: 2, mass: 1, ownerId: 9, data: { kind: 'missile', targetId, ownerId: 9 },
  };
  harness.state.entities.set(missile.id, missile);
  harness.state.entityList.push(missile);
  return missile;
}

test('a fitted blink crosses 240 WU on dash without thrust, once per encounter', () => {
  const harness = makeHarness(4242, ['unique_pale_coil_warp_drive']);
  harness.bus.emit('encounter:spawned', { encounterId: 'enc-blink' });
  harness.bus.emit('ship:dash', { shipId: harness.player.id });
  assert.equal(harness.player.pos.x, PALE_COIL_BLINK_DISTANCE);
  assert.equal(harness.player.pos.z, 0);
  assert.deepEqual(harness.player.vel, { x: 0, z: 0 });
  const blinks = harness.receipts.filter((r) => r.ev === 'blink');
  assert.equal(blinks.length, 1);
  assert.equal(blinks[0].distance, PALE_COIL_BLINK_DISTANCE);
  // A second dash in the same encounter spends nothing: the gap is crossed once.
  harness.bus.emit('ship:dash', { shipId: harness.player.id });
  assert.equal(harness.player.pos.x, PALE_COIL_BLINK_DISTANCE);
  assert.equal(harness.receipts.filter((r) => r.ev === 'blink').length, 1);
});

test('no fitted blink, no teleport', () => {
  const harness = makeHarness(4242, ['mod_engine_ion_m']);
  harness.bus.emit('encounter:spawned', { encounterId: 'enc-blink' });
  harness.bus.emit('ship:dash', { shipId: harness.player.id });
  assert.equal(harness.player.pos.x, 0);
  assert.equal(harness.receipts.length, 0);
});

test('an incoming missile is knocked back outward with homing killed', () => {
  const harness = makeHarness(8008, ['unique_choir_bell_aegis']);
  harness.bus.emit('encounter:spawned', { encounterId: 'enc-kb' });
  addEnemy(harness, 9);
  const missile = addMissile(harness, 20, harness.player.id);
  harness.bus.emit('entity:spawned', { entity: missile });
  assert.equal(missile.data.choirBellDeflected, true);
  assert.equal(missile.data.targetId, null);
  assert.equal(missile.data.turnRate, 0);
  const pulses = harness.receipts.filter((r) => r.ev === 'pulse');
  assert.equal(pulses.length, 1);
  // The impulse carries the missile away from the player at knockback speed or more.
  const toPlayer = {
    x: harness.player.pos.x - missile.pos.x,
    z: harness.player.pos.z - missile.pos.z,
  };
  const impulse = pulses[0].impulseVelocity;
  assert.ok(impulse.x * toPlayer.x + impulse.z * toPlayer.z < 0, 'impulse points away from the player');
  const outwardSpeed = Math.hypot(missile.vel.x + impulse.x, missile.vel.z + impulse.z);
  assert.ok(outwardSpeed >= CHOIR_BELL_KNOCKBACK_SPEED, `outward ${outwardSpeed}`);
  // A second missile in the same encounter is not deflected: one knockback per encounter.
  const second = addMissile(harness, 21, harness.player.id);
  harness.bus.emit('entity:spawned', { entity: second });
  assert.equal(second.data.choirBellDeflected, undefined);
  assert.equal(second.data.targetId, harness.player.id);
});

test('a missile not hunting the player is left alone', () => {
  const harness = makeHarness(8008, ['unique_choir_bell_aegis']);
  harness.bus.emit('encounter:spawned', { encounterId: 'enc-kb' });
  addEnemy(harness, 9);
  const missile = addMissile(harness, 20, 9);
  harness.bus.emit('entity:spawned', { entity: missile });
  assert.equal(missile.data.choirBellDeflected, undefined);
  assert.equal(harness.receipts.length, 0);
});
