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
| R-8521e56 | 8521e565bd9 | Asteroid load timing wave 3: pending-bucket leaf fallback + glass-cadence swept discovery | Re-check that drawPendingBucketLeaves is only reached while bucket.mesh is pipelinesPending with no retiring bridge (a settled or bridged bucket must submit normally — no leaf can stay visible-borrowed past the latch), and that the idle-path discovery call mints a fresh makeHoldExemptScanContext per frame rather than serving stale camera terms | OPEN |
| R-fe82e52 | fe82e52a981 | siege-ark bind stamps boss home sector on live entity | Re-check that the post-append homeSectorId restamp in lastArgument bind() actually re-keys bySectorId via syncEntitySectorMembership at runtime — the imported symbol resolves (no ReferenceError), e is already indexed when bind runs, and the guard allowlist entry matches the real call | OPEN |

