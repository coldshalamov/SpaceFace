# Interrupted Runaway Kiln rescue continuity claim

Allocated 22 October 2026 at 22:18 UTC. Owner: dot. Outcome: an interrupted existing Vesta rescue must not silently lose its moving crucible and coordinator at Save/Continue. First reproduce through actual Save entry points, then implement the bounded repair. This is not a new mission, reward, physics controller or general save redesign.

## Basis and ownership

Public master is 5e5b619b57c53be410e90c7e5f21bbb2fd0127f5. The reviewed damage correction is in open PR #515 at 1608d857929257cc182e36582ed7d7a4ab2ee63d; preserve its payload type, real-combat tests and publication evidence. Source inspection shows saveSystem persists the director's stats but not live encounters; _onSaveLoaded creates fresh transient state. save:started precedes snapshot capture. Existing freight and Ceres reconstruction are separate owners. Existing Pallas publication proposal has no encounterDirector/runawayKiln path. Current PR #516 changes only Save/Load layout and its review, not these runtime hooks. Recheck actual public source and overlapping owner hunks before editing; source inspection is not proof of external writer absence.

## Bounded write allocation

- src/systems/runawayKilnRuntime.js: this encounter's capture, reconstruction and terminal cleanup only; preserve existing rescue, damage, reward and lore semantics.
- src/systems/encounterDirector.js: minimal opt-in lifecycle calls needed by this runtime at save capture/load and retirement, plus isolated reconstruction helpers. Do not rewrite freight, Ceres, spawn authority, squad membership or other encounter handlers. Propose any broader change before editing it.
- New test/encounter-runaway-kiln-continuity.test.mjs and, only if separation materially helps, a new Kiln-specific continuity helper beside its runtime.
- package.json: a unique focused check and a single invocation in the existing command graph, preserving all other scripts.
- New RUNAWAY_KILN_CONTINUITY_2026-10-22.md: exact sources, reproduction, tests, limitations and handoff.

No world.js, saveSystem.js, physics core, combat, Vesta/Winnow, traffic/mining/npcJobsRuntime, shared renderer/assets, workflow or security edits are allocated. No live-browser retry, denied test/aggregate or deployment is allocated.

## Required evidence and safety boundaries

Use actual Save/Continue owners with fixture storage explicitly labeled, and native-observed body movement where feasible. Preserve finite pose/velocity/hull, elapsed rescue time and one-time warning/scan/tether counters without creating a second physical authority. Keep logical records bounded and validated; do not persist object references or confuse recycled IDs with the same life. Test repeated load, terminal loss/completion, New Game, malformed/stale records, native readiness and hard versus continuous sector boundaries. Do not mint repeated rewards, spawn duplicate crucibles, mutate unrelated persistent actors or resurrect a terminal record. State any tether reattachment and whole-world native checkpoint limitations rather than hiding them.

If the safe design needs a protected owner or broad Save schema change, stop that edit, retain the failing reproduction and report the exact dependency. Keep private paths, raw Save payloads, approval identifiers and synthetic local ancestry out of the public payload. Publish only after independent review and fresh remote reconciliation; if PR #515 merges meanwhile, carry only unlanded changes onto current master. All game and sector goals remain open.
