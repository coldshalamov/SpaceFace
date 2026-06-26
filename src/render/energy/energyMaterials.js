// SpaceFace Flight V3 — HDR energy materials.
//
// These are real shader-driven energy volumes, not translucent CSS-like gradients.
// They write HDR radiance into the existing half-float bloom pipeline, expose a
// depth-aware soft-intersection path, and separate a hot core from a turbulent halo.

import * as THREE from 'three';

const ENERGY_VERTEX = /* glsl */`
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ENERGY_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uNoiseScale;
  uniform float uFlowSpeed;
  uniform float uPulse;
  uniform float uCore;
  uniform float uEdgeNoise;
  uniform sampler2D uSceneDepth;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uSoftDistance;
  uniform float uDepthEnabled;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0,0.0,0.0));
    float n100 = hash31(i + vec3(1.0,0.0,0.0));
    float n010 = hash31(i + vec3(0.0,1.0,0.0));
    float n110 = hash31(i + vec3(1.0,1.0,0.0));
    float n001 = hash31(i + vec3(0.0,0.0,1.0));
    float n101 = hash31(i + vec3(1.0,0.0,1.0));
    float n011 = hash31(i + vec3(0.0,1.0,1.0));
    float n111 = hash31(i + vec3(1.0,1.0,1.0));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 5; i++) {
      sum += noise3(p) * amp;
      p = p * 2.03 + vec3(17.1, 9.2, 13.7);
      amp *= 0.48;
    }
    return sum;
  }

  float linearDepth(float depth01) {
    float z = depth01 * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar) /
      max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 1e-5);
  }

  void main() {
    vec3 flowP = vLocal * uNoiseScale;
    flowP.x -= uTime * uFlowSpeed;
    flowP.z += sin(uTime * 0.63 + vLocal.x * 2.0) * 0.35;
    float turbulence = fbm(flowP);
    float fine = noise3(flowP * 3.7 + vec3(0.0, uTime * 1.7, 0.0));
    float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormalW), normalize(vViewDirW))), 0.0, 1.0), uFresnelPower);

    // Core is brighter toward the center; fresnel + turbulence make the shell look
    // volumetric rather than like a flat alpha texture.
    float radial = length(vLocal.yz);
    float coreMask = smoothstep(1.0, 0.0, radial * (1.0 + turbulence * 0.35));
    float edge = smoothstep(0.18, 0.95, fresnel + turbulence * uEdgeNoise);
    float pulse = 1.0 + sin(uTime * 6.0 + vLocal.x * 2.4) * 0.08 * uPulse;
    float density = clamp(mix(edge, coreMask, uCore) + (fine - 0.5) * 0.18, 0.0, 1.0);

    vec3 color = mix(uColorA, uColorB, clamp(turbulence * 0.85 + fresnel * 0.35, 0.0, 1.0));
    color += vec3(1.0, 0.92, 0.74) * pow(coreMask, 3.0) * 1.8;
    float radiance = uIntensity * pulse * (0.35 + density * 1.8);
    float alpha = density * uOpacity;

    if (uDepthEnabled > 0.5) {
      vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      float sceneZ = linearDepth(texture2D(uSceneDepth, screenUv).x);
      float fragZ = linearDepth(gl_FragCoord.z);
      float soft = clamp((sceneZ - fragZ) / max(uSoftDistance, 1e-4), 0.0, 1.0);
      alpha *= soft;
      radiance *= mix(0.45, 1.0, soft);
    }

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * radiance, alpha);
  }
`;

const RIBBON_VERTEX = /* glsl */`
  attribute float aAlong;
  attribute float aSide;
  varying float vAlong;
  varying float vSide;
  varying vec3 vWorld;
  void main() {
    vAlong = aAlong;
    vSide = aSide;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIBBON_FRAGMENT = /* glsl */`
  precision highp float;
  varying float vAlong;
  varying float vSide;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uPulseSpeed;
  uniform float uTension;
  uniform float uOverload;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    float center = pow(max(0.0, 1.0 - abs(vSide)), mix(2.2, 5.5, clamp(uTension, 0.0, 1.0)));
    float pulse = smoothstep(0.15, 0.0, abs(fract(vAlong * 6.0 - uTime * uPulseSpeed) - 0.5));
    float chatter = hash(floor(vAlong * 80.0 + uTime * 20.0)) * uOverload;
    vec3 hot = mix(uColor, vec3(1.0, 0.34, 0.12), uOverload);
    float radiance = uIntensity * (0.45 + center * 1.4 + pulse * 1.8 + chatter * 1.2);
    float alpha = uOpacity * center * (0.5 + 0.5 * pulse);
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(hot * radiance, alpha);
  }
`;

export function createEnergyMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(options.colorA ?? 0x34d9ff) },
    uColorB: { value: new THREE.Color(options.colorB ?? 0x7b5cff) },
    uIntensity: { value: finite(options.intensity, 4.5) },
    uOpacity: { value: finite(options.opacity, 0.78) },
    uFresnelPower: { value: finite(options.fresnelPower, 2.2) },
    uNoiseScale: { value: finite(options.noiseScale, 1.8) },
    uFlowSpeed: { value: finite(options.flowSpeed, 1.7) },
    uPulse: { value: finite(options.pulse, 1) },
    uCore: { value: finite(options.core, 0.58) },
    uEdgeNoise: { value: finite(options.edgeNoise, 0.68) },
    uSceneDepth: { value: options.depthTexture || null },
    uResolution: { value: new THREE.Vector2(options.width || 1, options.height || 1) },
    uCameraNear: { value: finite(options.cameraNear, 0.1) },
    uCameraFar: { value: finite(options.cameraFar, 4000) },
    uSoftDistance: { value: finite(options.softDistance, 8) },
    uDepthEnabled: { value: options.depthTexture ? 1 : 0 },
  };

  const material = new THREE.ShaderMaterial({
    name: options.name || 'SpaceFaceEnergyMaterial',
    uniforms,
    vertexShader: ENERGY_VERTEX,
    fragmentShader: ENERGY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest !== false,
    blending: THREE.AdditiveBlending,
    side: options.side ?? THREE.DoubleSide,
    toneMapped: false,
    premultipliedAlpha: false,
  });
  material.userData.energyMaterial = true;
  return material;
}

/** Build a two-layer energy volume; geometry is caller-owned and may be shared. */
export function createEnergyVolume(geometry, options = {}) {
  if (!geometry || !geometry.isBufferGeometry) throw new TypeError('createEnergyVolume requires a BufferGeometry');
  const group = new THREE.Group();
  group.name = options.name || 'energy-volume';
  const core = new THREE.Mesh(geometry, createEnergyMaterial({
    ...options,
    name: `${group.name}:core`,
    intensity: finite(options.coreIntensity, finite(options.intensity, 5.5)),
    opacity: finite(options.coreOpacity, 0.82),
    core: finite(options.coreMix, 0.78),
    fresnelPower: 3.1,
  }));
  const halo = new THREE.Mesh(geometry, createEnergyMaterial({
    ...options,
    name: `${group.name}:halo`,
    intensity: finite(options.haloIntensity, 2.4),
    opacity: finite(options.haloOpacity, 0.36),
    core: 0.18,
    fresnelPower: 1.55,
    noiseScale: finite(options.noiseScale, 1.8) * 0.72,
  }));
  halo.scale.setScalar(finite(options.haloScale, 1.28));
  halo.renderOrder = finite(options.renderOrder, 20);
  core.renderOrder = halo.renderOrder + 1;
  group.add(halo, core);
  group.userData.energyCore = core;
  group.userData.energyHalo = halo;
  return group;
}

export function createMasslineRibbonMaterial(options = {}) {
  const material = new THREE.ShaderMaterial({
    name: options.name || 'SpaceFaceMasslineRibbon',
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(options.color ?? 0x42f5d4) },
      uIntensity: { value: finite(options.intensity, 5.0) },
      uOpacity: { value: finite(options.opacity, 0.72) },
      uPulseSpeed: { value: finite(options.pulseSpeed, 2.8) },
      uTension: { value: 0 },
      uOverload: { value: 0 },
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.userData.masslineMaterial = true;
  return material;
}

export function updateEnergyMaterial(material, frame = {}) {
  if (!material || !material.uniforms) return;
  const u = material.uniforms;
  if (u.uTime) u.uTime.value = finite(frame.time, u.uTime.value);
  if (u.uColorA && frame.colorA != null) u.uColorA.value.set(frame.colorA);
  if (u.uColorB && frame.colorB != null) u.uColorB.value.set(frame.colorB);
  if (u.uIntensity && Number.isFinite(frame.intensity)) u.uIntensity.value = frame.intensity;
  if (u.uOpacity && Number.isFinite(frame.opacity)) u.uOpacity.value = frame.opacity;
  if (u.uPulse && Number.isFinite(frame.pulse)) u.uPulse.value = frame.pulse;
  if (u.uSceneDepth && frame.depthTexture !== undefined) {
    u.uSceneDepth.value = frame.depthTexture;
    if (u.uDepthEnabled) u.uDepthEnabled.value = frame.depthTexture ? 1 : 0;
  }
  if (u.uResolution && frame.width > 0 && frame.height > 0) u.uResolution.value.set(frame.width, frame.height);
  if (u.uCameraNear && Number.isFinite(frame.cameraNear)) u.uCameraNear.value = frame.cameraNear;
  if (u.uCameraFar && Number.isFinite(frame.cameraFar)) u.uCameraFar.value = frame.cameraFar;
  if (u.uTension && Number.isFinite(frame.tension)) u.uTension.value = THREE.MathUtils.clamp(frame.tension, 0, 1.5);
  if (u.uOverload) u.uOverload.value = frame.overload ? 1 : 0;
  if (u.uPulseSpeed && Number.isFinite(frame.pulseSpeed)) u.uPulseSpeed.value = frame.pulseSpeed;
}

export function bindEnergyDepth(material, renderTarget, camera, width, height) {
  if (!material || !material.uniforms) return;
  const depth = renderTarget && renderTarget.depthTexture;
  updateEnergyMaterial(material, {
    depthTexture: depth || null,
    cameraNear: camera && camera.near,
    cameraFar: camera && camera.far,
    width,
    height,
  });
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
