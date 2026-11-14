// PL-203 The tour — "Em Sato points at the garden from her tender, naming each growth for
// nobody: wall, mouth, wall, wall, mouth | Follow the tour from flight, and learn which is
// which before you touch anything"
//
// SEAM NOTE (honest): the garden is the Lung of Charon country — the row's garden is laid as
// a fixed ring of five growth props off the live station_expanse body in sector_charon_expanse
// (src/data/sectors.js:963; the sector already carries the Lung Marker POI and the Lung of
// Charon landmark). Em Sato's tender is a real neutral stranger (makeShipEntitySpec, team 2,
// passive) that walks the ring once per tour and names each growth for nobody — the words are
// the row's own: wall, mouth, wall, wall, mouth. Follow within sensor range and you learn
// which is which (a per-growth lesson ledger). Touch one and the garden answers physically:
// a mouth grips (one honest pull), a wall holds. Learn first, or find out the hard way.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the growths and
//   the tender, clears the lesson ledger (tuning.memoryCap).
// - The grip never writes the player's velocity directly: one queuePhysicsImpulse, cooldown-gated.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_203_NAME_EVENT = 'plants:pl203:named';
export const PL_203_LEARNED_EVENT = 'plants:pl203:learned';
export const PL_203_GRIP_EVENT = 'plants:pl203:grip';
export const PL_203_WALL_EVENT = 'plants:pl203:wall';

export const THE_TOUR_TUNING = Object.freeze({
  sectorId: 'sector_charon_expanse',
  stationId: 'station_expanse',
  gardenRadiusWu: 340,        // ring of growths off the station body
  gardenBearingSalt: 'plantsPl203Garden',
  growthCount: 5,
  growthKinds: Object.freeze(['wall', 'mouth', 'wall', 'wall', 'mouth']), // the row's exact order
  tourSpeedWu: 14,
  nameStopS: 3,               // she lingers over each growth
  followRangeWu: 100,         // follow the tour from flight
  gripImpulse: 150,
  gripCooldownS: 6,
  touchImpulseGate: 70,
  tenderHull: 'ship_pelican',
  factionId: 'faction_dmc',
  growthRadius: 9,
  memoryCap: 10,
});

/** Fixed garden layout: growths on a hash-derived ring off the live station body. */
export function gardenFor(origin, t = THE_TOUR_TUNING) {
  const h = hash32(t.gardenBearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const growths = [];
  for (let i = 0; i < t.growthCount; i += 1) {
    const a = bearing + (Math.PI * 2 * i) / t.growthCount;
    growths.push({
      x: origin.x + Math.cos(a) * t.gardenRadiusWu,
      z: origin.z + Math.sin(a) * t.gardenRadiusWu,
    });
  }
  return growths;
}

/** The name she says at a growth — the row's own words. */
export function nameOfKind(kind) {
  return kind === 'mouth' ? 'Mouth.' : 'Wall.';
}

export function createPl203TheTour() {
  return {
    name: 'plantsPl203',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._growthIds = [];
      this._tenderId = null;
      this._wayIndex = 0;
      this._stopUntil = null;
      this._lessons = new Map();      // growthIndex -> kind, learned by following
      this._lastGripAt = -Infinity;
      this._lastWallAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
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
      this._lessons?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._growthIds || []) rm(id);
        if (this._tenderId != null) rm(this._tenderId);
      }
      this._growthIds = [];
      this._tenderId = null;
      this._wayIndex = 0;
      this._stopUntil = null;
      this._lessons?.clear();
      this._lastGripAt = -Infinity;
      this._lastWallAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _growth(index) {
      const id = this._growthIds[index];
      return id != null && this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureGrowths(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._growthIds.length) return;
      const t = THE_TOUR_TUNING;
      gardenFor(origin, t).forEach((pos, i) => {
        const kind = t.growthKinds[i % t.growthKinds.length];
        const ent = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: t.growthRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_garden_growth',
            plantsPl203Growth: true,
            plantsPl203Kind: kind,
            scanLabel: 'A garden growth — unmarked',
            swarmFloorPad: { label: 'Garden growth' },
          },
        });
        this._growthIds.push(ent && ent.id != null ? ent.id : null);
      });
    },

    _ensureTender(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._tenderId != null) return;
      const t = THE_TOUR_TUNING;
      const ring = gardenFor(origin, t);
      const spec = makeShipEntitySpec(t.tenderHull, {
        team: 2,
        factionId: t.factionId,
        pos: { x: ring[0].x, z: ring[0].z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl203Tender = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = 'Em Sato';
      spec.data.despawnAt = null;
      const ent = spawn(spec);
      if (ent && ent.id != null) this._tenderId = ent.id;
    },

    _name(index, kind, now) {
      const s = this.state;
      this.bus?.emit('comms:popup', {
        id: `plants:pl203:name:${index}:${Math.round(now)}`,
        sender: 'Em Sato',
        category: 'traffic',
        text: nameOfKind(kind),
        ttl: 6,
        persist: false,
      });
      this.bus?.emit(PL_203_NAME_EVENT, { growthIndex: index, kind, t: now });
      // Follow the tour from flight: within range when the name lands, you learn it.
      const player = s?.entities?.get ? s.entities.get(s.playerId) : null;
      const tender = this._tenderId != null && s?.entities?.get ? s.entities.get(this._tenderId) : null;
      if (player?.pos && tender?.pos) {
        const d = Math.hypot(player.pos.x - tender.pos.x, player.pos.z - tender.pos.z);
        if (d <= THE_TOUR_TUNING.followRangeWu) {
          this._lessons.set(index, kind);
          if (this._lessons.size >= THE_TOUR_TUNING.growthCount) {
            const flags = s?.story?.flags;
            if (flags) flags.plantsPl203Learned = true;
            this.bus?.emit('audio:cue', { id: 'confirm' });
            this.bus?.emit(PL_203_LEARNED_EVENT, { learned: this._lessons.size, t: now });
          }
        }
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const growth = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl203Growth === true);
      if (!growth) return;
      const otherId = p.aId === growth.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      const impulse = Number(p.impulse) || 0;
      if (impulse < THE_TOUR_TUNING.touchImpulseGate) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos || !growth.pos) return;
      const index = this._growthIds.indexOf(growth.id);
      const kind = growth.data.plantsPl203Kind;
      const now = this._now();
      if (kind === 'mouth') {
        // A mouth grips. Learning it first does not make it gentle — it makes it known.
        if (now - this._lastGripAt < THE_TOUR_TUNING.gripCooldownS) return;
        this._lastGripAt = now;
        const dx = growth.pos.x - player.pos.x;
        const dz = growth.pos.z - player.pos.z;
        const d = Math.max(1, Math.hypot(dx, dz));
        queuePhysicsImpulse(player, { x: (dx / d) * THE_TOUR_TUNING.gripImpulse, z: (dz / d) * THE_TOUR_TUNING.gripImpulse },
          { tick: s.tick, externalEffect: true, isPlayerTarget: true });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_203_GRIP_EVENT, {
          growthIndex: index, learned: this._lessons.has(index), t: now,
        });
        return;
      }
      // A wall holds. If you learned the tour, you knew it would — one hold per window,
      // the same cooldown the mouth's grip keeps, so a grind fires the beat once.
      if (now - this._lastWallAt < THE_TOUR_TUNING.gripCooldownS) return;
      this._lastWallAt = now;
      this.bus?.emit('audio:cue', { id: this._lessons.has(index) ? 'confirm' : 'ui_deny' });
      this.bus?.emit(PL_203_WALL_EVENT, { growthIndex: index, learned: this._lessons.has(index), t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== THE_TOUR_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, THE_TOUR_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = THE_TOUR_TUNING;
      const now = this._now();
      this._ensureGrowths(station.pos);
      this._ensureTender(station.pos);
      const tender = this._tenderId != null && s.entities?.get ? s.entities.get(this._tenderId) : null;
      if (!tender?.pos) return;

      const ring = gardenFor(station.pos, t);
      if (this._stopUntil != null) {
        if (now < this._stopUntil) return;
        this._stopUntil = null;
        this._wayIndex = (this._wayIndex + 1) % ring.length;
        return;
      }
      const target = ring[this._wayIndex % ring.length];
      const dx = target.x - tender.pos.x;
      const dz = target.z - tender.pos.z;
      const d = Math.hypot(dx, dz);
      const step = t.tourSpeedWu * Math.max(0, Number(dt) || 0);
      if (d <= Math.max(step, 1)) {
        tender.pos.x = target.x;
        tender.pos.z = target.z;
        this._name(this._wayIndex % ring.length, t.growthKinds[this._wayIndex % t.growthKinds.length], now);
        this._stopUntil = now + t.nameStopS;
      } else {
        tender.pos.x += (dx / d) * step;
        tender.pos.z += (dz / d) * step;
      }
    },
  };
}

export const pl203TheTour = createPl203TheTour();
