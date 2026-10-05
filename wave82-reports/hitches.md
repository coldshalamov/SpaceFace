# wave82-hitches

head: 2b3e8e99c

## 1. saturated: false

Legal contract-preserving improvements with conceivable implementation paths remain —
principally: the stepped detached-owner release still pays a fused sync probe's full
live re-walk per missed owner inside one `next()`; the 10 s in-sector cache-decay
sweep is the last fully synchronous sweep running on the flight frame; the residency
budget eviction leg stays atomic on real overage; a late-landing rock-surface reskin
continuation carries scene traverses plus a synchronous depth-pipeline compile inside
one microtask; and the drain's hoisted `yield*` suspend windows sit outside segment
debiting (ledger accuracy, not starve). All are fixable inside the
no-visible-degradation and bit-identical-sim contracts — every one is render-side
pacing/ordering, no sim fields touched.

## 2. Ranked findings

### F1. `releaseDetachedBoundaryOwnersSteps` pays the sync `isClaimed` re-walk per missed owner — heaviest atomic unit left in the sweep chain

- Evidence: `src/render/assetResidency.js:430-445` — the stepped release leg yields
  every 64 visited owners, but per missed owner it first runs the fused synchronous
  probe `releaseProbe.isClaimed(owner)` (:435) and only then `yield*`s
  `releaseProbe.isClaimedSteps` (:436). The fused probe at
  `src/render/renderer.js:19913-19947` is triad + FULL live re-walk:
  `claimed.has` + `isBoundaryClaimed` + `inspectAuthoredBoundaryRegistrations` are
  all bounded lookups, but the tail (:19929-19946) re-walks every `_meshes` value's
  ancestor chain, the entities map, and the refs map — O(meshes×depth + entities +
  refs) — inside the same `next()`. The stepped twin `isClaimedSteps`
  (:19951-19974) then re-walks those same three sources chunked.
- Mechanism: on a mass-detach wave (sector handoff parks, then abandons authored
  boundaries) every genuinely unclaimed owner pays the complete three-source
  re-walk twice — once synchronously inside the probe, once stepped. The sync half
  always lands inside a presented frame: up to 64 misses share one yield boundary,
  so a fat sector (~2-5k meshes × ~8 ancestors + ~10k entities + ~5k refs) packs
  millions of probe ops into a single step — a multi-ms brick on exactly the
  sector-flip frames the rest of the machinery was stepped to protect.
- Fix sketch: mint a triad-only quick probe for the stepped path (`claimed.has`
  + `isBoundaryClaimed` + `inspectAuthoredBoundaryRegistrations`) and let
  `isClaimedSteps` own the live re-walk; keep the fused probe for the synchronous
  drain (where the minted `claimed` is already live-fresh). Verdicts are preserved —
  the stepped re-walk reads the same three sources, fresher across yields, which is
  strictly more conservative (claims landing between mint and resume are honored).
- Effort: S. Magic-frame impact: M-H. Risk: low — pure probe split; the release
  path already tolerates claims landing between the two probes.

### F2. In-sector cache-decay sweep is the last fully synchronous sweep on the flight frame — every 10 s inside `serviceRenderMeshResidency`

- Evidence: call site `src/render/renderer.js:2177-2185` — every
  `CACHE_LEASE_SWEEP_SECONDS` (10 s) the pump calls
  `owner._assetResidency.releaseUnreferencedCacheOwners('in-sector-cache-decay',
  { minAgeMs: CACHE_LEASE_MAX_IDLE_MS, maxCacheOnlyBytes: CACHE_LEASE_MAX_BYTES })`
  synchronously. The pass at `src/render/assetResidency.js:833-898` runs entirely
  inside `packageCacheBudgetDepth++`: `[...assets.values()]` snapshot walk with
  per-entry `[...entry.owners.entries()]` filtered allocs, then `release(...)` per
  surviving cache owner (:860-862) → `evictIfUnowned` → `finalizeResource` →
  `resource.dispose()`, then the soft-budget eviction leg (`:866-887`). Zero
  yields; no Steps twin exists.
- Mechanism: every 10 s of flight a presented frame pays O(assets) snapshot +
  walk; when the decay actually fires — ≥30 s idle cache-only entries or the 128
  MiB cache cap, exactly what a post-jump warm tail produces — the same call
  additionally pays releases×owners plus GL disposes inline: dozens of package
  evictions inside one frame. This is the same dispose-storm class the
  despawn-dispose queue and the detached-owner steps were built to remove,
  arriving on a fixed cadence rather than a demand event.
- Fix sketch: mint `releaseUnreferencedCacheOwnersSteps` — yield per N assets
  scanned and per released/evicted candidate — driven on the same slice clock as
  the reconcile/poll pumps (or `yield*` it as another leg inside the existing
  poll generator). Release order stays LRU/lease-faithful; a mid-sweep suspend
  only defers the tail a beat, same semantics as the other stepped sweeps.
- Effort: M. Magic-frame impact: M-H (guaranteed O(assets) every 10 s; decay
  spikes on top). Risk: low-med — the pass is idempotent per owner; must preserve
  the minAge/softLease guards and eviction ordering.

### F3. `enforceSoftResidencyBudgetsSteps` keeps its eviction leg atomic — sort + releases + disposes inside one step on real overage

- Evidence: `src/render/assetResidency.js:663-677` — the stepped twin yields every
  256 tallied entries, but both `evictOldestSoftEntries` invocations (:671-677)
  run whole: collect `[...assets.values()]`, sort by oldest lease, then per-entry
  `release(...)` ×owners → `evictIfUnowned` (:907-932) → `finalizeResource`
  (:934-967) → `resource.dispose()`. `packageCacheBudgetDepth` serializes it.
- Mechanism: on a genuine soft-byte overage (post-jump warm expiry, texture churn)
  the leg evicts every over-budget candidate inside one `next()` — per-owner
  release walks plus GL `dispose()` — the same brick class every neighboring leg
  slices. Amplitude ~O(entries + evictions × owners-per-entry).
- Fix sketch: chunk the eviction loop — yield per K visited/evicted entries like
  the tally leg; the ordering sort can stay atomic (it defines eviction order) or
  fold into the stepped tally. Depth guard already prevents re-entry.
- Effort: S-M. Magic-frame impact: M (rare but real bursts). Risk: low.

### F4. `rockSurfaceLibraryReady.then` continuation can land mid-flight carrying scene traverses + a synchronous depth-pipeline compile

- Evidence: `src/render/renderer.js:9313-9384` — on library resolve, one microtask
  runs: `upgradeBareRockMaterials` × every `_meshes` value plus every
  `_rosterPrewarmRoots` root (:9317-9321 — a subtree walk each),
  `seatReadyRockSurfaceTextures` (:9322), `compileObjectPipelines` per parallax
  group (:9323-9327 — routed through paced admission), `warmAsteroidInstanceVariants`
  (:9331), `collectInstancePoolCompileRoots(liveScene)` scene traverse (:9350,
  :9365), then a synchronous `compileShadowDepthPipelines` over prewarm + pool
  roots (:9368-9379 — staging ceremony + depth render). Everything past :9339 is
  gated `count > 0` — it fires exactly when the reskin lands on live rocks. Cook
  side: `prepareOpeningGpuResources` races the library at 4 s (:15002-15007); a
  slower decode lands the whole continuation after first flight. (Only the rock
  library carries this continuation — rockFamily/creatureSkin have none.)
- Mechanism: the late-land case — texture decode slower than the 4 s cook cap —
  pays subtree material walks + a whole-scene traverse + a sync shadow-depth
  ceremony inside one microtask: one fat frame mid-flight on precisely the
  asteroid-field population the first-flight hold exists to protect.
- Fix sketch: yield-chunk the reskin walks (per-N meshes / per root, like the
  other stepped sweeps) and drive the depth compile off the paced lane —
  subjects are independent per root and `captureObjectHome`/`restoreObjectHome`
  already handle off-graph subjects, so chunking by subject is mechanical.
- Effort: M. Magic-frame impact: M (late-land only — but that is the designed-for
  case). Risk: med — reskin must preserve compile-before-draw ordering.

### F5. Drain `yield* hoistDeadlineGlassMeshBuildsSteps` suspend windows sit outside segment debiting — ledger accuracy residual, not a starve

- Evidence: `src/render/renderer.js:20750` — the refused-start gate's prologue
  hoist runs before `segStartedAtMs` is minted (:20754/:20765 mint post-hoist),
  so its per-256 verdict segments are ledger-invisible. The mid-drain hoists at
  :20863 and :20882 (each a `yield* hoistDeadline...`) park across presented
  frames *inside* the `segStartedAtMs` span — the whole parked interval posts
  into the next segment's debit at :20772-20774/:20827-20829.
- Mechanism: (a) prologue-hoist work never posts — minor under-count; (b) a
  multi-beat mid-drain hoist inflates one frame's posted debit, so siblings
  under-drive that frame — protective direction, self-heals next frame, no
  hitch. Same class as the armed-slice over-debit W79 fixed elsewhere.
- Fix sketch: drive the hoist via a manual iterator + row-boundary hook posting
  `notePacedFrameSpend` per 256-row segment (the `pickIter` pattern at
  :3925-3928), or give the hoist the `{debit}` option other slicers take.
- Effort: S. Magic-frame impact: L. Risk: low.

### F6. Minor residuals — bounded, recorded for completeness

- `collectJournalPresentationEntitiesChunked` mints `entityList.slice()` +
  `dressing.rows.slice()` inside the first `next()`
  (`src/world/presentationSources.js:122,127`) — two O(n) snapshot allocs per
  collect; deliberate (the live-tail protocol needs them). Impact L.
- `_protectedFirstFlightDrainIter` (`src/render/renderer.js:1871-1899`) carries
  no epoch gate — a parked repartition can grade newer-epoch rows on the
  mint-time exempt evaluator; ordering-only (the drain re-verifies relevance per
  row) and heals via the beat refresh. Impact L.
- `hoistDeadlineGlassMeshBuildsSteps` mints `scan` once per call
  (`src/render/renderer.js:3087`) — rows hoisted on later beats grade on the
  minted scan; ordering-only, drain re-verifies per row. Impact L.
- The poll sweep's four tier sorts ride the per-pass `tGlassCache` memo
  (`src/render/renderer.js:20381-20389`, cleared on env refresh) — post-classify
  the comparators are ~O(n log n) Map.get inside one step (worst ~1-2 ms on
  ~500-row queues). Bounded; only worth touching if sweeps grow. Impact L.

## 3. Regression notes on landed waves — W79 machinery verified concretely at 2b3e8e99c

### 3.1 `warmNearbyLedgerRowsSteps` (`src/world/presentationSources.js:716-762` + query twins)

(a) Plan-vs-drift: the plan mints `walkOrigin`/`walkRadius`/`collectRadius` once at
iterator creation (:717-736) and the committed memo key carries the plan's origin and
radius verbatim — a suspended refill resuming after a quantized-cell crossing stamps
its plan's walk disc, not a drifted re-read. A stale-plan commit is honestly stale:
the next collect's containment check (`farCovered`/`rockCovered`) fails and
refetches.
(b) `batchRows=Infinity`: the linear legs (`src/world/farActorTable.js:619-622`,
`src/world/asteroidField.js:218-225`) gate yields on `(i+1) % batch === 0` /
`scanned % batch === 0` — never true at Infinity → zero mid-leg yields. The grid
legs (`farActorTable.js:632`, `asteroidField.js:235`) yield once per grid column
unconditionally — a semantic no-op for every non-stepped caller, since all of them
drain inline (`while(!next().done)`); real callers into the twins pass finite
batches (ctx uses 512/256; stepped drivers default 1024).
(c) Memo commit ordering: `rememberMeshFarKey`/`rememberMeshRockKey` run only after
their `yield* query…Steps` completes; each leg walks a private `staged` array and
publishes it into the shared scratch inside the same step that stamps the memo —
a `return()` mid-walk leaves no stamp, and no reader ever observes a half-filled
disc.
(d) Mid-refill membership bump: the memo key carries the plan-minted table version —
a far/field version bump mid-walk leaves the just-committed key honestly stale and
the strict 'covered' gate re-fetches; torn state is unobservable because staged
rows never reach the scratches before commit.

### 3.2 `_holdExemptWarmIter` drive (`src/render/renderer.js:2651-2878`)

(a) Abandon completeness: `abandonHoldExemptCollect` (:2562-2577) clears all six
fields (warmIter/toleration/warmEpoch + collectIter/collectOut/collectEpoch) and
`return()`s both iterators, propagating into the query twins. Callers enumerated:
commit-epoch mismatch (:2659), collect-epoch mismatch (:2663), warm-epoch mismatch
(:2671), warm throw (:2708), collect throw (:2741), commit mint (:2767), hold
release (:2156). A `.return()`ed collect iterated to `done` produces
`out = null → []` → empty commit → converged break — no stale mint.
(b) Verbatim toleration: `owner._holdExemptWarmToleration` stored at warm mint is
consumed verbatim at the deferred collect mint (:2719-2721) — 'covered' never
flips to `true`.
(c) Mint guard: collect + commit are unreachable while a warm is parked — the mint
branch requires `!iterator && !warmIter && !commitList` (:2674).
(d) Remint re-entry: `continue` (~:2870) re-enters the warm on the same beat; a
warm finishing inside a spent beat parks its collect mint to the next beat with
`_holdExemptCollectEpoch` re-minted from the live epoch — the commit epoch is
minted fresh per collect (:2773), never carried stale.

### 3.3 Stepped sweep twins — sync-driver contract

(a) Every sync driver exhausts the generator inline and returns `step.value`:
`_drainMeshBuildQueue` (:20703-20712), `reconcileMeshes` (:20155-20167) and its
poll twin, `_pruneMotionTrackerRecords`, `_releaseDetachedBoundaryOwners`,
`_publishArrivalRoster`, `_drainProtectedFirstFlightBuilds` — all the
`steps.call → while(!step.done) → return step.value` shape; row order and verdicts
are identical to the atomic pass (the generators only yield, never branch on
suspension). Sync fallbacks remain for Steps-absent owners — the W81 bare-owner
fix. Test fixtures do not stub the twins against the contract: the only test
references are source-scan regexes (test/startup-geometry-residency.test.mjs:673-695).
(b) Census-before-consume: `_pruneMotionTrackerRecordsSteps` mints `active` via
chunked census legs to completion before `registry.prune(active)`;
`_releaseDetachedBoundaryOwnersSteps` completes all three claimed-census legs
before the release probe is minted — no ordering slip.
(c) Drain prologue is segmented rather than atomic: refused-start gate + `yield*`
hoist, then `notePacedFrameSpend; yield` (:20772), scan mint, newcomer census
yields/1024 — per-iteration work stays inside the while loop; every `yield*` leg
delegates yields into the same cadence (the debit-window nit is F5).

### 3.4 `_residencySweepBeatStamp` env refresh

(a) Per-invocation bump: the reconcile pump (:2249) and poll pump (:2302) each bump
once per invocation before stepping — a pump invocation that breaks without
stepping leaves the stamp ahead of the generator's `sweepBeatSeen`, and the
generator's own refresh check is the arbiter; no double-bump within one resume.
(b) Refresh completeness: `refreshReconcileEnv` (:20207-20216) re-derives
`reconcileSpeed`/`reconcileCam`/`reconcileEvictBase`/`reconcileEvictShipWreck`/
`reconcileScanOpts.scan` (mutated in place so iterators minted mid-pass grade on
the fresh scan)/`env` and clears `tGlassMemo`; `refreshResidencyEnv`
(:20390-20401) re-derives the same set and clears `tGlassCache`; the drain's
beat refresh re-mints `simNow`/`drainScan` and clears `glassVerdictMemo`
(:20835-20842). Every minted term consumed by the row loops is re-derived —
nothing survives stale.
(c) `liveShellLatched` reads live per row (:20234-20236, :20409-20411): a latch
arming mid-sweep switches remaining rows off evict/upgrade verdicts immediately;
a latch RELEASING mid-sweep resumes evicting immediately — and the release
direction cannot run the dispose storm unsliced: evicts push onto
`_despawnDisposeQueue` (:20433-20435) drained bounded by
`drainDespawnDisposeQueue` (:1958, DESPAWN_DISPOSE_BUDGET_MS = 2 ms).

### 3.5 debitGate + slice-mode armed flags

(a) `createSlicedYield` (`src/render/pipelineReadiness.js:133-156`) samples
`debitGate()` at slice mint and re-arms after each real yield — a mid-slice mode
flip debits the slice's span under its mint mode; posted spend can't be
forfeited or double-counted.
(b) A loading-minted armed slice completing under flight posts into the flight
wallet — bounded over-debit of one slice's span, self-healing next presented
frame (spend, not persistent debt). Not a starve vector.
(c) `SliceStart`/private-clock enumeration: every mint site pairs a gated
`notePacedFrameSpend`; `drainDeferredEnterSlice`
(`src/core/sectorEnterDefer.js:130-191`) rides the same paced wallet with a
4 ms/epoch bound; `_drainPendingMeshBuilds` consults
`shouldContinueAdmissionSlice({usePacedLedger:true})` so inline admission is
bounded by the shared ledger. Residual: F5.

### 3.6 Cook warm drives — abandon correctness

`warmIterator.return()` on cookStale (widen :11950, jump :14360/:14368)
propagates through the `yield*` chain into `warmNearbyLedgerRowsSteps` and the
query twins — no memo stamps on abandon (commit-only-after-complete per 3.1(c)).
The module scratches `_meshWalkOrigin`/`_meshFarScratch`/`_meshRockScratch` stay
unobserved while a warm suspends: staged rows publish only at commit;
interleaved readers see the last committed disc.

Other W80/W81 machinery spot-verified this audit: `enqueueMeshBuildCandidate`
per-row yields + `rowBoundary` hook; `kickDecodeRunwayAssetsSteps` re-checks
`entity.alive === false` at claim (:3990) — a pick minted pre-yield on a
departed entity is skipped, not acted on; the commit evaluator re-mints per
beat; `drainMeshBuildsBehindShell` drives one `Steps(Infinity)` drain per pass
and re-bumps the beat on resume; `_arrivalRosterIter` /
`_pruneMotionTrackerRecordsIter` mint paths `return()` the prior parked
iterator before re-minting.

`saturated: false` stands — F1-F4 are real remaining atomic costs with clear
contract-preserving implementations.
