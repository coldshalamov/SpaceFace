// entityResolver.js — J5 "Everything is a link" (CANONICAL_BUILD_MAP §11.12).
//
// ONE resolver mapping `type:id` to a dossier, for every noun the game renders: faction, commodity,
// station, hull, module, captain, sector, contract. This is what makes twelve menus stop being
// twelve menus — rather than a screen per system, every MENTION of a thing becomes a door into it.
//
// It is deliberately Phase 0 rather than a feature: the same resolver backs the watch list and
// global find (ADDITIONS.md §3, §7), and retrofitting `data-entity` tags into finished screens
// costs several times more than emitting them while building.
//
// THE DISCIPLINE, inherited from causeLedger.js: an unknown id resolves to NULL and the caller
// renders NOTHING. No placeholder dossier, no "Unknown faction", no invented prose. Every line
// below traces to a real field on a real record — if the data does not say it, the dossier does not
// claim it. `[data-why]` is the tier-2 sibling of this tier-3 mechanism and keeps the same rule.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): reads `state` and the data modules, never mutates, never
// imports Three.js. `route` names where the player can go to ACT on the entity — it is a request,
// not a navigation; entityLinks.js is what honours it.

import { FACTION_META } from '../data/factions.js';
import { FACTION_DOCTRINES } from '../data/factionDoctrines.js';
import { COMMODITIES, COMMODITY_FLAVOR } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';
import { aceById } from '../data/namedAces.js';

export const ENTITY_TYPES = Object.freeze([
  'faction', 'commodity', 'station', 'hull', 'module', 'captain', 'sector', 'contract',
]);

// ── indexes (built once; the data modules are frozen catalogues) ───────────────────────────────
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const STATION_BY_ID = new Map();
const SECTOR_OF_STATION = new Map();
for (const sec of SECTORS) {
  for (const st of (sec.stations || [])) {
    STATION_BY_ID.set(st.id, st);
    SECTOR_OF_STATION.set(st.id, sec.id);
  }
}

/** `"faction:faction_scn"` -> `{ type, id }`, or null for anything malformed or off-vocabulary. */
export function parseEntityRef(ref) {
  if (typeof ref !== 'string') return null;
  const cut = ref.indexOf(':');
  if (cut < 1) return null;
  const type = ref.slice(0, cut);
  const id = ref.slice(cut + 1);
  if (!id || !ENTITY_TYPES.includes(type)) return null;
  return { type, id };
}

/** Does this ref name something real? Cheap enough to call while TAGGING, so screens can decline to
 *  emit a link that would resolve to nothing rather than rendering a door into an empty room. */
export function entityExists(ref) {
  const parsed = parseEntityRef(ref);
  if (!parsed) return false;
  switch (parsed.type) {
    case 'faction': return FACTION_BY_ID.has(parsed.id);
    case 'commodity': return COMMODITY_BY_ID.has(parsed.id);
    case 'station': return STATION_BY_ID.has(parsed.id);
    case 'hull': return SHIP_BY_ID.has(parsed.id);
    case 'module': return MODULE_BY_ID.has(parsed.id);
    case 'sector': return SECTOR_BY_ID.has(parsed.id);
    case 'captain': return !!aceById(parsed.id);
    case 'contract': return true;   // contracts are live records; existence is a state question
    default: return false;
  }
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Attribute string for an HTML tag, or '' if the ref would resolve to nothing.
 *  An entity link must read as one by underline — never by colour alone (grammar §4). */
export function entityAttr(ref) {
  if (!entityExists(ref)) return '';
  return ` class="sf-entity-link" role="link" tabindex="0" data-entity="${escapeAttr(ref)}"`;
}

/** Wrap already-escaped label text in a link, or return the label unchanged when the ref is unknown. */
export function entitySpanHtml(ref, escapedLabel) {
  if (!entityExists(ref)) return escapedLabel;
  return `<span class="sf-entity-link" role="link" tabindex="0" data-entity="${escapeAttr(ref)}">${escapedLabel}</span>`;
}

/** Stamp an existing DOM node as an entity door. Unknown refs leave the node alone. */
export function decorateEntityNode(node, ref) {
  if (!node || !entityExists(ref)) return node;
  node.classList.add('sf-entity-link');
  node.setAttribute('role', 'link');
  node.setAttribute('tabindex', '0');
  node.setAttribute('data-entity', ref);
  return node;
}

/** Display label without building a whole dossier (link text, watch-list rows, find results). */
export function entityLabel(ref) {
  const parsed = parseEntityRef(ref);
  if (!parsed) return null;
  const { type, id } = parsed;
  switch (type) {
    case 'faction': { const f = FACTION_BY_ID.get(id); return f ? f.name : null; }
    case 'commodity': { const c = COMMODITY_BY_ID.get(id); return c ? c.name : null; }
    case 'station': { const s = STATION_BY_ID.get(id); return s ? s.name : null; }
    case 'hull': { const s = SHIP_BY_ID.get(id); return s ? s.name : null; }
    case 'module': { const m = MODULE_BY_ID.get(id); return m ? m.name : null; }
    case 'sector': { const s = SECTOR_BY_ID.get(id); return s ? s.name : null; }
    case 'captain': { const a = aceById(id); return a ? a.name : null; }
    default: return null;
  }
}

// ── shared readers ─────────────────────────────────────────────────────────────────────────────
function factionRecord(state, factionId) {
  return (state && state.factions && state.factions[factionId]) || null;
}
function factionLabel(factionId) {
  const f = factionId ? FACTION_BY_ID.get(factionId) : null;
  return f ? (f.short || f.name) : null;
}
function creditText(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US') + ' cr';
}
/** Standing as a WORD plus its tone. Never a bare number — the grammar's "verbs, not stats" rule. */
function standingFact(state, factionId) {
  const rec = factionRecord(state, factionId);
  if (!rec) return null;
  const rep = Number(rec.rep) || 0;
  const tone = rec.aggro ? 'foe' : rep > 30 ? 'you' : rep < -30 ? 'foe' : 'calm';
  return { k: 'Your standing', v: String(rec.tier || (rep >= 0 ? 'Neutral' : 'Poor')), tone };
}

// ── per-type dossiers ──────────────────────────────────────────────────────────────────────────
// Each returns { kicker, lines[], facts[], links[], route } or null. Everything here reads a field
// that exists; nothing is composed by sentence concatenation (grammar §12 item 11).

function factionDossier(state, id) {
  const f = FACTION_BY_ID.get(id);
  if (!f) return null;
  const rec = factionRecord(state, id);
  const facts = [];
  const standing = standingFact(state, id);
  if (standing) facts.push(standing);
  if (rec && rec.aggro) facts.push({ k: 'Docking', v: 'Refused — attacks on sight', tone: 'foe' });
  else if (rec && Number(rec.rep) < -30) facts.push({ k: 'Docking', v: 'Restricted', tone: 'foe' });
  if (rec && Number(rec.rep) <= -30 && Number(rec.rep) > -400) {
    const cost = Math.round((Math.abs(Number(rec.rep)) - 29) * 8 * (1 + 0.5 * (rec.bribesPaid > 0 ? 1 : 0)));
    facts.push({ k: 'Bribe to clear', v: creditText(cost), tone: 'goal', num: true });
  }
  facts.push({ k: 'Temperament', v: String(f.personality || 'unstated'), tone: 'calm' });

  const lines = [];
  if (Array.isArray(f.controls) && f.controls.length) lines.push({ label: 'Controls', text: f.controls.join(' · ') });
  const doctrine = FACTION_DOCTRINES && FACTION_DOCTRINES[id];
  if (doctrine && doctrine.id) lines.push({ label: 'Doctrine', text: String(doctrine.id).replace(/_/g, ' ') });

  // Relations are the reason a rep hit spreads to somebody you have never met (J6's spillover).
  // Carrying contraband THIS faction outlaws is the single most actionable fact about them, and it
  // was absent. Surfaced as a fact, not prose — it changes what you load into the hold.
  const illegal = Array.isArray(f.illegalCommodities) ? f.illegalCommodities : [];
  if (illegal.length) {
    const names = illegal.map((id) => (COMMODITY_BY_ID.get(id) || {}).name).filter(Boolean);
    if (names.length) lines.push({ label: 'Will stop you for', text: names.join(' · '), tone: 'foe' });
  }

  // Relations. Rendered ONLY as links below, never also as prose: the first version printed the
  // same rivals twice in one dossier, once as short names and once as full ones (grammar §8).
  const rel = f.relations || {};
  const allies = Object.keys(rel).filter((k) => rel[k] >= 0.3 && FACTION_BY_ID.has(k));
  const rivals = Object.keys(rel).filter((k) => rel[k] <= -0.3 && FACTION_BY_ID.has(k));

  const links = [];
  for (const secId of (f.homeSectors || [])) {
    const label = entityLabel('sector:' + secId);
    if (label) links.push({ ref: 'sector:' + secId, label });
  }
  for (const k of [...allies, ...rivals]) {
    links.push({ ref: 'faction:' + k, label: FACTION_BY_ID.get(k).name });
  }
  return {
    kicker: 'Faction' + (f.fleetClass ? ' · ' + String(f.fleetClass).replace(/_/g, ' ') : ''),
    facts, lines, links,
    route: (f.homeSectors && f.homeSectors[0]) ? { screen: 'chart', focus: 'sector:' + f.homeSectors[0] } : null,
  };
}

function commodityDossier(state, id) {
  const c = COMMODITY_BY_ID.get(id);
  if (!c) return null;
  const facts = [
    { k: 'Base price', v: creditText(c.basePrice), tone: 'calm', num: true },
    { k: 'Legality', v: String(c.legality || 'legal'), tone: c.legality === 'contraband' ? 'foe' : c.legality === 'restricted' ? 'goal' : 'calm' },
    { k: 'Hold cost', v: `${c.volPerU} vol · ${c.massPerU} mass per unit`, tone: 'calm', num: true },
  ];
  const lines = [];
  const flavor = COMMODITY_FLAVOR && COMMODITY_FLAVOR[id];
  if (flavor && flavor.desc) lines.push({ label: 'What it is', text: String(flavor.desc) });
  if (flavor && flavor.lore) lines.push({ label: 'Who moves it', text: String(flavor.lore) });
  if (Array.isArray(c.producedBy) && c.producedBy.length) {
    lines.push({ label: 'Made at', text: c.producedBy.map((r) => String(r).replace(/_/g, ' ')).join(' · ') });
  }
  if (Array.isArray(c.consumedBy) && c.consumedBy.length) {
    lines.push({ label: 'Wanted at', text: c.consumedBy.map((r) => String(r).replace(/_/g, ' ')).join(' · ') });
  }
  return {
    kicker: 'Commodity · ' + String(c.category || 'goods'),
    facts, lines, links: [],
    route: { screen: 'chart', focus: 'commodity:' + id },
  };
}

function stationDossier(state, id) {
  const st = STATION_BY_ID.get(id);
  if (!st) return null;
  const sectorId = SECTOR_OF_STATION.get(id);
  const facts = [
    { k: 'Type', v: String(st.type || '').replace(/_/g, ' '), tone: 'calm' },
  ];
  const owner = factionLabel(st.factionId);
  if (owner) facts.push({ k: 'Held by', v: owner, tone: 'calm' });
  const standing = standingFact(state, st.factionId);
  if (standing) facts.push(standing);

  const lines = [];
  if (st.chartNote) lines.push({ label: 'On the chart', text: String(st.chartNote) });
  if (Array.isArray(st.services) && st.services.length) {
    lines.push({ label: 'Services', text: st.services.join(' · ') });
  }
  const links = [];
  if (st.factionId && FACTION_BY_ID.has(st.factionId)) links.push({ ref: 'faction:' + st.factionId, label: FACTION_BY_ID.get(st.factionId).name });
  if (sectorId) { const l = entityLabel('sector:' + sectorId); if (l) links.push({ ref: 'sector:' + sectorId, label: l }); }
  return {
    kicker: 'Station' + (st.size ? ' · size ' + st.size : ''),
    facts, lines, links,
    route: sectorId ? { screen: 'chart', focus: 'station:' + id } : null,
  };
}

function sectorDossier(state, id) {
  const sec = SECTOR_BY_ID.get(id);
  if (!sec) return null;
  const facts = [];
  if (sec.tier != null) facts.push({ k: 'Tier', v: String(sec.tier), tone: 'calm' });
  if (sec.security != null) {
    const s = Number(sec.security);
    facts.push({ k: 'Security', v: s >= 0.66 ? 'Patrolled' : s >= 0.33 ? 'Thin' : 'None', tone: s < 0.33 ? 'foe' : 'calm' });
  }
  const owner = factionLabel(sec.factionId);
  if (owner) facts.push({ k: 'Held by', v: owner, tone: 'calm' });

  const lines = [];
  if (Array.isArray(sec.hazards) && sec.hazards.length) {
    lines.push({ label: 'Hazards', text: sec.hazards.map((h) => String(h.type || h).replace(/_/g, ' ')).join(' · '), tone: 'foe' });
  }
  // NOT a 'Docks' prose line: these same stations already appear as links below, and printing a
  // noun as inert text 40px above the same noun as a door teaches the player that links are
  // arbitrary (grammar §8 — one vocabulary, learned once).
  if (sec.charted === false) {
    lines.push({ label: 'Survey', text: 'Uncharted — you have no survey of this sector.', tone: 'foe' });
  }
  const links = [];
  if (sec.factionId && FACTION_BY_ID.has(sec.factionId)) links.push({ ref: 'faction:' + sec.factionId, label: FACTION_BY_ID.get(sec.factionId).name });
  for (const st of (sec.stations || [])) links.push({ ref: 'station:' + st.id, label: st.name });
  for (const n of (sec.neighbors || [])) { const l = entityLabel('sector:' + n); if (l) links.push({ ref: 'sector:' + n, label: l }); }
  return { kicker: 'Sector', facts, lines, links, route: { screen: 'chart', focus: 'sector:' + id } };
}

function hullDossier(state, id) {
  const s = SHIP_BY_ID.get(id);
  if (!s) return null;
  const facts = [
    { k: 'Role', v: String(s.role || '').replace(/_/g, ' '), tone: 'calm' },
    { k: 'Hull', v: String(s.hull), tone: 'calm', num: true },
    { k: 'Cargo', v: String(s.cargo) + ' u', tone: 'calm', num: true },
    { k: 'Price', v: creditText(s.price), tone: 'goal', num: true },
  ];
  const lines = [];
  // Mass and handling are why it flies the way it does — J2's band. Stated as the fact, not a verb;
  // handlingProfile owns the roster-relative reading and this must not contradict it.
  if (s.mass != null) lines.push({ label: 'Mass', text: String(s.mass) });
  if (s.handling != null) lines.push({ label: 'Handling', text: String(s.handling) });
  return { kicker: 'Hull · tier ' + String(s.tier ?? '?'), facts, lines, links: [], route: { screen: 'ship', focus: 'hull:' + id } };
}

function moduleDossier(state, id) {
  const m = MODULE_BY_ID.get(id);
  if (!m) return null;
  const facts = [
    { k: 'Slot', v: `${String(m.slotType || '').replace(/_/g, ' ')} · ${m.size || ''}`.trim(), tone: 'calm' },
    { k: 'Mass', v: String(m.mass), tone: 'calm', num: true },
    { k: 'Price', v: creditText(m.price), tone: 'goal', num: true },
  ];
  // Every module advertises a power DRAW against a capacity the UI has never shown (§11.11 #2).
  // Naming it here is the cheapest place that gap becomes visible before J2 lands.
  if (m.energyDraw != null) facts.push({ k: 'Power draw', v: String(m.energyDraw), tone: m.energyDraw > 0 ? 'foe' : 'calm', num: true });
  const lines = [];
  const mods = m.mods && Object.keys(m.mods);
  if (mods && mods.length) {
    lines.push({ label: 'Changes', text: mods.map((k) => `${k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${m.mods[k] > 0 ? '+' : ''}${m.mods[k]}`).join(' · ') });
  }
  return { kicker: 'Module · tier ' + String(m.tier ?? '?'), facts, lines, links: [], route: { screen: 'ship', focus: 'module:' + id } };
}

function captainDossier(state, id) {
  const a = aceById(id);
  if (!a) return null;
  const facts = [];
  const owner = factionLabel(a.factionId);
  if (owner) facts.push({ k: 'Flies for', v: owner, tone: 'calm' });
  if (a.crew) facts.push({ k: 'Crew', v: String(a.crew), tone: 'calm' });
  if (a.gimmickTag) facts.push({ k: 'Known for', v: String(a.gimmickTag).replace(/-/g, ' '), tone: 'foe' });

  const lines = [];
  // The ace's own line, from the authored bark bank — never generated.
  if (a.signatureBark) lines.push({ label: 'Last heard', text: String(a.signatureBark) });
  // What the world remembers about YOUR fights with them, if aceMemory has a record.
  const mem = state && state.aceMemory && state.aceMemory[id];
  if (mem) {
    // Two facts, not a built sentence. The original concatenated a `time(s)` plural into prose,
    // which grammar §12 item 11 forbids and which reads as a placeholder.
    if (mem.defeats != null) facts.push({ k: 'You have downed them', v: String(Number(mem.defeats) || 0), tone: 'you', num: true });
    if (mem.kills != null) facts.push({ k: 'They have downed you', v: String(Number(mem.kills) || 0), tone: 'foe', num: true });
    if (mem.status) lines.push({ label: 'Status', text: String(mem.status).replace(/_/g, ' ') });
  }
  const links = [];
  if (a.factionId && FACTION_BY_ID.has(a.factionId)) links.push({ ref: 'faction:' + a.factionId, label: FACTION_BY_ID.get(a.factionId).name });
  return { kicker: 'Captain', facts, lines, links, route: null };
}

function contractDossier(state, id) {
  // Contracts are LIVE records, not a catalogue: existence is a state question. No record → null,
  // and the caller renders nothing rather than a dossier for a contract that is not on offer.
  const pools = [
    state && state.missions && state.missions.active,
    state && state.missions && state.missions.available,
    state && state.missions && state.missions.offered,
  ];
  let rec = null;
  for (const pool of pools) {
    if (!pool) continue;
    const list = Array.isArray(pool) ? pool : Object.values(pool);
    rec = list.find((m) => m && (m.id === id || m.missionId === id)) || rec;
    if (rec) break;
  }
  if (!rec) return null;
  const facts = [];
  if (rec.reward != null) facts.push({ k: 'Pays', v: creditText(rec.reward), tone: 'goal', num: true });
  const owner = factionLabel(rec.factionId);
  if (owner) facts.push({ k: 'Posted by', v: owner, tone: 'calm' });
  if (rec.status) facts.push({ k: 'Status', v: String(rec.status).replace(/_/g, ' '), tone: 'calm' });
  const lines = [];
  if (rec.description || rec.summary) lines.push({ label: 'Terms', text: String(rec.description || rec.summary) });
  const links = [];
  if (rec.factionId && FACTION_BY_ID.has(rec.factionId)) links.push({ ref: 'faction:' + rec.factionId, label: FACTION_BY_ID.get(rec.factionId).name });
  if (rec.sectorId && SECTOR_BY_ID.has(rec.sectorId)) links.push({ ref: 'sector:' + rec.sectorId, label: SECTOR_BY_ID.get(rec.sectorId).name });
  return { kicker: 'Contract', facts, lines, links, route: rec.sectorId ? { screen: 'chart', focus: 'sector:' + rec.sectorId } : null };
}

const DOSSIERS = {
  faction: factionDossier,
  commodity: commodityDossier,
  station: stationDossier,
  sector: sectorDossier,
  hull: hullDossier,
  module: moduleDossier,
  captain: captainDossier,
  contract: contractDossier,
};

/**
 * resolveEntity(state, ref) -> dossier | null
 *
 * dossier = { type, id, ref, label, kicker, accent?, facts[], lines[], links[], route }
 *   facts  tier-1: what you need to decide, as { k, v, tone } — tone is a grammar §4 role name
 *   lines  tier-3: the record, as { label, text, tone? }
 *   links  the graph — other refs reachable from here. This is what makes it one system.
 *   route  where to go to ACT on it, or null. A request; entityLinks.js honours it.
 *
 * NULL for an unknown ref, and the caller renders NOTHING. No placeholder dossier ever.
 */
export function resolveEntity(state, ref) {
  const parsed = parseEntityRef(ref);
  if (!parsed) return null;
  const build = DOSSIERS[parsed.type];
  if (!build) return null;
  let body = null;
  try { body = build(state, parsed.id); } catch (_) { return null; }
  if (!body) return null;
  const label = entityLabel(ref) || (parsed.type === 'contract' ? 'Contract' : null);
  if (!label) return null;
  return {
    type: parsed.type, id: parsed.id, ref, label,
    kicker: body.kicker || parsed.type,
    accent: body.accent || null,
    facts: (body.facts || []).filter((f) => f && f.k && f.v != null && f.v !== ''),
    lines: (body.lines || []).filter((l) => l && l.text),
    links: (body.links || []).filter((l) => l && l.ref && l.label),
    route: body.route || null,
  };
}
