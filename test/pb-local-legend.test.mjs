// Seed 4242 — the local map legend names the scan ping the same way a click does.
//
// PING_COURSE_LABEL is already "Unresolved contact". The lm-legend sentence used to hardcode
// "SCAN PING". localMapLegendText() is that sentence, and mount interpolates it into the HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localMapLegendText, PING_COURSE_LABEL } from '../src/ui/screens/localmap.js';

const SEED = 4242;

test('seed 4242: the local legend names an unresolved contact', () => {
  assert.equal(SEED, 4242);
  assert.equal(PING_COURSE_LABEL, 'Unresolved contact');
  const sentence = localMapLegendText();
  assert.equal(typeof sentence, 'string');
  assert.ok(sentence.includes('Unresolved contact'), 'the legend uses the click name');
  assert.equal(sentence.includes('SCAN PING'), false, 'the generic scan-ping words are gone');

  const src = readFileSync(new URL('../src/ui/screens/localmap.js', import.meta.url), 'utf8');
  const at = src.indexOf('class="lm-legend"');
  assert.ok(at >= 0, 'the screen still mounts an lm-legend');
  const block = src.slice(at, src.indexOf('</div>', at));
  assert.match(block, /localMapLegendText\(\)/, 'mount interpolates the legend sentence');
  assert.equal(block.includes('SCAN PING'), false);
  assert.ok(sentence.includes('STATION'), 'the rest of the legend sentence stays');
});
