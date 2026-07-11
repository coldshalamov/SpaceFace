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

export const CombatDoctrineId = Object.freeze({
  INTERCEPTOR_FLYBY: 'interceptor_flyby',
  TETHER_CONTROL_RAIDER: 'tether_control_raider',
  RANGED_DISENGAGER: 'ranged_disengager',
});

export const DOCTRINE_TELEGRAPH_TICKS = 30;

const IDS = new Set(Object.values(CombatDoctrineId));
const INTERCEPTOR_STRIKE_TICKS = 18;
const INTERCEPTOR_EXTEND_TICKS = 45;
const TETHER_ATTACH_TICKS = 15;
const TETHER_CONTROL_TICKS = 90;
const TETHER_REPOSITION_TICKS = 30;
const RANGED_FIRE_TICKS = 18;
const RANGED_RESET_TICKS = 18;

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
    if (!record || record.doctrineId !== doctrineId || record.targetId !== (target && target.id)) {
      record = makeRecord(this.seed, tick, entityId, doctrineId, target && target.id);
      this.byEntity.set(entityId, record);
    }
    record.lastTick = tick;
    record.outcome = null;
    record.telegraphStartedTick = null;

    if (!target) {
      enter(record, initialPhase(doctrineId), tick, null);
      return snapshot(record, null, directive);
    }

    const self = perception && perception.self || null;
    const distance = self && self.pos ? distance2(self.pos, target.pos) : Infinity;
    if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
      updateInterceptor(record, tick, distance);
    } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
      updateTetherRaider(record, tick, entityId, perception, target, distance);
    } else {
      updateRanged(record, tick, self, target, distance);
    }
    return snapshot(record, target, directive);
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
    kind = doctrine.phase === 'reposition' || doctrine.phase === 'flank' ? ObjectiveKind.ENGAGE : ObjectiveKind.TUG;
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
      targetId: doctrine.targetId,
      preferredRange: doctrine.preferredRange,
      lateralSign: doctrine.side < 0 ? -1 : 1,
      breakFormation: true,
      reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}`,
    },
  };
}

function updateInterceptor(record, tick, distance) {
  const age = tick - record.phaseStartedTick;
  if (record.phase === 'ingress' && distance <= 240) enter(record, 'engine_flare', tick, 'engine_flare');
  else if (record.phase === 'engine_flare' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'strike', tick, null);
  else if (record.phase === 'strike' && age >= INTERCEPTOR_STRIKE_TICKS) enter(record, 'extend', tick, null);
  else if (record.phase === 'extend' && age >= INTERCEPTOR_EXTEND_TICKS) advanceCycle(record, tick, 'ingress');
}

function updateTetherRaider(record, tick, entityId, perception, target, distance) {
  const age = tick - record.phaseStartedTick;
  const tether = ownedTether(perception, entityId, target.id);
  if (record.phase === 'flank' && distance <= 140) enter(record, 'spool_cue', tick, 'attach_spool');
  else if (record.phase === 'spool_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'attach_window', tick, null);
  else if (record.phase === 'attach_window' && tether) enter(record, 'control', tick, null);
  else if (record.phase === 'attach_window' && target.tethered) failTether(record, tick, 'target_contested');
  else if (record.phase === 'attach_window' && age >= TETHER_ATTACH_TICKS) failTether(record, tick, 'attach_failed');
  else if (record.phase === 'control' && !tether) failTether(record, tick, 'line_lost');
  else if (record.phase === 'control' && hasTag(tether, 'slack')) failTether(record, tick, 'slack_line');
  else if (record.phase === 'control' && vectorReversed(perception, target)) failTether(record, tick, 'vector_reversal');
  else if (record.phase === 'control' && age >= TETHER_CONTROL_TICKS) failTether(record, tick, 'control_complete');
  else if (record.phase === 'reposition' && age >= TETHER_REPOSITION_TICKS) advanceCycle(record, tick, 'flank');
  record.actionTargetId = tether ? (tether.attachmentId || tether.id) : target.id;
}

function updateRanged(record, tick, self, target, distance) {
  const age = tick - record.phaseStartedTick;
  const closing = closingSpeed(self, target);
  if (distance < 240 || closing > 55) {
    if (record.phase !== 'retreat') {
      record.outcome = 'closing_interrupt';
      enter(record, 'retreat', tick, null);
    }
    return;
  }
  if (record.phase === 'retreat') {
    if (distance >= 360 && closing < 20) enter(record, 'outer_standoff', tick, null);
    return;
  }
  if (record.phase === 'outer_standoff' && distance >= 300 && distance <= 1100) enter(record, 'charge_cue', tick, 'weapon_charge');
  else if (record.phase === 'charge_cue' && age >= DOCTRINE_TELEGRAPH_TICKS) enter(record, 'fire_window', tick, null);
  else if (record.phase === 'fire_window' && age >= RANGED_FIRE_TICKS) enter(record, 'reset', tick, null);
  else if (record.phase === 'reset' && age >= RANGED_RESET_TICKS) enter(record, 'charge_cue', tick, 'weapon_charge');
}

function makeRecord(seed, tick, entityId, doctrineId, targetId) {
  const record = {
    doctrineId,
    phase: initialPhase(doctrineId),
    phaseStartedTick: tick,
    targetId: targetId == null ? null : targetId,
    actionTargetId: targetId == null ? null : targetId,
    cycle: 0,
    side: sideFor(seed, entityId, doctrineId, 0, targetId),
    telegraph: null,
    telegraphStartedTick: null,
    fireWindow: false,
    outcome: null,
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
  record.telegraph = telegraphKind
    ? Object.freeze({ kind: telegraphKind, durationTicks: DOCTRINE_TELEGRAPH_TICKS, startedTick: tick })
    : null;
  record.telegraphStartedTick = telegraphKind ? tick : null;
  record.fireWindow = phase === 'strike' || phase === 'fire_window';
}

function advanceCycle(record, tick, phase) {
  record.cycle++;
  record.side = sideFor(record.seed, record.entityId, record.doctrineId, record.cycle, record.targetId);
  record.actionTargetId = record.targetId;
  enter(record, phase, tick, null);
}

function failTether(record, tick, outcome) {
  record.outcome = outcome;
  enter(record, 'reposition', tick, null);
}

function snapshot(record, target, directive) {
  const phase = record.phase;
  const doctrineId = record.doctrineId;
  let maneuverKind = ManeuverKind.INTERCEPT;
  let preferredRange = 180;
  let allowedActionId = null;
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    maneuverKind = phase === 'extend' ? ManeuverKind.RETREAT : ManeuverKind.INTERCEPT;
    preferredRange = phase === 'extend' ? 520 : 150;
    if (phase === 'strike') allowedActionId = 'action_burst';
  } else if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
    maneuverKind = phase === 'reposition' ? ManeuverKind.RETREAT
      : (phase === 'flank' ? ManeuverKind.ORBIT : ManeuverKind.APPROACH_SOCKET);
    preferredRange = phase === 'flank' ? 190 : 90;
    if (phase === 'attach_window') allowedActionId = 'action_attach';
    if (phase === 'control') allowedActionId = 'action_reel';
  } else {
    maneuverKind = phase === 'retreat' ? ManeuverKind.RETREAT
      : (phase === 'outer_standoff' || phase === 'reset' ? ManeuverKind.ORBIT : ManeuverKind.HOLD);
    preferredRange = 620;
    if (phase === 'fire_window') allowedActionId = 'action_burst';
  }
  return Object.freeze({
    doctrineId,
    phase,
    phaseStartedTick: record.phaseStartedTick,
    targetId: target ? target.id : record.targetId,
    actionTargetId: record.actionTargetId,
    cycle: record.cycle,
    side: record.side,
    telegraph: record.telegraph,
    telegraphStarted: record.telegraphStartedTick === record.lastTick,
    fireWindow: !!record.fireWindow,
    maneuverKind,
    preferredRange,
    allowedActionId,
    outcome: record.outcome,
    directiveTargetId: directive && directive.objective && directive.objective.targetId,
  });
}

function targetScore(doctrineId, contact) {
  const threat = finite(contact.threat, 0);
  if (doctrineId === CombatDoctrineId.INTERCEPTOR_FLYBY) {
    return threat * 5 + bandScore(contact.mobilityBand, ['low', 'medium', 'high']) * 2;
  }
  if (doctrineId === CombatDoctrineId.TETHER_CONTROL_RAIDER) {
    if (contact.tethered) return -100;
    return threat + bandScore(contact.operationalMassBand, ['light', 'medium', 'heavy', 'capital']) * 2 +
      bandScore(contact.cargoBand, ['empty', 'light', 'valuable', 'rich']) * 2 +
      bandScore(contact.tetherabilityBand, ['poor', 'fair', 'good', 'excellent']) * 2;
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
  return 'ingress';
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
