// Fixture: three shapes of drag. Must trip no-linear-damping three times.
export function settle(e, dt, body) {
  e.vel.x *= Math.max(0, 1 - 0.4 * dt);
  e.vel.z *= 0.98;
  body.setLinearDamping(0.5);
}
