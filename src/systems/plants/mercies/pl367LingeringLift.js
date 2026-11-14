// PL-367 The lingering lift — "A dead station's lift still runs — somebody keeps it oiled —
// hauling small hulls up the spine to a long view and a stashed gift at the top | Ride it and
// leave the gift for the next hull; or carve your name in the car — it stops at your floor
// forever after"
//
// Seams (verified): the dead station and its car are REAL story props in sector_sedna_dark,
// anchored at hash32-derived offsets off the verified poi_claim_far_ledger
// (src/data/claimableBodies.js). The ride is physical: hold station inside the car's radius at
// the bottom dock and the car climbs the spine, HAULING its rider with it (the plants' own law:
// bodies move — rider position is stamped to the car while the ride lasts, and the ride ends
// the instant the rider burns hard, speed above restSpeedWu, or steps out of the radius). At
// the top: the long view stamp and the stashed gift — a real pod. Leaving it = not taking it;
// the next hull that rides up while it's there gets the thanks beat. Carving is physical too:
// hold station pressed against the idle car wall (within carveRadiusWu) for carveHoldS — hull
// against hull, that is a carve — and the car stops at that floor forever after.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl367*`). Props respawn on sector re-entry.
// - One ride at a time; the car never carries a rider past the spine top.
// - No economy mutation: the gift is a physical pod; thanks is stamps and one voice line.

import { hash32 } from '../../../core/rng.js';

export const PL_367_RIDE_EVENT = 'plants:pl367:ride';
export const PL_367_GIFT_EVENT = 'plants:pl367:gift';
export const PL_367_GIFT_LEFT_EVENT = 'plants:pl367:giftLeft';
export const PL_367_CARVED_EVENT = 'plants:pl367:carved';

export const LINGERING_LIFT_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  poiX: -2600,                // verified claim-site POI poi_claim_far_ledger (sector-local)
  poiZ: -1700,
  stationOffsetWu: 900,       // the dead station, off the POI at a hash32 offset
  spineLenWu: 420,            // "up the spine": the car's climb distance
  spineAngleRad: Math.PI / 2, // the spine points off-sector; pure geometry
  rideRadiusWu: 24,           // inside 0.6× this of the car = riding; the 0.7–1.0 band = the carve ring
  climbRateWuS: 14,           // somebody keeps it oiled: slow and sure
  restSpeedWu: 8,             // burn harder than this and the car leaves you behind
  carveHoldS: 6,              // held in the carve ring this long = a name carved
  giftAmount: 1,
  memoryCap: 4,               // bounded bookkeeping
});

export const PL_367_CARVED_FLAG = 'plantsPl367Carved';

/** Pure: the dead station, car dock (bottom), and top-of-spine positions. */
export function liftPositions(t = LINGERING_LIFT_TUNING) {
  const roll = hash32('plantsPl367Lift', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const station = {
    x: t.poiX + Math.cos(ang) * t.stationOffsetWu,
    z: t.poiZ + Math.sin(ang) * t.stationOffsetWu,
  };
  const dock = { x: station.x + 30, z: station.z + 8 };
  const top = {
    x: dock.x + Math.cos(t.spineAngleRad) * t.spineLenWu,
    z: dock.z + Math.sin(t.spineAngleRad) * t.spineLenWu,
  };
  return { station, dock, top };
}

/** Pure: where the car is on its spine after climbing progress [0..1]. */
export function carPosAt(progress, t = LINGERING_LIFT_TUNING) {
  const { dock, top } = liftPositions(t);
  const f = Math.max(0, Math.min(1, Number(progress) || 0));
  return { x: dock.x + (top.x - dock.x) * f, z: dock.z + (top.z - dock.z) * f };
}

/** Pure: the dead station's prop spec. */
export function deadStationSpec(pos) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 30,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_dead_station',
      plantsPl367Station: true,
      scanLabel: 'A dead station. The lift still runs — somebody keeps it oiled.',
      swarmFloorPad: { label: 'Dead station' },
    },
  };
}

/** Pure: the lift car's prop spec; the carved chalk changes what everyone scans. */
export function liftCarSpec(pos, carvedBy = null) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 16,
    mass: 1e6,
    hull: 20,
    hullMax: 20,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_lingering_lift',
      plantsPl367Car: true,
      scanLabel: carvedBy == null
        ? 'The lift car. It hauls small hulls up the spine to the long view.'
        : 'The lift car. It stops at the carved floor forever after.',
      swarmFloorPad: { label: carvedBy == null ? 'The lift' : 'Your floor now' },
      carvedBy,
      lampLit: true,
    },
  };
}

export function createPl367LingeringLift() {
  return {
    name: 'plantsPl367',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._stationId = null;
      this._carId = null;
      this._giftPodId = null;
      this._progress = 0;         // 0 = docked at the bottom, 1 = the long view
      this._riding = false;
      this._carveStartAt = null;
      this._giftAtRideStart = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('pickup:collected', (p = {}) => {
        // The gift taken is the stash spent: no thanks beat, and no new stash.
        if (p && p.pickupId != null && p.pickupId === this._giftPodId) this._giftPodId = null;
      });
      on('sector:exit', () => this._despawnProps());
      on('save:loaded', () => this._despawnProps());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnProps();
      this._riding = false;
      this._carveStartAt = null;
      this._giftAtRideStart = false;
    },

    _hardReset() {
      this._despawnProps();
      this._progress = 0;
      this._riding = false;
      this._carveStartAt = null;
      this._giftAtRideStart = false;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnProps() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._stationId != null) rm(this._stationId);
        if (this._carId != null) rm(this._carId);
        if (this._giftPodId != null) rm(this._giftPodId);
      }
      this._stationId = null;
      this._carId = null;
      this._giftPodId = null;
      this._riding = false;
    },

    _carved() { return this._flags()?.[PL_367_CARVED_FLAG] === true; },

    _player() {
      const s = this.state;
      return s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === LINGERING_LIFT_TUNING.sectorId;
      if (!inSector) { if (this._stationId != null) this._despawnProps(); return; }
      const now = this._now();
      const step = Math.max(0, Number(dt) || 0);
      const pos = liftPositions();

      // Respawn props (bounded).
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function') {
        if (this._stationId == null) {
          const ent = spawn(deadStationSpec(pos.station));
          if (ent && ent.id != null) this._stationId = ent.id;
        }
        if (this._carId == null) {
          const ent = spawn(liftCarSpec(carPosAt(this._progress), this._carved()
            ? this._flags()?.plantsPl367CarvedBy ?? 'someone'
            : null));
          if (ent && ent.id != null) this._carId = ent.id;
        }
      }
      const car = this._carId != null && s.entities?.get ? s.entities.get(this._carId) : null;
      if (!car || !car.pos) return;
      const player = this._player();
      if (!player || !player.pos) return;

      const carveFloor = this._carved() ? Number(this._flags()?.plantsPl367CarveFloor ?? -1) : -1;

      // Carving: hold station pressed against the idle car wall at the dock.
      const vx = Number(player.vel && player.vel.x) || 0;
      const vz = Number(player.vel && player.vel.z) || 0;
      const speed = Math.sqrt(vx * vx + vz * vz);
      const dxp = player.pos.x - car.pos.x;
      const dzp = player.pos.z - car.pos.z;
      const distSq = dxp * dxp + dzp * dzp;
      // Carving is the wall ring of the idle car; boarding is stepping INSIDE it. Two
      // different physical acts at the dock, never confused.
      const carveRingOuter = LINGERING_LIFT_TUNING.rideRadiusWu;
      const carveRingInner = LINGERING_LIFT_TUNING.rideRadiusWu * 0.7;
      const pressedIdle = this._progress === 0 && !this._riding
        && speed <= LINGERING_LIFT_TUNING.restSpeedWu
        && distSq <= carveRingOuter * carveRingOuter
        && distSq >= carveRingInner * carveRingInner;
      if (pressedIdle && !this._carved()) {
        if (this._carveStartAt == null) this._carveStartAt = now;
        if (now - this._carveStartAt >= LINGERING_LIFT_TUNING.carveHoldS) {
          const flags = this._flags();
          if (flags) {
            flags[PL_367_CARVED_FLAG] = true;
            flags.plantsPl367CarvedBy = s.playerId ?? 'someone';
            flags.plantsPl367CarveFloor = 0;
          }
          this._carveStartAt = null;
          car.data.carvedBy = flags ? flags.plantsPl367CarvedBy : 'someone';
          car.data.scanLabel = 'The lift car. It stops at the carved floor forever after.';
          car.data.swarmFloorPad = { label: 'Your floor now' };
          this.bus?.emit('comms:popup', {
            id: `plants:pl367:carved:${Math.round(now)}`,
            sender: 'The lift',
            category: 'story',
            text: 'It stops at your floor now.',
            ttl: 9,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'ui_deny' });
          this.bus?.emit(PL_367_CARVED_EVENT, { floor: 0, pos: { x: car.pos.x, z: car.pos.z }, t: now });
        }
      } else if (!pressedIdle) {
        this._carveStartAt = null;
      }

      // The car only serves below the carved floor, and never climbs past the spine top.
      const canClimb = !this._carved() || carveFloor < 0;
      const distToDock = (() => {
        const dx = player.pos.x - pos.dock.x;
        const dz = player.pos.z - pos.dock.z;
        return dx * dx + dz * dz;
      })();

      if (!this._riding && canClimb && this._progress === 0
        && speed <= LINGERING_LIFT_TUNING.restSpeedWu
        && distSq <= (LINGERING_LIFT_TUNING.rideRadiusWu * 0.6) * (LINGERING_LIFT_TUNING.rideRadiusWu * 0.6)) {
        // Board at the dock (step inside the car): it takes you up.
        this._riding = true;
        this._giftAtRideStart = this._giftPodId != null; // was a gift waiting before you boarded?
        this.bus?.emit(PL_367_RIDE_EVENT, { riderId: s.playerId, pos: { x: car.pos.x, z: car.pos.z }, t: now });
      }

      if (this._riding) {
        // The ride ends if the rider burns hard or drifts out of the car.
        if (speed > LINGERING_LIFT_TUNING.restSpeedWu
          || distSq > (LINGERING_LIFT_TUNING.rideRadiusWu * 1.5) * (LINGERING_LIFT_TUNING.rideRadiusWu * 1.5)) {
          this._riding = false; // the car leaves you where you dropped off
        } else {
          this._progress = Math.min(1, this._progress + (LINGERING_LIFT_TUNING.climbRateWuS * step) / LINGERING_LIFT_TUNING.spineLenWu);
          const cp = carPosAt(this._progress);
          car.pos.x = cp.x;
          car.pos.z = cp.z;
          // The haul: the rider moves with the car (the plants' law — bodies move).
          player.pos.x = cp.x;
          player.pos.z = cp.z;
          if (this._progress >= 1) {
            this._riding = false;
            player.data = player.data || {};
            player.data.plantsPl367LongView = true; // the long view, stamped
            this.bus?.emit('comms:popup', {
              id: `plants:pl367:view:${Math.round(now)}`,
              sender: 'The long view',
              category: 'story',
              text: 'The whole dark, laid out.',
              ttl: 8,
              persist: false,
            });
            // The stashed gift at the top, exactly once — unless a previous hull left it.
            if (this._giftPodId != null && this._giftAtRideStart) {
              // You left it for the next hull on an earlier ride; the thanks lands now.
              this.bus?.emit('comms:popup', {
                id: `plants:pl367:left:${Math.round(now)}`,
                sender: 'The next hull',
                category: 'story',
                text: 'Found it waiting. Thank you.',
                ttl: 8,
                persist: false,
              });
              this.bus?.emit(PL_367_GIFT_LEFT_EVENT, {
                giftPodId: this._giftPodId,
                pos: { x: car.pos.x, z: car.pos.z },
                t: now,
              });
              this._giftAtRideStart = false; // one thanks per left gift
            } else if (this._giftPodId == null && typeof spawn === 'function') {
              const pod = spawn({
                type: 'payload',
                pos: { x: car.pos.x + 8, z: car.pos.z + 4 },
                vel: { x: 0, z: 0 },
                radius: 4,
                mass: 20,
                physicsBody: { mass: 20 },
                hull: 40,
                hullMax: 40,
                collides: true,
                flags: { persistent: true },
                data: {
                  kind: 'payload',
                  payloadType: 'gift_pod',
                  plantsPl367Gift: true,
                  scanLabel: 'A stashed gift at the top, tagged: for the next hull.',
                  swarmFloorPad: { label: 'The gift' },
                  salvagePool: { cmdty_comp_circuitry: LINGERING_LIFT_TUNING.giftAmount },
                  ownerId: null,
                  factionId: 'player',
                },
              });
              if (pod && pod.id != null) this._giftPodId = pod.id;
              this.bus?.emit(PL_367_GIFT_EVENT, { giftPodId: pod ? pod.id : null, t: now });
            }
            // The car descends empty for the next hull.
            this._progress = 0;
            const dp = carPosAt(0);
            car.pos.x = dp.x;
            car.pos.z = dp.z;
          }
        }
      } else if (this._progress === 0 && distToDock > (LINGERING_LIFT_TUNING.rideRadiusWu * 3) ** 2) {
        // Idle at the dock, parked where it belongs.
        const dp = carPosAt(0);
        car.pos.x = dp.x;
        car.pos.z = dp.z;
      }
    },
  };
}

export const pl367LingeringLift = createPl367LingeringLift();
