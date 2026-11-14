# PRI-08a — Ceres: the swing. Clip a load to Old Hob's anchors and swing it out of the mouth (#945, part 1)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first; then the "#945" section of
`.devshots/pr-intake/reviews/grunt-ec-a.md`; then the job as the design writes it —
`design/game/13_JOBS_AND_HEISTS.md`, "Ceres Belt — the mine", **Job: Winching** — and the director's card at the
top of `design/program/experience-commissions/commissions/sectors/EC-S02-ceres-belt.md`
(if that file is not on disk yet: `git show refs/remotes/pull/945:<that path>`).

The design, exactly: *a load twice your size hanging in a mouth of the Rock, and Old Hob looking at it.
"Easy, girl." It cannot be flown out. It can be swung out, on the fixed anchors. Two ways: three careful
anchor-to-anchor swings — or one long swing that clears the mouth by a ship's width. What goes wrong: the
Quarry Bell, shift change, everything in the mouth starts moving at once. What is left: your swing chalked
on the anchor board.* This toy is the lesson every later Ceres job leans on, so it has to feel good alone.

## Build
Three-way merge from PR #945 (merge-base `f95de0eb1ba7`) only the winching half:
- `src/data/ceresAnchorWinching.js` (new), `src/systems/ceresAnchorWinching.js` (new),
  `src/systems/ceresPlayerWinching.js` (new), `src/ui/ceresWinchingPrompt.js` (new)
- `src/systems/npcJobsRuntime.js` — install/step/serialize **the anchor-winching parts only**
- `src/systems/ceresWorkfleet.js`, `src/systems/ceresWorkfleetStagecraft.js`, `src/systems/asteroidSites.js`
- `src/combat/persistence.js` (the `ceres_anchor_winch` attachment save/restore), `src/render/combat/npcCableFx.js`
- `src/features/proExperiencesBrowser.js` — mount the winching prompt only
- `scripts/lib/simReadModel.mjs` — only the `ceresWinchingOffer` / `npcJobs.ceresWorkfleet.phase` mirror keys;
  master added creature/machine vital folds in the same region — keep all of master's
- `ceresWinching:action` must cross to the simulation: regenerate `src/core/mainToSimEventSurface.js` with
  `node scripts/lib/eventSurfaceCensus.mjs --forward-set`; never hand-edit its census numbers
- Tests: `test/ceres-anchor-winching*.test.mjs`, `test/ceres-player-winching.test.mjs`, the PR's change to
  `test/ceres-workfleet-stagecraft.test.mjs`
Leave every Ninth Mouth, arrival-story, Breakwater and bar file for the next packets.

## Required corrections
1. **The words are the design's.** Old Hob talks to loads, not people. His lines, exactly, and no others
   from him: on clip-on `Easy, girl.` · mid-swing `Easy. Easy.` · load clear of the mouth `There she goes.` ·
   line snapped or load struck the rock `Now look what you did.` Any stagecraft/call line the PR adds that is
   longer than eight words is cut to eight or fewer in the same plain voice; instructions belong on the
   prompt key and the anchor's world tag (`CLIP · ANCHOR 2`), not in speech.
2. **What is left.** After a load clears the mouth, the anchor board records the swing: how many anchors
   it took (one long swing or three) — a durable fact through the owner that already persists Ceres
   worksite facts (`npcJobs` serialize / world records, whichever the PR's save path uses), shown as the
   board's scan label `ANCHOR BOARD · <pilot name or "you"> · <n> swing(s)`. If the PR does not have this,
   add it; it must survive save and Continue and must not be re-awarded.
3. **What goes wrong.** Find the Quarry Bell / shift change on master (`grep -rni "quarry bell\|shiftChange\|shift_change" src/systems src/data | head`).
   If master has a shift event, the winching job listens for it and the workfleet traffic in the mouth
   starts moving during a swing (through the workfleet owner, not by writing velocities). If master has no
   such event, do not invent one: say so under "What I could not look at or verify" — the lead will write it.
4. **Cost.** `stepCeresAnchorWinching` and `stepCeresPlayerWinching` run with the job owner's tick. With no
   winch job live they must return after one cheap check; with one live, no array allocation and no
   whole-entity-list scan per tick (keep references taken at job start; re-validate by id + generation).
5. **Saves.** A save made mid-swing restores the line, the load and the anchor (the PR's
   `combat/persistence.js` path) — keep its test. A save from before this change loads with no winch state.
6. Guards, not ceremony: where one function stacks several checks of the same fact, keep one at the
   boundary (PR-INTAKE).

## Files you may edit
Those named above. If `npcJobsRuntime.js`, `persistence.js` or `simReadModel.mjs` shows foreign changes in
`git diff`, do the other files, re-check every ten minutes for up to thirty, then report Blocked.

## Checks
`node --test test/ceres-anchor-winching*.test.mjs test/ceres-player-winching.test.mjs test/ceres-workfleet-stagecraft.test.mjs`
then in one call the existing tests of what you touched
(`grep -ln "ceresWorkfleet\|npcJobsRuntime\|combat/persistence\|asteroidSites" test/*.mjs`) — report pass/fail
counts; reds already failing on untouched master are reported, not "fixed".
`npm run check:src-imports`; `npm run check:sim` if `package.json` has it (report, do not "fix" drift you
did not cause — say which scenario drifted).
One look through the lock: `node scripts/fleet/game-lock.mjs run -- node scripts/start-in-sector.mjs --help`
to find the sector-start tool (G17-02, `?sector=sector_ceres_belt`), then capture the Ceres mouth with the
anchors visible into `.devshots/fleet/pri-08a/`; name the PNG paths. If you cannot get a picture in ten
minutes, say so — do not loop.

Commit: `fleet(PRI-08a): Ceres — clip a load to Old Hob's anchors and swing it out of the mouth`.
