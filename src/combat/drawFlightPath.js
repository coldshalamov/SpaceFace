// A forward-only steering ribbon. Ink supplies a route and an exit tangent, never a stopping
// position or a corner speed. Lookahead scales with the full-speed turn radius: tight ink is
// rounded rather than pursued by alternating full-thrust recapture commands.
import { DRAW_FLIGHT, drawFlightTurnRate, drawWrapAngle } from '../core/flight/drawFlightControl.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const pointValid = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);

function cacheFor(runtime, route) {
  const points = route.points;
  const head = points[0];
  const tail = points.at(-1);
  let c = runtime.path;
  const last = c && points[c.consumed - 1];
  // Exact bounded prefix witness: replays/editors can mutate an interior sample in place.
  // Head/tail/count alone would silently fly the old geometry. Live strokes cost <=256 reads.
  const prefixMoved = c && c.witness.some((p, i) =>
    !Object.is(p.x, points[i]?.x) || !Object.is(p.z, points[i]?.z));
  const replaced = prefixMoved || !c || c.source !== points || c.consumed > points.length
    || c.headX !== head?.x || c.headZ !== head?.z
    || c.lastX !== last?.x || c.lastZ !== last?.z;
  if (replaced) {
    c = runtime.path = { source: points, headX: head?.x, headZ: head?.z, consumed: 0,
      lastX: null, lastZ: null, witness: [], nodes: [], total: 0, progressS: 0, complete: false,
      projection: { s: 0, x: 0, z: 0 }, carrot: { x: 0, z: 0 } };
  }
  // Input bounds live strokes; externally supplied/replayed corrupt routes get the same bound.
  // No distance/spacing loop: even a 1e308 coordinate pair cannot monopolize a simulation tick.
  const end = Math.min(points.length, DRAW_FLIGHT.maxPoints);
  for (let i = c.consumed; i < end; i++) {
    const p = points[i];
    c.witness[i] = { x: p?.x, z: p?.z };
    if (!pointValid(p)) continue;
    const a = c.nodes.at(-1);
    if (!a) { c.nodes.push({ x: p.x, z: p.z, s: 0, source: i }); continue; }
    const distance = Math.hypot(p.x - a.x, p.z - a.z);
    if (!(distance > 1e-5) || !Number.isFinite(distance) || distance > DRAW_FLIGHT.maxSegment) continue;
    c.total += distance;
    c.nodes.push({ x: p.x, z: p.z, s: c.total, source: i });
    c.complete = false;
  }
  c.consumed = points.length;
  c.lastX = tail?.x;
  c.lastZ = tail?.z;
  return c;
}

function indexAt(nodes, s) {
  let lo = 0, hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nodes[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, nodes.length - 2);
}

function pointAt(c, s, out) {
  const i = indexAt(c.nodes, s);
  const a = c.nodes[i], b = c.nodes[i + 1];
  const t = Math.max(0, (s - a.s) / (b.s - a.s));
  // Deliberately extrapolate the last segment. A short stroke ends in flight, not parking.
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

function projectAhead(c, x, z, window) {
  const from = c.progressS;
  const to = Math.min(c.total, from + window);
  let best = Infinity;
  const out = c.projection;
  out.s = from;
  for (let i = indexAt(c.nodes, from); i < c.nodes.length - 1; i++) {
    const a = c.nodes[i], b = c.nodes[i + 1];
    if (a.s > to) break;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = b.s - a.s;
    const t0 = Math.max(0, (from - a.s) / length);
    const t1 = Math.min(1, (to - a.s) / length);
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (length * length), t0, t1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) { best = d; out.s = a.s + t * length; out.x = px; out.z = pz; }
  }
  return out;
}

/** Returns a transient kernel command, or null for an empty/invalid stroke. */
export function followDrawFlightPath(route, player, runtime, profile, dt) {
  if (!route?.active || !Array.isArray(route.points) || route.points.length < 2) {
    runtime.path = null;
    return null;
  }
  const c = cacheFor(runtime, route);
  if (c.nodes.length < 2 || !(c.total > 1e-5)) return null;
  const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
  const cruise = Math.max(1, finite(profile.combatSpeed, finite(profile.maxSpeed, 120)));
  const radius = Math.max(speed, cruise * 0.4) / drawFlightTurnRate(profile);
  const lookahead = Math.max(DRAW_FLIGHT.minLookahead, radius * DRAW_FLIGHT.lookaheadRadii);
  const px = finite(player.pos?.x), pz = finite(player.pos?.z);
  const last = c.nodes.at(-1), prev = c.nodes.at(-2);
  const endHeading = Math.atan2(last.z - prev.z, last.x - prev.x);
  if (!c.complete) {
    const projection = projectAhead(c, px, pz, Math.max(lookahead, speed * dt * 2));
    c.progressS = Math.max(c.progressS, projection.s);
    const endAlong = (px - last.x) * Math.cos(endHeading) + (pz - last.z) * Math.sin(endHeading);
    if (c.progressS >= c.total - 1e-5 ||
      (c.total - c.progressS < lookahead * 0.35 && endAlong >= 0)) {
      c.complete = true;
      c.progressS = c.total;
    }
  }
  const carrot = pointAt(c, c.progressS + lookahead, c.carrot);
  let heading = c.complete ? endHeading : Math.atan2(carrot.z - pz, carrot.x - px);
  if (!Number.isFinite(heading)) heading = finite(player.rot);
  const previous = finite(runtime.drawHeading, speed > 0.5
    ? Math.atan2(finite(player.vel?.z), finite(player.vel?.x)) : finite(player.rot));
  let error = drawWrapAngle(heading - previous);
  if (Math.abs(error) > Math.PI - 0.08 && runtime.drawTurnSign) {
    error = Math.abs(error) * runtime.drawTurnSign;
  } else if (Math.abs(error) > 0.06) {
    runtime.drawTurnSign = Math.sign(error);
  }
  runtime.drawHeading = previous + error * (1 - Math.exp(-Math.max(0, dt) / DRAW_FLIGHT.headingFilterS));
  const index = indexAt(c.nodes, c.progressS);
  route.pointIndex = c.complete ? route.points.length : Math.max(1, c.nodes[index].source);
  const command = runtime.drawCommand || (runtime.drawCommand = {});
  command.active = true;
  command.heading = drawWrapAngle(runtime.drawHeading);
  command.turnSign = runtime.drawTurnSign || 1;
  command.exhausted = c.complete;
  command.backlogS = Math.max(0, c.total - c.progressS) / cruise;
  return command;
}
