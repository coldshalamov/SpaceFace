// PL-171 Rattle in B — "Phoebe | B flat. The harbor's bells are tuned, and Keeper Aud's ear is
// better. Come in dented and he knows your pitch before you dock: *'You rattle in B.'* |
// Get patched; or rattle on — the whole row knows it is you | DRAFT 2026-11-11"
// The quoted line "You rattle in B." is final copy from the row.
//
// SEAM NOTE (honest): the "harbor" is the Echo Shrine approach at sector_phoebe_echo /
// station_phoebe_echo (verified in src/data/frontierRegions/north.js). Keeper Aud exists only
// in the row, so he speaks through the ordinary comms seams (helpers.voice.say + comms:popup,
// category 'traffic') at the shrine's approach range — before dock range, as the row says.
//
// What the player can do: come in dented and get named; get patched; or rattle on and have the
// whole row know it.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy() unsubscribes and clears Maps.
// - Bounded ledgers (tuning.memoryCap); per-visit and per-station cooldowns.
// - Reads only: hull fraction, station entity data (stationId/dockRadius/sectorId).

import { hash32 } from '../../core/rng.js';

export const PL_171_RATTLE_EVENT = 'plants:pl171:rattle';
export const PL_171_PATCHED_EVENT = 'plants:pl171:patched';
export const PL_171_ROW_KNOWS_EVENT = 'plants:pl171:rowKnows';

export const AUD_LINE = 'You rattle in B.';
export const AUD_SENDER = 'KEEPER AUD';
export const ROW_SENDER = 'HARBOR ROW';
export const ROW_LINE = 'The whole row knows it is you.';

export const RATTLE_IN_B_TUNING = Object.freeze({
  sectorId: 'sector_phoebe_echo',
  stationId: 'station_phoebe_echo',
  approachRangeWu: 300,        // he knows your pitch BEFORE you dock
  rattleBelowFraction: 0.85,   // hull under this carries a audible dent
  patchedAboveFraction: 0.97,  // "get patched" — the shrine's repair services
  rowKnowsCooldownS: 120,      // the row does not gossip twice per approach
  memoryCap: 4,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** A hull is rattling when it carries a dent: hull under the tuning fraction of hullMax. */
export function isRattling(ent, tuning = RATTLE_IN_B_TUNING) {
  if (!ent) return false;
  const hull = finite(ent.hull, -1);
  const hullMax = finite(ent.hullMax, 0);
  if (hull < 0 || hullMax <= 0) return false;
  return hull < hullMax * tuning.rattleBelowFraction;
}

/** The hull reads patched once repairs bring it back above the tuning fraction. */
export function isPatched(ent, tuning = RATTLE_IN_B_TUNING) {
  if (!ent) return false;
  const hull = finite(ent.hull, -1);
  const hullMax = finite(ent.hullMax, 0);
  if (hull < 0 || hullMax <= 0) return false;
  return hull >= hullMax * tuning.patchedAboveFraction;
}

export const pl171Rattle = {
  name: 'plantsPl171',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._toldThisVisit = false;
    this._lastRowKnowsAt = -Infinity;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === RATTLE_IN_B_TUNING.sectorId) this._endVisit();
    });
    on('save:loaded', () => this._endVisit());
    on('game:newGame', () => this._endVisit());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._endVisit();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _endVisit() {
    this._toldThisVisit = false;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  /** The shrine station entity, if spawned, by its catalog stationId (never a gate). */
  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === RATTLE_IN_B_TUNING.stationId) return e;
    }
    return null;
  },

  _voice(id, text, ttl = 5) {
    if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'comms', id, text, kind: 'traffic', ttl });
    } else {
      this.bus?.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
  },

  _popup(id, sender, text, ttl = 6) {
    this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== RATTLE_IN_B_TUNING.sectorId) { this._endVisit(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;

    const now = this._now(s);
    const dx = player.pos.x - station.pos.x;
    const dz = player.pos.z - station.pos.z;
    const dist = Math.hypot(dx, dz);
    const t = RATTLE_IN_B_TUNING;

    if (dist <= t.approachRangeWu) {
      if (!this._toldThisVisit && isRattling(player, t)) {
        // Come in dented and he knows your pitch before you dock.
        this._toldThisVisit = true;
        this.bus?.emit(PL_171_RATTLE_EVENT, {
          playerId: player.id ?? s.playerId, stationId: t.stationId,
          hull: finite(player.hull), hullMax: finite(player.hullMax), t: now,
        });
        this._voice('plants:pl171:rattle', AUD_LINE, 5);
        this._popup('plants:pl171:rattle', AUD_SENDER, AUD_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: station.pos.x, z: station.pos.z }, gain: 0.4, rate: 1 });
      } else if (this._toldThisVisit && isPatched(player, t)) {
        // Get patched — Aud's answer to a hull that stopped rattling.
        this._toldThisVisit = false;
        this.bus?.emit(PL_171_PATCHED_EVENT, {
          playerId: player.id ?? s.playerId, stationId: t.stationId, t: now,
        });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: station.pos.x, z: station.pos.z }, gain: 0.5, rate: 1 });
      }
    } else if (this._toldThisVisit && isRattling(player, t)) {
      // Rattle on: leave the approach still dented and the whole row knows.
      if (now - this._lastRowKnowsAt >= t.rowKnowsCooldownS) {
        this._lastRowKnowsAt = now;
        this._toldThisVisit = false;
        this.bus?.emit(PL_171_ROW_KNOWS_EVENT, {
          playerId: player.id ?? s.playerId, stationId: t.stationId, t: now,
        });
        this._popup('plants:pl171:rowKnows', ROW_SENDER, ROW_LINE, 6);
      }
    }
  },
};

// Deterministic approach-salt: stable per sector for any pure consumer that needs one.
export const APPROACH_SALT = hash32('plantsPl171', RATTLE_IN_B_TUNING.sectorId);
