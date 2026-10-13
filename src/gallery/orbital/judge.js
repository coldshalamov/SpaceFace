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

export function kernelFieldRecord(fieldsSys, id) {
  if (!fieldsSys || id == null || typeof fieldsSys.hasExternal !== 'function') return null;
  if (!fieldsSys.hasExternal(id)) return null;
  const list = typeof fieldsSys.kernelList === 'function' ? fieldsSys.kernelList() : null;
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const field = list[i];
    if (field && field.id === id) return field;
  }
  return null;
}

function liveKernelField(gallery, id) {
  if (!gallery || typeof gallery.fieldRecord !== 'function') return null;
  const record = gallery.fieldRecord(id);
  const center = record && record.center;
  if (!record || !(record.radius > 0) || !center) return null;
  if (!Number.isFinite(center.x) || !Number.isFinite(center.z)) return null;
  return record;
}

function fieldCenter(record) {
  if (!record) return null;
  if (record.center && Number.isFinite(record.center.x) && Number.isFinite(record.center.z)) return record.center;
  if (Number.isFinite(record.x) && Number.isFinite(record.z)) return record;
  return null;
}

function matchesAuthoredField(record, authored, origin) {
  const center = fieldCenter(record);
  if (!center || !authored) return false;
  const ox = origin && origin.x || 0;
  const oz = origin && origin.z || 0;
  return center.x === authored.x + ox
    && center.z === authored.z + oz
    && record.radius === authored.radius
    && record.strength === authored.strength;
}

function markFieldUse(state, gallery) {
  if (!gallery || !state.entities) return;
  const authored = getScenario(gallery.scenarioId);
  const needed = (authored && authored.fields) || [];
  if (!needed.length) return;
  const origin = gallery.fieldOrigin;
  const roles = gallery.roles || {};
  let matches = true;
  let overlapped = false;
  for (const field of needed) {
    const live = liveKernelField(gallery, field.id);
    if (!matchesAuthoredField(live, field, origin)) {
      matches = false;
      continue;
    }
    for (const role of Object.keys(roles)) {
      const entity = state.entities.get(roles[role]);
      if (!entity || !entity.pos) continue;
      const dx = entity.pos.x - live.center.x;
      const dz = entity.pos.z - live.center.z;
      if (dx * dx + dz * dz <= live.radius * live.radius) {
        overlapped = true;
        break;
      }
    }
  }
  if (!matches) {
    gallery.fieldUsed = false;
    return;
  }
  if (overlapped) gallery.fieldUsed = true;
}

export function galleryMotorOf(entity) {
  if (!entity || entity.alive === false || !entity.data) return null;
  const motor = entity.data.galleryMotor;
  if (!motor || typeof motor !== 'object') return null;
  return motor;
}

const MOTOR_APPLIED = Symbol('galleryMotorApplied');

/** Accel the live driver applies this step, or null inside the cruise band. */
export function galleryMotorPlan(entity, motor, simTime, dt) {
  if (!entity || !motor || !(dt > 0)) return null;
  let sign = 1;
  if (motor.periodS > 0) {
    const phase = (simTime || 0) + (motor.phaseS || 0);
    const half = motor.periodS * 0.5;
    sign = Math.floor(phase / Math.max(half, 1e-4)) % 2 === 0 ? 1 : -1;
  }
  const heading = motor.heading || 0;
  const hx = Math.cos(heading) * sign;
  const hz = Math.sin(heading) * sign;
  const along = (entity.vel ? entity.vel.x : 0) * hx + (entity.vel ? entity.vel.z : 0) * hz;
  const err = motor.cruise - along;
  if (Math.abs(err) < 0.05) return null;
  const accelCap = motor.accel > 0 ? motor.accel : 60;
  const accel = Math.max(-accelCap, Math.min(accelCap, err / dt));
  if (!accel) return null;
  return { hx, hz, accel };
}

export function markMotorWorked(entity, motor, tick) {
  entity.data.galleryMotorWorked = { motor, tick, [MOTOR_APPLIED]: true };
}

export function motorWorkedThisTick(entity, motor, tick) {
  const worked = entity && entity.data && entity.data.galleryMotorWorked;
  return !!(worked && worked[MOTOR_APPLIED] === true && worked.motor === motor && worked.tick === tick);
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
  const origin = gallery.fieldOrigin;
  for (const field of needed) {
    const row = planted.find((item) => item && item.id === field.id);
    if (!row || !matchesAuthoredField(row, field, origin)) return false;
    if (!matchesAuthoredField(liveKernelField(gallery, field.id), field, origin)) return false;
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
      && row.ownerId === owner.id && row.targetId === target.id
      && row.restLength === line.restLength);
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
    const motor = galleryMotorOf(entity);
    if (!motor || !sameMotor(motor, body.motor) || !motorWorkedThisTick(entity, motor, state.tick)) return false;
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
    return assetForKind(asset.fracture && asset.fracture.into);
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
