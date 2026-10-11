# wave143 audit — blind-global

Lane: blind-global (fresh eyes on the whole presented path, no lane blinders). Tip `9d752aa769f83f1544302be013c1cf4f4d3ac183` on `devin/1791504143-perf-w120`, merge base with `origin/master` = `c3521e379` (WORLD REMEMBERS spine — inside the audited tree). Read-only; findings are MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

## V1 — `cef2ba2c1` BG-1 Steps-twin fix — MECHANISM_VERIFIED, **residual found on the commit path**

The fix is real and correctly ordered: `dirty.fill(0,0,scan)` moved inside the counters-match commit branch (snapshotFence.js:642-646). On `bail` or counters mismatch the fast pack now falls through to `beginPack` with the mask intact — `packRow` reads `packDirty[slot]===0` as copyRow and `!==0` as a full write (snapshotFence.js:673-721), so in-window writes repack instead of re-blitting the last commit. The atomic twin (`packPresentationWorldToFence`, :469-505) fills after `!bail` with no interleaving possible — consistent.

**Residual — the commit path itself still masks mid-park marks on scanned slots:**

1. Fast loop scans slot<cursor and yields every `sliceEvery`=256 (snapshotFence.js:625-637); the driver parks mid-pack across presented frames — `_fencePackPending` resumes next frame under the 4ms wallet (renderer.js:28130-28180).
2. While parked, the frame's sync pass calls `markPackedDirty` on ANY pose-scalar change — `packedChanged` covers x/y/z/rot/bank/pitch (presentationWorld.js:423-425, :451, :558, :647 → markPackedDirty :563-565). Routine, not exceptional.
3. A mark landing on an already-scanned slot is never revisited. Resume → loop completes → counters still match (pose marks don't move allocations/retirements) → `dirty.fill(0,0,scan)` clears it → `fence.commit()` ships the blitted row (or a pre-park rewrite) — the post-park write never reached the snapshot.
4. Next pack sees `packDirty[slot]===0` → fast-skip / copyRow re-blasts the stale row. For an entity whose FINAL packed-byte write was that mid-park mark (settles, docks, freezes) the stale pose presents indefinitely — the identical signature BG-1 targeted, narrowed to: mark on the scanned prefix + stable counters + no further writes.

Not a regression — the pre-fix code masked strictly more (every non-bail exit). Trigger needs a world >256 slots and a multi-drive-pass pack. Fix direction: clear `dirty[slot]` per-slot inside the fast loop (drop the trailing fill) so post-scan marks survive to the next pack — restores the classic walk's self-heal semantics (mark-after-process ⇒ next pack rewrites ⇒ bounded 1-pack staleness).

## V2 — locale warm chain — MECHANISM_VERIFIED; "sub-frame" holds only for phase 4

Chain exists and is ordered correctly (gameLocalization.js:189-227): `setTimeout(warmStep,0)` phases 0 englishMessages → 1 keyByEnglishMessage → 2 localeReadiness×5 → 3 SHIPPED_LANGUAGE_ROWS → 4 warmTranslatedCatalog(locale,400). warmQueue filters on the `SHIPPED_LOCALES` const — no proxy touch at eval (pipeline.js:8).

**Sub-frame honesty:** phases 0-2 are single long tasks, not sub-frame — phase 0 pays `JSON.parse` of the ~0.9MB `MESSAGES_JSON` literal + barks + STORE_COPY merge + freeze (~30-40ms per the in-code comment), phase 1 the ~86-90ms map build, phase 2 ~15-25ms per locale. The win is they sit inside the media-gate window as isolated tasks, not inside a paint — a paint racing the chain eats ONE long task at a time.

**Consumers that can still beat the chain and pay a materialize in their own task:**
- Any `localizeText` in the first ~2 post-eval task turns pays `keyByEnglishMessage()` synchronously (~86-90ms) — every call also touches `catalogs['en-US']` via `lookup(DEFAULT_LOCALE, key)` (runtime.js:121-122), so phase-0 cost rides any pre-phase-0 call. Title-status path: menuFrames.js:57 — race narrowed from "guaranteed in title paint" to "only if title mounts within ~2 tasks of eval". MECHANISM_VERIFIED residual.
- Non-en-US first `t()` or a consumer arriving mid-warm: `lookup(candidateLocale)` → `hasOwnProperty` on the deferred proxy → FULL unsliced `buildTranslatedCatalog` synchronously — `catalogWarmState` slices are invisible to the sync path (pipeline.js:551-563 vs :642-666). `?locale=` boots run `applyDocumentLocale` at eval — guaranteed pre-warm. Design-documented ("a consumer arriving mid-warm still materializes the whole catalog"), so expected rather than a defect — but the warm slices are then wasted work.
- Dev builds: `LANGUAGE_OPTIONS = languageOptionsFor(IS_DEV)` spreads `SHIPPED_LANGUAGE_ROWS` at module eval (gameLocalization.js:68-71) → rows + 4× localeReadiness inside the eval task. Dev-only, near-immaterial.

## V3 — eval-window deferrals — MECHANISM_VERIFIED

- `22d3afa0a` modelTruth: census ships as `CENSUS_JSON` text export (modelTruthCensus.generated.js — one 2.1MB line, `--check` enforces parity with the .json source, normalizeEol'd for CRLF) materialized through verbatim-mirrored deferredObject/deferredArray + `byIdMap()` memo (modelTruth.js:36-90); post-eval one-task warm `:577-580`. Remaining eval-window work: the 2.1MB string literal still scans/interns at module eval (string intern, far cheaper than JSON.parse+graph, not zero) and the same holds for the five catalog generateds (~5-7MB JSON-as-string total across the tree). A consumer beating the warm pays one synchronous 2.1MB parse once ever — UNREACHABLE in practice, warm runs in the first post-eval task.
- `9fd313153` ruckus slicing: `templateSteps` yields between JSON.parse / atob+alloc / 256KiB copy chunks / materials / per-primitive geometry (ruckusModel.js:23-83); warm driver advances one sub-step per task (:186-209). `template()` pumps the SAME `pendingTemplates` iterator to completion — no duplicated decode; post-drain `.done` lets the warm advance cleanly (:84-97). Residuals: first `next()` still carries the whole `JSON.parse` (pre-first-yield, :27) — few-ms single task; a mid-warm consumer pays the remaining decode synchronously — by design.
- `e1e9cc24c` en-US dedupe: `englishMessages` resolves `deferredCatalog('en-US')` → `buildTranslatedCatalog` → shared `englishMergedCatalog()` memo → `catalogCache['en-US']` is the same frozen object (pipeline.js:537-551); `warmTranslatedCatalog('en-US')` resolves a cache hit (:644-648). One merge, not two. VERIFIED.

## V4 — `3148c56cd` updateMatrixWorld skip — MECHANISM_VERIFIED under the contract

`scene.updateMatrixWorld()` skipped on `capturedList` replay (three.module.js:17836); camera `updateMatrixWorld` stays unconditional (O(1), covers the non-same-camera edge). All replay guards normalized `=== undefined` → `!capturedList` (:17862, :17877, :17962, :17990) matching the `if (capturedList)` replay predicate (:17891) — a null/0 list can no longer half-guard into skipping the frustum while walking projectObject on the stale pair. The contract holds at the sole call site: spaceRenderGraph.js:427-433 — between `renderAndCaptureList` and `renderCapturedList` only `overrideMaterial`/`setRenderTarget`/`clear` run in one synchronous window, no scene mutation possible; `_renderAo` runs after the replay. Test pin updated to the normalized guard (scene-graph-freeze.test.mjs:137). What remains per replay: the O(items) pointer-copy of three captured lists — bounded by the drawable set, intrinsic.

## V5 — post-merge presented-thread hunt — MECHANISM_VERIFIED, record machinery is NOT on the presented path

- `deedRecord` (`c3521e379`): listener-only system (registry.js:593), `init` subscribes 15 receipt events (deedRecord.js:261-289); `recordDeed` is O(1)+O(64) compact on cap. **Zero live readers at this tip**: `deedsFor`/`notorietyIn`/`standingWith`/`pickDeedToTell`/`markTold`/`deedToneFor`/`deedTally`/`deedLine` have no callers outside deedRecord.js/deedPhrases.js themselves (the U-A consumers — hunter's offer, fence hearings — are only on later master commits `afd2da3c8`+, not in this tip). `deedPhrases.js` is an orphan module. `state.story.record` created lazily on first write. No per-frame reads possible.
- `stationConditions` (`967f66d6f` + `114815f4b`): reads at dock-gate (`stationGrudgeRefusal`, dockAccess.js:5), berth admit (`stationGrudge`, frontierRumors.js:120/140 — callers are sim-side mission/contract/NPC/POI decision paths, not the presented loop), prices/services (economy.js `_announceStationConditions` on dock, stationServices.js:25), UI quotes (serviceQuotes.js:272). All event/UI-driven, O(record)-small. Derived blockade reads `state.conflicts` on demand — same call sites.
- New per-frame presented work the merge brought — all feature-gated and bounded: `EmergentPayloadPresentation.update(dt)` every frame once minted — constructed only under `state.emergent.hot`, keeps updating through its retirement lifecycle; work is bounded by EMERGENT_POOL caps / 384 slots and clears to O(1) when the emergent world is cold (vfx.js:12540-12557, emergentPayloadPresentation.js:141-240). `racingGhostView.frame(race)` per frame during races — O(log n) binary-search sample + O(children) compare (racingGhostView.js:44-90, racingGhosts.js:228-237). `composeGyre` per frame gated on `state.gyreSnare || gyreComposition memory` — quiet path ~O(1) countdown; the 12-iteration `fitGroupFocus` binary search (≤2 members) runs only while beaming/holding or inside the 1.6s bowl-release window (camera.js:920-990, call site :1329-1334). `observeRacingGhost` is per-sim-step — sim-side (worker), off the presented thread.
- Merge-resolution sanity: the branch's guarded frame tail and `coreSystem` `bySectorId` index lane both survive at tip (presentationRunner.js:1297-1330, coreSystem.js:644+); master's simpler eventBus dedup did NOT clobber the branch's heartbeat machinery (the symmetric diff direction was master-behind, not branch-loss — verified at tip).

## Also noted

- `index.html` inside `22d3afa0a` carries whitespace churn on the modulepreload registry marker (cosmetic).
- ~230 file merge delta vs the branch parent — all master-side feature work (podHunt, tumbleRake, racing setpieces, U-A/U-C). Nothing ungated landed on the presented path.

## Verdict

saturated: false — one material residual:

1. **BG-1 commit-path masking** (snapshotFence.js:645): mid-park `packDirty` marks on already-scanned slots are cleared by `dirty.fill` without ever being packed — the same "final write in-window → stale pose indefinitely" class the fix targeted, now reachable only through the counters-match commit path. Narrower than the fixed bug (needs >256-slot world, a multi-pass pack, and a last-write landing mid-park) but mechanically real. Per-slot clear inside the scan loop closes it.
2. Secondary (lower materiality, mostly by-design): the ~86-90ms `keyByEnglishMessage` window is narrowed to ~2 post-eval task turns, not eliminated; mid-warm or non-en consumers pay a whole-catalog sync build (documented behavior); phases 0-2 are isolated long tasks, not sub-frame.
