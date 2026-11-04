// Docking approach beacons (inf-dock-approach-beacons).
//
// The docking cradle hologram owns the pad you land ON; the station itself never answered the
// two questions a pilot has from two rings out: WHERE is the mouth, and is it OPEN? The authored
// ring-gap pylons carry a pair of generic nav blinkers that blink the same rhythm as every other
// nav light on the hull and say nothing about dock state, so the approach only becomes readable
// inside the far-quiet band when the cradle's faint preview fades in.
//
// This layer dresses the approach itself, in the cradle's own holo-green language, for every
// station that publishes a docking proxy row:
//   gate pair      two crossed light cards standing at the ring-gap posts (the authored pylon
//                  bearings ±25°) — the dock's identity beacons, readable as a pair at range
//   lane dashes    flat dashes on the deck between the berth and the capture outer gate
//   threshold bar  a bar across the capture outer gate, marking where the lane begins
//
// The state read is the same truth the cradle consumes — `state.dockingCorridor` (the player's
// own corridor phase + stationId) — so the picture never disagrees with the hologram:
//   running   dock open, nobody's corridor here: calm green breathing, lane at a lit floor
//   guide     the player's corridor is working this station (approach/corridor): an inbound
//             pulse walks the lane from the outer gate toward the berth, showing the way in
//   acquire   capture: the gate pair runs the fast anti-collision double-flash, white-green
//   berthed   the player is settled: the pair holds steady, the lane holds lit
//
// Contract mirrors dockingCradle.js exactly: no Three.js objects, no GameState reads, no rng and
// no wall time (deterministic off simTime + a per-station phase hash), typed-array quads written
// into caller-owned buffers, world-space XZ in / world-space out. The vfx adapter localizes and
// binds one additive mesh. Reduced motion stretches every period and slows the walk; it never
// silences a light or drops a floor (the beacon-lamp floor law: a dark beacon reads as a dead one).

// Quad budget: per station 4 gate cards + 6 lane dashes + 1 threshold bar = 11; four docking
// stations fit with margin. One mesh, one draw call, all stations.
export const DOCK_APPROACH_QUADS = 64;
export const DOCK_APPROACH_STATION_CAP = 4;
/** Readability cull: past this range the pair is a sub-pixel glint; skip the station. */
export const DOCK_APPROACH_MAX_RANGE_WU = 1400;

export const DOCK_APPROACH_LAN_DASHES = 6;
/** Bearings of the gate pair relative to the corridor bearing — the authored pylon offsets. */
export const DOCK_APPROACH_GATE_SPREAD_DEG = 25;
/** Gate card height, as a fraction of the station scale (reconstructed from the row). */
const GATE_HEIGHT_FRAC = 0.22;
/** Gate card half-width, world units at reference scale, scaled by station scale. */
const GATE_HALF_WIDTH_FRAC = 0.03;

// Running: calm breathing, always lit. Guide: the lane walks inward. Acquire: anti-collision
// double-flash. Periods are seconds; reduced motion multiplies them, never zeroes a floor.
export const DOCK_APPROACH_RUNNING_PERIOD_S = 4.2;
export const DOCK_APPROACH_WALK_PERIOD_S = 2.6;
export const DOCK_APPROACH_ACQUIRE_PERIOD_S = 0.9;
export const DOCK_APPROACH_REDUCED_PERIOD_MUL = 3;
export const DOCK_APPROACH_FLOOR = 0.14;

// The cradle's holo green owns "dock". Acquire flashes white-green; berthed holds the green.
export const DOCK_APPROACH_COLORS = Object.freeze({
  running: 0x4dff85,
  guide: 0x4dff85,
  acquire: 0xd8ffe9,
  berthed: 0x5fff9a,
});

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Deterministic per-station phase in [0,1) — the beacon-lamp hash habit. */
export function dockApproachPhase(stationId) {
  let hash = 2166136261;
  const text = String(stationId);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

/** Brightness of one pulse window (u01 in [0,1)), a smooth sine lobe. */
function pulseEnvelope(u01, pulses) {
  let peak = 0;
  for (let p = 0; p < pulses.length; p++) {
    if (u01 >= pulses[p][0] && u01 <= pulses[p][1]) {
      const t = (u01 - pulses[p][0]) / (pulses[p][1] - pulses[p][0]);
      peak = Math.max(peak, Math.sin(t * Math.PI));
    }
  }
  return peak;
}

/**
 * One station's approach-beacon plan for this instant. Pure; writes on `out` (caller-owned).
 *
 * `row` is a state.physicsRuntime.collisionProxies entry (stationId, pos, rot, corridorBearingDeg,
 * berth, corridor) — the same frozen rows the cradle adapter already scans. `readout` is
 * state.dockingCorridor or null. `now` is the presented sim time.
 *
 * Plan: { live, mode, gateGlow01, laneGlow01, walk01, colorHex }
 *   gateGlow01  both gate cards' brightness this instant (0..1, floored when live)
 *   laneGlow01  the lane dashes' base brightness; the walk rides on top of it
 *   walk01      pulse position along the lane, 1 = at the outer gate, 0 = at the berth
 */
export function resolveDockApproachPlan(row, readout, now, reduced = false, out = {}) {
  out.live = false;
  out.mode = 'running';
  out.gateGlow01 = 0;
  out.laneGlow01 = 0;
  out.walk01 = 1;
  out.colorHex = DOCK_APPROACH_COLORS.running;
  if (!row || !row.corridor || !row.berth
    || !row.pos || !Number.isFinite(row.pos.x) || !Number.isFinite(row.pos.z)
    || !Number.isFinite(row.rot) || !Number.isFinite(row.corridorBearingDeg)) return out;
  const t = finite(now);
  const phase = dockApproachPhase(row.stationId);
  const mul = reduced ? DOCK_APPROACH_REDUCED_PERIOD_MUL : 1;
  const mine = !!(readout && readout.stationId != null && readout.stationId === row.stationId);
  const corridorPhase = mine ? String(readout.phase || 'none') : 'none';

  out.live = true;
  if (corridorPhase === 'berthed') {
    // Settled: the pair holds steady — no motion to read, just "you are held here".
    out.mode = 'berthed';
    out.colorHex = DOCK_APPROACH_COLORS.berthed;
    out.gateGlow01 = 0.92;
    out.laneGlow01 = 0.55;
    out.walk01 = 0;
    return out;
  }
  if (corridorPhase === 'capture') {
    // Acquisition: the fast anti-collision double-flash, slowed not silenced under reduced motion.
    const period = DOCK_APPROACH_ACQUIRE_PERIOD_S * mul;
    const u01 = (((t / period + phase) % 1) + 1) % 1;
    out.mode = 'acquire';
    out.colorHex = DOCK_APPROACH_COLORS.acquire;
    out.gateGlow01 = Math.max(DOCK_APPROACH_FLOOR + 0.2,
      pulseEnvelope(u01, [[0.02, 0.18], [0.38, 0.54]]));
    out.laneGlow01 = DOCK_APPROACH_FLOOR + 0.3;
    out.walk01 = 0;
    return out;
  }
  if (corridorPhase === 'approach' || corridorPhase === 'corridor') {
    // The lane walks the pilot in: the pulse starts at the outer gate and runs to the berth.
    const period = DOCK_APPROACH_WALK_PERIOD_S * (corridorPhase === 'corridor' ? 0.72 : 1) * mul;
    const walk = 1 - ((((t / period + phase) % 1) + 1) % 1);
    out.mode = 'guide';
    out.colorHex = DOCK_APPROACH_COLORS.guide;
    const breathe = 0.5 + 0.5 * Math.sin((((t / (DOCK_APPROACH_RUNNING_PERIOD_S * mul)) + phase) % 1) * Math.PI * 2);
    out.gateGlow01 = DOCK_APPROACH_FLOOR + 0.5 + 0.24 * breathe;
    out.laneGlow01 = DOCK_APPROACH_FLOOR + 0.18;
    out.walk01 = walk;
    return out;
  }
  // Running: the dock is open and calm. The pair breathes, the lane sits at a lit floor.
  const period = DOCK_APPROACH_RUNNING_PERIOD_S * mul;
  const c = (((t / period + phase) % 1) + 1) % 1;
  const breathe = 0.5 + 0.5 * Math.sin(c * Math.PI * 2);
  out.mode = 'running';
  out.colorHex = DOCK_APPROACH_COLORS.running;
  out.gateGlow01 = DOCK_APPROACH_FLOOR + 0.4 + 0.32 * breathe;
  out.laneGlow01 = DOCK_APPROACH_FLOOR + 0.1 + 0.08 * breathe;
  out.walk01 = 1;
  return out;
}

/**
 * World-space anchors for one station's beacons, derived from the proxy row with the same
 * axis convention the docking cradle draws with (world angle = rot + corridorBearingDeg).
 * The station scale is reconstructed from the row (captureOuterRadius = 1.20 × scale in the
 * authored manifests), so the dressing needs no station-entity walk of its own.
 * Writes caller-owned `out`: { gateX:[2], gateZ:[2], gateY, gateHalfW, dashX:[], dashZ:[],
 * dashHalfLen, barX, barZ, barHalfLen, barDX, barDZ, deckY }.
 */
export function buildDockApproachLayout(row, out = {}) {
  out.live = false;
  if (!row || !row.corridor || !row.berth
    || !row.pos || !Number.isFinite(row.pos.x) || !Number.isFinite(row.pos.z)
    || !Number.isFinite(row.rot) || !Number.isFinite(row.corridorBearingDeg)) return out;
  const outer = Math.abs(finite(row.corridor.captureOuterRadius, 0));
  const halfWidth = Math.abs(finite(row.corridor.captureHalfWidth, 0));
  if (!(outer > 0.5) || !(halfWidth > 0.05)) return out;
  const scale = outer / 1.2; // authored manifests: capture outer = 1.20 × scale
  const px = finite(row.pos.x);
  const pz = finite(row.pos.z);
  const base = row.rot + row.corridorBearingDeg * (Math.PI / 180);
  const spread = DOCK_APPROACH_GATE_SPREAD_DEG * (Math.PI / 180);
  const gateR = outer * (0.8 / 1.2); // the ring gap sits at 0.8 × station scale
  for (let k = 0; k < 2; k++) {
    const a = base + (k === 0 ? -spread : spread);
    out.gateX = out.gateX || [0, 0];
    out.gateZ = out.gateZ || [0, 0];
    out.gateX[k] = px + Math.cos(a) * gateR;
    out.gateZ[k] = pz + Math.sin(a) * gateR;
  }
  out.gateY = GATE_HEIGHT_FRAC * scale;
  out.gateHalfW = Math.max(0.5, GATE_HALF_WIDTH_FRAC * scale);
  // Lane dashes: evenly spaced between the berth and the capture outer gate, on the axis.
  const bx = finite(row.berth.x, px);
  const bz = finite(row.berth.z, pz);
  const ax = Math.cos(base), az = Math.sin(base);
  out.axisX = ax; out.axisZ = az;
  const inner = outer * 0.66, span = outer - inner;
  out.dashX = out.dashX || [];
  out.dashZ = out.dashZ || [];
  out.dashX.length = 0;
  out.dashZ.length = 0;
  for (let k = 0; k < DOCK_APPROACH_LAN_DASHES; k++) {
    const d = inner + (span * (k + 0.5)) / DOCK_APPROACH_LAN_DASHES;
    out.dashX.push(bx + ax * d);
    out.dashZ.push(bz + az * d);
  }
  out.dashHalfLen = Math.max(0.8, span / DOCK_APPROACH_LAN_DASHES * 0.34);
  // Threshold bar across the lane at the capture outer gate, perpendicular to the axis.
  out.barX = bx + ax * outer;
  out.barZ = bz + az * outer;
  out.barDX = -az; out.barDZ = ax;
  out.barHalfLen = halfWidth;
  out.deckY = 0.35;
  out.live = true;
  return out;
}

/**
 * Write one station's beacons into the shared quad pool. Same buffer contract as
 * dockingCradle.js: positions/colors grown by the caller, fixed Uint16 indices, draw count moves.
 * `opts.base` is the quad count already in the pool from earlier stations this frame — emission
 * appends and `out.indexCount` reports the POOL total, so the adapter can dress several stations
 * into one draw call. Gate cards stand vertical (two crossed cards per post, readable from any
 * bearing); lane dashes and the threshold bar lie flat on the deck plane. The walk rides the
 * dashes as a brightness gradient centred on the pulse position — no geometry moves, only light.
 */
export function writeDockApproachGeometry(out, layout, plan, opts = {}) {
  if (!out) return out;
  const base = Math.max(0, Math.trunc(finite(opts.base, 0)));
  if (base === 0) out.indexCount = 0;
  if (!out.quadCapacity || !layout || !plan || !layout.live || !plan.live) return out;
  const gain = clamp01(opts.gain != null ? opts.gain : 1);
  if (!(gain > 0)) return out;
  const color = DOCK_APPROACH_COLORS[plan.mode] || DOCK_APPROACH_COLORS.running;
  const cr = ((color >> 16) & 255) / 255;
  const cg = ((color >> 8) & 255) / 255;
  const cb = (color & 255) / 255;
  let emitted = base;

  const emitQuad = (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, bright) => {
    if (emitted >= out.quadCapacity) return;
    const o = emitted * 12;
    const p = out.positions, c = out.colors;
    p[o] = x0; p[o + 1] = y0; p[o + 2] = z0;
    p[o + 3] = x1; p[o + 4] = y1; p[o + 5] = z1;
    p[o + 6] = x2; p[o + 7] = y2; p[o + 8] = z2;
    p[o + 9] = x3; p[o + 10] = y3; p[o + 11] = z3;
    for (let v = 0; v < 4; v++) {
      c[o + v * 3] = cr * bright;
      c[o + v * 3 + 1] = cg * bright;
      c[o + v * 3 + 2] = cb * bright;
    }
    emitted += 1;
  };

  // --- Gate pair: two crossed vertical cards per post. -----------------------------------
  const gh = layout.gateY, gw = layout.gateHalfW;
  const glow = clamp01(plan.gateGlow01) * gain;
  if (glow > 0.01) {
    for (let k = 0; k < 2; k++) {
      const gx = layout.gateX[k], gz = layout.gateZ[k];
      // Card A runs along the corridor axis, card B across it; together they read from any bearing.
      for (let card = 0; card < 2; card++) {
        const tx = card === 0 ? layout.axisX : -layout.axisZ;
        const tz = card === 0 ? layout.axisZ : layout.axisX;
        emitQuad(
          gx - tx * gw, 0, gz - tz * gw,
          gx + tx * gw, 0, gz + tz * gw,
          gx + tx * gw, gh, gz + tz * gw,
          gx - tx * gw, gh, gz - tz * gw,
          glow,
        );
      }
    }
  }

  // --- Lane dashes: flat on the deck, long axis along the corridor. The walk pulse brightens
  // the dash nearest walk01 (1 = outer gate) and its neighbours fade out from there. ----------
  const laneBase = clamp01(plan.laneGlow01) * gain;
  const walk = clamp01(plan.walk01);
  const count = layout.dashX.length;
  if (laneBase > 0.01 && count > 0) {
    // Dash k sits at fraction (k + 0.5)/count along [inner, outer]; walk01 maps 0..1 onto the
    // same lane, 0 at the berth end. Fraction-from-berth for dash k:
    const innerFrac = 0.66;
    for (let k = 0; k < count; k++) {
      const frac = innerFrac + (1 - innerFrac) * ((k + 0.5) / count);
      const dist = Math.abs(frac - walk);
      const hot = Math.max(0, 1 - dist * count * 1.4);
      const bright = laneBase + hot * 0.85 * gain;
      const dx = layout.dashX[k], dz = layout.dashZ[k];
      const hx = layout.axisX * layout.dashHalfLen, hz = layout.axisZ * layout.dashHalfLen;
      const px = -layout.axisZ * 0.45, pz = layout.axisX * 0.45;
      emitQuad(
        dx - hx - px, layout.deckY, dz - hz - pz,
        dx + hx - px, layout.deckY, dz + hz - pz,
        dx + hx + px, layout.deckY, dz + hz + pz,
        dx - hx + px, layout.deckY, dz - hz + pz,
        bright,
      );
    }
  }

  // --- Threshold bar: flat across the lane at the outer gate. -----------------------------
  const barBright = Math.max(laneBase, clamp01(plan.gateGlow01) * 0.5 * gain);
  if (barBright > 0.01) {
    const bx = layout.barX, bz = layout.barZ;
    const dx = layout.barDX, dz = layout.barDZ;
    const hw = layout.barHalfLen;
    emitQuad(
      bx - dx * hw, layout.deckY, bz - dz * hw,
      bx + dx * hw, layout.deckY, bz + dz * hw,
      bx + dx * hw, layout.deckY + 0.06, bz + dz * hw,
      bx - dx * hw, layout.deckY + 0.06, bz - dz * hw,
      barBright,
    );
  }

  out.indexCount = emitted * 6;
  return out;
}

/** Allocate one shared quad pool. Indices are fixed; the draw count moves. */
export function createDockApproachGeometry(quadCapacity = DOCK_APPROACH_QUADS) {
  const capacity = Math.max(16, Math.trunc(finite(quadCapacity, DOCK_APPROACH_QUADS)));
  const positions = new Float32Array(capacity * 4 * 3);
  const colors = new Float32Array(capacity * 4 * 3);
  const indices = new Uint16Array(capacity * 6);
  for (let quad = 0; quad < capacity; quad += 1) {
    const v = quad * 4, o = quad * 6;
    indices[o] = v; indices[o + 1] = v + 1; indices[o + 2] = v + 2;
    indices[o + 3] = v + 1; indices[o + 4] = v + 3; indices[o + 5] = v + 2;
  }
  return { quadCapacity: capacity, positions, colors, indices, indexCount: 0 };
}
