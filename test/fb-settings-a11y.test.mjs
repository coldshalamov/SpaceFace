// FB-112 — sliders announce their value, a binding conflict is described,
// and text scale is not UI scale.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { paneBuilder } from '../src/ui/views/settingsControls.js';
import { applyTextScaleFromSettings } from '../src/ui/accessibility.js';
import { flagsFromSettings } from '../src/ui/accessibilityChecklist.js';
import { announceBindingConflict } from '../src/ui/screens/settings.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('FB-112 a slider speaks its value and text scale ignores UI scale', () => {
  const previous = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const pane = doc.createElement('div');
    const build = paneBuilder(pane);
    let seen = 1;
    build.slider('UI scale', () => seen, 0.75, 2, 0.05, (value) => `${Math.round(value * 100)}%`, (value) => { seen = value; });
    const slider = pane.children[0].children.find ? null : null;
    const input = findInput(pane);
    assert.equal(input.getAttribute('role'), 'slider');
    assert.equal(input.getAttribute('aria-valuenow'), '1');
    assert.equal(input.getAttribute('aria-valuetext'), '100%');
    input.value = '1.5';
    for (const fn of input.listeners.input || []) fn();
    assert.equal(input.getAttribute('aria-valuetext'), '150%');
    assert.equal(input.getAttribute('aria-valuenow'), '1.5');

    const root = doc.createElement('div');
    const scale = applyTextScaleFromSettings({ accessibility: { textScale: 1.25 }, uiScale: 2 }, root);
    assert.equal(scale, 1.25);
    assert.equal(root.style['--sf-text-scale'], '1.25');
    assert.equal(root.style['--k-fs-body'], undefined, 'type tokens retain their authored responsive base');
    assert.equal(root.style['--ui-scale'], undefined);
    const flags = flagsFromSettings({ uiScale: 0.5, accessibility: {} });
    assert.equal(flags.textScale, true, 'a missing text scale is the default size, not a failure');
    assert.equal(flagsFromSettings({ uiScale: 2, accessibility: { textScale: 0 } }).textScale, false);
  } finally {
    globalThis.document = previous;
  }
});

test('FB-112 a binding conflict is described on the row', () => {
  const previous = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const row = document.createElement('li');
    row.className = 'k-row';
    const button = document.createElement('button');
    row.appendChild(button);
    announceBindingConflict(button, 'In use: Boost');
    assert.equal(button.getAttribute('aria-describedby') != null, true);
    const note = row.children.find((child) => child.getAttribute && child.getAttribute('data-bind-conflict') === '1'
      || (child.dataset && child.dataset.bindConflict));
    assert.ok(note);
    assert.match(note.textContent, /In use: Boost/);
    assert.equal(row.getAttribute('aria-describedby'), note.id);
  } finally {
    globalThis.document = previous;
  }
});

function findInput(node) {
  if (node.tagName === 'input') return node;
  for (const child of node.children || []) {
    const found = findInput(child);
    if (found) return found;
  }
  return null;
}
