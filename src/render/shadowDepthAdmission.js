// Three's public compile() prepares surface programs, not WebGLShadowMap depth/distance
// variants. Admission must run the exact casters through the real shadow pass or the first
// bloomScene draw still links a depth program (~460 ms on Intel/ANGLE without parallel compile).
import { revealSubjectForCompile } from './compilePresentSlice.js';

// One shared scratch color-pass material for every staged shadow-depth render. A per-call material
// would still link its (harmless, wrong-census) program once per context; sharing it keeps that to
// one program for the renderer's lifetime — and it can never carry a caster's surface state.
let shadowDepthColorOverride = null;

export function collectShadowCastSubjects(roots) {
  const list = Array.isArray(roots) ? roots : [roots];
  const casting = [];
  const seen = new Set();
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    const drawable = object.isMesh === true
      || object.isSkinnedMesh === true
      || object.isInstancedMesh === true;
    if (drawable && object.castShadow === true) {
      seen.add(object);
      casting.push(object);
    }
  };
  for (const root of list) {
    if (!root) continue;
    visit(root);
    if (typeof root.traverse === 'function') root.traverse(visit);
  }
  return casting;
}

// castShadow is a runtime-toggled flag, not a fixed trait: the instance-pool submit policy
// (instanceChunkSubmitPolicy.js) clears it while a chunk has no submitted instances, and the
// LOD/distance caster policy (shadowCasterPolicy.js) clears it beyond the cast radius or on
// lod1/lod2. A mesh admitted while its flag happens to be off still needs its depth variant —
// the first in-radius shadow pass would otherwise link it inside a measured frame. Depth
// variants are a pure function of the object's material + geometry, so admission compiles
// every shadow-CAPABLE drawable (the same opaque+depthWrite predicate the mint/policy paths
// use to arm castShadow) with the flag forced on for the staged pass.
// Mirrors the union of the runtime arming predicates: syncShadowCasterPolicy's opaqueReceiver
// test (normal-blended opaque surfaces) and isOpaqueInstancePoolMaterial. A mesh that can never
// cast — flagged spacefaceNoShadow / sharedContactShadow — stays out of the staged pass.
function materialCanCastShadow(material) {
  const list = Array.isArray(material) ? material : [material];
  return list.some((material) => material
    && material.visible !== false
    && material.transparent !== true
    && material.depthWrite !== false
    && !(Number.isFinite(Number(material.opacity)) && Number(material.opacity) < 1)
    && (material.blending === undefined || material.blending === 1));
}

function objectCanCastShadow(object) {
  const userData = object && object.userData;
  if (userData && (userData.spacefaceNoShadow === true || userData.sharedContactShadow === true)) {
    return false;
  }
  return materialCanCastShadow(object && object.material);
}

export function collectLatentShadowCastSubjects(roots, alreadyCasting = []) {
  const list = Array.isArray(roots) ? roots : [roots];
  const latent = [];
  const seen = new Set(alreadyCasting);
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    const drawable = object.isMesh === true
      || object.isSkinnedMesh === true
      || object.isInstancedMesh === true;
    if (drawable && object.castShadow !== true && objectCanCastShadow(object)) {
      seen.add(object);
      latent.push(object);
    }
  };
  for (const root of list) {
    if (!root) continue;
    visit(root);
    if (typeof root.traverse === 'function') root.traverse(visit);
  }
  return latent;
}

function isHidableDrawable(object) {
  return !!(object && object.visible === true && (
    object.isMesh === true
    || object.isSkinnedMesh === true
    || object.isInstancedMesh === true
    || object.isPoints === true
    || object.isLine === true
    || object.isSprite === true
  ));
}

// Hide every drawable outside `keep` for one bounded render of the live scene, then restore.
// Non-drawables (lights, groups, cameras) stay visible so the render-state census matches the
// live frame exactly; already-hidden drawables are left alone.
function hideDrawablesOutsideSet(scene, keep) {
  const hidden = [];
  scene.traverse((object) => {
    if (!isHidableDrawable(object) || keep.has(object)) return;
    object.visible = false;
    hidden.push(object);
  });
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

export function compileShadowDepthPipelines(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const camera = options.camera;
  const subjects = options.subjects;
  const captureObjectHome = options.captureObjectHome;
  const restoreObjectHome = options.restoreObjectHome;
  const shadowMap = renderer && renderer.shadowMap;
  const casting = collectShadowCastSubjects(subjects);
  const latent = collectLatentShadowCastSubjects(subjects, casting);
  const stagedCasters = casting.concat(latent);
  const forceEnable = options.forceEnable === true;
  if (!shadowMap || typeof shadowMap.render !== 'function' || !light || !camera) {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }
  if (typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function') {
    return { skipped: true, reason: 'shadow depth compiler requires object home capture', subjects: 0 };
  }

  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = light.castShadow;
  if (!forceEnable && (previousEnabled !== true || previousCastShadow !== true)) {
    return { skipped: true, reason: 'directional shadows inactive', subjects: 0 };
  }
  if (stagedCasters.length === 0 && !forceEnable) {
    return { skipped: true, reason: 'no shadow-casting subjects', subjects: 0 };
  }

  const THREE = options.THREE;
  // WebGLShadowMap.render() calls renderer.renderBufferDirect(), whose setProgram
  // dereferences the renderer's CURRENT render state — null outside a live
  // renderer.render() call. Staging therefore has to be a real Scene rendered
  // through render(): that runs the exact same shadow pass production frames run
  // (lights collected -> shadowMap.render -> depth programs) with valid state.
  // Depth program keys embed the render-state light census, so the pass must run
  // inside the LIVE scene: a synthetic staging scene links the same GLSL under a
  // dead census (a program no live draw ever reuses — pure zero-growth-contract
  // pollution) while the live-census variant still links inside a measured frame.
  const liveScene = options.scene && typeof options.scene.traverse === 'function'
    ? options.scene
    : null;
  let renderScene = null;
  let restoreRenderSceneVisibility = () => {};
  const homes = [];
  if (liveScene) {
    renderScene = liveScene;
    const isWithinLiveScene = (object) => {
      for (let node = object; node; node = node.parent) {
        if (node === liveScene) return true;
      }
      return false;
    };
    // Detached casters (deferred authored roots) join the live scene for one render;
    // casters already mounted stay exactly where they live.
    for (const caster of stagedCasters) {
      if (isWithinLiveScene(caster)) continue;
      homes.push(captureObjectHome(caster));
      liveScene.add(caster);
    }
    if (!isWithinLiveScene(light)) {
      homes.push(captureObjectHome(light));
      liveScene.add(light);
    }
    if (light.target && typeof light.target === 'object' && !isWithinLiveScene(light.target)) {
      homes.push(captureObjectHome(light.target));
      liveScene.add(light.target);
    }
    // Keep the casters plus every ancestor up to the scene: a hidden drawable parent
    // would take its staged caster subtree with it. An ancestor already parked at
    // visible=false (inactive LOD root, deferred group) is force-shown for this one
    // render and restored below — the old staging root absorbed this case implicitly.
    const keep = new Set(stagedCasters);
    const hiddenAncestors = [];
    for (const caster of stagedCasters) {
      for (let node = caster && caster.parent; node && node !== liveScene; node = node.parent) {
        keep.add(node);
        if (node.visible === false) hiddenAncestors.push(node);
      }
    }
    for (const node of hiddenAncestors) node.visible = true;
    // Hide every other drawable so the render stays bounded to the admission batch.
    // Lights are not drawables: they stay visible, which is exactly what makes the
    // staged census identical to the live one — surface and depth variants link under
    // the keys the next measured frame actually uses.
    const restoreHiddenDrawables = hideDrawablesOutsideSet(liveScene, keep);
    restoreRenderSceneVisibility = () => {
      restoreHiddenDrawables();
      for (const node of hiddenAncestors) node.visible = false;
    };
  } else {
    const staging = THREE && typeof THREE.Scene === 'function'
      ? new THREE.Scene()
      : null;
    if (!staging) {
      return { skipped: true, reason: 'shadow depth compiler requires THREE.Scene staging', subjects: 0 };
    }
    staging.name = options.stagingName || 'SF_AdmissionShadowDepthPipelines';
    // The staged render exists for WebGLShadowMap's depth/distance variants only. Its color pass
    // would otherwise link every caster's surface material against the staging scene's light census
    // (1 dir, 0 point, no environment) — variants the live scene never draws — adding programs the
    // soak's zero-growth contract then counts. An override material confines the color pass to one
    // shared scratch program; shadow depth materials still come from each caster's own material.
    if (THREE && typeof THREE.MeshBasicMaterial === 'function') {
      if (!shadowDepthColorOverride) shadowDepthColorOverride = new THREE.MeshBasicMaterial({ colorWrite: false });
      staging.overrideMaterial = shadowDepthColorOverride;
    }
    for (const caster of stagedCasters) {
      homes.push(captureObjectHome(caster));
      if (typeof staging.add === 'function') staging.add(caster);
    }
    homes.push(captureObjectHome(light));
    if (typeof staging.add === 'function') staging.add(light);
    if (light.target && typeof light.target === 'object') {
      homes.push(captureObjectHome(light.target));
      staging.add(light.target);
    }
    renderScene = staging;
    restoreRenderSceneVisibility = revealSubjectForCompile(staging);
  }
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const scratchTarget = options.renderTarget !== undefined
    ? options.renderTarget
    : new THREE.WebGLRenderTarget(8, 8);
  const restoreCasters = stagedCasters.map((root) => revealSubjectForCompile(root));
  // Latent casters are policy-off right now; the staged pass must see them as casters or
  // WebGLShadowMap skips them and the first in-radius live draw links the variant late.
  const restoreLatentCastFlags = latent.map((object) => {
    const prior = object.castShadow;
    object.castShadow = true;
    return () => { object.castShadow = prior; };
  });
  const programCacheKeys = new Set();
  let renderedMaterials = 0;
  let missingProgramBindings = 0;
  const originalRenderBufferDirect = typeof renderer.renderBufferDirect === 'function'
    ? renderer.renderBufferDirect
    : null;
  if (originalRenderBufferDirect) {
    renderer.renderBufferDirect = function captureShadowProgramBinding(...args) {
      const result = originalRenderBufferDirect.apply(this, args);
      renderedMaterials += 1;
      const material = args[3];
      let program = null;
      try {
        program = renderer.properties && typeof renderer.properties.get === 'function'
          ? renderer.properties.get(material)?.currentProgram
          : null;
      } catch (_) { /* The real shadow draw succeeded; report its missing binding fail-closed. */ }
      const key = program && (program.cacheKey || (program.id != null ? `id:${program.id}` : ''));
      if (key) programCacheKeys.add(String(key));
      else missingProgramBindings += 1;
      return result;
    };
  }
  const previousAutoUpdate = light.shadow ? light.shadow.autoUpdate : undefined;
  try {
    if (forceEnable) {
      shadowMap.enabled = true;
      light.castShadow = true;
    }
    // Force exactly one shadow refresh inside this render regardless of the
    // frame-time cadence gate; restore autoUpdate afterwards.
    if (light.shadow) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }
    if (typeof renderScene.updateMatrixWorld === 'function') renderScene.updateMatrixWorld(true);
    // Targeted pipeline admission, not a hidden scene discovery render. The live render
    // drives WebGLShadowMap through its normal path so depth programs compile under a
    // valid render state.
    // An empty caster list still runs so light.shadow.map exists before color compile —
    // otherwise numDirLightShadows stays 0 and the first shadowed draw relinks physical.
    renderer.setRenderTarget(scratchTarget || null);
    renderer.render(renderScene, camera);
    const programBindingFailures = [];
    if (stagedCasters.length > 0 && !originalRenderBufferDirect) {
      programBindingFailures.push(`shadow-depth:${stagedCasters.length}:render-buffer-direct-unavailable`);
    } else if (missingProgramBindings > 0) {
      programBindingFailures.push(`shadow-depth:${missingProgramBindings}/${renderedMaterials}:unprepared-program-binding`);
    }
    return {
      skipped: false,
      subjects: stagedCasters.length,
      latentCasters: latent.length,
      programCacheKeys: [...programCacheKeys].sort(),
      programBindingFailures,
    };
  } finally {
    if (originalRenderBufferDirect) renderer.renderBufferDirect = originalRenderBufferDirect;
    if (light.shadow && previousAutoUpdate !== undefined) light.shadow.autoUpdate = previousAutoUpdate;
    if (forceEnable) {
      shadowMap.enabled = previousEnabled;
      light.castShadow = previousCastShadow;
    }
    for (const restore of restoreLatentCastFlags) restore();
    for (const restore of restoreCasters) restore();
    restoreRenderSceneVisibility();
    for (const home of homes) restoreObjectHome(home);
    if (!liveScene && renderScene && typeof renderScene.clear === 'function') renderScene.clear();
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
    if (scratchTarget && options.renderTarget === undefined && typeof scratchTarget.dispose === 'function') {
      scratchTarget.dispose();
    }
    if (light.shadow) light.shadow.needsUpdate = true;
  }
}

export function armAdmissionShadows(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const shadowMap = renderer && renderer.shadowMap;
  if (!shadowMap || !light || options.enabled !== true) return () => {};
  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = light.castShadow;
  shadowMap.enabled = true;
  light.castShadow = true;
  return () => {
    shadowMap.enabled = previousEnabled;
    light.castShadow = previousCastShadow;
    if (light.shadow) light.shadow.needsUpdate = true;
  };
}
