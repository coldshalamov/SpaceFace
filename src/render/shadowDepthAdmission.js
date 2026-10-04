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

const _admissionKeyLights = new WeakMap();

function copyTransformFields(dst, src) {
  if (!dst || !src) return;
  for (const key of ['position', 'quaternion', 'scale']) {
    const value = src[key];
    if (!value) continue;
    if (dst[key] && typeof dst[key].copy === 'function') dst[key].copy(value);
    else dst[key] = value;
  }
}

const ADMISSION_SHADOW_CAMERA_KEYS = ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom'];

function syncAdmissionTransform(staged, source) {
  if (typeof source.getWorldPosition === 'function'
      && typeof source.getWorldQuaternion === 'function'
      && typeof source.getWorldScale === 'function'
      && staged.position && staged.quaternion && staged.scale) {
    source.getWorldPosition(staged.position);
    source.getWorldQuaternion(staged.quaternion);
    source.getWorldScale(staged.scale);
    return;
  }
  copyTransformFields(staged, source);
}

function syncAdmissionShadow(cloneShadow, sourceShadow) {
  if (!cloneShadow || !sourceShadow) return;
  if (typeof cloneShadow.copy === 'function') {
    cloneShadow.copy(sourceShadow);
    if (cloneShadow.camera && typeof cloneShadow.camera.updateProjectionMatrix === 'function') {
      cloneShadow.camera.updateProjectionMatrix();
    }
    return;
  }
  for (const key of ['bias', 'normalBias', 'radius', 'blurSamples', 'intensity']) {
    if (typeof sourceShadow[key] === 'number') cloneShadow[key] = sourceShadow[key];
  }
  if (sourceShadow.mapSize && cloneShadow.mapSize) {
    if (typeof cloneShadow.mapSize.copy === 'function') cloneShadow.mapSize.copy(sourceShadow.mapSize);
    else cloneShadow.mapSize = sourceShadow.mapSize;
  }
  const camera = cloneShadow.camera;
  const sourceCamera = sourceShadow.camera;
  if (camera && sourceCamera) {
    for (const key of ADMISSION_SHADOW_CAMERA_KEYS) {
      if (typeof sourceCamera[key] === 'number') camera[key] = sourceCamera[key];
    }
    if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
  }
}

function admissionKeyLight(renderer, source, THREE) {
  if (!renderer || !source || typeof THREE.DirectionalLight !== 'function') return null;
  let perRenderer = _admissionKeyLights.get(renderer);
  if (!perRenderer) {
    perRenderer = new Map();
    _admissionKeyLights.set(renderer, perRenderer);
  }
  let staged = perRenderer.get(source);
  if (!staged) {
    staged = new THREE.DirectionalLight();
    staged.name = 'SF_AdmissionShadowDepthKey';
    perRenderer.set(source, staged);
  }
  if (staged.color && source.color && typeof staged.color.copy === 'function') staged.color.copy(source.color);
  else if (source.color !== undefined) staged.color = source.color;
  if (typeof source.intensity === 'number') staged.intensity = source.intensity;
  if (typeof source.visible === 'boolean') staged.visible = source.visible;
  syncAdmissionTransform(staged, source);
  staged.castShadow = true;
  syncAdmissionShadow(staged.shadow, source.shadow);
  if (staged.target && source.target) syncAdmissionTransform(staged.target, source.target);
  return staged;
}

export function disposeAdmissionShadowResources(renderer, options = {}) {
  const disposeGpu = options.disposeGpu !== false;
  const perRenderer = renderer ? _admissionKeyLights.get(renderer) : null;
  if (perRenderer) {
    for (const staged of perRenderer.values()) {
      const shadow = staged && staged.shadow;
      if (shadow) {
        if (disposeGpu && typeof shadow.dispose === 'function') shadow.dispose();
        shadow.map = null;
        shadow.mapPass = null;
      }
    }
    perRenderer.clear();
  }
  if (renderer) _admissionKeyLights.delete(renderer);
  if (_admissionScratchTarget) {
    if (disposeGpu && typeof _admissionScratchTarget.dispose === 'function') _admissionScratchTarget.dispose();
    _admissionScratchTarget = null;
  }
  if (_admissionOverrideMaterial) {
    if (disposeGpu && typeof _admissionOverrideMaterial.dispose === 'function') _admissionOverrideMaterial.dispose();
    _admissionOverrideMaterial = null;
  }
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
  if (material.visible === false) return false; // the shadow pass skips invisible materials — no depth program ever links
  if (material.transparent === true) return false;
  if (material.depthWrite === false) return false;
  if (material.opacity != null && material.opacity < 1) return false;
  return true;
}

// Exported for the settings OFF→ON path: a flag-only whole-scene enumeration
// that skips the signature-string mints + staged-set probes
// collectUnstagedShadowCasters pays per caster — the arm's per-slice recollect
// re-derives the genuinely-unstaged set anyway.
export function collectPotentialShadowCastSubjects(roots, nodeBudget = null) {
  const list = Array.isArray(roots) ? roots : [roots];
  const casting = [];
  const seen = new Set();
  const visit = (object) => {
    // Traverse cost, not caster count: one fat packaged subtree could pay an
    // unbounded walk inside the presented frame, so callers pass a shared
    // {remaining} budget the walk debits per visited node.
    if (nodeBudget && (nodeBudget.remaining -= 1) < 0) throw _walkBudgetAbort;
    if (!object || seen.has(object)) return;
    const drawable = object.isMesh === true
      || object.isSkinnedMesh === true
      || object.isInstancedMesh === true;
    if (!drawable) return;
    seen.add(object);
    // Geometry-less stubs can never draw — revealSubjectForCompile hides them, the pass
    // skips them, and marking them would only pin an unstaged entry that re-collects
    // under every later delta. A mesh that gains geometry later collects then.
    if ('geometry' in object && object.geometry == null) return;
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

// Depth-variant readiness: signatures of casters this ceremony already staged, per
// renderer. A caster whose signature is recorded already links the exact depth program
// the stage would mint (same material params + object kind, same light census + fog
// terms baked into three's program key), so join-trickle rescans and successive
// admission legs can skip re-paying the whole-scene staging for the same set. A light
// census change mints a different signature and re-stages rather than trusting a stale
// read; a material-less stub records nothing (there is no program to link).
const _stagedDepthSignatures = new WeakMap();

// Per-mesh staged certificate, written at mark time next to the signature entries.
// The presented-frame policy collect reads this tuple instead of re-minting signature
// strings — it carries the identical discriminant set (material uuids + interned
// variant bits, object kind, morph census, custom depth material, layer mask, light
// census) so a mismatch is exactly a re-minted signature: the collect proves
// staged-vs-unstaged with zero per-caster allocs.
const DEPTH_MARK_KEY = 'sfDepthMark';

function writeDepthMark(caster, lightSig) {
  const kind = caster.isSkinnedMesh === true ? 'sk'
    : (caster.isInstancedMesh === true ? 'in' : 'me');
  const geometry = caster.geometry || null;
  const materials = Array.isArray(caster.material) ? caster.material : [caster.material];
  const mats = [];
  for (const material of materials) {
    if (!material || !material.uuid || material.visible === false) continue;
    mats.push(material.uuid, casterDepthVariant(material));
  }
  if (!caster.userData) caster.userData = {};
  caster.userData[DEPTH_MARK_KEY] = {
    l: lightSig,
    g: geometry,
    ma: geometry && geometry.morphAttributes ? geometry.morphAttributes : null,
    mn: geometry && geometry.morphAttributes ? Object.keys(geometry.morphAttributes).length : 0,
    c: caster.customDepthMaterial || null,
    ly: caster.layers && Number.isFinite(caster.layers.mask) ? caster.layers.mask : 1,
    k: kind,
    a: mats,
  };
}

/**
 * The mesh's depth-staged certificate still describes its live discriminant set: every
 * field mismatch is a re-minted signature, i.e. genuinely unstaged. Mirrors
 * casterDepthSignatures' inputs — a material mutation (in-place or swap), geometry or
 * morph census change, custom depth material swap, layer mask flip, or a light-census
 * drift all re-collect the caster. uuid strings compare by value; variant strings are
 * interned per material so a repeat lookup is a reference hit.
 */
export function casterDepthMarkCurrent(caster, lightSig) {
  const mark = caster && caster.userData ? caster.userData[DEPTH_MARK_KEY] : null;
  if (!mark || mark.l !== lightSig) return false;
  const geometry = caster.geometry || null;
  if (mark.g !== geometry) return false;
  if (mark.ma !== (geometry && geometry.morphAttributes ? geometry.morphAttributes : null)) return false;
  if (mark.c !== (caster.customDepthMaterial || null)) return false;
  const layerMask = caster.layers && Number.isFinite(caster.layers.mask) ? caster.layers.mask : 1;
  if (mark.ly !== layerMask) return false;
  const kind = caster.isSkinnedMesh === true ? 'sk'
    : (caster.isInstancedMesh === true ? 'in' : 'me');
  if (mark.k !== kind) return false;
  const morphCount = mark.ma ? Object.keys(mark.ma).length : 0;
  if (mark.mn !== morphCount) return false;
  const materials = Array.isArray(caster.material) ? caster.material : [caster.material];
  let i = 0;
  for (const material of materials) {
    if (!material || !material.uuid || material.visible === false) continue;
    if (i + 1 >= mark.a.length
        || mark.a[i] !== material.uuid
        || mark.a[i + 1] !== casterDepthVariant(material)) return false;
    i += 2;
  }
  return i === mark.a.length;
}

/**
 * Flag-collect twin of collectUnstagedShadowCasters for the presented-frame policy
 * sync: same unstaged set (signature-capable casters with no current mark) without
 * paying signature mints + staged-Set probes per caster. The arm re-collects with the
 * full signature path at its own deadline — this is only the withhold decision.
 */
// Returned by collectUnstagedShadowCastersFlag when the shared node budget ran
// out mid-walk: the caller over-covers (whole-subtree withhold) instead of
// trusting a partial unstaged set — the arm's collect re-derives for real.
export const UNSTAGED_COLLECT_OVER_COVER = 'sfUnstagedCollectOverCover';
const _walkBudgetAbort = new Error('sf-shadow-collect-node-budget');

export function collectUnstagedShadowCastersFlag(roots, lightSig, nodeBudget = null) {
  let casting;
  try {
    casting = collectPotentialShadowCastSubjects(roots, nodeBudget);
  } catch (error) {
    if (error === _walkBudgetAbort) return UNSTAGED_COLLECT_OVER_COVER;
    throw error;
  }
  if (casting === UNSTAGED_COLLECT_OVER_COVER || casting.length === 0) return casting;
  const unstaged = [];
  for (const caster of casting) {
    // A caster that cannot mint a signature (no material uuid, or every material
    // invisible) also cannot draw — identical to the signatures.length===0 skip in
    // the signature collect.
    const materials = Array.isArray(caster.material) ? caster.material : [caster.material];
    let capable = false;
    for (const material of materials) {
      if (material && material.uuid && material.visible !== false) { capable = true; break; }
    }
    if (!capable) continue;
    if (!casterDepthMarkCurrent(caster, lightSig)) unstaged.push(caster);
  }
  return unstaged;
}

export function lightCensusSignature(lightingScene) {
  if (!lightingScene || typeof lightingScene.traverse !== 'function') return 'l0|f0';
  // Key what the program key actually bakes: the RENDERED light set's per-type
  // counts (plus castShadow and layers mask per light), and fog kind. A light
  // under an invisible subtree never reaches projectObject — counting it would
  // re-mint the session for no real key drift; a same-count type swap (dir→point)
  // changes real keys while a bare l<n> count stays still — cold links in
  // presented frames. Sorted so traverse order can't mint spurious sigs.
  const counts = new Map();
  lightingScene.traverse((object) => {
    if (!object || object.isLight !== true) return;
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) return;
    }
    const layersMask = object.layers && Number.isFinite(object.layers.mask)
      ? object.layers.mask : 1;
    const key = `${object.type || 'Light'}:${layersMask}:${object.castShadow === true ? 1 : 0}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const parts = [...counts.entries()].map(([k, n]) => `${k}x${n}`).sort();
  const fog = lightingScene.fog;
  const fogKey = fog ? (fog.isFogExp2 === true ? 'fx' : 'fs') : 'f0';
  return `${fogKey}|${parts.join('|')}`;
}

// Seq-memoized census readers (renderer._shadowCensusForFrame) fold this into
// their validity: any mid-seq mutation of the rendered light set — precompile
// stand-in mounts/removals, a torn-down subtree that carried a light — bumps it
// once so a same-seq memo can't serve the pre-mutation signature.
let shadowCensusMutationEpoch = 0;
export function noteShadowCensusLightMutation() {
  shadowCensusMutationEpoch += 1;
}
export function shadowCensusEpoch() {
  return shadowCensusMutationEpoch;
}

// The variant substring's inputs are ~9 primitive reads — intern it per material
// so repeat collects on the same casters don't re-alloc the discriminant string
// every slice. A mutation that changes any input re-mints under the new bits.
const _depthVariantCache = new WeakMap();
function casterDepthVariant(material) {
  const bits = [
    material.alphaTest > 0 ? 1 : 0,
    material.alphaTest > 0 && material.map ? 1 : 0,
    material.alphaTest > 0 && material.alphaMap ? 1 : 0,
    material.displacementMap && material.displacementScale !== 0 ? 1 : 0,
    material.alphaToCoverage === true ? 1 : 0,
    material.clipShadows === true ? 1 : 0,
    material.side == null ? 0 : material.side,
    material.shadowSide == null ? 0 : material.shadowSide,
    material.alphaHash === true ? 1 : 0,
    material.vertexColors === true ? 1 : 0,
  ];
  const cached = _depthVariantCache.get(material);
  if (cached && cached.bits.every((bit, i) => bit === bits[i])) return cached.variant;
  const variant = `a${bits[0]}`
    + `m${bits[1]}`
    + `x${bits[2]}`
    + `d${bits[3]}`
    + `c${bits[4]}`
    + `p${bits[5]}`
    + `s${bits[6]}`
    + `h${bits[7]}`
    + `z${bits[8]}`
    + `v${bits[9]}`;
  _depthVariantCache.set(material, { bits, variant });
  return variant;
}

function casterDepthSignatures(caster, lightSig) {
  const kind = caster.isSkinnedMesh === true ? 'sk'
    : (caster.isInstancedMesh === true ? 'in' : 'me');
  const geometry = caster.geometry;
  const morph = geometry && geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0
    ? 'm1' : 'm0';
  const custom = caster.customDepthMaterial && caster.customDepthMaterial.uuid
    ? `|cdm:${caster.customDepthMaterial.uuid}` : '';
  const materials = Array.isArray(caster.material) ? caster.material : [caster.material];
  const layerMask = caster.layers && Number.isFinite(caster.layers.mask) ? caster.layers.mask : 1;
  const signatures = [];
  for (const material of materials) {
    if (!material || !material.uuid) continue;
    // Invisible materials mint no depth program — no signature either, so a later
    // visibility flip produces a fresh unstaged signature instead of inheriting a mark.
    if (material.visible === false) continue;
    // Variant discriminants mirror getDepthMaterial's clone rules: a post-stage
    // mutation that swaps which depth program links (alphaTest gating map/alphaMap,
    // displacement, alphaToCoverage, clipShadows, side/shadowSide winding) re-keys the
    // signature so the caster re-stages instead of linking cold in a presented frame.
    const variant = casterDepthVariant(material);
    signatures.push(`${material.uuid}|${kind}|${morph}${custom}|ly:${layerMask}|${variant}|${lightSig}`);
  }
  return signatures;
}

/**
 * Casters under `subjects` whose depth variant was never staged under the live light
 * census. The caller pays the staging ceremony only when this returns non-empty; a
 * pass whose casters are all recorded skips it outright. Material identity is keyed by
 * uuid, so a mesh re-minted with a different material (attach job, skin swap) reports
 * unstaged again — a false 'ready' is the in-round depth-link brick, never trusted.
 */
export function collectUnstagedShadowCasters(renderer, subjects, lightingScene, lightSigOverride = undefined) {
  const casting = collectPotentialShadowCastSubjects(subjects);
  if (casting.length === 0) return [];
  const staged = _stagedDepthSignatures.get(renderer);
  if (!staged || staged.size === 0) return casting;
  const lightSig = typeof lightSigOverride === 'string' ? lightSigOverride : lightCensusSignature(lightingScene);
  const unstaged = [];
  for (const caster of casting) {
    const signatures = casterDepthSignatures(caster, lightSig);
    if (signatures.length === 0) continue;
    if (signatures.some((signature) => !staged.has(signature))) unstaged.push(caster);
  }
  return unstaged;
}

function markCastersDepthStaged(renderer, casting, lightingScene, drawnDepthObjects = null, camera = null, lightSigOverride = undefined) {
  if (!renderer || !casting || casting.length === 0) return;
  let staged = _stagedDepthSignatures.get(renderer);
  if (!staged) {
    staged = new Set();
    _stagedDepthSignatures.set(renderer, staged);
  }
  const lightSig = typeof lightSigOverride === 'string' ? lightSigOverride : lightCensusSignature(lightingScene);
  for (const caster of casting) {
    // Only signatures whose depth draw the pass actually observed: marking a caster
    // that never drew would certify readiness never proved — when its material mutates
    // into a drawable state its variant would link inside a presented frame. The one
    // undrawn class the signature can express is a layer-set mismatch vs the stage
    // camera (the pass tests object.layers against the live camera's layers): that
    // attempted state is marked under its mask term and a layer flip re-keys it.
    // Anything else undrawn stays unmarked — under-marking only re-runs the cheap rescan.
    if (drawnDepthObjects && !drawnDepthObjects.has(caster)) {
      const layerMiss = camera && camera.layers && caster.layers
        && !caster.layers.test(camera.layers);
      if (!layerMiss) continue;
    }
    for (const signature of casterDepthSignatures(caster, lightSig)) staged.add(signature);
    writeDepthMark(caster, lightSig);
  }
}

export function compileShadowDepthPipelines(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const camera = options.camera;
  const subjects = options.subjects;
  const captureObjectHome = options.captureObjectHome;
  const restoreObjectHome = options.restoreObjectHome;
  const shadowMap = renderer && renderer.shadowMap;
  const forceEnable = options.forceEnable === true;
  if (!shadowMap || !light) {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }
  const previousEnabled = shadowMap.enabled;
  const previousNeedsUpdate = shadowMap.needsUpdate;
  const previousAutoUpdate = shadowMap.autoUpdate;
  const previousCastShadow = light.castShadow;
  if (!forceEnable && (previousEnabled !== true || previousCastShadow !== true)) {
    return { skipped: true, reason: 'directional shadows inactive', subjects: 0 };
  }
  // The caster census walks every subject's subtree — run it only after the cheap
  // flag checks above have ruled the pass out entirely.
  const casting = collectPotentialShadowCastSubjects(subjects);
  // Zero casters means zero depth programs to link — the staging ceremony (whole-scene
  // light traverse, reparenting, census render) is net-zero work then, even under
  // forceEnable whose enabled flag restores in finally anyway.
  if (casting.length === 0) {
    return { skipped: true, reason: 'no shadow-casting subjects', subjects: 0 };
  }
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
  // Query-side unstaged checks read the light census off the LIVE scene. The mark must
  // take the same census here — before the reparent loop strips every non-key light into
  // staging — or staged.has() can never hit and every later pass re-runs the ceremony.
  const markLightSig = typeof options.lightSigOverride === 'string'
    ? options.lightSigOverride
    : (lightingScene ? lightCensusSignature(lightingScene) : '');
  if (typeof renderer.render !== 'function' || !camera
      || typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function') {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }

  const THREE = options.THREE;
  if (!THREE || typeof THREE.Scene !== 'function') {
    return { skipped: true, reason: 'THREE.Scene unavailable for depth staging', subjects: 0 };
  }
  const stagedKeyLight = admissionKeyLight(renderer, light, THREE);
  if (!stagedKeyLight) {
    return { skipped: true, reason: 'directional shadow clone unavailable', subjects: 0 };
  }
  const staging = new THREE.Scene();
  staging.name = options.stagingName || 'SF_AdmissionShadowDepthPipelines';
  const colorOverride = admissionOverrideMaterial(THREE);
  if (colorOverride) staging.overrideMaterial = colorOverride;
  const homes = casting.map((root) => captureObjectHome(root));
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
  const drawnDepthObjects = new Set();
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
      if (depthDraw && drawn) {
        drawnDepthObjects.add(drawn);
        if (typeof drawn.name === 'string' && drawn.name) drawnNames.add(drawn.name);
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
    }
    // A standalone WebGLShadowMap.render has no live render state — WebGLProgram.setProgram
    // dereferences currentRenderState.state.lights and throws — and any variant it does
    // link folds a stale lights/shadow state into the program key, so the real frame still
    // compiles its own variant on first draw. The depth admission must run inside a real
    // renderer.render: staging carries the admitted casters plus the key light, the
    // one-shot needsUpdate flags force the shadow pass while autoUpdate stays off, and
    // the color side draws into a tiny scratch target so nothing reaches the screen.
    if (typeof staging.add === 'function') staging.add(stagedKeyLight);
    if (stagedKeyLight.target && stagedKeyLight.target.isObject3D === true) {
      staging.add(stagedKeyLight.target);
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
    // The shadow pass iterates this subset instead of scanning the global caster
    // registry with an ancestor-membership walk per entry.
    if (staging.userData) staging.userData.sfShadowCastSubset = new Set(casting);
    if (typeof staging.updateMatrixWorld === 'function') staging.updateMatrixWorld(true);
    shadowMap.needsUpdate = true;
    if (stagedKeyLight.shadow) stagedKeyLight.shadow.needsUpdate = true;
    renderer.render(staging, camera);
    markCastersDepthStaged(renderer, casting, lightingScene, drawnDepthObjects, camera, markLightSig);
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
    shadowMap.enabled = previousEnabled;
    shadowMap.needsUpdate = previousNeedsUpdate;
    shadowMap.autoUpdate = previousAutoUpdate;
    for (const restore of restoreCasters) restore();
    restoreVisibility();
    for (const home of stagedLightHomes) restoreObjectHome(home);
    for (const home of homes) restoreObjectHome(home);
    if (typeof staging.clear === 'function') staging.clear();
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
  }
}

export function armAdmissionShadows(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const shadowMap = renderer && renderer.shadowMap;
  if (!shadowMap || !light || options.enabled !== true) return () => {};
  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = light.castShadow;
  const previousNeedsUpdate = light.shadow ? light.shadow.needsUpdate : undefined;
  shadowMap.enabled = true;
  light.castShadow = true;
  return () => {
    shadowMap.enabled = previousEnabled;
    light.castShadow = previousCastShadow;
    if (light.shadow && previousNeedsUpdate !== undefined) light.shadow.needsUpdate = previousNeedsUpdate;
  };
}

/**
 * A burst-scoped depth-staging session: consecutive promote arms share ONE staging
 * scene + census render instead of re-paying the reparent/warm/restore ceremony per
 * arm. The live scene's lights are CLONED into staging (arms hold it across
 * presents — borrowed lights would blank live lighting); program keys bake type
 * counts + fog, not identity, so clone proxies key identically to live draws.
 * Invalidate on a light-census-signature change or shadow disable; always close()
 * when the drain empties.
 */
export function createShadowDepthStagingSession(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const camera = options.camera;
  const lightingScene = options.lightingScene || null;
  const THREE = options.THREE;
  const captureObjectHome = options.captureObjectHome;
  const restoreObjectHome = options.restoreObjectHome;
  if (!renderer || !camera || !THREE || typeof THREE.Scene !== 'function'
      || typeof renderer.render !== 'function' || !lightingScene
      || typeof lightingScene.traverse !== 'function'
      || typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function') {
    return null;
  }
  const shadowMap = renderer.shadowMap;
  const stagedKeyLight = admissionKeyLight(renderer, light, THREE);
  if (!stagedKeyLight) return null;
  const stagedLights = [];
  lightingScene.traverse((object) => {
    if (object && object.isLight === true && object !== light) stagedLights.push(object);
  });
  const staging = new THREE.Scene();
  staging.name = options.stagingName || 'SF_ShadowDepthStagingSession';
  const colorOverride = admissionOverrideMaterial(THREE);
  if (colorOverride) staging.overrideMaterial = colorOverride;
  if (lightingScene.fog) staging.fog = lightingScene.fog;
  const restoreVisibility = revealSubjectForCompile(staging);
  staging.add(stagedKeyLight);
  if (stagedKeyLight.target && stagedKeyLight.target.isObject3D === true) {
    staging.add(stagedKeyLight.target);
  }
  for (const sceneLight of stagedLights) {
    const clone = typeof sceneLight.clone === 'function' ? sceneLight.clone() : null;
    if (!clone) continue;
    if (sceneLight.target && sceneLight.target.isObject3D === true && clone.target) {
      // clone() aliases the source target — give the clone its own so the live
      // target object never leaves the scene across presents.
      const targetClone = new THREE.Object3D();
      targetClone.position.copy(sceneLight.target.position);
      clone.target = targetClone;
      staging.add(targetClone);
    }
    staging.add(clone);
  }
  const previousTarget = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
  const scratch = admissionScratchTarget(THREE);
  if (scratch && typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(scratch);
  // Per-slice capture state — the wrapper records drawn objects for the slice
  // currently rendering; close() reports the union for diagnostics.
  let currentSliceDrawn = null;
  const drawnNames = new Set();
  const drawnKeys = new Set();
  const programCacheKeys = new Set();
  const drawnDepthObjects = new Set();
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
      const depthDraw = args[1] == null;
      if (depthDraw && drawn) {
        if (currentSliceDrawn) currentSliceDrawn.add(drawn);
        drawnDepthObjects.add(drawn);
        if (typeof drawn.name === 'string' && drawn.name) drawnNames.add(drawn.name);
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
      } else missingProgramBindings += 1;
      return result;
    };
  }
  try {
    staging.updateMatrixWorld(true);
    // Same census trick as the single-shot compile: WebGLShadowMap runs before
    // setupLights(), so a never-rendered staging scene bakes empty light counts into
    // depth program keys. One lights-only render populates this scene's persistent
    // render state for the whole session.
    const censusRenderEnabled = shadowMap.enabled;
    shadowMap.enabled = false;
    renderer.render(staging, camera);
    shadowMap.enabled = censusRenderEnabled;
  } catch (error) {
    if (originalRenderBufferDirect) renderer.renderBufferDirect = originalRenderBufferDirect;
    restoreVisibility();
    if (typeof staging.clear === 'function') staging.clear();
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
    console.warn('[render] shadow depth staging session warm-up failed', error);
    return null;
  }
  let closed = false;
  return {
    get lightSig() { return options.lightSig || ''; },
    /** Stage one root slice: reparent casters, render, mark observed draws, restore. */
    slice(casting) {
      if (closed || !Array.isArray(casting) || casting.length === 0) {
        return { skipped: closed, subjects: 0 };
      }
      const homes = casting.map((root) => captureObjectHome(root));
      const restoreCasters = casting.map((root) => revealSubjectForCompile(root));
      const castShadowRestore = [];
      for (const object of casting) {
        if (object.castShadow !== true) {
          castShadowRestore.push(object);
          object.castShadow = true;
        }
      }
      const sliceDrawn = new Set();
      currentSliceDrawn = sliceDrawn;
      const previousNeedsUpdate = shadowMap.needsUpdate;
      try {
        for (const root of casting) staging.add(root);
        if (staging.userData) staging.userData.sfShadowCastSubset = new Set(casting);
        staging.updateMatrixWorld(true);
        shadowMap.needsUpdate = true;
        if (stagedKeyLight.shadow) stagedKeyLight.shadow.needsUpdate = true;
        renderer.render(staging, camera);
        markCastersDepthStaged(renderer, casting, lightingScene, sliceDrawn, camera, options.lightSig);
        return { skipped: false, subjects: casting.length };
      } finally {
        shadowMap.needsUpdate = previousNeedsUpdate;
        currentSliceDrawn = null;
        for (const root of casting) {
          if (root && root.parent === staging) staging.remove(root);
        }
        for (const object of castShadowRestore) object.castShadow = false;
        for (const restore of restoreCasters) restore();
        for (const home of homes) restoreObjectHome(home);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (originalRenderBufferDirect) renderer.renderBufferDirect = originalRenderBufferDirect;
      restoreVisibility();
      if (typeof staging.clear === 'function') staging.clear();
      if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
      return {
        subjects: drawnDepthObjects.size,
        programCacheKeys: [...programCacheKeys].sort(),
        programBindingFailures: missingProgramBindings > 0
          ? [`shadow-depth-session:${missingProgramBindings}/${renderedMaterials}:unprepared-program-binding`]
          : [],
        stagedNames: [...drawnNames]
          .filter((name) => /CommonRockInstances|LivingHull|InstancePool|Wreck_Batch/.test(name)),
        stagedKeys: [...drawnKeys],
      };
    },
  };
}
