// §22 B5 — collision presentation scale. A combat:collisionConsequence receipt carries two
// speeds: `deltaV`, the solver-capped share of momentum the contact applied this tick (bounded
// near mass·40 WU/s by MAX_CONTACT_DV), and `feelDeltaV`, the pre-solve closing speed the bodies
// actually met at. Everything the player SEES or HEARS about how hard the contact was reads the
// pre-solve axis — the same axis feel.js's hit-stop/trauma curve and the audio rate bend already
// use — so a 150 WU/s slam cannot present as a 40 WU/s nudge just because the solver rate-limited
// the applied share.
//
// Pure: no THREE, no DOM, no state, no RNG. Node-testable.

// Flash size is resolveCollisionFeel. The old private 8→150 line is not a second scale.
import { COLLISION_DELTA_V_FLOOR, COLLISION_DELTA_V_REF, resolveCollisionFeel } from '../feel.js';

export const COLLISION_DISPLAY_SPEED_TOUCH = COLLISION_DELTA_V_FLOOR;
export const COLLISION_DISPLAY_SPEED_SLAM = COLLISION_DELTA_V_REF;

/** The speed the presentation answers to: pre-solve closing speed when the receipt carries it. */
export function collisionDisplayDeltaV(receipt) {
  const applied = Math.max(0, Number(receipt && receipt.deltaV) || 0);
  const preSolve = Number(receipt && receipt.feelDeltaV);
  if (!Number.isFinite(preSolve) || preSolve <= 0) return applied;
  return Math.max(applied, preSolve);
}

/** Flash size is the trauma resolveCollisionFeel already computed for this contact. */
export function collisionFeelForReceipt(receipt) {
  const dv = collisionDisplayDeltaV(receipt);
  const preSolve = Number(receipt && (receipt.feelDeltaV ?? receipt.preSolveClosingSpeed));
  const momentum = Number(receipt && (receipt.exchangedMomentum ?? receipt.dp)) || 0;
  return resolveCollisionFeel(
    { dp: momentum },
    {
      mode: 'flight',
      deltaV: dv,
      feelDeltaV: Number.isFinite(preSolve) && preSolve > 0 ? preSolve : dv,
      momentum,
      playerDistance: 0,
    },
  );
}

export function collisionImpactMagnitude(receipt) {
  const feel = collisionFeelForReceipt(receipt);
  return feel && Number.isFinite(feel.trauma) ? feel.trauma : 0;
}

/** Contact light: intensity and radius both ride the same display speed the flash sizes read. */
export function collisionImpactLight(receipt) {
  const feel = collisionFeelForReceipt(receipt);
  const magnitude = feel && Number.isFinite(feel.trauma) ? feel.trauma : 0;
  const dv = feel && Number.isFinite(feel.deltaV) ? feel.deltaV : 0;
  return {
    intensity: 2.6 * (magnitude / 0.35),
    range: 120 + dv * 3,
  };
}
