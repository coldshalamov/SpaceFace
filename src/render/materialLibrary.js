// Material Library — named roles for the art direction (graphics spec §A / Workstream A).
//
// Per `threejs-aaa-graphics-builder/references/implementation-blueprint.md` §"Material Library":
// create named material roles instead of one-off colors. Roles give the whole game a shared
// material language so ships, stations, enemies, pickups, and UI echoes all read cohesively.
//
// Design rules (from the blueprint + render-recipes):
//   - MeshStandardMaterial for most surfaces; MeshPhysicalMaterial only where the premium
//     feature is visible (cockpit glass, shield bubbles, clearcoat hero panels).
//   - Roughness/metalness contrast — not just hue contrast — separates materials.
//   - Emissive is for AUTHORED signals (engines, status lights, beacons), never whole objects.
//   - Materials are cached + noDispose'd so the per-entity disposer can't free shared buffers.
//
// This module is the single authority on material *roles*. It does NOT replace visualFactory's
// per-factory builders — it gives them a vocabulary to call into. Factories resolve a role for
// a given palette and get back a cached THREE material.

import * as THREE from 'three';

// ---- tiny seeded hash (same scheme visualFactory uses) --------------------------------------
function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// Color helpers — kept local so this module has no cross-deps (factories inject palettes).
function shade(hex, mul) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  return '#' + c.getHexString();
}

// ---------------------------------------------------------------------------------------------
// Cache: one entry per (role + palette key). noDispose so renderer's per-entity disposer
// (disposeObject in renderer.js) can't free a shared material still used by live entities.
// ---------------------------------------------------------------------------------------------
const _mat = new Map();
function noDispose(m) { m.dispose = () => {}; return m; }

// Texture builders are injected by visualFactory at init (it owns the procedural canvas layer
// and its texture cache). This keeps materialLibrary free of the canvas-texture dependency
// while still letting roles pull in greeble/panel/normal/noise textures when available.
let _texBuilder = null;

// Call once from visualFactory.createVisualFactory() to wire the texture builders.
// `builder` shape: { hullPanel(opts)=>CanvasTexture, greeble(opts)=>CanvasTexture,
//   noise(opts)=>CanvasTexture, hullNormal(opts)=>CanvasTexture, decal(opts)=>CanvasTexture }
export function configureMaterialLibrary(builder) {
  _texBuilder = builder || null;
}

function tex(key, make) {
  // Texture caching is owned by visualFactory's _tex map — we only build if a builder is wired.
  // If not wired (e.g. unit test importing this module in isolation), fall back to no texture
  // (plain color material) so the library never throws.
  if (!_texBuilder) return null;
  return _texBuilder.cache(key, make);
}

// ---------------------------------------------------------------------------------------------
// ROLES — the named material vocabulary (blueprint §"Material Library")
// ---------------------------------------------------------------------------------------------

// bodyPrimary — dominant hull/shell of ships + stations. PBR panel metal.
function bodyPrimary(pal) {
  const key = `role:bodyPrimary:${pal.hull}:${pal.accent}`;
  return _matGet(key, () => {
    const seed = hashId(pal.hull + pal.accent) & 0xffff;
    const albedo = tex(`hullpanel:${pal.hull}:${pal.accent}:14`,
      () => _texBuilder.hullPanel({ size: 256, seed, hull: pal.hull, accent: pal.accent, panelCount: 14, wear: 0.5 }));
    const rough = tex('noise:rough', () => _texBuilder.noise({ size: 256, seed: 99, octaves: 4, baseCells: 5, contrast: 1.1, brightness: 0.1 }));
    const normal = tex(`hullnrm:14`, () => _texBuilder.hullNormal({ size: 256, seed: seed + 1, panelCount: 14, bevel: 0.55 }));
    const m = new THREE.MeshStandardMaterial({
      map: albedo || undefined, roughnessMap: rough || undefined, normalMap: normal || undefined,
      color: 0xffffff, roughness: 0.6, metalness: 0.6,
      normalScale: new THREE.Vector2(0.7, 0.7),
      emissive: new THREE.Color(pal.emissive || pal.accent), emissiveIntensity: 0.04,
    });
    return m;
  });
}

// bodySecondary — contrast panels, inner hull, secondary structures. Darker + rougher.
function bodySecondary(pal) {
  const key = `role:bodySecondary:${pal.hull}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(pal.hull, 0.55)),
    roughness: 0.85, metalness: 0.4,
    emissive: 0x000000,
  }));
}

// trim — rails, bevels, edge bands, borders. Brighter metal, lower roughness (catches rim light).
function trim(pal) {
  const key = `role:trim:${pal.hull}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(pal.hull, 1.4)),
    roughness: 0.35, metalness: 0.85,
  }));
}

// hazard — danger surfaces, damage cues, warning stripes. Red-tinted emissive.
function hazard(pal) {
  const key = `role:hazard`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: 0x2a0a0a, emissive: new THREE.Color('#ff3b30'), emissiveIntensity: 0.6,
    roughness: 0.7, metalness: 0.3,
  }));
}

// reward — collectible surfaces with readable value (ore gems, loot). Warm metallic + emissive.
function reward(pal) {
  const key = `role:reward:${pal.accent}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(pal.accent, 0.8)),
    emissive: new THREE.Color(pal.accent), emissiveIntensity: 0.8,
    roughness: 0.2, metalness: 0.9,
  }));
}

// glass — cockpit canopy, shield bubble, lens. MeshPhysicalMaterial: transmission + clearcoat.
function glass(pal) {
  const key = `role:glass:${pal.accent}`;
  return _matGet(key, () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shade(pal.accent, 1.2)),
    roughness: 0.05, metalness: 0.0,
    transmission: 0.6, thickness: 0.5, ior: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.05,
    transparent: true, opacity: 0.7,
    emissive: new THREE.Color(pal.accent), emissiveIntensity: 0.3,
  }));
}

// emissiveSignal — authored glow strips, status lights, engine cores, beacon cores.
// intensity tuned so bloom picks it up without washing the surface.
function emissiveSignal(pal, intensity = 1.6) {
  const key = `role:emis:${pal.emissive || pal.accent}:${intensity}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: 0x070709, emissive: new THREE.Color(pal.emissive || pal.accent),
    emissiveIntensity: intensity, roughness: 1, metalness: 0,
  }));
}

// groundContact — dark matte under important objects (faux shadow receivers / decals).
function groundContact() {
  const key = `role:groundContact`;
  return _matGet(key, () => new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false,
  }));
}

// decalDark / decalLight — panel lines, scratches, numbers, icons. Transparent overlay.
function decalDark(pal) {
  const key = `role:decalDark:${pal.hull}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(pal.hull, 0.25)), transparent: true, depthWrite: false,
    roughness: 0.9, metalness: 0.2, opacity: 0.8,
  }));
}
function decalLight(pal) {
  const key = `role:decalLight:${pal.accent}`;
  return _matGet(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade(pal.accent, 1.1)), transparent: true, depthWrite: false,
    roughness: 0.6, metalness: 0.4, opacity: 0.7,
    emissive: new THREE.Color(pal.accent), emissiveIntensity: 0.3,
  }));
}

// ---------------------------------------------------------------------------------------------
// Internal cache getter (with noDispose)
// ---------------------------------------------------------------------------------------------
function _matGet(key, build) {
  let m = _mat.get(key);
  if (!m) { m = noDispose(build()); _mat.set(key, m); }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Public API: resolve a role for a palette → cached THREE material.
// Factories call: materialLibrary.resolve('bodyPrimary', pal)
// ---------------------------------------------------------------------------------------------
const BUILDERS = {
  bodyPrimary, bodySecondary, trim, hazard, reward, glass,
  emissiveSignal, groundContact, decalDark, decalLight,
};

export function resolve(role, pal = {}, extra) {
  const b = BUILDERS[role];
  if (!b) {
    // Unknown role → fall back to bodyPrimary so a typo never breaks a build.
    if (typeof console !== 'undefined') console.warn('[materialLibrary] unknown role:', role, '→ bodyPrimary');
    return bodyPrimary(pal);
  }
  return b(pal, extra);
}

// Diagnostics: how many unique materials the library has created (for the scorecard perf row).
export function diagnostics() {
  return { uniqueMaterials: _mat.size, roles: Object.keys(BUILDERS) };
}

// Test-only: clear the cache (keeps unit tests hermetic).
export function _resetForTest() { _mat.clear(); }
