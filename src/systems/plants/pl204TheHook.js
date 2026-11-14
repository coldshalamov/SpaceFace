// PL-204 The hook — "Lazlo's crane, idle, hangs its hook at hover height, and the scar's
// pilots sit on it to wait, swaying | Take a seat; or hover near — someone will offer you
// theirs"
//
// SEAM NOTE (honest): Ashfall Reach's only dock is the station_ashcache body in
// sector_ashfall_reach (src/data/sectors.js:1341). Lazlo's crane is a fixed pair of props
// off the live station body — the crane and its hook, hanging at hover height. The scar's
// pilots are real neutral strangers (makeShipEntitySpec, team 2, passive, station faction)
// parked at the hook's seat slots, swaying: a small deterministic sim-time sway moves the
// seated PILOTS and the hook (never the player — nobody writes the player's pose). Take a
// seat and the sway is yours to share; hover nearby and a pilot offers theirs; ignore the
// offer and they leave with it. Bump the hook and the whole perch scatters for the shift.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns crane, hook
//   and pilots, clears session state (tuning.memoryCap).
// - Sway is a bounded sinusoid of simTime, applied only to bodies this plant spawned.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_204_SEATED_EVENT = 'plants:pl204:seated';
export const PL_204_OFFER_EVENT = 'plants:pl204:offered';
export const PL_204_SCATTERED_EVENT = 'plants:pl204:scattered';
export const PL_204_LEFT_EVENT = 'plants:pl204:left';

export const THE_HOOK_TUNING = Object.freeze({
  sectorId: 'sector_ashfall_reach',
  stationId: 'station_ashcache',
  craneOffsetWu: 300,
  hookOffsetWu: 46,           // the hook hangs out from the crane boom
  bearingSalt: 'plantsPl204Crane',
  pilotCount: 2,
  seatRadiusWu: 30,
  seatNeedS: 3,
  seatGateSpeed: 4,
  hoverRadiusWu: 80,
  hoverNeedS: 8,
  offerWindowS: 20,
  swayAmpWu: 3,
  swayAmpSwungWu: 9,          // after a bump the hook swings wide
  swingS: 18,
  swayPeriodS: 6,
  departSpeedWu: 20,
  departRangeWu: 600,
  bumpImpulseGate: 80,
  bumpColdS: 90,
  pilotHull: 'ship_wasp',
  factionId: 'faction_vael',
  hookRadius: 6,
  memoryCap: 8,
});

/** Fixed crane + hook layout off the live station body. */
export function craneLayoutFor(origin, t = THE_HOOK_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const crane = { x: origin.x + dir.x * t.craneOffsetWu, z: origin.z + dir.z * t.craneOffsetWu };
  const hook = { x: crane.x + dir.x * t.hookOffsetWu, z: crane.z + dir.z * t.hookOffsetWu };
  return { crane, hook, dir };
}

/** The deterministic sway of a seated body at sim time. */
export function swayAt(simTime, t = THE_HOOK_TUNING) {
  const w = (Math.PI * 2) / Math.max(1, t.swayPeriodS);
  return Math.sin((Number.isFinite(simTime) ? simTime : 0) * w) * t.swayAmpWu;
}

export function createPl204TheHook() {
  return {
    name: 'plantsPl204',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._craneId = null;
      this._hookId = null;
      this._pilotIds = [];
      this._pilotDeparting = new Map();   // pilotId -> start pos, flying out
      this._seatSince = null;
      this._hoverSince = null;
      this._offerUntil = null;
      this._offerPilotId = null;
      this._seated = false;
      this._swungUntil = null;
      this._bumpedUntil = null;
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
      this._pilotDeparting?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._craneId != null) rm(this._craneId);
        if (this._hookId != null) rm(this._hookId);
        for (const id of this._pilotIds || []) rm(id);
      }
      this._craneId = null;
      this._hookId = null;
      this._pilotIds = [];
      this._pilotDeparting?.clear();
      this._seatSince = null;
      this._hoverSince = null;
      this._offerUntil = null;
      this._offerPilotId = null;
      this._seated = false;
      this._swungUntil = null;
      this._bumpedUntil = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = THE_HOOK_TUNING;
      const { crane, hook } = craneLayoutFor(origin, t);
      if (this._craneId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: crane.x, z: crane.z },
          vel: { x: 0, z: 0 },
          radius: 12,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_lazlo_crane',
            plantsPl204Crane: true,
            placeId: 'place_repair_scaffold_bent',
            everydaySpaceKit: true,
            scanLabel: 'Lazlo\u2019s crane — idle, hook at hover height',
            swarmFloorPad: { label: 'Lazlo\u2019s crane' },
          },
        });
        if (ent && ent.id != null) this._craneId = ent.id;
      }
      if (this._hookId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: hook.x, z: hook.z },
          vel: { x: 0, z: 0 },
          radius: t.hookRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_crane_hook',
            plantsPl204Hook: true,
            scanLabel: 'The hook — the scar\u2019s pilots sit on it to wait',
            swarmFloorPad: { label: 'The hook' },
          },
        });
        if (ent && ent.id != null) this._hookId = ent.id;
      }
      // The scar's pilots, seated opposite ends of the hook, swaying.
      while (this._pilotIds.length < t.pilotCount) {
        const i = this._pilotIds.length;
        const side = i === 0 ? -1 : 1;
        const spec = makeShipEntitySpec(t.pilotHull, {
          team: 2,
          factionId: t.factionId,
          pos: { x: hook.x + side * 12, z: hook.z + side * 4 },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl204Pilot = true;
        spec.data.parentType = 'story_prop';
        spec.data.despawnAt = null;
        spec.data.hookSeatSide = side;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._pilotIds.push(ent.id);
        else break;
      }
    },

    _scatter(now) {
      const t = THE_HOOK_TUNING;
      this._bumpedUntil = now + t.bumpColdS;
      this._swungUntil = now + t.swingS;
      this._seated = false;
      this._seatSince = null;
      this._offerUntil = null;
      this._offerPilotId = null;
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_204_SCATTERED_EVENT, { t: now });
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const hit = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data && (e.data.plantsPl204Hook === true || e.data.plantsPl204Crane === true));
      if (!hit) return;
      const otherId = p.aId === hit.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < THE_HOOK_TUNING.bumpImpulseGate) return;
      this._scatter(this._now());
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== THE_HOOK_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, THE_HOOK_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = THE_HOOK_TUNING;
      const now = this._now();
      this._ensure(station.pos);
      const { hook } = craneLayoutFor(station.pos, t);

      // The sway: hook and seated pilots rock on the sim clock. After a bump it swings wide,
      // and the perch empties for the shift — the pilots fly out and are gone.
      const amp = this._swungUntil != null && now < this._swungUntil ? t.swayAmpSwungWu : t.swayAmpWu;
      const w = (Math.PI * 2) / Math.max(1, t.swayPeriodS);
      const sway = Math.sin(now * w) * amp;
      const hookEnt = this._hookId != null && s.entities?.get ? s.entities.get(this._hookId) : null;
      if (hookEnt?.pos && this._hookId != null) {
        hookEnt.pos.x = hook.x + sway;
        hookEnt.pos.z = hook.z;
      }
      const cold = this._bumpedUntil != null && now < this._bumpedUntil;
      for (const id of this._pilotIds) {
        const pilot = id != null && s.entities?.get ? s.entities.get(id) : null;
        if (!pilot) continue;
        if (this._pilotDeparting.has(id)) {
          // Leaving: fly outward along a fixed bearing until gone.
          const rec = this._pilotDeparting.get(id);
          const stepLen = t.departSpeedWu * Math.max(0, Number(dt) || 0);
          pilot.pos.x += rec.dx * stepLen;
          pilot.pos.z += rec.dz * stepLen;
          if (Math.hypot(pilot.pos.x - hook.x, pilot.pos.z - hook.z) > t.departRangeWu) {
            this.helpers?.removeEntity?.(id);
            if (id === this._offerPilotId) { this._offerPilotId = null; this._offerUntil = null; }
            this.bus?.emit(PL_204_LEFT_EVENT, { pilotId: id, t: now });
          }
          continue;
        }
        if (cold) continue; // perch empty: nobody came back yet
        if (pilot.pos && pilot.data?.hookSeatSide != null) {
          const side = pilot.data.hookSeatSide;
          pilot.pos.x = hook.x + side * 12 + sway * 0.6;
          pilot.pos.z = hook.z + side * 4;
        }
      }

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const dHook = Math.hypot(player.pos.x - hook.x, player.pos.z - hook.z);

      if (!cold && !this._seated && dHook <= t.seatRadiusWu && speed <= t.seatGateSpeed) {
        if (this._seatSince == null) this._seatSince = now;
        else if (now - this._seatSince >= t.seatNeedS) {
          this._seated = true;
          this._seatSince = null;
          if (this._offerUntil != null && now < this._offerUntil) {
            // You took the offered seat: its owner leaves happy on foot.
            if (this._offerPilotId != null) this._departPilot(this._offerPilotId, now);
          }
          this.bus?.emit('audio:cue', { id: 'confirm' });
          this.bus?.emit(PL_204_SEATED_EVENT, { offered: this._offerUntil != null, t: now });
        }
      } else if (this._seated && (dHook > t.seatRadiusWu * 2 || speed > t.seatGateSpeed * 3)) {
        this._seated = false;
      } else if (!this._seated && dHook > t.seatRadiusWu) {
        this._seatSince = null;
      }

      // Hover near — someone will offer you theirs.
      if (!cold && !this._seated && dHook > t.seatRadiusWu && dHook <= t.hoverRadiusWu && speed > t.seatGateSpeed) {
        if (this._hoverSince == null) this._hoverSince = now;
        else if (now - this._hoverSince >= t.hoverNeedS && this._offerUntil == null) {
          this._hoverSince = null;
          const seated = this._pilotIds.find((id) => !this._pilotDeparting.has(id));
          if (seated != null) {
            this._offerUntil = now + t.offerWindowS;
            this._offerPilotId = seated;
            this.bus?.emit('comms:popup', {
              id: `plants:pl204:offer:${Math.round(now)}`,
              sender: 'The scar\u2019s pilots',
              category: 'traffic',
              text: 'Take mine \u2014 I\u2019m stretching my legs.',
              ttl: 8,
              persist: false,
            });
            this.bus?.emit(PL_204_OFFER_EVENT, { pilotId: seated, until: this._offerUntil, t: now });
          }
        }
      } else if (dHook > t.hoverRadiusWu) {
        this._hoverSince = null;
      }
      if (this._offerUntil != null && now >= this._offerUntil) {
        // The offer expired ignored: the pilot takes their seat back and leaves with it.
        this._offerUntil = null;
        if (this._offerPilotId != null) this._departPilot(this._offerPilotId, now);
        this._hoverSince = null;
      }
    },

    _departPilot(pilotId, now) {
      const s = this.state;
      const pilot = pilotId != null && s?.entities?.get ? s.entities.get(pilotId) : null;
      if (pilot?.pos) {
        // Fly outward from the crane's spot: a fixed bearing off the station body.
        const station = stationOf(s, THE_HOOK_TUNING.stationId);
        const ox = station?.pos ? pilot.pos.x - station.pos.x : 1;
        const oz = station?.pos ? pilot.pos.z - station.pos.z : 0;
        const d = Math.max(1, Math.hypot(ox, oz));
        this._pilotDeparting.set(pilotId, { dx: ox / d, dz: oz / d, at: now });
      }
      this._offerPilotId = null;
    },
  };
}

export const pl204TheHook = createPl204TheHook();
