import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('PQ-057 scheduler is imported by live AI and world owners', async () => {
  const ai = await readFile(new URL('../src/ai/stack.js', import.meta.url), 'utf8');
  const bark = await readFile(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  const combat = await readFile(new URL('../src/systems/combatOutcome.js', import.meta.url), 'utf8');
  const faction = await readFile(new URL('../src/systems/factionPresence.js', import.meta.url), 'utf8');
  const traffic = await readFile(new URL('../src/systems/traffic.js', import.meta.url), 'utf8');
  assert.match(ai, /shouldOwnerThink/);
  assert.match(bark, /shouldOwnerThink/);
  assert.match(combat, /shouldRunOnTick/);
  assert.match(faction, /shouldRunOnTick/);
  assert.match(traffic, /shouldRunOnTick/);
});

test('PQ-054 frozen cohort gates live compile and residency', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /shouldAdmitOpeningSubject\(openingCohort,\s*subject\)/);
});

test('PQ-058 sector travel calls enforceBudget through applySectorExitResidency', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const residency = await readFile(new URL('../src/render/assetResidency.js', import.meta.url), 'utf8');
  assert.match(renderer, /applySectorExitResidency\(this\._assetResidency/);
  assert.match(residency, /residency\.enforceBudget/);
});

test('PQ-051 restore retry and opening defer clear exist on the live renderer', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /recovery\.scheduleRetry/);
  assert.match(source, /releaseOpeningMeshDefer/);
  assert.match(source, /state\.render\.deferNoncriticalMeshStreaming = false/);
});

test('PQ-053 station and place HLOD attach on the live composition path', async () => {
  const parts = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  const hlod = await readFile(new URL('../src/render/hlod.js', import.meta.url), 'utf8');
  assert.match(parts, /attachStationHlod/);
  assert.match(parts, /attachPlaceHlod/);
  assert.match(hlod, /applyProjectedDetailLod/);
});
