import test from 'node:test';
import assert from 'node:assert/strict';
import { injectMetaLedgerLayouts } from '../src/ui/orrery/achievementsLayouts.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('meta-ledger styles retain post-sidecar order after visiting Statistics first', () => {
  const doc = fakeDom();
  // Browser appendChild moves an existing node; model that behavior in the shared minimal DOM.
  const append = doc.head.appendChild.bind(doc.head);
  let appends = 0;
  doc.head.appendChild = node => {
    appends += 1;
    const index = doc.head.children.indexOf(node);
    if (index >= 0) doc.head.children.splice(index, 1);
    return append(node);
  };
  Object.defineProperty(doc.head, 'lastElementChild', { get: () => doc.head.children.at(-1) });

  injectMetaLedgerLayouts(doc); // Statistics opened first.
  const style = doc.getElementById('orr-meta-ledger-layouts');
  assert.ok(style);
  const css = style.textContent;
  const sidecar = doc.createElement('link');
  sidecar.id = 'constellation-sidecar';
  doc.head.appendChild(sidecar); // Achievements finishes loading its sidecar later.
  injectMetaLedgerLayouts(doc);
  assert.equal(doc.head.lastElementChild, style, 'the existing override follows the later sidecar');
  assert.equal(style.textContent, css, 'reordering preserves the authored stylesheet');
  assert.equal(doc.head.children.filter(node => node.id === style.id).length, 1, 'the style is never duplicated');
  const before = appends;
  injectMetaLedgerLayouts(doc);
  assert.equal(appends, before, 'an already-last stylesheet remains untouched');
});
