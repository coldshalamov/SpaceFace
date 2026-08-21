// Chase-camera cooker. Drops hangar-only, interior-only, and buried attachment
// nodes from a flight product. Untagged nodes stay (existing art has no tags).

import { selectFlightProductNodes } from '../contracts/flightProductTags.js';

export function cookFlightProduct(root, cameraKind = 'chase') {
  if (!root || typeof root.traverse !== 'function') return { root, removed: 0 };
  const drop = [];
  root.traverse((node) => {
    if (!node || node === root) return;
    const tags = node.userData && node.userData.flightProductTags;
    if (!Array.isArray(tags) || tags.length === 0) return;
    if (selectFlightProductNodes([{ id: node.name, tags }], cameraKind).length === 0) {
      drop.push(node);
    }
  });
  for (let i = 0; i < drop.length; i++) {
    const node = drop[i];
    if (node && node.parent && typeof node.parent.remove === 'function') node.parent.remove(node);
  }
  return { root, removed: drop.length };
}
