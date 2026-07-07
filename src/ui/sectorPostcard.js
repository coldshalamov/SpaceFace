// sectorPostcard.js — BP-11 packet A1 "Sector Postcard" (SURFACE — see design/revamp/detail/A_sector_station.md).
//
// On `sector:enter`, show a one-glance identity card: sector name + dominant faction + security
// tier + hazard glyph row + primary commodity + dominant zone + one rumor line. Every field is
// READ from shipped data (sectors.js, sectorZones.js, factions.js, the live marketNews log) —
// this module surfaces, it never simulates. Doctrine filter: the player can SEE the sector's
// identity the moment they arrive.
//
// Split of concerns (copies the marketNews.js shape):
//   • buildPostcard(state, sectorId) — PURE. No DOM, no bus, no clock, no Math.random. Same
//     inputs → same card. Degrades to a bare name card for an unknown sector or a sector with
//     no zones/stations/hazards (never throws).
//   • sectorPostcard (registry SYSTEMS-only entry, NOT UPDATE_ORDER) — subscribes to
//     `sector:enter`, stores the card on state.ui.sectorPostcard (additive UI state, NOT in the
//     sim snapshot hash), routes ONLY the rumor line through ctx.helpers.voice.say({channel:'news'})
//     (one line, only if a live headline exists — the other fields are silent card text), and
//     mounts a `typeof document`-guarded DOM card that dismisses on any input and never blocks
//     flight (pointer-events: none).
//
// Budget (packet contract): spawn:none · voice:'news' one line max per arrival · draw:+1 DOM card.
// noTouch honored: world.js / uiRoot.js / bindings.js / sectors.js / sectorZones.js are imported
// read-only, never edited. HUD rule: clean non-diegetic card — no cockpit/helmet motifs.

import { SECTORS, dangerTier } from '../data/sectors.js';
import { zonesForSector } from '../data/sectorZones.js';
import { FACTION_META } from '../data/factions.js';

// dangerTier 0..5 → one-word security read (0 = safest). Pure display language.
export const SECURITY_TIER_LABELS = ['secure', 'patrolled', 'contested', 'dangerous', 'lawless', 'lethal'];

// Hazard type → glyph + one-word label (readable at a glance; full counterplay language is packet A7).
export const HAZARD_GLYPHS = {
  dense_asteroid: { glyph: '◆', label: 'dense rock' },
  nebula:         { glyph: '≋', label: 'nebula' },
  radiation:      { glyph: '☢', label: 'radiation' },
  debris:         { glyph: '✕', label: 'debris' },
};

// Station type → the commodity story the sector leads with ("what does this place sell?").
const COMMODITY_BY_STATION_TYPE = {
  trade_hub:   'general goods',
  refinery:    'refined alloys',
  mining:      'raw ore',
  fab:         'ship modules',
  military:    'munitions',
  blackmarket: 'contraband',
  research:    'survey data',
};

const SIZE_RANK = { L: 3, M: 2, S: 1 };

/** De-prefixed human fallback for an unknown sector id. */
function prettySectorName(sectorId) {
  return String(sectorId || 'unknown sector').replace(/^sector_/, '').replace(/_/g, ' ');
}

/**
 * buildPostcard(state, sectorId) -> {name, faction, securityTier, hazards[], primaryCommodity,
 * dominantZone, rumor}
 *
 * PURE + deterministic over shipped data. `state` is read only for the live rumor line
 * (state.ui.marketNews.log — the marketNews rolling headline log). Unknown sector → bare name
 * card (all other fields null/empty), never throws.
 */
export function buildPostcard(state, sectorId) {
  const sector = SECTORS.find((s) => s && s.id === sectorId) || null;

  // Rumor line: the freshest live marketNews headline, if any (shipped state, read-only).
  const log = state && state.ui && state.ui.marketNews && Array.isArray(state.ui.marketNews.log)
    ? state.ui.marketNews.log : null;
  const rumor = (log && log.length && log[0] && typeof log[0].text === 'string' && log[0].text) || null;

  if (!sector) {
    // Degrade: bare name card — a sector we know nothing about still gets a name, silently.
    return {
      name: prettySectorName(sectorId), faction: null, securityTier: null,
      hazards: [], primaryCommodity: null, dominantZone: null, rumor: null,
    };
  }

  const meta = FACTION_META.find((f) => f && f.id === sector.factionId) || null;
  const tier = dangerTier(sector);
  const securityTier = SECURITY_TIER_LABELS[tier] || SECURITY_TIER_LABELS[SECURITY_TIER_LABELS.length - 1];

  // Hazard glyph row: one entry per distinct hazard TYPE present (order = first appearance).
  const hazards = [];
  const seenHazard = new Set();
  for (const hz of (sector.hazards || [])) {
    const type = hz && hz.type;
    if (!type || seenHazard.has(type)) continue;
    seenHazard.add(type);
    const g = HAZARD_GLYPHS[type] || { glyph: '▪', label: String(type).replace(/_/g, ' ') };
    hazards.push({ type, glyph: g.glyph, label: g.label });
  }

  // Primary commodity: read from the sector's flagship station (largest size wins; ties keep
  // authored order — deterministic).
  let flagship = null;
  for (const st of (sector.stations || [])) {
    if (!st) continue;
    if (!flagship || (SIZE_RANK[st.size] || 0) > (SIZE_RANK[flagship.size] || 0)) flagship = st;
  }
  const primaryCommodity = (flagship && COMMODITY_BY_STATION_TYPE[flagship.type]) || null;

  // Dominant zone: the widest named zone (radius = footprint = dominance; ties keep authored order).
  let dominant = null;
  for (const zone of zonesForSector(sectorId)) {
    if (!zone) continue;
    if (!dominant || (zone.radius || 0) > (dominant.radius || 0)) dominant = zone;
  }
  const dominantZone = dominant ? { id: dominant.id, name: dominant.name, type: dominant.type } : null;

  return {
    name: sector.name || prettySectorName(sectorId),
    faction: meta ? meta.name : null,
    securityTier,
    hazards,
    primaryCommodity,
    dominantZone,
    rumor,
  };
}

// ── registry SYSTEMS-only entry (no update; event-driven, cosmetic + one news line) ────────────

const CARD_TTL_MS = 12000; // cosmetic auto-fade; any input dismisses sooner

export const sectorPostcard = {
  name: 'sectorPostcard',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._onEnter = (p) => this._handleEnter(p);
    if (this._bus && this._bus.on) this._bus.on('sector:enter', this._onEnter);
    this._cardEl = null;
    this._dismiss = null;
    this._hideTimer = null;
  },

  _handleEnter(p) {
    const state = this._state;
    if (!state || !p || !p.sectorId) return;
    const card = buildPostcard(state, p.sectorId);

    // Additive UI state — readable by HUD/tests; NOT part of the sim snapshot hash (state.ui).
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.sectorPostcard = { sectorId: p.sectorId, card, t: state.simTime || 0 };

    // Voice budget: ONLY the rumor line speaks, on the 'news' channel, at most once per arrival.
    // All other fields stay silent card text (packet failureMode: voicing every field).
    if (card.rumor) {
      const helpers = (this._ctx && this._ctx.helpers) || {};
      if (helpers.voice && typeof helpers.voice.say === 'function') {
        helpers.voice.say({ channel: 'news', text: card.rumor, kind: 'rumor' });
      }
    }

    this._render(card);
  },

  // ── DOM card (cosmetic; fully guarded; never blocks flight) ─────────────────────────────────
  _render(card) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('hud') || document.body;
    if (!host) return;

    this._hide(); // replace any previous card

    const el = document.createElement('div');
    el.id = 'sf-sector-postcard';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Sector arrival');
    // Non-diegetic card, top-center, pointer-events none so it can NEVER block flight input.
    el.style.cssText = [
      'position:absolute', 'top:9%', 'left:50%', 'transform:translateX(-50%)',
      'padding:10px 18px', 'background:rgba(8,14,26,0.82)', 'border:1px solid rgba(110,150,210,0.35)',
      'border-radius:6px', 'color:#cfe2ff', 'font:13px/1.45 system-ui,sans-serif',
      'text-align:center', 'pointer-events:none', 'z-index:40', 'max-width:46ch',
    ].join(';');

    // Six fields max, ONE line per field (packet failureMode: lore dump).
    const line = (text, style) => {
      if (!text) return;
      const d = document.createElement('div');
      if (style) d.style.cssText = style;
      d.textContent = text;
      el.appendChild(d);
    };
    line(card.name, 'font-size:17px;font-weight:600;letter-spacing:0.06em');
    line([card.faction, card.securityTier && card.securityTier.toUpperCase()].filter(Boolean).join(' · '));
    if (card.hazards && card.hazards.length) {
      line(card.hazards.map((h) => `${h.glyph} ${h.label}`).join('   '), 'opacity:0.9');
    }
    line(card.primaryCommodity && `trades: ${card.primaryCommodity}`, 'opacity:0.85');
    line(card.dominantZone && card.dominantZone.name, 'opacity:0.85');
    line(card.rumor && `“${card.rumor}”`, 'opacity:0.75;font-style:italic');

    host.appendChild(el);
    this._cardEl = el;

    // Dismiss on ANY input; auto-fade as cosmetic hygiene.
    const dismiss = () => this._hide();
    this._dismiss = dismiss;
    document.addEventListener('keydown', dismiss, { once: true });
    document.addEventListener('pointerdown', dismiss, { once: true });
    if (typeof window !== 'undefined') this._hideTimer = window.setTimeout(dismiss, CARD_TTL_MS);
  },

  _hide() {
    if (typeof document !== 'undefined' && this._dismiss) {
      document.removeEventListener('keydown', this._dismiss);
      document.removeEventListener('pointerdown', this._dismiss);
    }
    this._dismiss = null;
    if (this._hideTimer != null && typeof window !== 'undefined') window.clearTimeout(this._hideTimer);
    this._hideTimer = null;
    if (this._cardEl && this._cardEl.parentNode) this._cardEl.parentNode.removeChild(this._cardEl);
    this._cardEl = null;
  },

  destroy() {
    if (this._bus && this._bus.off && this._onEnter) this._bus.off('sector:enter', this._onEnter);
    this._onEnter = null;
    this._hide();
  },
};

export default sectorPostcard;
