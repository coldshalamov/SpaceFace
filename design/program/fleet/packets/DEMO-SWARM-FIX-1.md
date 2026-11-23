# DEMO-SWARM-FIX-1 — the Swarm review's findings, fixed

**For:** Devin SWE-2 Max. **Kind:** scoped fixes with exact instructions. Commit your own files.

An independent reviewer checked the Swarm lane's commits (d07c9b4b8d, 6052f7d3ec, 364b47acd5,
031b65b976, 244b5643a4, a5d1a698ca, 4c3e3250f1, 8cc84793ef) and found the problems below. Each has
evidence and a fix. Verify each against the code, then fix it. Run focused tests; commit each fix by
exact path with a plain-English message saying what the player now gets.

1. **Rounds are flooded (most important).** `src/data/swarmCourseCast.js` header holds the
   director-APPROVED round budget table (2026-11-20): bodies `10 16 20 24 18 26 28 30 32 22 30 …`
   with the rule "no round adds more than +6 over the round before". Live today
   (`swarmRoundPreview(helios_core)` killTarget rounds 1-11): `10 19 22 28 23 40 42 42 42 26 42`.
   Switch `swarmCourseQuota` (`src/data/swarmMode.js`) to the approved row. Rewrite every test that
   pins the old counts with the reason "superseded by the approved round budgets in
   swarmCourseCast.js (director 2026-11-20)". If `npm run check:sim` moves, re-record the golden in
   the same commit and say so.
2. **Resume slot can bring back an abandoned run.** `src/systems/survivalRun.js` ~line 290: since
   8cc84793ef a fresh run's opening no longer writes the resume slot and nothing clears an old one.
   Sequence: run A clears round 4, quit to menu -> slot 'Round 5'; player presses Launch (run B, not
   Resume); quits B during round 1 -> the door offers run A again. Fix: when a Swarm run begins
   without a resume record, clear the slot — but NOT inside the boot rehearsal (the warm-up fight the
   game runs at start-up), or every boot wipes a real slot. Add the test: slot from A, fresh B, quit
   B in round 1 -> no resume offered.
3. **One money word on the Bench.** `src/ui/orrery/crucibleArmory.js` ~162/169 prints 'cr' while the
   header says 'Run Scrap' (`src/ui/screens/crucibleDraft.js` ~1595, ~271 currency logic). Pass the
   Swarm money word through to the price note, the buy label and `launchEquipmentSummary`: in Swarm
   it is always 'Scrap'.
4. **Cash out says what it pays.** `src/ui/screens/crucibleDraft.js` ~631 `extractionPreviewLines`:
   'Ends the run at round 10 and keeps all 212 Scrap.' (drop the points). On the 'Cashed out' Run
   Over plate (`src/ui/screens/crucible.js` `_mountRunOver`, kind 'extracted') add one row 'Banked
   212 Scrap' from `result.bankedBounty`. Correct the false comment at `src/ui/survivalHud.js` ~1435.
5. **Phone: the pinned Re-roll/Later bar covers card 3** at 390x664 and 360x600
   (`src/ui/pilotCardsCss.js` ~123; NOTE: a previous fixer was stopped mid-edit on this exact file
   at 13:11 — read `git diff -- src/ui/pilotCardsCss.js` and finish or replace that partial edit): make the bar opaque from its top edge and reserve its height as
   bottom padding / scroll-padding so cards never sit under it. Check with
   `node scripts/ui-bench.mjs --shot=pilot-cards --viewports=390x664,360x600,390x844` — the report
   must show no BURIED/UNREACHABLE.
6. **Refit jargon** in `src/ui/screens/crucibleDraft.js` (~573 `Hardpoint N`, ~408 `dps`, ~2312,
   ~2014): 'Gun 1', 'Shield', and a plain comparison ('hits harder, pushes less') instead of
   'dps · impulse'.
7. **Win plate lost Skip replay** (`src/ui/screens/crucible.js` ~4428): add the same quiet 'Skip
   replay' button to the win foot when `killcamStageRequestFor(ctx.state)` is live.
8. **Dead wiring** from the removed boss plate: `src/systems/capitalBossRuntime.js` ~215-231 (ack
   listener, pending/line/lesson stamp fields), `src/core/mainToSimEventSurface.js` ~323 entry, and
   the ack step in `test/swarm-boss-rites.test.mjs`. Delete what nothing reads (regenerate the event
   surface with `node scripts/lib/eventSurfaceCensus.mjs --forward-set` if the protocol says so).

## You may edit
The files named above and their tests. Before editing any of them run `git diff -- <file>`; if it
has someone else's uncommitted edits, use `bash scripts/fleet/own-commit.sh begin/commit`.

## Receipt
Protocol headings + per finding: fixed (commit) or rejected (one-line reason).
