// PL-196 Ahead of you — "Come back to the mirror rock wearing your marks, and the reflection
// wears them too — and one more you have not earned yet | Catch it up; or stop looking"
//
// SEAM NOTE (honest substitute): the mirror rock is staged as a crystal-substance asteroid
// prop (type 'debris', data.substance:'crystal') in sector_triton_wake — the nearest honest
// physical stand-in for a mirror in a 2.5D top-down world. "Your marks" are the marks this
// session actually made: claims taken (claim:claimed), beacons dropped (beacon:deployed), and
// the PL-175 first-tag (plants:pl175:tagged). Approach the rock and the beat reads: the
// reflection wears all of them — and one more. Catch up (earn that one more and come back) and
// the reflection owes you nothing; then it is one ahead again. Stop looking: no penalty.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes the rock, clears state.
// - One beat per approach: exit the mirror range to earn another look (hysteresis-gated).

import { hash32 } from '../../core/rng.js';

export const PL_196_MIRROR_EVENT = 'plants:pl196:mirror';
export const PL_196_CAUGHT_EVENT = 'plants:pl196:caught';

export const MIRROR_ROCK_TUNING = Object.freeze({
  sectorId: 'sector_triton_wake',
  mirrorRadiusWu: 130,        // the approach range
  exitHysteresisWu: 40,       // leave this much farther before the next look counts
  catchCooldownS: 30,
  memoryCap: 4,
});

export const MIRROR_SALT = 'plantsPl196Mirror';

export function mirrorRockPosition(sectorId, t = MIRROR_ROCK_TUNING) {
  const h = hash32(MIRROR_SALT, String(sectorId ?? t.sectorId));
  return { x: -800 + (h % 1600), z: -800 + ((h >>> 10) % 1600) };
}

export function mirrorRockSpec(sectorId, t = MIRROR_ROCK_TUNING) {
  return {
    type: 'debris',
    pos: mirrorRockPosition(sectorId, t),
    vel: { x: 0, z: 0 },
    radius: 26,
    mass: 1e6,                  // it does not move for anyone
    hull: 500,
    hullMax: 500,
    physicsBody: { mass: 1e6 },
    homeSectorId: t.sectorId,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_mirror_rock',
      plantsPl196Mirror: true,
      substance: 'crystal',     // the honest substitute: a crystal face, not a mirror entity
      scanLabel: 'The mirror rock — crystal, still, wearing somebody\u2019s marks',
      swarmFloorPad: { label: 'The mirror rock' },
    },
  };
}

export function createPl196MirrorRock() {
  return {
    name: 'plantsPl196',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._rockId = null;
      this._placedFor = null;
      this._marks = 0;
      this._lastSeenReflected = null;
      this._wasInRange = false;
      this._lastBeatAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', () => { this._marks += 1; });
      on('beacon:deployed', () => { this._marks += 1; });
      on('plants:pl175:tagged', () => { this._marks += 1; });
      on('sector:exit', () => { this._wasInRange = false; });
      on('save:loaded', () => { this._wasInRange = false; this._rockId = null; this._placedFor = null; });
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
      if (this._rockId != null) this.helpers?.removeEntity?.(this._rockId);
      this._rockId = null;
      this._placedFor = null;
      this._marks = 0;
      this._lastSeenReflected = null;
      this._wasInRange = false;
      this._lastBeatAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== MIRROR_ROCK_TUNING.sectorId) return;
      const t = MIRROR_ROCK_TUNING;
      const sectorId = s.world.currentSectorId;
      if (this._rockId == null || this._placedFor !== sectorId) {
        if (this._rockId != null) this.helpers?.removeEntity?.(this._rockId);
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn !== 'function') return;
        const ent = spawn(mirrorRockSpec(sectorId, t));
        if (ent && ent.id != null) {
          this._rockId = ent.id;
          this._placedFor = sectorId;
        }
        return;
      }
      const rock = s.entities?.get ? s.entities.get(this._rockId) : null;
      if (!rock?.pos || rock.alive === false) { this._rockId = null; return; }
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const d = Math.hypot(Number(player.pos.x) - Number(rock.pos.x), Number(player.pos.z) - Number(rock.pos.z));
      const inRange = d <= t.mirrorRadiusWu;
      const now = this._now();
      // Approach = a look. Exit range to earn the next one.
      if (inRange && !this._wasInRange && now - this._lastBeatAt >= t.catchCooldownS) {
        this._lastBeatAt = now;
        const reflected = this._marks + 1; // one more you have not earned yet
        const caught = this._lastSeenReflected != null && this._marks >= this._lastSeenReflected;
        if (caught) {
          this.bus?.emit('comms:popup', {
            id: `plants:pl196:caught:${Math.round(now)}`,
            sender: 'The mirror rock',
            category: 'story',
            text: 'Caught up. The reflection owes you nothing now.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit(PL_196_CAUGHT_EVENT, { marks: this._marks, t: now });
        } else {
          this.bus?.emit('comms:popup', {
            id: `plants:pl196:mirror:${Math.round(now)}`,
            sender: 'The mirror rock',
            category: 'story',
            text: 'The reflection wears your marks, and one more.',
            ttl: 9,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: Number(rock.pos.x), z: Number(rock.pos.z) }, gain: 0.4 });
          this.bus?.emit(PL_196_MIRROR_EVENT, { marks: this._marks, reflected, t: now });
        }
        this._lastSeenReflected = reflected;
      }
      if (!inRange && d > t.mirrorRadiusWu + t.exitHysteresisWu) this._wasInRange = false;
      else if (inRange) this._wasInRange = true;
    },
  };
}

export const pl196MirrorRock = createPl196MirrorRock();
