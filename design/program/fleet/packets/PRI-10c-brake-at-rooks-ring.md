# PRI-10c — Rook's ring: hold Brake to settle a towed Cinder hull, and the booth takes it (#939, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R8 and the Cinder receiving hook of R7** — they give, for this feature, the PR
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
Towing a marked Cinder hull into Rook's ring, holding Brake slows it inside the pad. The booth takes the hull physically. Stood-down combat cones go away.

## Direction (the lead's decisions — follow these where the PR differs)
1. No new registered system if an existing owner can hold it: the brake assist belongs with the field/brake owner that already acts on towed bodies (`src/systems/fields.js` / the tether owner) or inside `src/missions/cinderRoute.js`'s existing drive. Only if you can show neither can hold it may you register one (manifest + node factory table), and say why in the receipt.
2. The PR's `receivingTow()` scans `entityList` for the pad and iterates entities every tick: instead resolve the pad once when the Cinder route enters Rook's sector and keep the id; per tick touch only the towed hull and the pad.
3. Port the ~10 real lines of the Cinder receiving hook onto master's current `src/systems/rookBooth.js` (the PR's 750-line diff there is whitespace). The 85-word receiving speech becomes one line from Rook and the existing receipt.
4. Retiring stood-down cones (`npcFieldDeploy.js`, `fields.js`): keep exactly the PR's behaviour and its test.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R8 and the Cinder receiving hook of R7 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/rook-receiving-brake.test.mjs`, `test/cinder-receiving-scene.test.mjs`, `test/npc-cone-disengagement.test.mjs`, `test/cinder-field-report.test.mjs`, `test/cinder-tow-motion.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10c): <what the player now sees>` — one per recon row where they can stand alone.
