// Files below assets/ships/parts can include authoring exports and visual-review candidates.
// Only published source GLBs belong to the parts-manifest declaration inventory.

const NON_PUBLISHED_SEGMENTS = new Set([
  'blender',
  'evidence',
  'revamp-evidence',
]);

export function isPublishedPartsSourceFile(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.endsWith('.glb')) return false;
  const segments = relativePath.replaceAll('\\', '/').split('/').filter(Boolean);
  return segments.length > 0 && !segments.some((segment) => NON_PUBLISHED_SEGMENTS.has(segment));
}
