// PQ-177.01 — leftover forecast cone + sale readout on the Orbital market. Headless.
// Inputs come from the live Ceres Iron Ore market record + predictPriceCurve / regimeLabel.
// Do not invent a 30% profit playtest. Hist does not mark modelled vs observed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { predictPriceCurve, regimeLabel } from '../src/systems/economyCycles.js';
import { quoteAgeWord, resolveDockStationType } from '../src/ui/station/screens/market.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const IRON = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
const CERES = SECTORS.flatMap((sec) => sec.stations || []).find((st) => st.id === 'station_ceres');
const TEN_MIN_S = 600;

function liveStationEntity(record) {
  return {
    type: 'station',
    data: {
      stationId: record.id,
      stationTypeId: record.type,
      name: record.name,
      size: record.size,
      services: record.services || [],
    },
  };
}

function bootCeres({ simTime = 0, memorySeenAt = 0 } = {}) {
  const sim = createSimulation({
    seed: 17701,
    systems: [economy],
    updateOrder: [],
  });
  const state = sim.state;
  state.simTime = simTime;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.ui.dockedStationId = 'station_ceres';
  state.entityList = [liveStationEntity(CERES)];
  const econ = sim.registry.get('economy');
  econ.ensureMarket('station_ceres', 'refinery', 'M');
  if (!state.player.marketMemory) state.player.marketMemory = {};
  econ.recordMarketMemory('station_ceres');
  const mem = state.player.marketMemory.station_ceres && state.player.marketMemory.station_ceres[IRON.id];
  if (mem) mem.seenAt = memorySeenAt;
  return { sim, state, econ };
}

function lastTenMinutes(entry, nowS) {
  const points = (entry && Array.isArray(entry.history) ? entry.history : [])
    .map((p) => (p && typeof p === 'object' ? { t: Number(p.t), mid: Number(p.mid) } : null))
    .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.mid) && p.mid > 0);
  const windowed = points.filter((p) => p.t >= nowS - TEN_MIN_S);
  return windowed.length ? windowed : points.slice(-40);
}

function liveQuoteAge(state) {
  return quoteAgeWord(state, 'station_ceres', IRON.id);
}

function inspectorHtml(state, { saleQty = 1 } = {}) {
  const entry = state.economy.markets.station_ceres[IRON.id];
  const forecast = predictPriceCurve(state, 'station_ceres', IRON.id);
  const cycle = state.economy.cycles.station_ceres[IRON.id];
  const hist = lastTenMinutes(entry, state.simTime);
  const sell = Number(entry.lastSell != null ? entry.lastSell : entry.sell);
  const quoteAge = liveQuoteAge(state);
  return {
    entry,
    forecast,
    cycle,
    hist,
    sell,
    html: marketQuoteHtml({
      id: IRON.id,
      name: IRON.name,
      category: IRON.category,
      legal: IRON.legality,
      buy: Number(entry.lastBuy != null ? entry.lastBuy : entry.buy),
      sell,
      avg: IRON.basePrice,
      hist,
      forecast,
      now: state.simTime,
      regime: regimeLabel(cycle && (cycle.regime || cycle.family) || 'stable'),
      quoteAge,
      saleQty,
      producedBy: IRON.producedBy,
      consumedBy: IRON.consumedBy,
      stationType: resolveDockStationType(state),
    }),
  };
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : '';
}

test('catalog Iron Ore at Ceres is the live leftover market input', () => {
  assert.ok(IRON, 'cmdty_ore_iron is in COMMODITIES');
  assert.equal(IRON.name, 'Iron Ore');
  assert.ok(CERES, 'station_ceres is in SECTORS');
  assert.equal(CERES.name, 'Ceres Refinery');
});

test('Ceres Iron Ore inspector paints last-ten-minute hist plus predictPriceCurve cone', () => {
  const { state, sim } = bootCeres({ simTime: 0, memorySeenAt: 0 });
  const { entry, forecast, cycle, hist, sell, html } = inspectorHtml(state, {
    saleQty: 1,
    quoteAge: 'fresh',
  });

  assert.ok(entry, 'ensureMarket left a live Ceres Iron Ore listing');
  assert.ok(Array.isArray(entry.history) && entry.history.length > 1, 'live hist exists');
  assert.ok(forecast.length > 0, 'predictPriceCurve returned leftover future mids');
  assert.ok(hist.every((p) => p.t >= state.simTime - TEN_MIN_S), 'inspector hist is the last ten minutes');
  assert.ok(
    entry.history.some((p) => Number(p && p.t) < state.simTime - TEN_MIN_S),
    'the live ring is longer than ten minutes, so the window is a real cut',
  );

  const regime = regimeLabel(cycle && (cycle.regime || cycle.family) || 'stable');
  assert.match(html, new RegExp(regime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /data-regime/);
  assert.doesNotMatch(html, /data-quote-age/);
  assert.doesNotMatch(html, /fresh quote|stale quote/);

  const forecastMids = attr(html, 'data-forecast-mids');
  assert.equal(forecastMids, forecast.map((p) => p.mid).join(','));
  assert.match(html, /data-forecast-band/);
  assert.match(html, /data-forecast-line/);
  assert.match(html, /data-history-line/);
  assert.match(html, /data-history-key/);
  assert.match(html, /Last ten minutes/);
  assert.match(html, /data-forecast-key/);
  assert.match(html, />Forecast</);

  const historyPath = html.match(/data-history-line[^>]* d="([^"]+)"/);
  const conePath = html.match(/data-forecast-band[^>]* d="([^"]+)"/);
  assert.ok(historyPath, 'history polyline is painted');
  assert.ok(conePath, 'forecast band is painted');
  assert.notEqual(conePath[1], historyPath[1], 'cone must not equal the history polyline');

  const saleCredits = Math.round(sell * 1);
  assert.match(html, /data-sale-line/);
  assert.equal(Number(attr(html, 'data-sale-credits')), saleCredits);
  assert.match(html, new RegExp(`${saleCredits.toLocaleString('en-US')} cr`));

  assert.match(html, /data-supply-chain/);
  assert.match(html, /sx-mkt-chain/);
  assert.doesNotMatch(html, /30%\s*profit|income uplift/i);
  assert.doesNotMatch(html, /data-modelled|data-observed/,
    'hist points are {t,mid} only — do not invent modelled vs observed');

  console.log(`PQ-177.01 Ceres Iron Ore regime: ${regime}`);
  console.log(`PQ-177.01 forecast steps: ${forecast.length} mids ${forecast[0].mid}..${forecast.at(-1).mid}`);
  console.log(`PQ-177.01 sale: 1 × ${sell} = ${saleCredits} cr`);
  sim.dispose();
  economy._instance = null;
});

test('docked Ceres inspector does not paint a leftover quote-age word', () => {
  const { state, sim, econ } = bootCeres({ simTime: 0, memorySeenAt: 0 });
  state.simTime = 2000;
  econ.snapshotIntel('station_ceres');
  const { html } = inspectorHtml(state);
  assert.equal(quoteAgeWord(state, 'station_ceres', IRON.id), '');
  assert.doesNotMatch(html, /data-quote-age/);
  assert.doesNotMatch(html, /fresh quote|stale quote/);
  sim.dispose();
  economy._instance = null;
});

test('Orbital market screen paints leftover cone from leftover predictPriceCurve', () => {
  const marketSrc = readFileSync(join(ROOT, 'src/ui/station/screens/market.js'), 'utf8');
  assert.match(marketSrc, /predictPriceCurve\(state,\s*sid,\s*r\.id\)/);
  assert.match(marketSrc, /priceHistorySeries\(/);
  assert.match(marketSrc, /regimeLabel\(/);
  assert.match(marketSrc, /quoteAgeWord\(/);
  assert.match(
    marketSrc,
    /producedBy:\s*def\.producedBy,\s*consumedBy:\s*def\.consumedBy,\s*stationType:\s*resolveDockStationType\(state\)/,
  );
  const css = readFileSync(join(ROOT, 'styles/orbital.css'), 'utf8');
  assert.match(css, /#screens \.sx-mkt-cone/);
  assert.match(css, /#screens \.sx-mkt-sale/);
  assert.match(css, /#screens \.sx-mkt-chain/, '177.02 leftover chain paint stays');
});
