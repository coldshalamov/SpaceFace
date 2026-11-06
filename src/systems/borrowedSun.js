// borrowedSun.js — Nemi's visiting carrier (build_map §34.3 one-off).
//
// The carrier is a light lender. It takes a safe berth, unfolds a ring of mirror
// sails, and sells the one thing the outer dark is short of: collected light.
// Docking, trade, prices, stock, hull/fuel delivery and traffic stay with their
// existing owners — this file owns the carrier visit and the lender's ledger.
//
// THE LIGHT ECONOMY — additive layer over the visit machine:
//   · MIRROR ARRAY — while the carrier is 'open', SUN_MIRRORS.count sail bodies
//     ride a slow ring outside the service approach. They are real, killable
//     bodies bound to the book by id + occupantGeneration + ownership tags; a
//     broken sail is re-printed on a delay and its loss throws glass into the
//     lane. A ship that crosses the sail ring takes a solar-wind shove through
//     queuePhysicsImpulse — the wash is the hazard, and it is honest physics.
//   · LIGHT LEASES — buy a bounded annuity over the hail channel: the sun sells
//     you a paper share of collected light. Beats pay only while you stay in
//     the light radius; beats you are absent for lapse (light uncollected is
//     light spent); if the carrier folds mid-note the lender settles the
//     remaining face at a curtailed fraction. Once-only on every payout.
//   · SHADOW MARKET — the shaded side of a parked sun buys what the light
//     can't grow. Demand lots post on a deterministic clock naming a real
//     commodity, quantity and per-unit premium; a genuine docked sell receipt
//     fills the lot once and pays the premium on top of the market quote.
//   · THE LENDER'S LEDGER — state.borrowedSunBook is the whole book: leases,
//     lots, charters, the debt note, collector bindings, the record strip and
//     once-only stamps. Plain JSON, bounded on every read, save-safe through
//     the system's own serialize()/deserialize() envelope.
//   · DEBTOR CONSEQUENCES — break a sail and the book opens a note. While a
//     note is open the ledger holds: service status reads 'ledger_hold', new
//     leases refuse, and beats on paper you already hold are frozen in place —
//     not burned, held. Missed vig periods grow the balance once each; past a
//     threshold the carrier fields collector hulls that levy on contact until
//     the note settles. The note outlives the visit.
//   · ONCE-ONLY CONTRACTS — each visit posts exactly one charter: a tithe of
//     named goods sold across the counter, an oath that the glass stays whole
//     to the fold, or a folded-sail crate to ferry back aboard. Latched by
//     visitId, paid under a stamped receipt, voided when the visit ends.
//
// Deterministic: every clock reads simTime; every roll is hash32 over ids and
// sequence numbers — no ambient randomness. Money moves ONLY through
// economy:grantCredits/economy:chargeCredits (exact-payment requireFull
// envelopes where a refusal must cost nothing); standing ONLY through
// faction:repDelta; physical force ONLY through queuePhysicsImpulse. Latches
// land before emits. Entity references bind by id + occupantGeneration + an
// ownership tag in .data, so a recycled id is never the same body.

import { BORROWED_SUN as C, BORROWED_SUN_BERTHS as BERTHS,
  freshBorrowedSun, normalizeBorrowedSun } from '../data/borrowedSun.js';
import { SECTORS } from '../data/sectors.js';
import { COMMODITIES } from '../data/commodities.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { physicsBodyNativeReady, queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { resolveCollisionProxyManifest } from '../data/collisionProxyManifests.js';
import { hash32 } from '../core/rng.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';

const CARRIER_ARCHETYPE = 'place_station_trade_hub';
const owners = new WeakMap();
const labels = new Map(COMMODITIES.map(c => [c.id, c.name]));
const clone = v => structuredClone(v);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)

const FACTION_ID = 'faction_mts';
const PAID_STAMPS_CAP = 96;
const TAU = Math.PI * 2;

// ── Mirror array ─────────────────────────────────────────────────────────────
// Sails ride the ring outside the service approach — real bodies, real glass.
export const SUN_MIRRORS = Object.freeze({
  count: 4,                 // sails per visit while the carrier is open
  ringGap: 70,              // ring radius = carrier radius + this gap
  precessRadPerS: 0.012,    // the ring precesses slowly — the light walks
  hull: 60, radius: 8, mass: 10,
  respawnS: 45,             // a broken sail is re-printed on this delay
  washBeatS: 0.6,           // one solar-wind push per ship per beat
  washPad: 26,              // half-width of the sail-ring wash band
  washPushSpeed: 42,        // dv of one wash push (m/s), outward from the carrier
  costCr: 420,              // ledger price of a broken sail
  repBroke: -3,
  shardCount: 3, shardTtlS: 40, shardSpeed: 30,
});

// ── Light leases ─────────────────────────────────────────────────────────────
// A paper share of collected light: pay the face, collect beats in the light.
export const SUN_LEASES = Object.freeze({
  costCr: 650,
  beats: 8, beatEveryS: 18, beatCr: 110,   // full term pays ~1.35× face
  missGraceS: 27,                          // a beat lapses this long after it falls due
  collectRadius: 1600,                     // beats pay only in the light
  maxOpen: 2,
  curtailFrac: 0.35,                       // fold settles remaining face at this fraction
  repBought: 1, repFilled: 2,
});

// ── Shadow market ────────────────────────────────────────────────────────────
// The dark side buys what the light cannot grow — bounded demand, real receipts.
export const SUN_SHADOW = Object.freeze({
  firstLotS: 55, periodS: 80, jitterS: 35, ttlS: 260,
  maxOpen: 1, keepClosed: 6,
  qtyMin: 4, qtyMax: 12,
  premiumMinCr: 25, premiumMaxCr: 60,      // per-unit bonus over the market quote
  repFill: 2,
});
const SHADOW_POOL = Object.freeze([
  'cmdty_food', 'cmdty_ice_water', 'cmdty_volatiles', 'cmdty_medical',
  'cmdty_fuel_cells', 'cmdty_electronics', 'cmdty_comp_hullplate',
  'cmdty_consumer_goods', 'cmdty_textiles',
]);

// ── The lender's ledger: debt note and collectors ────────────────────────────
export const SUN_DEBT = Object.freeze({
  vigPeriodS: 90, vigFrac: 0.12,           // +12% of principal per overdue period
  collectorAtCr: 300,                      // field hulls once the balance reaches this
  repSettled: 2, repVig: -2, repCollectorKilled: -4, collectorKillFeeCr: 150,
});
export const SUN_COLLECTORS = Object.freeze({
  max: 2, hull: 70, radius: 12, mass: 20,
  speed: 46, steerGain: 1.2,
  collectR: 95, collectBeatS: 4,
  levyFrac: 0.25, levyMinCr: 40, levyMaxCr: 220,
});

// ── Once-only contracts ──────────────────────────────────────────────────────
export const SUN_CHARTERS = Object.freeze({
  titheQtyMin: 6, titheQtyMax: 16, tithePayCr: 380, titheRep: 3,
  oathPayCr: 520, oathRep: 4,
  freightPayCr: 450, freightRep: 3, freightRadius: 190,
});
const CHARTER_KINDS = Object.freeze(['light_tithe', 'glass_oath', 'last_light']);

// ── Regard — the lender's standing, scaled by settled work ───────────────────
export const SUN_TIERS = Object.freeze([
  { tier: 0, deeds: 0,  id: 'stranger',  label: 'Passing Trade', payMult: 1.0,
    line: 'The light is free. The paper is not.' },
  { tier: 1, deeds: 3,  id: 'accounted', label: 'On the Ledger', payMult: 1.12,
    line: 'Nemi knows your line now. The book remembers the shape of you.' },
  { tier: 2, deeds: 8,  id: 'trusted',   label: 'Light-Bearer',  payMult: 1.28,
    line: 'The sails angle a breath wider when you ask.' },
  { tier: 3, deeds: 16, id: 'bonded',    label: 'Bonded to the Sun', payMult: 1.5,
    line: 'Borrowed light, repaid in full. The ledger speaks for you.' },
]);
export function sunTierFor(deeds) {
  const d = Math.max(0, intOr(deeds));
  let row = SUN_TIERS[0];
  for (const t of SUN_TIERS) if (d >= t.deeds) row = t;
  return row;
}

export const SUN_BOOK_KEY = 'borrowedSunBook';

/** Fresh plain-JSON lender's book. Bounded collections, no Map/Set/Symbol. */
export function freshSunBook() {
  return {
    schema: 1, seq: 0, deeds: 0, tier: 0,
    mirrors: [],      // {slot, entityId, gen, visitId, state:'live'|'lost'|'stowed', lostAt, respawnAt}
    leases: [],       // {id, visitId, costCr, beatsTotal, beatsPaid, beatsMissed, nextBeatAt, state, openedAt}
    nextShadowAt: 0,
    shadowLots: [],   // {id, visitId, commodityId, wantQty, gotQty, premiumCr, postedAt, expiresAt, state}
    debt: null,       // {id, postedVisitId, cause, principal, balance, postedAt, vigApplied, state, settledHow}
    collectors: [],   // {entityId, gen, debtId}
    charter: null,    // one per visit — {id, visitId, kind, commodityId, wantQty, gotQty, podId, podGen, state, ...}
    records: [],      // ledger line strip — {id, kind, detail, at}
    paid: {},         // once-only stamps {key: simTime}
    washNoticeVisit: 0,
    visitLosses: 0, lossVisitId: 0,
    stats: { mirrorsLost: 0, leasesDone: 0, shadowFilled: 0, chartersDone: 0,
      lumensPaid: 0, leviesPaid: 0, debtsSettled: 0 },
  };
}

const CHARTER_STATES = ['posted', 'active', 'done', 'void'];
const LEASE_STATES = ['open', 'filled', 'closed', 'curtailed', 'void'];
const LOT_STATES = ['open', 'filled', 'lapsed', 'void'];
const MIRROR_STATES = ['live', 'lost', 'stowed'];
const STATS_FRESH = freshSunBook().stats;
const STAT_KEYS = Object.keys(STATS_FRESH);
// A hand-cut postedAt epochs before the recorded vig would otherwise run the
// catch-up loop for years of missed periods on the first tick after a load.
// Legit backlog is ~2 periods (the transit hop) — 240 is generous headroom.
const VIG_BACKLOG_CAP = 240;

/** Bounded normalize-on-read for the lender's book (the frontier/pitborn rule). */
export function ensureSunBook(state) {
  if (!isObj(state[SUN_BOOK_KEY])) state[SUN_BOOK_KEY] = freshSunBook();
  const b = state[SUN_BOOK_KEY];
  b.seq = Math.max(0, intOr(b.seq)); b.deeds = Math.max(0, intOr(b.deeds));
  b.tier = Math.max(0, intOr(b.tier));
  b.nextShadowAt = num(b.nextShadowAt);
  // A far-future market clock starves the shade for the rest of the visit —
  // the posted window is never further than period+jitter+ttl out (the same
  // bound the open edge applies), so a bigger gap is not a genuine schedule.
  if (num(state.simTime) > 0) b.nextShadowAt = Math.min(b.nextShadowAt,
    num(state.simTime) + SUN_SHADOW.periodS + SUN_SHADOW.jitterS + SUN_SHADOW.ttlS);
  b.washNoticeVisit = Math.max(0, intOr(b.washNoticeVisit));
  b.visitLosses = Math.max(0, intOr(b.visitLosses)); b.lossVisitId = intOr(b.lossVisitId);
  if (!isObj(b.stats)) b.stats = { ...STATS_FRESH };
  for (const k of STAT_KEYS) b.stats[k] = intOr(b.stats[k]);
  if (!isObj(b.paid)) b.paid = {};
  {
    const keys = Object.keys(b.paid);
    if (keys.length > PAID_STAMPS_CAP) for (let i = 0; i <= keys.length - PAID_STAMPS_CAP; i++) delete b.paid[keys[i]];
    for (const k of keys) if (!Number.isFinite(Number(b.paid[k]))) delete b.paid[k];
  }
  {
    const seen = new Set();
    b.mirrors = (Array.isArray(b.mirrors) ? b.mirrors : [])
      .filter(r => isObj(r) && Number.isInteger(intOr(r.slot, -1)) && intOr(r.slot, -1) >= 0
        && intOr(r.slot) < SUN_MIRRORS.count && MIRROR_STATES.includes(r.state) && r.state !== 'stowed')
      // One row per ring slot per visit. Duplicate-slot rows in a hand-cut book
      // crowd the slice: the real slots' rows drop every read, and each tick would
      // print a fresh sail, orphan it, and burn a spawn-budget slot forever.
      .filter(r => {
        const k = `${intOr(r.slot)}:${intOr(r.visitId, 1)}`;
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .slice(0, SUN_MIRRORS.count);
  }
  for (const r of b.mirrors) {
    r.slot = intOr(r.slot); r.entityId = r.entityId == null ? null : intOr(r.entityId, null);
    r.gen = r.gen == null ? null : intOr(r.gen, null); r.visitId = intOr(r.visitId, 1);
    r.lostAt = num(r.lostAt); r.respawnAt = num(r.respawnAt);
    // A re-print clock epochs out starves the slot for the whole visit — re-arm
    // it on the authored delay. simTime-aware reads only (same rule as expiresAt).
    if (num(state.simTime) > 0) r.respawnAt = Math.min(r.respawnAt, num(state.simTime) + SUN_MIRRORS.respawnS);
  }
  b.leases = (Array.isArray(b.leases) ? b.leases : [])
    .filter(r => isObj(r) && typeof r.id === 'string' && LEASE_STATES.includes(r.state))
    .slice(0, 8);
  for (const l of b.leases) {
    l.visitId = intOr(l.visitId, 1); l.costCr = Math.max(0, intOr(l.costCr));
    // beatsTotal is the loop bound for missed-beat catch-up in _tickLeases —
    // uncapped, a hand-cut save hangs the sim on the first tick after a load.
    l.beatsTotal = Math.min(SUN_LEASES.beats, Math.max(0, intOr(l.beatsTotal)));
    l.beatsPaid = Math.min(l.beatsTotal, Math.max(0, intOr(l.beatsPaid)));
    l.beatsMissed = Math.min(Math.max(0, l.beatsTotal - l.beatsPaid), Math.max(0, intOr(l.beatsMissed)));
    l.nextBeatAt = num(l.nextBeatAt);
    // A far-future beat clock squats an open slot forever without ever paying or
    // lapsing — re-arm it at the authored cadence; a genuine nextBeatAt is never
    // more than beatEveryS ahead of the read clock.
    if (num(state.simTime) > 0) l.nextBeatAt = Math.min(l.nextBeatAt, num(state.simTime) + SUN_LEASES.beatEveryS);
    l.openedAt = num(l.openedAt);
    // A paper row whose beats are all spent is terminal; left 'open' with a
    // future beat clock it would squat a maxOpen slot forever.
    if (l.state === 'open' && l.beatsPaid + l.beatsMissed >= l.beatsTotal)
      l.state = l.beatsPaid >= l.beatsTotal ? 'filled' : 'closed';
  }
  b.shadowLots = (Array.isArray(b.shadowLots) ? b.shadowLots : [])
    .filter(r => isObj(r) && typeof r.id === 'string' && typeof r.commodityId === 'string'
      && LOT_STATES.includes(r.state))
    .slice(0, 12);
  for (const l of b.shadowLots) {
    l.visitId = intOr(l.visitId, 1);
    // A wantQty of 0 fills off the next sale for free and a huge one stalls the
    // lot forever — bound it without rewriting a plausible hand-cut demand.
    l.wantQty = Math.min(SUN_SHADOW.qtyMax, Math.max(1, intOr(l.wantQty, SUN_SHADOW.qtyMin)));
    l.gotQty = Math.max(0, intOr(l.gotQty));
    l.premiumCr = Math.min(SUN_SHADOW.premiumMaxCr, Math.max(SUN_SHADOW.premiumMinCr,
      intOr(l.premiumCr, SUN_SHADOW.premiumMinCr)));
    l.postedAt = num(l.postedAt);
    // expiresAt is authored as postedAt + ttl — heal overshoot against that
    // relation first (self-contained, safe on a restore envelope that carries
    // no simTime), then against the read clock so a far-future expiry cannot
    // squat the single open-lot slot forever.
    l.expiresAt = Math.min(num(l.expiresAt), num(l.postedAt) + SUN_SHADOW.ttlS);
    if (num(state.simTime) > 0) l.expiresAt = Math.min(l.expiresAt, num(state.simTime) + SUN_SHADOW.ttlS);
  }
  if (b.debt != null && !(isObj(b.debt) && typeof b.debt.id === 'string')) b.debt = null;
  if (b.debt) {
    const d = b.debt;
    d.postedVisitId = intOr(d.postedVisitId, 1); d.cause = str(d.cause, 'ledger');
    d.principal = Math.max(0, intOr(d.principal)); d.balance = Math.max(0, intOr(d.balance));
    d.postedAt = num(d.postedAt); d.vigApplied = Math.max(0, intOr(d.vigApplied));
    if (d.state !== 'open' && d.state !== 'settled') d.state = 'open';
    if (d.state === 'open' && d.balance <= 0) { d.state = 'settled'; d.settledHow = 'normalized'; }
    const maxBacklog = (d.vigApplied + VIG_BACKLOG_CAP) * SUN_DEBT.vigPeriodS;
    if (d.state === 'open' && d.postedAt < num(state.simTime) - maxBacklog)
      d.postedAt = num(state.simTime) - maxBacklog;
  }
  b.collectors = (Array.isArray(b.collectors) ? b.collectors : [])
    .filter(r => isObj(r) && r.entityId != null && Number.isFinite(Number(r.entityId))
      && typeof r.debtId === 'string')
    .slice(0, SUN_COLLECTORS.max);
  for (const r of b.collectors) {
    r.entityId = intOr(r.entityId, null);
    r.gen = r.gen == null ? null : intOr(r.gen, null);
  }
  if (b.charter != null && !(isObj(b.charter) && typeof b.charter.id === 'string'
    && CHARTER_KINDS.includes(b.charter.kind) && CHARTER_STATES.includes(b.charter.state))) b.charter = null;
  if (b.charter) {
    const ch = b.charter;
    ch.visitId = intOr(ch.visitId, 1);
    // Pay, rep and quantity are authored per kind — restoring them heals a
    // hand-cut row without touching a genuine one.
    if (ch.kind === 'light_tithe') {
      ch.commodityId = ch.commodityId == null ? null : str(ch.commodityId, null);
      ch.wantQty = Math.min(SUN_CHARTERS.titheQtyMax,
        Math.max(1, intOr(ch.wantQty, SUN_CHARTERS.titheQtyMin)));
      ch.payCr = SUN_CHARTERS.tithePayCr; ch.rep = SUN_CHARTERS.titheRep;
    } else if (ch.kind === 'glass_oath') {
      ch.commodityId = null; ch.wantQty = 0;
      ch.payCr = SUN_CHARTERS.oathPayCr; ch.rep = SUN_CHARTERS.oathRep;
    } else {
      ch.commodityId = null; ch.wantQty = 0;
      ch.payCr = SUN_CHARTERS.freightPayCr; ch.rep = SUN_CHARTERS.freightRep;
    }
    ch.gotQty = Math.max(0, intOr(ch.gotQty));
    ch.podId = ch.podId == null ? null : intOr(ch.podId, null); ch.podGen = ch.podGen == null ? null : intOr(ch.podGen, null);
    ch.postedAt = num(ch.postedAt); ch.acceptedAt = num(ch.acceptedAt, null);
  }
  b.records = (Array.isArray(b.records) ? b.records : [])
    .filter(r => isObj(r) && typeof r.id === 'string' && typeof r.kind === 'string')
    .slice(-24);
  for (const r of b.records) {
    r.at = num(r.at);
    if (r.detail != null && typeof r.detail !== 'string') r.detail = null;
  }
  return b;
}

/** The player's standing with the lender — tier row plus the deeds behind it. */
export function sunStanding(state) {
  const b = ensureSunBook(state);
  const row = sunTierFor(b.deeds);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, deeds: b.deeds };
}

/** HUD-safe snapshot of the lender's whole book — copies, never live rows. */
export function borrowedSunBoard(state) {
  const b = ensureSunBook(state);
  return {
    standing: sunStanding(state),
    mirrorsLive: b.mirrors.filter(r => r.state === 'live').length,
    mirrorCap: SUN_MIRRORS.count,
    leases: b.leases.map(r => ({ ...r })),
    shadowLots: b.shadowLots.map(r => ({ ...r })),
    nextShadowIn: Math.max(0, b.nextShadowAt - num(state.simTime)),
    debt: b.debt ? { ...b.debt } : null,
    collectors: b.collectors.map(r => ({ ...r })),
    charter: b.charter ? { ...b.charter } : null,
    records: b.records.map(r => ({ ...r })),
    stats: { ...b.stats },
  };
}

// Shared read seam. Queries cannot create a visit, spend stock, move a body or advance a clock.
export function borrowedSunServiceStatus(state, stationId, { docking = false } = {}) {
  if (stationId !== C.stationId) return { ok: true };
  if (!owners.get(state)?._adventureContextAllowed()) return { ok: false, reason: 'wrong_context',
    text: 'BORROWED SUN — this carrier serves ordinary Adventure flights.' };
  return owners.get(state)?.serviceStatus({ docking }) || { ok: false, reason: 'carrier_unavailable',
    text: 'BORROWED SUN — the carrier has no current service authority.' };
}
export function borrowedSunPresentation(state, entity) {
  const o = owners.get(state), r = o?._row;
  if (!r || !o._adventureContextAllowed() || o._find() !== entity || o._restoring || r.phaseStartTick > state.tick) return null;
  const age = Math.max(0, state.tick - r.phaseStartTick);
  const opening = r.phase === 'deploy' ? Math.min(1, age / C.deployTicks)
    : ['open', 'close_pending'].includes(r.phase) ? 1 : r.phase === 'fold' ? 1 - Math.min(1, age / C.foldTicks) : 0;
  const book = ensureSunBook(state);
  const sails = book.mirrors.filter(m => m.state === 'live')
    .map(m => { const e = o._mirrorEnt(m); return e
      ? { entityId: m.entityId, slot: m.slot, pos: { x: e.pos.x, z: e.pos.z } } : null; })
    .filter(Boolean);
  return { carrierId: r.carrierId, visitId: r.visitId, phase: r.phase, phaseStartTick: r.phaseStartTick,
    tick: state.tick, ownerLife: entity.occupantGeneration, sourceRevision: entity.physicsBody?.revision || 0,
    nativeBodyReady: !!o._native(entity), serviceAvailable: o.serviceStatus().ok,
    sails, mirrorCap: SUN_MIRRORS.count, ledgerHold: o._bookHold(),
    petalPairs: [0, 1, 2].map(i => Math.max(0, Math.min(1, opening * 3 - i))), opening };
}

// Owns one fixed carrier and its visit record. Docking, trade, prices, stock, credits,
// hull/fuel delivery and traffic remain with their existing owners.
export const borrowedSun = {
  name: 'borrowedSun',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._row = freshBorrowedSun(); this._binding = null; this._restoring = false;
    this._retiring = false; this._lastTick = -1; this._restoreSerial = 0; this._continuedSerial = -1;
    this._subs = []; owners.set(ctx.state, this); this._registerProfile();
    ensureSunBook(ctx.state);
    const on = (event, fn) => this._subs.push(ctx.bus.on(event, fn));
    on('borrowedSun:inspect', () => this.offer());
    on('borrowedSun:route', p => { if (p?.visitId === this._row.visitId) this.plotBerth(); });
    // Light-economy intents — additive; the deck/station UI emits these on the player's say-so.
    on('borrowedSun:leaseBuy', p => { if (p?.visitId === this._row.visitId) { this.buyLease(); this.offer(); } });
    on('borrowedSun:charter', p => { if (p?.visitId === this._row.visitId) { this.acceptCharter(); this.offer(); } });
    on('borrowedSun:debtSettle', p => { if (p?.visitId === this._row.visitId) { this.settleSunDebt(); this.offer(); } });
    on('scan:pulse', p => {
      if (p?.source === 'player-scanner' && p.scannerId === this.state.playerId) this.offer();
    });
    on('economy:tradeCompleted', p => this._trade(p));
    on('sector:exit', () => { if (!this._docked()) this._retire(); });
    on('entity:destroyed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id ?? p?.entity?.id, p?.entity));
    on('entity:killed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id ?? p?.entity?.id, p?.entity));
    on('entity:killed', p => this._sunKilled(p));
    on('entity:destroyed', p => this._assetDestroyed(p));
    on('save:restoring', () => { this._restoring = true; this._binding = null; });
    on('save:loaded', () => this.afterContinue());
  },
  _berth() { return BERTHS[this._row.itineraryLeg]; },
  _adventureContextAllowed() {
    const state = this.state;
    return !!state
      && !(state.run?.kind === 'survival' && state.run.phase !== 'inactive')
      && !state.physicsVenueSession
      && state.physicsVenue?.active !== true
      && !isRacingCorridorSession(state);
  },
  _pos() { return sectorLocalToGlobalForSector(this._berth().local, this._berth().sectorId); },
  _registerProfile() {
    const content = this.state.content || (this.state.content = {});
    const existing = content.sectors || SECTORS;
    const list = Array.isArray(existing) ? existing : Object.values(existing);
    const berth = this._berth();
    // Additive authored metadata only. Existing market data is never copied into this owner.
    const projected = list.map(sector => ({ ...sector, stations: (sector.stations || []).filter(st => st.id !== C.stationId) }));
    const sector = projected.find(s => s.id === berth.sectorId);
    if (sector) sector.stations.push({ id: C.stationId, name: 'The Borrowed Sun', type: 'trade_hub',
      size: 'M', factionId: 'faction_mts', pos: { ...berth.local }, services: [...C.services],
      chartNote: 'One visiting carrier. Its next safe berth is recorded in simulated time.' });
    content.sectors = Array.isArray(existing) ? projected : Object.fromEntries(projected.map(s => [s.id, s]));
  },
  _find() {
    const old = this._binding;
    if (old) {
      if (this.state.entities.get(old.entity.id) === old.entity && old.entity.alive
        && old.entity.occupantGeneration === old.life && old.entity.data?.borrowedSunCarrierId === C.carrierId) return old.entity;
      return null;
    }
    const matches = this.state.entityList.filter(e => e.alive && e.data?.borrowedSunCarrierId === C.carrierId
      && e.data.persistenceOwner === C.owner && e.data.stationId === C.stationId);
    if (matches.length !== 1) return null;
    const entity = matches[0]; this._binding = { entity, life: entity.occupantGeneration }; return entity;
  },
  _native(entity = this._find()) {
    const p = this.ctx.registry?.get('physics'), n = p?._sg02, rec = n?.records.get(entity?.id);
    const age = this.state.tick - n?._simTick;
    const body = entity?.physicsBody;
    const collisionProxy = entity && resolveCollisionProxyManifest(entity);
    if (!entity || p?._nativeRestorePending || p?._nativeRestoreDeferred || !physicsBodyNativeReady(entity)
      || rec?.entity !== entity || !rec.body || rec.spec.dynamic !== false || !rec.colliders?.length
      || !Number.isInteger(n._simTick) || age < 0 || age > 2
      || rec.proxyId !== collisionProxy?.id || rec.revision !== (body.revision || 0)) return null;
    // Static records intentionally have no dynamic post-solve telemetry. Their actual fixed
    // native pose, current solved owner tick and source revision are the authority.
    const anchor = this._pos(), k = rec.kinematics, frame = n._frameOrigin || { x: 0, z: 0 };
    if (!k || distance({ x: k.x + frame.x, z: k.z + frame.z }, anchor) > .05
      || distance(entity.pos, anchor) > .01 || Math.abs(k.yaw) > .001) return null;
    return rec;
  },
  _player() { const p = this.state.entities.get(this.state.playerId); return p?.alive && p.hull > 0 ? p : null; },
  _docked() { const p = this._player(); return !!p && this.state.ui?.docked === true
    && this.state.ui.dockedStationId === C.stationId && this.state.world?.currentSectorId === this._berth().sectorId; },
  _busy() {
    if (this._docked()) return true;
    const economy = this.ctx.registry?.get('economy');
    if (economy?.state === this.state && economy._tradeExecutionInFlight === true) return true;
    // A stale saved job for a departed/dead occupant is not custody. The actual yard jobs
    // keep this visit only while their canonical current dock exists (_docked above).
    const entity = this._find();
    if (!entity) return false;
    // The sun's own assets — sails, collectors, freight, glass — are never the
    // "other business" that stalls a fold; only foreign bodies hold the berth.
    return this.state.entityList.some(e => e !== entity && e.alive && e.physicsBody !== false
      && e.physicsBody?.dynamic !== false && ['ship', 'drone', 'payload', 'wreck'].includes(e.type)
      && e.data?.persistenceOwner !== C.owner
      && distance(e.pos, entity.pos) < C.radius + Math.max(0, e.radius || 0) + 30);
  },
  _clearBerth() {
    const pos = this._pos();
    return !this.state.entityList.some(e => e.alive && e.collides !== false && e.physicsBody !== false
      && distance(e.pos, pos) < C.radius + Math.max(0, e.radius || 0) + 30);
  },
  _materialize() {
    if (this._row.lost || this._row.phase === 'transit' || this._restoring
      || this.state.world?.currentSectorId !== this._berth().sectorId || this._find()) return;
    if (this._binding || !this._clearBerth()) return;
    const budget = this.helpers.spawnBudget; if (!budget || budget.request(1, C.carrierId) !== 1) return;
    // Reuse the shipped trade-hub visual and declared ring-hub proxy used by ordinary ports.
    // Core resolves that declaration to the measured skin used for this silhouette. The visual
    // radius is the authored outer ring; the fallback fixed body radius matches the proxy core.
    const pos = this._pos(), origin = sectorGlobalOrigin(this._berth().sectorId);
    const corridorBearingDeg = origin
      ? Math.atan2(origin.z - pos.z, origin.x - pos.x) * (180 / Math.PI) : 135;
    const dockRadius = C.radius;
    const collisionRadius = dockRadius * 0.46;
    const e = this.helpers.spawnEntity({ type: 'station', team: 0, factionId: 'faction_mts', pos: this._pos(),
      radius: collisionRadius, visualRadius: dockRadius, mass: 1e6,
      hull: 1000000, hullMax: 1000000, collides: true, flags: { persistent: true },
      data: { stationId: C.stationId, stationTypeId: 'trade_hub', borrowedSunCarrierId: C.carrierId,
        persistenceOwner: C.owner, homeSectorId: this._berth().sectorId, sectorId: this._berth().sectorId,
        name: 'The Borrowed Sun', services: [...C.services], size: 'L',
        archetypeGlb: CARRIER_ARCHETYPE, placeTargetRadius: dockRadius,
        factionId: 'faction_mts', placeScale: dockRadius / 14, renderScale: 1,
        dockRadius, collisionRadius, collisionProxy: 'station_ring_hub', corridorBearingDeg,
        landmark: true, scannable: true, chartNote: 'Nemi’s visiting market. Reflectors are outside its service approach.' } });
    if (!e) { budget.release(C.carrierId); return; }
    budget.bindEntity(e.id, C.carrierId); this._binding = { entity: e, life: e.occupantGeneration };
    const stations = this.state.world?.activeSector?.stations;
    if (Array.isArray(stations) && !stations.some(s => s.stationId === C.stationId))
      stations.push({ id: e.id, stationId: C.stationId, pos: { ...e.pos } });
    this.ctx.registry?.get('economy')?.ensureStationMarkets(C.stationId);
  },
  _retire() {
    const e = this._find(); this._retiring = true;
    try { if (e) this.helpers.removeEntity(e.id); } finally { this._retiring = false; }
    const stations = this.state.world?.activeSector?.stations;
    if (Array.isArray(stations)) for (let i = stations.length - 1; i >= 0; i--)
      if (stations[i].stationId === C.stationId) stations.splice(i, 1);
    this._retireAssets(); // the sails fold, the collectors stand down — the ledger remains
    this.helpers.spawnBudget?.release(C.carrierId); this._binding = null;
  },
  _phase(phase, duration = null) {
    const r = this._row; r.phase = phase; r.phaseStartTick = this.state.tick;
    r.deadlineTick = duration == null ? null : this.state.tick + duration;
    this.bus.emit('borrowedSun:phase', { carrierId: r.carrierId, visitId: r.visitId, phase, atTick: this.state.tick });
    this._onPhaseEdge(phase);
  },
  _notice(closing = false) {
    const r = this._row, key = closing ? 'closingNoticeVisit' : 'arrivalNoticeVisit';
    if (r[key] === r.visitId) return; r[key] = r.visitId;
    this.bus.emit('toast', { text: closing
      ? 'NEMI · BORROWED SUN — We are packing slowly. Finish your business; no one is racing the door.'
      : `NEMI · BORROWED SUN — Taking ${this._berth().name}. Bring something worth a conversation. Hail the carrier for its berth.`,
      kind: 'info', ttl: 7 });
    this.bus.emit('borrowedSun:notice', this.readout());
  },
  serviceStatus({ docking = false } = {}) {
    const r = this._row, entity = this._find();
    if (!this._adventureContextAllowed()) return { ok: false, reason: 'wrong_context',
      text: 'BORROWED SUN — this carrier serves ordinary Adventure flights.' };
    if (this._restoring || !entity || !this._native(entity) || r.lost)
      return { ok: false, reason: 'carrier_unavailable', text: 'BORROWED SUN — service awaits its current physical berth.' };
    // The ledger holds before the door opens: an open note suspends service,
    // never docking — a debtor may still pull alongside and face the book.
    if (!docking && this._bookHold())
      return { ok: false, reason: 'ledger_hold', debt: { ...ensureSunBook(this.state).debt },
        text: 'NEMI — The ledger is open. Settle what the glass says you owe; the light keeps no grudge, only numbers.' };
    if (r.phase === 'open' || (!docking && r.phase === 'close_pending' && this._docked())) return { ok: true };
    return { ok: false, reason: 'carrier_closed', text: r.phase === 'close_pending'
      ? 'NEMI — Finishing current visits. Next safe berth remains on our chart.'
      : 'NEMI — The service approach is closed while we deploy or fold. Ordinary ports still trade.' };
  },
  _trade(p) {
    if (!this._adventureContextAllowed() || this._restoring || p?.stationId !== C.stationId || !this._docked() || !p.receiptId
      || !(p.qty > 0) || !['buy', 'sell'].includes(p.side)) return;
    // The receipt is the economy's own proof of a finished trade — the book fills
    // on it under the docked gate; the strict native-berth gate stays for lastTrade.
    if (this.serviceStatus().ok) {
      this._row.lastTrade = { receiptId: String(p.receiptId), commodityId: p.commodityId,
        qty: p.qty, side: p.side, visitId: this._row.visitId };
    }
    this._fillTrade(p); // shadow lots and the tithe charter read real receipts
  },
  readout() {
    const r = this._row, berth = this._berth(), next = BERTHS[(r.itineraryLeg + 1) % BERTHS.length];
    const market = this.state.economy?.markets?.[C.stationId] || {};
    const stock = C.showcase.filter(id => market[id]).map(id => ({ id, label: labels.get(id) || id,
      stock: Math.max(0, Math.floor(market[id].stock || 0)) }));
    const hold = this._bookHold(), book = ensureSunBook(this.state);
    const ledger = {
      hold, debt: book.debt ? { ...book.debt } : null,
      standing: sunStanding(this.state),
      openLeases: book.leases.filter(l => l.state === 'open').length,
      maxOpenLeases: SUN_LEASES.maxOpen,
      leaseCostCr: SUN_LEASES.costCr,
      charter: book.charter && book.charter.visitId === r.visitId
        ? { kind: book.charter.kind, state: book.charter.state,
          commodityId: book.charter.commodityId, wantQty: book.charter.wantQty,
          gotQty: book.charter.gotQty, payCr: book.charter.payCr } : null,
      shadowLot: book.shadowLots.find(l => l.state === 'open')
        ? { commodityId: book.shadowLots.find(l => l.state === 'open').commodityId } : null,
      canBuyLease: this._bookOpen() && this._hailing() && !hold
        && book.leases.filter(l => l.state === 'open').length < SUN_LEASES.maxOpen,
      canAcceptCharter: this._bookOpen() && this._hailing() && !hold
        && book.charter?.visitId === r.visitId && book.charter.state === 'posted',
      canSettleDebt: this._hailing() && book.debt?.state === 'open'
        && num(this.state.player?.credits) >= num(book.debt.balance),
    };
    const status = hold ? 'LEDGER HOLD'
      : r.phase === 'close_pending' ? 'FINISHING CURRENT VISITS'
      : this.serviceStatus().ok ? 'MARKET OPEN' : r.lost ? 'CARRIER LOST' : r.phase.toUpperCase();
    const ledgerLine = hold
      ? ` The ledger is open — the book says ${book.debt.balance} cr against your name.` : '';
    return { carrierId: C.carrierId, visitId: r.visitId, phase: r.phase,
      serviceAvailable: this.serviceStatus().ok, berth: berth.name, sectorId: berth.sectorId,
      nextBerth: next.name, stock, status, ledger,
      detail: `${stock.map(s => `${s.label}: ${s.stock} units in the ordinary market`).join(' · ') || 'Stock remains in the ordinary market register.'} The light is free. Spare parts use the normal quote. Next berth: ${next.name}.${ledgerLine}`,
      rumor: r.lastTrade ? `Our last accepted business was ${r.lastTrade.side === 'buy' ? 'outgoing' : 'incoming'} ${r.lastTrade.qty} units of ${labels.get(r.lastTrade.commodityId) || r.lastTrade.commodityId}. Same ship, different cargo.`
        : 'No accepted trade has been recorded on this visit. We prefer being found.' };
  },
  offer() {
    const e = this._find(), p = this._player();
    if (!this._adventureContextAllowed() || this._restoring || this.state.mode !== 'flight' || !p || !e
      || this.state.player.targetId !== e.id || distance(p.pos, e.pos) > C.hailRange) return false;
    this.bus.emit('borrowedSun:offer', this.readout()); return true;
  },
  plotBerth() {
    if (this._row.lost) return false;
    this.bus.emit('ui:setCourse', { pos: this._pos(), sectorId: this._berth().sectorId,
      label: `Borrowed Sun · ${this._berth().name}`, waypointKind: 'station', autopilot: false }); return true;
  },
  _lost(id, entity) {
    if (this._restoring || this._retiring || this._row.lost) return;
    const bound = this._binding;
    if (!bound || id !== bound.entity.id || entity && entity !== bound.entity
      || bound.entity.occupantGeneration !== bound.life || bound.entity.alive && bound.entity.hull > 0) return;
    this._row.lost = true; this._phase('lost'); this.helpers.spawnBudget?.release(C.carrierId);
    this._binding = null; this.bus.emit('borrowedSun:lost', { carrierId: C.carrierId, visitId: this._row.visitId });
  },

  // ══ THE LENDER'S BOOK — light leases, the shadow market, the debt note ══════

  _book() { return ensureSunBook(this.state); },
  _bookHold() { return ensureSunBook(this.state).debt?.state === 'open'; },
  /** The counter is staffed: carrier bound, phase open, visit live, not mid-restore. */
  _bookOpen() {
    return this._adventureContextAllowed() && !this._restoring && !this._row.lost
      && this._row.phase === 'open' && !!this._find();
  },
  /** The player can do business over the hail channel: docked, or inside hail range. */
  _hailing() {
    if (!this._adventureContextAllowed()) return false;
    const p = this._player(), e = this._find();
    if (!p || !e) return false;
    return this._docked() || distance(p.pos, e.pos) <= C.hailRange;
  },
  _grant(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:grantCredits', { amount: n, reason });
  },
  _rep(state, delta, reason) {
    const d = num(delta);
    if (!Number.isFinite(d) || d === 0) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },
  /** Once-only stamp for money/rep side-effects keyed by a content id. Latch before emit. */
  _paidOnce(b, key) {
    if (!isObj(b.paid)) b.paid = {};
    if (b.paid[key] != null) return false;
    b.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(b.paid);
    for (let i = 0; i <= keys.length - PAID_STAMPS_CAP; i++) delete b.paid[keys[i]];
    return true;
  },
  /** A finished piece of ledger work: count it, raise regard when the tier crosses. */
  _deed(state, kind, refId) {
    const b = this._book();
    b.deeds = (b.deeds | 0) + 1;
    const row = sunTierFor(b.deeds);
    this.bus.emit('borrowedSun:deed', { kind, ref: refId ?? null, deeds: b.deeds, tier: row.tier, tick: state.tick });
    if (row.tier > (b.tier | 0)) {
      b.tier = row.tier;
      this.bus.emit('borrowedSun:regard', { tier: row.tier, id: row.id, label: row.label, deeds: b.deeds, tick: state.tick });
      this.bus.emit('toast', { text: `NEMI — ${row.label.toUpperCase()}`, kind: 'good', ttl: 4 });
      this._fileRecord(state, 'regard', row.line);
    }
  },
  _tierMult(b) { return sunTierFor(b.deeds).payMult; },
  _log(state, text) {
    if (typeof text !== 'string' || !text) return;
    this.bus.emit('comms:log', { text, speaker: 'Nemi · Borrowed Sun' });
  },
  /** File a ledger line — the book's own record strip. Bounded. */
  _fileRecord(state, kind, detail) {
    const b = this._book();
    const rec = { id: `R${b.seq++}`, kind, detail: detail ?? null, at: num(state.simTime) };
    b.records.push(rec);
    while (b.records.length > 24) b.records.shift();
    this.bus.emit('borrowedSun:record', { recordId: rec.id, kind, tick: state.tick });
    return rec;
  },
  /** Exact-payment request: a refusal must cost nothing. requireFull + commit = the
   *  NXB-009 envelope — the charge only lands if the sole writer validates the balance. */
  _chargeExact(state, amount, reason, commit) {
    const charge = { amount: Math.round(amount), reason, requireFull: true,
      expectedCredits: Math.max(0, Math.round(num(state.player?.credits))), commit };
    this.bus.emit('economy:chargeCredits', charge);
    return charge.result === true;
  },
  _onPhaseEdge(phase) {
    const state = this.state;
    if (phase === 'open') {
      this._postCharter(state);
      const b = this._book();
      if (!(b.nextShadowAt > 0)
      // A far-future clock in a hand-cut book would starve the market across
      // every visit — the posted window is never further than period+jitter+ttl
      // out, so a bigger gap is not a genuine schedule and the visit reseeds.
      || b.nextShadowAt > num(state.simTime) + SUN_SHADOW.periodS + SUN_SHADOW.jitterS + SUN_SHADOW.ttlS)
      b.nextShadowAt = num(state.simTime) + SUN_SHADOW.firstLotS + frac('sun-shadow-first', this._row.visitId) * SUN_SHADOW.jitterS;
    } else if (phase === 'fold' || phase === 'transit' || phase === 'lost') {
      this._resolveCharter(state, phase === 'fold' || phase === 'transit' ? 'visit_end' : 'carrier_lost');
      this._closeLeasesForVisit(state, phase === 'lost' ? 'void' : 'curtailed');
      this._closeShadowForVisit(state, phase === 'lost' ? 'void' : 'lapsed');
      if (phase === 'lost') this._retireAssets(); else this._retireMirrors(state);
      this._retireCollectors(state, phase === 'lost' ? 'carrier_lost' : 'folded');
      this._retirePod(state);
    }
  },

  // ── Mirror array: sails on the ring ──────────────────────────────────────────

  _ringRadius() { return C.radius + SUN_MIRRORS.ringGap; },
  _mirrorAngle(visitId, slot, at) {
    const base = frac('sun-ring', visitId) * TAU + (slot / SUN_MIRRORS.count) * TAU;
    return base + num(at) * SUN_MIRRORS.precessRadPerS;
  },
  /** The live body behind a mirror row — id + generation + tag, or it is not the sail. */
  _mirrorEnt(row) {
    if (!row || row.entityId == null) return null;
    const e = this.state.entities.get(row.entityId);
    if (!e || e.alive === false) return null;
    if (row.gen != null && e.occupantGeneration !== row.gen) return null;
    if (e.data?.sunMirror !== true || e.data?.sunMirrorSlot !== row.slot
      || e.data?.borrowedSunCarrierId !== C.carrierId || e.data?.sunMirrorVisit !== row.visitId) return null;
    return e;
  },
  _tickMirrors(state, carrier) {
    const b = this._book(), visitId = this._row.visitId;
    // Rows from a dead visit are stale history: left in place they crowd the
    // bounded array ahead of this visit's rows, and the normalize slice can
    // drop freshly bound rows — orphaning live sails nothing ever sweeps.
    this._retireMirrors(state, row => row.visitId !== visitId);
    // A tagged body no live row binds is dead evidence — a row dropped by the
    // dedupe or the bounded slice can leave a real sail nothing rides, and it
    // would hold its spawn-budget binding and its ring silhouette forever.
    // Every retire path is row-driven, so the entity side is swept here.
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.sunMirror !== true
        || e.data?.persistenceOwner !== C.owner) continue;
      const bound = b.mirrors.some(m => m.entityId === e.id
        && m.slot === e.data.sunMirrorSlot && m.visitId === e.data.sunMirrorVisit
        && (m.gen == null || m.gen === e.occupantGeneration));
      if (!bound) this.helpers.removeEntity(e.id, { reason: 'sun_sail_orphaned' });
    }
    const active = this._row.phase === 'open' || this._row.phase === 'close_pending';
    if (!carrier || !active) {
      if (!carrier) this._retireMirrors(state);
      return;
    }
    // Rows for this visit — one per slot.
    for (let slot = 0; slot < SUN_MIRRORS.count; slot++) {
      let row = b.mirrors.find(m => m.slot === slot && m.visitId === visitId);
      if (!row) {
        row = { slot, entityId: null, gen: null, visitId, state: 'live', lostAt: 0, respawnAt: 0 };
        b.mirrors.push(row);
      }
      const live = this._mirrorEnt(row);
      if (row.state === 'live' && !live) {
        // No bound body: spawn one — unless the sail was just broken and is re-printing.
        if (row.entityId == null || num(state.simTime) >= num(row.respawnAt)) {
          const e = this._spawnMirror(state, carrier, row);
          if (!e) continue;
          // Latch the binding before the announce — a listener that kills the
          // sail inside its own sailDeployed emit files on the row, not a corpse.
          row.entityId = e.id; row.gen = e.occupantGeneration ?? null;
          this.bus.emit('borrowedSun:sailDeployed', { visitId: row.visitId, slot: row.slot,
            entityId: e.id, tick: state.tick });
        }
      } else if (row.state === 'lost' && num(state.simTime) >= num(row.respawnAt)) {
        row.state = 'live'; row.entityId = null; row.gen = null;
      }
      const e = this._mirrorEnt(row);
      if (!e) continue;
      // Kinematic ride: the sail holds its ring slot (the welded-object rule —
      // position authority, never an impulse on a bound prop).
      const ang = this._mirrorAngle(visitId, row.slot, state.simTime);
      const ringR = this._ringRadius();
      e.pos.x = carrier.pos.x + Math.cos(ang) * ringR;
      e.pos.z = carrier.pos.z + Math.sin(ang) * ringR;
      e.vel.x = 0; e.vel.z = 0; e.rot = ang + Math.PI / 2;
    }
    this._tickWash(state, carrier);
  },
  _spawnMirror(state, carrier, row) {
    const budget = this.helpers.spawnBudget;
    if (budget && budget.request(1, 'borrowed_sun:sails') !== 1) return null;
    const ang = this._mirrorAngle(row.visitId, row.slot, state.simTime);
    const ringR = this._ringRadius();
    const e = this.helpers.spawnEntity({
      type: 'drone', team: 0, factionId: FACTION_ID,
      pos: { x: carrier.pos.x + Math.cos(ang) * ringR, z: carrier.pos.z + Math.sin(ang) * ringR },
      vel: { x: 0, z: 0 }, rot: ang + Math.PI / 2,
      radius: SUN_MIRRORS.radius, mass: SUN_MIRRORS.mass,
      hull: SUN_MIRRORS.hull, hullMax: SUN_MIRRORS.hull, collides: true,
      data: { sunMirror: true, sunMirrorSlot: row.slot, sunMirrorVisit: row.visitId,
        borrowedSunCarrierId: C.carrierId, persistenceOwner: C.owner,
        name: 'Reflector sail', scanLabel: 'BORROWED SUN · reflector sail — keep clear of the wash',
        sectorId: this._berth().sectorId },
    });
    if (!e) { if (budget) budget.releaseSome('borrowed_sun:sails', 1); return null; }
    if (budget) budget.bindEntity(e.id, 'borrowed_sun:sails');
    return e;
  },
  /** The sail-ring wash: crossing the band takes a solar-wind shove. Physics
   *  enters ONLY through queuePhysicsImpulse, throttled per ship per beat. */
  _tickWash(state, carrier) {
    const b = this._book(), ringR = this._ringRadius(), now = num(state.simTime);
    const liveMirrors = b.mirrors.filter(m => m.state === 'live' && this._mirrorEnt(m));
    if (!liveMirrors.length) return;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e === carrier || e.data?.sunMirror === true) continue;
      if (!['ship', 'drone', 'payload', 'wreck'].includes(e.type)) continue;
      const d = distance(e.pos, carrier.pos);
      if (Math.abs(d - ringR) > SUN_MIRRORS.washPad + Math.max(0, e.radius || 0)) continue;
      if (now - num(e.data?.sunWashAt, -Infinity) < SUN_MIRRORS.washBeatS) continue;
      const dx = e.pos.x - carrier.pos.x, dz = e.pos.z - carrier.pos.z;
      const len = Math.hypot(dx, dz) || 1, mass = Math.max(1, num(e.mass, 1));
      const impulse = { x: (dx / len) * SUN_MIRRORS.washPushSpeed * mass,
        z: (dz / len) * SUN_MIRRORS.washPushSpeed * mass };
      (e.data || (e.data = {})).sunWashAt = now; // throttle stamp rides the body

      queuePhysicsImpulse(e, impulse, { tick: state.tick, provenance: 'borrowed_sun_wash' });
      this.bus.emit('borrowedSun:wash', { entityId: e.id, carrierId: C.carrierId,
        impulse: { x: Math.round(impulse.x), z: Math.round(impulse.z) }, tick: state.tick });
      if (e.id === state.playerId && b.washNoticeVisit !== this._row.visitId) {
        b.washNoticeVisit = this._row.visitId;
        this.bus.emit('toast', { text: 'NEMI — The sails burn. Keep clear of the glass ring.',
          kind: 'warn', ttl: 5 });
      }
    }
  },
  _retireMirrors(state, pred = null) {
    const b = this._book();
    // Stowed sails are dead rows — splice them out so the slot can print fresh
    // sail rows on the next visit without crowding the bounded collection.
    for (let i = b.mirrors.length - 1; i >= 0; i--) {
      const row = b.mirrors[i];
      if (pred && !pred(row)) continue;
      const e = row.entityId != null ? state.entities.get(row.entityId) : null;
      if (e && e.alive !== false && (row.gen == null || e.occupantGeneration === row.gen)
        && e.data?.sunMirror === true && e.data?.sunMirrorVisit === row.visitId
        && e.data?.sunMirrorSlot === row.slot)
        this.helpers.removeEntity(e.id, { reason: 'sun_sail_stowed' });
      b.mirrors.splice(i, 1);
    }
  },

  // ── Glass: a broken sail throws shards into the lane ─────────────────────────
  _spawnGlass(state, pos) {
    for (let i = 0; i < SUN_MIRRORS.shardCount; i++) {
      const a = frac('sun-glass', pos.x, pos.z, i, state.tick) * TAU;
      this.helpers.spawnEntity({
        type: 'payload', team: 0,
        pos: { x: pos.x, z: pos.z },
        vel: { x: Math.cos(a) * SUN_MIRRORS.shardSpeed, z: Math.sin(a) * SUN_MIRRORS.shardSpeed },
        radius: 4, mass: 6, hull: 10, hullMax: 10, collides: true,
        data: { sunGlass: { visitId: this._row.visitId, expiresAt: num(state.simTime) + SUN_MIRRORS.shardTtlS },
          persistenceOwner: C.owner, name: 'Mirror glass', scanLabel: 'Broken reflector glass — avoid' },
      });
    }
  },
  _tickGlass(state) {
    const now = num(state.simTime);
    for (const e of state.entityList) {
      const g = e && e.data && e.data.sunGlass;
      if (!g || e.alive === false) continue;
      if (now >= num(g.expiresAt)) this.helpers.removeEntity(e.id, { reason: 'sun_glass_swept' });
    }
  },

  // ── Light leases: a paper share of collected light ───────────────────────────

  /** Buy a light lease over the hail channel. Returns the lease row or null. */
  buyLease() {
    const state = this.state, b = this._book();
    if (!this._bookOpen() || !this._hailing()) return null;
    if (this._bookHold()) return null; // the ledger writes no new paper while a note is open
    if (b.leases.filter(l => l.state === 'open').length >= SUN_LEASES.maxOpen) return null;
    const cost = SUN_LEASES.costCr;
    const lease = { id: `ls:${this._row.visitId}:${b.seq++}`, visitId: this._row.visitId, costCr: cost,
      beatsTotal: SUN_LEASES.beats, beatsPaid: 0, beatsMissed: 0,
      nextBeatAt: num(state.simTime) + SUN_LEASES.beatEveryS, state: 'open', openedAt: num(state.simTime) };
    // Latch before emit: the row exists only if the exact charge lands.
    if (!this._chargeExact(state, cost, `sun_lease:${lease.id}`, () => { b.leases.push(lease); return true; })) return null;
    this.bus.emit('borrowedSun:leaseSold', { leaseId: lease.id, visitId: lease.visitId,
      costCr: cost, beats: lease.beatsTotal, beatCr: SUN_LEASES.beatCr, tick: state.tick });
    this._rep(state, SUN_LEASES.repBought, 'sun_lease_bought');
    this._fileRecord(state, 'lease_sold', `Light paper written — ${cost} cr face, ${lease.beatsTotal} beats`);
    this._log(state, `Paper written. Stay in the light — beats collect while the sails are out.`);
    return lease;
  },
  _tickLeases(state, carrier) {
    const b = this._book();
    const open = b.leases.filter(l => l.state === 'open');
    if (!open.length) return;
    const p = this._player(), now = num(state.simTime);
    const held = this._bookHold();
    // The light is out while the sails are: 'open' and the close_pending finish
    // both collect; beats stop only when the array folds.
    const collecting = (this._row.phase === 'open' || this._row.phase === 'close_pending')
      && carrier && p && distance(p.pos, carrier.pos) <= SUN_LEASES.collectRadius;
    for (const l of open) {
      if (l.visitId !== this._row.visitId) { this._closeLease(state, l, 'void'); continue; }
      // The ledger holds the paper: a due beat is pinned to now so the grace
      // clock never runs while the book is held — beats wait, they do not burn.
      if (held) { if (now >= num(l.nextBeatAt)) l.nextBeatAt = now; continue; }
      while (l.state === 'open' && now >= num(l.nextBeatAt)) {
        if (now >= num(l.nextBeatAt) + SUN_LEASES.missGraceS) {
          l.beatsMissed += 1; // overdue past grace — light uncollected is light spent
        } else if (collecting) {
          l.beatsPaid += 1;
          const pay = Math.round(SUN_LEASES.beatCr * this._tierMult(b));
          // The beat counter IS the latch: stamped before the grant emits.
          this._grant(state, pay, `sun_lease:${l.id}:${l.beatsPaid}`);
          b.stats.lumensPaid += pay;
          this.bus.emit('borrowedSun:leaseBeat', { leaseId: l.id, beat: l.beatsPaid,
            beatsTotal: l.beatsTotal, payCr: pay, tick: state.tick });
        } else break; // due, inside grace, out of the light — the beat waits
        l.nextBeatAt = num(l.nextBeatAt) + SUN_LEASES.beatEveryS;
        if (l.beatsPaid + l.beatsMissed >= l.beatsTotal) {
          this._closeLease(state, l, l.beatsPaid >= l.beatsTotal ? 'filled' : 'closed');
          break;
        }
      }
    }
  },
  _closeLease(state, l, how) {
    if (l.state !== 'open') return;
    const b = this._book();
    l.state = how; l.closedAt = num(state.simTime);
    let rebate = 0;
    if (how === 'curtailed') {
      const remaining = Math.max(0, l.beatsTotal - l.beatsPaid - l.beatsMissed);
      rebate = Math.round(remaining * SUN_LEASES.beatCr * SUN_LEASES.curtailFrac);
      if (rebate > 0 && this._paidOnce(b, `lease-curtail:${l.id}`)) {
        // A held book nets the rebate against the open note — the lender is the
        // counterparty on both sides, so no credits move in the debtor's favor
        // while the ledger holds. Only what the note cannot absorb pays out.
        const d = b.debt;
        const applied = d && d.state === 'open' ? Math.min(d.balance, rebate) : 0;
        const excess = rebate - applied;
        if (excess > 0) {
          this._grant(state, excess, `sun_lease_curtail:${l.id}`);
          b.stats.lumensPaid += excess;
        }
        if (applied > 0) {
          d.balance -= applied;
          this._fileRecord(state, 'debt_netted',
            `The fold's rebate nets the note — ${applied} cr (${d.balance} cr held)`);
          if (d.balance <= 0) {
            d.state = 'settled'; d.settledHow = 'net'; d.settledAt = num(state.simTime); // latch before emits
            b.stats.debtsSettled += 1;
            this._rep(state, SUN_DEBT.repSettled, 'sun_debt_settled');
            this._deed(state, 'debt', d.id);
            this.bus.emit('borrowedSun:debtSettled', { debtId: d.id,
              amountCr: applied, how: 'net', tick: state.tick });
            this._retireCollectors(state, 'settled');
          }
        }
      }
    }
    if (how === 'filled') {
      this._rep(state, SUN_LEASES.repFilled, 'sun_lease_filled');
      this._book().stats.leasesDone += 1;
      this._deed(state, 'lease', l.id);
      this._fileRecord(state, 'lease_filled', `The paper paid in full — ${l.beatsPaid} beats collected`);
    } else if (how === 'curtailed') {
      this._fileRecord(state, 'lease_curtailed', `Fold settles the note — ${rebate} cr rebate on uncollected light`);
    } else if (how === 'closed') {
      this._fileRecord(state, 'lease_closed', `The light ran out — ${l.beatsPaid} of ${l.beatsTotal} beats collected`);
    }
    this.bus.emit('borrowedSun:leaseClosed', { leaseId: l.id, visitId: l.visitId,
      how, beatsPaid: l.beatsPaid, rebateCr: rebate, tick: state.tick });
  },
  _closeLeasesForVisit(state, how) {
    for (const l of this._book().leases) {
      if (l.state !== 'open') continue;
      this._closeLease(state, l, how);
    }
  },

  // ── Shadow market: the dark side buys what the light can't grow ──────────────

  _tickShadows(state, carrier) {
    const b = this._book(), now = num(state.simTime);
    if (this._row.phase === 'open' && carrier && now >= num(b.nextShadowAt)) {
      b.nextShadowAt = now + SUN_SHADOW.periodS + frac('sun-shadow-gap', this._row.visitId, b.seq) * SUN_SHADOW.jitterS;
      if (!b.shadowLots.some(l => l.state === 'open')) this._postShadowLot(state);
    }
    for (const lot of b.shadowLots) {
      if (lot.state !== 'open') continue;
      // A lot outlives its visit only in a hand-cut book — it lapses like any
      // other shade that moved on, instead of squatting the open-lot slot.
      if (lot.visitId !== this._row.visitId || now >= num(lot.expiresAt)) {
        lot.state = 'lapsed'; lot.closedAt = now;
        this.bus.emit('borrowedSun:shadowLapsed', { lotId: lot.id, commodityId: lot.commodityId, tick: state.tick });
        this._fileRecord(state, 'shadow_lapsed', `The shade moved on — ${labels.get(lot.commodityId) || lot.commodityId} lot lapsed`);
      }
    }
    this._gcClosed(b.shadowLots, SUN_SHADOW.keepClosed);
  },
  _postShadowLot(state) {
    const b = this._book(), seq = b.seq++;
    const commodityId = SHADOW_POOL[hash32('sun-lot-kind', this._row.visitId, seq) % SHADOW_POOL.length];
    const wantQty = SUN_SHADOW.qtyMin + hash32('sun-lot-qty', this._row.visitId, seq)
      % (SUN_SHADOW.qtyMax - SUN_SHADOW.qtyMin + 1);
    const premiumCr = SUN_SHADOW.premiumMinCr + hash32('sun-lot-pay', this._row.visitId, seq)
      % (SUN_SHADOW.premiumMaxCr - SUN_SHADOW.premiumMinCr + 1);
    const lot = { id: `lot:${this._row.visitId}:${seq}`, visitId: this._row.visitId, commodityId,
      wantQty, gotQty: 0, premiumCr, postedAt: num(state.simTime),
      expiresAt: num(state.simTime) + SUN_SHADOW.ttlS, state: 'open' };
    b.shadowLots.push(lot);
    this.bus.emit('borrowedSun:shadowPosted', { lotId: lot.id, commodityId, wantQty, premiumCr,
      expiresAt: lot.expiresAt, tick: state.tick });
    this._log(state, `The shade is buying — ${wantQty}u ${labels.get(commodityId) || commodityId}, +${premiumCr} cr a unit over the quote. Sell across the counter.`);
    return lot;
  },

  // ── Once-only contracts: one charter per visit ───────────────────────────────

  _postCharter(state) {
    const b = this._book(), visitId = this._row.visitId;
    if (b.charter && b.charter.visitId === visitId) return b.charter; // once per visit — latched
    // A live row left over from a lost or skipped visit is superseded, not kept.
    if (b.charter && (b.charter.state === 'posted' || b.charter.state === 'active'))
      this._voidCharter(state, 'superseded');
    const seq = b.seq++;
    const kind = CHARTER_KINDS[hash32('sun-charter', visitId) % CHARTER_KINDS.length];
    const ch = { id: `ch:${visitId}:${seq}`, visitId, kind, commodityId: null,
      wantQty: 0, gotQty: 0, podId: null, podGen: null,
      payCr: 0, rep: 0, postedAt: num(state.simTime), acceptedAt: null, state: 'posted' };
    if (kind === 'light_tithe') {
      ch.commodityId = SHADOW_POOL[hash32('sun-tithe-kind', visitId, seq) % SHADOW_POOL.length];
      ch.wantQty = SUN_CHARTERS.titheQtyMin
        + hash32('sun-tithe-qty', visitId, seq) % (SUN_CHARTERS.titheQtyMax - SUN_CHARTERS.titheQtyMin + 1);
      ch.payCr = SUN_CHARTERS.tithePayCr; ch.rep = SUN_CHARTERS.titheRep;
    } else if (kind === 'glass_oath') {
      ch.payCr = SUN_CHARTERS.oathPayCr; ch.rep = SUN_CHARTERS.oathRep;
    } else {
      ch.payCr = SUN_CHARTERS.freightPayCr; ch.rep = SUN_CHARTERS.freightRep;
    }
    b.charter = ch;
    this.bus.emit('borrowedSun:contract', { charterId: ch.id, visitId, kind: ch.kind,
      commodityId: ch.commodityId, wantQty: ch.wantQty, payCr: ch.payCr, tick: state.tick });
    this._fileRecord(state, 'charter_posted', this._charterLine(ch));
    return ch;
  },
  _charterLine(ch) {
    if (ch.kind === 'light_tithe')
      return `Charter — a tithe of ${ch.wantQty}u ${labels.get(ch.commodityId) || ch.commodityId} across the counter`;
    if (ch.kind === 'glass_oath') return 'Charter — swear the glass stays whole to the fold';
    return 'Charter — a folded-sail crate to ferry back aboard';
  },
  /** Accept the visit's posted charter — once, over the hail channel. */
  acceptCharter() {
    const state = this.state, b = this._book(), ch = b.charter;
    if (!ch || ch.visitId !== this._row.visitId || ch.state !== 'posted') return false;
    // The ledger writes no new business while a note is open — same hold the
    // counter applies to fresh leases and the shadow market's premium.
    if (!this._bookOpen() || !this._hailing() || this._bookHold()) return false;
    ch.state = 'active'; ch.acceptedAt = num(state.simTime); // latch before emits
    this.bus.emit('borrowedSun:contractAccepted', { charterId: ch.id, kind: ch.kind, tick: state.tick });
    this._log(state, `${this._charterLine(ch)}. Accepted.`);
    if (ch.kind === 'last_light') this._spawnFreightPod(state, ch);
    return true;
  },
  _spawnFreightPod(state, ch) {
    const carrier = this._find();
    if (!carrier || ch.podId != null) return;
    // Outside the delivery reach — the charter is a real ferry, not a doorstep handoff.
    const a = frac('sun-pod', ch.id) * TAU, r = this._ringRadius() + 240;
    const pod = this.helpers.spawnEntity({
      type: 'payload', team: 0, factionId: FACTION_ID,
      pos: { x: carrier.pos.x + Math.cos(a) * r, z: carrier.pos.z + Math.sin(a) * r },
      vel: { x: 0, z: 0 }, radius: 9, mass: 14, hull: 50, hullMax: 50, collides: true,
      data: { sunFreight: ch.id, borrowedSunCarrierId: C.carrierId, persistenceOwner: C.owner,
        name: 'Folded-sail crate', scanLabel: `BORROWED SUN · charter freight — return to the carrier`,
        sectorId: this._berth().sectorId },
    });
    if (!pod) return;
    ch.podId = pod.id; ch.podGen = pod.occupantGeneration ?? null;
    this.bus.emit('borrowedSun:freightPosted', { charterId: ch.id, podId: pod.id, tick: state.tick });
  },
  _podEnt(ch) {
    if (!ch || ch.podId == null) return null;
    const e = this.state.entities.get(ch.podId);
    if (!e || e.alive === false) return null;
    if (ch.podGen != null && e.occupantGeneration !== ch.podGen) return null;
    if (e.data?.sunFreight !== ch.id) return null;
    return e;
  },
  _playerHandled(e) {
    const state = this.state, d = e && e.data;
    if (d && (d.lastThrowerId === state.playerId || d.thrownBy === state.playerId || d.thrownBy === 'player')) return true;
    const pTether = state.player && state.player.tether;
    if (pTether && pTether.active !== false && pTether.targetId === e.id) return true;
    const pEnt = state.entities.get(state.playerId);
    if (pEnt && pEnt.tether && pEnt.tether.active !== false && pEnt.tether.targetId === e.id) return true;
    return false;
  },
  _tickCharter(state, carrier) {
    const ch = this._book().charter;
    if (!ch || ch.visitId !== this._row.visitId || ch.state !== 'active') return;
    if (ch.kind !== 'last_light' || !carrier) return;
    let pod = this._podEnt(ch);
    // A pod lost to a sweep or a restore is a transient — the crate re-prints
    // with the carrier (the sails do the same). Only an entity:killed receipt
    // voids the charter, filed by _sunKilled.
    if (!pod && ch.podId != null) { ch.podId = null; ch.podGen = null; }
    if (!pod) { this._spawnFreightPod(state, ch); pod = this._podEnt(ch); }
    if (!pod) return;
    const reach = SUN_CHARTERS.freightRadius + num(carrier.radius, C.radius);
    if (distance(pod.pos, carrier.pos) <= reach && this._playerHandled(pod))
      this._keepCharter(state, 'delivered');
  },
  _resolveCharter(state, cause) {
    const ch = this._book().charter;
    if (!ch || ch.visitId !== this._row.visitId) return;
    if (ch.state === 'done' || ch.state === 'void') return;
    if (ch.kind === 'glass_oath' && ch.state === 'active') {
      const kept = this._book().lossVisitId !== ch.visitId || this._book().visitLosses === 0;
      if (kept && cause === 'visit_end') { this._keepCharter(state, 'oath_kept'); return; }
    }
    this._voidCharter(state, cause);
  },
  _keepCharter(state, how) {
    const b = this._book(), ch = b.charter;
    if (!ch || ch.state === 'done' || ch.state === 'void') return;
    // The ledger holds payouts while a note is open — the delivery waits, it
    // does not burn (the same hold the tithe charter reads through _fillTrade).
    if (this._bookHold()) return;
    if (!this._paidOnce(b, `charter:${ch.id}`)) return;
    ch.state = 'done'; ch.how = how; ch.closedAt = num(state.simTime); // latch before emits
    if (ch.podId != null) {
      const pod = this._podEnt(ch);
      if (pod) { pod.data.sunFreight = null; this.helpers.removeEntity(pod.id, { reason: 'sun_freight_aboard' }); }
      ch.podId = null; ch.podGen = null;
    }
    const pay = Math.round(ch.payCr * this._tierMult(b));
    this._grant(state, pay, `sun_charter:${ch.id}`);
    this._rep(state, ch.rep, 'sun_charter_kept');
    b.stats.chartersDone += 1;
    this._deed(state, 'charter', ch.id);
    this._fileRecord(state, 'charter_done', `The charter holds — ${how}, ${pay} cr`);
    this.bus.emit('borrowedSun:contractClosed', { charterId: ch.id, kind: ch.kind,
      how: 'done', payCr: pay, tick: state.tick });
    this._log(state, `Charter holds. The ledger pays — ${pay} cr.`);
  },
  _voidCharter(state, cause) {
    const b = this._book(), ch = b.charter;
    if (!ch || ch.state === 'done' || ch.state === 'void') return;
    ch.state = 'void'; ch.cause = cause; ch.closedAt = num(state.simTime);
    if (ch.podId != null) {
      const pod = this._podEnt(ch);
      if (pod) { pod.data.sunFreight = null; this.helpers.removeEntity(pod.id, { reason: 'sun_freight_voided' }); }
      ch.podId = null; ch.podGen = null;
    }
    this._fileRecord(state, 'charter_void', `The charter lapsed — ${cause}`);
    this.bus.emit('borrowedSun:contractClosed', { charterId: ch.id, kind: ch.kind,
      how: 'void', cause, tick: state.tick });
  },

  // ── The debt note: vig, the hold, and the collectors ─────────────────────────

  _postDebt(state, amountCr, cause) {
    const b = this._book();
    const amount = Math.max(1, Math.round(num(amountCr)));
    if (b.debt && b.debt.state === 'open') {
      b.debt.balance += amount;
      b.debt.cause = 'multiple';
    } else {
      b.debt = { id: `debt:${b.seq++}`, postedVisitId: this._row.visitId, cause,
        principal: amount, balance: amount, postedAt: num(state.simTime), vigApplied: 0, state: 'open' };
    }
    const d = b.debt;
    this.bus.emit('borrowedSun:debtPosted', { debtId: d.id, cause, amountCr: amount,
      balance: d.balance, tick: state.tick });
    this._fileRecord(state, 'debt_posted', `${cause} — ${amount} cr onto the book (${d.balance} cr held)`);
    this._log(state, `The ledger opens — ${d.balance} cr against your name. Service holds until the book balances.`);
    return d;
  },
  /** Settle the open note — exact payment over the hail channel. */
  settleSunDebt() {
    const state = this.state, b = this._book(), d = b.debt;
    if (!d || d.state !== 'open' || this._restoring || !this._hailing()) return 0;
    const due = d.balance;
    if (!this._chargeExact(state, due, `sun_debt:${d.id}`, () => true)) return 0;
    d.state = 'settled'; d.settledHow = 'paid'; d.settledAt = num(state.simTime); // latch before emits
    b.stats.debtsSettled += 1;
    this._rep(state, SUN_DEBT.repSettled, 'sun_debt_settled');
    this._deed(state, 'debt', d.id);
    this._fileRecord(state, 'debt_settled', `The book balances — ${due} cr paid`);
    this.bus.emit('borrowedSun:debtSettled', { debtId: d.id, amountCr: due, how: 'paid', tick: state.tick });
    this._log(state, `The book balances. The light forgives; the ledger does not forget.`);
    return due;
  },
  _tickDebt(state, carrier) {
    const b = this._book(), d = b.debt;
    if (!d || d.state !== 'open') { this._retireCollectors(state); return; }
    const now = num(state.simTime);
    // Vig: one growth per crossed period — recomputed from the clock, never twice.
    const periods = Math.floor((now - num(d.postedAt)) / SUN_DEBT.vigPeriodS);
    while (d.vigApplied < periods && d.state === 'open') {
      d.vigApplied += 1;
      const vig = Math.ceil(d.principal * SUN_DEBT.vigFrac);
      d.balance += vig;
      if (this._paidOnce(b, `vig:${d.id}:${d.vigApplied}`)) {
        this._rep(state, SUN_DEBT.repVig, 'sun_debt_vig');
        this.bus.emit('borrowedSun:debtEscalated', { debtId: d.id, vigCr: vig,
          balance: d.balance, vigApplied: d.vigApplied, tick: state.tick });
        this._fileRecord(state, 'debt_vig', `The vig runs — +${vig} cr (${d.balance} cr held)`);
      }
    }
    this._tickCollectors(state, carrier, d);
  },
  _tickCollectors(state, carrier, d) {
    const b = this._book();
    const phase = this._row.phase;
    // Hulls only work while the carrier rides this sector and the light is out.
    // New hulls field while the note is heavy; hulls already out work the note
    // down to zero — a thinning balance recalls no one until the book balances.
    const fielding = carrier && (phase === 'open' || phase === 'close_pending')
      && this.state.world?.currentSectorId === this._berth().sectorId;
    if (!fielding) { if (!carrier) this._retireCollectors(state); return; }
    // Reap rows whose bodies are gone or recycled — generation + tag both bind.
    for (const row of [...b.collectors]) {
      const e = state.entities.get(row.entityId);
      if (!e || e.alive === false || (row.gen != null && e.occupantGeneration !== row.gen)
        || e.data?.sunCollector !== d.id) {
        // A live hull still wearing our ownership marks loses its last ledger
        // handle when the row drops (a fresh note supersedes a settled one, or a
        // hand-cut row names a dead note) — every retire path walks rows, so a
        // row-less hull drifts orphaned forever and holds its budget slot.
        if (e && e.alive !== false && e.data?.sunCollector != null
          && e.data?.persistenceOwner === C.owner)
          this.helpers.removeEntity(e.id, { reason: 'sun_collector_superseded' });
        b.collectors.splice(b.collectors.indexOf(row), 1);
      }
    }
    // Spawn bounded by the deficit at loop entry, not live row count — a kill
    // inside a hull's own announce would otherwise keep refilling the bound.
    const deficit = SUN_COLLECTORS.max - b.collectors.length;
    for (let i = 0; i < deficit && d.state === 'open'
      && d.balance >= SUN_DEBT.collectorAtCr; i++) {
      const e = this._spawnCollector(state, carrier, d);
      if (!e) break;
      // Latch the ledger row before the announce — a hull killed inside its own
      // collectorsOut emit files the fee on the row, never a corpse the reap missed.
      b.collectors.push({ entityId: e.id, gen: e.occupantGeneration ?? null, debtId: d.id });
      this.bus.emit('borrowedSun:collectorsOut', { debtId: d.id, collectorId: e.id, tick: state.tick });
      this._log(state, 'A hull detaches from the array — the ledger sends a collector.');
    }
    const p = this._player(), now = num(state.simTime);
    for (const row of [...b.collectors]) {
      if (d.state !== 'open') return; // a re-entrant settle inside the charge ends the levy
      const e = state.entities.get(row.entityId);
      if (!e || e.alive === false) continue;
      if (!p) continue;
      // Steering: the collector closes. Force enters ONLY through queuePhysicsImpulse.
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const want = Math.min(SUN_COLLECTORS.speed, dist * SUN_COLLECTORS.steerGain);
      const dvx = (dx / dist) * want - num(e.vel?.x), dvz = (dz / dist) * want - num(e.vel?.z);
      const mass = Math.max(1, num(e.mass, 1));
      queuePhysicsImpulse(e, { x: dvx * mass, z: dvz * mass },
        { tick: state.tick, provenance: 'borrowed_sun_collector' });
      if (dist > SUN_COLLECTORS.collectR) continue;
      if (now - num(e.data?.sunLevyAt, -Infinity) < SUN_COLLECTORS.collectBeatS) continue;
      const levy = Math.min(d.balance, Math.max(SUN_COLLECTORS.levyMinCr,
        Math.ceil(d.balance * SUN_COLLECTORS.levyFrac)), SUN_COLLECTORS.levyMaxCr,
        Math.max(0, Math.round(num(state.player?.credits))));
      if (!(levy > 0)) continue; // an empty hold pays no levy — the note stays open
      (e.data || (e.data = {})).sunLevyAt = now; // the beat throttle rides the body, like the wash
      // Latch before emit: the note reads the levy the moment it is taken, so a
      // listener settling inside the charge sees the netted balance — and the
      // debit clamps at zero with amount ≤ credits, so the taken sum is exact.
      d.balance -= levy;
      b.stats.leviesPaid += levy;
      this.bus.emit('economy:chargeCredits', { amount: levy, reason: `sun_levy:${d.id}:${b.seq++}` });
      this.bus.emit('borrowedSun:levy', { debtId: d.id, collectorId: e.id,
        amountCr: levy, balance: d.balance, tick: state.tick });
      this._fileRecord(state, 'levy', `The collector takes — ${levy} cr (${d.balance} cr remaining)`);
      if (d.balance <= 0) {
        d.state = 'settled'; d.settledHow = 'collected'; d.settledAt = now; // latch before emits
        b.stats.debtsSettled += 1;
        this._rep(state, SUN_DEBT.repSettled, 'sun_debt_settled');
        this._deed(state, 'debt', d.id);
        this.bus.emit('borrowedSun:debtSettled', { debtId: d.id, amountCr: levy,
          how: 'collected', tick: state.tick });
        this._retireCollectors(state, 'settled');
        return;
      }
    }
  },
  _spawnCollector(state, carrier, d) {
    const budget = this.helpers.spawnBudget;
    if (budget && budget.request(1, 'borrowed_sun:collectors') !== 1) return null;
    const ang = frac('sun-collector', d.id, state.tick) * TAU;
    const e = this.helpers.spawnEntity({
      type: 'ship', team: 1, factionId: FACTION_ID,
      pos: { x: carrier.pos.x + Math.cos(ang) * (this._ringRadius() + 120),
        z: carrier.pos.z + Math.sin(ang) * (this._ringRadius() + 120) },
      vel: { x: 0, z: 0 }, radius: SUN_COLLECTORS.radius, mass: SUN_COLLECTORS.mass,
      hull: SUN_COLLECTORS.hull, hullMax: SUN_COLLECTORS.hull, collides: true,
      data: { sunCollector: d.id, borrowedSunCarrierId: C.carrierId, persistenceOwner: C.owner,
        name: 'Ledger collector', scanLabel: 'BORROWED SUN · ledger collector — the book wants its due',
        shipRole: 'collector', sectorId: this._berth().sectorId,
        ai: { archetype: 'collector', passive: true } },
    });
    if (!e) { if (budget) budget.releaseSome('borrowed_sun:collectors', 1); return null; }
    if (budget) budget.bindEntity(e.id, 'borrowed_sun:collectors');
    return e;
  },
  _retireCollectors(state, why = 'recalled') {
    const b = this._book();
    for (const row of b.collectors) {
      const e = state.entities.get(row.entityId);
      if (e && e.alive !== false && (row.gen == null || e.occupantGeneration === row.gen)
        && e.data?.sunCollector === row.debtId)
        this.helpers.removeEntity(e.id, { reason: `sun_collector_${why}` });
    }
    b.collectors.length = 0;
    this.helpers.spawnBudget?.release('borrowed_sun:collectors');
  },
  _retirePod(state) {
    const ch = this._book().charter;
    if (ch && ch.podId != null) {
      const pod = this._podEnt(ch);
      if (pod) { pod.data.sunFreight = null; this.helpers.removeEntity(pod.id, { reason: 'sun_freight_folded' }); }
      ch.podId = null; ch.podGen = null;
    }
  },
  /** All book-tagged bodies leave with the carrier: sails, collectors, freight,
   *  glass. The ledger rows remain — the book travels, the bodies do not. */
  _retireAssets() {
    const state = this.state;
    this._retireMirrors(state);
    this._retireCollectors(state, 'retired');
    this._retirePod(state);
    // The row-driven retires only reach bodies a live row binds. Anything still
    // wearing a sun ownership tag after that is dead evidence — a dropped row's
    // orphan — and it leaves with the carrier all the same.
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.persistenceOwner !== C.owner) continue;
      if (e.data.sunMirror === true || e.data.sunCollector != null
        || e.data.sunFreight != null || e.data.sunGlass)
        this.helpers.removeEntity(e.id, { reason: 'sun_asset_folded' });
    }
    this.helpers.spawnBudget?.release('borrowed_sun:sails');
  },
  _closeShadowForVisit(state, how) {
    for (const lot of this._book().shadowLots) {
      if (lot.state !== 'open') continue;
      lot.state = how; lot.closedAt = num(state.simTime);
      this.bus.emit('borrowedSun:shadowLapsed', { lotId: lot.id, commodityId: lot.commodityId,
        cause: how, tick: state.tick });
    }
  },
  /** Real receipts fill the book — shadow lots and the tithe charter. The
   *  receipt id is the once-only latch: one receipt, one count. */
  _fillTrade(p) {
    const state = this.state, b = this._book();
    if (p.side !== 'sell' || this._bookHold()) return;
    const key = `rcpt:${String(p.receiptId)}`;
    if (!this._paidOnce(b, key)) return;
    const qty = Math.max(0, Math.floor(num(p.qty)));
    if (!(qty > 0)) return;
    for (const lot of b.shadowLots) {
      if (lot.state !== 'open' || lot.visitId !== this._row.visitId
        || lot.commodityId !== p.commodityId) continue;
      lot.gotQty += qty;
      this.bus.emit('borrowedSun:shadowProgress', { lotId: lot.id, gotQty: lot.gotQty,
        wantQty: lot.wantQty, tick: state.tick });
      if (lot.gotQty >= lot.wantQty) {
        lot.state = 'filled'; lot.closedAt = num(state.simTime);
        const pay = Math.round(lot.wantQty * lot.premiumCr * this._tierMult(b));
        this._grant(state, pay, `sun_shadow:${lot.id}`);
        this._rep(state, SUN_SHADOW.repFill, 'sun_shadow_filled');
        b.stats.shadowFilled += 1;
        this._deed(state, 'shadow', lot.id);
        this._fileRecord(state, 'shadow_filled',
          `The shade pays — ${lot.wantQty}u ${labels.get(lot.commodityId) || lot.commodityId}, +${pay} cr premium`);
        this.bus.emit('borrowedSun:shadowFilled', { lotId: lot.id, commodityId: lot.commodityId,
          qty: lot.gotQty, payCr: pay, tick: state.tick });
      }
      break; // one receipt, one lot
    }
    const ch = b.charter;
    if (ch && ch.visitId === this._row.visitId && ch.state === 'active'
      && ch.kind === 'light_tithe' && ch.commodityId === p.commodityId) {
      ch.gotQty += qty;
      if (ch.gotQty >= ch.wantQty) this._keepCharter(state, 'tithe_paid');
    }
  },

  // ── The kill wire: broken sails, dead collectors, lost freight ───────────────

  _sunKilled(p) {
    const state = this.state;
    if (this._restoring || !p) return;
    // Kill receipts name the victim as id, targetId or entityId — the same
    // envelope _lost accepts for the carrier. A shape this misses would let a
    // broken sail skip the note, the glass and the re-print delay entirely.
    const id = p.targetId ?? p.entityId ?? p.id ?? p.entity?.id;
    if (id == null) return;
    const b = this._book();
    // The corpse can be gone from the map by the time its receipt lands — the
    // destroy path removes the body before the queued event flushes, so the
    // envelope's entity ref is the second lookup, same as _assetDestroyed.
    const victim = p.entity || state.entities.get(id), vd = victim && victim.data;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    // A sail broke — the tag rides the body, so a recycled id files nothing.
    const row = vd?.sunMirror === true
      ? b.mirrors.find(m => m.entityId === id && m.state !== 'stowed'
          && (m.gen == null || m.gen === victim.occupantGeneration)
          && m.visitId === vd.sunMirrorVisit && m.slot === vd.sunMirrorSlot)
      : null;
    if (row && row.state === 'live') {
      row.state = 'lost'; row.lostAt = num(state.simTime);
      row.respawnAt = num(state.simTime) + SUN_MIRRORS.respawnS;
      if (b.lossVisitId !== this._row.visitId) { b.lossVisitId = this._row.visitId; b.visitLosses = 0; }
      b.visitLosses += 1;
      b.stats.mirrorsLost += 1;
      this._spawnGlass(state, { x: victim.pos.x, z: victim.pos.z });
      this.bus.emit('borrowedSun:sailLost', { visitId: row.visitId, slot: row.slot,
        entityId: id, killerId: p.killerId ?? null, byPlayer, tick: state.tick });
      this._fileRecord(state, 'mirror_lost', `Sail ${row.slot} broke${byPlayer ? ' — the pilot\'s name goes in the book' : ''}`);
      if (byPlayer) {
        this._postDebt(state, SUN_MIRRORS.costCr, 'mirror_broken');
        this._rep(state, SUN_MIRRORS.repBroke, 'sun_mirror_broken');
        this._log(state, 'You broke the glass. The book keeps a price on it.');
      }
      return;
    }
    // A collector hull died — the row closes, the fee lands on the note.
    const colRow = vd?.sunCollector != null
      ? b.collectors.find(r => r.entityId === id && r.debtId === vd.sunCollector
          && (r.gen == null || r.gen === victim.occupantGeneration))
      : null;
    if (colRow) {
      b.collectors.splice(b.collectors.indexOf(colRow), 1);
      this._fileRecord(state, 'collector_killed', 'A collector hull cooled');
      if (byPlayer) {
        this._rep(state, SUN_DEBT.repCollectorKilled, 'sun_collector_killed');
        const d = b.debt;
        if (d && d.state === 'open' && this._paidOnce(b, `colkill:${id}:${victim.occupantGeneration ?? 0}`)) {
          d.balance += SUN_DEBT.collectorKillFeeCr;
          this.bus.emit('borrowedSun:debtEscalated', { debtId: d.id, vigCr: SUN_DEBT.collectorKillFeeCr,
            balance: d.balance, cause: 'collector_killed', tick: state.tick });
        }
      }
      return;
    }
    // The charter freight died — the contract is void.
    const ch = b.charter;
    if (ch && ch.state === 'active' && ch.podId === id && vd?.sunFreight === ch.id)
      this._voidCharter(state, 'pod_lost');
  },
  _assetDestroyed(p) {
    const state = this.state;
    if (this._restoring || !p) return;
    const id = p.targetId ?? p.entityId ?? p.id ?? p.entity?.id;
    if (id == null) return;
    const b = this._book();
    // Despawn-side cleanup: a body removed without a kill still drops its rows.
    const victim = p.entity || state.entities.get(id);
    const vd = victim && victim.data;
    if (vd?.sunMirror === true) {
      const row = b.mirrors.find(m => m.entityId === id && m.state === 'live');
      if (row && row.gen === victim.occupantGeneration) { row.entityId = null; row.gen = null; }
    }
    for (const row of [...b.collectors]) {
      if (row.entityId !== id) continue;
      if (victim && row.gen != null && victim.occupantGeneration !== row.gen) continue;
      b.collectors.splice(b.collectors.indexOf(row), 1);
    }
  },
  _gcClosed(rows, keepClosed) {
    let closed = 0;
    for (const r of rows) if (r && r.state !== 'open') closed++;
    let excess = closed - keepClosed;
    if (excess <= 0) return;
    for (let i = 0; i < rows.length && excess > 0; i++) {
      const r = rows[i];
      if (r && r.state !== 'open') { rows.splice(i, 1); i--; excess--; }
    }
  },
  _tickBook(state, dt, carrier) {
    this._tickMirrors(state, carrier);
    this._tickGlass(state);
    this._tickLeases(state, carrier);
    this._tickShadows(state, carrier);
    this._tickCharter(state, carrier);
    this._tickDebt(state, carrier);
  },

  update(dt, state) {
    if (this._lastTick === state.tick) return; this._lastTick = state.tick;
    if (this._restoring || state.mode !== 'flight' || !this._adventureContextAllowed() || this._row.lost) return;
    const bound = this._binding;
    if (bound && (!bound.entity.alive || bound.entity.hull <= 0)) this._lost(bound.entity.id, bound.entity);
    const r = this._row; if (r.lost) return;
    // Eviction is not destruction; restore the same stationary visit on return.
    if (bound && state.entities.get(bound.entity.id) !== bound.entity) { this._binding = null; this.helpers.spawnBudget?.release(C.carrierId); }
    if (r.phase === 'transit') {
      if (state.tick >= r.deadlineTick) { r.itineraryLeg = (r.itineraryLeg + 1) % BERTHS.length;
        r.visitId++; this._registerProfile(); this._phase('arrive'); }
      return;
    }
    this._materialize(); const e = this._find();
    if (e) e.data.borrowedSunVisit = { visitId: r.visitId, phase: r.phase, phaseStartTick: r.phaseStartTick };
    if (this._docked()) r.firstServiceVisit = true;
    this._tickBook(state, dt, e);
    // The visit calendar is sector-owned, not a side effect of local physics residency. A fixed
    // station may be correctly shelved outside the current activity reach; waiting for its native
    // Rapier record here deadlocks `arrive` until the player happens to fly near it. Service and
    // docking still require `_native` through serviceStatus — only the remote phase clock advances.
    if (r.phase === 'arrive' && e) { r.introduced = true; this._phase('deploy', C.deployTicks); this._notice(); }
    else if (r.phase === 'deploy' && state.tick >= r.deadlineTick && e) this._phase('open', C.openTicks);
    else if (r.phase === 'open' && r.firstServiceVisit && state.tick >= r.deadlineTick) { this._phase('close_pending'); this._notice(true); }
    else if (r.phase === 'close_pending' && !this._busy()) this._phase('fold', C.foldTicks);
    else if (r.phase === 'fold' && state.tick >= r.deadlineTick && !this._busy()) { this._retire(); this._phase('transit', C.transitTicks); }
  },
  serialize() {
    const out = clone(this._row);
    out.book = clone(ensureSunBook(this.state)); // the lender's ledger rides the same envelope
    return out;
  },
  deserialize(raw) {
    this._row = normalizeBorrowedSun(raw, this.state.tick); this._binding = null;
    this._lastTick = -1; this._restoreSerial++;
    this.state[SUN_BOOK_KEY] = ensureSunBook({ [SUN_BOOK_KEY]: raw?.book });
    // Transients re-derive on the next tick — mirrors re-spawn bound, collectors
    // re-field if the note is still open. Restored state grants no free progress.
    this._registerProfile();
  },
  afterContinue() {
    if (this._continuedSerial === this._restoreSerial) { this._restoring = false; return; }
    this._continuedSerial = this._restoreSerial; this._restoring = false; this._binding = null;
    this._lastTick = -1; this._registerProfile();
    const e = this._find();
    if (e) {
      // Older carrier envelopes did not select the authored station builder.
      e.data.archetypeGlb = CARRIER_ARCHETYPE;
      e.data.placeTargetRadius = C.radius;
      if (this.helpers.spawnBudget?.request(1, C.carrierId) === 1)
        this.helpers.spawnBudget.bindEntity(e.id, C.carrierId);
    }
  },
  newGame() { this._retire(); this._row = freshBorrowedSun(); this._binding = null;
    this.state[SUN_BOOK_KEY] = freshSunBook();
    this._lastTick = -1; this._restoring = false; this._registerProfile(); },
  destroy() { for (const off of this._subs) off(); this._subs = [];
    this._retireAssets();
    this.helpers.spawnBudget?.release([C.carrierId, 'borrowed_sun:sails', 'borrowed_sun:collectors']);
    owners.delete(this.state); },
};
