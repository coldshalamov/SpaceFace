// Tether-spin bench: latch onto a rock through the REAL input path (Space tap + aim), then fly
// scripted chords (W+D spin, boost, dash taps, release/re-grab, ...) and measure how fast the
// ship actually revolves, how far the nose sits from the ideal tangent, and every wrong-way turn.
import { createLabWorld, playerFlightProfile, digest, wrapAngle, SIM_DT } from '../labWorld.mjs';
import { stats, r4 } from '../labMetrics.mjs';
import * as orbitAssistModule from '../../../src/core/flight/orbitAssist.js';
// The lab seam exists only on lab/tuning-phase1; on a production checkout every run is "shipped".
const setOrbitAssistLab = orbitAssistModule.setOrbitAssistLab || (() => {});

const HZ = Math.round(1 / SIM_DT);
const s2t = (s) => Math.round(s * HZ);

// Script helpers: each returns the held key codes for tick t (t counted from the scenario start).
const latchTicks = (t, at) => t >= at && t < at + 3; // a 3-tick tap (< MASSLINE_HOLD_S) latches; on a live line it cuts

export const SCENARIOS = {
  'spin-plain': {
    desc: 'latch at 70wu on a 400-mass rock, hold W+D for 20 s',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : [])],
  },
  'spin-plain-left': {
    desc: 'mirror of spin-plain (W+A)',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyA'] : [])],
  },
  'spin-boost-hold': {
    desc: 'W+D, Shift held 6..14 s',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : []),
      ...(t >= s2t(6) && t < s2t(14) ? ['ShiftLeft'] : [])],
  },
  'spin-boost-taps': {
    desc: 'W+D with a 6-tick Shift tap (dash) every 1.5 s from 5 s',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : []),
      ...(t >= s2t(5) && (t - s2t(5)) % s2t(1.5) < 6 ? ['ShiftLeft'] : [])],
  },
  'spin-short-line': {
    desc: 'latch at 35wu, W+D (short line: yaw-rate bound regime)',
    rock: { dist: 35, mass: 400, radius: 6 }, durationS: 16,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : [])],
  },
  'spin-long-line': {
    desc: 'latch at 140wu, W+D (long line: speed-cap regime)',
    rock: { dist: 140, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : [])],
  },
  'spin-heavy-anchor': {
    desc: '70wu, 20000-mass rock (near-fixed pivot)',
    rock: { dist: 70, mass: 20000, radius: 10 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : [])],
  },
  'spin-light-anchor': {
    desc: '70wu, 60-mass rock (the pair swings about a shared centre)',
    rock: { dist: 70, mass: 60, radius: 4 }, durationS: 20,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', 'KeyD'] : [])],
  },
  'latch-moving-with': {
    desc: 'fly past at 120 wu/s, latch, hold the turn that MATCHES the swing (W+A here)',
    rock: { dist: 70, mass: 400, radius: 6 }, playerVel: { x: 120, z: 0 }, durationS: 16,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 6 ? ['KeyW', 'KeyA'] : [])],
  },
  'latch-moving-against': {
    desc: 'fly past at 120 wu/s, latch, hold the OPPOSITE turn (W+D): assist must reverse the swing',
    rock: { dist: 70, mass: 400, radius: 6 }, playerVel: { x: 120, z: 0 }, durationS: 16,
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 6 ? ['KeyW', 'KeyD'] : [])],
  },
  'release-regrab': {
    desc: 'spin 8 s, tap Space to cut, coast 0.75 s, re-latch (aim on rock), spin again',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 20,
    keys: (t) => {
      const cut = s2t(8), relatch = s2t(8.75);
      const k = [];
      if (latchTicks(t, 2) || latchTicks(t, cut) || latchTicks(t, relatch)) k.push('Space');
      if (t >= 20 && !(t >= cut && t < relatch + 6)) k.push('KeyW', 'KeyD');
      return k;
    },
  },
  'helm-cursor-spin': {
    desc: 'helm-assist scheme: W held, cursor parked on a fixed world point, no A/D (cursor steers the nose)',
    rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, scheme: 'helm-assist', cursor: { x: 400, z: 70 },
    keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW'] : [])],
  },
};

export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {}, trace = false } = {}) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown tether scenario ${id}`);
  const world = await createLabWorld({ seed, bundle, settings: {
    controlScheme: sc.scheme || 'pilot',
    orbitAssistStrength: params.orbitAssistStrength || 'standard',
    ...(params.gameplay || {}),
  } });
  setOrbitAssistLab(params.orbitLab || {});
  try {
    // Seeded jitter on the start pose so seeds actually explore something.
    const rng = mulberry32(seed * 7919 + 17);
    const jitter = (rng() - 0.5) * 0.2;
    const player = world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: jitter, vel: sc.playerVel || null });
    const rock = world.spawnRock({ pos: { x: 0, z: sc.rock.dist }, mass: sc.rock.mass, radius: sc.rock.radius });
    await world.prepare();
    if (typeof params.apply === 'function') params.apply(world);
    const profile = playerFlightProfile(world);
    const ticks = s2t(sc.durationS);
    const rows = [];
    const kin = [];
    for (let t = 0; t < ticks; t++) {
      const p = world.player();
      const rk = world.state.entities.get(rock.id);
      if (sc.cursor) { world.aim.x = sc.cursor.x; world.aim.z = sc.cursor.z; }
      else if (sc.cursorOnRock && rk) { world.aim.x = rk.pos.x; world.aim.z = rk.pos.z; }
      else if (rk) { world.aim.x = rk.pos.x; world.aim.z = rk.pos.z; }
      // Latch aim always on the rock during a latch tap.
      const codes = sc.keys(t);
      if (codes.includes('Space') && rk) { world.aim.x = rk.pos.x; world.aim.z = rk.pos.z; }
      world.keys(codes, { pointer: sc.scheme === 'helm-assist' });
      world.step();
      const pl = world.player();
      const r = world.state.entities.get(rock.id);
      const th = world.state.player.tether;
      const rx = pl.pos.x - r.pos.x, rz = pl.pos.z - r.pos.z;
      const vx = pl.vel.x - r.vel.x, vz = pl.vel.z - r.vel.z;
      const rad = Math.hypot(rx, rz);
      const omega = rad > 1e-6 ? (rx * vz - rz * vx) / (rad * rad) : 0;
      const oa = pl._flightFrame && pl._flightFrame.orbitAssist;
      rows.push({
        t, theta: Math.atan2(rz, rx), rad, omega, rot: pl.rot, angVel: pl.angVel || 0,
        speed: Math.hypot(pl.vel.x, pl.vel.z), tethered: !!(th && th.active),
        boosting: !!(pl.flags && pl.flags.boosting), turnIn: world.state.input.turnIntent || 0,
        moveZ: world.state.input.moveZ || 0,
        oaActive: !!(oa && oa.active), oaSel: oa && oa.selectedDirection, oaScale: oa && oa.swingThrottleScale,
        oaSat: !!(oa && oa.saturated), maxYaw: oa && oa.maxYawRate, fromAim: !!world.state.input.turnIntentFromAim,
        rockVel: Math.hypot(r.vel.x, r.vel.z),
      });
      if (t % 6 === 0) kin.push([r4(pl.pos.x), r4(pl.pos.z), r4(pl.rot)]);
    }
    return summarize(id, sc, rows, profile, world, player, rock, { seed, digest: digest(kin), trace: trace ? rows : undefined });
  } finally {
    world.dispose();
    setOrbitAssistLab({});
  }
}

/** Prototype controller variants (all through the ORBIT_ASSIST_LAB seam; baseline = shipped). */
export const VARIANTS = {
  baseline: {},
  comFrame: { orbitLab: { comFrame: true } },
  commit: { orbitLab: { forwardCommit: true } },
  gate: { orbitLab: { thrustGate: true } },
  tangentDash: { orbitLab: { tangentDash: true } },
  // v2 = every frame/sign fix, hull yaw cap unchanged.
  v2: { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true } },
  'v2-m95': { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, margin: 0.95 } },
  'v2-m98': { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, margin: 0.98 } },
  'v2-capDash': { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, dashSpeedCap: 'track' } },
  'v2-m95-capDash': { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, dashSpeedCap: 'track', margin: 0.95 } },
  'v3-capDash': { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, lineLockYaw: true, dashSpeedCap: 'boost' } },
  // v3 = v2 + the line lends the hull yaw (nose locked to the tangent at any spin rate).
  v3: { orbitLab: { comFrame: true, forwardCommit: true, thrustGate: true, tangentDash: true, lineLockYaw: true } },
  // Phase 2a: master f60eafe73 already suppresses the press-edge dash while the chord holds, so the
  // tangent-dash prototype is inert; v4 = v3 core + a live-line dash cap + aim-direction latch.
  v4: { orbitLab: V4() },
};
export function V4(o = {}) {
  return { comFrame: true, forwardCommit: true, thrustGate: true, lineLockYaw: true, lineLockMargin: 1.1,
    alignTimeS: null, lendYawAccelMult: 1, lineDashCap: true, directionLatch: 'aim', absYawCap: 6.0, lockGovernorMargin: 0.95, ...o };
}

function summarize(id, sc, rows, profile, world, player, rock, extra) {
  const pm = player.mass || 1;
  const rm = sc.rock.mass;
  const maxYaw = Number(profile.maxYawRate) || null;
  const vcap = Number(profile.combatSpeed) || null;
  const boostMult = Number(profile.boostSpeedMult) || 1.55;
  // Windows. "spin" ticks = tethered + forward held. "steady" = the assist has owned the chord
  // continuously for SETTLE_S (each engagement/re-grab gets its own capture allowance); the
  // capture itself is reported as settleS (engagement -> nose stays within 5 deg).
  const spin = rows.filter((r) => r.tethered && r.moveZ > 0.05);
  const SETTLE_S = 2.5;
  // A change of the selected direction (keyboard reversal) is a new engagement too.
  let runStart = -1; let prevT = -2; let prevSel = 0;
  const engagedFor = new Map();
  for (const r of rows) {
    const on = r.tethered && r.moveZ > 0.05 && r.oaActive;
    const sg = Math.sign(r.oaSel || 0);
    if (on) { if (r.t !== prevT + 1 || (prevSel && sg && sg !== prevSel)) runStart = r.t; engagedFor.set(r.t, (r.t - runStart) / HZ); prevT = r.t; prevSel = sg; }
  }
  const steady = spin.filter((r) => (engagedFor.get(r.t) || 0) >= SETTLE_S);
  const sel = (r) => (r.oaSel ? Math.sign(r.oaSel) : Math.sign(r.turnIn));
  const derived = steady.map((r) => {
    const orbitSign = Math.sign(r.omega) || 1;
    const tangent = r.theta + orbitSign * Math.PI / 2;
    const noseErr = wrapAngle(r.rot - tangent);
    // r.theta measured from rock to ship; tangent along actual motion.
    return { ...r, orbitSign, noseErr, absErrDeg: Math.abs(noseErr) * 180 / Math.PI,
      wrongTurn: Math.abs(r.omega) > 0.4 && r.angVel * orbitSign < -0.3,
      reversed: r.oaActive && sel(r) !== 0 && Math.abs(r.omega) > 0.3 && sel(r) !== orbitSign };
  });
  // Capture time per engagement: first tick after which |nose err| stays < 5 deg.
  const settleTimes = [];
  { let start = null; let lastBad = null; let prev = -2;
    const flush = () => { if (start != null) settleTimes.push(lastBad == null ? 0 : (lastBad - start + 1) / HZ); };
    let pSel = 0;
    for (const r of spin) {
      const sg = Math.sign(r.oaSel || 0);
      if (r.t !== prev + 1 || (pSel && sg && sg !== pSel)) { flush(); start = r.t; lastBad = null; }
      pSel = sg || pSel;
      const orbitSign = Math.sign(r.omega) || 1;
      const e = Math.abs(wrapAngle(r.rot - (r.theta + orbitSign * Math.PI / 2))) * 180 / Math.PI;
      if (e >= 5) lastBad = r.t;
      prev = r.t;
    }
    flush(); }
  const omegaAbs = derived.map((d) => Math.abs(d.omega));
  // Revolution periods from unwrapped theta over the steady window (plain, non-boost ticks).
  const periods = revolutionPeriods(steady);
  const radius = stats(steady.map((r) => r.rad)).p50;
  const rShip = radius ? radius * rm / (pm + rm) : null; // ship's arm about the pair's centre
  const boostTicks = derived.filter((d) => d.boosting);
  const plainTicks = derived.filter((d) => !d.boosting);
  const bound = (mult) => (maxYaw && vcap && rShip) ? Math.min(maxYaw, (vcap * mult) / rShip) : null;
  const res = {
    scenario: id, seed: extra.seed, digest: extra.digest,
    profile: { maxYawRate: r4(maxYaw), yawAccel: r4(Number(profile.yawAccel)), combatSpeed: r4(vcap),
      boostSpeedMult: r4(boostMult), mainAccel: r4(Number(profile.mainAccel)), playerMass: r4(pm), rockMass: rm },
    latched: rows.some((r) => r.tethered), tetheredAtEnd: rows[rows.length - 1].tethered,
    steadyTicks: steady.length,
    radius: r4(radius),
    omegaPlain: stats(plainTicks.map((d) => Math.abs(d.omega))),
    omegaBoost: boostTicks.length ? stats(boostTicks.map((d) => Math.abs(d.omega))) : null,
    periodS: stats(periods),
    theoryOmegaPlain: r4(bound(1)), theoryOmegaBoost: r4(bound(boostMult)),
    assistCapOmega: r4(maxYaw ? maxYaw * 0.9 : null),
    efficiencyPlain: null, efficiencyBoost: null,
    noseErrDeg: stats(derived.map((d) => d.absErrDeg)),
    noseErrMax: r4(derived.reduce((m, d) => Math.max(m, d.absErrDeg), 0)),
    noseErrP99: r4(quantile(derived.map((d) => d.absErrDeg), 0.99)),
    settleS: stats(settleTimes),
    theoryPhysPlain: r4(vcap && rShip ? vcap / rShip : null),
    theoryPhysBoost: r4(vcap && rShip ? vcap * boostMult / rShip : null),
    omegaP99: r4(quantile(omegaAbs, 0.99)),
    noseErrDegBoost: boostTicks.length ? stats(boostTicks.map((d) => d.absErrDeg)) : null,
    noseOff30Pct: pct(derived, (d) => d.absErrDeg > 30),
    noseOff90Pct: pct(derived, (d) => d.absErrDeg > 90),
    wrongTurnPct: pct(derived, (d) => d.wrongTurn),
    reversedPct: pct(derived, (d) => d.reversed),
    orbitFlips: countFlips(derived.map((d) => d.orbitSign)),
    orbitFlipsAll: countFlips(spin.filter((r) => Math.abs(r.omega) > 0.3).map((r) => Math.sign(r.omega))),
    selectedFlips: countFlips(derived.map((d) => sel(d)).filter((s) => s !== 0)),
    saturatedPct: pct(derived, (d) => d.oaSat),
    throttleScaleMean: stats(derived.map((d) => d.oaScale)).mean,
    speed: stats(derived.map((d) => d.speed)),
    radiusSpread: r4((stats(steady.map((r) => r.rad)).p95 || 0) - (stats(steady.map((r) => r.rad)).min || 0)),
    trace: extra.trace,
  };
  // Physical efficiency per tick: |omega| * r_ship / vcap (r_ship = this tick's arm about the
  // pair's centre of mass), so release/re-grab at a new radius is judged at its own radius.
  const armK = rm / (pm + rm);
  const ratio = (d, mult) => (vcap ? Math.abs(d.omega) * d.rad * armK / (vcap * mult) : null);
  res.effPhysPlain = r4(quantile(plainTicks.map((d) => ratio(d, 1)), 0.5));
  res.effPhysBoost = boostTicks.length ? r4(quantile(boostTicks.map((d) => ratio(d, boostMult)), 0.5)) : null;
  // Pump ratio: the fastest sustained spin (p99 over every steady tick) against the UNBOOSTED
  // physical best at that radius. Legit sustained boost tops out at boostSpeedMult (1.55).
  res.pumpRatio = r4(quantile(spin.map((d) => ratio(d, 1)), 0.99));
  res.assistActivePct = pct(spin, (r) => r.oaActive);
  // Does the final orbit go the way the pilot last asked? (keyboard: key sign; helm: n/a)
  { const last = rows.filter((r) => r.tethered && r.moveZ > 0.05).slice(-30);
    const want = sc.scheme === 'helm-assist' ? 0 : Math.sign(last.reduce((a, r) => a + (r.turnIn || 0), 0));
    const got = Math.sign(last.reduce((a, r) => a + r.omega, 0));
    res.followsIntent = want === 0 ? null : want === got; }
  res.expectFlips = sc.expectFlips || 0;
  if (res.theoryOmegaPlain && res.omegaPlain.p50) res.efficiencyPlain = r4(res.omegaPlain.p50 / res.theoryOmegaPlain);
  if (res.theoryOmegaBoost && res.omegaBoost && res.omegaBoost.p50) res.efficiencyBoost = r4(res.omegaBoost.p50 / res.theoryOmegaBoost);
  return res;
}

function revolutionPeriods(rows) {
  if (rows.length < 2) return [];
  let unwrapped = rows[0].theta;
  let last = rows[0].theta;
  const start = unwrapped;
  let nextMark = Math.PI * 2;
  let lastT = rows[0].t;
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].t !== rows[i - 1].t + 1) { // window break (release/re-grab): restart
      unwrapped = rows[i].theta; last = rows[i].theta; lastT = rows[i].t; nextMark = Math.PI * 2;
      continue;
    }
    unwrapped += wrapAngle(rows[i].theta - last);
    last = rows[i].theta;
    const swept = Math.abs(unwrapped - (start));
    if (swept >= nextMark) { out.push((rows[i].t - lastT) / HZ); lastT = rows[i].t; nextMark += Math.PI * 2; }
  }
  return out;
}

function quantile(xs, q) { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))]; }
function pct(arr, f) { return arr.length ? r4(100 * arr.filter(f).length / arr.length) : null; }
function countFlips(signs) { let n = 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) n++; return n; }
export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

SCENARIOS['spin-then-coast'] = {
  desc: 'W+D for 8 s then release all keys (line stays): does the orbit keep its rate without thrust?',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, coastFromS: 8,
  keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 && t < s2t(8) ? ['KeyW', 'KeyD'] : [])],
};
DEFAULT_SCENARIOS.push('spin-then-coast');

// Dash-pump probe: break the chord for 3 ticks (D up) with a Shift tap inside the gap every 0.5 s,
// which re-arms the press-edge dash master suppresses only while the chord holds.
SCENARIOS['spin-dash-spam'] = {
  desc: 'W+D, every 0.5 s from 4 s: D released 4 ticks with a 2-tick Shift tap inside (dash re-armed), then D again',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16,
  keys: (t) => {
    const k = [...(latchTicks(t, 2) ? ['Space'] : [])];
    if (t < 20) return k;
    const ph = t >= s2t(4) ? (t - s2t(4)) % s2t(0.5) : 99;
    k.push('KeyW');
    if (!(ph < 4)) k.push('KeyD');
    if (ph >= 1 && ph < 3) k.push('ShiftLeft');
    return k;
  },
};
DEFAULT_SCENARIOS.push('spin-dash-spam');

// Keyboard reversal: W+D 8 s, then W+A in the same tick. A keyboard pilot's reversal is deliberate,
// so the orbit must follow it (this is what an over-eager direction latch would break).
SCENARIOS['spin-reverse'] = {
  desc: 'W+D for 8 s then W+A (same tick): the orbit must reverse and settle the other way',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, expectFlips: 1,
  keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW', t < s2t(8) ? 'KeyD' : 'KeyA'] : [])],
};

// Helm-direction scenarios (helm-assist scheme; the cursor-derived turn intent picks the side).
export const HELM_SCENARIOS = ['helm-cursor-spin', 'helm-cursor-anchor', 'helm-cursor-far-left', 'helm-boost'];
SCENARIOS['helm-cursor-anchor'] = {
  desc: 'helm: W held, cursor parked ON the anchor (the classic "orbit what I point at")',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, scheme: 'helm-assist', cursorOnRock: true,
  keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW'] : [])],
};
SCENARIOS['helm-cursor-far-left'] = {
  desc: 'helm: W held, cursor far to the left (-600, 0)',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, scheme: 'helm-assist', cursor: { x: -600, z: 0 },
  keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW'] : [])],
};
SCENARIOS['helm-boost'] = {
  desc: 'helm: W held, cursor at (400,70), Shift held 6..12 s',
  rock: { dist: 70, mass: 400, radius: 6 }, durationS: 16, scheme: 'helm-assist', cursor: { x: 400, z: 70 },
  keys: (t) => [...(latchTicks(t, 2) ? ['Space'] : []), ...(t >= 20 ? ['KeyW'] : []), ...(t >= s2t(6) && t < s2t(12) ? ['ShiftLeft'] : [])],
};

/** Aggregate per (variant, scenario) across seeds. */
export function summarizeRuns(results) {
  const groups = new Map();
  for (const r of results) {
    const k = `${r.variant}|${r.scenario}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const out = [];
  for (const [k, rs] of groups) {
    const [variant, scenario] = k.split('|');
    out.push({
      variant, scenario, seeds: rs.length,
      latchedAll: rs.every((r) => r.latched),
      radius: mean(rs.map((r) => r.radius)),
      omega: mean(rs.map((r) => r.omegaPlain && r.omegaPlain.p50)),
      omegaBoost: mean(rs.map((r) => r.omegaBoost && r.omegaBoost.p50)),
      theory: mean(rs.map((r) => r.theoryOmegaPlain)),
      theoryBoost: mean(rs.map((r) => r.theoryOmegaBoost)),
      eff: mean(rs.map((r) => r.efficiencyPlain)),
      period: mean(rs.map((r) => r.periodS && r.periodS.p50)),
      noseErrP50: mean(rs.map((r) => r.noseErrDeg && r.noseErrDeg.p50)),
      noseErrP95: mean(rs.map((r) => r.noseErrDeg && r.noseErrDeg.p95)),
      noseErrMax: rs.reduce((m, r) => Math.max(m, r.noseErrMax || 0), 0),
      noseErrP99: mean(rs.map((r) => r.noseErrP99)),
      settle: mean(rs.map((r) => r.settleS && r.settleS.max)),
      theoryPhys: mean(rs.map((r) => r.theoryPhysPlain)),
      effPhys: mean(rs.map((r) => r.effPhysPlain)),
      effPhysBoost: mean(rs.map((r) => r.effPhysBoost)),
      pump: rs.reduce((m, r) => Math.max(m, r.pumpRatio || 0), 0),
      active: mean(rs.map((r) => r.assistActivePct)),
      off30: mean(rs.map((r) => r.noseOff30Pct)),
      off90: mean(rs.map((r) => r.noseOff90Pct)),
      wrongTurn: mean(rs.map((r) => r.wrongTurnPct)),
      reversed: mean(rs.map((r) => r.reversedPct)),
      orbitFlips: mean(rs.map((r) => r.orbitFlips)),
      selFlips: mean(rs.map((r) => r.selectedFlips)),
      sat: mean(rs.map((r) => r.saturatedPct)),
      digests: rs.map((r) => r.digest).join(','),
    });
  }
  return out;
}

export const COLUMNS = [
  { label: 'variant', key: 'variant' }, { label: 'scenario', key: 'scenario' },
  { label: 'r', key: 'radius' }, { label: 'ω p50', key: 'omega' }, { label: 'ω boost', key: 'omegaBoost' },
  { label: 'ω*yaw', key: 'theory' }, { label: 'ω*phys', key: 'theoryPhys' }, { label: 'effYaw', key: 'eff' },
  { label: 'effPhys', key: 'effPhys' }, { label: 'effPhysB', key: 'effPhysBoost' }, { label: 'pump', key: 'pump' },
  { label: 'T rev s', key: 'period' }, { label: 'nose° p50', key: 'noseErrP50' }, { label: 'nose° p95', key: 'noseErrP95' },
  { label: 'nose° max', key: 'noseErrMax' }, { label: 'settle s', key: 'settle' },
  { label: '>90°%', key: 'off90' }, { label: 'wrongTurn%', key: 'wrongTurn' },
  { label: 'active%', key: 'active' }, { label: 'orbitFlips', key: 'orbitFlips' }, { label: 'selFlips', key: 'selFlips' },
];
