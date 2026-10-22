import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createTensionDirectorSystem, readTensionSensors } from '../src/systems/tensionDirector.js';

const SEED = 4242;

function fightState() {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 };
  const entities = new Map([[player.id, player]]);
  const live = {};
  for (let i = 0; i < 20; i++) {
    live[`log-${i}`] = { phase: 'done', deck: 'combat', sectorId: 'sector_io_reach', ids: [900 + i] };
    live[`civ-${i}`] = { phase: 'active', deck: 'civilian', sectorId: 'sector_io_reach', ids: [800 + i] };
    live[`far-${i}`] = { phase: 'active', deck: 'combat', sectorId: 'sector_sker_haven', ids: [700 + i] };
  }
  const ids = [];
  for (let i = 0; i < 17; i++) {
    const id = 10 + i;
    ids.push(id);
    entities.set(id, { id, alive: true, pos: { x: 30, z: 0 } });
  }
  live.fight = { phase: 'active', deck: 'combat', sectorId: 'sector_io_reach', ids };
  return {
    meta: { seed: SEED },
    simTime: 0,
    mode: 'flight',
    playerId: player.id,
    player: { flags: {} },
    world: { currentSectorId: 'sector_io_reach' },
    entities,
    encounterDirector: { live, pending: [] },
  };
}

test('4242: a live Io fight still lets the director call violence after the quiet minute', () => {
  const state = fightState();
  const seen = readTensionSensors(state);
  assert.equal(state.meta.seed, SEED);
  assert.ok(seen.nearbyCombat >= 1);
  assert.equal(seen.scanTruncated, false);

  const bus = createBus();
  const policies = [];
  bus.on('tension:policy', (policy) => policies.push(policy));
  const director = createTensionDirectorSystem();
  director.init({ state, bus });
  for (let t = 1; t <= 80; t++) {
    state.simTime = t;
    director.update(1, state);
  }
  const policy = policies.at(-1);
  assert.equal(policy.phase, 'peak');
  assert.equal(policy.allowCombat, true);
  assert.equal(policy.rhythmPhase, 'violence');
  director.destroy();
});
