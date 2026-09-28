# 08 — Readable trade, freight risk and sustainable income

**Current lane:** THE LONG GAME  
**Build-map connections:** PQ-177, PQ-151; CV-DAY  
**15 proposed packets:** SF-106–SF-120

## Existing foundation, not a blank slate

Station stock/quotes, field-derived contracts, operation custody and career cohort instruments already exist. The defect ledger reports weak hauler returns after a simulator quantity bug was fixed; those reported measurements are not a fresh live benchmark here.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

economy is the only credits writer, cargo the player-hold writer, and custody the operation shipment boundary. Prices must come from executable quotes; no simulation-only reward multiplier or retuned acceptance threshold.

## Reusable implementation workflow

1. Trace executable quantity, quote, spread, fee and receipt paths. State the source/custody/sink transaction the packet changes.
2. Model one concrete route with actual hold capacity, fuel, losses and travel time. Label simulator adapters and tune against a live-route comparison before balance conclusions.
3. Implement incentives through stock, risk, costs or existing contract clauses, not free money or extra account writers. Bound arbitrage and repeated claims.
4. Expose only information the pilot can legitimately know: quote age, risk reason, cargo commitment and net cost. Reuse the current market/contract surface.
5. Test partial fills, stale quotes, duplicate receipts, full holds, interrupted travel and save/resume. Reconcile every item and credit movement.
6. Run several trips, including a bad one. A tradeoff should remain after the route is learned; remove grind or arbitrary taxes only when their causal role is unsupported.

## Ordinary-route proof

Use the actual market to buy a feasible load, fly its route, pay real costs, sell the surviving load, and compare the second trip after market/world response.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-06: Economy Industry And Logistics](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md)
- [WF-07: Progression Ships Builds And Infrastructure](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-106 — Make competent hauling viable through real terms](../plans/08-economy/SF-106-make-competent-hauling-viable-through-real-terms.md) — conditional repair
- [SF-107 — Net profit that uses the load the player can actually buy](../plans/08-economy/SF-107-net-profit-that-uses-the-load-the-player-can-actually-buy.md) — deepening
- [SF-108 — Contracts that can honestly share a journey](../plans/08-economy/SF-108-contracts-that-can-honestly-share-a-journey.md) — deepening
- [SF-109 — A depletion response the pilot can anticipate](../plans/08-economy/SF-109-a-depletion-response-the-pilot-can-anticipate.md) — deepening
- [SF-110 — A quote reservation that protects the stated trade](../plans/08-economy/SF-110-a-quote-reservation-that-protects-the-stated-trade.md) — deepening
- [SF-111 — Cargo custody that remains legible after a split](../plans/08-economy/SF-111-cargo-custody-that-remains-legible-after-a-split.md) — deepening
- [SF-112 — Risk premium grounded in a visible threat](../plans/08-economy/SF-112-risk-premium-grounded-in-a-visible-threat.md) — deepening
- [SF-113 — A legal detour that competes with smuggling](../plans/08-economy/SF-113-a-legal-detour-that-competes-with-smuggling.md) — deepening
- [SF-114 — A damaged delivery with negotiated-by-terms value](../plans/08-economy/SF-114-a-damaged-delivery-with-negotiated-by-terms-value.md) — deepening
- [SF-115 — Operating costs that teach the business](../plans/08-economy/SF-115-operating-costs-that-teach-the-business.md) — deepening
- [SF-116 — A local shortage with a physical cause and remedy](../plans/08-economy/SF-116-a-local-shortage-with-a-physical-cause-and-remedy.md) — deepening
- [SF-117 — A new route unlocked by capability, not a price multiplier](../plans/08-economy/SF-117-a-new-route-unlocked-by-capability-not-a-price-multiplier.md) — deepening
- [SF-118 — A stalled operation that asks for the right intervention](../plans/08-economy/SF-118-a-stalled-operation-that-asks-for-the-right-intervention.md) — deepening
- [SF-119 — A no-money recovery route that still involves work](../plans/08-economy/SF-119-a-no-money-recovery-route-that-still-involves-work.md) — deepening
- [SF-120 — Economic comparison that resists misleading simulation success](../plans/08-economy/SF-120-economic-comparison-that-resists-misleading-simulation-success.md) — deepening

## Owner reading map

- [`src/systems/economy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js)
- [`src/systems/economyContracts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economyContracts.js)
- [`src/systems/cargoCustody.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js)
- [`src/balance/careerCohorts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/balance/careerCohorts.js)
- [`src/systems/automationOperations.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/automationOperations.js)
- [`src/data/commodities.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/commodities.js)
- [`src/systems/contractClauses.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/contractClauses.js)
- [`src/systems/sectorSim.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/sectorSim.js)
- [`src/ui/market/tradeLogic.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/market/tradeLogic.js)
- [`src/ui/station/screens/market.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/market.js)
- [`src/economy/economyModel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/economy/economyModel.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
