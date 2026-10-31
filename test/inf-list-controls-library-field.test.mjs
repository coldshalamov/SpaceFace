// The shared list controls speak the library's vocabulary (the glass law: no rounded pill, no
// 1px grey box). The search field is the dp-field underline rail — a hairline that becomes the
// lamp on focus — and the filter chips are bare etched words with the selection lit by ink and a
// bone underline. The behavioral surface is the injected sheet; the help screen is the consumer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../src/ui/listControls.js', import.meta.url)), 'utf8');

test('the search field carries no box: rail at rest, lamp on focus', () => {
  const searchBlock = source.slice(source.indexOf('.sf-lc__search {'), source.indexOf('.sf-lc__chips'));
  assert.doesNotMatch(searchBlock, /border:1px solid/, 'no bordered box');
  assert.doesNotMatch(searchBlock, /border-radius:var\(--dp-r-instrument/, 'no rounded instrument');
  assert.match(searchBlock, /border:0; border-radius:0;/, 'explicitly unboxed');
  assert.match(searchBlock, /linear-gradient\(0deg, var\(--dp-rule-hi[^']*'?\s*2px, transparent 0\)/, 'the dp-field rest rail');
  assert.match(searchBlock, /--dp-lamp/, 'focus becomes the lamp, not a ring');
});

test('the chips are scale-line words: no pill, no fill, selection underlined', () => {
  const chipBlock = source.slice(source.indexOf('.sf-lc__chip {'), source.indexOf('.sf-sort {'));
  assert.doesNotMatch(chipBlock, /r-pill/, 'no pill radius');
  assert.doesNotMatch(chipBlock, /border:1px solid/, 'no bordered chip');
  assert.match(chipBlock, /border:0; border-radius:0;/);
  assert.match(chipBlock, /background:transparent;/, 'no field fill at rest');
  const activeBlock = source.slice(source.indexOf('.sf-lc__chip.active'), source.indexOf('/* Sortable header'));
  assert.match(activeBlock, /box-shadow:inset 0 -2px 0 0/, 'the selection is a bone underline');
});

test('the sheet still carries the sort header and placeholder disciplines', () => {
  assert.match(source, /\.sf-sort__arrow/);
  assert.match(source, /::placeholder \{ color:var\(--dp-ink-mute/);
});
