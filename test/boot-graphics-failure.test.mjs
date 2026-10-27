import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeFailurePresenter, describeBootFailure } from '../src/ui/runtimeFailurePresenter.js';
import { fakeDom, findAll, textLines } from './helpers/fake-dom.mjs';

function enhanceNode(node, focused) {
  node.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(node.attributes, name);
  node.removeAttribute = (name) => { delete node.attributes[name]; };
  node.removeChild = (child) => {
    const index = node.children.indexOf(child);
    if (index >= 0) node.children.splice(index, 1);
    child.parentNode = null;
    return child;
  };
  node.contains = (other) => {
    for (let cur = other; cur; cur = cur.parentNode) {
      if (cur === node) return true;
    }
    return false;
  };
  const matches = (n, selector) => {
    if (selector.startsWith('.')) return n.className.split(/\s+/).includes(selector.slice(1));
    return n.tagName === selector;
  };
  const visit = (n, selector, out) => {
    for (const child of n.children || []) {
      if (matches(child, selector)) out.push(child);
      visit(child, selector, out);
    }
    return out;
  };
  node.querySelectorAll = (selector) => visit(node, selector, []);
  node.querySelector = (selector) => visit(node, selector, [])[0] || null;
  node.focus = () => { focused.push(node); };
  return node;
}

function createBootFixture() {
  const doc = fakeDom();
  const focused = [];
  const make = (tag) => enhanceNode(doc._make(tag), focused);
  doc.createElement = make;
  const host = {
    listeners: [],
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const index = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (index >= 0) this.listeners.splice(index, 1);
    },
    location: { reloads: 0, reload() { this.reloads++; } },
  };
  doc.defaultView = host;

  // The overlay carries a live loading shell: a lockup whose label must be hidden, not
  // deleted, when the recovery pane takes over — the failure must not sit beside "Loading…".
  const overlay = make('div');
  overlay.id = 'boot-overlay';
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-busy', 'true');
  const lockup = make('div');
  lockup.className = 'boot-lockup';
  lockup.textContent = 'Initializing systems…';
  overlay.appendChild(lockup);
  const hud = make('div');
  hud.id = 'hud';
  const screens = make('div');
  screens.id = 'screens';
  doc.head.appendChild(hud);
  doc.head.appendChild(screens);
  doc.head.appendChild(overlay);
  return { doc, host, overlay, lockup, hud, screens, focused };
}

function withDocument(doc, fn) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
}


test('the observed WebGL context-creation failure names graphics and offers a next step', () => {
  for (const message of [
    'Error creating WebGL context.',
    'THREE.WebGLRenderer: Error creating WebGL context.',
    'Error creating WebGL context with your selected attributes.',
  ]) {
    const spec = describeBootFailure(new Error(message));
    assert.equal(spec.code, 'BOOT_GRAPHICS_UNAVAILABLE');
    assert.equal(spec.headline, 'Graphics could not start');
    assert.match(spec.fills, /browser could not create a WebGL graphics context/);
    assert.match(spec.detail, /saved games are unaffected/i);
    assert.match(spec.detail, /restart your browser|another WebGL-capable browser/);
    assert.equal(spec.verbLabel, 'Retry');
  }
});

test('unrelated graphics, shader and unknown errors retain the existing fallback', () => {
  for (const message of [
    'WebGL shader compilation failed',
    'WebGL context lost',
    'Error creating WebGL context. Extra unrecognized diagnostic',
    'Failed loading WebGL texture',
    'Cannot read properties of undefined',
    '<img src=x onerror=alert(1)>',
  ]) {
    const spec = describeBootFailure(new Error(message));
    assert.equal(spec.code, 'BOOT_FAILED', message);
    assert.equal(spec.headline, 'SpaceFace could not finish starting');
    assert.equal(spec.fills, 'An error stopped startup before the main menu appeared.');
    assert.equal(spec.detail, 'Your saved games are unaffected. Retry the launch; the technical detail is in the console log.');
    assert.equal(spec.message, message);
  }
  assert.equal(describeBootFailure(null).code, 'BOOT_FAILED');
  assert.equal(describeBootFailure(new Error('Unable to load scenario contract')).code, 'BOOT_SCENARIO_UNAVAILABLE');
  assert.equal(describeBootFailure(new TypeError('Failed to fetch')).code, 'BOOT_SERVICE_UNAVAILABLE');
});

test('graphics recovery preserves Retry, focus trapping, inert background and cleanup without save access', () => {
  const fixture = createBootFixture();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { assert.fail('recovery must not access saved games'); },
  });
  let restarts = 0;
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc, host: fixture.host,
    onRestart() { restarts++; },
  });
  try {
    const spec = describeBootFailure(new Error('Error creating WebGL context.'));
    assert.equal(withDocument(fixture.doc, () => presenter.show(spec)), true);
    assert.equal(withDocument(fixture.doc, () => presenter.show(spec)), true);
    const panes = findAll(fixture.overlay, n => n.classList.contains('sf-state'));
    assert.equal(panes.length, 1, 'duplicate failures do not duplicate panes or listeners');
    const pane = panes[0];
    const verb = pane.sfStateVerb;
    assert.equal(pane.getAttribute('role'), 'alertdialog');
    assert.equal(pane.getAttribute('aria-modal'), 'true');
    assert.equal(pane.getAttribute('aria-labelledby'), pane.querySelector('.sf-state__head').id);
    assert.equal(pane.getAttribute('aria-describedby'), pane.querySelector('.sf-state__detail').id);
    assert.equal(verb.children[0].textContent, 'Retry');
    assert.equal(fixture.focused[0], verb);
    assert.equal(fixture.host.listeners.length, 1);
    assert.equal(restarts, 0, 'no automatic retry');
    assert.equal(fixture.host.location.reloads, 0);
    assert.equal(fixture.hud.getAttribute('inert'), '');
    assert.equal(fixture.screens.getAttribute('aria-hidden'), 'true');
    assert.equal(fixture.lockup.style.display, 'none');

    let prevented = 0, stopped = 0;
    fixture.host.listeners[0].fn({
      key: 'Tab', target: pane, shiftKey: true,
      preventDefault() { prevented++; },
      stopImmediatePropagation() { stopped++; },
    });
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
    const copy = pane.sfCopyButton;
    assert.equal(copy.children[0].textContent, 'Copy details', 'current diagnostic recovery remains available');
    assert.equal(fixture.focused.at(-1), copy, 'reverse Tab enters the last recovery control');
    const tab = (target, shiftKey = false) => fixture.host.listeners[0].fn({
      key: 'Tab', target, shiftKey,
      preventDefault() {}, stopImmediatePropagation() {},
    });
    tab(copy);
    assert.equal(fixture.focused.at(-1), verb, 'forward Tab wraps to Retry');
    tab(verb);
    assert.equal(fixture.focused.at(-1), copy, 'forward Tab reaches Copy details');
    tab(copy, true);
    assert.equal(fixture.focused.at(-1), verb, 'reverse Tab returns to Retry');
    for (const key of ['Enter', ' ', 'Spacebar']) {
      fixture.host.listeners[0].fn({
        key, target: verb,
        preventDefault() { assert.fail('native button activation must remain available'); },
        stopImmediatePropagation() {},
      });
    }
    verb.click();
    assert.equal(restarts, 1, 'only the explicit Retry invokes the existing restart hook');
    presenter.destroy();
    presenter.destroy();
    assert.equal(fixture.host.listeners.length, 0);
    assert.equal(fixture.overlay.children.length, 1);
    assert.equal(fixture.overlay.children[0], fixture.lockup);
    assert.equal(fixture.lockup.style.display, '');
    assert.equal(fixture.overlay.classList.contains('hidden'), true);
    assert.equal(fixture.overlay.getAttribute('aria-busy'), 'true');
    assert.equal(fixture.hud.hasAttribute('inert'), false);
    assert.equal(fixture.screens.hasAttribute('aria-hidden'), false);
    assert.equal(withDocument(fixture.doc, () => presenter.show(spec)), false);
  } finally {
    presenter.destroy();
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('raw stack and markup do not become visible recovery copy or executable markup', () => {
  for (const message of [
    'Error creating WebGL context.\n    at /private/path?secret=fixture-only',
    '<img src=x onerror=alert(1)>\n    at /private/path?secret=fixture-only',
  ]) {
    const fixture = createBootFixture();
    const presenter = createRuntimeFailurePresenter({ document: fixture.doc, host: fixture.host });
    try {
      const spec = describeBootFailure(new Error(message));
      assert.equal(spec.code, message.startsWith('Error creating') ? 'BOOT_GRAPHICS_UNAVAILABLE' : 'BOOT_FAILED');
      withDocument(fixture.doc, () => presenter.show(spec));
      const pane = findAll(fixture.overlay, n => n.classList.contains('sf-state'))[0];
      const visible = textLines(pane).join(' ');
      assert.doesNotMatch(visible, /private|secret|onerror|<img|Error creating WebGL context/);
      assert.equal(findAll(pane, n => n.tagName === 'img' || n.tagName === 'script').length, 0);
      assert.equal(findAll(pane, n => /onerror|private|secret/.test(n.innerHTML || '')).length, 0);
      assert.equal(pane.getAttribute('data-failure-message'), message.split('\n')[0],
        'existing diagnostic attribute remains inert data, not displayed HTML');
    } finally { presenter.destroy(); }
  }
});

test('the shared presenter still uses flight-interrupted defaults outside boot', () => {
  const fixture = createBootFixture();
  const presenter = createRuntimeFailurePresenter({ document: fixture.doc, host: fixture.host });
  try {
    withDocument(fixture.doc, () => presenter.show({ message: 'simulation failure' }));
    const pane = findAll(fixture.overlay, n => n.classList.contains('sf-state'))[0];
    assert.equal(pane.querySelector('.sf-state__word').textContent, 'FLIGHT INTERRUPTED');
    assert.equal(pane.querySelector('.sf-state__head').textContent, 'Flight interrupted');
    assert.equal(pane.querySelector('.sf-state__detail').textContent,
      'Restart from the main menu to recover. Progress since your last save may be lost.');
    assert.equal(pane.sfStateVerb.children[0].textContent, 'Restart to main menu');
    assert.equal(fixture.host.location.reloads, 0);
    pane.sfStateVerb.click();
    assert.equal(fixture.host.location.reloads, 1);
  } finally { presenter.destroy(); }
});
