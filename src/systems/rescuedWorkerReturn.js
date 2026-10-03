// SF-156 — a rescued worker who returns to work. PB-CONS-B aftermath pair, half one.
//
// A crewed worker hull that is destroyed may eject a causal survivor pod (survivorPod owns the
// eject roll, the oxygen window, the tow and the rescue/ransom/abandon resolution). Resolution
// today ends the story at a rep intent and a moral-memory note. This module turns a COMPLETED
// rescue into a later visible workplace difference: the same person — one durable world record,
// same role, same workplace route — comes back to their actual job. Never a generic respawn,
// never a second person wearing the mask.
//
// Identity law (same law as the Choir relief crew in choirReliefBerth.js):
//   • one durable person record per rescue, keyed by a seed-frozen personKey that survives
//     save/restore because it lives in the uniqueWrecks bag (owner-persisted);
//   • one physical hull per record, found again through its worldRecordId when the near entity
//     table loses it, never duplicated, never respawned dead;
//   • the return re-enters through the job kernel with the SAME workplace route the victim was
//     working when they died — a miner returns to their field, a hauler to their lane;
//   • ransom and abandonment close the record without a return; a returned worker's death is
//     final (outcome 'lost'), so no immortal mission NPC exists.
//
// Consequences stay with their owners: this module writes only its own record state and emits
// advisory events/toasts. It never writes credits, reputation, heat or cargo.
import { makeShipEntitySpec } from './ships.js';
import { SHIPS } from '../data/ships.js';
import { hash32 } from '../core/rng.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';

// makeShipEntitySpec silently falls back to ship_kestrel for an unknown defId — a return must
// never come back as a kestrel wearing a person's record, so spawnable ids are validated here.
const SPAWNABLE_SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));

export const RESCUED_WORKERS_SCHEMA = 'spaceface.rescuedWorkers.v1';

// The return is a later beat, not a teleport: a state.rng-jittered gap after the rescue lands
// (same rhythm shape as the Choir relief runners), so the player can meet the person at work
// on a return visit rather than watch them pop back mid-scene.
export const RETURN_MIN_S = 45;
export const RETURN_SPREAD_S = 30;

// Bounded cast: at most this many person records are retained (oldest closed record is
// recycled first), and at most this many victim fingerprints wait for their pod receipt.
export const RESCUED_WORKER_MAX_RECORDS = 8;
const PENDING_MAX = 8;
const PENDING_TTL_S = 600;

const ROLE_LABELS = {
  miner: 'Miner', hauler: 'Hauler', salvor: 'Salvor', tender: 'Tender',
  courier: 'Courier', patrol: 'Patrol', surveyor: 'Surveyor',
};

const simNowOf = (state) => Math.max(0, Number(state.simTime) || 0);
const finiteOr = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const clonePlain = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

/**
 * The victim's own public identity, carried on the person record so the returned hull is the
 * SAME person the player scanned before — a named lane contact keeps her callsign and her
 * contact stamp (no duplicate picked onto a second hull); an unnamed worker stays unnamed.
 */
function normalizePersona(value) {
  if (!value || typeof value !== 'object') return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;
  const callsign = typeof value.callsign === 'string' && value.callsign.trim()
    ? value.callsign.trim() : null;
  const namedLaneContactId = typeof value.namedLaneContactId === 'string'
    && value.namedLaneContactId ? value.namedLaneContactId : null;
  if (!name && !callsign && !namedLaneContactId) return null;
  return { name, callsign, namedLaneContactId };
}

/** The captured workplace: the job spec pieces needed to re-enter the SAME job. */
function normalizeWorkplace(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.kind == null || !Array.isArray(value.route) || value.route.length < 2) return null;
  return {
    kind: String(value.kind),
    route: clonePlain(value.route),
    speed: finiteOr(value.speed, 60) ?? 60,
    sectorId: value.sectorId != null ? String(value.sectorId) : null,
    commissionS: finiteOr(value.commissionS),
    departS: finiteOr(value.departS),
    approachS: finiteOr(value.approachS),
    workS: finiteOr(value.workS),
    loadS: finiteOr(value.loadS),
    unloadS: finiteOr(value.unloadS),
    dwellS: finiteOr(value.dwellS),
  };
}

/** Additive-with-defaults record normalize, so pre-module saves read clean (choir precedent). */
export function normalizeRescuedWorkers(value) {
  const source = value && typeof value === 'object' ? value : {};
  const people = source.people && typeof source.people === 'object' ? source.people : {};
  const normalized = {};
  for (const [key, raw] of Object.entries(people)) {
    if (!raw || typeof raw !== 'object') continue;
    normalized[key] = {
      personKey: String(key),
      worldRecordId: raw.worldRecordId != null ? String(raw.worldRecordId) : String(key),
      memoryId: raw.memoryId != null ? String(raw.memoryId) : null,
      victimId: raw.victimId != null ? String(raw.victimId) : null,
      role: raw.role != null ? String(raw.role) : 'worker',
      defId: raw.defId != null ? String(raw.defId) : null,
      factionId: raw.factionId != null ? String(raw.factionId) : null,
      team: Number.isFinite(Number(raw.team)) ? Number(raw.team) : 2,
      workplace: normalizeWorkplace(raw.workplace),
      persona: normalizePersona(raw.persona),
      sectorId: raw.sectorId != null ? String(raw.sectorId) : null,
      ejectedAtS: finiteOr(raw.ejectedAtS, 0) ?? 0,
      rescuedAtS: finiteOr(raw.rescuedAtS),
      returnDueAtS: finiteOr(raw.returnDueAtS),
      returnedAtS: finiteOr(raw.returnedAtS),
      lostAtS: finiteOr(raw.lostAtS),
      closedAtS: finiteOr(raw.closedAtS),
      returnedEntityId: raw.returnedEntityId != null ? Number(raw.returnedEntityId) : null,
      // The rescue is acknowledged in the person's own voice exactly once, then the latch
      // closes — durable across save/Continue so replays never re-hear the thank-you.
      hailAcknowledgedAtS: finiteOr(raw.hailAcknowledgedAtS),
      outcome: raw.outcome != null ? String(raw.outcome) : 'adrift',
    };
  }
  return {
    schemaVersion: RESCUED_WORKERS_SCHEMA,
    people: normalized,
  };
}

export function createRescuedWorkerReturn(owner) {
  const { state, helpers, bus } = owner;

  // Transient joins only (never identity): victim fingerprints waiting for a pod receipt, and
  // an entity-id cache for the re-found hulls. Both are rebuilt from durable state after a load.
  const pending = new Map();
  const actors = new Map();

  const own = () => {
    const bag = owner._ensureState();
    return bag.rescuedWorkers || (bag.rescuedWorkers = normalizeRescuedWorkers());
  };
  const recordOf = (personKey) => own().people[personKey] || null;

  const prunePending = (now) => {
    for (const [key, entry] of pending) {
      if (entry.killedAtS != null && now - entry.killedAtS > PENDING_TTL_S) pending.delete(key);
    }
    while (pending.size > PENDING_MAX) {
      const oldest = [...pending.entries()].sort((a, b) => a[1].killedAtS - b[1].killedAtS)[0];
      pending.delete(oldest[0]);
    }
  };

  const pruneRecords = () => {
    const people = own().people;
    const byOldest = (keys) => keys.sort((a, b) => (people[a].ejectedAtS || 0) - (people[b].ejectedAtS || 0));
    const isOpen = (key) => {
      const rec = people[key];
      return rec.outcome === 'adrift' || rec.outcome === 'rescued';
    };
    // Trim TO the cap: closed records recycle first; if none are closed, the oldest open
    // record yields (bounded residency outranks a pending return that has not landed).
    while (Object.keys(people).length > RESCUED_WORKER_MAX_RECORDS) {
      const closed = byOldest(Object.keys(people).filter((key) => !isOpen(key)));
      const oldest = closed[0] || byOldest(Object.keys(people))[0];
      if (oldest == null) break;
      delete people[oldest];
    }
  };

  const actor = (record) => {
    const cached = actors.get(record.personKey);
    if (cached?.alive && cached.alive !== false && state.entities.get(cached.id) === cached) return cached;
    const found = indexedWorldRecordEntity(state, record.worldRecordId);
    if (found) actors.set(record.personKey, found);
    return found || null;
  };

  const personKeyFor = (victimId) =>
    `rescued-worker:${state.meta?.seed || 1}:${hash32(state.meta?.seed || 1, String(victimId), 'rescuedWorker').toString(36)}`;

  // One identity stamp for the fresh return hull AND a re-found world-resident hull: the person
  // key, this owner, and the victim's own name/callsign/contact stamp when they had one. The
  // contact id also rides in data.ai so a durable-record rebind (record.ai is captured) can heal
  // the live stamp — the label follows the stable worker record (NXI-165).
  const stampIdentity = (entity, record) => {
    if (!entity || !entity.data) return;
    const d = entity.data;
    d.rescuedWorkerPerson = record.personKey;
    d.persistenceOwner = 'uniqueWrecks:rescuedWorkers';
    const persona = record.persona;
    if (persona) {
      if (persona.name) d.name = persona.name;
      if (persona.callsign) d.callsign = persona.callsign;
      if (persona.namedLaneContactId) {
        d.namedLaneContactId = persona.namedLaneContactId;
        if (d.ai && typeof d.ai === 'object') d.ai.namedLaneContactId = persona.namedLaneContactId;
      }
    }
    const who = persona && (persona.callsign || persona.name);
    d.scanLabel = who
      ? `${String(who).toUpperCase()} · BACK AT WORK`
      : `${ROLE_LABELS[record.role] || 'Crew'} · returned to work`;
  };

  // ── capture: who just died, and what was their actual job? ────────────────────────────────
  // Runs on entity:killed. A dying RETURNED worker routes to the loss path first — their own
  // record closes 'lost', no new capture, no second person wearing the same world record. For
  // everyone else, the uniqueWrecks host registers before npcJobsRuntime, so the victim's job
  // entry is still readable here; the kernel ends the job later in the same emit.
  function killed(payload) {
    if (!payload || payload.id == null) return;
    const now = simNowOf(state);
    // The join is the durable returnedEntityId, with the hull's stamped person key as the
    // second witness (numeric entity ids recycle; the record and the stamp do not).
    const dyingEntity = state.entities?.get?.(payload.id);
    const returnedRecord = dyingEntity?.data?.rescuedWorkerPerson
      ? recordOf(String(dyingEntity.data.rescuedWorkerPerson))
      : Object.values(own().people).find((rec) => rec.returnedEntityId === payload.id) || null;
    if (returnedRecord) {
      noteReturnedLoss(returnedRecord, now);
      return;
    }
    if (!helpers?.npcJobs?.get) return;
    const victim = dyingEntity;
    const data = victim?.data;
    if (!data?.jobId) return;
    const entry = helpers.npcJobs.get(data.jobId);
    const job = entry?.job;
    if (!job || job.corrupt) return;
    pending.set(String(payload.id), {
      killedAtS: simNowOf(state),
      worldRecordId: data.worldRecordId != null ? String(data.worldRecordId) : null,
      role: job.kind,
      defId: data.defId != null ? String(data.defId) : null,
      factionId: victim.factionId || data.factionId || null,
      team: Number.isFinite(Number(victim.team)) ? Number(victim.team) : 2,
      sectorId: entry.sectorId != null ? String(entry.sectorId) : null,
      persona: normalizePersona({
        name: data.name,
        callsign: data.callsign,
        namedLaneContactId: data.namedLaneContactId,
      }),
      workplace: normalizeWorkplace({
        kind: job.kind,
        route: job.route,
        speed: job.speed,
        sectorId: entry.sectorId,
        commissionS: job.commissionS,
        departS: job.departS,
        approachS: job.approachS,
        workS: job.workS,
        loadS: job.loadS,
        unloadS: job.unloadS,
        dwellS: job.dwellS,
      }),
    });
    prunePending(simNowOf(state));
  }

  // Open the one person record for a captured worker fingerprint. Idempotent per personKey.
  const openRecord = (victimId, fingerprint, now) => {
    const personKey = personKeyFor(victimId);
    if (recordOf(personKey)) return recordOf(personKey);
    own().people[personKey] = {
      personKey,
      worldRecordId: fingerprint.worldRecordId || personKey,
      memoryId: null,
      victimId: victimId != null ? String(victimId) : null,
      role: fingerprint.role || 'worker',
      defId: fingerprint.defId,
      factionId: fingerprint.factionId,
      team: fingerprint.team,
      workplace: fingerprint.workplace,
      persona: fingerprint.persona || null,
      sectorId: fingerprint.sectorId,
      ejectedAtS: now,
      rescuedAtS: null,
      returnDueAtS: null,
      returnedAtS: null,
      lostAtS: null,
      closedAtS: null,
      returnedEntityId: null,
      hailAcknowledgedAtS: null,
      outcome: 'adrift',
    };
    pruneRecords();
    return recordOf(personKey);
  };

  // ── correlate: a pod exists for this victim — open the person record ─────────────────────
  function podEjected(payload) {
    if (!payload || payload.victimId == null) return;
    const fingerprint = pending.get(String(payload.victimId));
    if (!fingerprint) return; // not a captured worker — no fabricated identity, no record
    pending.delete(String(payload.victimId));
    openRecord(payload.victimId, fingerprint, simNowOf(state));
  }

  // ── resolve: the pod reached a station, a fence, or the void ──────────────────────────────
  function podResolved(payload) {
    if (!payload) return;
    const now = simNowOf(state);
    const people = own().people;
    // First receipt for a person joins by victimId (the record's memoryId is only learned here);
    // later replays of the same receipt join by memoryId, which makes the idempotency exact.
    let record = payload.id != null
      ? Object.values(people).find((rec) => rec.memoryId === String(payload.id)) || null
      : null;
    if (!record && payload.victimId != null) {
      record = Object.values(people).find((rec) => rec.outcome === 'adrift'
        && rec.victimId === String(payload.victimId)) || null;
      if (!record) {
        // Receipt without an observed eject (listener joined mid-flight): the person exists only
        // if their fingerprint was captured. Without a captured workplace there is no REAL job to
        // return to, so no record is opened — a generic respawn is exactly what this packet forbids.
        const fingerprint = pending.get(String(payload.victimId));
        if (fingerprint) {
          pending.delete(String(payload.victimId));
          record = openRecord(payload.victimId, fingerprint, now);
        }
      }
    }
    if (!record || record.outcome !== 'adrift') return; // once per transition, idempotent by receipt

    record.memoryId = payload.id != null ? String(payload.id) : record.memoryId;
    const t = finiteOr(payload.t, now) ?? now;
    if (payload.outcome === 'rescued') {
      record.outcome = 'rescued';
      record.rescuedAtS = t;
      if (record.workplace && record.workplace.sectorId && record.returnDueAtS == null) {
        record.returnDueAtS = now + RETURN_MIN_S + state.rng() * RETURN_SPREAD_S;
      }
    } else if (payload.outcome === 'ransomed' || payload.outcome === 'abandoned') {
      // Sold or lost to the void: the story ends here, distinctly. No return ever fires.
      record.outcome = payload.outcome;
      record.closedAtS = t;
    }
  }

  // ── the return itself: one hull, one world record, the real job ───────────────────────────
  const assignReturnJob = (entity, record) => {
    if (entity.data.jobId) return entity.data.jobId;
    if (!helpers?.npcJobs?.assign || !record.workplace) return null;
    const spec = {
      kind: record.workplace.kind,
      route: clonePlain(record.workplace.route),
      speed: record.workplace.speed,
      sectorId: record.workplace.sectorId || entity.data.sectorId,
      payload: { rescuedWorkerReturn: record.personKey },
    };
    for (const field of ['commissionS', 'departS', 'approachS', 'workS', 'loadS', 'unloadS', 'dwellS']) {
      if (record.workplace[field] != null) spec[field] = record.workplace[field];
    }
    return helpers.npcJobs.assign(entity, spec);
  };

  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    if (!helpers?.npcJobs || !state.world?.currentSectorId) return;
    const now = simNowOf(state);
    const sectorId = state.world.currentSectorId;
    for (const record of Object.values(own().people)) {
      if (record.outcome === 'lost' || record.outcome === 'ransomed' || record.outcome === 'abandoned') continue;
      if (record.outcome === 'adrift' || record.workplace == null) continue;
      if (record.returnDueAtS == null || now < record.returnDueAtS) continue;
      if (record.workplace.sectorId !== sectorId) continue; // the return lands in its own sector

      const existing = actor(record);
      if (existing && existing.alive !== false) {
        // A world-resident copy is already here (restore rematerialized it first): adopt it,
        // heal its identity stamp, finish its job link, and charge the transition once.
        stampIdentity(existing, record);
        if (!existing.data.jobId) assignReturnJob(existing, record);
        if (record.returnedAtS == null) {
          record.returnedAtS = now;
          record.returnedEntityId = existing.id;
          record.outcome = 'returned';
          emitReturned(record, existing.id);
        }
        continue;
      }
      // A world-resident copy can be temporarily absent from the near entity table.
      if (existing == null && state.world?.records?.byId?.[record.worldRecordId]) continue;
      if (record.returnedAtS != null) continue; // one return per rescue, never a duplicate

      // Unknown defIds are skipped, not kestrelled: no fabricated body for this person.
      if (!record.defId || !SPAWNABLE_SHIP_IDS.has(record.defId)) continue;
      const home = record.workplace.route[0]?.pos || { x: 0, z: 0 };
      const off = (hash32(state.meta?.seed || 1, record.personKey, 'returnOffset') % 60) + 30;
      let entity = null;
      try {
        const spec = makeShipEntitySpec(record.defId, {
          team: record.team || 2,
          factionId: record.factionId || 'faction_free',
          pos: { x: home.x + off, z: home.z + off * 0.5 },
          ai: { archetype: 'passive', passive: true, spawnContext: 'civilian_worker' },
        });
        spec.flags = { persistent: true };
        spec.data.worldRecordId = record.worldRecordId;
        spec.data.sectorId = record.workplace.sectorId;
        stampIdentity(spec, record);
        entity = helpers.spawnEntity(spec);
      } catch {
        entity = null; // an unknown defId must not fabricate a wrong body
      }
      if (!entity) continue;
      const jobId = assignReturnJob(entity, record);
      record.returnedAtS = now;
      record.returnedEntityId = entity.id;
      record.outcome = 'returned';
      emitReturned(record, entity.id, jobId);
    }
  }

  function emitReturned(record, entityId, jobId) {
    if (!bus || typeof bus.emit !== 'function') return;
    bus.emit('rescuedWorker:returned', {
      personKey: record.personKey,
      worldRecordId: record.worldRecordId,
      jobId: jobId != null ? jobId : (entityId != null && state.entities.get(entityId)?.data?.jobId) || null,
      role: record.role,
      sectorId: record.workplace?.sectorId || null,
      entityId,
      simTime: simNowOf(state),
    });
    bus.emit('toast', {
      kind: 'info', ttl: 5,
      text: `${ROLE_LABELS[record.role] || 'Worker'} you rescued is back on the job.`,
    });
  }

  // A returned worker's death is final: outcome 'lost', charged once, never respawned.

  function noteReturnedLoss(record, now) {
    if (!record || record.outcome !== 'returned' || record.lostAtS != null) return;
    record.outcome = 'lost';
    record.lostAtS = now;
  }

  // ── later contact: the rescue is acknowledged in the person's own voice once ────────────
  // Fired on the contactHail:offer the player actually receives. The remembered voice line is
  // authored in contactHail.js (read-only); this owner only latches the one-time receipt onto
  // the person record so a second hail is an ordinary working-traffic voice, and so a save
  // taken between the two hails never replays the thank-you.
  function hailOffered(payload) {
    if (!payload || payload.targetId == null) return;
    const entity = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(payload.targetId) : null;
    const personKey = entity && entity.data && entity.data.rescuedWorkerPerson;
    if (!personKey) return;
    const record = recordOf(String(personKey));
    if (!record || record.outcome !== 'returned') return;
    if (record.hailAcknowledgedAtS != null) return;
    record.hailAcknowledgedAtS = simNowOf(state);
  }

  // Detached-scalar projection for tests/debug (choir berthStatus precedent).
  function status() {
    return Object.values(own().people).map((rec) => ({
      personKey: rec.personKey,
      worldRecordId: rec.worldRecordId,
      memoryId: rec.memoryId,
      role: rec.role,
      outcome: rec.outcome,
      hasWorkplace: !!rec.workplace,
      sectorId: rec.sectorId,
      ejectedAtS: rec.ejectedAtS,
      rescuedAtS: rec.rescuedAtS,
      returnDueAtS: rec.returnDueAtS,
      returnedAtS: rec.returnedAtS,
      lostAtS: rec.lostAtS,
      persona: rec.persona || null,
      hailAcknowledgedAtS: rec.hailAcknowledgedAtS,
    }));
  }

  return {
    sync,
    killed,
    podEjected,
    podResolved,
    hailOffered,
    clear: () => { pending.clear(); actors.clear(); },
    status,
  };
}
