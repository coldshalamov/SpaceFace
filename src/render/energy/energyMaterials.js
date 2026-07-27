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

// Massline ribbon — the signature verb, and per grammar §9.2 it is supposed to be the brightest
// object on the screen.
//
// The model is WHITE-HOT CORE against a SATURATED HALO. This is the one thing the neon direction
// actually asks for and it is the thing the previous shader could not do: it had a single
// cross-section term (`center`) that drove colour, radiance AND alpha together, so the total
// additive contribution fell off as center-squared and the whole cable collapsed into a thin,
// evenly-tinted filament that never crossed the bloom bright-pass threshold anywhere. It read as a
// painted line, not as a cable full of energy.
//
// Now the cross-section is split in two and the caller picks which one this draw is:
//   uSheath = 0  → a tight filament. Saturates toward white, runs hot enough to clip, feeds bloom.
//   uSheath = 1  → a wide sheath. Keeps the authored tension colour, moderate radiance, gives the
//                  cable visible body and a coloured falloff around the white core.
// Identity still survives desaturation, because the cable's identity is its SHAPE (a line between
// two bodies, sagging when slack, straight and shivering when loaded) — grammar §9.2.1.
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
  uniform float uReel;
  uniform float uSheath;   // 0 = white-hot filament draw, 1 = wide saturated halo draw
  uniform float uStrain;   // physical strain 0..1 — drives the visible shiver, not the colour ramp
  uniform float uWhip;     // 0..1 snap/latch recoil envelope

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    float t = clamp(uTension, 0.0, 1.0);
    float s = clamp(abs(vSide), 0.0, 1.0);

    // Two cross-sections. The filament tightens as the line loads (a taut cable reads thinner and
    // hotter); the sheath stays broad so the coloured falloff never disappears.
    float coreShape = pow(max(0.0, 1.0 - s), mix(9.0, 18.0, t));
    float sheathShape = pow(max(0.0, 1.0 - s), mix(1.35, 2.1, t));
    float shape = mix(coreShape, sheathShape, uSheath);

    // Strain waves travelling toward the anchor. Wider and softer than the old razor band so they
    // read as load moving through the line rather than as marching dashes.
    float pulse = smoothstep(0.34, 0.02, abs(fract(vAlong * 6.0 - uTime * uPulseSpeed) - 0.5));
    float winch = smoothstep(0.20, 0.0, abs(fract(vAlong * 10.0 - uTime * (uPulseSpeed * 1.35 + uReel * 4.0)) - 0.5));

    // Visible strain: high-frequency brightness chatter along the line under real physical load,
    // plus a harder flicker once the controller reports overload. This keys off uStrain (physics),
    // never off uTension (presentation load), so a hot-looking line and a genuinely strained one
    // are distinguishable.
    float grain = hash(floor(vAlong * 96.0 + floor(uTime * 34.0) * 7.13));
    float shiver = grain * (uStrain * uStrain * 0.9 + uOverload * 1.1);

    // Colour: the authored tension colour lives in the sheath; the filament saturates to white.
    vec3 sheathColor = mix(uColor, vec3(1.0, 0.30, 0.10), uOverload * 0.8);
    sheathColor = mix(sheathColor, vec3(0.74, 0.95, 1.0), uReel * 0.26);
    float whiteMix = (1.0 - uSheath) * clamp(
      coreShape * (0.55 + 0.45 * t) + pulse * 0.30 + winch * uReel * 0.45 + uWhip * 0.6,
      0.0, 1.0);
    vec3 col = mix(sheathColor, vec3(1.0), whiteMix);

    // Radiance is deliberately allowed far above 1.0 — that is what clips the core to white through
    // ACES while the halo keeps its colour, which is the whole liquid-neon read.
    float radiance = uIntensity * (
        0.30
      + sheathShape * mix(0.55, 1.15, uSheath)
      + coreShape * (1.0 - uSheath) * (2.4 + 3.6 * t)
      + pulse * (1.2 + 1.1 * t)
      + winch * uReel * 1.6
      + shiver * 1.7
      + uWhip * (2.2 + 3.0 * (1.0 - uSheath))
    );

    // Coverage is a separate, bounded quantity. Decoupling it from radiance is what stops the cable
    // pinching into a hairline the moment it gets bright.
    float alpha = uOpacity * clamp(shape * 0.92 + coreShape * (1.0 - uSheath) * 0.5, 0.0, 1.0)
      * (0.62 + 0.38 * pulse + uReel * 0.18 + uWhip * 0.25);

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col * radiance, alpha);
  }
`;

// ---------------------------------------------------------------------------------------------
// Thruster plume — "liquid blue fire" volume.
//
// A dedicated shader (NOT createEnergyMaterial, which is shared by weapon bolts + the massline
// tether and must stay geometry-agnostic). The plume geometry is a tapered open cylinder whose
// axis runs along local -X: the wide hot mouth sits at x=0 (the nozzle) and the volume tapers to a
// narrow tail at x=-4. We paint flowing, domain-warped fire onto that shell so it reads as a
// living liquid flame rather than a solid neon tube: a hot core that streams out the back, ragged
// flickering tongues at the tip, and a white-hot mouth broken up by noise so the base never looks
// like a machined perfect circle. Purely cosmetic, player-only, ≤ a few mounts — so it can be lush.
const PLUME_NOISE = /* glsl */`
  float pl_hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float pl_noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = pl_hash31(i + vec3(0.0,0.0,0.0));
    float n100 = pl_hash31(i + vec3(1.0,0.0,0.0));
    float n010 = pl_hash31(i + vec3(0.0,1.0,0.0));
    float n110 = pl_hash31(i + vec3(1.0,1.0,0.0));
    float n001 = pl_hash31(i + vec3(0.0,0.0,1.0));
    float n101 = pl_hash31(i + vec3(1.0,0.0,1.0));
    float n011 = pl_hash31(i + vec3(0.0,1.0,1.0));
    float n111 = pl_hash31(i + vec3(1.0,1.0,1.0));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }
  float pl_fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.58;
    for (int i = 0; i < 5; i++) {
      sum += pl_noise3(p) * amp;
      p = p * 2.02 + vec3(19.1, 7.7, 13.3);
      amp *= 0.5;
    }
    return sum;
  }
`;

const PLUME_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform float uTime;
  uniform vec3 uColorA;      // electric mid tone (profile plumeCore)
  uniform vec3 uColorB;      // cool tail tone (profile plumeHalo)
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uNoiseScale;
  uniform float uFlowSpeed;
  uniform float uPulse;
  uniform float uCore;       // ~1 solid-body layer, ~0.18 rim/halo layer
  uniform float uBoost;      // 0..1 heat / afterburner
  uniform float uSwirl;      // domain-warp + spiral character (per engine profile)
  uniform float uFork;       // raggedness of the flame tongues (per engine profile)
  uniform sampler2D uSceneDepth;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uSoftDistance;
  uniform float uDepthEnabled;

  ${PLUME_NOISE}

  float linearDepth(float depth01) {
    float z = depth01 * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar) /
      max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 1e-5);
  }

  void main() {
    // Axis param: 0 at the nozzle mouth (wide, hot), 1 at the tail tip. vLocal.x in [-4, 0].
    float a = clamp(-vLocal.x * 0.25, 0.0, 1.0);
    float theta = atan(vLocal.z, vLocal.y);

    // Liquid flow field: fbm that streams toward the tail (out the back) and is domain-warped by a
    // second noise so the fire licks and folds like a fluid instead of scrolling as a rigid band.
    float flow = uTime * uFlowSpeed;
    // Anisotropic sampling: low frequency ALONG the axis, higher AROUND it, so the fbm resolves into
    // filaments that run lengthwise with the flow — streaky liquid fire rather than round blobs.
    vec3 sp = vec3(a * 2.3 - flow, theta * 2.7 + a * uSwirl * 2.4, flow * 0.15);
    float wx = pl_fbm(sp * 1.3 + vec3(0.0, 0.0, uTime * 0.6));
    float wy = pl_fbm(sp * 1.6 + vec3(5.2, 1.7, 0.0));
    vec3 wp = sp + vec3(wx - 0.5, wy - 0.5, 0.0) * (0.55 + uSwirl * 0.9);
    float flame = pl_fbm(wp * (0.85 + uNoiseScale * 0.5));
    float fine = pl_noise3(wp * 3.4 + vec3(0.0, -uTime * 2.6, 0.0));

    // Longitudinal envelope: a bright body near the mouth that dissolves into ragged, flickering
    // tongues toward the tail. The leading edge is perturbed by noise so the tip is never a clean cut.
    float reach = 0.60 + uBoost * 0.52;
    float edge = a - (flame - 0.4) * uFork;
    float body = 1.0 - smoothstep(reach * 0.35, reach, edge);
    // Break up the machined "perfect circle" mouth with a noise notch right at the base.
    float baseBreak = 1.0 - (0.5 * fine) * smoothstep(0.35, 0.0, a);
    body *= baseBreak;

    // Volume on the hollow shell: fresnel lifts the silhouette so the tube reads as a gaseous volume.
    float fres = pow(1.0 - clamp(abs(dot(normalize(vNormalW), normalize(vViewDirW))), 0.0, 1.0), uFresnelPower);

    // Density: a hot, near-solid root at the mouth that breaks into flowing bright veins and
    // flickering tongues downstream — the way a real flame is dense at its base and turbulent at
    // its tip. veins carve dark channels so the body reads as liquid fire, not a filled neon tube.
    float veins = smoothstep(0.28, 0.82, flame);
    float root = pow(1.0 - a, 2.2);
    float filled = body * clamp(root * 0.85 + veins * (0.85 - root * 0.35), 0.0, 1.0);
    // Soften the hard cylinder silhouette on the solid core so its clean edge dissolves into the
    // feathered halo instead of reading as a machined tube boundary.
    filled *= 1.0 - fres * 0.4;
    float rim = body * fres * 1.5;
    float density = mix(rim, filled, uCore) + (fine - 0.5) * 0.12 * body;
    float tongue = smoothstep(0.6, 0.97, flame) * body * (0.35 + uBoost * 0.5) * (0.35 + a);
    density = clamp(density + tongue * uCore, 0.0, 1.0);

    // Liquid blue-fire heat gradient: hot at the mouth/core, cooling toward the tail and tips.
    float heat = clamp((1.0 - a * 0.75) * (0.45 + flame * 0.9) + uBoost * 0.45, 0.0, 1.4);
    vec3 col = mix(uColorB, uColorA, smoothstep(0.12, 0.62, heat));
    vec3 hot = vec3(0.82, 0.94, 1.0);
    col = mix(col, hot, smoothstep(0.72, 1.15, heat));
    // White-hot mouth. pow 7 confined this to a few pixels right at the nozzle lip, so the throat
    // of the engine — the hottest part of a real flame and the thing that should clip — was
    // effectively invisible at the top-down game camera. pow 4.6 lets the throat itself burn white
    // while the tail keeps its authored colour.
    col += hot * pow(1.0 - a, 4.6) * (0.82 + uBoost * 1.45);
    col += vec3(0.55, 0.35, 0.95) * tongue * uBoost * 0.7;           // violet tip flare under boost

    float pulse = 1.0 + sin(uTime * 7.0 + a * 12.0) * 0.05 * uPulse;
    // Grammar §9.2: brightness carries energy. This used to top out just under the point where a
    // thruster clips, so the mildest object in a game about force was the engine. The extra term is
    // gated on uBoost so a cruising ship still reads calm and only real acceleration burns white —
    // the plume becomes a throttle gauge instead of a constant blue smudge.
    float radiance = uIntensity * pulse * (0.28 + density * 2.15 + heat * 0.42 + uBoost * density * 0.85);
    float alpha = density * uOpacity;

    if (uDepthEnabled > 0.5) {
      vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      float sceneZ = linearDepth(texture2D(uSceneDepth, screenUv).x);
      float fragZ = linearDepth(gl_FragCoord.z);
      float soft = clamp((sceneZ - fragZ) / max(uSoftDistance, 1e-4), 0.0, 1.0);
      alpha *= soft;
      radiance *= mix(0.5, 1.0, soft);
    }

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * radiance, alpha);
  }
`;

export function createPlumeMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(options.colorA ?? 0x36c8ff) },
    uColorB: { value: new THREE.Color(options.colorB ?? 0x6a4cff) },
    uIntensity: { value: finite(options.intensity, 6.5) },
    uOpacity: { value: finite(options.opacity, 0.8) },
    uFresnelPower: { value: finite(options.fresnelPower, 2.6) },
    uNoiseScale: { value: finite(options.noiseScale, 1.6) },
    uFlowSpeed: { value: finite(options.flowSpeed, 2.4) },
    uPulse: { value: finite(options.pulse, 1) },
    uCore: { value: finite(options.core, 0.82) },
    uBoost: { value: finite(options.boost, 0) },
    uSwirl: { value: finite(options.swirl, 0.6) },
    uFork: { value: finite(options.fork, 0.5) },
    uSceneDepth: { value: options.depthTexture || null },
    uResolution: { value: new THREE.Vector2(options.width || 1, options.height || 1) },
    uCameraNear: { value: finite(options.cameraNear, 0.1) },
    uCameraFar: { value: finite(options.cameraFar, 4000) },
    uSoftDistance: { value: finite(options.softDistance, 8) },
    uDepthEnabled: { value: options.depthTexture ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: options.name || 'SpaceFacePlumeMaterial',
    uniforms,
    vertexShader: ENERGY_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest !== false,
    blending: THREE.AdditiveBlending,
    side: options.side ?? THREE.DoubleSide,
    toneMapped: false,
    premultipliedAlpha: false,
  });
  material.userData.energyMaterial = true;
  material.userData.plumeMaterial = true;
  return material;
}

/** Two-layer liquid-fire thruster plume (hot body + soft rim halo); geometry is caller-owned. */
export function createPlumeVolume(geometry, options = {}) {
  if (!geometry || !geometry.isBufferGeometry) throw new TypeError('createPlumeVolume requires a BufferGeometry');
  const group = new THREE.Group();
  group.name = options.name || 'plume-volume';
  const core = new THREE.Mesh(geometry, createPlumeMaterial({
    ...options,
    name: `${group.name}:core`,
    intensity: finite(options.coreIntensity, finite(options.intensity, 6.5)),
    opacity: finite(options.coreOpacity, 0.82),
    core: finite(options.coreMix, 0.86),
    fresnelPower: 3.0,
  }));
  const halo = new THREE.Mesh(geometry, createPlumeMaterial({
    ...options,
    name: `${group.name}:halo`,
    intensity: finite(options.haloIntensity, 2.6),
    opacity: finite(options.haloOpacity, 0.34),
    core: 0.16,
    fresnelPower: 1.5,
    noiseScale: finite(options.noiseScale, 1.6) * 0.8,
  }));
  halo.scale.setScalar(finite(options.haloScale, 1.34));
  halo.renderOrder = finite(options.renderOrder, 20);
  core.renderOrder = halo.renderOrder + 1;
  group.add(halo, core);
  group.userData.energyCore = core;
  group.userData.energyHalo = halo;
  group.userData.plumeVolume = true;
  return group;
}

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
      uReel: { value: 0 },
      uSheath: { value: finite(options.sheath, 0) },
      uStrain: { value: 0 },
      uWhip: { value: 0 },
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
  if (u.uBoost && Number.isFinite(frame.boost)) u.uBoost.value = frame.boost;
  if (u.uSwirl && Number.isFinite(frame.swirl)) u.uSwirl.value = frame.swirl;
  if (u.uFork && Number.isFinite(frame.fork)) u.uFork.value = frame.fork;
  if (u.uFlowSpeed && Number.isFinite(frame.flowSpeed)) u.uFlowSpeed.value = frame.flowSpeed;
  if (u.uNoiseScale && Number.isFinite(frame.noiseScale)) u.uNoiseScale.value = frame.noiseScale;
  if (u.uSceneDepth && frame.depthTexture !== undefined) {
    u.uSceneDepth.value = frame.depthTexture;
    if (u.uDepthEnabled) u.uDepthEnabled.value = frame.depthTexture ? 1 : 0;
  }
  if (u.uResolution && frame.width > 0 && frame.height > 0) u.uResolution.value.set(frame.width, frame.height);
  if (u.uCameraNear && Number.isFinite(frame.cameraNear)) u.uCameraNear.value = frame.cameraNear;
  if (u.uCameraFar && Number.isFinite(frame.cameraFar)) u.uCameraFar.value = frame.cameraFar;
  if (u.uTension && Number.isFinite(frame.tension)) u.uTension.value = THREE.MathUtils.clamp(frame.tension, 0, 1.5);
  if (u.uOverload) u.uOverload.value = frame.overload ? 1 : 0;
  if (u.uReel && Number.isFinite(frame.reel)) u.uReel.value = THREE.MathUtils.clamp(frame.reel, 0, 1);
  if (u.uStrain && Number.isFinite(frame.strain)) u.uStrain.value = THREE.MathUtils.clamp(frame.strain, 0, 1);
  if (u.uWhip && Number.isFinite(frame.whip)) u.uWhip.value = THREE.MathUtils.clamp(frame.whip, 0, 1);
  if (u.uSheath && Number.isFinite(frame.sheath)) u.uSheath.value = THREE.MathUtils.clamp(frame.sheath, 0, 1);
  if (u.uPulseSpeed && Number.isFinite(frame.pulseSpeed)) u.uPulseSpeed.value = frame.pulseSpeed;
  if (u.uColor && frame.color != null) u.uColor.value.set(frame.color);
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
