import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { createVisualFactory } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import {
  getAuthoredUpgradeQueueStats,
  shipArchetypeKeyForDefId,
  shipArchetypesForPrecompile,
} from './partsLibrary.js';
import { applyRealtimeCanopyPolicy } from './canopyMaterialPolicy.js';
import { build47aScenarioProp } from './scenarioProps47a.js';
import { createWormholePipelineMesh } from './spaceBackground.js';
import { createVfxPrecompileSalvo, visiblePointLightBudget } from './vfx.js';
import { waitForRockSurfaceLibraryReady } from './rockSurfaceLibrary.js';
import { createDynamicBufferCoordinator } from './dynamicBufferRanges.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));
const LAWFUL_ENEMIES = Object.freeze(['patrol_lawman', 'reaver_pirate']);
const PIRATE_ENEMIES = Object.freeze(['reaver_pirate', 'wasp_swarmer', 'corsair_raider']);
const FRONTIER_ENEMIES = Object.freeze(['corsair_raider', 'reaver_pirate', 'wasp_swarmer']);
const TRAFFIC_ROLE_SHIPS = Object.freeze([
  'ship_mule',
  'ship_kestrel',
  'ship_pelican',
  'ship_wasp',
  'ship_drifter',
  'ship_hornet',
]);
const COMPILE_GRID_SPACING = 92;
const compiledShipKeysByRenderer = new WeakMap();
const pipelineKeepAliveByRenderer = new WeakMap();
const globalPipelinesCompiledByRenderer = new WeakSet();
const globalPrecompilePromiseByRenderer = new WeakMap();
const precompileGenerationByRenderer = new WeakMap();

export async function precompilePipelines(renderer, scene, camera, options = {}) {
  if (!renderer || !scene || !camera || typeof renderer.compileAsync !== 'function') {
    return { skipped: true, reason: 'compileAsync unavailable' };
  }
  const sector = options && options.sector || null;
  const includeGlobalPipelines = !sector || options.includeGlobalPipelines === true;
  const compiledShipKeys = compiledShipKeysFor(renderer);
  const shipSpecs = (sector ? shipSpecsForSector(sector) : allShipSpecsForPrecompile())
    .filter((spec) => !compiledShipKeys.has(spec.key));

  if (!shipSpecs.length && (!includeGlobalPipelines || globalPipelinesCompiledByRenderer.has(renderer))) {
    return { skipped: true, reason: 'already compiled' };
  }
  if (!sector && globalPrecompilePromiseByRenderer.has(renderer)) {
    return globalPrecompilePromiseByRenderer.get(renderer);
  }

  const generation = precompileGenerationFor(renderer);
  const run = precompileNow(
    renderer, scene, camera, shipSpecs, includeGlobalPipelines, compiledShipKeys, generation, options,
  );
  if (!sector) return rememberGlobalPrecompile(renderer, run);
  return run;
}

async function precompileNow(
  renderer, scene, camera, shipSpecs, includeGlobalPipelines, compiledShipKeys, generation, options = {},
) {
  if (includeGlobalPipelines) await waitForRockSurfaceLibraryReady();
  const staging = new THREE.Group();
  staging.name = 'SF_Precompile_Staging';
  staging.userData.precompileStaging = true;
  staging.position.set(-50000, -50000, -50000);
  scene.add(staging);
  let lightStaging = null;
  let canopyPipelineWarmup = null;
  let keepWarmupPrograms = false;
  let stagingAttached = true;

  try {
    const vf = installVisualOverrides(createVisualFactory(), { releaseMode: true });
    const incremental = options.incremental === true
      && typeof options.preparePipelines === 'function';
    const yieldToMain = typeof options.yieldToMain === 'function'
      ? options.yieldToMain
      : yieldToBrowser;

    // Warm shaders against the EXACT light configuration the game runs with. three bakes the
    // visible light count into every shader program, so compiling against a different count
    // makes every warmed program a cache miss — the whole scene then recompiles synchronously
    // the first time a weapon flash fires (measured as multi-second freezes on Intel/ANGLE).
    // The vfx event-light pool keeps its lights permanently visible (intensity-only flashes);
    // if it hasn't attached yet, stage stand-ins so the compiled count still matches runtime.
    const targetPointLights = visiblePointLightBudget(options.video);
    let visiblePointLights = 0;
    scene.traverseVisible((object) => { if (object.isPointLight) visiblePointLights++; });
    if (visiblePointLights < targetPointLights) {
      // WebGLRenderer.compile(staging, camera, scene) gathers target-scene lights and then gathers
      // lights from the staging subject. A stand-in parented under staging is therefore visited
      // twice because staging is already attached to scene, producing a 12-light shader key for
      // the six-light live pool. Keep temporary lights as a target-scene sibling so each is counted
      // exactly once while every compiled material still sees the production light cardinality.
      lightStaging = new THREE.Group();
      lightStaging.name = 'SF_Precompile_EventLight_Staging';
      scene.add(lightStaging);
      for (let i = visiblePointLights; i < targetPointLights; i++) {
        const standIn = new THREE.PointLight(0xffffff, 0, 400, 2.0);
        standIn.name = `SF_Precompile_EventLight_${i}`;
        standIn.position.set(i * 24, 10, 0);
        lightStaging.add(standIn);
      }
    }

    if (incremental) await yieldToMain();
    let index = 0;
    for (const spec of shipSpecs) {
      const mesh = vf.build(makeShipEntity(spec, index));
      if (!mesh) continue;
      mesh.position.set((index % 8) * COMPILE_GRID_SPACING, 0, Math.floor(index / 8) * COMPILE_GRID_SPACING);
      staging.add(mesh);
      index++;
      if (incremental) {
        staging.updateMatrixWorld(true);
        await options.preparePipelines(mesh);
        if (precompileGenerationFor(renderer) === generation) compiledShipKeys.add(spec.key);
        await yieldToMain();
      }
    }
    if (includeGlobalPipelines && !globalPipelinesCompiledByRenderer.has(renderer)) {
      const globalWarmup = new THREE.Group();
      globalWarmup.name = 'SF_Precompile_Global_Pipelines';
      staging.add(globalWarmup);
      addWeaponProjectileWarmup(globalWarmup, vf, index);
      addBeamWarmup(globalWarmup);
      canopyPipelineWarmup = addAuthoredCanopyPipelineWarmup(globalWarmup);
      addAuthoredOpaquePipelineWarmup(canopyPipelineWarmup);
      addLateWorldPipelineWarmup(canopyPipelineWarmup);
      const commonRockWarmup = addCommonRockPipelineWarmup(canopyPipelineWarmup, vf);
      const vfxWarmup = createVfxPrecompileSalvo();
      globalWarmup.add(vfxWarmup);
      retainVfxPipelineWarmups(vfxWarmup, canopyPipelineWarmup);
      addShipAuxPipelineWarmup(scene, canopyPipelineWarmup);
      if (incremental) {
        globalWarmup.updateMatrixWorld(true);
        await options.preparePipelines(globalWarmup);
        await prepareDirectionalShadowPipelineVariant(
          renderer,
          scene,
          globalWarmup,
          options.preparePipelines,
          () => addCommonRockShadowDepthWarmups(canopyPipelineWarmup, commonRockWarmup),
        );
        await yieldToMain();
      }
    }
    const authoredQueue = getAuthoredUpgradeQueueStats(scene);
    if (!incremental) {
      staging.updateMatrixWorld(true);
      if (typeof options.preparePipelines === 'function') {
        await options.preparePipelines(staging);
      } else {
        await renderer.compileAsync(staging, camera, scene);
      }
    }

    // Synthetic probes never survive into opening composition residency. Startup used to follow
    // this detach with a full live-scene render, making driver cost proportional to every root in a
    // restored campaign. The deliberately scoped prepareOpeningGpuResources pass owns real opening
    // uploads and the covered first frame; this phase retains only the finite synthetic programs.
    scene.remove(staging);
    stagingAttached = false;
    if (lightStaging) lightStaging.removeFromParent();
    if (canopyPipelineWarmup) canopyPipelineWarmup.removeFromParent();

    const stillCurrent = precompileGenerationFor(renderer) === generation;
    keepWarmupPrograms = !!canopyPipelineWarmup && stillCurrent;

    if (!incremental && stillCurrent) {
      for (const spec of shipSpecs) compiledShipKeys.add(spec.key);
    }
    if (includeGlobalPipelines && stillCurrent) globalPipelinesCompiledByRenderer.add(renderer);
    return {
      skipped: false,
      shipArchetypes: shipSpecs.length,
      globalPipelines: includeGlobalPipelines,
      retainedCanopyVariants: countCanopyVariants(canopyPipelineWarmup),
      retainedPipelines: retainedPipelineIds(canopyPipelineWarmup),
      authoredUpgradeQueue: authoredQueue,
      programs: renderer.info && renderer.info.programs ? renderer.info.programs.length : 0,
    };
  } finally {
    if (stagingAttached) scene.remove(staging);
    if (lightStaging) {
      lightStaging.removeFromParent();
      lightStaging.clear();
    }
    if (canopyPipelineWarmup) {
      canopyPipelineWarmup.removeFromParent();
      if (keepWarmupPrograms) retainPipelineWarmup(renderer, canopyPipelineWarmup);
      else disposeObject(canopyPipelineWarmup);
    }
    disposeObject(staging);
  }
}

/**
 * Force first-touch GPU buffer uploads for the resident scene graph under the load shell.
 * Staging probes must already be detached so their synthetic attributes are not uploaded.
 *
 * Host `preparePipelines` is intentionally not invoked here: callers pass it as a per-probe
 * exact-target compile for staging subjects, and the live scene is admitted separately via
 * `compileCurrentPipelines` after authored visuals commit. This path only owns bufferData warm.
 */
async function warmResidentSceneGpuBuffers(renderer, scene, camera, options = {}, yieldToMain = yieldToBrowser) {
  if (typeof yieldToMain === 'function') await yieldToMain();

  // When no host prepare hook is driving admission, compile resident materials directly so the
  // subsequent draw does not also pay first-use program links on the same frame as bufferData.
  if (typeof options.preparePipelines !== 'function' && typeof renderer.compileAsync === 'function') {
    try {
      await renderer.compileAsync(scene, camera, scene);
    } catch (_) { /* best-effort; buffer warm below still runs */ }
  }

  if (typeof options.warmPostProcess === 'function') {
    await options.warmPostProcess();
    return { warmed: true, mode: 'warmPostProcess' };
  }
  if (typeof renderer.render !== 'function') {
    return { warmed: false, mode: 'unavailable' };
  }

  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const coordinator = scene && scene.isScene === true
    ? createDynamicBufferCoordinator(scene)
    : null;
  let epoch = null;
  try {
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(null);
    // Continue/New Game warmup used to render without a coordinator epoch. THREE's first
    // InstancedMesh bufferData then looked like an unsolicited upload and retired the owner.
    if (coordinator && typeof coordinator.arm === 'function') epoch = coordinator.arm();
    renderer.render(scene, camera);
    return { warmed: true, mode: 'renderer.render' };
  } finally {
    if (epoch != null && coordinator && typeof coordinator.disarm === 'function') {
      coordinator.disarm(epoch);
    }
    if (typeof renderer.setRenderTarget === 'function') {
      renderer.setRenderTarget(previousTarget || null);
    }
  }
}

export function precompileGlobalPipelines(renderer, scene, camera, options = {}) {
  if (!renderer || !scene || !camera || typeof renderer.compileAsync !== 'function') {
    return Promise.resolve({ skipped: true, reason: 'compileAsync unavailable' });
  }
  if (globalPipelinesCompiledByRenderer.has(renderer)) {
    return Promise.resolve({ skipped: true, reason: 'already compiled' });
  }
  if (globalPrecompilePromiseByRenderer.has(renderer)) {
    return globalPrecompilePromiseByRenderer.get(renderer);
  }
  const run = precompileNow(
    renderer, scene, camera, [], true, compiledShipKeysFor(renderer), precompileGenerationFor(renderer), options,
  );
  return rememberGlobalPrecompile(renderer, run);
}

export function invalidatePrecompileState(renderer, options = {}) {
  if (!renderer) return;
  compiledShipKeysByRenderer.delete(renderer);
  globalPipelinesCompiledByRenderer.delete(renderer);
  globalPrecompilePromiseByRenderer.delete(renderer);
  precompileGenerationByRenderer.set(renderer, precompileGenerationFor(renderer) + 1);
  const root = pipelineKeepAliveByRenderer.get(renderer);
  pipelineKeepAliveByRenderer.delete(renderer);
  if (root && options.dispose !== false) disposeObject(root);
}

export function getPrecompileKeepAliveDiagnostics(renderer) {
  const root = renderer && pipelineKeepAliveByRenderer.get(renderer);
  if (!root) return { retainedCanopyVariants: 0, variants: [], retainedPipelines: [] };
  const variants = [];
  root.traverse((object) => {
    if (!object.userData || !object.userData.precompileCanopyVariant) return;
    const material = object.material;
    const properties = renderer.properties && typeof renderer.properties.get === 'function'
      ? renderer.properties.get(material)
      : null;
    variants.push({
      id: object.userData.precompileCanopyVariant,
      programKey: properties && properties.currentProgram
        ? String(properties.currentProgram.cacheKey || properties.currentProgram.id)
        : null,
    });
  });
  return {
    retainedCanopyVariants: variants.length,
    variants,
    retainedPipelines: retainedPipelineIds(root),
  };
}

function yieldToBrowser() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function allShipSpecsForPrecompile() {
  const specs = [];
  for (const entry of shipArchetypesForPrecompile()) addShipSpec(specs, entry.defId);
  for (const enemy of ENEMY_TYPES) addEnemySpec(specs, enemy.id);
  return uniqueSpecs(specs);
}

function shipSpecsForSector(sector) {
  const specs = [];
  const trafficPerMin = sector && sector.trafficPerMin;
  const trafficCount = typeof trafficPerMin === 'number' ? Math.min(6, Math.round(trafficPerMin / 4)) : 3;
  if (trafficCount > 0) {
    for (const defId of TRAFFIC_ROLE_SHIPS) addShipSpec(specs, defId, { team: defId === 'ship_hornet' ? 3 : 2 });
  }
  const density = sector && Number(sector.enemyDensity) || 0;
  if (density > 0) {
    for (const enemyId of enemyPoolForSector(sector)) addEnemySpec(specs, enemyId);
    if (Number(sector.security) < 0.6) addEnemySpec(specs, 'patrol_lawman');
  }
  if ((sector && sector.pois || []).some((poi) => poi && poi.type === 'anomaly' && poi.id === 'poi_boss')) {
    addEnemySpec(specs, 'dreadnought_boss');
  }
  return uniqueSpecs(specs);
}

function enemyPoolForSector(sector) {
  if (Number(sector && sector.security) >= 0.6) return LAWFUL_ENEMIES;
  if (Number(sector && sector.tier) >= 3) return FRONTIER_ENEMIES;
  return PIRATE_ENEMIES;
}

function addEnemySpec(specs, enemyId) {
  const enemy = ENEMY_BY_ID.get(enemyId);
  if (!enemy) return;
  addShipSpec(specs, enemy.shipId, {
    key: shipArchetypeKeyForDefId(enemy.shipId, enemy.silhouette || enemy.id),
    silhouette: enemy.silhouette || null,
    lootTableId: enemy.id,
    team: enemy.factionLawful ? 2 : 1,
    visualTier: 12,
  });
}

function addShipSpec(specs, defId, extra = {}) {
  specs.push({
    defId,
    key: extra.key || shipArchetypeKeyForDefId(defId, extra.silhouette || ''),
    silhouette: extra.silhouette || null,
    lootTableId: extra.lootTableId || null,
    team: extra.team != null ? extra.team : 2,
    visualTier: extra.visualTier != null ? extra.visualTier : 10,
  });
}

function uniqueSpecs(specs) {
  const seen = new Set();
  const out = [];
  for (const spec of specs) {
    if (!spec || !spec.defId || seen.has(spec.key)) continue;
    seen.add(spec.key);
    out.push(spec);
  }
  return out;
}

function makeShipEntity(spec, index) {
  const def = SHIP_BY_ID.get(spec.defId) || SHIP_BY_ID.get('ship_kestrel');
  const radius = def && def.collisionRadius || 14;
  const data = {
    defId: spec.defId,
    fittings: defaultFittings(def),
    visualTier: spec.visualTier,
    miningBeam: true,
    // Shader probes are synthetic and must never become authored-asset residency demand. The
    // procedural visual grammar covers the same material/light/program families without decoding
    // every catalog GLB solely for a staging scene that is disposed immediately after compile.
    precompileProbe: true,
  };
  if (spec.silhouette) data.silhouette = spec.silhouette;
  if (spec.lootTableId) data.lootTableId = spec.lootTableId;
  return {
    id: -100000 - index,
    type: 'ship',
    team: spec.team,
    factionId: spec.team === 1 ? 'faction_vael' : 'faction_free',
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    prevRot: 0,
    radius,
    hull: def && def.hull || 100,
    hullMax: def && def.hull || 100,
    shield: def && def.shield || 0,
    shieldMax: def && def.shield || 0,
    flags: {},
    data,
  };
}

function defaultFittings(def) {
  const slots = def && def.slots;
  if (!slots) return [];
  const out = [];
  for (const type of ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility']) {
    const list = slots[type] || [];
    for (const slot of list) {
      out.push(type === 'weapon' ? weaponForSlot(slot) : null);
    }
  }
  return out;
}

function weaponForSlot(slot) {
  const size = typeof slot === 'string' ? slot : slot && slot.size || 'S';
  return WEAPONS.find((weapon) => weapon.size === size)?.id || WEAPONS[0]?.id || null;
}

function addWeaponProjectileWarmup(staging, vf, startIndex) {
  let index = 0;
  for (const weapon of WEAPONS) {
    const projectile = vf.build({
      id: -110000 - index,
      type: 'projectile',
      team: index % 3,
      radius: weapon.size === 'L' ? 1.1 : weapon.size === 'M' ? 0.85 : 0.65,
      pos: { x: 0, y: 0, z: 0 },
      prevPos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      rot: 0,
      flags: {},
      data: {
        weaponId: weapon.id,
        damageType: weapon.damageType || 'energy',
        kind: weapon.ammo || /missile|torpedo/i.test(weapon.id) ? 'missile' : 'bullet',
      },
    });
    if (projectile) {
      projectile.position.set(((startIndex + index) % 8) * COMPILE_GRID_SPACING, 18, Math.floor((startIndex + index) / 8) * COMPILE_GRID_SPACING);
      staging.add(projectile);
    }
    index++;
  }
}

function addBeamWarmup(staging) {
  const beamWeapons = WEAPONS.filter((weapon) => weapon.continuous || weapon.tracking === 'hitscan' || /beam|lance/i.test(weapon.id));
  for (let i = 0; i < Math.max(1, beamWeapons.length); i++) {
    const weapon = beamWeapons[i] || WEAPONS[0];
    const color = weapon.damageType === 'kinetic' ? 0xfff3c0 : 0x60d0ff;
    const geometry = new THREE.PlaneGeometry(18, 1.4);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(geometry, material);
    beam.name = `SF_Precompile_Beam_${weapon.id || i}`;
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(i * 10, 4, 0);
    staging.add(beam);
  }
}

function compiledShipKeysFor(renderer) {
  let keys = compiledShipKeysByRenderer.get(renderer);
  if (!keys) {
    keys = new Set();
    compiledShipKeysByRenderer.set(renderer, keys);
  }
  return keys;
}

function precompileGenerationFor(renderer) {
  return precompileGenerationByRenderer.get(renderer) || 0;
}

function rememberGlobalPrecompile(renderer, run) {
  const tracked = Promise.resolve(run).catch((error) => {
    if (globalPrecompilePromiseByRenderer.get(renderer) === tracked) {
      globalPrecompilePromiseByRenderer.delete(renderer);
    }
    throw error;
  });
  globalPrecompilePromiseByRenderer.set(renderer, tracked);
  return tracked;
}

async function warmResidentSceneWithShadowPipelines(
  renderer, scene, camera, retainedRoot, options = {}, yieldToMain = yieldToBrowser,
) {
  const shadowRoot = retainedRoot?.getObjectByName('SF_Precompile_ShadowDepth_KeepAlive') || null;
  const retainedParent = shadowRoot?.parent || null;
  const restoreShadowState = beginDirectionalShadowWarm(renderer, scene);
  if (shadowRoot) {
    shadowRoot.removeFromParent();
    scene.add(shadowRoot);
  }
  try {
    return await warmResidentSceneGpuBuffers(renderer, scene, camera, options, yieldToMain);
  } finally {
    restoreShadowState();
    if (shadowRoot) {
      shadowRoot.removeFromParent();
      if (retainedParent) retainedParent.add(shadowRoot);
    }
  }
}

function beginDirectionalShadowWarm(renderer, scene) {
  const shadowMap = renderer?.shadowMap;
  let keyLight = null;
  if (shadowMap && scene) {
    scene.traverseVisible((object) => {
      if (!keyLight && object.isDirectionalLight) keyLight = object;
    });
  }
  if (!shadowMap || !keyLight) return () => {};
  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = keyLight.castShadow;
  shadowMap.enabled = true;
  keyLight.castShadow = true;
  return () => {
    shadowMap.enabled = previousEnabled;
    keyLight.castShadow = previousCastShadow;
  };
}

async function prepareDirectionalShadowPipelineVariant(
  renderer, scene, subject, preparePipelines, beforePrepare = null,
) {
  const shadowMap = renderer && renderer.shadowMap;
  if (!shadowMap || typeof preparePipelines !== 'function' || !scene || !subject) {
    return { skipped: true, reason: 'directional shadow compiler unavailable' };
  }
  let keyLight = null;
  scene.traverseVisible((object) => {
    if (!keyLight && object.isDirectionalLight) keyLight = object;
  });
  if (!keyLight) return { skipped: true, reason: 'no directional light' };

  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = keyLight.castShadow;
  const addedPipelineOwners = typeof beforePrepare === 'function' && beforePrepare() === true;
  if (previousEnabled && previousCastShadow) {
    if (!addedPipelineOwners) {
      return { skipped: true, reason: 'directional shadow variant already active' };
    }
    subject.updateMatrixWorld(true);
    await preparePipelines(subject);
    return { skipped: false, reason: 'new pipeline owners admitted under active directional shadows' };
  }
  try {
    shadowMap.enabled = true;
    keyLight.castShadow = true;
    subject.updateMatrixWorld(true);
    await preparePipelines(subject);
    return { skipped: false };
  } finally {
    shadowMap.enabled = previousEnabled;
    keyLight.castShadow = previousCastShadow;
  }
}

function addAuthoredCanopyPipelineWarmup(staging) {
  // The authored cockpit catalog deliberately contains three texture-slot layouts. They compile to
  // distinct Three.js programs even though all three share the same semantic canopy material role.
  // Warm those declared layouts with 1x1 textures so a late traffic spawn cannot compile a canopy
  // shader during exposed flight. This creates no authored GLB residency and retains only the three
  // tiny synthetic variants needed to keep their shared driver programs alive.
  const baseColor = warmupTexture([210, 230, 250, 255], THREE.SRGBColorSpace);
  const normal = warmupTexture([128, 128, 255, 255]);
  const surface = warmupTexture([255, 180, 0, 255]);
  const variants = [
    { id: 'surface', roughnessMap: surface, metalnessMap: surface },
    { id: 'normal-surface-ao', normalMap: normal, roughnessMap: surface, metalnessMap: surface, aoMap: surface },
    { id: 'base-normal-surface', map: baseColor, normalMap: normal, roughnessMap: surface, metalnessMap: surface },
  ];
  const root = new THREE.Group();
  root.name = 'SF_Precompile_Canopy_KeepAlive';
  for (let i = 0; i < variants.length; i++) {
    const { id, ...maps } = variants[i];
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xd7edff,
      metalness: 0,
      roughness: 0.12,
      transmission: 0.65,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      dithering: true,
      ...maps,
    });
    material.name = `SF_Precompile_Canopy_${id}`;
    applyRealtimeCanopyPolicy(material);
    const geometry = new THREE.PlaneGeometry(8, 5);
    geometry.computeTangents();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `SF_Precompile_Canopy_${id}`;
    mesh.userData.precompileCanopyVariant = id;
    mesh.position.set(i * 10, 28, 0);
    root.add(mesh);
  }
  staging.add(root);
  return root;
}

function addAuthoredOpaquePipelineWarmup(root) {
  // Common authored traffic uses one full base/normal/ORM layout, but its calibrated response
  // policy produces three physical program keys: ordinary metal, clear-coated metal, and coated
  // transmissive glass. The first Helios Span can spawn after flight begins, so retain one tiny
  // owner for each exact layout rather than linking those programs during exposed flight.
  const baseColor = warmupTexture([190, 205, 220, 255], THREE.SRGBColorSpace);
  const normal = warmupTexture([128, 128, 255, 255]);
  const surface = warmupTexture([255, 164, 96, 255]);
  const variants = [
    { id: 'standard', clearcoat: 0, transmission: 0 },
    { id: 'clearcoat', clearcoat: 0.7, transmission: 0 },
    { id: 'clearcoat-transmission', clearcoat: 0.7, transmission: 0.45 },
  ];

  for (let index = 0; index < variants.length; index++) {
    const variant = variants[index];
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.computeTangents();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.35,
      roughness: 0.55,
      map: baseColor,
      normalMap: normal,
      aoMap: surface,
      roughnessMap: surface,
      metalnessMap: surface,
      clearcoat: variant.clearcoat,
      transmission: variant.transmission,
      transparent: false,
      side: THREE.FrontSide,
      dithering: true,
    });
    material.name = `SF_Precompile_AuthoredOpaque_${variant.id}`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    mesh.frustumCulled = false;
    mesh.userData.precompileRetainedPipeline = `authored-opaque-${variant.id}`;
    mesh.position.set(index * 3, 32, 0);
    root.add(mesh);
  }
}

function addLateWorldPipelineWarmup(root) {
  // These exact procedural owners can first appear well after the opening flight route: the rare
  // deep-field wormhole and the 47-A evidence spindle. Retain their tiny materials beside the
  // canopy probes so their driver programs cannot be evicted before the late world reveal.
  const wormholeTexture = warmupTexture([3, 5, 12, 255], THREE.SRGBColorSpace);
  const wormhole = createWormholePipelineMesh({
    size: 2,
    l1Texture: wormholeTexture,
    name: 'SF_Precompile_L5b_Wormhole',
  });
  root.add(wormhole);
  const spindle = build47aScenarioProp({
    radius: 10,
    data: { assetRef: 'asset.slice.47a_spindle' },
  });
  if (spindle) {
    spindle.name = 'SF_Precompile_47A_Evidence_Spindle';
    root.add(spindle);
  }
}

function retainVfxPipelineWarmups(vfxWarmup, retainedRoot) {
  if (!vfxWarmup || !retainedRoot) return;
  // compileAsync() only links a program while a material owns it. Disposing the synthetic salvo
  // immediately releases every rare VFX program whose zero-count live pool was skipped by the
  // current-scene compile. Keep the bounded off-scene salvo beside the canopy probes so first-use
  // ribbon, seam, particle, and sprite wakes cannot relink shaders during exposed flight.
  vfxWarmup.userData.precompileRetainedPipeline = 'vfx-salvo';
  let plume = null;
  vfxWarmup.traverse((object) => {
    if (!plume && object.userData?.continuousPlume) plume = object;
  });
  if (plume) plume.userData.precompileRetainedPipeline = 'hitch-main-plume';
  retainedRoot.add(vfxWarmup);
}

function addCommonRockPipelineWarmup(root, vf) {
  if (!root || !vf || typeof vf.build !== 'function') return null;
  const asteroid = vf.build({
    id: 47,
    type: 'asteroid',
    radius: 12,
    data: { typeId: 'ast_common_rock' },
  });
  const source = asteroid?.userData?.asteroidInstanceBody;
  if (!source?.geometry || !source?.material?.map || !source.material.normalMap) return null;

  source.removeFromParent();
  const mesh = new THREE.InstancedMesh(source.geometry, source.material, 1);
  mesh.name = 'SF_Precompile_CommonRock_InstancedPbr';
  mesh.count = 1;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(12, 12, 12));
  mesh.userData.precompileRetainedPipeline = 'common-rock-instanced-pbr';
  // The visual factory owns these globally cached resources. Retaining the exact material pins its
  // custom geology program, but precompile invalidation must never dispose the shared maps.
  mesh.userData.precompileBorrowedResources = true;
  getCommonRockShadowDepthRoot(root).add(mesh);
  return mesh;
}

function addCommonRockShadowDepthWarmups(root, commonRockWarmup) {
  if (!root || !commonRockWarmup || root.userData.commonRockShadowDepthWarm) return false;
  root.userData.commonRockShadowDepthWarm = true;
  const shadowRoot = getCommonRockShadowDepthRoot(root);
  const layouts = [
    { id: 'shadow-depth-map-instanced', mapped: true, instanced: true },
    { id: 'shadow-depth-map-mesh', mapped: true, instanced: false },
    { id: 'shadow-depth-solid-mesh', mapped: false, instanced: false },
  ];
  for (let index = 0; index < layouts.length; index++) {
    const layout = layouts[index];
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshDepthMaterial({
      map: layout.mapped ? warmupTexture([128, 128, 128, 255]) : null,
      // WebGLShadowMap flips ordinary FrontSide casters to BackSide for PCF shadow rendering.
      side: THREE.BackSide,
    });
    material.name = `SF_Precompile_${layout.id}`;
    const mesh = layout.instanced
      ? new THREE.InstancedMesh(geometry, material, 1)
      : new THREE.Mesh(geometry, material);
    mesh.name = `SF_Precompile_${layout.id}`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.userData.precompileRetainedPipeline = layout.id;
    mesh.position.set(index * 3, 36, 0);
    if (layout.instanced) {
      mesh.count = 1;
      mesh.setMatrixAt(0, new THREE.Matrix4());
    }
    shadowRoot.add(mesh);
  }
  return true;
}

function getCommonRockShadowDepthRoot(root) {
  let shadowRoot = root.getObjectByName('SF_Precompile_ShadowDepth_KeepAlive');
  if (shadowRoot) return shadowRoot;
  shadowRoot = new THREE.Group();
  shadowRoot.name = 'SF_Precompile_ShadowDepth_KeepAlive';
  root.add(shadowRoot);
  return shadowRoot;
}

function addShipAuxPipelineWarmup(scene, retainedRoot) {
  let source = null;
  scene.traverse((object) => {
    if (!source && object.userData?.shipAuxPool === 'shieldBubble') source = object;
  });
  if (!source?.geometry || !source?.material) return;

  const mesh = new THREE.InstancedMesh(source.geometry.clone(), source.material.clone(), 1);
  mesh.name = 'SF_Precompile_ShipShieldBubble_Pool';
  mesh.count = 1;
  mesh.frustumCulled = false;
  mesh.userData.precompileRetainedPipeline = 'ship-shield-bubble';
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.setColorAt(0, new THREE.Color(0x5fd0ff));
  const flash = mesh.geometry.getAttribute('instanceFlash');
  const base = mesh.geometry.getAttribute('instanceBase');
  if (flash) flash.setX(0, 1);
  if (base) base.setX(0, 0.15);
  for (let i = 0; i < 4; i++) {
    const hit = mesh.geometry.getAttribute(`instanceHit${i}`);
    if (hit && typeof hit.setXYZW === 'function') hit.setXYZW(0, 0, 1, 0, i === 0 ? 1 : 0);
  }
  retainedRoot.add(mesh);
}

function countCanopyVariants(root) {
  let count = 0;
  if (root) root.traverse((object) => { if (object.userData?.precompileCanopyVariant) count++; });
  return count;
}

function retainedPipelineIds(root) {
  const ids = [];
  if (root) root.traverse((object) => {
    const id = object.userData?.precompileRetainedPipeline;
    if (id) ids.push(id);
  });
  return ids.sort();
}

function warmupTexture(rgba, colorSpace = THREE.NoColorSpace) {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function retainPipelineWarmup(renderer, root) {
  const previous = pipelineKeepAliveByRenderer.get(renderer);
  if (previous && previous !== root) disposeObject(previous);
  pipelineKeepAliveByRenderer.set(renderer, root);
}

function disposeObject(root) {
  root.traverse((object) => {
    if (object.userData?.precompileBorrowedResources) return;
    if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      for (const key of ['map', 'alphaMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap']) {
        const texture = material && material[key];
        if (texture && typeof texture.dispose === 'function') texture.dispose();
      }
      if (material && typeof material.dispose === 'function') material.dispose();
    }
  });
}
