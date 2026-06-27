// Self-contained bloom post-processor with a downsample/upsample mip pyramid (ARCHITECTURE §2.4
// draw pipeline, design/specs/10). GR-1: the single half-res separable blur is replaced by a
// progressive downsample chain (full→½→¼→⅛) followed by an additive upsample chain back to ½. Each
// pyramid level contributes low-frequency glow, so the final bloom buffer carries a smooth, wide
// intensity falloff — bright things *radiate* instead of producing a tight local glow.
//
// Pipeline (all custom ShaderMaterials on ONE shared fullscreen quad; NO three/addons, NO
// EffectComposer/FullScreenQuad):
//   pass 0  scene       rtScene            (renderer.render at full res, HalfFloat so emissive
//                                           additive brights can exceed 1.0)
//   pass 1  bright+down rtScene   -> down[0] (½)   bright-pass + 13-tap 2D downsample
//   pass 2  downsample  down[0]   -> down[1] (¼)   13-tap 2D downsample
//   pass 3  downsample  down[1]   -> down[2] (⅛)   13-tap 2D downsample  [dropped if halfW < 320]
//   pass 4  upsample    down[2]+down[1] -> up (¼)  13-tap upsample, ADDITIVE over the finer level
//   pass 5  upsample    up+down[0]      -> up (½)  13-tap upsample, ADDITIVE
//   pass 6  composite   rtScene + strength*up -> default framebuffer (sRGB-encoded)
//
// COLOR-MANAGEMENT INVARIANT (the thing that makes this provably correct):
//   At bloomStrength == 0 the composite output is pixel-identical to a plain
//   renderer.render(scene, camera). We achieve that by:
//     * leaving every RT texture in the default (linear) colorSpace — we never set sRGB on a RT,
//     * sampling RTs raw in custom shaders (three does NOT auto-decode/auto-tonemap a ShaderMaterial
//       texture in r160), and
//     * doing the ONE sRGB encode manually in the composite shader (renderer would normally do this
//       when drawing to screen, but a custom-shader full-screen pass bypasses it).
//   We deliberately do NOT re-tonemap in the composite. This is CORRECT for the renderer as written
//   (it uses the default NoToneMapping, so bloom-on and the bloom-off fast path match exactly).
//   INTEGRATION CAVEAT for the render track: if you later set renderer.toneMapping = ACESFilmic…,
//   three renders to render targets with NoToneMapping regardless, so rtScene would be un-tonemapped
//   while the bloom-off path tonemaps — they'd diverge. At that point tone-mapping must move INTO this
//   composite shader (sample scene+bloom, tonemap, THEN sRGB-encode). Until then, composite = add +
//   encode, which is exactly what preserves the strength==0 == plain-render invariant.
//
// Cost: scene render + a handful of cheap fullscreen quads; the deepest pyramid levels are tiny (⅛-res
// blits are ~16px taps), so the wide halo costs little over the old single-blur. createBloom() is a
// drop-in replacement for renderer.render — the render layer calls bloom.render(scene, camera) instead.
import * as THREE from 'three';

const BALANCED_BLOOM_MAX_LEVELS = 2;
const BALANCED_BLOOM_MSAA_SAMPLES = 0;
const FILM_GRAIN_FPS = 12;

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

// GR-1: 5-tap upsample, bilinear-interpolating the COARSER level and ADDING it onto the finer down
// level. uTexel is 1.0 / finer-level resolution; uCoarse is the coarser source; uFine is the matching
// finer down level. The additive blend is what spreads the low-frequency glow wide — each upsample
// step carries the soft halo of everything below it up toward half-res.
const UPSAMPLE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tCoarse;   // the level one step deeper in the pyramid (bigger pixels)
  uniform sampler2D tFine;     // the matching finer down level (to add onto)
  uniform vec2 uTexel;         // 1.0 / FINER resolution
  uniform float uWeight;       // how much of the coarse-upsampled glow to add (0..1)

  void main() {
    // 5-tap bilinear gather of the coarse level, spread by the finer texel size.
    vec2 t = uTexel;
    vec3 up  = texture2D(tCoarse, vUv).rgb;
    vec3 upL = texture2D(tCoarse, vUv + vec2(-1.0,  0.0) * t).rgb;
    vec3 upR = texture2D(tCoarse, vUv + vec2( 1.0,  0.0) * t).rgb;
    vec3 upD = texture2D(tCoarse, vUv + vec2( 0.0, -1.0) * t).rgb;
    vec3 upU = texture2D(tCoarse, vUv + vec2( 0.0,  1.0) * t).rgb;
    vec3 coarse = (up * 4.0 + (upL + upR + upD + upU)) / 8.0;

    // add the finer down level (the sharp local brights this pyramid level refines).
    vec3 fine = texture2D(tFine, vUv).rgb;
    gl_FragColor = vec4(fine + coarse * uWeight, 1.0);
  }
`;

// Composite: scene + strength*bloom, ACES filmic, then the CINEMATIC POST GRADE
// (color grade → atmospheric vignette → animated film grain) and sRGB encode. ACES lives here (not
// on renderer.toneMapping) so the bloom-on/off paths stay in sync — see COLOR-MANAGEMENT INVARIANT.
// The post grade is the single highest-value graphics lever: it touches EVERY asset at once, giving
// the whole frame a cohesive cyberpunk-noir mood (teal shadows, warm highlights, soft corner fall-off,
// subtle film grain) instead of a flat render-engine default.
const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uStrength;
  uniform float uExposure;
  uniform float uAces;
  uniform float uGrain;     // film grain amount 0..1 (cinematic; animated via uGrainFrame)
  uniform float uVignette;  // atmospheric corner darkening 0..1
  uniform float uGrade;     // color-grade blend 0..1 (0 = off, 1 = full cyberpunk-noir LUT)
  uniform float uGrainFrame;

  // Narkowicz 2015 ACES approximation (input in linear, output 0-1)
  vec3 acesFilmic(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Interleaved gradient noise: one cheap ALU hash, no texture fetch. uGrainFrame advances at a
  // film-like cadence instead of every display refresh, keeping the grain alive without forcing the
  // full-screen composite shader through extra floor()/time-hash work on every pixel.
  float grainNoise(vec2 p) {
    return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
  }

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 c = (scene + bloom * uStrength) * uExposure;
    c = max(c, vec3(0.0));
    // tone mapping: blend between simple clamp (uAces=0) and ACES filmic (uAces=1)
    vec3 cClamped = clamp(c, 0.0, 1.0);
    vec3 cAces    = acesFilmic(c);
    c = mix(cClamped, cAces, uAces);

    // ---- CINEMATIC COLOR GRADE (cyberpunk-noir): teal pushed shadows + warm amber highlights +
    //      a slight magenta lift in the mids, blended by uGrade. This is the "soul" pass — it
    //      unifies every asset (ships, stations, asteroids, planets, nebula, VFX) under one mood.
    vec3 graded = c;
    {
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // shadows → cool teal/cyan; highlights → warm amber; both via luma-masked tints
      vec3 shadowTint  = vec3(0.04, 0.12, 0.16);   // teal push in the darks
      vec3 highTint    = vec3(0.14, 0.08, 0.02);   // amber in the brights
      graded = c + shadowTint * (1.0 - smoothstep(0.0, 0.45, luma));
      graded = graded + highTint * smoothstep(0.55, 1.0, luma);
      // gentle global contrast/saturation lift for a richer, less flat look
      graded = mix(vec3(luma), graded, 1.12);
    }
    c = mix(c, graded, uGrade);

    // ---- ATMOSPHERIC VIGNETTE: soft corner darkening for focus + a cinematic "shot through a lens"
    //      feel. Cheaper than a real lens model but reads instantly as "movie" not "game engine".
    {
      vec2 d = vUv - vec2(0.5);
      float dist = dot(d, d) * 2.2;            // 0 center → ~1.1 corners
      float vig = smoothstep(0.85, 0.25, dist); // keep center bright, fall off at edges
      c *= mix(1.0, vig, uVignette);
    }

    // linear -> sRGB
    vec3 srgb = mix(1.055 * pow(c, vec3(1.0 / 2.4)) - vec3(0.055), c * 12.92, step(c, vec3(0.0031308)));

    // ---- FILM GRAIN (applied in sRGB space so it reads as photochemical noise, not a render glitch).
    //      Computed analytically to avoid a full-screen noise texture fetch; scaled by luminance so
    //      it's stronger in darks (where film grain naturally lives) and invisible in brights.
    if (uGrain > 0.001) {
      float luma = dot(srgb, vec3(0.2126, 0.7152, 0.0722));
      vec2 grainCell = gl_FragCoord.xy * 0.5 + vec2(uGrainFrame * 17.0, uGrainFrame * 31.0);
      float n = grainNoise(grainCell) - 0.5;
      srgb += n * uGrain * (0.25 + 0.75 * (1.0 - luma)) * 0.10;
    }

    gl_FragColor = vec4(srgb, 1.0);
  }
`;

/**
 * Create a bloom post-processor.
 * @param {THREE.WebGLRenderer} renderer - the live renderer (we drive its render targets).
 * @param {number} width  - drawing-buffer width  in px.
 * @param {number} height - drawing-buffer height in px.
 * @returns {{ render(scene,camera):void, setSize(w,h):void, setOptions(o):void, dispose():void,
 *            get enabled():boolean, set enabled(v):void }}
 */
export function createBloom(renderer, width, height) {
  let W = Math.max(1, width | 0);
  let H = Math.max(1, height | 0);

  // tunables (overridable via setOptions; defaults match settings.video.*)
  let enabled = true;
  let strength = 0.9;
  let threshold = 0.65;
  const knee = 0.12;
  let exposure = 1.0;
  let aces = 1.0; // 1 = ACES filmic by default

  // ---- render targets ----
  // rtScene is full-res (needs a depth buffer for the scene render). The pyramid targets halve each
  // level (½→¼→⅛). bloomPing/bloomPong are scratch targets for the additive upsample chain, resized
  // per step. All HalfFloat + linear colorSpace (default) so brights exceed 1.0.
  const rtOpts = () => ({
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

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

  function levelCountForSize(w, h) {
    const halfW = Math.max(1, w >> 1);
    const halfH = Math.max(1, h >> 1);
    if (halfW < 320 || halfH < 180) return 1;
    return BALANCED_BLOOM_MAX_LEVELS;
  }

  function createRenderTargets() {
    const rtScene = new THREE.WebGLRenderTarget(W, H, { ...rtOpts(), depthBuffer: true, samples: sceneSamples });
    const halfW = Math.max(1, W >> 1);
    const halfH = Math.max(1, H >> 1);
    const newLevels = levelCountForSize(W, H);
    const down = [];
    for (let i = 0; i < newLevels; i++) {
      const dw = Math.max(1, W >> (i + 1));
      const dh = Math.max(1, H >> (i + 1));
      down.push(new THREE.WebGLRenderTarget(dw, dh, rtOpts()));
    }
    const bloomPing = new THREE.WebGLRenderTarget(Math.max(1, W >> newLevels), Math.max(1, H >> newLevels), rtOpts());
    const bloomPong = new THREE.WebGLRenderTarget(halfW, halfH, rtOpts());
    return { rtScene, halfW, halfH, levels: newLevels, down, bloomPing, bloomPong };
  }

  let { rtScene, halfW, halfH, levels, down, bloomPing, bloomPong } = createRenderTargets();

  // ---- fullscreen quad (one geometry, one mesh, swapped material per pass) ----
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
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
  const upsampleMat = mkMat(UPSAMPLE_FRAG, {
    tCoarse: { value: null },
    tFine: { value: null },
    uTexel: { value: new THREE.Vector2(1 / halfW, 1 / halfH) },
    uWeight: { value: 0.65 },                               // coarse-glow contribution per upsample step
  });
  const compositeMat = mkMat(COMPOSITE_FRAG, {
    tScene:     { value: null },
    tBloom:     { value: null },
    uStrength:  { value: strength },
    uExposure:  { value: exposure },
    uAces:      { value: aces },
    uGrain:     { value: 0.35 },   // film grain (cyberpunk-noir mood)
    uVignette:  { value: 0.85 },   // atmospheric corner fall-off
    uGrade:     { value: 0.55 },   // teal-shadow/amber-highlight color grade
    uGrainFrame: { value: 0 },
  });

  // draw the shared quad with a given material into a given target (null = screen)
  function blit(material, target) {
    quadMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  function render(scene, camera) {
    // Fast path / fallback: bloom off OR strength ~0 — render straight to screen, no extra cost,
    // and (importantly) no risk of the post pipeline altering the image.
    if (!enabled || strength <= 0.0001) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const prevAutoClear = renderer.autoClear;

    // pass 0 — scene into HDR buffer (renderer applies its own tone-mapping here)
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    // from here we only draw the full-screen quad; disable autoClear so blits don't wipe each other
    renderer.autoClear = false;

    // ---- downsample chain: full -> ½ (bright-pass) -> ¼ -> ⅛ ----
    // level 0 reads the full-res scene with the bright-pass; deeper levels pass through.
    let src = rtScene.texture;
    for (let i = 0; i < levels; i++) {
      const sw = i === 0 ? W : Math.max(1, W >> i);
      const sh = i === 0 ? H : Math.max(1, H >> i);
      downsampleMat.uniforms.tDiffuse.value = src;
      downsampleMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      downsampleMat.uniforms.uThreshold.value = threshold;
      downsampleMat.uniforms.uBright.value = (i === 0) ? 1.0 : 0.0;
      blit(downsampleMat, down[i]);
      src = down[i].texture;
    }

    // ---- upsample chain: deepest level -> ½, ADDITIVELY blending each coarse level over the next
    // finer down level. The additive spread is what makes the halo wide. Two scratch RTs ping/pong;
    // `outRT`/`readRT` are local per-frame aliases so we never mutate the module-level refs mid-loop.
    // Step for i = levels-1 down to 1: upsample level i (coarse) + add level i-1 (fine) -> level i-1 size.
    let readTex = down[levels - 1].texture;            // coarsest pyramid level
    let outRT = bloomPing;
    let scratchRT = bloomPong;
    let finalTex = down[levels - 1].texture;            // result of the upsample chain (½-res if levels>1)
    for (let i = levels - 1; i >= 1; i--) {
      const targetW = Math.max(1, W >> i);              // output = finer level (down[i-1]) resolution
      const targetH = Math.max(1, H >> i);
      outRT.setSize(targetW, targetH);
      upsampleMat.uniforms.tCoarse.value = readTex;     // level i (coarse, to be spread up)
      upsampleMat.uniforms.tFine.value = down[i - 1].texture; // level i-1 (sharp brights to keep)
      upsampleMat.uniforms.uTexel.value.set(1 / targetW, 1 / targetH);
      upsampleMat.uniforms.uWeight.value = 0.65;
      blit(upsampleMat, outRT);
      finalTex = outRT.texture;
      // the just-written RT becomes the coarse input next iteration; reuse the other scratch as output
      readTex = finalTex;
      const used = outRT; outRT = scratchRT; scratchRT = used;
    }

    // pass 6 — composite to screen (sRGB-encoded, with cinematic post grade applied)
    compositeMat.uniforms.tScene.value = rtScene.texture;
    compositeMat.uniforms.tBloom.value = finalTex;
    compositeMat.uniforms.uStrength.value = strength;
    compositeMat.uniforms.uExposure.value = exposure;
    compositeMat.uniforms.uAces.value = aces;
    const timeS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    compositeMat.uniforms.uGrainFrame.value = Math.floor(timeS * FILM_GRAIN_FPS);
    blit(compositeMat, null);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
  }

  function rebuild() {
    // WebGL context restore: the old render-target GPU textures are invalid. Dispose them and
    // recreate the whole pyramid at the current size so the next frame can render cleanly.
    rtScene.dispose();
    for (const rt of down) rt.dispose();
    bloomPing.dispose();
    bloomPong.dispose();
    const next = createRenderTargets();
    rtScene = next.rtScene;
    halfW = next.halfW;
    halfH = next.halfH;
    levels = next.levels;
    down = next.down;
    bloomPing = next.bloomPing;
    bloomPong = next.bloomPong;
    upsampleMat.uniforms.uTexel.value.set(1 / halfW, 1 / halfH);
  }

  function setSize(w, h) {
    W = Math.max(1, w | 0);
    H = Math.max(1, h | 0);
    halfW = Math.max(1, W >> 1);
    halfH = Math.max(1, H >> 1);
    const newLevels = levelCountForSize(W, H);
    rtScene.setSize(W, H);
    // grow/shrink the pyramid level array if depth changed (resize may cross the 320px threshold)
    while (down.length < newLevels) {
      const i = down.length;
      down.push(new THREE.WebGLRenderTarget(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)), rtOpts()));
    }
    while (down.length > newLevels) { const rt = down.pop(); rt.dispose(); }
    levels = newLevels;
    for (let i = 0; i < levels; i++) down[i].setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)));
    bloomPing.setSize(halfW, halfH);
    bloomPong.setSize(halfW, halfH);
    // per-level texel sizes are derived in render(); default uniforms stay roughly correct.
    upsampleMat.uniforms.uTexel.value.set(1 / halfW, 1 / halfH);
  }

  // Accept partial option updates (wired from settings:changed by the render layer).
  function setOptions(o) {
    if (!o) return;
    if (typeof o.enabled === 'boolean') enabled = o.enabled;
    if (typeof o.bloom === 'boolean') enabled = o.bloom; // settings.video.bloom alias
    if (typeof o.strength === 'number') strength = Math.max(0, o.strength);
    if (typeof o.bloomStrength === 'number') strength = Math.max(0, o.bloomStrength);
    if (typeof o.threshold === 'number') threshold = o.threshold;
    if (typeof o.bloomThreshold === 'number') threshold = o.bloomThreshold;
    if (typeof o.exposure === 'number') exposure = Math.max(0.1, o.exposure);
    if (typeof o.acesToneMapping === 'boolean') aces = o.acesToneMapping ? 1.0 : 0.0;
    // cinematic post grade (cyberpunk-noir) — adjustable via settings.video.*
    if (typeof o.grain === 'number') compositeMat.uniforms.uGrain.value = Math.max(0, Math.min(1, o.grain));
    if (typeof o.vignette === 'number') compositeMat.uniforms.uVignette.value = Math.max(0, Math.min(1, o.vignette));
    if (typeof o.grade === 'number') compositeMat.uniforms.uGrade.value = Math.max(0, Math.min(1, o.grade));
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
      grainSource: 'quantized-interleaved-gradient',
      grainFps: FILM_GRAIN_FPS,
      targets: 1 + down.length + 2,
      fullFramePasses: enabled && strength > 0.0001 ? 2 : 1,
      bloomPasses: enabled && strength > 0.0001 ? down.length + Math.max(0, down.length - 1) : 0,
    };
  }

  function dispose() {
    rtScene.dispose();
    for (const rt of down) rt.dispose();
    bloomPing.dispose();
    bloomPong.dispose();
    quadGeo.dispose();
    downsampleMat.dispose();
    upsampleMat.dispose();
    compositeMat.dispose();
  }

  return {
    render,
    setSize,
    setOptions,
    diagnostics,
    dispose,
    rebuild,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    get strength() { return strength; },
    set strength(v) { strength = Math.max(0, +v || 0); },
    get threshold() { return threshold; },
    set threshold(v) { threshold = +v; },
  };
}

// ARCHITECTURE §9 module table names the export `Bloom`; keep that alias available too.
export { createBloom as Bloom };
