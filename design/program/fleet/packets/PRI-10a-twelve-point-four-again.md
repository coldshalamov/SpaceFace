# PRI-10a — Kessler's Scale shows two readings that disagree (#939, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R0** — they give, for this feature, the PR
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
Weigh a second pod on Scale 4 and the board shows both readings side by side. When they differ, Kessler, at the window, says one line. The pod you weighed keeps its receipt on its own tag so you can go back for your freight.

## Direction (the lead's decisions — follow these where the PR differs)
1. The comparison is a bounded fact owned by the scale (`src/systems/kesslerScale.js`): `{ version: 1, first: { plate, stamp, count }, second: null | {…} }`, written where the scale already stamps `data.kesslerReceipt` and emits `kesslerPod:weighed`. A second sample is optional and gates nothing. Reuse the PR's predicates only (finite positive sample; higher count and a different displayed tenth-tonne).
2. Stage it the way `design/game/16_THE_STORY_SHOWN.md` B1 writes it: the scale board's scan label / world tag flips to show `PLATE <a> t · STAMP <b> t`, and Kessler says exactly `Twelve point four. Again.` once, through the existing story-line voice, when the two displayed values differ. No LOG paragraphs, no instruction popups, no `comms:popup`.
3. No second beacon. The weighed pod's own scan label carries `WEIGHED <stamp> t · <units> u` (from the real salvage pool; if a multi-item pool exists never show a stale single amount). Nothing scans `entityList` on the scale's update path.
4. Old saves: no comparison record → nothing shown, nothing replayed on Continue.
5. Do not bring `cargoReadModel.js`, `kesslerCargoRelease.js`, `kesslerDeckDamping.js`, or any `missionSpawningOps.js` change.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R0 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/kessler-comparison-contact.test.mjs`, `test/kessler-freight-recovery.test.mjs`, `test/kessler-scale-worksite.test.mjs` from the PR: keep different-vs-equal stamp, once-only line, real jettison/pickup, partial collection, latch/generation, save/Continue; replace "exactly one synthetic beacon" assertions with assertions on the real pod's label. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10a): <what the player now sees>` — one per recon row where they can stand alone.
