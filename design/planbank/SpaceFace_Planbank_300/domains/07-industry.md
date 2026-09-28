# 07 — Industrial places, cargo custody and usable machinery

**Current lane:** THE WORLD / THE LONG GAME  
**Build-map connections:** PQ-145, PQ-148, PQ-177; CV-DAY, CR-FEED, CR-ANVIL  
**15 proposed packets:** SF-091–SF-105

## Existing foundation, not a blank slate

Cinder Sluice has a shared phase/geometry model and durable operations. asteroidSites owns world sites; worldSiteRuntime is its materialization helper. Operation shipments already have dedicated custody and idempotent sale receipts.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

No second site manager or player-cargo shadow ledger. Stable worldRecordId is persistent identity; entity IDs can recycle. Convert sector-local coordinates once. Physical operation success and money/cargo commits remain separate canonical responsibilities.

## Reusable implementation workflow

1. Read the durable site record, materialization helper and operation dispatch. Match every proposed socket to actual placed geometry and collision.
2. Define operational states, transition causes and conservation rules. Use existing fields/constraints/repair actions for the mechanism.
3. Carry cargo through source, shipment, physical carrier and sink with one ownership transfer per boundary. Handle partial delivery and interruption explicitly.
4. Give the site a normal job, a risk and a useful player intervention; update visible machinery state from the same operation truth.
5. Test occupied sockets, duplicate interaction, unload/reload, destruction mid-transfer and save between phases. Verify stock, shipment and player totals jointly.
6. Fly the approach at the shipping camera and use the operation without reading its documentation. Preserve navigation clearance and a visible post-operation change.

## Ordinary-route proof

Find the place from ordinary flight, identify its moving parts, perform at least two verbs, take its output to a real sink, then return after saving.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-04: Stations Planets World Sites](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md)
- [WF-06: Economy Industry And Logistics](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-091 — The Intake Waltz: feed a moving receiver](../plans/07-industry/SF-091-the-intake-waltz-feed-a-moving-receiver.md) — deepening
- [SF-092 — Cinder Sluice repair with three distinct outcomes](../plans/07-industry/SF-092-cinder-sluice-repair-with-three-distinct-outcomes.md) — deepening
- [SF-093 — A jam cleared by the shape of the load](../plans/07-industry/SF-093-a-jam-cleared-by-the-shape-of-the-load.md) — deepening
- [SF-094 — A temporary bypass the player actually builds](../plans/07-industry/SF-094-a-temporary-bypass-the-player-actually-builds.md) — deepening
- [SF-095 — Source-to-sink visibility for one production lot](../plans/07-industry/SF-095-source-to-sink-visibility-for-one-production-lot.md) — deepening
- [SF-096 — A fragile shipment with a recoverable bad landing](../plans/07-industry/SF-096-a-fragile-shipment-with-a-recoverable-bad-landing.md) — deepening
- [SF-097 — An industrial safety interlock worth bypassing](../plans/07-industry/SF-097-an-industrial-safety-interlock-worth-bypassing.md) — deepening
- [SF-098 — A depot that is full in physical and economic terms](../plans/07-industry/SF-098-a-depot-that-is-full-in-physical-and-economic-terms.md) — deepening
- [SF-099 — A refinery outage that creates a local work opportunity](../plans/07-industry/SF-099-a-refinery-outage-that-creates-a-local-work-opportunity.md) — deepening
- [SF-100 — Load geometry as a meaningful fitting constraint](../plans/07-industry/SF-100-load-geometry-as-a-meaningful-fitting-constraint.md) — deepening
- [SF-101 — A worksite that retains the scar of a bad operation](../plans/07-industry/SF-101-a-worksite-that-retains-the-scar-of-a-bad-operation.md) — deepening
- [SF-102 — A shared power bottleneck with a visible tradeoff](../plans/07-industry/SF-102-a-shared-power-bottleneck-with-a-visible-tradeoff.md) — deepening
- [SF-103 — A maintenance convoy that transports its repair inputs](../plans/07-industry/SF-103-a-maintenance-convoy-that-transports-its-repair-inputs.md) — deepening
- [SF-104 — A machine used against an attacker](../plans/07-industry/SF-104-a-machine-used-against-an-attacker.md) — deepening
- [SF-105 — One durable owner-operated site loop](../plans/07-industry/SF-105-one-durable-owner-operated-site-loop.md) — deepening

## Owner reading map

- [`src/data/environmentalMachinery.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/environmentalMachinery.js)
- [`src/systems/environmentalMachinery.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/environmentalMachinery.js)
- [`src/systems/cargoCustody.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js)
- [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js)
- [`src/systems/asteroidSites.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/asteroidSites.js)
- [`src/systems/siteProduction.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/siteProduction.js)
- [`src/systems/siteLogistics.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/siteLogistics.js)
- [`src/systems/fragileCargo.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/fragileCargo.js)
- [`src/systems/siteThermalModel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/siteThermalModel.js)
- [`src/systems/claims.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/claims.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
