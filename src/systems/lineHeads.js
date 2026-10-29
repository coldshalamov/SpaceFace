// w-501 — §7.1 Line-head behaviors that live with the Line itself.
//
//   * BREAKER HEAD (Drift, Worked) — a slammed rock splits into throwable chunks.
//     Admission is the masslineImpacts whip receipt (tether:whipImpact), not a
//     second contact scan: the same body the harness already reports as slung
//     lands the hit, and 'solid'/'crushing' are its authored break-energy bands.
//   The chunk spec mirrors the shared debris law (hullFracture's tearOffSpec:
//   bounded wreck bodies, debris material, 60 s ttl) rather than inventing a
//   second corpse kind — a Breaker chunk is a throwable before it is a wreck.
//
// Holder seam: entity.data.lineHeadId — ships.js stamps it from the fitted
// mod_line_head_* module (the player's equip may clear it); authored NPC
// carriers keep their spawn stamps. chunkCount comes from the derived
// lineHead behavior payload (3 at Worked, 4 at Storied+).
//
// Registration: event-only owner — subscribes at init, no update slot, no clock
// (same posture as customsPrompt).

import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { PHYSICAL_BREAKUP_LAW } from './hullFracture.js';

const BREAKER_HEAD_ID = 'head_breaker';
// A glance is not a slam: the whip receipt's own authored bands gate the split.
const SLAM_RATINGS = new Set(['solid', 'crushing']);
// Bodies the split may consume. Ships follow hullFracture's own law; projectiles,
// shards, machines and vfx are never ammunition-grade rock.
const UNSPLITTABLE_TYPES = new Set(['ship', 'projectile', 'shard', 'machine', 'vfx', 'station']);
const CHUNK_TTL_S = PHYSICAL_BREAKUP_LAW.tearOffLifetimeS;
const CHUNK_FLING_MIN = 10;
const CHUNK_FLING_MAX = 46;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function chunkPhysicsBody(mass, radius) {
  return {
    schemaVersion: 1,
    shape: 'capsule',
    radius,
    mass,
    inertiaY: 0.5 * mass * radius * radius,
    dynamic: true,
    ccd: false,
    material: 'debris',
    revision: 0,
  };
}

function splittableHeldBody(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  if (UNSPLITTABLE_TYPES.has(entity.type)) return false;
  const data = entity.data;
  if (data && (data.breakerConsumed === true || data.collisionTearOff === true
    || data.breakerChunk === true)) return false;
  return true;
}

export const lineHeads = {
  name: 'lineHeads',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:whipImpact', (payload) => this._onWhipImpact(payload || {})));
    }
  },

  _breakerHolder(state) {
    // masslineImpacts only ever reports the player's own whip — latched or
    // slung — so the head stamp is the whole holder contract. A thrown rock
    // that slams within the sling window is the same Breaker swing; gating on
    // an active tether would un-equip the head the moment the Line lets go.
    // The stamp lives on the player ENTITY (state.playerId → entities), the
    // same seam faction carriers weld through — state.player is the record.
    const holder = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!holder || holder.alive === false) return null;
    if (!holder.data || holder.data.lineHeadId !== BREAKER_HEAD_ID) return null;
    return holder;
  },

  _onWhipImpact(payload) {
    const state = this.state;
    if (!state || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    if (!SLAM_RATINGS.has(payload && payload.rating)) return;
    const holder = this._breakerHolder(state);
    if (!holder) return;
    const mass = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(payload.targetId) : null;
    if (!splittableHeldBody(mass)) return;

    const head = holder.data && holder.data.derived && holder.data.derived.lineHead;
    const chunkCount = Math.max(2, Math.min(6, Math.trunc(finite(head && head.chunkCount, 3))));
    const rng = typeof state.rng === 'function' ? state.rng : null;
    if (!rng) return;

    const victimMass = Math.max(0.1, finite(mass.mass, 1));
    const victimRadius = Math.max(1, finite(mass.radius, 7));
    const n = payload.normal && Number.isFinite(payload.normal.x)
      ? { x: payload.normal.x, z: payload.normal.z }
      : { x: 0, z: -1 };
    const tx = -n.z, tz = n.x;
    const fling = Math.min(CHUNK_FLING_MAX,
      Math.max(CHUNK_FLING_MIN, CHUNK_FLING_MIN + finite(payload.relSpeed, 0) * 0.18));
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const tick = Number.isFinite(payload.tick) ? Math.max(0, Math.trunc(payload.tick)) : null;

    const spawned = [];
    for (let i = 0; i < chunkCount; i++) {
      const ang = (i / chunkCount) * Math.PI * 2 + (rng() - 0.5) * 0.9;
      const side = i % 2 === 0 ? 1 : -1;
      const dir = {
        x: n.x * side * Math.abs(Math.cos(ang)) + tx * Math.sin(ang),
        z: n.z * side * Math.abs(Math.cos(ang)) + tz * Math.sin(ang),
      };
      const dLen = Math.hypot(dir.x, dir.z) || 1;
      dir.x /= dLen; dir.z /= dLen;
      const chunkMass = Math.max(0.4, victimMass / chunkCount * (0.6 + rng() * 0.8));
      const chunkRadius = Math.min(victimRadius * 0.7,
        Math.max(1.6, victimRadius * Math.cbrt(chunkMass / victimMass)));
      const entity = this.helpers.spawnEntity({
        type: 'wreck',
        pos: { x: mass.pos.x + dir.x * (victimRadius + chunkRadius + 0.25),
               z: mass.pos.z + dir.z * (victimRadius + chunkRadius + 0.25) },
        vel: { x: (mass.vel ? finite(mass.vel.x) : 0) + dir.x * fling * (0.75 + rng() * 0.5),
               z: (mass.vel ? finite(mass.vel.z) : 0) + dir.z * fling * (0.75 + rng() * 0.5) },
        angVel: finite(mass.angVel) + (rng() - 0.5) * 2,
        radius: chunkRadius,
        mass: chunkMass,
        hull: 1,
        hullMax: 1,
        ttl: CHUNK_TTL_S,
        collides: true,
        physicsBody: chunkPhysicsBody(chunkMass, chunkRadius),
        data: {
          parentType: mass.type,
          kind: 'wreck',
          label: 'Breaker Chunk',
          scanLabel: 'Breaker Chunk',
          name: 'Breaker Chunk',
          breakerChunk: true,
          physicalBreakup: true,
          collisionTearOff: true,
          breakerChunkOf: mass.id,
          homeSectorId: sectorId,
          persistenceOwner: 'lineHeads',
          proportions: WRECK_COLLIDER_PROPORTIONS,
          wreckClass: 'battlefield',
          loot: [],
          salvagePool: { cmdty_scrap_metal: 1 },
          salvageTimeLeft: 6,
        },
      });
      if (entity) spawned.push(entity);
    }
    if (!spawned.length) return;

    // The slammed body is spent — the chunks carry its mass forward. One split
    // per body, and the dead target lets the tether cut itself on its own law.
    const md = mass.data || (mass.data = {});
    md.breakerConsumed = true;
    mass.alive = false;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('lineHead:breakerSplit', {
        tick,
        holderId: holder.id,
        victimId: payload.victimId,
        parentId: mass.id,
        pieceIds: spawned.map((piece) => piece.id),
        pieceCount: spawned.length,
        pos: { x: mass.pos.x, z: mass.pos.z },
        rating: payload.rating,
      });
      this.bus.emit('audio:cue', {
        id: 'sfx_hull_scrape',
        position: { x: mass.pos.x, z: mass.pos.z },
        gain: 0.55,
      });
    }
  },
};
