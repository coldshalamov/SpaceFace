# DEMO-SMALLFIX-1 — two real bugs the interface test triage found

**For:** a builder agent (code). **Kind:** fix + keep the existing tests green. Commit your own files.

Read `.devshots/fleet/runs/DEMO-TESTHEALTH-3.grok.2026-11-23T23-14-32/RECEIPT.md`, class (b). Fix:
1. Clearing the star-chart search leaves the station list open, and Enter can then plot the nearest
   station. Clearing the search must close the list and Enter must do nothing until a result is
   picked again. The failing test named in the receipt must pass.
2. Debris spawned inside a rock never picks up contact heat, so that impact does not flare. Find
   why (the receipt names the test and the code) and fix it so the flare shows; the failing test
   must pass. If this is in deterministic sim code, `npm run check:sim` must stay green (report if
   the golden moves; never re-record it).
Run the focused tests of every file you touch.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Plain-English commit messages.

## Receipt
Protocol headings; per bug the cause (file:line) and fix (commit); tests.
