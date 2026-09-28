# 01 — Flight, intent and combat movement

**Current lane:** THE HAND  
**Build-map connections:** PQ-137, PQ-164, PQ-189; CV-HAND  
**15 proposed packets:** SF-001–SF-015

## Existing foundation, not a blank slate

The G-mode floating stick already exists. Its bounded relative vector, deadzone and response curve feed the V3 propulsion path. Physical force and torque belong to physicsAuthority; live handling is not the legacy flight.js controller.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Preserve raw input/actions semantics and assisted settling. Input produces intent; V3 and the propulsion kernel produce physical commands. Presentation reads achieved motion. Never make camera zoom or rendering cadence change thrust.

## Reusable implementation workflow

1. Trace the raw action through dynamicFlightStick/input into flightV3 and the selected kernel. Record where the proposed behavior is already represented; change the narrowest live owner.
2. Express the selected intent rule as a pure calculation with explicit units and saturation. Keep existing input bindings and flight-mode arbitration intact.
3. Feed the result into current force/torque commands. Do not directly write position/velocity or introduce a second update loop.
4. Update achieved-motion telemetry and only the functional cue needed to explain the change. Reuse the current ORRERY component.
5. Replay equivalent intent at 30, 60 and 144 presentation frames per second with the same 60 Hz simulation. Repeat empty/loaded, normal/G, brake/boost and modal interruption.
6. Compare time-to-useful-heading, overshoot and collision outcomes, then play the same combat setup. Retain the existing tuning unless the named failure and the proposed improvement both occur.

## Ordinary-route proof

Start the ordinary flight route, toggle G, fight a moving target, coast and brake with an empty and loaded hold, then dock and undock.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-15: Gameplay Feel Controls And Balance](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md)
- [WF-14: Ui Ux Onboarding And Information](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-001 — Stable intent when the camera changes](../plans/01-hand/SF-001-stable-intent-when-the-camera-changes.md) — deepening
- [SF-002 — Deadzone exit that feels deliberate](../plans/01-hand/SF-002-deadzone-exit-that-feels-deliberate.md) — deepening
- [SF-003 — Combat-stick takeover without a kick](../plans/01-hand/SF-003-combat-stick-takeover-without-a-kick.md) — deepening
- [SF-004 — Cargo-weight preview through actual handling](../plans/01-hand/SF-004-cargo-weight-preview-through-actual-handling.md) — deepening
- [SF-005 — Brake authority under a side shove](../plans/01-hand/SF-005-brake-authority-under-a-side-shove.md) — deepening
- [SF-006 — Precision arrival without autopilot orbiting](../plans/01-hand/SF-006-precision-arrival-without-autopilot-orbiting.md) — deepening
- [SF-007 — Reverse thrust that reads as reverse thrust](../plans/01-hand/SF-007-reverse-thrust-that-reads-as-reverse-thrust.md) — deepening
- [SF-008 — Boost exit with retained agency](../plans/01-hand/SF-008-boost-exit-with-retained-agency.md) — deepening
- [SF-009 — Cruise drop that explains itself](../plans/01-hand/SF-009-cruise-drop-that-explains-itself.md) — deepening
- [SF-010 — Target assist that respects a chosen escape](../plans/01-hand/SF-010-target-assist-that-respects-a-chosen-escape.md) — deepening
- [SF-011 — Angular damping that preserves hull character](../plans/01-hand/SF-011-angular-damping-that-preserves-hull-character.md) — deepening
- [SF-012 — Near-obstacle assist that warns rather than steers](../plans/01-hand/SF-012-near-obstacle-assist-that-warns-rather-than-steers.md) — deepening
- [SF-013 — Tether load handoff into ordinary flight](../plans/01-hand/SF-013-tether-load-handoff-into-ordinary-flight.md) — deepening
- [SF-014 — Input recovery after losing focus](../plans/01-hand/SF-014-input-recovery-after-losing-focus.md) — deepening
- [SF-015 — A short flight proving ground that teaches through objects](../plans/01-hand/SF-015-a-short-flight-proving-ground-that-teaches-through-objects.md) — deepening

## Owner reading map

- [`src/systems/dynamicFlightStick.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/dynamicFlightStick.js)
- [`src/systems/flightV3.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/flightV3.js)
- [`src/core/flight/propulsionKernel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/propulsionKernel.js)
- [`src/core/flight/propulsionCatalog.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/propulsionCatalog.js)
- [`src/systems/input.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/input.js)
- [`src/core/flight/flightTelemetry.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/flight/flightTelemetry.js)
- [`src/systems/autoTargetAssist.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/autoTargetAssist.js)
- [`src/systems/cruise.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cruise.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
