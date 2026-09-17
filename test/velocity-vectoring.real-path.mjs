// Velocity-vectoring assist — the REAL-PATH measurement (docs/TUNING_JOBS.md job 1;
// design/FEEL_CONTRACT.md §C "Velocity-vectoring assist", bars B1 and B2).
//
// THE REAL-PATH LAW: every number here comes out of `bootRealPath` (createAuthoritativeRuntime,
// flightV3, the live `rapier-dynamic` authority). The assist is A/B'd through the one seam the
// game exposes, `state.settings.gameplay.velocityVectoring` (false = off, true = the band
// defaults, object = rate overrides), so the "off" rows are the unmodified ship on the same build.
//
// Arms per variant (Hitch, fixed seed):
//   restToCruise  — B2 clause 1, the same tape as feel.reversal_course
//   reversal180   — B2 clause 2, the same coast-yaw-then-burn tape as feel.reversal_course
//   turnRadius    — B2 clause 3, W + full turn until the velocity sweeps 90 deg, in screen depths
//   redirect90    — the packet's new metric: W + full strafe into the turn + full turn, until the
//                   velocity vector has rotated 90 deg
//   twitch90      — the felt case: nose commanded to +100 deg and HELD, W held, until the velocity
//                   has rotated 90 deg (where speed retention shows)
//   earnedSpeed   — B1, the same 2x-cruise impulse tape as feel.earned_speed_kept, hands off and
//                   forward held, with a full turn held during the 10 s so the assist would show
//                   if it leaked above the cap
import { wrapAngle } from '../src/core/rng.js';
import { writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import {
  bootPlayer,
  settle,
  planarSpeed,
  chaseCameraRefs,
  screenDepthWuAtSpeed,
  queueDoubleCruiseImpulse,
} from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';

export const DEFAULT_SEED = 4242;
export const DEFAULT_HULL = 'ship_kestrel';
const CRUISE_HOLD_TICKS = 900;
const SWEEP_TICKS = 1800;
const HOLD_10S_TICKS = 600;
const NINETY_DEG = Math.PI / 2;
const REVERSAL_TARGET_RAD = Math.PI * 0.88;

/** The C-band variants: off, a cooler band, the band itself (the kernel default), a hotter band. */
export const VARIANTS = Object.freeze([
  Object.freeze({ id: 'off', setting: false }),
  Object.freeze({ id: '1.2/0.7', setting: Object.freeze({ rateLowRadS: 1.2, rateCapRadS: 0.7 }) }),
  Object.freeze({ id: '1.6/0.9', setting: true }),
  Object.freeze({ id: '2.0/1.1', setting: Object.freeze({ rateLowRadS: 2.0, rateCapRadS: 1.1 }) }),
]);

async function boot(seed, hullId, variant) {
  const host = await bootPlayer(seed, hullId);
  host.state.settings.gameplay.velocityVectoring = variant.setting;
  return host;
}

function heading(entity) { return Math.atan2(entity.vel.z, entity.vel.x); }

async function measureRestToCruise(seed, hullId, variant) {
  const host = await boot(seed, hullId, variant);
  try {
    settle(host);
    const samples = [];
    let t0 = null;
    host.step(CRUISE_HOLD_TICKS, {
      before: ({ state, index }) => { writeRealPathInput(state, { moveZ: 1 }); if (index === 0) t0 = state.simTime; },
      after: ({ state, host: h }) => { samples.push({ t: state.simTime - t0, speed: planarSpeed(h.player) }); },
    });
    const cruiseSpeed = samples[samples.length - 1].speed;
    const crossed = samples.find((row) => row.speed >= 0.95 * cruiseSpeed);
    return { cruiseSpeed, restToCruiseS: crossed ? crossed.t : null };
  } finally {
    host.dispose();
  }
}

async function measureReversal(seed, hullId, variant) {
  const host = await boot(seed, hullId, variant);
  try {
    const player = host.player;
    settle(host);
    host.step(CRUISE_HOLD_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const startHeading = heading(player);
    const startRot = player.rot || 0;
    let t0 = null;
    let measured = null;
    let minSpeed = Infinity;
    host.step(SWEEP_TICKS, {
      before: ({ state, host: h }) => {
        const err = wrapAngle((startRot + Math.PI) - (h.player.rot || 0));
        const aligned = Math.abs(err) < 0.06;
        writeRealPathInput(state, {
          moveZ: aligned ? 1 : 0,
          turnIntent: aligned ? 0 : Math.max(-1, Math.min(1, err / 0.32)),
        });
        if (t0 == null) t0 = state.simTime;
      },
      after: ({ state, host: h }) => {
        const speed = planarSpeed(h.player);
        if (speed < minSpeed) minSpeed = speed;
        if (speed < 2.2) return;
        if (Math.abs(wrapAngle(heading(h.player) - startHeading)) >= REVERSAL_TARGET_RAD) {
          measured = state.simTime - t0;
          return false;
        }
      },
    });
    return { velocity180TimeS: measured, minSpeed };
  } finally {
    host.dispose();
  }
}

/** W held plus `extra` input, from cruise, until the velocity heading has swept `targetRad`. */
async function measureSweep(seed, hullId, variant, inputFn, targetRad = NINETY_DEG) {
  const host = await boot(seed, hullId, variant);
  try {
    const player = host.player;
    settle(host);
    host.step(CRUISE_HOLD_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const cruiseSpeed = planarSpeed(player);
    const { fovDeg, maxSpeedRef } = chaseCameraRefs(host.state, player);
    const screenDepthWu = screenDepthWuAtSpeed(cruiseSpeed, { fovDeg, maxSpeedRef, physicsEarned: false });
    const rot0 = player.rot || 0;
    let prev = heading(player);
    let swept = 0;
    let t0 = null;
    let tEnd = null;
    let reached = false;
    let speedSum = 0;
    let n = 0;
    let minSpeed = Infinity;
    host.step(SWEEP_TICKS, {
      before: ({ state, host: h }) => {
        writeRealPathInput(state, inputFn({ player: h.player, rot0 }));
        if (t0 == null) t0 = state.simTime;
      },
      after: ({ state, host: h }) => {
        const hd = heading(h.player);
        swept += wrapAngle(hd - prev);
        prev = hd;
        const speed = planarSpeed(h.player);
        speedSum += speed;
        n += 1;
        if (speed < minSpeed) minSpeed = speed;
        tEnd = state.simTime;
        if (Math.abs(swept) >= targetRad) { reached = true; return false; }
      },
    });
    const timeS = reached ? tEnd - t0 : null;
    const meanSpeed = n ? speedSum / n : 0;
    const rate = timeS > 0 ? Math.abs(swept) / timeS : null;
    const radiusWu = rate > 0 ? meanSpeed / rate : null;
    return {
      cruiseSpeed,
      timeS,
      meanSpeed,
      minSpeed,
      finalSpeed: planarSpeed(player),
      rateRadPerS: rate,
      radiusWu,
      screenDepthWu,
      radiusScreenDepths: radiusWu != null && screenDepthWu > 0 ? radiusWu / screenDepthWu : null,
    };
  } finally {
    host.dispose();
  }
}

/**
 * B1 on the real path. Three 10 s holds after the 2x-cruise impulse:
 *   handsOffSwung  — no main drive, full turn held: the nose swings right off the velocity, the
 *                    one condition under which an assist that leaked above the cap would bend or
 *                    bleed speed (and the assist can never be live without main thrust);
 *   forwardHeld    — the canonical feel.earned_speed_kept arm, nose on the velocity;
 *   forwardStrafe  — W plus full strafe: the command sits 45 deg off the velocity the whole time.
 * The sector fence is removed for these arms (`state.bounds = null`): 15 s of cruise plus 10 s at
 * 2x cruise carries the hull ~6,500 WU from the origin, past the soft radius, and the fence's
 * inward impulses are what feel.earned_speed_kept measures today (0.53 / 0.49 on the unmodified
 * ship, seed 4242). Physics, governor and assists are otherwise the live ones.
 */
async function measureEarnedSpeed(seed, hullId, variant, mode) {
  const host = await boot(seed, hullId, variant);
  try {
    const player = host.player;
    host.state.bounds = null;
    settle(host);
    host.step(CRUISE_HOLD_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const cruiseSpeed = planarSpeed(player);
    host.step(1, {
      before: ({ state, host: h }) => {
        writeRealPathInput(state, { moveZ: 1 });
        queueDoubleCruiseImpulse(h.player, cruiseSpeed);
      },
    });
    const exitSpeed = planarSpeed(player);
    const holdInput = mode === 'forwardHeld'
      ? { moveZ: 1 }
      : mode === 'forwardStrafe'
        ? { moveZ: 1, moveX: 1 }
        : { turnIntent: 1 };
    host.step(HOLD_10S_TICKS, { before: ({ state }) => { writeRealPathInput(state, holdInput); } });
    const speedAt10s = planarSpeed(player);
    return { cruiseSpeed, exitSpeed, speedAt10s, keptFraction: exitSpeed > 0 ? speedAt10s / exitSpeed : null };
  } finally {
    host.dispose();
  }
}

const turnOnly = () => ({ moveZ: 1, turnIntent: 1 });
const strafeAndTurn = () => ({ moveZ: 1, moveX: 1, turnIntent: 1 });
const noseTo100 = ({ player, rot0 }) => {
  const err = wrapAngle((rot0 + Math.PI * 100 / 180) - (player.rot || 0));
  return { moveZ: 1, turnIntent: Math.max(-1, Math.min(1, err / 0.32)) };
};

/**
 * Measure every arm for every variant. Hosts are strictly sequential (realPath.mjs).
 * @returns {Promise<Array<object>>} one row per variant
 */
export async function measureVelocityVectoring({ seed = DEFAULT_SEED, hullId = DEFAULT_HULL, variants = VARIANTS } = {}) {
  const rows = [];
  for (const variant of variants) {
    const rest = await measureRestToCruise(seed, hullId, variant);
    const reversal = await measureReversal(seed, hullId, variant);
    const turn = await measureSweep(seed, hullId, variant, turnOnly);
    const redirect = await measureSweep(seed, hullId, variant, strafeAndTurn);
    const twitch = await measureSweep(seed, hullId, variant, noseTo100);
    const handsOffSwung = await measureEarnedSpeed(seed, hullId, variant, 'handsOffSwung');
    const forwardHeld = await measureEarnedSpeed(seed, hullId, variant, 'forwardHeld');
    const forwardStrafe = await measureEarnedSpeed(seed, hullId, variant, 'forwardStrafe');
    rows.push({
      seed,
      hullId,
      variant: variant.id,
      cruiseSpeed: rest.cruiseSpeed,
      restToCruiseS: rest.restToCruiseS,
      velocity180TimeS: reversal.velocity180TimeS,
      reversalMinSpeed: reversal.minSpeed,
      turnRadius: turn,
      redirect90: redirect,
      twitch90: twitch,
      earnedHandsOffSwung: handsOffSwung,
      earnedForwardHeld: forwardHeld,
      earnedForwardStrafe: forwardStrafe,
    });
  }
  return rows;
}

const fmtS = (v) => (v == null ? 'never' : `${v.toFixed(3)} s`);
const fmt1 = (v) => (v == null ? '-' : v.toFixed(1));
const fmt3 = (v) => (v == null ? '-' : v.toFixed(3));

export function formatRows(rows) {
  const lines = [];
  lines.push(`velocity-vectoring real path — ${rows[0]?.hullId} seed ${rows[0]?.seed} (${rows[0]?.turnRadius.screenDepthWu.toFixed(1)} WU screen depth at cruise)`);
  lines.push('variant   | rest->cruise | 180 reversal | turn radius (W+turn)            | redirect90 (W+strafe+turn)    | twitch90 (nose 100 held, W)   | B1 kept: hands-off+turn / W / W+strafe (fence off)');
  for (const r of rows) {
    lines.push(
      `${r.variant.padEnd(9)} | ${fmtS(r.restToCruiseS).padEnd(12)} | ${fmtS(r.velocity180TimeS).padEnd(12)} | `
      + `${fmtS(r.turnRadius.timeS)} ${fmt3(r.turnRadius.radiusScreenDepths)} scr ${fmt1(r.turnRadius.radiusWu)} WU min ${fmt1(r.turnRadius.minSpeed)}`.padEnd(31)
      + ` | ${fmtS(r.redirect90.timeS)} min ${fmt1(r.redirect90.minSpeed)} r ${fmt1(r.redirect90.radiusWu)}`.padEnd(31)
      + ` | ${fmtS(r.twitch90.timeS)} min ${fmt1(r.twitch90.minSpeed)} r ${fmt1(r.twitch90.radiusWu)}`.padEnd(31)
      + ` | ${fmt3(r.earnedHandsOffSwung.keptFraction)} / ${fmt3(r.earnedForwardHeld.keptFraction)} / ${fmt3(r.earnedForwardStrafe.keptFraction)}`,
    );
  }
  return lines.join('\n');
}
