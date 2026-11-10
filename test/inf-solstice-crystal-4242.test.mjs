// Scooping a Solstice bloom crystal puts two Phosphor Crystals in the hold. Seed 4242.
// Bloom timing, the floating name, and the two-unit drop stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { prismFocalGoal } from '../src/characters/solsticeRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SOLSTICE as C, freshSolsticeMemory } from '../src/data/solstice.js';
import { cargo } from '../src/systems/cargo.js';
import { createSolstice, SOLSTICE_GLOBAL_ANCHOR } from '../src/systems/solstice.js';

test('scooping a Solstice bloom crystal puts two Phosphor Crystals in the hold', () => {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.world.currentSectorId = C.sectorId;
  state.solstice = freshSolsticeMemory();
  state.combat.attachments = { byId: {} };

  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = makeEntity({ ...spec, id });
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
      const index = state.entityList.findIndex((entry) => entry.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };

  const player = helpers.spawnEntity({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: SOLSTICE_GLOBAL_ANCHOR.x + 80, z: SOLSTICE_GLOBAL_ANCHOR.z + 80 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 4,
    mass: 18,
    hull: 100,
    hullMax: 100,
    flags: {},
  });
  state.playerId = player.id;

  const system = createSolstice();
  system.init({ state, bus, helpers });

  const step = (dt = 1 / 60) => {
    state.simTime += dt;
    state.tick += 1;
    system.update(dt);
    for (const entity of state.entityList) {
      const command = consumePhysicsCommand(entity);
      if (command && command.impulses) {
        for (const impulse of command.impulses) {
          const mass = entity.physicsBody?.mass ?? entity.mass ?? 1;
          entity.vel.x += impulse.x / mass;
          entity.vel.z += impulse.z / mass;
        }
      }
      entity.pos.x += (entity.vel.x || 0) * dt;
      entity.pos.z += (entity.vel.z || 0) * dt;
    }
  };

  const steps = Math.ceil((C.bloomHoldTime + 0.2) * 60);
  for (let s = 0; s < steps; s++) {
    const core = system._core();
    assert.ok(core, 'the Solstice core is in the sector');
    for (let i = 0; i < 3; i++) {
      const prism = system._entity(system._prisms[i]);
      const goal = prismFocalGoal(i, system._beamAngle, core.pos);
      prism.pos.x = goal.x;
      prism.pos.z = goal.z;
      prism.vel.x = 0;
      prism.vel.z = 0;
    }
    step();
  }

  const crystal = state.entityList.find((entity) => entity.type === 'pickup' && entity.name === 'Resonant Light Crystal');
  assert.ok(crystal, 'the bloom dropped a light crystal');
  assert.equal(crystal.data.amount, 2);
  assert.equal(state.player.cargo.items.cmdty_crystal_lumin || 0, 0);

  cargo.init({ state, bus });
  player.pos.x = crystal.pos.x;
  player.pos.z = crystal.pos.z;
  player.vel.x = 0;
  player.vel.z = 0;
  const owner = { _diag: { pickupCollections: 0 } };
  const collected = physics._applyPickupCollection.call(owner, crystal, player, bus, state);

  const phosphor = COMMODITIES.find((row) => row.id === 'cmdty_crystal_lumin');
  assert.equal(phosphor.name, 'Phosphor Crystal');
  assert.equal(collected, true, 'the ship scooped the crystal');
  assert.equal(state.player.cargo.items.cmdty_crystal_lumin, 2);
  assert.equal(crystal.alive, false);

  system.destroy();
});
