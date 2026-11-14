# PRI-10m — Helios, the first job: the cutter makes room for you, points at iron, and Kessler hands you 47-A (#939, rebuilt)

**Lane 2. Run after: PRI-08a (Ceres winching, which changes `npcJobsRuntime.js`).** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R1, R2, R3 and R4** — they give, for this feature, the PR
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
The resident Helios cutter lowers its beam while you cut its face and warns when your tow crosses its line. Hail it and it marks first iron on your chart. Your first ticket closes honestly (cut, collected, sold). After the paid shift Kessler hands you Contract 47-A.

## Direction (the lead's decisions — follow these where the PR differs)
1. This is the first ten minutes; `OPENING-1` and `OPENING-1b` (queue) reordered it recently — read `design/game/20_THE_FIRST_HOUR.md` and master's current `src/onboarding/`, `src/missions/starterWorkday.js`, `src/ui/station/starterWorkdayConversation.js` before anything. Where master's opening already does a beat, master stays. Add only what is missing and does not lengthen the route to the first throw.
2. R4: extend master's `starterWorkdayConversation.js` exports — never a parallel `heliosFirstShiftConversation.js`. R3: sellable quantities come from `src/systems/cargo.js` (`sellableCargoQuantity`), never the PR's `cargoReadModel.js`.
3. Every bark eight words or fewer (the PR's run to 31, 46 and 64). The cutter is a ship doing something on screen: its beam visibly lowers; that is the message. One line at most when it does.
4. R2 hail → `ui:setCourse`: keep the PR's validation (live contact, mission identity, sector, generations) on master's current hail prompt (PRI-06 changed it today).

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R1, R2, R3 and R4 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/helios-cutting-courtesy.test.mjs`, `test/helios-cutting-tow.test.mjs`, `test/helios-shared-cut.test.mjs`, `test/helios-first-iron-homebound.test.mjs`, `test/helios-campaign-handoff.test.mjs`, `test/starter-workday-conversation.test.mjs`; `test/helios-claim-opening.test.mjs` only if it still describes master's opening. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10m): <what the player now sees>` — one per recon row where they can stand alone.
