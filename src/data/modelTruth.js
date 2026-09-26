// The one reader. Measurements live in modelTruthCensus.json, written only by
// scripts/model-truth-census.mjs. Sim, camera, weapons, and labels import this module.

import census from './modelTruthCensus.json' with { type: 'json' };
import {
  CAMERA_NEAR_MARGIN_WU,
  flightPlaneToleranceWu,
  scaleProxyPrimitives,
  skinContains,
  throatOpen,
} from './modelTruthMath.js';

const ROWS = Array.isArray(census.rows) ? census.rows : [];
const BY_ID = new Map(ROWS.map((row) => [row.id, row]));

export function modelTruthCensus() {
  return census;
}

export function modelTruthRows() {
  return ROWS;
}

export function modelTruthRow(id) {
  return BY_ID.get(id) || null;
}

export function modelTruthRowForEntity(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const keys = [
    data.defId,
    data.placeId,
    data.archetypeGlb,
    data.typeId,
    data.lootTableId,
    entity.id,
  ];
  for (const key of keys) {
    if (key && BY_ID.has(key)) return BY_ID.get(key);
  }
  if (data.trafficRole && BY_ID.has(`traffic:${data.trafficRole}`)) {
    return BY_ID.get(`traffic:${data.trafficRole}`);
  }
  if (data.isGate || data.isWormhole) return BY_ID.get('place_gate_jump_ring');
  return null;
}

/** World-space primitives for the measured skin, or null when the row has no skin yet. */
export function modelTruthSkinPrimitives(entity) {
  const row = modelTruthRowForEntity(entity);
  const skin = row && row.proposedSkin;
  if (!skin || !skin.primitives || !skin.primitives.length) return null;
  const data = entity && entity.data || {};
  const reference = row.gameplay && row.gameplay.dockRadius
    ? Number(data.dockRadius) || row.gameplay.dockRadius
    : Number(entity && entity.radius) || (row.gameplay && row.gameplay.entityRadius) || 1;
  const local = scaleProxyPrimitives(skin.primitives, reference / Math.max(1e-6, skinReference(row)));
  const rot = Number(entity && entity.rot) || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const px = entity && entity.pos ? Number(entity.pos.x) || 0 : 0;
  const pz = entity && entity.pos ? Number(entity.pos.z) || 0 : 0;
  return local.map((primitive) => {
    if (primitive.kind === 'circle') {
      return { ...primitive, x: px + c * primitive.x - s * primitive.z, z: pz + s * primitive.x + c * primitive.z };
    }
    if (primitive.kind === 'capsule') {
      return {
        ...primitive,
        ax: px + c * primitive.ax - s * primitive.az,
        az: pz + s * primitive.ax + c * primitive.az,
        bx: px + c * primitive.bx - s * primitive.bz,
        bz: pz + s * primitive.bx + c * primitive.bz,
      };
    }
    return {
      ...primitive,
      x: px + c * primitive.x - s * primitive.z,
      z: pz + s * primitive.x + c * primitive.z,
      rot: (primitive.rot || 0) + rot,
    };
  });
}

function skinReference(row) {
  if (row.gameplay && row.gameplay.dockRadius) return row.gameplay.dockRadius;
  if (row.gameplay && row.gameplay.entityRadius) return row.gameplay.entityRadius;
  return row.shell && row.shell.silhouetteRadius || 1;
}

export function modelTruthContains(entity, x, z) {
  const primitives = modelTruthSkinPrimitives(entity);
  if (!primitives) return false;
  return skinContains(x, z, primitives);
}

export function modelTruthProxyManifest(entity) {
  const row = stationRow(entity) || modelTruthRowForEntity(entity);
  const skin = row && row.proposedSkin;
  if (!row || !skin || skin.adopted !== true || !skin.primitives || !skin.primitives.length) return null;
  const dock = row.family === 'station' || row.family === 'gate';
  return {
    schemaVersion: 1,
    id: `skin:${row.id}`,
    stationIds: row.id === 'place_station_trade_hub' ? ['station_helios'] : [],
    flags: { collides: true, renderable: false, targetable: false, radarVisible: false },
    referenceRadius: dock ? 'dockRadius' : 'radius',
    primitives: skin.primitives,
    opening: row.opening || null,
    mouthBearingDeg: skin.mouthBearingDeg,
    sourceRow: row.id,
  };
}

function stationRow(entity) {
  if (!entity || entity.type !== 'station') return null;
  const data = entity.data || {};
  if (data.isGate === true || data.isWormhole === true || data.collisionProxy === 'gate_jump_ring') {
    return modelTruthRow('place_gate_jump_ring');
  }
  const token = String(data.archetypeGlb || data.stationTypeId || data.placeId || '');
  if (!token) return modelTruthRow('place_station_trade_hub');
  if (BY_ID.has(token)) return BY_ID.get(token);
  const prefixed = `place_station_${token}`;
  if (BY_ID.has(prefixed)) return BY_ID.get(prefixed);
  return modelTruthRow('place_station_trade_hub');
}

export function modelTruthCameraMarginWu() {
  return CAMERA_NEAR_MARGIN_WU;
}

export function modelTruthFlightTolerance(entity) {
  const row = modelTruthRowForEntity(entity);
  const radius = row && row.shell ? row.shell.silhouetteRadius : Number(entity && entity.radius) || 0;
  return flightPlaneToleranceWu(radius);
}

export function modelTruthThroatOpen(entity) {
  const primitives = modelTruthSkinPrimitives({ ...entity, pos: { x: 0, z: 0 }, rot: 0 });
  if (!primitives) return true;
  const row = modelTruthRowForEntity(entity);
  const half = row && row.shell ? row.shell.silhouetteRadius * 0.2 : 4;
  return throatOpen(primitives, half);
}

export { flightPlaneToleranceWu, CAMERA_NEAR_MARGIN_WU };
