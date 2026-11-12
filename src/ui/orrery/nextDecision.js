// SFQ-B202 — one sentence for the next flight decision. Empty when the picture is quiet,
// so a healthy cluster does not grow a caption. Reads a cluster model; writes nothing.

const HULL_BREAK = 'Hull critical — disengage and repair at a station';
const SHIELD_DOWN = 'Shield is down — keep the next hit off the hull';
const GUN_HOT = 'Ease fire — the gun is hot';
const ORDNANCE_EMPTY = 'Ordnance is empty — restock at a station';

export const NEXT_DECISION_CLASS = 'orr-cluster__next';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {object} model cluster update payload (hull, shield, heat, ordnance, speed)
 * @returns {string} the next decision, or '' when nothing needs saying
 */
export function nextFlightDecision(model) {
  if (!model || typeof model !== 'object') return '';
  const hullMax = num(model.hullMax);
  const hull = num(model.hull);
  if (hullMax > 0 && hull / hullMax < 0.3) return HULL_BREAK;
  const shieldMax = num(model.shieldMax);
  const shield = num(model.shield);
  if (shieldMax > 0 && shield <= 0) return SHIELD_DOWN;
  const heat = num(model.heat);
  if (heat > 0.75) return GUN_HOT;
  const ordnance = model.ordnance && typeof model.ordnance === 'object' ? model.ordnance : null;
  if (ordnance) {
    // Empty command sockets mean there is nothing deployed to command. Only
    // actual stocked tools can need rearming; one dry tool does not empty the bay.
    const supplies = Object.values(ordnance).filter((entry) => entry?.consumable === true);
    if (supplies.length && supplies.every((entry) => entry.state === 'empty')) return ORDNANCE_EMPTY;
  }
  // Boost, travel burn and earned momentum intentionally exceed the reference
  // mark. Speed alone is not a hazard and must never tell the pilot to brake.
  return '';
}
