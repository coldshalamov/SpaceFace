// PL-157 The empty berth — "A convoy of three flies with a gap where a fourth should be,
// slowing at every beacon. Fill the gap and the lamps sync. Ride it to the far dock and
// take the fourth's share; or fly sloppy, and be boxed out halfway"
//
// A seeded chance meeting: three convoy strangers fly a beacon line with an empty fourth
// slot. Holding station inside the slot (within slotRadiusWu of the gap point) while the
// convoy passes beacons fills it: after holdBeaconsMin beacons the lamps sync, and riding
// the line to the far end tips the fourth's share (a real pod). Flying sloppy — inside the
// slot area then deviating past sloppyRangeWu — builds strikes; sloppyStrikesMax closes the
// berth: the convoy flashes and the share is gone.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The convoy's line flight flies through the traffic reaction
//   lease each sweep (single intent writer per hull).
// - Physical: the route ends are real story-prop beacons; the share is a real jettisoned
//   cargo pod (persistent, physicsBody mass, masslineTetherable).
// - Bounded Maps capped by tuning.memoryCap; bounded convoy (tuning.convoyShips <= 3).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const EMPTY_BERTH_EVENT = 'plants:emptyBerth';

export const EMPTY_BERTH_TUNING = Object.freeze({
  plId: 'pl157',
  spawnChancePct: 50,
  convoyShips: 3,
  shipSpacingWu: 70,           // along-line spacing between convoy ships
  slotRadiusWu: 80,            // "fill the gap" tolerance around the slot point
  sloppyRangeWu: 200,          // deviation beyond this while the slot is held = sloppy
  sloppyStrikesMax: 3,
  holdBeaconsMin: 2,           // beacons passed while holding the slot to sync lamps
  beaconSpacingWu: 300,
  arriveRangeWu: 90,
  flashDurationS: 1.2,
  sharePods: 1,
  podCommodityId: 'cmdty_silicate',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 900,
  memoryCap: 16,
});

export const EMPTY_BERTH_CALLSIGN = 'CONVOY THREE';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure slot geometry: the gap point where the fourth should fly. */
export function emptyBerthSlotPoint(leadPos, dirX, dirZ, shipIndex, tuning = EMPTY_BERTH_TUNING) {
  const slotIdx = tuning.convoyShips; // the fourth position
  const back = (slotIdx - shipIndex) * tuning.shipSpacingWu + (slotIdx - 1) * 0;
  return {
    x: finite(leadPos.x) - dirX * ((slotIdx) * tuning.shipSpacingWu),
    z: finite(leadPos.z) - dirZ * ((slotIdx) * tuning.shipSpacingWu),
    back,
  };
}

export const emptyBerthPlant = {
  modes: ['flight'],
  name: 'plants157',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const lead = this._entity(enc.convoyIds[0]);
    const farBeacon = this._entity(enc.farBeaconId);
    const player = this._player();
    if (!lead || lead.alive === false || !farBeacon || !player || !player.pos) return;

    // Fly the line toward the far beacon on leased intents.
    const toFar = Math.atan2(
      finite(farBeacon.pos.z) - finite(lead.pos.z),
      finite(farBeacon.pos.x) - finite(lead.pos.x),
    );
    for (const id of enc.convoyIds) {
      const ship = this._entity(id);
      if (ship && ship.alive !== false) {
        requestTrafficReaction(this, ship, {
          moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: toFar, brake: false,
        }, 2);
      }
    }

    // Slot point trails the lead along the line.
    const dirX = Math.cos(toFar);
    const dirZ = Math.sin(toFar);
    const slot = emptyBerthSlotPoint(lead.pos, dirX, dirZ, 0);
    const slotDist = this._dist(player.pos, slot);

    if (enc.synced) {
      // Sloppy flying still boxes you out of the share, halfway or not.
      if (this._stepSloppy(enc, slotDist, lead, now)) return;
      this._stepArrival(enc, lead, farBeacon, player, now);
      return;
    }

    if (slotDist <= EMPTY_BERTH_TUNING.slotRadiusWu) {
      enc.heldSlot = true;
      const beaconDist = this._dist(lead.pos, farBeacon.pos);
      const beaconsPassed = Math.floor(
        (this._dist(enc.startBeaconPos, farBeacon.pos) - beaconDist) / EMPTY_BERTH_TUNING.beaconSpacingWu,
      );
      if (beaconsPassed > enc.beaconsHeld) {
        enc.beaconsHeld = Math.min(beaconsPassed, EMPTY_BERTH_TUNING.holdBeaconsMin);
        this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'slot_held', beaconsHeld: enc.beaconsHeld, t: now });
      }
      if (enc.beaconsHeld >= EMPTY_BERTH_TUNING.holdBeaconsMin) {
        enc.synced = true;
        for (const id of enc.convoyIds) {
          const ship = this._entity(id);
          if (ship) {
            ship.data.lampsFlashing = true;
            ship.data.lampFlashUntil = now + EMPTY_BERTH_TUNING.flashDurationS;
          }
        }
        this._cue('confirm', lead.pos, 0.8, 1);
        this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'lamps_synced', convoyIds: enc.convoyIds, t: now });
      }
      return;
    }

    if (enc.heldSlot) {
      // Inside the slot area, now deviating: sloppy.
      if (this._stepSloppy(enc, slotDist, lead, now)) return;
    }
  },

  /** Shared sloppy-strike step. Returns true when the encounter ended (boxed out). */
  _stepSloppy(enc, slotDist, lead, now) {
    if (slotDist <= EMPTY_BERTH_TUNING.sloppyRangeWu) return false;
    enc.strikes += 1;
    if (enc.strikes >= EMPTY_BERTH_TUNING.sloppyStrikesMax) {
      this._boxedOut(enc, lead, now);
      return true;
    }
    this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'sloppy', strikes: enc.strikes, t: now });
    if (slotDist > EMPTY_BERTH_TUNING.sloppyRangeWu * 2) enc.heldSlot = false;
    return false;
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _dist(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _capMemory() {
    while (this._memory.size >= EMPTY_BERTH_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnShip(pos, index) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'hauler', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [EMPTY_BERTH_TUNING.plId]: { role: 'convoy', index } };
    ent.data.callsign = EMPTY_BERTH_CALLSIGN;
    this._owned.set(ent.id, { kind: 'convoy', expiresAt: this._now() + EMPTY_BERTH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnBeacon(pos, scanLabel) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel,
        storyPropKind: 'convoy_route_beacon',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'beacon', expiresAt: this._now() + EMPTY_BERTH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnShare(pos, ownerId) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: EMPTY_BERTH_TUNING.podCommodityId,
      amount: EMPTY_BERTH_TUNING.sharePods,
      radius: EMPTY_BERTH_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 6, z: 0 },
      ownerId,
      ownerName: EMPTY_BERTH_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [EMPTY_BERTH_TUNING.plId]: { role: 'fourth_share' } };
    ent.data.masslineTetherable = true;
    this._owned.delete(ent.id); // the share is the player's keep
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl157', 'spawn') % 100 >= EMPTY_BERTH_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const startX = base.x + 400;
    const startZ = base.z + 200;
    const endZ = startZ - EMPTY_BERTH_TUNING.beaconSpacingWu * EMPTY_BERTH_TUNING.holdBeaconsMin
      - EMPTY_BERTH_TUNING.arriveRangeWu * 2;
    const startBeacon = this._spawnBeacon({ x: startX, z: startZ }, 'Convoy line — start');
    const farBeacon = this._spawnBeacon({ x: startX, z: endZ }, 'Convoy line — far dock');
    if (!startBeacon || !farBeacon) { this._despawnOwned(); return; }
    const convoyIds = [];
    for (let i = 0; i < EMPTY_BERTH_TUNING.convoyShips; i += 1) {
      const ship = this._spawnShip({ x: startX, z: startZ - 40 - i * EMPTY_BERTH_TUNING.shipSpacingWu }, i);
      if (ship) convoyIds.push(ship.id);
    }
    if (convoyIds.length !== EMPTY_BERTH_TUNING.convoyShips) { this._despawnOwned(); return; }
    this._capMemory();
    this._memory.set('enc', {
      convoyIds,
      startBeaconId: startBeacon.id,
      farBeaconId: farBeacon.id,
      startBeaconPos: { x: startX, z: startZ },
      beaconsHeld: 0,
      heldSlot: false,
      strikes: 0,
      synced: false,
    });
  },

  _boxedOut(enc, lead, now) {
    enc.boxedOut = true;
    // Fly sloppy, be boxed out halfway: the convoy closes the berth, no share.
    for (const id of enc.convoyIds) {
      const ship = this._entity(id);
      if (ship) {
        ship.data.lampsFlashing = true;
        ship.data.lampFlashUntil = now + EMPTY_BERTH_TUNING.flashDurationS;
      }
    }
    this._cue('ui_deny', lead ? lead.pos : null, 0.9, 1);
    this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'boxed_out', strikes: enc.strikes, t: now });
    this._endEncounter(enc);
  },

  _stepArrival(enc, lead, farBeacon, player, now) {
    if (this._dist(lead.pos, farBeacon.pos) > EMPTY_BERTH_TUNING.arriveRangeWu) {
      // Sloppy after sync still boxes you out of the share.
      return;
    }
    const slot = { x: finite(lead.pos.x), z: finite(lead.pos.z) + EMPTY_BERTH_TUNING.shipSpacingWu };
    const inSlot = this._dist(player.pos, slot) <= EMPTY_BERTH_TUNING.slotRadiusWu * 2;
    if (inSlot) {
      const pod = this._spawnShare({ x: player.pos.x + 30, z: player.pos.z }, enc.convoyIds[0]);
      this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'share_taken', podId: pod ? pod.id : null, t: now });
    }
    this._endEncounter(enc);
  },

  _endEncounter(enc) {
    for (const id of enc.convoyIds) {
      releaseTrafficReaction(this, this._entity(id));
      this._remove(id);
    }
    this._remove(enc.startBeaconId);
    this._remove(enc.farBeaconId);
    this._memory.delete('enc');
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    const enc = this._memory ? this._memory.get('enc') : null;
    if (enc) {
      for (const id of enc.convoyIds) releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(EMPTY_BERTH_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
