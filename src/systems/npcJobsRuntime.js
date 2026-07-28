// npcJobsRuntime — the thin runtime adapter that drives the PURE npcJobs kernel into the live game.
// PQ-014 / SF-15 / W06 integration ("natural NPC miner/hauler/patrol jobs").
//
// WHAT THIS IS: the SINGLE WRITER of state.npcJobs. It never edits the kernel (src/systems/npcJobs.js
// stays untouched); it only CALLS the kernel's pure functions — createJob / advance / isTruncated /
// interrupt / resume / virtualize / materialize / describeMaterialization / serializeJob / restoreJob
// — and owns the bag of live + virtual jobs and their link to real entities.
//
// WHY A SEPARATE ADAPTER: the kernel is a pure library with zero live-game coupling (no registry, no
// bus, no entities). This adapter supplies exactly that coupling and nothing else, so the kernel's
// 48/48 determinism proof keeps binding to an unchanged file.
//
// ─── The bag entry WRAPS the kernel record ──────────────────────────────────────────────────────
//   entry = {
//     job,              // the pure kernel record (createJob / restoreJob output) — the ONLY thing advance() sees
//     kind,             // convenience mirror of job.kind
//     sectorId,         // the sector this job belongs to (drives virtualize on exit / materialize on enter)
//     worldRecordId,    // STABLE cross-exit/reentry join key — stamped by the producer at spawn and
//                       //   preserved by world capture/rematerialize; how a job re-links to its hull
//     entityId,         // the live entity id while materialized; null while virtualized
//     lastAdvanceSimT,  // GLOBAL state.simTime up to which the job has been advanced (PERSISTED).
//                       //   Elapsed offscreen time on re-entry = state.simTime - lastAdvanceSimT.
//                       //   job.simTime is the kernel's OWN internal clock, NOT global — never use it here.
//     threatId,         // transient: the hostile that triggered the current flee interrupt (not persisted)
//   }
// restoreJob() reconstructs ONLY kernel fields, so this sidecar meta must be serialized/restored HERE.
//
// ─── Movement (single writer) ───────────────────────────────────────────────────────────────────
// For a materialized job we write the SAME civilian `data.intent` that traffic writes: point-and-thrust
// toward the active waypoint, hold at stationary phases. Job hulls therefore stay OFF the tactical /
// combat roster exactly like ordinary traffic (aiPorts skips ai.passive hulls — aiPorts.js:303). The
// producer yields its own per-frame stepper for any entity carrying data.jobId, so there is exactly
// ONE intent writer per job ship per tick.
//
// ─── Offscreen ≈ onscreen (free) ────────────────────────────────────────────────────────────────
// A materialized job is advanced by the per-tick dt; a virtualized job is advanced by the whole elapsed
// interval in ONE call on re-entry. Both use the same advance(), so the kernel's decomposability makes
// them converge with no second code path (kernel proof: npc-jobs-kernel.test.mjs:516-532).

import {
  createJob,
  advance,
  isTruncated,
  interrupt,
  resume,
  virtualize,
  materialize,
  describeMaterialization,
  routePosition,
  serializeJob,
  restoreJob,
  summarizeJob,
  NPC_JOB_KIND,
  NPC_JOB_PHASE,
} from './npcJobs.js';
import { createNearestEntityQueryService } from '../core/spatialQuery.js';

// A hostile ship within this range interrupts a civilian job into flee; beyond it (with hysteresis)
// the job resumes. Civilian traffic today flees the player at 500wu (traffic.js _stepFlee) — matched.
const FLEE_RADIUS = 520;
const RESUME_RADIUS = 760; // hysteresis so a job does not chatter flee/resume on the boundary
// On re-entry a virtual job advances by the elapsed away-time, clamped to a bounded recent window.
// Live exit→reentry within a session is always well under this; the clamp only bounds a pathological
// gap (e.g. a job left virtual for a very long absence) so the catch-up cost stays finite. Advancing
// an away job across a CLOSED-GAME gap (wall-clock) is intentionally NOT modeled here — see REPORT.
const MAX_CATCHUP_S = 3600;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export const npcJobsRuntime = {
  name: 'npcJobsRuntime',
  // We serialize our own already-plain records; the save owner keeps its defensive clone off.
  saveSnapshotOwned: true,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._ensureState();
    this._threatQueries = createNearestEntityQueryService(this.state, {
      entityType: 'ship',
      team: 1,
      fallbackIndex: 'ships',
    });

    // Runtime bridge for intents: every kernel intent is surfaced on the bus under its own event
    // name (npcjobs:transit / :work / :cycle / :hold / :complete / …). Cargo/economy owners MAY
    // consume these later; today they are the observable proof that jobs run. Bound once.
    this._sink = (intent) => {
      if (this.bus && typeof this.bus.emit === 'function') {
        try { this.bus.emit(intent.event, intent); } catch { /* a listener must not corrupt the record */ }
      }
    };

    if (this.bus && typeof this.bus.on === 'function') {
      // A hard sector exit demotes the sector's live entities to durable records; the jobs must
      // survive as VIRTUAL records (they live in state.npcJobs, not on the entity) and keep their
      // place. On re-entry the sector's jobs advance by the away time and re-link to the hull.
      this.bus.on('sector:exit', (p) => this._onSectorExit(p || {}));
      this.bus.on('sector:enter', (p) => this._onSectorEnter(p || {}));
      // Physics publishes the hash before several later systems may spawn. Keep those stable IDs as
      // one-tick candidates so this owner sees the same live hulls the former entityList scan saw.
      this.bus.on('entity:spawned', (p) => this._threatQueries.recordSpawn(p || {}));
      // A job whose hull is destroyed (never demoted) ends with the entity (ruling 5).
      this.bus.on('entity:killed', (p) => {
        const payload = p || {};
        this._threatQueries.recordDestroy(payload);
        this._onEntityGone(payload);
      });
      this.bus.on('entity:destroyed', (p) => {
        const payload = p || {};
        this._threatQueries.recordDestroy(payload);
        this._onEntityGone(payload);
      });
    }

    // Producer-facing API. Traffic (and any future civilian producer) calls assign() at spawn.
    if (this.helpers) {
      this.helpers.npcJobs = {
        assign: (entity, spec) => this.assign(entity, spec),
        get: (jobId) => this._byId()[jobId] || null,
        byEntity: (entityId) => this._entryForEntity(entityId),
        release: (jobId) => this.release(jobId),
        summary: (jobId) => { const e = this._byId()[jobId]; return e ? summarizeJob(e.job) : null; },
        list: () => Object.values(this._byId()),
        count: () => Object.keys(this._byId()).length,
      };
    }
  },

  // ── owned state ────────────────────────────────────────────────────────────────────────────
  _ensureState() {
    const state = this.state;
    if (!state.npcJobs || typeof state.npcJobs !== 'object') state.npcJobs = { byId: {} };
    if (!state.npcJobs.byId || typeof state.npcJobs.byId !== 'object') state.npcJobs.byId = {};
    return state.npcJobs;
  },
  _byId() { return this._ensureState().byId; },

  _entryForEntity(entityId) {
    if (entityId == null) return null;
    const byId = this._byId();
    for (const id of Object.keys(byId)) {
      if (byId[id] && byId[id].entityId === entityId) return byId[id];
    }
    return null;
  },

  newGame() {
    this.state.npcJobs = { byId: {} };
    this._threatQueries?.reset();
  },

  // ── producer seam: create + link a job for a freshly spawned civilian hull ───────────────────
  /**
   * Assign a job to `entity` from a producer spec { kind, route, payload?, ...planning }. Returns the
   * jobId, or null if the spec/entity cannot carry a durable job. Idempotent per worldRecordId: a hull
   * that already owns a live job keeps it (re-adoption after rematerialize routes through _onSectorEnter,
   * not here).
   */
  assign(entity, spec) {
    if (!entity || !entity.data || !spec) return null;
    const worldRecordId = entity.data.worldRecordId;
    if (!worldRecordId) return null; // no stable identity → cannot survive exit/reentry → not our job
    const jobId = 'job:' + worldRecordId;
    const byId = this._byId();
    if (byId[jobId]) { entity.data.jobId = jobId; return jobId; } // already assigned

    let job;
    try {
      job = createJob({ ...spec, id: jobId }, (this.state.meta && this.state.meta.seed) || 0);
    } catch {
      return null; // an invalid route/kind is not fatal — the hull just keeps its ambient stepper
    }
    const sectorId = spec.sectorId
      || entity.data.sectorId || entity.homeSectorId
      || (this.state.world && this.state.world.currentSectorId) || null;
    byId[jobId] = {
      job,
      kind: job.kind,
      sectorId,
      worldRecordId,
      entityId: entity.id,
      lastAdvanceSimT: finite(this.state.simTime, 0),
      threatId: null,
    };
    entity.data.jobId = jobId;
    return jobId;
  },

  release(jobId) {
    const byId = this._byId();
    const entry = byId[jobId];
    if (!entry) return false;
    const ent = entry.entityId != null && this.state.entities ? this.state.entities.get(entry.entityId) : null;
    if (ent && ent.data && ent.data.jobId === jobId) delete ent.data.jobId;
    delete byId[jobId];
    return true;
  },

  // ── per-tick drive ───────────────────────────────────────────────────────────────────────────
  update(dt, state) {
    if (state) this.state = state;
    const threatQueries = this._threatQueries
      || (this._threatQueries = createNearestEntityQueryService(this.state, {
        entityType: 'ship',
        team: 1,
        fallbackIndex: 'ships',
      }));
    threatQueries.setState(this.state).begin();
    if (this.state.mode !== 'flight') {
      threatQueries.execute();
      return; // scenery only matters in flight (mirrors traffic)
    }
    const byId = this._byId();
    const ids = Object.keys(byId);
    if (ids.length === 0) {
      threatQueries.execute();
      return; // strict no-op when no jobs exist
    }

    const step = Math.max(0, finite(dt, 0));
    const simT = finite(this.state.simTime, 0);
    const currentSector = (this.state.world && this.state.world.currentSectorId) || null;

    // Build every eligible threat request before advancing any job, then execute one owner-facing
    // broadphase batch. Requests retain only stable ids and scalar origins; GameState remains authority.
    for (let index = 0; index < ids.length; index++) {
      const jobId = ids[index];
      const entry = byId[jobId];
      if (!entry || !entry.job || entry.entityId == null) continue;
      const entity = this.state.entities && this.state.entities.get(entry.entityId);
      if (!entity || !entity.alive || !entity.pos) continue;
      if (entry.job.corrupt || entry.job.phase === NPC_JOB_PHASE.COMPLETE) continue;
      threatQueries.request(
        jobId,
        entity.id,
        entity.pos.x,
        entity.pos.z,
        entry.job.phase === NPC_JOB_PHASE.FLEE ? RESUME_RADIUS : FLEE_RADIUS,
      );
    }
    const threatRequests = threatQueries.execute();
    let threatRequestIndex = 0;

    for (let index = 0; index < ids.length; index++) {
      const jobId = ids[index];
      let threatRequest = null;
      const pendingRequest = threatRequests[threatRequestIndex];
      if (pendingRequest && pendingRequest.requestId === jobId) {
        threatRequest = pendingRequest;
        threatRequestIndex++;
      }

      const entry = byId[jobId];
      if (!entry || !entry.job) { delete byId[jobId]; continue; }

      if (entry.entityId == null) {
        // Virtualized: try to re-link if its hull has rematerialized in the current sector.
        if (entry.sectorId === currentSector) this._tryRelink(entry, simT);
        continue;
      }

      const entity = this.state.entities && this.state.entities.get(entry.entityId);
      if (!entity || !entity.alive) {
        // Hull vanished without a sector demote (destroyed / despawned) → the job ends with it.
        this.release(jobId);
        continue;
      }

      // Threat → flee interrupt / clear → resume (kernel-owned; we only drive the hull).
      if (threatRequest && threatRequest.sourceEntityId === entity.id) {
        this._reconcileThreatResult(entry, threatRequest.resultId);
      }

      // Materialized advance: one tick of dt. lastAdvanceSimT tracks global time for re-entry math.
      if (step > 0 && entry.job.phase !== NPC_JOB_PHASE.COMPLETE) advance(entry.job, step, this._sink);
      entry.lastAdvanceSimT = simT;

      // Terminal hauler: hand the hull back to its ambient stepper (ruling 5: job ends with entity).
      if (entry.job.phase === NPC_JOB_PHASE.COMPLETE) { this.release(jobId); continue; }

      this._drive(entry, entity);
    }
  },

  // ── movement: replicate traffic's civilian intent write (single writer for job hulls) ─────────
  _writeIntent(entity, moveX, moveZ, boost, aimAngle) {
    const data = entity.data || (entity.data = {});
    const intent = data.intent
      || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
    intent.moveX = moveX;
    intent.moveZ = moveZ;
    intent.boost = boost;
    intent.fire = false;       // civilian job hulls NEVER open fire (hold_fire)
    intent.fireGroup = null;
    intent.aimAngle = aimAngle;
  },

  _drive(entry, entity) {
    const job = entry.job;
    if (!job || job.corrupt) { this._writeIntent(entity, 0, 0, false, entity.rot || 0); return; }
    const phase = job.phase;

    if (phase === NPC_JOB_PHASE.FLEE) {
      // Boost directly away from the remembered threat (civilian bolt, like traffic _stepFlee).
      const threat = entry.threatId != null && this.state.entities ? this.state.entities.get(entry.threatId) : null;
      if (threat && threat.pos) {
        const aim = Math.atan2(entity.pos.z - threat.pos.z, entity.pos.x - threat.pos.x);
        this._writeIntent(entity, 0, 1, true, aim);
      } else {
        this._writeIntent(entity, 0, 0, false, entity.rot || 0);
      }
      return;
    }

    if (phase === NPC_JOB_PHASE.TRANSIT || phase === NPC_JOB_PHASE.RETURN) {
      const target = this._targetWaypointPos(job);
      if (target) {
        const aim = Math.atan2(target.z - entity.pos.z, target.x - entity.pos.x);
        this._writeIntent(entity, 0, 1, false, aim); // face target, thrust forward (moveZ=1)
        return;
      }
    }
    // Stationary phases (commission / depart / approach / work / load / unload / hold): hold position.
    this._writeIntent(entity, 0, 0, false, entity.rot || 0);
  },

  /** The world position of the waypoint the current transit/return leg is heading toward, or null. */
  _targetWaypointPos(job) {
    const desc = describeMaterialization(job);
    if (!desc) return null;
    if (desc.targetId && Array.isArray(job.route)) {
      const wp = job.route.find((w) => w && w.id === desc.targetId);
      if (wp && wp.pos) return { x: wp.pos.x, z: wp.pos.z };
    }
    return null;
  },

  // ── threat / flee ─────────────────────────────────────────────────────────────────────────────
  _reconcileThreatResult(entry, resultId) {
    const job = entry.job;
    if (!job || job.corrupt || job.phase === NPC_JOB_PHASE.COMPLETE) return;
    const nearest = resultId != null && this.state.entities
      ? this.state.entities.get(resultId)
      : null;
    const liveHostile = nearest && nearest.alive && nearest.type === 'ship' && nearest.team === 1
      ? nearest
      : null;
    if (job.phase === NPC_JOB_PHASE.FLEE) {
      if (!liveHostile) { resume(job); entry.threatId = null; }
      else { entry.threatId = liveHostile.id; }
      return;
    }
    if (liveHostile) {
      interrupt(job, { entityId: liveHostile.id });
      entry.threatId = liveHostile.id;
    }
  },

  // ── sector transitions: virtualize on exit, re-link + advance on enter ───────────────────────
  _onSectorExit(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    const byId = this._byId();
    for (const jobId of Object.keys(byId)) {
      const entry = byId[jobId];
      if (!entry || entry.sectorId !== sectorId) continue;
      // Keep the record; drop the live link. lastAdvanceSimT already holds the last live-advance time,
      // which is (to within a tick) the exit time — the anchor the re-entry catch-up measures from.
      const ent = entry.entityId != null && this.state.entities ? this.state.entities.get(entry.entityId) : null;
      if (ent && ent.data && ent.data.jobId === jobId) delete ent.data.jobId;
      virtualize(entry.job);
      entry.entityId = null;
      entry.threatId = null;
    }
  },

  _onSectorEnter(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // Re-link is done lazily in update() once the producer has rematerialized the hulls this tick;
    // an immediate pass here also catches hulls already present (continuous handoff).
    const simT = finite(this.state.simTime, 0);
    const byId = this._byId();
    for (const jobId of Object.keys(byId)) {
      const entry = byId[jobId];
      if (!entry || entry.entityId != null || entry.sectorId !== sectorId) continue;
      this._tryRelink(entry, simT);
    }
  },

  /** Find the rematerialized hull for a virtual job (by worldRecordId), advance the away time, materialize. */
  _tryRelink(entry, simT) {
    const entity = this._findEntityByRecordId(entry.worldRecordId);
    if (!entity) return false;
    // Advance the whole offscreen interval in ONE aggregated call, resuming across the (never-hit-in-
    // practice) transition cap so a pathological dt cannot silently drop transitions. NO sink here:
    // offscreen catch-up is historical — replaying thousands of past-phase intents on the live bus
    // would be both wrong (they didn't happen on-screen) and, under a pathological dt, unbounded.
    // The job STATE advances truthfully; only the current on-screen materialization is surfaced.
    const elapsed = Math.min(MAX_CATCHUP_S, Math.max(0, simT - finite(entry.lastAdvanceSimT, simT)));
    if (elapsed > 0 && entry.job.phase !== NPC_JOB_PHASE.COMPLETE) {
      let out = advance(entry.job, elapsed);
      let guard = 0;
      while (out.length && isTruncated(out[out.length - 1]) && guard++ < 100000) {
        const t = out[out.length - 1];
        out = advance(entry.job, finite(t.remainingDt, 0));
      }
    }
    entry.lastAdvanceSimT = simT;
    if (entry.job.phase === NPC_JOB_PHASE.COMPLETE) {
      // A hauler that finished its run while away: no live job to resume; hand the hull back.
      if (entity.data && entity.data.jobId === ('job:' + entry.worldRecordId)) delete entity.data.jobId;
      delete this._byId()['job:' + entry.worldRecordId];
      return true;
    }
    materialize(entry.job);
    entry.entityId = entity.id;
    entry.threatId = null;
    entity.data.jobId = 'job:' + entry.worldRecordId;
    return true;
  },

  _findEntityByRecordId(worldRecordId) {
    if (!worldRecordId) return null;
    const list = this.state.entityList || [];
    for (const e of list) {
      if (e && e.alive && e.data && e.data.worldRecordId === worldRecordId) return e;
    }
    return null;
  },

  _onEntityGone(p) {
    const id = p && (p.id != null ? p.id : p.entityId);
    if (id == null) return;
    const entry = this._entryForEntity(id);
    if (entry) this.release('job:' + entry.worldRecordId);
  },

  // ── save / restore ────────────────────────────────────────────────────────────────────────────
  serialize() {
    const byId = this._byId();
    const out = { byId: {} };
    for (const jobId of Object.keys(byId)) {
      const entry = byId[jobId];
      if (!entry || !entry.job) continue;
      const job = serializeJob(entry.job);
      if (!job) continue;
      out.byId[jobId] = {
        job,
        kind: entry.kind || job.kind,
        sectorId: entry.sectorId || null,
        worldRecordId: entry.worldRecordId || null,
        // entityId is deliberately NOT persisted: entity ids are not stable across load. The job
        // re-links to its rematerialized hull by worldRecordId on the next sector enter.
        lastAdvanceSimT: finite(entry.lastAdvanceSimT, 0),
      };
    }
    return out;
  },

  deserialize(data) {
    const byId = {};
    const src = data && data.byId && typeof data.byId === 'object' ? data.byId : {};
    for (const jobId of Object.keys(src)) {
      const saved = src[jobId];
      if (!saved || !saved.job) continue;
      const job = restoreJob(saved.job);
      if (!job || job.corrupt) continue; // a corrupt save record is dropped, never resurrected
      virtualize(job); // all hulls are cleared on load; every job restores VIRTUAL until re-linked
      byId[jobId] = {
        job,
        kind: job.kind,
        sectorId: saved.sectorId || null,
        worldRecordId: saved.worldRecordId || null,
        entityId: null,
        lastAdvanceSimT: finite(saved.lastAdvanceSimT, 0),
        threatId: null,
      };
    }
    this.state.npcJobs = { byId };
    this._threatQueries?.reset();
  },
};

export default npcJobsRuntime;
