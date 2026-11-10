// The only fire path for these doctrines: the canonical engagement authority.
// A policy that wants a shot still fails closed when the authority says no.

import { authorizeAIEngagement } from '../engagementAuthority.js';
import { counterplayDoctrineById } from './catalog.js';

export function gateCounterplayFire({
  state,
  self,
  target,
  decision,
  tick,
} = {}) {
  if (!decision || !decision.attack || decision.attack.wantFire !== true) {
    return { ok: false, reason: 'no_attack' };
  }
  const doctrine = counterplayDoctrineById(decision.doctrineId);
  if (!doctrine || doctrine.fires !== true) return { ok: false, reason: 'doctrine_does_not_fire' };
  if (!doctrine.legalFireDoctrineId || !doctrine.legalFirePhase) {
    return { ok: false, reason: 'no_legal_window' };
  }
  if (decision.attack.targetRole === 'civilian' || decision.attack.targetRole === 'patient') {
    return { ok: false, reason: 'protected_target' };
  }
  const phase = decision.attack.legalPhase || doctrine.legalFirePhase;
  if (phase !== doctrine.legalFirePhase) return { ok: false, reason: 'phase_not_window' };
  return authorizeAIEngagement({
    state,
    self,
    target,
    tick,
    objectiveReason: `combat_doctrine:${doctrine.legalFireDoctrineId}:${phase}`,
  });
}
