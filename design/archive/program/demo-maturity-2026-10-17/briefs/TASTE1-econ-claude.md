# Task TASTE1 — taste pass over the uncommitted economy-truth wording (ECON-09/10 landing)

You are the taste reviewer for a backend worker's landing. Read `AGENTS.md`, then
`design/frontend/ORRERY.md` for the interface's voice. Do NOT change logic, do NOT restate the
whole diff — judge only what a player reads and feels.

## The uncommitted work (another agent's, still uncommitted)

`git diff -- src/systems/economy.js src/ui/station/screens/market.js src/ui/views/marketPresentation.js src/ui/station/tradeReceipt.js`

Three player-visible behaviors landed:
- ECON-09: a bought-out market row now reads `SOLD OUT` and, with a known estimate,
  `SOLD OUT · Restock ~{seconds}s` (plus a `Restock pending` state).
- ECON-10: selling into a posted shortage adds receipt wording `Shortage premium`,
  `Included in sale price`, and ` · Shortage premium included in sale price`.

## Your job

1. Read the diff and the surrounding receipt/market copy in those files (the existing voice is
   terse, instrument-grade, no exclamation marks — verify against actual neighboring strings).
2. Improve wording ONLY where it fails that bar: wrong register, ambiguous, too chatty, or
   inconsistent with sibling strings. Keep every claim truthful to the data actually shown
   (e.g. only promise a restock estimate when the code has one).
3. Check the states visually if cheap: `node scripts/ui-bench.mjs --shot=<market id>` if the bench
   has the market screen; otherwise read the render path carefully and say what you could not see.
4. Do not touch tests except if a string assertion pins a string you changed (update the pinned
   string to the improved wording, nothing else).

## Hard constraints

No `git` commands that mutate state (no add/commit/stash/checkout/restore/reset). Touch only the
four files above. Foreign-dirty paths are off-limits (the usual list).

## Deliverable

Verdict (SHIP or CHANGED), the exact wording changes you made and why in one sentence each,
and anything you left alone because it was already right.
