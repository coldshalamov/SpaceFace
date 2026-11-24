// The loading detail line is counted sub-progress rewritten every few hundred milliseconds.
// Boot used to run that line through decrypt(), so a player always read it mid-scramble
// ("Placin… 9▘/ 0▟"). The words the presenter writes must stay on screen exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBootVisualizer } from '../src/ui/bootVisualizer.js';
import { plainWorkDetail } from '../src/ui/loadingPresenter.js';

const GLYPHS = /[▚▞▖▗▘▝▙▟]/;

class RecordingObserver {
  constructor(cb) { this.cb = cb; this.target = null; }
  observe(target) {
    this.target = target;
    (target._mos || (target._mos = [])).push(this);
  }
  disconnect() {
    if (!this.target?._mos) return;
    this.target._mos = this.target._mos.filter((o) => o !== this);
  }
  takeRecords() { return []; }
}

function detailNode() {
  const node = {
    _text: '',
    history: [],
    classes: new Set(),
    animations: [],
    _mos: [],
    classList: null,
  };
  node.classList = {
    contains: (v) => node.classes.has(v),
    add: (v) => node.classes.add(v),
    remove: (v) => node.classes.delete(v),
  };
  Object.defineProperty(node, 'textContent', {
    get() { return node._text; },
    set(v) {
      const next = v == null ? '' : String(v);
      if (next === node._text) return;
      node._text = next;
      node.history.push(next);
      const obs = node._mos.slice();
      queueMicrotask(() => { for (const o of obs) o.cb([]); });
    },
  });
  node.animate = (keyframes, options) => {
    node.animations.push({ keyframes, options, text: node._text });
    return { cancel() {} };
  };
  return node;
}

function hostFor() {
  const timers = new Map();
  let timer = 0;
  return {
    timers,
    setTimeout(fn) { timers.set(++timer, fn); return timer; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { timers.set(++timer, fn); return timer; },
    clearInterval(id) { timers.delete(id); },
    matchMedia: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
}

function world({ reduced = false } = {}) {
  class Element extends EventTarget {
    constructor() {
      super();
      this.style = {};
      this.dataset = {};
      this.attrs = new Map();
      this.classes = new Set();
      this.classList = {
        contains: (v) => this.classes.has(v),
        add: (v) => this.classes.add(v),
        remove: (v) => this.classes.delete(v),
      };
    }
    setAttribute(k, v) { this.attrs.set(k, v); }
    insertBefore() {}
    querySelector() { return null; }
  }
  class Video extends Element {
    constructor() {
      super();
      this.currentTime = 0;
      this.duration = 17.5;
      this.readyState = 4;
      this.paused = true;
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
    requestVideoFrameCallback() { return 1; }
    cancelVideoFrameCallback() {}
  }
  const overlay = new Element();
  const video = new Video();
  const html = new Element();
  if (reduced) html.classes.add('sf-reduce-motion');
  const detail = detailNode();
  overlay.querySelector = (sel) => (sel === '[data-loading-detail]' ? detail : null);
  const document = new Element();
  const host = hostFor();
  Object.assign(document, {
    defaultView: host,
    documentElement: html,
    hidden: false,
    createElement: () => new Element(),
    getElementById: (id) => (id === 'boot-overlay' ? overlay : id === 'boot-intro-video' ? video : null),
  });
  return { document, host, detail };
}

const rafQueue = [];
function pump(now) {
  const pending = rafQueue.splice(0);
  for (const cb of pending) cb(now);
}
async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

const prevRAF = globalThis.requestAnimationFrame;
const prevMO = globalThis.MutationObserver;

test('counted loading detail stays the presenter sentence, never glyph noise', async (t) => {
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.MutationObserver = RecordingObserver;
  t.after(() => {
    if (prevRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRAF;
    if (prevMO === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = prevMO;
  });

  const lines = [3, 9, 17].map((done) => plainWorkDetail(
    { kind: 'programs', completed: done, total: 40 },
    { total: 40, milestones: 0 },
  ));
  assert.deepEqual(lines, [
    'Compiling the shaders — 3 of 40',
    'Compiling the shaders — 9 of 40',
    'Compiling the shaders — 17 of 40',
  ]);

  const w = world();
  const viz = getBootVisualizer(w.document);
  t.after(() => viz.destroy());
  let now = 0;
  for (const line of lines) {
    w.detail.textContent = line;
    await flush();
    // The old decrypt resolved over ~220 ms. Pump that whole window between writes,
    // which is how often the counted line actually moves.
    for (let i = 0; i < 8; i += 1) { now += 40; pump(now); }
  }
  await flush();
  const authored = new Set(lines);
  for (const seen of w.detail.history) {
    assert.equal(GLYPHS.test(seen), false, seen);
    assert.ok(authored.has(seen), `detail left the authored sentence: ${seen}`);
  }
  assert.equal(w.detail.textContent, lines[lines.length - 1]);
  assert.equal(w.detail.animations.length, 1, 'the arrival fade runs once, not on every count');
  assert.equal(w.detail.animations[0].text, lines[0]);
  assert.deepEqual(w.detail.animations[0].keyframes.map((f) => Object.keys(f).sort()), [['opacity'], ['opacity']]);
});

test('a startup failure sentence on the detail line is not rewritten', async (t) => {
  globalThis.MutationObserver = RecordingObserver;
  t.after(() => {
    if (prevMO === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = prevMO;
  });
  const w = world();
  const viz = getBootVisualizer(w.document);
  t.after(() => viz.destroy());
  const sentence = 'Reload to retry. Your saved games have not been changed. (Unexpected token)';
  w.detail.classList.add('boot-error');
  w.detail.textContent = sentence;
  await flush();
  pump(0);
  pump(200);
  assert.equal(w.detail.textContent, sentence);
  assert.equal(w.detail.animations.length, 0);
  assert.deepEqual(w.detail.history, [sentence]);
});
