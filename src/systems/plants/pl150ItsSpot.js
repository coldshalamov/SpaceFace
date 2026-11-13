// PL-150 Its spot — "One turret you place drifts back, overnight, to the first spot you ever
// set it, whatever you tow it to | Give it the spot; or keep moving it — it goes home anyway,
// dragging its base"
//
// INERTIA NOTE (honest seam): claim modules are data on the claim record owned by claims.js —
// there is no turret physics body to drag. This plant therefore owns the turret's BASE: a fixed
// physical marker dropped at the claim's position the moment the first turret-class module is
// built. That spot never moves — a fixed 1e6-mass plinth — and each in-world day boundary the
// plant reports the overnight return. If the plinth is somehow displaced, it snaps home (it is
// ours); "it goes home anyway, dragging its base" reads as: the base was always the turret's.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes the plinth, clears state.
// - Day boundaries come from the fixed sim clock; at most one home beat per in-world day.
// - Turret-class modules are recognized by modId vocabulary (turret/defense/gun/battery).

export const PL_150_HOME_EVENT = 'plants:pl150:home';

export const ITS_SPOT_TUNING = Object.freeze({
  dayLengthS: 240,
  homeBeatOffsetS: 30,        // the "overnight" report lands shortly after the day rolls
  plinthRadius: 8,
  plinthOffsetWu: 22,
  homeBeatCooldownS: 230,     // never more than one report per in-world day
  turretModPattern: 'turret|defense|gun|battery|cannon|missile',
  memoryCap: 4,
});

export function isTurretModule(modId, t = ITS_SPOT_TUNING) {
  if (typeof modId !== 'string') return false;
  return new RegExp(t.turretModPattern, 'i').test(modId);
}

export function plinthSpec(pos, t = ITS_SPOT_TUNING) {
  return {
    type: 'beacon',
    pos: { x: pos.x + t.plinthOffsetWu, z: pos.z + t.plinthOffsetWu * 0.5 },
    vel: { x: 0, z: 0 },
    radius: t.plinthRadius,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_turret_first_spot',
      plantsPl150Spot: true,
      scanLabel: 'Its spot — the first place you ever set the turret',
      swarmFloorPad: { label: 'Its spot' },
      anchored: true,
    },
  };
}

export function createPl150ItsSpot() {
  return {
    name: 'plantsPl150',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._spot = null;        // { x, z }
      this._claim = null;       // cached claim:claimed body pos
      this._plinthId = null;
      this._builtAt = null;
      this._lastHomeBeatDay = -1;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('claim:moduleBuilt', (p = {}) => this._onModuleBuilt(p));
      on('sector:exit', () => { /* the plinth persists in its sector record */ });
      on('save:loaded', () => this._resync());
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
      if (this._plinthId != null) this.helpers?.removeEntity?.(this._plinthId);
      this._plinthId = null;
      this._spot = null;
      this._claim = null;
      this._builtAt = null;
      this._lastHomeBeatDay = -1;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    // Claim bodies live in state.claims.bodies (claims.js owns them; they are NOT entities).
    _yardPosOf(bodyId) {
      const bodies = this.state?.claims?.bodies;
      const body = Array.isArray(bodies) && bodyId != null
        ? bodies.find((b) => b && b.id === bodyId) : null;
      const x = Number(body?.x ?? body?.pos?.x);
      const z = Number(body?.z ?? body?.pos?.z);
      return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._claim = { bodyId: body.id ?? payload.bodyId ?? null, x, z };
    },

    _onModuleBuilt(payload) {
      if (this._spot) return; // the FIRST spot is the only one that counts
      if (!isTurretModule(payload.modId, ITS_SPOT_TUNING)) return;
      const pos = this._yardPosOf(payload.bodyId ?? this._claim?.bodyId)
        || (this._claim && payload.bodyId == null ? { x: this._claim.x, z: this._claim.z } : null);
      if (!pos) return;
      this._spot = { x: pos.x, z: pos.z };
      this._builtAt = this._now();
    },

    _resync() {
      // The spot is a physical fact of the rock; a re-entered sector re-materializes it.
      if (this._plinthId != null) this.helpers?.removeEntity?.(this._plinthId);
      this._plinthId = null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = ITS_SPOT_TUNING;
      if (!this._spot) return;
      // Keep the plinth standing on its spot.
      if (this._plinthId == null && typeof this.helpers?.spawnEntity === 'function') {
        const ent = this.helpers.spawnEntity(plinthSpec(this._spot, t));
        if (ent && ent.id != null) this._plinthId = ent.id;
      }
      if (this._plinthId != null) {
        const ent = s.entities?.get ? s.entities.get(this._plinthId) : null;
        if (!ent || ent.alive === false) { this._plinthId = null; return; }
        if (ent.pos) {
          const drift = Math.hypot(ent.pos.x - this._spot.x - t.plinthOffsetWu, ent.pos.z - this._spot.z - t.plinthOffsetWu * 0.5);
          if (drift > 0.5) {
            // Whatever towed it, it goes home anyway — dragging its base.
            ent.pos.x = this._spot.x + t.plinthOffsetWu;
            ent.pos.z = this._spot.z + t.plinthOffsetWu * 0.5;
          }
        }
      }
      // Overnight report: once per in-world day after the build.
      const day = Math.floor((now - (this._builtAt ?? now)) / t.dayLengthS);
      if (day >= 1 && day !== this._lastHomeBeatDay && now - (this._builtAt ?? now) >= t.homeBeatOffsetS) {
        this._lastHomeBeatDay = day;
        this.bus?.emit('comms:popup', {
          id: `plants:pl150:home:${day}`,
          sender: 'The yard',
          category: 'story',
          text: 'Overnight, the turret went home. The base stays.',
          ttl: 7,
          persist: false,
        });
        this.bus?.emit(PL_150_HOME_EVENT, {
          day,
          spot: { ...this._spot },
          t: now,
        });
      }
    },
  };
}

export const pl150ItsSpot = createPl150ItsSpot();
