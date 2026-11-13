// Authored flipbook sprites (LOOK-05C). Codex-painted 4x4 atlases in assets/fx/sprites/ play through
// the existing instanced sprite pool: same per-instance attributes (position, scale, roll, colour,
// opacity, phase.x = life progress, phase.y = seed), one camera-facing quad per instance, two frames
// cross-faded so playback is continuous. Additive families carry HDR heat (cores well above 1.0) so
// the selective bloom throws a halo; smoke is normal-blended and takes the scene tint. When there is
// no DOM (node tests) the pool keeps the volume buckets and never builds these.
import * as THREE from 'three';

export const FLIPBOOK_SHEETS = Object.freeze({
  fire: Object.freeze({ file: 'fire_burst_sheet', blend: 'add', hdr: 4.2, cooling: 1 }),
  smoke: Object.freeze({ file: 'smoke_billow_sheet', blend: 'normal', hdr: 1, cooling: 0 }),
  ring: Object.freeze({ file: 'shock_ring_sheet', blend: 'add', hdr: 3.2, cooling: 0 }),
  spark: Object.freeze({ file: 'spark_ember_sheet', blend: 'add', hdr: 4.6, cooling: 1 }),
  wisp: Object.freeze({ file: 'energy_wisp_sheet', blend: 'add', hdr: 5, cooling: 0 }),
});

export function flipbooksAvailable() {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

const _sheetCache = new Map();
export function getFlipbookTexture(id) {
  if (_sheetCache.has(id)) return _sheetCache.get(id);
  const tex = new THREE.TextureLoader().load(
    `assets/fx/sprites/${FLIPBOOK_SHEETS[id].file}.png`,
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
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOpacity;
  varying vec2 vPhase;
  void main() {
    // Camera-facing quad: the effect always shows its painted face to the player.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(aSpriteRoll), s = sin(aSpriteRoll);
    vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aSpriteScale;
    vec3 world = aSpritePosition + right * q.x + up * q.y;
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
    float cover = tx.a;
    if (cover * vOpacity < 0.004) discard;
    vec3 rgb = tx.rgb;
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    if (uAdditive > 0.5) {
      // Heat: dim body keeps the sprite colour, the bright core climbs well past 1.0 so bloom
      // carries it. Cooling families lose heat with age (progress in phase.x).
      float heat = pow(clamp(lum, 0.0, 1.0), 1.6) * mix(1.0, 1.0 - 0.7 * vPhase.x, uCooling);
      vec3 col = mix(rgb * vTint, vec3(1.0, 0.93, 0.78) * max(vTint.r, max(vTint.g, vTint.b)), heat * 0.55);
      col *= 0.75 + uHdr * heat;
      gl_FragColor = vec4(col * cover * vOpacity, 1.0);
    } else {
      // Smoke: lit-from-ink body tinted by the sprite colour, normal blend.
      gl_FragColor = vec4(rgb * mix(vec3(1.0), vTint, 0.55), cover * vOpacity);
    }
    #include <colorspace_fragment>
  }
`;

export function createFlipbookMaterial(familyId) {
  const spec = FLIPBOOK_SHEETS[familyId];
  const additive = spec.blend === 'add';
  const material = new THREE.ShaderMaterial({
    name: `SF_Flipbook_${familyId}`,
    uniforms: {
      uSheet: { value: getFlipbookTexture(familyId) },
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
