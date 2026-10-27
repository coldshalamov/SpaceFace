// faction_vael.js — W-VAEL (build_map §34.5 row 524, bible 02 §6).
//
// "They didn't modify the workers. They modified the terms of the workers."
// The Vael's contracts bite physically. Done-when:
//   · Override Tender presence — it carries the lien anchor
//   · the Lien Anchor: a contract clamp that adds mass — telegraphed, contract jobs only,
//     and transferable by throwing it (LOG: `LIEN TRANSFERRED: <name> NOW OWES THE VAEL.`)
//   · Page Nine (E-18): mid-job the addendum activates and the clamp lands
//   · script-etched hull text (scan line; page 9 readable at close range)
//   · Override Head: while the Line holds a ship you fire its thrusters
//
// THE LEDGER — the paper layer grown around those bones (same system, same book):
//   · THE BOOK — the player's contract standing: clauses honored vs stains broken.
//     Work pays by paper tier; every settled credit accrues; crossed thresholds
//     pay a punctuality dividend, once each. The ledger turns pages — enough
//     honored clauses forgive a stain. Enough stains and the desk is closed.
//   · INVOICES — a lien released unsettled is not gone, it is refiled: cut loose,
//     destroyed metal, or a dead Vael signature all post an invoice on the pilot's
//     name. Invoices age in stages — a reminder, then a writ.
//   · WRIT CREWS — at stage two a writ tender and its lances come to serve the
//     bill physically: a telegraphed clamp that needs no contract job — the writ
//     supersedes the clause. The served mass is the old metal plus the bill in
//     tonnes. Pay the invoice and the crew is recalled; kill it and the bill
//     stands anyway — you cannot shoot a debt.
//   · PATROLS — courier-and-tender presence in Vael space and wherever a Vael
//     signature stands. They hail by the book's reading of you, stamp the marked
//     on open invoices, run the Reading (a hull read aloud), leave sealed riders
//     for the punctual, and carry page nine at 2pt for whoever gets close.
//   · HAZARD CLAUSES — the desk posts work: haul the crate of fine print to a
//     rider buoy, serve a defaulter (the clamp does the talking), or recover a
//     named debtor's paper. Proximity is a signature — approach and you signed.
//     Honored clauses pay and build the book; broken ones stain it.
//   · NAMED DEBTORS — hulls already clamped, running from their paper. Collect
//     them in front of a Vael witness for the full fee; down them cold for less.
//
// Deterministic: every clock reads simTime; every roll is hash32 over ids/seqs —
// no Math.random, no wall time. Money moves ONLY through economy:grantCredits /
// economy:chargeCredits; standing ONLY through faction:repDelta; force ONLY
// through queuePhysicsImpulse. Latches land before emits. Live bodies are bound
// by id + occupantGeneration + an ownership tag in .data — a recycled entity id
// is never the same signature. All ledger state is plain JSON under state.vael;
// ensureVaelState normalizes in place and save:loaded re-runs it — a restore
// grants nothing for free.

import VAEL_FACTION, {
  VAEL_LIEN,
  VAEL_PAGE_NINE,
  VAEL_OVERRIDE_HEAD,
  VAEL_HULL_SCRIPT,
  VAEL_BARKS,
} from '../data/factions/vael.js';
import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

const FACTION_ID = 'faction_vael';
const TAU = Math.PI * 2;
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)

const VAEL_HOME = new Set(Array.isArray(VAEL_FACTION.homeSectors) ? VAEL_FACTION.homeSectors : []);
const PAID_STAMPS_CAP = 96;

// ── The paper tiers — the player's contract standing with the desk ─────────────
// Clauses honored are the resume; the tier scales every payout the book makes.
export const VAEL_PAPER_TIERS = Object.freeze([
  Object.freeze({ tier: 0, clauses: 0, id: 'unsigned', label: 'Unsigned',
    payMult: 1.0, line: 'Every hull is paper the Vael have not read yet.' }),
  Object.freeze({ tier: 1, clauses: 2, id: 'cosigner', label: 'Co-signer',
    payMult: 1.12, line: 'Your signature clears now. The desk remembers.' }),
  Object.freeze({ tier: 2, clauses: 5, id: 'bonded', label: 'Bonded Party',
    payMult: 1.28, line: 'The Vael underwrite your name — conditionally, in writing.' }),
  Object.freeze({ tier: 3, clauses: 9, id: 'kept', label: 'Kept Party',
    payMult: 1.5, line: 'Kept parties do not read page nine. Page nine reads itself for them.' }),
]);

export function vaelTierFor(clauses) {
  const c = Math.max(0, intOr(clauses));
  let row = VAEL_PAPER_TIERS[0];
  for (const t of VAEL_PAPER_TIERS) if (c >= t.clauses) row = t;
  return row;
}

// ── The ledger tuning — one frozen table so the whole layer tunes together ─────
export const VAEL_LEDGER = Object.freeze({
  // Patrol presence: home space always; elsewhere only where a Vael signature stands.
  firstPatrolS: 20, patrolGapS: 110, patrolMaxLive: 3,
  patrolSpawnR: 1500, patrolOrbitR: 260, patrolSpeed: 26, patrolSteerK: 1.6,
  patrolHailR: 620, patrolOrphanS: 75, patrolLeaveR: 2800,
  readingR: 380, markR: 700, markS: 45,
  hullScriptR: 240, hullScriptCap: 48,
  visitCap: 12,
  // Invoices: the refiled debt.
  invoiceDueS: 120, invoiceRemindGapS: 180, invoiceWritGapS: 300,
  invoiceMaxOpen: 6, invoiceKeepClosed: 8, cutInvoiceFrac: 0.5,
  bloodBillCr: 1600, bloodRep: -8, remindRep: -2, writKillRep: -4,
  invoiceRep: 2, // settled invoices buy back a little paper
  // Writ crews: a tender that serves the bill physically, plus lances that orbit it.
  writSpawnR: 1400, writTtlS: 240, reWritGapS: 420, writMaxLive: 1,
  writTelegraphS: 2.5, writServeR: 320, writStandoffR: 390, writSpeed: 34,
  writSteerK: 2.2, lanceOrbitR: 170, lanceSpeed: 40, writMarkedMult: 1.4,
  // Hazard clauses: the desk's posted work.
  firstClauseS: 26, clauseGapS: 170, clauseMaxOpen: 3, clauseLapseS: 420,
  signedDeadlineS: 240, signR: 520, siteMinR: 1600, siteSpanR: 1400,
  crateMass: 90, crateRadius: 10, deliverR: 280, serveR: 380,
  defaulterSpeed: 30, defaulterFleeR: 900, servedAnchorMass: 35,
  haulPayCr: 520, servePayCr: 640, recoverPayCr: 780, clauseRep: 2, failRep: -2,
  stainsForWork: 3, forgiveEvery: 5,
  // Named debtors: clamped hulls on the run.
  firstDebtorS: 80, debtorGapS: 340, debtorMaxLive: 2, debtorAnchorMass: 40,
  debtorFleeR: 900, debtorSpeed: 32, debtorTtlS: 600,
  debtorCollectCr: 480, debtorWitnessBonus: 1.5, debtorWitnessR: 900,
  // The book: punctuality dividends, the sealed-rider gift, ledger caps.
  giftMinClauses: 3, giftCr: 400, giftR: 900, giftPickupR: 220, giftRep: 2,
  logCap: 24,
  milestones: Object.freeze([
    Object.freeze({ cr: 4000, pay: 250 }),
    Object.freeze({ cr: 15000, pay: 700 }),
    Object.freeze({ cr: 40000, pay: 1600 }),
  ]),
});

const CLAUSE_KINDS = Object.freeze(['haul', 'serve', 'recovery']);
const CLAUSE_OPEN = new Set(['open', 'signed']);

const TENDER_NAMES = Object.freeze([
  'OVERRIDE TENDER VES', 'TENDER NINE OF THE VEIL', 'THE CLAUSE THAT WAITS',
  'OVERRIDE TENDER IO', 'TENDER MIRA, THIRD PAGE', 'THE ANCHOR CLERK',
]);
const COURIER_NAMES = Object.freeze([
  'RESEARCH COURIER LETH', 'THE LONG READER', 'COURIER ODD VOLUME',
  'VEIL COURIER SANN', 'THE QUIET INSTRUMENT', 'COURIER HALF-CLAUSE',
]);
const LANCE_NAMES = Object.freeze([
  'VAEL LANCE SURETY', 'LANCE OF THE NINTH PART', 'VAEL LANCE RIDER',
  'THE WITNESS LANCE', 'LANCE SUB-CLAUSE', 'VAEL LANCE PRIME',
]);
const DEBTOR_NAMES = Object.freeze([
  'HULL-41 IN ARREARS', 'THE MULE THAT SIGNED', 'KESSEL DEBTOR',
  'A NAME IN ARREARS', 'THE UNPAID KESTREL', 'SIGNATORY LAPSED',
]);
const DEFAULTER_NAMES = Object.freeze([
  'DEFAULTER ONE-PAGE', 'THE SKIPPED CLAUSE', 'A HULL UNREAD',
  'DEFAULTER MOTH', 'THE SIXTH CODICIL', 'UNSERVED HULL',
]);

const LEDGER_BARKS = Object.freeze({
  hailClean: 'Your paper is thin. The Vael read it anyway.',
  hailOwed: 'The ledger is open on your name. The desk does not knock twice.',
  hailStained: 'You break signatures for a living. We read hulls, not excuses.',
  hailKept: 'Kept party. The addendum already knows your name.',
  marked: 'The mark is on you. Every tender reads it.',
  invoiceFiled: 'Addendum posted. Terms apply retroactively — they always did.',
  invoiceRemind: 'The Vael do not send second notices. This is the second notice.',
  invoicePaid: 'Settled. The desk invoices your punctuality.',
  invoiceBlood: 'A hull is a signature. Yours is filed.',
  writPosted: 'Page nine walks now.',
  writTelegraph: 'The writ reads itself.',
  writServed: 'Served. The addendum is yours again.',
  writKilled: 'You cannot shoot a debt. The ledger keeps the shape of it.',
  writRecalled: 'The writ stands down. The bill settled elsewhere.',
  clausePosted: 'The desk posts a clause. Proximity is a signature.',
  clauseSigned: 'You approached. That is a signature.',
  clauseDone: 'Clause honored. The Vael pay what the paper says.',
  clauseFailed: 'A broken signature keeps its shape. The ledger keeps it longer.',
  clauseLapsed: 'The offer withdrew itself. Unsigned work is free.',
  debtorPosted: 'A name ran from its paper. Collect it and the Vael pay.',
  debtorCollected: 'Collected. The Vael settle in credit.',
  debtorDowned: 'Scrap settles what paper could not. The desk pays the smaller fee.',
  debtorSkipped: 'The name skipped its paper. The ledger keeps it.',
  debtorTransferred: 'The bill found a newer name. Paperwork follows.',
  milestone: 'The Vael pay their punctual. Dividend enclosed.',
  pageTurns: 'The ledger turns a page. An old stain closes.',
  deskClosed: 'The desk is closed to you. Signatures first, work later.',
  gift: 'The desk leaves a sealed rider for the punctual.',
  giftOpened: 'The rider opens. Inside: terms you already keep.',
  serveClamped: 'LIEN SERVED. The subject reads itself now.',
});

const dropMalformed = (rows, valid) => (rows.some((r) => !valid(r)) ? rows.filter(valid) : rows);
const VALID_INVOICE = (r) => isObj(r) && typeof r.id === 'string';
const VALID_WRIT = (r) => isObj(r) && typeof r.id === 'string' && typeof r.invoiceId === 'string';
const VALID_PATROL = (r) => isObj(r) && typeof r.id === 'string' && r.entityId != null;
const VALID_CLAUSE = (r) => isObj(r) && typeof r.id === 'string' && typeof r.kind === 'string';
const VALID_DEBTOR = (r) => isObj(r) && typeof r.id === 'string' && r.entityId != null;
const VALID_LOG = (r) => isObj(r) && typeof r.id === 'string';
const _capArr = (arr, max) => { while (arr.length > max) arr.shift(); return arr; };
/** Keep at most `max` keys in a stamped record — evict the lowest `at` values. */
function _capKeyed(obj, max) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return obj;
  const rank = (k) => {
    const v = obj[k];
    return v && typeof v === 'object' ? num(v.at ?? v.firstAt, 0) : num(v, 0);
  };
  keys.sort((a, b) => rank(a) - rank(b));
  for (let i = 0; i < keys.length - max; i++) delete obj[keys[i]];
  return obj;
}

/**
 * Fresh serializable Vael record: the lien ledger is the faction's memory, and
 * the book is the pilot's side of the paper. Normalizes IN PLACE — callers hold
 * references across sub-calls that re-run this, so malformed fields are repaired
 * on the live object, never rebuilt under them. Every slice is plain JSON; a
 * pre-ledger save (or a hand-cut fixture) reads clean.
 */
export function ensureVaelState(state) {
  if (!isObj(state.vael)) {
    state.vael = { liens: {}, telegraphs: {}, pageNine: null, transferredCount: 0 };
  }
  const v = state.vael;
  if (!isObj(v.liens)) v.liens = {};
  for (const k of Object.keys(v.liens)) {
    const r = v.liens[k];
    if (!isObj(r)) { delete v.liens[k]; continue; }
    r.mass = num(r.mass, VAEL_LIEN.anchorMass);
    r.attachedAt = num(r.attachedAt);
  }
  if (!isObj(v.telegraphs)) v.telegraphs = {};
  _capKeyed(v.telegraphs, 8);
  if (!isObj(v.writTelegraphs)) v.writTelegraphs = {};
  _capKeyed(v.writTelegraphs, 8);
  if (v.pageNine === undefined || (v.pageNine !== null && typeof v.pageNine !== 'object')) {
    v.pageNine = null;
  }
  if (!Number.isFinite(v.transferredCount)) v.transferredCount = 0;

  // ── The book ──
  if (!isObj(v.book)) v.book = {};
  const b = v.book;
  b.clauses = Math.max(0, intOr(b.clauses));
  b.stains = Math.max(0, intOr(b.stains));
  b.forgiven = Math.max(0, intOr(b.forgiven));
  b.settledCr = Math.max(0, intOr(b.settledCr));
  b.tier = Math.max(0, intOr(b.tier));

  v.seq = intOr(v.seq);
  if (!isObj(v.paid)) v.paid = {};
  for (const k of Object.keys(v.paid)) {
    const t = num(v.paid[k], -1);
    if (t < 0) delete v.paid[k]; else v.paid[k] = t;
  }

  v.invoices = Array.isArray(v.invoices) ? dropMalformed(v.invoices, VALID_INVOICE) : [];
  for (const r of v.invoices) {
    r.amount = Math.max(0, Math.round(num(r.amount)));
    r.mass = Math.max(0, num(r.mass));
    r.cause = str(r.cause, 'unpaid_lien');
    r.issuedAt = num(r.issuedAt);
    r.dueAt = num(r.dueAt, r.issuedAt + VAEL_LEDGER.invoiceDueS);
    r.nextWritAt = num(r.nextWritAt, 0);
    r.stage = Math.max(0, Math.min(2, intOr(r.stage)));
    r.state = ['open', 'paid', 'served', 'forgiven'].includes(r.state) ? r.state : 'open';
    r.writId = r.writId == null ? null : str(r.writId, null);
  }
  v.writs = Array.isArray(v.writs) ? dropMalformed(v.writs, VALID_WRIT) : [];
  for (const r of v.writs) {
    r.tenderId = r.tenderId == null ? null : r.tenderId;
    r.tenderGen = r.tenderGen == null ? null : intOr(r.tenderGen, null);
    r.lanceIds = Array.isArray(r.lanceIds) ? r.lanceIds.filter((x) => x != null) : [];
    r.postedAt = num(r.postedAt);
    r.despawnAt = num(r.despawnAt, r.postedAt + VAEL_LEDGER.writTtlS);
    r.mass = Math.max(0, num(r.mass, VAEL_LIEN.anchorMass));
    r.state = ['open', 'spent', 'recalled', 'broken'].includes(r.state) ? r.state : 'open';
  }
  v.patrols = Array.isArray(v.patrols) ? dropMalformed(v.patrols, VALID_PATROL) : [];
  for (const r of v.patrols) {
    r.gen = r.gen == null ? null : intOr(r.gen, null);
    r.kind = str(r.kind, 'courier');
    r.postedAt = num(r.postedAt);
    r.sectorId = r.sectorId == null ? null : str(r.sectorId, null);
    if (!isObj(r.post)) r.post = { x: 0, z: 0 };
    r.post.x = num(r.post.x); r.post.z = num(r.post.z);
    r.hailed = r.hailed === true;
    r.marked = r.marked === true;
    r.phase = num(r.phase, frac('patrol-phase', r.id) * TAU);
    r.aloneAt = num(r.aloneAt, -1);
  }
  v.clauses = Array.isArray(v.clauses) ? dropMalformed(v.clauses, VALID_CLAUSE) : [];
  for (const r of v.clauses) {
    r.state = ['open', 'signed', 'done', 'failed', 'lapsed'].includes(r.state) ? r.state : 'open';
    r.sectorId = r.sectorId == null ? null : str(r.sectorId, null);
    if (!isObj(r.site)) r.site = { x: 0, z: 0 };
    r.site.x = num(r.site.x); r.site.z = num(r.site.z);
    if (!isObj(r.deliver)) r.deliver = null;
    else { r.deliver.x = num(r.deliver.x); r.deliver.z = num(r.deliver.z); }
    r.postedAt = num(r.postedAt);
    r.deadlineAt = num(r.deadlineAt, r.postedAt + VAEL_LEDGER.clauseLapseS);
    r.signedAt = r.signedAt == null ? null : num(r.signedAt);
    r.payCr = Math.max(0, intOr(r.payCr));
    r.targetId = r.targetId == null ? null : r.targetId;
    r.targetGen = r.targetGen == null ? null : intOr(r.targetGen, null);
    r.crateId = r.crateId == null ? null : r.crateId;
    r.crateGen = r.crateGen == null ? null : intOr(r.crateGen, null);
    r.riderId = r.riderId == null ? null : r.riderId;
    r.riderGen = r.riderGen == null ? null : intOr(r.riderGen, null);
  }
  v.debtors = Array.isArray(v.debtors) ? dropMalformed(v.debtors, VALID_DEBTOR) : [];
  for (const r of v.debtors) {
    r.gen = r.gen == null ? null : intOr(r.gen, null);
    r.anchorId = r.anchorId == null ? null : r.anchorId;
    r.name = str(r.name, 'A NAME IN ARREARS');
    r.postedAt = num(r.postedAt);
    r.expiresAt = num(r.expiresAt, r.postedAt + VAEL_LEDGER.debtorTtlS);
    r.sectorId = r.sectorId == null ? null : str(r.sectorId, null);
    r.state = ['open', 'collected', 'downed', 'skipped', 'transferred', 'anchor_lost']
      .includes(r.state) ? r.state : 'open';
  }
  v.log = Array.isArray(v.log) ? dropMalformed(v.log, VALID_LOG) : [];
  _capArr(v.log, VAEL_LEDGER.logCap);

  if (!isObj(v.visits)) v.visits = {};
  for (const k of Object.keys(v.visits)) {
    const r = v.visits[k];
    if (!isObj(r)) { delete v.visits[k]; continue; }
    r.firstAt = num(r.firstAt);
    r.nextPatrolAt = num(r.nextPatrolAt, r.firstAt + VAEL_LEDGER.firstPatrolS);
    r.nextClauseAt = num(r.nextClauseAt, r.firstAt + VAEL_LEDGER.firstClauseS);
    r.nextDebtorAt = num(r.nextDebtorAt, r.firstAt + VAEL_LEDGER.firstDebtorS);
    r.readAt = r.readAt == null ? null : num(r.readAt, null);
    r.giftAt = r.giftAt == null ? null : num(r.giftAt, null);
    v.visits[k] = r;
  }
  _capKeyed(v.visits, VAEL_LEDGER.visitCap);
  if (!isObj(v.hullScriptSeen)) v.hullScriptSeen = {};
  _capKeyed(v.hullScriptSeen, VAEL_LEDGER.hullScriptCap);
  if (!isObj(v.giftPod)) v.giftPod = {};
  v.giftPod.entityId = v.giftPod.entityId == null ? null : v.giftPod.entityId;
  v.giftPod.gen = v.giftPod.gen == null ? null : intOr(v.giftPod.gen, null);
  v.giftPod.sectorId = v.giftPod.sectorId == null ? null : str(v.giftPod.sectorId, null);
  return v;
}

/** True while the player is inside contract work — the lien only bites there. */
export function vaelContractJobActive(state) {
  const v = ensureVaelState(state);
  if (v.pageNine && v.pageNine.armed) return true;
  if (v.contractJobActive === true) return true;
  // A signed hazard clause IS contract work — the paper the player walked into.
  if (Array.isArray(v.clauses) && v.clauses.some((c) => c.state === 'signed')) return true;
  const active = state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return active.some((m) => m && (m.contractJob === true || m.kind === 'contract' || m.type === 'contract' || m.kind === 'contract_haul'));
}

/** Live lien-anchor entities clamped to a host. */
export function lienAnchorFor(state, hostId) {
  for (const e of state.entityList) {
    if (e && e.alive !== false && e.data?.lienAnchor === true && e.data.hostId === hostId) return e;
  }
  return null;
}

/** The player's paper: tier row plus the counts behind it. */
export function vaelPaperTier(state) {
  const b = ensureVaelState(state).book;
  const row = vaelTierFor(b.clauses);
  return {
    tier: row.tier, id: row.id, label: row.label, payMult: row.payMult,
    clauses: b.clauses, stains: Math.max(0, b.stains - b.forgiven), settledCr: b.settledCr,
  };
}

/**
 * Detached read-model of the whole Vael ledger for HUD/board surfaces: paper,
 * open invoices, live writs/patrols/debtors, the clause board and the recent
 * log. Callers cannot mutate the book — every field is a copy.
 */
export function vaelBook(state) {
  const v = ensureVaelState(state);
  const openInvoices = v.invoices.filter((r) => r.state === 'open');
  return {
    paper: vaelPaperTier(state),
    openInvoices: openInvoices.length,
    invoiceTotal: openInvoices.reduce((a, r) => a + (r.amount || 0), 0),
    invoices: v.invoices.map((r) => ({ ...r })),
    writsLive: v.writs.filter((r) => r.state === 'open').length,
    patrolsLive: v.patrols.length,
    clauses: v.clauses.map((r) => ({ ...r, site: r.site && { ...r.site }, deliver: r.deliver && { ...r.deliver } })),
    debtors: v.debtors.map((r) => ({ ...r })),
    log: v.log.map((r) => ({ ...r })),
    transferredCount: v.transferredCount,
  };
}

/** Open invoices on the pilot's name — copies, oldest first. */
export function vaelOpenInvoices(state) {
  return vaelBook(state).invoices.filter((r) => r.state === 'open');
}

export const vaelLiens = {
  name: 'vaelLiens',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureVaelState(this.state);
    // The kill ear and the restore ear subscribe once per bus — a repeated init
    // must not double-arm them, or one hull could bill the book twice.
    if (this._earBus !== this.bus) {
      if (this._subs) {
        for (const off of this._subs) { try { off && off(); } catch (_) { /* stale unsub */ } }
      }
      this._earBus = this.bus;
      this._subs = [
        this.bus.on('entity:killed', (p) => this._onKilled(p)),
        // A restore re-normalizes the book and rebuilds nothing for free: rows
        // rebind to live bodies by id + generation + tag on the next tick.
        this.bus.on('save:loaded', () => this._afterRestore()),
      ];
    }
  },

  destroy() {
    for (const off of this._subs || []) { try { off && off(); } catch (_) { /* listener hygiene */ } }
    this._subs = [];
    this._earBus = null;
  },

  // ── persistence: the whole ledger rides the save as one plain-JSON bag ──────
  // serialize() already returns a fresh deep clone — the envelope's defensive
  // copy would only clone a clone. Same contract the sibling faction ledgers use.
  saveSnapshotOwned: true,

  serialize() {
    const state = this.state;
    if (!state) return {};
    return JSON.parse(JSON.stringify(ensureVaelState(state)));
  },

  deserialize(data) {
    const state = this.state;
    if (!state) return;
    this._restoredFromSave = true;
    // An absent or corrupt bag restores to a fresh ledger; rows rebind to live
    // bodies by id + generation + tag on the next tick.
    state.vael = isObj(data) ? data : null;
    return ensureVaelState(state);
  },

  /** Runs on save:loaded, after every restore seam has settled — a save that
   *  carried no ledger payload leaves the live bag as bleed-over from the run
   *  the load replaced, and another pilot's book is never this pilot's book. */
  _afterRestore() {
    const state = this.state;
    if (!state) return;
    if (this._restoredFromSave !== true) state.vael = null;
    this._restoredFromSave = false;
    ensureVaelState(state);
  },

  /** E-18: arm the addendum on a running hazard job — the clamp comes mid-job. */
  armPageNine(state, { jobId = null } = {}) {
    const v = ensureVaelState(state);
    v.pageNine = { jobId, armed: true, armedAt: state.simTime };
    this.bus.emit('vael:pageNineArmed', { jobId, tick: state.tick });
    this.bus.emit('comms:log', { text: VAEL_PAGE_NINE.armLine, speaker: 'Vael tender' });
    return v.pageNine;
  },

  // ── shared plumbing ──────────────────────────────────────────────────────────

  _player(state) {
    const p = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    return p && p.alive !== false ? p : null;
  },

  _log(state, text, speaker = 'Vael desk') {
    if (typeof text !== 'string' || !text) return;
    this.bus.emit('comms:log', { text, speaker });
  },

  /** One bounded row of the faction's journal — the ledger keeps it all. */
  _fileLog(state, kind, detail = null) {
    const v = ensureVaelState(state);
    const row = { id: `L${v.seq++}`, kind, at: num(state.simTime), detail };
    v.log.push(row);
    _capArr(v.log, VAEL_LEDGER.logCap);
    this.bus.emit('vael:ledgerFiled', { rowId: row.id, kind, detail, tick: state.tick });
    return row;
  },

  /** Once-only stamp for money/rep side-effects keyed by a content id. */
  _paidOnce(v, key) {
    if (!isObj(v.paid)) v.paid = {};
    if (v.paid[key] != null) return false;
    v.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(v.paid);
    // Insertion order is the eviction order — the stamp bag stays bounded.
    for (let i = 0; i < keys.length - PAID_STAMPS_CAP; i++) delete v.paid[keys[i]];
    return true;
  },

  _grant(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:grantCredits', { amount: n, reason });
  },

  _charge(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:chargeCredits', { amount: n, reason });
  },

  _rep(state, delta, reason) {
    const d = num(delta);
    if (!Number.isFinite(d) || d === 0) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },

  _credits(state) { return num(state.player && state.player.credits); },

  /** Stains the ledger actually holds against the pilot — forgiveness deducted. */
  _stains(v) { return Math.max(0, (v.book.stains | 0) - (v.book.forgiven | 0)); },

  _tierMult(v) { return vaelTierFor(v.book.clauses).payMult; },

  /** The pilot handled it: threw it, or holds it on the Line. */
  _playerHandled(state, e) {
    const d = e && e.data;
    if (d && (d.lastThrowerId === state.playerId
        || d.thrownBy === state.playerId || d.thrownBy === 'player')) return true;
    const pTether = state.player && state.player.tether;
    if (pTether && pTether.active !== false && pTether.targetId === e.id) return true;
    const pEnt = state.entities.get(state.playerId);
    if (pEnt && pEnt.tether && pEnt.tether.active !== false && pEnt.tether.targetId === e.id) return true;
    return false;
  },

  /**
   * One entity pass per tick: every live body the ledger cares about, bucketed.
   * Rows still re-prove ownership by id + generation + tag — the buckets are a
   * fast census, not identity.
   */
  _scan(state) {
    const s = {
      player: null, authored: [], patrols: [], writTenders: [], writLances: [],
      debtors: [],
    };
    const player = this._player(state);
    s.player = player;
    for (const e of state.entityList) {
      if (!e || e.alive === false) continue;
      const d = e.data;
      // A Vael signature that is not a ledger prop: authored hulls, stations —
      // and lien anchors, which are Vael metal whether the desk filed them or not.
      if (e.factionId === FACTION_ID && !(d && (d.vaelPatrol || d.vaelWrit
          || d.vaelCrate || d.vaelRider || d.vaelDefaulter || d.vaelClauseDebtor
          || d.vaelDebtor || d.vaelGift))) {
        s.authored.push(e);
      }
      if (!d) continue;
      if (d.vaelPatrol === true) s.patrols.push(e);
      if (d.vaelWritTender === true) s.writTenders.push(e);
      if (d.vaelLance === true) s.writLances.push(e);
      if (d.vaelDebtor === true) s.debtors.push(e);
    }
    return s;
  },

  /** Impulse steering — force enters ONLY through queuePhysicsImpulse. */
  _steer(state, e, tx, tz, speed, k = VAEL_LEDGER.patrolSteerK, dt = 1 / 60) {
    if (!e || e.alive === false || !e.vel) return false;
    const dx = tx - e.pos.x, dz = tz - e.pos.z;
    const d = Math.hypot(dx, dz);
    const des = d > 1 ? speed * Math.min(1, d / 200 + 0.35) : 0;
    const dvx = d > 1 ? (dx / d) * des - e.vel.x : -e.vel.x;
    const dvz = d > 1 ? (dz / d) * des - e.vel.z : -e.vel.z;
    const f = Math.min(1, k * dt);
    const mass = Math.max(1, num(e.mass, 1));
    return queuePhysicsImpulse(e, { x: dvx * mass * f, z: dvz * mass * f },
      { tick: state.tick, provenance: 'vael_ledger' });
  },

  /** A row's live body: id + recorded generation + the ownership tag it must wear. */
  _boundEnt(state, row, tag) {
    if (!row || row.entityId == null) return null;
    const e = state.entities.get(row.entityId);
    if (!e || e.alive === false) return null;
    if (row.gen != null && occupantGenerationOf(e) !== row.gen) return null;
    if (tag && e.data?.[tag] !== true) return null;
    return e;
  },

  // ── The telegraph: readable wind-up before the clamp ─────────────────────────
  _telegraphTenders(state) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const contract = vaelContractJobActive(state);
    const already = lienAnchorFor(state, player.id) != null;
    const range2 = VAEL_LIEN.clampRange * VAEL_LIEN.clampRange;
    const seen = new Set();
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.overrideTender !== true) continue;
      seen.add(String(e.id));
      const near = dist2(e.pos, player.pos) <= range2;
      let tg = v.telegraphs[e.id];
      // A wind-up belongs to one occupant: a recycled id wearing a dead
      // tender's latch would fire with no wind-up. Generation proves it.
      if (tg && tg.gen != null && tg.gen !== occupantGenerationOf(e)) {
        delete v.telegraphs[e.id];
        tg = null;
      }
      if (!contract || already || !near) { if (tg) delete v.telegraphs[e.id]; continue; }
      if (!tg) {
        v.telegraphs[e.id] = {
          tenderId: e.id, targetId: player.id, gen: occupantGenerationOf(e),
          fireAt: state.simTime + VAEL_LIEN.telegraphS,
        };
        this.bus.emit('vael:lienTelegraph', { tenderId: e.id, fireAt: state.simTime + VAEL_LIEN.telegraphS, tick: state.tick });
        this.bus.emit('comms:log', { text: VAEL_LIEN.telegraphLine, speaker: 'Override Tender' });
        continue;
      }
      if (state.simTime >= tg.fireAt) {
        delete v.telegraphs[e.id];
        this._clampLien(state, player, e);
      }
    }
    // A dead or decommissioned tender's wind-up dies with it — the loop only
    // visits live tagged hulls, so prune what it could not see. Keeps the map
    // bounded too.
    for (const k of Object.keys(v.telegraphs)) {
      if (!seen.has(k)) delete v.telegraphs[k];
    }
  },

  /** The clamp lands: a physical anchor body plus the mass on the host's hull. */
  _clampLien(state, host, tender, opts = {}) {
    const v = ensureVaelState(state);
    if (!host || host.alive === false) return null;
    if (lienAnchorFor(state, host.id)) return null;
    const mass = Math.max(1, num(opts.mass, VAEL_LIEN.anchorMass));
    const anchor = this.helpers.spawnEntity({
      type: 'payload', team: 1, factionId: FACTION_ID,
      pos: { x: host.pos.x + host.radius + 12, z: host.pos.z },
      vel: { x: host.vel.x, z: host.vel.z }, rot: 0,
      radius: 9, mass, hull: 200, hullMax: 200, collides: true,
      data: {
        lienAnchor: true, hostId: host.id, clampMass: mass,
        throwable: true, scannable: true,
        writ: opts.writ === true || undefined,
        name: 'Lien Anchor',
        scanLabel: `LIEN ANCHOR · +${mass}t clamped mass · throw it at somebody`,
      },
    });
    host.mass = (Number(host.mass) || 0) + mass;
    host.data = host.data || {};
    host.data.lienMass = (Number(host.data.lienMass) || 0) + mass;
    v.liens[anchor.id] = {
      anchorId: anchor.id, hostId: host.id, mass,
      attachedAt: state.simTime, attachedTick: state.tick,
      tenderId: tender ? tender.id : null,
      pageNine: !!(v.pageNine && v.pageNine.armed),
      writ: opts.writ === true || undefined,
      invoiceId: opts.invoiceId || undefined,
    };
    if (v.pageNine && v.pageNine.armed) v.pageNine.armed = false; // the addendum fired
    this.bus.emit('vael:lienClamped', {
      anchorId: anchor.id, hostId: host.id, mass, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: opts.serveLine || VAEL_LIEN.clampLine, speaker: 'Vael tender' });
    if (host.id === state.playerId) {
      this.bus.emit('toast', { text: `LIEN CLAMPED — +${mass}t on your hull`, tone: 'warn' });
    }
    return anchor;
  },

  /**
   * Anchors ride their host until thrown. A thrown anchor that reaches a hostile hull
   * transfers the debt: `LIEN TRANSFERRED: <name> NOW OWES THE VAEL.`
   */
  _tickAnchors(state, dt) {
    const v = ensureVaelState(state);
    const riding = new Set(); // host ids whose clamped mass still has live metal attached
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      if (e.data.hostId != null) riding.add(e.data.hostId);
      const lien = v.liens[e.id] || (v.liens[e.id] = {
        anchorId: e.id, hostId: e.data.hostId, mass: e.data.clampMass || VAEL_LIEN.anchorMass,
        attachedAt: state.simTime, attachedTick: state.tick,
      });
      const host = state.entities.get(e.data.hostId);
      if (e.data.detached !== true) {
        // Clamped: ride just off the host's hull.
        if (!host || host.alive === false) { this._releaseLien(state, e, lien); continue; }
        const rr = host.radius + e.radius + 6;
        const dx = e.pos.x - host.pos.x, dz = e.pos.z - host.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        // A fling reads as separation moving fast relative to the host — a host that
        // moves hard just drags its debt along (the anchor rides, it does not let go).
        const rel = Math.hypot(e.vel.x - host.vel.x, e.vel.z - host.vel.z);
        if (d > rr && rel >= VAEL_LIEN.flingSpeedMin) {
          e.data.detached = true;
          e.data.detachedTick = state.tick;
          this.bus.emit('vael:lienThrown', { anchorId: e.id, hostId: host.id, tick: state.tick });
        } else {
          e.pos.x = host.pos.x + (dx / d) * rr;
          e.pos.z = host.pos.z + (dz / d) * rr;
          e.vel.x = host.vel.x; e.vel.z = host.vel.z;
        }
        continue;
      }
      // Detached and flying (its own vel carries it; physics owns the pose from here):
      // a hostile hull in the way inherits the debt.
      const speed = Math.hypot(e.vel.x, e.vel.z);
      if (speed < VAEL_LIEN.flingSpeedMin) continue;
      for (const body of state.entityList) {
        if (body === e || !body || body.alive === false) continue;
        if (body.id === e.data.hostId || body.id === state.playerId) continue;
        if (body.type !== 'ship' && body.type !== 'machine') continue;
        if (VAEL_LIEN.transferToHostilesOnly && body.team === 0) continue;
        const rr = e.radius + (Number(body.radius) || 0) + 4;
        if (dist2(e.pos, body.pos) > rr * rr) continue;
        this._transferLien(state, e, lien, body);
        // The debt just moved onto `body`: it now rides there, so the phantom-mass
        // sweep below must not strip the tonnes the transfer just booked.
        riding.add(body.id);
        break;
      }
    }
    // An anchor that vanished without _releaseLien — a sector sweep culling
    // transient bodies, a restore (anchors are never serialized), a foreign
    // removeEntity — left its mass on the host and its row on the desk. The
    // metal is gone; the mass and the paper must not be. The hull sheds the
    // phantom tonnes, and when the hull is the pilot's the desk refiles the
    // released lien as an invoice: you cannot fly away from paper either.
    for (const e of state.entityList) {
      const d = e && e.data;
      const lm = d ? num(d.lienMass) : 0;
      if (!e || lm <= 0 || riding.has(e.id)) continue;
      e.mass = Math.max(0, (Number(e.mass) || 0) - lm);
      d.lienMass = 0;
      if (e.id === state.playerId && e.alive !== false) {
        this._fileInvoice(state, {
          amount: Math.round(lm * VAEL_LIEN.payoffPerTonne),
          mass: lm, cause: 'anchor_lost',
        });
        this._fileLog(state, 'anchor_lost', `${lm}t refiled`);
      }
    }
    // Rows whose metal is gone — swept, restored-away, or released hull-side —
    // are dropped so the ledger never holds paper no anchor carries.
    for (const k of Object.keys(v.liens)) {
      const row = v.liens[k];
      const a = state.entities.get(row.anchorId != null ? row.anchorId : intOr(k, -1));
      if (!a || a.alive === false || a.data?.lienAnchor !== true || a.data.hostId == null) {
        delete v.liens[k];
      }
    }
  },

  /** The debt finds a new name. */
  _transferLien(state, anchor, lien, newHost) {
    const v = ensureVaelState(state);
    const oldHost = state.entities.get(anchor.data.hostId);
    if (oldHost) {
      oldHost.mass = Math.max(0, (Number(oldHost.mass) || 0) - lien.mass);
      if (oldHost.data) oldHost.data.lienMass = Math.max(0, (Number(oldHost.data.lienMass) || 0) - lien.mass);
    }
    newHost.mass = (Number(newHost.mass) || 0) + lien.mass;
    newHost.data = newHost.data || {};
    newHost.data.lienMass = (Number(newHost.data.lienMass) || 0) + lien.mass;
    anchor.data.hostId = newHost.id;
    anchor.data.detached = false;
    lien.hostId = newHost.id;
    lien.transferredAt = state.simTime;
    v.transferredCount += 1;
    const name = newHost.data?.name || newHost.data?.callsign || `HULL-${newHost.id}`;
    const line = VAEL_LIEN.transferLogTemplate.replace('{name}', String(name).toUpperCase());
    // The player's own paper moved — legal, clever, and remembered kindly.
    if (oldHost && oldHost.id === state.playerId) {
      this._rep(state, 1, 'vael_lien_transferred');
      this._fileLog(state, 'lien_transferred', `to ${name}`);
    }
    this.bus.emit('vael:lienTransferred', {
      anchorId: anchor.id, fromId: oldHost ? oldHost.id : null, toId: newHost.id, name, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: line, speaker: 'LOG' });
    this.bus.emit('comms:log', { text: VAEL_BARKS.transferred, speaker: 'Vael tender' });
    this.bus.emit('toast', { text: line, tone: 'good' });
  },

  /** Settle the addendum in credits — the clean way out. */
  payoffLien(state, { anchorId = null } = {}) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    // A dead or absent pilot settles nothing — without the host check the loop
    // would release EVERY lien in the sector and bill the void for it.
    if (!player || player.alive === false) return 0;
    let paid = 0;
    for (const e of state.entityList.slice()) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      if (anchorId != null && e.id !== anchorId) continue;
      if (e.data.hostId !== player.id) continue;
      const lien = v.liens[e.id];
      const mass = lien ? lien.mass : e.data.clampMass || VAEL_LIEN.anchorMass;
      paid += Math.round(mass * VAEL_LIEN.payoffPerTonne);
      this._releaseLien(state, e, lien);
    }
    if (paid > 0) {
      // The settlement accrues before the charge speaks — a re-entrant listener
      // already reads the paid book.
      v.book.settledCr += paid;
      this._fileLog(state, 'lien_settled', `${paid} cr`);
      this._rep(state, 2, 'vael_lien_settled');
      this.bus.emit('economy:chargeCredits', { amount: paid, reason: 'vael_lien_payoff' });
      this.bus.emit('comms:log', { text: VAEL_LIEN.payoffLine, speaker: 'Vael tender' });
      this.bus.emit('vael:lienPaid', { amount: paid, tick: state.tick });
      this._tickMilestones(state);
    }
    return paid;
  },

  /** Cut the clamp free — legal, and the Vael remember it. The metal is scrap;
   *  the paper lands on the desk as an invoice for half the settled value. */
  cutLienLoose(state, { anchorId = null } = {}) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    // Same guard as payoffLien — no pilot, no cut.
    if (!player || player.alive === false) return 0;
    let cut = 0;
    for (const e of state.entityList.slice()) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      if (anchorId != null && e.id !== anchorId) continue;
      if (e.data.hostId !== player.id) continue;
      const lien = v.liens[e.id];
      const mass = lien ? lien.mass : e.data.clampMass || VAEL_LIEN.anchorMass;
      // The metal drops before the paper speaks — a re-entrant listener inside
      // the invoice emit finds the clamp already gone and cannot double-file it.
      this._releaseLien(state, e, lien);
      this._fileInvoice(state, {
        amount: Math.round(mass * VAEL_LIEN.payoffPerTonne * VAEL_LEDGER.cutInvoiceFrac),
        mass, cause: 'cut_loose',
      });
      cut += 1;
    }
    if (cut > 0) {
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: VAEL_LIEN.cutLooseRepLoss, reason: 'vael_lien_cut' });
      this.bus.emit('vael:lienCut', { count: cut, tick: state.tick });
    }
    return cut;
  },

  _releaseLien(state, anchor, lien) {
    // Idempotent — a replayed kill or a double release path frees the mass once.
    if (!anchor || anchor.data?.lienReleased === true) return false;
    const host = state.entities.get(anchor.data.hostId);
    const mass = lien ? lien.mass : anchor.data.clampMass || VAEL_LIEN.anchorMass;
    if (host) {
      host.mass = Math.max(0, (Number(host.mass) || 0) - mass);
      if (host.data) host.data.lienMass = Math.max(0, (Number(host.data.lienMass) || 0) - mass);
    }
    delete ensureVaelState(state).liens[anchor.id];
    if (anchor.data) {
      anchor.data.lienReleased = true;
      anchor.data.hostId = null;
    }
    this.helpers.removeEntity(anchor.id, { reason: 'vael_lien_released' });
    return true;
  },

  /** Override Head: while the Line holds a ship you fire ITS thrusters. */
  _overrideHead(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== VAEL_OVERRIDE_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const target = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!target || target.alive === false) continue;
      const aim = holder.id === state.playerId
        ? Number(state.input?.aimAngle) || 0
        : Number(holder.rot) || 0;
      target.vel.x += Math.cos(aim) * VAEL_OVERRIDE_HEAD.thrustAccel * dt;
      target.vel.z += Math.sin(aim) * VAEL_OVERRIDE_HEAD.thrustAccel * dt;
      this.bus.emit('vael:overrideThrust', { holderId: holder.id, targetId: target.id, aim, tick: state.tick });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE LEDGER — invoices, writs, patrols, clauses, debtors, the book.
  // ═══════════════════════════════════════════════════════════════════════════

  /** The sector's visit row — the desk's clocks are per-sector. */
  _visit(state) {
    const v = ensureVaelState(state);
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    let row = v.visits[sectorId];
    if (!row) {
      row = v.visits[sectorId] = {
        firstAt: num(state.simTime),
        nextPatrolAt: num(state.simTime) + VAEL_LEDGER.firstPatrolS
          + frac('vael-first-patrol', sectorId, v.seq) * 20,
        nextClauseAt: num(state.simTime) + VAEL_LEDGER.firstClauseS
          + frac('vael-first-clause', sectorId, v.seq) * 30,
        nextDebtorAt: num(state.simTime) + VAEL_LEDGER.firstDebtorS
          + frac('vael-first-debtor', sectorId, v.seq) * 40,
        readAt: null, giftAt: null,
      };
      _capKeyed(v.visits, VAEL_LEDGER.visitCap);
    }
    return row;
  },

  // ── Invoices: the refiled debt ────────────────────────────────────────────────

  /**
   * File an invoice on the pilot's name. Over the open cap the desk consolidates:
   * the amount folds into the oldest open bill — one page, larger print.
   */
  _fileInvoice(state, { amount, mass = 0, cause = 'unpaid_lien' } = {}) {
    const v = ensureVaelState(state);
    amount = Math.round(num(amount));
    if (!(amount > 0)) return null;
    const open = v.invoices.filter((r) => r.state === 'open');
    if (open.length >= VAEL_LEDGER.invoiceMaxOpen) {
      const oldest = open[0];
      oldest.amount += amount;
      oldest.mass = num(oldest.mass) + num(mass);
      this._fileLog(state, 'invoice_consolidated', `${cause} folded into ${oldest.id}`);
      return oldest;
    }
    const inv = {
      id: `inv:${v.seq++}`, amount, mass: num(mass), cause,
      issuedAt: num(state.simTime), dueAt: num(state.simTime) + VAEL_LEDGER.invoiceDueS,
      nextWritAt: 0, stage: 0, state: 'open', writId: null,
    };
    v.invoices.push(inv);
    this.bus.emit('vael:invoiceFiled', {
      invoiceId: inv.id, amount, mass: inv.mass, cause, dueAt: inv.dueAt, tick: state.tick,
    });
    this._fileLog(state, 'invoice_filed', `${cause} · ${amount} cr`);
    this._log(state, cause === 'blood' ? LEDGER_BARKS.invoiceBlood : LEDGER_BARKS.invoiceFiled);
    return inv;
  },

  /** Pay an open invoice by id — or the oldest open one. Refuses an empty hold. */
  payInvoice(state, { invoiceId = null } = {}) {
    const v = ensureVaelState(state);
    const inv = invoiceId != null
      ? v.invoices.find((r) => r.id === invoiceId && r.state === 'open')
      : v.invoices.find((r) => r.state === 'open');
    if (!inv) return 0;
    if (this._credits(state) < inv.amount) return 0; // a broke signature signs nothing
    // Latch before the charge speaks — a re-entrant listener reads the paid book.
    inv.state = 'paid';
    inv.how = 'paid';
    inv.settledAt = num(state.simTime);
    v.book.settledCr += inv.amount;
    this._recallWritFor(state, inv, 'settled');
    this._charge(state, inv.amount, `vael_invoice:${inv.id}`);
    this._rep(state, VAEL_LEDGER.invoiceRep, 'vael_invoice_paid');
    this._fileLog(state, 'invoice_paid', `${inv.id} · ${inv.amount} cr`);
    this.bus.emit('vael:invoiceSettled', {
      invoiceId: inv.id, amount: inv.amount, how: 'paid', tick: state.tick,
    });
    this._log(state, LEDGER_BARKS.invoicePaid);
    this._gcClosed(v.invoices, VAEL_LEDGER.invoiceKeepClosed);
    this._tickMilestones(state);
    return inv.amount;
  },

  /** The desk's reminder cadence: stage 0 open → stage 1 reminded → stage 2 writ. */
  _tickInvoices(state) {
    const v = ensureVaelState(state);
    const player = this._player(state);
    for (const inv of v.invoices) {
      if (inv.state !== 'open') continue;
      if (inv.stage === 0 && state.simTime >= num(inv.dueAt)) {
        inv.stage = 1;
        inv.dueAt = state.simTime + VAEL_LEDGER.invoiceRemindGapS;
        if (this._paidOnce(v, `remind:${inv.id}`)) {
          this._rep(state, VAEL_LEDGER.remindRep, 'vael_invoice_reminded');
        }
        this.bus.emit('vael:invoiceReminded', { invoiceId: inv.id, amount: inv.amount, tick: state.tick });
        this._fileLog(state, 'invoice_reminded', inv.id);
        this._log(state, LEDGER_BARKS.invoiceRemind);
      } else if (inv.stage === 1 && state.simTime >= num(inv.dueAt)) {
        inv.stage = 2;
        inv.dueAt = Infinity; // stage two is run by the writ clock from here
        inv.nextWritAt = state.simTime;
      } else if (inv.stage === 2 && state.simTime >= num(inv.nextWritAt)) {
        const liveWrits = v.writs.reduce((n, w) => n + (w.state === 'open' ? 1 : 0), 0);
        // Flight only — the crew serves the bill in open space, never dockside.
        if (player && state.mode === 'flight' && liveWrits < VAEL_LEDGER.writMaxLive
            && this._postWrit(state, inv)) {
          // posted — the crew's own clock decides what happens next
        } else {
          inv.nextWritAt = state.simTime + VAEL_LEDGER.reWritGapS;
        }
      }
    }
  },

  /** Settle every invoice attached to a writ-served lien? No — a served invoice
   *  closes when the writ's clamp lands; the lien itself is then ordinary paper. */

  // ── Writ crews: the bill that walks ────────────────────────────────────────────

  _postWrit(state, inv) {
    const v = ensureVaelState(state);
    const player = this._player(state);
    if (!player || inv.state !== 'open') return null;
    const id = `writ:${v.seq++}`;
    const a = frac('writ-ang', inv.id, v.seq) * TAU;
    const px = player.pos.x + Math.cos(a) * VAEL_LEDGER.writSpawnR;
    const pz = player.pos.z + Math.sin(a) * VAEL_LEDGER.writSpawnR;
    const name = TENDER_NAMES[hash32('writ-name', id) % TENDER_NAMES.length];
    const tender = this.helpers.spawnEntity({
      type: 'ship', team: 1, factionId: FACTION_ID,
      pos: { x: px, z: pz }, vel: { x: 0, z: 0 },
      radius: 18, mass: 60, hull: 400, hullMax: 400, collides: true,
      data: {
        vaelWrit: true, vaelWritTender: true, writId: id, invoiceId: inv.id,
        role: 'writ-tender', name: `${name} · WRIT`, scannable: true,
        scanLabel: `WRIT TENDER · serving invoice ${inv.id} · ${inv.amount} cr`,
      },
    });
    const lanceIds = [];
    const lanceCount = 1 + Math.floor(frac('writ-lances', id, inv.amount) * 2);
    for (let i = 0; i < lanceCount; i++) {
      const la = a + (i === 0 ? 0.5 : -0.5);
      const lance = this.helpers.spawnEntity({
        type: 'ship', team: 1, factionId: FACTION_ID,
        pos: { x: px + Math.cos(la) * 140, z: pz + Math.sin(la) * 140 },
        vel: { x: 0, z: 0 }, radius: 14, mass: 36, hull: 220, hullMax: 220, collides: true,
        data: {
          vaelWrit: true, vaelLance: true, writId: id,
          role: 'writ-lance', name: LANCE_NAMES[hash32('lance-name', id, i) % LANCE_NAMES.length],
        },
      });
      lanceIds.push(lance.id);
    }
    const writ = {
      id, invoiceId: inv.id, tenderId: tender.id, tenderGen: occupantGenerationOf(tender),
      lanceIds, postedAt: num(state.simTime),
      despawnAt: num(state.simTime) + VAEL_LEDGER.writTtlS,
      state: 'open', mass: num(inv.mass) + VAEL_LIEN.anchorMass,
    };
    v.writs.push(writ);
    inv.writId = id;
    this.bus.emit('vael:writPosted', {
      writId: id, invoiceId: inv.id, tenderId: tender.id, lanceIds: [...lanceIds],
      amount: inv.amount, tick: state.tick,
    });
    this._fileLog(state, 'writ_posted', `${inv.id} · ${inv.amount} cr`);
    this._log(state, LEDGER_BARKS.writPosted);
    return writ;
  },

  /** The crew is done — spent, recalled, or broken. Hull cleanup + invoice clock. */
  _closeWrit(state, writ, outcome) {
    const v = ensureVaelState(state);
    if (writ.state !== 'open') return;
    writ.state = outcome;
    writ.closedAt = num(state.simTime);
    delete v.writTelegraphs[writ.tenderId];
    for (const id of [writ.tenderId, ...(writ.lanceIds || [])]) {
      const e = state.entities.get(id);
      if (e && e.alive !== false && e.data?.vaelWrit === true) {
        this.helpers.removeEntity(id, { reason: `vael_writ_${outcome}` });
      }
    }
    const inv = v.invoices.find((r) => r.id === writ.invoiceId);
    if (inv && inv.state === 'open' && inv.stage === 2 && outcome !== 'spent') {
      inv.nextWritAt = state.simTime + VAEL_LEDGER.reWritGapS; // the paper waits, then walks again
    }
    this.bus.emit('vael:writClosed', { writId: writ.id, outcome, invoiceId: writ.invoiceId, tick: state.tick });
    this._gcClosed(v.writs, 4);
  },

  _recallWritFor(state, inv, cause) {
    const v = ensureVaelState(state);
    const writ = v.writs.find((w) => w.id === inv.writId && w.state === 'open')
      || v.writs.find((w) => w.invoiceId === inv.id && w.state === 'open');
    if (!writ) return;
    this._closeWrit(state, writ, 'recalled');
    this.bus.emit('vael:writRecalled', { writId: writ.id, invoiceId: inv.id, cause, tick: state.tick });
    this._log(state, LEDGER_BARKS.writRecalled);
  },

  _tickWrits(state, dt, scan) {
    const v = ensureVaelState(state);
    const player = scan.player;
    for (const writ of v.writs) {
      if (writ.state !== 'open') continue;
      const inv = v.invoices.find((r) => r.id === writ.invoiceId);
      const tender = this._boundEnt(state, { entityId: writ.tenderId, gen: writ.tenderGen }, 'vaelWritTender');
      if (!tender) {
        // The tender is gone — killed (filed by the kill wire) or swept. The bill
        // is not: the writ breaks open and the invoice re-arms its own clock.
        this._closeWrit(state, writ, 'broken');
        continue;
      }
      if (!player) { this._steer(state, tender, tender.pos.x + 1, tender.pos.z, 0, undefined, dt); continue; }
      if (state.simTime >= num(writ.despawnAt)) { this._closeWrit(state, writ, 'broken'); continue; }
      if (!inv || inv.state !== 'open') { this._closeWrit(state, writ, 'recalled'); continue; }

      const marked = num(player.data && player.data.vaelMarkedUntil, -1) > state.simTime;
      const serveR = VAEL_LEDGER.writServeR * (marked ? VAEL_LEDGER.writMarkedMult : 1);
      const d2 = dist2(tender.pos, player.pos);
      const clamped = lienAnchorFor(state, player.id) != null;
      const tg = v.writTelegraphs[tender.id];

      if (!clamped && d2 <= serveR * serveR) {
        if (!tg) {
          // Latch before it speaks: the wind-up is on the book already.
          v.writTelegraphs[tender.id] = {
            tenderId: tender.id, targetId: player.id, writId: writ.id,
            fireAt: state.simTime + VAEL_LEDGER.writTelegraphS,
          };
          this.bus.emit('vael:writTelegraph', {
            writId: writ.id, tenderId: tender.id,
            fireAt: state.simTime + VAEL_LEDGER.writTelegraphS, tick: state.tick,
          });
          this._log(state, LEDGER_BARKS.writTelegraph, 'Vael writ tender');
        } else if (state.simTime >= num(tg.fireAt)) {
          delete v.writTelegraphs[tender.id];
          const mass = Math.max(VAEL_LIEN.anchorMass, num(writ.mass, VAEL_LIEN.anchorMass));
          // The paper latches before the clamp's emits run — a settlement
          // re-entered inside `vael:lienClamped` already reads the invoice as
          // served, so one serve can never be both paid and clamped. If the
          // metal refuses to land, the paper re-opens cleanly.
          inv.state = 'served';
          inv.how = 'writ';
          inv.settledAt = num(state.simTime);
          const anchor = this._clampLien(state, player, tender, {
            mass, writ: true, invoiceId: inv.id, serveLine: LEDGER_BARKS.writServed,
          });
          if (!anchor) {
            inv.state = 'open';
            delete inv.how;
            delete inv.settledAt;
          } else {
            this._fileLog(state, 'invoice_served', `${inv.id} → ${mass}t`);
            this.bus.emit('vael:writServed', {
              writId: writ.id, invoiceId: inv.id, anchorId: anchor.id, mass, tick: state.tick,
            });
            this._closeWrit(state, writ, 'spent');
            this._gcClosed(v.invoices, VAEL_LEDGER.invoiceKeepClosed);
            continue;
          }
        }
      } else if (tg) {
        delete v.writTelegraphs[tender.id]; // out of reach — the writ re-reads
      }

      // Steering: the tender closes to serve; an already-clamped payer makes it hold.
      const holdR = clamped ? VAEL_LEDGER.writStandoffR : serveR * 0.6;
      const dx = player.pos.x - tender.pos.x, dz = player.pos.z - tender.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      let tx = player.pos.x, tz = player.pos.z;
      if (d < holdR) { tx = tender.pos.x - (dx / d) * 60; tz = tender.pos.z - (dz / d) * 60; }
      this._steer(state, tender, tx, tz, VAEL_LEDGER.writSpeed * (marked ? 1.3 : 1),
        VAEL_LEDGER.writSteerK, dt);

      // Lances orbit their tender — escort, never fire.
      const wt = num(state.simTime) * 0.5;
      let li = 0;
      for (const lance of scan.writLances) {
        if (lance.data?.writId !== writ.id) continue;
        const ang = wt + (li++) * (TAU / 3);
        this._steer(state, lance,
          tender.pos.x + Math.cos(ang) * VAEL_LEDGER.lanceOrbitR,
          tender.pos.z + Math.sin(ang) * VAEL_LEDGER.lanceOrbitR,
          VAEL_LEDGER.lanceSpeed, VAEL_LEDGER.writSteerK, dt);
      }
    }
  },

  // ── Patrols: the presence the Veil keeps ──────────────────────────────────────

  _tickPatrols(state, dt, scan, visit) {
    const v = ensureVaelState(state);
    const player = scan.player;
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    const inHome = VAEL_HOME.has(sectorId);
    const presence = inHome || scan.authored.length > 0;

    // Post on the visit clock — bounded live count, presence-gated.
    if (player && presence && state.mode === 'flight'
        && state.simTime >= visit.nextPatrolAt
        && scan.patrols.length < VAEL_LEDGER.patrolMaxLive) {
      visit.nextPatrolAt = state.simTime + VAEL_LEDGER.patrolGapS
        + frac('patrol-gap', sectorId, v.seq) * 40;
      this._postPatrol(state, sectorId, scan);
    } else if (state.simTime >= visit.nextPatrolAt) {
      visit.nextPatrolAt = state.simTime + VAEL_LEDGER.patrolGapS; // keep the beat
    }

    // Rebind rows to bodies; steer what lives; lapse what does not.
    for (const row of [...v.patrols]) {
      const e = this._boundEnt(state, row, 'vaelPatrol');
      if (!e) {
        v.patrols = v.patrols.filter((r) => r !== row);
        this._fileLog(state, 'patrol_lost', row.id);
        continue;
      }
      if (!player) continue;
      const d2p = dist2(e.pos, player.pos);
      // Orbit the post — a slow instrument circuit, never aggressive.
      const w = row.phase + num(state.simTime) * 0.06;
      this._steer(state, e,
        row.post.x + Math.cos(w) * VAEL_LEDGER.patrolOrbitR,
        row.post.z + Math.sin(w) * VAEL_LEDGER.patrolOrbitR,
        VAEL_LEDGER.patrolSpeed, VAEL_LEDGER.patrolSteerK, dt);
      // The hail: one reading of the book, spoken once per hull.
      if (!row.hailed && d2p <= VAEL_LEDGER.patrolHailR * VAEL_LEDGER.patrolHailR) {
        row.hailed = true;
        const stains = this._stains(v);
        const owed = v.invoices.some((r) => r.state === 'open');
        const line = v.book.tier >= 2 ? LEDGER_BARKS.hailKept
          : owed ? LEDGER_BARKS.hailOwed
          : stains > 0 ? LEDGER_BARKS.hailStained
          : LEDGER_BARKS.hailClean;
        this.bus.emit('vael:patrolHail', {
          patrolId: row.id, entityId: e.id, owed, stains, tick: state.tick,
        });
        this._log(state, line, e.data?.name || 'Vael patrol');
      }
      // The mark: an open invoice in reach stamps the pilot's hull.
      if (!row.marked && d2p <= VAEL_LEDGER.markR * VAEL_LEDGER.markR
          && v.invoices.some((r) => r.state === 'open')) {
        row.marked = true;
        player.data = player.data || {};
        player.data.vaelMarkedUntil = state.simTime + VAEL_LEDGER.markS;
        this.bus.emit('vael:marked', { patrolId: row.id, until: player.data.vaelMarkedUntil, tick: state.tick });
        this._log(state, LEDGER_BARKS.marked, e.data?.name || 'Vael patrol');
      }
      // Left alone long enough, the paper re-posts elsewhere.
      if (d2p > VAEL_LEDGER.patrolLeaveR * VAEL_LEDGER.patrolLeaveR) {
        if (row.aloneAt < 0) row.aloneAt = state.simTime;
        if (state.simTime - row.aloneAt > VAEL_LEDGER.patrolOrphanS) {
          v.patrols = v.patrols.filter((r) => r !== row);
          this.helpers.removeEntity(e.id, { reason: 'vael_patrol_withdrawn' });
          this.bus.emit('vael:patrolWithdrew', { patrolId: row.id, entityId: e.id, tick: state.tick });
        }
      } else {
        row.aloneAt = -1;
      }
    }

    // The Reading: once per sector visit, the nearest Vael signature reads the
    // pilot's hull aloud — mass, open paper, the number on the book.
    if (player && visit.readAt == null) {
      for (const e of scan.authored.concat(scan.patrols)) {
        if (dist2(e.pos, player.pos) > VAEL_LEDGER.readingR * VAEL_LEDGER.readingR) continue;
        visit.readAt = num(state.simTime);
        const openInv = v.invoices.filter((r) => r.state === 'open');
        const total = openInv.reduce((a, r) => a + r.amount, 0);
        const mass = Math.round(num(player.mass));
        const text = `HULL READ · ${mass}t · ${openInv.length} OPEN INVOICE${openInv.length === 1 ? '' : 'S'} · ${total} CR ON THE BOOK`;
        this.bus.emit('vael:reading', {
          entityId: e.id, hullMass: mass, openInvoices: openInv.length, invoiceTotal: total, tick: state.tick,
        });
        this._log(state, text, e.data?.name || 'Vael instrument');
        break;
      }
    }

    // Page nine at 2pt: get close enough and the hull text is legible — once per hull.
    if (player) {
      for (const e of scan.authored.concat(scan.patrols)) {
        const key = `${e.id}:${occupantGenerationOf(e) ?? 0}`;
        if (v.hullScriptSeen[key] != null) continue;
        if (dist2(e.pos, player.pos) > VAEL_LEDGER.hullScriptR * VAEL_LEDGER.hullScriptR) continue;
        v.hullScriptSeen[key] = num(state.simTime);
        this.bus.emit('vael:hullScriptRead', {
          entityId: e.id, name: e.data?.name || null, tick: state.tick,
        });
        this._log(state, VAEL_HULL_SCRIPT.pageNineTeaser, e.data?.name || 'Vael hull');
      }
    }

    // The sealed rider: the desk leaves a gift for a clean, proven book — once
    // per sector visit, and it is worth picking up.
    if (player && visit.giftAt == null && state.mode === 'flight'
        && this._stains(v) === 0 && v.book.clauses >= VAEL_LEDGER.giftMinClauses) {
      const ga = frac('gift-ang', sectorId, v.seq) * TAU;
      const pod = this.helpers.spawnEntity({
        type: 'payload', team: 0, factionId: FACTION_ID,
        pos: {
          x: player.pos.x + Math.cos(ga) * VAEL_LEDGER.giftR,
          z: player.pos.z + Math.sin(ga) * VAEL_LEDGER.giftR,
        },
        vel: { x: 0, z: 0 }, radius: 8, mass: 8, hull: 30, hullMax: 30, collides: true,
        data: {
          vaelGift: true, name: 'Sealed rider', scannable: true,
          scanLabel: 'SEALED RIDER · for the punctual · the desk remembers',
        },
      });
      visit.giftAt = num(state.simTime);
      v.giftPod = { entityId: pod.id, gen: occupantGenerationOf(pod), sectorId };
      this.bus.emit('vael:riderLeft', { podId: pod.id, tick: state.tick });
      this._log(state, LEDGER_BARKS.gift);
    }
    // The rider opens on the pilot's touch.
    if (player && v.giftPod.entityId != null) {
      const pod = state.entities.get(v.giftPod.entityId);
      const samePod = pod && pod.alive !== false && pod.data?.vaelGift === true
        && (v.giftPod.gen == null || occupantGenerationOf(pod) === v.giftPod.gen);
      if (!samePod) {
        v.giftPod = { entityId: null, gen: null, sectorId: null };
      } else if (dist2(pod.pos, player.pos) <= VAEL_LEDGER.giftPickupR * VAEL_LEDGER.giftPickupR) {
        v.giftPod = { entityId: null, gen: null, sectorId: null };
        this.helpers.removeEntity(pod.id, { reason: 'vael_rider_opened' });
        this._grant(state, VAEL_LEDGER.giftCr, 'vael_rider_gift');
        this._rep(state, VAEL_LEDGER.giftRep, 'vael_rider_gift');
        this.bus.emit('vael:riderOpened', { podId: pod.id, amount: VAEL_LEDGER.giftCr, tick: state.tick });
        this._log(state, LEDGER_BARKS.giftOpened);
        this._fileLog(state, 'rider_opened', `${VAEL_LEDGER.giftCr} cr`);
      }
    }
  },

  _postPatrol(state, sectorId, scan) {
    const v = ensureVaelState(state);
    const player = this._player(state);
    if (!player) return null;
    const id = `pat:${v.seq++}`;
    const kind = v.patrols.some((r) => r.kind === 'tender') ? 'courier' : 'tender';
    const a = frac('patrol-post', sectorId, v.seq) * TAU;
    const post = {
      x: player.pos.x + Math.cos(a) * VAEL_LEDGER.patrolSpawnR,
      z: player.pos.z + Math.sin(a) * VAEL_LEDGER.patrolSpawnR,
    };
    const name = (kind === 'tender' ? TENDER_NAMES : COURIER_NAMES)[
      hash32('patrol-name', id) % (kind === 'tender' ? TENDER_NAMES : COURIER_NAMES).length];
    const e = this.helpers.spawnEntity({
      type: 'ship', team: 1, factionId: FACTION_ID,
      pos: { x: post.x, z: post.z }, vel: { x: 0, z: 0 },
      radius: kind === 'tender' ? 18 : 13,
      mass: kind === 'tender' ? 60 : 30,
      hull: kind === 'tender' ? 400 : 160,
      hullMax: kind === 'tender' ? 400 : 160, collides: true,
      data: {
        vaelPatrol: true, patrolId: id, role: kind === 'tender' ? 'override-tender' : 'research-courier',
        // The tender kind carries the lien anchor — the tag _telegraphTenders
        // scans. Without it the contract clamp had no production producer.
        ...(kind === 'tender' ? { overrideTender: true } : {}),
        name, scannable: true,
        scanLabel: kind === 'tender'
          ? 'OVERRIDE TENDER · carries the lien anchor · contract text at 2pt'
          : 'RESEARCH COURIER · reading hulls for the desk',
      },
    });
    const row = {
      id, entityId: e.id, gen: occupantGenerationOf(e), kind,
      sectorId, post, postedAt: num(state.simTime),
      hailed: false, marked: false, phase: frac('patrol-phase', id) * TAU, aloneAt: -1,
    };
    v.patrols.push(row);
    this.bus.emit('vael:patrolPosted', {
      patrolId: id, entityId: e.id, kind, sectorId,
      post: { ...post }, tick: state.tick,
    });
    this._fileLog(state, 'patrol_posted', `${kind} · ${name}`);
    return row;
  },

  // ── Hazard clauses: the desk's posted work ────────────────────────────────────

  _tickClauses(state, dt, scan, visit) {
    const v = ensureVaelState(state);
    const player = scan.player;
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    const openCount = v.clauses.reduce((n, c) => n + (CLAUSE_OPEN.has(c.state) ? 1 : 0), 0);
    const deskOpen = this._stains(v) < VAEL_LEDGER.stainsForWork;

    if (player && state.mode === 'flight' && state.simTime >= visit.nextClauseAt) {
      visit.nextClauseAt = state.simTime + VAEL_LEDGER.clauseGapS
        + frac('clause-gap', sectorId, v.seq) * 60;
      if (deskOpen && openCount < VAEL_LEDGER.clauseMaxOpen) {
        this._postClause(state);
      } else if (!deskOpen) {
        this._log(state, LEDGER_BARKS.deskClosed);
      }
    }

    for (const clause of v.clauses) {
      if (!CLAUSE_OPEN.has(clause.state)) continue;
      // Deadlines: unsigned offers lapse clean; signed ones fail.
      const deadline = clause.state === 'signed'
        ? num(clause.signedAt) + VAEL_LEDGER.signedDeadlineS
        : num(clause.deadlineAt);
      if (state.simTime >= deadline) {
        if (clause.state === 'signed') this._failClause(state, clause, 'deadline');
        else this._lapseClause(state, clause, 'deadline');
        continue;
      }
      if (!player) continue;
      // Proximity is a signature.
      if (clause.state === 'open') {
        const target = this._clauseSubject(state, clause);
        if (target && dist2(player.pos, target.pos) <= VAEL_LEDGER.signR * VAEL_LEDGER.signR) {
          this._signClause(state, clause);
        }
        continue;
      }
      // Signed: resolve the work.
      if (clause.kind === 'haul') this._tickHaulClause(state, clause, scan);
      else if (clause.kind === 'serve') this._tickServeClause(state, clause, scan);
      else if (clause.kind === 'recovery') this._tickRecoveryClause(state, clause, scan);
    }
    this._gcClosed(v.clauses, 8);
  },

  /** The live body a clause orbits — crate, rider, defaulter, or marked debtor. */
  _clauseSubject(state, clause) {
    const id = clause.crateId ?? clause.targetId ?? clause.riderId;
    if (id == null) return null;
    const e = state.entities.get(id);
    if (!e || e.alive === false) return null;
    if (clause.crateId != null) {
      if (clause.crateGen != null && occupantGenerationOf(e) !== clause.crateGen) return null;
      if (e.data?.vaelCrate !== true) return null;
    } else if (clause.targetId != null) {
      if (clause.targetGen != null && occupantGenerationOf(e) !== clause.targetGen) return null;
      if (e.data?.vaelDefaulter !== true && e.data?.vaelClauseDebtor !== true) return null;
    } else if (clause.riderId != null) {
      if (clause.riderGen != null && occupantGenerationOf(e) !== clause.riderGen) return null;
      if (e.data?.vaelRider !== true) return null;
    }
    return e;
  },

  _postClause(state, kind = null) {
    const v = ensureVaelState(state);
    const player = this._player(state);
    if (!player) return null;
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    const id = `cls:${v.seq++}`;
    kind = kind || CLAUSE_KINDS[hash32('clause-kind', sectorId, v.seq) % CLAUSE_KINDS.length];
    const siteA = frac('clause-site-a', sectorId, id) * TAU;
    // The rider's bearing is offset from the crate's — no degenerate deliver-at-spawn.
    const siteB = siteA + 0.9 + frac('clause-site-b', sectorId, id) * 1.4;
    const site = {
      x: player.pos.x + Math.cos(siteA) * (VAEL_LEDGER.siteMinR + frac('clause-r1', id) * VAEL_LEDGER.siteSpanR),
      z: player.pos.z + Math.sin(siteA) * (VAEL_LEDGER.siteMinR + frac('clause-r1', id) * VAEL_LEDGER.siteSpanR),
    };
    const clause = {
      id, kind, state: 'open', sectorId,
      site, deliver: null,
      postedAt: num(state.simTime),
      deadlineAt: num(state.simTime) + VAEL_LEDGER.clauseLapseS,
      signedAt: null,
      payCr: kind === 'haul' ? VAEL_LEDGER.haulPayCr
        : kind === 'serve' ? VAEL_LEDGER.servePayCr : VAEL_LEDGER.recoverPayCr,
      targetId: null, targetGen: null, crateId: null, crateGen: null,
      riderId: null, riderGen: null,
      name: DEFAULTER_NAMES[hash32('clause-name', id) % DEFAULTER_NAMES.length],
    };

    if (kind === 'haul') {
      // The crate of fine print at the site; the rider buoy it answers to elsewhere.
      const crate = this.helpers.spawnEntity({
        type: 'payload', team: 0, factionId: FACTION_ID,
        pos: { ...site }, vel: { x: 0, z: 0 },
        radius: VAEL_LEDGER.crateRadius, mass: VAEL_LEDGER.crateMass,
        hull: 60, hullMax: 60, collides: true,
        data: {
          vaelCrate: true, clauseId: id, name: 'Addendum crate', scannable: true,
          scanLabel: `ADDENDUM CRATE · ${VAEL_LEDGER.crateMass}t of fine print · tow it to the rider buoy`,
        },
      });
      clause.crateId = crate.id;
      clause.crateGen = occupantGenerationOf(crate);
      clause.deliver = {
        x: player.pos.x + Math.cos(siteB) * (VAEL_LEDGER.siteMinR + frac('clause-r2', id) * VAEL_LEDGER.siteSpanR),
        z: player.pos.z + Math.sin(siteB) * (VAEL_LEDGER.siteMinR + frac('clause-r2', id) * VAEL_LEDGER.siteSpanR),
      };
      const rider = this.helpers.spawnEntity({
        type: 'payload', team: 0, factionId: FACTION_ID,
        pos: { ...clause.deliver }, vel: { x: 0, z: 0 },
        radius: 12, mass: 40, hull: 120, hullMax: 120, collides: true,
        data: {
          vaelRider: true, clauseId: id, name: 'Rider buoy', scannable: true,
          scanLabel: 'RIDER BUOY · deliver the addendum here · the desk is listening',
        },
      });
      clause.riderId = rider.id;
      clause.riderGen = occupantGenerationOf(rider);
    } else if (kind === 'serve') {
      const defaulter = this.helpers.spawnEntity({
        type: 'ship', team: 1, factionId: null,
        pos: { ...site }, vel: { x: 0, z: 0 },
        radius: 14, mass: 36, hull: 150, hullMax: 150, collides: true,
        data: {
          vaelDefaulter: true, clauseId: id, name: clause.name, scannable: true,
          scanLabel: `DEFAULTER · serve the clause · get within ${VAEL_LEDGER.serveR}`,
        },
      });
      clause.targetId = defaulter.id;
      clause.targetGen = occupantGenerationOf(defaulter);
    } else if (kind === 'recovery') {
      const debtor = this.helpers.spawnEntity({
        type: 'ship', team: 1, factionId: null,
        pos: { ...site }, vel: { x: 0, z: 0 },
        radius: 14, mass: 36, hull: 180, hullMax: 180, collides: true,
        data: {
          vaelClauseDebtor: true, clauseId: id, name: clause.name, scannable: true,
          scanLabel: `MARKED DEBTOR · owes the Vael · collect the hull`,
        },
      });
      clause.targetId = debtor.id;
      clause.targetGen = occupantGenerationOf(debtor);
      // The paper it ran from — the clamp rides it visibly.
      this._clampLien(state, debtor, null, { mass: VAEL_LEDGER.debtorAnchorMass });
    }
    v.clauses.push(clause);
    this.bus.emit('vael:clausePosted', {
      clauseId: id, kind, sectorId, site: { ...site },
      payCr: clause.payCr, deadlineAt: clause.deadlineAt, tick: state.tick,
    });
    this._fileLog(state, 'clause_posted', `${kind} · ${clause.payCr} cr`);
    this._log(state, LEDGER_BARKS.clausePosted);
    return clause;
  },

  _signClause(state, clause) {
    if (clause.state !== 'open') return;
    clause.state = 'signed';
    clause.signedAt = num(state.simTime);
    clause.deadlineAt = clause.signedAt + VAEL_LEDGER.signedDeadlineS;
    this.bus.emit('vael:clauseSigned', { clauseId: clause.id, kind: clause.kind, tick: state.tick });
    this._fileLog(state, 'clause_signed', clause.id);
    this._log(state, LEDGER_BARKS.clauseSigned);
  },

  _honorClause(state, clause, how) {
    const v = ensureVaelState(state);
    if (clause.state !== 'signed' && clause.state !== 'open') return;
    if (!this._paidOnce(v, `done:${clause.id}`)) return;
    clause.state = 'done';
    clause.how = how;
    clause.settledAt = num(state.simTime);
    const pay = Math.round(clause.payCr * this._tierMult(v));
    v.book.clauses += 1;
    // The tier crossing latches with the count — the book reads higher already.
    const row = vaelTierFor(v.book.clauses);
    const crossed = row.tier > (v.book.tier | 0);
    if (crossed) v.book.tier = row.tier;
    this._grant(state, pay, `vael_${clause.kind}:${clause.id}`);
    this._rep(state, VAEL_LEDGER.clauseRep, `vael_clause_honored`);
    this._fileLog(state, 'clause_honored', `${clause.kind} · ${pay} cr`);
    this.bus.emit('vael:clauseDone', {
      clauseId: clause.id, kind: clause.kind, how, payCr: pay, tick: state.tick,
    });
    if (crossed) {
      this.bus.emit('vael:paperTier', {
        tier: row.tier, id: row.id, label: row.label, clauses: v.book.clauses, tick: state.tick,
      });
      this.bus.emit('toast', { text: `VAEL PAPER — ${row.label.toUpperCase()}`, tone: 'good' });
      this._log(state, row.line);
    } else {
      this._log(state, LEDGER_BARKS.clauseDone);
    }
  },

  _failClause(state, clause, cause) {
    const v = ensureVaelState(state);
    if (!CLAUSE_OPEN.has(clause.state)) return;
    const wasSigned = clause.state === 'signed';
    clause.state = 'failed';
    clause.cause = cause;
    clause.settledAt = num(state.simTime);
    this._clauseCleanup(state, clause);
    if (wasSigned && this._paidOnce(v, `fail:${clause.id}`)) {
      v.book.stains += 1;
      this._rep(state, VAEL_LEDGER.failRep, 'vael_clause_broken');
      this._fileLog(state, 'stain', `${clause.id} · ${cause}`);
    }
    this.bus.emit('vael:clauseFailed', { clauseId: clause.id, kind: clause.kind, cause, tick: state.tick });
    this._log(state, LEDGER_BARKS.clauseFailed);
  },

  _lapseClause(state, clause, cause) {
    if (!CLAUSE_OPEN.has(clause.state)) return;
    clause.state = 'lapsed';
    clause.cause = cause;
    clause.settledAt = num(state.simTime);
    this._clauseCleanup(state, clause);
    this.bus.emit('vael:clauseLapsed', { clauseId: clause.id, kind: clause.kind, cause, tick: state.tick });
  },

  /** Remove the props a clause owns — spent crates, rider buoys. Never the targets. */
  _clauseCleanup(state, clause) {
    for (const [id, tag] of [[clause.crateId, 'vaelCrate'], [clause.riderId, 'vaelRider']]) {
      if (id == null) continue;
      const e = state.entities.get(id);
      if (e && e.alive !== false && e.data?.[tag] === true && e.data?.clauseId === clause.id) {
        this.helpers.removeEntity(id, { reason: 'vael_clause_closed' });
      }
    }
  },

  _tickHaulClause(state, clause, scan) {
    const crate = this._clauseSubject(state, clause);
    // A vanished crate breaks signed work; an unsigned one just withdraws itself.
    if (!crate) {
      if (clause.state === 'signed') this._failClause(state, clause, 'crate_lost');
      else this._lapseClause(state, clause, 'crate_lost');
      return;
    }
    // Delivered: the crate inside the rider ring, or at any live Vael signature.
    let delivered = false;
    if (clause.deliver && dist2(crate.pos, clause.deliver) <= VAEL_LEDGER.deliverR ** 2) delivered = true;
    if (!delivered) {
      for (const e of scan.authored) {
        if (dist2(crate.pos, e.pos) <= VAEL_LEDGER.deliverR ** 2) { delivered = true; break; }
      }
    }
    if (!delivered) return;
    this._honorClause(state, clause, 'delivered');
    this._clauseCleanup(state, clause);
  },

  _tickServeClause(state, clause, scan) {
    const defaulter = this._clauseSubject(state, clause);
    if (!defaulter) { this._lapseClause(state, clause, 'subject_lost'); return; }
    const player = scan.player;
    // The defaulter runs once signed — slow, instrument-heavy flight.
    if (clause.state === 'signed' && player) {
      const d2p = dist2(defaulter.pos, player.pos);
      if (d2p <= VAEL_LEDGER.defaulterFleeR * VAEL_LEDGER.defaulterFleeR) {
        const d = Math.sqrt(d2p) || 1;
        this._steer(state, defaulter,
          defaulter.pos.x - ((player.pos.x - defaulter.pos.x) / d) * 300,
          defaulter.pos.z - ((player.pos.z - defaulter.pos.z) / d) * 300,
          VAEL_LEDGER.defaulterSpeed, VAEL_LEDGER.writSteerK, 1 / 60);
      }
      if (d2p <= VAEL_LEDGER.serveR * VAEL_LEDGER.serveR) {
        // The clamp does the talking — the clause is served on the subject's hull.
        const anchor = this._clampLien(state, defaulter, null, {
          mass: VAEL_LEDGER.servedAnchorMass, serveLine: LEDGER_BARKS.serveClamped,
        });
        if (anchor) {
          this.bus.emit('vael:lienServed', {
            clauseId: clause.id, targetId: defaulter.id, anchorId: anchor.id, tick: state.tick,
          });
          this._honorClause(state, clause, 'served');
          return;
        }
      }
    }
  },

  _tickRecoveryClause(state, clause, scan) {
    // Resolution lives on the kill wire — here the marked debtor flees tenders.
    const debtor = this._clauseSubject(state, clause);
    if (!debtor) return; // kill wire or lapse path owns the close
    let threat = null, best = Infinity;
    for (const e of scan.writTenders.concat(scan.patrols, scan.authored)) {
      const d = dist2(debtor.pos, e.pos);
      if (d < best) { best = d; threat = e; }
    }
    if (threat && best <= VAEL_LEDGER.defaulterFleeR * VAEL_LEDGER.defaulterFleeR) {
      const d = Math.sqrt(best) || 1;
      this._steer(state, debtor,
        debtor.pos.x - ((threat.pos.x - debtor.pos.x) / d) * 300,
        debtor.pos.z - ((threat.pos.z - debtor.pos.z) / d) * 300,
        VAEL_LEDGER.defaulterSpeed, VAEL_LEDGER.writSteerK, 1 / 60);
    }
  },

  // ── Named debtors: hulls that ran from their paper ────────────────────────────

  _tickDebtors(state, dt, scan, visit) {
    const v = ensureVaelState(state);
    const player = scan.player;
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    const open = v.debtors.filter((r) => r.state === 'open');

    if (player && state.mode === 'flight' && state.simTime >= visit.nextDebtorAt) {
      visit.nextDebtorAt = state.simTime + VAEL_LEDGER.debtorGapS
        + frac('debtor-gap', sectorId, v.seq) * 80;
      if (open.length < VAEL_LEDGER.debtorMaxLive) this._postDebtor(state);
    }

    for (const row of v.debtors) {
      if (row.state !== 'open') continue;
      const e = this._boundEnt(state, row, 'vaelDebtor');
      if (!e) {
        // Gone without a kill event — the name skipped its paper entirely.
        row.state = 'skipped';
        row.settledAt = num(state.simTime);
        this._fileLog(state, 'debtor_skipped', row.name);
        this.bus.emit('vael:debtorSkipped', { debtorId: row.id, name: row.name, tick: state.tick });
        continue;
      }
      if (state.simTime >= num(row.expiresAt)) {
        row.state = 'skipped';
        row.settledAt = num(state.simTime);
        e.data.vaelDebtor = false;
        this.bus.emit('vael:debtorSkipped', { debtorId: row.id, name: row.name, tick: state.tick });
        continue;
      }
      // The paper it carries: clamped still, moved, or shot off.
      const lien = row.anchorId != null ? v.liens[row.anchorId] : null;
      if (lien && lien.hostId !== row.entityId) {
        row.state = 'transferred';
        row.settledAt = num(state.simTime);
        const anchor = state.entities.get(row.anchorId);
        const byPlayer = anchor && this._playerHandled(state, anchor);
        if (byPlayer && this._paidOnce(v, `debtor-throw:${row.id}`)) {
          const fee = Math.round(VAEL_LEDGER.debtorCollectCr * this._tierMult(v));
          this._grant(state, fee, `vael_debtor:${row.id}`);
          this._rep(state, VAEL_LEDGER.clauseRep, 'vael_debtor_thrown');
        }
        this._fileLog(state, 'debtor_transferred', row.name);
        this.bus.emit('vael:debtorTransferred', { debtorId: row.id, name: row.name, tick: state.tick });
        this._log(state, LEDGER_BARKS.debtorTransferred);
        continue;
      }
      if (!lien && !lienAnchorFor(state, row.entityId)) {
        row.state = 'anchor_lost';
        row.settledAt = num(state.simTime);
        this._fileLog(state, 'debtor_anchor_lost', row.name);
        continue;
      }
      // It runs from the desk — slow under its own clamped mass.
      if (player) {
        let threat = null, best = Infinity;
        for (const t of scan.writTenders.concat(scan.patrols)) {
          const d = dist2(e.pos, t.pos);
          if (d < best) { best = d; threat = t; }
        }
        if (threat && best <= VAEL_LEDGER.debtorFleeR * VAEL_LEDGER.debtorFleeR) {
          const d = Math.sqrt(best) || 1;
          this._steer(state, e,
            e.pos.x - ((threat.pos.x - e.pos.x) / d) * 300,
            e.pos.z - ((threat.pos.z - e.pos.z) / d) * 300,
            VAEL_LEDGER.debtorSpeed, VAEL_LEDGER.writSteerK, dt);
        }
      }
    }
    this._gcClosed(v.debtors, 6);
  },

  _postDebtor(state) {
    const v = ensureVaelState(state);
    const player = this._player(state);
    if (!player) return null;
    const sectorId = state.world && state.world.currentSectorId || 'unknown';
    const id = `dbt:${v.seq++}`;
    const a = frac('debtor-ang', sectorId, id) * TAU;
    const r = VAEL_LEDGER.siteMinR + frac('debtor-r', id) * VAEL_LEDGER.siteSpanR;
    const name = DEBTOR_NAMES[hash32('debtor-name', id) % DEBTOR_NAMES.length];
    const e = this.helpers.spawnEntity({
      type: 'ship', team: 1, factionId: null,
      pos: { x: player.pos.x + Math.cos(a) * r, z: player.pos.z + Math.sin(a) * r },
      vel: { x: 0, z: 0 }, radius: 14, mass: 36, hull: 160, hullMax: 160, collides: true,
      data: {
        vaelDebtor: true, debtorId: id, name, scannable: true,
        scanLabel: `DEBTOR IN ARREARS · clamped and running · collect for the desk`,
      },
    });
    const row = {
      id, entityId: e.id, gen: occupantGenerationOf(e), name,
      sectorId, postedAt: num(state.simTime),
      expiresAt: num(state.simTime) + VAEL_LEDGER.debtorTtlS,
      state: 'open', anchorId: null,
    };
    const anchor = this._clampLien(state, e, null, { mass: VAEL_LEDGER.debtorAnchorMass });
    row.anchorId = anchor ? anchor.id : null;
    v.debtors.push(row);
    this.bus.emit('vael:debtorPosted', {
      debtorId: id, entityId: e.id, name, sectorId,
      pos: { x: e.pos.x, z: e.pos.z }, tick: state.tick,
    });
    this._fileLog(state, 'debtor_posted', name);
    this._log(state, LEDGER_BARKS.debtorPosted);
    return row;
  },

  /** The debtor fell — a witnessed collection pays full fee; a cold down pays scrap. */
  _collectDebtor(state, row, byPlayer, pos) {
    const v = ensureVaelState(state);
    if (row.state !== 'open') return;
    row.state = byPlayer ? 'collected' : 'downed';
    row.settledAt = num(state.simTime);
    let fee = 0, witnessed = false;
    if (byPlayer && this._paidOnce(v, `debtor:${row.id}`)) {
      // A Vael signature in reach reads the collection — the desk pays full.
      // A lien anchor is metal, not a witness: the debtor's own clamp riding the
      // corpse must not turn every collection into a witnessed one.
      if (pos) {
        for (const e of state.entityList) {
          if (!e || e.alive === false || e.factionId !== FACTION_ID) continue;
          if (e.data && e.data.lienAnchor === true) continue;
          if (dist2(e.pos, pos) <= VAEL_LEDGER.debtorWitnessR * VAEL_LEDGER.debtorWitnessR) {
            witnessed = true; break;
          }
        }
      }
      fee = Math.round(VAEL_LEDGER.debtorCollectCr * this._tierMult(v)
        * (witnessed ? VAEL_LEDGER.debtorWitnessBonus : 1));
      this._grant(state, fee, `vael_debtor:${row.id}`);
      this._rep(state, witnessed ? VAEL_LEDGER.clauseRep + 1 : VAEL_LEDGER.clauseRep,
        witnessed ? 'vael_debtor_witnessed' : 'vael_debtor_collected');
      v.book.clauses += 1;
      const tierRow = vaelTierFor(v.book.clauses);
      if (tierRow.tier > (v.book.tier | 0)) {
        v.book.tier = tierRow.tier;
        this.bus.emit('vael:paperTier', {
          tier: tierRow.tier, id: tierRow.id, label: tierRow.label, clauses: v.book.clauses, tick: state.tick,
        });
      }
    }
    this._fileLog(state, byPlayer ? 'debtor_collected' : 'debtor_downed', row.name);
    this.bus.emit('vael:debtorCollected', {
      debtorId: row.id, name: row.name, byPlayer, witnessed, feeCr: fee, tick: state.tick,
    });
    this._log(state, byPlayer ? LEDGER_BARKS.debtorCollected : LEDGER_BARKS.debtorDowned);
  },

  // ── The book: dividends and turned pages ───────────────────────────────────────

  /** Punctuality dividends — the Vael pay their punctual, once per threshold. */
  _tickMilestones(state) {
    const v = ensureVaelState(state);
    VAEL_LEDGER.milestones.forEach((m, i) => {
      if (v.book.settledCr < m.cr) return;
      if (!this._paidOnce(v, `milestone:${i}`)) return;
      this._grant(state, m.pay, `vael_dividend:${i}`);
      this.bus.emit('vael:milestone', { index: i, settledCr: v.book.settledCr, payCr: m.pay, tick: state.tick });
      this._fileLog(state, 'milestone', `${m.cr} cr settled · ${m.pay} cr dividend`);
      this._log(state, LEDGER_BARKS.milestone);
    });
  },

  /** Forgiveness: enough honored clauses turn a page and close an old stain. */
  _tickBook(state) {
    const v = ensureVaelState(state);
    const earned = Math.floor((v.book.clauses | 0) / VAEL_LEDGER.forgiveEvery);
    if (earned > (v.book.forgiven | 0)) {
      v.book.forgiven = Math.min(earned, v.book.stains | 0);
      this._fileLog(state, 'page_turned', `stains ${v.book.stains - v.book.forgiven}`);
      this._log(state, LEDGER_BARKS.pageTurns);
      this.bus.emit('vael:pageTurned', {
        forgiven: v.book.forgiven, stains: this._stains(v), tick: state.tick,
      });
    }
    // Restored or externally-settled credit still catches its dividends.
    this._tickMilestones(state);
  },

  /** Drop the oldest closed rows past the keep count — bounded ledger discipline. */
  _gcClosed(rows, keepClosed) {
    let closed = 0;
    for (const r of rows) if (r && !CLAUSE_OPEN.has(r.state) && r.state !== 'open') closed++;
    let excess = closed - keepClosed;
    if (excess <= 0) return;
    for (let i = 0; i < rows.length && excess > 0; i++) {
      const r = rows[i];
      if (r && !CLAUSE_OPEN.has(r.state) && r.state !== 'open') { rows.splice(i, 1); i--; excess--; }
    }
  },

  // ── The kill wire: one ear reads every death the ledger cares about ────────────

  _onKilled(p) {
    const state = this.state;
    if (!state || !p || p.id == null) return;
    const v = ensureVaelState(state);
    const victim = state.entities.get(p.id);
    const vd = victim && victim.data;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    const pos = p.pos || (victim && victim.pos) || null;

    // A clamp died. If the pilot wore it, the debt is refiled — you cannot shoot
    // your way out of paper, only back into it.
    if (vd && vd.lienAnchor === true) {
      const lien = v.liens[p.id];
      const hostId = (lien && lien.hostId) ?? vd.hostId;
      const mass = (lien && lien.mass) ?? vd.clampMass ?? VAEL_LIEN.anchorMass;
      // A replayed kill delivery bills once — the receipt is the anchor's life.
      if (hostId === state.playerId
          && this._paidOnce(v, `anchor-kill:${p.id}:${occupantGenerationOf(victim) ?? 0}`)) {
        this._fileInvoice(state, {
          amount: Math.round(mass * VAEL_LIEN.payoffPerTonne),
          mass, cause: 'anchor_destroyed',
        });
        this._fileLog(state, 'anchor_destroyed', `${mass}t refiled`);
      }
      this._releaseLien(state, victim, lien);
      return;
    }

    // A Vael signature was broken. Unprovoked, the desk files the pilot's name in
    // blood print — a bill, not a bounty; the Vael collect in credit, not corpses.
    if (victim && (victim.factionId === FACTION_ID || vd?.vaelPatrol === true || vd?.vaelWrit === true)) {
      const isWrit = vd?.vaelWrit === true;
      if (isWrit) {
        const writ = v.writs.find((w) => w.id === vd.writId && w.state === 'open');
        if (writ && byPlayer) {
          if (this._paidOnce(v, `writ-kill:${p.id}:${occupantGenerationOf(victim) ?? 0}`)) {
            v.book.stains += 1;
            this._rep(state, VAEL_LEDGER.writKillRep, 'vael_writ_killed');
            this._fileLog(state, 'writ_hull_killed', writ.invoiceId);
            this._log(state, LEDGER_BARKS.writKilled);
            this.bus.emit('vael:writHullKilled', {
              writId: writ.id, invoiceId: writ.invoiceId, entityId: p.id, tick: state.tick,
            });
          }
        }
      } else if (byPlayer && p.targetHostileToPlayer !== true) {
        if (this._paidOnce(v, `blood:${p.id}:${occupantGenerationOf(victim) ?? 0}`)) {
          v.book.stains += 1;
          this._rep(state, VAEL_LEDGER.bloodRep, 'vael_hull_killed');
          this._fileInvoice(state, {
            amount: VAEL_LEDGER.bloodBillCr,
            mass: Math.round(VAEL_LEDGER.bloodBillCr / VAEL_LIEN.payoffPerTonne),
            cause: 'blood',
          });
        }
      }
    }

    // A marked debtor fell — the desk pays the collector.
    if (vd && vd.vaelDebtor === true) {
      const row = v.debtors.find((r) => r.entityId === p.id && r.state === 'open'
        && (r.gen == null || occupantGenerationOf(victim) === r.gen));
      if (row) this._collectDebtor(state, row, byPlayer, pos);
    }

    // Clause subjects: a destroyed crate breaks the haul; a destroyed defaulter
    // breaks the service; a collected recovery name pays.
    for (const clause of v.clauses) {
      if (!CLAUSE_OPEN.has(clause.state)) continue;
      if (clause.crateId === p.id && vd?.vaelCrate === true
          && (clause.crateGen == null || occupantGenerationOf(victim) === clause.crateGen)) {
        if (clause.state === 'signed') this._failClause(state, clause, 'crate_destroyed');
        else this._lapseClause(state, clause, 'crate_destroyed');
        continue;
      }
      if (clause.targetId !== p.id) continue;
      const genOk = clause.targetGen == null || occupantGenerationOf(victim) === clause.targetGen;
      if (!genOk) continue;
      if (clause.kind === 'serve' && vd?.vaelDefaulter === true) {
        if (clause.state === 'signed') this._failClause(state, clause, 'subject_destroyed');
        else this._lapseClause(state, clause, 'subject_destroyed');
      } else if (clause.kind === 'recovery' && vd?.vaelClauseDebtor === true) {
        if (byPlayer) {
          if (clause.state === 'open') this._signClause(state, clause);
          this._honorClause(state, clause, 'recovered');
        } else {
          this._lapseClause(state, clause, 'target_downed');
        }
      }
    }
  },

  update(dt, state) {
    const v = ensureVaelState(state);
    const visit = this._visit(state);
    this._telegraphTenders(state);
    this._tickAnchors(state, dt);
    this._overrideHead(state, dt);
    const scan = this._scan(state);
    this._tickInvoices(state);
    this._tickWrits(state, dt, scan);
    this._tickPatrols(state, dt, scan, visit);
    this._tickClauses(state, dt, scan, visit);
    this._tickDebtors(state, dt, scan, visit);
    this._tickBook(state);
  },
};

export { VAEL_HULL_SCRIPT };
export default vaelLiens;
