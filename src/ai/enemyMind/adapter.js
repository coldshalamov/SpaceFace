// Pure SG-06 bridge. No imports from the game: tested independently and through the packet stack.
const SPECIALIST_DOCTRINES = new Set([
  'tether_control_raider', 'field_anchor_controller', 'capital_broadside',
  'capital_broadside_tollman', 'capital_broadside_ala', 'escort_screen', 'mine_layer_wake', 'shield_breaker',
]);

/** Reserve bespoke specialist/boss control. Their authored verbs are not generic flank jobs. */
export function enemyMindDirectiveInput(directive, perception) {
  const doctrine = directive?.combatDoctrineId || perception?.self?.combatDoctrineId;
  if ((SPECIALIST_DOCTRINES.has(doctrine) || perception?.self?.moraleImmune === true
    || perception?.self?.arenaPursuit === true) && directive?.objective?.kind !== 'retreat') return {
    ...directive, objective: { ...directive.objective, kind: 'hold' },
  };
  return directive;
}

/** Never changes target assignment or broadens an upper-layer order. */
export function applyEnemyMindDirective(directive, mind, freeze = Object.freeze) {
  if (!mind) return directive;
  const withdrawing = mind.verb === 'withdraw' || mind.verb === 'panic';
  const holding = !mind.fireAllowed && (mind.verb === 'regroup' || mind.targetId == null);
  const objective = withdrawing || holding ? freeze({
    ...directive.objective, kind: withdrawing ? 'retreat' : 'hold',
    targetId: null, reason: `enemy_mind:${mind.verb}:${mind.phase}`,
  }) : directive.objective;
  return freeze({ ...directive, objective, enemyMind: mind,
    formation: mind.ownManeuver ? freeze({ ...directive.formation, slot: freeze({ ...mind.goal }),
      velocity: freeze({ x: 0, z: 0 }), breakFormation: true, breakReason: `enemy_mind:${mind.verb}`,
    }) : directive.formation });
}

/**
 * Apply AFTER hull doctrine selection, then again AFTER BehaviorExecutor's commit latch.
 * Fire may only be vetoed. The existing action port still owns starts/cancel windows.
 */
export function applyEnemyMindSelection(selected, mind) {
  if (!selected || !mind) return selected;
  return { ...selected,
    ...(!mind.fireAllowed ? { actionId: null, targetId: null, targetContact: null, forceInterrupt: true } : {}),
    maneuver: mindManeuver(selected.maneuver, mind),
  };
}
export function applyEnemyMindBehavior(behavior, mind, freeze = Object.freeze) {
  return !behavior || !mind ? behavior : freeze({ ...behavior, maneuver: freeze(mindManeuver(behavior.maneuver, mind)) });
}
function mindManeuver(base = {}, mind) {
  if (!mind.ownManeuver) return base;
  return {
    ...base, kind: mind.maneuverKind, targetId: mind.targetId,
    formationSlot: { ...mind.goal }, formationVelocity: { x: 0, z: 0 },
    formationBound: base?.formationBound || 170, breakFormation: true,
    flightPoint: { ...mind.goal }, faceTarget: mind.faceTarget,
    formationLocked: false, ramAuthorized: false, crossingLane: false,
    attackLine: null, enemyMindOwned: true, reason: `enemy_mind:${mind.verb}:${mind.phase}`,
  };
}

/** Cached decisions must also carry this veto on the intervening 60 Hz ticks. */
export function enemyMindAllowsFire(decision, simTime) {
  const mind = decision?.enemyMind;
  return !mind || (mind.fireAllowed === true && Number.isFinite(simTime) && simTime <= mind.validUntil + 1e-9);
}

/** Full behavior cache invalidation includes phase, live fire veto; waypoint motion uses the motor-only cache lane. */
export function enemyMindDecisionChanged(previous, next) {
  if (!previous || !next) return previous !== next;
  return previous.serial !== next.serial || previous.phase !== next.phase
    || previous.targetId !== next.targetId || previous.fireAllowed !== next.fireAllowed;
}
