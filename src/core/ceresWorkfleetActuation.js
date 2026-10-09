// Process-local proof of force actually consumed by the workfleet controller. Save
// diagnostics, velocity, intent, and a copied _flightFrame never authorize a nozzle.
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
import { machineryHasEffectivePresentation } from './machineryPresentation.js';

const receipts = new WeakMap();
const finite = Number.isFinite;
function eligible(state, entity, role) {
  const capability = state?.combat?.entities?.[String(entity?.id)]?.capabilities;
  return (role === 'breaker' || role === 'cutterHead') && state?.entities?.get(entity.id) === entity
    && entity.alive !== false && entity.hull > 0 && Number.isSafeInteger(entity.occupantGeneration)
    && entity.id !== state.playerId && entity.playerOwned !== true && entity.data?.playerOwned !== true
    && !entity.data?.controlLease && entity.data?.disabled !== true
    && capability?.drive !== false && capability?.power !== false
    && state.render?.contextRecovery?.pending !== true
    && machineryHasEffectivePresentation(entity, state);
}
export function clearCeresWorkfleetActuation(entity) {
  if (entity) receipts.delete(entity);
}
export function recordCeresWorkfleetActuation(state, entity, control, limits) {
  const role = ceresWorkfleetRoleForEntity(entity);
  if (!control || !eligible(state, entity, role)
    || ![state.tick, state.simTime, control.force?.x, control.force?.z, control.torque?.y,
      limits?.accel, limits?.angularAccel, entity.mass, entity.physicsBody?.inertiaY].every(finite)
    || !(limits.accel > 0) || !(limits.angularAccel > 0)) {
    clearCeresWorkfleetActuation(entity); return null;
  }
  const c = Math.cos(entity.rot || 0), s = Math.sin(entity.rot || 0);
  const localFx = control.force.x * c + control.force.z * s;
  const localFz = -control.force.x * s + control.force.z * c;
  const torque = control.torque.y;
  if (![localFx, localFz, torque].every(finite)) { clearCeresWorkfleetActuation(entity); return null; }
  const render = state.render;
  const receipt = { state, entity, tick: state.tick, simTime: state.simTime,
    life: entity.occupantGeneration, role, worldRecordId: entity.data.worldRecordId,
    render, scene: render?.scene, nativeRenderer: render?.renderer,
    generation: render?.admissionRunGeneration, recoveryGeneration: render?.contextRecovery?.generation,
    mesh: entity.mesh, body: entity.physicsBody, bodyRevision: entity.physicsBody?.revision,
    localFx, localFz, torque, linearCapacity: limits.accel * entity.mass,
    torqueCapacity: limits.angularAccel * entity.physicsBody.inertiaY };
  receipts.set(entity, receipt);
  return receipt;
}
export function readCeresWorkfleetActuation(entity, state = receipts.get(entity)?.state) {
  const r = entity && receipts.get(entity), render = state?.render;
  if (!r || r.state !== state || r.entity !== entity || r.tick !== state.tick || r.simTime !== state.simTime
    || r.life !== entity.occupantGeneration || r.role !== ceresWorkfleetRoleForEntity(entity)
    || r.worldRecordId !== entity.data?.worldRecordId || r.render !== render || r.scene !== render?.scene
    || r.nativeRenderer !== render?.renderer || r.generation !== render?.admissionRunGeneration
    || r.recoveryGeneration !== render?.contextRecovery?.generation || r.mesh !== entity.mesh
    || r.body !== entity.physicsBody || r.bodyRevision !== entity.physicsBody?.revision
    || !eligible(state, entity, r.role)) {
    clearCeresWorkfleetActuation(entity); return null;
  }
  return r;
}
