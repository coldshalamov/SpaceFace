# wave-123 audit — in-flight hitches lane

Audit branch: `devin/1791504143-perf-w120` @ `9d1db72d6` (≥ required `767089340`; W119+W120-lod
via PR #247, W120+W121+W122 on PR #257).
Audit-only: no code written, no PR, no app run. Headless probes: `scratch-w123-hitches-ledger*.mjs`
(session-local, not committed), node24 `/c/hostedtoolcache/node/24.0.1/x64/node`, one process.
SwiftShader box: all timings are CPU-scope; no GPU-cost conclusions drawn.

```yaml
saturated: false
```

## Ranked findings

### F1 — lifetimeSweep corpse-compact walks `entityList` unconditionally every tick
**MECHANISM_VERIFIED.** `src/core/coreSystem.js:559-563` — at the end of every tick the reverse
walk `for (let i = list.length - 1; i >= 0; i--) if (e && !e.alive) corpseIndices.push(i)` runs
over **all** of `entityList` regardless of whether anything died. This is the last unconditional
per-tick O(n) sim leg in lane scope: the clock walk above it (:506-510) already has the
`skipQuietClocks` gate, `packCombatTable` (:384 → `combatTable.js:48-`) is lane-version gated with
a pose-only in-place refresh, `refreshVolatileEntityIndex` (`coreSystem.js:1489`) runs on a fixed
8-tick cadence, and `reconcileEntityIndexSource` (:1467) early-outs when the source list is synced.

- Per-element work is a liveness compare — small constant; at plausible live counts (hundreds to
  ~1-4k entities) this is a ~20-300µs atomic burst inside `registry.step`, every tick, even in a
  fully quiet sector. **Not measured on hardware** — CPU-scope estimate only (SwiftShader box).
- **Slice avenue (deterministic-preserving):** the walk itself is hash-safe to skip when no death
  occurred — it only collects `corpseIndices`, mutates nothing. Gate it on a per-tick "death
  observed" latch armed wherever `alive` flips to `false`, plus a `freeIds`/corpse-observer drain.
  **Catch:** `grep` finds ~168 `.alive = false` write sites across **79 files** — a latch requires
  a convention (setter/funnel or index-maintained deadCount) or an audit of every kill path;
  missing one site leaks corpses (stale mesh/slot bindings, id-recycle starvation). A cheaper
  gate on `hasDirty(DIRTY.MEMBERSHIP)` is **unsafe**: not every kill marks membership — this
  sweep's own kills at :517/:522 do, but external `alive=false` paths are not uniform.
- Effort **M** (kill-site convention + audit), magic-frame impact **L** (sub-ms burst; only pays
  at large entity counts), risk **M** (corpse-leak if an arming site is missed — same failure class
  as the ledger-id leak the sweep itself guards against at :423-429).

### F2 — `diagnostics.update(frameDt)` runs unguarded in `renderUpdate`'s `finally`
**MECHANISM_VERIFIED (gap), UNVERIFIED (throw likelihood).** `src/core/registry.js:1002-1004`:
the presented-frame owner `runRenderUpdatePhase` returns inside a `try`, and the `finally` calls
`diag.update(frameDt)` with **no try/catch**. If the diagnostics collector throws, the exception
propagates out of `renderUpdate` to the rAF caller *and masks* `runRenderUpdatePhase`'s return
value (the `false` on the stage/frozen-submit path at `renderUpdatePhase.js:68` that says "the
journal range was not consumed — do not acknowledge"). Every other presented-frame lane is
individually guarded: stage present/prewarm (:53-93, log-capped 20), render prepare/draw
(:97-133), bombPresentation + vfx (:111-118), feel + ui (`runFeelAndUi` :159-179). This one call
is the remaining unquarantined site on the presented frame.

- **Fix sketch:** wrap in `try { diag.update(frameDt) } catch (err) { capped console.error }`,
  matching the existing lane pattern (cap `VFX_ERROR_LOG_CAP`-style at 20).
- Effort **S**, magic-frame impact **L** (collector is unlikely to throw; failure mode is a
  masked journal-ack + thrown frame, not a recurring cost), risk **S**.

## Hunt coverage (B3: per-tick O(n) sim-atomic bursts)

Tick structure: `registry.step` (`src/core/registry.js:904-984`) = `core.preStep` → `input.update`
→ partition system updates → `core.lifetimeSweep`. Enumerated every leg inside:

| Leg | Site | Verdict |
|---|---|---|
| preStep movables pose-publish walk | `coreSystem.js:359-383` | **Gated.** physicsSleeping + poseStill early-outs; `markDirty` only on movers. O(movables) but early-outed — no burst on a quiet tick. |
| `reconcileEntityIndexSource` | `coreSystem.js:1467` | **Gated.** Early-out on synced source list; full rebuild only on drift. |
| `refreshVolatileEntityIndex` | `coreSystem.js:1489` | **Gated.** `VOLATILE_INDEX_PERIOD_TICKS = 8` cadence. |
| `packCombatTable` | `coreSystem.js:384` → `combatTable.js:48` | **Gated.** lane-version latch (`entityIndexLaneVersion(COMBAT_TABLE_LANES)`) + pose-dirty in-place refresh; no Map.clear on the quiet path. |
| `stampNearWorkBudget` | `coreSystem.js:385` → `activityScheduler.js:194` | **Gated.** rotating S1 NEAR budget (rotary start = `tick * limit % n`); `always-awake` reads a cached bit refreshed on the volatile-index cadence — no O(awake) Set rebuild per tick. |
| lifetimeSweep clock walk | `coreSystem.js:506-531` | **Gated.** `skipQuietClocks` skips the whole walk when short-lived lanes are empty. |
| dirty publish (`collectDirtyIds` + `recordTransformIfChanged`) | `coreSystem.js:533-549` | **Dirty-bound** — O(dirty ids), not O(entities). |
| corpse compact | `coreSystem.js:559-563` | **F1 above** — the one unconditional O(entityList) walk left in the tick. |
| `bus.flush()` (event flush) | `coreSystem.js:572` | O(this-tick queued events), atomic. Cross-tick slicing of sim-listener delivery is the **adjudicated deferred item** (W122 deferred list: tick-paced emit slicing needs listener-classification surgery; sim writes reorder → hash risk). Not re-reported. |
| physics step → contact drain | `physics.js:762-817` | `_emitSg02ContactImpacts` drains this-tick Rapier receipts and `emitPhysicsImpact`→`bus.queue` per receipt — O(contacts this tick). Burst-sized only on pile-ups; slicing across ticks hits the same deferred listener-ordering contract as `bus.flush`. Pile-up spikes are real events, not stall classes. |
| `_syncSg02DynamicAuthorityEntities` | `physics.js:845-864` | `reconcileMachineryBeforePhysics` / `reconcileLatchBeforePhysics` / `ensureActivityClassified` are memoized/version-gated (activity lanes S0-S3 from W26/W35 machinery; verified intact). No unconditional rebuild observed. |
| econTick | world econ leg | **Deferred W122** — measured 2.7ms p50 / 3.9ms p95 per 5s tick (34 stations × 1133 listings); hash-risk slice needs per-station state partitioning. Adjudicated; not re-reported. |

**Presented-frame fault/quarantine gaps (item c):** `runRenderUpdatePhase` guards every lane with
per-lane try/catch + 20-count log caps; world-lane errors intentionally rethrow after HUD/feel ran
(fail-closed to the loop logger — a held frame over a half-drawn world). Sim-side `s.update` calls
in `registry.step` are deliberately unquarantined (a swallowed system failure desyncs the golden
hash — correct as-is). **Remaining gap: F2** (`diagnostics.update` in the `finally`).

## Regression verification — W122 machinery

**Hitches lane (F1 audio bounded post, F3 stormWarn):** PASS.

- `audioSystem.js:37` imports `postTaskAtBackgroundPriorityBounded`; `_startFrameLoop` tick
  (:6997-7013) — rAF body is **only** the guards (`rt._lifecycleSuspended || !rt.ctx ||
  rt.ctx.state !== 'running'`), the bounded post of `this._frame()`, and the re-arm under the same
  guards. `_stopFrameLoop` (:7015-7023) cancels `rt._rafId`. `_frame` (:7025-7027) re-gates on
  `!ctx || _lifecycleSuspended || ctx.state !== 'running'` — the deferred body no-ops on a
  suspended/stopped context. Contract holds.
- `stormWarn` (`renderer.js:2179-2217`) — same contract as `laneWarn` (:2218-2259): row
  `{logged, suppressed, lastWarnAt:-Infinity, heartbeatMs:1000}`, 256-cap oldest-evict
  (:2184-2191), `row.lastWarnAt = now` stamped on every verbatim warn (:2203), heartbeat at
  `now - lastWarnAt >= heartbeatMs` with `heartbeatMs = min(*2, 30000)` (:2211-2215), >60s
  quiet-gap heal resetting logged/suppressed/heartbeatMs (:2198-2200). Contract holds.

**Popin W122 machinery:** PASS.

- `queueResidencyWarmMint` (`renderer.js:19553-19566`) folds the deferred mint into the fused
  exit-iter via `yield* existing; yield* mintIter` — mint is FIFO leg 0, not a competing iterator;
  wired at :19710/:19755 and entry-side :19801.
- `governorEntry` (`assetResidency.js:1993-2038`) memo keyed on `ownersVersion` + `kind`;
  `ownersVersion` bumped at every owner-set mutation (:356, :670, :697); `diagnosticsRow`
  (:1856-1884) memo serves frozen rows. Headless probe: identical memo object served on repeat
  calls (`c1 === c2`), and `verifyLedgerConsistency` returned `ok:true` at all 13 + 5 checkpoints
  incl. the new `governorBlockedMembers` drift check.
- Fused owner sweep `releaseUnreferencedCacheOwnersPassSteps` (:1469-1548) iterates
  `[...packageCacheOnlyMembers, ...softResidentMembers]` (:1487) — member sets, not the asset table;
  re-qualifies each (:1489-1490), yields per 256.
- `rekeySoftBudgetClass` (:835-859) re-keys class bytes/membership on every mutation via the
  membership funnels (:686, :713) and asset register (:327); `enforceSoftResidencyBudgets`
  (:897-917) early-outs O(1) when neither strict nor soft class is over.
- `prepareSectorExitDeferred` (:1723-1760) paces release→retain→`mintWarmCoverageSteps` (yield per
  256 — headless probe: 3 steps over 400 rows); `finally` releases a partial owner on abandon.
  `rotateSectorDeferred` (:1767-1809) applies cheap paths synchronously and assigns
  `currentSectorId` at iterator END (:1805) — FIFO mint order matches sync semantics.
- No site bypasses the membership funnels (`release` :613-637 / `releaseOwner` :499-534 both route
  through `noteOwnerMembershipUnindexed`).

**Boot W122 machinery:** PASS.

- `loadEnvelopeFromString` (`saveSystem.js:4202-4224`) — non-gzip leg preserves O(1) sync rejects
  (`no_save`/`parse_failed`/`import_too_large` pre-parse) and routes `_loadEnvelopeFromStringAsync`.
- `_prepareEnvelopeStringAsync` (:4129-4199) — worker `restore_prepare` w/ 2500ms timeout,
  `_restoreFrameYield` between phases, `_rememberPreparedEnvelope` (:4193).
- `_commitAutosaveSnapshot` (:3221-3264) and `_autosaveValidatePreviousSync` /
  `_autosaveValidateReadbackSync` (:3576, :3709) all `await` the async prepare with liveness
  re-checks (`_autosaveInFlight`/`_activeAutosaveJob`, `_restoring`/`_restoreSequence`) after the
  await.
- FIFO-8 `_preparedEnvelopeCache` (:4275-4281) serves the verify→write→readback chain at
  `_writeSlot` (:1458-1461).

**W121 machinery spot-check (re-verified — W122 commits touched assetResidency.js / renderer.js /
saveSystem.js):** PASS. Owner-visibility memo (:1286-1310), `visibilityRowOffGlass` virtual
staleness (:1206-1214), amortized `advanceVisibilityHysteresis` (:1317-1339),
`cleanupOwnerState` memo delete (:642), per-leg sector-exit guards (:3215-3268 +
`noteLaneFault`/`laneWarn`), deferred restore catch (:4605-4614 + `_restoreAsync` :4804),
`laneWarn` quiet-gap heal (:2218-2259), and `verifyLedgerConsistency` (:1005-1077) — all intact.
`verifyLedgerConsistency` headless result: `ok:true` at every checkpoint (**PERFORMANCE_VERIFIED**
CPU-side).
