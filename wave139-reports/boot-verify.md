# wave139 boot-verify — load→first-magic-frame audit

**Audited tree:** `63516afffd9102613580a510531ac109960d4c9b` (expected tip, `origin/devin/1791504143-perf-w120`).
**PIN note:** the local checkout was `master` at `47d01bbecb2b3ab28b6dd39ac0bb399b1f43359f` — the merge-base of the perf branch, which does NOT contain the W137/W138 code. The named expected tip was fetched and audited read-only via `git show`/`git grep` on the rev — no checkout performed, no working-tree mutation.

## JUST LANDED — verification verdicts

### V1. W137 latch-gen guard in `loadAsync` — **VERIFIED** (with one residual)

`src/save/saveSystem.js`
- `latchGen = _saveStoreGeneration` captured at **4984**, immediately after `installSaveStoreWriteTracking()` (4977) and the spec consume (4969-4973), before any `await`.
- `specHit` (4985-4986) requires `spec.sig === 'gen:' + _saveStoreGeneration` — a spec verdict is only byte-proved for the latched generation.
- `specByteHit` (5005-5007): a stale-generation arm only earns a consult when `spec.raw === raw` — and an unmaterialized thunk arm is tautologically byte-equal (its `readRaw` re-reads the same key on-task), so the compare is honest.
- Guard at **5046-5051**: `(specHit || specByteHit) && spec && _saveStoreGeneration !== latchGen` → discards the spec-derived verdict and re-prepares `freshRaw` from a live `getItem` through the same `_prepareEnvelopeStringAsync` fallback as a miss. Any tracked write landing anywhere in the rollback-capture + worker-roundtrip window therefore re-verifies before install — **a stale spec envelope cannot be installed as live** (for every writer the tracking covers).
- Uncovered-writer class is pre-documented and unchanged: devtools-style property assignment (comment 103-106) and `_saveStoreApplySilenced`-facade mirror writes (118-119, silenced by construction).
- **Residual (mechanism real, likelihood low):** the guard is scoped to spec-derived verdicts only. On the spec-miss path, `raw` is `getItem`'d at 4997 under the same latch; a tracked save write (e.g. an in-flight paced exit-autosave slice, or a reentrant import) landing before restore commit installs pre-write bytes as live — same staleness class W137 closed for spec envelopes. `acceptSeq` (5011) guards restore-vs-restore, not save-vs-load. Cheapest closure: widen 5046 to an unconditional gen recheck for every path. Also, mirror-apply writes (`silencedStore` facade, 602-613) are generation-invisible by design, so a mid-flight boot-reconcile apply is the one writer the latch cannot see even in principle.
- Level: **MECHANISM_VERIFIED** (spec path airtight; residual named).

### V2. W137 `_pendingSlotRearm` raw envelope release — **VERIFIED**

`src/save/saveSystem.js` — `pending` is the singleton `{slot, raw, gen, timer}` minted inside the `_onSaveStoreBump` re-arm lane (398).
- **Timer fire (403-421):** sets `pending.timer = null`; on a dead/cross-slot/already-fresh live arm it nulls `pending.raw` and returns (411-413); on a valid re-arm it copies `raw` locally, nulls `pending.raw`, then `speculateLoadPrepare` (415-419). Both branches release.
- **`disarmSpeculativePrepare` (2760-2767):** clears the parked timer AND `pending.raw = null` before dropping the arm — a disarm can't leave the blob pinned.
- **New arm for a different slot:** a cross-slot `speculateLoadPrepare` doesn't touch `pending`, but the parked 0 ms timer fires one task later, sees `live.slot !== pending.slot`, releases `raw`, returns. Worst-case retention is one task hop — bounded, not a leak.
- `pending.slot`/`pending.gen` remain as scalars post-release — harmless.
- Level: **MECHANISM_VERIFIED**.

### V3. W137 `saveLoad.js` slot-memo fill guard vs torn reads — **VERIFIED**

`src/ui/screens/saveLoad.js`
- Async fill (`fillSlotDataLazy` peek.then, **868**): `_slotDataMemo.get(slot) !== fillEntry || fillEntry.data` → bail. A same-slot write mid-peek re-mints the entry with a new `sig` (`readSlotSaveData` 789), so the identity check drops the pre-bump `cardData` — the stale payload can never stamp onto the new-generation entry (which refills on its own consult since fresh entries mint `attempted:undefined`, fillable per 813).
- Double-fill: `fillEntry.data` truthy → bail — a slower peek can't clobber data already landed by the `save:envelopeSpecPrepared` emit path (1078-1079, itself `!entry.data`-guarded) or a faster sync tail.
- `entry.raw` is materialized once inside the entry (851) and `sig`-keyed; a gen bump discards the whole entry rather than refreshing parts — no torn raw/data pairing possible.
- Level: **MECHANISM_VERIFIED**.

### V4. W138 `_decodedSaveEnvelopes` FIFO cap at 8 — **VERIFIED**

`src/save/saveSystem.js`
- Fill (**5243-5248**): only on `isGzippedSaveText(raw)` + successful async prepare — `decoded.set(raw, preparedResult); while (decoded.size > 8) decoded.delete(decoded.keys().next().value)` — Map insertion-order FIFO. Re-`set` of an existing key doesn't grow, so no eviction storm.
- Read paths are pure `.get` (5364 sync lane, 5388 yielded lane) — no reorder on hit (true FIFO, matching the comment).
- Twin `_preparedEnvelopeCache` capped identically (`while > 8`, 5337).
- Level: **MECHANISM_VERIFIED**.

### V5. W138 `MAX_WORKER_SESSIONS=4` + `String.raw` twin — **VERIFIED**

`src/save/saveWorker.js` (module scope): `MAX_WORKER_SESSIONS = 4` + `capWorkerSessions` (9-12); invoked at `validate_begin` (403) and `encode_begin` (428) — the only two `.set(` session-creation sites in `handleSaveWorkerRequestCore`.

`SAVE_WORKER_SOURCE` literal (the twin `buildPlayerChunkedSaveWorkerSource` mutates):
- `self.__capWorkerSessions` defined lazily inside the message handler (852-856) — literal `4` (the string cannot reference module scope); invoked at `validate_begin` (858) and `encode_begin` (887) — the only two `Sessions.set(` sites in the twin (verified programmatically).
- **`encode_player_begin` is not a session-begin path**: `self.__saveEncodeSessions.get(request.id)` + `missing_encode_session` throw (8284-8285) — it fills `session.data.player` on a session `encode_begin` already created (host posts `encode_begin` first at 3770). `encode_bag_begin`/`encode_player_part`/`encode_bag_part` likewise get-only. Every true session-begin path caps.
- **Compile check:** built the twin by extracting `SAVE_WORKER_SOURCE` + inserting `playerProtocol` at the `'encode_part'` needle — `new Function()` parses both (base 20 060 chars, twin 23 151). The W138-inserted cap hunk is var-free ES5-clean; the surrounding literal already uses `const`/`let`/`Map` (pre-W138, ES2015 Blob-source — "valid ES5" in the prompt is loose but the actual requirement — the literal parses in every worker engine — holds).
- Level: **MECHANISM_VERIFIED** (compile + all begin paths proven).

## Re-audit — boot path, remaining waste

Already-cheap machinery confirmed (so future lanes don't re-hunt it):
- Restore chunk loop is **time-sliced**, not count-sliced: `t - lastRealYieldAt >= RESTORE_YIELD_SLICE_MS` gate (5989-5993) — the "~9+N fixed waits ≈ 160-400 ms" comment documents the closed version of this finding.
- `nextPaintSliced` elides its double-rAF when a paint landed <16 ms ago (main.js 1420-1423); `_restoreFrameYield`/frame waits downgrade to `setTimeout(0)` after two timer-starved rAFs + probe re-arm (6015-6046, 1360-1413). The four `finalizeLoadedGame` paint boundaries (999, 1023, 1058, 1076) are near-free under a live compositor.
- `spec.dispatch()` flushes a parked arm synchronously on consume (5014-5016); the warm save worker is spawned at init (545) and pooled via `_checkoutSaveWorker`/`_releaseSaveWorker` (4303-4334); physics WASM prep kicks at envelope decode and is adopted by the D26 gate (975-987, 1118-1145); saved-sector visual prefetch rides the restricted `save:envelopeSpecPrepared` emit (2675-2686); `loadScenarioContract` overlaps registry init (116-153); Continue only dead-blocks on "Checking saves" when there is **no** local save (mainMenu 580-589).
- Menu-time slot validation is off the click path entirely (`_scheduleSlotIndexValidation`, slices of 4 worker metas, hash-trusted skips, 2491-2554); click consult rides `_slotIndexCache`/`_slotIndexValidationInFlight` (2396-2412).

### Findings

**F1 — MECHANISM_VERIFIED (correctness-adjacent, low likelihood):** `loadAsync`'s non-spec path carries no generation re-verification (see V1 residual). A tracked write between `latchGen` (4984) and restore commit installs pre-write bytes as live; mirror-apply writes through the silenced facade are generation-invisible altogether. Mechanism verified; trigger needs a mid-load save/mirror write. Suggested closure: make the 5046 recheck unconditional.

**F2 — MECHANISM_VERIFIED (bounded):** `index.html` carries ~1 927 `modulepreload` hints covering the entire `src` graph. The media-gate asset `assets/cinematics/boot-visualizer.mp4` is `<video preload="none">` (index.html 2060-2061) — fetched only at `artwork.start()`, inside the same window those ~1 927 speculative fetches occupy. On a cold/constrained link, the two real media frames that release `import('../main.js')` (bootEntry 24-27) can queue behind hundreds of module fetches. Lever: raise the gate asset's priority (`fetchpriority` on the video, or a targeted `<link rel="preload" as="fetch">` for the mp4) — not deferring the registry block (its eval-time overlap is the point). Bounded: Electron/local near-zero; unbundled cold remote only — retail strips modulepreloads anyway.

**F3 — MECHANISM_VERIFIED (small):** a thunk-armed spec consumed inside its 200 ms park pays a synchronous multi-MB `localStorage.getItem` + O(blob) structured clone on the click task (2656-2664, 2736-2742). Inherent to `postMessage(string)` — transferable `Uint8Array` would still need the string re-materialized in the worker for `JSON.parse`; TextEncoder-side copy is the only main-thread saving and it's marginal. Documented tradeoff; sub-material.

**F4 — MECHANISM_VERIFIED (informational):** `_slotDataMemo.set(slot, entry)` on the `save:envelopeSpecPrepared` emit path (saveLoad.js 1078-1079) bypasses the `_SLOT_DATA_MEMO_MAX` evict — transient +1 over the 6-entry cap per emit cycle, self-corrects on next `readSlotSaveData`. Not a leak; noted for completeness.

## rejected-levers

- **Drop/shorten the media gate** (`bootEntry.js:24`): the media-first handoff is a product decision (boot video + instrument paint before any game eval) — quality/feature, not waste.
- **Trim the ~1 927-entry modulepreload registry**: on the unbundled path the alternative is fetch-by-fetch discovery (~1 900 serialized RTTs inside the post-media eval cascade) — strictly worse; retail strips the block anyway.
- **Remove restore/frame yields**: the loading shell's only paint channel; the time-slice gates already cap their cost.
- **`_warmSaveWorker` on-demand instead of init-spawned**: the spawn inside `init()` is exactly what keeps worker boot off the Continue click.
- **`_slotIndexWithFallbackAsync`'s unconditional yield (2416)**: deliberate de-fusing after the signature collect; runs only on consult miss, and menu validation normally settles the cache before any click.

## Verdict

`saturated: false` — W137/W138 landings all verify. Two honest residuals remain: **F1** (widening the latch-gen recheck to the non-spec path is one integer compare against a rare but real staleness install — the correctness-class item this lane exists to catch) and **F2** (fetch-priority on the gate media vs ~1 927 speculative fetches — bounded, remote-cold-cache only). Everything else on the load→first-magic-frame path is already sliced, overlapped, or deliberate.
