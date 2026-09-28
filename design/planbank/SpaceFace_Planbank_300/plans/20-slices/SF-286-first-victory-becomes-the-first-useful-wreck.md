# SF-286 — First victory becomes the first useful wreck

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** integration  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** Cross-lane, one integration owner per selected slice · CV-HAND, CV-DAY, CV-SO, CR-CHAIN, CR-TEXTURE; existing finishing lanes · [WF-17](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md) / [WF-18](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md) / [WF-16](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/20-slices.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Connect one early ordinary fight to a tangible salvage decision and a modest existing upgrade, so combat, aftermath and ship ownership form one memorable loop.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

An unrelated tutorial reward breaks causality; mandatory salvage after every fight turns victory into chores.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`design/VISION.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/VISION.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`design/FEEL_CONTRACT.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/FEEL_CONTRACT.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/onboarding.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/onboarding.js) | [`onboarding`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/onboarding.js#L293) |
| [`src/systems/encounterDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js) | [`encounterDirector`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js#L241) |
| [`src/systems/missions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/missions.js) | [`missions`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/missions.js#L1085) |
| [`src/systems/presentationOrchestrator.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js) | [`presentationOrchestrator`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js#L62) |
| [`src/systems/aftermathWrecks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aftermathWrecks.js) | [`aftermathWrecks`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aftermathWrecks.js#L861) |
| [`src/systems/salvageActions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/salvageActions.js) | [`salvageActions`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/salvageActions.js#L109) |
| [`src/systems/cargo.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargo.js) | [`cargo`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargo.js#L312) |
| [`src/systems/ships.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js) | [`ships`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js#L1423) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the actual route across the named owners and find where its intended causality is lost. Treat existing implemented features as assets to connect, not excuses to duplicate.
2. **Implement the chosen mechanism.** Select an existing early encounter and preserve its legal spawn/reward structure. Ensure its meaningful defeated body enters the current aftermath path, place a safe but nontrivial recovery opportunity and route the recovered material through real custody and an existing affordable service. Use optional onboarding attention only when needed; do not manufacture a free upgrade or force the player to salvage.
3. **Keep the player-facing chain complete.** Make success, failure and interruption all lead somewhere playable. Ensure story, sound and VFX report the same physical event rather than separate scripts.
4. **Cover lifecycle and counterexamples.** Exercise the normal route, a deliberate mistake and a repeated visit; run only checks that cover the changed causal seams.
5. **Converge on the played result.** Have a stronger reviewer inspect the actual sequence and changed code together. Fix disconnected causality or thin content before adding breadth; closure is implementation/accepted, not an approval document.

## Ownership and non-goals

Borrow existing owners; do not introduce a super-manager, a second queue or a release signoff gate. Each slice must change real reachable play and preserve the current owner fantasy and role separation.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Begin from a normal new campaign, win by guns or a physical move, ignore or recover the wreck and return to a real service. The recovered value must be traceable to the body and the resulting capability must work in the next outing; refusal still leaves a playable campaign.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Play the complete before/after sequence from its ordinary entry, including an imperfect outcome and a return visit where relevant.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/save-growth-dock-trade-flat.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/save-growth-dock-trade-flat.test.mjs)
- [`test/pq195-09-player-route.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq195-09-player-route.test.mjs)
- [`test/core-first-ten-minute-contract.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/core-first-ten-minute-contract.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/save-growth-dock-trade-flat.test.mjs test/pq195-09-player-route.test.mjs test/core-first-ten-minute-contract.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

- [SF-136 — Put a real crusher into the yard tow-out](../10-missions/SF-136-put-a-real-crusher-into-the-yard-tow-out.md): Only if the chosen early encounter is the yard rescue; otherwise use its current physical owner. An already-working equivalent satisfies this condition; it is not a mandatory new implementation.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
