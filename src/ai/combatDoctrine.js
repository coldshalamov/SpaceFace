// M1.5 readable combat doctrines. Pure deterministic transient records: no world root, RNG stream,
// wall clock, action execution, physics mutation, or presentation ownership lives here.
import {
  ContactKind,
  ManeuverKind,
  ObjectiveKind,
  distance2,
  finite,
  hashUnit,
  memberObservedTarget,
  stableId,
  wrapAngle,
} from './contracts.js';
import { normalizeFactionBehaviorProfile } from './factionBehavior.js';
import { CAPITAL_BOSS_CHOREOGRAPHY } from '../data/combatDefs.js';

export const CombatDoctrineId = Object.freeze({
  INTERCEPTOR_FLYBY: 'interceptor_flyby',
  BRAWLER_COMMIT: 'brawler_commit',
  TETHER_CONTROL_RAIDER: 'tether_control_raider',
  FIELD_ANCHOR_CONTROLLER: 'field_anchor_controller',
  RANGED_DISENGAGER: 'ranged_disengager',
  CAPITAL_BROADSIDE: 'capital_broadside',
  CAPITAL_BROADSIDE_TOLLMAN: 'capital_broadside_tollman',
  CAPITAL_BROADSIDE_ALA: 'capital_broadside_ala',
  ESCORT_SCREEN: 'escort_screen',
  SWARM_PACK: 'swarm_pack',
  PACK_PURSUIT: 'pack_pursuit',
  MINE_LAYER_WAKE: 'mine_layer_wake',
  SHIELD_BREAKER: 'shield_breaker',
  DETONATOR_RUN: 'detonator_run',
});

export const DOCTRINE_TELEGRAPH_TICKS = 30;

const IDS = new Set(Object.values(CombatDoctrineId));
const INTERCEPTOR_STRIKE_MIN_TICKS = 24;
const INTERCEPTOR_STRIKE_MAX_TICKS = 54;
const INTERCEPTOR_EXTEND_TICKS = 75;
const INTERCEPTOR_EXTEND_MAX_TICKS = 180;
const INTERCEPTOR_REFORM_TICKS = 45;
// How far a flyby runs before it wheels back. 520 carried the whole pack off-screen at the default
// chase camera, so every pass read as flies leaving and returning; 380 keeps the gap readable
// but the pack in frame.
const INTERCEPTOR_EXTEND_DISTANCE_WU = 380;
// Below this speed the target cannot maneuver out of a re-attack: a parked or drifting craft
// gains nothing from the flyby's long extend leg, so the run wheels straight back into reform.
// Only a CONTROL-dispatched responder takes that shortcut (securityDispatched). Every other
// interceptor stays PQ-140.00's positioning problem and extends-and-returns even past a parked
// player: applied to everyone, the shortcut erased the readable gap between passes whenever the
// player came to rest, which hands-off assisted flight does by design.
const INTERCEPTOR_STATIONARY_TARGET_SPEED = 8;
const BRAWLER_COMMIT_MIN_TICKS = 90;
const BRAWLER_COMMIT_MAX_TICKS = 120;
// The commit drive is a mass-committed charge through a fixed forecast point: the run solves the
// target's position at arrival using a nominal approach speed, then extends well past it so the
// arrival brake can never engage mid-run. A late sidestep leaves the hull blowing through the
// corridor — overshoot and breakaway recovery are the honest consequences.
const BRAWLER_CHARGE_LEAD_SPEED = 160;
const BRAWLER_CHARGE_OVERSHOOT_WU = 420;
// A committed firing corridor allows only bounded correction: the anchor is the true lead at cue
// time, and the window may refine inside ±cap but never re-track a dodge.
const SNIPER_AIM_CORRECTION_RAD = 0.1;
const SNIPER_CORRIDOR_NOMINAL_SPEED = 340;
const BRAWLER_BREAKAWAY_TICKS = 105;
// Distance-gated egress exits also need a clock: a breakaway that requires separation never
// happens when the target keeps chasing, and without a hatch the "break" inverts into a hull
// that runs from a pursuer forever and never re-commits. Same pattern as INTERCEPTOR_EXTEND_MAX.
const BRAWLER_BREAKAWAY_MAX_TICKS = 240;
const BRAWLER_REFORM_TICKS = 60;
const TETHER_ATTACH_TICKS = 15;
const TETHER_CONTROL_TICKS = 90;
const TETHER_ESCAPE_TICKS = 90;
const TETHER_ESCAPE_MAX_TICKS = 240;
const TETHER_REFORM_TICKS = 45;
const FIELD_ANCHOR_HOLD_TICKS = 180;
const FIELD_ANCHOR_RECOVER_TICKS = 75;
const FIELD_ANCHOR_RECOVER_MAX_TICKS = 200;
const RANGED_REPOSITION_TICKS = 45;
const RANGED_FIRE_TICKS = 18;
const RANGED_RESET_TICKS = 18;
// Panic floor for the disengager ring. Post-A5 the shared engagement envelope is ~240-280 WU and
// faction presence standoffs sample inside it, so the press trigger must sit below the lowest
// authored standoff band (170 WU) instead of above the doctrine's own 240 WU default orbit.
const RANGED_PRESS_FLOOR_WU = 140;
// A committed corridor is owed its volley once announced. A window measured in ticks assumed the
// standoff's faceTarget tracking left the nose nearly aligned at cue time; a heavy hull handed the
// telegraph mid heading-flip (an enemy-mind crossing can carry well over 1 rad/s) slews onto the
// announced line long after 18 ticks — every such cycle ended committed_aim_off_bore and the
// volley never existed. While the corridor is still unborne the window stays open so the shot
// releases the moment a mount cone covers the line, bounded so a corridor the hull can never
// reach still ends the cycle.
const RANGED_CORRIDOR_BORE_RAD = 0.3;
const RANGED_FIRE_MAX_TICKS = 160;
// Swarm pack: the light-hull identity. Short synchronized passes instead of the raider flyby's
// measured cycle — the fight reads as a swarm, not as three lone interceptors taking turns.
// The strike window has to outlive the action cooldown race (burst cooldown 12t + executor
// blocked-retry backoff) or the pass ends before a single salvo lands.
const SWARM_STRIKE_MIN_TICKS = 20;
const SWARM_STRIKE_MAX_TICKS = 44;
const SWARM_EXTEND_TICKS = 30;
const SWARM_EXTEND_MAX_TICKS = 90;
const SWARM_REFORM_TICKS = 24;
// Start the full half-second cue before the close pass, while a light hull still has room to
// line up its fixed gun. At 200 WU the target crosses most of the firing band during the cue;
// return fire then knocks the fragile attacker off aim before its first useful salvo.
const SWARM_INGRESS_RANGE_WU = 340;
// Pack pursuit stays inside the fight. No breakaway, no 960 WU egress point.
const PACK_PRESS_RANGE_WU = 200;
const PACK_ORBIT_RANGE_WU = 130;
// SF-056 wounded fallback: damage to a meaningful subsystem breaks the press into a bounded
// retreat toward a perceived affordance (the nearest friendly hull — the pack IS the cover — or
// the shadow of a hazard), never toward a fresh firing line. Enter at a subsystem half-dead; the
// latch re-arms only when it is repaired past the exit band, so a crippled hull cannot flicker
// press/retreat on the same wound. The run is bounded: arrive-and-settle or a max-tick cap, then
// it fights hurt rather than kiting forever.
const PACK_WOUND_ENTER_FRACTION = 0.5;
const PACK_WOUND_EXIT_FRACTION = 0.75;
const PACK_RETREAT_ARRIVE_WU = 90;
const PACK_RETREAT_MIN_TICKS = 60;
const PACK_RETREAT_MAX_TICKS = 60 * 14;
const PACK_RETREAT_FLEE_WU = 700;
const PACK_RETREAT_COVER_DEPTH_WU = 60;
const PACK_WOUND_SUBSYSTEMS = Object.freeze([
  'subsystem_drive', 'subsystem_weapon', 'subsystem_sensor', 'subsystem_power',
]);
// Mine-layer wake: flank, telegraph the salted wake, fly the drop line, disengage.
// PQ-205.02: the drop line is the pursuit-lane bomb doctrine — npcBombMirror calls
// bombs.drop / commandDetonate after the wake_mines telegraph. Physical mines still
// seed from mineLayerVerb during the same phase.
const MINE_FLANK_RANGE_WU = 340;
const MINE_DROP_TICKS = 70;
const MINE_DISENGAGE_TICKS = 45;
const MINE_DISENGAGE_MAX_TICKS = 180;
const MINE_REFORM_TICKS = 40;
// Shield-breaker: close through the engagement band, telegraph the lance, land the ion/plasma
// burst, peel while the target's capacitor is scrambled. Hit-and-run rhythm, never a grind.
const SHIELD_CLOSE_RANGE_WU = 300;
const SHIELD_LANCE_TICKS = 36;
const SHIELD_PEEL_TICKS = 36;
const SHIELD_PEEL_MAX_TICKS = 150;
const SHIELD_REFORM_TICKS = 30;
// detonator_run: a kamikaze dart's whole fight is WHERE it dies. Close to fuse range, read a
// telegraphed wind-up (the dart keeps closing while lit), then commit to one straight final
// run. There is no fire window — the hull is the payload and impulseCharges owns the pop.
const DETONATOR_FUSE_RANGE_WU = 240;
const DETONATOR_FUSE_TICKS = DOCTRINE_TELEGRAPH_TICKS;
const DETONATOR_COMMIT_MIN_TICKS = 20;
const DETONATOR_COMMIT_MAX_TICKS = 150;
const DETONATOR_BREAKAWAY_TICKS = 50;
const DETONATOR_REFORM_TICKS = 50;
// Identity doctrines own their engagement band: factionBehavior.preferredRange would otherwise
// re-flatten every identity onto its faction's sampled range and re-collapse the vocabulary.
// The boss choreographies are staged the same way — the act table owns the standoff.
const IDENTITY_OWNED_RANGE_DOCTRINES = new Set([
  CombatDoctrineId.SWARM_PACK,
  CombatDoctrineId.MINE_LAYER_WAKE,
  CombatDoctrineId.SHIELD_BREAKER,
  CombatDoctrineId.DETONATOR_RUN,
  CombatDoctrineId.CAPITAL_BROADSIDE,
  CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN,
  CombatDoctrineId.CAPITAL_BROADSIDE_ALA,
]);
// Escort screen: the warden's job is the WARD, not the kill. It holds a point between its nearest
// friendly and the pressed threat, and darts only when the threat actually breaches the ward.
// SF-048 (PB-TAC-B): the ward is CUSTODY — a sticky bind to an actual carrier (sensor cargo
// band), not "whoever is nearest right now" — and the dart's chase is leashed to it.
const ESCORT_APPROACH_RANGE_WU = 160;
const ESCORT_APPROACH_TICKS = 60;
const ESCORT_HOLD_TICKS = 150;
const ESCORT_DART_TICKS = 36;
const ESCORT_REGROUP_TICKS = 45;
const ESCORT_BREACH_WU = 260;
const ESCORT_THREAT_RING_WU = 900;
// The dart answers pressure on the ward, but the load outranks the chase: a lunge that would
// drag the screen this far off its custody carrier ends and the hull returns to the hold.
const ESCORT_DART_LEASH_WU = 420;
// Sensor cargo bands rank actual haulers over empty hulls (contact.cargoBand).
const CARGO_BAND_RANK = new Map([['rich', 3], ['valuable', 2], ['light', 1], ['empty', 0]]);
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
    // A CONTROL/ambush-dispatched assignment arrives as a reported track — the responder is
    // ordered onto the offender on the jurisdiction's word, beyond its own sensor reach, so the
    // doctrine may close on the unseen contact. Ordinary remembered contacts stay excluded; a
    // stale memory cannot advance a telegraph into attack.
    if (contact.alive !== true || contact.valid !== true
      || (contact.visible !== true && contact.dispatchedTarget !== true)) continue;
    if (finite(contact.confidence, 0) < 0.55) continue;
    const score = targetScore(doctrine, contact, ward);
    if (score > bestScore || (score === bestScore && best && compareIds(contact.id, best.id) < 0)) {
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
    if (d < bestDist || (d === bestDist && best && compareIds(contact.id, best.id) < 0)) {
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
    record.fallbackRearmed = false;
    record.telegraphStartedTick = null;

    if (!target) {
      enter(record, initialPhase(doctrineId), tick, null);
      return snapshot(record, null, directive, factionBehavior, self);
    }

    const distance = self && self.pos ? distance2(self.pos, target.pos) : Infinity;
    // Fodder that was stamped to stay packed never takes the flyby egress, including the
    // disabled-target and pressure-break hatches that aim a point 960 WU away.
    if (doctrineId === CombatDoctrineId.PACK_PURSUIT) {
      updatePackPursuit(record, tick, self, target, distance, perception);
      return snapshot(record, target, directive, factionBehavior, self);
    }
    // Production supplies this from aiPorts' live combat-runtime query. The contact fallback keeps
    // the pure/worldless doctrine API usable for fixtures and non-production adapters that have no
    // state port; an explicit null is authoritative and must not be replaced by cached perception.
    const disabledNonlethalTarget = disabledNonlethalTargetId === undefined
      ? !!(factionBehavior && (factionBehavior.disableThenRun || factionBehavior.destroyTarget === false)
        && target.disabled === true)
      : disabledNonlethalTargetId != null && stableId(disabledNonlethalTargetId) === stableId(target.id);
    if (disabledNonlethalTarget) {
      // The disabled-target egress must name a phase the doctrine's own update loop advances —
      // egressPhaseFor owns that mapping for a PRESSURE break, but a completed disable is not a
      // disengage leg: an interceptor's 'extend' re-approaches for another pass, which would
      // loop back onto the disabled hull it was sent to spare. Completion takes 'breakaway'.
      const egressPhase = doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY
        ? 'breakaway' : egressPhaseFor(record);
      if (record.phase !== egressPhase) beginEgress(record, egressPhase, tick, self, target, 'target_disabled');
      return snapshot(record, target, directive, factionBehavior, self);
    }
    if (pressureBreakDue(record, self, tick)) {
      beginEgress(record, egressPhaseFor(record), tick, self, target, PRESSURE_BREAK_OUTCOME);
      return snapshot(record, target, directive, factionBehavior, self);
    }
    if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
      updateInterceptor(record, tick, self, target, distance, securityDispatched(directive, self));
    } else if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
      updateBrawler(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
      updateTetherRaider(record, tick, entityId, perception, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
      updateFieldAnchor(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE
      || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN
      || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_ALA) {
      updateCapitalBroadside(record, tick, self, distance);
    } else if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) {
      updateEscort(record, tick, perception, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.SWARM_PACK) {
      updateSwarmPack(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) {
      updateMineLayer(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.SHIELD_BREAKER) {
      updateShieldBreaker(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.DETONATOR_RUN) {
      updateDetonator(record, tick, self, target, distance);
    } else {
      updateRanged(record, tick, self, target, distance);
    }
    return snapshot(record, target, directive, factionBehavior, self);
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

export function overrideDirectiveForCombatDoctrine(directive, doctrine, perception = null) {
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
  // SF-057: this rebuild must not launder a stale mark into a firing solution. Same target → the
  // squad's merged verdict carries; a re-pointed target (a doctrine-selected contact, dispatched
  // or stale) → the member's own contact decides. Pass the perception the doctrine ran on.
  const observed = directive.objective && directive.objective.targetId != null
    && stableId(directive.objective.targetId) === stableId(targetId)
    ? directive.objective.targetObserved
    : memberObservedTarget(perception, targetId);
  return Object.freeze({
    ...directive,
    focusTargetId: doctrine.targetId,
    objective: Object.freeze({
      kind, targetId, reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}`,
      ...(observed !== undefined ? { targetObserved: observed } : {}),
    }),
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
      faceAngle: Number.isFinite(doctrine.faceAngle) ? doctrine.faceAngle : null,
      ramAuthorized: doctrine.ramAuthorized === true,
      flightPoint: doctrine.flightPoint,
      formationLocked: doctrine.formationLocked,
      breakFormation: !doctrine.formationLocked,
      attackLine: doctrine.attackLine || null,
      crossingLane: (doctrine.doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY &&
          (doctrine.phase === 'engine_flare' || doctrine.phase === 'strike'))
        || (doctrine.phase === 'commit' && (doctrine.doctrineId === CombatDoctrineId.BRAWLER_COMMIT
          || doctrine.flightProfile === 'brawler_commit')),
      reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}`,
    },
  };
}

function updateInterceptor(record, tick, self, target, distance, dispatched = false) {
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
      if (dispatched && interceptorTargetStationary(target)) beginReform(record, tick);
      else beginEgress(record, 'extend', tick, self, target, 'attack_run_complete');
    }
  } else if (record.phase === 'extend' && age >= INTERCEPTOR_EXTEND_TICKS &&
    (distance >= INTERCEPTOR_EXTEND_DISTANCE_WU || age >= INTERCEPTOR_EXTEND_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'breakaway' && age >= INTERCEPTOR_EXTEND_TICKS &&
    (distance >= INTERCEPTOR_EXTEND_DISTANCE_WU || age >= INTERCEPTOR_EXTEND_MAX_TICKS)) {
    // A completed-disable egress lands here so the hull never re-approaches its spared target.
    // While the target stays disabled the caller re-pins this phase each tick; a repaired
    // target must release the ship back to its cycle instead of parking on a stale egress.
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
    // Mass commitment: the run drives at a fixed world point — the target's forecast position
    // extended past it — so the charge cannot re-plan around a late sidestep. Overshoot and a
    // possible wall/body meet are the authored payoff; beginEgress owns the recovery beat.
    record.flightPoint = committedChargePoint(self, target, distance);
    enter(record, 'commit', tick, null);
  } else if (record.phase === 'commit') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= BRAWLER_COMMIT_MIN_TICKS && passed) || age >= BRAWLER_COMMIT_MAX_TICKS) {
      beginEgress(record, 'breakaway', tick, self, target, 'brawler_commit_complete');
    }
  } else if (record.phase === 'breakaway' && age >= BRAWLER_BREAKAWAY_TICKS &&
    (distance >= 600 || age >= BRAWLER_BREAKAWAY_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= BRAWLER_REFORM_TICKS) {
    advanceCycle(record, tick, 'ingress');
  }
}

/**
 * Kamikaze run: ingress -> fuse_cue (telegraphed, still closing) -> commit (one straight final
 * approach). The doctrine never advertises a weapon — `commit` sets fireWindow through enter()
 * so a hurt dart can pressure-break like any other committed attacker, but allowedActionId
 * stays null and engagementAuthority names no fire phase for this doctrine. The blast itself is
 * a physics fact owned by impulseCharges (proximity fuse + death pop), not a fire intent.
 * A missed run (overshot the target) egresses, reforms, and lights the fuse again — every pass
 * re-announces itself, which is the readable part.
 */
function updateDetonator(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'ingress' && distance <= DETONATOR_FUSE_RANGE_WU) {
    enter(record, 'fuse_cue', tick, 'detonator_fuse');
  } else if (record.phase === 'fuse_cue' && age >= DETONATOR_FUSE_TICKS) {
    record.closestDistance = distance;
    enter(record, 'commit', tick, null);
  } else if (record.phase === 'commit') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= DETONATOR_COMMIT_MIN_TICKS && passed) || age >= DETONATOR_COMMIT_MAX_TICKS) {
      beginEgress(record, 'breakaway', tick, self, target, 'detonator_missed');
    }
  } else if (record.phase === 'breakaway' && age >= DETONATOR_BREAKAWAY_TICKS
    && (distance >= 420 || age >= DETONATOR_BREAKAWAY_TICKS * 3)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= DETONATOR_REFORM_TICKS) {
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
  else if (record.phase === 'escape' && age >= TETHER_ESCAPE_TICKS &&
    (distance >= 700 || age >= TETHER_ESCAPE_MAX_TICKS)) beginReform(record, tick);
  else if (record.phase === 'reform' && age >= TETHER_REFORM_TICKS) advanceCycle(record, tick, 'flank');
  record.actionTargetId = tether ? (tether.attachmentId || tether.id) : target.id;
}

function updateFieldAnchor(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'approach' && distance <= 540) enter(record, 'field_spool', tick, 'field_spool');
  else if (record.phase === 'field_spool' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'anchor_hold', tick, null);
  else if (record.phase === 'anchor_hold' && (age >= FIELD_ANCHOR_HOLD_TICKS || distance < 220)) {
    beginEgress(record, 'recover', tick, self, target, 'field_cycle_complete');
  } else if (record.phase === 'recover' && age >= FIELD_ANCHOR_RECOVER_TICKS &&
    (distance >= 520 || age >= FIELD_ANCHOR_RECOVER_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= TETHER_REFORM_TICKS) {
    advanceCycle(record, tick, 'approach');
  }
}

/**
 * SF-048 custody: the escort's ward is a sticky bind to an actual carrier, chosen from the live
 * sensor facts — cargo band first (rich > valuable > light > empty), then nearest, then stable
 * id. The bind survives tick-to-tick (the escort visibly guards THAT hull) and revalidates
 * against the world every update: carrier died → next carrier; load delivered/transferred (the
 * band flattened) → rebind; no carrier facts at all → fail closed to the plain nearest-friendly
 * ward (the pre-SF-048 behavior).
 */
function escortCustody(record, perception, self) {
  if (!perception || !Array.isArray(perception.contacts)) return escortWard(perception, self);
  const selfPos = self && self.pos ? self.pos : perception.self && perception.self.pos;
  const candidates = [];
  for (const contact of perception.contacts) {
    if (!contact || contact.kind !== ContactKind.SHIP || contact.hostile === true) continue;
    if (contact.alive !== true || contact.visible !== true || !contact.pos) continue;
    const d = selfPos
      ? Math.hypot(contact.pos.x - selfPos.x, contact.pos.z - selfPos.z)
      : 0;
    candidates.push({ contact, d });
  }
  if (!candidates.length) {
    if (record) record.custodyTargetId = null;
    return null;
  }
  const rankOf = (row) => CARGO_BAND_RANK.get(row.contact.cargoBand) || 0;
  // The bind survives tick-to-tick — but only while the bound hull still CARRIES. A delivered
  // or transferred load ends the obligation (SF-048 revalidation): the ward rebinds, falling
  // back to the plain nearest-friendly ward when nothing carries anymore. The comparator is
  // idempotent while the world is unchanged, so the per-tick rebind never flaps.
  const bound = record && record.custodyTargetId != null
    ? candidates.find((row) => stableId(row.contact.id) === stableId(record.custodyTargetId))
    : null;
  if (bound && rankOf(bound) > 0) return bound.contact;
  let best = null;
  let bestKey = null;
  for (const row of candidates) {
    const key = [-rankOf(row), row.d, stableId(row.contact.id)];
    if (!best || compareKeys(key, bestKey) < 0) {
      best = row;
      bestKey = key;
    }
  }
  if (record) record.custodyTargetId = best ? best.contact.id : null;
  return best ? best.contact : null;
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function updateEscort(record, tick, perception, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  const ward = escortCustody(record, perception, self);
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
    // SF-048 leash: the load outranks the chase. A dart that would carry the screen beyond
    // leash range of its custody carrier breaks off and re-holds — the pilot has left the
    // cargo fight, and the escort has not.
    const leashed = !!(ward && ward.pos && self && self.pos
      && Math.hypot(self.pos.x - ward.pos.x, self.pos.z - ward.pos.z) > ESCORT_DART_LEASH_WU);
    if (leashed || age >= ESCORT_DART_TICKS || runHasPassed(record, self, target, distance)) {
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

// Non-offensive phases the break never fires from. This includes every doctrine's authored egress
// phase (egressPhaseFor) — the escort's 'regroup' is the one that bit: pressureBreakDue short-
// circuits updateEscort, so without the exclusion a damaged escort circled in regroup forever and
// never re-committed. The doctrine's own egress phase is excluded by name so the list cannot drift
// from egressPhaseFor again.
const PRESSURE_BREAK_EXCLUDED_PHASES = new Set([
  'extend', 'breakaway', 'escape', 'recover', 'retreat', 'reform', 'regroup', 'reset', 'broadside_shift',
  'disengage', 'peel',
]);

/**
 * True when the hull's own state (hull fraction, weapon heat) demands the bounded egress beat.
 * Only fires from an offensive phase — the egress/reform lull is exactly the recovery the break
 * exists to buy — and only after the phase has been lived in, so the opening beat always commits.
 */
function pressureBreakDue(record, self, tick) {
  if (!self || !Number.isFinite(self.hullFraction)) return false;
  const phase = record.phase;
  if (PRESSURE_BREAK_EXCLUDED_PHASES.has(phase)) return false;
  if (phase === egressPhaseFor(record)) return false;
  if (tick - record.phaseStartedTick < PRESSURE_MIN_PHASE_TICKS) return false;
  // Hull never recovers mid-fight, so without this gate a hurt ship would re-break at exactly
  // PRESSURE_MIN_PHASE_TICKS of every approach leg and never reach a fire window again — the
  // break must land during the actual grind (strike/commit/hold), not cancel the re-press.
  // Two doctrines never satisfy this gate and are deliberately break-proof: the tether raider
  // (its grind phase 'control' is not a fire window — a break mid-tow would strand the escape
  // machine's line-lost handling, and control already has four authored abort outcomes) and the
  // ranged disengager (its fire_window lasts RANGED_FIRE_TICKS=18 < PRESSURE_MIN_PHASE_TICKS, and
  // it already self-breaks on the closing_interrupt retreat).
  if (!record.fireWindow) return false;
  const hull = self.hullFraction;
  const heat = Number.isFinite(self.heatFraction) ? self.heatFraction : 0;
  if (hull < CORNERED_HULL_FRACTION) return false;
  return hull <= PRESSURE_HULL_FRACTION || heat >= PRESSURE_HEAT_FRACTION;
}

/** Each doctrine breaks to its own authored egress phase so the maneuver vocabulary stays coherent. */
function egressPhaseFor(record) {
  const doctrineId = record && record.doctrineId;
  // A heavy/capital-mass interceptor flies the brawler profile (flightProfileFor), so every phase
  // of its record is advanced by updateBrawler — which has no 'extend' branch. Breaking it to
  // 'extend' parked the hull on a stale egress point in a phase nothing would ever advance.
  // The break must name the egress phase of the PROFILE actually driving the record.
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    return record && record.flightProfile === 'brawler_commit' ? 'breakaway' : 'extend';
  }
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) return 'breakaway';
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'escape';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'recover';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'regroup';
  if (doctrineId === CombatDoctrineId.SWARM_PACK) return 'extend';
  if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) return 'disengage';
  if (doctrineId === CombatDoctrineId.SHIELD_BREAKER) return 'peel';
  if (doctrineId === CombatDoctrineId.DETONATOR_RUN) return 'breakaway';
  // The capital has no generic retreat machine: broadside_shift is its authored reposition beat
  // (timer exit back to broadside_charge), so a broken-off capital re-enters its cycle instead of
  // parking on a stale flightPoint in a phase updateCapitalBroadside never advances.
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_ALA) return 'broadside_shift';
  return 'retreat';
}

function updateRanged(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  // The closing interrupt answers the TARGET's press — a hull must never read its own run-in as an
  // incoming charge. Mutual closure would count the disengager's approach speed too: any hull whose
  // cruise exceeds the threshold self-interrupted every ingress and orbited in retreat forever,
  // never reaching charge_cue (measured on fast survey hulls at cruise ~60+).
  const press = targetPressSpeed(self, target);
  if (distance < RANGED_PRESS_FLOOR_WU || press > 55) {
    if (record.phase !== 'retreat') {
      record.outcome = 'closing_interrupt';
      enter(record, 'retreat', tick, null);
    }
    return;
  }
  if (record.phase === 'retreat') {
    if (distance >= 520 && press < 10) enter(record, 'outer_standoff', tick, null);
    return;
  }
  // The charge floor must meet the retreat trigger exactly: between them the doctrine had no
  // legal move — too close to fire, too far to flee — and a disengager parked inside the dead
  // band orbited in outer_standoff forever. Retreat is checked first, so the floor stays panic
  // territory; it lives below the 240-280 WU A5 envelope the authored standoff bands orbit in.
  if (record.phase === 'outer_standoff' && age >= RANGED_REPOSITION_TICKS
    && distance >= RANGED_PRESS_FLOOR_WU && distance <= 1100) {
    enter(record, 'charge_cue', tick, 'weapon_charge');
    // The corridor commits at the telegraph, not at the shot: the nose holds this forecast bearing
    // through the wind-up and the fire window can only refine inside a small bound, so a timed
    // lateral dodge or a line-of-sight break during the cue actually beats the volley.
    record.aimCommitBearing = corridorBearing(self, target);
  }
  else if (record.phase === 'charge_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'fire_window', tick, null);
  else if (record.phase === 'fire_window' && age >= RANGED_FIRE_TICKS) {
    // While the announced corridor is still outside every mount cone the hull is mid-slew onto
    // the committed line — the window holds open so the volley releases the moment the guns
    // bear, instead of stranding the cue's commitment. Bounded: a corridor the hull can never
    // reach still ends the cycle.
    const corridorUnborne = Number.isFinite(record.aimCommitBearing)
      && Number.isFinite(self && self.rot)
      && Math.abs(wrapAngle(record.aimCommitBearing - self.rot)) > RANGED_CORRIDOR_BORE_RAD;
    if (!corridorUnborne || age >= RANGED_FIRE_MAX_TICKS) enter(record, 'reset', tick, null);
  }
  else if (record.phase === 'reset' && age >= RANGED_RESET_TICKS) advanceCycle(record, tick, 'outer_standoff');
}

/**
 * Capital broadside + the three boss choreographies. The boss tables (CAPITAL_BOSS_CHOREOGRAPHY
 * in src/data/combatDefs.js) stage the fight by hull fraction: each stage has its own telegraph
 * cue, fire cadence and standoff, so a boss kill reads as acts — not one loop until death. A
 * stage transition interrupts the current act and re-enters broadside_charge with the new cue,
 * which is what the ai:telegraph / ai:doctrinePhase listeners (and the player) see.
 */
function capitalStageFor(record, self) {
  const table = CAPITAL_BOSS_CHOREOGRAPHY[record.doctrineId];
  const stages = (table && table.stages) || CAPITAL_BOSS_CHOREOGRAPHY.capital_broadside.stages;
  const hull = self && Number.isFinite(self.hullFraction) ? self.hullFraction : 1;
  let stage = stages[0];
  for (const candidate of stages) {
    if (hull <= candidate.hullAtMost) stage = candidate;
  }
  return stage;
}

function updateCapitalBroadside(record, tick, self, distance) {
  const stage = capitalStageFor(record, self);
  const stageIndex = CAPITAL_BOSS_CHOREOGRAPHY[record.doctrineId]
    ? CAPITAL_BOSS_CHOREOGRAPHY[record.doctrineId].stages.indexOf(stage)
    : 0;
  if (stageIndex > (record.bossStage || 0)) {
    // A new act begins: announce it through the charge telegraph even mid-broadside.
    record.bossStage = stageIndex;
    if (record.phase !== 'broadside_approach') {
      // An act that opens during the shift beat (a pressure break or disabled-target hatch just
      // put the hull on its egress point, then damage crossed the act threshold) completes that
      // shift exactly as its timer exit does: the cycle advances and the egress point is released.
      // Without this the boss charged and fired while steering for a point 960 WU away, because
      // a set flightPoint outranks every maneuver in the planner.
      if (record.phase === 'broadside_shift') record.cycle++;
      record.flightPoint = null;
      enter(record, 'broadside_charge', tick, stage.cue);
      return;
    }
  }
  const age = tick - record.phaseStartedTick;
  if (distance > 1100 && record.phase !== 'broadside_approach') {
    enter(record, 'broadside_approach', tick, null);
    return;
  }
  if (record.phase === 'broadside_approach' && distance <= stage.preferredRange + 640) {
    enter(record, 'broadside_charge', tick, stage.cue);
  } else if (record.phase === 'broadside_charge' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    enter(record, 'broadside_fire', tick, null);
  } else if (record.phase === 'broadside_fire' && age >= stage.fireTicks) {
    record.side *= -1;
    enter(record, 'broadside_shift', tick, null);
  } else if (record.phase === 'broadside_shift' && age >= stage.shiftTicks) {
    record.cycle++;
    // Release the egress/shift steering point so the re-committed cycle steers on its own maneuver.
    record.flightPoint = null;
    enter(record, 'broadside_charge', tick, stage.cue);
  }
}

/**
 * The light-hull pack identity: short committed passes with a tight extend, so a swarm fight is
 * a rapid sequence of flank→flare→strike→extend beats instead of the raider flyby's long cycles.
 */
function updatePackPursuit(record, tick, self, target, distance, perception) {
  const wound = woundedSubsystemFraction(self);
  // Hysteresis: a repaired-above-exit hull re-arms its one fallback; until then the spent wound
  // cannot re-trigger, so a crippled hull fights hurt instead of flickering press/retreat.
  if (wound >= PACK_WOUND_EXIT_FRACTION) {
    // The persisted latch counts as spent too: a record rebuilt after save:loaded starts armed,
    // so without the self flag here the re-arm pulse would never fire and the saved latch would
    // hold every later retreat closed.
    if (record.fallbackArmed === false || (self && self.woundedFallbackSpent === true)) {
      record.fallbackRearmed = true;
    }
    record.fallbackArmed = true;
  }
  if (record.phase === 'retreat') {
    // Allies move — re-resolve the anchor from current perception every tick rather than chasing
    // the position the packmate occupied when the run began.
    const anchor = retreatAnchorFor(self, target, perception);
    record.flightPoint = anchor || retreatFleePoint(self, target);
    const age = tick - record.phaseStartedTick;
    if ((anchor && pointWithin(self, anchor, PACK_RETREAT_ARRIVE_WU) && age >= PACK_RETREAT_MIN_TICKS)
      || age >= PACK_RETREAT_MAX_TICKS) {
      record.outcome = 'wounded_fallback';
      record.flightPoint = null;
      enter(record, 'press', tick, null);
    }
    return;
  }
  // The spent latch also lives on the entity (data.ai.woundedFallbackSpent): the doctrine record
  // is rebuilt empty after a save/load and a still-crippled hull must not buy a second retreat.
  const fallbackSpent = record.fallbackArmed === false
    || (self && self.woundedFallbackSpent === true);
  if (!fallbackSpent && wound <= PACK_WOUND_ENTER_FRACTION) {
    record.fallbackArmed = false;
    record.outcome = 'wounded_fallback';
    enter(record, 'retreat', tick, null);
    record.flightPoint = retreatAnchorFor(self, target, perception) || retreatFleePoint(self, target);
    return;
  }
  if (record.phase !== 'press' && distance <= PACK_PRESS_RANGE_WU) {
    enter(record, 'press', tick, null);
  }
}

/**
 * SF-056: damage to a meaningful subsystem — drive, teeth, eyes, or the power feeding all three.
 * A hull with no subsystem state reads intact and never takes the fallback.
 */
function woundedSubsystemFraction(self) {
  const fractions = self && self.subsystemFractions;
  if (!fractions || typeof fractions !== 'object') return 1;
  let min = 1;
  for (const id of PACK_WOUND_SUBSYSTEMS) {
    const fraction = Number(fractions[id]);
    if (Number.isFinite(fraction) && fraction < min) min = fraction;
  }
  return min;
}

/**
 * The pack's cover is its own hulls: nearest currently-visible friendly contact wins. Absent
 * friendlies, the shadow of the nearest hazard — put the rock between the hull and the shooter.
 * Both come from live perception only: a retreat toward a contact nobody holds is a guess at a
 * stale picture, not cover. Returns null when perception offers no affordance.
 */
function retreatAnchorFor(self, target, perception) {
  if (!perception || !Array.isArray(perception.contacts) || !self || !self.pos) return null;
  let ally = null, allyDistance = Infinity;
  let hazard = null, hazardDistance = Infinity;
  for (const contact of perception.contacts) {
    if (!contact || contact.alive === false || !contact.pos || contact.id === self.id) continue;
    const dx = contact.pos.x - self.pos.x;
    const dz = contact.pos.z - self.pos.z;
    const d = Math.hypot(dx, dz);
    if (contact.kind === ContactKind.SHIP && contact.hostile !== true
      && contact.team != null && self.team != null && contact.team === self.team
      && contact.visible === true) {
      if (d < allyDistance || (d === allyDistance && ally && compareIds(contact.id, ally.id) < 0)) {
        ally = contact; allyDistance = d;
      }
    } else if (contact.kind === ContactKind.HAZARD && contact.visible === true) {
      if (d < hazardDistance || (d === hazardDistance && hazard && compareIds(contact.id, hazard.id) < 0)) {
        hazard = contact; hazardDistance = d;
      }
    }
  }
  if (ally) return { x: ally.pos.x, z: ally.pos.z };
  if (hazard && target && target.pos) {
    // The cover shadow sits on the hazard's far side from the threat, one hull-width deep.
    const dx = hazard.pos.x - target.pos.x;
    const dz = hazard.pos.z - target.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const depth = (Number(hazard.radius) || 0) + PACK_RETREAT_COVER_DEPTH_WU;
    return { x: hazard.pos.x + (dx / len) * depth, z: hazard.pos.z + (dz / len) * depth };
  }
  return null;
}

/** No affordance perceived: run straight off the threat, bounded by PACK_RETREAT_MAX_TICKS. */
function retreatFleePoint(self, target) {
  const selfPos = self && self.pos ? self.pos : { x: 0, z: 0 };
  const from = target && target.pos ? target.pos : { x: selfPos.x, z: selfPos.z - 1 };
  let dx = selfPos.x - from.x;
  let dz = selfPos.z - from.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.001)) { dx = 0; dz = 1; }
  else { dx /= len; dz /= len; }
  return { x: selfPos.x + dx * PACK_RETREAT_FLEE_WU, z: selfPos.z + dz * PACK_RETREAT_FLEE_WU };
}

function updateSwarmPack(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'ingress' && distance <= SWARM_INGRESS_RANGE_WU) enter(record, 'engine_flare', tick, 'engine_flare');
  else if (record.phase === 'engine_flare' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    record.closestDistance = distance;
    enter(record, 'strike', tick, null);
  } else if (record.phase === 'strike') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= SWARM_STRIKE_MIN_TICKS && passed) || age >= SWARM_STRIKE_MAX_TICKS) {
      beginEgress(record, 'extend', tick, self, target, 'swarm_pass_complete');
    }
  } else if (record.phase === 'extend' && age >= SWARM_EXTEND_TICKS &&
    (distance >= 320 || age >= SWARM_EXTEND_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= SWARM_REFORM_TICKS) {
    advanceCycle(record, tick, 'ingress');
  }
}

/**
 * The mine-layer identity: flank to the wake band, telegraph the salted wake (cue `wake_mines`,
 * the same cue the minefield_wake encounter telegraphs), fly the drop line while the tacticalAI
 * verb port seeds mines behind the hull, then disengage and reform. Harassment, not commitment.
 */
function updateMineLayer(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'flank' && distance <= MINE_FLANK_RANGE_WU) enter(record, 'wake_cue', tick, 'wake_mines');
  else if (record.phase === 'wake_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'mine_drop', tick, null);
  else if (record.phase === 'mine_drop' && age >= MINE_DROP_TICKS) {
    beginEgress(record, 'disengage', tick, self, target, 'wake_seeded');
  } else if (record.phase === 'disengage' && age >= MINE_DISENGAGE_TICKS &&
    (distance >= 520 || age >= MINE_DISENGAGE_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= MINE_REFORM_TICKS) {
    advanceCycle(record, tick, 'flank');
  }
}

/**
 * The shield-breaker identity: a committed closer that spears the shield layer (its burst carries
 * the ion channel + status_ionized) and peels BEFORE the grind — the counterplay is capacitor
 * discipline and catching the peel, not out-DPS-ing a committed brawler.
 */
function updateShieldBreaker(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'close' && distance <= SHIELD_CLOSE_RANGE_WU) enter(record, 'lance_cue', tick, 'shield_lance');
  else if (record.phase === 'lance_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) {
    record.closestDistance = distance;
    enter(record, 'lance', tick, null);
  } else if (record.phase === 'lance') {
    record.closestDistance = Math.min(record.closestDistance, distance);
    const passed = runHasPassed(record, self, target, distance);
    if ((age >= SHIELD_LANCE_TICKS && passed) || age >= SHIELD_LANCE_TICKS * 2) {
      beginEgress(record, 'peel', tick, self, target, 'shield_lanced');
    }
  } else if (record.phase === 'peel' && age >= SHIELD_PEEL_TICKS &&
    (distance >= 380 || age >= SHIELD_PEEL_MAX_TICKS)) {
    beginReform(record, tick);
  } else if (record.phase === 'reform' && age >= SHIELD_REFORM_TICKS) {
    advanceCycle(record, tick, 'close');
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
    bossStage: 0,
    side: sideFor(seed, entityId, doctrineId, 0, targetId),
    telegraph: null,
    telegraphStartedTick: null,
    fireWindow: false,
    outcome: null,
    closestDistance: Infinity,
    flightPoint: null,
    ramAuthorized: false,
    preferredRange: null,
    aimCommitBearing: null,
    // SF-056: the wounded fallback is armed until a subsystem wound spends it; it re-arms only
    // when the wounded subsystem is repaired past the exit band.
    fallbackArmed: true,
    // SF-048: the escort's sticky custody bind (carrier contact id), revalidated every update.
    custodyTargetId: null,
    _cachePosX: null,
    _cachePosZ: null,
    _cacheRot: null,
    _cachePhase: null,
    _cachedAttackLine: null,
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
    || phase === 'press'
    || phase === 'anchor_hold' || phase === 'broadside_fire'
    || phase === 'screen_hold' || phase === 'shield_dart'
    || phase === 'lance' || phase === 'mine_drop';
  // A committed firing corridor survives the charge_cue -> fire_window boundary (it IS the
  // corridor), but every other phase change drops it — retreat/reset must never hold a stale
  // forecast line.
  if (phase !== 'charge_cue' && phase !== 'fire_window') record.aimCommitBearing = null;
}

function advanceCycle(record, tick, phase) {
  record.cycle++;
  record.actionTargetId = record.targetId;
  record.closestDistance = Infinity;
  record.flightPoint = null;
  record.side = sideFor(record.seed, record.entityId, record.doctrineId, record.cycle, record.targetId);
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

function snapshot(record, target, directive, factionBehavior = null, self = null) {
  const phase = record.phase;
  const doctrineId = record.doctrineId;
  // A CONTROL dispatch (security_response) or an ambush's marked prey is an authoritative
  // singleton assignment: the member must close on its named offender, not hold the squad's
  // formation anchor. Without this release, an ingress-locked member's breakFormation=false
  // triggers the maneuver planner's mustRejoin, steering it back to the jurisdiction slot —
  // responders park in a deterrence ring hundreds of WU short of the fire gate while the
  // offender fires untouched.
  const assignedTargetBreak = !!(directive && directive.formation
    && (directive.formation.breakReason === 'security_response_target'
      || directive.formation.breakReason === 'ambush_snare_prey'
      || directive.formation.breakReason === 'wanted_warrant_target'
      || directive.formation.breakReason === 'heist_pressure_target'));
  // A committed firing corridor owns the nose as well as the guns: while the cue/window holds a
  // corridor bearing, facing rides it instead of tracking the live contact, so a lateral dodge
  // leaves both the hull line and the volley stale.
  const aimCommitted = (phase === 'charge_cue' || phase === 'fire_window')
    && Number.isFinite(record.aimCommitBearing);
  const faceAngle = aimCommitted ? record.aimCommitBearing : null;
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
      // A CONTROL dispatch has no squad slot to rejoin: its reform beat is a re-commit on the
      // named offender. Formation-steering it home between passes is the measured stand-off —
      // pursuers sat 645-724 WU out cycling reform while the offender sat untouched.
      if (assignedTargetBreak) {
        maneuverKind = ManeuverKind.INTERCEPT;
      } else {
        maneuverKind = ManeuverKind.FORMATION;
        maneuverTargetId = null;
      }
    } else maneuverKind = ManeuverKind.INTERCEPT;
    // C1 engagement scale: egress holds inside the camera envelope, not off-screen.
    preferredRange = phase === 'extend' || phase === 'breakaway' ? 240
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
      preferredRange = 320;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
      preferredRange = 320;
    } else if (phase === 'anchor_hold' || phase === 'field_spool') {
      maneuverKind = ManeuverKind.HOLD;
      preferredRange = 220;   // C1 engagement scale: controller hold stays inside the frame
    } else {
      maneuverKind = ManeuverKind.INTERCEPT;
      preferredRange = 340;
    }
    if (phase === 'anchor_hold') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.PACK_PURSUIT) {
    formationLocked = false;
    lateralSign = record.side;
    if (phase === 'retreat') {
      // SF-056: the wounded fallback flies record.flightPoint (ally hull or hazard shadow) as a
      // real retreat leg — guns off, nose off the target.
      maneuverKind = ManeuverKind.RETREAT;
      maneuverTargetId = null;
      faceTarget = false;
    } else {
      faceTarget = true;
      maneuverKind = phase === 'press' ? ManeuverKind.ORBIT : ManeuverKind.INTERCEPT;
    }
    preferredRange = PACK_ORBIT_RANGE_WU;
    if (phase === 'press') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.SWARM_PACK) {
    formationLocked = phase === 'ingress' || phase === 'reform';
    lateralSign = phase === 'ingress' || phase === 'reform' ? 0 : record.side;
    faceTarget = phase === 'engine_flare' || phase === 'strike';
    if (phase === 'extend') {
      maneuverKind = ManeuverKind.INTERCEPT;
      maneuverTargetId = null;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
    } else if (phase === 'strike') {
      // The pass itself is a committed close orbit, not a straight intercept: the nose stays on
      // the target while the hull crosses, so the burst lands inside the tight pack band.
      maneuverKind = ManeuverKind.ORBIT;
      faceTarget = true;
      allowedActionId = 'action_burst';
    } else maneuverKind = ManeuverKind.INTERCEPT;
    preferredRange = phase === 'extend' ? 240 : 120;   // swarm lives inside the composed frame
  } else if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) {
    formationLocked = phase === 'reform';
    if (phase === 'disengage') {
      maneuverKind = ManeuverKind.RETREAT;
      maneuverTargetId = null;
      preferredRange = 320;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
      preferredRange = 320;
    } else if (phase === 'wake_cue') {
      maneuverKind = ManeuverKind.HOLD;
      faceTarget = true;
      preferredRange = 300;
    } else if (phase === 'mine_drop') {
      // The drop line: keep the nose off the target so the hull flies its wake PAST the player.
      // NPC bombs release through bombs.drop (npcBombMirror + action_drop_bomb); commandDetonate
      // commits the fuze after arming. INF-030 / PQ-205.02.
      maneuverKind = ManeuverKind.INTERCEPT;
      faceTarget = false;
      preferredRange = 340;
      allowedActionId = 'action_drop_bomb';
    } else {
      maneuverKind = ManeuverKind.INTERCEPT;
      preferredRange = 300;
    }
  } else if (doctrineId === CombatDoctrineId.SHIELD_BREAKER) {
    formationLocked = phase === 'reform';
    if (phase === 'close') {
      maneuverKind = ManeuverKind.INTERCEPT;
      preferredRange = 220;
    } else if (phase === 'lance_cue') {
      maneuverKind = ManeuverKind.INTERCEPT;
      faceTarget = true;
      preferredRange = 200;
    } else if (phase === 'lance') {
      maneuverKind = ManeuverKind.ORBIT;
      faceTarget = true;
      preferredRange = 180;
      allowedActionId = 'action_burst';
    } else if (phase === 'peel') {
      maneuverKind = ManeuverKind.INTERCEPT;
      maneuverTargetId = null;
      preferredRange = 300;
    } else {
      maneuverKind = ManeuverKind.FORMATION;
      maneuverTargetId = null;
      preferredRange = 300;
    }
  } else if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_ALA) {
    maneuverKind = ManeuverKind.ORBIT;
    // B3b: the broadside ring fits inside the composed frame, tightened act by act — the boss
    // stage table owns the number, the composed-frame floor owns the minimum.
    const bossStage = capitalStageFor(record, self);
    preferredRange = Math.max(180, bossStage.preferredRange);
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
      preferredRange = 320;
    } else {
      maneuverKind = phase === 'screen_approach' ? ManeuverKind.INTERCEPT : ManeuverKind.HOLD;
      preferredRange = 120;
    }
    if (phase === 'screen_hold' || phase === 'shield_dart') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.DETONATOR_RUN) {
    // The run is a body problem, not a gun problem: the nose stays on the target through the lit
    // fuse and the committed phase just closes distance. allowedActionId never gets set —
    // detonation is a physics fact owned by impulseCharges, not a fire intent.
    formationLocked = phase === 'ingress' || phase === 'reform';
    lateralSign = phase === 'ingress' || phase === 'reform' ? 0 : record.side;
    faceTarget = phase === 'fuse_cue' || phase === 'commit';
    if (phase === 'breakaway') {
      maneuverKind = ManeuverKind.INTERCEPT;
      maneuverTargetId = null;
    } else if (phase === 'reform') {
      // No squad slot to rejoin when the dispatch owns the target (survival cohorts, ambushes):
      // reform is a re-commit on the named hull, same rule the interceptor learned.
      if (assignedTargetBreak) {
        maneuverKind = ManeuverKind.INTERCEPT;
      } else {
        maneuverKind = ManeuverKind.FORMATION;
        maneuverTargetId = null;
      }
    } else {
      maneuverKind = ManeuverKind.INTERCEPT;
    }
    preferredRange = phase === 'commit' ? 24
      : phase === 'fuse_cue' ? 80
        : phase === 'breakaway' ? 240
          : phase === 'reform' ? 300
            : 170;
  } else {
    maneuverKind = phase === 'retreat' ? ManeuverKind.RETREAT
      : (phase === 'outer_standoff' || phase === 'reset' ? ManeuverKind.ORBIT : ManeuverKind.HOLD);
    preferredRange = 240;   // B3b: default standoff orbits inside the composed frame
    // The standoff orbit is translational: fixed-gun ships keep their nose on the target while
    // sliding around the engagement ring, so even high-inertia hulls are aligned before the cue.
    // Once the corridor commits the nose rides that bearing instead — a dodge during the wind-up
    // must leave the line stale, not pull it back onto the contact.
    faceTarget = phase !== 'retreat' && !aimCommitted;
    if (phase === 'fire_window') allowedActionId = 'action_burst';
  }
  // Every phase egressPhaseFor can return: a doctrine parked on a disabled-target or pressure-break
  // egress must keep its egress range instead of falling back to the faction standoff band.
  const isEgress = phase === 'extend' || phase === 'breakaway' || phase === 'escape' || phase === 'recover'
    || phase === 'retreat' || phase === 'disengage' || phase === 'peel'
    || phase === 'regroup' || phase === 'broadside_shift';
  if (factionBehavior && !isEgress && !IDENTITY_OWNED_RANGE_DOCTRINES.has(doctrineId)) {
    preferredRange = factionBehavior.preferredRange;
  }
  if (assignedTargetBreak) formationLocked = false;
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
    faceAngle,
    aimCommit: aimCommitted
      ? Object.freeze({ bearing: record.aimCommitBearing, capRad: SNIPER_AIM_CORRECTION_RAD })
      : null,
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
    fallbackSpent: record.fallbackArmed === false,
    fallbackRearmed: record.fallbackRearmed === true,
    contestKind: doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER && phase === 'control'
      ? 'tether-control-contest'
      : null,
    directiveTargetId: directive && directive.objective && directive.objective.targetId,
    attackLine: (record.preferredRange = preferredRange, attackLineFor(record, self)),
  });
}

/**
 * Computes the readable attack line / forward threat corridor for an interceptor or attacker.
 * Active during attack cue (engine_flare/charge_cue) and firing pass (strike/commit/fire_window).
 */
export function attackLineFor(record, self) {
  if (!self || !self.pos) return null;
  const phase = record && record.phase;
  const active = phase === 'strike' || phase === 'engine_flare'
    || phase === 'commit' || phase === 'fire_window' || phase === 'charge_cue';
  if (!active) return null;

  const px = finite(self.pos.x);
  const pz = finite(self.pos.z);
  const rot = Number.isFinite(self.rot) ? self.rot : 0;

  if (record && record._cachedAttackLine &&
      record._cachePosX === px &&
      record._cachePosZ === pz &&
      record._cacheRot === rot &&
      record._cachePhase === phase) {
    return record._cachedAttackLine;
  }

  const range = Number.isFinite(record && record.preferredRange) ? Math.max(480, record.preferredRange * 2.5) : 480;
  const halfWidth = Math.max(32, (self.radius || 14) + 18);
  const line = Object.freeze({
    origin: Object.freeze({ x: px, z: pz }),
    heading: rot,
    dir: Object.freeze({ x: Math.cos(rot), z: Math.sin(rot) }),
    range,
    halfWidth,
  });

  if (record && !Object.isFrozen(record)) {
    record._cachePosX = px;
    record._cachePosZ = pz;
    record._cacheRot = rot;
    record._cachePhase = phase;
    record._cachedAttackLine = line;
  }

  return line;
}

/**
 * Evaluates whether a point in space (e.g. the player's position) lies within the attack line threat corridor.
 */
export function isPointOnAttackLine(attackLine, point) {
  if (!attackLine || !attackLine.origin || !attackLine.dir || !point) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const dx = point.x - attackLine.origin.x;
  const dz = point.z - attackLine.origin.z;
  const along = dx * attackLine.dir.x + dz * attackLine.dir.z;
  if (along < 0 || along > attackLine.range) return false;
  const cross = Math.abs(dx * (-attackLine.dir.z) + dz * attackLine.dir.x);
  return cross <= attackLine.halfWidth;
}

function targetScore(doctrineId, contact, ward = null) {
  const threat = finite(contact.threat, 0);
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    return threat * 5 + bandScore(contact.mobilityBand, ['low', 'medium', 'high']) * 2;
  }
  if (doctrineId === CombatDoctrineId.PACK_PURSUIT || doctrineId === CombatDoctrineId.SWARM_PACK) {
    // The pack votes for the closest soft thing: mobility over mass, so passes converge on one
    // hull instead of scattering across the formation.
    return threat * 5 + bandScore(contact.mobilityBand, ['high', 'medium', 'low']) * 3;
  }
  if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) {
    // The wake is the weapon: fast, valuable, predictable traffic outranks clean kills. Slow
    // heavies turn inside the seeded lane anyway.
    return threat * 2 + bandScore(contact.cargoBand, ['empty', 'light', 'valuable', 'rich']) * 3
      + bandScore(contact.mobilityBand, ['high', 'medium', 'low']) * 2;
  }
  if (doctrineId === CombatDoctrineId.SHIELD_BREAKER) {
    // Spear the biggest shield wallet first — the lance is worth most against a full capacitor.
    return threat * 4 + bandScore(contact.operationalMassBand, ['light', 'medium', 'heavy', 'capital']) * 2;
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
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_ALA) return 'broadside_approach';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'screen_approach';
  if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) return 'flank';
  if (doctrineId === CombatDoctrineId.SHIELD_BREAKER) return 'close';
  return 'ingress';
}

function flightProfileFor(doctrineId, self) {
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) return 'brawler_commit';
  if (doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_TOLLMAN
    || doctrineId === CombatDoctrineId.CAPITAL_BROADSIDE_ALA) return 'capital_broadside';
  if (doctrineId === CombatDoctrineId.ESCORT_SCREEN) return 'escort_screen';
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY &&
    (self && (self.operationalMassBand === 'heavy' || self.operationalMassBand === 'capital'))) {
    return 'brawler_commit';
  }
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) return 'flyby';
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) return 'tether_raider';
  if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) return 'field_anchor';
  // The identity doctrines reuse published flight profiles: their motion vocabulary (a close
  // pass, a standoff wake line, a hit-and-run pass) is already expressed by the planner through
  // maneuverKind + preferredRange, and downstream consumers only know these profile strings.
  if (doctrineId === CombatDoctrineId.PACK_PURSUIT) return 'pack_pursuit';
  if (doctrineId === CombatDoctrineId.SWARM_PACK || doctrineId === CombatDoctrineId.SHIELD_BREAKER) return 'flyby';
  if (doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) return 'ranged_standoff';
  if (doctrineId === CombatDoctrineId.DETONATOR_RUN) return 'detonator_run';
  return 'ranged_standoff';
}

// A CONTROL dispatch names its offender twice: doctrine.js stamps the squad directive's formation
// with breakReason 'security_response_target', and the member's own activity is an attack_run
// whose reason is 'security_response:<incident>'. Either is enough; the activity survives an
// Enemy Mind formation rewrite that replaces the break reason.
function securityDispatched(directive, self) {
  const formation = directive && directive.formation;
  if (formation && (formation.breakReason === 'security_response_target' || formation.breakReason === 'wanted_warrant_target')) return true;
  const activity = self && self.activity;
  return !!(activity && activity.kind === 'attack_run' && activity.targetId != null
    && (String(activity.reason || '').startsWith('security_response:') || String(activity.reason || '').startsWith('wanted_warrant:')));
}

function interceptorTargetStationary(target) {
  const vel = target && target.vel;
  if (!vel || !Number.isFinite(vel.x) || !Number.isFinite(vel.z)) return false;
  return Math.hypot(vel.x, vel.z) <= INTERCEPTOR_STATIONARY_TARGET_SPEED;
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

/**
 * The firing corridor a ranged disengager commits to at cue entry: the world bearing of where the
 * target will be when a bolt arrives. The forecast uses the shooter's fastest aim-following bolt
 * speed when the sensor frame carries it (aimProjectileSpeed, plumbed by aiPorts' sensorSelf), so
 * the telegraphed line and the released volley agree within the correction band; without the hint
 * the corridor falls back to a conservative nominal. Computed once — the corridor is never
 * re-solved, which is what makes the shot baitable.
 */
function corridorBearing(self, target) {
  if (!self || !self.pos || !target || !target.pos) return null;
  const dx = finite(target.pos.x) - finite(self.pos.x);
  const dz = finite(target.pos.z) - finite(self.pos.z);
  const projSpeed = finite(self.aimProjectileSpeed) > 0
    ? self.aimProjectileSpeed
    : SNIPER_CORRIDOR_NOMINAL_SPEED;
  const tof = Math.hypot(dx, dz) / projSpeed;
  return Math.atan2(
    dz + finite(target.vel && target.vel.z) * tof,
    dx + finite(target.vel && target.vel.x) * tof,
  );
}

/**
 * The world point a brawler commits its mass to: the target's forecast position at arrival,
 * pushed past it along the approach line. Driving at a fixed point — not the live contact — is
 * what turns the hull into a committed moving obstacle instead of a sticky orbit.
 */
function committedChargePoint(self, target, distance) {
  const sx = finite(self && self.pos && self.pos.x);
  const sz = finite(self && self.pos && self.pos.z);
  const dx = finite(target && target.pos && target.pos.x) - sx;
  const dz = finite(target && target.pos && target.pos.z) - sz;
  const tof = Math.min(2, Math.max(0.2, distance / BRAWLER_CHARGE_LEAD_SPEED));
  const fx = sx + dx + finite(target && target.vel && target.vel.x) * tof;
  const fz = sz + dz + finite(target && target.vel && target.vel.z) * tof;
  const ex = fx - sx;
  const ez = fz - sz;
  const len = Math.hypot(ex, ez) || 1;
  return Object.freeze({
    x: fx + (ex / len) * BRAWLER_CHARGE_OVERSHOOT_WU,
    z: fz + (ez / len) * BRAWLER_CHARGE_OVERSHOOT_WU,
  });
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

/** Positive when the target itself moves toward self — the press a disengager flees. */
function targetPressSpeed(self, target) {
  if (!self || !self.pos || !target || !target.pos) return 0;
  const dx = finite(target.pos.x) - finite(self.pos.x);
  const dz = finite(target.pos.z) - finite(self.pos.z);
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return 0;
  const tvx = finite(target.vel && target.vel.x);
  const tvz = finite(target.vel && target.vel.z);
  return -(tvx * dx + tvz * dz) / length;
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
    // SF-048: the escort's sticky custody bind, for inspection surfaces.
    custodyTargetId: record.custodyTargetId,
  });
}

function compareIds(a, b) {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return stableId(a).localeCompare(stableId(b));
}
