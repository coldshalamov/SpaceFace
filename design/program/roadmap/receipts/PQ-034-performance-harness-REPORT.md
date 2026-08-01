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
firstFailedBrowserCandidate: 2ab10f91483b38a4cfbd2197d99d7bfa84ae198f
secondFailedBrowserCandidate: dc8a4ae8148bf771188a2e982f0ba7c55da8bd4d
thirdFailedBrowserCandidate: da98b9645e5096390990a0962c91fdd1c685d092
fourthFailedBrowserCandidate: cc88a5d8b1d0f68198b0e3f08badaebb46a8e84c
fifthFailedBrowserCandidate: 1ad68828dff71d599b2e14f8639677837af2dab1
acceptedBrowserCandidate: b847320e4aa0f864e2f6c4862de306fddd773a6b
acceptedBrowserClaimId: 4256-1baf8886d6425c5283c0dd78
acceptedBrowserSourceCandidateDigest: b8193f952d13371c586753168dc3c4fa762d9c0dec3f59c8a2b61e8654cc5645
browserClaimsConsumed: 9
browserClaimAccepted: true
latestFailedBrowserCandidate: 4240fb429a46af03c3f3ee5bea55ddc5a8920477
latestFailedBrowserClaimId: 16368-9b4a75a2c2720889162335f7
latestFailedBrowserSourceCandidateDigest: 286995aa07ab1f051178315571a2294893b6d2541adfc33ab80ee935720105d3
latestBrowserClaimAccepted: false
latestBrowserCandidate: 5473dab9b24ddfbd1adebcb27f8ecf946e0a16be
latestBrowserClaimId: 7344-04c1b7704fa773e53b8f5ad4
latestBrowserSourceCandidateDigest: 948af238401dd8c4da1f51ada35faa4b8e6a05e9ad3e3adf86ef2c67fa04115b
latestVfxCacheRepairCandidate: 12b6b905b36b9820f2e7cd02b49b1a4f61b7f5c4
latestBrowserRepairCandidate: e343fe57ba0e727318b31161e535caa3aae1cf5e
latestBrokerPrelaunchDisposition: regression-required-after-acceptance-failure
firstFailedElectronCandidate: b1b15ee9a5f3a9cc3e6a77c41dabe36370d3fe0c
firstFailedElectronClaimId: 25476-83c733557dbe390afc61eedb
firstFailedElectronSourceCandidateDigest: 96cfc12382d3fb0b3eee146953c07023df8d6c2a0fd9e0d11ebfdae90a2b7047
latestFailedElectronCandidate: 191857fdc8aa44f1b77a20b4578e1b62d4118ead
latestFailedElectronClaimId: 2612-798b762726a8c0634f5a3e40
latestFailedElectronSourceCandidateDigest: c8a6cd7f2f232a74810c9a5e1c8cfb45a5914bd2d2964e6b6bd625aaddcfdb7f
latestElectronRepairCandidate: 429f36f0
electronClaimsConsumed: 2
electronClaimAccepted: false
sourcePairedEvidenceCurrent: false
headedRuntimeLaunched: true
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

## First Browser claim: retained failure and repair

The broker consumed the one-use Browser claim for candidate
`2ab10f91483b38a4cfbd2197d99d7bfa84ae198f` exactly once. Its immutable artifacts are retained at
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T09-42-04-324Z-38724-955b49cc/`.
The route reached public menu, New Game, controllable flight, map/travel, dock, and station; identified
the game renderer as Intel ANGLE/D3D11 WebGL2; completed context loss/restoration; recorded quiet
start and end activity samples; and passed owned cleanup. The claim nevertheless failed measurement
validity, so it carries no accepted performance conclusion.

Characterization found three bounded defects rather than a product-performance regression:

- Three.js legitimately invokes an attribute upload callback during driver-side context recovery,
  outside the coordinator's normal draw epoch. The coordinator reported 46 unsolicited-upload errors,
  invalidated itself, and prevented later post-recovery draws.
- The sampler allowed only two animation frames for asynchronous GPU query readback. Early windows
  accumulated hundreds of valid queries while later queries remained pending at measurement close.
- Universal policies misclassified the canonical docked route, where the registry deliberately keeps
  UI/rAF live while skipping the 3D renderer, and the jump asset-admission window, where dispatched
  admission is expected to grow the settled program cache.

Candidate `0fb2fc10bcceefbdb45fff768edd77ac71f76c16` closes each defect. A context restore now grants
one narrowly bound driver reupload per tracked attribute and preserves subsequent unsolicited-upload
rejection. Window close performs and records a bounded two-second pending-query drain without a GPU
finish. Versioned scenario policy requires exact docked/UI evidence for a zero-query idle-3D window
and exact dispatched, settled queue evidence for jump admission; ordinary zero-query and cache-drift
windows remain invalid.

- red-to-green focused regressions — PASS 40/40;
- expanded PERF-00/broker contracts — PASS 201/201 in 14.7 s;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 50.109 s.

This is a source-changing repair, not a waiver or a retry of unchanged evidence. The next bounded
action is one fresh Browser claim on the clean pushed repair; Electron remains unspent until that
claim passes.

## Second Browser claim: terminal progression ran before diagnostics

The next one-use Browser claim ran once on clean pushed candidate
`dc8a4ae8148bf771188a2e982f0ba7c55da8bd4d`; its artifacts are retained at
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T10-08-31-743Z-26696-1ac246b9/`.
It cleared all failures from the first claim: no runtime/page/GL/request errors, all 25 GPU timing
windows completed with zero pending/dropped/rejected queries, exact docked-idle and jump-admission
policies passed, route state and context recovery passed, activity was quiet at both boundaries, and
cleanup passed. The only invalidity reason was `windows[24]-pipeline-cache-mismatch`.

The retained window evidence identifies the causal sequence. `jump_asset_admission` intentionally
progressed from Helios to Ceres and left five authored presentations pending. The scenario restorer
correctly labels that route `route-progression-cleanup-scoped` and does not undo the sector change.
The runner nevertheless executed nine diagnostic flight cells afterward. During the final
`material_depth_override` window, one destination asset completed: program count `88 → 92`, pending
authored count `5 → 4`, resident assets `33 → 34`, and resident resources `886 → 940`. The window's
stable-pipeline policy correctly rejected the measurement; no timing result is promoted.

Candidate `fc18ed4680711da7d88e97080ab8129ebfd523d7` fixes the ordering contract rather than adding a
waiver. Its explicit execution plan runs every reversible baseline and diagnostic cell first and the
cleanup-scoped jump cell last. It also refuses a non-baseline variant on that irreversible route. The
new order regression failed before implementation because the planner did not exist and now passes.

- selected PERF-00/broker regression set — PASS 143/143 in 15.302 s;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 44.283 s.

The exact unit remains `IN_PROGRESS`. The next action is one fresh Browser claim on the changed,
clean pushed candidate. Electron remains unspent until Browser passes.

## Third Browser claim: context recovery preceded reversible diagnostics

The claim on clean pushed candidate `da98b9645e5096390990a0962c91fdd1c685d092` ran once and is
retained at
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T10-23-39-163Z-36568-6fba6fd4/`.
Its window order proves the terminal-jump repair: all reversible cells ran first and
`jump_asset_admission` ran last as window 24. Runtime/page/GL/request errors were empty, all GPU query
drains completed, exact docked-idle and jump-admission policies passed, route state and context proof
passed, both activity boundaries were quiet, and cleanup passed. The sole failure was
`windows[16]-pipeline-cache-mismatch`.

Window 16 was `flight_steady @ bloom_off`. Its authored pending count stayed `1`, resident assets
stayed `27`, resident resources stayed `845`, active admission jobs stayed `0`, and the mesh queue
stayed `0`; this was not asset streaming. Context recovery at window 14 had reset the program cache
from 89 to 79. Window 15 was `sim_paused`, so it could not exercise moving-flight visibility. Window
16 resumed simulation and one remaining ordinary pipeline compiled inside the measured arm, moving
program count `80 → 81`. The stable-window rejection is therefore retained.

Candidate `243d3bce9f5865a81faafb7fb7c2e02ee1f42c42` extends the explicit execution plan: reversible
baseline and diagnostic cells run first, cache-destructive context recovery runs next, and
cleanup-scoped jump progression remains last. It refuses non-baseline variants for either terminal
cell. The order regression failed before implementation and now pins the exact sequence.

- selected PERF-00/broker regression set — PASS 143/143 in 14.740 s;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 45.886 s.

No timing conclusion from this claim is promoted. The exact unit remains `IN_PROGRESS`; one fresh
Browser claim on the changed clean candidate is next, while Electron remains unspent.

## Fourth Browser claim: fixed delay did not prove pipeline readiness

The claim on clean pushed candidate `cc88a5d8b1d0f68198b0e3f08badaebb46a8e84c` ran once and is
retained at
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T10-36-06-675Z-35024-c5b89875/`.
The artifact proves the complete intended order: reversible baseline/diagnostic windows 0-22,
`context_recover_steady` at 23, and `jump_asset_admission` at 24. Runtime, page, request, HTTP, console,
and GL error arrays are empty. All GPU queries completed and drained without pending, dropped, or
rejected records; route/activity/restoration/context/jump policies and owned cleanup all pass. The
only validity reasons are `windows[15]-pipeline-cache-mismatch` and
`windows[16]-pipeline-cache-mismatch`.

Window 15 was `flight_steady @ bloom_off`: programs changed `95 → 97`, while active admission jobs
stayed `0`, mesh queue stayed `0`, authored pending stayed `4`, resident assets stayed `27`, and
resident resources stayed `799`. Window 16 was `flight_steady @ background_hidden`: programs changed
`97 → 98` while every one of those admission, queue, and residency facts stayed unchanged. These are
ordinary lazy program compilations after the fixed two-second delay, not asset-streaming or a reason
to relax the stable-cache verdict. No timing result is promoted.

Candidate `89470005843bca49a3b140f7e3f8931b4da671b3` adds the missing readiness proof. Each arm now polls a
bounded fingerprint of program count, admission jobs, mesh queue/dirty state, compile-pending count,
authored pending count, and asset/resource residency every 100 ms. Measurement begins only after the
fingerprint is unchanged for at least five seconds and the active queue/admission owners are settled,
with a hard 20-second cap. The versioned `spaceface.performancePipelineWarmup.v1` receipt records
elapsed/stable time, observations, transitions, and start/end fingerprints; timeout or a malformed
receipt fails measurement validity as `pipeline-warmup-unsettled`. The normal start/end program-cache
rule remains binding, and the observer does not force GPU completion with `gl.finish`.

- the seconds-scale warmup-validity regression failed before implementation and now passes;
- focused attribution/closure/final-acceptance/scene tests — PASS 49/49;
- selected PERF-00/broker regression set — PASS 144/144 in 15.779 s;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 47.246 s.

The exact unit remains `IN_PROGRESS`. One fresh Browser claim on the changed clean pushed candidate is
next; Electron remains unspent until Browser passes.

## Fifth Browser attempt: transient preflight process churn

The one-use broker attempt on clean pushed candidate `1ad68828dff71d599b2e14f8639677837af2dab1`
stopped at the preflight census before Browser launch or acceptance artifact allocation. At
`2026-08-01T10:58:36.434Z`, both release authoring signals were inactive. The surviving 53 protected
Blender, Chrome, and WebView processes accumulated `0.171875` CPU-seconds over five seconds, or
`0.034375` of one core, below the `0.125` aggregate and `0.075` per-process thresholds. No process
started, but `msedgewebview2.exe` PID 11512 ended between snapshots. Its post-snapshot CPU is
unknowable, so `process-churn` correctly invalidated that sample. The broker recorded one Browser
launch authorization for the candidate, while the probe launched no Browser and claimed no timing.

Candidate `c812ca50651c48265915de3df3a21b1a7bdaac55` repairs the inability to autonomously settle that
transient condition. Before claim consumption only, a census whose sole reason is `process-churn` may
be discarded and followed by a wholly new five-second sample. The bound is three total attempts, and
the retained start authority records every attempt plus whether a later sample settled. A sample with
CPU activity, malformed/unavailable data, counter regression, or any non-churn reason never retries.
Persistent churn still fails after the bound. End-of-run activity remains one fail-closed sample, so
activity during or after the measured route cannot be waited away.

- the churn-only regression failed before implementation and now requires a fresh quiet sample;
- the persistent-churn counterexample remains fail-closed after the bounded retry;
- selected PERF-00/broker regression set — PASS 146/146 in 16.291 s;
- `npm run check:perf-counters` — PASS 35/35;
- `npm run check:perf-packets` — PASS 39/39;
- `npm run check:sim:compare` — PASS, deterministic and hash-equal;
- `npm run check:launch-policy` — PASS;
- `npm run check:baseline` — PASS 10/10 in 45.404 s.

No performance conclusion is promoted. The exact unit remains `IN_PROGRESS`; a fresh Browser claim on
the changed clean pushed candidate is next, and Electron remains unspent until Browser passes.

## Sixth Browser claim: accepted measurement authority

The one-use Browser claim on clean pushed candidate `b847320e4aa0f864e2f6c4862de306fddd773a6b`
passed in 454.166 seconds. Its immutable artifacts are retained at
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T11-08-23-266Z-9852-98f87623/`,
and `.devshots/perf/closure/browser/browser/evidence.json` is the content-verified v2 broker
projection. Claim `4256-1baf8886d6425c5283c0dd78` binds:

- `sourceCandidateDigest`: `b8193f952d13371c586753168dc3c4fa762d9c0dec3f59c8a2b61e8654cc5645`;
- Browser `candidateDigest`: `2e47f480e08cde76139bf5dec795a5d3c04b9d64d31d1d31349a3764844f0848`;
- raw `performance-windows.json` SHA-256: `d02eaa44328ad975a3b88984b3accb01bce73c305e7dc47c72a4ddde6753cf30`.

The exact closure verdict is green: worktree clean/stable, activity quiet, real Intel ANGLE D3D11,
cleanup complete, errors empty, and 25/25 windows present. All 25 GPU-timer, pipeline-warmup, pipeline
policy, and route/restoration check groups pass. The warmup receipt caught and settled the three lazy
program transitions that motivated the repair: `bloom_off` observed one transition and waited
5.854 seconds total / 5.028 seconds stable; `background_hidden` observed one and waited 9.730 seconds
total / 5.024 seconds stable; material-basic observed one and waited 5.271 seconds total / 5.008
seconds stable. Their measured arms then held programs `100 → 100`, `102 → 102`, and `105 → 105`.
Every GPU queue ended with zero pending records, including a valid zero-query docked 3D-idle window.

The public menu → New Game → authored flight → map/waypoint → physical dock → Station route passed,
as did controlled context loss/restoration and cleanup-scoped jump. Page, request, HTTP, console, GL,
and ordinary warning arrays are empty; only two expected context messages and two retained driver
compiler warnings remain outside the error verdict. The start census used one quiet sample at
`0.109375` CPU-seconds / `0.021875` aggregate core fraction; the single fail-closed end sample was
quiet at `0.125` CPU-seconds / `0.025`, with no churn at either boundary. Cleanup closed the page,
context, Browser, server, ports, measurement gates, and broker-owned process successfully.

This evidence proves trustworthy Browser measurement authority, not target performance. The raw
matrix misses literal budgets in multiple routes (for example 50 ms p95 in the 50-ship and
transparent-heavy windows), and the packet has no matched improvement verdict yet. No performance
gain or absolute-budget pass is promoted. Browser will not be rerun unchanged. The exact unit remains
`IN_PROGRESS`; one source-paired Electron claim, overhead proof, and integrator causal review remain.

## First Electron claim: exact-runtime, strict-CSP, and context-loss repair

Claim `25476-83c733557dbe390afc61eedb` ran once on clean pushed candidate
`b1b15ee9a5f3a9cc3e6a77c41dabe36370d3fe0c`. Its source digest was `96cfc123…`, already different
from the accepted Browser digest `b8193f95…`; the evidence could never form a source pair. The
retained artifact is
`.devshots/perf/closure/electron/performance-closure-electron-2026-08-01T11-20-50-729Z-29580-c325bd84/`.
It completed 25/25 windows, recorded quiet start/end activity, and passed owned cleanup, but correctly
failed measurement validity.

The artifact names the causes precisely:

- its renderer user agent is `Electron/31.7.7`, not the package/lock target `43.2.0`;
- its warning set contains exactly one Electron insecure/missing-CSP warning and twelve
  `GL_INVALID_VALUE: Program object expected` warnings after context recovery;
- the warning arrays therefore remain binding as `runtime-errors-observed-or-unreported`; no raw
  timing is accepted from this run.

Candidate `137e4d8f12a3f20df08d645a47b321c1afb90b1b` closes the causes with fail-closed authority:

- exact Electron provisioning now requires package, declared, and binary versions to agree and
  records the runtime executable/version plus matching renderer user agent;
- the Electron-owned server sends an explicit CSP without `unsafe-eval`, while the Browser route is
  unchanged;
- Playwright wait conditions use direct page evaluation; Rapier accepts only wasm-bindgen's inert
  `return this` lookup; and the Basis worker replaces exactly its two pinned dynamic Emscripten shims;
- the Basis regression runs real WASM over an embedded KTX2 from a release GLB and matches the stock
  decoder's width, height, levels, faces, layers, validity, and alpha facts;
- context rebuild is deferred until restore listeners settle, and the draw boundary observes live
  `gl.isContextLost()` during the asynchronous event-delivery gap.

The bounded context diagnostic at
`.devshots/perf/diagnostic/pq034-context-gap-guard/performance-closure-electron-2026-08-01T12-57-24-501Z-19448-6d0db5ce/`
records `lostEvent=true`, `restoredEvent=true`, retained authored mesh identity, pixel and rAF proof,
replaced Three.js properties at event tail and microtask, and `invalidProgramCalls: []`. Its overall
exit is intentionally non-promoting because the diagnostic used a one-second sample below the
five-second measurement contract. The temporary program trace is absent from the committed source.

Final repair evidence:

- strict-CSP/runtime/context focused set — PASS 48/48;
- physics authority — PASS;
- floating-origin Rapier plus collision manifest — PASS 18/18;
- Electron platform contracts and launch policy — PASS;
- `npm run check:baseline` — PASS 10/10 in 43.300 seconds;
- `npm run check:electron:new-game` — PASS on Electron 43.2.0, Intel D3D11 hardware WebGL, flight
  mode, 16 authored ship presentations, zero page/GPU-process errors, and owned cleanup.

This is a repair checkpoint, not acceptance. The production/harness source changed, so the old
Browser matrix remains valid historical Browser authority but is not current pair material. One fresh
Browser claim and one Electron claim must now pass on the same clean pushed source before overhead
and terminal causal review can close the unit.

## Seventh Browser claim: predictive runway and mining-journal repair

Claim `16368-9b4a75a2c2720889162335f7` ran once on clean pushed candidate
`4240fb429a46af03c3f3ee5bea55ddc5a8920477` with source digest
`286995aa07ab1f051178315571a2294893b6d2541adfc33ab80ee935720105d3`. The immutable artifact is
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T13-13-29-855Z-34716-3b1a910b/`.
All 25 windows, real Intel D3D11 GPU timing, public-route checks, context recovery, quiet activity,
runtime issue arrays, measurement disablement, scenario restoration, and owned cleanup completed.
The run correctly remained failed evidence because exactly two stable-pipeline cells changed program
count: `fleet_full_render_10` from `84 → 86` and `context_recover_steady` from `81 → 82`.

The first cell proves a predictable admission boundary. Pending natural courier `303` began an
authored Kestrel cache-miss admission during measurement, moved from `2488.253` to `1539.867` world
units from the held player pose, and changed pending count `3 → 2`, resident assets `30 → 31`,
resident resources `735 → 786`, visible ship meshes `130 → 134`, and static batches `30 → 32`.
The second cell proves scenario contamination: mining VFX remained active after its diagnostic arm;
after context recovery, its sprites/event lights changed `0/0 → 1/1`, visible unowned instanced roots
`28 → 31`, geometries `92 → 97`, textures `207 → 210`, and programs `81 → 82`.

Candidate `c580a43e7d6c165949d6c58d64871aa0ad9fd87a` preserves the fail-closed program comparison and
repairs both causes. The renderer and evidence route share a pure authored-runway predicate; capture
projects pending admissions over the exact upcoming sample duration and waits until that risk is
zero. Captured pipeline promises must settle under a bounded prerequisite barrier before stable
observation. Mining start/tick now belongs to the scenario journal, whose restorer emits and verifies
one stop edge before releasing the arm.

- focused performance/render set — PASS 71/71;
- inbound-runway regression — PASS at the reproduced 2488-unit distance and 190 WU/s closure;
- mining journal regression — PASS exact `mining:start`, `mining:tick`, `mining:stop` sequence;
- `npm run check:baseline` — PASS 10/10 in 42.194 seconds.

No timing or performance conclusion is accepted from this failed claim. One fresh Browser claim on
the clean pushed repair must pass before the source-paired Electron claim is spent.

## Eighth Browser pass and second Electron claim: current console and seam-pipeline repair

The fresh Browser claim on clean pushed candidate `191857fdc8aa44f1b77a20b4578e1b62d4118ead`
passed the complete acceptance matrix under claim `32112-9404c78daa9d2a9c5b1c8d1e`. Its immutable
artifact is
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T13-41-05-219Z-30952-5c58acf0/`,
bound to source digest `c8a6cd7f2f232a74810c9a5e1c8cfb45a5914bd2d2964e6b6bd625aaddcfdb7f`.
All 25 windows, scenario restoration, public route, real Intel D3D11 GPU timers, activity
boundaries, context recovery, runtime issue arrays, measurement disablement, and owned cleanup
passed. This is accepted Browser authority for that exact source.

The source-paired Electron claim ran once on the same clean candidate and digest under claim
`2612-798b762726a8c0634f5a3e40`. Its retained artifact is
`.devshots/perf/closure/electron/performance-closure-electron-2026-08-01T13-48-41-163Z-28352-04917484/`.
It completed all 25 windows plus graceful owned teardown on Electron 43.2.0 and real Intel D3D11.
Every route, GPU, activity, restoration, and cleanup check passed. It remained failed evidence for
two precise reasons: one Electron deprecation warning and `windows[11]-pipeline-cache-mismatch`.

Both causes were harness/runtime readiness defects, not performance waivers. Electron 43's local
type contract exposes `console-message` as one event object; the main shell and development preview
still declared two- and five-position listeners, which caused the warning. Candidate `7a5820a4`
uses the single-object contract everywhere, and the executable shell test plus platform check pin it.
The program drift was the first wake of the mining seam-marker pool: during `map_open`, a natural
nearby seam changed from inactive to active, adding five geometries and one previously unlinked
instanced/vertex-coloured/additive/double-sided program (`86 → 87`) with no asset admission or
residency change. Candidate `429f36f0` builds live and precompile seam markers through the same
factory and stages one initialized instance in the startup salvo. The seconds-scale WebGL regression
proves `programsAfterPrecompile = programsAfterFirstLiveSeam = 7`; the complete trail/VFX lane passes.

No Electron or paired performance conclusion is promoted from the failed matrix. Because the two
repairs changed source after the accepted Browser run, one fresh Browser claim and then one Electron
claim must pass on the same clean pushed repair before overhead and terminal causal review close the
unit.

## Ninth Browser claim: exact VFX cache-key ownership repair

Claim `7344-04c1b7704fa773e53b8f5ad4` ran once on clean pushed candidate
`5473dab9b24ddfbd1adebcb27f8ecf946e0a16be` with source digest
`948af238401dd8c4da1f51ada35faa4b8e6a05e9ad3e3adf86ef2c67fa04115b`. The retained artifact is
`.devshots/perf/closure/browser/performance-closure-browser-2026-08-01T14-08-52-310Z-28068-d538392b/`.
All 25 scenarios, public route, real Intel D3D11 GPU queries, activity boundaries, runtime issue
arrays, restoration, context recovery, measurement disablement, and owned cleanup passed. The run
correctly remained failed evidence because `fleet_full_render_25` changed programs `89 → 90` and
`bloom_off` changed `100 → 101`; Electron was not spent.

Neither cell had an authored admission, pending request, residency change, route divergence, or
cleanup failure. Both grew one lazy VFX owner and two geometries; the second cell also woke three
instanced sprite roots. The retained source and a real-WebGL reduction exposed the common cache-key
cause. If global precompile runs before the live event-light pool is attached, its six stand-in
lights were children of the compiled staging subtree while that subtree was already a child of the
target scene. Three gathered them through both traversals and compiled a 12-light key for the live
six-light route. The synthetic ribbon also used `PlaneGeometry` (`normal/uv`) instead of the live
`position/aTrailUv` geometry, and teardown retained only one plume while disposing the other salvo
program owners.

Candidate `12b6b905b36b9820f2e7cd02b49b1a4f61b7f5c4` fixes all three exact ownership mismatches. Event
light stand-ins are target-scene siblings and are counted once; the precompile ribbon is built by the
live lazy-ribbon factory; and the bounded off-scene VFX salvo remains owned with the canopy probes
until renderer invalidation. The production-lifecycle WebGL regression starts without live event
lights, runs real global precompile plus teardown, attaches the six-light live pool, then wakes live
trail, seam, ribbon, and additive/normal sprite paths. Program count remains exactly `14` after every
wake. Retained-material disposal is separately pinned at zero.

- focused render/performance contracts — PASS 39/39;
- `npm run check:vfx:trail-instancing` — PASS, including real WebGL and zero new programs;
- VFX additive contract — PASS;
- `npm run check:baseline` — PASS 10/10 in 43.801 seconds.

No timing conclusion is promoted from the failed claim. One fresh Browser claim on the clean pushed
repair is required before a source-paired Electron claim.

## Broker retry binding repair

The next broker request did not launch a runtime or consume another claim. It stopped at the
unchanged-failure guard with `blocked_unresolved_failure: regression-required-after-acceptance-failure`.
The VFX cache-key repair and its real-WebGL regression were already green, but the paired manifest's
declared regression/source paths did not include those repair owners. As a result, the immutable
regression digest still matched the ninth failed claim and the broker had no machine-readable basis
for authorizing a retry.

Candidate `e343fe57ba0e727318b31161e535caa3aae1cf5e` closes that authority defect. Both paired manifests
now bind `authored-precompile-residency`, Electron shell lifecycle, and trail-streak instancing
regressions; `electron/main.cjs`, the live ribbon/precompile/VFX owners; and the Electron-platform and
real-WebGL executable checks. Focused evidence:

- manifest/runtime authority — PASS 12/12;
- exact repair regressions — PASS 11/11;
- `npm run check:vfx:trail-instancing` — PASS with programs fixed at `14` through first live
  trail/seam/ribbon/sprite wakes;
- Electron 43.2.0 platform contracts — PASS.

`browserClaimsConsumed` remains `9`; no headed or timing evidence is inferred from the prelaunch
stop. The next valid action is one fresh Browser claim on a clean pushed program-doc-synchronized
candidate, followed by Electron only if Browser passes on that identical source digest.
