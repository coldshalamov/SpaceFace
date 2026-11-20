<!-- LIFETIME: PROGRAM -->
<!-- HISTORY-2026-11-20 -->
> **History, not instructions (2026-11-20).** This file no longer assigns, orders or blocks any work.
> States such as READY, TAKEN, HOLD, PARKED and NEEDS-PACKET mean nothing now. Read it for facts
> about what was built or planned. The rule and the live board are in the root `AGENTS.md` and
> `design/overhaul/12_PIPELINE.md`.

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

**Review passes (lead, 2026-11-16):** an argon (gemini-4-argon-high) pass over the boxed commits
ran ~3 h and died on the agy account quota (429 RESOURCE_EXHAUSTED) with no output. Replacement:
REVIEW-BATCH on codex — committed 8a75fd6600, reviewed 575cfaa1ac79..be43a250cb (172 commits):
168 clean, 4 findings (1 HIGH, 1 MED, 2 LOW), all verified by the lead against the tree and fixed
by FIX-R6: bf8c46d1a7 (HIGH, ninth-mouth capture), a80a0d9e89 (MED, Weighing reveal),
12d3176842 (LOW, Rookside cooldown), 021c809703 (LOW, npc teardown) — 49 focused tests green at
HEAD. Boxes below are ticked on that basis; R3 keeps its on-screen cable check open.

**Standing rule: every `fleet(` / `fix(` commit after `b0baf1b4e3` (the Codex review baseline) needs
review — run `git log --oneline b0baf1b4e3..HEAD` for the live list; the boxes below are just the
ones landed when this file was written.** Workers commit incrementally, so `fleet(PRI-XX)` commits
may be partial slices of a packet still running — check the packet's run dir
(`.devshots/fleet/runs/<packet>.*.*/RECEIPT.md`) for the worker's own account before judging.

- [x] `f3d0fdc9b9` look-bench waits up to 5 min for the game under a busy machine *(harness tolerance)*
- [x] `a1d2bc116e` fleet(PRI-08c): Kroll's berth on the chart *(worker still running — partial)*
- [x] `bb92e70358` fix(THROW-01): whip recoil spares the body on your Line *(foreign worker)*
- [x] `a7c5517eba` Reduce Apron Shuttle trim glare *(foreign perf worker)*
- [x] `a84afab337` Skip dark stellar formation vertices *(foreign perf worker)*
- [x] `3b3311a4f1` Isolate concurrent texture transcode failures *(foreign perf worker)*
- [x] `58cb302944` fleet(PRI-11d): Fortify screen reads what stands *(worker still running — partial)*
- [x] `bef48aa349` Share simultaneous embedded texture transcodes *(foreign perf worker)*
- [x] `6c46c4f68b` ui(wingman-radial): phone dial raised so REGROUP clears power slots *(PRI-14, partial packet)*
- [x] `ebb232494f` Skip idle VFX sprite buckets in render list *(foreign perf worker)*
- [x] `d55f238a61` fix(R1): jettisoned ore pod no longer earns food reward *(FIX-R1, part of)*
- [x] `42023c0168` fix(R2): catch-net custody change invalidates food verdict *(FIX-R1, part of)*
- [x] `2c6e03e187` fix(R3): yard capstan gantry-to-pod cable draws *(FIX-R1, part of)*
- [x] `b51aab7026` fix(R4): finished/lost Ceres lift stops scanning world *(FIX-R1, part of)*
- [x] `df4b82d982` fix(R5): blocked casing return no longer scans every tick *(FIX-R1, part of)*
- [x] `11a28aac9f` fix(R6): overlapping receiving rings prioritized to one tag *(FIX-R1, part of)*
- [x] `76ebff9f74` fix(R7): retired plate-theft helper drops its spawn listener *(FIX-R1, part of)*

All seven R1–R7 fixes landed with red-before-green evidence and 70/70 focused tests passing;
`check:src-imports` clean. **Gap:** R3's cable is proven at the renderer-admission predicate
only — nobody has *seen* the gantry-to-pod cable on screen. Fable: eyeball the Ceres quarantine
yard capstan once (or a `?sector=ceres&shot=1` capture) before ticking R3.
- [x] `acf9b3122d` Reduce trade hub window glare *(foreign perf worker)*
- [x] `2f2881a065` **fleet(PRI-10d)** law desk / Book 4 restitution — worker died mid-run, recovered and committed by hand. Tests `book4-*-guidance` pass; check whether the packet's full scope landed (receipt was never written).
- [x] `53194ad2f4` **fleet(PRI-08b)** the ninth mouth — lamp tow onto the Ceres ray.
- [x] `8798162e8b` **wiring commit (mislabeled)** — subject says "fleet(PRI-10d)" but it actually
  carries BOTH dead workers' recovered wiring hunks: the law desk mount + `book4ChoiceAction`
  consumer (10d), AND the ninth-mouth route wiring the SWE-2 review found absent — prompt mount
  in `proExperiencesBrowser`, `ceresNinthMouth:action` on the event surface, `simReadModel` /
  `simWorkerHost` / `world.js` / `worldCatchup` / `worldRecords` staging (08b). Both features are
  now reachable at HEAD; `node --check` clean on all 9 touched files and the ninth-mouth contact
  test passes 4/4. The mislabel stands because the shared checkout forbids history rewrites.
- **KNOWN FAIL:** `test/ceres-ninth-mouth-earned-route.test.mjs` — root cause found by the SWE-2
  review: a lawful `patrol_scan` squad physically rams the tethered lamp mid-tow (see
  "## Reviewer findings" below for file:line detail). Fix is a **design call**, not a bug patch:
  patrol standoff vs tethered loads, a quiet zone during the job, or a lawful-collision grace.

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

## Reviewer findings (SWE-2 pass)

### `53194ad2f4` fleet(PRI-08b) — needs-rebuild

**Failing-test root cause (diagnosed by instrumented replay, `scripts/probe-ninth-mouth-slingshot.mjs`):**
`test/ceres-ninth-mouth-earned-route.test.mjs:93` fails because a routine lawful proximity
encounter physically rams the towed lamp — not because of tether/guidance code. A `patrol_scan`
encounter (`src/data/encounters/030-patrol-scan.js`: 2× `patrol_lawman` brawlers, `faction_scn`,
wedge formation) spawns ~560 wu from the player and flies `scan_approach` →
`ManeuverKind.INTERCEPT` on the player (`src/ai/doctrine.js:167-169`, `:445-457`;
script `src/systems/encounterScripts.js:342-397`). During the slow ~0.65 wu/s earned tow,
squad hull (probe: id 220, mass 70) crossed the lamp's tether trail and at sim t≈69.65s made
contact with `lamp:0` (mass 8, `src/data/ceresNinthMouth.js:29-30`). Four consecutive
`physics:impact` ticks took the lamp from 1.3 to ~40 m/s; the still-active 63.9-wu
`tether_standard` attachment then slung it to ~100 m/s before the player released it (~22 m/s
at release). `src/systems/ceresNinthMouth.js` guidance therefore computes `intercept`, not
`coast`, and the seat predicate (`maxSpeed:1`, `src/data/ceresNinthMouth.js:42`) can never be
met. Native physics behaved exactly as authored — the gap is that lawful scan squads intercept
point-blank on the player with no regard for a tethered load, and this job is the first content
where one routine punt fails the work. The brisk `ceres-ninth-mouth-fast-earned-route` test
passes (lamp seated by sim t≈46s, before the squad's line crosses the pocket). Any fix is a
design call larger than a review fix: standoff/avoidance for `scan_approach` vs attached loads,
a lawful-proximity-encounter quiet zone while this job's tow is live, or a lawful-collision
grace on player-tethered bodies — owner should pick one.

**Packet-required wiring missing from the commit** (the packet lists these files
`design/program/fleet/packets/PRI-08b-the-ninth-mouth.md:14-23`; all exist only as uncommitted
foreign work in the tree, so at HEAD the feature is unreachable and invisible on the real route):
- `src/core/mainToSimEventSurface.js` — no `ceresNinthMouth:action` at HEAD, so prompt choices
  never reach `src/systems/ceresNinthMouth.js:361`'s bus listener in the worker/main path
  (dirty tree adds it at line 28).
- `src/features/proExperiencesBrowser.js` — no mount at HEAD:
  `createCeresNinthMouthPrompt` / `createCeresNinthMouthVisuals` are never instantiated.
- `scripts/lib/simReadModel.mjs`, `scripts/lib/simWorkerHost.mjs` — packet-named, untouched.
- `src/systems/world.js`, `src/world/worldRecords.js`, `src/world/worldCatchup.js` —
  packet-named, untouched; persistence currently rides `npcJobsRuntime` serialize only
  (passes tests, but check the world-record path once UI wiring lands).

### `2f2881a065` fleet(PRI-10d) — needs-rebuild (dead-at-HEAD UI exports; rest is sound)

- `src/ui/station/lawFineDesk.js` (`mountLawFineDesk`) is committed but mounted nowhere at HEAD;
  the only mount is uncommitted dirty work in `src/ui/station/stationApp.js` (import + mount at
  `.sxb-crown` + refresh/setActive/dispose lifecycle). Same file also carries foreign
  `STATION_HELP` gloss work — stage only the law-fine hunks when landing.
- `book4ChoiceAction` (`src/ui/book4Choice.js`) has no committed consumer; only dirty
  `src/ui/screens/missionLog.js` imports it → the guided choice is dead at HEAD.
  `book4MissionChips` IS reachable at HEAD via `contracts.js:504` and `missionPreflight.js:268`.
- Verified sound in the commit: `isReportInRestitution` matches the real mutation shape
  (`src/systems/missions.js` stamps `source:'missionMutation'`, `mutationTag:'restitution'`,
  `mutatedFromMissionId`, `params.replacesMissionId`); `law:fineChoice` stale-offer binding
  (`src/systems/lawSecurity.js:6494-6550`) matches the desk's `expectedFine` payload and is in
  the event surface; `missionConsequenceSummary(m, state)` signature change is graceful at the
  one un-updated caller `src/ui/station/screens/bar.js:322` (no Book 4 chips there — confirm
  that omission is intended); sanctuary mission-quarry resume block (lawSecurity ~966-1007,
  helpers ~8830-8880) and the hail-chip tracker-column re-mount are off-headline but coherent.
- Book 4 tests pass 10/10.

### R1–R7 fix commits — all OK

`d55f238a61` (food-category gate), `42023c0168` (custody recheck at handoff + dwell clear),
`2c6e03e187` (capstan admitted to `npcCableAdmits`), `b51aab7026` (terminal-state scan gating;
`player-retained` correctly stays non-terminal), `df4b82d982` (`nextAttemptAt` adoption backoff),
`11a28aac9f` (one tag per stead/generation, supplies→aid→claim priority, relabel on close),
`76ebff9f74` (`destroy()` + spawn-listener unsubscribe, arena destroy path wired). Each closes
its packet finding without new writes across ownership; 70/70 focused tests pass and
`check:src-imports` is clean (3377 modules).

## Lead audit, 2026-11-15
The whole intake (every PRI packet, the ui-polish wall, #1074, the empty-merged PRs) had a strong
review, a before/after test, screen and performance comparison against 8ef4225cd0, and fixes —
results and what is still open are in `build_map.md` §37.5. Every box above this section was covered
by that review (R1–R7 confirmed sound; PRI-08b's patrol ram fixed in `6c7cd5d2cf` + `da6a214102`;
PRI-10d's law desk verified mounted and given its station-head layout in `0caa8dce40`; PRI-14/14b
remainder finished in UI-1…6 and AUDIT-20). New commits from the audit carry `AUDIT-` in their subject.
