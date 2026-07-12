// SpaceFace SPEC3-F8b — "Painted Deep-Field" background.
//
// One THREE.Group locked to the camera's X/Z, floating at a fixed depth below the play plane.
// Layers (all depthTest/depthWrite off, explicit renderOrder, render-side only — never touches sim):
//   L0  void gradient + galaxy band + micro-stars + distant galaxies   (baked tile, opaque)
//   L1  main nebula: gas, dust lanes, star-forming knots               (baked tile, alpha blend)
//   L2  glow wisps, finer scale                                        (baked tile, additive)
//   L3  live star points, continuous per-star parallax + twinkle       (one THREE.Points)
//   L4  hero flare stars (diffraction sprites), per-instance parallax  (one InstancedMesh)
//   L5  planet impostors (GLSL-baked sphere sprites, LRU-cached)       (sprites)
//   L5b wormhole — the one live-animated shader, small quad only
//   L6  comet streak (rare, subtle)
//
// Key invariants:
//  * All baked noise is EXACTLY periodic (integer lattice periods, x2 lacunarity) → seamless tiles.
//  * Parallax = closed-form UV offset from absolute camera position, computed in JS doubles and
//    wrapped mod 1 before upload → no float drift at far coordinates, no accumulation state.
//  * Hero objects (planets/wormholes) are hashed on a grid in PARALLAX-SCALED background space
//    (bg = world * par), so placement is stable and heroes keep appearing forever as you fly.
//  * Everything is generated at load — zero static asset files, zero runtime deps.
//  * Repeat periods per layer are staggered (~golden ratio) so the combined pattern never aligns;
//    each layer's visual repeat distance is >= ~25 screens of flight.
import * as THREE from 'three';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { CAMERA_ZOOM_MAX, CONTEXT_ZOOM_MAX, SPEED_ZOOM_MAX } from './camera.js';

// ----------------------------------------------------------------------------
// Seeded PRNG (mulberry32) + string hash — ~15 lines, no deps.
// ----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

// ----------------------------------------------------------------------------
// Palettes (locked art direction — see design/spec3/SPEC3-F8b)
// ----------------------------------------------------------------------------
const PALETTES = {
  EMBER: {
    void: '#04060d', haze: '#0e1c30', gas: '#1e4a5c', emission: '#c9743d',
    core: '#ffe0b0', dust: '#02030a', accent: '#7fb4c9',
  },
  ION: {
    void: '#050510', haze: '#131238', gas: '#4a2160', emission: '#93307a',
    accent: '#37c9c0', core: '#f2e8ff', dust: '#030309',
  },
  VERDIGRIS: {
    void: '#030809', haze: '#0c2622', gas: '#175146', emission: '#c8a24a',
    core: '#fff3d0', dust: '#020604', accent: '#67c9a0',
  },
  // Helios/core sky — rank-10: deeper void, richer cyan gas, brighter emission for undock stills.
  AZURE: {
    void: '#02060e', haze: '#0a1838', gas: '#1a4a80', emission: '#3d9ad4',
    core: '#e8f4ff', dust: '#010308', accent: '#6ee0ff',
  },
  CRIMSON: {
    void: '#0a0507', haze: '#261014', gas: '#582026', emission: '#c24a30',
    core: '#ffd9b8', dust: '#060203', accent: '#e88a5a',
  },
};
const PALETTE_NAMES = ['EMBER', 'ION', 'VERDIGRIS', 'AZURE', 'CRIMSON'];

// Sector palette class → sky palette. Every sector class reads as a different sky:
// safe core space is cool blue, the belt is warm ember, the fringe runs hot red,
// anomaly space goes ion purple. (Class objects are shared references, so identity
// lookup against SECTOR_PALETTE_CLASSES is reliable.)
const SECTOR_CLASS_TO_SKY = { core: 'AZURE', belt: 'EMBER', fringe: 'CRIMSON', anomaly: 'ION' };

// Star colors follow blackbody temperature, weighted toward white/blue-white.
const BLACKBODY = [
  { col: '#9db4ff', w: 0.18 },
  { col: '#c8d5ff', w: 0.24 },
  { col: '#f8f7ff', w: 0.30 },
  { col: '#fff1e0', w: 0.16 },
  { col: '#ffd9a8', w: 0.08 },
  { col: '#ffb56b', w: 0.04 },
];
function pickBlackbody(rnd, tmpColor) {
  let w = rnd();
  let chosen = BLACKBODY[BLACKBODY.length - 1].col;
  for (const bb of BLACKBODY) { if (w < bb.w) { chosen = bb.col; break; } w -= bb.w; }
  tmpColor.set(chosen);
  return tmpColor;
}

// Layer stack constants. tileH = tile world size in units of H (screen-height at the play plane).
// Repeat travel distance = tileH / par screens: L0 333, L1 75, L2 ~28.5 — and the L1:L2 tile ratio
// is ~phi so the two nebula layers never visibly re-align with each other.
const LAYER_DEFS = [
  { name: 'L0_void',   par: 0.03, tileH: 10.0, depth: -30, blend: 'opaque' },
  { name: 'L1_nebula', par: 0.08, tileH: 6.0,  depth: -18, blend: 'normal' },
  { name: 'L2_wisps',  par: 0.13, tileH: 3.71, depth: -8,  blend: 'additive' },
];
const STAR_DEPTH = 6;       // group-local y for star/flare/hero planes (above the tiles)
const HERO_DEPTH = 12;
const PLANET_PAR = 0.055;   // single parallax factor for planet placement (bg-space grid)
const WORM_PAR = 0.10;
const LOOK_BIAS_Z = 0.30;   // camera never yaws; view center sits ahead (+Z) of the camera point

// ----------------------------------------------------------------------------
// GLSL: exactly-periodic value noise. vnoise(p, per) tiles with period `per`
// provided `per` is an integer; fbm keeps every octave integral (x2 lacunarity),
// so fbm(p, oct, baseFreq, seed) tiles with period 1 in p for integer baseFreq.
// ----------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */`
  float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p, float per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 c00 = mod(i + vec2(0.0, 0.0), per);
    vec2 c10 = mod(i + vec2(1.0, 0.0), per);
    vec2 c01 = mod(i + vec2(0.0, 1.0), per);
    vec2 c11 = mod(i + vec2(1.0, 1.0), per);
    return mix(mix(hash2(c00), hash2(c10), u.x),
               mix(hash2(c01), hash2(c11), u.x), u.y);
  }
  // Periodic FBM: octave i samples at freq*2^i with matching integral period.
  // Per-octave constant offsets decorrelate octaves without breaking periodicity.
  float fbm(vec2 p, int octaves, float baseFreq, float seed) {
    float v = 0.0;
    float amp = 0.5;
    float freq = baseFreq;
    vec2 off = vec2(fract(seed * 0.7311) * 61.0, fract(seed * 0.2793) * 47.0);
    for (int i = 0; i < 7; i++) {
      if (i >= octaves) break;
      v += amp * vnoise(p * freq + off, freq);
      freq *= 2.0;
      amp *= 0.5;
      off += vec2(11.7, 27.3);
    }
    return v;
  }
  vec2 fbm2(vec2 p, int octaves, float baseFreq, float seed) {
    return vec2(
      fbm(p, octaves, baseFreq, seed),
      fbm(p, octaves, baseFreq, seed + 133.7)
    );
  }
`;

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ----------------------------------------------------------------------------
// L0 — deep field base: void gradient, milky galaxy band, micro-stars, galaxies.
// The band uses sin^2(pi * dot(p, ivec)) so it tiles exactly; integer direction
// vectors keep the anisotropic streak noise periodic too.
// ----------------------------------------------------------------------------
const L0_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uVoid;
  uniform vec3 uHaze;
  uniform vec3 uCore;
  uniform float uSeed;
  uniform float uResolution;
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main() {
    vec2 p = vUv;
    // Base: near-black with a whisper of haze modulated by huge soft noise (keeps black alive).
    float breath = fbm(p, 3, 2.0, uSeed + 3.0);
    vec3 col = mix(uVoid, uHaze, 0.10 + 0.14 * breath);

    // Galaxy band: broad periodic band along the (1,-1) diagonal. Bands recur every
    // 1/sqrt(2) of the tile (~7H) — wider than the visible window, so at most ONE milky
    // river crosses the sky at a time; with par 0.03 you cross one every ~230 screens.
    float bandT = p.x + p.y;
    float s = sin(3.14159265 * bandT);
    float bandMask = exp(-s * s * 55.0);
    // Anisotropic streak noise elongated ALONG the band ((1,-1) ⊥ (1,1); both integer →
    // periodic). Compressing the across-axis stretches features along the band.
    vec2 q = vec2((p.x - p.y) * 1.0, (p.x + p.y) * 4.0);
    float streaks = fbm(q, 4, 3.0, uSeed + 11.0);
    float dustGap = fbm(q + vec2(0.0, 17.0), 3, 6.0, uSeed + 23.0); // dark rifts in the band
    float band = bandMask * (0.35 + 0.85 * streaks) * (1.0 - 0.55 * smoothstep(0.55, 0.8, dustGap));
    col += uCore * band * 0.075;
    col += uHaze * bandMask * 0.10;

    // Micro-stars: hash speckle, density modulated by cluster noise and boosted inside the band.
    float clusterMask = fbm(p, 3, 5.0, uSeed + 31.0);
    float density = 0.0006 + 0.0026 * smoothstep(0.35, 0.75, clusterMask) + 0.0040 * bandMask;
    vec2 cellPx = floor(p * uResolution);
    float sh = hash2(cellPx + floor(uSeed));
    float isStar = step(1.0 - density, sh);
    float mag = hash2(cellPx + 71.3);            // brightness power law
    float bright = 0.18 + 0.82 * mag * mag * mag;
    float warm = hash2(cellPx + 39.7);
    vec3 starCol = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.92, 0.78), warm * warm);
    col += starCol * isStar * bright;

    // A few distant galaxies: sparse hash grid, soft anisotropic blobs.
    vec2 gp = p * 7.0;
    vec2 gc = floor(gp);
    for (int gy = -1; gy <= 1; gy++) {
      for (int gx = -1; gx <= 1; gx++) {
        vec2 cellId = mod(gc + vec2(float(gx), float(gy)), 7.0);
        float has = hash2(cellId + floor(uSeed) * 0.31);
        if (has < 0.90) continue;
        vec2 jitter = vec2(hash2(cellId + 5.1), hash2(cellId + 9.7));
        vec2 d = gp - (gc + vec2(float(gx), float(gy)) + jitter);
        float ang = hash2(cellId + 13.3) * 6.28318;
        vec2 rd = vec2(d.x * cos(ang) - d.y * sin(ang), (d.x * sin(ang) + d.y * cos(ang)) * (2.2 + 2.0 * hash2(cellId + 3.3)));
        float rr = dot(rd, rd) * (90.0 + 240.0 * hash2(cellId + 21.0));
        float glow = exp(-rr);
        float warmth = hash2(cellId + 44.0);
        col += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.70), warmth) * glow * 0.16;
      }
    }

    // Dither kills banding in the dark gradients (mandatory).
    col += (hash2(gl_FragCoord.xy + fract(uSeed) * 100.0) - 0.5) * (2.0 / 255.0);
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

// ----------------------------------------------------------------------------
// L1/L2 — nebula bake. Double domain warp folds the gas into filaments; a ridged
// component gives wispy strands plain FBM can't; dark dust lanes erode AND
// occlude (alpha) so lanes read against the L0 starfield; knots pop hot cores.
// ----------------------------------------------------------------------------
const NEBULA_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uHaze, uGas, uEmission, uCore, uDust, uAccent;
  uniform float uSeed;
  uniform float uAlpha;
  uniform float uWarp;
  uniform float uDustAmt;
  uniform vec2 uRegion;      // smoothstep(lo, hi) on the coverage mask
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main() {
    vec2 p = vUv;

    // Double domain warp (both warp fields periodic → result stays seamless).
    vec2 w1 = (fbm2(p, 4, 2.0, uSeed + 1.0) - 0.5) * uWarp;
    vec2 p1 = p + w1;
    vec2 w2 = (fbm2(p1, 3, 6.0, uSeed + 2.0) - 0.5) * uWarp * 0.5;
    vec2 p2 = p1 + w2;

    // Regional mask: entire stretches of the tile stay empty void.
    float region = smoothstep(uRegion.x, uRegion.y, fbm(p1, 3, 2.0, uSeed + 3.0));

    // Density: soft billows + ridged filaments + fine grain so clouds have tooth.
    float base = fbm(p2, 6, 4.0, uSeed + 4.0);
    float ridge = 1.0 - abs(2.0 * fbm(p2, 5, 6.0, uSeed + 5.0) - 1.0);
    float d = clamp(base * 0.62 + ridge * ridge * 0.38, 0.0, 1.0);
    d = pow(d, 1.25);
    float grain = 0.82 + 0.36 * fbm(p2, 3, 16.0, uSeed + 8.0);
    float gas = clamp(smoothstep(0.42, 0.70, d) * grain, 0.0, 1.0) * region;
    float haze = smoothstep(0.22, 0.44, d) * region * 0.28;  // soft glow skirt around cores

    // Hue variation drives the ramp position so color drifts across the cloud.
    float hueV = fbm(p2, 3, 5.0, uSeed + 6.0);
    float t = gas * (0.55 + 0.65 * hueV);
    vec3 col = mix(uHaze, uGas, smoothstep(0.10, 0.42, t));
    col = mix(col, uEmission, smoothstep(0.52, 0.86, t));
    col = mix(col, uCore, smoothstep(0.82, 1.08, t));

    // Accent wisps (secondary hue family, sparingly).
    float wisp = smoothstep(0.80, 0.95, hueV) * gas;
    col = mix(col, uAccent, wisp * 0.45);

    // Dark dust lanes: sharper warped noise. Erodes color AND contributes alpha so the
    // lanes silhouette against background stars — the signature of real space art.
    float dust = smoothstep(0.52, 0.74, fbm(p1 + w2 * 2.0, 4, 9.0, uSeed + 7.0));
    float dustHere = dust * smoothstep(0.05, 0.30, region) * uDustAmt;
    col = mix(col, uDust, dustHere);

    // Star-forming knots: hot near-white cores where density peaks.
    float knot = smoothstep(0.88, 0.98, d * (0.75 + 0.5 * ridge)) * gas;
    col = mix(col, uCore, knot * 0.85);
    col += uCore * knot * 0.35;

    // keep the faint fringes dark — value structure over smoke
    col *= (0.72 + 0.45 * gas);

    float a = max(gas * uAlpha, haze * uAlpha * 0.55);
    a = max(a, dustHere * 0.40);

    col += (hash2(gl_FragCoord.xy + fract(uSeed) * 100.0) - 0.5) * (2.0 / 255.0);
    gl_FragColor = vec4(max(col, vec3(0.0)), a);
  }
`;

// ----------------------------------------------------------------------------
// L3 — star points. Continuous per-star parallax (aPar): each star wraps inside a
// camera-centered cell using its own factor, giving a smooth depth gradient rather
// than discrete bands. Sizes are true-perspective (world size → pixels via the
// projection), so zoom breathes them naturally.
// ----------------------------------------------------------------------------
const STAR_VERT = /* glsl */`
  attribute vec3 aColor;
  attribute float aSize;        // world units at the star plane
  attribute float aPar;         // parallax factor 0.10..0.45
  attribute float aBase;        // per-star base brightness
  attribute float aTwinklePhase;
  attribute float aTwinkleSpeed;
  uniform vec2 uCamPos;         // absolute camera x/z (f32 is fine: error << 1px at bg depth)
  uniform float uCellSize;
  uniform vec2 uWindowBias;     // shifts the wrap window toward the view center (+Z)
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uIntensity;
  uniform float uPerspScale;    // 0.5 * drawBufferHeight * proj[1][1]
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 off = uCamPos * aPar;
    vec2 wrapped = mod(position.xz - off + uCellSize * 0.5, uCellSize) - uCellSize * 0.5 + uWindowBias;
    vec4 mvPosition = modelViewMatrix * vec4(wrapped.x, position.y, wrapped.y, 1.0);
    float sizePx = aSize * uPerspScale / max(1.0, -mvPosition.z);
    gl_PointSize = clamp(sizePx, 1.0, 24.0);
    float tw = sin(uTime * aTwinkleSpeed + aTwinklePhase);
    vAlpha = aBase * (0.82 + 0.18 * tw) * uIntensity;
    vColor = aColor * uTint;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const STAR_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float a = exp(-r2 * 4.0);
    gl_FragColor = vec4(vColor, vAlpha * a);
  }
`;

// ----------------------------------------------------------------------------
// L4 — hero flare stars: instanced screen-facing quads with a baked diffraction
// atlas. Same wrap-with-own-parallax as the points, so no popping ever.
// ----------------------------------------------------------------------------
const FLARE_VERT = /* glsl */`
  attribute vec3 aColor;
  attribute float aSizePx;      // on-screen size in pixels (reference buffer height)
  attribute float aPar;
  uniform vec2 uCamPos;
  uniform float uCellSize;
  uniform vec2 uWindowBias;
  uniform float uPerspScale;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec3 inst = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
    vec2 off = uCamPos * aPar;
    vec2 wrapped = mod(inst.xz - off + uCellSize * 0.5, uCellSize) - uCellSize * 0.5 + uWindowBias;
    vec4 viewCenter = modelViewMatrix * vec4(wrapped.x, inst.y, wrapped.y, 1.0);
    // pixel-true quad: world size = px * dist / perspScale
    float worldSize = aSizePx * max(1.0, -viewCenter.z) / uPerspScale;
    vec4 viewPos = viewCenter + vec4(position.xy * worldSize, 0.0, 0.0);
    gl_Position = projectionMatrix * viewPos;
    vUv = position.xy * 0.5 + 0.5;
    vColor = aColor;
  }
`;
const FLARE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec4 s = texture2D(uMap, vUv);
    if (s.a < 0.01) discard;
    gl_FragColor = vec4(vColor * uTint * s.rgb, s.a * uIntensity);
  }
`;

// ----------------------------------------------------------------------------
// L5 — planet impostor bake. Full sphere shading on a quad: surface FBM per type,
// crescent lighting with soft terminator + limb darkening, fresnel atmosphere with
// a lit outer glow, and an analytic tilted ring (front half over the disc, back
// half behind it, shadowed opposite the sun). Baked once to a 512 RT per planet.
// ----------------------------------------------------------------------------
const PLANET_FRAG = /* glsl */`
  precision highp float;
  uniform float uSeed;
  uniform float uType;          // 0 gas giant, 1 rocky, 2 ice
  uniform vec2 uLightDir;       // normalized, in impostor plane
  uniform float uRing;          // 0/1
  uniform float uRingTilt;      // radians
  uniform vec3 uColA, uColB, uColC;   // surface ramp
  uniform vec3 uAtm;            // atmosphere color
  varying vec2 vUv;
  ${NOISE_GLSL}

  // planet radius as fraction of the quad half-extent (leaves room for ring + glow)
  const float R = 0.42;
  const float AA = 0.006;

  vec3 surfaceColor(vec2 q, vec3 n) {
    float type = uType;
    if (type < 0.5) {
      // gas giant: latitude bands, warped, compressed vertically
      float latWarp = (fbm(q * 0.5 + 0.5, 3, 4.0, uSeed + 9.0) - 0.5) * 0.35;
      float lat = q.y / max(0.25, n.z) * 0.72 + latWarp;   // slight sphere wrap
      float bands = fbm(vec2(q.x * 0.35, lat * 2.6) + 0.5, 4, 4.0, uSeed + 2.0);
      float storm = smoothstep(0.78, 0.92, fbm(q * 0.7 + 0.5, 3, 8.0, uSeed + 5.0));
      vec3 c = mix(uColA, uColB, smoothstep(0.25, 0.65, bands));
      c = mix(c, uColC, smoothstep(0.62, 0.92, bands));
      c = mix(c, uColC * 1.25, storm * 0.5);
      return c;
    } else if (type < 1.5) {
      // rocky: mottled terrain + crater speckle + dark maria
      float terrain = fbm(q * 0.8 + 0.5, 5, 6.0, uSeed + 3.0);
      float maria = smoothstep(0.50, 0.72, fbm(q * 0.5 + 0.5, 3, 3.0, uSeed + 7.0));
      float crater = smoothstep(0.84, 0.96, vnoise((q + 1.0) * 24.0, 48.0));
      vec3 c = mix(uColA * 0.75, uColB, terrain);
      c = mix(c, uColA * 0.40, maria * 0.75);
      c *= 1.0 - crater * 0.45;
      c = mix(c, uColC, smoothstep(0.80, 0.95, terrain) * 0.5);
      return pow(c, vec3(1.18));
    }
    // ice: pale bands + bright polar caps
    float bands = fbm(vec2(q.x * 0.4, q.y * 1.8) + 0.5, 4, 4.0, uSeed + 4.0);
    float caps = smoothstep(0.55, 0.85, abs(q.y));
    vec3 c = mix(uColA, uColB, bands);
    c = mix(c, uColC, caps * 0.85);
    return c;
  }

  void main() {
    vec2 pq = (vUv * 2.0 - 1.0);          // -1..1 quad space
    vec2 q = pq / R;                       // planet space: |q| == 1 at the limb
    float r = length(q);
    // sun mostly overhead (we're painting a lit background object, not a mystery
    // silhouette) — the planar component only steers WHERE the crescent falls
    vec3 L = normalize(vec3(uLightDir * 0.62, 0.72));
    // rocky worlds have thin air — halve their atmosphere terms
    float atmK = (uType > 0.5 && uType < 1.5) ? 0.5 : 1.0;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // ---- ring geometry (computed for both halves) --------------------------------
    float ringA = 0.0;
    vec3 ringCol = vec3(0.0);
    float ringFront = 0.0;
    if (uRing > 0.5) {
      float ca = cos(uRingTilt), sa = sin(uRingTilt);
      vec2 rp = vec2(q.x * ca + q.y * sa, -q.x * sa + q.y * ca);
      float rr = length(vec2(rp.x, rp.y / 0.30));
      float t = smoothstep(1.45, 1.55, rr) * (1.0 - smoothstep(2.05, 2.18, rr));
      if (t > 0.001) {
        float pattern = vnoise(vec2(rr * 9.0, 0.5) + uSeed, 64.0);
        float gaps = smoothstep(0.25, 0.45, pattern);
        // planet shadow across the ring, opposite the sun
        vec2 rdir = normalize(q);
        float behindSun = smoothstep(0.35, 0.85, dot(rdir, -normalize(uLightDir)));
        float shadow = behindSun * (1.0 - smoothstep(1.7, 2.4, rr));
        ringA = t * gaps * 0.62 * (1.0 - shadow * 0.85);
        float bright = 0.55 + 0.45 * vnoise(vec2(rr * 21.0, 3.5) + uSeed, 128.0);
        ringCol = mix(uColB, uColC, 0.5) * bright * (0.35 + 0.65 * (1.0 - shadow));
        ringFront = step(0.0, rp.y);   // lower half (screen) passes in front of the disc
      }
    }

    // ---- ring behind the planet ----------------------------------------------------
    float discMask = 1.0 - smoothstep(1.0 - AA, 1.0 + AA, r);
    float behindA = ringA * (1.0 - ringFront) * (1.0 - discMask);
    col += ringCol * behindA;
    alpha = max(alpha, behindA);

    // ---- planet disc ---------------------------------------------------------------
    if (r < 1.0 + AA) {
      float z2 = max(0.0, 1.0 - r * r);
      vec3 n = vec3(q.x, q.y, sqrt(z2));
      float diff = clamp(dot(n, L), 0.0, 1.0);
      // soft terminator + gentle gamma so the crescent reads painterly
      float lit = smoothstep(0.0, 0.16, diff) * pow(max(diff, 0.0), 0.85);
      float limb = 0.55 + 0.45 * pow(max(n.z, 0.0), 0.5);
      vec3 surf = surfaceColor(q, n);
      vec3 day = surf * lit * limb * vec3(1.03, 1.0, 0.96);
      vec3 night = surf * 0.055 + vec3(0.014, 0.018, 0.030);
      vec3 body = day + night * (1.0 - lit);
      // interior fresnel atmosphere, stronger on the lit side
      float fres = pow(1.0 - max(n.z, 0.0), 2.6);
      body += uAtm * fres * (0.22 + 0.78 * lit) * 1.25 * atmK;
      col = mix(col, body, discMask);
      alpha = max(alpha, discMask);
    }

    // ---- outer atmosphere glow -------------------------------------------------------
    if (r >= 1.0 - AA) {
      float g = exp(-(r - 1.0) * 16.0) * step(1.0, r + AA);
      float litSide = clamp(dot(normalize(q + 1e-5), normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
      float glow = g * (0.16 + 0.66 * litSide) * atmK;
      col += uAtm * glow;
      alpha = max(alpha, glow * 0.85);
    }

    // ---- ring in front of the planet -------------------------------------------------
    float frontA = ringA * ringFront;
    col = mix(col, ringCol, frontA);
    alpha = max(alpha, frontA);

    col += (hash2(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);
    gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
  }
`;

// ----------------------------------------------------------------------------
// L5b — wormhole. The single live-animated shader; cost bounded by its small quad.
// Counter-rotating log-spiral streaks, dark core, doppler-bright accretion rim,
// and true-feeling lensing that pulls the ALREADY-BAKED L1 nebula tile inward.
// ----------------------------------------------------------------------------
const WORMHOLE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uL1;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uIntensity;
  uniform float uLensing;
  uniform float uChromatic;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;              // 0 at center, ~1 at quad edge midpoints
    float theta = atan(c.y, c.x);
    float fade = 1.0 - smoothstep(0.72, 0.98, r);
    if (fade < 0.002) discard;

    // pulse: slow breathing, +-8%
    float pulse = 1.0 + 0.08 * sin(uTime * 0.9);

    // counter-rotating spiral streak layers
    float lr = log(r + 0.05);
    float s1 = fbm(vec2(theta * 1.11 + uTime * 0.055, lr * 1.4 - uTime * 0.03) * 2.0, 3, 4.0, 11.0);
    float s2 = fbm(vec2(theta * -0.79 - uTime * 0.045, lr * 1.2 + uTime * 0.024) * 2.0, 3, 4.0, 19.0);
    float streaks = pow(clamp((s1 + s2) * 0.62, 0.0, 1.0), 1.6);

    // dark throat + doppler-beamed accretion rim
    float core = 1.0 - smoothstep(0.16, 0.28, r);
    float rim = smoothstep(0.22, 0.28, r) * (1.0 - smoothstep(0.28, 0.37, r));
    float beam = 1.0 + 0.65 * cos(theta - 0.8);

    // lensing: sample the baked nebula pulled radially toward the throat
    vec3 lens = vec3(0.0);
    if (uLensing > 0.5) {
      float bend = 0.22 / max(r, 0.14);
      vec2 lensUv = vec2(0.5) + c * (1.0 + bend);
      lens = texture2D(uL1, fract(lensUv)).rgb * 1.4;
      if (uChromatic > 0.5) {
        vec2 lensUvR = vec2(0.5) + c * (1.0 + bend * 1.06);
        lens.r = texture2D(uL1, fract(lensUvR)).r * 1.4;
      }
    }

    vec3 col = uColor * streaks * 0.85 * (1.0 - core);
    col += uCore * rim * beam * 2.4 * pulse;
    col += lens * (1.0 - core) * (1.0 - rim) * 0.5 * uLensing;
    col += uColor * exp(-r * 5.5) * 0.45 * (1.0 - core);   // inner haze just outside the throat
    col *= fade * uIntensity;
    // throat is BLACK — punch it out of everything
    col *= (1.0 - core * 0.97);

    float a = fade * max(max(streaks * 0.5, rim * beam * 0.8), core * 0.95);
    gl_FragColor = vec4(max(col, vec3(0.0)), clamp(a, 0.0, 1.0));
  }
`;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

function castToPlane(camera, ndcX, ndcY, planeY, out) {
  _plane.constant = -planeY;
  _ndc.set(ndcX, ndcY);
  _ray.setFromCamera(_ndc, camera);
  const ok = _ray.ray.intersectPlane(_plane, out);
  return ok ? out : null;
}

// world-units-per-screen-height at the play plane (y=0) for the current camera pose
function measureScreenHeightWorld(camera) {
  const top = castToPlane(camera, 0, 1, 0, new THREE.Vector3());
  const bottom = castToPlane(camera, 0, -1, 0, new THREE.Vector3());
  if (!top || !bottom) return 96;
  return Math.max(1, top.distanceTo(bottom));
}

// ----------------------------------------------------------------------------
// Main class
// ----------------------------------------------------------------------------
export class SpaceBackground {
  constructor(scene, state, opts = {}) {
    this.scene = scene;
    this.state = state;
    this.renderer = opts.renderer;
    this.camera = opts.camera;
    this.debug = !!opts.debug;
    this.seed = (state && state.meta && Number.isFinite(state.meta.seed)) ? (state.meta.seed >>> 0) : 0xC0FFEE;
    // skySeed = world seed ⊕ sector hash: every sector gets its own nebula/starfield.
    // Until the first sector:enter it equals the world seed.
    this.skySeed = this.seed;
    this._sectorId = null;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);

    // ---- measured world scale (everything sizes off these) ----------------------
    this.H = measureScreenHeightWorld(this.camera);
    this.bgY = -this.H * 2.2;

    // ---- quality tier (re-applied by renderer via applyGpuTier once GPU is known) --
    this._resolveTier();

    this.group = new THREE.Group();
    this.group.name = 'SpaceBackground';
    scene.add(this.group);

    this.layers = [];
    this.stars = null;
    this.flares = null;
    this.planets = [];
    this.wormhole = null;
    this.comet = null;

    this.bgTime = 0;
    this.camX = 0;
    this.camZ = 0;
    // single user-facing dial for backdrop strength (also SF.bg.setIntensity in debug)
    this.bgIntensity = 0.75;
    this.currentPaletteName = 'EMBER';
    this.regionPaletteT = 0;
    this.regionLockUntil = 0;
    this.regionNoiseScale = 1 / (this.H * 55);

    // zero-alloc scratch for the per-frame tint math
    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
    this._tintA = new THREE.Color(1, 1, 1);
    this._tintB = new THREE.Color(1, 1, 1);
    this._starTint = new THREE.Color(1, 1, 1);
    this._dbs = new THREE.Vector2();

    // planet texture LRU (render targets, disposed when evicted)
    this.planetCache = new Map();
    this.planetCacheOrder = [];
    // Must comfortably exceed the number of distinct planets a travel session revisits, or the LRU
    // thrashes and every grid crossing re-bakes a 512² procedural planet on the GPU mid-flight.
    this.maxPlanetCache = 16;
    this.heroPlacement = [];
    this._lastPlanetGX = null; this._lastPlanetGZ = null;
    this._lastWormGX = null; this._lastWormGZ = null;

    // ---- bake rig -----------------------------------------------------------------
    this.bakeScene = new THREE.Scene();
    this.bakeCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    this.bakePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    this.bakePlane.position.z = -1;
    this.bakeScene.add(this.bakePlane);

    this._measureGeometry();
    this.flareAtlas = this._bakeFlareAtlas();
    this.bakeTimer = 0;
    this.bakeAll();
    this._createStars();
    this._createFlares();
    this._createComet();
    this._refreshHeroes(true);

    if (this.debug && typeof window !== 'undefined') {
      const bg = this;
      window.SF = window.SF || {};
      window.SF.bg = {
        rebake: (s) => bg.rebake(s),
        setPalette: (name) => bg.setPalette(name),
        setIntensity: (x) => bg.setIntensity(x),
        stats: () => bg.stats(),
        teleport: () => { bg._lastPlanetGX = null; bg._lastWormGX = null; },
        forceTier: (name) => { bg.tierOverride = name || null; const was = bg.tierName; bg._resolveTier(); if (bg.tierName !== was) { bg.bakeAll(); bg._rebuildStarsAndFlares(); bg._createComet(); bg._refreshHeroes(true); } },
      };
    }
  }

  _resolveTier() {
    const state = this.state;
    const gpu = (state && state.render && state.render.gpu) || {};
    const particleQuality = (state && state.settings && state.settings.video && state.settings.video.particleQuality) || 'medium';
    let tier;
    if (this.tierOverride) {
      tier = this.tierOverride === 'default' ? 'high' : this.tierOverride;
    } else if (gpu.tier === 'software' || !!gpu.software || particleQuality === 'low') {
      tier = 'low';
    } else if (gpu.tier === 'integrated' || gpu.tier === 'unknown' || !gpu.tier) {
      // measured on Intel iGPU: full tier tips the frame over vsync (30fps lock); either
      // half alone holds 60 — so mid keeps the hero L1 tile crisp and trims the rest
      tier = 'mid';
    } else {
      tier = 'high';
    }
    this.tierName = tier;
    this.lowTier = tier === 'low';
    // per-layer bake sizes: L1 carries the nebula detail, L0/L2 tolerate half res
    this.bakeSizes = tier === 'low'
      ? { L0_void: 512, L1_nebula: 1024, L2_wisps: 512 }
      : tier === 'mid'
        ? { L0_void: 1024, L1_nebula: 2048, L2_wisps: 1024 }
        : { L0_void: 2048, L1_nebula: 2048, L2_wisps: 2048 };
    this.bakeSize = this.bakeSizes.L1_nebula; // L0 micro-star density keys off this
    // star counts look sparse relative to the wrap cell (sized for max zoom-out), so they
    // run higher than "visible stars": at default zoom only ~2-6% of the cell is on screen.
    this.starCount = tier === 'low' ? 4200 : tier === 'mid' ? 7000 : 12000;
    this.flareCount = tier === 'low' ? 28 : tier === 'mid' ? 44 : 60;
  }

  // Renderer calls this right after detectGpu() (which runs later in init than our
  // construction). Re-tiers and rebuilds only if the tier actually changed.
  applyGpuTier() {
    const was = this.tierName;
    this._resolveTier();
    if (this.tierName === was) return;
    this.bakeAll();
    this._rebuildStarsAndFlares();
    this._createComet();
    this._refreshHeroes(true);
  }

  // ---- measured geometry: footprints, distances, pixel scale -----------------------
  _measureGeometry() {
    const cam = this.camera;
    // distance to play plane vs. layer planes through the view center → size correction
    const c0 = castToPlane(cam, 0, 0, 0, new THREE.Vector3());
    const distPlay = c0 ? cam.position.distanceTo(c0) : this.H;
    const heroPlaneY = this.bgY + HERO_DEPTH;
    const cH = castToPlane(cam, 0, 0, heroPlaneY, new THREE.Vector3());
    this.heroDist = cH ? cam.position.distanceTo(cH) : distPlay * 4;
    this.heroSizeK = this.heroDist / Math.max(1, distPlay);   // screen-fraction -> world multiplier

    // footprint on the deepest plane: cast the 4 screen corners, take the max extent.
    // zoomHeadroom covers max manual zoom plus dynamic speed/context zoom, shake, and lookahead.
    const camState = this.state && this.state.camera;
    const zoomNow = Math.max(45, (camState && Number.isFinite(camState.zoom)) ? camState.zoom : 88);
    const zoomHeadroom = (CAMERA_ZOOM_MAX * SPEED_ZOOM_MAX * (1 + CONTEXT_ZOOM_MAX)) / zoomNow;
    let ext = 0;
    const deepY = this.bgY + LAYER_DEFS[0].depth;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = castToPlane(cam, nx, ny, deepY, _hit);
      if (!p) continue;
      ext = Math.max(ext, Math.abs(p.x - cam.position.x), Math.abs(p.z - cam.position.z));
    }
    if (!(ext > 0)) ext = this.H * 8;
    this.quadSize = ext * 2 * Math.max(1.5, zoomHeadroom) * 1.35;

    // star/flare wrap cell: must cover the footprint at max zoom with the +Z window bias
    this.starCell = Math.max(this.H * 18, this.quadSize * 0.75);
    this.windowBiasZ = this.starCell * LOOK_BIAS_Z * 0.5;

    // pixel scale for point/flare sizing (recomputed per frame — dynamic resolution changes it)
    this.perspScale = this._computePerspScale();
    // star world-size per on-screen pixel at the star plane
    const starPlaneY = this.bgY + STAR_DEPTH;
    const cS = castToPlane(cam, 0, 0, starPlaneY, new THREE.Vector3());
    const starDist = cS ? cam.position.distanceTo(cS) : distPlay * 4;
    this.starPxToWorld = starDist / Math.max(1, this.perspScale);
  }

  _computePerspScale() {
    let bufH = 973;
    if (this.renderer) {
      this.renderer.getDrawingBufferSize(this._dbs);
      if (this._dbs.y > 0) bufH = this._dbs.y;
    }
    const proj = this.camera.projectionMatrix.elements[5]; // 1/tan(fov/2)
    return 0.5 * bufH * (Number.isFinite(proj) && proj > 0 ? proj : 2.14);
  }

  // --------------------------------------------------------------------------
  // Baking
  // --------------------------------------------------------------------------
  _makeRT(size) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    try {
      const maxAniso = this.renderer && this.renderer.capabilities
        ? this.renderer.capabilities.getMaxAnisotropy() : 1;
      rt.texture.anisotropy = Math.min(4, maxAniso || 1);
    } catch (_) { /* anisotropy optional */ }
    return rt;
  }

  _bakeLayer(material, rt) {
    const renderer = this.renderer;
    const prev = renderer.getRenderTarget();
    // Write the shader output RAW into the target: no blending against the clear color,
    // and a fully transparent clear — otherwise every tile inherits the renderer's opaque
    // clear color as its "empty" area (planet sprites become dark rectangles, the L1 quad
    // goes opaque and hides L0 entirely).
    if (!this._prevClearColor) this._prevClearColor = new THREE.Color();
    renderer.getClearColor(this._prevClearColor);
    const prevAlpha = renderer.getClearAlpha();
    material.blending = THREE.NoBlending;
    material.depthTest = false;
    material.depthWrite = false;
    this.bakePlane.material = material;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.render(this.bakeScene, this.bakeCam);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(this._prevClearColor, prevAlpha);
  }

  _paletteColors(name) {
    const pal = PALETTES[name] || PALETTES.EMBER;
    const u = {};
    for (const k of ['void', 'haze', 'gas', 'emission', 'core', 'dust', 'accent']) {
      u[k] = new THREE.Color(pal[k] || pal.emission);
    }
    return u;
  }

  bakeAll(paletteName = this.currentPaletteName) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    this._disposeBakeTargets();
    this.currentPaletteName = PALETTES[paletteName] ? paletteName : 'EMBER';
    const p = this._paletteColors(this.currentPaletteName);
    const sizes = this.bakeSizes;
    const bakeSeed = (this.skySeed % 100000) * 0.001;

    // L0 — deep field base
    const l0 = this._makeRT(sizes.L0_void);
    const l0Mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: L0_FRAG,
      uniforms: {
        uVoid: { value: p.void }, uHaze: { value: p.haze }, uCore: { value: p.core },
        uSeed: { value: bakeSeed + 17.0 },
        uResolution: { value: sizes.L0_void },
      },
    });
    this._bakeLayer(l0Mat, l0);
    l0Mat.dispose();
    this.l0Target = l0;

    // L1 — main nebula (alpha blend; carries the dust lanes)
    const l1 = this._makeRT(sizes.L1_nebula);
    const l1Mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: {
        uHaze: { value: p.haze }, uGas: { value: p.gas }, uEmission: { value: p.emission },
        uCore: { value: p.core }, uDust: { value: p.dust }, uAccent: { value: p.accent },
        uSeed: { value: bakeSeed + 29.0 },
        uAlpha: { value: this.lowTier ? 0.52 : 0.58 },
        uWarp: { value: 0.34 },
        uDustAmt: { value: 0.72 },
        uRegion: { value: new THREE.Vector2(0.50, 0.68) },
      },
      transparent: true,
    });
    this._bakeLayer(l1Mat, l1);
    l1Mat.dispose();
    this.l1Target = l1;

    // L2 — sparser glow wisps (additive; minimal dust)
    const l2 = this._makeRT(sizes.L2_wisps);
    const l2Mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: {
        uHaze: { value: p.haze }, uGas: { value: p.gas }, uEmission: { value: p.emission },
        uCore: { value: p.core }, uDust: { value: p.dust }, uAccent: { value: p.accent },
        uSeed: { value: bakeSeed + 61.0 },
        uAlpha: { value: this.lowTier ? 0.10 : 0.13 },
        uWarp: { value: 0.55 },
        uDustAmt: { value: 0.12 },
        uRegion: { value: new THREE.Vector2(0.56, 0.74) },
      },
      transparent: true,
    });
    this._bakeLayer(l2Mat, l2);
    l2Mat.dispose();
    this.l2Target = l2;

    this.bakeTimer = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
    this._buildLayers();
    if (this.wormhole) {
      this.wormhole.material.uniforms.uL1.value = this.l1Target.texture;
      this.wormhole.material.uniforms.uColor.value.set(PALETTES[this.currentPaletteName].emission);
      this.wormhole.material.uniforms.uCore.value.set(PALETTES[this.currentPaletteName].core);
    }
  }

  // WebGL context restoration: render-target textures retain their CPU wrapper identity but lose
  // their GPU pixels. Refill those targets IN PLACE so every layer/planet material keeps the exact
  // authored texture reference. Never dispose or rebuild the visible graph here: its dispose
  // listeners were registered by the previous GL generation and deleting through the restored
  // context produces wrong-context errors.
  onContextRestore() {
    const p = this._paletteColors(this.currentPaletteName);
    const sizes = this.bakeSizes;
    const bakeSeed = (this.skySeed % 100000) * 0.001;
    const entries = [
      [this.l0Target, new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: L0_FRAG,
        uniforms: {
          uVoid: { value: p.void }, uHaze: { value: p.haze }, uCore: { value: p.core },
          uSeed: { value: bakeSeed + 17.0 },
          uResolution: { value: sizes.L0_void },
        },
      })],
      [this.l1Target, new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: NEBULA_FRAG,
        uniforms: {
          uHaze: { value: p.haze }, uGas: { value: p.gas }, uEmission: { value: p.emission },
          uCore: { value: p.core }, uDust: { value: p.dust }, uAccent: { value: p.accent },
          uSeed: { value: bakeSeed + 29.0 },
          uAlpha: { value: this.lowTier ? 0.52 : 0.58 },
          uWarp: { value: 0.34 },
          uDustAmt: { value: 0.72 },
          uRegion: { value: new THREE.Vector2(0.50, 0.68) },
        },
        transparent: true,
      })],
      [this.l2Target, new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: NEBULA_FRAG,
        uniforms: {
          uHaze: { value: p.haze }, uGas: { value: p.gas }, uEmission: { value: p.emission },
          uCore: { value: p.core }, uDust: { value: p.dust }, uAccent: { value: p.accent },
          uSeed: { value: bakeSeed + 61.0 },
          uAlpha: { value: this.lowTier ? 0.10 : 0.13 },
          uWarp: { value: 0.55 },
          uDustAmt: { value: 0.12 },
          uRegion: { value: new THREE.Vector2(0.56, 0.74) },
        },
        transparent: true,
      })],
    ];
    for (const [target, material] of entries) {
      if (target) this._bakeLayer(material, target);
      material.dispose(); // fresh restored-context material; safe to retire immediately
    }

    const activePlanetKeys = new Set();
    for (const planet of this.planets) {
      const spec = planet && planet.spec;
      if (!spec) continue;
      const key = `${spec.type}_${spec.seed}_${spec.ring ? 1 : 0}`;
      const target = this.planetCache.get(key);
      if (!target) continue;
      activePlanetKeys.add(key);
      this._renderPlanetTarget(target, spec);
    }
    // Inactive cached render-target pixels are gone and have no visible consumers. Drop only their
    // JS cache references (no dispose); a later hero spawn creates a fresh target in this context.
    for (const key of [...this.planetCache.keys()]) {
      if (!activePlanetKeys.has(key)) this.planetCache.delete(key);
    }
    this.planetCacheOrder = this.planetCacheOrder.filter((key) => activePlanetKeys.has(key));
  }

  _disposeBakeTargets() {
    for (const t of [this.l0Target, this.l1Target, this.l2Target]) { if (t) t.dispose(); }
    this.l0Target = this.l1Target = this.l2Target = null;
  }

  _buildLayers() {
    for (const L of this.layers) {
      if (L.mesh) { this.group.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); }
    }
    this.layers = [];
    const targets = { L0_void: this.l0Target, L1_nebula: this.l1Target, L2_wisps: this.l2Target };

    let order = -95;
    for (const def of LAYER_DEFS) {
      const tile = def.tileH * this.H;
      const size = this.quadSize;
      const geo = new THREE.PlaneGeometry(size, size);
      const tex = targets[def.name].texture;
      tex.repeat.set(size / tile, size / tile);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        blending: def.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
        transparent: def.blend !== 'opaque',
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = def.name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = def.depth;
      // bias the quad toward where the tilted camera actually looks (+Z, it never yaws)
      mesh.position.z = size * 0.14;
      mesh.renderOrder = order++;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.layers.push({ mesh, tex, par: def.par, tile, def });
    }
  }

  // --------------------------------------------------------------------------
  // Flare atlas (canvas — soft core + 4 diffraction spikes; bake-time only)
  // --------------------------------------------------------------------------
  _bakeFlareAtlas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 118);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.38, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 128, 118, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate((Math.PI / 2) * i);
      const sg = ctx.createLinearGradient(0, 0, 0, 126);
      sg.addColorStop(0, 'rgba(255,255,255,0.6)');
      sg.addColorStop(0.4, 'rgba(255,255,255,0.14)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(-2.2, 0); ctx.lineTo(2.2, 0); ctx.lineTo(0, 126); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --------------------------------------------------------------------------
  // L3 — stars
  // --------------------------------------------------------------------------
  _createStars() {
    const count = this.starCount;
    const cell = this.starCell;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const pars = new Float32Array(count);
    const bases = new Float32Array(count);
    const twinklePhase = new Float32Array(count);
    const twinkleSpeed = new Float32Array(count);

    const rnd = mulberry32(this.skySeed + 101);
    const tmp = new THREE.Color();
    // gaussian clusters give the 6:1 dense/sparse contrast; a floor keeps voids from being empty
    const clusterRnd = mulberry32(this.skySeed + 202);
    const clusters = [];
    for (let i = 0; i < 6; i++) {
      clusters.push({
        x: (clusterRnd() - 0.5) * cell,
        z: (clusterRnd() - 0.5) * cell,
        r: this.H * (0.5 + clusterRnd() * 1.6),
        strength: 0.55 + clusterRnd() * 0.65,
      });
    }

    let accepted = 0;
    let attempts = 0;
    while (accepted < count && attempts < count * 10) {
      attempts++;
      const x = (rnd() - 0.5) * cell;
      const z = (rnd() - 0.5) * cell;
      let density = 0.12;
      for (const cl of clusters) {
        const d2 = (x - cl.x) ** 2 + (z - cl.z) ** 2;
        density += cl.strength * Math.exp(-d2 / (2 * cl.r * cl.r));
      }
      if (rnd() > Math.min(1, density)) continue;

      const i = accepted;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;

      pickBlackbody(rnd, tmp);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;

      // continuous parallax depth; nearer stars are a touch bigger and brighter
      const par = 0.10 + Math.pow(rnd(), 1.4) * 0.35;
      pars[i] = par;
      const parNorm = (par - 0.10) / 0.35;
      const px = (1.1 + Math.pow(rnd(), 3) * 3.1) * (0.75 + 0.55 * parNorm);
      sizes[i] = px * this.starPxToWorld;
      bases[i] = (0.66 + rnd() * 0.34) * (0.7 + 0.3 * parNorm);

      const doTwinkle = !this.lowTier && rnd() < 0.15;
      twinklePhase[i] = rnd() * Math.PI * 2;
      twinkleSpeed[i] = doTwinkle ? (0.8 + rnd() * 1.4) : 0;
      accepted++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPar', new THREE.BufferAttribute(pars, 1));
    geo.setAttribute('aBase', new THREE.BufferAttribute(bases, 1));
    geo.setAttribute('aTwinklePhase', new THREE.BufferAttribute(twinklePhase, 1));
    geo.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(twinkleSpeed, 1));
    geo.setDrawRange(0, accepted);

    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: {
        uCamPos: { value: new THREE.Vector2(0, 0) },
        uCellSize: { value: cell },
        uWindowBias: { value: new THREE.Vector2(0, this.windowBiasZ) },
        uTime: { value: 0 },
        uTint: { value: this._starTint },
        uIntensity: { value: this.bgIntensity },
        uPerspScale: { value: this.perspScale },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'L3_stars';
    pts.frustumCulled = false;
    pts.renderOrder = -80;
    pts.position.y = STAR_DEPTH;
    this.group.add(pts);
    this.stars = { pts, mat, count: accepted, cell };
  }

  // --------------------------------------------------------------------------
  // L4 — hero flares
  // --------------------------------------------------------------------------
  _createFlares() {
    const count = this.flareCount;
    const cell = this.starCell;
    const colors = new Float32Array(count * 3);
    const sizesPx = new Float32Array(count);
    const pars = new Float32Array(count);
    const rnd = mulberry32(this.skySeed + 303);
    const tmp = new THREE.Color();
    const white = new THREE.Color(1, 1, 1);

    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLARE_VERT,
      fragmentShader: FLARE_FRAG,
      uniforms: {
        uMap: { value: this.flareAtlas },
        uCamPos: { value: new THREE.Vector2(0, 0) },
        uCellSize: { value: cell },
        uWindowBias: { value: new THREE.Vector2(0, this.windowBiasZ) },
        uPerspScale: { value: this.perspScale },
        uTint: { value: this._starTint },
        uIntensity: { value: this.bgIntensity },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set((rnd() - 0.5) * cell, 0, (rnd() - 0.5) * cell);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      pickBlackbody(rnd, tmp);
      // hero stars trend hotter/whiter — mix toward white
      tmp.lerp(white, 0.35);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      sizesPx[i] = 9 + Math.pow(rnd(), 2) * 17;    // 9..26 px
      pars[i] = 0.24 + rnd() * 0.21;               // near-depth range
    }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geo.setAttribute('aSizePx', new THREE.InstancedBufferAttribute(sizesPx, 1));
    geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(pars, 1));

    mesh.name = 'L4_flares';
    mesh.frustumCulled = false;
    mesh.renderOrder = -75;
    mesh.position.y = STAR_DEPTH + 1;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.flares = { mesh, mat, cell };
  }

  _rebuildStarsAndFlares() {
    if (this.stars) {
      this.group.remove(this.stars.pts);
      this.stars.pts.geometry.dispose();
      this.stars.mat.dispose();
    }
    if (this.flares) {
      this.group.remove(this.flares.mesh);
      this.flares.mesh.geometry.dispose();
      this.flares.mat.dispose();
    }
    this._createStars();
    this._createFlares();
  }

  // --------------------------------------------------------------------------
  // L5 — hero objects. Hashed on grids in PARALLAX-SCALED background space so
  // placement is stable and heroes keep arriving forever. Render offset for a
  // hero at bg-coord b is simply (b - camPos*par) — correct parallax by construction.
  // --------------------------------------------------------------------------
  _refreshHeroes(force = false) {
    const planetCellW = this.H * 5.0;
    const wormCellW = this.H * 7.0;
    const pgx = Math.floor((this.camX * PLANET_PAR) / planetCellW);
    const pgz = Math.floor((this.camZ * PLANET_PAR) / planetCellW);
    const wgx = Math.floor((this.camX * WORM_PAR) / wormCellW);
    const wgz = Math.floor((this.camZ * WORM_PAR) / wormCellW);
    if (!force && pgx === this._lastPlanetGX && pgz === this._lastPlanetGZ &&
        wgx === this._lastWormGX && wgz === this._lastWormGZ) return;
    this._lastPlanetGX = pgx; this._lastPlanetGZ = pgz;
    this._lastWormGX = wgx; this._lastWormGZ = wgz;

    // clear + respawn (rare: bg-space grid crossings are ~20x slower than travel)
    for (const p of this.planets) {
      this.group.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.planets = [];
    if (this.wormhole) {
      this.group.remove(this.wormhole.mesh);
      this.wormhole.mesh.geometry.dispose();
      this.wormhole.material.dispose();
      this.wormhole = null;
    }

    const list = [];
    const windowR = this.quadSize * 0.5; // generous cull radius in render units

    // planets
    for (let cx = pgx - 2; cx <= pgx + 2; cx++) {
      for (let cz = pgz - 2; cz <= pgz + 2; cz++) {
        const h = hash32(`p:${cx},${cz}:${this.skySeed}`);
        const r = mulberry32(h);
        if (r() >= 0.35) continue;
        const bx = (cx + r()) * planetCellW;
        const bz = (cz + r()) * planetCellW;
        const typeRoll = r();
        const type = typeRoll < 0.45 ? 'gas' : (typeRoll < 0.80 ? 'rocky' : 'ice');
        const giant = r() < 0.03;
        const frac = giant ? 0.34 : (0.09 + r() * 0.10);
        const seed = (r() * 99999) | 0;
        const lightAngle = r() * Math.PI * 2;
        const ring = type === 'gas' && r() < 0.45;
        const ringTilt = (r() - 0.5) * 0.9;
        list.push({ kind: 'planet', bx, bz, type, frac, seed, lightAngle, ring, ringTilt });
      }
    }
    // wormholes
    for (let cx = wgx - 2; cx <= wgx + 2; cx++) {
      for (let cz = wgz - 2; cz <= wgz + 2; cz++) {
        const h = hash32(`w:${cx},${cz}:${this.skySeed}`);
        const r = mulberry32(h);
        if (r() >= 0.18) continue;
        const bx = (cx + r()) * wormCellW;
        const bz = (cz + r()) * wormCellW;
        const frac = 0.11 + r() * 0.09;
        list.push({ kind: 'wormhole', bx, bz, frac });
      }
    }
    this.heroPlacement = list;

    // spawn what's near the window, capped: <=1 planet + 1 wormhole
    let planetsSpawned = 0;
    for (const spec of list) {
      const par = spec.kind === 'planet' ? PLANET_PAR : WORM_PAR;
      const ox = spec.bx - this.camX * par;
      const oz = spec.bz - this.camZ * par;
      if (Math.abs(ox) > windowR || Math.abs(oz) > windowR) continue;
      if (spec.kind === 'planet' && planetsSpawned < 1) {
        this._spawnPlanet(spec);
        planetsSpawned++;
      } else if (spec.kind === 'wormhole' && !this.wormhole) {
        this._spawnWormhole(spec);
      }
    }
  }

  _spawnPlanet(spec) {
    const tex = this._getPlanetTexture(spec);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'L5_planet';
    // texture: planet radius = 0.42 of the quad half-extent → quad = diameter / 0.42
    const diameter = spec.frac * this.H * this.heroSizeK;
    const quad = diameter / 0.42;
    sprite.scale.set(quad, quad, 1);
    sprite.renderOrder = -60;
    sprite.frustumCulled = false;
    sprite.position.y = HERO_DEPTH;
    sprite.userData = spec;
    this.group.add(sprite);
    this.planets.push({ sprite, mat, spec });
  }

  _getPlanetTexture(spec) {
    const key = `${spec.type}_${spec.seed}_${spec.ring ? 1 : 0}`;
    if (this.planetCache.has(key)) return this.planetCache.get(key).texture;
    const rt = this._bakePlanetTarget(spec);
    this.planetCache.set(key, rt);
    this.planetCacheOrder.push(key);
    if (this.planetCacheOrder.length > this.maxPlanetCache) {
      const old = this.planetCacheOrder.shift();
      const oldRt = this.planetCache.get(old);
      if (oldRt) oldRt.dispose();
      this.planetCache.delete(old);
    }
    return rt.texture;
  }

  _bakePlanetTarget(spec) {
    const size = this.lowTier ? 256 : 512;
    const rt = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace;

    this._renderPlanetTarget(rt, spec);
    return rt;
  }

  _renderPlanetTarget(rt, spec) {
    if (!rt || !spec) return;

    // per-type surface ramps, tinted slightly by the active palette's emission hue
    const pal = PALETTES[this.currentPaletteName];
    const emission = new THREE.Color(pal.emission);
    let colA, colB, colC, atm;
    if (spec.type === 'gas') {
      colA = new THREE.Color('#6b4226'); colB = new THREE.Color('#b3793f'); colC = new THREE.Color('#e8c088');
      atm = new THREE.Color('#ffb070');
    } else if (spec.type === 'ice') {
      colA = new THREE.Color('#7d97b0'); colB = new THREE.Color('#b8d0e4'); colC = new THREE.Color('#eef6ff');
      atm = new THREE.Color('#9fd4ff');
    } else {
      colA = new THREE.Color('#4c443c'); colB = new THREE.Color('#7a6c5e'); colC = new THREE.Color('#a89684');
      atm = new THREE.Color('#93a8b8');
    }
    colB.lerp(emission, 0.12); colC.lerp(emission, 0.08); atm.lerp(emission, 0.18);

    const type = spec.type === 'gas' ? 0 : (spec.type === 'rocky' ? 1 : 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uSeed: { value: (spec.seed % 1000) * 0.13 },
        uType: { value: type },
        uLightDir: { value: new THREE.Vector2(Math.cos(spec.lightAngle), Math.sin(spec.lightAngle)) },
        uRing: { value: spec.ring ? 1 : 0 },
        uRingTilt: { value: spec.ringTilt || 0 },
        uColA: { value: colA }, uColB: { value: colB }, uColC: { value: colC },
        uAtm: { value: atm },
      },
      transparent: true,
    });
    this._bakeLayer(mat, rt);
    mat.dispose();
  }

  _spawnWormhole(spec) {
    const size = spec.frac * this.H * this.heroSizeK * 2.2;
    const geo = new THREE.PlaneGeometry(size, size);
    const pal = PALETTES[this.currentPaletteName];
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: WORMHOLE_FRAG,
      uniforms: {
        uL1: { value: this.l1Target.texture },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(pal.emission) },
        uCore: { value: new THREE.Color(pal.core) },
        uIntensity: { value: this.bgIntensity },
        uLensing: { value: this.lowTier ? 0 : 1 },
        uChromatic: { value: this.tierName === 'high' ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'L5b_wormhole';
    mesh.rotation.x = -Math.PI / 2;    // flat, facing the top-down camera
    mesh.renderOrder = -55;
    mesh.frustumCulled = false;
    mesh.position.y = HERO_DEPTH + 1;
    this.wormhole = { mesh, material: mat, spec };
    this.group.add(mesh);
  }

  // --------------------------------------------------------------------------
  // L6 — comet streak (life; rare, subtle, deep parallax)
  // --------------------------------------------------------------------------
  _createComet() {
    if (this.comet) {
      this.group.remove(this.comet.sprite);
      this.comet.mat.dispose(); this.comet.tex.dispose();
      this.comet = null;
    }
    if (this.lowTier) return;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 32, 256, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(190,215,255,0.10)');
    g.addColorStop(0.65, 'rgba(235,242,255,0.45)');
    g.addColorStop(0.97, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 8, 256, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'L6_comet';
    sprite.renderOrder = -50;
    sprite.frustumCulled = false;
    sprite.visible = false;
    sprite.position.y = HERO_DEPTH + 4;
    const len = this.H * this.heroSizeK * 0.5;
    sprite.scale.set(len, len * 0.16, 1);
    this.group.add(sprite);
    this.comet = {
      sprite, mat, tex,
      state: 'idle', timer: 12 + this.rng() * 25, progress: 0, duration: 2,
      start: new THREE.Vector3(), end: new THREE.Vector3(),
    };
  }

  // --------------------------------------------------------------------------
  // Per-frame update — uniform writes and closed-form offsets only; zero allocation.
  // --------------------------------------------------------------------------
  update(frameDt, bgTime, camPos) {
    const dt = Number.isFinite(frameDt) ? Math.min(frameDt, 0.1) : 0;
    this.bgTime = Number.isFinite(bgTime) ? bgTime : this.bgTime;
    const cx = Number.isFinite(camPos.x) ? camPos.x : 0;
    const cz = Number.isFinite(camPos.z) ? camPos.z : 0;
    this.camX = cx; this.camZ = cz;

    // lock the rig to the camera (X/Z only; fixed depth)
    this.group.position.set(cx, this.bgY, cz);

    // tile parallax: closed-form UV offset from the absolute camera position, in doubles,
    // wrapped before upload. Slow drift on the nebula layers keeps the sky faintly alive.
    for (let i = 0; i < this.layers.length; i++) {
      const L = this.layers[i];
      let du = 0, dv = 0;
      if (i === 1) { du = this.bgTime * (0.0035 / 60); dv = this.bgTime * (0.0022 / 60); }
      else if (i === 2) { du = -this.bgTime * (0.0045 / 60); dv = this.bgTime * (-0.0028 / 60); }
      const u = (cx * L.par / L.tile + du) % 1;
      const v = (-cz * L.par / L.tile + dv) % 1;
      L.tex.offset.set(u < 0 ? u + 1 : u, v < 0 ? v + 1 : v);
    }

    // pixel scale can change with dynamic resolution — one scalar, cheap to refresh
    this.perspScale = this._computePerspScale();

    if (this.stars) {
      const un = this.stars.mat.uniforms;
      un.uCamPos.value.set(cx, cz);
      un.uTime.value = this.bgTime;
      un.uIntensity.value = this.bgIntensity;
      un.uPerspScale.value = this.perspScale;
    }
    if (this.flares) {
      const un = this.flares.mat.uniforms;
      un.uCamPos.value.set(cx, cz);
      un.uIntensity.value = this.bgIntensity * 0.9;
      un.uPerspScale.value = this.perspScale;
    }

    // hero parallax: render offset = bgCoord - camPos*par (stable by construction)
    for (const p of this.planets) {
      p.sprite.position.x = p.spec.bx - cx * PLANET_PAR;
      p.sprite.position.z = p.spec.bz - cz * PLANET_PAR;
      p.mat.opacity = Math.min(0.58, this.bgIntensity + 0.04);
    }
    if (this.wormhole) {
      this.wormhole.mesh.position.x = this.wormhole.spec.bx - cx * WORM_PAR;
      this.wormhole.mesh.position.z = this.wormhole.spec.bz - cz * WORM_PAR;
      this.wormhole.material.uniforms.uTime.value = this.bgTime;
      this.wormhole.material.uniforms.uIntensity.value = this.bgIntensity;
    }

    this._updateRegionTint(cx, cz, dt);
    this._updateComet(dt);
    this._refreshHeroes(false);
  }

  // Region palette drift: a huge-scale world-position noise slides a tint between
  // adjacent palettes so the universe changes hue over tens of screens of travel.
  _updateRegionTint(cx, cz, dt) {
    const names = PALETTE_NAMES;
    const target = this._valueNoise(cx * this.regionNoiseScale, cz * this.regionNoiseScale) * names.length;
    if (!Number.isFinite(this.regionPaletteT)) this.regionPaletteT = target;
    const k = Math.min(1, dt * 0.35);
    this.regionPaletteT += (target - this.regionPaletteT) * k;

    let t = this.regionPaletteT % names.length;
    if (t < 0) t += names.length;
    const idx = Math.floor(t) % names.length;
    const next = (idx + 1) % names.length;
    const localT = t - Math.floor(t);
    this._c0.set(PALETTES[names[idx]].emission);
    this._c1.set(PALETTES[names[next]].emission);
    this._c0.lerp(this._c1, localT);

    const locked = this.bgTime < this.regionLockUntil;
    const strength = locked ? 0.0 : 0.16;
    this._tintA.setRGB(1, 1, 1).lerp(this._c0, strength);
    this._tintB.setRGB(1, 1, 1).lerp(this._c0, strength * 0.7);
    this._starTint.setRGB(1, 1, 1).lerp(this._c0, strength * 0.35);

    for (const L of this.layers) {
      if (L.def.name === 'L1_nebula') {
        L.mesh.material.color.copy(this._tintA);
        L.mesh.material.opacity = this.bgIntensity;
      } else if (L.def.name === 'L2_wisps') {
        L.mesh.material.color.copy(this._tintB);
        L.mesh.material.opacity = this.bgIntensity;
      }
    }
  }

  _valueNoise(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    const f = x - i, g = z - j;
    const u = f * f * (3 - 2 * f);
    const v = g * g * (3 - 2 * g);
    const seed = this.seed;
    const h = (a, b) => {
      let s = ((a * 73856093) ^ (b * 19349663) ^ (seed * 83492791)) >>> 0;
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  _updateComet(dt) {
    if (!this.comet) return;
    const c = this.comet;
    if (c.state === 'idle') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'active';
        c.duration = 1.6 + this.rng() * 1.6;
        c.progress = 0;
        const angle = this.rng() * Math.PI * 2;
        const reach = this.quadSize * 0.22;
        const mx = (this.rng() - 0.5) * reach * 0.8;
        const mz = (this.rng() - 0.5) * reach * 0.8 + this.windowBiasZ;
        c.start.set(mx + Math.cos(angle) * reach * 0.5, HERO_DEPTH + 4, mz + Math.sin(angle) * reach * 0.5);
        c.end.set(mx - Math.cos(angle) * reach * 0.5, HERO_DEPTH + 4, mz - Math.sin(angle) * reach * 0.5);
        c.sprite.visible = true;
        c.sprite.position.copy(c.start);
        c.mat.rotation = -angle;
      }
    } else {
      c.progress += dt / c.duration;
      if (c.progress >= 1) {
        c.state = 'idle';
        c.timer = 25 + this.rng() * 45;
        c.sprite.visible = false;
      } else {
        c.sprite.position.lerpVectors(c.start, c.end, c.progress);
        const fade = Math.sin(c.progress * Math.PI);
        c.mat.opacity = fade * this.bgIntensity * 0.55;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public controls (debug API + settings)
  // --------------------------------------------------------------------------
  // Per-sector sky: derive the generation seed from the sector id and swap to its
  // palette class. Rebaking the three tiles + stars costs one ~60-150ms frame, spent
  // during the jump-arrival transition (which is already the heavy moment).
  onSectorEnter(sector) {
    const id = sector && sector.id;
    if (!id || id === this._sectorId) return;
    this._sectorId = id;
    this.skySeed = (this.seed ^ hash32(String(id))) >>> 0;
    const pal = this._skyPaletteForSector(sector)
      || PALETTE_NAMES[this.skySeed % PALETTE_NAMES.length];
    this.regionPaletteT = PALETTE_NAMES.indexOf(pal);
    this.regionLockUntil = this.bgTime + 8.0;   // let the new identity land before drift resumes
    this.bakeAll(pal);
    this._rebuildStarsAndFlares();
    this._refreshHeroes(true);
  }

  _skyPaletteForSector(sector) {
    // Match by nebulaTint VALUE, not object identity — sector objects get shallow-copied
    // (world init) and can round-trip through JSON (saves), so references don't survive.
    const tint = sector && sector.palette && sector.palette.nebulaTint;
    if (tint == null) return null;
    for (const name of Object.keys(SECTOR_PALETTE_CLASSES)) {
      if (SECTOR_PALETTE_CLASSES[name].nebulaTint === tint) return SECTOR_CLASS_TO_SKY[name] || null;
    }
    return null;
  }

  rebake(seed) {
    if (Number.isFinite(seed)) this.seed = (seed >>> 0);
    this.skySeed = this.seed;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.bakeAll();
    this._rebuildStarsAndFlares();
    for (const [, rt] of this.planetCache) rt.dispose();
    this.planetCache.clear();
    this.planetCacheOrder.length = 0;
    this._refreshHeroes(true);
  }

  setPalette(name) {
    if (!PALETTES[name]) return;
    this.regionPaletteT = PALETTE_NAMES.indexOf(name);
    this.regionLockUntil = this.bgTime + 6.0;
    this.bakeAll(name);
    for (const [, rt] of this.planetCache) rt.dispose();
    this.planetCache.clear();
    this.planetCacheOrder.length = 0;
    this._refreshHeroes(true);
  }

  setIntensity(x) {
    this.bgIntensity = Math.max(0.08, Math.min(0.75, Number(x) || 0.46));
  }

  stats() {
    const s = this.bakeSizes;
    const texMB = ((s.L0_void ** 2 + s.L1_nebula ** 2 + s.L2_wisps ** 2) * 4 * 1.34) / (1024 * 1024);
    return {
      tier: this.tierName,
      H_world: this.H,
      quadSize: this.quadSize,
      bakeMs: this.bakeTimer,
      drawCalls: 3 + 1 + 1 + this.planets.length + (this.wormhole ? 1 : 0) +
        (this.comet && this.comet.sprite.visible ? 1 : 0),
      stars: this.stars ? this.stars.count : 0,
      flares: this.flares ? this.flares.mesh.count : 0,
      planets: this.planets.length,
      wormhole: !!this.wormhole,
      heroCandidates: this.heroPlacement.length,
      bakedTexMB: Math.round(texMB * 10) / 10,
      palette: this.currentPaletteName,
      intensity: this.bgIntensity,
    };
  }

  onResize() {
    this.H = measureScreenHeightWorld(this.camera);
    this.bgY = -this.H * 2.2;
    this.regionNoiseScale = 1 / (this.H * 55);
    this._measureGeometry();
    this._buildLayers();
    this._rebuildStarsAndFlares();
    this._createComet();
    this._refreshHeroes(true);
  }

  dispose() {
    this._disposeBakeTargets();
    if (this.flareAtlas) this.flareAtlas.dispose();
    for (const [, rt] of this.planetCache) rt.dispose();
    this.planetCache.clear();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.scene.remove(this.group);
    if (this.bakePlane) this.bakePlane.geometry.dispose();
  }
}

export function createSpaceBackground(scene, state, opts = {}) {
  return new SpaceBackground(scene, state, opts);
}
