// Authored flipbook sprites (LOOK-05C). Codex-painted 4x4 atlases in assets/fx/sprites/ play through
// the existing instanced sprite pool: same per-instance attributes (position, scale, roll, colour,
// opacity, phase.x = life progress, phase.y = seed), one camera-facing quad per instance, two frames
// cross-faded so playback is continuous. Additive families carry HDR heat (cores well above 1.0) so
// the selective bloom throws a halo; smoke is normal-blended and takes the scene tint. When there is
// no DOM (node tests) the pool keeps the volume buckets and never builds these.
import * as THREE from 'three';

export const FLIPBOOK_SHEETS = Object.freeze({
  fire: Object.freeze({ file: 'fire_burst_sheet', blend: 'add', hdr: 2.0, cooling: 1 }),
  smoke: Object.freeze({ file: 'smoke_billow_sheet', blend: 'normal', hdr: 1, cooling: 0 }),
  ring: Object.freeze({ file: 'shock_ring_sheet', blend: 'add', hdr: 1.9, cooling: 0 }),
  spark: Object.freeze({ file: 'spark_ember_sheet', blend: 'add', hdr: 2.3, cooling: 1 }),
  wisp: Object.freeze({ file: 'energy_wisp_sheet', blend: 'add', hdr: 2.6, cooling: 0 }),
});

export function flipbookSheetPath(id) {
  return `assets/fx/sprites/${FLIPBOOK_SHEETS[id].file}.png`;
}

export function flipbooksAvailable() {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

const _sheetCache = new Map();
export function getFlipbookTexture(id) {
  if (_sheetCache.has(id)) return _sheetCache.get(id);
  const tex = new THREE.TextureLoader().load(
    flipbookSheetPath(id),
    () => { tex.needsUpdate = true; },
    undefined,
    () => { tex.userData.spacefaceLoadFailed = true; },
  );
  tex.name = `sf-flipbook:${id}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  tex.userData.spacefaceFlipbook = true;
  _sheetCache.set(id, tex);
  return tex;
}

export function createFlipbookGeometry() {
  return new THREE.PlaneGeometry(1, 1);
}

const VERT = /* glsl */`
  attribute vec3 aSpritePosition;
  attribute vec2 aSpriteScale;
  attribute float aSpriteRoll;
  attribute vec3 aSpriteColor;
  attribute float aSpriteOpacity;
  attribute vec2 aSpritePhase;
  uniform float uAdditive;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOpacity;
  varying vec2 vPhase;
  void main() {
    // Camera-facing quad: the effect always shows its painted face to the player.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(aSpriteRoll), s = sin(aSpriteRoll);
    vec2 p0 = position.xy * aSpriteScale;
    vec2 q = vec2(c * p0.x - s * p0.y, s * p0.x + c * p0.y);
    // Keep smoke and broad blast quads cleanly behind opaque ship hulls via depth test so
    // the player silhouette remains legible through close-range explosions.
    float maxScale = max(aSpriteScale.x, aSpriteScale.y);
    vec3 toCam = normalize(cameraPosition - aSpritePosition);
    float backOff = uAdditive < 0.5
      ? 5.5
      : smoothstep(10.0, 26.0, maxScale) * 3.8;
    vec3 world = aSpritePosition - toCam * backOff + right * q.x + up * q.y;
    vUv = uv;
    vTint = aSpriteColor;
    vOpacity = aSpriteOpacity;
    vPhase = aSpritePhase;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uSheet;
  uniform float uHdr;
  uniform float uCooling;
  uniform float uAdditive;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOpacity;
  varying vec2 vPhase;
  vec4 frame(float f) {
    vec2 cell = vec2(mod(f, 4.0), 3.0 - floor(f / 4.0));
    // Inset half a texel so bilinear filtering never bleeds the neighbouring cell in.
    vec2 uv = (cell + clamp(vUv, 0.004, 0.996)) * 0.25;
    return texture2D(uSheet, uv);
  }
  void main() {
    float film = clamp(vPhase.x, 0.0, 1.0) * 15.0;
    float f0 = floor(film);
    vec4 a = frame(f0), b = frame(min(15.0, f0 + 1.0));
    float k = fract(film);
    vec4 tx = mix(a, b, k);
    // Straight-alpha sheets: weight colour by coverage so transparent texels add no fringe.
    float rDist = length(vUv - vec2(0.5)) * 2.0;
    float radial = 1.0 - smoothstep(0.45, 1.0, rDist);
    float cover = tx.a * radial;
    if (cover * vOpacity < 0.004) discard;
    vec3 rgb = tx.rgb;
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    if (uAdditive > 0.5) {
      // Heat lives only in the brightest texels: keep punchy fire edges while capping peak
      // HDR so stacked blasts never white out the center through bloom.
      float cool = mix(1.0, 1.0 - 0.78 * vPhase.x, uCooling);
      float lifeFade = 1.0 - smoothstep(0.42, 1.0, vPhase.x);
      float core = smoothstep(0.58, 0.96, lum) * cool;
      // The fire sheet's late frames are grey smoke. Added to the frame that grey reads as a white
      // cloud, so desaturated texels are weighted down: lingering smoke is the smoke family's job.
      float sat = (max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b))) / (max(rgb.r, max(rgb.g, rgb.b)) + 1e-3);
      float fireOnly = mix(0.12, 1.0, smoothstep(0.14, 0.44, sat) + (1.0 - uCooling) * 1.0 + core);
      vec3 body = rgb * vTint * (0.78 + 0.45 * lum) * min(1.0, fireOnly);
      vec3 hotCol = vec3(1.0, 0.90, 0.72) * max(vTint.r, max(vTint.g, vTint.b));
      vec3 col = mix(body, hotCol, core * 0.30) * (1.0 + uHdr * core * core);
      vec3 outCol = min(col * cover * vOpacity * lifeFade, vec3(2.4));
      gl_FragColor = vec4(outCol, 1.0);
    } else {
      // Smoke: lit-from-ink body tinted by the sprite colour, low capped alpha so ships stay clear.
      float smokeFade = 1.0 - smoothstep(0.22, 1.0, vPhase.x);
      float smokeAlpha = min(cover * vOpacity * smokeFade, 0.32);
      if (smokeAlpha < 0.004) discard;
      gl_FragColor = vec4(rgb * mix(vec3(1.0), min(vTint, vec3(0.75)), 0.65) * 0.46, smokeAlpha);
    }
    #include <colorspace_fragment>
  }
`;

export function createFlipbookMaterial(familyId, texture = null) {
  const spec = FLIPBOOK_SHEETS[familyId];
  const additive = spec.blend === 'add';
  const material = new THREE.ShaderMaterial({
    name: `SF_Flipbook_${familyId}`,
    uniforms: {
      uSheet: { value: texture || getFlipbookTexture(familyId) },
      uHdr: { value: spec.hdr },
      uCooling: { value: spec.cooling },
      uAdditive: { value: additive ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Additive output is premultiplied by coverage in the shader, so plain ONE/ONE.
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: !additive,
  });
  material.userData.spacefaceTransientTechnique = 'authored-flipbook';
  return material;
}
