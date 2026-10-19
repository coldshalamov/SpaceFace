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

| R-31061613 | 3106161378 | SWP-SG02: retained-contact revision allowlist | Verify the allowlist donates only revision-invariant scalar fields — no geometry-sensitive field transfers — and adoptWorldSnapshot still requires v4 so pre-v4 solver bytes can never be adopted. | OPEN |
| R-2583cb15 | 2583cb15f9 | SWP-PERSIST: stale-generation concede + capture-plan order | Verify the three-way rollback classification can never restore over a valid foreign generation, and that concede-on-drift re-reads the live primary before every destructive act. | OPEN |
| R-75faa86 | 75faa86dd35 | D213: M11 swarm river dodge holds spacing through the repulsor shove | When a ballistic body is tracked but not yet inside its closing-scaled floor while a steered mate IS inside its own floor, the mate lane must still fire the dodge (dodgeActive fallback) — the two-lane split must not mute the one-hop propagation the river relies on; and confirm plan.dodge stays false for ordinary members so the 2.6 channel-gain saturation cannot leak into formation flight | OPEN |
| R-41c77d3 | 41c77d31307 | C4 L-LONGGAME rank-gated contracts | Verify rep-0 Neutral (step-1) pilots seeing the row matches FB-044 pacing intent — a not-hostile board row vs a mid-ladder reward — and that deskless outposts never show it. | OPEN |
| R-7e0672a | 7e0672aabc4 | SWP-CONTROLS reserved interface keys + stopPropagation | Verify INTERFACE_KEY_OWNERS completeness against the input.js flight switch — contextual KeyE/KeyU/KeyB/Enter deliberately excluded; and no document/window listener needed those keys downstream in flight. | OPEN |
| R-4f81681d | 4f81681dfd | SWP-START death/continue softlocks | Verify no legal flow needs a screen beneath gameOver to survive respawn (closeAll drains the whole stack), and no confirm legitimately survives death/exitToMenu. | OPEN |
| R-177bc67 | 177bc67fe41 | SWP-AUDIO deliberate/quiet gates + double-voice dedup | Verify the [0,4]-tick break-spoke window cannot suppress a tether:broke crack whose own tether:broken never played (attachments.cut fail path within 4 ticks of an unrelated snap). | OPEN |
| R-c4075918 | c4075918a6 | C2 L-HAND reelDelta tape projection | Verify massline-group precedence is preserved and copyInput populates data.actions.reelDelta via ACTION_KEYS; inputTape.js writes it back on replay. | OPEN |
