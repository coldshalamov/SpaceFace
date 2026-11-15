import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';

test('station side events pause during a Crucible run and resume afterward', () => {
  const bus = createBus();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const station = { id: 50, type: 'station', alive: true, pos: { x: 80, z: 0 }, data: {} };
  const state = { mode: 'flight', simTime: 100, playerId: 1, entities: new Map([[1, player], [50, station]]),
    entityList: [player, station], meta: { seed: 7 }, world: { currentSectorId: 'sector_ceres_belt' },
    run: { kind: 'survival', phase: 'active' } };
  const events = [];
  bus.on('station:sideEvent', event => events.push(event));
  const owner = Object.create(stationSideEventDirector);
  owner.init({ state, bus, helpers: {} });
  state.stationSideEvents.anchorId = '50';
  state.stationSideEvents.pending.push({ eventId: 'scheduled', kind: 'cargo_tractor', stationId: '50',
    sectorId: 'sector_ceres_belt', path: 'docking-orbit', durationS: 40, budget: 0, bearing: 0, dueAt: 0 });
  owner.update(1, state);
  assert.equal(events.length, 0);
  assert.equal(state.stationSideEvents.pending.length, 1);
  state.run.phase = 'inactive';
  owner.update(1, state);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 'scheduled');
  owner.destroy();
});
