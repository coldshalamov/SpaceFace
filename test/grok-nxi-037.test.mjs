// NXI-037: a physicsBody:false proxy keeps its motion; a dynamic cargo body
// takes field drag; an ordinary heavy hull is not immune.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { bombs } from '../src/systems/bombs.js';

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
  const selectedId = 'bomb_goo';
  const rt = state.bombs;
  const def = BOMB_DEFS[selectedId];
  rt.rack.cells[0] = { id: selectedId, count: def.magazine };
  rt.selectedId = selectedId;
  return { state, system, player };
}

test('scripted proxies keep owner motion and dynamic cargo takes goo drag', () => {
  const { state, system } = boot();
  const trigger = {
    id: 10, type: 'ship', alive: true, team: 1, mass: 32, radius: 8,
    pos: { x: -13, z: 18 }, vel: { x: 0, z: 0 }, rot: 0,
  };
  const proxy = {
    id: 11, type: 'ship', alive: true, team: 0, mass: 40, radius: 8,
    physicsBody: false, pos: { x: 10, z: 0 }, vel: { x: 22, z: -4 }, rot: 0,
  };
  const cargo = {
    id: 12, type: 'payload', alive: true, team: 2, mass: 80, radius: 6,
    pos: { x: 16, z: 12 }, vel: { x: 40, z: 0 }, rot: 0,
    data: { payloadType: 'jettisoned_cargo' },
  };
  const heavy = {
    id: 13, type: 'ship', alive: true, team: 0, mass: 2400, radius: 22,
    pos: { x: 12, z: -18 }, vel: { x: 30, z: 6 }, rot: 0,
  };
  for (const body of [trigger, proxy, cargo, heavy]) {
    state.entities.set(body.id, body);
    state.entityList.push(body);
  }
  const proxyVel = { x: proxy.vel.x, z: proxy.vel.z };
  state.input.actions = { dropBomb: true };
  for (let i = 0; i < 80; i += 1) {
    state.simTime += DT;
    state.tick += 1;
    system.update(DT, state);
    state.input.actions.dropBomb = false;
  }
  const bomb = state.entityList.find((entity) => entity.type === 'bomb');
  assert.ok(bomb, 'the goo bomb dropped');
  assert.equal(bomb.data.phase, 'field');
  const proxyCommand = consumePhysicsCommand(proxy);
  const cargoCommand = consumePhysicsCommand(cargo);
  const heavyCommand = consumePhysicsCommand(heavy);
  assert.equal(proxyCommand, null);
  assert.equal(proxy.vel.x, proxyVel.x);
  assert.equal(proxy.vel.z, proxyVel.z);
  assert.equal(proxy.physicsBody, false);
  assert.ok(cargoCommand && cargoCommand.impulses && cargoCommand.impulses.length > 0,
    'dynamic cargo receives field drag');
  assert.ok(heavyCommand && heavyCommand.impulses && heavyCommand.impulses.length > 0,
    'an ordinary heavy hull is not immune to field drag');
});
