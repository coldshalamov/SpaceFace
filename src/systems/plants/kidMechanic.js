// PL-276 The kid mechanic — Tethys (design/program/INFERENCE_PLANTS.md, row PL-276).
// "The kid mechanic. A kid watches your fit-out from the fence and points at one coupling
// seated wrong. They are right."
// What the player can do: Thank them by name; or brush them off — next fit-out has no
// pointers, and one looseness nobody mentions.
//
// SEAM NOTE (honest): the fence is a chalked line off the REAL Tethys trade hub
// (station_tethys, sector_tethys_junction); the kid is a real neutral stranger
// (makeShipEntitySpec, team 2, passive — traffic.js pattern) with the callsign Pip, on the
// fence during the work band of the shared 240 s plant day. A fit-out is parking slow near
// the fence; the pointed coupling is a physical loose payload prop that appears at your
// hull when they point. The kid's name is on a bell at the fence: ringing it twice (two
// real physics impacts) is thanking them by name — Pip seats the coupling. Brushing them
// off is leaving the fit-out with the coupling still loose; the NEXT fit-out gets no
// pointer, and a looseness spawns with no label and no lamp — nobody mentions it.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; work band and fence bearing are pure
//   clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: fit ledger capped at tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns the kid and owned props.
// - The durable brush receipt is flag-borne (state.story.flags.plantsPl276Brushed).

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_276_POINT_EVENT = 'plants:pl276:point';
export const PL_276_THANKS_EVENT = 'plants:pl276:thanks';
export const PL_276_BRUSHED_EVENT = 'plants:pl276:brushed';
export const PL_276_LOOSE_EVENT = 'plants:pl276:loose';

export const KID_MECHANIC_TUNING = Object.freeze({
  stationId: 'station_tethys',
  sectorId: 'sector_tethys_junction',
  dayLengthS: 240,
  workFraction: 0.5,           // work band: phase in [0.25, 0.75)
  fenceRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the fence line
  fitRangeWu: 60,
  fitSpeedWu: 6,
  fitNeedS: 6,
  brushWindowS: 25,            // leave inside this window and you brushed them off
  bellImpulseGate: 60,
  knockWindowS: 3,
  memoryCap: 8,
  kidHull: 'ship_wasp',
  kidFaction: 'faction_dmc',
  kidCallsign: 'Pip',
});

export const FENCE_SALT = 'plantsPl276Fence';
export const POINT_LINE = 'Your three coupling \u2014 seated wrong.';
export const THANKS_LINE = 'Told you it was three.';
export const BRUSH_LINE = 'Fine. Watch your own tails, then.';

/** Work band of the shared plant day. */
export function workAt(simTime, t = KID_MECHANIC_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  const start = len * 0.25;
  return phase >= start && phase < start + len * t.workFraction;
}

/** Day index of the shared plant clock. */
export function kidDayOf(simTime, t = KID_MECHANIC_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The fence: a fixed chalked spot off the station, hash-derived bearing. */
export function fencePointFor(station, t = KID_MECHANIC_TUNING) {
  const a = (hash32(FENCE_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.fenceRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
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

export function createKidMechanic() {
  return {
    name: 'plantsPl276',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._fenceId = null;
      this._bellId = null;
      this._kidId = null;
      this._looseId = null;
      this._fitS = 0;
      this._pointedAt = null;
      this._thanksDay = -1;
      this._rings = [];
      this._brushed = false;
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
      this._brushed = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._fenceId, this._bellId, this._kidId, this._looseId]) {
          if (id != null) rm(id);
        }
      }
      this._fenceId = null;
      this._bellId = null;
      this._kidId = null;
      this._looseId = null;
      this._fitS = 0;
      this._pointedAt = null;
      this._thanksDay = -1;
      this._rings = [];
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _say(id, text, channel = 'bark') {
      this.bus?.emit('voice:say', { channel, id, text, ttl: 6 });
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

    _ensureStreet(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = fencePointFor(station);
      if (this._fenceId == null) {
        const fence = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 10,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: KID_MECHANIC_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_yard_fence',
            plantsPl276Fence: true,
            placeId: 'place_repair_scaffold',
            everydaySpaceKit: true,
            scanLabel: 'The yard fence — kids watch fit-outs from here',
            swarmFloorPad: { label: 'THE FENCE' },
          },
        });
        this._fenceId = fence && fence.id != null ? fence.id : null;
      }
      if (this._bellId == null && this._fenceId != null) {
        const fence = this._get(this._fenceId);
        const bell = spawn({
          type: 'beacon',
          pos: { x: (fence?.pos.x ?? point.x) + 14, z: (fence?.pos.z ?? point.z) + 4 },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: KID_MECHANIC_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_pip_bell',
            plantsPl276Bell: true,
            scanLabel: 'Pip\u2019s bell — ring it twice to say thanks by name',
            swarmFloorPad: { label: 'PIP\u2019S BELL' },
          },
        });
        this._bellId = bell && bell.id != null ? bell.id : null;
      }
    },

    _ensureKid(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._kidId != null) return;
      const point = fencePointFor(station);
      const spec = makeShipEntitySpec(KID_MECHANIC_TUNING.kidHull, {
        team: 2,
        factionId: KID_MECHANIC_TUNING.kidFaction,
        pos: { x: point.x + 16, z: point.z + 8 },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl276Kid = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = KID_MECHANIC_TUNING.kidCallsign;
      spec.data.despawnAt = null; // we own their leaving, not core.lifetimeSweep
      const ent = spawn(spec);
      if (ent && ent.id != null) this._kidId = ent.id;
    },

    _spawnLoose(player, silent) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._looseId != null) return;
      const loose = spawn({
        type: 'payload',
        pos: { x: player.pos.x + 8, z: player.pos.z - 8 },
        vel: { x: 0, z: 0 },
        radius: 3,
        mass: 2,
        physicsBody: { mass: 2 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_loose_coupling',
          plantsPl276Loose: true,
          masslineTetherable: true,
          // Silent looseness (brushed): no label, no lamp — nobody mentions it.
          swarmFloorPad: silent ? undefined : { label: 'LOOSE COUPLING' },
          lampsFlashing: false,
          plantsPl276Silent: silent === true,
        },
      });
      if (loose && loose.id != null) {
        this._looseId = loose.id;
        this._emit(PL_276_LOOSE_EVENT, { silent: silent === true, looseId: loose.id });
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._bellId == null) return;
      const bell = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl276Bell === true);
      if (!bell) return;
      if ((Number(p.impulse) || 0) < KID_MECHANIC_TUNING.bellImpulseGate) return;
      const now = this._now();
      this._rings.push(now);
      while (this._rings.length > 4) this._rings.shift();
      const [a, b] = this._rings;
      if (this._rings.length >= 2 && b - a <= KID_MECHANIC_TUNING.knockWindowS) {
        this._rings = [];
        if (this._looseId != null && !this._brushed) {
          this.helpers?.removeEntity?.(this._looseId);
          this._looseId = null;
          this._pointedAt = null;
          this._thanksDay = kidDayOf(now);
          const player = this._get(s.playerId);
          if (player?.data) player.data.plantsPl276Seated = true;
          this._cue('confirm', 0.45);
          this._popup(`plants:pl276:thanks:${Math.round(now)}`, KID_MECHANIC_TUNING.kidCallsign, THANKS_LINE);
          this._emit(PL_276_THANKS_EVENT, { t: now });
        }
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== KID_MECHANIC_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, KID_MECHANIC_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = KID_MECHANIC_TUNING;
      this._ensureStreet(station);

      // The kid watches from the fence during the work band; shift's end, they go in.
      if (!workAt(now, t)) {
        if (this._kidId != null) this.helpers?.removeEntity?.(this._kidId);
        this._kidId = null;
        this._fitS = 0;
        return;
      }
      this._ensureKid(station);
      const kid = this._kidId != null ? this._get(this._kidId) : null;
      if (!kid?.pos) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const fence = fencePointFor(station);

      // The kid drifts along the fence line, watching.
      kid.pos.x = fence.x + 16 + Math.sin(now / 12) * 10;
      kid.pos.z = fence.z + 8 + Math.cos(now / 12) * 6;

      const d = Math.hypot(player.pos.x - kid.pos.x, player.pos.z - kid.pos.z);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const fitting = d <= t.fitRangeWu && speed <= t.fitSpeedWu;

      // Brushing them off: walked away with their pointer still hanging.
      if (this._pointedAt != null && !fitting && now - this._pointedAt >= t.brushWindowS) {
        this._pointedAt = null;
        if (!this._brushed) {
          this._brushed = true;
          const flags = this._flags();
          if (flags) flags.plantsPl276Brushed = true;
          this.helpers?.removeEntity?.(this._looseId);
          this._looseId = null;
          this._cue('ui_deny', 0.4);
          this._popup(`plants:pl276:brushed:${Math.round(now)}`, t.kidCallsign, BRUSH_LINE);
          this._emit(PL_276_BRUSHED_EVENT, { t: now });
        }
        return;
      }

      if (this._looseId == null) {
        if (fitting) {
          this._fitS += Math.max(0, Number(dt) || 0);
          if (this._fitS >= t.fitNeedS) {
            this._fitS = 0;
            this._brushed = !!(this._flags() && this._flags().plantsPl276Brushed);
            if (this._brushed) {
              // No pointers, and one looseness nobody mentions: unlabeled, lamps dark.
              this._spawnLoose(player, true);
            } else {
              this._say('plants:pl276:point', POINT_LINE);
              this._popup(`plants:pl276:point:${Math.round(now)}`, t.kidCallsign, POINT_LINE);
              this._emit(PL_276_POINT_EVENT, { t: now });
              this._spawnLoose(player, false);
              this._pointedAt = now;
            }
          }
        } else {
          this._fitS = 0;
        }
      }
    },
  };
}

export const kidMechanicPlant = createKidMechanic();
