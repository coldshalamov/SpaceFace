# PRI-10j — Book 6 — Empire Seed: charter one crewed hauler and hear what it sends home (#939, rebuilt)

**Lane 2. Run after: PRI-10i.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R22** — they give, for this feature, the PR
commits, every file and size, what master already has (with file:line), the over-long strings and the
per-tick costs. The senior review is `.devshots/pr-intake/reviews/codex-dot-big.md` ("#939").
PR #939 is a seven-week-old fork of the same owners master has since rewritten: **rebuild on master's
current owner; never transplant a file that exists on master.** Read the PR for behaviour and tests:
`git show refs/remotes/pull/939:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/939 -- <path>`.

The story rule (`design/game/16_THE_STORY_SHOWN.md`): *a story beat is something that happens in front
of you, with weight in it. If a beat can be delivered by a popup, it has not been staged yet.* Three
tools: a thing on the Line, a ship doing something on screen, a person at a window — one line of
speech at a time, twelve words at most (eight for a job line, `13_JOBS_AND_HEISTS.md`).

## What the player gets
After Book 5, one crewed hauler can be chartered at Belt Outpost. It works as a real trader and each cycle you hear what it remitted.

## Direction (the lead's decisions — follow these where the PR differs)
1. Express it through the automation owner (`src/systems/automation.js`, which gained the outpost facility loop today in commit cef2ab0e8c — read it first): a commission plus trader meta, not a parallel mission file. Money through economy only.
2. The design's B6 (`design/game/16_THE_STORY_SHOWN.md`): "the first thing in the game that is yours and has weight." The remittance is one line per cycle, eight words or fewer, and stops being said after the third cycle.
3. `src/ui/screens/automationPanel.js` was rebuilt today (commit 4227d9e81f): add the charter as one card in its existing pattern (primary action + reason when disabled). Shoot `node scripts/ui-bench.mjs --shot=automation` and name the PNG.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R22 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/book6-income-charter.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10j): <what the player now sees>` — one per recon row where they can stand alone.
