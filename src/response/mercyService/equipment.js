// Rescue tools change which bodies can be held. They are not percent bonuses.
// The starter massline stays unlimited: there is no charge, ammo, or durability pool.

import { CLAMP_RANGE, RIG_RANGE, STAB_RANGE } from './constants.js';

export const STARTER_TETHER = Object.freeze({
  id: 'starter-massline',
  limited: false,
  charges: null,
});

export function createEquipment() {
  return {
    starterTether: { id: STARTER_TETHER.id, limited: false, charges: null },
    stabilizer: { id: 'mercy-stabilizer', seatedOn: null },
    clamp: { id: 'mercy-safety-clamp', seatedOn: null },
    containment: { id: 'mercy-containment-rig', seatedOn: null },
  };
}

export function needsClamp(body, def) {
  return !!(body && def && body.mass > def.clampMass);
}

export function needsRig(body) {
  return !!(body && body.volatile);
}

export function secureCapability(body, def, tensionNow) {
  if (!body || !body.alive) return false;
  if (needsRig(body) && !body.rigAttached) return false;
  if (needsClamp(body, def) && !body.clampAttached) return false;
  if (!needsRig(body) && !needsClamp(body, def)) {
    return tensionNow > 40 || !!body.clampAttached;
  }
  return true;
}

export function toolRange(tool) {
  if (tool === 'clamp') return CLAMP_RANGE;
  if (tool === 'stabilizer') return STAB_RANGE;
  if (tool === 'containment') return RIG_RANGE;
  return 0;
}
