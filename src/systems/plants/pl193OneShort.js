// PL-193 One short — "Sedna | One short. Senna's lamp line runs out into the dark. Count the lamps
// and count her words: the line is always one lamp short of the names she reads | Count them
// yourself; or stop counting — it is easier out here | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Sedna is sector_sedna_dark / station_sedna — Sedna Survey Post (verified in
// src/data/frontierRegions/south.js; the sector already carries the Buoy Ledger POI). Senna and
// her lamp line exist only in the row, so the line is spawned story-prop beacons (beacons.js buoy
// contract) on a hashed bearing off the Survey Post, and Senna reads her ledger through
// comms:popup (category 'traffic'). The shortage is structural: lamps are always names-1.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned lamps and clear Maps.
// - Bounded ledgers (tuning.memoryCap); read cadence is its own cooldown.
// - Counting is physical: each lamp is counted by actually going to it.

import { hash32 } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_193_READ_EVENT = 'plants:pl193:read';
export const PL_193_COUNTED_EVENT = 'plants:pl193:counted';
export const PL_193_STOPPED_EVENT = 'plants:pl193:stopped';

export const SENNA_SENDER = 'SENNA';
export const SENNA_NAMES = Object.freeze(['Vess', 'Osta', 'Reck', 'Mar', 'Toro']);

export const ONE_SHORT_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  stationId: 'station_sedna',
  lampCount: 4,               // always one lamp short of the five names
  lampSpacingWu: 180,         // the line runs out into the dark
  readIntervalS: 36,
  hearRadiusWu: 500,          // close enough to the line to hear the read
  countRadiusWu: 70,          // counted by coming this close to a lamp
  stopGraceS: 10,             // out of earshot this long means you stopped counting
  memoryCap: 10,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Deterministic bearing for the lamp line off the Survey Post. */
export function lineBearing(sectorId = ONE_SHORT_TUNING.sectorId) {
  const h = hash32('plantsPl193bearing', String(sectorId));
  return (h % 3600) / 3600 * Math.PI * 2;
}

export function lampLinePositions(stationPos, sectorId = ONE_SHORT_TUNING.sectorId, tuning = ONE_SHORT_TUNING) {
  const bearing = lineBearing(sectorId);
  const out = [];
  for (let i = 0; i < tuning.lampCount; i += 1) {
    out.push({
      x: finite(stationPos?.x) + Math.cos(bearing) * tuning.lampSpacingWu * (i + 1),
      z: finite(stationPos?.z) + Math.sin(bearing) * tuning.lampSpacingWu * (i + 1),
    });
  }
  return out;
}

/** The structural shortage: lamps are always exactly one short of the names. */
export function shortageOf(names = SENNA_NAMES, tuning = ONE_SHORT_TUNING) {
  return names.length - tuning.lampCount;
}

export const pl193OneShort = {
  name: 'plantsPl193',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._lampIds = [];
    this._visited = new Set();
    this._lastReadAt = -Infinity;
    this._outOfEarshotS = 0;
    this._stoppedThisVisit = false;
    this._countedAt = false;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === ONE_SHORT_TUNING.sectorId) this._despawnAll();
    });
    on('save:loaded', () => this._despawnAll());
    on('game:newGame', () => this._despawnAll());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnAll();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _despawnAll() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') for (const id of this._lampIds) rm(id);
    this._lampIds = [];
    this._visited = new Set();
    this._lastReadAt = -Infinity;
    this._outOfEarshotS = 0;
    this._stoppedThisVisit = false;
    this._countedAt = false;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    return plantStationById(s, ONE_SHORT_TUNING.stationId);
  },

  _ensureLamps(s) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos || this._lampIds.length > 0) return;
    const spots = lampLinePositions(station.pos);
    spots.forEach((pos, i) => {
      const ent = spawn({
        type: 'beacon',
        pos, vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: ONE_SHORT_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          scanLabel: `Senna's lamp line — lamp ${i + 1}`,
          storyPropKind: 'lamp_line',
          pl193Lamp: true,
          pl193LampIndex: i,
          lampsFlashing: true,
          lampFlashUntil: this._now(s) + 3600,
          tetherable: true,
          masslineTetherable: true,
          homeSectorId: ONE_SHORT_TUNING.sectorId,
        },
      });
      if (ent && ent.id != null && this._lampIds.length < ONE_SHORT_TUNING.memoryCap) {
        this._lampIds.push(ent.id);
      }
    });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== ONE_SHORT_TUNING.sectorId) { this._despawnAll(); return; }

    this._ensureLamps(s);
    const now = this._now(s);
    const t = ONE_SHORT_TUNING;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos || this._lampIds.length === 0) return;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    // Distance to the nearest lamp of the line.
    let nearestD = Infinity;
    const entities = s.entities;
    for (const id of this._lampIds) {
      const lamp = typeof entities?.get === 'function' ? entities.get(id) : null;
      if (!lamp?.pos) continue;
      const d = Math.hypot(player.pos.x - lamp.pos.x, player.pos.z - lamp.pos.z);
      if (d < nearestD) nearestD = d;
      // Count them yourself: each lamp is counted by actually going to it.
      if (d <= t.countRadiusWu) this._visited.add(id);
    }

    if (this._visited.size === this._lampIds.length && this._visited.size > 0) {
      if (!this._countedAt) {
        this._countedAt = true;
        this.bus?.emit(PL_193_COUNTED_EVENT, {
          lamps: this._lampIds.length,
          names: SENNA_NAMES.length,
          short: shortageOf(SENNA_NAMES, t),
          t: now,
        });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: player.pos.x, z: player.pos.z }, gain: 0.4, rate: 1 });
      }
    }

    if (nearestD <= t.hearRadiusWu) {
      this._outOfEarshotS = 0;
      if (now - this._lastReadAt >= t.readIntervalS) {
        this._lastReadAt = now;
        // Count her words: the ledger read is always one name longer than the line.
        const text = `Ledger read: ${SENNA_NAMES.join(', ')}.`;
        this.bus?.emit(PL_193_READ_EVENT, {
          names: SENNA_NAMES.length, lamps: this._lampIds.length,
          short: shortageOf(SENNA_NAMES, t), t: now,
        });
        this.bus?.emit('comms:popup', {
          id: `plants:pl193:read:${Math.floor(now)}`, sender: SENNA_SENDER, category: 'traffic',
          text, ttl: 8, persist: false,
        });
      }
    } else if (this._visited.size > 0 && !this._stoppedThisVisit) {
      // Stop counting — it is easier out here.
      this._outOfEarshotS += 1;
      if (this._outOfEarshotS >= t.stopGraceS) {
        this._stoppedThisVisit = true;
        this._countedAt = false;
        this.bus?.emit(PL_193_STOPPED_EVENT, { visited: this._visited.size, t: now });
        this._visited = new Set();
      }
    }
  },
};
