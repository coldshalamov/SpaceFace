// Checkpoint proof: leftover occupational hulls and yard props stay on disk
// but do not enter live traffic, hostile, or place selectors until a still
// panel leaves no blocking toy / missing-hull defect. Helios lane furniture
// is the admitted leftover place family after a later construction repair.
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

const CHECKPOINTED_HULLS = Object.freeze([
  { id: 'rescue_lifter', role: 'rescue', file: 'wholeships/rescue_lifter.glb' },
  { id: 'volatiles_tanker', role: 'tanker', file: 'wholeships/volatiles_tanker.glb' },
  { id: 'prospector_skiff', role: 'prospector', file: 'wholeships/prospector_skiff.glb' },
  { id: 'scrap_sweeper', role: 'sweeper', file: 'wholeships/scrap_sweeper.glb' },
  { id: 'yard_tug', role: 'tug', file: 'wholeships/yard_tug.glb' },
  { id: 'apron_shuttle', role: 'shuttle', file: 'wholeships/apron_shuttle.glb' },
  { id: 'inspection_cutter', hostile: 'customs_cutter', file: 'wholeships/inspection_cutter.glb' },
]);

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

test('checkpointed occupational hulls stay on disk but do not enter live selectors', () => {
  for (const hull of CHECKPOINTED_HULLS) {
    const abs = resolve(ROOT, 'assets/ships/parts', hull.file);
    assert.ok(existsSync(abs), `keep ${hull.file} on disk`);
    const tris = triangleCount(parseGlbJson(abs));
    assert.ok(tris > 200, `${hull.id} source is a stub (${tris} tris)`);
    if (hull.role) {
      if (hull.role === 'rescue') {
        assert.ok(TRAFFIC_ROLES.rescue, 'pre-existing rescue role stays');
      } else {
        assert.equal(TRAFFIC_ROLES[hull.role], undefined, `${hull.role} must not roll in traffic`);
      }
      const visual = wholeShipVisualForEntity({ data: { trafficRole: hull.role } });
      assert.notEqual(visual && visual.file, hull.file, `${hull.role} must not select ${hull.file}`);
    }
    if (hull.hostile) {
      const customs = wholeShipVisualForEntity({ data: { lootTableId: hull.hostile, defId: 'ship_hornet' } });
      assert.notEqual(customs && customs.file, hull.file, 'customs hostiles must not wear the inspection cutter');
    }
  }
  const hornet = wholeShipVisualForEntity({ data: { defId: 'ship_hornet' } }, { requiredWholeShip: true });
  assert.notEqual(hornet.file, 'wholeships/inspection_cutter.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'hauler' } }).file, 'wholeships/helios_span.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'miner' } }).file, 'wholeships/helios_cradle.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'courier' } }).file, 'wholeships/helios_lark.glb');
  assert.notEqual(
    wholeShipVisualForEntity({ data: { trafficRole: 'courier' } }).file,
    'wholeships/helios_lark_production_v1.glb',
    'factory Lark remaster stays off the live courier slot',
  );
});

test('Helios lane furniture is admitted with a release GLB and Helios spawn', () => {
  const helios = SECTOR_ANCHORS.sector_helios_prime;
  const furniture = (helios.pois || []).filter((poi) => LANE_FURNITURE_PLACE_IDS.includes(poi.landmarkGlb));
  assert.equal(furniture.length, LANE_FURNITURE_PLACE_IDS.length,
    'Helios must keep one POI per leftover lane-furniture body');
  for (const poi of furniture) {
    const placeId = poi.landmarkGlb;
    const file = `places/${placeId}.glb`;
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { landmarkGlb: placeId } }),
      file,
      `${placeId} must resolve through PLACE_FILES`,
    );
    const sourceAbs = resolve(ROOT, 'assets/ships/parts', file);
    const releaseAbs = resolve(ROOT, 'assets/ships/release/parts', file);
    assert.ok(existsSync(sourceAbs), `keep ${file} on disk`);
    assert.ok(existsSync(releaseAbs), `${placeId} must have a release GLB`);
    const sourceTris = triangleCount(parseGlbJson(sourceAbs));
    const releaseTris = triangleCount(parseGlbJson(releaseAbs));
    assert.ok(sourceTris > 200, `${placeId} source is a stub (${sourceTris} tris)`);
    assert.ok(releaseTris > 200, `${placeId} release is a stub (${releaseTris} tris)`);
  }
  const spawned = spawnSector('sector_helios_prime');
  for (const placeId of LANE_FURNITURE_PLACE_IDS) {
    assert.ok(spawned.includes(placeId), `Helios must spawn ${placeId}`);
  }
});

test('yard props stay packaged on disk but are not admitted to the live place selector', () => {
  for (const placeId of OCCUPATIONAL_YARD_PLACE_IDS) {
    const file = `places/${placeId}.glb`;
    const sourceAbs = resolve(ROOT, 'assets/ships/parts', file);
    assert.ok(existsSync(sourceAbs), `keep ${file} on disk`);
    const sourceTris = triangleCount(parseGlbJson(sourceAbs));
    assert.ok(sourceTris > 200, `${placeId} source is a stub (${sourceTris} tris)`);
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId } }),
      null,
      `${placeId} must stay out of PLACE_FILES until a still panel clears toy/open-cage`,
    );
  }
  assert.ok(occupationalYardDressingForSector('sector_ceres_belt').length >= 8,
    'keep the authored Ceres yard offsets on disk, unwired');
  assert.equal(occupationalYardDressingForSector('sector_helios_prime').length, 0);
});

test('restored Ceres/Tethys landmarks do not wear the toy yard kit', () => {
  const expected = {
    poi_survey: 'place_debris_chunk',
    poi_tethys_weigh: 'place_lane_beacon',
    poi_tethys_customs_log: 'place_nav_buoy',
  };
  const allPois = Object.values(SECTOR_ANCHORS).flatMap((sector) => sector.pois || []);
  for (const [poiId, placeId] of Object.entries(expected)) {
    const poi = allPois.find((row) => row.id === poiId);
    assert.ok(poi, `missing POI ${poiId}`);
    assert.equal(poi.landmarkGlb, placeId);
  }
  const ceres = spawnSector('sector_ceres_belt');
  assert.ok(ceres.includes('place_debris_chunk'), 'Ceres survey cache must wear debris again');
  assert.equal(ceres.filter((id) => id === 'place_sensor_mast').length, 0);
  assert.equal(ceres.filter((id) => id === 'place_slurry_tank').length, 0);
  const tethys = spawnSector('sector_tethys_junction');
  assert.equal(tethys.filter((id) => id === 'place_transponder_gate').length, 0);
  assert.equal(tethys.filter((id) => id === 'place_interdiction_buoy').length, 0);
  assert.ok(tethys.includes('place_lane_beacon'), 'Tethys weigh must wear the lane beacon again');
});
