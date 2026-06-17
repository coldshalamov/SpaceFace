// Builds Three.js meshes for entities from primitives + procedural canvas textures only
// (no external assets, no three/addons). Contract:  createVisualFactory() -> { build(entity) }
// where build(entity) returns a THREE.Object3D whose +X axis is the ship's nose (the renderer
// sets mesh.rotation.y = -entity.rot, so +X must point forward). Build must NEVER throw — any
// failure falls back to a simple box mesh.
//
// PERF / CACHING (per the art spec + the renderer's per-entity disposer in renderer.js):
//   disposeObject() in renderer.js disposes geometry+material on entity:destroyed but NOT textures.
//   So we tier the cache:
//     - textures   : cached globally, never disposed (canvas generation is the costly part);
//     - shared geo : cached by key and given a no-op .dispose so the per-entity disposer can't
//                    free a buffer still used by other live entities (the cached set is bounded
//                    and meant to live the whole session);
//     - shared mat : same treatment (clone()'d only when an instance needs unique emissive pulse).
//   Asteroids use a small pool of seeded displacement variants per type (deterministic, bounded)
//   rather than a unique geometry per rock.
import * as THREE from 'three';
import {
  makeNoiseTexture, makeGreebleTexture, makeGradientTexture, makeHullPanelTexture, makeStarTexture,
} from './canvasTextures.js';
import { FACTION_PALETTES, SHIP_RECIPES } from '../data/palettes.js';
import { SHIPS } from '../data/ships.js';
import { COMMODITIES } from '../data/commodities.js';

// ---------------------------------------------------------------------------------------------
// Lookups + palette resolution
// ---------------------------------------------------------------------------------------------
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// Player cyan / hostile red; otherwise the faction palette (else a neutral fallback).
const PLAYER_PAL = { hull: '#9fb2c8', accent: '#39d0ff', emissive: '#39d0ff', thruster: '#7fe0ff' };
const HOSTILE_PAL = { hull: '#5a3038', accent: '#ff3b30', emissive: '#ff5470', thruster: '#ff7a3c' };
const NEUTRAL_PAL = { hull: '#6b7280', accent: '#b0b8c4', emissive: '#9fb2c8', thruster: '#aebfd6' };

function resolvePalette(e) {
  if (e.team === 0) return PLAYER_PAL;
  if (e.team === 1) return HOSTILE_PAL;
  const fp = e.factionId && FACTION_PALETTES[e.factionId];
  if (!fp) return NEUTRAL_PAL;
  return { hull: fp.hull, accent: fp.accent || fp.primary, emissive: fp.emissive || fp.primary, thruster: fp.thruster || fp.accent };
}

// Stable hash from an entity id (number or string) → small int, for seeding per-entity variety.
function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// Map a ship def's `role` to a visual silhouette family.
function silhouetteFor(defId) {
  const def = SHIP_BY_ID.get(defId);
  const role = def && def.role;
  switch (role) {
    case 'fighter': case 'interceptor': return 'fighter';
    case 'freighter': case 'heavy_hauler': return 'freighter';
    case 'mining': case 'mining_barge': return 'miner';
    case 'corvette': case 'gunship': return 'frigate';
    case 'battlecruiser': case 'flagship': return 'capital';
    case 'explorer': case 'multirole': return 'multirole';
    case 'starter': return 'scout';
    default: return 'multirole';
  }
}

// ---------------------------------------------------------------------------------------------
// Cache singleton (shared across all factory instances for max GPU resource reuse)
// ---------------------------------------------------------------------------------------------
const _tex = new Map();
const _geo = new Map();
const _mat = new Map();
const _extTex = new Map(); // external jpg assets from our visual generation pipeline (B-*, ore_*, fx_*, ship_*, ui_*)

function noDispose(obj) { obj.dispose = () => {}; return obj; }

// Simple cached external texture loader for the beautiful generated assets (Bibles, ores, FX, ships, UI, cinematics stills).
// Falls back gracefully to procedural if load fails (keeps game playable).
// Paths are relative to index.html (e.g. 'assets/ores/ore_luminite_hero.jpg').
function getExternalTexture(path) {
  if (_extTex.has(path)) return _extTex.get(path);
  const tex = new THREE.TextureLoader().load(
    path,
    () => { tex.needsUpdate = true; },
    undefined,
    (err) => { console.warn('[visual] external asset load failed, using procedural fallback:', path); }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _extTex.set(path, tex);
  return tex;
}

// Cosmetic wall-clock (seconds) for self-animation. Read inside onBeforeRender so spinning gems,
// blinking nav lights and engine flicker move without touching the render loop / vfx (which this
// track may not edit). Time-based + non-deterministic is fine: these are pure presentation.
const _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
function nowSec() {
  const n = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return (n - _t0) / 1000;
}

// Recipe lookup with safe fallback so a missing/unknown defId never throws.
function recipeFor(defId) {
  return (defId && SHIP_RECIPES[defId]) || { engineCount: 2, wingSpan: 0.8, panelCount: 12, detailLevel: 2, antennaCount: 1 };
}

function getTexture(key, build) {
  let t = _tex.get(key);
  if (!t) { t = build(); _tex.set(key, t); }
  return t;
}
function getGeometry(key, build) {
  let g = _geo.get(key);
  if (!g) { g = noDispose(build()); _geo.set(key, g); }
  return g;
}
function getMaterial(key, build) {
  let m = _mat.get(key);
  if (!m) { m = noDispose(build()); _mat.set(key, m); }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------------------------
function hullMaterial(pal, panelCount = 14) {
  // quantize panelCount into a few buckets so we don't make a unique texture per ship
  const pc = panelCount <= 8 ? 6 : panelCount <= 16 ? 12 : panelCount <= 28 ? 20 : 30;
  const key = `hull:${pal.hull}:${pal.accent}:${pc}`;
  return getMaterial(key, () => {
    const seed = hashId(pal.hull + pal.accent + pc) & 0xffff;
    const albedo = getTexture(`hullpanel:${pal.hull}:${pal.accent}:${pc}`, () =>
      makeHullPanelTexture({ size: 256, seed, hull: pal.hull, accent: pal.accent, panelCount: pc, wear: 0.5 }));
    const rough = getTexture('noise:rough', () =>
      makeNoiseTexture({ size: 256, seed: 99, octaves: 4, baseCells: 5, contrast: 1.1, brightness: 0.1 }));
    return new THREE.MeshStandardMaterial({
      map: albedo, roughnessMap: rough, color: 0xffffff,
      roughness: 0.62, metalness: 0.55,
      emissive: new THREE.Color(pal.emissive), emissiveIntensity: 0.05,
    });
  });
}

// Additive-ish emissive material for accent strips / cockpit / weapon ports.
function emissiveMaterial(color, intensity = 1.6) {
  const key = `emis:${color}:${intensity}`;
  return getMaterial(key, () => new THREE.MeshStandardMaterial({
    color: 0x070709, emissive: new THREE.Color(color), emissiveIntensity: intensity,
    roughness: 1, metalness: 0,
  }));
}

// Bright unlit material (projectiles / glow gems read through bloom).
function basicGlowMaterial(color) {
  return getMaterial(`basic:${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
}
// Additive unlit glow (energy bolts / aura sheaths) — pops through bloom without depth-writing.
function additiveGlowMaterial(color, opacity = 0.75) {
  return getMaterial(`add:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, opacity, depthWrite: false,
  }));
}

// Additive halo sprite material by color (shared texture, per-color material).
function haloSpriteMaterial(color) {
  return getMaterial(`halo:${color}`, () => {
    const tex = getTexture('star:white', () => makeStarTexture({ size: 128, color: '#ffffff', core: 0.1, falloff: 1.1 }));
    return new THREE.SpriteMaterial({
      map: tex, color: new THREE.Color(color),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
  });
}
function makeHalo(color, scale) {
  const s = new THREE.Sprite(haloSpriteMaterial(color));
  s.scale.set(scale, scale, scale);
  return s;
}

// ---------------------------------------------------------------------------------------------
// SHIPS — distinct silhouettes per role, faction-colored, built from cached primitives.
// All geometry is authored with the nose along +X.
// ---------------------------------------------------------------------------------------------
// Additive flame material for the exhaust plume (directional, NOT a giant round halo).
function plumeMaterial(color) {
  return getMaterial(`plume:${color}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.55, depthWrite: false,
  }));
}
function engineGlow(pal, x, z, scale) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // bright nozzle ring at the hull
  const nozzle = new THREE.Mesh(
    getGeometry('eng:nozzle', () => new THREE.CylinderGeometry(0.34, 0.22, 0.32, 12).rotateZ(Math.PI / 2)),
    emissiveMaterial(pal.thruster, 2.4),
  );
  nozzle.scale.setScalar(scale);
  g.add(nozzle);
  // tight exhaust plume: a short, fat cone trailing back (-X) — a flame, not a needle. apex points
  // -X (rear) via rotateZ(+90deg). A brighter inner cone gives a white-hot core.
  const plume = new THREE.Mesh(
    getGeometry('eng:plume', () => new THREE.ConeGeometry(0.34, 0.95, 16).rotateZ(Math.PI / 2)),
    plumeMaterial(pal.thruster),
  );
  plume.scale.set(scale * 0.95, scale * 0.74, scale * 0.74);
  plume.position.x = -0.72 * scale;
  g.add(plume);
  g.userData.plume = plume;
  const core = new THREE.Mesh(
    getGeometry('eng:plumecore', () => new THREE.ConeGeometry(0.18, 0.62, 14).rotateZ(Math.PI / 2)),
    plumeMaterial('#eaffff'),
  );
  core.scale.set(scale * 0.9, scale * 0.6, scale * 0.6);
  core.position.x = -0.52 * scale;
  g.add(core);
  // small soft core glow at the nozzle (modest — was scale*2.4, the blob)
  const halo = makeHalo(pal.thruster, scale * 0.5);
  halo.position.x = -0.28 * scale;
  g.add(halo);
  return g;
}

function buildShipMesh(e, pal) {
  const R = e.radius || 12;
  const defId = e.data && e.data.defId;
  const sil = silhouetteFor(defId);
  const recipe = recipeFor(defId);
  const seed = hashId(e.id);
  const hm = hullMaterial(pal, recipe.panelCount);
  const accent = emissiveMaterial(pal.accent, 1.7);
  const cockpit = emissiveMaterial(pal.accent === '#39d0ff' ? '#bff4ff' : pal.accent, 2.2);
  const wingK = Math.max(0.3, recipe.wingSpan || 0.8); // wing-span scale from recipe
  // Two-layer structure for banking (Phase 1): `outer` is what the renderer yaws (rotation.y) +
  // positions; `g` (the hull) is rolled (rotation.x) by the renderer to bank into turns. All ship
  // geometry lives in `g`, so engines/canopy/wings tilt together when the hull banks.
  const g = new THREE.Group();           // the bankable hull (rolled by renderer)
  const outer = new THREE.Group();       // yaw + position holder (returned)
  outer.add(g);
  outer.userData.hull = g;
  outer.userData.engines = [];

  const addEngine = (x, z, scl) => { const en = engineGlow(pal, x, z, scl); g.add(en); outer.userData.engines.push(en); };
  // Place exactly `engineCount` engine glows symmetrically across the rear of the hull.
  const placeEngines = (rearX, spreadZ, scl) => {
    const n = Math.max(1, Math.min(8, recipe.engineCount || 2));
    for (let i = 0; i < n; i++) {
      const z = n === 1 ? 0 : (-(n - 1) / 2 + i) * (spreadZ / Math.max(1, n - 1)) * 2;
      addEngine(rearX, z, scl);
    }
  };
  // strip helper (thin emissive box along the hull)
  const addStrip = (len, x, y, z, rotY) => {
    const m = new THREE.Mesh(getGeometry(`strip:${len.toFixed(2)}`, () => new THREE.BoxGeometry(len, 0.06, 0.16)), accent);
    m.position.set(x, y, z); if (rotY) m.rotation.y = rotY; g.add(m);
  };
  // antenna helper (thin cylinder + tip light), count from recipe.antennaCount
  const addAntennas = (baseX, baseY) => {
    const n = Math.max(0, Math.min(8, recipe.antennaCount || 0));
    const rnd = mulberryLite(seed + 555);
    for (let i = 0; i < n; i++) {
      const ant = new THREE.Mesh(getGeometry('ship:antenna', () => new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4)), hm);
      ant.position.set(baseX + (rnd() - 0.5) * R * 0.4, baseY + R * 0.18, (rnd() - 0.5) * R * 0.5);
      ant.scale.setScalar(R); g.add(ant);
      const tip = makeHalo(pal.accent, R * 0.18);
      tip.position.set(ant.position.x, baseY + R * 0.32, ant.position.z);
      g.add(tip);
    }
  };

  switch (sil) {
    case 'fighter': {
      // sleek dart: long cone nose, flat hull, swept wings, 2 engines.
      // Uses the clean procedural hull material. (The generated fighter_albedo_emissive.jpg is a
      // LABELLED contact-sheet reference, not a UV texture — applying it mapped caption text + two
      // side-by-side render panels onto the hull.)
      const bodyMat = hm;
      const body = new THREE.Mesh(getGeometry('fig:body', () => new THREE.BoxGeometry(1.6, 0.42, 0.7)), bodyMat);
      body.scale.setScalar(R * 0.6); g.add(body);
      const nose = new THREE.Mesh(getGeometry('fig:nose', () => new THREE.ConeGeometry(0.30, 1.3, 8).rotateZ(-Math.PI / 2)), bodyMat);
      nose.position.x = R * 0.72; nose.scale.setScalar(R * 0.6); g.add(nose);
      for (const sgn of [1, -1]) {
        const wing = new THREE.Mesh(getGeometry('fig:wing', () => new THREE.BoxGeometry(0.7, 0.08, 0.9)), bodyMat);
        wing.position.set(-R * 0.18, 0, sgn * R * 0.5 * wingK); wing.rotation.y = sgn * 0.5; wing.scale.set(R * 0.7, R * 0.7, R * 0.7 * wingK); g.add(wing);
        addStrip(R * 0.5, -R * 0.18, R * 0.04, sgn * R * 0.42 * wingK, 0);
      }
      placeEngines(-R * 0.62, R * 0.24, R * 0.85);
      const canopy = new THREE.Mesh(getGeometry('fig:canopy', () => new THREE.SphereGeometry(0.22, 10, 8)), cockpit);
      canopy.position.set(R * 0.12, R * 0.14, 0); canopy.scale.set(R * 0.7, R * 0.4, R * 0.55); g.add(canopy);
      break;
    }
    case 'freighter': {
      // long boxy spine + stacked cargo pods + bridge + 4 engines
      const spine = new THREE.Mesh(getGeometry('frt:spine', () => new THREE.BoxGeometry(2.0, 0.7, 0.9)), hm);
      spine.scale.setScalar(R * 0.85); g.add(spine);
      const rnd = mulberryLite(seed);
      for (let i = 0; i < 4; i++) {
        const pod = new THREE.Mesh(getGeometry(`frt:pod${i}`, () => new THREE.BoxGeometry(0.5, 0.55, 0.55)), hm);
        const px = (-0.55 + i * 0.32) * R;
        pod.position.set(px, (i % 2 ? 1 : -1) * R * 0.28, (rnd() - 0.5) * R * 0.2);
        pod.scale.setScalar(R * 0.85); g.add(pod);
      }
      const bridge = new THREE.Mesh(getGeometry('frt:bridge', () => new THREE.BoxGeometry(0.55, 0.5, 0.6)), hm);
      bridge.position.set(R * 0.82, R * 0.18, 0); bridge.scale.setScalar(R * 0.85); g.add(bridge);
      const cab = new THREE.Mesh(getGeometry('frt:cab', () => new THREE.BoxGeometry(0.2, 0.16, 0.5)), cockpit);
      cab.position.set(R * 1.02, R * 0.22, 0); cab.scale.setScalar(R * 0.85); g.add(cab);
      addStrip(R * 1.5, 0, R * 0.34, R * 0.32, 0);
      addStrip(R * 1.5, 0, R * 0.34, -R * 0.32, 0);
      placeEngines(-R * 0.92, R * 0.34, R * 0.85);
      break;
    }
    case 'miner': {
      // wide industrial body + drill prow + side mining arms
      const body = new THREE.Mesh(getGeometry('min:body', () => new THREE.BoxGeometry(1.5, 0.8, 1.0)), hm);
      body.scale.setScalar(R * 0.8); g.add(body);
      const drill = new THREE.Mesh(getGeometry('min:drill', () => new THREE.ConeGeometry(0.34, 1.0, 7).rotateZ(-Math.PI / 2)), hm);
      drill.position.x = R * 0.7; drill.scale.setScalar(R * 0.8); g.add(drill);
      const tip = new THREE.Mesh(getGeometry('min:tip', () => new THREE.OctahedronGeometry(0.16, 0)), emissiveMaterial('#ffb347', 2.0));
      tip.position.x = R * 1.05; tip.scale.setScalar(R * 0.8); g.add(tip);
      for (const sgn of [1, -1]) {
        const arm = new THREE.Mesh(getGeometry('min:arm', () => new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6).rotateZ(Math.PI / 2)), hm);
        arm.position.set(R * 0.2, 0, sgn * R * 0.55 * (0.6 + wingK)); arm.scale.setScalar(R * 0.8); g.add(arm);
      }
      placeEngines(-R * 0.7, R * 0.3, R * 0.95);
      addStrip(R * 1.0, 0, R * 0.42, 0, 0);
      break;
    }
    case 'frigate': {
      // wedge prow + segmented hull + side turrets + 3 engines
      const hull = new THREE.Mesh(getGeometry('frg:hull', () => new THREE.BoxGeometry(1.8, 0.55, 0.8)), hm);
      hull.scale.setScalar(R * 0.78); g.add(hull);
      const prow = new THREE.Mesh(getGeometry('frg:prow', () => new THREE.ConeGeometry(0.4, 1.2, 6).rotateZ(-Math.PI / 2)), hm);
      prow.position.x = R * 0.78; prow.scale.setScalar(R * 0.78); g.add(prow);
      for (const sgn of [1, -1]) {
        const turret = new THREE.Mesh(getGeometry('frg:turret', () => new THREE.CylinderGeometry(0.18, 0.22, 0.4, 8)), hm);
        turret.position.set(R * 0.1, R * 0.22, sgn * R * 0.4); turret.scale.setScalar(R * 0.78); g.add(turret);
        const port = new THREE.Mesh(getGeometry('frg:port', () => new THREE.BoxGeometry(0.12, 0.12, 0.12)), emissiveMaterial(pal.accent, 2.4));
        port.position.set(R * 0.78, 0, sgn * R * 0.22); port.scale.setScalar(R * 0.78); g.add(port);
        addStrip(R * 1.2, 0, R * 0.3, sgn * R * 0.3, 0);
      }
      placeEngines(-R * 0.84, R * 0.28, R * 0.9);
      break;
    }
    case 'capital': {
      // massive multi-box spine + tower superstructure + sensor ring + 6 engines
      const spine = new THREE.Mesh(getGeometry('cap:spine', () => new THREE.BoxGeometry(2.2, 0.6, 1.0)), hm);
      spine.scale.setScalar(R * 0.9); g.add(spine);
      const fore = new THREE.Mesh(getGeometry('cap:fore', () => new THREE.BoxGeometry(0.8, 0.45, 0.7)), hm);
      fore.position.x = R * 0.95; fore.scale.setScalar(R * 0.9); g.add(fore);
      const prow = new THREE.Mesh(getGeometry('cap:prow', () => new THREE.ConeGeometry(0.34, 0.9, 6).rotateZ(-Math.PI / 2)), hm);
      prow.position.x = R * 1.3; prow.scale.setScalar(R * 0.9); g.add(prow);
      // tower greeble cluster
      const rnd = mulberryLite(seed);
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(getGeometry(`cap:tower${i}`, () => new THREE.BoxGeometry(0.35, 0.6, 0.4)), hm);
        t.position.set((-0.3 + i * 0.12) * R, R * (0.4 + rnd() * 0.2), (rnd() - 0.5) * R * 0.3);
        t.scale.setScalar(R * 0.9); g.add(t);
      }
      const ring = new THREE.Mesh(getGeometry('cap:ring', () => new THREE.TorusGeometry(0.5, 0.05, 6, 20)), accent);
      ring.position.set(-R * 0.1, R * 0.7, 0); ring.scale.setScalar(R * 0.9); g.add(ring);
      // window strips down the flank
      addStrip(R * 1.7, 0, R * 0.3, R * 0.42, 0);
      addStrip(R * 1.7, 0, R * 0.3, -R * 0.42, 0);
      addStrip(R * 1.7, 0, -R * 0.3, R * 0.42, 0);
      placeEngines(-R * 1.02, R * 0.5, R * 1.0);
      break;
    }
    case 'scout': {
      // tiny agile shuttle: cone nose + small box + 2 thin engines
      const body = new THREE.Mesh(getGeometry('sct:body', () => new THREE.BoxGeometry(1.2, 0.5, 0.55)), hm);
      body.scale.setScalar(R * 0.7); g.add(body);
      const nose = new THREE.Mesh(getGeometry('sct:nose', () => new THREE.ConeGeometry(0.28, 1.0, 7).rotateZ(-Math.PI / 2)), hm);
      nose.position.x = R * 0.62; nose.scale.setScalar(R * 0.7); g.add(nose);
      const canopy = new THREE.Mesh(getGeometry('sct:canopy', () => new THREE.SphereGeometry(0.2, 10, 8)), cockpit);
      canopy.position.set(R * 0.1, R * 0.16, 0); canopy.scale.set(R * 0.7, R * 0.4, R * 0.5); g.add(canopy);
      for (const sgn of [1, -1]) { addStrip(R * 0.7, -R * 0.1, R * 0.04, sgn * R * 0.22, 0); }
      placeEngines(-R * 0.5, R * 0.2, R * 0.7);
      break;
    }
    default: { // multirole — balanced cone+body+two engines+wings
      const body = new THREE.Mesh(getGeometry('mul:body', () => new THREE.CylinderGeometry(0.34, 0.5, 1.5, 7).rotateZ(Math.PI / 2)), hm);
      body.scale.setScalar(R * 0.7); g.add(body);
      const nose = new THREE.Mesh(getGeometry('mul:nose', () => new THREE.ConeGeometry(0.34, 1.0, 7).rotateZ(-Math.PI / 2)), hm);
      nose.position.x = R * 0.78; nose.scale.setScalar(R * 0.7); g.add(nose);
      for (const sgn of [1, -1]) {
        const wing = new THREE.Mesh(getGeometry('mul:wing', () => new THREE.BoxGeometry(0.6, 0.1, 0.7)), hm);
        wing.position.set(-R * 0.1, 0, sgn * R * 0.45 * wingK); wing.rotation.y = sgn * 0.35; wing.scale.set(R * 0.7, R * 0.7, R * 0.7 * wingK); g.add(wing);
        addStrip(R * 0.9, -R * 0.05, R * 0.16, sgn * R * 0.2 * wingK, 0);
      }
      placeEngines(-R * 0.7, R * 0.22, R * 0.85);
      const canopy = new THREE.Mesh(getGeometry('mul:canopy', () => new THREE.SphereGeometry(0.22, 10, 8)), cockpit);
      canopy.position.set(R * 0.2, R * 0.18, 0); canopy.scale.set(R * 0.7, R * 0.45, R * 0.6); g.add(canopy);
      break;
    }
  }
  // recipe-driven antennas (sensor masts with tip lights) near the rear superstructure
  addAntennas(-R * 0.2, R * 0.2);
  // self-animate engine halos (subtle throb). The driver MUST live on a renderable child — Three
  // only fires onBeforeRender on objects in the render list (isMesh/isSprite), never on a bare Group.
  const engines = outer.userData.engines;
  if (engines && engines.length) {
    const ph = (seed % 100) / 100 * Math.PI * 2;
    // capture each plume's base (non-uniform) scale so the throb stretches its LENGTH only.
    for (const en of engines) { const p = en.userData.plume; if (p) en.userData.plumeBase = { x: p.scale.x, y: p.scale.y, z: p.scale.z }; }
    const driver = firstMesh(g);
    if (driver) {
      driver.frustumCulled = false; // keep ticking while the hull body itself is on-screen
      driver.onBeforeRender = () => {
        const t = nowSec();
        for (let i = 0; i < engines.length; i++) {
          const p = engines[i].userData.plume, b = engines[i].userData.plumeBase;
          if (p && b) { const s = 1 + 0.18 * Math.sin(t * 9 + ph + i); p.scale.set(b.x * s, b.y, b.z); }
        }
      };
    }
  }
  outer.userData.kind = 'ship';
  return outer;
}

// first renderable Mesh descendant (the body/spine/hull is always added first) — used as the
// host for onBeforeRender drivers, since Three never fires that callback on a plain Group.
function firstMesh(obj) {
  let found = null;
  obj.traverse((c) => { if (!found && c.isMesh) found = c; });
  return found;
}

// lightweight deterministic rng for layout jitter (separate from sim rng; cosmetic only)
function mulberryLite(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// ASTEROIDS — noise-displaced icospheres, per-type tint/roughness + crystal/metal variants.
// ---------------------------------------------------------------------------------------------
const AST_TYPE = {
  ast_common_rock: { color: 0x55504a, rough: 0.98, metal: 0.04, emissive: 0x000000, ei: 0, detail: 1, displace: 0.34, flat: true, variant: 'rock' },
  ast_metallic: { color: 0x6b6258, rough: 0.55, metal: 0.55, emissive: 0x301808, ei: 0.12, detail: 1, displace: 0.30, flat: true, variant: 'metal' },
  ast_icy: { color: 0x9fd8e8, rough: 0.25, metal: 0.10, emissive: 0x174050, ei: 0.30, detail: 1, displace: 0.28, flat: false, variant: 'ice' },
  ast_crystalline: { color: 0x6a4aa0, rough: 0.30, metal: 0.20, emissive: 0x7030c0, ei: 0.55, detail: 1, displace: 0.45, flat: true, variant: 'crystal' },
  ast_gas_cloud: { color: 0x3a5a4a, rough: 1.0, metal: 0, emissive: 0x18402c, ei: 0.4, detail: 1, displace: 0.4, flat: true, variant: 'gas' },
  ast_rare_exotic: { color: 0x2c2638, rough: 0.7, metal: 0.4, emissive: 0x6030a0, ei: 0.35, detail: 2, displace: 0.32, flat: true, variant: 'exotic' },
};

function astDisplacedGeometry(typeId, def, variantIdx) {
  const key = `ast:${typeId}:${variantIdx}`;
  return getGeometry(key, () => {
    const geo = new THREE.IcosahedronGeometry(1, def.detail + 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const rnd = mulberryLite(hashId(typeId) + variantIdx * 911);
    // per-geometry random lattice offsets so each variant displaces differently but deterministically
    const ox = rnd() * 100, oy = rnd() * 100, oz = rnd() * 100;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // cheap 3-octave value-ish noise from trig of the (offset) normal direction
      const n = v.clone().normalize();
      let d = 0, amp = 1, f = 1.7;
      for (let o = 0; o < 3; o++) {
        d += amp * Math.sin(n.x * f * 3.1 + ox) * Math.cos(n.y * f * 2.7 + oy) * Math.sin(n.z * f * 3.3 + oz);
        amp *= 0.5; f *= 2.0;
      }
      const scale = 1 + def.displace * d;
      v.multiplyScalar(Math.max(0.5, scale));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

function astMaterial(typeId, def, tint) {
  const key = `astmat:${typeId}:${tint || 'def'}`;
  return getMaterial(key, () => {
    const color = tint != null ? new THREE.Color(tint) : new THREE.Color(def.color);
    const rough = getTexture('noise:astrough', () =>
      makeNoiseTexture({ size: 256, seed: 41, octaves: 4, baseCells: 6, contrast: 1.4, brightness: -0.05 }));

    // Procedural surfaces only. (The generated ore_*_hero.jpg assets are LABELLED contact-sheet
    // references — multiple views + caption text — and were being emissive-mapped onto crystals, so
    // valuable rocks literally glowed reference text. Valuable ores still pop via emissive colour +
    // the crystal shards/halo added in buildAsteroid.)
    let eiBoost = def.ei;
    const t = (typeId || '').toLowerCase();
    if (t.includes('luminite') || t.includes('crystal') || def.variant === 'crystal') eiBoost = Math.max(eiBoost, 0.9);
    else if (t.includes('xenium') || t.includes('exotic') || def.variant === 'exotic') eiBoost = Math.max(eiBoost, 0.75);

    return new THREE.MeshStandardMaterial({
      color,
      roughness: def.rough, metalness: def.metal,
      roughnessMap: def.variant === 'crystal' ? null : rough,
      emissive: new THREE.Color(def.emissive), emissiveIntensity: eiBoost,
      flatShading: def.flat,
    });
  });
}

function buildAsteroid(e) {
  const R = e.radius || 12;
  const typeId = (e.data && e.data.typeId) || 'ast_common_rock';
  const def = AST_TYPE[typeId] || AST_TYPE.ast_common_rock;
  const tint = e.data && e.data.tint; // optional sector tint override
  const variantIdx = hashId(e.id) % 5; // 5 displacement variants per type
  const geo = astDisplacedGeometry(typeId, def, variantIdx);
  const mesh = new THREE.Mesh(geo, astMaterial(typeId, def, tint));
  mesh.scale.setScalar(R);

  const g = new THREE.Group();
  g.add(mesh);

  // crystal / exotic / ice get an inner-glow halo for value cue
  if (def.variant === 'crystal' || def.variant === 'exotic') {
    const halo = makeHalo(def.variant === 'crystal' ? '#b060ff' : '#9060ff', R * 1.9);
    g.add(halo);
    // a few protruding crystal shards for crystalline rocks
    if (def.variant === 'crystal') {
      const rnd = mulberryLite(hashId(e.id));
      const shardMat = emissiveMaterial('#b878ff', 0.9);
      for (let i = 0; i < 4; i++) {
        const shard = new THREE.Mesh(getGeometry('ast:shard', () => new THREE.OctahedronGeometry(0.18, 0)), shardMat);
        const a = rnd() * Math.PI * 2, e2 = (rnd() - 0.5) * 1.4;
        shard.position.set(Math.cos(a) * R * 0.7, Math.sin(e2) * R * 0.5, Math.sin(a) * R * 0.7);
        shard.scale.setScalar(R * (0.5 + rnd() * 0.6));
        shard.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        g.add(shard);
      }
    }
  } else if (def.variant === 'ice') {
    g.add(makeHalo('#5fc8e8', R * 1.6));
  } else if (def.variant === 'gas') {
    // gas: small core rock already added; wrap in a soft additive cloud sprite
    const cloud = makeHalo('#56e0a0', R * 3.2);
    cloud.material = cloud.material.clone();
    cloud.material.opacity = 0.45;
    g.add(cloud);
  }
  g.userData.kind = 'asteroid';
  return g;
}

// ---------------------------------------------------------------------------------------------
// STATIONS — greebled core cluster + rings + docking spars + blinking nav lights.
// Gates render as a big glowing portal ring.
// ---------------------------------------------------------------------------------------------
function stationMaterial(pal) {
  const key = `stat:${pal.hull}`;
  return getMaterial(key, () => {
    const seed = hashId(pal.hull) & 0xffff;
    const greeble = getTexture(`greeble:${pal.hull}`, () =>
      makeGreebleTexture({ size: 256, seed, base: pal.hull, plate: shade(pal.hull, 1.25), line: shade(pal.hull, 0.4), accent: pal.accent }));
    return new THREE.MeshStandardMaterial({ map: greeble, roughness: 0.7, metalness: 0.5, color: 0xffffff });
  });
}
function shade(hex, mul) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  return '#' + c.getHexString();
}

function blinkerSprite(color, scale, phase, blinkers) {
  const s = makeHalo(color, scale);
  s.material = s.material.clone();
  s.userData.blink = { phase: phase || 0, hz: 0.6 + ((phase || 0) % 0.6), base: scale };
  if (blinkers) blinkers.push(s);
  return s;
}

// Attach a self-animating onBeforeRender that spins rings and pulses nav blinkers. The driver MUST
// be hosted on a renderable child mesh — Three fires onBeforeRender only on render-list objects
// (isMesh/isSprite), never on a plain Group. `host` is that always-present mesh.
function animateStation(host, blinkers, ring1, portal) {
  if (!host || (!blinkers.length && !ring1 && !portal)) return;
  host.frustumCulled = false; // keep rings/blinkers ticking while the core is on-screen
  host.onBeforeRender = () => {
    const t = nowSec();
    if (ring1) ring1.rotation.z = t * 0.05;
    if (portal) portal.rotation.y = t * 0.4;
    for (let i = 0; i < blinkers.length; i++) {
      const b = blinkers[i], bl = b.userData.blink;
      const on = (((t * bl.hz + bl.phase) % 1) + 1) % 1 > 0.5 ? 1 : 0.25; // step(0.5, fract(...))
      b.material.opacity = 0.3 + 0.7 * on;
    }
  };
}

function buildStation(e) {
  const R = e.radius || 40;
  const pal = resolvePalette(e);
  const isGate = e.data && (e.data.isGate || e.data.isWormhole);
  const m = stationMaterial(pal);
  const g = new THREE.Group();
  const blinkers = [];

  if (isGate) {
    // Jump gate: large ring + swirling additive portal
    const ring = new THREE.Mesh(
      getGeometry('gate:ring', () => new THREE.TorusGeometry(0.9, 0.12, 10, 36)),
      stationMaterial(pal),
    );
    ring.rotation.x = Math.PI / 2; ring.scale.setScalar(R); g.add(ring);
    const portalMat = getMaterial('gate:portal', () => {
      const tex = getTexture('grad:portal', () => makeGradientTexture({
        type: 'radial', stops: [[0, '#bff4ff'], [0.4, '#39d0ff'], [1, '#0a1830']],
      }));
      return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    });
    const portal = new THREE.Mesh(getGeometry('gate:disc', () => new THREE.CircleGeometry(0.82, 32)), portalMat);
    portal.rotation.x = -Math.PI / 2; portal.scale.setScalar(R); g.add(portal);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = blinkerSprite(pal.accent, R * 0.22, i * 0.27, blinkers);
      b.position.set(Math.cos(a) * R * 0.9, 0, Math.sin(a) * R * 0.9);
      g.add(b);
    }
    animateStation(ring, blinkers, null, portal);
    g.userData.kind = 'station';
    return g;
  }

  // greeble core cluster
  const rnd = mulberryLite(hashId(e.id));
  const core = new THREE.Mesh(getGeometry('stat:core', () => new THREE.CylinderGeometry(0.42, 0.46, 0.6, 10)), m);
  core.scale.setScalar(R); g.add(core);
  for (let i = 0; i < 8; i++) {
    const box = new THREE.Mesh(getGeometry(`stat:gb${i}`, () => new THREE.BoxGeometry(0.18, 0.18, 0.18)), m);
    const a = (i / 8) * Math.PI * 2;
    box.position.set(Math.cos(a) * R * (0.35 + rnd() * 0.2), (rnd() - 0.5) * R * 0.5, Math.sin(a) * R * (0.35 + rnd() * 0.2));
    box.scale.setScalar(R * (0.7 + rnd() * 0.8)); box.rotation.y = rnd() * 3; g.add(box);
  }
  // rings on two axes
  const ringMat = m;
  const r1 = new THREE.Mesh(getGeometry('stat:ring1', () => new THREE.TorusGeometry(0.8, 0.06, 8, 28)), ringMat);
  r1.rotation.x = Math.PI / 2; r1.scale.setScalar(R); g.add(r1); g.userData.ring1 = r1;
  const r2 = new THREE.Mesh(getGeometry('stat:ring2', () => new THREE.TorusGeometry(0.62, 0.05, 8, 24)), ringMat);
  r2.rotation.set(Math.PI / 2, 0, 0.6); r2.scale.setScalar(R); g.add(r2);
  // docking spars
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(getGeometry('stat:spar', () => new THREE.BoxGeometry(0.16, 0.12, 0.7)), m);
    const a = i * Math.PI / 2;
    arm.position.set(Math.cos(a) * R * 0.55, 0, Math.sin(a) * R * 0.55);
    arm.rotation.y = -a; arm.scale.setScalar(R); g.add(arm);
  }
  // window strips
  const winMat = emissiveMaterial('#ffd98a', 1.2);
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(getGeometry('stat:win', () => new THREE.BoxGeometry(0.5, 0.04, 0.04)), winMat);
    w.position.set(0, R * (-0.2 + i * 0.18), R * 0.44); w.scale.setScalar(R); g.add(w);
  }
  // blinking nav lights (green/blue, or red for pirate-ish accent)
  const navColor = pal.accent;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = blinkerSprite(i % 2 ? navColor : '#5fffa0', R * 0.18, i * 0.31, blinkers);
    b.position.set(Math.cos(a) * R * 0.82, (i % 2 ? 1 : -1) * R * 0.22, Math.sin(a) * R * 0.82);
    g.add(b);
  }
  animateStation(core, blinkers, r1, null);
  g.userData.kind = 'station';
  return g;
}

// ---------------------------------------------------------------------------------------------
// PICKUPS — spinning glowing gem colored by commodity, with additive halo.
// ---------------------------------------------------------------------------------------------
function commodityColor(e) {
  const d = e.data || {};
  if (d.kind === 'credits') return '#ffcc44';
  if (d.kind === 'module' || d.kind === 'cargo') return '#9b6cff';
  const cm = d.commodityId && CMDTY_BY_ID.get(d.commodityId);
  if (cm) {
    switch (cm.category) {
      case 'raw ore': return '#c89a6a';
      case 'gas': return '#7fe0c0';
      case 'crystal': return '#b878ff';
      case 'exotic': return '#ff70d0';
      case 'refined': return '#bcd0e0';
      case 'salvage': return '#9aa0a8';
      default: return '#9fd8a0';
    }
  }
  return '#7af7d0';
}

function buildPickup(e) {
  const R = e.radius || 2.2;
  const color = commodityColor(e);
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    getGeometry('pickup:gem', () => new THREE.OctahedronGeometry(1, 0)),
    getMaterial(`gemmat:${color}`, () => new THREE.MeshStandardMaterial({
      color: 0x101014, emissive: new THREE.Color(color), emissiveIntensity: 1.5, metalness: 0.9, roughness: 0.15,
    })),
  );
  gem.scale.setScalar(R);
  g.add(gem);
  const halo = makeHalo(color, R * 2.6);
  g.add(halo);
  g.userData.kind = 'pickup'; g.userData.gem = gem;
  // spin + bob + halo pulse. Driver lives on the gem mesh (a Group never gets onBeforeRender).
  const ph = (hashId(e.id) % 100) / 100 * Math.PI * 2;
  const haloBase = halo.scale.x;
  gem.frustumCulled = false;
  gem.onBeforeRender = () => {
    const t = nowSec();
    gem.rotation.y = t * 2.2 + ph;
    gem.rotation.x = t * 1.1;
    gem.position.y = 0.6 * Math.sin(t * 2 + ph);
    halo.scale.setScalar(haloBase * (1 + 0.18 * Math.sin(t * 3 + ph)));
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// PROJECTILES — bright additive tracer (cylinder along +X) + halo. Missiles get a body+cone.
// ---------------------------------------------------------------------------------------------
function buildProjectile(e) {
  const R = e.radius || 0.7;
  const isMissile = e.data && e.data.kind === 'missile';
  const color = e.team === 1 ? '#ff6a6a' : (e.team === 0 ? '#9af0ff' : '#ffd24a');
  const g = new THREE.Group();
  if (isMissile) {
    const body = new THREE.Mesh(getGeometry('proj:mbody', () => new THREE.CylinderGeometry(0.4, 0.4, 2.0, 6).rotateZ(Math.PI / 2)),
      getMaterial('proj:mmat', () => new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.4 })));
    body.scale.setScalar(R); g.add(body);
    const tip = new THREE.Mesh(getGeometry('proj:mtip', () => new THREE.ConeGeometry(0.4, 0.8, 6).rotateZ(-Math.PI / 2)), basicGlowMaterial(color));
    tip.position.x = R * 1.4; tip.scale.setScalar(R); g.add(tip);
    const flame = makeHalo(color, R * 2.0); flame.position.x = -R * 1.2; g.add(flame);
  } else {
    // energy bolt: a white-hot core + an additive coloured glow sheath + a soft halo, elongated so it
    // reads as a streak punching through bloom rather than a dot.
    const core = new THREE.Mesh(
      getGeometry('proj:core', () => new THREE.CapsuleGeometry(0.28, 4.6, 4, 8).rotateZ(Math.PI / 2)),
      basicGlowMaterial('#ffffff'),
    );
    core.scale.setScalar(R); g.add(core);
    const glow = new THREE.Mesh(
      getGeometry('proj:glow', () => new THREE.CapsuleGeometry(0.62, 5.4, 4, 8).rotateZ(Math.PI / 2)),
      additiveGlowMaterial(color, 0.8),
    );
    glow.scale.setScalar(R); g.add(glow);
    const halo = makeHalo(color, R * 4.2); halo.position.x = R * 1.2; g.add(halo);   // bright leading tip
    g.add(makeHalo(color, R * 2.6));
  }
  g.userData.kind = 'projectile';
  return g;
}

// ---------------------------------------------------------------------------------------------
// DRONE / WRECK / fallback
// ---------------------------------------------------------------------------------------------
function buildDrone(e) {
  const R = e.radius || 4;
  const pal = resolvePalette(e);
  const g = new THREE.Group();
  const core = new THREE.Mesh(getGeometry('drone:core', () => new THREE.OctahedronGeometry(0.6, 0)), hullMaterial(pal));
  core.scale.setScalar(R); g.add(core);
  const glow = new THREE.Mesh(getGeometry('drone:glow', () => new THREE.SphereGeometry(0.22, 8, 6)), emissiveMaterial(pal.accent, 2.2));
  glow.scale.setScalar(R); g.add(glow);
  for (const sgn of [1, -1]) {
    const arm = new THREE.Mesh(getGeometry('drone:arm', () => new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6).rotateZ(Math.PI / 2)), hullMaterial(pal));
    arm.position.set(0, 0, sgn * R * 0.5); arm.scale.setScalar(R); g.add(arm);
  }
  g.add(makeHalo(pal.accent, R * 1.6));
  g.userData.kind = 'drone';
  return g;
}

function buildWreck(e) {
  const R = e.radius || 6;
  const g = new THREE.Group();
  const charred = getMaterial('wreck:mat', () => new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 0.95, metalness: 0.25, emissive: 0x180a04, emissiveIntensity: 0.2 }));
  const rnd = mulberryLite(hashId(e.id));
  for (let i = 0; i < 5; i++) {
    const chunk = new THREE.Mesh(getGeometry(`wreck:c${i}`, () => new THREE.BoxGeometry(0.5 + i * 0.05, 0.4, 0.6)), charred);
    chunk.position.set((rnd() - 0.5) * R, (rnd() - 0.5) * R * 0.5, (rnd() - 0.5) * R);
    chunk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    chunk.scale.setScalar(R * (0.4 + rnd() * 0.5)); g.add(chunk);
  }
  // a faint ember spark
  g.add(makeHalo('#ff7a3c', R * 1.2));
  g.userData.kind = 'wreck';
  return g;
}

function buildFallback(e) {
  const R = (e && e.radius) || 3;
  const mat = getMaterial('fallback:mat', () => new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7, metalness: 0.3, emissive: 0x223040, emissiveIntensity: 0.3 }));
  const m = new THREE.Mesh(getGeometry('fallback:geo', () => new THREE.BoxGeometry(1, 0.5, 1)), mat);
  m.scale.setScalar(R);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------------------------
export function createVisualFactory() {
  return {
    build(e) {
      try {
        if (!e) return buildFallback(e);
        switch (e.type) {
          case 'ship': return buildShipMesh(e, resolvePalette(e));
          case 'asteroid': return buildAsteroid(e);
          case 'station': return buildStation(e);
          case 'pickup': return buildPickup(e);
          case 'projectile': return buildProjectile(e);
          case 'drone': return buildDrone(e);
          case 'wreck': return buildWreck(e);
          case 'fx': return null; // fx entities are handled by the vfx particle system, not meshed
          default: return buildFallback(e);
        }
      } catch (err) {
        try { return buildFallback(e); } catch (_e) { return null; }
      }
    },
  };
}
