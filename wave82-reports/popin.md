# Wave 82 — popin-admission lane audit

Audited head: `devin/1791064509-perf-w60` @ `2b3e8e99c9d8381b4dc8fe31582def0d8b799f8d` (NOT master).
Contract: zero visible quality degradation; sim determinism bit-identical.

saturated: false

## Findings (ranked)

### F1 — Journal full-rebuild corridor scan still atomic inside a presented frame (CARRIED W80-F5, re-verified live at this head)

- `src/core/presentationRunner.js:779` — `rebuildJournalIfNeeded()` runs inside `presentLastCompletedSnapshot`, ahead of `populateJournalFrame`/`registry.renderUpdate` (`:802-807`). Triggers: ring `overflow`, `presentation-range-gap`, `tick-rewind`, `duplicate-spawn`, `destroy-without-spawn`, error paths (`presentationJournal.js:230-259,312,349,377,385`; `presentationRunner.js:695,700`).
- The collect itself: sync `collectJournalPresentationEntities` (`src/world/presentationSources.js:164-168`) inline-drains the chunked twin — `entityList.slice()` snapshot (`:122`), dressing rows (`:127`), plus the disturbed-position rescan with Set dedupe (`:136-148`, `:149-161`). `rebuildFrom` (`src/core/presentationJournal.js:499-552`) then republishes every alive entity (`publishSpawn`, `:537-545`).
- Publisher side of the same class: `fallbackFromState` (`src/render/presentationPublisher.js:83`, reached at `:152` on `needsRebuild`/`journalValid===false` and `:158,:182,:189,:204`) calls `world.rebuildFromEntities(aliveEntities(state))` — `clear()` + O(N) `allocateEntity` (`src/render/presentationWorld.js:804-822`) — inside `this._presentationPublisher.consume(presentationFrame)` at `src/render/renderer.js:22555` in the presented frame, followed by `_rebindPresentationMeshes` (`renderer.js:22556`, O(_meshes) x `resolveWorldPresentationEntity` per id, `:20009-20016`).
- Mechanism: a mid-flight journal invalidation pays the whole corridor collect + O(N) republish + O(meshes) rebind inside one presented frame — a hitch that delays every admission lane the popin machinery feeds (warm/enqueue/drain/decode-kick). Stall class, not a correctness defect; this is the known W80-F5/popin-F5 carried item, confirmed still verbatim at `2b3e8e99c`.
- Fix sketch: `collectJournalPresentationEntitiesChunked` already exists — drive it a bounded segment per present once `needsRebuild` trips, keeping the frame on the last acknowledged `journalStart/End` (the publisher's `journalValid===false` freeze path already tolerates that without serving torn state). `rebuildFrom` must stay atomic per record-stream contract: stage spawn records into a rebuild buffer the ring never exposes half-written (or gate `visitRange` readers on a rebuild-in-flight flag). `world.rebuildFromEntities` needs a shadow path — allocating into a side slot list and swapping; a `clear()`-then-refill across presents would be a visible half-empty world, i.e. illegal under the contract.
- Effort M–L | magic-frame impact M (invalidations are rare in steady flight — overflow/range-gap only) | risk M–H (journal ring + publisher torn-state contract; presentation-only, so determinism-safe).

### F2 — Hold-exempt repartition eval spend never posts to the paced ledger (fresh)

- `src/render/renderer.js:1871-1900` — `driveProtectedFirstFlightDrain` pumps the persistent `_drainProtectedFirstFlightBuildsSteps` iterator on a private 4 ms clock, consults `pacedFrameSpend()` at `:1897`, and never calls `notePacedFrameSpend`.
- The uncovered leg: the repartition eval inside the generator (`renderer.js:20662-20683` — `i % 256 === 0` yields + `exempt(resolveWorldPresentationEntity(this.state, id))` per tail row). The `yield*`-ed `_drainMeshBuildQueueSteps` self-posts its own segments (`:20772`, `:20807`, `:20818`, `:20827`, `:21078`); the repartition rows between yields post nothing.
- Mechanism: once per `_holdExemptRepartition` stamp (~100 ms cadence while the first-flight hold is live), up to ~4 ms/invocation of O(tail) exempt-verdict work is invisible to sibling slicers → mild shared-wallet overspend during the hold. Stall-adjacent bookkeeping gap; not a popin vector.
- Fix sketch: debit at the repartition leg's own yield boundaries inside `_drainProtectedFirstFlightBuildsSteps` (a pump-level `notePacedFrameSpend(clock()-started)` would double-count the drain's self-posted segments — scope the post to the repartition, or hand the pump a debit that skips `yield*`-posted spans).
- Effort S | impact L | risk trivial.

### F3 — `replaceSceneEnvMap` corridor traverses inside `_bakeEnv` (fresh, latent)

- `src/render/renderer.js:25324-25342` — `scene.traverse(rebind)` + per-root traverse over `collectPreparedAuthoredCompileRoots(scene)` + per-boundary `wholeShipLodRoots` level traverses, all atomic inside `_bakeEnv` (`:20147`).
- Both `_bakeEnv` call sites are shell/boot-gated today (`:9579` opening cook, `:22493` opening freeze), so this is latent, not a presented-frame cost at this head. A mid-flight IBL-source flip (foundry env texture arrival changes `resolveIblSource`) would land the whole multi-traverse inside one presented frame.
- Fix sketch: none while call sites stay shell-gated — flag it if a flight-time env re-bake ever lands; then chunk the rebind per root/column under the paced ledger like every other corridor walk.
- Effort S | impact L (dormant) | risk trivial.

## Regression notes — W79 machinery verified concretely at this head

### (a) `warmNearbyLedgerRowsSteps` — `src/world/presentationSources.js:716-762`

- Plan verdicts identical to sync warm: both twins destructure the same `_nearbyLedgerWalkPlan` (`:349-468`) — `walkX/walkZ` quantized to `ASTEROID_FIELD_CELL` centers, `collectOverlap` = two cell-diagonals, `toleration`, `hasLiveFar/RockDisc`, `ridesFar`/`ridesRock`, `farVersionNow`/`fieldVersionNow` — computed once at mint in both paths.
- `batchRows=Infinity` callers behave identically to pre-W79 sync: `queryFarActorsSteps` (`src/world/farActorTable.js:595-635`) sets `batch = Infinity` → the linear branch's `(i+1) % batch === 0` yield can never fire (`:621`); the grid branch yields unconditionally per `cx` column (`:632`) — but `queryFarActors` drains the iterator inline in one call (`:637-639`), so row order/verdicts/return shape are identical. Same structure verified in `queryAsteroidFieldSteps` (`src/world/asteroidField.js:184-238`, grid yield `:235`).
- `rememberMeshFarKey`/`rememberMeshRockKey` run only AFTER the walk completes inside the generator — publish loop + stamp share the same step as `yield*` completion (`:743-745`, `:757-759`). A `.return()` while suspended inside `yield* query*Steps` abandons the private `staged` array: no publish, no stamp, scratches still hold the previous committed disc. All driver `return()` call sites verified (`renderer.js:11950`, `:14360`, `:14368`, `abandonHoldExemptCollect` `:2562-2577`).
- No reader can observe a half-filled disc: mid-refill membership bumps only make the stamped key honestly stale (mint-time versions; `meshFarKeyMatches`/`meshRockKeyMatches` mismatch → next leg refetches). Readers either iterate the last committed scratch (`appendNearbyLedgerRows`, `:689-690`) or `.slice()`-snapshot at ctx completion (`:801-802`) — publish+stamp is atomic per leg.

### (b) `_holdExemptWarmIter` drive — `src/render/renderer.js:2651-2878`

- `abandonHoldExemptCollect` (`:2562-2577`) calls `warmIter.return()` then clears `_holdExemptWarmIter`/`_holdExemptWarmToleration`/`_holdExemptWarmEpoch` + the collect fields. Every abandon caller enumerated: hold release (`:2156-2157`), commit-epoch guard (`:2658-2660`), collect-epoch guard (`:2662-2665`), warm-epoch guard (`:2671-2673`), warm `.next()` throw (`:2707-2709`), collect `.next()` throw (`:2739-2742`). The epoch check at `:2671` runs on EVERY invocation before the mint guard — a stale warm can never mint a collect under the wrong `enterSerial` epoch.
- Warm completing mid-beat mints collect with stored toleration verbatim (`:2717-2723`): `warmToleration === 'covered' ? { tolerateMiss: 'covered' } : { tolerateMiss: true }` — no flip.
- Collect+commit unreachable while warm parked: mint guard `:2674` (`!iterator && !_holdExemptWarmIter && !_holdExemptCommitList`); collect mints only at `:2692` (warmIter absent) or `:2721` (warmDone); commit mints only after collect `done` (`:2766+`).
- Remint `continue` (`:2869`) re-enters the loop top → warm phase on the same beat; a warm finishing inside a spent beat defers collect mint to next beat — commit epoch is `enterSerial` (`:2657`), not beat-stamped, so no epoch loss.

### (c) Stepped sweep twins — identical contracts verified

- `_pruneMotionTrackerRecords` sync driver (`:19795-19802`) drains the Steps twin inline and returns `step.value`; the `active` Set is fully minted (entities.keys + `_meshes.keys` + presentationList + playerId) BEFORE `registry.prune(active)` runs (`:19836-19847`); `yield*` releaseDetachedBoundaryOwnersSteps at end (`:19848-19849`).
- `_releaseDetachedBoundaryOwnersSteps` (`:19875-20007`): `claimed` Set fully minted (meshes ancestor chains `:19889-19894`, entities mesh/view.root `:19896-19905`, world.meshRefs `:19906-19912`) before the release leg; Set-miss boundaries get a live `isClaimed` re-walk (`:19929-19946`) and the `isClaimedSteps` generator twin (`:19951-19974`) `yield*`ed by the release probe — a mid-census attach cannot be released.
- `_drainMeshBuildQueueSteps` (`:20720+`): all prologue work inside the generator — late-present gate + `yield* hoistDeadlineGlassMeshBuildsSteps` (`:20743-20752`), `yield` (`:20773`), `drainScan` mint (`:20776`), `firstFlightIds` newcomer census with snapshot + tail rescan and per-1024 yields (`:20783-20825`); per-row `yield` at the `while` top (`:20827-20828`); returns `built` (`:21077`). Sync driver `_drainMeshBuildQueue` (`:20703-20712`) drains inline, returns `step.value`; bare-owner fixtures fall back to `render._drainMeshBuildQueueSteps` (`:20706-20707`) so stub-less tests exercise the real body.
- `enqueueMissingMeshBuildsSteps` inside `_reconcileMeshesSteps` (`:20284-20300`) gets `onRowBoundary: refreshOnNewerSweepBeat` — minted environment terms can't serve post-beat rows stale.

### (d) `_residencySweepBeatStamp` — `:2249`/`:2302`, `refreshOnNewerSweepBeat` `:20219`/`:20404`/`:20835`

- Bump is once per pump INVOCATION, before the `for(;;)` drain loop (`:2249` reconcile pump, `:2302` poll pump) — a pump that breaks without stepping cannot double-bump a single generator resume; `drainMeshBuildsBehindShell` bumps per resumed pass (`:11522`).
- `refreshReconcileEnv` (`:20207-20216`) re-derives EVERY hoisted term row loops consume: `reconcileSpeed`, `reconcileCam`, `reconcileEvictBase`, `reconcileEvictShipWreck`, `reconcileEnv`, `reconcileScanOpts.scan`, and clears `tGlassMemo`. `refreshResidencyEnv` (`:20390-20401`) covers speed/cam/evict radii/`residencyScan`/`residencyEnv`/`tGlassCache`. The drain's beat-refresh re-derives `simNow`/`drainScan`/`glassVerdictMemo` (`:20835-20842`). Enumerated hoisted lets vs readers — no minted term survives stale into a post-beat row.
- `liveShellLatched` reads `state.render.*` live per row (`:20234-20236`, `:20409-20411`; read at `:20248`, `:20309`, `:20420`, `:20447`) — a latch RELEASING mid-sweep resumes evicting on the next row; evictions go to the bounded `_despawnDisposeQueue` (`:20262-20263`) drained by `drainDespawnDisposeQueue` with limit + deadline + debit (`:1843-1862`) — the release direction cannot run a departing dispose storm unsliced inside a presented frame.

### (e) debitGate + slice-mode armed flags

- `createSlicedYield` (`src/render/pipelineReadiness.js:133-156`): `debitArmed` sampled at closure mint (`:142`) and re-armed after every yield (`:150-151`) — a mid-slice mode flip posts the slice's own sync span under the mode it minted in; spend is never forfeited or double-counted (comment `:139-140` matches behavior).
- An armed (flight-minted) slice firing during loading posts only `tick - sliceStarted` — its sync span, not yielded wall time — honest; a loading-minted slice (armed=false) drops its span — safe direction. No over-debit/starve vector.
- Full sweep for non-debiting private clocks in flight-reachable code: every `*SliceStart`/`segStartedAtMs`/`*DebitAt` gate debits (roster `:2211`, reconcile `:2278`, poll `:2325`, hold-exempt `:2876`, opening/survival/widen/leftover/seal/post/census/provider slices all armed+debited, drain segments, warm-build debits `:17473`/`:17651`/`:18306`/`:18480`/`:18799`/`:18861`/`:18910`/`:19096`/`:19141`/`:19194`, arm `:24096`). The only uncovered leg is F2.

### (f) Cook warm drives

- Widen cook (`:11946-11964`) and jump-cook (`:14356-14372`) drive `warmNearbyLedgerRowsSteps` iterators on their own slice clocks; `warmIterator.return()` on `cookStale()` (`:11949-11951`, `:14359-14361`) and on superseded provider yields (`:14367-14370`) — the return propagates through the suspended `yield* query*Steps`, abandoning `staged` with no publish/no stamp.
- Both keep the collect out-buffer LOCAL (`const presentation = []` `:11939`, `:14353`) — shared scratches unobserved until each leg's atomic commit. Collect iterators `.return()`ed on stale/superseded too (`:11983`, `:14384`, `:14393`, finally `:14398-14402`).

## Lane hunts — fresh residuals

- (a) Suspended-refill scratch readers — enumerated every reader of `_meshFarScratch`/`_meshRockScratch`/`_meshWalkOrigin`: sync `appendNearbyLedgerRows` iterates the committed disc live (`presentationSources.js:689-690`); chunked collect `.slice()`s at ctx completion (`:801-802`); `queryFarActorsSteps`/`queryAsteroidFieldSteps` snapshot `pos`/`radius` into locals at mint (`farActorTable.js:602-610`) — a mid-suspension `_meshWalkOrigin` rewrite is harmless. A collect minted by another caller mid-suspension mints its own plan and either rides coverage or refills atomically — no half-fill observable. Worst case: two suspended drivers with different walk discs trade commits (~2 redundant refills per leg pair; each leg's key is honest → self-correcting).
- (b) Warm-iter suspension windows — memo commits carry plan-minted versions → honest-stale on mid-suspension membership bumps; `'covered'` rides only on version-match + geometric superset containment; toleration-`true` stale-miss is bounded by `_holdExemptTolerantStreak` (every 4th productive remint mints `'covered'` — already adjudicated popin-F4-S) and by the decode-runway horizon. No fresh residual.
- (c) Re-kick coverage mint + `warm.building` gate — late settles are non-orphaning in BOTH lanes, with an intentional asymmetry: launch-lane settle releases coverage unless `warm.building === true` (`:18088`, errs toward re-warm); deferred-lane settle releases only on unclaimed outcomes while its mint is still outstanding (`:18751-18763`) and keeps coverage on claimed outcomes regardless of building (honest warm coverage; `unmark()` consumes leftovers at teardown; `_swarmWarmCoveredEnemyIds`/`_swarmWarmReKickClaims` nulled on `run:ended` `:16178-16179`). A stuck kickClaim only makes the enemy re-eligible next dwell — the fresh filter keeps `covered <= claims` (`:18609-18611`). `warm.building` flip sites enumerated: `:17436`, `:17971`, `:18023`, `:18771`, `:19019`, `:19048` — every settle path lands on an outstanding-mint or building check.
- (d) Remaining atomic popin classes — enumerated emit-tail corridor walks: the journal rebuild/fallback class is F1 (the only corridor-scale atomic left inside present); `replaceSceneEnvMap` is F3 (latent); `_rebindPresentationMeshes`/`rebuildFromEntities` ride F1's fix surface. Roster unions (`buildArrivalRosterSteps` via `_arrivalRosterIter` `:2191-2216`), the collect inside `collectMeshPresentationEntitiesChunked`, packaged-commit subject collects, and all `entity:spawned`/`entity:destroyed` handler work are stepped or O(1). Sync `warmNearbyLedgerRows`/`enqueueMissingMeshBuilds`/`collectMeshPresentationEntities` call sites are either `typeof === 'function'` else-fallbacks for stripped fixtures or loading-mode only (`:1731` inside `stableEntityFor`, loading-gated `:1722-1724`).

## Verdict

`saturated: false` — F1 is a real residual with a conceivable contract-preserving implementation (the chunked collect machinery already exists; the rebuild side needs staging discipline, not new machinery). F2 and F3 are small legal fixes. Everything else in the W79 verification list holds at `2b3e8e99c` — no regressions found in the stepped ctx/warm-iter/sweep-twin/beat-stamp/debit machinery.
