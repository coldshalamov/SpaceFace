// PL-266 Somebody's spare — "Come out of a fight with hull in the red and a passing miner
// tows you a sealed patch kit — no channel, no name, gone before you can thank them."
// What the player can do: Mount it; or hunt them for a second kit — miners watch their
// mirrors.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Traffic ops mixin (hull-to-hull lane reaction): the passing miner is a REAL civilian
//   miner from the traffic dispatch; NPC movement ONLY via requestTrafficReaction. Returns
//   true only while the miner is flying its kit run.
// - "Out of a fight with hull in the red": the real entity:killed receipts near the player
//   (combat memory, bounded) plus the player hull fraction; the kit is a REAL jettisoned
//   cargo pod (persistent, physicsBody mass, tetherable) dropped at the miner's range.
// - Mount it: the real pickup:collected receipt of the kit pod applies the patch (the only
//   direct hull seam outside dock services, as goodPatch). Hunt them: closing on the miner
//   fast after the drop — miners watch their mirrors: they flee hard and nobody drops a kit
//   again for a long grudge.
// - Bounded Maps with tuning.memoryCap; RESET on sector:exit / save:loaded / game:new /
//   game:newGame.

import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_SPARE_KIT_EVENT = 'plants:pl266:kit';
export const PLANTS_SPARE_HUNT_EVENT = 'plants:pl266:hunt';

export const SPARE_KIT_TUNING = Object.freeze({
  plId: 'pl266',
  fightWindowS: 20,          // a kill receipt near you keeps the fight memory this long
  fightRangeWu: 700,
  redFrac: 0.25,             // hull in the red
  dropRangeWu: 70,           // the miner tows you the kit to this range
  huntRangeWu: 60,           // closing this close, this fast, is hunting
  huntSpeedWu: 60,
  huntGrudgeS: 1800,         // miners watch their mirrors
  patchHull: 18,
  kitCommodityId: 'cmdty_crystal_lumin',  // the kit's sealed packing (real commodity)
  kitAmount: 1,
  kitRadius: 4,
  memoryCap: 8,
});

export const PL_266_KIT_STAMP = 'plantsPl266Kit';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: a civilian miner hull (the passing kind). */
export function isMinerHull(e, rec = null, state = null) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
  if (state && e.id === state.playerId) return false;
  const data = e.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  const role = String(
    (rec && rec.role) || data.trafficRole || data.role || (data.ai && (data.ai.role || data.ai.archetype)) || '',
  ).toLowerCase();
  return role.includes('miner') || role.includes('prospector');
}

export const spareKitOps = {
  _initSpareKit() {
    this._kitFightUntil = -Infinity;
    this._kitRun = null;             // { minerId, since, dropped }
    this._kitDroppedAt = -Infinity;
    this._kitDroppedFor = null;      // minerId
    this._kitGrudgeUntil = -Infinity;
    this._kitMemory = new Map();     // minerId -> last kit simTime
    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = bus.on(event, fn);
      if (typeof off === 'function') this._kitUnsubs.push(off);
    };
    this._kitUnsubs = this._kitUnsubs || [];
    on('entity:killed', (p = {}) => {
      const state = this.state;
      if (!state || (state.mode && state.mode !== 'flight')) return;
      const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
      const pos = p.pos || (p.id != null && state.entities && state.entities.get
        ? (state.entities.get(p.id) || {}).pos : null);
      if (!player || !player.pos || !pos) return;
      const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
      if (d <= SPARE_KIT_TUNING.fightRangeWu) {
        this._kitFightUntil = finite(state.simTime, 0) + SPARE_KIT_TUNING.fightWindowS;
      }
    });
    on('pickup:collected', (p = {}) => this._onKitPickup(p));
    on('sector:exit', () => this._resetKit());
    on('save:loaded', () => this._resetKit());
    on('game:new', () => this._resetKit());
    on('game:newGame', () => this._resetKit());
  },

  _resetKit() {
    if (this._kitRun && this.state) {
      const e = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._kitRun.minerId) : null;
      if (e) releaseTrafficReaction(this, e);
    }
    this._kitRun = null;
    this._kitFightUntil = -Infinity;
    this._kitDroppedAt = -Infinity;
    this._kitDroppedFor = null;
    if (this._kitMemory) this._kitMemory.clear();
  },

  /** Mount it: the sealed patch kit goes on — a real hull patch, once per kit. */
  _onKitPickup(p) {
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;
    if (!p || p.collectorId !== state.playerId || p.pickupId == null) return;
    const pod = state.entities && state.entities.get ? state.entities.get(p.pickupId) : null;
    if (!pod || !pod.data || pod.data[PL_266_KIT_STAMP] !== true) return;
    pod.data[PL_266_KIT_STAMP] = 'used';
    const player = state.entities.get(state.playerId);
    if (player && Number.isFinite(player.hullMax) && player.hullMax > 0) {
      player.hull = Math.min(player.hullMax, finite(player.hull, player.hullMax) + SPARE_KIT_TUNING.patchHull);
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_SPARE_KIT_EVENT, { kind: 'mounted', podId: p.pickupId, hull: player ? player.hull : null, t: finite(state.simTime, 0) });
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: a passing miner tows a sealed patch kit to a
   * hull in the red straight out of a fight. Returns true only while this miner flies it.
   */
  _reactSpareKit(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || !e.pos || e.alive === false || e.type !== 'ship') return false;
    if (!player || player.alive === false || !player.pos || !player.vel) return false;
    const now = finite(state.simTime, 0);

    const run = this._kitRun;
    if (run && run.minerId === e.id) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      const aim = Math.atan2(finite(player.pos.z) - finite(e.pos.z), finite(player.pos.x) - finite(e.pos.x));
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: d <= SPARE_KIT_TUNING.dropRangeWu,
      }, 2);
      run.lastAt = now;
      if (!run.dropped && d <= SPARE_KIT_TUNING.dropRangeWu) {
        run.dropped = true;
        this._dropKit(e, player, now);
        // Gone before you can thank them.
        releaseTrafficReaction(this, e);
        this._kitRun = null;
        return false;
      }
      if (now - run.since >= 14) {
        releaseTrafficReaction(this, e);
        this._kitRun = null;
      }
      return true;
    }
    if (run) return false;

    // Hunted: miners watch their mirrors — closing fast after the drop starts the grudge.
    if (this._kitDroppedFor != null && e.id === this._kitDroppedFor
        && now - this._kitDroppedAt <= 30) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
      if (d <= SPARE_KIT_TUNING.huntRangeWu && speed >= SPARE_KIT_TUNING.huntSpeedWu
          && now >= this._kitGrudgeUntil) {
        this._kitGrudgeUntil = now + SPARE_KIT_TUNING.huntGrudgeS;
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
        this.bus.emit(PLANTS_SPARE_HUNT_EVENT, { kind: 'hunted', minerId: e.id, until: this._kitGrudgeUntil, t: now });
      }
      if (d <= SPARE_KIT_TUNING.huntRangeWu * 2 && now < this._kitGrudgeUntil) {
        const away = Math.atan2(finite(e.pos.z) - finite(player.pos.z), finite(e.pos.x) - finite(player.pos.x));
        requestTrafficReaction(this, e, {
          moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: away, brake: false,
        }, 3);
        if (this.bus && typeof this.bus.emit === 'function') {
          const data = e.data || (e.data = {});
          data.lampsFlashing = true;
          data.lampFlashUntil = now + 0.8;
          this.bus.emit(PLANTS_SPARE_HUNT_EVENT, { minerId: e.id, t: now });
        }
        return true;
      }
    }

    if (now < this._kitGrudgeUntil) return false;
    if (now >= this._kitFightUntil) return false;
    const hullMax = finite(player.hullMax, 0);
    if (!(hullMax > 0) || finite(player.hull, hullMax) > hullMax * SPARE_KIT_TUNING.redFrac) return false;
    if (!isMinerHull(e, rec, state)) return false;
    const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
    if (d > SPARE_KIT_TUNING.fightRangeWu) return false;
    const memory = this._kitMemory instanceof Map ? this._kitMemory : (this._kitMemory = new Map());
    const last = memory.get(e.id);
    if (Number.isFinite(last) && now - last < SPARE_KIT_TUNING.huntGrudgeS) return false;
    while (memory.size >= SPARE_KIT_TUNING.memoryCap) memory.delete(memory.keys().next().value);
    memory.set(e.id, now);
    this._kitRun = { minerId: e.id, since: now, dropped: false, lastAt: now };
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SPARE_KIT_EVENT, { kind: 'fell_in', minerId: e.id, t: now });
    }
    return true;
  },

  _dropKit(miner, player, now) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: SPARE_KIT_TUNING.kitCommodityId,
      amount: SPARE_KIT_TUNING.kitAmount,
      radius: SPARE_KIT_TUNING.kitRadius,
      pos: { x: finite(player.pos.x) + 10, z: finite(player.pos.z) + 6 },
      vel: { x: 0, z: 0 },
      ownerId: null,
      ownerName: 'SOMEBODY',
    }, this.helpers);
    if (pod && pod.id != null) {
      pod.data = pod.data || {};
      pod.data[PL_266_KIT_STAMP] = true;
      pod.data.swarmFloorPad = { label: 'SEALED PATCH KIT' };
      pod.data.scanLabel = 'A sealed patch kit, towed over fast — no channel, no name';
    }
    this._kitDroppedAt = now;
    this._kitDroppedFor = miner.id;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SPARE_KIT_EVENT, { kind: 'dropped', minerId: miner.id, podId: pod ? pod.id : null, t: now });
    }
  },
};
