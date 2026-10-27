// Meridian Trade Syndicate — the exchange ledger (build_map §34 row 516, expansion bible 02 §2,
// faction expansion pass).
//
// The original identity mechanics stay exactly where they were:
//   * CARGO SPINES — a tug pulls containers on rigid couplers; a flail you can steal. A
//     coupler snaps when the joint's relative speed or stretch crosses the authored
//     thresholds (a thrown rock into a container does exactly that), and every container
//     behind the break becomes loose mass. Drift a loose container back to the tail and
//     it re-links — re-coupling the train is a physical act, not a menu.
//   * HULL TICKERS — flank light-strips scroll the live price of the cargo inside. A
//     container drifting loose bleeds value on its ticker down to the salvage floor;
//     re-linked or held, the ticker freezes.
//   * TOLL PYLONS are data-only here (faction.mts.custom.tollPylon) — the lane's toll
//     authority already owns the charge.
//
// The expansion adds THE EXCHANGE LEDGER — the syndicate's other half. Corporate fantasy:
// the Meridian Trade Syndicate does not shoot back, does not chase, does not forgive. It
// files. Everything the pilot does to or for Meridian freight is a ledger entry, and the
// ledger always collects — in fees, in assessments, in the desks that stop answering.
//
//   * EXCHANGE DESKS — every live MTS exchange station (type 'station', factionId
//     'faction_mts', never a jump gate) is a desk on the wire: contracts post there,
//     freight returns there, convoys muster there. Desks are resolved live each tick —
//     nothing is cached against an entity id that could recycle.
//   * MANIFEST CONTRACTS — sealed freight desk-to-desk (or out to a drop buoy when the
//     sector only has one desk). Take one and the desk issues a sealed consignment pod at
//     the origin dock — a real body bound by id + occupantGeneration + an ownership tag.
//     Deliver before the window and the pay lands; post a performance bond and the pay
//     doubles. Miss the window and a breach fee files to your account while the freight
//     reverts to the syndicate (a recovery claim files on it). Collect the sealed pod
//     into your own hold and the manifest value files to your account — that seal was
//     the contract.
//   * RECOVERY CLAIMS — every loose priced container gets a recovery filing. Haul it to
//     a desk (the desk takes receipt) or re-couple it to a surviving train and the
//     syndicate pays a recovery fee. Collect it into your hold and the manifest value
//     files to your account; let a scavenger lift it and a loss warrant posts on the
//     lifter's hull.
//   * CONVOYS — spine-tug trains muster at desks and run the lane under the real coupler
//     law. Ride inside the hail ring long enough to sign as escort; the arrival purse is
//     priced per box that makes the dock. Lane pirates cut boxes loose with real physics
//     (a pluck impulse — the coupler law spills them); repel them for a repel bounty.
//     Kill the tug and the whole train spills — every box becomes a recovery filing.
//   * LOSS WARRANTS — a syndicate hull downed by another hull files a warrant on the
//     killer. The warrant is bound to the target's entity id + occupantGeneration + a
//     hull mark; a recycled id never satisfies it. Close the name for the bounty.
//   * THE ACCOUNT — the syndicate never raises a hand; it files. Stolen freight, broken
//     seals, defaulted manifests, dead hulls and dead repo men file chargebacks into a
//     delinquency score and a running bill (accountOwed). The score warns, then levies a
//     credit assessment, then blacklists the pilot from the desks. While the account
//     still owes and the score is hot, a repo writ fields cutters that collect on
//     contact. Pay the account down (payAssessment) and the crew stands down.
//   * STANDING — honest work files deeds; deeds climb tiers; tiers scale every payout.
//     A verdict ledger records each filing for the board.
//
// Data contract (stamps this system reads):
//   entity.data.spineId      — the train this body belongs to (string)
//   entity.data.spineIndex   — order in the train; index 0 is the tug (never goes loose)
//   entity.data.cargoValueCr — the ticker's live value
//   entity.data.encounterId  — freight owned by an authored encounter (claims leave it be)
//   entity.data.thrownBy / lastThrowerId — who last threw it ('player' or the entity id)
// Stamps this system writes:
//   entity.data.spineLoose      — true once the coupler ahead of it snapped
//   entity.data.lostFromSpineId — the train it fell off (story + recouple bookkeeping)
//   entity.data.tickerValueCr / data.scanLabel — the readable countdown
//   entity.data.meridianClaimId      — open recovery filing on loose freight
//   entity.data.meridianConsignment  — sealed pod belonging to a taken contract
//   entity.data.meridianDropBuoy     — drop buoy belonging to a posted contract
//   entity.data.meridianConvoy / meridianTug — convoy membership
//   entity.data.meridianRaider       — lane pirate bound to a convoy
//   entity.data.meridianWarrant      — open loss warrant on a killer hull
//   entity.data.meridianRepo         — repo cutter bound to a writ
//
// Seams (single-writer): credits move ONLY through economy:grantCredits /
// economy:chargeCredits; standing ONLY through faction:repDelta; force ONLY through
// queuePhysicsImpulse; entities ONLY through helpers.spawnEntity / helpers.removeEntity.
// Every payout latches (row state or meridian.paid stamp) BEFORE its event emits, so a
// re-entrant listener can never double-collect. State is plain JSON, normalized on read,
// capped collections — save:loaded re-normalizes and grants nothing for free.
//
// Determinism: geometry + dt + hash32/drawSeeded on serializable seeds; no Math.random,
// no Date, no Map/Set/Symbol in persisted state.

import { faction as MTS } from '../data/factions/mts.js';
import { hash32, drawSeeded } from '../core/rng.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hasExplicitPickupAcceptance, finiteWholePickupAmount } from '../core/pickupAcceptance.js';

const SPINE = (MTS.custom && MTS.custom.cargoSpine) || {};
const TICKER = (MTS.custom && MTS.custom.hullTicker) || {};
const SNAP_SPEED = Math.max(1, Number(SPINE.couplerSnapSpeed) || 55);
const STRETCH_WU = Math.max(1, Number(SPINE.couplerStretchWu) || 90);
const RECOUPLE_WU = Math.max(1, Number(SPINE.recoupleWu) || 38);
const LINK_GAP = Math.max(1, Number(SPINE.linkGapWu) || 46);
const BLEED_PER_S = Math.max(0, Number(TICKER.valueBleedPerS) || 90);
const FLOOR_CR = Math.max(0, Number(TICKER.salvageFloorCr) || 400);

const FACTION_ID = 'faction_mts';

// ── Tuning tables (exported for tests + the board) ─────────────────────────────

export const MERIDIAN_CONTRACTS = Object.freeze({
  postPeriodS: 140, postJitterS: 90, firstPostS: 30,
  windowS: 380, maxOpen: 3, logKeep: 8, cap: 14,
  basePayCr: 280, payPerWuCr: 0.09, payCapCr: 950,
  dropLegMinWu: 1500, dropLegSpanWu: 1400,
  bondFrac: 0.4, bondMult: 2,
  deliverR: 260, buoyRadius: 14,
  repDelivered: 3, repDefaulted: -3, sealBreachRep: -4,
  defaultFeeCr: 160, sealBreachCr: 300,
});

export const MERIDIAN_RECOVERY = Object.freeze({
  maxOpen: 8, logKeep: 8, cap: 18, windowS: 480,
  returnR: 300,
  recoveryFrac: 0.3, minFeeCr: 80,
  repReturned: 2, repStolen: -4, repDestroyed: -2,
  npcThiefBountyFrac: 0.5,
});

export const MERIDIAN_CONVOY = Object.freeze({
  musterPeriodS: 260, musterJitterS: 140, firstMusterS: 70, maxLive: 1, logKeep: 4, cap: 8,
  boxMin: 4, boxMax: 8, legWu: 3000,
  tugHull: 260, tugRadius: 20, tugMass: 240,
  boxHull: 60, boxRadius: 10, boxMass: 40,
  valueMinCr: 1600, valueSpanCr: 3400,
  speed: 26, followSpeed: 52, arriveR: 220,
  escortHailR: 700, escortMinS: 6,
  escortBaseCr: 220, escortPerBoxCr: 40, repArrived: 3,
  raidChance: 0.6, raidDelayS: 25, raiderMax: 2,
  raiderHull: 110, raiderRadius: 13, raiderMass: 32,
  raiderSpawnR: 760, raiderSpeed: 54, pluckR: 110, pluckDv: 95,
  raiderLeaveR: 1700, repelPayCr: 150, repelRep: 2,
  overdueMult: 3.0,
});

export const MERIDIAN_WARRANTS = Object.freeze({
  maxOpen: 5, logKeep: 6, cap: 12, windowS: 720,
  baseBountyCr: 320, repPaid: 4,
});

export const MERIDIAN_ACCOUNT = Object.freeze({
  max: 100, decayPerS: 0.045,
  freightTheft: 22, freightDestroyed: 12, sealBreach: 20, contractDefault: 10,
  hullKilled: 26, repoKilled: 18, repoKilledRep: -4, freightDestroyedRep: -2, hullKilledRep: -5,
  honestDrop: 7,
  warnAt: 30, assessAt: 60, blacklistAt: 85, rearmBelow: 15,
  assessmentCr: 450, assessmentRep: -3,
  blacklistS: 480, blacklistRep: -8, settleRep: 3,
  cutterMax: 2, cutterSpawnCap: 5,
  cutterHull: 150, cutterRadius: 15, cutterMass: 44,
  cutterSpawnR: 700, cutterSpeed: 58,
  levyR: 120, levyBeatS: 2.5, levyCapCr: 320,
  crewBeatS: 10, levyLogBeatS: 15, tauntBeatS: 9,
  logKeep: 16, cap: 20,
});

export const MERIDIAN_TIERS = Object.freeze([
  { deeds: 0, id: 'spot', label: 'Spot Contractor', payMult: 1.0,
    line: 'Work the wire. The desk decides what you are.' },
  { deeds: 6, id: 'bonded', label: 'Bonded Carrier', payMult: 1.12,
    line: 'Your bond clears without review now.' },
  { deeds: 16, id: 'manifest', label: 'Manifest Regular', payMult: 1.3,
    line: 'The brokers quote you by name on the close.' },
  { deeds: 34, id: 'syndicate', label: 'Syndicate Freight Partner', payMult: 1.5,
    line: 'Your seal is pre-cleared on three desks.' },
  { deeds: 60, id: 'ledger', label: 'Ledger Name', payMult: 1.85,
    line: 'The Syndicate prices risk by whether YOU signed.' },
]);

// ── Small deterministic helpers ───────────────────────────────────────────────

const num = (v, d = 0) => (Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : d);
const isObj = (v) => v !== null && typeof v === 'object';
const str = (v, d = null) => (typeof v === 'string' && v ? v : d);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const frac = (...a) => (hash32(...a) >>> 0) / 4294967296;
const entOf = (state, id) => (id != null && state && state.entities
  && typeof state.entities.get === 'function' ? state.entities.get(id) : null);
const sectorOf = (state) => (state && state.world && typeof state.world.currentSectorId === 'string'
  ? state.world.currentSectorId : null);
const countState = (rows, s) => {
  let n = 0;
  for (const r of rows) if (r && r.state === s) n += 1;
  return n;
};

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function relSpeed(a, b) {
  const av = a.vel || { x: 0, z: 0 }, bv = b.vel || { x: 0, z: 0 };
  return Math.hypot(av.x - bv.x, av.z - bv.z);
}

function fmtCr(v) {
  return `${Math.max(0, Math.round(v)).toLocaleString('en-US')} CR`;
}

// ── State normalization — plain JSON, bounded slices, capped collections ──────

const PAID_CAP = 96, LEDGER_CAP = 24, ACCOUNT_LOG_CAP = 16, SNAPS_CAP = 48, FLOOR_CAP = 128;

function capKeys(obj, cap) {
  const ks = Object.keys(obj);
  for (let i = 0; i < ks.length - cap; i++) delete obj[ks[i]];
}

const validPos = (p) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.z);
const validContract = (r) => isObj(r) && typeof r.id === 'string' && validPos(r.originPos)
  && validPos(r.destPos) && typeof r.state === 'string';
const validClaim = (r) => isObj(r) && typeof r.id === 'string' && r.boxId != null
  && typeof r.state === 'string';
const validConvoy = (r) => isObj(r) && typeof r.id === 'string' && validPos(r.destPos)
  && typeof r.state === 'string';
const validWarrant = (r) => isObj(r) && typeof r.id === 'string' && r.targetId != null
  && typeof r.state === 'string';
const validWrit = (r) => isObj(r) && typeof r.id === 'string' && typeof r.state === 'string'
  && Array.isArray(r.crew);
const validLedgerRow = (r) => isObj(r) && typeof r.id === 'string';
const validAccountRow = (r) => isObj(r) && typeof r.kind === 'string';

function normRows(rows, valid, cap) {
  if (!Array.isArray(rows)) return [];
  const out = rows.filter(valid);
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export function ensureMeridianState(state) {
  if (!isObj(state.meridian)) state.meridian = {};
  const m = state.meridian;
  if (!isObj(m.snaps)) m.snaps = {};        // spineId -> [{atIndex, tailIds, t}]
  if (!isObj(m.floorHit)) m.floorHit = {};   // containerId -> true
  if (!isObj(m.paid)) m.paid = {};           // once-only payout latches
  capKeys(m.snaps, SNAPS_CAP); capKeys(m.floorHit, FLOOR_CAP); capKeys(m.paid, PAID_CAP);
  // Forward clocks a hostile save can park past the end of time: any deadline further
  // out than one full window from now is corrupt — every legit value is always nearer,
  // so clamping heals the wire instead of letting it stall forever.
  const nowS = num(state && state.simTime);
  m.contracts = normRows(m.contracts, validContract, MERIDIAN_CONTRACTS.cap);
  for (const c of m.contracts) {
    if (c.state === 'open' || c.state === 'taken') {
      c.dueAt = Math.min(num(c.dueAt, nowS + MERIDIAN_CONTRACTS.windowS),
        nowS + MERIDIAN_CONTRACTS.windowS);
    }
  }
  m.claims = normRows(m.claims, validClaim, MERIDIAN_RECOVERY.cap);
  for (const cl of m.claims) {
    cl.assessedCr = Math.max(0, num(cl.assessedCr));
    if (cl.state === 'open') {
      cl.expiresAt = Math.min(num(cl.expiresAt, nowS + MERIDIAN_RECOVERY.windowS),
        nowS + MERIDIAN_RECOVERY.windowS);
    }
  }
  m.convoys = normRows(m.convoys, validConvoy, MERIDIAN_CONVOY.cap);
  for (const cv of m.convoys) {
    if (!Array.isArray(cv.members)) cv.members = [];
    if (!Array.isArray(cv.raiders)) cv.raiders = [];
    if (!Number.isFinite(cv.seed) || (cv.seed >>> 0) === 0) cv.seed = (hash32('mer-cv-seed', cv.id) >>> 0) || 1;
    if (cv.state === 'rolling') {
      // Bound the overdue clock by the leg still ahead of the tug — the same budget the
      // author wrote at muster, recomputed against the distance actually remaining.
      const tug = entOf(state, cv.tugId);
      const remain = tug && tug.pos
        ? Math.hypot(cv.destPos.x - num(tug.pos.x), cv.destPos.z - num(tug.pos.z))
        : MERIDIAN_CONVOY.legWu;
      cv.arriveByAt = Math.min(num(cv.arriveByAt, nowS + 1),
        nowS + (remain / Math.max(1, MERIDIAN_CONVOY.speed)) * MERIDIAN_CONVOY.overdueMult + 120);
      cv.raidAt = cv.raidAt > 0 ? Math.min(num(cv.raidAt, nowS), nowS + MERIDIAN_CONVOY.raidDelayS) : 0;
    }
  }
  m.warrants = normRows(m.warrants, validWarrant, MERIDIAN_WARRANTS.cap);
  for (const w of m.warrants) {
    w.bountyCr = Math.max(1, Math.round(num(w.bountyCr, MERIDIAN_WARRANTS.baseBountyCr)));
    if (w.state === 'open') {
      w.expiresAt = Math.min(num(w.expiresAt, nowS + MERIDIAN_WARRANTS.windowS),
        nowS + MERIDIAN_WARRANTS.windowS);
    }
  }
  m.writs = normRows(m.writs, validWrit, MERIDIAN_ACCOUNT.cap);
  for (const w of m.writs) {
    w.spawned = Math.min(MERIDIAN_ACCOUNT.cutterSpawnCap, Math.max(0, Math.floor(num(w.spawned))));
    w.balance = Math.max(0, num(w.balance));
  }
  m.ledger = normRows(m.ledger, validLedgerRow, LEDGER_CAP);
  m.accountLog = normRows(m.accountLog, validAccountRow, ACCOUNT_LOG_CAP);
  m.seq = Math.max(0, Math.floor(num(m.seq)));
  m.deeds = Math.max(0, Math.floor(num(m.deeds)));
  m.tier = Math.max(0, Math.min(MERIDIAN_TIERS.length - 1, Math.floor(num(m.tier))));
  m.delinquency = Math.min(MERIDIAN_ACCOUNT.max, Math.max(0, num(m.delinquency)));
  m.delinqStage = Math.min(3, Math.max(0, Math.floor(num(m.delinqStage))));
  m.accountOwed = Math.max(0, num(m.accountOwed));
  m.blacklistedUntil = Math.min(Math.max(0, num(m.blacklistedUntil)), nowS + MERIDIAN_ACCOUNT.blacklistS);
  m.nextContractAt = Math.min(num(m.nextContractAt, MERIDIAN_CONTRACTS.firstPostS),
    nowS + MERIDIAN_CONTRACTS.postPeriodS + MERIDIAN_CONTRACTS.postJitterS);
  m.nextConvoyAt = Math.min(num(m.nextConvoyAt, MERIDIAN_CONVOY.firstMusterS),
    nowS + MERIDIAN_CONVOY.musterPeriodS + MERIDIAN_CONVOY.musterJitterS);
  return m;
}

export function meridianTierFor(deeds) {
  let tier = 0;
  for (let i = 0; i < MERIDIAN_TIERS.length; i++) {
    if (deeds >= MERIDIAN_TIERS[i].deeds) tier = i;
  }
  return { tier, ...MERIDIAN_TIERS[tier] };
}

export function meridianStanding(state) {
  const m = ensureMeridianState(state);
  return { ...meridianTierFor(m.deeds), deeds: m.deeds };
}

/** A HUD-safe copy of the whole exchange board — never the live ledger. */
export function meridianBoard(state) {
  const m = ensureMeridianState(state);
  const now = num(state && state.simTime);
  const copy = (r) => ({ ...r });
  return {
    standing: meridianStanding(state),
    deeds: m.deeds,
    delinquency: Math.round(m.delinquency * 100) / 100,
    delinqStage: m.delinqStage | 0,
    blacklisted: m.blacklistedUntil > now,
    blacklistedUntil: m.blacklistedUntil,
    accountOwed: Math.round(m.accountOwed),
    contracts: m.contracts.map((c) => ({
      ...c,
      originPos: c.originPos ? { ...c.originPos } : c.originPos,
      destPos: c.destPos ? { ...c.destPos } : c.destPos,
    })),
    claims: m.claims.map(copy),
    convoys: m.convoys.map((c) => ({
      ...c,
      originPos: c.originPos ? { ...c.originPos } : c.originPos,
      destPos: c.destPos ? { ...c.destPos } : c.destPos,
      members: (c.members || []).map(copy),
      raiders: (c.raiders || []).map(copy),
    })),
    warrants: m.warrants.map(copy),
    writs: m.writs.map((w) => ({ ...w, crew: (w.crew || []).map(copy) })),
    ledger: m.ledger.map(copy),
    accountLog: m.accountLog.map(copy),
  };
}

// ── The system ────────────────────────────────────────────────────────────────

export const factionMeridian = {
  name: 'faction_meridian',

  init(ctx) {
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureMeridianState(this.state);
    if (this._subBus !== this.bus) {
      this._unsub();
      this._subBus = this.bus;
      this._subs = [];
      if (this.bus && typeof this.bus.on === 'function') {
        this._subs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
        this._subs.push(this.bus.on('pickup:collected', (p) => this._onPickup(p)));
        this._subs.push(this.bus.on('save:loaded', () => {
          // Re-normalize; nothing progresses for free across a load.
          if (this.state) ensureMeridianState(this.state);
        }));
      }
    }
  },

  destroy() { this._unsub(); },

  // ── persistence: warrants, writs, contracts, claims and the account ride the
  // save as one plain-JSON bag. Without it a Continue wipes every open obligation.
  saveSnapshotOwned: true,

  serialize() {
    if (!this.state) return {};
    return JSON.parse(JSON.stringify(ensureMeridianState(this.state)));
  },

  deserialize(data) {
    if (!this.state) return undefined;
    // An absent or corrupt bag (a pre-key save) restores to a fresh ledger.
    this.state.meridian = (isObj(data) && !Array.isArray(data)) ? JSON.parse(JSON.stringify(data)) : null;
    return ensureMeridianState(this.state);
  },

  _unsub() {
    if (this._subs) {
      for (const off of this._subs) { try { off(); } catch (_) { /* unsubscribe best-effort */ } }
    }
    this._subs = null;
    this._subBus = null; // re-init must re-subscribe — a dead listener set is silent
  },

  // ── shared seams ──────────────────────────────────────────────────────────

  _paidOnce(mer, key) {
    if (mer.paid[key]) return false;
    mer.paid[key] = true;
    return true;
  },

  _credits(state) {
    return Math.max(0, Math.floor(num(state.player && state.player.credits)));
  },

  _grant(state, amount, reason) {
    const a = Math.max(0, Math.round(amount));
    if (a <= 0 || !this.bus) return;
    this.bus.emit('economy:grantCredits', { amount: a, reason });
  },

  _charge(state, amount, reason) {
    const a = Math.max(0, Math.round(amount));
    if (a <= 0 || !this.bus) return;
    this.bus.emit('economy:chargeCredits', { amount: a, reason });
  },

  _rep(state, delta, reason) {
    const d = Math.round(delta);
    if (!d || !this.bus) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },

  _log(state, from, text, kind) {
    if (!this.bus || !text) return;
    this.bus.emit('comms:log', { from, text, kind: kind || 'machine' });
  },

  _isBlacklisted(state, mer) {
    return mer.blacklistedUntil > num(state.simTime);
  },

  _deed(state, kind, refId) {
    const mer = ensureMeridianState(state);
    mer.deeds += 1;
    const t = meridianTierFor(mer.deeds);
    if (t.tier !== mer.tier) {
      mer.tier = t.tier;
      this.bus && this.bus.emit('meridian:tier', {
        tier: t.tier, id: t.id, label: t.label, deeds: mer.deeds,
      });
      this._log(state, 'MTS LEDGER', t.line, 'machine');
    }
    this.bus && this.bus.emit('meridian:deed', { kind, refId, deeds: mer.deeds });
  },

  _fileVerdict(state, kind, subject, detail) {
    const mer = ensureMeridianState(state);
    const row = {
      id: `L${mer.seq++}`, kind,
      subject: str(subject, '—'), detail: str(detail, '—'),
      at: num(state.simTime),
    };
    mer.ledger.push(row);
    if (mer.ledger.length > LEDGER_CAP) mer.ledger.splice(0, mer.ledger.length - LEDGER_CAP);
    this.bus && this.bus.emit('meridian:verdictFiled', { verdictId: row.id, kind, subject: row.subject });
    return row;
  },

  _accountCharge(state, pts, kind, subject) {
    const mer = ensureMeridianState(state);
    mer.delinquency = Math.min(MERIDIAN_ACCOUNT.max, mer.delinquency + pts);
    mer.accountLog.push({
      id: `A${mer.seq++}`, kind, pts,
      subject: str(subject, '—'), at: num(state.simTime),
    });
    if (mer.accountLog.length > ACCOUNT_LOG_CAP) {
      mer.accountLog.splice(0, mer.accountLog.length - ACCOUNT_LOG_CAP);
    }
    this.bus && this.bus.emit('meridian:accountCharged', {
      kind, pts, delinquency: mer.delinquency,
    });
  },

  _honestWork(state) {
    const mer = ensureMeridianState(state);
    if (mer.delinquency > 0) mer.delinquency = Math.max(0, mer.delinquency - MERIDIAN_ACCOUNT.honestDrop);
  },

  _gcRows(rows, keep, openStates) {
    if (!Array.isArray(rows)) return;
    const live = [], dead = [];
    for (const r of rows) (openStates.includes(r && r.state) ? live : dead).push(r);
    if (dead.length > keep) dead.splice(0, dead.length - keep);
    rows.length = 0;
    rows.push(...live, ...dead);
  },

  _refuse(state, cause, line) {
    this.bus && this.bus.emit('meridian:refused', { cause, text: line || '' });
    if (line) this._log(state, 'MTS DESK', line, 'machine');
    return null;
  },

  /** The pilot physically moved this body — thrown or on the tether. */
  _playerHandled(state, e) {
    const d = e && e.data;
    if (!d) return false;
    const pid = state.playerId;
    if (d.thrownBy === pid || d.lastThrowerId === pid) return true;
    if (d.thrownBy === 'player' || d.lastThrowerId === 'player') return true;
    const pEnt = entOf(state, pid);
    const tether = pEnt && pEnt.tether;
    if (tether && tether.active !== false && tether.targetId === e.id) return true;
    const pt = state.player && state.player.tether;
    if (pt && pt.active !== false && pt.targetId === e.id) return true;
    return false;
  },

  _spawn(state, spec) {
    const h = this.helpers;
    if (h && typeof h.spawnEntity === 'function') {
      try { return h.spawnEntity(spec); } catch (_) { return null; }
    }
    return null;
  },

  _despawn(state, e, reason) {
    if (!e) return;
    const h = this.helpers;
    if (h && typeof h.removeEntity === 'function') {
      try { h.removeEntity(e.id, { reason }); return; } catch (_) { /* fall through */ }
    }
    e.alive = false;
  },

  /** Impulse steering — force enters ONLY through queuePhysicsImpulse. */
  _steerTo(state, e, targetPos, speed) {
    if (!e || !e.pos || !targetPos) return;
    const dx = targetPos.x - e.pos.x, dz = targetPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const want = Math.min(Math.max(0, speed), dist);
    const vel = e.vel || { x: 0, z: 0 };
    const dvx = (dx / dist) * want - num(vel.x), dvz = (dz / dist) * want - num(vel.z);
    if (Math.abs(dvx) < 1e-4 && Math.abs(dvz) < 1e-4) return;
    const mass = Math.max(1, num(e.mass, 1));
    queuePhysicsImpulse(e, { x: dvx * mass, z: dvz * mass },
      { tick: state.tick, provenance: 'meridian_steer' });
  },

  /** Live MTS exchange stations — transient, rebuilt each tick, never cached. */
  _desks(state, entities) {
    const out = [];
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      const d = e.data || {};
      // Jump gates wear the sector's faction and spawn as type 'station' (world.js), but a
      // gate throat is not a desk — every station scan in the codebase filters them the
      // same way. An explicit meridianExchange flag always opts in.
      if (d.meridianExchange === true || (e.type === 'station' && e.factionId === FACTION_ID
        && d.isGate !== true)) {
        out.push(e);
      }
    }
    return out;
  },

  _deskName(e) {
    return str(e && e.data && e.data.name, 'MTS EXCHANGE');
  },

  _openClaimCount(mer) { return countState(mer.claims, 'open'); },

  // ── verbs (UI / board affordances) ────────────────────────────────────────

  /** Take a posted manifest — issues the sealed consignment at the origin desk. */
  takeContract(state, contractId, opts) {
    const mer = ensureMeridianState(state);
    const now = num(state.simTime);
    const c = mer.contracts.find((x) => x.id === contractId);
    if (!c || c.state !== 'open') {
      return this._refuse(state, 'not_open', 'The desk declines — that manifest is gone.');
    }
    if (this._isBlacklisted(state, mer)) {
      return this._refuse(state, 'blacklist', 'BLACKLISTED — the desk will not take your seal.');
    }
    const wantBond = !!(opts && opts.bond === true);
    if (wantBond && this._credits(state) < c.bondCr) {
      return this._refuse(state, 'credits', `Bond runs ${fmtCr(c.bondCr)} — your hold is short.`);
    }
    const pod = this._spawn(state, {
      type: 'payload', team: 0, factionId: FACTION_ID,
      pos: {
        x: c.originPos.x + 40 + frac('mer-pod-x', c.id) * 30,
        z: c.originPos.z + frac('mer-pod-z', c.id) * 40,
      },
      vel: { x: 0, z: 0 }, radius: 12, mass: 36, hull: 80, hullMax: 80, collides: true,
      data: {
        meridianConsignment: c.id, sealedFreight: true,
        name: `MTS SEALED — ${c.destName}`,
        cargoValueCr: Math.max(1, Math.round(c.payCr * 0.8)),
        scanLabel: `MTS SEALED CONSIGNMENT — deliver to ${c.destName}`,
      },
    });
    if (!pod) return this._refuse(state, 'no_dock', 'No dock crew to issue the freight.');
    // Latch first — a charge listener re-entering sees the manifest already taken.
    c.state = 'taken'; c.takenAt = now; c.bonded = wantBond;
    c.consignmentId = pod.id; c.consignmentGen = pod.occupantGeneration ?? null;
    if (wantBond) this._charge(state, c.bondCr, `meridian_bond:${c.id}`);
    this.bus && this.bus.emit('meridian:contractTaken', {
      contractId: c.id, consignmentId: pod.id, bonded: wantBond, payCr: c.payCr, dueAt: c.dueAt,
    });
    this._log(state, 'MTS EXCHANGE',
      `Manifest ${c.id} is yours — the seal stays closed to ${c.destName}.`, 'machine');
    return c;
  },

  /** Pay down the running account. Partial payments count — the ledger keeps the rest. */
  payAssessment(state) {
    const mer = ensureMeridianState(state);
    const now = num(state.simTime);
    const owed = Math.round(mer.accountOwed);
    if (owed <= 0) return 0;
    const pay = Math.min(owed, this._credits(state));
    if (pay <= 0) {
      this._refuse(state, 'credits', 'Nothing in the hold pays the account.');
      return 0;
    }
    mer.accountOwed = Math.max(0, mer.accountOwed - pay);
    this._charge(state, pay, 'meridian_account_settle');
    this.bus && this.bus.emit('meridian:accountPaid', { amount: pay, remaining: mer.accountOwed });
    if (mer.accountOwed <= 0) {
      let writ = null;
      for (const w of mer.writs) if (w.state === 'open') { writ = w; break; }
      if (writ) {
        this._settleWrit(state, mer, writ, now);
      } else {
        this._rep(state, MERIDIAN_ACCOUNT.settleRep, 'meridian_account_settled');
        this._fileVerdict(state, 'account_settled', str(state.playerId, 'player'), 'The account clears');
        this._log(state, 'MTS LEDGER', 'Account settled.', 'machine');
      }
    }
    return pay;
  },

  // ── main tick ─────────────────────────────────────────────────────────────

  update(dt, state) {
    const mer = ensureMeridianState(state);
    const now = Number(state.simTime) || 0;
    const step = Number(dt) > 0 ? Number(dt) : 1 / 60;
    const entities = entityListOf(state);

    // Group spine members; a body is a member while it carries spineId+spineIndex and lives.
    const spines = new Map();
    const loose = [];
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      const d = e.data || {};
      if (d.spineLoose === true) { loose.push(e); continue; }
      if (typeof d.spineId !== 'string' || !Number.isFinite(d.spineIndex)) continue;
      let spine = spines.get(d.spineId);
      if (!spine) spines.set(d.spineId, spine = []);
      spine.push(e);
    }

    // ── 1. couplers break ────────────────────────────────────────────────────────────
    for (const [spineId, members] of spines) {
      members.sort((a, b) => a.data.spineIndex - b.data.spineIndex);
      // A spine whose lead is gone is not a spine: every remaining body is loose mass.
      // (The tug carries index 0; kill it and the whole train spills.)
      let breakAt = -1;
      if (members.length && members[0].data.spineIndex > 0) breakAt = 0;
      // Find the first broken joint: the gap between member i-1 and i fails on relative
      // speed (a hit), stretch (a tear), or a dead link ahead of it.
      for (let i = 1; breakAt < 0 && i < members.length; i++) {
        const prev = members[i - 1], cur = members[i];
        if (prev.data.spineLoose === true) { breakAt = i; break; }
        const dx = cur.pos.x - prev.pos.x, dz = cur.pos.z - prev.pos.z;
        const dist = Math.hypot(dx, dz);
        if (relSpeed(prev, cur) > SNAP_SPEED || dist > STRETCH_WU) { breakAt = i; break; }
      }
      if (breakAt >= 0) {
        const tail = members.slice(breakAt);
        for (const m of tail) {
          const d = m.data || (m.data = {});
          d.spineLoose = true;
          d.lostFromSpineId = spineId;
          delete d.spineId;
          delete d.spineIndex;
        }
        (mer.snaps[spineId] || (mer.snaps[spineId] = []))
          .push({ atIndex: breakAt, tailIds: tail.map((m) => m.id), t: now });
        if (Object.keys(mer.snaps).length > SNAPS_CAP) capKeys(mer.snaps, SNAPS_CAP);
        this.bus && this.bus.emit('meridian:couplerSnapped', {
          spineId, atIndex: breakAt, tailIds: tail.map((m) => m.id), t: now,
        });
        this.bus && this.bus.emit('comms:log', {
          from: 'MTS SPINE',
          text: `Coupler ${breakAt} gone — ${tail.length} container${tail.length === 1 ? '' : 's'} loose.`,
          kind: 'encounter',
        });
      }
    }

    // ── 2. loose containers re-couple ─────────────────────────────────────────────────
    // The tail of each surviving spine is the only dock: drift a loose body to it and the
    // joint closes behind it. The lead of a dead spine can never re-head a train.
    const tails = new Map();
    for (const [spineId, members] of spines) {
      if (!members.length) continue;
      tails.set(spineId, members[members.length - 1]);
    }
    for (const body of loose) {
      const d = body.data || (body.data = {});
      let best = null, bestId = null, bestD2 = RECOUPLE_WU * RECOUPLE_WU;
      for (const [spineId, tail] of tails) {
        if (tail === body || tail.alive === false) continue;
        const dx = body.pos.x - tail.pos.x, dz = body.pos.z - tail.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = tail; bestId = spineId; }
      }
      if (!best) continue;
      d.spineLoose = false;
      d.spineId = bestId;
      d.spineIndex = (best.data.spineIndex || 0) + 1;
      delete d.meridianClaimedOut; // back on a train — future spills file fresh claims
      this.bus && this.bus.emit('meridian:containerRecoupled', {
        spineId: bestId, id: body.id, index: d.spineIndex,
        fromSpineId: d.lostFromSpineId || null, t: now,
      });
      delete d.lostFromSpineId;
      // The just-linked body is the new tail — chain re-couples in one pass, no stall.
      tails.set(bestId, body);
    }

    // ── 3. hull tickers count a drifting container down ───────────────────────────────
    for (const e of entities) {
      if (!e || e.alive === false) continue;
      const d = e.data || {};
      if (!Number.isFinite(d.cargoValueCr)) continue;
      const isLoose = d.spineLoose === true;
      if (isLoose && d.cargoValueCr > FLOOR_CR) {
        d.cargoValueCr = Math.max(FLOOR_CR, d.cargoValueCr - BLEED_PER_S * step);
        if (d.cargoValueCr <= FLOOR_CR && !mer.floorHit[e.id]) {
          mer.floorHit[e.id] = true;
          this.bus && this.bus.emit('meridian:tickerFloor', { id: e.id, floorCr: FLOOR_CR, t: now });
        }
      }
      const value = Math.round(d.cargoValueCr);
      if (d.tickerValueCr !== value) {
        d.tickerValueCr = value;
        if (isLoose) {
          d.scanLabel = `LOOSE MTS CONTAINER — ${fmtCr(value)} ▼`
            + (d.meridianClaimId != null ? ' · CLAIM FILED' : '');
        } else if (typeof d.spineId === 'string') {
          d.scanLabel = `MTS SPINE CONTAINER — ${fmtCr(value)}`;
        }
      }
    }

    // ── the exchange ledger ──────────────────────────────────────────────────────────
    const desks = this._desks(state, entities);
    this._tickContracts(state, mer, desks, now);
    this._tickClaims(state, mer, desks, loose, now);
    this._tickConvoys(state, mer, desks, step, now);
    this._tickWarrants(state, mer, now);
    this._tickAccount(state, mer, step, now);
  },

  // ── manifest contracts ─────────────────────────────────────────────────────

  _tickContracts(state, mer, desks, now) {
    const C = MERIDIAN_CONTRACTS;
    if (now >= num(mer.nextContractAt)) {
      mer.nextContractAt = now + C.postPeriodS
        + frac('mer-contract-gap', mer.seq, Math.floor(now)) * C.postJitterS;
      if (!this._isBlacklisted(state, mer) && desks.length
          && countState(mer.contracts, 'open') < C.maxOpen) {
        this._postContract(state, mer, desks, now);
      }
    }
    for (const c of mer.contracts) {
      if (c.state === 'open') {
        if (now >= c.dueAt) this._expireContract(state, c, now);
      } else if (c.state === 'taken') {
        this._tickTakenContract(state, mer, c, now);
      }
    }
    this._gcRows(mer.contracts, C.logKeep, ['open', 'taken']);
  },

  _postContract(state, mer, desks, now) {
    const C = MERIDIAN_CONTRACTS;
    const oi = hash32('mer-contract-origin', mer.seq, Math.floor(now)) % desks.length;
    const origin = desks[oi];
    const originPos = { x: num(origin.pos.x), z: num(origin.pos.z) };
    let kind = 'drop', destId = null, destGen = null, destName, destPos;
    if (desks.length >= 2) {
      const dest = desks[(oi + 1) % desks.length];
      kind = 'lane';
      destId = dest.id;
      destGen = dest.occupantGeneration ?? null;
      destName = this._deskName(dest);
      destPos = { x: num(dest.pos.x), z: num(dest.pos.z) };
    } else {
      const ang = frac('mer-drop-ang', mer.seq, Math.floor(now)) * Math.PI * 2;
      const leg = C.dropLegMinWu + frac('mer-drop-leg', mer.seq) * C.dropLegSpanWu;
      destName = `DROP ${10 + (hash32('mer-drop-name', mer.seq) % 89)}`;
      destPos = { x: originPos.x + Math.cos(ang) * leg, z: originPos.z + Math.sin(ang) * leg };
    }
    const dist = Math.hypot(destPos.x - originPos.x, destPos.z - originPos.z);
    const payCr = Math.min(C.payCapCr, Math.round(C.basePayCr + dist * C.payPerWuCr));
    const contract = {
      id: `con:${mer.seq++}`,
      kind,
      originId: origin.id, originGen: origin.occupantGeneration ?? null,
      originName: this._deskName(origin), originPos,
      destId, destGen, destName, destPos,
      postedAt: now, dueAt: now + C.windowS,
      payCr, bondCr: Math.round(payCr * C.bondFrac),
      state: 'open', bonded: false,
      consignmentId: null, consignmentGen: null,
      buoyId: null, buoyGen: null, takenAt: 0,
      sectorId: sectorOf(state),
    };
    if (kind === 'drop') {
      const buoy = this._spawn(state, {
        type: 'payload', team: 0, factionId: FACTION_ID,
        pos: { ...destPos }, vel: { x: 0, z: 0 },
        radius: C.buoyRadius, mass: 20, hull: 80, hullMax: 80, collides: true,
        data: {
          meridianDropBuoy: contract.id,
          name: 'MTS DROP BUOY',
          scanLabel: `MTS DELIVERY BUOY — ${destName}`,
        },
      });
      if (buoy) { contract.buoyId = buoy.id; contract.buoyGen = buoy.occupantGeneration ?? null; }
    }
    mer.contracts.push(contract);
    this.bus && this.bus.emit('meridian:contractPosted', {
      contractId: contract.id, kind, originId: origin.id, destId,
      originName: contract.originName, destName, payCr, dueAt: contract.dueAt,
    });
    this._log(state, 'MTS EXCHANGE',
      `${contract.originName} posts manifest ${contract.id} — sealed freight to ${destName}, `
      + `${fmtCr(payCr)} on the wire.`, 'machine');
    return contract;
  },

  _tickTakenContract(state, mer, c, now) {
    const pod = c.consignmentId != null ? entOf(state, c.consignmentId) : null;
    const podOk = pod && pod.alive !== false && pod.data && pod.data.meridianConsignment === c.id
      && (c.consignmentGen == null || pod.occupantGeneration === c.consignmentGen);
    if (!podOk) { this._defaultContract(state, mer, c, 'lost', now); return; }
    const rr = MERIDIAN_CONTRACTS.deliverR + num(pod.radius, 12);
    if (dist2(pod.pos, c.destPos) <= rr * rr) {
      const pEnt = entOf(state, state.playerId);
      const playerNear = !!(pEnt && pEnt.pos && dist2(pEnt.pos, c.destPos) <= rr * rr);
      if (this._playerHandled(state, pod) || playerNear) {
        this._deliverContract(state, mer, c, pod, now);
        return;
      }
    }
    if (now >= c.dueAt) this._defaultContract(state, mer, c, 'overdue', now);
  },

  _deliverContract(state, mer, c, pod, now) {
    // Latch before any emit — listeners re-entering see a closed manifest.
    c.state = 'delivered'; c.deliveredAt = now;
    if (pod.data) pod.data.meridianConsignment = null;
    this._despawn(state, pod, 'meridian_contract_delivered');
    this._despawnBuoy(state, c);
    const payCr = Math.round(c.payCr * meridianTierFor(mer.deeds).payMult
      * (c.bonded ? MERIDIAN_CONTRACTS.bondMult : 1));
    this._grant(state, payCr, `meridian_contract:${c.id}`);
    if (c.bonded && c.bondCr > 0) this._grant(state, c.bondCr, `meridian_bond_refund:${c.id}`);
    this._rep(state, MERIDIAN_CONTRACTS.repDelivered, 'meridian_contract_delivered');
    this._honestWork(state);
    this._fileVerdict(state, 'contract_delivered', c.id, `${c.originName} → ${c.destName}`);
    this.bus && this.bus.emit('meridian:contractDelivered', {
      contractId: c.id, payCr, bonded: c.bonded, destName: c.destName,
    });
    this._log(state, 'MTS EXCHANGE',
      `Receipt confirmed — ${fmtCr(payCr)} for the manifest. The Syndicate pays what it posts.`,
      'machine');
    this._deed(state, 'contract', c.id);
  },

  _expireContract(state, c, now) {
    c.state = 'expired'; c.closedAt = now;
    this._despawnBuoy(state, c);
    this.bus && this.bus.emit('meridian:contractExpired', { contractId: c.id, destName: c.destName });
  },

  _defaultContract(state, mer, c, cause, now) {
    if (!c || c.state !== 'taken') return;
    // Latch before any emit.
    c.state = 'defaulted'; c.cause = cause; c.defaultedAt = now;
    const breach = cause === 'seal_breach';
    const destroyed = cause === 'freight_destroyed';
    const pod = c.consignmentId != null ? entOf(state, c.consignmentId) : null;
    if (pod && pod.data && pod.data.meridianConsignment === c.id) {
      pod.data.meridianConsignment = null;
      // Freight still on the field after an honest default reverts to the syndicate.
      // A breached seal left it in the pilot's hold — the syndicate bills instead.
      if (!breach && pod.alive !== false && Number.isFinite(pod.data.cargoValueCr)) {
        this._postClaim(state, mer, pod, now);
      }
    }
    this._despawnBuoy(state, c);
    const feeCr = breach || destroyed ? MERIDIAN_CONTRACTS.sealBreachCr : MERIDIAN_CONTRACTS.defaultFeeCr;
    mer.accountOwed = Math.round(mer.accountOwed + feeCr);
    this._accountCharge(state,
      breach ? MERIDIAN_ACCOUNT.sealBreach
        : destroyed ? MERIDIAN_ACCOUNT.freightDestroyed : MERIDIAN_ACCOUNT.contractDefault,
      breach ? 'seal_breach' : destroyed ? 'freight_destroyed' : 'contract_default', c.id);
    this._rep(state,
      breach ? MERIDIAN_CONTRACTS.sealBreachRep : MERIDIAN_CONTRACTS.repDefaulted,
      breach ? 'meridian_seal_breach' : 'meridian_contract_defaulted');
    this._fileVerdict(state, breach ? 'seal_breach' : 'contract_defaulted', c.id,
      `${c.originName} → ${c.destName} · ${cause}`);
    this.bus && this.bus.emit('meridian:contractDefaulted', {
      contractId: c.id, cause, feeCr, accountOwed: Math.round(mer.accountOwed),
    });
    this._log(state, 'MTS LEDGER', breach
      ? 'That seal was the contract — the manifest value files to your account.'
      : `Manifest ${c.id} closes unmet — a breach fee files to your account.`, 'machine');
  },

  _despawnBuoy(state, c) {
    if (c.buoyId == null) return;
    const buoy = entOf(state, c.buoyId);
    if (buoy && buoy.alive !== false && buoy.data && buoy.data.meridianDropBuoy === c.id
      && (c.buoyGen == null || buoy.occupantGeneration === c.buoyGen)) {
      this._despawn(state, buoy, 'meridian_contract_closed');
    }
  },

  // ── recovery claims ────────────────────────────────────────────────────────

  _postClaim(state, mer, box, now) {
    const d = box && box.data;
    if (!d || d.meridianClaimId != null) return null;
    if (d.meridianClaimedOut === true) return null; // written off — the syndicate lets it drift
    if (!Number.isFinite(d.cargoValueCr) || d.encounterId != null) return null;
    if (this._openClaimCount(mer) >= MERIDIAN_RECOVERY.maxOpen) return null;
    const claim = {
      id: `rc:${mer.seq++}`,
      boxId: box.id, gen: box.occupantGeneration ?? null,
      assessedCr: Math.max(0, Math.round(d.cargoValueCr)),
      spineId: str(d.lostFromSpineId) || str(d.spineId),
      postedAt: now, expiresAt: now + MERIDIAN_RECOVERY.windowS,
      state: 'open',
      sectorId: sectorOf(state),
    };
    d.meridianClaimId = claim.id;
    if (typeof d.scanLabel === 'string' && !d.scanLabel.includes('CLAIM FILED')) {
      d.scanLabel += ' · CLAIM FILED';
    }
    mer.claims.push(claim);
    this.bus && this.bus.emit('meridian:claimPosted', {
      claimId: claim.id, boxId: box.id, assessedCr: claim.assessedCr, spineId: claim.spineId,
    });
    this._log(state, 'MTS LEDGER',
      `Recovery filed — loose freight carries ${fmtCr(claim.assessedCr)} of manifest.`, 'machine');
    return claim;
  },

  _tickClaims(state, mer, desks, loose, now) {
    // File on any priced loose freight still drifting without a filing.
    for (const body of loose) {
      const d = body.data;
      if (!d || d.spineLoose !== true) continue;
      this._postClaim(state, mer, body, now);
    }
    const R = MERIDIAN_RECOVERY;
    for (const cl of mer.claims) {
      if (cl.state !== 'open') continue;
      const box = entOf(state, cl.boxId);
      const ok = box && box.alive !== false && box.data && box.data.meridianClaimId === cl.id
        && (cl.gen == null || box.occupantGeneration === cl.gen);
      if (!ok) { this._closeClaim(state, cl, 'lost', now); continue; }
      const d = box.data;
      // Back on a train — the syndicate counts it recovered.
      if (d.spineLoose !== true && typeof d.spineId === 'string') {
        this._settleClaim(state, mer, cl, box, 'recoupled', now);
        continue;
      }
      let settled = false;
      for (const desk of desks) {
        const rr = R.returnR + num(desk.radius, 60);
        if (dist2(box.pos, desk.pos) <= rr * rr && this._playerHandled(state, box)) {
          this._settleClaim(state, mer, cl, box, 'delivered', now);
          settled = true;
          break;
        }
      }
      if (!settled && now >= cl.expiresAt) this._closeClaim(state, cl, 'lapsed', now);
    }
    this._gcRows(mer.claims, MERIDIAN_RECOVERY.logKeep, ['open']);
  },

  _settleClaim(state, mer, cl, box, how, now) {
    // Latch before any emit.
    cl.state = 'returned'; cl.how = how; cl.settledAt = now;
    if (box.data) box.data.meridianClaimId = null;
    if (how === 'delivered') this._despawn(state, box, 'meridian_claim_returned');
    const R = MERIDIAN_RECOVERY;
    const feeCr = Math.round(Math.max(R.minFeeCr, num(box.data && box.data.cargoValueCr) * R.recoveryFrac)
      * meridianTierFor(mer.deeds).payMult);
    cl.feeCr = feeCr;
    this._grant(state, feeCr, `meridian_claim:${cl.id}`);
    this._rep(state, R.repReturned, 'meridian_claim_returned');
    this._honestWork(state);
    this._fileVerdict(state, 'freight_returned', cl.id, `${how} · ${fmtCr(feeCr)}`);
    this.bus && this.bus.emit('meridian:claimSettled', { claimId: cl.id, boxId: cl.boxId, how, feeCr });
    this._log(state, 'MTS LEDGER',
      `Freight received — ${fmtCr(feeCr)} recovery fee, the manifest closes.`, 'machine');
    this._deed(state, 'claim', cl.id);
  },

  _closeClaim(state, cl, outcome, now) {
    cl.state = outcome; cl.settledAt = now;
    const box = entOf(state, cl.boxId);
    if (box && box.data && box.data.meridianClaimId === cl.id) {
      box.data.meridianClaimId = null;
      // A filing that lapses is written off — it does not instantly re-file. The write-off
      // clears only when the freight physically re-links to a train.
      if (outcome === 'lapsed') box.data.meridianClaimedOut = true;
    }
    this.bus && this.bus.emit(outcome === 'lost' ? 'meridian:claimLost' : 'meridian:claimLapsed', {
      claimId: cl.id, boxId: cl.boxId,
    });
  },

  _claimCollected(state, mer, cl, p, byPlayer) {
    const now = num(state.simTime);
    // Latch before any emit.
    cl.state = 'stolen'; cl.settledAt = now; cl.byPlayer = byPlayer;
    const box = entOf(state, cl.boxId);
    if (box && box.data && box.data.meridianClaimId === cl.id) box.data.meridianClaimId = null;
    let markedId = null;
    if (byPlayer) {
      mer.accountOwed = Math.round(mer.accountOwed + cl.assessedCr);
      this._accountCharge(state, MERIDIAN_ACCOUNT.freightTheft, 'freight_theft', cl.id);
      this._rep(state, MERIDIAN_RECOVERY.repStolen, 'meridian_claim_stolen');
      this._fileVerdict(state, 'freight_stolen', cl.id,
        `Filed freight lifted — ${fmtCr(cl.assessedCr)} to the account`);
      this._log(state, 'MTS LEDGER',
        'Manifest freight does not walk off — the value files to your account.', 'machine');
    } else {
      const thief = entOf(state, p.collectorId);
      if (thief && thief.alive !== false && thief.id !== state.playerId) {
        markedId = thief.id;
        this._postWarrant(state, thief, 'freight_theft', `Lifted filed freight ${cl.id}`,
          now, Math.round(cl.assessedCr * MERIDIAN_RECOVERY.npcThiefBountyFrac));
      }
      this._fileVerdict(state, 'freight_taken', cl.id, 'A scavenger lifted filed freight');
    }
    this.bus && this.bus.emit('meridian:claimStolen', {
      claimId: cl.id, boxId: cl.boxId, byPlayer,
      collectorId: markedId ?? p.collectorId ?? null,
    });
  },

  // ── convoys ────────────────────────────────────────────────────────────────

  _tickConvoys(state, mer, desks, step, now) {
    const C = MERIDIAN_CONVOY;
    if (now >= num(mer.nextConvoyAt)) {
      mer.nextConvoyAt = now + C.musterPeriodS
        + frac('mer-convoy-gap', mer.seq, Math.floor(now)) * C.musterJitterS;
      const live = mer.convoys.filter((c) => c.state === 'rolling').length;
      // No muster while the pilot is berthed — 'dock' is not a mode value; the real flag
      // lives on state.ui.docked (dockStateCommit).
      const docked = state.mode === 'dock' || !!(state.ui && state.ui.docked === true);
      if (live < C.maxLive && desks.length && !docked) {
        this._spawnConvoy(state, mer, desks, now);
      }
    }
    for (const cv of mer.convoys) {
      if (cv.state === 'rolling') this._tickConvoy(state, mer, cv, step, now);
    }
    this._gcRows(mer.convoys, C.logKeep, ['rolling']);
  },

  _spawnConvoy(state, mer, desks, now) {
    const C = MERIDIAN_CONVOY;
    const oi = hash32('mer-convoy-origin', mer.seq, Math.floor(now)) % desks.length;
    const origin = desks[oi];
    let destId = null, destName, destPos;
    if (desks.length >= 2) {
      const dest = desks[(oi + 1) % desks.length];
      destId = dest.id;
      destName = this._deskName(dest);
      destPos = { x: num(dest.pos.x), z: num(dest.pos.z) };
    } else {
      const ang = frac('mer-convoy-ang', mer.seq, Math.floor(now)) * Math.PI * 2;
      destName = `LANE ${10 + (hash32('mer-convoy-lane', mer.seq) % 89)}`;
      destPos = {
        x: num(origin.pos.x) + Math.cos(ang) * C.legWu,
        z: num(origin.pos.z) + Math.sin(ang) * C.legWu,
      };
    }
    const id = `cnv:${mer.seq++}`;
    const spineId = `train:${id}`;
    const legDist = Math.hypot(destPos.x - origin.pos.x, destPos.z - origin.pos.z);
    const cv = {
      id, spineId, sectorId: sectorOf(state),
      originId: origin.id, originName: this._deskName(origin),
      destId, destName, destPos,
      tugId: null, tugGen: null,
      members: [], raiders: [],
      seed: (hash32('mer-convoy-seed', id) >>> 0) || 1,
      signed: false, escortS: 0, repelled: 0,
      departedAt: now,
      arriveByAt: now + (legDist / Math.max(1, C.speed)) * C.overdueMult + 60,
      raidAt: 0,
      state: 'rolling',
    };
    const count = C.boxMin + Math.floor(drawSeeded(cv, 'seed', cv.seed) * (C.boxMax - C.boxMin + 1));
    // Line the train along the heading, tug out front of the boxes.
    const hx = destPos.x - origin.pos.x, hz = destPos.z - origin.pos.z;
    const hd = Math.hypot(hx, hz) || 1;
    const ux = hx / hd, uz = hz / hd;
    const startX = num(origin.pos.x) + ux * (num(origin.radius, 60) + 60);
    const startZ = num(origin.pos.z) + uz * (num(origin.radius, 60) + 60);
    const tug = this._spawn(state, {
      type: 'ship', team: 0, factionId: FACTION_ID,
      pos: { x: startX, z: startZ }, vel: { x: 0, z: 0 },
      radius: C.tugRadius, mass: C.tugMass, hull: C.tugHull, hullMax: C.tugHull, collides: true,
      data: {
        meridianConvoy: id, meridianTug: true, spineId, spineIndex: 0,
        name: 'MTS SPINE TUG',
        scanLabel: `MTS CONVOY — ${cv.originName} to ${destName}`,
        ai: { archetype: 'freighter', lawful: true, passive: true },
      },
    });
    if (!tug) return null;
    cv.tugId = tug.id; cv.tugGen = tug.occupantGeneration ?? null;
    for (let i = 0; i < count; i++) {
      const box = this._spawn(state, {
        type: 'container', team: 0, factionId: FACTION_ID,
        pos: { x: startX - ux * LINK_GAP * (i + 1), z: startZ - uz * LINK_GAP * (i + 1) },
        vel: { x: 0, z: 0 },
        radius: C.boxRadius, mass: C.boxMass, hull: C.boxHull, hullMax: C.boxHull, collides: true,
        data: {
          meridianConvoy: id, spineId, spineIndex: i + 1,
          cargoValueCr: Math.round(C.valueMinCr + drawSeeded(cv, 'seed', cv.seed) * C.valueSpanCr),
          name: 'MTS CONTAINER',
        },
      });
      if (box) cv.members.push({ id: box.id, gen: box.occupantGeneration ?? null });
    }
    // The lane draws raiders more often than not.
    if (drawSeeded(cv, 'seed', cv.seed) < C.raidChance) cv.raidAt = now + C.raidDelayS;
    mer.convoys.push(cv);
    this.bus && this.bus.emit('meridian:convoyDeparted', {
      convoyId: id, originName: cv.originName, destName, boxes: cv.members.length,
      destPos, arriveByAt: cv.arriveByAt,
    });
    this.bus && this.bus.emit('meridian:escortAsked', {
      convoyId: id, hailR: C.escortHailR, minS: C.escortMinS,
      purseHintCr: C.escortBaseCr + cv.members.length * C.escortPerBoxCr,
    });
    this._log(state, 'MTS CONVOY',
      `Convoy on the lane — ${cv.originName} to ${destName}, ${cv.members.length} sealed boxes. `
      + 'Escort pay for hands that ride it.', 'machine');
    return cv;
  },

  _tickConvoy(state, mer, cv, step, now) {
    const C = MERIDIAN_CONVOY;
    const tug = entOf(state, cv.tugId);
    const tugOk = tug && tug.alive !== false && tug.data && tug.data.meridianConvoy === cv.id
      && (cv.tugGen == null || tug.occupantGeneration === cv.tugGen);
    if (!tugOk) { this._loseConvoy(state, cv, 'tug_lost', now); return; }

    // Live members still on the train, in coupler order.
    const linked = [];
    for (const row of cv.members) {
      const e = entOf(state, row.id);
      if (e && e.alive !== false && e.data && e.data.meridianConvoy === cv.id
        && e.data.spineLoose !== true && Number.isFinite(e.data.spineIndex)
        && (row.gen == null || e.occupantGeneration === row.gen)) linked.push(e);
    }
    linked.sort((a, b) => (a.data.spineIndex || 0) - (b.data.spineIndex || 0));

    // Drive the train: the tug heads for the dock, each box holds the slot behind its lead.
    const dx = cv.destPos.x - tug.pos.x, dz = cv.destPos.z - tug.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    this._steerTo(state, tug, cv.destPos, Math.min(C.speed, dist));
    const ux = dx / dist, uz = dz / dist;
    let prev = tug;
    for (const m of linked) {
      const slot = { x: prev.pos.x - ux * LINK_GAP, z: prev.pos.z - uz * LINK_GAP };
      this._steerTo(state, m, slot, C.followSpeed);
      prev = m;
    }

    if (dist <= C.arriveR + num(tug.radius, 0)) {
      this._arriveConvoy(state, mer, cv, tug, linked, now);
      return;
    }

    // Escort accrues — the pilot flies the lane, the wire is not the job.
    const pEnt = entOf(state, state.playerId);
    if (pEnt && pEnt.pos && dist2(pEnt.pos, tug.pos) <= C.escortHailR * C.escortHailR) {
      if (!cv.signed) {
        cv.signed = true;
        this.bus && this.bus.emit('meridian:escortSigned', { convoyId: cv.id });
        this._log(state, 'MTS CONVOY', 'Company logged — ride the lane, the purse pays at the dock.', 'machine');
      }
      cv.escortS += step;
    }

    if (cv.raidAt > 0 && now >= cv.raidAt) {
      cv.raidAt = 0;
      this._spawnRaiders(state, cv, tug);
    }
    for (const r of cv.raiders) this._tickRaider(state, cv, tug, r);
    cv.raiders = cv.raiders.filter((r) => !r.dead);

    if (now >= cv.arriveByAt) this._loseConvoy(state, cv, 'overdue', now);
  },

  _arriveConvoy(state, mer, cv, tug, linked, now) {
    // Latch before any emit.
    cv.state = 'arrived'; cv.arrivedAt = now;
    const C = MERIDIAN_CONVOY;
    const boxes = linked.length;
    let purseCr = 0;
    if (cv.signed && cv.escortS >= C.escortMinS) {
      purseCr = Math.round((C.escortBaseCr + boxes * C.escortPerBoxCr)
        * meridianTierFor(mer.deeds).payMult);
      this._grant(state, purseCr, `meridian_escort:${cv.id}`);
      this._rep(state, C.repArrived, 'meridian_escort_paid');
      this._honestWork(state);
      this._fileVerdict(state, 'convoy_arrived', cv.id,
        `${cv.originName} → ${cv.destName} · ${boxes} boxes docked`);
      this._deed(state, 'escort', cv.id);
    } else {
      this._fileVerdict(state, 'convoy_arrived', cv.id, `${cv.originName} → ${cv.destName} · unescorted`);
    }
    this.bus && this.bus.emit('meridian:convoyArrived', { convoyId: cv.id, boxes, purseCr });
    this._log(state, 'MTS CONVOY',
      `Manifest closed — the train docks at ${cv.destName} with ${boxes} box${boxes === 1 ? '' : 'es'}.`,
      'machine');
    // The train docks: freight and tug leave the field together.
    for (const m of linked) this._despawn(state, m, 'meridian_convoy_docked');
    this._despawn(state, tug, 'meridian_convoy_docked');
    for (const r of cv.raiders) {
      const e = entOf(state, r.id);
      if (e && e.alive !== false && e.data) e.data.done = true; // the prey is gone; they slip off
    }
  },

  _loseConvoy(state, cv, cause, now) {
    cv.state = cause === 'overdue' ? 'failed' : 'lost';
    cv.closedAt = now; cv.cause = cause;
    // Loose boxes become filings; linked ones keep their stamps and the coupler law
    // spills them next tick now that the lead is gone.
    for (const r of cv.raiders) {
      const e = entOf(state, r.id);
      if (e && e.alive !== false && e.data) e.data.done = true;
    }
    this.bus && this.bus.emit('meridian:convoyLost', { convoyId: cv.id, cause });
    this._fileVerdict(state, 'convoy_lost', cv.id, `${cv.originName} → ${cv.destName} · ${cause}`);
    this._log(state, 'MTS CONVOY', 'The train is down — recovery filings post on the spill.', 'machine');
  },

  _spawnRaiders(state, cv, tug) {
    const C = MERIDIAN_CONVOY;
    const count = 1 + Math.floor(drawSeeded(cv, 'seed', cv.seed) * C.raiderMax);
    const ids = [];
    for (let i = 0; i < count; i++) {
      const ang = drawSeeded(cv, 'seed', cv.seed) * Math.PI * 2;
      const e = this._spawn(state, {
        type: 'ship', team: 1,
        pos: {
          x: tug.pos.x + Math.cos(ang) * C.raiderSpawnR,
          z: tug.pos.z + Math.sin(ang) * C.raiderSpawnR,
        },
        vel: { x: 0, z: 0 },
        radius: C.raiderRadius, mass: C.raiderMass,
        hull: C.raiderHull, hullMax: C.raiderHull, collides: true,
        data: {
          meridianRaider: cv.id,
          name: 'LANE PIRATE',
          ai: { archetype: 'reaver', pirate: true, hostile: true },
        },
      });
      if (e) { cv.raiders.push({ id: e.id, gen: e.occupantGeneration ?? null }); ids.push(e.id); }
    }
    if (ids.length) {
      this.bus && this.bus.emit('meridian:convoyRaided', { convoyId: cv.id, raiderIds: ids });
      this._log(state, 'MTS CONVOY', 'Hostiles on the lane — the train holds course.', 'encounter');
    }
  },

  _tickRaider(state, cv, tug, r) {
    const e = entOf(state, r.id);
    const ok = e && e.alive !== false && e.data && e.data.meridianRaider === cv.id
      && (r.gen == null || e.occupantGeneration === r.gen);
    if (!ok) { r.dead = true; return; }
    const C = MERIDIAN_CONVOY;
    const d = e.data;
    const tugLive = tug && tug.alive !== false && tug.pos;
    if (d.done === true || !tugLive) {
      // Slip off and leave the field.
      if (tugLive) {
        const ax = e.pos.x - tug.pos.x, az = e.pos.z - tug.pos.z;
        const ad = Math.hypot(ax, az) || 1;
        this._steerTo(state, e,
          { x: e.pos.x + (ax / ad) * 4000, z: e.pos.z + (az / ad) * 4000 }, C.raiderSpeed);
        if (dist2(e.pos, tug.pos) >= C.raiderLeaveR * C.raiderLeaveR) {
          this._despawn(state, e, 'meridian_raider_left');
          r.dead = true;
        }
      } else {
        this._despawn(state, e, 'meridian_raider_orphaned');
        r.dead = true;
      }
      return;
    }
    // Hunt the nearest box still on the train.
    let best = null, bestD2 = Infinity;
    for (const row of cv.members) {
      const b = entOf(state, row.id);
      if (b && b.alive !== false && b.data && b.data.meridianConvoy === cv.id
        && b.data.spineLoose !== true && b.pos) {
        const dd = dist2(b.pos, e.pos);
        if (dd < bestD2) { bestD2 = dd; best = b; }
      }
    }
    if (!best) { d.done = true; return; }
    this._steerTo(state, e, best.pos, C.raiderSpeed);
    if (bestD2 <= C.pluckR * C.pluckR) {
      // A real shove off the coupler — the spine law reads the relative speed and spills it.
      const bdx = best.pos.x - e.pos.x, bdz = best.pos.z - e.pos.z;
      const bd = Math.hypot(bdx, bdz) || 1;
      const mass = Math.max(1, num(best.mass, 1));
      queuePhysicsImpulse(best,
        { x: (bdx / bd) * C.pluckDv * mass, z: (bdz / bd) * C.pluckDv * mass },
        { tick: state.tick, provenance: 'meridian_raider_pluck' });
      d.done = true;
      this.bus && this.bus.emit('meridian:raiderPlucked', {
        convoyId: cv.id, raiderId: e.id, boxId: best.id,
      });
      this._log(state, 'MTS CONVOY', 'A box just came off the train.', 'encounter');
    }
  },

  // ── loss warrants ──────────────────────────────────────────────────────────

  _postWarrant(state, target, cause, detail, now, bountyCr) {
    if (!target || target.alive === false || target.id == null || target.id === state.playerId) {
      return null;
    }
    const mer = ensureMeridianState(state);
    const W = MERIDIAN_WARRANTS;
    const gen = target.occupantGeneration ?? null;
    for (const w of mer.warrants) {
      if (w.state === 'open' && w.targetId === target.id && (w.gen == null || w.gen === gen)) {
        return w;
      }
    }
    if (countState(mer.warrants, 'open') >= W.maxOpen) return null;
    if (!isObj(target.data)) target.data = {};
    const w = {
      id: `wr:${mer.seq++}`,
      targetId: target.id, gen,
      cause, detail: str(detail, '—'),
      bountyCr: Math.max(1, Math.round(bountyCr != null ? bountyCr : W.baseBountyCr)),
      postedAt: now, expiresAt: now + W.windowS,
      state: 'open', sectorId: sectorOf(state),
    };
    target.data.meridianWarrant = w.id;
    mer.warrants.push(w);
    this.bus && this.bus.emit('meridian:warrantPosted', {
      warrantId: w.id, targetId: target.id, cause, bountyCr: w.bountyCr,
    });
    this._fileVerdict(state, 'warrant_posted', String(target.id), detail);
    this._log(state, 'MTS LEDGER',
      `A loss warrant files — the Syndicate pays ${fmtCr(w.bountyCr)} for the name.`, 'machine');
    return w;
  },

  _tickWarrants(state, mer, now) {
    for (const w of mer.warrants) {
      if (w.state !== 'open') continue;
      const t = entOf(state, w.targetId);
      // Generation + ownership tag: a recycled id never answers an old warrant.
      const ok = t && t.alive !== false && t.data && t.data.meridianWarrant === w.id
        && (w.gen == null || t.occupantGeneration === w.gen);
      if (!ok || now >= w.expiresAt) this._closeWarrant(state, w, 'lapsed', now);
    }
    this._gcRows(mer.warrants, MERIDIAN_WARRANTS.logKeep, ['open']);
  },

  _closeWarrant(state, w, outcome, now) {
    w.state = outcome; w.settledAt = now;
    const t = entOf(state, w.targetId);
    if (t && t.data && t.data.meridianWarrant === w.id) t.data.meridianWarrant = null;
    this.bus && this.bus.emit('meridian:warrantLapsed', { warrantId: w.id, targetId: w.targetId });
  },

  // ── the account ────────────────────────────────────────────────────────────

  _tickAccount(state, mer, step, now) {
    const A = MERIDIAN_ACCOUNT;
    if (mer.delinquency > 0) {
      mer.delinquency = Math.max(0, mer.delinquency - A.decayPerS * step);
    }
    if (mer.blacklistedUntil > 0 && now >= mer.blacklistedUntil) {
      if (mer.delinquency >= A.blacklistAt) {
        // Still hot when the window ends — the ban renews. The desk stays shut
        // until the ledger actually cools, not until a timer forgives it.
        mer.blacklistedUntil = now + A.blacklistS;
        this.bus && this.bus.emit('meridian:blacklisted', { until: mer.blacklistedUntil });
        this._log(state, 'MTS LEDGER', 'The ledger is still hot — the blacklist renews.', 'machine');
      } else {
        mer.blacklistedUntil = 0;
        // Stage stands down to 'assessed': a fresh climb through the line re-files
        // the ban — the sanction is per-ascent, never once-per-lifetime.
        mer.delinqStage = Math.min(mer.delinqStage, 2);
        this.bus && this.bus.emit('meridian:blacklistLifted', {});
        this._log(state, 'MTS LEDGER', 'The page turns — the desk takes your manifest again.', 'machine');
      }
    }
    const blacklisted = this._isBlacklisted(state, mer);
    const stage = mer.delinqStage | 0;
    if (!blacklisted && mer.delinquency >= A.blacklistAt && stage < 3) {
      mer.delinqStage = 3;
      mer.blacklistedUntil = now + A.blacklistS;
      this._rep(state, A.blacklistRep, 'meridian_blacklisted');
      this._fileVerdict(state, 'blacklisted', str(state.playerId, 'player'), 'The desk closes to the pilot');
      this.bus && this.bus.emit('meridian:blacklisted', { until: mer.blacklistedUntil });
      this._log(state, 'MTS LEDGER',
        'BLACKLISTED — no manifests, no desk service. The ledger holds.', 'machine');
    } else if (mer.delinquency >= A.assessAt && stage < 2) {
      mer.delinqStage = 2;
      const due = Math.min(A.assessmentCr, this._credits(state));
      if (due > 0) this._charge(state, due, 'meridian_assessment');
      const carried = A.assessmentCr - due;
      if (carried > 0) mer.accountOwed = Math.round(mer.accountOwed + carried);
      this._rep(state, A.assessmentRep, 'meridian_assessed');
      this._fileVerdict(state, 'assessed', str(state.playerId, 'player'),
        carried > 0
          ? `Assessment ${fmtCr(A.assessmentCr)} — ${fmtCr(carried)} carried`
          : `Assessment ${fmtCr(A.assessmentCr)}`);
      this.bus && this.bus.emit('meridian:assessmentCharged', { amount: due, carried });
      this._log(state, 'MTS LEDGER', 'Assessment levied — the invoice is the courtesy.', 'machine');
    } else if (mer.delinquency >= A.warnAt && stage < 1) {
      mer.delinqStage = 1;
      this.bus && this.bus.emit('meridian:accountWarned', { delinquency: mer.delinquency });
      this._log(state, 'MTS LEDGER', 'The Syndicate has noted your account. Carefully.', 'machine');
    }
    if (mer.delinqStage > 0 && mer.delinquency < A.rearmBelow && !blacklisted) {
      mer.delinqStage = 0;
    }
    this._tickWrits(state, mer, now);
  },

  _tickWrits(state, mer, now) {
    const A = MERIDIAN_ACCOUNT;
    let writ = null;
    for (const w of mer.writs) if (w.state === 'open') { writ = w; break; }
    if (!writ && mer.accountOwed > 0 && mer.delinquency >= A.warnAt) {
      writ = {
        id: `writ:${mer.seq++}`, balance: Math.round(mer.accountOwed),
        postedAt: now, sectorId: sectorOf(state),
        spawned: 0, crewBeatAt: 0, lastLogAt: -60,
        crew: [], state: 'open',
      };
      mer.writs.push(writ);
      this.bus && this.bus.emit('meridian:writPosted', { writId: writ.id, balance: writ.balance });
      this._fileVerdict(state, 'writ_posted', str(state.playerId, 'player'),
        `Repo writ — ${fmtCr(writ.balance)} outstanding`);
      this._log(state, 'MTS LEDGER',
        'Repo crew dispatched — they collect what the account is owed.', 'machine');
    }
    if (!writ) { this._gcRows(mer.writs, 2, ['open']); return; }
    writ.balance = Math.round(mer.accountOwed);
    if (mer.accountOwed <= 0) {
      this._settleWrit(state, mer, writ, now);
      this._gcRows(mer.writs, 2, ['open']);
      return;
    }
    const hot = mer.delinquency >= A.warnAt;
    const inSector = !writ.sectorId || writ.sectorId === sectorOf(state);
    const pEnt = entOf(state, state.playerId);
    for (const r of writ.crew) {
      const e = entOf(state, r.entityId);
      const ok = e && e.alive !== false && e.data && e.data.meridianRepo === writ.id
        && (r.gen == null || e.occupantGeneration === r.gen);
      if (!ok) { r.dead = true; continue; }
      if (!hot || !inSector) {
        // The crew stands down while the account cools or the pilot changes sectors —
        // the balance waits; the syndicate does not forget the arithmetic.
        this._despawn(state, e, 'meridian_repo_stood_down');
        r.dead = true;
        continue;
      }
      if (!pEnt || !pEnt.pos) continue;
      this._steerTo(state, e, pEnt.pos, A.cutterSpeed);
      const rr = A.levyR + num(e.radius, 0) + num(pEnt.radius, 0);
      if (dist2(e.pos, pEnt.pos) <= rr * rr && now >= num(r.nextLevyAt)) {
        const levy = Math.min(A.levyCapCr, this._credits(state), Math.round(mer.accountOwed));
        if (levy > 0) {
          r.nextLevyAt = now + A.levyBeatS;
          mer.accountOwed = Math.max(0, mer.accountOwed - levy);
          writ.balance = Math.round(mer.accountOwed);
          this._charge(state, levy, `meridian_levy:${writ.id}`);
          this.bus && this.bus.emit('meridian:levyCollected', {
            writId: writ.id, cutterId: e.id, amount: levy, balance: writ.balance,
          });
          if (now - num(writ.lastLogAt) > A.levyLogBeatS) {
            writ.lastLogAt = now;
            this._log(state, 'MTS REPO',
              `Levy collected against the account — ${fmtCr(levy)}; ${fmtCr(writ.balance)} stands.`,
              'machine');
          }
        } else if (now >= num(r.nextTauntAt)) {
          r.nextTauntAt = now + A.tauntBeatS;
          this._log(state, 'MTS REPO', 'Empty pockets change nothing — the account still owes.', 'machine');
        }
      }
    }
    writ.crew = writ.crew.filter((r) => !r.dead);
    if (hot && inSector && pEnt && pEnt.pos && writ.crew.length < A.cutterMax
        && writ.spawned < A.cutterSpawnCap && now >= num(writ.crewBeatAt)) {
      writ.crewBeatAt = now + A.crewBeatS;
      const ang = frac('mer-repo-ang', writ.id, writ.spawned) * Math.PI * 2;
      const e = this._spawn(state, {
        type: 'ship', team: 1, factionId: FACTION_ID,
        pos: {
          x: pEnt.pos.x + Math.cos(ang) * A.cutterSpawnR,
          z: pEnt.pos.z + Math.sin(ang) * A.cutterSpawnR,
        },
        vel: { x: 0, z: 0 },
        radius: A.cutterRadius, mass: A.cutterMass,
        hull: A.cutterHull, hullMax: A.cutterHull, collides: true,
        data: {
          meridianRepo: writ.id,
          name: 'MTS REPO',
          scanLabel: 'MTS REPO CREW — collecting on the account',
          ai: { archetype: 'repo', lawful: true, hostile: true },
        },
      });
      if (e) {
        writ.spawned += 1;
        writ.crew.push({ entityId: e.id, gen: e.occupantGeneration ?? null, nextLevyAt: 0, nextTauntAt: 0 });
        this.bus && this.bus.emit('meridian:repoFielded', { writId: writ.id, cutterId: e.id });
      }
    }
    if (mer.accountOwed <= 0) this._settleWrit(state, mer, writ, now);
    this._gcRows(mer.writs, 2, ['open']);
  },

  _settleWrit(state, mer, writ, now) {
    // Latch before any emit.
    writ.state = 'settled'; writ.settledAt = now;
    for (const r of writ.crew) {
      const e = entOf(state, r.entityId);
      if (e && e.alive !== false && e.data && e.data.meridianRepo === writ.id) {
        this._despawn(state, e, 'meridian_repo_settled');
      }
    }
    writ.crew = [];
    this._rep(state, MERIDIAN_ACCOUNT.settleRep, 'meridian_account_settled');
    this._fileVerdict(state, 'writ_settled', str(state.playerId, 'player'),
      'The account clears — the crew stands down');
    this.bus && this.bus.emit('meridian:writSettled', { writId: writ.id });
    this._log(state, 'MTS LEDGER', 'Account settled — the crew stands down.', 'machine');
  },

  // ── event ears ─────────────────────────────────────────────────────────────

  _isMeridianHull(victim, vd) {
    if (!victim || victim.type !== 'ship') return false;
    if (vd && (vd.meridianRepo != null || vd.meridianRaider != null)) return false;
    return victim.factionId === FACTION_ID || (vd && vd.meridianConvoy != null) || false;
  },

  _onPickup(p) {
    const state = this.state;
    if (!state || !p) return;
    const id = p.pickupId ?? p.entityId ?? p.id;
    if (id == null) return;
    // The wire reports the touch; the receipt names the take. Cargo writes the acceptance
    // fields on this same payload before this listener runs (registry order) — a refused
    // scoop (hold full, custody denied) moves no freight, so nothing files.
    if (hasExplicitPickupAcceptance(p) && !(finiteWholePickupAmount(p.acceptedAmount) > 0)) {
      return;
    }
    const mer = ensureMeridianState(state);
    const now = num(state.simTime);
    const byPlayer = p.collectorId != null && p.collectorId === state.playerId;
    for (const c of mer.contracts) {
      if (c.state !== 'taken' || c.consignmentId !== id) continue;
      // The event names a number; the seal names an occupant. An id recycled into an
      // unrelated pickup must satisfy the ownership tag AND the generation before the
      // manifest defaults on it — the same guard the tick path uses.
      const pod = entOf(state, id);
      if (!pod || !pod.data || pod.data.meridianConsignment !== c.id
        || (c.consignmentGen != null && pod.occupantGeneration !== c.consignmentGen)) {
        continue;
      }
      this._defaultContract(state, mer, c, byPlayer ? 'seal_breach' : 'lost', now);
      return;
    }
    for (const cl of mer.claims) {
      if (cl.state !== 'open' || cl.boxId !== id) continue;
      const box = entOf(state, id);
      if (!box || !box.data || box.data.meridianClaimId !== cl.id
        || (cl.gen != null && box.occupantGeneration !== cl.gen)) {
        continue;
      }
      this._claimCollected(state, mer, cl, p, byPlayer);
      return;
    }
  },

  _onKilled(p) {
    const state = this.state;
    if (!state || !p || p.id == null) return;
    const mer = ensureMeridianState(state);
    const now = num(state.simTime);
    const victim = entOf(state, p.id);
    // Every real emitter marks the corpse before the wire reports it. A live or missing
    // occupant at this id is a stale report against a recycled slot — never a kill to file.
    if (!victim || victim.alive !== false) return;
    const vd = victim.data;
    const meridianDead = victim.factionId === FACTION_ID || !!(vd && (
      vd.meridianConsignment != null || vd.meridianClaimId != null
      || vd.meridianWarrant != null || vd.meridianRaider != null
      || vd.meridianRepo != null || vd.meridianConvoy != null));
    if (!meridianDead) return; // the ledger files only its own dead
    // The wire can report the same corpse twice (replays, re-entrant emitters): the
    // filings latch per id + occupant generation — the guard every other record uses.
    const killKey = `killv:${p.id}:${victim.occupantGeneration ?? 0}`;
    if (mer.paid[killKey]) return;
    mer.paid[killKey] = true;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;

    // A posted warrant's name died — whoever swung, the filing closes.
    if (vd && vd.meridianWarrant != null) {
      const w = mer.warrants.find((x) => x.id === vd.meridianWarrant && x.state === 'open');
      if (w && w.targetId === p.id && (w.gen == null || w.gen === victim.occupantGeneration)) {
        // Latch before any emit.
        w.state = byPlayer ? 'paid' : 'resolved'; w.settledAt = now;
        let bountyCr = 0;
        if (byPlayer && this._paidOnce(mer, `warrant:${w.id}`)) {
          bountyCr = Math.round(w.bountyCr * meridianTierFor(mer.deeds).payMult);
          this._grant(state, bountyCr, `meridian_warrant:${w.id}`);
          this._rep(state, MERIDIAN_WARRANTS.repPaid, 'meridian_warrant_paid');
          this._honestWork(state);
          this._fileVerdict(state, 'warrant_paid', w.id, `${w.cause} — collected`);
          this._deed(state, 'warrant', w.id);
        }
        this.bus && this.bus.emit('meridian:warrantPaid', {
          warrantId: w.id, targetId: w.targetId, byPlayer, bountyCr,
        });
        if (bountyCr > 0) {
          this._log(state, 'MTS LEDGER', `Warrant collected — ${fmtCr(bountyCr)}. The account closes.`, 'machine');
        }
      }
      vd.meridianWarrant = null;
    }

    // A lane pirate repelled on convoy ground.
    if (vd && vd.meridianRaider != null) {
      const cv = mer.convoys.find((c) => c.id === vd.meridianRaider);
      if (cv) cv.repelled = (cv.repelled | 0) + 1;
      if (byPlayer && this._paidOnce(mer, `repel:${p.id}:${victim.occupantGeneration ?? 0}`)) {
        const bountyCr = Math.round(MERIDIAN_CONVOY.repelPayCr * meridianTierFor(mer.deeds).payMult);
        this._grant(state, bountyCr, `meridian_repel:${p.id}`);
        this._rep(state, MERIDIAN_CONVOY.repelRep, 'meridian_raider_repelled');
        this._fileVerdict(state, 'raider_repelled', str(vd.meridianRaider, '—'),
          'A lane pirate cooled on convoy ground');
        this.bus && this.bus.emit('meridian:raiderRepelled', {
          convoyId: vd.meridianRaider, raiderId: p.id, bountyCr,
        });
      }
    }

    // A repo cutter died — the crew row closes; the account files the killer's name.
    if (vd && vd.meridianRepo != null) {
      const writ = mer.writs.find((w) => w.id === vd.meridianRepo && w.state === 'open');
      if (writ && Array.isArray(writ.crew)) {
        writ.crew = writ.crew.filter((r) => r.entityId !== p.id);
      }
      if (byPlayer) {
        this._rep(state, MERIDIAN_ACCOUNT.repoKilledRep, 'meridian_repo_killed');
        this._accountCharge(state, MERIDIAN_ACCOUNT.repoKilled, 'repo_killed', String(p.id));
        this._fileVerdict(state, 'repo_killed', String(p.id),
          'A levy officer down — billed to the account');
        this._log(state, 'MTS LEDGER', 'Killing the collectors does not close the book.', 'machine');
      }
    }

    // A sealed consignment died — the manifest defaults on the loss.
    let freightFiled = false;
    if (vd && vd.meridianConsignment != null) {
      freightFiled = true;
      const c = mer.contracts.find((x) => x.id === vd.meridianConsignment && x.state === 'taken');
      if (c) this._defaultContract(state, mer, c, byPlayer ? 'freight_destroyed' : 'lost', now);
      if (!byPlayer && p.killerId != null) {
        const killer = entOf(state, p.killerId);
        if (killer && killer.alive !== false && killer.id !== state.playerId) {
          this._postWarrant(state, killer, 'freight_destroyed',
            `Burned sealed freight ${vd.meridianConsignment}`, now);
        }
      }
    }

    // Filed freight destroyed — the claim dies with the box.
    if (vd && vd.meridianClaimId != null) {
      const cl = mer.claims.find((x) => x.id === vd.meridianClaimId && x.state === 'open');
      if (cl) {
        freightFiled = true;
        this._closeClaim(state, cl, 'lost', now);
        if (byPlayer) {
          this._accountCharge(state, MERIDIAN_ACCOUNT.freightDestroyed, 'freight_destroyed', String(p.id));
          this._rep(state, MERIDIAN_ACCOUNT.freightDestroyedRep, 'meridian_freight_destroyed');
          this._fileVerdict(state, 'freight_destroyed', String(cl.id),
            'Filed freight burned on the ticker');
        } else if (p.killerId != null) {
          const killer = entOf(state, p.killerId);
          if (killer && killer.alive !== false && killer.id !== state.playerId) {
            this._postWarrant(state, killer, 'freight_destroyed', 'Burned filed freight', now);
          }
        }
      }
    }

    // Any other priced syndicate freight burned on the ticker files the hand that swung —
    // unclaimed convoy boxes and loose containers are still manifest mass.
    if (victim && vd && !freightFiled && !this._isMeridianHull(victim, vd)
        && (victim.factionId === FACTION_ID || vd.meridianConvoy != null)
        && Number.isFinite(vd.cargoValueCr)) {
      if (byPlayer) {
        if (p.targetHostileToPlayer !== true) {
          this._accountCharge(state, MERIDIAN_ACCOUNT.freightDestroyed, 'freight_destroyed', String(p.id));
          this._rep(state, MERIDIAN_ACCOUNT.freightDestroyedRep, 'meridian_freight_destroyed');
          this._fileVerdict(state, 'freight_destroyed', String(p.id),
            'Priced freight burned on the ticker');
        }
      } else if (p.killerId != null) {
        const killer = entOf(state, p.killerId);
        if (killer && killer.alive !== false && killer.id !== state.playerId) {
          this._postWarrant(state, killer, 'freight_destroyed', 'Burned syndicate freight', now);
        }
      }
    }

    // A syndicate hull died — convoy loss, and the syndicate prices the hand that swung.
    if (victim && this._isMeridianHull(victim, vd)) {
      if (vd && vd.meridianTug === true && vd.meridianConvoy != null) {
        const cv = mer.convoys.find((c) => c.id === vd.meridianConvoy && c.state === 'rolling');
        if (cv) this._loseConvoy(state, cv, 'tug_lost', now);
      }
      if (byPlayer) {
        if (p.targetHostileToPlayer !== true) {
          this._rep(state, MERIDIAN_ACCOUNT.hullKilledRep, 'meridian_hull_killed');
          this._accountCharge(state, MERIDIAN_ACCOUNT.hullKilled, 'hull_killed', String(p.id));
          this._fileVerdict(state, 'hull_killed', String(p.id), 'A syndicate hull murdered');
        }
      } else if (p.killerId != null) {
        const killer = entOf(state, p.killerId);
        if (killer && killer.alive !== false && killer.id !== state.playerId) {
          this._postWarrant(state, killer, 'hull_lost', 'Downed a syndicate hull', now);
        }
      }
    }
  },
};

export default factionMeridian;
