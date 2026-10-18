// test/inf-oct17-pro-23.test.mjs — PRO-23 catalog proof.
// Catalog line: Every CC0 file promoted into runtime has a credits row.
// Done check: A focused test scans the audio and material recipes for promoted
// assets/reference/cc0 origins and finds a credits row with its license for each.
// Do-NOT list: List reference files nothing ships.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CREDITS } from '../src/data/credits.js';
import { creditsScreen } from '../src/ui/screens/credits.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scans audio and material/environment recipes for promoted `assets/reference/cc0` origins.
 * Returns an array of promoted asset descriptors.
 */
function scanPromotedCc0Origins() {
  const promoted = [];

  // 1. Audio recipes & sample library scan
  const audioRecipesSrc = readFileSync(join(REPO, 'src', 'data', 'audioRecipes.js'), 'utf8');
  const sampleLibSrc = readFileSync(join(REPO, 'src', 'audio', 'sampleLibrary.js'), 'utf8');

  // Verify promoted Kenney interface sounds in audio recipes / sample bindings
  // TOOL-01: tick_001 promoted to massline_deny.wav
  if (
    /Kenney\s+tick_001\s+promoted/i.test(audioRecipesSrc) ||
    /tick_001[\s\S]*massline_deny/i.test(sampleLibSrc)
  ) {
    promoted.push({
      id: 'kenney_tick_001',
      origin: 'assets/reference/cc0/kenney/interface/Audio/tick_001.ogg',
      runtimeFile: 'assets/audio/massline/massline_deny.wav',
      expectedAuthor: 'Kenney',
      expectedLicense: 'CC0',
      licenseFile: 'assets/reference/cc0/kenney/interface/License.txt',
    });
  }

  // TOOL-02: tick_002 promoted to ui_hover.wav
  if (
    /Kenney\s+tick_002[\s\S]*promoted/i.test(audioRecipesSrc) ||
    /tick_002[\s\S]*ui_hover/i.test(sampleLibSrc)
  ) {
    promoted.push({
      id: 'kenney_tick_002',
      origin: 'assets/reference/cc0/kenney/interface/Audio/tick_002.ogg',
      runtimeFile: 'assets/audio/ui/ui_hover.wav',
      expectedAuthor: 'Kenney',
      expectedLicense: 'CC0',
      licenseFile: 'assets/reference/cc0/kenney/interface/License.txt',
    });
  }

  // TOOL-02: select_002 promoted to ui_tab.wav
  if (
    /select_002\s+promoted/i.test(audioRecipesSrc) ||
    /select_002[\s\S]*ui_tab/i.test(sampleLibSrc)
  ) {
    promoted.push({
      id: 'kenney_select_002',
      origin: 'assets/reference/cc0/kenney/interface/Audio/select_002.ogg',
      runtimeFile: 'assets/audio/ui/ui_tab.wav',
      expectedAuthor: 'Kenney',
      expectedLicense: 'CC0',
      licenseFile: 'assets/reference/cc0/kenney/interface/License.txt',
    });
  }

  // 2. Material / environment recipe scan (foundryEnvironment / IBL provenance)
  const foundryEnvSrc = readFileSync(join(REPO, 'src', 'render', 'foundryEnvironment.js'), 'utf8');
  const envProvPath = join(REPO, 'assets', 'background', 'env', 'PROVENANCE.md');
  const envProv = existsSync(envProvPath) ? readFileSync(envProvPath, 'utf8') : '';

  if (
    /industrial_workshop_foundry[\s\S]*promoted from[\s\S]*assets\/reference\/cc0/i.test(envProv) ||
    (/industrial_workshop_foundry/i.test(foundryEnvSrc) && /assets\/reference\/cc0/i.test(envProv))
  ) {
    promoted.push({
      id: 'polyhaven_industrial_workshop_foundry',
      origin: 'assets/reference/cc0/polyhaven/industrial_workshop_foundry/industrial_workshop_foundry_2k.hdr',
      runtimeFile: 'assets/background/env/industrial_workshop_foundry_2k.hdr',
      expectedAuthor: 'Poly Haven',
      expectedLicense: 'CC0',
      licenseFile: 'assets/reference/cc0/README.md',
    });
  }

  return promoted;
}

// Minimal DOM stub for mounting the credits screen in Node
function createDomElement(tag) {
  const listeners = {};
  const children = [];
  const attributes = {};
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    children,
    childNodes: children,
    dataset: {},
    hidden: false,
    tabIndex: 0,
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 600,
    offsetTop: 0,
    style: {
      setProperty() {},
      removeProperty() {},
    },
    classList: {
      add(...cls) { for (const c of cls) if (c) classes.add(c); },
      remove(...cls) { for (const c of cls) classes.delete(c); },
      contains(c) { return classes.has(c); },
    },
    get className() { return [...classes].join(' '); },
    set className(val) {
      classes.clear();
      for (const c of String(val || '').split(/\s+/)) if (c) classes.add(c);
    },
    get textContent() {
      return children.length
        ? children.map((c) => (typeof c === 'string' ? c : c.textContent || '')).join('')
        : el._text || '';
    },
    set textContent(val) {
      el._text = String(val);
      children.length = 0;
    },
    get innerHTML() { return ''; },
    set innerHTML(val) {
      if (val === '') {
        children.length = 0;
        el._text = '';
      }
    },
    setAttribute(k, v) { attributes[k] = String(v); },
    getAttribute(k) { return attributes[k] ?? null; },
    removeAttribute(k) { delete attributes[k]; },
    appendChild(child) {
      if (child) {
        children.push(child);
        child.parentElement = el;
      }
      return child;
    },
    append(...kids) {
      for (const k of kids) el.appendChild(k);
    },
    insertBefore(newChild, refChild) {
      const idx = children.indexOf(refChild);
      if (idx >= 0) children.splice(idx, 0, newChild);
      else children.push(newChild);
      newChild.parentElement = el;
      return newChild;
    },
    addEventListener(evt, fn) {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener() {},
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node !== el && matchSelector(node, selector)) matches.push(node);
        for (const child of node.children || []) walk(child);
      }
      walk(el);
      return matches;
    },
    scrollTo() {},
    focus() {},
  };
  return el;
}

function matchSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.classList && node.classList.contains(selector.slice(1));
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const raw = selector.slice(1, -1);
    const eq = raw.indexOf('=');
    if (eq >= 0) {
      const key = raw.slice(0, eq);
      const val = raw.slice(eq + 1).replace(/^['"]|['"]$/g, '');
      return node.getAttribute(key) === val;
    }
    return node.getAttribute(raw) !== null;
  }
  return (node.tagName || '').toLowerCase() === selector.toLowerCase();
}

test('PRO-23: scanner identifies all promoted CC0 origins from audio and material recipes', () => {
  const promoted = scanPromotedCc0Origins();
  assert.ok(promoted.length >= 4, `scanner must find at least 4 promoted origins; got ${promoted.length}`);

  const ids = promoted.map((p) => p.id);
  assert.ok(ids.includes('kenney_tick_001'), 'scanner must find kenney_tick_001 (massline_deny)');
  assert.ok(ids.includes('kenney_tick_002'), 'scanner must find kenney_tick_002 (ui_hover)');
  assert.ok(ids.includes('kenney_select_002'), 'scanner must find kenney_select_002 (ui_tab)');
  assert.ok(ids.includes('polyhaven_industrial_workshop_foundry'), 'scanner must find polyhaven industrial_workshop_foundry');
});

test('PRO-23: every promoted CC0 file has a credits row with its license in CREDITS.assets', () => {
  const promoted = scanPromotedCc0Origins();
  assert.ok(Array.isArray(CREDITS.assets), 'CREDITS.assets must exist as an array');
  assert.ok(CREDITS.assets.length >= promoted.length, 'CREDITS.assets must contain at least as many rows as promoted CC0 origins');

  for (const item of promoted) {
    const row = CREDITS.assets.find((a) =>
      // `origin` is stored pack-relative: the full assets/reference path would be a retail-unroutable reference.
      a.origin === item.origin.replace('assets/reference/cc0/', '') ||
      (a.promotedFile && a.promotedFile === item.runtimeFile) ||
      (a.name && a.name.toLowerCase().includes(item.id.replace(/_/g, ' ')))
    );

    assert.ok(row, `Promoted CC0 origin "${item.origin}" (${item.id}) must have a credits row in CREDITS.assets`);
    assert.equal(row.license, item.expectedLicense, `Row for ${item.id} must specify license ${item.expectedLicense}`);
    assert.equal(row.author, item.expectedAuthor, `Row for ${item.id} must name author ${item.expectedAuthor}`);
    assert.ok(row.name && row.name.length > 0, `Row for ${item.id} must have a descriptive human name`);
    assert.ok(row.homepage && row.homepage.startsWith('http'), `Row for ${item.id} must provide canonical homepage URL`);
    assert.ok(row.licenseText && row.licenseText.length > 20, `Row for ${item.id} must provide license text found beside asset`);
  }
});

test('PRO-23: creditsScreen renders the Assets section and each promoted CC0 credits row', () => {
  const prevDoc = globalThis.document;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  try {
    globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
    globalThis.cancelAnimationFrame = () => {};
    globalThis.document = {
      createElement: createDomElement,
      createElementNS: () => createDomElement('svg'),
      getElementById: () => null,
      head: createDomElement('head'),
      documentElement: createDomElement('html'),
    };

    const rootEl = createDomElement('div');
    const ctx = {
      bus: { emit() {} },
      screenManager: { popScreen() {} },
    };

    creditsScreen.mount(rootEl, ctx);

    // Verify Assets section exists in the credits reel
    const assetsSec = rootEl.querySelector('[data-credits-section="assets"]');
    assert.ok(assetsSec, 'creditsScreen must render a section with [data-credits-section="assets"]');

    const heading = assetsSec.querySelector('h2');
    assert.ok(heading, 'assets section must have a heading');
    assert.match(heading.textContent, /Assets/i, 'assets section heading must read Assets');

    // Verify each promoted origin has a rendered row
    const rows = assetsSec.querySelectorAll('.k-row');
    assert.ok(rows.length >= 4, `assets section must render at least 4 rows; got ${rows.length}`);

    const allRowText = rows.map((r) => r.textContent).join('\n');
    assert.match(allRowText, /Kenney/i, 'credits rows must cite Kenney');
    assert.match(allRowText, /Poly Haven/i, 'credits rows must cite Poly Haven');
    assert.match(allRowText, /CC0/i, 'credits rows must cite CC0 license');
    assert.match(allRowText, /Denied Latch/i, 'credits rows must describe denied latch tick');
    assert.match(allRowText, /UI Hover/i, 'credits rows must describe UI hover tick');
    assert.match(allRowText, /UI Tab/i, 'credits rows must describe UI tab tick');
    assert.match(allRowText, /Industrial Workshop Foundry/i, 'credits rows must describe industrial foundry env');
  } finally {
    creditsScreen.dispose();
    globalThis.document = prevDoc;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('PRO-23: do-NOT list: reference files nothing ships are NOT listed in credits', () => {
  // Unpromoted CC0 reference files:
  // - assets/reference/cc0/ambientcg/Rubber004/ (only roughness measured)
  // - assets/reference/cc0/ambientcg/Tiles132C/ (only roughness measured)
  // - assets/reference/cc0/polyhaven/rusty_painted_metal/ (only roughness measured)
  // - assets/reference/cc0/kenney/sci-fi/ (auditioned, kept authored wpn_pulse.wav)
  // - assets/reference/cc0/kenney/impact/ (auditioned, kept authored impact_kiss/hull.wav)
  const unpromotedOrigins = [
    'assets/reference/cc0/ambientcg/Rubber004',
    'assets/reference/cc0/ambientcg/Tiles132C',
    'assets/reference/cc0/polyhaven/rusty_painted_metal',
    'assets/reference/cc0/kenney/sci-fi',
    'assets/reference/cc0/kenney/impact',
  ];

  const assets = CREDITS.assets || [];
  for (const forbidden of unpromotedOrigins) {
    const forbiddenRow = assets.find((a) => (a.origin || '').includes(forbidden));
    assert.equal(
      forbiddenRow,
      undefined,
      `Unpromoted reference origin "${forbidden}" must NOT have a credits row in CREDITS.assets (do-NOT list violation)`
    );
  }
});

test('PRO-23: every promotion the CC0 provenance file records has a credits row', () => {
  // The provenance file is the ledger of what was promoted into runtime: a promotion recorded there
  // without a credits row is a missing attribution, whatever the recipe scan above happens to know.
  const provenance = readFileSync(join(REPO, 'assets', 'reference', 'cc0', 'PROVENANCE.md'), 'utf8');
  const promotedPairs = [];
  for (const line of provenance.split(/\r?\n/)) {
    if (!/runtimeRole:/.test(line) || !/promotion/i.test(line)) continue;
    for (const m of line.matchAll(/([a-z0-9_]+)\s*(?:→|->)\s*([a-z0-9_]+)/gi)) promotedPairs.push({ source: m[1], runtime: m[2] });
  }
  assert.ok(promotedPairs.length >= 3, `provenance records the Kenney promotions (${promotedPairs.length})`);
  for (const pair of promotedPairs) {
    const row = CREDITS.assets.find((a) => (a.origin || '').includes(pair.source) && (a.promotedFile || '').includes(pair.runtime));
    assert.ok(row, `provenance promotion ${pair.source} -> ${pair.runtime} needs a credits row`);
    assert.equal(row.license, 'CC0');
  }
});
