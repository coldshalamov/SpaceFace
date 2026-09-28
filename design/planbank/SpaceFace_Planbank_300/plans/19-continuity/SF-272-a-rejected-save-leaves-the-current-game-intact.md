# SF-272 — A rejected save leaves the current game intact

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE MACHINE / THE HAND / THE LONG GAME · PQ-164, PQ-165, PQ-186; CV-SO · [WF-18](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md) / [WF-19](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md) / [WF-14](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/19-continuity.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Ensure an invalid or incompatible save is rejected before destructive restore and leaves the current campaign, screen and input ownership usable.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Clearing the world before validation destroys recoverability; relaxing import limits creates a new failure surface.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/save/saveSystem.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/saveSystem.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/save/migrations.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/migrations.js) | [`MIGRATIONS`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/migrations.js#L104) |
| [`src/core/runTransitionGuard.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/runTransitionGuard.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ui/screenManager.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/screenManager.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Map persistent versus transient fields and their sole owners. Read existing migration/restore sequencing and current tests before adding any new saved field.
2. **Implement the chosen mechanism.** Reuse the existing candidate validation, bounds and normalization path. Reproduce the chosen failure boundary, prevent partial owner mutation before validation completes and route a concise error through the current surface. Preserve import size/depth/node limits and valid older migrations; do not accept malformed records merely to make a fixture load.
3. **Keep the player-facing chain complete.** Restore user-facing context such as selected destination and actionable refusal without replaying expired one-shot effects or stale held input.
4. **Cover lifecycle and counterexamples.** Test malformed/old saves, interleaved transitions, destroyed/recycled entity IDs, storage refusal and repeated resume in isolated slots. Verify exact resources and receipts.
5. **Converge on the played result.** Complete the route through Browser and the same game path used by Electron where available. Report untested shell behavior honestly; no separate gameplay logic is allowed.

## Ownership and non-goals

Preserve atomic restore, settings normalization, transient request ownership and one shared Browser/Electron game path. Never use the real player save directory in tests or loosen import safety to accept malformed data.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Import malformed, oversized and semantically invalid candidates while a valid isolated campaign is active, then continue playing and load a valid older save. Credits, cargo, world identity and selected route remain unchanged after each rejected candidate.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Perform the actual player action, interrupt at its meaningful boundary, load or resume through normal entry, then continue the same task without duplicate rewards or lost input.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/time-effects.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/time-effects.test.mjs)
- [`test/career-ladders-contract.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/career-ladders-contract.test.mjs)
- [`test/save-import-bounds.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/save-import-bounds.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/time-effects.test.mjs test/career-ladders-contract.test.mjs test/save-import-bounds.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
