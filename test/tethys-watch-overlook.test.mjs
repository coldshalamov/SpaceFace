import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EVERYDAY_SPACE_KIT_LEGAL_MODELS,
  EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR,
  EVERYDAY_SPACE_KIT_SALT,
  everydaySpaceKitDressingForSector,
} from '../src/data/everydaySpaceKitDressing.js';
import {
  TETHYS_WATCH_OVERLOOK_ANCHOR as ANCHOR,
  TETHYS_WATCH_OVERLOOK_PASS as PASS,
  TETHYS_WATCH_OVERLOOK_PROPS as PROPS,
  TETHYS_WATCH_OVERLOOK_SECTOR_ID as SECTOR,
  TETHYS_WATCH_OVERLOOK_STOPS as STOPS,
  tethysWatchOverlookForSector,
} from '../src/data/tethysWatchOverlook.js';

const customs = (dx = 0, dz = 0) => ({
  id: 13, stationId: ANCHOR.stationId, pos: { x: ANCHOR.x + dx, z: ANCHOR.z + dz },
});
const anchors = (dx = 0, dz = 0) => ({
  stations: [{ id: 12, stationId: 'station_tethys', pos: { x: 1050 + dx, z: 380 + dz } }, customs(dx, dz)],
  gates: [{ pos: { x: -3280 + dx, z: dz } }],
  fields: [{ center: { x: -520 + dx, z: 680 + dz } }],
  wrecks: [],
});
const rows = (dx = 0, dz = 0, rng = () => 0.47) =>
  everydaySpaceKitDressingForSector(SECTOR, 'core', rng, anchors(dx, dz));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Scale-1 measured bounds/skin are inside the existing kit radii except the
// rack: its XZ bounds reach 9.275 WU and its adopted skin reaches 9.512 WU.
// Use 10 for clearance only; never enlarge its actual radius 9/draw scale 1.
const clearance = (row) => row.placeId === 'place_hull_rack' ? 10 : row.radius;
function segmentDistance(p, a, b) {
  const x = b.x - a.x, z = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x*x + z*z)));
  return distance(p, { x: a.x + t*x, z: a.z + t*z });
}

test('Tethys replaces the existing four core slots with the four released place identities', () => {
  const result = rows();
  assert.equal(result.length, EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR);
  assert.deepEqual(result.map(row => row.placeId), PROPS.map(prop => prop.placeId));
  assert.equal(new Set(result.map(row => row.placeId)).size, 4);
  assert.deepEqual(result.map(row => row.radius), [28, 12, 8, 9]);
  assert.deepEqual(result.map(clearance), [28, 12, 8, 10]);
  for (const row of result) {
    const model = EVERYDAY_SPACE_KIT_LEGAL_MODELS.find(model => model.id === row.placeId);
    assert.equal(row.radius, model.radius, 'keep the released kit draw/skin scale');
    assert.equal(row.everydaySpaceKit, true);
    assert.ok(model.releaseUrl.endsWith(`${row.placeId}.glb`));
    assert.ok(!['place_transponder_gate', 'place_interdiction_buoy'].includes(row.placeId));
  }
});

test('the named Customs station supplies translation, never the first station or origin', () => {
  const result = rows(18000, -22000);
  result.forEach((row, i) => {
    assert.equal(row.pos.x, PROPS[i].pos.x + 18000);
    assert.equal(row.pos.z, PROPS[i].pos.z - 22000);
    assert.equal(row.rot, PROPS[i].rot);
    assert.equal(row.name, PROPS[i].name);
  });
  const reordered = anchors(18000, -22000);
  reordered.stations.reverse();
  assert.deepEqual(everydaySpaceKitDressingForSector(SECTOR, 'core', () => 0.9, reordered), result);
});

test('return visits and a different kit RNG cannot move or multiply the composition', () => {
  const before = anchors();
  const snapshot = structuredClone(before);
  for (const value of [0, 0.1, 0.47, 0.99]) {
    let calls = 0;
    assert.deepEqual(rows(0, 0, () => { calls++; return value; }), rows());
    assert.equal(calls, 0, 'authored placement has no procedural clock or random drift');
  }
  everydaySpaceKitDressingForSector(SECTOR, 'core', () => 0.3, before);
  assert.deepEqual(before, snapshot, 'input anchors are read-only');
});

test('missing, duplicate and malformed station anchors cannot invent the overlook', () => {
  assert.equal(tethysWatchOverlookForSector(SECTOR, {}), null);
  assert.equal(tethysWatchOverlookForSector(SECTOR, { stations: [{ id: 'station_customs', pos: { x: 0, z: 0 } }] }), null);
  assert.equal(tethysWatchOverlookForSector(SECTOR, { stations: [customs(), customs()] }), null);
  for (const value of [NaN, Infinity, null, '0']) {
    assert.equal(tethysWatchOverlookForSector(SECTOR, { stations: [{ ...customs(), pos: { x: value, z: 0 } }] }), null);
  }
  assert.deepEqual(everydaySpaceKitDressingForSector(SECTOR, 'core', () => 0.2, {}), []);
});

test('other sectors keep ordinary deterministic kit selection', () => {
  assert.equal(tethysWatchOverlookForSector('sector_ceres_belt', anchors()), null);
  for (const sector of ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge']) {
    const a = everydaySpaceKitDressingForSector(sector, 'belt', () => 0.3, anchors());
    assert.deepEqual(a, everydaySpaceKitDressingForSector(sector, 'belt', () => 0.3, anchors()));
    assert.ok(a.length > 0 && a.length <= 6);
    assert.ok(a.every(row => !PROPS.some(prop => prop.name === row.name)));
  }
});

test('both stopping circles and the 72 WU-wide outside pass clear all four prop envelopes', () => {
  for (const row of rows()) {
    for (const stop of STOPS) {
      assert.ok(distance(row.pos, stop.pos) >= clearance(row) + stop.clearRadius, `${row.name} blocks ${stop.id}`);
    }
    for (let i = 1; i < PASS.length; i++) {
      assert.ok(segmentDistance(row.pos, PASS[i-1], PASS[i]) >= clearance(row) + 36, `${row.name} blocks pass leg ${i}`);
    }
  }
  const result = rows();
  for (let i=0; i<result.length; i++) for (let j=i+1; j<result.length; j++) {
    assert.ok(distance(result[i].pos, result[j].pos) > clearance(result[i]) + clearance(result[j]));
  }
});

test('placement leaves the existing log work, Berth Three, counterweight and freight corridor clear', () => {
  // Existing authored geography, not newly installed routes. These clearance
  // witnesses deliberately include the service work absent from the causal chain.
  const work = [
    { x: -980, z: -820, radius: 100 }, // Berth Three service-yard waypoint
    { x: -760, z: -1000, radius: 100 }, // Berth Three shuttle waypoint
    { x: -950, z: -320, radius: 116 }, // counterweight cradle radius 80 + approach
    { x: -1030, z: -290, radius: 50 }, // ballast body radius 14 + approach
    { x: -1013.97, z: -674.2, radius: 60 }, // surveyor's first scan mark
    { x: -937.37, z: -738.48, radius: 60 }, // surveyor's second scan mark
    { x: -1320, z: 420, radius: 100 }, // existing Quiet fence receiver
  ];
  for (const row of rows()) {
    for (const site of work) assert.ok(distance(row.pos, site) > clearance(row) + site.radius, `${row.name} crowds existing work`);
    assert.ok(segmentDistance(row.pos, { x: -880, z: -520 }, { x: -380, z: -520 }) > clearance(row) + 80);
    assert.ok(segmentDistance(row.pos, { x: -972.5, z: -549.07 }, { x: -640, z: -1180 }) > clearance(row) + 60);
    assert.ok(distance(row.pos, { x: 1050, z: 380 }) > 2000, 'do not enter the trade-hub/Latch Nine service surround');
  }
});

test('approach lip and rack make different readable bearings without moving the simulation', () => {
  const apron = PROPS[0], rack = PROPS[3];
  const lipDirection = { x: -Math.sin(apron.rot), z: Math.cos(apron.rot) };
  assert.ok(lipDirection.x > 0.999 && Math.abs(lipDirection.z) < 1e-10);
  assert.ok(STOPS[0].pos.x > apron.pos.x);
  const cacheBearing = Math.atan2(STOPS[1].lookAt.z-rack.pos.z, STOPS[1].lookAt.x-rack.pos.x);
  assert.equal(rack.rot, cacheBearing);
  assert.ok(distance(STOPS[0].pos, STOPS[1].lookAt) > 4 * distance(STOPS[1].pos, STOPS[1].lookAt));
  assert.ok(distance(STOPS[0].pos, STOPS[1].pos) > 1000, 'the second view requires ordinary flight');
});

test('the production kit consumer dispatches these exact rows through its existing place owner', () => {
  // Bounded source-extracted consumer check. It executes the current production
  // method, not the entire registered world, renderer, Rapier or Save/Continue.
  const source = readFileSync(new URL('../src/systems/world.js', import.meta.url), 'utf8');
  const method = source.match(/  _spawnEverydaySpaceKitDressing\(sector, active, paletteClass\) \{([\s\S]*?)\n  \},\n\n  _spawnWreckAftermathDressing/);
  assert.ok(method, 'the ordinary placement owner must remain inspectable');
  const consume = new Function('everydaySpaceKitDressingForSector', 'EVERYDAY_SPACE_KIT_SALT',
    `return function(sector, active, paletteClass) {${method[1]}\n};`)(everydaySpaceKitDressingForSector, EVERYDAY_SPACE_KIT_SALT);
  const placed = [];
  const owner = {
    state: { meta: { seed: 47 }, world: { residentSectors: { [SECTOR]: { epoch: 6 } } } },
    helpers: { hash32: () => 123, mulberry32: () => () => 0.5 },
    _spawnPlaceProp(active, sector, placeId, pos, options) { placed.push({ placeId, pos, options }); },
  };
  consume.call(owner, { id: SECTOR }, { ...anchors(18000, -22000), pois: [] }, 'core');
  assert.equal(placed.length, 4);
  rows(18000, -22000).forEach((row, i) => {
    assert.equal(placed[i].placeId, row.placeId);
    assert.deepEqual(placed[i].pos, row.pos);
    assert.deepEqual(placed[i].options, {
      paletteClass: 'core', rot: row.rot, name: row.name, radius: row.radius, everydaySpaceKit: true,
    });
  });
});
