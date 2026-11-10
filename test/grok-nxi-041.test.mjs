// NXI-041: an armed bomb and a spent remnant do not advertise the same
// available interaction. The fuze clock is not extended.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { bombs, syncBombTargetInteraction } from '../src/systems/bombs.js';

const DT = 1 / 60;
const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 0;
  state.tick = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage() { return { ok: true }; },
    combatPhysics: { applyImpulse() { return true; } },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });
  const selectedId = 'bomb_frag';
  const rt = state.bombs;
  const def = BOMB_DEFS[selectedId];
  rt.rack.cells[0] = { id: selectedId, count: def.magazine };
  rt.selectedId = selectedId;
  return { state, system };
}

test('armed and spent bombs advertise different available interactions', () => {
  const { state, system } = boot();
  state.input.actions = { dropBomb: true };
  state.simTime += DT;
  state.tick += 1;
  system.update(DT, state);
  state.input.actions.dropBomb = false;
  const bomb = state.entityList.find((entity) => entity.type === 'bomb');
  assert.ok(bomb);
  const detonateAt = bomb.data.detonateAt;
  const fieldEndsAt = bomb.data.fieldEndsAt;
  assert.equal(bomb.data.interaction && bomb.data.interaction.available, 'arming');
  for (let i = 0; i < 40; i += 1) {
    state.simTime += DT;
    state.tick += 1;
    system.update(DT, state);
    if (bomb.data.armed === true) break;
  }
  assert.equal(bomb.data.armed, true);
  assert.equal(bomb.data.phase, 'drift');
  assert.equal(bomb.data.interaction.available, 'armed');
  assert.equal(bomb.data.interaction.state, 'armed');
  bomb.data.phase = 'field';
  syncBombTargetInteraction(bomb);
  assert.equal(bomb.data.interaction.available, null);
  assert.equal(bomb.data.interaction.state, 'field');
  assert.equal(bomb.data.lockable, false);
  bomb.data.phase = 'drift';
  syncBombTargetInteraction(bomb);
  assert.equal(bomb.data.detonateAt, detonateAt);
  assert.equal(bomb.data.fieldEndsAt, fieldEndsAt);
  assert.equal(system.retire(bomb, 'projectile', state), true);
  assert.equal(bomb.data.phase, 'spent');
  assert.equal(bomb.data.interaction.state, 'spent');
  assert.equal(bomb.data.interaction.available, null);
  assert.notEqual(bomb.data.interaction.available, 'armed');
  assert.equal(bomb.data.detonateAt, detonateAt, 'retiring the casing does not extend the fuze');
  assert.equal(bomb.data.fieldEndsAt, fieldEndsAt);
});
