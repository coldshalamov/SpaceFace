// Exact, bounded identities shared by damage, residency and presentation.
import { CERES_WORKFLEET_CONTRACT as C } from './ceresWorkfleet.js';
export function ceresWorkfleetRoleForEntity(entity) {
  const role=entity?.data?.ceresWorkfleetRole;
  if (!Object.hasOwn(C.assets,role||'')) return null;
  return entity.type===(role==='breaker'?'ship':'wreck')
    && entity.data.worldRecordId===C.identities[role==='breaker'?'worker':role]
    && (role==='breaker'||entity.data.placeId===C.assets[role].id) ? role : null;
}
export function isCeresWorkfleetHardware(entity) {
  const role=ceresWorkfleetRoleForEntity(entity);
  return role==='cradle'||role==='cutterHead';
}
