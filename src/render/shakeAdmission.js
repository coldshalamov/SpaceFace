// Bounded admission for discrete camera shakes (Controlled Chaos packet 08).
//
// `camera:shake` has many emitters and trauma simply adds up to 1, so a swarm fight (a dozen kills,
// a shotgun burst into the player's shield) saturates the camera: the screen is always shaking and
// the one beat that deserved it is invisible. This is the single admission rule for discrete world
// and hit events at the renderer's chokepoint:
//
//   * continuous textures (amount < eventFloor: gyre ball hum, tether strain, flyby) pass untouched;
//   * a discrete event is admitted at amount / (1 + recentEnergy / referenceEnergy), so the first
//     blow in a quiet moment is whole and each further blow inside the window adds less;
//   * the energy admitted inside the decaying window never exceeds `windowCeiling`, so a massacre
//     can bound but never pin the camera;
//   * a lone hero beat (nothing else recent) is admitted in full.
//
// Pure and clock-parameterized (sim seconds); no ambient time, no randomness. Reduced motion is
// applied downstream by the camera (trauma scale / kick refusal) - this rule only decides magnitude.

export const SHAKE_ADMISSION_LAW = Object.freeze({
  eventFloor: 0.08,
  referenceEnergy: 0.45,
  decayPerS: 1.6,
  windowCeiling: 0.85,
});

export function createShakeAdmission(law = SHAKE_ADMISSION_LAW) {
  let energy = 0;
  let lastT = -Infinity;
  const decayTo = (nowS) => {
    if (Number.isFinite(nowS) && nowS > lastT) {
      const dt = Number.isFinite(lastT) ? nowS - lastT : 0;
      if (dt > 0) energy *= Math.exp(-law.decayPerS * dt);
      lastT = nowS;
    } else if (Number.isFinite(nowS) && nowS < lastT) {
      // the clock went backwards (new game / reload): forget the old window
      energy = 0;
      lastT = nowS;
    }
  };
  return {
    /** @returns {number} the amount to actually add (0..amount). */
    admit(amount, nowS) {
      const a = Number(amount);
      if (!(a > 0) || !Number.isFinite(a)) return 0;
      decayTo(nowS);
      if (a < law.eventFloor) return a;
      const taper = a / (1 + energy / law.referenceEnergy);
      const room = Math.max(0, law.windowCeiling - energy);
      const admitted = Math.min(a, taper, room);
      energy += admitted;
      return admitted;
    },
    reset() { energy = 0; lastT = -Infinity; },
    energy() { return energy; },
  };
}
