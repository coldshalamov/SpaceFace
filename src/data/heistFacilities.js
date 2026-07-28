// PQ-019A facility embodiment data. These are ordinary Atlas POIs whose physical
// representation is delegated to the heistFacilities system. The data module is
// intentionally side-effect free: it owns identities and authored transforms only.

import {
  worldSiteAssetBinding,
  worldSiteSocketTransform,
} from './worldSiteAssetBindings.js';

export const PQ019_HEIST_SECTOR_ID = 'sector_tethys_junction';
export const PQ019_FACILITY_RUNTIME_OWNER = 'heistFacilities';
export const PQ019_FACILITY_SOCKET = 'SOCKET_Dock_Approach';

function freezeFacility({
  id,
  role,
  name,
  type,
  factionId,
  localPos,
  rot,
  placeId,
  placeScale,
  headRadius,
}) {
  return Object.freeze({
    id,
    role,
    name,
    type,
    factionId,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    rot,
    placeId,
    placeScale,
    headRadius,
    socketName: PQ019_FACILITY_SOCKET,
    sectorId: PQ019_HEIST_SECTOR_ID,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  });
}

export const PQ019_FACILITIES = Object.freeze({
  heist_launcher: freezeFacility({
    id: 'heist_launcher',
    role: 'heist_launcher',
    name: 'Tethys Surface Launcher',
    type: 'beacon',
    factionId: 'faction_mts',
    localPos: { x: 1515, z: -2012 },
    rot: 2.7719083647944918,
    placeId: 'place_claim_outpost_relay',
    placeScale: 0.14,
    headRadius: 8,
  }),
  lawful_catcher: freezeFacility({
    id: 'lawful_catcher',
    role: 'lawful_catcher',
    name: 'Concord Lawful Catcher',
    type: 'beacon',
    factionId: 'faction_scn',
    localPos: { x: -400, z: -1270 },
    rot: 5.913501018384284,
    placeId: 'place_claim_outpost_base',
    placeScale: 0.16,
    headRadius: 12,
  }),
  fence_receiver: freezeFacility({
    id: 'fence_receiver',
    role: 'fence_receiver',
    name: 'Quiet Fence Receiver',
    type: 'cache',
    factionId: 'faction_quiet',
    localPos: { x: -1320, z: 420 },
    rot: -1.0722791362393007,
    placeId: 'place_claim_outpost_refinery',
    placeScale: 0.20,
    headRadius: 12,
  }),
});

export const PQ019_CAPSULE = Object.freeze({
  stableId: 'cargo_capsule',
  radius: 6,
  mass: 180,
  hull: 160,
  authoredPayloadAssetId: 'pod_cargo_container',
  legalOwnerFactionId: 'faction_mts',
  ownerId: 'facility:heist_launcher',
  launchSpeed: 120,
});

export const PQ019_FACILITY_POIS = Object.freeze(
  Object.values(PQ019_FACILITIES).map((facility) => Object.freeze({
    id: facility.id,
    type: facility.type,
    name: facility.name,
    factionId: facility.factionId,
    hidden: false,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  })),
);

export const PQ019_FACILITY_ANCHORS = Object.freeze(
  Object.values(PQ019_FACILITIES).map((facility) => Object.freeze({
    id: facility.id,
    pos: facility.localPos,
    position: facility.localPos,
    rot: facility.rot,
    landmarkGlb: facility.placeId,
    landmark: true,
    placeScale: facility.placeScale,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  })),
);

/**
 * Append the catalog identities before sectorAnchors overlays authored positions.
 * Existing identities always win so applying this helper twice stays idempotent.
 */
export function appendPq019FacilityPois(sector) {
  if (!sector || sector.id !== PQ019_HEIST_SECTOR_ID) return sector;
  const existing = new Set((sector.pois || []).map((poi) => poi.id));
  const additions = PQ019_FACILITY_POIS.filter((poi) => !existing.has(poi.id));
  if (additions.length === 0) return sector;
  return { ...sector, pois: [...(sector.pois || []), ...additions] };
}

/**
 * Project the immutable authored dock-approach socket into sector-local XZ.
 */
export function projectPq019FacilitySocket(facility) {
  if (!facility || !facility.localPos) {
    throw new TypeError('PQ-019 facility requires an authored local position');
  }
  const transform = worldSiteSocketTransform(facility.placeId, facility.socketName);
  const binding = worldSiteAssetBinding(facility.placeId);
  const center = binding?.visualCenterXZ;
  if (!transform || !center) {
    throw new Error(`Missing ${facility.socketName} for ${facility.placeId}`);
  }
  const [socketX, , socketZ] = transform.translation;
  const scale = Number(facility.placeScale);
  const rot = Number(facility.rot);
  if (![socketX, socketZ, scale, rot].every(Number.isFinite)) {
    throw new TypeError(`Invalid authored socket transform for ${facility.id}`);
  }
  // Authored place presentation recenters the GLB around visualCenterXZ. Physical
  // socket heads must subtract that same center before scale + yaw projection.
  const x = (socketX - center.x) * scale;
  const z = (socketZ - center.z) * scale;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: facility.localPos.x + x * cos - z * sin,
    z: facility.localPos.z + x * sin + z * cos,
  };
}

export default PQ019_FACILITIES;
