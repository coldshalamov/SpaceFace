// PL-304 The after-hours coach — "A retired pilot idles at a launch mouth and coaches one
// clean takeoff per visitor, for nothing, because somebody did it for them once.
// Take the coaching; or mock it on channel — the mouth is empty the next time you launch,
// and stays empty"
//
// A chance meeting at the ordinary route's launch mouth: the player idles near a transit
// gate during the night watch and a retired-pilot stranger spawns idling alongside. One
// coaching line, free, because somebody did it for them once.
//
// - Take the coaching: depart through the mouth cleanly inside the coach window — from idle
//   to clean speed, no impact receipt near the mouth and no shots — and the coach paces you
//   out through the mouth (their hull follows astern for the pace-out), then lamps a wave.
//   The mouth remembers you (coachedUntil): next visit the coach greets you first.
// - Mock it on channel: the row's mock is channel speech the flight route has no input seam
//   for; the physical stand-in that reads the same to a coach is ramming them (a
//   player-caused impact receipt at or above mock speed, declared substitute). The mouth is
//   empty the next time you launch, and stays empty: for a very long season the coach never
//   spawns at that gate again.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the coach's pace-out steers through the traffic reaction
//   lease (abort on refusal); the player is never steered and never the NPC.
// - Physical: the mouth and the clean takeoff are real geometry, speeds, and impact receipts.
// - No economy mutations. Bounded Maps capped by tuning.memoryCap; caps: one coach live,
//   one clean takeoff per visit; cooldowns; TTL despawns; nothing runs while docked.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const AFTER_HOURS_COACH_EVENT = 'plants:afterHoursCoach';

export const AFTER_HOURS_COACH_TUNING = Object.freeze({
  plId: 'pl304',
  spawnChancePct: 60,
  nightStartDayT: 420,         // the after-hours window: [420, 600) of the 600 s day
  daySeconds: 600,
  mouthRangeWu: 320,           // near the gate mouth is the lesson's classroom
  idleSpeedWu: 6,              // idling at the mouth
  idleForS: 3,                 // idle this long before the coach speaks
  coachWindowS: 25,            // the takeoff must come inside this
  cleanSpeedWu: 45,            // a clean takeoff reads at this speed, outward
  paceOutS: 5,                 // the coach paces you out for this long
  coachedSeasonS: 1200,        // "one clean takeoff per visitor": the mouth remembers
  mockSpeedWu: 45,             // a player-caused closing speed at or above this is a mock
  emptySeasonS: 3600,          // "the mouth is empty the next time you launch, and stays empty"
  strangerTtlS: 300,
  memoryCap: 8,
});

export const AFTER_HOURS_COACH_CALLSIGN = 'RETIRED PILOT';
export const AFTER_HOURS_COACH_LINE = 'Easy throttle. Hold the line.';
export const AFTER_HOURS_COACH_AGAIN_LINE = 'You again. Go on through.';
export const AFTER_HOURS_COACH_EMPTY_LABEL = 'LAUNCH MOUTH — QUIET';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the after-hours check on the 600 s day clock. */
export function isAfterHours(simTime, tuning = AFTER_HOURS_COACH_TUNING) {
  const t = finite(simTime, 0);
  const daySeconds = finite(tuning.daySeconds, 600);
  const dayT = ((t % daySeconds) + daySeconds) % daySeconds;
  return { dayT, afterHours: dayT >= tuning.nightStartDayT };
}

/**
 * Pure verdict for a takeoff attempt: clean when the speed crossed the clean band outward
 * within the window with no blemishes; 'rough' when a blemish landed; 'waiting' otherwise.
 */
export function takeoffVerdict({ speedWu, blemished, coachingLive }, tuning = AFTER_HOURS_COACH_TUNING) {
  if (blemished) return 'rough';
  if (!coachingLive) return 'waiting';
  return Number.isFinite(speedWu) && speedWu >= tuning.cleanSpeedWu ? 'clean' : 'waiting';
}

export const afterHoursCoachPlant = {
  modes: ['flight'],
  name: 'plants304',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._idleTicks = 0;
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('physics:impact', (p) => this._onImpact(p));
    on('combat:fire', (p) => this._onShot(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const now = finite(s.simTime, 0);
    const gate = this._nearestGate(player.pos);
    const atMouth = gate != null
      && this._dist(gate.pos, player.pos) <= AFTER_HOURS_COACH_TUNING.mouthRangeWu;

    this._accum += finite(dt, 0);
    const tick = this._accum >= 1;
    if (tick) {
      this._accum = 0;
      this._watchMouth(atMouth, player, gate, now);
    }

    const enc = this._memory.get('enc');
    if (!enc) return;
    const coach = this._entity(enc.coachId);
    if (!coach || coach.alive === false) { this._memory.delete('enc'); return; }

    // Take the coaching: a clean takeoff reads as idle -> clean speed, no blemish.
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (enc.coachingLive && !enc.blemished && speed >= AFTER_HOURS_COACH_TUNING.cleanSpeedWu) {
      enc.verdict = takeoffVerdict({
        speedWu: speed, blemished: false, coachingLive: true,
      });
      if (enc.verdict === 'clean' && !enc.coached) {
        enc.coached = true;
        enc.paceOutUntil = now + AFTER_HOURS_COACH_TUNING.paceOutS;
        this._capMemory();
        this._memory.set('coached', { gateId: enc.gateKey, until: now + AFTER_HOURS_COACH_TUNING.coachedSeasonS });
        this.bus.emit(AFTER_HOURS_COACH_EVENT, { kind: 'clean_takeoff', coachId: enc.coachId, t: now });
      }
    }

    // The pace-out: the coach follows astern while you clear the mouth, then lamps a wave.
    if (enc.coached && coach.pos && player.pos) {
      const dx = finite(player.pos.x) - finite(coach.pos.x);
      const dz = finite(player.pos.z) - finite(coach.pos.z);
      const d = Math.hypot(dx, dz) || 1;
      if (now < (enc.paceOutUntil || 0)) {
        const held = requestTrafficReaction(this, coach, {
          moveX: dx / d, moveZ: dz / d,
          boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: d < 60,
        }, 3);
        if (!held) releaseTrafficReaction(this, coach); // refused: abort
      } else if (!enc.waved) {
        enc.waved = true;
        coach.data.lampsFlashing = true;
        coach.data.lampFlashUntil = now + 1.2;
        this._cue('confirm', coach.pos, 0.7, 1);
        this.bus.emit(AFTER_HOURS_COACH_EVENT, { kind: 'paced_out', coachId: enc.coachId, t: now });
        this._endMeeting();
      }
    }

    // The window closes: no clean takeoff in time is just a quiet night, no penalty.
    if (!enc.coached && enc.coachingLive && now - enc.coachedAt > AFTER_HOURS_COACH_TUNING.coachWindowS) {
      enc.coachingLive = false;
    }
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

  _nearestGate(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate !== true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best;
  },

  _capMemory() {
    while (this._memory.size >= AFTER_HOURS_COACH_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _mouthEmptyFor(gateKey, now) {
    const row = this._memory.get(`empty:${gateKey}`);
    return !!(row && finite(row.until, 0) > now);
  },

  _coachedFor(gateKey, now) {
    const row = this._memory.get('coached');
    return !!(row && row.gateId === gateKey && finite(row.until, 0) > now);
  },

  _watchMouth(atMouth, player, gate, now) {
    if (this._memory.get('enc') || this._owned.size >= 1) { this._idleTicks = 0; return; }
    if (!atMouth) { this._idleTicks = 0; return; }
    const { afterHours } = isAfterHours(this.state.simTime);
    if (!afterHours) { this._idleTicks = 0; return; }
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed >= AFTER_HOURS_COACH_TUNING.idleSpeedWu) { this._idleTicks = 0; return; }
    this._idleTicks += 1;
    if (this._idleTicks * 1 < AFTER_HOURS_COACH_TUNING.idleForS) return;
    const gateKey = gate && gate.id != null ? String(gate.id) : 'gate';
    if (this._mouthEmptyFor(gateKey, now)) {
      this._idleTicks = 0;
      return; // "the mouth is empty the next time you launch, and stays empty"
    }
    // Chance gate on the meeting.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, AFTER_HOURS_COACH_TUNING.plId, 'mouth') % 100 >= AFTER_HOURS_COACH_TUNING.spawnChancePct) return;
    const coachedBefore = this._coachedFor(gateKey, now);
    const coach = this._spawnCoach(player);
    if (!coach) return;
    this._capMemory();
    this._memory.set('enc', {
      coachId: coach.id,
      gateKey,
      coachingLive: true,
      coachedAt: now,
      coached: false,
      blemished: false,
      waved: false,
      paceOutUntil: null,
      verdict: 'waiting',
    });
    this._idleTicks = 0;
    // The coaching, free — the mouth remembers a friend with the shorter line.
    this._say(`plants:${AFTER_HOURS_COACH_TUNING.plId}:coach:${now}`,
      AFTER_HOURS_COACH_CALLSIGN, coachedBefore ? AFTER_HOURS_COACH_AGAIN_LINE : AFTER_HOURS_COACH_LINE, 7);
    this.bus.emit(AFTER_HOURS_COACH_EVENT, { kind: 'coaching', coachId: coach.id, gateKey, coachedBefore, t: now });
  },

  _spawnCoach(player) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const head = finite(player.rot, 0);
    const pos = {
      x: finite(player.pos.x) + Math.cos(head) * 90 + 40,
      z: finite(player.pos.z) + Math.sin(head) * 90 - 30,
    };
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos,
      ai: { archetype: 'coach', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [AFTER_HOURS_COACH_TUNING.plId]: { role: 'retired_pilot' } };
    ent.data.callsign = AFTER_HOURS_COACH_CALLSIGN;
    this._owned.set(ent.id, { kind: 'coach', expiresAt: this._now() + AFTER_HOURS_COACH_TUNING.strangerTtlS });
    return ent;
  },

  // A blemish: any player shot fired near the mouth mid-lesson reads as hooting.
  _onShot(p) {
    if (!this._flight() || !p || !this.state) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.coached) return;
    const player = this._player();
    const coach = this._entity(enc.coachId);
    if (!player || !coach || !p.origin) return;
    if (this._dist(p.origin, coach.pos) <= AFTER_HOURS_COACH_TUNING.mouthRangeWu / 2) {
      enc.blemished = true;
    }
  },

  // Mock it on channel: the ram reads to the coach as the mockery (declared substitute).
  _onImpact(p) {
    if (!this._flight() || !p || !this.state) return;
    const enc = this._memory.get('enc');
    const player = this._player();
    if (!enc || !player) return;
    const mock = finite(p.preSolveClosingSpeed, 0) >= AFTER_HOURS_COACH_TUNING.mockSpeedWu
      && p.causalActorId === this.state.playerId
      && (p.aId === enc.coachId || p.bId === enc.coachId);
    if (!mock) return;
    const now = this._now();
    // "the mouth is empty the next time you launch, and stays empty"
    this._capMemory();
    this._memory.set(`empty:${enc.gateKey}`, { until: now + AFTER_HOURS_COACH_TUNING.emptySeasonS });
    this._cue('ui_deny', null, 0.6, 1);
    this.bus.emit(AFTER_HOURS_COACH_EVENT, {
      kind: 'mouth_emptied', coachId: enc.coachId, gateKey: enc.gateKey,
      until: now + AFTER_HOURS_COACH_TUNING.emptySeasonS, t: now,
    });
    this._endMeeting();
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.coachId) return;
    this._memory.delete('enc');
    this.bus.emit(AFTER_HOURS_COACH_EVENT, { kind: 'coach_gone', hullId: p.id, t: this._now() });
  },

  _endMeeting() {
    const enc = this._memory.get('enc');
    if (!enc) return;
    this._memory.delete('enc');
    if (enc.coachId != null) this._remove(enc.coachId);
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
    const enc = this._memory.get('enc');
    if (enc && this._entity(enc.coachId) == null) this._memory.delete('enc');
    for (const [key, row] of this._memory) {
      if (key.startsWith('empty:') && now >= finite(row.until, 0)) this._memory.delete(key);
      if (key === 'coached' && now >= finite(row.until, 0)) this._memory.delete(key);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // Mouth memory rides across sector changes: "empty ... and stays empty", and a
    // coached mouth remembers its friend. A session boundary (save:loaded, game:new,
    // game:newGame) empties every mouth's memory.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keeps = [];
    if (sectoral && this._memory) {
      for (const [k, v] of this._memory) {
        if (k.startsWith('empty:') || k === 'coached') keeps.push([k, v]);
      }
    }
    if (this._memory) this._memory.clear();
    for (const [k, v] of keeps) this._memory.set(k, v);
    this._idleTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(AFTER_HOURS_COACH_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel: 'bark', id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
