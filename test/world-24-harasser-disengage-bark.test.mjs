import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';

// WORLD-24 — a harasser that mercy-disengages says so as it leaves: one departing bark per
// disengage, from the attacker hull, in the flee register.

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

function spawnHarasser(h, x) {
  return h.helpers.spawnEntity({
    type: 'ship',
    pos: { x, z: 40 },
    vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 60, hullMax: 60, collides: true, team: 1,
    factionId: 'faction_reach',
    data: { ai: { passive: false }, combat: {} },
  });
}

test('WORLD-24: harasser:disengaged produces one departing bark from the attacker', () => {
  const h = boot();
  const harasser = spawnHarasser(h, 200);
  h.bus.emit('harasser:disengaged', {
    attackerId: harasser.id, targetId: h.player.id, encounterId: null,
    pinnedS: 420, totalDamage: 0, strikes: 1, sectorId: 'sec_helios', t: 0,
  });
  const barks = h.said.filter((line) => line.channel === 'bark');
  assert.equal(barks.length, 1, 'exactly one bark for the disengage');
  assert.equal(barks[0].id, `barkDirector:${harasser.id}:flee`);
  assert.equal(barks[0].factionId, 'faction_reach');
});

test('WORLD-24: one bark per disengage — a stale re-emit cannot double the departure line', () => {
  const h = boot();
  const harasser = spawnHarasser(h, 200);
  const payload = {
    attackerId: harasser.id, targetId: h.player.id, encounterId: null,
    pinnedS: 420, totalDamage: 0, strikes: 1, sectorId: 'sec_helios', t: 0,
  };
  h.bus.emit('harasser:disengaged', payload);
  h.bus.emit('harasser:disengaged', { ...payload, strikes: 2, t: 600 });
  const barks = h.said.filter((line) => line.channel === 'bark');
  assert.equal(barks.length, 1, 'the hull already said its exit line');
});

test('WORLD-24: a missing attacker id stays silent', () => {
  const h = boot();
  h.bus.emit('harasser:disengaged', {
    attackerId: 98765, targetId: h.player.id, encounterId: null,
    pinnedS: 420, totalDamage: 0, strikes: 1, sectorId: 'sec_helios', t: 0,
  });
  assert.equal(h.said.length, 0);
});
