import assert from 'node:assert/strict';
import { test } from 'node:test';

import { syncScrollExtent } from '../src/ui/orrery/scrollExtent.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function mountScroller(doc) {
  const host = doc.createElement('div');
  const element = doc.createElement('div');
  host.appendChild(element);
  element.ownerDocument = doc;
  element.querySelector = () => element.children.find((child) => child.classList.contains('orr-extent')) ?? null;
  const layout = { height: 240, content: 720, rect: { top: 100, bottom: 340, left: 20, right: 420 } };
  const reads = { scroll: 0, client: 0, bounds: 0 };
  Object.defineProperties(element, {
    scrollHeight: { get() { reads.scroll++; return layout.content; } },
    clientHeight: { get() { reads.client++; return layout.height; } },
  });
  element.getBoundingClientRect = () => { reads.bounds++; return layout.rect; };
  element.scrollTop = 0;
  return { element, layout, reads };
}

function cue(element) {
  const rail = element.firstChild.style;
  const foot = element.nextElementSibling.style;
  return {
    overflow: element.getAttribute('data-overflow'),
    end: element.dataset.extEnd,
    thumbTop: rail['--orr-ext-top'],
    thumbHeight: rail['--orr-ext-h'],
    left: foot.left,
    top: foot.top,
  };
}

test('same-frame syncs share one post-layout paint per scroller and keep immediate scroll and resize cues', (t) => {
  const callbacks = [];
  const resize = new Map();
  const globals = {
    getComputedStyle: (element) => ({ position: element.style.position || 'static' }),
    requestAnimationFrame: (callback) => callbacks.push(callback),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(element) { resize.set(element, this.callback); }
    },
    innerWidth: 1440,
    innerHeight: 900,
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const flush = () => { for (const callback of callbacks.splice(0)) callback(); };
  const doc = fakeDom();
  const { element, layout, reads } = mountScroller(doc);

  for (let sync = 0; sync < 24; sync++) syncScrollExtent(element);
  assert.deepEqual(reads, { scroll: 24, client: 24, bounds: 24 }, 'sync still measures and paints immediately');
  assert.deepEqual(cue(element), {
    overflow: '1', end: '0', thumbTop: '0px', thumbHeight: '80px', left: '328px', top: '318px',
  });

  layout.height = 300;
  layout.rect = { top: 100, bottom: 400, left: 20, right: 430 };
  flush();
  assert.deepEqual(reads, { scroll: 25, client: 25, bounds: 25 }, 'only one deferred paint reads the updated layout');
  assert.deepEqual(cue(element), {
    overflow: '1', end: '0', thumbTop: '0px', thumbHeight: '125px', left: '338px', top: '378px',
  });

  const second = mountScroller(doc);
  syncScrollExtent(element);
  syncScrollExtent(second.element);
  assert.equal(callbacks.length, 2, 'the next frame schedules one callback for each scroller');
  flush();
  assert.equal(reads.bounds, 27);
  assert.equal(second.reads.bounds, 2);

  element.scrollTop = 420;
  for (const listener of element.listeners.scroll) listener();
  assert.equal(element.listeners.scroll.length, 1);
  assert.equal(cue(element).end, '1', 'scroll hides MORE immediately at the bottom');
  assert.equal(cue(element).thumbTop, '175px');

  layout.content = 306;
  resize.get(element)();
  assert.equal(cue(element).overflow, '0', 'resize removes the cue immediately when content fits');
  assert.equal(cue(element).thumbHeight, '0px');
  assert.equal(callbacks.length, 0, 'scroll and resize paint without scheduling a second pass');
});
