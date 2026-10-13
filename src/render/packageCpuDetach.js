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

import { BufferAttribute, Box3, Sphere, Vector3 } from 'three';
import {
  bumpPackageDetachSerial,
  noteSharedImageSourceRefilled,
  restoreSharedCompressedMips,
  retainTextureUploadLease,
  sharedImageSourceEntry,
  sharedImageSourceUserCount,
  textureUploadLeased,
} from './imageSourceDedupe.js';

// The detach serial lives in the leaf module so imageSourceDedupe's own shared-source releases
// bump the same counter a restore consult watches — one serial covers the whole covered-release
// class (manifest detaches here, shared-source/per-user releases there). Re-exported so consult
// sites keep a single import site on this module (W143-H1).
export { packageDetachSerialNow } from './imageSourceDedupe.js';

const manifests = new Map();
const GEOMETRY_CPU_KEEP_ATTRIBUTES = new Set(['position', 'sfHullPosition']);
// Material slots a presented draw binds. An emptied compressed map in one of these is the
// texStorage `mipmaps[0].width` throw; scanning uniforms would walk every sky shader per draw.
const PRESENTED_DETACH_TEXTURE_KEYS = Object.freeze([
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'lightMap', 'bumpMap', 'displacementMap', 'alphaMap',
]);
// Phone rotation (and any other drawing-buffer aspect flip) is the window where WebKit
// re-enters three's uploader for package resources whose CPU mirror was already released.
// While the hold is set, a presented draw of those resources is skipped and one rehydrate
// refills them before the next upload. Steady-state draws do not take the hold.
let orientationHolds = new WeakSet();
let presentedDetachRehydrate = null;

// Whether a manifest still has any released payload — DERIVED, not ledgered: the F3 shared
// release lands in imageSourceDedupe without a back-edge into this module, so membership must
// be read off the entries' own released state each time (a Set of "detached manifests" would
// silently miss every shared-source release).
function sharedTextureReleased(entry) {
  // Adoption can land after the manifest cached its link. A release that only
  // flipped the live dedupe entry would otherwise stay invisible to the gate,
  // and the next upload would read the emptied chain.
  let shared = entry.sharedEntry;
  if (!shared && entry.texture) {
    shared = sharedImageSourceEntry(entry.texture);
    if (shared) entry.sharedEntry = shared;
  }
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

// Stride-copy kept coordinates into standalone attributes before their shared interleaved
// buffer is retired. Raycast keeps position+index; CPU composition also keeps hull shading layout.
function deinterleaveKeptAttribute(geometry, name) {
  const position = geometry.getAttribute && geometry.getAttribute(name);
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
  const attribute = new BufferAttribute(standalone, itemSize, position.normalized);
  // The illustrated hull can alias POSITION before this pass. Move every alias with it so
  // retirement of the remaining interleaved records cannot erase the shader's kept coordinates.
  for (const [key, value] of Object.entries(geometry.attributes)) {
    if (value === position) geometry.setAttribute(key, attribute);
  }
}

// Rehydrate pairing fingerprint (SPEC F2 §3.5): attr name set + position/index counts +
// per-attr itemSize/normalized — identical bytes re-decode deterministically, so any drift
// means the package changed under its content hash and the entry stays detached.
function geometryFingerprint(geometry) {
  const attrs = geometry.attributes || {};
  // sfHullPosition is runtime shading layout, not part of the verified decoder's source shape.
  // It stays in the CPU keep-set and must not make its raw donor appear incompatible.
  const names = Object.keys(attrs).filter(name => name !== 'sfHullPosition').sort();
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
        cpuReaders: 0,
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
    for (const name of GEOMETRY_CPU_KEEP_ATTRIBUTES) deinterleaveKeptAttribute(geometry, name);
    if (!computePlainFloat32Bounds(geometry)) {
      try { geometry.computeBoundingSphere(); } catch (_) {}
      try { geometry.computeBoundingBox(); } catch (_) {}
    }
    entry.fingerprint = geometryFingerprint(geometry);
    geometry.userData = {
      ...(geometry.userData || {}),
      spacefaceCpuDetach: { ...mark, kind: 'geometry', ordinal },
    };
  });
  return manifest;
}

/**
 * Bounds straight off a de-interleaved Float32 position array. Identical results to three's
 * computeBoundingBox/computeBoundingSphere (same min/max, sphere centered on the box, radius =
 * max vertex distance) without a getX/getY/getZ call per vertex. Those generic accessors were
 * ~350 ms of main-thread JS across the swarm arena's package admissions (two full passes for
 * the sphere plus one for the box). Returns false — caller falls back to three — for anything
 * outside the plain case (morph targets, interleaved/normalized/non-Float32, itemSize ≠ 3).
 * One deliberate difference: an empty position array yields an empty box with a (0,0,0)/0
 * sphere instead of three's NaN-centered sphere, so downstream cull/raycast math stays finite.
 */
export function computePlainFloat32Bounds(geometry) {
  const position = geometry && geometry.attributes && geometry.attributes.position;
  if (!position || position.isInterleavedBufferAttribute || position.normalized
    || position.itemSize !== 3 || !(position.array instanceof Float32Array)) return false;
  if (geometry.morphAttributes && geometry.morphAttributes.position
    && geometry.morphAttributes.position.length) return false;
  const a = position.array;
  const n = position.count * 3;
  if (n > a.length) return false;
  if (!geometry.boundingBox) geometry.boundingBox = new Box3();
  if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere();
  const box = geometry.boundingBox;
  if (n === 0) {
    box.makeEmpty();
    geometry.boundingSphere.set(new Vector3(), 0);
    return true;
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
  const center = geometry.boundingSphere.center;
  box.getCenter(center);
  const cx = center.x, cy = center.y, cz = center.z;
  let maxRadiusSq = 0;
  for (let i = 0; i < n; i += 3) {
    const dx = a[i] - cx, dy = a[i + 1] - cy, dz = a[i + 2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > maxRadiusSq) maxRadiusSq = d;
  }
  geometry.boundingSphere.radius = Math.sqrt(maxRadiusSq);
  return true;
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
  if (existing) {
    // A second compile of the same source bytes shares the first manifest: its entries cover
    // the FIRST tree's texture objects only (the fresh tree's textures stay unmarked either
    // way — their eager detach is the partsLibrary sweep's business). Honor detachOnMark
    // against the manifest's own entries so the flag means the same thing on both paths.
    // R7 pin (W142): detachOnMark detaches eagerly with NO textureGpuResident proof —
    // the flag is dormant today; if a caller ever marks an un-uploaded tree, add the
    // same residency gate the partsLibrary sweep uses before enabling it there.
    if (options.detachOnMark === true) {
      for (const entry of existing.entries) detachPackageTexture(entry.texture);
    }
    return existing;
  }
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
 * Whether a live manifest entry covers THIS texture object — i.e. the detach/pending gates
 * can see its releases. A clone carrying a COPIED mark (Texture.copy JSON-clones userData)
 * fails the manifest identity check and stays gate-blind, exactly like a texture that was
 * never marked: its payload must never be released by the shared-source path (W140-D2).
 */
export function packageTextureDetachCovers(texture) {
  const mark = texture && texture.userData && texture.userData.spacefaceCpuDetach;
  if (!mark) return false;
  const manifest = manifests.get(mark.contentHash);
  const entry = manifest && manifest.entries[mark.ordinal];
  return !!entry && entry.texture === texture;
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
  // The admission touch is mid-bind. Emptying the chain now is the
  // release-after-refill upload (three reads mipmaps[0].width).
  if (textureUploadLeased(texture)) return false;

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
  bumpPackageDetachSerial();
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

// A stepped CPU composition may yield after reading a GPU-resident source. Keep the exact
// source records alive until its final clone is made; callers refill retired bytes through
// rehydrateDetachedGeometries while this lease prevents another upload from retiring them.
export function retainPackageGeometryCpu(geometries) {
  const entries = new Set();
  for (const geometry of geometries || []) {
    const found = geometryManifestEntry(geometry);
    if (found) entries.add(found.entry);
  }
  for (const entry of entries) entry.cpuReaders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const entry of entries) entry.cpuReaders -= 1;
  };
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

// Drawables armed to ledger their own draws — a WeakSet so re-arming the same object is
// idempotent (admission passes re-collect the same subjects many times).
const residentLedgerArmedObjects = new WeakSet();

/**
 * Arm a drawable to ledger its geometry's GPU residency when a REAL draw creates the
 * renderer's attribute records. WebGLRenderer.compile() links programs only — it creates no
 * attribute records — so a compile-time ledger marks this renderer resident before a single
 * buffer exists (W140-D1). The chained onAfterRender hook fires inside three's renderObject
 * after renderBufferDirect: this object's own upload literally just completed, and the
 * geometry argument is exactly what was drawn (tier-swapped alternates covered for free).
 * A draw landing on an already-detached (emptied) geometry uploaded empty VBOs — that is not
 * a residency proof, so the note is skipped and the pending gate stays armed for the next
 * consult instead of pinning a blind resident stamp.
 */
export function armGeometryGpuResidentLedger(object) {
  if (!object || residentLedgerArmedObjects.has(object)) return false;
  residentLedgerArmedObjects.add(object);
  const previous = object.onAfterRender;
  object.onAfterRender = function (drawingRenderer, drawingScene, camera, geometry, material, group) {
    if (geometry && !isPackageGeometryDetached(geometry)) {
      noteGeometryGpuResident(geometry, drawingRenderer);
    }
    if (typeof previous === 'function') {
      previous.call(this, drawingRenderer, drawingScene, camera, geometry, material, group);
    }
  };
  return true;
}

/**
 * Drop every `uploadedOn` stamp `renderer` holds — the attribute records they described died
 * with its GL context, so post-restore the stamps would falsely satisfy the pending gate
 * (W140-G4). The consult re-stamps truthfully on the next real draw (or the armed ledger).
 */
export function dropGeometryGpuResidencyLedger(renderer) {
  if (!renderer) return 0;
  let dropped = 0;
  for (const manifest of manifests.values()) {
    for (const entry of manifest.geometryEntries) {
      if (entry.uploadedOn.delete(renderer)) dropped += 1;
    }
  }
  return dropped;
}

/**
 * Release a marked geometry's non-kept CPU arrays (keep position, hull shading coordinates,
 * and index by record identity). Call only after the geometry is provably GPU-resident —
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
  if (entry.detached || entry.cpuReaders > 0) return false;
  if (renderer) entry.uploadedOn.set(renderer, true);

  let freed = 0;
  const attrs = geometry.attributes || {};
  const keptRecords = new Set([geometry.index, ...[...GEOMETRY_CPU_KEEP_ATTRIBUTES].map(name => {
    const attribute = attrs[name];
    return attribute?.isInterleavedBufferAttribute === true ? attribute.data : attribute;
  })]);
  for (const name of Object.keys(attrs)) {
    if (GEOMETRY_CPU_KEEP_ATTRIBUTES.has(name)) continue;
    const attribute = attrs[name];
    if (!attribute || attribute.isGLBufferAttribute === true) continue;
    const record = attribute.isInterleavedBufferAttribute === true ? attribute.data : attribute;
    if (!record || keptRecords.has(record)) continue;
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
  bumpPackageDetachSerial();
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

function presentedMaterialList(material) {
  if (!material) return null;
  if (Array.isArray(material)) return material;
  return material.isMaterial === true || material.isTexture === true ? [material] : [material];
}

/**
 * Whether this presented draw would upload a released package payload.
 * Geometry: three's attribute update creates a zero-length buffer when its GPU record is gone
 * or the released attribute's version moved, and the following drawElements then fails with
 * "Vertex buffer is not big enough". Texture: three's compressed texStorage reads mipmaps[0]
 * on the emptied chain (`Ye[0].width` once minified). Both are silent while the live GPU copy
 * still matches; the orientation hold covers the resize window where that copy is no longer
 * safe to trust and the version stamp has not moved yet.
 */
export function detachedPresentedDrawBlocked(renderer, geometry, material) {
  const hold = !!(renderer && orientationHolds.has(renderer));
  const geometryMark = geometry && geometry.userData && geometry.userData.spacefaceCpuDetach;
  if (geometryMark && (
    detachedGeometryUploadPending(geometry, renderer)
    || (hold && isPackageGeometryDetached(geometry))
  )) return true;
  const materials = presentedMaterialList(material);
  if (!materials) return false;
  const properties = renderer && renderer.properties;
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    if (!mat) continue;
    for (let k = 0; k < PRESENTED_DETACH_TEXTURE_KEYS.length; k++) {
      const texture = mat[PRESENTED_DETACH_TEXTURE_KEYS[k]];
      if (!texture || texture.isTexture !== true) continue;
      if (detachedTextureUploadPending(texture, properties)) return true;
      if (hold && isPackageTextureDetached(texture)) return true;
    }
  }
  return false;
}

/**
 * One in-flight refill for every detached package. The draw guard and the orientation hold
 * share it so a rotation cannot decode the fleet twice. The hold drops only after the refill
 * finishes: clearing it earlier lets the next frame upload the still-empty mirror.
 */
export function queuePresentedDetachRehydrate(renderer) {
  if (presentedDetachRehydrate) return presentedDetachRehydrate;
  const held = renderer || null;
  let flight = null;
  flight = Promise.resolve()
    .then(() => rehydrateDetachedPackages())
    .finally(() => {
      if (presentedDetachRehydrate === flight) presentedDetachRehydrate = null;
      if (held) orientationHolds.delete(held);
    });
  presentedDetachRehydrate = flight;
  return flight;
}

/** Test seam: the refill promised by the latest presented-draw block, or null. */
export function presentedDetachRehydrateInFlight() {
  return presentedDetachRehydrate;
}

/**
 * Mark this renderer so the next presented draws of CPU-detached package resources wait
 * for a refill. Used when the drawing buffer flips aspect (phone rotation): that is the
 * window that re-entered upload without a context-loss event.
 */
export function noteOrientationDetachedHold(renderer) {
  if (!renderer) return false;
  orientationHolds.add(renderer);
  queuePresentedDetachRehydrate(renderer);
  return true;
}

/** True while a drawing-buffer aspect flip is waiting on one package refill. */
export function orientationDetachedHoldActive(renderer) {
  return !!(renderer && orientationHolds.has(renderer));
}

/**
 * Hide this drawable for the aspect-flip hold so three's projectObject cannot
 * upload a released CPU mirror. A renderBufferDirect skip is too late: the
 * attribute update runs first and creates a zero-length buffer. Uploads that
 * are pending outside the hold stay visible — hiding those until the upload
 * lands never reaches the draw that clears the pending bit.
 */
function compressedMipsMissing(texture) {
  if (!texture || texture.isCompressedTexture !== true || texture.isCompressedArrayTexture === true) {
    return false;
  }
  const mips = texture.mipmaps;
  return !(Array.isArray(mips) && mips.length > 0 && mips[0] && Number(mips[0].width) > 0);
}

/**
 * Put a sibling's compressed chain back on every presented slot that lost its own.
 * Returns true when at least one slot was refilled.
 */
/**
 * A Texture.clone() copies the detach mark and an already-emptied mip chain.
 * The clone fails the manifest identity check, so the pending-upload gate never
 * rehydrates it. When the live entry still holds levels, hand that chain over.
 */
function adoptManifestCompressedMips(texture) {
  if (!compressedMipsMissing(texture)) return false;
  const mark = texture.userData && texture.userData.spacefaceCpuDetach;
  if (!mark) return false;
  const manifest = manifests.get(mark.contentHash);
  if (!manifest || manifest.evicted) return false;
  const entry = manifest.entries[mark.ordinal];
  const donor = entry && entry.texture;
  if (!donor || donor === texture || compressedMipsMissing(donor)) return false;
  texture.mipmaps = donor.mipmaps.slice();
  return true;
}

export function restorePresentedCompressedMips(material) {
  const materials = presentedMaterialList(material);
  if (!materials) return false;
  let restored = false;
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    if (!mat) continue;
    for (let k = 0; k < PRESENTED_DETACH_TEXTURE_KEYS.length; k++) {
      const texture = mat[PRESENTED_DETACH_TEXTURE_KEYS[k]];
      if (!texture || texture.isTexture !== true) continue;
      if (restoreSharedCompressedMips(texture) || adoptManifestCompressedMips(texture)) restored = true;
    }
  }
  return restored;
}

/**
 * Refill compressed textures an exact-target draw would upload with an empty
 * chain. Covers the manifest texture (rehydrate) and a clone whose copied mark
 * is not that entry (rehydrate, then copy the restored chain).
 */
export async function refillPresentedCompressedUploads(textures) {
  const needsManifest = [];
  for (const texture of textures || []) {
    if (!texture || texture.isCompressedTexture !== true) continue;
    if (!(texture.version > 0) || !compressedMipsMissing(texture)) continue;
    if (restoreSharedCompressedMips(texture) || adoptManifestCompressedMips(texture)) continue;
    if (texture.userData && texture.userData.spacefaceCpuDetach) needsManifest.push(texture);
  }
  const wanted = new Set();
  for (const texture of needsManifest) {
    const mark = texture.userData.spacefaceCpuDetach;
    const manifest = mark && manifests.get(mark.contentHash);
    if (manifest && !manifest.evicted) wanted.add(manifest);
  }
  for (const manifest of wanted) await rehydrateManifestOnce(manifest);
  for (const texture of needsManifest) adoptManifestCompressedMips(texture);
}

/** Hold CPU chains for every texture this draw is about to bind. */
export function retainPresentedTextureLeases(textures) {
  const release = [];
  const seen = new Set();
  for (const texture of textures || []) {
    if (!texture || texture.isTexture !== true || seen.has(texture)) continue;
    seen.add(texture);
    release.push(retainTextureUploadLease(texture));
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const fn of release) fn();
  };
}

/**
 * True when the next bind of a presented compressed map would enter three's
 * uploader and read mipmaps[0] on an empty chain. A stamp-matched GPU copy is
 * left alone: the CPU mirror is supposed to be empty after a proven upload.
 */
export function presentedCompressedUploadUnsafe(renderer, material) {
  const materials = presentedMaterialList(material);
  if (!materials) return false;
  const properties = renderer && renderer.properties;
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    if (!mat) continue;
    for (let k = 0; k < PRESENTED_DETACH_TEXTURE_KEYS.length; k++) {
      const texture = mat[PRESENTED_DETACH_TEXTURE_KEYS[k]];
      if (!compressedMipsMissing(texture)) continue;
      if (!(texture.version > 0)) continue;
      const props = properties && typeof properties.get === 'function'
        ? properties.get(texture)
        : null;
      // Same gate as three's setTexture2D: a matching stamp does not upload.
      if (props && props.__version === texture.version) continue;
      return true;
    }
  }
  return false;
}

export function orientationHoldHidesDrawable(renderer, object) {
  if (!orientationDetachedHoldActive(renderer) || !object) return false;
  if (isPackageGeometryDetached(object.geometry)) return true;
  const materials = presentedMaterialList(object.material);
  if (!materials) return false;
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    if (!mat) continue;
    for (let k = 0; k < PRESENTED_DETACH_TEXTURE_KEYS.length; k++) {
      const texture = mat[PRESENTED_DETACH_TEXTURE_KEYS[k]];
      if (texture && texture.isTexture === true && isPackageTextureDetached(texture)) return true;
    }
  }
  return false;
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
    // The old stamp describes pre-refill attribute versions. A stamped-skip admission must
    // not retire these new bytes before their first upload, nor certify an older GL context.
    entry.geometry.userData.spacefaceGpuResident = false;
    entry.uploadedOn = new WeakMap();
    entry.recordsDied = false;
    // The refill consumed the released-name/record pairs: a later re-detach re-collects them
    // fresh — clearing here keeps the list from accreting duplicates across cycles (W140-D3).
    entry.released.length = 0;
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
  orientationHolds = new WeakSet();
  presentedDetachRehydrate = null;
}
