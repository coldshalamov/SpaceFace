# wave-139 heap-floor-campaign — audit + implementation-ready SPECs

**audit_sha:** `63516afffd9102613580a510531ac109960d4c9b` (tip of `origin/devin/1791504143-perf-w120`; verified `git log -1` on the remote branch. Local checkout is `master@5206d88e` on another lane's worktree — audit performed read-only via `git show`/`git grep` at the pinned tree; no checkout, no edits, no PRs, no app launch.)

**saturated: false** — three queued levers spec'd below plus three new material findings (N1 is a defect that makes the *shipped* texture-detach savings phantom).

---

## 0. Wave-138 queue status at audit SHA

| lever | status at `63516aff` |
|---|---|
| F1 `_decodedSaveEnvelopes` unbounded | **LANDED** — FIFO cap at 8 entries, `src/save/saveSystem.js:5245-5250`. Verified. |
| F5 save-worker session retention | **LANDED** — `capWorkerSessions`/`MAX_WORKER_SESSIONS`, `src/save/saveWorker.js:3-11`, called :403/:428. Verified. |
| F2 geometry CPU-mirror detach | **SPEC below** — material (~234MB reclaimable across package census). |
| F3 shared texture payload release | **SPEC below** — material; blocked today by N2's gate hole and refined by N1. |
| F4 non-package source-GLB texture marks | **SPEC below** — material (wholeship fleet ~5-15MB decoded mirrors/hull); needs source-identity pinning (no content hash on the source path). |

---

## 1. NEW FINDINGS wave-138 missed

### N1 — `manifest.freedPayloads` is a strong `Set`: every "freed" payload stays retained — the texture-detach reclaim is phantom until rehydrate

**MECHANISM_VERIFIED.**

`src/render/packageCpuDetach.js`:
- `:77` manifest init: `freedPayloads: new Set()` — a **strong** Set.
- `:156-160` (mipmap payloads) and `:169-176` (adopted `source.data` payloads): every released payload is `manifest.freedPayloads.add(payload)` — the payload objects (mip `Uint8Array`s, ImageBitmaps) remain reachable from the module-level `manifests` Map for the entire detached lifetime.
- Cleared only at `:270-271` inside `rehydrateManifest` (context-restore path) or wholesale when `dropPackageDetachManifest` evicts the manifest (`:193-200`).

Consequence: between detach and the next context restore, the CPU bytes the machinery counts as freed (`freed += payloadBytes(payload)`, surfaced through `detachedBytes`) are **still resident on the JS heap via the manifest**. For KTX2 mip `Uint8Array`s the retention is total (no `close()` exists for a typed array); for ImageBitmaps the `payload.close()` at `:175` releases the decoded raster but the wrapper object stays.

Retention chain: `manifests` (module Map, packageCpuDetach.js) → `manifest.freedPayloads` (strong Set) → every detached payload object.

Fix (one line of mechanism): `freedPayloads` must be a `WeakSet` — it is only ever used for `.has(payload)` identity dedupe for the freed-byte diagnostic counter; a WeakSet preserves that exactly while letting GC reclaim the payload. `detachedSources` (`:74`) may stay a strong Set — it holds `Source` shells (hundreds of bytes each), and `source.data` is already nulled, so its retention is negligible. The same WeakSet rule must be applied to the F2 geometry detach's released-buffer dedupe, or the defect replicates there.

**Heap impact:** the entire byte volume the shipped texture detach claims to release (`detachedBytes` diagnostic already computes it). The campaign's "textures detached" numbers since this machinery landed are an upper bound on what is still actually retained. This is the single largest in-scope heap-floor item: it converts an already-deployed lever from phantom to real.

### N2 — Secondary (preview/offscreen) renderers upload detached textures with no pending gate — latent crash class, live today

**MECHANISM_VERIFIED.**

Every re-upload site for package resources must consult `detachedTextureUploadPending` (packageCpuDetach.js:227-235) before forcing GPU upload. The admitted sites do (`renderer.js:12030-12051`, `openingGpuAdmission.js:34-61`, residency passes). Secondary renderers do not:

- `src/ui/shipPreviewMount.js:645` — preview material sweep does `v.needsUpdate = true` on textures (bumps `texture.version` → `detachedTextureUploadPending` would return `true` → the texture needs rehydration, but no gate is consulted).
- `src/ui/shipPreviewMount.js:878` — `uploadPreviewTextures` calls `renderer.initTexture(texture)` raw. On a detached texture: `texture.mipmaps === []` → the KTX2 upload path dereferences `mipmaps[0].width` → TypeError (or `source.data === null` → `texture.image` undefined → same). The current ship/dock preview path instantiates package instances (`:762-765`, `renderPackage.createInstance`) and draws them on a *different* WebGL context.
- Same class in `src/ui/orrery/pipSpannerPreview.js:106`, `src/render/graphicsLab.js:465`, `src/ui/asteroid/asteroidRenderer3d.js:1358` — each constructs its own `WebGLRenderer` and draws or uploads package-origin resources; none check the pending gate.
- Even when a preview never calls `initTexture`, drawing package instances through `renderer.render` runs `WebGLObjects.update` on a second context: the attribute records are empty there → `createBuffer` uploads `attribute.array` — which under F2 would be empty (and for textures, `WebGLTextures` re-uploads on an empty properties record → same crash via draw).

Why it hasn't fired yet: `detachPackageTexture` defers while `sharedImageSourceUserCount > 1` (:149-152), and the most-detached package textures are the shared-atlas ones; plus previews set `needsUpdate` *before* residency detach in the common boot order. The hazard is real but window-limited today; F2 makes it structural (geometry attributes have no shared-user deferral at all).

**Heap impact:** correctness finding, not bytes — but it is a *hard gate* on F2/F3 landing safely: the pending gate must become renderer-aware before any secondary context can hit an emptied payload.

### N3 — `authoredReadableFallbackLayer` payloads can never seal → never detachable under the current seal-gated model

**MECHANISM_VERIFIED.**

`src/render/partsLibrary.js:10173-10178` (`markReadableFallbackLayer`) stamps authored fallback LOD trees; `startupGpuResidency.js:179` excludes them from residency collection; `compilePresentSlice.js:145/:222/:302`, `shadowCasterPolicy.js:335`, `shadowDepthAdmission.js:204+` all skip them — they are never drawn, hence never uploaded, hence never `spacefaceGpuResident`-stamped. Under the seal-gated detach model their geometry attribute arrays and texture sources are dead bytes *forever* (each wholeship fallback tree is a full second copy of the hull's geometry+textures — wholeship lod0 ≈ 4.4MB vertex + ~3.3MB compressed image bytes per the GLB census below, and lod1/lod2 trees stack on top).

The correct contract is **detach-on-mark without a seal**: their pending gate covers a hypothetical future upload exactly as a sealed resource's does (`detached*UploadPending` doesn't know or care whether a seal ever ran — it knows whether an upload could read an empty payload). Spec'd inside F4 as a manifest flag `detachOnMark`.

**Heap impact:** per retained fallback tree ≈ one full authored asset decode mirror; session share = number of materialized authored rigs (ship + any fallback-carrying parts).

---

## 2. GLB census at audit SHA (all `assets/ships/release/render-packages/*/render.glb`, n=350)

| quantity | bytes |
|---|---|
| total package file bytes | 332.6MB |
| geometry: POSITION attributes | 83.8MB |
| geometry: all other attributes (normal/uv/tangent/…) | 233.2MB |
| geometry: index buffers | 36.9MB |
| morph-target buffers | **0.0MB — zero morphs across all 350 packages** |
| bufferViews used by geometry: **interleaved** | **317.7MB** |
| bufferViews used by geometry: non-interleaved (index) | 36.9MB |
| embedded image bytes | 101.1MB |

Top packages by geometry bytes: `wreck-cathedral` 12.0MB, `helios-trade-hub` 9.9MB, `candle-fleet` 8.6MB, `skerris-throne` 7.2MB, `resonant-cathedral` 6.7MB, `blackmarket`/`research` 6.2MB, `ceres-refinery` 5.8MB, `jump-ring` 5.6MB, `fab` 5.2MB.

Key structural fact: **package vertex attributes are interleaved** — position shares one `InterleavedBuffer` with normal/uv/tangent (37,397 interleaved attributes vs ~0 plain attribute bufferViews). You cannot keep `position` alive by keeping "its array" — the keep-set must be *deinterleaved* (copied out) before the interleaved buffer is released. Index buffers are already non-interleaved and can be kept as-is. Wholeship source GLBs (authored path, F4) are the opposite shape: `ashline_dart` lod0 = ~4.4MB geometry across **non-interleaved** attrs + ~3.3MB embedded PNG bytes, 0 morphs, 0 interleaved attrs.

---

## 3. SPEC F2 — geometry CPU-mirror detach for ordinal-marked packages

**Verdict: PROFITABLE.** ~233.9MB releasable of 354.6MB package geometry bytes at census (all non-position attributes live inside shared interleaved buffers; position+index are retained for CPU consumers). Zero morphs and zero skinned meshes in packages (`assertRigidPlanNode`, renderPackageLoader.js:648-662, rejects Bone/SkinnedMesh/InstancedMesh/LOD) — the two hardest CPU-read classes are absent by construction.

### 3.1 Where the mirror lives

- `BufferAttribute.array` / `InterleavedBuffer.array` (one shared array per interleaved group) + `geometry.index.array`.
- Upload trigger is *record presence* in the renderer-private `WebGLAttributes.buffers` WeakMap (vendor/three.module.js:425-455; `createBuffer` reads `attribute.array` → `gl.bufferData`, throws 'Unsupported buffer data format' on empty :337; `update` throws 'Resizing buffer attributes is not supported' if `data.size !== array.byteLength` on a version bump :485).
- The `attributes` instance is a private closure — **not** exposed on `renderer` (`renderer.properties` is, `:16694`; `renderer.attributes` is not). So the texture precedent's "does a record exist?" check has no geometry twin — the spec must track upload-ledger state itself (3.4).
- Re-uploads are also forced by: `WebGLBindingStates.setup` re-binding index every draw (:1835) and `needsUpdate` on attribute-identity change (:1952-1997), `WebGLObjects.update` per draw (:4496) + instanced matrix/color (:4935-4939), `initGLContext` rebuild on context restore (:16628-16653), `onGeometryDispose` record removal (:4431+), and secondary GL contexts (N2).
- `morphtargets.update` reads `geometry.morphAttributes.*` (:18947-18951) — no morphs in packages today; spec excludes morph-bearing geometry defensively anyway.

### 3.2 Which packages are safe

All rigid package `BufferGeometry`s collected by `collectImmutableResources` (renderPackageLoader.js:1266-1295 — it already stamps `spacefaceRenderPackageImmutable` on geometry+materials+textures and feeds `loaded.resources`). Exclusions (checked at mark time, per geometry):
- `geometry.morphAttributes` non-empty (defensive; census shows none).
- Any attribute with `isGLBufferAttribute === true` (no CPU array exists; pre-uploaded payloads — none produced by the GLTF path today).
- Geometry whose attributes are bound by `dynamicBufferRanges` (none — that pool owns its own instance attrs; verified by census of consumers below).
- Geometry carrying `spacefaceQualityTierGeometries` alternates: the only producers are `thruster/systems/continuousPlume.js:758` and `rcsImpulse.js:516` — **procedural** geometries outside `collectImmutableResources`, so they are out of scope naturally (note: their tier arrays are a separate retained class — small; not marked).

### 3.3 Design

Mirror the `spaceface.cpuDetach.v1` manifest machinery in `packageCpuDetach.js` — extend the existing manifest (same `contentHash`, `redecode`, ordinal store) with `geometryEntries`:

1. **Mark time** (`createPackageDetachManifest`, packageCpuDetach.js:57-117, driven by renderPackageLoader.js:359-370):
   - `geometryEntries` = `[...loaded.resources].filter(r => r.isBufferGeometry)` — deterministic ordinal via Set insertion order (decode traversal is deterministic; bytes are hash-verified so re-decodes produce identical order).
   - Per geometry: **deinterleave `position`** — replace `geometry.attributes.position` (a `InterleavedBufferAttribute` today) with a standalone `BufferAttribute` whose array is the stride-copied position slice; assign via `geometry.setAttribute('position', standalone)` *before any upload* so the first upload builds the position VBO from the standalone array. Do NOT copy index — index bufferViews are already standalone; keep `geometry.index` live.
   - Eager `geometry.computeBoundingSphere()` + `geometry.computeBoundingBox()` (arrays still real at mark time) so every later bounds query hits the cache — `asteroidInstancePool.js:624` and every cull site read the cached field.
   - Record per-entry: `{geometry, ordinal, keepSet:[position,index], detachAttrs:[names of attrs sharing released buffers], releasedBuffers:[InterleavedBuffer refs], detachedVersions:Map<attr,buffer→version>, uploadedOn:WeakMap<renderer→true>, recordsDied:false}`.
   - Attach a `geometry.addEventListener('dispose', ...)` hook → `entry.recordsDied = true` (the vendored `onGeometryDispose` removes attribute records; after that the next draw re-uploads → gate must fire).
2. **Seal**: existing `spacefaceGpuResident` stamp in `startupGpuResidency.js:745` stays the upload-complete signal. New companion API `noteGeometryGpuResident(geometry, renderer)` updates `entry.uploadedOn` (needed for N2's secondary contexts, which never run the residency pass — called from the preview sweep after its own upload completes).
3. **Detach** (new `detachPackageGeometry(geometry, renderer)`), called:
   - inside `prepareStartupGeometryResidency`'s receipt block (`startupGpuResidency.js:741-746`) immediately after the stamp — same placement as texture detach `:836/:848/:880`;
   - at the `spacefaceGpuResident === true` skip branch in `createGeometryWorkItems` (`:381-384` Steps and `:408-411`) — the texture-detach's `:836` retry semantics, covering geometries sealed by earlier passes;
   - inside `collectUnresidentInstancedDrawables` (:276+) stamped-skip path for instanced-shared geometries (asteroid buckets share package leaf geometry, asteroidInstancePool.js:173-174/:430-432).
   - Detach action per entry: for each `releasedBuffer`, set `interleavedBuffer.array = new (ctor)(0)` — **empty same-constructor array, never null** (a null array flips `openingSubmissionPlan.js:543-547`'s `array || data.array` truthiness fingerprint and breaks `attribute.array.byteLength` readers; empty typed array keeps `.BYTES_PER_ELEMENT`/itemSize reads intact and makes three's own `update` see byteLength 0 → resize-throw only if an un-gated upload ever slips through — the throw is the *detector*, matching the texture precedent). Dedupe released buffers in a **WeakSet** (learns from N1 — a strong Set would re-create the phantom-retention defect on ~318MB of buffers). Non-shared standalone non-kept attributes (none today; defensive) get the same empty-array treatment. Record `detachedVersions.set(attrOrBuffer, currentVersion)`.
4. **Post-detach state**: `position` (standalone, ~84MB census) + `index` (~37MB) retained; all other CPU bytes released (~234MB). Raycast, bounds, culling, submission-plan fingerprints all intact.

### 3.4 The pending gate (N2-hardened)

```js
detachedGeometryUploadPending(geometry, renderer) {
  const entry = manifest entry for geometry; // identity-checked, not userData mark
  if (!entry || !entry.detached) return false;
  if (entry.recordsDied) return true;
  for (const [attr, v] of entry.detachedVersions) if (attr.version !== v) return true;
  return entry.uploadedOn.get(renderer) !== true; // this renderer never uploaded post-detach state
}
```

Differences from `detachedTextureUploadPending`: (a) takes the renderer because geometry records are per-`WebGLAttributes`-instance and unreachable — `uploadedOn` is the ledger; (b) `recordsDied` replaces the "record missing" check. Must be consulted at **every** site that can force an upload: residency passes, `openingGpuAdmission` geometry twin (new `reattachDetachedAdmissionGeometries` next to `reattachDetachedAdmissionTextures` :34-61, invoked beside :798/:889), `renderer.js` `detachedSubjectUploadsPending`-twin (:12030-12051 region) and rehydrate call :12658, and every secondary context's upload/draw sweep (shipPreviewMount.js:836-895, pipSpannerPreview, graphicsLab — same landing as N2's texture fix).

### 3.5 Rehydrate path (context restore)

`rehydrateDetachedPackages` (packageCpuDetach.js:338-364) already runs inside the context-restore block (`renderer.js:10737`) with a serial `rehydrating` latch (:281-291). Extend `rehydrateManifest` (:237-279): for each `geometryEntry`, the fresh decode's ordinal-paired geometry provides the donor: fingerprint = `{attrNameSet, position.count, index?.count ?? 0, per-attr itemSize+normalized}` — reject mismatch (count diagnostics, same doctrine as `textureFingerprint`). Refill: `releasedBuffer.array = donorBuffer.array` (byteLength must equal recorded size — resize-throw impossible since sizes match), `attr.version++` per affected attribute/buffer so `needsUpdate` re-uploads real bytes. For a secondary-context restore, `initGLContext` rebuilds everything — the refilled arrays upload on next draw; for a context that was *never* restored (first upload on a preview), the pending gate routes through `rehydrateDetachedGeometries(geometries)` (new, twin of `rehydrateDetachedTextures` :302-330) first.

### 3.6 CPU-consumer census (post-detach reads of `.array`/bounds/geometry)

| site | reads | verdict |
|---|---|---|
| `worldObjectPicking.js:423-435` | `scratch.raycast(raycaster, hits)` → `Mesh.raycast` reads `position`+`index` on pick leaves (pick leaves ARE package meshes: `isBodyLeaf` :85-158 = geometry+isMesh) | **KEEP position+index — the reason for the deinterleave.** Bounding sphere cached at mark → early-outs still valid. |
| `asteroidInstancePool.js:624` | `computeBoundingSphere` guarded by `if (!geometry.boundingSphere)` | Safe — cached eagerly at mark. `:889` reads itemSize/normalized only. |
| `asteroidInstancePool.js:857` | `new InstancedMesh(bucket.geometry,…)` — instanceMatrix on the mesh, not geometry | Safe — instanced attrs out of scope; shared geometry sealed through the InstancedMesh's own upload (proxy path repoints production instance buffers, :493-528). |
| `openingSubmissionPlan.js:543-547` | `array \|\| data.array` truthiness in geometry fingerprint | Safe **only with empty-array (not null) release** — pinned in 3.3. |
| `assetResidency.js:3078-3083` | `addBufferAttributeUnit` reads `array.byteLength` | Null/empty-safe — counts 0 post-detach; expected (it reports the floor we're lowering). |
| `GLTFLoader` `computeBounding*` | runs pre-detach during parse | Safe — eager-compute at mark is strictly additional. |
| `partsLibrary.js:16474`, `visualFactory.js:584` | `attribute.array.byteLength`, `g.index.array.constructor.name` | Authored/procedural geometry — never in package manifests; F4 marks textures only. |
| `secondRinseVisuals.js:134`, `deepFieldStars.js:306-309`, `vfx.js:8772`, `emergentPrimitivePools.js:478`, `renderer.js:7607-7612/8178-8189`, `dynamicBufferRanges.js` | own procedural/dynamic arrays | Safe — never package geometry. |
| `retroMounts` (~:110-116) | builds its own soup `Float32BufferAttribute` from baked matrices | Safe — reads happen at mount-build over its own arrays. |
| `BufferGeometry.copy` | three.core.js:19550: `this.userData = source.userData` — **shared** userData (unlike Texture/Object3D which JSON-clone :7724/:13306) | Spec: manifest lookup is by **geometry identity** (entry.geometry === geometry), so clones with copied arrays + shared userData mark are rejected — same doctrine as cloned textures; additionally a `clone()`'s arrays are real bytes so nothing breaks if code reads them. |
| wireframe | `wireframeAttributes` rebuilt from arrays if a `material.wireframe:true` draws | No package material sets wireframe (only reader is `programCanon.js:236` key) — contract note for future content. |
| raycast BVH | three-mesh-bvh | Not vendored/used in `src/` — absent. |

### 3.7 Files + lines touched

- `src/render/packageCpuDetach.js` — extend `createPackageDetachManifest` (:57-117: geometry entries, mark, deinterleave-position, eager bounds); `manifest` fields (:57-117 init block); new `isPackageGeometryDetached`, `detachPackageGeometry`, `detachedGeometryUploadPending`, `noteGeometryGpuResident`, `rehydrateDetachedGeometries`; extend `rehydrateManifest` (:237-279); diagnostics in `packageDetachStats` + `resetPackageDetachManifestsForTests` (:390). Released-buffer dedupe = WeakSet (N1).
- `src/render/renderPackageLoader.js:359-370` — no signature change (manifest options already pass `redecode`/`collectResources`); ensure `collectImmutableResources` covers every geometry (it does — :1266-1295).
- `src/render/startupGpuResidency.js` — import + call `detachPackageGeometry` at :741-746 (post-stamp), retry calls in `createGeometryWorkItems` stamped-skip (:381-384, :408-411) and `collectUnresidentInstancedDrawables` (:276+); export/consume `noteGeometryGpuResident`.
- `src/render/openingGpuAdmission.js` — `reattachDetachedAdmissionGeometries` twin; invoked alongside texture reattach at its two call sites (`:798`, `:889`).
- `src/render/renderer.js` — geometry arms next to `detachedSubjectUploadsPending` (:12030-12051), rehydrate twin beside :12658; context-restore block :10720-10750 already calls `rehydrateDetachedPackages` (manifest-unified → covers geometry).
- `src/ui/shipPreviewMount.js` (:645 needsUpdate sweep, :836-895 upload/compile), `src/ui/orrery/pipSpannerPreview.js:106`, `src/render/graphicsLab.js:465` — consult `detachedGeometryUploadPending`/`detachedTextureUploadPending` before any upload-or-draw on package resources; call `noteGeometryGpuResident` after a clean upload (lands N2's fix in the same pass).
- No vendor changes.

### 3.8 Test pins

- New `test/package-geometry-detach.test.mjs` mirroring `test/package-cpu-detach.test.mjs`: manifest mark/ordinal/fingerprint pairing; identity-reject on `clone()`; detach empties released interleaved buffers (same-constructor empty array), keeps position/index; WeakSet dedupe across attrs sharing a buffer; `detachedGeometryUploadPending` semantics (version bump → true, dispose → true, fresh renderer → true, uploaded renderer → false); `rehydrateManifest` refills + version-bumps.
- Raycast pin: headless `Mesh.raycast` hit-test on a detached marked geometry (position+index kept → intersects still computed).
- A vendored-three behavior pin asserting `createBuffer`/`update`/version-gate semantics haven't drifted (mirror of the texture test's contract block).
- Source-regex pins on the new call sites (repo pins grep literal strings — register every site verbatim).
- `opening-gpu-admission` test twins for the geometry reattach path.

### 3.9 Est. heap delta

~**234MB** released of ~354.6MB package geometry bytes across the 350-package census (retained: position 83.8MB + index 36.9MB; plus ~84MB transient during the mark-time position deinterleave, bounded per-package inside the paced residency pass). Session-live share tracks how much of the catalog is actually loaded resident — the number that matters for the floor is `sum over marked-and-sealed geometries`, enumerable at runtime via the new stats.

---

## 4. SPEC F3 — shared texture payload release once all live users are GPU-resident

**Verdict: PROFITABLE, gated on N2's fix.** Two shared-payload shapes exist (verified): (a) adopted uncompressed `Source` objects shared across package textures via `adoptTextureImageSource`/`entries` in `imageSourceDedupe.js` — `detachPackageTexture` defers them while `sharedImageSourceUserCount > 1` (:149-152) and they currently stay deferred **forever** (no second pass); (b) shared KTX2 mip chains shared by clone (`embeddedKtx2Textures.js:117/:139-143` `adoptSharedImageSourceClone`/`claimSharedImageTexture` — clones share the same mip data arrays).

### 4.1 Design

- `imageSourceDedupe.js`: new `releaseSharedImageSource(texture, isResident)` — looks up `entries` (key = `texture.userData[SHARED_SOURCE_KEY]`); walks `entry.users`; returns `true` only when every user passes `isResident(user)`; then releases the canonical `entry.source.data` once (`entry.sourceReleased = true`, payload → WeakSet-deduped diagnostic count). For KTX2-clone users, release each resident user's `texture.mipmaps` eagerly (bytes live in the shared arrays; freeing is per-user array-clearing — the underlying arrays are retained by non-resident siblings, then fully freed when the last user releases — WeakSet byte-dedup handles the accounting).
- Residency predicate: `startupGpuResidency.js` keeps `textureUploadVersions` (WeakMap renderer→WeakMap texture→version) — export `textureGpuResident(texture, renderer)` (returns stamp presence; the loop already sets `uploadVersions` before detach attempts :836/:848/:880).
- Call site: inside `prepareStartupGpuResidency`'s per-texture loop, when `detachPackageTexture` hits the shared-user deferral, invoke `releaseSharedImageSource(texture, t => textureGpuResident(t, renderer))`. Also retry when *each subsequent user* gets stamped — same receipt loop.

### 4.2 source→manifests index

`packageCpuDetach.js`: new `Map<Source, Set<manifest>>` — populated lazily inside `detachPackageTexture` at the deferral site (:149) and at mark time for textures carrying `SHARED_SOURCE_KEY`. Purposes: (a) every manifest whose entries point at a released source flips its per-entry `detached` bookkeeping consistently; (b) on rehydrate, refilling the shared `Source.data` once serves all manifests — the index lets `rehydrateManifest` mark sibling manifests' entries restored without re-decoding them; the deduped adoption key is the image-byte content hash, so any one manifest's verified re-decode yields byte-identical payload.

### 4.3 Qualifying textures

Adopted PNG/JPEG `source.data` ImageBitmaps (the dominant shared payloads — atlas/finish/detail sheets deduped across packages; 101.1MB embedded image bytes in census, deduped subset unknown) + shared KTX2 mip chains. Exclusions: sources whose users include non-package textures (userSet spans dedupe classes — `isResident` answers correctly per-user either way); `HTMLTexture`/video sources (never in manifests).

### 4.4 Gates + rehydrate

Unchanged `detachedTextureUploadPending` semantics — an adopted texture's `entry.detached` now also covers source-release. `rehydrateManifest`'s existing `texture.source.data = fresh.source.data` works because fresh decodes re-dedupe onto the released `entry.source` (adopt fails on `!texturePayloadIntact(owner)` → keeps fresh own source → refill copies fresh bytes into the canonical shared source → all users see data — verified mechanics of imageSourceDedupe.js:204-219 + GLTFLoader.js:1257 dedupe rerun inside `redecode`). **But the N2 gate hole must land first**: a preview renderer hitting a released shared source today has no rehydrate path at all.

### 4.5 Files + lines, tests, delta

- `imageSourceDedupe.js` — `releaseSharedImageSource`, `entry.sourceReleased`, users iterator (building on `sharedImageSourceUsers` :349-373).
- `packageCpuDetach.js` — deferral site (:149-152) rework: defer→attempt-release; `sharedSourceManifests` Map; entry `sharedSource` ref; rehydrate bookkeeping (:237-279, :302-364); N1 WeakSet fix in the same file lands first.
- `startupGpuResidency.js` — export `textureGpuResident`; call release-attempt beside :836/:848/:880.
- Tests: shared-source fixtures — release only when all users stamped; per-user KTX2 mip release ordering; rehydrate refills canonical source once across manifests; `detachedTextureUploadPending` true for any user while released.
- **Est. delta:** deduped shared-source payload volume — measurable at runtime via `imageSourceDedupeStats` + Σ `entry.source.data.byteLength`; embedded-image census upper bound ~101MB compressed-side (decoded ImageBitmaps are larger). UNVERIFIED exact; mechanism verified.

---

## 5. SPEC F4 — non-package source-GLB texture detach marks

**Verdict: PROFITABLE with one extra mechanism (source-identity pinning).** Authored assets (wholeships, parts, works) decode through `assetLoader.js` `loadGltfDocument` (:2313-2345), get `dedupeGltfTextureSources` (:2327/:2344 — so F3 mechanics apply to them too), and compile through `compileBlueprint` (:1540). Their textures carry no `spacefaceCpuDetach` mark, so the residency loop skips them — every authored texture's decoded mirror is retained for the session. Wholeship hulls are the heavy end: lod0 ≈ ~3.3MB embedded PNG bytes → decoded ImageBitmap mirrors of 10+MB per hull, ×(lod0+lod1+lod2+fallback tree) × fleet size.

### 5.1 The identity problem (the one real gap)

Source GLBs have no content-hash URL (unlike render packages whose `renderUrl` embeds the hash). `loadGltfDocument` fetches `cache:'no-cache'` (:2328) with no recorded identity. A detach manifest needs byte-exact rehydrate identity — spec:

- In `loadGltfDocument`'s whole-ship branch (:2329-2338) the bytes already exist once (`response.arrayBuffer()`) — compute `sha256` there (crypto.subtle, off presented path, post-validation) and hand it through.
- For the non-wholeship branch, re-read via `fetch(url, {cache:'force-cache'})` post-load for the hash (the first fetch already warmed it; hashing is compile-lane paced).
- Store `manifest.renderUrl = url`, `manifest.sourceBytesSha256 = hash`; mark textures `spacefaceCpuDetach = {schema:'spaceface.cpuDetach.v1', contentHash, ordinal}` — same store/schema (manifests keyed by `sha256:` of source bytes).

### 5.2 Mark point + redecode

- Mark inside `compileBlueprint`'s tail (assetLoader.js — after material/texture collection, where the frozen blueprint's texture set is known): `createSourceDetachManifest(url, textures, {contentHash, redecode})` — `redecode` = a **lean** fetch→`parseAsync`→collect-textures path (no `compileBlueprint` — we only need the donors' payloads; no validation/dedupe re-run beyond what `loadGltfDocument` does internally; force-cache + sha256 verify before parsing).
- `ordinal` = index into the collected texture list (materials traversal order is deterministic for identical bytes — same doctrine as package manifests).
- `detachOnMark: true` for `authoredReadableFallbackLayer`-stamped subtrees (N3) — they never seal by design; detach eagerly at mark. All other authored textures detach through the normal seal path: `prepareStartupGpuResidency` already calls `detachPackageTexture` on every stamped texture (:836/:848/:880) — once marked, authored textures detach with zero residency-side changes.
- Shared-source authored textures (post-dedupe) get F3's release path for free.

### 5.3 Consumers + rehydrate

- Post-materialize CPU reads of authored texture payloads: none found — `.image`/`source.data` reads are identity/dims (`materialBatchKey.js:14`, `assetLoader.js:2632/:2694`, `partsLibrary.js:5851/:13418`, `openingSubmissionPlan.js:370/:461` fingerprint falls back to `source.uuid`/name — all null-safe; `foundryEnvironment` HDR Float32Array edits and `fragmentFamilies.js:761`/`spaceBackground.js:3107/:3135` painted atlases are procedural payloads, never GLB textures). `texture.image?.width` degrades to `undefined→0` post-detach for uncompressed sources — verify no visible consumer depends on dims (submission-plan fingerprint already falls back) — residual risk noted, mitigations: record dims on the mark (`entry.width/height`) for any consumer that must report them.
- Rehydrate: same manifests Map → `rehydrateDetachedPackages` picks them up in the context-restore pass automatically; `rehydrateDetachedTextures`/`detachedSubjectUploadsPending` arms cover authored admission the same as packages; secondary contexts gated via N2 fix.

### 5.4 Files + lines, tests, delta

- `assetLoader.js` — sha256 recording in `loadGltfDocument` (:2328-2345); mark call in `compileBlueprint` (:1540+); lean `redecode` function.
- `packageCpuDetach.js` — `createSourceDetachManifest` (or `createPackageDetachManifest` generalized over `{redecode, collectTextures}` — the collect step differs: package uses `collectImmutableResources`, authored uses blueprint texture collection); `detachOnMark` flag.
- `partsLibrary.js` — pass `detachOnMark` for `markReadableFallbackLayer` subtrees (:10173-10178).
- Tests: source-GLB manifest fixture — sha256 verify on rehydrate, wrong-bytes reject; detachOnMark for a fallback-layer fixture; authored texture detach through the seal path.
- **Est. delta:** fleet-dependent; per-hull decoded texture mirrors ~10-15MB + fallback tree copies; UNVERIFIED session share — enumerable via manifest stats post-landing.

---

## 6. Rejected / adjudicated

- **Deinterleave-free F2** (detach whole interleaved buffers incl. position): rejected — kills `worldObjectPicking` raycast (real consumer, :423-435) and every lazy `computeBounding*` re-entry; async rehydrate can't feed a synchronous raycast. Keep-set must include position; that forces the deinterleave.
- **`renderer.attributes` record check for the F2 gate**: impossible — `WebGLAttributes` instance is a private closure in the vendored module (only `renderer.properties` exposed, :16694). Ledger (`uploadedOn` WeakMap + `recordsDied` dispose hook + `detachedVersions`) replaces it — deliberately no vendor patch.
- **Releasing position too** (raycast via bounding-sphere approximation): rejected — visible pick-quality regression (hull flanks are long wedge faces; sphere-pick changes pick radius materially — `retroSkinSeat` docs the same failure shape analytically).
- **`freedPayloads` as plain strong Set**: not a design choice, a defect — N1.

## 7. Other heap-floor observations (bounded, non-material — recorded so next wave doesn't re-derive)

- `detachedSources`/`detachedManifests` strong Sets hold only Source shells + manifest metadata — fine.
- `addBufferAttributeUnit`-style residency censuses retain attribute/texture *object refs*, not payload arrays — detached payloads stay collectible.
- `_slotDataMemo` (cap 6) + new envelope/worker caps — bounded post-F1/F5.
- `spacefaceQualityTierGeometries` tier arrays (continuousPlume/rcsImpulse) — procedural per-tier buffer sets held on mesh userData; small, self-contained; only notable because they bypass `collectImmutableResources` (correct — they're not package payloads).
- Object3D/Texture JSON-clone userData (`:13306`/`:7724`) vs BufferGeometry shared userData (`:19550`) — asymmetry that makes geometry identity-checks (not userData marks) the correct detach lookup, same as textures already do.

## 8. Landing order

1. **N1** (one mechanism: `freedPayloads` → WeakSet) — converts shipped savings from phantom to real; prerequisite for honest F2/F3 diagnostics.
2. **N2** (pending gates + `noteGeometryGpuResident`/`uploadedOn` ledger on every secondary-renderer upload/draw site) — unblocks F2/F3 safely.
3. **F2** → F3 → **F4** (F4's `detachOnMark` subsumes N3).

`saturated: false`
