// Submit-side visibility for presentation roots.
//
// The query "hidden" set is already outside the glass plus a short approach
// runway (fast-ship travel, not a 900 WU fake-visible box). Those roots cannot
// change a readable pixel. Anything still in the query — including the middle
// sync band and small-but-authored ships — stays submitted. The inner/middle
// split only changes how often closures run.

export function shouldSubmitEntityMesh(options = {}) {
  // A missing fenced pose is a fail-closed condition for ordinary roots, but the player and
  // renderer-forced roots retain their last safe mesh state until the next completed publication.
  // Hiding one of those roots on a transient publication gap would turn a render-boundary miss
  // into a gameplay-visible disappearance.
  const protectedRoot = isProtectedEntityMesh(options);
  if (options.snapshotMissing === true && !protectedRoot) return false;
  if (protectedRoot) return true;
  if (options.hidden === true) return false;
  const frame = options.activityFrame;
  const entityId = options.entityId;
  if (frame && entityId != null) {
    const glass = frame.renderGlassIds || frame.glassIds;
    const runway = frame.renderRunwayIds || frame.runwayIds;
    const has = (collection) => collection && typeof collection.has === 'function'
      ? collection.has(entityId)
      : Array.isArray(collection) && collection.includes(entityId);
    if (has(glass)) return true;
    // Runway roots remain resident for approach-time warmup but are not submitted
    // until the activity frame promotes them onto the readable glass.
    if (has(runway)) return false;
    if (frame.complete === true) return false;
  }
  const tier = options.presentationTier;
  if (tier === 'R2_METADATA' || tier === 'R3_UNLOADED' || tier === 'R1_RUNWAY') return false;
  return true;
}

export function isProtectedEntityMesh(options = {}) {
  return options.isPlayer === true || options.forceRender === true || options.neverCull === true;
}

export function applyEntityMeshVisibility(mesh, submit) {
  if (!mesh) return false;
  const next = submit !== false;
  if (mesh.visible === next) return false;
  mesh.visible = next;
  return true;
}
