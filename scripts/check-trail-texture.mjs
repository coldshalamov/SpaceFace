// Unit tests for the shipped procedural trail texture sampler (src/render/trailTexture.js).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  crossSectionProfile,
  directionalWarp,
  directionalStreakBlur,
  sampleTrailTexture,
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

writeFileSync(`${SCRATCH}/trail-texture-metrics.log`, `${log.join('\n')}\nTrail texture sampler checks OK\n`);
console.log(log.join('\n'));
console.log('Trail texture sampler checks OK');