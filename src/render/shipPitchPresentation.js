// Render-only craft pitch lean over CoreSystem's maintained ship/drone domain.
// Every craft remains updated while far-culled so returning to presentation cannot reveal stale lean.
export function shipPitchCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state && Array.isArray(state.entityList) ? state.entityList : [];
}

// Approximate engine drive for a ship/drone for VFX/feel purposes. Mirrors the logic in vfx.js
// without importing it, keeping this render-only presentation owner decoupled from VFX internals.
export function shipEngineDrive(entity) {
  if (!entity.vel) return 0;
  const speed = Math.hypot(entity.vel.x, entity.vel.z);
  const maxSpd = Math.max(1, entity.maxSpeed || 1);
  const hx = Math.cos(entity.rot), hz = Math.sin(entity.rot);
  const align = speed > 1 ? (entity.vel.x * hx + entity.vel.z * hz) / speed : 0;
  return Math.max(0, Math.min(1, (speed / maxSpd) * Math.max(0, align)));
}

/** Update the cosmetic pitch cue without scanning unrelated authoritative entity types. */
export function updateShipPitchPresentation(state, frameDt) {
  const dt = Math.min(0.05, Math.max(0, frameDt));
  const rate = 6.0;
  let updated = 0;

  for (const entity of shipPitchCandidates(state)) {
    if (!entity.alive || (entity.type !== 'ship' && entity.type !== 'drone')) continue;
    if (entity.flags && entity.flags.docked) continue;
    const boosting = !!(entity.flags && entity.flags.boosting);
    const drive = shipEngineDrive(entity);
    let target = 0;
    if (boosting) target = -0.13;
    else if (drive > 0.75) target = -0.055;
    else if (drive > 0.35) target = -0.025;
    if (!boosting && drive > 0.3 && entity.vel) {
      const vx = entity.vel.x, vz = entity.vel.z;
      const speed = Math.hypot(vx, vz);
      if (speed > 8) {
        const hx = Math.cos(entity.rot), hz = Math.sin(entity.rot);
        const align = (vx * hx + vz * hz) / Math.max(1, speed);
        if (align < -0.35) target = 0.07;
      }
    }
    if (entity.pitch == null) entity.pitch = 0;
    entity.pitch += (target - entity.pitch) * (1 - Math.exp(-rate * dt));
    if (Math.abs(entity.pitch) < 0.0005 && Math.abs(target) < 0.0005) entity.pitch = 0;
    updated++;
  }

  return updated;
}
