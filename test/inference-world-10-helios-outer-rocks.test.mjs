import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';

test('WORLD-10: Helios outer rocks use a second existing asteroid type (ast_metallic), not the starter type', () => {
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.ok(helios, 'sector_helios_prime exists');

  const starterField = (helios.fields || []).find((f) => f.id === 'f_helios_starter');
  assert.ok(starterField, 'f_helios_starter exists in Helios');
  assert.equal(starterField.type, 'ast_common_rock', 'starter field remains ast_common_rock');

  const outerField = (helios.fields || []).find((f) => f.id === 'f_helios_outer');
  assert.ok(outerField, 'f_helios_outer exists in Helios');
  assert.notEqual(outerField.type, starterField.type, 'outer field must not be the same type as starter field');
  assert.equal(outerField.type, 'ast_metallic', 'outer field uses ast_metallic');
});

test('WORLD-10: On seed 4242, entering Helios spawns distinct rock types across starter and outer fields', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world] });
  const { state } = sim;
  state.mode = 'flight';

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;

  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(SIM_DT);

  const asteroids = state.entityList.filter((e) => e && e.alive !== false && e.type === 'asteroid');
  assert.ok(asteroids.length > 0, 'asteroids must spawn in Helios');

  const starterAsteroids = asteroids.filter((e) => e.data && e.data.fieldId === 'f_helios_starter');
  const outerAsteroids = asteroids.filter((e) => e.data && e.data.fieldId === 'f_helios_outer');

  assert.ok(starterAsteroids.length > 0, 'starter field asteroids must be spawned');
  assert.ok(outerAsteroids.length > 0, 'outer field asteroids must be spawned');

  for (const ast of starterAsteroids) {
    assert.equal(ast.data.typeId, 'ast_common_rock',
      'starter field asteroids must be ast_common_rock');
  }

  for (const ast of outerAsteroids) {
    assert.equal(ast.data.typeId, 'ast_metallic',
      'outer field asteroids must be ast_metallic');
  }
});
