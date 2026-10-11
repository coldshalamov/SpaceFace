# wave-140 audit — lane `popin-verify`

**Audit SHA:** `50818229c84c6f3055f125b4d6b46c468ef8b07c` — tip of `origin/devin/1791504143-perf-w120`
("perf(wave139-G2): lazy slot fill consumes the scan's card projection").
**Delta vs wave-139 audit base** (`63516afff`): exactly three commits, six files — `index.html`,
`src/render/packageCpuDetach.js`, `src/render/post/spaceRenderGraph.js`, `src/save/saveSystem.js`,
`src/ui/screens/saveLoad.js`, `vendor/three.module.js`. Every other admission-surface file
(`renderer.js`, `assetResidency.js`, `assetLoader.js`, `partsLibrary.js`, `renderPackageLoader.js`,
`startupGpuResidency.js`, `openingGpuAdmission.js`, `decodeTaskBudget.js`, `sectorEnterDefer.js`,
`test/asset-residency-sector-claims.test.mjs`) is **byte-identical** to the wave-139 base, so every
prior verdict carries forward unless the delta itself reopened it — checked below hunk by hunk.

**Working-tree note:** checkout sits on `master` at `324a6032` (another lane's work) — all reads via
`git show`/`git grep` at the pinned SHA. The sector-claims probe suite was re-run live against files
extracted at the audit SHA into a shadow tree (`/tmp/sf-audit`, real `three` junctioned): **8/8 pass**.

`saturated: true` — third consecutive, verified line-by-line, not carried.

Evidence labels: MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

---

## 1. W137/W138 machinery — re-verified at `50818229`, all PASS

### V1 — residency claim-liveness dominance — MECHANISM_VERIFIED (probe: 8/8)
- `assetResidency.js:870-888` `sectorClaimStamp`: arm-class stamps early-out at `:878` when the sid
  already holds a live claim — a re-approach prewarm cannot demote an immortal claim to a lapse-able
  ats stamp (W137 F-1). Live posts mint `sectorLiveClaims` membership + delete any ats row (`:884-887`).
- `claimArmClass` classifies by posting (`:865-868`: `SECTOR_ARM_CLAIM_ROLE` role regex OR
  `decodeWarm===true`) — an arm post on a shared non-arm row mints a lapse-able claim, a live post
  on an arm-minted row mints immortal, per the probe's posting-class vectors.
- `sectorClaimFresh` (`:900-906`): live claim → fresh; missing stamp → fresh (pre-P2 rows);
  arm stamp lapses at `SECTOR_CLAIM_STALE_MS = 120000` (`:847`).
- `unionOwnerSector` (`:948-987`) still prunes lapsed members before every new-member add (`:968`)
  and amortizes the same-sid re-post sweep at `SECTOR_CLAIM_PRUNE_INTERVAL_MS = 30000` (`:961-965`);
  `pruneLapsedSectorClaims` (`:908-927`) drops the member, both stamp containers, the index row via
  `unindexOwnerSectorRow` (`:929-941`), re-points the `sectorId` scalar, and bumps
  `ownersVersion`/`residencyMutationSeq`.
- All four exit-warm mint sites run `exitWarmQualifies` → `hasLiveSectorClaim` (`:2012-2028`):
  `rotateSector` `:1989`, `prepareSectorExit` `:2043`, `prepareSectorExitDeferred` `:2088` (filtered
  at iterator mint), `rotateSectorDeferred` `:2147`. Save path (`includePlayer:true` →
  `save-restore-hold`, `:2030-2034`) runs the identical freshness gate.
- Probe re-run at the extracted SHA: `test/asset-residency-sector-claims.test.mjs` 8/8 — covers all
  four mint sites, posting-class vectors, W137 F-1 liveness dominance, F-2 concurrent commit union,
  horizon-clamp on long-pending requests.

### V2 — spec-consume generation guards — MECHANISM_VERIFIED (strengthened since W139)
- `saveSystem.js:5055`: the loadAsync re-check is now **unconditional** —
  `if (_saveStoreGeneration !== latchGen)` re-reads `localStorage` and re-prepares whenever a
  tracked store write landed anywhere in the rollback-capture + worker-roundtrip window. The
  wave-139 form was scoped to `specHit || specByteHit`; commit `5e9efb499` closed the spec-miss
  `raw` hole (a miss's own getItem predates the same window). One integer compare on the common
  path — verified in the commit diff and at the SHA.
- `_pendingSlotRearm` settle (`:399-417`) still fires only while a live STALE arm owns the slot:
  `live.slot === pending.slot && live.sig !== 'gen:'+_saveStoreGeneration`; disarm kills the timer
  and the raw (`:2772-2778`) so no parked re-arm can resurrect a dead arm or steal a fresh one.
- Same-slot bursts coalesce into ONE deferred re-arm carrying the freshest write's bytes
  (`pending.raw` refreshed per bump, dropped at dispatch).

### V3 — bounded save caches — MECHANISM_VERIFIED
- `_sharedStoreCollectCache` (`:627-633`) is single-entry and stamped only when
  `_saveStoreGeneration === genAtCollect` — a foreign write mid-apply discards the stamp rather
  than serving pre-write bytes.
- `_slotIndexCache` is sig-keyed and re-minted wholesale (`:2382`, `:2441`, `:2600`, `:3221`);
  every reader except `slotCardData` gates on `cache.sig === 'gen:'+_saveStoreGeneration`
  (`:2287`, `:2397`, `:2455`, `:2598`) — see observation O2 for the one exception (save-lane, not
  admission). `cardDatas` (`:2511`, `:2551`, `:2600`) lives and dies inside the sig-keyed entry —
  bounded by slot count.
- Per hitch-verify's census (wave-139, unchanged here): `_decodedSaveEnvelopes` FIFO ≤8,
  `MAX_WORKER_SESSIONS = 4` with FIFO evict on both begin ops.

### V4 — dead `spacefaceDecodeClass` read removed — MECHANISM_VERIFIED
- `assetLoader.js:421-424`: the KTX2 pooled post's `decodeClass:` is `activeDecodeClass()` outright,
  with a comment documenting the dead field. Repo-wide grep at the SHA finds `spacefaceDecodeClass`
  only in that comment — no writer, no reader. The pooled post can only read the ambient class at
  post time; the latent class-smuggling channel is deleted. The `deadlineJoin` promote +
  strongest-class retention (`:809-833`, package-pilot `:673-692`) is untouched.

---

## 2. Newly landed code under the popin lens — audited, no vector opened

### N1 — render-list replay + AO-off branch + depth-gated capture — MECHANISM_VERIFIED clean

`spaceRenderGraph.js:425-441`: AO on → `renderAndCaptureList` renders pass 1 to `sceneTarget`, the
captured sorted list replays into `normalTarget` under `scene.overrideMaterial = normalMaterial`;
AO off → plain `renderer.render()` — exactly the pre-PERF-138 shape, capture never armed.

Popin-relevant facts:
- **The capture is same-frame and synchronous.** `captured` is a local inside
  `SpaceRenderGraph.render()`; capture→replay cannot interleave with any async admission, mesh
  reveal, or residency commit. There is no cross-frame retained list — `_sfCapturedList` is nulled
  at capture start (`vendor/three.module.js:18081`) and consumed only through the `captured` local.
- **The replay reproduces the identical drawable set.** Capture happens AFTER `finish()` + sort +
  `background.addToRenderList` (`:17910-17927`), so background items ride the replay exactly as a
  real second pass would. The only elision is `isInstancedMesh && count <= 0` (`:17896`) — invisible
  by definition in the same epoch.
- **Pass 2 deliberately skips `projectObject`** (`:17879` branch): no light collection, no
  `objects.update`, no `frame++` (`:17941`). Correct by construction — the override normal material
  consumes no lights, the shadow pass would be pure waste for a normals target, and pass 1 already
  ran `objects.update` for every drawn item this frame.
- **Depth gate** (`:17924`: `renderListStack.length === 1`): a render nested inside pass 1
  (CubeUV first-time conversion, transmission pass) pushes a second list — it can no longer
  overwrite `_sfCapturedList` and replay the wrong scene's items. Fixes the C1 mechanism; verified
  the stack is pushed per render at `:17851`-region so length===1 holds only at the outermost frame.
- Mesh-level `onBeforeRender` hooks (gasVolumeField, instancedSpritePool, deepFieldStars,
  foldAberrantVisual, gyreSnare veil) fire per replayed item — identical to the old double-render.
  The scene-level `dynamicBufferRanges` wrapper updates attribute ranges on both passes without
  touching the drawable set. Contract holds.
- Edge, unreachable: `renderAndCaptureList` returning null (context-lost/invalid camera → both
  passes early-return identically) → `renderCapturedList(null)` would re-walk fully and skip
  `frame++`. Cannot occur top-level; immaterial.

**Popin verdict:** the presented color pass is a full `projectObject` walk on both routes; nothing
in the replay can omit, delay, or substitute a mesh on-stage. No late-pop channel, no LOD channel.

### N2 — `packageCpuDetach` freedPayloads Set→WeakSet — MECHANISM_VERIFIED, admission-neutral

`packageCpuDetach.js:81` (mint), `:161-176` (the only consults), `:275` (re-mint on rehydrate —
WeakSet has no `clear()`). Repo-wide grep: `freedPayloads` appears ONLY at those five sites — no
`.size`, no iteration, no other reader. The `.has/.add` dedupe semantics are preserved verbatim, so
the freed-byte diagnostic counts identically.

The question the brief poses — does popin admission change now that payloads are actually
collectible? **No, and the reason is structural:**

- The WeakSet never held anything UP. Detach already unlinks payloads from the texture
  (`texture.mipmaps = []`, `source.data = null`, `:163-177`); the strong Set was retaining corpses
  for a diagnostic that re-counts by identity. What changed is only that unreferenced payload
  objects can now be GC'd — the intended phantom-reclaim fix (W139-N1).
- **A payload can only be collected when nothing live references it.** Parser-clone textures made
  pre-detach share the same mip records via `copy()` slicing the array, not the buffers — a live
  clone holds the records and keeps them uploadable; a dead clone drops them with the clone. GC
  cannot take a payload a live user still needs — by definition of reachability.
- **Every presented-draw path that could re-enter the uploader still rehydrates first**, unchanged:
  `openingGpuAdmission.js:51,55` (cohort pre-touch), `renderer.js:12030/:12051/:12059` (cohort +
  Steps-twin async scan), `renderer.js:12658` (exact-target touch seam — rehydrate, then
  reveal+touch in the continuation), `renderer.js:10737` (context-restore runway before any
  restored-context render). `detachedTextureUploadPending` (`packageCpuDetach.js:226-234`) mirrors
  three's setTexture2D gate (version moved, or properties record freed by dispose).
- **The residency pass can never push empty mips**: `startupGpuResidency.js:848` counts a detached
  texture resident and skips it; `:836` retries detach on stamped rows so dedupe-sibling-shared
  payloads release at the earliest legal point (`sharedImageSourceUserCount(texture) > 1` defers at
  `packageCpuDetach.js:149`).
- Rehydrate refills whole manifests serially (`rehydrateManifestOnce` dedupes concurrent callers);
  `texture.needsUpdate = true` inside `rehydrateManifest` (`:264`) is paired with the re-attach, so
  the restore's own version bump is consumed by the intended re-upload.
- The one genuinely new property is a mild positive: payload reclaim is real now, so detached
  packages actually lower retained heap → marginally less eviction/re-decode pressure on the
  residency system. Admission timing is otherwise untouched.

Residual check — can anything outside the four gates bump `version`/`needsUpdate` on a detached
package texture? Grepped all `needsUpdate` writes under `src/render/**`: package textures take them
only inside `rehydrateManifest` and at decode time (`GLTFLoader.js:105`, before manifests exist).
All other hits are materials, attributes, or procedural DataTextures/canvas textures that never
carry the `spacefaceCpuDetach` mark. `renderPackageLoader.js:1300` dispose paths run under
evict/abort where the manifest is dropped first (`:345`, `:467`). **No ungated re-upload route.**

### N3 — `saveSystem` slotCardData consult + `saveLoad` lazy fill — verified, no admission interaction

- `saveSystem.js:2511-2551`: the validation scan retains `cardDataFromEnvelope(v.cardEnv)` per slot
  into `cardDatas`, stored on the sig-keyed `_slotIndexCache` (`:2600`); `slotCardData(slot)`
  exposes it (`:5168-5171`). `saveLoad.js:851-865`: `fillSlotDataLazy` consults it before
  materializing the blob / posting it to the worker — the exact fix blind-global's W139-G2 asked
  for. Miss falls through to the worker peek + sync tail unchanged.
- Admission interaction: none. This is save/load-menu card projection; it mints no warm/arm post,
  touches no residency row, and runs off the flight path. Bounded (dies with the sig-keyed cache).
- See O2 below for a narrow stale-serve window on the new accessor — save-lane observation only.

### N4 — `index.html:2060` `fetchpriority="high"` on the boot-gate mp4 — cross-lane note

The gate video jumps the ~1,927 modulepreload hints on a cold remote link (boot-verify F2's fix).
It contends with the hint window, not the GLB/texture window (module evaluation precedes asset
fetch), so no popin-admission cost. Recorded for completeness; owned by boot lane.

---

## 3. Remaining-hunt sweep — no live popin vector found

Beyond verifying the delta, the rejected candidates from wave-139 were re-checked: every file they
name is byte-identical, so the verdicts carry — `emit()` head-shift, pre-consult `await runtimeFor`,
warm-evaluator stub rebuilds, `entryCorridorRank` in the sort comparator, `hasLiveSectorClaim`
cost, the `_reconcileMeshResidencySteps` paced sweep, `kickDecodeRunwayAssetsSteps` memo mints,
owner-scoped warm-post churn, `visibilityHolds` memoed consults.

New-code-adjacent checks run this wave:

| Candidate | Verdict | Why |
|---|---|---|
| Replay omits a mesh admitted mid-frame | not possible | capture→replay is synchronous in one `render()`; no async admission can interleave (`spaceRenderGraph.js:425-434`) |
| Nested render clobbers `_sfCapturedList` | closed | `renderListStack.length === 1` gate (`three.module.js:17924`) — C1 mechanism verified fixed |
| Replay skips light/shadow collection → wrong draw | by design | override normal material consumes no lights; skipping shadow pass saves real work, output identical (`:17879-17902`) |
| Detached texture re-uploaded on a presented frame | gated | all four bind routes consult `detachedTextureUploadPending` and rehydrate first (`openingGpuAdmission.js:51`, `renderer.js:12030/:12051/:12658`, `:10737`); residency skips detached rows (`startupGpuResidency.js:848`) |
| WeakSet drops a payload still needed | impossible | reachability: only unreferenced payloads collect; clones hold shared mip records by slice-copy |
| WeakSet API misuse (.size/.clear/iterate) | absent | five touch sites total, all `.has`/`.add`/re-mint (`packageCpuDetach.js:81,:161-176,:275`) |
| `version`/`needsUpdate` bump on detached texture outside gates | none found | all `needsUpdate` writes under `src/render/**` audited — package textures bump only in `rehydrateManifest` and at pre-manifest decode time |
| `fetchpriority="high"` starves GLB fetch window | no | contends with modulepreload hints, which precede asset fetch (`index.html:2060`) |

Rejected levers (quality-degrading — out of scope), unchanged: raising
`SECTOR_CLAIM_STALE_MS`/dropping the amortized prune (re-admits the lapsed-claim exit-warm bug the
tests pin); partial per-texture rehydrate (GLB is monolithic — ordinal pairing requires the whole
re-decode); raising authored-admission `inFlight` (re-introduces two-composes-per-frame hitching on
soft GPUs for ~zero wall-time gain — A/B'd at `scheduleUpgradeFrame`).

---

## 4. Observations (verified, NOT material — reported for the next wave)

- **O1 — `assetResidency.js:882`**: `metadata.sectorLiveClaims.delete(sid)` after the `:878`
  early-out remains unreachable (if `live.has(sid)` the function already returned). Harmless
  defensive no-op. Carried from wave-139.
- **O2 — `saveSystem.js:5169` `slotCardData` does not sig-check** (save-lane, NOT admission): every
  other `_slotIndexCache` consumer gates on `cache.sig === 'gen:'+_saveStoreGeneration`; this one
  serves `cache.cardDatas[slot]` unconditionally. A write to slot X bumps the generation but leaves
  the gen-N cardDatas live until the next validation scan re-mints — a lazy fill racing in between
  can serve the pre-write projection for that slot. One-line guard fixes it
  (`cache.sig === 'gen:'+_saveStoreGeneration`). Bounded staleness on a menu card — the same class
  the code already accepts ("a stale card only ever costs the same click-time fallthrough",
  `:2449-2451`). Flagging for the save lane; zero popin surface.
- **O3 — `saveSystem.js:3221`**: the slot-delete re-mint drops `cardDatas` (conservative — miss
  falls to worker peek). Consistent, but loses the memo for the surviving slots until re-scan.
  Immaterial.
- **O4 — `packageCpuDetach.js` `detachedSources` stays a strong Set** of Source shells (payload
  already null'd — small objects, not the phantom class N1 fixed). Heap-floor territory if they
  want the symmetric treatment; not an admission item.
- **O5 — provenance assumption, carried**: the merge path still applies this posting's arm class to
  every unioned sid (`:409-417`); no caller forwards pre-stamped maps today. Contract fragility,
  not a live bug (noted at wave-139).

## Verdict

`saturated: true` — third consecutive for this lane. W137/W138 machinery verified live at the
pinned SHA (8/8 probe on the extracted tree); all three new commits traced hunk-by-hunk and none
opens an admission-timing, late-pop, or LOD-substitution channel; the remaining surface is
byte-identical to the prior verified base.
