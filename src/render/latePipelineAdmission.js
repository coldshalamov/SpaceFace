// Sector precompile predicts a population. Anything admitted outside that prediction reaches
// its first draw uncompiled unless admission compiles it. Opening owns a finite leaf set;
// remaining live entity roots are compiled after that set, still behind the loading shell.

function isDrawable(object) {
  return !!(object && (
    object.isMesh === true
    || object.isSkinnedMesh === true
    || object.isInstancedMesh === true
    || object.isPoints === true
    || object.isLine === true
    || object.isSprite === true
  ));
}

/** Scene drawables that the opening leaf set never compiled. */
export function collectUncompiledSceneDrawables(scene, openingSubjects = []) {
  const opening = new Set(Array.isArray(openingSubjects) ? openingSubjects.filter(Boolean) : []);
  const late = [];
  if (!scene || typeof scene.traverse !== 'function') return late;
  scene.traverse((object) => {
    if (!isDrawable(object) || opening.has(object) || object.visible === false) return;
    late.push(object);
  });
  return late;
}

export function collectLateAdmittedCompileRoots(meshes, openingSubjects = []) {
  const opening = new Set(Array.isArray(openingSubjects) ? openingSubjects.filter(Boolean) : []);
  const late = [];
  if (!meshes || typeof meshes.values !== 'function') return late;
  for (const root of meshes.values()) {
    if (!root) continue;
    let hasDrawable = false;
    let hasUncompiled = false;
    const visit = (object) => {
      if (!isDrawable(object)) return;
      hasDrawable = true;
      if (!opening.has(object)) hasUncompiled = true;
    };
    visit(root);
    if (typeof root.traverse === 'function') root.traverse(visit);
    if (hasDrawable && hasUncompiled) late.push(root);
  }
  return late;
}

/** Stamp the live PMREM onto standard materials so compile and first bloom share the env key. */
export function bindEnvironmentToStandardMaterials(root, envMap) {
  if (!root || !envMap) return 0;
  let count = 0;
  const visit = (object) => {
    if (!object) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : (object.material ? [object.material] : []);
    for (const material of materials) {
      if (!material || material.isMeshStandardMaterial !== true) continue;
      if (material.envMap === envMap) continue;
      material.envMap = envMap;
      material.needsUpdate = true;
      count += 1;
    }
  };
  visit(root);
  if (typeof root.traverse === 'function') root.traverse(visit);
  return count;
}

function isLiveFirstFlightEffect(object) {
  const name = String(object && object.name || '');
  const data = (object && object.userData) || {};
  if (data.precompileStaging === true) return false;
  if (data.continuousPlume === true) return true;
  if (name === 'sf-liquid-plasma-root') return true;
  if (name === 'sf-retro-volume-root' || name.startsWith('sf-retro-volume')) return true;
  if (name === 'SF_RibbonTrail') return true;
  if (name === 'Evidence_Spindle_47A') return true;
  if (name.startsWith('plume-system:')) return true;
  if (name.startsWith('rcs-system:')) return true;
  // Count-0 combat pools are excluded from the opening leaf census, then first-draw
  // inside bloom and brick Intel. These are the live pools, not SF_Precompile_* copies.
  if (name === 'SF_VFX_ParticleShardStreaks') return true;
  if (name === 'SF_TrailStreakInstances') return true;
  if (name === 'ShipNavLight_Pool' || name === 'ShipShieldBubble_Pool') return true;
  if (data.shipAuxPool === 'navLight' || data.shipAuxPool === 'shieldBubble') return true;
  if (name.startsWith('SF_VFX_') && name.endsWith('_sprite_instances')) return true;
  if (name === 'SF_WeaponEnergyBolts' || name === 'SF_WeaponFlipbooks' || name === 'SF_WeaponRibbons'
    || name === 'SF_WeaponDistortion' || name === 'SF_WeaponHullScorch' || name === 'SF_WeaponLightPool'
    || name === 'SF_WellDistortion') return true;
  if (name === 'sf-persistent-combat-beams'
    || name === 'sf-combat-beam-core-pool'
    || name === 'sf-combat-beam-sheath-pool') return true;
  if (name === 'SF_ArcadeStructuralFx' || name === 'SF_ArcadeBladePool'
    || name === 'SF_ArcadeBrokenArcPool' || name === 'SF_ArcadePhysicalShardPool') return true;
  if (name === 'SF_QuarksEmittersRoot' || name === 'SF_QuarksBatchedRenderer') return true;
  if (name === 'SF_SnarlBraidedCables') return true;
  return false;
}

/** Live first-flight exhaust, combat pools, and 47-A props. Dummy staging copies are not this set. */
export function collectFirstFlightEffectRoots(scene) {
  const roots = [];
  const seen = new Set();
  if (!scene || typeof scene.traverse !== 'function') return roots;
  scene.traverse((object) => {
    if (!object || seen.has(object) || !isLiveFirstFlightEffect(object)) return;
    seen.add(object);
    roots.push(object);
  });
  return roots;
}

function isLayerDrawable(object) {
  return !!(object && object.geometry && (
    object.isMesh === true
    || object.isSkinnedMesh === true
    || object.isInstancedMesh === true
    || object.isPoints === true
    || object.isLine === true
    || object.isSprite === true
  ));
}

/** Every first-flight effect drawable, including count-0 and drawRange-0 layers. */
export function collectFirstFlightLayerDrawables(roots) {
  const drawables = [];
  const seen = new Set();
  const visit = (object) => {
    if (!isLayerDrawable(object) || seen.has(object)) return;
    seen.add(object);
    drawables.push(object);
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) {
    if (!root) continue;
    if (typeof root.traverse === 'function') root.traverse(visit);
    else visit(root);
  }
  return drawables;
}

/** Instance-pool chunks live on the scene, not the entity mesh map. Include count=0 pending ones. */
export function collectInstancePoolCompileRoots(scene) {
  const roots = [];
  const seen = new Set();
  if (!scene) return roots;
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object.userData && (
      object.userData.spacefaceInstancePool === true
      || object.userData.asteroidInstancePool === true
    )) {
      roots.push(object);
    }
  };
  visit(scene);
  if (typeof scene.traverse === 'function') scene.traverse(visit);
  return roots;
}
