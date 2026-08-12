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
const RUN_EGRESS_DISTANCE = 960;
// A contact already on the end of a line is anchored, slowed, and predictable. That reads as a free
// kill, so it should DRAW the swarm rather than repel it. See targetScore() for why this replaced a
// flat -100 veto and how the magnitude is derived.
const TETHERED_PREY_BONUS = 8;

export function normalizeCombatDoctrineId(value, fallback = null) {
  const id = String(value || '');
  if (IDS.has(id)) return id;
  return fallback && IDS.has(String(fallback)) ? String(fallback) : null;
}

export function selectDoctrineTarget(doctrineValue, perception) {
  const doctrineId = normalizeCombatDoctrineId(doctrineValue);
  if (!doctrineId || !perception || !Array.isArray(perception.contacts)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const contact of perception.contacts) {
    if (!contact || contact.kind !== ContactKind.SHIP || contact.hostile !== true) continue;
    if (contact.alive !== true || contact.valid !== true || contact.visible !== true) continue;
    if (finite(contact.confidence, 0) < 0.55) continue;
    const score = targetScore(doctrineId, contact);
    if (score > bestScore || (score === bestScore && stableId(contact.id) < stableId(best && best.id))) {
      best = contact;
      bestScore = score;
    }
  }
  return best;
}

export class CombatDoctrineRuntime {
  constructor({ seed = 1 } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.byEntity = new Map();
  }

  update({ tick, entityId, doctrineId: doctrineValue, perception, directive = null } = {}) {
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
    if (factionBehavior && (factionBehavior.disableThenRun || factionBehavior.destroyTarget === false)
      && target.disabled === true) {
      const egressPhase = (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY
        || doctrineId === CombatDoctrineId.BRAWLER_COMMIT) ? 'breakaway'
        : doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER ? 'escape'
          : doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER ? 'recover'
          : 'retreat';
      if (record.phase !== egressPhase) beginEgress(record, egressPhase, tick, self, target, 'target_disabled');
      return snapshot(record, target, directive, factionBehavior);
    }
    if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
      updateBrawler(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
      updateInterceptor(record, tick, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
      updateTetherRaider(record, tick, entityId, perception, self, target, distance);
    } else if (doctrineId === CombatDoctrineId.FIELD_ANCHOR_CONTROLLER) {
      updateFieldAnchor(record, tick, self, target, distance);
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
    kind = doctrine.phase === 'recover' ? ObjectiveKind.ENGAGE : ObjectiveKind.SCREEN;
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
    // Sticky knife-fight: stay on the target for the full commit window. Do NOT exit on
    // flyby "passed" geometry — that is what made bruisers read as longer interceptors.
    record.closestDistance = Math.min(record.closestDistance, distance);
    record.ramAuthorized = true;
    if (age >= BRAWLER_COMMIT_MAX_TICKS) {
      beginEgress(record, 'breakaway', tick, self, target, 'brawler_commit_complete');
    } else if (age >= BRAWLER_COMMIT_MIN_TICKS && distance > 520) {
      // Only break early if the fight opened up badly (target escaped far).
      beginEgress(record, 'breakaway', tick, self, target, 'brawler_target_escaped');
    }
  } else if (record.phase === 'breakaway' && age >= BRAWLER_BREAKAWAY_TICKS && distance >= 480) {
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
  record.fireWindow = phase === 'strike' || phase === 'commit' || phase === 'fire_window' || phase === 'anchor_hold';
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
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY
    || doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
    const brawler = doctrineId === CombatDoctrineId.BRAWLER_COMMIT
      || record.flightProfile === 'brawler_commit';
    formationLocked = phase === 'ingress' || phase === 'reform';
    lateralSign = phase === 'ingress' || phase === 'reform' ? 0 : record.side;
    if (brawler && phase === 'commit') {
      // Sticky knife-fight: orbit at knife range, face target, burst authorized.
      maneuverKind = ManeuverKind.ORBIT;
      preferredRange = 140;
      faceTarget = true;
      allowedActionId = 'action_burst';
    } else if (phase === 'extend' || phase === 'breakaway') {
      maneuverKind = ManeuverKind.INTERCEPT;
      maneuverTargetId = null;
      preferredRange = brawler ? 520 : 620;
    } else if (phase === 'reform') {
      maneuverKind = ManeuverKind.HOLD;
      maneuverTargetId = null;
      preferredRange = brawler ? 280 : 180;
    } else {
      maneuverKind = ManeuverKind.INTERCEPT;
      preferredRange = brawler ? 180 : 150;
      faceTarget = brawler && phase === 'engine_flare';
      if (phase === 'strike' || phase === 'commit') allowedActionId = 'action_burst';
    }
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

function targetScore(doctrineId, contact) {
  const threat = finite(contact.threat, 0);
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) {
    // Prefer the nearest hot fight: low-mobility prey and high threat over kiting targets.
    return threat * 6 + (3 - bandScore(contact.mobilityBand, ['low', 'medium', 'high'])) * 3
      + bandScore(contact.operationalMassBand, ['light', 'medium', 'heavy', 'capital']);
  }
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    return threat * 5 + bandScore(contact.mobilityBand, ['low', 'medium', 'high']) * 2;
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
  return 'ingress';
}

function flightProfileFor(doctrineId, self) {
  if (doctrineId === CombatDoctrineId.BRAWLER_COMMIT) return 'brawler_commit';
  // Legacy mass-band bridge: heavy interceptors still get the commit profile without a data retag.
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
