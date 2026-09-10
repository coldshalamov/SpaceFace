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
import { Masks } from '../core/entity.js';
import {
  PALLAS_REEF_MINES,
  PALLAS_REEF_MINE_BODY,
  pallasReefMineId,
  pallasReefMinePos,
} from '../data/environmentalMachinery.js';

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
      this._unsubs.push(this.bus.on('environmentalMachinery:ensureAnvil',
        (p) => this._ensureKillMachineAnvil(p || {})));
      this._unsubs.push(this.bus.on('environmentalMachinery:ensureReef',
        (p) => this._ensurePallasReef(p || {})));
      this._unsubs.push(this.bus.on('environmentalMachinery:ensureAperturePlug',
        (p) => this._ensureAperturePlug(p || {})));
      this._unsubs.push(this.bus.on('environmentalMachinery:releaseAperturePlug',
        (p) => this._releaseAperturePlug(p || {})));
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
    const arcade = payload.arcadeLayout === true && state.run?.ruleset === 'swarm';
    const required = arcade ? 6 : ANCHOR_MIN;
    const bubbleRadius = arcade ? 390 : ANCHOR_RADIUS;

    // Count existing large solids in the bubble — stations and big rocks both count as anchors.
    let present = 0;
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e.alive === false || !e.pos || !SOLID_TYPES.has(e.type)) continue;
      if (!(Number.isFinite(e.radius) && e.radius >= ANCHOR_SIZE_MIN * 0.6)) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      if (dx * dx + dz * dz <= bubbleRadius * bubbleRadius) {
        present++;
        if (payload.encounterId && e.data && e.data.terrainAnchor) {
          const owners = Array.isArray(e.data.terrainAnchorEncounterIds)
            ? e.data.terrainAnchorEncounterIds
            : (e.data.terrainAnchorEncounterIds = []);
          if (!owners.includes(payload.encounterId)) owners.push(payload.encounterId);
        }
      }
      if (present >= required) return;
    }

    const want = (arcade ? required : Math.min(ANCHOR_MAX, ANCHOR_MIN + 1)) - present;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    // Two staggered lanes leave a broad central escape and narrower bank-shot gaps. The
    // whole layout rotates with the run seed; it stays readable from the opening camera.
    const layout = [[-116, -160], [116, -115], [-142, 80], [148, 140], [-35, 292], [48, -302]];
    const rotation = ((Number(payload.arenaSeed) >>> 0) % 360) * Math.PI / 180;
    for (let i = 0; i < want; i++) {
      const size = arcade ? 32 + ((i + present) % 3) * 7
        : ANCHOR_SIZE_MIN + this._rng() * (ANCHOR_SIZE_MAX - ANCHOR_SIZE_MIN);
      const ang = this._rng() * Math.PI * 2;
      const dist = 140 + this._rng() * (ANCHOR_RADIUS * 0.55);
      const point = layout[(i + present) % layout.length];
      const dx = arcade ? point[0] * Math.cos(rotation) - point[1] * Math.sin(rotation) : Math.cos(ang) * dist;
      const dz = arcade ? point[0] * Math.sin(rotation) + point[1] * Math.cos(rotation) : Math.sin(ang) * dist;
      const oreHP = Math.round(360 + size * 14);
      this.helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: pos.x + dx, z: pos.z + dz },
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

  _ensureKillMachineAnvil(spec) {
    const id = spec && spec.id;
    const pos = spec && spec.pos;
    if (!id || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const list = this.state && this.state.entityList || [];
    for (const entity of list) {
      if (entity && entity.alive !== false && entity.data && entity.data.killMachineAnvilId === id) {
        return entity;
      }
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const radius = Number.isFinite(spec.radius) && spec.radius > 0 ? spec.radius : 22;
    const mass = Number.isFinite(spec.mass) && spec.mass > 0 ? spec.mass : Math.round(radius * radius * 40);
    const oreHP = Math.round(360 + radius * 14);
    return this.helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius,
      mass,
      angVel: 0,
      hull: oreHP,
      hullMax: oreHP,
      collides: true,
      physicsBody: {
        schemaVersion: 1,
        radius,
        mass,
        inertiaY: Math.max(120, Math.round(mass * 0.08)),
        dynamic: false,
        ccd: false,
        material: 'asteroid',
        revision: 0,
      },
      data: {
        typeId: ANCHOR_TYPE_ID,
        tier: 0,
        tierCap: 0,
        oreHP,
        oreHPMax: oreHP,
        yieldU: Math.round(6 + radius * 0.4),
        size: radius,
        terrainAnchor: true,
        killMachineAnvilId: id,
        killMachineId: spec.machineId || null,
      },
    });
  },

  _ensurePallasReef(_spec) {
    const list = this.state && this.state.entityList || [];
    const existing = new Set();
    for (const entity of list) {
      if (entity && entity.alive !== false && entity.data && entity.data.reefMine === true) {
        existing.add(entity.data.reefMineSlot);
      }
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const radius = PALLAS_REEF_MINE_BODY.radius;
    const mass = PALLAS_REEF_MINE_BODY.mass;
    const hull = Math.round(80 + radius * 4);
    let spawned = 0;
    for (let i = 0; i < PALLAS_REEF_MINES.length; i++) {
      if (existing.has(i)) continue;
      const pos = pallasReefMinePos(PALLAS_REEF_MINES[i]);
      this.helpers.spawnEntity({
        type: 'wreck',
        pos: { x: pos.x, z: pos.z },
        vel: { x: 0, z: 0 },
        radius,
        mass,
        angVel: 0,
        hull,
        hullMax: hull,
        collides: true,
        collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.WRECK | Masks.DRONE | Masks.PAYLOAD,
        physicsBody: {
          schemaVersion: 1,
          radius,
          mass,
          inertiaY: Math.max(8, Math.round(mass * radius * radius * 0.4)),
          dynamic: true,
          ccd: false,
          material: 'debris',
          revision: 0,
        },
        data: {
          majorDebris: true,
          reefMine: true,
          reefMineSlot: i,
          reefMineId: pallasReefMineId(i),
        },
      });
      spawned += 1;
    }
    return spawned;
  },

  _ensureAperturePlug(spec) {
    const id = spec && spec.id;
    const pos = spec && spec.pos;
    if (!id || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const list = this.state && this.state.entityList || [];
    for (const entity of list) {
      if (entity && entity.alive !== false && entity.data && entity.data.aperturePlugId === id) {
        return entity;
      }
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const radius = Number.isFinite(spec.radius) && spec.radius > 0 ? spec.radius : 30;
    const mass = Number.isFinite(spec.mass) && spec.mass > 0 ? spec.mass : Math.round(radius * radius * 40);
    const oreHP = Math.round(360 + radius * 14);
    return this.helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius,
      mass,
      angVel: 0,
      hull: oreHP,
      hullMax: oreHP,
      collides: true,
      physicsBody: {
        schemaVersion: 1,
        radius,
        mass,
        inertiaY: Math.max(120, Math.round(mass * 0.08)),
        dynamic: false,
        ccd: false,
        material: 'asteroid',
        revision: 0,
      },
      data: {
        typeId: ANCHOR_TYPE_ID,
        tier: 0,
        tierCap: 0,
        oreHP,
        oreHPMax: oreHP,
        yieldU: Math.round(6 + radius * 0.4),
        size: radius,
        terrainAnchor: true,
        aperturePlugId: id,
      },
    });
  },

  _releaseAperturePlug(spec) {
    const id = spec && spec.id;
    if (!id) return false;
    const list = this.state && this.state.entityList || [];
    let released = false;
    for (const entity of list) {
      if (!entity || !entity.data || entity.data.aperturePlugId !== id) continue;
      entity.alive = false;
      entity.collides = false;
      released = true;
    }
    return released;
  },
};
