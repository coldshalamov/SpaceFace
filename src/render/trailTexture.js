// Procedural luminous-fluid trail field. The JS sampler is testable without THREE; its GLSL twin
// drives live ribbon/particle shaders with a moving filament, broken sheath, and tapered history.
import * as THREE from 'three';

const TEX_W = 256;
const TEX_H = 64;

// One numeric source for both CPU evidence and the emitted GLSL. The shader's hash is deliberately
// seedless: live materials share one coherent fluid language and pay no uniform/per-fragment seed.
export const TRAIL_NOISE_SPEC = Object.freeze({
  hashScaleX: 123.34,
  hashScaleY: 456.21,
  hashBias: 45.32,
});

const fract = (value) => value - Math.floor(value);

function hash21(x, y) {
  let px = fract(x * TRAIL_NOISE_SPEC.hashScaleX);
  let py = fract(y * TRAIL_NOISE_SPEC.hashScaleY);
  const dot = px * (px + TRAIL_NOISE_SPEC.hashBias)
    + py * (py + TRAIL_NOISE_SPEC.hashBias);
  px += dot;
  py += dot;
  return fract(px * py);
}

/** Exact scalar translation of trailValueNoise(vec2) in TRAIL_GLSL_LIB. */
function valueNoise2D(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let sx = x - x0;
  let sy = y - y0;
  sx = sx * sx * (3 - 2 * sx);
  sy = sy * sy * (3 - 2 * sy);
  const n00 = hash21(x0, y0);
  const n10 = hash21(x0 + 1, y0);
  const n01 = hash21(x0, y0 + 1);
  const n11 = hash21(x0 + 1, y0 + 1);
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
export function directionalWarp(u, v, time = 0) {
  const warpA = valueNoise2D(u * 5.5 + time * 0.18, 0.37) - 0.5;
  const warpB = valueNoise2D(u * 11.0 - time * 0.09, v * 2.2 + 1.1) - 0.5;
  const edgeFade = 1 - Math.min(1, Math.abs(v) * 0.72);
  return v + warpA * 0.30 * edgeFade + warpB * 0.14;
}

/** Axis-aligned average blur — Slope blur / Directional blur Trail mode = Average (photo 2/4). */
export function directionalStreakBlur(u, v, time = 0, trailLength = 0.14) {
  const steps = 7;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const su = u - trailLength * t;
    const bend = Math.sin(su * 14.0 + time * 1.6) * 0.11;
    const sample = valueNoise2D(su * 9.0 + bend, v * 3.1 + time * 0.22);
    const w = 1 - t * 0.38;
    sum += sample * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/** Longitudinal breakup prevents a broad ribbon from reading as one solid translucent polygon. */
export function fluidBreakup(u, v, time = 0) {
  const broad = valueNoise2D(u * 7.2 - time * 0.34, v * 1.8 + 4.7);
  const thread = valueNoise2D(u * 17.0 + time * 0.16, v * 4.4 + 0.8);
  return Math.max(0, Math.min(1, broad * 0.62 + thread * 0.38));
}

/**
 * Sample procedural trail intensity at UV:
 *   u — along exhaust (0 = nozzle, 1 = tail)
 *   v — cross-section (-1 = edge, 0 = center)
 */
export function sampleTrailTexture(u, v, time = 0, opts = {}) {
  const trailLength = opts.trailLength ?? 0.14;
  const warpedV = directionalWarp(u, v, time);
  const cross = crossSectionProfile(Math.abs(warpedV));
  const streak = directionalStreakBlur(u, warpedV, time, trailLength);
  const breakup = fluidBreakup(u, warpedV, time);
  const alongTaper = Math.pow(Math.max(0, 1 - u * 0.12), 0.55);
  const intensity = cross * (0.30 + streak * 0.82) * (0.64 + breakup * 0.58) * alongTaper;
  return Math.max(0, Math.min(1, intensity));
}

/**
 * CPU formula twin for the live ribbon's layered output. `u` is the shader's wrapped flow
 * coordinate; `pathT` is zero at the nozzle and one at the oldest sample. The optional opacity and
 * radiance inputs mirror the live uniforms. This is a tooling API; the render loop uses GLSL.
 *
 * Mirrors RIBBON_TRAIL_FRAG in engineTrailSurfaces.js (braided liquid plasma wake).
 */
export function sampleLuminousTrailLayers(u, v, pathT, time = 0, opts = {}) {
  const liquid = sampleTrailTexture(u, v, time, opts);
  const side = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  const filament = Math.exp(-side * side * 24);
  const ribbonOffA = 0.22 + 0.12 * Math.sin(u * 11 + time * 2.8);
  const ribbonOffB = 0.26 + 0.10 * Math.cos(u * 8.5 - time * 2.1);
  const ribbonA = Math.exp(-((side - ribbonOffA) ** 2) * 32);
  const ribbonB = Math.exp(-((side + ribbonOffB) ** 2) * 30);
  const ribbons = ribbonA * 0.62 + ribbonB * 0.55;
  const sheath = Math.exp(-side * side * 4.2);
  const arcNoise = valueNoise2D(u * 22 - time * 1.8, side * 5 + 0.6);
  // smoothstep(0.58, 0.92, arcNoise) with hermite easing for GLSL parity.
  const arcT = Math.max(0, Math.min(1, (arcNoise - 0.58) / 0.34));
  const arcsSmooth = arcT * arcT * (3 - 2 * arcT) * Math.exp(-Math.abs(side) * 2.4) * liquid;
  const fluidNoise = valueNoise2D(u * 9, time * 0.22);
  const threadNoise = valueNoise2D(u * 17 - time * 0.31, side * 2.4 + 1.7);
  const brokenSheath = liquid * sheath * (0.42 + 0.58 * fluidNoise)
    * (0.72 + 0.28 * threadNoise);
  const t = Math.max(0, Math.min(1, Number.isFinite(pathT) ? pathT : 1));
  // smoothstep(0.38, 1.0, pathT) → shorter jet tail
  const tailEdge = Math.max(0, Math.min(1, (t - 0.38) / 0.62));
  const tailEnvelope = 1 - tailEdge * tailEdge * (3 - 2 * tailEdge);
  // smoothstep(0.0, 0.12, pathT)
  const headEdge = Math.max(0, Math.min(1, t / 0.12));
  const headBoost = 1 - headEdge * headEdge * (3 - 2 * headEdge);
  const opacity = Number.isFinite(opts.opacity) ? Math.max(0, Math.min(1, opts.opacity)) : 1;
  const radianceScale = Number.isFinite(opts.radiance)
    ? Math.max(0, Math.min(3.2, opts.radiance))
    : 1;
  const sheathNoise = fluidNoise;
  const hotMix = Math.max(0, Math.min(1,
    filament * 0.78 + ribbons * 0.22 + headBoost * 0.20 + arcsSmooth * 0.18));
  return {
    liquid,
    filament,
    sheath,
    ribbons,
    arcs: arcsSmooth,
    sheathNoise,
    brokenSheath,
    tailEnvelope,
    headBoost,
    opacity,
    radianceScale,
    alpha: Math.min(1, opacity * tailEnvelope
      * (filament * 0.88 + ribbons * 0.72 + brokenSheath * 0.48 + sheath * 0.10 + arcsSmooth * 0.55)
      * (0.86 + headBoost * 0.28)),
    radiance: radianceScale
      * (0.72 + liquid * 0.78 + filament * 0.48 + ribbons * 0.28 + headBoost * 0.20 + arcsSmooth * 0.22),
    hotMix,
  };
}

export function buildTrailTexturePixels(width = TEX_W, height = TEX_H, time = 0) {
  const pixels = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      pixels[y * width + x] = sampleTrailTexture(u, v, time);
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
    p = fract(p * vec2(${TRAIL_NOISE_SPEC.hashScaleX}, ${TRAIL_NOISE_SPEC.hashScaleY}));
    p += dot(p, p + ${TRAIL_NOISE_SPEC.hashBias});
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
  float trailFluidBreakup(float u, float v, float time) {
    float broad = trailValueNoise(vec2(u * 7.2 - time * 0.34, v * 1.8 + 4.7));
    float thread = trailValueNoise(vec2(u * 17.0 + time * 0.16, v * 4.4 + 0.8));
    return clamp(broad * 0.62 + thread * 0.38, 0.0, 1.0);
  }
  float trailSampleProcedural(float u, float v, float time) {
    float warpedV = trailDirectionalWarp(u, v, time);
    float cross = trailCrossSection(abs(warpedV));
    float streak = trailStreakBlur(u, warpedV, time);
    float breakup = trailFluidBreakup(u, warpedV, time);
    float taper = pow(max(0.0, 1.0 - u * 0.12), 0.55);
    return clamp(cross * (0.30 + streak * 0.82) * (0.64 + breakup * 0.58) * taper, 0.0, 1.0);
  }
`;

/** Compare flat radial falloff vs streak-modulated intensity for evidence logs. */
export function compareFlatVsStreakSamples(time = 0.42) {
  const alongSamples = [];
  for (let i = 0; i <= 10; i++) alongSamples.push(sampleTrailTexture(i / 10, 0, time));
  const center = sampleTrailTexture(0.5, 0, time);
  const edge = sampleTrailTexture(0.5, 0.82, time);
  const alongMax = Math.max(...alongSamples);
  const flat = Math.exp(-0.25 * 14.0);
  // The live field is intentionally broken along its axis. Compare its bright filament phase with
  // the flat radial control instead of assuming u=0.5 happens to be a bright noise coordinate.
  const streakAtPeak = flat * (0.40 + alongMax * 1.05);
  return {
    alongMin: Math.min(...alongSamples),
    alongMax,
    alongVariance: alongMax - Math.min(...alongSamples),
    centerIntensity: center,
    edgeIntensity: edge,
    flatParticleMod: flat,
    streakParticleMod: streakAtPeak,
    visualGain: streakAtPeak / Math.max(flat, 0.001),
  };
}
