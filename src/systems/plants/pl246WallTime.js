// PL-246 Wall time — "Ten seconds before the Plume, the whole lane parks nose-in against
// the Plate, like sardines | Park with them; or be the loose thing the Plume takes"
//
// SEAM NOTE (honest substitutes declared): Io Reach has no authored "Plate" or "Plume"
// set piece in code, so this plant lays both honestly: the Plate is a fixed wall of kit
// props off the live station_reach body in sector_io_reach (src/data/sectors.js:884), and
// the Plume is a vent in it that fires on a fixed cycle of the shared plant clock — a real
// audio cue plus a physical shove. The lane's parkers are real neutral strangers
// (makeShipEntitySpec, team 2, passive): ten seconds before each Plume they move to
// nose-in slots against the Plate and park — sardines, on the clock. Park with them
// (inside the plume corridor, slow, nose-in) and the Plume passes over you. Be the loose
// thing — in the corridor, not parked nose-in — and the Plume takes you: one honest
// queuePhysicsImpulse along the vent's blast line, bounded and cooldown-gated. Outside
// the corridor the Plume is a light and a sound.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the Plate,
//   the vent and the parkers, clears session state (tuning.memoryCap).
// - The shove never writes velocity directly, lands at most once per Plume, and only on
//   bodies actually inside the corridor when it fires.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_246_WARN_EVENT = 'plants:pl246:warn';
export const PL_246_PARKED_EVENT = 'plants:pl246:parked';
export const PL_246_PLUME_EVENT = 'plants:pl246:plume';
export const PL_246_TAKEN_EVENT = 'plants:pl246:taken';

export const WALL_TIME_TUNING = Object.freeze({
  sectorId: 'sector_io_reach',
  stationId: 'station_reach',
  plateOffsetWu: 380,
  plateLengthWu: 360,         // the wall of parked hulls
  bearingSalt: 'plantsPl246Plate',
  plateSegCount: 3,
  plumePeriodS: 120,          // the vent fires on this clock
  warnLeadS: 10,              // ten seconds before, the lane parks
  parkRadiusWu: 46,           // nose-in distance from the plate line
  parkGateSpeed: 5,
  noseToleranceRad: 0.7,      // facing the plate counts as nose-in
  corridorHalfWu: 90,         // the Plume scours this band above the plate
  plumeRate: 1.6,
  plumeGain: 0.6,
  plumeImpulse: 320,
  approachSpeedWu: 30,        // the lane covers the ten seconds of warning from a short approach
  parkerApproachWu: 140,      // the lane loiters this far off the Plate between Plumes
  parkerCount: 4,
  parkerHulls: Object.freeze(['ship_kestrel', 'ship_drifter', 'ship_kestrel', 'ship_wasp']),
  factionId: 'faction_free',
  hullRadius: 8,
  memoryCap: 6,
});

/** Fixed Plate layout: a wall line + the vent at its centre, off the live station body. */
export function plateFor(origin, t = WALL_TIME_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const perp = { x: -dir.z, z: dir.x };
  const center = {
    x: origin.x + perp.x * t.plateOffsetWu,
    z: origin.z + perp.z * t.plateOffsetWu,
  };
  const segs = [];
  for (let i = 0; i < t.plateSegCount; i += 1) {
    const u = (i - (t.plateSegCount - 1) / 2) * (t.plateLengthWu / t.plateSegCount);
    segs.push({ x: center.x + dir.x * u, z: center.z + dir.z * u });
  }
  return { center, segs, along: dir, out: perp };
}

/** Phase of the Plume clock at sim time, and whether the lane should be parked. */
export function plumePhaseAt(simTime, t = WALL_TIME_TUNING) {
  const period = Math.max(1, t.plumePeriodS);
  const phase = ((simTime % period) + period) % period;
  return {
    phase,
    untilFire: period - phase,
    warnWindow: t.warnLeadS,
    shouldPark: phase >= period - t.warnLeadS,
    firing: phase < 2,          // the vent itself scours for the first two seconds
  };
}

/** Is a body parked nose-in: close to the plate line, slow, and facing it. */
export function isParkedNoseIn(pos, vel, rot, plate, t = WALL_TIME_TUNING) {
  if (!pos) return false;
  const rel = { x: pos.x - plate.center.x, z: pos.z - plate.center.z };
  const across = Math.abs(rel.x * plate.out.x + rel.z * plate.out.z);
  const along = Math.abs(rel.x * plate.along.x + rel.z * plate.along.z);
  if (across > t.parkRadiusWu || along > t.plateLengthWu / 2 + 40) return false;
  const speed = Math.hypot(Number(vel?.x) || 0, Number(vel?.z) || 0);
  if (speed > t.parkGateSpeed) return false;
  const noseRot = Math.atan2(-plate.out.z, -plate.out.x);
  if (typeof rot !== 'number' || !Number.isFinite(rot)) return false;
  const off = Math.atan2(Math.sin(rot - noseRot), Math.cos(rot - noseRot));
  return Math.abs(off) <= t.noseToleranceRad;
}

export function createPl246WallTime() {
  return {
    name: 'plantsPl246',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._plateIds = [];
      this._ventId = null;
      this._parkerIds = [];
      this._warnedCycle = null;
      this._firedCycle = null;
      this._playerParkedCycle = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._resetVisit());
      on('save:loaded', () => this._resetVisit());
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
      this._despawnAll();
    },

    _despawnAll() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._plateIds || []) rm(id);
        if (this._ventId != null) rm(this._ventId);
        for (const id of this._parkerIds || []) rm(id);
      }
      this._plateIds = [];
      this._ventId = null;
      this._parkerIds = [];
      this._warnedCycle = null;
      this._firedCycle = null;
      this._playerParkedCycle = null;
    },

    _resetVisit() {
      this._despawnAll();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = WALL_TIME_TUNING;
      const plate = plateFor(origin, t);
      if (!this._plateIds.length) {
        plate.segs.forEach((pos, i) => {
          const ent = spawn({
            type: 'beacon',
            pos: { x: pos.x, z: pos.z },
            vel: { x: 0, z: 0 },
            radius: 16,
            mass: 1e6,
            hull: 1,
            hullMax: 1,
            homeSectorId: t.sectorId,
            data: {
              parentType: 'story_prop',
              storyPropKind: 'plants_the_plate',
              plantsPl246Plate: true,
              placeId: 'place_ore_bulk_container',
              everydaySpaceKit: true,
              scanLabel: 'The Plate — the lane parks nose-in against it',
              swarmFloorPad: { label: 'The Plate' },
            },
          });
          this._plateIds.push(ent && ent.id != null ? ent.id : null);
        });
      }
      if (this._ventId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: plate.center.x, z: plate.center.z },
          vel: { x: 0, z: 0 },
          radius: 9,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_the_plume',
            plantsPl246Vent: true,
            scanLabel: 'The Plume — ten seconds of warning, then it scours',
            swarmFloorPad: { label: 'The Plume' },
          },
        });
        if (ent && ent.id != null) this._ventId = ent.id;
      }
      // The lane's parkers: real hulls that know the clock.
      while (this._parkerIds.length < t.parkerCount) {
        const i = this._parkerIds.length;
        const spec = makeShipEntitySpec(t.parkerHulls[i % t.parkerHulls.length], {
          team: 2,
          factionId: t.factionId,
          pos: {
            x: plate.center.x + plate.along.x * ((i - 1.5) * 70)
              + plate.out.x * WALL_TIME_TUNING.parkerApproachWu,
            z: plate.center.z + plate.along.z * ((i - 1.5) * 70)
              + plate.out.z * WALL_TIME_TUNING.parkerApproachWu,
          },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl246Parker = true;
        spec.data.parentType = 'story_prop';
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._parkerIds.push(ent.id);
        else break;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== WALL_TIME_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, WALL_TIME_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = WALL_TIME_TUNING;
      const now = this._now();
      this._ensure(station.pos);
      const plate = plateFor(station.pos, t);
      const cycle = Math.floor(now / Math.max(1, t.plumePeriodS));
      const { untilFire, shouldPark, firing } = plumePhaseAt(now, t);

      // Ten seconds before the Plume, the whole lane parks nose-in against the Plate.
      const noseRot = Math.atan2(-plate.out.z, -plate.out.x);
      this._parkerIds.forEach((id, i) => {
        const parker = id != null && s.entities?.get ? s.entities.get(id) : null;
        if (!parker?.pos) return;
        if (shouldPark) {
          const u = (i - (t.parkerCount - 1) / 2) * 66;
          const slot = {
            x: plate.center.x + plate.along.x * u + plate.out.x * (t.parkRadiusWu - 10),
            z: plate.center.z + plate.along.z * u + plate.out.z * (t.parkRadiusWu - 10),
          };
          const dx = slot.x - parker.pos.x;
          const dz = slot.z - parker.pos.z;
          const d = Math.hypot(dx, dz);
          const step = WALL_TIME_TUNING.approachSpeedWu * Math.max(0, Number(dt) || 0);
          if (d > Math.max(step, 1)) {
            parker.pos.x += (dx / d) * step;
            parker.pos.z += (dz / d) * step;
          } else {
            parker.pos.x = slot.x;
            parker.pos.z = slot.z;
            parker.rot = noseRot;
            parker.data.parkedNoseIn = true;
          }
        } else if (parker.data?.parkedNoseIn === true) {
          parker.data.parkedNoseIn = false; // the Plume passed; the lane breathes again
        }
      });

      // The ten-second warning, once per cycle, for anyone in the corridor.
      if (shouldPark && this._warnedCycle !== cycle) {
        this._warnedCycle = cycle;
        this.bus?.emit('audio:cue', { id: 'warning' });
        this.bus?.emit(PL_246_WARN_EVENT, { cycle, untilFire: Math.round(untilFire), t: now });
      }

      // The Plume fires.
      if (firing && this._firedCycle !== cycle) {
        this._firedCycle = cycle;
        const vent = this._ventId != null && s.entities?.get ? s.entities.get(this._ventId) : null;
        if (vent?.data) {
          vent.data.lampsFlashing = true;
          vent.data.lampFlashUntil = now + 2;
        }
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: t.plumeRate, gain: t.plumeGain });
        this.bus?.emit(PL_246_PLUME_EVENT, { cycle, t: now });

        const player = s.entities?.get ? s.entities.get(s.playerId) : null;
        if (player?.pos) {
          const rel = {
            x: player.pos.x - plate.center.x,
            z: player.pos.z - plate.center.z,
          };
          const across = rel.x * plate.out.x + rel.z * plate.out.z;
          const along = rel.x * plate.along.x + rel.z * plate.along.z;
          const parkedWithThem = isParkedNoseIn(player.pos, player.vel, player.rot, plate, t);
          if (parkedWithThem) {
            // Park with them: the Plume passes over.
            if (this._playerParkedCycle !== cycle) {
              this._playerParkedCycle = cycle;
              this.bus?.emit('audio:cue', { id: 'confirm', gain: 0.3 });
              this.bus?.emit(PL_246_PARKED_EVENT, { cycle, t: now });
            }
          } else if (Math.abs(across) <= t.corridorHalfWu
            && Math.abs(along) <= t.plateLengthWu / 2 + 60) {
            // Be the loose thing the Plume takes: one honest shove along the blast line.
            const sign = across >= 0 ? 1 : -1;
            queuePhysicsImpulse(player,
              { x: plate.out.x * sign * t.plumeImpulse, z: plate.out.z * sign * t.plumeImpulse },
              { tick: s.tick, reason: 'plants:pl246:plume', externalEffect: true, isPlayerTarget: true });
            this.bus?.emit('audio:cue', { id: 'ui_deny' });
            this.bus?.emit(PL_246_TAKEN_EVENT, { cycle, distanceWu: Math.round(Math.abs(across)), t: now });
          }
        }
      }
    },
  };
}

export const pl246WallTime = createPl246WallTime();
