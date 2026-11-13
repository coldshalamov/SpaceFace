// PL-175 First — "Beat Juno to a place you both marked, and the wall there reads only your tag
// — with, small, underneath: *J.C.* and nothing else | Leave it as is; or add the plus yourself"
// The small-underneath mark *J.C.* is final copy from the row.
//
// SEAM NOTE (honest): Juno exists in live code only as a random bark name, so this plant stages
// the racer self-contained: "J.C." is a physical racer light running a fixed three-waypoint
// circuit in sector_tethys_junction (authored motion, sim-time). "A place you both marked" is
// honest too: YOUR mark is a deployed claim beacon (beacon:deployed — the real marking verb);
// the mark counts as "both marked" once J.C.'s circuit has passed within notice range of it.
// Beat J.C. to the marked place — arrive before the racer's next pass — and a tag appears on
// the wall there: your tag, with J.C. small underneath. Dwell beside the tag to add the plus
// yourself. If J.C. passes first, the moment is gone (no tag, no voice).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears Maps.
// - One active mark and one tag at a time; J.C.'s position is authored sim motion.

import { hash32 } from '../../core/rng.js';

export const PL_175_FIRST_EVENT = 'plants:pl175:first';
export const PL_175_TAGGED_EVENT = 'plants:pl175:tagged';
export const PL_175_PLUS_EVENT = 'plants:pl175:plus';
export const PL_175_JUNO_FIRST_EVENT = 'plants:pl175:junoFirst';

export const FIRST_RACE_TUNING = Object.freeze({
  sectorId: 'sector_tethys_junction',
  noticeRadiusWu: 160,        // J.C. "marks" your beacon by passing this close
  beatRadiusWu: 60,           // arrive this close to win the place
  plusRadiusWu: 30,
  plusHoldS: 4,               // dwell to add the plus yourself
  racerSpeedWu: 55,
  tagOffsetWu: 10,
  memoryCap: 4,
});

export const CIRCUIT_SALT = 'plantsPl175Circuit';

export function circuitFor(sectorId, t = FIRST_RACE_TUNING) {
  const h = hash32(CIRCUIT_SALT, String(sectorId ?? t.sectorId));
  const cx = -200 + (h % 700);
  const cz = 500 + ((h >>> 9) % 700);
  return [
    { x: cx, z: cz },
    { x: cx + 420, z: cz - 160 },
    { x: cx + 240, z: cz + 320 },
  ];
}

export function createPl175First() {
  return {
    name: 'plantsPl175',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._junoId = null;
      this._wpIndex = 0;
      this._mark = null;          // { beaconId, x, z, armed, armedAt }
      this._tagId = null;
      this._plusHoldS = 0;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('beacon:deployed', (p = {}) => {
        const x = Number(p.pos?.x);
        const z = Number(p.pos?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        this._mark = { beaconId: p.id ?? null, x, z, armed: false, armedAt: null };
      });
      on('sector:exit', () => { this._mark = null; this._plusHoldS = 0; });
      on('save:loaded', () => { this._mark = null; this._junoId = null; this._tagId = null; });
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
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._junoId != null) rm(this._junoId);
        if (this._tagId != null) rm(this._tagId);
      }
      this._junoId = null;
      this._wpIndex = 0;
      this._mark = null;
      this._tagId = null;
      this._plusHoldS = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _entity(state, id) {
      return id != null && state?.entities?.get ? state.entities.get(id) : null;
    },

    _ensureJuno(state, t) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._junoId != null) return;
      const circuit = circuitFor(state.world?.currentSectorId, t);
      const ent = spawn({
        type: 'debris',
        pos: { ...circuit[0] },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 20,
        physicsBody: { mass: 20 },
        hull: 30,
        hullMax: 30,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_juno_racer_light',
          plantsPl175Juno: true,
          scanLabel: 'J.C. — a racer light, running its circuit',
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) this._junoId = ent.id;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== FIRST_RACE_TUNING.sectorId) return;
      const t = FIRST_RACE_TUNING;
      const now = this._now();
      const dtS = Math.max(0, Number(dt) || 0);
      this._ensureJuno(s, t);
      const juno = this._entity(s, this._junoId);
      if (!juno?.pos) return;
      // J.C. runs the circuit, always.
      const circuit = circuitFor(s.world?.currentSectorId, t);
      const wp = circuit[this._wpIndex % circuit.length];
      const dx = wp.x - juno.pos.x;
      const dz = wp.z - juno.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= t.racerSpeedWu * dtS) {
        juno.pos.x = wp.x;
        juno.pos.z = wp.z;
        this._wpIndex = (this._wpIndex + 1) % circuit.length;
      } else if (dist > 0) {
        juno.pos.x += (dx / dist) * t.racerSpeedWu * dtS;
        juno.pos.z += (dz / dist) * t.racerSpeedWu * dtS;
      }
      const player = this._entity(s, s.playerId);
      if (!player?.pos) return;
      const px = Number(player.pos.x), pz = Number(player.pos.z);
      const jx = Number(juno.pos.x), jz = Number(juno.pos.z);
      // The place you both marked: J.C.'s pass arms your beacon.
      if (this._mark && !this._mark.armed) {
        const dj = Math.hypot(jx - this._mark.x, jz - this._mark.z);
        if (dj <= t.noticeRadiusWu) {
          this._mark.armed = true;
          this._mark.armedAt = now;
        }
      }
      // The race to the marked place.
      if (this._mark?.armed && this._tagId == null) {
        const playerDist = Math.hypot(px - this._mark.x, pz - this._mark.z);
        const junoDist = Math.hypot(jx - this._mark.x, jz - this._mark.z);
        if (playerDist <= t.beatRadiusWu) {
          // You beat J.C. to the place you both marked: the wall reads your tag.
          const spawn = this.helpers?.spawnEntity;
          if (typeof spawn === 'function') {
            const tag = spawn({
              type: 'debris',
              pos: { x: this._mark.x + t.tagOffsetWu, z: this._mark.z + t.tagOffsetWu * 0.4 },
              vel: { x: 0, z: 0 },
              radius: 4,
              mass: 30,
              physicsBody: { mass: 30 },
              hull: 40,
              hullMax: 40,
              homeSectorId: t.sectorId,
              data: {
                parentType: 'story_prop',
                storyPropKind: 'plants_first_tag',
                plantsPl175Tag: true,
                scanLabel: 'The wall reads only your tag — with, small, underneath: J.C.',
                swarmFloorPad: { label: 'First \u00b7 J.C. small under' },
                masslineTetherable: true,
              },
            });
            if (tag && tag.id != null) this._tagId = tag.id;
          }
          this._mark = null;
          if (this._tagId != null) {
            this.bus?.emit('comms:popup', {
              id: `plants:pl175:first:${Math.round(now)}`,
              sender: 'The wall',
              category: 'story',
              text: 'Your tag — with, small, underneath: J.C.',
              ttl: 9,
              persist: false,
            });
            this.bus?.emit('audio:cue', { id: 'confirm' });
            this.bus?.emit(PL_175_FIRST_EVENT, { tagId: this._tagId, t: now });
            this.bus?.emit(PL_175_TAGGED_EVENT, { tagId: this._tagId, t: now });
          }
          this._plusHoldS = 0;
          return;
        }
        if (junoDist <= t.beatRadiusWu) {
          // J.C. took the place first. The moment is gone; no tag, no voice.
          this._mark = null;
          this.bus?.emit(PL_175_JUNO_FIRST_EVENT, { t: now });
        }
      }
      // Leave it as is; or add the plus yourself.
      if (this._tagId != null) {
        const tag = this._entity(s, this._tagId);
        if (!tag || tag.alive === false) { this._tagId = null; this._plusHoldS = 0; return; }
        const dtag = Math.hypot(px - Number(tag.pos.x), pz - Number(tag.pos.z));
        if (dtag <= t.plusRadiusWu && !tag.data.plusAdded) {
          this._plusHoldS += dtS;
          if (this._plusHoldS >= t.plusHoldS) {
            tag.data.plusAdded = true;
            tag.data.swarmFloorPad = { label: 'First + \u00b7 J.C. under' };
            this.bus?.emit('comms:popup', {
              id: `plants:pl175:plus:${Math.round(now)}`,
              sender: 'The wall',
              category: 'story',
              text: 'You add the plus yourself.',
              ttl: 6,
              persist: false,
            });
            this.bus?.emit(PL_175_PLUS_EVENT, { tagId: this._tagId, t: now });
          }
        } else if (dtag > t.plusRadiusWu) {
          this._plusHoldS = 0;
        }
      }
    },
  };
}

export const pl175First = createPl175First();
