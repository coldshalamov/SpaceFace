// Offline semantic tags for chase-camera flight products. Cookers omit
// hangar-only and interior-only geometry from the live fly mesh.

export const FLIGHT_PRODUCT_TAG = Object.freeze({
  FLIGHT_EXTERIOR: 'FLIGHT_EXTERIOR',
  HANGAR_ONLY: 'HANGAR_ONLY',
  INTERIOR_ONLY: 'INTERIOR_ONLY',
  ATTACHMENT_CAP: 'ATTACHMENT_CAP',
  COLLISION_ONLY: 'COLLISION_ONLY',
  SOCKET_MARKER: 'SOCKET_MARKER',
  CLOSE_DETAIL: 'CLOSE_DETAIL',
  TUMBLE_SILHOUETTE: 'TUMBLE_SILHOUETTE',
});

const CHASE_INCLUDE = new Set([
  FLIGHT_PRODUCT_TAG.FLIGHT_EXTERIOR,
  FLIGHT_PRODUCT_TAG.TUMBLE_SILHOUETTE,
  FLIGHT_PRODUCT_TAG.COLLISION_ONLY,
  FLIGHT_PRODUCT_TAG.SOCKET_MARKER,
  FLIGHT_PRODUCT_TAG.CLOSE_DETAIL,
]);

const CHASE_OMIT = new Set([
  FLIGHT_PRODUCT_TAG.HANGAR_ONLY,
  FLIGHT_PRODUCT_TAG.INTERIOR_ONLY,
  FLIGHT_PRODUCT_TAG.ATTACHMENT_CAP,
]);

export function flightProductKeepsTag(tag, cameraKind = 'chase') {
  if (cameraKind !== 'chase') return true;
  if (CHASE_OMIT.has(tag)) return false;
  if (CHASE_INCLUDE.has(tag)) return true;
  return false;
}

export function selectFlightProductNodes(nodes, cameraKind = 'chase') {
  const list = Array.isArray(nodes) ? nodes : [];
  return list.filter((node) => {
    const tags = Array.isArray(node && node.tags) ? node.tags : [];
    if (tags.length === 0) return true;
    if (tags.every((tag) => CHASE_OMIT.has(tag))) return false;
    return tags.some((tag) => flightProductKeepsTag(tag, cameraKind));
  });
}
