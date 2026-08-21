// Supported-camera cooker. Offline builds drop hangar-only, interior-only, and buried attachment
// nodes; the playable runtime records the same omission metadata without mutating a live authored
// root. Untagged nodes stay (existing art has no tags).

import {
  normalizeFlightProductTags,
  selectFlightProductNodes,
  supportedFlightProductCamera,
} from '../contracts/flightProductTags.js';

function nodeMetadata(node, tags, cameraKind) {
  const source = node && node.userData && (
    node.userData.flightProductMetadata
    || node.userData.flightMetadata
    || node.userData.spacefaceFlightMetadata
  );
  return Object.freeze({
    id: node && node.uuid || node && node.name || null,
    name: node && node.name || '',
    tags: Object.freeze([...tags]),
    cameraKind,
    metadata: source && typeof source === 'object' ? Object.freeze({ ...source }) : null,
  });
}

export function cookFlightProduct(root, cameraKind = 'chase', options = {}) {
  const normalizedCamera = supportedFlightProductCamera(cameraKind) ? cameraKind : 'chase';
  // Offline builds mutate the source root. The playable runtime passes `runtime: true` so a
  // dynamically composed boundary keeps its authored picture and merely records which tagged
  // nodes a supported-camera package would omit. A future flat artifact loader can pass
  // `offline: true`/the default to apply the cooked selection before publication.
  const mutate = options.runtime !== true && options.mutate !== false;
  if (!root || typeof root.traverse !== 'function') {
    return { root, removed: 0, metadata: Object.freeze([]), cameraKind: normalizedCamera };
  }
  const drop = [];
  const metadata = [];
  root.traverse((node) => {
    if (!node || node === root) return;
    const tags = normalizeFlightProductTags(node.userData && (
      node.userData.flightProductTags || node.userData.spacefaceFlightProductTags
      || node.userData.spacefaceTags
    ));
    if (tags.length === 0) return;
    if (selectFlightProductNodes([{ id: node.name, tags }], normalizedCamera).length === 0) {
      metadata.push(nodeMetadata(node, tags, normalizedCamera));
      drop.push(node);
    }
  });
  if (mutate) {
    for (let i = 0; i < drop.length; i++) {
      const node = drop[i];
      if (node && node.parent && typeof node.parent.remove === 'function') node.parent.remove(node);
    }
  }
  const existing = root.userData && root.userData.flightProductMetadata;
  if (root.userData) {
    const retainedMetadata = Array.isArray(existing) ? [...existing] : [];
    for (const entry of metadata) {
      if (!retainedMetadata.some((prior) => prior && prior.id === entry.id
        && prior.cameraKind === entry.cameraKind)) retainedMetadata.push(entry);
    }
    root.userData.flightProductMetadata = Object.freeze([
      ...retainedMetadata,
    ]);
    root.userData.flightProductCamera = normalizedCamera;
  }
  return {
    root,
    removed: mutate ? drop.length : 0,
    omitted: drop.length,
    mutated: mutate,
    metadata: Object.freeze(metadata),
    cameraKind: normalizedCamera,
  };
}
