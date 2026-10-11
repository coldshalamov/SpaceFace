// Unapplied adapter body. Tactical AI does not import this module.
// The arena calls it so the same intent seam is what a later landing would call:
// maneuver through aiManeuver, fire only after engagement authority, repair only
// through repairSubsystem. Nothing here is a registered system.

import { createCombatCatalog, ensureCombatant } from '../../combat/runtime.js';
import { repairSubsystem } from '../../combat/subsystems.js';
import { AI_CONTRACT_VERSION, ManeuverKind, makeThrusterRequest } from '../contracts.js';
import { gateCounterplayFire } from './authorityGate.js';

let repairCatalog = null;

function catalog() {
  if (!repairCatalog) repairCatalog = createCombatCatalog();
  return repairCatalog;
}

export function applyCounterplayIntent({
  state,
  helpers,
  entity,
  decision,
  tick,
  target,
} = {}) {
  const result = {
    maneuverOk: false,
    fire: { requested: false, authorized: false, reason: 'no_attack' },
  };
  if (!entity || !decision) return result;
  const maneuver = decision.maneuver || {};
  if (helpers && helpers.aiManeuver && typeof helpers.aiManeuver.request === 'function') {
    const packet = makeThrusterRequest(entity.id, tick, {
      kind: ManeuverKind.INTERCEPT,
      forceLocal: {
        forward: Number.isFinite(maneuver.forward) ? maneuver.forward : 0,
        right: Number.isFinite(maneuver.right) ? maneuver.right : 0,
      },
      torqueYaw: maneuver.torqueYaw,
      boost: maneuver.boost === true,
      brake: maneuver.brake === true,
      targetHeading: maneuver.targetHeading,
      reason: `counterplay:${decision.doctrineId}:${decision.phase}`,
    });
    if (packet.version === AI_CONTRACT_VERSION) {
      result.maneuverOk = helpers.aiManeuver.request(packet) === true;
    }
  }
  const data = entity.data || (entity.data = {});
  if (!data.intent) data.intent = { fire: false, aimAngle: entity.rot || 0 };
  data.intent.fire = false;
  if (!decision.attack || decision.attack.wantFire !== true) return result;
  result.fire.requested = true;
  const gate = gateCounterplayFire({ state, self: entity, target, decision, tick });
  result.fire.reason = gate.reason;
  result.fire.authorized = gate.ok === true;
  if (gate.ok === true) {
    data.intent.fire = true;
    data.intent.aimAngle = Number.isFinite(decision.attack.aimAngle)
      ? decision.attack.aimAngle
      : Math.atan2(
        (target && target.pos ? target.pos.z : 0) - entity.pos.z,
        (target && target.pos ? target.pos.x : 0) - entity.pos.x,
      );
  }
  return result;
}

/**
 * Field repair verb. Amount is the authored drive field rate (0.25) when the
 * caller does not pass a smaller number. This is the subsystem writer, not a hull assign.
 */
export function applyCounterplayRepair({ state, patient, amount = 0.25, reason = 'counterplay_field_repair' } = {}) {
  if (!state || !patient) return { ok: false, reason: 'missing' };
  const runtime = ensureCombatant(state, patient, catalog());
  const before = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive
    ? runtime.subsystems.subsystem_drive.health
    : null;
  const applied = repairSubsystem(
    { state },
    patient,
    runtime,
    'subsystem_drive',
    Math.max(0, Number(amount) || 0),
    reason,
  );
  const after = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive
    ? runtime.subsystems.subsystem_drive.health
    : null;
  return { ok: applied.applied > 0, before, after, applied: applied.applied };
}
