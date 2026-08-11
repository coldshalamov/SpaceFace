import {
  ManeuverKind,
  ObjectiveKind,
  distance2,
  finite,
  finiteInt,
} from './contracts.js';

export const ActivityKind = Object.freeze({
  LOITER: 'loiter',
  PATROL_ROUTE: 'patrol_route',
  TRANSIT: 'transit',
  SCAN_APPROACH: 'scan_approach',
  HAIL_HOLD: 'hail_hold',
  ATTACK_RUN: 'attack_run',
  REPOSITION: 'reposition',
  SCREEN: 'screen',
  DISENGAGE: 'disengage',
  RETURN_TO_ANCHOR: 'return_to_anchor',
  FLEE: 'flee',
});

export const RulesOfEngagement = Object.freeze({
  HOLD_FIRE: 'hold_fire',
  DEFENSIVE: 'defensive',
  LAWFUL_WANTED_ONLY: 'lawful_wanted_only',
  WEAPONS_FREE: 'weapons_free',
});

const ACTIVITY_VALUES = new Set(Object.values(ActivityKind));
const ROE_VALUES = new Set(Object.values(RulesOfEngagement));
const OFFENSIVE_ACTIVITY_VALUES = new Set([
  ActivityKind.ATTACK_RUN,
  ActivityKind.REPOSITION,
  ActivityKind.SCREEN,
  ActivityKind.SCAN_APPROACH,
  ActivityKind.PATROL_ROUTE,
]);
const DEFAULT_LEASH_RADIUS = 2600;

export function normalizeActivity(value, fallback = null) {
  const src = value && typeof value === 'object' ? value : fallback;
  if (!src || typeof src !== 'object') return null;
  const kind = ACTIVITY_VALUES.has(String(src.kind)) ? String(src.kind) : ActivityKind.LOITER;
  const activity = {
    kind,
    reason: String(src.reason || kind),
    anchor: normalizeVec(src.anchor),
    leashRadius: positive(src.leashRadius, DEFAULT_LEASH_RADIUS),
    preferredRange: positive(src.preferredRange, 0),
    startedTick: finiteInt(src.startedTick, 0),
    deadlineTick: Number.isInteger(src.deadlineTick) ? src.deadlineTick : null,
    targetId: src.targetId == null ? null : src.targetId,
    routeId: src.routeId == null ? null : String(src.routeId),
    encounterId: src.encounterId == null ? null : String(src.encounterId),
  };
  return Object.freeze(activity);
}

/**
 * Resolve the activity the live tactical stack must obey. Morale and outcome systems can order an
 * immediate flight before the authored encounter activity record is rewritten; that transient
 * survival order must win over a stale attack-run record at every decision and execution gate.
 */
export function effectiveActivityForAI(ai) {
  const activity = normalizeActivity(ai && ai.activity);
  const forcedFlee = !!(ai && (ai.forceFlee === true || ai.fsm === 'flee'));
  if (!forcedFlee) return activity;
  return normalizeActivity({
    ...(activity || {}),
    kind: ActivityKind.FLEE,
    reason: ai.forceFlee === true ? 'morale_force_flee' : 'fsm_flee',
    targetId: null,
  });
}

export function normalizeRoe(value, fallback = RulesOfEngagement.WEAPONS_FREE) {
  const text = String(value || fallback);
  return ROE_VALUES.has(text) ? text : fallback;
}

export function activityForEncounterSpawn(live, ship = {}, options = {}) {
  const passive = !!ship.passive || !!options.passive;
  const role = String(ship.role || 'squad');
  const shapeId = String(live && live.shapeId || ship.context || 'encounter');
  const phase = String(live && live.phase || (passive ? 'offer' : 'conflict'));
  const nowTick = Number.isInteger(options.tick) ? options.tick : Math.round(finite(options.now, 0) * 60);
  let kind = passive ? ActivityKind.LOITER : ActivityKind.ATTACK_RUN;
  let roe = passive ? RulesOfEngagement.HOLD_FIRE : RulesOfEngagement.WEAPONS_FREE;

  if (shapeId === 'pirate_toll') {
    kind = passive || phase === 'offer' ? ActivityKind.HAIL_HOLD : ActivityKind.ATTACK_RUN;
    roe = passive || phase === 'offer' ? RulesOfEngagement.HOLD_FIRE : RulesOfEngagement.WEAPONS_FREE;
  } else if (shapeId === 'patrol_scan') {
    kind = ActivityKind.SCAN_APPROACH;
    roe = RulesOfEngagement.LAWFUL_WANTED_ONLY;
  } else if (shapeId === 'patrol_beat') {
    kind = ActivityKind.PATROL_ROUTE;
    roe = RulesOfEngagement.LAWFUL_WANTED_ONLY;
  } else if (shapeId === 'convoy_departure' || shapeId === 'trader_run') {
    kind = role === 'escort' ? ActivityKind.SCREEN : ActivityKind.TRANSIT;
    roe = role === 'escort' ? RulesOfEngagement.DEFENSIVE : RulesOfEngagement.HOLD_FIRE;
  } else if (shapeId === 'bounty_hunter' || shapeId === 'named_hunter') {
    kind = passive ? ActivityKind.HAIL_HOLD : ActivityKind.ATTACK_RUN;
    roe = passive ? RulesOfEngagement.HOLD_FIRE : RulesOfEngagement.WEAPONS_FREE;
  } else if (shapeId === 'ambush_snare' || shapeId === 'claim_threat' || shapeId === 'distress_call') {
    kind = passive ? ActivityKind.LOITER : (role === 'escort' || role === 'threat' ? ActivityKind.SCREEN : ActivityKind.ATTACK_RUN);
    roe = passive ? RulesOfEngagement.HOLD_FIRE : RulesOfEngagement.WEAPONS_FREE;
  }

  return normalizeActivity({
    kind,
    reason: `${shapeId}:${phase}:${role}`,
    anchor: live && live.anchor ? live.anchor : ship.pos,
    leashRadius: positive(ship.leashRadius, positive(live && live.shape && live.shape.leashRadius, DEFAULT_LEASH_RADIUS)),
    preferredRange: positive(ship.preferredRange, positive(live && live.shape && live.shape.preferredRange, 0)),
    startedTick: nowTick,
    deadlineTick: Number.isFinite(live && live.deadlineAt) ? Math.round(live.deadlineAt * 60) : null,
    targetId: ship.targetId == null ? null : ship.targetId,
    routeId: ship.routeId || (live && live.zoneId) || null,
    encounterId: live && live.id,
  });
}

export function roeForEncounterSpawn(live, ship = {}, options = {}) {
  const activity = activityForEncounterSpawn(live, ship, options);
  return roeForActivity(activity, ship.roe || options.roe);
}

export function roeForActivity(activity, explicit = null) {
  if (explicit) return normalizeRoe(explicit);
  const kind = activity && activity.kind;
  if (kind === ActivityKind.HAIL_HOLD || kind === ActivityKind.LOITER || kind === ActivityKind.TRANSIT) return RulesOfEngagement.HOLD_FIRE;
  if (kind === ActivityKind.PATROL_ROUTE || kind === ActivityKind.SCAN_APPROACH) return RulesOfEngagement.LAWFUL_WANTED_ONLY;
  if (kind === ActivityKind.SCREEN) return RulesOfEngagement.DEFENSIVE;
  return RulesOfEngagement.WEAPONS_FREE;
}

export function setEntityDoctrine(entity, values = {}) {
  if (!entity) return null;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const activity = normalizeActivity(values.activity || values, ai.activity || null);
  if (activity) ai.activity = activity;
  ai.roe = normalizeRoe(values.roe, activity ? roeForActivity(activity) : ai.roe);
  return ai;
}

/** Player wing orders refine squad advice; retreat remains an absolute survival override. */
export function overrideDirectiveForWingOrder(directive, perception, freeze = Object.freeze) {
  if (!directive || !directive.objective) return directive;
  if (directive.objective.kind === ObjectiveKind.RETREAT) return directive;
  const activity = normalizeActivity(perception && perception.self && perception.self.activity);
  if (!activity || !String(activity.reason || '').startsWith('wing_order:')) return directive;
  const order = String(activity.reason).slice('wing_order:'.length);
  let kind = ObjectiveKind.REFORM;
  let targetId = null;
  if (order === 'attack') {
    kind = ObjectiveKind.FOCUS;
    targetId = activity.targetId;
  } else if (order === 'screen') {
    kind = ObjectiveKind.SCREEN;
  } else if (order === 'hold') {
    kind = ObjectiveKind.HOLD;
  }
  const anchor = activity.anchor;
  const formation = anchor ? freeze({
    ...directive.formation,
    slot: freeze({ x: anchor.x, z: anchor.z }),
    velocity: freeze({ x: 0, z: 0 }),
    bound: activity.leashRadius,
    breakFormation: false,
  }) : directive.formation;
  return freeze({
    ...directive,
    focusTargetId: kind === ObjectiveKind.FOCUS ? targetId : null,
    objective: freeze({ kind, targetId, reason: activity.reason }),
    formation,
  });
}

/** Restrict combat-doctrine target scoring to an explicit player Attack target. */
export function perceptionForWingOrderCombatDoctrine(perception, directive, freeze = Object.freeze) {
  if (!perception || !directive || !directive.objective) return perception;
  const activity = normalizeActivity(perception.self && perception.self.activity);
  const exactTargetId = directive.objective.targetId;
  if (!activity || activity.reason !== 'wing_order:attack' || exactTargetId == null) return perception;
  const contacts = Array.isArray(perception.contacts) ? perception.contacts : [];
  const filtered = contacts.filter((contact) => contact && (contact.kind !== 'ship' || contact.id === exactTargetId));
  return freeze({ ...perception, contacts: freeze(filtered) });
}

export function applyDoctrineToSelection({ selected, perception, directive, tick = 0, freeze = Object.freeze }) {
  if (!selected) return selected;
  const self = perception && perception.self;
  const activity = normalizeActivity(self && self.activity);
  const roe = normalizeRoe(self && self.roe);
  const def = selected.__spacefaceActionDef || null;
  const legalAction = actionLegalByDoctrine({
    def,
    selected,
    activity,
    roe,
    objective: directive && directive.objective,
    self,
    tick,
  });
  const next = legalAction ? selected : {
    ...selected,
    actionId: null,
    targetId: null,
    targetContact: null,
    utility: Math.min(finite(selected.utility, 0), 0.22),
    reasons: appendReason(selected.reasons, `roe_${roe}`),
  };
  next.maneuver = movementForActivity(next.maneuver, activity, directive, freeze);
  return next;
}

export function movementForActivity(maneuver, activityValue, directive, freeze = Object.freeze) {
  const activity = normalizeActivity(activityValue);
  if (!activity || !maneuver) return maneuver;
  const anchor = activity.anchor || maneuver.formationSlot || (directive && directive.formation && directive.formation.slot) || null;
  const base = {
    ...maneuver,
    reason: activity.reason || maneuver.reason,
  };
  if (anchor) base.formationSlot = freeze({ x: finite(anchor.x), z: finite(anchor.z) });

  // Encounter and squad survival orders outrank a member's previous doctrine phase. Without this
  // guard an ATTACK_RUN activity rewrites an explicit retreat back into an intercept on the same
  // tick, making damaged wings appear suicidally aggressive.
  if (directive && directive.objective && directive.objective.kind === ObjectiveKind.RETREAT) {
    return freeze({
      ...base,
      kind: ManeuverKind.RETREAT,
      targetId: null,
      breakFormation: true,
      reason: directive.objective.reason || 'ordered_retreat',
    });
  }

  switch (activity.kind) {
    case ActivityKind.HAIL_HOLD:
    case ActivityKind.LOITER:
      return freeze({ ...base, kind: ManeuverKind.HOLD, targetId: null, breakFormation: false });
    case ActivityKind.PATROL_ROUTE:
    case ActivityKind.TRANSIT:
    case ActivityKind.RETURN_TO_ANCHOR: {
      // Ordinary lane transit keeps formation travel. A TRANSIT activity that names a concrete
      // target (freight pod recovery, rendezvous) must break the squad formation envelope and
      // seek the activity anchor/target until physical contact can fire. A full interceptor
      // pass is wrong here: flyby geometry keeps missing slow pickup-scale targets.
      if (activity.kind === ActivityKind.TRANSIT && activity.targetId != null) {
        const preferred = Number.isFinite(activity.preferredRange) && activity.preferredRange > 0
          ? activity.preferredRange
          : 1;
        // Bound the formation arrival envelope to the contact standoff so TRAVEL/FORMATION does not
        // treat a 170-WU squad spacing as "arrived" far outside pickup radius.
        const bound = Math.max(preferred, 24);
        return freeze({
          ...base,
          kind: ManeuverKind.FORMATION,
          targetId: activity.targetId,
          preferredRange: preferred,
          breakFormation: true,
          formationBound: bound,
        });
      }
      return freeze({ ...base, kind: ManeuverKind.FORMATION, targetId: null, breakFormation: false });
    }
    case ActivityKind.SCAN_APPROACH:
      return freeze({ ...base, kind: ManeuverKind.INTERCEPT, preferredRange: activity.preferredRange || 620 });
    case ActivityKind.REPOSITION:
      return freeze({ ...base, kind: ManeuverKind.ORBIT, preferredRange: Math.max(260, activity.preferredRange || finite(base.preferredRange, 360)) });
    case ActivityKind.SCREEN:
      return freeze({ ...base, kind: ManeuverKind.SCREEN });
    case ActivityKind.DISENGAGE:
    case ActivityKind.FLEE:
      return freeze({ ...base, kind: ManeuverKind.RETREAT, targetId: null });
    case ActivityKind.ATTACK_RUN:
    default:
      return freeze({ ...base, kind: attackRunManeuverKind(base.kind), preferredRange: Math.max(140, activity.preferredRange || finite(base.preferredRange, 180)) });
  }
}

export function canFireByDoctrine({
  activity: activityValue,
  roe: roeValue,
  objectiveKind,
  target,
  self,
  wanted = false,
  recentlyDamaged = false,
}) {
  const activity = normalizeActivity(activityValue);
  const roe = normalizeRoe(roeValue);
  if (roe === RulesOfEngagement.HOLD_FIRE) return false;
  if (!target || !target.alive) return false;
  if (objectiveKind !== ObjectiveKind.FOCUS && objectiveKind !== ObjectiveKind.ENGAGE) return false;
  if (roe === RulesOfEngagement.LAWFUL_WANTED_ONLY && !wanted) return false;
  if (roe === RulesOfEngagement.DEFENSIVE && !recentlyDamaged && !(activity && activity.kind === ActivityKind.SCREEN)) return false;
  if (!activity) return true;
  if (!activityAllowsOffense(activity)) return false;
  if (activity.targetId != null && activity.targetId !== target.id) return false;
  if (activity.anchor && Number.isFinite(activity.leashRadius) && self && self.pos) {
    const distance = distance2(self.pos, activity.anchor);
    if (distance > activity.leashRadius * 1.25) return false;
  }
  return true;
}

export function activityAllowsOffense(activityValue) {
  const activity = normalizeActivity(activityValue);
  return activity == null || OFFENSIVE_ACTIVITY_VALUES.has(activity.kind);
}

export function outsideActivityLeash(self, activityValue) {
  const activity = normalizeActivity(activityValue);
  if (!activity || !activity.anchor || !self || !self.pos) return false;
  return distance2(self.pos, activity.anchor) > activity.leashRadius;
}

function actionLegalByDoctrine({ def, selected, activity, roe, objective, self, tick }) {
  if (!selected || !def) return true;
  if (!isAttackAction(def)) return true;
  if (!activityAllowsOffense(activity)) return false;
  if (roe === RulesOfEngagement.HOLD_FIRE) return false;
  if (activity && activity.deadlineTick != null && tick < activity.deadlineTick && activity.kind === ActivityKind.HAIL_HOLD) return false;
  if (activity && outsideActivityLeash(self, activity)) return false;
  if (roe === RulesOfEngagement.DEFENSIVE && !(activity && activity.kind === ActivityKind.SCREEN)) return false;
  return true;
}

function isAttackAction(def) {
  const tags = def && Array.isArray(def.tags) ? def.tags : [];
  return tags.includes('attack') || tags.includes('disable');
}

function attackRunManeuverKind(kind) {
  if (kind === ManeuverKind.ORBIT) return ManeuverKind.ORBIT;
  if (kind === ManeuverKind.SCREEN) return ManeuverKind.SCREEN;
  return ManeuverKind.INTERCEPT;
}

function appendReason(reasons, reason) {
  const out = Array.isArray(reasons) ? reasons.slice() : [];
  out.push(reason);
  return out;
}

function normalizeVec(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return Object.freeze({ x: finite(value.x), z: finite(value.z) });
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
