import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { world } from '../src/systems/world.js';

function isolatedTick({ hull = 40, shield = 0, intensity = 0.5, dt = 1 } = {}) {
  const system = Object.create(world);
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    hull,
    hullMax: 100,
    shield,
    shieldMax: 40,
    flags: {},
  };
  const state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    world: {
      activeSector: {
        hazards: [{ center: { x: 0, z: 0 }, radius: 100, type: 'radiation', intensity }],
      },
    },
  };
  const events = [];
  system.state = state;
  system.bus = { emit(event, payload) { events.push({ event, payload }); } };
  system.registry = null;
  system.helpers = {};
  system._hazardSet = new Set();
  system._hazardNextSet = new Set();
  system._tickHazards(dt, state);
  return { player, events };
}

test('radiation drains shields before hull and can kill', () => {
  const shielded = isolatedTick({ hull: 40, shield: 10, intensity: 0.5, dt: 1 });
  assert.equal(shielded.player.hull, 40);
  assert.ok(shielded.player.shield < 10);
  assert.equal(shielded.player.alive, true);

  const lethal = isolatedTick({ hull: 2, shield: 0, intensity: 1, dt: 1 });
  assert.equal(lethal.player.hull, 0);
  assert.equal(lethal.player.alive, false);
  assert.equal(lethal.player.flags.defeated, true);
  assert.ok(lethal.events.some((row) => row.event === 'player:death'));
});

test('radiation through the combat kernel still respects shields and can defeat the player', () => {
  const sim = createSimulation({ seed: 11, systems: [combat, world] });
  const { state } = sim;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 8,
    hullMax: 40,
    shield: 6,
    shieldMax: 20,
  });
  state.playerId = player.id;
  const worldSys = sim.registry.get('world');
  worldSys._hazardSet = new Set();
  worldSys._hazardNextSet = new Set();
  state.world.activeSector = {
    hazards: [{ id: 'rad_belt', center: { x: 0, z: 0 }, radius: 100, type: 'radiation', intensity: 1 }],
  };

  worldSys._tickHazards(1, state);
  assert.ok(player.shield < 6, 'radiation must spend the shield pool first');
  assert.equal(player.alive, true);
  assert.ok(player.hull > 0);

  player.shield = 0;
  for (let i = 0; i < 40 && player.alive !== false; i += 1) {
    worldSys._tickHazards(1, state);
  }
  assert.equal(player.hull, 0);
  assert.equal(player.alive, false);
  assert.equal(player.flags && player.flags.defeated, true);
  sim.dispose();
});
