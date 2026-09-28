# SF-016 — Acquisition confidence at the edge of a crowd

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE HAND · PQ-026–031, PQ-137, PQ-146; CV-THROW, CR-CHAIN · [WF-05](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md) / [WF-15](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/02-massline.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Make target selection stable when several light bodies overlap, while preserving deliberate retargeting and the physical reach limit.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Hard target lock frustrates retargeting; nearest-center alone oscillates inside crowds.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/tetherGameplay.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/tetherGameplay.js) | [`tetherGameplay`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/tetherGameplay.js#L121) |
| [`src/combat/attachments.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/combat/attachments.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/masslineInputGrammar.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/masslineInputGrammar.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/masslinePresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/masslinePresentation.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the existing acquisition, attachment and release transitions before adding any state. Identify the body, anchor, head and action owner used by this packet.
2. **Implement the chosen mechanism.** Inspect the current acquisition scorer and input grammar through tetherGameplay. Add a bounded tie-break that prefers the previous eligible candidate only inside a small score margin; clear preference on occlusion, range loss or contrary aim. Surface the actual chosen body through existing targeting, not a speculative future target.
3. **Keep the player-facing chain complete.** Wire one reachable combat setup and one noncombat use when this is a tool change; preserve physical counterplay and a failure continuation.
4. **Cover lifecycle and counterexamples.** Test acquire/release/destroy/sector-change/save boundaries, target mass extremes and obstructed geometry. Use seeded inputs and verify no ghost constraint remains.
5. **Converge on the played result.** Play at the shipping camera: the player should infer why the move worked from motion, rope and sound. A textual stunt receipt is supporting feedback, not the payoff.

## Ownership and non-goals

Respect attachment ownership and masslineController. All impulses use physicsAuthority. Release is ballistic; target prediction may guide the player but never steer the released body. Existing constraints, save behavior and specialist counters remain real.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Sweep across three crossing targets, a partly occluded load and a stationary anchor. The candidate must not flicker every tick, but moving decisively to another target must switch without waiting for a long lock timer.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** In ordinary combat acquire a light body, orbit an obstacle, throw it into a heavy, then use the same rope for a salvage/industrial task.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/massline-break-recovery.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/massline-break-recovery.test.mjs)
- [`test/pq-031-00-bolas-throw.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-031-00-bolas-throw.test.mjs)
- [`test/throwable-credit-chip.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/throwable-credit-chip.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/massline-break-recovery.test.mjs test/pq-031-00-bolas-throw.test.mjs test/throwable-credit-chip.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
