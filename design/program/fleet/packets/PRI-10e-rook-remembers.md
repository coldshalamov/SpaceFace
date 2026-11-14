# PRI-10e — Rook's return and departure lines, Rookside's first growth in front of the ship, and a Nest that keeps its spent couplings (#939, rebuilt)

**Lane 2. Run after: PRI-10b and PRI-10c.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **R11, R12, R13 and R14** — they give, for this feature, the PR
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
Rook says one honest line when you leave with and return from the Cinder job. At Rookside a ring marks where the feed goes and the first growth happens in front of you. At the Nest, returns must strike the carrier, spent couplings stay spent, and the moving brood is right after Continue.

## Direction (the lead's decisions — follow these where the PR differs)
1. PRI-07f landed #982's Rookside/Nest changes today (`src/systems/faction_understory.js`, `src/data/nestVisit.js`, `src/missions/compostRoute.js`): read master first and port only what is still missing (R12 is four lines; R14 is the persistence deltas only).
2. R11 conversations: one reply per recorded outcome, eight words or fewer, from the route's real record. The hook into the bar screen is NOT in this packet (it lands with PRI-10o): export the choice/reply functions and test them directly.
3. R13 arrival ring: use the tag pattern `src/missions/frontierReceivingTags.js` established (reconcile on transitions, never per tick).

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows R11, R12, R13 and R14 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt the tests the recon rows R11–R14 name (`nest-carrier-motion-continue`, `nest-moving-brood-continue`, `nest-socket-return`, `nest-spent-nursery`, the Rookside and Cinder conversation tests). They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10e): <what the player now sees>` — one per recon row where they can stand alone.
