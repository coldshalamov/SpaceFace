import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import * as partsLibrary from '../src/render/partsLibrary.js';

function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
};

const RELEASE_ROOT = 'assets/ships/release/parts/';
const BOOT_FILES = new Set([
  'wholeships/kestrel.glb',
  'places/place_station_trade_hub.glb',
]);

const FINGERPRINT_CASES = [
  {
    id: 'patrol-1', type: 'ship', alive: true, team: 2, factionId: 'faction_free', radius: 12,
    data: { defId: 'ship_wasp' },
  },
  {
    id: 'patrol-7', type: 'ship', alive: true, team: 2, factionId: 'faction_free', radius: 12,
    data: { defId: 'ship_wasp' },
  },
  {
    id: 'miner-3', type: 'ship', alive: true, team: 2, factionId: 'faction_union', radius: 18,
    data: { defId: 'ship_pelican' },
  },
  {
    id: 'hauler-4', type: 'ship', alive: true, team: 2, factionId: 'faction_union', radius: 20,
    data: { defId: 'ship_mule' },
  },
  {
    id: 'interceptor-9', type: 'ship', alive: true, team: 2, factionId: 'faction_free', radius: 11,
    data: { defId: 'ship_hornet' },
  },
];

const ALL_SHIP_CASES = SHIPS.flatMap((ship, index) => ([
  {
    id: `catalog-a-${ship.id}`, type: 'ship', alive: true, team: 2,
    factionId: index % 2 ? 'faction_union' : 'faction_free', radius: ship.collisionRadius,
    data: { defId: ship.id },
  },
  {
    id: `catalog-b-${ship.id}`, type: 'ship', alive: true, team: 2,
    factionId: index % 2 ? 'faction_free' : 'faction_union', radius: ship.collisionRadius,
    data: { defId: ship.id },
  },
]));

const BRANCH_CASES = [
  {
    id: 'unknown-team-one', type: 'ship', alive: true, team: 1,
    factionId: 'faction_free', radius: 13, data: { defId: 'ship_unknown_fixture' },
  },
  {
    id: 'vael-no-greebles', type: 'ship', alive: true, team: 2,
    factionId: 'faction_vael', radius: 14, data: { defId: 'ship_wasp' },
  },
  {
    id: 'team-one-repair-pod', type: 'ship', alive: true, team: 1,
    factionId: 'faction_free', radius: 18, data: { defId: 'ship_drifter' },
  },
  {
    id: 'runtime-weapon-branches', type: 'ship', alive: true, team: 2,
    factionId: 'faction_free', radius: 22,
    data: { defId: 'ship_bastion', weapons: [
      { defId: 'wpn_pulse_laser_s', facing: 'front', size: 'S' },
      { defId: 'wpn_autocannon_s', facing: 'front', size: 'S' },
      { defId: 'wpn_flak_turret_s', facing: 'turret', size: 'S' },
      { defId: 'wpn_beam_laser_m', facing: 'front', size: 'M' },
      { defId: 'wpn_railgun_m', facing: 'front', size: 'M' },
      { defId: 'wpn_plasma_cannon_m', facing: 'front', size: 'M' },
    ] },
  },
  {
    id: 'fitting-and-size-branches', type: 'ship', alive: true, team: 2,
    factionId: 'faction_union', radius: 18,
    data: {
      defId: 'ship_drifter',
      fittings: ['wpn_autocannon_m', 'wpn_missile_rack_m', 'wpn_siege_lance_l'],
      weapons: [
        { facing: 'turret', size: 'S' },
        { facing: 'rear', size: 'L' },
        { facing: 'left', size: 'M' },
      ],
    },
  },
];

const MODULAR_CASES = [...FINGERPRINT_CASES, ...ALL_SHIP_CASES, ...BRANCH_CASES];

const PRE_CHANGE_VISUAL_FINGERPRINTS = [
  { id: 'patrol-1', slots: {
    hull: ['hulls/hull_fighter.glb'], cockpit: ['cockpits/cockpit_slab.glb'],
    engine: ['engines/engine_vector.glb'], fin: ['fins/fin_delta.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb'], pod: ['pods/pod_utility.glb'],
    gear: ['gear/skid_trio.glb'],
    greeble: ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb'],
  } },
  { id: 'patrol-7', slots: {
    hull: ['hulls/hull_fighter.glb'], cockpit: ['cockpits/cockpit_recessed.glb'],
    engine: ['engines/engine_vector.glb'], fin: ['fins/fin_wedge.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb'], pod: ['pods/pod_utility.glb'],
    gear: ['gear/skid_trio.glb'],
    greeble: ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb'],
  } },
  { id: 'miner-3', slots: {
    hull: ['hulls/hull_miner.glb'], cockpit: ['cockpits/cockpit_slab.glb'],
    engine: ['engines/engine_ion_twin.glb'], fin: ['fins/fin_stabilator.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb'], pod: ['pods/pod_utility.glb'],
    gear: ['gear/skid_quad.glb'],
    greeble: ['greebles/greeble_hatches.glb', 'greebles/greeble_antennas.glb'],
  } },
  { id: 'hauler-4', slots: {
    hull: ['hulls/hull_freighter.glb'], cockpit: ['cockpits/cockpit_recessed.glb'],
    engine: ['engines/engine_industrial.glb'], fin: ['fins/fin_stabilator.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb'],
    pod: ['pods/pod_cargo_container.glb', 'pods/pod_utility.glb'],
    gear: ['gear/skid_quad.glb'],
    greeble: ['greebles/greeble_pipes.glb', 'greebles/greeble_armor_plates.glb'],
  } },
  { id: 'interceptor-9', slots: {
    hull: ['hulls/hull_interceptor.glb'], cockpit: ['cockpits/cockpit_dome.glb'],
    engine: ['engines/engine_vector.glb'], fin: ['fins/fin_wedge.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb', 'weapons/weapon_turret_dual.glb'],
    pod: ['pods/pod_utility.glb'], gear: ['gear/skid_trio.glb'],
    greeble: ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb'],
  } },
];

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const HULL_BY_DEF_ID = {
  ship_kestrel: 'hulls/hull_starter.glb', ship_drifter: 'hulls/hull_multirole.glb',
  ship_wasp: 'hulls/hull_fighter.glb', ship_pelican: 'hulls/hull_miner.glb',
  ship_ironback: 'hulls/hull_miner.glb', ship_mule: 'hulls/hull_freighter.glb',
  ship_atlas: 'hulls/hull_freighter.glb', ship_hornet: 'hulls/hull_interceptor.glb',
  ship_ranger: 'hulls/hull_multirole.glb', ship_bastion: 'hulls/hull_corvette.glb',
  ship_warden: 'hulls/hull_frigate.glb', ship_colossus: 'hulls/hull_capital.glb',
  ship_leviathan: 'hulls/hull_capital.glb',
};
const ENGINE_BY_DEF_ID = {
  ship_kestrel: 'engines/engine_ion_small.glb', ship_drifter: 'engines/engine_ion_small.glb',
  ship_ranger: 'engines/engine_ion_small.glb', ship_pelican: 'engines/engine_ion_twin.glb',
  ship_ironback: 'engines/engine_ion_twin.glb', ship_wasp: 'engines/engine_vector.glb',
  ship_hornet: 'engines/engine_vector.glb', ship_mule: 'engines/engine_industrial.glb',
  ship_atlas: 'engines/engine_industrial.glb', ship_bastion: 'engines/engine_plasma_ring.glb',
  ship_warden: 'engines/engine_plasma_ring.glb', ship_colossus: 'engines/engine_plasma_ring.glb',
  ship_leviathan: 'engines/engine_plasma_ring.glb',
};

function fixtureHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fixtureSeededFile(slot, seed) {
  const files = partsLibrary.PART_LIBRARY_CONTRACT.slots[slot];
  return files[((seed ^ fixtureHash(slot)) >>> 0) % files.length];
}

function fixtureWeaponFile(wdef, facing, size) {
  const id = String(wdef && wdef.id || '').toLowerCase();
  const tracking = String(wdef && wdef.tracking || '').toLowerCase();
  if (facing === 'turret' || tracking === 'auto_turret') return 'weapons/weapon_turret_dual.glb';
  if (size === 'L' || id.includes('lance') || id.includes('beam')) return 'weapons/weapon_lance.glb';
  if (id.includes('rail')) return 'weapons/weapon_railgun.glb';
  if (id.includes('autocannon') || id.includes('gatling')) return 'weapons/weapon_gatling.glb';
  if (id.includes('torpedo') || id.includes('missile') || id.includes('plasma')) return 'weapons/weapon_heavy_cannon.glb';
  return 'weapons/weapon_pulse_cannon.glb';
}

function fixtureWeaponFiles(entity, shipDef) {
  const data = entity.data || {};
  const runtime = Array.isArray(data.weapons) ? data.weapons : [];
  const fitted = Array.isArray(data.fittings) ? data.fittings.filter((id) => WEAPON_BY_ID.has(id)) : [];
  const hardpoints = shipDef && shipDef.visuals && Array.isArray(shipDef.visuals.hardpoints)
    ? shipDef.visuals.hardpoints : [];
  const slots = shipDef && shipDef.slots && Array.isArray(shipDef.slots.weapon) ? shipDef.slots.weapon : [];
  const count = Math.min(6, Math.max(runtime.length, fitted.length, hardpoints.length, slots.length));
  const files = [];
  for (let index = 0; index < count; index++) {
    const live = runtime[index] || {};
    const hardpoint = hardpoints[index] || {};
    const slot = slots[index];
    const defId = live.defId || fitted[index] || null;
    const wdef = WEAPON_BY_ID.get(defId) || null;
    const facing = live.facing || hardpoint.facing
      || (slot && typeof slot === 'object' && slot.facing) || 'front';
    const size = live.size || (wdef && wdef.size) || hardpoint.size
      || (typeof slot === 'string' ? slot : slot && slot.size) || 'S';
    files.push(fixtureWeaponFile(wdef, facing, size));
  }
  return [...new Set(files)];
}

function fixturePodFiles(entity, shipDef) {
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const cargo = shipDef && shipDef.slots && Array.isArray(shipDef.slots.cargo) ? shipDef.slots.cargo.length : 0;
  const utility = shipDef && shipDef.slots && Array.isArray(shipDef.slots.utility) ? shipDef.slots.utility.length : 0;
  const files = [];
  if (cargo >= 2 || role.includes('freighter') || role.includes('miner')) {
    files.push(role.includes('miner') ? 'pods/pod_utility.glb' : 'pods/pod_cargo_container.glb');
  }
  if (utility > 0 && !role.includes('capital')) files.push('pods/pod_utility.glb');
  if (role === 'starter' || role === 'multirole' || entity.team === 1) files.push('pods/pod_repair_patch.glb');
  return [...new Set(files.slice(0, 3))];
}

function fixtureGreebleFiles(entity, shipDef) {
  if (entity.factionId === 'faction_vael') return [];
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const hints = shipDef && shipDef.visuals && shipDef.visuals.tiers && shipDef.visuals.tiers[0]
    && shipDef.visuals.tiers[0].hints || {};
  const files = role.includes('miner') || role.includes('freighter')
    ? ['greebles/greeble_pipes.glb', 'greebles/greeble_armor_plates.glb', 'greebles/greeble_vents.glb']
    : role.includes('fighter') || role.includes('interceptor')
      ? ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb', 'greebles/greeble_vents.glb']
      : ['greebles/greeble_hatches.glb', 'greebles/greeble_antennas.glb', 'greebles/greeble_armor_plates.glb'];
  return files.slice(0, Number.isFinite(hints.greeble) && hints.greeble > 0.75 ? 3 : 2);
}

function independentExpectedSlots(entity) {
  const defId = entity.data && entity.data.defId;
  const shipDef = SHIP_BY_ID.get(defId);
  const seed = fixtureHash(`${entity.id}|${defId}|${entity.factionId || ''}`);
  const regularHulls = partsLibrary.PART_LIBRARY_CONTRACT.slots.hull
    .filter((file) => !file.startsWith('wholeships/'));
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const heavy = (entity.radius || 0) >= 18 || role.includes('freighter')
    || role.includes('miner') || role.includes('capital');
  const slots = {
    hull: [HULL_BY_DEF_ID[defId]
      || regularHulls[((seed ^ fixtureHash('hull')) >>> 0) % regularHulls.length]],
    cockpit: [fixtureSeededFile('cockpit', seed)],
    engine: [ENGINE_BY_DEF_ID[defId] || 'engines/engine_ion_small.glb'],
    fin: [fixtureSeededFile('fin', seed)],
  };
  const weapons = fixtureWeaponFiles(entity, shipDef);
  const pods = fixturePodFiles(entity, shipDef);
  if (weapons.length) slots.weapon = weapons;
  if (pods.length) slots.pod = pods;
  slots.gear = [heavy ? 'gear/skid_quad.glb' : 'gear/skid_trio.glb'];
  const greebles = fixtureGreebleFiles(entity, shipDef);
  if (greebles.length) slots.greeble = greebles;
  return slots;
}

function fixtureRecord(url) {
  const geometry = new THREE.BoxGeometry(1, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.7, metalness: 0.3 });
  return {
    url,
    assetId: url.endsWith('wholeships/kestrel.glb') ? 'SF_K0_KESTREL_BORROWED_TIME' : `FIXTURE_${url}`,
    bounds: { min: [-0.5, -0.25, -0.25], max: [0.5, 0.25, 0.25], size: [1, 0.5, 0.5], center: [0, 0, 0] },
    primitives: [{
      key: `${url}#fixture`,
      name: 'LOD0_Body',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', tint: 'hull' }),
    }],
    markers: [],
  };
}

function fallbackShip() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial()));
  root.add(hull);
  root.userData.hull = hull;
  return root;
}

function relativeFile(url) {
  return String(url).replace(/\\/g, '/').replace(RELEASE_ROOT, '');
}

function flattenUnique(slotMap) {
  return [...new Set(Object.values(slotMap || {}).flat().map(relativeFile))].sort();
}

const complexityCache = new Map();
function releaseGlbComplexity(file) {
  let cached = complexityCache.get(file);
  if (cached) return cached;
  const bytes = readFileSync(new URL(`../assets/ships/release/parts/${file}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file} must be a binary glTF`);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().replace(/[\0\s]+$/, ''));
  let triangles = 0;
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessorIndex = primitive.indices ?? (primitive.attributes && primitive.attributes.POSITION);
      triangles += Math.floor(((gltf.accessors && gltf.accessors[accessorIndex] || {}).count || 0) / 3);
    }
  }
  cached = { compressedBytes: bytes.length, textureRefs: (gltf.textures || []).length, triangles };
  complexityCache.set(file, cached);
  return cached;
}

function releasePlanComplexity(slotMap) {
  const total = { compressedBytes: 0, textureRefs: 0, triangles: 0 };
  for (const file of flattenUnique(slotMap)) {
    const row = releaseGlbComplexity(file);
    for (const key of Object.keys(total)) total[key] += row[key];
  }
  return total;
}

const PROFESSIONAL_ENTITY_ADMISSION_BUDGET = Object.freeze({
  // This is an incremental residency/admission ceiling, not an art-quality cap: assets retain their
  // authored LODs and textures, while one entity cannot monopolize a 60 Hz frame with a family dump.
  compressedBytes: 24 * 1024 * 1024,
  textureRefs: 64,
  triangles: 100_000,
});

function fullModularFamilyComplexity() {
  const files = Object.entries(partsLibrary.PART_LIBRARY_CONTRACT.slots)
    .filter(([slot]) => slot !== 'place')
    .flatMap(([, slotFiles]) => slotFiles)
    .filter((file) => !file.startsWith('wholeships/'));
  return releasePlanComplexity({ family: files });
}

async function composeWithFixtureLoader(entity) {
  const renderer = {};
  const scene = new THREE.Scene();
  const requests = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const loadAuthoredPart = async (url) => {
    requests.push(url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    return fixtureRecord(url);
  };

  await partsLibrary.preloadAuthoredPartLibrary(renderer, { releaseMode: true, loadAuthoredPart });
  const boundary = partsLibrary.wrapShipWithAuthoredParts(entity, fallbackShip(), {
    releaseMode: true,
    loadAuthoredPart,
  });
  entity.mesh = boundary;
  scene.add(boundary);
  boundary.userData.requestAuthoredUpgrade(renderer, scene);

  for (let turn = 0; turn < 20 && boundary.userData.authoredAssetState !== 'authored'; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(boundary.userData.authoredAssetState, 'authored');

  const demandRequests = requests.map(relativeFile).filter((file) => !BOOT_FILES.has(file));
  const result = {
    plan: partsLibrary.authoredPreloadPlanForEntity(entity),
    requested: [...new Set(demandRequests)].sort(),
    used: flattenUnique(boundary.userData.authoredSlots),
    slots: Object.fromEntries(Object.entries(boundary.userData.authoredSlots)
      .map(([slot, urls]) => [slot, urls.map(relativeFile)])),
    maxInFlight,
  };
  partsLibrary.invalidatePartsLibraryCaches(renderer);
  return result;
}

test('modular demand plans contain exactly the deterministic authored files the composition uses', async () => {
  const results = [];
  for (const source of MODULAR_CASES) {
    const entity = structuredClone(source);
    results.push({ id: entity.id, ...(await composeWithFixtureLoader(entity)) });
  }

  const fingerprintIds = new Set(FINGERPRINT_CASES.map((entity) => entity.id));
  assert.deepEqual(results.filter((result) => fingerprintIds.has(result.id))
    .map(({ id, slots }) => ({ id, slots })), PRE_CHANGE_VISUAL_FINGERPRINTS,
    'exact demand must preserve the pre-change seed-to-part visual fingerprints byte-for-byte');

  for (const result of results) {
    const source = MODULAR_CASES.find((entity) => entity.id === result.id);
    assert.deepEqual(result.slots, independentExpectedSlots(source),
      `${result.id} composition must retain the independent pre-change selection contract`);
    assert.deepEqual(result.requested, result.used,
      `${result.id} must not decode or retain authored files absent from its final composition`);
    assert.deepEqual(flattenUnique(result.plan), result.used,
      `${result.id} pure demand plan must predict the live composition exactly`);
    assert.equal(result.maxInFlight, 1, `${result.id} must preserve serial decode admission`);
  }

  const wasp = results.find((result) => result.id === 'patrol-1');
  assert.ok(wasp.requested.length < 16, `ordinary Wasp demand must be far below the former 34 files; got ${wasp.requested.length}`);

  const fullFamily = fullModularFamilyComplexity();
  for (const result of results) {
    const workload = releasePlanComplexity(result.plan);
    assert.ok(workload.compressedBytes <= PROFESSIONAL_ENTITY_ADMISSION_BUDGET.compressedBytes,
      `${result.id} exact admission is ${(workload.compressedBytes / 1048576).toFixed(1)} MiB compressed`);
    assert.ok(workload.textureRefs <= PROFESSIONAL_ENTITY_ADMISSION_BUDGET.textureRefs,
      `${result.id} exact admission references ${workload.textureRefs} textures`);
    assert.ok(workload.triangles <= PROFESSIONAL_ENTITY_ADMISSION_BUDGET.triangles,
      `${result.id} exact admission decodes ${workload.triangles} triangles`);
    assert.ok(workload.compressedBytes <= fullFamily.compressedBytes * 0.40,
      `${result.id} must avoid at least 60% of the former family compressed workload`);
    assert.ok(workload.textureRefs <= fullFamily.textureRefs * 0.45,
      `${result.id} must avoid at least 55% of the former family texture workload`);
    assert.ok(workload.triangles <= fullFamily.triangles * 0.60,
      `${result.id} must avoid at least 40% of the former family geometry workload`);
  }

});

test('whole-ship demand remains a one-file path', () => {
  const entity = {
    id: 'hostile-body', type: 'ship', factionId: 'faction_pirate',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  };
  assert.deepEqual(partsLibrary.authoredPreloadPlanForEntity(entity), {
    hull: ['wholeships/ashline_dart.glb'],
  });
});

test('concurrent entity demands merge into one serial renderer admission lane', async () => {
  const renderer = {};
  const loads = new Map();
  let inFlight = 0;
  let maxInFlight = 0;
  const loadAuthoredPart = async (url) => {
    loads.set(url, (loads.get(url) || 0) + 1);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight--;
    return fixtureRecord(url);
  };
  const options = { releaseMode: true, loadAuthoredPart };
  await partsLibrary.preloadAuthoredPartLibrary(renderer, options);

  const dart = { id: 'dart-a', type: 'ship', data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' } };
  const lode = { id: 'lode-a', type: 'ship', data: { defId: 'ship_bastion', lootTableId: 'bruiser_brawler' } };
  const [dartLibrary, lodeLibrary] = await Promise.all([
    partsLibrary.preloadAuthoredAssetsForEntity(renderer, dart, options),
    partsLibrary.preloadAuthoredAssetsForEntity(renderer, lode, options),
  ]);
  const repeatedDartLibrary = await partsLibrary.preloadAuthoredAssetsForEntity(renderer, dart, options);

  assert.equal(dartLibrary, lodeLibrary);
  assert.equal(lodeLibrary, repeatedDartLibrary);
  assert.equal(maxInFlight, 1, 'all entity plans sharing a renderer must admit one decode at a time');
  const dartUrl = `${RELEASE_ROOT}wholeships/ashline_dart.glb`;
  const lodeUrl = `${RELEASE_ROOT}wholeships/ashline_lode.glb`;
  assert.equal(loads.get(dartUrl), 1, 'overlapping and repeated Dart demand must decode once');
  assert.equal(loads.get(lodeUrl), 1, 'overlapping Lode demand must decode once');
  const retained = (repeatedDartLibrary.get('hull') || []).map((record) => record.url);
  assert.ok(retained.includes(dartUrl), 'merged hull slot must retain Dart');
  assert.ok(retained.includes(lodeUrl), 'merged hull slot must retain Lode');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});
