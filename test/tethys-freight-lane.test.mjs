import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createFreightLaneDirector, FREIGHT_STRING_COUNT } from '../src/systems/freightLane.js';

test('Tethys sends physical freight in round one and retires it on retry', () => {
  const state = { simTime: 0, entityList: [], entities: new Map() };
  const bus = createBus();
  const retired = [];
  bus.on('entity:retired', p => retired.push(p));
  const director = createFreightLaneDirector({ state, bus, helpers: {
    spawnEntity(spec) {
      const body = { ...spec, id: state.entityList.length + 1, alive: true };
      state.entityList.push(body);
      state.entities.set(body.id, body);
      return body;
    },
  } });
  director.init();
  director.arm({ arenaId: 'tethys_hub', at: { x: 0, z: 0 }, installedAt: 0, wave: 1 });
  state.simTime = 8;
  director.update(1 / 60, state);
  assert.equal(state.entityList.length, FREIGHT_STRING_COUNT);
  assert.ok(state.entityList.every(body => body.type === 'container' && body.physicsBody.dynamic && body.data.masslineTetherable));
  director.teardown('retry');
  assert.ok(state.entityList.every(body => body.alive === false));
  assert.equal(retired.length, FREIGHT_STRING_COUNT);
  director.destroy();
});
import { createGameState } from '../src/core/gameState.js';

test('moving freight queries nearby indexed bodies without walking the entity store', () => {
  const state = createGameState(7), bus = createBus(), contacts = [];
  const target = { id: 100, type: 'asteroid', alive: true, collides: true, radius: 12, mass: 20,
    pos: { x: -400, z: 25 }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set(target.id, target); state.entityList.push(target);
  state.spatialHash.rebuild(state.entityList);
  state.entities.values = () => { throw new Error('whole entity store was scanned'); };
  let nextId = 200;
  const director = createFreightLaneDirector({ state, bus, helpers: { spawnEntity(spec) {
    const body = { ...spec, id: nextId++, alive: true };
    state.entities.set(body.id, body); state.entityList.push(body); return body;
  } } });
  bus.on('freight:contact', p => contacts.push(p));
  director.init();
  director.arm({ arenaId: 'tethys_hub', at: { x: 0, z: 0 }, installedAt: 0, wave: 1 });
  state.simTime = 8;
  director.update(1 / 60, state);
  assert.ok(contacts.some(p => p.targetId === target.id), 'large body overlaps the indexed container');
  director.destroy();
});
