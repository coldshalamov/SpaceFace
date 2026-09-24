import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import {
  WEATHER_VOLUMES,
  WEATHER_SECTOR_IDS,
  VESTA_WEATHER_SECTOR_ID,
  pointInsideWeatherVolume,
} from '../src/data/environmentalMachinery.js';

// WORLD-19: Vesta's slag hazard and its radiation weather occupy the same neighbourhood.
// Done condition: The hazard center sits inside that weather radius.
// Guard: Do not add a third weather sector.

test('WORLD-19: Vesta radiation hazard center sits inside vesta_radiation_belt weather radius', () => {
  const vesta = SECTORS.find((s) => s.id === 'sector_vesta_forge');
  assert.ok(vesta, 'sector_vesta_forge must exist');

  const radiationHazard = (vesta.hazards || []).find((h) => h.type === 'radiation');
  assert.ok(radiationHazard, 'Vesta must have a radiation hazard');
  assert.ok(radiationHazard.center, 'Vesta radiation hazard must define a center');

  const belt = WEATHER_VOLUMES.find((v) => v.id === 'vesta_radiation_belt');
  assert.ok(belt, 'vesta_radiation_belt weather volume must exist');
  assert.equal(belt.sectorId, VESTA_WEATHER_SECTOR_ID, 'belt must belong to Vesta Forge');

  const dx = radiationHazard.center.x - belt.localPos.x;
  const dz = radiationHazard.center.z - belt.localPos.z;
  const distance = Math.hypot(dx, dz);

  assert.ok(
    distance < belt.field.radius,
    `hazard center (${radiationHazard.center.x}, ${radiationHazard.center.z}) must sit inside weather radius (${belt.field.radius}), got distance ${distance.toFixed(1)}`,
  );
});

test('WORLD-19: weather sectors remain exactly two (Veil and Vesta)', () => {
  assert.equal(WEATHER_SECTOR_IDS.size, 2, 'no third weather sector may be added');
  assert.ok(WEATHER_SECTOR_IDS.has('sector_vesta_forge'), 'Vesta remains a weather sector');
  assert.ok(WEATHER_SECTOR_IDS.has('sector_veil_nebula'), 'Veil remains a weather sector');
});
