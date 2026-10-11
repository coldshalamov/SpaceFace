# wave-144 heap-floor-verify — `8c9daef8d` (H1 serial re-collect) + `9093c6959` (BG-1 per-slot consume) verification + detach-machinery re-sweep

**audit_sha:** `e4c409d32011feb0f83b9fc9501cbd01c63aafa9` (tip of `origin/devin/1791504143-perf-w120`; `git rev-parse` after `git fetch`, audit on a detached worktree). Read-only: `git show`/`git grep` on the pinned tree plus a scratch Node harness (`node:test`-free, run outside the repo) driving `packPresentationWorldToFence`/`packPresentationWorldToFenceSteps` on fake worlds — empirical, not just textual. No code edits, no PRs, no app launch.

**saturated: false** — both commits VERIFY as implemented and empirically behave as claimed, but the re-sweep produced two live residuals: **(B)** the stepped fast pack's consumed-mark restore covers `bail`/counters-mismatch but NOT `throw`/`iter.return()` — a mid-scan fault loses marks the old fill kept (demonstrated: stale committed row ships on same-epoch retry); **(C)** the H1 miss class survives in every other collect-once consult lane — the serial covers only the works-restore consult. Neither is a correctness defect in the audited commits; both are reachable-in-principle gaps ranked below.

---

## 1. `8c9daef8d` — context-restore consult serial re-collect: VERIFIED

**(a) Leaf-module serial — no import cycle.** `imageSourceDedupe.js` has **zero imports** (confirmed — it is a true leaf). `packageCpuDetach.js` imports `bumpPackageDetachSerial` (line 24) and re-exports `packageDetachSerialNow` (line 34); `asteroidRenderer3d.js:71` takes the accessor from `packageCpuDetach`, so all three bump/compare against one counter with no cycle. Confirmed.

**(b) Bump-site completeness — every covered-release export bumps; no others do.**
- `detachPackageTexture` (`:355-416`): bumps at `:411` only when a release actually landed (`entry.detached = true` after `mipmaps = []` and/or `source.data = null`). No-op early-outs (stub textures, shared-user defer at `:371-375`, already-detached, evicted) do not bump — correct per the serial doc.
- `detachPackageGeometry` (`:505-541`): bumps at `:536` after `entry.detached = true`; position-only/no-releasable early-outs skip it.
- `releaseSharedImageSource` (`imageSourceDedupe.js:429-465`): per-user `user.mipmaps = []` bump inside the loop (`:449`) and `entry.sourceReleased = true` bump (`:463`). Note: the compressed-stub path sets `sourceReleased` with `payload == null` (flag-only release — dims stub retained) and still bumps — a benign over-bump (worst case: one bounded extra re-collect), strictly on the safe side.
- **Every payload-emptying write in the repo is inside a bumped function**: `grep -rn 'mipmaps = []|source.data = null|record.array = new'` over `src/` returns hits only in `imageSourceDedupe.js`/`packageCpuDetach.js`. `partsLibrary.js:10197` and `startupGpuResidency.js:901/919/950` releases route through `detachPackageTexture`/`releaseSharedImageSource` — covered.
- Paths that correctly do NOT bump: `rehydrateDetached*`/`rehydrateManifest` (refill-only; a bump would re-arm the consult's own race check — the serial doc calls this out, and `entry.detached` is read live at fill time `:617/:648` so in-window detaches in wanted manifests are still caught); `dropPackageDetachManifest` (eviction removes pending visibility — it cannot create unguarded emptied payloads on the consulted renderer); `noteSharedImageSourceRefilled`/test-reset seams (flag/test only); `releaseSharedImageSource` on uncovered users (skips by design — W140-D2).

**(c) Re-collect latch — bounded, no dead latch.** `consultArmedSerial` is captured synchronously at collect time inside the async body (`:1424` — async fn bodies run sync to the first await, so the capture is effectively at handler entry, after `dropGeometryGpuResidencyLedger`). The `.finally` on the **assigned** promise (`:1435-1444`): nulls the latch → serial moved + `contextRestoreRecollects < 4` → increments and re-invokes the handler (ledger drop + re-collect, both idempotent) → else resets the counter to 0. Under sustained detach churn the chain terminates after 1+4 consults; the latch then stays null and `bloom.render` (`:8847` gates on `!contextRestoreConsult`) resumes — confirmed it **degrades to heal-by-next-admission/restore, not a permanent hold**. The counter returns to 0 on every chain end, so each chain gets a fresh budget; a second `webglcontextrestored` landing mid-chain is safely swallowed (it re-drops the ledger at `:1414` before hitting the latch guard; CPU refills are context-agnostic, and the serial compare still catches releases). Verified — matches the commit's claims exactly.

## 2. `9093c6959` — steps-twin per-slot consume: VERIFIED (empirically)

Harness: `packPresentationWorldToFenceSteps` vs the atomic twin on identical fake worlds (`capacity`, `alive`, `entityIds`, `slotGenerations`, `packDirty`, pose columns, counters diagnostics).

| probe | result |
|---|---|
| Quiet pack, stepped vs atomic | byte-identical committed columns (`position/quaternion/scale/tint/bank/pitch/entityId/archetype/flags/generation`), `count` equal, journal equal, `packDirty` fully cleared |
| Mark lands mid-park on **already-consumed** slot | bit survives (`dirty[s]=1` after commit); this pack commits the pre-remark pose; next pack rewrites — **staleness bounded to one pack**, the documented self-heal |
| Mark lands mid-park on **unscanned** slot | consumed when reached — packs the new bytes **this** pack |
| Mid-walk membership break (`entityId` swap → `bail`) | consumed bits restored; classic walk then writes the *new* values — without the restore the classic copy-path would have shipped the stale committed row (direct proof the restore is what makes bail correct) |
| Mid-walk counters move (`retirements++`) | same restore path → classic walk → correct rows |

- "Can a mark land between scan and commit and still be masked?" — **No.** The loop-end→`fence.commit()` stretch runs inside one synchronous generator step (no `yield` between loop exit and commit), so the only interleaving points are the per-batch yields; marks landing there are either consumed (unscanned slot) or survive on cleared bits (scanned slot). The old `dirty.fill(0,0,scan)` on commit is gone — committed bits were already cleared at consume.
- Restored-bit semantics: `packDirty` is a `Uint8Array` whose only writers are `markPackedDirty` (`=1`, `presentationWorld.js:564`) and clears (`retireSlot:734`, pack paths) — strictly boolean; restore-to-1 is exact.
- Mark/write ordering: all three `markPackedDirty` call sites (`:451`,`:558`,`:647`) fire **after** the column writes inside one synchronous function — the parked pack can never observe marked-but-unwritten state; no async mark/write split exists in `presentationWorld.js`.
- `consumedDirty` is a fresh `[]` per fast pack — O(dirty) extra allocation vs the old `fill`; trivially small, footnote only.

## 3. Dead-slot mark lifecycle

`retireSlot` (`presentationWorld.js:734`) clears `packDirty[slot]` at retire, and live-slot marking is guarded (`assertRecordSlot`/`ensureAlive`), so in the real world a dead slot can never carry a mark. The stepped walk's consume sits **before** the `alive!==1` skip (`:634-636`), so a slot that dies between mark and scan-turn is still consumed — equivalent to the old `fill` on commit (**S6c**: dead mark + commit → `dirty=0`).

The one divergence the task names is real but bounded: a slot consumed **live** then retired mid-park has its bit restored on bail (`:658`); the classic walk's `packRow` early-returns on `alive!==1` without touching `packDirty`, so the bit lingers — empirically `dirty[50]=1` after a bail+classic walk. It clears on the **next committing fast scan** (consume again, commit leaves it 0 — S6b), and under perpetual bail it cycles consume→restore at O(1) per pack. Never-clearing dead marks are therefore a bounded dirty-scan cost, not a leak; worst case is byte-level churn during a churn streak that is already paying full classic walks.

## 4. Residuals (why `saturated: false`)

**(B) Mid-scan throw/`iter.return()` loses consumed marks — new edge introduced by the consume-at-scan design.** The restore at `:658` runs only on the bail/counters-mismatch fall-through; there is no `try/finally` in the generator. `closeCookStepsIter`/`iter.return()` on epoch-supersede or a thrown `.next()` terminates the generator mid-scan with consumed bits already cleared. Epoch-supersede is harmless (new epoch → `fastPackPrevious` null → classic walk rewrites every live row), but a **mid-scan throw followed by a same-epoch retry keeps stale rows for consumed slots**: the retry's fast scan reads `dirty===0` → skips → commits the stale row — demonstrated in-harness (`x[3]` committed 9, not the marked 321; `dirty[3]=0` forever). Pre-fix, a mid-scan throw left every bit set → the retry self-healed. Reachability requires a transient fault inside `rewritePackedRow`/column reads (deterministic faults degrade identically under the 3-fault cap either way, and moving entities self-heal on the next pose write; a static/once-written entity can hold the stale row indefinitely). ~5-line close: wrap the fast-scan+commit in `try { … } finally { if (!committed) for (const slot of consumedDirty) dirty[slot] = 1; }` — covers bail, mismatch, throw, and `iter.return()` uniformly. **Worth fixing; small.**

**(C) H1-class collect-once misses persist in the four other consult lanes — the serial covers only the works-restore consult.** Same miss shape (covered release lands between collect and bind on a payload not pending at collect): 
- `queueWorksPipelines` (`asteroidRenderer3d.js:1457-1494`) — **the designated heal lane can itself be bitten**: collect→`await rehydrate*`→compile→first real draw; a shared-source release on another renderer's sweep inside the window leaves the admitted subject's first bind throwing inside `bloom.render` per frame until the next works admission/context-restored — potentially never if the user mounts once. Window is at least as wide as the restore consult's.
- `openingGpuAdmission` reattach (`:41-105`) — window is `[post-collect filter → bind]` (the Steps-collect mid-yield releases are still caught by the post-collect pending filter); a release inside → touch-draw throws → heals next admission.
- `shipPreviewMount` audit gate (`:1093-1116`) — the `uploadAuditSeq` re-arm covers **arrivals** only; a mid-flight release does not move the seq → gate disarms → `renderNow` draws the emptied payload → throw propagates → rAF loop dies (frozen preview + console noise until the next content arm).
- `pipSpannerPreview.js:186-199` — one-shot load consult; release inside the await window → first `draw()` throws → `onError`+dispose. (No restore consult at all — `webglcontextlost` disposes the view; narrower design, consistent.)
`pipSpannerCrew.js` carries no detach/consult machinery. All four are the same class the W143 report already scoped ("any post-collect detach in an uncovered manifest misses"), fixed on the sparsest lane only; the serial exists now, so each close is the same capture-compare-recollect (~10 lines per lane, or feed the serial into `uploadAuditSeq`-style arm checks). Rank: **queueWorksPipelines** > shipPreviewMount > openingGpuAdmission > pipSpannerPreview.

## 5. Carried items (unchanged)

- Dev-only ungated renders stand: `worksScenePassProbe` (`:2041-2057`) and `renderer.render` (`:2244`) remain behind the works-proof dev flag; `captureScenePass`/`renderWorksProofMask` per W143 §3.
- `manifest.redecode()` has no timeout — a hung fetch parks the consult latch + bloom hold (freeze, not corruption); correct-by-design, unchanged.
- `contextRestoreRecollects` is per-renderer-instance state — lifecycle correct across renderer rebuilds.

**Bottom line:** `8c9daef8d` and `9093c6959` are both correct and empirically behave as specified (serial coverage is complete over the covered-release class; per-slot consume bounds staleness to one pack with exact 0/1 restore semantics). Lane is NOT saturated: residual (B) is a small worth-fixing hardening gap in the new consume design; residual (C) is the H1 class surviving on non-restore lanes at lower density — the orchestrator may doc-accept (C) given the heal cadence, but (B) deserves the try/finally pin.
