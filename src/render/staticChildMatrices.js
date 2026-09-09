// Freeze local matrices on static children.
//
// The root still poses every frame (position/rotation writes + matrixAutoUpdate). Interior plates,
// merged hull groups, and landmark props do not move in local space, so recomputing their local
// matrix every updateMatrixWorld is dead work. Sockets, lights, cameras, and tagged animated
// nodes stay live.

export function shouldFreezeStaticChild(object, root) {
  if (!object || object === root) return false;
  if (object.isLight || object.isCamera) return false;
  const userData = object.userData || {};
  if (userData.spacefaceSocket || userData.animated || userData.hlod) return false;
  if (userData.updateRuntimeState || userData.updateDriveState || userData.updateLod) return false;
  return true;
}

export function freezeStaticChildMatrices(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let frozen = 0;
  root.traverse((object) => {
    if (!shouldFreezeStaticChild(object, root)) return;
    object.matrixAutoUpdate = false;
    if (typeof object.updateMatrix === 'function') object.updateMatrix();
    frozen += 1;
  });
  return frozen;
}
