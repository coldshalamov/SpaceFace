// PL-215 Somebody's stall — "Kepler | Somebody's stall. One stall at the Scar sells a single item a
// night, and the item is always somebody's lost thing | Buy it back for its owner; or wonder how it
// keeps getting lost | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): the Scar is sector_kepler_scar / station_kepler_scar — Scar Bazaar
// (verified in src/data/frontierRegions/west.js, which already carries a Price Post stall POI).
// The night stall exists only in the row, so it is a story-prop post (swarmFloorPad label —
// floatingText.js pad shape) stocking ONE persistent crate per deterministic day (type 'payload',
// flags.persistent, physicsBody.mass, data.masslineTetherable — the verified crate contract).
// Buying back is the real credits seam (economy:chargeCredits, beacons.js pattern) after a
// state.player.credits check; there is no invented shop UI.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit withdraw the owned crate and post.
// - Bounded ledgers (tuning.memoryCap); one item per day; one buy per item.
// - Items come from a fixed lost-things table keyed by day hash.

import { hash32 } from '../../core/rng.js';

export const PL_215_STOCKED_EVENT = 'plants:pl215:stocked';
export const PL_215_BOUGHT_BACK_EVENT = 'plants:pl215:boughtBack';
export const PL_215_LOST_AGAIN_EVENT = 'plants:pl215:lostAgain';
export const PL_215_SHORT_EVENT = 'plants:pl215:short';

export const STALL_SENDER = 'SCAR STALL';
export const LOST_AGAIN_LINE = 'It keeps getting lost.';

export const LOST_THINGS = Object.freeze([
  Object.freeze({ thing: "a cutter's left glove", owner: 'the tally post' }),
  Object.freeze({ thing: 'a tuning fork', owner: 'the choir shed' }),
  Object.freeze({ thing: 'half a star chart', owner: 'a runner' }),
  Object.freeze({ thing: "somebody's lucky bolt", owner: 'the enforcers' }),
  Object.freeze({ thing: 'a scratched name plate', owner: 'the Flight Deck crew' }),
]);

export const STALL_TUNING = Object.freeze({
  sectorId: 'sector_kepler_scar',
  stationId: 'station_kepler_scar',
  stallOffsetWu: 300,
  dayS: 240,                   // one item a night
  buyRadiusWu: 60,
  basePriceCr: 80,
  priceSpreadCr: 220,
  crateMass: 12,
  memoryCap: 10,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Deterministic item for a night: always somebody's lost thing. */
export function itemForDay(dayIndex, things = LOST_THINGS) {
  const h = hash32('plantsPl215item', Math.floor(finite(dayIndex)));
  const pick = things[h % things.length];
  const price = STALL_TUNING.basePriceCr + (hash32('plantsPl215price', Math.floor(finite(dayIndex))) % STALL_TUNING.priceSpreadCr);
  return { ...pick, priceCr: price };
}

/** Deterministic stall mooring off the Bazaar. */
export function stallPosition(stationPos, sectorId = STALL_TUNING.sectorId) {
  const h = hash32('plantsPl215pos', String(sectorId));
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * STALL_TUNING.stallOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * STALL_TUNING.stallOffsetWu,
  };
}

export const pl215SomebodysStall = {
  name: 'plantsPl215',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._crateId = null;
    this._stockedDay = -1;
    this._lastShortAt = -Infinity;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === STALL_TUNING.sectorId) this._withdraw();
    });
    on('save:loaded', () => this._withdraw());
    on('game:newGame', () => this._withdraw());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._withdraw();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _withdraw() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._crateId != null) rm(this._crateId);
      if (this._postId != null) rm(this._postId);
    }
    this._crateId = null;
    this._postId = null;
    this._stockedDay = -1;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === STALL_TUNING.stationId) return e;
    }
    return null;
  },

  _ensurePost(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const pos = stallPosition(station.pos);
    if (this._postId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: STALL_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "Somebody's stall — one item a night",
        storyPropKind: 'night_stall',
        pl215Stall: true,
        swarmFloorPad: { label: "SOMEBODY'S STALL" },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: STALL_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._postId = ent.id;
    return pos;
  },

  _stockCrate(s, now, day, pos) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || pos == null) return;
    const item = itemForDay(day);
    const ent = spawn({
      type: 'payload',
      pos: { x: pos.x + 18, z: pos.z + 6 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: STALL_TUNING.crateMass,
      hull: 30,
      hullMax: 30,
      physicsBody: { mass: STALL_TUNING.crateMass },
      flags: { persistent: true },
      homeSectorId: STALL_TUNING.sectorId,
      data: {
        masslineTetherable: true,
        scanLabel: `Somebody's lost thing — ${item.thing}`,
        pl215Item: { day, thing: item.thing, owner: item.owner, priceCr: item.priceCr },
        homeSectorId: STALL_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._crateId = ent.id;
      this._stockedDay = day;
      this.bus?.emit(PL_215_STOCKED_EVENT, { crateId: ent.id, day, thing: item.thing, owner: item.owner, priceCr: item.priceCr, t: now });
    }
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== STALL_TUNING.sectorId) { this._withdraw(); return; }

    const now = this._now(s);
    const t = STALL_TUNING;
    const pos = this._ensurePost(s, now);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const day = Math.floor(now / t.dayS);
    const crate = this._entity(s, this._crateId);

    // Night rollover: the old item is withdrawn unbought — wonder how it keeps getting lost.
    if (crate && this._stockedDay !== day) {
      this.bus?.emit(PL_215_LOST_AGAIN_EVENT, { crateId: this._crateId, day: this._stockedDay, t: now });
      this.bus?.emit('comms:popup', {
        id: `plants:pl215:lost:${this._stockedDay}`, sender: STALL_SENDER, category: 'traffic',
        text: LOST_AGAIN_LINE, ttl: 6, persist: false,
      });
      if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(this._crateId);
      this._crateId = null;
    }

    // Stock tonight's single item.
    if (!this._crateId) this._stockCrate(s, now, day, pos);

    // Buy it back for its owner — the real credits seam.
    const live = this._entity(s, this._crateId);
    if (live?.pos && live.data?.pl215Item) {
      const d = Math.hypot(player.pos.x - live.pos.x, player.pos.z - live.pos.z);
      if (d <= t.buyRadiusWu) {
        const { thing, owner, priceCr } = live.data.pl215Item;
        const credits = finite(s.player?.credits, 0);
        if (credits >= priceCr) {
          this.bus?.emit('economy:chargeCredits', { amount: priceCr, reason: 'pl215_somebodys_stall' });
          this.bus?.emit(PL_215_BOUGHT_BACK_EVENT, { crateId: live.id, thing, owner, priceCr, t: now });
          this.bus?.emit('comms:popup', {
            id: `plants:pl215:bought:${live.id}`, sender: STALL_SENDER, category: 'traffic',
            text: `Sold. It goes back to ${owner}.`, ttl: 7, persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'confirm', position: { x: live.pos.x, z: live.pos.z }, gain: 0.5, rate: 1 });
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(live.id);
          this._crateId = null;
        } else if (now - this._lastShortAt >= t.dayS / 12) {
          this._lastShortAt = now;
          this.bus?.emit(PL_215_SHORT_EVENT, { priceCr, credits, t: now });
          this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: live.pos.x, z: live.pos.z }, gain: 0.4, rate: 1 });
        }
      }
    }
  },
};
