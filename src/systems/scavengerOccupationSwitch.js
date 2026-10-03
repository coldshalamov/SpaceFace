// SF-162 — a damaged place that redistributes nearby work. PB-CONS-B aftermath pair, half two.
//
// When a wreck field's scavenger finishes — hold full or nothing left to strip — aftermathWrecks
// releases the prior obligation the lawful way: the roster slot goes 'gone' and the departing
// hull emits `wreckEcology:departed` carrying its hold. Until now the goods vanished with the
// hull. This module makes that boundary a REAL occupation switch for the same person:
//
//   scavenger (old occupation, ended by its owner — the slot is gone, the loop releases them)
//     → one legible `occupation:switched` transition
//     → salvage hauler (new occupation): the SAME person's world record, carrying the SAME
//       surviving goods, flying a real npcJobs hauler job to the nearest station.
//
// No double-dipping: the switched hull carries no `wreckEcologyRole`, no `scavengerWork` and no
// scavenger doctrine, so the field's work loop can never drive it; the departed slot is 'gone'
// and a field's scavenger never re-seeds, so the person is not competing with themselves. The
// switch fires once per person per transition, and a lost hauler is final — no resurrection.
//
// Consequences stay with their owners: this module writes only its own record state and emits
// advisory events/toasts. Credits, reputation, heat and custody are never written here.
import { makeShipEntitySpec } from './ships.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';

export const OCCUPATION_SWITCH_SCHEMA = 'spaceface.occupationSwitch.v1';

const HAULER_SPEED = 42;
const STATION_CLEARANCE = 140;
const STATION_ARRIVAL = 160;

const simNowOf = (state) => Math.max(0, Number(state.simTime) || 0);
const finiteOr = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const clonePlain = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

const holdTotal = (hold) => Object.values(hold || {})
  .reduce((sum, qty) => sum + (Number(qty) || 0), 0);

/** Stable person identity for one wreck field's scavenger (one field, one scavenger, ever). */
export const scavengerPersonKey = (seed, fieldId) => `wreck-ecology:${seed || 1}:${fieldId}`;
export const scavengerWorldRecordId = (seed, fieldId) => `wreck-ecology-person:${seed || 1}:${fieldId}`;

/** Additive-with-defaults record normalize, so pre-module saves read clean (choir precedent). */
export function normalizeOccupationSwitch(value) {
  const source = value && typeof value === 'object' ? value : {};
  const people = source.people && typeof source.people === 'object' ? source.people : {};
  const normalized = {};
  for (const [key, raw] of Object.entries(people)) {
    if (!raw || typeof raw !== 'object') continue;
    normalized[key] = {
      personKey: String(key),
      phase: raw.phase != null ? String(raw.phase) : 'scavenger',
      fieldId: raw.fieldId != null ? String(raw.fieldId) : null,
      sectorId: raw.sectorId != null ? String(raw.sectorId) : null,
      hold: clonePlain(raw.hold) || {},
      holdQty: Math.max(0, Number(raw.holdQty) || 0),
      switchedAtS: finiteOr(raw.switchedAtS),
      deliveredAtS: finiteOr(raw.deliveredAtS),
      lostAtS: finiteOr(raw.lostAtS),
      haulerEntityId: raw.haulerEntityId != null ? Number(raw.haulerEntityId) : null,
    };
  }
  return { schemaVersion: OCCUPATION_SWITCH_SCHEMA, people: normalized };
}

export function createScavengerOccupationSwitch(owner) {
  const { state, helpers, bus } = owner;
  const actors = new Map();

  const own = () => {
    const bag = owner._ensureState();
    return bag.occupationSwitch || (bag.occupationSwitch = normalizeOccupationSwitch());
  };
  const recordForField = (fieldId) => {
    const key = scavengerPersonKey(state.meta?.seed || 1, fieldId);
    return { key, record: own().people[key] || null };
  };

  const actor = (record) => {
    const cached = actors.get(record.personKey);
    if (cached?.alive && cached.alive !== false && state.entities.get(cached.id) === cached) return cached;
    const found = indexedWorldRecordEntity(state, scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId));
    if (found) actors.set(record.personKey, found);
    return found || null;
  };

  const stationFor = (sectorId, from = { x: 0, z: 0 }) => {
    if (state.world?.currentSectorId !== sectorId) return null;
    const index = state.entityIndex;
    const list = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.stations)
      ? index.stations
      : (state.entityList || []);
    let best = null;
    let bestD = Infinity;
    for (const entity of list) {
      if (!entity || entity.alive === false || entity.type !== 'station') continue;
      const d = Math.hypot((entity.pos?.x || 0) - (from.x || 0), (entity.pos?.z || 0) - (from.z || 0));
      if (d < bestD) { bestD = d; best = entity; }
    }
    return best;
  };

  const spawnHauler = (record, pos) => {
    if (!helpers?.spawnEntity) return null;
    const worldRecordId = scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId);
    // Deliberately NO wreckEcologyRole / scavengerWork / scavenger doctrine on this hull — the
    // old occupation's consequences must not ride along on the new one (no double-dipping).
    let entity = null;
    try {
      const spec = makeShipEntitySpec('ship_mule', {
        team: 2, factionId: 'faction_reach', pos,
        ai: { archetype: 'passive', passive: true, spawnContext: 'civilian_worker' },
      });
      spec.flags = { persistent: true };
      Object.assign(spec.data, {
        worldRecordId,
        persistenceOwner: 'uniqueWrecks:occupationSwitch',
        occupationSwitchPerson: record.personKey,
        sectorId: record.sectorId,
        cargo: { items: clonePlain(record.hold) },
        scanLabel: 'SALVAGE HAULER · REDISTRIBUTED WORK',
      });
      entity = helpers.spawnEntity(spec);
    } catch {
      entity = null;
    }
    if (entity) actors.set(record.personKey, entity);
    return entity;
  };

  const assignDeliveryJob = (entity, record, station) => {
    if (!helpers?.npcJobs?.assign || entity.data.jobId) return entity.data.jobId || null;
    const worldRecordId = scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId);
    const clear = (station.radius || 50) + STATION_CLEARANCE;
    const dx = entity.pos.x - station.pos.x;
    const dz = entity.pos.z - station.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    return helpers.npcJobs.assign(entity, {
      kind: 'hauler', sectorId: record.sectorId, speed: HAULER_SPEED,
      route: [
        { id: `occupation-site:${record.fieldId}`, pos: { x: entity.pos.x, z: entity.pos.z } },
        {
          id: `dest:${station.data?.stationId || 'station'}`,
          pos: { x: station.pos.x + dx / len * clear, z: station.pos.z + dz / len * clear },
          label: 'Redistributed salvage',
        },
      ],
      payload: { occupationSwitch: record.personKey },
    });
  };

  // ── the switch: the owner released the obligation; the person takes the next job ──────────
  function departed(payload) {
    if (!payload || payload.fieldId == null || isSurvivalRunLive(state.run)) return;
    const { key, record } = recordForField(payload.fieldId);
    // Once per transition: a second departed for the same person never re-fires the switch.
    if (record && record.phase !== 'scavenger') return;
    const hold = clonePlain(payload.hold) || {};
    const holdQty = Number.isFinite(Number(payload.holdQty)) && Number(payload.holdQty) > 0
      ? Number(payload.holdQty)
      : holdTotal(hold);
    if (holdQty <= 0) {
      // Nothing to redistribute: the person leaves the trade with an empty hold. The old
      // occupation ended; no new one begins. Closed, quiet, no event.
      own().people[key] = {
        personKey: key, phase: 'spent', fieldId: String(payload.fieldId),
        sectorId: payload.sectorId != null ? String(payload.sectorId) : null,
        hold: {}, holdQty: 0,
        switchedAtS: simNowOf(state), deliveredAtS: null, lostAtS: null, haulerEntityId: null,
      };
      return;
    }
    const sectorId = payload.sectorId != null ? String(payload.sectorId) : state.world?.currentSectorId || null;
    const departedRef = payload.entityId != null ? state.entities?.get?.(payload.entityId) : null;
    const station = stationFor(sectorId, departedRef?.pos || undefined);
    const now = simNowOf(state);
    if (!station) {
      // No reachable depot in the live sector: no physical switch is honest here. The record
      // notes the release; the goods' fate stays with the owner's own departure semantics.
      own().people[key] = {
        personKey: key, phase: 'spent', fieldId: String(payload.fieldId), sectorId,
        hold, holdQty, switchedAtS: now, deliveredAtS: null, lostAtS: null, haulerEntityId: null,
      };
      return;
    }
    const pos = departedRef?.pos
      ? { x: departedRef.pos.x, z: departedRef.pos.z }
      : { x: station.pos.x - (station.radius || 50) - STATION_ARRIVAL, z: station.pos.z };
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const next = {
      personKey: key, phase: 'salvage_hauler', fieldId: String(payload.fieldId), sectorId,
      hold, holdQty, switchedAtS: now, deliveredAtS: null, lostAtS: null, haulerEntityId: null,
    };
    own().people[key] = next;

    const worldRecordId = scavengerWorldRecordId(state.meta?.seed || 1, next.fieldId);
    const existing = actor(next);
    let entity = existing && existing.alive !== false ? existing : null;
    if (!entity && !state.world?.records?.byId?.[worldRecordId]) {
      entity = spawnHauler(next, pos);
    }
    if (!entity) { next.phase = 'spent'; return; } // cannot re-materialize honestly — stay closed
    const jobId = assignDeliveryJob(entity, next, station);
    next.haulerEntityId = entity.id;

    if (bus && typeof bus.emit === 'function') {
      bus.emit('occupation:switched', {
        personKey: next.personKey,
        from: 'scavenger',
        to: 'salvage_hauler',
        fieldId: next.fieldId,
        sectorId: next.sectorId,
        entityId: entity.id,
        jobId: jobId || entity.data.jobId || null,
        holdQty: next.holdQty,
        simTime: now,
      });
      bus.emit('toast', {
        kind: 'info', ttl: 5,
        text: 'The wreck field\'s picker crew switched to hauling their hold in.',
      });
    }
  }

  // The new occupation's job actually ran: the hauler completed its delivery route.
  function jobComplete(payload) {
    if (!payload || payload.jobId == null) return;
    const jobId = String(payload.jobId);
    for (const record of Object.values(own().people)) {
      if (record.phase !== 'salvage_hauler') continue;
      const expected = `job:${scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)}`;
      if (jobId !== expected) continue;
      record.phase = 'delivered';
      record.deliveredAtS = simNowOf(state);
      if (bus && typeof bus.emit === 'function') {
        bus.emit('occupation:delivered', {
          personKey: record.personKey,
          fieldId: record.fieldId,
          sectorId: record.sectorId,
          jobId,
          holdQty: record.holdQty,
          simTime: record.deliveredAtS,
        });
      }
    }
  }

  // One loss is final: a killed hauler never comes back (same law as the Choir relief runners).
  function killed(payload) {
    if (!payload || payload.id == null) return;
    const now = simNowOf(state);
    const entity = state.entities?.get?.(payload.id);
    for (const record of Object.values(own().people)) {
      if (record.phase !== 'salvage_hauler') continue;
      if (record.haulerEntityId !== payload.id
        && entity?.data?.occupationSwitchPerson !== record.personKey) continue;
      record.phase = 'lost';
      record.lostAtS = now;
    }
  }

  // Restore / re-entry: a mid-delivery record rematerializes its one hauler from its own
  // durable record — same identity, same hold, same deterministic job id. Never a duplicate.
  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    if (!helpers?.npcJobs || !state.world?.currentSectorId) return;
    for (const record of Object.values(own().people)) {
      if (record.phase !== 'salvage_hauler' || !(record.holdQty > 0)) continue;
      if (record.sectorId !== state.world.currentSectorId) continue;
      const existing = actor(record);
      if (existing && existing.alive !== false) {
        if (!existing.data.jobId) {
          const station = stationFor(record.sectorId);
          if (station) assignDeliveryJob(existing, record, station);
        }
        continue;
      }
      if (state.world?.records?.byId?.[scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)]) continue;
      const station = stationFor(record.sectorId);
      if (!station) continue;
      const lastPos = state.entities?.get?.(record.haulerEntityId)?.pos || station.pos;
      const entity = spawnHauler(record, { x: lastPos.x, z: lastPos.z });
      if (!entity) continue;
      assignDeliveryJob(entity, record, station);
      record.haulerEntityId = entity.id;
    }
  }

  function status() {
    return Object.values(own().people).map((rec) => ({
      personKey: rec.personKey,
      phase: rec.phase,
      fieldId: rec.fieldId,
      sectorId: rec.sectorId,
      holdQty: rec.holdQty,
      switchedAtS: rec.switchedAtS,
      deliveredAtS: rec.deliveredAtS,
      lostAtS: rec.lostAtS,
    }));
  }

  return { departed, jobComplete, killed, sync, clear: () => actors.clear(), status };
}
