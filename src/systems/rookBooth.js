// W-CAST-HANDS (row 542, 03 §4.1): Rook's bounty booth — the canon hook "bounties he
// double-bills; physical bounty delivery (tow the wreck to his booth)". A pad ring off
// the Expanse Refinery dock in Charon buys wreck hulls by the mass: rest an eligible
// wreck inside the ring and the book pays once, logs it twice, and takes the hull.
//
// WHAT THIS OWNS — one persistent beacon marking the pad (spawned/cleared on the same
// event-driven seams as every one-off: init/sector-enter-deferred/save:loaded/newGame)
// plus the calendar delivery pass. Delivery law is the cradle's: inside the ring AND
// at rest — a fast pass is a flyby, not a sale. The credit grant goes through the
// economy:grantCredits single-writer event; the wreck leaves through removeEntity.
//
// RECEIPTS — the delivery count lives in state.story.flags (serialized wholesale, no
// schema work); the announce flag files once ever so the first Charon visit is the only
// time the booth explains itself. Each sale emits rookWreck:delivered for observability.

import { ROOK_BOOTH } from '../data/rook.js';
import { rookBoothEligible, rookDeliveryCheck, rookPayoutCr } from '../characters/rookRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function rookBoothSpec() {
  return {
    type: 'beacon',
    pos: { ...ROOK_BOOTH.pad }, vel: { x: 0, z: 0 },
    radius: 12, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: ROOK_BOOTH.sectorId,
    data: {
      rookBooth: true, parentType: 'story_prop',
      scanLabel: "Rook's pad · hulls bought by mass",
      scannerSignalKind: 'salvage',
      homeSectorId: ROOK_BOOTH.sectorId,
    },
  };
}

export function createRookBooth() {
  return {
    name: 'rookBooth',
    init(ctx) {
      // Singleton re-init retires the old listener set and provider first (ravel/docket law).
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => this._sync());
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
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
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure(s = this.state) {
      const run = s?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && s?.world?.currentSectorId === ROOK_BOOTH.sectorId;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.rookBooth === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.rookBooth === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(rookBoothSpec());
      const flags = this._flags();
      if (flags && flags[ROOK_BOOTH.announceFlag] !== true) {
        flags[ROOK_BOOTH.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'rook_booth_announce', sender: ROOK_BOOTH.sender, category: 'story',
          text: ROOK_BOOTH.announce, ttl: 9, persist: false,
        });
      }
    },
    /** The calendar delivery pass: any eligible wreck at rest inside the ring is a sale
     *  — towed, shoved or drifted, the book does not ask how it got there. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure(s)) return;
      // No take, no pay: without the removal seam the latch would swallow the hull and the
      // grant would land on a body still sitting in the ring.
      if (typeof this.helpers?.removeEntity !== 'function') return;
      const flags = this._flags();
      if (!flags) return;
      for (const e of s.entityList || []) {
        if (!rookBoothEligible(e)) continue;
        const check = rookDeliveryCheck(e);
        if (!check.arrived) continue;
        const d = e.data || (e.data = {});
        d.rookClaimed = true;
        const payout = rookPayoutCr(e.mass);
        const count = (Number(flags[ROOK_BOOTH.countFlag]) || 0) + 1;
        flags[ROOK_BOOTH.countFlag] = count;
        this.bus?.emit('economy:grantCredits', { amount: payout, reason: 'rook:booth' });
        this.bus?.emit('comms:popup', {
          id: `rook_receipt_${e.id}`, sender: ROOK_BOOTH.sender, category: 'story',
          text: (count === 1 ? ROOK_BOOTH.firstReceipt : ROOK_BOOTH.receipt).replace('{cr}', String(payout)),
          ttl: 8, persist: false,
        });
        this.bus?.emit('rookWreck:delivered', {
          entityId: e.id, mass: e.mass, payoutCr: payout, count,
          pos: { x: e.pos.x, z: e.pos.z },
        });
        // The booth takes the hull through the canonical consumption receipt, not a silent
        // delete: a durable aftermath marker retires on salvage:completed instead of
        // rematerializing the sold body on the next enter (the respawn would return
        // latch-free — an infinite re-sell), and every other listener (recovery calls,
        // law discovery, world pressure) settles the wreck like a strip did.
        this.bus?.emit('salvage:completed', {
          wreckId: e.id,
          markerId: d.markerId || (d.provenance && d.provenance.markerId) || null,
          loot: {},
          pos: { x: e.pos.x, z: e.pos.z },
          radius: Number.isFinite(e.radius) ? e.radius : 0,
          source: 'rook:booth',
        });
        this.helpers.removeEntity(e.id);
      }
    },
  };
}

export const rookBooth = createRookBooth();
