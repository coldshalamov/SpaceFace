import assert from 'node:assert/strict';
import test from 'node:test';

import { automationScreen } from '../src/ui/screens/automationPanel.js';

for (const control of [
  { action: 'buildOutpost', ref: 'outpost_refinery', label: 'Build Outpost' },
  { action: 'decommission', ref: 'outpost_alpha', label: 'Decommission' },
]) {
  test(`production telemetry refresh preserves focus on ${control.label}`, () => {
    const documentFixture = installDocument();
    const body = documentFixture.createElement('div');
    documentFixture.body.appendChild(body);

    const original = makeActionButton(documentFixture, control);
    body.appendChild(original);
    original.focus();
    assert.strictEqual(documentFixture.activeElement, original, 'fixture starts on the player control');

    const state = {
      player: {},
      automation: {
        outposts: [{ production: { actualRate: 0 } }],
      },
    };
    const screen = Object.create(automationScreen);
    screen._ctx = { state };
    screen._root = body;
    screen._tab = 'outposts';
    screen._els = { body, tabs: [] };
    screen._bodySig = '0';
    screen._syncHeader = () => {};
    screen._syncTabs = () => {};
    screen._bodySignature = () => String(state.automation.outposts[0].production.actualRate);
    screen._renderOperationsBoard = () => {};
    let renderCount = 0;
    screen._renderOutposts = (fragment) => {
      renderCount += 1;
      fragment.appendChild(makeActionButton(documentFixture, control));
    };

    state.automation.outposts[0].production.actualRate = 0.5;
    screen.refresh(screen._ctx);

    assert.equal(renderCount, 1, 'changed production telemetry triggers one body render');
    assert.equal(original.isConnected, false, 'the old rendered control is detached');
    const replacement = body.querySelectorAll('button')[0];
    assert.notStrictEqual(replacement, original, 'telemetry refresh legitimately replaces the rendered body');
    assert.strictEqual(documentFixture.activeElement, replacement,
      'the equivalent live control regains keyboard/controller focus after the telemetry render');
  });
}

function installDocument() {
  const documentFixture = {
    activeElement: null,
    createDocumentFragment() { return new FakeElement('#fragment', documentFixture); },
    createElement(tagName) { return new FakeElement(tagName, documentFixture); },
  };
  documentFixture.body = documentFixture.createElement('body');
  documentFixture.activeElement = documentFixture.body;
  globalThis.document = documentFixture;
  return documentFixture;
}

function makeActionButton(documentFixture, { action, ref, label }) {
  const button = documentFixture.createElement('button');
  button.dataset.act = action;
  button.dataset.ref = ref;
  button.dataset.kind = 'outpost';
  button.textContent = label;
  return button;
}

class FakeElement {
  constructor(tagName, documentFixture) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = documentFixture;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.id = '';
    this.name = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.isConnected = true;
    this.textContent = '';
  }

  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      for (const nested of [...child.children]) this.appendChild(nested);
      child.children.length = 0;
      return child;
    }
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.disconnect();
    this.children.length = 0;
    for (const node of nodes) this.appendChild(node);
  }

  disconnect() {
    this.isConnected = false;
    for (const child of this.children) child.disconnect();
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
  }

  focus() { this.ownerDocument.activeElement = this; }

  contains(candidate) {
    for (let node = candidate; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  closest() { return null; }

  querySelectorAll(selector) {
    const matches = [];
    const wantsButton = selector === 'button' || selector.includes('button');
    const wantsDetails = selector.startsWith('details');
    const walk = (node) => {
      for (const child of node.children) {
        if (wantsButton && child.tagName === 'BUTTON') matches.push(child);
        if (wantsDetails && child.tagName === 'DETAILS') matches.push(child);
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
}
