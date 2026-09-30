// Runtime owner of the Look (authored data: src/data/lookMoods.js).
//
// One set of shared uniform objects feeds every lit hull program and both post routes. A mood
// change is a lerp of numbers written into those objects — no recompile, no material walk, no
// per-frame allocation. Consumers attach the SAME objects:
//   illustratedSurface.js : Object.assign(shader.uniforms, LOOK_SURFACE_UNIFORMS)
//   bloom.js / spaceRenderGraph.js : { ...LOOK_POST_UNIFORMS } in the composite material
import { Vector3 } from 'three';
import { DEFAULT_LOOK_MOOD, resolveLookMood } from '../data/lookMoods.js';

const SURFACE_SCALARS = ['albedoGamma', 'albedoSaturation', 'bandMix', 'contour', 'coat',
  'coatRoughness', 'coatEnv', 'coatSun', 'coatEdge', 'rimStrength', 'rimPower', 'paintCeiling'];
const SURFACE_COLORS = ['shadowTint', 'lightTint', 'coatTint', 'rim'];
const POST_SCALARS = ['contrast', 'saturation', 'vibrance', 'ink'];
const POST_COLORS = ['shadowTint', 'highlightTint', 'bloomTint', 'vignetteTint'];

function uniformName(prefix, key) {
  return prefix + key.charAt(0).toUpperCase() + key.slice(1);
}

function createUniforms(prefix, scalars, colors, source) {
  const uniforms = {};
  for (const key of scalars) uniforms[uniformName(prefix, key)] = { value: source[key] };
  for (const key of colors) uniforms[uniformName(prefix, key)] = { value: new Vector3().fromArray(source[key]) };
  return uniforms;
}

const boot = resolveLookMood(DEFAULT_LOOK_MOOD);

/** Shared by every material the illustrated-surface hook touches (sfLook*). */
export const LOOK_SURFACE_UNIFORMS = Object.freeze(
  createUniforms('sfLook', SURFACE_SCALARS, SURFACE_COLORS, boot.surface));
/** Shared by both post composites (uLook*). */
export const LOOK_POST_UNIFORMS = Object.freeze(
  createUniforms('uLook', POST_SCALARS, POST_COLORS, boot.post));

// Flat numeric snapshot of a mood, so a transition is one array lerp.
const FIELD_COUNT = SURFACE_SCALARS.length + SURFACE_COLORS.length * 3
  + POST_SCALARS.length + POST_COLORS.length * 3;

function writeMoodToArray(mood, out) {
  let i = 0;
  for (const key of SURFACE_SCALARS) out[i++] = mood.surface[key];
  for (const key of SURFACE_COLORS) { const c = mood.surface[key]; out[i++] = c[0]; out[i++] = c[1]; out[i++] = c[2]; }
  for (const key of POST_SCALARS) out[i++] = mood.post[key];
  for (const key of POST_COLORS) { const c = mood.post[key]; out[i++] = c[0]; out[i++] = c[1]; out[i++] = c[2]; }
  return out;
}

function writeArrayToUniforms(values) {
  let i = 0;
  for (const key of SURFACE_SCALARS) LOOK_SURFACE_UNIFORMS[uniformName('sfLook', key)].value = values[i++];
  for (const key of SURFACE_COLORS) {
    LOOK_SURFACE_UNIFORMS[uniformName('sfLook', key)].value.set(values[i], values[i + 1], values[i + 2]);
    i += 3;
  }
  for (const key of POST_SCALARS) LOOK_POST_UNIFORMS[uniformName('uLook', key)].value = values[i++];
  for (const key of POST_COLORS) {
    LOOK_POST_UNIFORMS[uniformName('uLook', key)].value.set(values[i], values[i + 1], values[i + 2]);
    i += 3;
  }
}

const state = {
  moodId: boot.id,
  start: writeMoodToArray(boot, new Float64Array(FIELD_COUNT)),
  target: writeMoodToArray(boot, new Float64Array(FIELD_COUNT)),
  current: writeMoodToArray(boot, new Float64Array(FIELD_COUNT)),
  elapsed: 0,
  duration: 0,
  active: false,
};

/** Start moving the picture to `moodId`. `seconds` <= 0 snaps (boot, captures). */
export function beginLookMood(moodId, seconds = 0) {
  const mood = resolveLookMood(moodId);
  // A snap always rewrites the uniforms (it also clears any tuneLook patch); only a lerp to the
  // mood already showing is a no-op.
  if (seconds > 0 && mood.id === state.moodId && !state.active) return mood.id;
  state.moodId = mood.id;
  writeMoodToArray(mood, state.target);
  if (!(seconds > 0)) {
    state.current.set(state.target);
    state.active = false;
    writeArrayToUniforms(state.current);
    return mood.id;
  }
  state.start.set(state.current);
  state.elapsed = 0;
  state.duration = seconds;
  state.active = true;
  return mood.id;
}

/** Advance a running mood transition. Cheap no-op when idle. */
export function updateLook(frameDt) {
  if (!state.active) return false;
  state.elapsed += Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
  const raw = state.duration > 0 ? Math.min(1, state.elapsed / state.duration) : 1;
  const t = raw * raw * (3 - 2 * raw);
  if (raw >= 1) {
    // Land exactly on the authored numbers, not on a rounding of the lerp.
    state.current.set(state.target);
    state.active = false;
  } else {
    for (let i = 0; i < FIELD_COUNT; i++) {
      state.current[i] = state.start[i] + (state.target[i] - state.start[i]) * t;
    }
  }
  writeArrayToUniforms(state.current);
  return true;
}

export function currentLookMoodId() { return state.moodId; }

/**
 * Tuning seam for the look bench (scripts/look-bench.mjs) and dev console: overwrite single
 * values on the live uniforms, e.g. tuneLook({ surface: { coat: 1.4 }, post: { ink: 0 } }).
 * Values hold until the next mood change. Not a settings path; nothing is saved.
 */
export function tuneLook(patch = {}) {
  const apply = (uniforms, prefix, scalars, colors, values) => {
    if (!values) return;
    for (const key of scalars) {
      if (Number.isFinite(values[key])) uniforms[uniformName(prefix, key)].value = values[key];
    }
    for (const key of colors) {
      if (Array.isArray(values[key]) && values[key].length === 3) {
        uniforms[uniformName(prefix, key)].value.fromArray(values[key]);
      }
    }
  };
  apply(LOOK_SURFACE_UNIFORMS, 'sfLook', SURFACE_SCALARS, SURFACE_COLORS, patch.surface);
  apply(LOOK_POST_UNIFORMS, 'uLook', POST_SCALARS, POST_COLORS, patch.post);
}

export const LOOK_FIELDS = Object.freeze({
  surfaceScalars: SURFACE_SCALARS, surfaceColors: SURFACE_COLORS,
  postScalars: POST_SCALARS, postColors: POST_COLORS,
});
