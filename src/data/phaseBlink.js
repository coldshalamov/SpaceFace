// Veil Step — the rogue boost. Hold Shift and a shadow of the hull is thrown ahead.
// Release and the ship is there. The boost meter pays. Numbers are the law the
// sim (systems/phaseBlink.js) and the shop sentence both mean.

export const PHASE_BLINK = Object.freeze({
  // A tap is already a step. A full hold is a room across a fight.
  minRange: 36,
  maxRange: 240,
  chargeS: 0.48,
  // The capacitor must have this much before the shadow will leave the hull.
  minEnergy: 42,
  // Paid while the shadow is out, so a long aim is not free.
  aimDrain: 22,
  // Paid on the release, plus a little more the farther the shadow sits.
  commitCost: 28,
  costPerWu: 0.16,
  cooldownS: 1.05,
  // Closer than this and the rock is in the way — the step refuses.
  minCommit: 20,
});

/** 0 at the press, 1 once chargeS has elapsed. */
export function phaseBlinkCharge(holdS) {
  const t = Number(holdS);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const u = t / PHASE_BLINK.chargeS;
  if (u >= 1) return 1;
  // Ease-out so the shadow leaps off the hull and then creeps to the far mark.
  return 1 - (1 - u) * (1 - u);
}

export function phaseBlinkRange(holdS) {
  const c = phaseBlinkCharge(holdS);
  return PHASE_BLINK.minRange + (PHASE_BLINK.maxRange - PHASE_BLINK.minRange) * c;
}

export function phaseBlinkCommitCost(distance) {
  const d = Number(distance);
  const span = Number.isFinite(d) && d > 0 ? d : 0;
  return PHASE_BLINK.commitCost + span * PHASE_BLINK.costPerWu;
}
