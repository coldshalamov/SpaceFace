import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS } from '../src/data/sectors.js';
import { computeDiscoveredRoute } from '../src/systems/routePlanner.js';

const SEED = 4242;

function routeState(from) {
  const discovery = {};
  for (const sector of SECTORS) discovery[sector.id] = { discovered: true };
  return {
    meta: { seed: SEED },
    world: { currentSectorId: from, sectors: {}, discovery },
  };
}

test('4242: the open Veil wormhole is scored as a gate, under the watched line', () => {
  const state = routeState('sector_veil_nebula');
  const open = computeDiscoveredRoute(state, 'sector_ashfall_reach', 'fuel', {
    wormholeGate: () => 'open',
  });
  const closed = computeDiscoveredRoute(state, 'sector_ashfall_reach', 'fuel', {
    wormholeGate: () => 'closed',
  });
  assert.equal(state.meta.seed, SEED);
  assert.equal(open.totalHops, 1);
  assert.equal(open.totalFuel, 0);
  assert.equal(open.legs[0].via, 'gate');
  assert.equal(open.legs[0].to, 'sector_ashfall_reach');
  assert.equal(open.legs[0].interdict, 0.15);
  assert.ok(open.legs[0].interdict <= 0.25);
  assert.ok(closed.totalHops > 1);
  assert.ok(closed.totalFuel > open.totalFuel);
  assert.ok(closed.legs.every((leg) => leg.via === 'drive'));
});
