// Win and fail from physical state after the authoritative step.
// A body that never left its spawn cannot satisfy a pocket.
// Authored fields, tethers, motors, and named props are part of the win:
// a pocket reached without the catalog mechanism does not count.

import { assetForKind } from './assets.js';
import { getScenario } from './catalog.js';

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
  markFieldUse(state, gallery);
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
    if (!mechanismsReady(state, gallery)) continue;
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

function markFieldUse(state, gallery) {
  if (!gallery || gallery.fieldUsed) return;
  const fields = gallery.plantedFields || [];
  if (!fields.length || !state.entities) return;
  const roles = gallery.roles || {};
  for (const role of Object.keys(roles)) {
    const entity = state.entities.get(roles[role]);
    if (!entity || !entity.pos) continue;
    for (const field of fields) {
      const dx = entity.pos.x - field.x;
      const dz = entity.pos.z - field.z;
      if (dx * dx + dz * dz <= field.radius * field.radius) {
        gallery.fieldUsed = true;
        return;
      }
    }
  }
}

function mechanismsReady(state, gallery) {
  const authored = getScenario(gallery.scenarioId);
  if (!authored) return false;
  if (!fieldsReady(state, gallery, authored)) return false;
  if (!linesReady(state, gallery, authored)) return false;
  if (authored.bodies.some((body) => body.motor) && !motorsWorked(state, gallery, authored)) return false;
  for (const body of authored.bodies) {
    const asset = assetForKind(body.kind || 'mass');
    if (!asset.named) continue;
    const entity = entityOf(state, gallery, body.role);
    if (!propReady(entity, asset)) return false;
  }
  return true;
}

function fieldsReady(state, gallery, authored) {
  const needed = authored.fields || [];
  if (!needed.length) return true;
  const planted = gallery.plantedFields || [];
  for (const field of needed) {
    const row = planted.find((item) => item && item.id === field.id && item.radius > 0);
    if (!row) return false;
  }
  markFieldUse(state, gallery);
  return gallery.fieldUsed === true;
}

function linesReady(state, gallery, authored) {
  const needed = authored.lines || [];
  if (!needed.length) return true;
  if ((gallery.cuts || 0) > 0) return false;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId) return false;
  const active = Object.keys(byId).map((id) => byId[id]).filter((line) => line && line.state === 'active');
  for (const line of needed) {
    const owner = entityOf(state, gallery, line.owner);
    const target = entityOf(state, gallery, line.target);
    if (!owner || !target) return false;
    const found = active.some((row) => row.defId === line.defId
      && row.ownerId === owner.id && row.targetId === target.id);
    if (!found) return false;
  }
  return true;
}

function motorsWorked(state, gallery, authored) {
  let found = false;
  for (const body of authored.bodies) {
    if (!body.motor) continue;
    found = true;
    const entity = entityOf(state, gallery, body.role);
    const data = entity && entity.data;
    if (!data || !sameMotor(data.galleryMotor, body.motor) || !data.galleryMotorWorked) return false;
  }
  return found;
}

function sameMotor(live, authored) {
  if (!live || !authored) return false;
  return live.heading === authored.heading
    && live.cruise === authored.cruise
    && live.accel === authored.accel
    && live.periodS === authored.periodS
    && (live.phaseS || 0) === (authored.phaseS || 0);
}

function propReady(entity, asset) {
  if (!entity || entity.alive === false) return false;
  const worn = entity.data && entity.data.galleryAsset;
  const expected = expectedProp(entity, asset);
  if (!worn || !expected || worn.id !== expected.id) return false;
  return worn === expected;
}

function expectedProp(entity, asset) {
  const data = entity.data || {};
  if (data.galleryFractured || data.fractureInto) {
    const into = data.fractureInto || (asset.fracture && asset.fracture.into);
    return assetForKind(into);
  }
  return asset;
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
  for (const id of [payload.aId, payload.bId]) {
    const body = id != null && state.entities ? state.entities.get(id) : null;
    const bodyRole = body && body.data && body.data.galleryRole;
    const asset = body && body.data && body.data.galleryAsset;
    if (!body || !bodyRole || !asset) continue;
    if (asset.fracture && closing >= asset.fracture.closingSpeed && !body.data.galleryFractured) {
      const into = asset.fracture.into;
      body.data.galleryFractured = true;
      body.data.fractureInto = into;
      body.data.galleryAsset = assetForKind(into);
      body.hull = 0;
    }
  }
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
