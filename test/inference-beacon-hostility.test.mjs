import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { beacons, BEACON_TTL } from '../src/systems/beacons.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight'; state.playerId = 1; state.player.credits = 1000;
  const bus = createBus();
  const system = Object.create(beacons);
  const add = (id, team, ai = {}, x = 500) => {
    const e = { id, type: 'ship', alive: true, team, pos: { x, z: 0 }, rot: 0,
      data: { ai, intent: { moveZ: 0.4, moveX: 0.2, aimAngle: 1, fire: true } } };
    state.entities.set(id, e); state.entityList.push(e); return e;
  };
  const player = add(1, 0, {}, 0);
  system.init({ state, bus, helpers: {} });
  bus.emit('beacon:deploy');
  return { state, bus, system, add, player, b: state.beacons[0] };
}

for (const [name, team, ai] of [
  ['civilian hauler', 2, { passive: true }],
  ['clean lawful patrol', 1, { lawful: true }],
  ['passive combat-spawned trader', 1, { passive: true }],
  ['wingman', 0, {}],
]) {
  test(`beacon leaves ${name}'s job and intent alone, and expires without a skirmish`, () => {
    const h = boot();
    try {
      const actor = h.add(2, team, ai);
      const before = structuredClone(actor.data.intent);
      h.system.update(1 / 60, h.state);
      assert.deepEqual(actor.data.intent, before, 'not a hostile: its job must not be hijacked');
      h.state.simTime = BEACON_TTL + 1;
      h.system.update(1 / 60, h.state);
      assert.equal(h.state.beacons.length, 0, 'neutral presence cannot prolong a fake skirmish');
    } finally { h.system.destroy(); }
  });
}

test('raider is lured and holds the beacon; a player-engager inside the guard stays untouched', () => {
  const h = boot();
  try {
    const raider = h.add(2, 1, { archetype: 'pirate' });
    const close = h.add(3, 1, { archetype: 'pirate' }, 100);
    const closeIntent = structuredClone(close.data.intent);
    h.system.update(1 / 60, h.state);
    assert.equal(raider.data.intent.moveZ, -1);
    assert.equal(raider.data.intent.fire, false);
    assert.deepEqual(close.data.intent, closeIntent);
    h.state.simTime = BEACON_TTL + 1;
    h.system.update(1 / 60, h.state);
    assert.equal(h.state.beacons.length, 1);
    assert.equal(h.b.heldOnce, true);
  } finally { h.system.destroy(); }
});

test('an explicit patrol incident is lureable, but a cleared incident stops extending it', () => {
  const h = boot();
  try {
    const patrol = h.add(2, 1, { lawful: true, securityTargetId: h.player.id });
    h.system.update(1 / 60, h.state);
    assert.equal(patrol.data.intent.moveZ, -1);
    delete patrol.data.ai.securityTargetId;
    patrol.data.intent = { moveZ: 0.7, fire: false };
    h.system.update(1 / 60, h.state);
    assert.equal(patrol.data.intent.moveZ, 0.7, 'read current incident, not cached team hostility');
    h.state.simTime = BEACON_TTL + 1;
    h.system.update(1 / 60, h.state);
    assert.equal(h.state.beacons.length, 0);
  } finally { h.system.destroy(); }
});
