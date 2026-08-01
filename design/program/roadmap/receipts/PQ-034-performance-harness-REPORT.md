<!-- LIFETIME: EVIDENCE -->
# PQ-034 PERF-00 native-closure report

```yaml
packet: PQ-034
dispatchUnit: PQ-034.native-closure
lifecycleClaim: implemented
acceptanceClaim: focused_green
terminalDisposition: IN_PROGRESS
claimBase: 070064b4ff9aff9c4addb54d876c7ad877ba8e53
activityAuthorityCandidate: 52cd5eb3949bfb0e88fd8a2c10d37cd1c149fe65
headedRuntimeLaunched: false
performanceEvidenceClaimed: false
protectedWorktreeMutated: false
leasesReleased: false
```

## Frame-linked GPU authority slice

Current master now owns one monotonic attribution chain for display frames, render frames, simulation
ticks, GPU query attempts, and post-target allocation events. A GPU query copies its origin before
the driver `beginQuery` call, so later mutation of the caller's reusable frame object cannot rewrite
delayed evidence. Every bounded terminal entry carries query ID, label, display frame, render frame,
simulation tick, terminal state, elapsed time when completed, and an explicit reason when relevant.

The terminal contract covers delayed completion, pending reset, disjoint invalidation, context loss,
nested-begin refusal, queue backpressure, disabled/drop paths, driver begin/end/read failures, zero
results, and bounded drain timeout. Renderer and bloom call `end()` only when that exact `begin()`
succeeded, preventing a refused nested measurement from closing a different active query. Post-target
allocations made inside a render copy the same frame origin; allocations outside a render carry null
origin rather than inheriting stale frame identity.

## Focused evidence

- characterization: the new six-test contract failed 0/6 before implementation because frame/query
  identity APIs, terminal records, and `didBegin` discipline were absent;
- `node --test test/performance-runtime-identities.test.mjs test/gpu-timer-attribution.test.mjs
  test/performance-attribution.test.mjs test/performance-closure-contracts.test.mjs` — PASS 29/29;
- full current PERF-00 focused suite including both new files — PASS 119/119;
- `npm run check:perf-counters` — PASS 29/29;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:baseline` — PASS 10/10 in 50.822 s.

## Tracked manifest-registry slice

The validation broker CLI now derives exactly one module path from a safe manifest ID and delegates
to `loadValidationManifestById`. Before any candidate module executes, the registry proves a
stage-zero Git index entry with regular-file mode, rejects an on-disk symlink or non-file, resolves the
real path inside the manifest directory, and then requires an object default export whose ID matches
the request. A manifest may remain deliberately undiscoverable with `registryEnabled: false`.

That explicit stop is set on both deferred PQ-025 manifests. They remain created-but-unexecuted and
cannot be made broker-runnable merely because their files are tracked; their packet entry conditions
must be closed before a later integrator removes the stop. Existing active-manifest contracts now
load their actual tracked modules instead of matching strings in a hard-coded CLI table.

- characterization: all eight existing CLI-table assertions failed after the table was removed,
  identifying their stale source-string coupling before the assertions were migrated;
- `node --test test/validation-manifest-registry.test.mjs` — PASS 7/7, including pre-import
  rejection of an untracked top-level side effect and live PQ-025 disablement;
- active manifest migration set (`PQ-007`, `PQ-019A`, `PQ-019C`, `PQ-020`, `PQ-021`, `PQ-022`,
  `PQ-023`, `PQ-024`) plus registry contracts — PASS 92/92;
- all current `*manifest*.test.mjs` contracts — PASS 161/161;
- `test/validation-broker.test.mjs` — PASS 33/33;
- `npm run check:baseline` — PASS 10/10 in 47.218 s;
- direct CLI rejection of `pq025-gold-corridor-smoke` — exit 1 with
  `VALIDATION_MANIFEST_REGISTRY_DISABLED` before broker construction;
- no broker claim, browser, Electron, or performance capture was launched.

## Paired runtime-driver and broker-authority slice

`runPerformanceAttributionProbe` now owns one Browser/Electron matrix rather than a Browser-only
branch. Browser still owns the visual probe server, system browser, page issue tracker, canonical URL
tracker, and `closeOwnedResources`; Electron uses the existing isolated launcher, application-wide
issue tracker, canonical-root tracker, process monitor, and `closeOwnedElectronRuntime`. Both paths
then execute the same public route, scenario ordering, preparation/restoration, sampling, failure
snapshot, artifact policy, and measurement-disable contract.

Two tracked manifests pin distinct one-use runtime claims and artifact roots over an identical
scenario/production/regression/harness set. The CLI resolves the exact tracked manifest for its
runtime. The library runner consumes the claim before `allocateOutputDir` and before either launcher;
direct CLI and library acceptance calls without a claim both reject in under one second. Diagnostic
authority cannot be supplied by a caller as a promotable object: the runner derives it from the
broker helper and writes no primary evidence. A passing accepted run may publish a claim/digest-bound
`evidence.json` only after closure validation and owned cleanup.

- characterization: the new two-file contract failed at module load because neither paired manifest
  nor the runtime plan existed; the direct-runner guard assertion then failed until claim consumption
  moved into the library boundary;
- paired manifest/runtime contracts — PASS 6/6, including real tracked lookup plus direct CLI and
  direct library no-claim rejection before launch;
- PERF-00 changed-lane suite — PASS 44/44;
- validation broker plus manifest registry — PASS 40/40;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 51.211 s;
- no broker claim, browser, Electron, GPU capture, or performance conclusion was spent.

## Source-candidate pairing and final-acceptance slice

The paired manifests now declare one explicit production New Game save identity, one procedural
public-player-route input identity, and one unmodified production-camera identity. The broker combines
those declarations with exact Git worktree, build, production, regression, harness, and scenario
digests into `sourceCandidateDigest`, excluding runtime kind and manifest ID. It then folds the shared
digest into the ordinary runtime-bound `candidateDigest`; claims therefore invalidate on any exact
source candidate change while Browser and Electron still receive distinct one-use candidates.

Passing accepted evidence uses `spaceface.performanceClosureAcceptance.v2` and exposes the shared
source digest, runtime candidate, and the actual content hash of `performance-windows.json`. The v2
final arbiter consumes explicit Browser/Electron evidence pairs, revalidates each raw artifact from
disk in the CLI, and fails closed on source mismatch, candidate aliasing, raw-trace aliasing, wrong
runtime/commit, missing claim authority, or digest disagreement.

- characterization: the paired-manifest digest assertion failed because all source/worktree identity
  fields were absent; final acceptance ignored all three injected pair failures before implementation;
- focused paired-manifest/final-acceptance characterization set — PASS 8/8 after implementation;
- broker, paired runtime, closure-publication, and final-acceptance set — PASS 48/48;
- full current PERF-00 focused suite — PASS 127/127;
- no broker claim, browser, Electron, GPU capture, or performance conclusion was spent.

## Background-job identity slice

The common display/render/simulation/GPU chain now includes the real asynchronous authored-upgrade
owner. Measurement opt-in creates a monotonic background-job token with immutable start/end origins;
the ordinary disabled path performs no record allocation. Evidence storage is fixed at 128 records,
IDs survive reset, and disable/reset/overflow/refusal states remain explicit rather than disappearing.
`partsLibrary` binds the token at its existing serial start/finish boundary without changing queue
ordering, concurrency, decode, composition, or visual publication.

The paired attribution route and current profiler enable the gate inside their existing measurement
window. Closure CPU evidence carries the bounded job report, cleanup proves the gate is off, and final
acceptance rejects missing, disabled, active, overflowed, refused, non-monotonic, or unterminated job
evidence.

- characterization: three focused tests failed because the perf API and queue binding did not exist;
  the final arbiter also accepted a matrix with the job report deleted;
- identity/queue/final-acceptance focused set — PASS 23/23;
- full current PERF-00 suite plus authored queue ownership — PASS 133/133;
- `npm run check:perf-counters` — PASS 29/29;
- `npm run check:perf-packets` — PASS 39/39;
- no broker claim, browser, Electron, GPU capture, or performance conclusion was spent.

## Measurement-validity slice

Closure reports now recompute a versioned measurement-validity verdict from the evidence they carry.
The verdict rejects dirty/drifting worktrees, active or unknown release/authoring/foreign-browser
activity, fallback or software renderer identity, unavailable/disjoint/incomplete GPU timers, active/changing program or
asset-admission state, route/restoration drift, incomplete cleanup, and non-empty or missing runtime
error arrays. A stale or forged declared verdict disagrees with recomputation and also fails.

The bounded boundary census records exact matching process names/PIDs for Blender, Chrome, Edge,
WebView2, and Electron without polling during the route. The live attribution window retains the GPU
timer's full capture-validity, invalidation, query-count, and bounded terminal record. Passing accepted Browser/Electron evidence carries measurement validity
into final acceptance, which rejects both invalid runtime evidence and invalid matrices.

- characterization: the focused contract first failed at module import because no validity evaluator
  existed; the probe contract then failed because the live window discarded capture-validity fields;
  final acceptance initially ignored an injected invalid runtime verdict;
- closure validity, production-field retention, and final-acceptance set — PASS 24/24;
- full current PERF-00 focused suite plus authored queue ownership — PASS 132/132;
- program docs — PASS with 0 warnings; program-control tools — PASS 9/9;
- `npm run check:baseline` — PASS 10/10 in 57.902 s;
- injected contamination, fallback renderer, disjoint timer, and pipeline-cache drift each fail with
  a stable explicit reason;
- no broker claim, browser, Electron, GPU capture, or performance conclusion was spent.

## Noise-aware improvement slice

The versioned improvement evaluator consumes exactly three directly comparable raw windows per arm,
recomputes p95 rather than trusting a summary, and publishes both arm values, medians, ranges, the
declared resolution floor, the resulting noise floor, and the signed improvement. A gain must exceed
the larger of observed baseline range, observed candidate range, 1% of baseline median, and 0.1 ms.
Within-noise evidence is `neutral`; a candidate slower beyond the same bound is `regressed`.

- characterization: the import failed before the evaluator existed, and the combined verdict first
  mislabeled a valid/equivalent within-noise result as a generic failure;
- closure/improvement plus equivalence/verdict contracts — PASS 46/46;
- full current PERF-00 focused suite plus authored queue ownership — PASS 134/134;
- program docs — PASS with 0 warnings; program-control tools — PASS 9/9;
- `npm run check:baseline` — PASS 10/10 in 54.173 s;
- baseline-against-identical-baseline reports zero improvement and a nonzero noise floor;
- no browser, Electron, broker claim, or live performance conclusion was spent.

## Final-arbiter four-dimension slice

Final acceptance v3 now requires three clean historical baseline matrices alongside the three
candidate matrices, an explicit improvement scenario, and a content-hashed equivalence document.
The CLI rereads the four declared raw simulation/presentation artifacts, recomputes both semantic
comparisons with the existing bounded comparators, and requires byte-stable report agreement before
the equivalence dimension can pass.

The final report publishes equivalence, measurement validity, noise-aware improvement, and absolute
budget separately. General evidence-identity failures remain fatal. A semantic mutation fails only
equivalence; a contaminated runtime/matrix keeps equivalence green but fails validity; a fully valid
equivalent result inside measured noise is non-promoting `neutral` rather than a false improvement.

- characterization: the final arbiter originally ignored baseline/equivalence inputs and returned no
  dimension report; the new tests failed on those missing surfaces before implementation;
- final acceptance and CLI binding — PASS 8/8; closure/equivalence/final combined set — PASS 54/54;
- expanded PERF-00, broker, and manifest-registry set — PASS 179/179;
- program docs — PASS with 0 warnings; program-control tools — PASS 9/9;
- `npm run check:baseline` — PASS 10/10 in 42.066 s after the final artifact-alias guard;
- no Browser, Electron, broker claim, raw trace, or performance conclusion was fabricated or spent.

## Host-preflight and claim-preservation slice

Performance acceptance now validates authority in two stages. The first stage checks the exact
claim, manifest, source candidate, runtime, and broker digest without consuming the claim. The
bounded activity census then runs before artifact allocation or launcher setup. Active or unknown
Blender/browser/Electron activity raises `PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED`; only an
explicitly quiet census reaches the existing atomic consume and runtime path.

Characterization initially returned `broker-claim-missing-digest` instead of the expected
environment blocker. The source-bound claim was correct, but `validateBrokerClaim` omitted
`sourceCandidateDigest` from its local digest projection. The repair carries that already-required
field into validation. A real temp-root broker claim now validates, encounters an injected Blender
census, rejects before launch, and remains valid and unconsumed afterward.

- focused broker/runtime preflight contracts — PASS 38/38;
- expanded PERF-00, broker, and manifest-registry set — PASS 184/184;
- program docs — PASS with 0 warnings; program-control tools — PASS 9/9;
- `npm run check:baseline` — PASS 10/10 in 44.017 s;
- the blocked-host test allocates no run artifact and invokes no Browser or Electron launcher;
- no production broker claim, headed runtime, GPU capture, or performance conclusion was spent.

## Machine-only disabled-path and process-control slice

The original inventory found browser callback delay, owned callback work, GPU query completion, and
background admission without one shared causal identity. The integrated schemas now separate
external callback gap/dispatch lag from owned phase work, bind deterministic simulation ticks and
presentation snapshots, and carry display/render/simulation/query/background-job identity through
bounded records. The scenario compiler and both semantic comparators are versioned, path-safe,
bounded, deterministic, and fail closed on structural hazards.

Disabled-path proof now reaches the production call sites. Detailed system/render recording returns
without inspecting a record key; CPU clocks remain behind `useCpu`; renderer frame identity reuses
caller-owned storage; GPU `begin` returns before reading the origin or creating a query; post-target
frame linkage uses integer state; and the authored-upgrade caller guards before constructing its job
options/record. The enabled stores remain fixed-capacity with explicit loss/refusal accounting.

The broker child foundation separately proves a hard timeout, Windows process-tree cleanup, clean
and nonzero exits, already-dead PID safety, fast exit during slow spawn accounting, timeout-timer
cancellation, and protection against recycled-PID termination. This does not claim that the unrun
Browser/Electron performance matrices terminated cleanly.

- disabled instrumentation plus process-control contracts — PASS 21/21 in 1.727 s;
- versioned manifest, semantic mutation, measurement-validity, and final-dimension contracts — PASS
  100/100 in 0.402 s;
- expanded PERF-00, broker, manifest-registry, and process-control set — PASS 194/194;
- `npm run check:perf-counters` — PASS 29/29; `npm run check:perf-packets` — PASS 39/39;
- program docs — PASS with 0 warnings; program-control tools — PASS 9/9;
- `npm run check:baseline` — PASS 10/10 in 44.968 s;
- authoritative field, presentation domain, and validity-control mutations all fail with bounded
  named reasons; baseline-against-baseline remains `neutral` rather than improved;
- no production broker claim, headed runtime, GPU capture, or live overhead conclusion was spent.

## Historical blocked disposition (superseded)

This was the terminal receipt for the 2026-07-31 claim, with a `BLOCKED` disposition rather than a
false pass. The exact pushed candidate was `cc3340c268769d69c985902f5a019f57a11b09c2`; program docs,
program-control tools, all changed-lane gates, and the exit baseline are green. The protected
candidate worktrees remain untouched.

At `2026-07-31T21:50:02-04:00`, the read-only host census found:

- Blender: 1 process, protected PID 32140;
- Chrome: 22 processes;
- WebView2: 30 processes;
- SpaceFace/Electron: 0 processes.

This is an `ENVIRONMENT` blocker under the fail-closed preflight, so no claim, headed runtime, or L4
sample was spent. Required upstream change: named owner **SpaceFace quiet-machine performance
operator** supplies an uncontended window, then runs exactly three baseline/candidate Browser and
Electron pairs to prove enabled instrumentation below 1% median owner/callback overhead, absolute
budgets, bounded artifacts, and owned teardown. Named owner **independent performance harness
reviewer** then issues the candidate/evidence-bound causal verdict. Until both close, the Phase 2
enabled-overhead and Phase 4 live-matrix checkboxes stay open.

`browser-gpu`, `performance-evidence`, and `validation-broker` were released. The recovery claim
below supersedes this disposition without erasing its historical evidence.

## Recovery activity-authority repair

The primary integrator reclaimed `PQ-034.native-closure` on 2026-08-01 and reproduced the actual
admission defect: the census declared any named process active solely because it existed. That made
days-old protected Blender, Chrome, and WebView2 roots an automatic blocker even when their bounded
activity was negligible. The initial regression failed before implementation because no activity
classifier existed.

Candidate `52cd5eb3949bfb0e88fd8a2c10d37cd1c149fe65` replaces that existence test with a recorded
five-second pair of Windows CPU snapshots. It still fails closed on unavailable/invalid data,
process churn, CPU counter regression, aggregate use above `0.125` of one core, or a single named
process above `0.075` of a core. The thresholds deliberately sit above Windows scheduler-quantized
idle ticks; they do not waive the route's slow-no-op control, GPU query validity, real-renderer,
worktree/source-drift, cleanup, or end-census gates.

Live read-only characterization at `2026-08-01T09:32:04Z` retained 53 protected process identities,
measured `0.234375` CPU-seconds over five seconds (`0.046875` of one core), found no churn, and
returned `active=false`. No process was stopped, hidden, or excluded. A separate instantaneous GPU
counter read found no utilization attributable to the named Blender/Chrome/WebView2 set; the headed
route must still prove its own GPU and no-op validity.

- bounded idle/active/churn/unavailable regression plus broker preflight — PASS 6/6;
- paired manifest gates — PASS 9/9 and 27/27;
- full PERF-00/broker/registry contract set — PASS 183/183;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 44.419 s;
- no production claim, runtime launch, GPU timing conclusion, or performance promotion was spent.

The exact unit remains `IN_PROGRESS`: the next bounded work is one clean Browser claim, followed by
its source-paired Electron claim if Browser passes, then integrator causal review. The primary
integrator owns that review; no separate human reviewer exists or is required.
