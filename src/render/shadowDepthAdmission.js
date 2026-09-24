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

// The depth admission exists to link caster depth variants, but renderer.render() also runs a
// color pass over the staged roots — against a bare rig (one shadowed key light, no env, no fog).
// That pass used to link an extra COLOR program per staged material under the wrong key, which did
// two kinds of damage: the wasted link cost a program slot each time, and the junk variant left
// materialProperties.currentProgram non-null, so bloom's unready-drawable guard saw a "ready"
// program and let the first presented draw link the real (env'd) variant inside bloomScene
// (~394 ms on the min-spec Intel iGPU — the ae_bell soak brick). A Scene overrideMaterial makes the
// color pass draw every caster with one shared basic material: WebGLShadowMap still reads
// object.material for the real depth variants, while no subject color program is evaluated.
let _admissionOverrideMaterial = null;
function admissionOverrideMaterial(THREE) {
  if (!_admissionOverrideMaterial && THREE && typeof THREE.MeshBasicMaterial === 'function') {
    _admissionOverrideMaterial = new THREE.MeshBasicMaterial();
    _admissionOverrideMaterial.name = 'SF_AdmissionShadowDepthOverride';
  }
  return _admissionOverrideMaterial;
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

// The live shadow policy (shadowCasterPolicy.js) flips castShadow on for EVERY opaque mesh whose
// root moves inside the ±300 key-light ortho — including props built with castShadow off, like
// beacons. A mesh that only gains the flag in flight links its depth variant mid-round unless the
// admission staged it. Collect the same set the policy can promote: every drawable with at least
// one opaque, depth-writing material, minus the explicit never-cast markers.
function materialCanCastShadow(material) {
  if (!material) return true; // stubs/no-material meshes: assume castable so tests still collect them
  if (material.transparent === true) return false;
  if (material.depthWrite === false) return false;
  if (material.opacity != null && material.opacity < 1) return false;
  return true;
}

function collectPotentialShadowCastSubjects(roots) {
  const list = Array.isArray(roots) ? roots : [roots];
  const casting = [];
  const seen = new Set();
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    const drawable = object.isMesh === true
      || object.isSkinnedMesh === true
      || object.isInstancedMesh === true;
    if (!drawable) return;
    seen.add(object);
    const ud = object.userData || {};
    if (ud.spacefaceNoShadow === true
      || ud.sharedContactShadow === true
      || ud.authoredReadableFallbackLayer === true) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(materialCanCastShadow)) return;
    casting.push(object);
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
  const casting = collectPotentialShadowCastSubjects(subjects);
  // three bakes the rendered scene's light counts (numDirLights/numPointLights/…) and fog flags
  // into EVERY program key — including depth variants. The live scene runs 3 directional + 8
  // pooled point lights under FogExp2; a staging scene holding only the key light produces keys
  // no live draw can ever hit (the +21s LivingHull/StaticGroup/pool NOVELs). Stage the real
  // scene's full light set + fog so the linked keys are identical to live.
  const lightingScene = options.lightingScene || null;
  const stagedLights = [];
  if (lightingScene && typeof lightingScene.traverse === 'function') {
    lightingScene.traverse((object) => {
      if (object && object.isLight === true && object !== light) stagedLights.push(object);
    });
  }
  const forceEnable = options.forceEnable === true;
  if (!shadowMap || !light) {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }
  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = light.castShadow;
  if (!forceEnable && (previousEnabled !== true || previousCastShadow !== true)) {
    return { skipped: true, reason: 'directional shadows inactive', subjects: 0 };
  }
  if (casting.length === 0 && !forceEnable) {
    return { skipped: true, reason: 'no shadow-casting subjects', subjects: 0 };
  }
  if (typeof renderer.render !== 'function' || !camera
      || typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function') {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }

  const THREE = options.THREE;
  if (!THREE || typeof THREE.Scene !== 'function') {
    return { skipped: true, reason: 'THREE.Scene unavailable for depth staging', subjects: 0 };
  }
  const staging = new THREE.Scene();
  staging.name = options.stagingName || 'SF_AdmissionShadowDepthPipelines';
  const colorOverride = admissionOverrideMaterial(THREE);
  if (colorOverride) staging.overrideMaterial = colorOverride;
  const homes = casting.map((root) => captureObjectHome(root));
  const lightHome = captureObjectHome(light);
  // Reparent the real scene's lights (and directional/spot targets) into staging so the
  // render-state light counts baked into program keys match a live frame exactly.
  const stagedLightHomes = [];
  for (const sceneLight of stagedLights) {
    stagedLightHomes.push(captureObjectHome(sceneLight));
    if (sceneLight.target && sceneLight.target.isObject3D === true) {
      stagedLightHomes.push(captureObjectHome(sceneLight.target));
    }
  }
  if (lightingScene && lightingScene.fog) staging.fog = lightingScene.fog;
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const restoreVisibility = revealSubjectForCompile(staging);
  const restoreCasters = casting.map((root) => revealSubjectForCompile(root));
  // Potential casters are staged with castShadow forced on so their depth variants compile now;
  // the live policy enables the flag later when the entity enters the shadow ortho.
  const castShadowRestore = [];
  for (const object of casting) {
    if (object.castShadow !== true) {
      castShadowRestore.push(object);
      object.castShadow = true;
    }
  }
  const programCacheKeys = new Set();
  const drawnNames = new Set();
  const drawnKeys = new Set();
  let renderedMaterials = 0;
  let missingProgramBindings = 0;
  const originalRenderBufferDirect = typeof renderer.renderBufferDirect === 'function'
    ? renderer.renderBufferDirect
    : null;
  if (originalRenderBufferDirect) {
    renderer.renderBufferDirect = function captureShadowProgramBinding(...args) {
      const result = originalRenderBufferDirect.apply(this, args);
      renderedMaterials += 1;
      const drawn = args[4];
      // Shadow-pass draws call renderBufferDirect with scene=null (WebGLShadowMap.renderObject);
      // the color pass passes the staging scene. Count only depth draws for staging proof.
      const depthDraw = args[1] == null;
      if (depthDraw && drawn && typeof drawn.name === 'string' && drawn.name) {
        drawnNames.add(drawn.name);
      }
      const material = args[3];
      let program = null;
      try {
        program = renderer.properties && typeof renderer.properties.get === 'function'
          ? renderer.properties.get(material)?.currentProgram
          : null;
      } catch (_) { /* The real shadow draw succeeded; report its missing binding fail-closed. */ }
      const key = program && (program.cacheKey || (program.id != null ? `id:${program.id}` : ''));
      if (key) {
        programCacheKeys.add(String(key));
        if (depthDraw && drawn && /CommonRockInstances|LivingHull|Wreck_Batch/.test(drawn.name || '')) {
          const source = drawn.material;
          drawnKeys.add(`${drawn.name}|key:${String(key)}|side:${source && source.side}|shadowSide:${source && source.shadowSide}|map:${!!(source && source.map)}|depthType:${material && material.type}`);
        }
      }
      else missingProgramBindings += 1;
      return result;
    };
  }
  try {
    if (forceEnable) {
      shadowMap.enabled = true;
      light.castShadow = true;
    }
    // A standalone WebGLShadowMap.render has no live render state — WebGLProgram.setProgram
    // dereferences currentRenderState.state.lights and throws — and any variant it does
    // link folds a stale lights/shadow state into the program key, so the real frame still
    // compiles its own variant on first draw. The depth admission must run inside a real
    // renderer.render: staging carries the admitted casters plus the key light, the
    // one-shot needsUpdate flags force the shadow pass while autoUpdate stays off, and
    // the color side draws into a tiny scratch target so nothing reaches the screen.
    if (typeof staging.add === 'function') staging.add(light);
    if (light.target && light.target.isObject3D === true) {
      stagedLightHomes.push(captureObjectHome(light.target));
      staging.add(light.target);
    }
    for (const sceneLight of stagedLights) {
      staging.add(sceneLight);
      if (sceneLight.target && sceneLight.target.isObject3D === true) staging.add(sceneLight.target);
    }
    if (typeof staging.updateMatrixWorld === 'function') staging.updateMatrixWorld(true);
    const scratch = admissionScratchTarget(THREE);
    if (scratch && typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(scratch);
    // three runs WebGLShadowMap.render() BEFORE currentRenderState.setupLights() — a fresh
    // staging scene's first shadow pass reads an EMPTY lights.state and bakes
    // numDirLights=0/numPointLights=0/numDirLightShadows=0 into every depth program key,
    // while live frames read the census the previous render left behind (3 dir + 8 pooled
    // points + 1 dir shadow). Render the lights-only staging scene once with the shadow
    // pass disabled so setupLights() populates this scene's persistent render state —
    // render states are WeakMap-cached per scene — then the real pass links keys that
    // match live draws exactly. The warm render draws nothing (lights aren't renderable).
    const censusRenderEnabled = shadowMap.enabled;
    shadowMap.enabled = false;
    renderer.render(staging, camera);
    shadowMap.enabled = censusRenderEnabled;
    for (const root of casting) {
      if (typeof staging.add === 'function') staging.add(root);
    }
    if (typeof staging.updateMatrixWorld === 'function') staging.updateMatrixWorld(true);
    shadowMap.needsUpdate = true;
    if (light.shadow) light.shadow.needsUpdate = true;
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
      // Diagnostic: which named instanced families actually drew in the staged pass — a NOVEL
      // link on a listed name proves the program key drifted, an absent name proves it never drew.
      stagedNames: [...drawnNames]
        .filter((name) => /CommonRockInstances|LivingHull|InstancePool|Wreck_Batch/.test(name)),
      stagedKeys: [...drawnKeys],
    };
  } finally {
    if (originalRenderBufferDirect) renderer.renderBufferDirect = originalRenderBufferDirect;
    for (const object of castShadowRestore) object.castShadow = false;
    if (forceEnable) {
      shadowMap.enabled = previousEnabled;
      light.castShadow = previousCastShadow;
    }
    for (const restore of restoreCasters) restore();
    restoreVisibility();
    for (const home of stagedLightHomes) restoreObjectHome(home);
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
