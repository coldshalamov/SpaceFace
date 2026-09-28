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
  const section = sectionAround('residencyBudgetMs');
  assert.match(section, /softGpuOpening \? 750 : 5000/);
});

test('self-build still follows a soft planWait miss', () => {
  const idx = rendererSrc.indexOf("recordOpeningCookStep(state.render, 'opening.planWait'");
  const after = rendererSrc.slice(idx, idx + 1400);
  assert.match(after, /buildOpeningSubmissionPlan\s*\(/);
});
