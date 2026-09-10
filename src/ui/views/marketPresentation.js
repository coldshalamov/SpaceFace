// Market display only. Prices, affordability, selection and transaction ownership remain in market.js.
// An explicit read model keeps the rendered register testable without importing game simulation.
import { escapeMarkup as escapeHtml, iconHtml } from './identity.js';
const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
export const MARKET_FILTERS = Object.freeze([
  { id: 'all', label: 'All stock' }, { id: 'hold', label: 'In hold' },
  { id: 'raw', label: 'Raw & rare' }, { id: 'industry', label: 'Industry' },
  { id: 'civilian', label: 'Civilian' }, { id: 'salvage', label: 'Salvage' },
  { id: 'military', label: 'Military' }, { id: 'restricted', label: 'Restricted' },
]);
export function marketFamily(category) {
  if (['raw ore', 'gas', 'crystal', 'exotic'].includes(category)) return 'raw';
  if (['refined', 'component', 'tech'].includes(category)) return 'industry';
  if (['consumer', 'luxury', 'food', 'med'].includes(category)) return 'civilian';
  if (category === 'salvage') return 'salvage';
  if (category === 'military') return 'military';
  if (category === 'contraband') return 'restricted';
  return 'civilian';
}
export function marketBrowserHtml() {
  return `<div class="sx-mkt-browser">
    <p class="k-caps sx-mkt-browser__mode">Station exchange<b class="sx-mkt-browser__count"></b></p>
    <ul class="k-words k-words--row sx-mkt-browser__filters" aria-label="Commodity families">${MARKET_FILTERS.map(f =>
      `<li><button type="button" class="k-word k-word--body sx-mkt-filter" data-market-filter="${f.id}" aria-pressed="false">${f.label}</button></li>`).join('')}</ul>
    <input class="k-input sx-mkt-search" type="search" data-market-search placeholder="Find a commodity" aria-label="Find a commodity" autocomplete="off" spellcheck="false"/>
    <div class="k-table-wrap sx-mkt-browser__rail"><table class="k-table sx-mkt-table">
      <thead><tr><th class="k-caps" scope="col">Commodity</th><th class="k-caps k-num" scope="col">Buy</th><th class="k-caps k-num" scope="col">Sell</th><th class="k-caps k-num" scope="col">Stock</th><th class="k-caps" scope="col">Held</th></tr></thead>
      <tbody role="tablist" aria-label="Commodities"></tbody></table><p class="k-empty sx-mkt-browser__empty" hidden></p>
    </div></div>`;
}
function historyMid(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') return Number(value.mid);
  return NaN;
}
function historySamples(history) {
  const out = [];
  for (const value of Array.isArray(history) ? history : []) {
    const mid = historyMid(value);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    const t = value && typeof value === 'object' ? Number(value.t) : NaN;
    out.push(Number.isFinite(t) ? { t, mid } : { mid });
  }
  return out;
}
function finiteHistory(history) {
  return historySamples(history).map((point) => point.mid);
}
function forecastSamples(forecast) {
  return historySamples(forecast);
}
function chartXMapper(histPts, forecastPts, nowHint, pad, innerW) {
  const histTimes = histPts.map((p) => p.t).filter((t) => Number.isFinite(t));
  const forecastTimes = forecastPts.map((p) => p.t).filter((t) => Number.isFinite(t));
  const timedHist = histTimes.length === histPts.length && histPts.length > 0;
  const timedForecast = !forecastPts.length || forecastTimes.length === forecastPts.length;
  if (timedHist && timedForecast) {
    const now = Number.isFinite(Number(nowHint)) ? Number(nowHint) : histTimes.at(-1);
    const start = Math.min(histTimes[0], now);
    const end = forecastTimes.length ? Math.max(now, forecastTimes.at(-1)) : now;
    const span = end > start ? end - start : 1;
    return {
      mode: 'time',
      now,
      at(t, fallbackIndex) {
        const value = Number.isFinite(t) ? t : start + fallbackIndex;
        return pad + ((value - start) / span) * innerW;
      },
    };
  }
  const lastHistIndex = Math.max(0, histPts.length - 1);
  const maxIndex = lastHistIndex + forecastPts.length;
  return {
    mode: 'index',
    nowIndex: lastHistIndex,
    at(_t, index) {
      return pad + (index / Math.max(1, maxIndex)) * innerW;
    },
  };
}
export function trendHtml(history = []) {
  const hist = finiteHistory(history);
  if (hist.length < 2 || hist[0] <= 0) return '<span class="sx-mkt-row__tr k-t-fine" aria-label="History unavailable">—</span>';
  const pct = Math.round(((hist.at(-1) - hist[0]) / hist[0]) * 100);
  return `<span class="sx-mkt-row__tr k-t-fine ${pct >= 0 ? 'k-good is-up' : 'k-bad is-down'}">${pct >= 0 ? '▲' : '▼'}${Math.abs(pct)}%</span>`;
}
export function buildChart(history, average, gradientId, label, extras = {}) {
  const histPts = historySamples(history);
  const hist = histPts.map((p) => p.mid);
  if (!hist.length) return '<p class="k-empty">Price history unavailable.</p>';
  const forecastPts = forecastSamples(extras && extras.forecast);
  const forecast = forecastPts.map((p) => p.mid);
  const W = 300, H = 74, pad = 5;
  const avg = Number.isFinite(Number(average)) ? Number(average) : hist[0];
  const min = Math.min(...hist, avg, ...(forecast.length ? forecast : [hist[0]]));
  const max = Math.max(...hist, avg, ...(forecast.length ? forecast : [hist[0]]));
  const span = max - min || 1;
  const mapper = chartXMapper(histPts, forecastPts, extras && extras.now, pad, W - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const histCoords = histPts.map((p, i) => ({
    x: mapper.at(p.t, i),
    y: y(p.mid),
  }));
  const points = histCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  const endX = histCoords.at(-1).x.toFixed(1);
  const endY = histCoords.at(-1).y.toFixed(1);
  const histMids = hist.join(',');
  let coneMarkup = '';
  if (forecastPts.length) {
    const join = histCoords.at(-1);
    const forecastCoords = forecastPts.map((p, i) => ({
      x: mapper.at(p.t, histPts.length + i),
      y: y(p.mid),
    }));
    const coneCoords = [join, ...forecastCoords];
    const conePoints = coneCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    const forecastLine = forecastCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    const nowX = join.x.toFixed(1);
    const lastX = coneCoords.at(-1).x.toFixed(1);
    coneMarkup = `<line class="sx-mkt-now" data-now x1="${nowX}" y1="${pad}" x2="${nowX}" y2="${H - pad}"/>
    <path class="sx-mkt-cone" data-forecast-band data-forecast-mids="${escapeHtml(forecast.join(','))}" d="M ${conePoints.join(' L ')} L ${lastX},${H - pad} L ${nowX},${H - pad} Z"/>
    <path class="sx-mkt-forecast" data-forecast-line fill="none" stroke-width="1.4" stroke-dasharray="4 3" stroke-linejoin="round" d="M ${forecastLine.join(' L ')}"/>`;
  }
  const forecastNote = forecast.length
    ? ` History ${hist.length} samples, ${fmt(hist[0])} to ${fmt(hist.at(-1))} credits. Forecast ${forecast.length} steps, ${fmt(forecast[0])} to ${fmt(forecast.at(-1))} credits.`
    : `: ${hist.length} samples, ${fmt(hist[0])} to ${fmt(hist.at(-1))} credits.`;
  return `<svg class="sx-mkt-chart" data-chart="${escapeHtml(gradientId)}" data-history-mids="${escapeHtml(histMids)}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeHtml(label || 'Price history')}${forecastNote}">
    <line class="sx-mkt-avg" x1="${pad}" y1="${y(avg).toFixed(1)}" x2="${W-pad}" y2="${y(avg).toFixed(1)}" stroke-dasharray="2 4"/>
    <path class="of-chart-area" d="M ${pad},${H-pad} L ${points.join(' L ')} L ${endX},${H-pad} Z"/>
    <path class="sx-mkt-line" data-history-line d="M ${points.join(' L ')}" fill="none" stroke-width="1.6" stroke-linejoin="round"/>
    ${coneMarkup}
    <circle cx="${endX}" cy="${endY}" r="3"/></svg>`;
}
export function marketRowHtml({ id, name, category = '', buy, sell, stock, held = 0, hist = [], demandWord = 'normal', driversSummary = '', selected = false, tracked = false }) {
  const family = marketFamily(category);
  const glyph = family === 'raw' ? 'ore' : family === 'industry' ? 'industry' : family === 'military' ? 'warning' : 'cargo';
  return `<tr id="sx-market-tab-${escapeHtml(id)}" class="sx-mkt-row${selected ? ' is-active' : ''}${tracked ? ' is-tracked' : ''}" data-cmdty="${escapeHtml(id)}" role="tab" aria-selected="${!!selected}" tabindex="${selected ? '0' : '-1'}" aria-controls="sx-market-instrument" data-family="${family}"
    aria-label="${escapeHtml(name)}, ${fmt(buy)} credits, ${escapeHtml(demandWord)} demand${held ? `, ${fmt(held)} units held` : ''}${tracked ? ', tracked for your active contract' : ''}. ${escapeHtml(driversSummary)}">
    <td class="k-name sx-mkt-row__name">${iconHtml(glyph, 'of-commodity-icon')}${tracked ? '<span class="sx-mkt-row__flag k-t-fine k-signal" aria-hidden="true">◆ </span>' : ''}${escapeHtml(name)}</td>
    <td class="k-num sx-mkt-row__price">${fmt(buy)} ${trendHtml(hist)}</td><td class="k-num sx-mkt-row__sell">${fmt(sell)}</td><td class="k-num sx-mkt-row__stock">${fmt(stock)}</td><td class="k-t-data k-62 sx-mkt-row__held">${held > 0 ? fmt(held) + ' u' : '—'}</td></tr>`;
}
export function statRow(k, v, sub) {
  return `<li class="k-row k-row--static sx-stat"><span class="sx-stat__k">${escapeHtml(k)}${sub ? ` <span class="k-row__sub">${escapeHtml(sub)}</span>` : ''}</span><span class="k-row__num sx-stat__v">${escapeHtml(v)}</span></li>`;
}
/** Clean a catalog station-type role the same way the market already titles type words. */
export function cleanStationRole(role) {
  return String(role || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function joinRoleWords(roles) {
  const words = (Array.isArray(roles) ? roles : []).map(cleanStationRole).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
}

/**
 * producedBy → consumedBy plus whether this dock buys, from catalog roles and the live station type.
 * Role words are the catalog ids, cleaned — no invented Mine/Refine map.
 */
export function presentSupplyChain({ producedBy = [], consumedBy = [], stationType = '' } = {}) {
  const producers = (Array.isArray(producedBy) ? producedBy : []).map((role) => String(role || '')).filter(Boolean);
  const consumers = (Array.isArray(consumedBy) ? consumedBy : []).map((role) => String(role || '')).filter(Boolean);
  const type = String(stationType || '');
  const producePhrase = joinRoleWords(producers);
  const consumePhrase = joinRoleWords(consumers);
  let chain = '';
  if (producePhrase && consumePhrase) chain = `${producePhrase} → ${consumePhrase}`;
  else if (producePhrase) chain = producePhrase;
  else if (consumePhrase) chain = consumePhrase;
  const produces = !!(type && producers.includes(type));
  const consumes = !!(type && consumers.includes(type));
  let dock = '';
  let dockRole = '';
  if (type) {
    if (consumes && produces) {
      dock = 'This dock produces and buys it.';
      dockRole = 'both';
    } else if (consumes) {
      dock = 'This dock buys it.';
      dockRole = 'consume';
    } else if (produces) {
      dock = 'This dock produces it.';
      dockRole = 'produce';
    } else {
      // Legal goods trade at every station. "Does not buy" is a lie on the live route.
      dock = consumePhrase
        ? `This dock buys it. Better prices at ${consumePhrase}.`
        : 'This dock buys it.';
      dockRole = 'neither';
    }
  }
  return { chain, dock, dockRole, stationType: type, produces, consumes, producers, consumers };
}

export function supplyChainHtml(view) {
  if (!view || (!view.chain && !view.dock)) return '';
  const role = view.dockRole || 'unknown';
  const flow = view.chain
    ? `<span class="sx-mkt-chain__flow">${escapeHtml(view.chain)}</span>`
    : '';
  const dock = view.dock
    ? `<span class="sx-mkt-chain__dock">${escapeHtml(view.dock)}</span>`
    : '';
  return `<p class="k-sentence sx-mkt-chain" data-supply-chain data-dock-role="${escapeHtml(role)}">${flow}${dock}</p>`;
}

function coneReadoutHtml({ regime, quoteAge }) {
  const bits = [];
  if (regime) bits.push(`<span data-regime>${escapeHtml(regime)}</span>`);
  if (quoteAge === 'fresh' || quoteAge === 'stale') {
    bits.push(`<span data-quote-age="${quoteAge}">${quoteAge} quote</span>`);
  }
  if (!bits.length) return '';
  return `<p class="k-sentence sx-mkt-cone-read">${bits.join(' · ')}</p>`;
}

function saleLineHtml({ sell, saleQty }) {
  const qty = Math.max(1, Math.floor(Number(saleQty) || 1));
  const unit = Number(sell);
  if (!Number.isFinite(unit)) return '';
  const credits = Math.round(unit * qty);
  return `<p class="k-sentence sx-mkt-sale" data-sale-line data-sale-qty="${qty}" data-sale-credits="${credits}">Contemplated sale · ${fmt(qty)} × ${fmt(unit)} cr = ${fmt(credits)} cr</p>`;
}

function chartKeyHtml(hasForecast) {
  if (!hasForecast) return '';
  return `<p class="k-t-fine sx-mkt-chart-key"><span data-history-key>Last ten minutes</span><span data-forecast-key>Forecast</span></p>`;
}

export function marketQuoteHtml({ id, name, category, legal = 'legal', titleHtml, mode = 'buy', buy, sell, avg, demandWord = 'normal', driversSummary = '', hist = [], forecast = [], now, regime = '', quoteAge = '', saleQty = 1, trackedGuidance = null, producedBy, consumedBy, stationType }) {
  const legalText = ({ legal: 'Legal', restricted: 'Restricted', contraband: 'Contraband' })[legal] || String(legal);
  const chainHtml = supplyChainHtml(presentSupplyChain({ producedBy, consumedBy, stationType }));
  const forecastPts = forecastSamples(forecast);
  // titleHtml is a trusted entityResolver fragment generated by the production controller, never user input.
  return (trackedGuidance ? `<p class="k-sentence k-signal sx-mkt-tracked" data-tracked-state="${escapeHtml(trackedGuidance.state)}"><b>Tracked contract</b> — ${escapeHtml(trackedGuidance.text)}</p>` : '') +
    `<p class="k-caps sx-mkt-cat-inline">${escapeHtml(category || 'goods')} · <span class="${legal === 'contraband' ? 'k-bad' : legal === 'restricted' ? 'k-signal' : ''}">${escapeHtml(legalText)}</span></p>
    <h2 class="k-display k-t-title sx-mkt-title">${titleHtml || escapeHtml(name)}</h2>
    <div class="k-hero k-hero--hero k-hero--signal sx-mkt__hero"><div class="k-hero__n">${fmt(mode === 'sell' ? sell : buy)}</div><div class="k-hero__w">${mode === 'sell' ? 'station pays' : 'you pay'} · per unit</div></div>
    <p class="k-sentence" id="sx-market-driver-summary">${escapeHtml(driversSummary)}</p>
    ${chainHtml}
    ${coneReadoutHtml({ regime, quoteAge })}
    ${buildChart(hist, avg, `sxmkt-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`, name, { forecast: forecastPts, now })}
    ${chartKeyHtml(forecastPts.length > 0)}
    ${saleLineHtml({ sell, saleQty })}
    <ul class="k-rows sx-mkt-stats">${statRow('Buy', fmt(buy) + ' cr', 'you pay')}${statRow('Sell', fmt(sell) + ' cr', 'station pays')}${statRow('Galactic average', fmt(avg) + ' cr')}${statRow('Demand', demandWord)}</ul>`;
}
export function marketReceiptRow(k, v, tone) {
  const cls = tone === 'gain' ? ' k-good' : tone === 'loss' ? ' k-bad' : '';
  return `<li class="k-row k-row--static sx-kv"><span>${escapeHtml(k)}</span><b class="k-row__num${cls}">${escapeHtml(v)}</b></li>`;
}
export function marketTradeHtml({ mode, qty, canAct, receiptHtml, note = '' }) {
  const word = side => {
    const live = side === mode;
    return `<li><button type="button" class="k-word k-word--emph sx-seg__btn sx-trade__go sx-trade__go--${side}${live ? ' is-on k-word--primary' : ''}" data-mode="${side}" aria-pressed="${live}"${live ? ` data-go${canAct ? '' : ' disabled'}` : ''}>${live ? `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(qty)}` : side === 'buy' ? 'Buy' : 'Sell'}</button></li>`;
  };
  return `<div class="sx-trade"><div class="sx-qty">
    <label class="k-caps sx-qty__k" for="sx-market-qty">Quantity</label><input id="sx-market-qty" class="k-input k-input--num sx-qty__in" type="text" inputmode="numeric" value="${escapeHtml(qty)}" aria-label="Quantity"/>
    <ul class="k-words k-words--row sx-qty__words"><li><button type="button" class="k-word k-word--body sx-qty__b" data-q="-1">Fewer</button></li><li><button type="button" class="k-word k-word--body sx-qty__b" data-q="1">More</button></li><li><button type="button" class="k-word k-word--body sx-qty__max" data-q="max">Max</button></li></ul></div>
    <ul class="k-rows sx-trade__rows" data-market-intel>${receiptHtml}</ul>
    <ul class="k-words k-words--row sx-seg sx-trade__words" role="group" aria-label="Buy or sell">${word('buy')}${word('sell')}</ul>
    <p class="k-t-fine k-38 sx-trade__note" ${note ? '' : 'hidden'}>${escapeHtml(note)}</p></div>`;
}
