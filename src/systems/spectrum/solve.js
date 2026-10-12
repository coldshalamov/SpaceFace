// Two solvers share one search prior.
//
// Position-only: every accepted bearing is a ray through one stationary point.
// Three rays with a real baseline close it. A moving source does not concur, so
// this area stays honest for buoys and lies about couriers.
//
// Kinematic: state [px, pz, vx, vz] at the first sample, time in seconds.
// Four bearings determine a straight track. Fewer than four leave velocity free,
// so those stays on the stationary solver instead of inventing a speed.
// The velocity prior is only a tie-break when a still point and a fast point
// both sit on the same rays.

import {
  DRIFT_SPEED_WU_S,
  MIN_AREA_WU2,
  SIGMA_WU,
  VELOCITY_PRIOR_WU_S,
} from '../../data/spectrum/constants.js';

function solvePosition(samples, search) {
  const radius = Math.max(80, Number(search && search.radius) || 800);
  const prior = 1 / (radius * radius);
  let a = prior;
  let b = 0;
  let c = prior;
  let bx = prior * (search.x || 0);
  let bz = prior * (search.z || 0);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const theta = (Number(sample.bearingDeg) || 0) * Math.PI / 180;
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    const sigma = Math.max(12, Number(sample.sigmaWu) || SIGMA_WU);
    const w = 1 / (sigma * sigma);
    a += w * cs * cs;
    b += w * cs * sn;
    c += w * sn * sn;
    const rhs = cs * sample.origin.x + sn * sample.origin.z;
    bx += w * cs * rhs;
    bz += w * sn * rhs;
  }
  const det = a * c - b * b;
  if (!(det > 1e-18)) return null;
  const x = (c * bx - b * bz) / det;
  const z = (a * bz - b * bx) / det;
  const area = Math.max(MIN_AREA_WU2, Math.PI / Math.sqrt(det));
  return {
    position: { x, z },
    velocity: { x: 0, z: 0 },
    speed: 0,
    area,
    t: samples[samples.length - 1].t,
  };
}

function accumulate(ata, atb, row, rhs, weight) {
  for (let i = 0; i < 4; i++) {
    atb[i] += weight * row[i] * rhs;
    const base = i * 4;
    for (let j = 0; j < 4; j++) ata[base + j] += weight * row[i] * row[j];
  }
}

function solve4(ata, atb) {
  const m = [0, 1, 2, 3].map((row) => [ata[row * 4], ata[row * 4 + 1], ata[row * 4 + 2], ata[row * 4 + 3], atb[row]]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    let best = Math.abs(m[col][col]);
    for (let row = col + 1; row < 4; row++) {
      const value = Math.abs(m[row][col]);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (!(best > 1e-14)) return null;
    if (pivot !== col) {
      const swap = m[col];
      m[col] = m[pivot];
      m[pivot] = swap;
    }
    const div = m[col][col];
    for (let c = col; c < 5; c++) m[col][c] /= div;
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (!factor) continue;
      for (let c = col; c < 5; c++) m[row][c] -= factor * m[col][c];
    }
  }
  return [m[0][4], m[1][4], m[2][4], m[3][4]];
}

function solveKinematic(samples, search) {
  const ata = new Array(16).fill(0);
  const atb = [0, 0, 0, 0];
  const radius = Math.max(80, Number(search && search.radius) || 800);
  const positionWeight = 1 / (radius * radius);
  const velocityWeight = 1 / (VELOCITY_PRIOR_WU_S * VELOCITY_PRIOR_WU_S);
  accumulate(ata, atb, [1, 0, 0, 0], search.x || 0, positionWeight);
  accumulate(ata, atb, [0, 1, 0, 0], search.z || 0, positionWeight);
  accumulate(ata, atb, [0, 0, 1, 0], 0, velocityWeight);
  accumulate(ata, atb, [0, 0, 0, 1], 0, velocityWeight);
  const tRef = samples[0].t;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const theta = (Number(sample.bearingDeg) || 0) * Math.PI / 180;
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    const dt = sample.t - tRef;
    const sigma = Math.max(12, Number(sample.sigmaWu) || SIGMA_WU);
    accumulate(
      ata,
      atb,
      [cs, sn, cs * dt, sn * dt],
      cs * sample.origin.x + sn * sample.origin.z,
      1 / (sigma * sigma),
    );
  }
  const solved = solve4(ata, atb);
  if (!solved) return null;
  const last = samples[samples.length - 1];
  const dtLast = last.t - tRef;
  return {
    position: { x: solved[0] + solved[2] * dtLast, z: solved[1] + solved[3] * dtLast },
    velocity: { x: solved[2], z: solved[3] },
    speed: Math.hypot(solved[2], solved[3]),
    area: null,
    t: last.t,
  };
}

function kinematicArea(samples, search) {
  // Rebuild the information and invert it. The point estimate above is the
  // reveal; this ellipse is only the uncertainty the HUD may draw.
  const ata = new Array(16).fill(0);
  const atb = [0, 0, 0, 0];
  const radius = Math.max(80, Number(search && search.radius) || 800);
  const positionWeight = 1 / (radius * radius);
  const velocityWeight = 1 / (VELOCITY_PRIOR_WU_S * VELOCITY_PRIOR_WU_S);
  accumulate(ata, atb, [1, 0, 0, 0], search.x || 0, positionWeight);
  accumulate(ata, atb, [0, 1, 0, 0], search.z || 0, positionWeight);
  accumulate(ata, atb, [0, 0, 1, 0], 0, velocityWeight);
  accumulate(ata, atb, [0, 0, 0, 1], 0, velocityWeight);
  const tRef = samples[0].t;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const theta = (Number(sample.bearingDeg) || 0) * Math.PI / 180;
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    const dt = sample.t - tRef;
    const sigma = Math.max(12, Number(sample.sigmaWu) || SIGMA_WU);
    accumulate(ata, atb, [cs, sn, cs * dt, sn * dt], cs * sample.origin.x + sn * sample.origin.z, 1 / (sigma * sigma));
  }
  const m = [0, 1, 2, 3].map((row) => [
    ata[row * 4], ata[row * 4 + 1], ata[row * 4 + 2], ata[row * 4 + 3],
    row === 0 ? 1 : 0, row === 1 ? 1 : 0, row === 2 ? 1 : 0, row === 3 ? 1 : 0,
  ]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    let best = Math.abs(m[col][col]);
    for (let row = col + 1; row < 4; row++) {
      const value = Math.abs(m[row][col]);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (!(best > 1e-14)) return MIN_AREA_WU2;
    if (pivot !== col) {
      const swap = m[col];
      m[col] = m[pivot];
      m[pivot] = swap;
    }
    const div = m[col][col];
    for (let c = col; c < 8; c++) m[col][c] /= div;
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (!factor) continue;
      for (let c = col; c < 8; c++) m[row][c] -= factor * m[col][c];
    }
  }
  const inv = (row, col) => m[row][4 + col];
  const dt = samples[samples.length - 1].t - tRef;
  const varX = inv(0, 0) + 2 * dt * inv(0, 2) + dt * dt * inv(2, 2);
  const varZ = inv(1, 1) + 2 * dt * inv(1, 3) + dt * dt * inv(3, 3);
  const cov = inv(0, 1) + dt * (inv(0, 3) + inv(1, 2)) + dt * dt * inv(2, 3);
  const det = Math.max(0, varX * varZ - cov * cov);
  return Math.max(MIN_AREA_WU2, Math.PI * Math.sqrt(det));
}

export function solveTrack(samples, search) {
  if (!samples || !samples.length) return null;
  const still = solvePosition(samples, search);
  if (!still) return null;
  if (samples.length < 4) return still;
  const moving = solveKinematic(samples, search);
  if (!moving || moving.speed < DRIFT_SPEED_WU_S) return still;
  moving.area = kinematicArea(samples, search);
  return moving;
}
