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
| R-183df8f | 183df8f983ac9f36dd4d4164f0a9b022237ec848 | Asteroid appear latency: urgent pool-bucket admission, variant-aware unready verdicts, blinkless pool handoff | Re-run `node scripts/probe-asteroid-appear.mjs` and confirm the common-rock live late p95 stays under ~400 ms with no multi-frame blink families, and that no draw-time synchronous shader link was introduced (the guard must still refuse + admit, never compile inside the presented pass) | OPEN |
| R-0df2ec6 | 0df2ec6bca1 | Asteroid load timing wave 2: pool adopt rekick, verified admission urgency, probe why-late diagnostics | The rekick fires only for later adoptions into a still-pending bucket (never the creating registration) and never stacks admissions (joinOutstanding); confirm via `test/asteroid-pool-admission.test.mjs` plus one probe run whose `blinkCounts` shows no new multi-frame family | OPEN |
