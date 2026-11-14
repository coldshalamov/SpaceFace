# PRI-10d — Book 4: a docked law desk, a patrol that respects sanctuary, and a branch choice that shows its cost (#939, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R9, R10 and R19** — they give, for this feature, the PR
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
A fine can be worked off at a docked law desk. A mission's patrol quarry does not chase you through sanctuary. After a Book 4 introduction lapses you see what to do next and what each branch costs, instead of a dead end.

## Direction (the lead's decisions — follow these where the PR differs)
1. R9 law desk: port (`lawFineDesk.js`, its `stationApp.js` hook). If `src/ui/station/stationApp.js` shows foreign changes, land the desk module and tests and report the one-line hook under Blocked — do not edit a foreign-dirty file.
2. R10: rebuild the sanctuary-safe quarry rule inside `src/systems/lawSecurity.js` as it is today (it changed a lot since the PR); keep the PR's offer guards in `missionPreflight.js` / `contracts.js` / `stationMissionModel.js` only where master lacks them.
3. R19: `book4Choice.js` and `restitutionReadout.js` are leaf presentation over `missionShared.js` reads — port, trimming every string to one short sentence (the PR's run 14–25 words).
4. Any choice the player makes at a desk travels to the simulation the way existing station choices do — check the forward set, do not assume (see PR-INTAKE; a regenerate must not drop existing forwards: diff the generated file before committing).

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R9, R10 and R19 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt the PR's `test/law-fine-desk*.test.mjs` (if present), `test/book4-choice-guidance.test.mjs`, `test/book4-restitution-guidance.test.mjs`, and the R10 tests the recon row names. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10d): <what the player now sees>` — one per recon row where they can stand alone.
