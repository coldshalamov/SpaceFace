// PL-231 Marsh's line — "Tally Marsh's yard is a maze of things that are not salvage yet.
// Cross its line towing anything and Marsh is on open radio before your line goes taut |
// Admire the maze from outside; or test the reflex"
//
// SEAM NOTE (honest): Ceres Refinery is the station_ceres body in sector_ceres_belt
// (src/data/sectors.js:314). Marsh's yard is a fixed maze of kit props off the live station
// body, inside one drawn boundary — the line. Towing is the real massline read: a
// `tether:attached` whose actor is the player (src/combat/attachments.js:541 payload).
// Cross the line while towing and Marsh is on open radio BEFORE your line goes taut — one
// warning per visit. Keep towing inside past the reflex window and the yard answers
// physically: the towed body gets one honest shove back over the line (queuePhysicsImpulse
// on the towed body — never on the player). The maze itself is not salvage: bump its props
// and nothing yields.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the maze,
//   clears the tether book (tuning.memoryCap).
// - The shove lands on the TOWED body only, is impulse-bounded, and cooldown-gated.

import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_231_WARNED_EVENT = 'plants:pl231:warned';
export const PL_231_SHOVED_EVENT = 'plants:pl231:shoved';

export const MARSHS_LINE_TUNING = Object.freeze({
  sectorId: 'sector_ceres_belt',
  stationId: 'station_ceres',
  yardOffsetWu: 340,
  yardRadiusWu: 190,          // the line: cross it towing and Marsh is listening
  bearingSalt: 'plantsPl231Marsh',
  mazePropCount: 8,
  mazePlaceIds: Object.freeze([
    'place_ore_bulk_container', 'place_container_rack_abandoned', 'place_drill_platform_cold',
    'place_crusher_module', 'place_ore_sorter', 'place_parts_rack',
    'place_ore_bulk_container', 'place_power_skid',
  ]),
  propRadius: 10,
  warnCooldownS: 45,          // one open-radio warning per visit
  reflexWindowS: 6,           // inside the line towing past this and the yard moves you
  shoveImpulse: 200,
  shoveCooldownS: 10,
  memoryCap: 6,
});

export const MARSH_LINE_COPY = 'That\u2019s not salvage yet.';

/** Fixed yard layout: the maze inside a circle off the live station body. */
export function marshYardFor(origin, t = MARSHS_LINE_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const center = {
    x: origin.x + Math.cos(bearing) * t.yardOffsetWu,
    z: origin.z + Math.sin(bearing) * t.yardOffsetWu,
  };
  const props = [];
  for (let i = 0; i < t.mazePropCount; i += 1) {
    const a = bearing + (Math.PI * 2 * i) / t.mazePropCount + (h % 13) / 13;
    const r = t.yardRadiusWu * (0.3 + ((h >>> (4 + i)) % 100) / 250);
    props.push({
      x: center.x + Math.cos(a) * r,
      z: center.z + Math.sin(a) * r,
    });
  }
  return { center, props };
}

export function createPl231MarshsLine() {
  return {
    name: 'plantsPl231',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._mazeIds = [];
      this._tethers = new Map();  // attachmentKey -> { targetId } — bounded book
      this._tether = null;        // the watched line { key, actorId, targetId }
      this._insideSince = null;
      this._lastWarnAt = -Infinity;
      this._lastShoveAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('tether:attached', (p = {}) => this._onAttached(p));
      on('tether:broken', (p = {}) => this._onReleased(p));
      on('tether:released', (p = {}) => this._onReleased(p));
      on('sector:exit', () => this._resetVisit());
      on('save:loaded', () => this._resetVisit());
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
      this._resetVisit();
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._mazeIds || []) rm(id);
      }
      this._mazeIds = [];
    },

    _resetVisit() {
      this._tethers?.clear();
      this._tether = null;
      this._insideSince = null;
      this._lastWarnAt = -Infinity;
      this._lastShoveAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _onAttached(p) {
      const s = this.state;
      if (!s || !p) return;
      if (p.actorId !== s.playerId && p.controllerId !== s.playerId) return;
      // One bounded book of live player tethers; the latest is the line Marsh watches.
      if (this._tethers.size >= MARSHS_LINE_TUNING.memoryCap) this._tethers.clear();
      const key = p.attachmentId ?? `p:${p.targetId}`;
      this._tethers.set(key, { targetId: p.targetId ?? null });
      this._tether = { key, actorId: p.actorId, targetId: p.targetId ?? null };
    },

    _onReleased(p) {
      if (!p) return;
      const key = p.attachmentId ?? null;
      if (key != null && this._tethers.has(key)) {
        this._tethers.delete(key);
      } else if (key == null) {
        this._tethers.clear();
      }
      if (this._tether && (key == null || this._tether.key === key)) {
        const next = [...this._tethers.entries()][0];
        this._tether = next ? { key: next[0], actorId: this._tether.actorId, targetId: next[1].targetId } : null;
        this._insideSince = null;
      }
    },

    _ensureMaze(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._mazeIds.length) return;
      const t = MARSHS_LINE_TUNING;
      const { props } = marshYardFor(origin, t);
      props.forEach((pos, i) => {
        const ent = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: t.propRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_marsh_maze_prop',
            plantsPl231Maze: true,
            placeId: t.mazePlaceIds[i % t.mazePlaceIds.length],
            everydaySpaceKit: true,
            scanLabel: 'Marsh\u2019s maze — not salvage yet',
            swarmFloorPad: { label: 'Not salvage yet' },
          },
        });
        this._mazeIds.push(ent && ent.id != null ? ent.id : null);
      });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== MARSHS_LINE_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, MARSHS_LINE_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = MARSHS_LINE_TUNING;
      const now = this._now();
      this._ensureMaze(station.pos);
      const { center } = marshYardFor(station.pos, t);

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const d = Math.hypot(player.pos.x - center.x, player.pos.z - center.z);
      const inside = d <= t.yardRadiusWu;

      if (!inside) { this._insideSince = null; return; }
      if (!this._tether) return;

      // Crossed the line towing anything: Marsh is on open radio before your line goes taut.
      if (now >= this._lastWarnAt + t.warnCooldownS) {
        this._lastWarnAt = now;
        this.bus?.emit('comms:popup', {
          id: `plants:pl231:warn:${Math.round(now)}`,
          sender: 'Tally Marsh',
          category: 'traffic',
          text: MARSH_LINE_COPY,
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'warning' });
        this.bus?.emit(PL_231_WARNED_EVENT, { distanceWu: Math.round(d), t: now });
      }

      // Test the reflex: keep towing inside past the reflex window and the yard answers.
      if (this._insideSince == null) this._insideSince = now;
      const towed = this._tether.targetId != null && s.entities?.get
        ? s.entities.get(this._tether.targetId) : null;
      if (towed?.pos && now - this._insideSince >= t.reflexWindowS
        && now >= this._lastShoveAt + t.shoveCooldownS) {
        this._lastShoveAt = now;
        this._insideSince = now; // one push per window; the next window judges you again
        const ox = towed.pos.x - center.x;
        const oz = towed.pos.z - center.z;
        const od = Math.max(1, Math.hypot(ox, oz));
        queuePhysicsImpulse(towed, { x: (ox / od) * t.shoveImpulse, z: (oz / od) * t.shoveImpulse },
          { tick: s.tick, reason: 'plants:pl231:yard-reflex' });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_231_SHOVED_EVENT, {
          towedId: towed.id, distanceWu: Math.round(od), t: now,
        });
      }
    },
  };
}

export const pl231MarshsLine = createPl231MarshsLine();
