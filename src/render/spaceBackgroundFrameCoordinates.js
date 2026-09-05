// Floating-origin adapter for SpaceBackground.
//
// Three.js scene objects and the chase camera live in frame-local XZ, while the procedural sky
// must sample galactic-global XZ or a frame-origin rebase changes the identity of the stars,
// planets, region tint, and deep-field tiles. SpaceBackground predates that split and receives one
// camera vector for both responsibilities. This adapter preserves its public API while separating
// the two coordinate roles:
//   - procedural sampling and velocity integration receive global XZ;
//   - the background root remains locked to the local render camera.
//
// The adapter is installed before renderer.init creates the background (parallaxLayers imports and
// installs it). The per-frame path owns one retained scratch record per background instance.

import { SpaceBackground } from './spaceBackground.js';
import { installDeepFieldPresentation } from './deepFieldPresentation.js';

const PATCH_MARK = Symbol.for('spaceface.spaceBackgroundFrameCoordinates.v1');
const SCRATCH_KEY = Symbol.for('spaceface.spaceBackgroundFrameCoordinates.scratch.v1');

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (value === 0 ? 0 : value) : 0;
}

function readOrigin(state, out) {
  const origin = state && state.world && state.world.frameOrigin;
  out.x = finite(origin && origin.x);
  out.z = finite(origin && origin.z);
  return out;
}

/** Pure/testable local -> galactic camera projection. Reuses `out` when supplied. */
export function resolveSpaceBackgroundGlobalCamera(state, localCamera, out = null) {
  const target = out || { x: 0, y: 0, z: 0 };
  const origin = state && state.world && state.world.frameOrigin;
  target.x = finite(localCamera && localCamera.x) + finite(origin && origin.x);
  target.y = finite(localCamera && localCamera.y);
  target.z = finite(localCamera && localCamera.z) + finite(origin && origin.z);
  return target;
}

function instanceScratch(background) {
  let scratch = background[SCRATCH_KEY];
  if (!scratch) {
    scratch = {
      localCamera: { x: 0, y: 0, z: 0 },
      globalCamera: { x: 0, y: 0, z: 0 },
      origin: { x: 0, z: 0 },
    };
    Object.defineProperty(background, SCRATCH_KEY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: scratch,
    });
  }
  return scratch;
}

function restoreLocalRoot(background, localX, localZ) {
  const group = background && background.group;
  if (!group || !group.position) return;
  if (typeof group.position.set === 'function') group.position.set(localX, background.bgY, localZ);
  else {
    group.position.x = localX;
    group.position.y = background.bgY;
    group.position.z = localZ;
  }
  const originUniform = background.layerMaterial
    && background.layerMaterial.uniforms
    && background.layerMaterial.uniforms.uGroupOrigin
    && background.layerMaterial.uniforms.uGroupOrigin.value;
  if (originUniform && typeof originUniform.copy === 'function') originUniform.copy(group.position);
  else if (originUniform) {
    originUniform.x = group.position.x;
    originUniform.y = group.position.y;
    originUniform.z = group.position.z;
  }
}

function withGlobalCameraMatrix(background, method, args) {
  if (typeof method !== 'function') return undefined;
  const camera = background && background.camera;
  if (!camera || !camera.position) return method.apply(background, args);

  const scratch = instanceScratch(background);
  const origin = readOrigin(background.state, scratch.origin);
  const localX = finite(camera.position.x);
  const localZ = finite(camera.position.z);
  const globalX = localX + origin.x;
  const globalZ = localZ + origin.z;

  background.localCamX = localX;
  background.localCamZ = localZ;
  background.camX = globalX;
  background.camZ = globalZ;

  if (!(origin.x || origin.z)) return method.apply(background, args);

  camera.position.x = globalX;
  camera.position.z = globalZ;
  if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
  try {
    return method.apply(background, args);
  } finally {
    camera.position.x = localX;
    camera.position.z = localZ;
    if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
    restoreLocalRoot(background, localX, localZ);
  }
}

/** Install once; safe under repeated module evaluation in tests and hot reload. */
export function installSpaceBackgroundFrameCoordinateBridge() {
  installDeepFieldPresentation(SpaceBackground);
  const proto = SpaceBackground && SpaceBackground.prototype;
  if (!proto || proto[PATCH_MARK]) return false;

  const originalUpdate = proto.update;
  const originalSectorEnter = proto.onSectorEnter;
  const originalResize = proto.onResize;

  if (typeof originalUpdate !== 'function') {
    throw new Error('[render] SpaceBackground update contract is unavailable');
  }

  proto.update = function updateWithGlobalProceduralCoordinates(frameDt, bgTime, localCamera) {
    const localX = finite(localCamera && localCamera.x);
    const localY = finite(localCamera && localCamera.y);
    const localZ = finite(localCamera && localCamera.z);
    const scratch = instanceScratch(this);
    scratch.localCamera.x = localX;
    scratch.localCamera.y = localY;
    scratch.localCamera.z = localZ;
    const globalCamera = resolveSpaceBackgroundGlobalCamera(
      this.state,
      scratch.localCamera,
      scratch.globalCamera,
    );

    const result = originalUpdate.call(this, frameDt, bgTime, globalCamera);
    this.localCamX = localX;
    this.localCamZ = localZ;
    restoreLocalRoot(this, localX, localZ);
    return result;
  };

  if (typeof originalSectorEnter === 'function') {
    proto.onSectorEnter = function sectorEnterWithGlobalProjection(...args) {
      return withGlobalCameraMatrix(this, originalSectorEnter, args);
    };
  }

  if (typeof originalResize === 'function') {
    proto.onResize = function resizeWithGlobalProjection(...args) {
      return withGlobalCameraMatrix(this, originalResize, args);
    };
  }

  Object.defineProperty(proto, PATCH_MARK, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
  return true;
}
