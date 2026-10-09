# wave-122 audit — boot-loading lane

Audit branch: `devin/1791504143-perf-w120` @ `007e8d976` (PR #257 HEAD, W120+W121 landed;
supersedes required floor `c3d84934c`). Audit-only: no code written, no app run. Probes:
`test/grok-build20-picture.test.mjs` (node24 --test, 15/15 pass — the 8th-advance pin oracle)
plus a session-local `verifyLedgerConsistency` exercise script (not committed): 24 retains /
8 releases / 6 sectorId re-keys across ceres/vesta/phobos, stepped cleanup drained →
`{ ok: true, mismatches: [] }`, `ledgerDriftEvents: 0`. One node process at a time.

```yaml
saturated: false
```

## Ranked findings

### F1 — Plain-text import still runs the full O(save-size) prepare atomically on the click
**MECHANISM_VERIFIED.** `loadEnvelopeFromString` (`src/save/saveSystem.js:4142-4165`): the
non-gzip leg executes `this._prepareEnvelopeString(raw)` synchronously at `:4153` —
`JSON.parse` (O(bytes)) + `preflightSaveImport` full-graph bound-walk + `fnv1a(safeStringify(
env.data))` checksum (O(data) reserialize + hash) + `clonePlain` + `runMigrations` +
`normalizeRestorableData` — all inside the same task that handles the Save/Load screen's
import click. The sliced machinery exists one branch over: `_prepareEnvelopeStringAsync`
(`:4070-4139`) posts `restore_prepare` to the save worker (2.5 s deadline) and falls back to
`_prepareEnvelopeStringYielded` (`:4230-4274`), which frame-yields between the four
object-graph walks. W121 sliced only the *restore* leg; the *prepare* leg for non-compressed
imports is the lane's last unpaced O(save-size) brick — a multi-MB plain envelope freezes the
UI before `deferLoadedGameRestore`'s `nextFrame()` can even show progress. Every other caller
is already async: slot loads route `_prepareEnvelopeStringAsync` at `:2253`, `:2255`,
`:3960`, `:3991`; the gzip import twin `_loadEnvelopeFromStringAsync` (`:4167-4186`) is the
template — same `acceptSeq` stamp, `save:error` payload, `_importProfileSideBags`,
`_restorePreparedEnvelopeAsync` tail.
**Fix sketch:** route both legs through `_prepareEnvelopeStringAsync` — i.e. keep the O(1)
rejects synchronous (non-string, `bytes > SAVE_IMPORT_MAX_BYTES`, gzip dispatch) so
`importString` still returns literal `false` for them, and return a `Promise<boolean>` for
the rest. Test-side cost is real: three suites pin sync-`false` on prepare rejects —
`test/save-import-bounds.test.mjs:35` (oversize — stays sync if the byte check stays sync),
`test/save-rejected-candidate.test.mjs:215` (no_save/bad_format cases), and
`test/fb-export-bundles-medals.test.mjs:482` (checksum reject — becomes `Promise<false>`,
needs `await`). Deep rejects (checksum/migration/normalize) can't keep a sync answer under
any async prepare — those tests must await or the lane must ship a `importStringAsync`.
**Effort M · Impact H · Risk M** (return-contract shape is the wrinkle, not the plumbing —
the async path is already proven by the gzip leg and slot loads).

### F2 — Seal-write ledger verify still runs whole-ledger prepares atomically on every fallback lane
**MECHANISM_VERIFIED.** The paced autosave transaction (read-prev → worker `validate` →
write-backup → write-primary → readback byte-compare → worker `validate` → write-index,
`src/save/saveSystem.js:3434-3716`) stays paced only while the save worker accepts. Each
fallback drops the whole-ledger verify back into one scheduled task:
`_autosaveValidatePreviousSync` (`:3524`) and `_autosaveValidateReadbackSync` (`:3654-3671`)
call `_prepareEnvelopeString` on the full stored string (skipped only when
`storedRaw === snapshot.json && isGzippedSaveText`, `:3659-3661` — i.e. a gzip byte-identical
hit). The no-worker commit lane `_encodeAutosaveFallback` → `_commitAutosaveSnapshot`
(`:3097`, `:3196`) calls `_writeSlot`, which prepares the previous bytes at `:1449` AND the
post-write read-back at `:1543-1546` — two atomic O(save-size) verifies per write inside one
task. Manual `save()` (`:1386` → `_writeSlot` `:1414-1560`) takes the same double verify
inline on the click. The `storedRaw === snapshot.json` byte compare itself (`:3615`) is a
native string compare — sub-ms/MB, fine; the *prepares* are the bricks.
**Fix sketch:** the transaction's step chain is already async-scheduled
(`_scheduleAutosaveWork`), so the two `*Sync` fallbacks can `await
this._prepareEnvelopeStringAsync(storedRaw)` — worker-first, yielded-twin otherwise — with
the tx liveness guard (`_autosaveTransactionCurrent`) re-checked on resume. For `_writeSlot`,
split the verify: keep the byte compare + carry a caller-proven flag (`_commitAutosaveSnapshot`
already holds the snapshot's worker/prepare result; manual `save()` can run its read-back
through `_prepareEnvelopeStringAsync` behind a promise the `save:written` receipt awaits).
The gzip byte-exact escape at `:1543`/`:3659` is the precedent — a proven-bytes short-circuit
already exists; it just doesn't cover plain envelopes or previousRaw.
**Effort M · Impact M-H · Risk M** (verify-before-index ordering is the contract; keeping the
authoritative result identical across sync/async lanes is what the existing
`_autosaveRollback` reasons exercise — extend, don't fork).

## Lane contract enumeration (hunt items a–d)

- **(a) Load-path O(save-size)/O(world-size) residue:** F1 + F2 are the complete set. Slot
  loads (`loadAsync` → `_prepareEnvelopeStringAsync`), the recovery/backup lane (`:3991`,
  `:3888`), speculative continue prepare (`:2038`, `:3960`), shard-complete autosave capture
  (`captureAutosaveSnapshot` → chunked `validate` posts, `:3362-3426`), and `_restoreChunks`
  (~80 frame yields, `:4885-5420`) are all paced. Sync `load()`/(`:3833`) and `loadEnvelope()`
  (`:4189`) → `_restorePreparedEnvelope` (`:4328`) remain fully atomic — but production routes
  `preferAsync`/`deferLoadedGameRestore` (`src/main.js:222-244` always defers), leaving them
  as the documented test/stub seams (`src/testing/lab/runScenario.js:924`, `load()` overrides);
  matching `serializeData()`/`_restoreAsync` sync twins — classified DOCUMENTED, not a
  finding.
- **(b) Veil-lift tail:** `finalizeLoadedGame` (`src/main.js:940-1152`) — `enterLoadingMode`
  does one bounded `renderer.clear` + one bounded PMREM convolve via `_drainFoundryEnvPending`
  (`:1183-1198`, deliberately placed pre-veil); authored-part-library / initial-visuals /
  opening-GPU / physics-authority gates are all awaited promises on paced machinery;
  `runTransitionGuard.commit` (`src/core/runTransitionGuard.js`) is one-shot O(1) running
  `enterFlightMode` (one `mode:changed` emit — unsliced by design since `_closeRestoreSession`
  already cleared the restore-scoped budget at `:5453-5461`) + `ui:closeAll` — two bounded
  ~8-listener emits. No atomic O(world) span found between last slice and first presented
  frame.
- **(c) `deferRunTransition` drain contract:** verified. One winner queues while
  `_restoring` (`:640`); `_closeRestoreSession` drains it synchronously at `:5453-5461` AFTER
  `_restoring=false`, while the armed `save-finalized` finalizer (`:5383-5408`) is still
  pending its awaits — so the veil stays up across the handoff and the old run's tail is
  stale-guarded (`_restoreSequence`/`enterSerialSeq` bumps at open, `:4812-4876`). The
  re-entered restore's first synchronous span is bounded (open-session bookkeeping +
  generator priming to its first yield).
- **(d) Admission/publish atomic spans in boot scope:** `save:restoring` emit is BOOT-F7
  adjudicated; `enterSectorChunked`/`_drainResidencyQueueChunks`/`_spawnPersistentEntities`
  batches are bounded (`:5030`, `:5051`, `:5083-5094`); `physicsSystem.completeRestoreSteps`
  WASM adopt is one bounded step (`:5377`, W120 skeptic-F1 landed). Nothing else material.

## Regression notes — W121 machinery verified

- **Owner-visibility memo (global B2):** `noteOwnerVisibility` (`src/render/assetResidency.js:
  1242-1266`) memoizes on `{present, visible, assetsVersion, writeSeq}` (`:1246-1252`) — a
  hit returns `memo.held` without walking `state.assets`. `assetsVersion` bumps at every
  retain/release mutation (`:373`, `:508`, `:617`); memo rows die in `cleanupOwnerState`
  (`:639`). `visibilityRowOffGlass` (`:1162-1166`) computes virtual staleness
  `present - row.present - 1 + advancedThisPresent`; the documented boundary (`:1156-1161`)
  is exercised by `grok-build20-picture` row 139 — 7 advances keep the pin, the 8th evicts
  (`test/…:286-298`), 15/15 green this audit. `advanceVisibilityHysteresis` (`:1273-1295`)
  sweeps `max(256, ceil(size/8))` rows per present via persistent `visibilityGcIter` — a
  bounded share, no whole-table pass.
- **Sector ledger/index (popin W121):** `sectorOwnerIndex` + `softOwnerCount`/`rpcOwnerCount`
  maintained at retain (`:664-666`), release (`:690-704`), and every sectorId re-key site
  (`:1604`, `:1634`, `:1679`, `:1725`). Live probe: `verifyLedgerConsistency()` (`:982-1046`)
  → `{ok:true}` after retain/release/sector-rotate + drained stepped cleanup.
- **swapEpoch (skeptic F1):** all three authored-upgrade request closures re-stamp
  `swapEpoch = boundary.userData.admissionEpoch` AFTER `residencyOptionsForBoundary` mints it
  (`src/render/partsLibrary.js:3172-3173`, `:3886-3887`, `:4087-4088`); `setActiveVisualRoot`
  refuses epoch mismatch and self-clears `__setActiveVisualRoot` (`:3143-3147`, `:3838-3843`,
  `:4020-4024` pattern).
- **Per-leg sector-exit guards (skeptic F2):** clean path `src/render/renderer.js:19372-19389+`
  wraps each fused leg (warm-mint leg 0, primary release, post-dispatch, enforce) in its own
  `dropLeg` try/catch stamping `sectorExitCleanup`; a primary fault re-mints postLeg+enforceLeg
  behind the same guards (`:3220-3253`); a post-dispatch fault drops only itself (10 s decay
  sweep is the documented backstop).
- **Deferred restore catch (skeptic F3):** `_restorePreparedEnvelopeAsync`'s deferred closure
  chains `.catch((error) => …)` identically to `_restoreAsync`'s twin
  (`src/save/saveSystem.js:4527-4542` vs `:4715-4731`).
- **Native rebuild abandon (skeptic F4):** `rebuildWorldFromEntitiesSteps`
  (`src/core/sg02DynamicBodyOwner.js:771-816`) — `finally { if (!committed)
  candidate.dispose(); }` at `:810-815`; `iterator.return()` runs finally, never catch, so an
  abandoned drive disposes the scratch RAPIER world.
- **laneWarn quiet-gap heal (skeptic F6):** `renderer.js:2225-2227` — a lane silent >60 s
  resets `warns`/`suppressed`/`summarized`/`heartbeatMs` before the next fault.
- **Ledger drift verify (skeptic F5):** `enforceSoftResidencyBudgetsSteps`
  (`assetResidency.js:1052-1154`) early-outs O(1) when under budget and verify not due
  (`:1058-1062`); every 4th sweep (`LEDGER_VERIFY_EVERY_ENFORCES=4`, `:1054-1055`) re-derives
  every ledger in a yielded walk and emits `ledger-drift` only on real mismatches
  (`:905-978`, `:1130-1136`); eviction still runs via the stepped twins only on real overage.
  Live probe: 0 drift events across the workload.
- **W121 boot/popin/hitches machinery:** import lane routes `_restorePreparedEnvelopeAsync`
  (`saveSystem.js:4164`); `mode:changed` restore-scoped emit slice armed at
  `_openRestoreSession` (`:4843-4849`, budget 8) and cleared at close; exponential
  dedup-heartbeat backoff 1 s→30 s + 60 s quiet heal present on all three ledgers:
  `warnDedup.js:36-42`, `renderer.js laneWarn:2238-2247`, `eventBus.js busError:135-144`.

No hardware-verifiable measurements on this box (SwiftShader): both findings are
mechanism-level; GPU/frame-time deltas tagged hardware-unverified — the owner's
`scripts/gpu-evidence-run.mjs` path on a real-GPU box is the verification route.
