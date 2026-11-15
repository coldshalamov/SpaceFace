<!-- LIFETIME: PROGRAM -->
# REVIEW-QUEUE — work landed while the strong reviewer (Fable) was offline

The parent/master model (Fable 5.2) is temporarily offline; a lighter model kept the PR-intake
fleet running. **Nothing below has had the strong creative/quality review.** When Fable returns,
review each section, then tick or revert. Also see the Codex senior review:
[`reviews/2026-11-14-pr-intake.md`](reviews/2026-11-14-pr-intake.md) (5 MED, 2 LOW, no HIGH —
the `PRI-FIX-R1` worker is landing fixes for those seven findings; those fix commits also
need a re-review pass by Codex/Fable).

## Rules for the returning reviewer

- These commits are already on local `master`; "review" means read the diff, run the named
  checks, and either accept (tick) or write a fix packet — not rework from scratch unless the
  foundation is wrong.
- Mark the tick in this file and commit it; the queue is done when every box is ticked.
- `NEEDS FABLE REVIEW` in a commit subject = landed by a worker whose session died or timed out;
  treat those first — they may be half-finished.

## Landed but unreviewed (newest last)

- [ ] `bef48aa349` Share simultaneous embedded texture transcodes *(foreign perf worker)*
- [ ] `6c46c4f68b` ui(wingman-radial): phone dial raised so REGROUP clears power slots *(PRI-14, partial packet)*
- [ ] `ebb232494f` Skip idle VFX sprite buckets in render list *(foreign perf worker)*
- [ ] `d55f238a61` fix(R1): jettisoned ore pod no longer earns food reward *(FIX-R1, part of)*
- [ ] `42023c0168` fix(R2): catch-net custody change invalidates food verdict *(FIX-R1, part of)*
- [ ] `2c6e03e187` fix(R3): yard capstan gantry-to-pod cable draws *(FIX-R1, part of)*
- [ ] `b51aab7026` fix(R4): finished/lost Ceres lift stops scanning world *(FIX-R1, part of)*
- [ ] `acf9b3122d` Reduce trade hub window glare *(foreign perf worker)*
- [ ] `2f2881a065` **fleet(PRI-10d)** law desk / Book 4 restitution — worker died mid-run, recovered and committed by hand. Tests `book4-*-guidance` pass; check whether the packet's full scope landed (receipt was never written).
- [ ] `53194ad2f4` **fleet(PRI-08b)** the ninth mouth — lamp tow onto the Ceres ray. **KNOWN FAIL:** `test/ceres-ninth-mouth-earned-route.test.mjs` — "earned original lamp Seat, original barge rescue, Continue and sector return" fails (lamp slingshots when `move()` runs with an attached load). 15/16 pass.

## Uncommitted foreign work left in the tree (assess, don't assume mine)

- `scripts/lib/uiBenchCatalog.mjs`, `tools/ui-bench.js` — PRI-14 worker's half-finished
  hail-panel bench fixture (item 8 of that packet). Either finish it or revert those hunks.
- `src/data/swarmFortifyView.js`, `src/data/swarmMods.js`, `src/systems/swarmArena.js`,
  `src/systems/swarmBrood.js`, `src/systems/swarmFortify.js`, `src/systems/swarmSafety.js` —
  foreign/dirty swarm-fortify work (a sonnet worker is running `PRI-11d-fortify-you-can-read`
  against it; may belong to it).
- ~70 other modified files are foreign workers' in-flight edits; inspect before sweeping.

## Known open verification gaps

- `npm run gate` is RED but the failure looks environmental, not code: boot 45.8s PASS,
  LAUNCH/PILOT/HULL/WORLD/CONTROLS/LANE-FWD/SAVE all PASS; CONTINUE fails because after the
  harness reload 10 authored-ship GLB requests died with `net::ERR_NETWORK_IO_SUSPENDED`
  (Chrome suspending IO under machine load — three fleet workers running) and the new
  authored-visuals readiness guard correctly refused to enter flight on procedural fallback
  (`retryable:true`). An earlier "no New Game button" LAUNCH failure was the same class of
  transient (menu still mounting at click time). Re-run on a quiet machine before treating
  this as a real regression; if it persists, the check may deserve one retry on retryable
  load failures (the game itself offers "Retry Launch").
- PRI-14 packet completed only 2 of 7 items before timeout (crucible-results, wingman-radial).
  Remaining: crucible draft phone clipping, dossier verbs vs station tabs, station-ledger,
  faction-treaty phone, hail-panel shot.
- PRI-10d's later chain (10e–10o) is queued behind FIX-R1 on devin2; check whether it ran.
- No performance re-baseline since the UI changes — headed Chromium traces are stale.
