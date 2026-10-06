// spaceface.rigidMotionBank.v1 — authored rigid-part motion banks (ANI-00 foundation).
//
// Forge builders register motion groups (Ship.motion_group) and author real Blender actions on the
// exported MOTION_<id> pivot empties. A 60-samples-per-second evaluator bakes each action's local
// pose into rest-relative translation/rotation channels beside the asset
// (assets/ships/motions/<model>.motion.json). Render-package compilation carries the bank reference
// inside the package's runtime table under runtimeHash; at instance time `bindAuthoredMotion`
// resolves the declared pivots inside the spawned Object3D tree and plays clips by composing
// rest + delta on each pivot's local TRS. The GLB itself never carries gltf.animations — motion is
// data + code, owned by exactly one transform writer per moving group.
//
// Channel scope is deliberately narrow: pivot translation and rotation only. Scale, scene-root,
// camera, collider, whole-hull, simulation-owned and undeclared groups are rejected at validate
// time, before any byte ever reaches a live Object3D.

export const MOTION_BANK_SCHEMA = 'spaceface.rigidMotionBank.v1';
export const MOTION_NODE_PREFIX = 'MOTION_';
export const MOTION_GROUP_KIND = 'moving-part';
export const MOTION_FPS = 60;

const CHANNEL_PATHS = new Set(['translation', 'rotation']);
const INTERPOLATIONS = new Set(['linear', 'slerp', 'cubic']);
// A channel keyed sparser than this (mean key spacing, seconds) is a hand-keyed pose list, not a
// dense bake: piecewise-linear evaluation would put a velocity corner on every key, so the
// sampler evaluates it as a C1 'cubic' curve instead (see buildCubicPlan). Dense 60 fps bakes
// keep the exact old linear/slerp path.
export const MOTION_SPARSE_SPACING_S = 1 / 15;
const END_MODES = new Set(['rest', 'hold']);
const LOD_LEVELS = new Set([0, 1, 2]);
// Group ids that may never own a motion channel: they belong to the scene, the camera rig,
// the collision pipeline, or the simulation — not to authored cosmetics.
const FORBIDDEN_GROUP_IDS = new Set([
  'root', 'scene', 'camera', 'collider', 'collision', 'collision_hull',
  'whole-hull', 'whole_hull', 'hull', 'simulation', 'sim',
]);
const HEX64 = /^[0-9a-f]{64}$/;
const RIG_ID = /^[a-z][a-z0-9_]*$/;
// Reduced-motion damping for authored clips: half amplitude on event deltas while the
// ambient attach loop parks entirely — the same convention the ship/place systems use.
const REDUCED_AMP = 0.5;

/** 'kestrel_dish' -> 'MOTION_KESTREL_DISH' — the glTF node a binding resolves against. */
export function motionNodeNameFor(groupId) {
  return `${MOTION_NODE_PREFIX}${String(groupId || '').toUpperCase()}`;
}

/** Inverse of motionNodeNameFor; null when the name is not a motion pivot. */
export function motionGroupIdFor(nodeName) {
  const name = String(nodeName || '');
  if (!name.startsWith(MOTION_NODE_PREFIX)) return null;
  return name.slice(MOTION_NODE_PREFIX.length).toLowerCase() || null;
}

// Auto-bridge thresholds: a claimed group further than this from the incoming clip's
// first key earns a synthesized live→key0 blend instead of a teleport.
const BRIDGE_POS_EPS = 0.04;   // WU — sub-pixel at any sane LOD
const BRIDGE_ROT_EPS = 0.035;  // rad (~2°)
const BRIDGE_MIN_S = 0.15;
const BRIDGE_MAX_S = 0.9;
const BRIDGE_ROT_SPEED = 4;    // rad/s — a handoff reads as mechanical, not inert
const BRIDGE_POS_SPEED = 5;    // WU/s

function quatAngleBetween(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

function finiteArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`motion bank ${label} must be an array of ${length} finite numbers.`);
  }
  for (const v of value) {
    if (!Number.isFinite(v)) throw new Error(`motion bank ${label} contains a non-finite value.`);
  }
}

function lodSet(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`motion bank ${label} must be an array of LOD levels.`);
  for (const level of value) {
    if (!LOD_LEVELS.has(level)) {
      throw new Error(`motion bank ${label} holds invalid LOD level ${level}.`);
    }
  }
  return value;
}

/**
 * Validate a decoded motion bank. Throws on every contract break; returns the bank itself so
 * callers can chain. This is the only gate — bindAuthoredMotion re-runs it rather than trusting
 * a caller's prior claim, so a hand-edited bank cannot smuggle channels past the loader.
 */
export function validateMotionBank(bank) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
    throw new Error('motion bank must be an object.');
  }
  if (bank.schema !== MOTION_BANK_SCHEMA) {
    throw new Error(`motion bank schema must be ${MOTION_BANK_SCHEMA} (got ${bank.schema}).`);
  }
  if (typeof bank.rigId !== 'string' || !RIG_ID.test(bank.rigId)) {
    throw new Error(`motion bank rigId must be a lowercase identifier (got ${bank.rigId}).`);
  }
  if (typeof bank.sourceAssetId !== 'string' || !bank.sourceAssetId) {
    throw new Error('motion bank requires sourceAssetId.');
  }
  if (typeof bank.sourceGlbSha256 !== 'string' || !HEX64.test(bank.sourceGlbSha256)) {
    throw new Error('motion bank sourceGlbSha256 must be a lowercase SHA-256 hex digest.');
  }
  if (bank.fps !== MOTION_FPS) {
    throw new Error(`motion bank must be sampled at fps ${MOTION_FPS} (got ${bank.fps}).`);
  }
  if (!Array.isArray(bank.bindings) || bank.bindings.length === 0) {
    throw new Error('motion bank requires at least one binding.');
  }
  const declared = new Set();
  for (const binding of bank.bindings) {
    if (!binding || typeof binding !== 'object') throw new Error('motion bank binding must be an object.');
    if (typeof binding.id !== 'string' || !RIG_ID.test(binding.id)) {
      throw new Error(`motion bank binding id must be a lowercase identifier (got ${binding && binding.id}).`);
    }
    if (FORBIDDEN_GROUP_IDS.has(binding.id)) {
      throw new Error(`motion bank binding id "${binding.id}" is reserved.`);
    }
    if (declared.has(binding.id)) throw new Error(`motion bank binding id "${binding.id}" is declared twice.`);
    declared.add(binding.id);
    const node = binding.node || motionNodeNameFor(binding.id);
    if (typeof node !== 'string' || !node.startsWith(MOTION_NODE_PREFIX)) {
      throw new Error(`motion bank binding ${binding.id} must target a ${MOTION_NODE_PREFIX}* node.`);
    }
    const rest = binding.restPose;
    if (!rest || typeof rest !== 'object') {
      throw new Error(`motion bank binding ${binding.id} requires restPose.`);
    }
    finiteArray(rest.translation, 3, `binding ${binding.id} restPose.translation`);
    finiteArray(rest.rotation, 4, `binding ${binding.id} restPose.rotation`);
    const qn = Math.hypot(rest.rotation[0], rest.rotation[1], rest.rotation[2], rest.rotation[3]);
    if (Math.abs(qn - 1) > 1e-3) {
      throw new Error(`motion bank binding ${binding.id} restPose.rotation is not unit length.`);
    }
    if (rest.scale !== undefined) {
      finiteArray(rest.scale, 3, `binding ${binding.id} restPose.scale`);
      if (!rest.scale.every((v) => Math.abs(v - 1) < 1e-4)) {
        throw new Error(`motion bank binding ${binding.id} restPose.scale must be [1,1,1]; scale is not animatable.`);
      }
    }
    const required = lodSet(binding.requiredAtLod, `binding ${binding.id} requiredAtLod`);
    const optional = lodSet(binding.optionalAtLod, `binding ${binding.id} optionalAtLod`);
    for (const level of required) {
      if (optional.includes(level)) {
        throw new Error(`motion bank binding ${binding.id} lists LOD${level} as both required and optional.`);
      }
    }
  }
  for (const binding of bank.bindings) {
    if (binding.parent == null) continue;
    if (!declared.has(binding.parent)) {
      throw new Error(`motion bank binding ${binding.id} declares undeclared parent "${binding.parent}".`);
    }
    for (let walk = binding.parent, depth = 0; ; depth++) {
      if (depth > bank.bindings.length) {
        throw new Error(`motion bank binding ${binding.id} forms a parent cycle.`);
      }
      const parent = bank.bindings.find((b) => b.id === walk);
      if (parent.parent == null) break;
      walk = parent.parent;
    }
  }
  if (!Array.isArray(bank.clips) || bank.clips.length === 0) {
    throw new Error('motion bank requires at least one clip.');
  }
  const clipNames = new Set();
  for (const clip of bank.clips) {
    if (!clip || typeof clip !== 'object') throw new Error('motion bank clip must be an object.');
    if (typeof clip.name !== 'string' || !clip.name) {
      throw new Error('motion bank clip requires a name.');
    }
    if (clipNames.has(clip.name)) throw new Error(`motion bank clip "${clip.name}" is declared twice.`);
    if (clip.name.startsWith('__settle__') || clip.name === 'rest' || clip.name === 'idle') {
      throw new Error(
        `motion bank clip "${clip.name}" uses a reserved name — '__settle__N' is synthesized ` +
        "at runtime and 'rest'/'idle' are the park states a bank clip could never be addressed by.",
      );
    }
    clipNames.add(clip.name);
    if (!Number.isFinite(clip.durationS) || clip.durationS <= 0) {
      throw new Error(`motion bank clip ${clip.name} durationS must be a positive finite number.`);
    }
    if (clip.loop !== undefined && typeof clip.loop !== 'boolean') {
      throw new Error(`motion bank clip ${clip.name} loop must be boolean.`);
    }
    if (!END_MODES.has(clip.endMode || 'rest')) {
      throw new Error(`motion bank clip ${clip.name} endMode must be rest or hold.`);
    }
    if (clip.overlay !== undefined && typeof clip.overlay !== 'boolean') {
      throw new Error(`motion bank clip ${clip.name} overlay must be boolean.`);
    }
    if (!Array.isArray(clip.channels) || clip.channels.length === 0) {
      throw new Error(`motion bank clip ${clip.name} requires at least one channel.`);
    }
    for (const channel of clip.channels) {
      if (!channel || typeof channel !== 'object') {
        throw new Error(`motion bank clip ${clip.name} channel must be an object.`);
      }
      if (!declared.has(channel.group)) {
        throw new Error(`motion bank clip ${clip.name} channels undeclared group "${channel.group}".`);
      }
      if (!CHANNEL_PATHS.has(channel.path)) {
        throw new Error(
          `motion bank clip ${clip.name} group ${channel.group} path must be translation or rotation`
          + ` (got ${channel.path}); scale, camera, collider and root channels are forbidden.`,
        );
      }
      const stride = channel.path === 'translation' ? 3 : 4;
      const times = channel.times;
      const values = channel.values;
      if (!Array.isArray(times) || times.length === 0) {
        throw new Error(`motion bank clip ${clip.name} group ${channel.group} ${channel.path} has no times.`);
      }
      for (let i = 0; i < times.length; i++) {
        if (!Number.isFinite(times[i]) || times[i] < 0 || times[i] > clip.durationS + 1e-6) {
          throw new Error(`motion bank clip ${clip.name} channel time ${times[i]} is outside the clip.`);
        }
        if (i > 0 && times[i] <= times[i - 1]) {
          throw new Error(`motion bank clip ${clip.name} channel times must be strictly increasing.`);
        }
      }
      if (!Array.isArray(values) || values.length !== times.length * stride) {
        throw new Error(
          `motion bank clip ${clip.name} group ${channel.group} ${channel.path} values must be `
          + `${times.length} samples of ${stride}.`,
        );
      }
      for (const v of values) {
        if (!Number.isFinite(v)) {
          throw new Error(`motion bank clip ${clip.name} channel values must be finite.`);
        }
      }
      if (channel.path === 'rotation') {
        for (let i = 0; i < times.length; i++) {
          const o = i * 4;
          const qn = Math.hypot(values[o], values[o + 1], values[o + 2], values[o + 3]);
          if (Math.abs(qn - 1) > 1e-3) {
            throw new Error(`motion bank clip ${clip.name} rotation sample ${i} is not unit length.`);
          }
        }
      }
      if (!INTERPOLATIONS.has(channel.interpolation || (channel.path === 'rotation' ? 'slerp' : 'linear'))) {
        throw new Error(`motion bank clip ${clip.name} group ${channel.group} interpolation is not supported.`);
      }
      if (channel.path === 'translation' && channel.interpolation === 'slerp') {
        // sampleChannel only ever slerps rotation; a declared-but-inert translation 'slerp'
        // misstates the baked data.
        throw new Error(`motion bank clip ${clip.name} group ${channel.group} translation cannot slerp.`);
      }
    }
  }
  if (bank.events !== undefined) {
    if (!bank.events || typeof bank.events !== 'object' || Array.isArray(bank.events)) {
      throw new Error('motion bank events must be an object mapping event names to clip names.');
    }
    for (const [event, clipName] of Object.entries(bank.events)) {
      if (typeof event !== 'string' || !event) {
        throw new Error('motion bank events keys must be non-empty event names.');
      }
      if (clipName !== 'rest' && clipName !== 'idle' && !clipNames.has(clipName)) {
        throw new Error(`motion bank events.${event} maps to undeclared clip "${clipName}".`);
      }
    }
  }
  return bank;
}

function normalizeQuat(x, y, z, w) {
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

/** Quaternion spherical linear interpolation; takes the short arc. */
export function slerp(a, b, t) {
  const out = [0, 0, 0, 1];
  slerpInto(a, 0, b, 0, t, out);
  return out;
}

/** slerp writing into `out` — the per-frame path allocates nothing. */
function slerpInto(a, aOff, b, bOff, t, out) {
  let dot = a[aOff] * b[bOff] + a[aOff + 1] * b[bOff + 1] + a[aOff + 2] * b[bOff + 2] + a[aOff + 3] * b[bOff + 3];
  let bx = b[bOff]; let by = b[bOff + 1]; let bz = b[bOff + 2]; let bw = b[bOff + 3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    const x = a[aOff] + t * (bx - a[aOff]);
    const y = a[aOff + 1] + t * (by - a[aOff + 1]);
    const z = a[aOff + 2] + t * (bz - a[aOff + 2]);
    const w = a[aOff + 3] + t * (bw - a[aOff + 3]);
    const n = Math.hypot(x, y, z, w) || 1;
    out[0] = x / n; out[1] = y / n; out[2] = z / n; out[3] = w / n;
    return out;
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  out[0] = a[aOff] * wa + bx * wb;
  out[1] = a[aOff + 1] * wa + by * wb;
  out[2] = a[aOff + 2] * wa + bz * wb;
  out[3] = a[aOff + 3] * wa + bw * wb;
  return out;
}

/** Scale a quaternion delta toward identity (reduced-motion damping) in place. */
function dampQuat(q, amp) {
  if (q[3] < 0) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3]; }
  const x = q[0] * amp; const y = q[1] * amp; const z = q[2] * amp;
  const w = 1 + (q[3] - 1) * amp;
  const n = Math.hypot(x, y, z, w) || 1;
  q[0] = x / n; q[1] = y / n; q[2] = z / n; q[3] = w / n;
  return q;
}

function quatMulInto(out, ax, ay, az, aw, bx, by, bz, bw) {
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

// ---- smooth ('cubic') evaluation -------------------------------------------------------------
//
// Hand-keyed banks are sparse linear pose lists, so piecewise evaluation puts a velocity corner on
// every key (the "a scripted move just got called" look). A sparse channel is therefore evaluated
// as a C1 cubic Hermite curve that passes exactly through every key:
//   translation  monotone cubic Hermite per component (Fritsch-Butland tangents): no overshoot
//                between keys, and a key that is a local extremum (a reversal) or sits on a flat
//                run gets tangent 0, so the part eases in and out of reversals and holds.
//   rotation     the tangent at each key is a body-frame angular velocity built from the geodesic
//                (axis-angle) secants with the same per-axis rule, so a constant spin keyed in
//                coarse steps stays a constant spin; the quaternion derivative is 0.5*q*(w,0), the
//                curve is a Hermite on the hemisphere-aligned key quaternions, normalised.
//   ends         non-loop clips start and end at rest (tangent 0). A loop clip whose keys span the
//                whole [0, duration] period gets PERIODIC tangents (antiperiodic for a rotation
//                that closes on -q0), so a loop has no pop in pose or velocity at its seam.
// The plan (aligned keys + tangents) is built once per channel and cached in a WeakMap, so frozen
// banks are never mutated and the per-frame sampler allocates nothing. Dense channels keep the
// exact old linear/slerp path.

const NO_CUBIC = Object.freeze({ cubic: false });
const cubicPlans = new WeakMap();

/** Weighted harmonic mean of two adjacent secants (Fritsch-Butland); 0 on an extremum or a flat. */
function pchipTangent(a, b, hPrev, hNext) {
  if (a * b <= 0) return 0;
  const w1 = 2 * hNext + hPrev;
  const w2 = hNext + 2 * hPrev;
  return (w1 + w2) / (w1 / a + w2 / b);
}

/** Rotation vector (axis * angle, short arc) of the relative rotation conj(a) * b, into out[o..o+2]. */
function relativeRotationVector(vals, ia, ib, out, o) {
  const ax = vals[ia]; const ay = vals[ia + 1]; const az = vals[ia + 2]; const aw = vals[ia + 3];
  const bx = vals[ib]; const by = vals[ib + 1]; const bz = vals[ib + 2]; const bw = vals[ib + 3];
  // conj(a) * b
  let x = aw * bx - ax * bw - ay * bz + az * by;
  let y = aw * by + ax * bz - ay * bw - az * bx;
  let z = aw * bz - ax * by + ay * bx - az * bw;
  let w = aw * bw + ax * bx + ay * by + az * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  const k = s < 1e-9 ? 2 / (w || 1) : (2 * Math.atan2(s, w)) / s;
  out[o] = x * k; out[o + 1] = y * k; out[o + 2] = z * k;
}

function buildCubicPlan(channel, period) {
  const times = channel.times;
  const n = times.length;
  if (n < 2) return NO_CUBIC;
  const declared = channel.interpolation;
  const sparse = (times[n - 1] - times[0]) / (n - 1) > MOTION_SPARSE_SPACING_S;
  if (declared !== 'cubic' && !sparse) return NO_CUBIC;
  const rot = channel.path === 'rotation';
  const stride = rot ? 4 : 3;
  const val = Float64Array.from(channel.values);
  if (rot) {
    // Hemisphere-align every key to its predecessor so the Hermite takes the short arc.
    for (let k = 1; k < n; k++) {
      const o = k * 4; const p = o - 4;
      if (val[o] * val[p] + val[o + 1] * val[p + 1] + val[o + 2] * val[p + 2] + val[o + 3] * val[p + 3] < 0) {
        val[o] = -val[o]; val[o + 1] = -val[o + 1]; val[o + 2] = -val[o + 2]; val[o + 3] = -val[o + 3];
      }
    }
  }
  const segs = n - 1;
  const h = new Float64Array(segs);
  const sec = new Float64Array(segs * 3); // secant velocity per segment: WU/s, or body rad/s
  for (let k = 0; k < segs; k++) {
    h[k] = times[k + 1] - times[k];
    if (rot) {
      relativeRotationVector(val, k * 4, (k + 1) * 4, sec, k * 3);
      sec[k * 3] /= h[k]; sec[k * 3 + 1] /= h[k]; sec[k * 3 + 2] /= h[k];
    } else {
      for (let c = 0; c < 3; c++) sec[k * 3 + c] = (val[(k + 1) * 3 + c] - val[k * 3 + c]) / h[k];
    }
  }
  const periodic = period > 0 && times[0] <= 1e-6 && times[n - 1] >= period - 1e-6;
  const vel = new Float64Array(n * 3); // per-key tangent velocity (zero at non-periodic ends)
  for (let k = 1; k < n - 1; k++) {
    for (let c = 0; c < 3; c++) {
      vel[k * 3 + c] = pchipTangent(sec[(k - 1) * 3 + c], sec[k * 3 + c], h[k - 1], h[k]);
    }
  }
  if (periodic) {
    // Key 0 and key n-1 are the same moment of the loop: one tangent from the last and first
    // segments serves both, so velocity is continuous across the seam.
    for (let c = 0; c < 3; c++) {
      const v = pchipTangent(sec[(segs - 1) * 3 + c], sec[c], h[segs - 1], h[0]);
      vel[c] = v; vel[(n - 1) * 3 + c] = v;
    }
  }
  const tan = new Float64Array(n * stride);
  if (rot) {
    const tmp = [0, 0, 0, 0];
    for (let k = 0; k < n; k++) {
      const o = k * 4;
      // q' = 0.5 * q * (omega, 0), omega in the key's own (body) frame.
      quatMulInto(tmp, val[o], val[o + 1], val[o + 2], val[o + 3],
        vel[k * 3], vel[k * 3 + 1], vel[k * 3 + 2], 0);
      tan[o] = 0.5 * tmp[0]; tan[o + 1] = 0.5 * tmp[1]; tan[o + 2] = 0.5 * tmp[2]; tan[o + 3] = 0.5 * tmp[3];
    }
  } else {
    tan.set(vel);
  }
  return { cubic: true, period, val, tan };
}

function cubicPlanFor(channel, period) {
  let plan = cubicPlans.get(channel);
  if (plan === undefined || (plan.cubic && plan.period !== period)) {
    plan = buildCubicPlan(channel, period);
    cubicPlans.set(channel, plan);
  }
  return plan;
}

/**
 * The interpolation a channel is actually evaluated with: 'cubic' for a declared-cubic or sparse
 * linear/slerp channel, else its declared (or default) 'linear'/'slerp'. `period` is the clip
 * duration for a loop clip and 0 otherwise.
 */
export function motionChannelInterpolation(channel, period = 0) {
  if (cubicPlanFor(channel, period).cubic) return 'cubic';
  return channel.interpolation || (channel.path === 'rotation' ? 'slerp' : 'linear');
}

function sampleChannel(channel, t, period) {
  const stride = channel.path === 'translation' ? 3 : 4;
  const out = new Array(stride);
  return sampleChannelInto(channel, t, out, period);
}

/**
 * sampleChannel writing into `out` — the per-frame path allocates nothing. `period` is the clip
 * duration for a loop clip (periodic end tangents) and 0 for a one-shot (rest-to-rest ends).
 */
export function sampleChannelInto(channel, t, out, period = 0) {
  const times = channel.times;
  const stride = channel.path === 'translation' ? 3 : 4;
  const last = times.length - 1;
  const plan = last > 0 ? cubicPlanFor(channel, period) : NO_CUBIC;
  const values = plan.cubic ? plan.val : channel.values;
  if (t <= times[0]) {
    for (let i = 0; i < stride; i++) out[i] = values[i];
    return out;
  }
  if (t >= times[last]) {
    for (let i = 0; i < stride; i++) out[i] = values[last * stride + i];
    return out;
  }
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 0 ? (t - times[lo]) / span : 0;
  if (plan.cubic) {
    const tan = plan.tan;
    const f2 = f * f; const f3 = f2 * f;
    const h00 = 2 * f3 - 3 * f2 + 1;
    const h10 = (f3 - 2 * f2 + f) * span;
    const h01 = -2 * f3 + 3 * f2;
    const h11 = (f3 - f2) * span;
    const a = lo * stride; const b = hi * stride;
    for (let i = 0; i < stride; i++) {
      out[i] = h00 * values[a + i] + h10 * tan[a + i] + h01 * values[b + i] + h11 * tan[b + i];
    }
    if (stride === 4) {
      const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
      out[0] /= n; out[1] /= n; out[2] /= n; out[3] /= n;
    }
    return out;
  }
  if (channel.path === 'rotation' && (channel.interpolation || 'slerp') === 'slerp') {
    return slerpInto(values, lo * stride, values, hi * stride, f, out);
  }
  for (let i = 0; i < stride; i++) {
    out[i] = values[lo * stride + i] + (values[hi * stride + i] - values[lo * stride + i]) * f;
  }
  return out;
}

/**
 * Evaluate one clip at local time t (seconds). Returns Map<groupId, {translation?, rotation?}>
 * holding REST-RELATIVE deltas — translation is additive on the rest position, rotation is
 * left-multiplied onto the rest quaternion.
 */
export function evaluateMotionClip(bank, clip, t) {
  const looping = clip.loop === true;
  const local = looping
    ? ((t % clip.durationS) + clip.durationS) % clip.durationS
    : Math.min(Math.max(t, 0), clip.durationS);
  const period = looping ? clip.durationS : 0;
  const deltas = new Map();
  for (const channel of clip.channels) {
    let entry = deltas.get(channel.group);
    if (!entry) {
      entry = {};
      deltas.set(channel.group, entry);
    }
    entry[channel.path] = sampleChannel(channel, local, period);
  }
  return deltas;
}

const REST_EPS_POS = 1e-3;
const REST_EPS_QUAT = 2e-3;

function nodeLocalRest(node) {
  const p = node.position || { x: 0, y: 0, z: 0 };
  const q = node.quaternion || { x: 0, y: 0, z: 0, w: 1 };
  return {
    t: [p.x || 0, p.y || 0, p.z || 0],
    q: normalizeQuat(q.x || 0, q.y || 0, q.z || 0, q.w == null ? 1 : q.w),
  };
}

function quatMatches(a, b) {
  const dot = Math.abs(
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
  );
  return Math.abs(1 - dot) <= REST_EPS_QUAT;
}

function markAnimated(node) {
  node.userData = { ...(node.userData || {}), animated: true };
  node.matrixAutoUpdate = true;
  // A frozen-matrix mark from an earlier static freeze would swallow every write the controller
  // makes; clear it up the chain so the next freeze re-marks honestly.
  for (let walk = node; walk; walk = walk.parent) {
    if (walk.userData && walk.userData.sfMatrixFrozen) walk.userData.sfMatrixFrozen = false;
  }
  const children = node.children || [];
  for (const child of children) markAnimated(child);
}

function nodeHasVisibleMesh(node) {
  let found = false;
  const visit = (n) => {
    if (found || n.visible === false) return;
    if (n.isMesh === true) {
      found = true;
      return;
    }
    for (const c of n.children || []) visit(c);
  };
  visit(node);
  return found;
}

function collectNodesByNameMap(root) {
  const byName = new Map();
  const stack = [...(root.children || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    const name = node.name;
    if (name) {
      let list = byName.get(name);
      if (!list) byName.set(name, list = []);
      list.push(node);
    }
    for (const child of node.children || []) stack.push(child);
  }
  return byName;
}

// Stepped twin — same DFS walk, yields at stride boundaries so the collect can
// pace inside a commit leg instead of landing atomically.
function* collectNodesByNameMapSteps(root, byName) {
  const stack = [...(root.children || [])];
  let visited = 0;
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if ((++visited % 512) === 0) yield;
    const name = node.name;
    if (name) {
      let list = byName.get(name);
      if (!list) byName.set(name, list = []);
      list.push(node);
    }
    for (const child of node.children || []) stack.push(child);
  }
  return byName;
}

/**
 * Bind a validated motion bank onto an instantiated Object3D tree.
 *
 * Every binding resolves to ALL nodes named `binding.node` under `root` — a wholeship mounts
 * one LOD subtree per file, and same-named pivots exist in each; driving every match keeps the
 * parked and sweeping poses identical across LOD transitions, so a level switch never pops a
 * transform. Nodes whose subtree shows no visible mesh (shed damage part, LOD-off level) are
 * parked at rest instead of animating a ghost.
 *
 * Returns { rigId, groups, setState, update, handleEvent, dispose }. The controller owns no
 * global state — two instances of the same bank are independent by construction.
 */
export function bindAuthoredMotion(root, bank, options = {}) {
  const checked = validateMotionBank(bank);
  const nodesByName = collectNodesByNameMap(root);
  return finishAuthoredMotionBind(checked, nodesByName);
}

// Stepped twin: identical bind semantics, but the O(subtree) name-map collect
// yields at stride boundaries. Group/binding application is index-order and the
// controller mints only after the collect completes, so a suspended walk never
// surfaces a half-bound rig.
export function* bindAuthoredMotionSteps(root, bank, options = {}) {
  const checked = validateMotionBank(bank);
  const nodesByName = yield* collectNodesByNameMapSteps(root, new Map());
  return finishAuthoredMotionBind(checked, nodesByName);
}

function finishAuthoredMotionBind(checked, nodesByName) {
  const groups = new Map();
  for (const binding of checked.bindings) {
    const nodeName = binding.node || motionNodeNameFor(binding.id);
    const matches = nodesByName.get(nodeName) || [];
    const restT = binding.restPose.translation;
    const restQ = binding.restPose.rotation;
    const nodes = [];
    for (const node of matches) {
      const local = nodeLocalRest(node);
      const drift = Math.hypot(
        local.t[0] - restT[0], local.t[1] - restT[1], local.t[2] - restT[2],
      );
      if (drift > REST_EPS_POS || !quatMatches(local.q, restQ)) {
        throw new Error(
          `motion bank ${checked.rigId} binding ${binding.id}: node ${nodeName} rest pose `
          + `does not match the bank (bank rest ${restT}, node ${local.t}) — the channel is `
          + 'rest-relative and the GLB moved since the bake.',
        );
      }
      markAnimated(node);
      nodes.push(node);
    }
    if (nodes.length === 0) {
      const required = binding.requiredAtLod || [];
      if (required.length > 0 || !(binding.optionalAtLod || []).length) {
        throw new Error(
          `motion bank ${checked.rigId} binding ${binding.id}: no ${nodeName} node under this root.`,
        );
      }
    }
    // `delta` is the per-frame merge slot: update() writes sampled channels straight into it
    // (stamped once per call) instead of building a throwaway Map of fresh arrays per clip.
    groups.set(binding.id, {
      binding,
      nodes,
      delta: { t: [0, 0, 0], q: [0, 0, 0, 1], hasT: false, hasR: false, stamp: 0 },
    });
  }

  const clips = new Map();
  for (const clip of checked.clips) clips.set(clip.name, clip);

  // Max reach each bound group can displace a subtree vertex, per binding: rotation keys are
  // rest-relative deltas, so the largest deviation is the key with the smallest |w|; chord
  // factor 2·sin(θ/2) = 2·sqrt(1-|w|²). Translation keys add |t| directly. The consumer
  // multiplies the chord factor by the node's measured subtree radius (world space, lazy)
  // and sums across bindings — nested pivots compose linearly, same-named LOD twins are
  // maxed not summed (only one level draws).
  const padSpecs = [];
  for (const [groupId, group] of groups) {
    let chordFactor = 0;
    let tMax = 0;
    for (const clip of checked.clips) {
      for (const channel of clip.channels) {
        if (channel.group !== groupId) continue;
        const values = channel.values;
        if (channel.path === 'rotation') {
          for (let i = 0; i < values.length; i += 4) {
            const w = Math.abs(values[i + 3]);
            const factor = 2 * Math.sqrt(Math.max(0, 1 - Math.min(1, w) ** 2));
            if (factor > chordFactor) chordFactor = factor;
          }
        } else {
          for (let i = 0; i < values.length; i += 3) {
            const t = Math.hypot(values[i], values[i + 1], values[i + 2]);
            if (t > tMax) tMax = t;
          }
        }
      }
    }
    if (chordFactor > 0 || tMax > 0) {
      padSpecs.push({ nodes: group.nodes, chordFactor, tMax });
    }
  }

  // A LOOPING 'authoredMotion:attach' clip is this rig's ambient idle — it is the clip the
  // resume block re-enters and the one reduced-motion parks.
  const attachClipName = (checked.events || {})['authoredMotion:attach'];
  const ambientClip = attachClipName && clips.get(attachClipName) && clips.get(attachClipName).loop
    ? attachClipName : null;
  // Merge scratch for update(): stamped per call, zero allocation in the frame loop.
  let mergeStamp = 0;
  const scratchQ = [0, 0, 0, 1];
  function lastClipName() {
    let last = null;
    for (const key of state.clips.keys()) last = key;
  }

  const state = {
    // Active clips, insertion-ordered by start time. Clips are independent — separate rig
    // groups may sweep concurrently (dish scan while the mining head is deployed); two clips
    // channeling the same group resolve latest-started-wins.
    clips: new Map(),
    latest: null,
    generation: -1,
    parked: true,
  };
  let disposed = false;
  // run.superseded: Map<groupId, claimSeq[]> — which claims stole each channel group.
  // A stack, not a flag: an overlay releasing its claims must hand the group back to
  // the run that superseded the victim before IT arrived, not unmark the victim entirely.
  const markSuperseded = (run, group, claimSeq) => {
    const marks = run.superseded || (run.superseded = new Map());
    const list = marks.get(group);
    if (!list) marks.set(group, [claimSeq]);
    else if (!list.includes(claimSeq)) list.push(claimSeq);
  };
  // Merge order is start-order: Map insertion tracks re-insertions, not claim
  // chronology, so a resumed ambient must not overwrite the newer runs it lost to.
  const runsBySeq = () => [...state.clips].sort(
    (a, b) => (a[1].seq || 0) - (b[1].seq || 0),
  );
  // Each settle gets its own clip name — two settles in one tick (scoped blends on
  // different rigs sharing this bank) would otherwise clobber one another by name.
  let settleSerial = 0;
  // Parked settles can never run again — drop them from the bank map so a long session
  // of aborts/early-completions can't accumulate dead clip objects. Run only after the
  // surviving run-entries are in state.clips; anything not referenced there is dead.
  function trimParkedSettles() {
    for (const name of [...clips.keys()]) {
      if (name.startsWith('__settle__') && !state.clips.has(name)) clips.delete(name);
    }
  }

  // Claim order across restarts — Map insertion order alone lies once a clip restarts
  // (delete+set moves it to the end). Every run stamps its own start sequence.
  let startSeqCounter = 0;

  /**
   * Release a drained OVERLAY clip's claims: groups it covered go back to the still-alive
   * clips underneath (a held base pose or a running loop) — unless a run started after the
   * overlay claims the same group (its transition owns the group now). Non-overlay clips
   * release nothing: a state-transition clip's claims must outlive its own park, or a held
   * predecessor would re-apply its pose the frame the newer clip deletes (deploy/stow).
   */
  function releaseOverlayClaims(overlayRun, overlayClip) {
    const groups = new Set(overlayClip.channels.map((channel) => channel.group));
    for (const group of groups) {
      let claimedByNewerSeq = -1;
      for (const [otherName, otherRun] of state.clips) {
        if (otherRun.seq <= overlayRun.seq) continue;
        const other = clips.get(otherName);
        if (other && other.channels.some((channel) => channel.group === group)) {
          claimedByNewerSeq = otherRun.seq;
          break;
        }
      }
      for (const [otherName, otherRun] of state.clips) {
        if (otherRun.seq >= overlayRun.seq || !otherRun.superseded) continue;
        const other = clips.get(otherName);
        if (other && other.channels.some((channel) => channel.group === group)) {
          const list = otherRun.superseded.get(group);
          if (!list) continue;
          const idx = list.indexOf(overlayRun.seq);
          if (idx >= 0) list.splice(idx, 1);
          if (!list.length) {
            // A newer claim owns this group now: the victim stays superseded, but its
            // mark must be the live claimant's seq — the drained overlay's mark is stale
            // and would strand the group when that newer claim later releases.
            if (claimedByNewerSeq >= 0) list.push(claimedByNewerSeq);
            else otherRun.superseded.delete(group);
          }
        }
      }
    }
  }

  // Nothing owns a single channel right now: either no clips run at all or every run's
  // channels are superseded — a rig in this state poses at rest and is eligible for
  // ambient resume (a superseded ambient loop counts as dead, not as cover).
  function nothingDriving() {
    for (const [name, run] of state.clips) {
      const clip = clips.get(name);
      if (!clip) continue;
      if (clip.channels.some((channel) => !(run.superseded && run.superseded.has(channel.group)))) {
        return false;
      }
    }
    return true;
  }

  function restAll() {
    for (const { binding, nodes } of groups.values()) {
      for (const node of nodes) {
        node.position.set(...binding.restPose.translation);
        node.quaternion.set(...binding.restPose.rotation);
      }
    }
  }

  const controller = {
    rigId: checked.rigId,
    get state() { return state.latest || 'rest'; },
    get generation() { return state.generation; },
    get groupCount() { return groups.size; },
    groupNodeCount(id) {
      const g = groups.get(id);
      return g ? g.nodes.length : 0;
    },
    clipActive(name) {
      // Presence is not enough: a fully-superseded hold clip keeps its run in
      // state.clips (it is the state owner a transient rides over) but poses nothing,
      // and a `!clipActive` gate would stay closed forever after a permanent reset.
      if (this.clipDrives(name)) return true;
      // A bridge chaining into `name` is the clip in transit — gates checking 'is the
      // verb busy' must see through the blend or they re-fire mid-hand-off.
      for (const runName of state.clips.keys()) {
        const clip = clips.get(runName);
        if (clip && clip.thenClip === name) return true;
      }
      return false;
    },
    // A run that still DRIVES at least one channel: a fully-superseded hold clip stays in
    // state.clips (it is the state owner a transient rides over) but poses nothing, so
    // 'is this clip posing the rig' must look past presence to live channels.
    clipDrives(name) {
      const run = state.clips.get(name);
      const clip = clips.get(name);
      if (!run || !clip) return false;
      return clip.channels.some((channel) => !(run.superseded && run.superseded.has(channel.group)));
    },
    activeClipNames() { return [...state.clips.keys()]; },
    // Bus-side stale-state probe: a hold-ended clip keeps its group claimed, so 'any clip
    // touching these groups' is the truth for whether a rig is still posed (a rebuilt
    // entity's flag must not outlive the clips it tracked).
    hasActiveClipsIn(groupIds = []) {
      const wanted = new Set(groupIds);
      for (const [name, run] of state.clips) {
        const clip = clips.get(name);
        // Live ownership, not declared channels: a clip superseded out of a group no longer
        // poses it, so it must not count as 'still active there'.
        if (clip && clip.channels.some((ch) => wanted.has(ch.group)
          && !(run.superseded && run.superseded.has(ch.group)))) return true;
      }
      return false;
    },
    clipElapsed(name, timeS) {
      const run = state.clips.get(name);
      if (!run) return null;
      return ((Number.isFinite(timeS) ? timeS : 0) - run.startS) * run.rateScale;
    },
    clipDuration(name) {
      const clip = clips.get(name);
      return clip ? clip.durationS : null;
    },
    groups,
    get motionPadSpec() { return padSpecs; },

    /**
     * Blend every currently-posed group back to rest over durationS — the early-disengage
     * path: a clip interrupted mid-flight must not teleport to another clip's first key.
     * Synthesizes a rest-targeted clip from the live merged pose (identity rotation /
     * zero translation at rest); 'rest' endMode parks the rig when the blend lands.
     */
    settle(durationS = 1.0, timeS = 0) {
      if (disposed || !state.clips.size) return false;
      const at = Number.isFinite(timeS) ? timeS : 0;
      const duration = Number.isFinite(durationS) && durationS > 0 ? durationS : 1;
      const merged = new Map();
      for (const [name, run] of runsBySeq()) {
        const clip = clips.get(name);
        if (!clip) continue;
        const t = (at - run.startS) * run.rateScale;
        const deltas = evaluateMotionClip(
          checked, clip, clip.loop ? t : Math.min(t, clip.durationS),
        );
        for (const [groupId, delta] of deltas) {
          if (run.superseded && run.superseded.has(groupId)) continue;
          merged.set(groupId, delta);
        }
      }
      const channels = [];
      for (const [groupId, delta] of merged) {
        if (Array.isArray(delta.translation)) {
          channels.push({
            group: groupId, path: 'translation', times: [0, duration],
            values: [...delta.translation, 0, 0, 0],
          });
        }
        if (Array.isArray(delta.rotation)) {
          channels.push({
            group: groupId, path: 'rotation', times: [0, duration],
            values: [...delta.rotation, 0, 0, 0, 1],
          });
        }
      }
      const settleName = `__settle__${++settleSerial}`;
      const settleClip = {
        name: settleName, durationS: duration, loop: false, endMode: 'rest', channels,
      };
      clips.set(settleName, settleClip);
      state.clips.clear();
      state.clips.set(settleName, { startS: at, rateScale: 1, seq: ++startSeqCounter });
      trimParkedSettles();
      state.latest = settleName;
      state.parked = false;
      return true;
    },

    /**
     * settle() scoped to a subset of channel groups — the interrupt path for one rig on a
     * shared bank: an aborted repair must fold its service arm home without parking the
     * scanner or iris mid-sweep. Clips owning any settled group are dropped so they cannot
     * re-claim it once the blend parks; clips on other groups keep running. Callers must
     * choose group sets that do not bisect a clip — a clip touching both settled and
     * unsettled groups is dropped whole.
     */
    settleGroups(durationS = 1.0, timeS = 0, groupIds = [], thenClipName = null) {
      if (disposed || !state.clips.size) return false;
      const at = Number.isFinite(timeS) ? timeS : 0;
      const wanted = new Set(groupIds || []);
      if (!wanted.size) return false;
      const duration = Number.isFinite(durationS) && durationS > 0 ? durationS : 1;
      // Optional follow-on clip: blend each group onto that clip's START pose, then
      // chain into it on drain — a verb landing mid-flight eases through the next
      // clip's doorway instead of teleporting to its first key.
      const thenClip = thenClipName != null ? clips.get(thenClipName) : null;
      const thenDeltas = thenClip ? evaluateMotionClip(checked, thenClip, 0) : null;
      const merged = new Map();
      for (const [name, run] of runsBySeq()) {
        const clip = clips.get(name);
        if (!clip) continue;
        const t = (at - run.startS) * run.rateScale;
        const deltas = evaluateMotionClip(
          checked, clip, clip.loop ? t : Math.min(t, clip.durationS),
        );
        for (const [groupId, delta] of deltas) {
          if (run.superseded && run.superseded.has(groupId)) continue;
          merged.set(groupId, delta);
        }
      }
      const channels = [];
      for (const groupId of wanted) {
        const delta = merged.get(groupId);
        if (!delta) continue;
        const target = thenDeltas && thenDeltas.get(groupId);
        if (Array.isArray(delta.translation)) {
          channels.push({
            group: groupId, path: 'translation', times: [0, duration],
            values: [
              ...delta.translation,
              ...(target && Array.isArray(target.translation) ? target.translation : [0, 0, 0]),
            ],
          });
        }
        if (Array.isArray(delta.rotation)) {
          channels.push({
            group: groupId, path: 'rotation', times: [0, duration],
            values: [
              ...delta.rotation,
              ...(target && Array.isArray(target.rotation) ? target.rotation : [0, 0, 0, 1]),
            ],
          });
        }
      }
      if (!channels.length) return false;
      const settleName = `__settle__${++settleSerial}`;
      const settleClip = {
        name: settleName, durationS: duration, loop: false, endMode: 'rest',
        thenClip: thenClip ? thenClip.name : null, channels,
      };
      clips.set(settleName, settleClip);
      for (const [name, run] of [...state.clips]) {
        const clip = clips.get(name);
        // Drop a clip only when a LIVE (non-superseded) channel is being settled — declared
        // overlap alone would kill a clip whose wanted groups were already claimed away,
        // snapping its remaining live groups.
        if (clip && clip.channels.some((ch) => wanted.has(ch.group)
          && !(run.superseded && run.superseded.has(ch.group)))) {
          state.clips.delete(name);
        }
      }
      state.clips.set(settleName, { startS: at, rateScale: 1, seq: ++startSeqCounter });
      // Runs after settleName joins state.clips so the fresh clip is never collected as dead.
      trimParkedSettles();
      state.latest = settleName;
      state.parked = false;
      return true;
    },

    /**
     * Start a clip (or restart it if it is already active). `generation` orders duplicate events —
     * a stale or repeated generation is ignored so an event replayed on restore cannot restart
     * the same sweep. Passing state 'rest' or 'idle' parks the whole rig at its authored rest pose.
     */
    setState({ state: clipName, startTimeS, rateScale = 1, generation, noBridge = false, deferToSeq = null } = {}) {
      if (disposed) return false;
      if (generation != null && state.generation >= 0 && generation <= state.generation) {
        return false;
      }
      if (clipName === 'rest' || clipName === 'idle' || clipName == null) {
        if (generation != null) state.generation = generation;
        state.clips.clear();
        trimParkedSettles();
        state.latest = null;
        state.parked = true;
        restAll();
        return true;
      }
      const clip = clips.get(clipName);
      if (!clip) {
        throw new Error(`motion bank ${checked.rigId} has no clip "${clipName}".`);
      }
      const claimed = new Set(clip.channels.map((channel) => channel.group));
      // Auto-bridge: a claimed group already posed somewhere else (ambient loop mid-cycle,
      // an interrupted verb) would teleport to this clip's first key. Synthesize a short
      // settle clip live→key0 that chains into the real clip on drain — every event then
      // enters through the doorway the author keyed, whatever pose the rig was in.
      const bridgeChannels = [];
      let rotDist = 0;
      let posDist = 0;
      let needsBridge = false;
      const livePose = new Map();
      const startDeltas = evaluateMotionClip(checked, clip, 0);
      const live = new Map();
      const at = Number.isFinite(startTimeS) ? startTimeS : 0;
      for (const [otherName, otherRun] of runsBySeq()) {
        const other = clips.get(otherName);
        if (!other) continue;
        const t = (at - otherRun.startS) * otherRun.rateScale;
        const deltas = evaluateMotionClip(
          checked,
          other,
          other.loop
            ? ((t % other.durationS) + other.durationS) % other.durationS
            : Math.min(Math.max(t, 0), other.durationS),
        );
        for (const [groupId, delta] of deltas) {
          if (otherRun.superseded && otherRun.superseded.has(groupId)) continue;
          live.set(groupId, delta);
        }
      }
      for (const groupId of claimed) {
        const here = live.get(groupId);
        const door = startDeltas.get(groupId);
        const pos = (here && here.translation) || [0, 0, 0];
        const rot = (here && here.rotation) || [0, 0, 0, 1];
        const posT = (door && door.translation) || [0, 0, 0];
        const rotT = (door && door.rotation) || [0, 0, 0, 1];
        const dPos = Math.hypot(pos[0] - posT[0], pos[1] - posT[1], pos[2] - posT[2]);
        const dRot = quatAngleBetween(rot, rotT);
        rotDist = Math.max(rotDist, dRot);
        posDist = Math.max(posDist, dPos);
        if (dPos > BRIDGE_POS_EPS || dRot > BRIDGE_ROT_EPS) needsBridge = true;
        livePose.set(groupId, { pos, rot, posT, rotT });
      }
      if (!noBridge && needsBridge) {
        // The bridge supersedes every claimed group, so its write-set must equal its
        // claim-set: groups already within epsilon get a flat live→key0 channel too —
        // otherwise they lose their writer, park at rest for the blend, and pop twice
        // (bridge entry, drain→follow-on hand-off). Uniform claims also keep the
        // contested-inheritance bookkeeping consistent — no half-driven rigs.
        for (const groupId of claimed) {
          const p = livePose.get(groupId);
          bridgeChannels.push({
            group: groupId, path: 'translation', times: [0, 1],
            values: [...p.pos, ...p.posT],
          });
          bridgeChannels.push({
            group: groupId, path: 'rotation', times: [0, 1],
            values: [...p.rot, ...p.rotT],
          });
        }
      }
      if (!noBridge && bridgeChannels.length) {
        const duration = Math.min(BRIDGE_MAX_S, Math.max(BRIDGE_MIN_S,
          Math.max(rotDist / BRIDGE_ROT_SPEED, posDist / BRIDGE_POS_SPEED)));
        for (const ch of bridgeChannels) {
          ch.times = [0, duration];
        }
        const bridgeName = `__settle__${++settleSerial}`;
        clips.set(bridgeName, {
          name: bridgeName, durationS: duration, loop: false, endMode: 'rest',
          // Overlay: the bridge's supersede marks must release on drain or they leak
          // forever — a held base clip (gate:index) would stay superseded after its
          // follow-on lands, leaving owned groups parked at rest.
          overlay: true, thenClip: clipName, channels: bridgeChannels,
        });
        const bridgeSeq = ++startSeqCounter;
        for (const [otherName, otherRun] of [...state.clips]) {
          if (otherName === clipName) continue;
          for (const group of claimed) markSuperseded(otherRun, group, bridgeSeq);
        }
        state.clips.delete(clipName);
        state.clips.set(bridgeName, {
          startS: Number.isFinite(startTimeS) ? startTimeS : 0,
          rateScale: 1, seq: bridgeSeq,
        });
        trimParkedSettles();
        if (generation != null) state.generation = generation;
        state.latest = bridgeName;
        state.parked = false;
        return true;
      }
      // A started clip permanently supersedes older clips on every group it channels.
      // Latest-started-wins must outlive the younger clip's own rest-park — otherwise a held
      // earlier clip (endMode 'hold', never evicted) re-applies its delta the frame the newer
      // clip deletes, snapping the rig back to the superseded pose (breach↔seal, index↔reset,
      // deploy↔stow).
      // Chained starts (deferToSeq = the draining bridge's seq) settle only what their
      // bridge held: a group re-claimed by anything newer than the bridge is contested —
      // the chain must not steal it back.
      const claimSeq = ++startSeqCounter;
      const contested = new Map();
      if (deferToSeq != null) {
        for (const group of claimed) {
          for (const [otherName, otherRun] of state.clips) {
            if (otherName === clipName || (otherRun.seq || 0) <= deferToSeq) continue;
            const other = clips.get(otherName);
            if (!other || !other.channels.some((ch) => ch.group === group)) continue;
            if (otherRun.superseded && otherRun.superseded.has(group)) continue;
            contested.set(group, otherRun.seq);
            break;
          }
        }
      }
      for (const [otherName, otherRun] of [...state.clips]) {
        if (otherName === clipName) continue;
        const other = clips.get(otherName);
        if (!other) continue;
        // Fully-claimed runs are kept, not deleted: a held base state must stay readable
        // (clipActive gates on the run's presence) and an overlay draining later hands the
        // groups back to whatever survives underneath.
        for (const group of claimed) {
          if (contested.has(group) && (otherRun.seq || 0) > deferToSeq) continue;
          markSuperseded(otherRun, group, claimSeq);
        }
      }
      if (generation != null) state.generation = generation;
      state.clips.delete(clipName);
      const run = {
        startS: Number.isFinite(startTimeS) ? startTimeS : 0,
        rateScale: Number.isFinite(rateScale) && rateScale > 0 ? rateScale : 1,
        seq: claimSeq,
      };
      if (contested.size) {
        for (const [group, winnerSeq] of contested) markSuperseded(run, group, winnerSeq);
      }
      state.clips.set(clipName, run);
      state.latest = clipName;
      state.parked = false;
      return true;
    },

    /**
     * Advance every bound pivot to the merged clip pose at `timeS` (eval-clock seconds).
     * `a11y` mirrors the renderer's accessibility options: `reducedMotion`/`motionReduce`
     * parks the ambient attach loop entirely and damps event-clip deltas to REDUCED_AMP,
     * matching the rest of the motion systems' reduced-motion convention.
     */
    update(timeS, a11y) {
      if (disposed) return;
      const reduced = !!(a11y && (a11y.reducedMotion === true || a11y.motionReduce === true));
      const dampen = reduced ? REDUCED_AMP : 1;
      mergeStamp += 1;
      // Drain pass first: a rest-ended clip releases its overlay claims before anything
      // samples this frame — otherwise an older clip released this same frame already
      // skipped its channels and the group flashes rest for exactly one update.
      for (const [name, run] of [...state.clips]) {
        const clip = clips.get(name);
        if (!clip) {
          // A run-entry outliving its clip must not throw inside the frame loop — drop it
          // like a parked clip rather than failing the whole entity pass.
          state.clips.delete(name);
          if (state.latest === name) state.latest = lastClipName();
          continue;
        }
        const t = (timeS - run.startS) * run.rateScale;
        if (!clip.loop && t >= clip.durationS && (clip.endMode || 'rest') === 'rest') {
          // Rest-ended clips park this frame — their final pose is excluded from the merge so
          // owned groups land exactly at rest (or under a still-active clip's delta).
          if (clip.overlay === true) releaseOverlayClaims(run, clip);
          state.clips.delete(name);
          if (state.latest === name) state.latest = lastClipName();
          // A settle chain hands off to its follow-on clip the frame it lands — the blend
          // ended exactly where that clip's first key poses the groups, so the start is
          // seamless and the authored clip still plays its full length. The merge just
          // lost this run's held pose, so the hand-off skips the live-pose bridge check:
          // the pose on the nodes already IS that clip's first key.
          if (clip.thenClip && clips.has(clip.thenClip)) {
            this.setState({ state: clip.thenClip, startTimeS: timeS, noBridge: true, deferToSeq: run.seq });
          }
        }
      }
      if (nothingDriving()) {
        // An explicit 'rest' park or a fully-superseded ambient run silences the rig only
        // while nothing drives — it must not permanently kill the ambient idle. Runs after
        // the drain pass so a rig whose last clip drained this update resumes this same
        // frame instead of spending one update at rest. Routing through setState gives the
        // resume the same live→key0 bridge any event gets. No early return: with no ambient
        // to resume the sample pass still has to land the drained groups at rest — bailing
        // here leaves the nodes frozen at the last written pose.
        if (!reduced && ambientClip !== null) {
          this.setState({ state: ambientClip, startTimeS: timeS });
        }
      }
      for (const [name, run] of runsBySeq()) {
        const clip = clips.get(name);
        if (!clip) continue;
        const t = (timeS - run.startS) * run.rateScale;
        if (reduced && ambientClip !== null && name === ambientClip) continue;
        const local = clip.loop === true
          ? ((t % clip.durationS) + clip.durationS) % clip.durationS
          : Math.min(Math.max(t, 0), clip.durationS);
        // Loop clips hand their period to the sampler so smooth (cubic) channels get periodic
        // tangents at the seam; one-shots ease from and to rest.
        const period = clip.loop === true ? clip.durationS : 0;
        // Write channel samples straight into each group's stamped delta slot — latest-started
        // wins a shared group, and groups a newer clip permanently claimed stay suppressed.
        for (const channel of clip.channels) {
          if (run.superseded && run.superseded.has(channel.group)) continue;
          const slot = groups.get(channel.group);
          if (!slot) continue;
          const delta = slot.delta;
          if (delta.stamp !== mergeStamp) {
            delta.stamp = mergeStamp;
            delta.hasT = false;
            delta.hasR = false;
          }
          if (channel.path === 'translation') {
            sampleChannelInto(channel, local, delta.t, period);
            if (dampen !== 1) {
              delta.t[0] *= dampen; delta.t[1] *= dampen; delta.t[2] *= dampen;
            }
            delta.hasT = true;
          } else {
            sampleChannelInto(channel, local, delta.q, period);
            if (dampen !== 1) dampQuat(delta.q, dampen);
            delta.hasR = true;
          }
        }
      }
      for (const { binding, nodes, delta } of groups.values()) {
        const active = delta.stamp === mergeStamp && (delta.hasT || delta.hasR);
        const restT = binding.restPose.translation;
        const restQ = binding.restPose.rotation;
        for (const node of nodes) {
          if (!active || !nodeHasVisibleMesh(node)) {
            // No clip owns this group right now, or a hidden part: park at rest.
            node.position.set(...restT);
            node.quaternion.set(...restQ);
            continue;
          }
          if (delta.hasT) {
            node.position.set(
              restT[0] + delta.t[0],
              restT[1] + delta.t[1],
              restT[2] + delta.t[2],
            );
          } else {
            node.position.set(...restT);
          }
          if (delta.hasR) {
            quatMulInto(scratchQ, restQ[0], restQ[1], restQ[2], restQ[3],
              delta.q[0], delta.q[1], delta.q[2], delta.q[3]);
            node.quaternion.set(scratchQ[0], scratchQ[1], scratchQ[2], scratchQ[3]);
          } else {
            node.quaternion.set(...restQ);
          }
        }
      }
      // Ambient resume: a bank that maps the synthetic 'authoredMotion:attach' event to a
      // LOOPING clip treats it as the rig's idle life — started once at attach (the render-side
      // attach kick) and re-entered whenever the last event clip drains. One-shot attach clips
      // and rigs that never declare the event are unaffected; an explicit rest setState still
      // parks for a frame but the next update resumes ambient, which is what a docked machine
      // should look like (calm, not dead). Reduced-motion holds the rig parked instead.
      if (nothingDriving()) {
        state.parked = true;
        if (!reduced && ambientClip !== null) {
          this.setState({ state: ambientClip, startTimeS: timeS });
        }
      }
    },

    /**
     * The clip a bank-declared event would start, or null. Read-only view of the bank's own event map, so
     * a bus gate can ask "is this event's verb already playing?" (`clipActive(eventClip(type))`) without
     * hard-coding clip names per rig.
     */
    eventClip(type) {
      const name = (checked.events || {})[type];
      return typeof name === 'string' ? name : null;
    },

    /**
     * Optional bank-declared event map: `events: {'scan:pulse': 'scan'}`. Events without an entry
     * are ignored — the controller never guesses at gameplay semantics.
     */
    handleEvent(type, payload, simNow) {
      const map = checked.events || {};
      const clip = map[type];
      if (clip === undefined) return false;
      return this.setState({
        state: clip,
        // simNow is the effective anchor: the bus has already translated any payload.simTime
        // onto the eval clock's domain. Re-reading it here would anchor into raw sim time,
        // which diverges from the eval clock across any dock freeze.
        startTimeS: simNow,
        generation: payload && payload.seq,
      });
    },

    /** Restore every bound node to its rest pose and release the controller. */
    dispose() {
      if (disposed) return;
      disposed = true;
      state.clips.clear();
      restAll();
    },
  };
  return controller;
}
