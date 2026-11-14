# PRI-10f — Book 5 — The Weighing: three ships fly too perfectly; break the pattern (#939, rebuilt)

**Lane 2. Run after: PRI-10e.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R20** — they give, for this feature, the PR
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
East of the Star Marker three Helix ships with matched transponders hold a measured formation. Breaking the pattern is the reveal; the clearance receipt says what really happened.

## Direction (the lead's decisions — follow these where the PR differs)
1. The design line (`design/game/16_THE_STORY_SHOWN.md`, B4/B5): "a patrol pack flies too perfectly — break its pattern." The formation must be visibly exact (equal spacing, matched heading) until disturbed; the unmasking fires from the physical break (a member displaced from its slot by more than a set distance, by any means: shove, thrown mass, kill), not from proximity or a scan alone.
2. Rebuild behind the current spawn/story owners (`missionSpawningOps.js`, `missionStoryOps.js`, `missionObjectiveOps.js`) — the PR's versions of those files conflict; port `weighingWorksite.js` as the worksite helper and re-wire by hand. `observeWeighingScene` stays boundary-driven (arming / pending receipt), never a per-tick scan.
3. `WEIGHING_OPENING` (33 words) becomes one line of twelve words or fewer.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R20 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/weighing-clearance.test.mjs`, `test/weighing-worksite.test.mjs`; add: the reveal does not fire while the formation is intact and fires when one member is shoved out of its slot. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10f): <what the player now sees>` — one per recon row where they can stand alone.
