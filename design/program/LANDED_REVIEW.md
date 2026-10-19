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
| R-ca0d710 | ca0d7104a8664d3b8f46952e816137e1e7e98e4e | D235 deferred tether echo | OPEN | Verify no consumer needed same-dispatch tether:broke/released/releaseRated — all listeners now get it on the first update after break (max 1 tick late), incl dead/docked ticks. |
| R-be594dc | be594dcd08df5adfeb45c8e23f4065e2a4c8bc3a | INF-13 the blank page | OPEN | Verify scan-as-offense: a pulse covering the passive ghost settles read/broke_terms via runtime.event(scanPulse) while a short radius writes nothing; and no outcome emits news:publish. |
| R-8764f824a2 | 2c3b9f33aac | INF-14 swarm star asks | OPEN | Verify chain-star-banked zones name the spotless ask not a chain (stars=2 bestChain>=target), and never-entered zones show no ask. |
| R-4065252 | 40652524541 | SWP-SPAWN claim release + welldrag cleanup | OPEN | Verify _onEntityDestroyed releasing source-ledger claims on hard exit is correct vs intended persist-across-leave design; virtualize skip is the boundary. |
| R-8764f824 | 8764f824186 | SWP-COMM comms lifecycle | OPEN | Verify clearing _contactHailHeaveTo on sector:enter cannot refuse a legitimate continuous hail across the boundary (offer availability-poll at 5Hz is the safety) and that gone-squad resolution cannot fire spuriously while a member is temporarily invisible (membersFor = exists+alive). |
| R-cc46e17 | cc46e17abcf8e4691a80d69c02aca21d1e45e4af | §1.8 demo sweep: save, input, and trade recovery | Continue rechecks the primary and recovery bytes after async validation before choosing a restore source | CLOSED 2026-10-18 (row deleted by review commit): SMALL-MISS-FIXED — `raw = freshRaw` after generation-bump re-prepare; regression test added |

| R-6935dcc7 | 6935dcc740 | SWP-NAV fuel-refund exploit + route revalidation | Verify legsMatchRoute uses the same identity semantics as restoredRouteIssue and that no lawful path needs abort to refund (tow/combat-lock aborts included). | OPEN |
| R-558e3355 | 558e3355e8 | SWP-DOCK delivered-units settle + undock gap latch | Verify _settleUndelivered pro-rata rounding cannot over-release note debt when cost+debtCr coexist; and _departedLatch cannot strand a same-station re-dock in the production 400ms fade order. | OPEN |
| R-5420e6d2 | 5420e6d213 | SWP-ECON quote-provenance admission | Verify bestKnownBuy/bestKnownMarginLane agree on the same admission set and unknown tags still drop the row. | OPEN |
