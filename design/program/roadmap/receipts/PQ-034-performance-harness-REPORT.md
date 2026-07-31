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

## Honest residual

This is not the terminal dispatch receipt. Background-job identity, current runtime-driver
integration, paired Browser/Electron broker authority, source pairing,
clean matched evidence, overhead measurement, and independent causal review remain open. No headed
runtime or performance capture was launched in this slice.
