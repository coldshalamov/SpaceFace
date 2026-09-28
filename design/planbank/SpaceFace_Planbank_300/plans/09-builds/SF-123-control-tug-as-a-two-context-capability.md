# SF-123 — Control-Tug as a two-context capability

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE LONG GAME · PQ-142, PQ-155, PQ-156, PQ-176; CV-HAND · [WF-07](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md) / [WF-05](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/09-builds.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Make the current winch-and-charge-rack combination earn its identity in both combat positioning and a difficult industrial recovery.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

A dedicated tug minigame fragments controls; free synergy stats obscure what the modules actually do.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/ships.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js) | [`ships`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js#L1423) |
| [`src/systems/buildIdentity.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/buildIdentity.js) | [`buildIdentity`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/buildIdentity.js#L267) |
| [`src/data/modules.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/modules.js) | [`MODULES`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/modules.js#L684) |
| [`src/data/synergies.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/synergies.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/shipCapabilities.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/shipCapabilities.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the existing module, capability and synergy catalogs before minting an ID. Prefer a changed interaction or meaningful fitting tradeoff to a duplicate module.
2. **Implement the chosen mechanism.** Reuse control_tug and existing head/charge mechanics. Select one heavy displacement setup and one constrained load extraction, with direct gun/mining alternatives that are slower or riskier. Keep power drain and fitting cost visible through the same derived-stat path; do not add a new tug-only interaction key.
3. **Keep the player-facing chain complete.** Teach the capability through a reachable situation and show its physical expression on the ship/tool where the existing art pipeline supports it.
4. **Cover lifecycle and counterexamples.** Test slot limits, refusal rollback, destroyed equipment, save migration and combinations with at least two other modules. Detect dominates-everything loadouts.
5. **Converge on the played result.** Play two contexts and compare an unfitted baseline. Remove bonuses that produce only a bigger number with no changed decision.

## Ownership and non-goals

Ships owns derived stats. Do not serialize a second truth for a fitted capability. Keep fitting refusal transactional, information honest and acquisition reachable through the existing economy/tech paths.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Complete both setups with the combination, with only the winch and with a generalist. The combined fit should open a distinct sequence, not merely shorten every action by a percentage, and removing a module removes only its real capability.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Acquire the milestone normally, fit it at the current service, demonstrate two distinct uses outside the shop, then refit back and reload the save.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/inference-hawser-tug.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/inference-hawser-tug.test.mjs)
- [`test/pq-029-03-npc-heads.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-029-03-npc-heads.test.mjs)
- [`test/massline-tractor-head.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/massline-tractor-head.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/inference-hawser-tug.test.mjs test/pq-029-03-npc-heads.test.mjs test/massline-tractor-head.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
