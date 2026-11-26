// PL-208 Same time tomorrow — "Give way to a stranger once, at a beacon, and ever after they
// hold that beacon for you at that hour — an appointment nobody named. Keep it; or miss a
// day, and they wave you through late the next, no grudge"
//
// A seeded chance meeting: a stranger crosses at a beacon prop. If the player yields (slow
// or stopped inside the yield ring while the stranger is crossing), the module names no
// appointment but records one: the beacon position and the hour of the yield (simTime mod
// dayS, hour = the DAY_SECONDS contract). Ever after, at that hour at that beacon, the
// stranger is there again (spawned for the appointment window only). Arriving inside the
// window keeps the appointment (lamps flash, streak counts). Missing a day stamps the miss;
// the next meeting they wave you through late — one comms line, no grudge, the streak resets.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The stranger's crossing flies through the traffic reaction
//   lease; appointment spawns are the only recurring hulls and are TTL-despawned.
// - Bounded Maps capped by tuning.memoryCap; at most ONE appointment row (bounded by shape).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const SAME_TIME_TOMORROW_EVENT = 'plants:sameTimeTomorrow';

export const SAME_TIME_TOMORROW_TUNING = Object.freeze({
  plId: 'pl208',
  spawnChancePct: 55,
  dayS: 600,                   // sector-day contract (mirrors DAY_SECONDS users)
  yieldRangeWu: 120,           // the yield ring around the beacon
  yieldSpeedWu: 20,            // slower than this inside the ring = giving way
  appointmentGraceS: 90,       // the hour window they hold for you
  appointmentRangeWu: 260,     // how close the player must come to keep it
  strangerTtlS: 300,
  memoryCap: 16,
});

export const SAME_TIME_TOMORROW_CALLSIGN = 'BEACON STRANGER';
export const SAME_TIME_TOMORROW_LATE_LINE = 'You are late. No grudge.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure hour math: which appointment hour a sim time falls in, and inside the window? */
export function appointmentWindow(simTime, row, tuning = SAME_TIME_TOMORROW_TUNING) {
  if (!row || !Number.isFinite(row.hour)) return { inWindow: false, hour: null, late: false };
  const t = finite(simTime, 0);
  const dayT = ((t % tuning.dayS) + tuning.dayS) % tuning.dayS;
  const hour = Math.floor(dayT / (tuning.dayS / 24) / 1); // hour-of-day index on a 600 s day
  const hourStart = row.hour * (tuning.dayS / 24);
  const inWindow = dayT >= hourStart && dayT <= hourStart + tuning.appointmentGraceS;
  return { inWindow, hour, late: !inWindow && dayT > hourStart + tuning.appointmentGraceS && dayT < hourStart + tuning.appointmentGraceS * 2 };
}

/** Pure yield predicate: slow or stopped inside the yield ring while the stranger crosses. */
export function isGivingWay(playerSpeedWu, distToBeaconWu, strangerDistWu, tuning = SAME_TIME_TOMORROW_TUNING) {
  return Number.isFinite(playerSpeedWu) && Number.isFinite(distToBeaconWu)
    && playerSpeedWu <= tuning.yieldSpeedWu
    && distToBeaconWu <= tuning.yieldRangeWu
    && Number.isFinite(strangerDistWu) && strangerDistWu <= tuning.yieldRangeWu * 1.5;
}

export const sameTimeTomorrowPlant = {
  modes: ['flight'],
  name: 'plants208',

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
    on('sector:exit', () => this._resetSector());
    on('save:loaded', () => this._resetAll('save_loaded'));
    on('game:new', () => this._resetAll('game_new'));
    on('game:newGame', () => this._resetAll('game_new_game'));
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

    const appt = this._memory.get('appointment');
    if (appt) this._stepAppointment(appt, now);
    else this._stepCrossing(now);
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

  _speedOf(e) {
    if (!e || !e.vel) return 0;
    return Math.hypot(finite(e.vel.x), finite(e.vel.z));
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
    while (this._memory.size >= SAME_TIME_TOMORROW_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnStranger(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'courier', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SAME_TIME_TOMORROW_TUNING.plId]: { role: 'stranger' } };
    ent.data.callsign = SAME_TIME_TOMORROW_CALLSIGN;
    this._owned.set(ent.id, { kind: 'stranger', expiresAt: this._now() + SAME_TIME_TOMORROW_TUNING.strangerTtlS });
    return ent;
  },

  _spawnBeacon(pos) {
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
        scanLabel: 'Lane beacon — a stranger crosses here',
        storyPropKind: 'same_time_beacon',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'beacon', expiresAt: this._now() + SAME_TIME_TOMORROW_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._resetSector();
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const appt = this._memory.get('appointment');
    if (!appt) {
      if (hash32(seed, sectorId, 'pl208', 'spawn') % 100 >= SAME_TIME_TOMORROW_TUNING.spawnChancePct) return;
      const player = this._player();
      const base = player && player.pos ? player.pos : { x: 0, z: 0 };
      const beacon = this._spawnBeacon({ x: base.x + 260, z: base.z - 60 });
      const stranger = this._spawnStranger({ x: base.x + 260, z: base.z + 120 });
      if (!beacon || !stranger) { this._despawnOwned(); return; }
      this._capMemory();
      this._memory.set('crossing', { beaconId: beacon.id, strangerId: stranger.id, yielded: false });
    }
  },

  _stepCrossing(now) {
    const enc = this._memory.get('crossing');
    if (!enc) return;
    const beacon = this._entity(enc.beaconId);
    const stranger = this._entity(enc.strangerId);
    const player = this._player();
    if (!beacon || !stranger || !player || !player.pos) return;

    // Cross the beacon on a leased intent.
    const across = Math.atan2(
      finite(beacon.pos.z) - 60 - finite(stranger.pos.z),
      finite(beacon.pos.x) - finite(stranger.pos.x),
    );
    requestTrafficReaction(this, stranger, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: across, brake: false,
    }, 2);

    if (enc.yielded) return;
    const playerSpeed = this._speedOf(player);
    const dBeacon = this._dist(player.pos, beacon.pos);
    const dStranger = this._dist(stranger.pos, beacon.pos);
    if (!isGivingWay(playerSpeed, dBeacon, dStranger)) return;
    enc.yielded = true;
    releaseTrafficReaction(this, stranger);
    this._remove(enc.strangerId);
    // The appointment nobody named: the beacon position and the yield hour.
    const dayT = ((now % SAME_TIME_TOMORROW_TUNING.dayS) + SAME_TIME_TOMORROW_TUNING.dayS) % SAME_TIME_TOMORROW_TUNING.dayS;
    this._capMemory();
    this._memory.set('appointment', {
      beaconPos: { x: finite(beacon.pos.x), z: finite(beacon.pos.z) },
      hour: Math.floor(dayT / (SAME_TIME_TOMORROW_TUNING.dayS / 24)),
      kept: 0,
      missed: 0,
      lastMetDay: -1,
    });
    this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'appointment_made', hour: this._memory.get('appointment').hour, t: now });
  },

  _stepAppointment(appt, now) {
    const player = this._player();
    if (!player || !player.pos) return;
    const day = Math.floor(now / SAME_TIME_TOMORROW_TUNING.dayS);
    const win = appointmentWindow(now, appt);
    if (!win.inWindow || day === appt.lastMetDay) return;
    const dist = this._dist(player.pos, appt.beaconPos);
    if (dist > SAME_TIME_TOMORROW_TUNING.appointmentRangeWu) return;
    // The stranger holds the beacon for you at that hour: spawn for the meeting.
    const stranger = this._spawnStranger({
      x: appt.beaconPos.x + 40,
      z: appt.beaconPos.z - 30,
    });
    if (!stranger) return;
    stranger.data.lampsFlashing = true;
    stranger.data.lampFlashUntil = now + 1.2;
    appt.lastMetDay = day;
    const wasLate = appt.missed > 0;
    if (wasLate) {
      // Miss a day, and they wave you through late the next — no grudge.
      this._comms(`plants:${SAME_TIME_TOMORROW_TUNING.plId}:late:${now}`, SAME_TIME_TOMORROW_CALLSIGN, SAME_TIME_TOMORROW_LATE_LINE, 6);
      appt.missed = 0;
      this._cue('confirm', appt.beaconPos, 0.7, 1);
      this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'kept_late', day, t: now });
    } else {
      appt.kept += 1;
      this._cue('confirm', appt.beaconPos, 0.7, 1);
      this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'kept', day, streak: appt.kept, t: now });
    }
    // The stranger crosses, then politely despawns with the encounter TTL.
    const across = Math.atan2(
      finite(appt.beaconPos.z) - 60 - finite(stranger.pos.z),
      finite(appt.beaconPos.x) - finite(stranger.pos.x),
    );
    requestTrafficReaction(this, stranger, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: across, brake: false,
    }, 4);
  },

  // A missed day: when the hour window passes without the player, stamp the miss.
  _sweepExpired(now) {
    const appt = this._memory.get('appointment');
    if (appt) {
      const day = Math.floor(now / SAME_TIME_TOMORROW_TUNING.dayS);
      const win = appointmentWindow(now, appt);
      // The window is running late and this day's window passed without a meeting.
      if (win.late && appt.lastMetDay < day && appt.missed === 0) {
        appt.missed = 1;
        this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'missed', day, t: now });
      }
    }
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  // Sector-scoped reset: the crossing dies, the appointment (a session row — they hold the
  // beacon "ever after" within this world) survives.
  _resetSector() {
    const enc = this._memory ? this._memory.get('crossing') : null;
    if (enc) releaseTrafficReaction(this, this._entity(enc.strangerId));
    this._despawnOwned();
    const appt = this._memory ? this._memory.get('appointment') : null;
    if (this._memory) this._memory.clear();
    if (appt) this._memory.set('appointment', appt);
    if (this.bus) this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'reset', reason: 'sector_exit', t: this._now() });
  },

  // Cross-game hygiene: a save load or a new game is a new world — the appointment dies.
  _resetAll(reason) {
    const enc = this._memory ? this._memory.get('crossing') : null;
    if (enc) releaseTrafficReaction(this, this._entity(enc.strangerId));
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus) this.bus.emit(SAME_TIME_TOMORROW_EVENT, { kind: 'reset', reason, t: this._now() });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
