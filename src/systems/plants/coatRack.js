// PL-282 The coat rack — Sker (design/program/INFERENCE_PLANTS.md, row PL-282).
// "The coat rack. A public rack by the Chop Line gates: leave a spare you don't need and
// it is gone within a shift, replaced by something closer to what you lack."
// What the player can do: Trade honestly; or take two without leaving — the rack's keeper
// chalks your hull, and racks elsewhere go picked-over for you.
//
// SEAM NOTE (honest): the Chop Line gates are the docking ring of the REAL station_sker
// body (sector_sker_haven). The rack is a chalked prop at a fixed hash bearing, with
// hanging coat props (tetherable payload props). Leaving a spare is physical: tow any
// masslineTetherable prop into the drop range and hold it there for tuning.leaveS — the
// rack claims it (consumed by the rack), and within a shift it is replaced by a swap prop
// chosen by deterministic hash from what you lack (a low hull gets the patch kit). Trading
// honestly is depositing and then taking a swap. Taking two coats with no deposit in
// between is the greed branch: the keeper chalks your hull (player.data.plantsPl282Chalk,
// a durable stamp), the rack label goes PICKED-OVER, swaps stop for you — and the chalk
// stamp is the documented handoff for any other rack owner (economy/contacts may read
// plantsPl282Chalk to pick racks elsewhere over your hull).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; shift clock, swap pick and the chalk
//   id are pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns rack and coats.
// - NO economy writes: a trade is props and stamps, never credits.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_282_DEPOSIT_EVENT = 'plants:pl282:deposit';
export const PL_282_SWAP_EVENT = 'plants:pl282:swap';
export const PL_282_CHALKED_EVENT = 'plants:pl282:chalked';
export const PL_282_PICKED_EVENT = 'plants:pl282:picked';

export const COAT_RACK_TUNING = Object.freeze({
  stationId: 'station_sker',
  sectorId: 'sector_sker_haven',
  dayLengthS: 240,
  shiftS: 60,                  // a shift: how long a deposited spare takes to go
  rackRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the Chop Line gates
  dropRangeWu: 25,
  leaveS: 4,
  takeRangeWu: 22,
  takeCooldownS: 3,
  takesAllowed: 2,             // take two without leaving and you are chalked
  swapHullFraction: 0.5,       // below this, the swap is "closer to what you lack"
  rackRadius: 8,
  memoryCap: 8,
  sender: 'Rack keeper',
});

export const RACK_SALT = 'plantsPl282Rack';
export const CHALKED_LINE = 'Your hull\u2019s chalked now.';
export const SWAPS = Object.freeze(['PATCH KIT', 'SPARE GLOVES', 'CHARGE CAP', 'WARM LINER']);

/** The rack's fixed spot at the Chop Line gates, hash-derived bearing. */
export function rackPointFor(station, t = COAT_RACK_TUNING) {
  const a = (hash32(RACK_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.rackRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock. */
export function rackDayOf(simTime, t = COAT_RACK_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The deterministic swap for a deposit: what you lack picks the label. */
export function swapLabelFor(hullFrac, salt) {
  const pick = hash32(RACK_SALT, 'swap', String(salt));
  if (Number.isFinite(hullFrac) && hullFrac <= COAT_RACK_TUNING.swapHullFraction) {
    return SWAPS[0];                                       // a low hull gets the patch kit
  }
  return SWAPS[pick % SWAPS.length];
}

/** The keeper's chalk for a hull: deterministic, legible, unique-ish. */
export function chalkFor(hullId) {
  return `RK-${hash32(RACK_SALT, 'chalk', String(hullId)) % 9000 + 1000}`;
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

export function createCoatRack() {
  return {
    name: 'plantsPl282',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._rackId = null;
      this._rackPoint = null;
      this._coatIds = [];
      this._depositedId = null;
      this._depositedSince = null;
      this._swapDueAt = null;
      this._swapSalt = 0;
      this._swapId = null;
      this._takes = 0;
      this._lastTakeAt = null;
      this._chalked = false;
      this._pickedOver = false;
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
      this._drop();
      this._chalked = !!(this.state?.entities?.get?.(this.state.playerId)?.data?.plantsPl282Chalk);
      this._pickedOver = this._chalked;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._rackId, this._depositedId, this._swapId, ...this._coatIds]) {
          if (id != null) rm(id);
        }
      }
      this._rackId = null;
      this._rackPoint = null;
      this._coatIds = [];
      this._depositedId = null;
      this._depositedSince = null;
      this._swapDueAt = null;
      this._swapId = null;
      this._takes = 0;
      this._lastTakeAt = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      this.bus?.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureRack(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._rackId != null) return;
      const point = rackPointFor(station);
      this._rackPoint = point;
      const rack = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: COAT_RACK_TUNING.rackRadius,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: COAT_RACK_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_coat_rack',
          plantsPl282Rack: true,
          placeId: 'place_container_rack',
          everydaySpaceKit: true,
          scanLabel: 'The public rack by the Chop Line gates \u2014 leave a spare, take what you lack',
          swarmFloorPad: { label: 'COAT RACK' },
        },
      });
      this._rackId = rack && rack.id != null ? rack.id : null;
      for (let i = 0; i < 2; i += 1) {
        const a = (hash32(RACK_SALT, 'coat', i) % 6283) / 1000;
        const coat = spawn({
          type: 'payload',
          pos: { x: point.x + Math.cos(a) * 10, z: point.z + Math.sin(a) * 10 },
          vel: { x: 0, z: 0 },
          radius: 3,
          mass: 2,
          physicsBody: { mass: 2 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_hung_coat',
            plantsPl282Coat: true,
            masslineTetherable: true,
            scanLabel: 'A hung spare \u2014 the rack trades honestly',
            swarmFloorPad: { label: 'HUNG SPARE' },
          },
        });
        this._coatIds.push(coat && coat.id != null ? coat.id : null);
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== COAT_RACK_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, COAT_RACK_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = COAT_RACK_TUNING;
      this._ensureRack(station);
      if (!this._rackPoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // A deposited spare is gone within a shift, replaced by something closer to what you lack.
      if (this._swapDueAt != null && now >= this._swapDueAt) {
        if (this._depositedId != null) this.helpers?.removeEntity?.(this._depositedId);
        this._depositedId = null;
        this._swapDueAt = null;
        if (!this._pickedOver) {
          const spawn = this.helpers?.spawnEntity;
          const hullMax = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : Math.max(1, player.hull || 1);
          const frac = Number.isFinite(player.hull) ? player.hull / hullMax : 1;
          const label = swapLabelFor(frac, this._swapSalt);
          this._swapSalt += 1;
          if (typeof spawn === 'function') {
            const a = (hash32(RACK_SALT, 'swapSpot', this._swapSalt) % 6283) / 1000;
            const swap = spawn({
              type: 'payload',
              pos: { x: this._rackPoint.x + Math.cos(a) * 12, z: this._rackPoint.z + Math.sin(a) * 12 },
              vel: { x: 0, z: 0 },
              radius: 3,
              mass: 2,
              physicsBody: { mass: 2 },
              flags: { persistent: true },
              data: {
                parentType: 'story_prop',
                storyPropKind: 'plants_rack_swap',
                plantsPl282Swap: true,
                masslineTetherable: true,
                scanLabel: `Left for you on the rack: ${label.toLowerCase()}`,
                swarmFloorPad: { label },
              },
            });
            if (swap && swap.id != null) this._swapId = swap.id;
          }
          this._cue('confirm', 0.4);
          this._emit(PL_282_SWAP_EVENT, { label, t: now });
        }
      }

      // The chalk does not come off: picked-over means no swaps, one line, forever.
      const rack = this._get(this._rackId);
      if (this._pickedOver && rack?.data && rack.data.swarmFloorPad?.label !== 'PICKED-OVER RACK') {
        rack.data.swarmFloorPad = { label: 'PICKED-OVER RACK' };
      }

      // Deposits: tow a tetherable prop into the drop range and hold it there.
      if (this._depositedId == null && s.entities && typeof s.entities.values === 'function') {
        for (const e of s.entities.values()) {
          if (!e || e.alive === false || !e.pos) continue;
          const d = e.data || {};
          if (!d.masslineTetherable || d.plantsPl282Coat === true) continue;
          if (Math.hypot(e.pos.x - this._rackPoint.x, e.pos.z - this._rackPoint.z) > t.dropRangeWu) continue;
          this._depositedId = e.id;
          this._depositedSince = now;
          break;
        }
      } else if (this._depositedId != null && this._swapDueAt == null) {
        const dep = this._get(this._depositedId);
        const near = dep?.pos && Math.hypot(dep.pos.x - this._rackPoint.x, dep.pos.z - this._rackPoint.z) <= t.dropRangeWu * 1.4;
        if (!near) {
          this._depositedId = null;                        // towed away: not a deposit
          this._depositedSince = null;
        } else if (now - (this._depositedSince || now) >= t.leaveS) {
          this._takes = 0;                                 // honest trade resets the count
          this._swapDueAt = now + t.shiftS;
          this._cue('sfx_vent_chime', 0.35, 1.0);
          this._emit(PL_282_DEPOSIT_EVENT, { depositedId: this._depositedId, swapDueAt: this._swapDueAt, t: now });
        }
      }

      // Taking spares: two without leaving, and the keeper chalks your hull.
      this._coatIds = this._coatIds.filter((id) => {
        if (id == null) return false;
        const coat = this._get(id);
        if (!coat || coat.alive === false || !coat.pos) return false;
        const d = Math.hypot(coat.pos.x - player.pos.x, coat.pos.z - player.pos.z);
        if (d <= t.takeRangeWu && (this._lastTakeAt == null || now - this._lastTakeAt >= t.takeCooldownS)) {
          this._lastTakeAt = now;
          this._takes += 1;
          this.helpers?.removeEntity?.(id);
          this._cue('confirm', 0.3);
          if (this._takes >= t.takesAllowed && !this._chalked) {
            this._chalked = true;
            this._pickedOver = true;
            const chalk = chalkFor(s.playerId);
            player.data = player.data || {};
            player.data.plantsPl282Chalk = chalk;          // documented handoff stamp
            this._cue('ui_deny', 0.5);
            this._popup(`plants:pl282:chalked:${Math.round(now)}`, t.sender, CHALKED_LINE);
            this._emit(PL_282_CHALKED_EVENT, { chalk, takes: this._takes, t: now });
            this._emit(PL_282_PICKED_EVENT, { chalk, t: now });
          }
          return false;
        }
        return true;
      });
    },
  };
}

export const coatRackPlant = createCoatRack();
