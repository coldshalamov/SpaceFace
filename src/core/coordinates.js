// M2 galactic-global XZ coordinate membrane. Simulation entities remain in global JS-double
// coordinates. Rapier and Three.js use frame-local coordinates derived from world.frameOrigin.
// Changing the frame origin never mutates simulation positions or consumes simulation state.

export const COORDINATE_SCHEMA = 'global_v1';
export const FRAME_REBASE_THRESHOLD_WU = 8192;
export const FRAME_ORIGIN_QUANTUM_WU = 4096;

export const COORDINATE_CONSTANTS = Object.freeze({
  schema: COORDINATE_SCHEMA,
  rebaseThresholdWu: FRAME_REBASE_THRESHOLD_WU,
  originQuantumWu: FRAME_ORIGIN_QUANTUM_WU,
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (value === 0 ? 0 : value) : 0;
}

function writeXZ(x, z, out) {
  const target = out || { x: 0, z: 0 };
  target.x = x === 0 ? 0 : x;
  target.z = z === 0 ? 0 : z;
  return target;
}

export function globalToFrame(global, frameOrigin, out) {
  return writeXZ(
    finite(global && global.x) - finite(frameOrigin && frameOrigin.x),
    finite(global && global.z) - finite(frameOrigin && frameOrigin.z),
    out,
  );
}

export function frameToGlobal(frame, frameOrigin, out) {
  return writeXZ(
    finite(frame && frame.x) + finite(frameOrigin && frameOrigin.x),
    finite(frame && frame.z) + finite(frameOrigin && frameOrigin.z),
    out,
  );
}

export function sectorLocalToGlobal(sectorLocal, sectorOrigin, out) {
  return writeXZ(
    finite(sectorLocal && sectorLocal.x) + finite(sectorOrigin && sectorOrigin.x),
    finite(sectorLocal && sectorLocal.z) + finite(sectorOrigin && sectorOrigin.z),
    out,
  );
}

export function sectorLocalToFrame(sectorLocal, sectorOrigin, frameOrigin, out) {
  return writeXZ(
    finite(sectorLocal && sectorLocal.x) + finite(sectorOrigin && sectorOrigin.x) - finite(frameOrigin && frameOrigin.x),
    finite(sectorLocal && sectorLocal.z) + finite(sectorOrigin && sectorOrigin.z) - finite(frameOrigin && frameOrigin.z),
    out,
  );
}

export function shouldRebaseFrameOrigin(focusGlobal, frameOrigin) {
  const dx = finite(focusGlobal && focusGlobal.x) - finite(frameOrigin && frameOrigin.x);
  const dz = finite(focusGlobal && focusGlobal.z) - finite(frameOrigin && frameOrigin.z);
  return Math.abs(dx) >= FRAME_REBASE_THRESHOLD_WU || Math.abs(dz) >= FRAME_REBASE_THRESHOLD_WU;
}

// Nearest quantum, with exact half ties away from zero. This preserves X/Z sign symmetry.
function snapAxis(value) {
  const scaled = finite(value) / FRAME_ORIGIN_QUANTUM_WU;
  const snapped = Math.sign(scaled) * Math.floor(Math.abs(scaled) + 0.5) * FRAME_ORIGIN_QUANTUM_WU;
  return snapped === 0 ? 0 : snapped;
}

export function snapFrameOrigin(global, out) {
  return writeXZ(snapAxis(global && global.x), snapAxis(global && global.z), out);
}

export function deriveFrameOrigin(focusGlobal, currentOrigin, out) {
  if (shouldRebaseFrameOrigin(focusGlobal, currentOrigin)) return snapFrameOrigin(focusGlobal, out);
  return writeXZ(finite(currentOrigin && currentOrigin.x), finite(currentOrigin && currentOrigin.z), out);
}

// The coordinate owner calls this at a fixed-tick seam. Boundary systems observe frameOriginSeq
// and reproject their local representations; entity.pos and every other sim value stay untouched.
export function applyFrameOrigin(state, next) {
  const world = state && state.world;
  if (!world) return false;
  const nx = finite(next && next.x);
  const nz = finite(next && next.z);
  const current = world.frameOrigin && typeof world.frameOrigin === 'object'
    ? world.frameOrigin
    : (world.frameOrigin = { x: 0, z: 0 });
  const cx = finite(current.x);
  const cz = finite(current.z);
  if (cx === nx && cz === nz) {
    current.x = nx;
    current.z = nz;
    return false;
  }
  current.x = nx;
  current.z = nz;
  world.frameOriginSeq = (Number.isSafeInteger(world.frameOriginSeq) && world.frameOriginSeq >= 0
    ? world.frameOriginSeq
    : 0) + 1;
  return true;
}
