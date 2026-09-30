// Bespoke visual overrides for hero assets plus the authored-asset boundary.
// Explicit authored identities fail closed. A load/build problem may leave an entity temporarily
// absent and diagnostic, but it must never publish a visually unrelated procedural body first.
import * as THREE from 'three';
import { buildKestrelHero } from './ships/kestrelHero.js';
import { buildConcordPatrol } from './ships/concordPatrol.js';
import { buildReaverPirate } from './ships/reaverPirate.js';
import { buildMeridianTrader } from './ships/meridianTrader.js';
import { buildDriftBarge } from './ships/driftBarge.js';
import { buildQuietRaider } from './ships/quietRaider.js';
import { buildVaelSniper } from './ships/vaelSniper.js';
import { loadAuthoredPart } from './assetLoader.js';
import { freezeStaticChildMatrices, freezeStaticTransformRoot } from './staticChildMatrices.js';
import { build47aScenarioProp } from './scenarioProps47a.js';
import {
  batchPackagedPropOpaqueMeshes,
  batchScenarioPropOpaqueMeshes,
} from './scenarioPropBatching.js';
import {
  GENERIC_TOW_PACKAGED_PROP,
  SCENARIO_47A_PACKAGED_PROPS,
} from '../data/scenarios/47aLiveScene.js';
import {
  admissionOwnerInactive,
  authoredReadmissionStatus,
  boundaryLiveEntity,
  buildAuthoredCargoCapsule,
  buildAuthoredPlaceProp,
  buildAuthoredStationArchetype,
  enqueueBoundaryUpgrade,
  markAuthoredBoundaryForReadmission,
  prepareAuthoredVisualPipelines,
  releaseBoundaryResidency,
  requiresProductionWholeShipForEntity,
  residencyOptionsForBoundary,
  waitForOpeningGraphPublicationRelease,
  wrapShipWithAuthoredParts,
} from './partsLibrary.js';
import { isReleaseAssetMode } from './releaseMode.js';
import { configureTransparentSinglePassSurfaces } from './transparentSinglePassPolicy.js';
import {
  applyIndustrialMaterialFamilies,
  resolveIndustrialAssetKey,
} from './industrialMaterialFamilies.js';
import {
  hasExplicitAuthoredGeologyPresentation,
  hasExplicitAuthoredPayloadPresentation,
  PRESENTATION_ADMISSION,
  setPresentationAdmission,
} from '../core/presentationAdmission.js';

const KESTREL_HERO_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME';

export function isPlayerKestrel(entity) {
  return !!entity && entity.type === 'ship' && entity.isPlayer === true
    && entity.data && entity.data.defId === 'ship_kestrel';
}

function requiresProductionWholeShip(entity) {
  // One required-body gate with the parts library. Traffic-role maps keep Helios civilians on
  // Lark/Span/Cradle; roster defs, the liner, smuggler/pirate, and the recovery tug stay complete.
  return requiresProductionWholeShipForEntity(entity);
}

function isWorldPlaceProp(entity) {
  if (!entity || !entity.data) return false;
  if (hasExplicitAuthoredGeologyPresentation(entity)) return true;
  if (entity.type !== 'fx') return false;
  return typeof entity.data.placeId === 'string' || typeof entity.data.landmarkGlb === 'string';
}

function hasStationArchetype(entity) {
  return !!entity && entity.type === 'station' && entity.data
    && typeof entity.data.archetypeGlb === 'string' && entity.data.archetypeGlb.length > 0;
}

export { isReleaseAssetMode };

function releaseAssetError(message, cause) {
  const error = new Error(message);
  if (cause) error.cause = cause;
  return error;
}

function assertReleaseHeroVisual(entity, visual, releaseMode) {
  if (!releaseMode || !isPlayerKestrel(entity)) return;
  if (visual && visual.userData && visual.userData.assetId === KESTREL_HERO_ASSET_ID) return;
  if (visual && visual.userData && visual.userData.authoredAdmissionSubstrate === true) return;
  throw releaseAssetError('[visualOverrides] release mode requires Kestrel hero asset; procedural fallback is forbidden');
}

function reportVisualWarning(options, message, error) {
  if (typeof options.onWarning === 'function') {
    options.onWarning(message, error);
    return;
  }
  if (error) console.warn(message, error);
  else console.warn(message);
}

function unavailableVisual(entity, reason, error) {
  const root = new THREE.Group();
  const kind = entity && entity.type ? entity.type : 'entity';
  root.name = `${kind}_AuthoredVisualUnavailable`;
  root.visible = false;
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'unavailable';
  root.userData.authoredVisualRoot = 'none-build-failed';
  root.userData.visualBuildFailed = true;
  root.userData.visualBuildFailureReason = reason;
  if (error && error.message) root.userData.visualBuildFailureMessage = error.message;
  root.userData.renderContract = {
    assetBoundary: 'fail-closed authored identity',
    gracefulFallback: false,
  };
  return root;
}

// PQ-190.00 — the style slice binds material families at the exact authored swap, never per frame.
//
// Ship, station and cargo publishers supply the admitted GLB URLs. Resolve those URLs rather
// than duplicating the parts library's ship/asset selection from entity definition IDs.
function settleIndustrialSurfacing(payload, options) {
  if (!payload) return;
  const root = payload.authoredRoot || payload.root || payload.boundary;
  if (!root) return;
  const assetKey = resolveIndustrialAssetKey({
    authoredParts: payload.authoredParts,
    entity: payload.entity,
    userData: payload.boundary && payload.boundary.userData,
  });
  if (!assetKey) return;
  try { applyIndustrialMaterialFamilies(root, assetKey); }
  catch (error) {
    reportVisualWarning(options, '[visualOverrides] industrial material family pass failed; authored response retained', error);
  }
}

/**
 * Resolving marker — the only drawable a pending authored ship ever shows. One shared geometry
 * and one shared material across every substrate: it must never pay the bloomScene compile
 * brick the authored-pending gate exists to avoid, so it uses the already-warm Standard family.
 * The shape is deliberately abstract (a dim translucent dart scaled to the entity radius) — it
 * says "a contact is resolving here" without impersonating any ship identity, which is the
 * contract the fail-closed authored boundary protects.
 */
const RESOLVING_MARKER_GEOMETRY = new THREE.OctahedronGeometry(1, 0);
RESOLVING_MARKER_GEOMETRY.userData.spacefaceSharedAsset = true;
const RESOLVING_MARKER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x39496b,
  emissive: 0x2b4a72,
  emissiveIntensity: 0.6,
  roughness: 0.9,
  metalness: 0.05,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
RESOLVING_MARKER_MATERIAL.userData.spacefaceSharedAsset = true;

// GFX-12: a pending authored ship shows its own lowest-detail resident body instead of the
// abstract marker whenever the catalog record is already resident (the normal cold-start case —
// the canonical library completes before control). Stand-in meshes share the record's geometry
// buffers outright and draw through this module-level cache of opaque MeshStandardMaterial keyed
// by the primitive's base/emissive colour — no maps, no vertex colours, no instancing — so the
// stand-in links no new program variant in bloomScene, same as the marker it replaces.
const STAND_IN_MATERIALS = new Map();
const STAND_IN_LOD_PREFERENCE = ['lod2', 'lod1', 'lod0'];
const WHOLE_SHIP_STAND_IN_TARGET_LENGTH = 1.72;
// A pending substrate retries its resident-record lookup at this cadence, not every frame —
// the lookup scans the renderer's resolved libraries and settled decode cache.
const STAND_IN_RETRY_MS = 200;

let resolvingMarkerFallbacks = 0;
// wrapShipWithAuthoredParts Object.assign()s the substrate's userData onto the boundary, so the
// pending flag exists on two nodes and every settle path can run twice. Settlement is keyed by
// the marker OBJECT — shared by both userData copies — which makes every release idempotent.
const countedFallbackMarkers = new WeakSet();

/**
 * Gauge: how many admission substrates are currently on the abstract octahedron. Raised when a
 * substrate cannot find a resident record at build, dropped when the pending retry lands the
 * ship's own stand-in. A settled cold New Game reads 0.
 */
export function resolvingMarkerFallbackCount() {
  return resolvingMarkerFallbacks;
}

function publishResolvingMarkerFallbacks() {
  const render = globalThis && globalThis.window && globalThis.window.SF
    && globalThis.window.SF.state && globalThis.window.SF.state.render;
  if (render) render.resolvingMarkerFallbacks = resolvingMarkerFallbacks;
}

function settleFallbackMarker(marker) {
  if (!marker || !countedFallbackMarkers.delete(marker)) return false;
  resolvingMarkerFallbacks--;
  publishResolvingMarkerFallbacks();
  return true;
}

function standInMaterialFor(primitiveMaterial) {
  const color = primitiveMaterial && primitiveMaterial.color
    ? primitiveMaterial.color.getHex() : 0x6a7688;
  const emissive = primitiveMaterial && primitiveMaterial.emissive
    ? primitiveMaterial.emissive.getHex() : 0;
  const key = `${color}|${emissive}`;
  let material = STAND_IN_MATERIALS.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissive ? 0.9 : 0,
      roughness: 0.9,
      metalness: 0.08,
      vertexColors: false,
    });
    material.userData.spacefaceSharedAsset = true;
    material.userData.authoredResolvingMarker = true;
    material.dispose = () => {};
    STAND_IN_MATERIALS.set(key, material);
  }
  return material;
}

/**
 * Coarsest detail tier the record carries: lod2 where authored, else the lowest level present.
 * Untagged primitives are always-visible in the composed body, so they ride every tier here too.
 */
function standInPrimitivesFor(record) {
  const primitives = record && Array.isArray(record.primitives) ? record.primitives : [];
  const tagged = new Set();
  for (const primitive of primitives) {
    const level = primitive.tags && primitive.tags.lod;
    if (level) tagged.add(level);
  }
  const level = STAND_IN_LOD_PREFERENCE.find((candidate) => tagged.has(candidate)) || null;
  return primitives.filter((primitive) => (
    !primitive.tags || !primitive.tags.lod || primitive.tags.lod === level
  ));
}

function lodStandInFor(entity, record) {
  const primitives = standInPrimitivesFor(record);
  const boundsSize = record && record.bounds && record.bounds.size;
  const sourceLength = Array.isArray(boundsSize) ? Number(boundsSize[0]) : 0;
  if (!primitives.length || !(sourceLength > 0)) return null;
  const group = new THREE.Group();
  group.name = 'AuthoredResolvingStandIn';
  // Identical normalization to the composed body: the hull part mounts at target length 1.72 and
  // the hull group scales by entity.radius — the stand-in applies both in one transform.
  const entityScale = Number.isFinite(entity && entity.radius) ? entity.radius : 1;
  group.scale.setScalar((WHOLE_SHIP_STAND_IN_TARGET_LENGTH * entityScale) / sourceLength);
  for (const primitive of primitives) {
    if (!primitive.geometry) continue;
    // The substrate teardown path respects this flag; residency eviction disposes through its own
    // resource handles, not detached-object traversal, so the record's buffers stay safe.
    primitive.geometry.userData = primitive.geometry.userData || {};
    primitive.geometry.userData.spacefaceSharedAsset = true;
    const mesh = new THREE.Mesh(primitive.geometry, standInMaterialFor(primitive.material));
    mesh.name = `StandIn_${primitive.name || 'Primitive'}`;
    if (primitive.matrix) primitive.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.spacefaceSharedAsset = true;
    mesh.userData.authoredResolvingMarker = true;
    group.add(mesh);
  }
  if (!group.children.length) return null;
  group.userData.spacefaceSharedAsset = true;
  group.userData.authoredResolvingMarker = true;
  return group;
}

function resolvingMarkerFor(entity) {
  const marker = new THREE.Mesh(RESOLVING_MARKER_GEOMETRY, RESOLVING_MARKER_MATERIAL);
  marker.name = 'AuthoredResolvingMarker';
  const r = Math.max(4, Number.isFinite(entity && entity.radius) ? entity.radius : 6);
  marker.scale.set(r * 1.7, r * 0.3, r * 0.85);
  marker.userData.spacefaceSharedAsset = true;
  marker.userData.authoredResolvingMarker = true;
  return marker;
}

/**
 * Late-library retry for a substrate that fell back because no record was resident at build time.
 * Called from the renderer's per-frame marker sync while the boundary stays pending; resolves the
 * resident record again, swaps the octahedron for the ship's own stand-in, and drops the fallback
 * count back out — the published counter is a gauge of substrates still on the abstract marker.
 */
export function upgradeAdmissionStandIn(boundary, resolveRecord) {
  const boundaryData = boundary && boundary.userData;
  if (!boundaryData || boundaryData.admissionStandInPending !== true) return false;
  const marker = boundaryData.resolvingMarker;
  const substrate = marker && marker.parent;
  if (!marker || !substrate || !substrate.userData || !substrate.userData.authoredAdmissionSubstrate) {
    delete boundaryData.admissionStandInPending;
    return false;
  }
  // The resolver walks every resolved library plus the settled decode cache — throttle the retry
  // so N pending substrates do not each run that scan per frame.
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  if (boundaryData.admissionStandInRetryAt > now) return false;
  boundaryData.admissionStandInRetryAt = now + STAND_IN_RETRY_MS;
  const entity = substrate.userData.admissionEntity || boundaryData.admissionEntity;
  const resolver = typeof resolveRecord === 'function'
    ? resolveRecord
    : substrate.userData.admissionStandInResolver;
  let record = null;
  try { record = typeof resolver === 'function' ? resolver(entity) : null; }
  catch { record = null; }
  const standIn = record ? lodStandInFor(entity, record) : null;
  if (!standIn) return false; // still nothing resident — keep waiting while pending
  substrate.remove(marker);
  substrate.add(standIn);
  substrate.userData.resolvingMarker = standIn;
  substrate.userData.admissionStandInPending = false;
  substrate.userData.authoredAdmissionTemporaryDrawables = Math.max(1, standIn.children.length);
  boundaryData.resolvingMarker = standIn;
  boundaryData.admissionStandInPending = false;
  boundaryData.authoredAdmissionTemporaryDrawables = substrate.userData.authoredAdmissionTemporaryDrawables;
  settleFallbackMarker(marker);
  return true;
}

/**
 * The pending window ended while the substrate was still on the octahedron — the authored root
 * committed, or the admission went terminal. Release the fallback gauge; the marker itself leaves
 * with the detached substrate.
 */
export function releaseAdmissionStandInFallback(boundary) {
  const boundaryData = boundary && boundary.userData;
  if (!boundaryData || boundaryData.admissionStandInPending !== true) return false;
  boundaryData.admissionStandInPending = false;
  const marker = boundaryData.resolvingMarker;
  const substrate = marker && marker.parent;
  if (substrate && substrate.userData) {
    // Clear the substrate's own flag so the detach-time release hook cannot double-count.
    substrate.userData.admissionStandInPending = false;
  }
  settleFallbackMarker(marker);
  return true;
}

function directAuthoredAdmissionSubstrate(entity, standInRecord = null, resolveRecord = null) {
  const root = new THREE.Group();
  root.name = `${entity && entity.data && entity.data.defId || 'ship'}_DirectAuthoredAdmission`;
  root.visible = false;
  root.userData.kind = 'ship';
  root.userData.authoredAdmissionSubstrate = true;
  const standIn = standInRecord ? lodStandInFor(entity, standInRecord) : null;
  let marker;
  if (standIn) {
    marker = standIn;
  } else {
    marker = resolvingMarkerFor(entity);
    countedFallbackMarkers.add(marker);
    resolvingMarkerFallbacks++;
    publishResolvingMarkerFallbacks();
    if (standInRecord) {
      // A resident record that cannot build a stand-in (no primitives/bounds) never becomes
      // usable — do not retry it every frame.
      root.userData.resolvingMarkerFallbackReason = 'stand-in-record-unusable';
    } else {
      // Built before the canonical library resolved: retry while pending so a cold boot still
      // converges on the ship's own low-detail body instead of sitting on the octahedron.
      root.userData.resolvingMarkerFallbackReason = 'no-resident-record';
      root.userData.admissionStandInPending = true;
    }
    root.userData.admissionEntity = entity;
    root.userData.admissionStandInResolver = resolveRecord;
    // Detach paths that never see a terminal marker sync (despawn mid-pending, teardown) still
    // release the gauge — disposeDetachedObject invokes this hook on the substrate root.
    root.userData.admissionStandInRelease = () => {
      if (root.userData.admissionStandInPending !== true) return;
      root.userData.admissionStandInPending = false;
      settleFallbackMarker(root.userData.resolvingMarker);
    };
  }
  root.add(marker);
  root.userData.resolvingMarker = marker;
  root.userData.authoredResolvingMarker = true;
  root.userData.authoredAdmissionTemporaryDrawables = Math.max(1, marker.isMesh ? 1 : marker.children.length);
  root.userData.shipConstruction = 'authored-direct';
  root.userData.assetId = 'DIRECT_AUTHORED_ADMISSION';
  root.userData.renderContract = {
    assetBoundary: 'resident authored identity admission substrate',
    gracefulFallback: false,
    temporaryDrawables: 1,
  };
  return root;
}

// Faction bespoke ships intercept by enemy type id (data.lootTableId, set in combat.js). Each maps a
// spec §8 faction grammar to its most thematically-appropriate NPC host visible in the first sector.
const FACTION_BUILDERS = {
  patrol_lawman: { build: buildConcordPatrol, label: 'Concord patrol' },     // §8.2 authority
  reaver_pirate: { build: buildReaverPirate, label: 'Reaver pirate' },       // §8.5 pirate
  mule_trader: { build: buildMeridianTrader, label: 'Meridian trader' },     // §8.3 corporate
  bruiser_brawler: { build: buildDriftBarge, label: 'Drift barge' },         // §8.4 blue-collar
  corsair_raider: { build: buildQuietRaider, label: 'Quiet raider' },        // §8.6 smuggler
  lancer_sniper: { build: buildVaelSniper, label: 'Vael sniper' },           // §8.7 non-human
};

const SCENARIO_47A_SHIP_BUILDERS = {
  enemy_reaver_interceptor: { build: buildReaverPirate, label: '47-A Reaver interceptor' },
  enemy_reaver_skirmisher: { build: buildReaverPirate, label: '47-A Reaver skirmisher' },
  enemy_reaver_tug: { build: buildReaverPirate, label: '47-A Reaver tug' },
  'asset.slice.meridian_recovery_tug': { build: buildConcordPatrol, label: '47-A Concord recovery tug' },
};

const RELEASE_PART_ROOT = 'assets/ships/release/parts/';
const PACKAGED_PRIMITIVE_MATRIX = new THREE.Matrix4();
const PACKAGED_FIT_CENTER = new THREE.Vector3();
const PACKAGED_FIT_SIZE = new THREE.Vector3();
const SCENARIO_PROP_KEEP_VISIBLE = new Set(['HandoffBeacon_Zone_Disc']);

function packagedPartUrl(relativeFile) {
  return `${RELEASE_PART_ROOT}${String(relativeFile || '').replace(/^[\\/]+/, '')}`;
}

function slotForPackagedFile(file) {
  return String(file || '').replace(/\\/g, '/').startsWith('pods/') ? 'pod' : 'place';
}

function packagedPropSpec(entity) {
  if (!entity || entity.alive === false) return null;
  const data = entity.data || {};
  if (data.authoredPayloadAssetId) return null;
  if (data.precompileProbe === true) return null;
  if (typeof data.packagedPropFile === 'string' && data.packagedPropFile) {
    return {
      file: data.packagedPropFile.replace(/^[\\/]+/, ''),
      slot: data.packagedPropSlot || slotForPackagedFile(data.packagedPropFile),
      radius: data.packagedPropRadius,
      hideImmediately: true,
    };
  }
  const mapped = SCENARIO_47A_PACKAGED_PROPS[data.assetRef];
  if (mapped) {
    return {
      file: mapped.file,
      slot: mapped.slot || slotForPackagedFile(mapped.file),
      radius: mapped.visualRadius,
      hideImmediately: true,
    };
  }
  // Opening-rescue actors share the finished civilian rescue hardware. Keep the simulation's
  // cargo identity and 60 WU arrival zone; neither is an appropriate model scale.
  // An explicit authored package above remains authoritative.
  if (entity.type === 'payload' && (data.distressBeacon || data.rescuePriority)) {
    return { file: 'places/place_47a_rescue_capsule.glb', slot: 'place',
      radius: Math.min(12, Math.max(4, Number(entity.radius) || 6)), hideImmediately: true };
  }
  if (entity.type === 'beacon' && data.rescueExit) {
    return { file: 'places/place_lane_beacon.glb', slot: 'place', radius: 14, hideImmediately: true };
  }
  if (entity.type === 'payload' && !data.distressBeacon && !data.rescuePriority) {
    return {
      file: GENERIC_TOW_PACKAGED_PROP.file,
      slot: GENERIC_TOW_PACKAGED_PROP.slot,
      hideImmediately: false,
    };
  }
  return null;
}

function isLod0Primitive(primitive) {
  const lod = primitive && primitive.tags && primitive.tags.lod;
  if (lod && String(lod).toLowerCase() !== 'lod0') return false;
  const name = String(primitive && primitive.name || '');
  if (/LOD[12][_-]/i.test(name)) return false;
  return true;
}

function instantiatePackagedPrimitives(record, parent) {
  for (const primitive of record && record.primitives || []) {
    if (!primitive || !primitive.geometry || !primitive.material) continue;
    if (!isLod0Primitive(primitive)) continue;
    const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
    mesh.name = primitive.name || 'PackagedPrimitive';
    if (primitive.matrix && primitive.matrix.isMatrix4) PACKAGED_PRIMITIVE_MATRIX.copy(primitive.matrix);
    else if (Array.isArray(primitive.matrix) && primitive.matrix.length === 16) {
      PACKAGED_PRIMITIVE_MATRIX.fromArray(primitive.matrix);
    } else PACKAGED_PRIMITIVE_MATRIX.identity();
    mesh.applyMatrix4(PACKAGED_PRIMITIVE_MATRIX);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function fitPackagedGroup(group, targetRadius) {
  if (!group) return;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  box.getCenter(PACKAGED_FIT_CENTER);
  box.getSize(PACKAGED_FIT_SIZE);
  const envelope = Math.max(PACKAGED_FIT_SIZE.x, PACKAGED_FIT_SIZE.y, PACKAGED_FIT_SIZE.z, 1e-6);
  group.position.sub(PACKAGED_FIT_CENTER);
  const radius = Number(targetRadius);
  if (Number.isFinite(radius) && radius > 0) group.scale.setScalar((radius * 2) / envelope);
}

function isPackagedBodyDescendant(object, root) {
  let current = object;
  while (current && current !== root) {
    if (current.userData && current.userData.scenarioPackagedBody) return true;
    current = current.parent;
  }
  return false;
}

function hideProceduralPropDrawables(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((object) => {
    if (object === root) return;
    if (object.userData && object.userData.spacefaceSocket) return;
    if (isPackagedBodyDescendant(object, root)) return;
    if (SCENARIO_PROP_KEEP_VISIBLE.has(object.name)) return;
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    object.visible = false;
    object.userData = object.userData || {};
    object.userData.authoredReadableFallbackLayer = true;
  });
}

function packagedFitRadius(entity, spec) {
  const data = entity && entity.data || {};
  const stamped = Number(data.packagedPropRadius);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  const mapped = Number(spec && spec.radius);
  if (Number.isFinite(mapped) && mapped > 0) return mapped;
  return Number(entity && entity.radius) || 1;
}

function attachPackagedScenarioProp(root, entity, options = {}) {
  if (!root || !root.userData) return root;
  if (root.userData.authoredPackageUrl) return root;
  if (root.userData.visualBuildFailed || root.userData.authoredAdmissionSubstrate) return root;
  const spec = packagedPropSpec(entity);
  if (!spec || !spec.file) return root;
  const url = packagedPartUrl(spec.file);
  const hideImmediately = spec.hideImmediately !== false;
  if (hideImmediately) hideProceduralPropDrawables(root);
  root.userData.authoredPackageUrl = url;
  root.userData.authoredPackageSlot = spec.slot || slotForPackagedFile(spec.file);
  if (hideImmediately) {
    root.userData.authoredAssetState = 'awaiting-authored-admission';
    root.userData.authoredVisualRoot = 'none-pending-admission';
  }
  root.userData.renderContract = {
    ...(root.userData.renderContract || {}),
    assetBoundary: 'packaged 47-A / TOW body',
    gracefulFallback: hideImmediately !== true,
  };
  const start = (renderer, scene, requestOptions = {}) => {
    const state = root.userData.authoredAssetState;
    const existing = root.userData.authoredUpgradePromise;
    if (existing && !authoredReadmissionStatus(state)) return existing;
    if (existing) delete root.userData.authoredUpgradePromise;
    if (!renderer || !scene) return null;
    if (state === 'authored') return Promise.resolve(true);
    root.userData.authoredAssetState = 'loading';
    const liveEntity = boundaryLiveEntity(root, entity);
    const loadPart = typeof requestOptions.loadAuthoredPart === 'function'
      ? requestOptions.loadAuthoredPart
      : loadAuthoredPart;
    const admissionOptions = () => ({
      ...residencyOptionsForBoundary(liveEntity, root, renderer),
      ...requestOptions,
    });
    // Same admission barrier as ship/capsule boundaries, without the serial upgrade queue: the
    // packaged body is compiled and its buffers uploaded while still detached, and publication
    // waits on the opening-graph release. Adding the group straight to the live scene left its
    // materials to link inside the first bloomScene draw (the wrk_glass_shattered / lnb_* brick);
    // routing through the queue instead delayed mounts into measured flight windows.
    const completion = loadPart(url, {
      renderer,
      slot: spec.slot || slotForPackagedFile(spec.file),
      optional: true,
      ...requestOptions,
    }).then(async (record) => {
      if (!record || !root.parent) {
        root.userData.authoredAssetState = record ? 'orphaned-before-swap' : 'unavailable';
        return false;
      }
      const packaged = new THREE.Group();
      packaged.name = `${root.userData.kind || entity.type || 'prop'}_PackagedBody`;
      packaged.userData.scenarioPackagedBody = true;
      instantiatePackagedPrimitives(record, packaged);
      if (!packaged.children.length) {
        root.userData.authoredAssetState = 'unavailable';
        return false;
      }
      fitPackagedGroup(packaged, packagedFitRadius(entity, spec));
      batchPackagedPropOpaqueMeshes(packaged);
      freezeStaticChildMatrices(packaged);
      freezeStaticTransformRoot(packaged);
      root.userData.authoredAssetState = 'compiling-pipelines';
      try {
        await prepareAuthoredVisualPipelines(packaged, admissionOptions());
      } catch (error) {
        releaseBoundaryResidency(renderer, root, 'packaged-prop-pipeline-failed');
        // Same lifecycle abort partsLibrary classifies: an owner that shelves mid-admission
        // has no visual to publish — a breadcrumb, not a composition defect.
        const causes = error && Array.isArray(error.errors) && error.errors.length
          ? error.errors
          : [error];
        const ownerInactive = admissionOwnerInactive(admissionOptions(), liveEntity, error)
          || causes.every((cause) => cause && /owner became inactive/i.test(String(cause && (cause.message || cause))));
        if (ownerInactive) {
          if (root.parent) {
            markAuthoredBoundaryForReadmission(root, 'packaged-prop-owner-inactive');
          } else {
            root.userData.authoredAssetState = 'unavailable';
          }
          console.info('[visualOverrides] packaged 47-A / TOW admission aborted; owner left before publish');
        } else {
          root.userData.authoredAssetState = 'unavailable';
          reportVisualWarning(options, '[visualOverrides] packaged 47-A / TOW pipeline admission failed', error);
        }
        return false;
      }
      if (!root.parent) {
        releaseBoundaryResidency(renderer, root, 'packaged-prop-orphaned-after-compile');
        root.userData.authoredAssetState = 'orphaned-before-swap';
        return false;
      }
      const publicationWait = waitForOpeningGraphPublicationRelease();
      if (publicationWait) await publicationWait;
      if (!root.parent) {
        releaseBoundaryResidency(renderer, root, 'packaged-prop-orphaned-before-publication');
        root.userData.authoredAssetState = 'orphaned-before-swap';
        return false;
      }
      hideProceduralPropDrawables(root);
      root.add(packaged);
      // The detached prepare compiled/touched `packaged`; attached-state keys can still differ
      // (owner chain, final visibility). One exact-target re-touch here pays any residual link
      // inside this continuation instead of the first presented bloom pass.
      const touch = admissionOptions().touchAuthoredExactTarget;
      if (typeof touch === 'function') {
        try { touch(packaged); } catch (error) { reportVisualWarning(options, '[visualOverrides] packaged publish touch failed', error); }
      }
      root.userData.hull = packaged;
      root.userData.authoredAssetState = 'authored';
      root.userData.authoredVisualRoot = record.assetId || url;
      if (spec.file === GENERIC_TOW_PACKAGED_PROP.file) {
        root.userData.authoredPayloadAssetId = 'pod_cargo_container';
      }
      settleIndustrialSurfacing({
        authoredRoot: packaged,
        entity,
        boundary: root,
      }, options);
      return true;
    }).catch((error) => {
      if (root.parent && admissionOwnerInactive(null, entity, error)) {
        markAuthoredBoundaryForReadmission(root, 'packaged-prop-owner-inactive');
      } else {
        root.userData.authoredAssetState = 'unavailable';
        reportVisualWarning(options, '[visualOverrides] packaged 47-A / TOW body failed closed', error);
      }
      return false;
    });
    root.userData.authoredUpgradePromise = completion;
    return completion;
  };
  root.userData.requestAuthoredUpgrade = start;
  return root;
}

/**
 * Install the hero-asset registry and authored-part boundary on a live visual factory.
 * Mutating the existing factory object is intentional: renderer event closures, rebuild paths,
 * and the dev ship-preview harness all retain a reference to that same object.
 */
export function installVisualOverrides(factory, options = {}) {
  if (!factory || typeof factory.build !== 'function' || factory.__spacefaceOverridesInstalled) return factory;

  const fallbackBuild = factory.build.bind(factory);
  const releaseMode = isReleaseAssetMode(options);
  const authoredShips = options.authoredShips !== false;
  const authoredWholeShipsOnly = options.authoredWholeShipsOnly === true;
  const directAuthoredMount = options.directAuthoredMount === true;
  const kestrelBuilder = typeof options.kestrelBuilder === 'function' ? options.kestrelBuilder : buildKestrelHero;
  const authoredPlaceBuilder = typeof options.authoredPlaceBuilder === 'function'
    ? options.authoredPlaceBuilder
    : buildAuthoredPlaceProp;
  const authoredCargoCapsuleBuilder = typeof options.authoredCargoCapsuleBuilder === 'function'
    ? options.authoredCargoCapsuleBuilder
    : buildAuthoredCargoCapsule;
  const authoredStationBuilder = typeof options.authoredStationBuilder === 'function'
    ? options.authoredStationBuilder
    : buildAuthoredStationArchetype;
  // GFX-12: optional synchronous resident-record lookup — the live renderer injects the canonical
  // library resolver; preview/bench factories without one keep the abstract marker fallback.
  const admissionStandInRecord = typeof options.admissionStandInRecord === 'function'
    ? options.admissionStandInRecord
    : () => null;
  factory.build = (entity) => {
    let visual = null;
    const requiredWholeShip = requiresProductionWholeShip(entity);
    const directShip = directAuthoredMount
      && authoredShips
      && entity && entity.type === 'ship'
      && !(entity.data && entity.data.precompileProbe === true)
      && !(authoredWholeShipsOnly && !requiredWholeShip);
    const authoredCargoCapsule = hasExplicitAuthoredPayloadPresentation(entity);
    const scenarioProp = directShip || isWorldPlaceProp(entity) || authoredCargoCapsule
      ? null
      : build47aScenarioProp(entity);
    if (directShip) {
      // The production catalog is resident before control. The live route therefore needs only a
      // zero-draw ownership boundary while the exact GLB composition is committed; constructing a
      // complete bespoke/procedural ship here would allocate and dispose an object graph that is
      // intentionally never shown.
      let standInRecord = null;
      try { standInRecord = admissionStandInRecord(entity); }
      catch (error) { reportVisualWarning(options, '[visualOverrides] admission stand-in lookup failed', error); }
      visual = directAuthoredAdmissionSubstrate(entity, standInRecord, admissionStandInRecord);
    } else if (isWorldPlaceProp(entity)) {
      const geologyFallback = hasExplicitAuthoredGeologyPresentation(entity)
        ? fallbackBuild(entity)
        : null;
      try { visual = authoredPlaceBuilder(entity, { releaseMode, fallbackRoot: geologyFallback }); }
      catch (error) {
        if (geologyFallback) {
          visual = settleSameSemanticGeologyBuildFallback(geologyFallback, entity, error);
          reportVisualWarning(options, '[visualOverrides] authored geology boundary failed; retaining procedural asteroid', error);
        } else {
          reportVisualWarning(options, '[visualOverrides] authored place prop failed closed', error);
          visual = unavailableVisual(entity, 'authored-place-build-failed', error);
        }
      }
      if (!visual && geologyFallback) visual = settleSameSemanticGeologyBuildFallback(geologyFallback, entity);
    } else if (hasStationArchetype(entity)) {
      try {
        visual = authoredStationBuilder(entity, {
          releaseMode,
          onSwap: (payload) => settleIndustrialSurfacing(payload, options),
        });
      }
      catch (error) {
        reportVisualWarning(options, '[visualOverrides] authored station archetype failed closed', error);
        visual = unavailableVisual(entity, 'authored-station-build-failed', error);
      }
    } else if (authoredCargoCapsule) {
      const payloadSubstrate = fallbackBuild(entity);
      try {
        visual = authoredCargoCapsuleBuilder(entity, {
          releaseMode,
          fallbackRoot: payloadSubstrate,
          onSwap: (payload) => settleIndustrialSurfacing(payload, options),
        });
      } catch (error) {
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
        reportVisualWarning(options, '[visualOverrides] authored cargo capsule failed closed', error);
        visual = unavailableVisual(entity, 'authored-cargo-capsule-build-failed', error);
      }
      if (!visual) {
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
        visual = unavailableVisual(entity, 'authored-cargo-capsule-build-unavailable');
      }
    } else if (scenarioProp) {
      visual = batchScenarioPropOpaqueMeshes(scenarioProp);
    } else if (isPlayerKestrel(entity)) {
      try { visual = kestrelBuilder(entity); }
      catch (error) {
        if (releaseMode) {
          throw releaseAssetError('[visualOverrides] release mode requires Kestrel hero asset; hero build failed', error);
        }
        reportVisualWarning(options, '[visualOverrides] Kestrel hero build failed closed', error);
        visual = unavailableVisual(entity, 'kestrel-hero-build-failed', error);
      }
      assertReleaseHeroVisual(entity, visual, releaseMode);
    } else if (entity && entity.type === 'ship' && entity.data) {
      // Faction bespoke ships (spec §8.2–§8.7, Phase 3 §20). Each is failure-isolated: any throw in
      // the bespoke builder falls back to the procedural factory, so a broken hero never blanks an NPC.
      const entry = SCENARIO_47A_SHIP_BUILDERS[entity.data.assetRef] || FACTION_BUILDERS[entity.data.lootTableId];
      if (entry) {
        try { visual = entry.build(entity); }
        catch (error) {
          reportVisualWarning(options, `[visualOverrides] ${entry.label} build failed closed`, error);
          visual = unavailableVisual(entity, 'bespoke-ship-build-failed', error);
        }
      }
    }

    if (!visual) visual = fallbackBuild(entity);
    visual = attachPackagedScenarioProp(visual, entity, options);
    assertReleaseHeroVisual(entity, visual, releaseMode);
    if (!visual || !entity || entity.type !== 'ship') return visual;
    configureTransparentSinglePassSurfaces(visual);
    if (!authoredShips) return visual;

    // Inspection surfaces must not replace a readable catalog ship with the generic modular kit.
    // That assembly is useful as a flight fallback, but it is not a validated complete body and its
    // asynchronous hot-swap creates the visible "clay ship -> different ship" discontinuity. Only
    // production whole-ship records may replace the object a player is directly manipulating.
    if (authoredWholeShipsOnly && !requiredWholeShip) {
      visual.userData.authoredAssetState = 'procedural-settled';
      return visual;
    }

    // The wrapper is synchronous and fail-closed. Live direct mounts carry no renderables; preview
    // modes may still provide a hidden bespoke/procedural substrate for isolated inspection tools.
    try {
      return wrapShipWithAuthoredParts(entity, visual, {
        releaseMode,
        libraryScope: options.authoredLibraryScope,
        bootstrapPlan: options.authoredBootstrapPlan,
        // The authored boundary is opt-in: only player hulls with a production whole-ship mapping
        // may bypass modular assembly. Keep the Kestrel boot rule intact while allowing a later
        // player switch to the production Wasp to select its complete body on undock and Continue.
        requiredWholeShip,
        onSwap: (payload) => {
          configureTransparentSinglePassSurfaces(payload && (payload.authoredRoot || payload.boundary));
          settleIndustrialSurfacing(payload, options);
          if (typeof options.onAuthoredAssetSwap === 'function') options.onAuthoredAssetSwap(payload);
        },
      });
    }
    catch (error) {
      reportVisualWarning(options, '[visualOverrides] authored-asset boundary failed; using selected ship visual', error);
      return visual;
    }
  };

  Object.defineProperty(factory, '__spacefaceOverridesInstalled', {
    value: true, enumerable: false, configurable: false,
  });
  return factory;
}

function settleSameSemanticGeologyBuildFallback(root, entity, error = null) {
  root.visible = true;
  root.userData = root.userData || {};
  root.userData.authoredReadableFallbackLayer = true;
  root.userData.authoredAssetState = 'same-semantic-fallback';
  root.userData.authoredVisualRoot = 'procedural-geology-fallback';
  root.userData.authoredReadableFallbackRetained = true;
  root.userData.renderContract = {
    ...(root.userData.renderContract || {}),
    assetBoundary: 'same-semantic procedural geology fallback',
    gracefulFallback: true,
  };
  if (error?.message) root.userData.authoredFallbackMessage = error.message;
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
  return root;
}
