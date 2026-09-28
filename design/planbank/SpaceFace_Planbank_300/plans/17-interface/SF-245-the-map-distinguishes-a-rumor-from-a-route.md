# SF-245 — The map distinguishes a rumor from a route

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE INSTRUMENT — functional integration, not parallel redesign · Current ORRERY direction; PQ-163, PQ-164, PQ-165 · [WF-14](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md) / [WF-07](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/17-interface.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Give uncertain discoveries an actionable but explicitly incomplete map treatment instead of drawing a precise navigable marker before the player has earned its location.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

A precise question-mark pin leaks the answer; withholding every hint makes discovery guesswork.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/ui/orrery`](https://github.com/coldshalamov/SpaceFace/tree/c92756afb46a9115d47e9d1757369678023efce4/src/ui/orrery) | Inspect the active component and nearest nested AGENTS.md. |
| [`src/ui/screens/localmap.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/screens/localmap.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ui/controlPrompts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/controlPrompts.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/world/worldRecords.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/world/worldRecords.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the live screen and its ORRERY primitives. Trace the user task to its canonical command/receipt, noting existing behavior before adding controls.
2. **Implement the chosen mechanism.** Read existing discovery/scan knowledge and current local-map marker types. Render the available region or bearing with the existing ORRERY vocabulary, state the next investigative action, and enable exact navigation only when the canonical knowledge supports it. Keep rumor presentation separate from collision/world placement data.
3. **Keep the player-facing chain complete.** Make the action transactional: disable/announce pending state, handle stale data and restore focus to a valid target on close or removal.
4. **Cover lifecycle and counterexamples.** Test empty/full/long content, remapped input, high DPI/viewport changes, reduced motion and an entity/item disappearing mid-selection. Walk every changed control.
5. **Converge on the played result.** Use current ui-bench shot IDs discovered from its manifest and inspect the real screen over the game. A mocked DOM route or unviewed PNG does not establish visual acceptance.

## Ownership and non-goals

Screens compose existing ORRERY library elements. UI reads sim state and emits intents; no credits/cargo/physics writes. Preserve focus, pause ownership, remaps and reduced-motion semantics. Foreign dirty exact paths stay protected.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Open the map before a clue, after a directional clue and after a complete scan. A curious player can act at each stage, but the map must not reveal hidden exact coordinates through selection text, focus ordering or an invisible route line.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Perform the named task from a normal screen entry using pointer and keyboard/controller focus, cancel it, reopen it and complete it while state changes underneath.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/world-retention-resource-compaction.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/world-retention-resource-compaction.test.mjs)
- [`test/localmap-sell-course.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/localmap-sell-course.test.mjs)
- [`test/localmap-zoom-anchor.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/localmap-zoom-anchor.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/world-retention-resource-compaction.test.mjs test/localmap-sell-course.test.mjs test/localmap-zoom-anchor.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
