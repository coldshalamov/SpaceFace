<!-- LIFETIME: STABLE -->
# Feature validation workflow

This is the repository entry point for choosing proportionate proof. It explains how focused tests,
the deterministic gameplay lab, the validation broker, and player-facing acceptance fit together.
The selected active packet still names the exact required commands. Executable schemas, tests, and
validation manifests remain the machine-enforced truth.

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
6. Only after lower layers pass, use the relevant broker manifest for Browser/Electron acceptance.
7. Treat visual feel, accessibility, and performance as separate player-route claims; a headless
   green result does not prove them.

Never rerun an unchanged expensive failure. Preserve its fingerprint, classify it, reduce it to a
seconds-scale regression, change the owning source or evidence, and only then request another
acceptance claim.

## Cost ladder

Run upward. A higher layer never substitutes for a lower layer.

| Layer | Proves | Typical surface |
|---|---|---|
| L0 | syntax, schema, imports, data shape, changed-doc links | `node --check`, validators, `git diff --check` |
| L1 | seconds-scale owner behavior | focused `node --test`, pure checks, one lab scenario |
| L2 | determinism, continuation, ownership, adjacent integration | `sf lab repeat`, `sf lab compare`, focused aggregates |
| L3 | ordinary Browser/Electron route and visible/accessibility behavior | validation-broker manifest and current artifacts |
| L4 | matched performance, soak, held-out, and release claims | packet-declared performance/release cells |

Do not run the repository-wide `npm run check` while a focused owner failure is still red. Do not
use Browser/Electron as an implementation debugger when a deterministic owner-level reproduction is
possible.

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
- seeded soak invariants for physics-heavy work, even when the soak executor remains a tracked gap;
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
