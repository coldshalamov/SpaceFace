// causeLedger.js — BP-12 packet CAUSE_LEDGER_TOOLTIP ("why prices changed").
//
// Hover a moving price → the world tells you WHO moved it. The doctrine's own gate rule made
// perceptible: "no economy change without cause" (design/revamp/DETAIL_DOCTRINE.md §1). Every line
// this module renders traces to an ENUMERATED dangerModel.classifyDrivers tag carried on the live
// sector signal — never invented text. The deep field already computes the cause; this is a read
// layer only.
//
// Split of concerns (copies the marketNews/sectorPostcard shape):
//   • driverPhrase(signal, sectorName) — PURE. Maps signal.driver.{danger,pricePressure,influence}
//     + trend signs + dominantFactionId → one prose line per axis (null for a tag with no entry in
//     the causePhrases bank — unknown tags render NOTHING, the anti-free-text failure mode).
//   • causeFor(state, sectorId) — PURE read. Pulls the LIVE signal via sectorSim.sectorSignalFor
//     (the field-preferring public contract — never the legacy drift mirror) and phrases it.
//     Deterministic given a fixed field digest.
//   • causeLedger (registry SYSTEMS-only entry, NOT UPDATE_ORDER) — keeps state.ui.causeLedger
//     fresh on sector:enter / dock:docked and mounts a `typeof document`-guarded hover tooltip
//     over the market screen's commodity rows ([data-cmdty]). Tooltip text only — it NEVER speaks
//     (voice:none per the packet budget; voiceArbiter is not touched).
//
// noTouch honored: dangerModel.js / sectorSim.js / economy.js / marketNews.js / uiRoot.js are
// imported read-only or not at all. Budget: spawn:none · voice:none · draw:+1 guarded tooltip div.

import { CAUSE_PHRASES, CAUSE_AXES, DIRECTION_WORDS, TREND_EPSILON } from '../data/causePhrases.js';
import { sectorSignalFor } from '../systems/sectorSim.js';
import { SECTORS } from '../data/sectors.js';
import { FACTION_META } from '../data/factions.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const STATION_TO_SECTOR = new Map();
for (const sec of SECTORS) for (const st of (sec.stations || [])) STATION_TO_SECTOR.set(st.id, sec.id);

function factionShort(factionId) {
  const f = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (f && (f.short || f.name)) || 'An unknown power';
}

function directionWord(axis, trendValue) {
  const words = DIRECTION_WORDS[axis] || DIRECTION_WORDS.pricePressure;
  const t = Number(trendValue) || 0;
  if (t > TREND_EPSILON) return words.up;
  if (t < -TREND_EPSILON) return words.down;
  return words.flat;
}

function fill(template, tokens) {
  return String(template)
    .replace(/\{dir\}/g, tokens.dir)
    .replace(/\{faction\}/g, tokens.faction)
    .replace(/\{sector\}/g, tokens.sector)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * driverPhrase(signal, sectorName) -> { danger, pricePressure, influence } prose lines.
 *
 * PURE + deterministic. `signal` is a sectorSignalFor packet (driver + trend + dominantFactionId).
 * Each axis maps its enumerated driver tag through the causePhrases bank; a tag with no entry
 * yields null for that axis (NEVER invented text — the packet's named failure mode). A missing
 * signal yields all-null.
 */
export function driverPhrase(signal, sectorName) {
  const out = { danger: null, pricePressure: null, influence: null };
  if (!signal || !signal.driver) return out;
  const trend = signal.trend || {};
  const tokens = {
    faction: factionShort(signal.dominantFactionId),
    sector: sectorName || String(signal.sectorId || 'this sector').replace(/^sector_/, '').replace(/_/g, ' '),
    dir: '',
  };
  for (const axis of CAUSE_AXES) {
    const tag = signal.driver[axis];
    const template = tag && CAUSE_PHRASES[axis] && CAUSE_PHRASES[axis][tag];
    if (!template) continue; // enumerated tags only — unknown tag renders nothing
    tokens.dir = directionWord(axis, trend[axis]);
    out[axis] = fill(template, tokens);
  }
  return out;
}

/**
 * causeFor(state, sectorId) -> stable current field snapshot + 1–3 sanctioned cause receipts
 * or null for an unknown sector.
 *
 * The ONE sanctioned read: routes through sectorSim.sectorSignalFor, which prefers the live field
 * node and only falls back to structural defaults — never the legacy drift mirror. Deterministic
 * given a fixed field digest.
 */
export function causeFor(state, sectorId) {
  const signal = sectorSignalFor(state, sectorId);
  if (!signal) return null;
  const base = SECTOR_BY_ID.get(sectorId);
  const sectorName = (base && base.name) || String(sectorId).replace(/^sector_/, '').replace(/_/g, ' ');
  const lines = driverPhrase(signal, sectorName);
  return {
    sectorId,
    sectorName,
    // These values come from the same sanctioned read as the prose. Keeping them together prevents
    // map/tooltip callers from sampling another mirror and presenting a contradictory snapshot.
    danger: Number(signal.danger) || 0,
    pricePressure: Number(signal.pricePressure) || 0,
    influence: { ...(signal.influence || {}) },
    ownerId: signal.ownerId || null,
    driver: { ...signal.driver },
    trend: { ...signal.trend },
    dominantFactionId: signal.dominantFactionId || null,
    dominantInfluence: Number(signal.dominantInfluence) || 0,
    contestMargin: Number(signal.contestMargin) || 0,
    lines,
    receipts: CAUSE_AXES
      .map((axis) => lines[axis] ? { axis, line: lines[axis] } : null)
      .filter(Boolean),
  };
}

// ── registry SYSTEMS-only entry (event-driven; guarded tooltip; zero voice) ─────────────────────

const TOOLTIP_ID = 'sf-cause-ledger-tip';

export const causeLedger = {
  name: 'causeLedger',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._tipEl = null;
    this._onEnter = (p) => this._refresh(p && p.sectorId);
    this._onDocked = (p) => this._refresh(p && p.stationId ? STATION_TO_SECTOR.get(p.stationId) : null);
    if (this._bus && this._bus.on) {
      this._bus.on('sector:enter', this._onEnter);
      this._bus.on('dock:docked', this._onDocked);
    }
    this._mountTooltip();
  },

  _refresh(sectorId) {
    const state = this._state;
    if (!state) return;
    const id = sectorId || (state.world && state.world.currentSectorId);
    if (!id) return;
    const cause = causeFor(state, id);
    if (!cause) return;
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    // Additive UI state (NOT in the sim snapshot hash) — readable by dock screens and tests.
    state.ui.causeLedger = { ...cause, t: state.simTime || 0 };
  },

  // ── hover tooltip over market commodity rows (cosmetic; fully guarded; read-only) ────────────
  _mountTooltip() {
    if (typeof document === 'undefined') return;
    this._over = (ev) => {
      const row = ev.target && ev.target.closest && ev.target.closest('[data-cmdty], .st-row');
      if (!row || !row.closest || !row.closest('.st-market')) { this._hideTip(); return; }
      const model = this._state && this._state.ui && this._state.ui.causeLedger;
      const lines = model && model.lines;
      const text = lines && [lines.pricePressure, lines.danger].filter(Boolean).join('\n');
      if (!text) { this._hideTip(); return; }
      this._showTip(text, ev.clientX, ev.clientY);
    };
    this._out = (ev) => {
      const row = ev.target && ev.target.closest && ev.target.closest('[data-cmdty], .st-row');
      if (row) this._hideTip();
    };
    document.addEventListener('mouseover', this._over, true);
    document.addEventListener('mouseout', this._out, true);
  },

  _showTip(text, x, y) {
    if (typeof document === 'undefined') return;
    let el = this._tipEl;
    if (!el || !el.isConnected) {
      el = document.createElement('div');
      el.id = TOOLTIP_ID;
      el.setAttribute('role', 'tooltip');
      // Non-diegetic, never blocks input (pointer-events none), never speaks.
      el.style.cssText = [
        'position:fixed', 'max-width:42ch', 'padding:8px 12px', 'white-space:pre-line',
        'background:rgba(8,14,26,0.92)', 'border:1px solid rgba(110,150,210,0.4)',
        'border-radius:5px', 'color:#cfe2ff', 'font:12px/1.45 system-ui,sans-serif',
        'pointer-events:none', 'z-index:90',
      ].join(';');
      (document.body || document.documentElement).appendChild(el);
      this._tipEl = el;
    }
    el.textContent = text;
    const pad = 14;
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    el.style.left = Math.min(x + pad, vw - 340) + 'px';
    el.style.top = (y + pad) + 'px';
    el.style.display = 'block';
  },

  _hideTip() {
    if (this._tipEl) this._tipEl.style.display = 'none';
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onEnter) this._bus.off('sector:enter', this._onEnter);
      if (this._onDocked) this._bus.off('dock:docked', this._onDocked);
    }
    this._onEnter = null;
    this._onDocked = null;
    if (typeof document !== 'undefined') {
      if (this._over) document.removeEventListener('mouseover', this._over, true);
      if (this._out) document.removeEventListener('mouseout', this._out, true);
    }
    this._over = null;
    this._out = null;
    if (this._tipEl && this._tipEl.parentNode) this._tipEl.parentNode.removeChild(this._tipEl);
    this._tipEl = null;
  },
};

export default causeLedger;
