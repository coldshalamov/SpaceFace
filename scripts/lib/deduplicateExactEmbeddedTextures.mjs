import { createHash } from 'node:crypto';

/**
 * Intern duplicate embedded images only when their texture metadata is identical.
 * Per-use sampler, UV, and KHR_texture_transform settings live on TextureInfo and are
 * intentionally left on their material slots when the texture references are swapped.
 */
export function deduplicateExactEmbeddedTextures(document) {
  const textures = document.getRoot().listTextures();
  const candidatesByHash = new Map();
  const duplicates = [];

  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) continue;
    const hash = createHash('sha256').update(image).digest('hex');
    const candidates = candidatesByHash.get(hash) || [];
    const size = texture.getSize();
    const duplicate = candidates.find((candidate) => {
      const candidateSize = candidate.getSize();
      return texture.getMimeType() === candidate.getMimeType()
        && texture.getName() === candidate.getName()
        && size && candidateSize
        && size[0] === candidateSize[0]
        && size[1] === candidateSize[1]
        && Buffer.from(image).equals(Buffer.from(candidate.getImage()))
        // Compare every authored texture property except bytes already compared above.
        && texture.equals(candidate, new Set(['image']));
    });
    if (duplicate) duplicates.push([texture, duplicate]);
    else {
      candidates.push(texture);
      candidatesByHash.set(hash, candidates);
    }
  }

  for (const [source, target] of duplicates) {
    source.listParents().forEach((parent) => {
      if (parent !== document.getRoot()) parent.swap(source, target);
    });
    source.dispose();
  }
}
