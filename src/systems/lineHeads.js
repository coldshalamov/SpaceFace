// w-501 — §7.1 Line-head behaviors that live with the Line itself.
//
//   * BREAKER HEAD (Drift, Worked) — a slammed rock splits into throwable chunks.
//     Admission is the masslineImpacts whip receipt (tether:whipImpact), not a
//     second contact scan: the same body the harness already reports as slung
//     lands the hit, and 'solid'/'crushing' are its authored break-energy bands.
//   * COUPLER (Meridian, Worked) — loose bodies near the held mass chain into a
//     train that follows the line.
//   * BARB (Reach, Worked) — a latched light hull is dragged behind the holder;
//     Storied+ panics its wing.
//   * HUSH (Quiet, Named) — the held mass is hidden from scales: the same
//     data.signatureHidden stamp the Weighing already reads as hush_head.
//   * EVIDENCE CLAMP (Concord, Storied) — the held body staples to whatever it
//     touches (the pair rides together, the bond outliving the Line).
//   * SEAL (Helix, Relic) — a stapled hostile takes a Directorate fine: lawful
//     ships pick it up as their security target.
//   * SYMPATHY (Verge, Relic) — linked bodies share momentum.
//   The chunk spec mirrors the shared debris law (hullFracture's tearOffSpec:
//   bounded wreck bodies, debris material, 60 s ttl) rather than inventing a
//   second corpse kind — a Breaker chunk is a throwable before it is a wreck.
//
// Holder seam: entity.data.lineHeadId — ships.js stamps it from the fitted
// mod_line_head_* module (the player's equip may clear it); authored NPC
// carriers keep their spawn stamps. chunkCount comes from the derived
// lineHead behavior payload (3 at Worked, 4 at Storied+).
//
// Registration: the whip-stamp heads are event-driven (tether:whipImpact);
// the per-step body work (train, drag, veil, staple, momentum) ticks beside
// the massline owners on the table clock.

import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { PHYSICAL_BREAKUP_LAW } from './hullFracture.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';

const BREAKER_HEAD_ID = 'head_breaker';
const COUPLER_HEAD_ID = 'head_coupler';
const BARB_HEAD_ID = 'head_barb';
const HUSH_HEAD_ID = 'head_hush';
const EVIDENCE_CLAMP_HEAD_ID = 'head_evidence_clamp';
const SEAL_HEAD_ID = 'head_seal';
const SYMPATHY_HEAD_ID = 'head_sympathy';
// A glance is not a slam: the whip receipt's own authored bands gate the split.
const SLAM_RATINGS = new Set(['solid', 'crushing']);
// Bodies the split may consume. Ships follow hullFracture's own law; projectiles,
// shards, machines and vfx are never ammunition-grade rock.
const UNSPLITTABLE_TYPES = new Set(['ship', 'projectile', 'shard', 'machine', 'vfx', 'station']);

// COUPLER (Meridian Worked) — loose bodies near the held mass chain into a train.
const TRAINABLE_TYPES = new Set(['asteroid', 'wreck', 'payload', 'drone']);
const TRAIN_CAPTURE_WU = 90;
const TRAIN_DROP_WU = 220;
const TRAIN_MAX_CARS = 4;
const TRAIN_GAP_WU = 26;
const TRAIN_FOLLOW_K = 0.06;

// BARB (Reach Worked) — a latched light hull gets dragged behind the holder.
const BARB_MAX_SHIP_MASS = 30;
const BARB_DRAG_K = 0.09;
const BARB_TOW_WU = 120;
const BARB_PANIC_RADIUS_WU = 260;
const BARB_PANIC_K = 34;          // wu/s repel shove per tick — the wing scatters

// EVIDENCE CLAMP (Concord Storied) — the held body staples to whatever it touches.
const STAPLE_DEFAULT_S = 2.0;

// SEAL (Helix Relic) — a stapled hostile takes a Directorate fine; lawful ships hunt it.
const SEAL_STAMP_S = 60;

// SYMPATHY (Verge Relic) — line-linked bodies converge on shared momentum.
// One coupling constant for both ends: equal blend factors make the mass-
// weighted velocity the fixed point (net impulse sums to zero), so the pair
// settles on shared momentum instead of drifting past it.
const SYMPATHY_K = 0.10;
const CHUNK_TTL_S = PHYSICAL_BREAKUP_LAW.tearOffLifetimeS;
const CHUNK_FLING_MIN = 10;
const CHUNK_FLING_MAX = 46;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value) { return Number.isFinite(value) ? value : 0; }

function dist(a, b) {
  if (!a || !b || !a.pos || !b.pos) return Infinity;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
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
      this._unsubs.push(this.bus.on('tether:whipImpact', (payload) => this._onWhipSeal(payload || {})));
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

  // ── shared holder/tether seam ──────────────────────────────────────────────
  // Same read the Weld head makes: entity.data.lineHeadId + an active tether
  // target — the player's tether may live on the record for playerId holders.
  _tetherOf(state, holder) {
    return holder.tether
      || (holder.id === state.playerId ? (state.player && state.player.tether) : null);
  },

  _heldFor(state, holder, headId) {
    if (!holder || holder.alive === false || !holder.data
      || holder.data.lineHeadId !== headId) return null;
    const t = this._tetherOf(state, holder);
    if (!t || t.active !== true || t.targetId == null) return null;
    const held = state.entities.get(t.targetId);
    return held && held.alive !== false && held.pos ? held : null;
  },

  _lineHeadPayload(holder) {
    const d = holder.data && holder.data.derived && holder.data.derived.lineHead;
    return d && typeof d === 'object' ? d : null;
  },

  _onWhipSeal(payload) {
    const state = this.state;
    if (!state || !state.entities) return;
    const victim = state.entities.get(payload.victimId);
    if (!victim || victim.alive === false || !victim.data) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;
    // The victim must be a hull the holder could lawfully call a fine down on —
    // the same hostility read the fire authority makes, so a neutral ship never
    // takes a mark it cannot see coming.
    const holder = state.entities.get(state.playerId);
    if (!holder || !holder.data || holder.data.lineHeadId !== SEAL_HEAD_ID) return;
    if (!isHostileForAI(state, holder, victim)) return;
    const vd = victim.data;
    vd.sealMark = { by: holder.id, at: state.simTime, tick: state.tick };
    vd.sealUntil = finite(state.simTime, 0) + SEAL_STAMP_S;
    // Lawful ships in the sector pick the marked hull up as their security
    // target — the engagementAuthority seam that already names a lawful hunt.
    for (const ship of state.entityList) {
      if (!ship || ship.alive === false || ship === victim) continue;
      const ai = ship.data && ship.data.ai;
      if (!ai || ai.lawful !== true || ai.securityTargetId != null) continue;
      ai.securityTargetId = victim.id;
      ai.securityTargetGen = victim.occupantGeneration ?? null;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('lineHead:sealed', {
        victimId: victim.id, holderId: holder.id,
        at: state.simTime, tick: state.tick,
      });
      this.bus.emit('comms:log', {
        text: 'DIRECTORATE SEAL POSTED — lawful hulls will answer the mark.',
        speaker: 'Seal head',
      });
    }
  },

  // ── COUPLER: loose bodies near the held mass chain into a train ────────────
  _tickCouplerTrains(state) {
    const liveHolders = new Set();
    for (const holder of state.entityList) {
      const held = this._heldFor(state, holder, COUPLER_HEAD_ID);
      if (!held) continue;
      liveHolders.add(holder.id);
      const cars = [];
      for (const e of state.entityList) {
        if (!e || e.alive === false || !e.data || e.data.trainOf !== holder.id) continue;
        if (dist(e, held) > TRAIN_DROP_WU) { delete e.data.trainOf; delete e.data.trainSlot; continue; }
        cars.push(e);
      }
      // Admit newcomers nearest-first until the consist is full.
      if (cars.length < TRAIN_MAX_CARS) {
        const candidates = [];
        for (const e of state.entityList) {
          if (!e || e.alive === false || !TRAINABLE_TYPES.has(e.type)
            || e === held || e.data && e.data.trainOf != null) continue;
          const d = dist(e, held);
          if (d <= TRAIN_CAPTURE_WU) candidates.push([d, e]);
        }
        candidates.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
        for (const [, e] of candidates) {
          if (cars.length >= TRAIN_MAX_CARS) break;
          const ed = e.data || (e.data = {});
          ed.trainOf = holder.id;
          ed.trainSlot = cars.length + 1;
          cars.push(e);
        }
      }
      // Each car follows its slot behind the held mass along the holder→held line.
      const hx = held.pos.x - holder.pos.x, hz = held.pos.z - holder.pos.z;
      const hl = Math.hypot(hx, hz) || 1;
      const bx = hx / hl, bz = hz / hl;
      for (const car of cars) {
        const slot = Math.max(1, Math.trunc(car.data.trainSlot || 1));
        const gx = held.pos.x + bx * (slot * TRAIN_GAP_WU + held.radius);
        const gz = held.pos.z + bz * (slot * TRAIN_GAP_WU + held.radius);
        car.vel.x += ((held.vel.x + (gx - car.pos.x) * 1.6) - car.vel.x) * TRAIN_FOLLOW_K;
        car.vel.z += ((held.vel.z + (gz - car.pos.z) * 1.6) - car.vel.z) * TRAIN_FOLLOW_K;
      }
    }
    // A holder that dropped the line (or the head) releases every car it owned.
    for (const e of state.entityList) {
      if (!e || !e.data || e.data.trainOf == null) continue;
      const owner = state.entities.get(e.data.trainOf);
      if (!owner || owner.alive === false || !liveHolders.has(e.data.trainOf)) {
        delete e.data.trainOf; delete e.data.trainSlot;
      }
    }
  },

  // ── BARB: a latched light hull is dragged behind the holder ────────────────
  _tickBarbDrags(state) {
    const hooked = new Set();
    for (const holder of state.entityList) {
      const held = this._heldFor(state, holder, BARB_HEAD_ID);
      if (!held || (held.type !== 'ship' && held.type !== 'drone')
        || finite(held.mass, 0) > BARB_MAX_SHIP_MASS) continue;
      const hd = held.data || (held.data = {});
      hd.barbed = holder.id;
      hooked.add(held.id);
      // The hull tows at the fixed line length behind its captor.
      const dx = held.pos.x - holder.pos.x, dz = held.pos.z - holder.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.max(BARB_TOW_WU, holder.radius + held.radius + 8);
      const gx = holder.pos.x + (dx / d) * want;
      const gz = holder.pos.z + (dz / d) * want;
      held.vel.x += ((holder.vel.x + (gx - held.pos.x) * 1.4) - held.vel.x) * BARB_DRAG_K;
      held.vel.z += ((holder.vel.z + (gz - held.pos.z) * 1.4) - held.vel.z) * BARB_DRAG_K;
      // Storied+: the hooked ship's wing scatters — a real repel shove, not a mood.
      if (this._lineHeadPayload(holder) && this._lineHeadPayload(holder).panicWingmen === true) {
        for (const wing of state.entityList) {
          if (!wing || wing.alive === false || wing === held || wing === holder) continue;
          if (wing.type !== 'ship' && wing.type !== 'drone') continue;
          const sameWing = wing.factionId && wing.factionId === held.factionId
            || (wing.team != null && wing.team === held.team && held.team !== 0);
          if (!sameWing) continue;
          const wx = wing.pos.x - held.pos.x, wz = wing.pos.z - held.pos.z;
          const wd = Math.hypot(wx, wz);
          if (wd > BARB_PANIC_RADIUS_WU || wd < 1e-6) continue;
          wing.vel.x += (wx / wd) * BARB_PANIC_K * (1 - wd / BARB_PANIC_RADIUS_WU);
          wing.vel.z += (wz / wd) * BARB_PANIC_K * (1 - wd / BARB_PANIC_RADIUS_WU);
          const wd_ = wing.data || (wing.data = {});
          wd_.barbPanicked = held.id;
        }
      }
    }
    // Released hulls lose the stamp the same tick the line lets go.
    for (const e of state.entityList) {
      if (!e || !e.data || e.data.barbed == null || hooked.has(e.id)) continue;
      delete e.data.barbed;
    }
  },

  // ── HUSH: the held mass is hidden from scales ─────────────────────────────
  _tickHushVeils(state) {
    const veiled = new Set();
    for (const holder of state.entityList) {
      const held = this._heldFor(state, holder, HUSH_HEAD_ID);
      if (!held) continue;
      const hd = held.data || (held.data = {});
      if (hd.signatureHidden !== true) {
        hd.signatureHidden = true;
        hd.hushHeldBy = holder.id;
      }
      veiled.add(held.id);
    }
    // Lift the veil the tick the line lets go — only the one we set, and only
    // for the stamp this head wrote (another system's hidden body keeps its own).
    for (const e of state.entityList) {
      if (!e || !e.data || e.data.hushHeldBy == null || veiled.has(e.id)) continue;
      delete e.data.signatureHidden;
      delete e.data.hushHeldBy;
    }
  },

  // ── EVIDENCE CLAMP: the held body staples to whatever it touches ───────────
  _tickStaples(state, dt) {
    for (const holder of state.entityList) {
      const held = this._heldFor(state, holder, EVIDENCE_CLAMP_HEAD_ID);
      if (!held) continue;
      const hd = held.data || (held.data = {});
      if (hd.stapledTo != null) continue;
      let joint = null;
      for (const b of state.entityList) {
        if (!b || b.alive === false || b.id === held.id || b.id === holder.id) continue;
        if (b.type === 'shard' || b.type === 'vfx' || b.type === 'machine' || b.type === 'projectile') continue;
        if (dist(held, b) > held.radius + b.radius + 0.5) continue;
        joint = b; break;
      }
      if (!joint) { hd.stapleT = 0; hd.stapleJointId = undefined; continue; }
      if (hd.stapleJointId != null && hd.stapleJointId !== joint.id) {
        hd.stapleT = 0;
      }
      hd.stapleJointId = joint.id;
      const stapleTimeS = finite(this._lineHeadPayload(holder) && this._lineHeadPayload(holder).stapleTimeS, STAPLE_DEFAULT_S);
      hd.stapleT = (Number(hd.stapleT) || 0) + dt;
      if (hd.stapleT >= stapleTimeS) {
        // Pair bond: the lighter body rides the heavier — the staple survives
        // the Line. Only the rider takes stapledTo; the anchor gets a mirror
        // stamp or both bodies would ride each other and collapse the bond.
        const anchor = finite(joint.mass, 0) >= finite(held.mass, 0) ? joint : held;
        const rider = anchor === joint ? held : joint;
        const rd = rider.data || (rider.data = {});
        rd.stapledTo = anchor.id;
        rd.stapledGen = anchor.occupantGeneration ?? null;
        rd.stapleOffset = { dx: rider.pos.x - anchor.pos.x, dz: rider.pos.z - anchor.pos.z };
        const ad = anchor.data || (anchor.data = {});
        ad.stapledAnchor = rider.id;
        ad.stapledAnchorGen = rider.occupantGeneration ?? null;
        hd.stapleT = 0; hd.stapleJointId = undefined;
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('lineHead:stapled', {
            holderId: holder.id, heldId: held.id, jointId: joint.id, tick: state.tick,
          });
        }
      }
    }
    // Stapled riders keep their recorded offset — the bond outlives the Line.
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data || e.data.stapledTo == null) continue;
      const anchor = state.entities.get(e.data.stapledTo);
      const sameBond = anchor && anchor.alive !== false
        && (e.data.stapledGen == null || anchor.occupantGeneration === e.data.stapledGen)
        && anchor.data && anchor.data.stapledAnchor === e.id;
      if (!sameBond) { delete e.data.stapledTo; delete e.data.stapledGen; delete e.data.stapleOffset; continue; }
      const off = e.data.stapleOffset || { dx: 0, dz: 0 };
      e.pos.x = anchor.pos.x + num(off.dx);
      e.pos.z = anchor.pos.z + num(off.dz);
      e.vel.x = anchor.vel.x; e.vel.z = anchor.vel.z;
    }
  },

  // ── SYMPATHY: linked bodies share momentum ─────────────────────────────────
  _tickSympathy(state) {
    for (const holder of state.entityList) {
      const held = this._heldFor(state, holder, SYMPATHY_HEAD_ID);
      if (!held) continue;
      const mH = Math.max(0.1, finite(holder.mass, 1));
      const mM = Math.max(0.1, finite(held.mass, 1));
      const vx = (holder.vel.x * mH + held.vel.x * mM) / (mH + mM);
      const vz = (holder.vel.z * mH + held.vel.z * mM) / (mH + mM);
      holder.vel.x += (vx - holder.vel.x) * SYMPATHY_K;
      holder.vel.z += (vz - holder.vel.z) * SYMPATHY_K;
      held.vel.x += (vx - held.vel.x) * SYMPATHY_K;
      held.vel.z += (vz - held.vel.z) * SYMPATHY_K;
    }
  },

  update(dt, state) {
    if (!state || state.mode !== 'flight' || !state.entities || !state.entityList) return;
    this._tickCouplerTrains(state);
    this._tickBarbDrags(state);
    this._tickHushVeils(state);
    this._tickStaples(state, dt);
    this._tickSympathy(state);
  },
};
