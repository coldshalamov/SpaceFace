import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { travelLanes } from '../src/systems/travelLanes.js';

test('the lane owner retires ambient freighters on Crucible entry and holds them until exit', () => {
  const state = createGameState(7), bus = createBus();
  let id = 10;
  const helpers = { spawnEntity(spec) { const e = { ...spec, id: id++, alive: true }; state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(id) { state.entities.get(id).alive = false; } };
  const owner = Object.create(travelLanes);
  owner.init({ state, bus, helpers });
  const player = { id: 1, pos: { ...owner.geometry.from }, vel: { x: 0, z: 0 }, alive: true, type: 'ship' };
  state.playerId = 1; state.entities.set(1, player); state.entityList.push(player);
  owner._updateTraffic(state, player);
  const traffic = state.entityList.filter(e => e.data?.parentType === 'lane_traffic');
  assert.ok(traffic.length > 0);
  const other = helpers.spawnEntity({ type: 'freighter', data: { circuitEscort: true } });
  state.run = { kind: 'survival', phase: 'loadout' };
  bus.emit('run:started', { kind: 'survival' });
  assert.ok(traffic.every(e => !e.alive));
  assert.equal(other.alive, true);
  owner._updateTraffic(state, player);
  assert.equal(state.entityList.filter(e => e.alive && e.data?.parentType === 'lane_traffic').length, 0);
  state.run = { kind: null, phase: 'inactive' };
  owner._updateTraffic(state, player);
  assert.ok(state.entityList.some(e => e.alive && e.data?.parentType === 'lane_traffic'));
});
