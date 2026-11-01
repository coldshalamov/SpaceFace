import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rendererSrc = readFileSync(join(root, 'src/render/renderer.js'), 'utf8');

function sectionAround(marker, before = 500, after = 900) {
  const idx = rendererSrc.indexOf(marker);
  assert.ok(idx > 0, `missing marker ${marker}`);
  return rendererSrc.slice(Math.max(0, idx - before), idx + after);
}

test('soft-GPU opening.planWait does not poll', () => {
  const section = sectionAround("recordOpeningCookStep(state.render, 'opening.planWait'");
  assert.match(section, /soft-gpu-self-build/);
  assert.match(section, /budgetMs:\s*0/);
  assert.equal(/await new Promise\(\(resolve\) => setTimeout/.test(section), false);
  assert.equal(/<\s*8000/.test(section), false);
});

test('soft-GPU opening.drainWait does not await concurrent submission', () => {
  const section = sectionAround("recordOpeningCookStep(state.render, 'opening.drainWait'");
  assert.match(section, /soft-gpu-no-await/);
  assert.match(section, /budgetMs:\s*0/);
  assert.equal(/while\s*\(!state\.render\.openingSubmissionReady/.test(section), false);
  assert.equal(/setTimeout\(\(\) => resolve\('timeout'\),\s*8000\)/.test(section), false);
});

test('soft-GPU opening residency budget is tighter than hardware', () => {
  const section = sectionAround('residencyBudgetMs', 500, 3200);
  assert.match(section, /deadlineMs:\s*options\.required !== true && softGpuOpening \? residencyBudgetMs/,
    'non-required soft-GPU cook passes the policy residency budget as its deadline');
  const policySrc = readFileSync(join(root, 'src/render/openingLoadPolicy.js'), 'utf8');
  const serial = policySrc.match(/SERIAL_RESIDENCY_BUDGET_MS:\s*(\d+)/);
  const parallel = policySrc.match(/PARALLEL_RESIDENCY_BUDGET_MS:\s*(\d+)/);
  assert.ok(serial && parallel, 'openingLoadPolicy names both residency budgets');
  assert.ok(Number(serial[1]) < Number(parallel[1]),
    `serial-link budget ${serial[1]}ms must stay tighter than parallel ${parallel[1]}ms`);
  assert.match(policySrc, /residencyBudgetMs:\s*serialLinkRoute/,
    'the policy routes the tighter budget through serialLinkRoute');
});

test('self-build still follows a soft planWait miss', () => {
  const idx = rendererSrc.indexOf("recordOpeningCookStep(state.render, 'opening.planWait'");
  const after = rendererSrc.slice(idx, idx + 1400);
  assert.match(after, /buildOpeningSubmissionPlanSteps\.call\(this\)/);
});
