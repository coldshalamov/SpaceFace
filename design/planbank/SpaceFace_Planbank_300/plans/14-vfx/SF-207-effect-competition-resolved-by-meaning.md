# SF-207 — Effect competition resolved by meaning

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE PICTURE / THE HAND · PQ-134, PQ-139; CV-HAND, CV-AMMO · [WF-12](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/14-vfx.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

In dense combat, preserve the few cues that change the next player action while allowing low-priority residue to simplify gracefully without deleting the authored effect families.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Equal-intensity effects become noise; disabling expensive families sacrifices the game's identity.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/render/vfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/vfx.js) | [`vfx`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/vfx.js#L1106) |
| [`src/render/actionVfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/actionVfx.js) | [`ActionVfx`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/actionVfx.js#L58) |
| [`src/render/bombPresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/bombPresentation.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/presentationOrchestrator.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js) | [`presentationOrchestrator`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js#L62) |
| [`src/presentation/cueRecipes.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/presentation/cueRecipes.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the real simulation event through normalization, recipe, render owner and lifetime cleanup. Fix a missing connection before inventing another effect emitter.
2. **Implement the chosen mechanism.** Reuse current presentation importance and pool/admission logic. Rank local imminent danger, the player's current verb and earned major impact above distant aftermath; reduce nonessential density/lifetime within existing design limits rather than default quality settings. Keep simulation events untouched and avoid a new global presentation manager.
3. **Keep the player-facing chain complete.** Reserve brightness/occlusion budget for the event that demands a player response. Reuse current audio/camera cue family rather than fan out duplicate events.
4. **Cover lifecycle and counterexamples.** Test overlapping instances, reused slots, skipped presentation frames, paused simulation, camera changes and accessibility settings. Verify cleanup and zero double emission.
5. **Converge on the played result.** View normal and reduced-effects-information modes at shipping camera. A frame-perfect screenshot is insufficient for a motion effect: inspect the whole grow/persist/dissipate cycle.

## Ownership and non-goals

VFX never changes simulation outcomes. Read fenced presentation state and the correct clock. Use authored geometry/strands/surfaces, not camera-facing fuzzy discs. Maintain ownership, pool reset, reduced-motion/flash information and default visual quality.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Trigger a boss attack, a field, pickups and multiple deaths together. Critical geometry remains readable, no important event is silently lost and quieter scenes restore full authored detail automatically.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Trigger the effect through normal gameplay at normal zoom in open space, beside a bright station and inside a mixed Swarm fight.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq023-corridor-cues.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq023-corridor-cues.test.mjs)
- [`test/pq-133-04-r4-presentation.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-133-04-r4-presentation.test.mjs)
- [`test/inf-041-weapon-impact-sync.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/inf-041-weapon-impact-sync.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq023-corridor-cues.test.mjs test/pq-133-04-r4-presentation.test.mjs test/inf-041-weapon-impact-sync.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
