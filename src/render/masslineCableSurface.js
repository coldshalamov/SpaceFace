// Massline cable surface — resident geometry for the drawn line, its sheath and its load ferrules.
//
// WHAT THIS OWNS. One shared centreline sampled at a curvature-chosen span count, two ribbon draws
// written from that centreline, and the constructed ferrule batch that replaces the old plain
// additive band cards (VFX_POLISH_PASS_2026-09-18, "Tether band flashes are plain additive cards" —
// the one named open defect in this family).
//
// WHAT THIS DOES NOT OWN. Endpoints, interpolation, frame-local projection, load telemetry,
// accessibility and materials all stay with the live cable owner (`vfx.js::_updateTetherCable`).
// Every position handed in here is already the RENDERED attachment pose — commit 331349884 put both
// anchors at the drawn hull's moment rather than the sim tick, and nothing in this file re-derives
// a pose or reads GameState. There is no clock here either: all travelling phase arrives as a
// caller-supplied, accessibility-gated time, so reduced motion is a zero, not a slower animation.
//
// ALLOCATION. Every buffer is created once and reused. The writers only ever move floats and the
// draw range; they never resize, never allocate and never replace a typed array.
import * as THREE from 'three';
import { MASSLINE_CABLE_SEGMENT_CAPACITY } from './masslinePresentation.js';

/** One source of truth: the planner clamps to the same number this file allocates. */
export { MASSLINE_CABLE_SEGMENT_CAPACITY };
/** Ferrules per line. Fixed on purpose: a count that tracked chord would pop hardware in and out. */
export const MASSLINE_CABLE_COLLAR_COUNT = 10;

/** Ferrule stations along the cable axis, in units of half-length: lip, crown, crown, lip. */
const COLLAR_ROWS = 4;
/** Transverse stations per row: -1 / 0 / +1, so the ribbon shader's cross-section has a real centre. */
const COLLAR_COLS = 3;
const COLLAR_VERTS = COLLAR_ROWS * COLLAR_COLS;
const COLLAR_TRIS = (COLLAR_ROWS - 1) * (COLLAR_COLS - 1) * 2;

/* -------------------------------------------------------------------------- */
/* Centreline                                                                  */
/* -------------------------------------------------------------------------- */

/** Allocate the shared centreline scratch. Call once at init; never from a frame. */
export function createMasslineCenterline(capacity = MASSLINE_CABLE_SEGMENT_CAPACITY) {
  const spans = clampInt(capacity, 1, 4096);
  const stations = spans + 1;
  return {
    capacity: spans,
    segments: 0,
    count: 0,
    x: new Float32Array(stations),
    z: new Float32Array(stations),
    along: new Float32Array(stations),
    arc: new Float32Array(stations),
    length: 0,
    frame: {
      ax: 0, az: 0, dx: 0, dz: 0, px: 0, pz: 1, chord: 0,
      segments: 1,
      slackBow: 0,
      whipAmplitude: 0, whipHarmonic: 3, whipPhase: 0, whipFreq: 0,
      shiverAmplitude: 0, shiverPhase: 0, shiverPhaseFast: 0,
    },
  };
}

/**
 * Sample the loaded curve into the shared centreline.
 *
 * `frame` carries exactly the terms the live cable already computes: the chord basis, the slack
 * bow, the latch/snap whip and the load shiver. The lateral offset formula is unchanged from the
 * accepted line — this only moves it behind one owner so the ribbon draws and the ferrules cannot
 * drift apart, and so the span count can vary without every consumer re-deriving it.
 *
 * Station 0 and station N land EXACTLY on the supplied endpoints: the envelope `sin(pi*t)` is zero
 * at both ends, so no amount of bow, whip or shiver can detach a drawn end from its attachment.
 */
export function writeMasslineCenterline(line, frame) {
  if (!line || !frame) return line;
  const segments = clampInt(frame.segments, 1, line.capacity);
  const ax = finite(frame.ax, 0);
  const az = finite(frame.az, 0);
  const dx = finite(frame.dx, 0);
  const dz = finite(frame.dz, 0);
  const px = finite(frame.px, 0);
  const pz = finite(frame.pz, 0);
  const slackBow = finite(frame.slackBow, 0);
  const whipAmplitude = finite(frame.whipAmplitude, 0);
  const whipHarmonic = finite(frame.whipHarmonic, 3);
  const whipPhase = finite(frame.whipPhase, 0);
  const whipFreq = finite(frame.whipFreq, 0);
  const shiverAmplitude = finite(frame.shiverAmplitude, 0);
  const shiverPhase = finite(frame.shiverPhase, 0);
  const shiverPhaseFast = finite(frame.shiverPhaseFast, 0);

  const xs = line.x;
  const zs = line.z;
  const along = line.along;
  const arc = line.arc;
  let total = 0;
  let previousX = 0;
  let previousZ = 0;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const envelope = Math.sin(Math.PI * t);
    const wave = whipAmplitude
      * Math.sin(Math.PI * whipHarmonic * t - whipPhase * whipFreq) * envelope;
    const shiver = shiverAmplitude * envelope
      * (Math.sin(shiverPhase + t * 21.7) * 0.72 + Math.sin(shiverPhaseFast + t * 47.3) * 0.28);
    const offset = slackBow * envelope + wave + shiver;
    const x = ax + dx * t + px * offset;
    const z = az + dz * t + pz * offset;
    xs[i] = x;
    zs[i] = z;
    along[i] = t;
    if (i > 0) total += Math.hypot(x - previousX, z - previousZ);
    arc[i] = total;
    previousX = x;
    previousZ = z;
  }
  line.segments = segments;
  line.count = segments + 1;
  line.length = total;
  return line;
}

/* -------------------------------------------------------------------------- */
/* Ribbon draws (core filament + coloured sheath)                              */
/* -------------------------------------------------------------------------- */

/**
 * One resident ribbon draw: a two-vertex-wide strip with the Massline shader's `aAlong` / `aSide`.
 *
 * `aSide` is static (-1 / +1 forever). `aAlong` is dynamic because the span count is chosen per
 * frame — a static `i / SEG` would strand the shader's travelling pulse on part of the line the
 * moment the tessellation moved.
 */
export function createMasslineRibbonSurface(capacity = MASSLINE_CABLE_SEGMENT_CAPACITY) {
  const spans = clampInt(capacity, 1, 4096);
  const stations = spans + 1;
  const vertices = stations * 2;
  const positions = new Float32Array(vertices * 3);
  const along = new Float32Array(vertices);
  const side = new Float32Array(vertices);
  const indices = new Uint16Array(spans * 6);
  for (let i = 0; i < stations; i += 1) {
    side[i * 2] = -1;
    side[i * 2 + 1] = 1;
  }
  for (let i = 0; i < spans; i += 1) {
    const a = i * 2;
    const offset = i * 6;
    indices[offset] = a;
    indices[offset + 1] = a + 1;
    indices[offset + 2] = a + 2;
    indices[offset + 3] = a + 1;
    indices[offset + 4] = a + 3;
    indices[offset + 5] = a + 2;
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const alongAttribute = new THREE.BufferAttribute(along, 1);
  const sideAttribute = new THREE.BufferAttribute(side, 1);
  positionAttribute.usage = THREE.DynamicDrawUsage;
  alongAttribute.usage = THREE.DynamicDrawUsage;
  sideAttribute.usage = THREE.StaticDrawUsage;
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aAlong', alongAttribute);
  geometry.setAttribute('aSide', sideAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  return {
    geometry,
    positions,
    along,
    side,
    indices,
    capacity: spans,
    segments: 0,
    vertexCount: 0,
    indexCount: 0,
  };
}

/** Sweep a constant-half-width strip along the shared centreline and commit its draw range. */
export function writeMasslineRibbonSurface(surface, line, halfWidth, y) {
  if (!surface || !line) return surface;
  const segments = Math.min(clampInt(line.segments, 0, surface.capacity), surface.capacity);
  if (segments < 1) {
    surface.segments = 0;
    surface.vertexCount = 0;
    surface.indexCount = 0;
    surface.geometry.setDrawRange(0, 0);
    return surface;
  }
  const w = Math.max(0, finite(halfWidth, 0));
  const height = finite(y, 0);
  const positions = surface.positions;
  const along = surface.along;
  const xs = line.x;
  const zs = line.z;
  // One shared normal per station, taken from the local tangent, so the cross-section cannot roll
  // between neighbouring stations. A per-station normal derived independently would twist the
  // ribbon wherever the curve bends hardest — exactly where the line is most worth reading.
  for (let i = 0; i <= segments; i += 1) {
    const previous = i > 0 ? i - 1 : 0;
    const next = i < segments ? i + 1 : segments;
    let tx = xs[next] - xs[previous];
    let tz = zs[next] - zs[previous];
    const tangent = Math.hypot(tx, tz);
    if (tangent > 1e-6) { tx /= tangent; tz /= tangent; } else { tx = 1; tz = 0; }
    const nx = -tz;
    const nz = tx;
    const x = xs[i];
    const z = zs[i];
    const offset = i * 6;
    positions[offset] = x + nx * w;
    positions[offset + 1] = height;
    positions[offset + 2] = z + nz * w;
    positions[offset + 3] = x - nx * w;
    positions[offset + 4] = height;
    positions[offset + 5] = z - nz * w;
    const t = line.along[i];
    along[i * 2] = t;
    along[i * 2 + 1] = t;
  }
  surface.segments = segments;
  surface.vertexCount = (segments + 1) * 2;
  surface.indexCount = segments * 6;
  surface.geometry.setDrawRange(0, surface.indexCount);
  surface.geometry.attributes.position.needsUpdate = true;
  surface.geometry.attributes.aAlong.needsUpdate = true;
  return surface;
}

/* -------------------------------------------------------------------------- */
/* Load ferrules (the constructed replacement for the flat band cards)         */
/* -------------------------------------------------------------------------- */

/**
 * The ferrule batch: `count` machined rings threaded on the cable.
 *
 * Each ring is a swept four-station profile — lip, crown, crown, lip — three vertices wide, so the
 * Massline shader's own cross-section term gives it a lit centre and darker flanks instead of the
 * flat additive rectangle it replaces. `aAlong` differs per row, so the shader's travelling load
 * pulse sweeps THROUGH a ferrule rather than flashing it whole: the hardware belongs to the line.
 */
export function createMasslineCollarSurface(count = MASSLINE_CABLE_COLLAR_COUNT) {
  const collars = clampInt(count, 1, 2048);
  const vertices = collars * COLLAR_VERTS;
  const positions = new Float32Array(vertices * 3);
  const along = new Float32Array(vertices);
  const side = new Float32Array(vertices);
  const indices = new Uint16Array(collars * COLLAR_TRIS * 3);
  let cursor = 0;
  for (let collar = 0; collar < collars; collar += 1) {
    const base = collar * COLLAR_VERTS;
    for (let row = 0; row < COLLAR_ROWS; row += 1) {
      for (let col = 0; col < COLLAR_COLS; col += 1) {
        side[base + row * COLLAR_COLS + col] = col - 1;
      }
    }
    for (let row = 0; row < COLLAR_ROWS - 1; row += 1) {
      for (let col = 0; col < COLLAR_COLS - 1; col += 1) {
        const a = base + row * COLLAR_COLS + col;
        const b = a + 1;
        const c = a + COLLAR_COLS;
        const d = c + 1;
        indices[cursor] = a;
        indices[cursor + 1] = c;
        indices[cursor + 2] = b;
        indices[cursor + 3] = b;
        indices[cursor + 4] = c;
        indices[cursor + 5] = d;
        cursor += 6;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const alongAttribute = new THREE.BufferAttribute(along, 1);
  const sideAttribute = new THREE.BufferAttribute(side, 1);
  positionAttribute.usage = THREE.DynamicDrawUsage;
  alongAttribute.usage = THREE.DynamicDrawUsage;
  sideAttribute.usage = THREE.StaticDrawUsage;
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aAlong', alongAttribute);
  geometry.setAttribute('aSide', sideAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  return {
    geometry,
    positions,
    along,
    side,
    indices,
    count: collars,
    vertexCount: 0,
    indexCount: 0,
  };
}

/**
 * Thread the ferrules onto the live centreline.
 *
 * Placement is by ARC LENGTH, not by chord parameter. On a deeply bowed line chord-uniform spacing
 * crowds the hardware toward the ends; arc-uniform spacing keeps it evenly spaced along the rope,
 * so as the bow flattens under load you watch the rings slide apart. That is a tension read made
 * of motion and position, with no colour in it at all.
 */
export function writeMasslineCollarSurface(surface, line, profile, y) {
  if (!surface || !line || !profile) return surface;
  const collars = surface.count;
  const segments = clampInt(line.segments, 0, line.capacity);
  const total = finite(line.length, 0);
  if (segments < 1 || !(total > 1e-6)) {
    surface.vertexCount = 0;
    surface.indexCount = 0;
    surface.geometry.setDrawRange(0, 0);
    return surface;
  }
  const halfLength = Math.max(0, finite(profile.collarHalfLength, 0));
  const crownFraction = clamp01(finite(profile.collarCrownFraction, 0.5));
  const crownHalfWidth = Math.max(0, finite(profile.collarCrownHalfWidth, 0));
  const lipHalfWidth = Math.max(0, finite(profile.collarLipHalfWidth, 0));
  const height = finite(y, 0);
  const positions = surface.positions;
  const along = surface.along;
  const xs = line.x;
  const zs = line.z;
  const arc = line.arc;
  const lineAlong = line.along;
  // Row offsets along the cable axis, in units of half-length, and the width each row carries.
  const rowOffset0 = -1;
  const rowOffset1 = -crownFraction;
  const rowOffset2 = crownFraction;
  const rowOffset3 = 1;

  let station = 0;
  for (let collar = 0; collar < collars; collar += 1) {
    const target = total * ((collar + 1) / (collars + 1));
    while (station < segments - 1 && arc[station + 1] < target) station += 1;
    const span = arc[station + 1] - arc[station];
    const blend = span > 1e-6 ? clamp01((target - arc[station]) / span) : 0;
    const x = xs[station] + (xs[station + 1] - xs[station]) * blend;
    const z = zs[station] + (zs[station + 1] - zs[station]) * blend;
    const t = lineAlong[station] + (lineAlong[station + 1] - lineAlong[station]) * blend;
    let tx = xs[station + 1] - xs[station];
    let tz = zs[station + 1] - zs[station];
    const tangent = Math.hypot(tx, tz);
    if (tangent > 1e-6) { tx /= tangent; tz /= tangent; } else { tx = 1; tz = 0; }
    const nx = -tz;
    const nz = tx;
    // The ferrule's own extent, expressed in the line's along-parameter, so the travelling pulse
    // enters at its leading lip and leaves at its trailing one.
    const alongSpan = total > 1e-6 ? halfLength / total : 0;
    const base = collar * COLLAR_VERTS;
    writeCollarRow(positions, along, base, 0, x, z, tx, tz, nx, nz,
      rowOffset0 * halfLength, lipHalfWidth, height, t + rowOffset0 * alongSpan);
    writeCollarRow(positions, along, base, 1, x, z, tx, tz, nx, nz,
      rowOffset1 * halfLength, crownHalfWidth, height, t + rowOffset1 * alongSpan);
    writeCollarRow(positions, along, base, 2, x, z, tx, tz, nx, nz,
      rowOffset2 * halfLength, crownHalfWidth, height, t + rowOffset2 * alongSpan);
    writeCollarRow(positions, along, base, 3, x, z, tx, tz, nx, nz,
      rowOffset3 * halfLength, lipHalfWidth, height, t + rowOffset3 * alongSpan);
  }
  surface.vertexCount = collars * COLLAR_VERTS;
  surface.indexCount = collars * COLLAR_TRIS * 3;
  surface.geometry.setDrawRange(0, surface.indexCount);
  surface.geometry.attributes.position.needsUpdate = true;
  surface.geometry.attributes.aAlong.needsUpdate = true;
  return surface;
}

function writeCollarRow(positions, along, base, row, x, z, tx, tz, nx, nz, axial, halfWidth, y, t) {
  const cx = x + tx * axial;
  const cz = z + tz * axial;
  const index = base + row * COLLAR_COLS;
  for (let col = 0; col < COLLAR_COLS; col += 1) {
    const lateral = (col - 1) * halfWidth;
    const offset = (index + col) * 3;
    positions[offset] = cx + nx * lateral;
    positions[offset + 1] = y;
    positions[offset + 2] = cz + nz * lateral;
    along[index + col] = t;
  }
}

/** Free every GPU buffer this module allocated. */
export function disposeMasslineSurface(surface) {
  if (surface && surface.geometry) surface.geometry.dispose();
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
