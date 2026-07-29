import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { configureCommonRockPbr, createVisualFactory } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import {
  getAuthoredUpgradeQueueStats,
  shipArchetypeKeyForDefId,
  shipArchetypesForPrecompile,
} from './partsLibrary.js';
import { applyRealtimeCanopyPolicy } from './canopyMaterialPolicy.js';
import { build47aScenarioProp } from './scenarioProps47a.js';
import { createWormholePipelineMesh } from './spaceBackground.js';
import { createVfxPrecompileSalvo, eventLightPoolSizeFor } from './vfx.js';

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
  const staging = new THREE.Group();
  staging.name = 'SF_Precompile_Staging';
  staging.userData.precompileStaging = true;
  staging.position.set(-50000, -50000, -50000);
  scene.add(staging);
  let canopyPipelineWarmup = null;
  let keepWarmupPrograms = false;
  let stagingAttached = true;
  let residentBufferWarm = null;

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
    const targetPointLights = eventLightPoolSizeFor(options.video);
    let visiblePointLights = 0;
    scene.traverseVisible((object) => { if (object.isPointLight) visiblePointLights++; });
    for (let i = visiblePointLights; i < targetPointLights; i++) {
      const standIn = new THREE.PointLight(0xffffff, 0, 400, 2.0);
      standIn.name = `SF_Precompile_EventLight_${i}`;
      standIn.position.set(i * 24, 10, 0);
      staging.add(standIn);
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
      addLateWorldPipelineWarmup(canopyPipelineWarmup);
      addMeasuredLatePipelineWarmups(canopyPipelineWarmup);
      const vfxWarmup = createVfxPrecompileSalvo();
      globalWarmup.add(vfxWarmup);
      retainVfxPipelineWarmups(vfxWarmup, canopyPipelineWarmup);
      addShipAuxPipelineWarmup(scene, canopyPipelineWarmup);
      if (incremental) {
        globalWarmup.updateMatrixWorld(true);
        await options.preparePipelines(globalWarmup);
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

    // Detach synthetic probes BEFORE any resident-scene warm. Three.compile only links programs;
    // the first real draw still pays gl.bufferData for every BufferAttribute. If staging is still
    // in the graph during that warm draw, its throwaway attributes inflate the boot upload spike
    // and disposeObject() immediately frees those GPU buffers — forcing the live scene to upload
    // again on the first flight frame. Keep probes out of the warm graph; only resident content
    // should receive bufferData under the loading shell.
    scene.remove(staging);
    stagingAttached = false;
    if (canopyPipelineWarmup) canopyPipelineWarmup.removeFromParent();

    const stillCurrent = precompileGenerationFor(renderer) === generation;
    keepWarmupPrograms = !!canopyPipelineWarmup && stillCurrent;

    // Warm GPU buffers for the LIVE scene (player ship, background, aux pools, …) while the
    // loading shell still covers the canvas. Prefer the host warmPostProcess hook (bloom /
    // render-graph / dynamic-buffer arming); fall back to one straight render.
    if (stillCurrent && includeGlobalPipelines) {
      residentBufferWarm = await warmResidentSceneGpuBuffers(
        renderer, scene, camera, options, yieldToMain,
      );
    }

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
      residentBufferWarm,
      programs: renderer.info && renderer.info.programs ? renderer.info.programs.length : 0,
    };
  } finally {
    if (stagingAttached) scene.remove(staging);
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
  try {
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return { warmed: true, mode: 'renderer.render' };
  } finally {
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

function addAuthoredCanopyPipelineWarmup(staging) {
  // The authored catalog contains three physical-canopy layouts plus one standard alpha-glass
  // layout used by mapped station/whole-ship surfaces. They compile to distinct Three.js programs
  // even though all four share the same semantic canopy/glass role. Warm the exact declared
  // layouts with 1x1 textures so a late traffic/place admission cannot compile during exposed
  // flight. This creates no authored GLB residency and retains only four tiny synthetic variants.
  const baseColor = warmupTexture([210, 230, 250, 255], THREE.SRGBColorSpace);
  const normal = warmupTexture([128, 128, 255, 255]);
  const surface = warmupTexture([255, 180, 0, 255]);
  const variants = [
    { id: 'surface', roughnessMap: surface, metalnessMap: surface },
    { id: 'normal-surface-ao', normalMap: normal, roughnessMap: surface, metalnessMap: surface, aoMap: surface },
    { id: 'base-normal-surface', map: baseColor, normalMap: normal, roughnessMap: surface, metalnessMap: surface },
    {
      id: 'base-normal-surface-ao-standard',
      standard: true,
      map: baseColor,
      normalMap: normal,
      roughnessMap: surface,
      metalnessMap: surface,
      aoMap: surface,
    },
  ];
  const root = new THREE.Group();
  root.name = 'SF_Precompile_Canopy_KeepAlive';
  for (let i = 0; i < variants.length; i++) {
    const { id, standard = false, ...maps } = variants[i];
    const parameters = {
      color: 0xd7edff,
      metalness: 0,
      roughness: 0.12,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      dithering: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      ...maps,
    };
    const material = standard
      ? new THREE.MeshStandardMaterial(parameters)
      : new THREE.MeshPhysicalMaterial({ ...parameters, transmission: 0.65 });
    material.name = `SF_Precompile_Canopy_${id}`;
    if (!standard) applyRealtimeCanopyPolicy(material);
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

function addMeasuredLatePipelineWarmups(root) {
  // These retained probes cover exact program families that the shader timeline observed only
  // after the opening ramp: authored mapped physical surfaces, pooled common-rock geology, and
  // fogged sprite/basic presentation. Keep them synthetic so the hitch gate does not turn into
  // whole-catalog GLB residency.
  const baseColor = warmupTexture([154, 164, 176, 255], THREE.SRGBColorSpace);
  const normal = warmupTexture([128, 128, 255, 255]);
  const surface = warmupTexture([255, 170, 12, 255]);

  const add = (object, id) => {
    object.name = `SF_Precompile_${id}`;
    object.userData.precompileRetainedPipeline = id;
    root.add(object);
    return object;
  };
  const plane = (tangents = false) => {
    const geometry = new THREE.PlaneGeometry(3, 3);
    if (tangents) geometry.computeTangents();
    return geometry;
  };
  const fullMaps = {
    map: baseColor,
    normalMap: normal,
    aoMap: surface,
    roughnessMap: surface,
    metalnessMap: surface,
  };

  add(new THREE.Mesh(
    plane(true),
    new THREE.MeshPhysicalMaterial({
      ...fullMaps,
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
      clearcoat: 0,
      transmission: 0,
      dithering: true,
    }),
  ), 'authored-physical-fullmap-tangent');
  add(new THREE.Mesh(
    plane(false),
    new THREE.MeshPhysicalMaterial({
      ...fullMaps,
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
      clearcoat: 0,
      transmission: 0,
      dithering: true,
    }),
  ), 'authored-physical-fullmap-no-tangent');
  add(new THREE.Mesh(
    plane(true),
    new THREE.MeshPhysicalMaterial({
      ...fullMaps,
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      transmission: 0.65,
      dithering: true,
    }),
  ), 'authored-physical-transmission-fullmap');
  add(new THREE.Mesh(
    plane(true),
    new THREE.MeshPhysicalMaterial({
      ...fullMaps,
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0,
      clearcoat: 1,
      transmission: 0,
      dithering: true,
    }),
  ), 'authored-physical-clearcoat-fullmap');

  add(new THREE.Mesh(
    plane(false),
    new THREE.MeshStandardMaterial({
      map: baseColor,
      normalMap: normal,
      roughnessMap: surface,
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0,
    }),
  ), 'mapped-standard-surface');

  const rockGeometry = plane(false);
  const rockVertexCount = rockGeometry.getAttribute('position').count;
  rockGeometry.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(rockVertexCount * 3).fill(0.65), 3,
  ));
  rockGeometry.setAttribute('sfGeologyPbr', new THREE.BufferAttribute(
    new Float32Array(rockVertexCount * 4).fill(0.75), 4,
  ));
  const rockMaterial = configureCommonRockPbr(new THREE.MeshStandardMaterial({
    ...fullMaps,
    color: 0xffffff,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
  }));
  const rock = new THREE.InstancedMesh(rockGeometry, rockMaterial, 1);
  rock.setMatrixAt(0, new THREE.Matrix4());
  add(rock, 'common-rock-instanced-pbr');

  add(new THREE.Sprite(new THREE.SpriteMaterial({
    map: baseColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  })), 'fogged-halo-sprite');
  add(new THREE.Mesh(
    plane(false),
    new THREE.MeshBasicMaterial({
      color: 0x909090,
      fog: true,
      transparent: true,
      depthWrite: false,
    }),
  ), 'fogged-basic-surface');
}

function retainVfxPipelineWarmups(vfxWarmup, retainedRoot) {
  let plume = null;
  vfxWarmup.traverse((object) => {
    if (!plume && object.userData?.continuousPlume) plume = object;
  });
  if (!plume) return;
  plume.userData.precompileRetainedPipeline = 'hitch-main-plume';
  retainedRoot.add(plume);
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
