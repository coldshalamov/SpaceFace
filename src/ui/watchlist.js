// watchlist.js — PQ-183.01 "the watch list". Player-pinned readings rendered as thin lines in the
// HUD receipts channel (watchlistHud.js), never a second HUD and never a toast: pins are continuous
// state, and the attention pass (design/HUD_FLIGHT_ATTENTION.md) routes continuous state to an
// instrument.
//
// Placement follows the screenMemory precedent: `state.ui.watchlist` is UI-owned player state,
// outside the simSnapshot allow-list, so pins cannot drift the 47a replay goldens. Save persistence
// is one additive field (`data.uiWatchlist`) in saveSystem beside uiScreenMemory.
//
// Pin grammar: ONE pin per entity ref. The dossier apron (entityLinks.js) is the only pin affordance —
// every mention is already a door, so the door is where you hang the watch.
//
// Pure and DOM-free: no imports beyond data catalogs, no timers, no sim writes.

import { COMMODITIES } from '../data/commodities.js';
import { aceById } from '../data/namedAces.js';
import { marketQuoteValue } from './marketDriverPresenter.js';
import { parseEntityRef, entityLabel, findContractRecord } from './entityResolver.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

export const WATCHLIST_SCHEMA_VERSION = 1;
// The receipts lane is two lines of attention; the watch list is a pinned stack ABOVE it. Eight is
// the cap that keeps the column a glance, not a wall — a ninth pin is refused with a reason, not
// silently dropped.
export const WATCHLIST_MAX = 8;

/** Entity type -> watch kind. These four are the leaf's named pins; everything else is unpinnable. */
export const WATCH_KIND_FOR_TYPE = Object.freeze({
  commodity: 'price',
  captain: 'rival',
  contract: 'deadline',
  faction: 'standing',
});
export const WATCH_KINDS = Object.freeze(['price', 'rival', 'deadline', 'standing']);

const KIND_WORD = Object.freeze({
  price: 'Price',
  rival: 'Rival',
  deadline: 'Due',
  standing: 'Standing',
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** `"commodity:cmdty_x"` -> 'price', or null for an entity class the watch list does not track. */
export function pinKindForRef(ref) {
  const parsed = parseEntityRef(ref);
  return parsed ? WATCH_KIND_FOR_TYPE[parsed.type] || null : null;
}

function cleanPin(row) {
  if (!row || typeof row !== 'object') return null;
  const ref = String(row.ref || '').trim();
  const kind = pinKindForRef(ref);
  if (!kind || kind !== row.kind) return null;
  const label = String(row.label || entityLabel(ref) || '').trim();
  if (!label) return null;
  return {
    ref,
    kind,
    label: label.slice(0, 80),
    // Price pins remember the market they were taken from; every other kind ignores it.
    stationId: kind === 'price' ? String(row.stationId || '').slice(0, 80) || null : null,
    priceAt: row.priceAt == null ? null : (Number.isFinite(Number(row.priceAt)) ? Number(row.priceAt) : null),
    createdAt: Math.max(0, finite(row.createdAt)),
  };
}

/** Save-file and hand-edited input -> clean pin list. Dedupes on ref; first writer wins. */
export function normalizeWatchlist(value) {
  const rows = Array.isArray(value) ? value : (value && Array.isArray(value.pins) ? value.pins : []);
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const pin = cleanPin(row);
    if (!pin || seen.has(pin.ref)) continue;
    seen.add(pin.ref);
    out.push(pin);
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

/** Live pin array. Lazily creates state.ui.watchlist — the same lazy-root pattern screenMemory uses. */
export function watchlistPins(state) {
  if (!state) return [];
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!Array.isArray(state.ui.watchlist)) state.ui.watchlist = [];
  return state.ui.watchlist;
}

export function isWatched(state, ref) {
  return watchlistPins(state).some((pin) => pin.ref === ref);
}

/**
 * Toggle one ref. Returns { pinned, reason } — 'full' when the cap is already reached, 'unpinnable'
 * for a ref the watch list does not track. Mutates only state.ui.watchlist; callers emit the
 * receipt and watch:changed.
 */
export function toggleWatchPin(state, ref, { label = '', stationId = null } = {}) {
  const kind = pinKindForRef(ref);
  if (!kind) return { pinned: false, reason: 'unpinnable' };
  const pins = watchlistPins(state);
  const index = pins.findIndex((pin) => pin.ref === ref);
  if (index >= 0) {
    pins.splice(index, 1);
    return { pinned: false, reason: 'removed' };
  }
  if (pins.length >= WATCHLIST_MAX) return { pinned: false, reason: 'full' };
  const pin = cleanPin({
    ref,
    kind,
    label: label || entityLabel(ref),
    stationId: kind === 'price' ? stationId : null,
    createdAt: finite(state && state.simTime),
  });
  if (!pin) return { pinned: false, reason: 'unpinnable' };
  if (kind === 'price' && pin.stationId) {
    pin.priceAt = marketPriceAt(state, pin.stationId, pin.ref) || null;
  }
  pins.push(pin);
  return { pinned: true, reason: 'added', pin };
}

// ── live readings ────────────────────────────────────────────────────────────────────────────

function marketPriceAt(state, stationId, ref) {
  const commodityId = ref.slice(ref.indexOf(':') + 1);
  const def = COMMODITY_BY_ID.get(commodityId);
  const entry = state && state.economy && state.economy.markets
    && stationId && state.economy.markets[stationId]
    && state.economy.markets[stationId][commodityId];
  if (!entry && !def) return null;
  return marketQuoteValue(entry || null, def || null, 'buy');
}

function fmtClock(secondsLeft) {
  const s = Math.max(0, Math.round(secondsLeft));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

/**
 * One watch line's live reading: { kind, label, detail, tone }.
 * tone follows the grammar roles — 'you' a gain, 'foe' a problem, 'calm' neutral.
 * detail is a WORD or short reading, never a second sentence.
 */
export function resolveWatchPin(state, pin) {
  const base = { ref: pin.ref, kind: pin.kind, label: pin.label, detail: '', tone: 'calm' };
  if (!state) return base;

  if (pin.kind === 'price') {
    // A pin taken docked watches that market; a pin taken in flight watches the base listing —
    // honest, and it starts moving the moment the docked market feed exists again.
    const price = pin.stationId
      ? marketPriceAt(state, pin.stationId, pin.ref)
      : Math.round(Number(COMMODITY_BY_ID.get(pin.ref.slice(pin.ref.indexOf(':') + 1))?.basePrice) || 0);
    if (!price) return { ...base, detail: 'no market feed' };
    const pinnedAt = Number(pin.priceAt);
    let delta = '';
    if (Number.isFinite(pinnedAt) && pinnedAt > 0 && price !== pinnedAt) {
      delta = price > pinnedAt ? ' ▲' : ' ▼';
    }
    return { ...base, detail: `${Math.round(price)} cr${delta}`, tone: delta === ' ▲' ? 'you' : delta ? 'foe' : 'calm' };
  }

  if (pin.kind === 'rival') {
    const id = pin.ref.slice(pin.ref.indexOf(':') + 1);
    const ace = aceById(id);
    const mem = state.aceMemory && state.aceMemory[id];
    if (!ace) return { ...base, detail: 'off the books' };
    if (mem && mem.status) return { ...base, detail: String(mem.status).replace(/_/g, ' '), tone: 'foe' };
    if (mem && Number(mem.kills) > 0) return { ...base, detail: `downed you ×${Number(mem.kills)}`, tone: 'foe' };
    if (mem && Number(mem.defeats) > 0) return { ...base, detail: `downed ×${Number(mem.defeats)}`, tone: 'you' };
    return { ...base, detail: 'no contact yet' };
  }

  if (pin.kind === 'deadline') {
    const rec = findContractRecord(state, pin.ref.slice(pin.ref.indexOf(':') + 1));
    if (!rec) return { ...base, detail: 'off the board' };
    if (!Number.isFinite(Number(rec.deadline_s))) return { ...base, detail: 'open contract' };
    const left = Number(rec.deadline_s) - finite(state.simTime);
    if (left <= 0) return { ...base, detail: 'expired', tone: 'foe' };
    return { ...base, detail: `${fmtClock(left)} left`, tone: left < 120 ? 'foe' : 'calm' };
  }

  if (pin.kind === 'standing') {
    const id = pin.ref.slice(pin.ref.indexOf(':') + 1);
    const rec = state.factions && state.factions[id];
    if (!rec) return { ...base, detail: 'no record' };
    const rep = Number(rec.rep) || 0;
    const word = String(rec.tier || (rep >= 0 ? 'Neutral' : 'Poor'));
    return { ...base, detail: word, tone: rec.aggro || rep < -30 ? 'foe' : rep > 30 ? 'you' : 'calm' };
  }

  return base;
}

/** The rendered list: resolved pins, capped at the watch max, in pin order. */
export function resolveWatchlist(state) {
  return watchlistPins(state).slice(0, WATCHLIST_MAX).map((pin) => resolveWatchPin(state, pin));
}

export function watchKindWord(kind) {
  return KIND_WORD[kind] || 'Watch';
}
