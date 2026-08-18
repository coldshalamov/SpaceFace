// Drives the shipped place selector + live world spawn for leftover 3D props that
// already had release identity but were never admitted to PLACE_FILES.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  LANE_FURNITURE_PLACE_IDS,
  OCCUPATIONAL_YARD_PLACE_IDS,
  occupationalYardDressingForSector,
} from '../src/data/occupationalYardDressing.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

function parseGlbJson(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `not a GLB: ${abs}`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8').replace(/\0+$/, ''));
}

function triangleCount(doc) {
  let tris = 0;
  for (const mesh of doc.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const acc = doc.accessors?.[prim.indices];
      if (acc) tris += Math.floor(acc.count / 3);
    }
  }
  return tris;
}

function spawnSector(sectorId) {
  const sim = createSimulation({ seed: 47, systems: [world] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true, collides: false, radius: 8, mass: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector(sectorId, { placePlayer: false });
  const placeIds = [];
  for (const ent of sim.state.entityList || []) {
    const id = ent && ent.data && (ent.data.placeId || ent.data.landmarkGlb);
    if (id) placeIds.push(String(id).replace(/^places\//, '').replace(/\.glb$/, ''));
  }
  sim.dispose();
  return placeIds;
}

test('shipped selector admits every leftover packaged place as a non-zero body', () => {
  const partsManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
  const releaseManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
  for (const placeId of OCCUPATIONAL_YARD_PLACE_IDS) {
    const file = `places/${placeId}.glb`;
    const entity = { type: 'fx', data: { placeId } };
    assert.equal(resolvePlaceFileForEntity(entity), file, `${placeId} selector`);
    const landmarkEntity = { type: 'fx', data: { landmarkGlb: placeId } };
    assert.equal(resolvePlaceFileForEntity(landmarkEntity), file, `${placeId} landmark selector`);

    const sourceAbs = resolve(ROOT, 'assets/ships/parts', file);
    const releaseAbs = resolve(ROOT, 'assets/ships/release/parts', file);
    assert.ok(existsSync(sourceAbs), `missing source ${file}`);
    const sourceTris = triangleCount(parseGlbJson(sourceAbs));
    assert.ok(sourceTris > 200, `${placeId} source is a zero-draw/stub body (${sourceTris} tris)`);
    const partRow = (partsManifest.parts || []).find((part) => part.id === placeId);
    assert.ok(partRow, `${placeId} missing parts_manifest row`);
    if (OCCUPATIONAL_YARD_PLACE_IDS.includes(placeId)) {
      assert.ok(existsSync(releaseAbs), `missing release ${file}`);
      const releaseTris = triangleCount(parseGlbJson(releaseAbs));
      assert.ok(releaseTris > 200, `${placeId} release is a zero-draw/stub body (${releaseTris} tris)`);
      const releaseRow = (releaseManifest.assets || []).find((row) => row.id === placeId);
      assert.ok(releaseRow, `${placeId} missing release_manifest row`);
    }
  }
});

test('Helios lane furniture stays checkpointed until it has a release contract', () => {
  const helios = SECTOR_ANCHORS.sector_helios_prime;
  const furniture = (helios.pois || []).filter((poi) => LANE_FURNITURE_PLACE_IDS.includes(poi.landmarkGlb));
  assert.equal(furniture.length, LANE_FURNITURE_PLACE_IDS.length,
    'Helios must keep one POI per leftover lane-furniture body');
  for (const poi of furniture) {
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { landmarkGlb: poi.landmarkGlb } }),
      null,
      `${poi.landmarkGlb} must not be admitted without a release GLB`,
    );
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/parts/places', `${poi.landmarkGlb}.glb`)));
  }
});

test('existing Tethys/Ceres POIs wear occupational props instead of generic stand-ins', () => {
  const expected = {
    poi_survey: 'place_sensor_mast',
    poi_tethys_customs_log: 'place_sensor_mast',
    poi_tethys_weigh: 'place_transponder_gate',
  };
  const allPois = Object.values(SECTOR_ANCHORS).flatMap((sector) => sector.pois || []);
  for (const [poiId, placeId] of Object.entries(expected)) {
    const poi = allPois.find((row) => row.id === poiId);
    assert.ok(poi, `missing POI ${poiId}`);
    assert.equal(poi.landmarkGlb, placeId);
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { landmarkGlb: poi.landmarkGlb } }),
      `places/${placeId}.glb`,
    );
  }
});

test('Ceres yard dump stays authored but unwired so the pocket budget is unchanged', () => {
  assert.ok(occupationalYardDressingForSector('sector_ceres_belt').length >= 8,
    'keep the Ceres yard plan on disk');
  assert.equal(occupationalYardDressingForSector('sector_helios_prime').length, 0,
    'do not dump the yard into Helios');
});

test('live world spawn remaps existing POIs and adds only the Tethys law pair', () => {
  const ceres = spawnSector('sector_ceres_belt');
  assert.ok(ceres.includes('place_sensor_mast'), 'Ceres survey POI must spawn the sensor mast');
  assert.equal(ceres.filter((id) => id === 'place_slurry_tank').length, 0,
    'do not add extra Ceres yard entities on top of the pinned pocket budget');
  const tethys = spawnSector('sector_tethys_junction');
  assert.ok(tethys.includes('place_sensor_mast'), 'Tethys customs log must spawn the sensor mast');
  assert.ok(tethys.includes('place_transponder_gate'), 'Tethys weigh must spawn the transponder gate');
  assert.ok(tethys.includes('place_interdiction_buoy'), 'Tethys customs approach must spawn interdiction buoys');
});

test('new occupational hulls resolve through the shipped selector and do not replace live identities', () => {
  const expected = {
    rescue: { file: 'wholeships/rescue_lifter.glb', assetId: 'SF_WHOLESHIP_RESCUE_LIFTER' },
    tanker: { file: 'wholeships/volatiles_tanker.glb', assetId: 'SF_WHOLESHIP_VOLATILES_TANKER' },
    prospector: { file: 'wholeships/prospector_skiff.glb', assetId: 'SF_WHOLESHIP_PROSPECTOR_SKIFF' },
    sweeper: { file: 'wholeships/scrap_sweeper.glb', assetId: 'SF_WHOLESHIP_SCRAP_SWEEPER' },
    tug: { file: 'wholeships/yard_tug.glb', assetId: 'SF_WHOLESHIP_YARD_TUG' },
    shuttle: { file: 'wholeships/apron_shuttle.glb', assetId: 'SF_WHOLESHIP_APRON_SHUTTLE' },
  };
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'hauler' } }).file, 'wholeships/helios_span.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'miner' } }).file, 'wholeships/helios_cradle.glb');
  assert.notEqual(
    wholeShipVisualForEntity(
      { data: { trafficRole: 'express', defId: 'ship_mule' } },
      { requiredWholeShip: true },
    ).file,
    'wholeships/apron_shuttle.glb',
    'express stays the civic liner slot, not the apron shuttle',
  );
  for (const [role, want] of Object.entries(expected)) {
    assert.equal(TRAFFIC_ROLES[role].label.length > 0, true);
    const visual = wholeShipVisualForEntity({ data: { trafficRole: role } });
    assert.equal(visual.file, want.file, role);
    assert.equal(visual.assetId, want.assetId, role);
  }
  const customs = wholeShipVisualForEntity({ data: { lootTableId: 'customs_cutter', defId: 'ship_hornet' } });
  assert.equal(customs.file, 'wholeships/inspection_cutter.glb');
  assert.equal(customs.assetId, 'SF_WHOLESHIP_INSPECTION_CUTTER');
  const hornet = wholeShipVisualForEntity({ data: { defId: 'ship_hornet' } }, { requiredWholeShip: true });
  assert.notEqual(hornet.file, 'wholeships/inspection_cutter.glb',
    'the player/NPC Hornet body must not become the customs cutter');
});
