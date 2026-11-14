// PL-247 The scandal — "Nereid | The scandal. Put a wreck on the Scale and the whole yard stops to
// watch the number — and argues for an hour about whether that counts | Weigh anything; the yard
// loves a scandal | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Nereid is sector_nereid_shoal / station_nereid — Nereid Waystation
// (verified in src/data/frontierRegions/east.js, an open-dock yard "under very thin law"). The
// yard Scale exists only in the row, so it is an everyday-kit dressing pad (place_inspection_
// platform, stampSolidDressing — kesslerScale pattern) plus a yard post with a floor pad label
// (entity.data.swarmFloorPad — floatingText.js pad shape; the label swaps while the yard argues).
// "Put a wreck on the Scale" is physical: a wreck-class body (type 'wreck', stamped wreck, or
// heavy debris) actually inside the weigh radius. The argument is yard traffic — comms:popup,
// category 'traffic' — and the Scale refuses new weighs while it runs (cooldown).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit drop the owned row and despawn the post.
// - Bounded ledgers (tuning.memoryCap); one weigh at a time; the argument is the cooldown.
// - The number is a deterministic hash of the wreck, stamped as what the yard makes of it.

import { hash32 } from '../../core/rng.js';
import { insertDressingRow, dropDressingRow } from '../../world/dressingTable.js';
import { stampSolidDressing } from '../../world/solidDressing.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_247_SCANDAL_EVENT = 'plants:pl247:scandal';
export const PL_247_WEIGHED_EVENT = 'plants:pl247:weighed';

export const RIGGER_SENDER = 'YARD RIGGER';
export const CLERK_SENDER = 'YARD CLERK';
export const RIGGER_LINE = 'That counts.';
export const CLERK_LINE = 'That does not count.';
export const PAD_LABEL = 'THE SHOAL SCALE';
export const PAD_LABEL_ARGUING = 'THE SCALE — ARGUING';

export const SCANDAL_TUNING = Object.freeze({
  sectorId: 'sector_nereid_shoal',
  stationId: 'station_nereid',
  padOffsetWu: 340,
  weighRadiusWu: 80,
  wreckMassMin: 400,           // heavy debris reads as wreck-class on the Scale
  argueDurationS: 60,          // "an hour" of yard time, on the watch-day scale
  quietCooldownS: 15,          // ordinary weighs cool like ordinary business
  memoryCap: 10,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const SCALE_SALT = hash32('plantsPl247scale', SCANDAL_TUNING.sectorId);

/** Deterministic Scale pad position off the Waystation. */
export function scalePadPosition(stationPos, sectorId = SCANDAL_TUNING.sectorId) {
  const h = hash32('plantsPl247pos', String(sectorId), SCALE_SALT);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * SCANDAL_TUNING.padOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * SCANDAL_TUNING.padOffsetWu,
  };
}

/** What the yard reads off a body: wreck-class loads stop the yard. */
export function isWreckBody(ent, tuning = SCANDAL_TUNING) {
  if (!ent || ent.alive === false) return false;
  if (ent.type === 'wreck') return true;
  const data = ent.data || {};
  if (data.wreck === true) return true;
  return ent.type === 'debris' && finite(ent.mass) >= tuning.wreckMassMin;
}

/** The number the yard stops for: deterministic off the wreck identity. */
export function weighNumberFor(entityId, mass) {
  const h = hash32('plantsPl247number', String(entityId));
  return Math.round(finite(mass) + (h % 40) - 20);
}

export const pl247TheScandal = {
  name: 'plantsPl247',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._rowId = null;
    this._postId = null;
    this._argueUntil = -Infinity;
    this._lastQuietAt = new Map();   // entityId -> last quiet weigh (bounded)
    this._scandalIds = new Map();    // entityId -> arguedAt; a wreck argues once per placement
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === SCANDAL_TUNING.sectorId) this._clear();
    });
    on('save:loaded', () => this._clear());
    on('game:newGame', () => this._clear());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _clear() {
    const s = this.state;
    if (this._rowId != null && s) dropDressingRow(s, this._rowId);
    this._rowId = null;
    if (this._postId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._postId);
    }
    this._postId = null;
    this._argueUntil = -Infinity;
    this._lastQuietAt = new Map();
    this._scandalIds = new Map();
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    return plantStationById(s, SCANDAL_TUNING.stationId);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _ensureScale(s) {
    const station = this._station(s);
    if (!station?.pos) return null;
    const pos = scalePadPosition(station.pos);
    if (this._rowId == null) {
      const data = {
        pl247Scale: true,
        placeId: 'place_inspection_platform',
        homeSectorId: SCANDAL_TUNING.sectorId,
        sectorId: SCANDAL_TUNING.sectorId,
        name: 'The shoal Scale',
        everydaySpaceKit: true,
      };
      const solid = stampSolidDressing(data, { radius: 26 });
      const row = insertDressingRow(s, {
        type: 'prop',
        pos, rot: 0,
        radius: 26,
        homeSectorId: SCANDAL_TUNING.sectorId,
        data,
        collides: !!solid,
        ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
      });
      if (row && row.id != null) this._rowId = row.id;
    }
    if (this._postId == null && typeof this.helpers?.spawnEntity === 'function') {
      const ent = this.helpers.spawnEntity({
        type: 'beacon',
        pos, vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: SCANDAL_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          scanLabel: 'The shoal Scale — put a wreck on it',
          storyPropKind: 'yard_scale',
          pl247ScalePost: true,
          swarmFloorPad: { label: PAD_LABEL },
          tetherable: true,
          masslineTetherable: true,
          homeSectorId: SCANDAL_TUNING.sectorId,
        },
      });
      if (ent && ent.id != null) this._postId = ent.id;
    }
    return pos;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== SCANDAL_TUNING.sectorId) { this._clear(); return; }

    const pad = this._ensureScale(s);
    const now = this._now(s);
    const t = SCANDAL_TUNING;
    if (!pad) return;
    const post = this._entity(s, this._postId);

    // The argument runs; the Scale refuses new business while the yard argues.
    const arguing = now < this._argueUntil;
    if (arguing && post?.data) {
      const padRec = post.data.swarmFloorPad || (post.data.swarmFloorPad = { label: PAD_LABEL });
      padRec.label = PAD_LABEL_ARGUING;
    } else if (post?.data?.swarmFloorPad) {
      post.data.swarmFloorPad.label = PAD_LABEL;
    }

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const entities = s.entities;
    if (arguing || typeof entities?.values !== 'function') return;

    // A wreck argues once per placement: only when it comes back OFF and ON the pad again
    // does the yard stop for it twice. Bounded ledger, dropped when the body leaves the pad.
    const inRadius = new Set();
    for (const e of entities.values()) {
      if (!e || e.alive === false || !e.pos) continue;
      if (e.id === this._postId || e.type === 'station' || e === (typeof entities.get === 'function' ? entities.get(s.playerId) : null)) continue;
      const d = Math.hypot(e.pos.x - pad.x, e.pos.z - pad.z);
      if (d > t.weighRadiusWu) continue;
      inRadius.add(e.id);

      if (isWreckBody(e, t)) {
        if (this._scandalIds.has(e.id)) continue;   // already argued over, still sitting there
        // Put a wreck on the Scale: the whole yard stops to watch the number — and argues.
        if (this._scandalIds.size >= t.memoryCap) {
          const oldest = this._scandalIds.keys().next().value;
          this._scandalIds.delete(oldest);
        }
        this._scandalIds.set(e.id, now);
        const number = weighNumberFor(e.id, e.mass);
        this._argueUntil = now + t.argueDurationS;
        this.bus?.emit(PL_247_SCANDAL_EVENT, {
          wreckId: e.id, mass: finite(e.mass), number, argueUntil: this._argueUntil, t: now,
        });
        this.bus?.emit('comms:popup', {
          id: `plants:pl247:rigger:${e.id}`, sender: RIGGER_SENDER, category: 'traffic',
          text: RIGGER_LINE, ttl: 7, persist: false,
        });
        this.bus?.emit('comms:popup', {
          id: `plants:pl247:clerk:${e.id}`, sender: CLERK_SENDER, category: 'traffic',
          text: CLERK_LINE, ttl: 7, persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: pad.x, z: pad.z }, gain: 0.5, rate: 0.8 });
        return;   // one scandal at a time
      }

      const last = this._lastQuietAt.get(e.id);
      if (last === undefined || now - last >= t.quietCooldownS) {
        if (this._lastQuietAt.size >= t.memoryCap) {
          const oldest = this._lastQuietAt.keys().next().value;
          this._lastQuietAt.delete(oldest);
        }
        this._lastQuietAt.set(e.id, now);
        // Weigh anything: the yard takes ordinary business quietly.
        this.bus?.emit(PL_247_WEIGHED_EVENT, {
          entityId: e.id, type: e.type, mass: finite(e.mass), t: now,
        });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pad.x, z: pad.z }, gain: 0.25, rate: 1.2 });
      }
    }
    for (const id of this._scandalIds.keys()) {
      if (!inRadius.has(id)) this._scandalIds.delete(id);
    }
  },
};
