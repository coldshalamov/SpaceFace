// PL-253 The wall's first dent — "Win your first raid and one wreck stays half-buried in your
// wall where it hit | Leave it — proof; or feed it to the works"
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned wrecks, clears state.
// - The dent is a REAL persistent, heavy prop spawned at the claim the moment your first raid
//   is repelled: leave it and it persists (proof); feed it to the works — destroy it, any
//   physical means — and one receipt marks the feeding. Once ever (first dent only).
// - `claim:raidRepelled` and `claim:defenseResolved {outcome:'defended'}` are the win seams.

import { hash32 } from '../../core/rng.js';

export const PL_253_DENT_EVENT = 'plants:pl253:dent';
export const PL_253_FED_EVENT = 'plants:pl253:fed';

export const WALL_DENT_TUNING = Object.freeze({
  dentRadius: 9,
  dentMass: 90,               // heavy: half-buried means it does not drift
  dentHull: 120,
  dentOffsetWu: 24,
  memoryCap: 4,
});

export const PL_253_DONE_FLAG = 'plantsPl253DentDone';

export function dentWreckSpec(pos, yardNo, t = WALL_DENT_TUNING) {
  return {
    type: 'debris',
    pos: { x: pos.x + t.dentOffsetWu, z: pos.z - t.dentOffsetWu * 0.4 },
    vel: { x: 0, z: 0 },
    radius: t.dentRadius,
    mass: t.dentMass,
    physicsBody: { mass: t.dentMass },
    hull: t.dentHull,
    hullMax: t.dentHull,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_wall_dent',
      plantsPl253Dent: true,
      scanLabel: `The wall\u2019s first dent — a wreck, half-buried where it hit · yard no. ${yardNo}`,
      swarmFloorPad: { label: 'First dent — proof' },
      masslineTetherable: true,
      anchored: true,
    },
  };
}

export function createPl253WallDent() {
  return {
    name: 'plantsPl253',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._dentId = null;
      this._bodyPos = null;
      this._winsSeen = 0;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('claim:raidRepelled', (p = {}) => this._onWin(p));
      on('claim:defenseResolved', (p = {}) => {
        if (p && p.outcome === 'defended') this._onWin(p);
      });
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => { /* the dent persists; re-materialize on return */ this._dentId = null; });
      on('save:loaded', () => { this._dentId = null; });
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
      if (this._dentId != null) this.helpers?.removeEntity?.(this._dentId);
      this._dentId = null;
      this._bodyPos = null;
      this._winsSeen = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _yardNo() {
      return hash32('plantsPl253YardNo', String(this._bodyPos ? `${this._bodyPos.x | 0}:${this._bodyPos.z | 0}` : 'yard')) % 900 + 100;
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._bodyPos = { x, z };
    },

    _onWin(payload) {
      this._winsSeen += 1;
      if (this._dentId != null) return;               // the first dent is the only dent
      const flags = this._flags();
      if (flags?.[PL_253_DONE_FLAG] === true) return; // once ever, even across sessions
      if (!this._bodyPos) return;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const ent = spawn(dentWreckSpec(this._bodyPos, this._yardNo()));
      if (!ent || ent.id == null) return;
      this._dentId = ent.id;
      if (flags) flags[PL_253_DONE_FLAG] = true;
      this.bus?.emit('comms:popup', {
        id: `plants:pl253:dent:${Math.round(this._now())}`,
        sender: 'The yard',
        category: 'story',
        text: 'One wreck stays half-buried where it hit. Proof.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit(PL_253_DENT_EVENT, { dentId: ent.id, wins: this._winsSeen, t: this._now() });
    },

    _onKilled(payload) {
      if (this._dentId == null || payload.id !== this._dentId) return;
      this._dentId = null;
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl253:fed:${Math.round(now)}`,
        sender: 'The works',
        category: 'story',
        text: 'Fed to the works. The dent goes.',
        ttl: 7,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime' });
      this.bus?.emit(PL_253_FED_EVENT, { dentId: payload.id, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      // Keep the handle honest: if the dent entity is gone without a kill receipt (sector
      // load), forget it. The dent is FIRST-DENT-ONLY, EVER — a fed or lost dent never
      // re-materializes; the done flag was set at the first spawn.
      if (this._dentId != null) {
        const ent = s.entities?.get ? s.entities.get(this._dentId) : null;
        if (!ent || ent.alive === false) this._dentId = null;
      }
    },
  };
}

export const pl253WallDent = createPl253WallDent();
