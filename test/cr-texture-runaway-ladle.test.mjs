// CR-TEXTURE — one ropeable set piece at Vesta Forge: a foundry slag ladle that slipped its
// crane and now sits on the foundry approach, tetherable like the Long Berth tug but heavier.
// The assertions pin what the slice's done-when names: the record exists in Vesta, anchored on
// Forge Foundry, packaged as existing industrial art, physically ropeable, and standing clear
// of every authored Vesta hazard the data knows about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { VESTA_ORE_WINNOW } from '../src/data/environmentalMachinery.js';
import { VESTA_FREIGHTER_POCKET_ORIGIN } from '../src/data/opticStructures.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import { world } from '../src/systems/world.js';

const SECTOR_ID = 'sector_vesta_forge';
const SECTOR = SECTORS.find((row) => row.id === SECTOR_ID);
const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));
const RECORD = WORLD_ONE_OFFS.find((row) => row.id === 'oneoff_runaway_ladle');
const TUG = WORLD_ONE_OFFS.find((row) => row.id === 'oneoff_abandoned_tug');
const CLEAR = 500;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function resolvedPos() {
  const anchorPos = world._oneOffAnchorPos(SECTOR, RECORD.anchor);
  return {
    x: anchorPos.x + RECORD.offsetLocal.x,
    z: anchorPos.z + RECORD.offsetLocal.z,
  };
}

test('the runaway ladle exists, once, anchored on Forge Foundry in Vesta Forge', () => {
  assert.ok(RECORD, 'oneoff_runaway_ladle is in WORLD_ONE_OFFS');
  assert.equal(WORLD_ONE_OFFS.filter((row) => row.sectorId === SECTOR_ID).length, 1,
    'Vesta Forge carries exactly this one one-off');
  assert.equal(RECORD.name, 'The Runaway Ladle — a foundry slag ladle that slipped its crane');
  assert.equal(RECORD.sectorId, SECTOR_ID);
  assert.deepEqual(RECORD.anchor, { type: 'station', id: 'station_forge' });
  assert.ok(RECORD.why && !/[.!?].+[.!?]/.test(RECORD.why), 'why is one plain sentence');
});

test('it is a physically ropeable body, heavier than the yard tug, with a slow spin', () => {
  assert.ok(RECORD.physicalBody, 'physicalBody makes it ropeable/shovable like the tug');
  assert.ok(RECORD.physicalBody.mass >= 200 && RECORD.physicalBody.mass <= 280,
    `mass ${RECORD.physicalBody.mass} is in the heavy-hulk band`);
  assert.ok(RECORD.physicalBody.mass > TUG.physicalBody.mass,
    `mass ${RECORD.physicalBody.mass} outweighs the tug's ${TUG.physicalBody.mass}`);
  assert.ok(RECORD.spin > 0 && RECORD.spin <= 0.5,
    `spin ${RECORD.spin} reads as a slow tumble, not a carnival ride`);
  assert.ok(RECORD.spin < TUG.spin, 'the heavier drum turns slower than the tug');
  assert.ok(RECORD.radius >= 14 && RECORD.radius <= 30,
    `radius ${RECORD.radius} is sized to an industrial vessel prop`);
});

test('the ladle wears packaged industrial art — the slurry bank reads as the dropped drum', () => {
  assert.ok(existsSync(`${PLACES_DIR}${RECORD.placeId}.glb`),
    `${RECORD.placeId}.glb must be packaged`);
  assert.ok(RECORD.placeId.startsWith('place_'), 'a real place model, not a placeholder id');
});

test('it sits on the foundry approach, clear of every authored Vesta hazard', () => {
  const pos = resolvedPos();
  const forge = SECTOR.stations.find((s) => s.id === 'station_forge');
  assert.ok(distance(pos, forge.pos) < CLEAR * 2,
    'it drifts on the approach side of the foundry, not across the sector');

  for (const field of SECTOR.fields || []) {
    assert.ok(distance(pos, field.center) - field.clusterRadius >= CLEAR,
      `${field.id} rocks are ${(distance(pos, field.center) - field.clusterRadius).toFixed(0)} WU clear (< ${CLEAR})`);
  }
  for (const hazard of SECTOR.hazards || []) {
    assert.ok(distance(pos, hazard.center) - hazard.radius >= CLEAR,
      `${hazard.type} hazard is ${(distance(pos, hazard.center) - hazard.radius).toFixed(0)} WU clear (< ${CLEAR})`);
  }
  assert.ok(distance(pos, VESTA_ORE_WINNOW.localPos) >= CLEAR,
    `the ore winnow is ${distance(pos, VESTA_ORE_WINNOW.localPos).toFixed(0)} WU away (< ${CLEAR})`);
  assert.ok(distance(pos, VESTA_FREIGHTER_POCKET_ORIGIN) >= CLEAR,
    `the freighter optic pocket is ${distance(pos, VESTA_FREIGHTER_POCKET_ORIGIN).toFixed(0)} WU away (< ${CLEAR})`);
  for (const poi of SECTOR.pois || []) {
    assert.ok(distance(pos, poi.pos) >= CLEAR,
      `${poi.id} is ${distance(pos, poi.pos).toFixed(0)} WU away (< ${CLEAR})`);
  }
  // The dead-freighter drift and the slag glow are zone-authored hazards too.
  for (const zone of (SECTOR_ZONES[SECTOR_ID] || [])
    .filter((z) => ['radiation_field', 'derelict_field'].includes(z.type))) {
    assert.ok(distance(pos, zone.center) - zone.radius >= CLEAR,
      `${zone.id} edge is ${(distance(pos, zone.center) - zone.radius).toFixed(0)} WU clear (< ${CLEAR})`);
  }
  assert.ok(Math.hypot(pos.x, pos.z) <= SECTOR.worldRadius, 'inside the sector radius');
});
