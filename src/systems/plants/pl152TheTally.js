// PL-152 The tally — "Lose a raid and they take a module — and leave one of their own behind,
// wrecked on your rock. Inside, a chalked list of yards, and yours is on it | Keep the wreck as
// proof; or feed it to the works, and the list burns with it"
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned wrecks, clears state.
// - The wreck is a REAL persistent, tetherable prop: keeping it keeps an object.
// - Feeding it to the works is physical: destroy it and the chalk list burns with it (one
//   receipt, one burn). A new lost raid can leave a new tally.
// - One wreck per lost raid; cooldown keeps a raid storm from raining wrecks.

export const PL_152_TALLY_EVENT = 'plants:pl152:tally';
export const PL_152_BURNED_EVENT = 'plants:pl152:burned';

export const THE_TALLY_TUNING = Object.freeze({
  wreckRadius: 10,
  wreckMass: 60,
  wreckHull: 60,
  wreckOffsetWu: 30,
  raidCooldownS: 30,          // a raid storm does not rain tallies
  memoryCap: 4,               // bounded live wrecks
});

export function tallyWreckSpec(pos, t = THE_TALLY_TUNING) {
  return {
    type: 'debris',
    pos: { x: pos.x + t.wreckOffsetWu, z: pos.z + t.wreckOffsetWu * 0.3 },
    vel: { x: 0, z: 0 },
    radius: t.wreckRadius,
    mass: t.wreckMass,
    physicsBody: { mass: t.wreckMass },
    hull: t.wreckHull,
    hullMax: t.wreckHull,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_the_tally_wreck',
      plantsPl152Wreck: true,
      scanLabel: 'Their wreck — inside, a chalked list of yards, and yours is on it',
      swarmFloorPad: { label: 'Chalk list: your yard' },
      masslineTetherable: true,
    },
  };
}

export function createPl152TheTally() {
  return {
    name: 'plantsPl152',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.helpers = ctx.helpers || {};
      this.bus = ctx.bus;
      this._unsubs = [];
      this._wreckIds = new Set();
      this._bodyPos = new Map();     // bodyId -> {x,z}, bounded
      this._lastTallyAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('claim:raided', (p = {}) => this._onLostRaid(p));
      on('claim:defenseResolved', (p = {}) => {
        if (p && p.outcome !== 'defended') this._onLostRaid(p);
      });
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => { this._bodyPos?.clear(); });
      on('save:loaded', () => this._wreckIds?.clear());
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
      if (typeof rm === 'function') for (const id of this._wreckIds || []) rm(id);
      this._wreckIds?.clear();
      this._bodyPos?.clear();
      this._lastTallyAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (this._bodyPos.size >= THE_TALLY_TUNING.memoryCap) this._bodyPos.clear();
      this._bodyPos.set(payload.body?.id ?? payload.bodyId ?? 'yard', { x, z });
    },

    _onLostRaid(payload) {
      const now = this._now();
      if (now - this._lastTallyAt < THE_TALLY_TUNING.raidCooldownS) return;
      this._lastTallyAt = now;
      const pos = this._bodyPos.get(payload.bodyId) || this._bodyPos.get('yard');
      if (!pos) return;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      if (this._wreckIds.size >= THE_TALLY_TUNING.memoryCap) {
        const oldest = this._wreckIds.values().next().value;
        this._wreckIds.delete(oldest);
        this.helpers?.removeEntity?.(oldest);
      }
      const ent = spawn(tallyWreckSpec(pos));
      if (!ent || ent.id == null) return;
      this._wreckIds.add(ent.id);
      this.bus?.emit('comms:popup', {
        id: `plants:pl152:tally:${Math.round(now)}`,
        sender: 'The yard',
        category: 'story',
        text: 'Their wreck stays. The chalk list: your yard.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit(PL_152_TALLY_EVENT, { wreckId: ent.id, bodyId: payload.bodyId ?? null, t: now });
    },

    _onKilled(payload) {
      if (!this._wreckIds.has(payload.id)) return;
      this._wreckIds.delete(payload.id);
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl152:burned:${Math.round(now)}`,
        sender: 'The works',
        category: 'story',
        text: 'Fed to the works. The list burns.',
        ttl: 7,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime' });
      this.bus?.emit(PL_152_BURNED_EVENT, { wreckId: payload.id, t: now });
    },
  };
}

export const pl152TheTally = createPl152TheTally();
