#!/usr/bin/env node
/** Offline integrity + syntax + provenance + fixture-receipt verification.
 * MANIFEST.json provides tamper detection, not a cryptographic signature of authorship.
 * Re-running npm test/fixture is separate from verifying the delivered bytes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { applyContextPatch } from './install.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = (v) => createHash('sha256').update(v).digest('hex');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'MANIFEST.json'), 'utf8'));
assert.equal(manifest.schema, 'spaceface.tension.delivery-manifest.v1');
assert(Array.isArray(manifest.files));
let syntaxFiles = 0;
for (const row of manifest.files) {
  const file = path.resolve(root, row.path);
  assert(file.startsWith(root), `Unsafe manifest path: ${row.path}`);
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, row.bytes, `Size mismatch: ${row.path}`);
  assert.equal(digest(bytes), row.sha256, `Hash mismatch: ${row.path}`);
  if (/\.(?:js|mjs)$/.test(row.path)) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(check.status, 0, `Syntax error: ${row.path}\n${check.stderr}`); syntaxFiles++;
  }
}
const provenance = JSON.parse(await fs.readFile(path.join(root, 'docs/BASELINE.json'), 'utf8'));
for (const [relative, patch] of Object.entries({ 'src/core/registry.js': 'registry.patch', 'src/systems/encounterDirector.js': 'encounter-consumer.patch' })) {
  const before = await fs.readFile(path.join(root, 'fixture/baseline', relative), 'utf8');
  const after = await fs.readFile(path.join(root, 'repo', relative), 'utf8');
  assert.equal(digest(before), provenance.files[relative].packet_sha256);
  assert.equal(digest(after), provenance.files[relative].delivered_sha256);
  assert.equal(applyContextPatch(before, await fs.readFile(path.join(root, 'patches', patch), 'utf8')), after,
    'Context patch and complete overlay disagree');
}
for (const relative of ['src/ai/tensionWindow.js', 'src/ai/tensionPolicy.js', 'src/ai/tensionDirector.js', 'src/systems/tensionDirector.js']) {
  const source = await fs.readFile(path.join(root, 'repo', relative), 'utf8');
  // `window` is also the histogram parameter in tensionWindow.js. Its two data
  // members are not browser globals; avoid treating a local data structure as DOM use.
  assert(!/\b(?:Math\.random|Date\.now|performance\.now|requestAnimationFrame|document\.|window\.(?!epochs\b|values\b)|THREE\.)/.test(source),
    `Forbidden gameplay dependency in ${relative}`);
}
const suite = JSON.parse(await fs.readFile(path.join(root, 'evidence/ten-hour/summary.json'), 'utf8'));
assert.equal(suite.evidenceClass, 'focused-consumer-with-world-doubles');
assert.equal(suite.secondsPerScenario, 36000);
assert.equal(suite.comparisons.length, 6);
assert(suite.comparisons.every((r) => r.repeatAndCheckpointVerified === true));
for (const row of suite.runs) {
  const run = JSON.parse(await fs.readFile(path.join(root, 'evidence/ten-hour', `${row.name}.json`), 'utf8'));
  const expected = digest(JSON.stringify({ hours: run.hours, changes: run.changes, starvation: run.starvation,
    spawnReceipts: run.spawnReceipts, timeline: run.timeline }));
  assert.equal(run.receiptsHash, expected, `Invalid trace receipt hash: ${row.name}`);
  assert.equal(row.receiptsHash, expected);
  assert.equal(row.policyHash, run.policyHash);
  assert.equal(run.hours.reduce((n, h) => n + h.seconds, 0), run.seconds);
  assert.equal(run.summary.spawns, run.spawnReceipts.length);
}
console.log(JSON.stringify({ status: 'PASS', filesHashChecked: manifest.files.length, syntaxFiles,
  patchOverlayParity: true, runtimeForbiddenDependencyScan: true,
  fixtureReceiptFiles: suite.runs.length, repeatCheckpointClaimsRecorded: suite.comparisons.length,
  note: 'Recorded results and bytes verified; run npm test / npm run fixture to re-execute them.' }, null, 2));
