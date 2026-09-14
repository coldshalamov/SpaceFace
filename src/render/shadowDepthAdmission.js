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

export function compileShadowDepthPipelines(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const camera = options.camera;
  const subjects = options.subjects;
  const captureObjectHome = options.captureObjectHome;
  const restoreObjectHome = options.restoreObjectHome;
  const shadowMap = renderer && renderer.shadowMap;
  const casting = collectShadowCastSubjects(subjects);
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
  if (casting.length === 0 && !forceEnable) {
    return { skipped: true, reason: 'no shadow-casting subjects', subjects: 0 };
  }

  const THREE = options.THREE;
  // WebGLShadowMap.render() calls renderer.renderBufferDirect(), whose setProgram
  // dereferences the renderer's CURRENT render state — null outside a live
  // renderer.render() call. Staging therefore has to be a real Scene rendered
  // through render(): that runs the exact same shadow pass production frames run
  // (lights collected -> shadowMap.render -> depth programs) with valid state.
  // The staged color pass must NOT draw caster materials: this staging scene's
  // census (1 dir light, 0 point, no environment) differs from the live scene,
  // so it would link surface variants no live draw ever uses — programs the
  // soak's zero-growth contract then counts as late links.
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
  if (typeof THREE.MeshBasicMaterial === 'function') {
    if (!shadowDepthColorOverride) shadowDepthColorOverride = new THREE.MeshBasicMaterial({ colorWrite: false });
    staging.overrideMaterial = shadowDepthColorOverride;
  }
  const homes = casting.map((root) => captureObjectHome(root));
  homes.push(captureObjectHome(light));
  if (light.target && typeof light.target === 'object') homes.push(captureObjectHome(light.target));
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const scratchTarget = options.renderTarget !== undefined
    ? options.renderTarget
    : new THREE.WebGLRenderTarget(8, 8);
  const restoreVisibility = revealSubjectForCompile(staging);
  const restoreCasters = casting.map((root) => revealSubjectForCompile(root));
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
    for (const root of casting) {
      if (typeof staging.add === 'function') staging.add(root);
    }
    // The light (and its target) must belong to the rendered scene for the real
    // shadow pass to collect it; render() updates the staging graph itself.
    staging.add(light);
    if (light.target && typeof light.target === 'object') staging.add(light.target);
    // Force exactly one shadow refresh inside this render regardless of the
    // frame-time cadence gate; restore autoUpdate afterwards.
    if (light.shadow) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }
    if (typeof staging.updateMatrixWorld === 'function') staging.updateMatrixWorld(true);
    // Targeted pipeline admission, not a hidden scene discovery render. Only the admitted
    // casters are in `staging`; the live render drives WebGLShadowMap through its normal
    // path so depth programs compile under a valid render state.
    // An empty caster list still runs so light.shadow.map exists before color compile —
    // otherwise numDirLightShadows stays 0 and the first shadowed draw relinks physical.
    renderer.setRenderTarget(scratchTarget || null);
    renderer.render(staging, camera);
    const programBindingFailures = [];
    if (casting.length > 0 && !originalRenderBufferDirect) {
      programBindingFailures.push(`shadow-depth:${casting.length}:render-buffer-direct-unavailable`);
    } else if (missingProgramBindings > 0) {
      programBindingFailures.push(`shadow-depth:${missingProgramBindings}/${renderedMaterials}:unprepared-program-binding`);
    }
    return {
      skipped: false,
      subjects: casting.length,
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
    for (const restore of restoreCasters) restore();
    restoreVisibility();
    for (const home of homes) restoreObjectHome(home);
    if (typeof staging.clear === 'function') staging.clear();
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
