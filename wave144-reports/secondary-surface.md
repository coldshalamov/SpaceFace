# wave144 audit — secondary-surface (re-verify)

Lane: secondary-surface (aux GL/DOM surfaces outside the main presented frame). Pin `9d752aa76` → re-verified at `devin/1791504143-perf-w120` tip `e4c409d32011feb0f83b9fc9501cbd01c63aafa9`. Read-only; findings are MECHANISM_VERIFIED or UNVERIFIED. New commits since pin: `8c9daef8d` (context-restore consult re-collect), `9093c6959` (snapshotFence packDirty), `e4c409d32` (self-merge delivering `8c9daef8d`).

## In-scope file delta since pin

Only `src/ui/asteroid/asteroidRenderer3d.js` moved: +23/−1, entirely inside the `webglcontextrestored` handler — the old one-line `.finally(() => { contextRestoreConsult = null; })` replaced by the serial-compare re-fire block, plus `packageDetachSerialNow` import and `contextRestoreRecollects`/`CONTEXT_RESTORE_RECOLLECT_MAX` declarations. `frame()`/render paths untouched.

**Every other in-scope file is byte-unchanged**: shipPreviewMount, asteroidScreen, pipSpannerPreview, graphicsLab, stageHull, saveLoad, shipworks (lightSaleHull), uiStage, loadingTerminalArt, introSignalRemix. No files added anywhere under `src/` in the delta.

## Asked verifications

### V1 — `8c9daef8d`: the re-collect cannot loop unbounded — VERIFIED

- **Bound is real.** `.finally` (:1436-1444): latch cleared first, then `packageDetachSerialNow() !== consultArmedSerial && contextRestoreRecollects < CONTEXT_RESTORE_RECOLLECT_MAX` → `contextRestoreRecollects += 1; onWorksContextRestored()`. Per restore chain that is 1 initial consult + ≤4 re-fires = **≤5 consults**; the `else` branch resets the counter to 0 whether the settle was quiet *or* the budget exhausted. Reset-on-quiet logic verified in code — a quiet settle arms the next restore with a fresh budget, and exhaustion degrades to the pre-fix heal-by-next-admission behavior exactly as the commit message claims.
- **Re-fires are microtask-chained, not a sync loop**: each re-invocation starts a new async IIFE whose sync prefix (serial capture + scene collects + first `await`) runs in the same microtask, and its own `.finally` schedules the next check later — the browser interleaves other work. Capturing the serial inside the async body = synchronously at consult creation; `dropGeometryGpuResidencyLedger` and the capture are back-to-back sync, so no release can slip between them.
- **No missed-release hole**: a release landing between the old settle's compare and the new consult's collect is picked up by the new collect itself (`detached*UploadPending` reads current state); one landing inside the new window bumps the serial again and is caught by that consult's compare.
- **Suppression gate**: `contextRestoreConsult` is read at :8847 (`if (!contextRestoreConsult) bloom.render(...)`). The chain extends bloom suppression by ≤4 extra consult windows under sustained detach churn — bounded, then degrades. `dropGeometryGpuResidencyLedger` inside the re-fire is Map/WeakMap `.delete` iteration — cannot realistically throw inside the `.finally`.
- **No-race path**: two counter reads + compare + reset per restore — negligible; behavior otherwise identical.

### V2 — serial bump coverage: the covered-release class is complete — VERIFIED

Bumps sit inside the four sites that actually empty payloads, so **every caller is covered by construction**:

- `releaseSharedImageSource` — per-user `user.mipmaps = []` (:449) and canonical `entry.sourceReleased = true` (:463). Callers: startupGpuResidency :902, :919, :950 — all covered.
- `detachPackageTexture` (:411, after `entry.detached = true`) — callers: startupGpuResidency :901/:949, partsLibrary :10197 — all covered.
- `detachPackageGeometry` (:536, after `entry.detached = true`) — callers: startupGpuResidency :329/:350/:438/:468/:809 — all covered.
- All early-outs precede any emptying; the `!released` / `entry.released.length === 0` returns correctly skip the bump because nothing was released. `sharedImageSourceUserCount > 1` defers without emptying — correctly no bump.
- `dropPackageDetachManifest` evicts the manifest without touching payloads — correctly no bump (payloads stay intact or were already bumped at detach). `noteSharedImageSourceRefilled` only flips the flag — correctly no bump, and a subsequent real release re-bumps.
- Repo-wide grep: no other `mipmaps = []`, `mipmaps.length = 0`, or `source.data = null` site exists under `src/` outside these two files. No bump on rehydrate paths — correct, or a consult's own refills would re-arm its race check.
- **Residual (pre-existing, not introduced by this commit)**: `detachPackageGeometry`'s release loop could leave emptied attribute records with `detached` still false if it threw mid-loop — gate-invisible *and* un-bumped. Reachable only via allocation failure in the empty-array ctor; noted for the record.

### V3 — `9093c6959` snapshotFence: outside scope — VERIFIED

Touches only `src/render/snapshotFence.js` (+14/−7, per-slot packDirty consumption in the stepped fast pack). Consumers of the module remain `src/render/renderer.js`, `src/render/webgpuPresent.js`, `src/core/runtimeWitness.js` — zero references in any in-scope file. Main presented-frame machinery only.

### V4 — drift — VERIFIED: none on the audit tip

`origin/devin/1791504143-perf-w120` stayed at `e4c409d32` for the whole audit — no boot-implementer commits mid-flight. `origin/master` advanced 20 commits to `bc40effa7` since the `d99f98c71` merge (world-remembers/claims/barks game content, tests, `tools/ui-bench*`, plus one render file `statusAttachedVfx.js` +17/−) — none merged into the audited tip and none touches an in-scope file or the detach/dedupe dependency set (imageSourceDedupe, packageCpuDetach, startupGpuResidency, partsLibrary, bloom, modelTruth all unchanged).

### V5 — fresh per-frame / newly-unbounded sweep — VERIFIED: no

The only in-scope code added since the wave143 pin lives inside the `webglcontextrestored` event handler — event-driven, one-shot, bounded as V1. `asteroidScreen`'s `frame()` remains byte-identical (sole always-on aux GL loop, by design); `renderer3d.render` call sites unchanged. `bumpPackageDetachSerial` is a counter increment on rare residency-release paths — never per-frame. No new aux surfaces, rAF loops, or unbounded queues entered the scope since the pin.

## Verdict

`saturated: true`. The single in-scope mechanism (`8c9daef8d`) verifies clean: the re-collect is bounded at 5 consults per restore with correct reset-on-quiet and exhaustion semantics, the serial covers every payload-emptying site by construction, and the no-race path is unchanged. `9093c6959` is confirmed main-frame-only, no drift landed mid-audit, and nothing new rides any aux-surface frame.

This is the **third consecutive saturate** on this lane (wave141, wave143, wave144) — per the campaign rule the secondary-surface lane **closes**.
