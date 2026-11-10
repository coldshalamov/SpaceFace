import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createTensionDirectorSystem, readTensionSensors } from '../src/systems/tensionDirector.js';

const SEED = 4242;

test('4242: combat queued in Sker does not count as supply while the player is at Helios', () => {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 };
  const state = {
    meta: { seed: SEED },
    simTime: 0,
    mode: 'flight',
    playerId: player.id,
    player: { flags: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player]]),
    encounterDirector: {
      live: {},
      pending: [{ deck: 'combat', sectorId: 'sector_sker_haven', encounterId: 'sker-raid' }],
    },
  };
  const seen = readTensionSensors(state);
  assert.equal(state.meta.seed, SEED);
  assert.equal(seen.pendingCombat, 0);
  assert.equal(seen.nearbyCombat, 0);

  const bus = createBus();
  const starved = [];
  bus.on('tension:starved', (row) => starved.push(row));
  const director = createTensionDirectorSystem();
  director.init({ state, bus });
  for (let t = 1; t <= 240; t++) {
    state.simTime = t;
    director.update(1, state);
  }
  assert.ok(starved.length >= 1);
  assert.equal(starved[0].reason, 'no_combat_supply');
  assert.equal(starved[0].pendingCombat, 0);
  director.destroy();
});
