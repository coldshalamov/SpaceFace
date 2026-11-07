import test from 'node:test';
import assert from 'node:assert/strict';
import { words } from '../src/ui/kit/dom.js';
import { fakeDom, findButtons } from './helpers/fake-dom.mjs';

function environment() {
  const previous = globalThis.document;
  const doc = fakeDom();
  let direction = 'column';
  doc.defaultView = { getComputedStyle: () => ({ flexDirection: direction }) };
  const make = doc.createElement;
  const reveals = [];
  doc.createElement = tag => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.contains = target => node === target || node.children.some(child => child.contains?.(target));
    node.focus = () => {
      doc.activeElement = node;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
        for (const listener of ancestor.listeners.focusin || []) listener({ target: node });
      }
    };
    node.scrollIntoView = options => reveals.push({ node, options });
    return node;
  };
  globalThis.document = doc;
  return { doc, reveals, direction: value => { direction = value; },
    restore: () => { globalThis.document = previous; } };
}

function press(list, key) {
  const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const listener of list.listeners.keydown || []) listener(event);
  return event;
}

const entries = [
  { action: 'controls', label: 'Controls', current: true },
  { action: 'unavailable', label: 'Unavailable', disabled: true },
  { action: 'commodities', label: 'Commodities' },
  { action: 'factions', label: 'Factions' },
];

test('responsive categories follow the visible axis, reveal keyboard focus, and keep manual activation', async () => {
  const env = environment();
  try {
    const picked = [];
    const list = words(entries, { followLayout: true, onPick: action => picked.push(action) });
    list.setAttribute('role', 'tablist');
    await Promise.resolve();
    const buttons = findButtons(list);
    assert.equal(list.getAttribute('aria-orientation'), 'vertical');
    buttons[0].focus();
    assert.equal(env.reveals.length, 0, 'focusing a pointer target does not move it before pointerup');
    assert.equal(press(list, 'ArrowDown').defaultPrevented, true);
    assert.equal(env.doc.activeElement, buttons[2], 'vertical navigation skips unavailable categories');
    assert.equal(env.reveals.at(-1).node, buttons[2]);
    assert.deepEqual(env.reveals.at(-1).options, { block: 'nearest', inline: 'nearest', behavior: 'auto' });
    assert.deepEqual(picked, [], 'navigation alone does not replace the active panel');

    // Resize without remounting: the same focused tab and button objects remain alive.
    env.direction('row');
    assert.equal(press(list, 'ArrowRight').defaultPrevented, true);
    assert.equal(env.doc.activeElement, buttons[3]);
    assert.equal(list.getAttribute('aria-orientation'), 'horizontal');
    assert.equal(press(list, 'ArrowDown').defaultPrevented, false, 'the other axis remains available for scrolling');
    assert.equal(env.doc.activeElement, buttons[3]);
    buttons[3].click();
    assert.deepEqual(picked, ['factions'], 'native button activation still selects the category');
    press(list, 'Home');
    assert.equal(env.doc.activeElement, buttons[0]);
    press(list, 'End');
    assert.equal(env.doc.activeElement, buttons[3]);
    assert.equal(buttons.filter(button => button.tabIndex === 0).length, 1, 'exactly one Tab entry remains');
    assert.equal(buttons[1].tabIndex, -1, 'disabled categories never become the entry');

    const beforePointerFocus = env.reveals.length;
    buttons[2].focus();
    assert.equal(env.reveals.length, beforePointerFocus, 'pointer focus after navigation still does not scroll');
    env.direction('column');
    press(list, 'ArrowUp');
    assert.equal(env.doc.activeElement, buttons[0]);
    assert.equal(list.getAttribute('aria-orientation'), 'vertical');
  } finally {
    env.restore();
  }
});

test('ordinary words retain their explicit navigation axis', () => {
  const env = environment();
  try {
    const list = words(entries, { row: true });
    const buttons = findButtons(list);
    buttons[0].focus();
    assert.equal(press(list, 'ArrowDown').defaultPrevented, false);
    press(list, 'ArrowRight');
    assert.equal(env.doc.activeElement, buttons[2]);
    assert.equal(env.reveals.length, 0, 'responsive behavior is opt-in');
  } finally {
    env.restore();
  }
});
