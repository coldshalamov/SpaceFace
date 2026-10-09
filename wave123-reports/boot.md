# wave-123 audit — boot-loading lane

Audit branch: `devin/1791504143-perf-w120` @ `7acc45245` (PR #257 HEAD; W120+W121+W122 landed,
plus the W123 popin batch `7acc45245` already on top). Audit-only: no code written, no app run.
Every finding below is a code-inspection proof — no node benchmark needed (MECHANISM_VERIFIED).

```yaml
saturated: false
```

## Ranked findings

### F1 — the seal-write gate still runs the whole save chain atomically inside the `game:save` / `game:exitToMenu` emit
**MECHANISM_VERIFIED.** `bus.on('game:save')` → `this.save(slot)` (`src/save/saveSystem.js:317-329`)
and `bus.on('game:exitToMenu')` → `requestExitAutosave()` → `this.save(AUTOSAVE_SLOT)`
(`:466`, `:2465-2481`) execute `save()` synchronously inside the emit task. One task pays:
`serialize(slot)` → `serializeData()` draining `_serializeDataSteps` fully inline (`:762-767`,
O(world) capture) + `safeStringify(data)` + `fnv1a(json)` (`:999-1010`, O(save) passes 1-2) +
`stampSlotCard`/`_readIndex`; then `_writeSlot` (`:1411+`) → `preflightSaveImport(envelope)`
bound-walk (pass 3) + `JSON.stringify(envelope)` (pass 4 — a SECOND full stringify after
`serialize()`'s own) + `localStorage.getItem` previous + verify — memo-hit only when the
previous generation is proven (`:1455-1460`); a cold `previousRaw` still pays a synchronous
`_prepareEnvelopeString` (parse + preflight + checksum + migrate + normalize = passes 5-8) —
then `localStorage.setItem` ×2 (backup + primary) + read-back `getItem` + index write. On a
mature multi-MB save this is a multi-hundred-ms brick on the click/exit emit — and
`requestExitAutosave` fires *inside* the pause→menu transition, so the gate freezes a loading
transition outright (the veil/menu paints behind it). From the surfaces this fires on (pause,
dock, stacked screens, exit) `_frozenTickBoundary()` is true
(`state.mode === 'paused' || shouldSkipFullTickSystems`, `:930-932`) — the capture itself may
legally pace via the already-landed `_serializeDataFrozenAsync` machinery (`:939-956`); only
the F5-in-flight leg needs the documented one-task coherent capture (`:2695-2698` comment).
The UI save click additionally pays `capturePhotoPng` → `canvas.toDataURL('image/png')`
(readback + PNG encode) before the emit (`src/ui/screens/saveLoad.js:1395-1402`).
**Fix sketch:** route `game:save`/`requestExitAutosave` through a paced twin: when
`_frozenTickBoundary()` holds, drive `_serializeDataSteps` on the scheduled-work lane
(re-checking the freeze per section, retaking atomically on unfreeze — the exact contract
`_serializeDataFrozenAsync` implements); otherwise keep the coherent inline capture. Then hand
the envelope to a `_scheduleAutosaveWork`-shaped chain for preflight → stringify (worker
encode via `_startAutosaveEncoding`'s per-section posts) → write → read-back verify → index,
preserving `save:started`/`save:completed`/`save:error` receipts, `_noteWritePending`, and
`_publishSaveResult` ordering; a job token like `_activeAutosaveJob` supersedes/dedupes
overlapping manual writes. The thumbnail `toDataURL` can ride `canvas.toBlob` (async) or move
off the click task. `localStorage.setItem` itself stays atomic per call — platform I/O —
bounded by json bytes only.
**Effort M · Impact H · Risk M** (receipt/ordering semantics and the coherence gate are the
wrinkle — every mechanism is already proven by the autosave lane's own shape).

### F2 — `exportSlot` prepares the whole stored ledger synchronously on the Export click
**MECHANISM_VERIFIED.** `exportSlot` (`src/save/saveSystem.js:6303-6330`) runs
`this._prepareEnvelopeString(json)` on the primary blob at `:6306` — JSON.parse + preflight
bound-walk + checksum reserialize+hash + clonePlain + migrations + normalize — inside the
Save/Load screen's `_export` click (`src/ui/screens/saveLoad.js:1449-1465`); on primary
failure it pays a second full sync prepare on the recovery blob (`:6309-6312`). The
proven-envelope FIFO landed in W122 (`_cachedPreparedEnvelope`, `:4269-4281`) already answers
O(1) for generations this process wrote or validated — the export leg never consults it.
**Fix sketch:** consult `_cachedPreparedEnvelope(raw)` first (memo hit → identical verdict);
on miss route `_prepareEnvelopeStringAsync` and let the caller await (the screen's `_export`
can go async — nothing else needs the sync return).
**Effort S-M · Impact M · Risk S** (verdict-only semantics stay identical; the screen already
tolerates the raw-blob fallback at `:1465-1470`).

## Lane contract enumeration (hunt items a–d)

- **(a) Load-path O(save-size)/O(world-size) residue:** the LOAD side is clean — slot loads
  (`loadAsync` → `_prepareEnvelopeStringAsync`), imports (`loadEnvelopeFromString` →
  `_loadEnvelopeFromStringAsync`, W122), the recovery/backup lane (`:4039-4055`), speculative
  continue prepare (`_armSpeculativePrepare` → async, `:2055-2081`), slot-index validation
  (yields every 16 keys + `_prepareEnvelopeMetaAsync` worker meta, `:1937-1988`), and
  `_restoreChunks` (~80 yield points, `:4968+`) are all paced. Sync `load()`/`loadEnvelope()`
  → `_restorePreparedEnvelope` remain the DOCUMENTED test/stub seams — every production route
  emits `game:load` → `deferLoadedGameRestore` → `load(preferAsync)` (main.js:222-244;
  mainMenu Continue, gameOver retry, pause F9 all emit `game:load`). The seal-write gate's
  remaining atomic work IS F1 (+F2's read-side twin): every `save()` invocation runs the full
  chain in the emit task — autosave's transaction is paced end-to-end but manual/exit writes
  bypass it entirely. The autosave capture's one-task subsystem read is the documented
  coherence contract (`:2695-2698`) — not a finding.
- **(b) Veil-lift tail:** `finalizeLoadedGame` (`src/main.js:940-1152`) — verified at HEAD:
  physics prep adopted/kicked at function top (`continuePhysicsPrep`, re-validated at
  adoption); every gate an awaited promise on paced machinery
  (`waitForAuthoredPartLibrary`, `waitForInitialAuthoredVisualsWithRetry`,
  `waitForOpeningGpuResources{settleTail}`, physics authority `Promise.race` with 20 s
  bound); `nextPaintSliced`/`nextFrame` between boundaries; pulse loops on every wait;
  `runTransitionGuard.commit` is one-shot O(1) (`enterFlightMode` + `ui:closeAll`, two
  bounded emits). `enterLoadingMode` pays one bounded `renderer.clear` + one bounded
  `_drainFoundryEnvPending` convolve, deliberately placed pre-veil. No atomic O(world) span
  between last slice and the presented first frame.
- **(c) `deferRunTransition` drain contract:** verified — one winner queued while
  `_restoring` (`:640-645`), drained at `_closeRestoreSession` after `_restoring=false` while
  the save-finalized finalizer still pends its awaits, so the veil stays up across the
  handoff; stale guards via `_restoreSequence`/`enterSerialSeq` bumps at session open.
- **(d) Admission/publish atomic spans in boot scope:** `enterSectorChunked` driven with
  per-section yields (`:5113-5121`; sync `enterSector` only as missing-twin fallback),
  `_drainResidencyQueueChunks` (`:5134-5141`), `_spawnPersistentEntities` batched with a
  `RESTORE_YIELD_SLICE_MS` break (`:6129-6163`), `_clearEntitiesChunked` (`:6071+`),
  `drainEmitSlice(4)` inside the save:loaded drain (`:5439`), physics adopt via
  `completeRestoreSteps` behind a named `yield 'physics-restored'` seam (`:5451-5465`).
  New Game `prepareRun` yields every 16 entity destroys + `nextPaintSliced` between chunks +
  `bootstrapScene{yield}` (main.js:588-650). `save:restoring` emit is BOOT-F7 adjudicated.
  Nothing else material.

## Regression notes — W122 machinery verified at HEAD (7acc45245)

- **boot F1 (async import prepare):** `loadEnvelopeFromString` (`:4204-4223`) — gzip leg
  routes `_loadEnvelopeFromStringAsync`; the non-gzip leg now routes the same async lane;
  only `!raw` / non-string / `saveImportByteLength > SAVE_IMPORT_MAX_BYTES` stay synchronous
  and return literal `false` after the `save:error` emit (O(1) rejects preserved).
  `_loadEnvelopeFromStringAsync` (`:4225-4244`) = `acceptSeq` stamp + `await
  _prepareEnvelopeStringAsync` + `_importProfileSideBags` + `_restorePreparedEnvelopeAsync`
  tail — the proven gzip shape.
- **boot F2 (paced autosave fallback verifies):** `_autosaveValidatePreviousSync`
  (`:3573-3589`) and `_autosaveValidateReadbackSync` (`:3708-3731`) are async — `await
  _prepareEnvelopeStringAsync` with `.catch(() => null)` and a
  `_autosaveTransactionCurrent` liveness re-check after each await; the legacy-version inner
  lane (`:3540-3553`) and `_commitAutosaveSnapshot` (`:3218+`) pace
  `previousRaw`/`previousPrepared` the same way and re-check
  `_autosaveInFlight`/`_activeAutosaveJob`/`_restoring`/`restoreSequence` post-await. The
  byte-exact read-back escape is extended to plain envelopes (`storedRaw === snapshot.json`
  → `{ ok: true }`, `:3714`); the mismatch path keeps the async prepare for the cold
  failure receipt.
- **Prepared-envelope FIFO memo:** `_preparedEnvelopeCache` Map — FIFO-8, ok-only
  (`prepared.ok !== true` → no store, `:4275-4281`); consulted in `_writeSlot` at `:1459`
  before any sync prepare, stamped after a successful write (`:1590-1596`) and after async
  prepares (`:4193`) — the verify→write→readback chain re-uses each prepare.
- **hitches F1 (audio bounded post):** `src/audio/audioSystem.js:6997-7013` — the rAF tick
  body contains ONLY lifecycle guards + `postTaskAtBackgroundPriorityBounded(() =>
  this._frame())` + the conditional re-arm; `_frame()` re-guards `!ctx ||
  rt._lifecycleSuspended || ctx.state !== 'running'` at `:7025-7027`; `_stopFrameLoop`
  cancels the pending rAF (`:7015-7023`). A stopped/suspended context cannot run the
  deferred body.
- **hitches F3 (stormWarn sibling contract):** `src/render/renderer.js:2179-2226` —
  `lastWarnAt` stamped on verbatim warns AND heartbeat warns; `>60000` ms quiet-gap heal
  resets `logged`/`suppressed`/`heartbeatMs`; heartbeat doubles 1 s→30 s cap — verbatim the
  laneWarn contract adjacent at `:2228+`.
- **popin W122 machinery:** `prepareSectorExitDeferred`/`rotateSectorDeferred`
  (`assetResidency.js:1676`/`:1720`) snapshot qualifying rows eagerly inside the emit, then
  pace release→retain→coverage (`mintWarmCoverageSteps`, `:1656`) via generator; `finally`
  releases a partially retained owner on abandon (`warm-sector-mint-abandoned`);
  `currentSectorId` assigns at iterator end matching sync mint order. Both ride as leg 0 of
  `_sectorExitCleanupIter` under per-leg `dropLeg` guards (`renderer.js:19362-19416`);
  `queueResidencyWarmMint` FIFO-appends behind in-flight drives (`:19553-19566`; call sites
  `:19710`, `:19755`, `:19880`). Class ledgers `packageCacheOnlyBytesTotal`/
  `softResidentBytesTotal` re-key per mutation (`:838-854`) with O(1) early-outs
  (`:882-884`, `:1060-1064`). `governorRowMemo` keyed on `ownersVersion`+`kind` with
  `activeRequest` restamped per consult (`:1946-1987`); `diagRowMemo` keyed on
  `ownersVersion`+`canonical` (`:1805-1835`). W123 census fold verified: blockedRows /
  blockedReasons / memoryUnitOwners minted on the single census pass and handed to
  `governor.plan` as option projections; `entries`/`unitOwners` skipped outright under cap;
  `blockedBreakdown` consumes the minted reasons (`:2040-2138`). No ledger-bypass sites —
  every mutation funnels through retain/release/re-key where the counters re-key.
- **W121 spot-checks (all present, none touched by W122 commits beyond the items above):**
  `verifyLedgerConsistency` (`assetResidency.js:984`), `noteOwnerVisibility` memo (`:1244`),
  swapEpoch re-stamps at all three request closures (`partsLibrary.js:3173`/`:3887`/`:4087`),
  per-leg sector-exit `dropLeg` guards (above), deferred restore `.catch` parity
  (`saveSystem.js:4610`), native-rebuild abandon `finally { if (!committed)
  candidate.dispose(); }` (`sg02DynamicBodyOwner.js:810-815`), laneWarn quiet-gap heal
  (`renderer.js:2225-2227`).
