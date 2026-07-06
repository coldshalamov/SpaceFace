import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { createVisualFactory } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import {
  getAuthoredUpgradeQueueStats,
  preloadAuthoredPartLibrary,
  shipArchetypeKeyForDefId,
  shipArchetypesForPrecompile,
} from './partsLibrary.js';
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
const compiledShipKeys = new Set();
let globalPipelinesCompiled = false;
let globalPrecompilePromise = null;

export async function precompilePipelines(renderer, scene, camera, options = {}) {
  if (!renderer || !scene || !camera || typeof renderer.compileAsync !== 'function') {
    return { skipped: true, reason: 'compileAsync unavailable' };
  }
  const sector = options && options.sector || null;
  const includeGlobalPipelines = !sector || options.includeGlobalPipelines === true;
  const shipSpecs = (sector ? shipSpecsForSector(sector) : allShipSpecsForPrecompile())
    .filter((spec) => !compiledShipKeys.has(spec.key));

  if (!shipSpecs.length && (!includeGlobalPipelines || globalPipelinesCompiled)) {
    return { skipped: true, reason: 'already compiled' };
  }
  if (!sector && globalPrecompilePromise) return globalPrecompilePromise;

  const run = precompileNow(renderer, scene, camera, shipSpecs, includeGlobalPipelines, options);
  if (!sector) globalPrecompilePromise = run;
  return run;
}

async function precompileNow(renderer, scene, camera, shipSpecs, includeGlobalPipelines, options = {}) {
  const staging = new THREE.Group();
  staging.name = 'SF_Precompile_Staging';
  staging.userData.precompileStaging = true;
  staging.position.set(-50000, -50000, -50000);
  scene.add(staging);

  try {
    await preloadAuthoredPartLibrary(renderer).catch(() => null);
    const vf = installVisualOverrides(createVisualFactory(), { releaseMode: true });
    let index = 0;
    for (const spec of shipSpecs) {
      const mesh = vf.build(makeShipEntity(spec, index));
      if (!mesh) continue;
      mesh.position.set((index % 8) * COMPILE_GRID_SPACING, 0, Math.floor(index / 8) * COMPILE_GRID_SPACING);
      staging.add(mesh);
      const request = mesh.userData && mesh.userData.requestAuthoredUpgrade;
      if (typeof request === 'function') request(renderer, scene);
      index++;
    }
    if (includeGlobalPipelines && !globalPipelinesCompiled) {
      addWeaponProjectileWarmup(staging, vf, index);
      addBeamWarmup(staging);
      staging.add(createVfxPrecompileSalvo());
    }
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
    const authoredQueue = await waitForAuthoredUpgradeQueue(scene);
    staging.updateMatrixWorld(true);
    await renderer.compileAsync(staging, camera, scene);
    if (includeGlobalPipelines && typeof options.warmPostProcess === 'function') {
      await options.warmPostProcess();
    }
    for (const spec of shipSpecs) compiledShipKeys.add(spec.key);
    if (includeGlobalPipelines) globalPipelinesCompiled = true;
    return {
      skipped: false,
      shipArchetypes: shipSpecs.length,
      globalPipelines: includeGlobalPipelines,
      authoredUpgradeQueue: authoredQueue,
      programs: renderer.info && renderer.info.programs ? renderer.info.programs.length : 0,
    };
  } finally {
    scene.remove(staging);
    disposeObject(staging);
  }
}

async function waitForAuthoredUpgradeQueue(scene, maxFrames = 300) {
  let stats = getAuthoredUpgradeQueueStats(scene);
  for (let i = 0; i < maxFrames && stats && (stats.pending > 0 || stats.running); i++) {
    await nextFrame();
    stats = getAuthoredUpgradeQueueStats(scene);
  }
  return stats || { pending: 0, running: false };
}

function nextFrame() {
  return new Promise((resolve) => {
    const raf = globalThis && typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null;
    if (raf) raf(() => resolve());
    else setTimeout(resolve, 16);
  });
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

function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      for (const key of ['map', 'alphaMap', 'emissiveMap', 'roughnessMap', 'normalMap']) {
        const texture = material && material[key];
        if (texture && typeof texture.dispose === 'function') texture.dispose();
      }
      if (material && typeof material.dispose === 'function') material.dispose();
    }
  });
}
