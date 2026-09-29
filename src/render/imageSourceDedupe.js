// Cross-document image-source dedupe for the live GLB decode paths.
//
// Many Forge GLBs embed byte-identical copies of the shared finish/detail atlases — across the
// release catalog the embedded image population collapses to a fraction of its per-file count.
// Without dedupe each GLB transcodes, stores, and uploads its own copy of the same pixels.
//
// Content key: SHA-256 (via crypto.subtle, off the main-thread hot path) over the embedded image
// bufferView bytes, plus the byte length and declared mimeType — different bytes, a different
// length, or a different container type can never share an entry. FNV-1a is the fallback for
// contexts without crypto.subtle. Digests are memoised by (ArrayBuffer, offset, length, mime) so
// repeated parses of one cached GLB body hash each image once, and the pending digest promise is
// shared so concurrent parses of the same bytes never race the native call twice.
//
// On a hit the caller skips decode entirely and returns a clone of the cached texture.
// Texture.clone keeps `.source` (and the compressed mipmaps), so three's per-Source GPU cache
// uploads the pixels once while every GLB still applies its own colorSpace/sampler/flipY to its
// clone.
//
// Lifetime is user-tracked: every texture handed out — the decoded owner and each clone — is a
// registered user of the entry. Wrapping texture.dispose() releases the user, and the entry is
// dropped only when its last user disposes, so disposing one GLB's texture can never break another
// GLB still drawing from the same source.

const SHARED_SOURCE_KEY = 'spacefaceSharedImageSourceKey';
const SHARED_SOURCE_TRACKED = 'spacefaceSharedImageSourceTracked';

// packageCpuDetach releases a resident package texture's CPU payload (CompressedTexture.mipmaps,
// Texture.source.data) right after the residency pass proves the GPU upload. A texture whose
// payload is gone still LOOKS complete — dims survive on the compressed image stub — but
// Texture.clone() copies the emptied mipmaps, three's upload reads mipmaps[0].width, and any
// uploader that touches the clone (preview initTexture, a residency re-upload, the frame's own
// texture bind) throws instead of drawing. It also covers the shared-Source case: detaching one
// package's texture nulls source.data for every texture that adopted the same Source object.
function texturePayloadIntact(texture) {
  if (!texture || !texture.isTexture) return false;
  if (texture.isCompressedTexture) {
    return Array.isArray(texture.mipmaps) && texture.mipmaps.length > 0;
  }
  return !!(texture.source && texture.source.data);
}

export { texturePayloadIntact };

const entries = new Map(); // key -> { owner: Texture, users: Set<Texture> }
let hits = 0;
let misses = 0;
let hashedBytesTotal = 0;
let hashMsTotal = 0;
let digestCalls = 0;
let digestMemoHits = 0;
// ArrayBuffer -> `${byteOffset}:${byteLength}:${mimeType}` -> Promise<key>. WeakMap so a cached
// GLB body that gets re-parsed reuses its image digests; entries die with the buffer.
let keyMemoByBuffer = new WeakMap();

const clock = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now() : Date.now());

function fnv1a64Hex(bytes) {
  // Two 32-bit FNV-1a lanes over alternating bytes form the 64-bit content hash.
  let lo = 0x811c9dc5;
  let hi = 0x811c9dc5;
  const length = bytes ? bytes.byteLength : 0;
  for (let i = 0; i < length; i += 2) {
    lo = Math.imul((lo ^ bytes[i]) >>> 0, 0x01000193) >>> 0;
    if (i + 1 < length) hi = Math.imul((hi ^ bytes[i + 1]) >>> 0, 0x01000193) >>> 0;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

function asByteView(bytes) {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

const EMPTY_BYTES = new Uint8Array(0);

async function contentDigestHex(view) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const digest = await subtle.digest('SHA-256', view || EMPTY_BYTES);
    const out = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < out.length; i++) hex += out[i].toString(16).padStart(2, '0');
    return `sha256:${hex}`;
  }
  return `fnv1a:${fnv1a64Hex(view)}`;
}

/** Synchronous FNV-1a key — kept for callers that cannot await (and as the no-subtle fallback). */
export function imageSourceKey(bytes, byteLength, mimeType) {
  const length = Number.isInteger(byteLength) ? byteLength : (bytes ? bytes.byteLength : 0);
  return `fnv1a:${fnv1a64Hex(bytes)}:${length}:${String(mimeType || '')}`;
}

/**
 * Async content key: native SHA-256 via crypto.subtle where available (the digest runs on the
 * platform's own path, not a JS byte loop), FNV-1a otherwise. Memoised by the bytes' underlying
 * buffer so re-parsing a cached GLB never rehashes an image, and an in-flight digest promise is
 * shared between concurrent parses of the same range.
 */
export function imageSourceKeyAsync(bytes, byteLength, mimeType) {
  const view = asByteView(bytes);
  const length = Number.isInteger(byteLength) ? byteLength : (view ? view.byteLength : 0);
  const mime = String(mimeType || '');
  const buffer = view && view.buffer;
  const memoKey = `${view ? view.byteOffset : 0}:${length}:${mime}`;
  let memo = buffer ? keyMemoByBuffer.get(buffer) : null;
  if (!memo && buffer) {
    memo = new Map();
    keyMemoByBuffer.set(buffer, memo);
  }
  const cached = memo && memo.get(memoKey);
  if (cached) {
    digestMemoHits++;
    return cached;
  }
  const start = clock();
  const promise = contentDigestHex(view)
    .then((hex) => `${hex}:${length}:${mime}`)
    .then((key) => {
      hashMsTotal += clock() - start;
      hashedBytesTotal += length;
      digestCalls++;
      return key;
    });
  if (memo) memo.set(memoKey, promise);
  return promise;
}

function releaseUser(entry, texture) {
  if (!entry.users.delete(texture)) return;
  if (entry.users.size === 0) {
    for (const [key, candidate] of entries) {
      if (candidate === entry) { entries.delete(key); break; }
    }
  }
}

function adoptUser(entry, key, texture) {
  entry.users.add(texture);
  texture.userData = texture.userData || {};
  texture.userData[SHARED_SOURCE_KEY] = key;
  if (texture[SHARED_SOURCE_TRACKED] === true) return texture;
  Object.defineProperty(texture, SHARED_SOURCE_TRACKED, {
    configurable: true, enumerable: false, writable: true, value: true,
  });
  const originalDispose = typeof texture.dispose === 'function'
    ? texture.dispose.bind(texture)
    : null;
  texture.dispose = function disposeSharedImageTexture() {
    releaseUser(entry, texture);
    if (originalDispose) return originalDispose();
    return undefined;
  };
  return texture;
}

/**
 * Register a freshly decoded texture as the content owner for `key`. When an entry already
 * exists the decode was redundant — callers should prefer `sharedImageTextureFor` first — but a
 * race between two parsers can still deliver one, in which case the redundant texture is adopted
 * as an ordinary user and a tracked clone is returned.
 */
export function claimSharedImageTexture(key, texture) {
  if (!key || !texture) return texture;
  let entry = entries.get(key);
  if (!entry) {
    misses++;
    entry = { owner: texture, users: new Set() };
    entries.set(key, entry);
    return adoptUser(entry, key, texture);
  }
  hits++;
  // Two parsers can decode identical bytes concurrently: the first claim owns the entry, the
  // second's decode is redundant. Adopt a clone of the OWNER — sharing the first decode's
  // THREE.Source is the whole point — and retire the duplicate so it can never upload a second
  // copy of the same pixels.
  if (!texturePayloadIntact(entry.owner)) {
    // The owner's CPU payload was released by the package-detach residency pass (or its shared
    // Source was): cloning it now would mint an uploadable-looking texture with empty mips that
    // crashes the first uploader. Keep this decode — it has real bytes — instead of retiring it.
    return adoptUser(entry, key, texture);
  }
  const clone = entry.owner.clone();
  try { texture.dispose(); } catch { /* a never-rendered decode has no GPU entry to remove */ }
  return adoptUser(entry, key, clone);
}

/**
 * Post-parse adoption for textures the official loader already decoded: point `texture` at the
 * entry's canonical THREE.Source instead of its own duplicate image. Source is the only
 * GPU-identity key (three caches uploads per Source), so the swap dedupes the upload while every
 * document keeps its own Texture — its own colorSpace, wrap, filter, flipY — untouched. The
 * orphaned per-parse source was never rendered, so it uploads nothing.
 */
export function adoptTextureImageSource(key, texture) {
  if (!key || !texture || !texture.isTexture) return texture;
  let entry = entries.get(key);
  if (!entry) {
    misses++;
    entry = { owner: texture, users: new Set() };
    entries.set(key, entry);
    return adoptUser(entry, key, texture);
  }
  hits++;
  if (!entry.source) entry.source = entry.owner.source;
  // Adopting a detached source hands the texture a null payload; keep the freshly decoded source
  // this document already holds. Once rehydrate refills the owner the swap is safe again.
  if (texture.source !== entry.source && texturePayloadIntact(entry.owner)) texture.source = entry.source;
  return adoptUser(entry, key, texture);
}

const MATERIAL_TEXTURE_KEYS = [
  'map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'alphaMap', 'specularMap', 'specularColorMap', 'specularIntensityMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'anisotropyMap', 'displacementMap', 'lightMap', 'envMap', 'matcap', 'gradientMap',
];

/**
 * Dedupe pass for a document the official GLTFLoader just parsed: for every material texture that
 * traces through `parser.associations` to an embedded GLB image, hash that image's bufferView
 * bytes and adopt the canonical source for the content key. Compressed textures are skipped —
 * the embedded-KTX2 plugin already dedupes them at decode time (clone keeps the mipmap chain,
 * which a bare source swap would lose). Returns the number of textures registered.
 */
export async function dedupeGltfTextureSources(gltf) {
  const parser = gltf && gltf.parser;
  const json = parser && parser.json;
  const associations = parser && parser.associations;
  if (!json || !(associations instanceof Map)) return 0;
  const binary = parser.extensions && parser.extensions.KHR_binary_glTF;
  const body = binary && binary.body;
  const images = json.images;
  const textures = json.textures;
  const bufferViews = json.bufferViews;
  const buffers = json.buffers;
  if (!Array.isArray(images) || !Array.isArray(textures)) return 0;
  // Only GLB-embedded bytes are content-keyed; an external URI buffer means the bufferView
  // offsets are not relative to `body`.
  const singleEmbeddedBuffer = Array.isArray(buffers)
    && buffers.length === 1 && buffers[0] && buffers[0].uri === undefined;
  const keyByImageIndex = new Map();
  const imageKeyFor = (index) => {
    if (keyByImageIndex.has(index)) return keyByImageIndex.get(index);
    let promise = Promise.resolve(null);
    const image = images[index];
    if (singleEmbeddedBuffer && body && image && Number.isInteger(image.bufferView)) {
      const view = Array.isArray(bufferViews) && bufferViews[image.bufferView];
      if (view && (view.buffer === undefined || view.buffer === 0)
        && view.byteOffset !== undefined && Number.isFinite(view.byteLength)) {
        const bytes = new Uint8Array(body, view.byteOffset, view.byteLength);
        promise = imageSourceKeyAsync(bytes, view.byteLength, image.mimeType || '');
      }
    }
    keyByImageIndex.set(index, promise);
    return promise;
  };
  const seenTextures = new Set();
  const pending = [];
  const collect = (texture) => {
    if (!texture || !texture.isTexture || seenTextures.has(texture)) return;
    seenTextures.add(texture);
    if (texture.isCompressedTexture) return;
    const association = associations.get(texture);
    const textureIndex = association && association.textures;
    const textureDef = Number.isInteger(textureIndex) ? textures[textureIndex] : null;
    if (!textureDef) return;
    const sourceIndex = Number.isInteger(textureDef.source) ? textureDef.source
      : textureDef.extensions && textureDef.extensions.KHR_texture_basisu
        ? textureDef.extensions.KHR_texture_basisu.source
        : null;
    if (!Number.isInteger(sourceIndex)) return;
    pending.push({ texture, sourceIndex });
  };
  const visitMaterial = (material) => {
    if (!material) return;
    for (const slot of MATERIAL_TEXTURE_KEYS) collect(material[slot]);
  };
  const sceneList = gltf.scenes && gltf.scenes.length ? gltf.scenes : (gltf.scene ? [gltf.scene] : []);
  for (const scene of sceneList) {
    if (!scene || typeof scene.traverse !== 'function') continue;
    scene.traverse((object) => {
      const material = object.material;
      if (Array.isArray(material)) material.forEach(visitMaterial);
      else visitMaterial(material);
    });
  }
  // All distinct images digest concurrently — the memo keeps one image hashed once even when
  // several texture slots reference it.
  const keys = await Promise.all(pending.map((p) => imageKeyFor(p.sourceIndex)));
  for (let i = 0; i < pending.length; i++) {
    if (keys[i]) adoptTextureImageSource(keys[i], pending[i].texture);
  }
  return seenTextures.size;
}

/** Returns a tracked clone of the cached decode for `key`, or null when no entry exists. */
export function sharedImageTextureFor(key) {
  const entry = key && entries.get(key);
  if (!entry) return null;
  // A detached owner clones to empty mips/source — treat the dead payload as a miss so the
  // caller decodes real bytes instead of handing a crash to the next uploader.
  if (!texturePayloadIntact(entry.owner)) return null;
  hits++;
  const clone = entry.owner.clone();
  return adoptUser(entry, key, clone);
}

/**
 * Parser `sourceCache` hits arrive as `texture.clone()` of an already-tracked texture — the
 * cloned userData carries SHARED_SOURCE_KEY. Re-adopting keeps the refcount honest for documents
 * that reference one image from several texture slots.
 */
export function adoptSharedImageSourceClone(texture) {
  const key = texture && texture.userData && texture.userData[SHARED_SOURCE_KEY];
  const entry = key && entries.get(key);
  if (!entry) return texture;
  return adoptUser(entry, key, texture);
}

export function imageSourceDedupeStats() {
  let users = 0;
  for (const entry of entries.values()) users += entry.users.size;
  return {
    entries: entries.size,
    users,
    hits,
    misses,
    sharedDecodesSaved: hits,
    digests: digestCalls,
    hashedBytes: hashedBytesTotal,
    hashMs: Math.round(hashMsTotal * 10) / 10,
    digestMemoHits,
  };
}

/** Test/bench hook: forget every entry without disposing anything. */
export function resetImageSourceDedupeForTests() {
  entries.clear();
  hits = 0;
  misses = 0;
  hashedBytesTotal = 0;
  hashMsTotal = 0;
  digestCalls = 0;
  digestMemoHits = 0;
  keyMemoByBuffer = new WeakMap();
}
