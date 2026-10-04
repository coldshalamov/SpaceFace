# Wave-75 audit — popin-admission lane

Repo: coldshalamov/SpaceFace @ `9659573ef` (`devin/1791064509-perf-w60`, wave 74 head). Read-only audit; no code changed, no app run.

```
saturated: false
```

Legal contract-preserving wins remain: the deferred swarm warm's coverage ledger has three attribution gaps that can leave an archetype covered-forever-but-never-warmed (permanent in-round pop-in), one retry-loop isolation hole that can forfeit a whole wave's warm, and one mutator-scoped eligibility desync.

## Findings (ranked)

### 1. Deferred warm retries mint no `_swarmWarmReKickClaims` — an in-flight deferred retry reads covered, not provisional, to the NEXT wave's fresh filter

Evidence: `src/render/renderer.js:17282-17286` (fresh filter: `(covered||0) <= (reKickClaims||0)`), `17379-17380` (deferred retry mints `coveredMap` + `retryMintCounts` — no claims write), `16900-16902` (the LAUNCH lane's `collectReKicks` mints `_swarmWarmReKickClaims` at the same point), `15084-15097` (cleanup/draft + `run:wavePlanned` triggers re-enter `_warmSwarmDeferredRoster` for later waves), `17562-17568` (the deferred retry race shares `settleDeadlineAt` — retries outstanding at chain end are real), `17604` (`pending:false` while retries outstanding).

Mechanism: W73 minted `_swarmWarmReKickClaims` in the launch re-kick precisely so a row whose re-kick is in flight counts provisional for the next deferred filter — "bounded duplicate beats guaranteed pop-in" (the contract restated at `17278-17281`). The deferred lane then grew its own retry pass (releasedRetries, dispatched at `17555-17557`) that mints only `coveredMap`/`retryMintCounts`. Two paths leave a deferred retry in flight when a different-wave trigger filters:

- a fast round — the wave-N+1 `cleanup`/`draft` trigger (targeting N+2) fires while wave-N+1's chain is mid-retry-race; `eligible(N+2) ⊇ eligible(N+1)`, so row E reads `covered(2) > claims(0)` and is skipped;
- the retry race timing out — retries dispatched near `settleDeadlineAt` stay outstanding when the chain completes (`pending:false` at `17604`), same read.

W73's "unreachable" reasoning relied on the unbounded `allSettled`; W74 added `WARM_BUILDING_SETTLE_DEADLINE_MS` (30 s, `6083`), so a timed-out chain CAN leave retries outstanding — the prompt's hunch holds.

Consequence: strike-2 settle → E uncovered for a whole extra dwell (next chance is the wave-(N+2) trigger) — every E spawn in round N+1 pays the in-round decode+compose+link the warm exists to kill. Hung retry → `covered` stays 2 forever → E pops in on every spawn for the rest of the run.

Fix sketch: mint `_swarmWarmReKickClaims` inside `makeDeferredWarmKickRetry`'s mint block (`17379-17380`, alongside `coveredMap.set`/`retryMintCounts.set`) and decrement it in the same `.then` that bumps `retryReleasedCounts` — mirrors the launch lane's mint/release pair exactly. Effort: **S**. Impact: **H** (permanent pop-in for a hung retry; whole-round pop-in for strike-2). Risk: low — the only direction is over-warm (one bounded duplicate exemplar), the trade W73 already accepted.

### 2. `swarmWarmOutcomeClaims` claims `'authored-upgrade-request-threw'` — a kick whose request threw keeps coverage forever

Evidence: `src/render/renderer.js:6070-6074` (`status.startsWith('authored')` → claimed), `7413-7414` (the wrapper mints `{status:'authored-upgrade-request-threw'}` on a synchronous throw of `mesh.userData.requestAuthoredUpgrade`), `16352`/`17445` (ship kicks call the wrapper), `src/render/partsLibrary.js:7356-7358` (the prefix exists to claim `authoredAssetState` values resolved as job status: `'authored'`, `'authored-prepared'`, `'authored-with-cleanup-error'`).

Mechanism: the `'authored'` prefix claim was written for the three successful `authoredAssetState` values that successful packaged upgrades resolve with. W71 then minted `'authored-upgrade-request-threw'` as a failure-leg `{status}` — same prefix, opposite meaning. A sync-throwing request resolves claimed → coverage never releases → no retry, no next-dwell re-warm → the archetype reads covered for the rest of the run while nothing was decoded or composed. Every spawn of it pops in cold — permanently, per affected archetype. Trigger is rare (needs an actual sync throw inside `requestAuthoredUpgrade`), but the wrapper exists precisely because that happens.

Fix sketch: claim the exact `authoredAssetState` set (`'authored'`, `'authored-prepared'`, `'authored-with-cleanup-error'`) instead of the prefix, or rename the threw status outside the prefix (e.g. `'upgrade-request-threw'`). Effort: **S**. Impact: **H** mechanism, M reachability → rank holds. Risk: very low.

### 3. Deferred retry loop lacks per-kick isolation — one throwing retry aborts the whole wave's warm

Evidence: `src/render/renderer.js:17473-17478` (hulk retry kick calls `hulk.userData.requestAuthoredUpgrade` RAW — the throwing-guard wrapper at `7402-7415` is used only for ships), `17377` (`kick(1)` inside `retry()`), `17555-17557` (`const reKick = retry()` unguarded in the releasedRetries loop), `17584-17591` (`.catch` → `unmark()` + `teardown()`), contrast `16904-16912` (launch lane wraps each `reKick(1)` in try/catch and continues).

Mechanism: `makeDeferredWarmKickRetry`'s `kick(1)` invokes the raw boundary method for hulks — a synchronous throw (also possible inside `retryFailedAuthoredAdmission` at `17372`) propagates out of `retry()`, out of the releasedRetries loop, into the chain's `.catch` → `unmark()` releases every mark and `teardown()` detaches the half-built root → the ENTIRE wave's deferred warm is forfeited; every fresh archetype waits a full extra dwell. First-strike hulk kicks are guarded (inside the build `try` at `17467-17489`) — only the retry dispatch isn't.

Fix sketch: wrap `retry()` in the releasedRetries loop (or `kick(1)` inside `makeDeferredWarmKickRetry`) in try/catch — on throw, release that retry's own mint and continue the remaining retries. Effort: **S**. Impact: **M** (whole wave's warm forfeited; needs a hulk retry throw). Risk: low.

### 4. `heavies_only` mutator fields unlock-ineligible heavies the eligible-scoped warms never cover

Evidence: `src/systems/survivalWavePlanner.js:85-93` (`HEAVIES_ONLY_ROSTER` stamps `fromWave: 1` — "the mutator fields heavies from the first wave"), `106-114` (`applyHeaviesOnly` rewrites every non-heavy package to `bruiser_brawler`), `581-587` (`swarm.roster` replaced wholesale), `src/data/swarmMode.js:606` (`swarmEligibleEnemyIds` reads the STATIC roster unlocks — `bruiser_brawler` 18, `field_anchor_controller` 16), `src/render/renderer.js:17284` (deferred warm filters `swarmEligibleEnemyIds(nextWave)`; launch warm scopes `eligible(1)` the same way).

Mechanism: the spawn path honors the PLAN-declared roster (`pickSwarmArchetype` reads the roster's stamped `fromWave`), but both warms scope to the static `swarmEligibleEnemyIds`. In a heavies-only crucible run, `bruiser_brawler` spawns from wave 1 — it is literally the rewritten fallback for every non-heavy package — yet stays warm-ineligible until wave 18; `field_anchor_controller` until 16. For ~17 waves the dominant spawned archetype has no exemplar warm: every spawn pays the cold compose+link in-round (the wave-hull runway still covers raw decode, ≤4 keys — F9). The mutator is the worst case for this machinery: heavies are the biggest authored hulls.

Fix sketch: union the wave plan's actual `swarm.roster` enemyIds (the plan-declared unlock surface) into the deferred warm's fresh set — plumb the plan for `nextWave` through, or stamp `plan.swarm.warmRosterIds` at plan time that `_warmSwarmDeferredRoster` unions in. Effort: **M**. Impact: **M** (mutator-only, but severe inside it). Risk: low — over-warm direction only.

### 5. On settle-deadline timeout the deferred chain unmarks kicks that already settled 'completed'

Evidence: `src/render/renderer.js:17522-17547` (`results=null` on timeout → the `bound` loop treats every pendingAttachment as unclaimed → `unmarkEnemy` for all), contrast launch lane per-kick `entry.result` tracking at `16359-16361`.

Mechanism: `Promise.race(allSettled, deadline)` losing to the 30 s deadline hides per-kick outcomes — rows whose kicks already settled `'completed'` (exemplar attach landed, decode+compose real) get released alongside genuinely-stuck ones. Next dwell re-marks and re-builds them: duplicate exemplar work steals the fresh set's bounded build/kick window. Direction is over-warm (waste, never a coverage loss) — but it inflates the next dwell and can displace that wave's own fresh exemplars in the 4 ms slices.

Fix sketch: remember each kick's settle the way the launch lane does — attach `.then(r => entry.result = r)` inside `track()`, so the timed-out path releases only rows with genuinely retriable-or-missing outcomes. Effort: **S–M**. Impact: **L**. Risk: low.

### 6. `releaseClaim` reads `this._swarmWarmReKickClaims` live — a stale-run settle can decrement the NEW run's claims

Evidence: `src/render/renderer.js:16875` (`const claims = this._swarmWarmReKickClaims` read at settle time), `15106` (map nulled at `run:ended`), `16899-16902` (new map minted at next `collectReKicks`), contrast `17294-17297` (the coveredMap capture — mint-time map captured precisely because late writes must not hit a future map of record).

Mechanism: a launch re-kick from run N settles after `run:ended` nulled the map and run N+1 minted a new one → `releaseClaim` decrements `claims.get(enemyId)` on the NEW run's map → eats a live provisional claim → the deferred filter reads `covered > claims` and skips a row whose N+1 re-kick is still in flight. Same consequence class as F1 via a foreign decrement; requires the cross-run settle race, so rarer.

Fix sketch: capture the claims map at mint time inside `collectReKicks` and close over it in `releaseClaim` — symmetric to the documented coveredMap capture. Effort: **S**. Impact: **L–M**. Risk: low.

### 7. Deferred retry late `.then` can double-release a row the `.catch` path's `unmark()` already returned

Evidence: `src/render/renderer.js:17342-17362` (`unmark`'s `mine` nets `retryMintCounts − retryReleasedCounts` — releases outstanding retry mints on chain failure), `17382-17391` (retry `.then` unconditionally decrements `coveredMap` and bumps `retryReleasedCounts` on unclaimed settle), `17584-17591` (`.catch` → `unmark()` releases all marks including outstanding retries).

Mechanism: a dispatched retry still in flight when a LATER chain step throws (palette mint / compile / prepare legs) → `.catch` → `unmark()` releases its mint → the retry's late settle `.then` decrements `coveredMap` a second time for the same mint → row undercount → premature re-warm next dwell. Direction is over-warm only — but this is the one real double-release site post-chain. (Confirmed for the prompt's netting question: FIRST-strike `pendingAttachments` kicks attach NO `.then` — `unmarkEnemy` is their single release; a late `'completed'` after unmark is a benign warmed-but-uncovered duplicate. No double-release exists for first strikes.)

Fix sketch: flag each retry mint as released inside `unmark`'s accounting (or route the `.then` through the same `unmark`-style helper) so a late settle can't decrement twice. Effort: **S–M**. Impact: **L**. Risk: low.

### 8. `warmEncounterPendingDecode` drops entitySpec ship records — runtime-authored encounter casts never warm

Evidence: `src/render/renderer.js:3999-4009` (collector pushes records only when `ship.archetype` is a non-empty string — `item.ships` AND `item.warmShips` alike), `3937-3940` (`warmEnemyRosterDecode`'s entitySpec escape-hatch resolves them — unreachable from this lane), `src/systems/eighthBellRuntime.js:167-173` (the Eighth Bell's chapel-barge mounts via `{entitySpec: makeShipEntitySpec('ship_atlas', ...)}` written inside `fire()`), `src/systems/e1EncounterRuntime.js:483-507` (mirror echo via entitySpec), `src/systems/encounterDirector.js:3457-3475` (`warmShips` exists precisely for hulls mounted outside `plan.ships`).

Mechanism: the pending-warm plumbing can already express hulls-outside-plan (`warmShips`) and the roster decode can already resolve entitySpec records — but the collector's archetype gate drops any record without a string `.archetype` before either path can see it. Encounters whose cast is runtime-assigned (the atlas barge — a large authored hull that decodes at fire inside the reveal) have no route into the deadline-class warm. Narrow today: few encounters ride this shape, and the Eighth Bell is also a proximity trigger (no paced pending window), but the plumbing gap is real and the fix unblocks `warmShips` declarations for runtime casts.

Fix sketch: in the collector, also push records carrying `ship.entitySpec` (same acceptance for `warmShips`); the downstream escape-hatch resolves `spec.data.defId || spec.shipId` already. Effort: **S**. Impact: **L–M**. Risk: low.

### 9. Wave-hull runway caps at 4 keys per `run:wavePlanned` — boss/mutator waves can exceed it

Evidence: `src/render/renderer.js:4914-4940` (`started < 4` cap in `kickWaveHullDecodeAssets`), `src/world/presentationSources.js:727-742` (`collectWaveHullDecodeKeys` unions schedule + packages + swarm.roster), `src/systems/survivalWavePlanner.js:552-557` (roster entries carry no faction/role → keys dedupe on `shipId|silhouette` only).

Mechanism: a boss wave's roster keys (up to 4 hull families) plus a boss package key (leviathan/saucer) can produce 5–6 unique `shipId|silhouette` keys — the tail never gets the planned decode and pays it at first in-round spawn. Mostly shielded: eligible-id exemplar warms decode the same files for swarm ids, so the miss bites only where F1/F4 leave archetypes outside the warm — compounding, not independent.

Fix sketch: raise the cap to the observed roster max, or drain the tail across frames (the kicks are already promise-deferred). Effort: **S**. Impact: **L**. Risk: low.

### 10. Deferred retry mints a `null` coveredMap key for enemyId-less hulk kicks

Evidence: `src/render/renderer.js:17482-17484` (`hulkEnemyId` can be `null` — `spec.data.hulkVisual.lootTableId` absent), `17379-17380` (unconditional `coveredMap.set(enemyId, …)`), launch lane guards `enemyId != null` at `16897`.

Mechanism: a `null` key lands in `coveredMap`/`retryMintCounts`/`retryReleasedCounts` and `unmarkEnemy(null)` nets `mine ≥ count` without clearing — bounded dead-key garbage (one entry), no filter effect since real ids are strings.

Fix sketch: guard the mint with `enemyId != null`, same as the launch lane. Effort: **S**. Impact: **L** (hygiene). Risk: none.

## Regression notes on landed waves

- **W74 `releaseClaim` split (`16869-16880`)**: verified — claims decrement unconditionally on every re-kick settle, covered only on unclaimed (`keepCovered` semantics). Mint/release balanced in the launch lane: one mint per re-kick (`16900-16902`), exactly one `.then` release per dispatched re-kick, `entry.reKicked` prevents re-dispatch, non-promise/throw legs release inline (`16905-16912`). The imbalances found are confined to the DEFERRED lane (F1) and the live-map read (F6).
- **W74 `WARM_BUILDING_SETTLE_DEADLINE_MS` (`6083`, `_armCrucibleWarmBuildingSettle` `16799-16822`)**: race re-arms on `pendingAttachments` growth and clears `warm.building` + `root.userData.warmBuilding` on expiry — the wedge it targets is real and closed. Side effect verified for the prompt: the deferred chain can now complete with retries outstanding → the reachability half of F1.
- **Deferred double-release audit (prompt item b)**: first-strike `pendingAttachments` kicks attach no settle `.then` — the outcomes-loop `unmarkEnemy` (`17535-17547`) is their single release; a late `'completed'` after unmark is warmed-but-uncovered → benign duplicate re-warm at next dwell. Confirmed no second release site for first strikes. Retry kicks DO carry a `.then` release (`17382-17391`) — double-release exists only in the unmark-first ordering (F7).
- **Deferred settle on timeout**: `releasedRetries` is gated on `!timedOut` (`17542`) — timed-out rows release coverage and are NOT re-kicked, exactly as intended ("two strikes is the next dwell's signal"). The blind spot is that timed-out rows also include already-`'completed'` settles (F5).
- **W71 `swarmWarmOutcomeClaims` (`6062-6074`)**: the claimed set + prefixes are right for every status the job lane resolves — `'stalled-slot-released'`, `'awaiting-authored-admission'`, `'fallback-after-error'`, `'cancelled-*'`, `'deferred-arena-dressing'`, `'regrade-evict-cooloff'`, `'no-authored-upgrade'`, `'unavailable'` (correctly absent per W72) all release → retriable. The only collision is `'authored-upgrade-request-threw'` (F2) — a W71-minted wrapper status the W70 prefix couldn't anticipate.
- **`swarmDeferredWarm` record guard (`17602-17605`)**: `record.wave === nextWave` prevents a stale chain from clearing a newer wave's `pending` flag ✓. `crucibleDraft` "Keep current loadout" (`ui/screens/crucibleDraft.js:761-789`) holds up to 10 s on `warm.promise`; the draft resolves only via the skip-button `resolvePick(null)` path (`src/systems/survivalDraft.js:745-799`) — purchases/demo emitters cannot resolve the wave early, so the hold covers the only early-resolve action ✓.
- **`_discardEarlyCrucibleWarm` (`16758-16790`)**: decrements `_swarmWarmCoveredEnemyIds` for `warm.coveredEnemyIds` minus `failedCoverageMarks` but does not sweep `_swarmWarmReKickClaims` — a discarded warm with an in-flight re-kick leaves `claims(E)=1` stale → the deferred filter keeps that row fresh-eligible → over-warm direction only, self-heals on the late settle's `releaseClaim`. Bounded and benign — noted, not reported as a finding.
- **W67 popin items**: `restoreObjectHome` stamps `matrixWorldNeedsUpdate` unconditionally (`5191`, incl. detached-orphan restore `5192-5194`) ✓; `_applyFrameOriginRebase` updates `m.updateMatrix()` on frozen roots (`19419-19445`) ✓.
- **W67/W69 paced-ledger popin-adjacent slicers**: `drainDeferredEnterSlice` keeps the `steps === 0` min-1 (`src/core/sectorEnterDefer.js:152-154`) and debits `notePacedFrameSpend` post-step (`189`) ✓ — note its dead-epoch sweep (`138-145`) runs before `startedAt` is minted, so `iterator.return()` calls there are ledger-free (bounded by queue size, minor). `drainDespawnDisposeQueue`'s entry gate defers wholesale on spent frames but keeps entries (returns 0, queue survives) and the 2-skip aging cap bounds starvation (`1808-1845`) ✓; the `m.parent == null` remount guard holds ✓.
- **Seam drains**: foreign-head peeks (`1900-1906`, `1961-1965`, `1997-2005`) keep a live-epoch FIFO head from minting extensions or paying a full queue walk under a stale hold epoch ✓.
- **Deferred FIFO epoch binding**: `deferSectorEnterMaterialization` binds epochless payloads to `world.enterSerial` with (provider, epoch) dedupe (`sectorEnterDefer.js` ~`224-228`); dead-epoch entries drop + `iterator.return()` in both drains ✓.
- **Scripted-encounter warm coverage**: `warmEncounterPendingDecode` plus the ~15 polled deadline lanes (reinforcements, claim-defense, ace-return, culture-intro, planet-challenge, bounty, unique-wreck, depot watch/patrol, ecology scavenger, pursuit, law incident, capital wing, wanted tier, gate wing, station patrol) cover paced spawns broadly; `swarmElites` reuses covered archetypes (`wasp_swarmer` splitter); entitySpec-shaped casts are the residual gap (F8).
- **`swarmEligibleEnemyIds` (`src/data/swarmMode.js:606`)**: cumulative roster + wave-keyed boss packages — monotone across waves, so a released row stays re-warmable; the mutator desync is the only eligibility gap found (F4).
- **Golden hash / determinism**: audit is read-only; nothing here perturbs the verified `892f88c9` baseline.
