# Wave-121 audit — lane: boot-loading

Branch `devin/1791504143-perf-w120`, HEAD `1a369e044` (audit docs on top of `31352a672`). Read-only audit; no tracked file touched. Node-level benching not used — no headlessly-importable save-path module justifies it; the material findings are structural.

## Verdict

`saturated: false` — one **material, evidence-supported** optimization remains: the import/envelope lane still drains the entire chunked restore atomically on the main thread (F1), and four secondary residuals (F2–F5) remain evidence-supported at M-class impact.

## Ranked findings

### F1 — Import lane bypasses the sliced restore entirely (the whole `_restoreChunks` runs as one brick on a production-reachable path)

- **Evidence**: `src/save/saveSystem.js:6309-6311` `importString` → `:4142-4159` `loadEnvelopeFromString` → `_prepareEnvelopeString` (atomic `JSON.parse` + `_prepareEnvelope`) → `_restorePreparedEnvelope` (`:4159`) → `_restore` (`:4645-4675`) which drains `_restoreChunks` via `while (!it.next().done)` with **no** `_restoreFrameYield`. The gzipped lane `_loadEnvelopeFromStringAsync` (`:4162-4181`) worker-prepares but then calls the **sync** `_restorePreparedEnvelope` at `:4180` — contradicting the `importFile` comment at `:6333-6334` ("compressed imports restore through the async lane"). Reachability: `src/ui/screens/saveLoad.js:415-423` `importValidatedSave` → `sys.importString` — live production path from the Save/Load screen.
- **Mechanism**: clicking Import freezes the UI for the entire restore — `save:restoring`, `mode:changed→loading`, sector rebuild, entity spawn, physics adopt all run inside one task; the loading veil cannot paint until the brick ends, then `finalizeLoadedGame`'s async tail runs normally. On a mature save this is a multi-second frozen screen with zero progress feedback — the exact "frozen loading screen" the bar prohibits.
- **Fix sketch**: route both `loadEnvelopeFromString` tails through `_restorePreparedEnvelopeAsync` (`:4507`), threading `acceptSeq` (already the established guard — `:4167`, `:4330`). Keep `_restorePreparedEnvelope` sync only for `loadEnvelope` (lab/harness contract at `runScenario.js`) or dispatch on `helpers.deferLoadedGameRestore` presence, matching `bus.on('game:load')` at `:345-351`. The import callback contract already tolerates promises (`:6335` `out.then(cb)`).
- **Effort**: M (async twin already implements the rollback/`queued`/sequence contract — this is routing, not new machinery). **Magic-frame impact**: H. **Risk**: M — rollback + defer-queue semantics must be preserved verbatim; the async twin already encodes them.
- **Evidence level**: MECHANISM_VERIFIED (code path traced end to end).

### F2 — `mode:changed` is not in the emit-slice whitelist; the load path fires it ≥4× atomically

- **Evidence**: `eventBus.js:410-420` — `emit()` slices only `sector:enter`, `save:loaded`, `sector:exit`. `mode:changed` has 8 listener files. Emits on the load path: `saveSystem.js:4991`, `:5286` (inside `_restoreChunks`), plus `enterLoadingMode`/`enterFlightMode` inside `finalizeLoadedGame` (`main.js:940+`, `~1100`).
- **Mechanism**: each flip runs ~8 subscriber files synchronously — screen mounts/unmounts, HUD rebuild, audio profile swap — inside the restore/veil window. Mid-flight loads stack 4+ of these bricks into the veil budget.
- **Fix sketch**: arm `setEmitSliceBudget('mode:changed', 8)` inside `_openRestoreSession`/`_closeRestoreSession` next to the sector:exit pair (`:4812`, `:5402`) — scoped to the restore window rather than standing, since mode commits are ordering-sensitive outside restores.
- **Effort**: S-M. **Magic-frame impact**: M. **Risk**: M-H — several listeners may assume synchronous mode commit; needs a per-listener ordering audit before scoping.
- **Evidence level**: MECHANISM_VERIFIED for atomicity; listener-cost portion UNVERIFIED (needs real-hardware frame timing — see hardware-unverified list).

### F3 — `_captureRollbackSnapshotAsync` runs `preflightSaveImport` fused to whatever precedes it

- **Evidence**: `saveSystem.js:4625-4627` — `preflightSaveImport(env)` executes, *then* `await this._restoreFrameYield()`. Compare `_prepareEnvelopeStringAsync`, which yields **before** its fallback preflight (`~:4111`). On the non-frozen fallback at `:4607` the full `serializeData()` + `preflightSaveImport` pair runs back-to-back in one task (the ticking-run atomic capture is deliberately documented, but the *fusing* on the frozen lane is a missing seam).
- **Mechanism**: on the async lane, one O(world-graph) validator walk lands inside the same task-segment as the preceding chunk — a missed yield, not a policy gap.
- **Fix sketch**: move the `:4627` yield to before `preflightSaveImport` (or add a second one). S effort. **Impact**: L-M. **Risk**: L.
- **Evidence level**: MECHANISM_VERIFIED.

### F4 — The 9 `afterContinue` continuations are per-call atomic; yields exist only *between* them

- **Evidence**: `saveSystem.js:5077-5094` — each `sys.afterContinue(...)` is one uninterruptible O(subsystem-state) call. W120 sliced *around* them, never *inside*.
- **Mechanism**: the heaviest single continuation bounds the worst slice — whichever registry system's afterContinue walks the most restored state is the residual floor. Which system that is cannot be determined statically; each continuation is a black box behind `registry.get(name).afterContinue`.
- **Fix sketch**: instrument once (dev-only timing shim around each afterContinue on a mature save), then convert the top offender to a chunked twin via the established `*Steps` pattern — only the heaviest, not the whole set.
- **Effort**: M. **Magic-frame impact**: M (potential). **Risk**: L-M.
- **Evidence level**: UNVERIFIED materiality / MECHANISM_VERIFIED structure.

### F5 — ~30 un-chunked `_callDeserialize` regions remain per-region atomic; at least two are O(save-size)

- **Evidence**: `_restoreChunks` (`:4849-5384`) uses chunked twins for the known-heavy ledgers (economy, world, sectorSim, npcJobsRuntime, traffic, claims, asteroidSites/Formations, lossLedger, provenanceLedger, aftermathWrecks, lawSecurity, fieldDepletion, chronicler, fields, missions, capitalBoss) — leaving ~30 plain `_callDeserialize` calls. Spot-checked: `factions.deserialize` (`factions.js:976-986`) bounded table; `economyContracts` (`:203-215`) bounded; `survivorPod` (`:585-610`) capped receipts. **But** `recoveryEncounter.deserialize` (`:798-807`) runs `normalizeState` then a per-record `_publishLungCase` **emit loop** — O(records × emit fan-out); `aceMemory.deserialize` → `normalizeMemory` (`aceMemory.js:182`, `1714+`) walks all ace records plus `normalizeActiveReturns` O(returns × entity lookups).
- **Mechanism**: each plain deserialize is one indivisible brick sized by its ledger; the emit-bearing one (recoveryEncounter) additionally fans out listeners per record inside the slice window.
- **Fix sketch**: chunked twins for `recoveryEncounter` and `aceMemory` class (slice on record boundaries; keep emits inside slices); leave the constant-size regions synchronous.
- **Effort**: M. **Magic-frame impact**: M ceiling on mature saves. **Risk**: L.
- **Evidence level**: MECHANISM_VERIFIED structure; per-region cost UNVERIFIED on real save sizes.

## Regression notes — landed waves (W120 boot machinery)

**Correction first**: the prompt's B1–B8 names (`buildBank`, `decryptArchive`, `cooperativeSlice`, `subscribeVector`, `drainedShield`, sg02 publish asserts, `recordLedger`, `nearestWreck`, `PENDING-GATE`) **do not exist in the tree** — commit `ca626ba4a`'s message misdescribed the diff (correction already recorded at `design/perf/PR194-WAVE-LOG.md:2352` and confirmed independently by the lod sibling report). Verified the **real** landed set instead — all present, all wired correctly:

- **Steps twins**: `completeRestoreSteps`/`_finishNativeRestoreSteps` (`physics.js:396-446`) yield at activity-reset, machinery-reconcile, latch-reconcile, adopt boundaries; `rebuildWorldFromEntitiesSteps` fallback (`:436`); `syncFromEntitiesSteps` 16-body stride (`sg02DynamicBodyOwner.js:743-757`); `_commitNativeOwner` atomic commit documented. VERIFIED.
- **`sector:exit` emit slice**: `setEmitSliceBudget('sector:exit', 8)` armed `_openRestoreSession` (`saveSystem.js:4812-4814`), cleared `_closeRestoreSession` (`:5402-5404`). VERIFIED.
- **afterContinue yields**: `saveSystem.js:5077-5094` — yield between each of the 9 calls. VERIFIED.
- **`settings:changed` seam**: yield between audio/video emit pair (`:5377-5379`). VERIFIED.
- **`restoreCombatStateSteps`**: `combat/persistence.js:59-94` — 4 section yields; `_restoreCombatSteps` yield*s it (`:5618-5648`). VERIFIED.
- **`installedEpoch` self-clear**: `partsLibrary.js:3138-3145` (+ `:3830`, `:4009`) — `__setActiveVisualRoot` clears when `admissionEpoch !== installedEpoch`. VERIFIED.
- **`_restoreSequence` stamping**: captured at `primeAutosaveCapture` (`:2626`); `runSlice` re-arms only while `this._restoreSequence === restoreSeq` (`:2651-2652`). VERIFIED.
- **Stale-rejection gate**: `acceptSeq !== this._restoreSequence` → handled-true at `:4330-4332` (entry) and on the async twin; `save:error` emit gated on `restoreSeqAtArm` (`:5357-5370`). VERIFIED.
- **Background-priority yield**: `_restoreFrameYield` (`:4747-4778`) resolves via `postRestoreTaskAtBackgroundPriorityBounded` (`:202-218`) — `scheduler.postTask(…, 'background')` → `setTimeout(0)`, 48ms bound, starved-downgrade ≥2 timer wins. VERIFIED.

**Additional pipeline notes** (context for the findings):

- `bus.on('game:load')` (`:345-351`) routes through `deferLoadedGameRestore` → `load({preferAsync:true})` → `loadAsync` whenever the helper exists — and it is **always installed** (`main.js:222-244`). The fully-sync `load()` lane is fallback-only (tests/headless). Continue-from-title and Load-from-pause both ride the async lane.
- `save:loaded` budget: armed `setEmitSliceBudget('save:loaded', 8)` at `:5295-5297`, drained `drainEmitSlice(4, 16ms)` at `:5313-5325` — but **never cleared** in `_closeRestoreSession`. Since `save:loaded` is whitelisted anyway, the stale budget=8 only means subsequent non-restore `save:loaded` emits keep slicing at 8 — strictly protective, likely intended; flag as nit/asymmetry vs sector:exit's explicit clear. S effort if housekeeping wanted.
- `entity:destroyed`/`entity:spawned` emits during clear/spawn aren't sliced, but are batch-bounded (16 + wall-clock, `:5956-5973`; spawn batch `:5047-5058`) — bounded.
- **Veil-lift tail** (`finalizeLoadedGame`, `main.js:940-1152`): `enterLoadingMode` (atomic `renderer.clear()` + `_drainFoundryEnvPending` + `mode:changed`), then all gates are bounded async waits (authored visuals timeout, opening GPU cook 20s, physics prep `Promise.race`), `runTransitionGuard.commit` → `enterFlightMode` + `ui:closeAll` (1 listener file). The tail is well-formed; its atomic residue is the `mode:changed` emits → covered by F2.
- **`adoptWorldSnapshot`** (`physics.js:427-431`) is documented "an un-sliceable invoke" — one WASM transaction adopting all bodies; `_commitNativeOwner` (`sg02DynamicBodyOwner.js:807+`) single commit by design. Accepted structural floor — no finding unless a batched adopt API exists upstream (splittability UNVERIFIED; not re-filed as a new item).
- Not re-reported per adjudication list: BOOT-F3(a) enterSector split, BOOT-F7 `save:restoring` slicing + structured-clone copies, F4/F5/F9 tick-paced emit slicing, F6 `combat:damage` interning.

## Hardware-unverified findings (listed separately per contract)

- **F2 listener-cost component**: the ~8 `mode:changed` listener files do DOM/UI teardown per emit — sizing needs real-frame timing; SwiftShader cannot measure it.
- **F4 afterContinue bodies**: worst-case continuation size needs a mature-save CPU profile on real hardware.
- **F5 per-region deserialize sizes**: `recoveryEncounter`/`aceMemory` brick sizes scale with save records — needs real save + real CPU.
- **`adoptWorldSnapshot`/`_commitNativeOwner` WASM cost**: CPU-side and headlessly benchable (sg02 wasm may import under node24) — a micro-bench could size it; left unmeasured here.
- **`enterLoadingMode` GL ops** (`renderer.clear()` + foundry env drain): GPU-side, unmeasurable under SwiftShader by definition.

Golden hash was not re-run for this audit (read-only; no code executed beyond greps — `0b33dde18752…` baseline unchanged by definition).
