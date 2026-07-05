// GLTFKit: authored ship-part composition over the synchronous procedural visual boundary.
//
// The renderer must receive an Object3D immediately. We therefore return a stable boundary root,
// then install the authored payload once the real renderer/scene is available. Static opaque authored
// pieces are merged into ship-local batches; stateful pieces such as glass, thrusters, sockets,
// damage lights, and LOD hooks stay as normal objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACTION_PALETTES } from '../data/palettes.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { loadAuthoredPart } from './assetLoader.js';
import { isReleaseAssetMode } from './releaseMode.js';
import * as kit from './ships/shipKit.js';

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';
const KESTREL_HERO_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME';
const INSTANCE_CHUNK_SIZE = 64;
const INSTANCE_FAR_CULL_RADIUS = 9000;
const INSTANCE_FRUSTUM_PAD = 420;
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const sceneStates = new WeakMap();
const libraryByRenderer = new WeakMap();
const resolvedLibraryByRenderer = new WeakMap();
const sharedMaterialVariants = new Map();
const ownerReleaseState = new WeakMap();
const compositionPrimitiveCache = new WeakMap();
const upgradeQueuesByScene = new WeakMap();
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const IDENTITY_MATRIX = new THREE.Matrix4();
const BATCH_INVERSE = new THREE.Matrix4();
const BATCH_LOCAL = new THREE.Matrix4();
const CULL_PROJECTION = new THREE.Matrix4();
const CULL_FRUSTUM = new THREE.Frustum();
const CULL_CAMERA_POSITION = new THREE.Vector3();
const CULL_SPHERE = new THREE.Sphere(new THREE.Vector3(), INSTANCE_FRUSTUM_PAD);
let fallbackNavLightGeometry = null;
const FALLBACK_NAV_LIGHT_MAT = new THREE.Matrix4();
const SHIP_ASSEMBLY_SLOTS = Object.freeze(['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod']);
const STATION_ARCHETYPE_FILES = Object.freeze([
  'places/place_station_trade_hub.glb',
  'places/place_station_refinery.glb',
  'places/place_station_military.glb',
  'places/place_station_blackmarket.glb',
  'places/place_station_fab.glb',
  'places/place_station_mining.glb',
  'places/place_station_research.glb',
  'places/place_gate_jump_ring.glb',
]);
const PLACE_FILES = Object.freeze([
  'places/place_lane_beacon.glb',
  'places/place_nav_buoy.glb',
  'places/place_asteroid_seamed.glb',
  'places/place_debris_chunk.glb',
  'places/place_station_billboard.glb',
  'places/place_dead_hulk.glb',
  'places/place_conveyor_barge.glb',
  'places/place_mining_drone.glb',
  'places/place_asteroid_rock_a.glb',
  'places/place_asteroid_rock_b.glb',
  'places/place_asteroid_rock_c.glb',
  'places/place_asteroid_graffiti.glb',
  ...STATION_ARCHETYPE_FILES,
]);
const PLACE_FILE_BY_ID = Object.freeze(Object.fromEntries(PLACE_FILES.map((file) => [
  file.replace(/^places\//, '').replace(/\.glb$/, ''),
  file,
])));
let fallbackPlaceGeometry = null;
let fallbackStationCoreGeometry = null;
let fallbackStationRingGeometry = null;
let fallbackStationSparGeometry = null;

// Runtime slots mirror assets/ships/parts/parts_manifest.json. Only list files that are actually
// vendored; missing slots fall back procedurally instead of producing browser 404s.
// WebGL context restore: authored part blueprints and their derived shared material variants
// hold GPU resources that are invalid after the context is recreated. Clear them so subsequent
// ships reload authored parts and rebuild fresh materials.
export function invalidatePartsLibraryCaches(renderer) {
  sharedMaterialVariants.clear();
  if (renderer) {
    const promises = libraryByRenderer.get(renderer);
    if (promises) promises.clear();
    const resolved = resolvedLibraryByRenderer.get(renderer);
    if (resolved) resolved.clear();
  }
}

export function syncAuthoredInstancePools(scene, opts = {}) {
  const state = scene && sceneStates.get(scene);
  if (state) syncSceneState(state, opts);
}

export function getAuthoredInstancePoolDiagnostics(scene) {
  const state = scene && sceneStates.get(scene);
  if (!state) return {
    pools: 0,
    chunks: 0,
    pooledInstanceSlots: 0,
    submittedInstanceSlots: 0,
    visibleInstancePools: 0,
    offscreenInstancePools: 0,
    culledInstanceSlots: 0,
    hiddenInstanceSlots: 0,
    avgPoolOccupancy: 0,
    tinyPools: 0,
    matrixUploads: 0,
    matrixReuses: 0,
  };
  return { ...state.stats };
}

export const PART_LIBRARY_CONTRACT = Object.freeze({
  version: 1,
  root: PART_ROOT,
  releaseRoot: PART_RELEASE_ROOT,
  slots: Object.freeze({
    // Seven class-authored hull GLBs (GR-9). Each carries LOD0/LOD1/LOD2 meshes, nine assembly
    // mounts (MOUNT_COCKPIT / ENGINE_{FL,FR,BL,BR} / FIN_{L,R}) and SOCKET_{Trail_Main,Weapon_Front},
    // with 1024² embedded KTX2 baseColor + OpenGL normal + packed ORM. See assetLoader.js for the
    // full spacefaceAsset contract they were authored against.
    hull: Object.freeze([
      'hulls/hull_starter.glb',
      'hulls/hull_fighter.glb',
      'hulls/hull_miner.glb',
      'hulls/hull_freighter.glb',
      'hulls/hull_interceptor.glb',
      'hulls/hull_corvette.glb',
      'hulls/hull_frigate.glb',
      'hulls/hull_capital.glb',
      'hulls/hull_multirole.glb',
      'hulls/hull_gunship.glb',
      // Whole-ship GLBs stay out of the live runtime declaration until SPEC3-37 re-exports real hull
      // bodies. The release copies currently contain accessory meshes only; modular authored hulls are
      // the valid default-play path meanwhile, and check-exporter keeps the broken files visible.
    ]),
    cockpit: Object.freeze([
      'cockpits/cockpit_dome.glb',
      'cockpits/cockpit_slab.glb',
      'cockpits/cockpit_recessed.glb',
    ]),
    engine: Object.freeze([
      'engines/engine_ion_small.glb',
      'engines/engine_ion_twin.glb',
      'engines/engine_industrial.glb',
      'engines/engine_resonator.glb',
      'engines/engine_vector.glb',
      'engines/engine_plasma_ring.glb',
    ]),
    fin: Object.freeze([
      'fins/fin_wedge.glb',
      'fins/fin_radiator_grid.glb',
      'fins/fin_swept_smuggler.glb',
      'fins/fin_crystalline.glb',
      'fins/fin_delta.glb',
      'fins/fin_stabilator.glb',
    ]),
    weapon: Object.freeze([
      'weapons/weapon_pulse_cannon.glb',
      'weapons/weapon_heavy_cannon.glb',
      'weapons/weapon_turret_dual.glb',
      'weapons/weapon_lance.glb',
      'weapons/weapon_gatling.glb',
      'weapons/weapon_railgun.glb',
    ]),
    greeble: Object.freeze([
      'greebles/greeble_vents.glb',
      'greebles/greeble_hatches.glb',
      'greebles/greeble_pipes.glb',
      'greebles/greeble_rcs.glb',
      'greebles/greeble_antennas.glb',
      'greebles/greeble_nav_lights.glb',
      'greebles/greeble_armor_plates.glb',
    ]),
    gear: Object.freeze([
      'gear/skid_trio.glb',
      'gear/skid_quad.glb',
    ]),
    pod: Object.freeze([
      'pods/pod_utility.glb',
      'pods/pod_cargo_container.glb',
      'pods/pod_repair_patch.glb',
    ]),
    place: PLACE_FILES,
  }),
  assembly: Object.freeze({
    coordinateSystem: '+X forward, +Y up, +Z starboard; metres',
    sharedOpaquePrimitives: 'ship-local merged static batches',
    mutableHooks: 'per-ship meshes sharing immutable geometry/textures',
    authoredMounts: 'MOUNT_COCKPIT / MOUNT_ENGINE_* / MOUNT_FIN_* on hull parts',
    authoredSlots: 'hull / cockpit / engine / fin / weapon / greeble / gear / pod / place',
    missingPart: 'procedural slot fallback; never blank an entity',
  }),
});

// Deterministic ship-definition → hull-class selection. The hull is the silhouette-defining slot,
// so it must match the ship's authored role rather than being chosen by the generic seed-based hash.
// Each hull file is keyed to the ship defId (src/data/ships.js) whose role it was modelled for; ships
// outside this map fall back to the seed-based pick across all seven hulls. Roles follow the genius's
// authoring pass: starter/multirole→starter, fighter→fighter, mining/mining_barge→miner,
// freighter/heavy_hauler→freighter, interceptor/explorer→interceptor, corvette→corvette,
// gunship/battlecruiser/flagship→gunship. New ladder hulls override the older broad buckets where
// the authored library now has role-specific silhouettes.
const HULL_FILE_BY_DEF_ID = Object.freeze({
  ship_kestrel: 'hulls/hull_starter.glb',
  ship_drifter: 'hulls/hull_multirole.glb',
  ship_wasp: 'hulls/hull_fighter.glb',
  ship_pelican: 'hulls/hull_miner.glb',
  ship_ironback: 'hulls/hull_miner.glb',
  ship_mule: 'hulls/hull_freighter.glb',
  ship_atlas: 'hulls/hull_freighter.glb',
  ship_hornet: 'hulls/hull_interceptor.glb',
  ship_ranger: 'hulls/hull_multirole.glb',
  ship_bastion: 'hulls/hull_corvette.glb',
  ship_warden: 'hulls/hull_frigate.glb',
  ship_colossus: 'hulls/hull_capital.glb',
  ship_leviathan: 'hulls/hull_capital.glb',
});

// Whole-ship files remain exporter/test artifacts until SPEC3-37 re-exports complete bodies.
// Default play must use modular hulls so missing accessory-only GLBs cannot blank live ships.
const WHOLE_SHIP_FILE_BY_DEF_ID = Object.freeze({});
const WHOLE_SHIP_URLS = Object.freeze(Object.values(WHOLE_SHIP_FILE_BY_DEF_ID));
const isWholeShipUrl = (url) => WHOLE_SHIP_URLS.some((w) => String(url || '').endsWith(w));
const PRECOMPILE_SHIP_ARCHETYPES = Object.freeze(Object.keys(HULL_FILE_BY_DEF_ID).map((defId) => Object.freeze({
  defId,
  hullFile: HULL_FILE_BY_DEF_ID[defId],
  wholeShipFile: WHOLE_SHIP_FILE_BY_DEF_ID[defId] || null,
})));

export function shipArchetypeKeyForDefId(defId, silhouette = '') {
  const id = defId || 'ship_kestrel';
  const hull = HULL_FILE_BY_DEF_ID[id] || `def:${id}`;
  const whole = WHOLE_SHIP_FILE_BY_DEF_ID[id] || '';
  return [id, hull, whole, silhouette || 'base'].join('|');
}

export function shipArchetypesForPrecompile() {
  return PRECOMPILE_SHIP_ARCHETYPES;
}

/**
 * Wrap one already-built ship in the authored-asset boundary. This call is synchronous and cannot
 * remove the supplied fallback. The renderer asks the boundary to upgrade as soon as it joins the
 * scene; first render remains a fallback trigger for preview harnesses that do not own the main scene.
 */
export function wrapShipWithAuthoredParts(entity, fallbackRoot, options = {}) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || entity.type !== 'ship') return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'Ship'}_AuthoredAssetBoundary`;
  boundary.add(fallbackRoot);

  // Preserve the public inspection surface used by diagnostics/checks while making lifecycle hooks
  // indirect through `active`, so the renderer never needs to know that a payload was replaced.
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  boundary.userData.kind = 'ship';
  boundary.userData.authoredAssetState = 'procedural-fallback';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v1 — stable-root hot swap',
    gracefulFallback: true,
  };

  let active = fallbackRoot;
  boundary.userData.updateDamageState = (liveEntity, now) => {
    const fn = active && active.userData && active.userData.updateDamageState;
    if (typeof fn === 'function') fn(liveEntity, now);
    if (active && active.userData) {
      boundary.userData.damageState = active.userData.damageState;
      boundary.userData.hullFrac = active.userData.hullFrac;
    }
  };
  boundary.userData.updateLod = (level) => {
    const fn = active && active.userData && active.userData.updateLod;
    if (typeof fn === 'function') fn(level);
  };
  syncActiveSurface(boundary, active);

  const trigger = firstRenderable(fallbackRoot);
  if (!trigger) return boundary;

  const previousBeforeRender = trigger.onBeforeRender;
  let armed = true;
  const startAuthoredUpgrade = (renderer, scene) => {
    if (!armed) return;
    if (!renderer || !scene) return;
    armed = false;
    trigger.onBeforeRender = previousBeforeRender;
    if (installResolvedBoundary(boundary, fallbackRoot, entity, renderer, scene, { releaseMode, onSwap: options.onSwap }, (next) => {
      active = next;
      syncActiveSurface(boundary, active);
    })) return;
    boundary.userData.authoredAssetState = 'loading';
    enqueueBoundaryUpgrade(scene, {
      boundary,
      fallbackRoot,
      entity,
      renderer,
      scene,
      options: { releaseMode, onSwap: options.onSwap },
      setActive: (next) => {
        active = next;
        syncActiveSurface(boundary, active);
      },
    });
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;
  trigger.onBeforeRender = function authoredAssetTrigger(renderer, scene, ...rest) {
    if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
    startAuthoredUpgrade(renderer, scene);
  };

  return boundary;
}

export function buildAuthoredPlaceProp(entity, options = {}) {
  const placeFile = placeFileForEntity(entity);
  if (!placeFile) return null;
  const fallbackRoot = buildFallbackPlaceProp(entity, placeFile);
  return wrapPlacePropWithAuthoredPart(entity, fallbackRoot, placeFile, options);
}

export function buildAuthoredStationArchetype(entity, options = {}) {
  const placeFile = placeFileForEntity(entity);
  if (!placeFile || !entity || entity.type !== 'station') return null;
  const placeId = placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const loadEntity = {
    ...entity,
    data: {
      ...(entity.data || {}),
      placeId,
      placeScale: stationArchetypePlaceScale(entity),
    },
  };
  const fallbackRoot = buildFallbackStationArchetype(loadEntity, placeFile);
  return wrapStationArchetypeWithAuthoredPart(loadEntity, fallbackRoot, placeFile, options);
}

export function resolvePlaceFileForEntity(entity) {
  return placeFileForEntity(entity);
}

/** Test/probe hook: run the same async GLB swap used at runtime for place/station boundaries. */
export async function upgradeAuthoredPlaceBoundaryForProbe(boundary, fallbackRoot, entity, placeFile, renderer, scene, options = {}) {
  if (!boundary || !fallbackRoot || !entity || !placeFile || !renderer || !scene) return false;
  let active = fallbackRoot;
  return upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, options, (next) => {
    active = next;
    boundary.userData.hull = next;
  });
}

export const STATION_ARCHETYPE_PLACE_IDS = Object.freeze(
  STATION_ARCHETYPE_FILES.map((file) => file.replace(/^places\//, '').replace(/\.glb$/, '')),
);

function stationArchetypePlaceScale(entity) {
  const data = entity && entity.data || {};
  const raw = Number(data.placeScale);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const radius = stationVisualRadius(entity);
  return radius / 14;
}

function stationVisualRadius(entity) {
  const data = entity && entity.data || {};
  for (const value of [data.visualRadius, data.dockRadius, data.stationRadius, entity && entity.radius]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(40, n);
  }
  return 72;
}

function buildFallbackStationArchetype(entity, placeFile) {
  const data = entity && entity.data || {};
  const placeId = data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const radius = stationVisualRadius(entity);
  const group = new THREE.Group();
  group.name = `SF_StationArchetypeFallback_${placeId}`;
  group.userData.kind = 'station';
  group.userData.placeId = placeId;
  group.userData.archetypeGlb = data.archetypeGlb || placeId;
  group.userData.visualRadius = radius;
  group.userData.renderContract = {
    assetBoundary: 'GLTFKit v1 — station archetype procedural fallback',
    gracefulFallback: true,
  };
  const color = fallbackPlaceColor(placeId, data.paletteClass);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.35,
    emissive: new THREE.Color(color).multiplyScalar(0.18),
    emissiveIntensity: 0.2,
  });
  const core = new THREE.Mesh(getFallbackStationCoreGeometry(), material);
  core.name = `SF_StationArchetypeFallback_${placeId}_Core`;
  core.scale.set(radius * 0.75, radius * 0.55, radius * 0.75);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(getFallbackStationRingGeometry(), material);
  ring.name = `SF_StationArchetypeFallback_${placeId}_Ring`;
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);

  for (let i = 0; i < 4; i++) {
    const spar = new THREE.Mesh(getFallbackStationSparGeometry(), material);
    const a = i * Math.PI / 2;
    spar.name = `SF_StationArchetypeFallback_${placeId}_DockSpar_${i}`;
    spar.position.set(Math.cos(a) * radius * 0.45, 0, Math.sin(a) * radius * 0.45);
    spar.rotation.y = -a;
    spar.scale.set(radius, radius, radius);
    spar.castShadow = true;
    spar.receiveShadow = true;
    group.add(spar);
  }
  return group;
}

function wrapStationArchetypeWithAuthoredPart(entity, fallbackRoot, placeFile, options = {}) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || entity.type !== 'station' || !placeFile) return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);
  const placeId = placeFile.replace(/^places\//, '').replace(/\.glb$/, '');

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'StationArchetype'}_AuthoredAssetBoundary`;
  boundary.add(fallbackRoot);
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  boundary.userData.kind = 'station';
  boundary.userData.placeId = placeId;
  boundary.userData.archetypeGlb = entity.data && entity.data.archetypeGlb || placeId;
  boundary.userData.authoredAssetState = 'procedural-fallback';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v1 — authored station archetype',
    gracefulFallback: true,
  };

  boundary.userData.hull = fallbackRoot;
  const trigger = firstRenderable(fallbackRoot);
  const startAuthoredUpgrade = (renderer, scene) => {
    if (!renderer || !scene || boundary.userData.authoredAssetState === 'loading' || boundary.userData.authoredAssetState === 'authored') return;
    boundary.userData.authoredAssetState = 'loading';
    upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, { releaseMode }, (next) => {
      boundary.userData.hull = next;
    }).catch((error) => {
      boundary.userData.authoredAssetState = 'fallback-after-error';
      console.warn('[partsLibrary] authored station archetype failed; retaining fallback', error);
    });
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    let armed = true;
    const previousBeforeRender = trigger.onBeforeRender;
    trigger.onBeforeRender = function authoredStationTrigger(renderer, scene, ...rest) {
      if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
      if (!armed) return;
      armed = false;
      trigger.onBeforeRender = previousBeforeRender;
      startAuthoredUpgrade(renderer, scene);
    };
  }

  return boundary;
}

function wrapPlacePropWithAuthoredPart(entity, fallbackRoot, placeFile, options = {}) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || entity.type !== 'fx' || !placeFile) return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'PlaceProp'}_AuthoredAssetBoundary`;
  boundary.add(fallbackRoot);
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  boundary.userData.kind = 'place';
  boundary.userData.placeId = entity.data && entity.data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  boundary.userData.authoredAssetState = 'procedural-fallback';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v1 — authored world-place prop',
    gracefulFallback: true,
  };

  boundary.userData.hull = fallbackRoot;
  const trigger = firstRenderable(fallbackRoot);
  const startAuthoredUpgrade = (renderer, scene) => {
    if (!renderer || !scene || boundary.userData.authoredAssetState === 'loading' || boundary.userData.authoredAssetState === 'authored') return;
    boundary.userData.authoredAssetState = 'loading';
    upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, { releaseMode }, (next) => {
      boundary.userData.hull = next;
    }).catch((error) => {
      boundary.userData.authoredAssetState = 'fallback-after-error';
      console.warn('[partsLibrary] authored place prop failed; retaining fallback', error);
    });
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    let armed = true;
    const previousBeforeRender = trigger.onBeforeRender;
    trigger.onBeforeRender = function authoredPlaceTrigger(renderer, scene, ...rest) {
      if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
      if (!armed) return;
      armed = false;
      trigger.onBeforeRender = previousBeforeRender;
      startAuthoredUpgrade(renderer, scene);
    };
  }

  return boundary;
}

async function upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, options, setActive) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const record = await loadAuthoredPart(`${partRoot}${placeFile}`, {
    renderer,
    slot: 'place',
    optional: true,
  });
  if (!record || !boundary.parent) {
    boundary.userData.authoredAssetState = record ? 'orphaned-before-swap' : 'unavailable';
    return false;
  }

  const authored = buildPlacePropRoot(entity, record, scene, boundary);
  if (!authored || !boundary.parent) return false;

  const retainFallback = shouldRetainReadableWorldFallback(fallbackRoot, entity, authored);
  if (retainFallback) {
    markReadableFallbackLayer(fallbackRoot);
    boundary.add(authored.root);
  } else {
    boundary.remove(fallbackRoot);
    boundary.add(authored.root);
  }
  const activeRoot = retainFallback ? fallbackRoot : authored.root;
  setActive(activeRoot);
  boundary.userData.authoredAssetState = 'authored';
  boundary.userData.authoredReadableFallbackRetained = retainFallback;
  boundary.userData.authoredVisualRoot = retainFallback ? 'readable-fallback' : 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.authoredCompositionId = authored.root.userData.assetId;
  boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map();

  if (!retainFallback) {
    try { disposeDetachedObject(fallbackRoot); }
    catch (error) { console.warn('[partsLibrary] place fallback cleanup failed after authored swap', error); }
  }
  return true;
}

function shouldRetainReadableWorldFallback(fallbackRoot, entity, authored) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || !authored || !authored.root) return false;
  return entity.type === 'station' || entity.type === 'fx';
}

function buildPlacePropRoot(entity, record, scene, ownerBoundary) {
  const palette = paletteFor(entity || {});
  const root = new THREE.Group();
  const data = entity && entity.data || {};
  const placeId = data.placeId || record.assetId || 'place_prop';
  root.name = `GLTFKit_${placeId}`;
  const isStation = entity && entity.type === 'station';
  root.userData.kind = isStation ? 'station' : 'place';
  root.userData.placeId = placeId;
  root.userData.assetId = `GLTFKIT_${placeId}`;
  if (isStation && data.archetypeGlb) root.userData.archetypeGlb = data.archetypeGlb;

  const bindings = createBindings();
  const mutableMaterials = new Map();
  const staticBatches = createStaticBatchCollector(root, bindings);
  const authoredLength = Math.max(record.bounds && record.bounds.size && record.bounds.size[0] || 1, 1e-6);
  const rawScale = Number(data.placeScale);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  instantiatePart(record, root, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    targetLength: authoredLength * scale,
    label: 'Place',
  }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
  staticBatches.flush();
  normalizePlacePropBindings(bindings);
  centerAuthoredPlaceRoot(root, record, scale);

  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; authored world scale',
    authoredParts: [record.url],
    authoredSlots: { place: [record.url] },
    hookBinding: 'SOCKET_* markers remain available for debug/probes; world-place props are non-sim scenery',
  };
  return {
    root,
    authoredParts: [record.url],
    authoredSlots: { place: [record.url] },
  };
}

function centerAuthoredPlaceRoot(root, record, scale) {
  if (!root || !record || !record.bounds) return;
  const center = record.bounds.center || [0, 0, 0];
  const sx = Number(center[0]) || 0;
  const sy = Number(center[1]) || 0;
  const sz = Number(center[2]) || 0;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  root.position.set(-sx * s, 0, -sz * s);
  root.userData.visualCenterOffset = { x: -root.position.x, y: sy * s, z: -root.position.z };
  root.userData.visualBounds = {
    center: [
      (Number(record.bounds.center && record.bounds.center[0]) || 0) * s,
      (Number(record.bounds.center && record.bounds.center[1]) || 0) * s,
      (Number(record.bounds.center && record.bounds.center[2]) || 0) * s,
    ],
    size: [
      (Number(record.bounds.size && record.bounds.size[0]) || 0) * s,
      (Number(record.bounds.size && record.bounds.size[1]) || 0) * s,
      (Number(record.bounds.size && record.bounds.size[2]) || 0) * s,
    ],
  };
}

function normalizePlacePropBindings(bindings) {
  for (const plume of bindings.drivePlumes) {
    if (!plume || !plume.material) continue;
    plume.material.transparent = true;
    plume.material.depthWrite = false;
    if (!Number.isFinite(plume.material.opacity)) plume.material.opacity = 0.55;
    plume.castShadow = false;
    plume.receiveShadow = false;
  }
}

function buildFallbackPlaceProp(entity, placeFile) {
  const data = entity && entity.data || {};
  const placeId = data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const radius = Math.max(3, Number(entity && entity.radius) || 8);
  const group = new THREE.Group();
  group.name = `SF_PlaceFallback_${placeId}`;
  group.userData.kind = 'place';
  group.userData.placeId = placeId;
  group.userData.renderContract = {
    assetBoundary: 'GLTFKit v1 — authored world-place prop fallback',
    gracefulFallback: true,
  };

  const color = fallbackPlaceColor(placeId, data.paletteClass);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.22,
    emissive: new THREE.Color(color).multiplyScalar(0.28),
    emissiveIntensity: 0.25,
  });
  const mesh = new THREE.Mesh(getFallbackPlaceGeometry(), material);
  mesh.name = `SF_PlaceFallback_${placeId}_Hull`;
  mesh.scale.set(radius * 0.28, radius * 0.20, radius * 0.28);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function getFallbackPlaceGeometry() {
  if (!fallbackPlaceGeometry) fallbackPlaceGeometry = new THREE.BoxGeometry(1, 1, 1);
  return fallbackPlaceGeometry;
}

function getFallbackStationCoreGeometry() {
  if (!fallbackStationCoreGeometry) fallbackStationCoreGeometry = new THREE.CylinderGeometry(0.42, 0.5, 0.72, 10);
  return fallbackStationCoreGeometry;
}

function getFallbackStationRingGeometry() {
  if (!fallbackStationRingGeometry) fallbackStationRingGeometry = new THREE.TorusGeometry(0.82, 0.055, 10, 36);
  return fallbackStationRingGeometry;
}

function getFallbackStationSparGeometry() {
  if (!fallbackStationSparGeometry) fallbackStationSparGeometry = new THREE.BoxGeometry(0.16, 0.12, 0.72);
  return fallbackStationSparGeometry;
}

function fallbackPlaceColor(placeId, paletteClass) {
  const token = String(placeId || '');
  if (String(paletteClass || '').toLowerCase() === 'anomaly') return 0x8d66ff;
  if (String(paletteClass || '').toLowerCase() === 'fringe') return 0xff5c5c;
  if (String(paletteClass || '').toLowerCase() === 'belt') return 0xffb35c;
  if (token.includes('asteroid') || token.includes('debris') || token.includes('hulk')) return 0x7b8794;
  return 0x39d0ff;
}

function placeFileForEntity(entity) {
  const data = entity && entity.data || {};
  const id = String(
    data.archetypeGlb || data.landmarkGlb || data.placeId || data.assetId || '',
  ).replace(/^places\//, '').replace(/\.glb$/, '');
  if (!id) return null;
  return PLACE_FILE_BY_ID[id] || (PLACE_FILES.includes(`places/${id}.glb`) ? `places/${id}.glb` : null);
}

function enqueueBoundaryUpgrade(scene, job) {
  const state = upgradeQueueState(scene);
  state.jobs.push(job);
  if (!state.running) processUpgradeQueue(state);
}

function upgradeQueueState(scene) {
  let state = upgradeQueuesByScene.get(scene);
  if (!state) {
    state = { scene, jobs: [], running: false };
    upgradeQueuesByScene.set(scene, state);
  }
  return state;
}

function scheduleUpgradeFrame(callback) {
  const raf = globalThis && typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  if (raf) raf(callback);
  else setTimeout(callback, 16);
}

function processUpgradeQueue(state) {
  if (state.running) return;
  state.running = true;
  const step = () => {
    const job = state.jobs.shift();
    if (!job) {
      state.running = false;
      return;
    }
    upgradeBoundary(job.boundary, job.fallbackRoot, job.entity, job.renderer, job.scene, job.options, job.setActive)
      .catch((error) => {
        job.boundary.userData.authoredAssetState = 'fallback-after-error';
        console.warn('[partsLibrary] queued authored composition failed; retaining fallback', error);
      })
      .finally(() => scheduleUpgradeFrame(step));
  };
  scheduleUpgradeFrame(step);
}

export function getAuthoredUpgradeQueueStats(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  return {
    pending: state ? state.jobs.length : 0,
    running: !!(state && state.running),
  };
}

export function preloadAuthoredPartLibrary(renderer, options = {}) {
  return loadCanonicalLibrary(renderer, options);
}

async function upgradeBoundary(boundary, fallbackRoot, entity, renderer, scene, options, setActive) {
  let swapped = false;
  try {
    const library = await loadCanonicalLibrary(renderer, options);
    swapped = commitAuthoredBoundary(boundary, fallbackRoot, entity, library, scene, options, setActive);
  } catch (error) {
    if (!swapped) {
      releaseOwnerInstances(boundary);
      boundary.userData.authoredAssetState = 'fallback-after-error';
      console.warn('[partsLibrary] authored composition failed; retaining procedural ship', error);
    } else {
      boundary.userData.authoredAssetState = 'authored-with-cleanup-error';
      console.warn('[partsLibrary] authored ship is live, but post-swap bookkeeping failed', error);
    }
  }
}

function installResolvedBoundary(boundary, fallbackRoot, entity, renderer, scene, options, setActive) {
  const library = resolvedCanonicalLibrary(renderer, options);
  if (!library) return false;
  boundary.userData.authoredAssetState = 'loading';
  try {
    commitAuthoredBoundary(boundary, fallbackRoot, entity, library, scene, options, setActive);
  } catch (error) {
    releaseOwnerInstances(boundary);
    boundary.userData.authoredAssetState = 'fallback-after-error';
    console.warn('[partsLibrary] authored composition failed; retaining procedural ship', error);
  }
  return true;
}

function commitAuthoredBoundary(boundary, fallbackRoot, entity, library, scene, options, setActive) {
  if (!boundary.parent) return false; // destroyed while assets were in flight

  const authored = buildComposedShip(entity, library, scene, boundary, options);
  if (!authored) {
    boundary.userData.authoredAssetState = 'unavailable';
    return false;
  }
  if (!boundary.parent) {
    releaseOwnerInstances(boundary);
    return false;
  }

  const oldHull = fallbackRoot.userData && fallbackRoot.userData.hull;
  const newHull = authored.root.userData && authored.root.userData.hull;
  if (oldHull && newHull) newHull.rotation.x = oldHull.rotation.x;
  primeAuthoredState(authored.root, fallbackRoot, entity);

  // Commit only after the complete authored payload and all bindings exist. The readable fallback
  // stays mounted as the base silhouette until the authored ship contract grows a true five-second
  // readability gate; a slot-valid GLTFKit composition can otherwise pass probes while looking like
  // loose engines or tiny fragments in play.
  const retainFallback = shouldRetainReadableFallback(fallbackRoot, entity, authored);
  if (retainFallback) {
    markReadableFallbackLayer(fallbackRoot);
    suppressAuthoredReadableSilhouette(authored.root);
    boundary.add(authored.root);
  } else {
    boundary.remove(fallbackRoot);
    boundary.add(authored.root);
  }
  const activeRoot = retainFallback ? fallbackRoot : authored.root;
  setActive(activeRoot);

  boundary.userData.authoredAssetState = 'authored';
  boundary.userData.authoredReadableFallbackRetained = retainFallback;
  boundary.userData.authoredVisualRoot = retainFallback ? 'readable-fallback' : 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.proceduralFallbackParts = authored.fallbackParts;
  boundary.userData.authoredCompositionId = authored.root.userData.assetId;
  boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map(); // invalidate renderer socket lookups across the swap
  if (typeof options.onSwap === 'function') {
    try { options.onSwap({ boundary, root: activeRoot, authoredRoot: authored.root, entity, authoredParts: authored.authoredParts }); }
    catch (error) { console.warn('[partsLibrary] authored swap callback failed', error); }
  }

  if (!retainFallback) {
    try { disposeDetachedObject(fallbackRoot); }
    catch (error) { console.warn('[partsLibrary] fallback cleanup failed after a successful authored swap', error); }
  }
  return true;
}

function shouldRetainReadableFallback(fallbackRoot, entity, authored) {
  // The starter Kestrel has a bespoke hero body that is the intended readable player ship. The
  // modular GLB layer may add hardware detail, but it must not replace that body with the older
  // rounded modular silhouette during live play.
  const assetId = fallbackRoot && fallbackRoot.userData && fallbackRoot.userData.assetId;
  return assetId === KESTREL_HERO_ASSET_ID;
}

function markReadableFallbackLayer(fallbackRoot) {
  fallbackRoot.userData = fallbackRoot.userData || {};
  fallbackRoot.userData.authoredReadableFallbackLayer = true;
  const heroBody = fallbackRoot.userData.assetId === KESTREL_HERO_ASSET_ID;
  fallbackRoot.traverse((object) => {
    if (!object) return;
    object.userData = object.userData || {};
    object.userData.authoredReadableFallbackLayer = true;
    if (heroBody && object.isMesh) {
      object.userData.spacefaceAuthoredHeroBody = true;
      if (!object.userData.spacefacePartUrl) object.userData.spacefacePartUrl = 'hero/kestrel_borrowed_time';
    }
  });
}

function suppressAuthoredReadableSilhouette(authoredRoot) {
  if (!authoredRoot || typeof authoredRoot.traverse !== 'function') return;
  authoredRoot.userData = authoredRoot.userData || {};
  authoredRoot.userData.authoredReadableSilhouetteSuppressed = true;
  authoredRoot.traverse((object) => {
    if (!object || !object.userData) return;
    const urls = Array.isArray(object.userData.spacefacePartUrls)
      ? object.userData.spacefacePartUrls
      : (object.userData.spacefacePartUrl ? [object.userData.spacefacePartUrl] : []);
    const isHullSilhouette = object.userData.spacefaceReadabilityCore
      || urls.some((url) => String(url || '').includes('/hulls/') || String(url || '').includes('readability/'));
    if (!isHullSilhouette) return;
    object.visible = false;
    object.userData.authoredSuppressedByReadableFallback = true;
  });
}


function primeAuthoredState(authoredRoot, fallbackRoot, entity) {
  const previousLod = fallbackRoot.userData && fallbackRoot.userData.lod;
  const nextLod = authoredRoot.userData && authoredRoot.userData.lod;
  if (nextLod && Number.isFinite(previousLod && previousLod.lastPx)) {
    let level = nextLod.level;
    // The shared resolver moves one hysteresis boundary per call. Two passes can transfer lod0→lod2
    // without exposing a one-frame high-detail flash when an off-screen ship finishes loading.
    for (let i = 0; i < 2; i++) level = nextLod.resolve(previousLod.lastPx);
    if (typeof authoredRoot.userData.updateLod === 'function') authoredRoot.userData.updateLod(level);
  }
  if (typeof authoredRoot.userData.updateDamageState === 'function') {
    const now = globalThis.performance && typeof globalThis.performance.now === 'function'
      ? globalThis.performance.now() : Date.now();
    authoredRoot.userData.updateDamageState(entity, now);
  }
}

function syncActiveSurface(boundary, active) {
  const data = active && active.userData ? active.userData : {};
  boundary.userData.hull = data.hull || active;
  boundary.userData.lod = data.lod || null;
  boundary.userData.damageParts = data.damageParts;
  boundary.userData.damageState = data.damageState;
  boundary.userData.hullFrac = data.hullFrac;
  boundary.userData.shieldBubble = data.shieldBubble || null;
}

function loadCanonicalLibrary(renderer, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  let promises = libraryByRenderer.get(renderer);
  if (!promises) {
    promises = new Map();
    libraryByRenderer.set(renderer, promises);
  }
  let promise = promises.get(partRoot);
  if (!promise) {
    const entries = Object.entries(PART_LIBRARY_CONTRACT.slots);
    promise = Promise.all(entries.map(async ([slot, files]) => {
      const records = await Promise.all(files.map((file) => loadAuthoredPart(`${partRoot}${file}`, {
        renderer,
        slot,
        optional: true,
      })));
      return [slot, records.filter(Boolean)];
    })).then((pairs) => {
      const library = new Map(pairs);
      let resolved = resolvedLibraryByRenderer.get(renderer);
      if (!resolved) {
        resolved = new Map();
        resolvedLibraryByRenderer.set(renderer, resolved);
      }
      resolved.set(partRoot, library);
      return library;
    });
    promises.set(partRoot, promise);
  }
  return promise;
}

function resolvedCanonicalLibrary(renderer, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const resolved = renderer && resolvedLibraryByRenderer.get(renderer);
  return resolved ? resolved.get(partRoot) || null : null;
}

function buildComposedShip(entity, library, scene, ownerBoundary, options = {}) {
  const releaseMode = isReleaseAssetMode(options);
  const partRoot = releaseMode ? PART_RELEASE_ROOT : PART_ROOT;
  const seed = hashString(`${entity.id}|${entity.data && entity.data.defId}|${entity.factionId || ''}`);
  const selected = new Map();
  // Whole-ship bodies (cockpit/fins/engine baked in) bypass the parts-assembly: use the body as the
  // hull and skip the structural slots so they don't stack on the baked geometry.
  const wholeShipWanted = WHOLE_SHIP_FILE_BY_DEF_ID[entity.data && entity.data.defId];
  let wholeShip = false;
  for (const slot of SHIP_ASSEMBLY_SLOTS) {
    const records = library.get(slot) || [];
    if (slot === 'hull') {
      // Whole-ship override takes priority. Otherwise prefer the defId-mapped class, falling back to a
      // seed pick over the regular hull pool (whole-ship bodies excluded so they're never picked at random).
      const wholeRec = wholeShipWanted && records.find((record) => String(record.url || '').endsWith(wholeShipWanted));
      if (wholeRec) {
        selected.set(slot, wholeRec);
        wholeShip = true;
      } else {
        const pool = records.filter((record) => !isWholeShipUrl(record.url));
        const wanted = HULL_FILE_BY_DEF_ID[entity.data && entity.data.defId];
        const exact = wanted && pool.find((record) => String(record.url || '').endsWith(wanted));
        if (releaseMode && wholeShipWanted && !exact && !pool.length) {
          throw new Error(requiredWholeShipMessage(entity, wholeShipWanted, records, partRoot));
        }
        selected.set(slot, exact || (pool.length ? pool[((seed ^ hashString(slot)) >>> 0) % pool.length] : null));
      }
    } else {
      selected.set(slot, records.length ? records[((seed ^ hashString(slot)) >>> 0) % records.length] : null);
    }
  }
  const authoredParts = [...selected.values()].filter(Boolean);
  if (!authoredParts.length) return null;

  const palette = paletteFor(entity);
  const root = new THREE.Group();
  root.name = `GLTFKit_${entity.data && entity.data.defId || 'ship'}`;
  root.userData.kind = 'ship';
  root.userData.assetId = `GLTFKIT_${entity.data && entity.data.defId || 'SHIP'}_${seed.toString(16)}`;

  const hull = new THREE.Group();
  hull.name = `${root.name}_Hull`;
  root.add(hull);
  root.userData.hull = hull;

  const materials = fallbackMaterials(palette, seed);
  const bindings = createBindings();
  const mutableMaterials = new Map();
  const staticBatches = createStaticBatchCollector(hull, bindings);
  const fallbackParts = [];
  const usedParts = [];
  const authoredSlots = {};
  const noteUsed = (slot, record) => {
    if (!record || !record.url) return;
    usedParts.push(record.url);
    if (!authoredSlots[slot]) authoredSlots[slot] = [];
    authoredSlots[slot].push(record.url);
  };

  // A low-poly pressure shell is always retained as the close-range readability silhouette. The
  // authored GLB parts remain the ship's detail layer, but this shell prevents a loaded ship from
  // reading as a few dark fragments or only an aft rocket when the current authored hull is sparse.
  const safetyCore = buildSafetyCore(hull, materials, palette);
  const hullRecord = selected.get('hull');
  if (hullRecord) {
    instantiatePart(hullRecord, hull, {
      position: [0, 0, 0], targetLength: 1.72, label: 'Hull',
    }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    noteUsed('hull', hullRecord);
  } else {
    fallbackParts.push('hull');
  }
  const authoredHullLevels = hullRecord ? authoredLevels(hullRecord) : new Set();
  safetyCore.visible = true;
  // Snapshot only mounts supplied by the hull. Parts may themselves contain internal markers, but
  // assembly topology belongs to the hull grammar and must not change as later slots are mounted.
  const hullMounts = snapshotMounts(bindings.mounts);

  if (!wholeShip) {
  const cockpitPlacement = placementFromMount(hullMounts.cockpit[0], hull, {
    position: [0.35, 0.12, 0], targetLength: 0.58, label: 'Cockpit',
  });
  const cockpitRecord = selected.get('cockpit');
  if (cockpitRecord) {
    instantiatePart(cockpitRecord, hull, cockpitPlacement,
      palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    noteUsed('cockpit', cockpitRecord);
  } else {
    buildFallbackCockpit(hull, materials, cockpitPlacement);
    fallbackParts.push('cockpit');
  }

  const engineCount = (entity.radius || 18) >= 17 ? 2 : 1;
  const defaultEnginePositions = engineCount === 1
    ? [[-0.66, -0.04, 0]]
    : [[-0.62, -0.04, -0.32], [-0.62, -0.04, 0.32]];
  const enginePlacements = hullMounts.engine.length
    ? hullMounts.engine.map((mount, index) => placementFromMount(mount, hull, {
      position: defaultEnginePositions[Math.min(index, defaultEnginePositions.length - 1)],
      targetLength: 0.58, label: `Engine_${index}`,
    }))
    : defaultEnginePositions.map((position, index) => ({ position, targetLength: 0.58, label: `Engine_${index}` }));
  const engineRecord = selected.get('engine');
  if (engineRecord) {
    for (const placement of enginePlacements) {
      instantiatePart(engineRecord, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    }
    noteUsed('engine', engineRecord);
  } else {
    for (let i = 0; i < enginePlacements.length; i++) {
      const drive = buildFallbackEngine(hull, enginePlacements[i], materials, palette, i);
      bindings.driveFans.push(drive.fan);
      bindings.driveCores.push(drive.driveCore);
      bindings.drivePlumes.push(drive.plume);
    }
    fallbackParts.push('engine');
  }

  const defaultFinPlacements = [-1, 1].map((side) => ({
    position: [-0.06, 0.02, side * 0.50], targetLength: 0.62,
    rotation: [0, 0, side * 0.04], label: side < 0 ? 'Fin_Port' : 'Fin_Starboard',
  }));
  const finPlacements = hullMounts.fin.length
    ? hullMounts.fin.map((mount, index) => placementFromMount(mount, hull, {
      ...defaultFinPlacements[Math.min(index, defaultFinPlacements.length - 1)],
      label: `Fin_${index}`,
    }))
    : defaultFinPlacements;
  const finRecord = selected.get('fin');
  for (const placement of finPlacements) {
    if (finRecord) {
      instantiatePart(finRecord, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    } else {
      buildFallbackFin(hull, materials, placement);
    }
  }
  if (finRecord) noteUsed('fin', finRecord);
  else fallbackParts.push('fin');
  } // end !wholeShip — skip cockpit/engine/fin for authored whole-ship bodies (baked in)
  const shipDef = SHIP_BY_ID.get(entity.data && entity.data.defId) || null;

  const weaponMounts = authoredWeaponMounts(entity, shipDef, library.get('weapon') || [], seed);
  if (weaponMounts.length) {
    let mounted = 0;
    for (const mount of weaponMounts) {
      if (!mount.record) continue;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('weapon', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('weapon');
  }

  const podMounts = authoredPodMounts(entity, shipDef, library.get('pod') || [], seed);
  if (podMounts.length) {
    let mounted = 0;
    for (const mount of podMounts) {
      if (!mount.record) continue;
      const partRoot = instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      if (mount.damageRole === 'armor') bindings.armor.push(partRoot);
      else bindings.secondary.push(partRoot);
      noteUsed('pod', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('pod');
  }

  const gearMount = authoredGearMount(entity, shipDef, library.get('gear') || [], seed);
  if (gearMount && gearMount.record) {
    const partRoot = instantiatePart(gearMount.record, hull, gearMount.placement,
      palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    bindings.secondary.push(partRoot);
    noteUsed('gear', gearMount.record);
  } else if (gearMount) {
    fallbackParts.push('gear');
  }

  const greebleMounts = authoredGreebleMounts(entity, shipDef, library.get('greeble') || [], seed);
  if (greebleMounts.length) {
    let mounted = 0;
    for (const mount of greebleMounts) {
      if (!mount.record) continue;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('greeble', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('greeble');
  }

  if (!bindings.navLights.length) buildFallbackNavLights(hull, materials, bindings);
  ensureStandardSockets(hull);
  staticBatches.flush();

  const primaryDrive = completeDriveBinding(bindings);
  const navLightBase = bindings.navLights.map((mesh) => (
    mesh && mesh.material && Number.isFinite(mesh.material.emissiveIntensity)
      ? mesh.material.emissiveIntensity : 1
  ));

  kit.finalizeShip({
    root,
    hull,
    entity,
    designRadius: 1,
    decals: bindings.decals,
    driveParts: primaryDrive,
    navLightBase,
    damageParts: {
      navLights: bindings.navLights,
      navLightBase,
      driveCore: primaryDrive && primaryDrive.driveCore,
      plume: primaryDrive && primaryDrive.plume,
      secondary: bindings.secondary,
      armor: bindings.armor,
      sensorSlits: bindings.sensorSlits,
    },
  });
  synchronizeSecondaryDrives(primaryDrive, bindings);
  installAuthoredLod(root, bindings, safetyCore, authoredHullLevels);
  root.userData.updateLod('lod0');

  // GR-5: authored compositions need the same persistent shield bubble as procedural ships so
  // syncEntityViews can toggle it from e.shield. Geometry shared via shipKit; material per-ship.
  const shieldBubble = kit.createShieldBubble(palette.accent || '#5fd0ff', entity.radius || 12);
  root.add(shieldBubble);
  root.userData.shieldBubble = shieldBubble;

  // Hidden geometry gives object-space tools/debuggers useful bounds even though opaque authored
  // surfaces are rendered by scene-level instance pools rather than as children of this root.
  const boundsProxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.72, 1.18),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  boundsProxy.name = 'GLTFKit_BoundsProxy';
  boundsProxy.visible = false;
  boundsProxy.userData.keepSeparate = true;
  hull.add(boundsProxy);

  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; normalized assembly scaled to entity radius',
    authoredParts: [...new Set(usedParts)],
    authoredSlots: uniqueSlotMap(authoredSlots),
    proceduralFallbackParts: fallbackParts,
    instancing: 'opaque immutable primitives merged into ship-local static batches',
    hookBinding: 'HOOK_* / SOCKET_* / MOUNT_* / LOD* names bound to shipKit.finalizeShip + shipDamage',
    physicalCanopy: { transmission: 0.6, ior: 1.4, clearcoat: 1.0 },
  };

  return {
    root,
    authoredParts: [...new Set(usedParts)],
    authoredSlots: uniqueSlotMap(authoredSlots),
    fallbackParts,
  };
}

function requiredWholeShipMessage(entity, wholeShipFile, records, partRoot) {
  const defId = entity && entity.data && entity.data.defId || 'unknown_ship';
  const wantedUrl = `${partRoot || PART_RELEASE_ROOT}${wholeShipFile}`;
  const loadedWholeShips = (records || [])
    .map((record) => record && record.url)
    .filter((url) => url && isWholeShipUrl(url));
  return `[partsLibrary] release mode requires ${wantedUrl} for ${defId}; it did not pass the live authored-asset loader. ` +
    `Loaded whole-ship hull records: ${loadedWholeShips.length ? loadedWholeShips.join(', ') : 'none'}. ` +
    'Fix the GLB contract instead of falling back to modular hulls.';
}

function uniqueSlotMap(slots) {
  return Object.fromEntries(Object.entries(slots).map(([slot, urls]) => [slot, [...new Set(urls)]]));
}

function authoredWeaponMounts(entity, shipDef, records, seed) {
  const data = entity.data || {};
  const runtimeWeapons = Array.isArray(data.weapons) ? data.weapons : [];
  const fittedWeaponIds = Array.isArray(data.fittings)
    ? data.fittings.filter((id) => WEAPON_BY_ID.has(id))
    : [];
  const hardpoints = shipDef && shipDef.visuals && Array.isArray(shipDef.visuals.hardpoints)
    ? shipDef.visuals.hardpoints
    : [];
  const slotEntries = shipSlotEntries(shipDef, 'weapon');
  const count = Math.min(6, Math.max(runtimeWeapons.length, fittedWeaponIds.length, hardpoints.length, slotEntries.length));
  const mounts = [];
  for (let i = 0; i < count; i++) {
    const runtime = runtimeWeapons[i] || {};
    const slot = slotEntries[i];
    const hardpoint = hardpoints[i] || defaultHardpoint(i, count);
    const defId = runtime.defId || fittedWeaponIds[i] || null;
    const wdef = WEAPON_BY_ID.get(defId) || null;
    const facing = runtime.facing || hardpoint.facing || slotFacing(slot) || 'front';
    const size = runtime.size || (wdef && wdef.size) || hardpoint.size || slotSize(slot) || 'S';
    const record = weaponRecordFor(records, wdef, facing, size, seed, i);
    mounts.push({
      record,
      placement: {
        position: hardpoint.pos || defaultHardpoint(i, count).pos,
        rotation: [0, yawForFacing(facing), 0],
        targetLength: weaponTargetLength(size, wdef),
        label: `Weapon_${i}_${facing}`,
      },
    });
  }
  return mounts;
}

function authoredPodMounts(entity, shipDef, records, seed) {
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const cargoSlots = shipSlotEntries(shipDef, 'cargo').length;
  const utilitySlots = shipSlotEntries(shipDef, 'utility').length;
  const mounts = [];

  if (cargoSlots >= 2 || role.includes('freighter') || role.includes('miner')) {
    const file = role.includes('miner') ? 'pods/pod_utility.glb' : 'pods/pod_cargo_container.glb';
    const record = recordForFile(records, file) || hashedRecord(records, seed, 'pod:cargo');
    mounts.push({
      record,
      damageRole: 'secondary',
      placement: {
        position: [-0.16, role.includes('miner') ? 0.34 : -0.24, cargoSlots >= 3 ? 0.34 : -0.34],
        targetLength: role.includes('miner') ? 0.30 : 0.38,
        label: 'Pod_CargoUtility',
      },
    });
  }

  if (utilitySlots > 0 && !role.includes('capital')) {
    const record = recordForFile(records, 'pods/pod_utility.glb') || hashedRecord(records, seed, 'pod:utility');
    mounts.push({
      record,
      damageRole: 'secondary',
      placement: {
        position: [-0.04, 0.36, role.includes('fighter') || role.includes('interceptor') ? -0.26 : 0],
        targetLength: role.includes('fighter') || role.includes('interceptor') ? 0.24 : 0.30,
        label: 'Pod_Utility',
      },
    });
  }

  if (role === 'starter' || role === 'multirole' || entity.team === 1) {
    const record = recordForFile(records, 'pods/pod_repair_patch.glb') || hashedRecord(records, seed, 'pod:repair');
    mounts.push({
      record,
      damageRole: 'armor',
      placement: {
        position: [0.10, 0.22, -0.43],
        rotation: [0, 0, -0.03],
        targetLength: 0.25,
        label: 'Pod_RepairPatch',
      },
    });
  }

  return mounts.slice(0, 3);
}

function authoredGearMount(entity, shipDef, records, seed) {
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const heavy = (entity.radius || 0) >= 18 || role.includes('freighter') || role.includes('miner') || role.includes('capital');
  const file = heavy ? 'gear/skid_quad.glb' : 'gear/skid_trio.glb';
  return {
    record: recordForFile(records, file) || hashedRecord(records, seed, 'gear'),
    placement: {
      position: [-0.12, -0.39, 0],
      targetLength: heavy ? 0.42 : 0.34,
      label: heavy ? 'Gear_QuadSkid' : 'Gear_TrioSkid',
    },
  };
}

function authoredGreebleMounts(entity, shipDef, records, seed) {
  if (entity.factionId === 'faction_vael') return [];
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const hints = (shipDef && shipDef.visuals && shipDef.visuals.tiers && shipDef.visuals.tiers[0] && shipDef.visuals.tiers[0].hints) || {};
  const density = Number.isFinite(hints.greeble) ? hints.greeble : 0.55;
  const files = role.includes('miner') || role.includes('freighter')
    ? ['greebles/greeble_pipes.glb', 'greebles/greeble_armor_plates.glb', 'greebles/greeble_vents.glb']
    : role.includes('fighter') || role.includes('interceptor')
      ? ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb', 'greebles/greeble_vents.glb']
      : ['greebles/greeble_hatches.glb', 'greebles/greeble_antennas.glb', 'greebles/greeble_armor_plates.glb'];
  const max = density > 0.75 ? 3 : 2;
  const placements = [
    { position: [0.16, 0.30, 0.30], rotation: [0, 0, 0.02], targetLength: 0.16, label: 'Greeble_DorsalA' },
    { position: [-0.24, 0.27, -0.30], rotation: [0, 0, -0.02], targetLength: 0.15, label: 'Greeble_DorsalB' },
    { position: [-0.38, 0.14, 0.42], rotation: [0, 0, 0.04], targetLength: 0.14, label: 'Greeble_ServiceC' },
  ];
  const mounts = [];
  for (let i = 0; i < Math.min(max, files.length); i++) {
    mounts.push({
      record: recordForFile(records, files[i]) || hashedRecord(records, seed, `greeble:${i}`),
      placement: placements[i],
    });
  }
  return mounts;
}

function shipSlotEntries(shipDef, slot) {
  const entries = shipDef && shipDef.slots && shipDef.slots[slot];
  return Array.isArray(entries) ? entries : [];
}

function slotSize(entry) {
  if (typeof entry === 'string') return entry;
  return entry && entry.size;
}

function slotFacing(entry) {
  return entry && typeof entry === 'object' ? entry.facing : null;
}

function defaultHardpoint(index, count) {
  if (count <= 1) return { pos: [0.68, 0.08, 0], facing: 'front', size: 'S' };
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return { pos: [0.64 - row * 0.12, 0.08, side * (0.16 + row * 0.10)], facing: 'front', size: 'S' };
}

function yawForFacing(facing) {
  switch (facing) {
    case 'rear': return Math.PI;
    case 'left': return Math.PI / 2;
    case 'right': return -Math.PI / 2;
    default: return 0;
  }
}

function weaponTargetLength(size, wdef) {
  if (wdef && String(wdef.id || '').includes('lance')) return 0.48;
  if (size === 'L') return 0.44;
  if (size === 'M') return 0.34;
  return 0.24;
}

function weaponRecordFor(records, wdef, facing, size, seed, index) {
  const id = String(wdef && wdef.id || '').toLowerCase();
  const tracking = String(wdef && wdef.tracking || '').toLowerCase();
  let file = 'weapons/weapon_pulse_cannon.glb';
  if (facing === 'turret' || tracking === 'auto_turret') file = 'weapons/weapon_turret_dual.glb';
  else if (size === 'L' || id.includes('lance') || id.includes('beam')) file = 'weapons/weapon_lance.glb';
  else if (id.includes('rail')) file = 'weapons/weapon_railgun.glb';
  else if (id.includes('autocannon') || id.includes('gatling')) file = 'weapons/weapon_gatling.glb';
  else if (id.includes('torpedo') || id.includes('missile') || id.includes('plasma')) file = 'weapons/weapon_heavy_cannon.glb';
  return recordForFile(records, file) || hashedRecord(records, seed, `weapon:${index}`);
}

function recordForFile(records, file) {
  return (records || []).find((record) => String(record && record.url || '').endsWith(file)) || null;
}

function hashedRecord(records, seed, key) {
  if (!records || !records.length) return null;
  return records[((seed ^ hashString(key)) >>> 0) % records.length];
}

function compositionPrimitives(record) {
  let cached = compositionPrimitiveCache.get(record);
  if (cached) return cached;

  const output = [];
  const buckets = new Map();
  for (const primitive of record.primitives) {
    if (requiresPerShipMesh(primitive)) {
      if (!canMergeDedicatedPrimitive(primitive)) {
        output.push(primitive);
        continue;
      }
      const key = dedicatedBatchKey(primitive);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { first: primitive, primitives: [], dedicated: true, anchorMatrix: primitive.tags.driveAnchorMatrix };
        buckets.set(key, bucket);
      }
      bucket.primitives.push(primitive);
      continue;
    }
    const key = pooledBatchKey(primitive);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { first: primitive, primitives: [], dedicated: false, anchorMatrix: null };
      buckets.set(key, bucket);
    }
    bucket.primitives.push(primitive);
  }

  for (const bucket of buckets.values()) {
    if (bucket.primitives.length <= 1) {
      output.push(bucket.first);
      continue;
    }
    const geometries = bucket.primitives.map((primitive) => {
      const geometry = primitive.geometry.clone();
      if (bucket.anchorMatrix) {
        BATCH_INVERSE.copy(bucket.anchorMatrix).invert();
        BATCH_LOCAL.multiplyMatrices(BATCH_INVERSE, primitive.matrix);
        geometry.applyMatrix4(BATCH_LOCAL);
      } else {
        geometry.applyMatrix4(primitive.matrix);
      }
      return geometry;
    });
    const normalized = normalizeStaticBatchGeometries(geometries);
    const merged = canMergeStaticBatchGeometries(normalized) ? mergeGeometries(normalized, false) : null;
    for (const geometry of normalized) {
      if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
    }
    if (!merged) {
      output.push(...bucket.primitives);
      continue;
    }
    const batchKey = `${record.url}#batch#${pooledBatchKey(bucket.first)}`;
    merged.userData = { ...(merged.userData || {}), spacefaceBatchKey: batchKey };
    const tags = bucket.dedicated ? clonePrimitiveTags(bucket.first.tags) : bucket.first.tags;
    output.push(Object.freeze({
      key: batchKey,
      name: `Batch_${bucket.first.name || 'Primitive'}_${bucket.primitives.length}`,
      geometry: merged,
      material: bucket.first.material,
      matrix: bucket.anchorMatrix ? bucket.anchorMatrix.clone() : IDENTITY_MATRIX.clone(),
      tags,
    }));
  }

  cached = Object.freeze(output);
  compositionPrimitiveCache.set(record, cached);
  return cached;
}

function canMergeDedicatedPrimitive(primitive) {
  const tags = primitive && primitive.tags || {};
  if (tags.drive && tags.driveAnchorMatrix) return true;
  return !!(tags.canopy && tags.instance !== false && !tags.drive && !tags.damageRole && !tags.decal);
}

function dedicatedBatchKey(primitive) {
  const tags = primitive.tags || {};
  return [
    'dedicated',
    materialBatchSignature(primitive.material),
    geometryBatchSignature(primitive.geometry),
    tags.lod || 'always',
    tags.canopy ? 'canopy' : '',
    tintRole(tags),
    tags.drive || '',
    matrixBatchSignature(tags.driveAnchorMatrix),
  ].join('|');
}

function clonePrimitiveTags(tags) {
  const next = { ...(tags || {}) };
  if (tags && tags.driveAnchorMatrix) next.driveAnchorMatrix = tags.driveAnchorMatrix.clone();
  return Object.freeze(next);
}

function pooledBatchKey(primitive) {
  const tags = primitive.tags || {};
  return [
    materialBatchSignature(primitive.material),
    geometryBatchSignature(primitive.geometry),
    tags.lod || 'always',
    tintRole(tags),
    tags.damageRole || '',
    tags.instance === false ? 'unique' : 'pooled',
  ].join('|');
}

function geometryBatchSignature(geometry) {
  if (!geometry) return 'no-geometry';
  const attrs = geometry.attributes || {};
  const attrSig = Object.keys(attrs).sort().map((name) => {
    const attr = attrs[name];
    const array = attr && attr.array;
    return [
      name,
      attr && attr.itemSize,
      attr && attr.normalized ? 1 : 0,
      attr && attr.isInterleavedBufferAttribute ? 'interleaved' : 'plain',
      array && array.constructor && array.constructor.name || 'array',
    ].join(':');
  }).join(',');
  const index = geometry.index;
  const indexArray = index && index.array;
  const indexSig = index
    ? `index:${index.itemSize || 1}:${indexArray && indexArray.constructor && indexArray.constructor.name || 'array'}`
    : 'index:none';
  return `${indexSig}|${attrSig}`;
}

function matrixBatchSignature(matrix) {
  if (!matrix || !matrix.elements) return 'matrix:none';
  return Array.prototype.map.call(matrix.elements, (value) => Number.isFinite(value) ? Number(value).toFixed(5) : 'x').join(',');
}

function materialBatchSignature(material) {
  if (!material) return 'material:none';
  return [
    material.type || 'Material',
    material.transparent ? 1 : 0,
    material.depthWrite === false ? 0 : 1,
    material.depthTest === false ? 0 : 1,
    material.side == null ? THREE.FrontSide : material.side,
    material.blending == null ? THREE.NormalBlending : material.blending,
    material.vertexColors ? 1 : 0,
    fixedSig(material.alphaTest, 3),
    fixedSig(material.opacity, 3),
    colorSig(material.color),
    fixedSig(material.roughness, 3),
    fixedSig(material.metalness, 3),
    colorSig(material.emissive),
    fixedSig(material.emissiveIntensity, 3),
    fixedSig(material.transmission, 3),
    fixedSig(material.clearcoat, 3),
    fixedSig(material.clearcoatRoughness, 3),
    vector2Sig(material.normalScale),
    textureBatchSignature(material.map),
    textureBatchSignature(material.normalMap),
    textureBatchSignature(material.aoMap),
    textureBatchSignature(material.roughnessMap),
    textureBatchSignature(material.metalnessMap),
    textureBatchSignature(material.emissiveMap),
    textureBatchSignature(material.alphaMap),
  ].join('|');
}

function textureBatchSignature(texture) {
  if (!texture) return 'tex:none';
  const image = texture.image || (texture.source && texture.source.data) || null;
  const sourceKey = texture.source && texture.source.uuid
    || texture.userData && texture.userData.spacefaceSourceKey
    || image && (image.currentSrc || image.src || image.uuid)
    || texture.uuid;
  return [
    sourceKey || 'tex',
    texture.colorSpace || '',
    texture.flipY ? 1 : 0,
    texture.channel || 0,
    texture.wrapS || 0,
    texture.wrapT || 0,
    texture.minFilter || 0,
    texture.magFilter || 0,
    textureMatrixSig(texture),
    image && Number.isFinite(image.width) ? image.width : 0,
    image && Number.isFinite(image.height) ? image.height : 0,
  ].join(':');
}

function colorSig(color) {
  return color && typeof color.getHexString === 'function' ? color.getHexString() : 'none';
}

function fixedSig(value, places) {
  return Number.isFinite(value) ? Number(value).toFixed(places) : 'none';
}

function vector2Sig(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y)
    ? `${value.x.toFixed(3)},${value.y.toFixed(3)}`
    : 'none';
}

function textureMatrixSig(texture) {
  if (!texture || !texture.matrix) return 'matrix:none';
  if (texture.matrixAutoUpdate && typeof texture.updateMatrix === 'function') texture.updateMatrix();
  const elements = texture.matrix.elements || [];
  return Array.prototype.map.call(elements, (value) => Number.isFinite(value) ? Number(value).toFixed(4) : 'x').join(',');
}

function createStaticBatchCollector(parent, bindings) {
  const buckets = new Map();
  return {
    add({ record, primitive, partRoot, material }) {
      const key = staticBatchKey(material, primitive);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material,
          tags: clonePrimitiveTags(primitive.tags),
          entries: [],
          urls: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.entries.push({ record, primitive, partMatrix: partRoot.matrix.clone() });
      if (record && record.url) bucket.urls.add(record.url);
    },
    flush() {
      const groups = new Map();
      for (const bucket of buckets.values()) {
        const key = staticBatchGroupKey(bucket.tags);
        let group = groups.get(key);
        if (!group) {
          group = [];
          groups.set(key, group);
        }
        group.push(bucket);
      }
      for (const group of groups.values()) flushStaticBatchGroup(parent, bindings, group);
      buckets.clear();
    },
  };
}

function staticBatchKey(material, primitive) {
  const tags = primitive && primitive.tags || {};
  return [
    materialBatchSignature(material),
    tags.lod || 'always',
    tags.damageRole || '',
  ].join('|');
}

function staticBatchGroupKey(tags = {}) {
  return [
    tags.lod || 'always',
    tags.damageRole || '',
  ].join('|');
}

function flushStaticBatch(parent, bindings, bucket) {
  const merged = buildStaticBatchGeometry(bucket);
  if (!merged) {
    for (const entry of bucket.entries) {
      const geometry = entry.primitive.geometry.clone();
      geometry.applyMatrix4(entry.primitive.matrix);
      geometry.applyMatrix4(entry.partMatrix);
      addStaticBatchMesh(parent, bindings, geometry, bucket.material, bucket.tags, [entry.record && entry.record.url], entry.primitive.name);
    }
    return;
  }
  addStaticBatchMesh(parent, bindings, merged, bucket.material, bucket.tags, [...bucket.urls], `StaticBatch_${bucket.entries.length}`);
}

function flushStaticBatchGroup(parent, bindings, buckets) {
  if (!buckets || buckets.length === 0) return;
  if (buckets.length === 1) {
    flushStaticBatch(parent, bindings, buckets[0]);
    return;
  }

  const geometries = [];
  const materials = [];
  const urls = new Set();
  let partCount = 0;
  for (const bucket of buckets) {
    const geometry = buildStaticBatchGeometry(bucket);
    if (!geometry) {
      for (const pending of geometries) {
        if (pending && typeof pending.dispose === 'function') pending.dispose();
      }
      for (const fallback of buckets) flushStaticBatch(parent, bindings, fallback);
      return;
    }
    geometries.push(geometry);
    materials.push(bucket.material);
    partCount += bucket.entries.length;
    for (const url of bucket.urls) urls.add(url);
  }

  const normalized = normalizeStaticBatchGeometries(geometries);
  const merged = canMergeStaticBatchGeometries(normalized) ? mergeGeometries(normalized, true) : null;
  for (const geometry of normalized) {
    if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
  }
  if (!merged) {
    for (const fallback of buckets) flushStaticBatch(parent, bindings, fallback);
    return;
  }
  addStaticBatchMesh(parent, bindings, merged, materials, buckets[0].tags, [...urls], `StaticGroup_${partCount}_${materials.length}`);
}

function buildStaticBatchGeometry(bucket) {
  const geometries = normalizeStaticBatchGeometries(bucket.entries.map((entry) => {
    const geometry = entry.primitive.geometry.clone();
    geometry.applyMatrix4(entry.primitive.matrix);
    geometry.applyMatrix4(entry.partMatrix);
    return geometry;
  }));
  const merged = canMergeStaticBatchGeometries(geometries) ? mergeGeometries(geometries, false) : null;
  for (const geometry of geometries) {
    if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
  }
  return merged || null;
}

function normalizeStaticBatchGeometries(geometries) {
  const normalized = geometries.map((geometry) => {
    if (!geometry) return geometry;
    let next = geometry;
    if (next.index && typeof next.toNonIndexed === 'function') {
      next = next.toNonIndexed();
      if (next !== geometry && typeof geometry.dispose === 'function') geometry.dispose();
    }
    if (!next.getAttribute('normal') && typeof next.computeVertexNormals === 'function') {
      next.computeVertexNormals();
    }
    return next;
  }).filter(Boolean);

  const specs = new Map();
  const conflicts = new Set();
  for (const geometry of normalized) {
    const attrs = geometry.attributes || {};
    for (const [name, attr] of Object.entries(attrs)) {
      if (!attr || !attributeArray(attr) || name === 'skinIndex' || name === 'skinWeight') continue;
      const spec = attributeSpec(attr);
      const existing = specs.get(name);
      if (!existing) specs.set(name, spec);
      else if (!sameAttributeSpec(existing, spec)) conflicts.add(name);
    }
  }
  normalizeStaticAttributeConflicts(normalized, specs, conflicts);
  for (const geometry of normalized) {
    for (const name of conflicts) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
  }
  for (const name of conflicts) specs.delete(name);

  for (const geometry of normalized) {
    const position = geometry.getAttribute('position');
    const count = position && position.count || 0;
    if (!count) continue;
    for (const [name, spec] of specs) {
      if (geometry.getAttribute(name)) continue;
      geometry.setAttribute(name, createEmptyAttribute(name, spec, count));
    }
  }
  return normalized;
}

function normalizeStaticAttributeConflicts(geometries, specs, conflicts) {
  for (const name of [...conflicts]) {
    if (!isPromotableStaticAttribute(name)) continue;
    const itemSize = firstAttributeItemSize(geometries, name) || defaultAttributeItemSize(name);
    const spec = { itemSize, normalized: false, ArrayType: Float32Array };
    for (const geometry of geometries) {
      const attr = geometry.getAttribute(name);
      if (!attr) continue;
      if (sameAttributeSpec(attributeSpec(attr), spec) && !attr.isInterleavedBufferAttribute) continue;
      geometry.setAttribute(name, convertAttributeToFloat(attr, itemSize));
    }
    specs.set(name, spec);
    conflicts.delete(name);
  }
}

function isPromotableStaticAttribute(name) {
  return name === 'position' || name === 'normal' || name === 'uv' || name === 'uv1' || name === 'uv2';
}

function firstAttributeItemSize(geometries, name) {
  for (const geometry of geometries) {
    const attr = geometry && geometry.getAttribute(name);
    if (attr && attr.itemSize) return attr.itemSize;
  }
  return 0;
}

function defaultAttributeItemSize(name) {
  if (name === 'position' || name === 'normal') return 3;
  return 2;
}

function convertAttributeToFloat(attr, itemSize) {
  const count = attr && attr.count || 0;
  const next = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) {
      next[i * itemSize + c] = c < attr.itemSize ? normalizedAttributeComponent(attr, i, c) : 0;
    }
  }
  return new THREE.BufferAttribute(next, itemSize, false);
}

function normalizedAttributeComponent(attr, index, component) {
  let value = 0;
  if (component === 0 && typeof attr.getX === 'function') value = attr.getX(index);
  else if (component === 1 && typeof attr.getY === 'function') value = attr.getY(index);
  else if (component === 2 && typeof attr.getZ === 'function') value = attr.getZ(index);
  else if (component === 3 && typeof attr.getW === 'function') value = attr.getW(index);
  const array = attributeArray(attr);
  if (!attr.normalized || !array) return value;
  const scale = normalizedAttributeScale(array);
  if (!scale) return value;
  return scale.signed ? Math.max(-1, value / scale.max) : value / scale.max;
}

function normalizedAttributeScale(array) {
  if (array instanceof Int8Array) return { max: 127, signed: true };
  if (array instanceof Int16Array) return { max: 32767, signed: true };
  if (array instanceof Int32Array) return { max: 2147483647, signed: true };
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return { max: 255, signed: false };
  if (array instanceof Uint16Array) return { max: 65535, signed: false };
  if (array instanceof Uint32Array) return { max: 4294967295, signed: false };
  return null;
}

function canMergeStaticBatchGeometries(geometries) {
  if (!geometries || geometries.length === 0) return false;
  const first = geometries[0];
  if (!first) return false;
  const indexed = !!first.index;
  const names = Object.keys(first.attributes || {}).sort();
  const specs = new Map(names.map((name) => [name, attributeSpec(first.getAttribute(name))]));
  for (const geometry of geometries) {
    if (!geometry || !!geometry.index !== indexed) return false;
    const nextNames = Object.keys(geometry.attributes || {}).sort();
    if (nextNames.length !== names.length || nextNames.some((name, index) => name !== names[index])) return false;
    for (const name of names) {
      if (!sameAttributeSpec(specs.get(name), attributeSpec(geometry.getAttribute(name)))) return false;
    }
  }
  return true;
}

function attributeArray(attr) {
  return attr && (attr.array || (attr.data && attr.data.array)) || null;
}

function attributeSpec(attr) {
  const array = attributeArray(attr);
  const ArrayType = array && array.constructor || Float32Array;
  return {
    itemSize: attr.itemSize || 1,
    normalized: !!attr.normalized,
    ArrayType,
  };
}

function sameAttributeSpec(a, b) {
  return !!(a && b && a.itemSize === b.itemSize && a.normalized === b.normalized && a.ArrayType === b.ArrayType);
}

function createEmptyAttribute(name, spec, count) {
  const ArrayType = spec.ArrayType || Float32Array;
  const array = new ArrayType(count * spec.itemSize);
  if (name === 'color') {
    const max = integerAttributeMax(ArrayType, spec.normalized);
    for (let i = 0; i < array.length; i++) array[i] = max;
  } else if (name === 'tangent' && spec.itemSize >= 4) {
    for (let i = 3; i < array.length; i += spec.itemSize) array[i] = 1;
  }
  return new THREE.BufferAttribute(array, spec.itemSize, spec.normalized);
}

function integerAttributeMax(ArrayType, normalized) {
  if (!normalized) return 1;
  if (ArrayType === Uint8Array || ArrayType === Uint8ClampedArray) return 255;
  if (ArrayType === Uint16Array) return 65535;
  return 1;
}

function addStaticBatchMesh(parent, bindings, geometry, material, tags, urls, label) {
  if (geometry && typeof geometry.computeBoundingSphere === 'function') geometry.computeBoundingSphere();
  if (geometry && typeof geometry.computeBoundingBox === 'function') geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `GLTFKit_${label || 'StaticBatch'}`;
  const materials = Array.isArray(material) ? material : [material];
  mesh.castShadow = materials.some((entry) => entry && !entry.transparent && entry.depthWrite !== false);
  mesh.receiveShadow = materials.some((entry) => entry && !entry.transparent);
  mesh.visible = !tags.lod || tags.lod === 'lod0';
  const partUrls = [...new Set((urls || []).filter(Boolean))];
  mesh.userData = {
    spacefaceStaticBatch: true,
    spacefaceStaticBatchMaterials: materials.length,
    spacefacePartUrl: partUrls[0],
    spacefacePartUrls: partUrls,
    spacefaceTags: tags,
  };
  parent.add(mesh);
  registerBinding(mesh, tags, bindings);
  return mesh;
}

function instantiatePart(record, parent, placement, palette, scene, owner, bindings, mutableMaterials, staticBatches = null) {
  const partRoot = new THREE.Group();
  partRoot.name = `GLTFKit_${placement.label}_${record.assetId}`;
  applyPlacementTransform(partRoot, placement);
  const sourceLength = Math.max(record.bounds.size[0], 1e-6); // +X length is part of the authoring contract
  const scale = placement.targetLength / sourceLength;
  partRoot.scale.multiplyScalar(scale);
  partRoot.updateMatrix();
  parent.add(partRoot);

  for (const primitive of compositionPrimitives(record)) {
    const dedicated = requiresPerShipMesh(primitive);
    let object;
    if (dedicated) {
      // Preserve the authored node transform on an anchor. shipKit's drive driver intentionally
      // overwrites fan rotation/core/plume scale, so binding the inner identity mesh prevents that
      // state update from erasing an artist's placement or baked hierarchy scale.
      const anchor = new THREE.Object3D();
      anchor.name = `${placement.label}_${primitive.name}_Anchor`;
      const anchorMatrix = primitive.tags && primitive.tags.driveAnchorMatrix || primitive.matrix;
      anchorMatrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
      partRoot.add(anchor);

      const material = dedicatedMaterialFor(
        primitive.material, primitive.tags, palette, mutableMaterials,
        `${record.url}|${placement.label}|${primitive.key}`
      );
      object = new THREE.Mesh(primitive.geometry, material);
      if (primitive.tags && primitive.tags.driveAnchorMatrix) {
        BATCH_INVERSE.copy(anchorMatrix).invert();
        BATCH_LOCAL.multiplyMatrices(BATCH_INVERSE, primitive.matrix);
        BATCH_LOCAL.decompose(object.position, object.quaternion, object.scale);
      }
      object.castShadow = !material.transparent && material.depthWrite !== false;
      object.receiveShadow = !material.transparent;
      object.userData.keepSeparate = true;
      anchor.add(object);
    } else {
      const material = sharedMaterialFor(primitive.material, primitive.tags, palette);
      if (staticBatches) {
        staticBatches.add({ record, primitive, partRoot, material });
        continue;
      }
      object = new THREE.Object3D();
      object.userData.spacefaceInstanceProxy = true;
      primitive.matrix.decompose(object.position, object.quaternion, object.scale);
      allocateInstance(scene, owner, object, primitive.geometry, material, primitive.name);
      partRoot.add(object);
    }
    object.name = `${placement.label}_${primitive.name}`;
    object.visible = !primitive.tags.lod || primitive.tags.lod === 'lod0';
    object.userData.spacefacePartUrl = record.url;
    object.userData.spacefaceTags = primitive.tags;
    registerBinding(object, primitive.tags, bindings);
  }

  for (const marker of record.markers) {
    const object = new THREE.Object3D();
    object.name = marker.name;
    marker.matrix.decompose(object.position, object.quaternion, object.scale);
    object.userData = {
      ...marker.userData,
      spacefaceTags: marker.tags,
      spacefacePartNormalization: scale,
      spacefaceMount: marker.tags.mount || undefined,
      spacefaceMountKey: marker.tags.mountKey || undefined,
    };
    if (marker.tags.socket) {
      if (bindings.socketNames.has(marker.name)) continue; // deterministic first-wins across repeated parts
      bindings.socketNames.add(marker.name);
      object.userData.spacefaceSocket = true;
      object.userData.role = marker.tags.socketRole || marker.userData.role || 'attachment';
      object.userData.forward = marker.tags.socketForward || marker.userData.forward || [1, 0, 0];
    }
    object.visible = !marker.tags.lod || marker.tags.lod === 'lod0';
    partRoot.add(object);
    registerBinding(object, marker.tags, bindings);
  }
  return partRoot;
}

function createBindings() {
  return {
    driveFans: [], driveCores: [], drivePlumes: [],
    navLights: [], sensorSlits: [], armor: [], secondary: [], decals: [],
    socketNames: new Set(),
    mounts: { cockpit: [], engine: [], fin: [] },
    lod: { lod0: [], lod1: [], lod2: [] },
    lodDynamicDetails: [],
  };
}

function registerBinding(object, tags, bindings) {
  const renderable = object.isMesh || !!(object.userData && object.userData.spacefaceInstanceProxy);
  if (tags.drive === 'fan' && object.isMesh) bindings.driveFans.push(object);
  if (tags.drive === 'core' && object.isMesh) bindings.driveCores.push(object);
  if (tags.drive === 'plume' && object.isMesh) bindings.drivePlumes.push(object);
  if (tags.damageRole === 'navLight' && object.isMesh) bindings.navLights.push(object);
  if (tags.damageRole === 'sensor' && object.isMesh) bindings.sensorSlits.push(object);
  if (tags.damageRole === 'armor' && object.isMesh) bindings.armor.push(object);
  if (tags.damageRole === 'secondary' && renderable) bindings.secondary.push(object);
  if (tags.decal && object.isMesh) bindings.decals.push(object);
  if (tags.mount && bindings.mounts[tags.mount]) bindings.mounts[tags.mount].push(object);
  if (renderable && tags.lod && bindings.lod[tags.lod]) bindings.lod[tags.lod].push(object);
  if (renderable && isLodDynamicDetail(tags)) bindings.lodDynamicDetails.push(object);
}

function isLodDynamicDetail(tags = {}) {
  return tags.drive === 'fan';
}

function requiresPerShipMesh(primitive) {
  const tags = primitive.tags;
  const material = primitive.material;
  return tags.instance === false || tags.canopy || !!tags.drive ||
    tags.damageRole === 'navLight' || tags.damageRole === 'sensor' || tags.damageRole === 'armor' || tags.decal ||
    material.transparent || material.transmission > 0 || material.depthWrite === false;
}

function completeDriveBinding(bindings) {
  const fan = bindings.driveFans[0] || null;
  const driveCore = bindings.driveCores[0] || null;
  const plume = bindings.drivePlumes[0] || null;
  if (!fan || !driveCore || !plume) return null;
  for (const driveFan of bindings.driveFans) kit.captureDrivePose(driveFan);
  for (const core of bindings.driveCores) kit.captureDrivePose(core);
  for (const drivePlume of bindings.drivePlumes) {
    kit.captureDrivePose(drivePlume);
    if (drivePlume.material) {
      drivePlume.material.transparent = true;
      drivePlume.material.depthWrite = false;
      if (!Number.isFinite(drivePlume.material.opacity)) drivePlume.material.opacity = 0.55;
    }
    drivePlume.castShadow = false;
    drivePlume.receiveShadow = false;
    drivePlume.renderOrder = Math.max(drivePlume.renderOrder || 0, 2);
  }
  return {
    fan,
    driveCore,
    plume,
    plumeMat: plume.material || null,
    basePlumeOpacity: plume.material && Number.isFinite(plume.material.opacity) ? plume.material.opacity : 0.55,
    flicker: false,
  };
}

function synchronizeSecondaryDrives(primary, bindings) {
  if (!primary || !primary.fan) return;
  const before = primary.fan.onBeforeRender;
  const primaryCorePose = kit.captureDrivePose(primary.driveCore);
  const primaryPlumePose = kit.captureDrivePose(primary.plume);
  const coreFactor = new THREE.Vector3(1, 1, 1);
  const plumeFactor = new THREE.Vector3(1, 1, 1);
  const secondaryCores = bindings.driveCores.slice(1).map((mesh) => ({
    mesh,
    pose: kit.captureDrivePose(mesh),
  }));
  const secondaryPlumes = bindings.drivePlumes.slice(1).map((mesh) => ({
    mesh,
    pose: kit.captureDrivePose(mesh),
  }));
  primary.fan.onBeforeRender = function synchronizedDrive(...args) {
    if (typeof before === 'function') before.apply(this, args);
    for (let i = 1; i < bindings.driveFans.length; i++) {
      bindings.driveFans[i].rotation.x = primary.fan.rotation.x;
    }
    if (primary.driveCore && primaryCorePose) {
      kit.readDrivePoseScaleFactors(primary.driveCore, primaryCorePose, coreFactor);
      for (const { mesh, pose } of secondaryCores) {
        kit.applyDrivePoseScale(mesh, pose, coreFactor);
      }
    }
    if (primary.plume && primaryPlumePose) {
      kit.readDrivePoseScaleFactors(primary.plume, primaryPlumePose, plumeFactor);
      for (const { mesh, pose } of secondaryPlumes) {
        kit.applyDrivePoseScale(mesh, pose, plumeFactor, { lockForwardEdgeX: true });
        if (mesh.material && primary.plume.material) {
          mesh.material.opacity = primary.plume.material.opacity;
        }
      }
    }
  };
}

function authoredLevels(record) {
  const levels = new Set();
  let alwaysVisible = false;
  for (const primitive of record.primitives) {
    if (primitive.tags.lod) levels.add(primitive.tags.lod);
    else alwaysVisible = true;
  }
  if (alwaysVisible) {
    levels.add('lod0'); levels.add('lod1'); levels.add('lod2');
  }
  return levels;
}

function installAuthoredLod(root, bindings, safetyCore, authoredHullLevels) {
  const baseUpdate = root.userData.updateLod;
  const levelsByPart = new Map();
  let appliedLevel = null;
  for (const [bucket, objects] of Object.entries(bindings.lod)) {
    for (const object of objects) {
      const key = lodPartKey(object);
      if (!levelsByPart.has(key)) levelsByPart.set(key, new Set());
      levelsByPart.get(key).add(bucket);
    }
  }
  root.userData.updateLod = function updateComposedLod(level) {
    const requested = normalizeRequestedLod(level);
    if (requested === appliedLevel) return;
    appliedLevel = requested;
    if (typeof baseUpdate === 'function') baseUpdate(level);
    for (const [bucket, objects] of Object.entries(bindings.lod)) {
      for (const object of objects) {
        object.visible = bucket === closestAvailableLod(requested, levelsByPart.get(lodPartKey(object)));
      }
    }
    for (const object of bindings.lodDynamicDetails) {
      const tags = object && object.userData && object.userData.spacefaceTags || {};
      const baseVisible = !tags.lod || tags.lod === closestAvailableLod(requested, levelsByPart.get(lodPartKey(object)));
      object.visible = baseVisible && requested !== 'lod2';
    }
    const visibleAuthoredHullLevel = closestAvailableLod(requested, authoredHullLevels);
    safetyCore.visible = requested === 'lod0' || !authoredHullLevels.has(visibleAuthoredHullLevel);
    if (root.userData.damageState === 'critical') {
      for (const secondary of bindings.secondary) secondary.visible = false;
    }
  };
}

function lodPartKey(object) {
  return object && object.userData && object.userData.spacefacePartUrl || (object && object.uuid) || 'unknown';
}

function normalizeRequestedLod(level) {
  if (level === 'lod1' || level === 'lod2') return level;
  return 'lod0';
}

function closestAvailableLod(requested, available) {
  if (!available || available.has(requested)) return requested;
  if (requested === 'lod2' && available.has('lod1')) return 'lod1';
  if (available.has('lod0')) return 'lod0';
  if (available.has('lod1')) return 'lod1';
  return 'lod2';
}

// -------------------------------------------------------------------------------------------------
// Scene-level instance pools. A ship owns transform proxies; pools own the draw calls. Removal of the
// stable ship root releases all of its slots immediately, so hot reload/rebuild cannot leave ghosts.
// -------------------------------------------------------------------------------------------------
function allocateInstance(scene, owner, proxy, geometry, material, label) {
  const state = sceneState(scene);
  const key = instancePoolKey(geometry, material);
  let pool = state.pools.get(key);
  if (!pool) {
    pool = { chunks: [], geometry, material, label, key };
    state.pools.set(key, pool);
  }
  let chunk = pool.chunks.find((candidate) => candidate.free.length || candidate.next < INSTANCE_CHUNK_SIZE);
  if (!chunk) {
    chunk = createInstanceChunk(scene, pool, pool.chunks.length);
    pool.chunks.push(chunk);
  }

  const index = chunk.free.length ? chunk.free.pop() : chunk.next++;
  const slot = {
    proxy,
    owner,
    index,
    released: false,
    lastSubmitted: false,
    matrixInitialized: false,
    matrixElements: new Float32Array(16),
  };
  chunk.slots.set(index, slot);
  chunk.mesh.count = Math.max(chunk.mesh.count, index + 1);
  chunk.mesh.setMatrixAt(index, ZERO_MATRIX);
  chunk.mesh.instanceMatrix.needsUpdate = true;

  const release = () => {
    if (slot.released) return;
    slot.released = true;
    slot.lastSubmitted = false;
    chunk.slots.delete(index);
    chunk.free.push(index);
    chunk.mesh.setMatrixAt(index, ZERO_MATRIX);
    while (chunk.mesh.count > 0 && !chunk.slots.has(chunk.mesh.count - 1)) chunk.mesh.count--;
    chunk.mesh.instanceMatrix.needsUpdate = true;
  };
  registerOwnerRelease(owner, release);
  return release;
}

function createInstanceChunk(scene, pool, ordinal) {
  const mesh = new THREE.InstancedMesh(pool.geometry, pool.material, INSTANCE_CHUNK_SIZE);
  mesh.name = `GLTFKit_InstancePool_${pool.label}_${ordinal}`;
  mesh.count = 0;
  mesh.frustumCulled = false; // world positions span the scene; source-geometry bounds are meaningless
  mesh.castShadow = !pool.material.transparent && pool.material.depthWrite !== false;
  mesh.receiveShadow = !pool.material.transparent;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.spacefaceInstancePool = true;
  mesh.userData.spacefaceInstancePoolKey = pool.key;
  mesh.userData.spacefaceInstancePoolLabel = pool.label;
  const chunk = { mesh, pool, slots: new Map(), free: [], next: 0 };
  scene.add(mesh);
  return chunk;
}

function syncSceneState(state, opts = {}) {
  const stats = resetPoolStats(state);
  if (!state.pools.size) return;
  const context = buildInstanceCullContext(state, opts);
  for (const pool of state.pools.values()) {
    const beforeSubmitted = stats.submittedInstanceSlots;
    stats.pools++;
    stats.chunks += pool.chunks.length;
    const poolSlots = pool.chunks.reduce((sum, chunk) => sum + chunk.slots.size, 0);
    stats.pooledInstanceSlots += poolSlots;
    if (pool.chunks.length === 1 && poolSlots > 0 && poolSlots <= 3) stats.tinyPools++;
    for (const chunk of pool.chunks) syncInstanceChunk(chunk, context, stats);
    if (stats.submittedInstanceSlots > beforeSubmitted) stats.visibleInstancePools++;
    else if (poolSlots > 0) stats.offscreenInstancePools++;
  }
  stats.avgPoolOccupancy = stats.pools > 0 ? stats.pooledInstanceSlots / stats.pools : 0;
}

function syncInstanceChunk(chunk, context, stats) {
  let dirty = false;
  let visibleMax = -1;
  for (const [index, slot] of chunk.slots) {
    if (slot.released) continue;
    stats.activeInstanceSlots++;
    if (!isVisibleToOwner(slot.proxy, slot.owner, context, stats)) {
      if (slot.lastSubmitted) {
        chunk.mesh.setMatrixAt(index, ZERO_MATRIX);
        slot.matrixInitialized = false;
        dirty = true;
      }
      slot.lastSubmitted = false;
    } else {
      if (setInstanceMatrixIfChanged(chunk.mesh, index, slot, slot.proxy.matrixWorld)) {
        stats.matrixUploads++;
        dirty = true;
      } else {
        stats.matrixReuses++;
      }
      if (index > visibleMax) visibleMax = index;
      stats.submittedInstanceSlots++;
      slot.lastSubmitted = true;
    }
  }
  const nextCount = visibleMax + 1;
  if (chunk.mesh.count !== nextCount) {
    chunk.mesh.count = nextCount;
    dirty = true;
  }
  chunk.mesh.visible = nextCount > 0;
  if (dirty) {
    stats.dirtyChunks++;
    chunk.mesh.instanceMatrix.needsUpdate = true;
  }
}

function isVisibleToOwner(object, owner, context, stats) {
  const ownerFrame = syncOwnerForInstanceFrame(owner, context);
  if (!ownerFrame.visible) {
    if (stats) stats.culledInstanceSlots++;
    return false;
  }
  for (let current = object; current; current = current.parent) {
    if (!current.visible) {
      if (stats) stats.hiddenInstanceSlots++;
      return false;
    }
    if (current === owner) return isOwnerInCullContext(owner, context, stats);
  }
  if (stats) stats.hiddenInstanceSlots++;
  return false;
}

function syncOwnerForInstanceFrame(owner, context) {
  const empty = { frame: 0, visible: false };
  if (!owner || !owner.parent || !context || !context.state) return empty;
  let cached = context.state.ownerVisibility.get(owner);
  if (cached && cached.frame === context.frame) return cached;

  owner.updateWorldMatrix(true, false);
  const visible = isOwnerInCullContext(owner, context);
  if (visible) owner.updateWorldMatrix(false, true);
  cached = { frame: context.frame, visible };
  context.state.ownerVisibility.set(owner, cached);
  return cached;
}

function setInstanceMatrixIfChanged(mesh, index, slot, matrix) {
  const elements = matrix && matrix.elements;
  if (!elements) return false;
  let changed = !slot.matrixInitialized;
  if (!changed) {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(slot.matrixElements[i] - elements[i]) > 0.00001) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return false;
  for (let i = 0; i < 16; i++) slot.matrixElements[i] = elements[i];
  slot.matrixInitialized = true;
  mesh.setMatrixAt(index, matrix);
  return true;
}

function sceneState(scene) {
  let state = sceneStates.get(scene);
  if (!state) {
    state = { pools: new Map(), stats: createPoolStats(), ownerVisibility: new WeakMap(), syncFrame: 0 };
    sceneStates.set(scene, state);
  }
  return state;
}

function instancePoolKey(geometry, material) {
  const geometryKey = geometry.userData && geometry.userData.spacefaceBatchKey || geometry.uuid;
  const materialKey = material.userData && material.userData.spacefaceBatchKey || material.uuid;
  return `${geometryKey}|${materialKey}`;
}

function createPoolStats() {
  return {
    pools: 0,
    chunks: 0,
    pooledInstanceSlots: 0,
    activeInstanceSlots: 0,
    submittedInstanceSlots: 0,
    visibleInstancePools: 0,
    offscreenInstancePools: 0,
    culledInstanceSlots: 0,
    hiddenInstanceSlots: 0,
    avgPoolOccupancy: 0,
    tinyPools: 0,
    dirtyChunks: 0,
    matrixUploads: 0,
    matrixReuses: 0,
  };
}

function resetPoolStats(state) {
  state.stats = createPoolStats();
  return state.stats;
}

function buildInstanceCullContext(state, opts) {
  state.syncFrame = (state.syncFrame || 0) + 1;
  const camera = opts && opts.camera;
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) {
    return { state, frame: state.syncFrame, camera: null, frustum: null, cameraPosition: null };
  }
  camera.updateMatrixWorld();
  if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
  CULL_PROJECTION.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  CULL_FRUSTUM.setFromProjectionMatrix(CULL_PROJECTION);
  return {
    state,
    frame: state.syncFrame,
    camera,
    frustum: CULL_FRUSTUM,
    cameraPosition: camera.getWorldPosition(CULL_CAMERA_POSITION),
  };
}

function isOwnerInCullContext(owner, context, stats) {
  if (!context || !context.frustum || !context.cameraPosition) return true;
  CULL_SPHERE.center.setFromMatrixPosition(owner.matrixWorld);
  CULL_SPHERE.radius = owner.userData && owner.userData.spacefaceCullRadius || INSTANCE_FRUSTUM_PAD;
  const dx = CULL_SPHERE.center.x - context.cameraPosition.x;
  const dy = CULL_SPHERE.center.y - context.cameraPosition.y;
  const dz = CULL_SPHERE.center.z - context.cameraPosition.z;
  const far = INSTANCE_FAR_CULL_RADIUS + CULL_SPHERE.radius;
  const visible = (dx * dx + dy * dy + dz * dz <= far * far) && context.frustum.intersectsSphere(CULL_SPHERE);
  if (!visible && stats) stats.culledInstanceSlots++;
  return visible;
}

function registerOwnerRelease(owner, release) {
  let state = ownerReleaseState.get(owner);
  if (!state) {
    state = { releases: new Set() };
    state.listener = () => {
      for (const fn of [...state.releases]) fn();
      state.releases.clear();
    };
    owner.addEventListener('removed', state.listener);
    ownerReleaseState.set(owner, state);
  }
  state.releases.add(release);
}

function releaseOwnerInstances(owner) {
  const state = ownerReleaseState.get(owner);
  if (!state) return;
  for (const fn of [...state.releases]) fn();
  state.releases.clear();
}

// -------------------------------------------------------------------------------------------------
// Material variants: immutable authored materials are shared even when their meshes must stay
// separate for sockets, LOD, transparent sorting, damage movement, or drive transforms. Only surfaces
// whose material uniforms are actually mutated at runtime receive ship-local clones.
// -------------------------------------------------------------------------------------------------
function sharedMaterialFor(base, tags, palette) {
  const role = tintRole(tags);
  const tint = tintHex(palette, role);
  const key = `${materialBatchSignature(base)}|${role}|${tint}`;
  let material = sharedMaterialVariants.get(key);
  if (!material) {
    material = tintMaterial(base.clone(), tint, role);
    material.name = authoredMaterialName(base, tags, role, tint, false);
    material.userData = { ...(material.userData || {}), spacefaceSharedAsset: true, spacefaceBatchKey: key };
    material.dispose = () => {};
    sharedMaterialVariants.set(key, material);
  }
  return material;
}

function dedicatedMaterialFor(base, tags, palette, cache, instanceKey) {
  if (!materialNeedsShipLocalMutation(tags)) return sharedMaterialFor(base, tags, palette);
  return mutableMaterialFor(base, tags, palette, cache, instanceKey);
}

function materialNeedsShipLocalMutation(tags = {}) {
  return tags.drive === 'plume' || tags.damageRole === 'navLight' || tags.damageRole === 'sensor';
}

function mutableMaterialFor(base, tags, palette, cache, instanceKey) {
  const role = tintRole(tags);
  const tint = tintHex(palette, role);
  const key = `${materialBatchSignature(base)}|${role}|${tint}|${materialMutationScope(tags, instanceKey)}`;
  let material = cache.get(key);
  if (!material) {
    material = tintMaterial(base.clone(), tint, role);
    material.name = authoredMaterialName(base, tags, role, tint, true);
    cache.set(key, material);
  }
  return material;
}

function materialMutationScope(tags = {}, instanceKey) {
  if (tags.drive === 'plume') return 'ship-drive-plumes';
  return instanceKey || 'ship-local';
}

function authoredMaterialName(base, tags, role, tint, mutable) {
  const family = authoredMaterialFamily(base, tags, role);
  const tintSuffix = role === 'none' ? 'native' : String(tint || '').replace('#', '') || 'native';
  return `SF_${mutable ? 'Mutable' : 'Shared'}_${family}_${role}_${tintSuffix}`;
}

function authoredMaterialFamily(base, tags = {}, role = 'hull') {
  if (tags.drive) return `drive_${tags.drive}`;
  if (tags.canopy) return 'canopy';
  if (tags.damageRole === 'navLight' || tags.damageRole === 'sensor') return 'signal';
  const source = String(base && base.name || '').toLowerCase();
  if (source.includes('glass') || source.includes('canopy')) return 'canopy';
  if (source.includes('mechanical') || source.includes('mech') || source.includes('rib') || source.includes('clamp')) return 'mechanical';
  if (source.includes('interior')) return 'interior';
  if (source.includes('energy') || source.includes('emit') || source.includes('glow') || source.includes('nav')) return 'signal';
  if (source.includes('accent')) return 'accent';
  if (source.includes('plume')) return 'drive_plume';
  if (base && (base.map || base.normalMap || base.aoMap || base.roughnessMap || base.metalnessMap)) return `${role}_textured`;
  return role || 'authored';
}

function tintMaterial(material, hex, role) {
  if (role === 'none') return material;
  const tint = new THREE.Color(hex);
  if (material.color) {
    material.color.multiply(tint);
    if (role === 'hull') {
      material.color.lerp(tint, 0.58);
      liftColorFloor(material.color, 0.34);
    }
  }
  if (role === 'hull') {
    if (Number.isFinite(material.metalness)) material.metalness = Math.min(material.metalness, 0.26);
    if (Number.isFinite(material.roughness)) material.roughness = Math.max(material.roughness, 0.58);
  }
  if (material.emissive && material.emissive.getHex() !== 0 && (role === 'accent' || role === 'thruster')) {
    material.emissive.multiply(tint);
  }
  if (role === 'hull' && material.emissive && material.emissive.getHex() === 0) {
    material.emissive.copy(tint).multiplyScalar(0.11);
    material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.42);
  }
  material.needsUpdate = true;
  return material;
}

function liftColorFloor(color, floor) {
  const min = Number(floor) || 0;
  color.r = Math.max(color.r, min);
  color.g = Math.max(color.g, min);
  color.b = Math.max(color.b, min);
}

function tintRole(tags) {
  if (tags.tint) return String(tags.tint).toLowerCase();
  if (tags.canopy) return 'none';
  if (tags.drive) return 'thruster';
  if (tags.damageRole === 'navLight' || tags.damageRole === 'sensor') return 'accent';
  return 'hull';
}

function tintHex(palette, role) {
  if (role === 'none') return '#ffffff';
  if (role === 'accent') return palette.accent;
  if (role === 'thruster') return palette.thruster;
  if (role === 'dark') return palette.dark;
  return palette.hull;
}

// -------------------------------------------------------------------------------------------------
// Procedural slot fallbacks. These are emergency continuity pieces, not substitutes for authored
// maps: once a conforming GLB appears at the canonical path the slot replaces itself without code.
// -------------------------------------------------------------------------------------------------
function fallbackMaterials(palette, seed) {
  const hull = kit.pbrHullMaterial({
    hull: palette.hull, accent: palette.accent, seed: seed & 0xffff,
    panelCount: 10, metalness: 0.18, roughness: 0.58,
  });
  const dark = kit.machineryMaterial(palette.dark, 0.48, 0.76);
  const accent = kit.emissiveMaterial(palette.accent, 2.6);
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.accent).multiplyScalar(0.18),
    roughness: 0.10,
    metalness: 0,
    transmission: 0.6,
    ior: 1.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    thickness: 0.06,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  return { hull, dark, accent, glass };
}

function buildSafetyCore(hull, materials, palette) {
  const mesh = kit.addMesh(hull, kit.loftXGeometry([
    { x: -0.78, halfY: 0.16, halfZ: 0.20 },
    { x: -0.42, halfY: 0.25, halfZ: 0.35 },
    { x: 0.18, halfY: 0.27, halfZ: 0.38 },
    { x: 0.62, halfY: 0.18, halfZ: 0.24 },
    { x: 0.86, halfY: 0.05, halfZ: 0.07 },
  ], 8), readabilityShellMaterial(materials.hull, palette), 'GLTFKit_Readability_PressureShell');
  mesh.scale.set(1.08, 1.04, 1.08);
  mesh.userData.spacefaceReadabilityCore = true;
  mesh.userData.spacefaceStaticBatch = true;
  mesh.userData.spacefacePartUrl = 'readability/pressure_shell';
  return mesh;
}

function readabilityShellMaterial(base, palette = {}) {
  const material = base && typeof base.clone === 'function'
    ? base.clone()
    : kit.pbrHullMaterial({
      hull: palette.hull || '#8a94a8',
      accent: palette.accent || '#7ee8ff',
      seed: 0x51f,
      panelCount: 8,
      metalness: 0.12,
      roughness: 0.66,
    });
  material.name = 'SF_Readability_PressureShell';
  if (material.color) {
    const hull = new THREE.Color(palette.hull || '#8a94a8');
    material.color.lerp(hull, 0.58);
    liftColorFloor(material.color, 0.66);
  }
  if ('metalness' in material) material.metalness = Math.min(Number(material.metalness) || 0, 0.16);
  if ('roughness' in material) material.roughness = Math.max(Number(material.roughness) || 0, 0.62);
  if (material.emissive) {
    material.emissive.copy(new THREE.Color(palette.accent || '#7ee8ff')).multiplyScalar(0.075);
    material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.32);
  }
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.needsUpdate = true;
  return material;
}

function buildFallbackCockpit(hull, materials, placement) {
  const mount = new THREE.Group();
  mount.name = 'GLTFKit_Fallback_Cockpit_Mount';
  applyPlacementTransform(mount, placement);
  hull.add(mount);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 10), materials.glass);
  canopy.name = 'GLTFKit_Fallback_Cockpit';
  canopy.scale.set(0.42, 0.20, 0.30);
  canopy.userData.keepSeparate = true;
  mount.add(canopy);
  return canopy;
}

function buildFallbackEngine(hull, placement, materials, palette, index) {
  const group = new THREE.Group();
  group.name = `GLTFKit_Fallback_Engine_${index}`;
  applyPlacementTransform(group, placement);
  hull.add(group);
  return kit.buildDrive(group, {
    name: `GLTFKit_Drive_${index}`,
    position: [0, 0, 0],
    radius: 0.12,
    length: 0.28,
    materials: { dark: materials.dark, accent: materials.accent },
    driveColor: palette.thruster,
    coreColor: '#ffffff',
    driveGlowOpacity: 0.55,
  });
}

function buildFallbackFin(hull, materials, placement) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.34, -0.04);
  shape.lineTo(0.26, -0.02);
  shape.lineTo(-0.08, 0.24);
  shape.lineTo(-0.34, 0.14);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -0.035);
  const fin = new THREE.Mesh(geometry, materials.hull);
  fin.name = `GLTFKit_Fallback_${placement.label || 'Fin'}`;
  applyPlacementTransform(fin, placement);
  hull.add(fin);
  return fin;
}

function buildFallbackNavLights(hull, materials, bindings) {
  const material = materials.accent.clone();
  const lights = new THREE.InstancedMesh(getFallbackNavLightGeometry(), material, 2);
  lights.name = 'GLTFKit_Nav_Lights';
  lights.setMatrixAt(0, FALLBACK_NAV_LIGHT_MAT.makeTranslation(0.25, 0.18, -0.38));
  lights.setMatrixAt(1, FALLBACK_NAV_LIGHT_MAT.makeTranslation(0.25, 0.18, 0.38));
  lights.instanceMatrix.needsUpdate = true;
  lights.castShadow = false;
  lights.receiveShadow = false;
  lights.userData.keepSeparate = true;
  lights.userData.spacefaceNoShadow = true;
  lights.userData.damageRole = 'navLight';
  lights.userData.spacefaceTags = { damageRole: 'navLight' };
  hull.add(lights);
  bindings.navLights.push(lights);
}

function getFallbackNavLightGeometry() {
  if (!fallbackNavLightGeometry) {
    fallbackNavLightGeometry = new THREE.SphereGeometry(0.025, 8, 6);
    fallbackNavLightGeometry.dispose = () => {};
  }
  return fallbackNavLightGeometry;
}

function ensureStandardSockets(hull) {
  const found = new Set();
  hull.traverse((object) => {
    if (object.userData && object.userData.spacefaceSocket) found.add(object.name);
  });
  const sockets = [
    ['SOCKET_Weapon_Front', [0.84, 0.0, 0], 'weapon', [1, 0, 0]],
    ['SOCKET_Mining_Front', [0.82, -0.08, 0], 'mining', [1, 0, 0]],
    ['SOCKET_Engine_Main', [-0.82, -0.04, 0], 'engine', [-1, 0, 0]],
    ['SOCKET_Trail_Main', [-0.88, -0.04, 0], 'vfx', [-1, 0, 0]],
    ['SOCKET_Utility_Dorsal', [0.0, 0.32, 0], 'utility', [0, 1, 0]],
    ['SOCKET_Cargo_Ventral', [-0.08, -0.30, 0], 'cargo', [0, -1, 0]],
    ['SOCKET_Camera_Focus', [0.08, 0.08, 0], 'camera', [1, 0, 0]],
  ];
  for (const [name, position, role, forward] of sockets) {
    if (!found.has(name)) kit.addSocket(hull, name, position, role, forward);
  }
}

function paletteFor(entity) {
  const faction = entity.factionId && FACTION_PALETTES[entity.factionId];
  if (faction) {
    return {
      hull: faction.hull || faction.primary,
      accent: faction.accent || faction.primary,
      thruster: faction.thruster || faction.emissive || faction.accent || faction.primary,
      dark: faction.secondary || '#111820',
    };
  }
  if (entity.team === 0) {
    const free = FACTION_PALETTES.faction_free;
    return { hull: free.hull, accent: free.accent, thruster: free.thruster, dark: free.secondary };
  }
  if (entity.team === 1) {
    return { hull: '#7a3540', accent: '#ff5470', thruster: '#ff7a3c', dark: '#241116' };
  }
  return { hull: '#6b7280', accent: '#b0b8c4', thruster: '#aebfd6', dark: '#171c24' };
}

function snapshotMounts(mounts) {
  const sort = (a, b) => {
    const left = String(a.userData.spacefaceMountKey || a.name);
    const right = String(b.userData.spacefaceMountKey || b.name);
    return left < right ? -1 : left > right ? 1 : 0;
  };
  return {
    cockpit: [...mounts.cockpit].sort(sort),
    engine: [...mounts.engine].sort(sort),
    fin: [...mounts.fin].sort(sort),
  };
}

function placementFromMount(mount, assemblyRoot, fallback) {
  if (!mount) return fallback;
  assemblyRoot.updateMatrixWorld(true);
  mount.updateWorldMatrix(true, false);
  const relative = new THREE.Matrix4().copy(assemblyRoot.matrixWorld).invert().multiply(mount.matrixWorld);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const mountScale = new THREE.Vector3();
  relative.decompose(position, quaternion, mountScale);
  const normalization = Number(mount.userData.spacefacePartNormalization) || 1;
  mountScale.divideScalar(normalization);
  if (![position.x, position.y, position.z, mountScale.x, mountScale.y, mountScale.z].every(Number.isFinite) ||
    [mountScale.x, mountScale.y, mountScale.z].some((value) => value <= 1e-6)) {
    return fallback;
  }
  return {
    ...fallback,
    position: position.toArray(),
    quaternion,
    mountScale: mountScale.toArray(),
    mountKey: mount.userData.spacefaceMountKey || mount.name,
  };
}

function applyPlacementTransform(object, placement) {
  if (placement && placement.position) object.position.fromArray(placement.position);
  if (placement && placement.quaternion) object.quaternion.copy(placement.quaternion);
  else if (placement && placement.rotation) object.rotation.fromArray(placement.rotation);
  if (placement && placement.mountScale) object.scale.fromArray(placement.mountScale);
}

function firstRenderable(root) {
  let visible = null;
  let any = null;
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    if (!any) any = object;
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    if (!visible && object.visible && materials.every((material) => !material || material.visible !== false)) visible = object;
  });
  return visible || any;
}

function disposeDetachedObject(root) {
  root.traverse((object) => {
    if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) if (material && typeof material.dispose === 'function') material.dispose();
  });
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
