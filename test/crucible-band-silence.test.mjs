import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { bandRadio } from '../src/systems/bandRadio.js';

test('a tuned sector band is silent during Crucible and resumes in Adventure', () => {
  const bus = createBus(), voices = [], beds = [];
  const state = { meta: { seed: 47 }, simTime: 0, mode: 'flight', ui: { docked: false },
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { id: 'sector_helios_prime', factionId: 'faction_scn', tier: 0, security: 0.98, stations: [] } } },
    factions: { faction_reach: { rep: 0 } }, run: { kind: 'survival', phase: 'active' } };
  const owner = Object.create(bandRadio);
  bus.on('band:bed', p => beds.push(p));
  owner.init({ state, bus, helpers: { voice: { say: p => { voices.push(p); return true; } } }, registry: { get: () => null } });
  owner.newGame();
  bus.emit('band:tune', { channelId: 'concord_bulletin' });
  owner.update(0, state);
  assert.equal(voices.length, 0);
  assert.equal(beds.at(-1)?.active, false);
  state.run.phase = 'inactive';
  owner.update(0, state);
  assert.equal(voices.length, 1);
  owner.destroy();
});
