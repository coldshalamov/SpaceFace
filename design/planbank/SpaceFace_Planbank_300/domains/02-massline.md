# 02 — Massline agency and physical combinations

**Current lane:** THE HAND  
**Build-map connections:** PQ-026–031, PQ-137, PQ-146; CV-THROW, CR-CHAIN  
**15 proposed packets:** SF-016–SF-030

## Existing foundation, not a blank slate

The rope, throw, input grammar, threat reads and stunt owners already exist. The design wants ballistic release and a physical consequence, not a homing throw or a combo meter that substitutes for the action.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Respect attachment ownership and masslineController. All impulses use physicsAuthority. Release is ballistic; target prediction may guide the player but never steer the released body. Existing constraints, save behavior and specialist counters remain real.

## Reusable implementation workflow

1. Read the existing acquisition, attachment and release transitions before adding any state. Identify the body, anchor, head and action owner used by this packet.
2. Specify the input sequence and the material/geometry preconditions. Reject invalid combinations visibly without consuming unrelated actions.
3. Implement through the existing constraint and impulse paths with stable entity identity. Derive feedback from actual tension, acceleration or release state.
4. Wire one reachable combat setup and one noncombat use when this is a tool change; preserve physical counterplay and a failure continuation.
5. Test acquire/release/destroy/sector-change/save boundaries, target mass extremes and obstructed geometry. Use seeded inputs and verify no ghost constraint remains.
6. Play at the shipping camera: the player should infer why the move worked from motion, rope and sound. A textual stunt receipt is supporting feedback, not the payoff.

## Ordinary-route proof

In ordinary combat acquire a light body, orbit an obstacle, throw it into a heavy, then use the same rope for a salvage/industrial task.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-05: Weapons Physics Tools And Modules](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md)
- [WF-15: Gameplay Feel Controls And Balance](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-016 — Acquisition confidence at the edge of a crowd](../plans/02-massline/SF-016-acquisition-confidence-at-the-edge-of-a-crowd.md) — deepening
- [SF-017 — Tension warning that distinguishes danger from useful load](../plans/02-massline/SF-017-tension-warning-that-distinguishes-danger-from-useful-load.md) — deepening
- [SF-018 — A clean ballistic cut through a moving target](../plans/02-massline/SF-018-a-clean-ballistic-cut-through-a-moving-target.md) — deepening
- [SF-019 — Anchor swapping as a physical maneuver](../plans/02-massline/SF-019-anchor-swapping-as-a-physical-maneuver.md) — deepening
- [SF-020 — Heavy enemies as usable terrain](../plans/02-massline/SF-020-heavy-enemies-as-usable-terrain.md) — deepening
- [SF-021 — Towed cargo as a shield with a price](../plans/02-massline/SF-021-towed-cargo-as-a-shield-with-a-price.md) — deepening
- [SF-022 — Reel pumping that rewards timing, not button spam](../plans/02-massline/SF-022-reel-pumping-that-rewards-timing-not-button-spam.md) — deepening
- [SF-023 — A cutter warning located on the threatened line](../plans/02-massline/SF-023-a-cutter-warning-located-on-the-threatened-line.md) — deepening
- [SF-024 — A snag that becomes a choice instead of a dead control](../plans/02-massline/SF-024-a-snag-that-becomes-a-choice-instead-of-a-dead-control.md) — deepening
- [SF-025 — An impulse bank with an observable discharge](../plans/02-massline/SF-025-an-impulse-bank-with-an-observable-discharge.md) — deepening
- [SF-026 — Friendly towing with consent expressed physically](../plans/02-massline/SF-026-friendly-towing-with-consent-expressed-physically.md) — deepening
- [SF-027 — Release-space awareness without auto-safety](../plans/02-massline/SF-027-release-space-awareness-without-auto-safety.md) — deepening
- [SF-028 — Two-step disable and strip](../plans/02-massline/SF-028-two-step-disable-and-strip.md) — deepening
- [SF-029 — Salvage sorting through the same combat grammar](../plans/02-massline/SF-029-salvage-sorting-through-the-same-combat-grammar.md) — deepening
- [SF-030 — One physical stunt, one coherent answer](../plans/02-massline/SF-030-one-physical-stunt-one-coherent-answer.md) — deepening

## Owner reading map

- [`src/systems/tetherGameplay.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/tetherGameplay.js)
- [`src/combat/attachments.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/combat/attachments.js)
- [`src/core/constraints/masslineController.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/constraints/masslineController.js)
- [`src/systems/masslineThrow.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/masslineThrow.js)
- [`src/systems/masslineInputGrammar.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/masslineInputGrammar.js)
- [`src/systems/masslineThreats.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/masslineThreats.js)
- [`src/systems/stuntGrammar.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/stuntGrammar.js)
- [`src/render/masslinePresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/masslinePresentation.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
