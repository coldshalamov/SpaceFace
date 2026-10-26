// SEED-ST-01 follow-through — on the dial the verbs' subs must be VISIBLE, not aria-only.
//
// The landed ST-01 (3a21675c52) put `sub` on every mode verb, but the ORRERY arc rail keeps
// `.dp-lit__note` for the accessibility tree only ("the dial shows the fact elsewhere (the
// eyebrow)"). The follow-through wires that elsewhere: while a glossed verb is awake — hover
// or focus — the title's status eyebrow prints "Verb · gloss"; on leave it returns to the
// standing line, or to the Continue summary when a save is present. A presented Continue
// failure owns the line until cleared.
//
// No jsdom in this repo, so the pin is a scoped source slice (the zc-seed-st-01 technique):
// the hidden-note contract, the awake wiring, and the restore contract, all in one file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MENU_MODE_GLOSSES } from '../src/ui/screens/mainMenu.js';

const SRC = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
const RAIL = readFileSync(new URL('../src/ui/orrery/arcRail.js', import.meta.url), 'utf8');

test('the premise stays true: the dial hides .dp-lit__note for the accessibility tree only', () => {
  // If the rail ever renders subs visibly this whole mechanism is redundant — the test should
  // say so rather than silently pin a dead feature.
  assert.match(RAIL, /\.dp-lit__note \{ position:absolute !important; width:1px/);
  assert.match(RAIL, /accessibility tree; the dial shows the fact elsewhere \(the eyebrow\)/);
});

test('the eyebrow names an awake glossed verb: "Verb · gloss" on hover and on focus', () => {
  // The gloss lookup reads the same table the subs came from — one vocabulary, never a fork.
  const glossOf = SRC.slice(SRC.indexOf('const glossOf = '), SRC.indexOf('const writeRest'));
  assert.match(glossOf, /MENU_MODE_GLOSSES\[a\]/);
  // Both kinds of awake route to the writer: pointer (hover) and focus (keyboard/roving).
  const mount = SRC.slice(SRC.indexOf('SEED-ST-01 follow-through'), SRC.indexOf('this._glossDetach = '));
  assert.match(mount, /addEventListener\('pointerover', onAwake\)/);
  assert.match(mount, /addEventListener\('focusin', onAwake\)/);
  // The written line is "Label · gloss" — the verb's own visible text, not a bare gloss.
  assert.match(mount, /refs\.status\.textContent = \(b\.textContent \|\| ''\)\.trim\(\) \+ ' · ' \+ gloss/);
});

test('every awake verb that can gloss resolves one of the five mode glosses', () => {
  // The five verbs the catalog row names — Crucible is in the verb ladder, the other four in
  // the aside — each land a button with data-action the writer can resolve.
  for (const action of ['crucible', 'archive', 'circuits', 'sandbox', 'physics']) {
    assert.ok(MENU_MODE_GLOSSES[action], `gloss for ${action}`);
  }
  // data-action is what glossOf reads; the item builders stamp it (kit contract).
  const kit = readFileSync(new URL('../src/ui/kit/dom.js', import.meta.url), 'utf8');
  assert.match(kit, /button\.dataset\.action = String\(item\.action\)/);
});

test('the rest contract: leave restores the standing line or the Continue summary', () => {
  const mount = SRC.slice(SRC.indexOf('SEED-ST-01 follow-through'), SRC.indexOf('this._glossDetach = '));
  assert.match(mount, /addEventListener\('pointerleave', writeRest\)/);
  assert.match(mount, /addEventListener\('focusout', onGlossOut\)/);
  // _titleStatusRest names the two rest states and the failure veto.
  const rest = SRC.slice(SRC.indexOf('_titleStatusRest() {'), SRC.indexOf('_syncCurrent() {'));
  assert.match(rest, /titleContinueFailure\) return null/);
  assert.match(rest, /coreText\('continue'\) \+ ' · ' \+ saveSummaryText\(latest\.slot, latest\.meta\)/);
  assert.match(rest, /this\._statusDefault/);
});

test('the writer detaches with the screen and never owns the line over a Continue failure', () => {
  const mount = SRC.slice(SRC.indexOf('SEED-ST-01 follow-through'), SRC.indexOf('// data-k-ready'));
  assert.match(mount, /refs\.titleContinueFailure\) return;/);
  const detach = SRC.slice(SRC.indexOf('this._glossDetach = () =>'), SRC.indexOf('// data-k-ready'));
  for (const ev of ['pointerover', 'focusin', 'pointerleave', 'focusout']) {
    assert.match(detach, new RegExp(`removeEventListener\\('${ev}'`));
  }
  // The unmount path runs the detach — the listeners die with the screen.
  const disposeAt = SRC.indexOf('dispose() {');
  const unmount = SRC.slice(disposeAt, SRC.indexOf('refs = null;', disposeAt));
  assert.match(unmount, /this\._glossDetach\) \{ this\._glossDetach\(\); this\._glossDetach = null; \}/);
});
