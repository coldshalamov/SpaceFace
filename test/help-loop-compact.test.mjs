import test from 'node:test';
import assert from 'node:assert/strict';
import { helpScreen } from '../src/ui/screens/help.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function mountLoops(width, height) {
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.ResizeObserver;
  const doc = fakeDom(); const create = doc.createElement;
  let box = { width, height }; let resize; let disconnected = false;
  doc.createElement = tag => {
    const node = create(tag); let text = '';
    Object.defineProperty(node, 'textContent', {
      get: () => text + node.children.map(child => child.textContent).join(''),
      set(value) { text = String(value); node.children = []; },
    });
    node.ownerDocument = doc;
    Object.defineProperty(node, 'clientWidth', { get: () => box.width });
    Object.defineProperty(node, 'clientHeight', { get: () => box.height });
    node.offsetTop = 0; node.offsetWidth = 0; node.offsetHeight = 16;
    node.getBoundingClientRect = () => ({ left: 0, top: 0, ...box });
    node.removeEventListener = (name, fn) => { node.listeners[name] = (node.listeners[name] || []).filter(item => item !== fn); };
    node.focus = () => { doc.activeElement = node; };
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.createTextNode = text => { const node = doc.createElement('#text'); node.textContent = text; return node; };
  globalThis.document = doc;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const screen = Object.create(helpScreen);
  screen._body = doc.createElement('section'); screen._loop = 0;
  const view = screen._renderLoops();
  const host = screen._body.children[0];
  const buttons = findAll(host, node => node.getAttribute('role') === 'option');
  const byClass = cls => findAll(host, node => node.classList.contains(cls))[0];
  return { screen, host, buttons, doc, byClass,
    resize(width, height) { box = { width, height }; resize(); },
    dispose() { view.dispose(); },
    get disconnected() { return disconnected; },
    restore() { view.dispose(); globalThis.document = previousDocument; globalThis.ResizeObserver = previousObserver; },
  };
}

test('the actual Help Loops content stays readable and selectable in the measured 793×258 host', () => {
  const h = mountLoops(793, 258);
  try {
    assert.equal(h.host.classList.contains('is-off'), false);
    assert.equal(h.host.classList.contains('is-compact'), true);
    assert.equal(h.buttons.length, 6);
    assert.equal(h.byClass('orr-hloop__title').textContent, 'Dock and choose work');
    assert.ok(h.byClass('orr-hloop__steps').children.length > 0);
    assert.ok(h.byClass('orr-hloop__why').textContent.length > 0);
    assert.ok(h.buttons.every(button => button.getAttribute('aria-label')));
    h.buttons[3].click();
    assert.equal(h.screen._loop, 3);
    assert.equal(h.buttons[3].getAttribute('aria-selected'), 'true');
    assert.equal(h.buttons[3].tabIndex, 0);
    assert.equal(h.byClass('orr-hloop__title').textContent, h.buttons[3].getAttribute('aria-label').replace(/^\d+\. /, ''));
    let prevented = false;
    h.buttons[3].listeners.keydown[0]({ key: 'ArrowRight', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.screen._loop, 4);
    assert.equal(h.doc.activeElement, h.buttons[4]);
    assert.equal(h.buttons[4].getAttribute('aria-selected'), 'true');
  } finally { h.restore(); }
});

test('compact mode preserves selection through full-ring and zero-size resize, then releases its observer', () => {
  const h = mountLoops(793, 258);
  try {
    h.buttons[2].click(); const title = h.byClass('orr-hloop__title').textContent;
    h.resize(793, 260);
    assert.equal(h.host.classList.contains('is-off'), false);
    assert.equal(h.host.classList.contains('is-compact'), false, 'the existing fitting threshold still draws the ring');
    assert.equal(h.byClass('orr-hloop__title').textContent, title);
    h.resize(320, 500);
    assert.equal(h.host.classList.contains('is-compact'), true, 'narrow hosts also retain the same authored reading');
    h.resize(0, 0);
    assert.equal(h.host.classList.contains('is-off'), true);
    h.resize(793, 258);
    assert.equal(h.host.classList.contains('is-off'), false);
    assert.equal(h.host.classList.contains('is-compact'), true);
    assert.equal(h.byClass('orr-hloop__title').textContent, title);
    h.dispose();
    assert.equal(h.disconnected, true);
    assert.equal(h.host.children.length, 0);
    assert.equal(h.host.classList.contains('is-compact'), false);
    assert.equal(h.host.listeners.wheel.length, 0);
  } finally { h.restore(); }
});
