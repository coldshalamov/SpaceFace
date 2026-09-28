# SF-196 — Diagnose and restore the submitted force-surface shader

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** conditional repair  
**Basis:** repository-reported issue D74; not reproduced here  
**Domain / current routing:** THE PICTURE / THE HAND · PQ-134, PQ-139; CV-HAND, CV-AMMO · [WF-12](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/14-vfx.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Reproduce D74 only on a current failing run, capture the exact submitted shader/program identity and fix the actual compile/link incompatibility rather than renaming an already-correct source token.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Blind token replacement can fix nothing; disabling the family hides a missing combat language.

## Before changing code

**Repair gate:** reproduce the stated failure at current HEAD first. A historical ledger row is not a fresh reproduction. If the failure is absent and the intended outcome already holds, report `already satisfied` in the existing task workflow and take the next admitted task; do not invent a replacement bug.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/render/vfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/vfx.js) | [`vfx`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/vfx.js#L1106) |
| [`src/render/actionVfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/actionVfx.js) | [`ActionVfx`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/actionVfx.js#L58) |
| [`src/systems/presentationOrchestrator.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js) | [`presentationOrchestrator`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js#L62) |
| [`src/presentation/cueRecipes.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/presentation/cueRecipes.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/render/forceLanguage`](https://github.com/coldshalamov/SpaceFace/tree/c92756afb46a9115d47e9d1757369678023efce4/src/render/forceLanguage) | Inspect the active component and nearest nested AGENTS.md. |
| [`src/render/forceLanguage/sweptSurfaceBatch.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/forceLanguage/sweptSurfaceBatch.js) | [`SweptSurfaceBatch`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/forceLanguage/sweptSurfaceBatch.js#L467) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the real simulation event through normalization, recipe, render owner and lifetime cleanup. Fix a missing connection before inventing another effect emitter.
2. **Implement the chosen mechanism.** Instrument the existing shaderLinkReporter/force surface creation with source digest, relevant variant key and driver log. Compare the failing submitted text to sweptSurfaceBatch exports and generated defines. Repair the offending variant or generation path, then retain the full force language; no global disable or silent fallback claim.
3. **Keep the player-facing chain complete.** Reserve brightness/occlusion budget for the event that demands a player response. Reuse current audio/camera cue family rather than fan out duplicate events.
4. **Cover lifecycle and counterexamples.** Test overlapping instances, reused slots, skipped presentation frames, paused simulation, camera changes and accessibility settings. Verify cleanup and zero double emission.
5. **Converge on the played result.** View normal and reduced-effects-information modes at shipping camera. A frame-perfect screenshot is insufficient for a motion effect: inspect the whole grow/persist/dissipate cycle.

## Ownership and non-goals

VFX never changes simulation outcomes. Read fenced presentation state and the correct clock. Use authored geometry/strands/surfaces, not camera-facing fuzzy discs. Maintain ownership, pool reset, reduced-motion/flash information and default visual quality.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Trigger each force family cold and warm on the affected path, including context recovery. The exact formerly failing variant must compile and render, logs identify any new failure and current successful variants remain unchanged.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Trigger the effect through normal gameplay at normal zoom in open space, beside a bright station and inside a mixed Swarm fight.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq023-corridor-cues.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq023-corridor-cues.test.mjs)
- [`test/action-vfx.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/action-vfx.test.mjs)
- [`test/vfx-field-lifecycle.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/vfx-field-lifecycle.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq023-corridor-cues.test.mjs test/action-vfx.test.mjs test/vfx-field-lifecycle.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
