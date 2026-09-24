// §22 B5 — collision presentation scale. A combat:collisionConsequence receipt carries two
// speeds: `deltaV`, the solver-capped share of momentum the contact applied this tick (bounded
// near mass·40 WU/s by MAX_CONTACT_DV), and `feelDeltaV`, the pre-solve closing speed the bodies
// actually met at. Everything the player SEES or HEARS about how hard the contact was reads the
// pre-solve axis — the same axis feel.js's hit-stop/trauma curve and the audio rate bend already
// use — so a 150 WU/s slam cannot present as a 40 WU/s nudge just because the solver rate-limited
// the applied share.
//
// Pure: no THREE, no DOM, no state, no RNG. Node-testable.

// The shared 8→150 WU/s axis (collision-feel floor → reference slam). Mirrors
// COLLISION_DELTA_V_FLOOR / COLLISION_DELTA_V_REF in render/feel.js — duplicated, not imported,
// because this file must stay a leaf: feel.js already sits upstream of the same receipts and a
// render->render import chain would fold the whole feel module into VFX's import graph.
export const COLLISION_DISPLAY_SPEED_TOUCH = 8;    // WU/s — below this a contact is a touch
export const COLLISION_DISPLAY_SPEED_SLAM = 150;   // WU/s — the presentation saturates here

/** The speed the presentation answers to: pre-solve closing speed when the receipt carries it. */
export function collisionDisplayDeltaV(receipt) {
  const applied = Math.max(0, Number(receipt && receipt.deltaV) || 0);
  const preSolve = Number(receipt && receipt.feelDeltaV);
  if (!Number.isFinite(preSolve) || preSolve <= 0) return applied;
  return Math.max(applied, preSolve);
}

/**
 * The 0.6–2.4 authored magnitude band, mapped onto the presentation axis. Receipts that carry no
 * pre-solve channel keep the legacy clamped-dv curve (dv/14, saturating ~34 WU/s) so manual and
 * legacy receipts stay bit-stable; pre-solve receipts map the full 8→150 axis linearly so the
 * nudge and the slam land at visibly different sizes.
 */
export function collisionImpactMagnitude(receipt) {
  const dv = collisionDisplayDeltaV(receipt);
  const preSolve = Number(receipt && receipt.feelDeltaV);
  if (Number.isFinite(preSolve) && preSolve > 0) {
    const u = Math.min(1, Math.max(0,
      (dv - COLLISION_DISPLAY_SPEED_TOUCH) / (COLLISION_DISPLAY_SPEED_SLAM - COLLISION_DISPLAY_SPEED_TOUCH)));
    return 0.6 + 1.8 * u;
  }
  return Math.max(0.6, Math.min(2.4, dv / 14));
}

/** Contact light: intensity and radius both ride the same display speed the flash sizes read. */
export function collisionImpactLight(receipt) {
  const dv = collisionDisplayDeltaV(receipt);
  const magnitude = collisionImpactMagnitude(receipt);
  return {
    intensity: 2.6 * magnitude,
    range: 120 + dv * 3,
  };
}
