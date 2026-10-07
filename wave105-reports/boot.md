# W105 audit — lane: boot-loading

Target: `devin/1791064509-perf-w60` @ `3ed6f56a3` (wave 104 tip). Golden sim hash contract `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` — nothing below touches sim; all findings are presentation-side.

## saturated: false

Five contract-preserving residuals remain. The cook's leg-level pacing is otherwise airtight — every census, drain, promote loop, and seam I enumerated is either chunked, elapsed-clocked, or paced-ledger gated — but the field-record promote path still runs collect-all + sort-all atomically at two cook sites, the freeze drain rides every yield seam unmeasured, and the roster prewarm has two narrow cross-run leaks. Findings are ranked by worst-case atomic node count and boot-window reach.

---

## Ranked findings

### F1 — `rockHits.sort` runs O(H log H) atomically after a full in-radius collect, at both cook sites

**Evidence:** `src/render/renderer.js:12544` (opening cook) and `:15380` (jump cook) — identical shape: `queryAsteroidFieldSteps` collects every live record within `firstFlightRockCookRadiusWu(state)` (`partsLibrary.js:1044-1046` = `tableOpeningCompositionWu` + `tableTravelSpeed × FIRST_FLIGHT_ROCK_TRAVEL_SECONDS`, i.e. composition radius + 3 s of travel ≈ several thousand WU), then `rockHits.sort(...)` orders the whole set, then the promote loop iterates the sorted array until `seenRockKeys.size >= FIRST_FLIGHT_ROCK_COOK_CAP` (25, `partsLibrary.js:1002`).

**Mechanism.** The query itself is stepped (`asteroidField.js:184-238` yields per column leg), so the collect paces — but the sort does not suspend (noted in-tree at `:12551-12552`: "the O(H log H) sort can't suspend"). On a dense field H is thousands of records — π·r²/220² cells × records-per-cell — and each comparator call pays ~8 property-load chains (`:12545-12549`), making this the largest single atomic CPU span remaining inside either cook: on the opening cook it runs while the loading veil holds (frozen-presenter contributor), on the jump cook it runs inside live presented frames between the census and the promote burst (the exact hitch class the shell exists to hide). The sorting is *whole-set* while only the first 25 keys are ever promoted — ~99% of the collected+sorted work is discarded.

**Fix sketch.** Replace collect+sort with bounded ring-ascending emission — the machinery W104 already built: `queryAsteroidFieldNearestSteps` (`asteroidField.js:247-282`) emits records in Chebyshev-ring order from the player cell. Add a radius cap (stop emitting once ring min-distance exceeds `firstFlightRockCookRadiusWu`) and drive it under the existing `providerSliceDue`/8 ms clock; promote straight off the emission stream and early-exit at `seenRockKeys.size >= CAP`. Ring-order nearest approximates exact-distance nearest at 220-WU cell granularity — the same mint-cell imprecision the W104 walk already accepts — and keeps the legal over-select direction (a slightly different 25th rock is still a real promoted model). Deletes the collect-all, the sort, and most of the query work on sparse fields.

**Effort:** M (radius-gated emission + two call-site rewires; the ring machinery exists). **Impact:** H — biggest remaining atomic stretch in the boot/cook path, hit on every sector enter and every boot. **Risk:** low — promote-set membership may differ marginally at the cap edge (cell-order vs exact-distance); sim untouched, hash safe.

### F2 — `queryAsteroidFieldNearestSteps` drains a whole ring per emit leg — O(N) worst-case atomic span inside the walk

**Evidence:** `src/world/asteroidField.js:247-282` — the scan phase yields every `batchRows` (1024) keys while building the ring map (`:260-268`), the ring sort is O(#rings) (`:269`), but the emit phase (`:270-280`) iterates every cell in a ring and every record in each cell's bucket with no yield inside the loop.

**Mechanism.** Chebyshev ring k holds up to 8k cells; worst-case a whole dense field mints at one cell-distance (a bounded arena, a belt arc, or a spawn cluster all landing in ring ~constant) → the entire emit is one atomic leg: O(cells + records) of map lookups, dist² math, and `out.push` with the result array growing to N inside one span. Per-bucket walks are also atomic — a fat cell (dense cluster overlapping one 220-WU cell) drains all its records inside the ring leg. This is the survival-widen path the W104 wave paced at the call site (`renderer.js:12733-12742`, 8 ms + ledger) — but pacing is *between* yields, and the emit phase yields only between rings, so one fat ring overshoots arbitrarily.

**Fix sketch.** Chunk the emit loop itself: yield every `batchRows` emitted records (the parameter already exists and is only used in the scan phase), preserving ring order. Straightforward — the function is already a generator; an inner counter + `yield` inside the `for (const rec of bucket)` loop keeps emission order identical.

**Effort:** S. **Impact:** M-H — the only unbounded leg in an otherwise fully paced whole-field walk; the run/boot cook calls it on the biggest fields. **Risk:** none — pure yield-point addition, order preserved.

### F3 — `_drainHiddenFreezeQueue` rides every yield seam unclocked and never debits the paced ledger

**Evidence:** `yieldLiveSectorGpu` calls `this._drainHiddenFreezeQueue?.()` unconditionally at `renderer.js:12269` (opening cook seam) and `:15334` (jump-enter seam); the drain also fires per `syncEntityViews` pass (`:23790`). The drain body (`:21421-21518`) enforces per-call caps — `MINT_ROOTS_PER_PASS=6`, `SCAN_PER_PASS=256`, `VISIT_PER_PASS=1024`, `NODE_BUDGET_PER_PASS=4096` (`:891-904`) — but measures nothing: no `notePacedFrameSpend`, no elapsed check, and the caller resets `survivalSliceStart`/`providerSliceStart` after the seam returns, so the drain's cost is invisible to BOTH the 8 ms slice clock and the paced wallet.

**Mechanism.** During a flight-mode cook, each sliced leg correctly debits its own spend — then the seam runs up to 6 mints + 4096 node-steps + 1024 visits of freeze work for free: presented-frame work overshoots the 4 ms wallet by the drain's real cost on every yield. A fat backlog (packaged-hull subtrees are ~1-3k nodes each) makes each seam-side drain ~2-6 ms of unmeasured work — dozens of seams per cook → the drain alone can add tens of ms of hidden presented-frame time across the cook, and the wallet under-reports to every sibling lane (deferred-enter queue, provider drives, promote bursts) the whole way. In loading mode the ledger is disarmed so nothing is debited either — the drain becomes unpaced periodic work inside a frozen-presenter window. The converse direction is bounded by design: legs under budget simply don't yield, so the drain starves only when there's no drain-worthy backlog pressure. "Per pass" caps are really per-*call*: with ~1 call per seam + 1 per sync pass, effective per-frame work is (seams/frame + 1) × the stated caps.

**Fix sketch.** Inside `yieldLiveSectorGpu` (or at the top of the drain), `performance.now()` around the drain and `notePacedFrameSpend(elapsed)` when `state.mode === 'flight'` — same gate shape the sliced legs use (`debitGate: () => state.mode === 'flight'`). Optionally also have the drain loop consult the caller's slice deadline so a fat mint can't extend the seam. Accounting-only; no queue semantics change.

**Effort:** S. **Impact:** M-H — turns the last unmeasured boot/cook cost center into honest wallet spend; directly shrinks presented-frame overshoot during live cooks and the loading presenter's stall-per-mint during boot. **Risk:** low — debiting more spend makes legs yield earlier; worst case the drain loses a little throughput during flight cooks (still guaranteed by the drain's own per-call progress).

### F4 — Stale `_drainRosterPrewarmCohort` drive survives release — no generation guard

**Evidence:** the drive chain minted in `_admitSurvivalRosterPrewarm` (`renderer.js:18443-18473`) reads `this._rosterPrewarmEmitQueue` live in its inner loop (`:18456-18462`) and adds its `drain` promise to `this._rosterPrewarmPending` (`:18468-18473`); `_releaseSurvivalRosterPrewarm` (`:20906-20980`) clears `_rosterPrewarmEmitQueue = []` (`:20915`), `_rosterPrewarmCohortDrain = null` (`:20916`), and `this._rosterPrewarmPending` synchronously — but nothing cancels or epochs the in-flight drive itself.

**Mechanism.** On a mid-drive release (`run:ended` `:17663-17675`, cook-bail `'run-still-live'` sites), the suspended drive resumes on its saved queue reference — which it re-reads as `this._rosterPrewarmEmitQueue` — so a stale drive can (i) consume the *next* run's freshly queued emits under the old run's per-spec dedupe ledger (cohortOwnedSet/witness names minted pre-release), and (ii) push its `drain` promise into the new run's `_rosterPrewarmPending` — the next shell-hold wait (`:13224-13251`, `attachPending` filter at `:13219-13223`) then waits on stale work and the roster settles under a ledger that mixed runs. Warmed roots pushed post-release land in the new `_rosterPrewarmRoots` map — the next release's wasMounted route reclaims them, so no GL leak — but the pending-set pollution is real: a stale drive can extend a *new* run's shell hold and mis-emit the new cohort's upgrades. Narrow window (release must land mid-drive), but that's exactly the boot seam — a run ending into a new run's embark.

**Fix sketch.** Mint `this._rosterPrewarmEpoch` in release (increment), stamp the drive at mint, and check `epoch === current` per dequeued spec and before `pending.add(drain)` — stale drive self-abandons. Also stops a stale drive from consuming a fresh run's emit queue. S-sized; no contract surface moves.

**Effort:** S. **Impact:** M — boot-window only; kills a cross-run contamination path at the exact boundary this campaign hardens. **Risk:** low.

### F5 — A roster-prewarm emit landing after the settle loop exits mints an uncovered drive

**Evidence:** the shell-hold wait (`renderer.js:13206-13251`) re-reads `attachPending()` each iteration but exits as soon as pending empties / deadline hits; `_admitSurvivalRosterPrewarm` (`:18429-18437`) enqueues onto `_rosterPrewarmEmitQueue` and, if no drive is live (`_rosterPrewarmCohortDrain === null` after `:18460` cleared it), mints a *new* drive chain whose `drain` lands in `_rosterPrewarmPending` — after the wait already released.

**Mechanism.** The emit queue covers re-emits while a drive is alive (queued emits drain under the one pending entry — verified). The gap is the boundary: an `onboarding`/`survivalArena` emit arriving between settle-exit and veil-lift mints a cohort whose hidden mounts + `requestAuthoredUpgrade` + `compilePipelines` runs post-hold — the wr:/wreck/pool-chunk inside-flight compile class the hold exists to prevent. The `_postOpeningPipelineAdmissionReleased`/`_postOpeningRescanRequested` re-arm (`:13267-13270`) only fires when `pending.size > 0` was observed at loop exit, so the late emit escapes it. Bounded by the absolute cap (`settleCapMs` 8000/45000 at `:13206`) so it can never extend a hold past its bound — the residual is *missed coverage*, not overrun.

**Fix sketch.** Include the emit queue in the release predicate: hold until `pending` empty AND `this._rosterPrewarmEmitQueue.length === 0` at the same observation, or have a post-release emit set `_postOpeningRescanRequested = true` so the post-opening pass adopts the late cohort under the rescan instead of inside flight. S-sized predicate plumbing.

**Effort:** S. **Impact:** M — rare-window residual that lands cohort compiles inside presented flight. **Risk:** low — worst case a slightly longer shell hold within the existing cap.

---

## Fresh-hunt axes — enumerated bounds

**(e) Biggest remaining atomic boot stretches, ranked by worst-case node count:**
1. `rockHits.sort` + collect-all — O(H log H), H = in-radius field records (thousands). F1 above.
2. `queryAsteroidFieldNearestSteps` per-ring emit — O(N) single leg worst case. F2 above.
3. `drainDeferredEnterMaterializers` bail drain (`sectorEnterDefer.js:85-120`, call sites `renderer.js:15299`/`:15303`) — whole deferred cohort atomically inside the listener. **Documented safety valve** (module header `:26`, "Headless runs, software GPU, loading enters take the unchanged inline path") — adjudicated; listed for completeness, no finding.
4. `syncEntityViews(1)` inside each of ≤8 `_publishOpeningFirstPictureSteps` settle passes (`:24618`) — one O(scene+entities) leg per pass, paced at leg boundaries only. Bounded by pass count; the pass's other legs (`updateMatrixWorldSteps` `:24625`, pool/shadow band `:24628-24656`) are stepped or fixed-cost.
5. `_bakeEnv({force:true})` PMREM convolve (`:12350`, `:15354`, body `:22206-22261`) — one synchronous `pmrem.fromScene` per cook; fixed-size cube target, unsliceable GL work. Bounded, fixed cost.
6. `keys.sort` oversize-disc path (`asteroidField.js:222`) — only when `cellSpan > grid.size`; guarded, rare.
7. `collectFirstFlightCookEntities` sync fallback (`:12617`, `:15617`) — only when the Steps twin is missing; `collectFirstFlightCookEntitiesSteps` is present and driven under `providerSliceDue`.
8. `getActivityFrame`/`publishActivityFrame` per publish pass (`:24605`) — per-frame classification, bounded O(entities).

**(c) Warm-lane boot latency — premise partially wrong, residual bounded.** `serviceRenderMeshResidency` runs unconditionally in `prepareFrame` (`:25104` → `:2296-2298`), and `renderFrame→prepareFrame` fires every rAF including loading — so `_warmDisposeQueue` corpses drain during boot, not post-boot. A boot-time mass release (e.g. `_releaseSurvivalRosterPrewarm`'s wasMounted pushes, ~dozens of roots + catalog) drains at `max(8, ceil(backlog/4))` items per call under `DESPAWN_DISPOSE_BUDGET_MS` (2 ms, ×2 over backlog>32), with `LEDGER_MAX_SKIPS=2` aging guaranteeing a forced drain every ≤3 presented frames — ~4-12 frames for a 60-corpse release, inside the first-playable window. Bounded; the only real contention is ledger-sharing with cook legs (F3's accounting fix covers the analogous freeze-lane case). No separate finding.

**(d) Mid-boot queued emit vs shell hold:** the hold's `settleCapMs` is absolute, so a queued emit can never extend the hold past its bound — verified. The two residuals are F4 (stale drive) and F5 (post-release emit) above.

**(b) Yield-seam drain contention, second direction:** the drain never starves a seam's budget (per-call caps are small relative to the seam's rAF gap); the drain starving is by design (piggyback). The unmeasured direction is F3.

---

## W104 regression verification — all 8 items confirmed present at `3ed6f56a3`

1. **Unmeasured-note pass budget** — `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS = 2` at `renderer.js:2019`; hooks `_noteShadowMeshAdded :27597` / `_noteShadowMeshRemoved :27616` gate exact measures on `tally.dirty || _unmeasuredShadowNotePass() > 2`; `_unmeasuredShadowNotePass :27631-27640` is keyed on `_viewSyncSeq`. ✓
2. **drawnCullRadiusMax + stale-serve** — `visualCullRadius.js:82-176`: LRU 8, remeasure budget 4/pass, `DRAWN_CULL_STALE_SERVE_BIAS = 1.15` at `:82`. **Divergence noted:** the over-budget key-moved serve at `:144-147` returns `Math.max(drawnCullRadiusMax, cached.radius)` *without* the ×1.15 bias — the bias applies only on the cadence-expiry branch (`:150-152`). Mechanism is still sound (max-ever radius is already the legal over-draw direction), but the brief's described shape — bias on the stale-serve generally — has drifted. Reported as a note, not a regression.
3. **Stepped freeze/unfreeze mints + flag-keep dwell** — `NODE_BUDGET_PER_PASS=4096` `:904`, `FLAP_DWELL=3` `:908`; freeze drain `:21421-21518` (dwell `Math.max(lastShow, queuedSeq)` `:21451-21459`, flag minted after compose `:21471-21474`), unfreeze drain `:21542-21619` (dwell `:21573`, `sfHiddenFrozen` deleted at mint `:21585` — kept-flag queue-time cancel verified at `:21403-21409`), unbind clears all queued/seq stamps + returns parked iters `:21796-21816`. ✓
4. **Frame-stack recount** — `shadowReceiverTally.js:65-170`: explicit stack IS the open ancestor chain (push `:163-164`, pop `:82-83`/`:165-166`), once-per-resume O(depth) re-verify `:96-123` (detached-suffix kill `:99-102`/`:121-123`, broken-parent probe `:104-112`, sibling splice re-index `:113-119`), visit stamps gated on notes/detached non-empty `:141-150` with `NOTED_WALK_VISITS_CAP=4096 :175`. Sync `recount()` `:300-315` mints the steps twin with `notedWalk=null` — zero hot-path overhead. ✓
5. **Warm dispose lane** — `drainWarmDisposeQueue :2036-2039` shares `drainDisposeQueueLane`; live-then-warm order at `:2296-2297`; pushes at `:19097-19099` (teardownWarm), `:19642-19658` (early crucible discard), `:20917-20942` (roster release); flush on destroy `:18224`; init `:10293-10294`. Runs every `prepareFrame` including loading (see (c)). ✓
6. **Ring-ascending field walk** — call site `renderer.js:12725` driven under the survival 8 ms slice + paced-ledger clock `:12733-12742`; iterator is `queryAsteroidFieldNearestSteps` (`asteroidField.js:247-282`) — machinery present and paced at the call site (its per-ring emit bound is F2). ✓
7. **Roster re-emit queue** — `_admitSurvivalRosterPrewarm :18377-18474`: needsWork dedupe `:18400-18423`, drain-in-flight push to `_rosterPrewarmEmitQueue` `:18429-18437`, single-drive coverage of mint + queued emits under one `_rosterPrewarmPending` entry `:18443-18473`, synchronous empty-queue stamp-clear `:18456-18461`; release clears queue+drain `:20915-20916`. ✓ (F4/F5 are its residuals.)
8. **`sfDespawnPartialTeardown` step-throw** — catch stamps `m.userData.sfDespawnPartialTeardown = true` at `:2157-2162` (mint-fail head advance without flag `:2136-2141` is the correct complement); consumed by `_syncShadowCasterPolicyChecked` at `:26209-26216` (brief cited ~`:26120` — line drift only): delete + `invalidateShadowCasterPolicy` + `noteShadowCensusLightMutation`. ✓

No test failures were investigated (audit lane is read-only; suite not run).
