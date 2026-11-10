#!/usr/bin/env node
// Quantify matched raw-PNG versus box-filtered KTX2 captures at all Wasp LOD cameras.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/evidence');
const comparisons = [];
for (const lod of [0, 1, 2]) {
  const rawReport = JSON.parse(readFileSync(resolve(evidence, `final-raw-lod${lod}/capture-report.json`), 'utf8'));
  const ktxReport = JSON.parse(readFileSync(resolve(evidence, `final-ktx2-lod${lod}/capture-report.json`), 'utf8'));
  const ktxByName = new Map(ktxReport.captures.map((entry) => [entry.name, entry]));
  for (const rawEntry of rawReport.captures) {
    const ktxEntry = ktxByName.get(rawEntry.name);
    if (!ktxEntry) throw new Error(`LOD${lod}: missing KTX2 match for ${rawEntry.name}`);
    comparisons.push(comparePair(lod, rawEntry.name, rawEntry.path, ktxEntry.path));
  }
}
// High-frequency wireframe/stencil edges are the worst UASTC case; 0.008 keeps the limit below one
// percent normalized RGB error while the mean-luminance guard catches the distance-mip regression.
const thresholds = {
  normalizedRgbRmseMax: 0.008,
  amplifiedNormalGain: 8,
  amplifiedNormalRenderedRgbRmseMax: 0.0083,
  amplifiedNormalSourceEquivalentRmseMax: 0.00105,
  meanRgbRatioMin: 0.97,
  meanRgbRatioMax: 1.03,
};
for (const entry of comparisons) {
  entry.amplifiedNormalDiagnostic = entry.name === 'normal-proof' || entry.name.startsWith('normal-');
  entry.sourceEquivalentNormalizedRgbRmse = entry.amplifiedNormalDiagnostic
    ? entry.normalizedRgbRmse / thresholds.amplifiedNormalGain
    : entry.normalizedRgbRmse;
  const rgbPass = entry.amplifiedNormalDiagnostic
    ? entry.normalizedRgbRmse <= thresholds.amplifiedNormalRenderedRgbRmseMax
      && entry.sourceEquivalentNormalizedRgbRmse <= thresholds.amplifiedNormalSourceEquivalentRmseMax
    : entry.normalizedRgbRmse <= thresholds.normalizedRgbRmseMax;
  entry.pass = rgbPass
    && entry.meanRgbRatio >= thresholds.meanRgbRatioMin
    && entry.meanRgbRatio <= thresholds.meanRgbRatioMax;
}
const report = {
  schema: 'spaceface.waspFleetHero.captureParity.v1',
  result: comparisons.every((entry) => entry.pass) ? 'pass' : 'fail',
  mipFilter: 'box', thresholds,
  summary: {
    matchedCaptures: comparisons.length,
    maximumNormalizedRgbRmse: Math.max(...comparisons.map((entry) => entry.normalizedRgbRmse)),
    minimumMeanRgbRatio: Math.min(...comparisons.map((entry) => entry.meanRgbRatio)),
    maximumMeanRgbRatio: Math.max(...comparisons.map((entry) => entry.meanRgbRatio)),
  },
  comparisons,
};
const output = resolve(evidence, 'capture-parity-report.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (report.result !== 'pass') throw new Error(`raw/KTX2 capture parity failed; inspect ${output}`);
process.stdout.write(`${JSON.stringify({ ok: true, output, ...report.summary }, null, 2)}\n`);

function comparePair(lod, name, rawPath, ktxPath) {
  const rawBytes = readFileSync(rawPath);
  const ktxBytes = readFileSync(ktxPath);
  const raw = PNG.sync.read(rawBytes);
  const ktx = PNG.sync.read(ktxBytes);
  if (raw.width !== ktx.width || raw.height !== ktx.height) throw new Error(`LOD${lod} ${name}: dimension mismatch`);
  let squaredError = 0;
  let rawSum = 0;
  let ktxSum = 0;
  const channels = raw.width * raw.height * 3;
  for (let offset = 0; offset < raw.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const rawValue = raw.data[offset + channel];
      const ktxValue = ktx.data[offset + channel];
      squaredError += (rawValue - ktxValue) ** 2;
      rawSum += rawValue;
      ktxSum += ktxValue;
    }
  }
  return {
    lod, name,
    raw: { path: relative(rawPath), sha256: hash(rawBytes) },
    ktx2: { path: relative(ktxPath), sha256: hash(ktxBytes) },
    dimensions: [raw.width, raw.height],
    normalizedRgbRmse: Math.sqrt(squaredError / channels) / 255,
    meanRgbRatio: ktxSum / rawSum,
  };
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function relative(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}
