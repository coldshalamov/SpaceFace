#!/usr/bin/env node
// Run each real test module directly. Keep the integration contract readable in CI output.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'nocturne-director', 'nocturne-director-admission', 'nocturne-content',
  'nocturne-bridge', 'nocturne-atmosphere', 'nocturne-atmosphere-graph', 'nocturne-settings',
  'shadow-depth-admission', 'headlights', 'ambient-fixtures',
  'illustrated-surface', 'illustrated-shader-identifiers',
  'bloom-distortion', 'bloom-packed-hdr', 'bloom-contrast-lut', 'bloom-pass-timing-scratch',
];
const sourceFiles = [
  ...readdirSync(path.join(root, 'src/render/nocturne')).filter(name => name.endsWith('.js')).map(name => `src/render/nocturne/${name}`),
  'src/data/nocturneLighting.js', 'src/data/lookMoods.js', 'src/render/renderer.js',
  'src/render/illustratedSurface.js', 'src/render/bloom.js', 'src/render/post/spaceRenderGraph.js',
  'src/render/shadowDepthAdmission.js', 'src/render/vfx.js', 'src/render/weapons/weaponLights.js',
  ...tests.map(name => `test/${name}.test.mjs`),
];
const sourceHash = () => Object.fromEntries(sourceFiles.map(name => [name,
  createHash('sha256').update(readFileSync(path.join(root, name))).digest('hex')]));
const report = { kind: 'focused-runtime-tests', createdAt: new Date().toISOString(),
  node: process.version, sourceBefore: sourceHash(), suites: [], checks: [],
  gameplayAcceptance: false, hardwareAcceptance: false };
let failed = 0, cases = 0;
for (const name of tests) {
  const result = spawnSync(process.execPath, [`test/${name}.test.mjs`], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  const output = result.stdout + result.stderr;
  const count = Number(output.match(/(?:ℹ tests |# tests )(\d+)/)?.[1] || 0);
  cases += count;
  report.suites.push({ name, cases: count, passed: !result.error && result.status === 0 && count > 0,
    error: result.error?.message || null, output });
  if (result.error || result.status !== 0 || count === 0) {
    failed++; console.error(`FAIL ${name}\n${result.error?.message || ''}\n${output}`);
  } else console.log(`PASS ${name}: ${count} cases`);
}
for (const args of [['scripts/check-nocturne-authoring.mjs'], ['scripts/sync-modulepreload.mjs', '--check']]) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  report.checks.push({ command: args, passed: !result.error && result.status === 0,
    error: result.error?.message || null, output: result.stdout + result.stderr });
  if (result.error || result.status !== 0) {
    failed++;
    if (result.error) console.error(result.error.message);
  }
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
}
report.sourceAfter = sourceHash();
report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
if (!report.sourceStable) { failed++; console.error('Source changed during verification; rerun against a stable tree.'); }
report.cases = cases; report.failedChecks = failed; report.passed = failed === 0;
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
if (reportPath) {
  const target = path.resolve(reportPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
}
console.log(`NOCTURNE: ${cases} tests in ${tests.length} suites; ${failed} failed checks.`);
console.log('This checks runtime contracts; use the browser fixtures and real hardware for visual/GPU acceptance.');
if (failed) process.exitCode = 1;
