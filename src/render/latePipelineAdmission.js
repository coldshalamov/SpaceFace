// Sector precompile predicts a population. Anything admitted outside that prediction reaches
// its first draw uncompiled unless admission compiles it. Opening owns a finite leaf set;
// remaining live entity roots are compiled after that set, still behind the loading shell.

function isDrawable(object) {
  return !!(object && (
    object.isMesh === true
    || object.isSkinnedMesh === true
    || object.isInstancedMesh === true
    || object.isPoints === true
    || object.isLine === true
  ));
}

export function collectLateAdmittedCompileRoots(meshes, openingSubjects = []) {
  const opening = new Set(Array.isArray(openingSubjects) ? openingSubjects.filter(Boolean) : []);
  const late = [];
  if (!meshes || typeof meshes.values !== 'function') return late;
  for (const root of meshes.values()) {
    if (!root) continue;
    let hasDrawable = false;
    let hasUncompiled = false;
    const visit = (object) => {
      if (!isDrawable(object)) return;
      hasDrawable = true;
      if (!opening.has(object)) hasUncompiled = true;
    };
    visit(root);
    if (typeof root.traverse === 'function') root.traverse(visit);
    if (hasDrawable && hasUncompiled) late.push(root);
  }
  return late;
}

/** Instance-pool chunks live on the scene, not the entity mesh map. Include count=0 pending ones. */
export function collectInstancePoolCompileRoots(scene) {
  const roots = [];
  if (!scene) return roots;
  const visit = (object) => {
    if (object && object.userData && object.userData.spacefaceInstancePool === true) roots.push(object);
  };
  visit(scene);
  if (typeof scene.traverse === 'function') scene.traverse(visit);
  return roots;
}
