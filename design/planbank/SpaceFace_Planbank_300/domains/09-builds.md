# 09 — Ship identity, fitting tradeoffs and capability progression

**Current lane:** THE LONG GAME  
**Build-map connections:** PQ-142, PQ-155, PQ-156, PQ-176; CV-HAND  
**15 proposed packets:** SF-121–SF-135

## Existing foundation, not a blank slate

Build identity is already derived from real fittings and scan revelation. Drafts and shops share real ships fitting APIs; the desired progression is additional physical agency, not another rarity/stat ladder.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Ships owns derived stats. Do not serialize a second truth for a fitted capability. Keep fitting refusal transactional, information honest and acquisition reachable through the existing economy/tech paths.

## Reusable implementation workflow

1. Read the existing module, capability and synergy catalogs before minting an ID. Prefer a changed interaction or meaningful fitting tradeoff to a duplicate module.
2. Specify what new action becomes possible and what the pilot gives up. Calculate the effect from live derived stats, not a display-only badge.
3. Implement acquire/fit/unfit and derived capability changes through ships. Recompute on the current lifecycle and validate old saves.
4. Teach the capability through a reachable situation and show its physical expression on the ship/tool where the existing art pipeline supports it.
5. Test slot limits, refusal rollback, destroyed equipment, save migration and combinations with at least two other modules. Detect dominates-everything loadouts.
6. Play two contexts and compare an unfitted baseline. Remove bonuses that produce only a bigger number with no changed decision.

## Ordinary-route proof

Acquire the milestone normally, fit it at the current service, demonstrate two distinct uses outside the shop, then refit back and reload the save.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-07: Progression Ships Builds And Infrastructure](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)
- [WF-05: Weapons Physics Tools And Modules](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-121 — Starter identities with immediate playable proof](../plans/09-builds/SF-121-starter-identities-with-immediate-playable-proof.md) — deepening
- [SF-122 — A Rammer-Truck that makes cargo a decision](../plans/09-builds/SF-122-a-rammer-truck-that-makes-cargo-a-decision.md) — deepening
- [SF-123 — Control-Tug as a two-context capability](../plans/09-builds/SF-123-control-tug-as-a-two-context-capability.md) — deepening
- [SF-124 — Survey Control that turns information into a route](../plans/09-builds/SF-124-survey-control-that-turns-information-into-a-route.md) — deepening
- [SF-125 — Bulk Miner with a meaningful exit decision](../plans/09-builds/SF-125-bulk-miner-with-a-meaningful-exit-decision.md) — deepening
- [SF-126 — Capability predictions that state their conditions](../plans/09-builds/SF-126-capability-predictions-that-state-their-conditions.md) — deepening
- [SF-127 — Fitting refusal that leaves the ship unchanged](../plans/09-builds/SF-127-fitting-refusal-that-leaves-the-ship-unchanged.md) — deepening
- [SF-128 — A respec path that encourages experimentation](../plans/09-builds/SF-128-a-respec-path-that-encourages-experimentation.md) — deepening
- [SF-129 — A tech unlock that creates a new physical question](../plans/09-builds/SF-129-a-tech-unlock-that-creates-a-new-physical-question.md) — deepening
- [SF-130 — A hull upgrade that changes route geometry](../plans/09-builds/SF-130-a-hull-upgrade-that-changes-route-geometry.md) — deepening
- [SF-131 — A ship history that follows the same hull](../plans/09-builds/SF-131-a-ship-history-that-follows-the-same-hull.md) — deepening
- [SF-132 — A module drawback that can be played around](../plans/09-builds/SF-132-a-module-drawback-that-can-be-played-around.md) — deepening
- [SF-133 — Build identity that does not overclaim hidden fittings](../plans/09-builds/SF-133-build-identity-that-does-not-overclaim-hidden-fittings.md) — deepening
- [SF-134 — A rare capability with more than one useful home](../plans/09-builds/SF-134-a-rare-capability-with-more-than-one-useful-home.md) — deepening
- [SF-135 — Progression pacing that respects a real first upgrade](../plans/09-builds/SF-135-progression-pacing-that-respects-a-real-first-upgrade.md) — deepening

## Owner reading map

- [`src/systems/ships.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/ships.js)
- [`src/systems/buildIdentity.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/buildIdentity.js)
- [`src/data/modules.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/modules.js)
- [`src/data/ships.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/ships.js)
- [`src/data/synergies.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/synergies.js)
- [`src/data/starterBuilds.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/starterBuilds.js)
- [`src/data/techVerbLadder.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/techVerbLadder.js)
- [`src/systems/shipCapabilities.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/shipCapabilities.js)
- [`src/data/tech.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/tech.js)
- [`src/systems/shipLedger.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/shipLedger.js)
- [`src/ui/station/screens/shipworks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/shipworks.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
