// Submit-side visibility for presentation roots.
//
// The query "hidden" set is already outside the on-screen box plus a ~900 WU
// travel runway. Those roots cannot change a readable pixel. Anything still in
// the query — including the middle sync band and small-but-authored ships —
// stays submitted. The inner/middle split only changes how often closures run.

export function shouldSubmitEntityMesh(options = {}) {
  if (options.isPlayer === true) return true;
  if (options.forceRender === true || options.neverCull === true) return true;
  if (options.hidden === true) return false;
  return true;
}

export function applyEntityMeshVisibility(mesh, submit) {
  if (!mesh) return false;
  const next = submit !== false;
  if (mesh.visible === next) return false;
  mesh.visible = next;
  return true;
}
