// PL-126 Keeping it — "Wear the lost hat past Benny's bus and he looks at it a long while:
// *"Keeping it, then."* Hand it back and it rides on the dash, in the window, every route |
// Keep it; or give it up, and always know where the bus is"
// The quoted line *"Keeping it, then."* is final copy, emitted verbatim, once.
//
// SEAM NOTE (honest): Late Benny and his bus are not coded anywhere in live data (payoff row
// for an older bank plant), so this plant stages them self-contained in sector_tethys_junction:
// the bus is a fixed story-prop on his route anchor; the lost hat is a latched micro-payload
// (real pod, tiny honest mass, masslineTetherable) that rides the Line — "wearing" it means
// towing it (hat near you while you move). Handing it back is physical: leave the hat at rest
// inside the bus's hand-back ring. Hand-back re-stamps the hat onto the dash and marks the bus
// ("hat on the dash") — always knowing where the bus is means the hat marks the bus in the
// world; it is not a HUD item and no chart seam is invented.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears state.
// - "Keeping it, then." fires once, only while wearing, only past the bus.
// - Hand-back fires once; after it the hat lives on the dash (same entity, new stamp).

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_126_KEPT_EVENT = 'plants:pl126:kept';
export const PL_126_RETURNED_EVENT = 'plants:pl126:returned';

export const KEEPING_IT_TUNING = Object.freeze({
  sectorId: 'sector_tethys_junction',
  busRadiusWu: 90,            // "past Benny's bus"
  rideRadiusWu: 55,           // the hat rides this close to you
  rideSpeedMinWu: 14,         // ...while you are actually moving
  handBackRadiusWu: 34,       // leave the hat at rest inside this ring
  restSpeedWu: 5,
  hatUnitMass: 0.8,           // a hat's honest mass, carried by the pod
  hatAmountU: 1,
  hatRadius: 2,
  memoryCap: 4,
});

export const BUS_SALT = 'plantsPl126Bus';

export function busAnchorFor(sectorId, t = KEEPING_IT_TUNING) {
  const h = hash32(BUS_SALT, String(sectorId ?? t.sectorId));
  return { x: 100 + (h % 900), z: -200 + ((h >>> 7) % 900) };
}

export function createPl126KeepingIt() {
  return {
    name: 'plantsPl126',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._busId = null;
      this._hatId = null;
      this._wearing = false;
      this._kept = false;
      this._returned = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => { this._wearing = false; });
      on('save:loaded', () => { this._wearing = false; });
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
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._busId != null) rm(this._busId);
        if (this._hatId != null) rm(this._hatId);
      }
      this._busId = null;
      this._hatId = null;
      this._wearing = false;
      this._kept = false;
      this._returned = false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(state) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = KEEPING_IT_TUNING;
      const anchor = busAnchorFor(state.world?.currentSectorId, t);
      if (this._busId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: anchor,
          vel: { x: 0, z: 0 },
          radius: 9,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_benny_bus',
            plantsPl126Bus: true,
            scanLabel: 'Late Benny\u2019s bus — parked, engine warm',
            swarmFloorPad: { label: 'Benny\u2019s bus' },
            tetherable: true,
            masslineTetherable: true,
          },
        });
        if (ent && ent.id != null) this._busId = ent.id;
      }
      if (this._hatId == null) {
        const hat = spawnJettisonedCargoPod(state, {
          commodityId: 'cmdty_alloys',
          amount: t.hatAmountU,
          unitMass: t.hatUnitMass,
          radius: t.hatRadius,
          pos: { x: anchor.x + 160, z: anchor.z + 120 }, // lost along the route
          vel: { x: 0, z: 0 },
          ownerId: null,
        }, this.helpers);
        if (hat && hat.id != null) {
          hat.data = hat.data || {};
          hat.data.plantsPl126Hat = true;
          hat.data.scanLabel = 'A lost hat — small, latched, rides a Line';
          hat.data.swarmFloorPad = { label: 'The lost hat' };
          hat.data.masslineTetherable = true; // the latch: it rides the Line
          this._hatId = hat.id;
        }
      }
    },

    _entity(state, id) {
      return id != null && state?.entities?.get ? state.entities.get(id) : null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== KEEPING_IT_TUNING.sectorId) return;
      this._ensure(s);
      const t = KEEPING_IT_TUNING;
      const now = this._now();
      const bus = this._entity(s, this._busId);
      const hat = this._entity(s, this._hatId);
      if (!bus?.pos || !hat?.pos || !hat.alive) { this._wearing = false; return; }
      const player = this._entity(s, s.playerId);
      if (!player?.pos) { this._wearing = false; return; }
      const hx = Number(hat.pos.x), hz = Number(hat.pos.z);
      const px = Number(player.pos.x), pz = Number(player.pos.z);
      const bx = Number(bus.pos.x), bz = Number(bus.pos.z);
      const hatToPlayer = Math.hypot(hx - px, hz - pz);
      const playerSpeed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const toBus = Math.hypot(px - bx, pz - bz);
      // Wearing: the hat rides with you while you move.
      this._wearing = hatToPlayer <= t.rideRadiusWu && playerSpeed >= t.rideSpeedMinWu;
      // Wear the lost hat past Benny's bus:
      if (this._wearing && !this._kept && toBus <= t.busRadiusWu) {
        this._kept = true;
        hat.data.scanLabel = 'A lost hat — kept';
        this.bus?.emit('comms:popup', {
          id: `plants:pl126:kept:${Math.round(now)}`,
          sender: 'Late Benny',
          category: 'story',
          text: 'Keeping it, then.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_126_KEPT_EVENT, { hatId: hat.id, busId: bus.id, t: now });
      }
      // Hand it back: you stop at the bus and release the hat at rest inside its ring.
      if (!this._returned && toBus <= t.handBackRadiusWu) {
        const hatSpeed = Math.hypot(Number(hat.vel?.x) || 0, Number(hat.vel?.z) || 0);
        if (hatSpeed <= t.restSpeedWu && playerSpeed < t.rideSpeedMinWu) {
          this._returned = true;
          hat.data.plantsPl126BennyDashRide = true;
          hat.data.scanLabel = 'The hat — riding the dash, in the window, every route';
          hat.data.swarmFloorPad = { label: 'Hat on the dash' };
          bus.data.scanLabel = 'Late Benny\u2019s bus — hat on the dash'; // always know where the bus is
          this.bus?.emit('comms:popup', {
            id: `plants:pl126:returned:${Math.round(now)}`,
            sender: 'Late Benny',
            category: 'story',
            text: 'It rides the dash now, every route.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit(PL_126_RETURNED_EVENT, { hatId: hat.id, busId: bus.id, t: now });
        }
      }
    },
  };
}

export const pl126KeepingIt = createPl126KeepingIt();
