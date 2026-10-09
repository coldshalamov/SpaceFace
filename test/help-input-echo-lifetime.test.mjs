import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputEcho } from '../src/ui/orrery/helpRig.js';

class Events {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}

test('prewarmed and closed Help never echoes flight or Windows keys', () => {
  const win = new Events();
  win.navigator = { getGamepads: () => [] };
  const doc = new Events();
  doc.defaultView = win;
  const root = new Events();
  root.ownerDocument = doc;
  root.isConnected = true;
  root.inert = true;
  root.getAttribute = name => name === 'aria-hidden' ? String(root.inert) : null;
  root.closest = () => null;
  root.contains = () => true;
  const inputs = [];
  const echo = createInputEcho({ root, onInput: ev => inputs.push(ev) });
  try {
    doc.dispatch('keydown', { code: 'MetaLeft' });
    doc.dispatch('pointermove', { clientX: 600, clientY: 300 });
    assert.deepEqual(inputs, []);
    assert.equal(echo.pointer(), null);
    root.inert = false;
    doc.dispatch('keydown', { code: 'KeyG' });
    doc.dispatch('keyup', { code: 'KeyG' });
    assert.deepEqual(inputs.map(x => [x.code, x.down]), [['KeyG', true], ['KeyG', false]]);
    root.inert = true;
    doc.dispatch('keydown', { code: 'MetaLeft' });
    doc.dispatch('pointerup', { pointerType: 'mouse', button: 0 });
    assert.equal(inputs.length, 2);
  } finally { echo.dispose(); }
  assert.equal([...win.listeners.values(), ...doc.listeners.values(), ...root.listeners.values()].some(x => x.size), false);
});
