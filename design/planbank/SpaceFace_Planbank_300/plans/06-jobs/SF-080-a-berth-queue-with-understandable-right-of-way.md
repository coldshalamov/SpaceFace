# SF-080 — A berth queue with understandable right of way

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE WORLD · PQ-143, PQ-150; CV-DAY, CV-QUIET, CR-CHOIR · [WF-01](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-01_NPC_LIVING_WORLD.md) / [WF-16](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/06-jobs.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Make a busy working berth exhibit a short physical waiting pattern instead of overlapping haulers or invisible reservations.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Teleporting deliveries hides traffic; unlimited waits turn one obstruction into a permanent dead economy.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/npcJobs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/npcJobsRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js) | [`npcJobsRuntime`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js#L806) |
| [`src/systems/traffic.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js) | [`traffic`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js#L1312) |
| [`src/systems/stationSideEventDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stationSideEventDirector.js) | [`stationSideEventDirector`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stationSideEventDirector.js#L82) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Find the live job and its actual producer/consumer. Name what the worker is trying to finish and the observable evidence of progress.
2. **Implement the chosen mechanism.** Extend the current job destination/reservation seam with stable arrival order and bounded holding points outside the active corridor. A blocked berth releases or expires only its owner's reservation; workers can divert after a legitimate timeout. Keep movement with npcJobsRuntime and avoid a second station traffic manager.
3. **Keep the player-facing chain complete.** Add a player opportunity that emerges from the interruption and a bounded consequence when ignored. Keep lawful authorization and neutral IFF intact.
4. **Cover lifecycle and counterexamples.** Test solo worker, partner death, blocked berth, full hold and offscreen/reentry. Count real transfers and persistence pins, not decorative route laps.
5. **Converge on the played result.** Watch at least one complete work cycle. Remove explanatory barks that merely narrate absent physical work; make the work itself legible first.

## Ownership and non-goals

Use the current occupation/job runtime, spawnBudget and canonical cargo/repair/economy owners. A civilian route is not a new AI engine. Persist stable job/world identity; release only persistence marks owned by the job.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Send three workers to one berth, destroy the first and occupy a hold point. They should queue or divert without overlapping, deadlocking or losing cargo; a player crossing the lane must not acquire an invisible collision wall.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Observe an ordinary activity pocket without accepting a mission, interfere nonviolently, provoke a threat, leave and return; the occupation must still make sense.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/npc-jobs-runtime-wiring.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/npc-jobs-runtime-wiring.test.mjs)
- [`test/presence-repairs.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/presence-repairs.test.mjs)
- [`test/salvor-occupation.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/salvor-occupation.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/npc-jobs-runtime-wiring.test.mjs test/presence-repairs.test.mjs test/salvor-occupation.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
