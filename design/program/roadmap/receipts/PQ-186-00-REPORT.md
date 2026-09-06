<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-186.00 — Bars as checks

```text
DONE  PQ-186.00 — every feel-contract bar the bench can reach is now a standing check that fails in the bar's own words, and re-injecting the retired auto-brake still turns the earned-speed bar red.
WHAT I FOUND     The bars were measured once by the packets that fixed them and then left unguarded — only the player-knock bar was re-asserted anywhere, so any later change could quietly un-meet a bar nobody was watching.
WHAT I CHANGED   Twelve of the thirteen bars now have standing checks wired into the smoke suite, each failing with the bar's own sentence from the contract; the thirteenth (the 60-second proof) is recorded unreachable until its scenario exists; and a coverage contract fails the build the moment a bar loses its check or a check's message drifts from its bar's sentence.
WHAT YOU WILL FEEL   Nothing when you play — this is armor, not gameplay. What changes is that the feel you can feel today cannot silently rot: re-adding the old auto-brake, softening a shove, dulling a slam, or letting the world stop reacting now fails the build quoting your own contract at the agent who did it.
THE NUMBERS      bars with a standing check | 12 of 13 (B12 recorded unreachable: needs the PQ-141 proof scenario) · wired suite | 37/37 tests green · injection proof | the retired governor brake re-created in the kernel turns B1 red through the guard's own failure | suite wall time | ~3 min (smoke budget 7 min)
THE FRAMES       none — this unit adds no player-felt change.
NEXT             whatever --next returns (U3 of this batch: PQ-139.04 the corkscrew trail)
```

## What was connected (nothing new was invented)

- The bar registry and verdict engine already existed (`scripts/lib/bench/feelBars.mjs`, PQ-173.01's
  measurer): every bar's verdict is recomputed there from raw metric numbers. The checks below
  assert those computed verdicts; no check re-derives a number the scenario already computes, and
  no bench-internal pass boolean is trusted.
- The scenarios already existed (`feel.reversal_course`, `feel.shove_magnitude`,
  `feel.terrain_slam`, `feel.rope_swing_release`, `feel.stroke_speed`, `feel.hitstun_curve`,
  `feel.knock_budget`, `world.reaction_trio`, plus the kernel instrument behind B1).
- The smoke runner already ran `check:feel:scenarios`; this unit wires the three new suites into
  that existing member rather than adding a second runner.

## The coverage

| Bar | Check | Message = bar sentence | Notes |
|---|---|---|---|
| B1 earned speed | `test/feel-regression.test.mjs` (pre-existing) | yes, in the shared guard module | also carries the §7 injection proof below |
| B2 nimble regime | `test/fun-bench-flight-scenarios.test.mjs` (added) | yes | both hulls × three clauses, unmeasured fails |
| B3 fight on screen | `test/fun-bench-flight-scenarios.test.mjs` (message extended) | yes | sentence includes the 2026-09-03 taste-director rewrite |
| B4/B5 shove | `test/feel-shove-bars.test.mjs` (new) | yes | magnitude clauses + displacement + has-not-fired |
| B6 terrain lethal | `test/terrain-slam.test.mjs` (clause test added) | yes | five computed clauses, unmeasured never passes |
| B7 rope | `test/rope-swing-release.test.mjs` (message) | yes | |
| B8 draw-to-fly | `test/draw-to-fly-stroke-speed.test.mjs` (message) | yes | sentence includes the 2026-09-05 audit envelope |
| B9 impacts answer | `test/feel-collision-impact.test.mjs` (first sentence) | yes (first sentence) | bench-unreachable (presentation layer); the kernel hitstop/trauma instrument is wired instead |
| B10 world reacts | `test/world-reaction-bars.test.mjs` (new) | yes | the three sentence clauses carry B10's sentence; the PQ-138.03 wreck-momentum rider is asserted under its own claim so a wreck regression cannot masquerade as a B10 failure |
| B11 hitstun law | `test/hitstun-curve.test.mjs` (clause test added) | yes | light ≥ 1 s across gun/throw/fling pinned met; the no-hidden-gyro clause pinned met; exactly one owed clause (collision source) may be unmet — a second unmet source goes red |
| B12 60-second proof | — | — | recorded unreachable: the PQ-141 scenario does not exist yet (`benchReachable: false` + reason in the registry) |
| B13 knock budget | `test/knock-budget.test.mjs` (message) | yes | message-only change; the clause assertions already existed |

Plus `test/feel-bars-contract.test.mjs` (new), the coverage contract that makes this table
fail-closed: it parses the contract's §B table and the registry and asserts (1) they name exactly
the same bars, (2) every bar either has a check file that quotes its §B sentence verbatim or a
recorded unreachable reason in the registry, (3) every checked bar's file is listed in
`check:feel:scenarios` (so it actually runs in smoke), and (4) no unreachable bar claims a check.

## The §7 injection proof (done-when's second half)

`test/feel-regression.test.mjs` re-creates the retired governor brake (the A1 defect: ~6 WU/s² of
automatic counter-thrust above the cap) on the real kernel, runs 600 ticks at 2× cruise for both
throttle arms (hands off, forward held), and observes the B1 guard FAIL via `assert.throws` with
B1's sentence ("Only the brake spends it"). The injection is a real re-creation of the retired
defect on the live kernel path, not a stubbed boolean.

## Verification evidence

- `npm run check:feel:scenarios` → 48/48 tests green, 82 s wall (the smoke step's budget is 420 s —
  headroom recorded for the reviewer).
- `npm run check:baseline` → green at entry on the first run; on the exit run the aggregate is red
  for exactly one child, `check:sim`: the 47-A authoritative telemetry hash drifted. That drift is
  attributable to concurrent sim work this unit does not own — the only dirty sim file in the tree
  is `src/core/sg02DynamicBodyOwner.js` (+50 lines), which is the live PQ-137.11 mutation row's
  claimed write set, and this unit's diff contains no sim path (test files and one package.json
  script value only), so it cannot move that hash. The golden is left alone: the 47-A repin has an
  established causal-record procedure owned by the PQ-137 family, and re-recording to pass is the
  forbidden move.
- `node scripts/check-program-docs.mjs` → run after the queue/receipt edits.
- Full `check:all:smoke` was not re-run for this leaf: the change is test-wiring only (no sim,
  save, or render seam), and the smoke member this unit modifies ran green end-to-end. Escalation
  is owed if any later leaf touches a sim seam.
- Subagent review round: one integrator review (REJECT) found the package.json wiring hunk lost to
  a concurrent agent's commit on the same file, plus three should-grade and three nit findings;
  all applied (see below) and the suite re-run green.

## Review findings and dispositions

1. BLOCKER — the one package.json hunk (the three new suites in `check:feel:scenarios`) had been
   dropped when a concurrent agent committed package.json for PQ-189.00. Restored; verified the
   committed file now lists all twelve suites. Lesson recorded: pathspec commits on shared files
   must re-verify after any concurrent commit to the same file.
2. B10's fourth row (PQ-138.03 rider) no longer fails under B10's sentence; it carries its own
   message. Applied.
3. B11's per-row loop was near-vacuous (skipped unmet rows). Now pins: exactly one unmet clause
   allowed, and it must be the owed collision-source clause. Applied.
4. Dead `UNREACHABLE_BARS.B9` entry removed (B9 is checked via the kernel instrument). Applied.
5. Unused `scenarioCell`/`statusCell` fields dropped from the contract parser (the five-column
   shape assertion stays). Applied.
6. Recorded, not fixed: the registry's B3/B8 `statement` strings in `scripts/lib/bench/feelBars.mjs`
   still carry the pre-rewrite wording (the checks correctly quote the contract's rewritten
   sentences, so only receipt prose is affected). That file is inside the live PQ-137.11 mutation
   row's write set — editing it here would collide; the sync is owed to the owning packet.
7. Smoke budget: the wired suite measured 82 s wall against the 420 s step budget; the reviewer's
   shared-run optimization is not needed at these numbers.

## Tradeoff deliberately spent

Smoke wall time grows (~2.5 min of real-path scenario runs added to every `check:all:smoke`), and
the determinism tests re-run their scenarios so the same seed prints the same numbers twice. Bought
with that: a red check in the bar's own words whenever any of the twelve watched bars regresses,
instead of silence. B11's one owed clause stays visibly unmet rather than being pinned red (pinning
a known defect red freezes it just as pinning it green does).

## How this can be got wrong later

- Adding a bar to the contract without a check: the coverage contract goes red naming the bar.
- Editing a bar's sentence in the contract without updating its check: the verbatim quote goes red.
- Removing a suite from `check:feel:scenarios`: the coverage contract goes red (it is listed in no
  runner).
- Re-recording anything to pass: there is nothing here to re-record — the verdicts are computed
  from raw numbers by the pre-existing measurer.
