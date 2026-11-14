// PL-293 The silent mechanics — "Two tugs appear beside your stalled line, rotate it off the
// lane, set it somewhere safe, and leave without a word on any channel.
// Let them work; or send them a bill for the tow — tugs bill back, once, with interest"
//
// A chance meeting on the ordinary route: the player is TOWING something (a live tow through
// the shared towWatch view) and is stalled (speed under stalledSpeedWu for stalledForS of
// sweeps). Two tugs spawn beside the towed body, steer to it, and physically rotate it off
// the lane — bounded perpendicular impulses through the physics authority — then set it
// somewhere safe (a data stamp on the body) and despawn WITHOUT A WORD on any channel.
//
// - Let them work: keep clear (outside interfereRangeWu of a tug) and never snap a line on
//   a tug. The work completes; the body carries the set-safe stamp.
// - Send them a bill: snapping a massline ONTO a tug is you holding them for pay. They bill
//   back, once, with interest: after the work, one bounded impulse to YOUR hull at the
//   interest multiple of their per-second tow — still wordless.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Tug steering is the traffic reaction lease (abort on refusal);
//   impulses go through queuePhysicsImpulse, never a direct vel write.
// - Physical: the rotate-off is a real impulse on the real towed body.
// - Bounded Maps capped by tuning.memoryCap; caps: two tugs, one billing, one meeting.
// - Nothing runs while docked; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';
import { hash32 } from '../../core/rng.js';


export const SILENT_MECHANICS_EVENT = 'plants:silentMechanics';

export const SILENT_MECHANICS_TUNING = Object.freeze({
  plId: 'pl293',
  spawnChancePct: 55,
  tugCount: 2,                 // two tugs, never more
  stalledSpeedWu: 6,           // "your stalled line": barely moving
  stalledForS: 4,              // and stalled for this long
  workRangeWu: 60,             // tug within this of the body is on the job
  interfereRangeWu: 45,        // stay outside this of a tug to let them work
  workWindowS: 8,              // the rotate-off takes this long
  rotateImpulsePerSec: 70,     // perpendicular push on the towed body
  billInterestMult: 1.5,       // "tugs bill back, once, with interest"
  billImpulsePerSec: 80,       // the billing yank on the player's hull
  billWindowS: 1.2,
  spawnOffsetWu: 120,
  strangerTtlS: 300,
  memoryCap: 8,
});

export const SILENT_MECHANICS_CALLSIGN = 'SILENT TUG';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pure rotate-off impulse: perpendicular to the player-body lane (the lane is the line from
 * the player to their towed body), sign picks the free side, magnitude per tuning.
 */
export function tugRotateImpulse(playerPos, bodyPos, magnitude) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const bx = finite(bodyPos && bodyPos.x);
  const bz = finite(bodyPos && bodyPos.z);
  let lx = bx - px;
  let lz = bz - pz;
  const len = Math.hypot(lx, lz);
  if (len <= 1e-6) { lx = 1; lz = 0; } else { lx /= len; lz /= len; }
  const mag = finite(magnitude, 0);
  return { x: -lz * mag, z: lx * mag };
}

/** Pure: is the player interfering (inside a tug's work space)? */
export function isInterfering(distWu, tuning = SILENT_MECHANICS_TUNING) {
  return Number.isFinite(distWu) && distWu < tuning.interfereRangeWu;
}

export const silentMechanicsPlant = {
  name: 'plants293',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._tugTowMemory = new Map();
    this._stalledTicks = 0;
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', () => this._reset('sector_enter'));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('tether:snapCatch', (p) => this._onSnapCatch(p));
    this._silentMechanicsTowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
    attachTowWatch(this, 'silentMechanics', () => this._tugTowMemory);
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    const player = this._player();
    if (!player || !player.pos) return;

    // Stalled-line detection: a live tow, nearly stopped, for stalledForS of sweeps.
    const thisAccum = (this._accum += finite(dt, 0));
    if (thisAccum >= 1) {
      this._accum = 0;
      if (!enc) this._watchStalled(player, now);
    }

    const job = this._memory.get('job');
    if (!job) return;
    const body = this._entity(job.bodyId);
    if (!body || body.alive === false) { this._endJob('body_gone'); return; }

    // Tug steering: each tug closes on the body through the reaction lease.
    let onSite = 0;
    let anyAlive = false;
    for (const tugId of job.tugIds) {
      const tug = this._entity(tugId);
      if (!tug || tug.alive === false) continue;
      anyAlive = true;
      const dx = finite(body.pos.x) - finite(tug.pos.x);
      const dz = finite(body.pos.z) - finite(tug.pos.z);
      const d = Math.hypot(dx, dz);
      const held = requestTrafficReaction(this, tug, {
        moveX: d < 20 ? 0 : dx / (d || 1),
        moveZ: d < 20 ? 0 : dz / (d || 1),
        boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: d < 20,
      }, 3);
      if (!held) releaseTrafficReaction(this, tug); // refused: abort
      else if (d <= SILENT_MECHANICS_TUNING.workRangeWu) onSite += 1;
    }
    if (!anyAlive) { this._endJob('tugs_gone'); return; }

    // The work: rotate the line off the lane once both tugs are on it.
    if (onSite >= SILENT_MECHANICS_TUNING.tugCount && job.workUntil == null) {
      job.workUntil = now + SILENT_MECHANICS_TUNING.workWindowS;
      job.startedWorkAt = now;
      this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'work_started', bodyId: job.bodyId, t: now });
    }
    if (job.workUntil != null) {
      if (now < job.workUntil) {
        // Bounded perpendicular impulses: the line swings off the lane.
        const perTick = tugRotateImpulse(player.pos, body.pos,
          SILENT_MECHANICS_TUNING.rotateImpulsePerSec * Math.max(dt, 1 / 60));
        const mass = finite(body.mass, 1) || 1;
        queuePhysicsImpulse(body, { x: perTick.x * mass, z: perTick.z * mass }, { tick: s.tick });
      } else if (!job.settled) {
        // Set somewhere safe: the stamp is the work order's receipt.
        job.settled = true;
        body.data = body.data || {};
        body.data.plants = { ...(body.data.plants || {}), [SILENT_MECHANICS_TUNING.plId]: { setSafe: true, at: now } };
        this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'set_safe', bodyId: job.bodyId, t: now });
        this._endJob('done');
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this._tugTowMemory) this._tugTowMemory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _dist(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _capMemory() {
    while (this._memory.size >= SILENT_MECHANICS_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _watchStalled(player, now) {
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed >= SILENT_MECHANICS_TUNING.stalledSpeedWu) { this._stalledTicks = 0; return; }
    this._stalledTicks += 1;
    if (this._stalledTicks * 1 < SILENT_MECHANICS_TUNING.stalledForS) return;
    const bodyId = towTargetIdOf(this.state, this._tugTowMemory, now);
    if (bodyId == null || this._entity(bodyId) == null) return;
    // Chance gate: a seeded slice of stalled lines gets adopted.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, SILENT_MECHANICS_TUNING.plId, 'stall') % 100 >= SILENT_MECHANICS_TUNING.spawnChancePct) return;
    this._startJob(bodyId, player);
  },

  _startJob(bodyId, player) {
    if (this._owned.size >= SILENT_MECHANICS_TUNING.tugCount) return;
    const tugs = [];
    for (let i = 0; i < SILENT_MECHANICS_TUNING.tugCount; i++) {
      const side = i === 0 ? 1 : -1;
      const pos = {
        x: finite(player.pos.x) + side * SILENT_MECHANICS_TUNING.spawnOffsetWu,
        z: finite(player.pos.z) + (i === 0 ? 40 : -40),
      };
      const tug = this._spawnTug(pos);
      if (tug) tugs.push(tug.id);
    }
    if (tugs.length < SILENT_MECHANICS_TUNING.tugCount) {
      for (const id of tugs) this._remove(id);
      return;
    }
    this._capMemory();
    this._memory.set('job', {
      bodyId,
      tugIds: tugs,
      workUntil: null,
      startedWorkAt: null,
      settled: false,
      billedBack: false,
      demandedAt: null,
      startedAt: this._now(),
    });
    this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'tugs_arrived', bodyId, tugIds: tugs, t: this._now() });
  },

  _spawnTug(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_hawser', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'tug', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SILENT_MECHANICS_TUNING.plId]: { role: 'silent_tug' } };
    ent.data.callsign = SILENT_MECHANICS_CALLSIGN;
    this._owned.set(ent.id, { kind: 'tug', expiresAt: this._now() + SILENT_MECHANICS_TUNING.strangerTtlS });
    return ent;
  },

  // A line snapped onto a tug is the player holding them for pay — the bill.
  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const job = this._memory.get('job');
    if (!job || !p.targetId) return;
    if (!job.tugIds.includes(p.targetId)) return;
    job.demandedAt = this._now();
    this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'billed', tugId: p.targetId, t: job.demandedAt });
  },

  _endJob(reason) {
    const job = this._memory.get('job');
    if (!job) return;
    this._memory.delete('job');
    const now = this._now();
    // "tugs bill back, once, with interest": the yank lands as they leave. No words.
    if (job.demandedAt != null && !job.billedBack) {
      const player = this._player();
      const tug = this._entity(job.tugIds[0]);
      if (player && tug && tug.pos && player.pos && reason === 'done') {
        job.billedBack = true;
        // The yank is along the line from tug to player — they haul back on you as they go.
        const dx = finite(player.pos.x) - finite(tug.pos.x);
        const dz = finite(player.pos.z) - finite(tug.pos.z);
        const len = Math.hypot(dx, dz) || 1;
        const mass = finite(player.mass, 1) || 1;
        const mag = SILENT_MECHANICS_TUNING.billImpulsePerSec * SILENT_MECHANICS_TUNING.billInterestMult
          * SILENT_MECHANICS_TUNING.billWindowS;
        queuePhysicsImpulse(player,
          { x: (dx / len) * mag * mass, z: (dz / len) * mag * mass }, { tick: this.state.tick });
        this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'billed_back', bodyId: job.bodyId, t: now });
      }
    }
    for (const id of job.tugIds) this._remove(id);
    this._stalledTicks = 0;
    this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'left_wordless', reason, t: now });
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this._tugTowMemory) this._tugTowMemory.clear();
    this._stalledTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(SILENT_MECHANICS_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },
};
