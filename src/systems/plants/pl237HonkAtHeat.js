// PL-237 Honk at heat — "Rhea | Honk at heat. Rhea haulers honk at any hull carrying an old scorch,
// whoever earned it | Wear your burns; they were earned somewhere | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Rhea is sector_rhea_cinder / station_rhea_cinder — Cinder Claim (verified in
// src/data/frontierRegions/north.js, a scorched ore claim with slag POIs). The haulers exist only
// in the row, so one authored hauler runs a fixed out-and-back pass line past the Claim (sim-owned
// motion on its own body, no vel writes). "An old scorch" is staged honestly: a hull carrying
// dents — hull under its maximum. The honk is the audio seam (a low warning-rate horn), and the
// salute is the point: wear your burns and the pass calls to you.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the hauler and clear Maps.
// - Bounded ledgers (tuning.memoryCap); honk cooldown per pass.
// - The hauler moves only its own authored body; never touches the player or other hulls.

import { hash32 } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_237_HONKED_EVENT = 'plants:pl237:honked';
export const PL_237_CLEAN_EVENT = 'plants:pl237:clean';

export const HONK_AT_HEAT_TUNING = Object.freeze({
  sectorId: 'sector_rhea_cinder',
  stationId: 'station_rhea_cinder',
  passPeriodS: 60,             // one out-and-back pass
  passOffsetWu: 900,           // the pass line swings this wide of the Claim
  honkRadiusWu: 260,           // honk range on the close approach
  dentFraction: 0.999,         // hull under this fraction of hullMax carries a scorch
  honkCooldownS: 30,           // one honk per approach
  memoryCap: 4,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const PASS_SALT = hash32('plantsPl237pass', HONK_AT_HEAT_TUNING.sectorId);

/** Deterministic pass bearing past the Claim. */
export function passBearing(sectorId = HONK_AT_HEAT_TUNING.sectorId) {
  const h = hash32('plantsPl237bearing', String(sectorId), PASS_SALT);
  return (h % 3600) / 3600 * Math.PI * 2;
}

/** Triangle wave 0..1..0 over the pass period — the out-and-back. */
export function passPhase(simTime, tuning = HONK_AT_HEAT_TUNING) {
  const t = ((finite(simTime) % tuning.passPeriodS) + tuning.passPeriodS) % tuning.passPeriodS;
  const half = t / (tuning.passPeriodS / 2);
  return half <= 1 ? half : 2 - half;
}

/** The hauler's authored position on its pass line. */
export function haulerPassPosition(simTime, stationPos, sectorId = HONK_AT_HEAT_TUNING.sectorId, tuning = HONK_AT_HEAT_TUNING) {
  const bearing = passBearing(sectorId);
  const along = (passPhase(simTime, tuning) - 0.5) * 2 * tuning.passOffsetWu;
  const across = tuning.passOffsetWu * 0.4;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * along - Math.sin(bearing) * across,
    z: finite(stationPos?.z) + Math.sin(bearing) * along + Math.cos(bearing) * across,
  };
}

/** A hull carries an old scorch when it is dented: hull under its maximum. */
export function hasOldScorch(ent, tuning = HONK_AT_HEAT_TUNING) {
  if (!ent) return false;
  const hull = finite(ent.hull, -1);
  const hullMax = finite(ent.hullMax, 0);
  if (hull < 0 || hullMax <= 0) return false;
  return hull < hullMax * tuning.dentFraction;
}

export const pl237HonkAtHeat = {
  modes: ['flight'],
  name: 'plantsPl237',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._haulerId = null;
    this._lastHonkAt = -Infinity;
    this._cleanNotedPass = -1;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === HONK_AT_HEAT_TUNING.sectorId) this._despawn();
    });
    on('save:loaded', () => this._despawn());
    on('game:newGame', () => this._despawn());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawn();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _despawn() {
    if (this._haulerId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._haulerId);
    }
    this._haulerId = null;
    this._lastHonkAt = -Infinity;
    this._cleanNotedPass = -1;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _station(s) {
    return plantStationById(s, HONK_AT_HEAT_TUNING.stationId);
  },

  _ensureHauler(s) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || this._haulerId != null) return null;
    const ent = spawn({
      type: 'debris',
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 16,
      mass: 400,
      hull: 300,
      hullMax: 300,
      homeSectorId: HONK_AT_HEAT_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Cinder hauler — running the claim line, honks at heat',
        storyPropKind: 'claim_hauler',
        pl237Hauler: true,
        homeSectorId: HONK_AT_HEAT_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._haulerId = ent.id;
    return ent;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== HONK_AT_HEAT_TUNING.sectorId) { this._despawn(); return; }

    const station = this._station(s);
    if (!station?.pos) return;
    const hauler = this._entity(s, this._haulerId) || this._ensureHauler(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!hauler?.pos || !player || player.alive === false || !player.pos) return;

    const now = this._now(s);
    const t = HONK_AT_HEAT_TUNING;

    // Authored motion: the hauler rides its pass line.
    const passPos = haulerPassPosition(now, station.pos);
    hauler.pos.x = passPos.x;
    hauler.pos.z = passPos.z;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const d = Math.hypot(player.pos.x - hauler.pos.x, player.pos.z - hauler.pos.z);
    if (d <= t.honkRadiusWu) {
      if (hasOldScorch(player, t)) {
        // Wear your burns: whoever earned them, the pass salutes the heat.
        if (now - this._lastHonkAt >= t.honkCooldownS) {
          this._lastHonkAt = now;
          this._cleanNotedPass = -1;
          this.bus?.emit(PL_237_HONKED_EVENT, {
            haulerId: this._haulerId, playerId: player.id ?? s.playerId,
            hull: finite(player.hull), hullMax: finite(player.hullMax), t: now,
          });
          this.bus?.emit('audio:cue', { id: 'warning', position: { x: hauler.pos.x, z: hauler.pos.z }, gain: 0.35, rate: 0.45 });
        }
      } else if (this._cleanNotedPass < 0) {
        // Pristine hull: no honk. The pass goes by.
        this._cleanNotedPass = Math.floor(now / t.passPeriodS);
        this.bus?.emit(PL_237_CLEAN_EVENT, { haulerId: this._haulerId, playerId: player.id ?? s.playerId, t: now });
      }
    }
  },
};
