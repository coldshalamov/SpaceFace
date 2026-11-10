import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

const DOORS = Object.freeze({
  'probe:heap-verify': 'scripts/probe-heap-verify.mjs',
  'probe:main-thread': 'scripts/probe-main-thread-profile.mjs',
  'probe:crucible-cpu': 'scripts/probe-crucible-cpu-profile.mjs',
});

function scriptFile(command) {
  const match = String(command).match(/scripts\/[A-Za-z0-9_.-]+\.mjs/);
  return match ? match[0] : null;
}

test('every probe npm script points at a script that exists', () => {
  const probeKeys = Object.keys(scripts).filter((key) => key.startsWith('probe:'));
  assert.ok(probeKeys.length > 0, 'package.json has probe doors');
  for (const key of probeKeys) {
    const file = scriptFile(scripts[key]);
    assert.ok(file, `${key} does not name a scripts/*.mjs file: ${scripts[key]}`);
    assert.ok(fs.existsSync(path.join(root, file)), `${key} -> ${file} is missing`);
  }
});

test('the heap, main-thread, and Crucible CPU probes are named doors', () => {
  for (const [key, file] of Object.entries(DOORS)) {
    assert.equal(scriptFile(scripts[key]), file, key);
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  const workflow = fs.readFileSync(path.join(root, 'docs/VALIDATION_WORKFLOW.md'), 'utf8');
  for (const key of Object.keys(DOORS)) {
    assert.ok(workflow.includes(`npm run ${key}`), `${key} is missing from the validation ladder`);
  }
});
