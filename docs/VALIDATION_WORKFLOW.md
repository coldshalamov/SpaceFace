<!-- LIFETIME: STABLE -->
# Feature validation workflow

This is the repository entry point for choosing proportionate proof. It explains how focused tests,
the deterministic gameplay lab, the validation broker, and player-facing acceptance fit together.
The selected active packet names the behavior and commands relevant to its change. Apply the cost
rules below when older packet boilerplate demands unrelated full boots, captures, or batteries.
Executable schemas, tests, and validation manifests remain the machine-enforced truth.

For program lifecycle, review closure, and receipts, also read
[`../design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../design/program/roadmap/00_EXECUTION_PROTOCOL.md).
For lab implementation work, read
[`../src/testing/lab/AGENTS.md`](../src/testing/lab/AGENTS.md).

## The short version

1. Reproduce or characterize the behavior at the narrow owner seam.
2. Run syntax/schema and the focused owner test.
3. For deterministic gameplay, use a scenario under `src/testing/scenarios/` and the correct
   `sf lab` executor.
4. Prove repeatability and save/load continuation when the feature owns those claims.
5. Run adjacent ownership/save/integration checks named by the packet.
6. When the change owns a Browser/Electron or public-route claim, run that route after its focused
   gates pass, at the coherent integration boundary described below.
7. When a unit itself claims a purely visual, accessibility, or performance fact that a number
   cannot falsify, escalate exactly that claim. Headed capture is not the default review method
   (owner 2026-09-16). Fixed-seed numbers describe handling and causal behavior; they do not prove
   that play is fun or that a rendered scene looks good. Judge the actual appearance when that is
   the claim, inspect the result, and use what you see to improve it.
   A capture-harness failure never blocks `implemented`.

Never rerun an unchanged expensive failure. Preserve its fingerprint, classify it, reduce it to a
seconds-scale regression, change the owning source or evidence, and only then request another
acceptance claim.

## Player-truth acceptance gate (binding)

Any gameplay PR attaches the player-truth verdict (`verdict.md`) and contact sheet
(`contact-sheet.jpg`) for every mode it touches. **A FAIL blocks landing.** An INCOMPLETE verdict
(a check reported UNKNOWN) must name the unmeasured check in the PR; it never counts as PASS.

```
npm run player-truth -- --mode=swarm --arena=all      # every reachable Crucible arena
npm run player-truth -- --mode=gauntlet
npm run player-truth -- --mode=adventure              # default New Game: Hitch, Helios, tutorials on
npm run player-truth -- --mode=racing                 # Circuits, first course
npm run player-truth -- --mode=swarm --gate           # PR gate: idle pass + active pass to round 3
npm run player-truth -- --mode=swarm --gate --baseline=origin/master   # before/after table for the PR
```

**Gate preset (`--gate`, required for a gameplay PR).** Round modes run two passes: an *idle* pass
(no input: kills, reward and spawn motion before input) and an *active* pass (the scripted fighter
plays from 3 s and must reach round 3; each round start is shot densely and re-probed for ship
model/LOD, thrust/yaw response, pinning and tumble). In gate mode an UNKNOWN on `player_control`,
`tumble`, `player_ship`, `round_resolution` or `round_transitions` is a FAIL ("not measured" cannot
pass a gameplay PR). No invulnerability is used.
The process exits 1 when any arena FAILs, including when another arena is ENVIRONMENT. ENVIRONMENT
is a harness failure (stale served `assets/`, or a quoted route load error such as "The authored
starter ship could not be loaded"). It is printed on its own line and is not a gameplay FAIL.
Exit 4 is used only when no arena FAILed. Exit 2 is INCOMPLETE. Exit 0 only when every arena's
verdict is PASS. An INCOMPLETE verdict lists each UNKNOWN check that caused it. `--gate=active` or `--gate=idle` runs that one pass; a bare
`--gate` still runs both. `--evidence` copies the verdict and contact sheet into
`design/program/player-truth/` and leaves `scratch/player-truth/<label>/frames/` in place for
review. `--prune-frames` deletes those frames; it is off unless passed.
`--viewports=960x540,1280x720,1920x1080` and `--hull=all` (every unlocked hull on the preparation
screen; or `--hull=<starter id>`) repeat the run per combination. `--baseline=<ref>` re-runs the same
harness on `<ref>`'s game in a temporary `.worktrees/` checkout (removed when done) and prints a
before/after table. That checkout inherits the fleet sparse pattern (`!/assets/`). The harness then
links the shared `share-assets` checkout when its asset commit matches `<ref>` and
`git status --porcelain -- assets` is empty there. `diff-tree` ignores working-tree edits, so a dirty
`assets/` is not linked. Otherwise it extracts `assets/` from `<ref>` (about 3.9 GB). That extract
starts only when the baseline worktree's filesystem has at least 8 GB free; below that it prints
`HARNESS ENVIRONMENT: not enough disk to extract baseline assets` and does not write the archive.
Exit 4 applies when that is the only failure. `node scripts/player-truth/compare.mjs <before dir> <after dir>` builds one
from two existing runs. `vfx_coverage` grades only combat VFX, from a per-pixel diff with the
combat additive layers hidden; `backdrop_coverage` grades the deep field / nebula / planets apart.
Those per-pixel splits skip a sample taken while a `#screens` overlay is visible, or before the
flight phase, and the verdict reports how many were skipped. Swarm preparation that is waiting on
Launch round 1 fails within about 30 s when a different `#screens` screen stays up, and the route
line names it (`unexpected screen: REARM`), instead of sitting on the 600 s wait.

The harness (`scripts/player-truth/`) walks the real public route in a rendered Chromium with
trusted keyboard/mouse input (idle first, then thrust/yaw probes, then a simple fighter or flyer),
samples live telemetry through the observer-only `src/testing/playerTruth/reader.js`, and writes
`scratch/player-truth/<mode>[-<arena>]/{verdict.md,contact-sheet.jpg,verdict.json,trace.json.gz,frames/}`.
`--evidence` copies the compact verdict and sheet into `design/program/player-truth/<label>/`.

Before the browser starts, the harness checks that served `assets/` match `git ls-tree HEAD`
(every blob's size, plus a content hash of files ≤64KB, every `render-package.json`, and the
starter-hull `render.glb` files, and one manifest fetched through the bench server). `design/`
is not fetched by the route, so it is not graded. A mismatch aborts with `HARNESS ENVIRONMENT: assets stale vs HEAD` and exit 4 when that is the only result.
The same exit quotes a player-facing load error ("The authored starter ship could not be loaded…",
a prepare/boot failure of the same family) instead of grading it as a route FAIL.

`readability` is PASS or FAIL once any of enemy, asteroid, or projectile has at least 5 on-screen
samples. It fails when more than half of those samples have ΔL < 8 against the local backdrop, or
when a pair that both cleared 5 samples separates by less than 1.0. Separation is colour distance
over spread, plus a silhouette term from the size ratio, plus 1.5 when one class's rim matches the
declared threat hue `0xff1a3a` (the `swarm:threat-ring` material, Lab L ≈ 54, hue ≈ 30°) and the
other does not. The hue is the mean of mid-band pixels that clear a chroma floor and differ from
the local backdrop by ΔE ≥ 12, so an orange backdrop cannot paint an unmarked rock into that hue.
A bright rim (L ≥ 75) does not buy that credit. The crimson ring is below L 75, so a brightness
rule does not credit it either. Projectile visibility is the same backdrop-contrast rule.
UNKNOWN only when no combat class reaches 5 samples. The contact sheet keeps up to four of the
worst frames for that check.

`loadout` (Swarm and Gauntlet preparation) says whether every fitted or offered item has an
explanation and is relevant to the mode. Zero armory cards are either "the game offered nothing"
(empty-shelf sentence and a zero category count) or "the harness failed to read the screen" (a
count or a name the card selector missed). That sentence leads the measured column, with the
shelf's own words quoted, so a PASS is not a bare "0 irrelevant". An offer's explanation is the
sentence the player can read: the card blurb when it is on screen, otherwise the armory reading
panel when that panel matches the lit row's own blurb. A panel that is up but names a different
sentence is an offender (`reading panel does not match lit row`), not an explanation. A blurb the
rail hides on another row counts only once that match holds. A refit contrast the player can see
counts. A hidden refit contrast counts only when a lit row is showing its own contrast, and the
verdict prints `row-on-select (inferred)`. A contrast clipped for the screen reader
(`.orr-hp__contrast--drawn`) is not an explanation. A preparation line that claims a fit count but names no item is a FAIL. A vacuous
"0 offers read" is not a PASS.

`sim_stalled` fails when sim time advances less than 0.5 s across 60 s of wall time while the run
phase stays active and the boot overlay is gone (mode is not `loading`). The run stops then. It
does not sit until `--wall`. `play_interrupted` fails when any screen other than the flight HUD
opens during that active phase without the script opening it. The line names the screen id, the
last input, and, when that input was a click, the viewport coordinates and the DOM element under
them (`document.elementFromPoint`, read before mouseup). A fire click that lands on a HUD control
is reported. The driver still aims at the hostile. A draft screen that is already up as the phase
becomes active has 3 s to clear. Both checks are N/A when play never started and UNKNOWN when play
started but was not watched.

`offscreen_marker` grades the Wave G4 edge chip the player sees (`.sf-threat-halo__slot--arc`), not a second radar and not `weapons.js`. A marker whose center is more than 48 px from every screen edge fails. A marker while every hostile is in frame fails. One off-screen hostile and one marker must name the same side when that hostile is outside on one axis. Off-screen hostiles with no chip stay UNKNOWN: the HUD marks shooters inside the threat halo, and the trace cannot see that. No off-screen hostile is N/A. The check is not gate-strict.

- **GPU (preferred):** add `--headed` on a machine with a real GPU. The verdict records the WebGL
  renderer string. Frame time is graded here on absolute numbers: p99 ≤ 50 ms and 0 long tasks ≥ 250 ms.
- **Browser:** Playwright's bundled Chromium first (`npx playwright install chromium`), then
  `CHROME_PATH`, `/opt/google/chrome/chrome`, or `google-chrome`/`chromium` on PATH.
- **Software GL (fallback):** the default headless run uses SwiftShader. It plays the same route at a
  fraction of real speed (sim time is the clock, so bounds still hold) and takes a few minutes of wall
  time per bounded run. Absolute frame times are labeled `software-renderer evidence` and are not a
  PASS/FAIL. With `--baseline`, frame time FAILs only on a regression: p99 above 125% of baseline and
  above baseline + 100 ms, or long-task count above 125% and above baseline + 30. Each run records
  `os.loadavg()` at start and end in `verdict.json` (`meta.loadavg`). When the mean of the
  1-minute samples differs by more than 30% of the louder side, the regrade is ADVISORY instead of
  FAIL. On this shared box the 1-minute load swings between about 5 and 12 during a gate, which is
  more than 30% for most head/baseline pairs, so software-GL `frame_time` will usually be ADVISORY
  and will not gate. That is accepted for SwiftShader. The compare output still prints each advisory
  row, including the head p99, the baseline p99, and the long-task counts, so a large blowup stays
  visible. It is not a REGRESSED row and it is not a FAIL. A missing load does not claim noise.
  Without a baseline measurement the check stays UNKNOWN and is named in the INCOMPLETE cause list.
  Long-task counts are always kept. The verdict says SOFTWARE GL.
- Bounds are flags: `--rounds` (default 3), `--duration=<sim s>` (Swarm 180, Adventure 300),
  `--wall=<minutes>`, `--idle=<sim s>`, `--seed` (house seed 4242).
- Check logic is fixture-tested without a browser: `npm run check:player-truth`. Thresholds live in
  `THRESHOLDS`/`MODE_DESIGN` in `scripts/player-truth/checks.mjs`; changing one is a reviewed
  design decision, never a way to turn a verdict green.

## Cost ladder

Choose the smallest layer that can answer the changed behavior's question. Escalate only for a
named unresolved claim, a failed/conflicting check, or a material risk. Run the lower gates an
affected route actually requires; the ladder is not a checklist every edit must climb.

| Layer | Proves | Typical surface |
|---|---|---|
| L0 | syntax, schema, imports, data shape, changed-doc links | `node --check`, validators, `git diff --check` |
| L1 | seconds-scale owner behavior | focused `node --test`, pure checks, one lab scenario |
| L2 | determinism, continuation, ownership, adjacent integration | `sf lab repeat`, `sf lab compare`, focused aggregates |
| L3 | route claims a unit actually asserts: Browser/Electron behavior, rendered feedback, public input, accessibility | affected public route or validation-broker manifest |
| L4 | matched performance, soak, held-out, and release claims | packet-declared performance/release cells |

Diagnostic doors, not gates: `npm run probe:heap-verify`, `npm run probe:main-thread`, and `npm run probe:crucible-cpu` name a heap leak, a main-thread owner, and a Crucible CPU owner. They stay out of `check:baseline`.

### When to boot, and when to stay at the owner seam

| Change or claim | Development loop and close |
|---|---|
| Planning/docs, routing metadata, or a mechanical edit with no plausible runtime effect | Changed links/schema/dispatch as applicable and `git diff --check`; no game boot |
| Gameplay tuning or connections expressible in a fixture | Changed-owner test and one focused production-system scenario; repeat/save comparison only for determinism or continuation claims |
| Startup, registry/import wiring, shipped asset admission, Browser/Electron shell, save-return, or an ordinary UI action/transition | Focused owner checks, then the affected public route; browser success does not certify Electron |
| Appearance, camera composition, visual feedback, or interaction readability | Mount or set up the affected real surface, inspect its rendered result and changed controls, improve it; boot the whole game only when that surface requires it |

Use `check:playable` for its boot/launch/live-hull/thrust/save-return claims at a coherent gameplay
integration boundary, or to resolve a failed/conflicting route. It is not required after every leaf
edit. It does not cover every Adventure or Crucible action: select or extend the existing route
that actually exercises the changed transition. Batch compatible changes before one route run;
an unresolved route failure remains red and must be handled, not hidden by batching.

Reuse an already observed result when the relevant owner, fixture, harness, runtime, and route
inputs are unchanged. Name its scope and say when it predates the current edit. Do not relabel
focused or detached evidence as a fresh rendered/public-route pass. New changes to a covered owner,
a conflicting observation, or a candidate-bound release/performance claim need fresh affected
evidence. Absolute performance belongs to the quiet-host program; workstation diagnostics may
identify a cause but cannot substitute for its matched captures.

Do not run the repository-wide `npm run check` while a focused owner failure is still red. Do not
use Browser/Electron as an implementation debugger when a deterministic owner-level reproduction is
possible.

**Long-horizon session batteries are L4 diagnostic instruments, never per-change gates.** The
playthrough battery (`scripts/run-actual-game-playthrough.mjs`, multi-hour scripted sessions)
exists to discover session-SHAPE defects that no shorter proof can express — it found the 2026-09
hour-3 collapse that way, once. It does not verify ordinary changes: hours of compute and
log-mountains re-proving what focused fixtures prove in seconds is verification theater, and
agents imitating each other's battery reruns is how the culture spreads. The rule: default gate
is L0–L1; run one targeted session only for a session-shape claim (encounter pacing, spawn policy,
economy phase targets, director cadence, law-event wiring) that no focused fixture can express.
Use one archetype, one seed, and an explicit affected simulation-time window. A starter-opening
claim covers that opening; the historical three-hour collapse question does not impose a three-hour
default on it. Never make a fixed multi-session matrix a routine step.

## Continuous integration: four parallel groups

`.github/workflows/check.yml` runs the repository-wide matrix as **four parallel jobs** instead of
one. It used to be a single sequential job — ~280 commands behind a Playwright Chromium install,
under a 35-minute ceiling — so every run ended cancelled or timed out and a PR's `check` was red for
reasons unrelated to the PR. A gate nobody trusts is the same as no gate.

The matrix source is unchanged: `scripts/check-ci-report.mjs` still expands `package.json`
`scripts.check`. What is new is that it can run one **group** or one **shard** of that expansion.

| Job | Group | Holds | Installs a browser |
|---|---|---|---|
| `static` (sharded) | `static` | pure Node: data refs, schema, source scans, UI/label contracts, asset manifests. Also the thruster-history, visual-continuity, and program-control-plane quick steps | no |
| `sim` | `sim` | determinism, the 47-A golden envelope, save/reload continuation, massline | no |
| `feel` | `feel` | the FEEL_CONTRACT handling surface, plus `check:feel:scenarios` and `check:fun-bench` as explicit steps (they are not members of the `check` chain) | no |
| `browser` | `browser` | every command that launches Playwright/Chromium, or raw Chrome over CDP | **yes — only here** |

A fifth job named `check` depends on all four and is the single status a push or PR reports. It runs
with `if: ${{ !cancelled() }}` and fails unless every group succeeded, so a failed group reads red
rather than skipped. Each job uploads its `scratch/check-ci-report/` tree as an artifact even on
failure, so a red run can be read instead of guessed at.

### Running one group locally

```powershell
# What is in each group, and whether anything is unclassified. Fast, runs nothing.
node scripts/check-ci-report.mjs --list-groups

# One whole group.
node scripts/check-ci-report.mjs --group=static

# One shard of a group — what the `static` job does on each of its runners.
node scripts/check-ci-report.mjs --group=static --shard=1/3

# Stop at the first failure instead of collecting the whole set.
node scripts/check-ci-report.mjs --group=sim --fail-fast
```

`--shard=<i>/<n>` is 1-based and assigns round-robin by position, so `n` shards cover the selected
list exactly once with no overlap. `--group` and `--shard` compose: the group filter runs first, then
the shard splits what is left. `--smoke` and `--fail-fast` are unchanged. The report JSON records
`group`, `shard`, and `matrixCommandCount`, so an artifact says which slice produced it.

Do not run `--group=browser` casually on a workstation that is already driving headed captures;
those commands each launch a real browser and contend for the machine.

### The partition must stay exact

`test/check-ci-report.test.mjs` asserts the four groups cover the matrix with no overlap and that
**every** command classifies. A command the classifier cannot place is a hard error, not a warning:
unplaced, it would run in none of the four jobs while the gate still went green.

So when you add a check to the `check` chain, run `--list-groups`. If it lands in the wrong group —
or in none — fix the classifier in `scripts/check-ci-report.mjs`, near `COMMAND_GROUPS`. Group
membership is decided from the **resolved leaf command**, not from the script's name: `check:sg06:live-shadow`
and `check:47a:live-branch` read browser-ish and are pure Node, while `probe-authored-assets-live`
launches Chrome without ever mentioning Playwright. Verify by following the leaf script's relative
imports for `load-playwright`, `from 'playwright'`, `chromium.launch`, or a raw
`--remote-debugging-port` spawn — never by the name alone.

## Discovery and certification are different jobs

Certifying gates fail fast: once a required invariant is false, the candidate is not admissible.
Discovery runs optimize for causal information. A route driver may collect independent recoverable
failures—state comparisons, receipt checks, residency bounds, and other observations that do not
invalidate later observation—and report them together at the end.

Collect-all diagnostics must:

- label every failure with phase, expected, actual, and the owning observation;
- continue only when actor control and observer truth remain valid;
- abort on boot failure, unreachable route, lost actor authority, corrupt state, or broken observer;
- remain explicitly diagnostic and non-promoting;
- preserve each failure fingerprint for reduction to a focused regression;
- never convert one expensive route into an open-ended retry loop.

The current World Site route limitation and extraction boundary are tracked in
[`../src/testing/lab/KNOWN_GAPS.md`](../src/testing/lab/KNOWN_GAPS.md). Do not copy a packet-specific
route or introduce a second driver while closing it.

## Deterministic gameplay lab

The public CLI is:

```powershell
npm run sf -- lab --help
```

Scenarios use `spaceface.simScenario.v1`. The schema and compiler live at
[`../src/contracts/simScenarioSchema.js`](../src/contracts/simScenarioSchema.js); runnable examples
live under [`../src/testing/scenarios/`](../src/testing/scenarios/).

### Choose the executor from the claim

```powershell
# Validate and compile only.
npm run sf -- lab validate <scenario>

# One execution arm: metrics, invariants, event/holds assertions.
npm run sf -- lab run <scenario>

# Same seed and input across repeated executions.
npm run sf -- lab repeat <scenario> --runs 3

# Uninterrupted versus save/load continuation.
npm run sf -- lab compare <scenario>

# Node versus focused Chromium host. This launches Chromium and is diagnostic unless
# invoked through the broker-managed acceptance route.
npm run sf -- lab compare <scenario> --runtimes node,chromium
```

Use `run` only when every declared assertion can be decided by one execution arm. Equivalences such
as `run-eq-repeat`, `uninterrupted-eq-save-load`, and Node/Chromium parity are owned by their parent
executors. A plain `run` must return incomplete rather than fabricate those results. Use `repeat` or
`compare` for the corresponding claim.

### Fast setup and useful agent readouts already exist

The compiled scenario supplies the seed, tick budget, sector/fixture, entity profiles, starting
positions/fittings, parameter overlays, and tick-indexed tape. `sf lab trace <scenario>` exposes
the executed trajectory; run output names metric values/deltas, the first bad tick, failed
assertions, live systems, and aliases. Use a short local case to compare the actual input → motion
→ contact → consequence that changed, rather than rerunning an entire opening to reach it.

[`../src/testing/motionScenarios.js`](../src/testing/motionScenarios.js) already exposes individual
M1/M2/M3/M8 runs. Its [`motionTelemetry.js`](../src/testing/motionTelemetry.js) reports applied
controls, body trajectories and phases; handling readouts include onset/settle time, stopping
distance, overshoot, gates missed, heading/velocity lag, and collision recovery. Existing
[`verb-bench modules`](../scripts/lib/bench/scenarios/README.md) use production physics and report
seconds, screen depths, hull lengths, and fractions of cruise/hull. Select the affected scenario
through the existing runner's `scenarioIds` seam; the whole fun-bench matrix is not a tuning loop.
Treat those values as observations and design bounds, not a numerical certificate of fun.

The existing [`session observer`](../src/observability/sessionObserver.js) is an opt-in recorder:
callers invoke its input/sim/event/render hooks and drain its buffer. It can record applied input,
state samples, tick/time-stamped events, asset exposure, and frame samples; it does not automatically
observe every live route. Use relevant causal events alongside the changed-owner readout and name
missing hook/coverage gaps. A motion sample is not evidence that a player understood a cue.

The debug-only [`live-route bridge`](../src/testing/lab/liveRouteBridge.js) already provides paused
fixed-tick stepping, raw flight-key events, snapshots, checkpoints, and one render update. Its V1
setup supports player-only flight and explicitly rejects non-player entities, attachments, and
relations. Detached Chromium parity also supports a limited focused flight bundle. Neither is a
complete starter-region/public-UI executor. If a concrete development row needs a missing phase
setup or readout, extend that existing owner narrowly in the same row. State fixture setup and
observation limits explicitly, execute consequences through production systems, and keep ordinary
route reachability as its own claim. Do not build another simulator or generic agent platform.

CLI exit classes are stable:

| Exit | Meaning |
|---:|---|
| `0` | pass |
| `1` | product/assertion failure |
| `2` | blocked |
| `3` | infrastructure failure |
| `4` | invalid or incomplete configuration/claim |
| `5` | nondeterminism/parity failure |

Flags that inject observer or save/load behavior into a direct `run` use an internal
non-certifying path and cannot return a promoting green result. Prefer authored scenario input and
the fixed public parent executors.

### Scenario-authoring checklist

- Copy the closest existing scenario; do not invent field names from prose.
- Use a fixed seed, fixed tick count, tick-indexed input tape, stable aliases, and quantitative
  assertions.
- Exercise real production system modules through the admitted focused bundle.
- Name the smallest system/fixture surface that can prove the behavior.
- Add at least one assertion that can actually fail; zero-consumption and deferred equivalence fail
  closed.
- Use simulation time and seeded RNG. Do not add wall-clock gameplay conditions.
- Validate the document before diagnosing runtime behavior.
- Add or update a focused `node --test` contract when introducing a new scenario capability,
  metric, entity profile, or oracle.

## Evidence classes

Evidence class is derived from what executed, not trusted from the scenario label. The lab may
demote an authored claim when the runtime used a focused or otherwise weaker path.

| Class | Supports | Does not support |
|---|---|---|
| `kernel` | a small pure owner invariant | integrated gameplay or route behavior |
| `focused-fixture` | named production systems under a deterministic focused scenario | full production-manifest behavior |
| `production-fixture` | the Node-safe production manifest under the declared profile | rendering, UI, or ordinary player reachability |
| `browser-parity` | equivalent compiled scenario behavior between Node and a supported Chromium host | rendered presentation or the normal game route |
| `public-input` | public input grammar over an admitted focused system set | whole-game or visual acceptance |
| `public-route` | ordinary live route with the required visible semantics | release/performance claims not captured by that cell |

`browser-parity` is not `public-route` when the host runs with rendering detached. Likewise,
`focused-fixture` cannot claim `production-fixture` merely because its systems are real production
modules. Consult the live runner and `KNOWN_GAPS.md` for the profiles the CLI currently supports.

Seeded soak/fuzz is an execution method, not automatically a stronger evidence class. It retains the
class of the systems and host that actually ran while adding longer or broader input coverage. Do
not claim a new `soak` class until the evidence implementation can derive and enforce it.

When a parent executor returns child-arm detail marked `internal-test`, judge the parent
`repeat`/`compare` result and its bound digests, not an isolated child narration.

## Authoritative runtime manifest

[`../src/runtime/authoritativeSystemManifest.js`](../src/runtime/authoritativeSystemManifest.js) is
the source of truth for production system IDs, initialization order, update order, slot markers,
and Node-safety. Browser registry and authoritative runtime creation resolve from that manifest.

Focused bundles are resolved from
[`../src/testing/lab/systemBundles.js`](../src/testing/lab/systemBundles.js). Do not describe a
focused result as full-game proof. See
[`../src/testing/lab/KNOWN_GAPS.md`](../src/testing/lab/KNOWN_GAPS.md) for the currently available
profiles, limitations, and reproduction commands.

## Expensive acceptance and the validation broker

Broker-managed routes are declared under
[`../scripts/validation-manifests/`](../scripts/validation-manifests/). Use a package command when
one exists. Otherwise invoke the named manifest from the active packet:

```powershell
node scripts/validation-broker-cli.mjs --manifest <manifest-id>
```

The broker:

- runs manifest-declared fast gates before issuing/consuming acceptance authority;
- executes `requiresScenario` as a fresh fast gate and includes its path in the scenario digest;
- binds the claim to candidate, scenario, harness, runtime, and manifest digests;
- persists a one-use claim and disk ledger;
- enforces `maxLaunchesPerCandidate`;
- records failure fingerprints and refuses unchanged repeats;
- owns process timeout/cleanup and launch accounting.

`blocked_repeat`, `cached_unchanged`, exhausted launch quota, stale claim, and failed fast gate mean
**no acceptance launch**. Do not bypass them by calling the probe directly, renaming the cell,
editing unrelated files to perturb a digest, or deleting broker artifacts.

`--diagnostic` is non-promoting and does not consume acceptance quota. It is for one discriminating
investigation, not an unlimited retry lane. A direct probe is diagnostic unless the execution
protocol records why no broker is possible and the integrator creates an equivalent one-use claim.

### After an expensive failure

Classify the evidence before another launch:

| Class | Next action |
|---|---|
| `PRODUCT` | reproduce at the owner seam, observe fail, repair, observe pass |
| `HARNESS` | repair the actor/observer/probe and invalidate only affected evidence |
| `ENVIRONMENT` | prove the environment fault independently; use one clean replacement environment |
| `NONDETERMINISM` | hard stop; reduce to deterministic evidence before another route run |
| `STALE_BASELINE` | deliberately update the contract; never rewrite a golden blindly |
| `OUT_OF_SCOPE` | record a follow-up unless it invalidates the selected route. **Does not apply to a red check** — see below |
| `INHERITED_RED` | see [`00_EXECUTION_PROTOCOL.md` §7](../design/program/roadmap/00_EXECUTION_PROTOCOL.md) |
| `UNKNOWN` | fail closed and collect one discriminating diagnostic |

`00_EXECUTION_PROTOCOL.md` §7 owns the full disposition rules, including the requirement that a red
check is repaired rather than inherited. Follow that file when this table is less specific.

An unchanged cell and failure fingerprint cannot authorize another identical attempt. Repetition is
not investigation.

### Packet requirements before L3

The active packet records:

- the scenario path and the public executor that owns its claim;
- `requiresScenario` in the broker manifest when that scenario is eligible;
- an explicit exception naming the unrepresentable browser-only claim or missing lab/schema seam;
- seeded soak invariants only when the unit owns a long-horizon stability claim that its shorter
  fixture cannot answer;
- the rendering, public-input, accessibility, performance, and visual judgments that genuinely
  remain browser-only.

A scenario exception is a gap declaration, not permission to run the same expensive discovery route
repeatedly.

## Adding or changing validation infrastructure

| Change | Start here | Minimum focused proof |
|---|---|---|
| Scenario/schema/compiler | `src/contracts/simScenarioSchema.js`, `src/testing/scenarios/` | `test/sim-scenario-schema.test.mjs` plus affected lab tests |
| Runtime/oracle/checkpoint | `src/testing/lab/` | nearest lab test plus false-positive regression suites |
| System identity/order/profile | `src/runtime/authoritativeSystemManifest.js` | `test/authoritative-manifest.test.mjs` and registry/sim owner tests |
| Broker/claim/fingerprint/process control | `scripts/lib/validation*.mjs` | broker/process-control tests and affected manifest tests |
| New expensive route | `scripts/validation-manifests/` plus a public package command | manifest fast gates, broker claim enforcement, cleanup proof |

Do not create a second simulator, alternate system list, private acceptance launcher, or evidence
class in feature code. Extend the owning schema/runtime/broker surface and document the limitation
until its proof path is real.

## Context-compaction recovery

After context compaction, do not continue from remembered check names or “green” claims. Re-read:

1. root `AGENTS.md`;
2. this workflow;
3. the selected active packet and its exact validation commands;
4. the nearest owner `AGENTS.md`;
5. `src/testing/lab/KNOWN_GAPS.md` when using the lab;
6. current Git diff, candidate revision, and broker/failure receipt.

Resume at the lowest unproven layer. Never infer that a prior worker's green output belongs to the
current candidate digest.
