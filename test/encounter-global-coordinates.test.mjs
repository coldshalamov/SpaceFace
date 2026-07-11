import test from 'node:test';
import assert from 'node:assert/strict';

import { planEncounterShape } from '../src/systems/encounterDirector.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

const SHAPE = Object.freeze({
  id: 'm2_global_probe',
  script: 'pirateAmbush',
  tier: 'minor',
  deck: 'combat',
  factionId: 'faction_reach_coalition',
  context: 'pirate',
  squad: Object.freeze({
    archetypes: Object.freeze(['raider']),
    size: Object.freeze([1, 1]),
  }),
});

const LOCAL_ZONE = Object.freeze({
  id: 'zone_m2_global_probe',
  name: 'M2 Global Probe',
  type: 'hazard',
  center: Object.freeze({ x: 320, z: -180 }),
  radius: 240,
  dangerTier: 2,
});

function fixedRng() {
  return 0.5;
}

for (const sectorId of [HELIOS, CERES, TETHYS]) {
  test(`encounter planner composes ${sectorId} local zone anchors into global spawn space`, () => {
    const item = planEncounterShape(SHAPE, LOCAL_ZONE, sectorId, 0, 0, fixedRng);
    const origin = sectorGlobalOrigin(sectorId);
    const expectedCenter = {
      x: origin.x + LOCAL_ZONE.center.x,
      z: origin.z + LOCAL_ZONE.center.z,
    };

    assert.deepEqual(item.zoneCenter, expectedCenter);
    assert.equal(item.ships.length, 1);

    const spawn = item.ships[0].pos;
    const dx = spawn.x - expectedCenter.x;
    const dz = spawn.z - expectedCenter.z;
    assert.ok(dx * dx + dz * dz <= LOCAL_ZONE.radius * LOCAL_ZONE.radius);

    if (sectorId === HELIOS) {
      assert.deepEqual(item.zoneCenter, LOCAL_ZONE.center, 'Helios origin-zero path remains identity');
    } else {
      assert.notDeepEqual(item.zoneCenter, LOCAL_ZONE.center, 'off-origin sectors must not leak local anchors');
    }
  });
}
