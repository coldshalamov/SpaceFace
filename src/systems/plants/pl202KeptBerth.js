// PL-202 The kept berth — "One berth on Rib Street stands empty, chalked RESERVED, and every
// ship honours it | Park in it and feel the whole street stare until you move — a funeral tow
// is always coming; or honour it, and be seen to"
//
// SEAM NOTE (honest): Rib Street is a fixed row of berth props off the live station_drift
// body in sector_pallas_drift (src/data/sectors.js:736). One berth — hash-picked — stands
// empty, chalked RESERVED (a swarm floor pad label the street layer can read). The other
// berths hold parked street hulls (story props with lamps). Park in the reserved berth and
// the whole street stares: every street hull turns to face you and its lamp dims, and a
// REAL funeral tow (makeShipEntitySpec tug, team 2, passive) is dispatched from the station.
// Move out before it arrives and the street relights; let it arrive and it shoves you off
// the chalk — the tow always wins. Park in any other berth and the street nods: honour it,
// and be seen to.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the street,
//   the tow, and clears session state (tuning.memoryCap).
// - The tow never writes the player's course: it applies one queuePhysicsImpulse and leaves.
// - The stare, the tow dispatch, and the shove are each cooldown-gated per visit.

import { hash32 } from '../../core/rng.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';
import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PL_202_STARE_EVENT = 'plants:pl202:stare';
export const PL_202_TOW_EVENT = 'plants:pl202:tow';
export const PL_202_SHOVED_EVENT = 'plants:pl202:shoved';
export const PL_202_MOVED_EVENT = 'plants:pl202:moved';
export const PL_202_KEPT_EVENT = 'plants:pl202:kept';

export const KEPT_BERTH_TUNING = Object.freeze({
  sectorId: 'sector_pallas_drift',
  stationId: 'station_drift',
  streetCount: 5,
  berthSpacingWu: 80,
  streetOffsetWu: 260,
  bearingSalt: 'plantsPl202RibStreet',
  parkGateSpeed: 5,
  parkNeedS: 2.5,
  stareHoldS: 30,             // the street stares until you move
  towDispatchS: 6,            // a funeral tow is always coming
  towSpeedWu: 26,
  towArriveWu: 28,
  shoveImpulse: 240,
  honourRadiusWu: 40,
  honourCooldownS: 45,
  hullRadius: 8,
  memoryCap: 8,
});

export const RESERVED_SALT = 'plantsPl202Reserved';
export const TOW_HULL = 'ship_hawser';

/** Fixed Rib Street layout off the live station body. */
export function ribStreetFor(origin, t = KEPT_BERTH_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const perp = { x: -dir.z, z: dir.x };
  const berths = [];
  for (let i = 0; i < t.streetCount; i += 1) {
    const along = t.streetOffsetWu + i * t.berthSpacingWu;
    berths.push({
      x: origin.x + dir.x * along + perp.x * 40,
      z: origin.z + dir.z * along + perp.z * 40,
    });
  }
  return berths;
}

/** Which berth on the street stands chalked RESERVED. */
export function reservedBerthIndex(t = KEPT_BERTH_TUNING) {
  return hash32(RESERVED_SALT, t.stationId) % t.streetCount;
}

export function createPl202KeptBerth() {
  return {
    name: 'plantsPl202',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._streetIds = [];       // parked street hulls (index-aligned with the layout)
      this._reservedId = null;    // the chalked RESERVED marker
      this._towId = null;
      this._staring = false;
      this._stareUntil = null;
      this._towDueAt = null;
      this._parkSince = null;
      this._lastHonourAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
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
      this._lastHonourAt = -Infinity;
      this._drop();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._streetIds || []) rm(id);
        if (this._reservedId != null) rm(this._reservedId);
        if (this._towId != null) rm(this._towId);
      }
      this._streetIds = [];
      this._reservedId = null;
      this._towId = null;
      this._staring = false;
      this._stareUntil = null;
      this._towDueAt = null;
      this._parkSince = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensureStreet(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._streetIds.length) return;
      const t = KEPT_BERTH_TUNING;
      const berths = ribStreetFor(origin, t);
      const reserved = reservedBerthIndex(t);
      // The chalked RESERVED marker: an empty berth that every ship honours.
      const marker = spawn({
        type: 'beacon',
        pos: { x: berths[reserved].x, z: berths[reserved].z },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_reserved_berth',
          plantsPl202Reserved: true,
          scanLabel: 'A berth chalked RESERVED — the street honours it',
          swarmFloorPad: { label: 'RESERVED' },
        },
      });
      if (marker && marker.id != null) this._reservedId = marker.id;
      // Every other berth holds a parked hull with its lamp on.
      for (let i = 0; i < berths.length; i += 1) {
        if (i === reserved) { this._streetIds.push(null); continue; }
        const ent = spawn({
          type: 'beacon',
          pos: { x: berths[i].x, z: berths[i].z },
          vel: { x: 0, z: 0 },
          radius: t.hullRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_rib_street_hull',
            plantsPl202Street: true,
            scanLabel: 'A parked hull on Rib Street',
            lampsFlashing: true,
          },
        });
        this._streetIds.push(ent && ent.id != null ? ent.id : null);
      }
    },

    _dispatchTow(origin, berthPos, now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._towId != null) return;
      const spec = makeShipEntitySpec(TOW_HULL, {
        team: 2,
        factionId: 'faction_mts',
        pos: { x: origin.x, z: origin.z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl202Tow = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = 'Funeral tow';
      spec.data.despawnAt = null;
      const ent = spawn(spec);
      if (ent && ent.id != null) {
        this._towId = ent.id;
        this._towTarget = { x: berthPos.x, z: berthPos.z };
        this.bus?.emit(PL_202_TOW_EVENT, { towId: ent.id, t: now });
      }
    },

    _endStare() {
      if (!this._staring) return;
      this._staring = false;
      this._stareUntil = null;
      const s = this.state;
      for (const id of this._streetIds) {
        const hull = id != null && s?.entities?.get ? s.entities.get(id) : null;
        if (hull?.data) {
          hull.data.lampsFlashing = true;
          hull.data.facingPlayerUntil = null;
        }
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== KEPT_BERTH_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, KEPT_BERTH_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = KEPT_BERTH_TUNING;
      const now = this._now();
      this._ensureStreet(station.pos);

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const berths = ribStreetFor(station.pos, t);
      const reserved = reservedBerthIndex(t);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);

      // Fly the tow while it is out.
      if (this._towId != null) {
        const tow = s.entities?.get ? s.entities.get(this._towId) : null;
        if (!tow || tow.alive === false || !tow.pos) {
          this._towId = null;
        } else if (this._towTarget) {
          const dx = this._towTarget.x - tow.pos.x;
          const dz = this._towTarget.z - tow.pos.z;
          const d = Math.hypot(dx, dz);
          const step = t.towSpeedWu * Math.max(0, Number(dt) || 0);
          const arrived = d <= Math.max(step, t.towArriveWu);
          if (arrived) {
            tow.pos.x = this._towTarget.x;
            tow.pos.z = this._towTarget.z;
            const atReserved = Math.hypot(player.pos.x - this._towTarget.x, player.pos.z - this._towTarget.z)
              <= t.honourRadiusWu;
            if (atReserved && this._staring && speed <= t.parkGateSpeed) {
              // The tow always wins: one honest shove off the chalk, then it stands down.
              const ox = player.pos.x - this._towTarget.x;
              const oz = player.pos.z - this._towTarget.z;
              const od = Math.max(1, Math.hypot(ox, oz));
              queuePhysicsImpulse(player, { x: (ox / od) * t.shoveImpulse, z: (oz / od) * t.shoveImpulse },
                { tick: s.tick, externalEffect: true, isPlayerTarget: true });
              this.bus?.emit('audio:cue', { id: 'ui_deny' });
              this.bus?.emit(PL_202_SHOVED_EVENT, { towId: tow.id, t: now });
            }
            this.helpers?.removeEntity?.(tow.id);
            this._towId = null;
            this._towTarget = null;
            this._endStare();
          } else {
            tow.pos.x += (dx / d) * step;
            tow.pos.z += (dz / d) * step;
          }
        }
      }

      // In the reserved berth, slow: the street takes notice.
      const dReserved = Math.hypot(player.pos.x - berths[reserved].x, player.pos.z - berths[reserved].z);
      const inReserved = dReserved <= t.honourRadiusWu;
      if (inReserved && speed <= t.parkGateSpeed) {
        if (this._parkSince == null) this._parkSince = now;
        const parkedFor = now - this._parkSince;
        if (parkedFor >= t.parkNeedS && !this._staring) {
          this._staring = true;
          this._stareUntil = now + t.stareHoldS;
          for (const id of this._streetIds) {
            const hull = id != null && s.entities?.get ? s.entities.get(id) : null;
            if (hull?.pos && hull.data) {
              hull.data.lampsFlashing = false; // the street dims you out
              hull.data.facingPlayerUntil = now + t.stareHoldS;
              hull.rot = Math.atan2(player.pos.z - hull.pos.z, player.pos.x - hull.pos.x);
            }
          }
          this.bus?.emit(PL_202_STARE_EVENT, { berthIndex: reserved, t: now });
          if (this._towId == null && this._towDueAt == null) {
            this._towDueAt = now + t.towDispatchS;
          }
        }
        if (this._towDueAt != null && now >= this._towDueAt && this._towId == null) {
          this._towDueAt = null;
          this._dispatchTow(station.pos, berths[reserved], now);
        }
      } else {
        this._parkSince = null;
        if (this._staring && (speed > t.parkGateSpeed || !inReserved)) {
          // You moved: the street relights, and remembers.
          this._endStare();
          if (this._towDueAt != null) this._towDueAt = null;
          this.bus?.emit(PL_202_MOVED_EVENT, { berthIndex: reserved, t: now });
        }
      }

      // Honour it, and be seen to: any other berth, slow, gets the street's nod.
      if (!inReserved && speed <= t.parkGateSpeed && now >= this._lastHonourAt + t.honourCooldownS) {
        for (let i = 0; i < berths.length; i += 1) {
          if (i === reserved) continue;
          const d = Math.hypot(player.pos.x - berths[i].x, player.pos.z - berths[i].z);
          if (d <= t.honourRadiusWu) {
            this._lastHonourAt = now;
            const hull = this._streetIds[i] != null && s.entities?.get
              ? s.entities.get(this._streetIds[i]) : null;
            if (hull?.data) {
              hull.data.lampsFlashing = true;
              hull.data.lampFlashUntil = now + 2;
            }
            this.bus?.emit('audio:cue', { id: 'confirm' });
            this.bus?.emit(PL_202_KEPT_EVENT, { berthIndex: i, t: now });
            break;
          }
        }
      }
    },
  };
}

export const pl202KeptBerth = createPl202KeptBerth();
