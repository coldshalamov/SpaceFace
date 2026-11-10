import assert from 'node:assert/strict';
import test from 'node:test';

import { getDerivedStats } from '../src/systems/ships.js';

const PLAYER = Object.freeze({
  efficiencyMods: Object.freeze({
    miningYieldMult: 1,
    shieldRegenMult: 1,
    energyRegenMult: 1,
    cargoCapMult: 1,
    tradeFeeMult: 1,
  }),
});

function flight(shipId) {
  return getDerivedStats(shipId, [], PLAYER).flightModel;
}

test('capital role lattice preserves a readable turn hierarchy', () => {
  const atlas = flight('ship_atlas');
  const warden = flight('ship_warden');
  const colossus = flight('ship_colossus');
  const leviathan = flight('ship_leviathan');

  assert.ok(colossus.angularAccel < atlas.angularAccel,
    'the planted battlecruiser should begin turning more slowly than the heavy hauler');
  assert.ok(colossus.maxYawRate < atlas.maxYawRate,
    'the planted battlecruiser should have a lower yaw ceiling than the heavy hauler');
  assert.ok(colossus.mainAccel < atlas.mainAccel,
    'the planted battlecruiser should accelerate more slowly than the heavy hauler');
  assert.ok(colossus.inertia > atlas.inertia,
    'the planted battlecruiser should resist rotation more than the heavy hauler');

  assert.ok(warden.angularAccel > colossus.angularAccel && warden.maxYawRate > colossus.maxYawRate,
    'the lane gunship remains the agile capital-class combat hull');
  assert.ok(leviathan.angularAccel < colossus.angularAccel && leviathan.maxYawRate < colossus.maxYawRate,
    'the flagship remains the slowest-turning capital hull');
  assert.ok(leviathan.inertia > colossus.inertia,
    'the flagship remains the most rotationally stable capital hull');

  assert.deepEqual(flight('ship_colossus'), colossus, 'derived flight ordering is deterministic');
});
