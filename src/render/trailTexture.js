// Procedural engine-trail texture — Saeki Keiichi warp-line technique (photo 4 "トレイル" graph).
// JS sampler is testable without THREE; GLSL twin drives live ribbon/particle shaders with uTrailTime.
import * as THREE from 'three';

const DEFAULT_SEED = 17;
const TEX_W = 256;
const TEX_H = 64;

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x, y, seed = DEFAULT_SEED) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(256);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (ix, iy) => grid[((iy & 15) << 4) | (ix & 15)];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let sx = x - x0;
  let sy = y - y0;
  sx = sx * sx * (3 - 2 * sx);
  sy = sy * sy * (3 - 2 * sy);
  const n00 = at(x0, y0);
  const n10 = at(x0 + 1, y0);
  const n01 = at(x0, y0 + 1);
  const n11 = at(x0 + 1, y0 + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/** Glow-line cross-section: bright core, smooth side falloff (photo 1 / photo 4 Cross section). */
export function crossSectionProfile(absV) {
  const v = Math.max(0, Math.min(1, absV));
  const core = Math.exp(-v * v * 10.5);
  const halo = Math.exp(-v * 3.4) * 0.42;
  return Math.min(1, core + halo);
}

/** Lateral displacement from along-axis noise — Directional Warp + Bend (photo 4). */
export function directionalWarp(u, v, time = 0, seed = DEFAULT_SEED) {
  const warpA = valueNoise2D(u * 5.5 + time * 0.18, 0.37, seed) - 0.5;
  const warpB = valueNoise2D(u * 11.0 - time * 0.09, v * 2.2 + 1.1, seed + 7) - 0.5;
  const edgeFade = 1 - Math.min(1, Math.abs(v) * 0.72);
  return v + warpA * 0.30 * edgeFade + warpB * 0.14;
}

/** Axis-aligned average blur — Slope blur / Directional blur Trail mode = Average (photo 2/4). */
export function directionalStreakBlur(u, v, time = 0, seed = DEFAULT_SEED, trailLength = 0.14) {
  const steps = 7;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const su = u - trailLength * t;
    const bend = Math.sin(su * 14.0 + time * 1.6) * 0.11;
    const sample = valueNoise2D(su * 9.0 + bend, v * 3.1 + time * 0.22, seed + 23);
    const w = 1 - t * 0.38;
    sum += sample * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * Sample procedural trail intensity at UV:
 *   u — along exhaust (0 = nozzle, 1 = tail)
 *   v — cross-section (-1 = edge, 0 = center)
 */
export function sampleTrailTexture(u, v, time = 0, opts = {}) {
  const seed = opts.seed ?? DEFAULT_SEED;
  const trailLength = opts.trailLength ?? 0.14;
  const warpedV = directionalWarp(u, v, time, seed);
  const cross = crossSectionProfile(Math.abs(warpedV));
  const streak = directionalStreakBlur(u, warpedV, time, seed, trailLength);
  const alongTaper = Math.pow(Math.max(0, 1 - u * 0.12), 0.55);
  const intensity = cross * (0.32 + streak * 0.88) * alongTaper;
  return Math.max(0, Math.min(1, intensity));
}

export function buildTrailTexturePixels(width = TEX_W, height = TEX_H, time = 0, seed = DEFAULT_SEED) {
  const pixels = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      pixels[y * width + x] = sampleTrailTexture(u, v, time, { seed });
    }
  }
  return pixels;
}

export function pixelsToUint8(pixels) {
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = Math.round(pixels[i] * 255);
  return out;
}

export function makeTrailCanvasTexture(time = 0) {
  const pixels = buildTrailTexturePixels(TEX_W, TEX_H, time);
  const bytes = pixelsToUint8(pixels);
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(bytes, TEX_W, TEX_H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(TEX_W, TEX_H);
  for (let i = 0; i < pixels.length; i++) {
    const v = bytes[i];
    const o = i * 4;
    image.data[o] = v;
    image.data[o + 1] = v;
    image.data[o + 2] = v;
    image.data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

let _sharedTrailTex = null;

export function getSharedTrailTexture() {
  if (!_sharedTrailTex) _sharedTrailTex = makeTrailCanvasTexture(0);
  return _sharedTrailTex;
}

/** GLSL noise + trail sampler — mirrors the JS functions; animated via uTrailTime at runtime. */
export const TRAIL_GLSL_LIB = /* glsl */`
  float trailHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float trailValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = trailHash21(i);
    float b = trailHash21(i + vec2(1.0, 0.0));
    float c = trailHash21(i + vec2(0.0, 1.0));
    float d = trailHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float trailCrossSection(float absV) {
    float core = exp(-absV * absV * 10.5);
    float halo = exp(-absV * 3.4) * 0.42;
    return min(1.0, core + halo);
  }
  float trailDirectionalWarp(float u, float v, float time) {
    float warpA = trailValueNoise(vec2(u * 5.5 + time * 0.18, 0.37)) - 0.5;
    float warpB = trailValueNoise(vec2(u * 11.0 - time * 0.09, v * 2.2 + 1.1)) - 0.5;
    float edgeFade = 1.0 - min(1.0, abs(v) * 0.72);
    return v + warpA * 0.30 * edgeFade + warpB * 0.14;
  }
  float trailStreakBlur(float u, float v, float time) {
    float sum = 0.0;
    float wsum = 0.0;
    for (int i = 0; i < 7; i++) {
      float t = float(i) / 6.0;
      float su = u - 0.14 * t;
      float bend = sin(su * 14.0 + time * 1.6) * 0.11;
      float n = trailValueNoise(vec2(su * 9.0 + bend, v * 3.1 + time * 0.22));
      float w = 1.0 - t * 0.38;
      sum += n * w;
      wsum += w;
    }
    return sum / max(wsum, 0.0001);
  }
  float trailSampleProcedural(float u, float v, float time) {
    float warpedV = trailDirectionalWarp(u, v, time);
    float cross = trailCrossSection(abs(warpedV));
    float streak = trailStreakBlur(u, warpedV, time);
    float taper = pow(max(0.0, 1.0 - u * 0.12), 0.55);
    return clamp(cross * (0.32 + streak * 0.88) * taper, 0.0, 1.0);
  }
`;

export function buildParticleTrailFrag(baseFrag) {
  return baseFrag.replace(
    'void main() {',
    `${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  varying float vTrailAxis;
  varying float vTrailStreak;
  void main() {`,
  ).replace(
    'float fall = exp(-r * 14.0);',
    `float streakMod = 1.0;
    if (vTrailStreak > 0.5) {
      vec2 p = gl_PointCoord - vec2(0.5);
      float ca = cos(vTrailAxis);
      float sa = sin(vTrailAxis);
      float along = fract(p.x * ca + p.y * sa + 0.5 + uTrailScroll);
      float side = (-p.x * sa + p.y * ca) * 2.0;
      streakMod = 0.40 + trailSampleProcedural(along, side, uTrailTime) * 1.05;
    }
    float fall = exp(-r * 14.0) * streakMod;`,
  );
}

export function buildParticleTrailVert(baseVert) {
  return baseVert.replace(
    'attribute float aAlpha;',
    `attribute float aAlpha;
  attribute float aTrailAxis;
  attribute float aTrailStretch;
  varying float vTrailAxis;
  varying float vTrailStreak;`,
  ).replace(
    'vAlpha = aAlpha;',
    `vAlpha = aAlpha;
    vTrailAxis = aTrailAxis;
    vTrailStreak = aTrailStretch;`,
  ).replace(
    'gl_PointSize = clamp(aSize * (uScale / max(-mv.z, 1.0)), 1.0, 64.0);',
    `float stretch = 1.0 + max(0.0, aTrailStretch) * 2.2;
    gl_PointSize = clamp(aSize * stretch * (uScale / max(-mv.z, 1.0)), 1.0, 96.0);`,
  );
}

/** Compare flat radial falloff vs streak-modulated intensity for evidence logs. */
export function compareFlatVsStreakSamples(time = 0.42) {
  const alongSamples = [];
  for (let i = 0; i <= 10; i++) alongSamples.push(sampleTrailTexture(i / 10, 0, time));
  const center = sampleTrailTexture(0.5, 0, time);
  const edge = sampleTrailTexture(0.5, 0.82, time);
  const flat = Math.exp(-0.25 * 14.0);
  const streakAtCenter = flat * (0.40 + center * 1.05);
  return {
    alongMin: Math.min(...alongSamples),
    alongMax: Math.max(...alongSamples),
    alongVariance: Math.max(...alongSamples) - Math.min(...alongSamples),
    centerIntensity: center,
    edgeIntensity: edge,
    flatParticleMod: flat,
    streakParticleMod: streakAtCenter,
    visualGain: streakAtCenter / Math.max(flat, 0.001),
  };
}