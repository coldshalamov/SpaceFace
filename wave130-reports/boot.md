# wave130-reports/boot.md — boot-loading lane

Audited `devin/1791504143-perf-w120` @ `5a020b909` (W129 close-out + W130 popin `46ef3e012`). Read-only audit; no app launch; SwiftShader box, so GPU/frame-time claims are hardware-unverified by construction.

**saturated: false** — three material main-thread legs remain in lane scope, all in the consult/validation fan-in W129 built.

## Findings (ranked by evidence × impact)

### B-130-1 · Card rebuild re-parses every untrusted blob on the main thread — the worker verdict is gate-only (MECHANISM_VERIFIED, impact H on untrusted consults)

Evidence: `saveSystem.js:2619` (`_scanStoredSlotsAsync`) and `saveSystem.js:2711` (`_scanRecoverySlotsAsync`) — after the `restore_prepare_meta` worker verdict resolves ok, the slice `.then` runs `this._prepareEnvelopeMeta(raw)` — the full atomic chain at `saveSystem.js:2506` (JSON.parse → fmt → `readSaveVersion` → `preflightSaveImport` → fnv1a checksum over `safeStringify(env.data)` → `runMigrations` → `normalizeRestorableData`). `saveWorker.js:750-757` deliberately strips `env` from the meta verdict ("the multi-MB envelope clone must not cross postMessage"), so the card at `slotCardFromEnvelopeData` (`saveSystem.js:7352`) can only be built by re-parsing on main. The publish leg of `_scheduleSlotIndexValidation` pays the same per verified-card-less blob (`saveSystem.js:~2404`, `const env = this._prepareEnvelopeMeta(primaryRaws.get(...))` inside the merged loop — no yield between them).

Mechanism: every untrusted blob (index card missing, `_blobHash` mismatch, or foreign write) costs **two** parses — one on the worker, one atomic on main. On a click that lands inside the untrusted window (post-save before validation republishes, cleared index, first consult), Continue pays K atomic multi-MB meta passes, paced only by the slices-of-4 yields. This is the largest atomic leg left on the click→veil chain.

Fix sketch: have the worker build the card itself — `restore_prepare_meta` already computes `prepared` in-worker; run the `slotCardFromEnvelopeData` equivalent there and post back `{ok, card}` (~1KB, not the env). Scan/publish consume `verdict.card` when present; main-thread `_prepareEnvelopeMeta` stays only as the no-worker fallback. Zero quality change; sim untouched.

Effort M · Impact H (untrusted-window consults) / L (trusted steady state) · Risk: low-moderate — worker must duplicate `slotCardFromEnvelopeData`'s field set (it already imports the save-side helpers; the card fn is exported from saveSystem.js, so a shared helper or an inline card builder keeps the shapes identical). Fallback path preserves current behavior for corrupt blobs via `_peekSaveEnvelope`.

### B-130-2 · On a saturated/wedged worker the consult pays the meta parse twice per blob, and the background validation fans workers out unbounded (MECHANISM_VERIFIED — this is the hunt-(d) answer)

Evidence: `_prepareEnvelopeMetaAsync` (`saveSystem.js:4763`) — on timeout (`timeoutMs: 2500` at 4783) or failure, `settle(null)` → `.then` at 4787-4790 runs **sync** `_prepareEnvelopeMeta(raw)` and returns `{ok:true|false}` — the prepared env is discarded. Back at `saveSystem.js:2619`, `verdict.ok` then triggers `this._prepareEnvelopeMeta(raw)` **again**. So each timed-out blob pays: worker attempt + atomic main parse (discarded) + atomic main parse (card). K wedged blobs → ~2K serialized atomic parses inside the consult, spread only by the slice yields.

The deadline does not strand — it falls through to sync correctly — but the fallthrough re-does work it already did and discards it.

Second leg: `_scheduleSlotIndexValidation` (`saveSystem.js:2374-2381`) collects `jobs` for every untrusted blob and `await Promise.all(jobs)` with no slice bound; `_checkoutSaveWorker` (`saveSystem.js:3988-4000`) spawns a fresh worker per concurrent request when the warm one is busy (`_trackSaveWorker(_createSaveWorker())`, no queue). A store with K untrusted blobs fans out K worker spawns during menu dwell — worker-process churn (each terminated on timeout via `_releaseSaveWorker`) that can also contend with the click consult's own dispatches, pushing it into the double-parse leg above.

Fix sketch: (a) bound the validation `jobs` fan-out with the same slices-of-4 + `_restoreFrameYield` the consult uses; (b) have the timeout fallback return the parsed env (or card, per B-130-1) instead of `{ok:true}`, so the caller never re-parses; (c) keep a small worker pool bound (e.g. cap concurrent save workers ~2-4) rather than spawn-per-request.

Effort M · Impact M (pathological/saturated case; healthy path unaffected) · Risk: low — pacing and fallback reuse only; verdict semantics unchanged.

### B-130-3 · Save/Load row pick pays 2 atomic getItem + one full multi-MB JSON.parse per selection (MECHANISM_VERIFIED, hunt-(b))

Evidence: `_select` (`saveLoad.js:1124`) fires on every row pick, `focusin` walk (1089), filmstrip `onScrub` (829) and arrow-key move; it emits `save:loadSpeculationTarget` (1138) and calls `_renderStage` (1141). Two atomic legs per pick on a multi-MB store:

- `_renderStage` → `readSlotSaveData(ctx, id)` at 1150 → `localStorage.getItem(LS_PREFIX + slot)` + `JSON.parse(raw)` + `unwrapSaveData` (`saveLoad.js:766-772`) — a full envelope materialization on the UI thread, purely to feed `buildSavePortrait`. `_render` itself ends in `_renderStage` (1121), so every bus-driven re-render (`save:slotsValidated`, `save:store-synced`, `save:completed`, post-delete/save re-renders at 936-945/1380/1413/1446) re-pays the parse for the selected occupied slot.
- The `save:loadSpeculationTarget` emit → `speculateLoadPrepare` (`saveSystem.js:2485-2497`) → `localStorage.getItem(LS_PREFIX + slot)` again (2494) — a second atomic multi-MB read; sig+slot gating makes only *new* rows pay it.

Scrubbing the filmstrip or arrowing the list therefore costs ~2 getItem + a full parse + `buildSavePortrait` per row crossed.

Fix sketch: memoize `readSlotSaveData` per (slot, write-generation or raw identity) — the store already stamps `gen:` sigs; or build the stage portrait from the slot's index card + the armed spec's `prepared.data` once the envelope resolves (the spec promise already holds it). The spec arm could take an optional `raw` so the screen's own read feeds it. All fixes are dwell-quality only.

Effort S-M · Impact M (screen dwell fluidity; not on click→veil proper) · Risk: low — portrait content unchanged; cache key must track writes (use `_saveStoreGeneration`/raw reference).

### B-130-4 · `_slotIndexWithFallbackAsync` mid-ride re-sign recursion reuses the stale-stamped burst (MECHANISM_VERIFIED — correctness in W129 machinery, perf-neutral)

Evidence: `saveSystem.js:2239-2252`. When `burst` is supplied, line 2240 `Object.assign(burst, await this._slotStoreSignatureAsync())` stamps `burst.sig`/`burst.raws` with the **first** signature. If the in-flight validation ride settles without publish (gen moved mid-ride), line 2251 computes `fresh = await this._slotStoreSignatureAsync()` — a full fresh collect — sees `fresh.sig !== sig`, and recurses `this._slotIndexWithFallbackAsync(burst || null)` (2252). The recursive call short-circuits at 2239 (`burst && burst.sig != null ? burst`) because `burst.sig` still holds the *stale* sig: the fresh collect is discarded and the scan runs against the stale raws attributed to the stale generation.

Consequence: a slot written during the validation ride is missed by this consult's merged index (cache is keyed by the stale sig, so later consults self-heal; `loadAsync`'s burstRaws consumer is protected by its own `'gen:'+_saveStoreGeneration` equality and falls to honest getItem). Narrow window — requires a write landing inside the validation await with a non-null burst (the Continue path passes `slotBurst`).

Fix sketch: `delete burst.sig` (and `burst.raws`) before recursing, or pass `null` and let the recursion re-collect — the just-computed `fresh` could also be stamped into burst instead of discarded.

Effort S · Impact L · Risk: trivial.

## Regression verification — W129 machinery @ `5a020b909`

- **popin F1 (`clearSectorWarmLatchKeys`, renderer.js:6088-6098)**: `world:residency` listener (18514-18530) iterates rows, skips `tier==='FULL'`, calls `clearSectorWarmLatchKeys(this, demotedId)` — deletes `wanted` entry + all `${sectorId}|` gateWing keys. No other bare-sector-identity warm latch survives demote (W130 `46ef3e012` deleted `_modularPoolWarmSectors`/`_spawnRequestWarmSeen`/`_interventionWarmSeen` outright; remaining latches are WeakMap-record-keyed → auto-GC). PASS.
- **popin F2 (`_sessionLiveSectorCookedId` + keepGpu + render mirror)**: same emit clears all three (18526-18529). Write sites 13316/15424 (+mirror), clears 10461/18526/18731; consumers at 2711/16873/18784/19605/20025/20126/20142 and `pipelineReadiness.js:838-839,1262-1269` read the mirror. PASS.
- **boot F1**: `_slotStoreSignatureAsync` (2161-2187) — generation-bracketed, `i % 16` `_restoreFrameYield`, redo on tear, bounded 3 attempts → `return this._slotStoreSignature()` sync fallback at 2187; `_slotIndexWithFallbackAsync` (2237) + mid-ride re-sign ride it; sync callers keep `_slotStoreSignature` (2127). PASS (modulo B-130-4 above).
- **boot F2**: `_scanStoredSlotsAsync` (~2580) / `_scanRecoverySlotsAsync` (~2675) collect `pendingVerdicts` during the yielded walk, then dispatch `_prepareEnvelopeMetaAsync` in `i += 4` slices with `_restoreFrameYield` between slices; per-slot `out[slot]` writes identical to sync twin. PASS (findings B-130-1/2 are the residual cost inside this machinery).
- **boot F3**: `loadAsync`/`_newerUnplayableSkipAsync` read `slotBurst.raws` only under `burst.sig === 'gen:' + _saveStoreGeneration` (2884-2890); gen-miss falls to honest `getItem` (4564/4661). `specByteHit` O(len) compare at ~4663 is documented-kept (adjudicated). PASS.

## Scanned clean (hunt areas (a)/(c) residuals)

- **`_closeRestoreSession` → first presented frame (c)**: bounded sync epilogue — budget disarm (`setEmitSliceBudget('sector:exit'|'mode:changed', 0)`), latch clears, `drainedRunTransition()` handoff; the paced tail runs inside `_restoreChunks`'s yielded chain (save-loaded drain with wall-clock cap at 6167-6177, `physics-restored` yield before `completeRestoreSteps`, `save-finalized`, sliced `settings:changed` audio/video emits at 6230-6234); veil lift remains `finalizeLoadedGame`'s paced gates. No un-paced leg found.
- **Promotion write+readback (a)**: `localStorage.getItem(LS_PREFIX+slot) === backupRaw` (4594/4727) — one multi-MB read+compare on the recovery-promotion path only; rare, single-key, bounded. Not worth its own fix.
- **Rollback capture**: live-sim capture defers via `{deferred:true}`; frozen runs ride `_captureRollbackSnapshotAsync` section yields — clean.
- **`deleteSlot`** (2916): 2 removeItem + bounded index rewrite — clean. **`exportSlot`**: `exportSlotAsync` preferred, sync getItem fallback is a deliberate user-click action — clean.
- **Spec-consume legs**: `specHit`/`specByteHit` gated on gen equality; `specByteHit` adjudicated. `_armSpeculativePrepare` postMessage clone of the raw is dispatch-time bounded.
- **`_prepareEnvelopeYielded` residual**: `clonePlain(env.data)` (5004) is the one atomic multi-MB clone left in the sliced fallback lane — worker-less environments only (headless/tests); impact L, listed for completeness not as a finding.

## Measurement notes

All findings are MECHANISM_VERIFIED from source (no app launch permitted, SwiftShader GPU). The B-130-1/B-130-2 parse costs are `JSON.parse`+checksum+migrate+normalize over save blobs measured multi-MB in prior waves; per-blob main-thread cost scales with blob size (~5-30ms on this class of saves), paid K times per untrusted consult. Verify B-130-1/B-130-2 on hardware via `design/perf/scoreboard.json` save-load click probes (menu→restore first-frame) against a store with all-untrusted slots.
