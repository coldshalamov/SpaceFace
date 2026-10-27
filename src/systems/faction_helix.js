// Helix identity mechanics — build_map §34 row 526, expansion bible 02 §9.
//
//   * TOO-PERFECT FALSE FLAGS — a Helix pack wears another faction's colors and flies
//     exact geometry; the perfection is the tell. Fling one member off its slot and
//     every transponder in the pack flips to HELIX at once.
//   * LIEN DRONES — small, polite, adhesive. One sticks a fine to a hull, rides it as
//     dead mass while it files, then lets go dead. Scrape it off inside the dwell and
//     nothing files.
//
// THE DOCKET — the paperwork economy the pilot plugs into:
//   · ASSESSMENT DESKS — authored audit buoys (data.helixAudit) and Bureau-fielded
//     desk hulls; each answers to a named clerk whose strictness is the desk's law.
//   · VARIANCE NOTICES — the desk's wire: file a manifest at rest in its ring, tow an
//     untitled hulk in, break a masked pack, or collect a hull the liens marked.
//     Verified work pays; ignored work accrues variance.
//   · THE FINE DOCKET — a filed lien is a collectible instrument: settle at a desk,
//     contest once before the clerk, or run to garnish (the hold, plus the fee).
//   · MANIFEST FILING — a paid declaration; while it holds, a clean audit pays.
//   · FIELD ASSESSORS — audit hulls ride out, close, and hold a reading dwell.
//     Clean pays; undeclared bills; open fines grow a surcharge; refusing the read
//     is filed as evasion.
//   · WARRANTS & WRIT CUTTERS — breaking Bureau instruments posts a warrant on the
//     pilot's name. Enough heat fields writ cutters that close and levy a seizure
//     clamp on contact until the heat is served; remit at a desk, or let it go
//     dormant — the file remembers and the next warrant inherits.
//   · VARIANCE — the Bureau's patience, spent and slowly restored; it hastens
//     audits and widens the writ crew.
//   · PRECEDENTS — the first of each instrument the pilot touches pays once, stamped.
//   · CLEARANCE — deeds raise a docket standing tier that scales payouts and appeals.
//
// Data contract (stamps this system reads): member.data.helixFalseFlag, .helixPack,
// .helixSlot{dx,dz}; drone.data.lienDrone; desk.data.helixAudit / .helixDeskId.
// Stamps written: member.factionId + data.falseFlagDropped/wasMaskedFaction;
// ship.data.lienStuck/lienMassT/lienFiledCr; wreck.data.helixNoticeId;
// assessor.data.helixAssessor; cutter.data.helixWritId; desk.data.helixDeskId.
//
// Determinism: geometry + simTime; every roll is hash32 over ids/seqs — no RNG,
// no wall clock. Money moves ONLY through economy:grantCredits/chargeCredits;
// standing ONLY through faction:repDelta; force ONLY through queuePhysicsImpulse.
// Latches land before emits. Live bodies are bound by id + occupantGeneration +
// an ownership tag in .data — a recycled id is never the same instrument. All
// docket state is plain JSON under state.helix; save:loaded re-normalizes and
// grants nothing for free. Manifest id 'faction_helix'.

import { faction as HELIX } from '../data/factions/helix.js';
import { hash32 } from '../core/rng.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

const FLAG = (HELIX.custom && HELIX.custom.falseFlag) || {};
const LIEN = (HELIX.custom && HELIX.custom.lienDrone) || {};
const PATTERN_BREAK_WU = Math.max(1, Number(FLAG.patternBreakWu) || 70);
const ATTACH_WU = Math.max(1, Number(LIEN.attachWu) || 40);
const FILE_AFTER_S = Math.max(1, Number(LIEN.fileAfterS) || 12);
const FINE_CR = Math.max(0, Number(LIEN.fineCr) || 150);
const LIEN_MASS_T = Math.max(0, Number(LIEN.lienMassT) || 6);

const FACTION_ID = 'faction_helix';
const TAU = Math.PI * 2;
const PAID_STAMPS_CAP = 96;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

/** Live entity by id — Map fast path, list fallback. Callers check gen + tag. */
function ent(state, id) {
  if (id == null) return null;
  const m = state.entities;
  if (m && typeof m.get === 'function') { const e = m.get(id); if (e) return e; }
  for (const e of entityListOf(state)) if (e && e.id === id) return e;
  return null;
}

// ── Assessment desks — notices post from them, filings settle at them ─────────
export const HELIX_DESKS = Object.freeze({
  firstDeskS: 100, deskGapS: 480,           // first field desk / re-post pacing
  spawnR: 1500, serveR: 260,                // field distance / service ring
  deskHull: 260, deskRadius: 22, deskMass: 400,
  maxFielded: 1,                            // Bureau-fielded desks (authored never count)
  orphanS: 75, leaveR: 2800,                // abandoned this long past this range → recall
  deskCap: 24,                              // bounded desk ledger
});

// ── Variance notices — the desk's wire ─────────────────────────────────────────
export const HELIX_NOTICES = Object.freeze({
  firstNoticeS: 40, noticePeriodS: 130, noticeJitterS: 70,
  ttlS: 380,                                // an open notice nobody closes lapses
  maxOpen: 4, maxPerDesk: 1, keepClosed: 10,
  dwellS: 3, fileSpeedMax: 9,               // manifest filing: hold in ring, near rest
  salvageClaimR: 900, collectScanR: 2600,   // a hulk / lien-marked hull this close counts
  payCr: Object.freeze({ manifest: 110, salvage: 270, pack: 340, collect: 0.55 }),
  verifyRep: 2, lapseVariance: 4,
  filedPayMult: 1.15,                       // a filed manifest earns the courtesy rate
});
const NOTICE_KINDS = Object.freeze(['manifest', 'salvage', 'pack', 'collect']);
const NOTICE_LINES = Object.freeze({
  manifest: Object.freeze([
    'VARIANCE {id}: unlogged transit in this sector. Present your manifest at the desk.',
    'VARIANCE {id}: your hold reads blank. The desk takes declarations.',
    'VARIANCE {id}: manifest absent. File it, or the file files you.' ]),
  salvage: Object.freeze([
    'VARIANCE {id}: untitled mass on the ring. Bring it to title — the desk pays.',
    'VARIANCE {id}: a hulk drifts unowned. Title transfers at the desk.',
    'VARIANCE {id}: salvage unclaimed in the register. Carry it in.' ]),
  pack: Object.freeze([
    'VARIANCE {id}: unregistered tonnage flying in formation. Unmask it for the record.',
    'VARIANCE {id}: a convoy holds perfect geometry. Perfection wants assessment.',
    'VARIANCE {id}: the registry shows four hulls and no papers. Drop their flag.' ]),
  collect: Object.freeze([
    'VARIANCE {id}: a hull rides unpaid liens. The Bureau posts the collection.',
    'VARIANCE {id}: filed liens outstanding on a live hull. Service pays a share.',
    'VARIANCE {id}: the addendum was never answered. Collect the instrument.' ]),
});

// ── The fine docket — settle, contest once, or run to garnish ─────────────────
export const HELIX_FINES = Object.freeze({
  graceS: 240, overdueVariance: 6,          // due window / letting it lapse files once
  garnishAfterS: 300, garnishFeeCr: 140,    // overdue this long → the hold, plus the fee
  garnishVariance: 10,
  courtCostCr: 90,                          // a lost appeal adds the desk's costs
  appealBase: 0.5, appealPerTier: 0.08,     // standing is a legal argument
  undeclaredFineCr: 110,                    // an audit with no manifest bills this
  instrumentFineCr: 170,                    // a destroyed Bureau instrument bills this
  manifestFeeCr: 60, manifestValidS: 600,   // the declaration's price / window
  maxRows: 24, keepClosed: 16,
});

// ── Field assessors — the audit that rides out to you ──────────────────────────
export const HELIX_AUDIT = Object.freeze({
  firstAuditS: 190, auditPeriodS: 310, auditJitterS: 90,
  retryS: 90,                               // an aborted read is rescheduled promptly
  hastenAt: 45, hastenMult: 0.5,            // variance halves the audit beat
  cap: 2, spawnR: 140,                      // live assessors / the ring they ride out from
  speed: 42, holdR: 130, breakR: 950,
  dwellS: 4, giveUpS: 150,
  rebateCr: 95, cleanRep: 1,                // a clean read pays for compliance
  findingsSurchargeCr: 150, findingsVariance: 8, findingsRep: -1,
  undeclaredVariance: 5, evadedVariance: 10,
  assessorHull: 120, assessorRadius: 13, assessorMass: 30,
});

// ── Warrants & writ cutters — the file that chases you ─────────────────────────
export const HELIX_WARRANT = Object.freeze({
  windowS: 720,                             // an open warrant runs this long, then dormancy
  serveHeat: 30, dormantCarry: 20,          // heat that fields cutters / heat that survives
  writMax: 2, writExtraAt: 60, writBeatS: 16, // crew cap / +1 at high variance / spawn beat
  writHull: 170, writRadius: 14, writMass: 44, writSpeed: 54, spawnR: 1200,
  clampR: 95,                               // the seizure clamp bites inside this
  levyCr: 120, levyBeatS: 3, levyHeatDrop: 12, // the clamp takes on this beat, serves heat
  clampBrakeFrac: 0.3,                      // the clamp scrubs this much hull velocity
  settleBaseCr: 380, settlePerHeatCr: 6, settleRep: 4,
});
const WARRANT_HEAT = Object.freeze({
  desk_wrecked: 60, assessor_killed: 45, adjudicator_killed: 40,
  courier_killed: 40, writ_killed: 25,
});

// ── Variance — the Bureau's patience, spent and slowly restored ────────────────
export const HELIX_VARIANCE = Object.freeze({
  max: 100, decayPerS: 0.04,
  jumped: 10, instrument: 6, adjudicator: 12, assessor: 15, desk: 30, writKilled: 8,
});

// ── Precedents — the Bureau pays for new law, once each ─────────────────────────
export const HELIX_PRECEDENTS = Object.freeze({ bonusCr: 260, rep: 2 });

// ── Clearance — deeds are the only resume the Bureau reads ─────────────────────
export const HELIX_TIERS = Object.freeze([
  { tier: 0, deeds: 0, id: 'unfiled', label: 'Unfiled Party', payMult: 1.0,
    line: 'The Bureau has not yet decided what you are.' },
  { tier: 1, deeds: 3, id: 'third_party', label: 'Third Party', payMult: 1.12,
    line: 'You appear in the record now. The record is pleased.' },
  { tier: 2, deeds: 8, id: 'licensed', label: 'Licensed Contractor', payMult: 1.28,
    line: 'Your paperwork precedes you. It is mostly in order.' },
  { tier: 3, deeds: 15, id: 'bonded', label: 'Bonded Agent', payMult: 1.5,
    line: 'The Bureau extends you its credit and its patience.' },
  { tier: 4, deeds: 26, id: 'instrument', label: 'Directorate Instrument', payMult: 1.8,
    line: 'For all purposes that matter, you are a form the Bureau trusts.' },
]);

export function helixTierFor(deeds) {
  const d = Math.max(0, intOr(deeds));
  let row = HELIX_TIERS[0];
  for (const t of HELIX_TIERS) if (d >= t.deeds) row = t;
  return row;
}

// ── The clerks — authored adjudicators; every desk answers to one ──────────────
export const HELIX_CLERKS = Object.freeze([
  { id: 'clerk_ila_voss', ref: 'REF 11-A', name: 'ADJUDICATOR ILA VOSS', strict: 0.10,
    line: 'Read the invoice first. Then argue.' },
  { id: 'clerk_marn_hale', ref: 'REF 7-K', name: 'CHIEF CLERK MARN HALE', strict: -0.10,
    line: 'The forms are a kindness, pilot. Use them.' },
  { id: 'clerk_osei_brandt', ref: 'REF 30-F', name: 'ASSESSOR OSEI BRANDT', strict: 0.25,
    line: 'Variance is a debt the hull owes itself.' },
  { id: 'clerk_petra_ansel', ref: 'REF 2-B', name: 'UNDER-ADJUDICATOR PETRA ANSEL', strict: -0.05,
    line: 'Every file deserves one honest reading.' },
  { id: 'clerk_44c', ref: 'REF 44-C', name: 'SENIOR ADJUDICATOR 44-C', strict: 0.40,
    line: 'The seizure clamp is a courtesy.' },
]);

/** The clerk a desk answers to — an authored tag wins, else the roster hashes it. */
export function helixClerkFor(deskKey, authoredClerkId) {
  const hit = typeof authoredClerkId === 'string' && HELIX_CLERKS.find((c) => c.id === authoredClerkId);
  return hit || HELIX_CLERKS[hash32('helix-clerk', deskKey) % HELIX_CLERKS.length];
}
const clerkById = (id) => HELIX_CLERKS.find((c) => c.id === id) || HELIX_CLERKS[0];

// ── Bureau voice — the register the desks speak in ──────────────────────────────
export const HELIX_BARKS = Object.freeze({
  deskFielded: 'Assessment desk on station. Filings are being taken.',
  deskRecalled: 'The desk re-files elsewhere. The paperwork follows.',
  deskLost: 'An assessment desk is down. The Bureau notes the instrument.',
  noticeVerified: 'Variance closed. The desk settles the account.',
  noticeLapsed: 'A variance went unanswered. It accrues.',
  finePosted: 'Instrument filed. The grace clock is running — settle or contest.',
  finePaid: 'Instrument settled. The Bureau notes prompt payment.',
  fineOverdue: 'Instrument overdue. The garnish clock has started.',
  garnished: 'GARNISHED. The Bureau took what the hold held, plus its fee.',
  garnishEmpty: 'Garnish returned empty. The fee itself is filed.',
  appealVoid: 'APPEAL HEARD — instrument voided. The record corrects itself.',
  appealUpheld: 'APPEAL HEARD — instrument upheld. The desk adds its costs.',
  manifestFiled: 'Manifest on file. Audits will find you in order.',
  auditOut: 'A field assessor has your bearing. Hold for the reading.',
  auditClean: 'READ CLEAN. The Bureau pays for compliance.',
  auditUndeclared: 'NO MANIFEST ON FILE. The unlogged transit is billed.',
  auditFindings: 'OPEN INSTRUMENT FOUND. A surcharge accrues to the file.',
  auditEvaded: 'The read was refused. Evasion is itself a finding.',
  warrantPosted: 'WARRANT FILED. The Bureau files the name, not the hull.',
  warrantSettled: 'Account remitted. The warrant is spent.',
  warrantDormant: 'The warrant goes dormant. The file remembers.',
  writLevy: 'SEIZURE CLAMP. The writ takes its due on contact.',
  precedent: 'PRECEDENT FILED. The Bureau pays for new law.',
  instrumentDestroyed: 'A Bureau instrument was destroyed. The charge is filed.',
  collected: 'Debt collected. The Bureau pays the server a share.',
  titled: 'Title transferred. Untitled mass is now on the register.',
});

// ── Docket state — plain JSON, bounded, normalized on read ───────────────────────
const FINE_STATES = new Set(['open', 'paid', 'void', 'garnished']);
const NOTICE_STATES = new Set(['open', 'verified', 'lapsed', 'jumped']);
const WARRANT_STATES = new Set(['open', 'settled', 'dormant']);

function normalizeDeskRec(rec, now = 0) {
  if (!isObj(rec.pos)) rec.pos = { x: 0, z: 0 };
  rec.pos.x = num(rec.pos.x); rec.pos.z = num(rec.pos.z);
  rec.entityId = rec.entityId ?? null;
  rec.gen = rec.gen == null ? null : intOr(rec.gen, null);
  rec.sectorId = rec.sectorId ?? null;
  // The clerk is a roster id or it is nobody's — a foreign string must not ride
  // the row into appeal math; the roster fallback owns unknown ids.
  rec.clerkId = clerkById(str(rec.clerkId) || helixClerkFor(rec.key).id).id;
  rec.authored = rec.authored === true;
  rec.gone = rec.gone === true;
  rec.firstSeenAt = num(rec.firstSeenAt);
  rec.lastSeenAt = num(rec.lastSeenAt);
  rec.awayT = Math.max(0, num(rec.awayT));
  // A far-future stamp must not silence the desk forever; a legit stamp never
  // outruns its own period, so the bound never tightens real scheduling.
  rec.nextNoticeAt = Math.min(
    num(rec.nextNoticeAt, rec.firstSeenAt + HELIX_NOTICES.firstNoticeS),
    now + HELIX_NOTICES.noticePeriodS + HELIX_NOTICES.noticeJitterS);
  rec.nextAuditAt = Math.min(
    num(rec.nextAuditAt, rec.firstSeenAt + HELIX_AUDIT.firstAuditS),
    now + HELIX_AUDIT.auditPeriodS + HELIX_AUDIT.auditJitterS);
  return rec;
}

function normalizeNotice(n, now = 0) {
  if (!isObj(n.pos)) n.pos = { x: 0, z: 0 };
  n.pos.x = num(n.pos.x); n.pos.z = num(n.pos.z);
  n.deskKey = str(n.deskKey);
  n.state = NOTICE_STATES.has(n.state) ? n.state : 'open';
  n.postedAt = num(n.postedAt);
  n.expiresAt = Math.min(num(n.expiresAt, n.postedAt + HELIX_NOTICES.ttlS), now + HELIX_NOTICES.ttlS);
  n.dwellT = Math.max(0, num(n.dwellT));
  n.packId = n.packId == null ? null : str(n.packId, null);
  n.wreckId = n.wreckId ?? null;
  n.wreckGen = n.wreckGen == null ? null : intOr(n.wreckGen, null);
  n.targetId = n.targetId ?? null;
  n.targetGen = n.targetGen == null ? null : intOr(n.targetGen, null);
  n.owedCr = Math.max(0, num(n.owedCr));
  n.closedAt = num(n.closedAt);
  return n;
}

function normalizeFine(f, now = 0) {
  f.cause = str(f.cause, 'lien');
  f.amount = Math.max(1, Math.round(num(f.amount)));
  f.issuedAt = num(f.issuedAt);
  // A far-future dueAt pins an open instrument past every remedy — bound it so
  // the garnish clock can still close the file.
  f.dueAt = Math.min(num(f.dueAt, f.issuedAt + HELIX_FINES.graceS),
    now + HELIX_FINES.graceS + HELIX_FINES.garnishAfterS);
  f.status = FINE_STATES.has(f.status) ? f.status : 'open';
  f.contested = f.contested === true;
  f.overdueStamped = f.overdueStamped === true;
  f.subjectId = f.subjectId ?? null;
  f.settledAt = num(f.settledAt);
  f.surcharges = Math.max(0, Math.round(num(f.surcharges)));
  return f;
}

function normalizeWarrant(w, now = 0) {
  w.cause = str(w.cause, 'bureau_record');
  w.heat = Math.max(0, num(w.heat));
  w.postedAt = num(w.postedAt);
  w.expiresAt = Math.min(num(w.expiresAt, w.postedAt + HELIX_WARRANT.windowS),
    now + HELIX_WARRANT.windowS);
  w.seized = Math.max(0, Math.round(num(w.seized)));
  w.state = WARRANT_STATES.has(w.state) ? w.state : 'open';
  w.nextWritAt = Math.min(num(w.nextWritAt, w.postedAt), now + HELIX_WARRANT.writBeatS);
  w.settledAt = num(w.settledAt);
  return w;
}

function normalizeAssessorRow(r) {
  r.gen = r.gen == null ? null : intOr(r.gen, null);
  r.deskKey = str(r.deskKey);
  r.auditId = str(r.auditId);
  r.spawnedAt = num(r.spawnedAt);
  r.holdT = Math.max(0, num(r.holdT));
  r.beganRead = r.beganRead === true;
  return r;
}

/** Fresh serializable Helix record: the legacy packs/liens plus the whole docket.
 *  Malformed rows are dropped outright — a corrupt row must not sink the tick. */
export function ensureHelixState(state) {
  const hx = state.helix || (state.helix = {});
  const now = num(state.simTime);
  if (!isObj(hx.droppedPacks)) hx.droppedPacks = {};
  if (!isObj(hx.liensFiled)) hx.liensFiled = {};
  hx.seq = Math.max(0, intOr(hx.seq));
  hx.deeds = Math.max(0, intOr(hx.deeds));
  // The announced-tier latch cannot sit above what the deeds earned — a hostile
  // stamp would silence every future announcement. A low stamp still announces
  // once at the next deed, which is the honest behavior for unearned stamps.
  hx.tier = Math.max(0, Math.min(intOr(hx.tier), helixTierFor(hx.deeds).tier));
  hx.variance = Math.max(0, Math.min(HELIX_VARIANCE.max, num(hx.variance)));
  // firstDeskS paces the Bureau's first field desk — a missing stamp means "soon",
  // and a far-future stamp means the same thing rather than "never".
  hx.nextDeskAt = Math.min(
    num(hx.nextDeskAt, now + HELIX_DESKS.firstDeskS), now + HELIX_DESKS.deskGapS);
  hx.lastDormantHeat = Math.max(0, num(hx.lastDormantHeat));
  if (!isObj(hx.paid)) hx.paid = {};
  if (!isObj(hx.precedents)) hx.precedents = {};
  if (!isObj(hx.desks)) hx.desks = {};
  for (const k of ['notices', 'fines', 'warrants', 'assessors', 'writCrew', 'ledger']) {
    if (!Array.isArray(hx[k])) hx[k] = [];
  }
  if (hx.manifest === undefined) hx.manifest = null;
  else if (hx.manifest !== null) {
    const m = hx.manifest;
    if (!isObj(m) || !Number.isFinite(m.filedAt) || !Number.isFinite(m.expiresAt)) hx.manifest = null;
    // A far-future expiry reads clean forever — every audit a free rebate and
    // no unlogged transit ever billed. Bound it to a freshly filed window, the
    // same repair every other clock in this bag gets.
    else m.expiresAt = Math.min(m.expiresAt, now + HELIX_FINES.manifestValidS);
  }
  for (const k of Object.keys(hx.desks)) {
    const r = hx.desks[k];
    if (!isObj(r)) { delete hx.desks[k]; continue; }
    r.key = k;
    normalizeDeskRec(r, now);
  }
  const deskKeys = Object.keys(hx.desks);
  if (deskKeys.length > HELIX_DESKS.deskCap) {
    deskKeys.sort((a, b) =>
      (hx.desks[a].gone === true ? 0 : 1) - (hx.desks[b].gone === true ? 0 : 1)
      || hx.desks[a].lastSeenAt - hx.desks[b].lastSeenAt);
    for (let i = 0; i < deskKeys.length - HELIX_DESKS.deskCap; i++) delete hx.desks[deskKeys[i]];
  }
  const rows = (arr, ok, fix) => arr.filter(ok).map(fix);
  hx.notices = rows(hx.notices,
    (n) => isObj(n) && typeof n.id === 'string' && NOTICE_KINDS.includes(n.kind),
    (n) => normalizeNotice(n, now));
  // Open filings are gated by maxOpen and closed rows by keepClosed — a bag
  // bigger than both cannot be legitimate, and a hostile one must not wedge.
  const noticeCap = HELIX_NOTICES.maxOpen + HELIX_NOTICES.keepClosed;
  if (hx.notices.length > noticeCap) hx.notices.splice(0, hx.notices.length - noticeCap);
  hx.fines = rows(hx.fines, (f) => isObj(f) && typeof f.id === 'string', (f) => normalizeFine(f, now));
  if (hx.fines.length > HELIX_FINES.maxRows) hx.fines.splice(0, hx.fines.length - HELIX_FINES.maxRows);
  hx.warrants = rows(hx.warrants, (w) => isObj(w) && typeof w.id === 'string', (w) => normalizeWarrant(w, now));
  if (hx.warrants.length > 8) hx.warrants.splice(0, hx.warrants.length - 8);
  hx.assessors = rows(hx.assessors, (r) => isObj(r) && r.entityId != null, normalizeAssessorRow);
  // The audit cap is the ceiling on live assessors — a bag beyond it is
  // hostile filler that would otherwise take O(n²) splicing to reap.
  if (hx.assessors.length > HELIX_AUDIT.cap) hx.assessors.splice(0, hx.assessors.length - HELIX_AUDIT.cap);
  hx.writCrew = hx.writCrew.filter((r) => isObj(r) && r.entityId != null && typeof r.warrantId === 'string');
  // Crew rows belong to open warrants — one serves at a time in production.
  if (hx.writCrew.length > (HELIX_WARRANT.writMax + 1) * 2) {
    hx.writCrew.splice(0, hx.writCrew.length - (HELIX_WARRANT.writMax + 1) * 2);
  }
  hx.ledger = hx.ledger.filter((r) => isObj(r) && typeof r.id === 'string' && typeof r.kind === 'string');
  if (hx.ledger.length > 32) hx.ledger.splice(0, hx.ledger.length - 32);
  // droppedPacks gates re-drops and liensFiled only carries historical totals —
  // evicting surplus keys harms nothing, and a hostile save cannot be allowed to
  // carry an unbounded stamp bag into every serialize.
  for (const bag of ['paid', 'precedents', 'droppedPacks', 'liensFiled']) {
    const keys = Object.keys(hx[bag]);
    for (let i = 0; i < keys.length - PAID_STAMPS_CAP; i++) delete hx[bag][keys[i]];
  }
  // Every minted id ends in the serial it spent — a hostile low seq re-mints
  // 'ntc:0' over a live filing, and the paid/verdict/tag latches all key on
  // that string. Lift the counter past every suffix already in the bag; a
  // legit bag is already past its own stamps, so the lift is a no-op there.
  const lift = (id) => {
    const m = typeof id === 'string' ? /(\d+)$/.exec(id) : null;
    if (m) hx.seq = Math.max(hx.seq, (Number(m[1]) || 0) + 1);
  };
  for (const n of hx.notices) lift(n.id);
  for (const f of hx.fines) lift(f.id);
  for (const w of hx.warrants) lift(w.id);
  for (const r of hx.assessors) lift(r.auditId);
  for (const r of hx.ledger) lift(r.id);
  for (const k of Object.keys(hx.desks)) lift(k);
  // Paid stamps embed the instrument id they spent ('jumped:ntc:7') — a stale
  // stamp must not mute the consequence of a fresh filing that re-mints it.
  for (const k of Object.keys(hx.paid)) lift(k);
  return hx;
}

/** The pilot's Bureau standing: current tier row plus the deed count behind it. */
export function helixStanding(state) {
  const hx = ensureHelixState(state);
  const row = helixTierFor(hx.deeds);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, deeds: hx.deeds };
}

/** The whole docket for a HUD/board surface — copies, never live rows. */
export function helixDocket(state) {
  const hx = ensureHelixState(state);
  const now = num(state.simTime);
  return {
    standing: helixStanding(state),
    variance: hx.variance,
    manifest: hx.manifest ? { ...hx.manifest, valid: now < hx.manifest.expiresAt } : null,
    desks: Object.keys(hx.desks).map((k) => ({ ...hx.desks[k], pos: { ...hx.desks[k].pos } })),
    notices: hx.notices.map((n) => ({ ...n, pos: { ...n.pos } })),
    fines: hx.fines.map((f) => ({ ...f, overdue: f.status === 'open' && now >= f.dueAt })),
    warrants: hx.warrants.map((w) => ({ ...w })),
    assessors: hx.assessors.map((r) => ({ ...r })),
    writCrew: hx.writCrew.length,
    ledger: hx.ledger.map((r) => ({ ...r })),
    precedents: Object.keys(hx.precedents).length,
  };
}

export const factionHelix = {
  name: 'faction_helix',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureHelixState(this.state);
    if (this._subs) this.destroy(); // a re-init must not double-subscribe the kill wire
    this._subs = [];
    this._restoredFromSave = false;
    if (this.bus && typeof this.bus.on === 'function') {
      this._subs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
      // A restore re-normalizes the docket and rebuilds nothing for free: ledger
      // rows rebind to live bodies by id + generation + tag on the next tick.
      this._subs.push(this.bus.on('save:loaded', () => this._afterRestore()));
      // resetRunState/FRESH_RUN_SYSTEMS do not know this additive tree — without
      // the run boundary the last pilot's open fines, warrants, and spent
      // precedents become the next pilot's file. Reassert the empty docket on
      // every spelling of the boundary: the canonical game:new → game:started
      // transition and the legacy game:newGame alias the boot emits mid-route.
      const reset = () => this.newGame();
      this._subs.push(this.bus.on('game:new', reset));
      this._subs.push(this.bus.on('game:newGame', reset));
      this._subs.push(this.bus.on('game:started', reset));
    }
  },

  destroy() {
    for (const off of this._subs || []) { try { off && off(); } catch { /* hygiene */ } }
    this._subs = [];
  },

  /** Fresh run, fresh file — another pilot's docket is never this pilot's. */
  newGame() {
    const state = this.state;
    if (!state) return;
    state.helix = null;
    ensureHelixState(state);
  },

  // ── persistence: the whole docket rides the save as one plain-JSON bag ──────
  // serialize() already returns a fresh deep clone — the envelope's defensive
  // copy would only clone a clone.
  saveSnapshotOwned: true,

  serialize() {
    const state = this.state;
    if (!state) return {};
    return JSON.parse(JSON.stringify(ensureHelixState(state)));
  },

  deserialize(data) {
    const state = this.state;
    if (!state) return;
    this._restoredFromSave = true;
    // An absent or corrupt bag restores to a fresh docket; desk/notice/writ rows
    // rebind to live bodies by id + generation + tag on the next tick.
    state.helix = isObj(data) ? data : null;
    return ensureHelixState(state);
  },

  /** Runs on save:loaded, after every restore seam has settled — a save that
   *  carried no docket payload leaves the live bag as bleed-over from the run
   *  the load replaced, and another pilot's file is never this pilot's file. */
  _afterRestore() {
    const state = this.state;
    if (!state) return;
    if (this._restoredFromSave !== true) state.helix = null;
    this._restoredFromSave = false;
    ensureHelixState(state);
  },

  // ── shared plumbing ──────────────────────────────────────────────────────────

  _log(state, text, from = 'HELIX BUREAU', kind = 'machine') {
    if (typeof text === 'string' && text && this.bus) {
      this.bus.emit('comms:log', { from, text, kind });
    }
  },

  _pickLine(lines, id, salt = 0) {
    if (!Array.isArray(lines) || !lines.length) return '';
    return lines[hash32('helix-bark', id, salt) % lines.length].replace('{id}', id || '—');
  },

  /** Once-only stamp for money/rep side-effects keyed by a content id. */
  _paidOnce(hx, key) {
    if (!isObj(hx.paid)) hx.paid = {};
    if (hx.paid[key] != null) return false;
    hx.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(hx.paid);
    for (let i = 0; i < keys.length - PAID_STAMPS_CAP; i++) delete hx.paid[keys[i]];
    return true;
  },

  _credits(state) { return num(state.player && state.player.credits); },

  _grant(state, amount, reason) {
    const n = Math.round(num(amount));
    if (Number.isSafeInteger(n) && n > 0 && this.bus) {
      this.bus.emit('economy:grantCredits', { amount: n, reason });
    }
  },

  _charge(state, amount, reason) {
    const n = Math.round(num(amount));
    if (Number.isSafeInteger(n) && n > 0 && this.bus) {
      this.bus.emit('economy:chargeCredits', { amount: n, reason });
    }
  },

  _rep(state, delta, reason) {
    const d = num(delta);
    if (Number.isFinite(d) && d !== 0 && this.bus) {
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
    }
  },

  _tierMult(hx) { return helixTierFor(hx.deeds).payMult; },

  _addVariance(hx, amount) {
    const v = num(amount);
    if (Number.isFinite(v) && v !== 0) {
      hx.variance = Math.max(0, Math.min(HELIX_VARIANCE.max, hx.variance + v));
    }
  },

  /** A finished piece of Bureau work: count it, raise the tier when it crosses. */
  _deed(state, kind, refId) {
    const hx = ensureHelixState(state);
    hx.deeds = (hx.deeds | 0) + 1;
    const row = helixTierFor(hx.deeds);
    this.bus && this.bus.emit('helix:deed', {
      kind, ref: refId ?? null, deeds: hx.deeds, tier: row.tier, tick: state.tick,
    });
    if (row.tier > (hx.tier | 0)) {
      hx.tier = row.tier;
      this.bus && this.bus.emit('helix:tier', {
        tier: row.tier, id: row.id, label: row.label, deeds: hx.deeds, tick: state.tick,
      });
      this.bus && this.bus.emit('toast', {
        text: `BUREAU STANDING — ${row.label.toUpperCase()}`, kind: 'good', tone: 'info', ttl: 4,
      });
      this._log(state, row.line);
    }
  },

  /** File a docket verdict — the ledger is bounded and serializable. */
  _fileVerdict(state, kind, subject, detail) {
    const hx = ensureHelixState(state);
    const rec = {
      id: `V${hx.seq++}`,
      kind, subject: subject ?? null, detail: detail ?? null, at: num(state.simTime),
    };
    hx.ledger.push(rec);
    while (hx.ledger.length > 32) hx.ledger.shift();
    this.bus && this.bus.emit('helix:verdictFiled', {
      verdictId: rec.id, kind, subject: rec.subject, tick: state.tick,
    });
    return rec;
  },

  /** A precedent: the first of each instrument pays for new law, once only. */
  _precedent(state, kind) {
    const hx = ensureHelixState(state);
    if (hx.precedents[kind] != null) return false;
    hx.precedents[kind] = num(state.simTime);
    const bonus = Math.round(HELIX_PRECEDENTS.bonusCr * this._tierMult(hx));
    this._grant(state, bonus, `helix_precedent:${kind}`);
    this._rep(state, HELIX_PRECEDENTS.rep, 'helix_precedent');
    this.bus && this.bus.emit('helix:precedent', { kind, bonusCr: bonus, tick: state.tick });
    this.bus && this.bus.emit('toast', { text: 'PRECEDENT FILED', kind: 'good', tone: 'info', ttl: 3 });
    this._fileVerdict(state, 'precedent', kind, 'The Bureau pays for new law');
    this._log(state, HELIX_BARKS.precedent);
    return true;
  },

  /** A closed notice releases the body stamps it wrote — a hulk or hull still
   *  carrying a dead filing's tag can never be noticed again. */
  _clearNoticeTags(state, n) {
    if (!n) return;
    if (n.wreckId != null) {
      const w = ent(state, n.wreckId);
      if (w && w.data && w.data.helixNoticeId === n.id) w.data.helixNoticeId = null;
    }
    if (n.targetId != null) {
      const t = ent(state, n.targetId);
      if (t && t.data && t.data.helixCollectId === n.id) t.data.helixCollectId = null;
    }
  },

  /** Drop the oldest closed rows past the keep count — bounded ledger discipline.
   *  Rows use `state` (notices/warrants) or `status` (fines); either spelling works. */
  _gcClosed(rows, keepClosed) {
    const isOpen = (r) => r && (r.state === 'open' || r.status === 'open');
    let excess = rows.reduce((c, r) => c + (isOpen(r) ? 0 : 1), 0) - keepClosed;
    for (let i = 0; i < rows.length && excess > 0; i++) {
      if (!isOpen(rows[i])) { rows.splice(i, 1); i--; excess--; }
    }
  },

  /** Did the pilot's hands move this body — a throw, a tether, a tow? */
  _playerHandled(state, e) {
    const d = e && e.data;
    const pid = state.playerId;
    // A null playerId must not let an unset stamp read as "the pilot touched it".
    if (d && (d.thrownBy === 'player'
        || (pid != null && (d.lastThrowerId === pid || d.thrownBy === pid)))) return true;
    const pTether = state.player && state.player.tether;
    if (pTether && pTether.active !== false && pTether.targetId === e.id) return true;
    const pEnt = ent(state, state.playerId);
    if (pEnt && pEnt.tether && pEnt.tether.active !== false && pEnt.tether.targetId === e.id) return true;
    return false;
  },

  /** Impulse steering — force enters ONLY through queuePhysicsImpulse. */
  _steerTo(state, e, targetPos, speed) {
    if (!e || !e.pos || !targetPos) return;
    const dx = targetPos.x - e.pos.x, dz = targetPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const want = Math.min(speed, dist);
    const vel = e.vel || { x: 0, z: 0 };
    const dvx = (dx / dist) * want - num(vel.x), dvz = (dz / dist) * want - num(vel.z);
    if (Math.abs(dvx) < 1e-4 && Math.abs(dvz) < 1e-4) return;
    const mass = Math.max(1, num(e.mass, 1));
    queuePhysicsImpulse(e, { x: dvx * mass, z: dvz * mass },
      { tick: state.tick, provenance: 'helix_steer' });
  },

  // ── 1. too-perfect packs: break the pattern, drop the flag ─────────────────────
  _tickPacks(state, hx, entities, now) {
    const packs = new Map();
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      const d = e.data || {};
      if (d.helixFalseFlag !== true || typeof d.helixPack !== 'string') continue;
      let pack = packs.get(d.helixPack);
      if (!pack) packs.set(d.helixPack, pack = []);
      pack.push(e);
    }

    for (const [packId, members] of packs) {
      if (hx.droppedPacks[packId] || members.length < 2) continue;
      let cx = 0, cz = 0;
      for (const m of members) { cx += m.pos.x; cz += m.pos.z; }
      cx /= members.length; cz /= members.length;

      // A member off its authored slot past the break radius ruins the geometry —
      // that is the throw landing. The breaker is the FARTHEST member off-slot: a
      // flung hull drags the centroid after it, so the one who left home hardest
      // is the throw the law should name.
      let breaker = null;
      let worstD2 = PATTERN_BREAK_WU * PATTERN_BREAK_WU;
      for (const m of members) {
        const slot = (m.data && m.data.helixSlot) || { dx: 0, dz: 0 };
        const dx = m.pos.x - (cx + (Number(slot.dx) || 0));
        const dz = m.pos.z - (cz + (Number(slot.dz) || 0));
        const d2 = dx * dx + dz * dz;
        if (d2 > worstD2) { worstD2 = d2; breaker = m; }
      }
      if (!breaker) continue;

      // Every flag in the pack drops at once — the paperwork was always Helix's.
      for (const m of members) {
        const d = m.data || (m.data = {});
        d.wasMaskedFaction = m.factionId;
        d.falseFlagDropped = true;
        d.helixFalseFlag = false;
        m.factionId = FACTION_ID;
        if (d.ai) d.ai.maskBroken = true;
        d.scanLabel = 'HELIX ADJUDICATOR — LAWFUL INTERDICTION';
      }
      hx.droppedPacks[packId] = { breakerId: breaker.id, t: now, memberIds: members.map((m) => m.id) };
      this.bus && this.bus.emit('helix:flagsDropped', {
        packId, breakerId: breaker.id, memberIds: members.map((m) => m.id),
        maskFactionId: breaker.data.wasMaskedFaction, t: now,
      });
      this.bus && this.bus.emit('comms:log', {
        from: 'HELIX ADJUDICATOR',
        text: 'Lawful interdiction. Read the invoice first.',
        kind: 'encounter',
      });
      this._onFlagsDropped(state, hx, packId, breaker, members);
    }
  },

  /** The docket reads an unmasking: a verdict, a precedent, a verified notice. */
  _onFlagsDropped(state, hx, packId, breaker, members) {
    this._fileVerdict(state, 'pack_unmasked', packId,
      `${members.length} hull${members.length === 1 ? '' : 's'} unmasked by ${breaker && breaker.id}`);
    this._precedent(state, 'unmasked');
    this._deed(state, 'unmasked', packId);
    for (const n of hx.notices) {
      if (n.state !== 'open' || n.kind !== 'pack' || n.packId !== packId) continue;
      this._verifyNotice(state, hx, n, 'unmasked');
      break;
    }
  },

  // ── 2. lien drones: stick, ride, file ──────────────────────────────────────────
  _tickLienDrones(state, hx, entities, now) {
    // Stale stamps first: a lienStuck naming a dead or absent drone is dead
    // paperwork — the mass frees and the hull can be liened again. A scrape that
    // kills the stuck drone inside the dwell lands here too.
    for (const ship of entities) {
      const sd = ship && ship.data;
      if (!ship || ship.alive === false || !sd || sd.lienStuck == null) continue;
      const drone = ent(state, sd.lienStuck);
      // The bind is two-way: a live drone must actually be riding THIS hull —
      // a recycled id holding somebody else's lien is dead paperwork here too.
      if (drone && drone.alive !== false && drone.data && drone.data.lienDrone === true
          && drone.data.lienOn === ship.id) continue;
      const staleId = sd.lienStuck;
      delete sd.lienStuck;
      delete sd.lienMassT;
      this.bus && this.bus.emit('helix:lienScraped', { shipId: ship.id, droneId: staleId, t: now });
    }

    for (const drone of entities) {
      if (!drone || drone.alive === false || !drone.pos) continue;
      const dd = drone.data || {};
      if (dd.lienDrone !== true) continue;

      const stuckId = dd.lienOn;
      if (stuckId != null) {
        const ship = ent(state, stuckId);
        if (!ship || ship.alive === false || !ship.pos) { dd.lienOn = null; continue; }
        // It rides the hull it is fining — dead mass on the scale while it files.
        drone.pos.x = ship.pos.x;
        drone.pos.z = ship.pos.z;
        drone.vel = ship.vel ? { x: ship.vel.x, z: ship.vel.z } : { x: 0, z: 0 };
        if (now - (dd.lienAtS || 0) >= FILE_AFTER_S) {
          const sd = ship.data || (ship.data = {});
          sd.lienFiledCr = (Number(sd.lienFiledCr) || 0) + FINE_CR;
          delete sd.lienStuck;
          delete sd.lienMassT;
          hx.liensFiled[ship.id] = (Number(hx.liensFiled[ship.id]) || 0) + FINE_CR;
          // The instrument is spent before the wire sings — a listener that
          // re-enters the tick must find the drone already off the hull.
          dd.lienOn = null;
          drone.alive = false; // the paperwork is delivered; the drone is a husk
          this.bus && this.bus.emit('helix:lienFiled', {
            droneId: drone.id, shipId: ship.id, fineCr: FINE_CR,
            totalCr: hx.liensFiled[ship.id], t: now,
          });
          this.bus && this.bus.emit('comms:log', {
            from: 'HELIX LIEN DESK',
            text: `LIEN FILED: ${FINE_CR} cr. The addendum reaches farther than the job does.`,
            kind: 'encounter',
          });
          // The pilot's hull carries the pilot's file — a lien on it enters the docket.
          if (ship.id === state.playerId) {
            this._postFine(state, hx, 'lien', FINE_CR, { subjectId: ship.id, droneId: drone.id });
          }
        }
        continue;
      }

      // Unstuck drones hunt the nearest non-Helix hull in reach — the player counts too.
      let best = null, bestD2 = ATTACH_WU * ATTACH_WU;
      for (const ship of entities) {
        if (!ship || ship === drone || ship.alive === false || !ship.pos) continue;
        if (ship.type !== 'ship' && ship.id !== (state.playerId || null)) continue;
        if (ship.factionId === FACTION_ID) continue;
        if (ship.data && ship.data.lienStuck) continue;      // one lien per hull — orderly
        const dx = ship.pos.x - drone.pos.x, dz = ship.pos.z - drone.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = ship; }
      }
      if (best) {
        const bd = best.data || (best.data = {});
        bd.lienStuck = drone.id;
        bd.lienMassT = LIEN_MASS_T;
        dd.lienOn = best.id;
        dd.lienAtS = now;
        this.bus && this.bus.emit('helix:lienStuck', {
          droneId: drone.id, shipId: best.id, fineCr: FINE_CR, massT: LIEN_MASS_T, t: now,
        });
      }
    }
  },

  // ── 3. assessment desks: discovery, fielding, recall ────────────────────────────
  /** The live body behind a desk rec — the desk's ledger key is its identity tag;
   *  a re-stamped occupant (save/restore) rebinds its generation in place, while a
   *  body carrying no tag or a foreign key is never the same desk. */
  _deskEnt(state, rec) {
    if (!rec || rec.gone === true) return null;
    const e = ent(state, rec.entityId);
    if (!e || e.alive === false || !e.pos) return null;
    const d = e.data;
    if (!d || d.helixAudit !== true || d.helixDeskId !== rec.key) return null;
    // The tag is the identity; the generation only records what the tagged body
    // carries — stamp it whenever the body reports one, even over a null row.
    if (e.occupantGeneration != null && e.occupantGeneration !== rec.gen) {
      rec.gen = e.occupantGeneration;
    }
    return e;
  },

  /** Desks live in the current sector with their bodies intact. */
  _liveDesks(state, hx) {
    const sectorId = state.world && state.world.currentSectorId;
    const out = [];
    for (const key of Object.keys(hx.desks)) {
      const rec = hx.desks[key];
      if (rec.gone === true || rec.sectorId !== sectorId) continue;
      const e = this._deskEnt(state, rec);
      if (e) out.push({ rec, ent: e });
    }
    return out;
  },

  _registerDesk(state, hx, e, now) {
    const d = e.data;
    const key = str(d.helixDeskId) || `desk:${e.id}`;
    d.helixDeskId = key; // the body always carries the ledger key — the tag binds it
    let rec = hx.desks[key];
    if (!rec) {
      const clerk = helixClerkFor(key, d.helixClerkId);
      rec = hx.desks[key] = {
        key, entityId: e.id, gen: e.occupantGeneration ?? null,
        sectorId: (state.world && state.world.currentSectorId) || null,
        pos: { x: e.pos.x, z: e.pos.z },
        clerkId: clerk.id, authored: d.helixFieldDesk !== true,
        gone: false, firstSeenAt: now, lastSeenAt: now, awayT: 0,
        nextNoticeAt: now + HELIX_NOTICES.firstNoticeS
          + frac('helix-notice-first', key, hx.seq) * HELIX_NOTICES.noticeJitterS,
        nextAuditAt: now + HELIX_AUDIT.firstAuditS
          + frac('helix-audit-first', key, hx.seq) * HELIX_AUDIT.auditJitterS,
      };
      this.bus && this.bus.emit('helix:deskFiled', {
        deskKey: key, entityId: e.id, clerkId: clerk.id, clerkRef: clerk.ref,
        clerkName: clerk.name, sectorId: rec.sectorId, tick: state.tick,
      });
      this._log(state, `${clerk.name}, ${clerk.ref} — ${clerk.line}`, clerk.name);
    } else {
      rec.entityId = e.id;
      rec.gen = e.occupantGeneration ?? null;
      rec.lastSeenAt = now;
      // The body's own sector stamp wins; else the sector it was just sighted in.
      // Without the refresh a rec filed while the sector id was unset stays
      // sectorless forever — live body, dead desk: excluded from service and
      // from reconcile alike.
      rec.sectorId = str(d.sectorId) || (state.world && state.world.currentSectorId) || rec.sectorId;
      if (rec.gone === true) rec.gone = false; // a body refiled under the same key
    }
    rec.pos.x = e.pos.x; rec.pos.z = e.pos.z;
    return rec;
  },

  _markDeskGone(state, hx, rec, cause, byPlayer) {
    if (!rec || rec.gone === true) return;
    rec.gone = true;
    rec.goneAt = num(state.simTime);
    // The desk's open notices lapse with it — the wire dies with the desk, and
    // the bodies it tagged are released for whatever desk files next.
    for (const n of hx.notices) {
      if (n.state === 'open' && n.deskKey === rec.key) {
        n.state = 'lapsed';
        n.closedAt = num(state.simTime);
        this._clearNoticeTags(state, n);
        this.bus && this.bus.emit('helix:noticeLapsed', {
          noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'desk_lost', tick: state.tick,
        });
      }
    }
    this._fileVerdict(state, 'desk_lost', rec.key,
      `${clerkById(rec.clerkId).ref}'s desk went quiet${cause ? ` (${cause})` : ''}`);
    this.bus && this.bus.emit('helix:deskLost', {
      deskKey: rec.key, clerkId: rec.clerkId, cause, byPlayer: byPlayer === true, tick: state.tick,
    });
    if (byPlayer) {
      this._addVariance(hx, HELIX_VARIANCE.desk);
      this._postWarrant(state, hx, 'desk_wrecked');
      this._log(state, HELIX_BARKS.deskLost);
    }
    this._gcClosed(hx.notices, HELIX_NOTICES.keepClosed);
  },

  _tickDesks(state, hx, entities, now, dt) {
    // Discover: any live body carrying the audit stamp registers a desk record.
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      if (e.data && e.data.helixAudit === true) this._registerDesk(state, hx, e, now);
    }
    // Reconcile: a desk whose body is gone, recycled, or stripped of its tag
    // went quiet — the verdict files once, its wire lapses. Only the sector we
    // stand in is reconciled: a desk elsewhere is unloaded, not dead.
    const sectorNow = (state.world && state.world.currentSectorId) || null;
    for (const key of Object.keys(hx.desks)) {
      const rec = hx.desks[key];
      if (rec.sectorId != null && sectorNow != null && rec.sectorId !== sectorNow) continue;
      if (rec.gone !== true && !this._deskEnt(state, rec)) {
        this._markDeskGone(state, hx, rec, 'unregistered', false);
      }
    }
    const player = ent(state, state.playerId);
    const live = this._liveDesks(state, hx);
    // Field a Bureau desk when the sector has none — the paperwork reaches you.
    const authoredLive = live.some(({ rec }) => rec.authored === true);
    const fieldedLive = live.filter(({ rec }) => rec.authored !== true);
    if (!authoredLive && fieldedLive.length < HELIX_DESKS.maxFielded
        && state.mode === 'flight' && player && player.alive !== false && player.pos
        && now >= hx.nextDeskAt
        && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      hx.nextDeskAt = now + HELIX_DESKS.deskGapS;
      const sectorId = (state.world && state.world.currentSectorId) || 'sector';
      const key = `desk:field:${sectorId}:${hx.seq++}`;
      const ang = frac('helix-desk-ang', sectorId, hx.seq, now | 0) * TAU;
      const e = this.helpers.spawnEntity({
        type: 'ship', team: 0, factionId: FACTION_ID,
        pos: { x: player.pos.x + Math.cos(ang) * HELIX_DESKS.spawnR,
               z: player.pos.z + Math.sin(ang) * HELIX_DESKS.spawnR },
        vel: { x: 0, z: 0 }, rot: ang,
        radius: HELIX_DESKS.deskRadius, mass: HELIX_DESKS.deskMass,
        hull: HELIX_DESKS.deskHull, hullMax: HELIX_DESKS.deskHull, collides: true,
        data: {
          helixAudit: true, helixFieldDesk: true, helixDeskId: key,
          name: 'ASSESSMENT DESK', shipRole: 'assessment_desk', sectorId,
          scannable: true, scanLabel: 'HELIX ASSESSMENT DESK — filings taken',
          ai: { archetype: 'bureau_desk', passive: true, fsm: 'hold' },
        },
      });
      if (e) {
        this._registerDesk(state, hx, e, now);
        this._log(state, HELIX_BARKS.deskFielded);
      }
    }
    // Service proximity + field-desk recall.
    for (const { rec, ent: desk } of live) {
      if (!player || player.alive === false || !player.pos) break;
      if (dist2(player.pos, desk.pos) <= HELIX_DESKS.serveR * HELIX_DESKS.serveR) {
        this._precedent(state, 'desk_met');
      }
      if (rec.authored !== true) {
        if (dist2(player.pos, desk.pos) > HELIX_DESKS.leaveR * HELIX_DESKS.leaveR) {
          rec.awayT += dt;
          if (rec.awayT >= HELIX_DESKS.orphanS) {
            desk.data.helixAudit = false;
            this._markDeskGone(state, hx, rec, 'recalled', false);
            this.helpers.removeEntity && this.helpers.removeEntity(desk.id, { reason: 'helix_desk_recalled' });
            this._log(state, HELIX_BARKS.deskRecalled);
          }
        } else rec.awayT = 0;
      }
    }
  },

  /** A service point inside reach — a live desk ring or a fielded assessor. */
  _servicePointNear(state, hx, pos) {
    if (!pos) return null;
    let best = null, bestD2 = HELIX_DESKS.serveR * HELIX_DESKS.serveR;
    for (const { rec, ent: desk } of this._liveDesks(state, hx)) {
      const d2 = dist2(pos, desk.pos);
      if (d2 <= bestD2) { bestD2 = d2; best = { kind: 'desk', rec, ent: desk, clerkId: rec.clerkId }; }
    }
    for (const row of hx.assessors) {
      const e = this._assessorEnt(state, row);
      if (!e || !e.pos) continue;
      const d2 = dist2(pos, e.pos);
      if (d2 <= bestD2) {
        const rec = hx.desks[row.deskKey];
        bestD2 = d2;
        best = { kind: 'assessor', row, ent: e, clerkId: rec ? rec.clerkId : null };
      }
    }
    return best;
  },

  /** The pilot's service point, or a refusal toast + null. */
  _svc(state, hx, toastText) {
    const player = ent(state, state.playerId);
    if (player && player.pos) {
      const svc = this._servicePointNear(state, hx, player.pos);
      if (svc) return svc;
    }
    this.bus && this.bus.emit('toast', { text: toastText, kind: 'warn', ttl: 3 });
    return null;
  },

  // ── 4. variance notices: the desk's wire ────────────────────────────────────────
  _postNotice(state, hx, rec, kind, extra) {
    const desk = this._deskEnt(state, rec);
    const n = {
      id: `ntc:${hx.seq++}`,
      kind, deskKey: rec.key, state: 'open',
      pos: { x: desk ? desk.pos.x : rec.pos.x, z: desk ? desk.pos.z : rec.pos.z },
      postedAt: num(state.simTime), expiresAt: num(state.simTime) + HELIX_NOTICES.ttlS,
      dwellT: 0, packId: null, wreckId: null, wreckGen: null,
      targetId: null, targetGen: null, owedCr: 0,
      ...(extra || {}),
    };
    hx.notices.push(n);
    this.bus && this.bus.emit('helix:noticePosted', {
      noticeId: n.id, kind, deskKey: rec.key, clerkId: rec.clerkId,
      sectorId: rec.sectorId, pos: { ...n.pos }, expiresAt: n.expiresAt, tick: state.tick,
    });
    this._log(state, this._pickLine(NOTICE_LINES[kind], n.id), clerkById(rec.clerkId).name);
    return n;
  },

  /** The desk's next filing: a masked pack, an untitled hulk, a collectible hull,
   *  or the standing manifest discrepancy. Deterministic per post. */
  _noticeKindFor(state, hx, entities, desk) {
    for (const e of entities) {
      const d = e && e.data;
      if (!e || e.alive === false || !d || d.helixFalseFlag !== true) continue;
      if (typeof d.helixPack !== 'string' || hx.droppedPacks[d.helixPack]) continue;
      // One pack, one filing — a second desk does not double-post the variance.
      if (hx.notices.some((n) => n.state === 'open' && n.kind === 'pack' && n.packId === d.helixPack)) continue;
      // A masked pack needs at least two live members to still be a pattern —
      // a lone hull is no formation, and the filing could never be answered.
      let maskedLive = 0;
      for (const m of entities) {
        const md = m && m.data;
        if (m && m.alive !== false && md && md.helixFalseFlag === true && md.helixPack === d.helixPack) {
          if (++maskedLive >= 2) return { kind: 'pack', packId: d.helixPack };
        }
      }
    }
    if (desk) {
      for (const e of entities) {
        const d = e && e.data;
        if (!e || e.alive === false || !e.pos || !d) continue;
        if (d.helixFieldDesk === true || d.lienDrone === true) continue;
        if (d.helixNoticeId != null) {
          // The stamp can outlive its paper — a filing that closed while this
          // body rode an unloaded sector leaves its tag behind, and dead paper
          // must not exempt the hulk from ever being noticed again.
          const live = hx.notices.some((n) => n.state === 'open' && n.id === d.helixNoticeId);
          if (live) continue;
          d.helixNoticeId = null;
        }
        const claimable = e.type === 'wreck' || e.type === 'derelict'
          || d.derelict === true || d.salvageClaimable === true;
        if (claimable && dist2(e.pos, desk.pos) <= HELIX_NOTICES.salvageClaimR ** 2) {
          return { kind: 'salvage', wreck: e };
        }
      }
      // A hull riding filed liens is collectible work — the Bureau posts a share.
      // The debt lives in the body's own stamp: a recycled id owes nothing.
      for (const e of entities) {
        const sd = e && e.data;
        if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
        const owed = num(sd && sd.lienFiledCr);
        if (!(owed > 0)) continue;
        if (sd && sd.helixCollectId != null) {
          // Same dead-paper rule as the hulk stamp: a collect tag whose filing
          // is already closed blocks nothing — clear it and let the debt post.
          const live = hx.notices.some((n) => n.state === 'open' && n.id === sd.helixCollectId);
          if (live) continue;
          sd.helixCollectId = null;
        }
        if (dist2(e.pos, desk.pos) <= HELIX_NOTICES.collectScanR ** 2) {
          return { kind: 'collect', target: e, owedCr: owed };
        }
      }
    }
    return { kind: 'manifest' };
  },

  _tickNotices(state, hx, entities, now, dt) {
    const player = ent(state, state.playerId);
    const sectorNow = (state.world && state.world.currentSectorId) || null;
    for (const { rec, ent: desk } of this._liveDesks(state, hx)) {
      if (now < rec.nextNoticeAt) continue;
      rec.nextNoticeAt = now + HELIX_NOTICES.noticePeriodS
        + frac('helix-notice-gap', rec.key, hx.seq) * HELIX_NOTICES.noticeJitterS;
      const openForDesk = hx.notices.filter((n) => n.state === 'open' && n.deskKey === rec.key).length;
      // A notice parked with its desk in another sector cannot be answered here —
      // it must not hold one of this sector's filing slots while it waits.
      const openCount = hx.notices.reduce((c, n) => {
        if (n.state !== 'open') return c;
        const r = hx.desks[n.deskKey];
        if (r && r.sectorId != null && sectorNow != null && r.sectorId !== sectorNow) return c;
        return c + 1;
      }, 0);
      if (openForDesk >= HELIX_NOTICES.maxPerDesk || openCount >= HELIX_NOTICES.maxOpen) continue;
      const pick = this._noticeKindFor(state, hx, entities, desk);
      if (pick.kind === 'pack') {
        this._postNotice(state, hx, rec, 'pack', { packId: pick.packId });
      } else if (pick.kind === 'salvage') {
        const n = this._postNotice(state, hx, rec, 'salvage', {
          wreckId: pick.wreck.id, wreckGen: pick.wreck.occupantGeneration ?? null,
          pos: { x: pick.wreck.pos.x, z: pick.wreck.pos.z },
        });
        (pick.wreck.data || (pick.wreck.data = {})).helixNoticeId = n.id;
      } else if (pick.kind === 'collect') {
        const td = pick.target.data || (pick.target.data = {});
        const n = this._postNotice(state, hx, rec, 'collect', {
          targetId: pick.target.id, targetGen: pick.target.occupantGeneration ?? null,
          owedCr: pick.owedCr, pos: { x: pick.target.pos.x, z: pick.target.pos.z },
        });
        td.helixCollectId = n.id;
      } else {
        this._postNotice(state, hx, rec, 'manifest');
      }
    }

    // Resolve: manifest dwells, salvage titles, lapses accrue.
    for (const n of [...hx.notices]) {
      if (n.state !== 'open') continue;
      const rec = hx.desks[n.deskKey];
      if (!rec) {
        // The desk's own row was reaped from the ledger — the wire is orphaned.
        n.state = 'lapsed'; n.closedAt = now;
        this._clearNoticeTags(state, n);
        this.bus && this.bus.emit('helix:noticeLapsed', {
          noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'desk_reaped', tick: state.tick,
        });
        continue;
      }
      const desk = this._deskEnt(state, rec);
      if (!desk) {
        // The reconcile pass marks a missing body gone and lapses its wire in
        // the same breath, so a live record landing here is out-of-sector:
        // paused, not dead. A record already filed gone should never still
        // hold open paper — a hostile or older save can carry the pair; lapse
        // it so the pinned row does not sit on a filing slot forever.
        if (rec.gone === true) {
          n.state = 'lapsed'; n.closedAt = now;
          this._clearNoticeTags(state, n);
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'desk_lost', tick: state.tick,
          });
        }
        continue;
      }
      if (n.kind === 'manifest') {
        n.pos.x = desk.pos.x; n.pos.z = desk.pos.z;
        if (player && player.alive !== false && player.pos
            && dist2(player.pos, desk.pos) <= HELIX_DESKS.serveR ** 2) {
          const speed = Math.hypot(num(player.vel && player.vel.x), num(player.vel && player.vel.z));
          if (speed <= HELIX_NOTICES.fileSpeedMax) {
            n.dwellT += dt;
            if (n.dwellT >= HELIX_NOTICES.dwellS) this._verifyNotice(state, hx, n, 'manifest_filed');
          }
        }
      } else if (n.kind === 'salvage') {
        let w = ent(state, n.wreckId);
        if (!(w && w.alive !== false && w.pos && w.data?.helixNoticeId === n.id)) {
          // A restore may re-issue the body's id — the hulk still carries the
          // filing's tag, so rebind by tag before calling it gone.
          w = null;
          for (const e of entities) {
            if (e && e.alive !== false && e.pos && e.data && e.data.helixNoticeId === n.id) { w = e; break; }
          }
          if (w) {
            n.wreckId = w.id;
            n.wreckGen = w.occupantGeneration ?? null;
          }
        }
        if (!w) {
          // The hulk is gone without a kill wire — a sweep, a sector swap, a
          // recycled id. The filing lapses now instead of pinning the desk's
          // slot until TTL; the kill wire's own lapse lands first when it can.
          n.state = 'lapsed'; n.closedAt = now;
          this._clearNoticeTags(state, n);
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'wreck_lost', tick: state.tick,
          });
          continue;
        }
        // The notice tag is the hulk's identity — a re-stamped occupant heals
        // the generation binding in place, never a bare recycled id.
        if (w.occupantGeneration != null && w.occupantGeneration !== n.wreckGen) {
          n.wreckGen = w.occupantGeneration;
        }
        n.pos.x = w.pos.x; n.pos.z = w.pos.z;
        const reach = HELIX_DESKS.serveR + (Number(desk.radius) || 0);
        if (dist2(w.pos, desk.pos) <= reach * reach && this._playerHandled(state, w)) {
          if (w.data) w.data.helixNoticeId = null;
          this.helpers.removeEntity && this.helpers.removeEntity(w.id, { reason: 'helix_claim_titled' });
          this._verifyNotice(state, hx, n, 'salvage_titled');
          this._precedent(state, 'salvage_titled');
          this._fileVerdict(state, 'salvage_titled', n.deskKey, 'Untitled mass entered the register');
          this._log(state, HELIX_BARKS.titled);
        }
      } else if (n.kind === 'collect') {
        let t = ent(state, n.targetId);
        if (!(t && t.alive !== false && t.pos && t.data?.helixCollectId === n.id)) {
          // Same rebind as the hulk: a restore re-issues ids, the tag does not move.
          t = null;
          for (const e of entities) {
            if (e && e.alive !== false && e.pos && e.data && e.data.helixCollectId === n.id) { t = e; break; }
          }
          if (t) {
            n.targetId = t.id;
            n.targetGen = t.occupantGeneration ?? null;
          }
        }
        if (!t) {
          // The marked hull is gone without a kill wire — lapse it aloud, like
          // every other closed wire, never silently.
          n.state = 'lapsed'; n.closedAt = now;
          this._clearNoticeTags(state, n);
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'target_lost', tick: state.tick,
          });
          continue;
        }
        // Same heal: the collect tag is the debt, the generation is the stamp.
        if (t.occupantGeneration != null && t.occupantGeneration !== n.targetGen) {
          n.targetGen = t.occupantGeneration;
        }
        n.pos.x = t.pos.x; n.pos.z = t.pos.z;
      } else if (n.kind === 'pack') {
        // Verified inside _onFlagsDropped. A pack cut down to a lone hull can
        // no longer be unmasked as a formation — the filing dissolves without
        // blame, like a hulk that slipped the register.
        let maskedLive = 0;
        for (const m of entities) {
          const md = m && m.data;
          if (m && m.alive !== false && md && md.helixFalseFlag === true && md.helixPack === n.packId) {
            if (++maskedLive >= 2) break;
          }
        }
        if (maskedLive < 2) {
          n.state = 'lapsed'; n.closedAt = now;
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'pack_dissolved', tick: state.tick,
          });
          continue;
        }
      }
      // All kinds lapse on the clock.
      if (n.state === 'open' && now >= num(n.expiresAt)) {
        n.state = 'lapsed';
        n.closedAt = now;
        this._clearNoticeTags(state, n);
        if (this._paidOnce(hx, `nvlapse:${n.id}`)) {
          this._addVariance(hx, HELIX_NOTICES.lapseVariance);
          this._fileVerdict(state, 'notice_lapsed', n.id, `An unanswered ${n.kind} variance`);
        }
        this.bus && this.bus.emit('helix:noticeLapsed', {
          noticeId: n.id, kind: n.kind, deskKey: n.deskKey, tick: state.tick,
        });
        this._log(state, HELIX_BARKS.noticeLapsed, clerkById(rec.clerkId).name);
      }
    }
    this._gcClosed(hx.notices, HELIX_NOTICES.keepClosed);
  },

  _verifyNotice(state, hx, n, how) {
    if (n.state !== 'open') return;
    n.state = 'verified';           // latch before any emit
    n.how = how;
    n.closedAt = num(state.simTime);
    const filed = hx.manifest && num(state.simTime) < num(hx.manifest.expiresAt);
    const base = n.kind === 'collect'
      ? Math.round(n.owedCr * HELIX_NOTICES.payCr.collect)
      : HELIX_NOTICES.payCr[n.kind];
    const pay = Math.round(base * this._tierMult(hx) * (filed ? HELIX_NOTICES.filedPayMult : 1));
    this._grant(state, pay, `helix_notice:${n.id}`);
    this._rep(state, HELIX_NOTICES.verifyRep, 'helix_notice_verified');
    this.bus && this.bus.emit('helix:noticeVerified', {
      noticeId: n.id, kind: n.kind, deskKey: n.deskKey, how, payCr: pay, tick: state.tick,
    });
    this._fileVerdict(state, 'notice_verified', n.id, `${n.kind} closed: ${how}`);
    this._log(state, HELIX_BARKS.noticeVerified, clerkById(hx.desks[n.deskKey]?.clerkId).name);
    this._precedent(state, 'notice_verified');
    this._deed(state, `notice_${n.kind}`, n.id);
    this._gcClosed(hx.notices, HELIX_NOTICES.keepClosed);
  },

  // ── 5. the fine docket ──────────────────────────────────────────────────────────
  _postFine(state, hx, cause, amount, extra = {}) {
    const fine = {
      id: `fine:${hx.seq++}`,
      cause: str(cause, 'lien'),
      amount: Math.max(1, Math.round(num(amount))),
      issuedAt: num(state.simTime),
      dueAt: num(state.simTime) + HELIX_FINES.graceS,
      status: 'open', contested: false, overdueStamped: false,
      subjectId: extra.subjectId ?? null,
      settledAt: 0, surcharges: 0,
    };
    hx.fines.push(fine);
    this.bus && this.bus.emit('helix:finePosted', {
      fineId: fine.id, amount: fine.amount, cause: fine.cause,
      dueAt: fine.dueAt, subjectId: fine.subjectId, tick: state.tick,
    });
    this._fileVerdict(state, 'fine_posted', fine.id, `${fine.cause} instrument — ${fine.amount} cr`);
    this._log(state, `${HELIX_BARKS.finePosted} (${fine.amount} cr)`);
    return fine;
  },

  _tickFines(state, hx, now) {
    for (const f of [...hx.fines]) {
      if (f.status !== 'open' || now < num(f.dueAt)) continue;
      if (!f.overdueStamped) {
        f.overdueStamped = true;      // latch before emit — one overdue filing each
        this._addVariance(hx, HELIX_FINES.overdueVariance);
        this.bus && this.bus.emit('helix:fineOverdue', { fineId: f.id, amount: f.amount, tick: state.tick });
        this._fileVerdict(state, 'fine_overdue', f.id, 'The grace clock ran out');
        this._log(state, HELIX_BARKS.fineOverdue);
      }
      if (now >= num(f.dueAt) + HELIX_FINES.garnishAfterS) this._garnish(state, hx, f);
    }
    this._gcClosed(hx.fines, HELIX_FINES.keepClosed);
  },

  /** The Bureau takes what the hold holds — plus its fee — and closes the instrument. */
  _garnish(state, hx, f) {
    if (f.status !== 'open') return;
    const want = f.amount + HELIX_FINES.garnishFeeCr;
    const take = Math.min(want, Math.max(0, Math.floor(this._credits(state))));
    f.status = 'garnished';           // latch before emit
    f.settledAt = num(state.simTime);
    f.garnishedCr = take;
    if (take > 0) this._charge(state, take, `helix_garnish:${f.id}`);
    this._addVariance(hx, HELIX_FINES.garnishVariance);
    this.bus && this.bus.emit('helix:garnished', {
      fineId: f.id, wantedCr: want, takenCr: take, tick: state.tick,
    });
    this._fileVerdict(state, 'garnished', f.id,
      take > 0 ? `Garnished ${take} of ${want} cr` : 'Garnish returned empty');
    this._log(state, take > 0 ? HELIX_BARKS.garnished : HELIX_BARKS.garnishEmpty);
    this._gcClosed(hx.fines, HELIX_FINES.keepClosed);
  },

  /** Settle an instrument at a service point. Returns the paid amount or null. */
  payFine(state, fineId) {
    const hx = ensureHelixState(state);
    const f = hx.fines.find((x) => x.id === fineId);
    if (!f || f.status !== 'open') return null;
    if (!this._svc(state, hx, 'NO DESK IN REACH — filings settle at the ring')) return null;
    if (this._credits(state) < f.amount) {
      this.bus && this.bus.emit('toast', {
        text: 'INSUFFICIENT FUNDS — the Bureau does not do partial settlements', kind: 'warn', ttl: 3,
      });
      return null;
    }
    f.status = 'paid';                // latch before any emit
    f.settledAt = num(state.simTime);
    this._charge(state, f.amount, `helix_fine:${f.id}`);
    this._rep(state, 2, 'helix_fine_paid');
    this.bus && this.bus.emit('helix:finePaid', { fineId: f.id, amount: f.amount, tick: state.tick });
    this._fileVerdict(state, 'lien_paid', f.id, `Instrument settled — ${f.amount} cr`);
    this._log(state, HELIX_BARKS.finePaid);
    this._precedent(state, 'lien_paid');
    this._deed(state, 'fine_paid', f.id);
    this._gcClosed(hx.fines, HELIX_FINES.keepClosed);
    return f.amount;
  },

  /** Contest an instrument before the desk's clerk — each fine is heard once. */
  contestFine(state, fineId) {
    const hx = ensureHelixState(state);
    const f = hx.fines.find((x) => x.id === fineId);
    if (!f || f.status !== 'open' || f.contested) return null;
    const svc = this._svc(state, hx, 'NO DESK IN REACH — appeals are heard at the ring');
    if (!svc) return null;
    f.contested = true;               // the hearing is had — one per instrument
    const clerk = clerkById(svc.clerkId);
    const chance = Math.max(0.05, Math.min(0.9,
      HELIX_FINES.appealBase + HELIX_FINES.appealPerTier * helixTierFor(hx.deeds).tier - clerk.strict));
    const voided = frac('helix-appeal', f.id, clerk.id, hx.seq) < chance;
    if (voided) {
      f.status = 'void';              // latch before emits
      f.settledAt = num(state.simTime);
      this._rep(state, 2, 'helix_appeal_won');
      this.bus && this.bus.emit('helix:appealHeard', {
        fineId: f.id, outcome: 'void', clerkId: clerk.id, clerkRef: clerk.ref, tick: state.tick,
      });
      this._fileVerdict(state, 'appeal_voided', f.id, `${clerk.ref} voided the instrument`);
      this._log(state, `${clerk.name}: ${HELIX_BARKS.appealVoid}`, clerk.name);
      this._precedent(state, 'appeal_won');
      this._deed(state, 'appeal_won', f.id);
    } else {
      f.amount += HELIX_FINES.courtCostCr;
      f.surcharges += HELIX_FINES.courtCostCr;
      this.bus && this.bus.emit('helix:appealHeard', {
        fineId: f.id, outcome: 'upheld', clerkId: clerk.id, clerkRef: clerk.ref, tick: state.tick,
      });
      this._fileVerdict(state, 'appeal_upheld', f.id,
        `${clerk.ref} upheld the instrument — costs added`);
      this._log(state, `${clerk.name}: ${HELIX_BARKS.appealUpheld}`, clerk.name);
    }
    this._gcClosed(hx.fines, HELIX_FINES.keepClosed);
    return voided ? 'void' : 'upheld';
  },

  /** File the manifest: audits find you in order while the window holds. */
  fileManifest(state) {
    const hx = ensureHelixState(state);
    const svc = this._svc(state, hx, 'NO DESK IN REACH — manifests file at the ring');
    if (!svc) return null;
    const fee = HELIX_FINES.manifestFeeCr;
    if (this._credits(state) < fee) {
      this.bus && this.bus.emit('toast', { text: 'INSUFFICIENT FUNDS', kind: 'warn', ttl: 3 });
      return null;
    }
    hx.manifest = { filedAt: num(state.simTime), expiresAt: num(state.simTime) + HELIX_FINES.manifestValidS };
    this._charge(state, fee, 'helix_manifest:filed');
    this._rep(state, 1, 'helix_manifest_filed');
    this.bus && this.bus.emit('helix:manifestFiled', {
      filedAt: hx.manifest.filedAt, expiresAt: hx.manifest.expiresAt,
      serviceKind: svc.kind, tick: state.tick,
    });
    this._fileVerdict(state, 'manifest_filed', null, 'The hold reads on the register');
    this._log(state, HELIX_BARKS.manifestFiled);
    this._precedent(state, 'manifest_filed');
    this._deed(state, 'manifest_filed', null);
    return hx.manifest;
  },

  // ── 6. field assessors: the audit that rides out ────────────────────────────────
  _spawnAssessor(state, hx, rec, desk, now) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const auditId = `audit:${hx.seq++}`;
    const ang = frac('helix-assessor-ang', rec.key, hx.seq) * TAU;
    const r = HELIX_AUDIT.spawnR + frac('helix-assessor-r', rec.key, hx.seq) * 60;
    const e = this.helpers.spawnEntity({
      type: 'ship', team: 0, factionId: FACTION_ID,
      pos: { x: desk.pos.x + Math.cos(ang) * r, z: desk.pos.z + Math.sin(ang) * r },
      vel: { x: 0, z: 0 }, rot: ang + Math.PI / 2,
      radius: HELIX_AUDIT.assessorRadius, mass: HELIX_AUDIT.assessorMass,
      hull: HELIX_AUDIT.assessorHull, hullMax: HELIX_AUDIT.assessorHull, collides: true,
      data: {
        helixAssessor: auditId, helixDeskKey: rec.key,
        name: 'FIELD ASSESSOR', shipRole: 'field_assessor', sectorId: rec.sectorId,
        scannable: true, scanLabel: 'HELIX FIELD ASSESSOR — hold for the reading',
        ai: { archetype: 'field_assessor', passive: true, fsm: 'approach' },
      },
    });
    if (!e) return null;
    hx.assessors.push({
      entityId: e.id, gen: e.occupantGeneration ?? null,
      deskKey: rec.key, auditId, spawnedAt: now, holdT: 0, beganRead: false,
    });
    this.bus && this.bus.emit('helix:auditBegun', {
      auditId, assessorId: e.id, deskKey: rec.key, tick: state.tick,
    });
    this._log(state, HELIX_BARKS.auditOut, clerkById(rec.clerkId).name);
    return e;
  },

  _assessorEnt(state, row) {
    const e = ent(state, row.entityId);
    if (!e || e.alive === false) return null;
    if (e.data?.helixAssessor !== row.auditId) return null; // a recycled id never carries the audit's tag
    if (e.occupantGeneration != null && e.occupantGeneration !== row.gen) {
      row.gen = e.occupantGeneration;
    }
    return e;
  },

  _closeAssessor(state, hx, row, outcome) {
    const idx = hx.assessors.indexOf(row);
    if (idx >= 0) hx.assessors.splice(idx, 1);
    const e = ent(state, row.entityId);
    if (e && e.alive !== false && e.data?.helixAssessor === row.auditId
        && this.helpers.removeEntity) {
      this.helpers.removeEntity(e.id, { reason: `helix_audit_${outcome}` });
    }
  },

  /** The reading rules: an open file surcharges, no manifest bills, clean pays. */
  _ruleAudit(state, hx, row, now) {
    const openFine = hx.fines.find((f) => f.status === 'open');
    const manifestValid = hx.manifest && now < num(hx.manifest.expiresAt);
    let outcome;
    if (openFine) {
      outcome = 'findings';
      openFine.amount += HELIX_AUDIT.findingsSurchargeCr;
      openFine.surcharges += HELIX_AUDIT.findingsSurchargeCr;
      this._addVariance(hx, HELIX_AUDIT.findingsVariance);
      this._rep(state, HELIX_AUDIT.findingsRep, 'helix_audit_findings');
      this._fileVerdict(state, 'audit_findings', row.auditId,
        `Open instrument found — surcharge on ${openFine.id}`);
      this._log(state, HELIX_BARKS.auditFindings);
    } else if (!manifestValid) {
      outcome = 'undeclared';
      this._addVariance(hx, HELIX_AUDIT.undeclaredVariance);
      this._postFine(state, hx, 'unlogged_transit', HELIX_FINES.undeclaredFineCr,
        { subjectId: state.playerId });
      this._fileVerdict(state, 'audit_undeclared', row.auditId, 'No manifest on file');
      this._log(state, HELIX_BARKS.auditUndeclared);
    } else {
      outcome = 'clean';
      const rebate = Math.round(HELIX_AUDIT.rebateCr * this._tierMult(hx));
      this._grant(state, rebate, `helix_audit:${row.auditId}`);
      this._rep(state, HELIX_AUDIT.cleanRep, 'helix_audit_clean');
      this._fileVerdict(state, 'audit_clean', row.auditId, `Read clean — rebate ${rebate} cr`);
      this._log(state, HELIX_BARKS.auditClean);
      this._precedent(state, 'audit_clean');
      this._deed(state, 'audit_clean', row.auditId);
    }
    this.bus && this.bus.emit('helix:auditRuled', {
      auditId: row.auditId, deskKey: row.deskKey, outcome, tick: state.tick,
    });
    this._closeAssessor(state, hx, row, outcome);
  },

  _evadeAudit(state, hx, row, why) {
    this._addVariance(hx, HELIX_AUDIT.evadedVariance);
    this._fileVerdict(state, 'audit_evaded', row.auditId, why);
    this.bus && this.bus.emit('helix:auditEvaded', {
      auditId: row.auditId, deskKey: row.deskKey, tick: state.tick,
    });
    this._log(state, HELIX_BARKS.auditEvaded);
    const rec = hx.desks[row.deskKey];
    if (rec) rec.nextAuditAt = num(state.simTime) + HELIX_AUDIT.retryS;
    this._closeAssessor(state, hx, row, 'evaded');
  },

  _tickAudits(state, hx, entities, now, dt) {
    const player = ent(state, state.playerId);
    // The desk's audit clock — variance hastens the Bureau's patience spent.
    for (const { rec, ent: desk } of this._liveDesks(state, hx)) {
      if (now < rec.nextAuditAt) continue;
      const hasten = hx.variance >= HELIX_AUDIT.hastenAt ? HELIX_AUDIT.hastenMult : 1;
      rec.nextAuditAt = now + HELIX_AUDIT.auditPeriodS * hasten
        + frac('helix-audit-gap', rec.key, hx.seq) * HELIX_AUDIT.auditJitterS;
      if (hx.assessors.length >= HELIX_AUDIT.cap) continue;
      if (!player || player.alive === false || !player.pos) continue;
      if (hx.assessors.some((r) => r.deskKey === rec.key)) continue;
      this._spawnAssessor(state, hx, rec, desk, now);
    }
    // The read itself: close, hold, rule. Refusing the read is filed as evasion.
    for (const row of [...hx.assessors]) {
      const e = this._assessorEnt(state, row);
      if (!e) { this._closeAssessor(state, hx, row, 'lost'); continue; }
      if (!player || player.alive === false || !player.pos) {
        this._closeAssessor(state, hx, row, 'aborted');
        continue;
      }
      const dist = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) || 1;
      if (dist > HELIX_AUDIT.breakR && now - row.spawnedAt > HELIX_AUDIT.giveUpS) {
        this._evadeAudit(state, hx, row, 'The pilot refused the read');
        continue;
      }
      if (dist > HELIX_AUDIT.holdR) {
        this._steerTo(state, e, player.pos, HELIX_AUDIT.speed);
        row.holdT = Math.max(0, row.holdT - dt * 2); // the dwell bleeds off out of ring
        // A reading that began and then loses the hull entirely is evasion.
        if (row.holdT <= 0 && row.beganRead === true) {
          this._evadeAudit(state, hx, row, 'The read was broken off');
        }
        continue;
      }
      // Inside the reading ring: hold station and accumulate the dwell.
      row.beganRead = true;
      const vel = e.vel || { x: 0, z: 0 };
      const pv = player.vel || { x: 0, z: 0 };
      const mass = Math.max(1, num(e.mass, 1));
      queuePhysicsImpulse(e, {
        x: (num(pv.x) - num(vel.x)) * mass, z: (num(pv.z) - num(vel.z)) * mass,
      }, { tick: state.tick, provenance: 'helix_assessor_hold' });
      row.holdT += dt;
      if (row.holdT >= HELIX_AUDIT.dwellS) this._ruleAudit(state, hx, row, now);
    }
  },

  // ── 7. warrants & writ cutters ───────────────────────────────────────────────────
  _openWarrant(hx) { return hx.warrants.find((w) => w.state === 'open') || null; },

  /** File or escalate the warrant on the pilot's name. Latch before emits. */
  _postWarrant(state, hx, cause) {
    const add = num(WARRANT_HEAT[cause], 40);
    let w = this._openWarrant(hx);
    if (w) {
      w.heat += add;
      w.expiresAt = Math.max(num(w.expiresAt), num(state.simTime) + HELIX_WARRANT.windowS);
      this.bus && this.bus.emit('helix:warrantEscalated', {
        warrantId: w.id, cause, heat: w.heat, tick: state.tick,
      });
      return w;
    }
    const carry = Math.min(HELIX_WARRANT.dormantCarry, num(hx.lastDormantHeat));
    hx.lastDormantHeat = 0;
    w = {
      id: `war:${hx.seq++}`, cause,
      heat: add + carry,
      postedAt: num(state.simTime),
      expiresAt: num(state.simTime) + HELIX_WARRANT.windowS,
      seized: 0, state: 'open', nextWritAt: num(state.simTime), settledAt: 0,
    };
    hx.warrants.push(w);
    this.bus && this.bus.emit('helix:warrantPosted', {
      warrantId: w.id, cause, heat: w.heat, expiresAt: w.expiresAt, tick: state.tick,
    });
    this._fileVerdict(state, 'warrant_posted', w.id, `Cause: ${cause} — heat ${Math.round(w.heat)}`);
    this._log(state, HELIX_BARKS.warrantPosted);
    this.bus && this.bus.emit('toast', { text: 'BUREAU WARRANT FILED', kind: 'warn', tone: 'warn', ttl: 4 });
    return w;
  },

  _writEnt(state, row) {
    const e = ent(state, row.entityId);
    if (!e || e.alive === false) return null;
    if (e.data?.helixWritId !== row.warrantId) return null; // a recycled id never carries the writ's tag
    if (e.occupantGeneration != null && e.occupantGeneration !== row.gen) {
      row.gen = e.occupantGeneration;
    }
    return e;
  },

  _spawnWrit(state, hx, w, player, now) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const ang = frac('helix-writ-ang', w.id, hx.seq, now | 0) * TAU;
    const e = this.helpers.spawnEntity({
      type: 'ship', team: 0, factionId: FACTION_ID,
      pos: { x: player.pos.x + Math.cos(ang) * HELIX_WARRANT.spawnR,
             z: player.pos.z + Math.sin(ang) * HELIX_WARRANT.spawnR },
      vel: { x: 0, z: 0 }, rot: ang,
      radius: HELIX_WARRANT.writRadius, mass: HELIX_WARRANT.writMass,
      hull: HELIX_WARRANT.writHull, hullMax: HELIX_WARRANT.writHull, collides: true,
      data: {
        helixWrit: true, helixWritId: w.id,
        name: 'WRIT CUTTER', shipRole: 'writ_cutter',
        scannable: true,
        scanLabel: `HELIX WRIT CUTTER — serving ${w.id} — remit or run`,
        ai: { archetype: 'writ_cutter', passive: true, fsm: 'pursue' },
      },
    });
    if (!e) return null;
    hx.writCrew.push({ entityId: e.id, gen: e.occupantGeneration ?? null, warrantId: w.id });
    this.bus && this.bus.emit('helix:writSpawned', {
      warrantId: w.id, cutterId: e.id, heat: w.heat, tick: state.tick,
    });
    return e;
  },

  _recallWrit(state, hx, warrantId, reason) {
    for (let i = hx.writCrew.length - 1; i >= 0; i--) {
      const row = hx.writCrew[i];
      if (row.warrantId !== warrantId) continue;
      const e = ent(state, row.entityId);
      if (e && e.alive !== false && e.data?.helixWritId === warrantId
          && this.helpers.removeEntity) {
        this.helpers.removeEntity(e.id, { reason });
      }
      hx.writCrew.splice(i, 1);
    }
  },

  _settleWarrantRow(state, hx, w, how) {
    if (w.state !== 'open') return;
    w.state = how === 'dormant' ? 'dormant' : 'settled';   // latch before emits
    w.settledAt = num(state.simTime);
    if (how === 'dormant') hx.lastDormantHeat = Math.max(hx.lastDormantHeat, num(w.heat));
    this._recallWrit(state, hx, w.id, `helix_writ_${how}`);
    this.bus && this.bus.emit('helix:warrantSettled', {
      warrantId: w.id, cause: w.cause, how, seized: w.seized, tick: state.tick,
    });
    this._fileVerdict(state, how === 'dormant' ? 'warrant_dormant' : 'warrant_settled',
      w.id, `${w.cause} — ${how}${w.seized ? `, ${w.seized} cr seized` : ''}`);
    this._log(state, how === 'dormant' ? HELIX_BARKS.warrantDormant : HELIX_BARKS.warrantSettled);
  },

  /** Remit the account at a service point — the warrant is spent. */
  settleWarrant(state) {
    const hx = ensureHelixState(state);
    const w = this._openWarrant(hx);
    if (!w) return null;
    if (!this._svc(state, hx, 'NO DESK IN REACH — remittance is taken at the ring')) return null;
    const cost = Math.round(HELIX_WARRANT.settleBaseCr + w.heat * HELIX_WARRANT.settlePerHeatCr);
    if (this._credits(state) < cost) {
      this.bus && this.bus.emit('toast', {
        text: 'INSUFFICIENT FUNDS — the account will not remit itself', kind: 'warn', ttl: 3,
      });
      return null;
    }
    this._charge(state, cost, `helix_remit:${w.id}`);
    this._settleWarrantRow(state, hx, w, 'remitted');
    this._rep(state, HELIX_WARRANT.settleRep, 'helix_warrant_remitted');
    this._precedent(state, 'warrant_settled');
    this._deed(state, 'warrant_settled', w.id);
    return cost;
  },

  _tickWarrants(state, hx, entities, now, dt) {
    const player = ent(state, state.playerId);
    // Reap crew rows whose bodies are gone or recycled.
    for (let i = hx.writCrew.length - 1; i >= 0; i--) {
      if (!this._writEnt(state, hx.writCrew[i])) hx.writCrew.splice(i, 1);
    }
    for (const w of [...hx.warrants]) {
      if (w.state !== 'open') continue;
      if (now >= num(w.expiresAt)) { this._settleWarrantRow(state, hx, w, 'dormant'); continue; }
      if (!player || player.alive === false || !player.pos) continue;
      // Field the crew while the heat is served — a live crew stands down only
      // when the levy pays the heat down.
      const want = HELIX_WARRANT.writMax + (hx.variance >= HELIX_WARRANT.writExtraAt ? 1 : 0);
      if (w.heat >= HELIX_WARRANT.serveHeat && now >= num(w.nextWritAt)) {
        w.nextWritAt = now + HELIX_WARRANT.writBeatS;
        const live = hx.writCrew.filter((r) => r.warrantId === w.id).length;
        if (live < want) this._spawnWrit(state, hx, w, player, now);
      }
      // The clamp: contact levies the heat down — and brakes the hull it serves.
      for (const row of [...hx.writCrew]) {
        if (row.warrantId !== w.id) continue;
        const e = this._writEnt(state, row);
        if (!e) continue;
        const dist = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) || 1;
        if (dist > HELIX_WARRANT.clampR) {
          this._steerTo(state, e, player.pos, HELIX_WARRANT.writSpeed);
          continue;
        }
        const ed = e.data || (e.data = {});
        if (now < num(ed.nextLevyAt)) continue;
        ed.nextLevyAt = now + HELIX_WARRANT.levyBeatS;
        const levy = Math.min(HELIX_WARRANT.levyCr, Math.max(0, Math.floor(this._credits(state))));
        if (levy > 0) {
          this._charge(state, levy, `helix_writ:${w.id}:${row.entityId}`);
          w.seized += levy;
          w.heat = Math.max(0, w.heat - HELIX_WARRANT.levyHeatDrop);
        }
        // The seizure clamp bites — a braking impulse through the physics membrane.
        const vel = player.vel || { x: 0, z: 0 };
        const mass = Math.max(1, num(player.mass, 1));
        queuePhysicsImpulse(player, {
          x: -num(vel.x) * mass * HELIX_WARRANT.clampBrakeFrac,
          z: -num(vel.z) * mass * HELIX_WARRANT.clampBrakeFrac,
        }, { tick: state.tick, provenance: 'helix_seizure_clamp', externalEffect: true });
        this.bus && this.bus.emit('helix:writLevy', {
          warrantId: w.id, cutterId: e.id, amountCr: levy,
          heat: w.heat, seized: w.seized, tick: state.tick,
        });
        if (w.heat < HELIX_WARRANT.serveHeat) {
          this._recallWrit(state, hx, w.id, 'helix_writ_served');
          this._fileVerdict(state, 'writ_served', w.id, `The writ is served — ${w.seized} cr seized`);
        }
        break; // one clamp per tick — orderly
      }
    }
    this._gcClosed(hx.warrants, 6);
  },

  // ── 8. the kill wire — one handler reads every death for the docket ─────────────
  _onKilled(p) {
    const state = this.state;
    if (!state || !p || p.id == null) return;
    const hx = ensureHelixState(state);
    const victim = ent(state, p.id);
    const vd = victim && victim.data;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    const hostile = p.targetHostileToPlayer === true;
    const now = num(state.simTime);

    // A desk fell — the desk verdict owns the whole event. A desk destroyed
    // before its first discovery tick ever filed a record is still a wrecked
    // Bureau instrument — the body tag names it, so the consequence lands.
    if (vd && vd.helixAudit === true && typeof vd.helixDeskId === 'string') {
      const rec = hx.desks[vd.helixDeskId];
      if (rec && rec.gone !== true) {
        this._markDeskGone(state, hx, rec, 'destroyed', byPlayer);
      } else if (!rec && byPlayer) {
        this._addVariance(hx, HELIX_VARIANCE.desk);
        this._postWarrant(state, hx, 'desk_wrecked');
        this._fileVerdict(state, 'desk_lost', vd.helixDeskId,
          'An assessment desk went down before the ledger filed it');
        this._log(state, HELIX_BARKS.deskLost);
      }
      return;
    }
    // A field assessor died — the read is broken; the Bureau files the instrument.
    if (vd && vd.helixAssessor != null) {
      const row = hx.assessors.find((r) => r.auditId === vd.helixAssessor);
      if (row) this._closeAssessor(state, hx, row, 'killed');
      if (byPlayer) {
        this._addVariance(hx, HELIX_VARIANCE.assessor);
        this._postWarrant(state, hx, 'assessor_killed');
        this._fileVerdict(state, 'assessor_killed', vd.helixAssessor, 'An audit hull was destroyed');
      }
      return;
    }
    // A writ cutter died — resisting the writ is filed on the same warrant.
    if (vd && vd.helixWrit === true) {
      for (let i = hx.writCrew.length - 1; i >= 0; i--) {
        if (hx.writCrew[i].entityId === p.id) hx.writCrew.splice(i, 1);
      }
      if (byPlayer) {
        this._addVariance(hx, HELIX_VARIANCE.writKilled);
        // Resisting the writ escalates through the warrant path itself — the
        // heat lands, the window refreshes, and the escalation is heard.
        this._postWarrant(state, hx, 'writ_killed');
        this._fileVerdict(state, 'writ_killed', p.id, 'A writ hull was resisted');
      }
      return;
    }
    // A noticed hulk died — titled or jumped depending on who swung the torch.
    if (vd && vd.helixNoticeId != null) {
      const n = hx.notices.find((x) => x.id === vd.helixNoticeId && x.state === 'open');
      vd.helixNoticeId = null;
      if (n) {
        n.state = byPlayer ? 'jumped' : 'lapsed';
        n.closedAt = now;
        if (byPlayer && this._paidOnce(hx, `jumped:${n.id}`)) {
          this._addVariance(hx, HELIX_VARIANCE.jumped);
          this._fileVerdict(state, 'salvage_jumped', n.id, 'A noticed title was stripped');
          this.bus && this.bus.emit('helix:noticeJumped', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, tick: state.tick,
          });
        } else if (!byPlayer) {
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: n.kind, deskKey: n.deskKey, cause: 'wreck_lost', tick: state.tick,
          });
        }
      }
      return;
    }
    // A collectible hull died — the player collects the Bureau's share.
    if (vd && vd.helixCollectId != null) {
      const n = hx.notices.find((x) => x.id === vd.helixCollectId && x.state === 'open');
      if (n) {
        if (byPlayer) {
          this._verifyNotice(state, hx, n, 'collected');
          this._log(state, HELIX_BARKS.collected);
        } else {
          n.state = 'lapsed';
          n.closedAt = now;
          this.bus && this.bus.emit('helix:noticeLapsed', {
            noticeId: n.id, kind: 'collect', deskKey: n.deskKey, cause: 'target_lost', tick: state.tick,
          });
        }
      }
      return;
    }
    // A lien drone died — the scrape is legal while it is stuck; killing a
    // hunting instrument is a charge the Bureau files.
    if (vd && vd.lienDrone === true) {
      if (vd.lienOn != null) {
        const stuckId = vd.lienOn;
        const ship = ent(state, stuckId);
        if (ship && ship.data && ship.data.lienStuck === p.id) {
          delete ship.data.lienStuck;
          delete ship.data.lienMassT;
        }
        vd.lienOn = null;
        this.bus && this.bus.emit('helix:lienScraped', { shipId: stuckId, droneId: p.id, t: now });
        return;
      }
      if (byPlayer && !vd.deathFined) {
        vd.deathFined = true;         // one destroyed instrument bills once
        this._addVariance(hx, HELIX_VARIANCE.instrument);
        this._postFine(state, hx, 'instrument_destroyed', HELIX_FINES.instrumentFineCr,
          { subjectId: state.playerId });
        this._fileVerdict(state, 'instrument_destroyed', p.id, 'A hunting lien was destroyed');
        this._log(state, HELIX_BARKS.instrumentDestroyed);
      }
      return;
    }
    // Still-masked pack members die under someone else's flag — the Bureau
    // never filed them; the mask holds even in death.
    if (vd && vd.helixFalseFlag === true) return;
    // An unmasked Bureau hull died — adjudicator or courier, the file notes it.
    // The body's own stamps answer first; the receipt's factionId is the same
    // fact for a kill that swept the corpse before this handler ran.
    const isHelixHull = (vd && vd.falseFlagDropped === true)
      || (victim && victim.factionId === FACTION_ID)
      || (p.factionId === FACTION_ID);
    const isShip = victim ? victim.type === 'ship' : p.type === 'ship';
    if (isHelixHull && byPlayer && isShip) {
      const cause = vd && vd.falseFlagDropped === true ? 'adjudicator_killed' : 'courier_killed';
      this._addVariance(hx, HELIX_VARIANCE.adjudicator);
      const w = this._postWarrant(state, hx, cause);
      // A hull that drew first files at half heat — self-defense mitigates, not excuses.
      if (w && hostile) w.heat = Math.max(0, w.heat - Math.round(num(WARRANT_HEAT[cause]) / 2));
      this._fileVerdict(state, cause, p.id, hostile
        ? 'A Bureau hull that drew first — filed at half heat'
        : 'A Bureau instrument was broken');
    }
  },

  // ── the tick ────────────────────────────────────────────────────────────────────
  update(dt, state) {
    const hx = ensureHelixState(state);
    const now = num(state.simTime);
    const step = Math.max(0, num(dt, 1 / 60));
    const entities = entityListOf(state);
    this._tickPacks(state, hx, entities, now);
    this._tickLienDrones(state, hx, entities, now);
    this._tickDesks(state, hx, entities, now, step);
    this._tickNotices(state, hx, entities, now, step);
    this._tickFines(state, hx, now);
    this._tickAudits(state, hx, entities, now, step);
    this._tickWarrants(state, hx, entities, now, step);
    if (hx.variance > 0) hx.variance = Math.max(0, hx.variance - HELIX_VARIANCE.decayPerS * step);
  },
};

export default factionHelix;
