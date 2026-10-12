// Win and fail from physical state after the authoritative step.
// A body that never left its spawn cannot satisfy a pocket.

function entityOf(state, gallery, role) {
  const id = gallery.roles && gallery.roles[role];
  if (id == null || !state.entities) return null;
  return state.entities.get(id) || null;
}

function centerInside(entity, volume) {
  if (!entity || !entity.pos || !volume) return false;
  const dx = entity.pos.x - volume.x;
  const dz = entity.pos.z - volume.z;
  return dx * dx + dz * dz <= volume.r * volume.r;
}

function travelOf(entity) {
  const data = entity && entity.data;
  if (!data) return 0;
  const dx = entity.pos.x - data.gallerySpawnX;
  const dz = entity.pos.z - data.gallerySpawnZ;
  return Math.hypot(dx, dz);
}

function finish(gallery, result) {
  gallery.result = result;
  gallery.phase = 'settled';
  return result;
}

export function judgeGallery(state) {
  const gallery = state && state.orbitalGallery;
  if (!gallery) return null;
  if (gallery.result) return gallery.result;
  const player = state.entities && state.entities.get(state.playerId);
  if (!player || player.alive === false || (Number.isFinite(player.hull) && player.hull <= 0)) {
    return finish(gallery, { won: false, reason: 'hull-lost', tick: state.tick });
  }
  for (const hazard of gallery.hazards || []) {
    const body = entityOf(state, gallery, hazard.role);
    if (body && centerInside(body, hazard)) {
      return finish(gallery, { won: false, reason: 'hazard', hazardId: hazard.id, tick: state.tick });
    }
  }
  for (const role of Object.keys(gallery.spoiled || {})) {
    if (gallery.spoiled[role]) {
      return finish(gallery, { won: false, reason: 'spoiled', role, tick: state.tick });
    }
  }
  for (const pocket of gallery.pockets || []) {
    const body = entityOf(state, gallery, pocket.role);
    if (!body || body.alive === false) continue;
    if (travelOf(body) < pocket.minTravel) continue;
    if (!centerInside(body, pocket)) continue;
    return finish(gallery, {
      won: true,
      reason: 'pocket',
      pocketId: pocket.id,
      role: pocket.role,
      tick: state.tick,
    });
  }
  if (state.tick - (gallery.playStartTick || 0) > gallery.limitTicks) {
    return finish(gallery, { won: false, reason: 'clock', tick: state.tick });
  }
  return null;
}

export function noteImpact(state, payload) {
  const gallery = state && state.orbitalGallery;
  if (!gallery || gallery.phase === 'settled' || !payload) return;
  if (gallery.source === 'live' && !Object.values(gallery.roles || {}).some(
    id => id === payload.aId || id === payload.bId)) return;
  gallery.contacts = (gallery.contacts || 0) + 1;
  const playerId = state.playerId;
  const otherId = payload.aId === playerId ? payload.bId : payload.bId === playerId ? payload.aId : null;
  if (otherId != null) {
    const other = state.entities.get(otherId);
    const role = other && other.data && other.data.galleryRole;
    if (role) {
      if (!gallery.playerContactRoles) gallery.playerContactRoles = Object.create(null);
      gallery.playerContactRoles[role] = (gallery.playerContactRoles[role] || 0) + 1;
      if (gallery.approachSide == null && other.pos && state.entities.get(playerId)) {
        const player = state.entities.get(playerId);
        const dz = player.pos.z - other.pos.z;
        gallery.approachSide = dz > 2 ? 1 : dz < -2 ? -1 : 0;
      }
    }
  }
  const closing = Number(payload.preSolveClosingSpeed);
  if (!(closing > 0) || !gallery.spoils) return;
  for (const spoil of gallery.spoils) {
    const body = entityOf(state, gallery, spoil.role);
    if (!body) continue;
    if (payload.aId !== body.id && payload.bId !== body.id) continue;
    if (closing >= spoil.closingSpeed) gallery.spoiled[spoil.role] = true;
  }
}

export function signatureOf(gallery, result) {
  const roles = gallery && gallery.playerContactRoles ? Object.keys(gallery.playerContactRoles).sort() : [];
  return {
    pocketId: result && result.pocketId || null,
    approachSide: gallery ? gallery.approachSide ?? null : null,
    cut: !!(gallery && gallery.cuts),
    boost: !!(gallery && gallery.boostTicks),
    contacted: roles.join('+'),
  };
}
