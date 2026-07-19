#!/usr/bin/env node
// Rebuild the scratch-only Wasp raw candidate and prove byte-identical GLB and texture output.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const candidateRoot = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/candidate');
const script = resolve(ROOT, 'assets/ships/parts/scripts/golden_wasp_fleet_hero_v1.py');
const blender = process.env.BLENDER_EXE || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';
const canonicalizer = resolve(ROOT, 'tools/art/canonicalize_wasp_fleet_hero_raw.mjs');
const glbOutputs = [
  resolve(candidateRoot, 'wasp_production_v1_golden.glb'),
  resolve(candidateRoot, 'wasp_production_v1_golden_lod1.glb'),
  resolve(candidateRoot, 'wasp_production_v1_golden_lod2.glb'),
];
const trackedOutputs = [
  ...glbOutputs,
  ...readdirSync(resolve(candidateRoot, 'textures'))
    .filter((name) => extname(name).toLowerCase() === '.png')
    .sort()
    .map((name) => resolve(candidateRoot, 'textures', name)),
];

const beforeBuffers = Object.fromEntries(trackedOutputs.map((path) => [relative(path), readFileSync(path)]));
const before = Object.fromEntries(Object.entries(beforeBuffers).map(([path, bytes]) => [path, receiptBytes(bytes)]));
const commandArgs = [
  '--background', '--factory-startup', '--python', script, '--',
  '--output-dir', candidateRoot, '--texture-size', '1024', '--reuse-textures',
];
const run = spawnSync(blender, commandArgs, {
  cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) {
  throw new Error(`${blender} ${commandArgs.join(' ')}\n${run.error || ''}\n${run.stdout || ''}\n${run.stderr || ''}`);
}
const canonicalRun = spawnSync(process.execPath, [canonicalizer], {
  cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024,
});
if (canonicalRun.status !== 0) {
  throw new Error(`${process.execPath} ${canonicalizer}\n${canonicalRun.error || ''}\n${canonicalRun.stdout || ''}\n${canonicalRun.stderr || ''}`);
}
const canonicalFirst = Object.fromEntries(glbOutputs.map((path) => [relative(path), receiptBytes(readFileSync(path))]));
const canonicalIdempotenceRun = spawnSync(process.execPath, [canonicalizer], {
  cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024,
});
if (canonicalIdempotenceRun.status !== 0) {
  throw new Error(`${process.execPath} ${canonicalizer}\n${canonicalIdempotenceRun.error || ''}\n${canonicalIdempotenceRun.stdout || ''}\n${canonicalIdempotenceRun.stderr || ''}`);
}
const canonicalSecond = Object.fromEntries(glbOutputs.map((path) => [relative(path), receiptBytes(readFileSync(path))]));
const canonicalizerIdempotent = Object.keys(canonicalFirst).every((path) => (
  canonicalFirst[path].bytes === canonicalSecond[path].bytes
  && canonicalFirst[path].sha256 === canonicalSecond[path].sha256
));
const afterBuffers = Object.fromEntries(trackedOutputs.map((path) => [relative(path), readFileSync(path)]));
const after = Object.fromEntries(Object.entries(afterBuffers).map(([path, bytes]) => [path, receiptBytes(bytes)]));
const files = Object.keys(before).map((path) => ({
  path,
  before: before[path],
  after: after[path],
  identical: before[path].sha256 === after[path].sha256 && before[path].bytes === after[path].bytes,
  ...(path.endsWith('.glb') && before[path].sha256 !== after[path].sha256
    ? glbDrift(beforeBuffers[path], afterBuffers[path]) : {}),
}));
const report = {
  schema: 'spaceface.waspFleetHero.determinism.v1',
  commands: [
    { executable: blender, args: commandArgs, exitCode: run.status },
    { executable: process.execPath, args: [canonicalizer], exitCode: canonicalRun.status },
    { executable: process.execPath, args: [canonicalizer], exitCode: canonicalIdempotenceRun.status, purpose: 'idempotence proof' },
  ],
  canonicalizerIdempotence: { result: canonicalizerIdempotent ? 'pass' : 'fail', first: canonicalFirst, second: canonicalSecond },
  trackedFileCount: files.length,
  result: files.every((entry) => entry.identical) && canonicalizerIdempotent ? 'pass' : 'fail',
  files,
};
const reportPath = resolve(candidateRoot, 'determinism-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (report.result !== 'pass') throw new Error(`determinism drift; inspect ${reportPath}`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, trackedFileCount: files.length }, null, 2)}\n`);

function receiptBytes(bytes) {
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}

function glbDrift(beforeBytes, afterBytes) {
  const beforeGlb = parseGlb(beforeBytes);
  const afterGlb = parseGlb(afterBytes);
  const differences = [];
  diffJson(beforeGlb.json, afterGlb.json, '$', differences);
  const byteDifferences = [];
  let byteDifferenceCount = 0;
  const commonLength = Math.min(beforeGlb.bin.length, afterGlb.bin.length);
  for (let index = 0; index < commonLength; index++) {
    if (beforeGlb.bin[index] === afterGlb.bin[index]) continue;
    byteDifferenceCount++;
    if (byteDifferences.length < 40) byteDifferences.push({ offset: index, before: beforeGlb.bin[index], after: afterGlb.bin[index] });
  }
  byteDifferenceCount += Math.abs(beforeGlb.bin.length - afterGlb.bin.length);
  return {
    glbDrift: {
      jsonBeforeSha256: receiptBytes(Buffer.from(JSON.stringify(beforeGlb.json))).sha256,
      jsonAfterSha256: receiptBytes(Buffer.from(JSON.stringify(afterGlb.json))).sha256,
      binBeforeSha256: receiptBytes(beforeGlb.bin).sha256,
      binAfterSha256: receiptBytes(afterGlb.bin).sha256,
      byteDifferenceCount,
      firstByteDifferences: byteDifferences,
      differences: differences.slice(0, 60),
    },
  };
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trimEnd());
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB missing JSON chunk');
  return { json, bin };
}

function diffJson(before, after, path, output) {
  if (output.length >= 60) return;
  if (Object.is(before, after)) return;
  if (typeof before !== typeof after || before === null || after === null || typeof before !== 'object') {
    output.push({ path, before, after });
    return;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    if (!(key in before) || !(key in after)) output.push({ path: `${path}.${key}`, before: before[key], after: after[key] });
    else diffJson(before[key], after[key], `${path}.${key}`, output);
    if (output.length >= 60) return;
  }
}

function relative(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}
