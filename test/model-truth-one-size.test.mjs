import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  flightPlaneToleranceWu,
  modelTruthBoltRadius,
  modelTruthMineSensorRadius,
  modelTruthNameplateHeight,
  modelTruthPipRadius,
  modelTruthPlaceDrawScale,
  modelTruthPlanarRadius,
  modelTruthRow,
  modelTruthRows,
} from '../src/data/modelTruth.js';

const weaponsSrc = readFileSync(resolve(import.meta.dirname, '../src/systems/weapons.js'), 'utf8');

test('a scale-1 place uses the same size as its skin', () => {
  const row = modelTruthRow('place_landmark_wreck_cathedral');
  assert.ok(row);
  const entity = {
    id: row.id,
    type: 'wreck',
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: row.gameplay.entityRadius,
    data: { placeId: row.id, placeScale: 1 },
  };
  const visual = modelTruthPlanarRadius(entity);
  const ref = row.gameplay.entityRadius || 1;
  const skin = row.shell.silhouetteRadius * (entity.radius / ref);
  const tol = flightPlaneToleranceWu(row.shell.silhouetteRadius);
  assert.ok(Math.abs(visual - skin) <= tol, `${visual} vs ${skin} tol ${tol}`);
  const scale = modelTruthPlaceDrawScale(entity);
  assert.ok(scale > 0);
  const doubled = { ...entity, radius: entity.radius * 2 };
  const doubledScale = modelTruthPlaceDrawScale(doubled);
  assert.ok(Math.abs(doubledScale / scale - 2) < 0.02);
});

test('bolts and mine sensors use the census size, and the other 1.6s stay', () => {
  const hitch = {
    type: 'ship',
    radius: 14,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel' },
  };
  const bolt = modelTruthBoltRadius(hitch);
  const sensor = modelTruthMineSensorRadius(hitch);
  assert.ok(bolt > 0 && bolt < modelTruthPlanarRadius(hitch));
  assert.ok(sensor > bolt);
  assert.equal(weaponsSrc.includes('radius: 0.7'), false);
  assert.equal(weaponsSrc.includes('radius: 1.6'), false);
  assert.equal(weaponsSrc.includes('WEAPON_VENT_DUMP = 1.6'), true);
  assert.equal(weaponsSrc.includes('Math.min(1.6,'), true);
  assert.ok(modelTruthNameplateHeight(hitch) > 0);
  assert.ok(modelTruthPipRadius(hitch) > 0);
  const cathedral = modelTruthRows().find((row) => row.id === 'place_landmark_wreck_cathedral');
  assert.equal(cathedral.gameplay.entityRadius > 0, true);
});
