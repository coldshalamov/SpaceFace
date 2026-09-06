// SpaceFace Flight V3 — capability-aware HDR render graph.
//
// This is an integration-grade replacement for a monolithic bloom wrapper. It
// preserves the existing renderer's strongest choices (half-float scene color,
// ACES, PMREM, selective emissive radiance) while adding explicit depth/normal,
// GTAO-lite, multi-scale bloom and one final color-management pass.
//
// Deliberately absent: fake TAA without motion vectors. The graph exposes a
// velocityTexture hook, but temporal resolve must only be enabled after ships,
// particles and camera publish correct motion vectors. Ghosting is not modernity.

import * as THREE from 'three';
import {
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_POST_PRESENTATION,
  POST_GRAIN_FPS,
  resolveEffectiveSectorPost,
  SPACE_POST_PRESENTATION_GLSL,
} from '../bloom.js';
import { recordPostRenderTargetAllocation } from '../postTelemetry.js';

const POST_DEFAULTS = Object.freeze({
  bloom: true,
  bloomThreshold: 1.0,
  exposure: 1.0,
  acesToneMapping: true,
  ...DEFAULT_POST_PRESENTATION,
});

function hideInactiveInstancedMeshes(scene, hidden) {
  hidden.length = 0;
  if (!scene || typeof scene.traverseVisible !== 'function') return;
  scene.traverseVisible((object) => {
    if (!object?.isInstancedMesh || !(Number(object.count) <= 0) || !object.layers?.mask) return;
    // A zero-instance mesh has no pixels, but its children may. Suppress only its own draw;
    // visibility=false would also remove any live child from Three's traversal.
    hidden.push(object, object.layers.mask);
    object.layers.mask = 0;
  });
}

function restoreInactiveInstancedMeshes(hidden) {
  for (let index = 0; index < hidden.length; index += 2) hidden[index].layers.mask = hidden[index + 1];
  hidden.length = 0;
}

const FULLSCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const AO_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 uInvResolution;
  uniform mat4 uProjectionInv;
  uniform float uNear;
  uniform float uFar;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uBias;

  float linearDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / max(uFar + uNear - z * (uFar - uNear), 1e-5);
  }

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjectionInv * clip;
    return view.xyz / max(view.w, 1e-6);
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 0.999999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = viewPosition(vUv, depth);
    vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
    float z = linearDepth(depth);
    float pixelRadius = clamp(uRadius / max(z, 0.25), 1.5, 18.0);

    const int SAMPLES = 12;
    vec2 dirs[SAMPLES];
    dirs[0]=vec2(1.0,0.0); dirs[1]=vec2(-1.0,0.0);
    dirs[2]=vec2(0.0,1.0); dirs[3]=vec2(0.0,-1.0);
    dirs[4]=normalize(vec2(1.0,1.0)); dirs[5]=normalize(vec2(-1.0,1.0));
    dirs[6]=normalize(vec2(1.0,-1.0)); dirs[7]=normalize(vec2(-1.0,-1.0));
    dirs[8]=normalize(vec2(2.0,1.0)); dirs[9]=normalize(vec2(-2.0,1.0));
    dirs[10]=normalize(vec2(1.0,2.0)); dirs[11]=normalize(vec2(-1.0,-2.0));

    float occ = 0.0;
    float weight = 0.0;
    for (int i=0; i<SAMPLES; i++) {
      float ring = 0.35 + 0.65 * float((i % 3) + 1) / 3.0;
      vec2 suv = clamp(vUv + dirs[i] * uInvResolution * pixelRadius * ring, vec2(0.001), vec2(0.999));
      float sd = texture2D(tDepth, suv).x;
      if (sd >= 0.999999) continue;
      vec3 q = viewPosition(suv, sd);
      vec3 d = q - p;
      float dist = length(d);
      float nd = max(0.0, dot(n, d / max(dist, 1e-5)) - uBias);
      float range = 1.0 - smoothstep(uRadius * 0.25, uRadius * 1.35, dist);
      occ += nd * range;
      weight += range;
    }
    float ao = 1.0 - clamp((occ / max(weight, 1e-4)) * uIntensity, 0.0, 0.88);
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;

const BILATERAL_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tAo;
  uniform sampler2D tDepth;
  uniform vec2 uInvResolution;
  uniform vec2 uDirection;
  uniform float uSharpness;

  void main() {
    float centerDepth = texture2D(tDepth, vUv).x;
    float sum = 0.0;
    float wsum = 0.0;
    for (int i=-3; i<=3; i++) {
      float fi = float(i);
      vec2 uv = vUv + uDirection * uInvResolution * fi;
      float d = texture2D(tDepth, uv).x;
      float ao = texture2D(tAo, uv).r;
      float spatial = exp(-fi * fi * 0.34);
      float depthW = exp(-abs(d - centerDepth) * uSharpness);
      float w = spatial * depthW;
      sum += ao * w;
      wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / max(wsum, 1e-5)), 1.0);
  }
`;

const BLOOM_DOWN_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSource;
  uniform vec2 uInvSource;
  uniform float uThreshold;
  uniform float uKnee;
  uniform float uFirst;

  vec3 sampleBox(vec2 uv) {
    vec2 o = uInvSource * 0.75;
    return (texture2D(tSource, uv + vec2(-o.x,-o.y)).rgb +
            texture2D(tSource, uv + vec2( o.x,-o.y)).rgb +
            texture2D(tSource, uv + vec2(-o.x, o.y)).rgb +
            texture2D(tSource, uv + vec2( o.x, o.y)).rgb) * 0.25;
  }

  vec3 bright(vec3 c) {
    float l = max(max(c.r, c.g), c.b);
    float soft = clamp((l - uThreshold + uKnee) / max(2.0 * uKnee, 1e-5), 0.0, 1.0);
    soft = soft * soft * (3.0 - 2.0 * soft);
    float contribution = max(l - uThreshold, 0.0) + soft * uKnee;
    return c * contribution / max(l, 1e-4);
  }

  void main() {
    vec3 c = max(sampleBox(vUv), vec3(0.0));
    gl_FragColor = vec4(mix(c, bright(c), uFirst), 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tAo;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform sampler2D tBloom3;
  uniform sampler2D tDistortion;
  uniform float uDistortion;
  uniform float uBloomStrength;
  uniform float uBloomNorm;
  uniform float uAoStrength;
  uniform float uExposure;
  uniform float uAces;
  uniform float uGrade;
  uniform float uToe;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uGrainFrame;

  ${SPACE_POST_PRESENTATION_GLSL}
  void main() {
    vec4 distortion = texture2D(tDistortion, vUv);
    // DistortionField stores signed offsets in LDR RG around a 0.5 neutral
    // midpoint. The blue envelope masks the black (inactive) clear pixels.
    vec2 warp = (distortion.xy * 2.0 - 1.0)
      * step(1e-5, distortion.z) * uDistortion;
    vec2 uv = clamp(vUv + warp, vec2(0.0), vec2(1.0));
    vec3 scene = texture2D(tScene, uv).rgb;
    float ao = texture2D(tAo, vUv).r;
    vec3 bloom = texture2D(tBloom0,vUv).rgb * 0.50 +
                 texture2D(tBloom1,vUv).rgb * 0.28 +
                 texture2D(tBloom2,vUv).rgb * 0.15 +
                 texture2D(tBloom3,vUv).rgb * 0.07;
    vec3 aoScene = scene * mix(1.0, ao, uAoStrength);
    vec3 spill = bloom * uBloomStrength * uBloomNorm;
    gl_FragColor = vec4(composeSpacePostPresentation(
      aoScene, spill, vUv, gl_FragCoord.xy, uExposure, uAces,
      uGrade, uToe, uVignette, uGrain, uGrainFrame
    ), 1.0);
  }
`;

export class SpaceRenderGraph {
  constructor(renderer, options = {}) {
    if (!renderer || !renderer.isWebGLRenderer) throw new TypeError('SpaceRenderGraph requires THREE.WebGLRenderer');
    this.renderer = renderer;
    const post = resolveEffectiveSectorPost(options, null, POST_DEFAULTS);
    this.options = {
      enabled: options.enabled !== false,
      ao: options.ao !== false,
      bloom: post.bloom !== false,
      renderScale: clamp(finite(options.renderScale, 1), 0.5, 1),
      aoScale: clamp(finite(options.aoScale, 0.5), 0.25, 1),
      bloomStrength: post.bloomStrength,
      bloomThreshold: post.bloomThreshold,
      bloomKnee: finite(options.bloomKnee, 0.18),
      aoStrength: finite(options.aoStrength, 0.72),
      exposure: post.exposure,
      acesToneMapping: post.acesToneMapping,
      grade: post.grade,
      toe: post.toe,
      vignette: post.vignette,
      grain: post.grain,
    };
    this.width = 1;
    this.height = 1;
    this.time = 0;
    this.capabilities = Object.freeze({
      webgl2: !!renderer.capabilities.isWebGL2,
      halfFloat: true,
      temporal: false,
      reasonTemporalDisabled: 'motion-vector pass not connected',
    });

    this.neutralAoTexture = solidTexture(255, 255, 255, 255);
    this.blackBloomTexture = solidTexture(0, 0, 0, 255);

    this.normalMaterial = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending });
    this.normalMaterial.name = 'SpaceRenderGraph:normal-prepass';
    this._hiddenNormalPassInstances = [];
    this.quad = new FullscreenQuad();
    this.aoMaterial = shaderMaterial(AO_FRAG, {
      tDepth: null, tNormal: null, uInvResolution: new THREE.Vector2(1,1),
      uProjectionInv: new THREE.Matrix4(), uNear: 0.1, uFar: 4000,
      uRadius: 10, uIntensity: 1.2, uBias: 0.02,
    });
    this.blurMaterial = shaderMaterial(BILATERAL_FRAG, {
      tAo: null, tDepth: null, uInvResolution: new THREE.Vector2(1,1),
      uDirection: new THREE.Vector2(1,0), uSharpness: 700,
    });
    this.bloomMaterial = shaderMaterial(BLOOM_DOWN_FRAG, {
      tSource: null, uInvSource: new THREE.Vector2(1,1),
      uThreshold: this.options.bloomThreshold, uKnee: this.options.bloomKnee, uFirst: 1,
    });
    this.compositeMaterial = shaderMaterial(COMPOSITE_FRAG, {
      tScene:null, tAo:null, tBloom0:null, tBloom1:null, tBloom2:null, tBloom3:null,
      tDistortion: this.blackBloomTexture, uDistortion: 0,
      uBloomStrength:this.options.bloomStrength, uBloomNorm:1.5, uAoStrength:this.options.aoStrength,
      uExposure:this.options.exposure, uAces:this.options.acesToneMapping === false ? 0 : 1,
      uGrade:this.options.grade, uToe:this.options.toe,
      uVignette:this.options.vignette, uGrain:this.options.grain, uGrainFrame:0,
    });
    this.distortionField = null;
    this.distortionProducers = null;
    this.distortionTarget = null;
    this._distortionLive = false;
    this._distortionProducerLiveCount = 0;
    this._rendererClearColorScratch = new THREE.Color();
    this._distortionNeutralClear = new THREE.Color(0.5, 0.5, 0);
    this.setOptions({});
    this._allocate();
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this._allocate();
  }

  setOptions(patch = {}) {
    const previousRenderScale = this.options.renderScale;
    const previousAoScale = this.options.aoScale;
    const previousAo = this.options.ao;
    Object.assign(this.options, patch);
    this.options.ao = this.options.ao !== false;
    this.options.renderScale = clamp(finite(this.options.renderScale, 1), 0.5, 1);
    this.options.aoScale = clamp(finite(this.options.aoScale, 0.5), 0.25, 1);
    const post = resolveEffectiveSectorPost(this.options, null, POST_DEFAULTS);
    this.options.bloom = post.bloom !== false;
    this.options.bloomStrength = post.bloomStrength;
    this.options.bloomThreshold = post.bloomThreshold;
    this.options.exposure = post.exposure;
    this.options.acesToneMapping = post.acesToneMapping;
    this.options.grade = post.grade;
    this.options.toe = post.toe;
    this.options.vignette = post.vignette;
    this.options.grain = post.grain;
    const u = this.compositeMaterial.uniforms;
    u.uBloomStrength.value = this._effectiveBloomStrength();
    u.uAoStrength.value = this.options.ao ? finite(this.options.aoStrength, 0.72) : 0;
    u.uExposure.value = finite(this.options.exposure, 1);
    u.uAces.value = this.options.acesToneMapping === false ? 0 : 1;
    u.uGrade.value = finite(this.options.grade, 0);
    u.uToe.value = finite(this.options.toe, 0);
    u.uVignette.value = finite(this.options.vignette, 0);
    u.uGrain.value = finite(this.options.grain, 0);
    this.bloomMaterial.uniforms.uThreshold.value = finite(this.options.bloomThreshold, POST_DEFAULTS.bloomThreshold);
    this.bloomMaterial.uniforms.uKnee.value = finite(this.options.bloomKnee, 0.18);
    if (this.sceneTarget && (previousRenderScale !== this.options.renderScale
      || previousAoScale !== this.options.aoScale || previousAo !== this.options.ao)) {
      this._allocate();
    }
  }

  render(scene, camera, frame = {}) {
    const renderer = this.renderer;
    this.time = finite(frame.time, this.time + finite(frame.dt, 1/60));
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousOverride = scene.overrideMaterial;
    renderer.autoClear = true;

    try {
      renderer.setRenderTarget(this.sceneTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      if (this.options.ao) {
        scene.overrideMaterial = this.normalMaterial;
        renderer.setRenderTarget(this.normalTarget);
        renderer.clear(true, true, true);
        hideInactiveInstancedMeshes(scene, this._hiddenNormalPassInstances);
        try {
          renderer.render(scene, camera);
        } finally {
          restoreInactiveInstancedMeshes(this._hiddenNormalPassInstances);
          scene.overrideMaterial = previousOverride;
        }
        this._renderAo(camera);
      }
      if (this._bloomActive()) this._renderBloom();
      this._renderDistortion(camera);
      this._renderComposite(frame.outputTarget || null);
    } finally {
      scene.overrideMaterial = previousOverride;
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget);
    }
  }

  get sceneColorTexture() { return this.sceneTarget.texture; }
  get depthTexture() { return this.sceneTarget.depthTexture; }
  get distortionTexture() { return this.distortionTarget ? this.distortionTarget.texture : null; }

  // Compatibility: one DistortionField. Prefer attachDistortionProducers when the presenter
  // owns weapon haze plus well slots. Either path is a no-op on the bloom/native route —
  // SpaceRenderGraph only runs when settings.video.renderGraph is true.
  attachDistortionField(field) {
    this.distortionField = field || null;
  }

  // Stable preallocated collection (weapon haze + well DistortionField pool). The graph never
  // allocates this array; callers must pass the same collection each attach. Clear once, then
  // render every live producer.scene. Asleep when no producer reports hasLive.
  attachDistortionProducers(producers) {
    this.distortionProducers = Array.isArray(producers) ? producers : null;
  }
  get normalTexture() { return this.normalTarget ? this.normalTarget.texture : null; }

  diagnostics() {
    return {
      width: this.width,
      height: this.height,
      drawingBufferWidth: this.width,
      drawingBufferHeight: this.height,
      sceneTargetWidth: this.sceneTarget.width,
      sceneTargetHeight: this.sceneTarget.height,
      renderScale: this.options.renderScale,
      effectiveSceneScale: this.sceneTarget.width / this.width,
      aoScale: this.options.aoScale,
      ao: !!this.options.ao,
      bloom: !!this.options.bloom,
      bloomStrength: finite(this.options.bloomStrength, DEFAULT_BLOOM_STRENGTH),
      bloomThreshold: finite(this.options.bloomThreshold, POST_DEFAULTS.bloomThreshold),
      effectiveBloomStrength: this._effectiveBloomStrength(),
      postStyleScale: 1,
      exposure: finite(this.options.exposure, 1),
      acesToneMapping: this.options.acesToneMapping !== false,
      grade: finite(this.options.grade, 0),
      toe: finite(this.options.toe, 0),
      vignette: finite(this.options.vignette, 0),
      grain: finite(this.options.grain, 0),
      grainSource: 'quantized-interleaved-gradient',
      grainFps: POST_GRAIN_FPS,
      bloomLevels: this.bloomTargets.length,
      fullFramePasses: 2 + (this.options.ao ? 1 : 0),
      bloomPasses: this._bloomActive() ? this.bloomTargets.length : 0,
      renderTargetCount: 1 + (this.options.ao ? 3 : 0) + this.bloomTargets.length + 1,
      presentationComposite: true,
      presentationParity: 'canonical-base-ao-off-bloom-neutral',
      bloomKernelParity: false,
      passFamilies: {
        scene: 1,
        normal: this.options.ao ? 1 : 0,
        ao: this.options.ao ? 3 : 0,
        bloom: this._bloomActive() ? this.bloomTargets.length : 0,
        distortion: this._distortionLive ? 1 : 0,
        composite: 1,
      },
      distortionProducers: this._distortionProducerLiveCount,
      temporal: false,
      capabilities: this.capabilities,
    };
  }

  openingProgramMaterials() {
    const materials = [this.compositeMaterial];
    if (this.options.ao) materials.push(this.normalMaterial, this.aoMaterial, this.blurMaterial);
    if (this._bloomActive()) materials.push(this.bloomMaterial);
    return materials;
  }

  async prepareResources(options = {}) {
    const renderer = this.renderer;
    const yieldToMain = typeof options.yieldToMain === 'function'
      ? options.yieldToMain
      : () => Promise.resolve();
    if (!renderer || typeof renderer.initRenderTarget !== 'function') {
      return { skipped: true, reason: 'initRenderTarget unavailable', targets: 0 };
    }
    const targets = [
      this.sceneTarget,
      ...(this.options.ao ? [this.normalTarget, this.aoTarget, this.aoBlurTarget] : []),
      ...(this._bloomActive() ? this.bloomTargets : []),
      // Composite warms against this private destination, but never samples it during admission.
      this.distortionTarget,
    ].filter(Boolean);
    const previousTarget = typeof renderer.getRenderTarget === 'function'
      ? renderer.getRenderTarget()
      : null;
    const previousMaterial = this.quad.mesh.material;
    const previousDistortionLive = this._distortionLive;
    try {
      for (const target of targets) {
        await yieldToMain();
        renderer.initRenderTarget(target);
      }
      if (this.options.ao && typeof options.prepareNormalSubjects === 'function') {
        await options.prepareNormalSubjects();
      }
      if (this.options.ao) this._renderAo(options.camera);
      if (this._bloomActive()) this._renderBloom();
      // A real private draw admits the fullscreen quad geometry and its input textures even when
      // AO and bloom are off. Distortion is neutral here, so the destination is never sampled.
      this._distortionLive = false;
      this._renderComposite(this.distortionTarget);
      this.quad.mesh.material = this.compositeMaterial;
      renderer.setRenderTarget(null);
      if (typeof renderer.compile === 'function') renderer.compile(this.quad.scene, this.quad.camera);
    } finally {
      this._distortionLive = previousDistortionLive;
      this.quad.mesh.material = previousMaterial;
      if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(previousTarget || null);
    }
    await yieldToMain();
    return { skipped: false, targets: targets.length };
  }

  contextLossResources() {
    return [
      this.sceneTarget,
      this.normalTarget,
      this.aoTarget,
      this.aoBlurTarget,
      this.distortionTarget,
      ...(this.bloomTargets || []),
    ].filter(Boolean);
  }

  dispose() {
    this._disposeTargets();
    this.normalMaterial.dispose();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.bloomMaterial.dispose();
    this.compositeMaterial.dispose();
    this.neutralAoTexture.dispose();
    this.blackBloomTexture.dispose();
    this.quad.dispose();
  }

  _renderAo(camera) {
    const renderer = this.renderer;
    const aoU = this.aoMaterial.uniforms;
    aoU.tDepth.value = this.sceneTarget.depthTexture;
    aoU.tNormal.value = this.normalTarget.texture;
    aoU.uInvResolution.value.set(1/this.aoTarget.width, 1/this.aoTarget.height);
    aoU.uProjectionInv.value.copy(camera.projectionMatrixInverse);
    aoU.uNear.value = camera.near;
    aoU.uFar.value = camera.far;
    this.quad.render(renderer, this.aoMaterial, this.aoTarget);

    const blurU = this.blurMaterial.uniforms;
    blurU.tDepth.value = this.sceneTarget.depthTexture;
    blurU.uInvResolution.value.set(1/this.aoTarget.width, 1/this.aoTarget.height);
    blurU.tAo.value = this.aoTarget.texture;
    blurU.uDirection.value.set(1,0);
    this.quad.render(renderer, this.blurMaterial, this.aoBlurTarget);
    blurU.tAo.value = this.aoBlurTarget.texture;
    blurU.uDirection.value.set(0,1);
    this.quad.render(renderer, this.blurMaterial, this.aoTarget);
  }

  _renderBloom() {
    const renderer = this.renderer;
    const u = this.bloomMaterial.uniforms;
    let source = this.sceneTarget.texture;
    let sourceW = this.sceneTarget.width;
    let sourceH = this.sceneTarget.height;
    for (let i=0; i<this.bloomTargets.length; i++) {
      const target = this.bloomTargets[i];
      u.tSource.value = source;
      u.uInvSource.value.set(1/sourceW, 1/sourceH);
      u.uFirst.value = i === 0 ? 1 : 0;
      u.uThreshold.value = this.options.bloomThreshold;
      this.quad.render(renderer, this.bloomMaterial, target);
      source = target.texture;
      sourceW = target.width;
      sourceH = target.height;
    }
  }

  _renderComposite(outputTarget) {
    const u = this.compositeMaterial.uniforms;
    u.tScene.value = this.sceneTarget.texture;
    u.tAo.value = this.options.ao ? this.aoTarget.texture : this.neutralAoTexture;
    const bloomActive = this._bloomActive();
    u.tBloom0.value = bloomActive ? this.bloomTargets[0].texture : this.blackBloomTexture;
    u.tBloom1.value = bloomActive ? this.bloomTargets[1].texture : this.blackBloomTexture;
    u.tBloom2.value = bloomActive ? this.bloomTargets[2].texture : this.blackBloomTexture;
    u.tBloom3.value = bloomActive ? this.bloomTargets[3].texture : this.blackBloomTexture;
    u.tDistortion.value = this._distortionLive && this.distortionTarget
      ? this.distortionTarget.texture
      : this.blackBloomTexture;
    u.uDistortion.value = this._distortionLive ? 1 : 0;
    u.uBloomStrength.value = this._effectiveBloomStrength();
    u.uGrainFrame.value = Math.floor(this.time * POST_GRAIN_FPS);
    this.quad.render(this.renderer, this.compositeMaterial, outputTarget);
  }

  _effectiveBloomStrength() {
    return this.options.bloom === false
      ? 0
      : Math.max(0, finite(this.options.bloomStrength, DEFAULT_BLOOM_STRENGTH));
  }

  _bloomActive() {
    return this._effectiveBloomStrength() > 0.0001;
  }

  _allocate() {
    this._disposeTargets();
    const rw = Math.max(1, Math.floor(this.width * this.options.renderScale));
    const rh = Math.max(1, Math.floor(this.height * this.options.renderScale));
    this.sceneTarget = hdrTarget(rw, rh, true, this.capabilities.webgl2 ? 4 : 0);
    this.normalTarget = null;
    this.aoTarget = null;
    this.aoBlurTarget = null;
    if (this.options.ao) {
      this.normalTarget = ldrTarget(rw, rh, true);
      const aw = Math.max(1, Math.floor(rw * this.options.aoScale));
      const ah = Math.max(1, Math.floor(rh * this.options.aoScale));
      this.aoTarget = ldrTarget(aw, ah, false);
      this.aoBlurTarget = ldrTarget(aw, ah, false);
    }
    this.bloomTargets = [];
    let bw = Math.max(1, rw >> 1), bh = Math.max(1, rh >> 1);
    for (let i=0; i<4; i++) {
      this.bloomTargets.push(hdrTarget(bw,bh,false,0));
      bw = Math.max(1,bw>>1); bh = Math.max(1,bh>>1);
    }
    const dw = Math.max(1, rw >> 1);
    const dh = Math.max(1, rh >> 1);
    this.distortionTarget = ldrTarget(dw, dh, false);
    this.distortionTarget.texture.name = 'SpaceRenderGraph:Distortion';
  }

  _forEachDistortionProducer(fn) {
    const collection = this.distortionProducers;
    if (collection && collection.length) {
      for (let i = 0; i < collection.length; i++) fn(collection[i]);
      return;
    }
    if (this.distortionField) fn(this.distortionField);
  }

  _renderDistortion(camera) {
    this._distortionLive = false;
    this._distortionProducerLiveCount = 0;
    if (!this.distortionTarget || !camera) return;
    let liveCount = 0;
    this._forEachDistortionProducer((producer) => {
      if (producer && producer.hasLive && producer.scene) liveCount++;
    });
    if (liveCount === 0) return;
    const renderer = this.renderer;
    const priorClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._rendererClearColorScratch);
    const priorAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.setClearColor(this._distortionNeutralClear, 0);
      renderer.setRenderTarget(this.distortionTarget);
      renderer.clear(true, true, false);
      this._forEachDistortionProducer((producer) => {
        if (producer && producer.hasLive && producer.scene) {
          renderer.render(producer.scene, camera);
        }
      });
    } finally {
      renderer.autoClear = priorAutoClear;
      renderer.setClearColor(this._rendererClearColorScratch, priorClearAlpha);
    }
    this._distortionLive = true;
    this._distortionProducerLiveCount = liveCount;
  }

  _disposeTargets() {
    for (const target of [this.sceneTarget,this.normalTarget,this.aoTarget,this.aoBlurTarget,this.distortionTarget,...(this.bloomTargets||[])]) {
      if (target) target.dispose();
    }
    this.sceneTarget = this.normalTarget = this.aoTarget = this.aoBlurTarget = this.distortionTarget = null;
    this.bloomTargets = [];
  }
}

class FullscreenQuad {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.MeshBasicMaterial());
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target || null);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

function shaderMaterial(fragmentShader, values) {
  const uniforms = {};
  for (const [key,value] of Object.entries(values)) uniforms[key] = { value };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: FULLSCREEN_VERT, fragmentShader,
    depthTest:false, depthWrite:false, blending:THREE.NoBlending, toneMapped:false,
  });
}

function solidTexture(r, g, b, a) {
  const texture = new THREE.DataTexture(
    new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function hdrTarget(width,height,depth,samples) {
  recordPostRenderTargetAllocation('renderGraph:hdr');
  const target = new THREE.WebGLRenderTarget(width,height,{
    type:THREE.HalfFloatType, format:THREE.RGBAFormat,
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    depthBuffer:depth, stencilBuffer:false, samples:samples||0,
  });
  target.texture.name = 'SpaceRenderGraph:HDR';
  if (depth) {
    target.depthTexture = new THREE.DepthTexture(width,height,THREE.UnsignedIntType);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.name = 'SpaceRenderGraph:Depth';
  }
  return target;
}

function ldrTarget(width,height,depth) {
  recordPostRenderTargetAllocation('renderGraph:ldr');
  return new THREE.WebGLRenderTarget(width,height,{
    type:THREE.UnsignedByteType, format:THREE.RGBAFormat,
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    depthBuffer:depth, stencilBuffer:false,
  });
}

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function finite(v,fallback){return Number.isFinite(v)?v:fallback;}
