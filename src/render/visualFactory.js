// Builds Three.js meshes for entities from primitives, deterministic procedural maps, and visual
// libraries that were fully decoded before flight admission. Contract: createVisualFactory() ->
// { build(entity) }
// where build(entity) returns a THREE.Object3D whose +X axis is the ship's nose (the renderer
// sets mesh.rotation.y = -entity.rot, so +X must point forward). Build must NEVER publish a
// substitute identity: unsupported or failed visuals return an invisible diagnostic root.
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
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getReadyRockSurfaceTextures } from './rockSurfaceLibrary.js';
import {
  COMMON_ROCK_MATERIAL_ROLES,
  COMMON_ROCK_UV_TRANSFORMS,
  COMMON_ROCK_VARIANTS,
  displacementScalar as geologyDisplacement,
  silhouetteRadius as geologySilhouetteRadius,
  surfaceResponse as geologySurfaceResponse,
} from './objectSpaceGeology.js';
import { configurePlanarAdditiveMaterial } from './planarAdditivePolicy.js';
import { buildPlanetSiteVisual } from './planetSiteVisual.js'; // PQ-013 colossal planet-site body
import { freezeStaticChildMatrices } from './staticChildMatrices.js';
import {
  makeNoiseTexture, makeGreebleTexture, makeGradientTexture, makeHullPanelTexture,
  makeHullNormalMap, makeGreebleDetailTexture, makeDecalSheet,
  makeGrimeTexture, makePatchTexture, makeNoseArtTexture,
} from './canvasTextures.js';
import { FACTION_PALETTES, SHIP_RECIPES, paintProfileFor, PLAYER_NOSE_ART } from '../data/palettes.js';
import { paletteWithShipAppearance } from '../core/shipAppearance.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { configureMaterialLibrary } from './materialLibrary.js';
import { createEnergyMaterial } from './energy/energyMaterials.js';
import * as kit from './ships/shipKit.js';
import { applyProjectedDetailLod, attachStationHlod, isFarDetailSurface } from './hlod.js';
import { attachLodState } from './lod.js';
import { interactionProfileForEntity } from '../data/entityInteractionProfiles.js';
import { resolveWeaponPresentationFamily } from './vfxProfiles.js';

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
  // paintProfileFor returns shared faction recipe data. Entity wear is presentation state, so keep
  // it local instead of leaking one ship's wear into every later ship from the same manufacturer.
  const profile = { ...paintProfileFor(personality) };
  let colors;
  if (e.team === 0) colors = PLAYER_PAL;
  else if (e.team === 1) colors = HOSTILE_PAL;
  else {
    const fp = e.factionId && FACTION_PALETTES[e.factionId];
    colors = fp
      ? { hull: fp.hull, accent: fp.accent || fp.primary, emissive: fp.emissive || fp.primary, thruster: fp.thruster || fp.accent }
      : NEUTRAL_PAL;
  }
  const appearance = paletteWithShipAppearance(e, colors);
  if (Number.isFinite(Number(appearance.wear))) profile.grime = appearance.wear;
  return Object.assign({}, appearance, { profile, isPlayer: e.team === 0 });
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

export function optimizeStaticBatchesForRoot(root) {
  optimizeStaticBatches(root);
  mergeRigidOpaqueAcrossRoot(root);
  return root;
}

/**
 * Merge rigid opaque leaves across the whole root by material, not just siblings.
 * A unique station like Helios has ~12 materials and 100+ plates under many parents;
 * per-parent merge cannot collapse that. Far-detail (greeble/decal) stays in its own
 * bucket so projected HLOD can still hide it.
 */
export function mergeRigidOpaqueAcrossRoot(root) {
  if (!root) return { groups: 0, mergedMeshes: 0, sourceMeshes: 0 };
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((obj) => {
    if (!isBatchCandidate(obj)) return;
    if (obj.userData && obj.userData.spacefaceSocket) return;
    const far = isFarDetailSurface(obj) ? 'far' : 'body';
    const key = `${far}|${batchKey(obj, root)}`;
    let rec = groups.get(key);
    if (!rec) {
      rec = {
        parent: root,
        material: obj.material,
        renderOrder: obj.renderOrder || 0,
        far,
        meshes: [],
        vertexCount: 0,
      };
      groups.set(key, rec);
    }
    rec.meshes.push(obj);
    const pos = obj.geometry.getAttribute('position');
    rec.vertexCount += obj.geometry.index ? obj.geometry.index.count : (pos ? pos.count : 0);
  });

  let mergedMeshes = 0;
  let sourceMeshes = 0;
  for (const rec of groups.values()) {
    if (rec.meshes.length < BATCH_MIN_MESHES || rec.vertexCount <= 0) continue;
    let mergedMesh;
    try {
      const geometry = mergeMeshGeometries(rec);
      if (!geometry) continue;
      mergedMesh = new THREE.Mesh(geometry, rec.material);
      mergedMesh.name = rec.far === 'far' ? 'sf-static-merge-far' : 'sf-static-merge-body';
      mergedMesh.renderOrder = rec.renderOrder;
      mergedMesh.userData.staticMerge = true;
      mergedMesh.userData.spacefaceTags = rec.far === 'far' ? { greeble: true } : {};
      if (rec.meshes.some((m) => m.castShadow)) mergedMesh.castShadow = true;
      if (rec.meshes.some((m) => m.receiveShadow)) mergedMesh.receiveShadow = true;
      rec.parent.add(mergedMesh);
      for (const mesh of rec.meshes) {
        if (mesh.parent) mesh.parent.remove(mesh);
      }
      mergedMeshes += 1;
      sourceMeshes += rec.meshes.length;
    } catch (_) {
      if (mergedMesh && mergedMesh.parent) mergedMesh.parent.remove(mergedMesh);
      if (mergedMesh && mergedMesh.geometry) mergedMesh.geometry.dispose();
    }
  }
  return { groups: groups.size, mergedMeshes, sourceMeshes };
}

function freezeStaticPresentation(root) {
  freezeStaticChildMatrices(optimizeStaticBatchesForRoot(root));
  return root;
}

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
      if (rec.meshes.some((mesh) => isFarDetailSurface(mesh))) {
        mergedMesh.userData.spacefaceTags = { greeble: true };
      }
      // GR-2: preserve shadow intent across the merge. If ANY source mesh was a shadow caster or
      // receiver, the merged mesh inherits it — otherwise optimizeStaticBatches would silently strip
      // the per-mesh receiveShadow/castShadow flags set by the builders (station pads, asteroid rock).
      if (rec.meshes.some((m) => m.castShadow)) mergedMesh.castShadow = true;
      if (rec.meshes.some((m) => m.receiveShadow)) mergedMesh.receiveShadow = true;
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
  if (obj.userData && obj.userData.staticBatch === false) return false;
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
  const far = isFarDetailSurface(obj) ? 'far' : 'body';
  return `${parent.uuid}|${far}|${obj.material.uuid}|${obj.renderOrder || 0}|${idx}|${attrs}`;
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

// Hot lamp as a fixture: metal cup + emissive lens. Bloom comes from the surface, not a sprite.
function lampFixture(color, scale, intensity = 3.2) {
  const root = new THREE.Group();
  const cup = new THREE.Mesh(
    getGeometry('lamp:cup', () => new THREE.CylinderGeometry(0.38, 0.52, 0.28, 8)),
    getMaterial('lamp:cup', () => new THREE.MeshStandardMaterial({
      color: 0x16191e, roughness: 0.4, metalness: 0.82,
    })),
  );
  const lens = new THREE.Mesh(
    getGeometry('lamp:lens', () => new THREE.SphereGeometry(0.34, 12, 10)),
    emissiveMaterial(color, intensity),
  );
  lens.position.y = 0.16;
  root.add(cup, lens);
  root.scale.setScalar(scale);
  return root;
}

// --- Energy-shader bolt material (the modern replacement for basic-material + sprite-halo bolts) ---
// Reuses the HDR energy-volume shader (energyMaterials.js) as a sibling of the thruster plume and
// massline tether: hot core + fbm turbulence scroll along local +X + fresnel rim, writing radiance
// >1.0 with toneMapped:false so the bloom pipeline picks it up SELECTIVELY (per the taste constitution
// §3: "Bloom is selective — raise per-material emissiveIntensity, never the global bloom"). This is the
// professional 2026 energy-weapon primitive, not a flat additive sprite.
//
// Caching: keyed by `bolt:<color>:<variant>` so each team×variant pair gets its own tuned material
// instance (variants differ in geometry AND in shader params like flowSpeed/intensity). Three.js caches
// the GPU program by shader source, not material instance, so all 18 team×variant materials share ONE
// compiled program — the per-instance cost is just the uniform block, not a shader compile.
function boltMaterial(color, fringe, variant) {
  return getMaterial(`bolt:${color}:${variant}`, () => {
    const mat = createEnergyMaterial({
      name: `SpaceFaceBolt:${variant}:${color}`,
      colorA: color,
      colorB: fringe,
      // Bolts are smaller and faster-moving than plumes: higher intensity to read through bloom,
      // tighter noise scale for a crackling energy edge rather than a roiling flame.
      intensity: 6.0,
      opacity: 0.95,
      fresnelPower: 2.4,
      noiseScale: 2.6,
      flowSpeed: 9.0,
      pulse: 1.0,
      core: 0.62,
      edgeNoise: 0.55,
      // No depth-soft intersection: bolts are additive, short-lived, and read fine without it.
      depthTest: true,
    });
    return mat;
  });
}

// Build one energy-shader bolt mesh from a cached geometry + team material, hooking onBeforeRender to
// advance the shared material's uTime clock via nowSec() (the established self-animation pattern — see
// the comment at nowSec()). Because the material is shared per team×variant, every bolt redundantly
// writes the same uTime value; that is harmless and idempotent.
function boltMesh(geometryKey, geometryFactory, color, fringe, variant, scale) {
  const mesh = new THREE.Mesh(getGeometry(geometryKey, geometryFactory), boltMaterial(color, fringe, variant));
  mesh.scale.setScalar(scale);
  mesh.onBeforeRender = () => {
    const u = mesh.material.uniforms;
    if (u && u.uTime) u.uTime.value = nowSec();
  };
  return mesh;
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
  nozzle.userData.spacefaceTags = { vfxRole: 'driveNozzleGlow' };
  g.add(nozzle);
  // tight exhaust plume: a short, fat cone trailing back (-X) — a flame, not a needle. apex points
  // -X (rear) via rotateZ(+90deg). A brighter inner cone gives a white-hot core.
  const plume = new THREE.Mesh(
    getGeometry('eng:plume', () => new THREE.ConeGeometry(0.34, 0.95, 16).rotateZ(Math.PI / 2)),
    plumeMaterial(pal.thruster),
  );
  plume.scale.set(scale * 0.95, scale * 0.74, scale * 0.74);
  plume.position.x = -0.72 * scale;
  plume.userData.spacefaceTags = { vfxRole: 'drivePlume' };
  g.add(plume);
  g.userData.plume = plume;
  const core = new THREE.Mesh(
    getGeometry('eng:plumecore', () => new THREE.ConeGeometry(0.18, 0.62, 14).rotateZ(Math.PI / 2)),
    plumeMaterial('#eaffff'),
  );
  core.scale.set(scale * 0.9, scale * 0.6, scale * 0.6);
  core.position.x = -0.52 * scale;
  core.userData.spacefaceTags = { vfxRole: 'driveCore' };
  g.add(core);
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
// graph is what the renderer disposes on rebuild. Build never publishes a placeholder on failure.
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
  const port = new THREE.Mesh(
    getGeometry('wpn:port', () => new THREE.CylinderGeometry(0.07, 0.05, 0.09, 10).rotateZ(Math.PI / 2)),
    emissiveMaterial(pal.accent, 2.8),
  );
  port.position.x = 0.6 * s;
  port.scale.setScalar(s);
  g.add(port);
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
  nozzle.position.x = -0.34 * s; nozzle.scale.set(s, s, s);
  nozzle.userData.spacefaceTags = { vfxRole: 'driveNozzleGlow' };
  g.add(nozzle);
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
  g.userData.plumePose = flame.userData.plume ? kit.captureDrivePose(flame.userData.plume) : null;
  g.userData.plumeBase = flame.userData.plume ? { x: flame.userData.plume.scale.x, y: flame.userData.plume.scale.y, z: flame.userData.plume.scale.z } : null;
  g.userData.trailSocketOffset = new THREE.Vector3(-0.55 * s, 0, 0);
  return g;
}

function addShipSocket(parent, name, position, role, forward = [1, 0, 0]) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(position[0], position[1], position[2]);
  socket.userData = { spacefaceSocket: true, role, forward };
  parent.add(socket);
  return socket;
}

function addEngineTrailSocket(parent, engine, index) {
  if (!parent || !engine) return null;
  const offset = engine.userData && engine.userData.trailSocketOffset;
  const name = index === 0 ? 'SOCKET_Trail_Main' : `SOCKET_Trail_${index}`;
  return addShipSocket(parent, name, [
    engine.position.x + (offset ? offset.x : 0),
    engine.position.y + (offset ? offset.y : 0),
    engine.position.z + (offset ? offset.z : 0),
  ], 'vfx', [-1, 0, 0]);
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
  const gr = blinkerFixture('#3dff7a', R * 0.055, 0.0, blinkers); gr.position.set(xMid, R * 0.05, z); g.add(gr);
  const rd = blinkerFixture('#ff4040', R * 0.055, 0.5, blinkers); rd.position.set(xMid, R * 0.05, -z); g.add(rd);
  const stern = blinkerFixture('#eaf2ff', R * 0.048, 0.25, blinkers); stern.position.set(-R * length * 0.48, R * 0.06, 0); g.add(stern);
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
  // Geometry is authored in normalized hull space and the mesh is scaled by R below. Multiplying
  // the tube by R here as well made the Leviathan's eight-sided ring render as an opaque cyan
  // sphere-like mass that hid the ship. Rotation alone does not remove that geometry; any later
  // disappearance is an independent authored-preview transition and is traced at the mount boundary.
  const ring = new THREE.Mesh(
    getGeometry(`cap:ring:${q(W)}`, () => new THREE.TorusGeometry(W * 0.6, Math.max(0.012, W * 0.018), 8, 48)),
    getMaterial(`cap:ring-mat:${pal.accent}`, () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.accent),
      emissive: new THREE.Color(pal.accent),
      emissiveIntensity: 0.78,
      metalness: 0.18,
      roughness: 0.42,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })),
  );
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
    const tip = lampFixture('#ff4a3a', R * 0.055, 3.6);
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
    const glow = lampFixture('#3aa0ff', R * 0.05, 3.2);
    glow.position.set(dx * W * R * 1.0, 0, -L * R * 0.1); g.add(glow);
  }
  for (const dx of [-1, 1]) {
    const light = lampFixture('#3aa0ff', R * 0.038, 2.8);
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

const MIRRORJAW_VISUAL_PHASES = Object.freeze({
  reflective_ram: Object.freeze({
    jawColor: 0xc5d2d8, jawEmissive: 0x172a31, jawEmissiveIntensity: 0.2,
    jawMetalness: 0.94, jawRoughness: 0.12, jawClearcoat: 0.28,
    reactorColor: 0x3b1711, reactorEmissive: 0xff3f16, reactorEmissiveIntensity: 0.9,
  }),
  absorbent_screen: Object.freeze({
    jawColor: 0x232b2e, jawEmissive: 0x080b0c, jawEmissiveIntensity: 0.04,
    jawMetalness: 0.32, jawRoughness: 0.88, jawClearcoat: 0.02,
    reactorColor: 0x4b1d13, reactorEmissive: 0xff4a16, reactorEmissiveIntensity: 1.45,
  }),
  unmoored_reactor: Object.freeze({
    jawColor: 0x59656a, jawEmissive: 0x121719, jawEmissiveIntensity: 0.08,
    jawMetalness: 0.58, jawRoughness: 0.56, jawClearcoat: 0.08,
    reactorColor: 0xc04b1d, reactorEmissive: 0xff3b0b, reactorEmissiveIntensity: 2.9,
  }),
});

// A small octagonal-section prism gives each mandible a real tapered silhouette.  The rear root is
// broad enough to read as a forged load-bearing part; the forward section narrows to a blunt point
// so the two leaves read as a split jaw instead of two scaled rectangular blocks.  The geometry is
// authored in the dreadnought's +Z-forward frame and is rotated into gameplay +X by its owner.
function mirrorjawMandibleGeometry() {
  return getGeometry('mirrorjaw:mandible-tapered-prism-v2', () => {
    const sections = [
      { z: -0.42, hx: 0.14, hy: 0.085, bevel: 0.018 },
      { z: 0.16, hx: 0.12, hy: 0.076, bevel: 0.016 },
      { z: 0.52, hx: 0.032, hy: 0.030, bevel: 0.010 },
    ];
    const vertices = [];
    const indices = [];
    const ringPoints = (section) => {
      const b = Math.min(section.bevel, section.hx * 0.48, section.hy * 0.48);
      return [
        [-section.hx + b, -section.hy], [section.hx - b, -section.hy],
        [section.hx, -section.hy + b], [section.hx, section.hy - b],
        [section.hx - b, section.hy], [-section.hx + b, section.hy],
        [-section.hx, section.hy - b], [-section.hx, -section.hy + b],
      ];
    };
    for (const section of sections) {
      for (const [x, y] of ringPoints(section)) vertices.push(x, y, section.z);
    }
    for (let section = 0; section < sections.length - 1; section++) {
      const start = section * 8;
      const next = (section + 1) * 8;
      for (let i = 0; i < 8; i++) {
        const a = start + i;
        const b = start + ((i + 1) % 8);
        const c = next + ((i + 1) % 8);
        const d = next + i;
        indices.push(a, b, c, a, c, d);
      }
    }
    const backCenter = vertices.length / 3;
    vertices.push(0, 0, sections[0].z);
    const frontCenter = vertices.length / 3;
    vertices.push(0, 0, sections[sections.length - 1].z);
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      // Reverse winding on the rear cap so both caps face outwards.
      indices.push(backCenter, next, i);
      const front = (sections.length - 1) * 8;
      indices.push(frontCenter, front + i, front + next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = 'MirrorjawTaperedMandiblePrism';
    return geometry;
  });
}

function decorateMirrorjawForeman(ctx) {
  const { g, R, vis } = ctx;
  const L = vis.length || 2.6;
  const jawMat = getMaterial('mirrorjaw:face', () => new THREE.MeshPhysicalMaterial({
    color: 0xc5d2d8,
    emissive: 0x172a31,
    emissiveIntensity: 0.2,
    metalness: 0.94,
    roughness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.2,
    envMap: SHIP_ENV_MAP,
    envMapIntensity: 1.3,
  })).clone();
  jawMat.name = 'SF_MirrorjawReflectiveFace';
  const pistonMat = getMaterial('mirrorjaw:piston', () => new THREE.MeshStandardMaterial({
    color: 0x202833,
    metalness: 0.76,
    roughness: 0.34,
  }));
  const reactorMat = getMaterial('mirrorjaw:reactor', () => new THREE.MeshStandardMaterial({
    color: 0x3b1711,
    emissive: 0xff3f16,
    emissiveIntensity: 0.9,
    metalness: 0.4,
    roughness: 0.25,
  })).clone();
  reactorMat.name = 'SF_MirrorjawReactor';
  const reactorCageMat = getMaterial('mirrorjaw:reactor-cage', () => new THREE.MeshStandardMaterial({
    color: 0x25323a,
    metalness: 0.86,
    roughness: 0.34,
  }));

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'port' : 'starboard';
    const jaw = new THREE.Group();
    jaw.name = `mirrorjaw-jaw-${sideName}`;
    jaw.position.set(side * 0.23, 0.02, L * 0.55);
    jaw.rotation.y = side * -0.12;
    jaw.scale.setScalar(R);
    jaw.userData.mirrorjawRole = 'split-tapered-mandible';
    const mandible = new THREE.Mesh(mirrorjawMandibleGeometry(), jawMat);
    mandible.name = `mirrorjaw-mandible-plate-${sideName}`;
    mandible.userData.mirrorjawRole = 'tapered-mandible-leaf';
    // Preserve the two leaves as separately inspectable phase-bearing parts. They are only two
    // meshes and their shared material keeps the instance cost bounded.
    mandible.userData.staticBatch = false;
    mandible.castShadow = true;
    mandible.receiveShadow = true;
    jaw.add(mandible);
    g.add(jaw);

    // The side actuator is a visible load path: a barrel, a smaller rod entering the mandible
    // root, and one collar. All three use cached geometry/materials and remain static in count.
    const loadPath = new THREE.Group();
    loadPath.name = `mirrorjaw-side-load-path-${sideName}`;
    loadPath.rotation.y = side * -0.10;
    loadPath.scale.setScalar(R);
    loadPath.userData.mirrorjawRole = 'side-piston-load-path';
    const piston = new THREE.Mesh(
      getGeometry('mirrorjaw:piston-barrel', () => new THREE.CylinderGeometry(0.075, 0.095, 0.54, 8)),
      pistonMat,
    );
    piston.name = `mirrorjaw-piston-${sideName}`;
    piston.rotation.x = Math.PI / 2;
    piston.position.set(side * 0.49, 0.01, 0.14);
    piston.userData.staticBatch = false;
    loadPath.add(piston);
    const pistonRod = new THREE.Mesh(
      getGeometry('mirrorjaw:piston-rod', () => new THREE.CylinderGeometry(0.034, 0.044, 0.24, 8)),
      pistonMat,
    );
    pistonRod.name = `mirrorjaw-piston-rod-${sideName}`;
    pistonRod.rotation.x = Math.PI / 2;
    pistonRod.position.set(side * 0.39, 0.01, 0.48);
    pistonRod.userData.staticBatch = false;
    loadPath.add(pistonRod);
    const pistonCollar = new THREE.Mesh(
      getGeometry('mirrorjaw:piston-collar', () => new THREE.TorusGeometry(0.095, 0.018, 6, 12)),
      pistonMat,
    );
    pistonCollar.name = `mirrorjaw-piston-collar-${sideName}`;
    pistonCollar.position.set(side * 0.39, 0.01, 0.38);
    pistonCollar.userData.staticBatch = false;
    loadPath.add(pistonCollar);
    g.add(loadPath);
  }

  // The rear assembly is intentionally directional. In this authored +Z frame the ring's default
  // XY plane is normal to +Z; the owner's +90° yaw turns it into a YZ ring normal to gameplay -X,
  // so a rear three-quarter view sees a cage instead of a giant top-facing orange disc.
  const reactorAssembly = new THREE.Group();
  reactorAssembly.name = 'mirrorjaw-rear-reactor-cage';
  reactorAssembly.position.set(0, 0.08, -L * 0.64);
  reactorAssembly.scale.setScalar(R);
  reactorAssembly.userData.mirrorjawRole = 'rear-facing-reactor-cage';
  reactorAssembly.userData.mirrorjawFacing = 'rear';
  const reactor = new THREE.Mesh(
    getGeometry('mirrorjaw:reactorCage-v2', () => new THREE.TorusGeometry(0.18, 0.028, 6, 16)),
    reactorCageMat,
  );
  reactor.name = 'mirrorjaw-reactor-cage';
  reactor.userData.staticBatch = false;
  reactor.userData.mirrorjawFacing = 'rear';
  reactorAssembly.add(reactor);
  const reactorCore = new THREE.Mesh(
    getGeometry('mirrorjaw:reactorCore-v2', () => new THREE.OctahedronGeometry(0.11, 0)),
    reactorMat,
  );
  reactorCore.name = 'mirrorjaw-reactor-core';
  reactorCore.userData.staticBatch = false;
  reactorCore.castShadow = true;
  reactorAssembly.add(reactorCore);
  const railGeometry = getGeometry('mirrorjaw:reactor-rail', () => new THREE.CylinderGeometry(0.027, 0.038, 0.34, 6));
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeometry, reactorCageMat);
    rail.name = `mirrorjaw-reactor-rail-${side < 0 ? 'port' : 'starboard'}`;
    rail.position.x = side * 0.12;
    rail.userData.staticBatch = false;
    reactorAssembly.add(rail);
  }
  g.add(reactorAssembly);
  g.userData.mirrorjawForeman = true;

  let visiblePhase = null;
  return {
    updatePhase(nextPhase) {
      const phase = MIRRORJAW_VISUAL_PHASES[nextPhase]
        ? nextPhase
        : 'reflective_ram';
      if (phase === visiblePhase) return phase;
      const look = MIRRORJAW_VISUAL_PHASES[phase];
      visiblePhase = phase;
      jawMat.color.setHex(look.jawColor);
      jawMat.emissive.setHex(look.jawEmissive);
      jawMat.emissiveIntensity = look.jawEmissiveIntensity;
      jawMat.metalness = look.jawMetalness;
      jawMat.roughness = look.jawRoughness;
      jawMat.clearcoat = look.jawClearcoat;
      reactorMat.color.setHex(look.reactorColor);
      reactorMat.emissive.setHex(look.reactorEmissive);
      reactorMat.emissiveIntensity = look.reactorEmissiveIntensity;
      return phase;
    },
  };
}

/**
 * Attach the Mirrorjaw-specific readable machinery to a live authored ship boundary. Live play
 * mounts ships through a zero-draw authored admission substrate, so the procedural ship builder
 * above is not part of that route; boss-specific jaws/reactor must cross the authored swap seam
 * explicitly or the player only sees an ordinary Colossus body.
 */
export function attachMirrorjawForemanPresentation(root, entity) {
  if (!root || !root.isObject3D || entity?.data?.bossProfile?.id !== 'mirrorjaw_foreman') return null;
  root.userData = root.userData || {};
  const existing = root.getObjectByName('mirrorjaw-foreman-authored-overlay-frame');
  let overlay = existing;
  if (!overlay) {
    const def = SHIP_BY_ID.get(entity.data?.defId) || SHIP_BY_ID.get('ship_colossus');
    const vis = { length: 2.6, halfWidth: 0.9, height: 0.6, ...(def?.visuals?.proportions || {}) };
    overlay = new THREE.Group();
    overlay.name = 'mirrorjaw-foreman-authored-overlay-frame';
    overlay.rotation.y = Math.PI / 2;
    overlay.userData.mirrorjawForemanOverlay = true;
    const presentation = decorateMirrorjawForeman({
      g: overlay,
      R: entity.radius || 12,
      vis,
    });
    overlay.userData.updateMirrorjawPhase = presentation.updatePhase;
    root.add(overlay);
  }

  const updateMirrorjawPhase = overlay.userData?.updateMirrorjawPhase;
  if (typeof updateMirrorjawPhase !== 'function') return overlay;
  if (root.userData.mirrorjawRuntimeOverlay === overlay) {
    root.userData.updateRuntimeState?.(entity);
    return overlay;
  }

  const previousRuntimeUpdate = typeof root.userData.updateRuntimeState === 'function'
    ? root.userData.updateRuntimeState
    : null;
  root.userData.updateRuntimeState = (liveEntity, now) => {
    if (previousRuntimeUpdate) previousRuntimeUpdate(liveEntity, now);
    const phase = updateMirrorjawPhase(liveEntity?.data?.mirrorjawPhase);
    root.userData.mirrorjawVisualPhase = phase;
    const authoredState = String(root.userData.authoredAssetState || '');
    overlay.visible = !authoredState
      || authoredState === 'authored'
      || authoredState === 'authored-prepared'
      || authoredState === 'procedural-settled'
      || authoredState === 'same-semantic-fallback';
  };
  root.userData.mirrorjawForemanOverlay = overlay;
  root.userData.mirrorjawRuntimeOverlay = overlay;
  root.userData.updateRuntimeState(entity);
  return overlay;
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
  const isMirrorjaw = e.data && e.data.bossProfile && e.data.bossProfile.id === 'mirrorjaw_foreman';
  let mirrorjawVisual = null;
  builder(ctx);
  if (isMirrorjaw) {
    mirrorjawVisual = decorateMirrorjawForeman(ctx);
    // The legacy dreadnought silhouette was authored with +Z as its prow, while flight, weapons,
    // and directional-surface combat all define local +X as the nose. Rotate only that authored
    // base/decor assembly into the canonical ship frame; later +X hardpoints and drive mounts stay
    // in their normal frame. This keeps the visible jaw on the same side that reflects a shot.
    const localFrame = new THREE.Group();
    localFrame.name = 'mirrorjaw-foreman-local-frame';
    for (const child of [...g.children]) localFrame.add(child);
    localFrame.rotation.y = Math.PI / 2;
    g.add(localFrame);
  }

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
    addEngineTrailSocket(g, en, i);
    outer.userData.engines.push(en);
  }
  // fallback: if no mounts authored, place a pair by recipe (back-compat for defs lacking visuals)
  if (!mounts.length) {
    const n = Math.max(1, Math.min(6, recipe.engineCount || 2));
    for (let i = 0; i < n; i++) {
      const z = n === 1 ? 0 : (-(n - 1) / 2 + i) * 0.24 * 2;
      const en = engineProp(pal, R, 0.9, loadout.engineClass || 60);
      en.position.set(-0.7 * R, 0, z * R); g.add(en); addEngineTrailSocket(g, en, i); outer.userData.engines.push(en);
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
      const tip = lampFixture(pal.accent, R * 0.032, 2.6);
      tip.position.set(ant.position.x, vis.sensor[1] * R + R * 0.32, ant.position.z); g.add(tip);
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
        const pose = engines[i].userData.plumePose || (p ? kit.captureDrivePose(p) : null);
        if (p && b && pose) {
          const s = 1 + 0.18 * Math.sin(t * 9 + ph + i);
          kit.applyDrivePoseScale(p, pose, { x: s, y: 1, z: 1 }, { lockForwardEdgeX: true });
        }
        const fan = engines[i].userData.fan;       // spin the turbine fan — reads as live machinery
        if (fan) fan.rotation.x = t * 18;
      }
      for (let i = 0; i < blinkers.length; i++) {
        const bl = blinkers[i], bd = bl.userData.blink;
        const on = ((((t * (bd.hz || 0.6)) + bd.phase) % 1) + 1) % 1 > 0.5 ? 1 : 0.25;
        bl.material.emissiveIntensity = (bd.base || 3.4) * (0.18 + 0.82 * on);
      }
      if (ctx.sensorRing) ctx.sensorRing.rotation.z = t * 0.3;
      // turret heads sweep ±35° seeking a target — sells the "auto-tracking" read even when idle
      for (let i = 0; i < turretHeads.length; i++) {
        turretHeads[i].rotation.y = Math.sin(t * 0.8 + i * 1.7) * 0.6;
      }
    };
  }
  outer.userData.kind = 'ship';
  if (mirrorjawVisual) {
    outer.userData.updateRuntimeState = (liveEntity) => {
      const phase = mirrorjawVisual.updatePhase(liveEntity?.data?.mirrorjawPhase);
      outer.userData.mirrorjawVisualPhase = phase;
    };
    outer.userData.updateRuntimeState(e);
  }

  // GR-5: persistent 3D shield bubble. Shared via shipKit so authored compositions use the same
  // geometry/material contract; per-instance material carries its own flash state.
  const shieldBubble = kit.createShieldBubble(pal.accent || '#5fd0ff', R);
  outer.add(shieldBubble);
  outer.userData.shieldBubble = shieldBubble;

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
  ast_common_rock: { color: 0xffffff, rough: 0.86, metal: 0.04, emissive: 0x000000, ei: 0,    detail: 2, displace: 0.20, flat: false, variant: 'rock' },
  ast_metallic:    { color: 0x5a6470, rough: 0.45, metal: 0.7,  emissive: 0x183040, ei: 0.18, detail: 1, displace: 0.30, flat: true,  variant: 'metal', veinColor: '#3fd0ff' },
  ast_icy:         { color: 0x8fd8f0, rough: 0.18, metal: 0.12, emissive: 0x105080, ei: 0.45, detail: 1, displace: 0.28, flat: false, variant: 'ice',  veinColor: '#5fe0ff' },
  ast_crystalline: { color: 0x5a3aa0, rough: 0.22, metal: 0.25, emissive: 0x9030e0, ei: 0.85, detail: 1, displace: 0.45, flat: true,  variant: 'crystal', veinColor: '#c060ff' },
  ast_gas_cloud:   { color: 0x2a5a4a, rough: 1.0,  metal: 0,    emissive: 0x10a060, ei: 0.55, detail: 1, displace: 0.40, flat: true,  variant: 'gas' },
  ast_rare_exotic: { color: 0x282038, rough: 0.6,  metal: 0.5,  emissive: 0x7030d0, ei: 0.8,  detail: 2, displace: 0.32, flat: true,  variant: 'exotic', veinColor: '#ff40c0' },
};

// Legacy/alias ids used by live spawners. `ast_rock` is what src/main.js seeds the opening belt with,
// and it is NOT a key in AST_TYPE — so the `def` lookup fell through to ast_common_rock's numbers
// while every path that gated on the literal string `'ast_common_rock'` silently opted out. That cost
// those rocks the authored PBR surface set (base colour + normal + ORM from the rock surface
// library, leaving a plain white 0xffffff standard material) AND their place in the instanced
// asteroid pool. Canonicalising once, at the single point where the id enters the visual layer,
// fixes both without touching spawn data or save payloads.
const AST_TYPE_ALIASES = { ast_rock: 'ast_common_rock' };

function canonicalAstTypeId(typeId) {
  const id = typeId || 'ast_common_rock';
  return AST_TYPE_ALIASES[id] || id;
}

function transformCommonRockUvs(geometry, variantIdx) {
  const uv = geometry.getAttribute('uv');
  const transform = COMMON_ROCK_UV_TRANSFORMS[variantIdx];
  if (!uv || !transform) return null;
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  for (let index = 0; index < uv.count; index++) {
    const centeredU = uv.getX(index) - 0.5;
    const centeredV = uv.getY(index) - 0.5;
    const rotatedU = centeredU * cosine - centeredV * sine;
    const rotatedV = centeredU * sine + centeredV * cosine;
    uv.setXY(
      index,
      rotatedU * transform.scale[0] + 0.5 + transform.offset[0],
      rotatedV * transform.scale[1] + 0.5 + transform.offset[1],
    );
  }
  uv.needsUpdate = true;
  return transform;
}

function astDisplacedGeometry(typeId, def, variantIdx) {
  const key = `ast:geology-v4:${typeId}:${variantIdx}`;
  return getGeometry(key, () => {
    const geo = new THREE.IcosahedronGeometry(1, def.detail + 1);
    const uvTransform = typeId === 'ast_common_rock' ? transformCommonRockUvs(geo, variantIdx) : null;
    const pos = geo.attributes.position;
    const normal = geo.attributes.normal;
    const colors = typeId === 'ast_common_rock' ? new Float32Array(pos.count * 3) : null;
    const geologyPbr = typeId === 'ast_common_rock' ? new Float32Array(pos.count * 4) : null;
    const dominantRoleCounts = { matrix: 0, fracture: 0, regolith: 0, ferrite: 0 };
    const responseRanges = {
      ao: [Infinity, -Infinity],
      roughness: [Infinity, -Infinity],
      metalness: [Infinity, -Infinity],
      normalStrength: [Infinity, -Infinity],
      silhouetteRadius: [Infinity, -Infinity],
    };
    const v = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const rnd = mulberryLite(hashId(typeId) + variantIdx * 911);
    // per-geometry random lattice offsets so each variant displaces differently but deterministically
    const ox = rnd() * 100, oy = rnd() * 100, oz = rnd() * 100;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Micro-breakup stays subordinate to the common rocks' object-space strata and joint fields.
      surfaceNormal.copy(v).normalize();
      let d = 0, amp = 1, f = 1.7;
      for (let o = 0; o < 3; o++) {
        d += amp * Math.sin(surfaceNormal.x * f * 3.1 + ox)
          * Math.cos(surfaceNormal.y * f * 2.7 + oy)
          * Math.sin(surfaceNormal.z * f * 3.3 + oz);
        amp *= 0.5; f *= 2.0;
      }
      const silhouetteRadius = typeId === 'ast_common_rock'
        ? geologySilhouetteRadius(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z, variantIdx)
        : 1;
      const scale = typeId === 'ast_common_rock'
        ? silhouetteRadius
          + geologyDisplacement(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z, variantIdx) * 1.9
          + def.displace * d * 0.18
        : 1 + def.displace * d;
      v.multiplyScalar(Math.max(0.5, scale));
      pos.setXYZ(i, v.x, v.y, v.z);
      // Keep an intermediate radial normal for deterministic geology tone sampling. Common rocks
      // replace it below with merged displaced-surface normals so macro strata affect grazing light.
      surfaceNormal.copy(v).normalize();
      normal.setXYZ(i, surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
      if (colors) {
        const response = geologySurfaceResponse(
          surfaceNormal.x,
          surfaceNormal.y,
          surfaceNormal.z,
          variantIdx,
        );
        colors[i * 3] = response.baseColor[0];
        colors[i * 3 + 1] = response.baseColor[1];
        colors[i * 3 + 2] = response.baseColor[2];
        geologyPbr[i * 4] = response.ao;
        geologyPbr[i * 4 + 1] = response.roughness;
        geologyPbr[i * 4 + 2] = response.metalness;
        geologyPbr[i * 4 + 3] = response.normalStrength;
        const dominantRole = Object.entries(response.roleWeights)
          .reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
        dominantRoleCounts[dominantRole]++;
        for (const [field, value] of Object.entries({
          ao: response.ao,
          roughness: response.roughness,
          metalness: response.metalness,
          normalStrength: response.normalStrength,
          silhouetteRadius,
        })) {
          responseRanges[field][0] = Math.min(responseRanges[field][0], value);
          responseRanges[field][1] = Math.max(responseRanges[field][1], value);
        }
      }
    }
    normal.needsUpdate = true;
    if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (geologyPbr) geo.setAttribute('sfGeologyPbr', new THREE.BufferAttribute(geologyPbr, 4));
    if (typeId === 'ast_common_rock') {
      // IcosahedronGeometry is non-indexed, so computeVertexNormals on the original buffer would
      // preserve triangle facets. Merge identical displaced vertices first: the resulting normals
      // follow the authored strata/joint relief while remaining smooth across shared rock faces.
      const smooth = mergeVertices(geo, 1e-5);
      smooth.computeVertexNormals();
      smooth.computeBoundingSphere();
      // Preserve the dense, non-indexed representation expected by the asteroid instancing path;
      // toNonIndexed duplicates the already-smoothed normals instead of recreating face normals.
      const denseSmooth = toCreasedNormals(smooth, THREE.MathUtils.degToRad(42));
      denseSmooth.computeBoundingSphere();
      denseSmooth.userData.spacefaceGeology = {
        schema: 'spaceface.commonRockGeology.v4',
        variantIndex: variantIdx,
        variantName: COMMON_ROCK_VARIANTS[variantIdx].name,
        materialRoles: Object.keys(COMMON_ROCK_MATERIAL_ROLES),
        dominantRoleCounts,
        responseRanges,
        uvTransform,
        deterministic: true,
        pbrAttribute: 'sfGeologyPbr',
        pbrAttributeChannels: ['ao', 'roughness', 'metalness', 'normalStrength'],
        normalPolicy: '42-degree selective crease with smooth intra-plane normals',
      };
      return denseSmooth;
    }
    // The original icosphere normals describe the undisplaced sphere, so retaining them makes
    // every smooth-shaded variant (most visibly ice) reflect like a plastic ball even after its
    // silhouette has been heavily displaced. Rebuild normals from the final surface. Merge first
    // so neighboring faces share the same displaced vertex, then preserve deliberate geological
    // breaks with a material-appropriate crease angle.
    const displaced = mergeVertices(geo, 1e-5);
    displaced.computeVertexNormals();
    displaced.computeBoundingSphere();
    const creaseDegrees = typeId === 'ast_icy' ? 62 : (def.flat ? 34 : 48);
    const surfaced = toCreasedNormals(displaced, THREE.MathUtils.degToRad(creaseDegrees));
    surfaced.computeBoundingSphere();
    surfaced.userData.spacefaceGeology = {
      schema: 'spaceface.asteroidSurfaceNormals.v1',
      typeId,
      variantIndex: variantIdx,
      normalPolicy: `${creaseDegrees}-degree displaced-surface crease`,
      deterministic: true,
    };
    return surfaced;
  });
}

const COMMON_ROCK_PBR_SHADER_KEY = 'spaceface-common-rock-geology-pbr-v4';

function replaceRequiredShaderSource(source, needle, replacement, label) {
  if (typeof source !== 'string' || !source.includes(needle)) {
    throw new Error(`[render] common-rock PBR shader contract changed: missing ${label}`);
  }
  return source.replace(needle, replacement);
}

function configureCommonRockPbr(material) {
  material.name = 'SF_CommonRock_GeologicalPBR_v4';
  material.userData.spacefaceMaterialRoles = Object.keys(COMMON_ROCK_MATERIAL_ROLES);
  material.userData.spacefacePbrAttribute = 'sfGeologyPbr';
  material.userData.spacefaceSurfaceModel = 'macro-object-space+variant-uv+micro-texture';
  material.userData.spacefaceNoEmissiveBlanket = true;
  material.customProgramCacheKey = () => COMMON_ROCK_PBR_SHADER_KEY;
  material.onBeforeCompile = (shader) => {
    // Preserve Three's current tangent-space normal implementation, but scale its XY perturbation
    // with the geological role stored in sfGeologyPbr.a. Fracture walls carry a sharper response;
    // ferrite and accumulated regolith remain calmer instead of sharing one plastic normal strength.
    const geologyNormalChunk = replaceRequiredShaderSource(
      THREE.ShaderChunk.normal_fragment_maps,
      'mapN.xy *= normalScale;',
      'mapN.xy *= normalScale * vSfGeologyPbr.a;',
      'normal-map scale hook',
    );
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <common>',
      '#include <common>\nattribute vec4 sfGeologyPbr;\nvarying vec4 vSfGeologyPbr;',
      'vertex common chunk',
    );
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSfGeologyPbr = sfGeologyPbr;',
      'vertex position hook',
    );
    shader.fragmentShader = replaceRequiredShaderSource(
      shader.fragmentShader,
      '#include <common>',
      '#include <common>\nvarying vec4 vSfGeologyPbr;',
      'fragment common chunk',
    );
    shader.fragmentShader = replaceRequiredShaderSource(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      geologyNormalChunk,
      'fragment normal chunk',
    );
    shader.fragmentShader = replaceRequiredShaderSource(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      [
        '#include <roughnessmap_fragment>',
        '// Blend the micro roughness map toward the object-space geological role response.',
        'roughnessFactor = clamp(mix(roughnessFactor, vSfGeologyPbr.g, 0.84), 0.24, 1.0);',
      ].join('\n'),
      'fragment roughness chunk',
    );
    shader.fragmentShader = replaceRequiredShaderSource(
      shader.fragmentShader,
      '#include <metalnessmap_fragment>',
      [
        '#include <metalnessmap_fragment>',
        '// Sparse ferrite can become metallic; matrix/fracture/regolith remain dielectric.',
        'metalnessFactor = clamp(mix(metalnessFactor, vSfGeologyPbr.b, 0.9), 0.0, 1.0);',
      ].join('\n'),
      'fragment metalness chunk',
    );
    shader.fragmentShader = replaceRequiredShaderSource(
      shader.fragmentShader,
      '#include <aomap_fragment>',
      [
        '#include <aomap_fragment>',
        '// Recess-linked macro occlusion supplements the packed micro AO without a screen pass.',
        'reflectedLight.indirectDiffuse *= vSfGeologyPbr.r;',
        'reflectedLight.indirectSpecular *= mix(0.72, 1.0, vSfGeologyPbr.r);',
      ].join('\n'),
      'fragment AO chunk',
    );
  };
  return material;
}

function astMaterial(typeId, def, tint) {
  const key = `astmat:${typeId}:${tint || 'def'}`;
  return getMaterial(key, () => {
    const commonSurface = typeId === 'ast_common_rock' && tint == null
      ? getReadyRockSurfaceTextures()
      : null;
    const color = tint != null ? new THREE.Color(tint) : new THREE.Color(def.color);
    const skipRoughNoise = !!commonSurface || def.variant === 'crystal' || def.variant === 'ice';
    const rough = skipRoughNoise
      ? null
      : getTexture('noise:astrough', () =>
        makeNoiseTexture({ size: 256, seed: 41, octaves: 4, baseCells: 6, contrast: 1.4, brightness: -0.05 }));

    // Procedural surfaces only. (The generated ore_*_hero.jpg assets are LABELLED contact-sheet
    // references — multiple views + caption text — and were being emissive-mapped onto crystals, so
    // valuable rocks literally glowed reference text. Valuable ores still pop via emissive colour +
    // the crystal shards added in buildAsteroid.)
    let eiBoost = def.ei;
    const t = (typeId || '').toLowerCase();
    if (t.includes('luminite') || t.includes('crystal') || def.variant === 'crystal') eiBoost = Math.max(eiBoost, 0.9);
    else if (t.includes('xenium') || t.includes('exotic') || def.variant === 'exotic') eiBoost = Math.max(eiBoost, 0.75);

    if (def.variant === 'ice') {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.06,
        metalness: 0.0,
        transmission: 0.78,
        ior: 1.31,
        thickness: 2.8,
        attenuationColor: new THREE.Color('#6eb8d8'),
        attenuationDistance: 1.6,
        emissive: new THREE.Color(def.emissive),
        emissiveIntensity: Math.min(eiBoost, 0.22),
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.15,
        fog: true,
      });
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      map: commonSurface && commonSurface.baseColor || null,
      normalMap: commonSurface && commonSurface.normal || null,
      normalScale: commonSurface ? new THREE.Vector2(0.96, 0.96) : new THREE.Vector2(1, 1),
      aoMap: commonSurface && commonSurface.orm || null,
      aoMapIntensity: commonSurface ? 0.78 : 1,
      roughness: commonSurface ? 1 : def.rough,
      metalness: commonSurface ? 1 : def.metal,
      roughnessMap: commonSurface && commonSurface.orm
        || (def.variant === 'crystal' ? null : rough),
      metalnessMap: commonSurface && commonSurface.orm || null,
      vertexColors: !!commonSurface,
      emissive: new THREE.Color(def.emissive), emissiveIntensity: eiBoost,
      flatShading: def.flat,
    });
    return commonSurface ? configureCommonRockPbr(material) : material;
  });
}

function buildAsteroid(e) {
  const R = e.radius || 12;
  const typeId = canonicalAstTypeId(e.data && e.data.typeId);
  const def = AST_TYPE[typeId] || AST_TYPE.ast_common_rock;
  const tint = e.data && e.data.tint; // optional sector tint override
  const variantIdx = hashId(e.id) % 5; // 5 displacement variants per type
  const geo = astDisplacedGeometry(typeId, def, variantIdx);
  const mesh = new THREE.Mesh(geo, astMaterial(typeId, def, tint));
  mesh.scale.setScalar(R);
  // GR-2: large asteroids are shadow receivers (and casters). A ship mining an asteroid should see
  // its shadow drape across the rock's sunlit side, and the asteroid's own shadow should fall on the
  // station pad when nearby. Both castShadow and receiveShadow engage the renderer's auto-gated
  // shadow system (renderer._syncShadowMapEnabled flips the map on only when receivers exist).
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const g = new THREE.Group();
  g.add(mesh);
  if (typeId === 'ast_common_rock' && tint == null) {
    mesh.userData.asteroidInstanceTypeId = 'ast_common_rock';
    mesh.userData.asteroidInstanceVariant = variantIdx;
    g.userData.asteroidInstanceBody = mesh;
  }
  if (def.variant === 'crystal') {
    const rnd = mulberryLite(hashId(e.id));
    const shardMat = emissiveMaterial('#c878ff', 1.1);
    for (let i = 0; i < 6; i++) {
      const shard = new THREE.Mesh(getGeometry('ast:shard', () => new THREE.OctahedronGeometry(0.18, 0)), shardMat);
      const a = rnd() * Math.PI * 2, e2 = (rnd() - 0.5) * 1.4;
      shard.position.set(Math.cos(a) * R * 0.7, Math.sin(e2) * R * 0.5, Math.sin(a) * R * 0.7);
      shard.scale.setScalar(R * (0.5 + rnd() * 0.6));
      shard.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      shard.userData.spacefaceTags = { greeble: true };
      g.add(shard);
    }
  } else if (def.variant === 'gas') {
    const hull = new THREE.Mesh(
      geo,
      getMaterial('ast:gashull', () => new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#2d6a52'),
        roughness: 0.42,
        metalness: 0,
        transmission: 0.88,
        ior: 1.04,
        thickness: 3.6,
        attenuationColor: new THREE.Color('#3dff9a'),
        attenuationDistance: 2.1,
        emissive: new THREE.Color('#10a060'),
        emissiveIntensity: 0.28,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      })),
    );
    hull.scale.setScalar(R * 1.22);
    hull.userData.spacefaceTags = { greeble: true };
    g.add(hull);
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
      vein.userData.spacefaceTags = { greeble: true };
      g.add(vein);
    }
  }
  g.userData.kind = 'asteroid';
  g.userData.updateLod = function updateAsteroidLod(level) {
    applyProjectedDetailLod(g, level);
  };
  attachLodState(g);
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

function blinkerFixture(color, scale, phase, blinkers) {
  const root = new THREE.Group();
  const cup = new THREE.Mesh(
    getGeometry('nav:cup', () => new THREE.CylinderGeometry(0.46, 0.58, 0.32, 8)),
    getMaterial('nav:cup', () => new THREE.MeshStandardMaterial({
      color: 0x171a1f, roughness: 0.42, metalness: 0.78,
    })),
  );
  const lens = new THREE.Mesh(
    getGeometry('nav:lens', () => new THREE.SphereGeometry(0.36, 12, 10)),
    emissiveMaterial(color, 3.4).clone(),
  );
  lens.position.y = 0.18;
  lens.userData.blink = { phase: phase || 0, hz: 0.6 + ((phase || 0) % 0.6), base: 3.4 };
  lens.userData.spacefaceTags = { damageRole: 'navLight', vfxRole: 'navBlinker' };
  root.add(cup, lens);
  root.scale.setScalar(scale);
  root.userData.spacefaceTags = { damageRole: 'navLight', vfxRole: 'navBlinker' };
  if (blinkers) blinkers.push(lens);
  return root;
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
      b.material.emissiveIntensity = bl.base * (0.18 + 0.82 * on);
    }
  };
}

function structureVisualRadius(e, fallback = 40) {
  const data = e && e.data || {};
  for (const value of [data.visualRadius, data.dockRadius, data.stationRadius, e && e.radius]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(4, n);
  }
  return fallback;
}

// Vertical jump gate: a chunky portal you fly THROUGH. The ring plane contains the
// world Y axis + the radial-in direction (toward sector center), so a ship approaching
// from the sector center passes cleanly through the opening. Built from primitives +
// procedural canvas textures only — outer hull ring, inner energy ring, four cardinal
// pylons with greebled strut boxes, a hub behind the portal, and the swirling event
// horizon. Wormholes reuse the same chassis with a hostile palette + unstable swirl.
function buildGate(e, pal) {
  const R = structureVisualRadius(e, 70);
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
    const material = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: isWormhole ? 0.7 : 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    configurePlanarAdditiveMaterial(material);
    return material;
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
    const b = blinkerFixture(i % 2 ? pal.accent : '#5fffa0', R * 0.035, i * 0.31, blinkers);
    b.position.set(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, R * 0.08);
    orient.add(b);
  }

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
      b.material.emissiveIntensity = bl.base * (0.18 + 0.82 * on);
    }
  };
}

function buildStation(e) {
  const R = structureVisualRadius(e, 40);
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
  const spars = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(getGeometry('stat:spar', () => new THREE.BoxGeometry(0.16, 0.12, 0.7)), m);
    const a = i * Math.PI / 2;
    arm.position.set(Math.cos(a) * R * 0.55, 0, Math.sin(a) * R * 0.55);
    arm.rotation.y = -a; arm.scale.setScalar(R); g.add(arm); spars.push(arm);
  }
  // GR-2: the station's large flat surfaces (core, rings, docking spars) are the natural shadow
  // receivers — a ship docking should cast its shadow across the spar/deck it's landing on, and the
  // station body should catch shadows from its own rings and nearby ships. Setting receiveShadow on
  // these opaque meshes also engages the renderer's auto-gated shadow system (no receivers = maps off,
  // so this is what actually turns real shadows on for the whole sector). We set it per-surface rather
  // than traversing the group so the tiny emissive nav-lights/window-strips stay cheap (no shadow pass).
  core.receiveShadow = true; core.castShadow = true;
  r1.receiveShadow = true; r1.castShadow = true;
  r2.receiveShadow = true; r2.castShadow = true;
  for (const arm of spars) { arm.receiveShadow = true; arm.castShadow = true; }
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
    const b = blinkerFixture(i % 2 ? navColor : '#5fffa0', R * 0.04, i * 0.31, blinkers);
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
// as applyPaintProfile for ships, but without global transparent shells: stations should read as
// their actual structure, not a colored glass bubble. Independent of the ship helper so station
// geometry/scale assumptions don't leak into ship code.
function applyStructureProfile(g, pal, R, seed) {
  const profile = (pal && pal.profile) || null;
  if (!profile) return;
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
}

// ---------------------------------------------------------------------------------------------
// PICKUPS — spinning gem colored by commodity. Bloom comes from the gem's own emissive surface.
// ---------------------------------------------------------------------------------------------
function commodityColor(e) {
  const d = e.data || {};
  if (d.kind === 'credits' || d.kind === 'credit_chip') return '#ffcc44';
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

function isCreditChipEntity(e) {
  const d = e && e.data || {};
  return d.kind === 'credit_chip' || d.kind === 'credits';
}

// Minted salvage-rights chit: a short hexagonal token with a raised stamp and rim.
// Top-down it reads as a coin; from the side it has thickness. Not a recolored
// ore octahedron and not a camera-facing glow card.
function buildCreditChip(e) {
  const R = Math.max(1.4, Number(e && e.radius) || 2.2);
  const g = new THREE.Group();
  const bodyMat = getMaterial('creditchip:body', () => new THREE.MeshStandardMaterial({
    color: 0xc9a24a,
    emissive: 0x3a2508,
    emissiveIntensity: 0.28,
    metalness: 0.86,
    roughness: 0.28,
  }));
  const rimMat = getMaterial('creditchip:rim', () => new THREE.MeshStandardMaterial({
    color: 0x5a4220,
    emissive: 0x1a1004,
    emissiveIntensity: 0.12,
    metalness: 0.78,
    roughness: 0.42,
  }));
  const stampMat = getMaterial('creditchip:stamp', () => new THREE.MeshStandardMaterial({
    color: 0xf2d27a,
    emissive: 0x8a5a14,
    emissiveIntensity: 0.55,
    metalness: 0.7,
    roughness: 0.22,
  }));
  const insetMat = getMaterial('creditchip:inset', () => new THREE.MeshStandardMaterial({
    color: 0x2a2112,
    emissive: 0x6a4810,
    emissiveIntensity: 0.35,
    metalness: 0.55,
    roughness: 0.38,
  }));

  const stack = new THREE.Group();
  stack.name = 'CreditChipStack';
  const chipGeo = getGeometry('creditchip:hex', () => new THREE.CylinderGeometry(0.78, 0.78, 0.16, 6));
  const offsets = [
    { y: -0.14, rot: 0.08, scale: 1 },
    { y: 0.02, rot: -0.18, scale: 0.94 },
    { y: 0.16, rot: 0.12, scale: 0.86 },
  ];
  for (let i = 0; i < offsets.length; i++) {
    const chip = new THREE.Mesh(chipGeo, bodyMat);
    chip.name = i === 0 ? 'CreditChipBody' : `CreditChipStack_${i + 1}`;
    chip.position.y = offsets[i].y;
    chip.rotation.y = offsets[i].rot;
    chip.scale.setScalar(offsets[i].scale);
    stack.add(chip);
  }

  const rim = new THREE.Mesh(
    getGeometry('creditchip:rim', () => new THREE.TorusGeometry(0.78, 0.045, 6, 6)),
    rimMat,
  );
  rim.name = 'CreditChipRim';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.16;
  stack.add(rim);

  const stamp = new THREE.Mesh(
    getGeometry('creditchip:stamp', () => new THREE.CylinderGeometry(0.28, 0.28, 0.06, 6)),
    stampMat,
  );
  stamp.name = 'CreditChipStamp';
  stamp.position.y = 0.26;
  stack.add(stamp);

  const bar = new THREE.Mesh(
    getGeometry('creditchip:bar', () => new THREE.BoxGeometry(0.34, 0.05, 0.08)),
    insetMat,
  );
  bar.name = 'CreditChipMintBar';
  bar.position.y = 0.30;
  stack.add(bar);

  stack.scale.setScalar(R);
  g.add(stack);
  g.userData.kind = 'pickup';
  g.userData.interactionKind = 'pickup';
  g.userData.pickupVisual = 'credit_chip';
  g.userData.visualLanguage = 'minted-credit-chip';
  const ph = (hashId(e.id) % 100) / 100 * Math.PI * 2;
  const host = stack.children[0];
  host.frustumCulled = false;
  host.onBeforeRender = () => {
    const t = nowSec();
    stack.rotation.y = t * 1.35 + ph;
    stack.position.y = 0.35 * Math.sin(t * 1.8 + ph);
  };
  return g;
}

function buildPickup(e) {
  if (e.data && e.data.freightCustodyPod) {
    const canister = buildPayload(e);
    canister.userData.kind = 'pickup';
    canister.userData.interactionKind = 'pickup';
    return canister;
  }
  if (isCreditChipEntity(e)) return buildCreditChip(e);
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
  gem.material = gem.material.clone();
  g.add(gem);
  g.userData.kind = 'pickup'; g.userData.gem = gem;
  const ph = (hashId(e.id) % 100) / 100 * Math.PI * 2;
  gem.frustumCulled = false;
  gem.onBeforeRender = () => {
    const t = nowSec();
    gem.rotation.y = t * 2.2 + ph;
    gem.rotation.x = t * 1.1;
    gem.position.y = 0.6 * Math.sin(t * 2 + ph);
    gem.material.emissiveIntensity = 1.5 * (1 + 0.28 * Math.sin(t * 3 + ph));
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// PROJECTILES — bright additive tracer (cylinder along +X) + halo. Missiles get a body+cone.
// ---------------------------------------------------------------------------------------------
function buildProjectile(e) {
  const R = e.radius || 0.7;
  const wid = (e.data && e.data.weaponId) || '';
  const presentation = resolveWeaponPresentationFamily(wid, e.data || null);
  const isMissile = presentation.family === 'missile';
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
    body.name = 'ProjectileMissileBody';
    const tip = new THREE.Mesh(getGeometry('proj:mtip', () => new THREE.ConeGeometry(0.4, 0.8, 8).rotateZ(-Math.PI / 2)),
      getMaterial('proj:warhead', () => new THREE.MeshStandardMaterial({ color: 0x747b86, roughness: 0.46, metalness: 0.52 })));
    tip.position.x = R * 1.4; tip.scale.setScalar(R); g.add(tip);
    tip.name = 'ProjectileMissileWarhead';
    const exhaust = boltMesh('proj:missile:exhaust',
      () => new THREE.CapsuleGeometry(0.20, 1.55, 3, 8).rotateZ(Math.PI / 2), '#fff8df', color, 'missile-exhaust', R);
    exhaust.name = 'ProjectileMissileExhaust';
    exhaust.position.x = -R * 1.55;
    tuneBoltMaterial(exhaust.material, { intensity: 5.8, core: 0.78, opacity: 0.94, flowSpeed: 9.0, noiseScale: 2.8 });
    g.add(exhaust);
    const exhaustSheath = boltMesh('proj:missile:sheath',
      () => new THREE.CapsuleGeometry(0.38, 2.05, 3, 8).rotateZ(Math.PI / 2), color, fringe, 'missile-sheath', R);
    exhaustSheath.name = 'ProjectileMissileExhaustSheath';
    exhaustSheath.position.x = -R * 1.8;
    tuneBoltMaterial(exhaustSheath.material, { intensity: 2.2, core: 0.16, opacity: 0.30, flowSpeed: 7.0, noiseScale: 2.1 });
    exhaustSheath.renderOrder = 20;
    exhaust.renderOrder = 21;
    g.add(exhaustSheath);
  } else {
    // Energy / tracer families are drawn by the weapon presenter (stretched card + ribbon).
    // A 3D cylinder here is the 1999–2008 laser the chase camera collapses to a tube.
    g.name = 'ProjectileEnergyLocator';
    g.userData.weaponPresenter = 'energy-card';
    g.userData.variant = presentation.variant;
  }
  g.userData.kind = 'projectile';
  return g;
}

// Per-variant uniform tuning applied once when a variant's material is first cached. Because
// boltMaterial is keyed by `bolt:<color>:<variant>`, each team×variant pair owns its own material
// instance, so tuning siege differently from pulse is safe — they never share a material instance.
// (They do share a GPU program — three.js keys programs by shader source — so this stays cheap.)
function tuneBoltMaterial(material, opts) {
  if (!material || !material.uniforms) return;
  const u = material.uniforms;
  if (u.uIntensity && Number.isFinite(opts.intensity)) u.uIntensity.value = opts.intensity;
  if (u.uOpacity && Number.isFinite(opts.opacity)) u.uOpacity.value = opts.opacity;
  if (u.uCore && Number.isFinite(opts.core)) u.uCore.value = opts.core;
  if (u.uFresnelPower && Number.isFinite(opts.fresnelPower)) u.uFresnelPower.value = opts.fresnelPower;
  if (u.uNoiseScale && Number.isFinite(opts.noiseScale)) u.uNoiseScale.value = opts.noiseScale;
  if (u.uFlowSpeed && Number.isFinite(opts.flowSpeed)) u.uFlowSpeed.value = opts.flowSpeed;
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
  g.userData.kind = 'drone';
  return g;
}

function wreckSurfaceTexture(role, channel = 'basecolor') {
  return getTexture(`wreck-surface-v2:${role}:${channel}`, () => {
    const size = 96;
    const data = new Uint8Array(size * size * 4);
    const palette = {
      structure: [48, 57, 62],
      plate: [82, 70, 58],
      edge: [70, 48, 36],
      ceramic: [156, 145, 123],
      heat: [106, 48, 23],
      cage: [57, 65, 67],
      conduit: [39, 45, 42],
    }[role] || [72, 72, 72];
    const rnd = mulberryLite(hashId(`wreck:${role}:${channel}`));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const verticalSeam = x % 24 < 2;
        const horizontalSeam = y % 32 < 2;
        const seam = verticalSeam || horizontalSeam;
        const directionalWear = Math.max(0, Math.sin((x * 0.14) + (y * 0.035) + role.length));
        const restrainedNoise = (rnd() - 0.5) * 9;
        if (channel === 'normal') {
          data[index] = verticalSeam ? 88 : verticalSeam || horizontalSeam ? 128 : 126;
          data[index + 1] = horizontalSeam ? 88 : 128;
          data[index + 2] = seam ? 238 : 255;
        } else if (channel === 'roughness') {
          const base = role === 'structure' || role === 'cage' ? 150
            : role === 'ceramic' ? 218 : role === 'heat' ? 205 : role === 'conduit' ? 184 : 194;
          const value = Math.max(38, Math.min(242,
            base + restrainedNoise + directionalWear * 16 + (seam ? 22 : 0)));
          data[index] = value;
          data[index + 1] = value;
          const packedMetalness = role === 'structure' || role === 'cage' ? 208
            : role === 'edge' ? 224
              : role === 'heat' ? 168
                : role === 'conduit' ? 96
                  : role === 'ceramic' ? 4 : 34;
          data[index + 2] = packedMetalness;
        } else {
          const heatBand = role === 'heat' ? Math.max(0, 1 - Math.abs(x / size - 0.55) * 3.2) : 0;
          const shade = (seam ? 0.62 : 0.9 + directionalWear * 0.12) + restrainedNoise / 255;
          data[index] = Math.max(0, Math.min(255, palette[0] * shade + heatBand * 72));
          data[index + 1] = Math.max(0, Math.min(255, palette[1] * shade + heatBand * 20));
          data[index + 2] = Math.max(0, Math.min(255, palette[2] * shade));
        }
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.name = `WreckSurface_${role}_${channel}`;
    texture.colorSpace = channel === 'basecolor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 1.5);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  });
}

function wreckRoleMaterial(key, role, options = {}) {
  return getMaterial(key, () => {
    const material = new THREE.MeshStandardMaterial({
      color: options.color || 0xffffff,
      map: wreckSurfaceTexture(role, 'basecolor'),
      normalMap: wreckSurfaceTexture(role, 'normal'),
      normalScale: new THREE.Vector2(options.normalStrength || 0.65, options.normalStrength || 0.65),
      roughnessMap: wreckSurfaceTexture(role, 'roughness'),
      metalnessMap: wreckSurfaceTexture(role, 'roughness'),
      roughness: options.roughness ?? 0.72,
      metalness: options.metalness ?? 0.35,
      emissive: options.emissive || 0x000000,
      emissiveIntensity: options.emissiveIntensity || 0,
    });
    material.name = key;
    // Structure / plate / cut-edge keep distinct families: different maps and shading roles.
    material.userData.spacefaceProgramFamily = `SF_Wreck_${role}`;
    material.userData.spacefaceMaterialRole = options.materialRole || `wreck-${role}`;
    material.userData.spacefaceSurfaceSource = 'deterministic-role-texture-v2';
    material.userData.spacefaceSharedMaterial = true;
    return material;
  });
}

function buildWreck(e) {
  const R = e.radius || 6;
  const g = new THREE.Group();
  const identity = interactionProfileForEntity(e);
  const structure = wreckRoleMaterial('wreck:structure', 'structure', {
    roughness: 0.6, metalness: 0.78, materialRole: 'load-bearing-metal',
  });
  const plate = wreckRoleMaterial('wreck:plate', 'plate', {
    roughness: 0.83, metalness: 0.18, materialRole: 'damaged-coated-hull',
  });
  const cutEdge = wreckRoleMaterial('wreck:cut-edge', 'edge', {
    roughness: 0.68, metalness: 0.72, emissive: 0x230900, emissiveIntensity: 0.1,
    materialRole: 'torn-exposed-metal',
  });
  const rnd = mulberryLite(hashId(e.id));

  // A long, broken load-bearing spine gives wrecks an unmistakable manufactured axis. The old
  // five-box clump plus a broad orange halo read as a molten asteroid at flight scale.
  const spine = new THREE.Mesh(
    getGeometry('wreck:spine', () => new THREE.CylinderGeometry(0.11, 0.15, 1.75, 8).rotateZ(Math.PI / 2)),
    structure,
  );
  spine.name = 'Wreck_Spine_Broken';
  spine.scale.setScalar(R);
  spine.rotation.x = (rnd() - 0.5) * 0.18;
  spine.rotation.y = (rnd() - 0.5) * 0.25;
  g.add(spine);

  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? -1 : 1;
    const hullPlate = new THREE.Mesh(
      getGeometry(`wreck:hull-plate:${i}`, () => new THREE.BoxGeometry(0.72, 0.10, 0.46)),
      i === 3 ? cutEdge : plate,
    );
    hullPlate.name = `Wreck_HullPlate_${i + 1}`;
    hullPlate.position.set(R * (-0.55 + i * 0.34), R * (0.02 + (rnd() - 0.5) * 0.12), side * R * (0.28 + rnd() * 0.16));
    hullPlate.rotation.set((rnd() - 0.5) * 0.55, (rnd() - 0.5) * 0.35, side * (0.16 + rnd() * 0.34));
    hullPlate.scale.setScalar(R * (0.72 + rnd() * 0.18));
    g.add(hullPlate);
  }

  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(
      getGeometry(`wreck:torn-rib:${i}`, () => new THREE.TorusGeometry(0.34, 0.045, 6, 14, Math.PI * 1.45)),
      structure,
    );
    rib.name = `Wreck_TornRib_${i + 1}`;
    rib.position.x = R * (-0.5 + i * 0.5);
    rib.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.18, 0, rnd() * Math.PI * 2);
    rib.scale.setScalar(R);
    g.add(rib);
  }

  for (let i = 0; i < 2; i++) {
    const spar = new THREE.Mesh(
      getGeometry('wreck:spar', () => new THREE.CylinderGeometry(0.035, 0.035, 0.92, 6).rotateX(Math.PI / 2)),
      structure,
    );
    spar.name = `Wreck_ServiceSpar_${i + 1}`;
    spar.position.set(R * (i ? 0.38 : -0.28), R * 0.08, R * (i ? -0.34 : 0.38));
    spar.rotation.z = (rnd() - 0.5) * 0.7;
    spar.scale.setScalar(R);
    g.add(spar);
  }

  if (identity.hazardous) {
    const coreMaterial = getMaterial('wreck:reactor-core', () => new THREE.MeshStandardMaterial({
      color: 0xffd0a0,
      emissive: 0xff4b0b,
      emissiveIntensity: 1.35,
      roughness: 0.32,
      metalness: 0.12,
    }));
    const core = new THREE.Mesh(
      getGeometry('wreck:reactor-core-v2', () => new THREE.CylinderGeometry(0.16, 0.16, 0.48, 12).rotateZ(Math.PI / 2)),
      coreMaterial,
    );
    core.name = 'Wreck_ReactorCore_Unstable';
    core.position.set(R * 0.12, 0, 0);
    core.scale.setScalar(R);
    g.add(core);
    const ceramicMaterial = wreckRoleMaterial('wreck:reactor-ceramic', 'ceramic', {
      roughness: 0.9, metalness: 0.04, materialRole: 'reactor-ceramic', normalStrength: 0.38,
    });
    const heatMaterial = wreckRoleMaterial('wreck:heat-zone', 'heat', {
      roughness: 0.76, metalness: 0.42, emissive: 0x351004, emissiveIntensity: 0.18,
      materialRole: 'heat-affected-metal',
    });
    const cageMaterial = wreckRoleMaterial('wreck:reactor-cage', 'cage', {
      roughness: 0.54, metalness: 0.82, materialRole: 'reactor-cage-metal',
    });
    const conduitMaterial = wreckRoleMaterial('wreck:reactor-conduit', 'conduit', {
      roughness: 0.82, metalness: 0.24, materialRole: 'reactor-service-conduit',
    });
    for (const offset of [-0.19, 0.19]) {
      const collar = new THREE.Mesh(
        getGeometry('wreck:reactor-ceramic-collar', () => new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12).rotateZ(Math.PI / 2)),
        ceramicMaterial,
      );
      collar.name = `Wreck_ReactorCeramic_${offset < 0 ? 'A' : 'B'}`;
      collar.position.set(R * (0.12 + offset), 0, 0);
      collar.scale.setScalar(R);
      g.add(collar);
    }
    for (let i = 0; i < 3; i++) {
      const cage = new THREE.Mesh(
        getGeometry('wreck:reactor-cage', () => new THREE.TorusGeometry(0.27, 0.028, 6, 16)),
        cageMaterial,
      );
      cage.name = `Wreck_ReactorCage_${i + 1}`;
      cage.position.copy(core.position);
      cage.rotation.set(i === 0 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0);
      cage.scale.setScalar(R);
      g.add(cage);
    }
    for (let i = 0; i < 4; i++) {
      const radiator = new THREE.Mesh(
        getGeometry('wreck:reactor-radiator', () => new THREE.BoxGeometry(0.34, 0.035, 0.18)),
        heatMaterial,
      );
      radiator.name = `Wreck_ReactorRadiator_${i + 1}`;
      const side = i % 2 ? -1 : 1;
      radiator.position.set(R * (0.08 + (i > 1 ? 0.18 : -0.08)), side * R * 0.29, side * R * (i > 1 ? -0.12 : 0.12));
      radiator.rotation.x = side * (0.3 + i * 0.08);
      radiator.scale.setScalar(R);
      g.add(radiator);
    }
    for (let i = 0; i < 2; i++) {
      const conduit = new THREE.Mesh(
        getGeometry('wreck:reactor-conduit', () => new THREE.TorusGeometry(0.31, 0.025, 6, 18, Math.PI * 1.45)),
        conduitMaterial,
      );
      conduit.name = `Wreck_ReactorConduit_${i + 1}`;
      conduit.position.set(R * (i ? 0.22 : 0.02), R * (i ? -0.08 : 0.08), 0);
      conduit.rotation.set(Math.PI / 2, i ? Math.PI : 0, i ? 0.5 : -0.5);
      conduit.scale.setScalar(R);
      g.add(conduit);
    }
  }
  g.userData.kind = 'wreck';
  g.userData.interactionKind = identity.kind;
  g.userData.visualLanguage = identity.hazardous ? 'mechanical-reactor-hazard' : 'mechanical-wreckage';
  consolidateWreckDrawCalls(g);
  return g;
}

/**
 * Same look, fewer draws: bake per-piece transforms and merge meshes that already share one
 * material. Hot reactor cores stay discrete so emissive read and future VFX hooks survive.
 */
function consolidateWreckDrawCalls(group) {
  if (!group || !group.children || group.children.length < 2) return;
  const byMaterial = new Map();
  const retained = [];
  for (const child of [...group.children]) {
    if (!child || !child.isMesh || !child.material) {
      retained.push(child);
      continue;
    }
    if ((Number(child.material.emissiveIntensity) || 0) > 0.5) {
      retained.push(child);
      continue;
    }
    const list = byMaterial.get(child.material) || [];
    list.push(child);
    byMaterial.set(child.material, list);
  }
  while (group.children.length) group.remove(group.children[0]);
  for (const child of retained) group.add(child);
  for (const [material, meshes] of byMaterial) {
    if (meshes.length === 1) {
      group.add(meshes[0]);
      continue;
    }
    const geos = [];
    for (const mesh of meshes) {
      mesh.updateMatrix();
      const cloned = mesh.geometry.clone();
      cloned.applyMatrix4(mesh.matrix);
      geos.push(cloned);
    }
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) {
      for (const mesh of meshes) group.add(mesh);
      continue;
    }
    const batch = new THREE.Mesh(merged, material);
    batch.name = `Wreck_Batch_${material.name || material.userData?.spacefaceProgramFamily || 'shared'}`;
    batch.castShadow = true;
    batch.receiveShadow = true;
    group.add(batch);
  }
}

function buildMine(e) {
  const R = Math.max(1, Number(e && e.radius) || 6);
  const g = new THREE.Group();
  const casing = getMaterial('mine:casing', () => new THREE.MeshStandardMaterial({
    color: 0x252d31, roughness: 0.68, metalness: 0.58,
  }));
  const exposed = getMaterial('mine:exposed-alloy', () => new THREE.MeshStandardMaterial({
    color: 0x747b7f, roughness: 0.39, metalness: 0.82,
  }));
  const warningSafe = getMaterial('mine:warning-lens:safe', () => new THREE.MeshStandardMaterial({
    name: 'MineWarningLensSafe',
    color: 0x421d17, emissive: 0x160300, emissiveIntensity: 0.08,
    roughness: 0.51, metalness: 0.12,
  }));
  const warningArmed = getMaterial('mine:warning-lens:armed', () => new THREE.MeshStandardMaterial({
    name: 'MineWarningLensArmed',
    color: 0xff7b28, emissive: 0xff2e08, emissiveIntensity: 1.35,
    roughness: 0.24, metalness: 0.12,
  }));

  const hull = new THREE.Mesh(
    getGeometry('mine:disc-hull', () => new THREE.CylinderGeometry(0.5, 0.56, 0.24, 16)),
    casing,
  );
  hull.name = 'MinePressureHull';
  g.add(hull);
  const armorRing = new THREE.Mesh(
    getGeometry('mine:armor-ring', () => new THREE.TorusGeometry(0.48, 0.065, 6, 18).rotateX(Math.PI / 2)),
    exposed,
  );
  armorRing.name = 'MineArmorRing';
  armorRing.position.y = 0.08;
  g.add(armorRing);
  const lens = new THREE.Mesh(
    getGeometry('mine:warning-lens', () => new THREE.CylinderGeometry(0.15, 0.18, 0.06, 12)),
    warningSafe,
  );
  lens.name = 'MineArmingLens';
  lens.position.y = 0.16;
  g.add(lens);

  const vaneGeometry = getGeometry('mine:sensor-vane', () => new THREE.BoxGeometry(0.42, 0.055, 0.13));
  const tipGeometry = getGeometry('mine:sensor-tip', () => new THREE.ConeGeometry(0.09, 0.26, 6).rotateZ(-Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const vane = new THREE.Mesh(vaneGeometry, casing);
    vane.name = `MineSensorVane_${i + 1}`;
    vane.position.set(Math.cos(angle) * 0.67, 0, Math.sin(angle) * 0.67);
    vane.rotation.y = -angle;
    g.add(vane);
    const tip = new THREE.Mesh(tipGeometry, exposed);
    tip.name = `MineProximityAntenna_${i + 1}`;
    tip.position.set(Math.cos(angle) * 0.96, 0, Math.sin(angle) * 0.96);
    tip.rotation.y = -angle;
    g.add(tip);
  }
  g.scale.setScalar(R);
  g.userData.kind = 'mine';
  g.userData.interactionKind = 'combat-mine';
  g.userData.visualLanguage = 'armored-proximity-mine';
  let visualArmed = null;
  g.userData.updateRuntimeState = (entity) => {
    const nextArmed = entity?.data?.armed === true;
    if (nextArmed === visualArmed) return;
    visualArmed = nextArmed;
    lens.material = nextArmed ? warningArmed : warningSafe;
    lens.scale.setScalar(nextArmed ? 1 : 0.82);
    g.userData.visualArmed = nextArmed;
  };
  g.userData.updateRuntimeState(e);
  return g;
}

// SF-10 vector mine (type 'vectormine'). A compact IMPULSE emitter — deliberately distinct from the
// armored, orange-warning damage mine above: a cool-blue charge core with four radial emitter fins
// (the directional-shove motif) and an arming pip that lights when it goes live.
function buildVectorMine(e) {
  const R = Math.max(0.8, Number(e && e.radius) || 1.6);
  const g = new THREE.Group();
  const shell = getMaterial('vmine:shell', () => new THREE.MeshStandardMaterial({
    color: 0x1c2a3a, roughness: 0.5, metalness: 0.66,
  }));
  const emitterSafe = getMaterial('vmine:emitter:safe', () => new THREE.MeshStandardMaterial({
    name: 'VectorMineEmitterSafe',
    color: 0x27506e, emissive: 0x0a2038, emissiveIntensity: 0.22, roughness: 0.4, metalness: 0.3,
  }));
  const emitterArmed = getMaterial('vmine:emitter:armed', () => new THREE.MeshStandardMaterial({
    name: 'VectorMineEmitterArmed',
    color: 0x5ab4ff, emissive: 0x2a8cff, emissiveIntensity: 1.5, roughness: 0.28, metalness: 0.2,
  }));
  const core = new THREE.Mesh(getGeometry('vmine:core', () => new THREE.OctahedronGeometry(0.5, 0)), shell);
  core.name = 'VectorMineCore';
  g.add(core);
  const finGeo = getGeometry('vmine:emitter', () => new THREE.BoxGeometry(0.55, 0.07, 0.16));
  const emitters = [];
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const fin = new THREE.Mesh(finGeo, emitterSafe);
    fin.name = `VectorMineEmitter_${i + 1}`;
    fin.position.set(Math.cos(angle) * 0.62, 0, Math.sin(angle) * 0.62);
    fin.rotation.y = -angle;
    g.add(fin);
    emitters.push(fin);
  }
  const pip = new THREE.Mesh(getGeometry('vmine:pip', () => new THREE.OctahedronGeometry(0.16, 0)), emitterSafe);
  pip.name = 'VectorMineArmingPip';
  pip.position.y = 0.36;
  g.add(pip);
  emitters.push(pip);
  g.scale.setScalar(R);
  g.userData.kind = 'vectormine';
  g.userData.interactionKind = 'impulse-mine';
  g.userData.visualLanguage = 'radial-impulse-emitter';
  let visualArmed = null;
  g.userData.updateRuntimeState = (entity) => {
    const nextArmed = entity?.data?.armed === true;
    if (nextArmed === visualArmed) return;
    visualArmed = nextArmed;
    for (const m of emitters) m.material = nextArmed ? emitterArmed : emitterSafe;
    g.userData.visualArmed = nextArmed;
  };
  g.userData.updateRuntimeState(e);
  return g;
}

function buildImpulseCharge(e) {
  const R = Math.max(0.4, Number(e && e.radius) || 1.2);
  const g = new THREE.Group();
  const shell = getMaterial('charge:shell', () => new THREE.MeshStandardMaterial({
    color: 0x31393e, roughness: 0.54, metalness: 0.64,
  }));
  const ceramic = getMaterial('charge:ceramic-band', () => new THREE.MeshStandardMaterial({
    color: 0xd1c6ab, roughness: 0.77, metalness: 0.04,
  }));
  const safe = getMaterial('charge:status-strip:safe', () => new THREE.MeshStandardMaterial({
    name: 'ImpulseChargeStatusSafe',
    color: 0x293331, emissive: 0x00100b, emissiveIntensity: 0.06,
    roughness: 0.58, metalness: 0.18,
  }));
  const armed = getMaterial('charge:status-strip:armed', () => new THREE.MeshStandardMaterial({
    name: 'ImpulseChargeStatusArmed',
    color: 0xffa23a, emissive: 0xff4a08, emissiveIntensity: 1.1,
    roughness: 0.31, metalness: 0.18,
  }));

  const body = new THREE.Mesh(
    getGeometry('charge:body', () => new THREE.CylinderGeometry(0.34, 0.4, 1.15, 12).rotateZ(Math.PI / 2)),
    shell,
  );
  body.name = 'ImpulseChargePressureBody';
  g.add(body);
  for (const x of [-0.42, 0.42]) {
    const collar = new THREE.Mesh(
      getGeometry('charge:ceramic-collar', () => new THREE.TorusGeometry(0.38, 0.055, 6, 14).rotateY(Math.PI / 2)),
      ceramic,
    );
    collar.position.x = x;
    g.add(collar);
  }
  const statusStrip = new THREE.Mesh(
    getGeometry('charge:status-strip', () => new THREE.BoxGeometry(0.5, 0.045, 0.08)),
    safe,
  );
  statusStrip.name = 'ImpulseChargeArmingStrip';
  statusStrip.position.set(0, 0.36, 0);
  g.add(statusStrip);
  const padGeometry = getGeometry('charge:adhesion-pad', () => new THREE.BoxGeometry(0.26, 0.08, 0.22));
  for (const x of [-0.27, 0.27]) {
    const pad = new THREE.Mesh(padGeometry, shell);
    pad.name = 'ImpulseChargeAdhesionPad';
    pad.position.set(x, -0.39, 0);
    g.add(pad);
  }
  g.scale.setScalar(R);
  g.userData.kind = 'charge';
  g.userData.interactionKind = 'impulse-charge';
  g.userData.visualLanguage = 'sticky-impulse-charge';
  let visualArmed = null;
  g.userData.updateRuntimeState = (entity) => {
    const nextArmed = entity?.data?.armed === true;
    if (nextArmed === visualArmed) return;
    visualArmed = nextArmed;
    statusStrip.material = nextArmed ? armed : safe;
    statusStrip.scale.set(nextArmed ? 1 : 0.72, 1, 1);
    g.userData.visualArmed = nextArmed;
  };
  g.userData.updateRuntimeState(e);
  return g;
}

// PQ-011 / SF-11 deployable anchor Mass Seed (type 'massSeed'). A contained-mass/frame-lock
// device — deliberately NOT a glowing orb: a dense faceted containment core carried by four
// folding frame struts. The struts are the state readout: folded along the hull in flight,
// extending outward as the frame lock spins up, fully deployed while the anchor is live, half
// retracted inside the expiry warning, and folded shut as the seed collapses. Color is redundant
// with silhouette; the expiry countdown lives in the HUD (non-color, non-motion primary).
function buildMassSeed(e) {
  const R = Math.max(0.8, Number(e && e.radius) || 1.6);
  const g = new THREE.Group();
  const frame = getMaterial('mseed:frame', () => new THREE.MeshStandardMaterial({
    color: 0x2b3138, roughness: 0.48, metalness: 0.72,
  }));
  const coreMat = getMaterial('mseed:core', () => new THREE.MeshStandardMaterial({
    color: 0x14181f, emissive: 0x0a1626, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.85,
  }));
  const ringMat = getMaterial('mseed:gyro', () => new THREE.MeshStandardMaterial({
    color: 0x3d4a57, emissive: 0x1a2c40, emissiveIntensity: 0.5, roughness: 0.36, metalness: 0.7,
  }));
  const beaconDim = getMaterial('mseed:beacon:dim', () => new THREE.MeshStandardMaterial({
    name: 'MassSeedBeaconDim',
    color: 0x2a3438, emissive: 0x062026, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.3,
  }));
  const beaconActive = getMaterial('mseed:beacon:active', () => new THREE.MeshStandardMaterial({
    name: 'MassSeedBeaconActive',
    color: 0x9fe8ff, emissive: 0x2fc4ef, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.2,
  }));
  const beaconWarning = getMaterial('mseed:beacon:warning', () => new THREE.MeshStandardMaterial({
    name: 'MassSeedBeaconWarning',
    color: 0xffc35c, emissive: 0xef8a1e, emissiveIntensity: 1.35, roughness: 0.32, metalness: 0.18,
  }));
  const chevronMat = getMaterial('mseed:chevron', () => new THREE.MeshStandardMaterial({
    name: 'MassSeedChevron',
    color: 0x6fb7d8, emissive: 0x1f7ea8, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.25,
  }));

  const core = new THREE.Mesh(getGeometry('mseed:core', () => new THREE.OctahedronGeometry(0.42, 0)), coreMat);
  core.name = 'MassSeedContainmentCore';
  g.add(core);

  const ring = new THREE.Mesh(
    getGeometry('mseed:gyro-ring', () => new THREE.TorusGeometry(0.52, 0.045, 6, 18).rotateX(Math.PI / 2)),
    ringMat,
  );
  ring.name = 'MassSeedFrameLockGyro';
  g.add(ring);

  const strutGeometry = getGeometry('mseed:strut', () => new THREE.BoxGeometry(0.46, 0.06, 0.12));
  const pylonGeometry = getGeometry('mseed:pylon', () => new THREE.ConeGeometry(0.09, 0.3, 4));
  const struts = [];
  const pylons = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const strut = new THREE.Mesh(strutGeometry, frame);
    strut.name = `MassSeedFrameStrut_${i + 1}`;
    strut.userData.anchorAngle = angle;
    g.add(strut);
    struts.push(strut);
    if (i < 3) {
      const pylon = new THREE.Mesh(pylonGeometry, frame);
      pylon.name = `MassSeedAnchorPylon_${i + 1}`;
      pylon.userData.anchorAngle = (i * Math.PI * 2) / 3;
      g.add(pylon);
      pylons.push(pylon);
    }
  }

  const beacon = new THREE.Mesh(getGeometry('mseed:beacon', () => new THREE.OctahedronGeometry(0.15, 0)), beaconDim);
  beacon.name = 'MassSeedStatusBeacon';
  beacon.position.y = 0.5;
  g.add(beacon);

  const chevronGeometry = getGeometry('mseed:chevron', () => new THREE.ConeGeometry(0.1, 0.26, 3).rotateZ(Math.PI / 2));
  const chevrons = [];
  for (const z of [-0.16, 0.16]) {
    const chevron = new THREE.Mesh(chevronGeometry, chevronMat);
    chevron.name = 'MassSeedTravelChevron';
    chevron.position.set(-0.5, 0, z);
    g.add(chevron);
    chevrons.push(chevron);
  }

  g.scale.setScalar(R);
  g.userData.kind = 'massSeed';
  g.userData.interactionKind = 'anchor-seed';
  g.userData.visualLanguage = 'frame-lock-containment-anchor';

  // Phase-driven pose. Wall-clock eases are render-only (the sim contract allows cosmetic render
  // time); all STATE comes from entity.data.massSeedState. No per-frame allocation.
  let lastPhase = null;
  let phaseWallT = 0;
  const ease = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
  g.userData.updateRuntimeState = (entity, now) => {
    const seedState = entity && entity.data && entity.data.massSeedState;
    const phase = seedState && seedState.phase || 'travel';
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseWallT = Number.isFinite(now) ? now : 0;
    }
    const t = Number.isFinite(now) ? Math.max(0, now - phaseWallT) : 1;
    // Strut deployment target per phase: 0 folded (travel/collapse), 1 deployed (locked anchor),
    // partial in the frame-lock spin-up and the expiry warning (an unmistakable silhouette delta).
    let deployTarget = 0;
    let beaconMat = beaconDim;
    let gyroSpin = 0;
    if (phase === 'locking') { deployTarget = 1; beaconMat = beaconDim; gyroSpin = 6; }
    else if (phase === 'active') { deployTarget = 1; beaconMat = beaconActive; }
    else if (phase === 'warning') { deployTarget = 0.82; beaconMat = beaconWarning; }
    const deploy = phase === 'travel' || phase === 'collapsing' ? 0 : ease(t / 0.35) * deployTarget;
    for (const strut of struts) {
      const a = strut.userData.anchorAngle;
      const radius = 0.34 + deploy * 0.44;
      strut.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      strut.rotation.y = -a;
      strut.scale.x = 0.72 + deploy * 0.62;
    }
    for (const pylon of pylons) {
      const a = pylon.userData.anchorAngle;
      pylon.position.set(Math.cos(a) * (0.5 + deploy * 0.2), -0.28 - deploy * 0.14, Math.sin(a) * (0.5 + deploy * 0.2));
      pylon.scale.setScalar(Math.max(0.001, deploy));
    }
    ring.rotation.y = gyroSpin > 0 ? t * gyroSpin : 0;
    ring.scale.setScalar(0.9 + deploy * 0.2);
    beacon.material = beaconMat;
    beacon.scale.setScalar(phase === 'warning' ? 1.25 : 1);
    for (const chevron of chevrons) chevron.visible = phase === 'travel';
    g.userData.visualPhase = phase;
  };
  g.userData.updateRuntimeState(e, 0);
  return g;
}

// PQ-030 Transverse Snare endpoint. The two compact forged brackets use both hue and silhouette
// (square A / diamond B) so the line remains parseable under color-vision deficiency and reduced
// effects. The cable itself is rendered by the existing Massline ribbon owner.
function buildMasslineSnareAnchor(e) {
  const R = Math.max(0.8, Number(e && e.radius) || 2.4);
  const endpoint = String(e && e.data && e.data.endpoint || 'A');
  const accent = endpoint === 'B' ? 0xffb45f : 0x7de0ff;
  const g = new THREE.Group();
  const frame = getMaterial('snare-anchor:frame', () => new THREE.MeshStandardMaterial({
    color: 0x28323a, roughness: 0.5, metalness: 0.78,
  }));
  const glow = getMaterial(`snare-anchor:glow:${endpoint}`, () => new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.7, roughness: 0.24, metalness: 0.45,
  }));
  const core = new THREE.Mesh(
    getGeometry('snare-anchor:core', () => new THREE.CylinderGeometry(0.42, 0.5, 0.28, 8)),
    frame,
  );
  core.scale.setScalar(R);
  g.add(core);
  const railGeo = getGeometry('snare-anchor:rail', () => new THREE.BoxGeometry(1.35, 0.18, 0.18));
  const railA = new THREE.Mesh(railGeo, frame);
  const railB = new THREE.Mesh(railGeo, frame);
  railA.position.z = 0.48 * R;
  railB.position.z = -0.48 * R;
  railA.scale.setScalar(R);
  railB.scale.setScalar(R);
  g.add(railA, railB);
  const signal = new THREE.Mesh(
    getGeometry('snare-anchor:signal', () => new THREE.TorusGeometry(0.56, 0.07, 5, 16)),
    glow,
  );
  signal.rotation.x = Math.PI / 2;
  signal.position.y = 0.2 * R;
  signal.scale.setScalar(R);
  g.add(signal);
  if (endpoint === 'B') g.rotation.y = Math.PI / 4;
  g.userData.kind = 'masslineSnareAnchor';
  g.userData.endpoint = endpoint;
  return g;
}

function buildFallback(e) {
  const root = new THREE.Group();
  root.name = `VisualBuildFailed_${e && e.type || 'unknown'}`;
  root.visible = false;
  root.userData.visualBuildFailed = true;
  root.userData.failedEntityType = e && e.type || 'unknown';
  return root;
}

function buildPayload(e) {
  const R = Math.max(1, (e && e.radius) || 3);
  const g = new THREE.Group();
  const shell = getMaterial('payload:shell', () => new THREE.MeshStandardMaterial({
    color: 0x46515a, roughness: 0.64, metalness: 0.58,
  }));
  const band = getMaterial('payload:band', () => new THREE.MeshStandardMaterial({
    color: 0xd7862c, roughness: 0.5, metalness: 0.34,
  }));
  const body = new THREE.Mesh(
    getGeometry('payload:body', () => new THREE.CylinderGeometry(0.42, 0.48, 1.25, 10).rotateZ(Math.PI / 2)),
    shell,
  );
  g.add(body);
  for (const x of [-0.48, 0.48]) {
    const collar = new THREE.Mesh(
      getGeometry('payload:collar', () => new THREE.TorusGeometry(0.48, 0.055, 6, 12).rotateY(Math.PI / 2)),
      band,
    );
    collar.position.x = x;
    g.add(collar);
  }
  const transponder = new THREE.Mesh(
    getGeometry('payload:transponder', () => new THREE.OctahedronGeometry(0.16, 0)),
    getMaterial('payload:transponder', () => new THREE.MeshStandardMaterial({
      color: 0x8eeaff, emissive: 0x2abbd8, emissiveIntensity: 0.8, roughness: 0.38, metalness: 0.16,
    })),
  );
  transponder.position.y = 0.47;
  g.add(transponder);
  g.scale.setScalar(R);
  g.userData.kind = 'payload';
  g.userData.interactionKind = 'payload';
  g.userData.visualLanguage = 'sealed-cargo-canister';
  return g;
}

// Foundry geometry is deliberately built from a small family of authored profiles rather than
// raw boxes. RoundedBoxGeometry gives each structural role its own edge radius and a real chamfer
// under grazing light while keeping the geometry cache bounded by the data-driven dimensions.
function foundryRoundedBox(key, width, height, depth, radius, segments = 1) {
  const w = Math.max(0.01, width);
  const h = Math.max(0.01, height);
  const d = Math.max(0.01, depth);
  const r = Math.max(0.01, Math.min(radius, w * 0.48, h * 0.48, d * 0.48));
  return getGeometry(`${key}:${q(w)}:${q(h)}:${q(d)}:${q(r)}:${segments}`, () => (
    new RoundedBoxGeometry(w, h, d, segments, r)
  ));
}

function foundryCylinder(key, radiusTop, radiusBottom, height, radialSegments = 8) {
  const rt = Math.max(0.01, radiusTop);
  const rb = Math.max(0.01, radiusBottom);
  const h = Math.max(0.01, height);
  return getGeometry(`${key}:${q(rt)}:${q(rb)}:${q(h)}:${radialSegments}`, () => (
    new THREE.CylinderGeometry(rt, rb, h, radialSegments)
  ));
}

function foundryTorus(key, radius, tube, radialSegments = 8, tubularSegments = 16) {
  const r = Math.max(0.01, radius);
  const t = Math.max(0.01, Math.min(tube, r * 0.45));
  return getGeometry(`${key}:${q(r)}:${q(t)}:${radialSegments}:${tubularSegments}`, () => (
    new THREE.TorusGeometry(r, t, radialSegments, tubularSegments)
  ));
}

function buildRicochetFoundrySurface(e) {
  const spec = e && e.data && e.data.foundrySurface;
  if (!spec) return null;
  const length = Math.max(1, spec.halfLength * 2);
  const width = Math.max(1, spec.halfWidth * 2);
  const height = Math.max(2, spec.height || 24);
  const kind = spec.kind || 'plate';
  const frame = getMaterial('foundry:v2:frame', () => new THREE.MeshStandardMaterial({
    color: 0x1c2933, metalness: 0.84, roughness: 0.38,
  }));
  const frameDark = getMaterial('foundry:v2:frame-dark', () => new THREE.MeshStandardMaterial({
    color: 0x0b1219, metalness: 0.72, roughness: 0.58,
  }));
  const edge = getMaterial('foundry:v2:edge-paint', () => new THREE.MeshStandardMaterial({
    color: 0xb85a1c, emissive: 0x2d0e03, emissiveIntensity: 0.62,
    metalness: 0.5, roughness: 0.3,
  }));
  const edgeHighlight = getMaterial('foundry:v2:edge-highlight', () => new THREE.MeshStandardMaterial({
    color: 0xf1a143, emissive: 0x3a1205, emissiveIntensity: 0.7,
    metalness: 0.62, roughness: 0.24,
  }));
  const mirror = getMaterial('foundry:v2:mirror-face', () => new THREE.MeshPhysicalMaterial({
    color: 0x84b9c7, metalness: 0.9, roughness: 0.11,
    clearcoat: 0.52, clearcoatRoughness: 0.14,
    envMap: SHIP_ENV_MAP, envMapIntensity: 1.55,
  }));
  const mirrorAlt = getMaterial('foundry:v2:mirror-variation', () => new THREE.MeshPhysicalMaterial({
    color: 0x4f7b89, metalness: 0.96, roughness: 0.23,
    clearcoat: 0.32, clearcoatRoughness: 0.22,
    envMap: SHIP_ENV_MAP, envMapIntensity: 1.2,
  }));
  const mirrorEdge = getMaterial('foundry:v2:mirror-edge', () => new THREE.MeshPhysicalMaterial({
    color: 0xb4d6db, metalness: 0.98, roughness: 0.075,
    clearcoat: 0.68, clearcoatRoughness: 0.1,
    envMap: SHIP_ENV_MAP, envMapIntensity: 1.8,
  }));
  const seal = getMaterial('foundry:v2:seal', () => new THREE.MeshStandardMaterial({
    color: 0x151e25, metalness: 0.66, roughness: 0.46,
  }));
  const fastener = getMaterial('foundry:v2:fastener', () => new THREE.MeshStandardMaterial({
    color: 0x768c96, metalness: 0.94, roughness: 0.2,
  }));
  const refractory = getMaterial('foundry:v2:refractory', () => new THREE.MeshStandardMaterial({
    color: 0x2a1b19, metalness: 0.22, roughness: 0.9,
  }));
  const refractoryDark = getMaterial('foundry:v2:refractory-dark', () => new THREE.MeshStandardMaterial({
    color: 0x120e10, metalness: 0.18, roughness: 0.95,
  }));
  const hot = getMaterial('foundry:v2:hot', () => new THREE.MeshStandardMaterial({
    color: 0x7a2410, emissive: 0xff4a16, emissiveIntensity: 2.3,
    metalness: 0.3, roughness: 0.3,
  }));
  const g = new THREE.Group();

  const bodyMaterial = kind === 'furnace' ? refractory : frame;
  const bodyRadius = kind === 'furnace' ? Math.min(8, width * 0.18) : Math.min(4.5, width * 0.16);
  const body = new THREE.Mesh(
    foundryRoundedBox(`foundry:v2:${kind}:collision-shell`, length, height, width, bodyRadius),
    bodyMaterial,
  );
  body.name = `foundry-${kind}-collision-shell`;
  body.position.y = height * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.collisionBody = true;
  body.userData.staticBatch = false;
  body.userData.foundryRole = 'collision-shell';
  g.add(body);

  if (kind === 'plate' || kind === 'loose_plate') {
    const loose = kind === 'loose_plate';
    const insetLength = length * (loose ? 0.79 : 0.82);
    const insetWidth = width * 0.7;
    const lowerSkirt = new THREE.Mesh(
      foundryRoundedBox(`foundry:v2:${kind}:lower-skirt`, length * 0.92, Math.max(2.4, height * 0.12), width * 0.88, Math.min(2.2, width * 0.12)),
      frameDark,
    );
    lowerSkirt.name = `foundry-${kind}-lower-skirt`;
    lowerSkirt.position.y = Math.max(1.4, height * 0.08);
    lowerSkirt.castShadow = true;
    lowerSkirt.receiveShadow = true;
    lowerSkirt.userData.foundryRole = 'base-foot';
    g.add(lowerSkirt);

    // The dark bed is an actual recess. The reflective face is inset inside a separate seal and
    // raised only slightly above it, so the camera catches the rim, gap and changing face response.
    const bed = new THREE.Mesh(
      foundryRoundedBox(`foundry:v2:${kind}:mirror-bed`, insetLength, 1.65, insetWidth, Math.min(2.2, width * 0.1)),
      seal,
    );
    bed.name = `foundry-${kind}-mirror-recess`;
    bed.position.y = height + 0.78;
    bed.receiveShadow = true;
    bed.userData.foundryRole = 'reflective-recess';
    g.add(bed);

    // Two independently beveled mirror leaves are separated by a structural center spine. The
    // slight response variation is deliberate: this is plate steel with resurfaced and older
    // sections, not one uniformly tinted plastic slab.
    const leafGap = Math.max(2.2, Math.min(7, length * 0.035));
    const leafLength = Math.max(3, (insetLength - leafGap) * 0.5);
    const leafWidth = Math.max(2.5, insetWidth * 0.79);
    const leafGeo = foundryRoundedBox(
      `foundry:v2:${kind}:mirror-leaf`, leafLength, 1.15, leafWidth, Math.min(1.3, width * 0.07), 1,
    );
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeo, side < 0 ? mirror : mirrorAlt);
      leaf.name = `foundry-${kind}-mirror-leaf-${side < 0 ? 'aft' : 'forward'}`;
      leaf.position.set(side * (leafLength + leafGap) * 0.5, height + 1.96, 0);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      leaf.userData.foundryRole = 'reflective-surface';
      g.add(leaf);
    }
    const spine = new THREE.Mesh(
      foundryRoundedBox(`foundry:v2:${kind}:center-spine`, leafGap * 0.72, 2.3, leafWidth * 0.92, Math.min(0.9, leafGap * 0.26)),
      frameDark,
    );
    spine.name = `foundry-${kind}-center-load-spine`;
    spine.position.y = height + 1.9;
    spine.castShadow = true;
    spine.userData.foundryRole = 'center-load-spine';
    g.add(spine);

    // Cross supports sit in the panel breaks and visibly carry the leaf loads into the shell.
    // They are not decorative floating bars: each has a chamfered foot, a raised saddle and a
    // fastener pair at the upper interface.
    const supportXs = [-0.27, 0.27].map((t) => t * insetLength);
    const supportGeo = foundryRoundedBox(
      `foundry:v2:${kind}:cross-support`, Math.max(3.6, length * 0.065), Math.max(2.4, height * 0.2), leafWidth * 0.88,
      Math.min(1.1, width * 0.055),
    );
    for (const x of supportXs) {
      const support = new THREE.Mesh(supportGeo, frame);
      support.name = `foundry-${kind}-cross-support`;
      support.position.set(x, height + 0.82, 0);
      support.castShadow = true;
      support.userData.foundryRole = 'load-support';
      g.add(support);
    }

    // A narrow mirror edge cap gives the bank a readable highlight at the supported game-camera
    // distance without resorting to a glow card or an unlit outline.
    const capGeo = foundryRoundedBox(
      `foundry:v2:${kind}:mirror-cap`, Math.max(4, insetLength * 0.86), 0.52, Math.max(1.0, width * 0.055),
      Math.min(0.45, width * 0.02),
    );
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, mirrorEdge);
      cap.name = `foundry-${kind}-mirror-cap`;
      cap.position.set(0, height + 2.53, side * Math.max(0, leafWidth * 0.48));
      cap.castShadow = true;
      cap.userData.foundryRole = 'mirror-edge-cap';
      g.add(cap);
    }

    const rimLongGeo = foundryRoundedBox(
      `foundry:v2:${kind}:rim-long`, insetLength + 3, 1.0, Math.max(1.2, width * 0.065), Math.min(0.55, width * 0.025),
    );
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(rimLongGeo, edge);
      rim.name = `foundry-${kind}-warning-rim`;
      rim.position.set(0, height + 2.03, side * Math.max(0, insetWidth * 0.49));
      rim.castShadow = true;
      rim.userData.foundryRole = 'warning-rim';
      g.add(rim);
    }

    const endShoeLength = Math.max(5.2, length * 0.085);
    const endShoeGeo = foundryRoundedBox(
      `foundry:v2:${kind}:end-clamp`, endShoeLength, height * 0.72, width * 0.84,
      Math.min(2.2, width * 0.11),
    );
    const hingeGeo = foundryCylinder(
      `foundry:v2:${kind}:hinge-pin`, Math.max(1.1, width * 0.09), Math.max(1.1, width * 0.09), width * 0.62, 10,
    );
    const hingeRingGeo = foundryTorus(
      `foundry:v2:${kind}:hinge-ring`, Math.max(1.6, width * 0.12), Math.max(0.34, width * 0.035), 8, 14,
    );
    for (const side of [-1, 1]) {
      const x = side * Math.max(0, spec.halfLength - endShoeLength * 0.5);
      const shoe = new THREE.Mesh(endShoeGeo, frameDark);
      shoe.name = `foundry-${kind}-end-clamp`;
      shoe.position.set(x, height * 0.42, 0);
      shoe.castShadow = true;
      shoe.userData.foundryRole = 'end-clamp';
      g.add(shoe);

      const pin = new THREE.Mesh(hingeGeo, fastener);
      pin.name = `foundry-${kind}-hinge-pin`;
      pin.rotation.x = Math.PI / 2;
      pin.position.set(x, height * 0.44, 0);
      pin.castShadow = true;
      pin.userData.foundryRole = 'hinge-load-path';
      g.add(pin);

      const ring = new THREE.Mesh(hingeRingGeo, edgeHighlight);
      ring.name = `foundry-${kind}-hinge-ring`;
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, height * 0.44, 0);
      ring.castShadow = true;
      ring.userData.foundryRole = 'hinge-marking';
      g.add(ring);
    }

    const boltGeo = foundryCylinder(
      `foundry:v2:${kind}:bolt`, Math.max(0.55, width * 0.045), Math.max(0.55, width * 0.045), 0.42, 8,
    );
    for (const x of [-0.31, 0.31].map((t) => t * insetLength)) {
      for (const z of [-1, 1]) {
        const bolt = new THREE.Mesh(boltGeo, fastener);
        bolt.name = `foundry-${kind}-deck-fastener`;
        bolt.position.set(x, height + 2.57, z * leafWidth * 0.43);
        bolt.castShadow = true;
        bolt.userData.foundryRole = 'deck-fastener';
        g.add(bolt);
      }
    }

    const lampBaseGeo = foundryCylinder(
      `foundry:v2:${kind}:warning-base`, Math.max(1.2, width * 0.1), Math.max(1.45, width * 0.12), 0.55, 8,
    );
    const lampGeo = foundryCylinder(
      `foundry:v2:${kind}:warning-lens`, Math.max(0.82, width * 0.065), Math.max(0.94, width * 0.075), 0.75, 8,
    );
    for (const side of [-1, 1]) {
      const x = side * spec.halfLength * 0.66;
      const base = new THREE.Mesh(lampBaseGeo, frameDark);
      base.name = `foundry-${kind}-warning-lamp-base`;
      base.position.set(x, height + 2.92, 0);
      base.castShadow = true;
      g.add(base);
      const lamp = new THREE.Mesh(lampGeo, hot);
      lamp.name = `foundry-${kind}-warning-lamp`;
      lamp.position.set(x, height + 3.55, 0);
      lamp.castShadow = true;
      lamp.userData.foundryRole = 'thermal-warning';
      g.add(lamp);
    }
  } else if (kind === 'wall') {
    const base = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:wall:base', length * 0.96, Math.max(3, height * 0.12), width * 0.9, Math.min(3, width * 0.12)),
      frameDark,
    );
    base.name = 'foundry-wall-base-foot';
    base.position.y = Math.max(1.6, height * 0.07);
    base.castShadow = true;
    base.userData.foundryRole = 'base-foot';
    g.add(base);

    const cap = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:wall:cap', length * 0.97, 2.6, width * 0.86, Math.min(1.3, width * 0.08)),
      frame,
    );
    cap.name = 'foundry-wall-crown-cap';
    cap.position.y = height + 1.1;
    cap.castShadow = true;
    cap.userData.foundryRole = 'crown-cap';
    g.add(cap);

    const pierGeo = foundryRoundedBox(
      'foundry:v2:wall:pier', Math.max(8, Math.min(18, length * 0.018)), height * 0.82, width * 0.78,
      Math.min(2.2, width * 0.09),
    );
    for (const t of [-0.75, -0.25, 0.25, 0.75]) {
      const pier = new THREE.Mesh(pierGeo, t === 0.25 ? edgeHighlight : edge);
      pier.name = 'foundry-wall-load-pier';
      pier.position.set(t * spec.halfLength, height * 0.53, 0);
      pier.castShadow = true;
      pier.userData.foundryRole = 'load-pier';
      g.add(pier);
    }
    const seamGeo = foundryRoundedBox(
      'foundry:v2:wall:top-seam', Math.max(4, length * 0.17), 1.2, Math.max(1, width * 0.11), Math.min(0.55, width * 0.03),
    );
    for (const t of [-0.61, -0.2, 0.2, 0.61]) {
      const seam = new THREE.Mesh(seamGeo, frameDark);
      seam.name = 'foundry-wall-crown-seam';
      seam.position.set(t * spec.halfLength, height + 2.22, 0);
      seam.userData.foundryRole = 'crown-seam';
      g.add(seam);
    }
  } else if (kind === 'shutter') {
    const lower = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:shutter:lower-skirt', length * 0.93, Math.max(3.5, height * 0.13), width * 0.88, Math.min(3, width * 0.1)),
      frameDark,
    );
    lower.name = 'foundry-shutter-lower-skirt';
    lower.position.y = Math.max(2, height * 0.08);
    lower.castShadow = true;
    lower.userData.foundryRole = 'base-foot';
    g.add(lower);

    const slatWidth = Math.max(12, length * 0.08);
    const slatGeo = foundryRoundedBox(
      'foundry:v2:shutter:slat', slatWidth, height * 0.78, width * 0.74, Math.min(2.5, width * 0.08),
    );
    for (let i = -5; i <= 5; i++) {
      const slat = new THREE.Mesh(slatGeo, i % 2 === 0 ? mirrorAlt : frameDark);
      slat.name = 'foundry-shutter-segment';
      slat.position.set(i * length * 0.089, height * 0.56, 0);
      slat.rotation.z = i % 2 === 0 ? Math.PI * 0.025 : -Math.PI * 0.018;
      slat.castShadow = true;
      slat.receiveShadow = true;
      slat.userData.foundryRole = 'segmented-screen';
      g.add(slat);
    }
    const shutterRailGeo = foundryRoundedBox(
      'foundry:v2:shutter:rail', length * 0.91, 1.6, Math.max(1.3, width * 0.07), Math.min(0.7, width * 0.025),
    );
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(shutterRailGeo, edge);
      rail.name = 'foundry-shutter-warning-rail';
      rail.position.set(0, height + 1.25, side * width * 0.37);
      rail.castShadow = true;
      rail.userData.foundryRole = 'warning-rail';
      g.add(rail);
    }
    const actuator = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:shutter:actuator', Math.max(10, length * 0.14), 6.5, width * 0.36, Math.min(1.8, width * 0.08)),
      frame,
    );
    actuator.name = 'foundry-shutter-actuator-housing';
    actuator.position.set(0, height + 3.1, 0);
    actuator.castShadow = true;
    actuator.userData.foundryRole = 'actuator-housing';
    g.add(actuator);
    const actuatorPin = new THREE.Mesh(
      foundryCylinder('foundry:v2:shutter:actuator-pin', Math.max(1.4, width * 0.08), Math.max(1.4, width * 0.08), width * 0.42, 10),
      fastener,
    );
    actuatorPin.name = 'foundry-shutter-actuator-pin';
    actuatorPin.rotation.x = Math.PI / 2;
    actuatorPin.position.set(0, height + 3.1, 0);
    actuatorPin.castShadow = true;
    g.add(actuatorPin);
    const lamp = new THREE.Mesh(
      foundryCylinder('foundry:v2:shutter:warning-lens', Math.max(2.2, width * 0.14), Math.max(2.7, width * 0.16), 1.8, 8),
      hot,
    );
    lamp.name = 'foundry-shutter-warning-lamp';
    lamp.position.set(0, height + 8, 0);
    lamp.castShadow = true;
    lamp.userData.foundryRole = 'thermal-warning';
    g.add(lamp);
  } else if (kind === 'furnace') {
    const base = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:furnace:base', length * 0.94, 6, width * 0.87, Math.min(3, width * 0.1)),
      refractoryDark,
    );
    base.name = 'foundry-furnace-base-foot';
    base.position.y = 3;
    base.castShadow = true;
    base.userData.foundryRole = 'base-foot';
    g.add(base);

    const chamber = new THREE.Mesh(
      foundryRoundedBox('foundry:v2:furnace:chamber-recess', length * 0.72, 4.4, width * 0.62, Math.min(2, width * 0.08)),
      refractoryDark,
    );
    chamber.name = 'foundry-furnace-chamber-recess';
    chamber.position.y = height + 1.8;
    chamber.receiveShadow = true;
    chamber.userData.foundryRole = 'refractory-recess';
    g.add(chamber);

    const slitGeo = foundryRoundedBox(
      'foundry:v2:furnace:heat-slot', length * 0.2, 2.0, Math.max(5, width * 0.06), Math.min(0.7, width * 0.025),
    );
    for (let i = -2; i <= 2; i++) {
      const slit = new THREE.Mesh(slitGeo, hot);
      slit.name = 'foundry-furnace-heat-slot';
      slit.position.set(i * length * 0.18, height + 4.35, 0);
      slit.castShadow = true;
      slit.userData.foundryRole = 'heat-slot';
      g.add(slit);
    }
    const stackGeo = foundryCylinder('foundry:v2:furnace:stack', 13, 18, 82, 10);
    const collarGeo = foundryTorus('foundry:v2:furnace:stack-collar', 16, 2.6, 8, 16);
    for (const side of [-1, 1]) {
      const stack = new THREE.Mesh(stackGeo, frameDark);
      stack.name = 'foundry-furnace-stack';
      stack.position.set(side * length * 0.34, height + 39, 0);
      stack.castShadow = true;
      stack.userData.foundryRole = 'heat-stack';
      g.add(stack);
      const collar = new THREE.Mesh(collarGeo, edge);
      collar.name = 'foundry-furnace-stack-collar';
      collar.position.set(side * length * 0.34, height + 6, 0);
      collar.castShadow = true;
      collar.userData.foundryRole = 'heat-stack-collar';
      g.add(collar);
    }
  }

  g.userData.kind = 'ricochet-foundry-surface';
  g.userData.foundrySurfaceId = spec.id;
  g.userData.visualCollisionBounds = { halfLength: spec.halfLength, halfWidth: spec.halfWidth };
  g.userData.foundryVisualRevision = 'v2-structured-bank';
  return optimizeStaticBatchesForRoot(g);
}

// ---------------------------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------------------------
// WebGL context restore: the module-level caches hold CPU-side geometry/material/texture
// descriptors, but externally loaded images and any GPU upload handles may be stale. Clear them
// so the next build() re-creates fresh Three objects against the restored context.
function disposeMapValues(map) {
  for (const obj of map.values()) {
    if (!obj) continue;
    try { if (typeof obj.dispose === 'function') obj.dispose(); } catch (_) { /* ignore */ }
  }
  map.clear();
}

export function invalidateVisualFactoryCaches() {
  disposeMapValues(_tex);
  disposeMapValues(_geo);
  disposeMapValues(_mat);
  disposeMapValues(_extTex);
  SHIP_ENV_MAP = null;
}

export function createVisualFactory() {
  return {
    build(e) {
      try {
        if (!e) return null;
        if (e.data && e.data.arenaSurface && e.data.foundrySurface) {
          return buildRicochetFoundrySurface(e);
        }
        switch (e.type) {
          case 'ship': return optimizeStaticBatches(buildShipMesh(e, resolvePalette(e)));
          case 'asteroid': return freezeStaticPresentation(buildAsteroid(e));
          case 'station': return freezeStaticPresentation(attachStationHlod(buildStation(e), e));
          case 'pickup': return buildPickup(e);
          case 'projectile': return buildProjectile(e);
          case 'drone': return buildDrone(e);
          case 'payload': return buildPayload(e);
          case 'mine': return buildMine(e);
          case 'vectormine': return buildVectorMine(e);
          case 'charge': return buildImpulseCharge(e);
          case 'massSeed': return buildMassSeed(e);
          case 'masslineSnareAnchor': return buildMasslineSnareAnchor(e);
          case 'wreck': return freezeStaticPresentation(buildWreck(e));
          // PQ-013: the colossal planet-site body (Q18 identity transaction spawns exactly one).
          case 'planet': return freezeStaticPresentation(buildPlanetSiteVisual(e));
          case 'fx': return null; // fx entities are handled by the vfx particle system, not meshed
          default: return buildFallback(e);
        }
      } catch (err) {
        if (globalThis && globalThis.__SF_VISUAL_FACTORY_THROW__) throw err;
        if (globalThis && globalThis.__SF_VISUAL_FACTORY_LOG_FALLBACKS__) {
          const kind = e && e.type ? e.type : 'unknown';
          const defId = e && e.data && e.data.defId ? e.data.defId : '';
          console.warn(`[visualFactory] fallback ${kind}${defId ? `:${defId}` : ''}`, err);
        }
        try { return buildFallback(e); } catch (_e) { return null; }
      }
    },
  };
}
