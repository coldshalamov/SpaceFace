// The thrown aggregate's forecast, as preview plans (packet 05). Gyre's armed release and the Pull
// collector's focused release both draw their line through here, so they cannot disagree.
//
// Faithful by construction: the initial state comes from the launch plan's own `burstPlan`, the
// collision shape is the ball's real collider radius, and every field force is the owner's kernel
// sample for THIS ball (mass-shrug and velocity gate included) — see src/matter/aggregateTrajectory.js
// for the integrator. The result is labelled conditional: moving bodies and expiring fields change it.
//
// Read-only. Body queries run readOnly (no promotion, no budget), buffers are module-level and reused,
// and candidates are filtered to a corridor along the line and capped, so holding the key costs a
// bounded amount per plan at the preview cadence.

import { GYRE_SNARE as D } from './gyreSnare.js';
import { fieldContainsPoint, sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { activeFieldSnapshot, fieldBodyProfile, fieldVelocityTermApplies } from '../systems/fields.js';
import { queryPhysicalBodies } from '../combat/physicalEffects.js';
import { launchPlan, burstPlan, springAccel } from '../matter/aggregateMass.js';
import { predictTrajectory, createTrajectoryBuffer, TRAJECTORY_BUDGET } from '../matter/aggregateTrajectory.js';
import { knotThrowDirection } from '../matter/collectorKnot.js';
import { COLLECTOR_KNOT } from './collectorKnot.js';

export const FORECAST_NOTE = 'Forecast — moving bodies and fields change it';
const CORRIDOR_PAD_WU = 90;       // how far off the line a body is still swept
const COLLIDER_TYPES = new Set(['ship', 'drone', 'asteroid', 'wreck', 'station', 'structure', 'payload', 'gate']);

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const simNow = (state) => (Number.isFinite(state && state.simTime) ? state.simTime : ((state && state.tick) || 0) / 60);

const _buf = createTrajectoryBuffer();
const _query = [];
const _P = { x: 0, z: 0 };
const _V = { x: 0, z: 0 };
const _inside = [];
const _profile = {};
const _cands = [];

const _spring = { ax: 0, az: 0 };

/**
 * Run the release the way execution runs it, from the ball's CURRENT state: `coilTicks` ticks of the
 * coil spring toward the frozen aim axis (Gyre only; 0 for a knot that is thrown where it sits), then
 * the burst's per-tick impulses from `burstPlan` — the same plan, the same spring law, the same fixed
 * step. `carrier` ({pos, vel}) is the ship, assumed to hold its velocity (the forecast is conditional).
 * Returns { x, z, vx, vz }: where the ball is, and how fast, when the burst has finished.
 */
export function simulateRelease(ball, carrier, dir, plan, coil, out = { x: 0, z: 0, vx: 0, vz: 0 }) {
  const dt = 1 / 60;
  const mass = Math.max(1e-9, finite(ball.mass, 1));
  let px = ball.x, pz = ball.z, vx = ball.vx, vz = ball.vz;
  const cvx = carrier ? finite(carrier.vx) : 0, cvz = carrier ? finite(carrier.vz) : 0;
  const ticks = coil ? Math.max(0, coil.ticks | 0) : 0;
  for (let i = 0; i < ticks; i++) {
    const tx = carrier.x + cvx * i * dt + dir.x * coil.reach;
    const tz = carrier.z + cvz * i * dt + dir.z * coil.reach;
    springAccel(px, pz, vx, vz, tx, tz, cvx, cvz, coil.k, coil.damping, coil.maxAccel, _spring);
    vx += _spring.ax * dt; vz += _spring.az * dt;
    px += vx * dt; pz += vz * dt;
  }
  const burst = burstPlan({ mass, dir, coreVel: { x: vx, z: vz }, refVel: { x: cvx, z: cvz }, speed: plan.speed, ticks: plan.ticks });
  for (let k = 0; k < plan.ticks; k++) {
    const jx = burst.perTick.x + (k === 0 ? burst.lateral.x : 0);
    const jz = burst.perTick.z + (k === 0 ? burst.lateral.z : 0);
    vx += jx / mass; vz += jz / mass;
    px += vx * dt; pz += vz * dt;
  }
  out.x = px; out.z = pz; out.vx = vx; out.vz = vz;
  return out;
}

function liveFields(state) {
  const snap = activeFieldSnapshot(state);
  const out = [];
  for (let i = 0; i < snap.length; i++) if (snap[i] && !snap[i].thermal) out.push(snap[i]);
  return out;
}

/**
 * Forecast a thrown ball. `ball` = the live core entity (read only); `start` = { x, z } where the
 * integration begins and `exit` = { x, z } the velocity there. Returns
 * `{ points: [x0,z0,…], hit: {id,t,x,z,relSpeed}|null, moves: [], endT, conditional: true }` or null.
 */
export function forecastThrow(state, ball, start, exit, opts = {}) {
  if (!state || !ball || !start || !exit) return null;
  const radius = Math.max(1, finite(ball.physicsBody && ball.physicsBody.radius, finite(ball.radius, 8)));
  const speed = Math.hypot(exit.x, exit.z);
  if (!(speed > 1e-3)) return null;
  const horizonS = TRAJECTORY_BUDGET.horizonS;

  // Candidate corridor along the straight line, widened for the ball and the pad.
  const reach = speed * horizonS;
  const ux = exit.x / speed, uz = exit.z / speed;
  const mid = { x: start.x + ux * reach * 0.5, z: start.z + uz * reach * 0.5 };
  queryPhysicalBodies(state, mid, reach * 0.5 + radius + CORRIDOR_PAD_WU, null, _query, { readOnly: true });
  _cands.length = 0;
  const skip = opts.skipIds || null;
  for (let i = 0; i < _query.length; i++) {
    const e = _query[i];
    if (!e || e.alive === false || !e.pos || e.id === ball.id || e.id === state.playerId) continue;
    if (skip && skip.has(e.id)) continue;
    if (!COLLIDER_TYPES.has(e.type) || e.collides === false) continue;
    if (e.physicsBody && e.physicsBody.material === 'sensor') continue;
    if (e.data && (e.data.gyreLaunched || e.data.gyreCore || e.data.collectorCore)) continue; // another aggregate: a ghost in the forecast
    const rx = e.pos.x - start.x, rz = e.pos.z - start.z;
    const along = rx * ux + rz * uz;
    const across = Math.abs(rx * uz - rz * ux);
    const er = Math.max(1, finite(e.physicsBody && e.physicsBody.radius, finite(e.radius, 8)));
    if (along < -er - radius || along > reach + er + radius) continue;
    if (across > radius + er + CORRIDOR_PAD_WU) continue;
    _cands.push({
      id: e.id, x: e.pos.x, z: e.pos.z, vx: finite(e.vel && e.vel.x), vz: finite(e.vel && e.vel.z),
      radius: er, along, type: e.type, anchored: e.type === 'station' || e.type === 'gate',
    });
  }
  _query.length = 0;
  _cands.sort((a, b) => a.along - b.along);
  if (_cands.length > TRAJECTORY_BUDGET.maxBodies) _cands.length = TRAJECTORY_BUDGET.maxBodies;

  // The same field kernel the ball feels in execution, sampled per fixed step.
  const live = liveFields(state);
  let fieldAccel = null;
  if (live.length) {
    const profile = fieldBodyProfile(ball, state, _profile);
    const gated = fieldVelocityTermApplies(ball, profile);
    const now = simNow(state);
    fieldAccel = (x, z, vx, vz, t, out) => {
      _inside.length = 0;
      for (let j = 0; j < live.length; j++) if (fieldContainsPoint(live[j], x, z)) _inside.push(live[j]);
      if (!_inside.length) { out.ax = 0; out.az = 0; return out; }
      _P.x = x; _P.z = z; _V.x = vx; _V.z = vz;
      sampleFieldAcceleration(_P, gated ? _V : null, _inside, now + t, profile, out);
      return out;
    };
  }

  predictTrajectory({ x: start.x, z: start.z, vx: exit.x, vz: exit.z, radius },
    { fieldAccel, bodies: _cands, horizonS }, _buf);
  if (!_buf.valid || _buf.count < 2) return null;
  const points = new Array(_buf.count * 2);
  for (let i = 0; i < points.length; i++) points[i] = _buf.points[i];
  const im = _buf.impact;
  return {
    points,
    hit: im.hit ? { id: im.id, t: im.t, x: im.x, z: im.z, relSpeed: im.relSpeed } : null,
    hitBody: im.hit && im.index >= 0 ? _cands[im.index] : null,
    endT: _buf.endT, fieldAware: _buf.fieldAware, conditional: true, radius,
  };
}

function throwMoves(forecast) {
  if (!forecast || !forecast.hit || !forecast.hitBody) return [];
  const b = forecast.hitBody;
  const h = forecast.hit;
  // The struck body, with an arrow along the ball's heading: where the throw would push it.
  const n = forecast.points.length;
  const dx = forecast.points[n - 2] - forecast.points[n - 4];
  const dz = forecast.points[n - 1] - forecast.points[n - 3];
  const len = Math.hypot(dx, dz) || 1;
  const reachWu = Math.min(80, 20 + h.relSpeed * 0.15);
  return [{
    id: b.id, x: b.x, z: b.z, radius: b.radius,
    path: [b.x, b.z, b.x + (dx / len) * reachWu, b.z + (dz / len) * reachWu],
    toX: b.x + (dx / len) * reachWu, toZ: b.z + (dz / len) * reachWu,
    shrug: b.anchored === true, marked: !b.anchored,
  }];
}

/** The preview plan for Gyre's armed release (HOLD): the throw leaves along the nose from the coil point. */
export function planGyreThrow(state, player) {
  const g = state && state.gyreSnare;
  if (!g || g.phase !== 'holding' || g.coreId == null) return null;
  const core = state.entities && state.entities.get(g.coreId);
  if (!core || core.alive === false || !core.pos) return null;
  const mass = finite(g.clumpMass, finite(core.physicsBody && core.physicsBody.mass, 1));
  const radius = finite(g.clumpRadius, finite(core.physicsBody && core.physicsBody.radius, 8));
  const rot = finite(player.rot);
  const dir = { x: Math.cos(rot), z: Math.sin(rot) };
  const plan = launchPlan(mass, D);
  const carrier = { x: finite(player.pos.x), z: finite(player.pos.z), vx: finite(player.vel && player.vel.x), vz: finite(player.vel && player.vel.z) };
  // The coil pulls the ball onto the frozen aim axis; the burst then fires — both run from the ball's
  // REAL position and velocity, with the same spring and burst plan as execution.
  const pullWu = Math.max(D.launchWindupPullWu, radius * 0.4);
  const landed = simulateRelease(
    { x: core.pos.x, z: core.pos.z, vx: finite(core.vel && core.vel.x), vz: finite(core.vel && core.vel.z), mass },
    carrier, dir, plan,
    { ticks: plan.windupTicks, reach: D.mawDist - pullWu, k: D.launchWindupSpringK, damping: D.launchWindupDamping, maxAccel: D.launchWindupMaxAccel || D.holdMaxAccel },
  );
  const coil = { x: core.pos.x, z: core.pos.z };
  const start = { x: landed.x, z: landed.z };
  const exit = { x: landed.vx, z: landed.vz };
  const forecast = forecastThrow(state, core, start, exit, {});
  if (!forecast) return null;
  const areas = [{ kind: 'route', role: 'route', points: [coil.x, coil.z, ...forecast.points] }];
  return {
    center: { x: coil.x, z: coil.z }, radius, areas, moves: throwMoves(forecast), blocked: null,
    note: forecast.hit ? `${FORECAST_NOTE} · strike in ${forecast.hit.t.toFixed(1)}s` : FORECAST_NOTE,
    forecast,
  };
}

/**
 * The preview plan for a collector knot's focused release: it leaves from where it physically is,
 * along `dir`, at the plan speed — no coil, no carrier frame.
 */
export function planKnotThrow(state, knot, dir, tuning) {
  if (!knot || !knot.pos || !dir) return null;
  const mass = finite(knot.physicsBody && knot.physicsBody.mass, 1);
  const plan = launchPlan(mass, tuning);
  const landed = simulateRelease(
    { x: knot.pos.x, z: knot.pos.z, vx: finite(knot.vel && knot.vel.x), vz: finite(knot.vel && knot.vel.z), mass },
    null, dir, plan, null,
  );
  const forecast = forecastThrow(state, knot, { x: landed.x, z: landed.z }, { x: landed.vx, z: landed.vz }, {});
  if (!forecast) return null;
  const areas = [{ kind: 'route', role: 'route', points: [knot.pos.x, knot.pos.z, ...forecast.points] }];
  return {
    center: { x: knot.pos.x, z: knot.pos.z }, radius: forecast.radius, areas, moves: throwMoves(forecast), blocked: null,
    note: forecast.hit ? `${FORECAST_NOTE} · strike in ${forecast.hit.t.toFixed(1)}s` : FORECAST_NOTE,
    forecast, plan,
  };
}

const _knotDir = { x: 1, z: 0 };

/**
 * The held Pull key with a collector knot: the focused release. The forecast leaves from where the
 * knot physically is toward the aim point; the plan is dimmed with its reason when the throw would be
 * refused (out of reach, not enough charge), so the key answers before it is released.
 */
export function planCollectorRelease(state, player) {
  const c = state && state.fieldsRuntime && state.fieldsRuntime.collector;
  if (!c || !c.fitted || !c.ready || c.coreId == null) return null;
  const core = state.entities && state.entities.get(c.coreId);
  if (!core || core.alive === false || !core.pos) return null;
  const dir = knotThrowDirection(state, player, core.pos, _knotDir);
  const plan = planKnotThrow(state, core, { x: dir.x, z: dir.z }, COLLECTOR_KNOT);
  if (!plan) return null;
  const reach = Math.hypot(core.pos.x - player.pos.x, core.pos.z - player.pos.z);
  const cap = typeof player.cap === 'number' && Number.isFinite(player.cap) ? player.cap
    : (player.data && player.data.derived && player.data.derived.cap) || 0;
  let blocked = null;
  if (reach > COLLECTOR_KNOT.focusRange) blocked = 'Knot is out of reach — close in to throw it';
  else if (cap < c.cost) blocked = `Needs ${Math.ceil(c.cost)} charge to throw — you have ${Math.floor(cap)}`;
  return {
    ...plan, blocked,
    note: `KNOT ${Math.round(c.mass)} t · release to throw · ${Math.ceil(c.cost)} charge · ${plan.note}`,
  };
}
