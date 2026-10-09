# wave-124 audit — boot-loading lane

Audit branch: `devin/1791504143-perf-w120` @ `f33dc3058` (PR #257 HEAD — W120+W121+W122+W123
all landed, incl. the W123 boot batch `10cd72d65`, hitches `f39fd835c`, popin
`7acc45245`+`8311f58e9`). Audit-only: no code written, no app run. All findings are
code-inspection proofs (MECHANISM_VERIFIED) unless tagged otherwise.

```yaml
saturated: false
```

## Ranked findings

### F1 — every successful save still pays a whole-corpus synchronous collect inside the receipt task
**MECHANISM_VERIFIED.** `_publishSaveResult` (`src/save/saveSystem.js:1895-1911`) ends every
landed write with `this._queueSharedStoreMirror()` — **no patch** (`:1909`). The no-patch arm
runs `Object.assign(this._sharedStorePatch, collectLocalSharedStoreKeys())` (`:573-585`): a
synchronous `for (i < localStorage.length)` walk that `getItem`-materializes **every**
`sf.save.*` + `sf.recovery.*` + `sf.settings.profile.v1` blob
(`sharedPlayerStore.js:19` KEY_RE). It fires on all three write lanes:

- the paced chain's **final task** — `_runPacedSaveChain` calls `_publishSaveResult` in the
  same task as `_writeSlot`'s storage leg (`:1604-1612`), so W123's last hop is
  `storage I/O + corpus materialization + PUT` fused;
- sync `save()` inside the emit (`:1411`);
- autosave receipts — `_commitAutosaveSnapshot` (`:3494`) and the worker-commit lane
  (`:4048`); plus recovery promotion (`:4168`, `:4278`).

On a mature profile (the module measures real envelopes at ~205-224 KB each,
`sharedPlayerStore.js:9-13`) this is a multi-MB materialization — the exact stretch the
already-built `collectLocalSharedStoreKeysChunked` was made to avoid ("on a mature profile
the getItem materialization is a multi-MB main-thread stretch", `:111-114`). Then the armed
flush pays `JSON.stringify({keys: patch})` over **the whole corpus** and one corpus-wide PUT
per save (`sharedPlayerStore.js:331+`) — N-envelope bytes shipped for a one-envelope change.

**Fix sketch:** the write already knows its delta — pass the patch
(`{ [primaryKey]: json, [recoveryKey]: previousRaw ?? null, [INDEX_KEY]: newIndex }`), the
exact shape `deleteSlot` already emits at `:2588`; or, conservative-identical, route the
no-patch arm through `this._collectSharedStoreKeysChunked()` (`:491-501` — generation-bracketed,
3-attempt tear-retry, sync-collect fallback) and arm the flush on resolve. Ordering is already
owned by `_sharedStoreWriteChain` + the accepted-generation ledger.
**Effort S · Impact M-H · Risk S-M** (M if delta-patch: non-API writers are devtools-only,
every API-mediated write is covered by `installSaveStoreWriteTracking`; S for the chunked route).

### F2 — the paced save chain still carries two un-sliceable O(save) main-thread legs per write
**MECHANISM_VERIFIED.** Inside `_runPacedSaveChain` (`src/save/saveSystem.js:1470-1618`):

- **(i) envelope head fused to the serialize tail** — `safeStringify(data)` +
  `fnv1a(dataJson)` + `_readIndex` + `stampSlotCard` (`:1519-1538`) runs on the same task as
  `_serializeDataFrozenAsync`'s last slice: the first `await hop()` is *after* the block
  (`:1541`). A small save pays serialize + stringify + hash inside the `game:save` emit task;
  any save pays an O(save) stringify+hash on the resume task.
- **(ii) preflight + `JSON.stringify(envelope)` as one task** (`:1548-1559`) — the SECOND
  full stringify of the same data, after (i)'s own `safeStringify` for the checksum.

The autosave lane already does both passes off-main — the save-worker encode path produces
`encoded.json` + `encoded.checksum` per-section (`_startAutosaveEncoding` /
`_encodeAutosaveFallback`, `:3335-3374`; the checksum is proven byte-equivalent by the same
read-back verify both envelopes pass). The paced chain didn't reuse it.

**Fix sketch:** hand `data` to the existing encode lane — the descriptor is already
`{fmt, version, savedAt, playtimeS, slot}`; parameterize slot and stamp label/thumbnail on the
envelope head post-decode (`stampSlotCard` never touches `data`/`checksum` — verified
`slotStill.js:38-58`). Main thread then keeps only the preflight bound-walk + platform
`localStorage` I/O. Fallback if workerless: fold (i) into the next hop so it no longer fuses
to serialize's tail. **Effort M · Impact M · Risk M** (receipt/checksum byte-identity).

### F3 — `_finishExportJson` pays a full sync serialize on the export click when both blobs fail
**MECHANISM_VERIFIED.** `src/save/saveSystem.js:6569` — `JSON.stringify(this.serialize(slot))`
runs inside `_export`'s async continuation (`saveLoad.js:1450-1475`) whenever primary AND
recovery prepares both fail (empty slot / all-corrupt profile). Whole `serializeData()` +
stringify on one task — rare but click-reachable.
**Fix sketch:** same boundary contract as everywhere else — `await
this._serializeDataFrozenAsync()` when `_frozenTickBoundary()` holds, documented sync capture
otherwise; the envelope `JSON.stringify` stays a bounded pass (or rides F2's encode lane).
**Effort S · Impact L · Risk S.**

## Lane contract enumeration (hunt items a–d)

- **(a) Still-atomic save/restore-adjacent spans from a click — residue = F1/F2/F3 above.**
  Everything else enumerated is paced or documented: imports
  (`loadEnvelopeFromString`→`_loadEnvelopeFromStringAsync`, `:4439-4463`), slot loads
  (`loadAsync` — spec-consume + generation-stamped `specHit`/`specByteHit` + worker prepare,
  `:4194-4290`), rollback capture (`_captureRollbackSnapshotAsync` — frozen→sliced,
  live→documented coherent capture, preflight/migrate/normalize each behind
  `_restoreFrameYield`, `:4920-4962`), index validation (`_scheduleSlotIndexValidation`
  yields every 16 keys + worker meta, `:2161-2175`), `deleteSlot` O(index) (`:2579-2592`),
  `stampSlotCard`/`boundSlotThumbnail` bounded 160×90 (`slotStill.js:18-58`), card/index reads
  (`_slotIndexWithFallback` — O(corpus) enumerate+getItem walk but **cached per
  write-generation**, one walk per write by design — the mirror collect in F1 is the wasteful
  twin of this same walk). `pagehide`/`beforeunload` flush deliberately sync (`:2635-2647`).
  Live-flight `game:save` (F5 while unfrozen) → documented one-task coherent capture —
  declined. `_captureLegacyAutosave` reachable only under a non-canonical `serialize` —
  test seam. `save:restoring` emit → BOOT-F7 adjudicated.
- **(b) Veil-lift tail — clean at HEAD.** `finalizeLoadedGame` (`main.js:940-1160`): every
  gate an awaited promise (`waitForAuthoredPartLibrary`, `waitForInitialAuthoredVisualsWithRetry`,
  `waitForOpeningGpuResources{settleTail}`, physics `Promise.race` 20 s bound);
  `nextPaintSliced`/`nextFrame` between boundaries; `runTransitionGuard.commit` =
  `enterFlightMode` + `ui:closeAll` (two bounded emits); `enterLoadingMode` pays one bounded
  `renderer.clear` + one bounded `_drainFoundryEnvPending` pre-veil (`main.js:1174-1198`).
  `_restoreFrameYield` has both rAF and 48 ms timer fallback — a starved compositor can't
  deadlock the drain (`saveSystem.js:5095-5108`). No atomic O(world) span between last slice
  and presented frame. (main.js untouched by W123.)
- **(c) Deferred-continuation drain — verified at HEAD** (saveSystem.js WAS touched by W123):
  `deferRunTransition` queues one winner while `_restoring` (`:645-652`);
  `_closeRestoreSession` drains it AFTER `_restoring=false` and before error surfacing
  (`:5727-5758`), restores `sector:exit`/`mode:changed` emit-slice budgets to 0, clears
  `restoreEnvelopeRecordIds` pre-error-path; failed-with-drained returns `superseded`, not a
  throw. Veil stays up across the handoff.
- **(d) Boot/admission/publish atomics — nothing new material.** `enterSectorChunked`/
  `_drainResidencyQueueChunks`/`_spawnPersistentEntities`/`_clearEntitiesChunked` paced as
  verified last wave; `save:envelopePrepared` fans the parsed `data` by reference to
  `_prefetchSaveEnvelopeVisuals` (O(records) stub enumeration + bounded async warm kicks on an
  async continuation — inside the load's async lane, not a click task);
  `save:completed`/`save:started` fan-out is O(1) emit + listener re-renders (the index walk
  they trigger is the by-design per-generation one, folded into F1's fix surface);
  `_openRestoreSession` is O(1) + emits.

## Regression notes — W123 machinery verified at HEAD (f33dc3058)

- **boot F1 (paced save chain) — VERIFIED.** `saveAsync` defers to `save()` when
  `!_frozenTickBoundary()` (`:1454`, comment `:1449-1453`); supersede marks the in-flight job
  (`:1456-1458`). `_runPacedSaveChain`: `const state = this.state` captured once (`:1473`);
  `abortReason()` = superseded/restoring/stale-epoch (`:1477-1481`), re-checked after every
  leg — post-serialize (`:1514`), inside the envelope catch (`:1530`), after each `await hop()`
  (`:1545`, `:1565`, `:1580`), and after the awaited async prepare (`:1585`). `fail('stale')`
  returns `false` with **no receipt** (`:1484`); `fail('superseded')` re-`_noteWritePending`s
  the active job (`:1493-1498`); `endFocusLossSaveWrite(state)` in `finally` uses the captured
  realm (`:1615`). `game:save` → `saveAsync` (`:331`); `game:exitToMenu` →
  `requestExitAutosave({paced:true})` (`:471`) → `saveAsync(AUTOSAVE_SLOT,…)` (`:2692`);
  the `pagehide`/`beforeunload` flush calls `requestExitAutosave()` bare → sync `save()`
  (`:2635-2647`, `:2693`). `_beginRunEpoch`/`_beginRestoreSequence` supersede the in-flight
  paced job (`:3171`, `:3194+`). Exit-to-menu flips only `state.mode` → 'menu'
  (`main.js:349-353`) — no epoch bump, no `_restoring`, no state rebind — so the paced chain
  completes across its hops while the menu paints between legs (verified: if the freeze lifts
  mid-serialize, `_serializeDataFrozenAsync` retakes atomically, `:951-955`).
- **boot F2 (async export) — VERIFIED.** `exportSlotAsync` consults
  `_cachedPreparedEnvelope` on primary (`:6547`) AND recovery (`:6552`), falls back to
  `await _prepareEnvelopeStringAsync(...).catch(() => ({ok:false}))` on both; `save:exportRecovery`
  emit preserved (`:6556-6561`). `_finishExportJson` holds the serialize fallback +
  `save:error` on null (`:6569-6572`). `saveLoad._export` awaits `exportSlotAsync` first;
  sync `exportSlot` only when the async twin is absent (`saveLoad.js:1457-1461`), then
  `exportSave`/raw-blob fallbacks. `capturePhotoPngAsync` — settles once (`settled` latch),
  every error path resolves `{ok:false}`, sync fallback where `toBlob`/`FileReader` absent
  (`pause.js:657-687`).
- **hitches F1 (corpse sweep gating) — VERIFIED.** `corpseSignal` arms on a membership-dirty
  `!alive` row in the dirty walk (`coreSystem.js:551-557`); `corpseSweepDue = corpseSignal ||
  tick % 64 === 0` (`:572-573`); else the rolling 128-row probe with wrap cursor
  (`:575-583`); the full backward collect runs only when due (`:585-589`);
  `playerId` excluded; `markEntityIndexSourceSynced` still runs every tick. Bound: an unmarked
  `alive=false` kill despawns within max(⌈list.length/128⌉, 64) ticks — probe finds it or the
  backstop fires.
- **hitches F2 (diagnostics quarantine) — VERIFIED.** `renderUpdate`'s `finally` wraps
  `diag.update(frameDt)` in try/catch with `perf._diagErrorLogCount` — 20 verbatim-capped
  `console.error` + suppressed notice at 21 (`registry.js:1002-1013`). The journal-ack return
  can no longer be masked.
- **W122 spot-check:** W123 diffs touched `saveSystem.js`, `pause.js`, `saveLoad.js`,
  `coreSystem.js`, `registry.js`, `assetResidency.js`, `assetLoader.js`,
  `resourceGovernor.js`, `renderer.js` (+11 hook lines), `check-sector-prewarm.mjs`, tests —
  audio bounded-post (`audioSystem.js`) and stormWarn (`renderer.js:2179-2226`) untouched;
  the two W123 popin items re-verified: `governorBlockedMembers` Set — re-keyed at mutation
  funnels (`:881-888`), stale members re-qualified at consult (`assets.get(entry.key)!==entry`
  → skip) in both sync (`:2129-2136`) and Steps (`:2264-2272`) paths, wholesale drift rebuild
  (`:1072-1180`), delete on entry removal (`:1576`); `rotateSectorDeferred` — eager row
  snapshot, paced release→retain→coverage generator, `warm-sector-mint-abandoned` finally,
  `currentSectorId` assigned at iterator end (`:1767-1805`); the entry seam's `queueWarmMint`
  hook chains `mintIter` behind `_sectorExitCleanupIter` via generator composition — FIFO
  (`renderer.js:19797-19806`).

## Previously verified / adjudicated — unchanged this wave

Load side is fully paced end-to-end; the remaining sync `serializeData()` calls are the
documented coherent captures (live-flight save, unload flush, live-run rollback) or test
seams (`load()`, `loadEnvelope()`, `_captureLegacyAutosave`). The localStorage platform
calls inside `_writeSlot` are atomic per call by API design — bounded by json bytes.
