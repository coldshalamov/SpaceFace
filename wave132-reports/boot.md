# wave132-reports/boot.md — boot-loading lane

Audited `devin/1791504143-perf-w120` @ `06e495da9` (W131 landed: `f75ca3f78`, `37fb93864`, `8ba617a4b`). Read-only audit; no app launch; SwiftShader box — all numbers below are CPU-side node24 micro-benchmarks on a synthesized 2.2 MB save-shaped envelope (realistic sector/records mix), which this audit style counts as legitimately load-bearing.

**saturated: false** — material synchronous legs remain: a per-pick multi-MB `JSON.parse` on the pick task, a ~21 ms/MB byte-length char walk on every spec dispatch + import click, and an O(envelope) parse+stringify on the export click path; plus three bounded residuals.

## Findings (ranked by evidence × impact)

### F1 · `_slotDataMemo` miss pays a full synchronous `JSON.parse` per new pick on the pick task (hunt d) — MECHANISM_VERIFIED + measured, impact H

Evidence: `saveLoad.js:789-790` (`readSlotSaveData`) — a memo miss runs `localStorage.getItem(LS_PREFIX + slot)` then `JSON.parse(raw)` on the caller's task; the miss is hit on *every* forward pick (filmstrip scrub row-cross `pass()` → `onScrub`, `focusin` walk, click), feeding `buildSavePortrait` at `:1181-1189` inside `_renderStage` called synchronously from `_select` (`:1148`). The `peekSlot` fallback behind it is dead code — no such method exists on the save system — so the miss path always pays the parse.

Measured on this box (node 24): `JSON.parse` of a 2.22 MB save-shaped envelope = **15-32 ms per call** (~70-150 MB/s). On a mature multi-MB store, each crossed row costs ~15-30 ms on a pointermove/key task — the dominant remaining synchronous leg in the dwell. The W131 debounce correctly moved the *spec* arm off the pick task, which exposes this parse as the scrub-jank source: the filmstrip now stays scheduled but the stage's own data read still stalls each row.

Fix sketch: render stage chrome immediately per pick and fill portrait data off the pick task — the armed spec's `prepared.data` is already a worker-side structured clone of exactly `env.data` (the fields `buildSavePortrait` needs — `player`/`story`/`aceMemory`/`missions` — all live inside it), so on a spec hit the portrait needs zero main-thread parse; a trailing-debounced "settled pick" data pass (same trick as B-131-F2) covers misses. Keep the 6-entry LRU as the synchronous cache for repaints/back-tracks.

Effort M · Impact H (scrub fluidity on MB-scale stores — this is now the per-row dominant) · Risk: moderate — portrait must remain correct for rows the spec never settles on; fall back to today's sync parse when no spec/prepared data is available.

### F2 · `saveImportByteLength` char-walks the whole envelope synchronously on the caller's task (~21 ms/MB) before the worker is even posted (hunt d) — MECHANISM_VERIFIED + measured, impact M-H

Evidence: `saveSystem.js:7416-7434` walks `value.charCodeAt(i)` per UTF-16 unit with the `bytes > MAX` early exit — for legit saves under the 12 MB cap (`SAVE_IMPORT_MAX_BYTES`, `:167`) it walks the **entire** string. Called synchronously from: `_prepareEnvelopeStringAsync` `:4921` — i.e., inside *every* `spec.dispatch()` (menu-dwell timer tasks **and** the click-path dispatch at `loadAsync:4789`), plus every `loadAsync` fallback prepare; `loadEnvelopeFromString` `:5002` — the sync pre-check inside every import click (`importString` → FileReader onload → dispatch task); `_prepareEnvelopeString` `:5076` (sync load fallback) and `_prepareEnvelopeStringYielded` `:5100` (no-worker lane).

Measured on this box: **47.7 ms for 2.3 MB** (~21 ms/MB). So a 3 MB save pays ~65 ms on the click task inside `loadAsync`'s synchronous prefix — delaying the first restore slice — and an import click pays the walk on the dispatch task before the async lane even paints. In magnitude this rivals the worker-side parse it precedes.

Fix sketch: length-bucket the gate — `bytes >= length` and `bytes <= 3*length` always hold, so `raw.length > MAX` → instant fail and `3*raw.length <= MAX` → instant pass; run the char walk only in the band `MAX/3 < length <= MAX` (4-12 MB-char saves, rare). Same verdict, O(1) for every realistic save. Alternative: move the cap into the `restore_prepare` worker entirely (the promise contract is unchanged; a blob's `raw.length` can still pre-fail the true monsters without posting).

Effort S · Impact M-H (click-path + import-click latency on MB-scale saves) · Risk: low — byte-identical outcomes.

### F3 · A non-hit consume leaves the parked dispatch armed — stray multi-MB clone + worker parse lands inside the load window (hunt a) — MECHANISM_VERIFIED, impact L-M

Evidence: `saveSystem.js:4789-4793` — `loadAsync` consumes the spec only when `sig === expectedSig`; on the non-hit branch it calls `spec.dispatch()` to cover the race where the arm minted a sig before its first dispatch, but unlike the sync `load()` lane (`:4672` `clearTimeout(spec._timer)`) it never clears a still-parked `_timer`. Post-load, nothing nulls `_speculativeContinuePrepare` either, so the parked timer still fires `spec.dispatch()` up to 200 ms later → `_prepareEnvelopeStringAsync` → `saveImportByteLength` walk + multi-MB `postMessage` clone + a full worker parse nobody will consume — all landing inside the load window this lane paces, and the post-load `save:envelopeSpecPrepared` emit still fans the warm prefetch (see F4 for where that emit lands).

Mechanism: the consume path was hardened for the hit case; the missed-hit race cover pays a late dispatch unconditionally rather than cancelling the park once its answer is known.

Fix sketch: `if (spec._timer) { clearTimeout(spec._timer); spec._timer = null; }` on the non-hit branch (the dispatch it would have run is provably useless — its prepare would fail the generation check since the store hasn't moved since the expected sig was minted… or, if the race cover is genuinely wanted, dispatch *then* disarm). Same one-line shape as `:4672`.

Effort S · Impact L-M · Risk: trivial.

### F4 · The parked spec timer survives screen exit — post-exit `save:envelopeSpecPrepared` fans the save visual warm into new-game boot / resumed flight (hunt a) — MECHANISM_VERIFIED, impact M

Evidence: `saveLoad.js` — `dispose()`/`onHide` never clear the spec arm; nothing in `_onSaveStoreBump`/dispose paths nulls `_speculativeContinuePrepare`. A pick 150 ms before Close/New-Game/Load leaves the parked dispatch live; when it fires, `_onSpeculativePreparedEmit` re-checks the store generation (`:4677-4685`) but **not** the game mode — `save:envelopeSpecPrepared` emits unconditionally → `_prefetchSaveEnvelopeVisuals` (`:6620+`) posts the saved-sector visual/decode warm fan-out. During new-game boot that warm decodes ships for a sector that will never render; during a resumed flight it competes with the same residency polls the popin lane just de-latched.

Mechanism: `speculateLoadPrepare` mode-gates at *arm* time (`:2536` menu/frozen check) but the deferred dispatch + emit have no re-check — the arm's mode at mint time is assumed to still hold 200 ms later, which exit breaks.

Fix sketch: re-check mode (and ideally that the save screen is still current) inside the timer's dispatch and/or inside `_onSpeculativePreparedEmit`; also clear `_speculativeContinuePrepare` on screen dispose alongside `clearLastSlots`.

Effort S-M · Impact M (bounded — one warm fan-out per exit-with-parked-arm, but it lands in the most contended windows) · Risk: low — speculation is best-effort already.

### F5 · `_attachProfileToExport` runs a full `JSON.parse` + `JSON.stringify` of the envelope on the export click continuation — both lanes (hunt d) — MECHANISM_VERIFIED + measured, impact M

Evidence: `saveSystem.js:7316-7324` — `const parsed = JSON.parse(envelope); parsed.profile = profile; return JSON.stringify(parsed)` inside `_finishExportJson`, which both `exportSlot` (sync, `:7193-7198`) and `exportSlotAsync` (`:7287-7294`) funnel through. For a plain (non-gzip) envelope this is O(blob) parse + O(blob) stringify on the export-click task continuation; measured magnitudes: ~15-30 ms parse + comparable stringify per 2.2 MB envelope on this box. Gzip envelopes pay only the small wrapper — fine already.

Fix sketch: for the plain-envelope lane the profile is a top-level key — splice textually: verify `envelope` ends with `}` (it was just produced by a serializer or passed the byte gate) and emit `envelope.slice(0, -1) + ',"profile":' + JSON.stringify(profile) + '}'`, keeping the parse path only for the gzip wrapper (which is small). Same output bytes modulo key order.

Effort S-M · Impact M (export click on MB-scale saves) · Risk: low — the splice is shape-preserving for any object-rooted JSON.

### F6 · The once-per-sig Continue arm pays the 200 ms park with no scrub to collapse (hunt b) — MECHANISM_VERIFIED, impact L

Evidence: `_maybeSpeculateContinuePrepare` (`:2580+`) mints its arm through the same `_armSpeculativePrepare` (`:2517-2560`) that pick-driven arms use — so the menu's automatic Continue speculation now waits `SPEC_ARM_DEBOUNCE_MS = 200` (`:175`) before posting. The debounce exists to collapse filmstrip pick bursts; the index-publish arm has no burst to collapse and just loses 200 ms of warm runway per menu entry. Measured context: the postMessage clone itself is ~1 ms/MB (`v8.serialize` 0.9 ms on 2.3 MB) — the debounce's real win is collapsing *worker parses*, which is why a zero-extra-cost immediate first dispatch for the Continue arm is free.

Fix sketch: `_armSpeculativePrepare` takes an `immediate` flag from `_maybeSpeculateContinuePrepare` (and the `_onSaveStoreBump` same-slot re-arm); keep the park only for pick-source arms.

Effort S · Impact L (200 ms of warm-start runway per menu entry) · Risk: trivial.

### F7 · The foreign-write re-arm rides a microtask — still inside the writer's frame (hunt d) — MECHANISM_VERIFIED, impact L

Evidence: `saveSystem.js:396-399` — a tracked write to a foreign key does `Promise.resolve().then(() => this.speculateLoadPrepare(spec.slot))`. Microtasks drain at task end, before the next paint/rAF — so the `getItem` + re-arm still lands inside the writing frame (an autosave landing mid-menu-dwell pays it before the very next paint). The comment says "defer the re-read + clone past the writer's task" — it does, but only just.

Fix sketch: `setTimeout(..., 0)` or the save system's own `_restoreFrameYield()` hop — a real task boundary, not just a stack unwind.

Effort S · Impact L (conditional: armed spec + mid-dwell foreign write) · Risk: trivial.

## Regression verification — W131 machinery @ `06e495da9`

All verified in source at the audited SHA:

- **B-131-F1 (deleteSlot direct index write) — PASS.** `deleteSlot` `:3014-3035`: builds `normalizeSlotIndex(this._readIndex())`, deletes the slot row, writes `INDEX_KEY` via the tracked `this._localStorage.setItem` (`:3023-3025`) — exactly the fallback consult shape, no scan/spec arm/blob reads — then splices `_slotIndexCache.merged` + re-stamps `sig = _slotStoreSignature()` preserving the previous `authoritative` flag (`:3026-3035`). The recovery `removeItem` still runs (`:3015`). Recovery-only slots (never in the index) take the safe no-op-delete branch; a mid-flight validation can't clobber the splice because the publish leg is generation-gated (`:2449`) and the delete's own setItem bumps the generation. The one divergence from the old code is an improvement: the old path wrote the *merged* view (scan+recovery rows) back into the real index; the new path writes real index rows only.
- **B-131-F2 (spec-arm debounce) — PASS.** `_armSpeculativePrepare` mints `{sig, slot, raw, promise: null, dispatch, _timer}` (`:2519-2560`); `dispatch` lazy-mints `promise` exactly once carrying the original `providedRaw → _prepareEnvelopeStringAsync → _onSpeculativePreparedEmit` chain (`:2533-2552`); `SPEC_ARM_DEBOUNCE_MS = 200` (`:175`); `load()` clears `_timer` (`:4672`); `loadAsync` dispatches on hit (`:4789-4793`). The one residual edge is F3.
- **B-131-F3 (value-riding re-arm) — PASS.** `bumpSaveStoreGeneration(key, value)` forwards the written payload (`:111-124`, `:141-144`, `:153`); a same-slot write re-arms from `bumpValue` inside the sig bracket (`:387-391` — zero reads); a foreign write defers via microtask (`:396-399`, F7 nit on deferral depth).
- **B-131-F4 (memo LRU) — PASS.** `_slotDataMemo` is a `Map`, `_SLOT_DATA_MEMO_MAX = 6`, `delete`+`set` recency on hit, oldest-first eviction (`saveLoad.js:772-805`).
- **B-131 reclaimWarm (popin consult) — PASS.** `retain()` re-stamps `entry.lastWarmClaimAtMs` on a warm re-claim (`assetResidency.js:395-400` — note the prompt said `existingMetadata`; the code conditions on the *incoming* `metadata.decodeWarm || metadata.softLease`, which is the same mechanism intent: warm posts re-pin) and bumps `ownersVersion` on the decodeWarm→decodeServed upgrade (`:387-394`). `reclaimWarm` returns false for missing entry / non-`resident` state / null owner / foreign owner, true + re-stamp for resident-under-owner (`:457-463`), exported on the residency API (`:2550`). The GLB lane consults it before `beginRequest` under the ownerless-warm guard (`assetLoader.js:716-727`), falling through to the shared task cache either way.
- **B-131 latch-free warm polls (popin) — PASS.** All 15 sites are invoked per residency pass at `renderer.js:24933-24955`; no `warmedAt`/once-fired Set survives (grep clean — only the contract comments at `:5711`, `:5965`, `:6829`). Verdict/roster memos are tuple-keyed structures, not post latches: `_gateWingWarmKeys` Map keyed `sector|to|day|faction|security|wanted` (`:6043`) cleared on demote via `clearSectorWarmLatchKeys` (`:6068`, call site `:18520`); `_uniqueWreckComplicationWarmPlans` WeakMap `record → {dueAt, ships}` (`:6265-6299`); `_depotWatchWarmPlans` WeakMap `service → {watchAt, ships}` (`:6373-6403`); `_depotPatrolWarmPlans` WeakMap `patrol → {armKey, ships}` with `armKey = encounterId:nextAt` (`:6425-6460`) — all feeding `plannedAuthoredEncounterShips`, with `warmAuthoredEncounterArm` returning the roster count (`:6349-6354`).
- **W130 spot-check — PASS-by-diff.** The W131 commits touched only `saveSystem.js` (delete/arm/bump regions), `saveLoad.js` (memo/select), `assetLoader.js`, `assetResidency.js`, `renderer.js` (warm sites), and the pending-decode-warm test — the cardEnv lane (`:2400-2434`, `:4827-4848`), burst-merge (`:2278-2283`), `deferRestoringEmit` session plumbing, and raws-reuse generation gates are all outside the touched hunks. Standing W130/W129 verdicts hold.

## Scanned clean / non-findings

- **(a) debounce correctness edges — clean except F3/F4.** Same-slot re-pick early-outs (`:2536-2540`); cross-slot replace drops the parked timer and re-arms (`:2543-2551`); cleared-then-rearm produces a fresh arm (the object is not reused); the `save:loadSpeculationTarget` raw+sig handoff stays gen-bracketed (`provided.sig === sig` else `getItem` fallback, `:2544-2548`); stale arms can't emit (identity + generation guards `:2509-2513`, `:4677-4685`); `load()` clears `_timer` before consume (`:4672`).
- **(b) 200 ms constant — sound.** The real saving is collapsing worker-side parses + clones on bursts faster than ~200 ms; a slower scrub (>200 ms between rows) still pays one dispatch per row, which is the intended trade. The only tuning nit is F6 (non-pick arms shouldn't park).
- **(c) deleteSlot divergence — none harmful.** Verified above; the merged-view writeback removal is strictly more correct.
- **(d) remaining synchronous legs — the other dwell legs are bounded.** Recovery-portrait peeks ride `slotMetaFromGzipEnvelope` (bounded, gzip-only); `_restoreModuleBuildReady` is the one-shot confirm hop (a couple of task hops, no O(blob) work); the deadline guard at `:4795-4809` expires the hit correctly; `v8.serialize(raw)` ≈ 0.9 ms for 2.3 MB on this box, so the postMessage clone itself is ~1 ms/MB — cheap relative to F1/F2.
- **Concurrent async delete (`_evictForQuotaPressure` `/ clearStoredSaves`) — clean.** Both go through the same tracked-write + consult paths the screen uses; `clearStoredSaves` clears `_slotIndexCache` directly; a mid-flight async consult can't stomp the direct write because publish legs are generation-gated (`:2449`).

## Measurement notes

CPU-side node24 micro-benchmarks on this box (SwiftShader; the app was not launched): 2.22 MB save-shaped envelope → `JSON.parse` 15-32 ms/call; `saveImportByteLength`-equivalent walk 47.7 ms (~21 ms/MB); `v8.serialize` 0.9 ms (~0.4 ms/MB structured-clone post). The multi-MB-per-blob premise is the campaign's standing measurement (`saveSystem.js:2120-2126`). Hardware dwell-frame deltas for F1/F2/F5 live in `design/perf/scoreboard.json` (scrub-dwell + menu click probes on a mature multi-slot store).
