# SF-260 — Attribute impossible pose jumps to the actual writer

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** conditional repair  
**Basis:** repository-reported issue D60; not reproduced here  
**Domain / current routing:** THE MACHINE — development only · PQ-144, PQ-204; CV-GLASS · [WF-19](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md) / [WF-18](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/18-performance.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

For a reproduced D60-style teleport with ordinary velocity, repair the bad pose publication, coordinate transform or recycled identity instead of imposing an arbitrary speed/position clamp.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Velocity clamps do not explain a pose jump with unchanged velocity; world bounds can break valid travel while hiding corruption.

## Before changing code

**Repair gate:** reproduce the stated failure at current HEAD first. A historical ledger row is not a fresh reproduction. If the failure is absent and the intended outcome already holds, report `already satisfied` in the existing task workflow and take the next admitted task; do not invent a replacement bug.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/render/presentationPublisher.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/presentationPublisher.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/renderer.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderer.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/core/loop.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/loop.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/core/physicsAuthority.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/physicsAuthority.js) | [`clamp`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/physicsAuthority.js#L506) |
| [`src/core/entity.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/entity.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Reproduce the named symptom with the existing instrument and current HEAD. Identify CPU work, GPU work, queue wait, I/O or starvation; do not assume a category from total frame time.
2. **Implement the chosen mechanism.** Correlate the existing physics-authority command stream, entity generation and sector-frame transform at the first discontinuity. Preserve the last valid ownership context for diagnosis, identify the exact wrong writer or stale transform, and reject only that invalid publication. Keep legitimate jumps and teleports on their named route; no blanket bounds may redefine the world.
3. **Keep the player-facing chain complete.** Pair before/after runs with the same seed, route, viewport, cache state and load. Record raw sample count, percentiles and worst-event context, not an average-only victory.
4. **Cover lifecycle and counterexamples.** Test failure, supersession, disposal, context loss and long repeated operation. Confirm peak and retained memory as well as draw/readiness correctness.
5. **Converge on the played result.** Require a production-visible improvement plus no disappearing bodies or degraded art. If the premise is stale, retire the candidate rather than rebuilding a solved scheduler.

## Ownership and non-goals

Measure the changed path on the actual device/load, preserve authored visuals and default quality, and keep presentation/sim ownership intact. Async results must prove current generation at commit time. No hidden fallback, timeout inflation or diagnostic-only completion.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Replay the shortest reproducing seed/input sequence plus legitimate jump, dock and large-coordinate travel. The discontinuity must disappear at its cause, velocity/impulses must remain physical, and a nonreproduced historical event must not be declared fixed.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Use normal New Game, a dense fight, high-speed travel and repeated sector/Works transitions on the same host/settings; classify cold and warm behavior separately.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq-030-01-snare.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-030-01-snare.test.mjs)
- [`test/pq-205-02-npc-bomb-proxy.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-205-02-npc-bomb-proxy.test.mjs)
- [`test/physics-authority-cache.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/physics-authority-cache.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq-030-01-snare.test.mjs test/pq-205-02-npc-bomb-proxy.test.mjs test/physics-authority-cache.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
