// SEED-SW-16 — the tap-dash grants a short grace window against damage packets.
//
// Focused deterministic harness (the charge-cells pattern): a real simulation with the combat
// service, the player hull, and the live damage router. The window is armed by the same
// ship:dash event the dash state machine already emits, rides the same flag + expiry sweep the
// undock grace uses, and only ever arms the player hull.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { ships, fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { DASH_IFRAME_S } from '../src/systems/combat.js';

const DT = 1 / 60;
let sim;

beforeEach(() => {
  sim = createSimulation({
    seed: 4242,
    runtimeConfig: { profileId: 'production' },
    systems: [ships, combat],
    updateOrder: [combat],
  });
  sim.registry.get('ships').newGame();
});

afterEach(() => {
  sim.registry.get('combat').kernel?.dispose?.();
  sim.dispose();
});

function spawnPlayer() {
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
  }));
  sim.state.playerId = player.id;
  return player;
}

function routePacket(targetId) {
  return sim.helpers.routeCombatDamage({
    attackerId: null,
    targetId,
    packet: { channels: { kinetic: 5 }, statuses: [] },
    origin: { kind: 'test' },
  });
}

test('the dash press arms a short window that rejects damage against the player', () => {
  const player = spawnPlayer();
  const { state, bus } = sim;
  assert.notEqual(routePacket(player.id).reason, 'target_invulnerable', 'no window before the dash');

  bus.emit('ship:dash', { shipId: player.id, impulse: 40 });
  assert.equal(player.flags.invuln, true, 'the dash arms the flag');
  assert.ok(Math.abs(player._invulnUntil - ((state.simTime || 0) + DASH_IFRAME_S)) < 1e-9);

  const refused = routePacket(player.id);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'target_invulnerable', 'a packet inside the window is rejected');
});

test('the window expires on its own through the ordinary invuln sweep', () => {
  const player = spawnPlayer();
  const { state, bus } = sim;
  bus.emit('ship:dash', { shipId: player.id, impulse: 40 });
  // The combat tick runs the generic `_invulnUntil` expiry; one full window plus a tick is past it.
  for (let i = 0; i < Math.ceil((DASH_IFRAME_S + DT) / DT); i++) sim.step(DT);
  assert.equal(player.flags.invuln, false, 'the sweep clears the expired window');
  assert.notEqual(routePacket(player.id).reason, 'target_invulnerable', 'hull takes damage again');
});

test('only the player hull is armed — a hostile craft gains nothing from the event', () => {
  const player = spawnPlayer();
  const raider = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: false, team: 1, pos: { x: 60, z: 0 }, rot: 0,
  }));
  sim.bus.emit('ship:dash', { shipId: raider.id, impulse: 40 });
  assert.notEqual(raider.flags && raider.flags.invuln, true, 'no i-frames for NPC craft');
  assert.notEqual(player.flags && player.flags.invuln, true, 'the player hull is untouched by another hull dash');
});
