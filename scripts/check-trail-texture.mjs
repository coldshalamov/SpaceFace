// Unit tests for the shipped procedural trail texture sampler (src/render/trailTexture.js).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  crossSectionProfile,
  directionalWarp,
  directionalStreakBlur,
  fluidBreakup,
  sampleTrailTexture,
  sampleLuminousTrailLayers,
  buildTrailTexturePixels,
  pixelsToUint8,
  compareFlatVsStreakSamples,
} from '../src/render/trailTexture.js';
import { createRibbonTrailMaterial } from '../src/render/engineTrailSurfaces.js';

const SCRATCH = process.env.TRAIL_SCRATCH
  || 'C:/Users/93rob/AppData/Local/Temp/grok-goal-82948ebfffc3/implementer';

const MID_U = 0.5;
const CENTER_V = 0;
const EDGE_V = 0.82;
const TIME = 0.42;

const log = [];

// Independent scalar translation of the shipped GLSL. These literals intentionally do not import
// TRAIL_NOISE_SPEC or call any CPU sampler: if either side drifts, representative numbers diverge.
const refFract = (value) => value - Math.floor(value);
const refClamp01 = (value) => Math.max(0, Math.min(1, value));
const refMix = (a, b, t) => a + (b - a) * t;
function directGlslHash21(x, y) {
  let px = refFract(x * 123.34);
  let py = refFract(y * 456.21);
  const dot = px * (px + 45.32) + py * (py + 45.32);
  px += dot;
  py += dot;
  return refFract(px * py);
}
function directGlslValueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = refFract(x);
  let fy = refFract(y);
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = directGlslHash21(ix, iy);
  const b = directGlslHash21(ix + 1, iy);
  const c = directGlslHash21(ix, iy + 1);
  const d = directGlslHash21(ix + 1, iy + 1);
  return refMix(refMix(a, b, fx), refMix(c, d, fx), fy);
}
function directGlslTrailSample(u, v, time) {
  const warpA = directGlslValueNoise(u * 5.5 + time * 0.18, 0.37) - 0.5;
  const warpB = directGlslValueNoise(u * 11 - time * 0.09, v * 2.2 + 1.1) - 0.5;
  const edgeFade = 1 - Math.min(1, Math.abs(v) * 0.72);
  const warpedV = v + warpA * 0.30 * edgeFade + warpB * 0.14;
  const absV = Math.abs(warpedV);
  const cross = Math.min(1, Math.exp(-absV * absV * 10.5) + Math.exp(-absV * 3.4) * 0.42);
  let streakSum = 0;
  let weightSum = 0;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const su = u - 0.14 * t;
    const bend = Math.sin(su * 14 + time * 1.6) * 0.11;
    const noise = directGlslValueNoise(su * 9 + bend, warpedV * 3.1 + time * 0.22);
    const weight = 1 - t * 0.38;
    streakSum += noise * weight;
    weightSum += weight;
  }
  const streak = streakSum / Math.max(weightSum, 0.0001);
  const broad = directGlslValueNoise(u * 7.2 - time * 0.34, warpedV * 1.8 + 4.7);
  const thread = directGlslValueNoise(u * 17 + time * 0.16, warpedV * 4.4 + 0.8);
  const breakup = refClamp01(broad * 0.62 + thread * 0.38);
  const taper = Math.pow(Math.max(0, 1 - u * 0.12), 0.55);
  return refClamp01(cross * (0.30 + streak * 0.82) * (0.64 + breakup * 0.58) * taper);
}
function directGlslLuminousLayers(u, side, pathT, time, opacity, radianceScale) {
  const liquid = directGlslTrailSample(u, side, time);
  const filament = Math.exp(-side * side * 18);
  const sheath = Math.exp(-side * side * 5.5);
  const t = refClamp01(pathT);
  const tailProgress = refClamp01((t - 0.62) / (1 - 0.62));
  const tailEnvelope = 1 - tailProgress * tailProgress * (3 - 2 * tailProgress);
  const headProgress = refClamp01(t / 0.14);
  const headBoost = 1 - headProgress * headProgress * (3 - 2 * headProgress);
  const fluidNoise = directGlslValueNoise(u * 9, time * 0.22);
  const threadNoise = directGlslValueNoise(u * 17 - time * 0.31, side * 2.4 + 1.7);
  const brokenSheath = liquid * sheath * (0.42 + 0.58 * fluidNoise)
    * (0.72 + 0.28 * threadNoise);
  return {
    liquid,
    filament,
    sheath,
    tailEnvelope,
    headBoost,
    sheathNoise: fluidNoise,
    brokenSheath,
    alpha: Math.min(1, opacity * tailEnvelope
      * (filament * 0.92 + brokenSheath * 0.62 + sheath * 0.18)
      * (0.88 + headBoost * 0.22)),
    radiance: radianceScale * (0.78 + liquid * 0.85 + filament * 0.42 + headBoost * 0.18),
  };
}

// Numerical CPU↔GLSL parity. The pre-repair seeded lookup implementation differs materially at
// every one of these samples, so this is a causal regression rather than a self-derived identity.
{
  const samples = [
    { u: 0.031, side: -0.63, pathT: 0.08, time: 0, opacity: 0.21, radiance: 1.2 },
    { u: 0.37, side: 0, pathT: 0.12, time: TIME, opacity: 0.63, radiance: 1.72 },
    { u: 0.71, side: 0.28, pathT: 0.64, time: 1.7, opacity: 0.86, radiance: 1.94 },
    { u: 0.93, side: 0.82, pathT: 0.97, time: 4.25, opacity: 0.48, radiance: 1.45 },
  ];
  let maxDelta = 0;
  for (const sample of samples) {
    const cpu = sampleLuminousTrailLayers(
      sample.u,
      sample.side,
      sample.pathT,
      sample.time,
      { opacity: sample.opacity, radiance: sample.radiance },
    );
    const ref = directGlslLuminousLayers(
      sample.u,
      sample.side,
      sample.pathT,
      sample.time,
      sample.opacity,
      sample.radiance,
    );
    for (const key of ['liquid', 'filament', 'sheath', 'tailEnvelope', 'headBoost', 'sheathNoise',
      'brokenSheath', 'alpha', 'radiance']) {
      const delta = Math.abs(cpu[key] - ref[key]);
      maxDelta = Math.max(maxDelta, delta);
      assert.ok(delta < 1e-10,
        `CPU/GLSL ${key} drift at u=${sample.u}, side=${sample.side}, t=${sample.time}: ${delta}`);
    }
  }
  log.push(`cpu-glsl-parity: samples=${samples.length} maxDelta=${maxDelta.toExponential(3)}`);
}

// Along-axis variance: fixed side offset, varying u must produce non-uniform intensity.
{
  const samples = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    samples.push(sampleTrailTexture(u, CENTER_V, TIME));
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const variance = max - min;
  log.push(`along-axis: min=${min.toFixed(4)} max=${max.toFixed(4)} variance=${variance.toFixed(4)}`);
  assert(variance > 0.05, `along-axis variance should be > 0.05; got ${variance}`);
}

// Luminous ribbon layers: a narrow white-hot filament sits inside a broken colored sheath, and the
// physical history coordinate fades the oldest tail without wrapping it back to full opacity.
{
  const liveUniforms = { opacity: 0.63, radiance: 1.72 };
  const core = sampleLuminousTrailLayers(0.37, 0, 0.12, TIME, liveUniforms);
  const sheath = sampleLuminousTrailLayers(0.37, 0.72, 0.12, TIME, liveUniforms);
  const oldTail = sampleLuminousTrailLayers(0.37, 0, 1, TIME, liveUniforms);
  const animatedSheath = sampleLuminousTrailLayers(0.37, 0.25, 0.12, 1.7, liveUniforms);
  const breakup0 = fluidBreakup(0.37, 0.25, 0);
  const breakup1 = fluidBreakup(0.37, 0.25, 1.7);
  log.push(`fluid-layers: coreAlpha=${core.alpha.toFixed(4)} sheathAlpha=${sheath.alpha.toFixed(4)} ` +
    `coreRadiance=${core.radiance.toFixed(4)} brokenSheath=${core.brokenSheath.toFixed(4)} ` +
    `tailAlpha=${oldTail.alpha.toFixed(4)} ` +
    `breakupDelta=${Math.abs(breakup1 - breakup0).toFixed(4)}`);
  const expectedAlpha = Math.min(1, liveUniforms.opacity * core.tailEnvelope
    * (core.filament * 0.92 + core.brokenSheath * 0.62 + core.sheath * 0.18)
    * (0.88 + core.headBoost * 0.22));
  const expectedRadiance = liveUniforms.radiance
    * (0.78 + core.liquid * 0.85 + core.filament * 0.42 + core.headBoost * 0.18);
  assert.ok(Math.abs(core.alpha - expectedAlpha) < 1e-12,
    'CPU evidence must apply the shader broken-sheath and uOpacity formula exactly');
  assert.ok(Math.abs(core.radiance - expectedRadiance) < 1e-12,
    'CPU evidence must apply the shader uRadiance formula exactly');
  assert(core.alpha > sheath.alpha, 'narrow filament must read brighter than the colored sheath');
  assert(core.radiance > 1, 'filament must carry HDR-capable radiance');
  assert(oldTail.alpha < 1e-8, 'oldest history point must fade out rather than wrap into a solid cap');
  assert(Math.abs(breakup1 - breakup0) > 0.01, 'fluid sheath breakup must animate over time');
  assert(Math.abs(animatedSheath.brokenSheath - sheath.brokenSheath) > 0.001,
    'the shader-equivalent secondary sheath breakup must animate over time');
}

// Cross-section falloff: center brighter than edge at mid-length.
{
  const center = sampleTrailTexture(MID_U, CENTER_V, TIME);
  const edge = sampleTrailTexture(MID_U, EDGE_V, TIME);
  log.push(`cross-section: center=${center.toFixed(4)} edge=${edge.toFixed(4)} ratio=${(center / edge).toFixed(2)}`);
  assert(center > edge, `center (${center}) should exceed edge (${edge}) at mid-length`);
  assert(crossSectionProfile(0) > crossSectionProfile(EDGE_V), 'crossSectionProfile should fall off toward edges');
}

// Time animation changes samples (directional warp + blur are time-driven).
{
  const t0 = sampleTrailTexture(0.35, 0.1, 0);
  const t1 = sampleTrailTexture(0.35, 0.1, 1.7);
  log.push(`time-warp: t=0 ${t0.toFixed(4)} t=1.7 ${t1.toFixed(4)} delta=${Math.abs(t1 - t0).toFixed(4)}`);
  assert(Math.abs(t1 - t0) > 0.01, 'animated warp should change intensity over time');
}

// Headless texture bytes must be non-zero (not empty DataTexture).
{
  const pixels = buildTrailTexturePixels(256, 64, TIME);
  const bytes = pixelsToUint8(pixels);
  let nonZero = 0;
  let centerByte = bytes[32 * 256 + 128];
  for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0) nonZero++;
  log.push(`texture-bytes: nonZero=${nonZero}/${bytes.length} centerPixel=${centerByte}`);
  assert(nonZero > bytes.length * 0.4, `texture should be mostly non-zero; got ${nonZero}`);
  assert(centerByte > 40, `center pixel should be bright; got ${centerByte}`);
}

// Flat vs streak visual distinction for acceptance criterion 2.
{
  const cmp = compareFlatVsStreakSamples(TIME);
  log.push(`flat-vs-streak: ${JSON.stringify(cmp)}`);
  assert(cmp.alongVariance > 0.05, 'along variance evidence');
  assert(cmp.visualGain > 1.05, `streak mod should beat flat radial; gain=${cmp.visualGain}`);
  assert(cmp.centerIntensity > cmp.edgeIntensity, 'center/edge falloff evidence');
}

// Ribbon shader must sample procedurally (not MeshBasicMaterial / static color only).
const ribbonFrag = createRibbonTrailMaterial().fragmentShader;
assert(ribbonFrag.includes('trailSampleProcedural'), 'ribbon frag must use procedural trail sampler');
assert(ribbonFrag.includes('uTrailTime'), 'ribbon frag must animate with uTrailTime');
assert(ribbonFrag.includes('tailEnvelope'), 'ribbon frag must taper by physical history coordinate');
assert(ribbonFrag.includes('brokenSheath'), 'ribbon frag must layer a broken sheath around the filament');
assert(ribbonFrag.includes('uRadiance'), 'ribbon frag must expose bounded HDR radiance separately from alpha');
assert(ribbonFrag.includes('filament * 0.92 + brokenSheath * 0.62 + sheath * 0.18'),
  'ribbon frag must match the CPU alpha-layer formula');
assert(ribbonFrag.includes('uRadiance * (0.78 + liquid * 0.85 + filament * 0.42 + headBoost * 0.18)'),
  'ribbon frag must match the CPU radiance formula');

writeFileSync(`${SCRATCH}/trail-texture-metrics.log`, `${log.join('\n')}\nTrail texture sampler checks OK\n`);
console.log(log.join('\n'));
console.log('Trail texture sampler checks OK');
