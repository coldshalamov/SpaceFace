// Self-contained bloom post-processor with a multi-scale downsample pyramid (ARCHITECTURE §2.4
// draw pipeline). Progressive downsample (full→½→¼) extracts brights; the composite samples the
// pyramid multi-scale so each level contributes low-frequency glow without a separate upsample RT
// or pass. Bright things *radiate* instead of producing a tight local glow.
//
// Pipeline (all custom ShaderMaterials on ONE shared fullscreen quad; NO three/addons, NO
// EffectComposer/FullScreenQuad):
//   pass 0  scene       rtScene            (renderer.render at full res, HalfFloat so emissive
//                                           additive brights can exceed 1.0)
//   pass 1  bright+down rtScene   -> down[0] (½)   bright-pass + 5-tap 2D downsample
//   pass 2  downsample  down[0]   -> down[1] (¼)   5-tap 2D downsample  [if levels>=2]
//   pass 3  composite   rtScene + multi-scale bloom (down[0]+w*down[1]) -> default framebuffer
//
// Structural note: the old additive upsample chain allocated a separate half-res RT and an extra
// fullscreen pass per frame. Multi-scale composite sampling (same idea as SpaceRenderGraph) keeps
// the wide halo via hardware bilinear on coarser pyramid levels and removes that RT + pass.
//
// COLOR-MANAGEMENT INVARIANT (the thing that makes this provably correct):
//   Bloom strength controls only selective spill. At bloomStrength == 0 (or when bloom is disabled)
//   the HDR scene still passes through the same canonical presentation composite. We achieve that by:
//     * leaving every RT texture in the default (linear) colorSpace — we never set sRGB on a RT,
//     * sampling RTs raw in custom shaders (three does NOT auto-decode/auto-tonemap a ShaderMaterial
//       texture in r160), and
//     * doing the ONE sRGB encode manually in the composite shader (renderer would normally do this
//       when drawing to screen, but a custom-shader full-screen pass bypasses it).
//   Tone mapping, exposure, grade, toe, vignette, grain, and the one sRGB encode all live in the
//   shared composite block below. A native straight render is therefore a degraded-capability or
//   context-loss fallback, never the ordinary bloom-off route.
//
// Cost: scene render + a handful of cheap fullscreen quads; the deepest pyramid levels are tiny (⅛-res
// blits are ~16px taps), so the wide halo costs little over the old single-blur. createBloom() is a
// drop-in replacement for renderer.render — the render layer calls bloom.render(scene, camera) instead.
import * as THREE from 'three';
import { recordPostRenderTargetAllocation } from './postTelemetry.js';
import { touchSubjectOnExactTarget } from './openingGpuAdmission.js';

const BALANCED_BLOOM_MAX_LEVELS = 2;
// A scene pass slower than this is a brick, not a frame. 200 ms is ~12 dropped frames at 60 Hz —
// far past anything ordinary rendering explains, so it never fires in healthy play.
const BRICK_WARN_MS = 200;
const BALANCED_BLOOM_MSAA_SAMPLES = 0;
export const POST_GRAIN_FPS = 12;
export const DEFAULT_BLOOM_STRENGTH = 0.52;
export const DEFAULT_POST_PRESENTATION = Object.freeze({ grain: 0, vignette: 0, grade: 0, toe: 0 });
// A linear-space toe of 0.020 encoded to an RGB floor around byte 35-42, not the documented
// perceptual target around byte 12. This calibrated value lands at roughly 11/12/14 after sRGB and
// retains the deliberately cool space-black bias without laying a grey-blue veil over the frame.
export const DEFAULT_CINEMATIC_TOE = 0.0039;
export const POST_TOE_TINT = Object.freeze([0.82, 0.92, 1.15]);

function linearToSrgbChannel(value) {
  const c = Math.max(0, Number(value) || 0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

/** Pure calibration seam used by focused tests and capture tooling. */
export function resolvePostToeFloorSrgb(toe = DEFAULT_CINEMATIC_TOE) {
  const amount = Math.max(0, Math.min(0.06, Number(toe) || 0));
  return POST_TOE_TINT.map((channel) => linearToSrgbChannel(channel * amount));
}

// Both post routes interpolate this exact block into their composite shader. Exposure, tone mapping,
// grade, toe, vignette, grain, and encoding are deliberately one implementation so route parity can
// be claimed when AO and bloom are neutralized. Grade and vignette are multiplicative, so black stays
// black until the one explicit, calibrated toe operation.
export const SPACE_POST_PRESENTATION_GLSL = /* glsl */`
  vec3 spaceAcesFilmic(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  vec3 spaceLinearToSrgb(vec3 c) {
    vec3 safe = max(c, vec3(0.0));
    return mix(1.055 * pow(safe, vec3(1.0 / 2.4)) - vec3(0.055),
      safe * 12.92, step(safe, vec3(0.0031308)));
  }

  float spaceGrainNoise(vec2 p) {
    return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
  }

  vec3 applySpacePostPresentation(
    vec3 color,
    vec2 uv,
    float gradeAmount,
    float toeAmount,
    float vignetteAmount
  ) {
    vec3 c = max(color, vec3(0.0));
    if (gradeAmount > 0.001) {
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowBalance = vec3(0.88, 0.98, 1.10);
      vec3 highlightBalance = vec3(1.10, 1.00, 0.88);
      vec3 graded = c * mix(shadowBalance, highlightBalance, smoothstep(0.10, 0.60, luma));
      float gradedLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = max(mix(vec3(gradedLuma), graded, 1.15), vec3(0.0));
      c = mix(c, graded, gradeAmount);
    }
    if (toeAmount > 0.0001) {
      float toeLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = 1.0 - smoothstep(0.0, 0.22, toeLuma);
      c += vec3(${POST_TOE_TINT.join(', ')}) * toeAmount * shadowMask;
    }
    if (vignetteAmount > 0.001) {
      vec2 d = uv - vec2(0.5);
      float dist = dot(d, d) * 2.2;
      float vig = 1.0 - smoothstep(0.25, 0.85, dist);
      c *= mix(1.0, vig, vignetteAmount);
    }
    return c;
  }

  vec3 composeSpacePostPresentation(
    vec3 scene,
    vec3 bloom,
    vec2 uv,
    vec2 fragCoord,
    float exposure,
    float acesAmount,
    float gradeAmount,
    float toeAmount,
    float vignetteAmount,
    float grainAmount,
    float grainFrame
  ) {
    vec3 hdr = max(scene, vec3(0.0)) * exposure;
    vec3 color = mix(clamp(hdr, 0.0, 1.0), spaceAcesFilmic(hdr), acesAmount);
    color = applySpacePostPresentation(max(color + max(bloom, vec3(0.0)), vec3(0.0)),
      uv, gradeAmount, toeAmount, vignetteAmount);
    vec3 srgb = spaceLinearToSrgb(color);
    if (grainAmount > 0.001) {
      float luma = dot(srgb, vec3(0.2126, 0.7152, 0.0722));
      vec2 grainCell = fragCoord * 0.5 + vec2(grainFrame * 17.0, grainFrame * 31.0);
      float noise = spaceGrainNoise(grainCell) - 0.5;
      srgb += noise * grainAmount * (0.25 + 0.75 * (1.0 - luma)) * 0.10;
    }
    return clamp(srgb, 0.0, 1.0);
  }
`;

/**
 * Resolve the player's bloom controls and an authored sector post profile into the exact values
 * consumed by both post-processors. Pure and allocation-only: callers may use it in tests and on
 * settings/sector transitions without needing a renderer or mutating either input.
 */
export function resolveEffectiveSectorPost(video = {}, sectorPost = null, fallbacks = {}) {
  const settings = video && typeof video === 'object' ? video : {};
  const post = sectorPost && typeof sectorPost === 'object' ? sectorPost : {};
  const defaults = fallbacks && typeof fallbacks === 'object' ? fallbacks : {};

  const fallbackStrength = Number.isFinite(defaults.bloomStrength)
    ? Math.max(0, Math.min(1, defaults.bloomStrength))
    : DEFAULT_BLOOM_STRENGTH;
  let bloomStrength = Number.isFinite(settings.bloomStrength)
    ? settings.bloomStrength
    : fallbackStrength;
  // Legacy profiles used a 0..2 slider. Fold them onto the current 0..1 contract exactly once.
  if (bloomStrength > 1) bloomStrength *= 0.5;
  bloomStrength = Math.max(0, Math.min(1, bloomStrength));

  const rawScale = Number(post.bloomStrengthScale);
  const strengthScale = post.bloomStrengthScale != null && Number.isFinite(rawScale) && rawScale >= 0
    ? rawScale
    : 1;
  const fallbackThreshold = Number.isFinite(defaults.bloomThreshold) ? defaults.bloomThreshold : 1;
  const bloomThreshold = Number.isFinite(settings.bloomThreshold)
    ? settings.bloomThreshold
    : fallbackThreshold;
  const rawBias = Number(post.bloomThresholdBias);
  const thresholdBias = post.bloomThresholdBias != null && Number.isFinite(rawBias) ? rawBias : 0;

  const playerExposure = Number.isFinite(settings.exposure) ? settings.exposure : undefined;
  const sectorExposure = finiteNumber(post.exposure);
  const fallbackExposure = finiteNumber(defaults.exposure);
  const presentation = (key) => {
    const authored = finiteNumber(post[key]);
    if (authored !== undefined) return authored;
    const player = finiteNumber(settings[key]);
    if (player !== undefined) return player;
    return finiteNumber(defaults[key]);
  };

  return {
    bloom: typeof settings.bloom === 'boolean' ? settings.bloom : defaults.bloom,
    bloomStrength: Math.max(0, Math.min(1, bloomStrength * strengthScale)),
    bloomThreshold: Math.max(0, bloomThreshold + thresholdBias),
    exposure: playerExposure !== undefined
      ? playerExposure
      : (sectorExposure !== undefined ? sectorExposure : fallbackExposure),
    acesToneMapping: settings.acesToneMapping !== false,
    grade: presentation('grade'),
    vignette: presentation('vignette'),
    toe: presentation('toe'),
    grain: presentation('grain'),
  };
}

export function resolvePostPresentation(options = {}) {
  return Object.freeze({
    grain: clamp01(options.grain, DEFAULT_POST_PRESENTATION.grain),
    vignette: clamp01(options.vignette, DEFAULT_POST_PRESENTATION.vignette),
    grade: clamp01(options.grade, DEFAULT_POST_PRESENTATION.grade),
    toe: clampRange(options.toe, DEFAULT_POST_PRESENTATION.toe, 0, 0.06),
  });
}

function clamp01(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function clampRange(value, fallback, lo, hi) {
  return Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
}

function finiteNumber(value) {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
// Multi-scale pyramid energy runs hotter than a single separable blur; composite multiplies by
// this before uStrength scales the halo perceptually (0.02 ≈ subtle, 0.52 ≈ default).
const BLOOM_PYRAMID_NORM = 1.5;

/**
 * Compile one Object3D subtree against the exact output target used by the live renderer.
 *
 * Three.js includes the active render target's output color space in its shader-program key. A
 * screen-target compile therefore does not prepare the linear-HDR variants used by the bloom scene
 * pass. Keep target selection around compileAsync so authored assets cannot appear "ready" while
 * their first real HDR frame still has to synchronously compile on the driver.
 */
export async function compileScenePipelinesForRenderTarget(
  renderer, renderTarget, subject, camera, lightingScene = subject,
) {
  if (!renderer || typeof renderer.compileAsync !== 'function') {
    return { skipped: true, reason: 'compileAsync unavailable' };
  }
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  try {
    renderer.setRenderTarget(renderTarget || null);
    const admission = await compilePipelinesContextSafe(
      renderer, subject, camera, lightingScene || subject,
    );
    if (admission && admission.contextLost) {
      return {
        skipped: true,
        reason: admission.reason,
        contextLost: true,
      };
    }
    return {
      skipped: false,
      programCount: Array.isArray(renderer.info && renderer.info.programs)
        ? renderer.info.programs.length
        : null,
    };
  } finally {
    renderer.setRenderTarget(previousTarget || null);
  }
}

/**
 * Three's compileAsync() owns an internal readiness timer that cannot be cancelled. If a WebGL
 * context is lost while that timer is alive, it can resume after restoration and call
 * glGetProgramiv() with program handles from the dead context. Use the same compile/isReady contract
 * for real WebGLRenderer instances, but own the timer so context loss can retire it immediately.
 * Lightweight render/test adapters keep using compileAsync() directly.
 */
/**
 * Shared shader-readiness batch.
 *
 * `renderer.compile()` under KHR_parallel_shader_compile only *starts* the driver link; the wait is
 * the poll on `program.isReady()`. Admitting one unit at a time therefore serializes waits that the
 * driver is perfectly willing to overlap. Measured on this project's Intel/ANGLE D3D11 baseline:
 * 238 opening admissions spent 0.12 s inside `renderer.compile()` and 25.8 s waiting, one program
 * at a time, with 31 units carrying 23.9 s of it.
 *
 * While a batch is open, `compilePipelinesContextSafe` hands its programs to the batch and suspends
 * instead of running its own timer. `drain()` polls the whole cohort once and settles every waiter
 * together, so the cohort costs roughly the slowest link rather than the sum of all of them. The
 * programs compiled, their cache keys, and the resulting picture are identical either way — only
 * the waiting is pooled.
 *
 * A caller that joins an open batch is still settled only after ITS programs are linked, because
 * `drain()` waits for every registered program before settling anyone. Early resolution is not
 * possible, so an unrelated compile that lands mid-batch is slowed, never made unsafe.
 */
let pipelineReadinessBatch = null;

export function beginScenePipelineReadinessBatch(renderer = null) {
  if (pipelineReadinessBatch) {
    pipelineReadinessBatch.depth += 1;
    return pipelineReadinessBatch.handle;
  }
  const batch = {
    depth: 1,
    accepting: true,
    programs: new Set(),
    waiters: [],
    gl: null,
    renderer: renderer || null,
    entryTarget: renderer && typeof renderer.getRenderTarget === 'function'
      ? renderer.getRenderTarget()
      : null,
    handle: null,
  };
  const settleAll = (result) => {
    const waiters = batch.waiters.splice(0);
    for (const waiter of waiters) {
      try { waiter(result); } catch (_) { /* a waiter's own cleanup must not strand the rest */ }
    }
  };
  batch.handle = {
    join(gl, programs, settle) {
      if (!batch.accepting) return false;
      if (gl && !batch.gl) batch.gl = gl;
      for (const program of programs) batch.programs.add(program);
      batch.waiters.push(settle);
      return true;
    },
    async drain(options = {}) {
      batch.accepting = false;
      const gl = batch.gl;
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 20000;
      const now = () => ((typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now());
      const started = now();
      while (batch.programs.size > 0) {
        if (gl && typeof gl.isContextLost === 'function' && gl.isContextLost()) {
          settleAll({ contextLost: true, reason: 'WebGL context lost during shader compilation' });
          return { contextLost: true, programs: 0 };
        }
        for (const program of batch.programs) {
          // Same guard the single-unit path carries: after a restore an old-context WebGLProgram is
          // not a valid query target even though its JS wrapper still exists.
          if (!program.program
            || (gl && typeof gl.isProgram === 'function' && !gl.isProgram(program.program))) {
            settleAll({
              contextLost: true,
              reason: 'WebGL program invalidated during shader compilation',
            });
            return { contextLost: true, programs: 0 };
          }
          if (program.isReady()) batch.programs.delete(program);
        }
        if (batch.programs.size === 0) break;
        if (now() - started > timeoutMs) break;
        await new Promise((resolve) => { setTimeout(resolve, 4); });
      }
      const remaining = batch.programs.size;
      batch.programs.clear();
      settleAll({ contextLost: false });
      return { contextLost: false, programs: remaining };
    },
    /**
     * Every joined call captured a render target on entry and restores it in a `finally` that runs
     * in a microtask AFTER settle — and those captures nest, so call k captured what call k-1 had
     * just set. Their unwinding therefore leaves the renderer on a compile target, and re-asserting
     * inside settleAll would be ordered before them and lose. The caller must invoke this once its
     * issued promises have all settled, which is the first moment every `finally` has run.
     */
    restoreEntryTarget() {
      if (!batch.renderer || typeof batch.renderer.setRenderTarget !== 'function') return false;
      batch.renderer.setRenderTarget(batch.entryTarget || null);
      return true;
    },
    close() {
      batch.depth -= 1;
      if (batch.depth > 0) return;
      batch.accepting = false;
      batch.programs.clear();
      // A throw between open and drain must never strand a suspended compile: the startup gate
      // would simply time out twenty seconds later with no attribution.
      settleAll({ contextLost: false });
      if (pipelineReadinessBatch === batch) pipelineReadinessBatch = null;
    },
  };
  pipelineReadinessBatch = batch;
  return batch.handle;
}

function compilePipelinesContextSafe(renderer, subject, camera, lightingScene) {
  const canvas = renderer && renderer.domElement;
  const canOwnReadiness = typeof renderer.compile === 'function'
    && renderer.properties && typeof renderer.properties.get === 'function'
    && renderer.extensions && typeof renderer.extensions.get === 'function'
    && canvas && typeof canvas.addEventListener === 'function'
    && typeof canvas.removeEventListener === 'function'
    && typeof renderer.getContext === 'function';
  if (!canOwnReadiness) return renderer.compileAsync(subject, camera, lightingScene);

  return new Promise((resolve, reject) => {
    const gl = renderer.getContext();
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onContextLost = () => finish({
      contextLost: true,
      reason: 'WebGL context lost during shader compilation',
    });

    canvas.addEventListener('webglcontextlost', onContextLost, false);

    let materials;
    try {
      materials = renderer.compile(subject, camera, lightingScene);
    } catch (error) {
      fail(error);
      return;
    }

    // Measured on this project's Intel/ANGLE D3D11 baseline: the extension IS present here, and
    // renderer.compile() above returns in ~0.4 ms because it only STARTS the driver link. The
    // seconds live in the readiness wait below, which is why pooling that wait across a cohort
    // (beginScenePipelineReadinessBatch) is worth 15 s of loading.
    const parallelCompile = renderer.extensions.get('KHR_parallel_shader_compile');
    if (!parallelCompile || !materials || materials.size === 0) {
      finish({ contextLost: false });
      return;
    }

    const programs = new Set();
    for (const material of materials) {
      const properties = renderer.properties.get(material);
      const program = properties && properties.currentProgram;
      if (program && typeof program.isReady === 'function') programs.add(program);
    }
    if (programs.size === 0) {
      finish({ contextLost: false });
      return;
    }

    if (pipelineReadinessBatch && pipelineReadinessBatch.accepting
      && pipelineReadinessBatch.handle.join(gl, programs, finish)) {
      return;
    }

    const checkProgramsReady = () => {
      if (settled) return;
      try {
        if ((typeof gl.isContextLost === 'function' && gl.isContextLost())) {
          onContextLost();
          return;
        }
        for (const program of programs) {
          // isProgram() is the guard Three's unowned timer lacks: after a restore, an old-context
          // WebGLProgram is not a valid query target even though its JS wrapper still exists.
          if (!program.program || (typeof gl.isProgram === 'function' && !gl.isProgram(program.program))) {
            finish({
              contextLost: true,
              reason: 'WebGL program invalidated during shader compilation',
            });
            return;
          }
          if (program.isReady()) programs.delete(program);
        }
        if (programs.size === 0) {
          finish({ contextLost: false });
          return;
        }
        timer = setTimeout(checkProgramsReady, 10);
      } catch (error) {
        fail(error);
      }
    };

    checkProgramsReady();
  });
}

/**
 * Force one exact-target draw while the application is still on its loading route.
 *
 * Some WebGL drivers expose shader-program readiness through a query that is nominally asynchronous
 * but still performs a blocking command-buffer wait for every material polled by compileAsync(). A
 * single batched draw lets the driver link and admit the same programs in one submission instead of
 * multiplying those waits per authored object. The authored roots are staged only for this offscreen
 * draw; ownership, visibility, culling flags, and the renderer target are restored before returning.
 */
export async function warmScenePipelinesForRenderTarget(
  renderer, renderTarget, subject, camera, lightingScene,
) {
  if (!renderer || typeof renderer.render !== 'function') {
    return { skipped: true, reason: 'render unavailable' };
  }
  if (!subject || !lightingScene || typeof lightingScene.add !== 'function') {
    return { skipped: true, reason: 'pipeline staging scene unavailable' };
  }
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const previousParent = subject.parent || null;
  const previousIndex = previousParent && Array.isArray(previousParent.children)
    ? previousParent.children.indexOf(subject)
    : -1;
  const objectState = [];
  if (typeof subject.traverse === 'function') {
    subject.traverse((object) => {
      objectState.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
      object.visible = true;
      if ('frustumCulled' in object) object.frustumCulled = false;
    });
  }
  let alreadyInScene = subject === lightingScene;
  for (let current = subject; current && !alreadyInScene; current = current.parent) {
    if (current === lightingScene) alreadyInScene = true;
  }
  try {
    if (!alreadyInScene && subject !== lightingScene && subject.parent !== lightingScene) {
      lightingScene.add(subject);
    }
    if (typeof subject.updateMatrixWorld === 'function') subject.updateMatrixWorld(true);
    renderer.setRenderTarget(renderTarget || null);
    renderer.render(lightingScene, camera);
    return {
      skipped: false,
      programCount: Array.isArray(renderer.info && renderer.info.programs)
        ? renderer.info.programs.length
        : null,
      mode: 'forced-render',
    };
  } finally {
    if (subject.parent && subject.parent !== previousParent) subject.parent.remove(subject);
    if (previousParent && subject.parent !== previousParent) {
      previousParent.add(subject);
      if (previousIndex >= 0 && previousIndex < previousParent.children.length - 1) {
        const currentIndex = previousParent.children.indexOf(subject);
        previousParent.children.splice(currentIndex, 1);
        previousParent.children.splice(previousIndex, 0, subject);
      }
    }
    for (const entry of objectState) {
      entry.object.visible = entry.visible;
      entry.object.frustumCulled = entry.frustumCulled;
    }
    renderer.setRenderTarget(previousTarget || null);
  }
}

// Immutable fullscreen triangle-strip geometry shared across every createBloom() instance.
// Geometry has no per-instance state; materials/scenes stay private so uniforms never cross.
let sharedQuadGeo = null;
let sharedQuadGeoRefs = 0;

function retainSharedQuadGeometry() {
  if (!sharedQuadGeo) {
    sharedQuadGeo = new THREE.PlaneGeometry(2, 2);
    sharedQuadGeo.name = 'SF_Bloom_SharedFullscreenQuad';
  }
  sharedQuadGeoRefs += 1;
  return sharedQuadGeo;
}

function releaseSharedQuadGeometry() {
  sharedQuadGeoRefs = Math.max(0, sharedQuadGeoRefs - 1);
  if (sharedQuadGeoRefs === 0 && sharedQuadGeo) {
    sharedQuadGeo.dispose();
    sharedQuadGeo = null;
  }
}

// --- GLSL (inlined as strings; no external shader files) -------------------------------------

// Shared vertex shader for every fullscreen pass: a [-1..1] quad straight to clip space, UV 0..1.
const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// GR-1: 5-tap bilinear-gather downsample. On pyramid level 0 (full→½) the bright-pass threshold/knee
// is applied per tap via uBright=1.0; deeper levels pass through (uBright=0.0). One parametric shader
// serves every level. The center + 4 corners pattern (a cross-box hybrid) approximates a wider gaussian
// than a plain 2×2 box while staying one cheap fragment pass per level.
const DOWNSAMPLE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;     // 1.0 / source resolution (full for level 0, ½ for level 1, …)
  uniform float uThreshold;
  uniform float uKnee;
  uniform float uBright;   // 1.0 = apply bright-pass (level 0 only), 0.0 = passthrough

  vec3 brightPass(vec3 c) {
    c = max(c, vec3(0.0)); // guard against negative/NaN leaking into the pyramid
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // soft-knee bright extract: 0 below (threshold-knee), smooth ramp, full above threshold
    float soft = smoothstep(uThreshold - uKnee, uThreshold + uKnee, l);
    float contrib = max(l - uThreshold, 0.0) + soft * uKnee;
    float scale = contrib / max(l, 1e-4);
    return c * scale;
  }

  // Sample and (optionally) bright-pass in one step so the deepest taps are already thresholded.
  vec3 tap(vec2 uv) {
    vec3 c = texture2D(tDiffuse, uv).rgb;
    return uBright > 0.5 ? brightPass(c) : max(c, vec3(0.0));
  }

  void main() {
    // 5-tap cross + corners, gathered with bilinear-friendly offsets. x/y use the SOURCE texel size so
    // the footprint shrinks correctly at each pyramid level.
    vec2 t = uTexel;
    vec2 tl = vec2(-1.0, -1.0) * t;
    vec2 tr = vec2( 1.0, -1.0) * t;
    vec2 bl = vec2(-1.0,  1.0) * t;
    vec2 br = vec2( 1.0,  1.0) * t;
    vec3 sum  = tap(vUv)            * (4.0 / 8.0);
    sum += tap(vUv + tl)            * (1.0 / 8.0);
    sum += tap(vUv + tr)            * (1.0 / 8.0);
    sum += tap(vUv + bl)            * (1.0 / 8.0);
    sum += tap(vUv + br)            * (1.0 / 8.0);
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// Coarse-level weight for multi-scale composite (matches the prior upsample chain's uWeight so the
// wide halo reads the same order of magnitude without a dedicated upsample RT + pass).
const BLOOM_COARSE_WEIGHT = 0.36;

// Composite: tonemap the scene first, THEN add strength-scaled multi-scale bloom on top. Adding bloom
// before ACES saturated highlights and made the strength slider appear dead (1% looked like 100%).
// Pyramid energy runs hot, so uBloomNorm reins it in before uStrength scales the halo perceptually.
// Coarser pyramid levels are sampled directly (hardware bilinear) — no intermediate upsample target.
// Optional color grade, vignette, and film grain are independent presentation controls. They default
// off: selective bloom must never imply a full-screen color or texture treatment. ACES lives here (not
// on renderer.toneMapping) so the bloom-on/off paths stay in sync — see COLOR-MANAGEMENT INVARIANT.
const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;  // half-res bright extract (always present when bloom is on)
  uniform sampler2D tBloom1;  // quarter-res (or same as tBloom0 when levels==1)
  uniform float uBloomW0;
  uniform float uBloomW1;
  uniform float uStrength;
  uniform float uBloomNorm;   // pyramid energy runs hot; normalize before perceptual strength
  uniform float uExposure;
  uniform float uAces;
  uniform float uGrain;     // film grain amount 0..1 (cinematic; animated via uGrainFrame)
  uniform float uVignette;  // atmospheric corner darkening 0..1
  uniform float uGrade;     // color-grade blend 0..1 (0 = off, 1 = full cyberpunk-noir LUT)
  uniform float uToe;       // lifted black floor 0..0.06 (0 = true blacks, the default)
  uniform float uGrainFrame;

  ${SPACE_POST_PRESENTATION_GLSL}

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    // Multi-scale bloom: fine local brights + hardware-bilinear coarse halo (no upsample RT).
    vec3 bloom = texture2D(tBloom0, vUv).rgb * uBloomW0
               + texture2D(tBloom1, vUv).rgb * uBloomW1;
    vec3 spill = bloom * uStrength * uBloomNorm;
    gl_FragColor = vec4(composeSpacePostPresentation(
      scene, spill, vUv, gl_FragCoord.xy, uExposure, uAces,
      uGrade, uToe, uVignette, uGrain, uGrainFrame
    ), 1.0);
  }
`;

/**
 * Create a bloom post-processor.
 * @param {THREE.WebGLRenderer} renderer - the live renderer (we drive its render targets).
 * @param {number} width  - drawing-buffer width  in px.
 * @param {number} height - drawing-buffer height in px.
 * @param {{ getPerf?: () => object|null, getGpuTimers?: () => object|null }} [instrumentation]
 *        Optional measurement hooks. CPU pass-group times use existing perfRuntime.recordRenderWork;
 *        GPU timers are capability-gated and only emit when the timer set is enabled.
 * @returns {{ render(scene,camera):void, compileScenePipelines(subject,camera,lightingScene):Promise,
 *            warmScenePipelines(subject,camera,lightingScene):Promise,
 *            setSize(w,h):void, setOptions(o):void, dispose():void,
 *            get enabled():boolean, set enabled(v):void }}
 */
export function createBloom(renderer, width, height, instrumentation = null) {
  let W = Math.max(1, width | 0);
  let H = Math.max(1, height | 0);
  let instrument = instrumentation && typeof instrumentation === 'object' ? instrumentation : null;

  // tunables (overridable via setOptions; defaults match settings.video.*)
  let enabled = true;
  let strength = DEFAULT_BLOOM_STRENGTH;
  let threshold = 1.0;
  const knee = 0.25;
  let exposure = 1.0;
  let aces = 1.0; // 1 = ACES filmic by default
  const defaultPresentation = resolvePostPresentation();
  let grain = defaultPresentation.grain;
  let vignette = defaultPresentation.vignette;
  let grade = defaultPresentation.grade;
  let toe = defaultPresentation.toe;

  // ---- render targets ----
  // rtScene is full-res (needs a depth buffer for the scene render). The pyramid targets halve each
  // level (½→¼). There is no separate upsample RT: the composite samples the pyramid multi-scale.
  // All targets are allocated at init/resize/context-restore only — never inside render().
  // All HalfFloat + linear colorSpace (default) so brights exceed 1.0.
  // Reuse one options object so we do not allocate a fresh descriptor on every RT create/resize.
  const pyramidRtOpts = {
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const sceneRtOpts = {
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  };

  // The bloom path already presents through a post composite, so multisampling the full-resolution HDR
  // scene target adds a costly resolve before the downsample/composite chain. Keep the offscreen target
  // single-sampled; edge treatment belongs in one maintained post-AA path, not in every HDR bloom frame.
  // Pyramid targets stay single-sampled too — they're downsampled, AA there is wasted.
  const maxSamples = renderer.capabilities && Number.isFinite(renderer.capabilities.maxSamples)
    ? renderer.capabilities.maxSamples
    : BALANCED_BLOOM_MSAA_SAMPLES;
  const sceneSamples = (renderer.capabilities && renderer.capabilities.isWebGL2)
    ? Math.max(0, Math.min(BALANCED_BLOOM_MSAA_SAMPLES, maxSamples))
    : 0;
  sceneRtOpts.samples = sceneSamples;

  function levelCountForSize(w, h) {
    const halfW = Math.max(1, w >> 1);
    const halfH = Math.max(1, h >> 1);
    if (halfW < 320 || halfH < 180) return 1;
    return BALANCED_BLOOM_MAX_LEVELS;
  }

  function allocRenderTarget(w, h, opts, reason) {
    recordPostRenderTargetAllocation(reason);
    return new THREE.WebGLRenderTarget(w, h, opts);
  }

  function resizeRenderTarget(rt, w, h, reason) {
    if (!rt) return;
    if (rt.width === w && rt.height === h) return;
    recordPostRenderTargetAllocation(reason);
    rt.setSize(w, h);
  }

  function createRenderTargets(reason = 'init') {
    const rtScene = allocRenderTarget(W, H, sceneRtOpts, reason);
    const halfW = Math.max(1, W >> 1);
    const halfH = Math.max(1, H >> 1);
    const newLevels = levelCountForSize(W, H);
    const down = [];
    for (let i = 0; i < newLevels; i++) {
      const dw = Math.max(1, W >> (i + 1));
      const dh = Math.max(1, H >> (i + 1));
      down.push(allocRenderTarget(dw, dh, pyramidRtOpts, reason));
    }
    return { rtScene, halfW, halfH, levels: newLevels, down };
  }

  let { rtScene, halfW, halfH, levels, down } = createRenderTargets();

  // ---- fullscreen quad (shared immutable geometry; private scene/mesh; material swapped per pass) ----
  const quadGeo = retainSharedQuadGeometry();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  quadMesh.matrixAutoUpdate = false;
  quadMesh.updateMatrix();
  quadScene.add(quadMesh);

  const mkMat = (frag, uniforms) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: QUAD_VERT,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
    toneMapped: false, // never let three's tone-mapping touch a post pass
  });

  const downsampleMat = mkMat(DOWNSAMPLE_FRAG, {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },     // set per level in render()
    uThreshold: { value: threshold },
    uKnee: { value: knee },
    uBright: { value: 1.0 },                                // 1.0 only on level 0
  });
  const compositeMat = mkMat(COMPOSITE_FRAG, {
    tScene:     { value: null },
    tBloom0:    { value: null },
    tBloom1:    { value: null },
    uBloomW0:   { value: 1.0 },
    uBloomW1:   { value: 0.0 },
    uStrength:  { value: strength },
    uBloomNorm: { value: BLOOM_PYRAMID_NORM },
    uExposure:  { value: exposure },
    uAces:      { value: aces },
    uGrain:     { value: grain },     // film grain (cyberpunk-noir mood)
    uVignette:  { value: vignette },  // atmospheric corner fall-off
    uGrade:     { value: grade },     // teal-shadow/amber-highlight color grade
    uToe:       { value: toe },       // lifted black floor (0 = true blacks)
    uGrainFrame: { value: 0 },
  });

  function postStyleScale() {
    return Math.max(grain, vignette, grade, toe);
  }

  function applyPostStyleUniforms() {
    compositeMat.uniforms.uGrain.value = grain;
    compositeMat.uniforms.uVignette.value = vignette;
    compositeMat.uniforms.uToe.value = toe;
    compositeMat.uniforms.uGrade.value = grade;
  }
  applyPostStyleUniforms();

  // draw the shared quad with a given material into a given target (null = screen)
  function blit(material, target) {
    quadMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  // Measurement-only: CPU pass times require perfRuntime.renderWorkEnabled (default OFF).
  // GPU begin/end only runs when the timer set is enabled (default OFF).
  function timePassGroup(label, fn, arg0 = null, arg1 = null, arg2 = null) {
    const perf = instrument && typeof instrument.getPerf === 'function' ? instrument.getPerf() : null;
    const gpu = instrument && typeof instrument.getGpuTimers === 'function' ? instrument.getGpuTimers() : null;
    const useCpu = !!(perf && perf.renderWorkEnabled && typeof perf.recordRenderWork === 'function');
    const useGpu = gpu && gpu.enabled && typeof gpu.begin === 'function';
    const gpuOrigin = useGpu && instrument && typeof instrument.getGpuOrigin === 'function'
      ? instrument.getGpuOrigin()
      : null;
    const t0 = useCpu ? performance.now() : 0;
    const gpuQueryBegan = !!(useGpu && gpu.begin(label, gpuOrigin));
    try {
      return fn(arg0, arg1, arg2);
    } finally {
      if (gpuQueryBegan) gpu.end();
      if (useCpu) perf.recordRenderWork(label, performance.now() - t0);
    }
  }

  // These pass bodies live for the bloom instance rather than being recreated as three arrow
  // closures every display frame. Explicit arguments preserve timePassGroup's local/finally
  // semantics without retaining mutable per-frame scene or camera state between renders.
  // Program identities seen as of the last brick. Carried BETWEEN slow frames instead of rebuilt
  // every frame, so the diff costs nothing until something is already wrong. Seeded once on the
  // first scene pass so the FIRST brick still reports a real delta.

  // The programs this render call acquired, and only those.
  function exactNewProgramKeys(before) {
    const programs = renderer && renderer.info && renderer.info.programs;
    if (!Array.isArray(programs) || !Number.isFinite(before) || before < 0) return [];
    return programs.slice(before)
      .map((prog) => String(prog && (prog.cacheKey || prog.name) || ''))
      .filter(Boolean);
  }

  // Map each newly-linked program key back to the live object using it.
  // A cache key names a program, not a producer, and "+3 programs" is not actionable until you know
  // WHICH object dragged them in — this is what turned an unattributed 498 ms freeze into
  // "common rock spawned and nothing warmed it". Runs ONLY on a frame that already blew the
  // threshold, so the traversal cost cannot matter; keep it armed for the same reason the brick
  // warning itself is always armed.
  function describeNewProgramOwners(scene, seenKeys) {
    if (!scene || typeof scene.traverse !== 'function') return null;
    const rows = [];
    const props = renderer && renderer.properties;
    if (!props || typeof props.get !== 'function') return null;
    const rootOf = (object) => {
      let root = object;
      while (root && root.parent && root.parent !== scene) root = root.parent;
      return root;
    };
    try {
      scene.traverse((object) => {
        if (rows.length >= 24) return;
        const materials = Array.isArray(object?.material)
          ? object.material
          : (object?.material ? [object.material] : []);
        for (const material of materials) {
          let program = null;
          try { program = props.get(material)?.currentProgram || null; } catch (_) { continue; }
          const key = String(program && (program.cacheKey || program.name) || '');
          if (!key || seenKeys.has(key)) continue;
          rows.push({
            key: key.slice(0, 40),
            object: String(object.name || object.type || 'unnamed'),
            material: String(material.name || material.type || 'unnamed'),
            root: String(rootOf(object)?.name || rootOf(object)?.type || 'unnamed'),
            visible: object.visible === true,
          });
        }
      });
    } catch (_) { return null; }
    return rows;
  }

  function renderScenePass(scene, camera, tier1) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    // ALWAYS ARMED, and cheap. This was gated on `perf.renderWorkEnabled`, and the costly event —
    // a 3,167 ms bloomScene — landed OUTSIDE the window where that gate was true, so the warning
    // never fired for the one frame anyone cared about. Three attempts at the entering-flight brick
    // were aimed by evidence this blind spot had already filtered. Do not re-gate it.
    //
    // The per-frame cost is one performance.now() pair and one array-length read. Naming the
    // programs happens ONLY on a frame that already blew the threshold, and reads the tail of
    // info.programs past the pre-render length — no per-frame Set is carried or rebuilt.
    const info = renderer.info;
    const programsBefore = Array.isArray(info?.programs) ? info.programs.length : null;
    const geometriesBefore = Number.isFinite(info?.memory?.geometries) ? info.memory.geometries : null;
    const texturesBefore = Number.isFinite(info?.memory?.textures) ? info.memory.textures : null;
    const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;
    try {
      renderer.setRenderTarget(rtScene);
      renderer.clear();
      renderer.render(scene, camera);
      if (tier1) tier1.countRenderPassPixels(rtScene.width * rtScene.height, 'bloom-scene');
    } finally {
      renderer.autoClear = prevAutoClear;
      {
        const elapsedMs = (typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : 0) - startedAt;
        if (elapsedMs > BRICK_WARN_MS) {
          console.warn(`[GPU brick] bloomScene ${elapsedMs.toFixed(1)}ms ${JSON.stringify({
            programsBefore,
            programsAfter: Array.isArray(info?.programs) ? info.programs.length : null,
            geometriesBefore,
            geometriesAfter: Number.isFinite(info?.memory?.geometries) ? info.memory.geometries : null,
            texturesBefore,
            texturesAfter: Number.isFinite(info?.memory?.textures) ? info.memory.textures : null,
            // Three appends to info.programs as it acquires them, so the tail beyond
            // programsBefore is EXACTLY what this render call linked. The old diff-against-the-
            // previous-brick set reported every program acquired since the last brick — dozens of
            // legitimately warm ones — which made the payload unusable for naming a producer.
            newPrograms: exactNewProgramKeys(programsBefore).map((key) => key.slice(0, 120)),
            owners: describeNewProgramOwners(scene, new Set(exactNewProgramKeys(programsBefore))),
          })}`);
        }
      }
    }
  }

  function renderDownsamplePass(tier1) {
    let src = rtScene.texture;
    for (let i = 0; i < levels; i++) {
      const sw = i === 0 ? W : Math.max(1, W >> i);
      const sh = i === 0 ? H : Math.max(1, H >> i);
      downsampleMat.uniforms.tDiffuse.value = src;
      downsampleMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      downsampleMat.uniforms.uThreshold.value = threshold;
      downsampleMat.uniforms.uBright.value = (i === 0) ? 1.0 : 0.0;
      blit(downsampleMat, down[i]);
      if (tier1) tier1.countRenderPassPixels(down[i].width * down[i].height, 'bloom-downsample');
      src = down[i].texture;
    }
  }

  function renderCompositePass(tier1, bloomActive) {
    // Bind initialized scene color when bloom is inactive. Zero weights would normally be enough,
    // but sampling an uninitialized pyramid and multiplying by zero is not guaranteed to suppress a
    // driver NaN. The canonical presentation pass therefore remains deterministic at off/zero.
    const fine = bloomActive ? down[0].texture : rtScene.texture;
    const coarse = bloomActive && levels > 1 ? down[levels - 1].texture : fine;
    compositeMat.uniforms.tScene.value = rtScene.texture;
    compositeMat.uniforms.tBloom0.value = fine;
    compositeMat.uniforms.tBloom1.value = coarse;
    compositeMat.uniforms.uBloomW0.value = bloomActive ? 1.0 : 0.0;
    compositeMat.uniforms.uBloomW1.value = bloomActive && levels > 1 ? BLOOM_COARSE_WEIGHT : 0.0;
    compositeMat.uniforms.uStrength.value = bloomActive ? strength : 0.0;
    compositeMat.uniforms.uExposure.value = exposure;
    compositeMat.uniforms.uAces.value = aces;
    const timeS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    compositeMat.uniforms.uGrainFrame.value = Math.floor(timeS * POST_GRAIN_FPS);
    blit(compositeMat, null);
    if (tier1) tier1.countRenderPassPixels(W * H, 'bloom-composite');
  }

  function setInstrumentation(next) {
    instrument = next && typeof next === 'object' ? next : null;
  }

  function render(scene, camera) {
    const bloomActive = enabled && strength > 0.0001;

    const prevAutoClear = renderer.autoClear;

    // Tier-1 causal pixel accounting: one hoisted enabled-check per frame, then pass-target area
    // per pass. Counts the rasterized pixel load; allocation stays with the GL wrappers.
    const tier1Perf = instrument && typeof instrument.getPerf === 'function' ? instrument.getPerf() : null;
    const tier1 = tier1Perf && tier1Perf.tier1 && tier1Perf.tier1.isEnabled() ? tier1Perf.tier1 : null;

    // pass 0 — scene into HDR buffer (renderer applies its own tone-mapping here)
    timePassGroup('bloomScene', renderScenePass, scene, camera, tier1);

    // from here we only draw the full-screen quad; disable autoClear so blits don't wipe each other
    renderer.autoClear = false;

    // ---- downsample chain: full -> ½ (bright-pass) -> ¼ ----
    // level 0 reads the full-res scene with the bright-pass; deeper levels pass through.
    if (bloomActive) timePassGroup('bloomDownsample', renderDownsamplePass, tier1);

    // Multi-scale composite — no upsample RT or pass. Fine + coarse pyramid levels are sampled
    // directly; coarser levels contribute the wide halo via hardware bilinear (weight matches the
    // retired upsample chain so perceptual strength stays in family).
    timePassGroup('bloomComposite', renderCompositePass, tier1, bloomActive);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
  }

  function compileScenePipelines(subject, camera, lightingScene = subject) {
    return compileScenePipelinesForRenderTarget(
      renderer, rtScene, subject, camera, lightingScene,
    );
  }

  function warmScenePipelines(subject, camera, lightingScene = subject) {
    return warmScenePipelinesForRenderTarget(
      renderer, rtScene, subject, camera, lightingScene,
    );
  }

  function touchScenePipelines(subject, camera, lightingScene = subject) {
    return touchSubjectOnExactTarget(renderer, rtScene, subject, camera, lightingScene);
  }

  async function prepareResources(yieldToMain = () => Promise.resolve()) {
    if (typeof renderer.initRenderTarget !== 'function') {
      return { skipped: true, reason: 'initRenderTarget unavailable', targets: 0 };
    }
    const targets = [rtScene, ...down];
    const allocations = [];
    for (const target of targets) {
      await yieldToMain();
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
      renderer.initRenderTarget(target);
      allocations.push({
        width: target.width,
        height: target.height,
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
      });
    }
    await yieldToMain();
    const previousTarget = typeof renderer.getRenderTarget === 'function'
      ? renderer.getRenderTarget()
      : null;
    const previousMat = quadMesh.material;
    try {
      if (down[0]) {
        quadMesh.material = downsampleMat;
        renderer.setRenderTarget(down[0]);
        if (typeof renderer.compile === 'function') renderer.compile(quadScene, quadCam);
      }
      quadMesh.material = compositeMat;
      renderer.setRenderTarget(null);
      if (typeof renderer.compile === 'function') renderer.compile(quadScene, quadCam);
    } finally {
      quadMesh.material = previousMat;
      if (typeof renderer.setRenderTarget === 'function') {
        renderer.setRenderTarget(previousTarget || null);
      }
    }
    await yieldToMain();
    return { skipped: false, targets: targets.length, allocations };
  }

  function rebuild() {
    // WebGL context restore: the old render-target GPU textures are invalid. Dispose them and
    // recreate the whole pyramid at the current size so the next frame can render cleanly.
    rtScene.dispose();
    for (const rt of down) rt.dispose();
    const next = createRenderTargets('contextRestore');
    rtScene = next.rtScene;
    halfW = next.halfW;
    halfH = next.halfH;
    levels = next.levels;
    down = next.down;
  }

  function contextLossResources() {
    return [rtScene, ...down].filter(Boolean);
  }

  function setSize(w, h) {
    const nextW = Math.max(1, w | 0);
    const nextH = Math.max(1, h | 0);
    // Hot path: _applySize() may re-enter with an unchanged drawing buffer — never touch GPU RTs.
    if (nextW === W && nextH === H) return;
    W = nextW;
    H = nextH;
    halfW = Math.max(1, W >> 1);
    halfH = Math.max(1, H >> 1);
    const newLevels = levelCountForSize(W, H);
    resizeRenderTarget(rtScene, W, H, 'resize');
    // grow/shrink the pyramid level array if depth changed (resize may cross the 320px threshold)
    while (down.length < newLevels) {
      const i = down.length;
      down.push(allocRenderTarget(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)), pyramidRtOpts, 'resize'));
    }
    while (down.length > newLevels) { const rt = down.pop(); rt.dispose(); }
    levels = newLevels;
    for (let i = 0; i < levels; i++) {
      resizeRenderTarget(down[i], Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)), 'resize');
    }
  }

  // Accept partial option updates (wired from settings:changed by the render layer).
  function setOptions(o) {
    if (!o) return;
    if (typeof o.enabled === 'boolean') enabled = o.enabled;
    if (typeof o.bloom === 'boolean') enabled = o.bloom; // settings.video.bloom alias
    if (typeof o.strength === 'number') {
      strength = Math.max(0, o.strength);
      compositeMat.uniforms.uStrength.value = strength;
    }
    if (typeof o.bloomStrength === 'number') {
      strength = Math.max(0, o.bloomStrength);
      compositeMat.uniforms.uStrength.value = strength;
    }
    if (typeof o.threshold === 'number') {
      threshold = o.threshold;
      downsampleMat.uniforms.uThreshold.value = threshold;
    }
    if (typeof o.bloomThreshold === 'number') {
      threshold = o.bloomThreshold;
      downsampleMat.uniforms.uThreshold.value = threshold;
    }
    if (typeof o.exposure === 'number') {
      exposure = Math.max(0.1, o.exposure);
      compositeMat.uniforms.uExposure.value = exposure;
    }
    if (typeof o.acesToneMapping === 'boolean') {
      aces = o.acesToneMapping ? 1.0 : 0.0;
      compositeMat.uniforms.uAces.value = aces;
    }
    if (typeof o.aces === 'number') {
      aces = Math.max(0, Math.min(1, o.aces));
      compositeMat.uniforms.uAces.value = aces;
    }
    // Optional full-screen presentation controls. These are independent of selective bloom.
    if (typeof o.grain === 'number') grain = Math.max(0, Math.min(1, o.grain));
    if (typeof o.vignette === 'number') vignette = Math.max(0, Math.min(1, o.vignette));
    if (typeof o.grade === 'number') grade = Math.max(0, Math.min(1, o.grade));
    if (typeof o.toe === 'number') toe = Math.max(0, Math.min(0.06, o.toe));
    applyPostStyleUniforms();
  }

  function diagnostics() {
    return {
      enabled,
      width: W,
      height: H,
      levels,
      sceneSamples,
      maxLevels: BALANCED_BLOOM_MAX_LEVELS,
      halfWidth: halfW,
      halfHeight: halfH,
      strength,
      threshold,
      exposure,
      postStyleScale: postStyleScale(),
      grain: compositeMat.uniforms.uGrain.value,
      vignette: compositeMat.uniforms.uVignette.value,
      grade: compositeMat.uniforms.uGrade.value,
      toe: compositeMat.uniforms.uToe.value,
      grainSource: 'quantized-interleaved-gradient',
      grainFps: POST_GRAIN_FPS,
      multiScaleComposite: true,
      presentationComposite: true,
      presentationParity: 'canonical-base-ao-off-bloom-neutral',
      upsampleTargets: 0,
      sharedQuadGeometry: true,
      targets: 1 + down.length,
      renderTargetCount: 1 + down.length,
      drawingBufferWidth: W,
      drawingBufferHeight: H,
      sceneTargetWidth: rtScene.width,
      sceneTargetHeight: rtScene.height,
      effectiveSceneScale: 1,
      fullFramePasses: 2,
      // Downsample pyramid only — multi-scale composite replaced the upsample chain.
      bloomPasses: enabled && strength > 0.0001 ? down.length : 0,
      passFamilies: {
        scene: 1,
        normal: 0,
        ao: 0,
        bloom: enabled && strength > 0.0001 ? down.length : 0,
        composite: 1,
      },
    };
  }

  function dispose() {
    rtScene.dispose();
    for (const rt of down) rt.dispose();
    downsampleMat.dispose();
    compositeMat.dispose();
    releaseSharedQuadGeometry();
  }

  return {
    render,
    compileScenePipelines,
    warmScenePipelines,
    touchScenePipelines,
    prepareResources,
    contextLossResources,
    setSize,
    setOptions,
    setInstrumentation,
    diagnostics,
    dispose,
    rebuild,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; applyPostStyleUniforms(); },
    get strength() { return strength; },
    set strength(v) {
      strength = Math.max(0, +v || 0);
      compositeMat.uniforms.uStrength.value = strength;
      applyPostStyleUniforms();
    },
    get threshold() { return threshold; },
    set threshold(v) { threshold = +v; },
  };
}

// ARCHITECTURE §9 module table names the export `Bloom`; keep that alias available too.
export { createBloom as Bloom };
