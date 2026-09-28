# 12 — Exploration, spatial clues and returnable destinations

**Current lane:** THE WORLD  
**Build-map connections:** PQ-153, PQ-154; CR-HOLLOW, CR-BERTH, CR-TEXTURE  
**15 proposed packets:** SF-166–SF-180

## Existing foundation, not a blank slate

Scanning already reveals matched wreck provenance in layers and grants bounded investigation rewards. Discovery work should create useful incomplete information and a return reason, not another floating marker or repeatable payout.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Use existing scanner, site and world-record owners. Distinguish knowledge from reward entitlement. Coordinate-space transforms and persistent world identity must remain consistent across map, collision and materialization.

## Reusable implementation workflow

1. Read the sector anchor/site and nearby occupations. Choose a destination that fills a spatial or functional gap without scattering unrelated landmarks.
2. Author at least three clue stages with different evidence types; each should narrow an actionable question without requiring a quest marker.
3. Tie investigation to a current verb and make the reward knowledge, access, route advantage or a bounded physical resource. Reuse current scan/custody grants.
4. Give the place a stable address, truthful approach geometry, a normal state and a changed return state. Keep distant detail cheap and nearby detail interactable.
5. Test reversed clue order, partial scans, revisit, missing actor, cargo full and save at discovery. Prevent duplicate rewards and mark stale information honestly.
6. Fly the route without its plan open. If it is only distinguishable through a nameplate, improve silhouette, layout, behavior or sound rather than adding more prose.

## Ordinary-route proof

Notice a clue during ordinary travel, follow it using movement/scanner/terrain, act on the discovery, leave, and make practical use of remembering the place.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-03: Sector World Composition](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md)
- [WF-04: Stations Planets World Sites](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md)
- [WF-10: Exploration Discovery And Mystery](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-10_EXPLORATION_DISCOVERY_AND_MYSTERY.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-166 — A wreck trail that can be navigated without a marker](../plans/12-discovery/SF-166-a-wreck-trail-that-can-be-navigated-without-a-marker.md) — deepening
- [SF-167 — Ceres Wreck Cathedral as a route through a body](../plans/12-discovery/SF-167-ceres-wreck-cathedral-as-a-route-through-a-body.md) — deepening
- [SF-168 — A survey clue that changes a trade decision](../plans/12-discovery/SF-168-a-survey-clue-that-changes-a-trade-decision.md) — deepening
- [SF-169 — Tethys as a place learned through geometry](../plans/12-discovery/SF-169-tethys-as-a-place-learned-through-geometry.md) — deepening
- [SF-170 — A dead machine that still reveals its purpose](../plans/12-discovery/SF-170-a-dead-machine-that-still-reveals-its-purpose.md) — deepening
- [SF-171 — An anomaly with a falsifiable local rule](../plans/12-discovery/SF-171-an-anomaly-with-a-falsifiable-local-rule.md) — deepening
- [SF-172 — A quiet landmark allowed to remain quiet](../plans/12-discovery/SF-172-a-quiet-landmark-allowed-to-remain-quiet.md) — deepening
- [SF-173 — The abandoned tug as a persistent experiment](../plans/12-discovery/SF-173-the-abandoned-tug-as-a-persistent-experiment.md) — deepening
- [SF-174 — A discovery with a second practical visit](../plans/12-discovery/SF-174-a-discovery-with-a-second-practical-visit.md) — deepening
- [SF-175 — A moving clue that belongs to a real worker](../plans/12-discovery/SF-175-a-moving-clue-that-belongs-to-a-real-worker.md) — deepening
- [SF-176 — A dangerous discovery with a safe observation edge](../plans/12-discovery/SF-176-a-dangerous-discovery-with-a-safe-observation-edge.md) — deepening
- [SF-177 — A sector identity expressed through ordinary approaches](../plans/12-discovery/SF-177-a-sector-identity-expressed-through-ordinary-approaches.md) — deepening
- [SF-178 — A scan that reveals a useful absence](../plans/12-discovery/SF-178-a-scan-that-reveals-a-useful-absence.md) — deepening
- [SF-179 — A landmark scale pass tied to actual navigation](../plans/12-discovery/SF-179-a-landmark-scale-pass-tied-to-actual-navigation.md) — deepening
- [SF-180 — Discovery memory that remains useful after the world changes](../plans/12-discovery/SF-180-discovery-memory-that-remains-useful-after-the-world-changes.md) — deepening

## Owner reading map

- [`src/systems/scanReveal.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanReveal.js)
- [`src/systems/scanner.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanner.js)
- [`src/systems/uniqueWrecks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/uniqueWrecks.js)
- [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js)
- [`src/data/sectorAnchors.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/sectorAnchors.js)
- [`src/data/sectorCompositions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/sectorCompositions.js)
- [`src/data/worldOneOffs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/worldOneOffs.js)
- [`src/systems/livingPoiBehaviors.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/livingPoiBehaviors.js)
- [`src/data/authoredPlaces.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/authoredPlaces.js)
- [`src/data/worldSiteManifests.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/worldSiteManifests.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
