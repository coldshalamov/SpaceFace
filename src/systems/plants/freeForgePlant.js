// PL-331 The free forge — "Feed the Forge scrap you scrounged off the floor — never bought — and
// one upgrade runs free. Earn the free slot; or buy your way to it — scrounged means scrounged,
// and the Forge knows its ledger."
//
// The Forge is the floor's own furnace room solid (data.roomKind 'furnace',
// src/systems/survivalArena.js:323 — helios fire phases; with no furnace on the floor the row is
// honestly inert). Scrounging is collecting a floor drop (swarm:dropCollected) close enough to
// the furnace to count as feeding it. Three feeds earn the free slot: the NEXT accepted purchase
// (run:purchaseResolved, `accepted` — runSession.js:334) is refunded in floor-scrap credit chips
// minted at your hull, wallet 'run' — the upgrade runs free through the ordinary pickup route.
// Buy before you have earned it and the ledger refuses: the free slot never arms this run.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
//   The refund is ordinary 'pickup' credit-chip bodies (wallet 'run'), never a wallet write.
// - Bounded state; one free slot per run; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_FREE_FORGE_EVENT = 'plants:freeForge';

export const FREE_FORGE_TUNING = Object.freeze({
  plId: 'pl331',
  feedsForFree: 3,
  forgeRangeWu: 200,          // feeding distance from the furnace solid
  refundPickups: 4,
  refundTtlS: 30,
  refundEjectWuS: 22,
  furnaceScanCap: 32,
  memoryCap: 8,
});

/** Pure: is the free slot earned? */
export function forgeArmed(feeds, boughtFirst, tuning = FREE_FORGE_TUNING) {
  return feeds >= tuning.feedsForFree && !boughtFirst;
}

/** Pure: how the refund splits into chips. */
export function refundSplit(totalCredits, parts, tuning = FREE_FORGE_TUNING) {
  const total = Number.isFinite(totalCredits) && totalCredits > 0 ? Math.floor(totalCredits) : 0;
  const n = Number.isFinite(parts) && parts > 0 ? Math.floor(parts) : 1;
  const each = Math.max(1, Math.ceil(total / n));
  return Array.from({ length: n }, () => each);
}

/** Pure: the ledger's word. */
export function ledgerVerdict({ boughtFirst = false, armed = false, given = false } = {}) {
  if (given) return 'spent';
  if (armed) return 'free_slot';
  return boughtFirst ? 'refused' : 'watching';
}

export const freeForgePlant = {
  name: 'plants331',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('swarm:dropCollected', (p) => this._onDropCollected(p));
    on('run:purchaseResolved', (p) => this._onPurchase(p));
    on('run:ended', () => this._reset());
  },

  update() { /* event-driven; the ledger only moves on drops and purchases */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetRun();
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _resetRun() {
    this._feeds = 0;
    this._boughtFirst = false;
    this._armed = false;
    this._given = false;
    this._refusedReported = false;
  },

  _reset() {
    this._resetRun();
  },

  _furnace() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= FREE_FORGE_TUNING.furnaceScanCap * 4) return null;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'furnace') continue; // the room solid the Forge fiction lives on
      return e;
    }
    return null;
  },

  _onDropCollected(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (this._given || this._armed) return; // the ledger needs no more feeding
    const player = this._player();
    if (!player || !player.pos) return;
    const furnace = this._furnace();
    if (!furnace || !furnace.pos) return; // no Forge on this floor: honestly inert
    const dx = player.pos.x - furnace.pos.x;
    const dz = player.pos.z - furnace.pos.z;
    if (dx * dx + dz * dz > FREE_FORGE_TUNING.forgeRangeWu * FREE_FORGE_TUNING.forgeRangeWu) return;
    this._feeds += 1;
    this.bus.emit(PLANTS_FREE_FORGE_EVENT, {
      kind: 'scrap_fed', feeds: this._feeds, dropId: payload.dropId != null ? payload.dropId : null, t: this._now(),
    });
    if (forgeArmed(this._feeds, this._boughtFirst)) {
      this._armed = true;
      this.bus.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: furnace.pos.x, z: furnace.pos.z }, gain: 0.4, rate: 1.2 });
      this.bus.emit(PLANTS_FREE_FORGE_EVENT, {
        kind: 'free_slot_earned', feeds: this._feeds, t: this._now(),
      });
    }
  },

  _onPurchase(receipt) {
    const run = this._liveRun();
    if (!run || !receipt || receipt.accepted !== true) return;
    if (this._armed && !this._given) {
      // One upgrade runs free: the cost comes back as scrounged floor chips at your hull.
      const refunded = this._mintRefund(receipt.credits, run);
      if (refunded > 0) {
        this._given = true;
        this.bus.emit(PLANTS_FREE_FORGE_EVENT, {
          kind: 'upgrade_free',
          requestId: receipt.requestId,
          refundedCredits: refunded,
          t: this._now(),
        });
        return;
      }
    }
    if (!this._armed && !this._boughtFirst && !this._given) {
      // Buy your way to it: scrounged means scrounged, and the Forge knows its ledger.
      // A purchase made while you were mid-feed is the tell; the ledger refuses audibly.
      this._boughtFirst = true;
      if (this._feeds > 0 && !this._refusedReported) {
        this._refusedReported = true;
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.35, rate: 1 });
        this.bus.emit(PLANTS_FREE_FORGE_EVENT, {
          kind: 'ledger_refused', requestId: receipt.requestId, t: this._now(),
        });
      }
    }
  },

  _mintRefund(totalCredits, run) {
    const player = this._player();
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (!player || !player.pos || typeof spawnEntity !== 'function') return 0;
    const total = Number.isFinite(totalCredits) && totalCredits > 0 ? Math.floor(totalCredits) : 0;
    if (total <= 0) return 0;
    const now = this._now();
    const chips = refundSplit(total, FREE_FORGE_TUNING.refundPickups);
    let minted = 0;
    chips.forEach((each, i) => {
      const angle = ((hash32(String(run.seed), this.state.tick, 'pl331', i) % 6283) / 1000);
      const spawned = spawnEntity({
        type: 'pickup',
        pos: { x: player.pos.x + Math.cos(angle) * 12, z: player.pos.z + Math.sin(angle) * 12 },
        vel: { x: Math.cos(angle) * FREE_FORGE_TUNING.refundEjectWuS, z: Math.sin(angle) * FREE_FORGE_TUNING.refundEjectWuS },
        radius: 5,
        mass: 0.1,
        collides: true,
        data: {
          kind: 'scrap',
          amount: 1,
          credits: each,
          wallet: 'run',
          grantReason: 'plants:pl331:free_forge',
          swarmFloorPad: { label: 'FORGE SCRAP' },
          despawnAt: now + FREE_FORGE_TUNING.refundTtlS,
          plants: { [FREE_FORGE_TUNING.plId]: { role: 'forge_refund' } },
        },
      });
      const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (id != null) minted += each;
    });
    return minted;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
