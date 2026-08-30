// PQ-136.02 fields FOUR of the leftover occupational hulls through live traffic + npcJobs
// (rescue lifter, prospector skiff, scrap sweeper, apron shuttle) — the ones with no
// recorded still-review defect.
//
// THREE stay checkpointed OFF live traffic: volatiles_tanker, yard_tug and the
// inspection_cutter-as-customs. 8257fd9e ("unwire below-bar work hulls") records the
// still reviews that called the tanker and tug a missing-hull kit and sent customs back to
// the Hornet. That rejection still stands, so this file guards it both ways: the four must
// spawn, and the three must not. Do not invert the guard without a passing still review.
//
// Yard props and uncleared lane furniture stay checkpointed off the place selector.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { OCCUPATIONAL_TRAFFIC_CRAFT } from '../src/data/occupationalTrafficCraft.js';
import {
  ADMITTED_LANE_FURNITURE_PLACE_IDS,
  CHECKPOINTED_LANE_FURNITURE_PLACE_IDS,
  LANE_FURNITURE_PLACE_IDS,
  OCCUPATIONAL_YARD_PLACE_IDS,
  occupationalYardDressingForSector,
} from '../src/data/occupationalYardDressing.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic, TRAFFIC_ROLES, trafficRoleMixForSector } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

const WIRED_LANE_FURNITURE_RELEASE_SHA256 = Object.freeze({
  place_lane_pin: 'c94e53f749dfd743d8cf9dd069936d5ce0aa2ee244251c54ab0e222d7d7a3a45',
  place_cold_locker: 'bc59994f9fc9b6e084571abefbacc01fd7b706298f442a6777c69afc6724abb8',
});

// Still-rejected in 8257fd9e — packaged and kept on disk, but must not reach live traffic.
const HELD_BACK_HULLS = Object.freeze([
  { id: 'volatiles_tanker', role: 'tanker', file: 'wholeships/volatiles_tanker.glb' },
  { id: 'yard_tug', role: 'tug', file: 'wholeships/yard_tug.glb' },
  { id: 'inspection_cutter', role: 'customs', hostile: 'customs_cutter',
    file: 'wholeships/inspection_cutter.glb' },
]);

const FIELDING_SECTOR = 'sector_occupational_fielding_probe';
const FIELDING_SECTOR_DATA = {
  id: FIELDING_SECTOR,
  security: 0.5,
  trafficPerMin: 24,
  industries: { mining: true, refinery: true },
};

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

function readGlbAssetId(path) {
  const buf = readFileSync(path);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not a GLB: ${path}`);
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      const doc = JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
      return doc?.asset?.extras?.spacefaceAsset?.assetId || null;
    }
    off += len;
  }
  return null;
}

function enterFieldingSector(seed) {
  const sim = createSimulation({ seed, systems: [npcJobsRuntime, traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = FIELDING_SECTOR;
  for (const p of [{ x: 0, z: 0 }, { x: 950, z: 220 }, { x: -640, z: 760 }]) {
    sim.spawn({
      type: 'station', team: 2, pos: p, vel: { x: 0, z: 0 },
      radius: 34, hull: 1000, hullMax: 1000,
    });
  }
  for (let i = 0; i < 10; i++) {
    const a = 0.63 * i;
    const r = 380 + 46 * i;
    sim.spawn({
      type: 'asteroid', team: 2,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 }, radius: 22, hull: 200, hullMax: 200,
    });
  }
  bus.emit('sector:enter', { sectorId: FIELDING_SECTOR, sector: FIELDING_SECTOR_DATA });
  return sim;
}

test('fielded occupational hulls stay on disk and bind live traffic roles', () => {
  const seenFiles = new Set([
    'wholeships/helios_lark.glb',
    'wholeships/helios_cradle.glb',
    'wholeships/helios_span.glb',
    'wholeships/ore_barge.glb',
    'wholeships/repair_tender.glb',
    'wholeships/salvage_cutter.glb',
    'wholeships/survey_pin.glb',
  ]);
  for (const craft of OCCUPATIONAL_TRAFFIC_CRAFT) {
    const abs = resolve(ROOT, 'assets/ships/parts', craft.file);
    assert.ok(existsSync(abs), `keep ${craft.file} on disk`);
    const tris = triangleCount(parseGlbJson(abs));
    assert.ok(tris > 200, `${craft.craftId} source is a stub (${tris} tris)`);
    const def = TRAFFIC_ROLES[craft.role];
    assert.ok(def, `${craft.role} must exist in TRAFFIC_ROLES or spawn silently inherits hauler`);
    assert.equal(def.team, 2);
    assert.notEqual(def.label, TRAFFIC_ROLES.hauler.label);
    const selection = wholeShipVisualForEntity({ data: { trafficRole: craft.role } });
    assert.ok(selection, `${craft.role} must bind a whole-ship`);
    assert.equal(selection.file, craft.file);
    assert.equal(selection.assetId, craft.assetId);
    // Every fielded craft must own a distinct silhouette — the point of the packet is
    // variety, so two roles resolving to one body would be a silent no-op.
    assert.ok(!seenFiles.has(selection.file), `${craft.role} shares ${selection.file}`);
    seenFiles.add(selection.file);
    const releaseAbs = resolve(ROOT, 'assets/ships/release/parts', craft.file);
    assert.ok(existsSync(releaseAbs), `missing release GLB ${craft.file}`);
    assert.equal(readGlbAssetId(releaseAbs), craft.assetId);
  }
  const hornet = wholeShipVisualForEntity({ data: { defId: 'ship_hornet' } }, { requiredWholeShip: true });
  assert.notEqual(hornet.file, 'wholeships/inspection_cutter.glb');
  const hostileCustoms = wholeShipVisualForEntity({
    data: { lootTableId: 'customs_cutter', defId: 'ship_hornet' },
  });
  assert.notEqual(hostileCustoms && hostileCustoms.file, 'wholeships/inspection_cutter.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'hauler' } }).file, 'wholeships/helios_span.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'miner' } }).file, 'wholeships/helios_cradle.glb');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'courier' } }).file, 'wholeships/helios_lark.glb');
  assert.notEqual(
    wholeShipVisualForEntity({ data: { trafficRole: 'courier' } }).file,
    'wholeships/helios_lark_production_v1.glb',
    'factory Lark remaster stays off the live courier slot',
  );
});

test('live ambient spawn assigns fielded occupational craft to existing job machines', () => {
  const mix = trafficRoleMixForSector(FIELDING_SECTOR_DATA);
  for (const craft of OCCUPATIONAL_TRAFFIC_CRAFT) {
    assert.ok(mix[craft.role] > 0, `${craft.role} must be drawable in the ambient mix`);
  }

  const found = new Map();
  let scanned = 0;
  for (let seed = 1; seed <= 400 && found.size < OCCUPATIONAL_TRAFFIC_CRAFT.length; seed++) {
    scanned++;
    const sim = enterFieldingSector(seed);
    const jobs = sim.registry.get('npcJobsRuntime');
    const bag = jobs && typeof jobs._byId === 'function' ? jobs._byId() : {};
    for (const rec of sim.state.traffic.freighters || []) {
      const craft = OCCUPATIONAL_TRAFFIC_CRAFT.find((row) => row.role === rec.role);
      if (!craft || found.has(craft.role)) continue;
      const entity = (sim.state.entityList || []).find((e) => e && e.id === rec.id) || null;
      const data = entity && entity.data || {};
      const selection = wholeShipVisualForEntity(entity);
      const entry = data.jobId ? bag[data.jobId] : null;
      found.set(craft.role, {
        trafficRole: data.trafficRole,
        trafficLabel: data.trafficLabel,
        jobId: data.jobId || null,
        jobKind: entry && entry.kind || null,
        file: selection && selection.file || null,
        assetId: selection && selection.assetId || null,
      });
    }
    sim.dispose();
  }

  const missing = OCCUPATIONAL_TRAFFIC_CRAFT
    .filter((row) => !found.has(row.role))
    .map((row) => row.role);
  assert.equal(missing.length, 0,
    `no spawn for ${missing.join(', ')} across ${scanned} seeded sector entries`);

  for (const craft of OCCUPATIONAL_TRAFFIC_CRAFT) {
    const hit = found.get(craft.role);
    assert.equal(hit.trafficRole, craft.role, `${craft.craftId} spawned with the wrong role`);
    assert.equal(hit.trafficLabel, TRAFFIC_ROLES[craft.role].label);
    assert.equal(hit.file, craft.file,
      `${craft.craftId} spawn must wear ${craft.file}, not a modular fallback`);
    assert.equal(hit.assetId, craft.assetId);
    assert.ok(hit.jobId, `${craft.craftId} must receive an npcJobs assignment`);
    assert.equal(hit.jobKind, craft.jobKind,
      `${craft.craftId} must ride the existing ${craft.jobKind} phase machine`);
  }
});

test('still-rejected work hulls stay on disk but never reach live traffic (8257fd9e)', () => {
  const mix = trafficRoleMixForSector(FIELDING_SECTOR_DATA);
  for (const hull of HELD_BACK_HULLS) {
    // Kept as a candidate: the body must not be deleted while it waits for a still review.
    // Both copies are guarded — the release body is the one a cleanup pass would sweep, and
    // it is what the live loader would read the day the review clears.
    const abs = resolve(ROOT, 'assets/ships/parts', hull.file);
    assert.ok(existsSync(abs), `keep ${hull.file} on disk as a review candidate`);
    assert.ok(triangleCount(parseGlbJson(abs)) > 200, `${hull.id} source is a stub`);
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/release/parts', hull.file)),
      `keep the packaged release body for ${hull.id} — held back is not deleted`);

    // ...but nothing may select it.
    assert.equal(TRAFFIC_ROLES[hull.role], undefined,
      `${hull.role} must not exist as a traffic role until a still review clears ${hull.id}`);
    assert.ok(!(hull.role in mix), `${hull.role} must not be drawable in the ambient mix`);
    assert.equal(
      OCCUPATIONAL_TRAFFIC_CRAFT.some((row) => row.craftId === hull.id), false,
      `${hull.id} must not be listed as a fielded craft`,
    );
    const visual = wholeShipVisualForEntity({ data: { trafficRole: hull.role } });
    assert.notEqual(visual && visual.file, hull.file,
      `${hull.role} must not select ${hull.file}`);
    if (hull.hostile) {
      const customs = wholeShipVisualForEntity({
        data: { lootTableId: hull.hostile, defId: 'ship_hornet' },
      });
      assert.notEqual(customs && customs.file, hull.file,
        'customs hostiles must keep the Hornet, not the inspection cutter');
    }
  }

  // PQ-049 owns Express Liner identity; PQ-136.02 must not re-skin already-shipping express
  // traffic as a side effect of fielding the apron shuttle.
  const express = wholeShipVisualForEntity({ data: { trafficRole: 'express' } });
  assert.notEqual(express && express.file, 'wholeships/apron_shuttle.glb',
    'express must not silently inherit the apron shuttle body');
});

test('Helios lane furniture admits only the bodies every still reviewer cleared', () => {
  const helios = SECTOR_ANCHORS.sector_helios_prime;
  const furniture = (helios.pois || []).filter((poi) => LANE_FURNITURE_PLACE_IDS.includes(poi.landmarkGlb));
  assert.equal(furniture.length, LANE_FURNITURE_PLACE_IDS.length,
    'Helios must keep one POI per leftover lane-furniture body');
  assert.deepEqual([...ADMITTED_LANE_FURNITURE_PLACE_IDS], ['place_lane_pin', 'place_cold_locker']);
  for (const placeId of ADMITTED_LANE_FURNITURE_PLACE_IDS) {
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
    assert.equal(
      createHash('sha256').update(readFileSync(releaseAbs)).digest('hex'),
      WIRED_LANE_FURNITURE_RELEASE_SHA256[placeId],
      `${placeId} must stay the exact release bytes the still panel judged`,
    );
  }
  for (const placeId of CHECKPOINTED_LANE_FURNITURE_PLACE_IDS) {
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { landmarkGlb: placeId } }),
      null,
      `${placeId} stays out of PLACE_FILES after a blocking LEGO-foot note`,
    );
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/parts/places', `${placeId}.glb`)));
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/release/parts/places', `${placeId}.glb`)));
  }
  const spawned = spawnSector('sector_helios_prime');
  for (const placeId of LANE_FURNITURE_PLACE_IDS) {
    assert.ok(spawned.includes(placeId), `Helios must keep the ${placeId} POI`);
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
