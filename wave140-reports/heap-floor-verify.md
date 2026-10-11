# wave-140 heap-floor-verify — adversarial audit of the landed heap-floor campaign

**audit_sha:** `3e52d86df776c4cb0523e44c7b0917e9129fc4a7` (tip of `origin/devin/1791504143-perf-w120`; verified `git rev-parse FETCH_HEAD` after `git fetch origin devin/1791504143-perf-w120`). Read-only audit via `git show <sha>:<path>` / `git grep` at the pinned tree — no checkout, no working-tree touch, no edits, no PRs, no app launch.

**Spec audited:** `wave139-reports/heap-floor-campaign.md` @ `origin/devin/perf-wave-prompts`.
**Commits audited:** `0a4fe0b9b` (N2 secondary-renderer pending gates), `8bc62d76b` (F2 geometry CPU-mirror detach), `5961f8c32` (F3 shared texture payload release), `3e52d86df` (F4 source-GLB detach marks + N3 detachOnMark).

**saturated: false** — the campaign landed close to spec, but it introduced one real mechanism defect (the geometry-resident ledger is written before any attribute record exists, which can blind the N2 gate it exists to serve), plus bounded residuals worth one more wave's attention.

---

## 1. Contract-point verdicts

| contract point | verdict | evidence |
|---|---|---|
| F2: deinterleaved position kept standalone | **MECHANISM_VERIFIED** | `packageCpuDetach.js:87-101` `deinterleavePositionAttribute` — stride-copy into standalone `BufferAttribute` (correct `stride`/`offset`/`normalized` handling), `setAttribute('position', …)` at mark time `:263`, before any upload. Position slice values test-pinned. |
| F2: index kept | **MECHANISM_VERIFIED** | Detach loop `:434-449` iterates `geometry.attributes` only; `geometry.index` untouched and stays a live standalone array. |
| F2: released attrs → EMPTY same-ctor arrays, never null | **MECHANISM_VERIFIED** | `:447` `record.array = new array.constructor(0)` — `openingSubmissionPlan` truthiness fingerprint preserved; vendored `update` resize-throw remains the detector (`vendor/three.module.js:485`). |
| F2: WeakSet `freedBuffers` dedupe | **MECHANISM_VERIFIED** | `:233` manifest field is `WeakSet`; `:443-445` dedupes by `record` (the InterleavedBuffer) so sibling attrs sharing one buffer release+count once. Re-minted on rehydrate `:597`. |
| F2: `detachedGeometryUploadPending` ledger | **MECHANISM_VERIFIED, with defect D1 below** | `:470-479` — `entry.detached` → `recordsDied` → per-record `detachedVersions` drift → `uploadedOn.get(renderer) !== true`. Matches spec §3.4 pseudocode exactly. `uploadedOn`/`recordsDied` ledger replaces the unreachable `WebGLAttributes` map as spec required. |
| F2: rehydrate fingerprint pairing | **MECHANISM_VERIFIED** | `geometryFingerprint`/`sameGeometryFingerprint` `:106-137` — attr name set + position/index counts + itemSize/normalized per spec §3.5; ordinal-paired donor `:537-549` refills `record.array`, version-bumps every tracked record `:553-556`, clears `recordsDied`/`detached`. |
| F2: per-renderer upload semantics — every upload site gated? | **Mostly — see D1 + R2** | Main renderer: 4 reattach sites (`renderer.js:12526,13471,16255` + exact-target `:12696-12705`), context restore `rehydrateDetachedPackages :10741` (covers geometry via `rehydrateManifest`), admission twin `openingGpuAdmission.js:72-102` invoked beside both texture sites `:838,:933`. Secondary contexts: gate present at all three live ones (shipPreviewMount `:891,:1063-1066`, pipSpanner `:187-191`, asteroidRenderer3d `:1411-1415`). `graphicsLab.js:465` requires none — census of its content (kestrelHero = procedural CanvasTextures + built geometry; no `renderPackage`/`loadGltfDocument`/`collectImmutableResources` reachable) shows zero package-manifest resources can reach it. **N2 residual: post-admission re-upload forcers on pipSpanner/asteroid are unguarded** (see R2). |
| F3: `releaseSharedImageSource` all-users-resident gate | **MECHANISM_VERIFIED** | `imageSourceDedupe.js:401-428` — iterates `entry.users`, `allResident=false` on any non-resident, canonical `source.data` released once (`sourceReleased`), compressed `owner` keeps dims stub. Called at all 3 stamp/detach points `startupGpuResidency.js:901,918,949` via `textureGpuResident` (`:92-95`, version-matched upload stamp). |
| F3: eager KTX2 mip release ordering | **MECHANISM_VERIFIED** | `:408-413` — only users passing `isResident` get `user.mipmaps = []` + `releasedUsers.add`; unstamped siblings keep the shared records (bytes free on last clear — test-pinned). Resident user's GPU copy is already proven before its array clears. |
| F3: canonical refill resets released-state for sibling manifests | **MECHANISM_VERIFIED** | `rehydrateManifest :578-586` — `releasedUsers.delete(texture)`, `texture.source.data = fresh.source.data` (canonical Source serves all adopters), `noteSharedImageSourceRefilled` clears `sourceReleased` → siblings' released-state re-derives. `detachedManifestList` DERIVES membership per check `:46-57` — correctly chosen over the spec's `sharedSourceManifests` index; same observable contract, no back-edge needed. |
| F3: released-state derivation off the dedupe entry | **MECHANISM_VERIFIED** | `sharedTextureReleased :35-40` reads `sourceReleased`/`releasedUsers` off `entry.sharedEntry` (set at mark `:228`, refreshed at deferral `:340`); folded into `isPackageTextureDetached`/`detachedTextureUploadPending` via `textureEntryReleased :42-44`. |
| F4: sha256 identity pinning | **MECHANISM_VERIFIED** | `assetLoader.js:2339-2379` `sourceDetachRefFor` — whole-ship reuses its fetched `bytes` (`:2407`, `no-cache` fetch unchanged); non-wholeship re-reads `{cache:'force-cache'}` (`:2389`); key via `imageSourceKeyAsync` (`sha256:` digest). |
| F4: lean redecode | **MECHANISM_VERIFIED** | `redecode` closure `:2357-2366` — force-cache fetch → byte-exact digest verify (`freshHash !== contentHash` throws) → `loader.parseAsync` only; no `compileBlueprint`. |
| F4: `createSourceDetachManifest` keyed `sha256:` | **MECHANISM_VERIFIED** | `packageCpuDetach.js:283-306` — `manifests` keyed by `options.contentHash` (the `sha256:…` key), `manifest.sourceBytesSha256` recorded, same `spaceface.cpuDetach.v1` schema+ordinal marks. |
| F4: ordinal determinism | **MECHANISM_VERIFIED** | `collectAuthoredDetachTextures :2412-2431` — deterministic pre-order traversal, uuid dedupe; `collectResources` re-collects the identical order on re-decode. Byte-identity is digest-verified inside redecode; `textureFingerprint` guards residual drift. |
| F4/N3: `markReadableFallbackLayer` eager detach | **MECHANISM_VERIFIED (via sweep, not the flag)** | `partsLibrary.js:10184-10191` — sweep calls `detachPackageTexture` on every material texture in the fallback subtree. The `detachOnMark` option in `compileBlueprint` (`assetLoader.js:1731`) is dormant today: `scene.userData.authoredReadableFallbackLayer` is only ever set by `markReadableFallbackLayer` on a post-compile wrapper root (`partsLibrary.js:10174,:10179`), never on `gltf.scene` at compile time — so the flag path can't fire, but the direct sweep covers the contract anyway. |
| F4: residency onEvict manifest drop | **MECHANISM_VERIFIED** | `assetLoader.js:1740` `dropPackageDetachManifest(sourceManifest.contentHash)` inside `onEvict`. |
| N1: `freedPayloads` WeakSet + rehydrate re-mints | **MECHANISM_VERIFIED** | `:190` WeakSet init; `detachedSources` correctly stays a strong Set (Source shells only); re-mint `:596`. Phantom-retention defect is gone: payloads are now collectible between detach and rehydrate. |

## 2. Defects introduced by this campaign

### D1 — `noteGeometryGpuResident` is written after program-compile, before any attribute record exists — it can blind the gate it feeds

**MECHANISM_VERIFIED defect.**

All three secondary contexts ledger `uploadedOn.set(renderer, true)` immediately after a **compile** that creates no attribute records:

- `shipPreviewMount.js:905-911` — `prepareForFirstDraw`: `compilePreviewPipelines` → `uploadPreviewTextures` → `noteGeometryGpuResident` for every geometry.
- `pipSpannerPreview.js:193-196` — after `compile` + gate/rehydrate, blanket-ledger all geometries.
- `asteroidRenderer3d.js:1435-1439` — ledger `leaf.geometry` after per-leaf pipeline links.

Verified against the vendored three: `WebGLRenderer.compile` (`vendor/three.module.js:17576-17652`) and `compileAsync` (`:17683+`, and this repo's `compileScenePipelinesSafely`→`compileScenePipelinesForRenderTarget`→`compilePipelinesContextSafe` chain) only run `prepareMaterial` — **no `WebGLObjects.update`, no `attributes.createBuffer`, no `bindingStates.setup`**. Attribute records exist only after a real draw. The in-code comment "compile() created this context's attribute records" is false, and spec §3.3.2 says the ledger is noted "after its own upload completes" — a compile is not an upload.

Consequence: `detachedGeometryUploadPending` returns `uploadedOn.get(renderer) === true` → `false` for a context holding zero records. If the geometry is (re-)detached in the window between the premature ledger and the context's first draw — a live window, since `createGeometryWorkItems`/`Steps` and `collectUnresidentInstancedDrawables`/`Steps` call `detachPackageGeometry` opportunistically on every stamped-skip retry during *other* subjects' admissions, and package leaf geometry is shared (asteroid buckets, instance pools) — the next draw hits `createBuffer` on the emptied arrays. Per vendored `createBuffer` (`:330-340`), an empty typed array does **not** throw ('Unsupported buffer data format' is only for non-typed arrays) — it uploads a 0-byte VBO silently, so the context binds garbage/zero attributes and keeps binding them (records exist, version unmoved → permanently stale on that context until a version bump or dispose). Visual corruption, not a throw — which makes it *quieter* than the crash class the gate was built to prevent.

Fix shape: ledger only after the first real draw creates records (e.g. note inside the post-draw sweep), or treat `uploadedOn` as "claim pending verification" until then. One-line-class change at the three sites.

Reachability note: pipSpanner/asteroid order gate→rehydrate→ledger, so a geometry already-detached at admission is refilled before the premature ledger — the residual hole is the re-detach window only. shipPreviewMount's armed draw-audit runs *before* `prepareForFirstDraw`'s ledger for the common mount path, so its hole is the same window. The defect is bounded but real on every secondary context.

### D2 — F3's eager release can empty a *gate-blind* user's payload

**MECHANISM_VERIFIED, bounded reachability.**

`releaseSharedImageSource` clears `user.mipmaps` for any `entry.users` member that passes `isResident` — residency stamps (`uploadVersions.set(texture, version)`, `startupGpuResidency.js:947`) are written for *every* uploaded texture, marked or not. A dedupe user carrying no `spacefaceCpuDetach` mark — a post-collection `texture.clone()` registered via `adoptSharedImageSourceClone` (`embeddedKtx2Textures.js:117`), or any adopted texture outside `loaded.resources` — that gets stamped resident can have its mips cleared (`releasedUsers`) or its canonical `source.data` released. `isPackageTextureDetached` short-circuits on the missing mark → `detachedTextureUploadPending` false → no gate anywhere → a second-context bind or a version-moved re-upload reads `mipmaps[0]`/image on the emptied payload → TypeError. The marked-user story is clean; the unmarked-user story relies on the (real but unproven) invariant that every dedupe user lands in some manifest's entries.

### D3 — Minor accounting/edge issues (non-blocking)

- `releaseSharedImageSource` freed bytes never reach `manifest.freedPayloads`/`detachedBytes` — the shared path's reclaim is invisible to `packageDetachDiagnostics` (spec wanted a WeakSet-deduped diagnostic count; there's no manifest back-edge). Diagnostic-only.
- `entry.released` accumulates duplicate `{name, record}` pushes across detach→rehydrate→re-detach cycles (`:441` pushes unconditionally; never cleared on rehydrate). Harmless refill duplication, bounded by cycle count.
- `createSourceDetachManifest` returns the existing manifest on a shared `contentHash` (`:289-290`): a second compilation of the same source bytes with `detachOnMark:true` gets *no* eager detach (flag ignored on the early return) — covered today by the partsLibrary sweep, but the flag semantics are asymmetric. Relatedly, one registration's `onEvict` drop (`assetLoader.js:1740`) evicts a manifest shared by the other live tree's marks → its released entries become un-rehydratable (`isPackageTextureDetached` false via missing manifest) — a context restore would then upload emptied payloads unguarded. Rare² (same-source double-compile + evict + context loss).
- `sharedTextureReleased` marks a kept-own-source adopter "released" even when its payload is live (`adoptTextureImageSource` keeps its own source when `!texturePayloadIntact(entry.owner)`) — a false-positive detach flag → wasted rehydrate of already-live bytes; conservative, byte-identical outcome.

## 3. Residual risk / coverage notes (not defects against spec)

- **R1 — graphicsLab gate exemption verified:** its renderer can only ever draw procedural content (verified imports + content builders); spec's inclusion was over-cautious. Correctly skipped.
- **R2 — post-admission forcers:** after admission, a `geometry.dispose()`/`texture.dispose()` or `needsUpdate` on a secondary context forces re-upload with no gate consulted (pipSpanner, asteroid; shipPreviewMount only audits while `uploadAuditArmed`, and disarms after one clean scan). On textures this is the `mipmaps[0]` TypeError; on geometry the silent empty-VBO. Trigger requires a post-mount forcer on a marked resource — narrow (previews don't dispose mid-display; `needsUpdate` on marked textures post-mount is rare; the `:657` sweep is covered by arming).
- **R3 — `detachedTextureUploadPending` version>0 short-circuit** (`:518`): a version-0 detached texture would pass the gate unguarded; every decoded GLB texture carries `needsUpdate`-driven `version ≥ 1` in practice. Unchanged pre-existing semantic.
- **R4 — uiStage chunked `initTexture` lane** (`uiStage.js:1181`, live renderer, unguarded): safe under the same records semantics as every main-context uploader; a needsUpdate-moved detached texture in its queue would throw — same pre-existing class, not campaign scope.
- **R5 — tests misnamed:** `source-glb-detach.test.mjs`'s "a redecode that yields wrong bytes is rejected by digest verification" does **not** test wrong-bytes rejection — it re-pins ordinal pairing. The actual `freshHash !== contentHash` throw in `sourceDetachRefFor` is untested and not source-pinned (spec §5.4 asked for it).

## 4. Test-as-contract review

- `package-geometry-detach.test.mjs` — covers what it claims: deinterleave values, keep-set, empty same-ctor arrays, WeakSet single-count, clone identity-reject, gate semantics (resident/foreign/version/died/unmarked), rehydrate refill + version bump, raycast on kept position+index, vendored-three contract pins, source-regex pins on every call site (residency ×4, admission ×2, renderer arms ×4, preview/spanner/asteroid). Misses: D1's premature-ledger scenario (no test asserts ledger-after-upload ordering).
- `shared-image-source-release.test.mjs` — covers all-resident gate, eager resident-user clearing while sibling unstamped, `releasedUsers`/`sourceReleased` → detached+pending derivation, source pins on the 3 call sites. Misses: cross-manifest canonical refill (`noteSharedImageSourceRefilled` path) and unmarked-user exposure (D2).
- `source-glb-detach.test.mjs` — covers sha256-keyed manifest, seal-path detach, lean rehydrate refill, detachOnMark fixture, source pins. Gap per R5.

## 5. Est. delta sanity (mechanism-side, not re-measured)

F2's released-byte accounting is honest: `freedBuffers` counts each shared `InterleavedBuffer.array.byteLength` once (`:443-446`); the keep-set (deinterleaved position ~84MB + index ~37MB census) stays live. ~234MB claimed reclaimable stands mechanism-side. F3's real reclaim is additional but undercounted in diagnostics (D3). F4 makes authored texture mirrors releasable via the same store. N1 converts the earlier texture-detach savings from phantom to real — that was the campaign's largest correctness win and it is verified.

## 6. `saturated: false` — remaining material item in lane scope

The campaign landed faithfully **except** D1: the geometry-resident ledger violates its own contract ("after its own upload completes") at all three secondary contexts. It's a small fix — gate the ledger on a real post-draw state (or drop the blanket ledger and note inside the armed audit's post-draw path) — but until it lands, the N2 pending gate can read `false` exactly when a secondary context is about to bind emptied attribute arrays. Everything else is verified-correct or bounded-residual.
