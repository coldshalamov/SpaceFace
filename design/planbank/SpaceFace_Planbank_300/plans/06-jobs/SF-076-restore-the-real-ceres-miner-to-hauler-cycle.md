# SF-076 — Restore the real Ceres miner-to-hauler cycle

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** conditional repair  
**Basis:** repository-reported issue D89; not reproduced here  
**Domain / current routing:** THE WORLD · PQ-143, PQ-150; CV-DAY, CV-QUIET, CR-CHOIR · [WF-01](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-01_NPC_LIVING_WORLD.md) / [WF-16](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/06-jobs.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Reproduce D89 and restore a loaded refinery approach by fixing the first broken handoff transition, not by injecting cargo or blaming ambient pirates already excluded by eligibility.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Spawning a loaded hauler masks the broken economy; removing predation cannot fix an explicitly excluded victim.

## Before changing code

**Repair gate:** reproduce the stated failure at current HEAD first. A historical ledger row is not a fresh reproduction. If the failure is absent and the intended outcome already holds, report `already satisfied` in the existing task workflow and take the next admitted task; do not invent a replacement bug.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/npcJobs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js) | [`transition`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js#L1036) |
| [`src/systems/npcJobsRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js) | [`npcJobsRuntime`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js#L806) |
| [`src/systems/traffic.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js) | [`traffic`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js#L1312) |
| [`src/ai/ambientPredation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/ambientPredation.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/cargoCustody.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`test/pq-138-05-evidence-ledger.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-138-05-evidence-ledger.test.mjs) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

Read the resolved implementation specification: [deep dive](../../deep-dives/02-ceres-custody.md).

## Implementation sequence

1. **Locate the live seam.** Find the live job and its actual producer/consumer. Name what the worker is trying to finish and the observable evidence of progress.
2. **Implement the chosen mechanism.** Inspect traffic.ceresMinerHaulerHandoff requested/rendezvous/in_transit/delivered/interrupted states, miner output and hauler capacity. Trace stable actor identities and the actual ore receipt, then repair the narrow owner that loses progress or custody. Preserve the activityActorSlotId predation exclusion and use short stage-level tests before the long scenario.
3. **Keep the player-facing chain complete.** Add a player opportunity that emerges from the interruption and a bounded consequence when ignored. Keep lawful authorization and neutral IFF intact.
4. **Cover lifecycle and counterexamples.** Test solo worker, partner death, blocked berth, full hold and offscreen/reentry. Count real transfers and persistence pins, not decorative route laps.
5. **Converge on the played result.** Watch at least one complete work cycle. Remove explanatory barks that merely narrate absent physical work; make the work itself legible first.

## Ownership and non-goals

Use the current occupation/job runtime, spawnBudget and canonical cargo/repair/economy owners. A civilian route is not a new AI engine. Persist stable job/world identity; release only persistence marks owned by the job.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Observe a real mined lot transferred, carried through the approach and delivered once. Kill the miner before transfer, the hauler after transfer and reload at rendezvous; no magic replacement load or increased timeout counts as a fix.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Observe an ordinary activity pocket without accepting a mission, interfere nonviolently, provoke a threat, leave and return; the occupation must still make sense.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/ceres-activity-traffic-cast.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/ceres-activity-traffic-cast.test.mjs)
- [`test/traffic-miner-field-locality.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/traffic-miner-field-locality.test.mjs)
- [`test/pq-138-05-evidence-ledger.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-138-05-evidence-ledger.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/ceres-activity-traffic-cast.test.mjs test/traffic-miner-field-locality.test.mjs test/pq-138-05-evidence-ledger.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
