// Canonical authored PBR program state.
//
// Mid-flight shader links were dominated by near-duplicate MeshStandard/Physical programs that
// differed from an already-linked program by one parameter: dithering on/off, or a single texture
// slot present/absent (mapUv, normalMapUv, roughnessMapUv, metalnessMapUv). Every authored PBR
// material passing the admission choke point leaves here with the same texture-slot set — empty
// slots get a neutral 1x1 stand-in that is mathematically pixel-identical to no map — and
// dithering on, so one authored program family serves the whole set.
//
// Slot neutrality: white base/ORM/emissive texels multiply their factor by 1.0 (the AO specular
// occlusion term saturates to 1.0), and a flat (0.5, 0.5, 1.0) float normal texel decodes to
// exactly (0, 0, 1). alphaMap/lightMap/bumpMap/displacementMap and clearcoat stay authored —
// they change blending, UV sets, or the lighting model, not a near-duplicate define.

import * as THREE from 'three';
import { protectSharedGpuResource } from './assetResidency.js';

export const PROGRAM_CANON_VERSION = 1;

const CANON_STAMP = 'spacefaceProgramCanon';
const CANON_EXEMPT = 'spacefaceProgramCanonExempt';
// installRoughnessBreakup injects `#ifdef USE_MAP` noise over vMapUv. Filling `map` on a breakup
// material that lacked one would switch that perturbation on — a real output change, not a
// neutral stand-in — so that one slot stays authored on breakup carriers.
const BREAKUP_CACHE_KEY_TOKEN = 'spaceface-surface-breakup';

let whiteSrgbTexture = null;
let whiteLinearTexture = null;
let flatNormalTexture = null;

function neutralTexture(data, type, colorSpace) {
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, type);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  // Boundary/residency disposal must never free a texture other materials still sample.
  return protectSharedGpuResource(texture);
}

function canonWhiteSrgbTexture() {
  if (!whiteSrgbTexture) {
    whiteSrgbTexture = neutralTexture(
      new Uint8Array([255, 255, 255, 255]), THREE.UnsignedByteType, THREE.SRGBColorSpace,
    );
  }
  return whiteSrgbTexture;
}

function canonWhiteLinearTexture() {
  if (!whiteLinearTexture) {
    whiteLinearTexture = neutralTexture(
      new Uint8Array([255, 255, 255, 255]), THREE.UnsignedByteType, THREE.NoColorSpace,
    );
  }
  return whiteLinearTexture;
}

function canonFlatNormalTexture() {
  if (!flatNormalTexture) {
    // Float so 0.5 * 2 - 1 is exactly 0 — no decoded axial nibble error.
    flatNormalTexture = neutralTexture(
      new Float32Array([0.5, 0.5, 1.0, 1.0]), THREE.FloatType, THREE.NoColorSpace,
    );
  }
  return flatNormalTexture;
}

function materialCarriesBreakupPatch(material) {
  if (material?.userData?.spacefaceRoughnessBreakup === true) return true;
  try {
    return typeof material?.customProgramCacheKey === 'function'
      && String(material.customProgramCacheKey() || '').includes(BREAKUP_CACHE_KEY_TOKEN);
  } catch (_) {
    return false;
  }
}

/**
 * Give every authored PBR material under `root` the same texture-slot set and dithering=true so
 * one linked program serves every variant. Idempotent via the userData version stamp. Returns
 * counts, or { skipped: 'disabled' } under the __SF_PROGRAM_CANON_OFF__ kill switch.
 */
export function canonicalizeAuthoredProgramState(root) {
  if (globalThis.__SF_PROGRAM_CANON_OFF__ === true) return { skipped: 'disabled' };
  const filled = { map: 0, normalMap: 0, roughnessMap: 0, metalnessMap: 0, aoMap: 0, emissiveMap: 0 };
  const report = { materials: 0, changed: 0, dithered: 0, filled, exempt: 0 };
  const seen = new Set();
  const visit = (material) => {
    if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return;
    if (seen.has(material)) return;
    seen.add(material);
    const userData = material.userData || (material.userData = {});
    if (userData[CANON_EXEMPT] === true) {
      report.exempt += 1;
      return;
    }
    report.materials += 1;
    if (userData[CANON_STAMP] === PROGRAM_CANON_VERSION) return;
    let changed = false;
    if (material.dithering !== true) {
      material.dithering = true;
      report.dithered += 1;
      changed = true;
    }
    if (!material.map && !materialCarriesBreakupPatch(material)) {
      material.map = canonWhiteSrgbTexture();
      filled.map += 1;
      changed = true;
    }
    // bumpMap already owns the relief slot; a flat normal map on top would be a second program.
    if (!material.normalMap && !material.bumpMap) {
      material.normalMap = canonFlatNormalTexture();
      material.normalMapType = THREE.TangentSpaceNormalMap;
      filled.normalMap += 1;
      changed = true;
    }
    if (!material.roughnessMap) {
      material.roughnessMap = canonWhiteLinearTexture();
      filled.roughnessMap += 1;
      changed = true;
    }
    if (!material.metalnessMap) {
      material.metalnessMap = canonWhiteLinearTexture();
      filled.metalnessMap += 1;
      changed = true;
    }
    if (!material.aoMap) {
      material.aoMap = canonWhiteLinearTexture();
      filled.aoMap += 1;
      changed = true;
    }
    if (!material.emissiveMap) {
      material.emissiveMap = canonWhiteSrgbTexture();
      filled.emissiveMap += 1;
      changed = true;
    }
    userData[CANON_STAMP] = PROGRAM_CANON_VERSION;
    if (changed) {
      material.needsUpdate = true;
      report.changed += 1;
    }
  };
  if (root && typeof root.traverse === 'function') {
    root.traverse((object) => {
      const list = Array.isArray(object && object.material)
        ? object.material
        : (object && object.material ? [object.material] : []);
      for (const material of list) visit(material);
    });
  } else {
    visit(root);
  }
  return report;
}
