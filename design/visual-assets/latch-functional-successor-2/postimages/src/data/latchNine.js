import { readLatchNative } from '../core/latchNineNative.js';
import { machineryHasEffectivePresentation } from '../core/machineryPresentation.js';
// SF20-01 stable identity and release admission. No asset is registered by this file.
// A green census row is a technical geometry/provenance prerequisite, not visual approval.
// Activation is a separate coherent model/spawn/presentation packet, never a data-row side effect.
import { modelTruthRow } from './modelTruth.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

export const LATCH_NINE_PLACE_ID = 'place_latch_nine';
export const LATCH_NINE_PART_ID = 'latch-nine';
export const LATCH_NINE_ROLE = 'latch_nine';
// No accepted authored model exists yet. The accepted model packet must explicitly promote it.
export const LATCH_NINE_RELEASE_PROMOTED = false;

export function resolveLatchNinePresence(state) {
  if (!LATCH_NINE_RELEASE_PROMOTED) return null;
  const presence=latchNinePresenceForAsset(state, modelTruthRow(LATCH_NINE_PLACE_ID));
  return presence && readLatchNative(presence.tender) && machineryHasEffectivePresentation(presence.tender,state) ? presence : null;
}

export function latchNinePresenceForAsset(state, row) {
  // Technical prerequisites only; resolveLatchNinePresence separately enforces release promotion.
  if (!row || row.id !== LATCH_NINE_PLACE_ID || row.source !== 'glb' || row.status !== 'green') return null;
  let tender = null;
  for (const entity of state.entityList || []) {
    if (entity?.data?.role !== LATCH_NINE_ROLE || entity.data.placeId !== LATCH_NINE_PLACE_ID) continue;
    if (state.entities?.get(entity.id) !== entity || !entity.alive || entity.hull <= 0 || entity.data.disabled===true) continue;
    const body = entity.physicsBody;
    if (body?.dynamic !== true || body.sensor === true || entity.collides === false
      || !(body.mass > 0) || !Number.isFinite(body.mass) || !physicsBodyNativeReady(entity)) continue;
    const service = entity.data.latchNineService;
    if (service?.stationId !== 'station_tethys' || service.sectorId !== 'sector_tethys_junction') continue;
    const box = service.box;
    if (!box || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(box[key]))
      || !(box.maxX > box.minX) || !(box.maxZ > box.minZ)) continue;
    // More than one admitted body is ambiguous; fail closed instead of picking a duplicate.
    if (tender) return null;
    tender = entity;
  }
  if (!tender) return null;
  const { box } = tender.data.latchNineService;
  const { x, z } = tender.pos || {};
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { tender, recovering: x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ };
}
