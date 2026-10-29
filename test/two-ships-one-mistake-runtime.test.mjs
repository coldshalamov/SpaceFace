import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { TWO_SHIPS_ONE_MISTAKE_RUNTIME as runtime } from '../src/systems/twoShipsOneMistakeRuntime.js';

test('external retirement releases the adhesive-film toast observer', () => {
  const bus = createBus();
  const state = {
    world: {
      activeSector: {
        stations: [{ name: 'Tethys Hub', pos: { x: 100, z: 0 } }],
      },
    },
    story: { flags: {} },
  };
  const live = {
    id: 'mistake-retire-test',
    shapeId: 'two_ships_one_mistake',
    shape: { primaryLine: 'The pair is waiting.' },
    vars: {},
  };
  const d = {
    bus,
    now: () => 0,
    player: () => ({ pos: { x: 0, z: 0 } }),
    say() {},
    offerChoices() {},
    stationsInSector: () => [],
  };

  runtime.fire(d, live, state);
  assert.equal(bus._listeners.get('toast')?.size, 1);

  runtime.retire(d, live, state, 'sector_exit');
  assert.equal(bus._listeners.get('toast')?.size || 0, 0);
  bus.clear();
});
