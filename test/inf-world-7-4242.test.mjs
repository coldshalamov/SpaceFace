import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS } from '../src/data/sectors.js';
import {
  computeDiscoveredRoute,
  routeEdgeDist,
  routeInterdictChance,
  ROUTE_BASE_FUEL,
  DEFAULT_DRIVE,
} from '../src/systems/routePlanner.js';

const SEED = 4242;
const BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function legFuel(fromId, toId) {
  return Math.ceil(ROUTE_BASE_FUEL * routeEdgeDist(BY_ID.get(fromId), BY_ID.get(toId)) * DEFAULT_DRIVE.tierFuelMult);
}

function legRisk(toId) {
  return routeInterdictChance(BY_ID.get(toId), 'drive', DEFAULT_DRIVE);
}

test('4242: equal-fuel Ceres to Io prefers the quieter Tethys road', () => {
  const discovery = {};
  for (const sector of SECTORS) discovery[sector.id] = { discovered: true };
  const state = {
    meta: { seed: SEED },
    world: { currentSectorId: 'sector_ceres_belt', sectors: {}, discovery },
  };
  const viaTethys = legFuel('sector_ceres_belt', 'sector_tethys_junction')
    + legFuel('sector_tethys_junction', 'sector_io_reach');
  const viaPallas = legFuel('sector_ceres_belt', 'sector_pallas_drift')
    + legFuel('sector_pallas_drift', 'sector_io_reach');
  const tethysRisk = legRisk('sector_tethys_junction') + legRisk('sector_io_reach');
  const pallasRisk = legRisk('sector_pallas_drift') + legRisk('sector_io_reach');
  assert.equal(viaTethys, viaPallas);
  assert.ok(tethysRisk < pallasRisk);

  const route = computeDiscoveredRoute(state, 'sector_io_reach', 'fuel', {
    wormholeGate: () => 'closed',
  });
  assert.equal(state.meta.seed, SEED);
  assert.equal(route.totalFuel, 63);
  assert.equal(route.totalFuel, viaTethys);
  assert.deepEqual(route.legs.map((leg) => leg.to), ['sector_tethys_junction', 'sector_io_reach']);
  assert.ok(route.legs.every((leg) => leg.via === 'drive'));
});
