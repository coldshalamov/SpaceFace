# SF-268 — Context restoration rebuilds the actual current scene

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE MACHINE — development only · PQ-144, PQ-204; CV-GLASS · [WF-19](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md) / [WF-18](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/18-performance.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Recover from WebGL context loss through existing resource/readiness owners for the current generation, without replaying old scene publications or losing the simulation's durable state.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Reloading the entire campaign risks lost progress; accepting old GPU-ready flags can yield an empty restored scene.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/render/pipelineReadiness.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/pipelineReadiness.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/assetResidency.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/assetResidency.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/renderPackageLoader.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderPackageLoader.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/presentationPublisher.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/presentationPublisher.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/renderer.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderer.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/latePipelineAdmission.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/latePipelineAdmission.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Reproduce the named symptom with the existing instrument and current HEAD. Identify CPU work, GPU work, queue wait, I/O or starvation; do not assume a category from total frame time.
2. **Implement the chosen mechanism.** Inspect renderer context hooks and package ownership, invalidate only GPU-dependent readiness and rebuild from current live assets/state. Cancel obsolete in-flight publications, preserve meaningful loading/error state and resume only when the ordinary authored-ready condition is satisfied. Reuse the current renderer route; do not start a second animation loop or reset the campaign.
3. **Keep the player-facing chain complete.** Pair before/after runs with the same seed, route, viewport, cache state and load. Record raw sample count, percentiles and worst-event context, not an average-only victory.
4. **Cover lifecycle and counterexamples.** Test failure, supersession, disposal, context loss and long repeated operation. Confirm peak and retained memory as well as draw/readiness correctness.
5. **Converge on the played result.** Require a production-visible improvement plus no disappearing bodies or degraded art. If the premise is stale, retire the candidate rather than rebuilding a solved scheduler.

## Ownership and non-goals

Measure the changed path on the actual device/load, preserve authored visuals and default quality, and keep presentation/sim ownership intact. Async results must prove current generation at commit time. No hidden fallback, timeout inflation or diagnostic-only completion.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Trigger context loss while flying, loading a sector and leaving Works, using supported test hooks on the execution host. After restoration only the latest scene appears, input is not stuck and resources/credits remain unchanged; unsupported restoration must fail visibly rather than pretend recovery.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Use normal New Game, a dense fight, high-speed travel and repeated sector/Works transitions on the same host/settings; classify cold and warm behavior separately.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/late-pipeline-admission.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/late-pipeline-admission.test.mjs)
- [`test/post-opening-pipeline-admission.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/post-opening-pipeline-admission.test.mjs)
- [`test/startup-loading-presentation.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/startup-loading-presentation.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/late-pipeline-admission.test.mjs test/post-opening-pipeline-admission.test.mjs test/startup-loading-presentation.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
