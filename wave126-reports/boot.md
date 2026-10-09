# Wave-126 Audit Report — lane: boot-loading

- **Repo**: coldshalamov/SpaceFace
- **Audited commit**: `61ca3532c` (branch `devin/1791504143-perf-w120`, PR #257 open — waves 120–125 landed, W126 popin `3f98caa1a` + revert `2a5fbebd6` on top)
- **W125 commits under audit**: `9e72466b4` (boot: NG+ under veil, mirror deltas, generation tracking), `2ed5695a1` (popin: bySectorId lane + membership funnel), `b3b142e24` (hitches: shelved-member discovery cells)
- **Hardware**: Windows Server 2022 + SwiftShader. No GPU present; GPU-cost conclusions are hardware-unverified. CPU-side counters only.
- **Mode**: read-only audit. No code written, no PRs, no app launches. Node used once to run `sectorMembershipViolations()` (reported `{"violations":[]}`).

## Verdict

`saturated: false` — two evidence-supported findings remain in-lane, both small: (F1) a microtask-window stale-row in the mirror collect's re-queue merge, and (F2) `applySharedStoreKeys`' unyielded multi-MB write burst inside the boot sync. All W125 machinery verifies clean; every click-path sync prepare/export/import caller is either unreachable or a documented cold seam.

## Findings (ranked by evidence × materiality)

### F1 — Mirror collect re-queue can clobber a fresher writer delta (stale-row window)

**Evidence (MECHANISM_VERIFIED mechanism; UNVERIFIED incidence)**

- `src/save/saveSystem.js:583-593` — the uncovered-writer arm: `Promise.resolve().then(() => this._collectSharedStoreKeysChunked()).then((keys) => { this._sharedStoreCollectQueued = false; this._queueSharedStoreMirror(keys || {}); })`.
- `src/save/saveSystem.js:494-504` — `_collectSharedStoreKeysChunked` brackets on `_saveStoreGeneration`: collect, compare, return (≤3 attempts, then sync fallback). The compare that *passes* is inside the returned promise's resolution.
- `src/save/saveSystem.js:575-597` — `_queueSharedStoreMirror(patch)` merges via `Object.assign(this._sharedStorePatch, patch)` — **last writer wins per key, with no generation/staleness check on the collect's map**.
- The hazard: between the collect's gen-compare (inside `_collectSharedStoreKeysChunked`) and the merge inside the caller's `.then`, there is a microtask hop. A writer on a pending microtask chain (async save/restore tail, settings write — all in-tree writers go through wrapped `setItem` → `bumpSaveStoreGeneration` + their own `_queueSharedStoreMirror(delta)`) can land a *newer* value into `_sharedStorePatch`, then the collect's stale map assigns over it. The flush ships the older value.
- The window is one microtask drain — narrower than the frame-yield window the bracket covers — but the consequence is durable: the mirror holds a stale row for that key until the key's next write (writer deltas are patch-merged, not re-collected). For `sf.save.N`/`sf.save.index` that's next-save-bounded; for an `sf.recovery.N` row written by a promotion, longer.
- Everything else in the bracket contract verified closed: `KEY_RE` (`sharedPlayerStore.js:20`) admits `sf.save.*`/`sf.recovery.*`/`sf.settings.profile.v1` ⊆ tracked prefixes (`sf.save.`/`sf.recovery.`/`sf.settings.` — `saveSystem.js:110-121`), so no *uncovered-key* stale window remains after the sf.settings.* tracking change. Direct property writes (`localStorage[k]=v`, `delete localStorage[k]`) bypass the wrapper — zero in-tree sites (grepped `src/`); documented bound of the wrapper approach, same as before.

**Mechanism**: a rare mid-collect write ships an older mirrored row — the other shell merges a stale envelope (skew, not data loss; local store is always correct).

**Fix sketch**: make `_collectSharedStoreKeysChunked` return `{keys, gen}` (or stamp `_sharedStoreCollectGen` at the passing compare), and in the re-queue `.then` re-check `_saveStoreGeneration === gen` before `Object.assign` — on mismatch drop the map (the writer's delta already landed) or loop once. Three-line guard; the writer's own delta preserves the end state.

**Effort**: S | **Magic-frame impact**: L (mirror-only, one-task-window, self-heals per key) | **Risk**: L

### F2 — `applySharedStoreKeys` is the one unyielded multi-MB leg left inside the boot sync

**Evidence (MECHANISM_VERIFIED)**

- `src/save/saveSystem.js:539-540` — `mergeSharedStoreKeys(localNow, remote || {})` then `applySharedStoreKeys(merged)` run as one synchronous segment inside `_syncSharedPlayerStore` (fired from `init()` :488).
- `src/save/sharedPlayerStore.js:272-297` — per merged key: `storage.getItem(key) === value` compare, then `setItem` on mismatch; plus a tombstone prune sweep over `storage.length`. No yields anywhere — unlike the sibling collect (`collectLocalSharedStoreKeysChunked`, chunk=16 :119-131) and `_scheduleSlotIndexValidation` (yield/16 keys, `saveSystem.js:2245`), which exist precisely because these strings are multi-MB.
- Cost: on a mirror-equipped shell with a divergent remote, every merged key pays a ~220KB read-compare and the divergent subset pays a ~220KB sync commit each — a single task segment scaling with total save bytes, running during the boot/menu window while `isSharedStoreSyncPending()` gates Continue.
- Once per boot, not a click path — but it is exactly the "O(save-bytes) sync stretch in the load path" class this lane owns, and the only remaining unyielded one in it.

**Mechanism**: one sync burst sized by total save bytes inside the boot task; on mature profiles a dropped frame or two while "Checking saves…" is up.

**Fix sketch**: chunked twin `applySharedStoreKeysChunked` yielding between keys (and between tombstone-sweep strides), driven by `_syncSharedPlayerStore` — merges are idempotent so no generation bracket needed; keep the sync export for callers that don't await.

**Effort**: S | **Magic-frame impact**: L-M (once per boot, mirror-equipped shells only; bounded by remote divergence) | **Risk**: L

## Regression verification — W125 machinery (all concretely verified at `61ca3532c`)

| Item | Verdict |
|---|---|
| **popin F1 sector lane** (`2ed5695a1`) | VERIFIED — canonical key `e.homeSectorId \|\| (data.homeSectorId \|\| data.sectorId) \|\| null` (`coreSystem.js:1114-1118`); append stamps `e._indexSectorKey` + `indexSlotMember` + `bumpLaneVersion('sectorMemberships')` (:917-919); `removeEntityIndex` (:1066-1069) and `removeEntitiesFromIndex` (:1446-1449) unindex + bump; `clearEntityIndex` clears the lane (:783). |
| **popin F2 funnel + guard** | VERIFIED — `syncEntitySectorMembership` (:1306-1315) is the only production restamp path (unindex→stamp→index→bump, unindexed ids skipped); ran `sectorMembershipViolations(root)` → `{"violations":[]}` across the 14-file allowlist (5 scan dirs). |
| **boot NG+ under veil** (`9e72466b4`) | VERIFIED — `main.js:597` `await resolveNewGamePlusOverlay(registry, opts)` inside `prepareRun`, after `enterLoadingMode` (:592); resolver async (:866-881) preferring `saveSystem.prepareNewGamePlusAsync` with `prepareNewGamePlus` fallback; `prepareNewGamePlusAsync` (`saveSystem.js:2580`) prefers `_prepareNewGamePlusSlotAsync` (:2551 — yielded `_prepareEnvelopeStringAsync` on both primary and recovery reads); sync `_prepareNewGamePlusSlot` preserved. Failure throws `GameStartReadinessError('NEW_GAME_PLUS_UNAVAILABLE')` (:876) → transition catch calls `discardRun` (`newGameStartTransition.js:147-149`, `preparationStarted` set :44) and `describeGameStartFailure` maps the code (:183). No sync prepare on the click frame. |
| **boot mirror deltas** (`9e72466b4`) | VERIFIED — both recovery-promotion sites emit `{[LS_PREFIX+slot]: backupRaw, INDEX_KEY: indexJson}` via `_queueSharedStoreMirror` (`saveSystem.js:4348-4352` sync load, `:4462-4466` loadAsync); worker-encode settle forwards `limit`/`actual` on bound verdicts (:3434-3439); `bumpSaveStoreGeneration` tracks `sf.settings.*` (:110-121, wrapper + `storage` listener :123-149). |
| **hitches shelved discovery** (`b3b142e24`) | VERIFIED — `activityRuntime.js:967-1039`: `CLASSIFY_DISCOVERY_CELL_WU = 2048` (:876), partition-0 members keyed on build-time pos (:992-999), quiet passes query cells with `discover + shelved.maxPresence` pad (:1014-1037), O(list) walk only as cold build + every-8th-pass audit (`CLASSIFY_DISCOVERY_AUDIT_EVERY = 8` :877; stale check :977-981 folds `PHYSICS_PARTITION_EPOCH` + `entityIndexVersion` + null cells), `walks`/`queries` counters (:973-974,:983,:1014), per-candidate envelope predicate identical to the old walk (:1004-1008 vs :1029-1034). |
| **W124 spot-check: mirrorPatch** | VERIFIED (W125 touched saveSystem.js) — `_writeSlot` still mints `{[primaryKey]: json, [recoveryKey]: previousRaw\|null, INDEX_KEY: indexJson}` (:1872-1875) shipped by `_publishSaveResult` → `_queueSharedStoreMirror(write.mirrorPatch)` (:1983); uncovered writers still defer to the generation-bracketed chunked arm (:583-592). `deleteSlot` shape unchanged. |
| **W124 spot-check: incremental plan ledger** | VERIFIED-BY-PROXY — W125 touched `assetResidency.js`; the W126 popin lane re-verified `enforcePlanMemo` composition + every seq funnel (register/unindex/pending transitions/byte ledgers). No boot-side consumer of the plan ledger changed. |
| **W124 spot-check: seq-guarded rotate repoint / frame-tail quarantine** | NOT RE-VERIFIED per prompt — the skeptic's rotate-marker F1 was already fixed in `2ed5695a1` (popin F4); `presentationRunner.js` untouched by W125/W126 commits. |

## Lane-hunt summary

- **(a) Sync prepare/export/import callers reachable from a click path — VERIFIED CLEAN.** `saveLoad._export` prefers `exportSlotAsync` (`saveLoad.js:1457-1460`; the sync branch runs only when the async twin is absent — same `save` object defines both, so unreachable). `importValidatedSave` → `importString` → `loadEnvelopeFromString` (`saveSystem.js:4602-4620`): O(1) rejects stay sync (byte-cap), all deep work rides `_loadEnvelopeFromStringAsync` → `_prepareEnvelopeStringAsync` → `_restorePreparedEnvelopeAsync` with `acceptSeq` guard; `importFile` funnel identical plus a `file.size` pre-reject (:6893-6901). Remaining sync `_prepareEnvelopeString` callers are all documented cold seams: `_writeSlot`'s previous-generation verify (:1725, proven-envelope memo consult first), the write-verify mismatch receipt (:1832, named cold receipt), sync `load()`/`loadEnvelope()`/`_newerUnplayableSkip`/`_prepareNewGamePlusSlot` (sync lanes whose async twins serve every click path), sync `exportSlot` (unreachable via UI).
- **(b) Generation bracket** — one residual stale-row window → **F1**. The sf.settings.* tracking change closed the prior uncovered-key window (KEY_RE ⊆ tracked prefixes); the residual is the re-queue merge ordering, not coverage.
- **(c) Worker cold-start — VERIFIED CLEAN.** `_warmSaveWorker` minted at `init()` (:487), pooled/released on `!_activeSaveWorkerBusy` + `usable` + `!superseded`; concurrent saves mint bounded per-request Blob workers; first save never pays a cold parse.
- **(d) Still-atomic O(save) legs** — one new minor → **F2** (`applySharedStoreKeys`). Verified clean: `_scheduleSlotIndexValidation` yields every 16 keys and serves generation-matched collected raws (:2223-2260); `_updateIndex` is O(#slot-cards) + bounded index JSON (:2053+); `mergeSharedStoreKeys` is in-memory over the materialized map; the `save:loaded` refresh stays on the 8 adjacent sliced listeners (W16); `saveAsync`'s whole-ledger prepares ride the async lanes with liveness re-checks (W24); `restoreSequence`/speculative-prepare sigs re-arm on bump (:374, :4313, :4401).
- **(e) Veil-lift tail — VERIFIED CLEAN.** `finalizeLoadedGame` (`main.js:947+`) is fully paced: `enterLoadingMode` first, `payload.physicsPrep` adoption with `_sg02Token` re-validation, `startGatePulse` stages + `nextPaintSliced` boundaries between library/visuals/GPU/physics gates; W9/W10 continue-fade presented-rAF lift + failsafe machinery intact and untouched by W125/W126 diffs. Between the last paced slice and the first presented frame the only sync leg is the `guard.commit → enterFlight` flip itself — bounded, emit-sliced.

## Explicitly not re-reported

Adjudicated KEEP/DOCUMENTED/REJECTED/GATED items from `design/perf/PERF_W4_CLOSURE_2026-09-29.md` and `HILLCLIMB-LOG.md` were read and are excluded per the audit contract — including deferred `saveAsync` slot-parameterized txn (risk-M), `BOOT-F3(a)` enterSector generator split, `BOOT-F7` save:restoring emit slicing + multi-MB structured-clone copies, F4/F5/F9 tick-paced emit slicing (determinism contract), the `_captureRollbackSnapshot`/`_serializeDataFrozenAsync` coherent-capture rule, and the world-store.js/slotMap non-existence caveat.
