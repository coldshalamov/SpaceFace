import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  chartMarkSizes,
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
import { buildLocalModel } from '../src/ui/galaxyMap.js';

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
  const player = {
    id: 'player',
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    team: 0,
    data: { defId: 'ship_kestrel' },
  };
  const contactShip = {
    id: 'hitch',
    type: 'ship',
    alive: true,
    pos: { x: 40, z: -12 },
    vel: { x: 0, z: 0 },
    rot: 0.2,
    radius: 14,
    team: 1,
    data: { defId: 'ship_kestrel', name: 'Hitch' },
  };
  const state = {
    playerId: 'player',
    player: { id: 'player' },
    entities: new Map([['player', player], ['hitch', contactShip]]),
    entityList: [player, contactShip],
  };
  const model = buildLocalModel(state, () => false);
  const contact = model.contacts.find((row) => row.id === 'hitch');
  assert.ok(contact && contact.defId === 'ship_kestrel');
  const pxPerWu = 8;
  const mark = chartMarkSizes(contact, pxPerWu);
  assert.equal(mark.pipPx, modelTruthPipRadius(contactShip) * pxPerWu);
  assert.equal(mark.nameplatePx, modelTruthNameplateHeight(contactShip) * pxPerWu);
  const galaxy = readFileSync(resolve(import.meta.dirname, '../src/ui/galaxyMap.js'), 'utf8');
  const local = readFileSync(resolve(import.meta.dirname, '../src/ui/screens/localmap.js'), 'utf8');
  assert.match(galaxy, /chartMarkSizes\(p, pxPerWU\)/);
  assert.match(galaxy, /chartMarkSizes\(c, baseScale \* cam\.zoom\)/);
  assert.match(galaxy, /pointMark\.nameplatePx/);
  assert.match(galaxy, /contactMark\.nameplatePx/);
  assert.match(local, /chartMarkSizes\(c, scale\)/);
  assert.match(local, /contactMark\.nameplatePx/);
  assert.equal(galaxy.includes('radiusPx: 18, kind: p.kind'), false);
  assert.equal(local.includes('radiusPx: isAsteroid ? 12 : 16'), false);
  const cathedral = modelTruthRows().find((row) => row.id === 'place_landmark_wreck_cathedral');
  assert.equal(cathedral.gameplay.entityRadius > 0, true);
});
