// DoD §22 market beacon aging + route ranking acceptance scenario (INTEGRATION_MAP §11 / spec §13).
//
// Drives the PRODUCTION rankTradeRoutes function (the same one the local-map / economy UX would
// surface) on hand-authored market beacons. Proves the spec §13 economy-intelligence contract:
//
//   14. Route ranking: rankTradeRoutes returns routes ordered by profit-per-minute, and the
//       highest-margin route (best unit profit + good volume + short travel) ranks first.
//   15. Beacon aging: a stale beacon (captured long ago) is discounted by the reliability decay
//       (exp(-ageS/1800)), so a fresh high-margin route outranks an identical-margin stale one —
//       the player is rewarded for fresh intelligence, penalized for acting on old prices.
//   16. Reliability flows into expected profit: expectedProfit = gross * reliability * (1 - risk*0.65),
//       so a stale route's expected profit is strictly lower than a fresh route's.
import assert from 'node:assert/strict';
import { rankTradeRoutes } from '../src/ui/navigation/localSpaceMapModel.js';

const round = (v, p = 4) => Number(v.toFixed(p));
const evidence = { schema: 'spaceface.dodMarketBeaconRouteRanking.v1', scenarios: {} };

// Two stations with a clear arbitrage on 'ore': station A sells cheap (buy 20, stock 100), station B
// buys dear (sell 80, demand 100). A third station offers a smaller margin on 'tech'.
function freshBeacons() {
  return [
    { stationId: 'sta_alpha', capturedAtS: 0, reliability: 1.0,
      quotes: { ore: { buy: 20, sell: 15, stock: 100, demand: 0 }, tech: { buy: 200, sell: 190, stock: 30, demand: 0 } } },
    { stationId: 'sta_beta', capturedAtS: 0, reliability: 1.0,
      quotes: { ore: { buy: 25, sell: 80, stock: 0, demand: 100 }, tech: { buy: 210, sell: 205, stock: 0, demand: 40 } } },
    { stationId: 'sta_gamma', capturedAtS: 0, reliability: 1.0,
      quotes: { ore: { buy: 18, sell: 12, stock: 60, demand: 0 }, tech: { buy: 195, sell: 260, stock: 50, demand: 0 } } },
  ];
}
const travelEstimator = (a, b) => ({ timeS: a === 'sta_alpha' && b === 'sta_beta' ? 120 : 300, fuel: 10 });
const riskEstimator = () => 0;

// ── Scenario 14: route ranking — best profit/min ranks first ──
{
  const routes = rankTradeRoutes({ beacons: freshBeacons(), cargoCapacity: 50, travelEstimator, riskEstimator, nowS: 0 });
  assert.ok(routes.length >= 2, `ranking: should return multiple profitable routes (got ${routes.length})`);
  // Routes must be sorted by profitPerMinute descending.
  for (let i = 1; i < routes.length; i++) {
    assert.ok(routes[i - 1].profitPerMinute >= routes[i].profitPerMinute,
      `ranking: routes must be sorted by profitPerMinute desc (row ${i - 1} ${routes[i - 1].profitPerMinute.toFixed(1)} < row ${i} ${routes[i].profitPerMinute.toFixed(1)})`);
  }
  // The alpha→beta ore arbitrage (buy 20, sell 80, 50 units, 120s travel) is the best route: high
  // margin * good volume / short travel. unitProfit 60, units 50, gross 3000, /120s*60 = 1500/min.
  const top = routes[0];
  assert.equal(top.originId, 'sta_alpha', `ranking: best route should originate at the cheap-ore station`);
  assert.equal(top.destinationId, 'sta_beta', `ranking: best route should deliver to the dear-buying station`);
  assert.equal(top.commodityId, 'ore', `ranking: best route should be the high-margin ore arbitrage`);
  assert.ok(top.profitPerMinute > 1000,
    `ranking: the best route should be highly profitable/min (got ${top.profitPerMinute.toFixed(1)})`);

  evidence.scenarios.routeRanking = {
    routeCount: routes.length,
    topRoute: { origin: top.originId, dest: top.destinationId, commodity: top.commodityId,
      unitProfit: top.unitProfit, units: top.units, grossProfit: top.grossProfit, profitPerMinute: round(top.profitPerMinute, 1) },
    sorted: true,
    pass: true,
    contract: 'rankTradeRoutes orders routes by profit-per-minute; the best arbitrage ranks first',
  };
  console.log(`[14] route ranking: ${routes.length} routes, top = ${top.originId}->${top.destinationId} ${top.commodityId} @ ${top.profitPerMinute.toFixed(0)}/min (unit ${top.unitProfit} x ${top.units}) PASS`);
}

// ── Scenario 15: beacon aging — stale intelligence is discounted ──
{
  // Two IDENTICAL alpha→beta ore arbitrages, but one beacon is FRESH (captured now) and the other
  // is STALE (captured 1 hour ago = 3600s). Same gross profit, but the stale one's reliability
  // decays by exp(-3600/1800) = exp(-2) ≈ 0.135 — the fresh route must rank higher.
  const nowS = 3600;
  const beacons = [
    { stationId: 'fresh_A', capturedAtS: nowS, reliability: 1.0, quotes: { ore: { buy: 20, stock: 50 } } },
    { stationId: 'fresh_B', capturedAtS: nowS, reliability: 1.0, quotes: { ore: { sell: 80, demand: 50 } } },
    { stationId: 'stale_A', capturedAtS: 0, reliability: 1.0, quotes: { ore: { buy: 20, stock: 50 } } },
    { stationId: 'stale_B', capturedAtS: 0, reliability: 1.0, quotes: { ore: { sell: 80, demand: 50 } } },
  ];
  const routes = rankTradeRoutes({ beacons, cargoCapacity: 50, travelEstimator: () => ({ timeS: 120, fuel: 0 }), riskEstimator: () => 0, nowS });
  const fresh = routes.find((r) => r.originId === 'fresh_A');
  const stale = routes.find((r) => r.originId === 'stale_A');
  assert.ok(fresh && stale, 'aging: both fresh and stale routes must be present');
  // Same gross profit (60 * 50 = 3000), but the stale route's reliability is ~0.135.
  assert.ok(fresh.expectedProfit > stale.expectedProfit * 5,
    `aging: fresh route expected profit (${fresh.expectedProfit.toFixed(0)}) must far exceed stale (${stale.expectedProfit.toFixed(0)})`);
  assert.ok(stale.reliability < 0.2,
    `aging: a 1-hour-stale beacon should have reliability < 0.2 (got ${stale.reliability.toFixed(3)})`);
  assert.ok(fresh.reliability > 0.99,
    `aging: a fresh beacon should have reliability ~1.0 (got ${fresh.reliability.toFixed(3)})`);

  evidence.scenarios.beaconAging = {
    nowS,
    freshRoute: { expectedProfit: round(fresh.expectedProfit, 1), reliability: round(fresh.reliability, 4), ageS: fresh.ageS },
    staleRoute: { expectedProfit: round(stale.expectedProfit, 1), reliability: round(stale.reliability, 4), ageS: stale.ageS },
    decayFactor: round(stale.reliability / fresh.reliability, 4),
    pass: true,
    contract: 'Stale beacons are reliability-discounted (exp(-ageS/1800)); fresh intelligence ranks above stale',
  };
  console.log(`[15] beacon aging: fresh reliability ${fresh.reliability.toFixed(3)} (profit ${fresh.expectedProfit.toFixed(0)}) vs stale ${stale.reliability.toFixed(3)} (profit ${stale.expectedProfit.toFixed(0)}, age ${stale.ageS}s) PASS`);
}

// ── Scenario 16: risk discounts expected profit (route ranking reflects danger) ──
{
  const beacons = freshBeacons();
  const safeRoutes = rankTradeRoutes({ beacons, cargoCapacity: 50, travelEstimator: () => ({ timeS: 120, fuel: 0 }), riskEstimator: () => 0, nowS: 0 });
  const riskyRoutes = rankTradeRoutes({ beacons, cargoCapacity: 50, travelEstimator: () => ({ timeS: 120, fuel: 0 }), riskEstimator: () => 0.8, nowS: 0 });
  const safeTop = safeRoutes[0];
  const riskyTop = riskyRoutes[0];
  // A high-risk route (0.8) discounts expected profit by (1 - 0.8*0.65) = 0.48 — nearly halved.
  assert.ok(riskyTop.expectedProfit < safeTop.expectedProfit * 0.6,
    `risk: a high-risk route's expected profit (${riskyTop.expectedProfit.toFixed(0)}) must be < 60% of the safe route (${safeTop.expectedProfit.toFixed(0)})`);
  assert.equal(safeTop.originId, riskyTop.originId, 'risk: same top route origin regardless of risk (same beacons)');

  evidence.scenarios.riskDiscount = {
    safeExpectedProfit: round(safeTop.expectedProfit, 1),
    riskyExpectedProfit: round(riskyTop.expectedProfit, 1),
    riskApplied: 0.8,
    pass: true,
    contract: 'Route risk discounts expected profit; ranking reflects danger, not just gross margin',
  };
  console.log(`[16] risk discount: safe expected profit ${safeTop.expectedProfit.toFixed(0)} vs risky(0.8) ${riskyTop.expectedProfit.toFixed(0)} PASS`);
}

console.log('\nDoD §22 market beacon aging + route ranking evidence bundle:');
console.log(JSON.stringify(evidence, null, 2));
console.log('\nAll market-beacon/route-ranking DoD §22 scenarios PASS — driving the production rankTradeRoutes.');
