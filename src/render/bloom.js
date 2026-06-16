// Self-contained single-pass bloom post-processor (ARCHITECTURE §2.4 draw pipeline, design/specs/10).
//
// Pipeline (all custom ShaderMaterials on ONE shared fullscreen quad; NO three/addons, NO
// EffectComposer/FullScreenQuad):
//   pass 0  scene        -> rtScene        (renderer.render at full res, HalfFloat so emissive
//                                           additive brights can exceed 1.0)
//   pass 1  bright-pass   rtScene -> rtBright   (luminance threshold + soft knee, HALF res)
//   pass 2  blur H        rtBright -> rtBlurA   (separable gaussian, 5-tap, HALF res)
//   pass 3  blur V        rtBlurA  -> rtBlurB   (separable gaussian, 5-tap, HALF res)
//   pass 4  composite     rtScene + strength*rtBlurB -> default framebuffer (sRGB-encoded)
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
// Cost: scene render + 4 cheap fullscreen quads, blur targets at half-res. Cheap enough for the
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

// Bright-pass: keep only the part of each pixel whose luminance exceeds the threshold, with a soft
// knee so the bloom ramps in smoothly instead of hard-clipping. Preserves hue (scales the colour by
// the contribution ratio). Formula per design/specs/10.
const BRIGHT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    c = max(c, vec3(0.0)); // guard against negative/NaN leaking into the blur
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // soft-knee bright extract: 0 below (threshold-knee), smooth ramp, full above threshold
    float soft = smoothstep(uThreshold - uKnee, uThreshold + uKnee, l);
    float contrib = max(l - uThreshold, 0.0) + soft * uKnee;
    float scale = contrib / max(l, 1e-4);
    gl_FragColor = vec4(c * scale, 1.0);
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

// Composite: scene + strength*bloom, then manual sRGB encode. The clamp-first keeps NaN/negatives
// from the HDR buffer from poisoning the output. At uStrength == 0 this equals encode(rtScene),
// which is exactly what the renderer would have written to screen — the invariant.
const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uStrength;
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 c = scene + bloom * uStrength;
    c = clamp(c, 0.0, 1.0);
    // linear -> sRGB (matches three's SRGBColorSpace output transform)
    vec3 srgb = mix(1.055 * pow(c, vec3(1.0 / 2.4)) - vec3(0.055), c * 12.92, step(c, vec3(0.0031308)));
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
  let rtBright = new THREE.WebGLRenderTarget(halfW, halfH, rtOpts());
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

  const brightMat = mkMat(BRIGHT_FRAG, {
    tDiffuse: { value: null },
    uThreshold: { value: threshold },
    uKnee: { value: knee },
  });
  const blurMat = mkMat(BLUR_FRAG, {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / halfW, 1 / halfH) },
    uDir: { value: new THREE.Vector2(1, 0) },
  });
  const compositeMat = mkMat(COMPOSITE_FRAG, {
    tScene: { value: null },
    tBloom: { value: null },
    uStrength: { value: strength },
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

    // pass 1 — bright extract (full -> half)
    brightMat.uniforms.tDiffuse.value = rtScene.texture;
    brightMat.uniforms.uThreshold.value = threshold;
    blit(brightMat, rtBright);

    // pass 2 — horizontal blur (half -> half)
    blurMat.uniforms.tDiffuse.value = rtBright.texture;
    blurMat.uniforms.uDir.value.set(1, 0);
    blit(blurMat, rtBlurA);

    // pass 3 — vertical blur (half -> half)
    blurMat.uniforms.tDiffuse.value = rtBlurA.texture;
    blurMat.uniforms.uDir.value.set(0, 1);
    blit(blurMat, rtBlurB);

    // pass 4 — composite to screen (sRGB-encoded)
    compositeMat.uniforms.tScene.value = rtScene.texture;
    compositeMat.uniforms.tBloom.value = rtBlurB.texture;
    compositeMat.uniforms.uStrength.value = strength;
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
    rtBright.setSize(halfW, halfH);
    rtBlurA.setSize(halfW, halfH);
    rtBlurB.setSize(halfW, halfH);
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
  }

  function dispose() {
    rtScene.dispose();
    rtBright.dispose();
    rtBlurA.dispose();
    rtBlurB.dispose();
    quadGeo.dispose();
    brightMat.dispose();
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
