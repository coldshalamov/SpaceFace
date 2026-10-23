import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  EVERYDAY_SPACE_KIT_LEGAL_MODELS,
  EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID,
  EVERYDAY_SPACE_KIT_MAX_PER_SECTOR,
  EVERYDAY_SPACE_KIT_SALT,
  everydaySpaceKitDressingForSector,
  isEverydaySpaceKitPlaceId,
} from '../src/data/everydaySpaceKitDressing.js';
import {
  VEIL_RESEARCH_EDGE_ANCHOR as ANCHOR,
  VEIL_RESEARCH_EDGE_MODELS as MODELS,
  VEIL_RESEARCH_EDGE_PASSES as PASSES,
  VEIL_RESEARCH_EDGE_PROPS as PROPS,
  VEIL_RESEARCH_EDGE_SECTOR_ID as SECTOR,
  VEIL_RESEARCH_EDGE_STOPS as STOPS,
  veilResearchEdgeForSector,
} from '../src/data/veilResearchEdge.js';
import { occupationalYardDressingForSector } from '../src/data/occupationalYardDressing.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const station = (dx = 0, dz = 0) => ({
  id: 42, stationId: 'station_veil', pos: { x: 420 + dx, z: -1120 + dz },
});
const anchors = (dx = 0, dz = 0) => ({
  stations: [station(dx, dz)],
  gates: [{ pos: { x: -1907 + dx, z: -3814 + dz } }],
  fields: [{ center: { x: -280 + dx, z: 640 + dz } }],
  wrecks: [],
});
const rows = (dx = 0, dz = 0, rng = () => 0.47) =>
  everydaySpaceKitDressingForSector(SECTOR, 'anomaly', rng, anchors(dx, dz));
const distance = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
function segmentDistance(p, a, b) {
  const x = b.x-a.x, z = b.z-a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z)));
  return distance(p, { x: a.x+t*x, z: a.z+t*z });
}

test('Veil spends four of six existing dressing slots on these four released purposes', () => {
  const result = rows();
  assert.equal(result.length, 4);
  assert.ok(result.length <= EVERYDAY_SPACE_KIT_MAX_PER_SECTOR);
  assert.deepEqual(result.map(r => [r.placeId, r.name, r.radius, r.pos.x, r.pos.z]), [
    ['place_cold_locker', 'Instrument Cold Locker', 10, 505, -1290],
    ['place_utility_module', 'Instrument Service Module', 8, 550, -1290],
    ['place_habitat_pod', 'Instrument Crew Habitat', 8, 590, -1280],
    ['place_observation_blister', 'North Observation Blister', 8, 535, -885],
  ]);
  assert.equal(new Set(result.map(r => r.placeId)).size, 4);
  assert.ok(result.every(r => r.everydaySpaceKit && r.anchor === 'station'));
});

test('occupational stock stays separate from the unchanged forty-six random models', () => {
  assert.equal(EVERYDAY_SPACE_KIT_LEGAL_MODELS.length, 46);
  assert.equal(Object.keys(EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID).length, 46);
  assert.equal(isEverydaySpaceKitPlaceId('place_cold_locker'), false);
  assert.equal(EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID.place_cold_locker, undefined);
  assert.equal(occupationalYardDressingForSector(SECTOR).length, 0,
    'do not overlay an existing Veil occupational locker');
  for (const model of MODELS.slice(1)) {
    const ordinary = EVERYDAY_SPACE_KIT_LEGAL_MODELS.find(row => row.id === model.id);
    assert.equal(model.radius, ordinary.radius);
    assert.equal(model.file, ordinary.file);
  }
});

test('only one finite named live Veil station may translate the composition', () => {
  const input = anchors(18000, -22000);
  input.stations.unshift({ id: 9, stationId: 'unrelated', pos: { x: 100, z: 100 } });
  const result = everydaySpaceKitDressingForSector(SECTOR, 'anomaly', () => 0.2, input);
  result.forEach((row, i) => {
    assert.equal(row.pos.x, PROPS[i].pos.x + 18000);
    assert.equal(row.pos.z, PROPS[i].pos.z - 22000);
    assert.deepEqual(row.anchorPos, input.stations[1].pos);
  });
  input.stations.reverse();
  assert.deepEqual(everydaySpaceKitDressingForSector(SECTOR, 'anomaly', () => 0.9, input), result);
  for (const stations of [[], [station(), station()], [{ id: 'station_veil', pos: { x: 0, z: 0 } }]]) {
    assert.equal(veilResearchEdgeForSector(SECTOR, { stations }), null);
  }
  for (const value of [null, '420', NaN, Infinity, -Infinity]) {
    assert.equal(veilResearchEdgeForSector(SECTOR, { stations: [{ ...station(), pos: { x: value, z: -1120 } }] }), null);
    assert.equal(veilResearchEdgeForSector(SECTOR, { stations: [{ ...station(), pos: { x: 420, z: value } }] }), null);
  }
  assert.equal(veilResearchEdgeForSector('sector_ceres_belt', anchors()), null);
});

test('repeat placement is immutable, consumes no RNG and does not invent absent props', () => {
  const input = anchors(), snapshot = structuredClone(input);
  for (const value of [0, 0.1, 0.47, 0.99]) {
    let calls = 0;
    assert.deepEqual(rows(0, 0, () => { calls++; return value; }), rows());
    assert.equal(calls, 0);
  }
  const result = veilResearchEdgeForSector(SECTOR, input);
  assert.deepEqual(input, snapshot);
  assert.ok(Object.isFrozen(result));
  assert.ok(result.every(r => Object.isFrozen(r) && Object.isFrozen(r.pos)));
  assert.deepEqual(everydaySpaceKitDressingForSector(SECTOR, 'anomaly', () => 0.5, {}), []);
  const fallback = everydaySpaceKitDressingForSector(SECTOR, 'anomaly', () => 0.5, {
    ...anchors(), stations: [{ id: 'not-a-named-live-station', pos: { x: 420, z: -1120 } }],
  });
  assert.ok(fallback.length > 0);
  assert.ok(fallback.every(r => isEverydaySpaceKitPlaceId(r.placeId)));
  assert.ok(fallback.every(r => !PROPS.some(p => p.name === r.name)));
});

function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('all other exercised sectors retain the sealed PR552 picker output', () => {
  const input = {
    stations: [{ stationId: 'station_customs', pos: { x: -640, z: -1180 } },
      { stationId: 'station_tethys', pos: { x: 1050, z: 380 } }],
    gates: [{ pos: { x: -3280, z: 0 } }], fields: [{ center: { x: -520, z: 680 } }],
    wrecks: [{ id: 'ordinary_wreck', pos: { x: -1000, z: -500 } }],
  };
  const snapshots = [];
  for (const seed of [47, 101, 202, 303, 404, 505, 606, 707]) {
    for (const [sector, palette] of [
      ['sector_helios_prime', 'core'], ['sector_ceres_belt', 'belt'],
      ['sector_tethys_junction', 'core'], ['sector_vesta_forge', 'belt'],
      ['sector_pallas_drift', 'fringe'], ['sector_triton_wake', 'anomaly'],
    ]) snapshots.push(everydaySpaceKitDressingForSector(sector, palette, seeded(seed), input));
  }
  const digest = createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
  // Independently computed from the unmodified PR552 module, not this candidate.
  assert.equal(digest, '5448009fbbc07aa89b454c7fc85f37597ab09e5a3ff2f8c6d08b40e87230f690');
});

// Execute the actual resolver body without importing its large Three.js graph.
// Unrelated family guards, tables and constants are stand-ins. The explicit
// PLACE_FILES array expression and kit map are production data; the locker entry
// itself is not mocked. This is resolver extraction, not full renderer execution.
function extractedPlaceResolver() {
  const parts = source('src/render/partsLibrary.js');
  const table = parts.match(/const PLACE_FILES = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
  const body = parts.match(/function placeFileForEntity\(entity\) \{([\s\S]*?)\n\}\n/);
  assert.ok(table && body, 'production place table and resolver must be inspectable');
  const guards = {
    isOrchardFrame: () => false, isLatchActor: () => false,
    isTallyThreeAssessor: () => false, isCeresWorkfleetPlace: () => false,
    isCeresShipbreakSection: () => false, hasExplicitAuthoredGeologyPresentation: () => false,
    factionBerthById: () => null,
    LATCH_PLACE_FILE: '', CERES_SHIPBREAK_FILES: {},
    CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID: {},
    OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID: {
      place_debris_chunk: 'places/place_debris_chunk.glb',
      place_dead_hulk: 'places/place_dead_hulk.glb',
      place_dock_interior: 'places/place_dock_interior.glb',
    },
    STATION_ARCHETYPE_FILES: [], TRADE_HUB_OVERLAY_FILES: [],
    WRECK_AFTERMATH_PLACE_FILE_BY_ID: {}, EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID,
  };
  return new Function(...Object.keys(guards), `
    const PLACE_FILES = Object.freeze([${table[1]}]);
    const PLACE_FILE_BY_ID = Object.fromEntries(PLACE_FILES.map(file => [
      file.replace(/^places\\//, '').replace(/\\.glb$/, ''), file]));
    return function(entity) {${body[1]}\n};
  `)(...Object.values(guards));
}

test('actual place resolver loads the occupational exception and the three kit bodies', () => {
  const resolve = extractedPlaceResolver();
  for (const model of MODELS) {
    assert.equal(resolve({ type: 'fx', data: { placeId: model.id, everydaySpaceKit: true } }), model.file);
    const ordinary = resolve({ type: 'fx', data: { placeId: model.id } });
    assert.equal(ordinary, model.id === 'place_cold_locker' ? model.file : null);
    const bytes = readFileSync(new URL(`assets/ships/release/parts/${model.file}`, root));
    assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
    assert.ok(bytes.length > 1000);
  }
});

// Full projected release bounds, rounded outward, including elevated geometry:
// locker 6.30 * (10/12) < 6; utility 3.81 < 4; habitat 7.01 < 8;
// blister 4.46 < 5. These are not the smaller plane-slice collision radii.
const CLEARANCE = Object.freeze({
  place_cold_locker: 6, place_utility_module: 4,
  place_habitat_pod: 8, place_observation_blister: 5,
});
// Authoritative source: sectorActivityPockets.js, veil_research_rounds.
const TENDER = [{ x: 380.7, z: -1015.1 }, { x: 459.3, z: -1224.9 }];
const LISTENER = [{ x: 522.9, z: -1149.4 }, { x: 476.6, z: -1025.7 }];

test('both waiting circles and optional passes clear the complete prop footprints', () => {
  for (const prop of PROPS) {
    for (const stop of STOPS) assert.ok(distance(prop.pos, stop.pos) > CLEARANCE[prop.placeId] + stop.clearRadius);
    for (const pass of Object.values(PASSES)) for (let i=1; i<pass.length; i++) {
      assert.ok(segmentDistance(prop.pos, pass[i-1], pass[i]) > CLEARANCE[prop.placeId] + 36,
        `${prop.name} blocks the pilot pass`);
    }
  }
  for (let i=0; i<PROPS.length; i++) for (let j=i+1; j<PROPS.length; j++) {
    assert.ok(distance(PROPS[i].pos, PROPS[j].pos) > CLEARANCE[PROPS[i].placeId] + CLEARANCE[PROPS[j].placeId]);
  }
});

test('work and observation remain outside the station and authored craft corridors', () => {
  // M research station: measured planar skin 71.545 WU. Use 90 for its
  // complete drawn surround; Drifter/Ranger silhouettes <17 WU, use 18.
  for (const stop of STOPS) {
    assert.ok(distance(stop.pos, ANCHOR) > 90 + stop.clearRadius);
    for (const route of [TENDER, LISTENER]) {
      assert.ok(segmentDistance(stop.pos, ...route) > 18 + stop.clearRadius);
    }
  }
  for (const prop of PROPS) {
    assert.ok(distance(prop.pos, ANCHOR) > 90 + CLEARANCE[prop.placeId]);
    for (const route of [TENDER, LISTENER]) {
      assert.ok(segmentDistance(prop.pos, ...route) > 36 + CLEARANCE[prop.placeId]);
    }
    assert.ok(distance(prop.pos, { x: -240, z: -720 }) > 500, 'preserve Surge Shrine');
    assert.ok(distance(prop.pos, { x: 0, z: 0 }) > 1000, 'leave the missing center missing');
  }
  const stop = STOPS.find(s => s.id === 'observation').pos;
  assert.ok(distance(stop, TENDER[0]) < 125);
  assert.ok(distance(stop, LISTENER[1]) < 95);
  assert.ok(distance(ANCHOR, { x: 900, z: 1500 }) > 2600, 'Quiet Ice is a separate journey');
});

test('the habitat airlock faces the empty waiting space, not the instruments', () => {
  const habitat = PROPS.find(p => p.placeId === 'place_habitat_pod');
  const wait = STOPS.find(p => p.id === 'working_wait').pos;
  const dx = wait.x-habitat.pos.x, dz = wait.z-habitat.pos.z;
  assert.ok((-Math.cos(habitat.rot)*dx-Math.sin(habitat.rot)*dz)/Math.hypot(dx,dz) > 0.999999);
});

test('existing world placement dispatches exactly these rows, including locker radius', () => {
  const method = source('src/systems/world.js').match(/  _spawnEverydaySpaceKitDressing\(sector, active, paletteClass\) \{([\s\S]*?)\n  \},\n\n  _spawnWreckAftermathDressing/);
  assert.ok(method);
  const consume = new Function('everydaySpaceKitDressingForSector', 'EVERYDAY_SPACE_KIT_SALT',
    `return function(sector, active, paletteClass) {${method[1]}\n};`)(everydaySpaceKitDressingForSector, EVERYDAY_SPACE_KIT_SALT);
  const placed = [];
  const owner = {
    state: { meta: { seed: 47 }, world: { residentSectors: { [SECTOR]: { epoch: 9 } } } },
    helpers: { hash32: () => 123, mulberry32: () => () => 0.3 },
    _spawnPlaceProp(active, sector, placeId, pos, options) { placed.push({ placeId, pos, options }); },
  };
  consume.call(owner, { id: SECTOR }, { ...anchors(18000,-22000), pois: [] }, 'anomaly');
  assert.equal(placed.length, 4);
  rows(18000,-22000).forEach((row, i) => {
    assert.equal(placed[i].placeId, row.placeId);
    assert.deepEqual(placed[i].pos, row.pos);
    assert.equal(placed[i].options.radius, row.radius);
    assert.equal(placed[i].options.name, row.name);
    assert.equal(placed[i].options.everydaySpaceKit, true);
  });
});

test('the existing docked Rumors lead stays truthful even when authored props are absent', () => {
  const rumor = source('src/data/frontierRumors.js').match(/  station_veil: '([^\n]*)',/)[1];
  assert.ok(rumor.includes('Surge Shrine'));
  assert.ok(rumor.endsWith('If you are here to watch, leave the instrument run clear.'));
  assert.ok(!/blister|sample accepted|food|Vael hospitality/.test(rumor));
});
