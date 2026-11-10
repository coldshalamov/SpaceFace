// worldPressure.js — the catalog and pure readers for the three persistent world
// pressures (build_map §34 rows 520–523, persistence law §8.11 / row 549):
//
//   1. W-TIDE   — per-sector Bloom infestation. Rises where unclaimed wrecks rot,
//                 spreads along the lanes those wrecks sit on, falls on clears and
//                 fed Understory gardens. Persisted under state.worldPressure.tide.
//   2. W-AUDITS — the Helix Directorate's Gate Audits. One outer gate per Book from
//                 B3, welded shut over several days behind a wreckable scaffold.
//                 Canon order (expansion 06): B3 Kepler, B4 Io's Nereid exit, B6 Eris.
//   3. W-GRAY   — the Slow Gray. The Pit's air index on the Meridian ticker falls
//                 every Book and never recovers (epilogue canon).
//
// Everything here is a pure function or a frozen definition. state.worldPressure is
// the single persisted truth; the system in systems/worldPressure.js writes it,
// these helpers read it. No RNG, no wall clock, no control flow beyond lookup.

import { SECTORS } from './sectors.js';
import { CAL_DAY_S, CAL_WEEK_DAYS, calendarDay } from './worldCalendar.js';
import { faction as HELIX } from './factions/helix.js';
import { FRONTIER_CORE_GATE_PATCHES } from './frontierRegions/index.js';
import { sectorGlobalOrigin } from './sectorCoordinates.js';

export const WORLD_PRESSURE_SCHEMA_VERSION = 1;

// ── The Book clock ────────────────────────────────────────────────────────────
// The campaign's eight Books ride the world calendar: one Book is one calendar
// week (five 600-second days), so B0..B7 fill the 40-day year. simTime is the
// only input — the schedule is identical for a given run timeline.
export const WORLD_BOOK_DAYS = CAL_WEEK_DAYS;            // 5
export const WORLD_BOOK_COUNT = 8;                        // B0..B7
export const WORLD_BOOK_SECONDS = WORLD_BOOK_DAYS * CAL_DAY_S;

export function bookIndexFor(simTime) {
  const book = Math.floor(Math.max(0, Number(simTime) || 0) / WORLD_BOOK_SECONDS);
  return book < 0 ? 0 : book >= WORLD_BOOK_COUNT ? WORLD_BOOK_COUNT - 1 : book;
}

export function bookStartTime(book) {
  return Math.max(0, Math.floor(Number(book) || 0)) * WORLD_BOOK_SECONDS;
}

// ── W-TIDE ────────────────────────────────────────────────────────────────────
export const TIDE = Object.freeze({
  max: 1,
  // Ambient bloom pressure every sector feels daily. Weak alone, real on top of rot.
  creepPerDay: 0.004,
  // Slow natural settle. A tidy sector drifts back; a rotten one still wins.
  settlePerDay: 0.006,
  // Rise per day per unclaimed-wreck marker sitting in the sector (cap below).
  wreckPerDay: 0.05,
  wreckUnitsMax: 6,
  // Fraction of the tide difference that crosses a lane each day. A lane whose
  // either endpoint holds unclaimed wrecks carries more.
  spreadRate: 0.10,
  spreadLaneBonus: 0.5,
  // Fed Understory gardens push back: understory.tidePushback[sector] already sums
  // per-garden pushback; this scales that persisted fact into the daily step.
  gardenPushScale: 1.0,
  // One completed salvage clears this much tide, applied to the next day step.
  clearDrop: 0.22,
  // Bloom pressure the tide feeds the danger model with, per day per sector.
  dangerFeed: 0.05,
  // Chart band edges (also the feel of the place).
  filmAt: 0.15,
  bloomAt: 0.45,
  chokedAt: 0.75,
});

/** Player-readable tide band for the chart. */
export function tideBand(level) {
  const v = Number(level) || 0;
  if (v >= TIDE.chokedAt) return 'choked';
  if (v >= TIDE.bloomAt) return 'bloom';
  if (v >= TIDE.filmAt) return 'film';
  return 'clear';
}

// ── W-AUDITS ──────────────────────────────────────────────────────────────────
// Canon schedule (design/expansion/06): the first audit closes the Kepler gate in
// B3, the second Io's outer gate in B4, the third the Eris gate in B6. Each edge is
// undirected — the weld is on the ROAD, both ends close together. Every chosen edge
// is a frontier gate with at least one alternate lane out of its far sector, so a
// closure lengthens routes and can never strand a sector (the drive always flies).
export const GATE_AUDITS = Object.freeze([
  Object.freeze({
    book: 3,
    a: 'sector_sker_haven',
    b: 'sector_kepler_scar',
    gateName: 'the Kepler gate',
    docket: 'AUDIT B3 · KEPLER CROSSING',
  }),
  Object.freeze({
    book: 4,
    a: 'sector_io_reach',
    b: 'sector_nereid_shoal',
    gateName: "Io's Nereid gate",
    docket: 'AUDIT B4 · NEREID CROSSING',
  }),
  Object.freeze({
    book: 6,
    a: 'sector_ashfall_reach',
    b: 'sector_eris_margin',
    gateName: 'the Eris gate',
    docket: 'AUDIT B6 · ERIS CROSSING',
  }),
]);

const SCAFFOLD = HELIX && HELIX.custom && HELIX.custom.gateAuditPlatform || {};

export const GATE_AUDIT = Object.freeze({
  // Physical def (row 526 authored the platform; this row owns the schedule).
  scaffoldHp: Number(SCAFFOLD.scaffoldHp) || 900,
  weldProgressPerDay: Number(SCAFFOLD.weldProgressPerCycle) || 0.34,
  tetherable: SCAFFOLD.tetherable !== false,
  // Wrecking the scaffold delays the closure this many days; the audit itself
  // never cancels — a new platform is towed in and the weld resumes where it was.
  wreckDelayDays: 2,
  // Law wakes around the sealed road: a Verge law zone on each gate end.
  lawZoneRadius: 900,
  // Scaffold scan line and entity dressing.
  scaffoldRadius: 16,
  scaffoldMass: 800,
  scaffoldName: 'Helix audit scaffold',
});

/** Canonical undirected key for a neighbor edge: 'sector_a|sector_b' (sorted). */
export function auditEdgeKey(a, b) {
  const x = String(a || ''), y = String(b || '');
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

const AUDIT_BY_KEY = new Map(GATE_AUDITS.map((g) => [auditEdgeKey(g.a, g.b), g]));

/** Catalog row for an edge, or null when the road is not on the audit schedule. */
export function gateAuditCatalogEntry(a, b) {
  return AUDIT_BY_KEY.get(auditEdgeKey(a, b)) || null;
}

/** Live audit record for an edge from persisted state, or null. */
export function gateAuditFor(state, a, b) {
  const gates = state && state.worldPressure && state.worldPressure.gates;
  const rec = gates && gates[auditEdgeKey(a, b)];
  return rec && typeof rec === 'object' ? rec : null;
}

/** The edge's gate-mode transit is welded shut (drive still flies the road). */
export function gateTransitClosed(state, a, b) {
  const rec = gateAuditFor(state, a, b);
  return !!(rec && rec.status === 'closed');
}

/**
 * BFS over the canonical sector graph from `startId`.
 * `mode`: 'drive' walks every neighbor edge (the jump drive always flies) plus the
 *         authored wormhole pair when `includeWormholes`; 'gate' additionally skips
 *         edges whose gate-mode transit is welded shut by an audit.
 * Returns a Set of sector ids. Pure — plain state reads only.
 */
export function reachableSectorIds(state, startId, { mode = 'drive', includeWormholes = true } = {}) {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  const seen = new Set();
  if (!startId || !byId.has(startId)) return seen;
  seen.add(startId);
  const q = [startId];
  while (q.length) {
    const u = q.shift();
    const su = byId.get(u);
    const next = [...(su.neighbors || [])];
    if (includeWormholes && su.wormholeTo && su.wormholeTo.sectorId) next.push(su.wormholeTo.sectorId);
    for (const v of next) {
      if (seen.has(v) || !byId.has(v)) continue;
      if (mode === 'gate' && !(su.wormholeTo && su.wormholeTo.sectorId === v)
          && gateTransitClosed(state, u, v)) continue;
      seen.add(v);
      q.push(v);
    }
  }
  return seen;
}

/**
 * Global XZ for an audit edge's gate in `sectorId` (an endpoint of the edge), when
 * a position is authored: the live active-sector gate entity first, then the
 * frontier patch table (sector-local → global). Null when nothing authored the
 * gate in that sector — callers fall back to the sector origin.
 */
export function auditGateGlobalPos(state, sectorId, otherId) {
  const active = state && state.world && state.world.activeSector;
  if (active && active.id === sectorId && Array.isArray(active.gates)) {
    for (const g of active.gates) {
      if (g && (g.to === otherId || g.gateTo === otherId) && g.pos
          && Number.isFinite(g.pos.x) && Number.isFinite(g.pos.z)) {
        return { x: g.pos.x, z: g.pos.z };
      }
    }
  }
  const patches = FRONTIER_CORE_GATE_PATCHES[sectorId] || [];
  for (const g of patches) {
    if (!g || g.to !== otherId || !g.pos) continue;
    const origin = sectorGlobalOrigin(sectorId) || { x: 0, z: 0 };
    return { x: origin.x + g.pos.x, z: origin.z + g.pos.z };
  }
  const origin = sectorGlobalOrigin(sectorId);
  return origin ? { x: origin.x, z: origin.z } : null;
}

// ── W-GRAY ────────────────────────────────────────────────────────────────────
// The Slow Gray (expansion 01 §2): the Pit's air index falls every Book and never
// recovers — the epilogue is canon. The player's violence moves prices, never air,
// so nothing in the sim writes this value except the Book tick below.
export const SLOW_GRAY = Object.freeze({
  startIndex: 64.0,
  dropPerBook: 3.0,
  floorIndex: 9.0,          // it approaches the floor; it never stops falling
  tickerSource: 'meridian-wire',
});

// ── Row 549 budgets — every persisted receipt above has a cap and a reader ─────
export const WORLD_PRESSURE_CAPS = Object.freeze({
  // Meaningful: never decay (the cap is a save-hygiene bound, not a decay queue).
  colossusRemains: 32,
  gateEvents: 64,
  // Trivial: the tide-move notices dedupe oldest-first once the cap binds.
  tideNotices: 12,
});

// ── Persistence normalization (deserialize + v18→v19 migration seed) ──────────
const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));
const AUDIT_STATUSES = new Set(['announced', 'welding', 'delayed', 'closed']);

function clampTide(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(TIDE.max, n)) : 0;
}

/** Bounded empty bag — what newGame() and the migration seed write. */
export function emptyWorldPressure() {
  return {
    schemaVersion: WORLD_PRESSURE_SCHEMA_VERSION,
    lastDay: -1,
    lastBook: bookIndexFor(0),
    tide: {},                    // sectorId -> 0..1 (missing = 0, the sea floor)
    clearBuffer: {},             // sectorId -> pending clear count (drained each day)
    gates: {},                   // auditEdgeKey -> audit record
    gateEvents: [],              // meaningful journal, cap gateEvents, never decays
    tideNotices: [],             // trivial news dedupe keys, oldest-first decay
    slowGray: { index: SLOW_GRAY.startIndex, lastBookIndex: -1 },
    colossusRemains: [],         // meaningful, cap colossusRemains, never decays
  };
}

function normalizeAuditRecord(key, input) {
  if (!input || typeof input !== 'object') return null;
  const cat = AUDIT_BY_KEY.get(key);
  if (!cat) return null;                    // unknown edge — not an audit road
  const status = AUDIT_STATUSES.has(input.status) ? input.status : 'announced';
  return {
    key,
    a: cat.a, b: cat.b, book: cat.book,
    docket: String(input.docket || cat.docket),
    gateName: String(input.gateName || cat.gateName),
    status,
    weld: Math.max(0, Math.min(1, Number(input.weld) || 0)),
    announcedAt: Number(input.announcedAt) || 0,
    delayedUntil: Number(input.delayedUntil) || 0,
    closedAt: Number(input.closedAt) || 0,
    vergeLaw: input.vergeLaw === true,
  };
}

/**
 * Normalize a candidate worldPressure bag in place-shape: bounded keys, coerced
 * numbers, capped journals. Trivial records decay oldest-first on WRITE (the
 * producer shifts them); the caps here only make a hostile or corrupt save
 * converge back to the same bound.
 */
export function normalizeWorldPressure(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = emptyWorldPressure();

  if (src.tide && typeof src.tide === 'object' && !Array.isArray(src.tide)) {
    for (const [sectorId, v] of Object.entries(src.tide)) {
      if (!SECTOR_IDS.has(sectorId)) continue;
      const level = clampTide(v);
      if (level > 0) out.tide[sectorId] = level;
    }
  }
  if (src.clearBuffer && typeof src.clearBuffer === 'object' && !Array.isArray(src.clearBuffer)) {
    for (const [sectorId, v] of Object.entries(src.clearBuffer)) {
      if (!SECTOR_IDS.has(sectorId)) continue;
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) out.clearBuffer[sectorId] = n;
    }
  }
  if (src.gates && typeof src.gates === 'object' && !Array.isArray(src.gates)) {
    for (const [key, rec] of Object.entries(src.gates)) {
      const norm = normalizeAuditRecord(key, rec);
      if (norm) out.gates[key] = norm;
    }
  }
  if (Array.isArray(src.gateEvents)) {
    out.gateEvents = src.gateEvents
      .filter((e) => e && typeof e === 'object' && typeof e.event === 'string')
      .map((e) => ({
        event: e.event, key: typeof e.key === 'string' ? e.key : null,
        book: Number.isFinite(e.book) ? e.book : null, at: Number(e.at) || 0,
      }))
      .slice(-WORLD_PRESSURE_CAPS.gateEvents);
  }
  if (Array.isArray(src.tideNotices)) {
    out.tideNotices = src.tideNotices.map(String).slice(-WORLD_PRESSURE_CAPS.tideNotices);
  }
  const gray = src.slowGray && typeof src.slowGray === 'object' ? src.slowGray : {};
  out.slowGray = {
    index: Math.max(SLOW_GRAY.floorIndex, Math.min(SLOW_GRAY.startIndex, Number(gray.index) || SLOW_GRAY.startIndex)),
    lastBookIndex: Number.isFinite(gray.lastBookIndex) ? Math.floor(gray.lastBookIndex) : -1,
  };
  if (Array.isArray(src.colossusRemains)) {
    out.colossusRemains = src.colossusRemains
      .filter((r) => r && typeof r === 'object' && typeof r.sectorId === 'string' && SECTOR_IDS.has(r.sectorId))
      .map((r) => ({
        id: String(r.id || `cr_${Math.abs(hashKey(r.name || r.sectorId))}`),
        name: String(r.name || 'a colossus'),
        sectorId: r.sectorId,
        x: Number(r.x) || 0, z: Number(r.z) || 0,
        at: Number(r.at) || 0,
      }))
      .slice(-WORLD_PRESSURE_CAPS.colossusRemains);
  }
  out.lastDay = Number.isFinite(src.lastDay) ? Math.floor(src.lastDay) : -1;
  out.lastBook = Number.isFinite(src.lastBook) ? Math.floor(src.lastBook) : out.lastBook;
  return out;
}

function hashKey(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export { calendarDay };
