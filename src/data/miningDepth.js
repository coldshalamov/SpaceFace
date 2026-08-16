// Plan 42 mining-depth kernels. Pure deterministic timing/trajectory and save normalization only;
// the world owner materializes comet bodies and mining owns extraction/cargo consequences.
import { hash32 } from '../core/rng.js';

export const COMET_ICE = Object.freeze({
  sectorId: 'sector_ceres_belt',
  fieldIdPrefix: 'event_comet_ice',
  dayS: 600,
  activeS: 1200,       // a two-day physical pass
  cycleS: 3600,        // returns every six days rather than becoming one-shot content
  radius: 22,
  mass: 4800,
  oreHP: 720,
  yieldU: 54,
  speed: 3.8,          // slow enough to match beside it with the starter ship
  trackHalfLength: 2200,
});

export const CRYSTAL_RESONANCE = Object.freeze({
  periodS: 1.5,
  perfectWindowS: 0.11,
  goodWindowS: 0.24,
  perfectYieldMult: 1.65,
  goodYieldMult: 1.2,
  missYieldMult: 0.18,
  dustCommodityId: 'cmdty_silicate',
  guideHoldS: 5,
});

export const COMET_ICE_SAVE_VERSION = 1;

export function cometPassAt(seed, simTime) {
  const now = Math.max(0, Number(simTime) || 0);
  const cycle = Math.floor(now / COMET_ICE.cycleS);
  const phaseS = now - cycle * COMET_ICE.cycleS;
  const passId = `comet-ice-${cycle}`;
  const angleJitter = ((hash32(seed >>> 0, passId, 'track') / 0x100000000) - 0.5) * 0.7;
  const direction = normalize2(Math.cos(angleJitter), Math.sin(angleJitter));
  const normal = { x: -direction.z, z: direction.x };
  const lateral = ((hash32(seed >>> 0, passId, 'lateral') / 0x100000000) - 0.5) * 1200;
  const startLocal = {
    x: -direction.x * COMET_ICE.trackHalfLength + normal.x * lateral,
    z: -direction.z * COMET_ICE.trackHalfLength + normal.z * lateral,
  };
  return Object.freeze({
    passId,
    cycle,
    sectorId: COMET_ICE.sectorId,
    fieldId: `${COMET_ICE.fieldIdPrefix}-${cycle}`,
    startsAtS: cycle * COMET_ICE.cycleS,
    endsAtS: cycle * COMET_ICE.cycleS + COMET_ICE.activeS,
    phaseS,
    active: phaseS < COMET_ICE.activeS,
    startLocal,
    velocity: { x: direction.x * COMET_ICE.speed, z: direction.z * COMET_ICE.speed },
  });
}

export function cometLocalPosition(pass, simTime) {
  const elapsed = Math.max(0, (Number(simTime) || 0) - (Number(pass && pass.startsAtS) || 0));
  return {
    x: Number(pass && pass.startLocal && pass.startLocal.x) + Number(pass && pass.velocity && pass.velocity.x) * elapsed,
    z: Number(pass && pass.startLocal && pass.startLocal.z) + Number(pass && pass.velocity && pass.velocity.z) * elapsed,
  };
}

export function createCometIceState() {
  return { version: COMET_ICE_SAVE_VERSION, byPassId: {}, announcedPassId: null };
}

export function normalizeCometIceState(raw, currentCycle = 0) {
  const out = createCometIceState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.announcedPassId === 'string' && raw.announcedPassId) {
    out.announcedPassId = raw.announcedPassId;
  }
  const rows = raw.byPassId && typeof raw.byPassId === 'object' && !Array.isArray(raw.byPassId)
    ? raw.byPassId
    : {};
  for (const [passId, value] of Object.entries(rows)) {
    const match = /^comet-ice-(\d+)$/.exec(passId);
    if (!match || Number(match[1]) < Math.max(0, currentCycle - 1)) continue;
    const rec = value && typeof value === 'object' ? value : {};
    out.byPassId[passId] = {
      oreHP: clampFinite(rec.oreHP, 0, COMET_ICE.oreHP, COMET_ICE.oreHP),
      oreCarry: clampFinite(rec.oreCarry, 0, COMET_ICE.yieldU, 0),
      dustCarry: clampFinite(rec.dustCarry, 0, COMET_ICE.yieldU, 0),
      pctEjected: clampFinite(rec.pctEjected, 0, 1, 0),
      depleted: rec.depleted === true,
      pos: finitePoint(rec.pos),
      vel: finitePoint(rec.vel),
    };
  }
  return out;
}

export function resonanceTiming(seed, asteroidId, simTime) {
  const period = CRYSTAL_RESONANCE.periodS;
  const phaseOffset = (hash32(seed >>> 0, String(asteroidId), 'crystal-resonance') / 0x100000000) * period;
  const relative = (Number(simTime) || 0) - phaseOffset;
  const cycle = Math.floor(relative / period);
  const into = ((relative % period) + period) % period;
  const distanceS = Math.min(into, period - into);
  const grade = distanceS <= CRYSTAL_RESONANCE.perfectWindowS
    ? 'perfect'
    : distanceS <= CRYSTAL_RESONANCE.goodWindowS ? 'good' : 'miss';
  return {
    cycleId: `${asteroidId}:${cycle}`,
    cycle,
    phaseOffset,
    distanceS,
    grade,
    yieldMult: grade === 'perfect'
      ? CRYSTAL_RESONANCE.perfectYieldMult
      : grade === 'good' ? CRYSTAL_RESONANCE.goodYieldMult : CRYSTAL_RESONANCE.missYieldMult,
  };
}

function normalize2(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function clampFinite(value, lo, hi, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}
