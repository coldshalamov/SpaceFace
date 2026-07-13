// Terrain anchors (Wave M2 §4.4, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Throws, slingshots and tumble-kills need STUFF near the fight — but the composition rule is
// few-and-large (2-3 big rocks per combat bubble read as a playground; small-and-many read as
// gravel in your shoes). This system listens to the shipped `encounter:telegraph` seam (the only
// encounter event that carries the zone anchor position), and if the bubble is bare it spawns a
// handful of LARGE asteroids there. Asteroids are already immovable anchors in both physics
// backends (invMass 0 / non-dynamic) and already carry the tether-socket combat profile, so the
// massline can latch them the moment they exist. Collision asymmetry (§3.5) means clutter can
// bounce the player but never hurt him.
//
// Anchors are encounter-owned: overlapping encounters may share the same few rocks, and each
// resolution releases its ownership. The final owner schedules the engine's ordinary despawnAt
// sweep after a short aftermath window. No spawnBudget interaction (that ledger counts SHIP slots).
// A long TTL remains only as orphan/fizzle insurance. Deterministic: own seeded stream.
// Flag-gated; not in the sim harness; encounterDirector itself is untouched.
import { massline2Flag } from '../data/featureFlags.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const ANCHOR_MIN = 2;            // spawn up to ANCHOR_MAX when fewer than this exist in the bubble
const ANCHOR_MAX = 3;
const ANCHOR_RADIUS = 600;       // wu — the "combat bubble" scan radius around the telegraph pos
const ANCHOR_SIZE_MIN = 26;     // big-and-few: these dwarf ordinary field rocks (6-14)
const ANCHOR_SIZE_MAX = 40;
const ANCHOR_TTL_S = 900;        // despawn long after the fight; sector regen owns the rest
const ANCHOR_AFTERMATH_S = 45;    // match encounter straggler cleanup; leaves time for salvage
const ANCHOR_TYPE_ID = 'ast_common_rock';

const SOLID_TYPES = new Set(['asteroid', 'station', 'wreck']);

export const terrainAnchors = {
  id: 'terrainAnchors',
  name: 'terrainAnchors',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const seed = (ctx.state.meta && ctx.state.meta.seed) || 1;
    this._rng = ctx.helpers.mulberry32(ctx.helpers.hash32(seed, 'terrainAnchors'));
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('encounter:telegraph', (p) => this._onTelegraph(p || {})));
      this._unsubs.push(this.bus.on('encounter:resolved', (p) => this._onResolved(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update() {},

  _onTelegraph(payload) {
    if (!massline2Flag('terrainAnchors')) return;
    const state = this.state;
    const pos = payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;

    // Count existing large solids in the bubble — stations and big rocks both count as anchors.
    let present = 0;
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e.alive === false || !e.pos || !SOLID_TYPES.has(e.type)) continue;
      if (!(Number.isFinite(e.radius) && e.radius >= ANCHOR_SIZE_MIN * 0.6)) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      if (dx * dx + dz * dz <= ANCHOR_RADIUS * ANCHOR_RADIUS) {
        present++;
        if (payload.encounterId && e.data && e.data.terrainAnchor) {
          const owners = Array.isArray(e.data.terrainAnchorEncounterIds)
            ? e.data.terrainAnchorEncounterIds
            : (e.data.terrainAnchorEncounterIds = []);
          if (!owners.includes(payload.encounterId)) owners.push(payload.encounterId);
        }
      }
      if (present >= ANCHOR_MIN) return;   // the bubble already has terrain — never add gravel
    }

    const want = Math.min(ANCHOR_MAX, ANCHOR_MIN + 1) - present;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    for (let i = 0; i < want; i++) {
      const size = ANCHOR_SIZE_MIN + this._rng() * (ANCHOR_SIZE_MAX - ANCHOR_SIZE_MIN);
      const ang = this._rng() * Math.PI * 2;
      const dist = 140 + this._rng() * (ANCHOR_RADIUS * 0.55);
      const oreHP = Math.round(360 + size * 14);
      this.helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: pos.x + Math.cos(ang) * dist, z: pos.z + Math.sin(ang) * dist },
        vel: { x: 0, z: 0 },
        radius: size,
        // 2D-area-ish density scaling: these read (and sling, §4.1 anchor-mass bonus) as monoliths.
        mass: Math.round(size * size * 40),
        angVel: (this._rng() - 0.5) * 0.12,
        hull: oreHP, hullMax: oreHP,
        collides: true,
        data: {
          typeId: ANCHOR_TYPE_ID,
          tier: 0, tierCap: 0,
          oreHP, oreHPMax: oreHP,
          yieldU: Math.round(6 + size * 0.4),
          size,
          terrainAnchor: true,
          terrainAnchorEncounterIds: payload.encounterId ? [payload.encounterId] : [],
          despawnAt: now + ANCHOR_TTL_S,
        },
      });
    }
  },

  _onResolved(payload) {
    const encounterId = payload && payload.encounterId;
    if (!encounterId) return;
    const now = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    for (const entity of this.state && this.state.entityList || []) {
      const data = entity && entity.data;
      if (!data || !data.terrainAnchor || !Array.isArray(data.terrainAnchorEncounterIds)) continue;
      const index = data.terrainAnchorEncounterIds.indexOf(encounterId);
      if (index < 0) continue;
      data.terrainAnchorEncounterIds.splice(index, 1);
      if (!data.terrainAnchorEncounterIds.length) {
        data.despawnAt = Math.min(Number.isFinite(data.despawnAt) ? data.despawnAt : Infinity,
          now + ANCHOR_AFTERMATH_S);
      }
    }
  },
};
