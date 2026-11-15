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

test('a queued hidden station is promoted when it starts opening', () => {
  const observers = [];
  const frames = [];
  const idle = [];
  const reads = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() {}
  }
  const win = {
    MutationObserver: Observer, performance: { now: () => 0 },
    requestAnimationFrame: cb => { frames.push(cb); return frames.length; },
    requestIdleCallback: cb => { idle.push(cb); return idle.length; },
    getComputedStyle: () => { reads.push('station'); return { textTransform: 'none' }; },
  };
  const doc = { defaultView: win, getElementById: () => host, createTreeWalker: () => ({ nextNode: () => null }) };
  const classes = new Set(['screen', 'sx-berth']);
  const station = {
    ownerDocument: doc, isConnected: true, nodeType: 1, tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml', dataset: {},
    childNodes: [{ nodeType: 3, nodeValue: 'Station' }],
    classList: { contains: value => classes.has(value) },
    closest: selector => selector.includes('.screen') ? station : null,
    contains: node => node === station, style: { setProperty() {} },
  };
  const host = { children: [station] };
  installTypeGovernor(doc);
  assert.equal(idle.length, 1);
  const visibility = observers.find(observer => observer.targets.some(({ target, options }) => target === station && options.attributes));
  assert.ok(visibility, 'the screen root must be watched for opening');
  classes.add('sf-screen--entering');
  visibility.callback([{ type: 'attributes', target: station }]);
  assert.equal(frames.length, 1, 'opening moves pending type work to the next frame');
  frames.shift()();
  assert.deepEqual(reads, ['station']);
});
