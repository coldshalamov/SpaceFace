import test from 'node:test';
import assert from 'node:assert/strict';
import { installTypeGovernor } from '../src/ui/orrery/typeGovernor.js';

test('a hidden station screen waits for idle while a visible screen is governed on the frame', () => {
  const frames = [];
  const idle = [];
  const reads = [];
  class Observer { observe() {} disconnect() {} }
  const win = {
    MutationObserver: Observer,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { frames.push(cb); return frames.length; },
    requestIdleCallback: cb => { idle.push(cb); return idle.length; },
    getComputedStyle: el => {
      reads.push(el.name);
      return { textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0px', fontStretch: '100%', fontWeight: '500' };
    },
  };
  const doc = {
    defaultView: win,
    getElementById: id => id === 'screens' ? host : null,
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  function screen(name, classes) {
    const cls = new Set(classes);
    const el = {
      name, ownerDocument: doc, isConnected: true, nodeType: 1, tagName: 'DIV',
      namespaceURI: 'http://www.w3.org/1999/xhtml', dataset: {},
      childNodes: [{ nodeType: 3, nodeValue: name }],
      classList: { contains: value => cls.has(value) },
      closest: selector => selector.split(',').some(part => cls.has(part.trim().replace(/^.*\s/, '').replace(/^\./, ''))) ? el : null,
      style: { setProperty() {} },
    };
    return el;
  }
  const host = { children: [screen('station', ['screen', 'sx-berth']), screen('menu', ['screen', 'k-screen', 'sf-screen--visible'])] };
  installTypeGovernor(doc);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(reads, ['menu'], 'the hidden station must not be measured in the visible frame');
  assert.equal(idle.length, 1, 'the hidden station is prewarmed in an idle slice');
  idle.shift()();
  assert.deepEqual(reads, ['menu', 'station']);
});
