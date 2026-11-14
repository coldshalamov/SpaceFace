// PL-371 The lane tithe — "Haulers who use your freight lane start leaving their overloads in
// your hopper on the way through — a quiet tithe of the road, nobody discusses it | Let the
// tithes lie; or bill them for the lane — they route around you, and the lane goes quiet in a week"
//
// Seam (verified): hauler unload receipts arrive on the bus as `npcjobs:unload` intents
// (src/systems/npcJobsRuntime.js emits intent.event verbatim; traffic.js and
// trafficConvoyOps.js both consume it). An unload receipt whose position falls within the
// claim's lane radius is a hauler passing through YOUR lane — the overload they leave is a
// REAL cargo pod spawned through spawnJettisonedCargoPod (src/systems/lootShards.js): persistent,
// physics-massed, collectible on the ordinary pickup route. Letting the tithes lie = leaving
// the pods in the hopper. Billing = the yard owner's economy:chargeCredits receipt whose reason
// reads as a lane toll (read-only observation; this module never charges or grants credits).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned pods, clears bounded Maps.
// - One tithe per hauler pass: titheCooldownS gates the hopper so a convoy does not stack pods.
// - Bounded hopper: at most podMax live tithe pods; the oldest is retired first.
// - Billing is durable (flag `plantsPl371Billed`): new tithes stop at once; the lane goes
//   fully quiet exactly one week (quietAfterS) after the first billed receipt.
// - No economy mutation here: the tithe is physical pods, the bill is another system's receipt.

import { spawnJettisonedCargoPod } from '../../lootShards.js';
import { hash32 } from '../../../core/rng.js';

export const PL_371_TITHE_EVENT = 'plants:pl371:tithe';
export const PL_371_BILLED_EVENT = 'plants:pl371:billed';
export const PL_371_QUIET_EVENT = 'plants:pl371:quiet';

export const LANE_TITHE_TUNING = Object.freeze({
  hopperOffsetWu: 34,         // the hopper stands just off the claim body
  laneRadiusWu: 420,          // unload receipts inside this are "on the way through"
  titheCooldownS: 45,         // one tithe per pass; a convoy does not stack the hopper
  quietAfterS: 7 * 240,       // "the lane goes quiet in a week" (240 s day)
  podMax: 4,                  // bounded live tithe pods
  billReasons: ['toll', 'bill', 'lane', 'levy'],
  titheCmdtys: ['cmdty_scrap_metal', 'cmdty_alloys', 'cmdty_salvage_electronics'],
  titheAmount: 2,             // an overload, not a fortune
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_371_BILLED_FLAG = 'plantsPl371Billed';
export const PL_371_FIRST_TITHE_FLAG = 'plantsPl371FirstTithe';

/** Pure: does this economy:chargeCredits receipt read as billing haulers for the lane? */
export function isLaneBillingReceipt(payload, t = LANE_TITHE_TUNING) {
  const amount = Number(payload && payload.amount);
  const reason = String((payload && payload.reason) || '').toLowerCase();
  if (!(amount > 0)) return false;
  return t.billReasons.some((word) => reason.includes(word));
}

/** Pure: pull a usable position out of an npcjobs:unload intent receipt (defensive by design). */
export function unloadPosOf(payload) {
  const p = payload || {};
  const cands = [p.pos, p.at, p.payload && p.payload.pos, p.payload && p.payload.at];
  for (const c of cands) {
    const x = Number(c && c.x);
    const z = Number(c && c.z);
    if (Number.isFinite(x) && Number.isFinite(z)) return { x, z };
  }
  return null;
}

/** Pure: the tithe pick for a hauler pass — deterministic per pass, never repeated twice alike. */
export function titheCommodityFor(jobId, t = LANE_TITHE_TUNING) {
  const roll = hash32('plantsPl371Tithe', String(jobId));
  return t.titheCmdtys[roll % t.titheCmdtys.length];
}

export function createPl371LaneTithe() {
  return {
    name: 'plantsPl371',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._claim = null;
      this._podIds = [];
      this._lastTitheAt = -Infinity;
      this._billedAt = null;
      this._quietAt = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('npcjobs:unload', (p = {}) => this._onUnload(p));
      on('economy:chargeCredits', (p = {}) => this._onBilling(p));
      on('save:loaded', () => this._resyncFromFlags());
      on('game:newGame', () => this._hardReset());
      this._resyncFromFlags();
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') for (const id of this._podIds || []) rm(id);
      this._podIds = [];
      this._claim = null;
      this._lastTitheAt = -Infinity;
      this._billedAt = null;
      this._quietAt = null;
    },

    _hardReset() { this._resetSession(); },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _resyncFromFlags() {
      // Live pods do not survive a load; the billing verdict does.
      this._podIds = [];
      this._billedAt = this._flags()?.[PL_371_BILLED_FLAG] === true ? this._now() : null;
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._claim = { bodyId: body.id ?? payload.bodyId ?? null, x, z };
    },

    _onUnload(payload) {
      if (!this._claim) return;
      const flags = this._flags();
      if (flags?.[PL_371_BILLED_FLAG] === true) return; // billed: they route around you
      const now = this._now();
      if (now - this._lastTitheAt < LANE_TITHE_TUNING.titheCooldownS) return;
      const pos = unloadPosOf(payload);
      if (!pos) return;
      const dx = pos.x - this._claim.x;
      const dz = pos.z - this._claim.z;
      if (dx * dx + dz * dz > LANE_TITHE_TUNING.laneRadiusWu * LANE_TITHE_TUNING.laneRadiusWu) return;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      this._lastTitheAt = now;
      // Bound the hopper: retire the oldest tithe pod first.
      if (this._podIds.length >= LANE_TITHE_TUNING.podMax) {
        const oldest = this._podIds.shift();
        this.helpers?.removeEntity?.(oldest);
      }
      const hopper = {
        x: this._claim.x + LANE_TITHE_TUNING.hopperOffsetWu,
        z: this._claim.z + LANE_TITHE_TUNING.hopperOffsetWu * 0.3,
      };
      const cmdty = titheCommodityFor(payload.jobId ?? payload.payload?.jobId ?? now);
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId: cmdty,
        amount: LANE_TITHE_TUNING.titheAmount,
        pos: hopper,
        vel: { x: 0, z: 0 },
        radius: 3,
        ownerId: null,
        ownerName: 'The road',
      }, this.helpers);
      if (!pod || pod.id == null) return;
      pod.data = pod.data || {};
      pod.data.plantsPl371Tithe = true;
      pod.data.scanLabel = 'An overload, left in your hopper. Nobody discusses it.';
      this._podIds.push(pod.id);
      const first = flags && flags[PL_371_FIRST_TITHE_FLAG] !== true;
      if (flags) flags[PL_371_FIRST_TITHE_FLAG] = true;
      if (first) {
        this.bus?.emit('comms:popup', {
          id: `plants:pl371:first:${Math.round(now)}`,
          sender: 'The road',
          category: 'story',
          text: 'Overload left. Nobody discusses it.',
          ttl: 8,
          persist: false,
        });
      }
      this.bus?.emit(PL_371_TITHE_EVENT, {
        podId: pod.id,
        commodityId: cmdty,
        amount: LANE_TITHE_TUNING.titheAmount,
        pos: hopper,
        t: now,
      });
    },

    _onBilling(payload) {
      if (!this._claim) return;
      const flags = this._flags();
      if (!flags || flags[PL_371_BILLED_FLAG] === true) return;
      if (!isLaneBillingReceipt(payload)) return;
      const now = this._now();
      flags[PL_371_BILLED_FLAG] = true; // durable: new tithes stop; the week starts here
      this._billedAt = now;
      this.bus?.emit(PL_371_BILLED_EVENT, { t: now });
    },

    update() {
      // The lane goes quiet exactly one week after the first billed receipt.
      if (this._billedAt != null && this._quietAt == null
        && this._now() >= this._billedAt + LANE_TITHE_TUNING.quietAfterS) {
        this._quietAt = this._now();
        this.bus?.emit('comms:popup', {
          id: `plants:pl371:quiet:${Math.round(this._quietAt)}`,
          sender: 'The lane',
          category: 'story',
          text: 'They route around you now.',
          ttl: 9,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_371_QUIET_EVENT, { t: this._quietAt });
      }
    },
  };
}

export const pl371LaneTithe = createPl371LaneTithe();
