// PL-264 The light remembers — "Hold still through the full count at a red lane light and
// the next three crossings for you run green one beat early."
// What the player can do: Jump the count — the light remembers that too, and runs you red all
// week.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; anchors via
//   hash32 (src/core/rng.js). No Three.js/DOM.
// - SEAM NOTE (honest): the game has no traffic-light system, so this plant authors the red
//   lane light itself — one real story-prop beacon at a deterministic lane spot per sector
//   (pl104's gap-anchor convention), with a real count cycle the sim owns in entity data.
//   Lamps: data.lampsFlashing + lampFlashUntil while the light is green for you.
// - Hold still through the full count = inside the light radius at holding speed for the
//   whole red count; the next three crossings run green one beat early. Jump the count =
//   crossing through the radius at speed before the count completes; the light runs you red
//   all week (a bounded redWeekS, the row's "week" at table-clock scale).
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes + despawns the light it owns.

import { hash32 } from '../../core/rng.js';

export const PLANTS_LIGHT_EVENT = 'plants:pl264:light';

export const LANE_LIGHT_TUNING = Object.freeze({
  plId: 'pl264',
  lightRadiusWu: 60,
  cycleS: 24,               // red count then green
  redFrac: 0.6,             // the count
  holdSpeedWu: 6,           // hold still
  jumpSpeedWu: 40,          // jumping the count
  greensEarly: 3,           // the next three crossings
  earlyBeatS: 3,            // green one beat early
  redWeekS: 900,            // "all week" at the table clock
  dayLengthS: 240,
  memoryCap: 4,
});

export const LIGHT_SALT = 'plantsPl264Light';

/** The light's fixed spot in a sector — deterministic, never moves. */
export function laneLightAnchor(sectorId) {
  const h = hash32(LIGHT_SALT, String(sectorId ?? 's1'));
  return { x: -500 + (h % 1200), z: 300 + ((h >>> 9) % 1200) };
}

/** Pure: the light's state at simTime for an ordinary crossing (no credit, no grudge). */
export function lightPhaseAt(simTime, t = LANE_LIGHT_TUNING) {
  const cycle = ((simTime % t.cycleS) + t.cycleS) % t.cycleS;
  return cycle < t.cycleS * t.redFrac ? 'red' : 'green';
}

export function createPl264LaneLight() {
  return {
    name: 'plantsPl264',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._lightId = null;
      this._dwellS = 0;
      this._inside = false;
      this._greensEarly = 0;
      this._redYouUntil = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      if (this._lightId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._lightId);
      }
      this._lightId = null;
      this._dwellS = 0;
      this._inside = false;
      this._heldGranted = false;
      this._greenAt = 0;
      this._greensEarly = 0;
      this._redYouUntil = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _spawnLight(sectorId) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function') return null;
      const anchor = laneLightAnchor(sectorId);
      const ent = spawnEntity({
        type: 'beacon',
        pos: anchor,
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_lane_light',
          plantsPl264Light: true,
          scanLabel: 'The lane light — a count everybody waits out',
          swarmFloorPad: { label: 'RED — HOLD' },
          masslineTetherable: true,
        },
      });
      return ent && ent.id != null ? ent : null;
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const sectorId = s.world && s.world.currentSectorId;
      if (!sectorId) return;
      if (this._lightId == null) {
        const light = this._spawnLight(sectorId);
        if (!light) return;
        this._lightId = light.id;
      }
      const light = s.entities && s.entities.get ? s.entities.get(this._lightId) : null;
      if (!light || light.alive === false || !light.pos) { this._lightId = null; return; }
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || player.alive === false || !player.pos || !player.vel) return;
      const t = LANE_LIGHT_TUNING;
      const d = Math.hypot(player.pos.x - light.pos.x, player.pos.z - light.pos.z);
      const speed = Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0);
      const data = light.data || (light.data = {});
      const redForYou = now < this._redYouUntil;

      if (d <= t.lightRadiusWu) {
        const phase = lightPhaseAt(now, t);
        const green = phase === 'green' || (this._greensEarly > 0 && now >= this._greenAt);
        if (green) {
          // Green for you — one beat early when the light remembers the full counts.
          data.lampsFlashing = true;
          data.lampFlashUntil = now + 0.6;
          data.swarmFloorPad = { label: 'GO' };
          // Held still through the whole count and the count just ran out: credit, once.
          if (!this._heldGranted && this._dwellS >= t.cycleS * t.redFrac * 0.95) {
            this._heldGranted = true;
            this._greensEarly = t.greensEarly;
            this._greenAt = now + t.earlyBeatS;
            this.bus.emit(PLANTS_LIGHT_EVENT, { kind: 'count_completed', dwellS: this._dwellS, t: now });
          }
          if (this._inside === false && this._greensEarly > 0) {
            this._greensEarly -= 1;
            this.bus.emit(PLANTS_LIGHT_EVENT, { kind: 'green_early', greensLeft: this._greensEarly, t: now });
          }
          this._inside = true;
          this._dwellS = 0;
          return;
        }
        // The count: hold still through it.
        if (!this._inside) {
          this._inside = true;
          this._dwellS = 0;
          this._greenAt = now + t.earlyBeatS;
          data.swarmFloorPad = { label: 'RED — HOLD' };
        }
        if (speed <= t.holdSpeedWu) {
          this._dwellS += Math.max(0, Number(dt) || 0);
          if (this._dwellS >= t.cycleS * t.redFrac && !this._heldGranted) {
            // Held the full count: the next three crossings run green one beat early.
            this._heldGranted = true;
            this._greensEarly = t.greensEarly;
            this._greenAt = now + t.earlyBeatS;
            this.bus.emit(PLANTS_LIGHT_EVENT, { kind: 'count_completed', dwellS: this._dwellS, t: now });
          }
        } else if (speed >= t.jumpSpeedWu && this._dwellS < t.cycleS * t.redFrac) {
          // Jump the count — the light remembers that too.
          this._greensEarly = 0;
          this._redYouUntil = now + t.redWeekS;
          data.swarmFloorPad = { label: 'RED — YOURS' };
          this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.8 });
          this.bus.emit(PLANTS_LIGHT_EVENT, { kind: 'jumped', until: this._redYouUntil, t: now });
          this._inside = true;
        }
        return;
      }
      // Outside: a completed crossing resets the beat bookkeeping.
      if (this._inside) {
        this._inside = false;
        this._dwellS = 0;
        this._heldGranted = false;
      }
      if (!redForYou) {
        data.swarmFloorPad = { label: lightPhaseAt(now, t) === 'red' ? 'RED — HOLD' : 'GO' };
        data.lampsFlashing = lightPhaseAt(now, t) === 'green';
        data.lampFlashUntil = lightPhaseAt(now, t) === 'green' ? now + 0.6 : 0;
      }
    },
  };
}

export const pl264LaneLight = createPl264LaneLight();
