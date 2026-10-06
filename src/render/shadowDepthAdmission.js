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
  const held = _depthStageSessions.get(renderer);
  if (held) {
    held.session.close();
    _depthStageSessions.delete(renderer);
  }
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

// Stepped twin of the visit() predicate above: an explicit-stack DFS in the same
// pre-order traverse() order (children pushed reversed so the leftmost pops
// next), identical drawable/geometry/userData/material verdicts and nodeBudget
// debit — the boot cook's depth ceremony drives this instead of paying one
// atomic subtree census per pass.
export function* collectPotentialShadowCastSubjectsSteps(roots, nodeBudget = null, yieldEvery = 512) {
  const list = Array.isArray(roots) ? roots : [roots];
  const casting = [];
  const seen = new Set();
  const every = Math.max(1, Math.floor(Number(yieldEvery) || 1));
  let visited = 0;
  for (const root of list) {
    if (!root) continue;
    const stack = [root];
    while (stack.length > 0) {
      const object = stack.pop();
      if (nodeBudget && (nodeBudget.remaining -= 1) < 0) throw _walkBudgetAbort;
      if (object && !seen.has(object)) {
        const drawable = object.isMesh === true
          || object.isSkinnedMesh === true
          || object.isInstancedMesh === true;
        if (drawable) {
          seen.add(object);
          if (!('geometry' in object && object.geometry == null)) {
            const ud = object.userData || {};
            if (!(ud.spacefaceNoShadow === true
              || ud.sharedContactShadow === true
              || ud.authoredReadableFallbackLayer === true)) {
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              if (materials.some(materialCanCastShadow)) casting.push(object);
            }
          }
        }
      }
      const children = object && object.children;
      if (children) {
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
      if (++visited % every === 0) yield;
    }
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
// Re-signs accumulate dead strings for the renderer's lifetime otherwise — the
// set has only ever had .add called on it. FIFO-evict the oldest entry once the
// map hits the cap; an evicted-but-live signature just re-stages once.
const STAGED_DEPTH_SIGNATURE_CAP = 65536;

function stagedDepthSignatureAdd(staged, signature) {
  if (staged.size >= STAGED_DEPTH_SIGNATURE_CAP) {
    staged.delete(staged.values().next().value);
  }
  staged.add(signature);
}

// Per-mesh staged certificate, written at mark time next to the signature entries.
// The presented-frame policy collect reads this tuple instead of re-minting signature
// strings — it carries the identical discriminant set (material uuids + interned
// variant bits, object kind, morph census, custom depth material, layer mask, light
// census) so a mismatch is exactly a re-minted signature: the collect proves
// staged-vs-unstaged with zero per-caster allocs.
const DEPTH_MARK_KEY = 'sfDepthMark';

function cameraLayersMask(camera) {
  return camera && camera.layers && Number.isFinite(camera.layers.mask)
    ? camera.layers.mask : null;
}

function writeDepthMark(caster, lightSig, camera = null) {
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
    ma: geometry && geometry.morphAttributes ? geometry.morphAttributes : null,
    mn: geometry && geometry.morphAttributes ? Object.keys(geometry.morphAttributes).length : 0,
    c: caster.customDepthMaterial || null,
    ly: caster.layers && Number.isFinite(caster.layers.mask) ? caster.layers.mask : 1,
    // The staged pass draws through this camera — an undrawn layerMiss mark is
    // only valid while the render camera's mask is unchanged; a camera-side
    // mask flip would otherwise leave a never-linked caster certified staged.
    cl: cameraLayersMask(camera),
    k: kind,
    a: mats,
  };
}

/**
 * The mesh's depth-staged certificate still describes its live discriminant set: every
 * field mismatch is a re-minted signature, i.e. genuinely unstaged. Mirrors
 * casterDepthSignatures' inputs — a material mutation (in-place or swap), morph
 * census change, custom depth material swap, layer mask flip, or a light-census
 * drift all re-collect the caster. uuid strings compare by value; variant strings are
 * interned per material so a repeat lookup is a reference hit. Geometry identity is
 * deliberately absent: the depth program key bakes no geometry term, so an in-place
 * swap that keeps the morph census re-links nothing — the ma/mn terms cover the
 * program-relevant change.
 */
export function casterDepthMarkCurrent(caster, lightSig, camera = null) {
  const mark = caster && caster.userData ? caster.userData[DEPTH_MARK_KEY] : null;
  if (!mark || mark.l !== lightSig) return false;
  const geometry = caster.geometry || null;
  if (mark.ma !== (geometry && geometry.morphAttributes ? geometry.morphAttributes : null)) return false;
  if (mark.c !== (caster.customDepthMaterial || null)) return false;
  const layerMask = caster.layers && Number.isFinite(caster.layers.mask) ? caster.layers.mask : 1;
  if (mark.ly !== layerMask) return false;
  if (mark.cl !== cameraLayersMask(camera)) return false;
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
// The sentinel is a string minted where callers expect an array — a `length>0`
// or spread-style read would misinterpret it, so the only sound test is this
// identity predicate.
export function isUnstagedCollectOverCover(value) {
  return value === UNSTAGED_COLLECT_OVER_COVER;
}
const _walkBudgetAbort = new Error('sf-shadow-collect-node-budget');

export function collectUnstagedShadowCastersFlag(roots, lightSig, nodeBudget = null, camera = null) {
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
    if (!casterDepthMarkCurrent(caster, lightSig, camera)) unstaged.push(caster);
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

// Stepped twin of lightCensusSignature: explicit-stack DFS emitting an
// identical signature — the count map is order-insensitive (sorted at mint), so
// any traversal order yields the same string. Ancestor visibility rides the
// stack entries (a light under an invisible subtree doesn't reach
// projectObject, same as the sync ancestor walk). The epoch-memoized reader
// drives this across presented beats instead of paying the atomic scene
// traverse inside whichever leg asked first.
export function* lightCensusSignatureSteps(lightingScene, yieldEvery = 512) {
  const counts = new Map();
  const every = Math.max(1, Math.floor(Number(yieldEvery) || 1));
  let visited = 0;
  const stack = [[lightingScene, true]];
  while (stack.length > 0) {
    const entry = stack.pop();
    const object = entry && entry[0];
    const ancestorVisible = entry[1];
    if (!object) continue;
    const nodeVisible = ancestorVisible && object.visible !== false;
    if (object.isLight === true && nodeVisible) {
      const layersMask = object.layers && Number.isFinite(object.layers.mask)
        ? object.layers.mask : 1;
      const key = `${object.type || 'Light'}:${layersMask}:${object.castShadow === true ? 1 : 0}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const children = object.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push([children[i], nodeVisible]);
    }
    if (++visited % every === 0) yield;
  }
  const parts = [...counts.entries()].map(([k, n]) => `${k}x${n}`).sort();
  const fog = lightingScene && lightingScene.fog;
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
  if (cached && cached.bits.length === bits.length
      && cached.bits.every((bit, i) => bit === bits[i])) return cached.variant;
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
export function collectUnstagedShadowCasters(renderer, subjects, lightingScene, lightSigOverride = undefined, nodeBudget = null) {
  let casting;
  try {
    casting = collectPotentialShadowCastSubjects(subjects, nodeBudget);
  } catch (error) {
    if (error === _walkBudgetAbort) return UNSTAGED_COLLECT_OVER_COVER;
    throw error;
  }
  if (casting === UNSTAGED_COLLECT_OVER_COVER) return UNSTAGED_COLLECT_OVER_COVER;
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
    for (const signature of casterDepthSignatures(caster, lightSig)) {
      stagedDepthSignatureAdd(staged, signature);
    }
    writeDepthMark(caster, lightSig, camera);
  }
}

export function compileShadowDepthPipelines(options = {}) {
  // syncDrive: a synchronous caller gains nothing from sub-batched slices — run
  // one atomic reparent→render→restore pass like before (yields unwind inline).
  const iterator = compileShadowDepthPipelinesSteps({ ...options, syncDrive: true });
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

// lightSig-keyed staging sessions: consecutive drives under an unchanged
// census share one staging scene + cloned light set + warmed render state
// instead of re-paying mint/census-render/restore per leg. WeakMap-keyed on
// renderer so a dead renderer releases the session with it; entries close on
// signature or census-epoch drift.
const _depthStageSessions = new WeakMap();

// The arm closes the held session once its drain empties; the next arm remints
// under the live census rather than staging under a stale light set.
export function closeShadowDepthStagingSession(renderer) {
  const held = _depthStageSessions.get(renderer);
  if (!held) return;
  _depthStageSessions.delete(renderer);
  try { held.session.close(); } catch (_) { /* best effort */ }
}

// Stepped twin: the caster census, the staged-lights census and the mark
// signature census (one fused whole-scene walk) yield per 512 visited nodes,
// so async drives pace the ceremony under their slice clocks. Everything from
// the reparent captures to the finally restore stays inside one synchronous
// window — a suspended generator must never leave live lights parked in
// staging or castShadow flags forced on the live scene.
export function* compileShadowDepthPipelinesSteps(options = {}) {
  const renderer = options.renderer;
  const light = options.light;
  const camera = options.camera;
  const subjects = options.subjects;
  const captureObjectHome = options.captureObjectHome;
  const restoreObjectHome = options.restoreObjectHome;
  const shadowMap = renderer && renderer.shadowMap;
  const forceEnable = options.forceEnable === true;
  if (!shadowMap || !light) {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0, aborted: true };
  }
  const previousEnabled = shadowMap.enabled;
  const previousCastShadow = light.castShadow;
  if (!forceEnable && (previousEnabled !== true || previousCastShadow !== true)) {
    return { skipped: true, reason: 'directional shadows inactive', subjects: 0, aborted: true };
  }
  // The caster census walks every subject's subtree — run it only after the cheap
  // flag checks above have ruled the pass out entirely. A driver minting retries
  // can hoist the light-independent collect to drive entry via precollectedCasting
  // so drift retries re-pay only the light census + session mint.
  const casting = options.precollectedCasting
    || (yield* collectPotentialShadowCastSubjectsSteps(subjects));
  // Zero casters means zero depth programs to link — the staging ceremony (whole-scene
  // light traverse, reparenting, census render) is net-zero work then, even under
  // forceEnable whose enabled flag restores in finally anyway.
  if (casting.length === 0) {
    return { skipped: true, reason: 'no shadow-casting subjects', subjects: 0, aborted: true };
  }
  // lightSigEpoch stamps the census epoch the caller's signature was minted under. A
  // light mutation landing inside any yield window below leaves stagedLights and the
  // claimed signature describing different scenes — the driver aborts and re-mints
  // rather than mark casters under a census the staged set doesn't satisfy.
  const lightSigEpoch = Number.isFinite(options.lightSigEpoch) ? options.lightSigEpoch : null;
  const censusStale = () => lightSigEpoch !== null && shadowCensusEpoch() !== lightSigEpoch;
  if (censusStale()) {
    return { skipped: true, reason: 'light-census-drifted-mid-pass', subjects: 0, stale: true };
  }
  // three bakes the rendered scene's light counts (numDirLights/numPointLights/…) and fog flags
  // into EVERY program key — including depth variants. The live scene runs 3 directional + 8
  // pooled point lights under FogExp2; a staging scene holding only the key light produces keys
  // no live draw can ever hit (the +21s LivingHull/StaticGroup/pool NOVELs). Stage the real
  // scene's full light set + fog so the linked keys are identical to live.
  const lightingScene = options.lightingScene || null;
  const lightSigOverride = typeof options.lightSigOverride === 'string' ? options.lightSigOverride : null;
  const stagedLights = [];
  // A live session under a caller-minted signature already carries the cloned
  // light set + warmed render state — the whole-scene census below only feeds
  // a fresh mint, so a reusable session skips the traverse entirely. The minted
  // key light is part of the session key: a drive for a different light under
  // an identical signature would otherwise stage the wrong key light.
  let heldSession = _depthStageSessions.get(renderer);
  const reusableSession = !!(heldSession && lightSigOverride !== null
    && heldSession.sig === lightSigOverride && heldSession.epoch === shadowCensusEpoch()
    && heldSession.light === light);
  // One stepped walk mints the staged-light set and — when no lightSigOverride
  // was supplied — the rendered-set signature terms the mark takes. It replaces
  // the two whole-scene traverses the sync caller paid (stagedLights +
  // lightCensusSignature) with one census of identical verdicts.
  const sigCounts = lightSigOverride === null ? new Map() : null;
  if (!reusableSession && lightingScene && typeof lightingScene.traverse === 'function') {
    const stack = [lightingScene];
    let censusVisited = 0;
    while (stack.length > 0) {
      const object = stack.pop();
      if (object && object.isLight === true) {
        if (object !== light) stagedLights.push(object);
        if (sigCounts) {
          let rendered = true;
          for (let node = object; node; node = node.parent) {
            if (node.visible === false) { rendered = false; break; }
          }
          if (rendered) {
            const layersMask = object.layers && Number.isFinite(object.layers.mask)
              ? object.layers.mask : 1;
            const key = `${object.type || 'Light'}:${layersMask}:${object.castShadow === true ? 1 : 0}`;
            sigCounts.set(key, (sigCounts.get(key) || 0) + 1);
          }
        }
      }
      const children = object && object.children;
      if (children) {
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
      if (++censusVisited % 512 === 0) {
        yield;
        if (censusStale()) {
          return { skipped: true, reason: 'light-census-drifted-mid-pass', subjects: 0, stale: true };
        }
      }
    }
  }
  // Query-side unstaged checks read the light census off the LIVE scene. The mark must
  // take the same census here — before the reparent loop strips every non-key light into
  // staging — or staged.has() can never hit and every later pass re-runs the ceremony.
  const markLightSig = lightSigOverride !== null ? lightSigOverride
    : (lightingScene
      ? (typeof lightingScene.traverse === 'function'
        ? `${lightingScene.fog ? (lightingScene.fog.isFogExp2 === true ? 'fx' : 'fs') : 'f0'}|${
          [...sigCounts.entries()].map(([k, n]) => `${k}x${n}`).sort().join('|')}`
        : 'l0|f0')
      // lightCensusSignature(null) mints 'l0|f0' — a null-scene mark that minted ''
      // would miss every staged entry at query time and churn withholds forever.
      : 'l0|f0');
  if (typeof renderer.render !== 'function' || !camera
      || typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function') {
    return { skipped: true, reason: 'shadow depth compiler unavailable', subjects: 0 };
  }

  const THREE = options.THREE;
  if (!THREE || typeof THREE.Scene !== 'function') {
    return { skipped: true, reason: 'THREE.Scene unavailable for depth staging', subjects: 0 };
  }
  // Last bail before the atomic slice — reparent/render/mark inside
  // session.slice() is yield-free, so a drift detected here is the final
  // chance to stay uncommitted. A stale abort also retires any held session:
  // its census is the same drifted one.
  if (censusStale()) {
    if (heldSession) {
      heldSession.session.close();
      _depthStageSessions.delete(renderer);
      heldSession = null;
    }
    return { skipped: true, reason: 'light-census-drifted-mid-pass', subjects: 0, stale: true };
  }
  // Session amortization: consecutive drives under an unchanged census share
  // the staging scene + cloned light set + warmed render state — each leg
  // slices its casters instead of re-paying mint + census render + restore per
  // drive. Signature or census-epoch drift closes and re-mints.
  if (heldSession && (heldSession.sig !== markLightSig
      || heldSession.epoch !== shadowCensusEpoch()
      || heldSession.light !== light)) {
    heldSession.session.close();
    _depthStageSessions.delete(renderer);
    heldSession = null;
  }
  if (!heldSession) {
    const session = createShadowDepthStagingSession({
      renderer,
      light,
      camera,
      lightingScene,
      THREE,
      captureObjectHome,
      restoreObjectHome,
      stagingName: options.stagingName,
      lightSig: markLightSig,
      stagedLights,
      collectDiagnostics: options.collectDiagnostics === true,
    });
    if (!session) {
      return { skipped: true, reason: 'shadow depth staging unavailable', subjects: 0, aborted: true };
    }
    heldSession = { session, sig: markLightSig, epoch: shadowCensusEpoch(), light };
    _depthStageSessions.set(renderer, heldSession);
  }
  let sliced;
  if (options.syncDrive === true || typeof heldSession.session.sliceSteps !== 'function') {
    sliced = heldSession.session.slice(casting, { forceEnable });
  } else {
    // Sub-batched slices: each ≤32-caster pass restores live state before the
    // yield, so a suspended drive never holds reparented casters or forced
    // castShadow flags — and a census drift between passes aborts cleanly.
    sliced = yield* heldSession.session.sliceSteps(casting, { forceEnable, stale: censusStale });
  }
  if (sliced.skipped === true) {
    return {
      skipped: true,
      reason: sliced.reason || 'shadow depth staging slice skipped',
      subjects: 0,
      ...(sliced.stale === true ? { stale: true } : {}),
      ...(sliced.aborted === true ? { aborted: true } : {}),
    };
  }
  return {
    skipped: false,
    subjects: casting.length,
    programCacheKeys: sliced.programCacheKeys || [],
    programBindingFailures: sliced.programBindingFailures || [],
    // Diagnostic: which named instanced families actually drew in the staged pass — a NOVEL
    // link on a listed name proves the program key drifted, an absent name proves it never drew.
    stagedNames: sliced.stagedNames || [],
    stagedKeys: sliced.stagedKeys || [],
  };
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
      || typeof renderer.render !== 'function'
      || typeof captureObjectHome !== 'function' || typeof restoreObjectHome !== 'function'
      || (lightingScene ? typeof lightingScene.traverse !== 'function'
        : !Array.isArray(options.stagedLights))) {
    return null;
  }
  const shadowMap = renderer.shadowMap;
  const stagedKeyLight = admissionKeyLight(renderer, light, THREE);
  if (!stagedKeyLight) return null;
  const stagedLights = [];
  // A caller that already walked the light census (the stepped drive's own
  // yieldable traverse) hands its set in — the mint then never re-walks the
  // scene.
  if (Array.isArray(options.stagedLights)) {
    for (const sceneLight of options.stagedLights) {
      if (sceneLight && sceneLight.isLight === true && sceneLight !== light) stagedLights.push(sceneLight);
    }
  } else {
    lightingScene.traverse((object) => {
      if (object && object.isLight === true && object !== light) stagedLights.push(object);
    });
  }
  const staging = new THREE.Scene();
  staging.name = options.stagingName || 'SF_ShadowDepthStagingSession';
  const colorOverride = admissionOverrideMaterial(THREE);
  if (colorOverride) staging.overrideMaterial = colorOverride;
  if (lightingScene && lightingScene.fog) staging.fog = lightingScene.fog;
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
  // Draw-capture is installed only inside slice() — a session held across
  // drives must never tax live draws with the binding hook. The name/key sets
  // are diagnostics-only: without collectDiagnostics a session just counts
  // draws (and keeps the programCacheKeys contract callers read).
  const collectDiagnostics = options.collectDiagnostics === true;
  const drawnNames = collectDiagnostics ? new Set() : null;
  const drawnKeys = collectDiagnostics ? new Set() : null;
  const programCacheKeys = new Set();
  // Draw uuids, not live Object3D refs — a held session must not pin a staged
  // caster's JS tree for its whole lifetime when only the count is ever read.
  const drawnDepthObjects = collectDiagnostics ? new Set() : null;
  let drawnDepthCount = 0;
  let renderedMaterials = 0;
  let missingProgramBindings = 0;
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
    // The main render path re-binds its own target each presented frame; the
    // session re-binds scratch inside every slice instead of holding it.
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
  } catch (error) {
    restoreVisibility();
    if (typeof staging.clear === 'function') staging.clear();
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
    // The staged draw's failure propagates like the single-shot compile's — a
    // caller must see the render fault, not a silent deferral.
    throw error;
  }
  let closed = false;
  /** Stage one root slice: reparent casters, render, mark observed draws, restore. */
  const runSlice = (casting, sliceOpts = null) => {
      if (closed) {
        return { skipped: true, reason: 'session-closed-mid-drive', subjects: 0, aborted: true };
      }
      if (!Array.isArray(casting) || casting.length === 0) {
        return { skipped: false, subjects: 0 };
      }
      // Without forceEnable the render runs under the live shadowMap.enabled —
      // disabled draws nothing, so zero marks land: the drive must not turn an
      // un-run leg into an undrawable verdict.
      if ((!sliceOpts || sliceOpts.forceEnable !== true)
          && (!shadowMap || shadowMap.enabled !== true)) {
        return { skipped: true, reason: 'shadow-map-disabled', subjects: 0, aborted: true };
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
      const sliceNames = new Set();
      const sliceKeys = new Set();
      const slicePrograms = new Set();
      let sliceRendered = 0;
      let sliceMissing = 0;
      const originalRenderBufferDirect = typeof renderer.renderBufferDirect === 'function'
        ? renderer.renderBufferDirect
        : null;
      if (originalRenderBufferDirect) {
        renderer.renderBufferDirect = function captureShadowProgramBinding(...args) {
          const result = originalRenderBufferDirect.apply(this, args);
          renderedMaterials += 1;
          sliceRendered += 1;
          const drawn = args[4];
          const depthDraw = args[1] == null;
          if (depthDraw && drawn) {
            sliceDrawn.add(drawn);
            drawnDepthCount += 1;
            if (drawnDepthObjects) drawnDepthObjects.add(drawn.uuid);
            if (typeof drawn.name === 'string' && drawn.name) {
              if (drawnNames) drawnNames.add(drawn.name);
              sliceNames.add(drawn.name);
            }
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
            slicePrograms.add(String(key));
            if (depthDraw && drawn && drawnKeys && /CommonRockInstances|LivingHull|Wreck_Batch/.test(drawn.name || '')) {
              const source = drawn.material;
              const k = `${drawn.name}|key:${String(key)}|side:${source && source.side}|shadowSide:${source && source.shadowSide}|map:${!!(source && source.map)}|depthType:${material && material.type}`;
              drawnKeys.add(k);
              sliceKeys.add(k);
            }
          } else {
            missingProgramBindings += 1;
            sliceMissing += 1;
          }
          return result;
        };
      }
      const previousNeedsUpdate = shadowMap.needsUpdate;
      const previousEnabled = shadowMap.enabled;
      const slicePrevTarget = typeof renderer.getRenderTarget === 'function'
        ? renderer.getRenderTarget() : null;
      if (scratch && typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(scratch);
      try {
        if (sliceOpts && sliceOpts.forceEnable === true) shadowMap.enabled = true;
        // Re-seat the staged key light per slice: the live rig re-poses per
        // quantized follow cell and the ortho extent re-derives per sector, so a
        // session minted arms ago would otherwise render under a frozen ortho —
        // casters inside the live shadow volume but outside the stale one could
        // never mark. Same clone, ~10 field copies + one projection rebuild.
        admissionKeyLight(renderer, light, THREE);
        for (const root of casting) staging.add(root);
        if (staging.userData) staging.userData.sfShadowCastSubset = new Set(casting);
        staging.updateMatrixWorld(true);
        shadowMap.needsUpdate = true;
        if (stagedKeyLight.shadow) stagedKeyLight.shadow.needsUpdate = true;
        renderer.render(staging, camera);
        markCastersDepthStaged(renderer, casting, lightingScene, sliceDrawn, camera, options.lightSig);
        const failures = [];
        if (casting.length > 0 && !originalRenderBufferDirect) {
          failures.push(`shadow-depth:${casting.length}:render-buffer-direct-unavailable`);
        } else if (sliceMissing > 0) {
          failures.push(`shadow-depth:${sliceMissing}/${sliceRendered}:unprepared-program-binding`);
        }
        return {
          skipped: false,
          subjects: casting.length,
          programCacheKeys: [...slicePrograms].sort(),
          programBindingFailures: failures,
          stagedNames: [...sliceNames]
            .filter((name) => /CommonRockInstances|LivingHull|InstancePool|Wreck_Batch/.test(name)),
          stagedKeys: [...sliceKeys],
        };
      } finally {
        if (originalRenderBufferDirect) renderer.renderBufferDirect = originalRenderBufferDirect;
        shadowMap.enabled = previousEnabled;
        shadowMap.needsUpdate = previousNeedsUpdate;
        if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(slicePrevTarget || null);
        for (const root of casting) {
          if (root && root.parent === staging) staging.remove(root);
        }
        for (const object of castShadowRestore) object.castShadow = false;
        for (const restore of restoreCasters) restore();
        for (const home of homes) restoreObjectHome(home);
      }
  };
  return {
    get lightSig() { return options.lightSig || ''; },
    slice: runSlice,
    /**
     * Stepped twin of slice(): ≤32 casters per sub-pass, each running the full
     * reparent→render→mark→restore cycle before the yield — a suspended drive
     * never holds reparented casters or forced castShadow flags across the gap,
     * and a census drift between passes aborts instead of staging under a
     * light set that no longer exists.
     */
    *sliceSteps(casting, sliceOpts = null) {
      // A closed session can't land marks — `aborted` keeps the driver from
      // rendering the undrawable verdict on a leg that never ran.
      if (closed) {
        return { skipped: true, reason: 'session-closed-mid-drive', subjects: 0, aborted: true };
      }
      if (!Array.isArray(casting) || casting.length === 0) {
        return { skipped: false, subjects: 0 };
      }
      const keys = new Set();
      const names = new Set();
      const sKeys = new Set();
      const failures = [];
      let subjects = 0;
      for (let i = 0; i < casting.length; i += 32) {
        if (sliceOpts && typeof sliceOpts.stale === 'function' && sliceOpts.stale()) {
          return { skipped: true, reason: 'light-census-drifted-mid-slice', subjects: 0, stale: true };
        }
        const r = runSlice(casting.slice(i, i + 32), sliceOpts);
        if (!r || r.skipped === true) return r || { skipped: true, subjects: 0 };
        subjects += r.subjects || 0;
        for (const k of r.programCacheKeys || []) keys.add(k);
        for (const n of r.stagedNames || []) names.add(n);
        for (const k of r.stagedKeys || []) sKeys.add(k);
        if (Array.isArray(r.programBindingFailures)) failures.push(...r.programBindingFailures);
        if (i + 32 < casting.length) yield;
      }
      return {
        skipped: false,
        subjects,
        programCacheKeys: [...keys].sort(),
        programBindingFailures: failures,
        stagedNames: [...names],
        stagedKeys: [...sKeys],
      };
    },
    close() {
      if (closed) return;
      closed = true;
      restoreVisibility();
      if (typeof staging.clear === 'function') staging.clear();
      if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
      return {
        subjects: drawnDepthObjects ? drawnDepthObjects.size : drawnDepthCount,
        programCacheKeys: [...programCacheKeys].sort(),
        programBindingFailures: missingProgramBindings > 0
          ? [`shadow-depth-session:${missingProgramBindings}/${renderedMaterials}:unprepared-program-binding`]
          : [],
        stagedNames: drawnNames ? [...drawnNames]
          .filter((name) => /CommonRockInstances|LivingHull|InstancePool|Wreck_Batch/.test(name)) : [],
        stagedKeys: drawnKeys ? [...drawnKeys] : [],
      };
    },
  };
}
