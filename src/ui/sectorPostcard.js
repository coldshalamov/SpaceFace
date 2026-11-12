// sectorPostcard.js — BP-11 packet A1 "Sector Postcard" (SURFACE — see design/revamp/detail/A_sector_station.md).
//
// On `sector:enter`, show a one-glance identity card: sector name + dominant faction + security
// tier + hazard glyph row + primary commodity + regional ecology/dominant zone + one rumor line.
// Every field is READ from shipped data or the regionalEcology applied readout —
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
import { getSectorWayOfLife } from '../data/sectorWayOfLife.js';
import { ALL_KILL_MACHINE_BY_ID } from '../data/environmentalMachinery.js';
import { openSurveyFix } from '../systems/surveyFix.js';
import { missionNextActionRow, trackedMission } from './sim/missionNextAction.js';

// dangerTier 0..5 → one-word security read (0 = safest). Pure display language.
export const SECURITY_TIER_LABELS = ['secure', 'patrolled', 'contested', 'dangerous', 'lawless', 'lethal'];

// Hazard type → glyph + one-word label (readable at a glance; full counterplay language is packet A7).
// ☢ carries \uFE0E so it renders as a monochrome text glyph matching the rest of the set instead of
// a color emoji on emoji-font platforms.
export const HAZARD_GLYPHS = {
  dense_asteroid: { glyph: '◆', label: 'dense rock' },
  nebula:         { glyph: '≋', label: 'nebula' },
  radiation:      { glyph: '☢\uFE0E', label: 'radiation' },
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

// CLOUD-02 — locality + next action.
// Station id → { name, sectorId }: the only provenance the postcard trusts. A headline counts
// as local when its own sectorId names this sector or its stationId resolves to a station that
// physically lives here — never inferred from the headline's prose.
const STATION_META_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    if (st && st.id && !STATION_META_BY_ID.has(st.id)) {
      STATION_META_BY_ID.set(st.id, { name: st.name || null, sectorId: sec.id });
    }
  }
}

function headlineSectorId(rec) {
  if (!rec || typeof rec !== 'object') return null;
  if (typeof rec.sectorId === 'string' && rec.sectorId) return rec.sectorId;
  const meta = rec.stationId != null && STATION_META_BY_ID.get(String(rec.stationId));
  return meta ? meta.sectorId : null;
}

/**
 * Freshest headline that provably belongs to this sector. The log is unshift-ordered (newest
 * commit first) and each record's `t` is stamped at commit time, so the first local record in
 * log order is the freshest; ties and malformed rows resolve to commit order, deterministically.
 * Records without verifiable provenance are skipped — missing provenance is not locality.
 */
function localRumor(log, sectorId) {
  for (const rec of log) {
    if (!rec || typeof rec.text !== 'string' || !rec.text) continue;
    if (headlineSectorId(rec) === sectorId) return rec.text;
  }
  return null;
}

// One service verb per berth kind. Order matters when a station offers several services: the
// desk that hands a pilot work outranks conveniences; fuel is the last thing worth saying.
const SERVICE_PRIORITY = [
  'missions', 'shipyard', 'refine', 'ore_buy', 'trade', 'repair',
  'module_craft', 'scan_tech', 'scan', 'black_market', 'toll', 'refuel',
];
const SERVICE_PHRASE = {
  missions: 'a contract desk', shipyard: 'a shipyard', refine: 'a refinery line',
  ore_buy: 'an ore buyer', trade: 'a market', repair: 'repair slips',
  module_craft: 'a module shop', scan_tech: 'a scan-tech bench', scan: 'a survey desk',
  black_market: 'a quiet market', toll: 'a toll gate', refuel: 'refuel pumps',
};

/**
 * The one next-action sentence the card may claim from already-known facts, in order:
 * a live contract whose destination is here, the player's own paid survey bearing on this
 * sector, or the most useful service a local berth publicly offers. Never names an
 * undiscovered position and never touches navigation state.
 */
function localNextAction(state, sectorId, sector) {
  const active = state && state.missions && Array.isArray(state.missions.active)
    ? state.missions.active.filter((m) => m && m.status === 'active') : [];
  if (active.length) {
    const tracked = trackedMission(state);
    const ordered = tracked ? [tracked, ...active.filter((m) => m !== tracked)] : active;
    for (const m of ordered) {
      let row = null;
      try { row = missionNextActionRow(state, m); } catch { row = null; }
      const dest = row && row.destination;
      if (!dest) continue;
      const stationMeta = dest.stationId != null ? STATION_META_BY_ID.get(dest.stationId) : null;
      if (dest.sectorId !== sectorId && (!stationMeta || stationMeta.sectorId !== sectorId)) continue;
      const title = row.title || 'Contract';
      const action = row.action || {};
      const stationName = (action.stationId != null && STATION_META_BY_ID.get(action.stationId) || stationMeta || {}).name;
      switch (action.kind) {
        case 'dock':
          return stationName ? `${title} — turn in at ${stationName}.` : `${title} — turn in here.`;
        case 'trade':
          return stationName ? `${title} — sell the leg at ${stationName}.` : `${title} — sell the leg here.`;
        case 'acquire':
          return `${title} — the hold still owes the contract load.`;
        case 'engage':
          return `${title} — your mark still flies here.`;
        case 'settle_clause':
          return `${title} — terms to settle before it pays.`;
        case 'report':
          return `${title} — the mark is gone; report in.`;
        case 'travel':
          return stationName ? `${title} — bound for ${stationName}.` : `${title} — bound for this sector.`;
        default:
          return `${title} — work still open here.`;
      }
    }
  }
  // A sold bearing is the player's own revealed mark — naming it exposes nothing new.
  if (openSurveyFix(state, sectorId)) return 'Your charted bearing still waits in this sector.';
  let best = null;
  for (const st of sector.stations || []) {
    if (!st || !st.name || st.closed === true || st.destroyed === true) continue;
    const services = Array.isArray(st.services) ? st.services : [];
    const svc = SERVICE_PRIORITY.find((s) => services.includes(s));
    if (!svc) continue;
    if (!best
      || SERVICE_PRIORITY.indexOf(svc) < SERVICE_PRIORITY.indexOf(best.svc)
      || (svc === best.svc && (SIZE_RANK[st.size] || 0) > (SIZE_RANK[best.st.size] || 0))) {
      best = { st, svc };
    }
  }
  return best ? `${best.st.name} keeps ${SERVICE_PHRASE[best.svc]}.` : null;
}

/** De-prefixed human fallback for an unknown sector id. */
function prettySectorName(sectorId) {
  return String(sectorId || 'unknown sector').replace(/^sector_/, '').replace(/_/g, ' ');
}

/**
 * buildPostcard(state, sectorId, ecologyReadout?) -> {name, faction, securityTier, hazards[],
 * primaryCommodity, ecology, dominantZone, rumor}
 *
 * PURE + deterministic over shipped data. `state` is read only for the live rumor line
 * (state.ui.marketNews.log — the marketNews rolling headline log). Unknown sector → bare name
 * card (all other fields null/empty), never throws.
 */
export function buildPostcard(state, sectorId, ecologyReadout = null) {
  const sector = SECTORS.find((s) => s && s.id === sectorId) || null;

  // Rumor line: the freshest headline that provably belongs to THIS sector (CLOUD-02). The
  // rolling log is global; a foreign incident is not local news and records without provenance
  // earn no place on the card.
  const log = state && state.ui && state.ui.marketNews && Array.isArray(state.ui.marketNews.log)
    ? state.ui.marketNews.log : null;
  const rumor = log ? localRumor(log, sectorId) : null;

  if (!sector) {
    // Degrade: bare name card — a sector we know nothing about still gets a name, silently.
    return {
      name: prettySectorName(sectorId), faction: null, securityTier: null,
      hazards: [], primaryCommodity: null, ecology: null, dominantZone: null,
      rumor: null, nextAction: null,
    };
  }

  // One next-action sentence, derived only from known-local facts. Card text, never voiced.
  const nextAction = localNextAction(state, sectorId, sector);

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

  const life = getSectorWayOfLife(sectorId);
  const ecology = ecologyReadout && ecologyReadout.sectorId === sectorId
    && typeof ecologyReadout.familyLabel === 'string' && ecologyReadout.familyLabel.trim()
    ? {
      familyId: ecologyReadout.familyId || null,
      familyLabel: ecologyReadout.familyLabel.trim(),
      unresolvedCauses: Math.max(0, Math.floor(Number(
        ecologyReadout.encounters && ecologyReadout.encounters.unresolvedCauses,
      ) || 0)),
    }
    : null;

  return {
    name: sector.name || prettySectorName(sectorId),
    faction: meta ? meta.name : null,
    securityTier,
    hazards,
    primaryCommodity,
    ecology,
    dominantZone,
    rumor,
    nextAction,
    wayOfLife: life && life.sentence ? life.sentence : null,
    signatureToy: life && life.signatureToy ? life.signatureToy : null,
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
    this._latestEcology = null;
    this._onEcology = (payload) => {
      const readout = payload && payload.readout || payload;
      if (readout && readout.sectorId) this._latestEcology = readout;
    };
    if (this._bus && this._bus.on) {
      this._bus.on('regionalEcology:applied', this._onEcology);
      this._bus.on('regionalEcology:changed', this._onEcology);
    }
    this._cardEl = null;
    this._dismiss = null;
    this._hideTimer = null;
  },

  _handleEnter(p) {
    const state = this._state;
    if (!state || !p || !p.sectorId) return;
    const ecology = this._latestEcology && this._latestEcology.sectorId === p.sectorId
      ? this._latestEcology : null;
    const card = buildPostcard(state, p.sectorId, ecology);

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
    // Non-diegetic card, top-center, pointer-events none so it can NEVER block flight input. The look
    // (flight-safe wash, lit rule, faces) is styles/kit.css `#sf-sector-postcard` — no backdrop blur in flight.
    el.className = 'sf-postcard';

    // Six fields max, ONE line per field (packet failureMode: lore dump).
    const line = (text, cls) => {
      if (!text) return;
      const d = document.createElement('div');
      d.className = cls || 'sf-postcard__line';
      d.textContent = text;
      el.appendChild(d);
    };
    line(card.name, 'sf-postcard__name');
    line(card.wayOfLife, 'sf-postcard__way');
    if (card.signatureToy && card.signatureToy !== 'explicitly none') {
      // The way-of-life row carries the machine's stable id; the card shows its mouth name.
      const toy = ALL_KILL_MACHINE_BY_ID[card.signatureToy];
      line((toy && toy.mouth && toy.mouth.name) || card.signatureToy.replace(/_/g, ' '), 'sf-postcard__dim');
    }
    line([card.faction, card.securityTier && card.securityTier.toUpperCase()].filter(Boolean).join(' · '), 'sf-postcard__tag');
    if (card.hazards && card.hazards.length) {
      line(card.hazards.map((h) => `${h.glyph} ${h.label}`).join('   '), 'sf-postcard__dim');
    }
    line(card.primaryCommodity && `trades: ${card.primaryCommodity}`, 'sf-postcard__dim');
    const placeIdentity = [
      card.ecology && card.ecology.familyLabel,
      card.dominantZone && card.dominantZone.name,
      card.ecology && card.ecology.unresolvedCauses > 0
        ? `${card.ecology.unresolvedCauses} active consequence${card.ecology.unresolvedCauses === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean).join(' · ');
    line(placeIdentity, 'sf-postcard__dim');
    line(card.nextAction, 'sf-postcard__dim');
    line(card.rumor && `“${card.rumor}”`, 'sf-postcard__rumor');

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
    if (this._bus && this._bus.off) {
      if (this._onEnter) this._bus.off('sector:enter', this._onEnter);
      if (this._onEcology) {
        this._bus.off('regionalEcology:applied', this._onEcology);
        this._bus.off('regionalEcology:changed', this._onEcology);
      }
    }
    this._onEnter = null;
    this._onEcology = null;
    this._latestEcology = null;
    this._hide();
  },
};

export default sectorPostcard;
