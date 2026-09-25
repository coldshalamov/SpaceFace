/**
 * Primary KPI: quiet-hidden `_updateEnergy` residual after #103.
 * Before = full `_energyPlumeRelevant` (player `_engineDriveFor` + N idle trail
 *   candidates each paying `_engineDriveFor`) every idle tick.
 * After  = `_energyQuietMaybeAwake` cheap wake (input/actuators/throttle/boost/
 *   speed-proxy) while latched; skip full drive walk.
 * Soft-GPU fps not claimed. Picture unchanged while quiet; wake still detects thrust.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const NPCS = 8;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const NPCS = ${NPCS};

function actuatorsFor(e) {
  const frame = e._flightFrame;
  if (frame && frame.actuators) return frame.actuators;
  return { lateral: 0, yaw: 0, reverse: 0, main: 0 };
}
function mainDriveDemand(actuators, scratch) {
  scratch.main = Math.max(0, actuators.main || 0);
  scratch.reverse = Math.max(0, actuators.reverse || 0);
  scratch.retroOnly = false;
  return scratch;
}
function engineDriveFor(e, out, state) {
  const frame = e._flightFrame || {};
  const vx = e.vel && Number.isFinite(e.vel.x) ? e.vel.x : 0;
  const vz = e.vel && Number.isFinite(e.vel.z) ? e.vel.z : 0;
  const speed = Math.hypot(vx, vz);
  const maxSpeed = Math.max(1, e.maxSpeed || 120);
  let throttle = Number.isFinite(frame.throttle) ? frame.throttle : 0;
  let pilotForward = 0;
  if (e.id === state.playerId) {
    const inp = state.input;
    if (inp && Number.isFinite(inp.moveZ) && inp.moveZ > 0) {
      pilotForward = Math.min(1.15, inp.moveZ);
      throttle = Math.max(throttle, pilotForward);
    }
  }
  const actuators = actuatorsFor(e);
  const md = mainDriveDemand(actuators, out._md || (out._md = {}));
  const reverse = md.reverse || 0;
  const cf = Math.cos(e.rot || 0), sf = Math.sin(e.rot || 0);
  const forwardSpeed = vx * cf + vz * sf;
  let forwardDrive = Math.min(1.1, Math.max(0, forwardSpeed) / Math.max(35, maxSpeed * 0.75));
  let speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
  let boost = e.flags && e.flags.boosting ? 1 : 0;
  let brake = 0;
  if (pilotForward <= 0.05 && throttle < 0.08 && speedDrive > 0.2) brake = Math.min(1, speedDrive * 0.55);
  let drive = Math.min(1.35, Math.max(throttle, forwardDrive * 0.85, speedDrive * 0.40) + boost * 0.45);
  if (pilotForward > 0.05) { drive = Math.max(drive, Math.min(1.15, pilotForward * 0.9)); brake = 0; }
  out.drive = drive; out.boost = boost; out.speedDrive = speedDrive; out.brake = brake;
  return out;
}

function energyPlumeRelevant(host) {
  const energy = host._energy;
  if (energy && (energy.plumeDrive > 0.02 || energy.boostBlend > 0.02)) return true;
  const player = host.state.entities.get(host.state.playerId);
  if (player && player.alive) {
    const actuators = actuatorsFor(player);
    if (actuators && (Math.abs(actuators.lateral||0) > 0.001 || Math.abs(actuators.yaw||0) > 0.001 || (actuators.reverse||0) > 0.001)) return true;
    const turn = Math.abs(host.state.input.turnIntent || 0);
    const pilotForward = host.state.input.moveZ || 0;
    const driveInfo = engineDriveFor(player, host._driveScratch, host.state);
    if (driveInfo.drive > 0.03 || driveInfo.boost > 0 || turn > 0.2 || pilotForward > 0.05 || driveInfo.speedDrive > 0.15 || driveInfo.brake > 0.1) return true;
  }
  const list = host._trailCandidates;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive || e.type !== 'ship') continue;
    if (player && e.id === player.id) continue;
    if (e.flags && e.flags.docked) continue;
    const d = engineDriveFor(e, host._driveScratch, host.state);
    if (d.drive > 0.03 || d.boost > 0) return true;
  }
  return false;
}

function energyMasslineRelevant(host) {
  const attachments = host.state.combat && host.state.combat.attachments && host.state.combat.attachments.byId;
  if (!attachments) return false;
  for (const key in attachments) {
    const a = attachments[key];
    if (!a || a.state !== 'active') continue;
    return true;
  }
  return false;
}

function energyQuietMaybeAwake(host) {
  const energy = host._energy;
  if (energy && (energy.plumeDrive > 0.02 || energy.boostBlend > 0.02)) return true;
  const player = host.state.entities.get(host.state.playerId);
  if (player && player.alive) {
    const actuators = actuatorsFor(player);
    if (actuators && (Math.abs(actuators.lateral||0) > 0.001 || Math.abs(actuators.yaw||0) > 0.001 || (actuators.reverse||0) > 0.001)) return true;
    const inp = host.state.input;
    if (inp) {
      if (Math.abs(inp.turnIntent || 0) > 0.2) return true;
      if ((inp.moveZ || 0) > 0.05) return true;
    }
    if (player.flags && player.flags.boosting) return true;
    const frame = player._flightFrame || {};
    if ((frame.throttle || 0) > 0.03 || (frame.commandedThrottle || 0) > 0.03) return true;
    const vx = player.vel && player.vel.x || 0, vz = player.vel && player.vel.z || 0;
    if (vx !== 0 || vz !== 0) {
      const speed = Math.hypot(vx, vz);
      const maxSpeed = Math.max(1, player.maxSpeed || 120);
      const speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
      if (speedDrive > 0.15 || speedDrive * 0.40 > 0.03) return true;
    }
  }
  const list = host._trailCandidates;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive || e.type !== 'ship') continue;
    if (player && e.id === player.id) continue;
    if (e.flags && e.flags.docked) continue;
    if (e.flags && e.flags.boosting) return true;
    const frame = e._flightFrame || {};
    if ((frame.throttle || 0) > 0.03 || (frame.commandedThrottle || 0) > 0.03) return true;
    const actuators = actuatorsFor(e);
    if (actuators && (Math.abs(actuators.lateral||0) > 0.001 || Math.abs(actuators.yaw||0) > 0.001 || (actuators.reverse||0) > 0.001 || (actuators.main||0) > 0.03)) return true;
    const vx = e.vel && e.vel.x || 0, vz = e.vel && e.vel.z || 0;
    if (vx !== 0 || vz !== 0) {
      const speed = Math.hypot(vx, vz);
      const maxSpeed = Math.max(1, e.maxSpeed || 120);
      const speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
      if (speedDrive * 0.40 > 0.03) return true;
    }
  }
  return false;
}

function updateBefore(host) {
  const plumeRelevant = energyPlumeRelevant(host);
  const masslineRelevant = energyMasslineRelevant(host);
  if (!plumeRelevant && !masslineRelevant) { host.probes++; return false; }
  return true;
}

function updateAfter(host) {
  if (host._energyQuietHidden) {
    const masslineWake = energyMasslineRelevant(host);
    if (!masslineWake && !energyQuietMaybeAwake(host)) { host.skips++; return false; }
  }
  const plumeRelevant = energyPlumeRelevant(host);
  const masslineRelevant = energyMasslineRelevant(host);
  if (!plumeRelevant && !masslineRelevant) {
    host._energyQuietHidden = true;
    host.probes++;
    return false;
  }
  host._energyQuietHidden = false;
  return true;
}

const player = {
  id: 1, alive: true, type: 'ship', rot: 0, maxSpeed: 120,
  vel: { x: 0, z: 0 }, flags: {},
  _flightFrame: { throttle: 0, commandedThrottle: 0, actuators: { lateral: 0, yaw: 0, reverse: 0, main: 0 } },
};
const npcs = Array.from({ length: NPCS }, (_, i) => ({
  id: 10 + i, alive: true, type: 'ship', rot: i * 0.2, maxSpeed: 100,
  vel: { x: 0, z: 0 }, flags: {},
  _flightFrame: { throttle: 0, commandedThrottle: 0, actuators: { lateral: 0, yaw: 0, reverse: 0, main: 0 } },
}));
const host = {
  _energy: { plumeDrive: 0, boostBlend: 0 },
  _energyQuietHidden: true,
  _trailCandidates: [player, ...npcs],
  _driveScratch: { drive: 0, boost: 0, speedDrive: 0, brake: 0 },
  state: {
    playerId: 1,
    input: { moveZ: 0, turnIntent: 0 },
    entities: { get(id) { return id === 1 ? player : null; } },
    combat: { attachments: { byId: {} } },
  },
  probes: 0, skips: 0,
};
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(host);
host.probes = 0; host.skips = 0;
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(host);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, probes: host.probes, skips: host.skips,
  hidden: !!host._energyQuietHidden, mode: ${JSON.stringify(mode)},
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const m = (a.length - 1) / 2;
  return a.length % 2 ? a[m | 0] : (a[m | 0] + a[(m | 0) + 1]) / 2;
}

const pairs = [];
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({ beforeMs: before.ms, afterMs: after.ms, speedup: before.ms / after.ms, afterSkips: after.skips });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'energy-quiet-relevant-skip',
  primary: 'quiet-hidden-energy-relevant-probe',
  iterations: ITERS,
  runs: RUNS,
  npcs: NPCS,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
};
writeFileSync('artifacts/energy-quiet-relevant-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: +out.medianSpeedup.toFixed(3),
  minSpeedup: +out.minSpeedup.toFixed(3),
  maxSpeedup: +out.maxSpeedup.toFixed(3),
}, null, 2));
