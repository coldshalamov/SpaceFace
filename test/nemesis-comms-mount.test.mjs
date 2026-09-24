import assert from 'node:assert/strict';
import test from 'node:test';

import { mountNemesisComms } from '../src/ui/nemesisComms.js';

// Minimal DOM double: just enough surface for the mount path (create/append/closest/
// query/remove). closest() resolves through the live parent chain like the real one,
// so a structural claimInput can tell attached from detached.
function fakeElement(tag, { id = null } = {}) {
  const el = {
    tag,
    id,
    parent: null,
    children: [],
    hidden: false,
    attributes: {},
    listeners: {},
    textContent: '',
    ownerDocument: null,
    setAttribute(name, value) { el.attributes[name] = value; },
    appendChild(child) {
      child.parent = el;
      child.ownerDocument = el.ownerDocument;
      el.children.push(child);
      return child;
    },
    remove() {
      if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
      el.parent = null;
    },
    closest(selector) {
      const wantId = selector.startsWith('#') ? selector.slice(1) : null;
      let node = el;
      while (node) {
        if (wantId && node.id === wantId) return node;
        node = node.parent;
      }
      return null;
    },
    querySelector() {
      return {
        textContent: '',
        hidden: false,
        addEventListener() {},
        removeEventListener() {},
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

function fakeDocument() {
  const doc = {
    root: fakeElement('html'),
    createElement(tag) {
      const el = fakeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
  };
  doc.root.ownerDocument = doc;
  return doc;
}

function fakeBus() {
  return { on() { return () => {}; }, emit() {} };
}

test('nemesis comms mounts under a structural #ui-root gate', () => {
  // PQ-033.02: the production claimInput throws unless panel.closest('#ui-root')
  // resolves, but the mount claimed before appending — every boot warned and the
  // surrender panel never mounted at all.
  const doc = fakeDocument();
  const uiRoot = doc.createElement('div');
  uiRoot.id = 'ui-root';
  doc.root.appendChild(uiRoot);
  let claimedAttached = false;
  let released = 0;
  const view = mountNemesisComms({
    root: uiRoot,
    bus: fakeBus(),
    state: { nemesis: null },
    claimInput(panel) {
      claimedAttached = panel.closest('#ui-root') === uiRoot;
      if (!claimedAttached) throw new Error('must mount inside #ui-root to fence flight input');
      return () => { released += 1; };
    },
  });
  assert.equal(claimedAttached, true);
  assert.equal(uiRoot.children.includes(view.element), true);
  view.dispose();
  assert.equal(released, 1);
  assert.equal(uiRoot.children.includes(view.element), false);
});

test('a failed nemesis comms claim leaves nothing attached', () => {
  const doc = fakeDocument();
  const uiRoot = doc.createElement('div');
  uiRoot.id = 'ui-root';
  doc.root.appendChild(uiRoot);
  assert.throws(() => mountNemesisComms({
    root: uiRoot,
    bus: fakeBus(),
    state: { nemesis: null },
    claimInput() { throw new Error('gate refuses'); },
  }), /gate refuses/);
  assert.equal(uiRoot.children.length, 0);
  assert.throws(() => mountNemesisComms({
    root: uiRoot,
    bus: fakeBus(),
    state: { nemesis: null },
    claimInput() { return 'not-a-function'; },
  }), /must return its cleanup function/);
  assert.equal(uiRoot.children.length, 0);
});
