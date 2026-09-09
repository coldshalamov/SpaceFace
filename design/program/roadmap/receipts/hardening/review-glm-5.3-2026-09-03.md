Read-only review complete. Diff is applied uncommitted in the working tree (`git status`: 4 modified files + new test). Answer:
## 1. What the diff does
- **assetLoader.js** — each authored runtime gets an `AbortController` + `generation` counter (diff 205-225); `retireAuthoredAssetRuntime` aborts the controller, bumps generation, and synchronously disposes the render-package cache *before* awaiting owned tasks (diff 26-43); the registry bumps a per-renderer generation on create/dispose (diff 48-65).
- `loadAuthoredPart`/`loadAuthoredRenderPackagePilot` gate admission and post-await continuations on generation/retire/`options.signal.aborted`, thread `runtime.signal` into `loadGltfDocument` (fetch abort) and `renderPackages.load`, race the caller's signal via `waitForAuthoredAssetTask`, and treat AbortError as eviction, not recorded failure (diff 96-148, 227-257, 265-302).
- `disposeAuthoredAssetRuntime` moves `disposeAssetResidency` from a post-retirement `.finally` to synchronous, before tasks settle (diff 152-164).
- **assetResidency.js** — permanent `disposed` flag + `registryGeneration`; `disposeAll` closes the generation first; `registerAsset` throws when disposed; `retain`/`beginRequest`/`shouldDecode`/sector/context handlers fail closed (diff 311-429).
- **partsLibrary.js** — every enqueued boundary upgrade gets an owned AbortController + composed caller/queue signal on a copied options envelope (diff 573-609); new `disposeAuthoredUpgradeQueue` cancels queued + in-flight jobs, settles receipts, actually cancels the rAF handle (diff 620-700); `admitNextUpgradeJob` wraps `isResidencyOwnerActive` with `jobIsActive` and passes `{signal, isActive}` into `run()` (diff 786-816); `disposeAuthoredPartLibrary` retires renderer-owned maps/leases (diff 501-532).
- **pipelineReadiness.js** — both admission trackers gain dispose/generation: queued/pending receipts resolve `{skipped, cancelled, reason}`, timers + resume handles cancelled, late compile completions ignored per generation; GPU-residency entries compose caller + owned signals and re-observe late work to avoid unhandled rejections (diff 1004-1365).
- **Behavior changes vs HEAD:** package-cache disposal and residency disposal move earlier (during, not after, task settlement); `registerAsset` on a disposed registry throws instead of silently zombie-registering; `run()` handlers get a new argument; rAF handles are truly cancelled instead of token-no-op'd.
## 2. Why the test at line 225 fails
The test is right; the diff drops the external signal. `loadAuthoredRenderPackagePilot`'s createTask passes only `signal: runtime.signal` into `runtime.renderPackages.load` — **diff line 238** (live `assetLoader.js:955`). `options.signal` is used only for the pre-check (diff 233) and the post-await race `waitForAuthoredAssetTask(task, options.signal)` (diff 255, live 971), which abandons the *caller's* await but never aborts the signal the package loader captured. So `effectiveSignal` is literally `runtime.signal`; `external.abort()` leaves it unaborted → `false !== true`. The second half of the test (retirement aborts effectiveSignal, live 243-245) passes only *by accident* because effectiveSignal is the runtime signal. `combineAbortSignals` was added to partsLibrary.js (diff 438-473) and pipelineReadiness.js (diff 1007-1042) but not to assetLoader.js — the one place the test exercises it.
## 3. Default play route exposure
- **Mostly latent:** `disposeAuthoredPartLibrary`/`disposePartsLibrary` (partsLibrary.js:289-315), `disposeAuthoredUpgradeQueue` (3306), and tracker `dispose`/`cancel` have **no production callers** — only the test calls them. Nothing invokes them during boot or flight, so the queue/tracker teardown paths cannot fire on the default route yet. Meanwhile the red test breaks `check:baseline`/`check:all` merely by being in the tree.
- **Wired and changed:** `disposeAuthoredAssetRuntime` is called from `shipPreviewMount.js:1013` and `worksPartLoader.js:1036` (player-reachable unmounts). Residency now disposes *before* owned tasks settle (diff 152-164); a task still inside `compileBlueprint` then hits the new `registerAsset` throw (assetResidency.js:116, reached from assetLoader.js:1207). That throw was a silent zombie-registration before; now it must be caught by the `.catch` at live 959-967 — any escape path inside `renderPackageLoader` internals becomes an unhandled rejection on a player route.
- **Silent no-op risk:** `upgradeBoundary`'s new `authoredBoundaryPreparationActive` checkpoints (diff 875, 883, 891, 899, 907) return false *without* `handleAuthoredBoundaryAdmissionError` (diff 915-918) — a transiently false `isResidencyOwnerActive()` (residency pressure / sector rotation) mid-upgrade leaves the boundary in `authoredAssetState: 'compiling-pipelines'` on fallback with no diagnostic. Previously a false predicate only skipped decode admission.
- **Dormant poison:** `loadCanonicalLibrary`'s `isResidencyOwnerActive` went from `() => true` to a generation check that *throws* on mid-load bump (diff 945-952); `ensureEntityLibrary`/`admitEntityPlan` silently early-return (diff 967, 983). Generations only bump via functions with no runtime callers today — dormant, but the throw lands in a memoized promise when triggered.
- **Not risks:** double-settle is guarded (`settleUpgradeJob`, partsLibrary.js:3628-3638); dispose functions are idempotent; the enqueue dedup path disposes its just-created signal binding (diff 613-616); `waitForAuthoredAssetTask` removes its listener in `finally`. One soft spot: the `jobIsActive` wrap is skipped for non-extensible options (diff 796-801), leaving only the signal as the death signal for frozen options.
## 4. Verdict: `LAND-WITH-FIX`
Minimal fix — compose the two signals in `loadAuthoredRenderPackagePilot` (assetLoader.js needs the same `combineAbortSignals` helper already duplicated in the other two files; single-signal callers keep today's exact behavior since the helper passes a lone signal through):
```diff
--- a/src/render/assetLoader.js
+++ b/src/render/assetLoader.js
@@ -949,9 +949,11 @@ export async function loadAuthoredRenderPackagePilot(runtime, pilot, url, option
   if (!runtimeIsActive(runtime, runtimeGeneration)) return null;
   if (!loadOptionSignalIsActive(options)) return null;
-  const task = admitAuthoredAssetTask(runtime, cacheKey, () => (
-    runtime.renderPackages.load(pilot.metadataUrl, {
+  let packageSignals = null;
+  const task = admitAuthoredAssetTask(runtime, cacheKey, () => {
+    packageSignals = combineAbortSignals([runtime.signal, options.signal]);
+    return runtime.renderPackages.load(pilot.metadataUrl, {
       expectedContentHash: pilot.expectedContentHash,
       ...(pilot.flightStaticV3 === true ? { expectedRuntimeHash: pilot.expectedRuntimeHash } : {}),
-      signal: runtime.signal,
+      signal: packageSignals.signal,
     }).then((renderPackage) => assembleRenderPackageRecord(renderPackage, url, pilot.assetId, {
       flightStaticV3: pilot.flightStaticV3 === true,
     }))
@@ -964,8 +966,9 @@ export async function loadAuthoredRenderPackagePilot(runtime, pilot, url, option
         }
         return null;
-      })
-  ));
+      })
+      .finally(() => { packageSignals?.dispose?.(); });
+  });
   if (!task) return null;
```
(plus the 36-line `combineAbortSignals` copied from pipelineReadiness.js:4-41, or exported from one owner). The composition aborts only the derived controller, so test lines 229 and 246-247 (source signals stay independent) hold — same property the queue/tracker composers already pass at test lines 133-134 and 401-402.
## 5. Confidence: medium-high
The line-225 diagnosis is mechanical (live `assetLoader.js:955` passes only `runtime.signal`; the composer exists in two sibling modules but not here). What would raise it to high: after applying the fix, `node --test test/render-async-disposal.test.mjs` goes green, then `npm run check:baseline --list` → run the opening/render-package subset (e.g. `--only=opening-mesh-defer,render-package-plan` if those names exist), and `npm run probe:runtime-witness` for boot evidence; plus one headed open/close of ship preview and Asteroid Works to confirm the earlier `disposeAssetResidency` + `registerAsset`-throw ordering produces no unhandled-rejection console noise. Confidence that the *unwired* dispose paths are safe to land is medium — they're test-only until a renderer-teardown caller exists.
exit=0
