// marketNews.js — surface the already-deep-but-invisible economy as a 1-line NEWS TICKER plus
// dock "event cards". READ-ONLY over the economy: this module NEVER mutates prices, stock, or any
// economy state. It listens to economy events for generated headlines and to `news:publish` for
// already-authored literal copy, then emits presentation signals (voice on the "news" channel, else
// a "toast").
//
// Split of concerns:
//   • generateHeadline(...) / buildEventCard(...) — PURE, deterministic given (inputs + seed). No DOM,
//     no bus, no clock. Template + variant selection is seeded from state.meta.seed + an event key via
//     core/rng.js hash32 (NO Math.random in the generator). Unit-testable headless.
//   • createMarketNews(ctx) — the wired UI system: subscribes to economy events, routes surfaced
//     headlines through ctx.helpers.voice?.say('news', ...) if present else emits 'toast', maintains a
//     rolling headline log on state.ui.marketNews, and (only when a DOM document exists) mounts a
//     small ticker strip. All DOM usage is guarded behind `typeof document`.
//
// Determinism note: this is a UI/presentation system (SYSTEMS only, NOT UPDATE_ORDER). The pure
// generator is deterministic so tests + any deterministic replay of surfaced headlines are stable;
// the DOM ticker itself is cosmetic and may use timers/rAF freely (guarded by typeof window).

import { COMMODITIES } from '../data/commodities.js';
import { hash32 } from '../core/rng.js';
import {
  HEADLINE_TEMPLATES, REGIME_TEMPLATES, CARD_TEMPLATES, COMMODITY_FLAVOR,
  normalizeKind, fillTemplate,
} from '../data/newsTemplates.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MAX_LOG = 12;            // rolling headlines kept on state.ui.marketNews.log
const MAX_TICKER_ITEMS = 8;    // DOM ticker cap

// ---- token building (pure) -----------------------------------------------------------------

/** Human display name for a commodity id (falls back to a de-prefixed id). */
export function commodityName(commodityId, catalog) {
  if (commodityId === '*' || !commodityId) return 'the market';
  const def = (catalog && catalog.get && catalog.get(commodityId)) || CMDTY_BY_ID.get(commodityId);
  if (def && def.name) return def.name;
  return String(commodityId).replace(/^cmdty_/, '').replace(/_/g, ' ');
}

/** Lowercased prose noun for a commodity, preferring bespoke atmospheric flavor. */
function commodityNoun(commodityId, catalog) {
  const fl = COMMODITY_FLAVOR[commodityId];
  if (fl && fl.noun) return fl.noun;
  return commodityName(commodityId, catalog).toLowerCase();
}

/** Friendly station label from a station id (or a passed-in name). */
export function stationLabel(stationId, stationName) {
  if (stationName) return stationName;
  if (!stationId) return 'the station';
  return String(stationId).replace(/^station_/, '').replace(/_/g, ' ');
}

function tokensFor(ev, catalog) {
  return {
    name: commodityName(ev.commodityId, catalog),
    noun: commodityNoun(ev.commodityId, catalog),
    station: stationLabel(ev.stationId, ev.stationName),
  };
}

// ---- deterministic variant selection -------------------------------------------------------

/** Stable event key: identifies "this event" independent of wall-clock, for seeded variant pick. */
export function eventKey(ev) {
  return [ev.kind || ev.type || 'event', ev.stationId || '-', ev.commodityId || '-', ev.eventId || ev.id || ''].join(':');
}

/**
 * Pick one variant from `variants` deterministically from (seed + key).
 * hash32 over (seed, key) → index. No Math.random. Returns '' if the list is empty.
 */
export function pickVariant(variants, seed, key) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  const h = hash32(seed >>> 0 || 0, String(key || ''));
  return variants[h % variants.length];
}

// ---- PURE headline generator ---------------------------------------------------------------

/**
 * generateHeadline(ev, opts) -> string
 *   ev: { type|kind, stationId, commodityId, stationName?, eventId?, regime? }
 *   opts: { seed, catalog? }  (catalog = optional Map<id,def>; defaults to the static catalog)
 * Deterministic: same (ev, seed) always yields the same non-empty headline.
 */
export function generateHeadline(ev, opts = {}) {
  if (!ev) return '';
  const seed = (opts.seed >>> 0) || 0;
  const catalog = opts.catalog || CMDTY_BY_ID;
  const kind = ev.kind || normalizeKind(ev.type);
  const isRegime = ev.type === 'regime' || ev.kind === 'regime';
  const variants = isRegime
    ? (REGIME_TEMPLATES[ev.regime] || REGIME_TEMPLATES.stable)
    : (HEADLINE_TEMPLATES[kind] || HEADLINE_TEMPLATES.event);
  const key = eventKey({ ...ev, kind: isRegime ? ('regime:' + (ev.regime || 'stable')) : kind });
  const tpl = pickVariant(variants, seed, key);
  const line = fillTemplate(tpl, tokensFor(ev, catalog)).replace(/\s+/g, ' ').trim();
  return line;
}

/**
 * buildEventCard(ev, opts) -> { badge, tone, title, body, headline, kind } | null
 * A dock event card for shortage/boom/etc, shown on arrival. PURE + deterministic.
 */
export function buildEventCard(ev, opts = {}) {
  if (!ev) return null;
  const seed = (opts.seed >>> 0) || 0;
  const catalog = opts.catalog || CMDTY_BY_ID;
  const kind = ev.kind || normalizeKind(ev.type);
  const card = CARD_TEMPLATES[kind] || CARD_TEMPLATES.event;
  const tokens = tokensFor(ev, catalog);
  return {
    kind,
    badge: card.badge,
    tone: card.tone,
    title: fillTemplate(card.title, tokens),
    body: fillTemplate(card.body, tokens),
    headline: generateHeadline({ ...ev, kind }, { seed, catalog }),
    stationId: ev.stationId || null,
    commodityId: ev.commodityId || null,
  };
}

/**
 * Cards for a docked station, derived READ-ONLY from live econEvents. Deterministic ordering +
 * variant. Degrades to [] if the economy is absent.
 */
export function cardsForStation(state, stationId, opts = {}) {
  const seed = (opts.seed >>> 0) || ((state && state.meta && (hash32(state.meta.seed) >>> 0)) || 0);
  const econ = state && state.economy;
  const events = (econ && econ.econEvents) || [];
  const out = [];
  for (const ev of events) {
    if (ev.stationId !== stationId) continue;
    const card = buildEventCard(
      { type: ev.type, kind: normalizeKind(ev.type), stationId: ev.stationId, commodityId: ev.commodityId, eventId: ev.id },
      { seed },
    );
    if (card) out.push(card);
    if (out.length >= 4) break;
  }
  return out;
}

// ---- wired UI system -----------------------------------------------------------------------

export function createMarketNews(ctx) {
  const bus = ctx && ctx.bus;
  const state = ctx && ctx.state;
  const helpers = (ctx && ctx.helpers) || {};
  if (!state) return { name: 'marketNews', destroy() {} };

  // rolling headline log lives on state.ui (additive; never required by other systems)
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!state.ui.marketNews || typeof state.ui.marketNews !== 'object') {
    state.ui.marketNews = { log: [], lastCard: null };
  }
  const model = state.ui.marketNews;
  if (!Array.isArray(model.log)) model.log = [];

  function seedOf() {
    return (state.meta && (hash32(state.meta.seed) >>> 0)) || 0;
  }

  // Commit a resolved headline to the rolling log, one-voice floor, ticker, and downstream event.
  // `metadata` is only supplied by the authored `news:publish` path; economy emissions retain their
  // original compact payload shapes.
  function commitHeadline(headline, ev, { quiet = false, metadata = null } = {}) {
    if (!headline) return null;
    const kind = ev.kind || normalizeKind(ev.type);
    const stationId = ev.stationId || null;
    const rec = metadata
      ? { ...metadata, text: headline, kind, t: (state.simTime || 0), stationId }
      : { text: headline, kind, t: (state.simTime || 0), stationId };
    model.log.unshift(rec);
    if (model.log.length > MAX_LOG) model.log.length = MAX_LOG;

    if (!quiet && bus) {
      const voiceMetadata = metadata ? { ...metadata } : null;
      if (voiceMetadata) delete voiceMetadata.channel;
      const said = helpers.voice && typeof helpers.voice.say === 'function'
        ? helpers.voice.say({ channel: 'news', ...(voiceMetadata || {}), text: headline, kind: rec.kind })
        : false;
      if (!said) bus.emit('toast', { text: headline, kind: toastKind(rec.kind), ttl: 4 });
    }
    renderTicker();
    if (bus) bus.emit('news:headline', metadata
      ? { ...metadata, headline, kind: rec.kind, stationId: rec.stationId }
      : { headline, kind: rec.kind, stationId: rec.stationId });
    return rec;
  }

  // Economy events still use deterministic templates.
  function surface(ev, { channel = 'news', quiet = false } = {}) {
    const headline = generateHeadline(ev, { seed: seedOf() });
    return commitHeadline(headline, ev, { quiet });
  }

  // Authored narrative copy must arrive verbatim. Do not pass it through generateHeadline: doing so
  // would replace the authored line with a commodity template and discard provenance metadata.
  function surfacePublished(ev) {
    if (!ev || typeof ev.text !== 'string' || !ev.text.trim()) return null;
    return commitHeadline(ev.text, ev, { metadata: ev });
  }

  // ---- economy subscriptions (READ-ONLY) ---------------------------------------------------
  const subs = [];
  function on(evt, fn) { if (bus && bus.on) { bus.on(evt, fn); subs.push([evt, fn]); } }

  on('news:publish', surfacePublished);
  on('economy:eventStarted', (p) => {
    if (!p) return;
    surface({ type: p.type, stationId: p.stationId, commodityId: p.commodityId, eventId: p.eventId });
  });
  // When docking, stash a dock card for the most relevant local event (shown by the dock screen).
  on('dock:docked', (p) => {
    if (!p || !p.stationId) return;
    const cards = cardsForStation(state, p.stationId, { seed: seedOf() });
    model.lastCard = cards[0] || null;
    if (bus) bus.emit('news:dockCards', { stationId: p.stationId, cards });
  });
  // Reset the log on a fresh game / load so stale headlines don't leak across sessions.
  on('save:loaded', () => { model.log = []; model.lastCard = null; renderTicker(); });
  on('game:newGame', () => { model.log = []; model.lastCard = null; renderTicker(); });

  // ---- DOM ticker (cosmetic; fully guarded) -----------------------------------------------
  let tickerEl = null;
  function ensureTicker() {
    if (typeof document === 'undefined') return null;
    if (tickerEl && tickerEl.isConnected) return tickerEl;
    // Flight already surfaces news through the one-voice alert floor. A scrolling multi-headline
    // ticker is only allowed on screens that deliberately provide this host.
    const host = document.getElementById('news-ticker');
    if (!host) return null;
    let el = document.getElementById('sf-news-ticker');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sf-news-ticker';
      el.className = 'sf-news-ticker';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-label', 'Market news');
      host.appendChild(el);
    }
    tickerEl = el;
    return el;
  }

  function renderTicker() {
    if (typeof document === 'undefined') return;
    const el = ensureTicker();
    if (!el) return;
    const items = model.log.slice(0, MAX_TICKER_ITEMS);
    el.textContent = '';
    for (let i = 0; i < items.length; i++) {
      const span = document.createElement('span');
      span.className = 'sf-news-ticker__item sf-news-ticker__item--' + (items[i].kind || 'event');
      span.textContent = items[i].text;
      el.appendChild(span);
      if (i < items.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'sf-news-ticker__sep';
        sep.textContent = ' • ';
        el.appendChild(sep);
      }
    }
  }

  // initial paint (no-op headless)
  renderTicker();

  return {
    name: 'marketNews',
    // expose the pure API + model for the dock screen / tests
    surface,
    generateHeadline: (ev) => generateHeadline(ev, { seed: seedOf() }),
    buildEventCard: (ev) => buildEventCard(ev, { seed: seedOf() }),
    cardsForStation: (stationId) => cardsForStation(state, stationId, { seed: seedOf() }),
    getLog: () => model.log.slice(),
    getLastCard: () => model.lastCard,
    render: renderTicker,
    destroy() {
      for (const [evt, fn] of subs) { if (bus && bus.off) bus.off(evt, fn); }
      subs.length = 0;
      if (tickerEl && tickerEl.parentNode) tickerEl.parentNode.removeChild(tickerEl);
      tickerEl = null;
    },
  };
}

/** Map a news kind to a toast kind for the fallback path. */
function toastKind(kind) {
  switch (kind) {
    case 'shortage': return 'warn';
    case 'boom': return 'good';
    case 'blockade': return 'danger';
    case 'piracy': return 'danger';
    default: return 'info';
  }
}

export default createMarketNews;
