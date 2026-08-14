// Submit-side visibility for presentation roots.
//
// The query "hidden" set is already outside the on-screen box plus a ~900 WU runway.
// Those roots cannot change a readable pixel, but Three still submitted them whenever
// they sat in the chase-camera frustum. Hide the Object3D; keep posing once on exit
// so a fast crosser re-enters at the right place.

export function shouldSubmitEntityMesh(options = {}) {
  if (options.isPlayer === true) return true;
  if (options.forceRender === true || options.neverCull === true) return true;
  if (options.hidden === true) return false;
  // Middle band is the off-screen 900 WU runway. Pose it so crossers enter cleanly, but do
  // not submit unless it still casts a realtime shadow into the picture.
  if (options.middleBand === true && options.allowShadowCast !== true) return false;
  return true;
}

export function applyEntityMeshVisibility(mesh, submit) {
  if (!mesh) return false;
  const next = submit !== false;
  if (mesh.visible === next) return false;
  mesh.visible = next;
  return true;
}
