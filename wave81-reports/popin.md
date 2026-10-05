# Wave 81 audit — popin-admission lane

Audited HEAD: `8b9bd6663` on `devin/1791064509-perf-w60` (W79+W80 machinery landed).
Lane: late pop-in — anything that becomes visible before its real model/material is
admitted, or that stalls the frame carrying admission work. Contract: zero visible
quality degradation, sim determinism bit-identical (golden `47a`, verified
`892f88c9…` on this head).
Static read-only audit. Host is SwiftShader — no wall-time GPU conclusions.

`saturated: false`

## Ranked findings

### F1 — A stepped refill that commits under a stale plan (cell-hop or version bump mid-suspension) sends the completing collect mint back into the corridor-scale SYNC refill — the same atomic walk W79 sliced, re-exposed inside the collect's first next(), paid twice

**Evidence.** `warmNearbyLedgerRowsSteps` stages private arrays and publishes
`_meshRockScratch`/`_meshFarScratch` + `rememberMesh*Key` atomically per leg
(`src/world/presentationSources.js:664-683`). But every completing collect mint calls
`_nearbyLedgerRowsContext` (:470-536 via `collectMeshPresentationEntitiesChunked` :724),
which re-mints a **fresh** `_nearbyLedgerWalkPlan` (:471). The fresh plan's memo gates
consult the CURRENT state: `meshFarKeyMatches` requires `key.farVersion === live
far.version` (:297-307) and `state === walkState`; `'covered'` additionally requires
version-match + geometric containment of the needed disc inside the stamped
`collectDisc` (:412-418). Between the warm's plan mint (its first `next()`, :641) and
its commit (N beats later), `catchUpFarRecord` rim-crossings bump `far.version`
(:326-333 stamps `collectDisc`/versions at mint) and the quantized union origin hops
cells — either one makes the just-committed key fail the fresh plan's gates. The ctx
mint then executes the miss verdict **synchronously**: `queryFarActors` :505 /
`queryAsteroidField` :515 — the unbounded corridor grid walk — inside the collect's
first `next()`, before any yield point.

Collect sites that eat this: hold-exempt completing mint `renderer.js:2628-2630`
(`'covered'`), widen cook `:11732` (strict), jump cook `:14005` (strict), reconcile
sweep `:19719-19723` (strict), residency poll `:19901-19905` (strict).

**Reachability.** Cell-hop cadence under travel is ~ speed / `ASTEROID_FIELD_CELL`;
`collectOverlap = ceil(ASTEROID_FIELD_CELL * SQRT2)` (:397) covers exactly ONE cell
of quantization wobble — a two-hop suspension exceeds it. The motion that provoked the
warm is the same motion that strands its memo: the warm's hit half-life is ~one
suspended cell-hop.

**Mechanism (player-visible).** Two-step worst case: the warm pays the walk sliced
across beats AND the collect re-pays it atomically inside one presented beat on
completion. The completing beat is also where commit + enqueue + kick must run, so
total popin-admission work concentrates onto exactly the frame that was supposed to be
cheap. Repeated hop-cadence turns the sliced machinery into a periodic atomic spike.

**Fix sketch.** Close the warm→collect hand-off: the completing collect should consume
the warm's OWN committed verdicts — carry the warm's plan forward through the driver
instead of re-planning (mint ctx from the completed plan), or when the fresh plan still
misses, drive another *stepped* leg rather than the ctx's inline refill (bounded re-warm:
plan → warm → re-plan, at most one extra leg per observed hop — finite because the
fresh plan's stamps are minted inside the same step). Cheaper variant: widen `'covered'`
to accept the committed disc's own containment — a finished warm that overshot the new
plan's needed disc still serves honestly; extending `collectOverlap` to two hops halves
the re-pay rate at the cost of a wider walk.

**Effort** M · **magic-frame impact** H · **risk** M (touches memo-correctness seam —
must keep per-row live-origin filters authoritative so tolerance stays subset-only).

### F2 — `_drainMeshBuildQueueSteps`'s completion debit posts the whole suspended span (dead parked beats + legs earlier invocations already debited) into the completing frame's paced ledger

**Evidence.** `startedAtMs` is minted once in the drain prologue
(`renderer.js:20175-20177`); the tail posts
`notePacedFrameSpend(now() - startedAtMs)` at `:20465-20466` exactly once, when the
generator completes. `notePacedFrameSpend` **accumulates** into the current frame
epoch's ledger (`src/render/decodeTaskBudget.js:84-99`). A drain suspended across pump
invocations was driven inside earlier invocations whose spans were already debited at
the pump level (:2186, :2233). The completing invocation therefore posts the full
elapsed wall-clock — dead suspension time plus already-counted leg time. Every other
Steps/leg debits per leg (`X - lastDebitAt`: :16947, :17780, :18273, :18570, :18668;
`createSlicedYield` `pipelineReadiness.js:148`); the drain tail is the only
whole-span poster in the codebase.

**Mechanism.** The completing frame's `pacedFrameSpend()` spikes by (parked time +
re-counted work) → every `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` consult in that
frame defers: warm drives, collect resumes, emit-slice drains, deferred-enter slices
all stall a beat → authored decode kicks land a frame later → popin latency at exactly
the seams (first-flight hold, arrival hold) where drains run longest. Direction is
throttle (safe side), magnitude bounded to one frame per completing drain — but
multi-beat drains are the norm on fat queues, so every drain completion carries it.

**Fix sketch.** Make the debit per-leg like every sibling: `legStart = now()` at
generator entry and after each yield; post `notePacedFrameSpend(now() - legStart)` on
each yield/completion. Alternative owner-ship fix: the pump's span debit already covers
all step time — delete the tail debit entirely and add a per-drive debit only in the
sync caller `_drainMeshBuildQueue` (:20128-20133, used by :1933, :2192, :2235, :2239,
:1873). Pick exactly one debit owner per drive.

**Effort** S · **magic-frame impact** M · **risk** L-M (ledger accounting — every paced
lane consults the same number).

### F3 — W79 regression: three sync drivers deref their Steps twins unguarded; bare/fixture owners throw TypeError — `test/frame-solid-glass-priority.test.mjs` (2 fails) + `test/pipeline-scheduled-cancellation.test.mjs` (2 fails incl. ~45 s timeout cascade) broken at HEAD

**Evidence.** `_drainMeshBuildQueue` :20128-20133 → `this._drainMeshBuildQueueSteps(...)`
unguarded :20129. `_pruneMotionTrackerRecords` :19269-19274 → :19270 unguarded.
`_releaseDetachedBoundaryOwners` :19334-19339 → :19335 unguarded. The sweep
generator's own fallback at :19733-19734 (`typeof` guard → `this._drainMeshBuildQueue`)
is dead armor: the fallback routes into the method that throws the same deref.

Live repro at `8b9bd6663` (node `--test`):
`frame-solid-glass-priority.test.mjs` stubs bare owners and calls
`render._drainMeshBuildQueue.call(stub, N)` (:327, :335, :373, :382) →
`TypeError: this._drainMeshBuildQueueSteps is not a function` at renderer.js:20129 —
2 fails. `pipeline-scheduled-cancellation.test.mjs` (:170) same pattern — 2 fails plus
a ~45 s cascade. Neither file is wired into any `check:*` script or workflow (orphan
tests — why CI didn't catch it) and neither is on the brief's preexisting-failures
list → attributable to the W79 stepped-drain conversion (the pre-W79
`_drainMeshBuildQueue` was self-contained; `git show 5810add6e~1` shows zero Steps
hits there).

**Mechanism.** Not player-visible — a fixture-contract break: any lightweight owner
that used to drive the sync drains now throws instead of draining. (Also a real
contract hole for future minimal-context fixtures per the comment at :19908-19909.)

**Fix sketch.** Guard the three drivers the same way their callers do, with a real
fallback: `typeof this.XSteps === 'function' ? drive* : legacy inline body` — or give
the drivers a tiny inline fallback that runs the Steps generator via
`.call(this)` (the Steps bodies only touch `this.*` state). Fixture-side alternative:
attach the Steps generator to the stub — but the tests exist to exercise the real
drain verdicts, so making the driver tolerant is the correct direction.

**Effort** S · **magic-frame impact** — (test regression, not a frame defect) ·
**risk** L

### F4 — Consecutive productive remint beats freeze the stamped ledger disc indefinitely: the `'covered'` refill only re-arms on a fully converged beat

**Evidence.** The remint inside `enqueueHoldExemptMeshBuildsSliced` at :2748-2762
mints `warmNearbyLedgerRowsSteps(state, { tolerateMiss: true })`, and the completing
collect mints with the stored toleration verbatim (:2624-2630: `warmToleration ===
'covered' ? 'covered' : true` → remint collect rides `tolerateMiss: true`
unconditionally — `ridesFar = hasLiveFarDisc && toleration === true` at :417-418, no
version/containment check). The `'covered'` mint at :2591 only happens when nothing is
live (:2582: `!iterator && !warmIter && !commitList`) — i.e., after a converged beat
(cycleEnqueued===0 && cycleKickStarted===0 → :2740 breaks without remint). While every
beat enqueues or kicks ≥1 row, the chain warm(true) → collect(true) → commit →
remint(true) continues indefinitely riding the SAME stamped disc.

**Mechanism.** During a long productive streak (fat continuous-enter hold while the
player travels), the stamped disc freezes cells behind the live union origin; rows
entering the live decode-runway edge that the frozen scratch doesn't hold are never
collected → their authored decode kicks never fire inside the hold → they materialize
after hold-end or on approach — late, i.e., exactly the popin class the hold exists to
prevent. Per-row live-origin filters keep correctness (subset under-collect, never
mis-collect); the staleness bound is travel-during-streak, which is unbounded.

**Fix sketch.** Bound the tolerant streak: every Nth productive remint — or whenever
the fresh plan's needed disc escapes the stamped `collectRadius` by >1 cell — mint the
remint with `'covered'` instead of `true`, so genuine drift still pays the stepped
refill (which already spreads its cost across beats). `'true'` buys never-refilling;
that is also what it costs.

**Effort** S · **magic-frame impact** M-L · **risk** L

### F5 — Still-synchronous O(entityList) walks inside the `sector:enter` emit tail: the weapons listener pays `collectOpticSpentIds` + `handlePayloadSectorTransition` (+ `clearAllMomentumSinkPlants`) atomically inside one drain step

**Evidence.** Emit slices bound *between* listeners — `drainEmitSlice` checks
deadline/paced-ledger after each listener (`src/core/eventBus.js:341-349`) — a single
listener runs whole. `src/systems/weapons.js:380-388` registers `sector:enter`
non-deferred (no `deferSectorEnterMaterialization` call). Its body runs
`handlePayloadSectorTransition(state, helpers)` → `src/combat/industrialBeam.js:~228-252`:
`for (const entity of Array.from(state.entities.values()))` — full entity-map walk +
per-row `removeEntity`; `clearAllMomentumSinkPlants` — plant-table sweep; and
`collectOpticSpentIds(state)` → `src/combat/opticField.js:247-257`:
`for (const entity of list)` over `state.entityList` — a second full walk. All atomic
inside one listener, inside the emit's first drain slice on the presented transition
frame.

**Mechanism.** On a fat sector (live list in the thousands) two corridor-scale table
walks land inside one presented frame — a brick exactly where the popin surface is
densest (transition → arrival). These are durable-ledger sweeps, not per-frame work.

**Fix sketch.** Defer the listener body through `deferSectorEnterMaterialization`
like its neighbors (it only needs post-materialization entity state — the deferred
FIFO drains under the hold's slice clock in listener order) or step the two walks
internally per-slice.

**Effort** S · **magic-frame impact** L-M · **risk** L

## Carried-forward, still live on this head

- **W80-F5 — journal rebuild atomic inside present.** `rebuildJournalIfNeeded` still
  calls synchronous `collectJournalPresentationEntities` +
  `presentationJournal.rebuildFrom` inside `presentLastCompletedSnapshot`
  (`src/core/presentationRunner.js:715-742`, invoked :779); `fallbackFromState` still
  runs `world.rebuildFromEntities(aliveEntities(state))` inside `consume`
  (`src/render/presentationPublisher.js:81-96`, sites :151-158/:182/:189/:204).
  Verified unchanged on `8b9bd6663`. Same fix sketch as W80: drive the collect via the
  chunked twin / generation-tagged two-frame rebuild. Rare path (resnapshot/fallback),
  but a full atomic journal scan inside one presented frame when it fires.

## Hunt ledger (lane brief items)

- **(a) Readers of `_meshFarScratch`/`_meshRockScratch`/`_meshWalkOrigin` during a
  suspended refill:** clean on this head. The W81-head staged refill walks private
  `staged` arrays and publishes scratch + memo key atomically inside one step per leg
  (:664-669, :678-683) — a collect minted mid-suspension by another caller either
  misses the memo entirely (strict → own sync refill; that IS the F1 path) or rides
  the previously committed disc via its own key checks (`meshFarKeyMatches`/
  `meshRockKeyMatches` :266-307 all require `key.state === state`). No torn-read
  window: the publish is one assignment inside one step; `_meshWalkOrigin` is a
  call-arg-only value, not shared state.
- **(b) Warm-iter suspension windows / memo commits on stale verdicts:** the commit
  stamps versions captured at plan mint (:655-657 destructure, :669/:683 stamp) — an
  honestly stale stamp, and the gates re-catch it (`key.far === farVersionNow` etc. in
  the matchers). Consequence: a stale commit never serves; the collect falls to strict
  sync refill (F1) or tolerant subset-ride (F4). The version check does its job —
  what it can't do is make the refilled walk cheap.
- **(c) Re-kick coverage mint + `warm.building` gate — late settles:** enumerated all
  paths a settle can arrive with `building === false` but warm alive
  (`_armCrucibleWarmBuildingSettle` :17479-17502, `_mintWarmReKick` :17514-17566,
  `_discardEarlyCrucibleWarm` :17440-17470): deadline force-drain mid-settle,
  superseded warm, discarded early warm. In every path the releaseClaim pair
  (:17534-17548) nets to zero — the late settle orphans nothing and lands no stale
  row: the gate at :17562 re-checks liveness post-mint. Clean.
- **(d) Remaining atomic popin classes inside emit tails:** F5 (weapons listener) is
  the live one. Cleared: deferred-enter FIFO drains bounded under slice clock
  (`sectorEnterDefer.js:130-191` with epoch guards + clock pinning); journal/rebuild
  path is F-carried (above); roster unions + packaged commit subject collects were
  stepped by W80 (`_publishArrivalRosterSteps` :18999-19052,
  `_reserveArrivalAsteroidCapacitySteps` :19064+, `_arrivalRosterIter` pump
  :2099-2126). `deferSectorEnterMaterialization` valve correctly only arms outside
  flight (`deferredEnterProviderInFlight` :197-210).

## Regression notes on landed waves

**W79 machinery (verified concretely on this head):**

- (i) `warmNearbyLedgerRowsSteps` plan-verdicts → `batchRows` → commit ordering with
  private staged arrays and half-fill never observable — verified :640-686.
- (ii) `_holdExemptWarmIter` abandon coverage: `abandonHoldExemptCollect` :2470-2485 /
  `abandonHoldExemptCommit` :2489-2503 restore claims; stored toleration verbatim
  :2624-2630; mint guard :2582; remint re-entry :2748-2762 — verified (F4 is a
  policy caveat on top of correct mechanics, not a correctness break).
- (iii) Stepped sweep twins: sync driver inline-exhaust (:20141+ prologue driven to
  completion when unbudgeted), set-before-prune ordering in `_pruneMotionTrackerRecordsSteps`
  (:19280-19325), drain prologue :20164-20215 — verified; the unguarded-driver edge
  the same conversion introduced is F3.
- (iv) `_residencySweepBeatStamp` per-invocation bump + env re-derivation
  (:19812-19852) + `liveShellLatched` release (:19850-19861) — verified.
- (v) `debitGate` + armed flags + private-clock seams: `createSlicedYield`
  (`pipelineReadiness.js:133-156`) arms `debitArmed` at mint (:142), debits at :148,
  re-arms :151; depth-stage arm debit :23452 is single-invocation — clean. The one
  ledger seam that does NOT follow the per-leg contract is the drain tail — F2.
- (vi) Cook warm `return()` propagation: `warmIterator.return()` invoked under
  `cookStale()` at :11722 and mirrored at the jump cook — verified; scratch is not
  observed across the abandon (private staged arrays discarded with the generator).

**W80 findings status on `8b9bd6663`:** F1 (torn scratch) fixed — staged arrays +
atomic publish. F2 (version stamps) fixed — plan-mint versions destructured :655-657,
stamped :669/:683. F3 (releaseDetached atomic) fixed — stepped census + live
`isClaimed` re-walk (:19344+). F4 (arrival roster) fixed — stepped publish + reserve
(:18999-19052, :19064+, pump :2099-2126). F5 (journal rebuild) — NOT fixed, carried
forward above.
