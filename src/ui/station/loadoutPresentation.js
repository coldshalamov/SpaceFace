// Plan 54 loadout identity copy. This presenter does not maintain a parallel stat model: every
// phrase is selected from Ships' derived block and the established handling/mass presenters.
import { getDerivedStats } from '../../systems/ships.js';
import { handlingProfileForShip } from '../panels/handlingProfile.js';
import { buildMassDelta } from '../panels/massDelta.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function presentLoadoutCapability(defId, fittings = [], player = null) {
  const derived = getDerivedStats(defId, fittings, player);
  const handling = handlingProfileForShip(defId, { fittings, player });
  const mass = buildMassDelta(defId, {
    beforeFittings: [],
    afterFittings: fittings,
    player,
  });
  if (!handling || !mass || !mass.ok) return 'General-purpose fit with a balanced flight profile.';

  const axis = (id) => handling.axes.find((row) => row.id === id) || { bar: 50 };
  const agility = finite(axis('agility').bar, 50);
  const speed = finite(axis('topSpeed').bar, 50);
  const massRatio = finite(mass.after && mass.after.massRatio, 1);
  const handlingPhrase = agility >= 67 ? 'quick-response handling'
    : agility <= 33 ? 'deliberate handling'
      : speed >= 67 ? 'fast transit handling' : 'balanced handling';
  const massPhrase = massRatio >= 1.28 ? 'a heavy operating mass'
    : massRatio <= 1.08 ? 'a light operating mass' : 'a settled operating mass';

  let purpose = 'Utility';
  if (derived.masslineHeadId) purpose = 'Tow-control';
  else if (finite(derived.radarRangeMult, 1) > 1) purpose = 'Long-range survey';
  else if (finite(derived.hiddenCargoPct) > 0 || finite(derived.scannerCloak) > 0) purpose = 'Low-signature cargo';
  else if (finite(derived.hullRepairOOC) > 0 || finite(derived.damageReductionMult, 1) < 1) purpose = 'Endurance';
  else if (finite(derived.weaponDmgMult, 1) > 1 || finite(derived.weaponRangeMult, 1) > 1) purpose = 'Strike';
  else if (finite(derived.cargoCap) >= 80) purpose = 'Cargo-forward';
  else if (finite(derived.droneBayCount) > 0) purpose = 'Drone support';

  return `${purpose} fit with ${handlingPhrase}, ${massPhrase}, and a ${Math.max(0, Math.round(finite(derived.cargoCap)))}u hold.`;
}
