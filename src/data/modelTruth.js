// The one reader. Measurements live in modelTruthCensus.json, written only by
// scripts/model-truth-census.mjs. Sim, camera, weapons, and labels import this module.

import census from './modelTruthCensus.json' with { type: 'json' };
import {
  CAMERA_NEAR_MARGIN_WU,
  colliderRadiusAt,
  flightPlaneToleranceWu,
  scaleProxyPrimitives,
  skinContains,
  throatOpen,
} from './modelTruthMath.js';
import {
  boltRadiusFromPlanar,
  fittedSocketLocal,
  hitVolumeFromRow,
  measuredHardpointFromRow,
  mineSensorRadiusFromPlanar,
  mountFractionsFromRow,
  nozzleWorldFromRow,
  placeDrawScaleFromRow,
  plumeWorldFromRow,
  ropeEndFromRow,
  shotWorldFromRow,
  socketWorldFromRow,
  unmeasuredHitVolumeIds,
  weaponSocketNameForSlot,
} from './modelTruthMounts.js';

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
  // Primitives are stored in units of the census reference (1 = dockRadius or entity.radius).
  // World size is that fraction times the live reference, not the fraction itself.
  const reference = row.gameplay && row.gameplay.dockRadius
    ? Number(data.dockRadius) || row.gameplay.dockRadius
    : Number(entity && entity.radius) || (row.gameplay && row.gameplay.entityRadius) || skinReference(row);
  const local = scaleProxyPrimitives(skin.primitives, Math.max(1e-6, reference));
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

/** Planar keep-out radius of the measured skin, in world units. Gameplay entity.radius is unchanged. */
export function modelTruthPlanarRadius(entity) {
  const row = (entity && entity.type === 'station' ? stationRow(entity) : null) || modelTruthRowForEntity(entity);
  const gameplay = Number(entity && entity.radius) || 0;
  if (!row || !row.proposedSkin || row.proposedSkin.adopted !== true) return gameplay;
  const silhouette = Number(row.shell && row.shell.silhouetteRadius) || 0;
  const reference = skinReference(row);
  if (!(silhouette > 0) || !(reference > 0)) return gameplay;
  const data = entity && entity.data || {};
  const live = row.gameplay && row.gameplay.dockRadius
    ? Number(data.dockRadius) || row.gameplay.dockRadius
    : Number(entity && entity.radius) || (row.gameplay && row.gameplay.entityRadius) || reference;
  return silhouette * (live / reference);
}

/**
 * Slide a point out of every measured skin, radially, until it sits `margin` outside.
 * Small bodies are ignored: only a shell wide enough to swallow the camera participates.
 */
export function modelTruthSlideOutside(entities, x, z, margin = CAMERA_NEAR_MARGIN_WU) {
  let px = Number(x) || 0;
  let pz = Number(z) || 0;
  const list = entities || [];
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (const entity of list) {
      if (!entity || !entity.pos || entity.collides === false) continue;
      const primitives = modelTruthSkinPrimitives(entity);
      if (!primitives || !primitives.length) continue;
      const planar = modelTruthPlanarRadius(entity);
      const span = planar * 2;
      if (span < 120 || span > 14000) continue;
      const ex = Number(entity.pos.x) || 0;
      const ez = Number(entity.pos.z) || 0;
      const dx = px - ex;
      const dz = pz - ez;
      const dist = Math.hypot(dx, dz);
      const angle = dist > 1e-6 ? Math.atan2(dz, dx) : 0;
      const local = primitives.map((primitive) => {
        if (primitive.kind === 'circle') return { ...primitive, x: primitive.x - ex, z: primitive.z - ez };
        if (primitive.kind === 'capsule') {
          return {
            ...primitive,
            ax: primitive.ax - ex,
            az: primitive.az - ez,
            bx: primitive.bx - ex,
            bz: primitive.bz - ez,
          };
        }
        return { ...primitive, x: primitive.x - ex, z: primitive.z - ez };
      });
      const outer = colliderRadiusAt(angle, local, Math.max(planar, 1));
      const target = outer + margin;
      if (dist >= target - 1e-3) continue;
      if (dist <= 1e-6) {
        px = ex + target;
        pz = ez;
      } else {
        px = ex + (dx / dist) * target;
        pz = ez + (dz / dist) * target;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

/** Move later solids until their planar skins no longer overlap. Counts stay the same. */
export function separateSkinOverlaps(entities) {
  const list = (entities || []).filter((entity) => entity && entity.pos && entity.alive !== false && entity.collides !== false);
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const need = modelTruthPlanarRadius(a) + modelTruthPlanarRadius(b);
        if (dist >= need - 0.05) continue;
        const gap = need - dist + 0.5;
        const ux = dist > 1e-4 ? dx / dist : 1;
        const uz = dist > 1e-4 ? dz / dist : 0;
        b.pos.x += ux * gap;
        b.pos.z += uz * gap;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return list;
}

function rowFor(entityOrId) {
  if (typeof entityOrId === 'string') return modelTruthRow(entityOrId);
  return modelTruthRowForEntity(entityOrId);
}

export function modelTruthSocketWorld(entity, socketName) {
  const row = rowFor(entity);
  if (!row) return null;
  return socketWorldFromRow(row, entity, socketName);
}

export function modelTruthShotOrigin(entity, weapon) {
  const row = rowFor(entity);
  if (!row) return null;
  const slot = weapon && Number.isFinite(weapon.slotIndex) ? weapon.slotIndex : 0;
  return shotWorldFromRow(row, entity, slot);
}

export function modelTruthFlashOrigin(entity, weapon) {
  return modelTruthShotOrigin(entity, weapon);
}

export function modelTruthPlumeOrigin(entity) {
  const row = rowFor(entity);
  return row ? plumeWorldFromRow(row, entity) : null;
}

export function modelTruthNozzleOrigin(entity) {
  const row = rowFor(entity);
  return row ? nozzleWorldFromRow(row, entity) : null;
}

export function modelTruthRopeEnd(entity) {
  const row = rowFor(entity);
  if (!row) return null;
  return ropeEndFromRow(row, entity);
}

export function modelTruthMeasuredHardpoint(entity) {
  const row = rowFor(entity);
  if (!row) return null;
  return measuredHardpointFromRow(row, entity);
}

export function modelTruthMountFractions(defId, prefix) {
  const row = modelTruthRow(defId);
  if (!row) return [];
  return mountFractionsFromRow(row, prefix);
}

export function modelTruthHitVolume(entity, subsystemId) {
  const row = rowFor(entity);
  if (!row) return null;
  return hitVolumeFromRow(row, entity, subsystemId);
}

export function modelTruthUnmeasuredHitVolumes(entityOrId) {
  const row = rowFor(entityOrId);
  return row ? unmeasuredHitVolumeIds(row) : [];
}

export function modelTruthBoltRadius(entity) {
  return boltRadiusFromPlanar(modelTruthPlanarRadius(entity));
}

export function modelTruthMineSensorRadius(entity) {
  return mineSensorRadiusFromPlanar(modelTruthPlanarRadius(entity));
}

export function modelTruthPlaceDrawScale(entity) {
  const row = rowFor(entity);
  return placeDrawScaleFromRow(row, entity);
}

/** World nameplates and map pips share the measured planar size. Deckplate titles do not. */
export function modelTruthNameplateHeight(entity) {
  return Math.max(1.5, modelTruthPlanarRadius(entity) * 0.15);
}

export function modelTruthPipRadius(entity) {
  return Math.max(1.2, modelTruthPlanarRadius(entity) * 0.08);
}

export function modelTruthWeaponSocketName(entity, weapon) {
  const row = rowFor(entity);
  if (!row) return null;
  const slot = weapon && Number.isFinite(weapon.slotIndex) ? weapon.slotIndex : 0;
  return weaponSocketNameForSlot(row, slot);
}

export { flightPlaneToleranceWu, CAMERA_NEAR_MARGIN_WU, fittedSocketLocal };
