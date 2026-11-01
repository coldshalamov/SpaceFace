// Short-lived propulsion accents. The VFX instance owns the pools, event wiring, and dash latch;
// this module only emits the existing boost, dash, and RCS pictures through explicit callbacks.

export function presentShipBoost(owner, payload, on, helpers) {
  const entity = helpers.resolveEntity(owner, payload && payload.shipId);
  if (!entity || !owner._scene) return;
  if (helpers.usesProductionThruster(owner, entity)) return;
  if (on) {
    // Boost ignition: a tight rear-nozzle kick, not a ship-sized bloom.
    const color = helpers.engineColor(owner, entity);
    const cf = Math.cos(entity.rot), sf = Math.sin(entity.rot);
    const socket = helpers.trailSocketWorldPose(owner, entity);
    const exhaustX = socket ? socket.forwardX : -cf;
    const exhaustZ = socket ? socket.forwardZ : -sf;
    const rawBx = socket ? socket.x : entity.pos.x - cf * (entity.radius + 2);
    const rawBz = socket ? socket.z : entity.pos.z - sf * (entity.radius + 2);
    const bx = rawBx + exhaustX * helpers.boostNozzleClearance;
    const bz = rawBz + exhaustZ * helpers.boostNozzleClearance;
    const svx = (entity.vel && entity.vel.x) || 0;
    const svz = (entity.vel && entity.vel.z) || 0;
    helpers.spawnSprite(owner, helpers.sprites.flash, bx, 0, bz, 0.14, 3.5, 7.5, 0.78, 0.0, '#ffffff', 0, 0);
    helpers.spawnSprite(owner, helpers.sprites.flash, bx, 0, bz, 0.22, 4.5, 10, 0.46, 0.0, color, 0, 0);
    helpers.spawnSprite(owner, helpers.sprites.ring, bx, 0, bz, 0.18, 2, 8, 0.45, 0.0, color, exhaustX * 5, exhaustZ * 5);
    helpers.eventLight(owner, { x: bx, z: bz }, 'thrust', { severity: 'boost', color });
    owner._c0.set('#ffffff'); owner._c1.set(color);
    const baseA = socket ? socket.angle : Math.atan2(-sf, -cf);
    const count = Math.max(10, Math.round(22 * (owner._burst || 1)));
    for (let k = 0; k < count; k++) {
      const angle = baseA + (Math.random() - 0.5) * 0.42;
      const speed = 90 + Math.random() * 80;
      helpers.spawnParticle(owner, bx, bz, svx + Math.cos(angle) * speed, svz + Math.sin(angle) * speed,
        0.34, 2.5, 0.0, owner._c0, owner._c1, 1.4, 0, 0);
    }
  }
}

// Phase 3 dash: hot violet afterburner at the nozzles, a brief energy flash, and no HUD word-pop.
// It remains distinct from sustained boost (whiter core, longer rear streak, punch).
export function presentShipDash(owner, payload, helpers) {
  const entity = helpers.resolveEntity(owner, payload && payload.shipId);
  if (!entity || !owner._scene) return;
  // The drive envelope consumes and clears this latch on the next read, so frame pacing does not
  // change the one-flare-per-dash contract.
  if (entity.id === owner.state?.playerId) owner._plumeDashPending = true;
  const cf = Math.cos(entity.rot), sf = Math.sin(entity.rot);
  const socket = helpers.trailSocketWorldPose(owner, entity);
  const exhaustX = socket ? socket.forwardX : -cf;
  const exhaustZ = socket ? socket.forwardZ : -sf;
  const bx = socket ? socket.x : entity.pos.x - cf * (entity.radius + 2);
  const bz = socket ? socket.z : entity.pos.z - sf * (entity.radius + 2);
  // Hot energy palette: white-hot core → violet plasma → deep purple falloff
  const HOT = '#f0e8ff', VIOLET = '#c98cff', PLASMA = '#9b4dff', DEEP = '#5a1fb8';
  const svx = (entity.vel && entity.vel.x) || 0;
  const svz = (entity.vel && entity.vel.z) || 0;
  // Nozzle ignition — hot flash + expanding energy ring at thrusters (not the nose)
  helpers.spawnSprite(owner, helpers.sprites.flash, bx, 0, bz, 0.18, 5.5, 11, 0.95, 0.0, HOT, 0, 0);
  helpers.spawnSprite(owner, helpers.sprites.flash, bx, 0, bz, 0.28, 4.0, 12, 0.7, 0.0, VIOLET, 0, 0);
  helpers.spawnSprite(owner, helpers.sprites.ring, bx, 0, bz, 0.26, 2.5, 10, 0.75, 0.0, VIOLET, exhaustX * 7, exhaustZ * 7);
  helpers.eventLight(owner, { x: bx, z: bz }, 'thrust', { severity: 'afterburner', color: VIOLET });
  // Afterburner streak: fast rear particles (hot core → purple exhaust)
  owner._c0.set(HOT); owner._c1.set(DEEP);
  const baseA = socket ? socket.angle : Math.atan2(-sf, -cf);
  const count = Math.max(12, Math.round(28 * (owner._burst || 1)));
  for (let k = 0; k < count; k++) {
    const angle = baseA + (Math.random() - 0.5) * 0.38;
    const speed = 110 + Math.random() * 100;
    const life = 0.38 + Math.random() * 0.22;
    const size = 2.6 + Math.random() * 1.4;
    // Alternate hot-white→violet and violet→deep for a layered plasma look
    if (k & 1) { owner._c0.set(HOT); owner._c1.set(PLASMA); }
    else { owner._c0.set(VIOLET); owner._c1.set(DEEP); }
    helpers.spawnParticle(owner, bx, bz, svx + Math.cos(angle) * speed, svz + Math.sin(angle) * speed,
      life, size, 0.0, owner._c0, owner._c1, 1.35, 0, 0);
  }
  if (entity.id === owner.state.playerId) owner.helpers.camera && owner.helpers.camera.addTrauma(0.28);
}

// Aerospace locomotion receipts (shipMicroMotion, render-side only). Deliberately cue-free:
// maneuvering puffs never touch the scored juice-cue contract.
export function presentShipRcsPulse(owner, payload, helpers) {
  if (!owner._scene || !payload) return;
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.z)) return;
  // The production RCS path is player-only: skip the player when it serves them, so player and
  // NPCs share this seam without double-puffing (legacy-mode player included).
  if (payload.shipId != null && payload.shipId === owner.state.playerId) {
    const entity = helpers.resolveEntity(owner, payload.shipId);
    if (entity && helpers.usesProductionThruster(owner, entity)) return;
  }
  const intensity = Math.max(0, Math.min(1, Number(payload.intensity) || 0));
  if (intensity <= 0.01) return;
  const reduced = helpers.isReduced(owner);
  const burst = owner._burst || 1;
  const dirX = Number.isFinite(payload.dirX) ? payload.dirX : 1;
  const dirZ = Number.isFinite(payload.dirZ) ? payload.dirZ : 0;
  const roll = Math.atan2(dirZ, dirX);
  const sm = reduced ? 0.7 : 1;
  // Razor-sharp white cold-gas slit along the exhaust axis.
  helpers.spawnSprite(owner, helpers.sprites.flash, payload.x, 0.12, payload.z, 0.10 + intensity * 0.08,
    (0.9 + intensity * 1.2) * sm, (2.2 + intensity * 2.6) * sm,
    reduced ? 0.55 : 0.85, 0, '#ffffff',
    dirX * (10 + intensity * 14), dirZ * (10 + intensity * 14), 3.2, roll);
  const count = Math.max(2, Math.round((2 + intensity * 4) * burst * (reduced ? 0.6 : 1)));
  owner._c0.set('#ffffff'); owner._c1.set('#bcd2e8');
  for (let k = 0; k < count; k++) {
    const angle = roll + (Math.random() - 0.5) * 0.5;
    const speed = 26 + intensity * 40 + Math.random() * 18;
    helpers.spawnParticle(owner, payload.x, payload.z, Math.cos(angle) * speed, Math.sin(angle) * speed,
      0.22 + intensity * 0.14, 1.1 + intensity * 0.8, 0.05,
      owner._c0, owner._c1, 3.2, 0.1, 0, angle, 2.4);
  }
}
