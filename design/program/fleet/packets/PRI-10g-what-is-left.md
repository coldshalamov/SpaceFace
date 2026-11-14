# PRI-10g — Registry custody is durable, Slate's core is a thing you recover, and the Maw accepts only real contact (#939, rebuilt)

**Lane 2. Run after: PRI-10f.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R15, R16 and R17** — they give, for this feature, the PR
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
Taking the Registry civilian alive is remembered as custody, not as a kill. Slate's drifting core is a physical recovery (inside 70 wu, under 18 wu/s). The Ceres Maw recovery counts only real solid contacts.

## Direction (the lead's decisions — follow these where the PR differs)
1. R17 is the one near-clean three-way merge in the PR (`mawWorksite.js`, `masslineImpacts.js`, `missionsData.js`): port it.
2. R15: port only the durable living-custody record (`registryWrit.js`) onto master's existing Writ beat. R16: port `slateCoreWorksite.js` and wire it through the current ops seams by hand.
3. Each leaves something in the world after it (the design's "what is left"): say in the receipt what stays for each of the three, and prove it survives save and Continue.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R15, R16 and R17 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/registry-hold.test.mjs`, `test/registry-writ-physical-choice.test.mjs`, `test/slate-core.test.mjs`, `test/maw-recovery.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10g): <what the player now sees>` — one per recon row where they can stand alone.
