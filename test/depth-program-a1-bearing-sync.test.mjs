import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio, numbersBearingDue } from '../src/systems/bandRadio.js';

test('a synchronous canonical bearing resolver owns the next available Band line', () => {
  const bus = createBus();
  const voices = [];
  const state = {
    meta: { seed: 9001 }, simTime: 0, mode: 'flight', ui: { docked: false }, factions: {},
    world: { currentSectorId: 'sector_pallas_drift', sectors: {
      sector_pallas_drift: { factionId: 'faction_quiet', tier: 3, security: 0.4, stations: [] },
    } },
  };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers: { voice: { say(row) { voices.push(row); return true; } } }, registry: null });
  system.newGame();
  bus.emit('band:tune', { channelId: 'numbers_station' });
  system.update(0, state);
  voices.length = 0;

  let sequence = 0;
  while (!numbersBearingDue(state.meta.seed, sequence) && sequence < 10000) sequence += 1;
  state.bandRadio.sequence = sequence;
  state.bandRadio.identPending = false;
  state.bandRadio.nextLineAtS = 0;
  state.simTime = 40;
  bus.on('band:bearingRequest', ({ requestId }) => bus.emit('band:bearingResolved', {
    requestId, canonical: true, wreckId: 'wreck_real_adapter', sourceRef: 'uniqueWrecks:wreck_real_adapter',
    sectorId: 'sector_pallas_drift', bearingLabel: '044-218',
  }));

  system.update(40, state);
  assert.equal(state.bandRadio.nextLineAtS, 40);
  assert.ok(state.bandRadio.pendingBearingAnnouncement);
  system.update(0, state);
  assert.equal(voices.filter((row) => row.text.includes('044-218')).length, 1);
  system.destroy();
});
