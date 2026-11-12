# Source provenance and limits

## Snapshot

Repository: `coldshalamov/SpaceFace`  
Pinned commit: [`c92756afb46a9115d47e9d1757369678023efce4`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/AGENTS.md)  
Commit time: September 28, 2026 03:23:14 UTC = September 27, 2026 23:23:14 America/New_York.  
Acquisition: repository `agent-code-packet` workflow, run `36373532070`, artifact `10949554654`. No repository write was performed for this deliverable.

The source artifact reports 11,623 selected tracked files totaling 196,941,046 bytes and 5,669 omitted files totaling 4,804,852,745 bytes. Selection excluded heavyweight/binary media and individual files over 8 MiB. The three extra packet manifests explain selection and omissions. The planbank does not redistribute the repository snapshot, media, fonts or private save data.

## What was inspected

The assessment read the agent orientation and architecture/routing material, the build map's active directions and campaigns, INFERENCE execution/creative-completeness workflows, current finish/defect reporting, vision and feel direction, ORRERY direction, the existing alien-ecology program, and selected live owners across flight, combat, AI, Swarm, NPC jobs, custody/economy, missions, aftermath, discovery, presentation, audio, save and rendering.

Mechanical source-path, symbol, test-name and hash indexing supplements that reading. **The 503 indexed source/test/policy paths are not a claim that every file was exhaustively reviewed or every behavior verified.** Per-packet symbol anchors are source navigation aids. The manifest contains hashes and metadata, not proof of runtime behavior.

## Four kinds of claim

**Source-inspected mechanism:** for example, the selected yard encounter's private moving mouth radius and timeout resolution. This can be established by code inspection, while its actual player experience still needs a route check.

**Repository-reported issue:** D38, D61, D36, D74, D80 and D89 are reports in the current inspected ledger. Their historical measurements and diagnoses belong to that source; they were not rerun here. D24 explicitly describes a landed fix with remaining verification. Do not present any of these as this assessment's fresh measurement.

**Direct local check:** commands and results listed below actually ran in the source-only environment.

**Proposed design:** most of the 300 packets are selected improvement directions, not confirmed omissions. Their numeric tuning or acceptance suggestions are proposals unless tied to a cited source. An already-working equivalent satisfies them.

## Checks actually run

Environment: Node `v22.16.0`, source-only packet, no installed `three` dependency or full media.

```sh
node --check src/render/selectionSigil.js
node --test test/pq-177-06-cargo-custody.test.mjs test/inf-042-field-lifecycle.test.mjs
```

The syntax check passed. The two focused suites passed **12 tests, 0 failed**. Full output: [focused passing tests](evidence/focused-passing-tests.tap).

An earlier combined invocation also included `test/selection-sigil.test.mjs`; that test file could not load because `three` was absent. Its functional assertions therefore were not established. The other 12 assertions passed in that invocation too. Full output, including the dependency failure: [initial combined run](evidence/focused-tests.tap). A passed syntax check does not prove its shader renders correctly.

## Not performed

No complete game playthrough, live-browser visual inspection, audio listening session, GPU benchmark, full test suite, long Ceres reproduction, Forge asset evaluation or Browser/Electron cross-shell acceptance was performed here. Missing media/dependencies prevent stronger claims. No pull request, commit, queue admission or implementation was created.

## Reading sources and detecting drift

Every plan links to commit-pinned source paths; the deep dives and audit link to relevant ranges. [The source manifest](data/source-manifest.json) stores hashes, line counts and mechanically located entry points. `tools/check_source_drift.py` compares selected source hashes against a real checkout without changing it. A changed hash means read/reconcile; it does not mean the current checkout is wrong.

## External technical verification

The performance specifications were cross-checked against official Three.js WebGLRenderer documentation and the Khronos/MDN description of `KHR_parallel_shader_compile`: asynchronous completion polling avoids unnecessary blocking status checks when supported, but does not guarantee lower total compilation time. Match the repository's installed version and actual driver capabilities; do not infer native OpenGL thread-control APIs exist in WebGL.

References: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [Khronos extension specification](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/), [MDN extension reference](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). These references support API constraints, not claims that a proposed optimization is proven on SpaceFace.
