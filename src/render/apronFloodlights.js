// Apron floodlights (inf-apron-flood) — the pure decision layer.
//
// The player story: a docking station reads as a PLACE at night. Its windows glow
// (stationNightLights), its approach speaks holo-green (dockApproachBeacons: gate pair, lane
// dashes, threshold — the dock's SIGNAGE), but the apron itself — the deck where ships park and
// tug — stood dark. Real docks run physical work lights over the pad. This layer dresses the
// apron in the dock-sodium language:
//   rig pair    two warm floodlight cards standing at the berth-mouth flanks — the lamps you
//               see from two rings out, silhouetting the dock mouth
//   taxi pools  two elongated warm pools lying on the deck between the berth and the capture
//               outer gate — where ships actually taxi and park
//   pad pool    a soft diamond over the berth itself — the lit landing spot
//
// Distinct from the holo-green lane by tint (sodium, not green) and by role (physical work
// lights, not signage). The state read is the same docking proxy rows the cradle and beacons
// consume — the picture never disagrees with the hologram. Deterministic off simTime and a
// per-station phase hash; reduced motion stretches every period and never drops the work floor
// (the beacon-lamp floor law). Same buffer contract as dockApproachBeacons.js: caller-owned
// typed arrays, fixed Uint16 indices, draw count moves; the adapter binds one additive mesh.

/** Readability cull — the same band the approach beacons read at. */
export const APRON_FLOOD_MAX_RANGE_WU = 1400;
/** One mesh, one draw call: 5 quads per station, four docking stations fit with margin. */
export const APRON_FLOOD_STATION_CAP = 4;
export const APRON_FLOOD_QUADS_PER_STATION = 5;

/** Work-light rhythm and floors. */
export const APRON_FLOOD_PERIOD_S = 3.4;
export const APRON_FLOOD_REDUCED_PERIOD_MUL = 3;
export const APRON_FLOOD_FLOOR = 0.2;

/** Warm sodium rig; slightly warmer pool wash. */
export const APRON_FLOOD_RIG_HEX = 0xffd9a0;
export const APRON_FLOOD_POOL_HEX = 0xffb66b;

/** Geometry fractions, reconstructed from the proxy row (captureOuterRadius = 1.20 x scale,
 *  the same authored-manifest rule dockApproachBeacons uses). */
export const APRON_FLOOD_RIG_HEIGHT_FRAC = 0.16;
export const APRON_FLOOD_RIG_HALF_W_FRAC = 0.028;
export const APRON_FLOOD_RIG_FLANK_FRAC = 0.9;    // flank offset as share of the capture half-width
export const APRON_FLOOD_DECK_Y = 0.32;

export function apronFloodPhase(stationId) {
  let hash = 2166136261;
  const text = String(stationId);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * World-space anchors for one station's apron, from the proxy row with the cradle's axis
 * convention (world angle = rot + corridorBearingDeg). Writes caller-owned `out`:
 *   { live, rigX:[2], rigZ:[2], rigY, rigHalfW, padX, padZ, padHalfW,
 *     poolAX, poolAZ, poolBX, poolBZ, poolHalfLen, poolHalfW, axisX, axisZ }
 */
export function buildApronFloodLayout(row, out = {}) {
  out.live = false;
  if (!row || !row.corridor || !row.berth
    || !row.pos || !Number.isFinite(row.pos.x) || !Number.isFinite(row.pos.z)
    || !Number.isFinite(row.rot) || !Number.isFinite(row.corridorBearingDeg)) return out;
  const outer = Math.abs(finite(row.corridor.captureOuterRadius, 0));
  const halfWidth = Math.abs(finite(row.corridor.captureHalfWidth, 0));
  if (!(outer > 0.5) || !(halfWidth > 0.05)) return out;
  const scale = outer / 1.2;
  const px = finite(row.pos.x);
  const pz = finite(row.pos.z);
  const base = row.rot + row.corridorBearingDeg * (Math.PI / 180);
  const ax = Math.cos(base), az = Math.sin(base);
  const nx = -az, nz = ax;
  const bx = finite(row.berth.x, px);
  const bz = finite(row.berth.z, pz);
  // Rig pair: standing at the berth-mouth flanks, off the axis.
  const flank = halfWidth * APRON_FLOOD_RIG_FLANK_FRAC;
  out.rigX = [bx + nx * flank, bx - nx * flank];
  out.rigZ = [bz + nz * flank, bz - nz * flank];
  out.rigY = Math.max(1.5, APRON_FLOOD_RIG_HEIGHT_FRAC * scale);
  out.rigHalfW = Math.max(0.4, APRON_FLOOD_RIG_HALF_W_FRAC * scale);
  // Pad pool: the lit landing spot over the berth.
  out.padX = bx;
  out.padZ = bz;
  out.padHalfW = Math.max(1.5, halfWidth * 0.55);
  // Taxi pools: two elongated quads between the berth and the capture outer gate.
  const gx = px + ax * outer, gz = pz + az * outer;
  const span = Math.hypot(gx - bx, gz - bz);
  out.poolHalfLen = Math.max(0.9, span / 2 * 0.32);
  out.poolHalfW = Math.max(0.5, halfWidth * 0.34);
  out.poolAX = bx + (gx - bx) * 0.26;
  out.poolAZ = bz + (gz - bz) * 0.26;
  out.poolBX = bx + (gx - bx) * 0.72;
  out.poolBZ = bz + (gz - bz) * 0.72;
  out.axisX = ax; out.axisZ = az;
  out.live = true;
  return out;
}

/**
 * One station's apron-light plan for this instant. Pure; writes on `out` (caller-owned):
 * { live, mode, rigGlow01, poolGlow01 }. The apron works when the corridor works: a corridor
 * walking a pilot in or acquiring a capture steps the apron up to working bright; a berthed pad
 * holds steady (occupied pads stay lit); an idle dock sits at the breathing work floor.
 */
export function resolveApronFloodPlan(row, readout, now, reduced = false, out = {}) {
  out.live = false;
  out.mode = 'running';
  out.rigGlow01 = APRON_FLOOD_FLOOR;
  out.poolGlow01 = APRON_FLOOD_FLOOR * 0.8;
  if (!row || !row.corridor || !row.berth || !row.pos) return out;
  const t = finite(now);
  const phase = apronFloodPhase(row.stationId);
  const mul = reduced ? APRON_FLOOD_REDUCED_PERIOD_MUL : 1;
  const c = (((t / APRON_FLOOD_PERIOD_S / mul + phase) % 1) + 1) % 1;
  const breathe = 0.5 + 0.5 * Math.sin(c * Math.PI * 2);
  const mine = !!(readout && readout.stationId != null && readout.stationId === row.stationId);
  const corridorPhase = mine ? String(readout.phase || 'none') : 'none';

  out.live = true;
  const floorRig = APRON_FLOOD_FLOOR + 0.3;
  const floorPool = APRON_FLOOD_FLOOR + 0.08;
  if (corridorPhase === 'berthed') {
    // Occupied pad: the work lights hold steady and bright — someone is parked here.
    out.mode = 'berthed';
    out.rigGlow01 = 0.92;
    out.poolGlow01 = 0.78;
    return out;
  }
  if (corridorPhase === 'capture' || corridorPhase === 'approach' || corridorPhase === 'corridor') {
    // The apron is working: step the rig up hot over the breathing floor.
    out.mode = 'working';
    out.rigGlow01 = Math.min(1, floorRig + 0.42 + 0.18 * breathe);
    out.poolGlow01 = Math.min(1, floorPool + 0.5 + 0.12 * breathe);
    return out;
  }
  // Idle dock: the work floor, breathing slowly.
  out.mode = 'running';
  out.rigGlow01 = floorRig + 0.22 * breathe;
  out.poolGlow01 = floorPool + 0.14 * breathe;
  return out;
}

/** Scratch buffers for the shared apron mesh — same contract as dockApproachBeacons. */
export function createApronFloodGeometry() {
  const quadCapacity = APRON_FLOOD_STATION_CAP * APRON_FLOOD_QUADS_PER_STATION;
  const positions = new Float32Array(quadCapacity * 12);
  const colors = new Float32Array(quadCapacity * 12);
  const indices = new Uint16Array(quadCapacity * 6);
  for (let q = 0; q < quadCapacity; q++) {
    const o = q * 4;
    indices[q * 6] = o;
    indices[q * 6 + 1] = o + 1;
    indices[q * 6 + 2] = o + 2;
    indices[q * 6 + 3] = o;
    indices[q * 6 + 4] = o + 2;
    indices[q * 6 + 5] = o + 3;
  }
  return { positions, colors, indices, indexCount: 0, quadCapacity };
}

/**
 * Write one station's apron into the shared quad pool. `base` is the quad count already in the
 * pool from earlier stations this frame — emission appends and `out.indexCount` reports the
 * POOL total. Rig cards stand vertical at the berth-mouth flanks; taxi pools and the pad
 * diamond lie flat on the deck. No geometry moves between frames — only light.
 */
export function writeApronFloodGeometry(out, layout, plan, opts = {}) {
  if (!out) return out;
  const base = Math.max(0, Math.trunc(finite(opts.base, 0)));
  if (base === 0) out.indexCount = 0;
  if (!out.quadCapacity || !layout || !plan || !layout.live || !plan.live) return out;
  const gain = Math.min(1, Math.max(0, finite(opts.gain, 1)));
  if (!(gain > 0)) return out;
  let emitted = base;

  const emitTinted = (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, bright, hex) => {
    if (emitted >= out.quadCapacity) return;
    const o = emitted * 12;
    const p = out.positions, c = out.colors;
    p[o] = x0; p[o + 1] = y0; p[o + 2] = z0;
    p[o + 3] = x1; p[o + 4] = y1; p[o + 5] = z1;
    p[o + 6] = x2; p[o + 7] = y2; p[o + 8] = z2;
    p[o + 9] = x3; p[o + 10] = y3; p[o + 11] = z3;
    const cr = ((hex >> 16) & 255) / 255;
    const cg = ((hex >> 8) & 255) / 255;
    const cb = (hex & 255) / 255;
    for (let v = 0; v < 4; v++) {
      c[o + v * 3] = cr * bright;
      c[o + v * 3 + 1] = cg * bright;
      c[o + v * 3 + 2] = cb * bright;
    }
    emitted += 1;
  };

  const rig = Math.min(1, plan.rigGlow01) * gain;
  if (rig > 0.01) {
    // Rig cards: one vertical card per mast, running across the axis (readable from any bearing).
    for (let k = 0; k < 2; k++) {
      const gx = layout.rigX[k], gz = layout.rigZ[k];
      const tx = -layout.axisZ, tz = layout.axisX;
      emitTinted(
        gx - tx * layout.rigHalfW, 0, gz - tz * layout.rigHalfW,
        gx + tx * layout.rigHalfW, 0, gz + tz * layout.rigHalfW,
        gx + tx * layout.rigHalfW, layout.rigY, gz + tz * layout.rigHalfW,
        gx - tx * layout.rigHalfW, layout.rigY, gz - tz * layout.rigHalfW,
        rig, APRON_FLOOD_RIG_HEX,
      );
    }
  }

  const pool = Math.min(1, plan.poolGlow01) * gain;
  if (pool > 0.01) {
    // Taxi pools: elongated, lying along the axis between berth and outer gate.
    const nx = -layout.axisZ, nz = layout.axisX;
    const emitPool = (cx, cz) => {
      emitTinted(
        cx - layout.axisX * layout.poolHalfLen - nx * layout.poolHalfW, APRON_FLOOD_DECK_Y,
        cz - layout.axisZ * layout.poolHalfLen - nz * layout.poolHalfW,
        cx + layout.axisX * layout.poolHalfLen - nx * layout.poolHalfW, APRON_FLOOD_DECK_Y,
        cz + layout.axisZ * layout.poolHalfLen - nz * layout.poolHalfW,
        cx + layout.axisX * layout.poolHalfLen + nx * layout.poolHalfW, APRON_FLOOD_DECK_Y,
        cz + layout.axisZ * layout.poolHalfLen + nz * layout.poolHalfW,
        cx - layout.axisX * layout.poolHalfLen + nx * layout.poolHalfW, APRON_FLOOD_DECK_Y,
        cz - layout.axisZ * layout.poolHalfLen + nz * layout.poolHalfW,
        pool, APRON_FLOOD_POOL_HEX,
      );
    };
    emitPool(layout.poolAX, layout.poolAZ);
    emitPool(layout.poolBX, layout.poolBZ);
    // Pad diamond over the berth.
    const hw = layout.padHalfW;
    emitTinted(
      layout.padX - hw, APRON_FLOOD_DECK_Y, layout.padZ,
      layout.padX, APRON_FLOOD_DECK_Y, layout.padZ - hw,
      layout.padX + hw, APRON_FLOOD_DECK_Y, layout.padZ,
      layout.padX, APRON_FLOOD_DECK_Y, layout.padZ + hw,
      Math.min(1, pool * 1.15), APRON_FLOOD_POOL_HEX,
    );
  }

  out.indexCount = emitted * 6;
  return out;
}
