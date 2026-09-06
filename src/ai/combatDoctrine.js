// M1.5 readable combat doctrines. Pure deterministic transient records: no world root, RNG stream,
// wall clock, action execution, physics mutation, or presentation ownership lives here.
import {
  ContactKind,
  ManeuverKind,
  ObjectiveKind,
  distance2,
  finite,
  hashUnit,
  stableId,
} from './contracts.js';
import { normalizeFactionBehaviorProfile } from './factionBehavior.js';

export const CombatDoctrineId = Object.freeze({
  INTERCEPTOR_FLYBY: 'interceptor_flyby',
  BRAWLER_COMMIT: 'brawler_commit',
  TETHER_CONTROL_RAIDER: 'tether_control_raider',
  FIELD_ANCHOR_CONTROLLER: 'field_anchor_controller',
  RANGED_DISENGAGER: 'ranged_disengager',
  CAPITAL_BROADSIDE: 'capital_broadside',
  ESCORT_SCREEN: 'escort_screen',
});

export const DOCTRINE_TELEGRAPH_TICKS = 30;

const IDS = new Set(Object.values(CombatDoctrineId));
const INTERCEPTOR_STRIKE_MIN_TICKS = 24;
const INTERCEPTOR_STRIKE_MAX_TICKS = 54;
const INTERCEPTOR_EXTEND_TICKS = 75;
const INTERCEPTOR_EXTEND_MAX_TICKS = 180;
const INTERCEPTOR_REFORM_TICKS = 45;
const BRAWLER_COMMIT_MIN_TICKS = 90;
const BRAWLER_COMMIT_MAX_TICKS = 120;
const BRAWLER_BREAKAWAY_TICKS = 105;
const BRAWLER_REFORM_TICKS = 60;
const TETHER_ATTACH_TICKS = 15;
const TETHER_CONTROL_TICKS = 90;
const TETHER_ESCAPE_TICKS = 90;
const TETHER_REFORM_TICKS = 45;
const FIELD_ANCHOR_HOLD_TICKS = 180;
const FIELD_ANCHOR_RECOVER_TICKS = 75;
const RANGED_REPOSITION_TICKS = 45;
const RANGED_FIRE_TICKS = 18;
const RANGED_RESET_TICKS = 18;
const CAPITAL_BROADSIDE_FIRE_TICKS = 60;
const CAPITAL_BROADSIDE_SHIFT_TICKS = 90;
// Escort screen: the warden's job is the WARD, not the kill. It holds a point between its nearest
// friendly and the pressed threat, and darts only when the threat actually breaches the ward.
const ESCORT_APPROACH_RANGE_WU = 160;
const ESCORT_APPROACH_TICKS = 60;
const ESCORT_HOLD_TICKS = 150;
const ESCORT_DART_TICKS = 36;
const ESCORT_REGROUP_TICKS = 45;
const ESCORT_BREACH_WU = 260;
const ESCORT_THREAT_RING_WU = 900;
const RUN_EGRESS_DISTANCE = 960;
// Pressure break: a hurt or heat-soaked fighter diverts to its authored egress phase instead of
// grinding one continuous attack_run until death. The break ends through the ordinary
// egress→reform cycle, so the enemy re-commits on a fresh pass — press, break, re-press — instead
// of every engagement resolving as a single relentless pursuit. Cornered hulls (< CORNERED
// hull) never break: the morale/flee layer owns the death spiral.
const PRESSURE_HULL_FRACTION = 0.45;
const PRESSURE_HEAT_FRACTION = 0.8;
const CORNERED_HULL_FRACTION = 0.2;
// The opening beat is always committed: no break before the current offensive phase has lived a
// little, so contact never collapses instantly.
const PRESSURE_MIN_PHASE_TICKS = 45;
const PRESSURE_BREAK_OUTCOME = 'pressure_break';
// A contact already on the end of a line is anchored, slowed, and predictable. That reads as a free
// kill, so it should DRAW the swarm rather than repel it. See targetScore() for why this replaced a
// flat -100 veto and how the magnitude is derived.
const TETHERED_PREY_BONUS = 8;

export function normalizeCombatDoctrineId(value, fallback = null) {
  const id = String(value || '');
  if (IDS.has(id)) return id;
  return fallback && IDS.has(String(fallback)) ? String(fallback) : null;
}

export function selectDoctrineTarget(doctrineId, perception) {
  const doctrine = normalizeCombatDoctrineId(doctrineId);
  if (!doctrine || !perception || !Array.isArray(perception.contacts)) return null;
  // The escort scores hostiles by how hard they press its WARD, so resolve the ward (nearest
  // visible friendly) once per selection. Fail-closed: no ward, standard threat scoring.
  const ward = doctrine === CombatDoctrineId.ESCORT_SCREEN ? escortWard(perception, null) : null;
  let best = null;
  let bestScore = -Infinity;
  for (const contact of perception.contacts) {
    if (!contact || contact.kind !== ContactKind.SHIP || contact.hostile !== true) continue;
    if (contact.alive !== true || contact.valid !== true || contact.visible !== true) continue;
    if (finite(contact.confidence, 0) < 0.55) continue;
    const score = targetScore(doctrine, contact, ward);
    if (score > bestScore || (score === bestScore && stableId(contact.id) < stableId(best && best.id))) {
      best = contact;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The escort's ward: the nearest visible friendly hull. Hostile-only target streams never produce
 * one, so every escort branch must tolerate `null` (fail-closed to ordinary threat behavior).
 */
function escortWard(perception, self) {
  if (!perception || !Array.isArray(perception.contacts)) return null;
  const selfPos = self && self.pos ? self.pos : perception.self && perception.self.pos;
  let best = null;
  let bestDist = Infinity;
  for (const contact of perception.contacts) {
    if (!contact || contact.kind !== ContactKind.SHIP || contact.hostile === true) continue;
    if (contact.alive !== true || contact.visible !== true || !contact.pos) continue;
    const d = selfPos
      ? Math.hypot(contact.pos.x - selfPos.x, contact.pos.z - selfPos.z)
      : 0;
    if (d < bestDist || (d === bestDist && best && stableId(contact.id) < stableId(best.id))) {
      best = contact;
      bestDist = d;
    }
  }
  return best;
}

export class CombatDoctrineRuntime {
  constructor({ seed = 1 } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.byEntity = new Map();
  }

  update({
    tick,
    entityId,
    doctrineId: doctrineValue,
    perception,
    directive = null,
    disabledNonlethalTargetId = undefined,
  } = {}) {
    const doctrineId = normalizeCombatDoctrineId(doctrineValue);
    if (!doctrineId || entityId == null || !Number.isInteger(tick) || tick < 0) return null;
    if (!combatActorEligible(perception)) {
      this.byEntity.delete(entityId);
      return null;
    }
    const target = selectDoctrineTarget(doctrineId, perception);
    let record = this.byEntity.get(entityId);
    if (conditionalHostilityActor(perception) && !target && !(record && record.targetId != null)) {
      this.byEntity.delete(entityId);
      return null;
    }
    const self = perception && perception.self || null;
    const factionBehavior = normalizeFactionBehaviorProfile(self && self.factionBehavior);
    const flightProfile = flightProfileFor(doctrineId, self);
    if (!record || record.doctrineId !== doctrineId || record.targetId !== (target && target.id) ||
      record.flightProfile !== flightProfile) {
      record = makeRecord(this.seed, tick, entityId, doctrineId, target && target.id, flightProfile);
      this.byEntity.set(entityId, record);
    }
    record.lastTick = tick;
    record.ramAuthorized = self && self.ramAuthorized === true;
    record.outcome = null;
    record.telegraphStartedTick = null;

    if (!target) {
      enter(record, initialPhase(doctrineId), tick, null);
      return snapshot(record, null, directive, factionBehavior);
    }

    const distance = self && self.pos ? distance2(self.pos, target.pos) : Infinity;
    // Production supplies this from aiPorts' live combat-runtime query. The contact fallback keeps
    // the pure/worldless doctrine API usable for fixtures and non-production adapters that have no
    // state port; an explicit null is authoritative and must not be replaced by cached perception.
    const disabledNonlethalTarget = disabledNonlethalTargetId === undefined
      ? !!(factionBehavior && (factionBehavior.disableThenRun || factionBehavior.destroyTarget === false)
        && target.disabled === true)
      : disabledNonlethalTargetId != null && stableId(disabledNonlethalTargetId) === stableId(target.id);
    if (disabledNonlethalTarget) {
      const egressPhase = doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY ? 'breakaway'
        : doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER ? 'escape'
          : doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER ? 'recover'
          : doctrineId === CombatDoctrineId.ESCORT_SCREEN ? 'regroup'
          : 'retreat';
      if (record.phase !== egressPhase) beginEgress(record, egressPhase, tick, self, target, 'target_disabled');
      return snapshot(record, target, directive, factionBehavior);
    }
    if (pressureBreakDue(record, self, tick)) {
      beginEgress(record, egressPhaseFor(doctrineId), tick, self, target, PRESSURE_BREAK_OUTCOME);
      return snapshot(record, target, directive, factionBehavior);
    }
    if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
      updateInterceptor(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
      updateBrawler(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
      updateTetherRaider(record, tick, entityId, perception, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
      updateFieldAnchor(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) {
      updateCapitalBroadside(record, tick, distance);
    } else if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) {
      updateEscort(record, tick, perception, self, target, distance);
    } else {
      updateRanged(record, tick, self, target, distance);
    }
    return snapshot(record, target, directive, factionBehavior);
  }

  forget(entityId) {
    this.byEntity.delete(entityId);
  }

  reset() {
    this.byEntity.clear();
  }

  inspect(entityId = null) {
    if (entityId != null) return frozenRecord(this.byEntity.get(entityId));
    const out = {};
    for (const id of [...this.byEntity.keys()].sort(compareIds)) out[String(id)] = frozenRecord(this.byEntity.get(id));
    return Object.freeze(out);
  }
}

export function overrideDirectiveForCombatDoctrine(directive, doctrine) {
  if (!directive || !doctrine || doctrine.targetId == null) return directive;
  let kind = ObjectiveKind.FOCUS;
  if (doctrine.doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
    kind = doctrine.phase === 'flank' || doctrine.phase === 'escape' || doctrine.phase === 'reform'
      ? ObjectiveKind.ENGAGE
      : ObjectiveKind.TUG;
  } else if (doctrine.doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
    // anchor_hold must be ENGAGE, not SCREEN: canFireByDoctrine and the fire-intent adapter only
    // pass FOCUS/ENGAGE objectives, so a SCREEN hold silently discarded the anchor_hold burst
    // window this doctrine advertises. Approach/field_spool/reform stay SCREEN so the anchor
    // reads as area control until its telegraph completes.
    kind = doctrine.phase === 'recover' || doctrine.phase === 'anchor_hold'
      ? ObjectiveKind.ENGAGE
      : ObjectiveKind.SCREEN;
  } else if (doctrine.doctrineId === CombatDoctrineId.ESCORT_SCREEN) {
    // Same gate as the anchor: screen_hold's guns are real, so it and the breach dart read ENGAGE;
    // approach/deploy/regroup stay SCREEN (area denial around the ward).
    kind = doctrine.phase === 'screen_hold' || doctrine.phase === 'shield_dart'
      ? ObjectiveKind.ENGAGE
      : ObjectiveKind.SCREEN;
  }
  const targetId = doctrine.actionTargetId != null ? doctrine.actionTargetId : doctrine.targetId;
  return Object.freeze({
    ...directive,
    focusTargetId: doctrine.targetId,
    objective: Object.freeze({ kind, targetId, reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}` }),
    formation: Object.freeze({
      ...directive.formation,
      breakFormation: true,
      breakReason: `combat_doctrine:${doctrine.phase}`,
    }),
  });
}

export function applyCombatDoctrineToSelection(selected, doctrine) {
  if (!selected || !doctrine) return selected;
  if (doctrine.targetId == null) {
    return { ...selected, actionId: null, targetId: null, targetContact: null, forceInterrupt: true };
  }
  const allowed = doctrine.allowedActionId;
  const actionId = allowed && selected.actionId === allowed ? selected.actionId : null;
  return {
    ...selected,
    actionId,
    targetId: actionId ? doctrine.actionTargetId ?? doctrine.targetId : null,
    targetContact: actionId ? selected.targetContact : null,
    maneuver: {
      ...(selected.maneuver || {}),
      kind: doctrine.maneuverKind,
      targetId: doctrine.maneuverTargetId,
      preferredRange: doctrine.preferredRange,
      lateralSign: doctrine.lateralSign,
      faceTarget: doctrine.faceTarget === true,
      ramAuthorized: doctrine.ramAuthorized === true,
      flightPoint: doctrine.flightPoint,
      formationLocked: doctrine.formationLocked,
      breakFormation: !doctrine.formationLocked,
      reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}`,
    },
  };
}

function updateInterceptor(record, tick, self, target, distance) {
  if (record.flightProfile === 'brawler_commit') {
    updateBrawler(record, tick, self, target, distance);
    return;
  }
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'ingress' && distance <= 420) enter(record, 'engine_flare', tick, 'engine_flare');
  else if (record.phase === 'engine_flare' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    record.closestDistance = distance;
    enter(record, 'strike', tick, null);
  } else if (record.phase === 'strike') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= INTERCEPTOR_STRIKE_MIN_TICKS && passed) || age >= INTERCEPTOR_STRIKE_MAX_TICKS) {
      beginEgress(record, 'extend', tick, self, target, 'attack_run_complete');
    }
  } else if (record.phase === 'extend' && age >= INTERCEPTOR_EXTEND_TICKS &&
    (distance >= 520 || age >= INTERCEPTOR_EXTEND_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= INTERCEPTOR_REFORM_TICKS) {
    advanceCycle(record, tick, 'ingress');
  }
}

function updateBrawler(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'ingress' && distance <= 460) enter(record, 'engine_flare', tick, 'engine_flare');
  else if (record.phase === 'engine_flare' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    record.closestDistance = distance;
    enter(record, 'commit', tick, null);
  } else if (record.phase === 'commit') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= BRAWLER_COMMIT_MIN_TICKS && passed) || age >= BRAWLER_COMMIT_MAX_TICKS) {
      beginEgress(record, 'breakaway', tick, self, target, 'brawler_commit_complete');
    }
  } else if (record.phase === 'breakaway' && age >= BRAWLER_BREAKAWAY_TICKS && distance >= 600) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= BRAWLER_REFORM_TICKS) {
    advanceCycle(record, tick, 'ingress');
  }
}

function updateTetherRaider(record, tick, entityId, perception, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  const tether = ownedTether(perception, entityId, target.id);
  if (record.phase === 'flank' && distance <= 140) enter(record, 'spool_cue', tick, 'attach_spool');
  else if (record.phase === 'spool_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'attach_window', tick, null);
  else if (record.phase === 'attach_window' && tether) enter(record, 'control', tick, null);
  // "Contested" means another ship's control line is already ON this hull, so my attach would be a
  // second lasso on the same body. It does NOT mean the target is holding a line of its own. The
  // previous test was `target.tethered`, which is true whenever the contact is EITHER end of any
  // attachment — so the raider aborted its attach run and fled 700 wu every time the player's
  // Massline touched a rock. Same conflation as the score veto in targetScore(); this is the half
  // that fired unconditionally, and it is why enemies scattered the instant the player tethered.
  else if (record.phase === 'attach_window' && contestedByForeignLine(perception, entityId, target.id)) {
    beginEgress(record, 'escape', tick, self, target, 'target_contested');
  }
  else if (record.phase === 'attach_window' && age >= TETHER_ATTACH_TICKS) beginEgress(record, 'escape', tick, self, target, 'attach_failed');
  else if (record.phase === 'control' && !tether) beginEgress(record, 'escape', tick, self, target, 'line_lost');
  else if (record.phase === 'control' && hasTag(tether, 'slack')) beginEgress(record, 'escape', tick, self, target, 'slack_line');
  else if (record.phase === 'control' && vectorReversed(perception, target)) beginEgress(record, 'escape', tick, self, target, 'vector_reversal');
  else if (record.phase === 'control' && age >= TETHER_CONTROL_TICKS) beginEgress(record, 'escape', tick, self, target, 'control_complete');
  else if (record.phase === 'escape' && age >= TETHER_ESCAPE_TICKS && distance >= 700) beginReform(record, tick);
  else if (record.phase === 'reform' && age >= TETHER_REFORM_TICKS) advanceCycle(record, tick, 'flank');
  record.actionTargetId = tether ? (tether.attachmentId || tether.id) : target.id;
}

function updateFieldAnchor(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'approach' && distance <= 540) enter(record, 'field_spool', tick, 'field_spool');
  else if (record.phase === 'field_spool' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'anchor_hold', tick, null);
  else if (record.phase === 'anchor_hold' && (age >= FIELD_ANCHOR_HOLD_TICKS || distance < 220)) {
    beginEgress(record, 'recover', tick, self, target, 'field_cycle_complete');
  } else if (record.phase === 'recover' && age >= FIELD_ANCHOR_RECOVER_TICKS && distance >= 520) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= TETHER_REFORM_TICKS) {
    advanceCycle(record, tick, 'approach');
  }
}

function updateEscort(record, tick, perception, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  const ward = escortWard(perception, self);
  // The screen point floats between ward and threat while a ward exists. Without one the warden
  // holds a defensive orbit of the threat itself (no flightPoint, guns live in the hold) — the
  // honest fail-closed end state, not a chase/flee pendulum.
  if (record.phase !== 'shield_dart') {
    record.flightPoint = escortScreenPoint(self, ward, target);
  }
  if (record.phase === 'screen_approach') {
    // The maneuver planner flies the hull to the screen point; a hull that cannot reach it in
    // time (boxed in, spawn geometry) still deploys on the clock so the hold is never skipped.
    const inPosition = record.flightPoint
      ? pointWithin(self, record.flightPoint, ESCORT_APPROACH_RANGE_WU)
      : distance <= 420;
    if (inPosition || age >= ESCORT_APPROACH_TICKS) enter(record, 'screen_deploy', tick, 'engine_flare');
  } else if (record.phase === 'screen_deploy' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    enter(record, 'screen_hold', tick, null);
  } else if (record.phase === 'screen_hold') {
    if (escortBreached(perception, ward)) {
      enter(record, 'shield_dart', tick, null);
      // The lunge closes on the breacher: drop the floating screen point so the planner honors
      // the dart's ORBIT-150 maneuver instead of committing to the spot we already hold.
      record.flightPoint = null;
    } else if (age >= ESCORT_HOLD_TICKS) advanceCycle(record, tick, 'screen_approach');
  } else if (record.phase === 'shield_dart') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    if (age >= ESCORT_DART_TICKS || runHasPassed(record, self, target, distance)) {
      enter(record, 'screen_hold', tick, null);
    }
  } else if (record.phase === 'regroup' && age >= ESCORT_REGROUP_TICKS) {
    advanceCycle(record, tick, 'screen_approach');
  }
}

/**
 * Any hostile inside the breach ring counts — the dart answers the PRESSURE on the ward, not one
 * specifically-selected hull (a capital at 261wu must not suppress the dart an armed light at
 * 200wu deserves). The dart still flies at the doctrine target; selection already favors
 * ward-pressers, so target and breacher agree in the common case.
 */
function escortBreached(perception, ward) {
  if (!ward || !ward.pos || !perception || !Array.isArray(perception.contacts)) return false;
  return perception.contacts.some((contact) => contact
    && contact.kind === ContactKind.SHIP
    && contact.hostile === true
    && contact.alive === true
    && contact.visible === true
    && contact.pos
    && Math.hypot(contact.pos.x - ward.pos.x, contact.pos.z - ward.pos.z) <= ESCORT_BREACH_WU);
}

/** Point on the ward→threat line, ESCORT_APPROACH_RANGE_WU from the ward — the hull the threat must pass. */
function escortScreenPoint(self, ward, target) {
  if (!ward || !ward.pos || !target || !target.pos || !self || !self.pos) return null;
  const dx = target.pos.x - ward.pos.x;
  const dz = target.pos.z - ward.pos.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  return Object.freeze({
    x: ward.pos.x + (dx / length) * ESCORT_APPROACH_RANGE_WU,
    z: ward.pos.z + (dz / length) * ESCORT_APPROACH_RANGE_WU,
  });
}

function pointWithin(self, point, rangeWu) {
  if (!self || !self.pos || !point) return false;
  return Math.hypot(self.pos.x - point.x, self.pos.z - point.z) <= rangeWu;
}

/**
 * True when the hull's own state (hull fraction, weapon heat) demands the bounded egress beat.
 * Only fires from an offensive phase — the egress/reform lull is exactly the recovery the break
 * exists to buy — and only after the phase has been lived in, so the opening beat always commits.
 */
function pressureBreakDue(record, self, tick) {
  if (!self || !Number.isFinite(self.hullFraction)) return false;
  const phase = record.phase;
  if (phase === 'extend' || phase === 'breakaway' || phase === 'escape' || phase === 'recover'
    || phase === 'retreat' || phase === 'reform') return false;
  if (tick - record.phaseStartedTick < PRESSURE_MIN_PHASE_TICKS) return false;
  const hull = self.hullFraction;
  const heat = Number.isFinite(self.heatFraction) ? self.heatFraction : 0;
  if (hull < CORNERED_HULL_FRACTION) return false;
  return hull <= PRESSURE_HULL_FRACTION || heat >= PRESSURE_HEAT_FRACTION;
}

/** Each doctrine breaks to its own authored egress phase so the maneuver vocabulary stays coherent. */
function egressPhaseFor(doctrineId) {
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) return 'extend';
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) return 'breakaway';
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'escape';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'recover';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'regroup';
  return 'retreat';
}

function updateRanged(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  const closing = closingSpeed(self, target);
  if (distance < 300 || closing > 55) {
    if (record.phase !== 'retreat') {
      record.outcome = 'closing_interrupt';
      enter(record, 'retreat', tick, null);
    }
    return;
  }
  if (record.phase === 'retreat') {
    if (distance >= 520 && closing < 10) enter(record, 'outer_standoff', tick, null);
    return;
  }
  if (record.phase === 'outer_standoff' && age >= RANGED_REPOSITION_TICKS && distance >= 420 && distance <= 1100) {
    enter(record, 'charge_cue', tick, 'weapon_charge');
  }
  else if (record.phase === 'charge_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'fire_window', tick, null);
  else if (record.phase === 'fire_window' && age >= RANGED_FIRE_TICKS) enter(record, 'reset', tick, null);
  else if (record.phase === 'reset' && age >= RANGED_RESET_TICKS) advanceCycle(record, tick, 'outer_standoff');
}

function updateCapitalBroadside(record, tick, distance) {
  const age = tick - record.phaseStartedTick;
  if (distance > 1100 && record.phase !== 'broadside_approach') {
    enter(record, 'broadside_approach', tick, null);
    return;
  }
  if (record.phase === 'broadside_approach' && distance <= 900) {
    enter(record, 'broadside_charge', tick, 'broadside_charge');
  } else if (record.phase === 'broadside_charge' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    enter(record, 'broadside_fire', tick, null);
  } else if (record.phase === 'broadside_fire' && age >= CAPITAL_BROADSIDE_FIRE_TICKS) {
    record.side *= -1;
    enter(record, 'broadside_shift', tick, null);
  } else if (record.phase === 'broadside_shift' && age >= CAPITAL_BROADSIDE_SHIFT_TICKS) {
    record.cycle++;
    enter(record, 'broadside_charge', tick, 'broadside_charge');
  }
}

function makeRecord(seed, tick, entityId, doctrineId, targetId, flightProfile) {
  const record = {
    doctrineId,
    flightProfile,
    phase: initialPhase(doctrineId),
    phaseStartedTick: tick,
    phaseChangedTick: tick,
    targetId: targetId == null ? null : targetId,
    actionTargetId: targetId == null ? null : targetId,
    cycle: 0,
    side: sideFor(seed, entityId, doctrineId, 0, targetId),
    telegraph: null,
    telegraphStartedTick: null,
    fireWindow: false,
    outcome: null,
    closestDistance: Infinity,
    flightPoint: null,
    ramAuthorized: false,
    lastTick: tick,
    seed,
    entityId,
  };
  return record;
}

function enter(record, phase, tick, telegraphKind) {
  if (record.phase === phase && !telegraphKind) return;
  record.phase = phase;
  record.phaseStartedTick = tick;
  record.phaseChangedTick = tick;
  record.telegraph = telegraphKind
    ? Object.freeze({ kind: telegraphKind, durationTicks: DOCTRINE_TELEGRAPH_TICKS, startedTick: tick })
    : null;
  record.telegraphStartedTick = telegraphKind ? tick : null;
  record.fireWindow = phase === 'strike' || phase === 'commit' || phase === 'fire_window'
    || phase === 'anchor_hold' || phase === 'broadside_fire'
    || phase === 'screen_hold' || phase === 'shield_dart';
}

function advanceCycle(record, tick, phase) {
  record.cycle++;
  record.actionTargetId = record.targetId;
  record.closestDistance = Infinity;
  record.flightPoint = null;
  enter(record, phase, tick, null);
}

function beginEgress(record, phase, tick, self, target, outcome) {
  record.outcome = outcome;
  record.flightPoint = egressPoint(self, target, record.side);
  enter(record, phase, tick, null);
}

function beginReform(record, tick) {
  // The committed egress point owns only the overshoot/escape beat. Leaving it attached during
  // reform makes ManeuverPlanner prefer that stale world point over the live formation slot, so a
  // wing that says "regroup" continues flying away. Release it at the phase boundary.
  record.flightPoint = null;
  enter(record, 'reform', tick, null);
}

function snapshot(record, target, directive, factionBehavior = null) {
  const phase = record.phase;
  const doctrineId = record.doctrineId;
  let maneuverKind = ManeuverKind.INTERCEPT;
  let preferredRange = 180;
  let allowedActionId = null;
  let formationLocked = false;
  let maneuverTargetId = target ? target.id : record.targetId;
  let lateralSign = record.side;
  let faceTarget = false;
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY || doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
    const brawler = doctrineId === CombatDoctrineId.BRAWLER_COMMIT || record.flightProfile === 'brawler_commit';
    formationLocked = phase === 'ingress' || phase === 'reform';
    lateralSign = phase === 'ingress' || phase === 'reform' ? 0 : record.side;
    if (phase === 'extend' || phase === 'breakaway') {
      maneuverKind = ManeuverKind.INTERCEPT;
      maneuverTargetId = null;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
    } else if (brawler && phase === 'commit') {
      // Commit is a sticky knife-fight, not a flyby intercept pass. Keep the nose on the target
      // and orbit inside gun range until the authored hold expires.
      maneuverKind = ManeuverKind.ORBIT;
      faceTarget = true;
    } else maneuverKind = ManeuverKind.INTERCEPT;
    preferredRange = phase === 'extend' || phase === 'breakaway' ? 620
      : (brawler && phase === 'commit' ? 140 : (brawler ? 190 : 150));
    if (phase === 'strike' || phase === 'commit') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
    formationLocked = phase === 'reform';
    if (phase === 'escape') {
      maneuverKind = ManeuverKind.RETREAT;
      maneuverTargetId = null;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
    } else maneuverKind = phase === 'flank' ? ManeuverKind.INTERCEPT : ManeuverKind.APPROACH_SOCKET;
    preferredRange = phase === 'flank' ? 190 : 90;
    if (phase === 'attach_window') allowedActionId = 'action_attach';
    if (phase === 'control') allowedActionId = 'action_reel';
  } else if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
    formationLocked = phase === 'approach' || phase === 'field_spool' || phase === 'anchor_hold' || phase === 'reform';
    lateralSign = 0;
    faceTarget = true;
    if (phase === 'recover' || phase === 'retreat') {
      maneuverKind = ManeuverKind.RETREAT;
      maneuverTargetId = null;
      preferredRange = 620;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
      preferredRange = 500;
    } else if (phase === 'anchor_hold' || phase === 'field_spool') {
      maneuverKind = ManeuverKind.HOLD;
      preferredRange = 460;
    } else {
      maneuverKind = ManeuverKind.INTERCEPT;
      preferredRange = 500;
    }
    if (phase === 'anchor_hold') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) {
    maneuverKind = ManeuverKind.ORBIT;
    preferredRange = 620;
    lateralSign = record.side;
    faceTarget = true;
    formationLocked = true;
    if (phase === 'broadside_fire') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) {
    // The screen point in record.flightPoint owns positioning; the nose stays on the threat so
    // the hold's guns bear without re-aiming. The dart is a short committed lunge.
    faceTarget = true;
    formationLocked = phase !== 'shield_dart';
    if (phase === 'shield_dart') {
      maneuverKind = ManeuverKind.ORBIT;
      preferredRange = 150;
      lateralSign = record.side;
    } else if (phase === 'regroup') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
      preferredRange = 500;
    } else {
      maneuverKind = phase === 'screen_approach' ? ManeuverKind.INTERCEPT : ManeuverKind.HOLD;
      preferredRange = 120;
    }
    if (phase === 'screen_hold' || phase === 'shield_dart') allowedActionId = 'action_burst';
  } else {
    maneuverKind = phase === 'retreat' ? ManeuverKind.RETREAT
      : (phase === 'outer_standoff' || phase === 'reset' ? ManeuverKind.ORBIT : ManeuverKind.HOLD);
    preferredRange = 620;
    // The standoff orbit is translational: fixed-gun ships keep their nose on the target while
    // sliding around the engagement ring, so even high-inertia hulls are aligned before the cue.
    faceTarget = phase !== 'retreat';
    if (phase === 'fire_window') allowedActionId = 'action_burst';
  }
  const isEgress = phase === 'extend' || phase === 'breakaway' || phase === 'escape' || phase === 'recover' || phase === 'retreat';
  if (factionBehavior && !isEgress) preferredRange = factionBehavior.preferredRange;
  return Object.freeze({
    doctrineId,
    flightProfile: record.flightProfile,
    phase,
    phaseStartedTick: record.phaseStartedTick,
    targetId: target ? target.id : record.targetId,
    actionTargetId: record.actionTargetId,
    cycle: record.cycle,
    side: record.side,
    lateralSign,
    faceTarget,
    telegraph: record.telegraph,
    telegraphStarted: record.telegraphStartedTick === record.lastTick,
    fireWindow: !!record.fireWindow,
    ramAuthorized: record.ramAuthorized === true,
    phaseChanged: !!target && record.phaseChangedTick === record.lastTick,
    formationLocked,
    maneuverTargetId,
    flightPoint: record.flightPoint,
    maneuverKind,
    preferredRange,
    allowedActionId,
    outcome: record.outcome,
    contestKind: doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER && phase === 'control'
      ? 'tether-control-contest'
      : null,
    directiveTargetId: directive && directive.objective && directive.objective.targetId,
  });
}

function targetScore(doctrineId, contact, ward = null) {
  const threat = finite(contact.threat, 0);
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    return threat * 5 + bandScore(contact.mobilityBand, ['low', 'medium', 'high']) * 2;
  }
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) {
    // Rate hostiles by how hard they press the ward, not by what they are worth to me: a light
    // scout sitting on the ward outranks a rich freighter far from it. No ward → plain threat.
    const base = threat * 4;
    if (!ward || !ward.pos || !contact.pos) return base;
    const d = Math.hypot(contact.pos.x - ward.pos.x, contact.pos.z - ward.pos.z);
    return base + Math.max(0, 1 - d / ESCORT_THREAT_RING_WU) * 6;
  }
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
    // WAS: `if (contact.tethered) return -100;` — a flat veto, no comment, introduced by c875aa40
    // ("fix(combat): make the opening fair and controllable"), a 37-file 5138-line commit with an
    // EMPTY BODY and no cited failure. It is not an opening-fairness tweak that leaked; it shipped
    // with the doctrine file itself.
    //
    // Why it had to go: `contact.tethered` is true for any entity that is EITHER end of an active
    // attachment (src/systems/aiPorts.js:446-447 indexes by ownerId AND targetId). The player is
    // therefore "tethered" the moment his own Massline touches anything at all — a rock, a chunk,
    // a wingman. So the veto made a raider drop the player as a doctrine target for using the
    // game's signature verb, and the AI layer already disagreed with itself about it:
    // src/ai/squad.js:346 and :459 give a tethered contact a POSITIVE bonus.
    //
    // Sizing. The same fact already costs a lined contact the full six points of
    // `tetherabilityBand: 'poor'` (aiPorts.js:984) — the honest "a line is in the way, this is
    // harder for ME to attach" signal, which stays. The bonus has to clear that cost before it can
    // express anything, so +8 nets exactly one band-step (+2) of preference over the same contact
    // free. That is a nudge, not a hijack: a heavy, rich, easily-lassoed hull still outranks a
    // lined empty scout, and a raider never abandons a good target to chase a bad tethered one.
    return threat + (contact.tethered ? TETHERED_PREY_BONUS : 0) +
      bandScore(contact.operationalMassBand, ['light', 'medium', 'heavy', 'capital']) * 2 +
      bandScore(contact.cargoBand, ['empty', 'light', 'valuable', 'rich']) * 2 +
      bandScore(contact.tetherabilityBand, ['poor', 'fair', 'good', 'excellent']) * 2;
  }
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
    return threat * 4 + (3 - bandScore(contact.mobilityBand, ['low', 'medium', 'high'])) * 3 +
      bandScore(contact.cargoBand, ['empty', 'light', 'valuable', 'rich']);
  }
  return threat * 5 + (3 - bandScore(contact.mobilityBand, ['low', 'medium', 'high'])) * 2;
}

function combatActorEligible(perception) {
  const self = perception && perception.self;
  const activity = self && self.activity;
  const kind = activity && activity.kind;
  const roe = self && self.roe;
  if (roe === 'weapons_free') return kind === 'attack_run' || kind === 'reposition' || kind === 'screen';
  if (roe === 'lawful_wanted_only') return kind === 'patrol_route' || kind === 'scan_approach';
  return false;
}

function conditionalHostilityActor(perception) {
  return perception && perception.self && perception.self.roe === 'lawful_wanted_only';
}

function bandScore(value, ordered) {
  const index = ordered.indexOf(String(value || ''));
  return index < 0 ? 0 : index;
}

function initialPhase(doctrineId) {
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'flank';
  if (doctrineId === CombatDoctrineId.RANGED_DISENGAGER) return 'outer_standoff';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'approach';
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) return 'broadside_approach';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'screen_approach';
  return 'ingress';
}

function flightProfileFor(doctrineId, self) {
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) return 'brawler_commit';
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE) return 'capital_broadside';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'escort_screen';
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY &&
    (self && (self.operationalMassBand === 'heavy' || self.operationalMassBand === 'capital'))) {
    return 'brawler_commit';
  }
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) return 'flyby';
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'tether_raider';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'field_anchor';
  return 'ranged_standoff';
}

function runHasPassed(record, self, target, distance) {
  if (!self || !target) return false;
  if (record.closestDistance < 220 && distance > record.closestDistance + 32) return true;
  const vx = finite(self.vel && self.vel.x);
  const vz = finite(self.vel && self.vel.z);
  const speed = Math.hypot(vx, vz);
  const fx = speed > 8 ? vx / speed : Math.cos(finite(self.rot));
  const fz = speed > 8 ? vz / speed : Math.sin(finite(self.rot));
  const tx = finite(target.pos && target.pos.x) - finite(self.pos && self.pos.x);
  const tz = finite(target.pos && target.pos.z) - finite(self.pos && self.pos.z);
  return tx * fx + tz * fz < -24;
}

function egressPoint(self, target, side) {
  const sx = finite(self && self.pos && self.pos.x);
  const sz = finite(self && self.pos && self.pos.z);
  const vx = finite(self && self.vel && self.vel.x);
  const vz = finite(self && self.vel && self.vel.z);
  const speed = Math.hypot(vx, vz);
  let dx = speed > 8 ? vx / speed : Math.cos(finite(self && self.rot));
  let dz = speed > 8 ? vz / speed : Math.sin(finite(self && self.rot));
  if (speed <= 8 && target && target.pos) {
    const awayX = sx - finite(target.pos.x);
    const awayZ = sz - finite(target.pos.z);
    const length = Math.hypot(awayX, awayZ);
    if (length > 1) {
      dx = awayX / length;
      dz = awayZ / length;
    }
  }
  const lateral = side < 0 ? -1 : 1;
  return Object.freeze({
    x: sx + dx * RUN_EGRESS_DISTANCE - dz * lateral * 80,
    z: sz + dz * RUN_EGRESS_DISTANCE + dx * lateral * 80,
  });
}

/**
 * True when a control line owned by somebody OTHER than this raider is already attached to the
 * body it is about to lasso. Reads the same TETHER contact stream `ownedTether` uses
 * (src/systems/aiPorts.js:748-778 publishes `ownerId` and `targetId` on every visible attachment),
 * so a foreign line is seen exactly when its midpoint is in sensor range or the raider is an
 * endpoint. Deliberately narrow: the player owning a line to something else is not contention.
 */
function contestedByForeignLine(perception, entityId, targetId) {
  if (!perception || !Array.isArray(perception.contacts) || targetId == null) return false;
  return perception.contacts.some((contact) => contact
    && contact.kind === ContactKind.TETHER
    && contact.targetId === targetId
    && contact.ownerId !== entityId);
}

function ownedTether(perception, entityId, targetId) {
  return perception && Array.isArray(perception.contacts)
    ? perception.contacts.find((contact) => contact && contact.kind === ContactKind.TETHER &&
      contact.ownerId === entityId && (targetId == null || contact.targetId === targetId)) || null
    : null;
}

function vectorReversed(perception, target) {
  const self = perception && perception.self;
  return closingSpeed(self, target) > 90;
}

function hasTag(contact, tag) {
  return !!contact && Array.isArray(contact.tags) && contact.tags.includes(tag);
}

function closingSpeed(self, target) {
  if (!self || !self.pos || !target || !target.pos) return 0;
  const dx = finite(target.pos.x) - finite(self.pos.x);
  const dz = finite(target.pos.z) - finite(self.pos.z);
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return 0;
  const rvx = finite(target.vel && target.vel.x) - finite(self.vel && self.vel.x);
  const rvz = finite(target.vel && target.vel.z) - finite(self.vel && self.vel.z);
  return -(rvx * dx + rvz * dz) / length;
}

function sideFor(seed, entityId, doctrineId, cycle, targetId) {
  return hashUnit(seed, entityId, doctrineId, cycle, targetId) < 0.5 ? -1 : 1;
}

function frozenRecord(record) {
  if (!record) return null;
  return Object.freeze({
    doctrineId: record.doctrineId,
    flightProfile: record.flightProfile,
    phase: record.phase,
    phaseStartedTick: record.phaseStartedTick,
    targetId: record.targetId,
    cycle: record.cycle,
    side: record.side,
    fireWindow: record.fireWindow,
    outcome: record.outcome,
    lastTick: record.lastTick,
  });
}

function compareIds(a, b) {
  return stableId(a).localeCompare(stableId(b));
}
