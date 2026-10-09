// SF-258 — the D36/D84 starvation surface is retired by mechanism, not by luck.
// "Things don't load in time" was a starve loop: every late present refused another
// heavy admission, so a sustained 30 Hz host could park the mesh-build drain while
// field rocks and hulls stayed unbuilt. The eventual-start latch bounds the refusal:
// at most HEAVY_ADMISSION_EVENTUAL_SKIP - 1 consecutive refusals, then exactly one
// heavy item starts per beat until the presents recover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HEAVY_ADMISSION_EVENTUAL_SKIP,
  shouldStartHeavyAdmission,
  shouldStartHeavyAdmissionEventually,
} from '../src/render/admissionSliceBudget.js';

test('a permanently 33 ms host cannot starve heavy admission past the skip bound', () => {
  let skipped = 0;
  let beatsUntilStart = -1;
  // Simulate 60 consecutive late presents; count how many beats pass before a start.
  for (let beat = 0; beat < 60; beat++) {
    const gate = shouldStartHeavyAdmissionEventually(33.3, skipped);
    skipped = gate.skippedCount;
    if (gate.start) { beatsUntilStart = beat; break; }
  }
  assert.ok(beatsUntilStart >= 0, 'heavy admission eventually starts under sustained debt');
  assert.ok(beatsUntilStart < HEAVY_ADMISSION_EVENTUAL_SKIP,
    `first start lands inside the ${HEAVY_ADMISSION_EVENTUAL_SKIP}-beat bound, got beat ${beatsUntilStart}`);
});

test('the release cadence repeats — every bounded window admits one item, not zero', () => {
  let skipped = 0;
  let starts = 0;
  for (let beat = 0; beat < HEAVY_ADMISSION_EVENTUAL_SKIP * 4; beat++) {
    const gate = shouldStartHeavyAdmissionEventually(33.3, skipped);
    skipped = gate.skippedCount;
    if (gate.start) starts += 1;
  }
  assert.equal(starts, 4, 'one forced start per bounded window — steady drain, not burst, not stall');
});

test('recovered presents clear the latch so the next late window re-bounds from zero', () => {
  let skipped = 0;
  for (let i = 0; i < 6; i++) skipped = shouldStartHeavyAdmissionEventually(33.3, skipped).skippedCount;
  const recovered = shouldStartHeavyAdmissionEventually(16.7, skipped);
  assert.equal(recovered.start, true);
  assert.equal(recovered.skippedCount, 0, 'recovery resets the skip counter');
  // And a fresh late window refuses again — the gate is not latched open.
  assert.equal(shouldStartHeavyAdmission(33.3), false);
});

test('every admission lane that can starve consults the gate or documents the bypass', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const parts = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(renderer, /_meshBuildLateSkips/, 'the live mesh-build drain carries the skip counter');
  assert.match(renderer, /shouldStartHeavyAdmissionEventually\(/);
  assert.match(parts, /shouldStartHeavyAdmissionEventually\(/, 'pooled chunk admissions consult it too');
  // The loading shell bypass is deliberate and documented: under the shell every present is the
  // spinner, so the gate would refuse every drain — that bypass has its own pin in
  // test/admission-slice-budget.test.mjs.
});
