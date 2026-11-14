// PL-299 The rescue dividend — "Tow a stranger to safety with no bounty posted, no receipt
// asked. A week later, dead in the water yourself, a stranger tows YOU in, quoting your
// rescue number.
// Accept the dividend; or demand payment on the spot, twice — the pool crosses your hull
// off its books"
//
// The rescue ledger (per row note): a rescue receipt is a real tether:snapCatch on a
// DISABLED stranger (spawned drifting, passive, low hull — the shared towWatch view confirms
// the player's live tow target) carried to delivery at dock:range. Delivered rescues are
// keyed in the module ledger { rescueNo, at }. No bounty, no receipt asked of anyone.
//
// - Accept the dividend: after dividendDelayS (a week of sim time), when the PLAYER is dead
//   in the water (hull under diwHullPct or barely moving for diwForS), a pool stranger
//   spawns, closes to tow range, and tows YOU — bounded impulses toward the nearest station
//   through the physics authority — quoting your rescue number on arrival at the station.
// - Demand payment on the spot: snapping a line onto the stranger you just delivered is
//   holding them for pay. First demand gets one comms line; the second crosses your hull
//   off the pool's books (crossedOffUntil) — the dividend never pays and later rescues of
//   yours are not credited.
//
// Economy-owner handoff: none — the dividend is a physical tow, comms, and stamps only.
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; rescuer steering via the traffic reaction lease (abort on
//   refusal); the tow of YOU is queuePhysicsImpulse, never a direct vel write.
// - Bounded Maps capped by tuning.memoryCap; ledger FIFO at ledgerCap; TTL despawns.
// - Nothing runs while docked (dock:range is only the delivery check); player never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';
import { hash32 } from '../../core/rng.js';

export const RESCUE_DIVIDEND_EVENT = 'plants:rescueDividend';

export const RESCUE_DIVIDEND_TUNING = Object.freeze({
  plId: 'pl299',
  spawnChancePct: 60,
  strangerCount: 1,            // one disabled stranger per meeting
  diwHullPct: 0.35,            // "dead in the water yourself"
  diwSpeedWu: 4,
  diwForS: 3,                  // stalled this long counts as dead in the water
  dividendDelayS: 900,         // "a week later"
  towRangeWu: 70,              // the rescuer attaches at this range
  towImpulsePerSec: 95,        // the dividend tow's push toward the station
  towCooldownS: 8,             // re-attach cooldown
  deliveredRangeWu: 260,       // station proximity completes a delivery
  rescueNoStart: 4001,         // the pool's book is already full of numbers
  ledgerCap: 6,                // bounded ledger rows
  crossedOffSeasonS: 3600,     // "the pool crosses your hull off its books"
  strangerTtlS: 420,
  memoryCap: 10,
});

export const RESCUE_POOL_CALLSIGN = 'RESCUE POOL';
export const RESCUE_DELIVERED_LINE = 'Logged. No bill.';
export const RESCUE_DEMAND_LINE = 'No bounty was posted.';
export function rescueQuotedLine(rescueNo) {
  return `Rescue ${Math.max(0, Math.floor(Number(rescueNo) || 0))}. Our turn.`;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure ledger write: record a delivered rescue. Returns the updated ledger row. */
export function recordRescue(ledger, strangerId, rescueNo, now, cap = RESCUE_DIVIDEND_TUNING.ledgerCap) {
  if (!ledger) return null;
  while (ledger.length >= cap) ledger.shift();
  const row = { strangerId: strangerId != null ? strangerId : null, rescueNo, deliveredAt: now, paid: false };
  ledger.push(row);
  return row;
}

/** Pure ledger read: the oldest unpaid rescue eligible for the dividend at `now`. */
export function payableRescue(ledger, now, delayS = RESCUE_DIVIDEND_TUNING.dividendDelayS) {
  if (!Array.isArray(ledger)) return null;
  for (const row of ledger) {
    if (row && !row.paid && now - row.deliveredAt >= delayS) return row;
  }
  return null;
}

/** Pure: how many on-the-spot demands has this stranger taken? */
export function demandCount(job, strangerId) {
  if (!job || job.strangerId !== strangerId) return 0;
  return Math.max(0, Math.floor(finite(job.demands, 0)));
}

export const rescueDividendPlant = {
  name: 'plants299',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._rescueTowMemory = new Map();
    this._ledger = [];
    this._rescueNo = RESCUE_DIVIDEND_TUNING.rescueNoStart;
    this._diwTicks = 0;
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
    on('tether:snapCatch', (p) => this._onSnapCatch(p));
    on('massline:releaseValidated', (p) => this._onRelease(p));
    on('entity:killed', (p) => this._onKilled(p));
    this._rescueDividendTowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
    attachTowWatch(this, 'rescueDividend', () => this._rescueTowMemory);
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const now = finite(s.simTime, 0);

    // Delivery check: carrying a rescued stranger in range of a station delivers them.
    this._accum += finite(dt, 0);
    if (this._accum >= 1) {
      this._accum = 0;
      this._checkDelivery(now);
      this._watchDeadInWater(player, now);
    }

    const div = this._memory.get('dividend');
    if (!div) return;
    const rescuer = this._entity(div.rescuerId);
    if (!rescuer || rescuer.alive === false) { this._memory.delete('dividend'); return; }

    // The rescuer closes on you.
    const dx = finite(player.pos.x) - finite(rescuer.pos.x);
    const dz = finite(player.pos.z) - finite(rescuer.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    const held = requestTrafficReaction(this, rescuer, {
      moveX: dx / d, moveZ: dz / d,
      boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: d < 30,
    }, 3);
    if (!held) releaseTrafficReaction(this, rescuer); // refused: abort

    // Attached: tow YOU toward the nearest station with bounded impulses.
    if (d <= RESCUE_DIVIDEND_TUNING.towRangeWu && !div.attached) {
      div.attached = true;
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'dividend_attached', rescuerId: div.rescuerId, t: now });
    }
    if (div.attached && now >= (div.towHoldUntil || 0)) {
      const station = this._nearestStation(player.pos);
      if (station) {
        const sx = finite(station.pos.x) - finite(player.pos.x);
        const sz = finite(station.pos.z) - finite(player.pos.z);
        const len = Math.hypot(sx, sz) || 1;
        const mass = finite(player.mass, 1) || 1;
        const mag = RESCUE_DIVIDEND_TUNING.towImpulsePerSec * Math.max(dt, 1 / 60);
        queuePhysicsImpulse(player, { x: (sx / len) * mag * mass, z: (sz / len) * mag * mass }, { tick: s.tick });
        div.towHoldUntil = now + 0.5; // bounded re-apply cadence
        // Delivered yourself: the pool quotes your number at the station's doorstep.
        if (this._dist(station.pos, player.pos) <= RESCUE_DIVIDEND_TUNING.deliveredRangeWu && !div.quoted) {
          div.quoted = true;
          div.row.paid = true;
          this._say('comms', `plants:${RESCUE_DIVIDEND_TUNING.plId}:dividend:${now}`,
            RESCUE_POOL_CALLSIGN, rescueQuotedLine(div.row.rescueNo), 7);
          this.bus.emit(RESCUE_DIVIDEND_EVENT, {
            kind: 'dividend_paid', rescuerId: div.rescuerId, rescueNo: div.row.rescueNo,
            stationId: station.id, t: now,
          });
          this._remove(div.rescuerId);
          this._memory.delete('dividend');
        }
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this._rescueTowMemory) this._rescueTowMemory.clear();
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

  _nearestStation(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate === true || d.isWormhole === true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best;
  },

  _capMemory() {
    while (this._memory.size >= RESCUE_DIVIDEND_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _crossedOff(now) {
    const row = this._memory.get('crossedOff');
    return !!(row && finite(row.until, 0) > now);
  },

  // A disabled stranger on the ordinary route: seeded per sector entry.
  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, RESCUE_DIVIDEND_TUNING.plId, 'spawn') % 100 >= RESCUE_DIVIDEND_TUNING.spawnChancePct) return;
    if (this._crossedOff(this._now())) {
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'pool_refuses', t: this._now() });
      return;
    }
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    if (this._owned.size >= RESCUE_DIVIDEND_TUNING.strangerCount) return;
    const stranger = this._spawnDisabledStranger({ x: base.x + 240, z: base.z + 60 });
    if (!stranger) return;
    this._capMemory();
    this._memory.set('rescue', { strangerId: stranger.id, delivered: false });
  },

  _spawnDisabledStranger(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'disabled', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [RESCUE_DIVIDEND_TUNING.plId]: { role: 'disabled_stranger', disabled: true } };
    ent.data.callsign = RESCUE_POOL_CALLSIGN;
    ent.hull = Math.max(1, finite(ent.hullMax, 40) * 0.15); // disabled: barely alive
    this._owned.set(ent.id, { kind: 'stranger', expiresAt: this._now() + RESCUE_DIVIDEND_TUNING.strangerTtlS });
    return ent;
  },

  // The rescue receipt: a real snap-catch onto the disabled stranger.
  _onSnapCatch(p) {
    if (!this._flight() || !p || p.targetId == null) return;
    const now = this._now();
    const rescue = this._memory.get('rescue');
    if (rescue && p.targetId === rescue.strangerId && !rescue.delivered) {
      rescue.towedAt = now;
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'rescue_towed', strangerId: rescue.strangerId, t: now });
      return;
    }
    // Demand payment on the spot: a line snapped on a stranger you already delivered.
    const delivered = this._memory.get('delivered');
    if (delivered && p.targetId === delivered.strangerId && this._entity(delivered.strangerId)) {
      delivered.demands = (delivered.demands || 0) + 1;
      delivered.lastDemandAt = now;
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'demanded', strangerId: delivered.strangerId, demands: delivered.demands, t: now });
      if (delivered.demands === 1) {
        this._say('comms', `plants:${RESCUE_DIVIDEND_TUNING.plId}:demand:${now}`,
          RESCUE_POOL_CALLSIGN, RESCUE_DEMAND_LINE, 6);
      } else if (delivered.demands >= 2 && !this._crossedOff(now)) {
        // "the pool crosses your hull off its books": dividend cancelled, credits refused.
        this._capMemory();
        this._memory.set('crossedOff', { until: now + RESCUE_DIVIDEND_TUNING.crossedOffSeasonS });
        for (const row of this._ledger) row.paid = true; // nothing owed, ever
        this.bus.emit(RESCUE_DIVIDEND_EVENT, {
          kind: 'crossed_off', strangerId: delivered.strangerId,
          until: now + RESCUE_DIVIDEND_TUNING.crossedOffSeasonS, t: now,
        });
      }
    }
  },

  _onRelease(p) {
    const rescue = this._memory.get('rescue');
    if (!rescue || !p) return;
    if (p.entityId === rescue.strangerId) rescue.towedAt = null;
  },

  // Delivery: in range of a station while actually towing the rescued stranger.
  _checkDelivery(now) {
    const rescue = this._memory.get('rescue');
    if (!rescue || rescue.delivered) return;
    const towedId = towTargetIdOf(this.state, this._rescueTowMemory, now);
    if (towedId !== rescue.strangerId) return;
    const player = this._player();
    const station = player ? this._nearestStation(player.pos) : null;
    if (!station || this._dist(station.pos, player.pos) > RESCUE_DIVIDEND_TUNING.deliveredRangeWu) return;
    if (this._crossedOff(now)) return; // the pool no longer credits this hull
    rescue.delivered = true;
    const row = recordRescue(this._ledger, rescue.strangerId, this._rescueNo++, now);
    this._capMemory();
    this._memory.set('delivered', { strangerId: rescue.strangerId, demands: 0, lastDemandAt: null });
    this._say('comms', `plants:${RESCUE_DIVIDEND_TUNING.plId}:logged:${now}`,
      RESCUE_POOL_CALLSIGN, RESCUE_DELIVERED_LINE, 6);
    this.bus.emit(RESCUE_DIVIDEND_EVENT, {
      kind: 'rescue_delivered', strangerId: rescue.strangerId, rescueNo: row.rescueNo,
      stationId: station.id, t: now,
    });
  },

  // Dead in the water yourself: the dividend is due.
  _watchDeadInWater(player, now) {
    if (this._memory.get('dividend')) return;
    if (this._crossedOff(now)) return;
    const hullPct = finite(player.hullMax, 0) > 0 ? finite(player.hull, 0) / finite(player.hullMax, 1) : 1;
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    const dead = hullPct < RESCUE_DIVIDEND_TUNING.diwHullPct || speed < RESCUE_DIVIDEND_TUNING.diwSpeedWu;
    if (!dead) { this._diwTicks = 0; return; }
    this._diwTicks += 1;
    if (this._diwTicks * 1 < RESCUE_DIVIDEND_TUNING.diwForS) return;
    const row = payableRescue(this._ledger, now);
    if (!row) return;
    // A seeded slice of dead-in-the-water moments gets the rescuer; the debt itself always
    // stays owed until paid.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, RESCUE_DIVIDEND_TUNING.plId, 'dividend') % 100 >= RESCUE_DIVIDEND_TUNING.spawnChancePct + 40) return;
    if (this._owned.size >= RESCUE_DIVIDEND_TUNING.strangerCount + 1) return;
    const rescuer = this._spawnRescuer({ x: finite(player.pos.x) + 200, z: finite(player.pos.z) - 80 });
    if (!rescuer) return;
    this._capMemory();
    this._memory.set('dividend', { rescuerId: rescuer.id, row, attached: false, towHoldUntil: 0, quoted: false });
    this._diwTicks = 0;
    this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'dividend_coming', rescuerId: rescuer.id, rescueNo: row.rescueNo, t: now });
  },

  _spawnRescuer(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_hawser', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'rescuer', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [RESCUE_DIVIDEND_TUNING.plId]: { role: 'dividend_rescuer' } };
    ent.data.callsign = RESCUE_POOL_CALLSIGN;
    this._owned.set(ent.id, { kind: 'rescuer', expiresAt: this._now() + RESCUE_DIVIDEND_TUNING.strangerTtlS });
    return ent;
  },

  _onKilled(p) {
    if (!p) return;
    const rescue = this._memory.get('rescue');
    if (rescue && p.id === rescue.strangerId) {
      this._memory.delete('rescue');
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'stranger_lost', hullId: p.id, t: this._now() });
      return;
    }
    const div = this._memory.get('dividend');
    if (div && p.id === div.rescuerId) {
      this._memory.delete('dividend');
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'rescuer_lost', hullId: p.id, t: this._now() });
    }
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
    const rescue = this._memory.get('rescue');
    if (rescue && this._entity(rescue.strangerId) == null) this._memory.delete('rescue');
    const delivered = this._memory.get('delivered');
    if (delivered && this._entity(delivered.strangerId) == null) this._memory.delete('delivered');
    const crossed = this._memory.get('crossedOff');
    if (crossed && now >= crossed.until) this._memory.delete('crossedOff');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // The pool's ledger and the crossed-off stamp ride across sector changes — the dividend
    // is owed "a week later", wherever you are then. Live meetings reset, and a session
    // boundary (save:loaded, game:new, game:newGame) closes and clears the pool's books.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keepCrossed = sectoral && this._memory ? this._memory.get('crossedOff') : null;
    if (this._memory) this._memory.clear();
    if (keepCrossed) this._memory.set('crossedOff', keepCrossed);
    if (this._rescueTowMemory) this._rescueTowMemory.clear();
    if (!sectoral) {
      if (this._ledger) this._ledger.length = 0;
      this._rescueNo = RESCUE_DIVIDEND_TUNING.rescueNoStart;
    }
    this._diwTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(RESCUE_DIVIDEND_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(channel, id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel, id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel, id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },
};
