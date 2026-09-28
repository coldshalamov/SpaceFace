# SF-138 — The Borrowed Tug: recover without owning the tool

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE WORLD / THE LONG GAME · PQ-152, PQ-171, PQ-178; CR-CHAIN · [WF-08](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-08_MISSIONS_HEISTS_CONTRACTS_AND_WORLD_ACTIVITIES.md) / [WF-17](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/10-missions.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Author a compact recovery job where a disabled freight body can be moved by the player's line, by recruiting an existing tender/salvor, or by redirecting a local field.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

A mandatory purchased tool blocks the premise; a summoned helper with no job feels artificial.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/missions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/missions.js) | [`missions`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/missions.js#L1085) |
| [`src/systems/encounterDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js) | [`encounterDirector`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterDirector.js#L241) |
| [`src/systems/encounterScripts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/encounterScripts.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/data/missions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/missions.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/salvageActions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/salvageActions.js) | [`salvageActions`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/salvageActions.js#L109) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Select an existing appropriate encounter shape and mission owner. Check the live catalog for an equivalent authored job; extend it instead of duplicating.
2. **Implement the chosen mechanism.** Reuse a current salvage/director shape and place the load, safe berth, worker and useful terrain together. Commitment begins when custody or help is requested; a threat or moving obstruction complicates the route. Success requires actual delivery, while a damaged load opens a smaller salvage settlement and the helper returns to work.
3. **Keep the player-facing chain complete.** Route rewards, law and faction reactions through the director facade. Stable scene records retain only durable outcomes, not expired combat timers.
4. **Cover lifecycle and counterexamples.** Test both approaches, premature target destruction, actor loss, leaving mid-job, duplicate resolution and save at the commitment boundary.
5. **Converge on the played result.** Play through both success and a recoverable failure at normal camera. A briefing row, scattered props or a hold-E interaction is not this packet completed.

## Ownership and non-goals

Use the existing mission/director/script ownership, scoped seeded streams and consequence helpers. Only write encounter-owned state or actor fields explicitly owned by it. Persistent choices go through canonical world/story/economy owners.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Complete all three approaches, lose the helper and leave after partial progress. The scene remains populated and coherent, custody is conserved and no reward occurs from merely selecting an assistance option.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Discover the offer normally, fly to its physically placed scene, assess without reading a wall of text, commit, encounter the complication and return to the changed place.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/mission-shape-depth.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/mission-shape-depth.test.mjs)
- [`test/e6-encounter-shape-budget.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/e6-encounter-shape-budget.test.mjs)
- [`test/d59-hunter-route-damage.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/d59-hunter-route-damage.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/mission-shape-depth.test.mjs test/e6-encounter-shape-budget.test.mjs test/d59-hunter-route-damage.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
