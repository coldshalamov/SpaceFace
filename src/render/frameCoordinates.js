// Render-side floating-origin membrane for M2.
// entity.pos / prevPos remain galactic-global. Three.js XZ is frame-local:
//   local = global - state.world.frameOrigin
// Boundary systems reproject local caches on frameOriginSeq change; sim state is never mutated here.
// Hot path: reuse module/instance scratch objects — never allocate origin/vector per entity per frame.

import { frameToGlobal, globalToFrame } from '../core/coordinates.js';

const _ORIGIN_ZERO = Object.freeze({ x: 0, z: 0 });

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (value === 0 ? 0 : value) : 0;
}

/** Read world.frameOrigin without allocating when `out` is supplied. */
export function readFrameOrigin(state, out) {
  const target = out || { x: 0, z: 0 };
  const origin = state && state.world && state.world.frameOrigin;
  target.x = finite(origin && origin.x);
  target.z = finite(origin && origin.z);
  return target;
}

/** Monotonic frame-origin sequence; fail-closed to 0. */
export function readFrameOriginSeq(state) {
  const seq = state && state.world && state.world.frameOriginSeq;
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : 0;
}

// Scratch for interpolate intermediate global (no per-call allocation on hot path).
const _interpGlobalScratch = { x: 0, z: 0 };

/**
 * Interpolate galactic-global prev→curr by alpha, then project into the current frame.
 * Affine: equal to converting both ends and interpolating locals.
 */
export function interpolateGlobalToFrame(prev, curr, alpha, frameOrigin, out) {
  const t = Number.isFinite(alpha) ? alpha : 0;
  const px = finite(prev && prev.x);
  const pz = finite(prev && prev.z);
  const cx = finite(curr && curr.x);
  const cz = finite(curr && curr.z);
  _interpGlobalScratch.x = px + (cx - px) * t;
  _interpGlobalScratch.z = pz + (cz - pz) * t;
  return globalToFrame(_interpGlobalScratch, frameOrigin, out);
}

/**
 * When the frame origin moves, local points reproject by delta = oldOrigin - newOrigin.
 * local' = global - new = (global - old) + (old - new) = local + delta.
 */
export function localRebaseDelta(oldOrigin, newOrigin, out) {
  const target = out || { x: 0, z: 0 };
  target.x = finite(oldOrigin && oldOrigin.x) - finite(newOrigin && newOrigin.x);
  target.z = finite(oldOrigin && oldOrigin.z) - finite(newOrigin && newOrigin.z);
  return target;
}

export function reprojectLocalXZ(x, z, delta, out) {
  const target = out || { x: 0, z: 0 };
  target.x = finite(x) + finite(delta && delta.x);
  target.z = finite(z) + finite(delta && delta.z);
  return target;
}

/**
 * Per-system cache of the last applied frame origin/seq.
 * `sync(state)` detects changes and returns rebase metadata without allocating when no-op.
 */
export function createRenderFrameMembrane() {
  const origin = { x: 0, z: 0 };
  let seq = 0;
  const _syncScratch = { x: 0, z: 0 };
  const _delta = { x: 0, z: 0 };
  const _local = { x: 0, z: 0 };
  const _global = { x: 0, z: 0 };
  const _interp = { x: 0, z: 0 };
  // Stable no-shift result object reused every frame.
  const _noopResult = {
    changed: false,
    dx: 0,
    dz: 0,
    origin,
    seq: 0,
    delta: _delta,
  };
  const _changedResult = {
    changed: true,
    dx: 0,
    dz: 0,
    origin,
    seq: 0,
    delta: _delta,
  };

  return {
    get origin() { return origin; },
    get seq() { return seq; },

    /**
     * Align cache to state.world.frameOrigin / frameOriginSeq.
     * @returns {{ changed:boolean, dx:number, dz:number, origin:{x,z}, seq:number, delta:{x,z} }}
     */
    sync(state) {
      const next = readFrameOrigin(state, _syncScratch);
      const nextSeq = readFrameOriginSeq(state);
      if (next.x === origin.x && next.z === origin.z && nextSeq === seq) {
        _noopResult.seq = seq;
        return _noopResult;
      }
      localRebaseDelta(origin, next, _delta);
      origin.x = next.x;
      origin.z = next.z;
      seq = nextSeq;
      _changedResult.dx = _delta.x;
      _changedResult.dz = _delta.z;
      _changedResult.seq = seq;
      return _changedResult;
    },

    /** Force cache to match state without reporting a rebase (boot / first attach). */
    reset(state) {
      readFrameOrigin(state, origin);
      seq = readFrameOriginSeq(state);
      _delta.x = 0;
      _delta.z = 0;
      return this;
    },

    toLocal(global, out) {
      return globalToFrame(global, origin, out || _local);
    },

    toGlobal(local, out) {
      return frameToGlobal(local, origin, out || _global);
    },

    interpolateLocal(prev, curr, alpha, out) {
      return interpolateGlobalToFrame(prev, curr, alpha, origin, out || _interp);
    },
  };
}

/** Shared zero origin for Helios / cold-start paths (identity projection). */
export function zeroFrameOrigin() {
  return _ORIGIN_ZERO;
}

export { globalToFrame, frameToGlobal };
