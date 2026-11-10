// SFQ-B034 — a dropped bomb keeps the hull's velocity. Already the drop law;
// this pins it on seed 4242 (the older bombs suite uses seed 47).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { bombs } from '../src/systems/bombs.js';

const SEED = 4242;
const DT = 1 / 60;
// Chosen vector for the 4242 case. Inheritance is a copy, not a roll.
const VX = 42;
const VZ = -24;

test('seed 4242: the dropped trap inherits the owner velocity on both axes', () => {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0.4,
    pos: { x: 10, z: -6 }, vel: { x: VX, z: VZ },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const dropped = [];
  bus.on('bombs:dropped', (p) => dropped.push(p));
  let nextId = 50;
  const system = Object.create(bombs);
  system.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
      routeCombatDamage() { return { ok: true }; },
      combatPhysics: { applyImpulse() { return true; } },
    },
  });
  const selectedId = 'bomb_frag';
  const rt = state.bombs;
  rt.rack.cells[0] = { id: selectedId, count: BOMB_DEFS[selectedId].magazine };
  rt.selectedId = selectedId;
  state.input.actions = { dropBomb: true };
  state.simTime += DT;
  state.tick += 1;
  system.update(DT, state);

  assert.equal(state.meta && state.meta.seed, SEED);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].vel.x, VX);
  assert.equal(dropped[0].vel.z, VZ);
  const bomb = state.entities.get(dropped[0].bombId);
  assert.equal(bomb.vel.x, VX);
  assert.equal(bomb.vel.z, VZ);
  assert.equal(bomb.pos.x === player.pos.x && bomb.pos.z === player.pos.z, false,
    'the trap is laid behind the hull, not spawned at rest on top of it');
  bus.clear();
});
