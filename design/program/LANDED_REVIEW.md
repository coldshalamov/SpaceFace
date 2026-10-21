# Landed review

Second look at work that is already on `origin/master`. The author commits and pushes first. A later agent reviews. The review does not hold the push, and this file is not a second plan.

Owner ruling, 2026-10-18. The rule agents follow is root `AGENTS.md` §3.

## How a row gets here

You finished a unit from [`build_map.md`](../../build_map.md) or from `node scripts/program-dispatch.mjs --next`. In the same sitting you commit the exact paths and push `origin master` by name. You add one row to the table below, in that same push. Then you stop. You do not review your own row in that sitting.

One row per finished unit. The id is `R-` plus the first 7 characters of the commit, so commit `3fc7ece5c59` files `R-3fc7ece`. Name the task and the one claim a second agent should re-check. Cells must not contain `|`.

Closing a review does not add a row. A change-loop leg does not add a row. A merge commit does not add a row.

## How the next agent takes it

The oldest OPEN row is the next second look.

- A player-facing demo defect still comes first, then a stale `NOW.md` row, then this list, then new feature work.
- When this table has eight or more OPEN rows, the oldest one jumps ahead of everything, including defects. Clear one. That cap keeps this list from becoming a backlog.
- Read the named commit. Confirm the claim. A small miss: fix it, commit the exact paths, and push `origin master`. A player-facing break you cannot finish in this sitting: one row on the demo defect ledger.
- Delete the row in the commit that finishes the look. Do not mark it done and leave it. Do not file a review of the review.

## Open reviews

| Id | Commit | Task | What to re-check | Status |
|---|---|---|---|---|
| R-cc46e17 | cc46e17abcf8e4691a80d69c02aca21d1e45e4af | §1.8 demo sweep: save, input, and trade recovery | Continue rechecks the primary and recovery bytes after async validation before choosing a restore source | CLOSED 2026-10-18 (row deleted by review commit): SMALL-MISS-FIXED — `raw = freshRaw` after generation-bump re-prepare; regression test added |
| R-8521e56 | 8521e565bd9 | Asteroid load timing wave 3: pending-bucket leaf fallback + glass-cadence swept discovery | Re-check that drawPendingBucketLeaves is only reached while bucket.mesh is pipelinesPending with no retiring bridge (a settled or bridged bucket must submit normally — no leaf can stay visible-borrowed past the latch), and that the idle-path discovery call mints a fresh makeHoldExemptScanContext per frame rather than serving stale camera terms | CLOSED 2026-10-19 (row deleted by wave-5 review commit): VERIFIED — leaf fallback correctly gated on !bucket.retiring && pipelinesPending; settled buckets submit normally; idle glass path mints a fresh scan context per call |
| R-fe82e52 | fe82e52a981 | siege-ark bind stamps boss home sector on live entity | Re-check that the post-append homeSectorId restamp in lastArgument bind() actually re-keys bySectorId via syncEntitySectorMembership at runtime — the imported symbol resolves (no ReferenceError), e is already indexed when bind runs, and the guard allowlist entry matches the real call | CLOSED 2026-10-19 (row deleted by wave-5 review commit): VERIFIED — syncEntitySectorMembership resolves, e is indexed before bind() restamps homeSectorId, allowlist matches the call site |
| R-c8eec27 | c8eec27a272 | D226 wreck-cathedral LOD1 re-author: collapse-decimated uncovered islands into LOD1 twins | Re-check that every LOD0 material island now has an LOD1 counterpart (no dropped shells at distance), that the added geometry stayed inside the authored surface so the 72m x 58m fly-through channel remains clear, and that the rebuilt release GLB and wreck-cathedral render package pins match the committed bytes | CLOSED 2026-10-19 (row deleted by wave-5 review commit): VERIFIED — all byte/hash pins recomputed clean; fly-through clearance proven by exhaustive ray scan (zero LOD1-only blockers). Wording nit recorded: coverage restored the ~69 shells decimation dropped outright; ~255 micro-islands ≤100 verts remain uncovered as in baseline — additive-only, no regression |
| R-f12a40d | f12a40d72 | Lighting/VFX pass: white field-extent glow, ship headlamps, de-blanketed fields, adopted graphics overhaul | Re-check that attachShipHeadlamps in the ship-aux sync never runs before a ship root has presented real geometry (a bounds-less root latches __sfHeadlamps=false and permanently flies unlit), and that the +7 surface spill band stays within FIELD_SIGNATURES capacity under the env-cloud path that also emits boundary rims | CLOSED 2026-10-19 (row deleted by wave-6 review commit): VERIFIED — bounds-less root falls back to entity.radius*0.62 and attaches (headlamps.js:139-143); only a thrown exception latches false (deliberate per line 130-131). Spill band reuses the boundary signature slot, no FIELD_SIGNATURES growth; capacity pinned by force-language tests |
| R-a09f45f | a09f45fdc0b5f661b78327599ab707e85ed5f516 | survey bearings: re-pin held record + scope waypoint clear to the spent mark | Re-check that a record whose mark fell off the single-slot chart re-pins free (no charge, stored mark restored) and that identifying one cache never clears another sector charted bearing — only the spent record own mark dies | CLOSED 2026-10-19 (row deleted by wave-8 review commit): VERIFIED — free re-pin emits ui:setCourse with openFix.mark before any chargeCredits; identify clears only when bearingCharted matches the spent record own mark; 25/25 + 39/39 focused suites green. Pre-existing residual filed as D238 (signal/artifact/boss identify paths skip clearSurveyFix) |
| R-b7f1bd7 | b7f1bd7ba5de30725e93f8697027bfb8ae6a7c69 | AL-SHOW-6 rumor-chart: corroboration arrows converge on the shared patch | Re-check that frontierRumorCorroborations never emits a target id or any position behind the rings (whitelist holds end-to-end through buildSystemModel/buildLocalModel), that resolved cards dissolve the group, and that the arrows paint on the real chart — not just in the model | CLOSED 2026-10-19 (row deleted by wave-8 review commit): VERIFIED — strict whitelist holds end-to-end (no targetId/targetName/exactPos downstream), groups form/dissolve correctly, painter null-safe; arrows confirmed painting on the real chart-local bench shot. Nit fixed: non-finite radius now rejected in both rumor layer gates |
| R-d906092 | d9060928d51c98c346bf978629e99c9c831277ff | D238: non-dock identify paths spend a sold survey fix | Re-check that the three new clearSurveyFix sites (signal-investigated, landmark-artifact, boss-defeat) only clear when sectorId+poiId match the sold record and only null the waypoint when bearingCharted matches the spent record own mark — a foreign sector's charted bearing must survive every path | OPEN |
| R-9bf40c3 | 9bf40c36617 | Row 456: RC-SWARM-CLEAN aftermath gate + wording | Re-check that a Crucible run that ends always clears run state before Adventure resumes, so the liveSurvivalRun gate never hides a real Adventure aftermath card | OPEN |
| R-d4a7436 | d4a743673d9 | Row 465: RC-MARKET-WHY mover/lane-risk/mechanic/local news | Re-check that the player-trade mover (trade time vs event start) never hides a newer market event on the live market screen | OPEN |
| R-62eba53 | 62eba5336d2 | Row 457: RC-FIRST-MINUTES captioned hook + Hitch + ticker gate | Re-check that the caption reader returns nothing outside live flight, with hints off, after finish, and in sealed Survival, and that the ticker restores retained history on tutorial:finished without a new market event | OPEN |
| R-8d99cfb | 8d99cfb5eea | Row 402: AL-LONG-4 one recipe book + relay receipts + save migration | Re-check that stranded-input collection only ever moves non-recipe ids, that forwarding never exceeds relay free space, and that pre-402 saves keep every stored unit | OPEN |
| R-9b9a5f7 | 9b9a5f78ad6 | Row 391: AL-FIGHT-1 crossfire + grudges + NPC mine delivery | Re-check that _endNpcGrudge restores the original prior retaliation state (not just clears it) and that aiFireIntent's seed pass-through matches the meta.seed the damage admission reads | OPEN |

