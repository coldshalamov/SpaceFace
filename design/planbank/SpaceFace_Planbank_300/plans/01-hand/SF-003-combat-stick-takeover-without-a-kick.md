# SF-003 — Combat-stick takeover without a kick

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE HAND · PQ-137, PQ-164, PQ-189; CV-HAND · [WF-15](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md) / [WF-14](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/01-hand.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Switching into G mode should adopt a neutral helm unless the player is already giving intentional movement, and switching out should never leave a hidden vector behind.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Clearing every input breaks held keyboard intent; blending stale modes creates unexplained acceleration.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/dynamicFlightStick.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/dynamicFlightStick.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/flightV3.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/flightV3.js) | [`flightV3`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/flightV3.js#L114) |
| [`src/systems/input.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/input.js) | [`input`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/input.js#L666) |
| [`src/systems/autoTargetAssist.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/autoTargetAssist.js) | [`autoTargetAssist`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/autoTargetAssist.js#L65) |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace the raw action through dynamicFlightStick/input into flightV3 and the selected kernel. Record where the proposed behavior is already represented; change the narrowest live owner.
2. **Implement the chosen mechanism.** Trace input-mode arbitration in input and flightV3. Reset only the dynamic-stick state on mode ownership transfer, not all raw axes. Preserve keyboard thrust held through the switch according to the current documented priority, and clear auto-target steering only when its ownership ends. Emit one mode cue from the actual transition.
3. **Keep the player-facing chain complete.** Update achieved-motion telemetry and only the functional cue needed to explain the change. Reuse the current ORRERY component.
4. **Cover lifecycle and counterexamples.** Replay equivalent intent at 30, 60 and 144 presentation frames per second with the same 60 Hz simulation. Repeat empty/loaded, normal/G, brake/boost and modal interruption.
5. **Converge on the played result.** Compare time-to-useful-heading, overshoot and collision outcomes, then play the same combat setup. Retain the existing tuning unless the named failure and the proposed improvement both occur.

## Ownership and non-goals

Preserve raw input/actions semantics and assisted settling. Input produces intent; V3 and the propulsion kernel produce physical commands. Presentation reads achieved motion. Never make camera zoom or rendering cadence change thrust.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Toggle G while coasting, while holding keyboard thrust, while pointer-locked and while a menu opens. No stale acceleration survives; the first new input takes effect on the next simulation step. Verify target lock and brake still work.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Start the ordinary flight route, toggle G, fight a moving target, coast and brake with an empty and loaded hold, then dock and undock.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/arcade-draw-input.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/arcade-draw-input.test.mjs)
- [`test/input-lifecycle.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/input-lifecycle.test.mjs)
- [`test/pursuit-slot.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pursuit-slot.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/arcade-draw-input.test.mjs test/input-lifecycle.test.mjs test/pursuit-slot.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
