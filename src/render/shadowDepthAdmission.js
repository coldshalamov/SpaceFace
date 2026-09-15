// Three's public compile() prepares surface programs, not WebGLShadowMap depth/distance
// variants. Admission must run the exact casters through the real shadow pass or the first
// bloomScene draw still links a depth program (~460 ms on Intel/ANGLE without parallel compile).
import { revealSubjectForCompile } from './compilePresentSlice.js';

// Scratch color target for staged depth admission: the real renderer.render needs somewhere
// valid to present the trivial staging scene; 8x8 keeps the color pass near-free while the
// shadow pass writes its own light.shadow.map. Lazily created once per context lifetime.
let _admissionScratchTarget = null;
function admissionScratchTarget(THREE) {
  if (!_admissionScratchTarget && THREE && typeof THREE.WebGLRenderTarget === 'function') {
    _admissionScratchTarget = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false });
    _admissionScratchTarget.name = 'SF_AdmissionShadowDepthScratch';
  }
  return _admissionScratchTarget;
}

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
  if (!shadowMap || typeof renderer.render !== 'function' || !light || !camera) {
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
  if (!THREE || typeof THREE.Group !== 'function') {
    return { skipped: true, reason: 'THREE.Group unavailable for depth staging', subjects: 0 };
  }
  const staging = new THREE.Group();
  staging.name = options.stagingName || 'SF_AdmissionShadowDepthPipelines';
  const homes = casting.map((root) => captureObjectHome(root));
  const lightHome = captureObjectHome(light);
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
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
  try {
    if (forceEnable) {
      shadowMap.enabled = true;
      light.castShadow = true;
    }
    for (const root of casting) {
      if (typeof staging.add === 'function') staging.add(root);
    }
    // A standalone WebGLShadowMap.render has no live render state — WebGLProgram.setProgram
    // dereferences currentRenderState.state.lights and throws — and any variant it does
    // link folds a stale lights/shadow state into the program key, so the real frame still
    // compiles its own variant on first draw. The depth admission must run inside a real
    // renderer.render: staging carries the admitted casters plus the key light, the
    // one-shot needsUpdate flags force the shadow pass while autoUpdate stays off, and
    // the color side draws into a tiny scratch target so nothing reaches the screen.
    if (typeof staging.add === 'function') staging.add(light);
    if (typeof staging.updateMatrixWorld === 'function') staging.updateMatrixWorld(true);
    shadowMap.needsUpdate = true;
    if (light.shadow) light.shadow.needsUpdate = true;
    const scratch = admissionScratchTarget(THREE);
    if (scratch && typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(scratch);
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
    if (forceEnable) {
      shadowMap.enabled = previousEnabled;
      light.castShadow = previousCastShadow;
    }
    for (const restore of restoreCasters) restore();
    restoreVisibility();
    restoreObjectHome(lightHome);
    for (const home of homes) restoreObjectHome(home);
    if (typeof staging.clear === 'function') staging.clear();
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
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
