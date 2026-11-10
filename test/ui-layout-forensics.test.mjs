// ui-layout-forensics.test.mjs — the pure half of the layout forensics pass.
//
// The in-page probe needs a live DOM and is exercised by `check:ui:layout` against the running
// game; what can be proven HERE is the classification logic, and that the probe functions stay
// self-contained (a probe that closes over module state would explode the moment Playwright
// serialises it into the page).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  dedupeFindings,
  hoverBegin,
  hoverDiff,
  hoverTriggers,
  layoutProbe,
  rectOverlap,
  summarizeFindings,
} from '../scripts/lib/ui-layout-measure.mjs';

const SOURCE = readFileSync(fileURLToPath(new URL('../scripts/lib/ui-layout-measure.mjs', import.meta.url)), 'utf8');

test('rectOverlap: measures only real intersection area', () => {
  const a = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(rectOverlap(a, { left: 50, top: 50, right: 150, bottom: 150 }), 2500);
  assert.equal(rectOverlap(a, { left: 100, top: 0, right: 200, bottom: 100 }), 0); // edge-touch is not overlap
  assert.equal(rectOverlap(a, { left: 0, top: 200, right: 50, bottom: 300 }), 0);
  assert.equal(rectOverlap(a, a), 10000);
});

test('dedupeFindings: collapses identical findings and caps per rule', () => {
  const findings = [
    { rule: 'text-occluded', victim: 'a', occluder: 'x' },
    { rule: 'text-occluded', victim: 'a', occluder: 'x' }, // exact dup
    { rule: 'text-occluded', victim: 'b', occluder: 'x' },
    { rule: 'hover-buried', victim: 'tip', occluder: 'card' },
  ];
  const out = dedupeFindings(findings);
  assert.equal(out.length, 3);

  const many = Array.from({ length: 30 }, (_, i) => ({ rule: 'text-overlap', victim: `v${i}`, occluder: 'o' }));
  assert.equal(dedupeFindings(many).length, 12);
});

test('summarizeFindings: counts per rule', () => {
  const counts = summarizeFindings([
    { rule: 'text-occluded' }, { rule: 'text-occluded' }, { rule: 'hover-buried' },
  ]);
  assert.deepEqual(counts, { 'text-occluded': 2, 'hover-buried': 1 });
});

test('the probe functions stay self-contained for page.evaluate serialisation', () => {
  // Playwright serialises the FUNCTION SOURCE into the page. A probe that referenced a module
  // binding would throw inside the browser. Guard: no free references to module-scope names.
  for (const fn of [layoutProbe, hoverBegin, hoverTriggers, hoverDiff]) {
    const src = fn.toString();
    for (const banned of ['dedupeFindings(', 'summarizeFindings(', 'rectOverlap(', 'import ', 'require(']) {
      assert.ok(!src.includes(banned), `${fn.name} must not reference ${banned}`);
    }
  }
});

test('the probe exports exist as functions the driver can page.evaluate', () => {
  for (const fn of [layoutProbe, hoverBegin, hoverTriggers, hoverDiff]) {
    assert.equal(typeof fn, 'function');
  }
});

test('the lib file itself carries no imports (probe purity at module level)', () => {
  // The shared lib is imported by the driver, but it must not itself pull repo modules into the
  // page context by accident.
  assert.ok(!/^import\s/m.test(SOURCE.replace(/^import test.*/m, '')), 'ui-layout-measure.mjs should have no static imports');
});
