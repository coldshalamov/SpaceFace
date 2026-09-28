# SF-063 — Earned breathing room that survives burst kills

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE FIGHT · PQ-174, PQ-175, PQ-169; CV-AMMO · [WF-02](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md) / [WF-07](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md) / [WF-17](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/05-swarm.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Preserve the current pressure reservoir's reward for a substantial clear when several kills and replacement requests occur in the same simulation tick.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

An extra cooldown layered over the reservoir conflicts with it; instant refill punishes strong play.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/survivalWavePlanner.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalWavePlanner.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/survivalRun.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalRun.js) | [`survivalRun`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalRun.js#L96) |
| [`src/systems/swarmArena.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmArena.js) | [`swarmArena`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/swarmArena.js#L398) |
| [`src/systems/survivalWave.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalWave.js) | [`survivalWave`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalWave.js#L114) |
| [`src/data/swarmMode.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/swarmMode.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read planWave, the current act recipe and the run phase that consumes it. Preserve seed and semantic hash behavior unless the content intentionally changes.
2. **Implement the chosen mechanism.** Reproduce burst-clear accounting through the Swarm pressure callbacks. Aggregate the eligible kill hole before authorizing replacement spend, retain the finite quota and telegraph the delayed group. Keep the existing empty-room exception explicit rather than accidentally bypassing every breath when one actor remains.
3. **Keep the player-facing chain complete.** Ensure every actor can materialize and every phase can resolve if a body is disabled, displaced or destroyed out of sequence.
4. **Cover lifecycle and counterexamples.** Run same-seed comparison plus a small deliberately different seed set; test low ammo, odd builds, denied fits and transition save/resume where supported.
5. **Converge on the played result.** Play a complete arc, not just its peak. Preserve readable breathing room and verify the next choice makes the previous fight feel consequential.

## Ownership and non-goals

Keep the wave planner pure and runSession authoritative for run envelopes. Drafts use real fitting APIs; no free stat mutations or Adventure-wallet leakage. Active-body and spawn/materialization budgets remain bounded.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Kill one, three and a larger group at once; repeat with delayed collision deaths. Observe a genuine thinner interval where intended, exact quota conservation and no replacement flood that immediately cancels the earned space.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Enter Swarm from the normal mode selection, finish the opening lesson, make at least one draft decision and reach a later pressure/recovery transition.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/crucible-swarm.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/crucible-swarm.test.mjs)
- [`test/pq-174-01-harvest-waves.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-174-01-harvest-waves.test.mjs)
- [`test/round-zero-teaching-bodies.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/round-zero-teaching-bodies.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/crucible-swarm.test.mjs test/pq-174-01-harvest-waves.test.mjs test/round-zero-teaching-bodies.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
