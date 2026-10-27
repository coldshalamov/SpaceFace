// SF-162 — a damaged place that redistributes nearby work. PB-CONS-B aftermath pair, half two.
// EXP-25 — the switch is now a real career change, not a costume swap.
//
// When a wreck field's scavenger finishes — hold full or nothing left to strip — aftermathWrecks
// releases the prior obligation the lawful way: the roster slot goes 'gone' and the departing
// hull emits `wreckEcology:departed` carrying its hold. This module makes that boundary a REAL
// occupation switch for the same person, with the stakes a career change actually carries:
//
//   scavenger (old occupation, ended by its owner — the slot is gone, the loop releases them)
//     → one legible `occupation:switched` transition
//     → BONDED salvage hauler (new occupation): the SAME person's world record, the SAME
//       surviving goods, a real npcJobs hauler job to the nearest station — flown under a
//       depot bond on a probation ticket the player can read on a scan. Killing the hull
//       while the bond stands costs the killer standing with the crew's faction AND the
//       bond-holding depot's faction; the probation window is the expensive part of the hit.
//     → handover: the depot takes physical custody (the hold leaves the hull — no second
//       spill later), the goods land in the station's real market as sell-side pressure, and
//       a pilot who saw the haul in — docked at that depot, or flying alongside at the ring —
//       is posted on the manifest for a witness fee. A pilot hostile with the depot faction
//       is struck from the manifest: reputation gates the courtesy.
//     → offshift dwell at the ring, then the next honest thing: a second leg to a different
//       berth when the sector has one (fresh start), or the down-lane exit when it does not
//       (the crew ships out past the field line — the returning path closes the same arc).
//       A settled crew's hull returns to ordinary world bookkeeping; a lost one is final.
//
// No double-dipping: the switched hull carries no `wreckEcologyRole`, no `scavengerWork` and no
// scavenger doctrine, so the field's work loop can never drive it; the departed slot is 'gone'
// and a field's scavenger never re-seeds, so the person is not competing with themselves. The
// switch fires once per person per transition, a lost hauler never comes back, and the hold is
// spent into exactly one market — the hull's custody is emptied at handover so the same units
// can never spill a second time.
//
// Consequences stay with their owners: this module writes only its own record state and emits
// advisory events, toasts, economy intents (`economy:applyTradePressure`, `economy:grantCredits`)
// and rep intents (`faction:repDelta`). Credits, reputation, heat and custody are never written
// here — the owning systems answer the intents. Every outward emit lands AFTER the record latch
// it reports, so a synchronous re-entrant event always sees the settled phase.
import { makeShipEntitySpec } from './ships.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';
import { occupantGenerationOf } from '../core/entity.js';
import { hash32 } from '../core/rng.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { syncEntitySectorMembership } from '../core/coreSystem.js';
import { wreckFieldEcology } from './aftermathWrecks.js';

export const OCCUPATION_SWITCH_SCHEMA = 'spaceface.occupationSwitch.v1';

const HAULER_SPEED = 42;
const STATION_CLEARANCE = 140;
const STATION_ARRIVAL = 160;

// ── the career-change stakes ────────────────────────────────────────────────────────────────
// The bond is the depot's surety over the inbound hold: it prices both the manifest-witness
// fee and what a kill costs the killer while it stands. All spreads are hash32-derived —
// deterministic per person, no ambient randomness.
const BOND_BASE_CR = 40;
const BOND_PER_UNIT_CR = 18;
const BOND_JITTER_CR = 24;
const PROBATION_S = 90;              // the bonded window: an early kill is the expensive kill
const DWELL_BASE_S = 60;             // the crew takes their bond back and sits offshift a while
const DWELL_JITTER_S = 45;
const WITNESS_RANGE_WU = 900;        // "saw the haul in" — docked at the depot or alongside it
const WITNESS_SHARE = 0.25;          // manifest fee: a quarter of the posted bond, floored
const WITNESS_MIN_CR = 15;
const HOSTILE_REP_FLOOR = -30;       // at or below this standing the manifest strikes you
const KILL_REP_PROBATION = 6;        // a bonded probationer's death outranks a lane casualty
const KILL_REP_FLIGHT = 3;           // licensed but still mid-contract
const LAUNCH_KICK_DV = 7;            // the crew punches it — a real shove onto the lane
const LEG2_OUTBOUND_WU = 2400;       // single-depot sector: they ship out past the field line
const LEGS_MAX = 2;                  // switch flight + one recommission, then the career is told
export const OCCUPATION_SWITCH_MAX_PEOPLE = 12;
const MAX_HOLD_QTY = 10000;          // hostile-save bound: a hold is freight, not a ledger weapon
const MAX_HOLD_GOODS = 64;           // a manifest is a line list, not an unbounded map
// The most a bond can honestly price: base + a full hostile-bound hold + the whole jitter.
const BOND_MAX_CR = BOND_BASE_CR + MAX_HOLD_QTY * BOND_PER_UNIT_CR + BOND_JITTER_CR;

const LIVE_HULL_PHASES = new Set(['salvage_hauler', 'delivered', 'established']);
const KNOWN_PHASES = new Set([
  'scavenger', 'salvage_hauler', 'delivered', 'established', 'settled', 'lost', 'spent',
]);

const simNowOf = (state) => Math.max(0, Number(state.simTime) || 0);
// Timestamps are nullable: null/undefined/''/boolean mean "never happened", and Number(null)
// is 0 — a coercion bug that would pin every unset latch to epoch and block the clock edges.
const finiteOr = (value, fallback = null) => {
  if (value == null || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const finiteIdOr = (value) => {
  // Same nullable contract as finiteOr: ''/boolean coerce to 0/1 — real entity ids.
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const clonePlain = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
const frac = (h) => (h >>> 0) / 0x100000000;

const holdTotal = (hold) => Object.values(hold || {})
  .reduce((sum, qty) => sum + (Number(qty) || 0), 0);

// A hold is a manifest of freight lines: bounded key count, bounded per-good quantity, and
// only positive entries — a hostile save cannot smuggle unbounded sell pressure into the
// market intent, and the durable slice stays a plain small JSON shape.
const normalizeHold = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [good, qty] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_HOLD_GOODS) break;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[String(good)] = Math.min(MAX_HOLD_QTY, n);
  }
  return out;
};

// The durable-ledger order: live-hull records outlast closed arcs; within a footing the oldest
// stamp loses. Shared by normalizeOccupationSwitch (hostile input) and the runtime pruner.
const personLedgerOrder = (a, b) => (LIVE_HULL_PHASES.has(a.phase) ? 1 : 0) - (LIVE_HULL_PHASES.has(b.phase) ? 1 : 0)
  || ((a.settledAtS ?? a.lostAtS ?? a.deliveredAtS ?? a.switchedAtS ?? 0)
    - (b.settledAtS ?? b.lostAtS ?? b.deliveredAtS ?? b.switchedAtS ?? 0));

/** Stable person identity for one wreck field's scavenger (one field, one scavenger, ever). */
export const scavengerPersonKey = (seed, fieldId) => `wreck-ecology:${seed || 1}:${fieldId}`;
export const scavengerWorldRecordId = (seed, fieldId) => `wreck-ecology-person:${seed || 1}:${fieldId}`;

const normalizePos = (value) => {
  const x = Number(value && value.x);
  const z = Number(value && value.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
};

/** Additive-with-defaults record normalize, so pre-module saves read clean (choir precedent).
 *  Foreign phases normalize dead ('spent'); a hostile hold is freight-bounded, and nullable
 *  timestamps stay nullable so a mid-flight save restores where it stood. */
export function normalizeOccupationSwitch(value) {
  const source = value && typeof value === 'object' ? value : {};
  const people = source.people && typeof source.people === 'object' ? source.people : {};
  const normalized = {};
  for (const [key, raw] of Object.entries(people)) {
    if (!raw || typeof raw !== 'object') continue;
    normalized[key] = {
      personKey: String(key),
      // Foreign phase names close dead rather than resurrecting a hull nobody owns.
      phase: raw.phase == null ? 'scavenger' : (KNOWN_PHASES.has(raw.phase) ? String(raw.phase) : 'spent'),
      fieldId: raw.fieldId != null ? String(raw.fieldId) : null,
      sectorId: raw.sectorId != null ? String(raw.sectorId) : null,
      hold: normalizeHold(raw.hold),
      holdQty: Math.min(MAX_HOLD_QTY, Math.max(0, Number(raw.holdQty) || 0)),
      bondCr: Math.min(BOND_MAX_CR, Math.max(0, Number(raw.bondCr) || 0)),
      probationUntilS: finiteOr(raw.probationUntilS),
      licensedAtS: finiteOr(raw.licensedAtS),
      destStationId: raw.destStationId != null ? String(raw.destStationId) : null,
      destFactionId: raw.destFactionId != null ? String(raw.destFactionId) : null,
      destPos: normalizePos(raw.destPos),
      fieldPos: normalizePos(raw.fieldPos),
      dwellUntilS: finiteOr(raw.dwellUntilS),
      leg2StationId: raw.leg2StationId != null ? String(raw.leg2StationId) : null,
      leg2Attempts: Math.min(4, Math.max(0, Math.floor(Number(raw.leg2Attempts) || 0))),
      legs: Math.min(LEGS_MAX, Math.max(0, Math.floor(Number(raw.legs) || 0))),
      marketAtS: finiteOr(raw.marketAtS),
      witnessAtS: finiteOr(raw.witnessAtS),
      switchedAtS: finiteOr(raw.switchedAtS),
      deliveredAtS: finiteOr(raw.deliveredAtS),
      establishedAtS: finiteOr(raw.establishedAtS),
      settledAtS: finiteOr(raw.settledAtS),
      lostAtS: finiteOr(raw.lostAtS),
      haulerEntityId: finiteIdOr(raw.haulerEntityId),
      haulerEntityGen: finiteIdOr(raw.haulerEntityGen),
    };
  }
  // A hostile save can carry an unbounded cast — enforce the same ledger bound the runtime
  // pruner applies, so the durable slice and every sync/status walk stay small.
  const keys = Object.keys(normalized);
  if (keys.length > OCCUPATION_SWITCH_MAX_PEOPLE) {
    keys.sort((a, b) => personLedgerOrder(normalized[a], normalized[b]));
    for (let i = 0; i < keys.length - OCCUPATION_SWITCH_MAX_PEOPLE; i++) delete normalized[keys[i]];
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

  // Keep the durable record's stated hull honest across world rematerializations — a shelved
  // hull returns under a fresh numeric id and occupant generation, and the kill-wire fallback
  // (id equality when the corpse is already swept) only works while these stay true.
  const pinActor = (record, entity) => {
    record.haulerEntityId = entity.id;
    record.haulerEntityGen = occupantGenerationOf(entity);
  };

  // The career is told: a hull that STAYS stops being this module's serialized body. Home-stamp
  // it so residency teardown can demote it, hand ownership back so the generic durable capture
  // can claim it (`persistenceOwner` !== 'worldRecords' refuses entityHasDurableMarkers), and
  // drop the persistent mark so the save envelope releases it — otherwise every parked citizen
  // rides the entity table and the save forever, one permanent hull per closed career.
  const releaseToOrdinaryBookkeeping = (entity, record) => {
    if (!entity || entity.alive === false || !entity.data) return;
    const data = entity.data;
    if (entity.homeSectorId == null && record.sectorId != null) entity.homeSectorId = record.sectorId;
    if (data.homeSectorId == null) data.homeSectorId = entity.homeSectorId || null;
    if (data.persistenceOwner === 'uniqueWrecks:occupationSwitch') delete data.persistenceOwner;
    if (entity.flags && entity.flags.persistent === true) {
      const flags = { ...entity.flags };
      delete flags.persistent;
      entity.flags = flags;
    }
    if (entity.homeSectorId != null) syncEntitySectorMembership(state.entityIndex, entity);
  };

  // The world's durable row for this person's hull. A row still naming a live hull will be
  // rematerialized back to us; a row the world already buried (dead, or carrying a terminal
  // outcome — the same predicates worldRecords.recordShouldRematerialize refuses on) is gone
  // for good and must heal, not wait. A missing row is a different fact: gone untracked.
  const worldRowFor = (record) => state.world?.records?.byId?.[
    scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)] || null;
  const worldRowWillReturn = (row) => !!row && row.alive !== false
    && row.outcome !== 'destroyed' && row.outcome !== 'defeated';

  // The recorded numeric id alone is a weak witness — ids recycle. Identity needs the stamped
  // person key on data, or the same numeric id backed by the same occupant generation (when
  // both sides can prove one). Liveness is NOT part of identity: entity:killed lands with
  // alive already false and the corpse still in the table — the body is the witness.
  const isRecordHauler = (record, entity) => {
    if (!entity) return false;
    if (entity.data?.occupationSwitchPerson === record.personKey) return true;
    if (entity.id !== record.haulerEntityId) return false;
    const gen = occupantGenerationOf(entity);
    if (record.haulerEntityGen == null || gen == null) return record.haulerEntityGen == null;
    return gen === record.haulerEntityGen;
  };

  const stationList = (sectorId) => {
    if (state.world?.currentSectorId !== sectorId) return [];
    const index = state.entityIndex;
    const list = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.stations)
      ? index.stations
      : (state.entityList || []);
    return list.filter((entity) => entity && entity.alive !== false && entity.type === 'station');
  };

  const stationFor = (sectorId, from = { x: 0, z: 0 }, exclude = null) => {
    const anchor = normalizePos(from) || { x: 0, z: 0 };
    let best = null;
    let bestD = Infinity;
    for (const entity of stationList(sectorId)) {
      // Exclusion by identity OR by the depot's stable stationId — either witness suffices,
      // so a v1 record with no destStationId still never recommissions onto its own berth.
      if (exclude && (entity === exclude.entity
        || (exclude.stationId != null && entity.data?.stationId === exclude.stationId))) continue;
      const epos = normalizePos(entity.pos);
      if (!epos) continue; // a position-less station is not a berth anyone can fly to
      const d = Math.hypot(epos.x - anchor.x, epos.z - anchor.z);
      if (d < bestD) { bestD = d; best = entity; }
    }
    return best;
  };

  const stationById = (sectorId, stationId) => {
    if (stationId == null) return null;
    return stationList(sectorId).find((entity) => entity.data?.stationId === stationId) || null;
  };

  // The scan label is the career state the player can read off the hull — bond, license,
  // offshift, signed-on — refreshed at every latch and on the probation clock edge.
  const scanLabelFor = (record, now) => {
    if (record.phase === 'delivered') return 'PICKER CREW · OFFSHIFT AT DEPOT';
    if (record.phase === 'established') return 'HAULER · SIGNED ON';
    if (record.phase === 'settled') return 'SETTLED CREW · DEPOT REGISTRY';
    const probationLive = record.probationUntilS != null && now < record.probationUntilS;
    return probationLive ? 'BONDED HAULER · PROBATION CREW' : 'SALVAGE HAULER · LICENSED';
  };

  const applyScanLabel = (record, entity) => {
    if (entity?.data) entity.data.scanLabel = scanLabelFor(record, simNowOf(state));
  };

  // A real shove in the lane direction — additive on the physics membrane, never a write.
  const shove = (entity, dirX, dirZ, dv) => {
    if (!entity || entity.alive === false) return;
    const len = Math.hypot(dirX, dirZ);
    if (!Number.isFinite(len) || len <= 0) return;
    const mass = Number.isFinite(entity.mass) && entity.mass > 0 ? entity.mass : 20;
    try {
      queuePhysicsImpulse(entity, { x: dirX / len * mass * dv, z: dirZ / len * mass * dv }, { tick: state.tick | 0 });
    } catch { /* the lane kick is flavor; a physics-less host still gets the switch */ }
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
      // Custody is honest: the hold only rides the hull while it is still theirs. A delivered
      // or recommissioned hull respawns with an empty hold — the goods are the depot's now.
      const carries = record.phase === 'salvage_hauler' && record.holdQty > 0;
      Object.assign(spec.data, {
        worldRecordId,
        persistenceOwner: 'uniqueWrecks:occupationSwitch',
        occupationSwitchPerson: record.personKey,
        occupationSwitchBond: record.bondCr || 0,
        sectorId: record.sectorId,
        cargo: { items: carries ? clonePlain(record.hold) : {} },
        scanLabel: scanLabelFor(record, simNowOf(state)),
      });
      entity = helpers.spawnEntity(spec);
    } catch {
      entity = null;
    }
    if (entity) actors.set(record.personKey, entity);
    return entity;
  };

  const assignDeliveryJob = (entity, record, station) => {
    if (!helpers?.npcJobs?.assign || entity.data.jobId || !entity.pos) {
      return entity.data.jobId || null;
    }
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
      payload: { occupationSwitch: record.personKey, occupationSwitchLeg: 1 },
    });
  };

  // The field site the crew left: the ecology record is exact while it stands; the departing
  // hull's position is the honest fallback (it is where the crew last stood over the field).
  const fieldSiteFor = (record, fallbackEntity) => {
    const field = record.fieldId ? wreckFieldEcology(state, record.fieldId) : null;
    const pos = normalizePos(field && field.pos)
      || normalizePos(record.fieldPos)
      || normalizePos(fallbackEntity && fallbackEntity.pos);
    return pos;
  };

  // Durable-ledger bound: at most OCCUPATION_SWITCH_MAX_PEOPLE records, closed arcs first.
  // A pruned LIVE record still owns a hull — dropping the row without the release settle()
  // performs leaves a foreign-owned persistent body the world can never bookkeep: protected
  // from residency despawn, refused by durable capture, and serialized into every save
  // envelope. The record is gone either way; the hull retires to ordinary citizenship with
  // its freight aboard, and its orphaned job entry goes back to the runtime.
  const releasePrunedLiveRecord = (record) => {
    if (!record || !LIVE_HULL_PHASES.has(record.phase)) return;
    releaseToOrdinaryBookkeeping(actor(record), record);
    actors.delete(record.personKey);
    try {
      helpers?.npcJobs?.release?.(`job:${scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)}`);
    } catch { /* releasing the orphaned job is best-effort */ }
  };
  const prunePeople = () => {
    const people = own().people;
    const keys = Object.keys(people);
    if (keys.length <= OCCUPATION_SWITCH_MAX_PEOPLE) return;
    keys.sort((a, b) => personLedgerOrder(people[a], people[b]));
    for (let i = 0; i < keys.length - OCCUPATION_SWITCH_MAX_PEOPLE; i++) {
      releasePrunedLiveRecord(people[keys[i]]);
      delete people[keys[i]];
    }
  };

  const bondFor = (personKey, holdQty) => BOND_BASE_CR
    + Math.round(holdQty * BOND_PER_UNIT_CR)
    + (hash32(state.meta?.seed || 1, personKey, 'occupationSwitch:bond') % (BOND_JITTER_CR + 1));

  // ── the switch: the owner released the obligation; the person takes the next job ──────────
  function departed(payload) {
    if (!payload || payload.fieldId == null || isSurvivalRunLive(state.run)) return;
    const { key, record } = recordForField(payload.fieldId);
    // Once per transition: a second departed for the same person never re-fires the switch.
    if (record && record.phase !== 'scavenger') return;
    const hold = normalizeHold(payload.hold);
    const holdQty = Number.isFinite(Number(payload.holdQty)) && Number(payload.holdQty) > 0
      ? Math.min(MAX_HOLD_QTY, Number(payload.holdQty))
      : Math.min(MAX_HOLD_QTY, holdTotal(hold));
    if (holdQty <= 0) {
      // Nothing to redistribute: the person leaves the trade with an empty hold. The old
      // occupation ended; no new one begins. Closed, quiet, no event.
      own().people[key] = {
        personKey: key, phase: 'spent', fieldId: String(payload.fieldId),
        sectorId: payload.sectorId != null ? String(payload.sectorId) : null,
        hold: {}, holdQty: 0,
        bondCr: 0, probationUntilS: null, licensedAtS: null,
        destStationId: null, destFactionId: null, destPos: null, fieldPos: null,
        dwellUntilS: null, leg2StationId: null, leg2Attempts: 0, legs: 0,
        marketAtS: null, witnessAtS: null,
        switchedAtS: simNowOf(state), deliveredAtS: null, establishedAtS: null,
        settledAtS: null, lostAtS: null, haulerEntityId: null, haulerEntityGen: null,
      };
      prunePeople();
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
        hold, holdQty,
        bondCr: 0, probationUntilS: null, licensedAtS: null,
        destStationId: null, destFactionId: null, destPos: null, fieldPos: null,
        dwellUntilS: null, leg2StationId: null, leg2Attempts: 0, legs: 0,
        marketAtS: null, witnessAtS: null,
        switchedAtS: now, deliveredAtS: null, establishedAtS: null,
        settledAtS: null, lostAtS: null, haulerEntityId: null, haulerEntityGen: null,
      };
      prunePeople();
      return;
    }
    const pos = departedRef?.pos
      ? { x: departedRef.pos.x, z: departedRef.pos.z }
      : { x: station.pos.x - (station.radius || 50) - STATION_ARRIVAL, z: station.pos.z };
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    // The career-change latch lands BEFORE anything is spawned or spoken: a synchronous
    // re-entrant departed/jobComplete/killed always meets the settled phase.
    const next = {
      personKey: key, phase: 'salvage_hauler', fieldId: String(payload.fieldId), sectorId,
      hold, holdQty,
      bondCr: bondFor(key, holdQty),
      probationUntilS: now + PROBATION_S,
      licensedAtS: null,
      destStationId: station.data?.stationId != null ? String(station.data.stationId) : null,
      destFactionId: station.factionId != null ? String(station.factionId) : null,
      destPos: normalizePos(station.pos),
      fieldPos: fieldSiteFor({ fieldId: String(payload.fieldId), fieldPos: null }, departedRef),
      dwellUntilS: null, leg2StationId: null, leg2Attempts: 0, legs: 0,
      marketAtS: null, witnessAtS: null,
      switchedAtS: now, deliveredAtS: null, establishedAtS: null,
      settledAtS: null, lostAtS: null, haulerEntityId: null, haulerEntityGen: null,
    };
    own().people[key] = next;
    prunePeople();

    const worldRecordId = scavengerWorldRecordId(state.meta?.seed || 1, next.fieldId);
    const existing = actor(next);
    let entity = existing && existing.alive !== false ? existing : null;
    if (!entity && !state.world?.records?.byId?.[worldRecordId]) {
      entity = spawnHauler(next, pos);
    }
    if (!entity) { next.phase = 'spent'; return; } // cannot re-materialize honestly — stay closed
    if (existing && entity.data) {
      // An adopted hull must carry THIS switch's custody — whatever the old life left aboard
      // would spill phantom goods on a later kill, and the bond must price what it now holds.
      // The ownership marks re-stamp too: an adopted hull must be indistinguishable from a
      // fresh spawn (persistent body, this module's persistenceOwner, this sector).
      entity.data.worldRecordId = worldRecordId;
      entity.data.occupationSwitchPerson = next.personKey;
      entity.data.occupationSwitchBond = next.bondCr || 0;
      entity.data.sectorId = next.sectorId;
      entity.data.persistenceOwner = 'uniqueWrecks:occupationSwitch';
      entity.data.cargo = { items: clonePlain(next.hold) };
      entity.flags = { ...(entity.flags || {}), persistent: true };
      applyScanLabel(next, entity);
    }
    const jobId = assignDeliveryJob(entity, next, station);
    next.haulerEntityId = entity.id;
    next.haulerEntityGen = occupantGenerationOf(entity);
    // The crew punches it onto the lane — a real kick toward the depot, readable on the hull.
    shove(entity, station.pos.x - entity.pos.x, station.pos.z - entity.pos.z, LAUNCH_KICK_DV);

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
        bondCr: next.bondCr,
        probationUntilS: next.probationUntilS,
        destStationId: next.destStationId,
        simTime: now,
      });
      bus.emit('toast', {
        kind: 'info', ttl: 5,
        text: `The wreck field's picker crew switched to hauling their hold in — a ${next.bondCr}cr depot bond rides on the take.`,
      });
    }
  }

  // The handover: the depot takes custody of the hold — it leaves the hull physically so the
  // same units can never spill a second time — and lands in the market as real sell pressure.
  const handoverCustody = (record) => {
    const entity = actor(record);
    if (entity && entity.data?.cargo && typeof entity.data.cargo === 'object') {
      entity.data.cargo.items = {};
      entity.data.cargo.usedVolume = 0;
      entity.data.cargo.usedMass = 0;
      entity.data.cargoDelivered = record.holdQty;
    }
    return entity;
  };

  const playerPresentAt = (record, entity) => {
    if (state.ui?.docked === true && record.destStationId != null
      && state.ui.dockedStationId === record.destStationId) return true;
    const self = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!self?.pos || self.alive === false) return false;
    const anchor = normalizePos(entity && entity.pos) || record.destPos;
    if (!anchor) return false;
    return Math.hypot(self.pos.x - anchor.x, self.pos.z - anchor.z) <= WITNESS_RANGE_WU;
  };

  const playerHostileWith = (factionId) => {
    if (!factionId) return false;
    const rep = Number(state.factions?.[factionId]?.rep);
    return Number.isFinite(rep) && rep <= HOSTILE_REP_FLOOR;
  };

  // ── leg one complete: custody, market pressure, the manifest fee, the offshift dwell ─────
  function deliver(record, now) {
    record.phase = 'delivered';
    record.deliveredAtS = now;
    record.legs = Math.min(LEGS_MAX, (record.legs || 0) + 1);
    record.dwellUntilS = now + DWELL_BASE_S
      + frac(hash32(state.meta?.seed || 1, record.personKey, 'occupationSwitch:dwell')) * DWELL_JITTER_S;
    const entity = handoverCustody(record);
    if (entity) pinActor(record, entity); // the record's stated hull stays true at every join
    applyScanLabel(record, entity);
    // The haul ends at the ring: a mooring impulse settles the hull for the dwell.
    if (entity && entity.vel
      && (Math.abs(entity.vel.x) > 0.01 || Math.abs(entity.vel.z) > 0.01)) {
      shove(entity, -entity.vel.x, -entity.vel.z, Math.hypot(entity.vel.x, entity.vel.z));
    }
    // The destination is re-derived when a hostile or pre-expansion record never named it —
    // the depot the hull physically reached is the honest market.
    if (!record.destPos || !record.destStationId) {
      const reached = stationById(record.sectorId, record.destStationId)
        || stationFor(record.sectorId, entity?.pos || undefined);
      if (reached) {
        record.destStationId = reached.data?.stationId != null ? String(reached.data.stationId) : record.destStationId;
        record.destFactionId = reached.factionId != null ? String(reached.factionId) : record.destFactionId;
        record.destPos = normalizePos(reached.pos) || record.destPos;
      }
    }

    if (!bus || typeof bus.emit !== 'function') return;
    // Latch first, then the intents — an economy listener re-entering this module meets
    // 'delivered', never a second handover.
    if (record.marketAtS == null && record.destStationId != null) {
      record.marketAtS = now;
      for (const [good, qty] of Object.entries(record.hold || {})) {
        const vol = Number(qty);
        if (!Number.isFinite(vol) || vol <= 0) continue;
        bus.emit('economy:applyTradePressure', { stationId: record.destStationId, good, vol });
      }
    }
    // The manifest witness fee: the depot posts the transponder of a pilot who was actually
    // there — docked at the berth or flying the hauler in — unless they are already hostile
    // with the bond holder, in which case the manifest strikes the name (rep gates courtesy).
    if (record.witnessAtS == null && playerPresentAt(record, entity)) {
      record.witnessAtS = now;
      if (playerHostileWith(record.destFactionId)) {
        bus.emit('toast', {
          kind: 'warn', ttl: 5,
          text: 'The depot strikes your transponder from the bonded manifest — you are not welcome on it.',
        });
      } else {
        const fee = Math.max(WITNESS_MIN_CR, Math.round((record.bondCr || 0) * WITNESS_SHARE));
        bus.emit('economy:grantCredits', { amount: fee, reason: 'occupation_switch:manifest_witness' });
        bus.emit('toast', {
          kind: 'good', ttl: 5,
          text: `The bonded handover posts your transponder — manifest fee +${fee}cr.`,
        });
      }
    }
    bus.emit('occupation:delivered', {
      personKey: record.personKey,
      fieldId: record.fieldId,
      sectorId: record.sectorId,
      jobId: `job:${scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)}`,
      holdQty: record.holdQty,
      bondCr: record.bondCr,
      destStationId: record.destStationId,
      witnessed: record.witnessAtS === now,
      simTime: now,
    });
    bus.emit('toast', {
      kind: 'good', ttl: 5,
      text: `The wreck field's picker crew hauled ${Math.round(record.holdQty)}u to the depot.`,
    });
  }

  // The spoken close — every settle speaks exactly once, including heal-settles where no hull
  // ever flew the leg (legs stays the honest count of legs actually run).
  const speakSettled = (record, now) => {
    if (!bus || typeof bus.emit !== 'function') return;
    bus.emit('occupation:settled', {
      personKey: record.personKey,
      fieldId: record.fieldId,
      sectorId: record.sectorId,
      legs: record.legs,
      stationId: record.leg2StationId || record.destStationId,
      simTime: now,
    });
  };

  // ── leg two complete / refused: the career closes, one way or another ────────────────────
  // completedOutbound is set only from the leg-2 complete receipt on a down-lane route —
  // a heal-settle never despawns a hull that never actually flew out.
  function settle(record, now, { completedOutbound = false } = {}) {
    record.phase = 'settled';
    record.settledAtS = now;
    record.legs = Math.min(LEGS_MAX, (record.legs || 0) + 1);
    const hull = actor(record);
    applyScanLabel(record, hull);
    if (completedOutbound) {
      if (hull && hull.alive !== false) {
        // The down-lane exit ends at the line — the same honest despawn the scavenger took.
        hull.alive = false;
        actors.delete(record.personKey);
      }
      // And a durable body keeps its world row unless told: entity:destroyed never marks
      // records, and a live row would rematerialize this crew for the next visit — the
      // same law faction_frontier's settled-claim despawn honours. The record is settled
      // whether the hull is still at hand or already shelved; bury the row either way so
      // the world keeps them gone.
      const rowId = hull?.data?.worldRecordId
        || scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId);
      try {
        const world = owner.registry && typeof owner.registry.get === 'function'
          ? owner.registry.get('world') : null;
        if (world && typeof world.markWorldRecordDestroyed === 'function') {
          world.markWorldRecordDestroyed(rowId, {
            outcome: 'departed',
            pos: hull && hull.pos ? { x: hull.pos.x, z: hull.pos.z } : undefined,
          });
        }
      } catch { /* world presence is optional in focused harnesses */ }
    } else {
      // The parked berth-citizen: the arc is closed, so the hull returns to ordinary world
      // bookkeeping rather than riding the entity table and the persistent save envelope
      // forever — demote/evict/rematerialize can own it like any other resident NPC.
      releaseToOrdinaryBookkeeping(hull, record);
    }
    speakSettled(record, now);
  }

  // The world already buried this hull (its durable row is dead) and no kill receipt reached
  // us — a heal, not a kill: latch 'lost' once, then speak it. No rep billing — nobody signed.
  function closeLostToDeadRow(record, now) {
    const wasPhase = record.phase;
    const hauled = wasPhase === 'salvage_hauler' && record.holdQty > 0;
    record.phase = 'lost';
    record.lostAtS = now;
    actors.delete(record.personKey);
    if (bus && typeof bus.emit === 'function') {
      bus.emit('occupation:lost', {
        personKey: record.personKey,
        fieldId: record.fieldId,
        sectorId: record.sectorId,
        holdQty: hauled ? record.holdQty : 0,
        phase: wasPhase,
        byPlayer: false,
        simTime: now,
      });
    }
  }

  // The new occupation's job actually ran: the hauler completed its delivery route.
  function jobComplete(payload) {
    if (!payload || payload.jobId == null) return;
    const jobId = String(payload.jobId);
    // Both legs mint the same deterministic jobId (the worldRecordId is the whole key), so the
    // id alone cannot tell a replayed leg-1 receipt from leg two's own landing. The kernel
    // echoes the spec's payload back on the wire — a receipt that PROVES itself another leg
    // (or another person) is refused; a bare receipt still settles the current leg, as before.
    const receiptLeg = Number(payload.payload?.occupationSwitchLeg);
    const receiptPerson = payload.payload?.occupationSwitch;
    const now = simNowOf(state);
    for (const record of Object.values(own().people)) {
      const expected = `job:${scavengerWorldRecordId(state.meta?.seed || 1, record.fieldId)}`;
      if (jobId !== expected) continue;
      if (receiptPerson != null && receiptPerson !== record.personKey) continue;
      if (record.phase === 'salvage_hauler') {
        if (receiptLeg === 2) continue; // a leg-2 receipt cannot land the first delivery
        deliver(record, now);
      } else if (record.phase === 'established') {
        if (receiptLeg === 1) continue; // a replayed first-leg receipt must not close leg two
        // The recommission's own complete: the person is station folk (or down-lane gone).
        settle(record, now, { completedOutbound: record.leg2StationId == null });
      }
    }
  }

  // One loss is final: a killed hauler never comes back (same law as the Choir relief runners).
  // While the depot bond stands the kill is ALSO a contract killing — the crew's faction and
  // the bond-holding depot both file on the player, hardest during probation.
  function killed(payload) {
    if (!payload || payload.id == null) return;
    const now = simNowOf(state);
    const entity = state.entities?.get?.(payload.id);
    for (const record of Object.values(own().people)) {
      if (!LIVE_HULL_PHASES.has(record.phase)) continue;
      if (entity ? !isRecordHauler(record, entity) : record.haulerEntityId !== payload.id) continue;
      const wasPhase = record.phase; // captured pre-latch: the toast reads who they WERE
      const hauled = wasPhase === 'salvage_hauler' && record.holdQty > 0;
      const bonded = wasPhase === 'salvage_hauler' && (record.bondCr || 0) > 0;
      const probationLive = bonded && record.probationUntilS != null && now < record.probationUntilS;
      const byPlayer = payload.killerId != null && payload.killerId === state.playerId;
      // Latch the loss before any consequence fires — a rep listener re-entering on this
      // emit meets 'lost' and never double-charges.
      record.phase = 'lost';
      record.lostAtS = now;
      actors.delete(record.personKey);
      if (bus && typeof bus.emit === 'function') {
        bus.emit('occupation:lost', {
          personKey: record.personKey,
          fieldId: record.fieldId,
          sectorId: record.sectorId,
          holdQty: hauled ? record.holdQty : 0,
          phase: wasPhase,
          byPlayer,
          simTime: now,
        });
        if (byPlayer && bonded) {
          const price = probationLive ? KILL_REP_PROBATION : KILL_REP_FLIGHT;
          bus.emit('faction:repDelta', {
            factionId: 'faction_reach', delta: -price,
            reason: 'occupation_switch:bonded_hauler',
          });
          if (record.destFactionId && record.destFactionId !== 'faction_reach') {
            bus.emit('faction:repDelta', {
              factionId: record.destFactionId, delta: -Math.ceil(price / 2),
              reason: 'occupation_switch:bond_holder',
            });
          }
        }
        bus.emit('toast', {
          kind: 'warn', ttl: 5,
          text: hauled
            ? `The wreck field's picker crew lost their hauler — ${Math.round(record.holdQty)}u gone with it.`
            : wasPhase === 'established'
              ? 'The crew\'s second run ends in the black — the bond was already settled.'
              : 'The picker crew was murdered at their own depot — the take was already banked.',
        });
        if (byPlayer && bonded) {
          bus.emit('toast', {
            kind: 'warn', ttl: 5,
            text: probationLive
              ? `The depot calls its ${Math.round(record.bondCr)}cr bond — a probation crew's blood is on your manifest.`
              : 'The bond holder files on you — a licensed hull is not wreck-fair game.',
          });
        }
      }
    }
  }

  // Dwell's end: the crew recommissions exactly once — a fresh start at a different berth when
  // the sector has one, or the down-lane exit past the field line when it does not.
  function recommission(record, now) {
    const entity = actor(record);
    if (!entity || entity.alive === false || entity.data?.jobId || !entity.pos) return false;
    if (!helpers?.npcJobs?.assign) return false;
    // Home is the depot the crew actually dwells at — by stored id when known, else the
    // nearest station to the hull (a pre-expansion record still lands the same answer).
    const home = stationById(record.sectorId, record.destStationId)
      || stationFor(record.sectorId, entity.pos);
    const other = stationFor(record.sectorId, entity.pos, {
      entity: home,
      stationId: record.destStationId,
    });
    let target;
    let label;
    if (other) {
      const clear = (other.radius || 50) + STATION_ARRIVAL;
      const dx = entity.pos.x - other.pos.x;
      const dz = entity.pos.z - other.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      target = { x: other.pos.x + dx / len * clear, z: other.pos.z + dz / len * clear };
      label = 'Second berth — signed on';
      record.leg2StationId = other.data?.stationId != null ? String(other.data.stationId) : null;
    } else {
      // Down-lane: away from the field site through the depot's own heading — deterministic
      // per person when the field's own record is already gone.
      const fieldPos = fieldSiteFor(record, entity) || record.destPos || entity.pos;
      let dx = (record.destPos?.x ?? entity.pos.x) - (fieldPos?.x ?? 0);
      let dz = (record.destPos?.z ?? entity.pos.z) - (fieldPos?.z ?? 0);
      if (Math.hypot(dx, dz) < 1) {
        const ang = frac(hash32(state.meta?.seed || 1, record.personKey, 'occupationSwitch:downlane')) * Math.PI * 2;
        dx = Math.cos(ang); dz = Math.sin(ang);
      }
      const len = Math.hypot(dx, dz) || 1;
      const from = record.destPos || entity.pos;
      target = { x: from.x + dx / len * LEG2_OUTBOUND_WU, z: from.z + dz / len * LEG2_OUTBOUND_WU };
      label = 'Down-lane exit — the wreck trade behind them';
      record.leg2StationId = null;
    }
    const jobId = helpers.npcJobs.assign(entity, {
      kind: 'hauler', sectorId: record.sectorId, speed: HAULER_SPEED,
      route: [
        { id: `depot-offshift:${record.fieldId}`, pos: { x: entity.pos.x, z: entity.pos.z } },
        { id: record.leg2StationId ? `dest:${record.leg2StationId}` : 'downlane:out', pos: target, label },
      ],
      payload: { occupationSwitch: record.personKey, occupationSwitchLeg: 2 },
    });
    if (!jobId) {
      // A depot that will not sign is a dead end, not a wedge: after a bounded handful of
      // refusals the crew simply stays — 'settled' at the depot, hull released to ambient life.
      record.leg2Attempts = (record.leg2Attempts || 0) + 1;
      if (record.leg2Attempts >= 3) {
        // The refusal cap closes the arc through the same settle as a landed leg two: the
        // record latched, the close spoken once, and the parked hull released to ordinary
        // bookkeeping — not silently pinned to this module forever.
        settle(record, now);
      }
      return false;
    }
    // Latch the recommission before it is spoken — the emit must meet 'established'.
    record.phase = 'established';
    record.establishedAtS = now;
    record.haulerEntityId = entity.id;
    record.haulerEntityGen = occupantGenerationOf(entity);
    applyScanLabel(record, entity);
    shove(entity, target.x - entity.pos.x, target.z - entity.pos.z, LAUNCH_KICK_DV * 0.6);
    if (bus && typeof bus.emit === 'function') {
      bus.emit('occupation:recommissioned', {
        personKey: record.personKey,
        fieldId: record.fieldId,
        sectorId: record.sectorId,
        entityId: entity.id,
        jobId,
        leg: 2,
        stationId: record.leg2StationId,
        simTime: now,
      });
      bus.emit('toast', {
        kind: 'info', ttl: 5,
        text: record.leg2StationId
          ? 'The picker crew signs on for another run — the wreck trade made haulers of them.'
          : 'The picker crew ships out down-lane — the wreck trade is behind them.',
      });
    }
    return true;
  }

  // Restore / re-entry: a mid-delivery record rematerializes its one hauler from its own
  // durable record — same identity, same hold, same deterministic job id. Never a duplicate.
  // The same pass also clocks the probation window, runs the offshift dwell into the second
  // leg, and heals an 'established' record whose hull or job the restore could not produce.
  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    if (!helpers?.npcJobs || !state.world?.currentSectorId) return;
    const now = simNowOf(state);
    for (const record of Object.values(own().people)) {
      if (record.sectorId !== state.world.currentSectorId) continue;

      if (record.phase === 'delivered') {
        // Offshift at the ring: the dwell ends into exactly one recommission. A dwell-less
        // delivered record (hostile save, pre-dwell version) recommissions on first sight.
        if (record.dwellUntilS != null && now < record.dwellUntilS) continue;
        const existing = actor(record);
        if (existing && existing.alive !== false) {
          pinActor(record, existing);
          recommission(record, now);
        } else {
          // A live world row keeps the shelved hull coming back; a dead row — or none — says
          // the hull is gone without a kill receipt. Close the arc rather than wait on a corpse.
          const row = worldRowFor(record);
          if (!row) {
            record.phase = 'settled';
            record.settledAtS = now;
            actors.delete(record.personKey);
            speakSettled(record, now);
          } else if (!worldRowWillReturn(row)) {
            closeLostToDeadRow(record, now);
          }
        }
        continue;
      }

      if (record.phase === 'established') {
        const existing = actor(record);
        if (existing && existing.alive !== false) {
          pinActor(record, existing);
          if (!existing.data.jobId) recommissionFromRestore(record, existing, now);
          continue;
        }
        // A world-resident copy can be temporarily absent from the near entity table — but only
        // while its durable row still names a hull that can come back. A buried row never will.
        const row = worldRowFor(record);
        if (worldRowWillReturn(row)) continue;
        if (!row) {
          record.phase = 'settled'; // the second leg cannot be re-materialized honestly
          record.settledAtS = now;
          actors.delete(record.personKey);
          speakSettled(record, now);
        } else {
          closeLostToDeadRow(record, now);
        }
        continue;
      }

      if (record.phase !== 'salvage_hauler') continue;
      const existing = actor(record);
      if (!(record.holdQty > 0)) {
        // A hauler with nothing to haul never launched — a foreign or pre-expansion record
        // carrying an empty manifest closes dead rather than squatting on a live phase. If a
        // stamped hull somehow outlived the manifest it is an orphan citizen now, not ours.
        record.phase = 'spent';
        releaseToOrdinaryBookkeeping(existing, record);
        continue;
      }

      if (existing && existing.alive !== false) {
        pinActor(record, existing);
        // The probation clock is real on a restored hull too: bond stands, then the license.
        if (record.probationUntilS != null && record.licensedAtS == null && now >= record.probationUntilS) {
          record.licensedAtS = now;
          applyScanLabel(record, existing);
          if (bus && typeof bus.emit === 'function') {
            bus.emit('occupation:licensed', {
              personKey: record.personKey,
              fieldId: record.fieldId,
              sectorId: record.sectorId,
              simTime: now,
            });
          }
        }
        if (!existing.data.jobId) {
          const station = stationById(record.sectorId, record.destStationId)
            || stationFor(record.sectorId);
          if (station) assignDeliveryJob(existing, record, station);
        }
        continue;
      }
      const row = worldRowFor(record);
      if (worldRowWillReturn(row)) continue; // shelved live — the world hands the hull back
      if (row) {
        // The world already wrote this hull's ending and no kill receipt reached us: the take
        // died with it. Close lost once — never resurrect a crew the world already buried.
        closeLostToDeadRow(record, now);
        continue;
      }
      const station = stationById(record.sectorId, record.destStationId)
        || stationFor(record.sectorId);
      if (!station) continue;
      // Degenerate-restore guard: never spawn ON the destination — the delivery must be a real
      // flight. The last known position is used only when it is meaningfully away from the
      // depot; otherwise the hauler re-enters just outside the station ring.
      const last = state.entities?.get?.(record.haulerEntityId)?.pos;
      const ring = (station.radius || 50) + STATION_ARRIVAL;
      const away = last && Math.hypot(last.x - station.pos.x, last.z - station.pos.z) > ring;
      const spawnPos = away
        ? { x: last.x, z: last.z }
        : { x: station.pos.x - ring, z: station.pos.z };
      const entity = spawnHauler(record, spawnPos);
      if (!entity) continue;
      assignDeliveryJob(entity, record, station);
      record.haulerEntityId = entity.id;
      record.haulerEntityGen = occupantGenerationOf(entity);
    }
  }

  // A restored 'established' hull with no live job gets its second leg re-derived — the same
  // deterministic destination the original assignment chose.
  function recommissionFromRestore(record, entity, now) {
    if (record.phase !== 'established') return;
    record.phase = 'delivered';
    record.dwellUntilS = now; // due now — the ordinary recommission path picks the same target
    recommission(record, now);
  }

  function status() {
    return Object.values(own().people).map((rec) => ({
      personKey: rec.personKey,
      phase: rec.phase,
      fieldId: rec.fieldId,
      sectorId: rec.sectorId,
      holdQty: rec.holdQty,
      bondCr: rec.bondCr,
      probationUntilS: rec.probationUntilS,
      licensedAtS: rec.licensedAtS,
      destStationId: rec.destStationId,
      dwellUntilS: rec.dwellUntilS,
      legs: rec.legs,
      switchedAtS: rec.switchedAtS,
      deliveredAtS: rec.deliveredAtS,
      establishedAtS: rec.establishedAtS,
      settledAtS: rec.settledAtS,
      lostAtS: rec.lostAtS,
    }));
  }

  return { departed, jobComplete, killed, sync, clear: () => actors.clear(), status };
}
