import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';

function weaponHarness() {
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 20 / 60,
    playerId: null,
    player: {},
    input: {},
    combat: { beams: [] },
    entities: new Map(),
    entityList: [],
    entityIndex: { ships: [], weaponShips: [], projectiles: [] },
  };
  const system = Object.create(weapons);
  system.state = state;
  system.bus = { emit() {} };
  system.helpers = { getEntity: (id) => state.entities.get(id) || null };
  system._byId = new Map();
  system._beamFiring = new Set();
  system._beamFiringPrev = new Set();
  system._beamActiveMeta = new Map();
  system._rcsDisrupt = new WeakMap();
  system._npcCounterthrustRecovery = new WeakMap();
  system._attackLive = new Map();
  return { state, system };
}

test('weapons drops attack runtime records after their projectiles leave the entity graph', () => {
  const { state, system } = weaponHarness();
  system._attackLive.set('expired-projectile', { spec: {}, runtime: {} });
  system._attackLive.set('live-projectile', { spec: {}, runtime: {} });
  state.entities.set('live-projectile', { id: 'live-projectile', type: 'projectile', alive: true });

  system.update(1 / 60, state);

  assert.deepEqual([...system._attackLive.keys()], ['live-projectile']);
});
