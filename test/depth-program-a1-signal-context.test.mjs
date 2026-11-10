import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio } from '../src/systems/bandRadio.js';

test('live K1 presence strengthens its Band carrier only in the occupied sector', () => {
  const state = {
    meta: { seed: 47 }, simTime: 0, mode: 'flight', ui: { docked: false }, factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { factionId: 'faction_scn', security: 0.8, tier: 0, stations: [] } },
    },
    factionPresence: {
      active: {
        local: { sectorId: 'sector_helios_prime', factionId: 'faction_fulfillment' },
        remote: { sectorId: 'sector_pallas_drift', factionId: 'faction_quiet' },
      },
    },
  };
  const system = Object.create(bandRadio);
  system.init({ state, bus: createBus(), helpers: {}, registry: null });
  const context = system._signalContext();
  assert.deepEqual(context.presenceFactionIds, ['faction_fulfillment']);
  system.destroy();
});
