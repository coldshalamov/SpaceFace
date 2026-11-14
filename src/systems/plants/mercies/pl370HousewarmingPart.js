// PL-370 The housewarming part — "The first stranger to dock at your new yard leaves a good part
// wedged in your airlock frame, no note | Keep it mounted; or charge visitors docking fees from
// day one — gifts stop, fees don't"
//
// Seam (verified): the "first stranger" is the first caller's first visit — PL-146's exported
// PL_146_CALL_EVENT { visit, pos } (src/systems/plants/pl146FirstCaller.js). The part is a REAL
// physical prop wedged off the claim body: tetherable, persistent residency, collectible only by
// physically towing it away (masslineTetherable). Keeping it mounted = leaving it at its wedge.
// The wrong choice is observed, not invented: a yard owner charging docking fees shows up as an
// economy:chargeCredits receipt (the canonical credits intent event — gate tolls and the claim
// charter already charge through it, src/core/registry.js, src/systems/claims.js) whose reason
// reads as a dock/toll/berth fee. This module only LISTENS; it never charges or grants credits.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM. The sim stamps numbers and spawns props; presentation reads them.
// - Session state on `this`; destroy() unsubscribes every listener, removes owned entities,
//   clears bounded Maps. Durable facts ride story flags (`plantsPl370*`).
// - One part per yard; the gift stops permanently at the first fee receipt (durable flag).
// - No economy mutation here: gifts are physical props, fees are another system's receipt.

import { PL_146_CALL_EVENT } from '../pl146FirstCaller.js';

export const PL_370_PART_EVENT = 'plants:pl370:part';
export const PL_370_KEPT_EVENT = 'plants:pl370:kept';
export const PL_370_FEES_EVENT = 'plants:pl370:fees';

export const HOUSEWARMING_TUNING = Object.freeze({
  partOffsetWu: 18,           // wedged in the airlock frame: just off the hull
  keepConfirmS: 240,          // one in-world day still mounted = kept
  takeRangeWu: 60,            // towed beyond this from the wedge = taken, not kept
  feeReasons: ['toll', 'dock', 'docking', 'berth', 'fee'], // reason substrings that read as fees
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_370_PART_TAKEN_FLAG = 'plantsPl370PartTaken';
export const PL_370_FEES_FLAG = 'plantsPl370FeesCharged';
export const PL_370_GIFT_DONE_FLAG = 'plantsPl370GiftDone';

/** Pure: does this economy:chargeCredits receipt read as a visitor docking fee? */
export function isDockingFeeReceipt(payload, t = HOUSEWARMING_TUNING) {
  const amount = Number(payload && payload.amount);
  const reason = String((payload && payload.reason) || '').toLowerCase();
  if (!(amount > 0)) return false;
  return t.feeReasons.some((word) => reason.includes(word));
}

/** Pure: the wedged part's prop spec — a tetherable story prop at the airlock frame. */
export function housewarmingPartSpec(claim, t = HOUSEWARMING_TUNING) {
  return {
    type: 'beacon',
    pos: { x: claim.x + t.partOffsetWu, z: claim.z + t.partOffsetWu * 0.4 },
    vel: { x: 0, z: 0 },
    radius: 4,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_housewarming_part',
      plantsPl370Part: true,
      scanLabel: 'A good part, wedged in your airlock frame. No note.',
      swarmFloorPad: { label: 'Housewarming part' },
      masslineTetherable: true,
      wedgedAt: { x: claim.x + t.partOffsetWu, z: claim.z + t.partOffsetWu * 0.4 },
    },
  };
}

export function createPl370HousewarmingPart() {
  return {
    name: 'plantsPl370',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._claim = null;
      this._partId = null;
      this._keptAt = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on(PL_146_CALL_EVENT, (p = {}) => this._onFirstStranger(p));
      on('economy:chargeCredits', (p = {}) => this._onFeeReceipt(p));
      on('entity:killed', (p = {}) => this._onPartDestroyed(p));
      on('sector:exit', () => { this._claim = this._claim; /* claim persists across sectors */ });
      on('save:loaded', () => this._resyncFromFlags());
      on('game:newGame', () => this._hardReset());
      this._resyncFromFlags();
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._removeOwned();
      this._claim = null;
      this._keptAt = null;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _removeOwned() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm !== 'function') return;
      if (this._partId != null) rm(this._partId);
      this._partId = null;
    },

    _hardReset() {
      this._removeOwned();
      this._claim = null;
      this._keptAt = null;
    },

    _resyncFromFlags() {
      // The physical part does not survive a load; the durable facts do.
      this._partId = null;
      const flags = this._flags();
      if (flags?.[PL_370_GIFT_DONE_FLAG] === true && this._claim) this._keptAt = this._now();
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._claim = {
        bodyId: body.id ?? payload.bodyId ?? null,
        sectorId: body.sectorId ?? null,
        x, z, at: this._now(),
      };
    },

    _onFirstStranger(payload) {
      if (!this._claim) return;
      if (Number(payload?.visit) !== 1) return; // the FIRST stranger, only ever once
      const flags = this._flags();
      if (!flags || flags[PL_370_GIFT_DONE_FLAG] === true) return;
      if (flags[PL_370_FEES_FLAG] === true) return; // gifts stop, fees don't
      flags[PL_370_GIFT_DONE_FLAG] = true;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._partId != null) return;
      const ent = spawn(housewarmingPartSpec(this._claim));
      if (!ent || ent.id == null) return;
      this._partId = ent.id;
      this._keptAt = null;
      this.bus?.emit('comms:popup', {
        id: `plants:pl370:part:${Math.round(this._now())}`,
        sender: 'The yard',
        category: 'story',
        text: 'Wedged in the frame. No note.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'confirm' });
      this.bus?.emit(PL_370_PART_EVENT, {
        partId: ent.id,
        pos: { x: ent.pos.x, z: ent.pos.z },
        sectorId: this._claim.sectorId,
        t: this._now(),
      });
    },

    _onFeeReceipt(payload) {
      if (!this._claim) return;
      const flags = this._flags();
      if (!flags || flags[PL_370_FEES_FLAG] === true) return;
      if (!isDockingFeeReceipt(payload)) return;
      flags[PL_370_FEES_FLAG] = true; // durable: charging from day one silences givers for good
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl370:fees:${Math.round(now)}`,
        sender: 'The lane',
        category: 'story',
        text: 'Gifts stop. Fees don\u2019t.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_370_FEES_EVENT, { t: now });
    },

    _onPartDestroyed(payload) {
      if (this._partId != null && payload?.id === this._partId) {
        // Cut loose, fed to the works, or shot: taken, not kept.
        this._partId = null;
        const flags = this._flags();
        if (flags) flags[PL_370_PART_TAKEN_FLAG] = true;
        this._keptAt = null;
      }
    },

    _dueKept() {
      if (this._partId == null || this._claim == null || this._keptAt != null) return false;
      const flags = this._flags();
      if (!flags || flags[PL_370_FEES_FLAG] === true) return false;
      const part = this.state?.entities?.get ? this.state.entities.get(this._partId) : null;
      if (!part || part.alive === false) return false;
      const dx = part.pos.x - this._claim.x;
      const dz = part.pos.z - this._claim.z;
      const distSq = dx * dx + dz * dz;
      return distSq <= HOUSEWARMING_TUNING.takeRangeWu * HOUSEWARMING_TUNING.takeRangeWu
        && this._now() >= this._claim.at + HOUSEWARMING_TUNING.keepConfirmS;
    },

    update() {
      if (!this._dueKept()) return;
      this._keptAt = this._now();
      const flags = this._flags();
      if (flags) flags[PL_370_PART_TAKEN_FLAG] = false; // still mounted: kept, not taken
      const now = this._now();
      this.bus?.emit(PL_370_KEPT_EVENT, {
        partId: this._partId,
        pos: this._claim ? { x: this._claim.x, z: this._claim.z } : null,
        sectorId: this._claim ? this._claim.sectorId : null,
        t: now,
      });
    },
  };
}

export const pl370HousewarmingPart = createPl370HousewarmingPart();
