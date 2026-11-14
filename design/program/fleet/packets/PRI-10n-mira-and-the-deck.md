# PRI-10n — Tethys: release a pod at the pad, and a settled pod stays put (#939, rebuilt)

**Lane 2. Run after: PRI-10a.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R5** — they give, for this feature, the PR
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
At the Tethys Scale you can release a pod at the pad through the cargo owner, and a pod that has settled on the deck stops drifting. Mira points you at the Scale in one line.

## Direction (the lead's decisions — follow these where the PR differs)
1. Assisted release goes through `cargo.jettison` and the cargo owner — the PR's `kesslerCargoRelease.js` logic folds into `src/systems/cargo.js`; `cargoReadModel.js` never lands.
2. Deck damping: not a new registered per-tick system. Put it with an existing field/physics owner that already runs in that sector, acting only on pods the scale has already recorded as settled (by id), no payload scan.
3. Fix the custody mismatch the recon found: the campaign says you weigh *the delivered crate* (`campaignData.js`) while the waypoint says "any fresh jettisoned cargo pod" (`kesslerScaleWorksite.js`). The delivered alloy load is what goes on the Scale: make the waypoint and the acceptance agree with the campaign, without inventing stock.
4. Mira (113-word speech in the PR): one line, eight words or fewer; the Scale's tag carries the instruction.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R5 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/tethys-deck-clock.test.mjs`, `test/tethys-scale-arrival.test.mjs`, `test/tethys-scale-continue.test.mjs`, `test/tethys-scale-journey.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10n): <what the player now sees>` — one per recon row where they can stand alone.
