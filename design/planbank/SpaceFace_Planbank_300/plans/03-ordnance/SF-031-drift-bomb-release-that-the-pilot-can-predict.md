# SF-031 — Drift-bomb release that the pilot can predict

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE HAND / THE FIGHT · PQ-147, PQ-205; CV-AMMO, CR-CHAIN · [WF-05](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md) / [WF-02](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md) / [WF-12](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/03-ordnance.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Preserve inherited velocity and make the release origin, arming distance and first bounce form one understandable physical rule.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Fixed world-speed drops break moving combat; long invulnerability lets bombs pass through meaningful terrain.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/data/bombs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/bombs.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/bombs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/bombs.js) | [`bombs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/bombs.js#L222) |
| [`src/render/bombPresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/bombPresentation.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the payload definition and its complete arm/deploy/fuse/detonate/dispose path; reuse a payload where its law already covers the idea.
2. **Implement the chosen mechanism.** Read the current bomb bay release transform and collision grace. Ensure the payload inherits the carrier's actual world velocity exactly once and begins beyond the hull's real collision skin, not a camera-dependent offset. Keep arming time separate from collision response so an unarmed bomb can still bounce harmlessly.
3. **Keep the player-facing chain complete.** Expose ammunition, fuse or state through the existing bay/ORRERY surface only where a player decision needs it. Carry real phase timing into presentation and audio.
4. **Cover lifecycle and counterexamples.** Test release while boosting, own/neutral/enemy bodies, simultaneous explosions, zero ammo, save/transition and pool reuse. Prove accounting once per payload.
5. **Converge on the played result.** Play at normal zoom with other effects enabled. A successful combination must be visibly attributable and a failed one must leave a readable reason and surviving counterplay.

## Ownership and non-goals

Extend the current bay, weapon and field owners rather than creating a second combat subsystem. Maintain owner/team provenance, seeded simulation, real forces and active caps. No damage aura disguised as machinery and no VFX-only force.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Drop at rest, in reverse and during a high-speed turn with three hull sizes. Compare the initial velocity and visible socket; no self-detonation before arming, unexplained backward shot or duplicate inherited speed.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Equip through the ordinary acquisition route, deploy while moving, combine with one field and one tether interaction, then repeat against a civilian-containing encounter.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/bombs.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/bombs.test.mjs)
- [`test/bomb-presentation.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/bomb-presentation.test.mjs)
- [`test/bomb-rack-economy.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/bomb-rack-economy.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/bombs.test.mjs test/bomb-presentation.test.mjs test/bomb-rack-economy.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
