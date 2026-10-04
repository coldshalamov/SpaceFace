import test from 'node:test';
import assert from 'node:assert/strict';

import {
  restartCreditsChipPulse,
  runCreditsPulseReflowAb,
} from '../src/ui/hud.js';

class ChipClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function makeChip() {
  let offsetReads = 0;
  return {
    classList: new ChipClassList(),
    get offsetWidth() { offsetReads += 1; return 100; },
    get offsetReads() { return offsetReads; },
  };
}

test('restartCreditsChipPulse schedules class add without reading offsetWidth', () => {
  const chip = makeChip();
  const queue = [];
  restartCreditsChipPulse(chip, 'sf-credits--gain', (fn) => queue.push(fn));
  assert.equal(chip.offsetReads, 0);
  assert.equal(chip.classList.contains('sf-credits--gain'), false);
  assert.equal(queue.length, 1);
  queue[0]();
  assert.equal(chip.classList.contains('sf-credits--gain'), true);
  assert.equal(chip.offsetReads, 0);
});

test('restartCreditsChipPulse cancels a superseded pulse token', () => {
  const chip = makeChip();
  const queue = [];
  restartCreditsChipPulse(chip, 'sf-credits--gain', (fn) => queue.push(fn));
  restartCreditsChipPulse(chip, 'sf-credits--spend', (fn) => queue.push(fn));
  queue[0]();
  assert.equal(chip.classList.contains('sf-credits--gain'), false);
  queue[1]();
  assert.equal(chip.classList.contains('sf-credits--spend'), true);
  assert.equal(chip.offsetReads, 0);
});

test('portable A/B: modern pulse path records zero sync layout reads', () => {
  const ab = runCreditsPulseReflowAb({ rounds: 4000 });
  assert.equal(ab.legacy.layoutReads, 4000);
  assert.equal(ab.modern.layoutReads, 0);
  assert.equal(ab.layoutEliminated, true);
  assert.equal(ab.layoutReduction, 4000);
});

test('source: refreshCredits no longer forces chip.offsetWidth', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8'));
  const fnStart = src.indexOf('function refreshCredits()');
  assert.ok(fnStart >= 0);
  const slice = src.slice(fnStart, fnStart + 1600);
  assert.match(slice, /restartCreditsChipPulse/);
  const codeOnly = slice.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /offsetWidth/);
});
