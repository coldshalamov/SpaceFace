# SF-220 — Aftermath variants with the same recognizable origin

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE PICTURE · PQ-190, PQ-193, PQ-159; CV-GLASS, CV-PAINT, CV-MOTION · [WF-11](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-11_GRAPHICS_ASSET_FAMILIES_AND_WORLD_DRESSING.md) / [WF-12](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md) / [WF-03](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/15-picture.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Build or refine one wreck family whose intact, newly broken and stripped states clearly belong to the same authored hull and preserve useful physical features.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Generic wreck substitutes lose history; a detailed wreck with incorrect collision frustrates salvage.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/render/tabletopPolicy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/tabletopPolicy.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/entityMeshVisibility.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/entityMeshVisibility.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/wholeShipLodPolicy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/wholeShipLodPolicy.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`tools/blender/forge/FORGE.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/tools/blender/forge/FORGE.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/illustratedSurface.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/illustratedSurface.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/industrialMaterialFamilies.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/industrialMaterialFamilies.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Inspect the current authored asset/runtime mapping and a same-camera live image before changing art. A file omitted from the packet is not a missing repository asset.
2. **Implement the chosen mechanism.** Use Forge/source-to-release mapping and current hull fracture/aftermath placement. Keep matching major landmarks and local coordinate conventions, expose salvage sockets in the relevant state and align collision to the surviving body. Use bounded shared materials and LOD rather than unrelated generic debris models.
3. **Keep the player-facing chain complete.** For camera changes preserve aiming projection and encounter context; for LOD changes preserve the signature silhouette and detach owned resources safely.
4. **Cover lifecycle and counterexamples.** Test near/far transitions, broadside/front view, contact, dock approach, active effects and pause/revisit. Read pixel geometry at the shipping camera, not only a turntable.
5. **Converge on the played result.** Compare before/after with identical framing and lighting. Reject beautiful standalone art that makes navigation, target acquisition or authored identity worse.

## Ownership and non-goals

Ship bodies use Forge and the current material language. Manifest/release/runtime evidence outranks prose inventory. Keep on-screen authored bodies, collision truth, physical sockets and silhouette identity across LOD; do not fix performance by lowering default art quality.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Destroy the hull, revisit its wreck and strip a component. The player can recognize what happened, the body never changes scale/origin abruptly and visible salvage features correspond to actual interactions.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Use the normal flight camera around the player, one enemy and one destination, then inspect close/medium/distant presentation and a return after streaming.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/tabletop-policy.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/tabletop-policy.test.mjs)
- [`test/ship-kit-shared-roles.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/ship-kit-shared-roles.test.mjs)
- [`test/first-use-keys-1c-shared-roles.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/first-use-keys-1c-shared-roles.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/tabletop-policy.test.mjs test/ship-kit-shared-roles.test.mjs test/first-use-keys-1c-shared-roles.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
