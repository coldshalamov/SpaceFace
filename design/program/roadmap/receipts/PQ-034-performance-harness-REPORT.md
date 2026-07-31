<!-- LIFETIME: EVIDENCE -->
# PQ-034 PERF-00 native-closure report

```yaml
packet: PQ-034
dispatchUnit: PQ-034.native-closure
lifecycleClaim: claimed
acceptanceClaim: focused_green_partial
terminalDisposition: pending
claimBase: 9d8f3984d9bb846e9aa42dba8929ac78c99ac5eb
headedRuntimeLaunched: false
performanceEvidenceClaimed: false
protectedWorktreeMutated: false
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

## Honest residual

This is not the terminal dispatch receipt. Background-job identity, explicit comparison invalidation,
clean matched evidence, overhead measurement, and independent causal review remain open. The current
driver and paired authority are focused-green but intentionally unspent while the machine remains
ineligible for a quiet L4 capture.
