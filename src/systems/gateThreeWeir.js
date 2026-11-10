// W-CAST-HANDS (row 542, 03 §4.1 / 06 B6): the Gate 3 weir — Hale and Dree's shared post.
// A standing Concord weigh-cordon across the Tethys lane at the Customs Gate. Crossing
// the ring IS submitting: the calendar census sweeps the player's path for a cordon
// entry and, when it finds one, runs the shared row-513 scale model — hull signature
// plus loose freight near the hull against the manifest the papers declare.
//
//   * CLEAN   — transit logged, Hale's desk line.
//   * WAIVED  — Inspector Dree waves the weir: one small over-mass, once ever (B6).
//   * FINED   — anything bigger or anything after: REF 44-C filed, the second fine
//               charged correctly through economy:chargeCredits.
//
// THE BUREAU — the post is a whole customs desk, not a scale alone:
//   * THE BOOK — every crossing writes a weigh-slip row into a bounded ledger at
//     state.story.gateThreeWeir (state.story serializes wholesale — no schema work);
//     filed fines carry REF receipts the desk can later hear contested.
//   * INSPECTIONS — after the first baseline transit, a seeded share of crossings
//     (and every crossing while the runner mark is hot) are held: stay inside the
//     weir while Dree walks the hull and the verdict files at the walk's end.
//   * WEIR RUNS — bolt before the walk finishes and the filing lands anyway: the
//     pending verdict plus a runner surcharge, a Concord rep hit, a rising runner
//     count, and a flagged window in which every return is held. Jumping sectors
//     mid-hold files the same run on the way out.
//   * THE COUNTER — a desk ring at the post: hold still inside it to transact,
//     once per approach. The newest uncontested REF can be contested — Dree
//     overturns desk-error fines (refund + a standing note), Hale upholds the rest
//     and prices the counter's time. Otherwise the desk sells a Transit Bond:
//     the tariff reads bonded hulls at half a filed fine for the window, and a
//     window closed clean rebates part of the fee. Marked hulls buy nothing.
//   * STANDING — a hull Concord actually knows (rank step >= 2) reads the rank
//     discount on filed fines and is held half as often.
//   * RECALIBRATION — the cordon blinds itself on a seeded maintenance cadence;
//     transits inside the window log unread — the one honest gap in the honest
//     scale, and the smuggler's clock.
//   * THE LANE CENSUS — every non-player hull is swept on the same entry law and
//     weighed on the same model; over-mass haulers are flagged and walked aside
//     toward the hold point through the physics membrane, in view of the lane.
//
// WHAT THIS OWNS — one beacon marking the cordon post (same event-driven seams as every
// one-off: init / deferred sector-enter / save:loaded / newGame) plus the calendar
// entry census. The post never opens the hold; the scale reads signatures, not papers.
// The entry latch is a from-position the adapter keeps — a hull inside the ring is not
// re-weighed until it leaves and submits again.
//
// DETERMINISM — the seeded calls run on hash32 over the bureau's own sequence numbers;
// the only clock is state.simTime (deferredEnterNow on the enter seam); money moves only
// through economy:chargeCredits / economy:grantCredits (bond sales use the exact-charge
// requireFull seam so a bond can never be written without its fee); standing moves only
// through faction:repDelta; lane hulls move only through queuePhysicsImpulse. Every emit
// follows the latch that guards it, so a synchronous listener re-entering sees the
// outcome already filed. Lane verdict rows pair entity id with occupantGeneration —
// a recycled id cannot inherit a dead hull's weigh-slip.
import { GATE_THREE_WEIR } from '../data/gateThree.js';
import { gateThreeEntered, gateThreeInWeir, gateThreeWeigh, gateThreeOutcome } from '../characters/gateThreeRules.js';
import { deferSectorEnterMaterialization, deferredEnterNow } from '../core/sectorEnterDefer.js';
import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { rankForState } from './factions.js';

const W = GATE_THREE_WEIR;
const BASE_SCAN_LABEL = 'Gate 3 customs weir — Concord weigh cordon';
const VERDICT_KINDS = new Set(['clean', 'waived', 'fined']);
const LOG_OUTCOMES = new Set(['clean', 'waived', 'fined', 'blind', 'evaded']);
const REBATE_CAP = 8;

function finiteNum(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function safeInt(v, fallback = 0) { return Number.isSafeInteger(v) && v >= 0 ? v : fallback; }

/** The bureau clock: deferredEnterNow stamps the enter emit's own time inside provider
 *  drains; outside a drain it IS simTime. */
function weirNow(state) {
  const t = deferredEnterNow(state);
  return Number.isFinite(t) ? t : 0;
}

/** The lane census predicate: every real hull that is not the player submits.
 *  Closed-form route visuals (physicsBody/collides false) are not hulls the desk can
 *  hold — they book nothing. data.gate3Exempt is the authored opt-out for set-piece
 *  traffic that must never read as freight on the book. */
function gateThreeLaneShip(e, playerId) {
  if (!e || e.alive === false || !e.pos) return false;
  if (e.id === playerId || e.isPlayer === true) return false;
  if (e.type !== 'ship') return false;
  if (e.collides === false || e.physicsBody === false) return false;
  const d = e.data;
  if (d && d.gate3Exempt === true) return false;
  return Number.isFinite(e.mass) && e.mass > 0;
}

/** Fresh serializable bureau record, lazily hung on state.story (the missions path
 *  serializes that subtree wholesale). Re-run on save:loaded and every census —
 *  absent, malformed or hostile fields heal to the bounded fresh record and never
 *  wedge a latch, a clock, or a ledger past its cap. */
export function ensureGateThreeWeir(state) {
  const story = state && state.story;
  if (!story || typeof story !== 'object' || Object.isFrozen(story)) return null;
  const now = weirNow(state);
  let rec = story.gateThreeWeir;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || Object.isFrozen(rec)
    || rec.schemaVersion !== 1) {
    rec = story.gateThreeWeir = {
      schemaVersion: 1, seq: 0, crossings: 0, runners: 0, flaggedUntil: 0,
      inspection: null, bond: null, rebates: [],
      deskDwell: 0, deskLatched: false,
      nextMaintenanceAt: 0, maintenanceUntil: 0, maintenanceSeq: 0,
      laneBarkAt: 0, log: [], lane: [],
    };
  }
  rec.seq = safeInt(rec.seq);
  rec.crossings = safeInt(rec.crossings);
  rec.runners = safeInt(rec.runners);
  // A runner mark can only reach as far as the mark itself can still be hot.
  rec.flaggedUntil = Number.isFinite(rec.flaggedUntil)
    ? Math.min(Math.max(rec.flaggedUntil, 0), now + W.flaggedS) : 0;
  if (rec.inspection !== null && (typeof rec.inspection !== 'object' || Array.isArray(rec.inspection))) {
    rec.inspection = null;
  } else if (rec.inspection) {
    if (Object.isFrozen(rec.inspection)) rec.inspection = { ...rec.inspection };
    const ins = rec.inspection;
    if (!VERDICT_KINDS.has(ins.kind)) {
      rec.inspection = null;
    } else {
      ins.seq = safeInt(ins.seq);
      // A hostile deadline can never hold the hull past one real walk.
      ins.dueAt = Number.isFinite(ins.dueAt) ? Math.min(Math.max(ins.dueAt, 0), now + W.inspectS) : now;
      ins.overT = Math.max(0, finiteNum(ins.overT));
      ins.fine = Math.max(0, finiteNum(ins.fine));
      ins.readMassT = finiteNum(ins.readMassT);
      ins.manifestMassT = finiteNum(ins.manifestMassT);
      ins.deskSpoken = ins.deskSpoken === true;
    }
  }
  if (rec.bond !== null && (typeof rec.bond !== 'object' || Array.isArray(rec.bond))) {
    rec.bond = null;
  } else if (rec.bond) {
    if (Object.isFrozen(rec.bond)) rec.bond = { ...rec.bond };
    const b = rec.bond;
    if (typeof b.receipt !== 'string' || !Number.isFinite(b.issuedAt) || !Number.isFinite(b.expiresAt)) {
      rec.bond = null;
    } else {
      // An absurd expiry heals inside the longest honest window.
      b.expiresAt = Math.min(Math.max(b.expiresAt, 0), now + W.bondValidS);
      b.fee = Math.max(0, finiteNum(b.fee));
      b.finesDuring = safeInt(b.finesDuring);
    }
  }
  rec.rebates = (Array.isArray(rec.rebates) ? rec.rebates : [])
    .filter((r) => typeof r === 'string').slice(-REBATE_CAP);
  rec.deskDwell = Number.isFinite(rec.deskDwell)
    ? Math.min(Math.max(rec.deskDwell, 0), W.deskDwellS) : 0;
  rec.deskLatched = rec.deskLatched === true;
  // The maintenance clock must always resolve inside one honest cadence: an unset
  // stamp seeds the first window, an elapsed stamp survives so the census can open
  // it, and a stamp beyond the longest possible gap clamps back inside.
  const maxGap = now + W.maintenancePeriodS + W.maintenanceJitterS;
  rec.maintenanceUntil = Number.isFinite(rec.maintenanceUntil)
    ? Math.min(Math.max(rec.maintenanceUntil, 0), now + W.maintenanceS) : 0;
  rec.maintenanceSeq = safeInt(rec.maintenanceSeq);
  if (!(Number.isFinite(rec.nextMaintenanceAt) && rec.nextMaintenanceAt > 0)) {
    rec.maintenanceSeq += 1;
    rec.nextMaintenanceAt = now + W.maintenancePeriodS
      + (hash32('g3:maint', rec.maintenanceSeq) % W.maintenanceJitterS);
  } else {
    rec.nextMaintenanceAt = Math.min(rec.nextMaintenanceAt, maxGap);
  }
  rec.laneBarkAt = Number.isFinite(rec.laneBarkAt)
    ? Math.min(Math.max(rec.laneBarkAt, 0), now + W.laneBarkS) : 0;
  rec.log = (Array.isArray(rec.log) ? rec.log : [])
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r) && LOG_OUTCOMES.has(r.outcome))
    .slice(-W.logCap)
    .map((r) => ({ ...r })); // heal-writes below need mutable slips
  for (const r of rec.log) {
    r.seq = safeInt(r.seq);
    r.at = finiteNum(r.at);
    r.readMassT = finiteNum(r.readMassT);
    r.manifestMassT = finiteNum(r.manifestMassT);
    r.overT = Math.max(0, finiteNum(r.overT));
    r.fine = Math.max(0, finiteNum(r.fine));
    if (r.contested !== 'overturned' && r.contested !== 'upheld') delete r.contested;
    if (typeof r.receipt !== 'string') delete r.receipt;
    r.inspected = r.inspected === true;
    r.bonded = r.bonded === true;
  }
  rec.lane = (Array.isArray(rec.lane) ? rec.lane : [])
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r)
      && Number.isSafeInteger(r.id)
      && (r.outcome === 'clean' || r.outcome === 'flagged'))
    .slice(-W.laneCap)
    .map((r) => ({ ...r }));
  for (const r of rec.lane) {
    r.gen = safeInt(r.gen);
    r.overT = Math.max(0, finiteNum(r.overT));
    r.at = finiteNum(r.at);
  }
  return rec;
}

export function gateThreeWeirSpec() {
  return {
    type: 'beacon',
    pos: { ...W.post }, vel: { x: 0, z: 0 },
    radius: 14, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: W.sectorId,
    data: {
      gateThreeWeir: true, parentType: 'story_prop',
      scanLabel: BASE_SCAN_LABEL,
      scannerSignalKind: 'salvage',
      homeSectorId: W.sectorId,
      counterRadius: W.counterRadius,
    },
  };
}

export function createGateThreeWeir() {
  return {
    name: 'gateThreeWeir',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._lastPos = null;
      this._blindLabeled = false;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._lastPos = null;
        // Boundary flight: a hull that leaves Tethys with a walk still open ran
        // the weir — the desk files it on the way out, not on return.
        const s = this.state;
        const dest = (p && typeof p.sectorId === 'string') ? p.sectorId : s?.world?.currentSectorId;
        if (s?.story && dest !== W.sectorId) {
          const rec = ensureGateThreeWeir(s);
          if (rec && rec.inspection) {
            this._resolveRun(s, rec, this._flags(), weirNow(s));
          }
        }

        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => {
        this._lastPos = null;
        this._blindLabeled = false;
        ensureGateThreeWeir(this.state);
        this._sync();
      });
      on('game:newGame', () => {
        this._lastPos = null;
        this._blindLabeled = false;
        if (this.state?.story) this.state.story.gateThreeWeir = null;
        this._sync();
      });
      ensureGateThreeWeir(this.state);
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      this._lastPos = null;
      this._blindLabeled = false;
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
    },
    _flags() {
      const story = this.state?.story;
      if (!story || typeof story !== 'object') return null;
      if (story.flags && typeof story.flags === 'object') {
        return Object.isFrozen(story.flags) ? null : story.flags;
      }
      if (Object.isFrozen(story)) return null;
      return (story.flags = {});
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === W.sectorId;
    },
    _player() {
      const s = this.state;
      const id = s?.playerId;
      if (!id) return null;
      return s.entities?.get?.(id) || (s.entityList || []).find((e) => e && e.id === id) || null;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gateThreeWeir === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gateThreeWeir === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(gateThreeWeirSpec());
      const flags = this._flags();
      if (flags && flags[W.announceFlag] !== true) {
        flags[W.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'gate3_weir_announce', sender: W.sender, category: 'story',
          text: W.announce, ttl: 9, persist: false,
        });
      }
      this._syncLabel();
    },
    /** The scanner label wears the recalibration window while it is open. */
    _syncLabel() {
      const beacon = this._beacon();
      if (!beacon || !beacon.data) { this._blindLabeled = false; return; }
      const rec = ensureGateThreeWeir(this.state);
      const blind = !!(rec && weirNow(this.state) < rec.maintenanceUntil);
      const want = blind ? W.blindLabel : BASE_SCAN_LABEL;
      if (beacon.data.scanLabel !== want) beacon.data.scanLabel = want;
      this._blindLabeled = blind;
    },
    _popup(id, category, text, { ttl = 9, persist = false } = {}) {
      this.bus?.emit('comms:popup', { id, sender: W.sender, category, text, ttl, persist });
    },
    _fmt(tpl, map) {
      return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (map[k] != null ? String(map[k]) : m));
    },
    _pushLog(rec, row) {
      rec.log.push(row);
      while (rec.log.length > W.logCap) rec.log.shift();
      return row;
    },
    /** The tariff discount that applies to a filed fine right now: the better of a
     *  live Transit Bond and real Concord standing. */
    _fineDiscount(s, rec, now) {
      let disc = 0;
      if (rec.bond && now < rec.bond.expiresAt) disc = Math.max(disc, W.bondDiscount);
      if (rankForState(s, W.factionId).step >= W.rankDiscountStep) disc = Math.max(disc, W.rankDiscount);
      return disc;
    },
    /** Inspection lottery: the first transit is the baseline read and is never
     *  held; a hot runner mark holds every crossing; standing cuts the odds. */
    _ordersHold(s, rec, now) {
      if (rec.flaggedUntil > now) return true;
      if (rec.crossings <= 1) return false;
      let pct = W.inspectPct;
      if (rankForState(s, W.factionId).step >= W.rankDiscountStep) pct *= W.rankInspectMult;
      return (hash32('gate3weir:inspect', rec.crossings) % 100) < pct;
    },

    // ── The census tick ─────────────────────────────────────────────────────────
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) { this._lastPos = null; return; }
      const rec = ensureGateThreeWeir(s);
      const flags = this._flags();
      if (!rec || !flags) return;
      const now = weirNow(s);
      const player = this._player();
      const pos = player && player.pos;
      const posOk = !!(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z));
      const last = this._lastPos;
      this._lastPos = posOk ? { x: pos.x, z: pos.z } : null;

      this._tickMaintenance(s, rec, now);
      this._tickBond(s, rec, now);
      this._tickLane(s, rec, now, player ? player.id : null);

      if (!player || player.alive === false || !posOk) { rec.deskDwell = 0; return; }

      if (rec.inspection) {
        // An open walk owns the ring: no fresh crossing weighs and the counter
        // waits — a hull parked at the desk is still being read.
        rec.deskDwell = 0;
        this._tickInspection(s, rec, flags, pos, now);
        if (rec.inspection) this._maybeDeskBusy(s, rec, pos, now);
        return;
      }
      // The weigh lands before the counter transacts — a fine filed this census is
      // already a row the desk can hear contested.
      if (gateThreeEntered(last, pos)) this._crossing(s, rec, flags, player, now);
      if (rec.inspection) { rec.deskDwell = 0; return; } // a hold opened — the desk waits
      this._tickDesk(s, rec, flags, player, pos, dt, now);
    },

    // ── Recalibration windows ─────────────────────────────────────────────────
    _tickMaintenance(s, rec, now) {
      if (now < rec.maintenanceUntil) {
        if (!this._blindLabeled) this._syncLabel();
        return;
      }
      if (this._blindLabeled) this._syncLabel();
      if (now < rec.nextMaintenanceAt) return;
      rec.maintenanceUntil = now + W.maintenanceS;
      rec.maintenanceSeq += 1;
      rec.nextMaintenanceAt = rec.maintenanceUntil + W.maintenancePeriodS
        + (hash32('g3:maint', rec.maintenanceSeq) % W.maintenanceJitterS);
      this._popup(`gate3_blind_${rec.maintenanceSeq}`, 'traffic',
        this._fmt(W.blindOpen, { s: Math.round(W.maintenanceS) }));
      this.bus?.emit('gateThree:maintenance', { seq: rec.maintenanceSeq, until: rec.maintenanceUntil, tick: s.tick });
      this._syncLabel();
    },

    // ── Bond windows ────────────────────────────────────────────────────────────
    _tickBond(s, rec, now) {
      const bond = rec.bond;
      if (!bond || now < bond.expiresAt) return;
      rec.bond = null;                                  // the lapse is latched first
      const rebate = bond.finesDuring === 0 && !rec.rebates.includes(bond.receipt);
      if (rebate) {
        rec.rebates.push(bond.receipt);                 // a rebate can never pay twice —
        while (rec.rebates.length > REBATE_CAP) rec.rebates.shift(); // not even across a save
        this.bus?.emit('economy:grantCredits', { amount: W.bondRebateCr, reason: 'bond:gate3-return' });
        this.bus?.emit('faction:repDelta', {
          factionId: W.factionId, delta: W.bondRep, reason: 'gate3:bond_clean',
        });
      }
      this._popup(`gate3_bond_lapsed_${bond.receipt}`, 'traffic',
        this._fmt(rebate ? W.bondLapsed : W.bondLapsedSpent,
          { receipt: bond.receipt, rebate: W.bondRebateCr }));
      this.bus?.emit('gateThree:bondLapsed', {
        receipt: bond.receipt, rebated: rebate, finesDuring: bond.finesDuring, tick: s.tick,
      });
    },

    // ── The lane census: every hull submits on the same law ─────────────────────
    _tickLane(s, rec, now, playerId) {
      let issued = 0;
      const hold = { x: W.post.x + W.holdOffset.x, z: W.post.z + W.holdOffset.z };
      for (const e of s.entityList || []) {
        if (!gateThreeLaneShip(e, playerId)) continue;
        // Lane bookkeeping lives on the hull's own data — a frozen or non-object
        // authored template can never carry it, so that hull simply never books.
        let d = e.data;
        if (!d || typeof d !== 'object') { e.data = d = {}; }
        else if (Object.isFrozen(d)) continue;
        const px = Number.isFinite(d.g3px) && Number.isFinite(d.g3pz) ? { x: d.g3px, z: d.g3pz } : null;
        const p = e.pos;
        const entered = gateThreeEntered(px, p);
        // A flagged hull still inside is walked to the hold point through the membrane.
        if (d.g3flagged === true) {
          const pulling = Number.isFinite(d.g3pullUntil) && now < d.g3pullUntil
            && Number.isFinite(p.x) && Number.isFinite(p.z) && gateThreeInWeir(p);
          if (pulling) {
            const dx = hold.x - p.x, dz = hold.z - p.z;
            const len = Math.hypot(dx, dz);
            if (len > 1e-3 && Number.isFinite(e.mass) && e.mass > 0) {
              queuePhysicsImpulse(e, {
                x: (dx / len) * W.lanePullDv * e.mass,
                z: (dz / len) * W.lanePullDv * e.mass,
              }, { tick: s.tick });
            }
          } else {
            d.g3flagged = false;
          }
        }
        if (!entered) {
          if (Number.isFinite(p.x) && Number.isFinite(p.z)) { d.g3px = p.x; d.g3pz = p.z; }
          continue;
        }
        if (issued >= W.laneVerdictsPerCensus) continue; // the baseline stays stale — the
        // crossing re-presents next census rather than being silently swallowed
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) { d.g3px = p.x; d.g3pz = p.z; }
        issued += 1;
        const { verdict } = gateThreeWeigh(e, s.entityList);
        const overT = Math.max(0, Math.round((verdict.overByT || 0) * 10) / 10);
        const flagged = verdict.outcome === 'over_mass';
        if (flagged) { d.g3flagged = true; d.g3pullUntil = now + W.lanePullS; }
        const gen = occupantGenerationOf(e) || 0;
        rec.lane.push({ id: e.id, gen, outcome: flagged ? 'flagged' : 'clean', overT, at: now });
        while (rec.lane.length > W.laneCap) rec.lane.shift();
        if (flagged && now >= rec.laneBarkAt) {
          rec.laneBarkAt = now + W.laneBarkS;
          const tag = (e.data && (e.data.callsign || e.data.name)) || `hull ${e.id}`;
          this._popup(`gate3_lane_${e.id}_${gen}_${rec.seq}`, 'traffic',
            this._fmt(W.laneHeld, { tag, over: overT.toFixed(1) }));
        }
        this.bus?.emit('gateThree:laneWeighed', {
          entityId: e.id, gen, outcome: flagged ? 'flagged' : 'clean', overT, tick: s.tick,
        });
      }
    },

    // ── An open inspection: resolve at the walk's end, or file the run ────────────
    _maybeDeskBusy(s, rec, pos, now) {
      const ins = rec.inspection;
      if (!ins || ins.deskSpoken) return;
      const dx = pos.x - W.post.x, dz = pos.z - W.post.z;
      if (dx * dx + dz * dz > W.counterRadius * W.counterRadius) return;
      ins.deskSpoken = true;
      this._popup(`gate3_deskbusy_${ins.seq}`, 'traffic', W.deskBusy);
    },
    _tickInspection(s, rec, flags, pos, now) {
      const pending = rec.inspection;
      if (!pending) return;
      if (!gateThreeInWeir(pos)) {
        this._resolveRun(s, rec, flags, now);
        return;
      }
      if (now < pending.dueAt) return;
      rec.inspection = null;
      this._applyVerdict(s, rec, flags, pending, now, true);
    },

    /** Weir run: the scale already read the hull — the filing lands unread plus the
     *  runner surcharge, the mark, and the rep note. All latches before the emits. */
    _resolveRun(s, rec, flags, now) {
      const pending = rec.inspection;
      rec.inspection = null;
      rec.runners += 1;
      rec.flaggedUntil = now + W.flaggedS;
      if (flags) flags[W.runFlag] = rec.runners;
      const steps = Math.min(Math.max(0, rec.runners - 1), W.evasionStepCap);
      const surcharge = W.evasionFeeCr + steps * W.evasionStepCr;
      const total = (pending && pending.kind === 'fined' ? Math.max(0, pending.fine) : 0) + surcharge;
      rec.seq += 1;
      const receipt = `44-R${rec.seq}`;
      const row = this._pushLog(rec, {
        seq: rec.seq, at: now, outcome: 'evaded',
        readMassT: pending ? pending.readMassT : 0,
        manifestMassT: pending ? pending.manifestMassT : 0,
        overT: pending ? pending.overT : 0,
        fine: total, receipt, inspected: false, bonded: false,
      });
      this.bus?.emit('economy:chargeCredits', { amount: total, reason: 'fine:gate3-weir-run' });
      this.bus?.emit('faction:repDelta', {
        factionId: W.factionId, delta: W.evasionRepHit, reason: 'gate3:weir_run',
      });
      this._popup(`gate3_run_${receipt}`, 'warning',
        this._fmt(W.evaded, { receipt, fine: total }), { persist: true });
      this.bus?.emit('gateThree:evaded', {
        seq: rec.seq, receipt, overT: row.overT, fine: total,
        runners: rec.runners, flaggedUntil: rec.flaggedUntil, tick: s.tick,
      });
      this.bus?.emit('gateThree:logged', { row: { ...row }, tick: s.tick });
    },

    // ── The counter ring: dwell at lane speed for one action per approach ────────
    _tickDesk(s, rec, flags, player, pos, dt, now) {
      const pflags = player.flags;
      const docked = (pflags && pflags.docked === true) || (s.ui && s.ui.docked === true);
      if (docked) { rec.deskDwell = 0; rec.deskLatched = false; return; }
      const dx = pos.x - W.post.x, dz = pos.z - W.post.z;
      const inside = dx * dx + dz * dz <= W.counterRadius * W.counterRadius;
      const speed = Math.hypot(finiteNum(player.vel && player.vel.x), finiteNum(player.vel && player.vel.z));
      const still = inside && speed <= W.deskSpeedMax;
      if (!still) { rec.deskDwell = 0; rec.deskLatched = false; return; }
      if (rec.deskLatched) return;
      rec.deskDwell += (Number.isFinite(dt) && dt > 0) ? dt : 0;
      if (rec.deskDwell < W.deskDwellS) return;
      rec.deskLatched = true;                           // one action per approach
      this._deskAction(s, rec, flags, player, now);
    },
    _deskAction(s, rec, flags, player, now) {
      // The freshest open REF is the first order of business.
      let row = null;
      for (let i = rec.log.length - 1; i >= 0; i--) {
        const r = rec.log[i];
        if (r.outcome === 'fined' && r.fine > 0 && !r.contested) { row = r; break; }
      }
      if (row) { this._contestFine(s, rec, flags, row, now); return; }
      const bondLive = rec.bond && now < rec.bond.expiresAt;
      if (bondLive) {
        this._popup(`gate3_bondlive_${rec.bond.receipt}`, 'traffic',
          this._fmt(W.bondLive, {
            receipt: rec.bond.receipt,
            mins: Math.max(0, Math.round((rec.bond.expiresAt - now) / 60)),
          }));
        return;
      }
      if (rec.flaggedUntil > now) {
        this._popup(`gate3_bondmarked_${rec.seq}_${s.tick || 0}`, 'warning', W.bondMarked);
        return;
      }
      this._sellBond(s, rec, flags, now);
    },
    /** Dree overturns desk-error fines; Hale upholds the rest and prices the counter. */
    _contestFine(s, rec, flags, row, now) {
      const receipt = row.receipt || `44-C${row.seq}`;
      if (row.overT <= W.contestMercyT) {
        row.contested = 'overturned';
        if (flags) flags[W.contestWonFlag] = (Number(flags[W.contestWonFlag]) || 0) + 1;
        this.bus?.emit('economy:grantCredits', { amount: row.fine, reason: 'refund:gate3-ref44c' });
        this.bus?.emit('faction:repDelta', {
          factionId: W.factionId, delta: W.contestRepUp, reason: 'gate3:contest_won',
        });
        this._popup(`gate3_contest_${receipt}`, 'traffic',
          this._fmt(W.contestOverturned, { receipt, over: (row.overT || 0).toFixed(1), fine: row.fine }));
        this.bus?.emit('gateThree:contested', {
          receipt, verdict: 'overturned', overT: row.overT, fine: row.fine, tick: s.tick,
        });
        return;
      }
      row.contested = 'upheld';
      this.bus?.emit('economy:chargeCredits', { amount: W.contestFeeCr, reason: 'fee:gate3-contest' });
      this.bus?.emit('faction:repDelta', {
        factionId: W.factionId, delta: W.contestRepDown, reason: 'gate3:contest_denied',
      });
      this._popup(`gate3_contest_${receipt}`, 'warning',
        this._fmt(W.contestUpheld, { receipt, over: (row.overT || 0).toFixed(1), fee: W.contestFeeCr }));
      this.bus?.emit('gateThree:contested', {
        receipt, verdict: 'upheld', overT: row.overT, fine: row.fine, fee: W.contestFeeCr, tick: s.tick,
      });
    },
    /** The Transit Bond sale: the record only writes inside the exact-charge commit,
     *  so a bond is never granted without its fee landing — and the denial line is
     *  what a short purse hears. */
    _sellBond(s, rec, flags, now) {
      const credits = s.player && Number.isFinite(s.player.credits) ? s.player.credits : null;
      if (credits == null || credits < W.bondFeeCr) {
        this._popup(`gate3_bonddenied_${rec.seq}_${s.tick || 0}`, 'warning',
          this._fmt(W.bondDenied, { fee: W.bondFeeCr }));
        return;
      }
      const payload = {
        amount: W.bondFeeCr, reason: 'service:gate3-bond', requireFull: true,
        expectedCredits: credits,
        commit: () => {
          rec.seq += 1;
          rec.bond = {
            receipt: `TB-${rec.seq}`, issuedAt: now,
            expiresAt: now + W.bondValidS, fee: W.bondFeeCr, finesDuring: 0,
          };
          return true;
        },
      };
      this.bus?.emit('economy:chargeCredits', payload);
      if (payload.result !== true) {
        this._popup(`gate3_bonddenied_${rec.seq}_${s.tick || 0}`, 'warning',
          this._fmt(W.bondDenied, { fee: W.bondFeeCr }));
        return;
      }
      if (flags) flags[W.bondCountFlag] = (Number(flags[W.bondCountFlag]) || 0) + 1;
      this._popup(`gate3_bond_${rec.bond.receipt}`, 'traffic',
        this._fmt(W.bondWritten, {
          receipt: rec.bond.receipt, fee: W.bondFeeCr,
          mins: Math.round(W.bondValidS / 60), rebate: W.bondRebateCr,
        }));
      this.bus?.emit('gateThree:bonded', {
        receipt: rec.bond.receipt, fee: W.bondFeeCr, expiresAt: rec.bond.expiresAt, tick: s.tick,
      });
    },

    // ── A fresh submission: blind window, inspection hold, or the verdict itself ─
    _crossing(s, rec, flags, player, now) {
      rec.crossings += 1;
      if (now < rec.maintenanceUntil) {
        rec.seq += 1;
        const row = this._pushLog(rec, {
          seq: rec.seq, at: now, outcome: 'blind',
          readMassT: 0, manifestMassT: 0, overT: 0, fine: 0,
          inspected: false, bonded: false,
        });
        this._popup(`gate3_blind_${rec.maintenanceSeq}_${rec.seq}`, 'traffic', W.blindTransit);
        this.bus?.emit('gateThree:weighed', {
          outcome: 'blind', readMassT: 0, manifestMassT: 0, overT: 0, fine: 0,
          held: false, bonded: false, tick: s.tick,
        });
        this.bus?.emit('gateThree:logged', { row: { ...row }, tick: s.tick });
        return;
      }
      const { verdict, manifestMassT } = gateThreeWeigh(player, s.entityList);
      const outcome = gateThreeOutcome(verdict, flags[W.waveFlag] === true);
      const snap = {
        kind: outcome.kind,
        overT: Math.max(0, outcome.overT || 0),
        fine: Math.max(0, outcome.fine || 0),
        readMassT: finiteNum(verdict.readMassT),
        manifestMassT: finiteNum(manifestMassT),
      };
      if (this._ordersHold(s, rec, now)) {
        rec.seq += 1;
        rec.inspection = {
          seq: rec.seq, dueAt: now + W.inspectS, kind: snap.kind,
          overT: snap.overT, fine: snap.fine,
          readMassT: snap.readMassT, manifestMassT: snap.manifestMassT,
          deskSpoken: false,
        };
        flags[W.inspectFlag] = (Number(flags[W.inspectFlag]) || 0) + 1;
        this._popup(`gate3_hold_${rec.seq}`, 'warning', W.hold);
        this.bus?.emit('gateThree:inspection', {
          seq: rec.seq, dueAt: rec.inspection.dueAt, kind: snap.kind, tick: s.tick,
        });
        return;
      }
      this._applyVerdict(s, rec, flags, snap, now, false);
    },
    /** The verdict lands: latch every once-only outcome, then emit. Shared by the
     *  immediate read and the end of an inspection walk (held === true). */
    _applyVerdict(s, rec, flags, snap, now, held) {
      rec.seq += 1;
      let charged = 0;
      let bonded = false;
      if (snap.kind === 'waived') {
        flags[W.waveFlag] = true;
      } else if (snap.kind === 'fined') {
        flags[W.countFlag] = (Number(flags[W.countFlag]) || 0) + 1;
        bonded = !!(rec.bond && now < rec.bond.expiresAt);
        charged = Math.max(1, Math.round(snap.fine * (1 - this._fineDiscount(s, rec, now))));
        if (bonded) rec.bond.finesDuring += 1;
      }
      const receipt = snap.kind === 'fined' ? `44-C${rec.seq}` : null;
      const row = this._pushLog(rec, {
        seq: rec.seq, at: now, outcome: snap.kind,
        readMassT: snap.readMassT, manifestMassT: snap.manifestMassT,
        overT: snap.overT, fine: charged, receipt,
        inspected: held === true, bonded,
      });
      if (snap.kind === 'fined') {
        this.bus?.emit('economy:chargeCredits', { amount: charged, reason: 'fine:gate3-ref44c' });
      }
      const fmt = (tpl) => this._fmt(tpl, {
        read: (snap.readMassT || 0).toFixed(1),
        manifest: (snap.manifestMassT || 0).toFixed(1),
        over: (snap.overT || 0).toFixed(1),
        fine: String(charged),
      });
      this._popup(`gate3_verdict_${s.tick || 0}`, snap.kind === 'clean' ? 'traffic' : 'warning',
        (held ? W.heldPrefix : '') + fmt(snap.kind === 'clean' ? W.clean
          : snap.kind === 'waived' ? W.waived : W.fined),
        { ttl: 9, persist: snap.kind !== 'clean' });
      this.bus?.emit('gateThree:weighed', {
        outcome: snap.kind, readMassT: snap.readMassT, manifestMassT: snap.manifestMassT,
        overT: snap.overT, fine: charged, receipt,
        held, bonded,
        waived: flags[W.waveFlag] === true,
        finesFiled: Number(flags[W.countFlag]) || 0,
      });
      this.bus?.emit('gateThree:logged', { row: { ...row }, tick: s.tick });
    },
  };
}

export const gateThreeWeir = createGateThreeWeir();
