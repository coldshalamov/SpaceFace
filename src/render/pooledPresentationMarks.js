// Pooled presentation meshes and shared textures. No Three.js import: tests
// can pin the identity rules without booting a renderer.
// A mesh keeps impact marks only for the entity it is bound to right now.
// A shared texture is disposed only after its last consumer leaves, and only
// when that texture was marked safe to evict. The foundry IBL is not one of
// these consumers; the renderer skips it before calling in.

export function clearPooledTransientMarks(mesh, nextEntityId) {
  if (!mesh || typeof mesh !== 'object') return false;
  const userData = mesh.userData || (mesh.userData = {});
  if (userData.sfBoundEntityId === nextEntityId) return false;
  delete userData.impactMarks;
  delete userData.graffitiLine;
  delete userData.heatScorch;
  userData.sfBoundEntityId = nextEntityId;
  return true;
}

export function noteSharedTextureConsumer(texture, consumerId) {
  if (!texture || typeof texture !== 'object' || consumerId == null) return false;
  const userData = texture.userData || (texture.userData = {});
  if (!(userData.sfConsumers instanceof Set)) userData.sfConsumers = new Set();
  userData.sfConsumers.add(consumerId);
  return true;
}

/** Dispose only when the last consumer leaves a texture flagged for eviction. */
export function releaseSharedTextureConsumer(texture, consumerId) {
  if (!texture || typeof texture !== 'object' || consumerId == null) return false;
  const userData = texture.userData;
  const consumers = userData && userData.sfConsumers;
  if (!(consumers instanceof Set) || !consumers.has(consumerId)) return false;
  consumers.delete(consumerId);
  if (consumers.size > 0) return false;
  if (userData.sfEvictWhenEmpty !== true) return false;
  if (typeof texture.dispose === 'function') texture.dispose();
  return true;
}
