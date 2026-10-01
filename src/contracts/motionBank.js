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
const INTERPOLATIONS = new Set(['linear', 'slerp']);
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

function quatMul(ax, ay, az, aw, bx, by, bz, bw) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatConj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Quaternion spherical linear interpolation; takes the short arc. */
export function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bx = b[0]; let by = b[1]; let bz = b[2]; let bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    return normalizeQuat(
      a[0] + t * (bx - a[0]), a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]), a[3] + t * (bw - a[3]),
    );
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [
    a[0] * wa + bx * wb, a[1] * wa + by * wb,
    a[2] * wa + bz * wb, a[3] * wa + bw * wb,
  ];
}

function sampleChannel(channel, t) {
  const times = channel.times;
  const values = channel.values;
  const stride = channel.path === 'translation' ? 3 : 4;
  if (t <= times[0]) return values.slice(0, stride);
  const last = times.length - 1;
  if (t >= times[last]) return values.slice(last * stride, last * stride + stride);
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 0 ? (t - times[lo]) / span : 0;
  const a = values.slice(lo * stride, lo * stride + stride);
  const b = values.slice(hi * stride, hi * stride + stride);
  if (channel.path === 'rotation' && (channel.interpolation || 'slerp') === 'slerp') {
    return slerp(a, b, f);
  }
  return a.map((v, i) => v + (b[i] - v) * f);
}

/**
 * Evaluate one clip at local time t (seconds). Returns Map<groupId, {translation?, rotation?}>
 * holding REST-RELATIVE deltas — translation is additive on the rest position, rotation is
 * left-multiplied onto the rest quaternion.
 */
export function evaluateMotionClip(bank, clip, t) {
  const local = clip.loop === true
    ? ((t % clip.durationS) + clip.durationS) % clip.durationS
    : Math.min(Math.max(t, 0), clip.durationS);
  const deltas = new Map();
  for (const channel of clip.channels) {
    let entry = deltas.get(channel.group);
    if (!entry) {
      entry = {};
      deltas.set(channel.group, entry);
    }
    entry[channel.path] = sampleChannel(channel, local);
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

function collectNodesByName(root, name) {
  const found = [];
  const stack = [...(root.children || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.name === name) found.push(node);
    for (const child of node.children || []) stack.push(child);
  }
  return found;
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
  const groups = new Map();
  for (const binding of checked.bindings) {
    const nodeName = binding.node || motionNodeNameFor(binding.id);
    const matches = collectNodesByName(root, nodeName);
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
    groups.set(binding.id, { binding, nodes });
  }

  const clips = new Map();
  for (const clip of checked.clips) clips.set(clip.name, clip);

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
  // Each settle gets its own clip name — two settles in one tick (scoped blends on
  // different rigs sharing this bank) would otherwise clobber one another by name.
  let settleSerial = 0;

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
    clipActive(name) { return state.clips.has(name); },
    activeClipNames() { return [...state.clips.keys()]; },
    // Bus-side stale-state probe: a hold-ended clip keeps its group claimed, so 'any clip
    // touching these groups' is the truth for whether a rig is still posed (a rebuilt
    // entity's flag must not outlive the clips it tracked).
    hasActiveClipsIn(groupIds = []) {
      const wanted = new Set(groupIds);
      for (const name of state.clips.keys()) {
        const clip = clips.get(name);
        if (clip && clip.channels.some((ch) => wanted.has(ch.group))) return true;
      }
      return false;
    },
    groups,

    /**
     * Blend every currently-posed group back to rest over durationS — the early-disengage
     * path: a clip interrupted mid-flight must not teleport to another clip's first key.
     * Synthesizes a rest-targeted clip from the live merged pose (identity rotation /
     * zero translation at rest); 'rest' endMode parks the rig when the blend lands.
     */
    settle(durationS = 1.0, timeS = 0) {
      if (disposed || !state.clips.size) return false;
      const duration = Number.isFinite(durationS) && durationS > 0 ? durationS : 1;
      const merged = new Map();
      for (const [name, run] of state.clips) {
        const clip = clips.get(name);
        if (!clip) continue;
        const t = (timeS - run.startS) * run.rateScale;
        const deltas = evaluateMotionClip(
          checked, clip, clip.loop ? t : Math.min(t, clip.durationS),
        );
        for (const [groupId, delta] of deltas) merged.set(groupId, delta);
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
      state.clips.set(settleName, { startS: timeS, rateScale: 1 });
      // Parked settles can never run again — drop them from the bank map so a long session
      // of aborts/early-completions can't accumulate dead clip objects. Must run after
      // state.clips.clear() so the just-superseded settles are collected too.
      for (const name of [...clips.keys()]) {
        if (name.startsWith('__settle__') && !state.clips.has(name)) clips.delete(name);
      }
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
    settleGroups(durationS = 1.0, timeS = 0, groupIds = []) {
      if (disposed || !state.clips.size) return false;
      const wanted = new Set(groupIds || []);
      if (!wanted.size) return false;
      const duration = Number.isFinite(durationS) && durationS > 0 ? durationS : 1;
      const merged = new Map();
      for (const [name, run] of state.clips) {
        const clip = clips.get(name);
        if (!clip) continue;
        const t = (timeS - run.startS) * run.rateScale;
        const deltas = evaluateMotionClip(
          checked, clip, clip.loop ? t : Math.min(t, clip.durationS),
        );
        for (const [groupId, delta] of deltas) merged.set(groupId, delta);
      }
      const channels = [];
      for (const groupId of wanted) {
        const delta = merged.get(groupId);
        if (!delta) continue;
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
      if (!channels.length) return false;
      const settleName = `__settle__${++settleSerial}`;
      const settleClip = {
        name: settleName, durationS: duration, loop: false, endMode: 'rest', channels,
      };
      clips.set(settleName, settleClip);
      for (const name of [...state.clips.keys()]) {
        const clip = clips.get(name);
        if (clip && clip.channels.some((ch) => wanted.has(ch.group))) {
          state.clips.delete(name);
        }
      }
      state.clips.set(settleName, { startS: timeS, rateScale: 1 });
      // Same parked-settle trim — clips dropped above may include prior settles. Runs after
      // settleName joins state.clips so the fresh clip is never collected as dead.
      for (const name of [...clips.keys()]) {
        if (name.startsWith('__settle__') && !state.clips.has(name)) clips.delete(name);
      }
      state.latest = settleName;
      state.parked = false;
      return true;
    },

    /**
     * Start a clip (or restart it if it is already active). `generation` orders duplicate events —
     * a stale or repeated generation is ignored so an event replayed on restore cannot restart
     * the same sweep. Passing state 'rest' or 'idle' parks the whole rig at its authored rest pose.
     */
    setState({ state: clipName, startTimeS, rateScale = 1, generation } = {}) {
      if (disposed) return false;
      if (generation != null && state.generation >= 0 && generation <= state.generation) {
        return false;
      }
      if (clipName === 'rest' || clipName === 'idle' || clipName == null) {
        if (generation != null) state.generation = generation;
        state.clips.clear();
        state.latest = null;
        state.parked = true;
        restAll();
        return true;
      }
      const clip = clips.get(clipName);
      if (!clip) {
        throw new Error(`motion bank ${checked.rigId} has no clip "${clipName}".`);
      }
      if (generation != null) state.generation = generation;
      state.clips.delete(clipName);
      state.clips.set(clipName, {
        startS: Number.isFinite(startTimeS) ? startTimeS : 0,
        rateScale: Number.isFinite(rateScale) && rateScale > 0 ? rateScale : 1,
      });
      state.latest = clipName;
      state.parked = false;
      return true;
    },

    /** Advance every bound pivot to the merged clip pose at `timeS` (sim seconds). */
    update(timeS) {
      if (disposed || !state.clips.size) return;
      const merged = new Map();
      for (const [name, run] of state.clips) {
        const clip = clips.get(name);
        if (!clip) {
          // A run-entry outliving its clip must not throw inside the frame loop — drop it
          // like a parked clip rather than failing the whole entity pass.
          state.clips.delete(name);
          if (state.latest === name) {
            state.latest = state.clips.size ? [...state.clips.keys()].pop() : null;
          }
          continue;
        }
        const t = (timeS - run.startS) * run.rateScale;
        if (!clip.loop && t >= clip.durationS && (clip.endMode || 'rest') === 'rest') {
          // Rest-ended clips park this frame — their final pose is excluded from the merge so
          // owned groups land exactly at rest (or under a still-active clip's delta).
          state.clips.delete(name);
          if (state.latest === name) {
            state.latest = state.clips.size ? [...state.clips.keys()].pop() : null;
          }
          continue;
        }
        const deltas = evaluateMotionClip(
          checked, clip, clip.loop ? t : Math.min(t, clip.durationS),
        );
        // Later map entries override earlier ones per group — newest clip wins a shared group.
        for (const [groupId, delta] of deltas) merged.set(groupId, delta);
      }
      for (const [id, { binding, nodes }] of groups) {
        const delta = merged.get(id) || {};
        const hasT = Array.isArray(delta.translation);
        const hasR = Array.isArray(delta.rotation);
        const restT = binding.restPose.translation;
        const restQ = binding.restPose.rotation;
        for (const node of nodes) {
          if (!nodeHasVisibleMesh(node) || (!hasT && !hasR)) {
            // No clip owns this group right now, or a hidden part: park at rest.
            node.position.set(...restT);
            node.quaternion.set(...restQ);
            continue;
          }
          node.position.set(
            restT[0] + delta.translation[0],
            restT[1] + delta.translation[1],
            restT[2] + delta.translation[2],
          );
          if (hasR) {
            const q = quatMul(restQ[0], restQ[1], restQ[2], restQ[3],
              delta.rotation[0], delta.rotation[1], delta.rotation[2], delta.rotation[3]);
            node.quaternion.set(q[0], q[1], q[2], q[3]);
          } else {
            node.quaternion.set(...restQ);
          }
        }
      }
      if (!state.clips.size) state.parked = true;
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
      state.clip = null;
      restAll();
    },
  };
  return controller;
}
