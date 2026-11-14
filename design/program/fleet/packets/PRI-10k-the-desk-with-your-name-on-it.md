# PRI-10k — Book 7: Ash Cache opens to the pilot who earned it, and the evidence keeps its labels (#939, rebuilt)

**Lane 2. Run after: PRI-10j.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R23 and R24** — they give, for this feature, the PR
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
Ash Cache admits a pilot who earned clearance through the story. Reckoning bodies keep their authored labels after Continue. The courier's disposition is remembered.

## Direction (the lead's decisions — follow these where the PR differs)
1. First settle the recon's open question 1: does master's Ash Cache dock actually have a reputation floor that blocks a story-earned pilot? Trace `src/core/dockAccess.js` and its deny reasons for `station_ashcache`. If no floor exists, the clearance feature is moot — skip it and say so.
2. Port the six-line label-preservation fix in `reckoningRuntime.js` (labels are lost on restore today — a real bug).
3. Never bring `ashfallLedger.js` (master has `elroyLedger.js`). Bar/courier screen wiring is NOT in this packet (PRI-10o).
4. The design's B7 line: at the Ashfall desk "your callsign is already on file, dated six weeks before Cold Start". If the briefing text does not say that in twelve words or fewer, make it.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R23 and R24 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/ash-cache-story-access.test.mjs`, `test/deep-reach-briefing.test.mjs`, `test/ashfall-target-labels.test.mjs`, `test/ash-cache-finale-evidence.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10k): <what the player now sees>` — one per recon row where they can stand alone.
