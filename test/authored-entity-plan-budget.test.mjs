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

// Required packaged whole-ship bodies: the roster defIds resolve their production GLB through
// wholeShipVisualForEntity, not the modular slot grammar. Keep the fingerprint entities on roster
// hulls so this table pins the exact production file each defId must select.
const WHOLE_SHIP_FILE_BY_DEF = Object.freeze({
  ship_kestrel: 'wholeships/kestrel.glb', ship_wasp: 'wholeships/wasp_production_v1.glb',
  ship_pelican: 'wholeships/pelican_production_v1.glb', ship_mule: 'wholeships/mule_production_v1.glb',
  ship_drifter: 'wholeships/drifter_production_v1.glb', ship_hornet: 'wholeships/hornet_production_v1.glb',
  ship_ironback: 'wholeships/ironback_production_v1.glb', ship_bastion: 'wholeships/bastion_production_v1.glb',
  ship_atlas: 'wholeships/atlas_production_v1.glb', ship_ranger: 'wholeships/ranger_production_v1.glb',
  ship_warden: 'wholeships/warden_production_v1.glb', ship_colossus: 'wholeships/colossus_production_v1.glb',
  ship_leviathan: 'wholeships/leviathan_production_v1.glb', ship_hawser: 'wholeships/yard_tug.glb',
});

// resolveRequiredWholeShipRecord matches records on file AND assetId, so fixtures must carry the
// real packaged identity (partsLibrary WHOLE_SHIP_ASSET_ID_* tables).
const WHOLE_SHIP_ASSET_ID_BY_FILE = Object.freeze({
  'wholeships/kestrel.glb': 'SF_K0_KESTREL_BORROWED_TIME_V4',
  'wholeships/wasp_production_v1.glb': 'SF_WASP_PRODUCTION_V1',
  'wholeships/pelican_production_v1.glb': 'SF_PELICAN_PRODUCTION_V1',
  'wholeships/mule_production_v1.glb': 'SF_MULE_PRODUCTION_V1',
  'wholeships/drifter_production_v1.glb': 'SF_DRIFTER_PRODUCTION_V1',
  'wholeships/hornet_production_v1.glb': 'SF_HORNET_PRODUCTION_V1',
  'wholeships/ironback_production_v1.glb': 'SF_IRONBACK_PRODUCTION_V1',
  'wholeships/bastion_production_v1.glb': 'SF_BASTION_PRODUCTION_V1',
  'wholeships/atlas_production_v1.glb': 'SF_ATLAS_PRODUCTION_V1',
  'wholeships/ranger_production_v1.glb': 'SF_RANGER_PRODUCTION_V1',
  'wholeships/warden_production_v1.glb': 'SF_WARDEN_PRODUCTION_V1',
  'wholeships/colossus_production_v1.glb': 'SF_COLOSSUS_PRODUCTION_V1',
  'wholeships/leviathan_production_v1.glb': 'SF_LEVIATHAN_PRODUCTION_V1',
  'wholeships/ashline_dart.glb': 'SF_WHOLESHIP_ASHLINE_DART',
  'wholeships/ashline_lode.glb': 'SF_WHOLESHIP_ASHLINE_LODE',
  'wholeships/ashline_rig.glb': 'SF_WHOLESHIP_ASHLINE_RIG',
  'wholeships/ashline_rig_corsair_blade.glb': 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',
  'wholeships/helios_span.glb': 'SF_WHOLESHIP_HELIOS_SPAN',
  'wholeships/helios_span_dmc.glb': 'SF_WHOLESHIP_HELIOS_SPAN_DMC',
  'wholeships/helios_span_mts.glb': 'SF_WHOLESHIP_HELIOS_SPAN_MTS',
  'wholeships/helios_span_reach.glb': 'SF_WHOLESHIP_HELIOS_SPAN_REACH',
  'wholeships/wasp_free_militia.glb': 'SF_WASP_FREE_MILITIA',
  'wholeships/wasp_mts_escort.glb': 'SF_WASP_MTS_ESCORT',
  'wholeships/wasp_scn_patrol.glb': 'SF_WASP_SCN_PATROL',
  'wholeships/yard_tug.glb': 'SF_WHOLESHIP_YARD_TUG',
});

const PRE_CHANGE_VISUAL_FINGERPRINTS = [
  { id: 'patrol-1', slots: { hull: ['wholeships/wasp_production_v1.glb'] } },
  { id: 'patrol-7', slots: { hull: ['wholeships/wasp_production_v1.glb'] } },
  { id: 'miner-3', slots: { hull: ['wholeships/pelican_production_v1.glb'] } },
  { id: 'hauler-4', slots: { hull: ['wholeships/mule_production_v1.glb'] } },
  { id: 'interceptor-9', slots: { hull: ['wholeships/hornet_production_v1.glb'] } },
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
  ship_hawser: 'hulls/hull_freighter.glb',
};
const ENGINE_BY_DEF_ID = {
  ship_kestrel: 'engines/engine_ion_small.glb', ship_drifter: 'engines/engine_ion_small.glb',
  ship_ranger: 'engines/engine_ion_small.glb', ship_pelican: 'engines/engine_ion_twin.glb',
  ship_ironback: 'engines/engine_ion_twin.glb', ship_wasp: 'engines/engine_vector.glb',
  ship_hornet: 'engines/engine_vector.glb', ship_mule: 'engines/engine_industrial.glb',
  ship_atlas: 'engines/engine_industrial.glb', ship_bastion: 'engines/engine_plasma_ring.glb',
  ship_warden: 'engines/engine_plasma_ring.glb', ship_colossus: 'engines/engine_plasma_ring.glb',
  ship_leviathan: 'engines/engine_plasma_ring.glb',
  ship_hawser: 'engines/engine_industrial.glb',
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

function fixtureWeaponFiles(entity, shipDef, fittedOnly = false) {
  const data = entity.data || {};
  const runtime = Array.isArray(data.weapons) ? data.weapons : [];
  const fitted = Array.isArray(data.fittings) ? data.fittings.filter((id) => WEAPON_BY_ID.has(id)) : [];
  const hardpoints = shipDef && shipDef.visuals && Array.isArray(shipDef.visuals.hardpoints)
    ? shipDef.visuals.hardpoints : [];
  const slots = shipDef && shipDef.slots && Array.isArray(shipDef.slots.weapon) ? shipDef.slots.weapon : [];
  const count = fittedOnly
    ? Math.min(6, Math.max(runtime.length, fitted.length))
    : Math.min(6, Math.max(runtime.length, fitted.length, hardpoints.length, slots.length));
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
  const wholeShipFile = WHOLE_SHIP_FILE_BY_DEF[defId];
  if (wholeShipFile && partsLibrary.REQUIRED_WHOLE_SHIP_DEF_IDS.includes(defId)) {
    // Packaged whole-ship bodies bake their dressing; only guns actually fitted may sprout on the
    // authored sockets (PQ-176.04 fittedOnly contract — runtime/fitted weapons, never seed picks).
    const slots = { hull: [wholeShipFile] };
    const weapons = fixtureWeaponFiles(entity, shipDef, true);
    if (weapons.length) slots.weapon = weapons;
    return slots;
  }
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
    assetId: WHOLE_SHIP_ASSET_ID_BY_FILE[relativeFile(url)] || `FIXTURE_${url}`,
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
  // The family is the whole authored contract — packaged whole-ship bodies included. An entity's
  // demand plan must stay a small slice of that catalog, not merely of the modular subset.
  const files = Object.entries(partsLibrary.PART_LIBRARY_CONTRACT.slots)
    .filter(([slot]) => slot !== 'place')
    .flatMap(([, slotFiles]) => slotFiles);
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
    assert.deepEqual(result.requested, result.used.filter((file) => !BOOT_FILES.has(file)),
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

test('an evicted matching authored record is reloaded before a repeated entity plan resolves', async () => {
  const renderer = {};
  const loads = new Map();
  const loadAuthoredPart = async (url) => {
    loads.set(url, (loads.get(url) || 0) + 1);
    const record = fixtureRecord(url);
    record.residency = {
      key: `${url}::fixture`,
      generation: loads.get(url),
      state: 'resident',
    };
    return record;
  };
  const options = { releaseMode: true, loadAuthoredPart };
  const wasp = {
    id: 'continue-wasp', type: 'ship', alive: true, team: 0,
    factionId: 'faction_free', radius: 12, data: { defId: 'ship_wasp' },
  };
  const hullFile = partsLibrary.authoredPreloadPlanForEntity(wasp).hull[0];
  const hullUrl = `${RELEASE_ROOT}${hullFile}`;

  await partsLibrary.preloadAuthoredPartLibrary(renderer, options);
  const firstLibrary = await partsLibrary.preloadAuthoredAssetsForEntity(renderer, wasp, options);
  const evictedHull = (firstLibrary.get('hull') || []).find((record) => record.url === hullUrl);
  assert.ok(evictedHull, 'the initial Wasp request must install its authored hull record');
  assert.equal(loads.get(hullUrl), 1, 'the initial Wasp request must decode its hull once');

  evictedHull.residency.state = 'evicted';
  const continuedLibrary = await partsLibrary.preloadAuthoredAssetsForEntity(renderer, wasp, options);
  const matchingHulls = (continuedLibrary.get('hull') || []).filter((record) => record.url === hullUrl);

  assert.equal(continuedLibrary, firstLibrary, 'repeated demand must update the renderer library in place');
  assert.equal(loads.get(hullUrl), 2,
    'an evicted URL match must miss the loaded-plan check and trigger a fresh decode');
  assert.equal(matchingHulls.length, 1,
    'the fresh resident record must replace, rather than accumulate beside, the evicted generation');
  assert.notEqual(matchingHulls[0], evictedHull, 'Continue must not reuse the disposed blueprint record');
  assert.equal(matchingHulls[0].residency.state, 'resident');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});

test('a resolved authored ship still awaits exact pipeline admission before publication', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const entity = {
    id: 'resolved-mule-pipeline-gate',
    type: 'ship',
    alive: true,
    team: 2,
    factionId: 'faction_union',
    radius: 20,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_mule', sectorId: 'sector_helios_prime' },
  };
  const loadAuthoredPart = async (url) => fixtureRecord(url);
  const options = { releaseMode: true, loadAuthoredPart };

  await partsLibrary.preloadAuthoredPartLibrary(renderer, options);
  await partsLibrary.preloadAuthoredAssetsForEntity(renderer, entity, options);

  const priorWindow = globalThis.window;
  const priorRaf = globalThis.requestAnimationFrame;
  const scheduledFrames = [];
  let compiledRoot = null;
  let residentRoot = null;
  let releasePipeline;
  let releaseResidency;
  const pipelineGate = new Promise((resolve) => { releasePipeline = resolve; });
  const residencyGate = new Promise((resolve) => { releaseResidency = resolve; });
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };
  globalThis.window = {
    SF: {
      state: {
        mode: 'flight',
        player: null,
        world: { currentSectorId: 'sector_helios_prime' },
        render: {
          scene,
          compileObjectPipelines(root) {
            compiledRoot = root;
            return pipelineGate;
          },
          prepareAuthoredGpuResidency(root) {
            residentRoot = root;
            return residencyGate;
          },
        },
      },
    },
  };

  try {
    const fallback = fallbackShip();
    // Live ships mount a zero-draw admission substrate, which is what mayComposeAuthoredShipLive
    // lets compose during flight; a plain visible fallback would be gated to procedural-settled.
    fallback.userData.authoredAdmissionSubstrate = true;
    const boundary = partsLibrary.wrapShipWithAuthoredParts(entity, fallback, options);
    entity.mesh = boundary;
    scene.add(boundary);
    boundary.userData.requestAuthoredUpgrade(renderer, scene);

    assert.equal(boundary.userData.authoredAssetState, 'loading');
    assert.equal(boundary.children.includes(fallback), true,
      'a decoded cache hit must remain unpublished until its exact material programs are ready');
    assert.equal(scheduledFrames.length, 1, 'resolved plans still use the frame-bounded admission queue');

    scheduledFrames.shift()();
    for (let turn = 0; turn < 50 && !compiledRoot; turn++) await Promise.resolve();

    assert.ok(compiledRoot, 'the resolved composition must enter the exact GPU pipeline compiler');
    assert.equal(boundary.userData.authoredAssetState, 'compiling-pipelines');
    assert.equal(boundary.children.includes(fallback), true,
      'pipeline work cannot publish the authored root early');
    assert.equal(compiledRoot.parent, null, 'pipeline admission compiles the detached authored root');

    releasePipeline({ skipped: false, programCount: 1 });
    for (let turn = 0; turn < 50 && !residentRoot; turn++) {
      await Promise.resolve();
    }

    assert.equal(residentRoot, compiledRoot,
      'the exact compiled root must enter texture residency before publication');
    assert.equal(boundary.userData.authoredAssetState, 'compiling-pipelines');
    assert.equal(boundary.children.includes(fallback), true,
      'pipeline readiness alone cannot publish a root whose hidden LOD textures are not resident');

    releaseResidency({ skipped: false, textures: 3 });
    for (let turn = 0; turn < 50 && boundary.userData.authoredAssetState !== 'authored'; turn++) {
      await Promise.resolve();
    }

    assert.equal(boundary.userData.authoredAssetState, 'authored');
    assert.equal(boundary.children.includes(fallback), false);
    assert.equal(boundary.children.includes(compiledRoot), true,
      'the exact compiled root is the one atomically published');
  } finally {
    if (priorRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = priorRaf;
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    partsLibrary.invalidatePartsLibraryCaches(renderer);
  }
});

// PQ-033.02 v6 warning class "whole-ship LOD demotion failed … release mode
// requires …": the demotion's residency owner can die while the scoped
// whole-ship-lod-family preload is in flight; the owner's loads resolve null by
// design and the resident-only slot rewrite can leave the library without the
// required body. ensureEntityLibrary must reject with the established
// owner-inactive signal (handleAuthoredBoundaryAdmissionError and the demotion
// owner-gone classifier both log it informationally and retry later) — never
// resolve an incomplete library for compose to throw over.

test('an owner that dies mid-preload aborts the whole-ship demand instead of resolving an incomplete library', async () => {
  const lod1File = 'wholeships/massline_express_liner_v1_lod1.glb';
  const expressMule = {
    id: 'express-mule', type: 'ship', alive: true, team: 2, radius: 20,
    data: { defId: 'ship_mule', trafficRole: 'express' },
  };

  // Case A — the scoped family library was evicted before the loop began
  // (bootstrap plan empty): the inactive owner must abort, not resolve a
  // library with zero whole-ship records.
  {
    const renderer = {};
    const options = {
      releaseMode: true,
      loadAuthoredPart: async () => { throw new Error('an evicted library must not decode'); },
      requiredWholeShip: true,
      forceWholeShipFile: lod1File,
      libraryScope: 'whole-ship-lod-family',
      residencyRole: 'whole-ship-lod-family',
      bootstrapPlan: {},
      isResidencyOwnerActive: () => false,
    };
    const plan = partsLibrary.authoredPreloadPlanForEntity(expressMule, options);
    assert.deepEqual(plan, { hull: [lod1File] },
      'the v6 express-mule demotion identity must demand the lod1 massline body');
    await assert.rejects(
      partsLibrary.preloadAuthoredAssetsForEntity(renderer, expressMule, options),
      /owner became inactive/,
      'an inactive owner with an unsatisfied plan must abort, not resolve an incomplete library',
    );
    partsLibrary.invalidatePartsLibraryCaches(renderer);
  }

  // Case B — the body decoded while the owner lived, then the owner died and
  // the sweep released it before the admission loop: same abort, and the load
  // path itself must never be re-entered by a dead owner.
  {
    const renderer = {};
    let ownerActive = true;
    const loadedRecords = new Map();
    const options = {
      releaseMode: true,
      loadAuthoredPart: async (url) => {
        assert.equal(ownerActive, true, 'a dead owner must not re-enter the decode path');
        const record = fixtureRecord(url);
        record.residency = { state: 'resident' };
        loadedRecords.set(url, record);
        // The boundary dies while its demotion preload is still decoding.
        ownerActive = false;
        return record;
      },
      requiredWholeShip: true,
      forceWholeShipFile: lod1File,
      libraryScope: 'whole-ship-lod-family',
      residencyRole: 'whole-ship-lod-family',
      bootstrapPlan: { hull: [lod1File] },
      isResidencyOwnerActive: () => {
        // The soft-cap sweep drops the dead owner's retains; the first liveness
        // probe after the death observes the post-sweep library.
        if (!ownerActive) {
          for (const record of loadedRecords.values()) record.residency = { state: 'released' };
        }
        return ownerActive;
      },
    };
    await assert.rejects(
      partsLibrary.preloadAuthoredAssetsForEntity(renderer, expressMule, options),
      /owner became inactive/,
      'a body released by the owner-gone sweep must abort the preload, not compose blind',
    );
    partsLibrary.invalidatePartsLibraryCaches(renderer);
  }
});
