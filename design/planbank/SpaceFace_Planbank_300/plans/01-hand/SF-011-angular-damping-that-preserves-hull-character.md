# SF-011 — Angular damping that preserves hull character

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE HAND · PQ-137, PQ-164, PQ-189; CV-HAND · [WF-15](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md) / [WF-14](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/01-hand.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Reduce unwanted heading oscillation only through the active rotational controller, retaining different heavy/light turn behavior.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Lerp on mesh rotation hides sim error; universal high drag makes every hull feel identical.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/flightV3.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/flightV3.js) | [`flightV3`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/flightV3.js#L114) |
| [`src/core/flight/propulsionKernel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/propulsionKernel.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/core/flight/propulsionCatalog.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/propulsionCatalog.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/core/flight/flightTelemetry.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/flightTelemetry.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the raw action through dynamicFlightStick/input into flightV3 and the selected kernel. Record where the proposed behavior is already represented; change the narrowest live owner.
2. **Implement the chosen mechanism.** Instrument heading error, yaw rate and saturated torque in the V3 kernel. If oscillation is reproduced, use damping tied to the selected inertia/torque profile rather than a universal rotation lerp. Clamp requested angular acceleration and avoid integral accumulation while torque is saturated or manual input changes sign.
3. **Keep the player-facing chain complete.** Update achieved-motion telemetry and only the functional cue needed to explain the change. Reuse the current ORRERY component.
4. **Cover lifecycle and counterexamples.** Replay equivalent intent at 30, 60 and 144 presentation frames per second with the same 60 Hz simulation. Repeat empty/loaded, normal/G, brake/boost and modal interruption.
5. **Converge on the played result.** Compare time-to-useful-heading, overshoot and collision outcomes, then play the same combat setup. Retain the existing tuning unless the named failure and the proposed improvement both occur.

## Ownership and non-goals

Preserve raw input/actions semantics and assisted settling. Input produces intent; V3 and the propulsion kernel produce physical commands. Presentation reads achieved motion. Never make camera zoom or rendering cadence change thrust.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Apply small and large step turns to three existing hull profiles, empty and loaded. Compare overshoot and settle time with the current version; a heavy hull must not gain instant light-fighter turns and rapid reversals must not accumulate a kick.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Start the ordinary flight route, toggle G, fight a moving target, coast and brake with an empty and loaded hold, then dock and undock.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/flightV3.spec.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/flightV3.spec.mjs)
- [`test/travel-latch.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/travel-latch.test.mjs)
- [`test/propulsion-spawned-ship-authority.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/propulsion-spawned-ship-authority.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/flightV3.spec.mjs test/travel-latch.test.mjs test/propulsion-spawned-ship-authority.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
