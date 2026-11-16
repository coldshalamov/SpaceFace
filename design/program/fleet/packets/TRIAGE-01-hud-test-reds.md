# TRIAGE-01 — Why are so many HUD / Swarm / toast tests red? (triage, fix only stale tests)

Several agents report "pre-existing" failures in the HUD area (examples: `test/objective-edge-arrow.test.mjs`
6 fail with `missionTracker.insertBefore is not a function` since `81df3d83c7`;
`test/hud-objective-plate-cache.test.mjs`; `test/hud-contact-roster-keyed-rows.test.mjs`;
`test/charon-supply-approach.test.mjs`; `massline-acquisition-preview`; mass-words geometry;
`test/crucible-swarm.test.mjs` 2 fail; `test/fb-027-swarm-champion-tricks.test.mjs` wave-35 path). Red tests that
everyone ignores hide real regressions.

## Do this (no game boot)
1. Run, file by file, every test whose name matches `hud|swarm|crucible|toast|massline|objective|radar|throw`
   (`ls test | grep -E ...`). Never the whole suite at once. Record pass/fail per file.
2. For each failing test, find the commit that made it fail: `git log --format='%h %s' -n 15 -- <the source files
   it exercises>`, and if needed check out nothing — instead read `git show <sha> -- <file>` to see what changed.
   Classify: **STALE** (the code change was intended — its commit message says so — and the test pins the old
   behaviour or an old fixture shape), **REGRESSION** (the code broke something the test rightly protects), or
   **UNKNOWN**.
3. Fix only STALE tests: update the fixture/assertion to the intended behaviour, with a one-line comment naming
   the commit. Never weaken an assertion to make it pass; never edit source code. One commit per test file.
4. Do not touch a test file that has someone else's uncommitted edits (check `git diff -- <file>` first).

## Receipt
A table: test file → failing test name → error (one line) → classification → introducing commit → action (fixed
in <sha> / left for owner). Then the REGRESSION list on its own, ranked by player impact.
