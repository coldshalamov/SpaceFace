// src/ai/ambientPredation.js — ambient manifest predation ("the world hunts without the player").
//
// encounterDirector's 1 Hz tick runs this evaluator: an idle, non-lawful team-1 pirate that shares
// a low-security, lane-adjacent pocket with a manifested civilian hauler may be bound into a
// bounded ambient raid. The binding rides the same predation stamps as scripted predation
// (data.predationRole / ai.predationTargetId / ai.predationObjective) so the final fire gate in
// engagementAuthority stays a single seam — but every raid id carries the `ambient:raid:` prefix,
// so scripted ownership is never impersonated and stale bindings fail closed.
//
// Determinism: cadence, pairing order, telegraph jitter, deadlines and cooldowns all derive from
// state.simTime, state.tick, stable entity ids and the run seed. No Math.random, no wall clock.
// Save safety: evaluator state is ephemeral. data.predation* fields do not survive the durable
// record boundary; the ai-bag fields that DO (predationStatus, predationObjective, ambientRestore)
// are swept fail-closed by maintainAmbientPredationRaids the first time a rematerialized entity is
// seen — a stale raider binding always resolves to its snapped pre-raid doctrine.
//
// Lifecycle: telegraph (hold-fire stalk) → active (weapons free; traffic machinery spills cargo,
//   broadcasts distress, flees, opens law incidents on its own) → cargo_recovery (TRANSIT onto the
//   spilled pods; physical pickup does the looting) → cargo_escape (FLEE to a deterministic escape
//   vector) → clear (snapshot restore + cooldowns). Raider death/disable respills any secured cargo.
//   Player damage on a bound raider converts it to ordinary self-defense retaliation and releases
//   the raid — that conversion lives in releaseBoundPredationRaider().

import { hash32, mulberry32 } from '../core/rng.js';
import { zonesForSector } from '../data/sectorZones.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { effectiveRegionalSecurity } from '../systems/regionalEcology.js';
import {
  ActivityKind,
  RulesOfEngagement,
  setEntityDoctrine,
} from './doctrine.js';
import { normalizeCombatDoctrineId } from './combatDoctrine.js';
import { stableId } from './contracts.js';
import {
  AMBIENT_OBJECTIVE_KIND,
  AMBIENT_PREDATION_MOTIVE,
  AMBIENT_PREDATION_TRIGGER,
  isAmbientRaidId,
  protectedStationAt,
} from './engagementAuthority.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../systems/lootShards.js';

export const AMBIENT_PREDATION = Object.freeze({
  evalPeriodS: 2,            // pairing cadence inside the director's 1 Hz tick
  maxActiveRaids: 1,         // concurrent ambient raids per sector — deterministic cap
  maxSectorSecurity: 0.55,   // effective regional security ceiling — frontier space only
  pairRadiusWu: 1500,        // assignment only inside the raider's own ~1600 WU sensor bubble
  lawPresenceRadiusWu: 2800, // any lawful hull or lawful station this near the victim suppresses
  leashWu: 2400,             // raider↔victim leash while bound
  telegraphSMin: 3,          // hold-fire stalk before weapons free
  telegraphSJitterS: 1.5,    // deterministic per-raid jitter on top of the base window
  objectiveS: 90,            // raid deadline
  escapeHoldS: 3,            // leash breach must hold this long before the raid releases
  escapeRadiusWu: 1800,      // raider "escaped" once this far from its escape origin
  escapeDeadlineS: 25,       // hard cap on the escape phase
  recoveryDeadlineS: 30,     // hard cap on pod pickup
  raiderCooldownS: 120,      // per-raider refractory after any cleared raid
  victimCooldownS: 90,       // per-victim refractory — a hauler is not instantly re-raided
  securedCargoCap: 8,        // secured loot lines carried on the objective (bounded)
  jettisonCooldownS: 4,      // one pressure-ditch per window — a chase knocks loot loose in lumps
  jettisonFraction: 0.34,    // each pressured ditch sheds about a third of the heaviest line
  laneMarginWu: 500,         // victim may sit just outside a lane disc and still count lane-adjacent
  maxRaidScan: 64,           // sweep cap — malformed states cannot unbound the scan
});

const LANE_ZONE_TYPES = new Set(['trade_lane', 'patrol_corridor', 'ambush_lane']);
// Victim roles that the traffic violence machinery can actually dump/spill cargo for
// (CIVILIAN_HAULER_DUMP_ROLES in systems/traffic.js — kept aligned by contract, not import).
const AMBIENT_VICTIM_ROLES = new Set(['hauler', 'shuttle', 'tanker', 'arclight']);
// Lawful station factions — mirrors LAWFUL_STATION_FACTIONS in engagementAuthority.js so the
// evaluator can pre-filter victims sitting under patrol coverage before the relation runs.
const LAWFUL_STATION_FACTIONS = new Set([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_free',
]);
const RESTORE_SNAPSHOT_KEY = 'ambientRestore';
const BOUND_STATUSES = new Set([
  'standby', 'telegraph', 'active', 'cargo_recovery', 'cargo_escape', 'cargo_respilled',
]);
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c && c.id, c]));

export function ambientObjective(entity) {
  const ai = entity && entity.data && entity.data.ai;
  const objective = ai && ai.predationObjective;
  return objective && objective.kind === AMBIENT_OBJECTIVE_KIND ? objective : null;
}

export function isAmbientPredationRaider(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  if (ambientObjective(entity)) return true;
  return data.predationRole === 'raider' && isAmbientRaidId(data.predationEncounterId);
}

/**
 * Live ambient raiders (entities carrying an ambient objective or ambient raider stamps).
 * Also catches the stale rematerialization shape: rec.ai persists predationObjective across the
 * durable boundary while data.predationRole does not — those appear here and get swept clear.
 */
export function ambientRaidersOf(state) {
  const out = [];
  const entities = entityScan(state);
  for (const entity of entities) {
    if (!entity || entity.type !== 'ship') continue;
    if (ambientObjective(entity) || isAmbientPredationRaider(entity)) {
      out.push(entity);
      if (out.length >= AMBIENT_PREDATION.maxRaidScan) break;
    }
  }
  return out;
}

/** Orphaned ambient victim stamps: ambient predationEncounterId whose raid has no live raider. */
function ambientVictimsOf(state) {
  const out = [];
  for (const entity of entityScan(state)) {
    const data = entity && entity.data;
    if (!data || data.predationRole !== 'manifest_carrier') continue;
    if (!isAmbientRaidId(data.predationEncounterId)) continue;
    out.push(entity);
    if (out.length >= AMBIENT_PREDATION.maxRaidScan) break;
  }
  return out;
}

function ensureAmbientState(state) {
  const dir = state.encounterDirector || (state.encounterDirector = {});
  const ambient = dir.ambientPredation || (dir.ambientPredation = {});
  if (!Number.isFinite(ambient.nextEvalAt)) ambient.nextEvalAt = -Infinity;
  if (!Number.isInteger(ambient.seq)) ambient.seq = 0;
  return ambient;
}

/**
 * Director-owned 1 Hz entry point. Maintenance runs every call (deadline/leash fidelity); pairing
 * evaluates on its own cadence and only while the player is undocked in an eligible sector.
 */
export function updateAmbientPredation(state, ctx = {}) {
  if (!state) return;
  const ambient = ensureAmbientState(state);
  maintainAmbientPredationRaids(state, ambient, ctx);
  const now = simNow(state);
  if (now < ambient.nextEvalAt) return;
  ambient.nextEvalAt = now + AMBIENT_PREDATION.evalPeriodS;
  evaluateAmbientPairing(state, ambient, ctx);
}

// ── maintenance: phase transitions, bounded clears ──────────────────────────────────────────────

export function maintainAmbientPredationRaids(state, ambient, ctx = {}) {
  const now = simNow(state);
  const tick = tickNow(state);
  const raiders = ambientRaidersOf(state);
  const liveRaidIds = new Set();
  for (const raider of raiders) {
    const ai = raider.data && raider.data.ai;
    const objective = ambientObjective(raider);
    const raidId = objective ? objective.raidId
      : raider.data && isAmbientRaidId(raider.data.predationEncounterId)
        ? raider.data.predationEncounterId : null;
    if (raidId) liveRaidIds.add(raidId);
    if (!raider || raider.alive === false) {
      // Dead entities normally route through entity:killed; a corpse without the event still loses
      // its binding here so a stale id can never hold a victim hostage.
      releaseAmbientRaid(state, raidId, 'raider_lost', ctx, { raider });
      continue;
    }
    if (!objective || !ai) {
      // Partial stamp (e.g. role survived without an objective): release whatever is left.
      releaseAmbientRaid(state, raidId, 'binding_incomplete', ctx, { raider });
      continue;
    }
    const victim = entityById(state, objective.targetId);
    if (!victim || victim.alive === false || victim.type !== 'ship') {
      releaseAmbientRaid(state, raidId, victim && victim.alive === false ? 'target_destroyed' : 'target_lost', ctx, { raider });
      continue;
    }
    const victimData = victim.data || {};
    if (victimData.predationEncounterId !== raidId
      || victimData.predationIdentityKey !== objective.targetIdentityKey
      || victimData.predationRole !== 'manifest_carrier') {
      releaseAmbientRaid(state, raidId, 'target_lost', ctx, { raider });
      continue;
    }
    if (targetDisabled(state, victim)) {
      releaseAmbientRaid(state, raidId, 'target_disabled', ctx, { raider });
      continue;
    }
    if (!manifestCarriedBy(victim, objective.manifestId)) {
      releaseAmbientRaid(state, raidId, 'custody_changed', ctx, { raider });
      continue;
    }
    if (tick > objective.deadlineTick
      || (Number.isFinite(objective.deadlineAt) && now > objective.deadlineAt)) {
      releaseAmbientRaid(state, raidId, 'objective_timeout', ctx, { raider });
      continue;
    }
    const status = ai.predationStatus;
    const leash = Number.isFinite(Number(ai.predationLeashRadius))
      ? Number(ai.predationLeashRadius) : Number(objective.leashRadius) || AMBIENT_PREDATION.leashWu;
    if ((status === 'telegraph' || status === 'active')
      && separated2(raider.pos, victim.pos) > leash * leash) {
      if (objective.awaySince == null) objective.awaySince = now;
      if (now - objective.awaySince >= AMBIENT_PREDATION.escapeHoldS) {
        releaseAmbientRaid(state, raidId, 'target_escaped', ctx, { raider });
      }
      continue;
    }
    objective.awaySince = null;

    if (status === 'telegraph' && now >= objective.engageAt) {
      ai.predationStatus = 'active';
      // Re-stamp the same attack run with weapons free — the doctrine's response window was
      // counted from the bind's startedTick, so it is already armed.
      setEntityDoctrine(raider, {
        activity: ai.activity,
        roe: RulesOfEngagement.WEAPONS_FREE,
      });
      emit(ctx, 'encounter:ambientPredationEngaged', {
        raidId,
        raiderId: raider.id,
        targetId: victim.id,
        manifestId: objective.manifestId,
        t: now,
      });
      continue;
    }
    // Still inside the bounded stalk window — hold-fire approach, nothing to reconcile this tick.
    if (status === 'telegraph') continue;
    if (status === 'active') {
      // The hauler dumped under fire (traffic's violence machinery) — switch to pod pickup.
      const victimData2 = victim.data;
      if (victimData2 && victimData2.violenceCargoSpilled === true) {
        beginAmbientRecovery(state, raider, victim, objective, raidId);
      }
      continue;
    }
    if (status === 'cargo_recovery') {
      tickAmbientRecovery(state, raider, victim, objective, raidId, now, tick, ctx);
      continue;
    }
    if (status === 'cargo_escape') {
      const escaped = objective.escapeOrigin
        && separated2(raider.pos, objective.escapeOrigin) >= objective.escapeRadius * objective.escapeRadius;
      if (escaped || now >= (objective.escapeDeadlineAt || now)) {
        releaseAmbientRaid(state, raidId, 'escaped', ctx, { raider });
      }
      continue;
    }
    // 'cargo_respilled' residue or an unknown status with a live objective survives only until the
    // objective deadline check above; 'cleared'/null/anything else releases immediately so a
    // malformed binding can never hold the pair hostage.
    if (status === 'cargo_respilled') continue;
    releaseAmbientRaid(state, raidId, 'binding_incomplete', ctx, { raider });
  }
  // Victim stamps whose raider vanished (sector shelf, hand teardown) release on their own.
  for (const victim of ambientVictimsOf(state)) {
    const raidId = victim.data.predationEncounterId;
    if (!liveRaidIds.has(raidId)) {
      clearAmbientPredationBinding(state, victim, raidId, 'raider_lost');
    }
  }
}

function beginAmbientRecovery(state, raider, victim, objective, raidId) {
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_recovery';
  objective.recoverUntilAt = simNow(state) + AMBIENT_PREDATION.recoveryDeadlineS;
  objective.podIds = spilledPodIdsFor(state, victim);
}

function tickAmbientRecovery(state, raider, victim, objective, raidId, now, tick, ctx) {
  const ai = raider.data.ai;
  const pods = (objective.podIds || [])
    .map((id) => entityById(state, id))
    .filter((pod) => pod && pod.alive !== false);
  // Violence-spilled freight is `type:'payload'` jettisoned cargo — a beam/salvage object, not a
  // contact pickup — so the raid consumes pods deterministically at doctrine-hold range here
  // rather than waiting on a pickup:collected that payload entities never emit.
  const inFlight = [];
  for (const pod of pods) {
    const contactRange = Math.max(1,
      (Number(raider.radius) || 0) + (Number(pod.radius) || 0) - 4) + 6;
    if (separated2(raider.pos, pod.pos) <= contactRange * contactRange) {
      secureAmbientPod(state, raider, pod, objective, raidId, now, ctx);
    } else {
      inFlight.push(pod);
    }
  }
  objective.podIds = inFlight.map((pod) => pod.id);
  if (!inFlight.length) {
    if ((objective.securedQty | 0) > 0) {
      beginAmbientEscape(state, raider, victim, objective, now, tick, raidId);
    } else {
      releaseAmbientRaid(state, raidId, 'cargo_lost', ctx, { raider });
    }
    return;
  }
  if (now >= objective.recoverUntilAt) {
    if ((objective.securedQty | 0) > 0) beginAmbientEscape(state, raider, victim, objective, now, tick, raidId);
    else releaseAmbientRaid(state, raidId, 'recovery_timeout', ctx, { raider });
    return;
  }
  inFlight.sort((a, b) => separated2(raider.pos, a.pos) - separated2(raider.pos, b.pos)
    || compareStableIds(a.id, b.id));
  const nearest = inFlight[0];
  const contactRange = Math.max(1,
    (Number(raider.radius) || 0) + (Number(nearest.radius) || 0) - 4);
  setEntityDoctrine(raider, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason: 'ambient:pod_recovery',
      anchor: nearest.pos ? { x: nearest.pos.x, z: nearest.pos.z } : raider.pos,
      leashRadius: objective.leashRadius,
      preferredRange: contactRange,
      startedTick: tick,
      targetId: nearest.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/**
 * Consume one spilled pod into the raider's secured ledger. Removal goes through the canonical
 * entity lifecycle helper (core owns removal); without it the pod is marked dead so the same
 * deterministic rule still holds in minimal harnesses.
 */
function secureAmbientPod(state, raider, pod, objective, raidId, now, ctx) {
  const data = pod && pod.data || {};
  const pool = data.salvagePool && typeof data.salvagePool === 'object' ? data.salvagePool : null;
  const lines = pool
    ? Object.entries(pool)
        .map(([commodityId, qty]) => ({ commodityId, qty: Math.floor(Number(qty) || 0) }))
        .filter((line) => line.qty > 0 && typeof line.commodityId === 'string')
    : [{ commodityId: data.commodityId || null, qty: Math.floor(Number(data.amount) || 0) }]
        .filter((line) => line.qty > 0 && typeof line.commodityId === 'string');
  if (!Array.isArray(objective.secured)) objective.secured = [];
  for (const line of lines) {
    pushSecuredLine(objective, line);
  }
  if (typeof ctx.removeEntity === 'function') ctx.removeEntity(pod.id, { reason: 'ambient_cargo_secured' });
  else pod.alive = false;
  emit(ctx, 'encounter:ambientCargoSecured', {
    raidId,
    raiderId: raider.id,
    podId: pod.id,
    commodityId: data.commodityId || (lines[0] && lines[0].commodityId) || null,
    qty: lines.reduce((sum, line) => sum + line.qty, 0),
    t: now,
  });
}

function beginAmbientEscape(state, raider, victim, objective, now, tick, raidId) {
  const ai = raider.data.ai;
  const seed = state.meta && state.meta.seed;
  const rng = mulberry32(hash32(seed == null ? 0 : seed, raidId, 'escape'));
  let dx = raider.pos.x - victim.pos.x;
  let dz = raider.pos.z - victim.pos.z;
  let len = Math.hypot(dx, dz);
  if (!(len > 0.001)) {
    const angle = rng() * Math.PI * 2;
    dx = Math.cos(angle); dz = Math.sin(angle); len = 1;
  }
  const radius = AMBIENT_PREDATION.escapeRadiusWu;
  objective.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  objective.escapeRadius = radius;
  objective.escapeDeadlineAt = now + AMBIENT_PREDATION.escapeDeadlineS;
  objective.escapeTarget = {
    x: raider.pos.x + (dx / len) * radius * 1.25,
    z: raider.pos.z + (dz / len) * radius * 1.25,
  };
  ai.predationStatus = 'cargo_escape';
  setEntityDoctrine(raider, {
    activity: {
      kind: ActivityKind.FLEE,
      reason: 'ambient:loot_escape',
      anchor: objective.escapeTarget,
      leashRadius: radius * 1.5,
      startedTick: tick,
      deadlineTick: tick + Math.ceil(AMBIENT_PREDATION.escapeDeadlineS * 60),
      targetId: null,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** pickup:collected hook routed from the director — credits the pod to the raider that ate it. */
export function ambientPickupCollected(state, payload) {
  const p = payload || {};
  if (p.collectorId == null || p.pickupId == null) return false;
  const collector = entityById(state, p.collectorId);
  const objective = collector && ambientObjective(collector);
  if (!objective || !Array.isArray(objective.podIds)) return false;
  const idx = objective.podIds.indexOf(p.pickupId);
  if (idx < 0) return false;
  objective.podIds.splice(idx, 1);
  const qty = Math.max(0, Math.floor(Number(p.amount) || 0));
  if (qty > 0) {
    pushSecuredLine(objective, { commodityId: p.commodityId || null, qty });
  }
  return true;
}

/** One secured line in, ledger honest: same-commodity merges, and a cap splice subtracts the
 *  dropped qty from securedQty so the ledger never counts freight that left the book. */
function pushSecuredLine(objective, line) {
  if (!line || typeof line.commodityId !== 'string' || !(Number(line.qty) > 0)) return;
  if (!Array.isArray(objective.secured)) objective.secured = [];
  const existing = objective.secured.find((row) => row.commodityId === line.commodityId);
  if (existing) existing.qty += line.qty;
  else objective.secured.push({ commodityId: line.commodityId, qty: line.qty });
  objective.securedQty = (objective.securedQty | 0) + line.qty;
  if (objective.secured.length > AMBIENT_PREDATION.securedCargoCap) {
    const droppedLines = objective.secured.splice(0,
      objective.secured.length - AMBIENT_PREDATION.securedCargoCap);
    for (const row of droppedLines) {
      objective.securedQty = Math.max(0, (objective.securedQty | 0) - (Number(row.qty) | 0));
    }
  }
}

/**
 * entity:killed / entity:destroyed hook — a dead raider drops whatever it already secured back
 * into the world (ordinary wreck residue), then its binding releases.
 */
export function ambientRaiderDestroyed(state, entity, ctx = {}) {
  const data = entity && entity.data;
  if (!data) return false;
  const objective = ambientObjective(entity);
  // Only the raider's own death resolves here — the victim carrier wears the same
  // predationEncounterId stamp, and releasing it as 'raider_destroyed' would mislabel the
  // cleared row and strand the real raider's binding (the maintain sweep owns victim deaths
  // as 'target_destroyed'). A bound raider keeps its role on the objective once the durable
  // boundary strips data.predation*.
  const isRaider = !!objective || data.predationRole === 'raider';
  const raidId = objective ? objective.raidId
    : (isRaider && isAmbientRaidId(data.predationEncounterId))
      ? data.predationEncounterId : null;
  const loot = data.ai && data.ai.stolenLoot;
  const hasLoot = !!(loot && Array.isArray(loot.lines)
    && loot.lines.some((line) => line && (Number(line.qty) | 0) > 0));
  if (!raidId && !hasLoot) return false;
  if (objective) respillAmbientSecured(state, entity, objective, ctx);
  // A released raider carries its score in ai.stolenLoot — killing it later still drops the
  // freight it kept. Idempotent with entity:killed/entity:destroyed both routing here: the
  // first call drains the ledger so the second drops nothing.
  if (hasLoot) respillStolenLoot(state, entity, ctx);
  if (raidId) releaseAmbientRaid(state, raidId, 'raider_destroyed', ctx, { raider: entity });
  return true;
}

/**
 * Sustained fire knocks stolen freight loose: any attacker pressuring a hull that still holds a
 * live secured ledger (bound raid) or a durable stolenLoot (escaped/released) makes it ditch the
 * heaviest line as a real pod — a pursuit that lands hits recovers the load piecemeal instead of
 * all-or-nothing on the kill. One ditch per cooldown window, deterministic.
 */
export function ambientJettisonUnderPressure(state, entity, attackerId, ctx = {}) {
  const data = entity && entity.data;
  const ai = data && data.ai;
  if (!ai || attackerId == null || attackerId === entity.id || entity.alive === false) return 0;
  if (typeof ctx.spawnCargoPod !== 'function' || !entity.pos) return 0;
  const objective = ambientObjective(entity);
  const onObjective = !!(objective && Array.isArray(objective.secured)
    && objective.secured.some((line) => line && (Number(line.qty) | 0) > 0));
  const loot = !onObjective && ai.stolenLoot && Array.isArray(ai.stolenLoot.lines) ? ai.stolenLoot : null;
  const lines = onObjective ? objective.secured : (loot && loot.lines) || null;
  if (!lines || !lines.length) return 0;
  const now = simNow(state);
  if (now < (Number(ai.stolenLootNextJettisonAt) || 0)) return 0;
  // Ditch the heaviest line first — the load it sheds is the load that was slowing it down.
  let line = null;
  for (const row of lines) {
    if (row && typeof row.commodityId === 'string' && (Number(row.qty) | 0) > 0
        && (!line || row.qty > line.qty
        || (row.qty === line.qty && String(row.commodityId) < String(line.commodityId)))) line = row;
  }
  if (!line) return 0;
  const dump = Math.min(line.qty, Math.max(1, Math.ceil(line.qty * AMBIENT_PREDATION.jettisonFraction)));
  const pod = ctx.spawnCargoPod(state, {
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: (entity.vel && entity.vel.x) || 0, z: (entity.vel && entity.vel.z) || 0 },
    radius: 6,
    commodityId: line.commodityId,
    amount: dump,
    unitMass: 0.8,
    factionId: entity.factionId || 'faction_reach',
    ownerId: entity.id,
  });
  if (!pod) return 0;
  // The cooldown binds once the ditch actually exists — a failed spawn doesn't burn the window.
  ai.stolenLootNextJettisonAt = now + AMBIENT_PREDATION.jettisonCooldownS;
  const provenanceVictimId = onObjective
    ? (objective.targetId != null ? objective.targetId : null)
    : (loot.victimId != null ? loot.victimId : null);
  const provenanceManifestId = onObjective
    ? (objective.manifestId || null)
    : (loot.manifestId || null);
  if (pod.data) {
    pod.data.spillCause = 'pressure_jettison';
    pod.data.attackerId = attackerId;
    if (provenanceVictimId != null) pod.data.stolenFromId = provenanceVictimId;
    if (provenanceManifestId != null) pod.data.manifestId = provenanceManifestId;
  }
  line.qty -= dump;
  if (onObjective) {
    objective.securedQty = Math.max(0, (objective.securedQty | 0) - dump);
    objective.secured = objective.secured.filter((row) => row && (Number(row.qty) | 0) > 0);
  } else {
    loot.lines = loot.lines.filter((row) => row && (Number(row.qty) | 0) > 0);
    if (!loot.lines.length) delete ai.stolenLoot;
  }
  emit(ctx, 'encounter:ambientCargoJettisoned', {
    raidId: (objective && objective.raidId)
      || (data && isAmbientRaidId(data.predationEncounterId) ? data.predationEncounterId : null),
    raiderId: entity.id,
    attackerId,
    podId: pod.id,
    commodityId: line.commodityId,
    qty: dump,
    t: now,
  });
  return dump;
}

/** The durable half of the same drop: ai.stolenLoot (post-release cargo kept aboard) returns to
 *  the world as ordinary jettisoned pods at the raider's position, with victim/manifest
 *  provenance so the goods still read as what they are — somebody else's freight. */
function respillStolenLoot(state, raider, ctx) {
  const ai = raider && raider.data && raider.data.ai;
  const loot = ai && ai.stolenLoot;
  const lines = loot && Array.isArray(loot.lines) ? loot.lines : [];
  if (!lines.length) return 0;
  if (typeof ctx.spawnCargoPod !== 'function' || !raider.pos) {
    delete ai.stolenLoot;
    return 0;
  }
  let dropped = 0;
  const kept = [];
  for (const line of lines) {
    if (!line || typeof line.commodityId !== 'string' || !(Number(line.qty) > 0)) continue;
    const pod = ctx.spawnCargoPod(state, {
      pos: { x: raider.pos.x, z: raider.pos.z },
      vel: { x: (raider.vel && raider.vel.x) || 0, z: (raider.vel && raider.vel.z) || 0 },
      radius: 6,
      commodityId: line.commodityId,
      amount: Math.floor(Number(line.qty)),
      unitMass: 0.8,
      factionId: raider.factionId || 'faction_reach',
      ownerId: raider.id,
    });
    if (pod) {
      if (pod.data) {
        pod.data.spillCause = 'raider_destroyed';
        if (loot.victimId != null) pod.data.stolenFromId = loot.victimId;
        if (loot.manifestId != null) pod.data.manifestId = loot.manifestId;
      }
      dropped += Math.floor(Number(line.qty));
    } else {
      // A line that couldn't take physical form stays on the ledger for a later drain —
      // killing a raider never makes cargo evaporate silently.
      kept.push(line);
    }
  }
  if (kept.length) loot.lines = kept;
  else delete ai.stolenLoot;
  return dropped;
}

function respillAmbientSecured(state, raider, objective, ctx) {
  if (!objective || (objective.securedQty | 0) <= 0) return 0;
  if (typeof ctx.spawnCargoPod !== 'function' || !raider.pos) {
    objective.securedQty = 0;
    objective.secured = [];
    return 0;
  }
  const lines = Array.isArray(objective.secured) ? objective.secured : [];
  let dropped = 0;
  const kept = [];
  for (const line of lines) {
    if (!line || typeof line.commodityId !== 'string' || !(Number(line.qty) > 0)) continue;
    const pod = ctx.spawnCargoPod(state, {
      pos: { x: raider.pos.x, z: raider.pos.z },
      vel: { x: (raider.vel && raider.vel.x) || 0, z: (raider.vel && raider.vel.z) || 0 },
      radius: 6,
      commodityId: line.commodityId,
      amount: Math.floor(Number(line.qty)),
      unitMass: 0.8,
      factionId: raider.factionId || 'faction_reach',
      ownerId: raider.id,
    });
    if (pod) {
      if (pod.data) {
        pod.data.spillCause = 'raider_destroyed';
        if (objective.targetId != null) pod.data.stolenFromId = objective.targetId;
        if (objective.manifestId != null) pod.data.manifestId = objective.manifestId;
      }
      dropped += Math.floor(Number(line.qty));
    } else {
      kept.push(line);
    }
  }
  // Unspawnable lines stay on the objective — the ledger only zeroes what actually left the hull.
  objective.securedQty = Math.max(0, (objective.securedQty | 0) - dropped);
  objective.secured = kept;
  return dropped;
}

// ── clearing ────────────────────────────────────────────────────────────────────────────────────

/** Release a whole ambient raid (raider + carrier stamps), restoring the raider's pre-raid ai. */
export function releaseAmbientRaid(state, raidId, reason, ctx = {}, opts = {}) {
  const now = simNow(state);
  let raider = opts.raider || null;
  let victim = null;
  for (const entity of entityScan(state)) {
    const data = entity && entity.data;
    if (!data || data.predationEncounterId !== raidId) continue;
    if (data.predationRole === 'raider' && !raider) raider = entity;
    else if (data.predationRole === 'manifest_carrier' && !victim) victim = entity;
  }
  const objective = raider && ambientObjective(raider);
  if (!victim && objective && objective.targetId != null) {
    const candidate = entityById(state, objective.targetId);
    if (candidate && candidate.data && candidate.data.predationEncounterId === raidId) victim = candidate;
  }
  // Idempotent: entity:killed and entity:destroyed both route a dying raider here, and the orphan
  // sweep can find the same victim a tick after the pair cleared. Nothing bound → nothing emits.
  if (!raider && !victim) return false;
  const securedQty = objective ? objective.securedQty | 0 : 0;
  if (victim) {
    victim.data.ambientVictimCooldownUntil = now + AMBIENT_PREDATION.victimCooldownS;
    clearAmbientPredationBinding(state, victim, raidId, reason);
  }
  if (raider) {
    const ai = raider.data && raider.data.ai;
    if (ai) ai.ambientRaidCooldownUntil = now + AMBIENT_PREDATION.raiderCooldownS;
    clearAmbientPredationBinding(state, raider, raidId, reason);
  }
  emit(ctx, 'encounter:ambientPredationCleared', {
    raidId,
    raiderId: raider ? raider.id : (objective && objective.raiderId) || null,
    targetId: victim ? victim.id : (objective && objective.targetId) || null,
    manifestId: objective ? objective.manifestId : null,
    securedQty,
    reason: String(reason || 'objective_cleared'),
    t: now,
  });
  return true;
}

/**
 * Per-entity ambient clear used by the generic predation sweep (save/sector/new-game boundaries).
 * Raiders restore their pre-raid doctrine snapshot rather than retiring like scripted raiders —
 * ambient pirates are persistent world actors that resume normal piracy.
 */
export function clearAmbientPredationBinding(state, entity, raidId, reason = 'lifecycle_boundary') {
  const data = entity && entity.data;
  if (!data) return false;
  // Match the live binding by encounter id. The durable record boundary drops data.predation*
  // but keeps the whole ai bag, so a rematerialized raider can arrive with an ambient objective
  // and no encounter id at all — match on the objective's raidId so that stale shape still clears
  // instead of looping the sweep forever.
  const objective = ambientObjective(entity);
  const matches = data.predationEncounterId === raidId
    || (objective && (raidId == null || objective.raidId === raidId));
  if (!matches) return false;
  const ai = data.ai;
  // Only raiders carry an ambient objective — its presence is itself the raider marker once the
  // data.predationRole stamp has been stripped by the durable-record boundary.
  if ((data.predationRole === 'raider' || objective) && ai) {
    // The raider keeps what it already stole: the secured ledger moves onto the durable ai bag —
    // ai survives the far-shelf boundary that strips data.predation* — so a later kill still
    // drops the goods and pursuit pressure can still knock them loose. Cargo stays in the actual
    // current owner's hands; releasing the raid never deletes stolen freight.
    if (objective && (objective.securedQty | 0) > 0 && Array.isArray(objective.secured)) {
      const incoming = objective.secured
        .map((line) => ({ commodityId: line.commodityId, qty: Math.floor(Number(line.qty) || 0) }))
        .filter((line) => line.qty > 0 && typeof line.commodityId === 'string');
      if (incoming.length) {
        const loot = ai.stolenLoot && typeof ai.stolenLoot === 'object' ? ai.stolenLoot : null;
        const lines = loot && Array.isArray(loot.lines) ? loot.lines : [];
        for (const line of incoming) {
          const existing = lines.find((row) => row.commodityId === line.commodityId);
          if (existing) existing.qty += line.qty;
          else lines.push({ commodityId: line.commodityId, qty: line.qty });
        }
        ai.stolenLoot = {
          lines,
          victimId: objective.targetId != null ? objective.targetId
            : (loot && loot.victimId != null ? loot.victimId : null),
          manifestId: objective.manifestId || (loot && loot.manifestId) || null,
        };
      }
    }
    restoreAmbientRaiderDoctrine(state, entity);
    ai.predationStatus = 'cleared';
    ai.predationEndReason = String(reason || 'lifecycle_boundary');
    delete ai.predationTargetId;
    delete ai.predationTargetIdentityKey;
    delete ai.predationObjective;
    delete ai.predationLeashRadius;
  }
  delete data.predationEncounterId;
  // Ambient carriers never carry freightCustody/persisted identity — strip it all.
  delete data.predationIdentityKey;
  delete data.predationRole;
  return true;
}

function restoreAmbientRaiderDoctrine(state, entity) {
  const data = entity.data;
  const ai = data.ai;
  const snap = ai && ai[RESTORE_SNAPSHOT_KEY];
  if (ai) delete ai[RESTORE_SNAPSHOT_KEY];
  if (!ai) return;
  const tick = tickNow(state);
  const fallbackActivity = {
    kind: ActivityKind.ATTACK_RUN,
    reason: 'ambient:raid_released',
    anchor: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : { x: 0, z: 0 },
    leashRadius: 2600,
    startedTick: tick,
    targetId: null,
  };
  const activity = snap && snap.activity && typeof snap.activity === 'object'
    ? { ...snap.activity, startedTick: tick }
    : fallbackActivity;
  setEntityDoctrine(entity, {
    activity,
    roe: snap && typeof snap.roe === 'string' ? snap.roe : RulesOfEngagement.WEAPONS_FREE,
  });
  ai.motive = snap && snap.motive != null ? snap.motive : 'assigned_interdiction';
  ai.engagementTrigger = snap && snap.engagementTrigger != null
    ? snap.engagementTrigger : 'authorized_hostile_spawn';
  ai.approachTelegraph = snap && snap.approachTelegraph != null
    ? snap.approachTelegraph : 'engine_flare';
  ai.noFireResponseWindowS = snap && Number.isFinite(snap.noFireResponseWindowS)
    ? snap.noFireResponseWindowS : 2;
  ai.zoneId = snap && snap.zoneId != null ? snap.zoneId : 'sector_hostile_zone';
  ai.passive = snap && snap.passive != null ? snap.passive : false;
  if (snap && 'sectorId' in snap) ai.sectorId = snap.sectorId;
  else delete ai.sectorId;
  ai.motiveSatisfied = false;
  ai.pirateDisengaged = false;
}

/**
 * Player-intervention conversion: a bound raider the player just shot leaves its objective and
 * becomes an ordinary self-defense retaliation attacker. Scripted raids reconcile raid-level state
 * on their next tick (the missing raider identity resolves to raider_lost); ambient pairs release
 * both entities here since no live registry exists for them.
 */
export function releaseBoundRaiderForRetaliation(state, entity, ctx = {}) {
  const data = entity && entity.data;
  const ai = data && data.ai;
  if (!entity || entity.alive === false || !data || !ai) return false;
  if (data.predationRole !== 'raider') return false;
  const status = ai.predationStatus;
  if (status == null || status === 'cleared' || !BOUND_STATUSES.has(status)) return false;
  const raidId = data.predationEncounterId;
  const ambient = isAmbientRaidId(raidId) || !!ambientObjective(entity);
  if (ambient) {
    releaseAmbientRaid(state, raidId, 'player_intervention', ctx, { raider: entity });
  } else {
    delete data.predationRole;
    delete data.predationEncounterId;
    delete data.predationIdentityKey;
  }
  delete ai.predationTargetId;
  delete ai.predationTargetIdentityKey;
  delete ai.predationObjective;
  delete ai.predationLeashRadius;
  ai.predationStatus = 'cleared';
  ai.predationEndReason = 'player_intervention';
  ai.passive = false;
  ai.motiveSatisfied = false;
  ai.pirateDisengaged = false;
  delete ai.mercyDisengageUntil;
  ai.motive = 'self_defense';
  ai.engagementTrigger = 'player_attack';
  ai.retaliationTargetId = state.playerId;
  ai.approachTelegraph = 'return_fire_warning';
  ai.noFireResponseWindowS = 1;
  const tick = tickNow(state);
  setEntityDoctrine(entity, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason: 'retaliation:player_attack',
      anchor: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : { x: 0, z: 0 },
      leashRadius: 2200,
      startedTick: tick,
      targetId: state.playerId,
    },
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const combat = data.combat || (data.combat = {});
  combat.targetId = state.playerId;
  emit(ctx, 'encounter:predationRetaliation', {
    raiderId: entity.id,
    targetId: state.playerId,
    encounterId: typeof raidId === 'string' ? raidId : null,
    ambient,
    t: simNow(state),
  });
  return true;
}

// ── evaluator: deterministic pairing ────────────────────────────────────────────────────────────

export function evaluateAmbientPairing(state, ambient, ctx = {}) {
  if (ctx.docked === true) return null;
  if (state.run && state.run.kind === 'survival'
    && state.run.phase !== 'inactive' && state.run.phase !== 'ended') return null;
  const sectorId = state.world && state.world.currentSectorId;
  if (typeof sectorId !== 'string' || !sectorId) return null;
  // The authored Ceres cast pocket owns its own choreography — ambient predation never runs there.
  if (sectorId === CERES_ACTIVITY_SECTOR_ID) return null;
  const zones = zonesForSector(sectorId);
  if (!zones.length) return null;
  if (sectorSecurity(state, sectorId) > AMBIENT_PREDATION.maxSectorSecurity) return null;

  const now = simNow(state);
  const active = ambientRaidersOf(state).filter((entity) => entity.alive !== false
    && ambientObjective(entity)
    && BOUND_STATUSES.has(entity.data.ai.predationStatus));
  if (active.length >= AMBIENT_PREDATION.maxActiveRaids) return null;

  const liveIds = liveEncounterMemberIds(state);
  const raiders = [];
  const victims = [];
  for (const entity of entityScan(state)) {
    if (!entity || entity.type !== 'ship' || entity.alive === false) continue;
    if (entity.id === state.playerId) continue;
    if (liveIds.has(entity.id)) continue;
    if (isAmbientPredatorCandidate(state, entity, now)) raiders.push(entity);
    else if (isAmbientVictimCandidate(state, sectorId, zones, entity, now)) victims.push(entity);
  }
  if (!raiders.length || !victims.length) return null;

  // Rich manifests and weak hulls first; identical scores resolve on stable entity id.
  const scored = victims.map((victim) => {
    const worth = manifestWorth(victim.data.cargoManifest);
    const toughness = Math.max(0, Number(victim.hull) || 0) + 0.5 * Math.max(0, Number(victim.shield) || 0);
    return { victim, score: worth.value + worth.qty * 10 - toughness * 0.25 };
  }).sort((a, b) => (b.score - a.score) || compareStableIds(a.victim.id, b.victim.id));
  raiders.sort((a, b) => compareStableIds(a.id, b.id));

  const pairRadius2 = AMBIENT_PREDATION.pairRadiusWu * AMBIENT_PREDATION.pairRadiusWu;
  const bound = [];
  const usedRaiders = new Set();
  for (const { victim } of scored) {
    if (active.length + bound.length >= AMBIENT_PREDATION.maxActiveRaids) break;
    let best = null;
    let bestD2 = Infinity;
    for (const raider of raiders) {
      if (usedRaiders.has(raider.id)) continue;
      const d2 = separated2(raider.pos, victim.pos);
      if (d2 > pairRadius2) continue;
      if (best == null || d2 < bestD2 || (d2 === bestD2 && compareStableIds(raider.id, best.id) < 0)) {
        best = raider;
        bestD2 = d2;
      }
    }
    if (!best) continue;
    usedRaiders.add(best.id);
    const zone = laneZoneNear(sectorId, zones, globalToSectorLocalForSector(victim.pos, sectorId));
    bound.push(bindAmbientRaid(state, ambient, best, victim, zone, ctx));
  }
  return bound;
}

function bindAmbientRaid(state, ambient, raider, victim, zone, ctx) {
  const now = simNow(state);
  const tick = tickNow(state);
  const sectorId = state.world.currentSectorId;
  ambient.seq = (ambient.seq | 0) + 1;
  // tick + seq makes the id unique across save/restore: ambient.seq restarts after a load while a
  // rematerialized raider may still carry a stale objective with an older raidId — the tick keeps
  // the two from colliding on the same identifier.
  const raidId = `ambient:raid:${sectorId}:${tick}:${ambient.seq}`;
  const seed = state.meta && state.meta.seed;
  const frac = (hash32(seed == null ? 0 : seed, raidId, 'telegraph') >>> 0) / 4294967296;
  const telegraphS = AMBIENT_PREDATION.telegraphSMin + frac * AMBIENT_PREDATION.telegraphSJitterS;
  const engageAt = now + telegraphS;
  const deadlineAt = now + AMBIENT_PREDATION.objectiveS;
  const deadlineTick = tick + Math.ceil(AMBIENT_PREDATION.objectiveS * 60);
  const leash = AMBIENT_PREDATION.leashWu;

  const data = raider.data || (raider.data = {});
  const ai = data.ai || (data.ai = {});
  const victimData = victim.data || (victim.data = {});
  const manifest = victimData.cargoManifest;

  ai[RESTORE_SNAPSHOT_KEY] = {
    activity: ai.activity && typeof ai.activity === 'object' ? { ...ai.activity } : null,
    roe: typeof ai.roe === 'string' ? ai.roe : null,
    motive: ai.motive != null ? ai.motive : null,
    engagementTrigger: ai.engagementTrigger != null ? ai.engagementTrigger : null,
    approachTelegraph: ai.approachTelegraph != null ? ai.approachTelegraph : null,
    noFireResponseWindowS: Number.isFinite(ai.noFireResponseWindowS) ? ai.noFireResponseWindowS : null,
    zoneId: ai.zoneId != null ? ai.zoneId : null,
    sectorId: ai.sectorId !== undefined ? ai.sectorId : null,
    passive: ai.passive === true,
  };

  victimData.predationEncounterId = raidId;
  victimData.predationRole = 'manifest_carrier';
  victimData.predationIdentityKey = `${raidId}:victim`;

  data.predationEncounterId = raidId;
  data.predationRole = 'raider';
  data.predationIdentityKey = `${raidId}:raider`;

  ai.motive = AMBIENT_PREDATION_MOTIVE;
  ai.engagementTrigger = AMBIENT_PREDATION_TRIGGER;
  ai.approachTelegraph = 'pirate_stalk';
  ai.zoneId = zone ? zone.id : 'sector_hostile_zone';
  ai.sectorId = sectorId;
  ai.noFireResponseWindowS = telegraphS;
  ai.predationStatus = 'telegraph';
  ai.predationTargetId = victim.id;
  ai.predationTargetIdentityKey = victimData.predationIdentityKey;
  ai.predationLeashRadius = leash;
  ai.motiveSatisfied = false;
  ai.pirateDisengaged = false;
  ai.predationObjective = {
    kind: AMBIENT_OBJECTIVE_KIND,
    raidId,
    raiderId: raider.id,
    targetId: victim.id,
    targetIdentityKey: victimData.predationIdentityKey,
    manifestId: manifest.manifestId,
    startedTick: tick,
    deadlineTick,
    deadlineAt,
    engageAt,
    leashRadius: leash,
    awaySince: null,
    securedQty: 0,
    secured: [],
    podIds: [],
  };
  setEntityDoctrine(raider, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason: 'ambient:manifest_predation',
      anchor: victim.pos ? { x: victim.pos.x, z: victim.pos.z } : { x: raider.pos.x, z: raider.pos.z },
      leashRadius: leash,
      startedTick: tick,
      deadlineTick,
      targetId: victim.id,
      routeId: zone ? zone.id : null,
      encounterId: raidId,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });

  emit(ctx, 'encounter:ambientPredationTelegraph', {
    raidId,
    raiderId: raider.id,
    raiderIdentityKey: data.predationIdentityKey,
    targetId: victim.id,
    targetIdentityKey: victimData.predationIdentityKey,
    manifestId: manifest.manifestId,
    zoneId: ai.zoneId,
    sectorId,
    telegraphS,
    engageAt,
    deadlineAt,
    t: now,
  });
  emit(ctx, 'ai:telegraph', {
    entityId: raider.id,
    targetId: victim.id,
    encounterId: raidId,
    doctrineId: ai.combatDoctrineId || null,
    kind: ai.approachTelegraph,
    durationTicks: Math.max(30, Math.ceil(telegraphS * 60)),
    tick,
  });
  return { raidId, raiderId: raider.id, targetId: victim.id, engageAt, deadlineTick };
}

// ── eligibility ─────────────────────────────────────────────────────────────────────────────────

function isAmbientPredatorCandidate(state, entity, now) {
  if (entity.team !== 1) return false;
  if (entity.disabled === true) return false;
  const data = entity.data || {};
  const ai = data.ai;
  if (!ai || ai.lawful === true || ai.passive === true) return false;
  if (ai.archetype !== 'pirate') return false;
  if (ai.motiveSatisfied === true || ai.pirateDisengaged === true) return false;
  if (ai.predationStatus != null && ai.predationStatus !== 'cleared') return false;
  if (ai.predationTargetId != null || data.predationRole != null || data.predationEncounterId != null
    || data.predationIdentityKey != null) return false;
  if (ai.retaliationTargetId != null || ai.securityTargetId != null) return false;
  if (ai.encounterId != null || data.encounter != null) return false;
  // Scripted freight-custody residue (raider/carrier identity keys) means an encounter script
  // owns this hull — ambient pairing never takes over scripted ownership.
  if (data.freightCustody != null || data.freightCustodyRaiderIdentityKey != null
    || data.freightCustodyCarrierIdentityKey != null) return false;
  if (ai.activity && ai.activity.targetId != null) return false;
  if (data.combat && data.combat.targetId != null) return false;
  if (data.missionId != null || data.missionTag != null || data.missionPinned === true) return false;
  if (data.isBoss === true || data.encounterBoss != null || data.scenarioActorId != null) return false;
  if (data.activityActorSlotId != null || ai.ceresActivityAmbushPhase != null) return false;
  if (ai.parleySquadId != null || data.runCohort != null || data.playerOwned === true) return false;
  if (Number.isFinite(ai.ambientRaidCooldownUntil) && ai.ambientRaidCooldownUntil > now) return false;
  if (!posFinite(entity.pos)) return false;
  if (!Array.isArray(data.weapons) || !data.weapons.length) return false;
  if (!normalizeCombatDoctrineId(ai.combatDoctrineId)) return false;
  return true;
}

function isAmbientVictimCandidate(state, sectorId, zones, entity, now) {
  if (entity.team !== 2) return false;
  if (entity.disabled === true) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.role || '');
  if (!AMBIENT_VICTIM_ROLES.has(role)) return false;
  if (!manifestCarriedBy(entity)) return false;
  if (data.predationRole != null || data.predationEncounterId != null
    || data.predationIdentityKey != null) return false;
  if (data.freightCustody != null) return false;
  // The violence spill latch is one-shot: a hauler that already dumped under fire can never feed
  // the recovery phase again, so it is not a raidable target.
  if (data.violenceCargoSpilled === true) return false;
  if (ai.lawful === true || ai.securityTargetId != null) return false;
  if (data.missionId != null || data.missionTag != null || data.missionPinned === true) return false;
  if (data.scenarioActorId != null || data.activityActorSlotId != null) return false;
  if (ai.ceresActivityAmbushPhase != null || data.runCohort != null) return false;
  if (data.playerOwned === true || data.playerCollectOnly === true) return false;
  if (Number.isFinite(data.ambientVictimCooldownUntil) && data.ambientVictimCooldownUntil > now) return false;
  if (!posFinite(entity.pos)) return false;
  // Lane-adjacent: inside (or just off) a trade/patrol/ambush lane disc. Zone centers are
  // authored sector-local; live entity poses are corridor-global — convert before comparing,
  // the same seam encounterDirector uses for every other zonesForSector read.
  if (!laneZoneNear(sectorId, zones, globalToSectorLocalForSector(entity.pos, sectorId))) return false;
  // Under lawful station guns the raid cannot start at all.
  if (protectedStationAt(state, entity)) return false;
  // Low lawful presence: no lawful hull or lawful-faction station covering the victim.
  const r2 = AMBIENT_PREDATION.lawPresenceRadiusWu * AMBIENT_PREDATION.lawPresenceRadiusWu;
  for (const other of entityScan(state)) {
    if (!other || other.alive === false || other === entity) continue;
    const otherAi = other.data && other.data.ai;
    const lawfulShip = other.type === 'ship' && otherAi && otherAi.lawful === true;
    const lawfulStation = other.type === 'station'
      && LAWFUL_STATION_FACTIONS.has(other.factionId || (other.data && other.data.factionId));
    if (!lawfulShip && !lawfulStation) continue;
    if (separated2(other.pos, entity.pos) <= r2) return false;
  }
  return true;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

function laneZoneNear(sectorId, zones, pos) {
  if (!pos) return null;
  let best = null;
  let bestR2 = Infinity;
  for (const zone of zones) {
    if (!zone || !LANE_ZONE_TYPES.has(zone.type) || !zone.center) continue;
    const dx = pos.x - zone.center.x;
    const dz = pos.z - zone.center.z;
    const reach = (Number(zone.radius) || 0) + AMBIENT_PREDATION.laneMarginWu;
    const d2 = dx * dx + dz * dz;
    if (d2 <= reach * reach && d2 < bestR2) { best = zone; bestR2 = d2; }
  }
  return best;
}

function sectorSecurity(state, sectorId) {
  const def = SECTORS.find((s) => s && s.id === sectorId);
  const baseline = def && Number.isFinite(def.security) ? def.security : 0.5;
  return effectiveRegionalSecurity(state, sectorId, baseline);
}

function liveEncounterMemberIds(state) {
  const out = new Set();
  const live = state.encounterDirector && state.encounterDirector.live;
  if (live && typeof live === 'object') {
    for (const row of Object.values(live)) {
      if (!row || row.phase === 'done' || !Array.isArray(row.ids)) continue;
      for (const id of row.ids) out.add(id);
    }
  }
  return out;
}

function spilledPodIdsFor(state, victim) {
  const out = [];
  for (const entity of entityScan(state)) {
    // Traffic's violence spill and the raider's own respill both mint `payload` jettisoned-cargo
    // pods; pickup-type freight custody pods are included for harnesses that exercise that shape.
    if (!entity || entity.alive === false) continue;
    if (entity.type !== 'payload' && entity.type !== 'pickup') continue;
    const data = entity.data || {};
    if (entity.type === 'payload' && data.payloadType !== JETTISONED_CARGO_PAYLOAD_TYPE) continue;
    if (data.ownerId === victim.id || entity.ownerId === victim.id) out.push(entity.id);
    if (out.length >= AMBIENT_PREDATION.securedCargoCap * 2) break;
  }
  out.sort(compareStableIds);
  return out;
}

function manifestWorth(manifest) {
  let value = 0;
  let qty = 0;
  const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : [];
  for (const line of lines) {
    const q = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    if (!(q > 0)) continue;
    qty += q;
    const def = COMMODITY_BY_ID.get(line && line.commodityId);
    value += q * (def && Number.isFinite(def.basePrice) ? def.basePrice : 40);
  }
  return { value, qty };
}

function manifestCarriedBy(entity, manifestId = null) {
  const manifest = entity && entity.data && entity.data.cargoManifest;
  if (!manifest || typeof manifest.manifestId !== 'string' || !manifest.manifestId) return false;
  if (manifestId != null && manifest.manifestId !== manifestId) return false;
  return Array.isArray(manifest.lines)
    && manifest.lines.some((line) => line && typeof line.commodityId === 'string'
      && line.commodityId && Number(line.qty) > 0);
}

function targetDisabled(state, target) {
  if (!target || target.alive === false || target.disabled === true) return true;
  const runtime = state && state.combat && state.combat.entities
    && state.combat.entities[String(target.id)];
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

function entityScan(state) {
  const entities = state && state.entities;
  if (entities && typeof entities.values === 'function') return entities.values();
  return Array.isArray(state && state.entityList) ? state.entityList : [];
}

function entityById(state, id) {
  if (id == null || !state) return null;
  const entities = state.entities;
  if (entities && typeof entities.get === 'function') return entities.get(id) || null;
  const list = state.entityList;
  if (Array.isArray(list)) return list.find((entity) => entity && entity.id === id) || null;
  return null;
}

function simNow(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

function tickNow(state) {
  return Number.isInteger(state && state.tick) ? state.tick : 0;
}

function posFinite(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

function separated2(a, b) {
  if (!posFinite(a) || !posFinite(b)) return Infinity;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function compareStableIds(a, b) {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return stableId(a).localeCompare(stableId(b));
}

function emit(ctx, name, payload) {
  if (ctx && typeof ctx.emit === 'function') ctx.emit(name, payload);
}
