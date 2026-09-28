# 04 — Tactical enemies and readable encounter pressure

**Current lane:** THE FIGHT  
**Build-map connections:** PQ-140, PQ-174, PQ-175, PQ-206; CV-AMMO  
**15 proposed packets:** SF-046–SF-060

## Existing foundation, not a blank slate

Tactical AI is the selected backend. Four specialist plans already name cutter/disruptor/anchor/cargo-protector counters; ambient predation already has telegraph, recovery and escape phases.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Do not edit legacy ai.js for normal gameplay. Perception and squad votes are advisory; engagementAuthority must still authorize final hostile action. Neutral job labels are not permission to attack.

## Reusable implementation workflow

1. Locate the existing doctrine, sensor facts and final action authorization for the role. Decide whether this is a role extension or a composition change.
2. Implement a legible prepare/commit/recover cycle. Give the player an action that defeats it and a second imperfect escape; no hidden omniscience.
3. Use physical movement and existing tool actions. Keep encounter/director budgets and authority motives intact; do not set hostility directly to force a screenshot.
4. Compose the role with a contrasting existing role in reachable authored encounter data. Preserve enough light bodies and navigable space for the player to act.
5. Exercise three contexts, target death, jurisdiction changes and loss of visibility. Inspect emitted intent plus authorization, not merely selected AI state.
6. Watch the approach without reading a label. Retune spacing/timing if the role cannot be understood or if coordinated enemies remove all simultaneous escape options.

## Ordinary-route proof

Meet the role through ordinary spawning in open space, near a physical obstruction, and beside neutral traffic; repeat with and without the tool it counters.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-02: Enemy Roster And Encounters](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md)
- [WF-15: Gameplay Feel Controls And Balance](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-046 — A cutter that commits to geometry](../plans/04-tactics/SF-046-a-cutter-that-commits-to-geometry.md) — deepening
- [SF-047 — Field disruptor with an exposed working interval](../plans/04-tactics/SF-047-field-disruptor-with-an-exposed-working-interval.md) — deepening
- [SF-048 — Cargo protector that protects a specific thing](../plans/04-tactics/SF-048-cargo-protector-that-protects-a-specific-thing.md) — deepening
- [SF-049 — Anchor specialists that create a temporary arena](../plans/04-tactics/SF-049-anchor-specialists-that-create-a-temporary-arena.md) — deepening
- [SF-050 — A sniper whose shot can be baited](../plans/04-tactics/SF-050-a-sniper-whose-shot-can-be-baited.md) — deepening
- [SF-051 — Brawlers that commit their mass](../plans/04-tactics/SF-051-brawlers-that-commit-their-mass.md) — deepening
- [SF-052 — Two specialists, one solvable pressure pattern](../plans/04-tactics/SF-052-two-specialists-one-solvable-pressure-pattern.md) — deepening
- [SF-053 — Reinforcements that arrive from somewhere](../plans/04-tactics/SF-053-reinforcements-that-arrive-from-somewhere.md) — deepening
- [SF-054 — Pressure that notices a real breather](../plans/04-tactics/SF-054-pressure-that-notices-a-real-breather.md) — deepening
- [SF-055 — A pirate that values cargo more than revenge](../plans/04-tactics/SF-055-a-pirate-that-values-cargo-more-than-revenge.md) — deepening
- [SF-056 — A wounded enemy that changes the tactical shape](../plans/04-tactics/SF-056-a-wounded-enemy-that-changes-the-tactical-shape.md) — deepening
- [SF-057 — Squad cooperation without target omniscience](../plans/04-tactics/SF-057-squad-cooperation-without-target-omniscience.md) — deepening
- [SF-058 — Friendly traffic that does not become a target by label](../plans/04-tactics/SF-058-friendly-traffic-that-does-not-become-a-target-by-label.md) — deepening
- [SF-059 — Terrain-aware orbit that does not pinball](../plans/04-tactics/SF-059-terrain-aware-orbit-that-does-not-pinball.md) — deepening
- [SF-060 — Enemy learning through a rematch, not stat inflation](../plans/04-tactics/SF-060-enemy-learning-through-a-rematch-not-stat-inflation.md) — deepening

## Owner reading map

- [`src/ai/specialistPlans.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/specialistPlans.js)
- [`src/ai/shipDecision.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/shipDecision.js)
- [`src/ai/maneuver.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/maneuver.js)
- [`src/ai/engagementAuthority.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/engagementAuthority.js)
- [`src/ai/ambientPredation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/ambientPredation.js)
- [`src/ai/director.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ai/director.js)
- [`src/systems/aiPorts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aiPorts.js)
- [`src/data/enemies.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/enemies.js)
- [`src/systems/aceMemory.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aceMemory.js)
- [`src/systems/nemesis.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/nemesis.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
