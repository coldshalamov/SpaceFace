# wave83-hitches

head: 2348ae3ed (branch `devin/1791064509-perf-w60`)

## 1. saturated: false

Legal contract-preserving improvements with conceivable implementation paths
remain. The dominant residual class this wave: **per-row evict bookkeeping is
O(registries), not O(1)** — every boundary evicted by the stepped sweeps still
runs five full registry scans (`releaseMesh` identity walks) plus an
O(pool.byDetail) asteroid-pool prefix scan inside a single `next()`, so a
mass-depart pass multiplies the work the W58-W82 pacing exists to split. Below
that: minted-verdict staleness across suspended beats (`deadlineGlassOnly`,
`waveMemo`, newcomer liveness), ledger tail under-debits, an epoch-guard
asymmetry on the cache-lease pump, and a zombie-receipt commit window the
suspension widened. Also found and verified: one NEW test-surface regression
from the W82 rename (§3.7) and one UPSTREAM defect (§4) predating the wave —
`planetDetailLibraryReady` spliced inside the rock decode `.then`, serializing
planet-detail decode and silently never-starting it on two paths. Every item
is render-side pacing/ordering; none touches the sim — golden stays
`892f88c9`-compatible by construction.

## 2. Ranked findings

### F1. `_unbindPresentationMesh` runs five full-registry `releaseMesh` scans per evicted row — the largest per-step atomic inside the stepped sweeps

- Evidence: `src/render/renderer.js:19957-20022` — per unbind, after the pooled
  texture release (:19972) and five O(1) `releaseEntityMesh` map deletes
  (:19993-19997), it calls `releaseMesh(mesh)` on five registries
  (:20001-20006). Each is a full map walk with per-record subtree probes:
  `asteroidMotionPresentation.releaseMesh`
  (`src/render/asteroidMotionPresentation.js:683-693`) scans every
  `asteroidStates` record running `nodeInsideTree` on `veinRig`/`scaleBodyRef`;
  `shipMicroMotion.releaseMesh` (`src/render/shipMicroMotion.js:2284-2289`)
  scans `craftMotion`; `infrastructureMotion.releaseMesh`
  (`src/render/infrastructureMotion.js:555-573`) scans `infrastructureStates`
  with inner `dishNodes.some(nodeInsideTree)`/`armNodes.some` predicates;
  `forgeRegentCrown.releaseMesh` (`src/render/forgeRegentCrown.js:280-285`) and
  `lawArenaDressing.releaseMesh` (`src/render/lawArenaDressing.js:1105-1110`)
  scan their record maps (`bossRecords`, `records` — small, boss-scale).
  Callers per row: `_reconcileMeshesSteps` evict leg (:20476),
  `_reconcileMeshResidencySteps` evict leg (:20645),
  `_releaseDetachedBoundaryOwnersSteps` (:20262), `rekeyEntityMeshes` (:1798),
  authored-upgrade unbinds (:12157, :14649, :15499, :15520).
- Mechanism: `asteroidStates` holds one record per asteroid — a belt sector
  carries ~10³-10⁴ — so each evicted boundary pays ~5 ordered map walks plus
  ancestor probes, ~0.5-3 ms inside one `next()` on a fat sector. A
  mass-depart pass (sector flip, jump, restore) evicts E rows →
  E × O(Σregistries) across the beat; the stepped generator cannot split
  below one row. Steady flight pays it too: every authored-upgrade remount
  fires five full walks for one mesh. The player sees the residual tail of
  the despawn hitch the queue already solved for GL disposal — bookkeeping,
  one level up.
- Fix sketch: batch entrypoint `releaseMeshes(roots)` — each registry walks
  its map once per sweep pass, probing membership against a Set of dead
  meshes — or a `WeakMap<root,record>` reverse index per registry.
  Verdict-identical release semantics (records keep motion state; only
  Object3D refs drop).
- Effort: M. Magic-frame impact: H. Risk: medium — five modules; release
  coverage must stay identity-exact or dead trees stay anchored.

### F2. `releaseAsteroidInstancesForEntity`/`rekeyAsteroidInstanceEntity` pay O(pool.byDetail) per row

- Evidence: `src/render/asteroidInstancePool.js:257-263` — the release scans
  the whole `pool.byDetail` map testing `key.startsWith(`${entityId}#`)`;
  `rekeyAsteroidInstanceEntity` (:291-298) runs the same prefix walk for the
  rekey, `releaseEntityDetailRecords` (:303-310) another. Called per evict
  row at `src/render/renderer.js:20477`/:20646 and per recycled key at :1805.
  `byDetail` holds one record per adopted detail leaf — thousands in rock
  sectors.
- Mechanism: same quadratic class as F1: a 2k-row evict burst on a
  detail-heavy sector scans the map 2k times — the dominant single-per-step
  term after the registry walks, and it lands inside sweep `next()`s whose
  slice clock cannot interrupt it.
- Fix sketch: maintain `byEntity: Map<entityId, Set<detailKey>>` beside
  `byDetail` (release/rekey become O(owned records)), or batch the census
  once per sweep pass.
- Effort: S-M. Magic-frame impact: M-H (asteroid-heavy sectors).
- Risk: low-med — internal map shape; missed records would leak pooled
  buckets, so rekey/release coverage must stay exact.

### F3. Submission-path atomics that cannot suspend — `_syncWorldPresentationTableMeshes` full-walk on origin rebase + `syncAsteroidInstancePool` dirty pass

- Evidence: `src/render/renderer.js:22376-22448` — on `frameOriginSeq`
  rebase the sync leg walks ALL `field.rocks` + `dressing.rows` inside the
  frame (:22416-22418, :22436); `syncAsteroidInstancePool` (:22493 →
  `src/render/asteroidInstancePool.js:441-498`) evaluates every dirty bucket
  record per presented frame (reuse fast path only when clean).
- Mechanism: these sit on the submit path — a presented frame's poses must
  be complete before draw, so no yield is legal inside. The rebase leg is
  O(field) — origin rebases fire on jumps AND on periodic wraps during long
  flights — i.e. a ~5-20 ms atomic lands exactly on the seam frames where
  decode/admission bursts already concentrate.
- Fix sketch: the dirty journal already bounds the common case; for the
  rebase leg, amortize across 1-2 frames behind a pose-version fence
  (meshes render at membrane-old pose for a beat — indistinguishable), or
  scope the rewrite to rocks whose origin bucket actually moved (most rebases
  shift a subspace, not the whole field).
- Effort: M-L. Magic-frame impact: M. Risk: medium — pose staleness during
  any amortized window must stay invisible.

### F4. `deadlineGlassOnly` minted once at drain start — stays sticky across suspended beats

- Evidence: `src/render/renderer.js:21015-21017` mints the verdict from
  `shouldStartHeavyAdmissionEventually(lastPresentDtMs)` at drain entry;
  the row loop breaks on it at :21108. Under W82 the drain parks across
  presented frames — a resume under a now-recovered frame still refuses
  ambient rows on the mint-time verdict.
- Mechanism: bounded-late direction (glass work proceeds, ambient backlog
  waits) — but on a sustained-late→recovery transition the drain keeps
  refusing ambient work for the whole call, deferring the backlog one call
  per sweep while the host is actually fast. The minted-verdict-staleness
  class W79's beat-refresh design reached elsewhere; `drainScan` is re-minted
  on beat bump (:21089-21101) but this flag is not.
- Fix sketch: re-mint `gate.start`/`deadlineGlassOnly` inside the beat
  re-mint block alongside `drainScan`. Effort: S. Magic-frame impact: M.
  Risk: low — could drain more than intended post-recovery; keep the
  per-call floor via the existing budget.

### F5. Zombie-receipt commit window widened by suspension

- Evidence: `src/render/renderer.js:15436-15443` — the `receiptIter` loop
  commits `state.render.openingSubmissionReceipt = receiptStep.value`
  unconditionally; no `cookStale`/generation gate between the last
  `yieldToBrowser` and the commit (contrast the settled-recapture drives at
  :13148/:13177 which check per iteration). `planIter` (:15273-15282) and
  the pipelineReadiness capture drive (`pipelineReadiness.js:868-879`) share
  the shape — `render.openingSubmissionReady`/`exactPipelineWarmupReady`
  stamp at :886-888 without a generation check.
- Mechanism: pre-existing last-write-wins semantics; W82's suspension widens
  the window. A prepare superseded by a second restore/sector-change that
  finishes last stamps a dead-scene baseline into the receipt the first-draw
  gate validates against (uncaptured-admission noise; the receipt also feeds
  mid-flight admission checks).
- Fix sketch: `sameGeneration()` gate before commit (the prepare wrapper
  already carries it), or tag receipts with `admissionRunGeneration` and let
  consumers ignore stale.
- Effort: S-M. Magic-frame impact: M (requires mid-prepare supersession —
  rare, but it is exactly the seam where hitch pressure already concentrates).
  Risk: low.

### F6. `waveMemo` minted outside `refreshRunwaySnapshot` — never cleared on beat refresh

- Evidence: `src/render/renderer.js:3964-3971` vs
  `refreshOnNewerBeat`→`refreshRunwaySnapshot` (:3917-3962) which re-mints
  `scan`, `env`, `secondsMemo`, `secondsPlayerMemo`, `runwayCtx` on every
  beat bump (:3985) — `waveMemo` alone persists for the whole call.
- Mechanism: a resumed pick grades `entityMatchesWaveHullRunway` on mint-time
  wave membership: a hull whose wave plan lands mid-suspension keeps
  `wave=false` → ranks ahead for decode instead of deferring. Ordering-only,
  bounded — the pick still re-checks liveness per row (:4061).
- Fix sketch: move `waveMemo` inside `refreshRunwaySnapshot` so it clears
  with the other verdict memos. Effort: S. Magic-frame impact: L. Risk: nil.

### F7. Newcomer census admits dead-but-present entities

- Evidence: `src/render/renderer.js:21037-21078` — `admitNewcomer` calls
  `entityWithinPlayerRadius` on the snapshot row (:21050-21057) with no
  `entity.alive` gate before `firstFlightIds.add(id)`.
- Mechanism: an entity killed between census snapshot and admit that still
  sits within radius earns the first-flight exemption; a recycled id
  inherits it. Bounded — the exempt set still traverses the build gate —
  but it is the minted-verdict-consumed-post-yield class this lane hunts.
- Fix sketch: `if (!entity || entity.alive === false) return;` early-out.
  Effort: S. Magic-frame impact: L. Risk: nil.

### F8. Residual un-debited tail segments under-report the paced ledger

- Evidence: `src/render/renderer.js` — (i) `driveHoist`'s synchronous-
  completion path posts nothing for its final segment (:20999-21008): a
  hoist fitting inside one segment is free; (ii) the drain row-loop's last
  segment after the final `yield`/`break` exits unposted (:21143-21147
  consume+count, no epilogue debit); (iii) the newcomer-census tail (<1024
  rows) between last yield and return (:21059-21078). W82 already closed the
  big case (per-suspended-segment debits on all three hoist sites — §3.3);
  these are the <1-segment tails.
- Mechanism: direction is under-debit — the ledger under-reads, so slightly
  more work than budgeted lands in a frame. Bounded under one segment each.
- Fix sketch: `try/finally { notePacedFrameSpend(now() - segStartedAtMs) }`
  on every exit path — the repartition epilogue at :20920 models it.
  Effort: S. Magic-frame impact: L-M. Risk: nil.

### F9. `_cacheLeaseIter` lacks the `enterSerial` epoch guard its sibling iterators carry

- Evidence: `src/render/renderer.js:2202-2248` (mint, pump, clear) vs the
  `_reconcileIter`/`_residencyPollIter` epoch checks at :2288-2295 and
  :2349-2357.
- Mechanism: a sector flip mid-cache-sweep lets the parked iterator commit
  releases minted against the departed world. Direction is still safe —
  releasing genuinely-unreferenced cache owners is sector-agnostic — but the
  asymmetry invites a future sector-scoped release verdict to inherit the
  unguarded pattern.
- Fix sketch: stamp `enterSerial` at mint; abandon + re-dirty on flip like
  the siblings (:2624-2657 pattern). Effort: S. Magic-frame impact: L.
  Risk: nil.

### F10. First-draw validation still re-walks the whole scene synchronously; dead sync plan builder retained

- Evidence: `src/render/renderer.js:23223` and :23375 — two sync
  `createOpeningSubmissionReceipt` calls remain inside the presented
  first-draw block (once per opening, deliberate — a suspended receipt
  mid-present is worse). Separately, the local sync
  `buildOpeningSubmissionPlan` (:11038-11105) now has ZERO src callers — all
  four pre-W82 call sites (:11214, :12969, :13191, :15056 at parent) became
  `buildOpeningSubmissionPlanSteps.call(this)` drives; it is held only by
  the source-pin test (§3.7).
- Mechanism: the first-draw recapture is a once-per-opening whole-scene
  census inside the presented frame — the reveal frame already pays the draw,
  so impact is bounded and self-limiting. The dead sync twin is pure
  maintenance surface.
- Fix sketch: accept the first-draw atomic (or diff the census from the
  sweep's staged keys instead of re-walking); delete the dead local and
  re-pin the test (§3.7).
- Effort: S-M. Magic-frame impact: L. Risk: low.

## 3. Regression notes on landed waves — W82 machinery verified concretely at 2348ae3ed

### 3.1 `buildOpeningSubmissionPlanSteps` / `createOpeningSubmissionReceiptSteps`

- (a) Sync drivers drain inline and return `step.value` for every caller.
  Enumerated sync-name call sites at head: `collectOpeningEntityRootCandidates`
  (:840-845) and `collectOpeningShadowCasterRootCandidates` (:888-893) drain
  `for(;;){step=next(); if(done) return value}` inline; `collectOpeningSubmissionLeaves`
  (`openingSubmissionPlan.js:327`) same; `createOpeningSubmissionReceipt`
  (:1155-1160) same — used by the two presented-frame sites (:23223, :23375,
  deliberate — §F10). Local `buildOpeningSubmissionPlan` (:11038) is dead code
  (zero src callers). Candidate ORDER and dedupe verified identical to the
  sync twins — single live-Map iteration, `alreadyIncluded` Set — the only
  divergence is live appends mid-suspension adding candidates (harmless:
  extra admissions, never missing ones).
- (b) Async drives: `settledPlanIter`/`settledReceiptIter` check
  `cookStale()` every iteration (:13148, :13177) and commit in the same
  synchronous segment as the last check (:13160, :13180) — a superseded cook
  cannot commit `openingSubmissionPlan`/`openingSubmissionReceipt` there.
  `planIter`/`receiptIter` (:15273-15282, :15436-15443) and the
  pipelineReadiness capture (:868-879) have NO mid-loop stale check — their
  commits land unconditionally post-drain (§F5: pre-existing semantics,
  window widened by suspension).
- (c) `scene.updateMatrixWorld(true)` runs at :11052 inside the generator's
  first segment — before the first `yield` at :11103. A suspended plan
  cannot observe half-updated matrices.
- (d) Per-32 yields preserve order: Map iteration order is stable across
  yields; `alreadyIncluded` dedupe is a Set keyed on identity — identical to
  sync output modulo the live-append tail noted in (a).

### 3.2 `hoistDeadlineGlassMeshBuildsSteps` — verified clean

- (a) Write-back re-anchors on `liveHead` (:3185-3189) — rows consumed during
  suspension are never rewritten.
- (b) Appended rows get inline `v===2` verdict eval (:3193-3194) — an
  appended on-glass row still hoists.
- (c) `_meshBuildQueuedIds` stamp filters consumed rows (:3191) — a row whose
  stamp was deleted cannot be repacked.
- (d) `verdicts` indexes `i - head` against the MINT head; the pass-2 walk
  iterates `[liveHead, len)`: `scanned = i - head >= 0` always (liveHead ≥ head),
  and rows appended beyond the mint tail exceed `verdicts.length` → `v=2` →
  fresh eval (:3193). Coverage is exact; consumed-then-requeued rows land
  past `verdicts.length` with fresh stamps and re-evaluate. Sync twin
  (:3209-3278) byte-identical modulo the yields/liveHead re-anchor.

### 3.3 `driveHoist` debit protocol — verified

- (a) All three hoist sites (prologue :21016, overflow :21122, saturated
  :21141) route through the `driveHoist` generator which posts
  `notePacedFrameSpend(now() - segStartedAtMs)` per suspended segment
  (:21004) — the W82 fix for wave82-F5 landed as specified.
- (b) `segStartedAtMs` re-mints after each hoist yield (:21006) — the
  row-loop segment covering pre-hoist work debits at the first hoist yield;
  no double-count.
- (c) Prologue hoist debits (clocks minted above the gate); refused-start
  returns 0 with identical gate semantics (:21009-21018).
- Residual: <1-segment tails on exit paths (§F8).

### 3.4 `releaseUnreferencedCacheOwnersSteps` pump — verified with one asymmetry

- (a) Parked iterator completes across pump invocations and clears
  `_cacheLeaseIter` (:2227-2248). Epoch handling: unlike the sibling
  iterators (:2290, :2352), no `enterSerial` check — releases are
  sector-agnostic so verdicts stay correct post-flip; flagged as asymmetry
  only (§F9).
- (b) Sync fallback (no Steps twin) fires the whole sweep atomically
  (:2215-2222) — preserved.
- (c) `evictOldestSoftEntriesSteps` inside `enforceSoftResidencyBudgetsSteps`
  (`assetResidency.js:611-681`) works a pre-collected candidates array —
  `release()` mutating `assets` mid-iteration cannot disturb the loop;
  `packageCacheBudgetDepth` re-entrancy guard intact.
- (d) `isClaimed` is now genuinely triad-only
  (`src/render/renderer.js:20149-20162`: `claimed.has` +
  `_sectorBoundaryPreparations.isBoundaryClaimed` +
  `inspectAuthoredBoundaryRegistrations`); the live re-walk lives ONLY in
  `isClaimedSteps` (:20167-20192, chunked per-mesh/per-256/per-512). Under a
  sync drain `claimed` is complete+fresh by construction, so a triad-miss
  owner there is released only when genuinely unclaimed; under the stepped
  path the stepped re-walk covers post-census claims. wave82-F1's
  recommended split landed correctly.

### 3.5 `rockSurfaceLibraryReady.then` pacing — verified

- (a) Every leg runs exactly once in original order inside :9384-9486;
  (b) `poolCompileRoots` minted once via the chunked census twin
  (:9433-9450 — output identical to the sync collects; pre-order traversal
  verified against `latePipelineAdmission.js:213-275`) and reused for the
  depth-subject list (:9467, null-safe fallback re-collect);
- (c) the torn-down-renderer guard `if (!this._meshes || this.scene !==
  liveScene) return;` (:9386) is checked ONCE at entry — legs after it are
  individually guarded/`catch`-all'd (:9486 swallows), so no throw is
  possible mid-continuation; a dead scene can still see wasted
  reskin/compile legs — bounded waste, no correctness fault.
- (d) `count` accumulates in a local across yields — await boundaries cannot
  lose it.
- One defect found inside this block is UPSTREAM — see §4.

### 3.6 lod queue-integrity — verified

- (a) Rehoist `queuedIds.has` filter (:20826) cannot skip a re-added row: the
  scan iterates `for (index = head; index < pendingBuilds.length; index++)`
  with live length — a consumed-then-requeued row lands past the original
  window, keeps a fresh stamp, and re-evaluates.
- (b) `startedAtMs` re-mint inside the drainBeat block (:21100) preserves the
  overall drain bound — a resumed drain abandons per its fresh span.
- (c) `isDetached` re-check per turn at :20210 runs BEFORE pin-sever
  (:20214-20217) AND dispose (:20218-20222) — a boundary re-attached between
  sweeps survives.

### 3.7 NEW test-surface regression from the W82 rename — `startup-geometry-residency` source pin now red

- `test/startup-geometry-residency.test.mjs:484` pins
  `RENDERER_SOURCE.indexOf('buildOpeningSubmissionPlan()', prepareStart)`
  where `prepareStart` is `state.render.prepareLiveSectorBeforeFlight =
  async` (head: :11446). At head the literal `buildOpeningSubmissionPlan()`
  exists NOWHERE in `renderer.js` — all four parent call sites
  (:11214/:12969/:13191/:15056) became `buildOpeningSubmissionPlanSteps.call(this)`
  drives — so `receiptStart = -1`, `assert.ok(receiptStart > prepareStart)`
  fails, and the seal-order guard the test enforced (no `PREPARE_BUDGET_MS`
  between barrier decision and pool seal, :588) is dead.
- Not in the preexisting-failures list; green at parent. Effort S — re-pin
  to `buildOpeningSubmissionPlanSteps.call(this)` in the test. Risk: nil.

## 4. Upstream defect found during verification (not a wave regression — predates W82, also on master)

- `src/render/renderer.js:9420` —
  `this.planetDetailLibraryReady = preloadPlanetDetailLibrary(renderer)`
  sits INSIDE the `rockSurfaceLibraryReady.then(async () => {...})`
  continuation (:9384-9486). `git blame` attributes the splice to upstream
  `8772a6a385` ("Planet bodies get terrain", 2026-10-03) — present at the
  W82 parent and on master; also splits the comment at :9418/:9421.
- Effects: (i) the planet-detail decode serializes behind the entire rock
  decode + reskin chain instead of starting in parallel — the 4 s
  `Promise.race` at :15263-15265 can expire before the late-started decode
  lands (self-heals: tiles arrive 1x1-neutral until decoded); (ii) if
  `rockSurfaceLibraryReady` rejects (swallowed at :9486) or the :9386 guard
  trips (teardown between mint and settle), `preloadPlanetDetailLibrary`
  NEVER starts → `planetDetailFor` returns null permanently → colossal
  planet bodies keep plain baked surfaces — a silent, permanent
  visual-quality hole on that path.
- Fix sketch: hoist the assignment out of `.then` to sit beside
  `creatureSkinLibraryReady` (:9377)/`rockFamilyLibraryReady` (:9375) —
  `readyPromise` memoization (`planetDetailLibrary.js:50-83`) makes the
  parallel start idempotent.
- Effort S. Magic-frame impact: M-H on the skip path. Risk: nil.

## 5. Lane-hunt appendix

- (a) Residual atomic units inside sweep generators, ranked — first-step
  sizes: `_reconcileMeshResidencySteps`/`_reconcileMeshesSteps` first step =
  stats reset + `refreshResidencyEnv` (O(1)); `_drainMeshBuildQueueSteps`
  first step = locals + gate + prologue hoist leg ≤256 verdict evals
  (largest first-step, bounded); `kickDecodeRunwayAssetsSteps` first step =
  `refreshRunwaySnapshot` + memo mints + first pick evaluate (resolver chain,
  O(1)-ish); `releaseUnreferencedCacheOwnersSteps` first step =
  `[...assets.values()]` snapshot (O(assets) alloc, bounded);
  `_releaseDetachedBoundaryOwnersSteps` first step = claimed-census seed —
  departed list + boundaryIndex + refs walks per-1024-yielded (:20140-20148);
  `hoistDeadlineGlassMeshBuildsSteps` first step ≤256 evals.
  Per-step costs: collect rows O(1) on pre-minted ctx; classify rows O(1)
  via `tGlassCache` memos; enqueue rows O(1) + request kick; drain rows
  bounded by the admission budget; warm legs O(pending roster) small — the
  EVICT row is the outlier: F1 + F2 make it O(Σregistries) + O(byDetail).
- (b) Verdict-minted-pre-yield/consumed-post-yield inventory: all audited
  minted verdicts re-verify at consume (`queuedIds.has` :3191/:20826,
  `stampedKey` mismatch :20464-20465, alive re-check :4061,
  `isDetached` :20210, `isClaimedSteps` live re-walk) EXCEPT: F4
  (`deadlineGlassOnly`), F6 (`waveMemo`), F7 (newcomer liveness), and the
  receipt commit (F5). `deadlineGlassOnly`/`waveMemo` degrade toward
  conservatism; F7 toward a stale exemption (bounded); F5 is the only
  state-write hazard.
- (c) Beat-stamp refresh seam: `refreshOnNewerSweepBeat` re-mints scan/env
  and clears `tGlassMemo`; the `claimed` census in
  `_releaseDetachedBoundaryOwnersSteps` is one-shot minted but covered by
  the `isClaimedSteps` live re-walk fallback; `residencyScanOpts.scan`/
  `drainScanOpts.scan` mutate in place so iterators minted mid-pass see
  fresh. Entity death/key-recycle: `resolveWorldPresentationEntity`
  re-resolves per row; `stampedKey` mismatch releases the stale mesh rather
  than drawing it on the wrong boundary. Correct post-refresh.
- (d) Private-clock flight work: `decodeTaskBudget` (the ledger itself,
  self-debiting), `gpuQueuePace` (finish pacer — bounded per unit by design),
  `compilePresentSlice`/`asyncAdmission` (schedulers, not CPU),
  `drainDeferredEnterSlice` (4 ms budgeted, `sectorEnterDefer.js:130`),
  despawn queue (ledger-gated + aging cap :1846-1887), GLB prepass timer
  (worker timeout). Nothing flight-reachable and unledgered of meaningful
  atomic cost remains except the submission-path atomics in F3.
- (e) Debit accuracy: all `notePacedFrameSpend` sites verified — per-256-row
  census debits (:21064-21077), per-row drain debits (:21126-21134),
  repartition debits (:20911/:20920), hoist per-segment debits (:21004),
  hold-exempt epilogue (:2938), pump debits. Residuals are the <1-segment
  tails in F8. `driveProtectedFirstFlightDrain`'s outer loop carries no
  epilogue debit but the inner generator's per-segment posts cover it.
  `enqueueHoldExemptMeshBuildsSliced`'s single epilogue debit
  (`now() - started` :2938) includes any suspend window inside its
  drive/collect `yield*`s — direction is over-debit for that frame
  (conservative; siblings under-drive one frame, self-heals).
