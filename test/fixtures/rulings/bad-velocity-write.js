// Fixture: a system that writes velocity directly. Must trip no-velocity-writes-outside-owner.
export function shove(e, nx, nz) {
  e.vel.x += nx * 40;
  e.vel.z = nz * 40;
}
