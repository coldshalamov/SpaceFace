// SEED-ST-01, rewritten for TITLE-02 (the two-door title). The rule this file guards is the same one
// SEED-ST-01 set: a stranger SEES what each way into the game is before pressing it. On the retired
// ORRERY dial the verbs' lines were hidden and the eyebrow narrated the awake verb instead. On the
// doors each line is printed on the door's own face, so the eyebrow narrates nothing; it carries
// only a failed Continue, in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TITLE_DOORS, TITLE_STRAPLINE, MENU_MODE_GLOSSES } from '../src/ui/screens/mainMenu.js';

const SRC = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/ui/orrery/titleDoorsLayouts.js', import.meta.url), 'utf8');

const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

test('each door says what it is on its own face, in eight words or fewer', () => {
  for (const door of [TITLE_DOORS.swarm, TITLE_DOORS.adventure]) {
    for (const key of ['kicker', 'name', 'line', 'go']) {
      assert.ok(door[key], `door ${door.name} has a ${key}`);
      assert.ok(wordCount(door[key]) <= 8, `"${door[key]}" is eight words or fewer`);
    }
  }
  assert.ok(wordCount(TITLE_STRAPLINE) <= 8);
  // The line is a visible element on the card, never visually hidden.
  assert.match(CSS, /\.of-door__line \{\n\s*display:-webkit-box !important;/);
  assert.doesNotMatch(CSS, /of-door__line[^}]*width:1px/);
});

test('no internal names on the doors', () => {
  const words = JSON.stringify(TITLE_DOORS) + TITLE_STRAPLINE;
  assert.doesNotMatch(words, /Crucible|AFTERMATH|unbound|Massline/i);
});

test('the eyebrow no longer narrates the awake verb; it rests on the standing line', () => {
  assert.doesNotMatch(SRC, /refs\.status\.textContent = \(b\.textContent/);
  const rest = SRC.slice(SRC.indexOf('_titleStatusRest() {'), SRC.indexOf('_syncCurrent() {'));
  assert.match(rest, /titleContinueFailure\) return null/);
  assert.match(rest, /return this\._statusDefault;/);
});

test('the lab glosses stay one vocabulary for the dev-switch row', () => {
  for (const action of ['crucible', 'archive', 'circuits', 'sandbox', 'physics']) {
    assert.ok(MENU_MODE_GLOSSES[action], `gloss for ${action}`);
  }
});
