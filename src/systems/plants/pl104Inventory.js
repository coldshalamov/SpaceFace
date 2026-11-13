// PL-104 Inventory — "The gap behind Sker's Chop Line fits one small ship exactly. Spend a
// Market Night closed in behind it and the claws work round you till morning; Tinker Zell
// chalks a stock number on your hull | Sleep free, wearing a stock number; or take a normal berth"
//
// SEAM NOTE (honest): Sker's Chop Line is not a coded station, so this plant places the gap
// itself — a fixed story-prop marker at a deterministic spot in sector_sker_haven, sized for
// exactly one small ship. "Market Night" is the fixed sim night band. Parking (speed below
// park speed) inside the gap radius through a whole night earns the morning: Tinker Zell's
// chalk — a deterministic stock number stamped on the player's own hull data. Moving out
// mid-night resets the dwell: a normal berth, no number.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The stock number is hash32(sectorId) — same rock, same number, every night.
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears Maps.
// - Claw sounds are real audio cues on the existing bus seam, capped per night.

import { hash32 } from '../../core/rng.js';
import { isNightAt } from './pl146FirstCaller.js';

export const PL_104_CHALK_EVENT = 'plants:pl104:chalk';

export const INVENTORY_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  dayLengthS: 240,
  nightFraction: 0.25,
  gapRadiusWu: 34,            // fits one small ship exactly
  parkSpeedWu: 6,
  clawChimeEveryS: 9,         // the claws work round you
  clawChimesPerNight: 4,      // capped
  dwellMinS: 20,              // a compressed "whole night": the night band itself
  memoryCap: 8,
});

export const GAP_SALT = 'plantsPl104Gap';

/** The gap's fixed spot in the sector — deterministic, never moves. */
export function gapAnchorFor(sectorId, t = INVENTORY_TUNING) {
  const h = hash32(GAP_SALT, String(sectorId ?? t.sectorId));
  return { x: 300 + (h % 1400), z: -400 + ((h >>> 10) % 1400) };
}

export function gapMarkerSpec(sectorId, t = INVENTORY_TUNING) {
  const anchor = gapAnchorFor(sectorId, t);
  return {
    type: 'beacon',
    pos: anchor,
    vel: { x: 0, z: 0 },
    radius: 10,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    homeSectorId: sectorId,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_chop_line_gap',
      plantsPl104Gap: true,
      scanLabel: 'The gap behind Sker\u2019s Chop Line — fits one small ship exactly',
      swarmFloorPad: { label: 'The gap — one ship' },
    },
  };
}

/** The chalk: a Sker stock number, deterministic per sector. */
export function chalkStockNumber(sectorId) {
  return `SZ-${hash32('plantsPl104Chalk', String(sectorId ?? INVENTORY_TUNING.sectorId)) % 9000 + 1000}`;
}

export function createPl104Inventory() {
  return {
    name: 'plantsPl104',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._gapId = null;
      this._dwellS = 0;
      this._chalking = false;
      this._chimed = 0;
      this._nightIndex = -1;
      this._chalkedThisSession = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._leave());
      on('save:loaded', () => this._leave());
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
      this._leave(true);
    },

    _leave(hard) {
      const rm = this.helpers?.removeEntity;
      if (this._gapId != null && typeof rm === 'function') rm(this._gapId);
      this._gapId = null;
      this._dwellS = 0;
      this._chimed = 0;
      this._chalking = false;
      this._nightIndex = -1;
      if (hard) this._chalkedThisSession = false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = INVENTORY_TUNING;
      if (s.world?.currentSectorId !== t.sectorId) return;
      // Keep the gap standing in its sector.
      if (this._gapId == null && typeof this.helpers?.spawnEntity === 'function') {
        const ent = this.helpers.spawnEntity(gapMarkerSpec(s.world.currentSectorId, t));
        if (ent && ent.id != null) this._gapId = ent.id;
      }
      const gap = this._gapId != null && s.entities?.get ? s.entities.get(this._gapId) : null;
      if (!gap?.pos) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const night = isNightAt(now, t);
      const dayIndex = Math.floor(now / t.dayLengthS);
      if (dayIndex !== this._nightIndex) { this._nightIndex = dayIndex; this._chimed = 0; }
      const dist = Math.hypot(player.pos.x - gap.pos.x, player.pos.z - gap.pos.z);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const parked = night && dist <= t.gapRadiusWu && speed <= t.parkSpeedWu;
      if (!parked) { this._dwellS = 0; return; } // moved out: a normal berth, dwell reset
      this._dwellS += Math.max(0, Number(dt) || 0);
      // The claws work round you till morning.
      if (this._dwellS >= (this._chimed + 1) * t.clawChimeEveryS && this._chimed < t.clawChimesPerNight) {
        this._chimed += 1;
        this.bus?.emit('audio:cue', {
          id: 'sfx_vent_chime',
          position: { x: gap.pos.x, z: gap.pos.z },
          gain: 0.35,
          rate: 0.8,
        });
      }
      // Morning: chalk on your hull.
      if (this._dwellS >= Math.max(t.dwellMinS, t.dayLengthS * t.nightFraction * 0.9)
          && !this._chalkedThisSession && !this._chalking) {
        this._chalking = true;
        this._chalkedThisSession = true;
        const number = chalkStockNumber(s.world.currentSectorId);
        player.data = player.data || {};
        player.data.plantsPl104StockNumber = number; // chalked ON THE HULL — family-namespaced
        this.bus?.emit('comms:popup', {
          id: `plants:pl104:chalk:${Math.round(now)}`,
          sender: 'Tinker Zell',
          category: 'story',
          text: `Chalk on your hull: ${number}. Sleep free.`,
          ttl: 10,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_104_CHALK_EVENT, {
          number,
          chalkedAt: now,
          dwellS: this._dwellS,
          entityId: player.id,
        });
      }
    },
  };
}

export const pl104Inventory = createPl104Inventory();
