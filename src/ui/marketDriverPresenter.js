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
import { FACTION_META } from '../data/factions.js';
import { priceModForState } from '../systems/factions.js';
import { commodityStandingMultipliers } from '../economy/economyMath.js';

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
    // Station-wide, like the geography spread: the selected instrument names it, the card does not.
    if (!item || item.id === 'geography' || item.id === 'standing') return false;
    if (item.id === 'role') return item.direction !== 'flat';
    if (item.id === 'conflict') return item.direction !== 'flat';
    if (item.id === 'cycle') return item.value !== 'stable';
    return true;
  });
}

const FACTION_SHORT = new Map(FACTION_META.map((faction) => [faction.id, faction.short || faction.name || faction.id]));

/** The spread a listing's own buy and sell quotes carry: both are mid * (1 +/- spread / 2). */
function listingSpread(entry) {
  const buy = Number(entry && (entry.lastBuy != null ? entry.lastBuy : entry.buy));
  const sell = Number(entry && (entry.lastSell != null ? entry.lastSell : entry.sell));
  const mid = (buy + sell) / 2;
  return buy > 0 && sell > 0 && mid > 0 ? (buy - sell) / mid : null;
}

const onePlace = (pct) => Math.round(Math.abs(pct) * 10) / 10;

/**
 * ECON-PRICE-CAUSE (row 321): the standing component of a quote, worded. The economy already applies
 * it — `priceModForState` through `commodityStandingMultipliers` improves the merchant's spread for
 * a trusted pilot and widens it for a disliked one (the quote payload carries
 * `standingPriceMultiplier` / `stationSurchargeWaived`) — but nothing named it, so scarcity, fees
 * and stale intel read as causes and the relationship did not. One row, the same multipliers the
 * quote uses, in percent against a stranger's quote at this berth. A pilot the station treats like a
 * stranger gets no row: nothing was applied.
 */
/**
 * The reputation pair the selected counter should name. A failed side (sold out, tier
 * locked) omits the fields; the side that actually quoted still carries them. The
 * surcharge flag is true if either quote says the berth waived it.
 */
export function reputationFromQuotes(buyQ, sellQ) {
  const pair = (quote) => {
    if (!quote) return null;
    const buy = Number(quote.reputationBuyMult);
    const sell = Number(quote.reputationSellMult);
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) return null;
    return { buy, sell, surchargeWaived: quote.stationSurchargeWaived === true };
  };
  const fromBuy = pair(buyQ);
  const fromSell = pair(sellQ);
  if (!fromBuy && !fromSell) return null;
  if (fromBuy && fromSell) {
    return {
      buy: fromBuy.buy,
      sell: fromSell.sell,
      surchargeWaived: fromBuy.surchargeWaived || fromSell.surchargeWaived,
    };
  }
  return fromBuy || fromSell;
}

export function standingDriver(state, station, entry, reputation = null) {
  const factionId = station && station.factionId;
  const record = factionId && state && state.factions && state.factions[factionId];
  if (!record) return null;
  // The live quote carries the multipliers it actually applied (the spread the book used, not
  // the spread implied by rounded lastBuy/lastSell). A caller without a quote falls back to
  // the same function the quote uses, read off the listing.
  const quotedBuy = reputation && Number(reputation.buy);
  const quotedSell = reputation && Number(reputation.sell);
  const fromQuote = Number.isFinite(quotedBuy) && Number.isFinite(quotedSell);
  const base = fromQuote ? null : priceModForState(state, factionId);
  const spread = fromQuote ? null : listingSpread(entry);
  const applied = fromQuote
    ? { buy: quotedBuy, sell: quotedSell }
    : commodityStandingMultipliers(spread == null ? 0.08 : spread, base, {});
  const buyPct = (applied.buy - 1) * 100;
  const sellPct = (applied.sell - 1) * 100;
  const waived = fromQuote ? reputation.surchargeWaived === true : base.surchargeWaived === true;
  if (!waived && onePlace(buyPct) === 0 && onePlace(sellPct) === 0) return null;
  const faction = FACTION_SHORT.get(factionId) || factionId;
  const tier = record.tier ? ` (${record.tier})` : '';
  const buyWord = buyPct < 0 ? `buys run ${onePlace(buyPct)}% under` : `buys run ${onePlace(buyPct)}% over`;
  const sellWord = sellPct > 0 ? `sales pay ${onePlace(sellPct)}% over` : `sales pay ${onePlace(sellPct)}% under`;
  if (waived) {
    return driver('standing', `${faction} standing: surcharge waived`, 'Surcharge waived',
      `${faction}${tier} would add a surcharge to your buys; your commission waives it, so buys run at a stranger's quote${
        onePlace(sellPct) === 0 ? '.' : ` and ${sellWord} a stranger's quote.`}`, 'flat', 1);
  }
  const favourable = buyPct < 0 || sellPct > 0;
  const buyShort = `${buyPct < 0 ? '−' : '+'}${onePlace(buyPct)}%`;
  return driver('standing', `${faction} standing${tier}`, `${record.tier || faction} ${buyShort}`,
    `Your standing with ${faction}${tier} ${favourable ? 'improves' : 'worsens'} the dealers' spread: ${buyWord} and ${sellWord} a stranger's quote at this berth.`,
    favourable ? 'down' : 'up', Math.round(applied.buy * 1000) / 1000);
}

export function presentMarketDrivers({ state, stationId, commodity, entry, cycle, reputation } = {}) {
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

  const standing = standingDriver(state, station, entry, reputation);
  const primary = Object.freeze(standing
    ? [roleDriver, geographyDriver, conflictDriver, cycleDriver, standing]
    : [roleDriver, geographyDriver, conflictDriver, cycleDriver]);
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
