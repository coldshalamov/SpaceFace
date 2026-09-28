# SF-158 — A faction response expressed through work and access

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE WORLD / THE LONG GAME · PQ-149, PQ-150, PQ-151, PQ-154; CV-SO, CR-WEIR · [WF-09](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-09_NARRATIVE_CHARACTERS_AND_LEDGER.md) / [WF-16](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/11-consequences.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Make one existing reputation/memory threshold change a physical service or work pattern at a familiar berth, not merely the price multiplier and color of a name.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Price-only changes lack embodiment; spawning a faction fleet over a small rep change is excessive.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/moralMemory.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/moralMemory.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/lawSecurity.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/lawSecurity.js) | [`lawSecurity`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/lawSecurity.js#L185) |
| [`src/systems/heat.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/heat.js) | [`heat`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/heat.js#L223) |
| [`src/systems/factions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/factions.js) | [`factions`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/factions.js#L194) |
| [`src/systems/stationContacts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stationContacts.js) | [`stationContacts`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stationContacts.js#L177) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Identify the existing event and stable loss/actor/site identity. Use actual causal provenance rather than inferring blame from proximity.
2. **Implement the chosen mechanism.** Select an existing faction-owned location and current threshold. Use canonical rep state to enable a legitimate service route, change a patrol's welcome distance or assign a known worker to help. Keep the effect bounded and reversible where current policy requires; do not invent another faction.
3. **Keep the player-facing chain complete.** Send heat, rep, credits and mission consequences through their owners. Preserve lawful final-fire authorization and witness absence cases.
4. **Cover lifecycle and counterexamples.** Test absent/mistaken witnesses, actor death, repeated discovery, save/revisit and two consequences arriving together. Verify no double restitution or inherited false guilt.
5. **Converge on the played result.** Play the first and returning visit. The changed berth, route, job or body must carry the story even with subtitles and optional lore skipped.

## Ownership and non-goals

Preserve canonical heat/faction writers and provenance. Knowledge is local evidence, not an omniscient police feed. Do not overwrite mission-bearing labels with unrelated ledger events. Consequence rewards are idempotent.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Cross the threshold legitimately, fall back below it and load an old save near it. The place changes coherently, transactions already accepted remain honored and no hidden hostility switch contradicts current law authority.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Cause or witness the relevant event, leave, meet the affected actor/service or find the wreck again, then take a physical action that changes the consequence.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/law-causal-truth.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/law-causal-truth.test.mjs)
- [`test/pq048-lawful-cargo-inspection.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq048-lawful-cargo-inspection.test.mjs)
- [`test/save-growth-dock-trade-flat.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/save-growth-dock-trade-flat.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/law-causal-truth.test.mjs test/pq048-lawful-cargo-inspection.test.mjs test/save-growth-dock-trade-flat.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
