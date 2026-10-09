# wave131-reports/boot.md — boot-loading lane

Audited `devin/1791504143-perf-w120` @ `35fb5fed7` (W120-W130 landed, PR #257). Read-only audit; no app launch; SwiftShader box, so all evidence is CPU-side mechanism-level.

**saturated: false** — two material dwell-task costs remain on the Save/Load screen (delete's atomic re-consult, per-row speculation re-arm churn) plus two smaller residuals.

## Findings (ranked by evidence × impact)

### F1 · `deleteSlot` pays a full atomic store consult inside the delete click (hunt b) — MECHANISM_VERIFIED, impact M

Evidence: `saveSystem.js:2975-2984` (`deleteSlot`) — `localStorage.removeItem(LS_PREFIX + slot)` + `removeItem(RECOVERY_PREFIX + slot)` are both tracked writes (`installSaveStoreWriteTracking` wraps `removeItem`, `saveSystem.js:137-146`; `bumpSaveStoreGeneration` admits `sf.recovery.*` at :117-120), so each bumps `_saveStoreGeneration` and `_slotIndexCache` is guaranteed stale. The very next line, `const idx = this._slotIndexWithFallback()` (:2977), then runs the *whole* sync consult on the click task: `_slotStoreSignature()`'s enumerate+`getItem` walk over every save+recovery blob (:2166-2174), `_scanStoredSlots`/`_scanRecoverySlots` (fnv1a per trusted blob, atomic `_prepareEnvelopeMeta` per untrusted), `mergeSlotIndexes`, and `_maybeSpeculateContinuePrepare` (:2252) — which arms a fresh worker prepare = one more multi-MB structured-clone `postMessage` — before the index JSON rewrite even runs.

Mechanism: on a mature multi-MB store, Delete-confirm → toast is a multi-mega-byte synchronous read+hash+merge on the UI thread — a freeze inside the dwell this lane owns. Prior-wave audits scoped `deleteSlot` as "2 removeItem + bounded index rewrite — clean"; the index *consult* behind the rewrite was missed — the delete's own writes are what force the miss, every time.

Fix sketch: a delete is a self-describing mutation — it does not need blob verification at all. Write the index row directly (`normalizeSlotIndex(this._readIndex())`, `delete idx[slot]`, `setItem(INDEX_KEY, …)` — the same shape the screen's own bare-storage fallback already produces at `saveLoad.js:1451-1463`), and splice `_slotIndexCache.merged` + re-key its sig when a cache exists so the next render stays free. No scan, no spec arm, no blob reads.

Effort S · Impact M (delete click on a fat store; zero in the cheap case it replaces) · Risk: low — the fallback consult still exists for every other reader; deleting an index row cannot resurrect a slot.

### F2 · Every crossed row re-arms the speculative prepare — a multi-MB postMessage clone + a doomed worker parse per row (hunt d) — MECHANISM_VERIFIED, impact M

Evidence: `saveLoad.js:1136-1160` (`_select`) fires `save:loadSpeculationTarget` carrying `{slot, raw, sig}` on *every* pick — filmstrip `pass()` → `onScrub` per pointermove row-cross (`saveFilmstrip.js:325-332`), `focusin` on arrow/focus walk (`saveLoad.js:1101-1103`), click pick. `speculateLoadPrepare` (`saveSystem.js:2533-2550`) early-outs only on same-slot+same-gen, so each new row calls `_armSpeculativePrepare` → `_prepareEnvelopeStringAsync(raw)` → `_requestSaveWorker` → `worker.postMessage({payload:{raw}})` — a synchronous O(blob) structured clone on the pick task — plus a full worker parse the next pick throws away (stale arms can't emit: the `this._speculativeContinuePrepare !== spec` guard at :2510 correctly drops them — correctness fine, cost already spent).

Mechanism: scrubbing across K rows = K atomic parses (see F4) + K multi-MB clones + K worker dispatches, all inside pointermove/key tasks — exactly the dwell tasks a filmstrip scrub is supposed to keep fluid. The armed-by-default design is right; the cadence is the defect — only the row the scrub *settles* on can ever be consumed by a click.

Fix sketch: trailing debounce on the arm — keep the emit per pick, but park the worker dispatch ~150-250 ms (or flush on filmstrip pointer-up / list blur), collapsing a scrub's N picks into one arm for the settle row. `_select` keeps paying only the memo'd stage render per pick.

Effort S · Impact M (scrub fluidity on multi-MB stores) · Risk: low — speculation is already best-effort; a delayed arm shifts warm start, never correctness.

### F3 · `_onSaveStoreBump` re-arm materializes + clones the armed blob synchronously inside the writer's task (hunt d) — MECHANISM_VERIFIED, impact L-M

Evidence: `saveSystem.js:376-381` — `bumpSaveStoreGeneration` calls `_onSaveStoreBump()` inline inside the wrapped `setItem`/`removeItem` (`:142`); the handler runs `this.speculateLoadPrepare(spec.slot)` with no `provided`, which pays `localStorage.getItem(LS_PREFIX + slot)` (:2547) + the `_armSpeculativePrepare` postMessage clone — all on the *writing* task (an autosave landing mid-menu-dwell, or the screen's own Save). Gated to menu/frozen by `speculateLoadPrepare`'s mode check (:2536) so live flight never pays it — the cost lands on dwell frames only.

Mechanism: one tracked write while a spec is armed = an extra multi-MB read + clone fused into the write's task. Same-slot writes hold the new bytes in hand already (the wrapper sees `value`); cross-slot writes could re-arm off a deferred hop instead of inside the bump.

Fix sketch: pass `(key, value)` into `_onSaveStoreBump` — a write to the armed slot's own key arms directly from `value` (zero reads); otherwise schedule the re-arm through `_restoreFrameYield()`/microtask so the write task completes first.

Effort S · Impact L-M (conditional: armed spec + mid-dwell write) · Risk: low.

### F4 · `_slotDataMemo` is single-entry — a scrub back-track re-parses the just-left row (hunt b) — MECHANISM_VERIFIED, impact L-M

Evidence: `saveLoad.js:770-793` — memo keyed `{sig, slot, raw, data}` holds one slot. Each new pick on a multi-MB store pays `getItem` + `JSON.parse` (`:781-783`) on the pick task; revisiting a row (filmstrip A→B→A, arrow back) misses and re-parses from bytes. The per-pick parse itself is the contract (the portrait needs `data` fields cardEnv deliberately doesn't carry — fittings, livingHull, aceMemory), so this is a residual cost of the W130 fix, not a bug in it.

Fix sketch: bounded LRU (≈4-8 entries, keyed slot+gen — evict oldest) instead of a single slot; kills every back-track re-parse while keeping the memory bound trivial (raws are shared string refs, `data` is the retained part). Optional companion to F2: render the meta-card fields instantly per pick and fill the portrait on pick-settle — but the LRU alone captures most of the win.

Effort S · Impact L-M (scrub back-tracks; steady pick cost unchanged) · Risk: trivial.

## Regression verification — W130 machinery @ `35fb5fed7`

All verified in source at the audited SHA:

- **B-130-1 (cardEnv worker lane) — PASS.** Both worker sources project `cardEnvFromEnvelope`: the ESM module site (`saveWorker.js:306-310`) and the `PLAYER_CHUNKED` inline source (`saveWorker.js:657-680`, spliced via `PLAYER_CHUNKED_SAVE_WORKER_SOURCE` `saveSystem.js:229`), both replacing `env` with `cardEnv` in the `restore_prepare_meta` verdict. Field coverage is exact against `slotCardFromEnvelopeData` (`saveSystem.js:8406-8443`): fmt/version/savedAt/playtimeS/label/thumbnail + `data.player.{credits,activeShipIndex,ownedShips[].defId}` + `data.world.{currentSectorId, sectors[current].{name,id}}` + `data.{meta,missions,story,nav}` — the only other consumer inside the card builder, `completedEndingChoiceFromSaveData` → `storyFromSaveData` (`src/core/newGamePlus.js:40-57`), reads only `data.story`/`data.missions`, both carried. Host merge: `cardEnvs[slot]` collected in `_scheduleSlotIndexValidation` (:2414), publish leg serves `cardEnvs[slot] || _prepareEnvelopeMeta(...)` (:2445), `_scanStoredSlotsAsync` serves `verdict.cardEnv` first (:2672), `_scanRecoverySlotsAsync` identical (:2766).
- **B-130-2b (fallback cardEnv) — PASS.** `_prepareEnvelopeMetaAsync`: no-worker lane returns `{ok:true, cardEnv: meta}` (:4827); timeout/wedged `settle(null)` fallback returns the parsed env as `cardEnv` (:4846-4848). The discarded-parse pattern is gone.
- **B-130-3 (raw handoff) — PASS.** `readSlotSaveData` returns the gen-bracketed `{sig, slot, raw, data}` memo via `sys.saveStoreSignature()` (`saveLoad.js:770-793`); `_select` renders-then-emits `{slot, raw, sig}` (`:1148-1160`); `speculateLoadPrepare` uses `provided.raw` only when `provided.sig === sig` and falls back to `getItem` (`saveSystem.js:2544-2548`).
- **B-130-4 (burst merge on retry) — PASS.** `_slotIndexWithFallbackAsync` on `fresh.sig !== sig`: `Object.assign(burst, fresh)` then `return this._slotIndexWithFallbackAsync(burst || null)` (`:2278-2283`) — the fresh collect is stamped into the burst, no stale-raws recurse.
- **Skeptic F1 (deferred restoring emit) — PASS.** `_restore` (:5545) and `_restoreAsync` (:5609) pass `deferRestoringEmit: true` into `_openRestoreSession`; the session holds it in `s.pendingRestoringEmit` (:5727-5734); capture resolves *before* `_firePendingRestoringEmit(s)` (:5550-5561 / :5618-5629); a capture failure returns `_closeRestoreSession(s, error)` with no emit.
- **Skeptic F2 (silenced apply) — PASS.** `_saveStoreApplySilenced` counter (`:107`) early-returns `bumpSaveStoreGeneration` (`:115`); the `silencedStore` facade wraps `setItem`/`removeItem` in ++/-- around the real calls (`:553-561`) so only foreign writes bump inside the apply's yield windows; `_sharedStoreCollectCache` stamps only when `_saveStoreGeneration === genAtCollect` (`:572-576`).
- **Skeptic F3 (moved-set) — PASS.** `catchUpEntity` marks partition-0 members into `runtime.shelvedDiscoveryMoved` (`activityRuntime.js:329-332`); the cell-map query path envelope-tests marked members directly, `seen`-deduped (`:1047-1057`); the audit rebuild clears the set (`:1021`).
- **Prior-wave spot-check (boot W129: chunked signature + verdict fan-out + raws reuse) — PASS**, re-verified since `d7470cc4a` touched the same functions: `_slotStoreSignatureAsync` is generation-bracketed, 16-key yields, redo-on-tear, 3 attempts → sync fallback (:2188-2213); both async scans fan verdicts in bounded slices of 4 (:2657-2684, :2757-2783); `slotBurst.raws`/`burstRaws` reuse is gen-gated (`'gen:' + _saveStoreGeneration` equality) at :2884-2890 / :4708-4720. Popin spot-check (W129/W130 latch deletes + cooked-stamp clear) untouched by the W130 boot commit (renderer/saveEnvelopeSectorWarm only) — standing PASS per the W130 popin lane.

## Scanned clean / non-findings

- **(a) cardEnv residual re-parse gaps — none.** Trusted paths serve index cards on a blob-hash compare (no parse); recovery slots get `verdict.cardEnv`; the publish leg only re-parses when the worker produced no cardEnv; gzip peeks stay bounded (`slotMetaFromGzipEnvelope`); `getNewGamePlusCandidate[Async]` legitimately needs full `data` (keepsakes/grudges/scars — not card fields) and already rides the worker lane; no card consumer falls back to `_prepareEnvelopeMeta` per consult. The only remaining sync-consult riders are `deleteSlot` (F1), `_evictForQuotaPressure` (:1359 — QuotaExceededError escalation only, rare), and sync `load()`/`_latestSlot` (fallback when `deferLoadedGameRestore` is absent — production `game:load` always rides defer→`preferAsync`→`loadAsync`, `main.js:222-241`; the sync lane is test/headless surface).
- **`sys.peekSlot` fallback in `readSlotSaveData` (`saveLoad.js:786-789`)** — dead code: no such method exists on the save system. Harmless; noted, not a finding.
- **(b) screen open/save/export/import paths — clean.** `readSlots` prefers `listSlotsIndexCards()` (O(keys), no parse — `saveLoad.js:233-237`, same preference in `mainMenu.js:86`); Save click rides the paced `saveAsync` chain in menu/frozen (`:1495-1526`, hops through `_scheduleAutosaveWork`); export prefers `exportSlotAsync` (`saveLoad.js:1477` → `saveSystem.js:7156`, proven-envelope memo + async prepare); import goes FileReader → `importString` → sliced async lane with O(1) sync rejects (`:7311-7343`); `save:store-synced` fires only at boot-sync/mirror-recovery, not per write (:601, :651, :7289). Post-write re-render re-parses the selected row once per generation bump (memo correctly invalidates) — bounded, expected.
- **(c) `_closeRestoreSession` → first presented frame — clean.** The epilogue is bounded sync work (emit-budget disarm, latch clears, `drainedRunTransition` handoff, `:6331-6387`); `finalizeLoadedGame` (`main.js:947`) is fully paced — `nextPaintSliced`/`nextFrame` yields, `runTransitionGuard` staleness re-checks between every leg, gate pulses on every await, 20 s bounded physics/cook gates. No un-paced leg found between restore close and the veil's first painted beat.
- **(d) retention/stale-emit surfaces — bounded.** At most one armed spec holds one `raw` string; stale arms can't emit `save:envelopeSpecPrepared` (identity + generation guards at :2509-2513); `save:loadSpeculationTarget` from pause/gameOver carries `{slot}` only (no raw on the bus for them). The cost defects are the two cadence findings above (F2/F3), not a leak.

## Measurement notes

All findings MECHANISM_VERIFIED from source; no wall-clock numbers taken (SwiftShader, no app launch). The multi-MB-per-blob premise is the campaign's standing measurement (file documents "several megabyte-scale envelopes" at `saveSystem.js:2120-2126`). Hardware verification commands for the delete/pick legs live in `design/perf/scoreboard.json` (menu→delete and scrub-dwell probes on a mature multi-slot store); a CPU-side bracket around `deleteSlot` and `_armSpeculativePrepare`'s postMessage could size both headlessly if a fixture store is wanted.
