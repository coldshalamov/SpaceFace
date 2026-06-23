// GLTFKit: authored ship-part composition over the synchronous procedural visual boundary.
//
// The renderer must receive an Object3D immediately. We therefore return a stable boundary root with
// the existing procedural/bespoke ship mounted inside it, then hot-swap only the payload after the
// first real render exposes WebGLRenderer + Scene. Entity identity, contact shadows, banking, sockets,
// damage and LOD stay on the stable root for the entire lifetime of the entity.
import * as THREE from 'three';
import { FACTION_PALETTES } from '../data/palettes.js';
import { loadAuthoredPart } from './assetLoader.js';
import { isReleaseAssetMode } from './releaseMode.js';
import * as kit from './ships/shipKit.js';

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';
const INSTANCE_CHUNK_SIZE = 64;
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const sceneStates = new WeakMap();
const libraryByRenderer = new WeakMap();
const sharedMaterialVariants = new Map();
const ownerReleaseState = new WeakMap();

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
  }
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
      'hulls/hull_gunship.glb',
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
    ]),
    fin: Object.freeze([
      'fins/fin_wedge.glb',
      'fins/fin_radiator_grid.glb',
      'fins/fin_swept_smuggler.glb',
      'fins/fin_crystalline.glb',
    ]),
  }),
  assembly: Object.freeze({
    coordinateSystem: '+X forward, +Y up, +Z starboard; metres',
    sharedOpaquePrimitives: 'scene-level InstancedMesh pools',
    mutableHooks: 'per-ship meshes sharing immutable geometry/textures',
    authoredMounts: 'MOUNT_COCKPIT / MOUNT_ENGINE_* / MOUNT_FIN_* on hull parts',
    missingPart: 'procedural slot fallback; never blank an entity',
  }),
});

// Deterministic ship-definition → hull-class selection. The hull is the silhouette-defining slot,
// so it must match the ship's authored role rather than being chosen by the generic seed-based hash.
// Each hull file is keyed to the ship defId (src/data/ships.js) whose role it was modelled for; ships
// outside this map fall back to the seed-based pick across all seven hulls. Roles follow the genius's
// authoring pass: starter/multirole→starter, fighter→fighter, mining/mining_barge→miner,
// freighter/heavy_hauler→freighter, interceptor/explorer→interceptor, corvette→corvette,
// gunship/battlecruiser/flagship→gunship.
const HULL_FILE_BY_DEF_ID = Object.freeze({
  ship_kestrel: 'hulls/hull_starter.glb',
  ship_drifter: 'hulls/hull_starter.glb',
  ship_wasp: 'hulls/hull_fighter.glb',
  ship_pelican: 'hulls/hull_miner.glb',
  ship_ironback: 'hulls/hull_miner.glb',
  ship_mule: 'hulls/hull_freighter.glb',
  ship_atlas: 'hulls/hull_freighter.glb',
  ship_hornet: 'hulls/hull_interceptor.glb',
  ship_ranger: 'hulls/hull_interceptor.glb',
  ship_bastion: 'hulls/hull_corvette.glb',
  ship_warden: 'hulls/hull_gunship.glb',
  ship_colossus: 'hulls/hull_gunship.glb',
  ship_leviathan: 'hulls/hull_gunship.glb',
});

/**
 * Wrap one already-built ship in the authored-asset boundary. This call is synchronous and cannot
 * remove the supplied fallback. Loading begins only when the fallback is actually rendered.
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
  trigger.onBeforeRender = function authoredAssetTrigger(renderer, scene, ...rest) {
    if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
    if (!armed) return;
    armed = false;
    trigger.onBeforeRender = previousBeforeRender;
    boundary.userData.authoredAssetState = 'loading';
    void upgradeBoundary(boundary, fallbackRoot, entity, renderer, scene, { releaseMode, onSwap: options.onSwap }, (next) => {
      active = next;
      syncActiveSurface(boundary, active);
    });
  };

  return boundary;
}

async function upgradeBoundary(boundary, fallbackRoot, entity, renderer, scene, options, setActive) {
  let swapped = false;
  try {
    const library = await loadCanonicalLibrary(renderer, options);
    if (!boundary.parent) return; // destroyed while assets were in flight

    const authored = buildComposedShip(entity, library, scene, boundary);
    if (!authored) {
      boundary.userData.authoredAssetState = 'unavailable';
      return;
    }
    if (!boundary.parent) {
      releaseOwnerInstances(boundary);
      return;
    }

    const oldHull = fallbackRoot.userData && fallbackRoot.userData.hull;
    const newHull = authored.root.userData && authored.root.userData.hull;
    if (oldHull && newHull) newHull.rotation.x = oldHull.rotation.x;
    primeAuthoredState(authored.root, fallbackRoot, entity);

    // Commit the swap only after the complete authored payload and all bindings exist. Nothing before
    // this point mutates the live ship, so any load/validation/composition error is automatically safe.
    boundary.remove(fallbackRoot);
    boundary.add(authored.root);
    setActive(authored.root);
    swapped = true;

    boundary.userData.authoredAssetState = 'authored';
    boundary.userData.authoredParts = authored.authoredParts;
    boundary.userData.proceduralFallbackParts = authored.fallbackParts;
    boundary.userData.authoredCompositionId = authored.root.userData.assetId;
    boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
    boundary.userData.__socketCache = new Map(); // invalidate renderer socket lookups across the swap
    if (typeof options.onSwap === 'function') {
      try { options.onSwap({ boundary, root: authored.root, entity, authoredParts: authored.authoredParts }); }
      catch (error) { console.warn('[partsLibrary] authored swap callback failed', error); }
    }

    try { disposeDetachedObject(fallbackRoot); }
    catch (error) { console.warn('[partsLibrary] fallback cleanup failed after a successful authored swap', error); }
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
    })).then((pairs) => new Map(pairs));
    promises.set(partRoot, promise);
  }
  return promise;
}

function buildComposedShip(entity, library, scene, ownerBoundary) {
  const seed = hashString(`${entity.id}|${entity.data && entity.data.defId}|${entity.factionId || ''}`);
  const selected = new Map();
  for (const slot of Object.keys(PART_LIBRARY_CONTRACT.slots)) {
    const records = library.get(slot) || [];
    if (slot === 'hull') {
      // The hull defines the silhouette, so prefer the defId-mapped class. Falling back to the
      // seed-based pick keeps every ship painted even if its defId isn't in the map (e.g. a future
      // ship added before its hull is authored).
      const wanted = HULL_FILE_BY_DEF_ID[entity.data && entity.data.defId];
      const exact = wanted && records.find((record) => String(record.url || '').endsWith(wanted));
      selected.set(slot, exact || (records.length ? records[((seed ^ hashString(slot)) >>> 0) % records.length] : null));
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
  const fallbackParts = [];
  const usedParts = [];

  // A low-poly pressure shell is always retained as the LOD safety silhouette. It appears only at
  // levels the authored hull does not supply, preventing both blank ships and double-rendered hulls.
  const safetyCore = buildSafetyCore(hull, materials);
  const hullRecord = selected.get('hull');
  if (hullRecord) {
    instantiatePart(hullRecord, hull, {
      position: [0, 0, 0], targetLength: 1.72, label: 'Hull',
    }, palette, scene, ownerBoundary, bindings, mutableMaterials);
    usedParts.push(hullRecord.url);
  } else {
    fallbackParts.push('hull');
  }
  const authoredHullLevels = hullRecord ? authoredLevels(hullRecord) : new Set();
  safetyCore.visible = !authoredHullLevels.has('lod0');
  // Snapshot only mounts supplied by the hull. Parts may themselves contain internal markers, but
  // assembly topology belongs to the hull grammar and must not change as later slots are mounted.
  const hullMounts = snapshotMounts(bindings.mounts);

  const cockpitPlacement = placementFromMount(hullMounts.cockpit[0], hull, {
    position: [0.35, 0.12, 0], targetLength: 0.58, label: 'Cockpit',
  });
  const cockpitRecord = selected.get('cockpit');
  if (cockpitRecord) {
    instantiatePart(cockpitRecord, hull, cockpitPlacement,
      palette, scene, ownerBoundary, bindings, mutableMaterials);
    usedParts.push(cockpitRecord.url);
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
        palette, scene, ownerBoundary, bindings, mutableMaterials);
    }
    usedParts.push(engineRecord.url);
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
        palette, scene, ownerBoundary, bindings, mutableMaterials);
    } else {
      buildFallbackFin(hull, materials, placement);
    }
  }
  if (finRecord) usedParts.push(finRecord.url);
  else fallbackParts.push('fin');

  if (!bindings.navLights.length) buildFallbackNavLights(hull, materials, bindings);
  ensureStandardSockets(hull);

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
    proceduralFallbackParts: fallbackParts,
    instancing: 'opaque immutable primitives pooled by geometry/material across ships',
    hookBinding: 'HOOK_* / SOCKET_* / MOUNT_* / LOD* names bound to shipKit.finalizeShip + shipDamage',
    physicalCanopy: { transmission: 0.6, ior: 1.4, clearcoat: 1.0 },
  };

  return {
    root,
    authoredParts: [...new Set(usedParts)],
    fallbackParts,
  };
}

function instantiatePart(record, parent, placement, palette, scene, owner, bindings, mutableMaterials) {
  const partRoot = new THREE.Group();
  partRoot.name = `GLTFKit_${placement.label}_${record.assetId}`;
  applyPlacementTransform(partRoot, placement);
  const sourceLength = Math.max(record.bounds.size[0], 1e-6); // +X length is part of the authoring contract
  const scale = placement.targetLength / sourceLength;
  partRoot.scale.multiplyScalar(scale);
  parent.add(partRoot);

  for (const primitive of record.primitives) {
    const dedicated = requiresPerShipMesh(primitive);
    let object;
    if (dedicated) {
      // Preserve the authored node transform on an anchor. shipKit's drive driver intentionally
      // overwrites fan rotation/core/plume scale, so binding the inner identity mesh prevents that
      // state update from erasing an artist's placement or baked hierarchy scale.
      const anchor = new THREE.Object3D();
      anchor.name = `${placement.label}_${primitive.name}_Anchor`;
      primitive.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
      partRoot.add(anchor);

      const material = mutableMaterialFor(
        primitive.material, primitive.tags, palette, mutableMaterials,
        `${record.url}|${placement.label}|${primitive.key}`
      );
      object = new THREE.Mesh(primitive.geometry, material);
      object.castShadow = !material.transparent && material.depthWrite !== false;
      object.receiveShadow = !material.transparent;
      object.userData.keepSeparate = true;
      anchor.add(object);
    } else {
      object = new THREE.Object3D();
      object.userData.spacefaceInstanceProxy = true;
      primitive.matrix.decompose(object.position, object.quaternion, object.scale);
      const material = sharedMaterialFor(primitive.material, primitive.tags, palette);
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
  if (plume.material) {
    plume.material.transparent = true;
    plume.material.depthWrite = false;
    if (!Number.isFinite(plume.material.opacity)) plume.material.opacity = 0.55;
  }
  plume.castShadow = false;
  plume.receiveShadow = false;
  plume.renderOrder = Math.max(plume.renderOrder || 0, 2);
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
  if (!primary || !primary.fan || bindings.driveFans.length < 2) return;
  const before = primary.fan.onBeforeRender;
  primary.fan.onBeforeRender = function synchronizedDrive(...args) {
    if (typeof before === 'function') before.apply(this, args);
    for (let i = 1; i < bindings.driveFans.length; i++) {
      bindings.driveFans[i].rotation.x = primary.fan.rotation.x;
    }
    for (let i = 1; i < bindings.driveCores.length; i++) {
      bindings.driveCores[i].scale.copy(primary.driveCore.scale);
    }
    for (let i = 1; i < bindings.drivePlumes.length; i++) {
      bindings.drivePlumes[i].scale.copy(primary.plume.scale);
      if (bindings.drivePlumes[i].material && primary.plume.material) {
        bindings.drivePlumes[i].material.opacity = primary.plume.material.opacity;
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
  root.userData.updateLod = function updateComposedLod(level) {
    if (typeof baseUpdate === 'function') baseUpdate(level);
    for (const [bucket, objects] of Object.entries(bindings.lod)) {
      const visible = bucket === level;
      for (const object of objects) object.visible = visible;
    }
    safetyCore.visible = !authoredHullLevels.has(level);
    if (root.userData.damageState === 'critical') {
      for (const secondary of bindings.secondary) secondary.visible = false;
    }
  };
}

// -------------------------------------------------------------------------------------------------
// Scene-level instance pools. A ship owns transform proxies; pools own the draw calls. Removal of the
// stable ship root releases all of its slots immediately, so hot reload/rebuild cannot leave ghosts.
// -------------------------------------------------------------------------------------------------
function allocateInstance(scene, owner, proxy, geometry, material, label) {
  const state = sceneState(scene);
  const key = `${geometry.uuid}|${material.uuid}`;
  let pool = state.pools.get(key);
  if (!pool) {
    pool = { chunks: [], geometry, material, label };
    state.pools.set(key, pool);
  }
  let chunk = pool.chunks.find((candidate) => candidate.free.length || candidate.next < INSTANCE_CHUNK_SIZE);
  if (!chunk) {
    chunk = createInstanceChunk(scene, pool, pool.chunks.length);
    pool.chunks.push(chunk);
  }

  const index = chunk.free.length ? chunk.free.pop() : chunk.next++;
  const slot = { proxy, owner, index, released: false };
  chunk.slots.set(index, slot);
  chunk.mesh.count = Math.max(chunk.mesh.count, index + 1);
  chunk.mesh.setMatrixAt(index, ZERO_MATRIX);
  chunk.mesh.instanceMatrix.needsUpdate = true;

  const release = () => {
    if (slot.released) return;
    slot.released = true;
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
  const chunk = { mesh, slots: new Map(), free: [], next: 0 };
  const sync = () => syncInstanceChunk(chunk);
  mesh.onBeforeRender = sync;
  mesh.onBeforeShadow = sync;
  scene.add(mesh);
  return chunk;
}

function syncInstanceChunk(chunk) {
  let dirty = false;
  for (const [index, slot] of chunk.slots) {
    if (slot.released) continue;
    if (!isVisibleToOwner(slot.proxy, slot.owner)) {
      chunk.mesh.setMatrixAt(index, ZERO_MATRIX);
    } else {
      slot.proxy.updateWorldMatrix(true, false);
      chunk.mesh.setMatrixAt(index, slot.proxy.matrixWorld);
    }
    dirty = true;
  }
  if (dirty) chunk.mesh.instanceMatrix.needsUpdate = true;
}

function isVisibleToOwner(object, owner) {
  if (!owner || !owner.parent) return false;
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === owner) return true;
  }
  return false;
}

function sceneState(scene) {
  let state = sceneStates.get(scene);
  if (!state) {
    state = { pools: new Map() };
    sceneStates.set(scene, state);
  }
  return state;
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
// Material variants: opaque authored materials are immutable and shared by instance pools. Hooked
// materials are cloned once per ship because damage/drive drivers mutate emissiveIntensity/opacity.
// -------------------------------------------------------------------------------------------------
function sharedMaterialFor(base, tags, palette) {
  const role = tintRole(tags);
  const tint = tintHex(palette, role);
  const key = `${base.uuid}|${role}|${tint}`;
  let material = sharedMaterialVariants.get(key);
  if (!material) {
    material = tintMaterial(base.clone(), tint, role);
    material.name = `${base.name || 'Authored'}_${role}_${tint.replace('#', '')}`;
    material.userData = { ...(material.userData || {}), spacefaceSharedAsset: true };
    material.dispose = () => {};
    sharedMaterialVariants.set(key, material);
  }
  return material;
}

function mutableMaterialFor(base, tags, palette, cache, instanceKey) {
  const role = tintRole(tags);
  const tint = tintHex(palette, role);
  const independentlyDriven = !!tags.drive || tags.damageRole === 'navLight' || tags.damageRole === 'sensor';
  const key = `${base.uuid}|${role}|${tint}|${independentlyDriven ? instanceKey : 'shared-within-ship'}`;
  let material = cache.get(key);
  if (!material) {
    material = tintMaterial(base.clone(), tint, role);
    material.name = `${base.name || 'Authored'}_${role}_mutable`;
    cache.set(key, material);
  }
  return material;
}

function tintMaterial(material, hex, role) {
  if (role === 'none') return material;
  const tint = new THREE.Color(hex);
  if (material.color) material.color.multiply(tint);
  if (material.emissive && material.emissive.getHex() !== 0 && (role === 'accent' || role === 'thruster')) {
    material.emissive.multiply(tint);
  }
  material.needsUpdate = true;
  return material;
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

function buildSafetyCore(hull, materials) {
  return kit.addMesh(hull, kit.loftXGeometry([
    { x: -0.78, halfY: 0.16, halfZ: 0.20 },
    { x: -0.42, halfY: 0.25, halfZ: 0.35 },
    { x: 0.18, halfY: 0.27, halfZ: 0.38 },
    { x: 0.62, halfY: 0.18, halfZ: 0.24 },
    { x: 0.86, halfY: 0.05, halfZ: 0.07 },
  ], 8), materials.hull, 'GLTFKit_Safety_PressureShell');
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
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), materials.accent.clone());
    light.name = side < 0 ? 'GLTFKit_Nav_Port' : 'GLTFKit_Nav_Starboard';
    light.position.set(0.25, 0.18, side * 0.38);
    light.userData.keepSeparate = true;
    light.userData.damageRole = 'navLight';
    hull.add(light);
    bindings.navLights.push(light);
  }
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
