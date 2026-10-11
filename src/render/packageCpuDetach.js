// Decoded render packages hold every texture level twice: the GPU copy uploaded by the residency
// admission pass, and the CPU mirror (CompressedTexture.mipmaps / Texture.source.data) that three
// only reads while uploading. Once a texture carries an upload stamp the mirror is pure resident
// memory kept solely for a context-restore re-upload — hundreds of MB across the package fleet.
//
// This module offloads that mirror class: textures are marked at package load with a manifest
// ordinal, the residency pass drops the CPU payload right after stamping it resident, and a
// context restore rehydrates the exact bytes by re-reading the content-hash-immutable render.glb
// (a force-cache disk hit) and re-decoding it before the restore's re-upload pass runs.
//
// Only identity-stable, deterministic reload paths are eligible: the package bytes are SHA-256
// verified at every read, so a re-decode reproduces the same traversal and the same resource
// order, letting each detached texture be paired with its fresh counterpart by ordinal. Anything
// the reload cannot reproduce (version bumps, mutations) stays marked-but-never-detached, and a
// detached texture is treated as already resident by the residency pass so an empty upload can
// never reach the GPU.
//
// userData marks store only {contentHash, ordinal} — plain JSON. Texture.copy() JSON-clones
// userData, so a structured manifest reference on userData would throw on its own cycle, and a
// clone carrying a copied mark is rejected by the entry.texture identity check.

import { BufferAttribute } from 'three';
import {
  noteSharedImageSourceRefilled,
  sharedImageSourceEntry,
  sharedImageSourceUserCount,
} from './imageSourceDedupe.js';

const manifests = new Map();

// Whether a manifest still has any released payload — DERIVED, not ledgered: the F3 shared
// release lands in imageSourceDedupe without a back-edge into this module, so membership must
// be read off the entries' own released state each time (a Set of "detached manifests" would
// silently miss every shared-source release).
function sharedTextureReleased(entry) {
  const shared = entry.sharedEntry;
  if (!shared) return false;
  if (shared.sourceReleased === true) return true;
  return !!(shared.releasedUsers && shared.releasedUsers.has(entry.texture));
}

function textureEntryReleased(entry) {
  return entry.detached === true || sharedTextureReleased(entry);
}

function manifestHasDetachedEntries(manifest) {
  return manifest.entries.some(textureEntryReleased)
    || manifest.geometryEntries.some((entry) => entry.detached);
}

function detachedManifestList() {
  const out = [];
  for (const manifest of manifests.values()) {
    if (manifestHasDetachedEntries(manifest)) out.push(manifest);
  }
  return out;
}

function isTextureLike(value) {
  return !!value && typeof value === 'object' && value.isTexture === true;
}

function isGeometryLike(value) {
  return !!value && typeof value === 'object' && value.isBufferGeometry === true;
}

// Geometry detach eligibility (SPEC F2 §3.2): package meshes are rigid by construction
// (assertRigidPlanNode rejects Bone/SkinnedMesh/InstancedMesh/LOD), so morph-bearing and
// pre-uploaded GLBufferAttribute geometry are the only releases to refuse defensively.
// Procedural alternate-tier geometries (spacefaceQualityTierGeometries) and dynamicBufferRanges
// pools never reach a package manifest — collectImmutableResources only walks package loads.
function geometryDetachEligible(geometry) {
  if (!isGeometryLike(geometry)) return false;
  const morph = geometry.morphAttributes;
  if (morph && Object.keys(morph).length > 0) return false;
  const attrs = geometry.attributes || {};
  for (const name of Object.keys(attrs)) {
    const attribute = attrs[name];
    if (attribute && attribute.isGLBufferAttribute === true) return false;
  }
  return true;
}

// Stride-copy an interleaved position attribute into a standalone BufferAttribute — position is
// the one attribute CPU consumers still need (raycast keeps position+index), so it leaves the
// shared interleaved buffer before that buffer's array can be released (SPEC F2 §3.3.1).
function deinterleavePositionAttribute(geometry) {
  const position = geometry.getAttribute && geometry.getAttribute('position');
  if (!position || position.isInterleavedBufferAttribute !== true) return;
  const interleaved = position.data;
  const source = interleaved.array;
  const itemSize = position.itemSize;
  const standalone = new source.constructor(position.count * itemSize);
  const stride = interleaved.stride;
  const offset = position.offset;
  for (let i = 0, n = position.count; i < n; i++) {
    const base = i * stride + offset;
    for (let j = 0; j < itemSize; j++) standalone[i * itemSize + j] = source[base + j];
  }
  geometry.setAttribute('position', new BufferAttribute(standalone, itemSize, position.normalized));
}

// Rehydrate pairing fingerprint (SPEC F2 §3.5): attr name set + position/index counts +
// per-attr itemSize/normalized — identical bytes re-decode deterministically, so any drift
// means the package changed under its content hash and the entry stays detached.
function geometryFingerprint(geometry) {
  const attrs = geometry.attributes || {};
  const names = Object.keys(attrs).sort();
  const itemSizes = {};
  const normalized = {};
  for (const name of names) {
    const attribute = attrs[name];
    itemSizes[name] = attribute ? attribute.itemSize : 0;
    normalized[name] = !!(attribute && attribute.normalized);
  }
  const position = attrs.position;
  return {
    attrNames: names,
    positionCount: Number(position && position.count) || 0,
    indexCount: Number(geometry.index && geometry.index.count) || 0,
    itemSizes,
    normalized,
  };
}

function sameGeometryFingerprint(a, b) {
  if (!a || !b) return false;
  if (a.positionCount !== b.positionCount || a.indexCount !== b.indexCount) return false;
  if (a.attrNames.length !== b.attrNames.length) return false;
  for (let i = 0; i < a.attrNames.length; i++) {
    const name = a.attrNames[i];
    if (b.attrNames[i] !== name) return false;
    if (a.itemSizes[name] !== b.itemSizes[name]) return false;
    if (a.normalized[name] !== b.normalized[name]) return false;
  }
  return true;
}

function payloadBytes(value) {
  if (!value || typeof value !== 'object') return 0;
  if (Number.isFinite(value.byteLength)) return value.byteLength;
  const inner = value.data;
  if (inner && Number.isFinite(inner.byteLength)) return inner.byteLength;
  if (Number.isFinite(value.width) && Number.isFinite(value.height)) {
    // ImageBitmap and friends expose dimensions only; RGBA8 is the common decode target and is
    // used purely for freed-byte diagnostics.
    return value.width * value.height * 4;
  }
  return 0;
}

/**
 * Build the detach manifest for a freshly loaded render package. Called once per package by the
 * loader after its resources are registered; idempotent per content hash.
 *
 * @param {object} loaded      LoadedRenderPackage-shaped value (resources, contentHash, assetId).
 * @param {object} options
 * @param {function} options.redecode          () => Promise<decoded> — re-fetch + re-parse of the
 *                                             package's immutable render.glb.
 * @param {function} options.collectResources  (template) => Iterable<resource> — the SAME
 *                                             collection the loader used to build
 *                                             loaded.resources, so a re-decode reproduces the
 *                                             identical resource order for ordinal pairing.
 */
export function createPackageDetachManifest(loaded, options = {}) {
  if (!loaded || !Array.isArray(loaded.resources)) return null;
  if (typeof options.redecode !== 'function' || typeof options.collectResources !== 'function') {
    return null;
  }
  const contentHash = String(loaded.contentHash || '');
  if (!contentHash) return null;
  const existing = manifests.get(contentHash);
  if (existing) return existing;

  const textures = loaded.resources.filter(isTextureLike);
  const geometries = loaded.resources.filter(isGeometryLike);
  const manifest = {
    assetId: String(loaded.assetId || ''),
    contentHash,
    renderUrl: String(loaded.renderUrl || ''),
    evicted: false,
    rehydrating: null,
    detachedSources: new Set(),
    // Parser clones share one Source AND the same mipmap Uint8Arrays (copy() slices the array,
    // not the buffers) — dedupe payloads by identity so freed-byte diagnostics stay honest.
    // WeakSet, not Set: it exists only to dedupe the freed-byte diagnostic — a strong
    // Set retains every "freed" payload object (mip Uint8Arrays, ImageBitmap wrappers)
    // against the manifests Map for the whole detached lifetime, making the reclaim
    // phantom until rehydrate (W139-N1).
    freedPayloads: new WeakSet(),
    geometryEntries: geometries.filter(geometryDetachEligible).map((geometry, ordinal) => {
      const entry = {
        geometry,
        ordinal,
        detached: false,
        freedBytes: 0,
        // {name, record} — record is the version-bearing object three's WebGLAttributes keys on:
        // the shared InterleavedBuffer for interleaved attrs, the BufferAttribute otherwise.
        released: [],
        detachedVersions: new Map(),
        uploadedOn: new WeakMap(), // renderer -> true: this context holds live post-detach buffers
        recordsDied: false,
        fingerprint: null,
      };
      // vendored onGeometryDispose drops the renderer's attribute records; the next draw then
      // re-uploads, which the gate must see even if no version moved.
      geometry.addEventListener('dispose', () => { entry.recordsDied = true; });
      return entry;
    }),
    entries: textures.map((texture, ordinal) => {
      const image = texture.image;
      return {
        texture,
        ordinal,
        detached: false,
        freedBytes: 0,
        name: texture.name || '',
        compressed: texture.isCompressedTexture === true,
        format: texture.format ?? null,
        width: Number(image && image.width) || 0,
        height: Number(image && image.height) || 0,
        hadMipmaps: Array.isArray(texture.mipmaps) && texture.mipmaps.length > 0,
        // CompressedTexture stashes {width,height} in source.data via the image setter — that
        // dims object IS the image and must survive; only uncompressed payloads are released.
        hadSourceData: texture.isCompressedTexture !== true && !!(texture.source && texture.source.data),
        // F3: the dedupe entry this texture adopted through (canonical Source + releasedUsers),
        // when it has one — the shared release flips THERE, not on this entry.
        sharedEntry: sharedImageSourceEntry(texture),
      };
    }),
    // WeakSet for the same reason as freedPayloads (W139-N1): a strong Set would retain every
    // "released" interleaved buffer against the manifests Map — phantom reclaim until rehydrate.
    freedBuffers: new WeakSet(),
    totals: {
      detachedTextures: 0,
      detachedBytes: 0,
      detachedGeometries: 0,
      detachedGeometryBytes: 0,
      restores: 0,
      restoredTextures: 0,
      restoredBytes: 0,
      restoredGeometries: 0,
      mismatches: 0,
    },
    redecode: options.redecode,
    collectResources: options.collectResources,
  };
  manifests.set(contentHash, manifest);

  const mark = { schema: 'spaceface.cpuDetach.v1', contentHash };
  manifest.entries.forEach((entry, ordinal) => {
    entry.texture.userData = {
      ...(entry.texture.userData || {}),
      spacefaceCpuDetach: { ...mark, ordinal },
    };
  });
  manifest.geometryEntries.forEach((entry, ordinal) => {
    const geometry = entry.geometry;
    // Pull position out of the shared interleaved buffer and cache bounds BEFORE any upload:
    // the first upload then builds the position VBO from the standalone array, and every later
    // bounds query (asteroidInstancePool culls, raycast early-outs) hits the cached fields once
    // the sibling buffers' arrays are released.
    deinterleavePositionAttribute(geometry);
    try { geometry.computeBoundingSphere(); } catch (_) {}
    try { geometry.computeBoundingBox(); } catch (_) {}
    entry.fingerprint = geometryFingerprint(geometry);
    geometry.userData = {
      ...(geometry.userData || {}),
      spacefaceCpuDetach: { ...mark, kind: 'geometry', ordinal },
    };
  });
  return manifest;
}

/**
 * F4: manifest for a source-GLB's authored textures — same store/schema as package manifests,
 * keyed by the source BYTES digest (`sha256:…` via imageSourceKeyAsync) instead of a render
 * package's content-hash URL. `textures` is the authored blueprint's texture set in
 * deterministic traversal order; `options.redecode` must re-fetch + re-parse the same source
 * (with digest verification inside) and `options.collectResources` re-collects the texture
 * list in that same order so ordinal pairing stays honest.
 */
export function createSourceDetachManifest(url, textures, options = {}) {
  if (typeof options.redecode !== 'function' || typeof options.collectResources !== 'function') {
    return null;
  }
  const contentHash = String(options.contentHash || '');
  if (!contentHash) return null;
  const existing = manifests.get(contentHash);
  if (existing) return existing;
  const manifest = createPackageDetachManifest({
    contentHash,
    assetId: options.assetId || url,
    renderUrl: url,
    resources: (textures || []).filter(isTextureLike),
  }, { redecode: options.redecode, collectResources: options.collectResources });
  if (manifest) {
    manifest.sourceBytesSha256 = contentHash;
    // N3: a manifest whose subtree is already an authoredReadableFallbackLayer detaches at mark
    // — the layer is the live stand-in and never passes through a residency seal.
    if (options.detachOnMark === true) {
      for (const entry of manifest.entries) detachPackageTexture(entry.texture);
    }
  }
  return manifest;
}

/** True when this texture's CPU payload was released after a proven GPU upload. */
export function isPackageTextureDetached(texture) {
  const mark = texture && texture.userData && texture.userData.spacefaceCpuDetach;
  if (!mark) return false;
  const manifest = manifests.get(mark.contentHash);
  const entry = manifest && manifest.entries[mark.ordinal];
  return !!entry && entry.texture === texture && textureEntryReleased(entry);
}

/**
 * Release a marked texture's CPU payload. Call only after the texture is provably GPU-resident
 * (the residency pass calls this right after stamping its upload). No-op for unmarked textures,
 * clones (the mark travels but the entry identity check rejects), and already-detached entries.
 */
export function detachPackageTexture(texture) {
  const mark = texture && texture.userData && texture.userData.spacefaceCpuDetach;
  if (!mark) return false;
  const manifest = manifests.get(mark.contentHash);
  if (!manifest || manifest.evicted) return false;
  const entry = manifest.entries[mark.ordinal];
  if (!entry || entry.texture !== texture || entry.detached) return false;

  // A dedupe-shared texture's payload records are physically held by every live user of its
  // registry entry: Texture.clone() slices the mipmap ARRAY but shares the mip records, and a
  // source-adopted user shares source.data outright. Emptying this texture's array while
  // siblings live frees no bytes — it only arms a crash: any later fresh-upload on this texture
  // (a different upload-cache-key bind on the shared Source, or a dispose/rebind whose cache
  // entry was freed) reads mipmaps[0] on the empty array and throws inside three's uploader.
  // Defer the release until this texture is the entry's last live user — which is also the
  // earliest point the bytes could actually leave.
  if (sharedImageSourceUserCount(texture) > 1) {
    // F3: keep the dedupe-entry link fresh — adoption can land after mark time.
    if (!entry.sharedEntry) entry.sharedEntry = sharedImageSourceEntry(texture);
    return false;
  }

  let freed = 0;
  let released = false;
  if (Array.isArray(texture.mipmaps) && texture.mipmaps.length > 0) {
    released = true;
    for (const mip of texture.mipmaps) {
      const payload = mip && (mip.data ?? mip);
      if (payload && !manifest.freedPayloads.has(payload)) {
        manifest.freedPayloads.add(payload);
        freed += payloadBytes(payload);
      }
    }
    texture.mipmaps = [];
  }
  const source = texture.source;
  if (source && source.data && entry.compressed !== true) {
    released = true;
    if (!manifest.detachedSources.has(source)) {
      // Several parser-cloned textures share one Source; free its payload exactly once.
      manifest.detachedSources.add(source);
      const payload = source.data;
      if (payload && !manifest.freedPayloads.has(payload)) {
        manifest.freedPayloads.add(payload);
        freed += payloadBytes(payload);
      }
      try { if (typeof payload.close === 'function') payload.close(); } catch (_) {}
      source.data = null;
    }
  }
  if (!released) {
    // Nothing to release (e.g. an unloaded stub texture) — leave the entry attached so it still
    // participates in ordinary upload accounting and needs no restore handling.
    return false;
  }
  entry.detached = true;
  entry.freedBytes = freed;
  manifest.totals.detachedTextures += 1;
  manifest.totals.detachedBytes += freed;
  return true;
}

/** True when this geometry's CPU mirror was released after a proven GPU upload. */
export function isPackageGeometryDetached(geometry) {
  const mark = geometry && geometry.userData && geometry.userData.spacefaceCpuDetach;
  if (!mark || mark.kind !== 'geometry') return false;
  const manifest = manifests.get(mark.contentHash);
  const entry = manifest && manifest.geometryEntries[mark.ordinal];
  return !!entry && entry.geometry === geometry && entry.detached === true;
}

function geometryManifestEntry(geometry) {
  const mark = geometry && geometry.userData && geometry.userData.spacefaceCpuDetach;
  if (!mark || mark.kind !== 'geometry') return null;
  const manifest = manifests.get(mark.contentHash);
  if (!manifest || manifest.evicted) return null;
  const entry = manifest.geometryEntries[mark.ordinal];
  return (entry && entry.geometry === geometry) ? { manifest, entry } : null;
}

/**
 * Ledger API: record that `renderer` holds live attribute records for this marked geometry
 * (its uploads landed before detach, or it compiled/drew post-rehydrate). Secondary contexts
 * never run the residency pass, so their upload proof is noted at their own compile/upload
 * sweep (SPEC F2 §3.3.2).
 */
export function noteGeometryGpuResident(geometry, renderer) {
  const found = geometryManifestEntry(geometry);
  if (!found || !renderer) return false;
  found.entry.uploadedOn.set(renderer, true);
  return true;
}

/**
 * Release a marked geometry's non-kept CPU arrays (every attribute except the deinterleaved
 * `position` and `geometry.index`). Call only after the geometry is provably GPU-resident —
 * the residency pass invokes it right after stamping `spacefaceGpuResident`, and stamped-skip
 * paths retry it for geometries sealed by earlier passes.
 *
 * Released records get `new (ctor)(0)` — an empty same-constructor array, never null
 * (openingSubmissionPlan's `array || data.array` fingerprint reads truthiness; an un-gated
 * upload then hits three's resize-throw, which is the detector, matching the texture doctrine).
 */
export function detachPackageGeometry(geometry, renderer) {
  const found = geometryManifestEntry(geometry);
  if (!found) return false;
  const { manifest, entry } = found;
  if (entry.detached) return false;
  if (renderer) entry.uploadedOn.set(renderer, true);

  let freed = 0;
  const attrs = geometry.attributes || {};
  for (const name of Object.keys(attrs)) {
    if (name === 'position') continue; // keep-set: standalone CPU copy stays live
    const attribute = attrs[name];
    if (!attribute || attribute.isGLBufferAttribute === true) continue;
    const record = attribute.isInterleavedBufferAttribute === true ? attribute.data : attribute;
    if (!record) continue;
    entry.detachedVersions.set(record, record.version);
    entry.released.push({ name, record });
    const array = record.array;
    if (array && array.byteLength > 0 && !manifest.freedBuffers.has(record)) {
      // Sibling interleaved attrs share one InterleavedBuffer — release its array once.
      manifest.freedBuffers.add(record);
      freed += array.byteLength;
      record.array = new array.constructor(0);
    }
  }
  if (entry.released.length === 0) {
    // Nothing releasable (e.g. position-only geometry) — leave the entry attached so it
    // stays out of gate/rehydrate handling entirely.
    return false;
  }
  entry.detached = true;
  entry.freedBytes = freed;
  manifest.totals.detachedGeometries += 1;
  manifest.totals.detachedGeometryBytes += freed;
  return true;
}

/**
 * Whether a draw/upload of this detached geometry on `renderer` would re-upload the emptied
 * arrays — the geometry twin of detachedTextureUploadPending (SPEC F2 §3.4). Geometry attribute
 * records live in a renderer-private WeakMap unreachable from `renderer`, so a ledger answers
 * "would this context re-upload": recordsDied (dispose dropped them), a version moved on a
 * released record (needsUpdate re-entered the uploader), or this renderer never uploaded
 * post-detach state at all.
 */
export function detachedGeometryUploadPending(geometry, renderer) {
  const found = geometryManifestEntry(geometry);
  if (!found || !found.entry.detached) return false;
  const entry = found.entry;
  if (entry.recordsDied) return true;
  for (const [record, version] of entry.detachedVersions) {
    if (record.version !== version) return true;
  }
  return entry.uploadedOn.get(renderer) !== true;
}

/** Drop the manifest for an evicted/disposed package; its resources are gone with the entry. */
export function dropPackageDetachManifest(contentHash) {
  const manifest = manifests.get(String(contentHash || ''));
  if (!manifest) return false;
  manifest.evicted = true;
  manifests.delete(manifest.contentHash);
  return true;
}

function decodedTemplate(decoded) {
  return (decoded && decoded.scene) || decoded;
}

function textureFingerprint(resource) {
  if (!isTextureLike(resource)) return null;
  const image = resource.image;
  return {
    compressed: resource.isCompressedTexture === true,
    format: resource.format ?? null,
    name: resource.name || '',
    width: Number(image && image.width) || 0,
    height: Number(image && image.height) || 0,
  };
}

/**
 * Mirrors three's setTexture2D upload gate (r184): whether this texture's next bind re-enters
 * uploadTexture — its version moved (needsUpdate) or its properties record was recreated after
 * a dispose freed it. On a detached texture that answer is the admission-touch throw: the
 * uploader reads mipmaps[0]/image on the emptied payload. `properties` is the renderer's own
 * `renderer.properties` map. A detached texture whose upload stamp still holds binds its live
 * GPU copy and stays released, so callers pay the re-decode only for textures a draw would
 * actually re-upload.
 */
export function detachedTextureUploadPending(texture, properties) {
  if (!isPackageTextureDetached(texture)) return false;
  if (texture.isRenderTargetTexture === true || texture.isExternalTexture === true) return false;
  if (!(texture.version > 0)) return false;
  const props = properties && typeof properties.get === 'function'
    ? properties.get(texture)
    : null;
  return !props || props.__version !== texture.version;
}

async function rehydrateManifest(manifest) {
  const decoded = await manifest.redecode();
  const template = decodedTemplate(decoded);
  if (!template) throw new Error(`Render package ${manifest.assetId} rehydrate returned no scene.`);
  const freshResources = [...manifest.collectResources(template)];
  const freshTextures = freshResources.filter(isTextureLike);
  const freshGeometries = freshResources.filter(isGeometryLike).filter(geometryDetachEligible);
  let restored = 0;
  let restoredBytes = 0;
  let restoredGeometries = 0;
  for (const entry of manifest.geometryEntries) {
    if (!entry.detached) continue;
    const donor = freshGeometries[entry.ordinal];
    // Ordinal-paired donor must carry the identical attribute shape — a drift means the package
    // changed under its content hash; keep the entry detached and count it (texture doctrine).
    if (!donor || !sameGeometryFingerprint(entry.fingerprint, geometryFingerprint(donor))) {
      manifest.totals.mismatches += 1;
      continue;
    }
    for (const { name, record } of entry.released) {
      const donorAttr = donor.getAttribute(name);
      const donorRecord = donorAttr
        && (donorAttr.isInterleavedBufferAttribute === true ? donorAttr.data : donorAttr);
      if (!donorRecord || !donorRecord.array) continue;
      record.array = donorRecord.array;
    }
    // Version bumps force WebGLAttributes.update on the next bind so live records re-upload the
    // refilled bytes; records that died re-create on the same real arrays either way.
    for (const record of entry.detachedVersions.keys()) {
      record.version += 1;
      entry.detachedVersions.set(record, record.version);
    }
    entry.recordsDied = false;
    entry.detached = false;
    restoredGeometries += 1;
    restoredBytes += entry.freedBytes;
    entry.freedBytes = 0;
  }
  for (const entry of manifest.entries) {
    if (!textureEntryReleased(entry)) continue;
    const fresh = freshTextures[entry.ordinal];
    const fp = textureFingerprint(fresh);
    if (!fp || fp.compressed !== entry.compressed || fp.format !== entry.format
        || fp.name !== entry.name
        || (entry.width > 0 && fp.width > 0 && fp.width !== entry.width)
        || (entry.height > 0 && fp.height > 0 && fp.height !== entry.height)) {
      // Identical bytes decode deterministically, so a mismatch means the package changed under
      // the content hash — leave the entry detached and count it rather than corrupt the texture.
      manifest.totals.mismatches += 1;
      continue;
    }
    const texture = entry.texture;
    if (entry.hadMipmaps || entry.compressed) texture.mipmaps = fresh.mipmaps;
    if (entry.sharedEntry && entry.sharedEntry.releasedUsers) {
      entry.sharedEntry.releasedUsers.delete(texture);
    }
    if (entry.hadSourceData && texture.source) {
      texture.source.data = fresh.source ? fresh.source.data : null;
    }
    // Refilling the canonical shared Source serves every adopted user across manifests — clear
    // the entry's released flag so siblings' released-state re-derives without a second decode.
    if (entry.sharedEntry) noteSharedImageSourceRefilled(entry.sharedEntry);
    // A version bump invalidates the residency stamp, so the restore re-upload pass — or any
    // later admission — re-uploads the real bytes instead of relying on the stamp alone.
    texture.needsUpdate = true;
    entry.detached = false;
    restored += 1;
    restoredBytes += entry.freedBytes;
    entry.freedBytes = 0;
  }
  manifest.detachedSources.clear();
  manifest.freedPayloads = new WeakSet(); // WeakSet has no clear() — re-mint
  manifest.freedBuffers = new WeakSet();
  manifest.totals.restores += 1;
  manifest.totals.restoredTextures += restored;
  manifest.totals.restoredBytes += restoredBytes;
  manifest.totals.restoredGeometries += restoredGeometries;
  if (!manifest.entries.some((entry) => entry.detached)
      && !manifest.geometryEntries.some((entry) => entry.detached)) {
    // (detached membership is derived now — nothing to delete.)
  }
  // Donor textures may have been adopted as dedupe users during this decode — release the
  // registration so a never-uploaded donor can't wedge the entry's all-resident check.
  for (const fresh of freshTextures) {
    try { if (typeof fresh.dispose === 'function') fresh.dispose(); } catch (_) {}
  }
  return { textures: restored, geometries: restoredGeometries, bytes: restoredBytes };
}

function rehydrateManifestOnce(manifest) {
  // One in-flight decode per package: concurrent callers (the serial restore runway and a
  // targeted texture-level rehydrate) share the same promise instead of double-decoding the
  // immutable render.glb.
  if (!manifest.rehydrating) {
    manifest.rehydrating = rehydrateManifest(manifest).finally(() => {
      manifest.rehydrating = null;
    });
  }
  return manifest.rehydrating;
}

/**
 * Re-attach the CPU payloads of exactly the manifests covering `textures` — the narrow form of
 * rehydrateDetachedPackages for a caller holding the texture list a pass is about to bind (the
 * exact-target admission touch). The GPU copies these textures proved still live; this only
 * refills the emptied mipmaps/source.data so a bind that re-enters the uploader (moved version,
 * a different upload-cache key on the shared dedupe Source, or a properties record recreated
 * after dispose) reads real bytes instead of mipmaps[0] on an empty array. Untouched manifests
 * stay released, and the next residency stamp re-detaches whatever this restored.
 */
export async function rehydrateDetachedTextures(textures, options = {}) {
  const yieldToMain = typeof options.yieldToMain === 'function' ? options.yieldToMain : null;
  const wanted = new Set();
  for (const texture of textures || []) {
    if (!isPackageTextureDetached(texture)) continue;
    const mark = texture.userData && texture.userData.spacefaceCpuDetach;
    const manifest = mark && manifests.get(mark.contentHash);
    if (manifest && !manifest.evicted) wanted.add(manifest);
  }
  const result = {
    skipped: wanted.size === 0,
    packages: 0,
    textures: 0,
    geometries: 0,
    bytes: 0,
    errors: [],
  };
  for (const manifest of wanted) {
    try {
      const receipt = await rehydrateManifestOnce(manifest);
      result.packages += 1;
      result.textures += receipt.textures;
      result.geometries += receipt.geometries;
      result.bytes += receipt.bytes;
    } catch (error) {
      result.errors.push({ assetId: manifest.assetId, error: String(error && error.message || error) });
    }
    if (yieldToMain) await yieldToMain();
  }
  return result;
}

/**
 * Geometry twin of rehydrateDetachedTextures: refill the released attribute arrays of exactly
 * the manifests covering `geometries`. One manifest decode restores both its textures and its
 * geometries, so a caller holding both pending lists pays a single re-decode per package.
 */
export async function rehydrateDetachedGeometries(geometries, options = {}) {
  const yieldToMain = typeof options.yieldToMain === 'function' ? options.yieldToMain : null;
  const wanted = new Set();
  for (const geometry of geometries || []) {
    if (!isPackageGeometryDetached(geometry)) continue;
    const mark = geometry.userData && geometry.userData.spacefaceCpuDetach;
    const manifest = mark && manifests.get(mark.contentHash);
    if (manifest && !manifest.evicted) wanted.add(manifest);
  }
  const result = {
    skipped: wanted.size === 0,
    packages: 0,
    textures: 0,
    geometries: 0,
    bytes: 0,
    errors: [],
  };
  for (const manifest of wanted) {
    try {
      const receipt = await rehydrateManifestOnce(manifest);
      result.packages += 1;
      result.textures += receipt.textures;
      result.geometries += receipt.geometries;
      result.bytes += receipt.bytes;
    } catch (error) {
      result.errors.push({ assetId: manifest.assetId, error: String(error && error.message || error) });
    }
    if (yieldToMain) await yieldToMain();
  }
  return result;
}

/**
 * Re-populate every detached package texture's CPU payload by re-decoding its immutable package,
 * one package at a time (the serial restore runway — a burst of parallel decodes is exactly the
 * double-decode storm this exists to avoid). Runs before the context-restore re-upload pass so
 * textures upload real bytes again.
 */
export async function rehydrateDetachedPackages(options = {}) {
  const yieldToMain = typeof options.yieldToMain === 'function' ? options.yieldToMain : null;
  const detached = detachedManifestList();
  const result = {
    skipped: detached.length === 0,
    packages: 0,
    textures: 0,
    geometries: 0,
    bytes: 0,
    errors: [],
  };
  if (detached.length === 0) return result;
  for (const manifest of detached) {
    if (manifest.evicted) continue;
    try {
      const receipt = await rehydrateManifestOnce(manifest);
      result.packages += 1;
      result.textures += receipt.textures;
      result.geometries += receipt.geometries;
      result.bytes += receipt.bytes;
    } catch (error) {
      result.errors.push({ assetId: manifest.assetId, error: String(error && error.message || error) });
    }
    if (yieldToMain) await yieldToMain();
  }
  return result;
}

/** Aggregate counters for residency/perf diagnostics. */
export function packageDetachDiagnostics() {
  const totals = {
    manifests: manifests.size,
    packagesWithDetachedTextures: detachedManifestList().length,
    detachedTextures: 0,
    detachedBytes: 0,
    detachedGeometries: 0,
    detachedGeometryBytes: 0,
    restores: 0,
    restoredTextures: 0,
    restoredBytes: 0,
    restoredGeometries: 0,
    mismatches: 0,
  };
  for (const manifest of manifests.values()) {
    totals.detachedTextures += manifest.totals.detachedTextures;
    totals.detachedBytes += manifest.totals.detachedBytes;
    totals.detachedGeometries += manifest.totals.detachedGeometries;
    totals.detachedGeometryBytes += manifest.totals.detachedGeometryBytes;
    totals.restores += manifest.totals.restores;
    totals.restoredTextures += manifest.totals.restoredTextures;
    totals.restoredBytes += manifest.totals.restoredBytes;
    totals.restoredGeometries += manifest.totals.restoredGeometries;
    totals.mismatches += manifest.totals.mismatches;
  }
  return totals;
}

/** Test/reset seam: drops every manifest (used by node --test isolation). */
export function resetPackageDetachManifestsForTests() {
  manifests.clear();
}
