// faction_frontier.js — W-FRONTIER (build_map §34.5 row 532, bible 02 §7).
//
// "Every captain on this board believes they are temporary." Done-when:
//   · six homestead modules plus a frame — tow them in, they snap onto slots
//   · Barn Raising (E-21): all six snapped starts the welders' clock; finish
//     before the tide/gate window or a half-built homestead survives, damaged
//   · a raised homestead persists on the chart, gains traffic on a steady beat,
//     and asks for supply runs when it has been stranded
//   · Weld Head: welds the held object wherever it touches — the bond persists
//     after the Line lets go
//
// THE BOARD — the settler layer a raised stead plugs into:
//   · LEAD WIRE — every raised stead posts board leads on its own clock. A lead
//     verifies when the player does the thing it names (feed a thin stead, put
//     a weld on, repel a marked raider) and pays; one nobody acts on sours and
//     costs a little standing. The wire remembers both.
//   · JOB TIERS — deeds done for the board (supplies, verified leads, carried
//     markers, settled claims, repelled raiders, collected vendettas) raise a
//     frontier standing tier; a better name means better pay on every verb.
//   · MUTUAL AID — a stranded stead owes; a provisioned stead carries. The
//     creditor posts a marker pod the player can tow to the debtor — or the
//     player covers the marker with their own supplies. Carried or covered,
//     the stead that can pay pays the carrier.
//   · SALVAGE-RIGHTS DISPUTES — a derelict on a stead's claim ring is contested
//     ground between the stead and the drift. Tow it into the claimant's ring
//     and the stead pays; strip it yourself and the board files a jumping;
//     let it drift out and the claim lapses.
//   · DEFENSE CALLS — raised steads draw raids. Raiders close in, strip the
//     stead's stores and batter its hull to a wrecked floor, and slip off —
//     the stead calls for hands while they are inside its watch ring. A
//     raider repelled on stead ground pays a bounty. A stead's hull can be
//     killed, but only by real ordnance: a raid robs, it does not raze —
//     the homestead persists on the chart.
//   · FRONTIER JUSTICE — a verdict ledger: raiders repelled, steads lost,
//     salvage jumped, outlaws named, vendettas posted and paid. A vendetta
//     rides the killer's hull as an ownership tag — a recycled entity id can
//     never collect on a body it is not.
//
// Deterministic: every clock reads simTime; snapped modules are kinematic on
// the frame; raid/lead rolls draw from serializable mulberry32 seeds on the
// homestead record; bark picks draw from content hashes. Money moves only
// through economy:grantCredits; standing only through faction:repDelta. All
// ledger state is plain JSON under state.frontier; once-only stamps ride
// entity .data (enumerable → serialized) where a body carries the truth.

import {
  FRONTIER_MODULES,
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
  FRONTIER_WELD_HEAD,
  FRONTIER_HOMESTEAD,
  FRONTIER_BARKS,
} from '../data/factions/free.js';
import { hash32, drawSeeded } from '../core/rng.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';

const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const touching = (a, b) => dist2(a.pos, b.pos) <= (a.radius + b.radius + 2) ** 2;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };

const FACTION_ID = 'faction_free';
const MAX_STEADS = 24;
// Site seeding — the production spawner for the barn-raising pipeline.
const FRONTIER_SITE = Object.freeze({
  minR: 1400,        // a site never plants under the player's nose
  spreadR: 900,
  modMinR: 170,      // outside snapRange (130): modules must be delivered
  modSpreadR: 190,
  supplyPods: 2,
  replantS: 600,     // a destroyed frame re-plants on this cooldown
  restockS: 90,      // a lost module re-stocks on this clock
});

// ── The board: lead wire ───────────────────────────────────────────────────────
// A raised, crewed stead posts a lead on its own beat. Leads are the frontier's
// rumor network: hearsay with a name on it. Verify by doing the named work.
export const FRONTIER_BOARD = Object.freeze({
  leadPeriodS: 95,          // a stead posts a lead roughly on this beat
  leadJitterS: 45,          // per-stead jitter so two steads never chorus
  firstLeadS: 40,           // a fresh stead's first post comes quickly — it wants known
  leadTtlS: 420,            // an open lead nobody acts on sours after this
  maxOpenLeads: 6,          // the wire is short — scarcity is the frontier
  leadLogKeep: 12,          // closed leads kept for the record strip
  verifyPayCr: 190,         // base payout for a verified lead (× tier mult)
  verifyRep: 2,
  sourRep: -2,              // a lead the player lets sour costs a little standing
  supplyFeeCr: 140,         // the stead pays the runner for a landed supply pod
  supplyRep: 1,
});

const LEAD_KINDS = Object.freeze(['hungry', 'hands', 'raid']);
const LEAD_LINES = Object.freeze({
  hungry: Object.freeze([
    '{name} is thin on stores. Pods land, board pays.',
    'Word from {name}: the garden\'s behind the ration again.',
    '{name} put it plain — stores low, credit good.',
    'Thin shelves at {name}. Any pod counts.',
  ]),
  hands: Object.freeze([
    '{name} wants weld hands. Anything that sticks counts.',
    'Board says {name} has frame work going — bring a Weld Head.',
    '{name} is short a welder. Paid for a real bond.',
    'Arc work at {name}. One good weld pays.',
  ]),
  raid: Object.freeze([
    'Raiders marked on {name}\'s ring. The stead pays for repelled hulls.',
    '{name} reads raider sign on the tide. Bounty on the repel.',
    'Freebooters circling {name}. The board posts a repel price.',
    '{name} wants a raider hull cooled inside its ring.',
  ]),
});
const LEAD_VERIFY_LINES = Object.freeze([
  'Word travels — {name} marks the lead paid.',
  '{name} confirms. The board settles.',
  'True word from {name}. Credit where the board owes.',
  'The wire was right about {name}. Paid.',
]);
const LEAD_SOUR_LINES = Object.freeze([
  '{name}\'s lead went cold. The board remembers wasted words.',
  'Nobody ran {name}\'s lead. It sours on the wire.',
  '{name} stops asking. The wire keeps the score.',
]);

// ── Job reputation tiers ───────────────────────────────────────────────────────
// Deeds are the frontier's only resume: feed a stead, run a lead, carry a marker,
// settle a claim, repel a raider, collect a posted name. The tier scales pay.
export const FRONTIER_JOB_TIERS = Object.freeze([
  { tier: 0, deeds: 0,  id: 'drifter', label: 'Drifter',               payMult: 1.0,
    line: 'Every captain on this board believes they are temporary.' },
  { tier: 1, deeds: 3,  id: 'hand',    label: 'Hired Hand',            payMult: 1.12,
    line: 'The board knows your line. Work finds you now.' },
  { tier: 2, deeds: 8,  id: 'hauler',  label: 'Stead Hauler',          payMult: 1.28,
    line: 'Steads ask for you by name. That is not nothing out here.' },
  { tier: 3, deeds: 15, id: 'stead',   label: 'Steadkeeper',           payMult: 1.5,
    line: 'Half the homesteads on the wire owe you a season.' },
  { tier: 4, deeds: 26, id: 'pillar',  label: 'Pillar of the Reach',   payMult: 1.8,
    line: 'Temporary? You are the thing the temporary leans on.' },
]);

export function frontierTierFor(deeds) {
  const d = Math.max(0, intOr(deeds));
  let row = FRONTIER_JOB_TIERS[0];
  for (const t of FRONTIER_JOB_TIERS) if (d >= t.deeds) row = t;
  return row;
}

// ── Mutual aid — debts between settlers the player can join ────────────────────
export const FRONTIER_MUTUAL_AID = Object.freeze({
  offerPeriodS: 140,        // the board tries to pair a debtor with a carrier on this beat
  markerTtlS: 540,          // a posted marker lapses after this
  settleR: 260,             // the marker inside this of the debtor lands the aid
  feeCr: 320,               // the creditor stead pays the carrier (× tier mult)
  repDelta: 3,
  maxOpen: 3,               // bounded open markers
});

// ── Salvage-rights disputes ────────────────────────────────────────────────────
export const FRONTIER_SALVAGE_CLAIMS = Object.freeze({
  claimRadius: 900,         // a derelict this close to a stead is contested ground
  settleRadius: 260,        // tow it inside this of a claimant to settle it their way
  windowS: 300,
  settlePayCr: 260,         // the stead pays for its claim honored (× tier mult)
  settleRep: 3,
  jumpedRep: -4,            // stripping a filed claim is jumping it
  maxOpen: 2,
});

// ── Defense calls — raids on raised steads ─────────────────────────────────────
// A raid ROBS; it does not raze. Raiders strip the stead's supplies and batter
// its hull down to a floor, then slip back to the rocks. Killing a homestead is
// for real ordnance — the raised stead persists on the chart.
export const FRONTIER_DEFENSE = Object.freeze({
  firstRaidS: 150,          // a fresh stead is left alone at least this long
  raidMinS: 200, raidMaxS: 480, // re-raid clock after each raid
  raidCapSession: 24,       // live raid hulls running at once — a bound, not a lifetime budget
  raiderMax: 3,             // a raid is 1–3 hulls
  raiderHull: 120,
  raiderRadius: 14, raiderMass: 36,
  spawnR: 1050,             // raiders drop in this far out
  raidSpeed: 34,            // they close on the stead at this speed
  standoffR: 240,           // and hold at this ring to strip it
  contactPad: 90,           // inside stead.radius+pad they are stripping it
  raidStripS: 14,           // seconds of contact per stripped supply unit
  raidHullChip: 10,         // hull battered per stripped unit
  hullFloorFrac: 0.15,      // raids batter hull down to this fraction, never to zero
  struckBeatS: 5,           // struck-callout beat while stripping
  watchRadius: 700,         // a hostile this close opens the defense call
  leaveMargin: 300,         // a done raider slips off and despawns this far past the ring
  orphanDespawnS: 60,       // a raider whose stead fell drifts off and despawns
  repelPayCr: 160,          // per hostile repelled on stead ground (× tier mult)
  repelRep: 2,
});

// ── Frontier justice — the verdict ledger and vendettas ────────────────────────
export const FRONTIER_JUSTICE = Object.freeze({
  logCap: 24,
  watchRadius: 700,         // "on stead ground" for verdict purposes
  settlerKillRep: -10,      // a frontier hull murdered on stead ground
  neutralKillRep: -4,       // an unprovoked kill of anyone else in their ring
  steadLostRep: -12,        // the player broke a homestead herself
  vendettaPayCr: 400,       // a posted name collected (× tier mult)
  vendettaRep: 5,
  vendettaWindowS: 900,     // a posted name stays warm this long
  vendettaMax: 6,
});

const STEAD_NAMES = Object.freeze([
  'Stead Mercy', 'Half-Home', 'The Quilt', 'Tide Watch', 'Gantry Nine', 'Loam',
  'Stead Perseverance', 'The Lean-To', 'Grav Garden', 'Patch', 'Stead Borrowed',
  'Kestrel Rest', 'The Annex', 'Dunnage', 'Stead True', 'Cinder Ledge',
  'Moss Berth', 'The Foundering', 'Salt Lamp', 'Stead Verity', 'Low Choir',
  'The Ballast', 'Rill', 'Harrow Stead',
]);

const PAID_STAMPS_CAP = 96;

function steadNameFor(entityId) {
  return STEAD_NAMES[hash32('stead-name', entityId) % STEAD_NAMES.length];
}

function normalizeSteadRec(rec, now = 0) {
  if (!isObj(rec.pos)) rec.pos = { x: 0, z: 0 };
  rec.pos.x = num(rec.pos.x); rec.pos.z = num(rec.pos.z);
  if (!Array.isArray(rec.modules)) rec.modules = [];
  rec.sectorId = rec.sectorId == null ? null : str(rec.sectorId, null);
  // A latched clock never legitimately sits further out than the horizon its own
  // writer uses — a further value is corruption and would wedge that stead's
  // traffic, stranding, leads, or raids forever.
  rec.raisedAt = Math.min(num(rec.raisedAt), now);
  rec.lastSupplyAt = Math.min(num(rec.lastSupplyAt, rec.raisedAt), now);
  rec.partial = rec.partial === true;
  rec.traffic = Math.max(0, intOr(rec.traffic));
  rec.supplies = Math.max(0, intOr(rec.supplies));
  rec.stranded = rec.stranded === true;
  // Board layer fields — absent on pre-expansion saves; fill deterministically.
  rec.name = str(rec.name) || steadNameFor(rec.entityId);
  rec.gone = rec.gone === true;
  rec.raidSeed = intOr(rec.raidSeed, hash32('frontier-raid', rec.entityId) || 1);
  rec.raidSeq = intOr(rec.raidSeq);
  rec.nextRaidAt = Math.min(num(rec.nextRaidAt, rec.raisedAt + FRONTIER_DEFENSE.firstRaidS),
    now + FRONTIER_DEFENSE.firstRaidS + FRONTIER_DEFENSE.raidMaxS);
  rec.nextLeadAt = Math.min(num(rec.nextLeadAt, rec.raisedAt + FRONTIER_BOARD.firstLeadS),
    now + FRONTIER_BOARD.leadPeriodS + FRONTIER_BOARD.leadJitterS);
  rec.callId = rec.callId == null ? null : str(rec.callId);
  rec.gen = rec.gen == null ? null : intOr(rec.gen, null);
  return rec;
}

// Row validators for the board ledgers — a malformed row drops, a clean ledger keeps
// its array identity. Replacing the array on every normalize would orphan rows pushed
// while a nested ensure ran mid-expression, and burn ~7 array allocs × ~15 calls a tick.
const VALID_LEAD = (r) => isObj(r) && typeof r.id === 'string' && LEAD_KINDS.includes(r.kind);
const VALID_DEBT = (r) => isObj(r) && typeof r.id === 'string' && r.debtorId != null && r.creditorId != null;
const VALID_DISPUTE = (r) => isObj(r) && typeof r.id === 'string' && r.wreckId != null
  && Array.isArray(r.steadIds); // resolve iterates steadIds — a malformed row must not sink the tick
const VALID_CALL = (r) => isObj(r) && typeof r.id === 'string' && r.steadId != null;
const VALID_VENDETTA = (r) => isObj(r) && typeof r.id === 'string' && r.targetId != null;
const VALID_JUSTICE = (r) => isObj(r) && typeof r.id === 'string' && typeof r.kind === 'string';
const dropMalformed = (rows, valid) => (rows.some((r) => !valid(r)) ? rows.filter(valid) : rows);

/** Fresh serializable Frontier record: homesteads, supply runs, and the board. */
export function ensureFrontierState(state) {
  if (!isObj(state.frontier)) {
    state.frontier = { homesteads: [], supplyRuns: [] };
  }
  const f = state.frontier;
  if (!Array.isArray(f.homesteads)) f.homesteads = [];
  if (!Array.isArray(f.supplyRuns)) f.supplyRuns = [];
  if (!Array.isArray(f.leads)) f.leads = [];
  if (!Array.isArray(f.debts)) f.debts = [];
  if (!Array.isArray(f.disputes)) f.disputes = [];
  if (!Array.isArray(f.calls)) f.calls = [];
  if (!Array.isArray(f.vendettas)) f.vendettas = [];
  if (!Array.isArray(f.justice)) f.justice = [];
  if (!isObj(f.sites)) f.sites = {};
  if (!isObj(f.paid)) f.paid = {};
  // Writers cap stamps at PAID_STAMPS_CAP; a hostile bag can carry any size —
  // bound it at normalize like every other ledger (insertion order = evict order).
  {
    const paidKeys = Object.keys(f.paid);
    if (paidKeys.length > PAID_STAMPS_CAP) {
      for (const k of paidKeys.slice(0, paidKeys.length - PAID_STAMPS_CAP)) delete f.paid[k];
    }
  }
  f.seq = intOr(f.seq);
  f.siteSeq = intOr(f.siteSeq);
  f.deeds = intOr(f.deeds);
  f.tier = intOr(f.tier);
  f.raidsSpawned = intOr(f.raidsSpawned);
  f.nextDebtAt = num(f.nextDebtAt);
  const now = num(state.simTime);
  // Drop malformed rows outright — a corrupt row must not sink the tick.
  f.homesteads = dropMalformed(f.homesteads, (r) => isObj(r) && r.entityId != null);
  for (const rec of f.homesteads) normalizeSteadRec(rec, now);
  // One live rec per entity id — a second non-gone row on the same id can only be
  // corruption (a recycled id's stale rec is already marked gone), and it would
  // double every per-stead beat on the shared body.
  if (f.homesteads.length > 1) {
    const seen = new Set();
    let dupes = false;
    for (const r of f.homesteads) {
      if (r.gone === true) continue;
      if (seen.has(r.entityId)) { dupes = true; break; }
      seen.add(r.entityId);
    }
    if (dupes) {
      const keep = new Set();
      f.homesteads = f.homesteads.filter((r) => {
        if (r.gone === true) return true;
        if (keep.has(r.entityId)) return false;
        keep.add(r.entityId);
        return true;
      });
    }
  }
  // Writers cap the ledger at MAX_STEADS; a hostile bag can carry any size. Gone
  // rows are chart history — evict the oldest graves first, then the oldest recs.
  if (f.homesteads.length > MAX_STEADS * 8) {
    const overflow = f.homesteads.length - MAX_STEADS * 8;
    const graves = f.homesteads.filter((r) => r.gone === true).slice(0, overflow);
    if (graves.length) {
      const drop = new Set(graves);
      f.homesteads = f.homesteads.filter((r) => !drop.has(r));
    }
    if (f.homesteads.length > MAX_STEADS * 8) {
      f.homesteads.splice(0, f.homesteads.length - MAX_STEADS * 8);
    }
  }
  // Site rows: one per seeded sector, {frameId, frameGen, plantedAt, nextAt,
  // nextRestockAt}. Malformed rows drop outright; the row's key is the sectorId.
  for (const sid of Object.keys(f.sites)) {
    const s = f.sites[sid];
    if (!isObj(s)) { delete f.sites[sid]; continue; }
    s.frameId = s.frameId == null ? null : s.frameId;
    s.frameGen = s.frameGen == null ? null : intOr(s.frameGen);
    s.plantedAt = num(s.plantedAt);
    // Latched cooldowns are never legitimately further out than their own period —
    // a further value is corruption and wedges planting/restocking forever.
    s.nextAt = Math.min(num(s.nextAt), now + FRONTIER_SITE.replantS);
    s.nextRestockAt = Math.min(num(s.nextRestockAt), now + FRONTIER_SITE.restockS);
    s.restockSeq = intOr(s.restockSeq);
  }
  // One row per authored sector at most — the key set IS the bound.
  const siteKeys = Object.keys(f.sites);
  if (siteKeys.length > 8) {
    siteKeys.sort((a, b) => f.sites[a].plantedAt - f.sites[b].plantedAt);
    for (const sid of siteKeys.slice(0, siteKeys.length - 8)) delete f.sites[sid];
  }
  // Board deadlines are latched at post-time + ttl — a further value is corruption
  // and would wedge a wire slot (leads), a marker slot (debts), a claim slot
  // (disputes), or a bounty slot (vendettas) forever.
  const clampRows = (rows, horizonS) => {
    for (const r of rows) {
      if (r.state === 'open') r.expiresAt = Math.min(num(r.expiresAt), now + horizonS);
    }
  };
  f.supplyRuns = dropMalformed(f.supplyRuns, (r) => isObj(r) && r.homesteadId != null);
  if (f.supplyRuns.length > 32) f.supplyRuns.splice(0, f.supplyRuns.length - 32);
  f.nextDebtAt = Math.min(f.nextDebtAt, now + FRONTIER_MUTUAL_AID.offerPeriodS);
  f.leads = dropMalformed(f.leads, VALID_LEAD);
  f.debts = dropMalformed(f.debts, VALID_DEBT);
  f.disputes = dropMalformed(f.disputes, VALID_DISPUTE);
  f.calls = dropMalformed(f.calls, VALID_CALL);
  f.vendettas = dropMalformed(f.vendettas, VALID_VENDETTA);
  f.justice = dropMalformed(f.justice, VALID_JUSTICE);
  clampRows(f.leads, FRONTIER_BOARD.leadTtlS);
  clampRows(f.debts, FRONTIER_MUTUAL_AID.markerTtlS);
  clampRows(f.disputes, FRONTIER_SALVAGE_CLAIMS.windowS);
  clampRows(f.vendettas, FRONTIER_JUSTICE.vendettaWindowS);
  // Writers keep every ledger bounded; a hostile bag can carry any size — cap the
  // totals so per-tick scans stay flat. Oldest rows evict first.
  if (f.leads.length > 96) f.leads.splice(0, f.leads.length - 96);
  if (f.debts.length > 64) f.debts.splice(0, f.debts.length - 64);
  if (f.disputes.length > 64) f.disputes.splice(0, f.disputes.length - 64);
  if (f.calls.length > 96) f.calls.splice(0, f.calls.length - 96);
  if (f.vendettas.length > 64) f.vendettas.splice(0, f.vendettas.length - 64);
  if (f.justice.length > 64) f.justice.splice(0, f.justice.length - 64);
  return f;
}

/** The player's frontier standing: current tier row plus the deed count behind it. */
export function frontierJobTier(state) {
  const f = ensureFrontierState(state);
  const row = frontierTierFor(f.deeds);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, deeds: f.deeds };
}

/** Snapshot of the whole board for a HUD/board screen: leads, debts, claims, calls, verdicts. */
export function frontierBoard(state) {
  const f = ensureFrontierState(state);
  return {
    tier: frontierJobTier(state),
    deeds: f.deeds,
    raidsSpawned: f.raidsSpawned,
    supplyRuns: f.supplyRuns.map((r) => ({ ...r })),
    leads: f.leads.map((r) => ({ ...r, pos: r.pos && { ...r.pos } })),
    debts: f.debts.map((r) => ({ ...r })),
    disputes: f.disputes.map((r) => ({ ...r,
      // steadIds is row-validated; steadNames is not — a hostile bag could carry a
      // non-iterable and a bare spread would throw out of the read seam.
      steadIds: Array.isArray(r.steadIds) ? [...r.steadIds] : [],
      steadNames: Array.isArray(r.steadNames) ? [...r.steadNames] : [] })),
    calls: f.calls.map((r) => ({ ...r })),
    vendettas: f.vendettas.map((r) => ({ ...r })),
    justice: f.justice.map((r) => ({ ...r })),
  };
}

/** Open board leads (the rumor wire) — copies, newest last. */
export function frontierLeads(state) { return frontierBoard(state).leads; }

/** The frontier-justice verdict ledger — copies, oldest first. */
export function frontierJustice(state) { return frontierBoard(state).justice; }

function isClaimableWreck(e) {
  if (!e || e.alive === false || e.id == null) return false;
  const d = e.data || {};
  if (d.frontierRaider === true || d.frontierAidId != null || d.supplyCargo === true) return false;
  // Pinned work is not contested ground. Mission content and durable/player
  // property carry the same markers every other consumer refuses (the encounter
  // adopted-actor check, matter's protected-content gate) — a dispute settles by
  // removing the hulk, and a filed claim penalizes the haul-out, so an authored
  // mission wreck must never reach either branch.
  if ((e.flags && (e.flags.persistent === true || e.flags.missionPinned === true))
      || d.persistent === true || d.missionPinned === true
      || d.missionId != null || d.missionTag != null
      || d.missionTargetSlot != null || d.wreckMissionId != null) return false;
  return e.type === 'wreck' || e.type === 'derelict'
    || d.derelict === true || d.salvageClaimable === true || d.frontierClaim === true;
}

function isShip(e) { return !!e && e.type === 'ship'; }

/** The frontier raider read on a body — shared by the call sweep and the kill wire. */
function isRaiderBody(e, { includeDead = false } = {}) {
  if (!e || (e.alive === false && !includeDead) || !isShip(e)) return false;
  const d = e.data || {};
  if (d.frontierRaider === true || d.raider === true) return true;
  const ai = d.ai;
  if (ai && ai.passive === true) return false;
  if (ai && (ai.pirate === true || ai.hostile === true)) return true;
  if (e.team != null && e.team === 1) return true; // hostile team reads as raiders to the board
  return false;
}

export const frontierHomesteads = {
  name: 'frontierHomesteads',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureFrontierState(this.state);
    this._subs = [
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
      // The restore seam: a frontier payload rebinds generations to the fresh
      // occupants; no payload means the live bag is bleed-over from the session
      // the load replaced, and it clears.
      this.bus.on('save:loaded', () => this._afterRestore()),
      // A new run replaces the session in place: the bag is bleed-over from the
      // abandoned run — and its stale recs would write a false 'gone' verdict for
      // every homestead body the run reset just destroyed. Both aliases fire:
      // 'game:new' at the trigger, 'game:newGame' after resetRunState.
      this.bus.on('game:new', () => this._clearBoard()),
      this.bus.on('game:newGame', () => this._clearBoard()),
    ];
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off && off(); } catch { /* listener hygiene */ }
    }
    this._subs = [];
  },

  // ── persistence: the whole board rides the save as one plain-JSON bag ──────
  // serialize() already returns a fresh deep clone — the envelope's defensive
  // copy would only clone a clone.
  saveSnapshotOwned: true,

  serialize() {
    const state = this.state;
    if (!state) return {};
    return JSON.parse(JSON.stringify(ensureFrontierState(state)));
  },

  deserialize(data) {
    const state = this.state;
    if (!state) return;
    this._restoredFromSave = true;
    state.frontier = (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
    return ensureFrontierState(state);
  },

  /** Runs on save:loaded, after every restore seam has settled — respawned bodies
   *  exist by then, so recorded occupant generations can rebind to the live hulls
   *  that still carry the matching tags. */
  _afterRestore() {
    const state = this.state;
    if (!state) return;
    if (this._restoredFromSave !== true) {
      // No frontier payload rode this envelope — the bag is bleed-over from the
      // session the load replaced. A stead in another save is another stead.
      state.frontier = null;
    }
    this._restoredFromSave = false;
    ensureFrontierState(state);
    this._rebindGenerations(state);
  },

  /** New run boundary: the board's bag is run-scoped. Clearing to null lets
   *  ensureFrontierState rebuild the fresh record on the next touch — the same
   *  shape the save bleed-over arm installs. */
  _clearBoard() {
    const state = this.state;
    if (!state) return;
    state.frontier = null;
    ensureFrontierState(state);
  },

  /** Entity ids recycle and a restore mints fresh occupant generations — rebind
   *  each recorded generation to the body that still carries the matching tag.
   *  A row whose body is truly gone keeps its cold generation, so the tick writes
   *  the honest verdict instead of adopting an impostor at a recycled id. */
  _rebindGenerations(state) {
    const f = ensureFrontierState(state);
    const get = (id) => (state.entities && id != null ? state.entities.get(id) : null);
    for (const rec of f.homesteads) {
      const e = get(rec.entityId);
      if (e && e.data && e.data.homestead === true) rec.gen = e.occupantGeneration ?? null;
    }
    for (const d of f.debts) {
      if (d.state !== 'open' || d.markerId == null) continue;
      const m = get(d.markerId);
      if (m && m.data && m.data.frontierAidId === d.id) d.markerGen = m.occupantGeneration ?? null;
    }
    for (const d of f.disputes) {
      if (d.state !== 'open') continue;
      const w = get(d.wreckId);
      if (w && w.data && w.data.frontierDisputeId === d.id) d.wreckGen = w.occupantGeneration ?? null;
    }
    for (const v of f.vendettas) {
      if (v.state !== 'open') continue;
      const t = get(v.targetId);
      if (t && t.data && t.data.vendettaMark === v.id) v.gen = t.occupantGeneration ?? null;
    }
    // Snapped module pods carry their frame bond on .data — the respawned frame
    // minted a fresh generation, so rebind it or the seeding sweep releases
    // every parked pod and the ring re-snaps in a different order.
    for (const e of state.entityList || []) {
      const d = e && e.data;
      if (!d || d.snapped !== true || d.snappedFrameId == null) continue;
      const host = get(d.snappedFrameId);
      if (host && host.data && (host.data.homesteadFrame === true || host.data.homestead === true)) {
        d.snappedFrameGen = host.occupantGeneration ?? null;
      }
    }
  },

  // ── Site seeding: the Reach plants the frame — nothing else can ───────────────
  // No world generator writes data.homesteadFrame/homesteadModule/supplyCargo:
  // without this seeder the whole barn-raising → stead → board pipeline could
  // never fire in production. In an authored sector with no live site it plants
  // a persistent frame, scatters the six modules outside snap range (they must
  // be delivered — towed, pushed, or ferried), and lays supply pods. A lost
  // module re-stocks on a slow clock; a destroyed frame re-plants after the
  // cooldown. `flags.persistent` keeps the frame through sector hops — a culled
  // frame would orphan snapped modules and read as a wrecked site.
  _tickSiteSeeding(state) {
    const sectorId = state.world && state.world.currentSectorId;
    if (!FRONTIER_BARN_RAISING.sectors.includes(sectorId)) return;
    const f = ensureFrontierState(state);
    let frame = null;
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data) continue;
      if (e.data.homestead === true || e.data.homesteadFrame === true) { frame = e; break; }
    }
    // Orphaned snap bonds: a module whose frame fell stays snapped forever — the
    // snap scan skips it and the slot-release loop only runs on a live frame —
    // so it could never be delivered again. Release it back to loose stock.
    // The recorded generation keeps a recycled frame id from silently
    // re-adopting the bond; untagged (pre-tag save) bonds release and re-snap
    // with proper tags while their frame still lives.
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data) continue;
      if (e.data.snapped !== true || typeof e.data.homesteadModule !== 'string') continue;
      const host = e.data.snappedFrameId != null && state.entities
        ? state.entities.get(e.data.snappedFrameId) : null;
      const bound = !!host && host.alive !== false
        && (host.data?.homesteadFrame === true || host.data?.homestead === true)
        && (e.data.snappedFrameGen == null || host.occupantGeneration === e.data.snappedFrameGen);
      if (bound) continue;
      e.data.snapped = false; e.data.slotKind = null;
      e.data.snappedFrameId = null; e.data.snappedFrameGen = null; e.data.slotOffset = null;
    }
    const site = f.sites[sectorId] || (f.sites[sectorId] = {
      frameId: null, frameGen: null, plantedAt: 0, nextAt: 0, nextRestockAt: 0,
    });
    if (frame) {
      // Bind the row to the live occupant; a recycled id under the same number
      // re-binds by generation, and a raised homestead still counts as a site.
      site.frameId = frame.id;
      site.frameGen = frame.occupantGeneration ?? null;
      this._tickSiteRestock(state, site, frame);
      return;
    }
    if (num(state.simTime) < site.nextAt) return; // cooldown after a loss
    site.nextAt = num(state.simTime) + FRONTIER_SITE.replantS; // latch before spawns emit
    f.siteSeq = (f.siteSeq | 0) + 1;
    const seq = f.siteSeq;
    const ang = frac('frontier-site-ang', sectorId, seq) * Math.PI * 2;
    const ring = FRONTIER_SITE.minR + frac('frontier-site-r', sectorId, seq) * FRONTIER_SITE.spreadR;
    // The ring is sector-local: world positions are galactic-global, so the site plants
    // around the seeding sector's own origin (Io Reach), not around Helios at {0,0}.
    const origin = sectorGlobalOrigin(sectorId);
    const px = origin.x + Math.cos(ang) * ring, pz = origin.z + Math.sin(ang) * ring;
    const siteId = `site:${sectorId}:${seq}`;
    const body = this.helpers.spawnEntity({
      type: 'station', team: 0, factionId: FACTION_ID,
      pos: { x: px, z: pz }, radius: FRONTIER_FRAME.radius, mass: 1e6,
      hull: 2000, hullMax: 2000, collides: true,
      flags: { persistent: true },
      data: {
        homesteadFrame: true, typeId: FRONTIER_FRAME.typeId,
        frontierSite: siteId, name: 'HOMESTEAD FRAME',
      },
    });
    site.frameId = body.id;
    site.frameGen = body.occupantGeneration ?? null;
    site.plantedAt = num(state.simTime);
    for (const m of FRONTIER_MODULES) this._spawnSiteModule(state, siteId, m, px, pz, seq);
    for (let i = 0; i < FRONTIER_SITE.supplyPods; i++) {
      const pa = frac('frontier-pod-a', siteId, i) * Math.PI * 2;
      const pr = 220 + frac('frontier-pod-r', siteId, i) * 120;
      this.helpers.spawnEntity({
        type: 'payload', team: 0, pos: { x: px + Math.cos(pa) * pr, z: pz + Math.sin(pa) * pr },
        radius: 6, mass: 10, hull: 10, hullMax: 10, collides: true,
        // Persistent like the frame, so a Continue keeps the site's stores; named so the
        // delivery the homestead pays for identifies itself on the scan.
        flags: { persistent: true },
        data: {
          supplyCargo: true, frontierSite: siteId,
          name: 'Homestead Supplies', scannable: true,
          scanLabel: 'HOMESTEAD SUPPLIES · tow to the frame',
        },
      });
    }
    this.bus.emit('frontier:sitePlanted', {
      siteId, sectorId, frameId: body.id,
      pos: { x: px, z: pz }, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: FRONTIER_BARN_RAISING.startLine, speaker: 'Frontier board' });
  },

  /** One deliverable module pod for a site — outside snap range by design. */
  _spawnSiteModule(state, siteId, m, px, pz, seq) {
    const a = frac('frontier-mod-a', siteId, m.id, seq) * Math.PI * 2;
    const r = FRONTIER_SITE.modMinR + frac('frontier-mod-r', siteId, m.id, seq) * FRONTIER_SITE.modSpreadR;
    return this.helpers.spawnEntity({
      type: 'payload', team: 0, factionId: FACTION_ID,
      pos: { x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r },
      radius: m.radius, mass: m.mass, hull: 100, hullMax: 100, collides: true,
      // Persistent like the frame: a Continue must not drop a half-built quilt.
      flags: { persistent: true },
      data: { homesteadModule: m.id, name: m.label, frontierSite: siteId },
    });
  },

  /** Keep an unraised site completable: lost modules re-stock on the slow clock. */
  _tickSiteRestock(state, site, frame) {
    const fd = frame.data || {};
    if (fd.homestead === true || fd.barnDone === true) return;
    const siteId = fd.frontierSite;
    if (typeof siteId !== 'string') return;
    if (num(state.simTime) < site.nextRestockAt) return;
    // Count the site's living modules (snapped or loose). A slot whose kind is
    // already aboard needs no restock; a dead or culled pod eventually gets one.
    const have = new Set();
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data) continue;
      if (e.data.frontierSite === siteId && typeof e.data.homesteadModule === 'string') have.add(e.data.homesteadModule);
    }
    const missing = FRONTIER_MODULES.filter((m) => !have.has(m.id) && !fd.slots?.[m.id]);
    if (missing.length === 0) return;
    site.nextRestockAt = num(state.simTime) + FRONTIER_SITE.restockS; // latch first
    site.restockSeq = (site.restockSeq | 0) + 1;
    const m = missing[hash32('frontier-restock', siteId, site.restockSeq) % missing.length];
    this._spawnSiteModule(state, siteId, m, frame.pos.x, frame.pos.z, site.restockSeq);
    this.bus.emit('frontier:moduleRestocked', {
      siteId, frameId: frame.id, kind: m.id, tick: state.tick,
    });
  },

  // ── E-21 Barn Raising: modules snap on, welders run, the window looms ──────────
  _tickRaising(state, dt) {
    for (const frame of state.entityList) {
      if (!frame || frame.alive === false || frame.data?.homesteadFrame !== true) continue;
      const fd = frame.data;
      // A truthy primitive slots bag survives `|| {}` and then throws on the
      // keyed writes/deletes below (strict mode) — entity data is a hostile
      // surface like the ledger, so heal it to a real object once.
      if (!isObj(fd.slots)) fd.slots = {};
      if (fd.homesteadRaised === true || fd.barnDone === true) continue;
      // Snap: an unsnapped module inside range locks to the next open slot.
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.data?.snapped === true) continue;
        if (typeof e.data?.homesteadModule !== 'string') continue;
        if (dist2(e.pos, frame.pos) > FRONTIER_FRAME.snapRange ** 2) continue;
        const kind = e.data.homesteadModule;
        if (fd.slots[kind]) continue; // one of each
        fd.slots[kind] = e.id;
        e.data.snapped = true;
        e.data.slotKind = kind;
        e.data.snappedFrameId = frame.id; // the slot owns THIS occupant — a recycled id snapped elsewhere must not ride this ring
        e.data.snappedFrameGen = frame.occupantGeneration ?? null;
        // Park it on the frame ring at its slot index — kinematic, physics leaves it be.
        const idx = Object.keys(fd.slots).length - 1;
        const a = (idx / FRONTIER_FRAME.moduleSlots) * Math.PI * 2;
        e.data.slotOffset = {
          dx: Math.cos(a) * (frame.radius + e.radius + 4),
          dz: Math.sin(a) * (frame.radius + e.radius + 4),
        };
        this.bus.emit('frontier:moduleSnapped', {
          frameId: frame.id, moduleId: e.id, kind,
          count: Object.keys(fd.slots).length, tick: state.tick,
        });
        if (!Number.isFinite(fd.raiseDeadline)) {
          // The first module starts the window — the tide does not wait for you.
          fd.raiseDeadline = state.simTime + FRONTIER_BARN_RAISING.windowS;
          this.bus.emit('comms:log', { text: FRONTIER_BARN_RAISING.startLine, speaker: 'Frontier board' });
        }
      }
      // Snapped modules ride the frame ring. A slot whose body died or whose id
      // was recycled into a non-module is released — a ghost must not hold the
      // kind hostage and count toward the six.
      for (const kind of Object.keys(fd.slots)) {
        const e = state.entities.get(fd.slots[kind]);
        // A body tagged to a DIFFERENT frame is a recycled occupant — release.
        // An untagged snapped body is compat (pre-tag saves): it stays on.
        if (!e || e.alive === false || e.data?.snapped !== true || e.data?.slotKind !== kind
            || (e.data?.snappedFrameId != null && e.data.snappedFrameId !== frame.id)) {
          delete fd.slots[kind];
          continue;
        }
        if (e.data?.slotOffset) {
          e.pos.x = frame.pos.x + num(e.data.slotOffset.dx);
          e.pos.z = frame.pos.z + num(e.data.slotOffset.dz);
          e.vel.x = 0; e.vel.z = 0;
        }
      }
      const snappedCount = Object.keys(fd.slots).length;
      // All six snapped: hold the line while the welders work.
      if (snappedCount >= FRONTIER_FRAME.moduleSlots) {
        fd.weldT = (Number(fd.weldT) || 0) + dt;
        if (fd.weldT >= FRONTIER_BARN_RAISING.weldTimeS) {
          fd.homesteadRaised = true;
          fd.barnDone = true;
          this._raiseHomestead(state, frame, false);
        }
      }
      // FF: the window closes first — a half-built homestead survives, damaged.
      if (Number.isFinite(fd.raiseDeadline) && state.simTime >= fd.raiseDeadline
          && fd.barnDone !== true) {
        fd.barnDone = true;
        fd.damaged = true;
        frame.hull = Math.max(1, Math.floor(frame.hullMax * FRONTIER_BARN_RAISING.partialPenaltyHull));
        this._raiseHomestead(state, frame, true);
      }
    }
  },

  _raiseHomestead(state, frame, partial) {
    const f = ensureFrontierState(state);
    // Bounded ledger: evict gone steads first, then the oldest standing one.
    if (f.homesteads.length >= MAX_STEADS) {
      let drop = f.homesteads.findIndex((r) => r.gone === true);
      if (drop < 0) drop = 0;
      const evicted = f.homesteads.splice(drop, 1)[0];
      // The board forgets the stead — its open board rows lapse with the rec.
      this._closeSteadBoard(state, evicted);
      const staleCall = f.calls.find((c) => c.state === 'open' && c.steadId === evicted.entityId);
      if (staleCall) { staleCall.state = 'lapsed'; staleCall.clearedAt = num(state.simTime); }
      this._gcClosed(f.calls, 12);
    }
    const raidSeed = hash32('frontier-raid', frame.id) || 1;
    const rec = {
      entityId: frame.id,
      gen: frame.occupantGeneration ?? null,
      pos: { x: frame.pos.x, z: frame.pos.z },
      sectorId: state.world?.currentSectorId || null,
      modules: Object.keys(frame.data?.slots || {}),
      raisedAt: state.simTime, lastSupplyAt: state.simTime,
      partial, traffic: 0, supplies: 0, stranded: false,
      // ── board layer ──
      name: steadNameFor(frame.id),
      gone: false, callId: null,
      raidSeed, raidSeq: 0,
      nextRaidAt: state.simTime + FRONTIER_DEFENSE.firstRaidS
        + frac('raid-first', frame.id, state.simTime) * (FRONTIER_DEFENSE.raidMaxS - FRONTIER_DEFENSE.raidMinS),
      nextLeadAt: state.simTime + FRONTIER_BOARD.firstLeadS
        + frac('lead-first', frame.id, state.simTime) * FRONTIER_BOARD.leadJitterS,
    };
    f.homesteads.push(rec);
    frame.data.homestead = true;
    frame.data.steadName = rec.name;
    this.bus.emit(partial ? 'frontier:barnPartial' : 'frontier:homesteadRaised', {
      homesteadId: frame.id, modules: rec.modules, tick: state.tick,
    });
    this.bus.emit('comms:log', {
      text: partial ? FRONTIER_BARKS.owe : `${rec.name}: ${FRONTIER_BARKS.raised}`, speaker: 'Frontier board',
    });
    this.bus.emit('toast', {
      text: partial ? 'HOMESTEAD STANDS — DAMAGED' : `HOMESTEAD RAISED — ${rec.name.toUpperCase()}`,
      kind: partial ? 'warn' : 'good', tone: partial ? 'warn' : 'info', ttl: 4,
    });
  },

  _steadRec(state, entityId) {
    const f = ensureFrontierState(state);
    // Skip gone rows: a recycled entity id can raise a second rec on the same
    // number, and every caller wants the live stead — the dead one's verdict
    // is already written.
    for (const rec of f.homesteads) {
      if (rec.entityId === entityId && rec.gone !== true) return rec;
    }
    return null;
  },

  /** The live entity behind a stead rec — entity-id recycling guarded. A
   *  recycled id is a different body: it must carry the homestead tag the
   *  frame got at raise, and the occupant generation recorded on the rec. */
  _steadEnt(state, rec) {
    if (!rec || rec.gone === true) return null;
    const ent = state.entities.get(rec.entityId);
    if (!ent || ent.alive === false) return null;
    if (ent.data?.homestead !== true) return null;
    if (rec.gen != null && ent.occupantGeneration !== rec.gen) return null;
    return ent;
  },

  _liveSteads(state) {
    const f = ensureFrontierState(state);
    const out = [];
    for (const rec of f.homesteads) {
      const ent = this._steadEnt(state, rec);
      if (ent) out.push({ rec, ent });
    }
    return out;
  },

  /** Once-only stamp for money/rep side-effects keyed by a content id. */
  _paidOnce(f, key) {
    if (!isObj(f.paid)) f.paid = {};
    if (f.paid[key] != null) return false;
    f.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(f.paid);
    // Insertion order is the eviction order — the stamp bag stays bounded at the cap.
    for (let i = 0; i < keys.length - PAID_STAMPS_CAP; i++) delete f.paid[keys[i]];
    return true;
  },

  _tierMult(f) { return frontierTierFor(f.deeds).payMult; },

  _log(state, text, speaker = 'Frontier board') {
    if (typeof text !== 'string' || !text) return;
    this.bus.emit('comms:log', { text, speaker });
  },

  _pickLine(state, lines, steadName, salt = 0) {
    if (!Array.isArray(lines) || !lines.length) return '';
    const f = ensureFrontierState(state);
    const i = hash32('bark', steadName, salt, f.seq) % lines.length;
    return lines[i].replace('{name}', steadName || 'a stead');
  },

  /** A finished piece of board work: count it, raise the tier when it crosses. */
  _deed(state, kind, refId) {
    const f = ensureFrontierState(state);
    f.deeds = (f.deeds | 0) + 1;
    const row = frontierTierFor(f.deeds);
    this.bus.emit('frontier:deed', {
      kind, ref: refId ?? null, deeds: f.deeds, tier: row.tier, tick: state.tick,
    });
    if (row.tier > (f.tier | 0)) {
      f.tier = row.tier;
      this.bus.emit('frontier:jobTier', {
        tier: row.tier, id: row.id, label: row.label, deeds: f.deeds, tick: state.tick,
      });
      this.bus.emit('toast', {
        text: `FRONTIER STANDING — ${row.label.toUpperCase()}`,
        kind: 'good', tone: 'info', ttl: 4,
      });
      this._log(state, row.line);
    }
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

  /** File a frontier-justice verdict. The ledger is bounded and serializable. */
  _fileJustice(state, kind, steadId, subject, detail) {
    const f = ensureFrontierState(state);
    const rec = {
      id: `J${f.seq++}`,
      kind, steadId: steadId ?? null, subject: subject ?? null,
      detail: detail ?? null, at: num(state.simTime),
    };
    f.justice.push(rec);
    while (f.justice.length > FRONTIER_JUSTICE.logCap) f.justice.shift();
    this.bus.emit('frontier:justiceFiled', {
      verdictId: rec.id, kind, steadId: rec.steadId, subject: rec.subject, tick: state.tick,
    });
    return rec;
  },

  // ── Raised homesteads persist: traffic on a beat, supply asks when stranded ────
  _tickHomesteads(state) {
    const f = ensureFrontierState(state);
    let supplyPods = null;
    for (const rec of f.homesteads) {
      if (rec.gone === true) continue;
      const ent = state.entities.get(rec.entityId);
      const sameBody = ent && ent.alive !== false
        && ent.data?.homestead === true
        && (rec.gen == null || ent.occupantGeneration === rec.gen);
      if (!sameBody) {
        // A stead can fall without a kill event (despawn, sector cull) — and a
        // recycled id is not the stead at all. The board writes the verdict once.
        this._markSteadGone(state, rec, null, false);
        continue;
      }
      // Keep the chart position honest — the frame can be towed.
      rec.pos.x = ent.pos.x; rec.pos.z = ent.pos.z;
      // Traffic grows on its beat — the homestead is alive on the chart.
      const beats = Math.floor((state.simTime - rec.raisedAt) / FRONTIER_HOMESTEAD.trafficPeriodS);
      if (beats > rec.traffic) {
        rec.traffic = beats;
        this.bus.emit('frontier:trafficTick', { homesteadId: rec.entityId, traffic: beats, tick: state.tick });
      }
      // Stranded: left alone past the limit, it asks the board for a supply run.
      if (!rec.stranded && state.simTime - rec.lastSupplyAt > FRONTIER_HOMESTEAD.strandedAfterS) {
        rec.stranded = true;
        f.supplyRuns.push({ homesteadId: rec.entityId, askedAt: state.simTime });
        this.bus.emit('frontier:supplyRunAsked', { homesteadId: rec.entityId, tick: state.tick });
        this.bus.emit('comms:log', { text: FRONTIER_BARN_RAISING.strandedLine, speaker: 'Frontier homestead' });
      }
      // Supplies land: a pod close enough is taken aboard — and paid for. The
      // board's supply runs are real work, not charity. Collect the pods once
      // per tick, not once per stead — a 60 Hz rescan × N steads is pure garbage.
      if (supplyPods === null) {
        supplyPods = [];
        for (const e of state.entityList) {
          if (e && e.alive !== false && e.data?.supplyCargo === true) supplyPods.push(e);
        }
      }
      for (const e of supplyPods) {
        // A pod consumed by the first stead in reach is gone for the next one.
        if (!e || e.alive === false || e.data?.supplyCargo !== true) continue;
        if (dist2(e.pos, ent.pos) > FRONTIER_HOMESTEAD.supplyRadius ** 2) continue;
        e.data.supplyCargo = false;
        rec.supplies += 1;
        rec.stranded = false;
        rec.lastSupplyAt = state.simTime;
        // The ask is answered — retire its board rows instead of letting them pile up.
        f.supplyRuns = f.supplyRuns.filter((r) => r.homesteadId !== rec.entityId);
        this.helpers.removeEntity(e.id, { reason: 'frontier_supply_landed' });
        this.bus.emit('frontier:supplyDelivered', {
          homesteadId: rec.entityId, supplies: rec.supplies, tick: state.tick,
        });
        this._grant(state, FRONTIER_BOARD.supplyFeeCr * this._tierMult(f),
          `frontier_supply:${rec.entityId}:${rec.supplies}`);
        this._rep(state, FRONTIER_BOARD.supplyRep, 'frontier_supply_run');
        this._verifyLeads(state, 'hungry', { steadId: rec.entityId }, 'supply');
        this._settleDebtFor(state, rec.entityId, 'covered');
        this._deed(state, 'supply', rec.entityId);
      }
    }
  },

  // ── The lead wire: rumor that verifies or sours ──────────────────────────────
  _tickLeads(state) {
    const f = ensureFrontierState(state);
    const steads = this._liveSteads(state);
    // Post on each stead's own clock — one open lead per stead, a bounded wire.
    for (const { rec, ent } of steads) {
      if (state.simTime < rec.nextLeadAt) continue;
      rec.nextLeadAt = state.simTime + FRONTIER_BOARD.leadPeriodS
        + frac('lead-gap', rec.entityId, f.seq) * FRONTIER_BOARD.leadJitterS;
      const openForStead = f.leads.some((l) => l.state === 'open' && l.steadId === rec.entityId);
      const openCount = f.leads.reduce((n, l) => n + (l.state === 'open' ? 1 : 0), 0);
      if (openForStead || openCount >= FRONTIER_BOARD.maxOpenLeads) continue;
      const kind = rec.stranded === true
        ? 'hungry'
        : LEAD_KINDS[hash32('lead-kind', rec.entityId, f.seq) % LEAD_KINDS.length];
      const lead = {
        id: `lead:${rec.entityId}:${f.seq++}`,
        kind, steadId: rec.entityId, steadName: rec.name,
        sectorId: rec.sectorId, pos: { x: ent.pos.x, z: ent.pos.z },
        postedAt: num(state.simTime), expiresAt: num(state.simTime) + FRONTIER_BOARD.leadTtlS,
        state: 'open',
      };
      f.leads.push(lead);
      this.bus.emit('frontier:leadPosted', {
        leadId: lead.id, kind, steadId: lead.steadId, steadName: lead.steadName,
        sectorId: lead.sectorId, pos: { ...lead.pos }, expiresAt: lead.expiresAt, tick: state.tick,
      });
      this._log(state, this._pickLine(state, LEAD_LINES[kind], rec.name, f.seq));
    }
    // Sour what nobody ran — frontier hearsay expires with a small cost.
    for (const lead of f.leads) {
      if (lead.state !== 'open') continue;
      if (state.simTime < num(lead.expiresAt)) continue;
      lead.state = 'soured';
      lead.souredAt = num(state.simTime);
      if (this._paidOnce(f, `sour:${lead.id}`)) {
        this._rep(state, FRONTIER_BOARD.sourRep, 'frontier_lead_soured');
      }
      this.bus.emit('frontier:leadSoured', {
        leadId: lead.id, kind: lead.kind, steadId: lead.steadId, tick: state.tick,
      });
      this._log(state, this._pickLine(state, LEAD_SOUR_LINES, lead.steadName, f.seq));
    }
    // Keep the closed strip bounded.
    this._gcClosed(f.leads, FRONTIER_BOARD.leadLogKeep);
  },

  /** Verify the oldest open lead of a kind (optionally bound to a stead). Once-only. */
  _verifyLeads(state, kind, match, how) {
    const f = ensureFrontierState(state);
    for (const lead of f.leads) {
      if (lead.state !== 'open' || lead.kind !== kind) continue;
      if (match && match.steadId != null && lead.steadId !== match.steadId) continue;
      lead.state = 'verified';
      lead.how = how;
      lead.verifiedAt = num(state.simTime);
      const pay = Math.round(FRONTIER_BOARD.verifyPayCr * this._tierMult(f));
      this._grant(state, pay, `frontier_lead:${lead.id}`);
      this._rep(state, FRONTIER_BOARD.verifyRep, 'frontier_lead_verified');
      this.bus.emit('frontier:leadVerified', {
        leadId: lead.id, kind, steadId: lead.steadId, how, payCr: pay, tick: state.tick,
      });
      this._log(state, this._pickLine(state, LEAD_VERIFY_LINES, lead.steadName, f.seq));
      this._deed(state, 'lead', lead.id);
      return true;
    }
    return false;
  },

  /** Verify a 'raid' lead by proximity: a repelled hull inside the lead stead's ring. */
  _verifyLeadsNear(state, kind, pos, how) {
    const f = ensureFrontierState(state);
    for (const lead of f.leads) {
      if (lead.state !== 'open' || lead.kind !== kind) continue;
      const stead = this._steadEnt(state, this._steadRec(state, lead.steadId));
      if (!stead) continue;
      if (dist2(pos, stead.pos) > FRONTIER_DEFENSE.watchRadius ** 2) continue;
      return this._verifyLeads(state, kind, { steadId: lead.steadId }, how);
    }
    return false;
  },

  // ── Mutual aid: carried markers between the stead that has and the one that doesn't
  _tickDebts(state) {
    const f = ensureFrontierState(state);
    const steads = this._liveSteads(state);
    // Post: a stranded stead owes; a provisioned one carries it. The board pairs them.
    const openDebts = f.debts.filter((d) => d.state === 'open');
    if (openDebts.length < FRONTIER_MUTUAL_AID.maxOpen
        && steads.length >= 2 && state.simTime >= f.nextDebtAt) {
      f.nextDebtAt = state.simTime + FRONTIER_MUTUAL_AID.offerPeriodS;
      // One open marker per debtor — otherwise the same stranded stead keeps
      // re-posting every beat and stacks pods it can never owe twice.
      const debtor = steads.find((s) => s.rec.stranded === true
        && !openDebts.some((d) => d.debtorId === s.rec.entityId));
      const creditor = debtor && (steads.find((s) => s.rec !== debtor.rec
        && s.rec.stranded !== true && s.rec.supplies > 0)
        || steads.find((s) => s.rec !== debtor.rec && s.rec.stranded !== true));
      if (debtor && creditor) this._postDebt(state, f, debtor, creditor);
    }
    // Resolve: marker delivered, marker lost, or window lapsed. Snapshot the
    // list — a lapse garbage-collects closed rows and must not skip siblings.
    for (const debt of [...f.debts]) {
      if (debt.state !== 'open') continue;
      const debtorRec = this._steadRec(state, debt.debtorId);
      const debtorEnt = debtorRec && this._steadEnt(state, debtorRec);
      if (!debtorEnt) { this._lapseDebt(state, debt, 'stead_lost'); continue; }
      const marker = state.entities.get(debt.markerId);
      const markerOk = marker && marker.alive !== false
        && marker.data?.frontierAidId === debt.id
        && (debt.markerGen == null || marker.occupantGeneration === debt.markerGen);
      if (!markerOk) { this._lapseDebt(state, debt, 'marker_lost'); continue; }
      if (state.simTime >= num(debt.expiresAt)) { this._lapseDebt(state, debt, 'expired'); continue; }
      const reach = FRONTIER_MUTUAL_AID.settleR + (Number(debtorEnt.radius) || 0);
      if (dist2(marker.pos, debtorEnt.pos) <= reach * reach) {
        this._settleDebt(state, debt, 'carried');
      }
    }
  },

  _postDebt(state, f, debtor, creditor) {
    const id = `debt:${debtor.rec.entityId}:${f.seq++}`;
    const debt = {
      id, debtorId: debtor.rec.entityId, debtorName: debtor.rec.name,
      creditorId: creditor.rec.entityId, creditorName: creditor.rec.name,
      postedAt: num(state.simTime), expiresAt: num(state.simTime) + FRONTIER_MUTUAL_AID.markerTtlS,
      feeCr: FRONTIER_MUTUAL_AID.feeCr, state: 'open', markerId: null, markerGen: null,
    };
    // The marker pod rides at the creditor's ring — tow it to the debtor.
    const a = frac('marker-ang', creditor.rec.entityId, f.seq) * Math.PI * 2;
    const r = (Number(creditor.ent.radius) || 60) + 40;
    const pod = this.helpers.spawnEntity({
      type: 'payload', team: 0, factionId: FACTION_ID,
      pos: { x: creditor.ent.pos.x + Math.cos(a) * r, z: creditor.ent.pos.z + Math.sin(a) * r },
      vel: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 40, hullMax: 40, collides: true,
      data: {
        frontierAidId: id, aidMarker: true,
        name: `Mutual-aid marker — ${debtor.rec.name}`,
        scanLabel: `MUTUAL AID · carry to ${debtor.rec.name}`,
      },
    });
    debt.markerId = pod.id;
    debt.markerGen = pod.occupantGeneration ?? null;
    f.debts.push(debt);
    this.bus.emit('frontier:debtPosted', {
      debtId: id, debtorId: debt.debtorId, creditorId: debt.creditorId,
      markerId: pod.id, feeCr: debt.feeCr, tick: state.tick,
    });
    this._log(state, `${creditor.rec.name} carries a marker for ${debtor.rec.name} — the board pays the carrier.`);
    return debt;
  },

  /** Settle any open debt where this stead is the debtor (the 'covered' path). */
  _settleDebtFor(state, steadId, how) {
    const f = ensureFrontierState(state);
    for (const debt of f.debts) {
      if (debt.state !== 'open' || debt.debtorId !== steadId) continue;
      this._settleDebt(state, debt, how);
      return true;
    }
    return false;
  },

  _settleDebt(state, debt, how) {
    const f = ensureFrontierState(state);
    if (debt.state !== 'open') return;
    debt.state = 'paid';
    debt.how = how;
    debt.settledAt = num(state.simTime);
    // The debtor steadies: the marker carried goods, or the player's own stood in.
    const rec = this._steadRec(state, debt.debtorId);
    if (rec) {
      rec.supplies += 1;
      rec.stranded = false;
      rec.lastSupplyAt = num(state.simTime);
      // Its supply ask is answered too — the supply-land path filters these
      // rows, and a marker-settled stead must not leave a stale one behind or
      // the next stranding stacks a duplicate ask on the board.
      f.supplyRuns = f.supplyRuns.filter((r) => r.homesteadId !== debt.debtorId);
    }
    // The marker pod is spent either way.
    const marker = state.entities.get(debt.markerId);
    if (marker && marker.alive !== false && marker.data?.frontierAidId === debt.id) {
      marker.data.frontierAidId = null;
      this.helpers.removeEntity(marker.id, { reason: 'frontier_aid_landed' });
    }
    const fee = Math.round(debt.feeCr * this._tierMult(f));
    this._grant(state, fee, `frontier_aid:${debt.id}`);
    this._rep(state, FRONTIER_MUTUAL_AID.repDelta, 'frontier_mutual_aid');
    this.bus.emit('frontier:debtSettled', {
      debtId: debt.id, debtorId: debt.debtorId, creditorId: debt.creditorId,
      how, feeCr: fee, tick: state.tick,
    });
    this._log(state, `${debt.creditorName || 'The creditor'} pays the carrier — ${debt.debtorName || 'the stead'} stands.`);
    this._deed(state, 'aid', debt.id);
    this._gcClosed(f.debts, FRONTIER_MUTUAL_AID.maxOpen);
  },

  _lapseDebt(state, debt, cause) {
    const f = ensureFrontierState(state);
    if (debt.state !== 'open') return;
    debt.state = 'lapsed';
    debt.lapseCause = cause;
    debt.settledAt = num(state.simTime);
    const marker = state.entities.get(debt.markerId);
    if (marker && marker.alive !== false && marker.data?.frontierAidId === debt.id) {
      marker.data.frontierAidId = null;
      this.helpers.removeEntity(marker.id, { reason: 'frontier_aid_lapsed' });
    }
    this.bus.emit('frontier:debtLapsed', { debtId: debt.id, cause, tick: state.tick });
    if (cause === 'expired') this._log(state, `${debt.debtorName || 'A stead'}'s marker lapsed. ${FRONTIER_BARKS.owe}`);
    this._gcClosed(f.debts, FRONTIER_MUTUAL_AID.maxOpen);
  },

  // ── Salvage-rights disputes: contested derelicts on a stead's claim ring ──────
  _tickDisputes(state) {
    const f = ensureFrontierState(state);
    const steads = this._liveSteads(state);
    const openCount = () => f.disputes.reduce((n, d) => n + (d.state === 'open' ? 1 : 0), 0);
    // Post: a claimable wreck on a stead's ring becomes contested ground.
    if (steads.length && openCount() < FRONTIER_SALVAGE_CLAIMS.maxOpen) {
      for (const w of state.entityList) {
        if (openCount() >= FRONTIER_SALVAGE_CLAIMS.maxOpen) break;
        if (!isClaimableWreck(w)) continue;
        // A truthy primitive data bag throws on the tag write below (strict
        // mode): heal it to a real object before the dispute stamp lands.
        const wd = isObj(w.data) ? w.data : (w.data = {});
        // A tag that matches no OPEN dispute row is stale — the row it pointed at
        // was closed, GC'd, dropped as malformed, or evicted by the ledger cap.
        // Clear it or the hulk can never be claimed again.
        if (wd.frontierDisputeId != null) {
          const live = f.disputes.some((d) => d.state === 'open' && d.id === wd.frontierDisputeId);
          if (live) continue;
          wd.frontierDisputeId = null;
        }
        const claimants = [];
        for (const { rec, ent } of steads) {
          if (claimants.length >= 2) break;
          if (dist2(w.pos, ent.pos) <= FRONTIER_SALVAGE_CLAIMS.claimRadius ** 2) claimants.push({ rec, ent });
        }
        if (!claimants.length) continue;
        const id = `dsp:${w.id}:${f.seq++}`;
        const dispute = {
          id, wreckId: w.id, wreckGen: w.occupantGeneration ?? null,
          steadIds: claimants.map((c) => c.rec.entityId),
          steadNames: claimants.map((c) => c.rec.name),
          sectorId: state.world?.currentSectorId || null,
          postedAt: num(state.simTime), expiresAt: num(state.simTime) + FRONTIER_SALVAGE_CLAIMS.windowS,
          state: 'open',
        };
        wd.frontierDisputeId = id;
        f.disputes.push(dispute);
        this.bus.emit('frontier:disputePosted', {
          disputeId: id, wreckId: w.id, steadIds: [...dispute.steadIds],
          steadNames: [...dispute.steadNames], pos: { x: w.pos.x, z: w.pos.z }, tick: state.tick,
        });
        this._log(state, `Salvage rights filed — ${dispute.steadNames.join(' and ')} claim a drifting hulk against the drift.`);
      }
    }
    // Resolve each open dispute. Snapshot — a close garbage-collects closed
    // rows and must not skip the siblings behind them.
    for (const d of [...f.disputes]) {
      if (d.state !== 'open') continue;
      const w = state.entities.get(d.wreckId);
      const sameBody = w && w.alive !== false
        && (d.wreckGen == null || w.occupantGeneration === d.wreckGen)
        && w.data?.frontierDisputeId === d.id;
      if (!sameBody) {
        // The kill path (player stripping it) was filed by _onKilled already;
        // any other disappearance lapses the claim clean.
        this._closeDispute(state, d, 'lapsed', null);
        continue;
      }
      // A claimant settles when the player hauls the wreck inside its ring.
      let settled = false;
      for (const sid of d.steadIds) {
        const rec = this._steadRec(state, sid);
        const ent = this._steadEnt(state, rec);
        if (!rec || !ent) continue;
        const reach = FRONTIER_SALVAGE_CLAIMS.settleRadius + (Number(ent.radius) || 0);
        if (dist2(w.pos, ent.pos) > reach * reach) continue;
        if (!this._playerHandled(state, w)) continue; // it has to be the player's haul
        this._settleDispute(state, d, rec, w);
        settled = true;
        break;
      }
      if (settled || d.state !== 'open') continue;
      // Drifted out of every claimant's ring: jumped if the player carried it.
      const inside = d.steadIds.some((sid) => {
        const ent = this._steadEnt(state, this._steadRec(state, sid));
        return ent && dist2(w.pos, ent.pos) <= FRONTIER_SALVAGE_CLAIMS.claimRadius ** 2;
      });
      if (!inside) {
        const playerMoved = this._playerHandled(state, w);
        this._closeDispute(state, d, playerMoved ? 'jumped' : 'lapsed', null);
        continue;
      }
      if (state.simTime >= num(d.expiresAt)) this._closeDispute(state, d, 'lapsed', null);
    }
  },

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

  _settleDispute(state, d, rec, wreck) {
    const f = ensureFrontierState(state);
    if (d.state !== 'open') return;
    d.state = 'settled';
    d.settledBy = 'stead';
    d.settledAt = num(state.simTime);
    if (wreck && wreck.data) wreck.data.frontierDisputeId = null;
    // The stead strips the hulk — it is supplies and scrap now. A durable world
    // body keeps its record unless told: entity:destroyed does not mark records,
    // and a live record rematerializes the same hulk for the next claim round.
    if (wreck && wreck.data && wreck.data.worldRecordId != null) {
      try {
        const world = this.ctx && this.ctx.registry && this.ctx.registry.get
          && this.ctx.registry.get('world');
        if (world && typeof world.markWorldRecordDestroyed === 'function') {
          world.markWorldRecordDestroyed(wreck.data.worldRecordId, {
            outcome: 'salvage_settled',
            pos: { x: wreck.pos.x, z: wreck.pos.z },
          });
        }
      } catch { /* world presence is optional in focused harnesses */ }
    }
    if (wreck) this.helpers.removeEntity(wreck.id, { reason: 'frontier_claim_settled' });
    if (rec) rec.supplies += 1;
    const pay = Math.round(FRONTIER_SALVAGE_CLAIMS.settlePayCr * this._tierMult(f));
    this._grant(state, pay, `frontier_claim:${d.id}`);
    this._rep(state, FRONTIER_SALVAGE_CLAIMS.settleRep, 'frontier_claim_settled');
    this._fileJustice(state, 'salvage_settled', rec && rec.entityId,
      wreck && wreck.id, `${rec ? rec.name : 'The stead'}'s claim honored`);
    this.bus.emit('frontier:disputeSettled', {
      disputeId: d.id, wreckId: d.wreckId, steadId: rec && rec.entityId, payCr: pay, tick: state.tick,
    });
    this._log(state, `${rec ? rec.name : 'The stead'} takes title — the board pays the haul.`);
    this._deed(state, 'claim', d.id);
    this._gcClosed(f.disputes, FRONTIER_SALVAGE_CLAIMS.maxOpen * 2);
  },

  _closeDispute(state, d, outcome, steadId) {
    const f = ensureFrontierState(state);
    if (d.state !== 'open') return;
    d.state = outcome;
    d.settledAt = num(state.simTime);
    const w = state.entities.get(d.wreckId);
    if (w && w.data && w.data.frontierDisputeId === d.id) w.data.frontierDisputeId = null;
    if (outcome === 'jumped') {
      if (this._paidOnce(f, `jumped:${d.id}`)) {
        this._rep(state, FRONTIER_SALVAGE_CLAIMS.jumpedRep, 'frontier_claim_jumped');
      }
      this._fileJustice(state, 'salvage_jumped', steadId ?? d.steadIds[0] ?? null,
        d.wreckId, 'A filed claim was stripped under the board\'s eye');
      this.bus.emit('frontier:disputeJumped', {
        disputeId: d.id, wreckId: d.wreckId, steadId: steadId ?? null, tick: state.tick,
      });
      this._log(state, 'That claim was filed. Jumping it costs name.');
    } else {
      this.bus.emit('frontier:disputeLapsed', { disputeId: d.id, wreckId: d.wreckId, tick: state.tick });
    }
    this._gcClosed(f.disputes, FRONTIER_SALVAGE_CLAIMS.maxOpen * 2);
  },

  // ── Defense calls: raids, the stead's call for hands, the strip ───────────────
  _isRaiderThreat(state, e) {
    if (!isRaiderBody(e)) return false;
    if (e.id === state.playerId) return false;
    const ai = e.data && e.data.ai;
    const playerEnt = state.entities.get(state.playerId);
    const playerTeam = playerEnt ? playerEnt.team : 0;
    if (ai && Array.isArray(ai.hostileTeams) && !ai.hostileTeams.includes(playerTeam)
        && e.team !== 1 && e.data?.frontierRaider !== true) return false;
    return true;
  },

  _spawnRaid(state, f, rec, stead) {
    const count = 1 + Math.floor(
      drawSeeded(rec, 'raidSeed', hash32('frontier-raid', rec.entityId) || 1) * FRONTIER_DEFENSE.raiderMax,
    );
    const raidId = `raid:${rec.entityId}:${rec.raidSeq | 0}`;
    rec.raidSeq = (rec.raidSeq | 0) + 1;
    // Latch the re-raid clock BEFORE the first spawnEntity emit — a listener that
    // re-enters the tick must not find this raid still due and spawn it twice.
    rec.nextRaidAt = num(state.simTime) + FRONTIER_DEFENSE.raidMinS
      + drawSeeded(rec, 'raidSeed', 1) * (FRONTIER_DEFENSE.raidMaxS - FRONTIER_DEFENSE.raidMinS);
    const ids = [];
    for (let i = 0; i < count; i++) {
      const ang = drawSeeded(rec, 'raidSeed', 1) * Math.PI * 2;
      const ring = FRONTIER_DEFENSE.spawnR + drawSeeded(rec, 'raidSeed', 1) * 200;
      const e = this.helpers.spawnEntity({
        type: 'ship', team: 1, factionId: null,
        pos: { x: stead.pos.x + Math.cos(ang) * ring, z: stead.pos.z + Math.sin(ang) * ring },
        vel: { x: 0, z: 0 }, rot: ang + Math.PI / 2,
        radius: FRONTIER_DEFENSE.raiderRadius, mass: FRONTIER_DEFENSE.raiderMass,
        hull: FRONTIER_DEFENSE.raiderHull, hullMax: FRONTIER_DEFENSE.raiderHull, collides: true,
        data: {
          frontierRaider: true, raidId, raidSteadId: rec.entityId,
          name: 'Freebooter', shipRole: 'raider',
          ai: { archetype: 'raider', pirate: true, hostile: true, hostileTeams: [0], fsm: 'patrol' },
        },
      });
      ids.push(e.id);
    }
    f.raidsSpawned += count;
    this.bus.emit('frontier:raidSpawned', {
      raidId, steadId: rec.entityId, steadName: rec.name, raiderIds: ids, tick: state.tick,
    });
    this._log(state, `Raid on the wire — ${rec.name} is marked. ${ids.length} hull${ids.length === 1 ? '' : 's'} inbound.`);
    return ids;
  },

  _tickRaids(state, dt) {
    const f = ensureFrontierState(state);
    const watch2 = FRONTIER_DEFENSE.watchRadius ** 2;
    // One entity pass per tick: count live raid hulls, collect every hostile
    // the stead rings can see, and steer the spawned raiders on their errands.
    const threats = [];
    let liveRaiders = 0;
    // ── Steer spawned raiders: close, strip the stead's stores, slip off. ──
    for (const e of state.entityList) {
      const d = e && e.data;
      if (!e || e.alive === false) continue;
      if (this._isRaiderThreat(state, e)) threats.push(e);
      if (d?.frontierRaider !== true) continue;
      liveRaiders += 1;
      const rec = this._steadRec(state, d.raidSteadId);
      const stead = this._steadEnt(state, rec);
      if (!stead) {
        // Orphaned by the stead falling — the crew slips back to the rocks.
        d.orphanedAt = num(d.orphanedAt, state.simTime);
        e.vel.x *= 0.98; e.vel.z *= 0.98;
        if (state.simTime - d.orphanedAt > FRONTIER_DEFENSE.orphanDespawnS) {
          this.helpers.removeEntity(e.id, { reason: 'frontier_raider_orphaned' });
        }
        continue;
      }
      const dx = stead.pos.x - e.pos.x, dz = stead.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      // The strip ring must be reachable: never inside the hold ring they
      // damp against, or the raid would hover forever and never rob.
      const contact = Math.max(
        (Number(stead.radius) || 60) + FRONTIER_DEFENSE.contactPad,
        FRONTIER_DEFENSE.standoffR,
      );
      if (d.done === true) {
        // Stripped and gone — the crew slips off past the ring and despawns.
        const away = 1.4 * FRONTIER_DEFENSE.raidSpeed;
        e.vel.x = (-dx / dist) * away; e.vel.z = (-dz / dist) * away;
        if (dist > FRONTIER_DEFENSE.watchRadius + FRONTIER_DEFENSE.leaveMargin) {
          this.helpers.removeEntity(e.id, { reason: 'frontier_raider_left' });
        }
        continue;
      }
      if (dist > contact) {
        const s = FRONTIER_DEFENSE.raidSpeed
          * Math.min(1, (dist - contact) / 200 + 1);
        e.vel.x = (dx / dist) * s; e.vel.z = (dz / dist) * s;
      } else {
        e.vel.x *= 0.9; e.vel.z *= 0.9;
      }
      if (dist <= contact) {
        // Strip: one supply per beat per raider, plus a hull chip — a raid robs.
        d.stripT = num(d.stripT) + dt;
        if (d.stripT >= FRONTIER_DEFENSE.raidStripS) {
          d.stripT = 0;
          const floor = Math.max(1, Math.floor((Number(stead.hullMax) || 1) * FRONTIER_DEFENSE.hullFloorFrac));
          let took = false;
          if (rec.supplies > 0) { rec.supplies -= 1; took = true; }
          if (Number(stead.hull) > floor) {
            stead.hull = Math.max(floor, stead.hull - FRONTIER_DEFENSE.raidHullChip);
            took = true;
          }
          // Robbed thin: the stead's stranded flag comes back on, and the board
          // hears the ask again.
          if (rec.supplies <= 0 && !rec.stranded) {
            rec.stranded = true;
            f.supplyRuns.push({ homesteadId: rec.entityId, askedAt: num(state.simTime) });
            this.bus.emit('frontier:supplyRunAsked', { homesteadId: rec.entityId, tick: state.tick });
          }
          if (took && (!Number.isFinite(d.struckBeat) || state.simTime >= d.struckBeat)) {
            d.struckBeat = state.simTime + FRONTIER_DEFENSE.struckBeatS;
            this.bus.emit('frontier:steadStruck', {
              steadId: stead.id, raiderId: e.id,
              hull: Math.round(stead.hull), supplies: rec.supplies, tick: state.tick,
            });
          }
          if (!took) d.done = true; // stores dry, hull at floor — the raid is over
        }
      }
    }
    // ── Per stead: raid clock + the defense call's open and clear. ──
    for (const { rec, ent } of this._liveSteads(state)) {
      if (state.mode === 'flight'
          && liveRaiders < FRONTIER_DEFENSE.raidCapSession
          && Number.isFinite(rec.nextRaidAt) && state.simTime >= rec.nextRaidAt) {
        liveRaiders += this._spawnRaid(state, f, rec, ent).length;
      }
      let near = 0;
      for (const t of threats) {
        if (dist2(t.pos, ent.pos) <= watch2) near++;
      }
      const call = f.calls.find((c) => c.state === 'open' && c.steadId === rec.entityId)
        || null;
      if (near > 0 && !call) {
        const c = {
          id: `call:${rec.entityId}:${f.seq++}`, steadId: rec.entityId, steadName: rec.name,
          openedAt: num(state.simTime), raiders: near, state: 'open',
        };
        f.calls.push(c);
        rec.callId = c.id;
        this.bus.emit('frontier:defenseCalled', {
          callId: c.id, steadId: rec.entityId, steadName: rec.name, raiders: near, tick: state.tick,
        });
        this._log(state, `${rec.name} calls hands — hostiles on the ring. The board pays for repelled hulls.`);
      } else if (call && near === 0) {
        call.state = 'cleared';
        call.clearedAt = num(state.simTime);
        rec.callId = null;
        this.bus.emit('frontier:defenseCleared', {
          callId: call.id, steadId: rec.entityId, tick: state.tick,
        });
        this._gcClosed(f.calls, 12);
      } else if (call) {
        call.raiders = near;
      }
    }
  },

  /** A homestead is gone — once-only verdict, close what the stead still had open. */
  _markSteadGone(state, rec, killerId, byPlayer) {
    if (rec.gone === true) return;
    const f = ensureFrontierState(state);
    rec.gone = true;
    rec.goneAt = num(state.simTime);
    // The call dies with the stead.
    const call = f.calls.find((c) => c.state === 'open' && c.steadId === rec.entityId);
    if (call) {
      call.state = 'overrun';
      call.clearedAt = num(state.simTime);
      this.bus.emit('frontier:defenseFailed', {
        callId: call.id, steadId: rec.entityId, tick: state.tick,
      });
    }
    rec.callId = null;
    this._gcClosed(f.calls, 12);
    this._closeSteadBoard(state, rec);
    this._fileJustice(state, 'stead_lost', rec.entityId,
      killerId ?? null, `${rec.name} fell${killerId != null ? ' — a named killer' : ''}`);
    this.bus.emit('frontier:homesteadLost', {
      steadId: rec.entityId, steadName: rec.name, killerId: killerId ?? null, tick: state.tick,
    });
    if (byPlayer) {
      this._rep(state, FRONTIER_JUSTICE.steadLostRep, 'frontier_stead_broken');
      this._fileJustice(state, 'outlaw', rec.entityId, state.playerId,
        'The board files the pilot\'s name in charcoal');
      this._log(state, `${rec.name} broke under the pilot's fire. The board files it.`);
    } else {
      this._log(state, `${rec.name} is gone. The wire keeps the name.`);
      // Frontier justice names the crew: a price on the killer, and on every
      // raider still stripping the wreck of the stead.
      const killer = killerId != null ? state.entities.get(killerId) : null;
      if (killer && killer.alive !== false) this._postVendetta(state, killer, rec, 'stead_lost');
      for (const e of state.entityList) {
        const ed = e && e.data;
        if (!e || e.alive === false || ed?.frontierRaider !== true) continue;
        if (ed.raidSteadId !== rec.entityId || e.id === killerId) continue;
        this._postVendetta(state, e, rec, 'stead_lost');
      }
    }
  },

  /** Close every open board row that names the stead — leads, debts, disputes,
   *  supply asks. Shared by the death verdict and the ledger's eviction, so a
   *  stead that leaves the chart never leaves live work behind. Snapshot the
   *  ledgers: a lapse/close garbage-collects and must not skip siblings. */
  _closeSteadBoard(state, rec) {
    const f = ensureFrontierState(state);
    for (const l of f.leads) {
      if (l.state === 'open' && l.steadId === rec.entityId) l.state = 'lapsed';
    }
    for (const d of [...f.debts]) {
      if (d.state === 'open' && (d.debtorId === rec.entityId || d.creditorId === rec.entityId)) {
        this._lapseDebt(state, d, 'stead_lost');
      }
    }
    for (const d of [...f.disputes]) {
      if (d.state === 'open' && Array.isArray(d.steadIds) && d.steadIds.includes(rec.entityId)) {
        this._closeDispute(state, d, 'lapsed', rec.entityId);
      }
    }
    f.supplyRuns = f.supplyRuns.filter((r) => r.homesteadId !== rec.entityId);
  },

  /** A posted name: the killer carries a mark the board pays on. */
  _postVendetta(state, target, rec, cause) {
    const f = ensureFrontierState(state);
    if (!target || target.alive === false || target.id === state.playerId) return null;
    // A truthy primitive data bag throws on the vendettaMark write below
    // (strict mode): heal it to a real object before the mark rides the hull.
    const d = isObj(target.data) ? target.data : (target.data = {});
    const gen = target.occupantGeneration ?? null;
    for (const v of f.vendettas) {
      if (v.state === 'open' && v.targetId === target.id && v.gen === gen) return v;
    }
    const open = f.vendettas.reduce((n, v) => n + (v.state === 'open' ? 1 : 0), 0);
    if (open >= FRONTIER_JUSTICE.vendettaMax) return null;
    const id = `ven:${f.seq++}`;
    // The mark rides the killer's own hull data — enumerable, serialized, and
    // bound to THIS occupant. A recycled entity id is a different body with no mark.
    d.vendettaMark = id;
    const v = {
      id, steadId: rec.entityId, steadName: rec.name,
      targetId: target.id, gen, cause,
      bountyCr: FRONTIER_JUSTICE.vendettaPayCr,
      postedAt: num(state.simTime), expiresAt: num(state.simTime) + FRONTIER_JUSTICE.vendettaWindowS,
      state: 'open',
    };
    f.vendettas.push(v);
    this.bus.emit('frontier:vendettaPosted', {
      vendettaId: id, steadId: v.steadId, steadName: v.steadName,
      targetId: v.targetId, bountyCr: v.bountyCr, cause, tick: state.tick,
    });
    this._log(state, `A price on the crew that broke ${rec.name}. The board pays.`);
    return v;
  },

  _tickVendettas(state) {
    const f = ensureFrontierState(state);
    for (const v of f.vendettas) {
      if (v.state !== 'open') continue;
      const target = state.entities.get(v.targetId);
      // The named body is gone without a kill event, or the id got recycled —
      // either way the mark is cold.
      const cold = !target
        || (v.gen != null && target.occupantGeneration !== v.gen)
        || target.data?.vendettaMark !== v.id;
      if (cold || state.simTime >= num(v.expiresAt)) {
        if (target && target.data && target.data.vendettaMark === v.id) target.data.vendettaMark = null;
        v.state = 'lapsed';
        v.settledAt = num(state.simTime);
        this.bus.emit('frontier:vendettaLapsed', {
          vendettaId: v.id, steadId: v.steadId, targetId: v.targetId, tick: state.tick,
        });
      }
    }
    this._gcClosed(f.vendettas, FRONTIER_JUSTICE.vendettaMax);
  },

  // ── Verdicts: one handler reads the kill wire for the whole board ────────────
  _onKilled(p) {
    const state = this.state;
    if (!state || !p || p.id == null) return;
    const f = ensureFrontierState(state);
    const victim = state.entities.get(p.id);
    const vd = victim && victim.data;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    const pos = p.pos || (victim && victim.pos) || null;

    // A homestead fell — the stead verdict owns the whole event. The kill must
    // name the same body: a recycled entity id is not the stead that raised, and
    // a live occupant cannot be the corpse the event claims (every real emitter
    // latches alive=false before the wire — SF-069).
    const steadRec = f.homesteads.find((r) => r.entityId === p.id && r.gone !== true);
    const steadBody = steadRec && (victim == null
      || (victim.alive === false && vd?.homestead === true
        && (steadRec.gen == null || victim.occupantGeneration === steadRec.gen)));
    if (steadBody) {
      this._markSteadGone(state, steadRec, p.killerId ?? null, byPlayer);
      return;
    }

    // A doubled kill wire must not re-file verdicts, re-emit bounties, or take
    // standing twice — the body's stamp says the board already read this death.
    // (Vendetta/dispute/debt rows also latch on their own state; this covers the
    // repelled/outlaw paths, which have no row to close.)
    if (vd && vd.frontierKillHandled === true) return;
    // A truthy primitive data bag throws on the stamp write (strict mode). The
    // bus swallows listener faults, so the throw would silently abort the whole
    // handler — vendetta/repel/dispute/debt/outlaw branches below all die with
    // it. Every read below is tag-gated; an unstamped primitive resolves honestly.
    if (isObj(vd)) vd.frontierKillHandled = true;

    // A posted name collected — vendetta pays once, on the marked body.
    if (vd && vd.vendettaMark != null) {
      const v = f.vendettas.find((x) => x.id === vd.vendettaMark && x.state === 'open');
      if (v && v.targetId === p.id && (v.gen == null || v.gen === victim.occupantGeneration)) {
        v.state = 'paid';
        v.settledAt = num(state.simTime);
        v.byPlayer = byPlayer === true;
        let bounty = 0;
        if (byPlayer) {
          bounty = Math.round(v.bountyCr * this._tierMult(f));
          this._grant(state, bounty, `frontier_vendetta:${v.id}`);
          this._rep(state, FRONTIER_JUSTICE.vendettaRep, 'frontier_vendetta_paid');
          this._fileJustice(state, 'vendetta_settled', v.steadId, p.id,
            `The named killer paid — ${v.steadName || 'the stead'}'s price collected`);
          this._log(state, `Vendetta settled — ${v.steadName || 'the stead'}'s price is paid.`);
          this._deed(state, 'vendetta', v.id);
        }
        this.bus.emit('frontier:vendettaPaid', {
          vendettaId: v.id, steadId: v.steadId, targetId: p.id,
          byPlayer: v.byPlayer, bountyCr: bounty, tick: state.tick,
        });
        this._gcClosed(f.vendettas, FRONTIER_JUSTICE.vendettaMax);
      }
      if (vd.vendettaMark != null) vd.vendettaMark = null;
    }

    // A raider repelled on stead ground — bounty if the player did the repelling.
    if (vd && vd.frontierRaider === true) {
      const steadId = vd.raidSteadId ?? null;
      this._fileJustice(state, 'repelled', steadId, p.id,
        byPlayer ? 'Repelled by a free captain' : 'Repelled');
      let bounty = 0;
      if (byPlayer && this._paidOnce(f, `repel:${p.id}:${victim.occupantGeneration ?? 0}`)) {
        bounty = Math.round(FRONTIER_DEFENSE.repelPayCr * this._tierMult(f));
        this._grant(state, bounty, `frontier_repel:${p.id}`);
        this._rep(state, FRONTIER_DEFENSE.repelRep, 'frontier_raider_repelled');
        this._deed(state, 'defense', steadId ?? p.id);
      }
      this.bus.emit('frontier:raiderRepelled', {
        raiderId: p.id, steadId, killerId: p.killerId ?? null,
        byPlayer, bountyCr: bounty, tick: state.tick,
      });
      if (pos && byPlayer) this._verifyLeadsNear(state, 'raid', pos, 'repelled');
    } else if (byPlayer && victim && pos && isRaiderBody(victim, { includeDead: true })) {
      // Any hostile repelled on a stead's ring counts — not only spawned raiders.
      const near = this._liveSteads(state).find(({ ent }) =>
        dist2(pos, ent.pos) <= FRONTIER_DEFENSE.watchRadius ** 2);
      if (near) {
        this._fileJustice(state, 'repelled', near.rec.entityId, p.id, 'Repelled by a free captain');
        let bounty = 0;
        if (this._paidOnce(f, `repel:${p.id}:${victim.occupantGeneration ?? 0}`)) {
          bounty = Math.round(FRONTIER_DEFENSE.repelPayCr * this._tierMult(f));
          this._grant(state, bounty, `frontier_repel:${p.id}`);
          this._rep(state, FRONTIER_DEFENSE.repelRep, 'frontier_raider_repelled');
          this._deed(state, 'defense', near.rec.entityId);
        }
        this.bus.emit('frontier:raiderRepelled', {
          raiderId: p.id, steadId: near.rec.entityId, killerId: p.killerId,
          byPlayer: true, bountyCr: bounty, tick: state.tick,
        });
        this._verifyLeadsNear(state, 'raid', pos, 'repelled');
      }
    }

    // A disputed hulk died — the claim closes by who swung the torch.
    if (vd && vd.frontierDisputeId != null) {
      const d = f.disputes.find((x) => x.id === vd.frontierDisputeId && x.state === 'open');
      if (d) this._closeDispute(state, d, byPlayer ? 'jumped' : 'lapsed', null);
    }

    // An aid marker broke — the debt lapses unpaid.
    if (vd && vd.frontierAidId != null) {
      const debt = f.debts.find((x) => x.id === vd.frontierAidId && x.state === 'open');
      if (debt) this._lapseDebt(state, debt, 'marker_lost');
    }

    // Outlaw work: a settler or a neutral hull murdered on stead ground. Anything
    // the board reads as a raider is a combatant, not a victim — it resolves above
    // (bounty or nothing), never as an unprovoked kill under the same event.
    if (byPlayer && victim && isShip(victim)
        && !isRaiderBody(victim, { includeDead: true }) && pos) {
      const near = this._liveSteads(state).find(({ ent }) =>
        dist2(pos, ent.pos) <= FRONTIER_JUSTICE.watchRadius ** 2);
      if (near) {
        const isSettler = victim.factionId === FACTION_ID;
        const unprovoked = p.targetHostileToPlayer === false;
        if (isSettler || unprovoked) {
          const rep = isSettler ? FRONTIER_JUSTICE.settlerKillRep : FRONTIER_JUSTICE.neutralKillRep;
          this._rep(state, rep, isSettler ? 'frontier_settler_killed' : 'frontier_neutral_killed');
          this._fileJustice(state, 'outlaw', near.rec.entityId, state.playerId,
            isSettler ? 'A settler hull broken on stead ground' : 'An unprovoked kill on stead ground');
          this._log(state, `The board files the pilot's name in charcoal — ${near.rec.name} watched.`);
        }
      }
    }
  },

  /** Drop the oldest closed rows past the keep count — bounded ledger discipline. */
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

  // ── Weld Head: the held object welds wherever it touches ───────────────────────
  _tickWeldHeads(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== FRONTIER_WELD_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!held || held.alive === false || held.data?.weldedTo != null) continue;
      // Not `|| {}` — a detached bag would swallow weldT/weldedTo every tick and
      // the arc could never finish on a data-less held body. A truthy primitive
      // bag throws on the weldT/weldedTo writes below (strict mode) — heal it.
      const hd = isObj(held.data) ? held.data : (held.data = {});
      // Find the joint: the held object touching something solid.
      let joint = null;
      for (const b of state.entityList) {
        if (!b || b.alive === false || b.id === held.id || b.id === holder.id) continue;
        if (b.type === 'shard' || b.type === 'vfx' || b.type === 'machine') continue;
        if (!touching(held, b)) continue;
        joint = b; break;
      }
      if (!joint || (hd.weldTargetId != null && hd.weldTargetId !== joint.id)) {
        hd.weldT = 0; hd.weldTargetId = joint ? joint.id : undefined;
        continue;
      }
      hd.weldTargetId = joint.id;
      hd.weldT = (Number(hd.weldT) || 0) + dt;
      if (hd.weldT >= FRONTIER_WELD_HEAD.weldTimeS) {
        hd.weldedTo = joint.id;
        // The bond binds THIS occupant: entity ids recycle, so a bare id could
        // later name an impostor hull the weld never touched.
        hd.weldedGen = joint.occupantGeneration ?? null;
        hd.weldedAt = state.simTime;
        hd.weldOffset = { dx: held.pos.x - joint.pos.x, dz: held.pos.z - joint.pos.z };
        this.bus.emit('frontier:welded', {
          holderId: holder.id, heldId: held.id, jointId: joint.id, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: FRONTIER_BARKS.board, speaker: 'Frontier board' });
        // A weld on the wire: 'hands' leads verify on real bond work.
        if (holder.id === state.playerId) this._verifyLeads(state, 'hands', null, 'welded');
      }
    }
    // Welded objects ride their joint — the bond outlives the Line.
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.weldedTo == null) continue;
      const joint = state.entities.get(e.data.weldedTo);
      // A recycled joint id is a different body — the recorded occupant
      // generation is the proof the bond still has its own hull.
      const sameJoint = joint && joint.alive !== false
        && (e.data.weldedGen == null || joint.occupantGeneration === e.data.weldedGen);
      if (!sameJoint) { e.data.weldedTo = null; e.data.weldedGen = null; continue; }
      const off = e.data.weldOffset || { dx: 0, dz: 0 };
      e.pos.x = joint.pos.x + num(off.dx);
      e.pos.z = joint.pos.z + num(off.dz);
      e.vel.x = joint.vel.x; e.vel.z = joint.vel.z;
    }
  },

  update(dt, state) {
    ensureFrontierState(state);
    this._tickSiteSeeding(state);
    this._tickRaising(state, dt);
    this._tickHomesteads(state);
    this._tickWeldHeads(state, dt);
    this._tickLeads(state);
    this._tickDebts(state);
    this._tickDisputes(state);
    this._tickRaids(state, dt);
    this._tickVendettas(state);
  },
};

export { FRONTIER_MODULES };
export default frontierHomesteads;
