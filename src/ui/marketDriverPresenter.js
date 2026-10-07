// Canonical read model for Market price causes. Compact labels and full explanations are generated
// together so visual rows, keyboard focus, assistive text, and the selected trade instrument never
// tell different stories.

import { SECTORS } from '../data/sectors.js';
import { hash32 } from '../core/rng.js';
import { causeFor } from './causeLedger.js';
import { forecastFor } from './priceForecast.js';
import { regimeLabel } from '../systems/economyCycles.js';
import { generateHeadline } from './marketNews.js';
import { summarizeDemandDrivers } from './demandDriverSummary.js';

const STATION_CONTEXT = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_CONTEXT.set(station.id, { station, sector });
  }
}

function words(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function driver(id, label, shortLabel, explanation, direction = 'flat', value = null) {
  return Object.freeze({ id, label, shortLabel, explanation, direction, value });
}

function stationContext(state, stationId) {
  const registry = state && state.content && state.content.sectors;
  if (registry) {
    const sectors = Array.isArray(registry) ? registry : Object.values(registry);
    for (const sector of sectors) {
      const station = (sector && sector.stations || []).find((candidate) => candidate && candidate.id === stationId);
      if (station) return { station, sector };
    }
  }
  return STATION_CONTEXT.get(stationId) || {};
}

export function marketQuoteValue(entry, commodity, side = 'buy') {
  const live = side === 'sell'
    ? entry && (entry.lastSell != null ? entry.lastSell : entry.sell)
    : entry && (entry.lastBuy != null ? entry.lastBuy : entry.buy);
  return Math.max(0, Math.round(Number(live != null ? live : commodity && commodity.basePrice) || 0));
}

export function marketCardDrivers(primary = []) {
  if (!Array.isArray(primary)) return [];
  // Cards carry only commodity-specific or changing signals. The selected instrument retains the
  // complete explanation, including station-wide geography and neutral baselines.
  return primary.filter((item) => {
    if (!item || item.id === 'geography') return false;
    if (item.id === 'role') return item.direction !== 'flat';
    if (item.id === 'conflict') return item.direction !== 'flat';
    if (item.id === 'cycle') return item.value !== 'stable';
    return true;
  });
}

export function presentMarketDrivers({ state, stationId, commodity, entry, cycle } = {}) {
  const context = stationContext(state, stationId);
  const station = context.station || {};
  const sector = context.sector || {};
  const role = entry && entry.role || 'none';
  const stationRole = words(station.type || 'Station');
  const roleDriver = role === 'consume'
    ? driver('role', `${stationRole} consumes ${commodity && commodity.name || 'this commodity'}`, 'Demand ↑', `${stationRole} operations consume ${commodity && commodity.name || 'this commodity'}, creating persistent demand.`, 'up')
    : role === 'produce'
      ? driver('role', `${stationRole} supplies ${commodity && commodity.name || 'this commodity'}`, 'Surplus ↓', `${stationRole} operations produce ${commodity && commodity.name || 'this commodity'}, creating persistent supply.`, 'down')
      : driver('role', 'No production bias', 'Balanced', 'This station has no structural production or consumption bias for this commodity.', 'flat');

  const security = Number(sector.security);
  const frontier = Number.isFinite(security) && security < 0.58;
  const geographyDriver = frontier
    ? driver('geography', 'Wider frontier spread', 'Wide spread', 'Lower-security frontier logistics widen the gap between buy and sell quotes.', 'wide', security)
    : driver('geography', 'Tighter core spread', 'Tight core', 'Established core logistics keep the buy and sell spread comparatively tight.', 'tight', security);

  const demandDrivers = Array.isArray(entry && entry.demandDrivers) ? entry.demandDrivers : [];
  const demandSummary = summarizeDemandDrivers(demandDrivers, entry && entry.demandMult);
  const conflictDriver = demandSummary
    ? driver('conflict', demandSummary.label, demandSummary.shortLabel, demandSummary.explanation, demandSummary.direction, entry.demandMult)
    : driver('conflict', 'No sector demand modifier', 'No conflict', 'No persistent war, blockade, or industrial expansion currently changes this commodity quote.', 'flat', 1);

  const liveCycle = cycle || (state && state.economy && state.economy.cycles
    && state.economy.cycles[stationId] && commodity && state.economy.cycles[stationId][commodity.id]);
  const regime = liveCycle && (liveCycle.regime || liveCycle.family) || 'stable';
  const regimeText = regimeLabel(regime);
  const cycleDirection = regime === 'rising' ? 'up' : regime === 'falling' ? 'down' : 'variable';
  const cycleDriver = driver('cycle', 'Short-term trend', regimeText.replace(/ demand| pricing| market| curve/i, ''), `The current short-term formula regime is ${regimeText.toLocaleLowerCase()}.`, cycleDirection, regime);

  const primary = Object.freeze([roleDriver, geographyDriver, conflictDriver, cycleDriver]);
  const cause = sector.id ? causeFor(state, sector.id) : null;
  const forecast = sector.id ? forecastFor(state, sector.id) : null;
  const sectorLines = cause && cause.receipts ? cause.receipts.map((receipt) => receipt.line) : [];
  const sectorContext = Object.freeze({
    label: forecast ? `Sector forecast · ${forecast.direction}` : 'Sector conditions',
    explanation: [forecast && forecast.label, ...sectorLines].filter(Boolean).join(' '),
    direction: forecast && forecast.direction || 'steady',
  });
  return Object.freeze({
    primary,
    sectorContext,
    accessibleSummary: [...primary.map((item) => item.explanation), sectorContext.explanation].filter(Boolean).join(' '),
  });
}

/**
 * LG-FORECAST-PROOF (row 279): one line tracing the last move to its cause. The listing's
 * eventMods carry the live sim eventIds; the newest one names what is moving the price right
 * now, in the same words the news ticker speaks. With no event mods the mover is the formula
 * regime — the same word the cone read prints, because that is what moved it.
 */
export function lastMoveCause({ state, stationId, commodity, entry } = {}) {
  const seed = (state && state.meta && (hash32(state.meta.seed) >>> 0)) || 0;
  const ids = [];
  for (const m of (entry && Array.isArray(entry.eventMods) ? entry.eventMods : [])) {
    if (m && m.eventId != null && !ids.includes(m.eventId)) ids.push(m.eventId);
  }
  if (ids.length) {
    const events = (state && state.economy && state.economy.econEvents) || [];
    let newest = null;
    for (const id of ids) {
      const ev = events.find((e) => e && e.id === id);
      if (ev && (!newest || Number(ev.startT) >= Number(newest.startT))) newest = ev;
    }
    if (newest) {
      // commodityId verbatim: a market-wide '*' event reads "the market" here exactly as it
      // does on the ticker — substituting the viewed listing would pick a different template
      // variant and mis-attribute a station-wide move to one good.
      const headline = generateHeadline({
        type: newest.type,
        stationId: newest.stationId || stationId,
        commodityId: newest.commodityId,
        eventId: newest.id,
      }, { seed });
      if (headline) return Object.freeze({ text: `Last move: ${headline}`, eventId: String(newest.id) });
    }
  }
  const liveCycle = state && state.economy && state.economy.cycles
    && state.economy.cycles[stationId] && commodity && state.economy.cycles[stationId][commodity.id];
  const regime = (liveCycle && (liveCycle.regime || liveCycle.family)) || 'stable';
  return Object.freeze({ text: `Last move: ${regimeLabel(regime)}`, eventId: null });
}
