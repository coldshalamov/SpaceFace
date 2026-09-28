# 18 — Streaming, frame pacing and quality-preserving performance

**Current lane:** THE MACHINE — development only  
**Build-map connections:** PQ-144, PQ-204; CV-GLASS  
**15 proposed packets:** SF-256–SF-270

## Existing foundation, not a blank slate

The repo has extensive admission, cooking, residency and presentation machinery. D38/D61/D36/D74 describe residual paths; some old fixes are already landed. Quiet-machine release acceptance is parked, but attribution and production fixes are not.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Measure the changed path on the actual device/load, preserve authored visuals and default quality, and keep presentation/sim ownership intact. Async results must prove current generation at commit time. No hidden fallback, timeout inflation or diagnostic-only completion.

## Reusable implementation workflow

1. Reproduce the named symptom with the existing instrument and current HEAD. Identify CPU work, GPU work, queue wait, I/O or starvation; do not assume a category from total frame time.
2. Trace the critical path and write one bounded algorithm/lifetime change. Retain default visual output and canonical readiness guarantees.
3. Implement cancellation/generation checks at every async publication boundary. Bound queues, caches and per-frame work; expose only minimal attribution needed for regression.
4. Pair before/after runs with the same seed, route, viewport, cache state and load. Record raw sample count, percentiles and worst-event context, not an average-only victory.
5. Test failure, supersession, disposal, context loss and long repeated operation. Confirm peak and retained memory as well as draw/readiness correctness.
6. Require a production-visible improvement plus no disappearing bodies or degraded art. If the premise is stale, retire the candidate rather than rebuilding a solved scheduler.

## Ordinary-route proof

Use normal New Game, a dense fight, high-speed travel and repeated sector/Works transitions on the same host/settings; classify cold and warm behavior separately.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-19: Technical Production And Performance Scaling](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md)
- [WF-18: Design Recovery And Simplification](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-256 — Remove needless direct-versus-instanced shader twins](../plans/18-performance/SF-256-remove-needless-direct-versus-instanced-shader-twins.md) — conditional repair
- [SF-257 — Publish authored sector assets only for their current generation](../plans/18-performance/SF-257-publish-authored-sector-assets-only-for-their-current-generation.md) — conditional repair
- [SF-258 — Resolve main-thread starvation rather than inflating the Works watchdog](../plans/18-performance/SF-258-resolve-main-thread-starvation-rather-than-inflating-the-works-watchdog.md) — conditional repair
- [SF-259 — Close any remaining package lifetime retention after disposal](../plans/18-performance/SF-259-close-any-remaining-package-lifetime-retention-after-disposal.md) — conditional repair
- [SF-260 — Attribute impossible pose jumps to the actual writer](../plans/18-performance/SF-260-attribute-impossible-pose-jumps-to-the-actual-writer.md) — conditional repair
- [SF-261 — One measured material key per actual render contract](../plans/18-performance/SF-261-one-measured-material-key-per-actual-render-contract.md) — deepening
- [SF-262 — Cold-route cooking predicts the next real body](../plans/18-performance/SF-262-cold-route-cooking-predicts-the-next-real-body.md) — deepening
- [SF-263 — Bound presentation publication without revealing half a body](../plans/18-performance/SF-263-bound-presentation-publication-without-revealing-half-a-body.md) — deepening
- [SF-264 — Allocation reduction in an attributed render hot loop](../plans/18-performance/SF-264-allocation-reduction-in-an-attributed-render-hot-loop.md) — deepening
- [SF-265 — Visible-body residency follows current observation](../plans/18-performance/SF-265-visible-body-residency-follows-current-observation.md) — deepening
- [SF-266 — Queries scale with nearby interaction, not total universe size](../plans/18-performance/SF-266-queries-scale-with-nearby-interaction-not-total-universe-size.md) — deepening
- [SF-267 — UI work occurs when the represented state changes](../plans/18-performance/SF-267-ui-work-occurs-when-the-represented-state-changes.md) — deepening
- [SF-268 — Context restoration rebuilds the actual current scene](../plans/18-performance/SF-268-context-restoration-rebuilds-the-actual-current-scene.md) — deepening
- [SF-269 — Frame debt never changes the meaning of one input edge](../plans/18-performance/SF-269-frame-debt-never-changes-the-meaning-of-one-input-edge.md) — deepening
- [SF-270 — A performance change proves an intact playable picture](../plans/18-performance/SF-270-a-performance-change-proves-an-intact-playable-picture.md) — deepening

## Owner reading map

- [`src/render/pipelineReadiness.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/pipelineReadiness.js)
- [`src/render/assetResidency.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/assetResidency.js)
- [`src/render/authoredAdmissionPolicy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/authoredAdmissionPolicy.js)
- [`src/render/renderPackageLoader.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderPackageLoader.js)
- [`src/render/presentationPublisher.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/presentationPublisher.js)
- [`src/render/renderer.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderer.js)
- [`src/core/loop.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/loop.js)
- [`src/render/latePipelineAdmission.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/latePipelineAdmission.js)
- [`src/render/materialBatchKey.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/materialBatchKey.js)
- [`src/render/shaderLinkReporter.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/shaderLinkReporter.js)
- [`src/render/compilePresentSlice.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/compilePresentSlice.js)
- [`src/render/packageCpuDetach.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/packageCpuDetach.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
