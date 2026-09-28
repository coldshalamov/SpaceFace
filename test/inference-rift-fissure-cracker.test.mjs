// The northern frontier gets its kill machine — the Rift Observatory's survey drill cracks
// the Ice Fissure ridge on the shared machine law (warning quiet, surge bite, calm safe),
// standing just off the fissure landmark and clear of every anchor in the sector.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ALL_KILL_MACHINES,
  RIFT_FISSURE_CRACKER,
  RIFT_FISSURE_SECTOR_ID,
  killMachinePhase,
  killMachinesForSector,
} from '../src/data/environmentalMachinery.js';
import { FRONTIER_ANCHORS } from '../src/data/frontierRegions/index.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

test('the fissure cracker exists, serves Haumea alone, and joins the census', () => {
  const slice = killMachinesForSector(RIFT_FISSURE_SECTOR_ID);
  assert.equal(slice.length, 1);
  assert.equal(slice[0].id, 'fissure_cracker');
  assert.equal(slice[0].sectorId, 'sector_haumea_rift');
  assert.equal(killMachinesForSector('sector_ceres_belt').some((m) => m.id === 'fissure_cracker'), false,
    'the cracker must not leak into the Ceres roster');
  assert.ok(ALL_KILL_MACHINES.includes(RIFT_FISSURE_CRACKER), 'the census owns the machine');
  assert.ok(existsSync(`${PLACES_DIR}place_drill_platform_cold.glb`),
    'the cold drill platform is packaged art');
});

test('the machine rides the shared law: phases cycle, hazard is debris, anvil sits down-range', () => {
  for (const t of [0, 3, 7, 40, 4242]) {
    const phase = killMachinePhase(RIFT_FISSURE_CRACKER, t);
    assert.ok(['warning', 'surge', 'calm'].includes(phase.phase), `phase names a stage at t=${t}`);
  }
  assert.equal(RIFT_FISSURE_CRACKER.hazardType, 'debris');
  const anvil = RIFT_FISSURE_CRACKER.anvil;
  const center = RIFT_FISSURE_CRACKER.globalPos;
  const along = (anvil.pos.x - center.x) * RIFT_FISSURE_CRACKER.dir.x
    + (anvil.pos.z - center.z) * RIFT_FISSURE_CRACKER.dir.z;
  assert.ok(along > 0, 'the anvil sits down-range of the mouth, where the bite throws mass');
});

test('the mouth stands clear of every Haumea anchor by its own hazard radius', () => {
  const anchors = FRONTIER_ANCHORS[RIFT_FISSURE_SECTOR_ID];
  assert.ok(anchors, 'Haumea anchors exist');
  const machine = RIFT_FISSURE_CRACKER;
  for (const station of anchors.stations) {
    const d = Math.hypot(station.pos.x - machine.localPos.x, station.pos.z - machine.localPos.z);
    assert.ok(d > machine.hazardRadius, `clear of ${station.id}: ${d.toFixed(0)} WU`);
  }
  for (const field of anchors.fields) {
    const d = Math.hypot(field.center.x - machine.localPos.x, field.center.z - machine.localPos.z)
      - (field.clusterRadius || 0);
    assert.ok(d > machine.hazardRadius, `clear of ${field.id}: ${d.toFixed(0)} WU beyond the cluster`);
  }
  for (const poi of anchors.pois) {
    const d = Math.hypot(poi.pos.x - machine.localPos.x, poi.pos.z - machine.localPos.z);
    assert.ok(d > machine.hazardRadius, `clear of ${poi.id}: ${d.toFixed(0)} WU`);
  }
});
