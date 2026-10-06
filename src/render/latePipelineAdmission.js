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

/**
 * Scene drawables that the opening leaf set never compiled. Hidden drawables are included:
 * LOD buckets and zero-count pools sit at visible === false until approach/activation, and their
 * first reveal used to be the first draw that linked their program.
 */
// The rescan calls the collectors below several times per iteration with the same
// openingSubjects array — memoize the membership Set per array instead of minting
// an identical one on every call.
const _openingSetMemo = new WeakMap();
function openingSetFor(openingSubjects) {
  if (!Array.isArray(openingSubjects)) return new Set();
  let set = _openingSetMemo.get(openingSubjects);
  if (!set) {
    set = new Set(openingSubjects.filter(Boolean));
    _openingSetMemo.set(openingSubjects, set);
  }
  return set;
}

export function collectUncompiledSceneDrawables(scene, openingSubjects = []) {
  const opening = openingSetFor(openingSubjects);
  const late = [];
  if (!scene || typeof scene.traverse !== 'function') return late;
  scene.traverse((object) => {
    if (!isDrawable(object) || opening.has(object)) return;
    late.push(object);
  });
  return late;
}

/** Chunked twin — same pre-order walk via an explicit stack, yielding per slice. */
export function* collectUncompiledSceneDrawablesSteps(scene, openingSubjects = [], nodesPerSlice = 256) {
  const opening = openingSetFor(openingSubjects);
  const late = [];
  if (!scene || typeof scene.traverse !== 'function') return late;
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const stack = [scene];
  let sinceYield = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    const children = object && object.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    if (object && isDrawable(object) && !opening.has(object)) late.push(object);
    sinceYield += 1;
    if (sinceYield >= every) {
      sinceYield = 0;
      yield;
    }
  }
  return late;
}

export function collectLateAdmittedCompileRoots(meshes, openingSubjects = []) {
  const opening = openingSetFor(openingSubjects);
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

/** Chunked twin — same verdict set; per-root subtree walks run on explicit
 * stacks and yield per slice so a cook paces the O(meshes×subtree) collect. */
export function* collectLateAdmittedCompileRootsSteps(meshes, openingSubjects = [], nodesPerSlice = 256) {
  const opening = openingSetFor(openingSubjects);
  const late = [];
  if (!meshes || typeof meshes.values !== 'function') return late;
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  let sinceYield = 0;
  for (const root of meshes.values()) {
    if (!root) continue;
    let hasDrawable = false;
    let hasUncompiled = false;
    const stack = [root];
    while (stack.length > 0) {
      const object = stack.pop();
      const children = object && object.children;
      if (children) {
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      if (object && isDrawable(object)) {
        hasDrawable = true;
        if (!opening.has(object)) hasUncompiled = true;
      }
      sinceYield += 1;
      if (sinceYield >= every) {
        sinceYield = 0;
        yield;
      }
    }
    if (hasDrawable && hasUncompiled) late.push(root);
  }
  return late;
}

/** Stamp the live PMREM onto standard materials so compile and first bloom share the env key. */
export function bindEnvironmentToStandardMaterials(root, envMap) {
  const it = bindEnvironmentToStandardMaterialsSteps(root, envMap);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}

/** Chunked twin of bindEnvironmentToStandardMaterials: iterative pre-order walk
 * with the same node order as Object3D.traverse, yielding every `nodesPerSlice`
 * visited nodes so a cook can drive the stamp walk on its own slice clock. */
export function* bindEnvironmentToStandardMaterialsSteps(root, envMap, nodesPerSlice = 256) {
  if (!root || !envMap) return 0;
  let count = 0;
  const visited = new Set();
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const stack = [root];
  let sinceYield = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    const children = object && object.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    if (object && !visited.has(object)) {
      visited.add(object);
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
    }
    sinceYield += 1;
    if (sinceYield >= every) {
      sinceYield = 0;
      yield;
    }
  }
  return count;
}

function isLiveFirstFlightEffect(object) {
  const name = String(object && object.name || '');
  const data = (object && object.userData) || {};
  if (data.precompileStaging === true) return false;
  if (data.continuousPlume === true) return true;
  if (name === 'sf-liquid-plasma-root') return true;
  if (name === 'sf-retro-volume-root' || name.startsWith('sf-retro-volume')) return true;
  // PlayerRetroJets (the bow retro pair) roots as `sf-retro-jets-root`. The name test above missed it,
  // so its two ShaderMaterial programs first linked mid-flight (swarm GPU brick, 2026-09-13).
  if (name === 'sf-retro-jets-root') return true;
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
  if (name === 'SF_WeaponEnergyBolts' || name === 'SF_WeaponDischargeSurfaces' || name === 'SF_WeaponRibbons'
    || name === 'SF_WeaponDistortion' || name === 'SF_WeaponHullScorch' || name === 'SF_WeaponLightPool'
    || name === 'SF_WellDistortion') return true;
  if (name === 'sf-persistent-combat-beams'
    || name === 'sf-combat-beam-core-pool'
    || name === 'sf-combat-beam-sheath-pool') return true;
  if (name === 'SF_ArcadeStructuralFx' || name === 'SF_ArcadeBladePool'
    || name === 'SF_ArcadeBrokenArcPool' || name === 'SF_ArcadePhysicalShardPool') return true;
  if (name === 'SF_QuarksEmittersRoot' || name === 'SF_QuarksBatchedRenderer') return true;
  if (name === 'SF_SnarlBraidedCables') return true;
  // Field device strand (pips, chevrons, banks, vanes, ribs, berms, knots, domes): instanced meshes built
  // once at effects init at count 0. A Crucible arena's fields light them in the first half second of
  // flight, where the pip program still linked on first draw (swarm probe, 2026-09-13).
  if (name.startsWith('SF_Field') && name.endsWith('Instances')) return true;
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

// Stepped twin: explicit-stack pre-order DFS identical to scene.traverse (children
// pushed reversed so pops run in document order). Drivers pace a scene-wide pass
// instead of paying it inside one leg.
export function* collectFirstFlightEffectRootsSteps(scene, options = {}) {
  const roots = [];
  const seen = new Set();
  if (!scene || typeof scene.traverse !== 'function') return roots;
  const stride = Number.isFinite(options.yieldStride) && options.yieldStride > 0
    ? Math.floor(options.yieldStride)
    : 1024;
  const stack = [scene];
  let visited = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    if ((++visited % stride) === 0) yield;
    if (!object || seen.has(object)) continue;
    if (isLiveFirstFlightEffect(object)) {
      seen.add(object);
      roots.push(object);
    }
    const children = object.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
  }
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

/** Chunked twin — same pool-root set via an explicit stack, yielding per slice. */
export function* collectInstancePoolCompileRootsSteps(scene, nodesPerSlice = 256) {
  const roots = [];
  const seen = new Set();
  if (!scene) return roots;
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const stack = [scene];
  let sinceYield = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    if (object && !seen.has(object)) {
      seen.add(object);
      if (object.userData && (
        object.userData.spacefaceInstancePool === true
        || object.userData.asteroidInstancePool === true
      )) {
        roots.push(object);
      }
    }
    const children = object && object.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    sinceYield += 1;
    if (sinceYield >= every) {
      sinceYield = 0;
      yield;
    }
  }
  return roots;
}

/** Instance-pool roots + every compile subject in ONE scene walk — the cook
 * used to pay two full traverses (pool scan + subject collect) back to back. */
export function collectInstancePoolCompileRootsAndSubjects(scene) {
  const roots = [];
  const subjects = [];
  const seen = new Set();
  if (!scene) return { roots, subjects };
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object.userData && (
      object.userData.spacefaceInstancePool === true
      || object.userData.asteroidInstancePool === true
    )) {
      roots.push(object);
    }
    if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh
      || object.isPoints || object.isLine || object.isSprite) {
      subjects.push(object);
    }
  };
  visit(scene);
  if (typeof scene.traverse === 'function') scene.traverse(visit);
  return { roots, subjects };
}

/** Chunked twin of collectInstancePoolCompileRootsAndSubjects: an iterative
 * pre-order walk whose node order matches Object3D.traverse exactly (node, then
 * children in order), yielding every `nodesPerSlice` visited nodes so the cook
 * can drive the walk under its own slice clock instead of paying the whole
 * ~21k-node traverse in one atomic block. Returns the same {roots, subjects}. */
export function* collectInstancePoolCompileRootsAndSubjectsSteps(scene, nodesPerSlice = 256) {
  const roots = [];
  const subjects = [];
  const seen = new Set();
  if (!scene) return { roots, subjects };
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const stack = [scene];
  let sinceYield = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    if (object && !seen.has(object)) {
      seen.add(object);
      if (object.userData && (
        object.userData.spacefaceInstancePool === true
        || object.userData.asteroidInstancePool === true
      )) {
        roots.push(object);
      }
      if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh
        || object.isPoints || object.isLine || object.isSprite) {
        subjects.push(object);
      }
    }
    const children = object && object.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    sinceYield += 1;
    if (sinceYield >= every) {
      sinceYield = 0;
      yield;
    }
  }
  return { roots, subjects };
}
