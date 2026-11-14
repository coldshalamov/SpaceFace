# PRI-10b — Furnace Detail: an arrival you can read, Jorah on the radio, and a yard winch that winds pods in (#939, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R6 and the furnace-detail conversation of R7** — they give, for this feature, the PR
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
At the Ceres quarantine worksite the lots and the mouth are marked when you arrive, Jorah answers a hail and keeps your slip honest, and a yard capstan can wind a marked pod toward the intake on its cable.

## Direction (the lead's decisions — follow these where the PR differs)
1. Master re-landed PR #941 today (`src/missions/furnaceReceivingLane.js`, `furnaceCasingReturn.js`, changes in `furnaceWorksite.js`, `furnaceIntake.js`): build on those — the receiving-lane guide already marks the mouth; do not add a second arrival marker for the same thing. The arrival "scene" is at most one line and the existing tags.
2. The capstan rides the existing line/attachment authority (find how `src/systems/foundryPlateTheft.js` reels a line through `kernel.attachments` — the same seam); it never writes a pose or velocity. Cable 900 wu, one pod at a time. No per-tick `entityList` scan: candidate pods are the worksite's own lot bodies, already known by id.
3. Jorah is a hail contact on the existing contact-hail path (PRI-06 landed the resident channel: `src/data/stationContactPresence.js`, `src/systems/scanner.js`). One line per outcome, eight words or fewer.
4. The desk conversation (`furnaceDetailConversation.js` in the PR, worst line 107 words) becomes at most three one-line replies reading the worksite's real record.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R6 and the furnace-detail conversation of R7 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/furnace-arrival-scene.test.mjs`, `test/furnace-capstan.test.mjs`, `test/furnace-shift-contact.test.mjs`, `test/furnace-detail-ui.test.mjs`. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10b): <what the player now sees>` — one per recon row where they can stand alone.
