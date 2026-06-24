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
  uniform float uBloomStrength;
  uniform float uAoStrength;
  uniform float uExposure;
  uniform float uGrade;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;

  vec3 aces(vec3 x) {
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
  }
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34,456.21));
    p += dot(p,p+45.32);
    return fract(p.x*p.y);
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055, c*12.92, step(c,vec3(0.0031308)));
  }
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    float ao = texture2D(tAo, vUv).r;
    vec3 bloom = texture2D(tBloom0,vUv).rgb * 0.50 +
                 texture2D(tBloom1,vUv).rgb * 0.28 +
                 texture2D(tBloom2,vUv).rgb * 0.15 +
                 texture2D(tBloom3,vUv).rgb * 0.07;
    vec3 c = scene * mix(1.0, ao, uAoStrength) + bloom * uBloomStrength;
    c *= uExposure;
    c = aces(max(c, vec3(0.0)));

    float l = dot(c, vec3(0.2126,0.7152,0.0722));
    vec3 graded = c;
    graded += vec3(0.025,0.060,0.075) * (1.0 - smoothstep(0.02,0.42,l));
    graded += vec3(0.075,0.040,0.012) * smoothstep(0.58,1.0,l);
    graded = mix(vec3(dot(graded,vec3(0.2126,0.7152,0.0722))), graded, 1.06);
    c = mix(c, graded, uGrade);

    vec2 d = vUv - 0.5;
    float vig = 1.0 - smoothstep(0.24,0.72,dot(d,d)*2.0) * uVignette;
    c *= vig;
    vec3 srgb = linearToSrgb(c);
    float grain = (hash21(vUv*vec2(1920.0,1080.0)+uTime*61.7)-0.5) * uGrain * (1.0-l);
    gl_FragColor = vec4(clamp(srgb + grain,0.0,1.0),1.0);
  }
`;

export class SpaceRenderGraph {
  constructor(renderer, options = {}) {
    if (!renderer || !renderer.isWebGLRenderer) throw new TypeError('SpaceRenderGraph requires THREE.WebGLRenderer');
    this.renderer = renderer;
    this.options = {
      enabled: options.enabled !== false,
      ao: options.ao !== false,
      bloom: options.bloom !== false,
      renderScale: clamp(finite(options.renderScale, 1), 0.5, 1),
      aoScale: clamp(finite(options.aoScale, 0.5), 0.25, 1),
      bloomStrength: finite(options.bloomStrength, 0.82),
      bloomThreshold: finite(options.bloomThreshold, 0.82),
      bloomKnee: finite(options.bloomKnee, 0.18),
      aoStrength: finite(options.aoStrength, 0.72),
      exposure: finite(options.exposure, 1.0),
      grade: finite(options.grade, 0.62),
      vignette: finite(options.vignette, 0.18),
      grain: finite(options.grain, 0.025),
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

    this.normalMaterial = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending });
    this.normalMaterial.name = 'SpaceRenderGraph:normal-prepass';
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
      uBloomStrength:this.options.bloomStrength, uAoStrength:this.options.aoStrength,
      uExposure:this.options.exposure, uGrade:this.options.grade,
      uVignette:this.options.vignette, uGrain:this.options.grain, uTime:0,
    });
    this._allocate();
  }

  setSize(width, height, pixelRatio = 1) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this._allocate();
  }

  setOptions(patch = {}) {
    Object.assign(this.options, patch);
    this.options.renderScale = clamp(finite(this.options.renderScale, 1), 0.5, 1);
    this.options.aoScale = clamp(finite(this.options.aoScale, 0.5), 0.25, 1);
    const u = this.compositeMaterial.uniforms;
    u.uBloomStrength.value = finite(this.options.bloomStrength, 0.82);
    u.uAoStrength.value = finite(this.options.aoStrength, 0.72);
    u.uExposure.value = finite(this.options.exposure, 1);
    u.uGrade.value = finite(this.options.grade, 0.62);
    u.uVignette.value = finite(this.options.vignette, 0.18);
    u.uGrain.value = finite(this.options.grain, 0.025);
    this.bloomMaterial.uniforms.uThreshold.value = finite(this.options.bloomThreshold, 0.82);
    this.bloomMaterial.uniforms.uKnee.value = finite(this.options.bloomKnee, 0.18);
  }

  render(scene, camera, frame = {}) {
    const renderer = this.renderer;
    this.time = finite(frame.time, this.time + finite(frame.dt, 1/60));
    if (!this.options.enabled) {
      renderer.setRenderTarget(frame.outputTarget || null);
      renderer.render(scene, camera);
      return;
    }

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousOverride = scene.overrideMaterial;
    renderer.autoClear = true;

    try {
      renderer.setRenderTarget(this.sceneTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      scene.overrideMaterial = this.normalMaterial;
      renderer.setRenderTarget(this.normalTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;

      this._renderAo(camera);
      this._renderBloom();
      this._renderComposite(frame.outputTarget || null);
    } finally {
      scene.overrideMaterial = previousOverride;
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget);
    }
  }

  get sceneColorTexture() { return this.sceneTarget.texture; }
  get depthTexture() { return this.sceneTarget.depthTexture; }
  get normalTexture() { return this.normalTarget.texture; }

  diagnostics() {
    return {
      width: this.width,
      height: this.height,
      renderScale: this.options.renderScale,
      aoScale: this.options.aoScale,
      ao: !!this.options.ao,
      bloom: !!this.options.bloom,
      bloomLevels: this.bloomTargets.length,
      temporal: false,
      capabilities: this.capabilities,
    };
  }

  dispose() {
    this._disposeTargets();
    this.normalMaterial.dispose();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.bloomMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }

  _renderAo(camera) {
    const renderer = this.renderer;
    if (!this.options.ao) {
      renderer.setRenderTarget(this.aoTarget);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, false, false);
      return;
    }
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
      u.uFirst.value = this.options.bloom && i === 0 ? 1 : 0;
      if (!this.options.bloom) u.uThreshold.value = 1e9;
      else u.uThreshold.value = this.options.bloomThreshold;
      this.quad.render(renderer, this.bloomMaterial, target);
      source = target.texture;
      sourceW = target.width;
      sourceH = target.height;
    }
  }

  _renderComposite(outputTarget) {
    const u = this.compositeMaterial.uniforms;
    u.tScene.value = this.sceneTarget.texture;
    u.tAo.value = this.aoTarget.texture;
    u.tBloom0.value = this.bloomTargets[0].texture;
    u.tBloom1.value = this.bloomTargets[1].texture;
    u.tBloom2.value = this.bloomTargets[2].texture;
    u.tBloom3.value = this.bloomTargets[3].texture;
    u.uTime.value = this.time;
    this.quad.render(this.renderer, this.compositeMaterial, outputTarget);
  }

  _allocate() {
    this._disposeTargets();
    const rw = Math.max(1, Math.floor(this.width * this.options.renderScale));
    const rh = Math.max(1, Math.floor(this.height * this.options.renderScale));
    this.sceneTarget = hdrTarget(rw, rh, true, this.capabilities.webgl2 ? 4 : 0);
    this.normalTarget = ldrTarget(rw, rh, true);
    const aw = Math.max(1, Math.floor(rw * this.options.aoScale));
    const ah = Math.max(1, Math.floor(rh * this.options.aoScale));
    this.aoTarget = ldrTarget(aw, ah, false);
    this.aoBlurTarget = ldrTarget(aw, ah, false);
    this.bloomTargets = [];
    let bw = Math.max(1, rw >> 1), bh = Math.max(1, rh >> 1);
    for (let i=0; i<4; i++) {
      this.bloomTargets.push(hdrTarget(bw,bh,false,0));
      bw = Math.max(1,bw>>1); bh = Math.max(1,bh>>1);
    }
  }

  _disposeTargets() {
    for (const target of [this.sceneTarget,this.normalTarget,this.aoTarget,this.aoBlurTarget,...(this.bloomTargets||[])]) {
      if (target) target.dispose();
    }
    this.sceneTarget = this.normalTarget = this.aoTarget = this.aoBlurTarget = null;
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

function hdrTarget(width,height,depth,samples) {
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
  return new THREE.WebGLRenderTarget(width,height,{
    type:THREE.UnsignedByteType, format:THREE.RGBAFormat,
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    depthBuffer:depth, stencilBuffer:false,
  });
}

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function finite(v,fallback){return Number.isFinite(v)?v:fallback;}
