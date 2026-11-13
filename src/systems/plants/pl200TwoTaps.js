// PL-200 Two taps — "Off-shift, Drip Moreau walks the coolant trench tapping joints with a
// long pole, listening. One joint gets two taps | Watch that joint — it hisses before the
// hour is out; or learn her knock and find your own"
//
// SEAM NOTE (honest): Vesta Forge is the station_forge body in sector_vesta_forge
// (src/data/sectors.js:604). The coolant trench is a fixed row of joint props laid off the
// live station body; Drip Moreau is a real neutral stranger (makeShipEntitySpec, team 2,
// passive) who walks the trench during the off-shift band of the shared 240 s plant day.
// She stops at one joint — hash-picked per in-world day — and taps it twice. That joint
// hisses (a real vent cue) before the hour is out. The player learns her knock by knocking:
// two real physics impacts on the same joint, a beat apart, find their own vent early.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM. The sim stamps numbers and emits cues; presentation reads them.
// - Session state on `this`; destroy() unsubscribes every listener, despawns owned bodies
//   (joints + Moreau) and clears the bounded tap ledger (tuning.memoryCap).
// - The vent is cooldown-gated: one vent per arming, whatever causes it.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_200_VENT_EVENT = 'plants:pl200:vent';
export const PL_200_KNOCK_EVENT = 'plants:pl200:knock';
export const PL_200_WATCHED_EVENT = 'plants:pl200:watched';

export const TWO_TAPS_TUNING = Object.freeze({
  sectorId: 'sector_vesta_forge',
  stationId: 'station_forge',
  dayLengthS: 240,
  offShiftFraction: 0.25,     // last quarter of the in-world day is off-shift
  jointCount: 7,
  trenchStartWu: 210,         // outside the dock collar, inside the traffic shell
  jointSpacingWu: 90,
  walkSpeedWu: 16,
  stopS: 2.2,                 // she listens this long at a joint
  tapGapS: 0.9,               // ...two taps, a beat apart
  tap1Rate: 0.9,
  tap2Rate: 1.15,
  ventHourS: 60,              // "before the hour is out"
  ventDelayS: 40,             // the hiss lands inside the hour
  ventRate: 1.5,
  watchRadiusWu: 90,
  knockImpulseGate: 90,       // a real knock is a real hit
  knockWindowS: 3,            // two taps, a beat apart, within this window
  jointRadius: 6,
  memoryCap: 14,              // bounded per-joint tap ledger
});

export const TRENCH_SALT = 'plantsPl200Trench';
export const MOREAU_HULL = 'ship_pelican';
export const MOREAU_FACTION = 'faction_dmc';

/** Off-shift band of the shared 240 s plant day (same clock family as PL-146/PL-153). */
export function offShiftAt(simTime, t = TWO_TAPS_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.offShiftFraction);
}

/** Day index of the shared plant clock. */
export function dayIndexOf(simTime, t = TWO_TAPS_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The joint she gives two taps, hash-picked per in-world day. */
export function hissingJointFor(dayIndex, t = TWO_TAPS_TUNING) {
  return hash32('plantsPl200Joint', String(dayIndex)) % Math.max(1, t.jointCount);
}

/** Fixed trench layout: joints along a hash-derived bearing off the live station body. */
export function trenchJointsFor(origin, t = TWO_TAPS_TUNING) {
  const h = hash32(TRENCH_SALT, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const joints = [];
  for (let i = 0; i < t.jointCount; i += 1) {
    const along = t.trenchStartWu + i * t.jointSpacingWu;
    joints.push({ x: origin.x + dir.x * along, z: origin.z + dir.z * along });
  }
  return joints;
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const sources = [];
  if (list.length) sources.push(list);
  if (state.entities && typeof state.entities.values === 'function') sources.push([...state.entities.values()]);
  for (const pool of sources) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createPl200TwoTaps() {
  return {
    name: 'plantsPl200',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._jointIds = [];          // parallel to the trench layout
      this._moreauId = null;
      this._targetIndex = 0;
      this._stopUntil = null;
      this._tap2At = null;
      this._armedDay = null;        // day we gave the two taps
      this._hissingIndex = null;
      this._ventDueAt = null;
      this._vented = false;
      this._announced = false;
      this._lastOffShift = null;
      this._taps = new Map();       // jointEntityId -> [t1] — bounded ledger
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop();
      this._taps?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._jointIds || []) rm(id);
        if (this._moreauId != null) rm(this._moreauId);
      }
      this._jointIds = [];
      this._moreauId = null;
      this._targetIndex = 0;
      this._stopUntil = null;
      this._tap2At = null;
      this._armedDay = null;
      this._hissingIndex = null;
      this._ventDueAt = null;
      this._vented = false;
      this._announced = false;
      this._lastOffShift = null;
      this._taps?.clear();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _say(text) {
      this.bus?.emit('comms:popup', {
        id: 'plants:pl200:moreau',
        sender: 'Drip Moreau',
        category: 'traffic',
        text,
        ttl: 8,
        persist: false,
      });
    },

    _joint(index) {
      const id = this._jointIds[index];
      return id != null && this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureJoints(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._jointIds.length) return;
      for (const pos of trenchJointsFor(origin)) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: TWO_TAPS_TUNING.jointRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: TWO_TAPS_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_coolant_joint',
            plantsPl200Joint: true,
            placeId: 'place_tanker_coupling',
            everydaySpaceKit: true,
            scanLabel: 'Coolant trench joint',
            swarmFloorPad: { label: 'Trench joint' },
          },
        });
        this._jointIds.push(ent && ent.id != null ? ent.id : null);
      }
    },

    _ensureMoreau(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._moreauId != null) return;
      const joints = trenchJointsFor(origin);
      const spec = makeShipEntitySpec(MOREAU_HULL, {
        team: 2,
        factionId: MOREAU_FACTION,
        pos: { x: joints[0].x, z: joints[0].z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl200Moreau = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = 'Drip Moreau';
      spec.data.despawnAt = null; // we own her leaving, not core.lifetimeSweep
      const ent = spawn(spec);
      if (ent && ent.id != null) {
        this._moreauId = ent.id;
        this._targetIndex = 0;
        if (!this._announced) {
          this._announced = true;
          this._say('Two taps. Then listen.');
        }
      }
    },

    _tapCue(rate) {
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate, gain: 0.45 });
    },

    _vent(index, cause) {
      if (this._vented) return;
      const now = this._now();
      const joint = this._joint(index);
      if (joint?.data) {
        joint.data.venting = true;
        joint.data.ventUntil = now + 6;
        joint.data.lampsFlashing = true;
        joint.data.lampFlashUntil = now + 3;
      }
      this._vented = true;
      this._ventDueAt = null;
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: TWO_TAPS_TUNING.ventRate, gain: 0.6 });
      this.bus?.emit(PL_200_VENT_EVENT, { jointIndex: index, cause, t: now });
      const player = this.state?.entities?.get ? this.state.entities.get(this.state.playerId) : null;
      if (player?.pos && joint?.pos) {
        const d = Math.hypot(player.pos.x - joint.pos.x, player.pos.z - joint.pos.z);
        if (d <= TWO_TAPS_TUNING.watchRadiusWu) {
          this.bus?.emit(PL_200_WATCHED_EVENT, { jointIndex: index, distanceWu: Math.round(d), t: now });
        }
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const joint = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl200Joint === true);
      if (!joint) return;
      const otherId = p.aId === joint.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      const impulse = Number(p.impulse) || 0;
      if (impulse < TWO_TAPS_TUNING.knockImpulseGate) return;
      const now = this._now();
      const index = this._jointIds.indexOf(joint.id);
      if (index < 0) return;
      const last = this._taps.get(joint.id);
      if (last != null && now - last <= TWO_TAPS_TUNING.knockWindowS) {
        // Her knock, learned: two taps, a beat apart, on the same joint.
        this._taps.delete(joint.id);
        joint.data.plantsPl200Knocked = true;
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_200_KNOCK_EVENT, { jointIndex: index, t: now });
        if (index === this._hissingIndex && !this._vented) this._vent(index, 'knock');
        return;
      }
      if (this._taps.size >= TWO_TAPS_TUNING.memoryCap) this._taps.clear();
      this._taps.set(joint.id, now);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== TWO_TAPS_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, TWO_TAPS_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = TWO_TAPS_TUNING;
      this._ensureJoints(station.pos);

      const offShift = offShiftAt(now, t);
      if (this._lastOffShift === true && !offShift) {
        // Shift is on: she goes inside. The armed joint and its pending vent keep their
        // hour — the hiss lands before the hour is out, whatever the shift clock does.
        if (this._moreauId != null) this.helpers?.removeEntity?.(this._moreauId);
        this._moreauId = null;
        this._tap2At = null;
        this._stopUntil = null;
      }
      this._lastOffShift = offShift;

      if (!offShift) {
        if (this._ventDueAt != null && now >= this._ventDueAt) this._vent(this._hissingIndex, 'hour');
        return;
      }

      const day = dayIndexOf(now, t);
      this._ensureMoreau(station.pos);
      const moreau = this._moreauId != null && s.entities?.get ? s.entities.get(this._moreauId) : null;
      if (!moreau?.pos) return;

      if (this._armedDay !== day) {
        this._armedDay = day;
        this._hissingIndex = hissingJointFor(day, t);
        this._vented = false;
        this._ventDueAt = null;
      }

      // The vent keeps its hour even if she is gone.
      if (this._ventDueAt != null && now >= this._ventDueAt) this._vent(this._hissingIndex, 'hour');

      // Walk the trench; at the hissing joint she stops and taps twice.
      const joints = trenchJointsFor(station.pos);
      const target = joints[Math.min(this._targetIndex, joints.length - 1)];
      if (this._stopUntil != null) {
        if (now < this._stopUntil) return;
        this._stopUntil = null;
        this._targetIndex = (this._targetIndex + 1) % joints.length;
        return;
      }
      if (this._tap2At != null) {
        if (now >= this._tap2At) {
          this._tap2At = null;
          this._tapCue(t.tap2Rate);
          this._ventDueAt = now + t.ventDelayS; // the hiss lands inside the hour
          // Two taps done: she moves on to the next joint.
          this._targetIndex = (this._targetIndex + 1) % Math.max(1, t.jointCount);
        }
        return;
      }
      const dx = target.x - moreau.pos.x;
      const dz = target.z - moreau.pos.z;
      const d = Math.hypot(dx, dz);
      const step = t.walkSpeedWu * Math.max(0, Number(dt) || 0);
      if (d <= Math.max(step, 1)) {
        moreau.pos.x = target.x;
        moreau.pos.z = target.z;
        if (this._targetIndex === this._hissingIndex) {
          // One joint gets two taps.
          this._tapCue(t.tap1Rate);
          this._tap2At = now + t.tapGapS;
          this._stopUntil = null;
        } else {
          this._tapCue(t.tap1Rate * 0.95);
          this._stopUntil = now + t.stopS;
        }
      } else {
        moreau.pos.x += (dx / d) * step;
        moreau.pos.z += (dz / d) * step;
      }
    },
  };
}

export const pl200TwoTaps = createPl200TwoTaps();
