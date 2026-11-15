import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createFreightLaneDirector, FREIGHT_FIRST_DEPART_S, FREIGHT_STRING_COUNT } from '../src/systems/freightLane.js';

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
  state.simTime = FREIGHT_FIRST_DEPART_S;
  director.update(1 / 60, state);
  assert.equal(state.entityList.length, FREIGHT_STRING_COUNT);
  assert.ok(state.entityList.every(body => body.type === 'container' && body.physicsBody.dynamic && body.data.masslineTetherable));
  director.teardown('retry');
  assert.ok(state.entityList.every(body => body.alive === false));
  assert.equal(retired.length, FREIGHT_STRING_COUNT);
  director.destroy();
});
