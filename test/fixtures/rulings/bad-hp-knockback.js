// Fixture: knockback scaled by missing hull. Must trip no-hp-scaled-knockback.
export function knockback(def, victim) {
  const hpFraction = victim.hp / victim.hpMax;
  const impulse = def.impulse * (2 - hpFraction);
  return impulse;
}
