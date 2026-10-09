// WORLD-34 — a ghost-convoy rumour is one line at the nearest station bar.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  barGhostConvoyLines,
  installGhostConvoyBarListener,
} from '../src/ui/station/barContacts.js';

test('seed 4242 rumor:ghostConvoy adds one bar line at the nearest station', () => {
  const state = {
    meta: { seed: 4242 },
    simTime: 120,
    playerId: 1,
    entities: new Map(),
    ui: {},
    world: { currentSectorId: 'sector_helios_prime' },
  };
  state.entities.set(1, { id: 1, type: 'ship', pos: { x: 10, z: 0 }, alive: true });
  state.entities.set(2, {
    id: 2, type: 'station', pos: { x: 40, z: 0 }, alive: true,
    data: { stationId: 'station_near' },
  });
  state.entities.set(3, {
    id: 3, type: 'station', pos: { x: 4200, z: 80 }, alive: true,
    data: { stationId: 'station_far' },
  });
  const bus = createBus();
  installGhostConvoyBarListener(bus, state);
  const line = 'Ghost convoy rumor: 3 losses on the Helios Prime lane point to a Reach raider nest. Helios Station posted a bounty.';
  bus.emit('rumor:ghostConvoy', {
    line,
    sectorId: 'sector_helios_prime',
    laneKey: 'sector_helios_prime:faction_reach',
    x: 8800,
    z: -4400,
    offer: { storyTarget: { anchorId: 'nest_anchor', pos: { x: 8800, z: -4400 } } },
  });
  bus.emit('rumor:ghostConvoy', {
    line,
    sectorId: 'sector_helios_prime',
    laneKey: 'sector_helios_prime:faction_reach',
  });

  const near = barGhostConvoyLines(state, 'station_near');
  const far = barGhostConvoyLines(state, 'station_far');
  assert.equal(near.length, 1);
  assert.equal(far.length, 0);
  assert.equal(near[0].text, line);
  assert.equal(near[0].stationId, 'station_near');
  assert.equal(near[0].pos, undefined);
  assert.equal(near[0].anchorId, undefined);
  assert.equal(near[0].text.includes('8800'), false);
  assert.equal(near[0].text.includes('nest_anchor'), false);
});
