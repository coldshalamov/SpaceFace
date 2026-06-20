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
  makeHullNormalMap, makeGreebleDetailTexture, makeDecalSheet,
  makeGrimeTexture, makePatchTexture, makeNoseArtTexture,
} from './canvasTextures.js';
import { FACTION_PALETTES, SHIP_RECIPES, paintProfileFor, PLAYER_NOSE_ART } from '../data/palettes.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { configureMaterialLibrary } from './materialLibrary.js';

// ---------------------------------------------------------------------------------------------
// Lookups + palette resolution
// ---------------------------------------------------------------------------------------------
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WPN_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MOD_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_PERSONALITY = new Map(FACTION_META.map((f) => [f.id, f.personality]));

// Player cyan / hostile red; otherwise the faction palette (else a neutral fallback).
const PLAYER_PAL = { hull: '#9fb2c8', accent: '#39d0ff', emissive: '#39d0ff', thruster: '#7fe0ff' };
const HOSTILE_PAL = { hull: '#5a3038', accent: '#ff3b30', emissive: '#ff5470', thruster: '#ff7a3c' };
const NEUTRAL_PAL = { hull: '#6b7280', accent: '#b0b8c4', emissive: '#9fb2c8', thruster: '#aebfd6' };

// The renderer injects the baked PMREM nebula env-map here (setEnvMapForShips) so chrome/authority
// hulls can mirror the actual space around them. Null until the bake completes — chrome then falls
// back to high-metalness matte, which is still a clean-shiny read, just not mirror.
let SHIP_ENV_MAP = null;
export function setEnvMapForShips(env) { SHIP_ENV_MAP = env; }

// Resolve the colors + the paint profile (grime/chrome/nose-art) for an entity. The profile comes
// from the faction's `personality`, so the dirty-outlaw vs clean-authority look is data-driven and
// self-applies to every NPC. The PLAYER (team 0 / faction_free) gets the haunted ex-gangster profile.
function resolvePalette(e) {
  const personality = (e.factionId && FACTION_PERSONALITY.get(e.factionId)) || 'independent';
  const profile = paintProfileFor(personality);
  let colors;
  if (e.team === 0) colors = PLAYER_PAL;
  else if (e.team === 1) colors = HOSTILE_PAL;
  else {
    const fp = e.factionId && FACTION_PALETTES[e.factionId];
    colors = fp
      ? { hull: fp.hull, accent: fp.accent || fp.primary, emissive: fp.emissive || fp.primary, thruster: fp.thruster || fp.accent }
      : NEUTRAL_PAL;
  }
  return Object.assign({}, colors, { profile, isPlayer: e.team === 0 });
}

// Stable hash from an entity id (number or string) → small int, for seeding per-entity variety.
function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// Map a ship def to its visual silhouette family. Prefers the per-hull `visuals.family` (the
// overhaul's source of truth) and falls back to the role→family mapping for any def lacking one.
function familyFor(defId) {
  const def = SHIP_BY_ID.get(defId);
  if (def && def.visuals && def.visuals.family) return def.visuals.family;
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

// Resolve the visual tier row for a loadout. Tier = sum of fitted module/weapon tiers; pick the
// highest tier row whose minTier the loadout meets (default Mk.I at row 0). NPCs (which bypass the
// fittings path) set data.visualTier to force a tier by danger level instead. Returns {name,hints}.
function tierForLoadout(defId, fittings, visualTierOverride) {
  const def = SHIP_BY_ID.get(defId);
  const rows = def && def.visuals && def.visuals.tiers;
  if (!rows || !rows.length) return { name: 'Mk.I', hints: {} };
  // explicit override (NPC danger scaling) wins over loadout sum
  if (typeof visualTierOverride === 'number' && visualTierOverride > 0) {
    let chosen = rows[0];
    for (const r of rows) if (visualTierOverride >= (r.minTier || 0)) chosen = r;
    return chosen;
  }
  let sum = 0;
  if (fittings && fittings.length) {
    for (const fid of fittings) {
      if (!fid) continue;
      const d = WPN_BY_ID.get(fid) || MOD_BY_ID.get(fid);
      if (d && typeof d.tier === 'number') sum += d.tier;
    }
  }
  let chosen = rows[0];
  for (const r of rows) if (sum >= (r.minTier || 0)) chosen = r;
  return chosen;
}

// Summarize the fitted loadout into the props the builder needs to place. Reads e.data (fittings +
// weapons + miningBeam) which the ships system keeps in sync (incl. NPC weapon backfill).
function loadoutProps(e) {
  const data = e.data || {};
  const fittings = data.fittings || [];
  const def = SHIP_BY_ID.get(data.defId);
  const slots = def && def.slots;
  // engines: count + class from fitted engine modules (topSpeed proxy for nozzle size)
  let engineClass = 0, engineCount = 0;
  // shields present?
  let hasShield = false, shieldClass = 0;
  // mining fitted?
  let hasMining = false, miningTier = 0;
  // utility count (antennas/sensors)
  let utilityCount = 0;
  if (slots) {
    for (const t of ['engine', 'shield', 'mining', 'utility']) {
      const arr = slots[t] || [];
      for (let i = 0; i < arr.length; i++) {
        const fid = fittings[i + slotOffset(slots, t)];
        if (!fid) continue;
        const d = MOD_BY_ID.get(fid) || WPN_BY_ID.get(fid);
        if (!d) continue;
        if (t === 'engine') { engineCount++; engineClass = Math.max(engineClass, (d.mods && d.mods.topSpeed) || 60); }
        else if (t === 'shield') { hasShield = true; shieldClass = Math.max(shieldClass, d.tier || 1); }
        else if (t === 'mining') { hasMining = true; miningTier = Math.max(miningTier, d.tier || 1); }
        else if (t === 'utility') { utilityCount++; }
      }
    }
  }
  // mining beam can also be implied by data.miningBeam (player default mk1) even without a module
  if (!hasMining && data.miningBeam) { hasMining = true; miningTier = Math.max(miningTier, 1); }
  return { engineClass, engineCount, hasShield, shieldClass, hasMining, miningTier, utilityCount };
}
// offset of a slot-type group within buildSlotList order (weapon,shield,engine,cargo,mining,utility)
function slotOffset(slots, type) {
  const order = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
  let off = 0;
  for (const t of order) { if (t === type) return off; off += (slots[t] || []).length; }
  return off;
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

// Wire the material library (graphics spec Workstream A) so its named roles
// (bodyPrimary / trim / glass / hazard / reward / emissiveSignal / ...) can pull the same
// procedural canvas textures this factory caches. Injected once at module load; the library
// degrades gracefully to plain-color materials if a builder is missing.
configureMaterialLibrary({
  cache: (key, make) => getTexture(key, make),
  hullPanel: (opts) => makeHullPanelTexture(opts),
  greeble: (opts) => makeGreebleTexture(opts),
  noise: (opts) => makeNoiseTexture(opts),
  hullNormal: (opts) => makeHullNormalMap(opts),
  decal: (opts) => makeDecalSheet(opts),
});
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

// Merge safe opaque child meshes under the same parent/material. This keeps the authored primitive
// look intact while turning many repeated hull plates, vents, spars, and caps into a few draw calls.
const BATCH_MIN_MESHES = 2;
const _batchInv = new THREE.Matrix4();
const _batchLocal = new THREE.Matrix4();
const _batchNormal = new THREE.Matrix3();
const _batchPos = new THREE.Vector3();
const _batchNrm = new THREE.Vector3();

function optimizeStaticBatches(root) {
  if (!root) return root;
  root.updateMatrixWorld(true);

  const groups = new Map();
  root.traverse((obj) => {
    if (!isBatchCandidate(obj)) return;
    const parent = obj.parent;
    if (!parent) return;
    const key = batchKey(obj, parent);
    let rec = groups.get(key);
    if (!rec) {
      rec = {
        parent,
        material: obj.material,
        renderOrder: obj.renderOrder || 0,
        meshes: [],
        vertexCount: 0,
      };
      groups.set(key, rec);
    }
    rec.meshes.push(obj);
    const pos = obj.geometry.getAttribute('position');
    rec.vertexCount += obj.geometry.index ? obj.geometry.index.count : (pos ? pos.count : 0);
  });

  for (const rec of groups.values()) {
    if (rec.meshes.length < BATCH_MIN_MESHES || rec.vertexCount <= 0) continue;
    let mergedMesh;
    try {
      const geometry = mergeMeshGeometries(rec);
      if (!geometry) continue;
      mergedMesh = new THREE.Mesh(geometry, rec.material);
      mergedMesh.name = 'sf-static-merge';
      mergedMesh.renderOrder = rec.renderOrder;
      mergedMesh.userData.staticMerge = true;
      rec.parent.add(mergedMesh);
      for (const mesh of rec.meshes) rec.parent.remove(mesh);
    } catch (_) {
      if (mergedMesh && mergedMesh.parent) mergedMesh.parent.remove(mergedMesh);
      if (mergedMesh && mergedMesh.geometry) mergedMesh.geometry.dispose();
    }
  }

  return root;
}

function isBatchCandidate(obj) {
  if (!obj || !obj.isMesh || obj.isBatchedMesh || obj.isInstancedMesh) return false;
  if (obj.onBeforeRender && obj.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (obj.children && obj.children.length) return false;
  const g = obj.geometry, m = obj.material;
  if (!g || !g.getAttribute || !g.getAttribute('position')) return false;
  if (!m || Array.isArray(m) || m.transparent || m.alphaTest > 0) return false;
  if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) return false;
  return true;
}

function mergeMeshGeometries(rec) {
  const first = rec.meshes[0].geometry;
  const attrNames = Object.keys(first.attributes).sort();
  const attrDefs = attrNames.map((name) => {
    const attr = first.getAttribute(name);
    return { name, itemSize: attr.itemSize, normalized: attr.normalized, Ctor: attr.array.constructor };
  });
  const arrays = new Map();
  for (const def of attrDefs) arrays.set(def.name, new def.Ctor(rec.vertexCount * def.itemSize));

  let write = 0;
  _batchInv.copy(rec.parent.matrixWorld).invert();
  for (const mesh of rec.meshes) {
    const g = mesh.geometry;
    const index = g.index;
    const count = index ? index.count : g.getAttribute('position').count;
    _batchLocal.multiplyMatrices(_batchInv, mesh.matrixWorld);
    _batchNormal.getNormalMatrix(_batchLocal);

    for (let i = 0; i < count; i++) {
      const srcIndex = index ? index.getX(i) : i;
      for (const def of attrDefs) {
        const src = g.getAttribute(def.name);
        const dst = arrays.get(def.name);
        const offset = write * def.itemSize;
        if (def.name === 'position') {
          _batchPos.fromBufferAttribute(src, srcIndex).applyMatrix4(_batchLocal);
          dst[offset] = _batchPos.x; dst[offset + 1] = _batchPos.y; dst[offset + 2] = _batchPos.z;
        } else if (def.name === 'normal') {
          _batchNrm.fromBufferAttribute(src, srcIndex).applyNormalMatrix(_batchNormal);
          dst[offset] = _batchNrm.x; dst[offset + 1] = _batchNrm.y; dst[offset + 2] = _batchNrm.z;
        } else {
          for (let c = 0; c < def.itemSize; c++) dst[offset + c] = src.getComponent(srcIndex, c);
        }
      }
      write++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  for (const def of attrDefs) {
    geometry.setAttribute(def.name, new THREE.BufferAttribute(arrays.get(def.name), def.itemSize, def.normalized));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function batchKey(obj, parent) {
  const g = obj.geometry;
  const attrs = Object.keys(g.attributes).sort().map((name) => {
    const a = g.attributes[name];
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
  }).join('|');
  const idx = g.index ? `idx:${g.index.array.constructor.name}` : 'noidx';
  return `${parent.uuid}|${obj.material.uuid}|${obj.renderOrder || 0}|${idx}|${attrs}`;
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
    // tangent-space normal map of the panel bevels so hull surfaces catch the key/rim/fill lights.
    const normal = getTexture(`hullnrm:${pc}`, () =>
      makeHullNormalMap({ size: 256, seed: seed + 1, panelCount: pc, bevel: 0.55 }));
    // Painted pressure shell: primarily dielectric (low metalness) per spec §4.5/§11.1 — a coated
    // hull should read as paint, not bare metal, so the metalness contrast with exposed hardware
    // (gunmetal/graphite at 0.78–0.88) carries the material hierarchy instead of a uniform sparkle.
    // Roughness is raised slightly so age reads; roughnessMap still provides the local history.
    return new THREE.MeshStandardMaterial({
      map: albedo, roughnessMap: rough, normalMap: normal, color: 0xffffff,
      roughness: 0.66, metalness: 0.16,
      normalScale: new THREE.Vector2(0.7, 0.7),
      emissive: new THREE.Color(pal.emissive), emissiveIntensity: 0.04,
    });
  });
}

// Transparent overlay material for the greeble-detail + decal sheets (faction stripes, warning
// triangles, vent micro-detail). Used on a slightly-larger shell mesh above the hull.
function decalMaterial(pal, kind) {
  const key = `decal:${pal.hull}:${pal.accent}:${kind}`;
  return getMaterial(key, () => {
    const seed = hashId(pal.hull + pal.accent + kind) & 0xffff;
    const tex = kind === 'greeble'
      ? getTexture(`greebleDetail:${pal.hull}:${pal.accent}`, () =>
          makeGreebleDetailTexture({ size: 256, seed, density: 1.0, accent: pal.accent }))
      : getTexture(`decal:${pal.hull}:${pal.accent}`, () =>
          makeDecalSheet({ size: 256, seed: seed + 3, accent: pal.accent, stripe: true, chevron: kind !== 'scout', warning: true }));
    return new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false,
      color: 0xffffff, roughness: 0.7, metalness: 0.2,
      emissive: new THREE.Color(pal.emissive), emissiveIntensity: 0.04,
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

// Cockpit glass: dark tinted, semi-transparent, with a soft interior glow (the lit flight deck) and
// a glossy low-roughness surface so it reads as a reflective canopy rather than an opaque emissive
// blob. The emissive is kept modest so it doesn't blow out to white through bloom.
function cockpitGlassMaterial(pal) {
  const tint = pal.accent || '#39d0ff';
  const key = `glass:${tint}`;
  return getMaterial(key, () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0a1018'),
    emissive: new THREE.Color(tint), emissiveIntensity: 0.6,
    roughness: 0.12, metalness: 0.0,
    transparent: true, opacity: 0.78,
    transmission: 0.0, // keep it cheap (no real refraction); tint + opacity gives the glass read
    clearcoat: 1.0, clearcoatRoughness: 0.15,
    side: THREE.DoubleSide,
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

// =============================================================================================
// SHIP MESH BUILDER (overhaul) — layered composition per hull.
//
// Every ship is now built from a family-specific multi-section hull (nose / midsection / engine
// block as separate beveled forms) plus a kit of shared props placed at author-defined mounts:
//   • weapons — a barrel/battery per fitted weapon, sized by weapon size+tier, oriented by facing
//   • engines — nozzles+plumes at engineMounts[], sized by the fitted engine class
//   • mining drill / beam emitter when a mining module is fitted
//   • cargo pod stacks, shield emitter ring, sensor/utility masts, nav blinkers
// Tier (Mk.I/II/III, from the sum of fitted module tiers) scales armor plating, greeble, fin arrays
// and secondary structures so an upgraded ship visibly reads as upgraded. Geometry is cached by key
// (family+section+tier) so the bounded _geo/_mat/_tex caches stay bounded; the per-entity Object3D
// graph is what the renderer disposes on rebuild. Build never throws (try/catch → fallback box).
//
// Nose is +X. `g` is the bankable hull group (rolled by the renderer); `outer` holds position/yaw.
// =============================================================================================

// Facing → yaw rotation (around Y) so a barrel points along its hardpoint facing. +X is nose.
const FACING_YAW = { front: 0, right: -Math.PI / 2, rear: Math.PI, left: Math.PI / 2, turret: 0 };

// ---- shared geometry primitives, cached ------------------------------------------------------
// Beveled hull slab: a box with its vertical edges chamfered by scaling — reads as a real plate
// rather than a flat box because the normal map + the slight inset catches light. We keep a handful
// of aspect buckets so the cache stays small.
function hullSlabGeo(lx, ly, lz) {
  const key = `slab:${q(lx)}:${q(ly)}:${q(lz)}`;
  return getGeometry(key, () => new THREE.BoxGeometry(lx, ly, lz, 1, 1, 1));
}
function q(v) { return Math.round(v * 100) / 100; }

// Tapered nose cone along +X (apex forward). radius at base, length forward.
function noseConeGeo(rBase, len, seg = 8) {
  const key = `nose:${q(rBase)}:${q(len)}:${seg}`;
  return getGeometry(key, () => new THREE.ConeGeometry(rBase, len, seg).rotateZ(-Math.PI / 2));
}

// Cockpit canopy: half-ellipsoid (squashed sphere) — recessed glass.
function canopyGeo() { return getGeometry('ship:canopy', () => new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)); }

// Build a recessed cockpit: glass dome + dark interior deck + faint accent frame, added to ctx.g.
// `pos`/`scale` are in world units (already ×R). The interior deck sits just under the glass so the
// canopy reads as a real recessed cockpit with depth, not a flat glass blob.
function recessedCanopy(ctx, px, py, pz, sx, sy, sz) {
  const { g, pal, cockpit } = ctx;
  const glass = new THREE.Mesh(canopyGeo(), cockpit);
  glass.scale.set(sx, sy, sz); glass.position.set(px, py, pz); g.add(glass);
  // dark interior deck (a squat box just below the glass) — gives the canopy depth
  const deck = new THREE.Mesh(getGeometry('ship:canopydeck', () => new THREE.BoxGeometry(0.6, 0.1, 0.5)),
    emissiveMaterial(pal.accent, 0.8));
  deck.scale.set(sx, sy, sz); deck.position.set(px, py - sy * 0.12, pz); g.add(deck);
  // frame ring around the canopy base (accent emissive, reads as a canopy seal)
  const frame = new THREE.Mesh(getGeometry('ship:canopyframe', () => new THREE.TorusGeometry(0.5, 0.04, 6, 14)),
    emissiveMaterial(pal.accent, 1.4));
  frame.rotation.x = Math.PI / 2; frame.scale.set(sx, sz, sz); frame.position.set(px, py - sy * 0.02, pz); g.add(frame);
}

// ---- weapon props ----------------------------------------------------------------------------
// Build a weapon mount (base housing + barrel) for a fitted weapon def, sized by size+tier, and
// oriented so the barrel points along `facing`. Returns a Group added at the hardpoint position.
function weaponProp(wdefId, facing, size, pal, R, tier) {
  const g = new THREE.Group();
  const w = WPN_BY_ID.get(wdefId);
  const tracking = (w && w.tracking) || 'fixed';
  // scale by slot size and tier (bigger/tiered guns read as heavier)
  const sizeK = size === 'L' ? 1.5 : size === 'M' ? 1.1 : 0.8;
  const tierK = 1 + Math.min(2, (tier || 1) - 1) * 0.12;
  const s = R * 0.16 * sizeK * tierK;
  const housingMat = hullMaterial(pal, 10);
  const accentMat = emissiveMaterial(pal.accent, 1.8);
  const isTurret = facing === 'turret' || tracking === 'auto_turret';
  const isHoming = tracking === 'homing';
  const isBeam = tracking === 'hitscan' || (w && w.id && w.id.includes('beam'));

  // turret base ring (so it reads as a rotating mount)
  if (isTurret) {
    const base = new THREE.Mesh(getGeometry('wpn:turretbase', () => new THREE.CylinderGeometry(0.5, 0.55, 0.22, 10)), housingMat);
    base.scale.setScalar(s); g.add(base);
  }
  // housing block the barrel sits on
  const housing = new THREE.Mesh(hullSlabGeo(0.7, 0.4, 0.5), housingMat);
  housing.scale.setScalar(s); g.add(housing);

  // barrel shape by weapon type — each reads as a distinct weapon system
  let barrel;
  if (isHoming) {
    // missile/torpedo rack: cluster of launch tubes + a loader rail
    const rack = new THREE.Group();
    const tubeMat = hullMaterial(pal, 6);
    const tubes = size === 'L' ? 4 : 3;
    for (let i = 0; i < tubes; i++) {
      const tube = new THREE.Mesh(getGeometry('wpn:tube', () => new THREE.CylinderGeometry(0.11, 0.11, 1.1, 6).rotateZ(Math.PI / 2)), tubeMat);
      tube.position.set(0.2, 0, (i - (tubes - 1) / 2) * 0.2); tube.scale.setScalar(s); rack.add(tube);
      // tube mouth ring
      const mouth = new THREE.Mesh(getGeometry('wpn:tubemouth', () => new THREE.TorusGeometry(0.11, 0.015, 5, 8).rotateY(Math.PI / 2)), darkWpnMat());
      mouth.position.set(0.74 * s, 0, (i - (tubes - 1) / 2) * 0.2 * s); rack.add(mouth);
    }
    barrel = rack;
  } else if (isBeam) {
    // beam/lance: a focusing-array housing with a primary lens + secondary emitter crystals + heat fins
    const lensHousing = new THREE.Mesh(getGeometry('wpn:lens', () => new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8).rotateZ(Math.PI / 2)), housingMat);
    lensHousing.scale.setScalar(s); barrel = lensHousing;
    const emitter = new THREE.Mesh(getGeometry('wpn:emitter', () => new THREE.SphereGeometry(0.18, 12, 10)), accentMat);
    emitter.position.x = 0.5 * s; barrel.add(emitter);
    // secondary focusing crystals flanking the lens
    for (const sgn of [1, -1]) {
      const crystal = new THREE.Mesh(getGeometry('wpn:crystal', () => new THREE.OctahedronGeometry(0.07, 0)), accentMat);
      crystal.position.set(0.3 * s, 0.12 * s, sgn * 0.16 * s); barrel.add(crystal);
    }
    // heat-dissipation fins along the housing
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(getGeometry('wpn:bfin', () => new THREE.BoxGeometry(0.04, 0.14, 0.04)), housingMat);
      fin.position.set((-0.1 - i * 0.12) * s, 0.18 * s, 0); fin.scale.setScalar(s); barrel.add(fin);
    }
  } else {
    // kinetic/energy gun: a long barrel + recoil housing + COOLING FINS (the signature of a real gun)
    const len = (w && w.range ? Math.min(1.4, 0.7 + w.range / 2000) : 1.0);
    // recoil/recuperator housing block behind the breech
    const breech = new THREE.Mesh(getGeometry('wpn:breech', () => new THREE.BoxGeometry(0.22, 0.28, 0.28)), housingMat);
    breech.position.x = -0.1 * s; breech.scale.setScalar(s); barrel = new THREE.Group(); barrel.add(breech);
    const cyl = new THREE.Mesh(getGeometry('wpn:barrel', () => new THREE.CylinderGeometry(0.1, 0.1, 1.0, 10).rotateZ(Math.PI / 2)), housingMat);
    cyl.position.x = 0.05 * s; cyl.scale.set(s * len, s, s); barrel.add(cyl);
    // muzzle brake (thicker ring at the end)
    const muzzle = new THREE.Mesh(getGeometry('wpn:muzzle', () => new THREE.TorusGeometry(0.14, 0.05, 8, 12).rotateY(Math.PI / 2)), housingMat);
    muzzle.position.x = (0.05 + 0.5 * len) * s; muzzle.scale.setScalar(s); barrel.add(muzzle);
    // cooling fins wrapping the barrel (read as a heavy machine gun / railgun) — sized to be clearly visible
    const finCount = size === 'L' ? 5 : size === 'M' ? 4 : 3;
    for (let i = 0; i < finCount; i++) {
      for (const sgn of [1, -1]) {
        const fin = new THREE.Mesh(getGeometry('wpn:fin', () => new THREE.BoxGeometry(0.05, 0.03, 0.26)), housingMat);
        fin.position.set((0.0 + i * 0.14) * s, sgn * 0.17 * s, 0); fin.scale.set(s, s, s); barrel.add(fin);
      }
    }
    // a ventral ammo/feed belt box on kinetic guns (damageType hint)
    if (w && w.damageType === 'kinetic') {
      const belt = new THREE.Mesh(getGeometry('wpn:belt', () => new THREE.BoxGeometry(0.16, 0.1, 0.14)), darkWpnMat());
      belt.position.set(-0.05 * s, -0.2 * s, 0); belt.scale.setScalar(s); barrel.add(belt);
    }
  }
  g.add(barrel);
  // a small glow port at the muzzle so the gun reads as armed through bloom
  const port = makeHalo(pal.accent, s * 0.7); port.position.x = 0.6 * s; g.add(port);
  // turrets get a rotating head: stash the barrel group so the per-frame driver can sweep it slowly,
  // selling the "tracks its target" read. (Static ships still get a gentle idle sweep.)
  if (isTurret) {
    g.userData.turretHead = barrel;
    g.userData.isTurret = true;
  }
  // orient the whole prop to its facing (barrel default points +X = front)
  g.rotation.y = FACING_YAW[facing] != null ? FACING_YAW[facing] : 0;
  return g;
}

// dark machinery material for weapon internals (breech blocks, tube mouths, ammo belts)
function darkWpnMat() {
  return getMaterial('wpn:dark', () => new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.7, metalness: 0.66 }));
}

// ---- engine props ----------------------------------------------------------------------------
// An engine block + nozzle + plume sized by engine class. Reuses the existing engineGlow plume but
// adds a housing so engines read as machinery, not floating glows.
function engineProp(pal, R, scaleK, engineClass) {
  const g = new THREE.Group();
  const s = R * 0.22 * scaleK * (0.85 + Math.min(0.5, (engineClass || 60) / 240));
  const housingMat = hullMaterial(pal, 8);
  const nozzleMat = emissiveMaterial(pal.thruster, 2.4);
  const darkMat = getMaterial('eng:dark', () => new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.72, metalness: 0.68 }));
  // engine nacelle housing (cylinder lying along X) with an intake lip at the front
  const nacelle = new THREE.Mesh(getGeometry('eng:nacelle', () => new THREE.CylinderGeometry(0.3, 0.34, 0.7, 12).rotateZ(Math.PI / 2)), housingMat);
  nacelle.scale.set(s, s, s); g.add(nacelle);
  // intake lip (flared ring at the front of the nacelle)
  const intake = new THREE.Mesh(getGeometry('eng:intake', () => new THREE.TorusGeometry(0.3, 0.04, 6, 12).rotateY(Math.PI / 2)), housingMat);
  intake.position.x = 0.36 * s; intake.scale.setScalar(s); g.add(intake);
  // bright nozzle ring at the rear
  const nozzle = new THREE.Mesh(getGeometry('eng:nozzle2', () => new THREE.CylinderGeometry(0.30, 0.20, 0.18, 12).rotateZ(Math.PI / 2)), nozzleMat);
  nozzle.position.x = -0.34 * s; nozzle.scale.set(s, s, s); g.add(nozzle);
  // VISIBLE TURBINE FAN inside the nozzle — a spoked disk that the per-frame driver spins, so engines
  // read as real machinery with moving internals, not a glowing tube. Sat just inside the nozzle.
  const fan = new THREE.Group();
  const hub = new THREE.Mesh(getGeometry('eng:hub', () => new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2)), darkMat);
  fan.add(hub);
  const bladeGeo = getGeometry('eng:blade', () => new THREE.BoxGeometry(0.02, 0.22, 0.05));
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(bladeGeo, darkMat);
    blade.rotation.x = (i / 6) * Math.PI * 2; blade.rotation.z = 0.5; // pitched fan blades
    fan.add(blade);
  }
  fan.position.x = -0.3 * s; fan.scale.setScalar(s); g.add(fan);
  g.userData.fan = fan;
  // exhaust manifold ribs (heat-management fins on the nacelle exterior)
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(getGeometry('eng:manifold', () => new THREE.CylinderGeometry(0.35, 0.35, 0.03, 12).rotateZ(Math.PI / 2)), darkMat);
    rib.position.x = (0.1 - i * 0.14) * s; rib.scale.setScalar(s); g.add(rib);
  }
  // exhaust plume (the existing directional flame) via engineGlow, scaled
  const flame = engineGlow(pal, -0.55 * s, 0, s * 0.9);
  g.add(flame);
  g.userData.plume = flame.userData.plume;
  g.userData.plumeBase = flame.userData.plume ? { x: flame.userData.plume.scale.x, y: flame.userData.plume.scale.y, z: flame.userData.plume.scale.z } : null;
  return g;
}

// ---- mining drill prop -----------------------------------------------------------------------
function miningProp(pal, R, tier) {
  const g = new THREE.Group();
  const s = R * 0.18 * (1 + Math.min(1, (tier || 1) - 1) * 0.18);
  const housingMat = hullMaterial(pal, 6);
  // drill housing
  const housing = new THREE.Mesh(getGeometry('mine:housing', () => new THREE.CylinderGeometry(0.3, 0.36, 0.5, 8).rotateZ(Math.PI / 2)), housingMat);
  housing.scale.setScalar(s); g.add(housing);
  // auger bit (cone + spiral hint via stacked rings)
  const bit = new THREE.Mesh(getGeometry('mine:bit', () => new THREE.ConeGeometry(0.22, 0.8, 7).rotateZ(-Math.PI / 2)), housingMat);
  bit.position.x = 0.6 * s; bit.scale.setScalar(s); g.add(bit);
  // glowing emitter tip (ore-cutter laser)
  const tip = new THREE.Mesh(getGeometry('mine:tip2', () => new THREE.OctahedronGeometry(0.14, 0)), emissiveMaterial('#ffb347', 2.2));
  tip.position.x = 1.0 * s; tip.scale.setScalar(s); g.add(tip);
  return g;
}

// ---- shield emitter ring ---------------------------------------------------------------------
// A faint torus around the hull's perimeter, present only when a shield module is fitted.
function shieldRingProp(pal, R, halfWidth, height, tier) {
  const g = new THREE.Group();
  const rad = R * Math.max(halfWidth, 0.4) * 2.0;
  const ring = new THREE.Mesh(
    getGeometry(`shield:ring:${q(rad)}`, () => new THREE.TorusGeometry(rad, R * 0.025 * (1 + (tier || 1) * 0.05), 8, 28)),
    additiveGlowMaterial(pal.accent, 0.28),
  );
  ring.rotation.x = Math.PI / 2; ring.scale.y = 1 + height; g.add(ring);
  return g;
}

// ---- nav blinkers (port green / starboard red aerospace cueing) ------------------------------
function addNavBlinkers(g, R, halfWidth, length, blinkers) {
  // Aerospace nav-light convention: green on PORT (+Z here), red on STARBOARD (-Z), white stern at
  // the rear center. Sized up so they read as distinct point lights (they'll bloom brightly in-game).
  const z = R * halfWidth * 1.05;
  const xMid = 0;
  const gr = blinkerSprite('#3dff7a', R * 0.20, 0.0, blinkers); gr.position.set(xMid, R * 0.05, z); g.add(gr);
  const rd = blinkerSprite('#ff4040', R * 0.20, 0.5, blinkers); rd.position.set(xMid, R * 0.05, -z); g.add(rd);
  // white stern light at the rear center
  const stern = blinkerSprite('#eaf2ff', R * 0.16, 0.25, blinkers); stern.position.set(-R * length * 0.48, R * 0.06, 0); g.add(stern);
}

// =============================================================================================
// PROCEDURAL SURFACE DETAIL — scatters greeble clusters (vents, hatches, pipe runs, frame ribs,
// RCS thrusters, coolant fins) across the hull deck. This is the single biggest lever for perceived
// craftsmanship: it deepens EVERY ship uniformly without touching the family builders. Density
// scales with tier (Mk.I sparse → Mk.III dense) so upgraded hulls read as busier/reinforced.
//
// Detail is laid out on a loose grid across the deck footprint (length × halfWidth in R-fractions),
// jittered so it doesn't look mechanical. Each cluster is built from cached primitives.
// =============================================================================================
function surfaceDetail(ctx) {
  const { g, R, pal, hm, vis, hints, seed } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  const density = hints.greeble != null ? hints.greeble : 0.5;       // 0..1
  const armored = hints.plating === 'armored';
  const rnd = mulberryLite(seed ^ 0x9e37);
  // deck bounds the detail scatters within (keep clear of the nose/engine/cockpit zones)
  const xMin = -L * 0.40, xMax = L * 0.30;
  const span = xMax - xMin;
  const cellsX = Math.max(3, Math.round(span * 6));                  // grid resolution along X
  const cellsZ = Math.max(2, Math.round(W * 2 * 6));
  const deckY = H * 0.5 * R;                                          // top surface height

  // shared cached geos
  const ventGeo = getGeometry('greeb:vent', () => new THREE.BoxGeometry(0.12, 0.03, 0.06));
  const hatchGeo = getGeometry('greeb:hatch', () => new THREE.BoxGeometry(0.1, 0.025, 0.1));
  const ribGeo = getGeometry('greeb:rib', () => new THREE.BoxGeometry(0.05, 0.05, 0.32));
  const pipeGeo = getGeometry('greeb:pipe', () => new THREE.CylinderGeometry(0.018, 0.018, 0.4, 5).rotateZ(Math.PI / 2));
  const rcsGeo = getGeometry('greeb:rcs', () => new THREE.CylinderGeometry(0.035, 0.05, 0.06, 6));
  const finGeo = getGeometry('greeb:fin', () => new THREE.BoxGeometry(0.04, 0.12, 0.08));
  const ventMat = hm;
  const darkMat = getMaterial('greeb:dark', () => new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.74, metalness: 0.62 }));
  const glowMat = emissiveMaterial(pal.accent, 0.85);

  // walk the grid; each cell has a probability of hosting a cluster, gated by density
  for (let ix = 0; ix < cellsX; ix++) {
    for (let iz = 0; iz < cellsZ; iz++) {
      if (rnd() > density * 0.55) continue;                          // sparseness control
      const fx = xMin + (ix + 0.5) / cellsX * span;
      const fz = (iz + 0.5) / cellsZ - 0.5;                          // -0.5..0.5 → ×2W
      const z = fz * 2 * W;
      // keep detail off the very edges (where wings/weapons live)
      const edgeFade = 1 - Math.min(1, Math.abs(fz) * 1.4);
      if (rnd() > edgeFade + 0.15) continue;
      const px = fx * R, py = deckY, pz = z * R;
      const roll = rnd();
      if (roll < 0.34) {
        // vent cluster: 2-3 slats
        const v = new THREE.Mesh(ventGeo, darkMat); v.position.set(px, py, pz); v.scale.setScalar(R); g.add(v);
        const v2 = v.clone(); v2.position.z = pz + 0.08 * R; g.add(v2);
      } else if (roll < 0.55) {
        // access hatch with a handle
        const h = new THREE.Mesh(hatchGeo, ventMat); h.position.set(px, py, pz); h.scale.setScalar(R); g.add(h);
        const handle = new THREE.Mesh(getGeometry('greeb:handle', () => new THREE.BoxGeometry(0.02, 0.015, 0.03)), darkMat);
        handle.position.set(px, py + 0.02 * R, pz); handle.scale.setScalar(R); g.add(handle);
      } else if (roll < 0.72) {
        // frame rib spanning across the hull (reads as internal structure)
        const r = new THREE.Mesh(ribGeo, ventMat); r.position.set(px, py, pz); r.scale.setScalar(R); g.add(r);
      } else if (roll < 0.85) {
        // pipe run along X
        const p = new THREE.Mesh(pipeGeo, darkMat); p.position.set(px, py, pz); p.scale.setScalar(R); g.add(p);
      } else {
        // RCS thruster quad (small attitude jets at the corners) — emissive
        const t = new THREE.Mesh(rcsGeo, glowMat); t.position.set(px, py, pz); t.scale.setScalar(R); g.add(t);
      }
    }
  }
  // coolant/radiator fins lining both flanks (tier Mk.II+) — reads as heat-management machinery
  if (density > 0.55) {
    const finCount = Math.round(density * 5);
    for (let i = 0; i < finCount; i++) {
      for (const sgn of [1, -1]) {
        const f = new THREE.Mesh(finGeo, ventMat);
        f.position.set((xMin + 0.1 + i * 0.12) * R, H * 0.35 * R, sgn * W * 0.95 * R);
        f.rotation.y = sgn * 0.3; f.scale.setScalar(R); g.add(f);
      }
    }
  }
  // armored scallop plates (Mk.III) — overlapping defense plates along the spine
  if (armored) {
    const plateGeo = getGeometry('greeb:plate', () => new THREE.BoxGeometry(0.16, 0.04, 0.5));
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(plateGeo, ventMat);
      p.position.set((xMin + 0.15 + i * 0.14) * R, H * 0.52 * R, 0);
      p.scale.setScalar(R); g.add(p);
    }
  }
  // battle-damage scorch marks (highest tier only) — darkened emissive patches implying survived combat
  if (armored && density >= 0.9) {
    const scorchGeo = getGeometry('greeb:scorch', () => new THREE.CircleGeometry(0.08, 8));
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(scorchGeo, getMaterial('greeb:scorch', () =>
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x000000, roughness: 1, transparent: true, opacity: 0.85 })));
      s.position.set((xMin + 0.2 + i * 0.3 + rnd() * 0.1) * R, H * 0.51 * R, (rnd() - 0.5) * W * R);
      s.rotation.x = -Math.PI / 2; s.scale.setScalar(R); g.add(s);
    }
  }
}

// ---- decal overlay shell ---------------------------------------------------------------------
// A slightly-larger transparent shell carrying the greeble-detail + livery decals over the hull's
// dominant faces. Only added on higher tiers / larger hulls to keep small craft clean.
function addDecalShell(g, pal, R, lx, ly, lz, kind) {
  const shell = new THREE.Mesh(hullSlabGeo(lx * 1.02, ly * 1.02, lz * 1.02), decalMaterial(pal, kind));
  shell.scale.setScalar(R); g.add(shell);
}

// =============================================================================================
// PAINT PROFILE — the soul of the art direction. Applies grime, chrome, nose-art and repair patches
// to a hull based on its faction personality. This is what makes the dirty-outlaw vs clean-authority
// contrast read instantly. Called from the orchestrator (step 2c) for every ship.
//
//   • grime    — transparent overlay shell carrying oil/rust/soot/dust (outlaw hulls)
//   • chrome   — raises the hull material's metalness + attaches the baked nebula env-map so the
//                surface mirrors the scene (authority hulls). Falls back to shiny-matte if no env-map.
//   • noseArt  — a decal panel on each flank: bomber shark-mouth+motto+kill-tally (player/pirate),
//                punk spray tags (smuggler/pirate), or a clean authority crest.
//   • patches  — bolted repair-plate overlay (battle-scarred hulls)
// =============================================================================================
function applyPaintProfile(ctx, e) {
  const { g, R, pal, vis, seed } = ctx;
  const profile = (pal && pal.profile) || null;
  if (!profile) return;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  const isPlayer = !!(pal.isPlayer);
  const defId = e.data && e.data.defId;

  // --- CHROME: authority hulls mirror the scene. We bump the existing hull material's metalness
  //     and attach the env-map. The hull material is shared/cached, so rather than mutate it (which
  //     would chrome ALL ships using it), we set envMapIntensity per-mesh via onBeforeRender is
  //     overkill — instead we add a thin chrome foil shell only when chrome > 0.3. This keeps the
  //     shared material untouched and isolates the mirror look to authority ships.
  if (profile.chrome > 0.3) {
    const foilMat = getMaterial(`chrome:${q(profile.chrome)}`, () => {
      const m = new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 1.0, roughness: 0.12 - profile.chrome * 0.08,
        envMap: SHIP_ENV_MAP, envMapIntensity: profile.chrome,
        transparent: true, opacity: 0.55 + profile.chrome * 0.35,
        depthWrite: false,
      });
      return m;
    });
    const foil = new THREE.Mesh(hullSlabGeo(L, H, W * 1.5), foilMat);
    foil.scale.setScalar(R); g.add(foil);
  }

  // --- GRIME: transparent overlay with oil/rust/soot/dust. Skipped entirely for clean authority.
  if (profile.grime > 0.15) {
    const grimeMat = getMaterial(`grime:${q(profile.grime)}:${pal.hull}`, () => {
      const tex = getTexture(`grime:${pal.hull}:${q(profile.grime)}`, () =>
        makeGrimeTexture({ size: 256, seed: (seed ^ 0x51) & 0xffff, intensity: profile.grime }));
      return new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        color: 0xffffff, roughness: 0.9, metalness: 0.0,
      });
    });
    const grime = new THREE.Mesh(hullSlabGeo(L * 1.01, H * 1.01, W * 1.51), grimeMat);
    grime.scale.setScalar(R); g.add(grime);
  }

  // --- REPAIR PATCHES: bolted plates over old battle damage (scarred veterans).
  if (profile.patches > 0.15) {
    const patchMat = getMaterial(`patch:${q(profile.patches)}:${pal.hull}`, () => {
      const tex = getTexture(`patch:${pal.hull}:${q(profile.patches)}`, () =>
        makePatchTexture({ size: 256, seed: (seed ^ 0x73) & 0xffff, density: profile.patches }));
      return new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        color: 0xffffff, roughness: 0.85, metalness: 0.3,
      });
    });
    const patch = new THREE.Mesh(hullSlabGeo(L, H, W * 1.5), patchMat);
    patch.scale.setScalar(R); g.add(patch);
  }

  // --- NOSE-ART: a decal panel on each flank. Style from the profile; the player's Kestrel gets the
  //     canonical "BORROWED TIME" haunted-runner look (shark mouth + ghost mascot + 13 kill marks).
  if (profile.noseArt) {
    const noseCfg = PLAYER_NOSE_ART[defId] || {};
    const motto = noseCfg.motto;
    const mascot = noseCfg.mascot;
    const tally = (profile.killMarks && noseCfg.tally) ? noseCfg.tally : 0;
    const style = profile.noseArt;
    const naMat = getMaterial(`nose:${style}:${pal.accent}:${defId || 'x'}`, () => {
      const tex = getTexture(`nose:${style}:${pal.accent}:${defId || 'x'}`, () =>
        makeNoseArtTexture({
          size: 256, seed: (seed ^ 0x99) & 0xffff, style, accent: pal.accent,
          motto, mascot, tally,
        }));
      return new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        color: 0xffffff, roughness: 0.6, metalness: 0.1,
        emissive: new THREE.Color(pal.emissive), emissiveIntensity: 0.05,
        side: THREE.DoubleSide,
      });
    });
    // place a flank decal panel on each side, facing outward (±Z), roughly amidships
    const panelGeo = getGeometry('nose:panel', () => new THREE.PlaneGeometry(0.5, 0.32));
    for (const sgn of [1, -1]) {
      const panel = new THREE.Mesh(panelGeo, naMat);
      panel.position.set(0, H * 0.3 * R, sgn * W * 1.52 * R);
      panel.rotation.y = sgn * Math.PI / 2;   // face outward along ±Z
      panel.scale.setScalar(R);
      g.add(panel);
    }
  }
}



// =============================================================================================
// FAMILY BUILDERS — each composes a multi-section hull scaled by `vis` (proportions) + `tier`.
// They receive (ctx) where ctx = { g, R, pal, hm, accent, cockpit, vis, tier, hints, seed, blinkers }
// and add geometry to ctx.g. Returns nothing.
// =============================================================================================

function buildScout(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // forward fuselage (tapered) + aft hull slab + cheek fins
  const aft = new THREE.Mesh(hullSlabGeo(L * 0.6, H, W * 1.4), hm); aft.scale.setScalar(R); aft.position.x = -L * 0.15 * R; g.add(aft);
  const fore = new THREE.Mesh(hullSlabGeo(L * 0.35, H * 0.8, W * 0.8), hm); fore.scale.setScalar(R); fore.position.x = L * 0.32 * R; g.add(fore);
  const nose = new THREE.Mesh(noseConeGeo(W * 0.7, L * 0.32, 8), hm); nose.position.x = L * 0.62 * R; nose.scale.setScalar(R); g.add(nose);
  // cockpit canopy (recessed glass)
  recessedCanopy(ctx, L * 0.18 * R, H * 0.55 * R, 0, R * 0.32, R * 0.22, R * 0.22);
  // cheek fins (tier-gated)
  const finCount = hints.finCount || 0;
  for (let i = 0; i < finCount; i++) {
    for (const sgn of [1, -1]) {
      const fin = new THREE.Mesh(getGeometry(`scout:fin${i}`, () => new THREE.BoxGeometry(0.3, 0.22, 0.12)), hm);
      fin.position.set(-L * 0.25 * R, H * (0.3 + i * 0.2) * R, sgn * W * (1.1 + i * 0.1) * R); fin.scale.setScalar(R); g.add(fin);
    }
  }
  // spine ribs (Mk.III)
  for (let r = 0; r < (hints.spineRibs || 0); r++) {
    const rib = new THREE.Mesh(getGeometry(`scout:rib${r}`, () => new THREE.BoxGeometry(0.06, 0.1, 0.4)), hm);
    rib.position.set((0.1 - r * 0.18) * R, H * 0.5 * R, 0); rib.scale.setScalar(R); g.add(rib);
  }
}

function buildFighter(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  const sweep = hints.wingSweep || 0.6;
  // central fuselage (long, narrow) + nose
  const fus = new THREE.Mesh(hullSlabGeo(L * 0.55, H, W * 0.5), hm); fus.scale.setScalar(R); g.add(fus);
  const nose = new THREE.Mesh(noseConeGeo(W * 0.45, L * 0.45, 8), hm); nose.position.x = L * 0.45 * R; nose.scale.setScalar(R); g.add(nose);
  // swept delta wings (the signature silhouette)
  for (const sgn of [1, -1]) {
    const wing = new THREE.Mesh(getGeometry('fighter:wing', () => new THREE.BoxGeometry(0.8, 0.07, 0.9)), hm);
    wing.position.set(-L * 0.08 * R, 0, sgn * W * 0.7 * R); wing.rotation.y = sgn * sweep;
    wing.scale.set(R, R, R); g.add(wing);
    // wingtip rail
    const rail = new THREE.Mesh(getGeometry('fighter:rail', () => new THREE.BoxGeometry(0.18, 0.05, 0.06)), hm);
    rail.position.set(L * 0.18 * R, 0, sgn * W * 1.1 * R); rail.scale.setScalar(R); g.add(rail);
  }
  // canard foreplanes (tier-gated) near the nose
  if (hints.canard) {
    for (const sgn of [1, -1]) {
      const can = new THREE.Mesh(getGeometry('fighter:canard', () => new THREE.BoxGeometry(0.22, 0.05, 0.3)), hm);
      can.position.set(L * 0.22 * R, 0, sgn * W * 0.35 * R); can.rotation.y = sgn * 0.3; can.scale.setScalar(R); g.add(can);
    }
  }
  // cockpit
  recessedCanopy(ctx, L * 0.05 * R, H * 0.5 * R, 0, R * 0.36, R * 0.22, R * 0.2);
  // vertical stabilizer (tier Mk.II+)
  if ((hints.plating === 'paneled') || (hints.plating === 'armored')) {
    const stab = new THREE.Mesh(getGeometry('fighter:stab', () => new THREE.BoxGeometry(0.3, 0.3, 0.05)), hm);
    stab.position.set(-L * 0.2 * R, H * 0.7 * R, 0); stab.scale.setScalar(R); g.add(stab);
  }
  // armored cheek plates (Mk.III)
  if (hints.plating === 'armored') {
    for (const sgn of [1, -1]) {
      const plate = new THREE.Mesh(getGeometry('fighter:plate', () => new THREE.BoxGeometry(0.5, 0.12, 0.18)), hm);
      plate.position.set(L * 0.1 * R, -H * 0.2 * R, sgn * W * 0.3 * R); plate.scale.setScalar(R); g.add(plate);
    }
  }
}

function buildFreighter(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // long boxy spine + upswept bow
  const spine = new THREE.Mesh(hullSlabGeo(L * 0.8, H * 0.7, W * 0.9), hm); spine.scale.setScalar(R); spine.position.x = -L * 0.05 * R; g.add(spine);
  const bow = new THREE.Mesh(hullSlabGeo(L * 0.22, H * 0.6, W * 0.8), hm); bow.position.x = L * 0.4 * R; bow.scale.setScalar(R); g.add(bow);
  // bridge superstructure up front (the "cab")
  const bridge = new THREE.Mesh(hullSlabGeo(L * 0.18, H * 0.7, W * 0.5), hm); bridge.position.set(L * 0.32 * R, H * 0.7 * R, 0); bridge.scale.setScalar(R); g.add(bridge);
  const cab = new THREE.Mesh(getGeometry('frt:cab', () => new THREE.BoxGeometry(0.06, 0.14, 0.42)), cockpitGlassMaterial(pal)); cab.position.set(L * 0.42 * R, H * 0.95 * R, 0); cab.scale.setScalar(R); g.add(cab);
  // stacked cargo pods along the spine (count scales with tier hints)
  const cols = hints.podCols || 1, rows = hints.podRows || 2;
  const podMat = hullMaterial(pal, 16);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      for (const sgn of (cols > 1 ? [1, -1] : [0])) {
        const pod = new THREE.Mesh(getGeometry(`frt:pod:${c}:${r}`, () => new THREE.BoxGeometry(0.32, 0.4, 0.36)), podMat);
        const px = (-L * 0.3 + c * 0.36) * R;
        const py = (r - (rows - 1) / 2) * 0.4 * R;
        pod.position.set(px, py, sgn * W * 0.55 * R); pod.scale.setScalar(R); g.add(pod);
        // pod end cap glow
        const cap = new THREE.Mesh(getGeometry('frt:cap', () => new THREE.CircleGeometry(0.1, 8)), emissiveMaterial(pal.accent, 1.0));
        cap.position.set(px - 0.17 * R, py, sgn * W * 0.55 * R); cap.rotation.y = -Math.PI / 2; cap.scale.setScalar(R); g.add(cap);
      }
    }
  }
  // spine accent strip
  const stripMat = emissiveMaterial(pal.accent, 1.4);
  const strip = new THREE.Mesh(getGeometry('frt:strip', () => new THREE.BoxGeometry(L, 0.05, 0.05)), stripMat);
  strip.position.set(0, H * 0.4 * R, W * 0.5 * R); strip.scale.setScalar(R); g.add(strip);
}

function buildMiner(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // wide industrial body (chunky, tall)
  const body = new THREE.Mesh(hullSlabGeo(L * 0.55, H, W * 1.1), hm); body.scale.setScalar(R); body.position.x = -L * 0.05 * R; g.add(body);
  const bow = new THREE.Mesh(hullSlabGeo(L * 0.2, H * 0.8, W * 0.8), hm); bow.position.x = L * 0.32 * R; bow.scale.setScalar(R); g.add(bow);
  // reinforced drill prow mount (always present — miners are defined by their head)
  const drillMount = new THREE.Mesh(getGeometry('miner:mount', () => new THREE.CylinderGeometry(0.34, 0.4, 0.4, 8).rotateZ(Math.PI / 2)), hm);
  drillMount.position.x = L * 0.42 * R; drillMount.scale.setScalar(R); g.add(drillMount);
  // industrial side arms / scoop frames (count scales with tier)
  const armCount = hints.armCount || 2;
  const armMat = hullMaterial(pal, 8);
  for (let a = 0; a < armCount / 2; a++) {
    for (const sgn of [1, -1]) {
      const arm = new THREE.Mesh(getGeometry(`miner:arm${a}`, () => new THREE.BoxGeometry(0.5, 0.1, 0.14)), armMat);
      arm.position.set((L * 0.05 - a * 0.18) * R, H * (0.2 - a * 0.15) * R, sgn * W * (1.0 + a * 0.12) * R); arm.scale.setScalar(R); g.add(arm);
      // scoop bucket at the arm end
      const scoop = new THREE.Mesh(getGeometry('miner:scoop', () => new THREE.BoxGeometry(0.18, 0.18, 0.16)), armMat);
      scoop.position.set((L * 0.05 - a * 0.18) * R, H * (0.2 - a * 0.15) * R, sgn * W * (1.15 + a * 0.12) * R); scoop.scale.setScalar(R); g.add(scoop);
    }
  }
  // cockpit (raised, overlooking the drill)
  recessedCanopy(ctx, L * 0.05 * R, H * 0.7 * R, 0, R * 0.3, R * 0.2, R * 0.24);
  // dorsal machinery block
  const mach = new THREE.Mesh(getGeometry('miner:mach', () => new THREE.BoxGeometry(0.4, 0.3, 0.5)), hm);
  mach.position.set(-L * 0.15 * R, H * 0.6 * R, 0); mach.scale.setScalar(R); g.add(mach);
}

function buildFrigate(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // wedge hull: wide aft, narrowing forward
  const hull = new THREE.Mesh(hullSlabGeo(L * 0.7, H, W * 1.0), hm); hull.scale.setScalar(R); hull.position.x = -L * 0.05 * R; g.add(hull);
  const prow = new THREE.Mesh(noseConeGeo(W * 0.55, L * 0.35, 6), hm); prow.position.x = L * 0.45 * R; prow.scale.setScalar(R); g.add(prow);
  // tiered bridge tower (a warship's command island)
  const towerTiers = hints.towerTiers || 1;
  for (let t = 0; t < towerTiers; t++) {
    const tw = W * (0.45 - t * 0.12);
    const tower = new THREE.Mesh(getGeometry(`frig:tower${t}`, () => new THREE.BoxGeometry(0.32, 0.22, tw)), hm);
    tower.position.set(L * 0.12 * R, (H * 0.6 + t * 0.22) * R, 0); tower.scale.setScalar(R); g.add(tower);
    // tower window strip
    const win = new THREE.Mesh(getGeometry('frig:win', () => new THREE.BoxGeometry(0.3, 0.03, tw * 0.7)), emissiveMaterial('#ffd98a', 1.2));
    win.position.set(L * 0.12 * R, (H * 0.6 + t * 0.22 + 0.05) * R, 0); win.scale.setScalar(R); g.add(win);
  }
  // broadside gun sponsons (the side battery bulges)
  const broadside = hints.broadsideGuns || 1;
  for (const sgn of [1, -1]) {
    for (let b = 0; b < broadside; b++) {
      const spon = new THREE.Mesh(getGeometry(`frig:spon${b}`, () => new THREE.BoxGeometry(0.22, 0.18, 0.18)), hm);
      spon.position.set((L * 0.05 - b * 0.22) * R, H * 0.25 * R, sgn * W * (0.95 + b * 0.05) * R); spon.scale.setScalar(R); g.add(spon);
    }
  }
  // armored belt strip along the waterline-equivalent
  const belt = new THREE.Mesh(getGeometry('frig:belt', () => new THREE.BoxGeometry(L * 0.7, 0.08, 0.06)), emissiveMaterial(pal.accent, 0.9));
  belt.position.set(-L * 0.05 * R, 0, W * 0.9 * R); belt.scale.setScalar(R); g.add(belt);
  const belt2 = belt.clone(); belt2.position.z = -W * 0.9 * R; g.add(belt2);
}

function buildCapital(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // massive multi-block spine (fore / mid / aft) — the leviathan silhouette
  const aft = new THREE.Mesh(hullSlabGeo(L * 0.35, H, W * 1.0), hm); aft.position.x = -L * 0.28 * R; aft.scale.setScalar(R); g.add(aft);
  const mid = new THREE.Mesh(hullSlabGeo(L * 0.3, H * 0.85, W * 0.85), hm); mid.scale.setScalar(R); g.add(mid);
  const fore = new THREE.Mesh(hullSlabGeo(L * 0.2, H * 0.7, W * 0.7), hm); fore.position.x = L * 0.3 * R; fore.scale.setScalar(R); g.add(fore);
  const prow = new THREE.Mesh(noseConeGeo(W * 0.5, L * 0.22, 6), hm); prow.position.x = L * 0.48 * R; prow.scale.setScalar(R); g.add(prow);
  // command tower cluster (multiple tiers + sensor mast)
  const towerTiers = hints.towerTiers || 2;
  for (let t = 0; t < towerTiers; t++) {
    const tw = W * (0.5 - t * 0.1);
    const tower = new THREE.Mesh(getGeometry(`cap:tower${t}`, () => new THREE.BoxGeometry(0.4, 0.3, tw)), hm);
    tower.position.set(L * 0.08 * R, (H * 0.65 + t * 0.3) * R, 0); tower.scale.setScalar(R); g.add(tower);
    // lit window decks (3 rows per tier)
    for (let w = 0; w < 3; w++) {
      const win = new THREE.Mesh(getGeometry(`cap:win${t}:${w}`, () => new THREE.BoxGeometry(0.36, 0.025, tw * 0.6)), emissiveMaterial('#ffd98a', 1.3));
      win.position.set(L * 0.08 * R, (H * 0.65 + t * 0.3 - 0.08 + w * 0.06) * R, 0); win.scale.setScalar(R); g.add(win);
    }
  }
  // fin arrays (the dorsal radiator/fin clusters that grow with tier)
  const finArrays = hints.finArrays || 1;
  for (let f = 0; f < finArrays; f++) {
    for (const sgn of [1, -1]) {
      const fin = new THREE.Mesh(getGeometry(`cap:fin${f}`, () => new THREE.BoxGeometry(0.5, 0.4, 0.08)), hm);
      fin.position.set((-L * 0.1 - f * 0.2) * R, H * (0.5 + f * 0.1) * R, sgn * W * (0.9 + f * 0.05) * R); fin.scale.setScalar(R); g.add(fin);
    }
  }
  // sensor ring (rotating, animated by the engine driver later)
  const ring = new THREE.Mesh(getGeometry('cap:ring', () => new THREE.TorusGeometry(W * 0.6, R * 0.03, 8, 24)), emissiveMaterial(pal.accent, 1.6));
  ring.rotation.x = Math.PI / 2; ring.position.set(L * 0.08 * R, H * 0.9 * R, 0); ring.scale.setScalar(R); g.add(ring);
  ctx.sensorRing = ring;
  // ventral hangar bay (a recessed box underneath)
  const hangar = new THREE.Mesh(getGeometry('cap:hangar', () => new THREE.BoxGeometry(0.5, 0.12, 0.4)), hm);
  hangar.position.set(-L * 0.05 * R, -H * 0.5 * R, 0); hangar.scale.setScalar(R); g.add(hangar);
}

function buildMultirole(ctx) {
  const { g, R, pal, hm, cockpit, vis, hints } = ctx;
  const L = vis.length, W = vis.halfWidth, H = vis.height;
  // cylindrical fuselage + nose + winglets (the balanced explorer/drifter shape)
  const fus = new THREE.Mesh(getGeometry('mul:fus', () => new THREE.CylinderGeometry(W * 0.5, W * 0.7, L * 0.6, 8).rotateZ(Math.PI / 2)), hm);
  fus.scale.setScalar(R); g.add(fus);
  const nose = new THREE.Mesh(noseConeGeo(W * 0.5, L * 0.4, 8), hm); nose.position.x = L * 0.45 * R; nose.scale.setScalar(R); g.add(nose);
  // engine nacelles on pylons (count scales with tier)
  const nacelles = hints.nacelles || 2;
  for (let n = 0; n < nacelles / 2; n++) {
    for (const sgn of [1, -1]) {
      const pylon = new THREE.Mesh(getGeometry(`mul:pylon${n}`, () => new THREE.BoxGeometry(0.3, 0.06, 0.1)), hm);
      pylon.position.set(-L * 0.15 * R, -H * 0.1 * R, sgn * W * (0.7 + n * 0.15) * R); pylon.scale.setScalar(R); g.add(pylon);
      const nacelle = new THREE.Mesh(getGeometry(`mul:nacelle${n}`, () => new THREE.CylinderGeometry(0.16, 0.18, 0.6, 8).rotateZ(Math.PI / 2)), hm);
      nacelle.position.set(-L * 0.2 * R, -H * 0.15 * R, sgn * W * (0.85 + n * 0.15) * R); nacelle.scale.setScalar(R); g.add(nacelle);
    }
  }
  // winglets
  if (hints.winglets) {
    for (const sgn of [1, -1]) {
      const wl = new THREE.Mesh(getGeometry('mul:winglet', () => new THREE.BoxGeometry(0.4, 0.04, 0.2)), hm);
      wl.position.set(L * 0.05 * R, -H * 0.05 * R, sgn * W * 0.9 * R); wl.rotation.y = sgn * 0.3; wl.scale.setScalar(R); g.add(wl);
    }
  }
  // cockpit
  recessedCanopy(ctx, L * 0.15 * R, H * 0.5 * R, 0, R * 0.34, R * 0.22, R * 0.22);
}

// =============================================================================================
// ENEMY FAMILY BUILDERS (graphics spec Workstream D)
// Each enemy archetype renders as its OWN hostile silhouette — not a recolored player hull.
// Design rule (model-recipes §"Obstacle And Enemy Families"): each must have a unique silhouette,
// a material cue for danger, and telegraph its role from distance. Dark-shape distinctiveness is
// the acceptance test: no two may share an outline.
// All builders reuse the same ctx contract as player families: { g, R, pal, hm, accent, cockpit,
// vis, tier, hints, seed, blinkers }. They add geometry to ctx.g and return nothing.
// =============================================================================================

// drone_swarm — Wasp Swarmer. Tiny, asymmetric, spiked. Reads: disposable, numerous, fragile.
function buildDroneSwarm(ctx) {
  const { g, R, hm, accent, vis } = ctx;
  const s = (vis.length || 1.0) * 0.7;
  const body = new THREE.Mesh(getGeometry('edr:droneBody', () => new THREE.OctahedronGeometry(0.55, 0)), hm);
  body.scale.set(s * R, s * R * 0.6, s * R); body.rotation.y = Math.PI / 4; g.add(body);
  const spikeGeo = () => getGeometry('edr:spike', () => new THREE.ConeGeometry(0.12, 0.7, 5));
  const front = new THREE.Mesh(spikeGeo(), hm); front.rotation.x = Math.PI / 2;
  front.position.set(0, 0, s * R * 0.8); front.scale.setScalar(R); g.add(front);
  const lSpike = new THREE.Mesh(spikeGeo(), hm); lSpike.rotation.set(Math.PI / 2, 0, 0.6);
  lSpike.position.set(-s * R * 0.6, 0, -s * R * 0.1); lSpike.scale.setScalar(R * 0.7); g.add(lSpike);
  const rSpike = new THREE.Mesh(spikeGeo(), hm); rSpike.rotation.set(Math.PI / 2, 0, -0.6);
  rSpike.position.set(s * R * 0.6, 0, -s * R * 0.1); rSpike.scale.setScalar(R * 0.7); g.add(rSpike);
  const noz = new THREE.Mesh(getGeometry('edr:droneNoz', () => new THREE.CylinderGeometry(0.14, 0.2, 0.3, 6)), hm);
  noz.rotation.x = Math.PI / 2; noz.position.set(0, 0, -s * R * 0.6); noz.scale.setScalar(R); g.add(noz);
  const glow = new THREE.Mesh(getGeometry('edr:droneGlow', () => new THREE.CircleGeometry(0.13, 12)), accent);
  glow.position.set(0, 0, -s * R * 0.78); glow.scale.setScalar(R); g.add(glow);
}

// sniper_lance — Lancer Sniper. Slim needle, very long barrel, exposed cooling fins. Reads: keep distance.
function buildSniperLance(ctx) {
  const { g, R, hm, accent, vis } = ctx;
  const L = vis.length || 1.6, W = (vis.halfWidth || 0.35) * 0.6;
  // CapsuleGeometry is along Y; rotate around X to lie along Z (the ship's forward axis).
  // (rotation.z would lay it sideways along X — wrong.)
  const fuse = new THREE.Mesh(getGeometry('edr:lanceFuse', () => new THREE.CapsuleGeometry(0.18, 0.9, 4, 8)), hm);
  fuse.rotation.x = Math.PI / 2; fuse.scale.set(R * 0.9, R, R * 0.9); g.add(fuse);
  const lance = new THREE.Mesh(getGeometry('edr:lance', () => new THREE.CylinderGeometry(0.06, 0.1, 1.1, 6)), hm);
  lance.rotation.x = Math.PI / 2; lance.position.set(0, 0, L * R * 0.65); lance.scale.setScalar(R); g.add(lance);
  const lanceTip = new THREE.Mesh(getGeometry('edr:lanceTip', () => new THREE.ConeGeometry(0.07, 0.18, 6)), accent);
  lanceTip.rotation.x = Math.PI / 2; lanceTip.position.set(0, 0, L * R * 1.15); lanceTip.scale.setScalar(R); g.add(lanceTip);
  const finGeo = () => getGeometry('edr:radiator', () => new THREE.BoxGeometry(0.04, 0.4, 0.5));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(finGeo(), hm);
    fin.position.set(Math.cos(a) * W * R * 1.1, Math.sin(a) * W * R * 1.1, -L * R * 0.25);
    fin.rotation.z = a; fin.scale.setScalar(R); g.add(fin);
  }
  for (const dx of [-0.12, 0.12]) {
    const n = new THREE.Mesh(getGeometry('edr:lanceNoz', () => new THREE.CylinderGeometry(0.07, 0.1, 0.22, 6)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(dx * R, 0, -L * R * 0.55); n.scale.setScalar(R); g.add(n);
  }
}

// bruiser_armor — Bruiser Brawler. Bulky hex slab, layered armor plates, turret nacelles. Reads: tanky, slow.
function buildBruiserArmor(ctx) {
  const { g, R, hm, accent, vis } = ctx;
  const L = vis.length || 1.2, W = vis.halfWidth || 0.75;
  // CylinderGeometry(radiusTop, radiusBottom, height) is along Y. Rotate around X → height maps
  // to Z (forward). So local Y (height) must carry the ship length L; radii (local X,Z) carry the
  // beam/height profile. Scale order: (radiusX=W, height=L, radiusZ=profile).
  const body = new THREE.Mesh(getGeometry('edr:bruiserBody', () => new THREE.CylinderGeometry(0.55, 0.65, 1.0, 6)), hm);
  body.rotation.x = Math.PI / 2; body.scale.set(W * 1.3 * R, L * R, R); g.add(body);
  const armorMat = hm.clone(); armorMat.color.multiplyScalar(0.55);
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Mesh(getGeometry(`edr:plate${i}`, () => new THREE.BoxGeometry(1.3, 0.12, 0.4)), armorMat);
    plate.position.set(0, R * (0.18 + i * 0.06), L * R * (0.15 - i * 0.18)); plate.scale.setScalar(R); g.add(plate);
  }
  for (const dx of [-0.7, 0.7]) {
    const nace = new THREE.Mesh(getGeometry('edr:turretNace', () => new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8)), hm);
    nace.position.set(dx * W * R, R * 0.15, 0); nace.scale.setScalar(R); g.add(nace);
    const barbette = new THREE.Mesh(getGeometry('edr:barbette', () => new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6)), accent);
    barbette.rotation.x = Math.PI / 2; barbette.position.set(dx * W * R, R * 0.15, R * 0.3); barbette.scale.setScalar(R); g.add(barbette);
  }
  for (let i = -1; i <= 1; i++) {
    const n = new THREE.Mesh(getGeometry('edr:bruiserNoz', () => new THREE.CylinderGeometry(0.14, 0.18, 0.28, 8)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(i * 0.25 * R, 0, -L * R * 0.55); n.scale.setScalar(R); g.add(n);
  }
}

// trader_haul — Fleeing Trader. Bulbous cargo hull, container stacks, wide 4-nozzle engine bank. Reads: prey.
function buildTraderHaul(ctx) {
  const { g, R, hm, vis } = ctx;
  const L = vis.length || 1.3;
  const hold = new THREE.Mesh(getGeometry('edr:hold', () => new THREE.SphereGeometry(0.5, 12, 8)), hm);
  hold.scale.set(R * 0.9, R * 0.8, L * R * 0.85); hold.position.set(0, 0, -L * R * 0.05); g.add(hold);
  const cock = new THREE.Mesh(getGeometry('edr:traderCock', () => new THREE.SphereGeometry(0.18, 8, 6)), ctx.cockpit);
  cock.scale.setScalar(R); cock.position.set(0, R * 0.1, L * R * 0.45); g.add(cock);
  const contMat = hm.clone(); contMat.color.multiplyScalar(0.75);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(getGeometry(`edr:cont${i}`, () => new THREE.BoxGeometry(0.5, 0.3, 0.35)), contMat);
    c.position.set(0, R * (0.32 + i * 0.02), L * R * (0.15 - i * 0.22)); c.scale.setScalar(R); g.add(c);
  }
  for (let i = 0; i < 4; i++) {
    const dx = (i % 2 === 0 ? -1 : 1) * (0.18 + Math.floor(i / 2) * 0.05);
    const n = new THREE.Mesh(getGeometry('edr:traderNoz', () => new THREE.CylinderGeometry(0.1, 0.13, 0.24, 8)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(dx * R, 0, -L * R * 0.55); n.scale.setScalar(R); g.add(n);
  }
}

// pirate_swoop — Reaver Pirate. Asymmetric, greeble-heavy, exposed mismatched engines. Reads: raider/scavenger.
function buildPirateSwoop(ctx) {
  const { g, R, hm, accent, vis, seed } = ctx;
  const L = vis.length || 1.3, W = vis.halfWidth || 0.55;
  const rnd = mulberryLite(seed + 31);
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, L * 0.6); hullShape.lineTo(W * 0.8, -L * 0.4);
  hullShape.lineTo(W * 0.3, -L * 0.55); hullShape.lineTo(-W * 1.0, -L * 0.2);
  hullShape.lineTo(-W * 0.5, L * 0.3); hullShape.closePath();
  // ExtrudeGeometry lies in XY; rotate -90° around X so the flat hull deck lies in the XZ plane
  // (top-down ship plane) with the extrude depth becoming the hull's vertical thickness.
  const hullGeo = getGeometry('edr:swoopHull', () => new THREE.ExtrudeGeometry(hullShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 }));
  hullGeo.center();
  const hull = new THREE.Mesh(hullGeo, hm);
  hull.rotation.x = -Math.PI / 2; hull.scale.setScalar(R); g.add(hull);
  for (let i = 0; i < 5; i++) {
    const box = new THREE.Mesh(getGeometry(`edr:greeb${i}`, () => new THREE.BoxGeometry(0.1 + rnd() * 0.12, 0.1 + rnd() * 0.1, 0.12 + rnd() * 0.15)), hm);
    box.position.set((rnd() - 0.5) * W * 1.4 * R, R * (0.15 + rnd() * 0.15), (rnd() - 0.5) * L * 0.8 * R);
    box.scale.setScalar(R); g.add(box);
  }
  const sizes = [0.16, 0.11, 0.13];
  for (let i = 0; i < 3; i++) {
    const n = new THREE.Mesh(getGeometry(`edr:swoopNoz${i}`, () => new THREE.CylinderGeometry(sizes[i] * 0.8, sizes[i], 0.22, 6)), hm);
    n.rotation.x = Math.PI / 2; n.position.set((i - 1) * 0.22 * R, 0, -L * R * 0.45); n.scale.setScalar(R); g.add(n);
  }
  const stripe = new THREE.Mesh(getGeometry('edr:stripe', () => new THREE.BoxGeometry(W * 1.6, 0.04, 0.08)), accent);
  stripe.position.set(0, R * 0.22, L * R * 0.2); stripe.scale.setScalar(R); g.add(stripe);
}

// corsair_blade — Corsair Raider. Sharp angular blade wings, swept, elite pirate. Reads: fast, dangerous, elite.
function buildCorsairBlade(ctx) {
  const { g, R, hm, vis } = ctx;
  const L = vis.length || 1.4, W = vis.halfWidth || 0.7;
  const fuse = new THREE.Mesh(getGeometry('edr:bladeFuse', () => new THREE.ConeGeometry(0.28, L, 4)), hm);
  fuse.rotation.x = Math.PI / 2; fuse.scale.set(R * 0.9, R * 0.7, R); g.add(fuse);
  for (const dx of [-1, 1]) {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, L * 0.2); wingShape.lineTo(dx * W * 1.0, -L * 0.1);
    wingShape.lineTo(dx * W * 0.7, -L * 0.35); wingShape.lineTo(0, -L * 0.1); wingShape.closePath();
    // ExtrudeGeometry lies in the XY plane (shape) extruded along +Z. For a top-down ship the wing
    // must be flat in the XZ plane, so rotate -90° around X: shape-Y → world -Z (forward), extrude-Z → world Y (thin).
    const wingGeo = getGeometry(`edr:bladeWing${dx}`, () => new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false }));
    wingGeo.center();
    const wing = new THREE.Mesh(wingGeo, hm);
    wing.rotation.x = -Math.PI / 2; wing.scale.setScalar(R); g.add(wing);
  }
  for (const dx of [-1, 1]) {
    const tip = makeHalo('#ff4a3a', R * 0.16);
    tip.position.set(dx * W * R * 0.95, 0, -L * R * 0.22); g.add(tip);
  }
  for (const dx of [-0.18, 0.18]) {
    const n = new THREE.Mesh(getGeometry('edr:bladeNoz', () => new THREE.CylinderGeometry(0.1, 0.13, 0.28, 8)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(dx * R, 0, -L * R * 0.5); n.scale.setScalar(R); g.add(n);
  }
}

// patrol_interdict — Patrol Interceptor. Angular, interdiction webs, blue authority lights. Reads: police/pursuit.
function buildPatrolInterdict(ctx) {
  const { g, R, hm, vis } = ctx;
  const L = vis.length || 1.5, W = vis.halfWidth || 0.55;
  // CapsuleGeometry along Y → rotate around X to lie along Z (forward axis).
  const fuse = new THREE.Mesh(getGeometry('edr:interdictFuse', () => new THREE.CapsuleGeometry(0.22, 1.0, 4, 10)), hm);
  fuse.rotation.x = Math.PI / 2; fuse.scale.set(R * 0.85, R, R * 0.85); g.add(fuse);
  for (const dx of [-1, 1]) {
    const web = new THREE.Mesh(getGeometry(`edr:web${dx}`, () => new THREE.RingGeometry(0.2, 0.4, 6, 1)), hm);
    web.position.set(dx * W * R * 1.0, 0, -L * R * 0.1); web.scale.setScalar(R); g.add(web);
    const glow = makeHalo('#3aa0ff', R * 0.2);
    glow.position.set(dx * W * R * 1.0, 0, -L * R * 0.1); g.add(glow);
  }
  for (const dx of [-1, 1]) {
    const light = makeHalo('#3aa0ff', R * 0.1);
    light.position.set(dx * W * R * 0.9, 0, L * R * 0.4); g.add(light);
  }
  for (const dx of [-0.16, 0.16]) {
    const n = new THREE.Mesh(getGeometry('edr:interdictNoz', () => new THREE.CylinderGeometry(0.1, 0.12, 0.26, 8)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(dx * R, 0, -L * R * 0.55); n.scale.setScalar(R); g.add(n);
  }
}

// dreadnought_enemy — Dreadnought 'Iron Maw' (boss). Hand-authored capital: multi-section spine,
// command tower, sensor ring, broadside turrets, signature split prow. The showpiece enemy.
function buildDreadnoughtEnemy(ctx) {
  const { g, R, hm, accent, vis, hints } = ctx;
  const L = vis.length || 2.6, W = vis.halfWidth || 0.9;
  const towerTiers = hints.towerTiers || 3;
  const fore = new THREE.Mesh(getGeometry('edr:dreadFore', () => new THREE.CylinderGeometry(0.35, 0.5, 0.9, 8)), hm);
  fore.rotation.x = Math.PI / 2; fore.scale.set(R, R, R); fore.position.set(0, 0, L * R * 0.3); g.add(fore);
  const mid = new THREE.Mesh(getGeometry('edr:dreadMid', () => new THREE.BoxGeometry(1.4, 0.5, 1.2)), hm);
  mid.scale.setScalar(R); g.add(mid);
  const aft = new THREE.Mesh(getGeometry('edr:dreadAft', () => new THREE.CylinderGeometry(0.55, 0.4, 0.8, 8)), hm);
  aft.rotation.x = Math.PI / 2; aft.scale.set(R, R, R); aft.position.set(0, 0, -L * R * 0.35); g.add(aft);
  for (let i = 0; i < towerTiers; i++) {
    const tw = 0.4 - i * 0.08;
    const tier = new THREE.Mesh(getGeometry(`edr:tower${i}`, () => new THREE.BoxGeometry(tw, 0.18, tw)), hm);
    tier.position.set(0, R * (0.3 + i * 0.2), L * R * 0.05); tier.scale.setScalar(R); g.add(tier);
  }
  const ring = new THREE.Mesh(getGeometry('edr:dreadRing', () => new THREE.TorusGeometry(0.55, 0.05, 6, 20)), accent);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, R * 0.5, -L * R * 0.1); ring.scale.setScalar(R); g.add(ring);
  const turretN = 4 + (hints.greeble > 0.8 ? 2 : 0);
  for (let i = 0; i < turretN; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const zt = L * R * (0.3 - Math.floor(i / 2) * 0.4);
    const base = new THREE.Mesh(getGeometry(`edr:dreadTurretB${i}`, () => new THREE.CylinderGeometry(0.12, 0.15, 0.2, 8)), hm);
    base.position.set(side * W * R * 0.75, R * 0.15, zt); base.scale.setScalar(R); g.add(base);
    const barrel = new THREE.Mesh(getGeometry(`edr:dreadTurret${i}`, () => new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6)), accent);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(side * W * R * 0.75, R * 0.15, zt + R * 0.3); barrel.scale.setScalar(R); g.add(barrel);
  }
  for (let i = 0; i < 4; i++) {
    const dx = (i % 2 === 0 ? -1 : 1) * (0.2 + Math.floor(i / 2) * 0.08);
    const n = new THREE.Mesh(getGeometry(`edr:dreadNoz${i}`, () => new THREE.CylinderGeometry(0.13, 0.16, 0.32, 8)), hm);
    n.rotation.x = Math.PI / 2; n.position.set(dx * R, 0, -L * R * 0.6); n.scale.setScalar(R); g.add(n);
  }
  // signature split prow — the "iron maw" that names the boss.
  for (const dx of [-1, 1]) {
    const jaw = new THREE.Mesh(getGeometry(`edr:jaw${dx}`, () => new THREE.ConeGeometry(0.18, 0.6, 4)), hm);
    jaw.rotation.x = -Math.PI / 2; jaw.position.set(dx * 0.18 * R, -R * 0.05, L * R * 0.75); jaw.scale.setScalar(R); g.add(jaw);
  }
}

const ENEMY_FAMILY_BUILDERS = {
  drone_swarm: buildDroneSwarm,
  sniper_lance: buildSniperLance,
  bruiser_armor: buildBruiserArmor,
  trader_haul: buildTraderHaul,
  pirate_swoop: buildPirateSwoop,
  corsair_blade: buildCorsairBlade,
  patrol_interdict: buildPatrolInterdict,
  dreadnought_enemy: buildDreadnoughtEnemy,
};

const FAMILY_BUILDERS = {
  scout: buildScout, fighter: buildFighter, freighter: buildFreighter, miner: buildMiner,
  frigate: buildFrigate, capital: buildCapital, multirole: buildMultirole,
};

// =============================================================================================
// ORCHESTRATOR
// =============================================================================================
function buildShipMesh(e, pal) {
  const R = e.radius || 12;
  const defId = (e.data && e.data.defId) || 'ship_kestrel';
  const def = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
  const vis = (def && def.visuals) || {};
  // Enemy silhouette override (graphics spec Workstream D): an NPC carrying data.silhouette
  // renders as its OWN hostile family, not the player ship-def's family. Player ships have no
  // silhouette field and fall through to familyFor() as before.
  const enemySil = e.data && e.data.silhouette;
  const family = (enemySil && ENEMY_FAMILY_BUILDERS[enemySil]) ? enemySil : familyFor(defId);
  const isEnemyFamily = !!enemySil && !!ENEMY_FAMILY_BUILDERS[enemySil];
  const recipe = recipeFor(defId);
  const seed = hashId(e.id);
  const tierRow = tierForLoadout(defId, (e.data && e.data.fittings) || [], e.data && e.data.visualTier);
  const hints = Object.assign({ plating: 'smooth', greeble: 0.5 }, tierRow.hints || {});
  const loadout = loadoutProps(e);
  const blinkers = [];

  const hm = hullMaterial(pal, recipe.panelCount);
  const accent = emissiveMaterial(pal.accent, 1.7);
  const cockpit = cockpitGlassMaterial(pal);

  // Two-layer structure for banking: `g` is rolled by the renderer; `outer` holds yaw+position.
  const g = new THREE.Group();
  const outer = new THREE.Group();
  outer.add(g);
  outer.userData.hull = g;
  outer.userData.engines = [];
  outer.userData.tierName = tierRow.name || 'Mk.I';

  const ctx = { g, R, pal, hm, accent, cockpit, vis: { length: 1.4, halfWidth: 0.5, height: 0.35, ...(vis.proportions || {}) }, tier: tierRow, hints, seed, blinkers };

  // 1) build the family hull — player families from FAMILY_BUILDERS, enemy silhouettes from
  //    ENEMY_FAMILY_BUILDERS (graphics spec Workstream D: enemies render as their own hostile forms).
  const builder = isEnemyFamily ? ENEMY_FAMILY_BUILDERS[family] : (FAMILY_BUILDERS[family] || buildMultirole);
  builder(ctx);

  // 2) armor panel shell (tier Mk.II paneled / Mk.III armored): a slightly-larger shell with denser
  //    plating + decals so upgraded ships visibly read as reinforced.
  if (hints.plating === 'paneled' || hints.plating === 'armored') {
    const L = ctx.vis.length, W = ctx.vis.halfWidth, H = ctx.vis.height;
    addDecalShell(g, pal, R, L, H, W * 1.5, hints.plating === 'armored' ? 'greeble' : 'decal');
  }

  // 2b) PROCEDURAL SURFACE DETAIL — scatter greeble clusters (vents, hatches, ribs, pipes, RCS jets,
  //     coolant fins, armor plates, battle scorch) across the deck. The single biggest craftsmanship
  //     lever: deepens every player ship uniformly, density scales with tier. Enemies use their own
  //     bespoke detail in their family builders, so skip them here.
  if (!isEnemyFamily) surfaceDetail(ctx);

  // 2c) PAINT PROFILE — the art direction: grime overlay, chrome env-map, nose-art decal, repair
  //     patches. All driven by the faction personality so the dirty-outlaw vs clean-authority contrast
  //     applies itself to every ship (player = haunted ex-gangster runner; Concord/Meridian = chrome;
  //     pirates = filthy tagged). Enemies get their own faction look too.
  applyPaintProfile(ctx, e);

  // 3) cockpit/bridge glass if the hull authored a position (fighters/scout/multirole use cockpit,
  //    freighters/frigates/capitals use the bridge built into their family hull).
  if (vis.cockpit && family !== 'scout' && family !== 'fighter' && family !== 'miner' && family !== 'multirole') {
    // families that don't already draw their own canopy get a recessed one at the authored seat
    recessedCanopy(ctx, vis.cockpit[0] * R, vis.cockpit[1] * R, vis.cockpit[2] * R, R * 0.3, R * 0.2, R * 0.2);
  }

  // 4) WEAPONS — place a barrel at each authored hardpoint whose slot has a fitted weapon.
  const slots = def && def.slots;
  const hardpoints = vis.hardpoints || [];
  if (slots && hardpoints.length) {
    const weaponFit = (e.data && e.data.fittings) || [];
    const wOffset = slotOffset(slots, 'weapon');
    for (let i = 0; i < hardpoints.length && i < (slots.weapon || []).length; i++) {
      const hp = hardpoints[i];
      const fid = weaponFit[wOffset + i];
      if (!fid) continue; // empty slot → no barrel
      const w = WPN_BY_ID.get(fid);
      const prop = weaponProp(fid, hp.facing || 'front', hp.size || 'S', pal, R, (w && w.tier) || 1);
      prop.position.set((hp.pos[0] || 0) * R, (hp.pos[1] || 0) * R, (hp.pos[2] || 0) * R);
      g.add(prop);
    }
  }

  // 5) ENGINES — nozzles+plumes at authored engineMounts, sized by fitted engine class.
  const mounts = vis.engineMounts || [];
  for (let i = 0; i < mounts.length; i++) {
    const m = mounts[i];
    const en = engineProp(pal, R, m.scaleK || 1, loadout.engineClass || 60);
    en.position.set((m.pos[0] || 0) * R, (m.pos[1] || 0) * R, (m.pos[2] || 0) * R);
    g.add(en);
    outer.userData.engines.push(en);
  }
  // fallback: if no mounts authored, place a pair by recipe (back-compat for defs lacking visuals)
  if (!mounts.length) {
    const n = Math.max(1, Math.min(6, recipe.engineCount || 2));
    for (let i = 0; i < n; i++) {
      const z = n === 1 ? 0 : (-(n - 1) / 2 + i) * 0.24 * 2;
      const en = engineProp(pal, R, 0.9, loadout.engineClass || 60);
      en.position.set(-0.7 * R, 0, z * R); g.add(en); outer.userData.engines.push(en);
    }
  }

  // 6) MINING drill/emitter when a mining module or beam is fitted.
  if (loadout.hasMining && vis.drill) {
    const drill = miningProp(pal, R, loadout.miningTier);
    drill.position.set(vis.drill[0] * R, vis.drill[1] * R, vis.drill[2] * R);
    g.add(drill);
  }

  // 7) SHIELD emitter ring when a shield module is fitted.
  if (loadout.hasShield && vis.proportions) {
    const ring = shieldRingProp(pal, R, ctx.vis.halfWidth, ctx.vis.height, loadout.shieldClass);
    g.add(ring);
  }

  // 8) SENSOR/UTILITY masts — antennas + dishes near the authored sensor anchor, count from loadout.
  if (vis.sensor) {
    const n = Math.max(1, Math.min(5, (loadout.utilityCount || 1) + Math.round((hints.greeble || 0) * 2)));
    const rnd = mulberryLite(seed + 777);
    for (let i = 0; i < n; i++) {
      const ant = new THREE.Mesh(getGeometry('ship:antenna', () => new THREE.CylinderGeometry(0.015, 0.025, 0.45, 4)), hm);
      ant.position.set(vis.sensor[0] * R + (rnd() - 0.5) * R * 0.3, vis.sensor[1] * R + rnd() * R * 0.1, (rnd() - 0.5) * R * 0.3);
      ant.scale.setScalar(R); g.add(ant);
      const tip = makeHalo(pal.accent, R * 0.14); tip.position.set(ant.position.x, vis.sensor[1] * R + R * 0.32, ant.position.z); g.add(tip);
      // a dish on some masts
      if (i % 2 === 0) {
        const dish = new THREE.Mesh(getGeometry('ship:dish', () => new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), hm);
        dish.position.set(vis.sensor[0] * R + (rnd() - 0.5) * R * 0.2, vis.sensor[1] * R + R * 0.18, (rnd() - 0.5) * R * 0.2);
        dish.scale.setScalar(R); g.add(dish);
      }
    }
  }

  // 9) NAV BLINKERS (port green / starboard red / white stern) for real aerospace cueing.
  addNavBlinkers(g, R, ctx.vis.halfWidth, ctx.vis.length, blinkers);

  // 10) self-animation: engine plume throb + fan spin + nav blinker pulse + capital sensor ring
  //     spin + turret-head idle sweep. The driver must live on a renderable child (Three only fires
  //     onBeforeRender on meshes/sprites).
  const engines = outer.userData.engines;
  // collect turret heads (weapon props flagged isTurret) so the driver can sweep them
  const turretHeads = [];
  g.traverse((c) => { if (c.userData && c.userData.isTurret && c.userData.turretHead) turretHeads.push(c.userData.turretHead); });
  const driver = firstMesh(g);
  if (driver) {
    driver.frustumCulled = false;
    const ph = (seed % 100) / 100 * Math.PI * 2;
    driver.onBeforeRender = () => {
      const t = nowSec();
      for (let i = 0; i < engines.length; i++) {
        const b = engines[i].userData.plumeBase;
        const p = engines[i].userData.plume;
        if (p && b) { const s = 1 + 0.18 * Math.sin(t * 9 + ph + i); p.scale.set(b.x * s, b.y, b.z); }
        const fan = engines[i].userData.fan;       // spin the turbine fan — reads as live machinery
        if (fan) fan.rotation.x = t * 18;
      }
      for (let i = 0; i < blinkers.length; i++) {
        const bl = blinkers[i], bd = bl.userData.blink;
        const on = ((((t * (bd.hz || 0.6)) + bd.phase) % 1) + 1) % 1 > 0.5 ? 1 : 0.25;
        bl.material.opacity = 0.3 + 0.7 * on;
      }
      if (ctx.sensorRing) ctx.sensorRing.rotation.z = t * 0.3;
      // turret heads sweep ±35° seeking a target — sells the "auto-tracking" read even when idle
      for (let i = 0; i < turretHeads.length; i++) {
        turretHeads[i].rotation.y = Math.sin(t * 0.8 + i * 1.7) * 0.6;
      }
    };
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
  // colors pushed toward the cyberpunk-noir neon palette: valuable ores glow in saturated magenta/
  // cyan/violet so they read as prizes against the moody backdrop. Common rock stays dull grey to
  // maximize the value contrast (a neon crystal cluster is instantly "that's the good stuff").
  ast_common_rock: { color: 0x4a4540, rough: 0.98, metal: 0.04, emissive: 0x000000, ei: 0,    detail: 1, displace: 0.34, flat: true,  variant: 'rock' },
  ast_metallic:    { color: 0x5a6470, rough: 0.45, metal: 0.7,  emissive: 0x183040, ei: 0.18, detail: 1, displace: 0.30, flat: true,  variant: 'metal', veinColor: '#3fd0ff' },
  ast_icy:         { color: 0x8fd8f0, rough: 0.18, metal: 0.12, emissive: 0x105080, ei: 0.45, detail: 1, displace: 0.28, flat: false, variant: 'ice',  veinColor: '#5fe0ff' },
  ast_crystalline: { color: 0x5a3aa0, rough: 0.22, metal: 0.25, emissive: 0x9030e0, ei: 0.85, detail: 1, displace: 0.45, flat: true,  variant: 'crystal', veinColor: '#c060ff' },
  ast_gas_cloud:   { color: 0x2a5a4a, rough: 1.0,  metal: 0,    emissive: 0x10a060, ei: 0.55, detail: 1, displace: 0.40, flat: true,  variant: 'gas' },
  ast_rare_exotic: { color: 0x282038, rough: 0.6,  metal: 0.5,  emissive: 0x7030d0, ei: 0.8,  detail: 2, displace: 0.32, flat: true,  variant: 'exotic', veinColor: '#ff40c0' },
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
    const halo = makeHalo(def.variant === 'crystal' ? '#c060ff' : '#a050ff', R * 1.9);
    g.add(halo);
    // a few protruding crystal shards for crystalline rocks (more shards = richer cluster)
    if (def.variant === 'crystal') {
      const rnd = mulberryLite(hashId(e.id));
      const shardMat = emissiveMaterial('#c878ff', 1.1);
      for (let i = 0; i < 6; i++) {
        const shard = new THREE.Mesh(getGeometry('ast:shard', () => new THREE.OctahedronGeometry(0.18, 0)), shardMat);
        const a = rnd() * Math.PI * 2, e2 = (rnd() - 0.5) * 1.4;
        shard.position.set(Math.cos(a) * R * 0.7, Math.sin(e2) * R * 0.5, Math.sin(a) * R * 0.7);
        shard.scale.setScalar(R * (0.5 + rnd() * 0.6));
        shard.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        g.add(shard);
      }
    }
  } else if (def.variant === 'ice') {
    g.add(makeHalo('#5fe0ff', R * 1.7));
  } else if (def.variant === 'gas') {
    // gas: small core rock already added; wrap in a soft additive cloud sprite
    const cloud = makeHalo('#56ffa0', R * 3.2);
    cloud.material = cloud.material.clone();
    cloud.material.opacity = 0.45;
    g.add(cloud);
  }

  // GLOWING ORE VEINS — emissive streaks scattered across the surface for valuable ore types, so a
  // rock reads as "mineral-rich" at a glance (neon veins glowing through the rock = the cyberpunk
  // mining fantasy). Each vein is a thin additive capsule sunk slightly into the surface.
  if (def.veinColor) {
    const rnd = mulberryLite(hashId(e.id) ^ 0xbeef);
    const veinMat = emissiveMaterial(def.veinColor, 1.6);
    const veinGeo = getGeometry('ast:vein', () => new THREE.CapsuleGeometry(0.025, 0.5, 3, 5).rotateZ(Math.PI / 2));
    const veinCount = def.variant === 'crystal' || def.variant === 'exotic' ? 5 : 3;
    for (let i = 0; i < veinCount; i++) {
      const vein = new THREE.Mesh(veinGeo, veinMat);
      const a = rnd() * Math.PI * 2, e2 = (rnd() - 0.5) * 1.4;
      vein.position.set(Math.cos(a) * R * 0.85, Math.sin(e2) * R * 0.6, Math.sin(a) * R * 0.85);
      vein.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      vein.scale.setScalar(R * (0.6 + rnd() * 0.8));
      g.add(vein);
    }
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

// Vertical jump gate: a chunky portal you fly THROUGH. The ring plane contains the
// world Y axis + the radial-in direction (toward sector center), so a ship approaching
// from the sector center passes cleanly through the opening. Built from primitives +
// procedural canvas textures only — outer hull ring, inner energy ring, four cardinal
// pylons with greebled strut boxes, a hub behind the portal, and the swirling event
// horizon. Wormholes reuse the same chassis with a hostile palette + unstable swirl.
function buildGate(e, pal) {
  const R = e.radius || 70;
  const isWormhole = !!(e.data && e.data.isWormhole);
  const g = new THREE.Group();
  const blinkers = [];

  // Orient the opening toward sector center. The gate sits at (pos.x,pos.z) on the
  // disc rim, so radial-in = -(pos.x,pos.z). Torus/Circle geometries live in the XY
  // plane (vertical, opening facing +Z); a Y-rotation of atan2(dx,dz) points +Z toward
  // (dx,dz). So yaw = atan2(-pos.x, -pos.z) aims the opening at sector center.
  const px = (e.pos && e.pos.x) || 1;
  const pz = (e.pos && e.pos.z) || 0;
  const yaw = Math.atan2(-px, -pz);
  const orient = new THREE.Group();
  orient.rotation.y = yaw;
  g.add(orient);

  // Textured hull material (cached) — greebled plates like stations, not a bare donut.
  const hullMat = gateHullMaterial(pal, isWormhole);

  // OUTER hull ring — thick torus in the XY plane (vertical). The `orient` group's Y
  // rotation aims the opening at sector center (see yaw above).
  const outerRing = new THREE.Mesh(
    getGeometry('gate:outer', () => new THREE.TorusGeometry(0.9, 0.14, 16, 48)),
    hullMat,
  );
  outerRing.scale.setScalar(R);
  orient.add(outerRing);

  // INNER thinner ring, offset, rotating — the "energy ring" rotating inside the hull.
  const innerRing = new THREE.Mesh(
    getGeometry('gate:inner', () => new THREE.TorusGeometry(0.72, 0.04, 10, 36)),
    emissiveMaterial(isWormhole ? '#b14dff' : pal.emissive, 1.4),
  );
  innerRing.scale.setScalar(R);
  orient.add(innerRing);

  // EVENT HORIZON — swirling additive disc filling the opening.
  const portalMat = getMaterial(isWormhole ? 'gate:portal:wh' : 'gate:portal', () => {
    const tex = getTexture(isWormhole ? 'grad:portal:wh' : 'grad:portal', () => makeGradientTexture({
      type: 'radial',
      stops: isWormhole
        ? [[0, '#f0c0ff'], [0.35, '#9030ff'], [0.7, '#3a0a4a'], [1, '#08000f']]
        : [[0, '#bff4ff'], [0.4, '#39d0ff'], [1, '#0a1830']],
    }));
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: isWormhole ? 0.7 : 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
  });
  const portal = new THREE.Mesh(
    getGeometry('gate:disc', () => new THREE.CircleGeometry(0.78, 48)),
    portalMat,
  );
  portal.scale.setScalar(R);
  orient.add(portal);

  // FOUR CARDINAL PYLONS — strut boxes anchoring the ring, "chunked-on" structure.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // diagonals look heavier than cardinals
    const pylon = new THREE.Mesh(
      getGeometry('gate:pylon', () => new THREE.BoxGeometry(0.14, 0.34, 0.14)),
      hullMat,
    );
    const cx = Math.cos(a) * 0.9, cy = Math.sin(a) * 0.9;
    pylon.position.set(cx * R, cy * R, 0);
    pylon.scale.setScalar(R);
    pylon.rotation.z = a;
    orient.add(pylon);

    // greebled cap box on each pylon for surface detail
    const cap = new THREE.Mesh(
      getGeometry('gate:pyloncap', () => new THREE.BoxGeometry(0.22, 0.1, 0.22)),
      hullMat,
    );
    cap.position.set(cx * R, cy * R, R * 0.06);
    cap.scale.setScalar(R);
    cap.rotation.z = a;
    orient.add(cap);
  }

  // HUB — a chunky cylinder behind the portal, reads as the gate's power core.
  const hub = new THREE.Mesh(
    getGeometry('gate:hub', () => new THREE.CylinderGeometry(0.16, 0.2, 0.34, 10)),
    hullMat,
  );
  hub.rotation.x = Math.PI / 2; hub.position.z = -R * 0.28; hub.scale.setScalar(R);
  orient.add(hub);
  const hubGlow = new THREE.Mesh(
    getGeometry('gate:hubglow', () => new THREE.CircleGeometry(0.14, 20)),
    emissiveMaterial(isWormhole ? '#d090ff' : pal.emissive, 2.2),
  );
  hubGlow.position.z = -R * 0.1; hubGlow.scale.setScalar(R);
  orient.add(hubGlow);

  // NAV LIGHTS — 6 blinkers around the rim, alternating accent/green.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = blinkerSprite(i % 2 ? pal.accent : '#5fffa0', R * 0.16, i * 0.31, blinkers);
    b.position.set(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, R * 0.08);
    orient.add(b);
  }

  // big soft halo behind the portal for bloom pickup
  orient.add(makeHalo(isWormhole ? '#a040ff' : pal.emissive, R * 2.2));

  // Animate: spin inner ring, swirl portal, pulse blinkers.
  animateGate(outerRing, innerRing, portal, hubGlow, blinkers, R);
  // Gates carry the faction's paint profile too (grimy frontier jump-rings vs pristine chrome
  // core gates) so the world reads consistently across stations and travel infrastructure.
  applyStructureProfile(g, pal, R, hashId(e.id));
  g.userData.kind = 'station';
  return g;
}

// Gate hull material: greebled plate texture (cached), tinted toward the faction palette.
// Wormholes get a darker, more violent base.
function gateHullMaterial(pal, isWormhole) {
  const base = isWormhole ? '#1a0a22' : pal.hull;
  const accent = isWormhole ? '#7a2aaa' : pal.accent;
  const key = `gatehull:${base}:${accent}`;
  return getMaterial(key, () => {
    const seed = hashId(base + accent) & 0xffff;
    const greeble = getTexture(`greeble:${base}:${accent}`, () =>
      makeGreebleTexture({ size: 256, seed, base, plate: shade(base, 1.25), line: shade(base, 0.35), accent, density: 1.1 }));
    return new THREE.MeshStandardMaterial({ map: greeble, roughness: 0.72, metalness: 0.6, color: 0xffffff });
  });
}

function animateGate(host, innerRing, portal, hubGlow, blinkers, R) {
  if (!host) return;
  host.frustumCulled = false;
  host.onBeforeRender = () => {
    const t = nowSec();
    if (innerRing) innerRing.rotation.z = t * 0.5;
    if (portal) portal.rotation.z = -t * 0.7;
    if (hubGlow) hubGlow.scale.setScalar(R * (1 + 0.06 * Math.sin(t * 2.0)));
    for (let i = 0; i < blinkers.length; i++) {
      const b = blinkers[i], bl = b.userData.blink;
      const on = (((t * bl.hz + bl.phase) % 1) + 1) % 1 > 0.5 ? 1 : 0.25;
      b.material.opacity = 0.3 + 0.7 * on;
    }
  };
}

function buildStation(e) {
  const R = e.radius || 40;
  const pal = resolvePalette(e);
  const isGate = e.data && (e.data.isGate || e.data.isWormhole);
  if (isGate) return buildGate(e, pal);
  const m = stationMaterial(pal);
  const g = new THREE.Group();
  const blinkers = [];

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
  // PAINT PROFILE for stations — the same dirty-vs-clean art direction as ships: grimy frontier
  // outposts (grime + patches), pristine chrome core stations (env-map foil + insignia). Reads the
  // faction personality via resolvePalette's profile, exactly like ships.
  applyStructureProfile(g, pal, R, hashId(e.id));
  animateStation(core, blinkers, r1, null);
  g.userData.kind = 'station';
  return g;
}

// PAINT PROFILE for large structures (stations, gates). Same dirty-outlaw vs clean-authority lever
// as applyPaintProfile for ships, but scaled for structure dimensions (a big grime/chrome shell
// around the whole station + a large faction insignia banner). Independent of the ship helper so
// station geometry/scale assumptions don't leak into ship code.
function applyStructureProfile(g, pal, R, seed) {
  const profile = (pal && pal.profile) || null;
  if (!profile) return;
  const rnd = mulberryLite(seed ^ 0x517);
  // --- CHROME: authority stations get a reflective foil shell (mirrors the nebula via env-map)
  if (profile.chrome > 0.3) {
    const foilMat = getMaterial(`chrome:struct:${q(profile.chrome)}`, () => new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 1.0, roughness: 0.14 - profile.chrome * 0.08,
      envMap: SHIP_ENV_MAP, envMapIntensity: profile.chrome,
      transparent: true, opacity: 0.4 + profile.chrome * 0.3, depthWrite: false,
    }));
    const foil = new THREE.Mesh(getGeometry('stat:chromeshell', () => new THREE.SphereGeometry(1, 16, 12)), foilMat);
    foil.scale.setScalar(R * 1.05); g.add(foil);
  }
  // --- GRIME: grimy outposts/stations get weathered overlays. A few large rust/soot blooms draped
  //     over the structure via a transparent sphere shell carrying the grime texture.
  if (profile.grime > 0.2) {
    const grimeMat = getMaterial(`grime:struct:${q(profile.grime)}:${pal.hull}`, () => {
      const tex = getTexture(`grime:struct:${pal.hull}:${q(profile.grime)}`, () =>
        makeGrimeTexture({ size: 256, seed: (seed ^ 0x51) & 0xffff, intensity: profile.grime }));
      return new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff, roughness: 0.9, metalness: 0.0 });
    });
    const grime = new THREE.Mesh(getGeometry('stat:grimeshell', () => new THREE.SphereGeometry(1, 16, 12)), grimeMat);
    grime.scale.setScalar(R * 1.03); g.add(grime);
  }
  // --- FACTION INSIGNIA: a large glowing faction banner panel on the station flank — reads the
  //     faction identity at a glance (authority crest, punk tag, or bomber insignia).
  if (profile.noseArt) {
    const naMat = getMaterial(`nose:struct:${profile.noseArt}:${pal.accent}`, () => {
      const tex = getTexture(`nose:struct:${profile.noseArt}:${pal.accent}`, () =>
        makeNoseArtTexture({ size: 256, seed: (seed ^ 0x99) & 0xffff, style: profile.noseArt, accent: pal.accent }));
      return new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false, color: 0xffffff, roughness: 0.6, metalness: 0.1,
        emissive: new THREE.Color(pal.emissive), emissiveIntensity: 0.08, side: THREE.DoubleSide,
      });
    });
    const banner = new THREE.Mesh(getGeometry('stat:banner', () => new THREE.PlaneGeometry(0.6, 0.4)), naMat);
    banner.position.set(0, R * 0.1, R * 0.92); banner.scale.setScalar(R); g.add(banner);
  }
  // --- ATMOSPHERIC HAZE: a soft volumetric-feeling glow halo around the station, tinted to the
  //     faction emissive — sells "this place is alive / pressurized / lit from within". Pirate
  //     stations get a sickly red haze; core stations a clean blue.
  const hazeMat = additiveGlowMaterial(pal.emissive, 0.12);
  const haze = new THREE.Mesh(getGeometry('stat:haze', () => new THREE.SphereGeometry(1, 14, 10)), hazeMat);
  haze.scale.setScalar(R * (1.25 + (profile.grime || 0) * 0.2)); g.add(haze);
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
  // Hot neon bolt colors — pushed more saturated than the originals so energy weapons read as plasma
  // through bloom. Each team gets a primary + a chromatic fringe (the complementary hue) so bolts
  // shimmer with a two-tone neon edge, the signature cyberpunk energy-weapon look.
  const color = e.team === 1 ? '#ff3b6a' : (e.team === 0 ? '#5ff0ff' : '#ffd24a');
  const fringe = e.team === 1 ? '#ff5fe0' : (e.team === 0 ? '#5f80ff' : '#ff9030');
  const g = new THREE.Group();
  if (isMissile) {
    const body = new THREE.Mesh(getGeometry('proj:mbody', () => new THREE.CylinderGeometry(0.4, 0.4, 2.0, 6).rotateZ(Math.PI / 2)),
      getMaterial('proj:mmat', () => new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.4 })));
    body.scale.setScalar(R); g.add(body);
    const tip = new THREE.Mesh(getGeometry('proj:mtip', () => new THREE.ConeGeometry(0.4, 0.8, 6).rotateZ(-Math.PI / 2)), basicGlowMaterial(color));
    tip.position.x = R * 1.4; tip.scale.setScalar(R); g.add(tip);
    const flame = makeHalo(color, R * 2.2); flame.position.x = -R * 1.2; g.add(flame);
    // neon smoke trail fringe behind the missile
    g.add(makeHalo(fringe, R * 1.4));
  } else {
    // --- Determine weapon variant from entity data ---
    const wid = (e.data && e.data.weaponId) || '';
    const dtype = (e.data && e.data.damageType) || 'energy';
    const isRailgun    = wid.includes('railgun');
    const isSiege      = wid.includes('siege');
    const isFlak       = wid.includes('flak');
    const isPlasma     = dtype === 'thermal';
    const isAutocannon = !isRailgun && !isSiege && !isFlak && dtype === 'kinetic';
    // isPulseLaser is the default/fallback (energy bolts)

    if (isSiege) {
      // SIEGE LANCE — massive, very elongated bright streak. Brightest projectile in the game.
      const core = new THREE.Mesh(
        getGeometry('proj:siege:core', () => new THREE.CapsuleGeometry(0.38, 9.0, 4, 8).rotateZ(Math.PI / 2)),
        basicGlowMaterial('#ffffff'),
      );
      core.scale.setScalar(R); g.add(core);
      const glow = new THREE.Mesh(
        getGeometry('proj:siege:glow', () => new THREE.CapsuleGeometry(0.80, 10.0, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial(color, 0.95),
      );
      glow.scale.setScalar(R); g.add(glow);
      const fringeMesh = new THREE.Mesh(
        getGeometry('proj:siege:fringe', () => new THREE.CapsuleGeometry(0.60, 9.5, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial(fringe, 0.6),
      );
      fringeMesh.scale.setScalar(R); g.add(fringeMesh);
      // Extra-large leading halo and trailing bloom
      const halo = makeHalo(color, R * 7.0); halo.position.x = R * 2.0; g.add(halo);
      g.add(makeHalo('#ffffff', R * 4.5));
      g.add(makeHalo(fringe, R * 3.5));
    } else if (isRailgun) {
      // RAILGUN — very long, thin white streak with heavy bloom. Fastest projectile.
      const core = new THREE.Mesh(
        getGeometry('proj:rail:core', () => new THREE.CapsuleGeometry(0.14, 8.0, 4, 8).rotateZ(Math.PI / 2)),
        basicGlowMaterial('#ffffff'),
      );
      core.scale.setScalar(R); g.add(core);
      const glow = new THREE.Mesh(
        getGeometry('proj:rail:glow', () => new THREE.CapsuleGeometry(0.36, 8.6, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial('#ccddff', 0.9),
      );
      glow.scale.setScalar(R); g.add(glow);
      // Bright white leading-tip halo for the signature railgun flash
      const halo = makeHalo('#ffffff', R * 5.0); halo.position.x = R * 2.4; g.add(halo);
      g.add(makeHalo(color, R * 2.8));
    } else if (isPlasma) {
      // PLASMA CANNON — larger, rounder bolt with a big glow sphere. Orange/hot tinted.
      // Override colors: plasma always has an orange-hot tint blended with team color.
      const plasmaCore = e.team === 1 ? '#ff6040' : (e.team === 0 ? '#80ffcc' : '#ffcc44');
      const plasmaGlow = e.team === 1 ? '#ff4020' : (e.team === 0 ? '#40ffa0' : '#ffaa22');
      const core = new THREE.Mesh(
        getGeometry('proj:plasma:core', () => new THREE.SphereGeometry(0.55, 10, 8)),
        basicGlowMaterial('#ffffee'),
      );
      core.scale.setScalar(R); g.add(core);
      const glow = new THREE.Mesh(
        getGeometry('proj:plasma:glow', () => new THREE.SphereGeometry(1.0, 10, 8)),
        additiveGlowMaterial(plasmaCore, 0.8),
      );
      glow.scale.setScalar(R); g.add(glow);
      const outer = new THREE.Mesh(
        getGeometry('proj:plasma:outer', () => new THREE.SphereGeometry(1.5, 10, 8)),
        additiveGlowMaterial(plasmaGlow, 0.35),
      );
      outer.scale.setScalar(R); g.add(outer);
      // Large diffuse halo for the roiling plasma look
      g.add(makeHalo(plasmaCore, R * 5.5));
      g.add(makeHalo(plasmaGlow, R * 3.5));
    } else if (isFlak) {
      // FLAK / PD — tiny, fast dots. Very small projectiles with minimal glow.
      const core = new THREE.Mesh(
        getGeometry('proj:flak:core', () => new THREE.SphereGeometry(0.18, 6, 4)),
        basicGlowMaterial(color),
      );
      core.scale.setScalar(R); g.add(core);
      const glow = new THREE.Mesh(
        getGeometry('proj:flak:glow', () => new THREE.SphereGeometry(0.30, 6, 4)),
        additiveGlowMaterial(color, 0.5),
      );
      glow.scale.setScalar(R); g.add(glow);
      // Small subtle halo — just enough to see
      g.add(makeHalo(color, R * 1.4));
    } else if (isAutocannon) {
      // AUTOCANNON — shorter, fatter bolt. More solid/opaque, like a physical slug.
      const core = new THREE.Mesh(
        getGeometry('proj:auto:core', () => new THREE.CapsuleGeometry(0.32, 1.8, 4, 8).rotateZ(Math.PI / 2)),
        basicGlowMaterial('#eeddbb'),
      );
      core.scale.setScalar(R); g.add(core);
      const shell = new THREE.Mesh(
        getGeometry('proj:auto:shell', () => new THREE.CapsuleGeometry(0.44, 2.2, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial(color, 0.6),
      );
      shell.scale.setScalar(R); g.add(shell);
      // Compact halo — less bloom than energy weapons
      const halo = makeHalo(color, R * 2.2); halo.position.x = R * 0.5; g.add(halo);
    } else {
      // PULSE LASER (default) — thin, elongated bright bolt. Classic energy-weapon look,
      // thinner and longer than the old universal bolt.
      const core = new THREE.Mesh(
        getGeometry('proj:pulse:core', () => new THREE.CapsuleGeometry(0.18, 5.2, 4, 8).rotateZ(Math.PI / 2)),
        basicGlowMaterial('#ffffff'),
      );
      core.scale.setScalar(R); g.add(core);
      const glow = new THREE.Mesh(
        getGeometry('proj:pulse:glow', () => new THREE.CapsuleGeometry(0.44, 5.8, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial(color, 0.85),
      );
      glow.scale.setScalar(R); g.add(glow);
      const fringeMesh = new THREE.Mesh(
        getGeometry('proj:pulse:fringe', () => new THREE.CapsuleGeometry(0.32, 5.5, 4, 8).rotateZ(Math.PI / 2)),
        additiveGlowMaterial(fringe, 0.45),
      );
      fringeMesh.scale.setScalar(R); g.add(fringeMesh);
      const halo = makeHalo(color, R * 3.5); halo.position.x = R * 1.4; g.add(halo);
      g.add(makeHalo(fringe, R * 2.0));
    }
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
          case 'ship': return optimizeStaticBatches(buildShipMesh(e, resolvePalette(e)));
          case 'asteroid': return buildAsteroid(e);
          case 'station': return optimizeStaticBatches(buildStation(e));
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
