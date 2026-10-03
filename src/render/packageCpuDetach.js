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

import { sharedImageSourceUserCount } from './imageSourceDedupe.js';

const manifests = new Map();
const detachedManifests = new Set();

function isTextureLike(value) {
  return !!value && typeof value === 'object' && value.isTexture === true;
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
  const manifest = {
    assetId: String(loaded.assetId || ''),
    contentHash,
    renderUrl: String(loaded.renderUrl || ''),
    evicted: false,
    rehydrating: null,
    detachedSources: new Set(),
    // Parser clones share one Source AND the same mipmap Uint8Arrays (copy() slices the array,
    // not the buffers) — dedupe payloads by identity so freed-byte diagnostics stay honest.
    freedPayloads: new Set(),
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
      };
    }),
    totals: {
      detachedTextures: 0,
      detachedBytes: 0,
      restores: 0,
      restoredTextures: 0,
      restoredBytes: 0,
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
  return manifest;
}

/** True when this texture's CPU payload was released after a proven GPU upload. */
export function isPackageTextureDetached(texture) {
  const mark = texture && texture.userData && texture.userData.spacefaceCpuDetach;
  if (!mark) return false;
  const manifest = manifests.get(mark.contentHash);
  const entry = manifest && manifest.entries[mark.ordinal];
  return !!entry && entry.texture === texture && entry.detached === true;
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
  if (sharedImageSourceUserCount(texture) > 1) return false;

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
  detachedManifests.add(manifest);
  return true;
}

/** Drop the manifest for an evicted/disposed package; its resources are gone with the entry. */
export function dropPackageDetachManifest(contentHash) {
  const manifest = manifests.get(String(contentHash || ''));
  if (!manifest) return false;
  manifest.evicted = true;
  manifests.delete(manifest.contentHash);
  detachedManifests.delete(manifest);
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
  const freshTextures = [...manifest.collectResources(template)].filter(isTextureLike);
  let restored = 0;
  let restoredBytes = 0;
  for (const entry of manifest.entries) {
    if (!entry.detached) continue;
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
    if (entry.hadSourceData && texture.source) {
      texture.source.data = fresh.source ? fresh.source.data : null;
    }
    // A version bump invalidates the residency stamp, so the restore re-upload pass — or any
    // later admission — re-uploads the real bytes instead of relying on the stamp alone.
    texture.needsUpdate = true;
    entry.detached = false;
    restored += 1;
    restoredBytes += entry.freedBytes;
    entry.freedBytes = 0;
  }
  manifest.detachedSources.clear();
  manifest.freedPayloads.clear();
  manifest.totals.restores += 1;
  manifest.totals.restoredTextures += restored;
  manifest.totals.restoredBytes += restoredBytes;
  if (!manifest.entries.some((entry) => entry.detached)) {
    detachedManifests.delete(manifest);
  }
  return { textures: restored, bytes: restoredBytes };
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
    bytes: 0,
    errors: [],
  };
  for (const manifest of wanted) {
    try {
      const receipt = await rehydrateManifestOnce(manifest);
      result.packages += 1;
      result.textures += receipt.textures;
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
  const result = {
    skipped: detachedManifests.size === 0,
    packages: 0,
    textures: 0,
    bytes: 0,
    errors: [],
  };
  if (detachedManifests.size === 0) return result;
  for (const manifest of [...detachedManifests]) {
    if (manifest.evicted) {
      detachedManifests.delete(manifest);
      continue;
    }
    try {
      const receipt = await rehydrateManifestOnce(manifest);
      result.packages += 1;
      result.textures += receipt.textures;
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
    packagesWithDetachedTextures: detachedManifests.size,
    detachedTextures: 0,
    detachedBytes: 0,
    restores: 0,
    restoredTextures: 0,
    restoredBytes: 0,
    mismatches: 0,
  };
  for (const manifest of manifests.values()) {
    totals.detachedTextures += manifest.totals.detachedTextures;
    totals.detachedBytes += manifest.totals.detachedBytes;
    totals.restores += manifest.totals.restores;
    totals.restoredTextures += manifest.totals.restoredTextures;
    totals.restoredBytes += manifest.totals.restoredBytes;
    totals.mismatches += manifest.totals.mismatches;
  }
  return totals;
}

/** Test/reset seam: drops every manifest (used by node --test isolation). */
export function resetPackageDetachManifestsForTests() {
  manifests.clear();
  detachedManifests.clear();
}
