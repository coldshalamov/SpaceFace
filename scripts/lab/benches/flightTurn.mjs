// Phase 2b system #3 bench: assisted-flight turn authority (W+turn, boost-turn, coast, U-turn,
// Q/E strafe + W + yaw). Player-only world, pilot scheme (A/D yaw, Q/E strafe), real input ->
// flightV3 -> propulsion kernel -> Rapier. Every rate is also reported as a fraction of the hull's
// own max yaw (profile.maxYawRate after the feel envelope), which is how the #3 targets are written.
import { createLabWorld, playerFlightProfile, wrapAngle, SIM_DT } from '../labWorld.mjs';
import * as kernel from '../../../src/core/flight/propulsionKernel.js';

export const HULLS = ['ship_kestrel', 'ship_pelican', 'ship_wasp', 'ship_mule', 'ship_drifter', 'ship_hornet',
  'ship_ironback', 'ship_hawser', 'ship_bastion', 'ship_atlas', 'ship_ranger', 'ship_warden', 'ship_colossus',
  'ship_leviathan', 'ship_saucer'];

// keys: spin-up keys, then the measured keys. measure: windows (s after turn onset).
export const SCENARIOS = {
  'cruise-turn': { desc: 'W to cruise (6 s), then W+D held 8 s', accel: ['KeyW'], turn: ['KeyW', 'KeyD'], accelS: 6, turnS: 8 },
  'boost-turn': { desc: 'W+Shift to boost cap (6 s), then W+Shift+D held 12 s (long boost)', accel: ['KeyW', 'ShiftLeft'], turn: ['KeyW', 'ShiftLeft', 'KeyD'], accelS: 6, turnS: 12 },
  'coast-turn': { desc: 'W to cruise, then release W and hold D 4 s (drift trick)', accel: ['KeyW'], turn: ['KeyD'], accelS: 6, turnS: 4 },
  'uturn-cruise': { desc: 'W to cruise, then W+A until the path has reversed', accel: ['KeyW'], turn: ['KeyW', 'KeyA'], accelS: 6, turnS: 8, uturn: true },
  'uturn-boost': { desc: 'W+Shift to boost cap, then W+Shift+A until the path has reversed', accel: ['KeyW', 'ShiftLeft'], turn: ['KeyW', 'ShiftLeft', 'KeyA'], accelS: 6, turnS: 12, uturn: true },
  'strafe-yaw-EA': { desc: 'W to cruise, then W+E strafe + A yaw held 4 s (the nose-snap report)', accel: ['KeyW'], turn: ['KeyW', 'KeyE', 'KeyA'], accelS: 6, turnS: 4, strafeYaw: -1 },
  'strafe-yaw-QD': { desc: 'mirror: W+Q strafe + D yaw held 4 s', accel: ['KeyW'], turn: ['KeyW', 'KeyQ', 'KeyD'], accelS: 6, turnS: 4, strafeYaw: 1 },
  'strafe-yaw-ED': { desc: 'W+E strafe + D yaw (turning toward the strafe side) held 4 s', accel: ['KeyW'], turn: ['KeyW', 'KeyE', 'KeyD'], accelS: 6, turnS: 4, strafeYaw: 1 },
};

const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const pct = (xs, p) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
const r4 = (x) => (x == null ? null : +x.toFixed(4));

export async function runScenario(name, { seed = 1, shipId = 'ship_kestrel', params = {} } = {}) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`unknown scenario ${name}`);
  // Lab seam (absent on production checkouts -> the bench runs whatever the checkout ships).
  if (typeof kernel.setFlightTurnLab === 'function') kernel.setFlightTurnLab(params.turnLab || {});
  const world = await createLabWorld({ seed, settings: { controlScheme: 'pilot' } });
  try {
    world.spawnPlayer({ shipId, pos: { x: 0, z: 0 }, rot: 0 });
    await world.prepare();
    const prof = playerFlightProfile(world);
    const maxYaw = prof.maxYawRate;
    const accelTicks = Math.round(sc.accelS / SIM_DT);
    const turnTicks = Math.round(sc.turnS / SIM_DT);
    const rows = [];
    let prev = null;
    for (let t = 0; t < accelTicks + turnTicks; t++) {
      const turning = t >= accelTicks;
      world.keys(turning ? sc.turn : sc.accel);
      world.step();
      const e = world.player();
      const path = Math.atan2(e.vel.z, e.vel.x);
      const speed = Math.hypot(e.vel.x, e.vel.z);
      const f = e._flightFrame || {};
      const row = { t, turning, rot: e.rot, path, speed, boost: f.boostFraction || 0,
        vecRate: f.vectoring ? f.vectoring.rateRadS : null, sat: f.vectoring ? !!f.vectoring.saturated : null,
        bounded: f.vectoring ? !!f.vectoring.leadBounded : null };
      if (prev) { row.noseRate = wrapAngle(e.rot - prev.rot) / SIM_DT; row.pathRate = wrapAngle(path - prev.path) / SIM_DT; }
      row.slip = wrapAngle(e.rot - path);
      rows.push(row); prev = row;
    }
    const T = rows.filter((r) => r.turning);
    const v0 = rows[accelTicks - 1].speed;
    const win = (a, b) => T.filter((r) => (r.t - accelTicks) * SIM_DT >= a && (r.t - accelTicks) * SIM_DT < b);
    const side = Math.sign(mean(T.map((r) => r.noseRate)) || 1);
    const stat = (w) => {
      const pr = Math.abs(mean(w.map((r) => r.pathRate)) || 0), nr = Math.abs(mean(w.map((r) => r.noseRate)) || 0), sp = mean(w.map((r) => r.speed));
      return { pathRate: r4(pr), noseRate: r4(nr), pathFrac: r4(pr / maxYaw), noseFrac: r4(nr / maxYaw), speed: r4(sp), radius: pr > 1e-3 ? r4(sp / pr) : null };
    };
    const out = { scenario: name, shipId, seed, maxYaw: r4(maxYaw), combatSpeed: r4(prof.combatSpeed), boostSpeedMult: prof.boostSpeedMult,
      mainAccel: r4(prof.mainAccel), speedAtTurn: r4(v0) };
    if (sc.uturn) {
      let acc = 0, tRev = null;
      for (const r of T) { acc += r.pathRate * SIM_DT; if (tRev == null && Math.abs(acc) >= Math.PI) { tRev = (r.t - accelTicks + 1) * SIM_DT; out.speedAtReverse = r4(r.speed); } }
      out.uturnS = tRev == null ? null : r4(tRev);
      out.speedKept = tRev == null ? null : r4(out.speedAtReverse / v0);
      out.slipP95Deg = r4(pct(T.filter((r) => tRev == null || (r.t - accelTicks) * SIM_DT <= tRev).map((r) => Math.abs(r.slip) * 180 / Math.PI), 0.95));
    } else {
      out.early = stat(win(1.0, 3.0));
      out.late = stat(win(Math.max(3.0, sc.turnS - 3), sc.turnS));
      out.decay = out.early.pathRate > 1e-3 ? r4(out.late.pathRate / out.early.pathRate) : null;
      out.slipP95Deg = r4(pct(win(1.0, sc.turnS).map((r) => Math.abs(r.slip) * 180 / Math.PI), 0.95));
      out.boostLate = r4(mean(win(sc.turnS - 3, sc.turnS).map((r) => r.boost)));
      out.saturatedPct = r4(100 * mean(win(1.0, sc.turnS).map((r) => (r.sat ? 1 : 0))));
    }
    if (sc.strafeYaw) {
      // The nose must turn the way the yaw key asks: count ticks it turns the other way, the
      // largest wrong-way excursion, and the largest single-tick jump.
      const want = sc.strafeYaw * side * 0 + sc.strafeYaw; // A = +turn? resolved below from cruise sign
      out.noseTrace = T.filter((_, i) => i % 15 === 0).map((r) => r4(r.rot));
      out._rates = T.map((r) => r.noseRate);
      out.noseNet = r4(wrapAngle(T[T.length - 1].rot - rows[accelTicks - 1].rot));
      out.maxJumpRadS = r4(Math.max(...T.map((r) => Math.abs(r.noseRate || 0))));
      out.pathNet = r4(T.reduce((a, r) => a + r.pathRate * SIM_DT, 0));
      out.slipEndDeg = r4(T[T.length - 1].slip * 180 / Math.PI);
    }
    return out;
  } finally {
    world.dispose();
    if (typeof kernel.setFlightTurnLab === 'function') kernel.setFlightTurnLab({});
  }
}
