// PQ-136.02 fields the admitted occupational hulls through live traffic + npcJobs
// (rescue lifter, prospector skiff, scrap sweeper, apron shuttle, yard tug).
//
// PQ-193.08 fielded volatiles_tanker and inspection_cutter as mix-zero Helios fixtures
// after chase stills of the enclosed bodies. Hostile customs_cutter stays Hornet.
// The tug remains demand-dispatched. Yard props stay checkpointed off the place selector.
// Helios lane furniture is admitted.
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
import {
  traffic,
  TOWABLE_BODY_MIN_RADIUS_WU,
  TRAFFIC_ROLES,
  trafficRoleMixForSector,
} from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

const WIRED_LANE_FURNITURE_RELEASE_SHA256 = Object.freeze({
  place_lane_pin: 'c94e53f749dfd743d8cf9dd069936d5ce0aa2ee244251c54ab0e222d7d7a3a45',
  place_cold_locker: 'fcc05abb5d27ada70146cef9aeab5af23d179253a610da8f38af842473f84d25',
  place_tally_post: '9a2d02cd8e675473a613497ba494a35cdf5651958b68b40a8ccf2c2e31f907d5',
  place_claim_mark: '2b1b73edf399b135229777f2a6baefc8d9c44c8a3219b9711dd35ae753ad7b08',
  place_ash_pin: '1be79a9ae0d3652b66db455c5e38a9c8c2135f07bf0c6378abc44dbbaa0e939f',
  place_whistle: '90ef2650216aa214bce5520d829d03a9c0d682e7057a8f982bf243b695aa100e',
});

// Mix-zero Helios extras — packaged, role-mapped, never drawn from the ambient mix.
const HELIOS_RARE_EXTRAS = Object.freeze([
  { id: 'volatiles_tanker', role: 'tanker', file: 'wholeships/volatiles_tanker.glb',
    assetId: 'SF_WHOLESHIP_VOLATILES_TANKER' },
  { id: 'inspection_cutter', role: 'customs', hostile: 'customs_cutter',
    file: 'wholeships/inspection_cutter.glb', assetId: 'SF_WHOLESHIP_INSPECTION_CUTTER' },
]);

// Professions that only fly when a real body needs them (traffic's `_dispatchGeneralSalvors` /
// `_dispatchYardTugs`). They are deliberately absent from the weighted ambient mix.
const DEMAND_DISPATCHED_ROLES = new Set(['tug']);

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
    if (DEMAND_DISPATCHED_ROLES.has(craft.role)) {
      // A demand-dispatched profession must NOT be drawable from the weighted mix. Zero here is the
      // contract, not an omission: it is what stops a tug rolling into a pocket with nothing to tow
      // (a hull whose entire job is a tow, flying empty, is the decorative actor PQ-143.01 forbids),
      // and it is what keeps the seeded role draw byte-identical to the pre-tug goldens.
      assert.equal(mix[craft.role], 0,
        `${craft.role} is dispatched against a real body and must carry no ambient weight`);
      continue;
    }
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
      const towTargetId = entry && entry.job && entry.job.payload
        ? entry.job.payload.towTargetId : null;
      const lot = towTargetId != null
        ? (sim.state.entityList || []).find((e) => e && e.id === towTargetId && e.alive !== false)
        : null;
      found.set(craft.role, {
        trafficRole: data.trafficRole,
        trafficLabel: data.trafficLabel,
        jobId: data.jobId || null,
        jobKind: entry && entry.kind || null,
        jobSpeed: entry && entry.job && entry.job.speed || null,
        manifestQty: data.cargoManifest && data.cargoManifest.totalQty || 0,
        towTargetId,
        lotAlive: !!lot,
        lotRadius: lot ? Number(lot.radius) || 0 : 0,
        lotAuthoredAsset: lot && lot.data ? lot.data.authoredPayloadAssetId : null,
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
    if (craft.role === 'tug') {
      assert.equal(hit.jobSpeed, TRAFFIC_ROLES.tug.speed,
        'yard tug uses the slow planning speed in the existing hauler kernel');
      assert.ok(hit.manifestQty > 0,
        'yard tug carries a finite economy manifest');
      // The tow is the job. A tug whose route does not end at a real body it can attach to is the
      // decorative hull this role is not allowed to be.
      assert.ok(hit.towTargetId != null, 'yard tug is dispatched against a specific physical body');
      assert.ok(hit.lotAlive, 'the body the tug was hired to move exists in the world');
      assert.ok(hit.lotRadius >= TOWABLE_BODY_MIN_RADIUS_WU,
        `the tow body is bulk a tug is hired for (radius ${hit.lotRadius})`);
      assert.equal(hit.lotAuthoredAsset, 'pod_cargo_container',
        'the load wears an authored container body, never an unauthored stand-in');
    }
  }
});

test('tanker and inspection cutter are mix-zero Helios extras, not ambient rolls', () => {
  const mix = trafficRoleMixForSector(FIELDING_SECTOR_DATA);
  const heliosMix = trafficRoleMixForSector({
    id: 'sector_helios_prime',
    security: 0.95,
    trafficPerMin: 18,
  });
  for (const hull of HELIOS_RARE_EXTRAS) {
    const abs = resolve(ROOT, 'assets/ships/parts', hull.file);
    assert.ok(existsSync(abs), `keep ${hull.file} on disk`);
    assert.ok(triangleCount(parseGlbJson(abs)) > 200, `${hull.id} source is a stub`);
    assert.ok(existsSync(resolve(ROOT, 'assets/ships/release/parts', hull.file)),
      `keep the packaged release body for ${hull.id}`);

    const def = TRAFFIC_ROLES[hull.role];
    assert.ok(def, `${hull.role} must exist as a traffic role`);
    assert.notEqual(def.label, TRAFFIC_ROLES.hauler.label);
    assert.equal(mix[hull.role], 0, `${hull.role} must not roll from the ambient mix`);
    assert.equal(heliosMix[hull.role], 0, `${hull.role} must not steal Helios mix slots`);
    assert.equal(
      OCCUPATIONAL_TRAFFIC_CRAFT.some((row) => row.craftId === hull.id), false,
      `${hull.id} is a Helios fixture, not an occupational mix craft`,
    );
    const visual = wholeShipVisualForEntity({ data: { trafficRole: hull.role } });
    assert.equal(visual && visual.file, hull.file, `${hull.role} must select ${hull.file}`);
    assert.equal(visual && visual.assetId, hull.assetId);
    if (hull.hostile) {
      const customs = wholeShipVisualForEntity({
        data: { lootTableId: hull.hostile, defId: 'ship_hornet' },
      });
      assert.notEqual(customs && customs.file, hull.file,
        'customs hostiles must keep the Hornet, not the inspection cutter');
    }
  }
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'hauler' } }).file,
    'wholeships/helios_span.glb', 'tanker must not steal the Span hauler slot');
  assert.equal(wholeShipVisualForEntity({ data: { trafficRole: 'arclight' } }).file,
    'wholeships/helios_arclight.glb', 'tanker must not steal the Arclight slot');
  const atlas = wholeShipVisualForEntity(
    { type: 'ship', data: { defId: 'ship_atlas' } },
    { requiredWholeShip: true },
  );
  assert.equal(atlas && atlas.file, 'wholeships/atlas_production_v1.glb',
    'tanker must not steal Atlas');
  // PQ-049 owns Express Liner identity; PQ-136.02 must not re-skin already-shipping express
  // traffic as a side effect of fielding the apron shuttle.
  const express = wholeShipVisualForEntity({ data: { trafficRole: 'express' } });
  assert.equal(express && express.file, 'wholeships/massline_express_liner_v1.glb',
    'express selects the packaged Massline liner, not a fallback hull');
});

test('Helios start-sector traffic always includes the tanker and inspection cutter', () => {
  const sim = createSimulation({ seed: 47, systems: [traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';
  sim.spawn({
    type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: 900, z: 120 }, vel: { x: 0, z: 0 },
    radius: 34, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios_yard', name: 'Helios Yard' },
  });
  bus.emit('sector:enter', {
    sectorId: 'sector_helios_prime',
    sector: { id: 'sector_helios_prime', security: 0.95, trafficPerMin: 18, factionId: 'faction_helios' },
  });
  const roles = (state.traffic.freighters || []).map((rec) => rec && rec.role);
  assert.ok(roles.includes('tanker'), `Helios traffic missing tanker: ${roles.join(',')}`);
  assert.ok(roles.includes('customs'), `Helios traffic missing inspection cutter: ${roles.join(',')}`);
  const tanker = (state.traffic.freighters || []).find((rec) => rec && rec.role === 'tanker');
  const customs = (state.traffic.freighters || []).find((rec) => rec && rec.role === 'customs');
  const tankerEnt = state.entities.get(tanker.id);
  const customsEnt = state.entities.get(customs.id);
  assert.equal(wholeShipVisualForEntity(tankerEnt).file, 'wholeships/volatiles_tanker.glb');
  assert.equal(wholeShipVisualForEntity(customsEnt).file, 'wholeships/inspection_cutter.glb');
  sim.dispose();
});

test('Helios lane furniture admits the repaired corridor family', () => {
  const helios = SECTOR_ANCHORS.sector_helios_prime;
  const furniture = (helios.pois || []).filter((poi) => LANE_FURNITURE_PLACE_IDS.includes(poi.landmarkGlb));
  assert.equal(furniture.length, LANE_FURNITURE_PLACE_IDS.length,
    'Helios must keep one POI per leftover lane-furniture body');
  assert.deepEqual([...ADMITTED_LANE_FURNITURE_PLACE_IDS], [...LANE_FURNITURE_PLACE_IDS]);
  assert.equal(CHECKPOINTED_LANE_FURNITURE_PLACE_IDS.length, 0);
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
