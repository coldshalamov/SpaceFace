<!-- LIFETIME: STABLE -->
# Agent fast loop: use the real game code without repeatedly launching the game

This is the development front door, not a new acceptance gate. The authority remains
[`VALIDATION_WORKFLOW.md`](VALIDATION_WORKFLOW.md), the existing deterministic lab, UI bench,
validation broker, and player-truth route. No simulation, screen, broker, or test oracle is duplicated.

## The practical loop

```sh
# Read-only advice from working-tree changes, or from an explicit file list. No tests or boot.
node scripts/agent-loop.mjs plan
node scripts/agent-loop.mjs plan --files=src/systems/flightV3.js,styles/screens.css

# Run exact owner regressions first, then batch relevant EXISTING lab scenarios.
node scripts/agent-loop.mjs sim flight-fixed-input flight-save-load

# Inspect the actual recorded motion, without Three.js rendering, a sector or a menu.
node scripts/agent-loop.mjs sim flight-fixed-input --trace

# Capture real screen modules at both viewports in ONE browser process; no game boot.
node scripts/agent-loop.mjs ui pause,settings --viewports=960x540,1920x1080 --walk
node scripts/agent-loop.mjs ui mobile-flight --phone

# Compare two previously produced handling JSON files. No execution of either scenario.
node scripts/agent-loop.mjs compare .devshots/agent-loop/BEFORE/001-handling.json .devshots/agent-loop/AFTER/001-handling.json
```

Replace BEFORE/AFTER with actual artifact folders. `plan` is deliberately **advice**, not complete
change-impact analysis. An unmapped path remains an explicit coverage gap. It never silently runs
an arbitrary test script, boots a browser, or claims every gameplay mode was tested.

Keep the existing browserless owner test as the innermost edit/test loop. Use a scenario only when
it answers an additional behavioral question. Do not run this whole page as a checklist per edit.

## Why this is the right intervention for this repository

The repo already has a 60 Hz authoritative simulation detached from rendering, a certifying lab
with separate repeat/save-load/differential parents, and a UI bench that mounts real screens over
stills. The expensive problem is not solved by inventing another miniature game. It is solved by
making these existing seams cheap, discoverable, informative, and hard to misuse.

The audit found specific friction in the prior implementation:

* `sf-lab.mjs` imported all scenario executors, including the Chromium comparison dependency
  graph, before even displaying help or validating a document. Dispatch is now lazy.
* `sf lab trace` increased output verbosity but called the public runner, which ran with its own
  default verbosity and discarded poses/input. The new diagnostic path actually retains both.
* The UI bench could print page/network errors, incomplete walks, or control-probe failures while
  still succeeding, and exceptional paths could skip resource cleanup. Batches now retain these
  failures, preserve completed cells, and close the resources they own.
* Capturing different viewport sizes required separate invocations. One matrix now amortizes
  server/browser startup while fresh browser contexts isolate each screen/viewport's state.
* Expensive failures were governed mainly by prose. The front door now records a fingerprint and
  stops an unchanged failed invocation instead of spending another full budget on it.

The reported “80% of agent time” is an owner observation, **not a measured profile**. There is no
claimed 5x/10x speedup in this change. `durationMs`, per-cell request counts, scenario timings and
original logs make the new costs observable. Compare matched tasks before making a speed claim.

## Headless behavior: the production owner, not a substitute physics model

`sim` loads the scenario documents once per batch and reuses the existing executor modules in one
Node process. Each scenario still creates/disposes its own authoritative runtime. It auto-selects
`run`, `repeat`, or save/load `compare` according to the scenario's declared equivalence assertions,
using the lab's existing ownership table. Mixed, unknown, or browser equivalences are rejected;
no assertion is removed and no browser is launched as a hidden fallback.

The existing public parents still choose systems, evaluate oracles and seal their own results.
The orchestration summary is not another seal. The original `*-result.json` is retained, including
its evidence class and oracle failure. A focused fixture stays focused. The production-fixture
canary stays detached production-manifest evidence, not rendered-world or public-route proof.

`--trace` deliberately uses the existing **internal diagnostic** runner with fixed trace-retention
options. It does not inject a replacement system, controller, equivalence, skipped assertion or
success result. It returns `nonPromoting: true`, `certifying: false`; a successful internal arm is
exit **4**, not acceptance-green **0**. A declared repeat assertion can remain incomplete while
its one-arm trajectory is still useful for diagnosis. A failed gameplay oracle remains a failure;
it is not hidden by a successfully written picture.

This also fixes `node scripts/sf-lab.mjs trace <scenario>` and the existing `npm run sf -- lab trace`
route. Consumers must inspect `captureOk`, the oracle and exit class; do not use diagnostic trace
as a shell `&&` acceptance gate.

### What the handling report actually measures

Each scenario writes original executor JSON, a small `*-handling.json`, and self-contained
`*-handling.html`. Open the HTML directly: no server, asset download, JavaScript runtime or game
boot. Its SVG is the recorded XZ trajectory, with tick/position/speed hover values and input-log
changes when the executor returned them. It is not a decorative reconstruction.

The numeric report includes peak/final speed, sampled path length and displacement, elapsed
**simulation** time, vector-acceleration peaks/95th percentile, wrapped angular travel and peak
absolute yaw rate. These make questions like “did the turn response change?” or “does the ship
keep accelerating?” substantially easier to inspect than a screenshot of an unknown moment.

Important limits are printed in the report, not buried in an agent prompt:

* Tick zero is sampled after the first step. There is no invented initial pose or initial derivative.
* Acceleration includes turns/collisions; it is not isolated engine thrust. Sampled trajectories can
  underestimate traveled distance. Angular differences assume less than half a turn between samples.
* Decimated traces explicitly report gaps. Missing, unordered, null or non-finite observations do
  not become reassuring zeroes. A plain certifying run may return no trace; that is “not measured.”
* These numbers do not prove fun, input-to-photon latency, animation, sound, camera feel, visual
  quality, or frame time. Do not calibrate a “fun score” against your own imagined preferences.

`compare` refuses reports with unknown/different seed, scenario digest, input digest, timestep,
execution evidence class or sample coverage. It reports descriptive deltas, not an automatic
better/worse verdict. A successful compare exit means **comparable inputs**, not accepted gameplay.
Keep identical scenarios across code revisions when measuring a tuning change. Changing the tape
and the coefficient simultaneously destroys that comparison.

For a specific control question, author or extend a scenario in `src/testing/scenarios/` with exact
thrust, release, reversal, boost and turn phases, then assert the relevant owner behavior. Reuse the
production input grammar. Do not infer button latency from two positional samples or tune a
fixture whose target is teleported by the harness. Broader policies, seeded sweeps, minimization
and additional domain metrics belong in the existing lab, not an unvalidated second simulator.

## UI: isolate the real surface, preserve the real route obligation

The existing `scripts/ui-bench.mjs` and `tools/ui-bench.html` remain the renderer. The new code only
coordinates captures and reports. Existing `--list`, `--shot`, `--viewport`, `--phone`, `--demo`,
`--query`, `--probe`, `--bg`, `--out` and serve-with-no-shot use cases remain available.

```sh
node scripts/ui-bench.mjs --list
node scripts/ui-bench.mjs --shot=station-market,station-shipworks --viewports=960x540,1920x1080 --walk
node scripts/ui-bench.mjs
```

The final command keeps the normal lightweight bench server open for interactive inspection.
Navigate directly to the printed screen URL while editing; there is no reason to photograph the
main menu through an Adventure launch. Screens still import the game's actual modules/styles.

One batch uses one server/browser, but each screen/viewport gets a fresh context. This avoids
storage/focus/listener/fixture contamination without introducing an indefinitely persistent
browser daemon. The context may still need to evaluate the screen's module graph; browser reuse
is not a claim of zero-cost page startup. Do not reuse mutable sim or DOM state across unrelated
cases simply to obtain a flattering stopwatch result.

`--walk` returns action outcomes, screenshot paths, probe errors and untried controls. If the default
24-control cap leaves controls untried, the capture is incomplete, not green; raise `--max` for a
reason and inspect those resulting states. These fixture actions are diagnostic DOM interactions,
not trusted public player input. Open every arrival/changed-state PNG you rely on. Numeric layout
findings are useful but cannot certify a beautiful, readable screen.

The report treats uncaught page errors, non-optional failed requests, failed control probes and
failed cleanup as incomplete/failed captures. Only the existing optional root release-metadata and
favicon requests are exempt. A screenshot on disk is not proof that the screen mounted correctly.
When the bench says `NOT MOUNTABLE`, use the existing `ui-look` route for that surface only; preserve
the error instead of claiming a blank frame as a success.

## Budgets, artifacts and repeated failures

All agent-loop runs own a unique ignored folder under `.devshots/agent-loop/`. `summary.json`
points at original stdout/stderr, the child process record, timings and incremental reports.
Concurrent agents do not overwrite a shared `latest.png` or `latest.json`. Failed or interrupted
batches retain completed scenario/cell evidence and explicitly list incomplete work.

The parent reuses `validationProcessControl.mjs`: hard child timeout, process-tree cleanup and
interrupt handling, not a separate process broker. Defaults are 60 seconds per whole sim batch,
120 seconds per whole UI batch, and 30 seconds per UI cell. A larger coherent batch can explicitly
raise those bounds (`--timeout-ms`, `--cell-timeout-ms`); a timeout never becomes a pass. The direct
UI bench keeps its existing 300-second upper budget by default, now for the complete cell rather
than each successive operation. Its normal cleanup is in `finally`; the parent is the hard
process-tree watchdog for a stuck browser or server.

A failure fingerprint binds the invocation, Node/platform/architecture, HEAD and changed/untracked
source bytes. HEAD represents unchanged tracked content, so the wrapper does **not** rehash the
entire repository or asset bank every invocation. A source change during a run is reported as
unbound evidence. Dirty assets disable failure reuse. Installed dependency/browser/environment
repairs not represented by source require `--retry-reason="what was actually repaired"`. That
reason is recorded. Never change timeout flags merely to spend another identical failure budget.

This is failure suppression only. There is **no passing-result cache**, no stale screenshot reuse,
no acceptance ledger, no automatic changed-test completeness claim, and no weakening of the
validation broker's candidate/runtime/route bindings.

## Final verification remains real, but is batched at the right boundary

After related owner changes and UI states are stable, run the affected public route once for that
coherent candidate. Preserve the existing player-truth gate for gameplay modes, startup/import/
asset checks for launch changes, and Browser/Electron-specific proof for shell changes. A FAIL
still blocks landing; a missing measurement is still not PASS.

Batch compatible checks, not unrelated changes that make a failure impossible to localize. If a
public-route check fails, retain its fingerprint/artifacts, reduce the owner failure to a fast
regression, fix it, then request that route again. Do not loop on “boot, wait, screenshot, guess.”

A browser fixture plus a headless test bridges much of the development loop; it does not erase
integration risk. Camera/renderer/input scheduling, GPU uploads, responsive overlays over moving
combat, platform-specific failures and actual player readability still require the rendered game.
Performance claims remain on the repository's dedicated quiet-host workflow.

## Measuring the benefit and extending without another harness sprawl

For a representative UI edit, flight tuning edit and gameplay bug, retain before/after totals for
process startup, scenario/cell time, number of full launches and time-to-first-actionable-failure.
Compare identical scopes, machines and warm/cold conditions. Count false positives and integration
escapes as costs too. A fast wrong answer is a regression in development speed.

If the owner's 80% estimate were exact and this work made that portion four times faster, Amdahl's
law gives overall speedup `1 / (0.2 + 0.8/4) = 2.5x`, not 4x. Even eliminating it entirely gives a
5x ceiling until the remaining work becomes the bottleneck. This is a planning bound, not a result.

Next investments should follow these measurements: add missing screen fixtures to the **same** UI
bench; add mode/controls scenarios and semantic response metrics to the **same** lab; compare
those scenarios against held-out public-route traces; add shrinking at the lab boundary when
long scenarios reveal failures. Share a browser across final route checks only after reset/parity
is demonstrated. Keep one real code path and several cheaper observation points.

## Regression commands and evidence boundary for this implementation

```sh
# Dependency-free harness/CLI/report tests (executor/browser doubles, NOT gameplay evidence).
node --test test/agent-loop.test.mjs test/agent-loop-cli.test.mjs

# Normal npm dependencies; real authoritative runtime, no browser/model bank.
node --test --test-concurrency=1 test/agent-loop-runtime.test.mjs test/lab-scenarios-cli.test.mjs test/lab-production-fixture.test.mjs test/lab-false-positive-guards.test.mjs
```

The focused `agent-fast-loop` CI workflow runs both layers, then the real no-boot batch command,
and uploads partial artifacts on failure. Its status must be read, not assumed from the existence
of this workflow. Browser-context doubles verify lifecycle/error propagation, not real screen
appearance. This tool-only change does not claim that gameplay performance or player feel improved.
