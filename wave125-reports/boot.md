# Wave 125 audit report — boot-loading lane

## Verdict — CONTAMINATED-1

One material O(save) leg still sits on a click task **before** the loading veil:
`resolveNewGamePlusOverlay` runs `saveSystem.prepareNewGamePlus` synchronously at the
top of `startNewGame` (main.js:580 → :861-874 → saveSystem.js:2566-2575), doing up to two
full sync `_prepareEnvelopeString` pipelines (parse → preflight → checksum → clone+migrate →
normalize, saveSystem.js:4656-4671) on the New Run+ click — the async twin
(`_prepareNewGamePlusSlotAsync`, :2549) already exists and the candidate scan uses it (:2538).
Two smaller residuals ride along below. Everything else in the wave-124 save-mirror/worker
lane verified clean at HEAD (aec85e97d).

## Regression notes — wave-124 landed machinery (verified)

- **`saveAsync` worker-encode lane** — confirmed at aec85e97d: encoder mints
  `_autosaveEncoderEntries(data)` upfront and drives `encode_start`/`encode_chunk`/
  `encode_finish` through `_postSaveEncodeEntry`, every post bound to
  `AUTOSAVE_TARGET_SLICE_MS` (8 ms) on the calling task. Worker-fail → same-turn
  `_finishSaveAsync` sync fallback; local-stall → `_encodeViaChunkedStreamFallback`
  (paced streamer, not sync-compress-on-click); drain → `_enqueuePacedEncode` with the
  120 s `serialize_queued` timeout + memento. Exact-once across supersedes:
  `__spacefaceSaveSupersede` + `checkoutSave`/`releaseSave` + `_activeSaveWorkerBusy`.
  Envelope-shape rules kept: bound verdict → same `{ok:false,reason,limit?,actual?}`
  shape via `fail()`; `envelope` built lazily only in the worker-ok lane;
  defer/accept-generation semantics unchanged; load readbacks untouched.
- **Delta mirror** — `_queueSharedStoreMirror(patch)` (:573) merges deltas and flushes
  once via `setTimeout`; `bumpSaveStoreGeneration` (:110-119) still tracks
  `sf.save.`/`sf.recovery.` keys only. A bare call arms the chunked
  generation-bracketed `_collectSharedStoreKeysChunked` walk (:583-589) — megabyte work
  off the call task.
- **Worker cold-start** — a warm worker is minted at `init()` (:485) and pooled reusable
  (release only when `!_activeSaveWorkerBusy`, `usable`, `!superseded`); first save
  reuses it. Concurrent requests get a fresh bounded Blob-URL worker — never a queue.
- **popin F2** — census (`enforceBudget`/`enforceBudgetSteps`) passes `entryUnitIds`
  through `governor.plan` (resourceGovernor.js:385-386; assetResidency.js:2220, :2356);
  rows carry minted `validatedUnits` memos (:2090, :2168, :2309); `evictionPriority`
  decorated once per entry (:367).
- **popin F1** — `rotateSectorDeferred` reads `pendingSectorTarget` at call time,
  mints `rotateSeq` per rotate, repoint is seq-guarded (`appliedRotateSeq`,
  assetResidency.js:1798-1872); repin consumes queued seqs.
- **hitches F1** — frame()'s finally tail is quarantined in two try/catch segments
  (presentationRunner.js:1297-1344): `recordFrameCallback`+tier1 samplers, then
  `checkGraphicsRecovery`→restore block; `frame._tailErrs` ledger caps at 20;
  `schedule()` unconditional. The `return` inside the second try only fires on
  `!mustRescheduleAfterFrame({destroyed})` / `destroyed` — `mustRescheduleAfterFrame`
  returns false exactly when `schedule()` no-ops (frameLiveness.js:127-130,
  presentationRunner.js:397), so no live path skips reschedule.

## Residual check

(a) **sync `exportSlot` callers** — VERIFIED CLEAN. `saveLoad._export` prefers
`exportSlotAsync` (saveLoad.js:1457-1459); the sync `exportSlot` branch (:1460-1461) only
runs when the async twin is absent — unreachable in production (same object, both defined).

(b) **generation bracket / mirror deltas** — CONFIRMED, narrow:

- `sf.settings.profile.v1` (PROFILE_SETTINGS_KEY) and `sf.settings.export.v1` are not
  generation-tracked: `bumpSaveStoreGeneration` filters to `LS_PREFIX`/`RECOVERY_PREFIX`
  (:113). A profile-settings write landing inside a collect's generation bracket ships a
  stale row in the collect's materialized map (its own delta patch and the collect can race;
  `Object.assign` order decides). Narrow window, `keepalive` flush — cosmetic mirror skew
  that self-heals on the next tracked write.
- The two bare `_queueSharedStoreMirror()` callers (:4327, :4437 — recovery-promotion
  self-heal in the load path) arm the whole-corpus chunked collect even though the delta is
  in hand: `{[LS_PREFIX+slot]: backupRaw}` + the `_updateIndex` index JSON. Not a stall
  (chunked + generation-bracketed) but a wasted MB-scale walk per promotion; shipping the
  delta is a few lines.

(c) **worker cold-start** — VERIFIED CLEAN. Warm pool exists since `init()`; never a sync
cold-start on a save click. The per-request Blob mint on concurrent saves is bounded by the
source size once per spawn.

(d) **still-atomic O(save) legs** — ONE MATERIAL + ONE MINOR:

- **NEW (material, click-path):** `resolveNewGamePlusOverlay` → `prepareNewGamePlus`
  → `_prepareNewGamePlusSlot` (saveSystem.js:2566-2591) — up to 2× sync
  `_prepareEnvelopeString` on the New Run+ click, and it runs at main.js:580 **before**
  `runNewGameStartTransition` raises the veil (`enterLoadingMode` is inside `prepareRun`,
  :592). On a mature save that's ~2 × multi-MB parse+preflight+checksum+normalize —
  tens of ms on the click frame with no loading shell up. The async twin
  `_prepareNewGamePlusSlotAsync` (:2549) is already landed and used by the scan lane;
  the fix is a `prepareNewGamePlusAsync` awaited in `startNewGame`, or hoisting the
  resolve inside `prepareRun` after the veil. Confidence high — call chain traced end to end.
- **NEW (minor, receipt shape):** `_encodeEnvelopeViaWorker`'s settle drops `limit`/`actual`
  on bound verdicts (:3418 `settle({ok:false, reason})`) — the worker sends them
  (saveWorker.js:471-473 `...encoded` spread) and the sync lane reports them
  (:1701). Diagnostics-only asymmetry in the `save_size_limit`/preflight receipt; one-line
  forward of `message.limit`/`message.actual`.
- Other sync prepares verified in their documented lanes: sync `load()`/`save()` are the
  test seams; `_captureRollbackSnapshot`'s sync `serializeData` on a ticking run is the
  deliberate coherent-capture rule (:5056, async twin :5088-5092 retakes on live state);
  `_serializeDataFrozenAsync`'s :970 retake is the same rule; sync `_newerUnplayableSkip`
  (:2618-2624) only serves the sync-load lane — `loadAsync` uses the worker twin.

(e) **veil-lift tail** — VERIFIED CLEAN at HEAD. No main.js commits in wave-124 (only
saveSystem/assetResidency/resourceGovernor/presentationRunner touched); the
`finalizeLoadedGame` ordering verified in wave-123 stands. The NG+ overlay resolve at :580
precedes `finalizeLoadedGame` and carries the same correctness contract (resolve once at
launch, bounded `buildNewGamePlusOverlay` projection, `GameStartReadinessError` on
disappeared source) — its defect is the *pre-veil click-frame* placement reported in (d),
not a tail-ordering break.

## Suggested wave-126 candidates (boot lane)

1. Route New Run+ overlay resolution through `_prepareNewGamePlusSlotAsync` (or hoist it
   inside `prepareRun` after the veil) — closes the last O(save) sync leg on a click task.
2. Recovery-promotion: ship `{[LS_PREFIX+slot]: backupRaw, [INDEX_KEY]: indexJson}` deltas
   instead of arming the whole-corpus collect (:4327, :4437).
3. Forward `limit`/`actual` through the worker-encode settle (:3418) for receipt parity.
