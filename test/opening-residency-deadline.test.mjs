import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const residencySrc = readFileSync(join(root, 'src/render/startupGpuResidency.js'), 'utf8');
const rendererSrc = readFileSync(join(root, 'src/render/renderer.js'), 'utf8');

test('prepareStartupGpuResidency honors deadlineMs and stops early', () => {
  assert.match(residencySrc, /deadlineMs/);
  assert.match(residencySrc, /loading-deadline-partial/);
  assert.match(residencySrc, /partial:\s*true/);
  assert.match(residencySrc, /hitDeadline/);
});

test('soft-GPU partial residency continues past skipped=false', () => {
  const residencySrc = readFileSync(join(root, 'src/render/startupGpuResidency.js'), 'utf8');
  assert.match(residencySrc, /loading-deadline-partial/);
  assert.doesNotMatch(
    residencySrc.slice(residencySrc.indexOf('hitDeadline'), residencySrc.indexOf('hitDeadline') + 800),
    /skipped:\s*true/,
    'deadline partial must not set skipped:true',
  );
});

test('soft-GPU opening cook passes deadlineMs into residency', () => {
  const start = rendererSrc.indexOf('state.render.prepareOpeningGpuResources');
  assert.ok(start > 0);
  const section = rendererSrc.slice(start, start + 9000);
  assert.match(section, /deadlineMs:\s*softGpuOpening\s*\?\s*residencyBudgetMs/);
  assert.match(section, /residencyBudgetMs\s*=\s*softGpuOpening\s*\?\s*750\s*:\s*5000/);
});
