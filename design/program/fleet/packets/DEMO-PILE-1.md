# DEMO-PILE-1 — read the old uncommitted edits the owner's game is running (READ-ONLY)

**For:** GLM (text only). **Kind:** investigation. **Do not edit or commit any tracked file.** Write
findings only to your receipt.

## Why

The owner launches the game from this working tree, so every uncommitted edit is live in what he
plays. About 157 files carry uncommitted edits left by agents of EARLIER sessions (modified before
2026-11-23 03:40), many of them cut off by usage limits mid-change. Some are probably finished good
work that was never committed; some may be half-done and break the game. The list with
modification times is `.devshots/director/demo/gates/pile-by-mtime.txt` (unix time, path); the full
diff against HEAD is `.devshots/director/demo/gates/tree-at-gate-1.diff`.

## Do

Read the diff (`git diff -- <file>`) of every OLDER uncommitted file under `src/core/`,
`src/systems/`, `src/combat/`, `src/save/`, `src/sim/`, `src/ai/` (modified before 2026-11-23 03:40;
there are roughly 40). For each file decide, with evidence:

- **complete**: the change is coherent and finished (every new function is called, every caller of a
  changed signature is updated, no TODO/placeholder, no leftover debug log, tests that cover it exist
  in `test/` — check whether an untracked test file matches it, e.g. `test/sg02-*.test.mjs`,
  `test/spawn-budget-mint.test.mjs`, `test/core-deferred-spawn.test.mjs`, `test/entity-*-batch.test.mjs`).
  Run those focused tests (`node --test <file>`) and report pass/fail.
- **half-done**: something references a function/field that does not exist, a branch is stubbed, a
  caller was changed but not its callee (or the reverse), or the focused tests fail because of it.
- **risky**: complete but touches determinism (Math.random/Date.now in sim code), save shape
  without a migration, or the worker protocol (`src/core/mainToSimEventSurface.js` /
  `scripts/lib/simWorkerHost.mjs` / `scripts/lib/simReadModel.mjs`) without both sides updated.

Group files that belong to one change (same timestamp minute, same feature name in comments, e.g.
"SG02", "CONTROLLER-1", "SPAWN-BUDGET") and judge the change as a whole.

Also run `npm run check:sim` once and report its result (it replays a recorded flight; a moved
hash means some uncommitted sim edit changed behaviour).

## Do NOT
Edit, stage, commit, stash, reset or restore anything. Do not boot the game.

## Receipt
Protocol headings, then a table: change name | files | verdict (complete / half-done / risky) |
evidence (file:line) | focused tests result | recommendation (commit as is / finish: what is
missing / back out). Put the five most dangerous for the player at the top.
