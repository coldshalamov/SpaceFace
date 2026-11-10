// SR-07: death, recovery, and focus loss leave the same ship. A line that named the
// player is cut when the hull dies, before a later teleport can inherit the joint.
// A living selected body stays selected. Held flight keys do not survive the wreck.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio } from '../src/audio/audioSystem.js';
import { input } from '../src/systems/input.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

function lineHarness(targetAlive = true) {
  const bus = createBus();
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, type: 'ship' };
  const rock = { id: 2, alive: targetAlive, pos: { x: 110, z: 0 }, vel: { x: 0, z: 0 }, type: 'asteroid' };
  const attachment = {
    id: 'att_1',
    state: 'active',
    ownerId: 1,
    targetId: 2,
    controllerId: null,
    defId: 'tether_standard',
  };
  const broken = [];
  const attachments = {
    get(id) { return attachment.id === id ? attachment : null; },
    listForEntity(id) {
      return attachment.state === 'active' && (attachment.ownerId === id || attachment.targetId === id)
        ? [attachment]
        : [];
    },
    listControlledBy(id) {
      return attachment.state === 'active' && attachment.controllerId === id ? [attachment] : [];
    },
    breakAttachment(row, reason, actorId) {
      row.state = 'broken';
      row.breakReason = reason;
      broken.push({ id: row.id, reason, actorId });
      bus.emit('tether:broken', {
        attachmentId: row.id,
        reason,
        ownerId: row.ownerId,
        targetId: row.targetId,
        actorId,
      });
      return { ok: true, attachment: row };
    },
  };
  const state = {
    playerId: 1,
    simTime: 12,
    tick: 720,
    mode: 'flight',
    player: {
      tether: { active: true, targetId: 2, strain: 0.4, attachmentId: 'att_1', phase: 'loaded' },
      targetId: 2,
    },
    entities: new Map([[1, player], [2, rock]]),
  };
  const registry = {
    get(name) {
      if (name === 'combat') return { kernel: { attachments } };
      return null;
    },
  };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: {}, registry });
  system._active = { attachmentId: 'att_1', targetId: 2 };
  return { bus, state, player, rock, attachment, broken, system };
}

test('player death cuts the live line before recovery and does not drop a living target', () => {
  const { bus, state, player, attachment, broken, system } = lineHarness(true);
  player.alive = false;
  bus.emit('player:death', { recoverable: true });
  assert.equal(attachment.state, 'broken');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].reason, 'endpoint_lost');
  assert.equal(state.player.tether.active, false);
  assert.equal(state.player.tether.targetId, null);
  assert.equal(state.player.targetId, 2, 'the rock is still there, so the selected work stays');
  assert.ok(system._noRelatchUntil >= state.simTime, 'death arms the same relatch cooldown a cut uses');

  player.alive = true;
  attachment.state = 'active';
  bus.emit('player:respawn', { stationId: 'station_helios' });
  assert.equal(attachment.state, 'broken', 'a line that survived the death frame is retired at the berth');
  assert.equal(state.player.tether.active, false);
});

test('player death drops a target that is already gone', () => {
  const { bus, state, player, attachment } = lineHarness(false);
  player.alive = false;
  bus.emit('player:death', { recoverable: true });
  assert.equal(attachment.state, 'broken');
  assert.equal(state.player.targetId, null);
});

test('save:loaded does not cut a line the restore is about to adopt', () => {
  const { bus, attachment, state } = lineHarness(true);
  bus.emit('save:loaded', {});
  assert.equal(attachment.state, 'active');
  assert.equal(state.player.targetId, 2);
});

test('death and respawn release held thrust, boost, and fire', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.input.moveZ = 1;
  state.input.moveX = 0.2;
  state.input.turnIntent = 0.5;
  state.input.boost = true;
  state.input.fire = true;
  state.input.brake = true;
  const bus = createBus();
  const host = Object.create(input);
  host.init({ state, bus, helpers: {} });
  host._keys.KeyW = true;
  host._keys.ShiftLeft = true;
  try {
    bus.emit('player:death', { recoverable: true });
    assert.equal(state.input.moveZ, 0);
    assert.equal(state.input.turnIntent, 0);
    assert.equal(state.input.boost, false);
    assert.equal(state.input.fire, false);
    assert.equal(state.input.brake, false);
    assert.equal(host._keys.KeyW, false);
    assert.equal(host._keys.ShiftLeft, false);

    state.input.boost = true;
    host._keys.ShiftLeft = true;
    bus.emit('player:respawn', {});
    assert.equal(state.input.boost, false);
    assert.equal(host._keys.ShiftLeft, false);
  } finally {
    host.destroy();
  }
});

test('a line left behind stays silent and a dead endpoint still snaps', () => {
  const plays = [];
  const host = Object.create(audio);
  host.play = (recipeId) => { plays.push(recipeId); return { recipeId }; };
  host.bus = { emit() {} };
  host.state = { tick: 40, playerId: 1, player: { tether: { active: false } } };
  host.rt = {};
  const bus = {
    handlers: Object.create(null),
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    emit(ev, p) { for (const fn of this.handlers[ev] || []) fn(p); },
  };
  host.init({ state: host.state, bus, helpers: {} });
  host.play = (recipeId) => { plays.push(recipeId); return { recipeId }; };
  plays.length = 0;
  for (const reason of ['sector_exit', 'accepted', 'flight_exit', 'cut', 'release']) {
    bus.emit('tether:broken', { reason });
    assert.equal(plays.includes('sfx.tetherSnap'), false, `${reason} must not snap`);
  }
  assert.equal(host.rt._masslinePlayerCutTick, 40);
  bus.emit('tether:broken', { reason: 'endpoint_lost' });
  assert.equal(plays.includes('sfx.tetherSnap'), true);
});
