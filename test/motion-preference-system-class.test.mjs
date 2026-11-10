// Motion-source unification: the OS reduced-motion hint is honored only under an explicit
// System preference — never alone. An explicit Full keeps its motion on a reduce-OS machine;
// an explicit Reduce keeps its stillness on a full-motion one. The preference resolves to the
// html.sf-reduce-motion class (the one source every component reads); html.sf-motion-system marks
// the System choice so CSS can scope its own media-query rules to it.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { applyAccessibility } from '../src/ui/accessibility.js';
import { dpReducedMotion } from '../src/ui/deckplate/motion.js';

function fakeRoot() {
  const classes = new Set();
  return {
    classList: {
      add(...names) { names.forEach((name) => name && classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        if (force === undefined) force = !classes.has(name);
        if (force) classes.add(name);
        else classes.delete(name);
        return !!force;
      },
    },
    style: { setProperty() {}, removeProperty() {} },
    has(name) { return classes.has(name); },
  };
}

// One mutable query object per media string: accessibility.js caches the query on first bind,
// so per-case OS variation works by flipping `matches` between applies.
const queries = new Map();
function fakeMatchMedia(query) {
  if (!queries.has(query)) {
    queries.set(query, {
      matches: false,
      addEventListener() {},
      addListener() {},
      removeEventListener() {},
      removeListener() {},
    });
  }
  return queries.get(query);
}

const prevDocument = globalThis.document;
const prevWindow = globalThis.window;
const prevMatchMedia = globalThis.matchMedia;
const docElement = fakeRoot();

before(() => {
  globalThis.window = { matchMedia: fakeMatchMedia };
  globalThis.document = { documentElement: docElement, getElementById: () => null };
  // Deckplate must not consult this at all: pinned true so any direct read fails the test.
  globalThis.matchMedia = () => ({ matches: true });
});

after(() => {
  if (prevDocument === undefined) delete globalThis.document;
  else globalThis.document = prevDocument;
  if (prevWindow === undefined) delete globalThis.window;
  else globalThis.window = prevWindow;
  if (prevMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = prevMatchMedia;
});

function settingsWith(preference) {
  const settings = { accessibility: {}, video: {} };
  if (preference !== undefined) settings.accessibility.motionPreference = preference;
  return settings;
}

function setOsReduced(reduced) {
  fakeMatchMedia('(prefers-reduced-motion: reduce)').matches = !!reduced;
}

test('default preference with the OS hint stays full and marks no class', () => {
  setOsReduced(true);
  const root = fakeRoot();
  const result = applyAccessibility(settingsWith(undefined), root);
  assert.equal(result.motionPreference, 'full');
  assert.equal(result.motionReduced, false);
  assert.equal(root.has('sf-reduce-motion'), false);
  assert.equal(root.has('sf-motion-system'), false);
});

test('explicit full keeps its motion on a reduce-OS machine', () => {
  setOsReduced(true);
  const root = fakeRoot();
  const result = applyAccessibility(settingsWith('full'), root);
  assert.equal(result.motionReduced, false);
  assert.equal(root.has('sf-reduce-motion'), false);
  assert.equal(root.has('sf-motion-system'), false);
});

test('system follows the OS hint on and marks the choice', () => {
  setOsReduced(true);
  const root = fakeRoot();
  const result = applyAccessibility(settingsWith('system'), root);
  assert.equal(result.motionReduced, true);
  assert.equal(root.has('sf-reduce-motion'), true);
  assert.equal(root.has('sf-motion-system'), true);
});

test('system stays full on a full-motion OS but still marks the choice', () => {
  setOsReduced(false);
  const root = fakeRoot();
  const result = applyAccessibility(settingsWith('system'), root);
  assert.equal(result.motionReduced, false);
  assert.equal(root.has('sf-reduce-motion'), false);
  assert.equal(root.has('sf-motion-system'), true);
});

test('explicit reduce keeps its stillness on a full-motion OS', () => {
  setOsReduced(false);
  const root = fakeRoot();
  const result = applyAccessibility(settingsWith('reduce'), root);
  assert.equal(result.motionReduced, true);
  assert.equal(root.has('sf-reduce-motion'), true);
  assert.equal(root.has('sf-motion-system'), false);
});

test('deckplate reads the game setting, never the OS query', () => {
  // globalThis.matchMedia is pinned to matches:true above: any direct read returns reduced.
  docElement.classList.remove('sf-reduce-motion');
  assert.equal(dpReducedMotion(), false);
  docElement.classList.add('sf-reduce-motion');
  assert.equal(dpReducedMotion(), true);
  docElement.classList.remove('sf-reduce-motion');
});
