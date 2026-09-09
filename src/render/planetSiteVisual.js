// PQ-013 / SF-14 — the colossal planet-site visual (spike-ruled construction).
//
// Spike rulings this module implements (REPORT.md Phase 1, .devshots/pq013-planet/spike/):
//   #1 the fixed-heading chase camera looks DOWN-forward → the body carries its bulk BELOW the
//      gameplay plane (site.centerY < 0), crest near the plane; the ship skims over the limb.
//   #4 the near-range surface is BAKED once to a canvas texture (the procedural per-fragment
//      shader at 60-70% frame coverage is budget-fragile under load; a texture fetch is not).
//      The bake reuses the SAME value-noise/fbm family + the SAME palette as the impostor shader
//      (src/render/planetFactory.js PLANET_COLORS) so near and far planets stay one species —
//      and the smooth canvas filtering removes the square noise-cell artifact (spike finding #5).
//   #3 bands read as shallow CONICAL SKIRTS (inner edge high, sloping down-outward, the band
//      surface crossing y=0 at its sim radius); flat rings and vertical curtains are edge-on
//      invisible at the default camera.
//   #2 band materials sit at/below radiance ~1 (bands are structure, not white sheets; bible:
//      the boundary never blooms).
//
// Family DNA: ribbon strand (createMasslineRibbonMaterial) for streaking bands, energy strand
// (createEnergyMaterial) for the smooth reentry brightening, the ATMSHELL idiom for the limb halo.
// Determinism: bake + storm-arc layout use the integer-hash pattern idiom (no Math.random).
// The vfx planetSkim subsystem ticks userData.planetVisual.timeMats each frame (cosmetic scroll).

import * as THREE from 'three';
import { PLANET_COLORS } from './planetFactory.js';
import { createMasslineRibbonMaterial, createEnergyMaterial } from './energy/energyMaterials.js';

// ── deterministic 2D value noise (the shader's hash/vnoise/fbm family, ported for the bake) ──────
function mix32(h) {
  h |= 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}
function cellHash(ix, iz, seed) { return mix32(ix * 374761393 + iz * 668265263 + seed * 962287); }
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = cellHash(ix, iz, seed), b = cellHash(ix + 1, iz, seed);
  const c = cellHash(ix, iz + 1, seed), d = cellHash(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}
function fbm(x, z, seed) {
  let v = 0, a = 0.5, px = x, pz = z;
  for (let i = 0; i < 5; i++) {
    v += a * vnoise(px, pz, seed + i * 101);
    px = px * 2.03 + 1.7; pz = pz * 2.03 + 3.1;
    a *= 0.5;
  }
  return v;
}

/** Bake the planet surface (continents + clouds, lighting-free albedo) once. ~0.3 MP; the
 *  registration adapter runs at sector entry where a transition already covers a one-off cost. */
function bakePlanetTexture(planetType, seed) {
  const pal = PLANET_COLORS[planetType] || PLANET_COLORS.rocky;
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const data = img.data;
  const c1 = pal.c1, c2 = pal.c2, cc = pal.cloud;
  const cloudAmt = planetType === 'dead' || planetType === 'scorched' ? 0.05 : planetType === 'lava' ? 0.1 : 0.45;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // Same construction as PLANET_FRAG: domain-warped fbm continents + a cloud octave.
      const wx = fbm(u * 3, v * 3, seed);
      const wz = fbm(u * 3 + 5.2, v * 3 + 1.3, seed);
      const land = fbm(u * 4 + wx * 0.8, v * 4 + wz * 0.8, seed + 7);
      const t = Math.min(1, Math.max(0, (land - 0.38) / 0.24));
      const s = t * t * (3 - 2 * t);
      let r = c2[0] + (c1[0] - c2[0]) * s;
      let gg = c2[1] + (c1[1] - c2[1]) * s;
      let b = c2[2] + (c1[2] - c2[2]) * s;
      let cloud = fbm(u * 5.5 + 2.1, v * 5.5 + 4.7, seed + 13);
      cloud = Math.min(1, Math.max(0, (cloud - 0.52) / 0.18)) * cloudAmt;
      r += (cc[0] - r) * cloud; gg += (cc[1] - gg) * cloud; b += (cc[2] - b) * cloud;
      const i = (y * W + x) * 4;
      data[i] = Math.round(r * 255); data[i + 1] = Math.round(gg * 255);
      data[i + 2] = Math.round(b * 255); data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Lit baked-surface shader: one texture fetch + the shipped terminator/rim language (planetFactory
// PLANET_FRAG's daylight + fresnel lines, minus the per-fragment fbm the bake replaced).
const SURFACE_VERT = /* glsl */`
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SURFACE_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uAtmColor;
uniform vec3 uSunDir;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 surface = texture2D(uMap, vUv).rgb;
  float daylight = dot(N, normalize(uSunDir));
  float lit = smoothstep(-0.12, 0.18, daylight);
  surface *= (0.12 + 0.88 * lit);
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);
  float rimLit = smoothstep(-0.3, 0.6, daylight) * 0.7 + 0.3;
  gl_FragColor = vec4(surface + uAtmColor * fresnel * 0.9 * rimLit, 1.0);
}
`;
// ATMSHELL idiom (planetFactory GR-4): additive backface shell = the glowing limb ring.
const SHELL_FRAG = /* glsl */`
precision highp float;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
uniform vec3 uAtmColor;
uniform vec3 uSunDir;
uniform float uIntensity;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
  float lit = smoothstep(-0.15, 0.35, dot(N, normalize(uSunDir)));
  vec3 col = uAtmColor * fresnel * lit * uIntensity;
  gl_FragColor = vec4(col, fresnel * lit * uIntensity);
}
`;

/** Conical band skirt (spike finding #3): ring strip crossing y=0 at rMid, sloping down-outward. */
function makeBandGeo(rMid, width, segs, arcs, slope = 0.55) {
  const spans = arcs || [{ a0: 0, a1: 1 }];
  const positions = [], along = [], side = [], index = [];
  const w2 = width / 2;
  const rIn = rMid - w2, rOut = rMid + w2;
  const yIn = w2 * slope, yOut = -w2 * slope;
  let v = 0;
  for (const s of spans) {
    const segN = Math.max(4, Math.round(segs * (s.a1 - s.a0)));
    for (let i = 0; i <= segN; i++) {
      const t = s.a0 + (s.a1 - s.a0) * (i / segN);
      const th = t * Math.PI * 2;
      const cx = Math.cos(th), sz = Math.sin(th);
      positions.push(cx * rIn, yIn, sz * rIn, cx * rOut, yOut, sz * rOut);
      along.push(t * 6, t * 6); // integer wrap multiple → the pulse seam is invisible
      side.push(-1, 1);
      if (i < segN) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(along), 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
  geo.setIndex(index);
  return geo;
}

/** Deterministic storm-arc layout (lobed, broken — the berm idiom at planetary scale). */
function stormArcLayout(seed) {
  const arcs = [];
  for (let i = 0; i < 12; i++) {
    const j0 = mix32(seed + 9013 + i * 7);
    const width = 0.045 + 0.03 * mix32(seed + 577 + i * 13);
    const base = i / 12 + j0 * 0.02;
    arcs.push({ a0: base, a1: Math.min(base + width, i / 12 + 1 / 12) });
  }
  return arcs;
}

/**
 * Build the full planet-site visual for a 'planet' entity (e.data.planetSite from the Q18
 * registration transaction). Returns a group whose origin sits on the gameplay plane at the
 * entity position; the body is offset to site.centerY inside it.
 */
export function buildPlanetSiteVisual(e) {
  const site = e && e.data && e.data.planetSite;
  if (!site) return null;
  const R = site.radius;
  const group = new THREE.Group();
  group.name = `planet-site:${site.siteId}`;

  const SUN_DIR = new THREE.Vector3(60, 140, 40).normalize(); // renderer key light (planetFactory)
  const pal = PLANET_COLORS[site.planetType] || PLANET_COLORS.rocky;
  const atm = new THREE.Vector3(...pal.atm);

  // Body: baked albedo + terminator/rim lighting; detail-5 sphere (spike finding #5 silhouette).
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    uniforms: {
      uMap: { value: bakePlanetTexture(site.planetType, site.seed | 0) },
      uAtmColor: { value: atm },
      uSunDir: { value: SUN_DIR },
    },
    fog: false,
  });
  const body = new THREE.Mesh(geo, surfaceMat);
  body.scale.setScalar(R);
  body.position.y = site.centerY;
  body.frustumCulled = false;
  group.add(body);

  // Limb shell (ATMSHELL idiom — additive, backface-only, ~6% larger).
  const shellMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: { uAtmColor: { value: atm }, uSunDir: { value: SUN_DIR }, uIntensity: { value: 1.0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const shell = new THREE.Mesh(geo, shellMat);
  shell.scale.setScalar(R * 1.06);
  shell.position.y = site.centerY;
  shell.frustumCulled = false;
  group.add(shell);

  // Bands (sim radii from the authored site — the boundary is drawn where the sim says it is).
  const seed = site.seed | 0;
  const arcs = stormArcLayout(seed);
  const stormMid = (site.bands.reentry + site.bands.danger) / 2;
  const workMid = (site.bands.danger + site.bands.skim) / 2;
  const timeMats = [];
  const bandDefs = [
    { geo: makeBandGeo(R * 1.082, 42, 220, null), mat: createEnergyMaterial({ name: 'planet-reentry-band', colorA: 0xffb35c, colorB: 0xff5c5c, intensity: 1.4, opacity: 0.3, noiseScale: 0.7, flowSpeed: 0.35, core: 0.1, edgeNoise: 0.15, fresnelPower: 1.2 }) },
    { geo: makeBandGeo(stormMid, 30, 220, arcs), mat: createMasslineRibbonMaterial({ name: 'planet-storm-band', color: 0xffb35c, intensity: 1.15, opacity: 0.3, pulseSpeed: 1.6 }) },
    { geo: makeBandGeo(stormMid, 16, 220, arcs.filter((_, i) => i % 3 === 0)), mat: createMasslineRibbonMaterial({ name: 'planet-storm-hot', color: 0xff7040, intensity: 1.35, opacity: 0.28, pulseSpeed: 2.2 }) },
    { geo: makeBandGeo(workMid, 44, 260, null), mat: createMasslineRibbonMaterial({ name: 'planet-working-band', color: 0xb8dff2, intensity: 1.0, opacity: 0.32, pulseSpeed: 3.4 }) },
    { geo: makeBandGeo((site.bands.skim + 30), 16, 220, null), mat: createMasslineRibbonMaterial({ name: 'planet-outer-band', color: 0x9fd8e8, intensity: 0.7, opacity: 0.18, pulseSpeed: 2.2 }) },
  ];
  for (const def of bandDefs) {
    const mesh = new THREE.Mesh(def.geo, def.mat);
    mesh.renderOrder = 12;
    mesh.frustumCulled = false;
    group.add(mesh);
    if (def.mat.uniforms && def.mat.uniforms.uTime) timeMats.push(def.mat);
  }
  const working = bandDefs[3].mat;
  if (working.uniforms.uTension) working.uniforms.uTension.value = 0.85;
  const storm = bandDefs[1].mat;
  if (storm.uniforms.uTension) storm.uniforms.uTension.value = 0.6;

  group.userData.planetVisual = { siteId: site.siteId, timeMats, bodyMat: surfaceMat, shellMat };
  group.userData.noWobble = true; // a world does not idle-bob
  return group;
}
