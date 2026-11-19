// src/render/faunaVisuals.js — procedural bodies for ecological fauna (doc 02/03).
// No authored GLBs in the slice: every body is built from primitives and reads "organic",
// never mechanical. Palette comes from the site's strain (data.strainId on the entity).
// Entities are kinematic (type 'fauna', no physics body) — the mesh IS the creature.

import * as THREE from 'three';
import { faunaSpeciesById, FAUNA_SPECIES } from '../data/alienFauna.js';
import { alienStrainById } from '../data/alienEcology.js';
import { bindCreatureSkin } from './creatureSkinLibrary.js';
import { buildNurseryRay, buildNurseryFlock, buildOpenVeilRay } from './veilRayNurseryVisuals.js';
import { bolusSilhouette } from './bolusSilhouettes.js';
import { createCasketSegmentGeometry, createCasketHeadGeometry } from './casketWormGeometry.js';
import { createLanternSacGeometry, createLanternCoreGeometry, createLanternRootletGeometry } from './lanternCystGeometry.js';
import {
  buildLoftedLobeData,
  createFoldedMembraneGeometry,
  createFoldedTorusGeometry,
  createLoftedLobeGeometry,
  createSculptedCarapaceGeometry,
  mergePartsGeometry,
} from './faunaOpenGeometry.js';
import {
  createColdBellClapperGeometry,
  createColdBellRibsGeometry,
  createColdBellShellGeometry,
  createFurnaceBowlGeometry,
  createFurnaceJawGeometry,
  createFurnaceThroatGeometry,
  createPilgrimCordGeometry,
  createPilgrimGanglionGeometry,
  createPilgrimVertebraGeometry,
  createSpindleMotherBodyGeometry,
  createSpindleMotherCalyxesGeometry,
  createSpindleMotherCrownGeometry,
  createSpindleMotherJuvenilesGeometry,
  createSpindleMotherSacsGeometry,
  createStoneLungCoreGeometry,
  createStoneLungMoundGeometry,
  createStoneLungThroatGeometry,
  createSutureMiteBodyGeometry,
  createSutureMiteEyeGeometry,
  createSutureMiteLegsGeometry,
  createSutureMiteMandiblesGeometry,
  createSutureMiteSpinneretsGeometry,
  createVoidCarrierHullGeometry,
  createVoidCarrierLayersGeometry,
  createVoidCarrierNodesGeometry,
  createVoidCarrierRelayGeometry,
  createVoidCarrierStreamersGeometry,
  createWakeEelBodyGeometry,
  createWakeEelFinsGeometry,
  createWakeEelGlowGeometry,
} from './openFaunaBatch2Geometry.js';
import { readFaunaMotion } from '../data/faunaMotionRead.js';

const TISSUE = 0x9aa08e;
const FILAMENT = 0xc94f3d;
const GLOW = 0xff9a4a;

function strainColors(entity) {
  const strain = alienStrainById(entity && entity.data && entity.data.strainId);
  return {
    tissue: strain ? strain.tissueColor : TISSUE,
    filament: strain ? strain.filamentColor : FILAMENT,
    glow: strain ? strain.glowColor : GLOW,
  };
}

// How much of the strain colour tints the generated skin (the skin is a light neutral; 1 = the old flat colour).
const TISSUE_TINT_MIX = 0.78;

function tissueMat(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.85, metalness: 0.0,
    emissive: 0x1a1408, emissiveIntensity: 0.15,
  });
  bindCreatureSkin(material, 'tissue', (skin) => {
    material.color.set(0xffffff).lerp(new THREE.Color(color), TISSUE_TINT_MIX);
    material.map = skin.baseColor;
    material.normalMap = skin.normal;
    material.needsUpdate = true;
  });
  return material;
}
function glowMat(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({
    color: 0x1c1410, roughness: 0.6, metalness: 0.0,
    emissive: color, emissiveIntensity: intensity,
  });
}

function mixColor(hexA, hexB, t) {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t).getHex();
}

// Track per-creature material ownership so shared finishes retire once in disposeObjectNode.
function ownMat(mesh, material, owned) {
  if (owned.has(material)) {
    mesh.userData.borrowedGeometryMaterial = true;
  } else {
    owned.add(material);
  }
  return mesh;
}

function darkTissueMat(color, glowColor, {
  mixBase = 0x1a1e24,
  mixAmount = 0.82,
  roughness = 0.58,
  metalness = 0.14,
  normalScale = 0.85,
  emissiveIntensity = 0.02,
} = {}) {
  const tinted = mixColor(color, mixBase, mixAmount);
  const material = new THREE.MeshStandardMaterial({
    color: tinted,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness,
    metalness,
    emissive: glowColor,
    emissiveIntensity,
  });
  bindCreatureSkin(material, 'tissue', (skin) => {
    material.color.setHex(tinted);
    material.map = skin.baseColor;
    material.normalMap = skin.normal;
    material.needsUpdate = true;
  });
  return material;
}

function translucentTissueMat(color, glowColor, {
  opacity = 0.58,
  roughness = 0.25,
  metalness = 0.06,
  normalScale = 0.5,
  emissiveIntensity = 0.14,
} = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness,
    metalness,
    transparent: true,
    opacity,
    emissive: glowColor,
    emissiveIntensity,
  });
  bindCreatureSkin(material, 'tissue', (skin) => {
    material.color.set(0xffffff).lerp(new THREE.Color(color), 0.72);
    material.map = skin.baseColor;
    material.normalMap = skin.normal;
    material.needsUpdate = true;
  });
  return material;
}

function geo(key, make) {
  const cache = (geo._cache ||= new Map());
  if (!cache.has(key)) {
    const g = make();
    // Shared across every creature of this species and across sector teardowns: the per-entity
    // disposer (renderer disposeObject) honors spacefaceSharedAsset and never frees the cache.
    g.userData = { ...(g.userData || {}), spacefaceSharedAsset: true };
    cache.set(key, g);
  }
  return cache.get(key);
}

// ── species builders — top-down game reads XZ; bodies stay mostly flat-ish, y is height ──────

// Veil-Ray: unified scalloped ribbed membrane wings, dorsal keel, and tapered tail across all sites.
function buildVeilRay(colors) {
  return buildOpenVeilRay(colors, tissueMat);
}

// Needle Swarm: one entity, a school of sculpted chitinous darts swirling around a dim filament keel.
function buildNeedleSwarm(colors, species) {
  const g = new THREE.Group();
  const owned = new Set();
  const n = species.members || 9;
  const keelMat = tissueMat(mixColor(colors.tissue, 0x5c4033, 0.3));
  const coreMat = glowMat(colors.glow, 0.46);
  const dartMat = tissueMat(mixColor(colors.filament, 0x5e3428, 0.34));

  const keelGeo = geo('ns_keel_v2', () => {
    const arms = [];
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      arms.push(buildLoftedLobeData([
        [-1.8 * ca, -0.3, -1.5 * sa, 0.28, 0.25],
        [-0.4 * ca + 0.5 * sa, 0.35, -0.3 * sa - 0.4 * ca, 0.72, 0.58],
        [1.1 * ca - 0.3 * sa, 0.15, 0.9 * sa + 0.3 * ca, 0.65, 0.52],
        [2.2 * ca, -0.25, 1.8 * sa, 0.22, 0.20],
      ], { folds: 4, depth: 0.16, rings: 10, sides: 8 }));
    }
    return mergePartsGeometry(arms, 'NeedleSwarm_Keel');
  });
  const keel = ownMat(new THREE.Mesh(keelGeo, keelMat), keelMat, owned);
  keel.name = 'ns_keel';
  g.add(keel);

  const coreGeo = geo('ns_core_v2', () => createLoftedLobeGeometry([
    [-1.1, -0.1, -0.3, 0.45, 0.40],
    [0.0, 0.15, 0.2, 0.85, 0.75],
    [1.1, -0.05, -0.2, 0.42, 0.38],
  ], { folds: 5, depth: 0.16, rings: 10, sides: 10 }, 'NeedleSwarm_Core'));
  const core = ownMat(new THREE.Mesh(coreGeo, coreMat), coreMat, owned);
  core.name = 'ns_core';
  core.position.y = 0.05;
  g.add(core);

  const dartGeo = geo('ns_dart_v2', () => createLoftedLobeGeometry([
    [0, -0.05, -2.2, 0.10, 0.09],
    [0.08, 0.12, -0.7, 0.42, 0.30],
    [-0.04, 0.08, 0.7, 0.36, 0.26],
    [0, -0.02, 2.25, 0.08, 0.07],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 8, keel: 0.26 }, 'NeedleSwarm_Dart'));

  for (let i = 0; i < n; i += 1) {
    const d = ownMat(new THREE.Mesh(dartGeo, dartMat), dartMat, owned);
    d.name = 'ns_dart';
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.22;
    const rx = 6.2 + (i % 3) * 1.35;
    const rz = 3.8 + ((i + 1) % 3) * 0.85;
    d.position.set(
      Math.cos(a) * rx,
      (i % 2 ? 0.85 : -0.75) * (0.85 + (i % 3) * 0.42),
      Math.sin(a) * rz,
    );
    const tx = -rx * Math.sin(a);
    const tz = rz * Math.cos(a);
    d.rotation.y = Math.atan2(tx, tz);
    d.rotation.z = (i % 2 ? 0.26 : -0.24);
    d.rotation.x = Math.sin(i * 1.7) * 0.16;
    g.add(d);
  }
  g.name = 'SF_Fauna_needle_swarm';
  return g;
}

// Blind Shepherd: a folded toroidal pressure-hull skirt with bridging tendon ribs and a recessed relay crown.
function buildBlindShepherd(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const shellMat = tissueMat(colors.tissue);
  const skirtMat = tissueMat(mixColor(colors.filament, 0x56392f, 0.42));
  const organMat = glowMat(colors.glow, 0.55);

  const shellGeo = geo('bs_shell_v2', () => createSculptedCarapaceGeometry({
    rx: 13.5,
    rz: 13.5,
    radialRings: 14,
    sides: 32,
    lobeFreq: 8,
    lobeAmp: 0.11,
    dorsalY: (r, theta) => {
      const crater = 1.9 + 4.3 * Math.sin(Math.min(1, r / 0.52) * Math.PI * 0.5);
      const slope = 6.2 * Math.cos(Math.max(0, (r - 0.46) / 0.54) * Math.PI * 0.5);
      const base = r < 0.48 ? crater : slope;
      return base + 0.55 * Math.sin(r * Math.PI) * Math.cos(8 * theta);
    },
    ventralY: (r, theta) => -2.0 * Math.cos(r * Math.PI * 0.5) + 0.25 * Math.cos(8 * theta) * r,
    name: 'BlindShepherd_Shell',
  }));
  const shell = ownMat(new THREE.Mesh(shellGeo, shellMat), shellMat, owned);
  shell.name = 'bs_shell';
  shell.scale.set(1.02, 1.0, 0.84);
  g.add(shell);

  const skirtGeo = geo('bs_skirt_v2', () => createFoldedTorusGeometry({
    R: 17.8,
    tubeRx: 3.9,
    tubeRy: 2.7,
    majorSegs: 36,
    minorSegs: 14,
    majorFolds: 8,
    majorAmp: 0.11,
    minorFolds: 5,
    minorAmp: 0.15,
    waveY: 0.85,
    waveFreq: 4,
    name: 'BlindShepherd_Skirt',
  }));
  const skirt = ownMat(new THREE.Mesh(skirtGeo, skirtMat), skirtMat, owned);
  skirt.name = 'bs_skirt';
  skirt.position.y = -0.5;
  skirt.scale.set(1.04, 1.0, 0.84);
  g.add(skirt);

  const ribsGeo = geo('bs_ribs_v2', () => {
    const parts = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      parts.push(buildLoftedLobeData([
        [9.4 * ca, 2.8, 9.4 * sa, 1.30, 0.92],
        [13.4 * ca, 3.5, 13.4 * sa, 1.55, 1.18],
        [16.8 * ca, 1.2, 16.8 * sa, 1.35, 1.00],
        [19.2 * ca, -0.5, 19.2 * sa, 0.72, 0.62],
      ], { folds: 4, depth: 0.14, rings: 10, sides: 8 }));
    }
    return mergePartsGeometry(parts, 'BlindShepherd_Ribs');
  });
  const ribs = ownMat(new THREE.Mesh(ribsGeo, skirtMat), skirtMat, owned);
  ribs.name = 'bs_ribs';
  ribs.scale.set(1.04, 1.0, 0.84);
  g.add(ribs);

  const organGeo = geo('bs_organ_v2', () => {
    const parts = [
      buildLoftedLobeData([
        [-2.2, 0.0, 0.0, 1.2, 1.0],
        [0.0, 0.85, 0.0, 2.35, 1.85],
        [2.2, 0.0, 0.0, 1.2, 1.0],
      ], { folds: 5, depth: 0.15, rings: 10, sides: 10 }),
    ];
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      parts.push(buildLoftedLobeData([
        [1.1 * ca, -0.05, 1.1 * sa, 0.56, 0.45],
        [2.4 * ca, 0.42, 2.4 * sa, 0.68, 0.52],
        [3.8 * ca, 0.14, 3.8 * sa, 0.32, 0.28],
      ], { folds: 4, depth: 0.12, rings: 8, sides: 8 }));
    }
    return mergePartsGeometry(parts, 'BlindShepherd_Organ');
  });
  const organ = ownMat(new THREE.Mesh(organGeo, organMat), organMat, owned);
  organ.name = 'bs_organ';
  organ.position.y = 2.9;
  g.add(organ);

  g.name = 'SF_Fauna_blind_shepherd';
  return g;
}

// Hull Leech: a pleated radial gripper disc with fleshy attachment collar, recessed maw, and curved tendril arms.
function buildHullLeech(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const discMat = tissueMat(mixColor(colors.filament, 0x5c2f26, 0.36));
  const collarMat = tissueMat(colors.tissue);
  const mawMat = glowMat(colors.glow, 0.50);

  const bodyGeo = geo('hl_body_v2', () => createSculptedCarapaceGeometry({
    rx: 8.2,
    rz: 6.2,
    radialRings: 12,
    sides: 30,
    lobeFreq: 6,
    lobeAmp: 0.14,
    dorsalY: (r, theta) => {
      const basin = r < 0.46
        ? 0.4 + 2.1 * Math.sin((r / 0.46) * Math.PI * 0.5)
        : 2.5 * Math.cos(((r - 0.46) / 0.54) * Math.PI * 0.5);
      return basin + 0.32 * Math.sin(r * Math.PI) * Math.cos(6 * theta);
    },
    ventralY: (r, theta) => -1.3 * Math.cos(r * Math.PI * 0.5) + 0.18 * Math.cos(6 * theta) * r,
    name: 'HullLeech_Disc',
  }));
  const body = ownMat(new THREE.Mesh(bodyGeo, discMat), discMat, owned);
  body.name = 'hl_body';
  g.add(body);

  const collarGeo = geo('hl_collar_v2', () => createFoldedTorusGeometry({
    R: 3.1,
    tubeRx: 1.32,
    tubeRy: 1.12,
    majorSegs: 24,
    minorSegs: 12,
    majorFolds: 6,
    majorAmp: 0.14,
    minorFolds: 4,
    minorAmp: 0.12,
    waveY: 0.25,
    waveFreq: 3,
    name: 'HullLeech_Collar',
  }));
  const collar = ownMat(new THREE.Mesh(collarGeo, collarMat), collarMat, owned);
  collar.name = 'hl_collar';
  collar.position.y = 1.95;
  g.add(collar);

  const mawGeo = geo('hl_maw_v2', () => mergePartsGeometry([
    buildLoftedLobeData([
      [-1.5, -0.1, -0.3, 0.55, 0.48],
      [0.0, 0.45, 0.0, 1.05, 0.85],
      [1.5, -0.1, 0.3, 0.55, 0.48],
    ], { folds: 4, depth: 0.16, rings: 10, sides: 8 }),
    buildLoftedLobeData([
      [-0.3, -0.1, -1.5, 0.52, 0.45],
      [0.0, 0.35, 0.0, 0.95, 0.80],
      [0.3, -0.1, 1.5, 0.52, 0.45],
    ], { folds: 4, depth: 0.16, rings: 10, sides: 8 }),
  ], 'HullLeech_Maw'));
  const maw = ownMat(new THREE.Mesh(mawGeo, mawMat), mawMat, owned);
  maw.name = 'hl_maw';
  maw.position.y = 1.45;
  g.add(maw);

  const armGeo = geo('hl_arm_v2', () => createLoftedLobeGeometry([
    [4.2, -0.45, 0.0, 1.05, 0.85],
    [7.2, 0.35, 1.15, 0.82, 0.68],
    [10.2, -0.35, 1.45, 0.58, 0.48],
    [11.7, -1.65, 0.45, 0.24, 0.22],
  ], { folds: 4, depth: 0.16, rings: 12, sides: 8 }, 'HullLeech_Arm'));

  const armAngles = [-0.56, 0.0, 0.56, Math.PI - 0.56, Math.PI, Math.PI + 0.56];
  for (let i = 0; i < armAngles.length; i += 1) {
    const a = armAngles[i];
    const m = ownMat(new THREE.Mesh(armGeo, collarMat), collarMat, owned);
    m.name = 'hl_arm';
    m.rotation.y = a;
    if (i % 2 === 1) m.scale.set(1.04, 1.0, -0.92); // alternate S-curl handedness organically
    else m.scale.set(1.04, 1.0, 0.92);
    g.add(m);
  }
  g.name = 'SF_Fauna_hull_leech';
  return g;
}

// Lantern Cyst: a translucent bioluminescent sac — drifts warm-facing, ruptures if killed.
function buildLanternCyst(colors) {
  const g = new THREE.Group();
  const sacMaterial = new THREE.MeshStandardMaterial({
    color: colors.tissue,
    roughness: 0.35, metalness: 0.0,
    transparent: true, opacity: 0.55,
    emissive: colors.glow, emissiveIntensity: 0.35,
  });
  bindCreatureSkin(sacMaterial, 'tissue', (skin) => {
    sacMaterial.color.set(0xffffff).lerp(new THREE.Color(colors.tissue), TISSUE_TINT_MIX);
    sacMaterial.map = skin.baseColor;
    sacMaterial.needsUpdate = true;
  });
  const sac = new THREE.Mesh(
    geo('lc_sac', createLanternSacGeometry),
    sacMaterial,
  );
  sac.scale.setScalar(7);
  g.add(sac);
  const core = new THREE.Mesh(geo('lc_core', createLanternCoreGeometry), glowMat(colors.glow, 1.6));
  core.scale.setScalar(7);
  core.position.y = -1;
  g.add(core);
  const rootlet = geo('lc_root', createLanternRootletGeometry);
  // The rootlets use one finish per cyst, with independent motion across cysts.
  const rootletMaterial = tissueMat(colors.filament);
  for (let i = 0; i < 5; i += 1) {
    const r = new THREE.Mesh(rootlet, rootletMaterial);
    if (i > 0) r.userData.borrowedGeometryMaterial = true;
    const a = (i / 5) * Math.PI * 2;
    r.position.set(Math.cos(a) * 2.2, -4.5, Math.sin(a) * 2.2);
    r.rotation.z = Math.cos(a) * 0.4;
    r.rotation.x = Math.sin(a) * 0.4;
    g.add(r);
  }
  g.name = 'SF_Fauna_lantern_cyst';
  return g;
}

// Casket Worm: a low segmented hull-crawler — armored plates, no glow until it moves.
function buildCasketWorm(colors) {
  const g = new THREE.Group();
  const seg = geo('cw_seg', createCasketSegmentGeometry);
  // Each finish belongs to this worm; only its repeated plates borrow it.
  const filament = tissueMat(colors.filament);
  const tissue = tissueMat(colors.tissue);
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(seg, i % 2 ? tissue : filament);
    if (i >= 2) m.userData.borrowedGeometryMaterial = true;
    m.position.set(0, (i % 2) * 0.5 - 0.3, -i * 2.2);
    m.scale.set(8 - i * 0.6, 6, 8);
    g.add(m);
  }
  const head = new THREE.Mesh(geo('cw_head', createCasketHeadGeometry), tissue);
  head.userData.borrowedGeometryMaterial = true;
  head.position.z = 2.4;
  head.scale.setScalar(8);
  g.add(head);
  g.name = 'SF_Fauna_casket_worm';
  return g;
}

// Bristle Ram: sculpted armored body with a calcified battering-ram prow and flared dorsal bristle mat.
function buildBristleRam(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const hullMat = tissueMat(mixColor(colors.tissue, 0x5c4230, 0.28));
  const prowMat = tissueMat(mixColor(colors.tissue, 0xf2e6d0, 0.75));
  const quillMat = tissueMat(mixColor(colors.filament, 0x3b1f14, 0.52));

  const hullGeo = geo('br_hull_v2', () => createLoftedLobeGeometry([
    [0, -0.2, -8.4, 2.2, 1.7],
    [0, 0.7, -4.4, 7.6, 4.0],
    [0, 1.2, 0.4, 9.8, 4.9],
    [0, 0.9, 5.2, 8.8, 4.3],
    [0, 0.0, 8.8, 4.6, 2.6],
  ], { folds: 6, depth: 0.14, rings: 16, sides: 16, ventralScale: 0.65, keel: 0.16 }, 'BristleRam_Hull'));
  const hull = ownMat(new THREE.Mesh(hullGeo, hullMat), hullMat, owned);
  hull.name = 'br_hull';
  g.add(hull);

  const wedgeGeo = geo('br_wedge_v2', () => mergePartsGeometry([
    // Central heavy curved calcified battering prow thrusting prominently forward.
    buildLoftedLobeData([
      [0, 3.0, 2.4, 3.8, 2.2],
      [0, 2.6, 7.2, 4.6, 2.7],
      [0, 1.5, 11.6, 3.3, 2.1],
      [0, 0.4, 14.8, 1.25, 1.0],
    ], { folds: 4, depth: 0.12, rings: 12, sides: 10, keel: 0.24 }),
    // Paired lateral cheek armor shields flanking the ram prow.
    buildLoftedLobeData([
      [-4.6, 1.8, 3.4, 2.1, 1.4],
      [-6.4, 1.3, 7.8, 2.4, 1.6],
      [-4.2, 0.4, 11.8, 1.2, 0.95],
    ], { folds: 4, depth: 0.12, rings: 10, sides: 8 }),
    buildLoftedLobeData([
      [4.6, 1.8, 3.4, 2.1, 1.4],
      [6.4, 1.3, 7.8, 2.4, 1.6],
      [4.2, 0.4, 11.8, 1.2, 0.95],
    ], { folds: 4, depth: 0.12, rings: 10, sides: 8 }),
  ], 'BristleRam_Prow'));
  const wedge = ownMat(new THREE.Mesh(wedgeGeo, prowMat), prowMat, owned);
  wedge.name = 'br_wedge';
  g.add(wedge);

  const quillGeo = geo('br_quill_v2', () => createLoftedLobeGeometry([
    [0, -0.8, 0.6, 1.18, 0.92],
    [0, 2.2, -1.0, 0.96, 0.74],
    [0, 5.2, -3.4, 0.56, 0.44],
    [0, 7.2, -5.8, 0.16, 0.14],
  ], { folds: 4, depth: 0.14, rings: 12, sides: 8 }, 'BristleRam_Quill'));

  for (let i = 0; i < 9; i += 1) {
    const q = ownMat(new THREE.Mesh(quillGeo, quillMat), quillMat, owned);
    q.name = 'br_quill';
    const a = -1.2 + (i / 8) * 2.4;
    const rank = i % 2 === 0 ? 1.05 : 0.88;
    q.position.set(
      Math.sin(a) * 6.8,
      3.4 - Math.abs(a) * 0.6,
      1.6 - Math.cos(a) * 4.4,
    );
    q.rotation.z = -a * 0.88;
    q.rotation.x = 0.12 - Math.abs(a) * 0.18;
    q.scale.setScalar(rank);
    g.add(q);
  }
  g.name = 'SF_Fauna_bristle_ram';
  return g;
}

// Mourning Kite: a pleated translucent diamond-kite membrane with organic spars, tether, and recessed grief-loop.
function buildMourningKite(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const sailMat = translucentTissueMat(mixColor(0xb6d2de, colors.tissue, 0.35), colors.glow, {
    opacity: 0.72,
    roughness: 0.34,
    metalness: 0.04,
    normalScale: 0.55,
    emissiveIntensity: 0.14,
  });
  const sparMat = tissueMat(mixColor(colors.filament, 0x4b626c, 0.35));
  const knotMat = glowMat(colors.glow, 0.55);

  const sailGeo = geo('mk_sail_v2', () => createFoldedMembraneGeometry({
    uSegs: 24,
    vSegs: 14,
    surfacePoint: (u, v) => {
      const s = (u - 0.5) * 2; // -1..1 across wingspan
      const absS = Math.abs(s);
      const env = Math.max(0.14, Math.sin(u * Math.PI));
      const span = 14.5 * (0.72 * s + 0.28 * Math.sin(s * Math.PI * 0.5));
      const chord = 1.8 + 10.2 * Math.pow(env, 0.75);
      const zCenter = 2.6 - absS * 6.5;
      const z = zCenter + (v - 0.5) * chord;
      const arch = 3.6 * Math.cos(s * Math.PI * 0.5) - 1.0 * (1 - v);
      const pleat = 0.62 * Math.cos(s * Math.PI * 3.5) * Math.sin(v * Math.PI);
      const thick = 0.20 + 0.34 * Math.sin(v * Math.PI) * (1 - 0.55 * absS);
      return { pos: [span, arch + pleat, z], halfThick: thick };
    },
    name: 'MourningKite_Sail',
  }));
  const sail = ownMat(new THREE.Mesh(sailGeo, sailMat), sailMat, owned);
  sail.name = 'mk_sail';
  g.add(sail);

  const ribsGeo = geo('mk_ribs_v2', () => mergePartsGeometry([
    // Central dorsal keel spar.
    buildLoftedLobeData([
      [0, 2.0, -3.0, 0.36, 0.30],
      [0, 3.4, 2.6, 0.48, 0.40],
      [0, 2.7, 7.6, 0.24, 0.20],
    ], { folds: 4, depth: 0.12, rings: 10, sides: 8 }),
    // Port & starboard swept leading wing ribs.
    buildLoftedLobeData([
      [0, 3.1, 6.2, 0.34, 0.28],
      [-7.0, 2.4, 3.4, 0.30, 0.25],
      [-13.8, 0.2, -2.2, 0.16, 0.14],
    ], { folds: 3, depth: 0.12, rings: 10, sides: 8 }),
    buildLoftedLobeData([
      [0, 3.1, 6.2, 0.34, 0.28],
      [7.0, 2.4, 3.4, 0.30, 0.25],
      [13.8, 0.2, -2.2, 0.16, 0.14],
    ], { folds: 3, depth: 0.12, rings: 10, sides: 8 }),
  ], 'MourningKite_Ribs'));
  const ribs = ownMat(new THREE.Mesh(ribsGeo, sparMat), sparMat, owned);
  ribs.name = 'mk_ribs';
  g.add(ribs);

  const lineGeo = geo('mk_line_v2', () => createLoftedLobeGeometry([
    [0.0, 2.0, 1.8, 0.44, 0.38],
    [0.35, -0.3, -0.8, 0.36, 0.30],
    [0.85, -2.2, -3.6, 0.30, 0.26],
    [0.70, -3.6, -6.0, 0.34, 0.28],
  ], { folds: 4, depth: 0.14, rings: 12, sides: 8 }, 'MourningKite_Tether'));
  const line = ownMat(new THREE.Mesh(lineGeo, sparMat), sparMat, owned);
  line.name = 'mk_line';
  g.add(line);

  const cradleGeo = geo('mk_cradle_v2', () => createFoldedTorusGeometry({
    R: 1.25,
    tubeRx: 0.52,
    tubeRy: 0.42,
    majorSegs: 20,
    minorSegs: 10,
    majorFolds: 5,
    majorAmp: 0.14,
    minorFolds: 4,
    minorAmp: 0.12,
    waveY: 0.18,
    waveFreq: 3,
    name: 'MourningKite_Cradle',
  }));
  const cradle = ownMat(new THREE.Mesh(cradleGeo, sparMat), sparMat, owned);
  cradle.name = 'mk_cradle';
  cradle.position.set(0.70, -3.6, -6.0);
  cradle.rotation.x = 0.4;
  g.add(cradle);

  const knotGeo = geo('mk_knot_v2', () => createLoftedLobeGeometry([
    [-0.75, 0.0, -0.15, 0.45, 0.40],
    [0.0, 0.18, 0.0, 0.85, 0.72],
    [0.75, -0.05, 0.15, 0.42, 0.38],
  ], { folds: 4, depth: 0.14, rings: 10, sides: 8 }, 'MourningKite_Knot'));
  const knot = ownMat(new THREE.Mesh(knotGeo, knotMat), knotMat, owned);
  knot.name = 'mk_knot';
  knot.position.set(0.70, -3.6, -6.0);
  g.add(knot);

  g.name = 'SF_Fauna_mourning_kite';
  return g;
}

// Anchor Beast: a massive folded mineral-processing mantle anchored by curved fungal tendrils and recessed glow organs.
function buildAnchorBeast(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  // Preserve test/sfq-b175 single-owner contract: children[0] owns `tissue` (6 total meshes),
  // children[1] owns `glow`.
  const tissue = tissueMat(colors.tissue);
  const spikeGlow = glowMat(colors.glow, 0.55);
  const buttressMat = tissueMat(mixColor(colors.filament, 0x4c3528, 0.45));

  const moundGeo = geo('ab_mound_v2', () => createSculptedCarapaceGeometry({
    rx: 26.5,
    rz: 18.0,
    radialRings: 14,
    sides: 32,
    lobeFreq: 7,
    lobeAmp: 0.13,
    dorsalY: (r, theta) => {
      const basin = r < 0.44
        ? 4.2 + 6.4 * Math.sin((r / 0.44) * Math.PI * 0.5)
        : 10.6 * Math.cos(((r - 0.44) / 0.56) * Math.PI * 0.5);
      const ribs = 1.45 * Math.sin(r * Math.PI) * Math.cos(7 * theta + 0.5 * r);
      const step = 0.65 * Math.sin(r * Math.PI * 3.0) * (1 - r);
      return basin + ribs + step - 1.2 * r;
    },
    ventralY: (r, theta) => -3.5 * Math.cos(r * Math.PI * 0.5) - 1.2 * r + 0.4 * Math.cos(7 * theta) * r,
    name: 'AnchorBeast_Mantle',
  }));
  const mound = ownMat(new THREE.Mesh(moundGeo, tissue), tissue, owned);
  mound.name = 'ab_mound';
  g.add(mound);

  const crownGeo = geo('ab_crown_v2', () => {
    const parts = [
      buildLoftedLobeData([
        [-3.4, -0.4, -0.8, 1.5, 1.2],
        [0.0, 1.2, 0.2, 2.8, 2.1],
        [3.4, -0.3, 0.6, 1.4, 1.1],
      ], { folds: 5, depth: 0.16, rings: 10, sides: 10 }),
      buildLoftedLobeData([
        [-0.6, -0.3, -3.2, 1.4, 1.1],
        [0.1, 1.0, 0.0, 2.4, 1.8],
        [0.6, -0.4, 3.2, 1.3, 1.0],
      ], { folds: 5, depth: 0.16, rings: 10, sides: 10 }),
    ];
    return mergePartsGeometry(parts, 'AnchorBeast_Crown');
  });
  const crown = ownMat(new THREE.Mesh(crownGeo, spikeGlow), spikeGlow, owned);
  crown.name = 'ab_crown';
  crown.position.y = 6.0;
  g.add(crown);

  // 5 anchor tendrils sharing `tissue` (total `tissue` meshes = 1 mound + 5 tendrils = 6).
  const tendrilGeo = geo('ab_spike_v2', () => createLoftedLobeGeometry([
    [11.0, 4.0, 0.0, 2.1, 1.6],
    [15.4, 4.2, 1.1, 1.8, 1.4],
    [19.2, 1.1, 1.6, 1.2, 0.95],
    [21.6, -1.8, 1.1, 0.50, 0.44],
  ], { folds: 5, depth: 0.14, rings: 14, sides: 10 }, 'AnchorBeast_Tendril'));

  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const sp = ownMat(new THREE.Mesh(tendrilGeo, tissue), tissue, owned);
    sp.name = 'ab_spike';
    sp.rotation.y = a;
    if (i % 2 === 1) sp.scale.set(1.0, 1.04, -0.92);
    else sp.scale.set(1.0, 1.0, 0.92);
    g.add(sp);
  }

  // 2 small recessed bioluminescent pocket nodules tucked deep inside mantle creases.
  const noduleGeo = geo('ab_nodule_v2', () => createLoftedLobeGeometry([
    [-1.1, -0.15, 0.0, 0.55, 0.45],
    [0.0, 0.25, 0.15, 0.90, 0.68],
    [1.1, -0.15, 0.0, 0.52, 0.42],
  ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }, 'AnchorBeast_Nodule'));

  for (let i = 0; i < 2; i += 1) {
    const a = i * Math.PI + 0.9;
    const nod = ownMat(new THREE.Mesh(noduleGeo, spikeGlow), spikeGlow, owned);
    nod.name = 'ab_nodule';
    nod.position.set(Math.cos(a) * 14.5, 5.1, Math.sin(a) * 11.2);
    nod.rotation.y = a;
    g.add(nod);
  }

  // Merged calcified mineral ridge buttresses cradling the central processing basin.
  const buttressGeo = geo('ab_buttress_v2', () => {
    const parts = [];
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.85;
      const ca = Math.cos(a);
      const sa = Math.sin(a) * 0.75;
      parts.push(buildLoftedLobeData([
        [8.4 * ca, 6.4, 8.4 * sa, 1.35, 1.05],
        [13.2 * ca, 8.2, 13.2 * sa, 1.65, 1.20],
        [17.8 * ca, 4.8, 17.8 * sa, 1.40, 1.05],
        [20.8 * ca, 1.2, 20.8 * sa, 0.85, 0.70],
      ], { folds: 4, depth: 0.14, rings: 12, sides: 8 }));
    }
    return mergePartsGeometry(parts, 'AnchorBeast_Buttress');
  });
  const buttress = ownMat(new THREE.Mesh(buttressGeo, buttressMat), buttressMat, owned);
  buttress.name = 'ab_buttress';
  g.add(buttress);

  g.name = 'SF_Fauna_anchor_beast';
  return g;
}

// Furnace Maw: thick-walled open heat-radiating crater with visible glowing gullet and 7 curved fangs.
function buildFurnaceMaw(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const bowlMat = tissueMat(mixColor(colors.tissue, 0x503a2d, 0.32));
  const throatMat = tissueMat(0x5c220c);
  throatMat.emissive.setHex(0xff5a1e);
  throatMat.emissiveIntensity = 0.52;
  const jawMat = tissueMat(mixColor(colors.filament, 0x5c2e20, 0.32));

  const bowl = ownMat(new THREE.Mesh(geo('fm_bowl_v2', createFurnaceBowlGeometry), bowlMat), bowlMat, owned);
  bowl.name = 'fm_bowl';
  g.add(bowl);

  const throat = ownMat(new THREE.Mesh(geo('fm_throat_v2', createFurnaceThroatGeometry), throatMat), throatMat, owned);
  throat.name = 'fm_throat';
  throat.position.y = -0.35;
  g.add(throat);

  const jawGeo = geo('fm_jaw_v2', createFurnaceJawGeometry);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const j = ownMat(new THREE.Mesh(jawGeo, jawMat), jawMat, owned);
    j.name = 'fm_jaw';
    j.position.set(Math.cos(a) * 12.6, 2.4, Math.sin(a) * 12.6);
    j.rotation.y = Math.PI / 2 - a;
    g.add(j);
  }
  g.name = 'SF_Fauna_furnace_maw';
  return g;
}

// Glassback: a fluted translucent silicate grazing carapace over seam veins, recessed organ, and curved limbs.
function buildGlassback(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const domeMat = translucentTissueMat(mixColor(0xc2dbd6, colors.tissue, 0.28), colors.glow, {
    opacity: 0.56,
    roughness: 0.20,
    metalness: 0.08,
    normalScale: 0.48,
    emissiveIntensity: 0.12,
  });
  domeMat.depthWrite = false;
  const seamMat = tissueMat(mixColor(colors.filament, 0x5c432d, 0.42));
  const legMat = tissueMat(colors.tissue);
  const nodeMat = glowMat(colors.glow, 0.52);

  const domeGeo = geo('gb_dome_v2', () => createSculptedCarapaceGeometry({
    rx: 11.8,
    rz: 8.4,
    radialRings: 14,
    sides: 32,
    lobeFreq: 8,
    lobeAmp: 0.09,
    dorsalY: (r, theta) => {
      const vault = 7.2 * Math.cos(r * Math.PI * 0.5);
      const terrace = 0.55 * Math.sin(r * Math.PI * 3.0) * (1 - 0.3 * r);
      const flute = 0.42 * Math.sin(r * Math.PI) * Math.cos(8 * theta);
      return -1.2 + vault + terrace + flute;
    },
    ventralY: (r, theta) => 1.5 * Math.cos(r * Math.PI * 0.65) - 1.2 + 0.22 * Math.cos(8 * theta) * r,
    name: 'Glassback_Carapace',
  }));
  const dome = ownMat(new THREE.Mesh(domeGeo, domeMat), domeMat, owned);
  dome.name = 'gb_dome';
  g.add(dome);

  const seamGeo = geo('gb_seam_v2', () => {
    const parts = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a) * 0.72;
      parts.push(buildLoftedLobeData([
        [1.2 * ca, 4.2, 1.2 * sa, 0.42, 0.34],
        [4.8 * ca, 3.4, 4.8 * sa, 0.54, 0.42],
        [8.4 * ca, 1.0, 8.4 * sa, 0.46, 0.36],
        [10.6 * ca, -1.0, 10.6 * sa, 0.28, 0.24],
      ], { folds: 3, depth: 0.12, rings: 10, sides: 8 }));
    }
    return mergePartsGeometry(parts, 'Glassback_SeamVeins');
  });
  const seam = ownMat(new THREE.Mesh(seamGeo, seamMat), seamMat, owned);
  seam.name = 'gb_seam';
  g.add(seam);

  const nodeGeo = geo('gb_node_v2', () => mergePartsGeometry([
    buildLoftedLobeData([
      [-2.1, 0.0, -0.4, 0.85, 0.72],
      [0.0, 0.65, 0.1, 1.45, 1.15],
      [2.1, -0.1, 0.4, 0.82, 0.68],
    ], { folds: 4, depth: 0.14, rings: 10, sides: 8 }),
    buildLoftedLobeData([
      [-0.3, -0.1, -2.0, 0.78, 0.65],
      [0.0, 0.55, 0.0, 1.30, 1.05],
      [0.3, -0.1, 2.0, 0.78, 0.65],
    ], { folds: 4, depth: 0.14, rings: 10, sides: 8 }),
  ], 'Glassback_Organ'));
  const node = ownMat(new THREE.Mesh(nodeGeo, nodeMat), nodeMat, owned);
  node.name = 'gb_node';
  node.position.y = 2.0;
  g.add(node);

  const legGeo = geo('gb_leg_v2', () => createLoftedLobeGeometry([
    [6.2, -0.5, 0.0, 0.88, 0.72],
    [8.8, -1.1, 0.8, 0.74, 0.60],
    [10.0, -2.8, 1.2, 0.54, 0.44],
    [9.1, -4.2, 1.4, 0.24, 0.22],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 8 }, 'Glassback_Leg'));

  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const l = ownMat(new THREE.Mesh(legGeo, legMat), legMat, owned);
    l.name = 'gb_leg';
    l.rotation.y = -a;
    if (i % 2 === 1) l.scale.set(1.06, 1.0, -0.82);
    else l.scale.set(1.06, 1.0, 0.82);
    g.add(l);
  }
  g.name = 'SF_Fauna_glassback';
  return g;
}

// Wake Eel: continuous sinuous S-curved folded body with sweeping wake-fins and restrained signal nodes.
function buildWakeEel(colors) {
  const g = new THREE.Group();
  const core = new THREE.Group();
  const owned = new Set();
  const bodyMat = tissueMat(colors.tissue);
  const finMat = tissueMat(mixColor(colors.filament, 0x542e24, 0.35));
  finMat.side = THREE.DoubleSide;
  const signalMat = glowMat(colors.glow, 0.58);

  const body = ownMat(new THREE.Mesh(geo('we_body_v2', createWakeEelBodyGeometry), bodyMat), bodyMat, owned);
  body.name = 'we_body';
  core.add(body);

  const fins = ownMat(new THREE.Mesh(geo('we_fins_v2', createWakeEelFinsGeometry), finMat), finMat, owned);
  fins.name = 'we_fins';
  core.add(fins);

  const signal = ownMat(new THREE.Mesh(geo('we_glow_v2', createWakeEelGlowGeometry), signalMat), signalMat, owned);
  signal.name = 'we_glow';
  core.add(signal);

  g.add(core);
  g.name = 'SF_Fauna_wake_eel';
  return g;
}

// Spindle Mother: tapered fluted organic spindle with nestled spore sacs, crown seed, and juvenile cloud.
function buildSpindleMother(colors) {
  const g = new THREE.Group();
  const core = new THREE.Group();
  const owned = new Set();
  const spindleMat = tissueMat(colors.tissue);
  const calyxMat = tissueMat(mixColor(colors.filament, 0x523127, 0.38));
  const sacMat = glowMat(colors.glow, 0.38);
  const crownMat = glowMat(colors.glow, 0.55);

  const spindle = ownMat(new THREE.Mesh(geo('sm_spindle_v2', createSpindleMotherBodyGeometry), spindleMat), spindleMat, owned);
  spindle.name = 'sm_spindle';
  core.add(spindle);

  const calyx = ownMat(new THREE.Mesh(geo('sm_calyx_v2', createSpindleMotherCalyxesGeometry), calyxMat), calyxMat, owned);
  calyx.name = 'sm_calyx';
  core.add(calyx);

  const sacs = ownMat(new THREE.Mesh(geo('sm_sac_v2', createSpindleMotherSacsGeometry), sacMat), sacMat, owned);
  sacs.name = 'sm_sac';
  core.add(sacs);

  const crown = ownMat(new THREE.Mesh(geo('sm_crown_v2', createSpindleMotherCrownGeometry), crownMat), crownMat, owned);
  crown.name = 'sm_crown';
  core.add(crown);

  g.add(core);

  const juveniles = ownMat(new THREE.Mesh(geo('sm_juveniles_v2', createSpindleMotherJuvenilesGeometry), calyxMat), calyxMat, owned);
  juveniles.name = 'sm_juveniles';
  g.add(juveniles);

  g.name = 'SF_Fauna_spindle_mother';
  return g;
}

// Void Carrier: distinct vessel-scale horizontal stratified buoyant ark with nestled brood galleries.
function buildVoidCarrier(colors) {
  const g = new THREE.Group();
  const core = new THREE.Group();
  const owned = new Set();
  const hullMat = tissueMat(mixColor(colors.tissue, 0x5e4a3c, 0.3));
  const layerMat = tissueMat(mixColor(colors.filament, 0x482b24, 0.42));
  const nodeMat = glowMat(colors.glow, 0.45);
  const relayMat = glowMat(colors.glow, 0.62);

  const hull = ownMat(new THREE.Mesh(geo('vc_hull_v2', createVoidCarrierHullGeometry), hullMat), hullMat, owned);
  hull.name = 'vc_hull';
  core.add(hull);

  const layers = ownMat(new THREE.Mesh(geo('vc_layers_v2', createVoidCarrierLayersGeometry), layerMat), layerMat, owned);
  layers.name = 'vc_layers';
  core.add(layers);

  const nodes = ownMat(new THREE.Mesh(geo('vc_nodes_v2', createVoidCarrierNodesGeometry), nodeMat), nodeMat, owned);
  nodes.name = 'vc_nodes';
  core.add(nodes);

  const relay = ownMat(new THREE.Mesh(geo('vc_relay_v2', createVoidCarrierRelayGeometry), relayMat), relayMat, owned);
  relay.name = 'vc_relay';
  core.add(relay);

  g.add(core);

  const streamers = ownMat(new THREE.Mesh(geo('vc_streamers_v2', createVoidCarrierStreamersGeometry), layerMat), layerMat, owned);
  streamers.name = 'vc_streamers';
  g.add(streamers);

  g.name = 'SF_Fauna_void_carrier';
  return g;
}

// Archive Crab: a folded scavenger carapace with sculpted 3D dorsal salvage scutes and curved collector limbs.
function buildArchiveCrab(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const bodyMat = tissueMat(colors.tissue);
  const plateMat = tissueMat(mixColor(colors.filament, 0x5c3626, 0.42));
  const crestMat = tissueMat(mixColor(colors.tissue, 0xcab89c, 0.35));
  const legMat = tissueMat(mixColor(colors.tissue, 0x4c3a2c, 0.35));

  const bodyGeo = geo('ac_body_v2', () => createSculptedCarapaceGeometry({
    rx: 8.6,
    rz: 6.4,
    radialRings: 12,
    sides: 30,
    lobeFreq: 7,
    lobeAmp: 0.12,
    dorsalY: (r, theta) => 2.5 * Math.cos(r * Math.PI * 0.5) + 0.38 * Math.sin(r * Math.PI) * Math.cos(7 * theta),
    ventralY: (r, theta) => -1.5 * Math.cos(r * Math.PI * 0.5) + 0.18 * Math.cos(7 * theta) * r,
    name: 'ArchiveCrab_Carapace',
  }));
  const body = ownMat(new THREE.Mesh(bodyGeo, bodyMat), bodyMat, owned);
  body.name = 'ac_body';
  g.add(body);

  const plateGeo = geo('ac_plate_v2', () => createFoldedMembraneGeometry({
    uSegs: 14,
    vSegs: 10,
    surfacePoint: (u, v) => {
      const su = (u - 0.5) * 2;
      const sv = (v - 0.5) * 2;
      const taper = 0.72 + 0.28 * Math.sin(v * Math.PI);
      const x = su * 3.8 * taper + 0.35 * Math.sin(sv * Math.PI);
      const z = sv * 2.6 * (0.76 + 0.24 * Math.sin(u * Math.PI));
      const dome = 0.75 * Math.cos(su * Math.PI * 0.45) * Math.cos(sv * Math.PI * 0.45);
      const pleat = 0.28 * Math.cos(su * Math.PI * 2.5) * Math.sin(v * Math.PI);
      return { pos: [x, dome + pleat, z], halfThick: 0.44 + 0.22 * Math.sin(u * Math.PI) };
    },
    name: 'ArchiveCrab_Plate',
  }));

  const placements = [
    { pos: [-1.4, 2.0, -1.0], rot: [0.06, -0.35, 0.10], scale: [1.02, 1.0, 0.96], mat: plateMat },
    { pos: [1.6, 2.35, 0.4], rot: [-0.08, 0.42, -0.12], scale: [0.95, 1.05, 0.92], mat: plateMat },
    { pos: [-0.3, 2.75, 1.3], rot: [0.10, 0.15, 0.05], scale: [0.84, 1.0, 0.85], mat: crestMat },
  ];
  for (const spec of placements) {
    const p = ownMat(new THREE.Mesh(plateGeo, spec.mat), spec.mat, owned);
    p.name = 'ac_plate';
    p.position.set(...spec.pos);
    p.rotation.set(...spec.rot);
    p.scale.set(...spec.scale);
    g.add(p);
  }

  const legGeo = geo('ac_leg_v2', () => createLoftedLobeGeometry([
    [5.8, -0.6, 0.0, 0.78, 0.64],
    [8.8, 0.35, 0.65, 0.64, 0.52],
    [11.2, -0.55, 1.55, 0.45, 0.38],
    [11.8, -2.0, 2.25, 0.18, 0.16],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 8 }, 'ArchiveCrab_Limb'));

  const legAngles = [-0.62, 0.0, 0.62, Math.PI - 0.62, Math.PI, Math.PI + 0.62];
  for (let i = 0; i < legAngles.length; i += 1) {
    const l = ownMat(new THREE.Mesh(legGeo, legMat), legMat, owned);
    l.name = 'ac_leg';
    l.rotation.y = legAngles[i];
    if (i >= 3) l.scale.set(1.0, 1.0, -1.0); // mirror port side so claws sweep forward (+Z)
    g.add(l);
  }
  g.name = 'SF_Fauna_archive_crab';
  return g;
}

// Cold Bell (AE-160): closed thick-walled pleated resonant bell canopy with integrated ribs and piezo clapper.
function buildColdBell(colors) {
  const g = new THREE.Group();
  const canopy = new THREE.Group();
  const owned = new Set();
  const shellMat = tissueMat(colors.tissue);
  const ribMat = tissueMat(mixColor(colors.filament, 0x4f3028, 0.35));
  const clapperMat = glowMat(colors.glow, 0.62);

  const shell = ownMat(new THREE.Mesh(geo('cb_shell_v2', createColdBellShellGeometry), shellMat), shellMat, owned);
  shell.name = 'cb_shell';
  canopy.add(shell);

  const ribs = ownMat(new THREE.Mesh(geo('cb_rib_v2', createColdBellRibsGeometry), ribMat), ribMat, owned);
  ribs.name = 'cb_rib';
  canopy.add(ribs);

  g.add(canopy);

  const clapper = ownMat(new THREE.Mesh(geo('cb_clapper_v2', createColdBellClapperGeometry), clapperMat), clapperMat, owned);
  clapper.name = 'cb_clapper';
  clapper.position.set(0, -0.13, 2.60);
  g.add(clapper);

  g.name = 'SF_Fauna_cold_bell';
  return g;
}

// Suture Mite (AE-161): segmented folded carapace knitter with curved mandibles, brow sensory eye, legs, and spinnerets.
function buildSutureMite(colors) {
  const g = new THREE.Group();
  const core = new THREE.Group();
  const owned = new Set();
  const bodyMat = tissueMat(colors.tissue);
  const appendageMat = tissueMat(mixColor(colors.filament, 0x543025, 0.32));
  const eyeMat = glowMat(colors.glow, 0.72);

  const body = ownMat(new THREE.Mesh(geo('sm_body_v2', createSutureMiteBodyGeometry), bodyMat), bodyMat, owned);
  body.name = 'sm_body';
  core.add(body);

  const eye = ownMat(new THREE.Mesh(geo('sm_eye_v2', createSutureMiteEyeGeometry), eyeMat), eyeMat, owned);
  eye.name = 'sm_eye';
  eye.position.set(0, 0.72, 2.05);
  core.add(eye);

  g.add(core);

  const legs = ownMat(new THREE.Mesh(geo('sm_legs_v2', createSutureMiteLegsGeometry), appendageMat), appendageMat, owned);
  legs.name = 'sm_legs';
  g.add(legs);

  const mandibles = ownMat(new THREE.Mesh(geo('sm_mandibles_v2', createSutureMiteMandiblesGeometry), appendageMat), appendageMat, owned);
  mandibles.name = 'sm_mandibles';
  mandibles.position.set(0, 0.05, 1.8);
  g.add(mandibles);

  const spin = ownMat(new THREE.Mesh(geo('sm_spin_v2', createSutureMiteSpinneretsGeometry), appendageMat), appendageMat, owned);
  spin.name = 'sm_spin';
  spin.position.set(0, 0.15, -1.9);
  g.add(spin);

  g.name = 'SF_Fauna_suture_mite';
  return g;
}

// Black Sail (AE-162): an S-cambered, pleated dark photophore sail with stiffener cord and recessed photophore seam.
function buildBlackSail(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const sailMat = darkTissueMat(colors.tissue, colors.glow, {
    mixBase: 0x181c24,
    mixAmount: 0.88,
    roughness: 0.56,
    metalness: 0.15,
    normalScale: 0.85,
    emissiveIntensity: 0.02,
  });
  const cordMat = darkTissueMat(colors.filament, colors.glow, {
    mixBase: 0x2c1b18,
    mixAmount: 0.78,
    roughness: 0.74,
    metalness: 0.06,
    normalScale: 0.9,
    emissiveIntensity: 0.02,
  });
  const photophoreMat = glowMat(colors.glow, 0.45);

  const spineAt = (t) => [
    12.0 * t + 1.5 * Math.sin(t * Math.PI),
    3.0 * Math.sin(t * Math.PI * 0.5) + 1.3 * Math.cos(t * Math.PI),
    5.4 * t - 1.8 * Math.cos(t * Math.PI),
  ];

  const sailGeo = geo('bs_sail_v2', () => createFoldedMembraneGeometry({
    uSegs: 26,
    vSegs: 14,
    surfacePoint: (u, v) => {
      const t = (u - 0.5) * 2; // -1..1 along sail length
      const sp = spineAt(t);
      const env = Math.pow(Math.max(0.06, Math.sin(u * Math.PI)), 0.65);
      const chord = 1.4 + 7.8 * env;
      const drop = (1 - v) * chord;
      const billow = 2.4 * Math.sin(v * Math.PI) * Math.sin(t * Math.PI);
      const pleats = 0.68 * Math.cos(t * Math.PI * 3.5) * Math.sin(v * Math.PI);
      const scallop = 0.70 * (1 - v) * Math.cos(t * Math.PI * 4.0);
      return {
        pos: [
          sp[0] - drop * 0.24 + billow * 0.45,
          sp[1] - drop * 0.72 + pleats * 0.55 - scallop * 0.3,
          sp[2] - drop * 0.52 + pleats * 0.75 + scallop * 0.4,
        ],
        halfThick: 0.20 + 0.44 * Math.sin(v * Math.PI) * env,
      };
    },
    name: 'BlackSail_Membrane',
  }));
  const sail = ownMat(new THREE.Mesh(sailGeo, sailMat), sailMat, owned);
  sail.name = 'bs_sail';
  g.add(sail);

  const cordGeo = geo('bs_cord_v2', () => {
    const stations = [];
    for (let i = 0; i <= 6; i += 1) {
      const u = i / 6;
      const t = (u - 0.5) * 2;
      const sp = spineAt(t);
      const r = 0.32 + 0.48 * Math.sin(u * Math.PI);
      stations.push([sp[0], sp[1], sp[2], r, r * 0.85]);
    }
    return createLoftedLobeGeometry(stations, { folds: 5, depth: 0.14, rings: 18, sides: 10 }, 'BlackSail_Cord');
  });
  const cord = ownMat(new THREE.Mesh(cordGeo, cordMat), cordMat, owned);
  cord.name = 'bs_cord';
  g.add(cord);

  const photophoreGeo = geo('bs_photophore_v2', () => {
    const parts = [];
    for (let i = 0; i < 4; i += 1) {
      const u = 0.22 + (i / 3) * 0.56;
      const t = (u - 0.5) * 2;
      const sp = spineAt(t);
      parts.push(buildLoftedLobeData([
        [sp[0] - 0.8, sp[1] - 0.35, sp[2] - 0.45, 0.14, 0.12],
        [sp[0] - 0.2, sp[1] + 0.05, sp[2] - 0.55, 0.22, 0.18],
        [sp[0] + 0.5, sp[1] - 0.25, sp[2] - 0.35, 0.14, 0.12],
      ], { folds: 3, depth: 0.14, rings: 8, sides: 8 }));
    }
    return mergePartsGeometry(parts, 'BlackSail_Photophore');
  });
  const photophore = ownMat(new THREE.Mesh(photophoreGeo, photophoreMat), photophoreMat, owned);
  photophore.name = 'bs_photophore';
  g.add(photophore);

  g.name = 'SF_Fauna_black_sail';
  return g;
}

// Stone Lung (AE-163): sculpted rock-mantle crater with folded gill throat exposing the pulsing spore bladder.
function buildStoneLung(colors) {
  const g = new THREE.Group();
  const owned = new Set();
  const rockMat = tissueMat(mixColor(colors.tissue, 0x4e483f, 0.65));
  const throatMat = tissueMat(colors.tissue);
  const coreMat = tissueMat(mixColor(colors.glow, 0x4a2410, 0.55));
  coreMat.emissive.setHex(colors.glow);
  coreMat.emissiveIntensity = 0.52;

  const mound = ownMat(new THREE.Mesh(geo('sl_mound_v2', createStoneLungMoundGeometry), rockMat), rockMat, owned);
  mound.name = 'sl_mound';
  g.add(mound);

  const throat = ownMat(new THREE.Mesh(geo('sl_throat_v2', createStoneLungThroatGeometry), throatMat), throatMat, owned);
  throat.name = 'sl_throat';
  g.add(throat);

  const wetCore = ownMat(new THREE.Mesh(geo('sl_core_v2', createStoneLungCoreGeometry), coreMat), coreMat, owned);
  wetCore.name = 'sl_core';
  wetCore.position.set(0, 0.4, 0.1);
  g.add(wetCore);

  g.name = 'SF_Fauna_stone_lung';
  return g;
}

// Pilgrim Spine (AE-164): sculpted folded vertebra link segment with swept processes, route ganglion, and sinuous cord.
function buildPilgrimSpine(colors) {
  const g = new THREE.Group();
  const core = new THREE.Group();
  const owned = new Set();
  const vertebraMat = tissueMat(colors.tissue);
  const glowNodeMat = glowMat(colors.glow, 0.58);
  const cordMat = tissueMat(mixColor(colors.filament, 0x4b5c42, 0.35));

  const wedge = ownMat(new THREE.Mesh(geo('ps_wedge_v2', createPilgrimVertebraGeometry), vertebraMat), vertebraMat, owned);
  wedge.name = 'ps_wedge';
  core.add(wedge);

  const nodeGlow = ownMat(new THREE.Mesh(geo('ps_glow_v2', createPilgrimGanglionGeometry), glowNodeMat), glowNodeMat, owned);
  nodeGlow.name = 'ps_glow';
  core.add(nodeGlow);

  g.add(core);

  const cord = ownMat(new THREE.Mesh(geo('ps_cord_v2', createPilgrimCordGeometry), cordMat), cordMat, owned);
  cord.name = 'ps_cord';
  cord.position.set(0, -0.22, -3.55);
  g.add(cord);

  g.name = 'SF_Fauna_pilgrim_spine';
  return g;
}

function buildBolusFauna(colors, species) {
  const g = new THREE.Group();
  const id = species && species.id || 'bolus_knob';
  const scale = Math.max(6, (species && species.radius) || 12);
  const recipe = bolusSilhouette(id);
  // A creature's repeated parts can share the same authored finish. Keep the
  // cache local: drive-state emission is animated independently per creature.
  const materials = recipe.parts.length > 1 ? new Map() : null;
  for (let i = 0; i < recipe.parts.length; i++) {
    const part = recipe.parts[i];
    const geometry = geo(`bolus_sil_${id}_${part.id}`, () => {
      const buffer = new THREE.BufferGeometry();
      buffer.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      if (part.indices) buffer.setIndex(part.indices.slice());
      if (part.uvs) buffer.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
      if (part.normals) buffer.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
      else buffer.computeVertexNormals();
      return buffer;
    });
    const color = part.glow ? part.color : part.color || colors.tissue;
    const glowStrength = part.glow ? (Number.isFinite(part.emissiveIntensity) ? part.emissiveIntensity : 0.55) : 0;
    const key = `${part.glow ? `glow:${glowStrength}` : 'tissue'}:${color}:${part.doubleSided ? 'double' : 'front'}`;
    let material = materials?.get(key);
    const borrowed = !!material;
    if (!material) {
      material = part.glow ? glowMat(color, glowStrength) : tissueMat(color);
      if (part.doubleSided) material.side = THREE.DoubleSide;
      materials?.set(key, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    // The first part owns the finish; later identical parts borrow it and the
    // cached geometry when the creature's root is retired.
    if (borrowed) mesh.userData.borrowedGeometryMaterial = true;
    mesh.scale.setScalar(scale);
    mesh.name = part.id;
    g.add(mesh);
  }
  g.name = `SF_Fauna_${id}`;
  return g;
}

const BUILDERS = {
  veil_ray: (c, s) => buildVeilRay(c),
  needle_swarm: (c, s) => buildNeedleSwarm(c, s),
  blind_shepherd: (c, s) => buildBlindShepherd(c),
  hull_leech: (c, s) => buildHullLeech(c),
  lantern_cyst: (c) => buildLanternCyst(c),
  casket_worm: (c) => buildCasketWorm(c),
  bristle_ram: (c) => buildBristleRam(c),
  mourning_kite: (c) => buildMourningKite(c),
  anchor_beast: (c) => buildAnchorBeast(c),
  furnace_maw: (c) => buildFurnaceMaw(c),
  glassback: (c) => buildGlassback(c),
  wake_eel: (c) => buildWakeEel(c),
  spindle_mother: (c) => buildSpindleMother(c),
  archive_crab: (c) => buildArchiveCrab(c),
  // AE-112: hull-scale carrier — distinct vessel-scale stratified buoyant hull-mass.
  void_carrier: (c) => buildVoidCarrier(c),
  // ── Phase 16 species (AE-160..AE-164) ──
  cold_bell: (c) => buildColdBell(c),
  suture_mite: (c) => buildSutureMite(c),
  black_sail: (c) => buildBlackSail(c),
  stone_lung: (c) => buildStoneLung(c),
  pilgrim_spine: (c) => buildPilgrimSpine(c),
};

for (const speciesId of Object.keys(FAUNA_SPECIES)) {
  if (speciesId.startsWith('bolus_') && !BUILDERS[speciesId]) {
    BUILDERS[speciesId] = (colors, species) => buildBolusFauna(colors, species);
  }
}

export function installFaunaMotion(root, initialEntity, species, colors) {
  if (!root) return;
  const childBases = [];
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i];
    childBases.push({
      mesh: c,
      name: c.name || '',
      basePos: c.position.clone(),
      baseRot: c.rotation.clone(),
      baseScale: c.scale.clone(),
    });
  }
  const rootBaseScale = root.scale.clone();

  const emissiveEntries = [];
  const seenMaterials = new Set();
  root.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.emissive && !seenMaterials.has(obj.material)) {
      seenMaterials.add(obj.material);
      emissiveEntries.push({
        mat: obj.material,
        baseIntensity: Number.isFinite(obj.material.emissiveIntensity) ? obj.material.emissiveIntensity : 1.0,
      });
    }
  });

  root.userData.updateAuthoredMotion = function updateFaunaMotion(currentEntity, now = 0, a11y = {}, state = null) {
    const live = (currentEntity && typeof currentEntity === 'object') ? currentEntity : initialEntity;
    const driveState = live?.data?.ecology?.driveState || 'drift';
    const motion = readFaunaMotion(driveState) || (driveState === 'charge' ? 'defense' : driveState === 'flee' ? 'retreat' : 'quiet');
    const reduced = Boolean(a11y?.reducedMotion);
    const reducedFlash = Boolean(a11y?.reducedFlash);

    root.userData.faunaMotionRead = motion;
    root.userData.faunaDriveState = driveState;

    if (motion === 'defense' || driveState === 'charge') {
      // CHARGING: Aggressive lowered forward pitch, flared quills/appendages, surge forward, rapid warning glow pulse
      const flare = reduced ? 0.35 : 0.35 + Math.sin(now * 5) * 0.08;
      const heave = reduced ? 0 : Math.sin(now * 5) * 0.1;
      const surge = reduced ? 0.3 : 0.3 + Math.sin(now * 5) * 0.15;
      root.rotation.x = -0.16 + (reduced ? 0 : Math.sin(now * 5) * 0.03);
      root.scale.set(rootBaseScale.x * 0.94, rootBaseScale.y * (reduced ? 1.05 : 1.05 + Math.sin(now * 5) * 0.04), rootBaseScale.z * 1.12);

      for (const cb of childBases) {
        cb.mesh.position.y = cb.basePos.y + heave;
        cb.mesh.position.z = cb.basePos.z + surge;
        cb.mesh.position.x = cb.basePos.x;
        cb.mesh.rotation.y = cb.baseRot.y;

        if (cb.name === 'br_quill' || cb.name === 'gb_leg' || cb.mesh !== root.children[0]) {
          cb.mesh.rotation.x = cb.baseRot.x - flare;
          cb.mesh.scale.set(cb.baseScale.x * 1.25, cb.baseScale.y * 1.25, cb.baseScale.z * 1.25);
        } else {
          cb.mesh.rotation.x = cb.baseRot.x;
          cb.mesh.scale.copy(cb.baseScale);
        }
      }

      const glowFactor = reducedFlash ? 1.8 : 1.6 + Math.sin(now * 6) * 0.5;
      for (const entry of emissiveEntries) {
        entry.mat.emissiveIntensity = entry.baseIntensity * glowFactor;
      }
    } else if (motion === 'retreat' || driveState === 'flee') {
      // FLEEING: Sleek flattened tuck, quills pinned back, lateral thrashing propulsion, lowered glow
      const tuck = 0.35;
      const heave = reduced ? -0.2 : -0.2 + Math.sin(now * 10) * 0.08;
      const thrashYaw = reduced ? 0 : Math.sin(now * 10) * 0.12;
      const thrashX = reduced ? 0 : Math.cos(now * 10) * 0.18;
      root.rotation.x = 0.08;
      root.scale.set(rootBaseScale.x * 0.88, rootBaseScale.y * 0.82, rootBaseScale.z * 1.05);

      for (const cb of childBases) {
        cb.mesh.position.y = cb.basePos.y + heave;
        cb.mesh.position.z = cb.basePos.z;
        cb.mesh.position.x = cb.basePos.x + thrashX;
        cb.mesh.rotation.y = cb.baseRot.y + thrashYaw;

        if (cb.name === 'br_quill' || cb.name === 'gb_leg' || cb.mesh !== root.children[0]) {
          cb.mesh.rotation.x = cb.baseRot.x + tuck;
          cb.mesh.scale.set(cb.baseScale.x * 0.85, cb.baseScale.y * 0.85, cb.baseScale.z * 0.85);
        } else {
          cb.mesh.rotation.x = cb.baseRot.x;
          cb.mesh.scale.copy(cb.baseScale);
        }
      }

      const glowFactor = reducedFlash ? 0.6 : 0.5 + Math.sin(now * 12) * 0.2;
      for (const entry of emissiveEntries) {
        entry.mat.emissiveIntensity = entry.baseIntensity * glowFactor;
      }
    } else {
      // DRIFTING / QUIET: Calm resting posture, gentle breathing heave, quills at rest
      const heave = reduced ? 0 : Math.sin(now * 1.2) * 0.18;
      const breath = reduced ? 1.0 : 1.0 + Math.sin(now * 1.2) * 0.03;
      root.rotation.x = reduced ? 0 : Math.sin(now * 1.2) * 0.02;
      root.scale.set(rootBaseScale.x * breath, rootBaseScale.y * breath, rootBaseScale.z * breath);

      for (const cb of childBases) {
        cb.mesh.position.y = cb.basePos.y + heave;
        cb.mesh.position.z = cb.basePos.z;
        cb.mesh.position.x = cb.basePos.x;
        cb.mesh.rotation.y = cb.baseRot.y;
        cb.mesh.rotation.x = cb.baseRot.x;
        cb.mesh.scale.copy(cb.baseScale);
      }

      const glowFactor = reducedFlash ? 1.0 : 0.9 + Math.sin(now * 1.2) * 0.2;
      for (const entry of emissiveEntries) {
        entry.mat.emissiveIntensity = entry.baseIntensity * glowFactor;
      }
    }
  };

  root.userData.updateAuthoredMotion(initialEntity, 0, {}, null);
}

export function buildFaunaMesh(entity) {
  const eco = entity && entity.data && entity.data.ecology;
  const species = faunaSpeciesById(eco && eco.speciesId);
  if (!species) return null;
  const colors = strainColors(entity);
  if (eco.siteId === 'veil_ray_nursery') {
    return eco.aggregate ? buildNurseryFlock(entity, colors, tissueMat) : buildNurseryRay(entity, colors, tissueMat);
  }
  const root = BUILDERS[species.id] ? BUILDERS[species.id](colors, species) : null;
  if (root) {
    root.userData.kind = 'fauna';
    root.userData.speciesId = species.id;
    installFaunaMotion(root, entity, species, colors);
    if (root.userData.rayWings && typeof root.userData.updateAuthoredMotion === 'function') {
      const baseMotion = root.userData.updateAuthoredMotion;
      const wings = root.userData.rayWings;
      root.userData.updateAuthoredMotion = (current, now = 0, a11y = {}, state = null) => {
        baseMotion(current, now, a11y, state);
        const drive = current?.data?.ecology?.driveState || 'drift';
        const reduced = a11y?.reducedMotion === true;
        const amp = reduced ? 0 : drive === 'flee' ? 0.16 : drive === 'charge' ? 0.12 : 0.05;
        const flap = Math.sin(now * (drive === 'flee' ? 3.8 : 1.2)) * amp;
        wings[0].rotation.x = flap;
        wings[1].rotation.x = -flap;
      };
      root.userData.updateAuthoredMotion(entity, 0, {}, null);
    }
  }
  return root;
}

// ── Infestation growth props (doc 03 kit) — dressing entities place_alien_growth_<module> ────
// These replace a bare empty Group for the alien_growth_* placeIds in buildFallbackPlaceProp.

export function buildAlienGrowthProp(placeId, radius = 8) {
  const moduleId = String(placeId || '').replace(/^alien_growth_/, '');
  const g = new THREE.Group();
  g.name = `SF_AlienGrowth_${moduleId}`;
  const r = Math.max(2, radius || 8);
  const tissue = tissueMat(0x8f9484);
  const fil = tissueMat(0x7e3a2e);
  const glow = glowMat(0xff8a3c, 0.9);

  switch (moduleId) {
    case 'filament_sheet':
    case 'membrane_patch': {
      const sheet = new THREE.Mesh(geo('gr_sheet', () => {
        const s = new THREE.SphereGeometry(1, 18, 8);
        s.scale(1, 0.08, 1);
        return s;
      }), fil);
      sheet.scale.setScalar(r);
      g.add(sheet);
      for (let i = 0; i < 4; i += 1) {
        const bead = new THREE.Mesh(geo('gr_bead', () => new THREE.SphereGeometry(0.16, 8, 6)), glow);
        bead.position.set(Math.cos(i * 1.7) * r * 0.7, r * 0.12, Math.sin(i * 1.7) * r * 0.7);
        bead.scale.setScalar(r * 0.5);
        g.add(bead);
      }
      break;
    }
    case 'node_bulb_small':
    case 'node_bulb_large': {
      const bulb = new THREE.Mesh(geo('gr_bulb', () => new THREE.SphereGeometry(0.8, 14, 10)), glow);
      bulb.scale.setScalar(r * (moduleId === 'node_bulb_large' ? 1.1 : 0.8));
      bulb.position.y = r * 0.4;
      g.add(bulb);
      const collar = new THREE.Mesh(geo('gr_collar', () => new THREE.TorusGeometry(0.9, 0.24, 8, 20)), fil);
      collar.rotation.x = Math.PI / 2;
      collar.scale.setScalar(r * 0.8);
      g.add(collar);
      break;
    }
    case 'cyst_cluster': {
      for (let i = 0; i < 5; i += 1) {
        const cyst = new THREE.Mesh(geo('gr_cyst', () => new THREE.SphereGeometry(0.4, 10, 8)),
          i % 2 ? glow : tissue);
        const a = (i / 5) * Math.PI * 2;
        cyst.position.set(Math.cos(a) * r * 0.4, r * 0.22, Math.sin(a) * r * 0.4);
        cyst.scale.setScalar(r * (0.7 + (i % 3) * 0.18));
        g.add(cyst);
      }
      break;
    }
    case 'calcified_collar': {
      const ring = new THREE.Mesh(geo('gr_ring', () => new THREE.TorusGeometry(1, 0.3, 8, 24)), tissue);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(r * 0.85);
      g.add(ring);
      break;
    }
    case 'tendril_cluster':
    case 'nerve_bundle': {
      const tendril = geo('gr_tendril', () => {
        const s = new THREE.ConeGeometry(0.2, 2.2, 6);
        s.translate(0, 1.1, 0);
        return s;
      });
      for (let i = 0; i < 6; i += 1) {
        const t = new THREE.Mesh(tendril, i % 2 ? fil : tissue);
        const a = (i / 6) * Math.PI * 2;
        t.position.set(Math.cos(a) * r * 0.45, 0, Math.sin(a) * r * 0.45);
        t.rotation.z = Math.cos(a) * 0.55;
        t.rotation.x = -Math.sin(a) * 0.55;
        t.scale.setScalar(r * 0.8);
        g.add(t);
      }
      break;
    }
    case 'vent_lung':
    case 'lung_bladder':
    case 'spore_chimney': {
      const stack = new THREE.Mesh(geo('gr_stack', () => {
        const s = new THREE.CylinderGeometry(0.35, 0.9, 2.6, 10);
        s.translate(0, 1.3, 0);
        return s;
      }), tissue);
      stack.scale.setScalar(r * 0.75);
      g.add(stack);
      const vent = new THREE.Mesh(geo('gr_vent', () => new THREE.SphereGeometry(0.3, 10, 6)), glow);
      vent.position.y = r * 2.0;
      vent.scale.setScalar(r * 0.8);
      g.add(vent);
      break;
    }
    case 'nerve_lace':
    case 'false_cable': {
      // Phase 16 B-table: a cable-run of filament strands crossing like wiring — for
      // false_cable the cable is the lure (it reads as dead conduit until close).
      const strand = geo('gr_lace', () => {
        const s = new THREE.CylinderGeometry(0.05, 0.09, 2.8, 5);
        s.translate(0, 1.4, 0);
        return s;
      });
      for (let i = 0; i < 8; i += 1) {
        const t = new THREE.Mesh(strand, i % 2 ? fil : tissue);
        const a = (i / 8) * Math.PI * 2;
        t.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
        t.rotation.z = Math.cos(a) * 1.0;
        t.rotation.x = -Math.sin(a) * 1.0;
        t.scale.setScalar(r * 0.7);
        g.add(t);
      }
      if (moduleId === 'false_cable') {
        const tip = new THREE.Mesh(geo('gr_lace_tip', () => new THREE.SphereGeometry(0.12, 6, 5)), glow);
        tip.position.y = r * 1.2;
        tip.scale.setScalar(r * 0.4);
        g.add(tip);
      }
      break;
    }
    case 'red_core': {
      // B-table: a hard glowing node — the field's reactor organ.
      const core = new THREE.Mesh(geo('gr_redcore', () => new THREE.SphereGeometry(0.62, 14, 10)),
        glowMat(0xff3b2f, 1.8));
      core.scale.setScalar(r * 0.9);
      core.position.y = r * 0.5;
      g.add(core);
      const cage = new THREE.Mesh(geo('gr_redcage', () => new THREE.TorusGeometry(0.8, 0.1, 6, 16)), fil);
      cage.rotation.x = Math.PI / 2;
      cage.scale.setScalar(r * 0.8);
      g.add(cage);
      break;
    }
    case 'memory_knot': {
      // B-table: a dense folded knot — the site’s archive organ.
      const knot = new THREE.Mesh(geo('gr_knot', () => new THREE.TorusKnotGeometry(0.55, 0.2, 48, 8)), tissue);
      knot.scale.setScalar(r * 0.75);
      knot.position.y = r * 0.6;
      g.add(knot);
      const bead = new THREE.Mesh(geo('gr_knot_bead', () => new THREE.SphereGeometry(0.16, 8, 6)), glow);
      bead.position.y = r * 0.6;
      bead.scale.setScalar(r * 0.6);
      g.add(bead);
      break;
    }
    case 'mirror_membrane': {
      // B-table: a flat mirrored sheet standing off the hull — phantom-echo organ.
      const pane = new THREE.Mesh(geo('gr_mirror', () => {
        const s = new THREE.SphereGeometry(1, 16, 8);
        s.scale(1, 0.05, 1);
        return s;
      }), new THREE.MeshStandardMaterial({
        color: 0x2a2f38, roughness: 0.25, metalness: 0.7,
        emissive: 0x223344, emissiveIntensity: 0.2,
      }));
      pane.scale.setScalar(r);
      pane.position.y = r * 0.3;
      g.add(pane);
      break;
    }
    case 'dead_crown': {
      // B-table: the severed-state crown — a ring of dried spike blades, no glow.
      const spike = geo('gr_deadspike', () => {
        const s = new THREE.ConeGeometry(0.14, 2.6, 5);
        s.translate(0, 1.3, 0);
        return s;
      });
      const dead = new THREE.MeshStandardMaterial({
        color: 0x6e6a5e, roughness: 0.95, metalness: 0.0,
      });
      for (let i = 0; i < 9; i += 1) {
        const s2 = new THREE.Mesh(spike, dead);
        const a = (i / 9) * Math.PI * 2;
        s2.position.set(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55);
        s2.rotation.z = Math.cos(a) * 0.8;
        s2.rotation.x = -Math.sin(a) * 0.8;
        s2.scale.setScalar(r * 0.7);
        g.add(s2);
      }
      break;
    }
    case 'silt_root': {
      // B-table: a low mineral root ridge — the underground half of the colony.
      const ridge = geo('gr_ridge', () => {
        const s = new THREE.BoxGeometry(0.5, 0.5, 2.2);
        s.translate(0, 0.25, 0);
        return s;
      });
      for (let i = 0; i < 4; i += 1) {
        const seg = new THREE.Mesh(ridge, tissue);
        const a = i * 0.7;
        seg.position.set(Math.cos(a) * r * 0.4, 0, Math.sin(a) * r * 0.4);
        seg.rotation.y = a;
        seg.scale.setScalar(r * 0.75);
        g.add(seg);
      }
      break;
    }
    case 'sensory_fan':
    case 'mineral_root':
    default: {
      const blade = geo('gr_blade', () => {
        const s = new THREE.ConeGeometry(0.16, 2.4, 4);
        s.translate(0, 1.2, 0);
        return s;
      });
      for (let i = 0; i < 7; i += 1) {
        const b = new THREE.Mesh(blade, i % 2 ? tissue : fil);
        const a = -0.9 + (i / 6) * 1.8;
        b.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
        b.rotation.z = a * 0.7;
        b.scale.setScalar(r * 0.85);
        g.add(b);
      }
      break;
    }
  }
  // Some growth variants use only one of these finishes. Retire the unused
  // materials so they do not keep a pending skin subscription alive.
  const usedMaterials = new Set();
  g.traverse((node) => {
    if (node.material) {
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) usedMaterials.add(material);
    }
  });
  for (const material of [tissue, fil, glow]) {
    if (!usedMaterials.has(material)) material.dispose();
  }
  g.userData.kind = 'alienGrowth';
  g.userData.moduleId = moduleId;
  return g;
}
