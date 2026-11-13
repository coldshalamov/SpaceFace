// PL-149 Which way it leans — "The seedling on your rock leans a little more each day, always
// the same way: out, toward the dark | Follow the lean, one day; or ignore it — it grows anyway"
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The dark has a fixed bearing: radially OUTWARD from the system center (origin), computed
//   from the seedling's own position — same rock, same bearing, every day.
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes the seedling, clears state.
// - The seedling is a tiny physical prop (debris, everyday crystal profile, radius ~3),
//   tetherable/bumpable, spawned on the player's claim. update() drifts its authored rot a
//   little more toward the bearing each day and grows visualRadius toward a cap.
// - Following the lean once pays one quiet beat; ignoring it costs nothing — it grows anyway.

export const PL_149_FOLLOW_EVENT = 'plants:pl149:followed';

export const SEEDLING_LEAN_TUNING = Object.freeze({
  dayLengthS: 240,
  nightFraction: 0.25,        // the lean visibly moves during the night band
  leanRateRadPerDay: 0.35,    // a little more each day, always the same way
  baseRadius: 3,
  growthWuPerDay: 0.8,        // it grows anyway
  growthCapWu: 6,             // ...but not forever
  followDistWu: 260,          // out past the yard, along the bearing
  followHoldS: 6,             // hold that line for a while
  seedlingOffsetWu: 14,
  followCooldownS: 600,       // one follow beat per long stretch
  memoryCap: 4,
});

export function darkBearingOf(pos) {
  // Out, toward the dark: the fixed radial bearing away from the system center.
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return 0;
  if (pos.x === 0 && pos.z === 0) return 0;
  return Math.atan2(pos.z, pos.x);
}

export function seedlingSpec(pos, t = SEEDLING_LEAN_TUNING) {
  const bx = pos.x + Math.cos(darkBearingOf(pos)) * t.seedlingOffsetWu;
  const bz = pos.z + Math.sin(darkBearingOf(pos)) * t.seedlingOffsetWu;
  return {
    type: 'debris',
    pos: { x: bx, z: bz },
    vel: { x: 0, z: 0 },
    radius: t.baseRadius,
    mass: 4,
    physicsBody: { mass: 4 },
    hull: 20,
    hullMax: 20,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_seedling',
      plantsPl149Seedling: true,
      scanLabel: 'A seedling — it leans, a little more each day, out toward the dark',
      masslineTetherable: true,
      scannerSignalKind: 'anomaly', // the everyday crystal-profile scan class (bellhop family)
    },
  };
}

export function createPl149SeedlingLean() {
  return {
    name: 'plantsPl149',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._seedlingId = null;
      this._claim = null;
      this._followHoldS = 0;
      this._lastFollowAt = -Infinity;
      this._followedThisSeedling = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('sector:exit', () => { this._followHoldS = 0; });
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
      if (this._seedlingId != null) this.helpers?.removeEntity?.(this._seedlingId);
      this._seedlingId = null;
      this._claim = null;
      this._followHoldS = 0;
      this._lastFollowAt = -Infinity;
      this._followedThisSeedling = false;
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
      this._claim = { bodyId: body.id ?? null, x, z, at: this._now() };
    },

    _resync() {
      // The seedling is a fresh sprout each visit; the claim is the only durable fact.
      if (this._seedlingId != null) this.helpers?.removeEntity?.(this._seedlingId);
      this._seedlingId = null;
      this._followHoldS = 0;
      this._followedThisSeedling = false;
    },

    _player(state) {
      return state?.entities?.get ? state.entities.get(state.playerId) : null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = SEEDLING_LEAN_TUNING;
      // Keep one seedling alive on the claim.
      if (this._claim && this._seedlingId == null && typeof this.helpers?.spawnEntity === 'function') {
        const ent = this.helpers.spawnEntity(seedlingSpec(this._claim, t));
        if (ent && ent.id != null) this._seedlingId = ent.id;
      }
      if (this._seedlingId == null) return;
      const ent = s.entities?.get ? s.entities.get(this._seedlingId) : null;
      if (!ent || ent.alive === false) { this._seedlingId = null; return; }
      ent.data = ent.data || {};
      // The lean: rot drifts toward the fixed dark bearing, a little more each day.
      const bearing = darkBearingOf(ent.pos || this._claim);
      const daysLived = Math.max(0, now - (this._claim?.at ?? now)) / t.dayLengthS;
      const targetLean = bearing + Math.min(daysLived * t.leanRateRadPerDay, Math.PI / 3);
      const step = t.leanRateRadPerDay * (Math.max(0, Number(dt) || 0) / t.dayLengthS);
      if (!Number.isFinite(ent.rot)) ent.rot = bearing;
      ent.rot += Math.max(-step, Math.min(step, targetLean - ent.rot));
      // It grows anyway: slow, bounded.
      ent.data.visualRadius = Math.min(t.growthCapWu, t.baseRadius + daysLived * t.growthWuPerDay);
      // Following the lean: player out along the bearing, past the yard, holding the line.
      const player = this._player(s);
      if (!player?.pos) { this._followHoldS = 0; return; }
      const dx = player.pos.x - (ent.pos?.x ?? 0);
      const dz = player.pos.z - (ent.pos?.z ?? 0);
      const dist = Math.hypot(dx, dz);
      const along = (dx * Math.cos(bearing) + dz * Math.sin(bearing)) / (dist || 1);
      const holding = dist >= t.followDistWu && along > 0.85;
      this._followHoldS = holding ? this._followHoldS + Math.max(0, Number(dt) || 0) : 0;
      if (this._followHoldS >= t.followHoldS && now - this._lastFollowAt >= t.followCooldownS
          && !this._followedThisSeedling) {
        this._followedThisSeedling = true;
        this._lastFollowAt = now;
        this.bus?.emit('comms:popup', {
          id: `plants:pl149:followed:${Math.round(now)}`,
          sender: 'The seedling',
          category: 'story',
          text: 'The lean led true. Nothing waits.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_149_FOLLOW_EVENT, { seedlingId: this._seedlingId, bearing, t: now });
      }
      // Ignoring it costs nothing; the lean keeps its slow work either way.
    },
  };
}

export const pl149SeedlingLean = createPl149SeedlingLean();
