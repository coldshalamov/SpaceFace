// SFQ-B202 — one sentence for the next flight decision. Empty when the picture is quiet,
// so a healthy cluster does not grow a caption. Reads a cluster model; writes nothing.

const HULL_BREAK = 'Break off — the hull will not take another hit';
const SHIELD_DOWN = 'Shield is down — keep the next hit off the hull';
const GUN_HOT = 'Ease fire — the gun is hot';
const ORDNANCE_EMPTY = 'Ordnance is empty — restock at a station';
const PAST_MARK = 'Ease off — you are past the governed mark';

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
    for (const entry of Object.values(ordnance)) {
      if (entry && entry.state === 'empty') return ORDNANCE_EMPTY;
    }
  }
  const speed = num(model.speed);
  const speedRef = num(model.speedRef);
  if (speedRef > 0 && speed > speedRef * 1.02) return PAST_MARK;
  return '';
}
