# Wave 138 — popin-admission audit report

Audit lane: W138 popin-admission. Branch audited: `devin/1791504143-perf-w120` @ `e982b5a96`
("docs(perf): wave 136 log + scoreboard — popin 0/3, boot 0/3, global B1 unowned").
Method: code-level read of the full admission/decode/arm surface — the frame-serial authored-upgrade
lane (`partsLibrary.js` 6500–8559), the decode-class budget (`decodeTaskBudget.js`), every
decode-posting site reachable from `loadAuthoredPart`, the package-side re-grade
(`renderPackageLoader.js`), the predictor + warm/arm machinery (`sectorPredict.js`,
`renderer.js` 5216–7000 + residency-poll steps), the stall-abort machinery, and the save-side
regression shapes — plus a live re-run of the W136 probe suite
(`test/asset-residency-sector-claims.test.mjs`, node 24 with real `three`): **6/6 pass**.

`saturated: true` — no unaddressed, MATERIAL, evidence-supported optimization remains in this lane's
scope at `e982b5a96`. One low-impact latent finding and a set of verified non-gaps below.

Evidence labels per claim: VERIFIED / MECHANISM_VERIFIED / UNVERIFIED / REVIEW_REQUIRED.
W137 popin F-1/F-2/F-3 (`sectorClaimStamp` arm-branch live-claim revoke, `request.commit()`
same-owner same-key union, merge-path provenance) are present in code at this ref and EXCLUDED
per dispatch (parent fix in flight).

---

## 1. Findings

### F-1 — `msg.spacefaceDecodeClass` is a dead read in the KTX2 post path (MECHANISM_VERIFIED, impact L)

- `src/render/assetLoader.js:421` — the KTX2 transcode pool wraps `postMessage` so each task's
  budget acquire uses `decodeClass: msg && msg.spacefaceDecodeClass || activeDecodeClass()`.
  `spacefaceDecodeClass` is **written nowhere** in the tree (`grep -rn "spacefaceDecodeClass" src/`
  returns only this read), so every post falls through to `activeDecodeClass()` — which is correct
  today because the field is consulted at post time on the calling thread.
- Mechanism/cost: no live mislabel — KTX2 transcodes ride inside the GLTF parse worker task and
  `activeDecodeClass()` stamps the right class. The hazard is a latent mislabel channel: any future
  producer that stamps the field smuggles a class frozen at enqueue onto a pooled worker post that
  outlives the caller's class scope, silently overriding `activeDecodeClass()` (a deadline task
  drained as ambient, or ambient spec work stamped visible — the two directions the budget exists
  to prevent).
- Fix sketch: delete the `msg.spacefaceDecodeClass ||` half of the read (keep `activeDecodeClass()`),
  or — if a cross-thread class is genuinely wanted — stamp it at the same post sites that call
  `activeDecodeClass()` so the two can never disagree.
- Effort: S. Impact: L. Risk: none (dead code removal) / low (if wired, must prove sites agree).

No other material finding. The five scopes below record what was audited and why it holds.

---

## 2. Scope verification — admission pacing (scope 1) — VERIFIED, no gap

Question: can the frame-serial lane (one `admitNextUpgradeJob` per rAF, `inFlight` cap 1 steady /
2 opening) drain slowly enough that the player sees the gap, e.g. sector enter with N pending
upgrades at cap-1? Verdict: the drain is already parallelized at every point where parallelism
is free; the remaining serialization is the point of the design.

- **Decode parallelism is preserved across the serial lane.** `kickSpawnedEntityDecode`
  (`renderer.js:5587`) posts every cohort member's `preloadAuthoredAssetsForEntity` at tick zero
  (deduped through `_decodeRunwayPrefetchIds`); admission joins the already-running decode via
  `joinedPendingTask`/`deadlineJoin` (`assetLoader.js:662-666`, `:806-833`). The serial slot gates
  compose+staging, not decode — decode work for the whole cohort overlaps in worker lanes even at
  `inFlight === 1`.
- **Early release at pipeline staging is glass-aware.** `onAuthoredPipelineStaged` releases the
  serial slot when any queued job is on readable glass OR runway-inbound
  (`partsLibrary.js:7910-7919`), so a queued on-glass body only waits for the holder's
  decode→staging head, not its whole upload-drain tail. The unconditional
  `overlapAuthoredPipelineCompile` branch (`:7896-7900`) covers the non-flight path;
  `retainGpuOwnershipUntilSettled` jobs (appearance admission, `renderer.js:25930`) deliberately
  hold through settle.
- **The frame budget is the pacing law, not the cap.** `forcedFrameSpend() < FORCED_FRAME_BUDGET_MS`
  (8 ms, `decodeTaskBudget.js`) gates each admit (`partsLibrary.js:7744-7766`); the queued
  glass-stall bypass (`AUTHORED_UPGRADE_GLASS_STALL_BYPASS_MS=30000`) breaks the budget law only
  for a job that has waited >30 s — an intentional ordering between hitch and gap.
- **Raising inFlight would not shrink wall-time-to-shown.** Compose/stage is main-thread Three.js
  work conserved per body; the 8 ms/frame gate already time-slices it, and the sort
  (`:7771-7802`) already picks the next compose by player-visible urgency. Extra in-flight slots
  would only reorder the same conserved work — and a queued glass body's own decode already runs
  concurrently, so the marginal gain is ~zero while re-introducing two-composes-per-frame hitching
  on soft GPUs (the documented reason the lane is serial — A/B recorded at `scheduleUpgradeFrame`,
  `:7613-7640`).
- Sector enter with N pending upgrades: residency prewarm + census + spawn-request/intervention
  warms mean most bodies arrive decoded; the serial drain then reveals staggered at ~one
  compose+stage each — a progressive real-model reveal ordered by the rung sort, not a frozen gap.
  `pumpAuthoredUpgradeQueue` (`:8465`) additionally drains the queue inside the loading shell.

## 3. Scope verification — decode class discipline (scope 2) — VERIFIED, no mislabels

Census of every post site reachable from `loadAuthoredPart` (`assetLoader.js:619-870`,
`renderPackageLoader.js:247-506,1253`) and the renderer warm/kick lanes (`renderer.js`
5216–6595). Classes are picked by `activeDecodeClass()` at post time — the depth flags
(`withDeadlineDecodeClass`/`withVisibleDecodeClass`) are the only authority, and they are
correctly set at every site:

- **visible** — only where the post is genuinely post-on-stage: `admissionVisible: true` from
  `kickAuthoredBoundaryUpgrade` (on readable glass or inside `TABLE_BUILD_URGENT_SECONDS`,
  `renderer.js:5216-5247`), the runway kick's `decodeSeconds <= TABLE_BUILD_URGENT_SECONDS`
  arm (`:5249+`), the spawn kick's `tGlass <= TABLE_BUILD_URGENT_SECONDS` arm (`:5602-5609`),
  the on-glass deferred re-kick (`:4272-4289`), and the packaged lane's `admissionVisible`
  forwarding — verified end-to-end including the dedupe-join path that re-grades an in-flight
  post via a fresh `loadAuthoredPart` call (`renderer.js:5549-5564`).
- **deadline** — every arm/runway/prepared-sector post: `sector-prewarm`, `sector-prepared`,
  `sector-prepared-boundary`, `sector-prepared-live-boundary`, `save-envelope-decode-runway`,
  `combat-spawn-decode-runway`, `wave-hull-decode-runway`, `packaged-decode-runway`, and all
  encounter roles ending in `-decode-runway` (nemesis, encounter-pending, reinforcement ×2,
  law-incident, capital-wing, gate-wing, culture-intro, planet-challenge, unique-wreck,
  depot-patrol, lane-ambush, bounty-staged, spawn-request, intervention).
- **ambient** — only genuinely speculative posts: `sector-predicted`, `crucible-roster-warm`,
  `wanted-tier-warm-pool`, `ecology-scavenger-warm-pool`, `survival-roster-prewarm`,
  `intervention-warm:modular`, `warm-previous-sector`. Each has an in-code comment justifying
  ambient (closed speculation pools; the `entity:spawned` kick covers the actual mint).
- **`promote()` tail-promotion** (`decodeTaskBudget.js:208-212`) promotes the whole queued waiter
  tail — deliberate (comment: "matching the global-flag idiom"), not per-task; verified it cannot
  leak visible class across an ambient waiter because promotion re-grades the lane, not the
  task's stamped class.
- **KTX2 transcodes** — inside the GLTF parse worker task; the pool post goes through
  `decodeBudget.acquire` with `activeDecodeClass()` (see F-1 for the dead `spacefaceDecodeClass`
  read, the only blemish).
- `fleetLook.js:195` (preview tool, ambient) — correct; not player-facing.

## 4. Scope verification — boundary/corridor arms (scope 3) — VERIFIED, coverage complete

`predictNextSector` (`sectorPredict.js`) is a 6-leg predictor: route-executor → autopilot-gate →
waypoint-sector → route-plotted → kinematic gate approach (30 s arm / 120 s hold,
260 WU capture, gates-bucket scan) → corridor border-approach (Voronoi flip-depth arm mirroring
`world.js` membership thresholds, corridor-only). Consumed by `updatePredictedSectorPrewarmSteps`
(`renderer.js:6877+`) — a fully stepped generator (predict → spawn-request warm → intervention
warm → corridor-eviction sync, one step each inside the residency-poll slice clock).

- **Re-arm coverage.** Held-sector hysteresis (`PREDICT_GATE_HOLD_SECONDS=120`,
  `PREDICT_GATE_HOLD_RADIUS_FACTOR=4`) keeps an armed warm across autopilot braking and gate-dock
  lingering; a real arm toward a different gate/border outranks the `ttcSeconds: Infinity`
  proximity hold (`:162-168,181`), so reversal invalidates exactly when a competing arm exists.
  Retraction releases the arm's residency owner but `setEvictionCorridor` keeps the bytes under
  corridor protection ("a retracted arm just narrows the corridor") — flip-flop at a Voronoi
  bisector cannot thrash decode. Non-corridor sectors have no free-flight border (leg 6 skipped
  by `isCorridorSector`) and are reachable only via gates → legs 1–5 cover them. The
  `jump:chargeAbort` handler releases `_incomingSectorPrewarm` on abort (`:19327-19330`).
- **Invalidation on mid-approach reversal.** Gate despawned/`alive === false` skipped (`:153`);
  waypoint/autopilot cleared falls through to kinematic legs; a held arm that no longer matches
  the prediction is released (`:6919-6925`); authored records absorbing the sector release the
  speculative warm as redundant (`:6914-6918`).
- **Triggers outside the corridor model.** Every authored encounter mint has a named warm arm or
  the spawn-kick floor: `queuedSpawnRequestRoster` (`warmQueuedSpawnRequestDecodes`),
  `pendingInterventions` wreck/modular cohort (`warmPendingInterventionDecodes` — re-posts each
  poll, no seen-latch, for both the prediction and `predictedSecondHopSectorId`), and ~18
  encounter arms (nemesis-announce, encounter-pending, reinforcement, combat-reinforcement,
  law-incident, capital-wing, gate-wing, culture-intro, planet-challenge, unique-wreck,
  bounty-staged, depot-patrol, lane-ambush, claim-defense, ecology-scavenger, wanted-tier,
  crucible, survival-roster). Anything an arm misses (alienEcology juvenile/cutter spawns,
  aftermath shards, unannounced combat mints) lands on the `entity:spawned` kick
  (`kickSpawnedEntityDecode`), which posts at tick zero with the poll's own runway eligibility —
  deadline or visible by `tGlass`. Kill-hulk files warm on spawn via `warmKillHulkDecode`.
- Second-hop gets spawn-request + intervention roster warms but not the full census warm —
  deliberate speculation bound (a 2-corridor-away kinematic inference does not justify a census);
  route-deep warm (`updateRouteDeepSectorWarm`) covers declared multi-leg routes.

## 5. Scope verification — readmission/stall-abort (scope 4) — VERIFIED, no unaborted wedge

- `armStalledHogWake` (`partsLibrary.js:6686`) polls every 5 s while any in-flight job is
  unreleased OR uncommitted — the released-but-uncommitted class is inside the abort domain via
  `serialSlotReleased !== true || diagnostic.endedAtMs == null || !authoredCommittedBoundaryStatus`
  (`:6693-6697`), closing the "slot freed, settle wedged" hole.
- `abortStalledOrInactiveUpgradeJobs` (`:6724`) aborts on owner-inactivity or the stall bound
  (30 s glass / 120 s non-ship via `AUTHORED_ASYNC_DEADLINE_MS`);
  `abortStalledUpgradeJob` (`:6760`) drops wedged decode tasks (`dropWedgedAuthoredTasks`,
  `assetLoader.js:1108`), caps at `AUTHORED_UPGRADE_STALL_ABORT_LIMIT=3` → 'unavailable',
  otherwise `markAuthoredBoundaryForReadmission` so the relevance poll re-requests at the natural
  rung; url::slot decode dedupe makes re-entry share the wedged attempt's partial decode
  (`:6719-6723` comment, verified vs `deadlineJoin` dedupe).
- **Admitted-set consistency on abort/cancel**: `cancelQueuedJob` epoch-guards
  `releaseBoundaryResidency`/`releaseOwnerInstances` (`:7599-7607`) — a cancel landing after a
  boundary re-admitted cannot free the replacement epoch's retains. `cleanupQueuedJob`
  (`:7591-7594`) removes `byBoundary`/`byKey` only when the entry is still this job.
- Decode-lane wedges: `createAsyncAdmission` timers (default 120 s) bound every posted task;
  aborted waiters are ejected by the budget's `returnToken` (`decodeTaskBudget.js:154-163`).

## 6. Scope verification — presented-side residue (scope 5) — VERIFIED, bounded

- `diagnostics.jobs` capped at 128 (`partsLibrary.js:8266-8267`); `upgradeTokensByBoundary` is a
  `WeakMap` (`:259`); `_decodeRunwayPrefetchIds`/`_decodeRunwayPackagedFiles` sets delete on settle
  (verified at `renderer.js:5615-5617,5566-5574`); `pickVerdicts` memo is per-admit-call
  (`:7736-7742`); `stallAbortCount` is per-boundary, bounded, and part of the design (cap →
  'unavailable').
- Dead stand-in/admitted-but-never-shown rows: cancelled/aborted jobs clear `byBoundary`/`byKey`,
  release residency epoch-guarded, and settle the completion once
  (`settleUpgradeJob` `completionSettled` guard). No unbounded per-frame cost found growing with
  session history.

## 7. Regression notes

- **W136 probe re-run** (`test/asset-residency-sector-claims.test.mjs`, node 24, at `e982b5a96`):
  **6/6 pass** — arm-claim lapse at horizon on all four exit-warm mint sites, lapse gating on
  rotateSector + rotateSectorDeferred + deferred sweep, same-sid re-post member prune, posting-class
  lapse-ability, born-lapsed clamp.
- **W136 machinery re-verified present**: `claimArmClass` heuristic + `decodeWarm:true`
  (`assetResidency.js:842`), `sectorClaimStamp` (`:847`), union stamps (`:927/:941`),
  `reclaimWarm` stamps (`~:534/:539`), retain-merge `postArmClass` (`:409-412`). (F-1/F-2/F-3
  defects within this machinery confirmed present and excluded per dispatch.)
- **Save-side shapes present**: deferred-consume gen guard (`saveSystem.js:4913-4919` —
  `(specHit || specByteHit) && spec.sig !== 'gen:'+_saveStoreGeneration` → re-prepare; the
  excluded specByteHit-discard defect stands at this ref), `_pendingSlotRearm` coalescing
  (`:394-404` — one deferred re-arm, gen-tagged raw, timer-coalesced), `peek_card_data` worker op
  (`:5041`, 2.5 s timeout; handler at `saveWorker.js:344/:814`).

## 8. Hardware-unverified (SwiftShader/CI box — CPU-side evidence only)

- Wall-time of the serial drain on a real GPU/driver (compose+stage cost per body, upload-drain
  tail): mechanism says the drain is bounded by conserved main-thread work under the 8 ms/frame
  forced-spend gate; whether a fat-sector enter lands inside the visible window needs owner-hardware
  verification (scoreboard B1 caveat applies).
- KTX2 transcode cost inside GLTF parse tasks on real hardware — the class stamping is verified
  correct, not the cost.

---

## Verdict

`saturated: true`. The lane's surface — admission pacing, class discipline, arm coverage,
stall-abort, presented-side residue — is verified to hold the magic-frame law at `e982b5a96`
excluding the parent's in-flight W137 fixes. One latent low-impact finding (F-1 dead
`spacefaceDecodeClass` read) is worth a cleanup but does not block saturation.
