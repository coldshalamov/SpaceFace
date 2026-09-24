// C4 — the cargo hold's two verbs use the flight kit, not a second cyan button.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

test('set course and jettison are kit words', () => {
  assert.match(source, /k-word k-word--emph k-word--primary sf-btn-route/);
  assert.match(source, />Set course</);
  assert.match(source, /k-word k-word--danger sf-btn-jettison/);
  assert.match(source, />Jettison</);
  assert.match(source, /jetBtn\.textContent = 'Jettison'/);
  assert.doesNotMatch(source, /textContent = 'JETTISON'/);
  assert.doesNotMatch(source, /LOCK: PERSISTENT/);
  assert.doesNotMatch(source, /LOCK: CONTRACT/);
  assert.doesNotMatch(source, /SET COURSE/);
  assert.doesNotMatch(source, /sf-btn-fx/);
  assert.match(source, /--k-signal: var\(--dp-lamp\)/);
  assert.match(source, /k-word k-word--emph k-word--primary sf-cargo-rail-btn active/);
  assert.match(source, />Cargo</);
  assert.match(source, /Close · Esc/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-current="true"/);
  assert.match(source, /cargoCloseBtn\.focus/);
  assert.match(source, /min\(980px, calc\(100vw - 32px\)\)/);
  assert.match(source, /white-space: normal/);
  assert.doesNotMatch(source, /visor-cyan\) 8%/);
  assert.doesNotMatch(source, />CARGO</);
});
