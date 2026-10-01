// ANI-35 — motion-bank writer for the engine-part nozzle gimbals.
//
// The parts-library engines ship no Forge shipbuilder, so their bank is emitted
// directly: rest poses are read back out of the RELEASE GLBs (the same nodes the
// package seal checks), and the three thrust-behavior clips bake to dense 60 fps
// linear channels just like the Blender-side MotionBank output.
//
//   node tools/blender/forge/animations/ANI_35_bank.mjs
//
// Rigs: engine_vector + engine_plasma_ring share one 'eng_nozzle' group;
// engine_ion_twin keys 'eng_nozzle_p' + 'eng_nozzle_s' (the starboard pod lags
// the port by a few frames — machinery, not a mirror).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FPS = 60;

function glbNodes(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString()).nodes || [];
}
function nodeTrs(nodes, name) {
  const n = nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ${name} missing`);
  return {
    translation: n.translation || [0, 0, 0],
    rotation: n.rotation || [0, 0, 0, 1],
    scale: n.scale || [1, 1, 1],
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
function bake(keys, duration, { loop = false } = {}) {
  // keys: [(t, pitchRad, yawRad)] — dense-sample smooth interpolation at 60 fps.
  const times = [], pitch = [], yaw = [];
  const frames = Math.max(1, Math.round(duration * FPS));
  for (let f = 0; f <= frames; f++) {
    const t = f / FPS;
    times.push(t);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] < t) i++;
    const [t0, p0, y0] = keys[i];
    const [t1, p1, y1] = keys[Math.min(i + 1, keys.length - 1)];
    const u = t1 > t0 ? smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) : 1;
    pitch.push(p0 + (p1 - p0) * u);
    yaw.push(y0 + (y1 - y0) * u);
  }
  return { times, pitch, yaw };
}
function eulerToQuat(rx, ry, rz) {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  // glTF order XYZ — pitch about Z (starboard), yaw about Y (up).
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}
function rotChannel(group, keys, duration) {
  const { times, pitch, yaw } = bake(keys, duration);
  const values = [];
  for (let i = 0; i < times.length; i++) values.push(...eulerToQuat(0, yaw[i], pitch[i]));
  return { group, path: 'rotation', times, values, interpolation: 'linear' };
}
const clip = (name, durationS, loop, endMode, channels) =>
  ({ name, durationS, loop, endMode, channels });

// pitch-z rad / yaw-y rad key sets — same machinery vocabulary across engines.
const SPOOL = [[0, 0, 0], [0.15, 0.14, 0.02], [0.45, -0.05, -0.01], [0.7, 0.02, 0.0], [0.9, 0, 0]];
const GIMBAL = [[0, 0, 0], [0.12, 0.105, 0.015], [0.3, -0.055, -0.01], [0.45, 0, 0]];
const FLARE = [[0, 0, 0], [0.1, -0.19, -0.03], [0.32, 0.07, 0.01], [0.5, 0, 0]];
const lag = (keys, dt) => keys.map(([t, p, y]) => [t + dt, p, y]);

function bank(rigId, sourceAssetId, glbPath, groups, clipsExtra = {}) {
  const nodes = glbNodes(glbPath);
  const bindings = groups.map(({ id, node, parent }) => ({
    id, node, parent: parent || null,
    restPose: nodeTrs(nodes, node), requiredAtLod: [0],
  }));
  const clips = [
    clip('nozzle_spool', 0.9, false, 'rest', groups.map((g) =>
      rotChannel(g.id, g.lag ? lag(SPOOL, g.lag) : SPOOL, 0.9 + (g.lag || 0)))),
    clip('nozzle_gimbal_pitch', 0.45, false, 'rest', groups.map((g) =>
      rotChannel(g.id, g.lag ? lag(GIMBAL, g.lag) : GIMBAL, 0.45 + (g.lag || 0)))),
    clip('nozzle_flare', 0.5, false, 'rest', groups.map((g) =>
      rotChannel(g.id, g.lag ? lag(FLARE, g.lag) : FLARE, 0.5 + (g.lag || 0)))),
    ...(clipsExtra.clips || []),
  ];
  const glbSha = createHash('sha256').update(readFileSync(glbPath)).digest('hex');
  return {
    schema: 'spaceface.rigidMotionBank.v1',
    rigId, sourceAssetId, sourceGlbSha256: glbSha, fps: FPS,
    bindings, clips,
    events: {
      'ship:thrust': 'nozzle_gimbal_pitch',
      'ship:boostStart': 'nozzle_spool',
      'ship:dash': 'nozzle_flare',
      'ship:swingDash': 'nozzle_flare',
      ...(clipsExtra.events || {}),
    },
  };
}

const ENG = join(ROOT, 'assets', 'ships', 'release', 'parts', 'engines');
const OUT = join(ROOT, 'assets', 'ships', 'motions');
mkdirSync(OUT, { recursive: true });

const banks = [
  ['engine_vector', 'SF_PART_ENGINE_VECTOR', join(ENG, 'engine_vector.glb'),
    [{ id: 'eng_nozzle', node: 'MOTION_ENG_NOZZLE' }]],
  ['engine_ion_twin', 'SF_PART_ENGINE_ION_TWIN', join(ENG, 'engine_ion_twin.glb'),
    [{ id: 'eng_nozzle_p', node: 'MOTION_ENG_NOZZLE_P' },
     { id: 'eng_nozzle_s', node: 'MOTION_ENG_NOZZLE_S', lag: 0.05 }]],
  ['engine_plasma_ring', 'SF_PART_ENGINE_PLASMA_RING', join(ENG, 'engine_plasma_ring.glb'),
    [{ id: 'eng_nozzle', node: 'MOTION_ENG_NOZZLE' }]],
];
for (const [key, assetId, glb, groups] of banks) {
  const file = join(OUT, `${key.replace(/_/g, '-')}.motion.json`);
  writeFileSync(file, JSON.stringify(bank(key, assetId, glb, groups)));
  console.log(`[motion-bank] ${file} rig=${key}`);
}
