// Offline semantic tags for flight products. Cookers omit non-flight geometry
// from the live fly mesh while retaining its semantic record for station and
// hangar consumers.

export const FLIGHT_PRODUCT_TAG = Object.freeze({
  FLIGHT_EXTERIOR: 'FLIGHT_EXTERIOR',
  HANGAR_ONLY: 'HANGAR_ONLY',
  INTERIOR_ONLY: 'INTERIOR_ONLY',
  ATTACHMENT_CAP: 'ATTACHMENT_CAP',
  COLLISION_ONLY: 'COLLISION_ONLY',
  SOCKET_MARKER: 'SOCKET_MARKER',
  CLOSE_DETAIL: 'CLOSE_DETAIL',
  TUMBLE_SILHOUETTE: 'TUMBLE_SILHOUETTE',
  HIDDEN: 'HIDDEN',
});

const FLIGHT_INCLUDE = new Set([
  FLIGHT_PRODUCT_TAG.FLIGHT_EXTERIOR,
  FLIGHT_PRODUCT_TAG.TUMBLE_SILHOUETTE,
  FLIGHT_PRODUCT_TAG.COLLISION_ONLY,
  FLIGHT_PRODUCT_TAG.SOCKET_MARKER,
  FLIGHT_PRODUCT_TAG.CLOSE_DETAIL,
]);

const FLIGHT_OMIT = new Set([
  FLIGHT_PRODUCT_TAG.HANGAR_ONLY,
  FLIGHT_PRODUCT_TAG.INTERIOR_ONLY,
  FLIGHT_PRODUCT_TAG.ATTACHMENT_CAP,
  FLIGHT_PRODUCT_TAG.HIDDEN,
]);

const CAMERA_POLICIES = Object.freeze({
  chase: Object.freeze({ include: FLIGHT_INCLUDE, omit: FLIGHT_OMIT }),
  tumble: Object.freeze({ include: FLIGHT_INCLUDE, omit: FLIGHT_OMIT }),
  // Cockpit is a supported close camera, but hidden/non-flight geometry is
  // still not part of the flight product. Interior nodes are retained here
  // only when explicitly authored for the cockpit route.
  cockpit: Object.freeze({
    include: new Set([...FLIGHT_INCLUDE, FLIGHT_PRODUCT_TAG.INTERIOR_ONLY]),
    omit: new Set([
      FLIGHT_PRODUCT_TAG.HANGAR_ONLY,
      FLIGHT_PRODUCT_TAG.ATTACHMENT_CAP,
      FLIGHT_PRODUCT_TAG.HIDDEN,
    ]),
  }),
});

function policyFor(cameraKind) {
  return CAMERA_POLICIES[String(cameraKind || 'chase')] || CAMERA_POLICIES.chase;
}

export function flightProductKeepsTag(tag, cameraKind = 'chase') {
  const policy = policyFor(cameraKind);
  if (policy.omit.has(tag)) return false;
  if (policy.include.has(tag)) return true;
  // Unknown semantic tags are not allowed to become geometry in a supported
  // flight camera. Untagged nodes are handled by selectFlightProductNodes.
  return false;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string' && tags) return [tags];
  if (!tags || typeof tags !== 'object') return [];
  const out = [];
  for (const [key, value] of Object.entries(tags)) {
    if (value !== true) continue;
    const normalized = String(key).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(FLIGHT_PRODUCT_TAG, normalized)) {
      out.push(FLIGHT_PRODUCT_TAG[normalized]);
    }
  }
  return out;
}

export function selectFlightProductNodes(nodes, cameraKind = 'chase') {
  const list = Array.isArray(nodes) ? nodes : [];
  const policy = policyFor(cameraKind);
  return list.filter((node) => {
    const tags = normalizeTags(node && node.tags);
    if (tags.length === 0) return true;
    // An explicit non-flight tag always wins over a broad exterior tag. This
    // prevents a node marked both HANGAR_ONLY and FLIGHT_EXTERIOR from leaking
    // into the chase product.
    if (tags.some((tag) => policy.omit.has(tag))) return false;
    // Unknown tags are metadata from a newer/other cooker. Preserve that geometry until the
    // supported-camera policy explicitly classifies it; a missing registry entry must not become
    // a player-visible art deletion.
    return tags.some((tag) => policy.include.has(tag))
      || !tags.some((tag) => policy.include.has(tag) || policy.omit.has(tag));
  });
}

export function normalizeFlightProductTags(tags) {
  return Object.freeze(normalizeTags(tags));
}

export function supportedFlightProductCamera(cameraKind) {
  return Object.prototype.hasOwnProperty.call(CAMERA_POLICIES, String(cameraKind || 'chase'));
}
