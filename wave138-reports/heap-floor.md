saturated: false

# wave138 HEAP-FLOOR audit — coldshalamov/SpaceFace

Lane seed: W136 global B9 (~485 MB JS heap floor).
Audit pin: `devin/1791504143-perf-w120` @ `e982b5a96bf4712044dad412a4c9f0985a13df44` (HEAD unchanged during audit — verified via `git rev-parse`).
Read-only: no code touched, no app launched. All file:line cites are at the pinned SHA.

The 485 MB floor decomposes (owner census, HILLCLIMB-LOG exp.5): ~202 MB owned typed arrays (post-canvasTextures-pool), ~157 MB meshopt transient decode output, ~29 MB canvasTextures scratch (KEPT), remainder = object graphs + strings. This lane's job: which retained bytes are dead weight vs legal warm residency.

## Findings (ranked)

### F1 — `_decodedSaveEnvelopes`: unbounded Map pins every gzipped save's raw string AND its parsed envelope — the one true accretion leak in scope

- **Evidence:** `src/save/saveSystem.js:5110-5114` (the only `.set`), `:5214-5215`, `:5238-5239` (the only `.get`s). No `.delete`, no `.clear`, no cap — `git grep` shows exactly three sites.
- **Mechanism:** keyed by `raw` — the full gzip-wrapper save string (MBs per generation) — valued at `{ ok, env, data, version }` — the worker's complete parsed+migrated+normalized save object graph (also MBs). Production writes mint `SAVE_GZIP_FORMAT` envelopes (`src/save/saveWorker.js:69`, `:526`), so every `load()`/`loadEnvelopeFromString` of a gzipped save flows through `_prepareEnvelopeStringAsync` and lands a permanent entry. Each save generation produces a NEW distinct raw (payload+savedAt differ), so every generation read — continue-load, rollback verification, slot-card/NG+ prep — adds ~(compressed key + full parsed world state) forever. Sibling `_preparedEnvelopeCache` (:5193-5205) carries an explicit `while (cache.size > 8) cache.delete(oldest)` FIFO; this cache simply missed the same treatment.
- **Fix sketch:** same FIFO cap (~4-8 entries). A miss already returns `'compressed_envelope'` and callers fall to the async lane — contract preserved, zero quality cost. Optionally key by a short digest of `raw` to shed the multi-MB string keys too.
- **Effort:** S. **Magic-frame impact:** H on the long-session accretion axis (per-generation MB growth, unbounded); M on the static floor. **Risk:** low.

### F2 — Geometry CPU mirrors: uploaded static attribute arrays never release — likely the largest single resident-byte class

- **Evidence:** residency stamps geometry `spacefaceGpuResident` (`src/render/startupGpuResidency.js:745` area — instanced+ordinary drawable sealing machinery at :270-440) and accounts the CPU bytes itself (`geometryByteLength` :330-342 sums index + every attribute + morphs). Nothing ever nulls them: `geometry.dispose()` frees GPU-side only; `git grep cpuDetach|detachGeometry` hits only `src/render/packageCpuDetach.js` (texture-only). `disposeDecodedResources` (`src/render/renderPackageLoader.js:1305`) = traverse + `.dispose()` — GPU-side.
- **Mechanism:** three keeps `BufferAttribute.array` alive post-upload; it's needed only for (a) first upload and (b) context-restore re-upload. Post-upload consumers of `.array` on static authored geometry: none on the presented path — no mesh raycasts (W4 documented), bounds cached at compileBlueprint, `clone()` shares arrays, instanced pools share blueprint geometry. Meshopt decode output (~157 MB in the census) *becomes* these arrays — the transient-counted share that stays resident. Within ~202 MB owned typed arrays the static authored-geometry share is plausibly the bulk.
- **Fix sketch:** geometry twin of `packageCpuDetach` — ordinal-mark package geometries in `collectImmutableResources`, drop `index`+`attributes` arrays once `spacefaceGpuResident` seals, rehydrate on context-restore/restore-pending by re-decode of the content-hash-pinned render.glb. Exempt `instanceMatrix`/`instanceColor` (per-frame writes) and any geometry with live morph/dynamic buffers. Leg 1 restrict to render packages; source-GLB blueprints aren't hash-pinned.
- **Effort:** L. **Impact:** H. **Risk:** M-H — the upload-on-empty-array crash class the texture detach engineered around (its `detachedTextureUploadPending` version-gate twin needed at the geometry upload sites: `WebGLAttributes.update` / initAttribute paths); more CPU-side read sites than textures — e.g. the asteroid merge reads `g.attributes[name].array` at pool build (must run pre-detach or carry its own copy).

### F3 — Dedupe-shared texture payloads structurally un-detachable: `sharedImageSourceUserCount > 1` never resolves for shared atlases

- **Evidence:** `src/render/packageCpuDetach.js:149-152` — `detachPackageTexture` returns false while the shared source has >1 live user; `src/render/imageSourceDedupe.js` exists precisely because finish/detail atlas `THREE.Source`s are shared across dozens of packages — the count stays >1 for the session, so exactly the heaviest shared CPU payloads (KTX2 mipmap `Uint8Array` chains + `source.data` ImageBitmaps) can never be released by today's machinery.
- **Mechanism:** per-package manifests know their ordinals; a source→manifests index doesn't exist, so "all live users resident" is never provable → defer forever.
- **Fix sketch:** release a shared source's payload once every live user is `spacefaceGpuResident`-stamped; rehydrate on restore-pending from any sibling package's immutable render.glb (fingerprint-paired ordinals already exist). The refcount-zero case already works today.
- **Effort:** M. **Impact:** M (unique deduped source bytes — tens of MB plausible, UNVERIFIED exact). **Risk:** M — same empty-payload-upload crash class as F2; needs the source→manifests index.

### F4 — Non-package source-GLB textures keep CPU mirrors: detach marks exist only inside render.glb packages

- **Evidence:** `createPackageDetachManifest` runs only in `renderPackageLoader.loadResolved` (:364); the authored-asset path (`assetLoader.js:2311 loadGltfDocument` → `compileBlueprint` :1540 → frozen primitives/materials/textures) marks nothing — `detachPackageTexture` no-ops on unmarked textures (`packageCpuDetach.js` early return). Wholeship GLBs (e.g. `assets/ships/kestrel_borrowed_time_v4/source/wholeships/kestrel_borrowed_time_v4_lod0.glb` = 53 MB), works, and any un-piloted part keep `mipmaps`/`source.data` forever.
- **Mechanism:** the dedupe registry adopts source-path textures but detach eligibility is package-manifest-gated.
- **Fix sketch:** same mark+detach at materialize time keyed to the source URL's bytes; rehydrate = re-fetch + re-parse the source GLB. Weaker identity than content-hash packages — pin a byte hash at load for pairing, or accept URL-identity within the process (assets are immutable content in practice).
- **Effort:** M. **Impact:** M. **Risk:** M — re-fetch identity caveat.

### F5 — Save-worker session orphans: `encodeSessions`/`validationSessions` delete only on `*_finish`

- **Evidence:** `src/save/saveWorker.js` — sessions mint on `encode_begin`/`validate_begin`, deleted at :369/:390 on finish only; no TTL, no cap. A begin-without-finish (abandoned encode/validate) retains `session.data` — the assembled save payload — for the worker's life.
- **Mechanism:** reachability UNVERIFIED (didn't confirm a caller path that abandons mid-encode; all observed flows finish). Structure is verified.
- **Fix sketch:** TTL sweep or session cap on both maps.
- **Effort:** S. **Impact:** L. **Risk:** low.

### F6 — Residual accretion sweep: everything else checked is bounded or negligible

- `joinedPackageTaskClasses` (`assetLoader.js:688` Map keyed by metadataUrl, never deleted): ~350 pilot URLs × ~100-byte keys+refs → KBs — negligible, note only.
- `_slotDataMemo` retains raw strings — cap 6; already adjudicated a documented nit in W135-skeptic (re-flag only because bytes are now the metric: up to ~6×blob).
- Bounded-by-design, verified: `_preparedEnvelopeCache` cap 8 FIFO; `warnDedup` cap 256; `MAX_EVENT_HISTORY` 512; chronicler `MAX_RETAINED_FACTS` 4096; sample library byteBudget+pins; planetCache/structureTexCache/_spriteMatCache evict on bake-swap (:2770-2782) + dispose; `_depthVariantCache`, `compositionPrimitiveCache`, `keyMemoByBuffer`, `taskConsumerPredicates`, `joinedAssetTaskClasses` — WeakMaps die with keys; `runtime.failures`/`runtime.assets` per-unique-asset + evict path; parked warm roots released wholesale in `_releaseSurvivalRosterPrewarm` (:22982+); all `createObjectURL`s revoked; GLTFLoader accessorCache dies with parser (parser dropped post-compile — whole-GLB ArrayBuffer not pinned by blueprints).
- PR #260's `__laneStorage` N-MB localStorage clone is **not on this branch** (`git merge-base --is-ancestor 8fad14efe` → false) — the phase-14 SAB worker on this branch is ballistic-only; cannot be audited here.
- No unbounded sector/entity-keyed successor to `sectorLiveClaims` found in scope — the W136 P2 machinery itself is the pruning answer and it's intact.

## Regression verification (required items)

- **Posting-class claim lapse-ability (W136):** `claimArmClass` (:842-845), `sectorClaimStamp` arm↔live dual-structure (:847-861), `postArmClass` merge-path posting incl. `unionOwnerSector` spread (:405-414) — all present and shaped correctly at the pinned SHA. W137-popin's probe at this same SHA verified 6/6 incl. the posting-class vectors; spot-reads here confirm the code it exercised.
- **SaveSystem deferred-consume gen guard / `peek_card_data` / `_pendingSlotRearm`:** present at the pinned SHA (gen-guarded `specByteHit` verdict ~:4916; `peek_card_data` op `saveWorker.js:344-352`; `_pendingSlotRearm` coalescing ~:394-404). The F1/F2/F3 defects W137-boot filed on them are the parent's in-flight exclusions — not re-reported; no new defects verified on the code actually read (F1 `_decodedSaveEnvelopes` above is a different cache 100 lines away).
- **Prior adjudications respected:** canvasTextures 29 MB pool kept; `LoadedRenderPackage.#template` retention is the legal instance-clone source (its `#notifyStale` eviction signal exists for the D24 slope); audio LRU bounded; no re-reported landed items.

## Hardware-unverified (SwiftShader box — owner-side measurement needed)

- All byte magnitudes: the 485 MB floor itself, F2/F3/F4 per-class MB estimates, deduped-source byte share.
- Any claim that releasing these bytes moves the real D-metric — the structures are verified, the MB shares are not.

## Bottom line for the orchestrator

`saturated: false`. F1 is a one-screen FIFO fix that closes the only *unbounded* growth path found. F2+F3+F4 are one coherent campaign (geometry mirrors + the shared/non-package texture-mirror holes) — the detach machinery exists and is proven; its coverage is the gap. If the owner-side census re-run lands near ~100-200 MB on static geometry arrays, F2 alone is the largest legal reclaim in the floor.
