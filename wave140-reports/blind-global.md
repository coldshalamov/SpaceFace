# wave-140 audit — lane `blind-global`

**Audited commit:** `3e52d86df776c4cb0523e44c7b0917e9129fc4a7` — tip of
`origin/devin/1791504143-perf-w120` (N1 + G2 + N2 + boot B1–B4 + F2 + G1 + F3 + F4 over wave-139's
`63516aff`).
**Method:** read-only `git show <sha>:<path>` / `git grep` against the pushed tree; no checkout, no
app run. `file:line` refs are to the audited tree.
**Scope:** whole presented path, no lane blinders. Prior blind-global findings G1 (`1494b9059`) and
G2 (`50818229c`) verified against their claims; heap-floor detach machinery (N2/F2/F3/F4) audited at
the cross-lane surface; boot wave `38faa79ca` verified (no lane report predates it — `boot-verify`
pinned `1564773c4`, before the landing).

Levels: **MECHANISM_VERIFIED** = the claimed mechanism exists at the cited line and is wired into
the path it claims. **PERFORMANCE_VERIFIED** = the improvement is measurable from the code alone.
**UNVERIFIED** = plausible, needs a trace/A/B to quantify.

---

## 1. G1 verification — pose-pipeline fast pack + slot-keyed apply (`1494b9059`)

The prior wave's G1 finding (4-hop pose transport, map-backed index) is closed. Byte-equivalence is
**credible**, and the lazily-rebuilt index is **shape-identical and safely consumed**.

### Fast-pack eligibility — sound

- `fastPackPrevious` (snapshotFence.js) requires `previous.poseEpoch === poseEpoch`,
  `previous.slotRows` present, `fence.packMembership` stamp equal to
  `world.getDiagnostics()` allocations/retirements, and `packDirty/entityIds/slotGenerations/alive`
  all present.
- Counter coverage is **airtight**: the only mutators of `alive`/`entityIds`/`slotGenerations` are
  `allocateRecord` (presentationWorld.js:634-680, `diagnostics.allocations++`) and `retireSlot`
  (:720-746, `diagnostics.retirements++`, clears `packDirty[slot]` first). Both always bump after
  the write. A stamp mismatch ⇒ the world diverged ⇒ classic path. No reader could hold a slot
  view across the mint because SNAPSHOT_FENCE_BUFFERS=3 keeps latest/previous/write disjoint.
- Per-dirty-slot verify in both twins: `row>=0 && row<snapshot.count &&
  fastPrevious.columns.entityId[row] === entityId` else bail to classic walk. The Steps twin
  additionally re-checks allocations/retirements post-mint (mid-park churn → discard + classic walk).
- Single-threaded ⇒ the atomic twin cannot interleave; the Steps twin's dirty scan yields at 256-slot
  strides.

### Byte-equivalence — credible

- `rewriteAt` (presentationSnapshot.js) writes the identical column set as `write()`:
  position/quaternion/scale/entityId/archetype/flags, plus generation=0/bank=0/pitch=0 defaults
  which `setGeneration`/`setLean` then re-write identically. `blitColumnsFrom` copies **all 10**
  SNAPSHOT_COLUMN_SPECS contiguously — including `tint`, which `write()` never touches, so
  carried-forward tint bytes survive identically under both paths (the old path's write would drop
  them into the new buffer only via copyRow; journal/`setTint` have **no callers** — equivalence
  holds unconditionally).
- Classic walk still stamps `snapshot.slotRows[slot] = packedIndex` on both copyRow and write legs —
  downstream consumers see the same table either way.

### Lazy index rebuild — shape-identical, consumers bounded

- `publishedIndexByEntityId` is a frozen facade `{get,has,size}`; `rebuildIndex()` re-mints the map
  from `snapshot.columns.entityId` over count rows — the same O(count) the old eager mint paid,
  but now only on first probe of a stale buffer. The map content is identical: map[key=entityId]→row.
- Consumers are exactly two: `snapshotIndexOf` fallbacks inside `_applyPresentationPose`
  (renderer.js:26372-26400) and `_hasCompletedPresentationPose` (:26408-26434). **Both pass
  `slotHint` first**, so the presented-thread steady state resolves via `slotRows`/`ids[row]` and
  never probes the map at all. The rebuild fires at most once per buffer lifetime, on the
  hint-miss/fallback path — a cost class that exists only on membership-churn frames, and the
  Steps twin yields inside it if the async drive is packing.
- Edge honesty: a probe for an entityId not present pays O(count) rebuild + miss vs O(1) miss before
  — bounded by the same fallback sites, self-limiting.

### Two hygiene notes (latent, not reachable today)

- **G1a — dirty bit cleared before the bail check:** the fast path does `packDirty[slot]=0` *before*
  the `entityId`/row verify (`packPresentationWorldToFence` fast leg). If bail ever fired, the classic
  re-walk would copyRow those cleared-but-changed slots — one frame of stale bytes. Unreachable under
  the airtight counter coverage; still a one-line ordering fix (clear after verify) worth taking.
- **G1b — fast path clears dead-slot dirty flags; classic never does:** pure post-state difference —
  `retireSlot` clears its own flag anyway. Cosmetic.

**Verdict: MECHANISM_VERIFIED.** The landing closes wave-139 G1 as claimed; eligibility cannot
silently pass on a diverged world; slot-keyed apply is byte-identical.

## 2. G2 verification — slot-card projection consult (`50818229c`)

Mechanism landed and is wired — but the served projection is **lossy**, degrading portrait content
on the save/load screen in worker-present environments. **Landing defect.**

- `_slotIndexCache` carries `cardDatas[slot] = cardDataFromEnvelope(v.cardEnv)` minted in the scan
  (saveSystem.js:2545-2553); `slotCardData` (:5164-5171) consults before `readSlotBlob` /
  `peekSaveCardData` (saveLoad.js:851-865). Sig-keyed, dies on any write — consult can never serve
  stale.
- **The divergence:** `cardEnvFromEnvelope` (saveWorker.js:784, host twin saveSystem.js:481) reduces
  `data.player` to `{credits, activeShipIndex, ownedShips[].defId}` and the world to a lite sector —
  **no `aceMemory`, no `fittings`/`livingHull`/`heat`/`bounty`**. `cardDataFromEnvelope` (what the old
  peek path ran on the FULL envelope) preserves all of `{player, story, missions, aceMemory, meta}`.
- `buildSavePortrait` (saveLoad.js:691-718) reads `ship.fittings`, `ship.livingHull` (scars :605,
  repairs :629), `player.heat`/`bounty` (rapSheet :657), `aceMemory` (grudge :677). On the consult
  path every one of those falls to a fallback string — 'Clean plates', 'No yard repairs', 'Clean',
  'No one hunts you' — the grudge line is an unconditional false-negative whenever aceMemory carries
  one, and `fittings` renders empty.
- **Environment asymmetry:** the no-worker/timeout fallback `_prepareEnvelopeMeta` returns the FULL
  env, so portraits are complete in environments without the worker and degraded exactly where the
  optimization runs — the common case. No test pins `slotCardData`/`fillSlotDataLazy`.
- **Fix (small):** extend `cardEnvFromEnvelope` (both twins) to carry `player.livingHull`, `heat`,
  `bounty`, full `ownedShips` (with `fittings`), and `aceMemory` — still KB-scale, still bounded by
  the scan. This is a fidelity regression under the campaign's no-quality-trade rule, not a perf item.

**Verdict: mechanism VERIFIED, contract BROKEN — defect W140-G2.** One-twin field extension closes it.

## 3. Heap-floor detach machinery (N2/F2/F3/F4) — cross-lane surface

### Verified

- **F2 geometry detach — eligibility and bounds coverage:** `geometryDetachEligible` excludes
  morphAttributes and GLBufferAttribute attrs (packageCpuDetach.js); interleaved positions are
  de-interleaved into standalone BufferAttributes pre-detach; `computeBoundingSphere`/`computeBoundingBox`
  are pre-cached so raycast/bounds consumers keep CPU answers post-detach. Released attrs get
  `new ctor(0)` (never null — openingSubmissionPlan truthiness + three's resize-throw detector);
  shared InterleavedBuffers tracked via `manifest.freedBuffers` WeakSet.
- **Context-restore coverage — sound for the main renderer:** `webglcontextrestored` handler calls
  `await rehydrateDetachedPackages({ yieldToMain: yieldToBrowser })` at **renderer.js:10741**, before
  any restored-context render (env bake, compile, residency re-upload). Textures self-detect via
  three's fresh `properties` map; geometry versions bump post-refill → re-upload real bytes.
- **Asymmetry, not a defect:** `detachedGeometryUploadPending`'s `uploadedOn` ledger keys the
  renderer OBJECT, which survives context loss — so per-geometry gates are blind post-loss by
  construction; only the blanket manifest rehydrate covers geometry. Correct as designed (gates are
  for admission-time drift, restore is the blanket pass) — recorded so no later lane "fixes" it.
- **N2 secondary gates — cheap steady-state:** pipSpannerPreview:189-196 (post-compile one-shot +
  own contextlost→dispose), asteroidRenderer3d:1413-1440 (per-admission consult), shipPreviewMount:911
  (ledger post-prepare) + :1066 (`renderNow` flag-armed audit — steady state = one boolean read).
  No per-presented-frame cost. graphicsLab correctly ungated (dev-only, procedural — no package
  resources).
- **F3 shared-source accounting — sound:** `releaseSharedImageSource` frees canonical `Source.data`
  only when ALL live users are stamped resident; `releasedUsers` folds into `textureEntryReleased`
  → detached-gates see a released shared texture as pending → `rehydrateManifest` refills the shared
  Source and clears flags. `detachedManifestList()` derives correctly (any texture-released OR
  geometry-detached entry).
- **F4 source-GLB manifests — design sound:** keyed by sha256 of source bytes (`sourceDetachRefFor`
  via `imageSourceKeyAsync`), digest-verified `redecode` (force-cache refetch + `parseAsync`),
  deterministic pre-order donor pairing via `collectAuthoredDetachTextures`. Per-load cost = one
  GLB re-read + async-sliced digest — off the presented path.

### Finding W140-G3 — eager `detachOnMark` can precede first GPU upload — **UNVERIFIED risk**

`createSourceDetachManifest` marks `detachOnMark` on scenes carrying
`userData.authoredReadableFallbackLayer === true`; `markReadableFallbackLayer` (partsLibrary.js:10172+,
invoked at :4477 inside `failAuthoredPlaceAdmission` **immediately after `fallbackRoot.visible =
true`**) iterates all material texture slots calling `detachPackageTexture(value)` — whose own
contract is "call only after the texture is provably GPU-resident", enforced caller-side and
unchecked in the body.

`compilePresentSlice` and `startupGpuResidency` (:192) **skip `authoredReadableFallbackLayer`
objects entirely** — no residency pass ever stamps them, and no `detachedTextureUploadPending` gate
covers their first bind. If the fallback layer's textures were not already uploaded by a prior draw
(plausible: the layer is invisible until the same block makes it visible at mark time), the detach
empties the payload before the first upload — the next bind uploads the empty array and the texture
is permanently wrong (black/garbage), with nothing to rehydrate it.

Severity is environment-dependent (whether a prior render already bound those textures). **The guard
is one line**: defer `detachPackageTexture` in `markReadableDetachLayer`/manifest-mark unless
`textureGpuResident(texture, renderer)` — or sweep un-stamped marked textures through the residency
lane. UNVERIFIED but worth a belt-and-suspenders fix — the failure mode is silent visual corruption,
and the cost is one ledger lookup per texture at mark time.

### Finding W140-G4 — secondary contexts' own context-loss — **bounded gap**

`pipSpannerPreview` disposes on `webglcontextlost`; `asteroidRenderer3d` and `shipPreviewMount`
have **no contextlost listener** — their GL contexts can die/restore independently of the main one.
On restore, three re-uploads the emptied attribute arrays (the `uploadedOn` ledger survives on the
live renderer object, per the asymmetry above). Their admission/armed gates exist but nothing fires
them on a restore. Edge: an in-view preview whose context cycles while its geometry is detached
renders garbage until the next arm. Bounded (per-preview context loss is rare, mostly under GPU
pressure); severity low — worth a listener that re-arms the audit flag / re-runs the rehydrate gate.

### Carry-forward: render-verify's D1 confirmed

`shipPreviewMount.js` `renderNow`: rehydrate `finally` resets `uploadAuditArmed=false`,
clobbering a re-arm that landed mid-flight (content arrival re-arms while the first audit is
in-flight) → the new content's pending set never audits → draws upload emptied payloads →
three's uploader throws. Independently confirmed; render-verify owns it — flagging here as
global-visible.

## 4. Boot B1–B4 (`38faa79ca`) — verified

- ~1,927 `<link rel="modulepreload">` all carry `fetchpriority="low"`; `bootEntry.js` hoisted early
  with `fetchpriority="high"`; five station stylesheets `rel=preload as=style` (tokens/tokens.css,
  kit/fh.css, station-orbital.css, station.css, station-workbench.css) — `as=style` **fetches but
  does not apply**, so cascade is untouched and `ensureStationStylesheet` still owns activation
  (verified: warm bytes serve the later real link). latin-ext font preload dropped;
  `scripts/sync-modulepreload.mjs` accepts the attribute and `--check` covers it.
- **Caveats (marginal, not defects):** `fetchpriority` persists for the fetch's lifetime — a module
  unfetched at gate-open stays low-priority when its real import later fires (the "resume full
  bandwidth" claim holds only for already-queued fetches; the contention window is small and the
  unfetched modules are by definition the ones whose bytes didn't matter yet). B2's `high` fetch
  accelerates the bootEntry **file** only — its import graph still rides low-priority modulepreloads.
- Quality-neutral; no presented-thread cost. **PERFORMANCE_VERIFIED** directionally (bandwidth
  ordering changed as claimed); magnitude needs a cold-boot trace (UNVERIFIED).

## 5. Presented-thread hunt — between the lanes

- **Fast pack cost census:** O(capacity) `packDirty` scan + O(dirty) rewrites + `blitColumnsFrom`
  memcpy (~10 columns × count). `world.capacity` is the live-slot high-water (256→double,
  presentationWorld.js:246-293) — the scan is a single Uint8 pass, µs-class even at busy-sector
  counts; net win vs the O(active) row machinery it replaces.
- `beginFrame`'s `slotRows.fill(-1, 0, slotCapacity)` adds O(capacity) on the classic path — same
  order as the walk it accompanies; negligible.
- `packPresentationWorldToFenceSteps` yields at 256-slot strides inside the dirty scan; the Steps
  twin's post-mint counter re-check means the async drive cannot publish a torn fast pack.
- `publishSceneOwners` still fires twice per presented frame on the graph route (capture + replay) —
  adjudicated wave-139: epoch-gated, parent-chain memo per pass — bounded.
- `detachedManifestList()` walks all manifests — invoked only on context restore; not per-frame.
- `syncEntityViewsSteps` drive is byte-identical to the sync path (yields only under async drive).
- **Atomic sim work:** `src/core/registry.js`/`coreSystem.js` untouched since wave-139's audit base
  (zero-file diff 5e9efb499..3e52d86df). Standing ledger item **PR #260** unchanged: 45 ahead /
  166 behind master, last commit 2026-10-09 — still the owner-scale lever for B3/B4. Not re-reported
  as new per ledger instructions.
- **No new per-frame O(N)** found outside adjudicated machinery and lane-owned scopes. Transport is
  now journal → world-dirtyMask → slot-keyed mesh apply (3 effective hops; hop-3's map lookups are
  slotRows-gated in the steady state).

## 6. Rejected levers honored

No proposals in rejected classes (quality-degrading, mid-tick sim slicing, re-sorting captured
lists, freeing pooled scratch). The boot `as=style` preloads and fetchpriority hints are
ordering-only — no content trade.

## Verdict

The wave-140 landings hold. G1's byte-equivalence is credible and its lazy-index consumers are
bounded. G2 landed but broke the portrait contract (W140-G2) — a one-twin field extension.
The detach machinery is sound at every audited surface; the remaining exposure is W140-G3
(eager `detachOnMark` ahead of first upload — silent texture corruption if reachable) plus the
carried W140-G4 secondary-context gap and render-verify's D1 flag race. Boot wave is clean
ordering work; magnitude unquantified.

`saturated: false` — three actionable items remain outside the shipped wave: W140-G2 (saveSystem
cardEnv field extension), W140-G3 (residency gate before eager mark-detach), W140-G4 (secondary
context restore listeners). Plus G1a's latent hygiene note.
