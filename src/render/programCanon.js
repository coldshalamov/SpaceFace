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

// ---------------------------------------------------------------------------
// Retained canonical program specimens.
//
// A linked program dies with its last live material: boundary teardown runs
// material.dispose() -> releaseProgram(), and the next admission that needs the
// same key pays another gl.linkProgram in flight. The admission choke point
// already holds every authored material in the exact post-policy state the first
// draw compiles, so for each novel material-state x object-axes signature this
// mounts one tiny specimen mesh inside the admission root for the duration of
// that same preparePipelines() compile. Binding rides the existing pass, so a
// covered key costs no extra linkProgram work; once bound, the never-disposed
// specimen keeps the program resident and every later admission of a matching
// key becomes a cache hit instead of a flight link.

const SPECIMEN_MARKER = 'spacefaceProgramSpecimen';
const SPECIMEN_LIMIT = 512;
const specimensBySignature = new Map();

// Texture slots and attribute names three's program parameters read. Presence and
// texCoord channel both enter the cache key; texel contents never do.
const SPECIMEN_TEXTURE_SLOTS = Object.freeze([
  'map', 'alphaMap', 'lightMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap',
  'emissiveMap', 'metalnessMap', 'roughnessMap', 'anisotropyMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap',
  'iridescenceThicknessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularMap',
  'specularColorMap', 'specularIntensityMap', 'transmissionMap', 'thicknessMap',
  'gradientMap', 'matcap',
]);
const SPECIMEN_GEOMETRY_ATTRIBUTES = Object.freeze([
  'normal', 'uv', 'uv1', 'uv2', 'uv3', 'tangent', 'color', 'skinIndex', 'skinWeight',
]);

export function canonicalProgramSpecimenPoolSize() {
  return specimensBySignature.size;
}

/** Context loss invalidates every pinned program; release the retained specimens so the next
 * admissions mint and re-pin fresh ones against the restored context. */
export function clearCanonicalProgramSpecimens() {
  specimensBySignature.clear();
}

/** Diagnostic surface: the dedupe signature a (material, object) pair mints under. Exported so
 * tests and probes can assert a specimen reproduces its source's program axes exactly. */
export function canonicalProgramSpecimenSignature(material, object) {
  if (!material || !object) return null;
  // _colorsTexture/morphTexture axes cannot be re-created cheaply on a probe mesh;
  // leaving those signatures uncovered is correct (first admission pays once).
  if (object.isBatchedMesh === true) return null;
  if (object.isInstancedMesh === true && object.morphTexture) return null;
  const parts = [];
  parts.push(material.type || 'unknown');
  try {
    parts.push(typeof material.customProgramCacheKey === 'function'
      ? String(material.customProgramCacheKey() || '') : '');
  } catch (_) {
    parts.push('');
  }
  for (const slot of SPECIMEN_TEXTURE_SLOTS) {
    const texture = material[slot];
    parts.push(texture ? `${slot}.${texture.channel || 0}` : '');
  }
  const envMap = material.envMap || null;
  parts.push(envMap
    ? `env.${envMap.mapping}.${envMap.image && envMap.image.height || 0}`
    : '');
  parts.push(
    material.blending,
    material.side,
    material.transparent === true ? 1 : 0,
    material.premultipliedAlpha === true ? 1 : 0,
    material.forceSinglePass === true ? 1 : 0,
    Number(material.alphaTest) > 0 ? 1 : 0,
    material.alphaHash === true ? 1 : 0,
    material.alphaToCoverage === true ? 1 : 0,
    material.vertexColors === true ? 1 : 0,
    material.dithering === true ? 1 : 0,
    material.flatShading === true ? 1 : 0,
    material.wireframe === true ? 1 : 0,
    material.fog === true ? 1 : 0,
    material.sizeAttenuation === true ? 1 : 0,
    material.toneMapped === true ? 1 : 0,
    Number(material.clearcoat) > 0 ? 1 : 0,
    Number(material.transmission) > 0 ? 1 : 0,
    Number(material.dispersion) > 0 ? 1 : 0,
    Number(material.iridescence) > 0 ? 1 : 0,
    Number(material.sheen) > 0 ? 1 : 0,
    Number(material.anisotropy) > 0 ? 1 : 0,
    material.combine === undefined ? '' : material.combine,
    material.depthPacking === undefined ? '' : material.depthPacking,
    material.index0AttributeName === undefined ? '' : material.index0AttributeName,
    material.normalMap && material.normalMapType !== undefined ? material.normalMapType : '',
    material.normalMap && material.normalMap.format !== undefined ? material.normalMap.format : '',
    material.extensions && material.extensions.clipCullDistance === true ? 1 : 0,
    material.extensions && material.extensions.multiDraw === true ? 1 : 0,
  );
  if (material.defines && typeof material.defines === 'object') {
    parts.push(JSON.stringify(material.defines));
  }
  const geometry = object.geometry || null;
  const attributes = geometry && geometry.attributes ? geometry.attributes : {};
  for (const name of SPECIMEN_GEOMETRY_ATTRIBUTES) {
    const attribute = attributes[name];
    parts.push(attribute ? `${name}.${attribute.itemSize}` : '');
  }
  const morph = geometry && geometry.morphAttributes ? geometry.morphAttributes : {};
  for (const name of Object.keys(morph).sort()) {
    const list = morph[name];
    parts.push(`morph.${name}.${Array.isArray(list) ? list.length : 0}`);
  }
  parts.push(
    object.isInstancedMesh === true ? 1 : 0,
    object.isInstancedMesh === true && object.instanceColor
      ? `ic.${object.instanceColor.itemSize}` : 0,
    object.isSkinnedMesh === true ? 1 : 0,
    object.isPoints === true ? 1 : 0,
    object.isLine === true ? 1 : 0,
    object.isSprite === true ? 1 : 0,
  );
  return parts.join('|');
}

function cloneProgramSpecimenMaterial(material) {
  let clone = null;
  try { clone = material.clone(); } catch (_) { return null; }
  if (!clone) return null;
  // Material.copy() drops own-property shader hooks and resets defines; reattach them
  // verbatim so the specimen mints the identical customProgramCacheKey surface.
  if (Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')) {
    clone.onBeforeCompile = material.onBeforeCompile;
  }
  if (Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')) {
    clone.customProgramCacheKey = material.customProgramCacheKey;
  }
  if (material.defines && typeof material.defines === 'object') {
    clone.defines = Object.assign({}, material.defines);
  }
  clone.name = `SF_ProgramSpecimen_${material.name || material.type}`.slice(0, 96);
  clone.userData = { spacefaceSharedAsset: true, [SPECIMEN_MARKER]: true };
  return clone;
}

function synthesizeSpecimenGeometry(source) {
  const geometry = new THREE.BufferGeometry();
  const attributes = source && source.attributes ? source.attributes : {};
  const put = (name, itemSize, normalized) => {
    geometry.setAttribute(name, new THREE.BufferAttribute(
      new Float32Array(3 * itemSize), itemSize, normalized === true,
    ));
  };
  put('position', attributes.position ? attributes.position.itemSize : 3);
  for (const name of SPECIMEN_GEOMETRY_ATTRIBUTES) {
    const attribute = attributes[name];
    if (attribute) put(name, attribute.itemSize, attribute.normalized);
  }
  const morph = source && source.morphAttributes;
  if (morph) {
    for (const name of Object.keys(morph)) {
      const list = morph[name];
      if (!Array.isArray(list)) continue;
      geometry.morphAttributes[name] = list.map((attribute) => {
        const itemSize = attribute && attribute.itemSize || 3;
        return new THREE.BufferAttribute(
          new Float32Array(3 * itemSize), itemSize, attribute && attribute.normalized === true,
        );
      });
    }
  }
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function mintProgramSpecimen(object, material) {
  const clone = cloneProgramSpecimenMaterial(material);
  if (!clone) return null;
  let specimen;
  if (object.isSprite === true) {
    specimen = new THREE.Sprite(clone);
  } else {
    const geometry = synthesizeSpecimenGeometry(object.geometry);
    if (object.isSkinnedMesh === true) {
      specimen = new THREE.SkinnedMesh(geometry, clone);
    } else if (object.isInstancedMesh === true) {
      specimen = new THREE.InstancedMesh(geometry, clone, 1);
      if (object.instanceColor) {
        specimen.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(object.instanceColor.itemSize), object.instanceColor.itemSize,
        );
      }
    } else if (object.isPoints === true) {
      specimen = new THREE.Points(geometry, clone);
    } else if (object.isLine === true) {
      specimen = new THREE.Line(geometry, clone);
    } else {
      specimen = new THREE.Mesh(geometry, clone);
    }
  }
  specimen.name = `SF_ProgramSpecimen_${clone.name}`.slice(0, 96);
  specimen.userData = { spacefaceSharedAsset: true, [SPECIMEN_MARKER]: true };
  specimen.castShadow = object.castShadow === true;
  specimen.receiveShadow = object.receiveShadow === true;
  return specimen;
}

/**
 * For each material-state x object-axes signature not already covered, mount one tiny
 * specimen mesh inside `root` so the caller's own compile binds (and pins) that program.
 * Returns the specimen group for `settleCanonicalProgramSpecimens`, or null when the
 * signature space is already covered. Specimens stay invisible to presentation — the
 * admission root is unpublished for the whole window — and are detached after compile.
 */
export function mountCanonicalProgramSpecimens(root) {
  if (globalThis.__SF_PROGRAM_SPECIMENS_OFF__ === true) return null;
  if (!root || typeof root.traverse !== 'function' || typeof root.add !== 'function') return null;
  const pending = [];
  const queued = new Set();
  let capped = false;
  root.traverse((object) => {
    if (capped || !object || (object.userData && object.userData[SPECIMEN_MARKER])) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : (object.material ? [object.material] : []);
    for (const material of materials) {
      let signature;
      try { signature = canonicalProgramSpecimenSignature(material, object); } catch (_) {
        continue;
      }
      if (!signature || queued.has(signature)) continue;
      const covered = specimensBySignature.get(signature);
      if (covered) {
        // Re-mount the retained specimen: a previously aborted admission may have registered
        // the signature without ever binding it — this bind self-heals (cache-hit when already
        // bound, a real pin otherwise).
        queued.add(signature);
        pending.push(covered);
        continue;
      }
      if (specimensBySignature.size >= SPECIMEN_LIMIT) {
        capped = true;
        return;
      }
      const specimen = mintProgramSpecimen(object, material);
      if (!specimen) continue;
      specimensBySignature.set(signature, specimen);
      queued.add(signature);
      pending.push(specimen);
    }
  });
  if (pending.length === 0) return null;
  const mount = new THREE.Group();
  mount.name = 'SF_CanonicalProgramSpecimens';
  mount.userData[SPECIMEN_MARKER] = true;
  for (const specimen of pending) mount.add(specimen);
  root.add(mount);
  return mount;
}

/** Detach the mounted specimen group. The registry keeps each specimen (and the program
 * binding it acquired) alive for the renderer's lifetime. */
export function settleCanonicalProgramSpecimens(root, mount) {
  if (!mount) return;
  try {
    if (root && typeof root.remove === 'function') root.remove(mount);
  } catch (_) { /* registry pins are unaffected by a stale parent edge */ }
}
