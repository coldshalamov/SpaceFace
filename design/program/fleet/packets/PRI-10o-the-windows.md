# PRI-10o — The people the story built get their windows: bar and hail hooks for the conversations landed by PRI-10 (#939, rebuilt)

**Lane 2. Run after: every other PRI-10 packet and PRI-08c.** Read `design/program/fleet/PR-INTAKE.md` first. Then
`.devshots/pr-intake/reviews/recon-939.md` rows **the desk/hail integration left over from R4, R5, R11, R23, R24 and R25** — they give, for this feature, the PR
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
Each conversation the earlier packets built (Kessler's hand-off, Mira, Rook's return, the Ash Cache courier, the Shepherd's message) is reachable at its desk or on the radio by playing normally.

## Direction (the lead's decisions — follow these where the PR differs)
1. Wire only what exists: for each conversation module landed by an earlier PRI-10 packet (list them from `git log --oneline --grep="PRI-10"`), add its choices to the right contact through `src/data/stationResidents.js` / `src/ui/station/barContacts.js` / `src/data/contactHail.js` in master's current form (PRI-06 and PRI-08c changed them). A conversation that did not land is not wired.
2. Do not port the PR's `bar.js` +186 wholesale: add the minimum request/receipt plumbing each conversation needs, following the pattern PRI-08c used for Kessler's yard slip. No change to the reply typewriter or bar CSS.
3. `missionLog.js` in the PR is a net deletion that folds readouts into the new modules: apply only the parts whose modules landed.
4. Prove each one end to end in a test through the real contact path, and shoot `station-bar` at desktop and `--viewport=390x844`; name the PNGs.

## Always
- New-in-PR helper modules may be brought (`git show … > path`) and then corrected; files that exist on
  master are edited by hand or three-way merged, master's structure winning.
- No new saved field without an old-save test (missing field tolerated; nothing minted twice on Continue).
- No per-tick allocation or whole-entity-list scan; do the work on a transition and keep ids.
- Do not edit expected/golden files (`*.expected.json`, `test/references/**`). If a 47-A telemetry golden
  would change, stop and report it under Blocked with the scenario name.
- Do not bring PR docs, evidence files or `build_map.md`.

## Files you may edit
The source and test files recon rows the desk/hail integration left over from R4, R5, R11, R23, R24 and R25 list for this feature (and the master owners those rows
point at). A file with foreign changes in `git diff`: do the rest, re-check every ten minutes for up to
thirty, then report it under Blocked with the exact hunk you wanted.

## Tests
adapt `test/ash-cache-courier-ui.test.mjs`, `test/kurtz-bar-desk.test.mjs`, `test/ending-choice-e-route.test.mjs`, `test/helios-campaign-ui.test.mjs`, `test/tethys-scale-ui.test.mjs` (now `test/cinder-desk-ui.test.mjs`: the Tethys scale conversation was not built; it tests Rook's Cinder desk) for the conversations that landed. They must drive the real owner with what the game really sends, and fail on the old code.

## Checks
The named tests; then the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. No game run unless this packet names a bench shot.

Commit(s): `fleet(PRI-10o): <what the player now sees>` — one per recon row where they can stand alone.
