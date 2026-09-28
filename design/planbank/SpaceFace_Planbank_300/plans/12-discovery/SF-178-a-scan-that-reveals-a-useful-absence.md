# SF-178 — A scan that reveals a useful absence

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE WORLD · PQ-153, PQ-154; CR-HOLLOW, CR-BERTH, CR-TEXTURE · [WF-03](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md) / [WF-04](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md) / [WF-10](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-10_EXPLORATION_DISCOVERY_AND_MYSTERY.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/12-discovery.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Let one existing investigation infer that something expected is missing—an unloaded carrier, abandoned berth or stripped component—from real world state and supporting traces.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Invented certainty breaks investigation; a generic 'empty' label misses the story potential.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/scanReveal.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanReveal.js) | [`scanReveal`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanReveal.js#L27) |
| [`src/systems/scanner.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanner.js) | [`scanner`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanner.js#L806) |
| [`src/systems/uniqueWrecks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/uniqueWrecks.js) | [`uniqueWrecks`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/uniqueWrecks.js#L280) |
| [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/data/sectorCompositions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/sectorCompositions.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the sector anchor/site and nearby occupations. Choose a destination that fills a spatial or functional gap without scattering unrelated landmarks.
2. **Implement the chosen mechanism.** Reuse scan layers and site/manifest truth. Present the observable absence first, then one corroborating clue and an actionable next step through an existing contact/route. Do not fabricate the missing object or force a predetermined culprit; preserve uncertainty if provenance is incomplete.
3. **Keep the player-facing chain complete.** Give the place a stable address, truthful approach geometry, a normal state and a changed return state. Keep distant detail cheap and nearby detail interactable.
4. **Cover lifecycle and counterexamples.** Test reversed clue order, partial scans, revisit, missing actor, cargo full and save at discovery. Prevent duplicate rewards and mark stale information honestly.
5. **Converge on the played result.** Fly the route without its plan open. If it is only distinguishable through a nameplate, improve silhouette, layout, behavior or sound rather than adding more prose.

## Ownership and non-goals

Use existing scanner, site and world-record owners. Distinguish knowledge from reward entitlement. Coordinate-space transforms and persistent world identity must remain consistent across map, collision and materialization.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Inspect before removal, after legitimate delivery and after theft. The scan must distinguish those supported states where evidence exists and explicitly leave the cause unknown when it does not.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Notice a clue during ordinary travel, follow it using movement/scanner/terrain, act on the discovery, leave, and make practical use of remembering the place.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/depth-program-r2-deepsurvey.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/depth-program-r2-deepsurvey.test.mjs)
- [`test/scan-wreck-provenance.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/scan-wreck-provenance.test.mjs)
- [`test/seam-scan-reveal.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/seam-scan-reveal.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/depth-program-r2-deepsurvey.test.mjs test/scan-wreck-provenance.test.mjs test/seam-scan-reveal.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
