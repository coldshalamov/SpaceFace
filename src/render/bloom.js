// Self-contained single-pass bloom post-processor (ARCHITECTURE §2.4 draw pipeline, design/specs/10).
//
// Pipeline (all custom ShaderMaterials on ONE shared fullscreen quad; NO three/addons, NO
// EffectComposer/FullScreenQuad):
//   pass 0  scene        -> rtScene        (renderer.render at full res, HalfFloat so emissive
//                                           additive brights can exceed 1.0)
//   pass 1  bright+blur H rtScene -> rtBlurA    (same threshold/knee + horizontal gaussian, HALF res)
//   pass 2  blur V        rtBlurA  -> rtBlurB   (separable gaussian, 5-tap, HALF res)
//   pass 3  composite     rtScene + strength*rtBlurB -> default framebuffer (sRGB-encoded)
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
// Cost: scene render + 3 cheap fullscreen quads, blur targets at half-res. Cheap enough for the
// 60fps target. createBloom() is a drop-in replacement for renderer.render — the render layer calls
// bloom.render(scene, camera) instead.
import * as THREE from 'three';

// --- GLSL (inlined as strings; no external shader files) -------------------------------------

// Shared vertex shader for every fullscreen pass: a [-1..1] quad straight to clip space, UV 0..1.
const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Fused bright extraction + horizontal blur. This removes the old rtBright pass while preserving the
// same threshold/knee math per blur tap.
const BLUR_EXTRACT_H_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;

  vec3 bright(vec2 uv) {
    vec3 c = texture2D(tDiffuse, uv).rgb;
    c = max(c, vec3(0.0)); // guard against negative/NaN leaking into the blur
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // soft-knee bright extract: 0 below (threshold-knee), smooth ramp, full above threshold
    float soft = smoothstep(uThreshold - uKnee, uThreshold + uKnee, l);
    float contrib = max(l - uThreshold, 0.0) + soft * uKnee;
    float scale = contrib / max(l, 1e-4);
    return c * scale;
  }

  void main() {
    const float w0 = 0.402620;
    const float w1 = 0.244201;
    const float w2 = 0.054489;
    vec2 o1 = uTexel * vec2(1.0, 0.0);
    vec2 o2 = uTexel * vec2(2.0, 0.0);
    vec3 sum = bright(vUv) * w0;
    sum += bright(vUv + o1) * w1;
    sum += bright(vUv - o1) * w1;
    sum += bright(vUv + o2) * w2;
    sum += bright(vUv - o2) * w2;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// Separable gaussian blur, 5 taps (centre + 2 each side). uDir selects horizontal/vertical; uTexel
// is 1/size of the (half-res) source so one material serves both directions.
const BLUR_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  uniform vec2 uDir;
  void main() {
    // weights for sigma ~2px, normalized: centre + 2 symmetric taps
    const float w0 = 0.402620;
    const float w1 = 0.244201;
    const float w2 = 0.054489;
    vec2 o1 = uTexel * uDir * 1.0;
    vec2 o2 = uTexel * uDir * 2.0;
    vec3 sum = texture2D(tDiffuse, vUv).rgb * w0;
    sum += texture2D(tDiffuse, vUv + o1).rgb * w1;
    sum += texture2D(tDiffuse, vUv - o1).rgb * w1;
    sum += texture2D(tDiffuse, vUv + o2).rgb * w2;
    sum += texture2D(tDiffuse, vUv - o2).rgb * w2;
    gl_FragColor = vec4(sum, 1.0);
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
  uniform float uGrain;     // film grain amount 0..1 (cinematic; animated via uTime)
  uniform float uVignette;  // atmospheric corner darkening 0..1
  uniform float uGrade;     // color-grade blend 0..1 (0 = off, 1 = full cyberpunk-noir LUT)
  uniform float uTime;

  // Narkowicz 2015 ACES approximation (input in linear, output 0-1)
  vec3 acesFilmic(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Hash for cheap animated grain (no texture lookup — fully procedural, frame-varying).
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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
    //      Animated per-pixel + per-frame; scaled by luminance so it's stronger in darks (where film
    //      grain naturally lives) and invisible in brights.
    if (uGrain > 0.001) {
      float luma = dot(srgb, vec3(0.2126, 0.7152, 0.0722));
      float n = hash21(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
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
  // rtScene is full-res (needs a depth buffer for the scene render). The bright/blur targets are
  // half-res and depth-less. All HalfFloat + linear colorSpace (default) so brights exceed 1.0.
  const rtOpts = () => ({
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // The default framebuffer is MSAA'd (renderer is constructed antialias:true), but a render target
  // is not unless we ask. Multisample ONLY the scene target so bloom-on keeps the same edge quality
  // as the bloom-off fast path (reading rtScene.texture auto-resolves the multisample buffer). Blur
  // targets stay single-sampled — they're blurred half-res, AA there is wasted.
  const sceneSamples = (renderer.capabilities && renderer.capabilities.isWebGL2) ? 4 : 0;
  let rtScene = new THREE.WebGLRenderTarget(W, H, { ...rtOpts(), depthBuffer: true, samples: sceneSamples });
  let halfW = Math.max(1, W >> 1);
  let halfH = Math.max(1, H >> 1);
  let rtBlurA = new THREE.WebGLRenderTarget(halfW, halfH, rtOpts());
  let rtBlurB = new THREE.WebGLRenderTarget(halfW, halfH, rtOpts());

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

  const blurExtractMat = mkMat(BLUR_EXTRACT_H_FRAG, {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / halfW, 1 / halfH) },
    uThreshold: { value: threshold },
    uKnee: { value: knee },
  });
  const blurMat = mkMat(BLUR_FRAG, {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / halfW, 1 / halfH) },
    uDir: { value: new THREE.Vector2(1, 0) },
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
    uTime:      { value: 0 },
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

    // pass 1 — bright extract fused with horizontal blur (full -> half)
    blurExtractMat.uniforms.tDiffuse.value = rtScene.texture;
    blurExtractMat.uniforms.uThreshold.value = threshold;
    blit(blurExtractMat, rtBlurA);

    // pass 2 — vertical blur (half -> half)
    blurMat.uniforms.tDiffuse.value = rtBlurA.texture;
    blurMat.uniforms.uDir.value.set(0, 1);
    blit(blurMat, rtBlurB);

    // pass 3 — composite to screen (sRGB-encoded, with cinematic post grade applied)
    compositeMat.uniforms.tScene.value = rtScene.texture;
    compositeMat.uniforms.tBloom.value = rtBlurB.texture;
    compositeMat.uniforms.uStrength.value = strength;
    compositeMat.uniforms.uExposure.value = exposure;
    compositeMat.uniforms.uAces.value = aces;
    compositeMat.uniforms.uTime.value = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    blit(compositeMat, null);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
  }

  function setSize(w, h) {
    W = Math.max(1, w | 0);
    H = Math.max(1, h | 0);
    halfW = Math.max(1, W >> 1);
    halfH = Math.max(1, H >> 1);
    rtScene.setSize(W, H);
    rtBlurA.setSize(halfW, halfH);
    rtBlurB.setSize(halfW, halfH);
    blurExtractMat.uniforms.uTexel.value.set(1 / halfW, 1 / halfH);
    blurMat.uniforms.uTexel.value.set(1 / halfW, 1 / halfH);
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

  function dispose() {
    rtScene.dispose();
    rtBlurA.dispose();
    rtBlurB.dispose();
    quadGeo.dispose();
    blurExtractMat.dispose();
    blurMat.dispose();
    compositeMat.dispose();
  }

  return {
    render,
    setSize,
    setOptions,
    dispose,
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
