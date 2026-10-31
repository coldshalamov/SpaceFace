import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { buildUiCssSidecars } from '../scripts/lib/buildUiCssSidecars.mjs';
import { ensureHudStylesheet } from '../src/ui/views/hudStylesheet.js';
import { deferCssVisibility, deferScreenCssReady, loadCssSidecar } from '../src/ui/orrery/cssSidecar.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function screenRoot() {
  const attributes = new Map();
  const styles = new Map();
  return {
    dataset: {},
    style: {
      getPropertyValue(name) { return styles.get(name)?.value || ''; },
      getPropertyPriority(name) { return styles.get(name)?.priority || ''; },
      setProperty(name, value, priority = '') { styles.set(name, { value, priority }); },
      removeProperty(name) { styles.delete(name); },
    },
    inert: false,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

test('tracked UI CSS sidecars exactly match their authored sources', async () => {
  const result = await buildUiCssSidecars({ root: ROOT, check: true });
  assert.deepEqual(result.map(({ path, changed }) => ({ path, changed })), [
    { path: 'styles/deckplate.generated.css', changed: false },
    { path: 'styles/hud-flight.generated.css', changed: false },
    { path: 'styles/archive.generated.css', changed: false },
    { path: 'styles/constellation.generated.css', changed: false },
    { path: 'styles/mobile.generated.css', changed: false },
  ]);
});

test('mobile CSS visibility stays gated until its sheet is ready and remains gated on failure', async () => {
  const overlay = screenRoot();
  let finishCss;
  const cssReady = new Promise((resolve) => { finishCss = resolve; });
  const visible = deferCssVisibility(overlay, cssReady);
  assert.equal(overlay.hasAttribute('data-ui-css-pending'), true);
  finishCss();
  await visible;
  assert.equal(overlay.hasAttribute('data-ui-css-pending'), false);

  const failedOverlay = screenRoot();
  const pending = deferCssVisibility(failedOverlay, Promise.reject(new Error('mobile fallback failed')));
  assert.equal(failedOverlay.hasAttribute('data-ui-css-pending'), true);
  await assert.rejects(pending, /mobile fallback failed/);
  assert.equal(failedOverlay.hasAttribute('data-ui-css-pending'), true,
    'unavailable styling cannot expose unstyled touch controls');
  const kitCss = await readFile(resolve(ROOT, 'styles/kit.css'), 'utf8');
  assert.match(kitCss, /#sf-touch-overlay\[data-ui-css-pending\][^,]*,[\s\S]*?#sf-touch-overlay\[data-ui-css-pending\] \*/,
    'the critical kit rule gates the mobile overlay and all controls beneath it');
});

test('screen sidecar readiness waits for CSS and falls back in the same cascade slot', async () => {
  const nodes = new Map();
  const order = [];
  const head = {
    appendChild(node) { nodes.set(node.id, node); node.parentNode = this; order.push(node); },
    insertBefore(node, before) {
      const index = order.indexOf(before);
      order.splice(index < 0 ? order.length : index, 0, node);
      nodes.set(node.id, node);
      node.parentNode = this;
    },
    removeChild(node) { nodes.delete(node.id); order.splice(order.indexOf(node), 1); node.parentNode = null; },
  };
  const doc = {
    head,
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tagName) {
      return {
        tagName, id: '', rel: '', href: '', textContent: '', parentNode: null,
        replaceWith(replacement) {
          const index = order.indexOf(this);
          order[index] = replacement;
          nodes.delete(this.id);
          nodes.set(replacement.id, replacement);
          replacement.parentNode = head;
          this.parentNode = null;
        },
      };
    },
  };
  const root = screenRoot();
  let resolveCss;
  const css = new Promise((resolve) => { resolveCss = resolve; });
  const ready = deferScreenCssReady(root, css);
  assert.equal(root.hasAttribute('data-ui-css-pending'), true);
  // Model paintWarm's hidden write followed by syncVisibility's authoritative cleanup.
  root.style.setProperty('visibility', 'hidden');
  root.inert = true;
  root.style.removeProperty('visibility');
  root.inert = false;
  assert.equal(root.hasAttribute('data-ui-css-pending'), true,
    'the independent critical gate survives ScreenManager visibility/inert cleanup');
  assert.equal(root.dataset.kReady, '0');
  const kitCss = await readFile(resolve(ROOT, 'styles/kit.css'), 'utf8');
  const pendingRule = kitCss.match(/#screens > \.k-screen\[data-ui-css-pending\][^{}]*\{([^}]*)\}/);
  assert(pendingRule, 'kit must include the synchronous pending-screen rule');
  assert.match(pendingRule[1], /visibility:\s*hidden\s*!important/);
  assert.match(pendingRule[1], /pointer-events:\s*none\s*!important/);
  ready();
  assert.equal(root.dataset.kReady, '0', 'content alone is not ready before its stylesheet');
  resolveCss();
  await css;
  await Promise.resolve();
  assert.equal(root.dataset.kReady, '1');
  assert.equal(root.hasAttribute('data-ui-css-pending'), false,
    'the helper removes only its own pending gate after readiness');

  const loaded = loadCssSidecar(doc, { id: 'archive-test', path: 'styles/archive.generated.css', fallback: async () => 'fallback-css' });
  const link = nodes.get('archive-test');
  assert.equal(link.rel, 'stylesheet');
  assert.ok(link.href.endsWith('/styles/archive.generated.css'));
  link.onerror();
  await loaded;
  assert.equal(nodes.get('archive-test').tagName, 'style');
  assert.equal(nodes.get('archive-test').textContent, 'fallback-css');
  assert.equal(order[0], nodes.get('archive-test'), 'fallback replaces the failed link at its cascade position');
});

test('a failed CSS fallback cannot report screen readiness and can be retried', async () => {
  const nodes = new Map();
  const head = {
    appendChild(node) { nodes.set(node.id, node); node.parentNode = this; },
    removeChild(node) { nodes.delete(node.id); node.parentNode = null; },
  };
  const doc = {
    head,
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tagName) { return { tagName, id: '', parentNode: null }; },
  };
  const root = screenRoot();
  const originalError = console.error;
  console.error = () => {};
  try {
    const rejectCss = deferScreenCssReady(root, Promise.reject(new Error('fallback failed')));
    rejectCss();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(root.dataset.kReady, '0');
    assert.equal(root.hasAttribute('data-ui-css-pending'), false,
      'CSS failure releases the helper-owned gate while preserving truthful not-ready status');
  } finally {
    console.error = originalError;
  }

  const failed = loadCssSidecar(doc, { id: 'retry-test', path: 'styles/retry.css', fallback: async () => { throw new Error('fallback failed'); } });
  nodes.get('retry-test').onerror();
  await assert.rejects(failed, /fallback failed/);
  assert.equal(nodes.has('retry-test'), false, 'failed link is removed so a later screen mount can retry');
  const retried = loadCssSidecar(doc, { id: 'retry-test', path: 'styles/retry.css', fallback: async () => 'ready' });
  nodes.get('retry-test').onload();
  await retried;
});

test('a stale screen stylesheet completion cannot mark or reveal a remounted root early', async () => {
  const root = screenRoot();
  let finishOldCss;
  const oldCss = new Promise((resolve) => { finishOldCss = resolve; });
  const oldReady = deferScreenCssReady(root, oldCss);
  oldReady();
  root.style.setProperty('visibility', 'hidden');
  root.inert = true;
  root.style.removeProperty('visibility');
  root.inert = false;
  const currentReady = deferScreenCssReady(root, Promise.resolve());
  currentReady();
  assert.equal(root.hasAttribute('data-ui-css-pending'), true);
  await Promise.resolve();
  assert.equal(root.dataset.kReady, '1');
  assert.equal(root.hasAttribute('data-ui-css-pending'), false);
  finishOldCss();
  await oldCss;
  await Promise.resolve();
  assert.equal(root.dataset.kReady, '1');
});

test('canonical HTML preserves Deckplate, station insertion point, then HUD cascade', async () => {
  const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  const station = await readFile(resolve(ROOT, 'src/ui/station/stationStyles.js'), 'utf8');
  const deckplate = html.indexOf('id="sf-deckplate-style"');
  const hud = html.indexOf('id="sf-hud-style"');
  assert.ok(deckplate >= 0 && hud > deckplate,
    'the HUD stylesheet must follow the Deckplate link');
  assert.match(station, /getElementById\('sf-deckplate-style'\)/,
    'station styles must keep using the Deckplate insertion anchor');
  assert.ok(html.includes('./styles/deckplate.generated.css'));
  assert.ok(html.includes('./styles/hud-flight.generated.css'));
  assert.ok(!html.includes('src/ui/views/hudStyles.js'), 'the large authoring module must not be preloaded');
});

test('embedded UI hosts resolve fallback sheets from the app root', () => {
  const nodes = new Map();
  const doc = {
    defaultView: {},
    head: { appendChild(node) { nodes.set(node.id, node); node.parentNode = this; } },
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tagName) { return { tagName, id: '', rel: '', href: '', parentNode: null }; },
  };
  ensureHudStylesheet(doc);
  assert.equal(nodes.get('sf-deckplate-style')?.href, '/styles/deckplate.generated.css');
  assert.equal(nodes.get('sf-hud-style')?.href, '/styles/hud-flight.generated.css');
});
