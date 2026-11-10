// missionNextAction.js — SF-246 sim half ("mission progress points at the actual next action").
//
// One derivation from the mission owner's CANONICAL record to the one thing that can be done
// now — including the interrupted and partially-successful continuations — so a HUD chip and the
// journal read the same answer instead of maintaining a second objective-state machine. This
// module ADVANCES NOTHING and emits NOTHING: missions.js stays the single writer, and the phase
// is re-derived from the live record at every query, so it can never drift from the owner the
// way a UI phase cache would.
//
// Data, not prose: the rows name a phase, an action kind and the identity fields a screen needs
// (station, sector, commodity, quantities). Wording stays with the UI (missionLog's own text
// lanes remain the word-owners); this file is the shared truth both consumers may derive from.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): no mutation, no events, no Three.js, no Math.random.
// missions.js is consumed read-only through its public pure readers (partialDeliverySettlement,
// isMutationRecovery, bountyTargetLost); clauses through data/contractClauses.js; cargo through
// its seal readers. Never throws on malformed state — a malformed record derives nothing.

import { unsatisfiedRequiredConditions } from '../../data/contractClauses.js';
import { releasableContractUnits, sellableCargoQuantity } from '../../systems/cargo.js';
import {
  bountyTargetLost,
  isMutationRecovery,
  partialDeliverySettlement,
} from '../../systems/missions.js';

const CARRY_TYPES = new Set(['cargo_delivery', 'salvage_retrieval']);
// Types whose record names a destination the pilot travels to and closes out at.
const DESTINATION_TYPES = new Set([
  'cargo_delivery', 'passenger_transport', 'smuggling_run', 'salvage_retrieval', 'bulk_trade',
]);

function cleanInt(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function activeMissions(state) {
  const active = state && state.missions && Array.isArray(state.missions.active)
    ? state.missions.active
    : [];
  return active.filter((m) => m && m.status === 'active');
}

/** The tracked mission when it is still active, else the first active one, else null. */
export function trackedMission(state) {
  const active = activeMissions(state);
  if (!active.length) return null;
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (trackedId != null) {
    const tracked = active.find((m) => m.id === trackedId);
    if (tracked) return tracked;
  }
  return active[0];
}

function readEntity(state, id) {
  if (id == null || !state || !state.entities) return null;
  const entities = state.entities;
  if (typeof entities.get === 'function') return entities.get(id) || null;
  if (typeof entities === 'object') return entities[id] || null;
  return null;
}

// A target that is PRESENT and flagged dead is dead. An unresolvable id is UNKNOWN — the
// sector may simply not have rematerialized it yet — and "unknown" must never be reported as
// a lost target: the row keeps pointing at the hunt until the owner's own record says it ended.
function entityDead(state, id) {
  const entity = readEntity(state, id);
  return !!entity && entity.alive === false;
}

function blockedClauses(mission) {
  let blocked = [];
  try {
    blocked = unsatisfiedRequiredConditions(mission) || [];
  } catch {
    blocked = [];
  }
  return blocked.map((clause) => ({
    id: clause && clause.id != null ? String(clause.id) : null,
    label: clause && clause.label != null ? String(clause.label) : null,
    pendingText: clause && clause.pendingText != null ? String(clause.pendingText) : null,
  }));
}

function clockRow(state, mission) {
  const deadline = Number(mission && mission.deadline_s);
  if (!Number.isFinite(deadline)) return null;
  const now = Number(state && state.simTime);
  const remainingS = Number.isFinite(now) ? deadline - now : null;
  return {
    deadlineS: deadline,
    remainingS: remainingS != null && Number.isFinite(remainingS) ? Math.round(remainingS) : null,
    // Same urgency line continueRecap draws (< 2 min): the clock is a risk, not a phase.
    urgent: remainingS != null && Number.isFinite(remainingS) && remainingS < 120,
  };
}

function destinationRow(mission) {
  const stationId = mission && mission.destStationId != null ? String(mission.destStationId) : null;
  const sectorId = mission && mission.destSectorId != null ? String(mission.destSectorId) : null;
  if (!stationId && !sectorId) return null;
  return { stationId, sectorId };
}

/**
 * Where the pilot stands relative to the destination, from live world state only: inSector when
 * the destination names no sector, or the current sector is it. Finer "at the berth" reads are
 * the nav/waypoint layer's business; the sim row only needs the sector gate.
 */
function locationRow(state, destination) {
  if (!destination) return { inSector: true };
  const currentSectorId = state && state.world && state.world.currentSectorId;
  const inSector = destination.sectorId == null
    || (currentSectorId != null && String(currentSectorId) === destination.sectorId);
  return { inSector };
}

/** Carry-and-deliver truth: how much of the contract's good the hold can actually settle with. */
function carryRow(state, mission) {
  const params = (mission && mission.params) || {};
  const commodityId = typeof params.cmdtyId === 'string' ? params.cmdtyId : null;
  if (!commodityId) return null;
  const preloaded = mission.preloadedCargo === true;
  const need = preloaded
    ? cleanInt(params.sealedRemaining != null ? params.sealedRemaining : params.qty)
    : cleanInt(params.qty);
  if (!(need > 0)) return null;
  let have = 0;
  try {
    have = preloaded
      ? cleanInt(releasableContractUnits(state, mission))
      : cleanInt(sellableCargoQuantity(state, commodityId));
  } catch {
    have = 0;
  }
  const deliverable = Math.min(have, need);
  // A partial delivery is a real branch, not a failure: the owner settles short manifests.
  let partialSettlement = null;
  try {
    const settlement = partialDeliverySettlement(mission, state);
    if (settlement && settlement.deliverQty > 0 && settlement.deliverQty < need) {
      partialSettlement = {
        deliverQty: cleanInt(settlement.deliverQty),
        payCr: Math.max(0, Math.round(Number(settlement.payCr) || 0)),
      };
    }
  } catch {
    partialSettlement = null;
  }
  return { commodityId, need, have, deliverable, partialSettlement };
}

function progressRow(mission) {
  const have = Math.max(0, cleanInt(mission && mission.objectiveProgress));
  const need = Math.max(1, cleanInt(mission && mission.objectiveTarget));
  return { have, need, done: have >= need };
}

/**
 * missionNextActionRow(state, mission) -> derivation row
 *
 * Phase precedence — each step answers from the owner's live record, first match wins:
 *   1. blocked      a required contract term is unsatisfied (settle it before anything else)
 *   2. target_lost  every named bounty target is dead/gone below target progress — never point
 *                   at a destroyed target; the row says the hunt is over-unfilled
 *   3. acquire      the contract's carry is short in the hold (sealed or loose, via cargo's own
 *                   seal readers); `partialSettlement` carries the short-manifest branch
 *   4. turn_in      the carry is satisfied and the pilot stands at the destination berth
 *   5. travel       the destination names another sector than the one the pilot is in
 *   6. perform      progress-based work (scan/patrol/escort/hunt) still short of target
 *   7. done         progress target met — close it out at the owner's turn-in
 * `recovery` flags the salvage-mutation recovery branch (a still-available continuation, not a
 * failure), and `clock` carries the deadline risk on every row.
 */
export function missionNextActionRow(state, mission) {
  if (!mission || mission.status !== 'active') return null;
  const type = typeof mission.type === 'string' ? mission.type : null;
  const row = {
    missionId: mission.id != null ? String(mission.id) : null,
    title: mission.title != null ? String(mission.title) : null,
    type,
    status: mission.status,
    phase: 'perform',
    action: null,
    progress: null,
    carry: null,
    destination: (() => {
      const destination = destinationRow(mission);
      return destination ? Object.freeze(destination) : null;
    })(),
    blockedClauses: blockedClauses(mission),
    recovery: (() => { try { return isMutationRecovery(mission); } catch { return false; } })(),
    clock: clockRow(state, mission),
  };

  // 1. A blocking contract term holds everything else.
  if (row.blockedClauses.length) {
    row.phase = 'blocked';
    row.action = Object.freeze({ kind: 'settle_clause', clauseId: row.blockedClauses[0].id });
    return Object.freeze(row);
  }

  // 2. A bounty whose named targets are all gone must not keep pointing at them.
  if (type === 'bounty_hunt' && Array.isArray(mission.targetEntityIds) && mission.targetEntityIds.length) {
    const ids = mission.targetEntityIds;
    const progress = progressRow(mission);
    row.progress = Object.freeze(progress);
    const anyAlive = ids.some((id) => !entityDead(state, id));
    if (!anyAlive && !progress.done) {
      row.phase = 'target_lost';
      row.action = Object.freeze({ kind: 'report' });
      return Object.freeze(row);
    }
  }

  // 3-5. Carry contracts answer from the hold's own truth, then from the destination.
  const carry = carryRow(state, mission);
  if (carry) row.carry = Object.freeze(carry);
  const destination = row.destination;
  const location = locationRow(state, destination);
  if (carry && carry.deliverable < carry.need) {
    row.phase = 'acquire';
    row.action = Object.freeze({
      kind: 'acquire',
      commodityId: carry.commodityId,
      qty: carry.need - carry.deliverable,
      partialDeliverable: carry.partialSettlement ? carry.partialSettlement.deliverQty : 0,
    });
    return Object.freeze(row);
  }
  if (carry && carry.deliverable >= carry.need) {
    row.phase = 'turn_in';
    row.action = Object.freeze({
      kind: 'dock',
      stationId: destination ? destination.stationId : null,
      sectorId: destination ? destination.sectorId : null,
      commodityId: carry.commodityId,
      qty: carry.deliverable,
      partial: carry.partialSettlement != null,
    });
    return Object.freeze(row);
  }
  if (type === 'bulk_trade') {
    // The trade contract's buy leg is work the market screen owns; the sim truth is whether the
    // destination demand still stands ahead of the pilot.
    row.phase = location.inSector ? 'perform' : 'travel';
    row.action = Object.freeze(location.inSector
      ? { kind: 'trade', stationId: destination ? destination.stationId : null }
      : { kind: 'travel', stationId: destination ? destination.stationId : null, sectorId: destination ? destination.sectorId : null });
    return Object.freeze(row);
  }
  if (DESTINATION_TYPES.has(type) && destination && !location.inSector) {
    row.phase = 'travel';
    row.action = Object.freeze({
      kind: 'travel',
      stationId: destination.stationId,
      sectorId: destination.sectorId,
    });
    return Object.freeze(row);
  }
  if (destination && location.inSector && (type === 'passenger_transport' || type === 'smuggling_run')) {
    row.phase = 'turn_in';
    row.action = Object.freeze({
      kind: 'dock',
      stationId: destination.stationId,
      sectorId: destination.sectorId,
    });
    return Object.freeze(row);
  }

  // 6-7. Progress contracts read the owner's own counters.
  const progress = progressRow(mission);
  row.progress = Object.freeze(progress);
  if (progress.done) {
    row.phase = 'done';
    row.action = Object.freeze({
      kind: 'dock',
      stationId: destination ? destination.stationId : null,
      sectorId: destination ? destination.sectorId : null,
    });
    return Object.freeze(row);
  }
  row.phase = 'perform';
  row.action = Object.freeze({ kind: type === 'bounty_hunt' ? 'engage' : 'perform' });
  return Object.freeze(row);
}

/**
 * nextMissionAction(state) -> derivation row | null
 * The tracked-or-first active mission's row; null when nothing is active. This is the one
 * "what can be done now" read the HUD chip and the journal header may both consume.
 */
export function nextMissionAction(state) {
  const mission = trackedMission(state);
  return mission ? missionNextActionRow(state, mission) : null;
}
