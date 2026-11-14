// PL-283 The gull drone — Pallas (design/program/INFERENCE_PLANTS.md, row PL-283).
// "The gull drone. A scrap-gull drone drops one shiny thing on your deck as you pass — a
// button, a ring, a charge cap. It does not want anything."
// What the player can do: Keep the gift; or shoot at gulls — gulls remember hulls, and
// this street's gulls will not gift you twice.
//
// SEAM NOTE (honest): the gulls are small drone props (everyday-kit place_welding_drone
// bodies) that fly a deterministic circuit around the market ring of the REAL Drift
// Market body (station_drift, sector_pallas_drift) — the module owns their motion on the
// sim clock. The drop is a real payload prop ("a button, a ring, a charge cap" — hash
// pick) landing at your quarter; keeping it is proximity pickup. Shooting at gulls is a
// real combat:fire receipt (ownerId = the player's hull) while a gull is inside the
// street's hurt range of you. Gulls remember hulls via a bounded Map keyed hull+street
// AND the flag-borne receipt (state.story.flags.plantsPl283ShotGulls): they keep flying
// this street forever, but they will not gift your hull twice.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; circuit, drop pick and cooldowns are
//   pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns gulls and gifts.
// - The gull does not want anything: it never speaks. One ambient cue per drop.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_283_GIFT_EVENT = 'plants:pl283:gift';
export const PL_283_KEPT_EVENT = 'plants:pl283:kept';
export const PL_283_SHOT_EVENT = 'plants:pl283:shot';

export const GULL_DRONE_TUNING = Object.freeze({
  stationId: 'station_drift',
  sectorId: 'sector_pallas_drift',
  dayLengthS: 240,
  ringRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the market ring circuit
  gullCount: 2,
  circuitSpeedRadS: 0.12,
  gullRadius: 3,
  dropRangeWu: 45,
  giftCdS: 40,                 // one gull does not spam one hull
  keepRangeWu: 18,
  keepS: 3,
  hurtRangeWu: 120,            // fire while a gull is this close = shooting at gulls
  gifts: Object.freeze(['A BUTTON', 'A RING', 'A CHARGE CAP']),
  memoryCap: 8,
});

export const GULL_SALT = 'plantsPl283Gull';
export const QUIET_LINE = 'The gulls go quiet on your hull.';

/** A gull's position on its circuit at sim time (pure). */
export function gullPosAt(gullIndex, origin, simTime, radiusWu, t = GULL_DRONE_TUNING) {
  const phase = (hash32(GULL_SALT, 'phase', gullIndex) % 6283) / 1000;
  const a = phase + simTime * t.circuitSpeedRadS;
  const r = Number.isFinite(radiusWu) ? radiusWu : 100;
  return {
    x: origin.x + Math.cos(a) * r,
    z: origin.z + Math.sin(a) * r,
  };
}

/** Which shiny thing this gull drops next for a hull (pure, hash pick). */
export function giftLabelFor(hullId, dropIndex) {
  return GULL_DRONE_TUNING.gifts[hash32(GULL_SALT, 'gift', String(hullId), dropIndex) % GULL_DRONE_TUNING.gifts.length];
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createGullDrone() {
  return {
    name: 'plantsPl283',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._gullIds = [];
      this._giftId = null;
      this._giftSince = null;
      this._giftLabel = null;
      this._lastGiftAt = null;
      this._dropIndex = 0;
      this._shotMemory = new Map(); // hullId -> true, capped
      this._circuitRadius = null;
      this._noted = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('combat:fire', (p = {}) => this._onFire(p));
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
      this._shotMemory?.clear();
      this._noted = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [...this._gullIds, this._giftId]) if (id != null) rm(id);
      }
      this._gullIds = [];
      this._giftId = null;
      this._giftSince = null;
      this._lastGiftAt = null;
      this._dropIndex = 0;
      this._circuitRadius = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45, rate) {
      const payload = { id, gain };
      if (rate != null) payload.rate = rate;
      this.bus?.emit('audio:cue', payload);
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _shotAtGulls(hullId) {
      if (this._flags()?.plantsPl283ShotGulls) return true;
      return this._shotMemory.has(String(hullId));
    },

    _ensureGulls(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._gullIds.length) return;
      for (let i = 0; i < GULL_DRONE_TUNING.gullCount; i += 1) {
        const pos = gullPosAt(i, origin, this._now());
        const gull = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: GULL_DRONE_TUNING.gullRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: GULL_DRONE_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_scrap_gull',
            plantsPl283Gull: true,
            placeId: 'place_welding_drone',
            everydaySpaceKit: true,
            scanLabel: 'A scrap-gull drone \u2014 it does not want anything',
            swarmFloorPad: { label: 'SCRAP GULL' },
            plantsPl283GullIndex: i,
          },
        });
        this._gullIds.push(gull && gull.id != null ? gull.id : null);
      }
    },

    _onFire(p) {
      const s = this.state;
      if (!s || !p) return;
      if (p.ownerId !== s.playerId && p.shipId !== s.playerId && p.entityId !== s.playerId) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const origin = this._gullOrigin();
      if (!origin) return;
      const now = this._now();
      const radius = this._circuitRadius || 100;
      for (let i = 0; i < this._gullIds.length; i += 1) {
        const pos = gullPosAt(i, origin, now, radius);
        const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
        if (d <= GULL_DRONE_TUNING.hurtRangeWu) {
          if (!this._shotAtGulls(s.playerId)) {
            const key = String(s.playerId);
            if (this._shotMemory.size >= GULL_DRONE_TUNING.memoryCap) this._shotMemory.clear();
            this._shotMemory.set(key, true);
            const flags = this._flags();
            if (flags) flags.plantsPl283ShotGulls = true;
            this._cue('ui_deny', 0.5);
            this._popup(`plants:pl283:shot:${Math.round(now)}`, 'This street', QUIET_LINE);
            this._emit(PL_283_SHOT_EVENT, { gullIndex: i, t: now });
          }
          return;
        }
      }
    },

    _gullOrigin() {
      const s = this.state;
      if (this._gullIds.length && this._gullIds[0] != null) {
        const g = this._get(this._gullIds[0]);
        if (g?.data?.plantsPl283Origin) return g.data.plantsPl283Origin;
      }
      return null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== GULL_DRONE_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, GULL_DRONE_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = GULL_DRONE_TUNING;
      this._ensureGulls(station.pos);
      const origin = this._gullOrigin() || station.pos;
      const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
        ? station.data.dockRadius : 72;
      const radius = base * t.ringRadiusMult;
      this._circuitRadius = radius;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // The gulls fly their circuit; this street's gulls never leave.
      for (let i = 0; i < this._gullIds.length; i += 1) {
        const gull = this._gullIds[i] != null ? this._get(this._gullIds[i]) : null;
        if (!gull) continue;
        if (!gull.data.plantsPl283Origin) gull.data.plantsPl283Origin = { x: station.pos.x, z: station.pos.z };
        const pos = gullPosAt(i, origin, now, radius, t);
        gull.pos.x = pos.x;
        gull.pos.z = pos.z;
      }

      // The drop routine: pass close and one shiny thing lands at your quarter.
      if (this._giftId == null && !this._shotAtGulls(s.playerId)
          && (this._lastGiftAt == null || now - this._lastGiftAt >= t.giftCdS)) {
        for (let i = 0; i < this._gullIds.length; i += 1) {
          const pos = gullPosAt(i, origin, now, radius, t);
          const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
          if (d <= t.dropRangeWu) {
            const spawn = this.helpers?.spawnEntity;
            if (typeof spawn !== 'function') return;
            const label = giftLabelFor(s.playerId, this._dropIndex);
            this._dropIndex += 1;
            const gift = spawn({
              type: 'payload',
              pos: { x: player.pos.x + 6, z: player.pos.z + 4 },
              vel: { x: 0, z: 0 },
              radius: 2,
              mass: 1,
              physicsBody: { mass: 1 },
              flags: { persistent: true },
              data: {
                parentType: 'story_prop',
                storyPropKind: 'plants_gull_gift',
                plantsPl283Gift: true,
                masslineTetherable: true,
                scanLabel: `Dropped by a scrap gull: ${label.toLowerCase()}`,
                swarmFloorPad: { label },
              },
            });
            if (gift && gift.id != null) {
              this._giftId = gift.id;
              this._giftLabel = label;
              this._lastGiftAt = now;
              this._cue('sfx_vent_chime', 0.35, 1.4);
              this._emit(PL_283_GIFT_EVENT, { gullIndex: i, label, t: now });
            }
            break;
          }
        }
      }

      // Keeping the gift: it does not want anything, so no voice, ever.
      const gift = this._giftId != null ? this._get(this._giftId) : null;
      if (!gift || gift.alive === false) { this._giftId = null; return; }
      const dGift = Math.hypot(gift.pos.x - player.pos.x, gift.pos.z - player.pos.z);
      if (dGift <= t.keepRangeWu) {
        if (this._giftSince == null) this._giftSince = now;
        if (now - this._giftSince >= t.keepS) {
          this.helpers?.removeEntity?.(this._giftId);
          player.data = player.data || {};
          player.data.plantsPl283Gift = this._giftLabel;
          this._giftId = null;
          this._giftSince = null;
          this._cue('confirm', 0.3);
          this._emit(PL_283_KEPT_EVENT, { label: this._giftLabel, t: now });
        }
      } else {
        this._giftSince = null;
      }
    },
  };
}

export const gullDronePlant = createGullDrone();
