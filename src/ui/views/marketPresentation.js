// Market display only. Prices, affordability, selection and transaction ownership remain in market.js.
// An explicit read model keeps the rendered register testable without importing game simulation.
import { escapeMarkup as escapeHtml } from './identity.js';
import { commodityGlyphHtml } from './commodityGlyphs.js';
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
  // A price that has not moved is flat, not up: every row of a quiet exchange read "▲0%" in green.
  if (pct === 0) return '<span class="sx-mkt-row__tr k-t-fine is-flat" aria-label="Unchanged">0%</span>';
  return `<span class="sx-mkt-row__tr k-t-fine ${pct > 0 ? 'k-good is-up' : 'k-bad is-down'}">${pct > 0 ? '▲' : '▼'}${Math.abs(pct)}%</span>`;
}
/**
 * The quote's instrument: the last ten minutes of this station's price, drawn as light.
 *
 * It used to be a 300x74 SVG scaled up to fill its box -- a thin line in a dark rectangle that a
 * player read as the "Stable demand" box, an instrument that showed nothing (ONE_PHOTOGRAPH.md
 * section 4.5). Now the plot is sized to its container: the trace is a 2px phosphor line that
 * stays 2px at any width (non-scaling stroke), the galactic average is a dashed reference, the
 * station's buy and sell quotes are two lamp ticks on the right edge, and the forecast cone keeps
 * its place after "now". Labels are HTML, positioned in percent, so they are real type at any
 * scale instead of text stretched with the drawing. Every sample is written into data-points so
 * the controller can run a hover crosshair without recomputing anything.
 */
export function buildChart(history, average, gradientId, label, extras = {}) {
  const histPts = historySamples(history);
  const hist = histPts.map((p) => p.mid);
  if (!hist.length) return '<p class="k-empty">Price history unavailable.</p>';
  const forecastPts = forecastSamples(extras && extras.forecast);
  const forecast = forecastPts.map((p) => p.mid);
  const W = 1000, H = 240, pad = 10;
  const avg = Number.isFinite(Number(average)) ? Number(average) : hist[0];
  const buyQ = Number(extras && extras.buy);
  const sellQ = Number(extras && extras.sell);
  const refs = [avg, ...(Number.isFinite(buyQ) ? [buyQ] : []), ...(Number.isFinite(sellQ) ? [sellQ] : [])];
  let min = Math.min(...hist, ...refs, ...(forecast.length ? forecast : [hist[0]]));
  let max = Math.max(...hist, ...refs, ...(forecast.length ? forecast : [hist[0]]));
  // A FLAT SERIES MUST NOT DRAW AT THE FLOOR. `max - min || 1` turned an unchanging price into a
  // span of 1 and every sample then mapped to the bottom of the box. A commodity at rest sits on
  // the mid-line, with a little headroom either side so the reference lines separate.
  const flat = max - min < 1e-9;
  if (!flat) { const head = (max - min) * 0.12; min -= head; max += head; }
  const span = flat ? 1 : max - min;
  const mapper = chartXMapper(histPts, forecastPts, extras && extras.now, pad, W - 2 * pad);
  const y = flat ? () => H / 2 : (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const histCoords = histPts.map((p, i) => ({ x: mapper.at(p.t, i), y: y(p.mid), mid: p.mid, t: p.t }));
  const points = histCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  const end = histCoords.at(-1);
  const endX = end.x.toFixed(1);
  const histMids = hist.join(',');
  let coneMarkup = '';
  let forecastCoords = [];
  if (forecastPts.length) {
    const join = histCoords.at(-1);
    forecastCoords = forecastPts.map((p, i) => ({ x: mapper.at(p.t, histPts.length + i), y: y(p.mid), mid: p.mid, t: p.t }));
    const coneCoords = [join, ...forecastCoords];
    const conePoints = coneCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    const forecastLine = forecastCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    const nowX = join.x.toFixed(1);
    const lastX = coneCoords.at(-1).x.toFixed(1);
    coneMarkup = `<line class="sx-mkt-now" data-now x1="${nowX}" y1="0" x2="${nowX}" y2="${H}" vector-effect="non-scaling-stroke"/>
    <path class="sx-mkt-cone" data-forecast-band data-forecast-mids="${escapeHtml(forecast.join(','))}" d="M ${conePoints.join(' L ')} L ${lastX},${H} L ${nowX},${H} Z"/>
    <path class="sx-mkt-forecast" data-forecast-line fill="none" vector-effect="non-scaling-stroke" stroke-dasharray="6 5" stroke-linejoin="round" d="M ${forecastLine.join(' L ')}"/>`;
  }
  const forecastNote = forecast.length
    ? ` History ${hist.length} samples, ${fmt(hist[0])} to ${fmt(hist.at(-1))} credits. Forecast ${forecast.length} steps, ${fmt(forecast[0])} to ${fmt(forecast.at(-1))} credits.`
    : `: ${hist.length} samples, ${fmt(hist[0])} to ${fmt(hist.at(-1))} credits.`;
  // percent positions for the HTML overlay (labels, the live dot, the crosshair's samples)
  const px = (x) => ((x / W) * 100).toFixed(2);
  const py = (v) => ((y(v) / H) * 100).toFixed(2);
  const now = Number(extras && extras.now);
  const ago = (t) => (Number.isFinite(t) && Number.isFinite(now) ? Math.round(t - now) : '');
  const dataPoints = [...histCoords.map((p) => `${px(p.x)}:${((p.y / H) * 100).toFixed(2)}:${Math.round(p.mid)}:${ago(p.t)}:h`),
    ...forecastCoords.map((p) => `${px(p.x)}:${((p.y / H) * 100).toFixed(2)}:${Math.round(p.mid)}:${ago(p.t)}:f`)].join(';');
  const tick = (cls, v, word) => (Number.isFinite(v)
    ? `<span class="sx-mkt-instrument__tick sx-mkt-instrument__tick--${cls}" style="top:${py(v)}%" aria-hidden="true"><i></i>${word} ${fmt(v)}</span>` : '');
  const rangeLabels = flat ? '' :
    `<span class="sx-mkt-instrument__y sx-mkt-instrument__y--max" aria-hidden="true">${fmt(max)}</span>` +
    `<span class="sx-mkt-instrument__y sx-mkt-instrument__y--min" aria-hidden="true">${fmt(min)}</span>`;
  // data-so-chart opts the trace out of stationEffects' older in-SVG probe: this instrument carries
  // its own crosshair (pointer and Left/Right keys, market.js), drawn in HTML so its label is not
  // stretched with the plot.
  return `<figure class="sx-mkt-instrument" data-chart-host data-points="${escapeHtml(dataPoints)}">
  <div class="sx-mkt-instrument__plot" tabindex="0" role="group" aria-label="${escapeHtml(label || 'Price history')} trace. Use Left and Right to read recorded samples.">
    <svg class="sx-mkt-chart" data-chart="${escapeHtml(gradientId)}" data-so-chart="instrument" data-history-mids="${escapeHtml(histMids)}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label || 'Price history')}${forecastNote}">
      <line class="sx-mkt-avg" x1="0" y1="${y(avg).toFixed(1)}" x2="${W}" y2="${y(avg).toFixed(1)}" vector-effect="non-scaling-stroke" stroke-dasharray="3 6"/>
      <path class="of-chart-area" d="M ${histCoords[0].x.toFixed(1)},${H} L ${points.join(' L ')} L ${endX},${H} Z"/>
      <path class="sx-mkt-line" data-history-line d="M ${points.join(' L ')}" fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      ${coneMarkup}
    </svg>
    ${rangeLabels}
    <span class="sx-mkt-instrument__avg" style="top:${py(avg)}%" aria-hidden="true">avg ${fmt(avg)}</span>
    ${tick('buy', buyQ, 'buy')}${tick('sell', sellQ, 'sell')}
    <span class="sx-mkt-instrument__dot" style="left:${px(end.x)}%;top:${((end.y / H) * 100).toFixed(2)}%" aria-hidden="true"></span>
    <span class="sx-mkt-instrument__cursor" data-chart-cursor hidden aria-hidden="true"><i></i><b></b></span>
    <span class="sx-mkt-instrument__live" data-chart-live aria-live="polite"></span>
  </div>
</figure>`;
}
export function marketRowHtml({ id, name, category = '', buy, sell, stock, held = 0, hist = [], demandWord = 'normal', driversSummary = '', selected = false, tracked = false, profitPct = null, presentation = null }) {
  const family = marketFamily(category);
  const presentationId = presentation && typeof presentation.id === 'string' ? presentation.id.trim() : '';
  const presentationColor = presentation && typeof presentation.color === 'string'
    && /^#[0-9a-f]{6}$/i.test(presentation.color) ? presentation.color : '';
  const icon = presentationId && presentationColor
    ? `<span class="sx-mkt-row__commodity" data-commodity-presentation="${escapeHtml(presentationId)}" style="color:${escapeHtml(presentationColor)}">${commodityGlyphHtml(category, 'of-commodity-icon')}</span>`
    : commodityGlyphHtml(category, 'of-commodity-icon');
  const profitBadge = Number.isFinite(profitPct) && profitPct >= 15 && held > 0
    ? `<span class="sx-mkt-row__profit" title="Local sell price beats your cost basis by ${Math.round(profitPct)}%">+${Math.round(profitPct)}% PROFIT</span>`
    : '';
  return `<tr id="sx-market-tab-${escapeHtml(id)}" class="sx-mkt-row${selected ? ' is-active' : ''}${tracked ? ' is-tracked' : ''}" data-cmdty="${escapeHtml(id)}" role="tab" aria-selected="${!!selected}" tabindex="${selected ? '0' : '-1'}" aria-controls="sx-market-instrument" data-family="${family}"
    aria-label="${escapeHtml(name)}, ${fmt(buy)} credits, ${escapeHtml(demandWord)} demand${held ? `, ${fmt(held)} units held` : ''}${profitBadge ? `, ${Math.round(profitPct)} percent over your cost basis` : ''}${tracked ? ', tracked for your active contract' : ''}. ${escapeHtml(driversSummary)}">
    <td class="k-name sx-mkt-row__name">${icon}${tracked ? '<span class="sx-mkt-row__flag k-t-fine k-signal" aria-hidden="true">◆ </span>' : ''}${escapeHtml(name)}${profitBadge}</td>
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

function saleLineHtml({ sell, saleQty, saleQuote }) {
  const qty = Math.max(1, Math.floor(Number(saleQty) || 1));
  // INF-083: a contemplated batch is quoted through the economy owner for the FULL
  // quantity — stock-sensitive average over the whole move, never unit×qty. The legacy
  // unit×qty read stays as the fail-soft fallback (exact for a single unit).
  if (saleQuote && saleQuote.ok && Number.isFinite(Number(saleQuote.total))) {
    const q = Math.max(1, Math.floor(Number(saleQuote.qty) || qty));
    const avg = Math.round(Number(saleQuote.unitAvg));
    const credits = Math.round(Number(saleQuote.total));
    const partial = saleQuote.partial ? ` · fills ${fmt(q)} u` : '';
    return `<p class="k-sentence sx-mkt-sale" data-sale-line data-sale-qty="${q}" data-sale-credits="${credits}">Contemplated sale · ${fmt(q)} × ${fmt(avg)} cr = ${fmt(credits)} cr${partial}</p>`;
  }
  const unit = Number(sell);
  if (!Number.isFinite(unit)) return '';
  const credits = Math.round(unit * qty);
  return `<p class="k-sentence sx-mkt-sale" data-sale-line data-sale-qty="${qty}" data-sale-credits="${credits}">Contemplated sale · ${fmt(qty)} × ${fmt(unit)} cr = ${fmt(credits)} cr</p>`;
}

function chartKeyHtml(hasForecast) {
  return `<p class="k-t-fine sx-mkt-chart-key"><span data-history-key>Last ten minutes</span><span class="sx-mkt-chart-key__now">now</span>${hasForecast ? '<span data-forecast-key>Forecast</span>' : ''}</p>`;
}

// What each price driver is ABOUT, so its short word can stand alone on the reading line.
const DRIVER_KIND = Object.freeze({ role: 'Local', geography: 'Spread', conflict: 'Sector', cycle: 'Trend' });
const DRIVER_ARROW = Object.freeze({ up: '\u2191', down: '\u2193' });

/**
 * THE READING LINE. The quote used to open with a seven-line paragraph -- every driver's full
 * explanation run together (ONE_PHOTOGRAPH.md section 4.6, "the essay"). A reading is a word and
 * a cause: Local Balanced / Spread Tight core / Sector No conflict / Trend Stable. The paragraph is
 * kept, visually hidden, because the stage is aria-describedby it -- a screen reader still gets
 * the whole explanation, and it is still the codex's prose, not the market's.
 */
function driverLineHtml(primary) {
  const items = (Array.isArray(primary) ? primary : []).filter((d) => d && d.shortLabel);
  if (!items.length) return '';
  return `<ul class="sx-mkt-drivers" aria-hidden="true">${items.map((d) => {
    const dir = String(d.direction || 'flat');
    const arrow = DRIVER_ARROW[dir] && !/[\u2191\u2193]/.test(d.shortLabel) ? ` ${DRIVER_ARROW[dir]}` : '';
    return `<li class="sx-mkt-drivers__item" data-dir="${escapeHtml(dir)}" title="${escapeHtml(d.explanation || '')}"><span class="sx-mkt-drivers__k">${escapeHtml(DRIVER_KIND[d.id] || d.label || '')}</span><span class="sx-mkt-drivers__v">${escapeHtml(d.shortLabel)}${arrow}</span></li>`;
  }).join('')}</ul>`;
}

/** The four readings under the trace are also its key: each carries the mark it draws. */
function readoutsHtml({ buy, sell, avg, demandWord }) {
  const item = (key, cls, value, sub) =>
    `<div class="sx-mkt-readouts__item sx-mkt-readouts__item--${cls}"><dt><i class="sx-mkt-readouts__mark" aria-hidden="true"></i>${escapeHtml(key)}${sub ? ` <span class="sx-mkt-readouts__sub">${escapeHtml(sub)}</span>` : ''}</dt><dd>${escapeHtml(value)}</dd></div>`;
  return `<dl class="sx-mkt-readouts">${item('Buy', 'buy', `${fmt(buy)} cr`, 'you pay')}${item('Sell', 'sell', `${fmt(sell)} cr`, 'station pays')}${item('Galactic average', 'avg', `${fmt(avg)} cr`)}${item('Demand', 'demand', demandWord)}</dl>`;
}

export function marketQuoteHtml({ id, name, category, legal = 'legal', titleHtml, mode = 'buy', buy, sell, avg, demandWord = 'normal', driversSummary = '', drivers = [], hist = [], forecast = [], now, regime = '', quoteAge = '', saleQty = 1, saleQuote = null, trackedGuidance = null, producedBy, consumedBy, stationType }) {
  const legalText = ({ legal: 'Legal', restricted: 'Restricted', contraband: 'Contraband' })[legal] || String(legal);
  const chainHtml = supplyChainHtml(presentSupplyChain({ producedBy, consumedBy, stationType }));
  const forecastPts = forecastSamples(forecast);
  // titleHtml is a trusted entityResolver fragment generated by the production controller, never user input.
  return (trackedGuidance ? `<p class="k-sentence k-signal sx-mkt-tracked" data-tracked-state="${escapeHtml(trackedGuidance.state)}"><b>Tracked contract</b> — ${escapeHtml(trackedGuidance.text)}</p>` : '') +
    `<p class="k-caps sx-mkt-cat-inline">${escapeHtml(category || 'goods')} · <span class="${legal === 'contraband' ? 'k-bad' : legal === 'restricted' ? 'k-signal' : ''}">${escapeHtml(legalText)}</span></p>
    <h2 class="k-display k-t-title sx-mkt-title">${titleHtml || escapeHtml(name)}</h2>
    <div class="k-hero k-hero--hero k-hero--signal sx-mkt__hero"><div class="k-hero__n">${fmt(mode === 'sell' ? sell : buy)}</div><div class="k-hero__w">${mode === 'sell' ? 'station pays' : 'you pay'} · per unit</div></div>
    ${driverLineHtml(drivers)}
    <p class="k-sentence sx-mkt-essay" id="sx-market-driver-summary">${escapeHtml(driversSummary)}</p>
    ${chainHtml}
    ${coneReadoutHtml({ regime, quoteAge })}
    ${buildChart(hist, avg, `sxmkt-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`, name, { forecast: forecastPts, now, buy, sell })}
    ${chartKeyHtml(forecastPts.length > 0)}
    ${readoutsHtml({ buy, sell, avg, demandWord })}
    ${saleLineHtml({ sell, saleQty, saleQuote })}`;
}
export function marketReceiptRow(k, v, tone) {
  const cls = tone === 'gain' ? ' k-good' : tone === 'loss' ? ' k-bad' : '';
  return `<li class="k-row k-row--static sx-kv"><span>${escapeHtml(k)}</span><b class="k-row__num${cls}">${escapeHtml(v)}</b></li>`;
}
export function marketTradeHtml({ mode, qty, canAct, receiptHtml, totalLabel = '', totalText = '', note = '' }) {
  const word = side => {
    const live = side === mode;
    return `<li><button type="button" class="k-word k-word--emph sx-seg__btn sx-trade__go sx-trade__go--${side}${live ? ' is-on k-word--primary' : ''}" data-mode="${side}" aria-pressed="${live}"${live ? ` data-go${canAct ? '' : ' disabled'}` : ''}>${live ? `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(qty)}` : side === 'buy' ? 'Buy' : 'Sell'}</button></li>`;
  };
  return `<div class="sx-trade"><div class="sx-qty">
    <label class="k-caps sx-qty__k" for="sx-market-qty">Quantity</label><input id="sx-market-qty" class="k-input k-input--num sx-qty__in" type="text" inputmode="numeric" value="${escapeHtml(qty)}" aria-label="Quantity"/>
    <ul class="k-words k-words--row sx-qty__words"><li><button type="button" class="k-word k-word--body sx-qty__b" data-q="-1">Fewer</button></li><li><button type="button" class="k-word k-word--body sx-qty__b" data-q="1">More</button></li><li><button type="button" class="k-word k-word--body sx-qty__max" data-q="max">Max</button></li></ul></div>
    <div class="so-trade-total"><span data-trade-total-label>${escapeHtml(totalLabel)}</span><strong data-trade-total>${escapeHtml(totalText)}</strong></div>
    <details class="so-trade-breakdown"><summary>Quote breakdown <span>Live · includes price impact</span></summary><ul class="k-rows sx-trade__rows" data-market-intel>${receiptHtml}</ul></details>
    <ul class="k-words k-words--row sx-seg sx-trade__words" role="group" aria-label="Buy or sell">${word('buy')}${word('sell')}</ul>
    <p class="k-t-fine k-38 sx-trade__note" ${note ? '' : 'hidden'}>${escapeHtml(note)}</p></div>`;
}
