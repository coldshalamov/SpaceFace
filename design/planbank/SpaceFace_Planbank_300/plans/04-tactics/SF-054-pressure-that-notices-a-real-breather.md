# SF-054 — Pressure that notices a real breather

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE FIGHT · PQ-140, PQ-174, PQ-175, PQ-206; CV-AMMO · [WF-02](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md) / [WF-15](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/04-tactics.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Let the director lower pressure when the player has actually created temporary safety, not merely when an abstract timer expires.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Timer-only waves ignore mastery; instant healing replaces the positional reward.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/ai/shipDecision.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/shipDecision.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ai/engagementAuthority.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/engagementAuthority.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ai/director.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/director.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/aiPorts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aiPorts.js) | [`aiPorts`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aiPorts.js#L81) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Locate the existing doctrine, sensor facts and final action authorization for the role. Decide whether this is a role extension or a composition change.
2. **Implement the chosen mechanism.** Use current perceived threats and role commitment windows to derive a bounded low-pressure interval. Keep distant dormant enemies from counting like immediate attackers, but retain dangerous incoming shots and committed reinforcements. Reward the interval with time to recover position, not automatic free healing.
3. **Keep the player-facing chain complete.** Compose the role with a contrasting existing role in reachable authored encounter data. Preserve enough light bodies and navigable space for the player to act.
4. **Cover lifecycle and counterexamples.** Exercise three contexts, target death, jurisdiction changes and loss of visibility. Inspect emitted intent plus authorization, not merely selected AI state.
5. **Converge on the played result.** Watch the approach without reading a label. Retune spacing/timing if the role cannot be understood or if coordinated enemies remove all simultaneous escape options.

## Ownership and non-goals

Do not edit legacy ai.js for normal gameplay. Perception and squad votes are advisory; engagementAuthority must still authorize final hostile action. Neutral job labels are not permission to attack.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Compare a clean displacement of threats, one hidden active sniper and a nearly empty arena. Breathing room should follow real safety and end when a new threat becomes actionable; it must not be farmable by jittering across a distance threshold.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Meet the role through ordinary spawning in open space, near a physical obstruction, and beside neutral traffic; repeat with and without the tool it counters.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/law-responder-doctrine.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/law-responder-doctrine.test.mjs)
- [`test/ai-engagement-authority.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/ai-engagement-authority.test.mjs)
- [`test/depth-program-k1-tactical.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/depth-program-k1-tactical.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/law-responder-doctrine.test.mjs test/ai-engagement-authority.test.mjs test/depth-program-k1-tactical.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
