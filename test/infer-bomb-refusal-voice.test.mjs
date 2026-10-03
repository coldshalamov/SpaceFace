// A refused bomb drop names the reason. A full sky is not a full bay, and other ships stay quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bombs, BOMB_TYPE } from '../src/systems/bombs.js';
import { BOMB_DRIFT } from '../src/data/bombs.js';

function bombOwnedBy(id, ownerId) {
  return { id, alive: true, type: BOMB_TYPE, data: { ownerId } };
}

function rig() {
  const events = [];
  const player = {
    id: 1, alive: true, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 }, radius: 8,
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 10,
    entities: new Map([[1, player]]),
    entityList: [],
    bombs: {
      cooldownUntil: 0,
      cooldowns: {},
      rack: { sockets: 1, cells: [{ id: 'bomb_frag', count: 1 }] },
      stock: {},
      selectedId: 'bomb_frag',
    },
  };
  const sys = Object.assign(Object.create(bombs), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _ownerCooldowns: new Map(),
    helpers: { spawnEntity() { throw new Error('a refusal must not spawn'); } },
  });
  return { sys, state, player, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('an unloaded payload, a cycling bay, a full bay, and a full field each say what they are', () => {
  const unloaded = rig();
  unloaded.sys.drop(unloaded.player, 'bomb_goo', unloaded.state);
  assert.deepEqual(texts(unloaded.events), ['That bomb is not loaded']);

  const cycling = rig();
  cycling.state.bombs.cooldownUntil = 40;
  cycling.sys.drop(cycling.player, 'bomb_frag', cycling.state);
  assert.deepEqual(texts(cycling.events), ['Bomb bay cycling']);

  const bay = rig();
  for (let i = 0; i < BOMB_DRIFT.maxActive; i++) bay.state.entityList.push(bombOwnedBy(10 + i, 1));
  bay.sys.drop(bay.player, 'bomb_frag', bay.state);
  assert.deepEqual(texts(bay.events), ['Bomb bay full — trigger armed ordnance or let its fuze finish.']);
  assert.equal(bay.events.find((event) => event.name === 'bombs:denied').payload.reason, 'bay_full');

  const field = rig();
  for (let i = 0; i < BOMB_DRIFT.maxWorldActive; i++) field.state.entityList.push(bombOwnedBy(100 + i, 9));
  field.sys.drop(field.player, 'bomb_frag', field.state);
  assert.deepEqual(texts(field.events), ['The field is full of armed ordnance — wait for one to finish']);
  assert.equal(field.events.find((event) => event.name === 'bombs:denied').payload.reason, 'world_full');
});

test('another ship cycling its bay does not speak', () => {
  const { sys, state, events } = rig();
  const npc = { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 }, radius: 8 };
  state.entities.set(2, npc);
  sys._ownerCooldowns.set(2, { cooldownUntil: 40, cooldowns: {} });
  assert.equal(sys.drop(npc, 'bomb_frag', state), null);
  assert.deepEqual(texts(events), []);
});
