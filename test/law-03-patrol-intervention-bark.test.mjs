import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';

// LAW-03 — a patrol that spawns to take the player's fight announces itself: one lawful bark
// from the arriving hull per intervention, spoken in its faction's pursuit register.

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const said = [];
  const helpers = {
    voice: {
      say(payload) {
        said.push(payload);
        return true;
      },
    },
  };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, bus, player, system, said };
}

function spawnPatrol(h, x) {
  return h.helpers.spawnEntity({
    type: 'ship',
    pos: { x, z: 60 },
    vel: { x: 0, z: 0 },
    radius: 12, mass: 40, hull: 120, hullMax: 120, collides: true, team: 2,
    factionId: 'faction_scn',
    data: { ai: { lawful: true, passive: false }, combat: {} },
  });
}

test('LAW-03: a spawned patrol barks once in the lawful register on intervention', () => {
  const h = boot();
  const patrol = spawnPatrol(h, 420);
  const attacker = h.helpers.spawnEntity({
    type: 'ship', pos: { x: 300, z: 0 }, radius: 10, hull: 80, hullMax: 80, team: 1, data: {},
  });
  h.bus.emit('encounter:patrolIntervened', { patrolId: patrol.id, attackerId: attacker.id, t: 0 });

  const barks = h.said.filter((line) => line.channel === 'bark' && line.factionId === 'faction_scn');
  assert.equal(barks.length, 1, 'exactly one lawful bark for the intervention');
  assert.equal(barks[0].id, `barkDirector:${patrol.id}:law-intervention`);
  assert.ok(typeof barks[0].text === 'string' && barks[0].text.length > 0);
});

test('LAW-03: each intervention speaks once — a second patrol barks, the same patrol cannot repeat', () => {
  const h = boot();
  const first = spawnPatrol(h, 420);
  const second = spawnPatrol(h, 460);
  h.bus.emit('encounter:patrolIntervened', { patrolId: first.id, attackerId: 99, t: 0 });
  h.bus.emit('encounter:patrolIntervened', { patrolId: first.id, attackerId: 99, t: 1 });
  h.bus.emit('encounter:patrolIntervened', { patrolId: second.id, attackerId: 99, t: 2 });

  const barks = h.said.filter((line) => line.channel === 'bark');
  assert.equal(barks.length, 2, 'one bark per intervening hull, none repeated');
  assert.equal(barks[0].id, `barkDirector:${first.id}:law-intervention`);
  assert.equal(barks[1].id, `barkDirector:${second.id}:law-intervention`);
});

test('LAW-03: a dead or missing patrol id stays silent', () => {
  const h = boot();
  h.bus.emit('encounter:patrolIntervened', { patrolId: 98765, attackerId: 1, t: 0 });
  const patrol = spawnPatrol(h, 420);
  patrol.alive = false;
  h.bus.emit('encounter:patrolIntervened', { patrolId: patrol.id, attackerId: 1, t: 1 });
  assert.equal(h.said.length, 0, 'no bark without a live responder');
});
