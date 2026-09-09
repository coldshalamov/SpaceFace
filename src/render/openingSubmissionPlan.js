// Exact first-playable submission boundary.
//
// Startup used to admit a handful of authored roots and then discover the real draw set with an
// off-screen render.  That made the loading time proportional to whatever happened to be attached
// to the scene rather than to the first picture.  This module turns the already-instantiated
// production graph into an immutable manifest: only flat drawable leaves that can contribute to the
// first picture are compiled and uploaded.  It deliberately keeps Object3D ownership outside the
// manifest; the plan freezes metadata and references, never the live scene graph.

export const OPENING_SUBMISSION_PLAN_SCHEMA = 'spaceface.openingSubmissionPlan.v1';
export const FIRST_PLAYABLE_PIPELINE_SET_SCHEMA = 'spaceface.firstPlayablePipelineSet.v1';

const DRAWABLE_TYPES = Object.freeze([
  'isMesh',
  'isSkinnedMesh',
  'isPoints',
  'isLine',
  'isSprite',
]);

// Procedural producers do not have a GLB byte stream whose digest can be copied from a manifest.
// They do, however, have a deterministic construction manifest (seed, recipe, tier, and the
// material/geometry grammar that was actually instantiated).  Keep the digest implementation here
// synchronous: the opening plan is captured at a frame boundary and cannot wait on an async Web
// Crypto continuation without reopening the broad loading latch.  This is the same SHA-256 shape
// used by render-package manifests, and is only marked verified for manifests supplied by a real
// producer through stampOpeningSubmissionPackage().
const SHA256_K = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function stableManifestString(value, seen = new Set()) {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'function') return 'null';
  if (seen.has(value)) return '"[cycle]"';
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value.map((item) => stableManifestString(item, seen)).join(',')}]`;
  } else {
    result = `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableManifestString(value[key], seen)}`
    )).join(',')}}`;
  }
  seen.delete(value);
  return result;
}

function cloneManifest(value, seen = new Map()) {
  if (value == null || typeof value !== 'object') {
    return typeof value === 'function' ? null : value;
  }
  if (seen.has(value)) return '[cycle]';
  seen.set(value, true);
  const copy = Array.isArray(value) ? [] : {};
  if (Array.isArray(value)) {
    for (const item of value) copy.push(cloneManifest(item, seen));
  } else {
    for (const [key, item] of Object.entries(value)) copy[key] = cloneManifest(item, seen);
  }
  seen.delete(value);
  return copy;
}

function utf8Bytes(value) {
  const text = String(value);
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(++i);
      const scalar = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      bytes.push(
        0xf0 | (scalar >> 18),
        0x80 | ((scalar >> 12) & 0x3f),
        0x80 | ((scalar >> 6) & 0x3f),
        0x80 | (scalar & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function rotr(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

/** Synchronous SHA-256 for small producer manifests (never called on asset bytes). */
export function contentHashForProducerManifest(manifest) {
  const input = utf8Bytes(stableManifestString(manifest));
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const words = new Uint32Array(64);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = words[i - 15];
      const w2 = words[i - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + SHA256_K[i] + words[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * Publish a producer-owned package boundary for generated roots. Authored render-package roots
 * already publish a verified byte hash and are left untouched; generated roots use this exact
 * recipe manifest rather than an object count or renderer.info count.
 */
export function stampOpeningSubmissionPackage(root, manifest, options = {}) {
  if (!root || !root.userData || !manifest || typeof manifest !== 'object') return null;
  const existing = root.userData.openingSubmissionPackage;
  // A producer owns this boundary.  Callers that merely observe a live graph must never be able
  // to replace the recipe (or silently replace one producer with another) after construction.
  // Lifecycle-owned producers may explicitly republish after a real recipe change.
  if (existing && options.replace !== true) return existing;
  if (existing && options.replace === true && options.producer
    && existing.producer && String(existing.producer) !== String(options.producer)) {
    return existing;
  }
  const manifestCopy = cloneManifest(manifest);
  const contentHash = contentHashForProducerManifest(manifestCopy);
  const packageInfo = {
    schema: 'spaceface.openingSubmissionPackage.v1',
    assetId: String(options.assetId || root.userData.assetId || root.name || 'producer-root'),
    contentHash,
    contentHashVerified: true,
    producer: String(options.producer || manifest.producer || 'generated-render-producer'),
    manifest: freeze(manifestCopy),
  };
  root.userData.openingSubmissionPackage = freeze(packageInfo);
  return root.userData.openingSubmissionPackage;
}

function freeze(value, seen = new Set(), skip = null) {
  if (!value || typeof value !== 'object' || seen.has(value) || (skip && skip.has(value))) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) freeze(item, seen, skip);
  } else {
    for (const item of Object.values(value)) freeze(item, seen, skip);
  }
  seen.delete(value);
  try { Object.freeze(value); } catch (_) {}
  return value;
}

function stableId(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const userData = value.userData || {};
  if (userData.openingSubmissionId != null) return String(userData.openingSubmissionId);
  if (userData.entityId != null) return `entity:${userData.entityId}`;
  if (userData.sfEntityId != null) return `entity:${userData.sfEntityId}`;
  if (value.uuid) return `uuid:${value.uuid}`;
  if (value.id != null) return `id:${value.id}`;
  if (value.name) return `name:${value.name}`;
  return fallback;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return value == null ? [] : [value];
}

function isDrawable(object) {
  return !!(object && DRAWABLE_TYPES.some((key) => object[key] === true));
}

function isVisibleInProductionGraph(object, root) {
  for (let cursor = object; cursor; cursor = cursor.parent) {
    if (cursor.visible === false) return false;
    if (cursor === root) break;
  }
  return true;
}

function hasDrawableInstance(object) {
  if (!object) return false;
  // Pooled VFX often keep an Object3D and a full-capacity buffer alive while their draw range is
  // empty. Such a pool is not instantiated in the first picture and must not become a startup
  // texture/program blocker merely because its owner root is attached to the scene.
  if (object.isInstancedMesh || object.isPoints || object.isLine || object.isSprite) {
    const count = Number(object.count);
    if (Number.isFinite(count) && count <= 0) return false;
  }
  const drawRange = object.geometry && object.geometry.drawRange;
  if (drawRange && Number.isFinite(Number(drawRange.count)) && Number(drawRange.count) <= 0) return false;
  return true;
}

function makeFrustum(camera) {
  if (!camera) return null;
  // Avoid importing Three.js into this data-only boundary. A caller may provide the exact frustum
  // helper used by its renderer; otherwise all visible leaves are retained, which is fail-closed.
  if (camera.frustum && typeof camera.frustum.intersectsObject === 'function') return camera.frustum;
  if (!camera.projectionMatrix || !camera.matrixWorldInverse) return null;
  if (typeof camera.getOpeningSubmissionFrustum === 'function') {
    try { return camera.getOpeningSubmissionFrustum(); } catch (_) { return null; }
  }
  return null;
}

function leafContributes(object, root, frustum, options = {}) {
  if (!isDrawable(object) || !isVisibleInProductionGraph(object, root) || !hasDrawableInstance(object)) {
    return false;
  }
  // A real camera's layer mask is part of the first-picture route just like its frustum. Keep the
  // historical fail-closed behavior when either side has no layer contract, but do not admit a
  // drawable that the live camera cannot submit because its layer is masked out.
  const cameraLayers = options.camera && options.camera.layers;
  const objectLayers = object && object.layers;
  if (cameraLayers && typeof cameraLayers.test === 'function'
      && objectLayers && cameraLayers.test(objectLayers) === false) {
    return false;
  }
  if (options.includeOffscreen === true || object.frustumCulled === false || !frustum) return true;
  try { return frustum.intersectsObject(object); } catch (_) { return true; }
}

/** Return the flat production draw leaves in stable traversal order. */
export function collectOpeningSubmissionLeaves(root, options = {}) {
  if (!root) return Object.freeze([]);
  if (typeof root.traverse !== 'function') return Object.freeze(isDrawable(root) ? [root] : []);
  const leaves = [];
  const frustum = makeFrustum(options.camera);
  root.traverse((object) => {
    if (leafContributes(object, root, frustum, options)) leaves.push(object);
  });
  return Object.freeze(leaves);
}

function materialList(object) {
  return Array.isArray(object && object.material)
    ? object.material.filter(Boolean)
    : object && object.material ? [object.material] : [];
}

function texturesForMaterial(material, output) {
  if (!material || typeof material !== 'object') return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture === true) output.add(value);
  }
  for (const uniform of Object.values(material.uniforms || {})) {
    const value = uniform && uniform.value;
    if (value && value.isTexture === true) output.add(value);
  }
}

function textureDescriptor(texture, index) {
  const image = texture && (texture.image || texture.source && texture.source.data) || null;
  return {
    id: stableId(texture, `texture:${index}`),
    name: String(texture && (texture.name || image && image.name) || ''),
    width: Number(image && image.width) || 0,
    height: Number(image && image.height) || 0,
  };
}

const programObjectIds = new WeakMap();
let nextProgramObjectId = 1;

function rendererProgramKeys(renderer) {
  const programs = renderer && renderer.info && renderer.info.programs;
  if (!Array.isArray(programs)) return [];
  return [...new Set(programs.map(programCacheKey).filter(Boolean))];
}

function programCacheKey(program) {
  if (!program || typeof program !== 'object') return '';
  if (program.cacheKey) return String(program.cacheKey);
  if (program.id != null) return `id:${program.id}`;
  let identity = programObjectIds.get(program);
  if (!identity) {
    identity = `object:${nextProgramObjectId++}`;
    programObjectIds.set(program, identity);
  }
  return identity;
}

function materialProgramBinding(renderer, material, label) {
  if (!renderer || !renderer.properties || typeof renderer.properties.get !== 'function') {
    return { keys: [], failure: `${label}:renderer-properties-unavailable` };
  }
  let properties = null;
  try {
    properties = renderer.properties.get(material);
  } catch (_) {
    return { keys: [], failure: `${label}:renderer-properties-unreadable` };
  }
  const keys = new Set();
  const programs = properties && properties.programs;
  if (programs && typeof programs.keys === 'function') {
    for (const key of programs.keys()) if (key != null && String(key)) keys.add(String(key));
  }
  const currentKey = programCacheKey(properties && properties.currentProgram);
  if (currentKey) keys.add(currentKey);
  return keys.size > 0
    ? { keys: [...keys].sort(), failure: null }
    : { keys: [], failure: `${label}:unprepared-material` };
}

function receiptProgramMaterials(plan, options = {}) {
  const entries = [];
  const seen = new Set();
  const add = (material, label) => {
    if (!material || seen.has(material)) return;
    seen.add(material);
    entries.push({ material, label });
  };
  for (const [index, subject] of (plan && plan.compileSubjects || []).entries()) {
    for (const [materialIndex, material] of materialList(subject).entries()) {
      add(material, `plan:${index}:material:${materialIndex}`);
    }
  }
  for (const [index, material] of (options.programMaterials || []).entries()) {
    add(material, `post:${index}`);
  }
  return entries;
}

function requiredProgramBindings(renderer, plan, options = {}) {
  const keys = new Set();
  const failures = [];
  for (const { material, label } of receiptProgramMaterials(plan, options)) {
    const binding = materialProgramBinding(renderer, material, label);
    for (const key of binding.keys) keys.add(key);
    if (binding.failure) failures.push(binding.failure);
  }
  for (const key of options.shadowProgramKeys || []) if (key != null && String(key)) keys.add(String(key));
  for (const failure of options.shadowProgramBindingFailures || []) {
    if (failure != null && String(failure)) failures.push(String(failure));
  }
  return { keys: [...keys].sort(), failures: failures.sort() };
}

function textureSourceIdentity(texture) {
  if (!texture) return null;
  const source = texture.source && texture.source.data;
  const image = texture.image || source || null;
  return String(
    texture.userData && texture.userData.spacefaceSourceKey
      || texture.source && texture.source.uuid
      || image && (image.currentSrc || image.src || image.name || image.uuid)
      || texture.name
      || texture.uuid
      || '',
  ) || null;
}

function materialProgramSubjectManifest(material) {
  const textures = {};
  for (const [field, value] of Object.entries(material || {})) {
    if (value && value.isTexture === true) textures[field] = textureSourceIdentity(value);
  }
  return {
    type: String(material && material.type || 'Material'),
    customProgramCacheKey: typeof material?.customProgramCacheKey === 'function'
      ? (() => { try { return String(material.customProgramCacheKey() || ''); } catch (_) { return ''; } })()
      : '',
    defines: material && material.defines || null,
    transparent: material && material.transparent === true,
    depthWrite: material && material.depthWrite !== false,
    depthTest: material && material.depthTest !== false,
    side: material && material.side,
    blending: material && material.blending,
    vertexColors: material && material.vertexColors === true,
    fog: material && material.fog !== false,
    lights: material && material.lights === true,
    toneMapped: material && material.toneMapped !== false,
    declaredProgramKey: String(
      material && (material.programCacheKey
        || material.userData && (
          material.userData.openingProgramSubjectKey || material.userData.programKey
        )
      ) || '',
    ),
    shader: `${shaderSourceSignature(material && material.vertexShader)}|${
      shaderSourceSignature(material && material.fragmentShader)}`,
    textures,
  };
}

function shaderSourceSignature(source) {
  if (typeof source !== 'string' || !source) return '';
  const last = source.length - 1;
  return `${source.length}:${source.charCodeAt(0)}:${source.charCodeAt(last >> 1)}:${source.charCodeAt(last)}`;
}

/**
 * Stable producer-side admission key. This is deliberately named a subject key: Three's final
 * driver cache key is only knowable after compile, while this key is the exact material subject
 * identity used to select the leaf for that one compile. Receipts separately record the actual
 * renderer.info cache keys after admission.
 *
 * Do not return `customProgramCacheKey()` alone. Authored families share that string across
 * distinct maps/defines, which collapsed forty first-picture leaves into three admitted
 * programs while bloomScene still linked seventeen driver variants.
 */
export function openingProgramSubjectKey(material) {
  if (!material) return null;
  return `producer-program:${contentHashForProducerManifest(materialProgramSubjectManifest(material))}`;
}

function geometryDescriptor(geometry, index) {
  const attributes = geometry && geometry.attributes || {};
  let bytes = 0;
  for (const attribute of Object.values(attributes)) {
    const array = attribute && (attribute.array || attribute.data && attribute.data.array);
    if (array && Number.isFinite(array.byteLength)) bytes += array.byteLength;
  }
  const indexArray = geometry && geometry.index
    && (geometry.index.array || geometry.index.data && geometry.index.data.array);
  if (indexArray && Number.isFinite(indexArray.byteLength)) bytes += indexArray.byteLength;
  return {
    id: stableId(geometry, `geometry:${index}`),
    name: String(geometry && geometry.name || ''),
    bytes,
  };
}

function collectResourceIdentitySets(leaves, route, explicitTextures = []) {
  const geometryBufferIds = new Set();
  const blockingTextureIds = new Set();
  const shadowResourceIds = new Set();
  const textures = new Set(explicitTextures.filter((value) => value && value.isTexture === true));
  for (const leaf of leaves || []) {
    if (!leaf) continue;
    if (leaf.geometry) geometryBufferIds.add(stableId(leaf.geometry, 'geometry:unknown'));
    const materials = materialList(leaf);
    if (route && route.shadow === true && leaf.castShadow === true) {
      materials.push(leaf.customDepthMaterial, leaf.customDistanceMaterial);
    }
    for (const material of materials.filter(Boolean)) {
      texturesForMaterial(material, textures);
      if (route && route.shadow === true && leaf.castShadow === true) {
        shadowResourceIds.add(`shadow-material:${stableId(material, 'material:unknown')}`);
      }
    }
    if (route && route.shadow === true && leaf.castShadow === true) {
      if (leaf.geometry) shadowResourceIds.add(
        `shadow-geometry:${stableId(leaf.geometry, 'geometry:unknown')}`,
      );
      shadowResourceIds.add(`shadow-target:${String(route.target || 'shadow-map')}`);
    }
  }
  for (const texture of textures) blockingTextureIds.add(stableId(texture, 'texture:unknown'));
  return {
    geometryBufferIds: [...geometryBufferIds].sort(),
    blockingTextureIds: [...blockingTextureIds].sort(),
    shadowResourceIds: [...shadowResourceIds].sort(),
  };
}

/**
 * Read the exact first-picture producer census from one live root. Geometry and texture identities
 * come from the actual leaves, never renderer memory totals. Program entries are producer subject
 * keys used to select the leaf; the receipt records the final driver cache keys after compile.
 */
export function createOpeningProducerCensus(root, options = {}) {
  const leaves = collectOpeningSubmissionLeaves(root, {
    camera: options.camera,
    includeOffscreen: options.includeOffscreen === true,
  });
  const boundary = productionBoundary(root);
  const programs = [];
  const seenPrograms = new Set();
  for (const leaf of leaves) {
    for (const material of materialList(leaf)) {
      const key = openingProgramSubjectKey(material);
      if (!key || seenPrograms.has(key)) continue;
      seenPrograms.add(key);
      programs.push({
        key,
        contentHash: boundary.contentHash,
        packageIdentity: boundary.packageIdentity,
        source: 'producer-material-subject',
      });
    }
  }
  const resourceIdentitySets = collectResourceIdentitySets(
    leaves,
    options.route || {},
    options.textures || [],
  );
  return Object.freeze({
    rootId: stableId(root, 'root:unknown'),
    packageIdentity: boundary.packageIdentity,
    contentHash: boundary.contentHash,
    contentHashVerified: boundary.contentHashVerified === true,
    drawLeafIds: Object.freeze(leaves.map((leaf, index) => stableId(leaf, `leaf:${index}`))),
    programKeys: Object.freeze(programs.sort((left, right) => left.key.localeCompare(right.key))),
    geometryBufferIds: Object.freeze([...resourceIdentitySets.geometryBufferIds]),
    blockingTextureIds: Object.freeze([...resourceIdentitySets.blockingTextureIds]),
    shadowResourceIds: Object.freeze([...resourceIdentitySets.shadowResourceIds]),
  });
}

export function combineOpeningProducerCensuses(censuses = []) {
  const contentHashes = new Map();
  const programs = new Map();
  const geometryBufferIds = new Set();
  const blockingTextureIds = new Set();
  const shadowResourceIds = new Set();
  const drawLeafIds = new Set();
  for (const census of censuses || []) {
    if (!census) continue;
    if (census.contentHash) {
      contentHashes.set(String(census.contentHash), {
        contentHash: String(census.contentHash),
        verified: census.contentHashVerified === true,
      });
    }
    for (const entry of census.programKeys || []) {
      if (entry && entry.key) programs.set(String(entry.key), { ...entry, key: String(entry.key) });
    }
    for (const id of census.drawLeafIds || []) drawLeafIds.add(String(id));
    for (const id of census.geometryBufferIds || []) geometryBufferIds.add(String(id));
    for (const id of census.blockingTextureIds || []) blockingTextureIds.add(String(id));
    for (const id of census.shadowResourceIds || []) shadowResourceIds.add(String(id));
  }
  const sort = (set) => [...set].sort();
  return Object.freeze({
    requiredContentHashes: Object.freeze([...contentHashes.values()].sort((a, b) => (
      a.contentHash.localeCompare(b.contentHash)
    ))),
    globalProgramKeys: Object.freeze([...programs.values()].sort((a, b) => a.key.localeCompare(b.key))),
    openingProgramKeys: Object.freeze([...programs.values()].sort((a, b) => a.key.localeCompare(b.key))),
    drawLeafIds: Object.freeze(sort(drawLeafIds)),
    resourceIdentitySets: Object.freeze({
      geometryBufferIds: Object.freeze(sort(geometryBufferIds)),
      blockingTextureIds: Object.freeze(sort(blockingTextureIds)),
      shadowResourceIds: Object.freeze(sort(shadowResourceIds)),
    }),
    contentHashesVerified: contentHashes.size > 0
      && [...contentHashes.values()].every((entry) => entry.verified === true),
  });
}

function packageInfoFor(root) {
  let found = null;
  const chain = [];
  for (let cursor = root; cursor; cursor = cursor.parent) chain.push(cursor);
  for (const node of chain) {
    const data = node && node.userData || {};
    const packageInfos = [
      data.flightRenderPackage,
      data.renderPackage,
      data.spacefaceRenderPackage,
      data.openingSubmissionPackage,
    ];
    // Generic runtime metadata can share a root with the producer-owned opening package. Prefer
    // the hash-bearing boundary; selecting an id-only adapter first would make a valid producer
    // identity appear missing and would let renderer-side bookkeeping become provenance.
    const packageInfo = packageInfos.find((value) => value && typeof value === 'object'
      && (value.contentHash || value.hash));
    if (packageInfo) return { node, packageInfo };
    const fallback = packageInfos.find((value) => value && typeof value === 'object');
    if (fallback && !found) found = { node, packageInfo: fallback };
  }
  // Some package adapters stamp the immutable package on a leaf rather than the owning boundary.
  // Inspect descendants only as a fallback; the returned value is copied into metadata below.
  if (root && typeof root.traverse === 'function') {
    root.traverse((node) => {
      if (found && found.packageInfo
        && (found.packageInfo.contentHash || found.packageInfo.hash)) return;
      const data = node && node.userData || {};
      const packageInfos = [
        data.flightRenderPackage,
        data.renderPackage,
        data.spacefaceRenderPackage,
        data.openingSubmissionPackage,
      ];
      const packageInfo = packageInfos.find((value) => value && typeof value === 'object'
        && (value.contentHash || value.hash));
      if (packageInfo) found = { node, packageInfo };
      else if (!found) {
        const fallback = packageInfos.find((value) => value && typeof value === 'object');
        if (fallback) found = { node, packageInfo: fallback };
      }
    });
  }
  return found;
}

function productionBoundary(root) {
  const data = root && root.userData || {};
  const packageRecord = packageInfoFor(root);
  const packageInfo = packageRecord && packageRecord.packageInfo || null;
  const contract = data.renderContract || data.authoredRenderContract || null;
  const contentHash = packageInfo && (packageInfo.contentHash || packageInfo.hash) || null;
  const assetId = packageInfo && (packageInfo.assetId || packageInfo.id || packageInfo.key)
    || data.assetId || null;
  // Render-package loaders verify the content hash before exposing an instance.  Procedural
  // loadout fingerprints and asset IDs are identities, not content hashes, so they deliberately do
  // not satisfy this bit.  A canonical SHA-256 is accepted as verified because the package loader's
  // contract requires that form; tests and future producers may also carry the explicit bit.
  const contentHashVerified = !!(contentHash && (
    packageInfo && (packageInfo.contentHashVerified === true || packageInfo.verified === true)
    || data.contentHashVerified === true
    || /^[0-9a-f]{64}$/i.test(String(contentHash))
  ));
  return {
    schema: String(packageInfo && packageInfo.schema || contract && contract.schema || ''),
    identity: String(contentHash || assetId || data.loadoutFingerprint || root && root.name || ''),
    packageIdentity: contentHash || assetId || null,
    contentHash: contentHash ? String(contentHash) : null,
    contentHashVerified,
    assetId: assetId ? String(assetId) : null,
    sourcePlanNodes: Number(packageInfo && packageInfo.sourcePlanNodes) || null,
    boundaryNode: String(packageRecord && packageRecord.node
      && (packageRecord.node.name || packageRecord.node.type) || ''),
  };
}

function normalizeProgramKey(value, contentHash, contentHashes = null) {
  const allowedHashes = contentHashes instanceof Set
    ? contentHashes
    : new Set(contentHash ? [String(contentHash)] : []);
  if (typeof value === 'string') {
    const key = value.trim();
    const ownerHash = allowedHashes.size === 1 ? [...allowedHashes][0] : null;
    return key && ownerHash ? { key, contentHash: ownerHash } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const key = String(value.key || value.programKey || value.cacheKey || '').trim();
  if (!key) return null;
  const ownerHash = value.contentHash || value.packageIdentity
    || (allowedHashes.size === 1 ? [...allowedHashes][0] : null);
  if (!ownerHash || !allowedHashes.has(String(ownerHash))) return null;
  return { key, contentHash: String(ownerHash) };
}

/**
 * Build the deletion-only startup pipeline set. Global synthetic keys are useful only when the
 * content-hash-bound opening package uses the same exact driver key; A-B is explicitly deferred.
 * This is metadata-only until a caller supplies both key sets, so an absent census cannot silently
 * claim that unrelated global work was admitted.
 */
export function createFirstPlayablePipelineSet(options = {}) {
  const hashEntries = Array.isArray(options.requiredContentHashes)
    ? options.requiredContentHashes
    : Array.isArray(options.contentHashes)
      ? options.contentHashes
    : [options.contentHash || options.packageIdentity];
  let missingContentHash = false;
  const normalizedHashEntries = hashEntries.map((entry) => {
    if (entry && typeof entry === 'object') {
      const hash = String(entry.contentHash || entry.hash || '').trim();
      if (!hash) missingContentHash = true;
      return [hash, {
        contentHash: hash,
        verified: entry.verified === true
          || entry.contentHashVerified === true
          || options.contentHashVerified === true
          || options.contentHashesVerified === true,
      }];
    }
    const hash = String(entry || '').trim();
    if (!hash) missingContentHash = true;
    return [hash, {
      contentHash: hash,
      verified: options.contentHashVerified === true,
    }];
  });
  const requiredContentHashes = [...new Map(normalizedHashEntries
    .filter(([hash]) => !!hash))].map(([, entry]) => entry);
  const contentHash = requiredContentHashes.length === 1
    ? requiredContentHashes[0].contentHash
    : null;
  const contentHashes = new Set(requiredContentHashes.map((entry) => entry.contentHash));
  const hashesVerified = !missingContentHash
    && requiredContentHashes.length > 0
    && requiredContentHashes.every((entry) => entry.verified === true)
    && (options.contentHashesVerified !== false);
  const globalInput = Array.isArray(options.globalProgramKeys) ? options.globalProgramKeys : [];
  const openingInput = Array.isArray(options.openingProgramKeys) ? options.openingProgramKeys : [];
  const global = globalInput
    .map((value) => normalizeProgramKey(value, contentHash, contentHashes))
    .filter(Boolean);
  const opening = openingInput
    .map((value) => normalizeProgramKey(value, contentHash, contentHashes))
    .filter(Boolean);
  const unique = (items) => [...new Map(items.map((item) => [item.key, item])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));
  const globalKeys = unique(global);
  const openingKeys = unique(opening);
  const openingSet = new Set(openingKeys.map((entry) => entry.key));
  const admitted = globalKeys.filter((entry) => openingSet.has(entry.key));
  const deferred = globalKeys.filter((entry) => !openingSet.has(entry.key));
  const reason = missingContentHash || requiredContentHashes.length === 0
    ? 'missing-content-hash'
    : !hashesVerified
      ? 'unverified-content-hash'
      : globalKeys.length === 0
        ? 'missing-global-program-census'
        : openingKeys.length === 0
          ? 'missing-opening-program-census'
          : null;
  return freeze({
    schema: FIRST_PLAYABLE_PIPELINE_SET_SCHEMA,
    packageIdentity: contentHash || requiredContentHashes.map((entry) => entry.contentHash).join('|') || null,
    requiredContentHashes,
    contentHashesVerified: hashesVerified,
    globalProgramKeys: globalKeys,
    openingProgramKeys: openingKeys,
    admittedProgramKeys: admitted,
    deferredGlobalProgramKeys: deferred,
    complete: reason === null,
    reason,
  });
}

function defaultReason(candidate, leaves) {
  if (candidate && candidate.reason) return String(candidate.reason);
  if (leaves.length === 0) return 'no-currently-instantiated-first-picture-draw-leaf';
  if (candidate && candidate.role === 'player') return 'player-control-and-first-picture-identity';
  if (candidate && candidate.role === 'firstFrameBackground') return 'first-picture-background-layer';
  if (candidate && candidate.role === 'vfx') return 'currently-instantiated-first-picture-vfx';
  return 'first-picture-production-draw-contributor';
}

function normalizeCandidate(value, index) {
  if (value && value.root) return { ...value, root: value.root };
  return {
    root: value,
    role: value && value.userData && value.userData.openingSubmissionRole || 'production-root',
    startupRole: value && value.userData && value.userData.startupRole || 'first-picture',
    blocking: true,
    reason: '',
    index,
  };
}

function routeMetadata(options = {}) {
  const route = String(options.route || 'native');
  const hdrRoute = route === 'bloom' || route === 'graph' || route === 'renderGraph';
  return {
    route,
    target: hdrRoute ? 'hdr-scene-target' : 'screen',
    scene: true,
    shadow: options.shadows === true,
    bloom: options.bloomActive !== false && hdrRoute,
    post: hdrRoute,
  };
}

/**
 * Build and freeze the exact first-picture manifest. `candidates` are real live production roots;
 * `textures` may include scene.background/environment textures that have no Object3D leaf.
 */
export function createOpeningSubmissionPlan(options = {}) {
  const route = routeMetadata(options);
  const candidates = arrayFrom(options.candidates || options.roots).map(normalizeCandidate);
  const roots = [];
  const drawLeaves = [];
  const compileSubjects = [];
  const programCompileSubjects = [];
  const textureRefs = new Set(arrayFrom(options.textures).filter((value) => value && value.isTexture === true));
  const geometries = new Map();
  const materials = new Map();
  const seenLeaves = new Set();

  candidates.forEach((candidate, candidateIndex) => {
    const root = candidate.root;
    if (!root) return;
    const leaves = collectOpeningSubmissionLeaves(root, {
      camera: options.camera,
      includeOffscreen: candidate.includeOffscreen === true || options.includeOffscreen === true,
    });
    const rootId = stableId(root, `root:${candidateIndex}`);
    const boundary = productionBoundary(root);
    const rootDescriptor = {
      id: rootId,
      name: String(root.name || ''),
      role: String(candidate.role || 'production-root'),
      startupRole: String(candidate.startupRole || 'first-picture'),
      productionBoundary: boundary,
      blocking: candidate.blocking !== false,
      contributionReason: defaultReason(candidate, leaves),
      drawLeafCount: leaves.length,
    };
    roots.push(rootDescriptor);
    for (const leaf of leaves) {
      if (seenLeaves.has(leaf)) continue;
      seenLeaves.add(leaf);
      const geometry = leaf.geometry || null;
      const leafMaterials = materialList(leaf);
      const geometryRef = geometry ? geometryDescriptor(geometry, geometries.size) : null;
      if (geometryRef) geometries.set(geometry, geometryRef);
      const leafId = stableId(leaf, `leaf:${drawLeaves.length}`);
      const materialRefs = [];
      for (const material of leafMaterials) {
        const materialId = stableId(material, `material:${materials.size}`);
        if (!materials.has(material)) materials.set(material, {
          id: materialId,
          name: String(material.name || material.type || ''),
        });
        materialRefs.push(materialId);
        texturesForMaterial(material, textureRefs);
        let customProgramKey = null;
        if (typeof material.customProgramCacheKey === 'function') {
          try { customProgramKey = String(material.customProgramCacheKey() || '') || null; } catch (_) {}
        }
        const openingProgramSubjectKeyValue = openingProgramSubjectKey(material);
        const declaredProgramKey = String(
          material.programCacheKey
          || material.userData && (
            material.userData.programCacheKey
            || material.userData.programKey
            || material.userData.openingProgramSubjectKey
          )
          || customProgramKey
          || '',
        ) || null;
        programCompileSubjects.push({
          id: `${leafId}:${materialId}`,
          leafId,
          materialId,
          materialType: String(material.type || ''),
          packageIdentity: boundary.packageIdentity,
          contentHash: boundary.contentHash,
          contentHashVerified: boundary.contentHashVerified,
          customProgramKey,
          openingProgramSubjectKey: openingProgramSubjectKeyValue,
          programKey: declaredProgramKey,
          programSubjectKey: openingProgramSubjectKeyValue,
          target: route.target,
          shadow: route.shadow && leaf.castShadow === true,
          bloom: route.bloom,
          post: route.post,
        });
      }
      if (route.shadow && leaf.castShadow === true) {
        texturesForMaterial(leaf.customDepthMaterial, textureRefs);
        texturesForMaterial(leaf.customDistanceMaterial, textureRefs);
      }
      const pass = {
        scene: true,
        target: route.target,
        shadow: route.shadow && leaf.castShadow === true,
        bloom: route.bloom,
        post: route.post,
      };
      const descriptor = {
        id: leafId,
        rootId,
        name: String(leaf.name || leaf.type || ''),
        kind: String(leaf.type || 'Object3D'),
        geometryBufferId: geometryRef && geometryRef.id || null,
        materialIds: materialRefs,
        pass,
        visible: leaf.visible !== false,
        contributionReason: rootDescriptor.contributionReason,
      };
      drawLeaves.push(descriptor);
      compileSubjects.push(leaf);
    }
  });

  const explicitTextures = arrayFrom(options.textures).filter((value) => value && value.isTexture === true);
  for (const texture of explicitTextures) textureRefs.add(texture);
  const textureList = [...textureRefs];
  const requiredContentHashes = roots
    .filter((root) => root.blocking !== false)
    .map((root) => ({
      contentHash: root.productionBoundary && root.productionBoundary.contentHash,
      verified: root.productionBoundary && root.productionBoundary.contentHashVerified === true,
    }));
  const packageHash = options.contentHash
    || requiredContentHashes.map((entry) => entry.contentHash).find(Boolean)
    || null;
  const openingProgramKeys = options.openingProgramKeys
    || programCompileSubjects
      .filter((subject) => subject.programSubjectKey || subject.programKey || subject.customProgramKey)
      .map((subject) => ({
        key: subject.programSubjectKey || subject.programKey || subject.customProgramKey,
        contentHash: subject.contentHash,
      }));
  const firstPlayablePipelineSet = createFirstPlayablePipelineSet({
    contentHash: packageHash,
    requiredContentHashes: options.requiredContentHashes
      || (requiredContentHashes.length > 0
        ? requiredContentHashes
        : packageHash ? [{ contentHash: packageHash, verified: options.contentHashVerified === true }] : []),
    contentHashVerified: options.contentHashVerified,
    globalProgramKeys: options.globalProgramKeys,
    openingProgramKeys,
  });
  const resourceIdentitySets = collectResourceIdentitySets(
    compileSubjects,
    route,
    textureList,
  );
  const producerResourceIdentitySets = options.producerResourceIdentitySets
    || options.producerCensus && options.producerCensus.resourceIdentitySets
    || null;
  const producerResourceIdentityCensus = producerResourceIdentitySets
    ? {
      geometryBufferIds: [...(producerResourceIdentitySets.geometryBufferIds || [])].sort(),
      blockingTextureIds: [...(producerResourceIdentitySets.blockingTextureIds || [])].sort(),
      shadowResourceIds: [...(producerResourceIdentitySets.shadowResourceIds || [])].sort(),
    }
    : null;
  const resourceIdentityCensusMatches = !!producerResourceIdentityCensus
    && ['geometryBufferIds', 'blockingTextureIds', 'shadowResourceIds'].every((key) => (
      JSON.stringify(producerResourceIdentityCensus[key]) === JSON.stringify(resourceIdentitySets[key])
    ));
  const blockingRootsHaveVerifiedBoundaryHashes = roots
    .filter((root) => root.blocking !== false)
    .every((root) => !!(root.productionBoundary
      && root.productionBoundary.contentHash
      && root.productionBoundary.contentHashVerified === true));
  const shadowResources = resourceIdentitySets.shadowResourceIds.map((id) => ({
    id,
    required: true,
    reason: 'first-picture-shadow-pass',
  }));
  const plan = {
    schema: OPENING_SUBMISSION_PLAN_SCHEMA,
    version: 1,
    boundary: 'first-playable-frame',
    route,
    roots,
    drawLeaves,
    geometryBuffers: [...geometries.values()],
    materials: [...materials.values()],
    textures: textureList.map(textureDescriptor),
    resourceIdentitySets,
    producerResourceIdentitySets: producerResourceIdentityCensus,
    resourceIdentityCensusMatches,
    shadowResources,
    programCompileSubjects,
    firstPlayablePipelineSet,
    producerCensus: options.producerCensus || null,
    // These references are intentionally not serialized. They are the exact live leaves/textures
    // admitted by the manifest and let callers avoid reconstructing a hidden staging scene.
    compileSubjects,
    residencySubjects: compileSubjects,
    textureRefs: textureList,
    scene: options.scene || null,
    camera: options.camera || null,
    blockingReasons: roots.filter((root) => root.blocking).map((root) => ({
      rootId: root.id,
      role: root.role,
      reason: root.contributionReason,
    })),
    flightReady: options.flightReady || null,
    complete: drawLeaves.length > 0
      && roots.every((root) => root.blocking === false || root.drawLeafCount > 0)
      && blockingRootsHaveVerifiedBoundaryHashes
      && resourceIdentityCensusMatches
      && firstPlayablePipelineSet.complete === true,
  };
  if (!blockingRootsHaveVerifiedBoundaryHashes) {
    plan.blockingReasons.push({
      rootId: null,
      role: 'productionBoundary',
      reason: 'missing-or-unverified-blocking-content-hash',
    });
  }
  if (!resourceIdentityCensusMatches) {
    plan.blockingReasons.push({
      rootId: null,
      role: 'producerResourceIdentityCensus',
      reason: 'producer-resource-identity-census-mismatch',
    });
  }
  if (firstPlayablePipelineSet.complete !== true) {
    plan.blockingReasons.push({
      rootId: null,
      role: 'firstPlayablePipelineSet',
      reason: firstPlayablePipelineSet.reason,
    });
  }
  const liveReferences = new Set([
    ...compileSubjects,
    ...textureList,
    options.scene,
    options.camera,
  ].filter(Boolean));
  return freeze(plan, new Set(), liveReferences);
}

export function createOpeningSubmissionReceipt(renderer, plan, options = {}) {
  const info = renderer && renderer.info || {};
  const memory = info.memory || {};
  const resourceIdentitySets = plan && plan.resourceIdentitySets
    ? plan.resourceIdentitySets
    : collectResourceIdentitySets(
      plan && plan.compileSubjects || [],
      plan && plan.route || {},
      plan && plan.textureRefs || [],
    );
  const baseline = {
    programs: Array.isArray(info.programs) ? info.programs.length : Number(info.programs) || 0,
    geometries: Number(memory.geometries) || 0,
    textures: Number(memory.textures) || 0,
  };
  const plannedProgramKeys = plan && plan.firstPlayablePipelineSet
    && Array.isArray(plan.firstPlayablePipelineSet.admittedProgramKeys)
    ? plan.firstPlayablePipelineSet.admittedProgramKeys.map((entry) => String(entry.key || '')).filter(Boolean)
    : [];
  const before = {
    programCacheKeys: rendererProgramKeys(renderer),
    geometryBufferIds: [...resourceIdentitySets.geometryBufferIds],
    blockingTextureIds: [...resourceIdentitySets.blockingTextureIds],
    shadowResourceIds: [...resourceIdentitySets.shadowResourceIds],
  };
  const programBindings = requiredProgramBindings(renderer, plan, options);
  const required = {
    // Keep `before` as the broad cache census for strict no-new-program detection. Required keys
    // must instead be bound to the exact opening leaves (and active post materials): unrelated
    // warmup programs legitimately retire before first paint and cannot block the route.
    programCacheKeys: programBindings.keys,
    programBindingFailures: programBindings.failures,
    geometryBufferIds: [...resourceIdentitySets.geometryBufferIds],
    blockingTextureIds: [...resourceIdentitySets.blockingTextureIds],
    shadowResourceIds: plan && Array.isArray(plan.shadowResources)
      ? plan.shadowResources.map((resource) => String(resource.id || '')).filter(Boolean).sort()
      : [...resourceIdentitySets.shadowResourceIds],
  };
  required.shadowResources = [...required.shadowResourceIds];
  const receipt = {
    schema: OPENING_SUBMISSION_PLAN_SCHEMA,
    planSchema: plan && plan.schema || null,
    planComplete: !!(plan && plan.complete === true),
    baseline,
    // Compatibility names remain for diagnostics, but validation consumes the exact identity sets
    // below.  A program/geometry/texture count is not a resource identity.
    baselineProgramKeys: before.programCacheKeys,
    expectedProgramKeys: before.programCacheKeys,
    plannedProgramKeys,
    before,
    required,
    plan,
    admitted: {
      drawLeaves: Number(plan && plan.drawLeaves && plan.drawLeaves.length) || 0,
      geometryBuffers: Number(plan && plan.geometryBuffers && plan.geometryBuffers.length) || 0,
      textures: Number(plan && plan.textures && plan.textures.length) || 0,
    },
  };
  const liveReferences = new Set([
    plan,
    ...(Array.isArray(plan && plan.compileSubjects) ? plan.compileSubjects : []),
    ...(Array.isArray(plan && plan.textureRefs) ? plan.textureRefs : []),
    plan && plan.scene,
    plan && plan.camera,
  ].filter(Boolean));
  return freeze(receipt, new Set(), liveReferences);
}

function unionSet(...values) {
  const result = new Set();
  for (const value of values) for (const item of value || []) result.add(String(item));
  return result;
}

function difference(actual, allowed) {
  return [...actual].filter((item) => !allowed.has(item)).sort();
}

function currentPlanResourceIdentitySets(plan) {
  const leaves = new Set(Array.isArray(plan && plan.compileSubjects) ? plan.compileSubjects : []);
  if (plan && plan.scene) {
    const sceneLeaves = collectOpeningSubmissionLeaves(plan.scene, {
      camera: plan.camera,
    });
    for (const leaf of sceneLeaves) leaves.add(leaf);
  }
  const explicitTextures = [
    plan && plan.scene && plan.scene.background,
    plan && plan.scene && plan.scene.environment,
  ].filter((texture) => texture && texture.isTexture === true);
  return collectResourceIdentitySets([...leaves], plan && plan.route || {}, explicitTextures);
}

export function validateOpeningSubmissionReceipt(receipt, renderer) {
  const info = renderer && renderer.info || {};
  const memory = info.memory || {};
  const currentCounts = {
    programs: Array.isArray(info.programs) ? info.programs.length : Number(info.programs) || 0,
    geometries: Number(memory.geometries) || 0,
    textures: Number(memory.textures) || 0,
  };
  const baseline = receipt && receipt.baseline || { programs: 0, geometries: 0, textures: 0 };
  const before = receipt && receipt.before || {};
  const required = receipt && receipt.required || {};
  const currentResources = currentPlanResourceIdentitySets(receipt && receipt.plan);
  const currentProgramKeys = rendererProgramKeys(renderer);
  const allowedProgramKeys = unionSet(before.programCacheKeys, required.programCacheKeys);
  const allowedGeometryIds = unionSet(before.geometryBufferIds, required.geometryBufferIds);
  const allowedTextureIds = unionSet(before.blockingTextureIds, required.blockingTextureIds);
  const allowedShadowIds = unionSet(before.shadowResourceIds, required.shadowResourceIds);
  const uncapturedProgramKeys = difference(new Set(currentProgramKeys), allowedProgramKeys);
  const uncapturedGeometryBufferIds = difference(
    new Set(currentResources.geometryBufferIds), allowedGeometryIds,
  );
  const uncapturedTextureIds = difference(
    new Set(currentResources.blockingTextureIds), allowedTextureIds,
  );
  const uncapturedShadowResourceIds = difference(
    new Set(currentResources.shadowResourceIds), allowedShadowIds,
  );
  const missingProgramKeys = difference(new Set(required.programCacheKeys), new Set(currentProgramKeys));
  const missingGeometryBufferIds = difference(
    new Set(required.geometryBufferIds), new Set(currentResources.geometryBufferIds),
  );
  const missingTextureIds = difference(
    new Set(required.blockingTextureIds), new Set(currentResources.blockingTextureIds),
  );
  const missingShadowResourceIds = difference(
    new Set(required.shadowResourceIds), new Set(currentResources.shadowResourceIds),
  );
  const uncaptured = [];
  if (uncapturedProgramKeys.length || missingProgramKeys.length) uncaptured.push('programs');
  if (uncapturedGeometryBufferIds.length || missingGeometryBufferIds.length) uncaptured.push('geometries');
  if (uncapturedTextureIds.length || missingTextureIds.length) uncaptured.push('textures');
  if (uncapturedShadowResourceIds.length || missingShadowResourceIds.length) uncaptured.push('shadows');
  const delta = {
    programs: currentCounts.programs - Number(baseline.programs || 0),
    geometries: currentCounts.geometries - Number(baseline.geometries || 0),
    textures: currentCounts.textures - Number(baseline.textures || 0),
  };
  const planComplete = !!(receipt && receipt.planComplete === true
    && receipt.plan && receipt.plan.firstPlayablePipelineSet
    && receipt.plan.firstPlayablePipelineSet.complete === true);
  const exactReceipt = [
    before.programCacheKeys,
    before.geometryBufferIds,
    before.blockingTextureIds,
    before.shadowResourceIds,
    required.programCacheKeys,
    required.geometryBufferIds,
    required.blockingTextureIds,
    required.shadowResourceIds,
    required.programBindingFailures,
  ].every((value) => Array.isArray(value));
  const missingProgramBindings = required.programBindingFailures || [];
  return freeze({
    ok: !!(planComplete && exactReceipt && receipt.planSchema === OPENING_SUBMISSION_PLAN_SCHEMA
      && missingProgramBindings.length === 0 && uncaptured.length === 0),
    baseline,
    current: currentCounts,
    currentResources,
    delta,
    uncaptured,
    uncapturedProgramKeys,
    uncapturedGeometryBufferIds,
    uncapturedTextureIds,
    uncapturedShadowResourceIds,
    missingProgramKeys,
    missingGeometryBufferIds,
    missingTextureIds,
    missingShadowResourceIds,
    missingProgramBindings,
    reason: !planComplete
      ? 'incomplete-opening-submission-plan'
      : !exactReceipt
        ? 'incomplete-opening-submission-receipt'
        : missingProgramBindings.length
          ? 'unprepared-opening-program-binding'
        : uncaptured.length ? 'uncaptured-first-draw-resource' : null,
  });
}
