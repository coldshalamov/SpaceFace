// G16-04 — the boss readout (name, act, move, counter) sits on the shared flight-glass plate and its
// counter wraps to at most three lines; the full authored text stays in the node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';
import { mountCapitalBossOverlay, READOUT_PLATE, COUNTER_CLAMP } from '../src/ui/capitalBossOverlayMount.js';

test('every pooled boss readout is a glass plate with a three-line counter', () => {
  const doc = fakeDom();
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const el = create(tag);
    el.remove = () => { const p = el.parentNode; if (p) p.children.splice(p.children.indexOf(el), 1); };
    if (tag === 'canvas') { el.width = 0; el.height = 0; el.getContext = () => ({ setTransform() {}, clearRect() {} }); }
    return el;
  };
  const root = doc.createElement('div');
  root.clientWidth = 1280; root.clientHeight = 720;
  const prevDoc = globalThis.document; const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  try {
    const bus = { on: () => () => {}, off() {}, emit() {} };
    const mount = mountCapitalBossOverlay({ root, bus, state: {}, helpers: {} });
    const groups = findAll(root, (n) => n.className === 'sf-cboss-readout');
    assert.equal(groups.length, 3);
    for (const g of groups) {
      assert.match(g.style.cssText, /background:var\(--dp-glass-flight/, 'on the flight-glass plate');
      assert.match(g.style.cssText, /max-width:340px/, 'with a measure');
      const counter = g.children[3];
      assert.match(counter.style.cssText, /-webkit-line-clamp:3/, 'counter wraps to three lines');
      assert.match(counter.style.cssText, /white-space:normal/);
    }
    mount.destroy();
  } finally { globalThis.document = prevDoc; globalThis.window = prevWin; }
  assert.match(READOUT_PLATE, /border-radius/);
  assert.match(COUNTER_CLAMP, /line-clamp:3/);
});
