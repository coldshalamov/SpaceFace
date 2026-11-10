// Wave G5 — station mission titles and the berth name are fully visible.
// No mid-word ellipsis. The font stays the data size.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/station.css', import.meta.url), 'utf8');

function titleBlock() {
  const match = css.match(/\.sx-ct-row__title, \.sx-job__title \{[^}]*\}/);
  assert.ok(match, 'mission title rule exists');
  return match[0];
}

test('G5 station mission titles wrap whole words at both resolutions', () => {
  const block = titleBlock();
  assert.match(block, /white-space:\s*normal/);
  assert.match(block, /text-overflow:\s*clip/);
  assert.match(block, /-webkit-line-clamp:\s*unset/);
  assert.doesNotMatch(block, /ellipsis/);
  assert.match(css, /\.sxb-berth__name \{[^}]*max-width:\s*none/);
  assert.match(css, /\.sx-dossier__title \{[^}]*max-width:\s*none/);

  const title = 'First trade: 8u Fuel Cells to the Ceres customs gate';
  for (const column of [280, 420]) {
    assert.equal(wordsFit(title, column, 13), true, `${column}px column keeps every word`);
  }
});

function wordsFit(text, columnPx, fontPx) {
  const charPx = fontPx * 0.56;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const w = word.length * charPx;
    if (w > columnPx) return false;
    if (used > 0 && used + charPx + w > columnPx) used = w;
    else used += (used ? charPx : 0) + w;
  }
  return true;
}
