# SF-297 — Combat pressure clears into audible breathing room

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** integration  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** Cross-lane, one integration owner per selected slice · CV-HAND, CV-DAY, CV-SO, CR-CHAIN, CR-TEXTURE; existing finishing lanes · [WF-17](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md) / [WF-18](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md) / [WF-16](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/20-slices.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Align one real pressure-release transition across enemy commitment, camera, audio and effects so earned safety can be felt without a banner announcing it.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

A timed music break can misreport danger; clearing the arena by script steals the player's earned result.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`design/VISION.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/VISION.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`design/FEEL_CONTRACT.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/FEEL_CONTRACT.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/encounterDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js) | [`encounterDirector`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js#L241) |
| [`src/systems/presentationOrchestrator.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js) | [`presentationOrchestrator`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js#L62) |
| [`src/systems/aftermathWrecks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aftermathWrecks.js) | [`aftermathWrecks`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aftermathWrecks.js#L861) |
| [`src/ai/director.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/director.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/swarmArena.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmArena.js) | [`swarmArena`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmArena.js#L398) |
| [`src/audio/cuePriorityBus.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/cuePriorityBus.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/cameraDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/cameraDirector.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the actual route across the named owners and find where its intended causality is lost. Treat existing implemented features as assets to connect, not excuses to duplicate.
2. **Implement the chosen mechanism.** Use the existing director/Swarm reservoir's authoritative low-pressure state and current hostile commitments. Let the camera and mix relax only when danger actually recedes, retain incoming projectile warnings and allow debris/aftermath to carry the scene. Do not heal or remove surviving enemies to manufacture calm.
3. **Keep the player-facing chain complete.** Make success, failure and interruption all lead somewhere playable. Ensure story, sound and VFX report the same physical event rather than separate scripts.
4. **Cover lifecycle and counterexamples.** Exercise the normal route, a deliberate mistake and a repeated visit; run only checks that cover the changed causal seams.
5. **Converge on the played result.** Have a stronger reviewer inspect the actual sequence and changed code together. Fix disconnected causality or thin content before adding breadth; closure is implementation/accepted, not an approval document.

## Ownership and non-goals

Borrow existing owners; do not introduce a super-manager, a second queue or a release signoff gate. Each slice must change real reachable play and preserve the current owner fantasy and role separation.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Create a real clear, leave a committed sniper active and trigger a delayed incoming attack in separate runs. Presentation should relax only in the genuinely safer case and react smoothly when danger returns, with no misleading silence during an active threat.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Play the complete before/after sequence from its ordinary entry, including an imperfect outcome and a return visit where relevant.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/save-growth-dock-trade-flat.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/save-growth-dock-trade-flat.test.mjs)
- [`test/pq-149-02-ordinary-life.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-149-02-ordinary-life.test.mjs)
- [`test/pq-149-00-session-rhythm.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-149-00-session-rhythm.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/save-growth-dock-trade-flat.test.mjs test/pq-149-02-ordinary-life.test.mjs test/pq-149-00-session-rhythm.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
