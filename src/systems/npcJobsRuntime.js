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
  NPC_JOB_SCHEMA,
} from './npcJobs.js';
import { createNearestEntityQueryService } from '../core/spatialQuery.js';
import { normalizeRoe, RulesOfEngagement } from '../ai/doctrine.js';
import { DRIVE_FAMILIES, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

// A hostile ship within this range interrupts a civilian job into flee; beyond it (with hysteresis)
// the job resumes. Civilian traffic today flees the player at 500wu (traffic.js _stepFlee) — matched.
const FLEE_RADIUS = 520;
const RESUME_RADIUS = 760; // hysteresis so a job does not chatter flee/resume on the boundary
// On re-entry a virtual job advances by the elapsed away-time, clamped to a bounded recent window.
// Live exit→reentry within a session is always well under this; the clamp only bounds a pathological
// gap (e.g. a job left virtual for a very long absence) so the catch-up cost stays finite. Advancing
// an away job across a CLOSED-GAME gap (wall-clock) is intentionally NOT modeled here — see REPORT.
const MAX_CATCHUP_S = 3600;
// The kernel remains the route clock. The live hull follows that clock through Flight V3's
// assisted speed command, with a short planned end-of-leg brake so a slow authored route does not
// coast through its pocket while the kernel enters a stationary phase.
const ROUTE_BRAKE_WINDOW_S = 0.75;

// R6 escort formation is deliberately one exact authored relationship, not a generic targetRef
// movement language. Stable record/job ids remain the authority across rematerialization; live
// numeric ids are looked up through the current job entries and are never retained or serialized.
const CERES_ESCORT_SLOT_ID = 'ceres_ambush_escort';
const CERES_ESCORT_WARD_SLOT_ID = 'ceres_ambush_loaded_hauler';
const CERES_ESCORT_WARD_TARGET_REF = `actor:${CERES_ESCORT_WARD_SLOT_ID}`;
const CERES_ESCORT_AFT_WU = 80;
const CERES_ESCORT_DEADBAND_WU = 18;
const CERES_ESCORT_CATCHUP_WU = 120;
const CERES_ESCORT_MAX_THROTTLE = 0.65;
const CERES_ESCORT_TURN_ONLY_RAD = 0.4;
const CERES_ESCORT_VELOCITY_EPSILON = 0.001;
const CERES_ESCORT_RELATIVE_OVERSPEED_WU_S = 2;

function ceresActivitySlot(slotId) {
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.actorSlots) {
      if (slot && slot.id === slotId) return slot;
    }
  }
  return null;
}

function ceresActivityActorDescriptor(slotId) {
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.actorSlots) {
      if (slot && slot.id === slotId) return { pocket, slot };
    }
  }
  return null;
}

// PQ-045: only these six already-materialized relationships gain a physical target. This is still
// deliberately not a generic targetRef interpreter — the seven remaining `activity:*` marks and every
// `actor:*` mark stay abstract authored choreography and keep their authored-route fallback.
//
// Two ownership families are admitted, because the Ceres cast has two spawn owners. `traffic_cast`
// hulls are stamped by traffic's activity cast and carry its `ceresActivityCast`/`ceresActivityJobOwned`
// pair. The refinery tender is deliberately excluded from that cast (traffic.js filters its slot id
// out) and is instead a durable factionPresence world record, so it proves ownership through its own
// `durable` + `factionPresence.yardTender` marker pair. Neither family borrows the other's flags:
// stamping traffic's cast markers onto a factionPresence hull would hand it to traffic's release,
// capture and law-responder scans as well, which is a second owner, not a target relationship.
const CERES_TARGET_OWNERSHIP = Object.freeze({
  TRAFFIC_CAST: 'traffic_cast',
  FACTION_PRESENCE: 'faction_presence',
});
const CERES_REAL_TARGET_SPECS = Object.freeze([
  Object.freeze({
    actorSlotId: 'ceres_refinery_hauler',
    worldRecordSlotId: 'ceres:activity:ceres_refinery_hauler',
    routeId: 'ceres_refinery_freight_loop',
    jobKind: NPC_JOB_KIND.HAULER,
    waypointId: 'refinery_cargo_approach',
    targetRef: 'object:ceres_refinery_cargo_pod',
    entityType: 'fx',
    identityField: 'activityObjectSlotId',
    identityValue: 'ceres_refinery_cargo_pod',
    standoffKind: 'fixed',
    standoffWU: 24,
    recordKind: RECORD_KIND.CONVOY,
    ownership: CERES_TARGET_OWNERSHIP.TRAFFIC_CAST,
  }),
  Object.freeze({
    actorSlotId: 'ceres_refinery_hauler',
    worldRecordSlotId: 'ceres:activity:ceres_refinery_hauler',
    routeId: 'ceres_refinery_freight_loop',
    jobKind: NPC_JOB_KIND.HAULER,
    waypointId: 'refinery_station_approach',
    targetRef: 'dest:station_ceres',
    entityType: 'station',
    identityField: 'stationId',
    identityValue: 'station_ceres',
    standoffKind: 'dock',
    standoffWU: 72,
    recordKind: RECORD_KIND.CONVOY,
    ownership: CERES_TARGET_OWNERSHIP.TRAFFIC_CAST,
  }),
  Object.freeze({
    actorSlotId: 'ceres_seam_miner',
    worldRecordSlotId: 'ceres:activity:ceres_seam_miner',
    routeId: 'ceres_seam_extraction_loop',
    jobKind: NPC_JOB_KIND.MINER,
    waypointId: 'seam_miner_ore_face',
    targetRef: 'field:slot:ceres_seam_ore_clast',
    entityType: 'asteroid',
    identityField: 'activityObjectSlotId',
    identityValue: 'ceres_seam_ore_clast',
    standoffKind: 'collision',
    standoffWU: 30,
    recordKind: RECORD_KIND.CONVOY,
    ownership: CERES_TARGET_OWNERSHIP.TRAFFIC_CAST,
  }),
  Object.freeze({
    actorSlotId: 'ceres_cathedral_salvor',
    worldRecordSlotId: 'ceres:activity:ceres_cathedral_salvor',
    routeId: 'ceres_cathedral_salvage_loop',
    jobKind: NPC_JOB_KIND.SALVOR,
    waypointId: 'cathedral_salvor_shard',
    targetRef: 'object:ceres_cathedral_grave_shard',
    entityType: 'fx',
    identityField: 'activityObjectSlotId',
    identityValue: 'ceres_cathedral_grave_shard',
    standoffKind: 'fixed',
    standoffWU: 32,
    recordKind: RECORD_KIND.CONVOY,
    ownership: CERES_TARGET_OWNERSHIP.TRAFFIC_CAST,
  }),
  Object.freeze({
    actorSlotId: 'ceres_cathedral_salvor',
    worldRecordSlotId: 'ceres:activity:ceres_cathedral_salvor',
    routeId: 'ceres_cathedral_salvage_loop',
    jobKind: NPC_JOB_KIND.SALVOR,
    waypointId: 'cathedral_salvor_hulk',
    targetRef: 'world-site:world_site_wreck_cathedral',
    entityType: 'fx',
    identityField: 'worldRecordId',
    identityValue: 'world_site_wreck_cathedral/root',
    standoffKind: 'fixed',
    standoffWU: 48,
    recordKind: RECORD_KIND.CONVOY,
    ownership: CERES_TARGET_OWNERSHIP.TRAFFIC_CAST,
  }),
  // The tender's second mark. Its first mark (`station:station_ceres:service-berth`) stays authored:
  // the berth is a named face of a station this route never needs to physically resolve, whereas the
  // client is the whole point of the call-out.
  //
  // This is the one relationship whose berth is DERIVED rather than authored flat. The other fixed
  // standoffs are hand-tuned against props whose visual radius is either meaningless (the Cathedral
  // root is 360 WU) or deliberately nosed into (the hauler tucks inside the cargo barge). Here both
  // bodies are real hulls of comparable size, and a tender that intersects the casualty it is welding
  // reads as a bug rather than as service. `collision` takes max(standoffWU, actorR + targetR + 12),
  // so the clearance tracks the live geometry and cannot silently rot if either hull is re-authored.
  Object.freeze({
    actorSlotId: 'ceres_refinery_tender',
    worldRecordSlotId: 'ceres:activity:ceres_refinery_tender',
    routeId: 'ceres_refinery_tender_service',
    jobKind: NPC_JOB_KIND.TENDER,
    waypointId: 'refinery_tender_client',
    targetRef: 'object:ceres_refinery_disabled_hull',
    entityType: 'fx',
    identityField: 'activityObjectSlotId',
    identityValue: 'ceres_refinery_disabled_hull',
    standoffKind: 'collision',
    standoffWU: 56,
    recordKind: RECORD_KIND.NPC,
    ownership: CERES_TARGET_OWNERSHIP.FACTION_PRESENCE,
  }),
]);

const CERES_ESCORT_SLOT = ceresActivitySlot(CERES_ESCORT_SLOT_ID);
const CERES_ESCORT_WARD_SLOT = ceresActivitySlot(CERES_ESCORT_WARD_SLOT_ID);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function shortestAngleDelta(a, b) {
  const turn = Math.PI * 2;
  let delta = (a % turn) - (b % turn);
  if (delta > Math.PI) delta -= turn;
  else if (delta < -Math.PI) delta += turn;
  return delta;
}

function legalFormationJobPhase(kind, phase) {
  if (phase === NPC_JOB_PHASE.FLEE) return true;
  if (kind === NPC_JOB_KIND.PATROL) {
    return phase === NPC_JOB_PHASE.COMMISSION
      || phase === NPC_JOB_PHASE.TRANSIT
      || phase === NPC_JOB_PHASE.APPROACH
      || phase === NPC_JOB_PHASE.HOLD;
  }
  if (kind === NPC_JOB_KIND.HAULER) {
    return phase === NPC_JOB_PHASE.COMMISSION
      || phase === NPC_JOB_PHASE.LOAD
      || phase === NPC_JOB_PHASE.DEPART
      || phase === NPC_JOB_PHASE.TRANSIT
      || phase === NPC_JOB_PHASE.APPROACH
      || phase === NPC_JOB_PHASE.UNLOAD;
  }
  return false;
}

function clearRouteBrake(entity) {
  const intent = entity && entity.data && entity.data.intent;
  if (intent) intent.brake = false;
}

function eligibleActiveHostile(entity) {
  const ai = entity && entity.data && entity.data.ai;
  return !(ai && (ai.passive === true
    || normalizeRoe(ai.roe) === RulesOfEngagement.HOLD_FIRE));
}

function cleanClaimId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

const THREAT_QUERY_DIAGNOSTIC_FIELDS = Object.freeze([
  'queryBatches',
  'spatialBatches',
  'fallbackBatches',
  'queryRequests',
  'queryCandidates',
  'queryResults',
  'queryScratchGrowth',
  'spawnSupplements',
  'exceptionalCandidates',
  'exceptionalEntities',
  'shadowChecks',
  'shadowMismatches',
  'lastBatchRequests',
  'lastBatchCandidates',
  'highWaterRequests',
]);

function threatQueryDiagnosticsSnapshot(service) {
  const source = service && typeof service.getDiagnostics === 'function'
    ? service.getDiagnostics()
    : null;
  const snapshot = {
    schema: 'spaceface.npcJobsThreatQueryDiagnostics.v1',
    available: !!source,
  };
  for (const field of THREAT_QUERY_DIAGNOSTIC_FIELDS) {
    snapshot[field] = Number.isFinite(source?.[field]) ? source[field] : 0;
  }
  return snapshot;
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
    this._resetCeresEscortAuthority();
    this._resetCeresRealTargetAuthority();
    this._threatQueries = createNearestEntityQueryService(this.state, {
      entityType: 'ship',
      team: 1,
      fallbackIndex: 'ships',
      eligible: eligibleActiveHostile,
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
      // Continue rematerializes the saved sector before this system's deserialize() restores the
      // job bag (saveSystem restore step 9 versus step 13). The earlier sector:enter therefore
      // cannot see those freshly restored virtual jobs. Re-run the same bounded relink pass after
      // every owner has deserialized and the live world-record hulls are already present.
      this._onSaveLoadedRelink = () => {
        const sectorId = this.state.world && this.state.world.currentSectorId;
        if (sectorId) this._onSectorEnter({ sectorId });
      };
      this.bus.on('save:loaded', this._onSaveLoadedRelink);
      this.bus.on('save:restoring', () => {
        // Traffic owns the exact legacy-R5 targetRef adoption and registers after this runtime.
        // Move only this relink listener to the tail before a real Continue, so every owner has
        // restored/adopted canonical state before `_tryRelink` performs its pure validation. The
        // relink itself remains synchronous with save:loaded and still precedes no mutation of its
        // own unless the now-canonical actor/job/route predicates pass.
        this.bus.off('save:loaded', this._onSaveLoadedRelink);
        this.bus.on('save:loaded', this._onSaveLoadedRelink);
      });
      // Physics publishes the hash before several later systems may spawn. Keep those stable IDs as
      // one-tick candidates so this owner sees the same live hulls the former entityList scan saw.
      this.bus.on('entity:spawned', (p) => {
        const payload = p || {};
        this._threatQueries.recordSpawn(payload);
        this._onCeresRealTargetSpawn(payload);
      });
      // A job whose hull is destroyed (never demoted) ends with the entity (ruling 5).
      this.bus.on('entity:killed', (p) => {
        const payload = p || {};
        this._threatQueries.recordDestroy(payload);
        this._onCeresRealTargetGone(payload);
        this._onEntityGone(payload);
      });
      this.bus.on('entity:destroyed', (p) => {
        const payload = p || {};
        this._threatQueries.recordDestroy(payload);
        this._onCeresRealTargetGone(payload);
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
        // PQ-019B control leases (see claimControl/releaseControl).
        claimControl: (jobId, opts) => this.claimControl(jobId, opts),
        releaseControl: (jobId, claimId) => this.releaseControl(jobId, claimId),
        controlClaim: (jobId) => this.controlClaim(jobId),
        activeControlClaimCount: () => this.activeControlClaimCount(),
        // Read-on-demand performance evidence. The returned object is a detached scalar snapshot;
        // callers cannot mutate the retained hot-path counters or request scratch.
        threatQueryDiagnostics: () => this.threatQueryDiagnostics(),
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

  // ── transient exact-Ceres formation authority ───────────────────────────────────────────────
  // This fixed two-slot cache is intentionally outside GameState/save data. It retains object
  // identities (never numeric entity ids) so the steady tick can prove O(1) that both ends of the
  // relationship are still the exact live objects admitted by assign/relink. Any duplicate durable
  // identity makes the slot ambiguous for the rest of that residency.
  _resetCeresEscortAuthority() {
    const rawSeed = this.state && this.state.meta && this.state.meta.seed;
    const seed = (Number.isFinite(rawSeed) ? rawSeed : 1) >>> 0 || 1;
    const makeSlot = (slot, kind) => {
      const worldRecordId = slot
        ? stableRecordId(seed, CERES_ACTIVITY_SECTOR_ID, RECORD_KIND.CONVOY, slot.worldRecordSlotId)
        : null;
      return {
        slotId: slot && slot.id || null,
        worldRecordSlotId: slot && slot.worldRecordSlotId || null,
        kind,
        worldRecordId,
        jobId: worldRecordId ? `job:${worldRecordId}` : null,
        entryRef: null,
        jobRef: null,
        entityRef: null,
        dataRef: null,
        ambiguous: false,
      };
    };
    this._ceresEscortAuthority = {
      seed,
      escort: makeSlot(CERES_ESCORT_SLOT, NPC_JOB_KIND.PATROL),
      ward: makeSlot(CERES_ESCORT_WARD_SLOT, NPC_JOB_KIND.HAULER),
    };
    return this._ceresEscortAuthority;
  },

  _ensureCeresEscortAuthority() {
    const rawSeed = this.state && this.state.meta && this.state.meta.seed;
    const seed = (Number.isFinite(rawSeed) ? rawSeed : 1) >>> 0 || 1;
    const authority = this._ceresEscortAuthority;
    return authority && authority.seed === seed ? authority : this._resetCeresEscortAuthority();
  },

  _ceresFormationSlotForWorldRecordId(worldRecordId) {
    const authority = this._ensureCeresEscortAuthority();
    if (authority.escort.worldRecordId === worldRecordId) return authority.escort;
    if (authority.ward.worldRecordId === worldRecordId) return authority.ward;
    return null;
  },

  // ── transient exact-Ceres real-target authority ─────────────────────────────────────────────
  // Five fixed relationships are admitted. Each retains exact object identities only; nothing in
  // this cache is serialized. Entity scans happen only while binding/rebinding at lifecycle seams,
  // never in the steady `_drive` tick.
  _resetCeresRealTargetAuthority() {
    const rawSeed = this.state && this.state.meta && this.state.meta.seed;
    const seed = (Number.isFinite(rawSeed) ? rawSeed : 1) >>> 0 || 1;
    this._ceresRealTargetAuthority = {
      seed,
      bindings: CERES_REAL_TARGET_SPECS.map((spec) => {
        const candidate = ceresActivityActorDescriptor(spec.actorSlotId);
        const descriptor = candidate
          && candidate.slot.worldRecordSlotId === spec.worldRecordSlotId
          && candidate.slot.jobKind === spec.jobKind
          && candidate.slot.route && candidate.slot.route.id === spec.routeId
          ? candidate
          : null;
        const worldRecordId = descriptor
          ? stableRecordId(seed, CERES_ACTIVITY_SECTOR_ID, spec.recordKind,
              descriptor.slot.worldRecordSlotId)
          : null;
        return {
          spec,
          descriptor,
          worldRecordId,
          jobId: worldRecordId ? `job:${worldRecordId}` : null,
          entryRef: null,
          jobRef: null,
          routeRef: null,
          routeWaypointRefs: null,
          canonicalRoutePositions: null,
          canonicalSpeed: null,
          waypointRef: null,
          actorRef: null,
          actorDataRef: null,
          terminalEntryRef: null,
          terminalJobRef: null,
          terminalActorRef: null,
          terminalActorDataRef: null,
          targetRef: null,
          targetDataRef: null,
          targetMatches: 0,
          ambiguous: false,
          actorAmbiguous: false,
          actorAmbiguousRefs: null,
          targetAmbiguous: false,
          targetAmbiguousRefs: null,
        };
      }),
    };
    return this._ceresRealTargetAuthority;
  },

  _ensureCeresRealTargetAuthority() {
    const rawSeed = this.state && this.state.meta && this.state.meta.seed;
    const seed = (Number.isFinite(rawSeed) ? rawSeed : 1) >>> 0 || 1;
    const authority = this._ceresRealTargetAuthority;
    return authority && authority.seed === seed
      ? authority
      : this._resetCeresRealTargetAuthority();
  },

  _ceresRealTargetActorBinding(worldRecordId) {
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.worldRecordId === worldRecordId) return binding;
    }
    return null;
  },

  _ceresRealTargetJobBinding(jobId) {
    if (!jobId) return null;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId === jobId) return binding;
    }
    return null;
  },

  _hasUniqueCeresRealTargetActor(entity, worldRecordId) {
    if (!this._ceresRealTargetActorBinding(worldRecordId)) return true;
    let count = 0;
    let match = null;
    for (const candidate of this.state.entityList || []) {
      if (!candidate || candidate.alive === false || !candidate.data
        || candidate.data.worldRecordId !== worldRecordId
        || this.state.entities?.get(candidate.id) !== candidate) continue;
      count++;
      if (count === 1) match = candidate;
      if (count > 1) return false;
    }
    return count === 1 && match === entity && this.state.entities?.get(entity.id) === entity;
  },

  _collectCeresRealTargetActorCandidates(worldRecordId) {
    const candidates = [];
    for (const candidate of this.state.entityList || []) {
      if (!candidate || candidate.alive === false || !candidate.data
        || candidate.data.worldRecordId !== worldRecordId
        || this.state.entities?.get(candidate.id) !== candidate) continue;
      candidates.push(candidate);
      // Two exact refs are sufficient: only a two-way ambiguity can become unique after one
      // deletion. Larger malicious duplicate sets stay fail-closed until a retained contender is
      // removed and the bounded lifecycle seam re-counts them.
      if (candidates.length === 2) break;
    }
    return candidates;
  },

  _markCeresRealTargetActorAmbiguous(worldRecordId, candidates = null) {
    const authority = this._ensureCeresRealTargetAuthority();
    const contenderRefs = candidates || this._collectCeresRealTargetActorCandidates(worldRecordId);
    for (const binding of authority.bindings) {
      if (binding.worldRecordId === worldRecordId) {
        // Ambiguity must immediately disable every movement/target cache, but it does not transfer
        // terminal cleanup. Preserve only an identity that was admitted before the collision and
        // still proves the exact current canonical actor without consulting route shape.
        const retainTerminalAuthority = this._hasExactCeresRealTargetTerminalIdentity(
          binding,
          binding.terminalEntryRef,
          binding.terminalActorRef,
        );
        this._clearCeresRealTargetBinding(binding, !retainTerminalAuthority);
        binding.ambiguous = true;
        binding.actorAmbiguous = true;
        // Core's real destruction event is id/type-only and runs after Map deletion. Retain these
        // bounded seam-time objects so even a malformed wrong-type contender can identify the one
        // removal that may resolve ambiguity, without scanning on unrelated projectile deaths.
        binding.actorAmbiguousRefs = contenderRefs;
      }
    }
  },

  _worldRecordAllowsCeresJobActor(worldRecordId, recordKind = RECORD_KIND.CONVOY) {
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const record = records && records[worldRecordId];
    if (!record) return true;
    return record.recordId === worldRecordId
      && record.kind === recordKind
      && record.sectorId === CERES_ACTIVITY_SECTOR_ID
      && record.alive !== false
      && record.outcome !== 'destroyed'
      && record.outcome !== 'defeated';
  },

  _isExactCeresRealTargetActor(binding, entity, requireJobId = false) {
    const slot = binding && binding.descriptor && binding.descriptor.slot;
    if (!binding || !slot || !entity || entity.alive === false || entity.type !== 'ship'
      || !entity.data || this.state.entities?.get(entity.id) !== entity) return false;
    const data = entity.data;
    return data.worldRecordId === binding.worldRecordId
      && slot.id === binding.spec.actorSlotId
      && slot.worldRecordSlotId === binding.spec.worldRecordSlotId
      && slot.jobKind === binding.spec.jobKind
      && slot.route && slot.route.id === binding.spec.routeId
      && data.identityKey === binding.spec.worldRecordSlotId
      && data.activityActorSlotId === slot.id
      && this._hasCeresRealTargetOwnershipProof(binding, data)
      && (!requireJobId || data.jobId === binding.jobId)
      && this._hasExactCeresSectorAuthority(entity)
      && this._worldRecordAllowsCeresJobActor(binding.worldRecordId, binding.spec.recordKind);
  },

  /** Each admitted relationship proves its spawn owner with that owner's own markers, never the
   *  other's. An unknown ownership tag fails closed rather than defaulting to either family. */
  _hasCeresRealTargetOwnershipProof(binding, data) {
    const ownership = binding && binding.spec && binding.spec.ownership;
    if (ownership === CERES_TARGET_OWNERSHIP.TRAFFIC_CAST) {
      return data.ceresActivityCast === true && data.ceresActivityJobOwned === true;
    }
    if (ownership === CERES_TARGET_OWNERSHIP.FACTION_PRESENCE) {
      return data.durable === true
        && data.ceresActivityCast === undefined
        && data.ceresActivityJobOwned === undefined
        && !!data.factionPresence && data.factionPresence.yardTender === true;
    }
    return false;
  },

  _isCanonicalCeresRealTargetRoute(binding, route, speed) {
    const descriptor = binding && binding.descriptor;
    const slot = descriptor && descriptor.slot;
    const pocket = descriptor && descriptor.pocket;
    const marks = slot && slot.route && slot.route.marks;
    if (!binding || !slot || !pocket || !slot.route
      || slot.id !== binding.spec.actorSlotId
      || slot.worldRecordSlotId !== binding.spec.worldRecordSlotId
      || slot.jobKind !== binding.spec.jobKind
      || slot.route.id !== binding.spec.routeId
      || !Number.isFinite(slot.route.durationS) || slot.route.durationS <= 0
      || !Array.isArray(marks) || marks.length !== 2
      || !Array.isArray(route) || route.length !== marks.length) return false;
    let x0 = 0;
    let z0 = 0;
    let x1 = 0;
    let z1 = 0;
    let ownsTuple = false;
    for (let index = 0; index < marks.length; index++) {
      const mark = marks[index];
      const waypoint = route[index];
      if (!mark || !waypoint || waypoint.id !== mark.id || waypoint.label !== mark.id
        || waypoint.targetRef !== mark.targetRef || !waypoint.pos
        || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return false;
      const expected = sectorLocalToGlobalForSector({
        x: pocket.activityAnchor.localPos.x + mark.offset.x,
        z: pocket.activityAnchor.localPos.z + mark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (waypoint.pos.x !== expected.x || waypoint.pos.z !== expected.z) return false;
      if (index === 0) {
        x0 = expected.x;
        z0 = expected.z;
      } else {
        x1 = expected.x;
        z1 = expected.z;
      }
      if (waypoint.id === binding.spec.waypointId
        && waypoint.targetRef === binding.spec.targetRef) ownsTuple = true;
    }
    const canonicalSpeed = Math.hypot(x1 - x0, z1 - z0) / slot.route.durationS;
    return ownsTuple && Number.isFinite(canonicalSpeed) && canonicalSpeed > 0
      && speed === canonicalSpeed;
  },

  _isCanonicalCeresRealTargetSpec(binding, spec) {
    const slot = binding && binding.descriptor && binding.descriptor.slot;
    return !!slot && !!spec
      && spec.kind === binding.spec.jobKind
      && spec.sectorId === CERES_ACTIVITY_SECTOR_ID
      && this._isCanonicalCeresRealTargetRoute(binding, spec.route, spec.speed);
  },

  _hasExactCeresRealTargetEntryIdentity(binding, entry, entity, requireMaterialized = true) {
    const slot = binding && binding.descriptor && binding.descriptor.slot;
    const job = entry && entry.job;
    return !!binding && !!slot && !!entry && !!job && !!entity
      && job.schema === NPC_JOB_SCHEMA && job.id === binding.jobId
      && job.kind === slot.jobKind && job.corrupt !== true
      && (requireMaterialized ? job.materialized === true : job.materialized === false)
      && entry.kind === slot.jobKind && entry.sectorId === CERES_ACTIVITY_SECTOR_ID
      && entry.worldRecordId === binding.worldRecordId
      && (requireMaterialized
        ? (entry.entityId === entity.id && entity.data?.jobId === binding.jobId)
        : (entry.entityId == null && entity.data?.jobId == null))
      && this._byId()[binding.jobId] === entry
      && this._isExactCeresRealTargetActor(binding, entity, requireMaterialized);
  },

  _hasExactCeresRealTargetRetainedActor(binding, entry, entity) {
    return !!binding && !!entry && !!entry.job && !!entity && !!entity.data
      && binding.entryRef === entry
      && binding.jobRef === entry.job
      && binding.actorRef === entity
      && binding.actorDataRef === entity.data
      && this._hasExactCeresRealTargetEntryIdentity(binding, entry, entity, true);
  },

  _hasExactCeresRealTargetRetainedRoute(binding, entry) {
    const descriptor = binding && binding.descriptor;
    const slot = descriptor && descriptor.slot;
    const job = entry && entry.job;
    const marks = slot && slot.route && slot.route.marks;
    const route = job && job.route;
    const routeWaypointRefs = binding && binding.routeWaypointRefs;
    const canonicalRoutePositions = binding && binding.canonicalRoutePositions;
    if (!binding || !slot || !job || !slot.route
      || slot.id !== binding.spec.actorSlotId
      || slot.worldRecordSlotId !== binding.spec.worldRecordSlotId
      || slot.jobKind !== binding.spec.jobKind || slot.route.id !== binding.spec.routeId
      || binding.routeRef !== route || !Array.isArray(route) || route.length !== 2
      || !Array.isArray(marks) || marks.length !== 2
      || !Array.isArray(routeWaypointRefs) || routeWaypointRefs.length !== 2
      || !Array.isArray(canonicalRoutePositions) || canonicalRoutePositions.length !== 2
      || !Number.isInteger(job.routeIndex) || job.routeIndex < 0 || job.routeIndex >= route.length
      || !Number.isFinite(binding.canonicalSpeed) || binding.canonicalSpeed <= 0
      || job.speed !== binding.canonicalSpeed) return false;
    let ownsWaypoint = false;
    for (let index = 0; index < 2; index++) {
      const mark = marks[index];
      const waypoint = route[index];
      const canonicalPos = canonicalRoutePositions[index];
      if (!mark || !waypoint || routeWaypointRefs[index] !== waypoint || !canonicalPos
        || waypoint.id !== mark.id || waypoint.label !== mark.id
        || waypoint.targetRef !== mark.targetRef || !waypoint.pos
        || waypoint.pos.x !== canonicalPos.x || waypoint.pos.z !== canonicalPos.z) return false;
      if (binding.waypointRef === waypoint
        && waypoint.id === binding.spec.waypointId
        && waypoint.targetRef === binding.spec.targetRef) ownsWaypoint = true;
    }
    return ownsWaypoint;
  },

  _hasCeresRealTargetMovementAuthority(binding) {
    return !!binding && !!(binding.entryRef || binding.jobRef || binding.routeRef
      || binding.routeWaypointRefs || binding.canonicalRoutePositions || binding.waypointRef
      || binding.actorRef || binding.actorDataRef || binding.targetRef || binding.targetDataRef);
  },

  _hasRetainedCeresRealTargetMaterializedActor(jobId, entry, entity) {
    if (!jobId || !entry || !entity) return false;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId !== jobId) continue;
      if (this._hasExactCeresRealTargetTerminalIdentity(binding, entry, entity)
        || this._hasExactCeresRealTargetRetainedActor(binding, entry, entity)) return true;
    }
    return false;
  },

  _hasRetainedCeresRealTargetActorAmbiguity(jobId, entry, entity) {
    if (!jobId || !entry || !entity) return false;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId !== jobId || binding.actorAmbiguous !== true
        || !Array.isArray(binding.actorAmbiguousRefs)
        || !binding.actorAmbiguousRefs.some((candidate) => candidate === entity)) continue;
      if (this._hasExactCeresRealTargetEntryIdentity(binding, entry, entity, true)) return true;
    }
    return false;
  },

  _isCanonicalCeresRealTargetEntry(binding, entry, entity, requireMaterialized = true) {
    if (!this._hasExactCeresRealTargetEntryIdentity(binding, entry, entity, requireMaterialized)) {
      return false;
    }
    return this._isCanonicalCeresRealTargetRoute(binding, entry.job.route, entry.job.speed);
  },

  _hasCanonicalCeresRealTargetRoute(binding, entry, entity) {
    const descriptor = binding && binding.descriptor;
    const slot = descriptor && descriptor.slot;
    const pocket = descriptor && descriptor.pocket;
    const job = entry && entry.job;
    const marks = slot && slot.route && slot.route.marks;
    const route = job && job.route;
    if (!binding || !entry || !entity || !slot || !pocket || !job
      || !this._isCanonicalCeresRealTargetEntry(binding, entry, entity, true)
      || !slot.route || !Number.isFinite(slot.route.durationS) || slot.route.durationS <= 0
      || !Array.isArray(marks) || marks.length !== 2
      || !Array.isArray(route) || route.length !== marks.length
      || !Number.isInteger(job.routeIndex) || job.routeIndex < 0 || job.routeIndex >= route.length
      ) return false;
    let waypointRef = null;
    const routeWaypointRefs = [];
    const canonicalRoutePositions = [];
    for (let index = 0; index < marks.length; index++) {
      const mark = marks[index];
      const waypoint = route[index];
      if (!mark || !waypoint || waypoint.id !== mark.id || waypoint.label !== mark.id
        || waypoint.targetRef !== mark.targetRef || !waypoint.pos
        || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return false;
      const expected = sectorLocalToGlobalForSector({
        x: pocket.activityAnchor.localPos.x + mark.offset.x,
        z: pocket.activityAnchor.localPos.z + mark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (waypoint.pos.x !== expected.x || waypoint.pos.z !== expected.z) return false;
      routeWaypointRefs.push(waypoint);
      canonicalRoutePositions.push(expected);
      if (waypoint.id === binding.spec.waypointId
        && waypoint.targetRef === binding.spec.targetRef) waypointRef = waypoint;
    }
    const canonicalSpeed = Math.hypot(
      canonicalRoutePositions[1].x - canonicalRoutePositions[0].x,
      canonicalRoutePositions[1].z - canonicalRoutePositions[0].z,
    ) / slot.route.durationS;
    if (!waypointRef || !Number.isFinite(canonicalSpeed) || canonicalSpeed <= 0
      || job.speed !== canonicalSpeed) return false;
    binding.entryRef = entry;
    binding.jobRef = job;
    binding.routeRef = route;
    binding.routeWaypointRefs = routeWaypointRefs;
    binding.canonicalRoutePositions = canonicalRoutePositions;
    binding.canonicalSpeed = canonicalSpeed;
    binding.waypointRef = waypointRef;
    binding.actorRef = entity;
    binding.actorDataRef = entity.data;
    return true;
  },

  _isCeresRealTargetCandidate(binding, entity) {
    if (!binding || !entity || entity.alive === false || entity.type !== binding.spec.entityType
      || !entity.data || !entity.pos
      || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)
      || this.state.entities?.get(entity.id) !== entity
      || entity.data[binding.spec.identityField] !== binding.spec.identityValue
      || !this._hasExactCeresSectorAuthority(entity)) return false;
    return true;
  },

  _refreshCeresRealTargetsForEntry(entry, entity) {
    const authority = this._ensureCeresRealTargetAuthority();
    let actorBinding = null;
    for (const binding of authority.bindings) {
      if (this._byId()[binding.jobId] === entry) {
        actorBinding = binding;
        break;
      }
    }
    if (!actorBinding) return false;
    const uniqueActor = this._hasUniqueCeresRealTargetActor(entity, actorBinding.worldRecordId);
    const actorContenderRefs = !uniqueActor
      ? this._collectCeresRealTargetActorCandidates(actorBinding.worldRecordId)
      : null;
    let ownsBinding = false;
    for (const binding of authority.bindings) {
      if (binding.jobId !== actorBinding.jobId) continue;
      const retainTerminalAuthority = this._hasExactCeresRealTargetTerminalIdentity(
        binding,
        binding.terminalEntryRef,
        binding.terminalActorRef,
      );
      this._clearCeresRealTargetBinding(binding, !retainTerminalAuthority);
      if (!uniqueActor) {
        binding.ambiguous = true;
        binding.actorAmbiguous = true;
        binding.actorAmbiguousRefs = actorContenderRefs;
        continue;
      }
      if (this._hasExactCeresRealTargetEntryIdentity(binding, entry, entity, true)) {
        // Terminal cleanup authority is route-free and identity-only. A malformed route must disable
        // movement without making the exact actor keep a stale marker, while semantic reclassification
        // of that same object/data pair must still fail closed at release.
        binding.terminalEntryRef = entry;
        binding.terminalJobRef = entry.job;
        binding.terminalActorRef = entity;
        binding.terminalActorDataRef = entity.data;
      } else {
        binding.terminalEntryRef = null;
        binding.terminalJobRef = null;
        binding.terminalActorRef = null;
        binding.terminalActorDataRef = null;
      }
      if (this._hasCanonicalCeresRealTargetRoute(binding, entry, entity)) ownsBinding = true;
    }
    if (!ownsBinding || this.state.world?.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
    for (const candidate of this.state.entityList || []) {
      for (const binding of authority.bindings) {
        if (binding.entryRef !== entry || !this._isCeresRealTargetCandidate(binding, candidate)) continue;
        binding.targetMatches++;
        if (binding.targetMatches === 1) {
          binding.targetRef = candidate;
          binding.targetDataRef = candidate.data;
        } else {
          if (!Array.isArray(binding.targetAmbiguousRefs)) {
            binding.targetAmbiguousRefs = binding.targetRef ? [binding.targetRef] : [];
          }
          binding.targetAmbiguousRefs.push(candidate);
          binding.targetRef = null;
          binding.targetDataRef = null;
          binding.ambiguous = true;
          binding.targetAmbiguous = true;
        }
      }
    }
    return true;
  },

  _clearCeresRealTargetTerminalAuthorityForJob(jobId) {
    if (!jobId) return;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId !== jobId) continue;
      binding.terminalEntryRef = null;
      binding.terminalJobRef = null;
      binding.terminalActorRef = null;
      binding.terminalActorDataRef = null;
    }
  },

  _hasExactCeresRealTargetTerminalIdentity(binding, entry, entity) {
    return !!binding && !!entry && !!entry.job && !!entity && !!entity.data
      && binding.terminalEntryRef === entry
      && binding.terminalJobRef === entry.job
      && binding.terminalActorRef === entity
      && binding.terminalActorDataRef === entity.data
      && this._byId()[binding.jobId] === entry
      && entry.job.id === binding.jobId
      && this._hasExactCeresRealTargetEntryIdentity(binding, entry, entity, true);
  },

  _invalidateCeresRealTargetTerminalAuthorityIfReplaced(binding, entry, entity) {
    if (!binding || !entry || this._byId()[binding.jobId] !== entry) return;
    const authority = this._ensureCeresRealTargetAuthority();
    let retained = false;
    let exact = false;
    for (const candidate of authority.bindings) {
      if (candidate.jobId !== binding.jobId) continue;
      if (candidate.terminalEntryRef || candidate.terminalJobRef
        || candidate.terminalActorRef || candidate.terminalActorDataRef) retained = true;
      if (this._hasExactCeresRealTargetTerminalIdentity(candidate, entry, entity)) exact = true;
    }
    if (retained && !exact) this._clearCeresRealTargetTerminalAuthorityForJob(binding.jobId);
  },

  _clearCeresRealTargetBinding(binding, clearTerminalAuthority = false) {
    if (!binding) return;
    binding.entryRef = null;
    binding.jobRef = null;
    binding.routeRef = null;
    binding.routeWaypointRefs = null;
    binding.canonicalRoutePositions = null;
    binding.canonicalSpeed = null;
    binding.waypointRef = null;
    binding.actorRef = null;
    binding.actorDataRef = null;
    if (clearTerminalAuthority) {
      binding.terminalEntryRef = null;
      binding.terminalJobRef = null;
      binding.terminalActorRef = null;
      binding.terminalActorDataRef = null;
    }
    binding.targetRef = null;
    binding.targetDataRef = null;
    binding.targetMatches = 0;
    binding.ambiguous = false;
    binding.actorAmbiguous = false;
    binding.actorAmbiguousRefs = null;
    binding.targetAmbiguous = false;
    binding.targetAmbiguousRefs = null;
  },

  _clearCeresRealTargetsForJob(jobId, clearTerminalAuthority = false) {
    if (!jobId) return;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId !== jobId) continue;
      this._clearCeresRealTargetBinding(binding, clearTerminalAuthority);
    }
  },

  _clearCeresRealTargetsForEntry(entry, clearTerminalAuthority = false) {
    const authority = this._ensureCeresRealTargetAuthority();
    const entryJobId = entry && entry.job && entry.job.id;
    const exactCurrentEntry = !!entryJobId && this._byId()[entryJobId] === entry;
    for (const binding of authority.bindings) {
      if (binding.entryRef !== entry
        && !(exactCurrentEntry && binding.jobId === entryJobId
          && binding.worldRecordId === entry.worldRecordId)) continue;
      this._clearCeresRealTargetBinding(binding, clearTerminalAuthority);
    }
  },

  _hasRetainedCeresRealTargetReleaseActor(jobId, entry, entity) {
    if (!jobId || !entry || !entry.job || !entity || !entity.data) return false;
    const authority = this._ensureCeresRealTargetAuthority();
    for (const binding of authority.bindings) {
      if (binding.jobId !== jobId) continue;
      if (this._hasExactCeresRealTargetTerminalIdentity(binding, entry, entity)) return true;
    }
    return false;
  },

  _onCeresRealTargetSpawn(payload) {
    const entity = payload && payload.entity;
    if (!entity || this.state.world?.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return;
    const authority = this._ensureCeresRealTargetAuthority();
    const actorWorldRecordId = entity.data && entity.data.worldRecordId;
    const actorBinding = actorWorldRecordId
      ? this._ceresRealTargetActorBinding(actorWorldRecordId)
      : null;
    if (actorBinding && entity.alive !== false && this.state.entities?.get(entity.id) === entity
      && !this._hasUniqueCeresRealTargetActor(entity, actorWorldRecordId)) {
      // Establish ambiguity before exact actor/type/cast predicates. A malformed duplicate is still
      // a collision in the seed-derived durable identity and must invalidate the retained actor now,
      // even if no producer will ever call assign for that object.
      this._markCeresRealTargetActorAmbiguous(actorWorldRecordId);
      return;
    }
    for (const binding of authority.bindings) {
      if (!binding.entryRef || !this._isCeresRealTargetCandidate(binding, entity)) continue;
      // A spawn can arrive after a prior target was replaced or invalidated. Re-scan this one
      // fixed job at the lifecycle seam so an older surviving match cannot be hidden by the new
      // payload. Steady drive still consumes only the resulting exact object references.
      this._refreshCeresRealTargetsForEntry(binding.entryRef, binding.actorRef);
      return;
    }
  },

  _onCeresRealTargetGone(payload) {
    const id = payload && (payload.id != null ? payload.id : payload.entityId);
    const explicitEntity = payload && payload.entity;
    const mappedEntity = id != null && this.state.entities ? this.state.entities.get(id) : null;
    const authority = this._ensureCeresRealTargetAuthority();
    if (id != null) {
      // Core recycles the numeric id before flushing its destruction event. An earlier listener may
      // therefore spawn a different object at the same id. Compare the retained object identity to
      // the CURRENT map occupant first; never let the replacement hide the actual contender/target
      // loss, and never let its later death masquerade as a second loss of the retained object.
      let refreshedEntry = null;
      let refreshedJobId = null;
      for (const binding of authority.bindings) {
        const removedActorContender = binding.actorAmbiguous === true
          && Array.isArray(binding.actorAmbiguousRefs)
          && binding.actorAmbiguousRefs.some((candidate) => (
            candidate && candidate.id === id && mappedEntity !== candidate
          ));
        const removedTarget = binding.targetRef && binding.targetRef.id === id
          && mappedEntity !== binding.targetRef;
        const removedTargetContender = binding.targetAmbiguous === true
          && Array.isArray(binding.targetAmbiguousRefs)
          && binding.targetAmbiguousRefs.some((candidate) => (
            candidate && candidate.id === id && mappedEntity !== candidate
          ));
        if ((!removedActorContender && !removedTarget && !removedTargetContender)
          || binding.jobId === refreshedJobId) continue;
        let entry = binding.entryRef;
        let actor = binding.actorRef;
        if (!entry || !actor) {
          entry = this._byId()[binding.jobId];
          actor = entry && entry.entityId != null && this.state.entities
            ? this.state.entities.get(entry.entityId)
            : null;
          if (!this._hasExactCeresRealTargetEntryIdentity(binding, entry, actor, true)) continue;
        }
        if (!entry || !actor) continue;
        refreshedEntry = entry;
        refreshedJobId = binding.jobId;
        this._refreshCeresRealTargetsForEntry(entry, actor);
      }
      if (refreshedEntry) return;
    }
    const entity = explicitEntity || mappedEntity;
    // An id-only notification whose id currently belongs to a live replacement cannot describe that
    // replacement. Retained-identity loss was handled above; ignore everything else fail-closed.
    if (!explicitEntity && entity && entity.alive !== false) return;
    if (!entity) {
      // Core deletes the object before flushing its id/type-only destruction payload. Direct retained
      // ids identify the common actor/target case without a scan. An ambiguity has no retained target
      // id, so only a destruction matching the seam-retained contender identities may justify the
      // fixed bounded re-scan. Projectile and other unrelated deaths remain O(1) over these bindings.
      const type = payload && payload.type;
      let refreshedEntry = null;
      for (const binding of authority.bindings) {
        const actorAmbiguityMayResolve = binding.actorAmbiguous === true && id != null
          && Array.isArray(binding.actorAmbiguousRefs)
          && binding.actorAmbiguousRefs.some((candidate) => candidate && candidate.id === id);
        let entry = binding.entryRef;
        let actor = binding.actorRef;
        if ((!entry || !actor) && actorAmbiguityMayResolve) {
          // Actor ambiguity intentionally clears retained authority. Re-acquire only the exact
          // kernel-owned wrapper/hull pair; the subsequent refresh still proves uniqueness before
          // restoring authority.
          entry = this._byId()[binding.jobId];
          actor = entry && entry.entityId != null && this.state.entities
            ? this.state.entities.get(entry.entityId)
            : null;
          if (!this._hasExactCeresRealTargetEntryIdentity(binding, entry, actor, true)) continue;
        }
        if (!entry || !actor || entry === refreshedEntry) continue;
        const actorIdMatch = id != null && actor.id === id;
        const targetIdMatch = id != null && binding.targetRef && binding.targetRef.id === id;
        const targetAmbiguityMayResolve = binding.targetAmbiguous === true
          && id != null && type === binding.spec.entityType
          && Array.isArray(binding.targetAmbiguousRefs)
          && binding.targetAmbiguousRefs.some((candidate) => candidate && candidate.id === id);
        if (!actorIdMatch && !targetIdMatch
          && !actorAmbiguityMayResolve && !targetAmbiguityMayResolve) continue;
        refreshedEntry = entry;
        this._refreshCeresRealTargetsForEntry(entry, actor);
      }
      return;
    }
    const actorWorldRecordId = entity && entity.data && entity.data.worldRecordId;
    const actorBinding = actorWorldRecordId
      ? this._ceresRealTargetActorBinding(actorWorldRecordId)
      : null;
    if (actorBinding) {
      const entry = this._byId()[actorBinding.jobId];
      const actor = entry && entry.entityId != null && this.state.entities
        ? this.state.entities.get(entry.entityId)
        : null;
      if (entry && actor) this._refreshCeresRealTargetsForEntry(entry, actor);
    }
    for (const binding of authority.bindings) {
      const target = binding.targetRef;
      const identityMatch = entity && entity.type === binding.spec.entityType && entity.data
        && entity.data[binding.spec.identityField] === binding.spec.identityValue;
      const retainedMatch = target
        && ((entity && target === entity) || (!entity && target.id === id));
      if (!identityMatch && !retainedMatch) continue;
      const entry = binding.entryRef;
      const actor = binding.actorRef;
      if (retainedMatch) {
        binding.targetRef = null;
        binding.targetDataRef = null;
        binding.targetMatches = 0;
        binding.ambiguous = false;
        binding.targetAmbiguous = false;
        binding.targetAmbiguousRefs = null;
      }
      if (entry && actor) this._refreshCeresRealTargetsForEntry(entry, actor);
      return;
    }
  },

  _bindCeresFormationSlot(slot, entry, entity) {
    if (!slot) return;
    if (entry) {
      slot.entryRef = entry;
      slot.jobRef = entry.job || null;
    }
    if (entity) {
      slot.entityRef = entity;
      slot.dataRef = entity.data || null;
    }
  },

  _clearCeresFormationEntry(slot, entry) {
    if (!slot || (entry && slot.entryRef && slot.entryRef !== entry)) return;
    slot.entryRef = null;
    slot.jobRef = null;
  },

  _hasExactCeresSectorAuthority(entity) {
    if (!entity || !entity.data) return false;
    const data = entity.data;
    let present = false;
    if (entity.homeSectorId != null) {
      present = true;
      if (entity.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
    }
    if (data.homeSectorId != null) {
      present = true;
      if (data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
    }
    if (data.sectorId != null) {
      present = true;
      if (data.sectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
    }
    return present;
  },

  _isExactCeresFormationActor(entity, slot, requireJobId = false) {
    if (!entity || !slot || entity.alive === false || entity.type !== 'ship'
      || !entity.data || this.state.entities?.get(entity.id) !== entity) return false;
    const data = entity.data;
    return data.worldRecordId === slot.worldRecordId
      && data.activityActorSlotId === slot.slotId
      && data.ceresActivityCast === true
      && data.ceresActivityJobOwned === true
      && (!requireJobId || data.jobId === slot.jobId)
      && this._hasExactCeresSectorAuthority(entity);
  },

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
    this._resetCeresEscortAuthority();
    this._resetCeresRealTargetAuthority();
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
    const formationSlot = this._ceresFormationSlotForWorldRecordId(worldRecordId);
    const realTargetActor = this._ceresRealTargetActorBinding(worldRecordId);
    if (realTargetActor) {
      // Any live same-record contender makes the retained actor authority ambiguous, even when the
      // contender is itself malformed and will fail the exact actor/spec predicates below. Validate
      // uniqueness first so a bad duplicate cannot leave the previously bound hull authoritative.
      if (entity.alive === false || this.state.entities?.get(entity.id) !== entity) return null;
      if (!this._hasUniqueCeresRealTargetActor(entity, worldRecordId)) {
        this._markCeresRealTargetActorAmbiguous(worldRecordId);
        return null;
      }
      if (!this._isExactCeresRealTargetActor(realTargetActor, entity, false)
        || !this._isCanonicalCeresRealTargetSpec(realTargetActor, spec)) return null;
    }
    if (formationSlot) {
      if (!this._isExactCeresFormationActor(entity, formationSlot)
        || spec.kind !== formationSlot.kind) {
        formationSlot.ambiguous = true;
        return null;
      }
      const existing = byId[jobId];
      if (existing) {
        // A virtual job will be rebound by the existing rematerialization scan. Preserve that path;
        // a materialized same-id job, however, must still name this exact entity/data object.
        if (existing.entityId == null) {
          entity.data.jobId = jobId;
          return jobId;
        }
        const existingEntity = this.state.entities && this.state.entities.get(existing.entityId);
        if (existingEntity !== entity
          || (formationSlot.entryRef && formationSlot.entryRef !== existing)
          || (formationSlot.jobRef && formationSlot.jobRef !== existing.job)
          || (formationSlot.entityRef && formationSlot.entityRef !== entity)
          || (formationSlot.dataRef && formationSlot.dataRef !== entity.data)) {
          formationSlot.ambiguous = true;
          return null;
        }
        this._bindCeresFormationSlot(formationSlot, existing, entity);
        entity.data.jobId = jobId;
        return jobId;
      }
      if ((formationSlot.entityRef && formationSlot.entityRef !== entity)
        || (formationSlot.dataRef && formationSlot.dataRef !== entity.data)) {
        formationSlot.ambiguous = true;
        return null;
      }
    } else if (byId[jobId]) {
      const existing = byId[jobId];
      const existingEntity = existing.entityId != null && this.state.entities
        ? this.state.entities.get(existing.entityId)
        : null;
      if (realTargetActor) {
        this._invalidateCeresRealTargetTerminalAuthorityIfReplaced(
          realTargetActor,
          existing,
          entity,
        );
        if (existing.entityId == null) {
          if (!this._isCanonicalCeresRealTargetEntry(realTargetActor, existing, entity, false)) return null;
          return this._tryRelink(existing, finite(this.state.simTime, 0)) ? jobId : null;
        }
        if (existingEntity !== entity
          || !this._isCanonicalCeresRealTargetEntry(realTargetActor, existing, entity, true)) return null;
        const authority = this._ensureCeresRealTargetAuthority();
        for (const binding of authority.bindings) {
          if (binding.jobId !== jobId) continue;
          // A fully cleared cache may be re-admitted by this bounded producer seam. Any retained
          // object identity, however, is authoritative and must match exactly; scalar-equal wrapper
          // restoration cannot launder a replacement into the cache.
          if ((binding.entryRef && binding.entryRef !== existing)
            || (binding.jobRef && binding.jobRef !== existing.job)
            || (binding.actorRef && binding.actorRef !== entity)
            || (binding.actorDataRef && binding.actorDataRef !== entity.data)
            || (binding.routeRef && binding.routeRef !== existing.job.route)
            || (binding.terminalEntryRef && binding.terminalEntryRef !== existing)
            || (binding.terminalJobRef && binding.terminalJobRef !== existing.job)
            || (binding.terminalActorRef && binding.terminalActorRef !== entity)
            || (binding.terminalActorDataRef && binding.terminalActorDataRef !== entity.data)) return null;
        }
        this._refreshCeresRealTargetsForEntry(existing, entity);
        return jobId;
      }
      entity.data.jobId = jobId;
      return jobId; // unchanged ordinary idempotent assignment
    }

    let job;
    try {
      job = createJob({ ...spec, id: jobId }, (this.state.meta && this.state.meta.seed) || 0);
    } catch {
      return null; // an invalid route/kind is not fatal — the hull just keeps its ambient stepper
    }
    const sectorId = spec.sectorId
      || entity.data.sectorId || entity.homeSectorId
      || (this.state.world && this.state.world.currentSectorId) || null;
    const entry = {
      job,
      kind: job.kind,
      sectorId,
      worldRecordId,
      entityId: entity.id,
      lastAdvanceSimT: finite(this.state.simTime, 0),
      threatId: null,
    };
    if (realTargetActor && (job.schema !== NPC_JOB_SCHEMA || job.id !== jobId
      || job.kind !== realTargetActor.descriptor.slot.jobKind || job.corrupt === true
      || job.materialized !== true || sectorId !== CERES_ACTIVITY_SECTOR_ID
      || !this._isCanonicalCeresRealTargetRoute(realTargetActor, job.route, job.speed))) return null;
    byId[jobId] = entry;
    entity.data.jobId = jobId;
    if (formationSlot) this._bindCeresFormationSlot(formationSlot, entry, entity);
    this._refreshCeresRealTargetsForEntry(entry, entity);
    return jobId;
  },

  release(jobId) {
    const byId = this._byId();
    const entry = byId[jobId];
    if (!entry) return false;
    const realTargetJobBinding = this._ceresRealTargetJobBinding(jobId);
    let ent = entry.entityId != null && this.state.entities ? this.state.entities.get(entry.entityId) : null;
    if (ent && realTargetJobBinding
      && !this._hasRetainedCeresRealTargetReleaseActor(jobId, entry, ent)) {
      // Core may already have recycled the dead actor's numeric id. The job still ends, but cleanup
      // belongs only to the retained exact Ceres actor object/data (or its retained ambiguity ref),
      // never to an unrelated replacement that happens to occupy `entry.entityId` now.
      ent = null;
    }
    clearRouteBrake(ent);
    if (ent && ent.data && ent.data.jobId === jobId) delete ent.data.jobId;
    const formationSlot = this._ceresFormationSlotForWorldRecordId(entry.worldRecordId);
    if (formationSlot) this._clearCeresFormationEntry(formationSlot, entry);
    if (realTargetJobBinding) this._clearCeresRealTargetsForJob(jobId, true);
    else this._clearCeresRealTargetsForEntry(entry, true);
    delete byId[jobId];
    return true;
  },

  // ── PQ-019B: control leases ───────────────────────────────────────────────────────────────────
  //
  // A lease lets another owner (a heist pursuit) borrow the HULL of a real, already-existing job
  // without inventing a ship and without a second system writing its movement intent. This is what
  // makes "pursuit uses existing job-origin patrols" implementable: the patrol is genuinely the
  // patrol that was already flying its route, not a spawned prop wearing its name.
  //
  // The lease suspends this system's intent writing for that hull (see `update`) and nothing else.
  // The kernel job keeps advancing, so releasing hands back a job whose clock never lied.

  /**
   * Claim exclusive movement control of a job's hull.
   *
   * Idempotent per `claimId`: re-claiming with the same key returns the same claim. A DIFFERENT key
   * is refused while a claim is live — that refusal is the one-writer-per-hull rule, enforced rather
   * than documented.
   */
  claimControl(jobId, { claimId, holder = null } = {}) {
    const id = cleanClaimId(claimId);
    if (!id) return { granted: false, reason: 'invalid_claim_id', claim: null };
    const entry = this._byId()[jobId];
    if (!entry) return { granted: false, reason: 'no_job', claim: null };

    const existing = entry.control;
    if (existing) {
      if (existing.claimId === id) return { granted: true, claim: existing, resumed: true };
      return { granted: false, reason: 'already_claimed', claim: existing };
    }
    const entity = entry.entityId != null && this.state.entities
      ? this.state.entities.get(entry.entityId)
      : null;
    if (!entity || !entity.alive) {
      // A virtualized or destroyed job has no hull to hand over. Refusing is the honest answer;
      // granting would produce a lease over nothing that still had to be released later.
      return { granted: false, reason: 'hull_absent', claim: null };
    }

    entry.control = {
      claimId: id,
      holder: cleanClaimId(holder),
      claimedAtSimT: finite(this.state.simTime, 0),
      // The job state AT CLAIM. `phase` is the kernel's, recorded so a release can report whether
      // the borrowed job came back to the same work it left.
      claimedPhase: entry.job.phase,
      claimedEntityId: entity.id,
    };
    // A controller inherits the hull, not a retained route-brake command from this owner.
    clearRouteBrake(entity);
    // Any flee state belongs to the job's own reflex, which is suspended for the duration.
    entry.threatId = null;
    return { granted: true, claim: entry.control };
  },

  /**
   * Return the hull. Always safe to call: an unknown job, a released lease, or a hull that no longer
   * exists all resolve without leaving a claim behind, because a lease nobody can release is a
   * permanently frozen patrol.
   */
  releaseControl(jobId, claimId) {
    const id = cleanClaimId(claimId);
    const entry = this._byId()[jobId];
    if (!entry) return { released: false, reason: 'no_job', restored: false };
    const claim = entry.control;
    if (!claim) return { released: false, reason: 'not_claimed', restored: false };
    if (id && claim.claimId !== id) {
      return { released: false, reason: 'claim_mismatch', restored: false };
    }

    entry.control = null;
    const entity = entry.entityId != null && this.state.entities
      ? this.state.entities.get(entry.entityId)
      : null;
    if (!entity || !entity.alive) {
      // Fail safe: the lease is gone either way. The hull died or was demoted under the controller.
      return { released: true, reason: 'hull_absent', restored: false };
    }

    // Neutralize whatever the controller last wrote, so the hull cannot coast on a stale boost
    // vector for the one tick before this system's own drive resumes.
    this._writeIntent(entity, 0, 0, false, entity.rot || 0);

    // A job that finished while leased was deliberately NOT dropped by `update` (that would have let
    // the ambient stepper adopt a hull the controller was still writing). Complete the handback now.
    if (entry.job.phase === NPC_JOB_PHASE.COMPLETE) {
      this.release(jobId);
      return { released: true, reason: 'job_complete', restored: true, resumedPhase: null };
    }
    return { released: true, reason: null, restored: true, resumedPhase: entry.job.phase };
  },

  /** The live claim on a job, or null. */
  controlClaim(jobId) {
    const entry = this._byId()[jobId];
    return entry && entry.control ? entry.control : null;
  },

  /** How many hulls are currently leased. The packet's activeJobControlClaimsAfterTerminal reads this. */
  activeControlClaimCount() {
    const byId = this._byId();
    let count = 0;
    for (const jobId of Object.keys(byId)) if (byId[jobId] && byId[jobId].control) count++;
    return count;
  },

  /** Owner-facing scalar evidence for PERF-05; generic owner timing remains in perfRuntime. */
  threatQueryDiagnostics() {
    return threatQueryDiagnosticsSnapshot(this._threatQueries);
  },

  // ── per-tick drive ───────────────────────────────────────────────────────────────────────────
  update(dt, state) {
    if (state) this.state = state;
    const threatQueries = this._threatQueries
      || (this._threatQueries = createNearestEntityQueryService(this.state, {
        entityType: 'ship',
        team: 1,
        fallbackIndex: 'ships',
        eligible: eligibleActiveHostile,
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
      if (entry.control || entry.job.corrupt || entry.job.phase === NPC_JOB_PHASE.COMPLETE) continue;
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

      // PQ-019B control lease: while an external owner holds this hull, THIS system writes no
      // movement intent for it, so there is still exactly one intent writer per hull per tick. The
      // kernel keeps advancing regardless — suspending `advance` would stop the job's clock and
      // break the offscreen≈onscreen convergence proof, and the job's own schedule did not pause
      // just because a patrol got pulled onto an intercept.
      const claimedBeforeAdvance = !!entry.control;

      // Threat → flee interrupt / clear → resume (kernel-owned; we only drive the hull). The
      // civilian flee reflex writes job phase, so it must not fight the controller either.
      if (!claimedBeforeAdvance && threatRequest && threatRequest.sourceEntityId === entity.id) {
        this._reconcileThreatResult(entry, threatRequest.resultId);
      }

      // Materialized advance: one tick of dt. lastAdvanceSimT tracks global time for re-entry math.
      if (step > 0 && entry.job.phase !== NPC_JOB_PHASE.COMPLETE) advance(entry.job, step, this._sink);

      // An owner intent is synchronous and may invoke Continue/New Game while advance() is still on
      // this stack. Never timestamp, release, or drive an entry/entity captured from the old run.
      // Exact object identity matters: restored jobs and hulls may legitimately reuse both stable and
      // numeric ids. Re-read control after the sink as an external owner may also claim in-place.
      const currentEntry = this._byId()[jobId];
      const currentEntity = this.state.entities && this.state.entities.get(entry.entityId);
      if (currentEntry !== entry
        || currentEntity !== entity
        || entry.entityId !== entity.id
        || !entity.data
        || entity.data.jobId !== jobId) return;
      entry.lastAdvanceSimT = simT;
      const claimed = !!entry.control;

      // Terminal hauler: hand the hull back to its ambient stepper (ruling 5: job ends with entity).
      // NOT while leased: dropping the entry here would delete `data.jobId`, the ambient stepper
      // would adopt the hull, and it would be written by two owners at once. The lease outlives the
      // job; `releaseControl` completes the handback.
      if (entry.job.phase === NPC_JOB_PHASE.COMPLETE && !claimed) { this.release(jobId); continue; }

      if (!claimed) this._drive(entry, entity);
    }
  },

  // ── movement: replicate traffic's civilian intent write (single writer for job hulls) ─────────
  _writeIntent(entity, moveX, moveZ, boost, aimAngle, brake = false) {
    const data = entity.data || (entity.data = {});
    const intent = data.intent
      || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
    intent.moveX = moveX;
    intent.moveZ = moveZ;
    intent.boost = boost;
    intent.brake = brake === true;
    intent.fire = false;       // civilian job hulls NEVER open fire (hold_fire)
    intent.fireGroup = null;
    intent.aimAngle = aimAngle;
  },

  _ceresRealTargetWaypoint(job) {
    if (!job || !Array.isArray(job.route) || !Number.isInteger(job.routeIndex)) return null;
    let index = job.routeIndex;
    if (job.phase === NPC_JOB_PHASE.TRANSIT || job.phase === NPC_JOB_PHASE.RETURN) {
      // Mirrors the kernel's own targetIndex(): miner, salvor and tender are all two-point shuttles
      // that toggle between their endpoints, so the leg in progress heads for the OTHER waypoint.
      if (job.kind === NPC_JOB_KIND.MINER || job.kind === NPC_JOB_KIND.SALVOR
        || job.kind === NPC_JOB_KIND.TENDER) {
        index = job.routeIndex === 0 ? 1 : 0;
      } else if (job.kind === NPC_JOB_KIND.HAULER) {
        index = job.routeIndex + 1;
      } else {
        return null;
      }
    }
    return index >= 0 && index < job.route.length ? job.route[index] : null;
  },

  _currentCeresRealTargetBinding(entry, entity) {
    if (this.state.world?.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return null;
    const authority = this._ensureCeresRealTargetAuthority();
    let observedJobId = null;
    for (const binding of authority.bindings) {
      if (this._byId()[binding.jobId] === entry
        || binding.entryRef === entry || binding.terminalEntryRef === entry
        || binding.actorRef === entity || binding.terminalActorRef === entity) {
        observedJobId = binding.jobId;
        break;
      }
    }

    // Validate every retained object before asking whether the current phase has an applicable
    // waypoint. Otherwise an empty/out-of-range/replaced route (or a same-key entry wrapper) can
    // early-return while leaving authority that springs back to life when equal values are restored.
    // The job id is the immutable binding key; mutable entry/world-record scalars cannot bypass this
    // invalidation. Route-only loss preserves strict terminal cleanup identity, while any actor,
    // entry, job, or data replacement consumes both movement and terminal authority.
    if (!observedJobId) return null;
    let retainedMovement = false;
    for (const binding of authority.bindings) {
      if (binding.jobId !== observedJobId) continue;
      const hasTerminalAuthority = !!(binding.terminalEntryRef || binding.terminalJobRef
        || binding.terminalActorRef || binding.terminalActorDataRef);
      if (hasTerminalAuthority
        && !this._hasExactCeresRealTargetTerminalIdentity(binding, entry, entity)) {
        this._clearCeresRealTargetsForJob(observedJobId, true);
        return null;
      }
      if (!this._hasCeresRealTargetMovementAuthority(binding)) continue;
      retainedMovement = true;
      if (!hasTerminalAuthority
        || !this._hasExactCeresRealTargetRetainedActor(binding, entry, entity)) {
        this._clearCeresRealTargetsForJob(observedJobId, true);
        return null;
      }
      if (!this._hasExactCeresRealTargetRetainedRoute(binding, entry)) {
        this._clearCeresRealTargetsForJob(observedJobId, false);
        return null;
      }
    }
    if (!retainedMovement) return null;

    const job = entry && entry.job;
    const waypoint = this._ceresRealTargetWaypoint(job);
    if (!waypoint) return null;
    for (const binding of authority.bindings) {
      if (binding.jobId !== observedJobId || binding.entryRef !== entry
        || binding.jobRef !== job || binding.actorRef !== entity
        || binding.actorDataRef !== entity.data || binding.routeRef !== job.route
        || job.phase === NPC_JOB_PHASE.COMPLETE || binding.waypointRef !== waypoint
        || binding.ambiguous || waypoint.id !== binding.spec.waypointId
        || waypoint.targetRef !== binding.spec.targetRef) continue;
      const target = binding.targetRef;
      if (!target || binding.targetDataRef !== target.data
        || !this._isCeresRealTargetCandidate(binding, target)) {
        binding.targetRef = null;
        binding.targetDataRef = null;
        binding.targetMatches = 0;
        binding.ambiguous = false;
        binding.targetAmbiguous = false;
        binding.targetAmbiguousRefs = null;
        continue;
      }
      return binding;
    }
    return null;
  },

  _tryDriveCeresRealTarget(entry, entity) {
    const binding = this._currentCeresRealTargetBinding(entry, entity);
    if (!binding || !entity.pos || !Number.isFinite(entity.pos.x)
      || !Number.isFinite(entity.pos.z) || !Number.isFinite(entity.rot)) return false;
    const target = binding.targetRef;
    const dx = target.pos.x - entity.pos.x;
    const dz = target.pos.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance)) return false;

    // Collidable targets use their collision/dock envelope; non-colliding place roots use an authored
    // work berth rather than their broad visual radius (the Cathedral root radius is 360 WU). When a
    // restored/spawned hull begins inside its berth, the same controller drives outward instead of
    // freezing in overlap. All five targets are static; no hidden trajectory ownership is added.
    const actorRadius = Math.max(0, finite(entity.radius, 0));
    const targetRadius = Math.max(0, finite(target.radius, 0));
    let standoff = binding.spec.standoffWU;
    if (binding.spec.standoffKind === 'collision') {
      standoff = Math.max(standoff, actorRadius + targetRadius + 12);
    } else if (binding.spec.standoffKind === 'dock') {
      standoff = Math.max(
        standoff,
        finite(target.data && target.data.dockRadius, 0),
        actorRadius + targetRadius + 12,
      );
    }
    standoff = Math.max(1, finite(standoff, 1));
    const gap = distance - standoff;
    const error = Math.abs(gap);
    let directionX;
    let directionZ;
    if (distance > 0.0001) {
      const sign = gap >= 0 ? 1 : -1;
      directionX = sign * dx / distance;
      directionZ = sign * dz / distance;
    } else {
      directionX = Math.cos(entity.rot);
      directionZ = Math.sin(entity.rot);
    }
    const aim = Math.atan2(directionZ, directionX);

    const derivedPropulsion = entity.data && entity.data.derived && entity.data.derived.propulsion;
    const authoredPropulsion = derivedPropulsion || entity.propulsion
      || (entity.flightModel && entity.flightModel.propulsion);
    const velocity = entity.vel;
    const closingSpeed = velocity && Number.isFinite(velocity.x) && Number.isFinite(velocity.z)
      ? Math.max(0, velocity.x * directionX + velocity.z * directionZ)
      : 0;
    const brakeAccel = Math.max(
      1,
      finite(authoredPropulsion && authoredPropulsion.reverseAccel, 0),
      finite(authoredPropulsion && authoredPropulsion.mainAccel, 0) * 0.72,
    );
    const stoppingDistance = closingSpeed > 0
      ? (closingSpeed * closingSpeed) / (2 * brakeAccel)
      : 0;
    if (error <= 6 + stoppingDistance) {
      this._writeIntent(entity, 0, 0, false, aim, true);
      return true;
    }

    const governedSpeed = Math.max(1,
      finite(authoredPropulsion && authoredPropulsion.combatSpeed, entity.maxSpeed || 1));
    const deadInput = Math.max(0, finite(
      authoredPropulsion && authoredPropulsion.assist && authoredPropulsion.assist.deadInput,
      0.025,
    ));
    const minimumThrottle = clamp(deadInput + 0.001, 0, CERES_ESCORT_MAX_THROTTLE);
    if (Math.abs(shortestAngleDelta(aim, entity.rot)) > CERES_ESCORT_TURN_ONLY_RAD) {
      this._writeIntent(entity, 0, 0, false, aim, true);
      return true;
    }
    const plannedThrottle = clamp(
      Math.max(finite(entry.job.speed, 0) / governedSpeed, minimumThrottle),
      0,
      CERES_ESCORT_MAX_THROTTLE,
    );
    const closingThrottle = clamp(error / 120, minimumThrottle, CERES_ESCORT_MAX_THROTTLE);
    this._writeIntent(entity, 0, Math.max(plannedThrottle, closingThrottle), false, aim, false);
    return true;
  },

  _worldRecordAllowsCeresFormation(slot) {
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const record = records && records[slot.worldRecordId];
    if (!record) return true;
    return record.recordId === slot.worldRecordId
      && record.kind === RECORD_KIND.CONVOY
      && record.sectorId === CERES_ACTIVITY_SECTOR_ID
      && record.alive !== false
      && record.outcome !== 'destroyed'
      && record.outcome !== 'defeated';
  },

  _hasExactCeresFormationRoute(slot, job) {
    const authoredSlot = slot.slotId === CERES_ESCORT_SLOT_ID
      ? CERES_ESCORT_SLOT
      : (slot.slotId === CERES_ESCORT_WARD_SLOT_ID ? CERES_ESCORT_WARD_SLOT : null);
    const marks = authoredSlot && authoredSlot.route && authoredSlot.route.marks;
    const route = job && job.route;
    if (!Array.isArray(marks) || !Array.isArray(route) || route.length !== marks.length
      || !Number.isInteger(job.routeIndex) || job.routeIndex < 0 || job.routeIndex >= route.length
      || !Number.isFinite(job.speed) || job.speed <= 0) return false;
    for (let index = 0; index < marks.length; index++) {
      const mark = marks[index];
      const waypoint = route[index];
      if (!mark || !waypoint || waypoint.id !== mark.id || waypoint.label !== mark.id
        || waypoint.targetRef !== mark.targetRef || !waypoint.pos
        || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return false;
    }
    return true;
  },

  _isExactCeresFormationBinding(slot) {
    if (!slot || slot.ambiguous || !slot.entryRef || !slot.jobRef
      || !slot.entityRef || !slot.dataRef) return false;
    const entry = slot.entryRef;
    const job = slot.jobRef;
    const entity = slot.entityRef;
    if (this._byId()[slot.jobId] !== entry
      || entry.job !== job
      || entry.entityId !== entity.id
      || this.state.entities?.get(entry.entityId) !== entity
      || entity.data !== slot.dataRef
      || entry.kind !== slot.kind
      || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || entry.worldRecordId !== slot.worldRecordId
      || job.schema !== NPC_JOB_SCHEMA
      || job.id !== slot.jobId
      || job.kind !== slot.kind
      || job.corrupt === true
      || job.materialized !== true
      || job.phase === NPC_JOB_PHASE.COMPLETE
      || !legalFormationJobPhase(slot.kind, job.phase)
      || !this._hasExactCeresFormationRoute(slot, job)
      || !this._isExactCeresFormationActor(entity, slot, true)
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)
      || !this._worldRecordAllowsCeresFormation(slot)) return false;
    return true;
  },

  _tryDriveCeresEscortFormation(entry, entity) {
    const authority = this._ensureCeresEscortAuthority();
    const escort = authority.escort;
    const ward = authority.ward;
    if (!entry || entry !== escort.entryRef || entity !== escort.entityRef
      || entry.control || !this.state.world
      || this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID
      || !this._isExactCeresFormationBinding(escort)
      || !this._isExactCeresFormationBinding(ward)) return false;

    // The authored relationship must still be the current kernel waypoint. The stable ids above
    // establish WHO may form up; targetRef only proves that this exact route phase still asks for it.
    const routeIndex = entry.job.routeIndex;
    const route = entry.job.route;
    const authoredMarks = CERES_ESCORT_SLOT && CERES_ESCORT_SLOT.route
      && CERES_ESCORT_SLOT.route.marks;
    if (!Array.isArray(route) || !Array.isArray(authoredMarks)
      || route.length !== authoredMarks.length
      || !Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= route.length) return false;
    const waypoint = route[routeIndex];
    const authoredMark = authoredMarks[routeIndex];
    if (!waypoint || !authoredMark || waypoint.id !== authoredMark.id
      || waypoint.targetRef !== CERES_ESCORT_WARD_TARGET_REF
      || authoredMark.targetRef !== CERES_ESCORT_WARD_TARGET_REF) return false;

    const wardEntity = ward.entityRef;
    const velocity = wardEntity.vel;
    let wardSpeed = 0;
    let heading;
    if (velocity && Number.isFinite(velocity.x) && Number.isFinite(velocity.z)) {
      wardSpeed = Math.hypot(velocity.x, velocity.z);
    }
    if (wardSpeed > CERES_ESCORT_VELOCITY_EPSILON) {
      heading = Math.atan2(velocity.z, velocity.x);
    } else if (Number.isFinite(wardEntity.rot)) {
      heading = wardEntity.rot;
    } else {
      return false;
    }
    if (!Number.isFinite(entity.rot)) return false;

    const headingX = Math.cos(heading);
    const headingZ = Math.sin(heading);
    const targetX = wardEntity.pos.x - headingX * CERES_ESCORT_AFT_WU;
    const targetZ = wardEntity.pos.z - headingZ * CERES_ESCORT_AFT_WU;
    const dx = targetX - entity.pos.x;
    const dz = targetZ - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance)) return false;

    // Traffic publishes the exact Wasp's derived propulsion scalars. Read them directly here:
    // resolvePropulsionProfile legitimately merges partial authored profiles with fresh objects,
    // which is useful off the hot path but would violate this controller's zero-allocation tick.
    const derivedPropulsion = entity.data && entity.data.derived && entity.data.derived.propulsion;
    const authoredPropulsion = derivedPropulsion || entity.propulsion
      || (entity.flightModel && entity.flightModel.propulsion);
    const governedSpeed = Math.max(1,
      finite(authoredPropulsion && authoredPropulsion.combatSpeed, entity.maxSpeed || 1));
    const deadInput = Math.max(0, finite(
      authoredPropulsion && authoredPropulsion.assist && authoredPropulsion.assist.deadInput,
      0.025,
    ));
    const minimumThrottle = clamp(deadInput + 0.001, 0, CERES_ESCORT_MAX_THROTTLE);
    const wardThrottle = wardSpeed > CERES_ESCORT_VELOCITY_EPSILON
      ? clamp(Math.max(wardSpeed / governedSpeed, minimumThrottle), 0, CERES_ESCORT_MAX_THROTTLE)
      : 0;
    const escortVelocity = entity.vel;
    const escortForwardSpeed = escortVelocity
      && Number.isFinite(escortVelocity.x) && Number.isFinite(escortVelocity.z)
      ? escortVelocity.x * headingX + escortVelocity.z * headingZ
      : 0;
    const relativeOverspeed = wardSpeed > CERES_ESCORT_VELOCITY_EPSILON
      && escortForwardSpeed - wardSpeed > CERES_ESCORT_RELATIVE_OVERSPEED_WU_S;

    if (distance <= CERES_ESCORT_DEADBAND_WU) {
      const brake = wardSpeed <= CERES_ESCORT_VELOCITY_EPSILON || relativeOverspeed;
      this._writeIntent(entity, 0, brake ? 0 : wardThrottle, false, heading, brake);
      return true;
    }

    const aim = Math.atan2(dz, dx);
    if (Math.abs(shortestAngleDelta(aim, entity.rot)) > CERES_ESCORT_TURN_ONLY_RAD) {
      this._writeIntent(entity, 0, 0, false, aim, true);
      return true;
    }

    const plannedThrottle = Math.max(0, finite(entry.job.speed, 0)) > 0
      ? clamp(Math.max(entry.job.speed / governedSpeed, minimumThrottle), 0, CERES_ESCORT_MAX_THROTTLE)
      : 0;
    const catchupThrottle = clamp(
      (distance - CERES_ESCORT_DEADBAND_WU) / CERES_ESCORT_CATCHUP_WU,
      minimumThrottle,
      CERES_ESCORT_MAX_THROTTLE,
    );
    this._writeIntent(entity, 0,
      Math.max(wardThrottle, plannedThrottle, catchupThrottle), false, aim, false);
    return true;
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

    // R6 exact authored formation: all normal patrol phases follow the live ward. FLEE above and
    // the update-loop control-lease gate remain strict higher-precedence owners.
    if (this._tryDriveCeresEscortFormation(entry, entity)) return;

    // PQ-045 bounded real-target consumer. Only five exact, already-live Ceres relationships can
    // reach this branch; everything else retains the authored route controller below.
    if (this._tryDriveCeresRealTarget(entry, entity)) return;

    if (phase === NPC_JOB_PHASE.TRANSIT || phase === NPC_JOB_PHASE.RETURN) {
      const planned = routePosition(job);
      const target = this._targetWaypointPos(job);
      if (planned && target) {
        const dx = target.x - planned.x;
        const dz = target.z - planned.z;
        const remaining = Math.hypot(dx, dz);
        const speed = Math.max(0, finite(job.speed, 0));
        const profile = resolvePropulsionProfile(entity, this.state);
        const aim = remaining > 0.0001
          ? Math.atan2(dz, dx)
          : finite(job.heading, entity.rot || 0);

        if (profile && profile.family === DRIVE_FAMILIES.SAIL) {
          // A field sail's positive throttle is environmental acceleration along the field vector,
          // not a speed command and not necessarily aligned with this authored route. Its negative
          // throttle is the family-authored local trim thruster. Fly a deterministic planned
          // trapezoid with that trim: pre-align opposite the leg, accelerate no longer than
          // job.speed / trimAccel, coast, rotate without thrust, then apply the symmetric
          // counter-trim. This bounds peak physical speed without consulting or mutating the live
          // pose/velocity, and leaves the kernel as the only route progress/clock owner.
          const progress = clamp(finite(job.progress, 0), 0, 1);
          const totalDistance = progress < 1 - 1e-9
            ? remaining / Math.max(1e-9, 1 - progress)
            : remaining;
          const durationS = speed > 0 ? totalDistance / speed : 0;
          const elapsedS = durationS * progress;
          const remainingS = Math.max(0, durationS - elapsedS);
          const trimAccel = Math.max(0.001, finite(profile.trimAccel, 0));
          const yawRate = Math.max(0.001, finite(profile.maxYawRate, 0));
          const yawAccel = Math.max(0.001, finite(profile.yawAccel, 0));
          const turnS = Math.min(durationS * 0.25,
            Math.PI / yawRate + yawRate / yawAccel);
          const burnS = Math.min(speed / trimAccel,
            Math.max(0, durationS * 0.5 - turnS));
          const accelerating = burnS > 0
            && elapsedS >= turnS
            && elapsedS < turnS + burnS;
          const braking = burnS > 0 && remainingS <= burnS;
          const turningToBrake = !braking && remainingS <= turnS + burnS;
          const trim = accelerating || braking ? -1 : 0;
          const trimAim = turningToBrake || braking ? aim : aim + Math.PI;
          this._writeIntent(entity, 0, trim, false, trimAim, false);
          return;
        }

        const governedSpeed = Math.max(1, finite(profile && profile.combatSpeed, 1));
        const deadInput = Math.max(0, finite(profile && profile.assist && profile.assist.deadInput, 0.025));
        // Assisted Flight V3 treats forward throttle as a speed command. Keep the command just above
        // its authored dead zone for unusually slow routes; otherwise job.speed maps directly to the
        // drive's combat-speed envelope. No physical pose/velocity participates in route authority.
        const throttle = speed > 0
          ? clamp(Math.max(speed / governedSpeed, deadInput + 0.001), 0, 1)
          : 0;
        const brake = speed > 0 && remaining <= speed * ROUTE_BRAKE_WINDOW_S;
        this._writeIntent(entity, 0, brake ? 0 : throttle, false, aim, brake);
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
      let ent = entry.entityId != null && this.state.entities ? this.state.entities.get(entry.entityId) : null;
      const realTargetJobBinding = this._ceresRealTargetJobBinding(jobId);
      if (ent && realTargetJobBinding
        && !this._hasRetainedCeresRealTargetReleaseActor(jobId, entry, ent)) {
        // Exit virtualizes the authoritative job regardless, but actor cleanup belongs only to the
        // previously admitted exact object/data identity. A same-id clone or in-place semantic
        // reclassification is foreign authority and must keep its marker/brake byte-for-byte.
        ent = null;
      }
      clearRouteBrake(ent);
      if (ent && ent.data && ent.data.jobId === jobId) delete ent.data.jobId;
      virtualize(entry.job);
      entry.entityId = null;
      entry.threatId = null;
    }
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
      this._resetCeresEscortAuthority();
      this._resetCeresRealTargetAuthority();
    }
  },

  _onSectorEnter(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // Exit, deserialize/newGame, and seed changes own hard cache resets. Enter is a bounded
    // revalidation seam, including same-sector continuous handoffs; resetting here would erase a
    // previously admitted terminal identity before a persistent actor ambiguity can preserve it.
    // Re-link is done lazily in update() once the producer has rematerialized the hulls this tick;
    // an immediate pass here also catches hulls already present (continuous handoff).
    const simT = finite(this.state.simTime, 0);
    const byId = this._byId();
    for (const jobId of Object.keys(byId)) {
      const entry = byId[jobId];
      if (!entry || entry.sectorId !== sectorId) continue;
      if (entry.entityId == null) {
        this._tryRelink(entry, simT);
        continue;
      }
      const entity = this.state.entities && this.state.entities.get(entry.entityId);
      const realTargetBinding = this._ceresRealTargetJobBinding(jobId);
      if (entity && realTargetBinding
        && !this._hasRetainedCeresRealTargetMaterializedActor(jobId, entry, entity)) {
        if (this._hasRetainedCeresRealTargetActorAmbiguity(jobId, entry, entity)) {
          // A spawn seam may already have recorded this exact actor plus a malformed durable-record
          // contender. Preserve that fail-closed ambiguity for the real removal event, but do not use
          // enter to scan, admit terminal identity, or restore movement while uniqueness is false.
          // A same-key entry/job wrapper replacement must still consume pre-ambiguity terminal refs;
          // restoring the old wrappers later cannot revive authority without a legitimate seam.
          this._invalidateCeresRealTargetTerminalAuthorityIfReplaced(
            realTargetBinding,
            entry,
            entity,
          );
          continue;
        }
        // Same-sector enter may revalidate only an already-admitted materialized actor. A semantic
        // clone at the same numeric id cannot bootstrap authority from equal values; first admission
        // remains producer assignment, or virtual relink after a real lifecycle reset.
        this._clearCeresRealTargetsForJob(jobId, true);
        continue;
      }
      if (entity) this._refreshCeresRealTargetsForEntry(entry, entity);
    }
  },

  /** Find the rematerialized hull for a virtual job (by worldRecordId), advance the away time, materialize. */
  _tryRelink(entry, simT) {
    const entity = this._findEntityByRecordId(entry.worldRecordId);
    if (!entity) return false;
    const formationSlot = this._ceresFormationSlotForWorldRecordId(entry.worldRecordId);
    const realTargetActor = this._ceresRealTargetActorBinding(entry.worldRecordId);
    if (realTargetActor) {
      if (!this._isCanonicalCeresRealTargetEntry(realTargetActor, entry, entity, false)) return false;
      const authority = this._ensureCeresRealTargetAuthority();
      for (const binding of authority.bindings) {
        if (binding.jobId !== realTargetActor.jobId) continue;
        if ((binding.entryRef && binding.entryRef !== entry)
          || (binding.jobRef && binding.jobRef !== entry.job)
          || (binding.actorRef && binding.actorRef !== entity)
          || (binding.actorDataRef && binding.actorDataRef !== entity.data)
          || (binding.routeRef && binding.routeRef !== entry.job.route)) return false;
      }
    }
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
      clearRouteBrake(entity);
      if (entity.data && entity.data.jobId === ('job:' + entry.worldRecordId)) delete entity.data.jobId;
      if (formationSlot) this._clearCeresFormationEntry(formationSlot, entry);
      delete this._byId()['job:' + entry.worldRecordId];
      return true;
    }
    materialize(entry.job);
    entry.entityId = entity.id;
    entry.threatId = null;
    clearRouteBrake(entity);
    entity.data.jobId = 'job:' + entry.worldRecordId;
    if (formationSlot) this._bindCeresFormationSlot(formationSlot, entry, entity);
    this._refreshCeresRealTargetsForEntry(entry, entity);
    return true;
  },

  _findEntityByRecordId(worldRecordId) {
    if (!worldRecordId) return null;
    const list = this.state.entityList || [];
    const formationSlot = this._ceresFormationSlotForWorldRecordId(worldRecordId);
    const realTargetActor = this._ceresRealTargetActorBinding(worldRecordId);
    if (formationSlot || realTargetActor) {
      // This is the existing bounded rematerialization scan. Scan to the end only for the two exact
      // formation identities and the three admitted real-target actors so duplicates cannot be hidden
      // by first-match order. Steady drive never scans; it consumes the identities established here.
      if (formationSlot) {
        formationSlot.entryRef = null;
        formationSlot.jobRef = null;
        formationSlot.entityRef = null;
        formationSlot.dataRef = null;
        formationSlot.ambiguous = false;
      }
      let match = null;
      let count = 0;
      for (const entity of list) {
        if (!entity || !entity.alive || !entity.data
          || entity.data.worldRecordId !== worldRecordId
          || this.state.entities?.get(entity.id) !== entity) continue;
        count++;
        if (count === 1) match = entity;
      }
      if (count !== 1) {
        if (formationSlot) formationSlot.ambiguous = count > 1;
        if (realTargetActor && count > 1) this._markCeresRealTargetActorAmbiguous(worldRecordId);
        return null;
      }
      if (realTargetActor && !this._isExactCeresRealTargetActor(realTargetActor, match, false)) {
        return null;
      }
      if (formationSlot) {
        formationSlot.entityRef = match;
        formationSlot.dataRef = match.data;
      }
      return match;
    }
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
        //
        // PQ-019B: `control` is deliberately NOT persisted either, for the same reason one step
        // further on. A lease is a LIVE relationship between a controller and a hull. After a load
        // `deserialize` virtualizes every job and nulls every entityId, so a restored lease would
        // name a hull that does not exist yet and a controller that no longer exists at all —
        // nobody left alive to release it. That is a permanently frozen patrol. Dropping the lease
        // on load is the only fail-safe answer, and it is why activeJobControlClaimsAfterTerminal
        // is trivially 0 across any reload.
        lastAdvanceSimT: finite(entry.lastAdvanceSimT, 0),
      };
    }
    return out;
  },

  deserialize(data) {
    // World re-entry happens before this restore step. An outgoing virtual job can therefore
    // briefly re-link to an incoming durable hull during the earlier sector:enter. The saved bag
    // below is authoritative; clear every live marker owned by this runtime before replacing it,
    // then save:loaded will re-link only jobs that actually exist in the incoming envelope.
    this._resetCeresEscortAuthority();
    this._resetCeresRealTargetAuthority();
    for (const entity of this.state.entityList || []) {
      if (entity && entity.data && typeof entity.data.jobId === 'string'
        && entity.data.jobId.startsWith('job:')) {
        clearRouteBrake(entity);
        delete entity.data.jobId;
      }
    }
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
