/**
 * Proxy: quiet feel._updateSpeedLines residual under prepareFrame.
 * Before = every idle tick still pays player resolve + governed combat speed +
 *   camera tilt + speedLineDrive (band/silent) + region probe + publishVelocityLanguage
 *   before the opacity/grain floor early-out.
 * After  = quiet latch; cheap speed/boost/physicsEarned maybe-awake; skip until wake.
 * Soft-GPU fps not claimed. Picture unchanged (overlay already opacity 0).
 * Velocity-language publish: last band-0 record retained while latched (consumers
 * tolerate ≤1-frame staleness by contract).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const VL_WAKE_AT = 0.45;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const VL_WAKE_AT = ${VL_WAKE_AT};

function resolveGovernedCombatSpeed(player, state, fallback) {
  // Model the common fast path + one profile lookup fallback.
  const direct = player && player.combatSpeed;
  if (Number.isFinite(direct) && direct > 0) return direct;
  const profile = state && state._propulsionProfiles && player && player.driveId
    ? state._propulsionProfiles[player.driveId]
    : null;
  const combat = profile && profile.combatSpeed;
  if (Number.isFinite(combat) && combat > 0) return combat;
  return Math.max(1, fallback || player.maxSpeed || 120);
}
function silentDrive(speed, maxSpeed, out) {
  const maxSpd = Math.max(1, maxSpeed);
  const speedRatio = Math.max(0, speed) / maxSpd;
  out.speedRatio = speedRatio;
  out.effectiveRatio = speedRatio;
  out.band = 0;
  out.count = 0;
  out.targetOpacity = 0;
  out.lenScale = 0;
  out.widthScale = 0;
  out.parallaxGain = 0;
  out.smear = 0;
  out.grain = 0;
  out.flowSpeed = 0;
  out.cameraLeadWU = 0;
  out.shakeScale = 1;
  out.exceptionalSpeed = 0;
  return out;
}
function speedLineDrive(speed, maxSpeed, boosting, motionReduce, physicsEarned, out) {
  const maxSpd = Math.max(1, maxSpeed);
  const r = Math.max(0, speed) / maxSpd + (boosting ? 0 : 0);
  if (r <= VL_WAKE_AT) return silentDrive(speed, maxSpd, out);
  // Active path not modeled — quiet KPI is the idle early-out.
  out.targetOpacity = 0.2;
  out.grain = 0;
  return out;
}
function resolveRegion(pos, out) {
  out.a = ((pos.x * 0.001) | 0) & 3;
  out.b = ((pos.z * 0.001) | 0) & 3;
  out.t = 0.5;
  return out;
}
function publishVL(state, drive, region) {
  let node = state.render.velocityLanguage;
  if (!node) {
    node = { schema: 'velocity_language_v1', ownerId: null, drive: null, region: null, frame: 0 };
    state.render.velocityLanguage = node;
  }
  node.ownerId = state.playerId;
  node.drive = drive;
  node.region = region;
  node.frame++;
  return node;
}
function maybeAwake(h) {
  const player = h.player;
  if (!player || !player.vel) return false;
  if (player.flags && player.flags.boosting) return true;
  if (player._flightFrame && player._flightFrame.governor
      && player._flightFrame.governor.physicsEarned === true) return true;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const maxSpd = h.quietMaxSpd > 0 ? h.quietMaxSpd : Math.max(1, player.maxSpeed || 120);
  return speed > maxSpd * VL_WAKE_AT * 0.85;
}
function makeHost() {
  return {
    quiet: false,
    quietMaxSpd: 0,
    skips: 0,
    walks: 0,
    state: {
      playerId: 1,
      mode: 'flight',
      entities: null,
      render: {},
      settings: { video: {}, accessibility: {} },
      camera: { tilt: 60 },
      _propulsionProfiles: { drive_a: { combatSpeed: 120 } },
    },
    player: {
      id: 1,
      vel: { x: 0, z: 0 },
      pos: { x: 100, z: -50 },
      maxSpeed: 120,
      combatSpeed: 120,
      driveId: 'drive_a',
      flags: { boosting: false },
      _flightFrame: { governor: { physicsEarned: false } },
    },
    driveScratch: {},
    regionScratch: {},
    slOpacity: 0,
    slGrain: 0,
    streaks: null,
  };
}
function before(h) {
  h.walks++;
  const player = h.player;
  const state = h.state;
  let boosting = false, speed = 0, maxSpd = 1;
  let dirX = 0, dirY = -1;
  if (player && player.vel) {
    speed = Math.hypot(player.vel.x, player.vel.z);
    maxSpd = Math.max(1, resolveGovernedCombatSpeed(player, state, player.maxSpeed || 1));
    boosting = !!(player.flags && player.flags.boosting);
    const tiltScale = Math.sin((state.camera.tilt || 60) * Math.PI / 180);
    const sx = -player.vel.x;
    const sy = -(player.vel.z * tiltScale);
    const dlen = Math.hypot(sx, sy);
    if (dlen > 0.0001) { dirX = sx / dlen; dirY = sy / dlen; }
  }
  const mr = !!(state.settings.video && state.settings.video.motionReduce);
  const physicsEarned = !!(player && player._flightFrame && player._flightFrame.governor
    && player._flightFrame.governor.physicsEarned === true);
  const drive = speedLineDrive(speed, maxSpd, boosting, mr, physicsEarned, h.driveScratch);
  const region = player && player.pos
    ? resolveRegion(player.pos, h.regionScratch)
    : null;
  publishVL(state, drive, region);
  // opacity already floored — early out (model damp as already done)
  if (h.slOpacity <= 0.01 && h.slGrain <= 0.002) {
    if (h.streaks) h.streaks.length = 0;
    return;
  }
}
function after(h) {
  if (h.quiet && !maybeAwake(h)) { h.skips++; return; }
  if (h.quiet) h.quiet = false;
  h.walks++;
  const player = h.player;
  const state = h.state;
  let boosting = false, speed = 0, maxSpd = 1;
  if (player && player.vel) {
    speed = Math.hypot(player.vel.x, player.vel.z);
    maxSpd = Math.max(1, resolveGovernedCombatSpeed(player, state, player.maxSpeed || 1));
    boosting = !!(player.flags && player.flags.boosting);
    const tiltScale = Math.sin((state.camera.tilt || 60) * Math.PI / 180);
    const sx = -player.vel.x;
    const sy = -(player.vel.z * tiltScale);
    const dlen = Math.hypot(sx, sy);
    if (dlen > 0.0001) { /* dir */ }
  }
  const mr = !!(state.settings.video && state.settings.video.motionReduce);
  const physicsEarned = !!(player && player._flightFrame && player._flightFrame.governor
    && player._flightFrame.governor.physicsEarned === true);
  const drive = speedLineDrive(speed, maxSpd, boosting, mr, physicsEarned, h.driveScratch);
  const region = player && player.pos
    ? resolveRegion(player.pos, h.regionScratch)
    : null;
  publishVL(state, drive, region);
  h.quietMaxSpd = maxSpd;
  if (h.slOpacity <= 0.01 && h.slGrain <= 0.002) {
    if (h.streaks) h.streaks.length = 0;
    if (!maybeAwake(h)) h.quiet = true;
    return;
  }
  h.quiet = false;
}
const mode = ${JSON.stringify(mode)};
const h = makeHost();
for (let i = 0; i < 4; i++) (mode === 'after' ? after : before)(h);
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) (mode === 'after' ? after : before)(h);
const ms = performance.now() - t0;
let wakeOk = true;
if (mode === 'after') {
  if (!h.quiet) wakeOk = false;
  h.player.vel = { x: 80, z: 0 }; // above 0.45*120
  after(h);
  if (h.quiet) wakeOk = false;
  h.player.vel = { x: 0, z: 0 };
  h.slOpacity = 0; h.slGrain = 0;
  for (let i = 0; i < 4; i++) after(h);
  if (!h.quiet) wakeOk = false;
}
console.log(JSON.stringify({
  mode, ms, walks: h.walks, skips: h.skips, quiet: h.quiet, wakeOk,
  nsPerOp: (ms * 1e6) / ITERS,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`run failed (${mode}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const m = (a.length - 1) >> 1;
  return a.length % 2 ? a[m] : (a[m] + a[m + 1]) / 2;
}

const beforeRuns = [];
const afterRuns = [];
const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  beforeRuns.push(b);
  afterRuns.push(a);
  pairs.push({
    i,
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    wakeOk: a.wakeOk,
    afterSkips: a.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'speed-lines-quiet-idle-latch',
  iters: ITERS,
  runs: RUNS,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  medianBeforeMs: median(beforeRuns.map((r) => r.ms)),
  medianAfterMs: median(afterRuns.map((r) => r.ms)),
  dirtyWakeOk: afterRuns.every((r) => r.wakeOk === true),
  pairs,
};
writeFileSync(
  `${ROOT}/artifacts/speed-lines-quiet-idle-latch-microbench.json`,
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  dirtyWakeOk: out.dirtyWakeOk,
  medianBeforeMs: out.medianBeforeMs,
  medianAfterMs: out.medianAfterMs,
}, null, 2));
