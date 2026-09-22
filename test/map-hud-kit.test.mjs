// C2 — the map uses the flight HUD structural kit, and route engage is on the keyboard and the pad.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { navigationFrameHtml } from '../src/ui/views/navigationFrame.js';
import { listGamepadFocusables } from '../src/ui/input.js';
import {
  applyMapEngage,
  galaxyMapScreen,
  resolveRouteEngageAction,
} from '../src/ui/galaxyMap.js';
import {
  bindMapMarkup,
  MAP_CONTROLS,
  mapControlAttrs,
  mapControlLabel,
} from '../src/ui/map/mapControlMap.js';
import { MAP_WORKBENCH_CSS } from '../src/ui/map/mapWorkbenchCss.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const LAMP_ACCENT = new Set(['var(--dp-lamp)', 'var(--sf-map-accent)', '242 185 80']);

function accentViolations(css) {
  const decls = [...css.matchAll(/(--[\w-]*accent[\w-]*)\s*:\s*([^;]+)/g)];
  const bad = [];
  if (!decls.some((decl) => decl[2].trim() === 'var(--dp-lamp)')) bad.push('missing the flight HUD lamp');
  for (const decl of decls) {
    const value = decl[2].trim();
    if (!LAMP_ACCENT.has(value)) bad.push(`${decl[1]} is a second accent (${value})`);
  }
  return bad;
}

function workbenchCoversPrimary(css) {
  const rule = css.match(/button\[data-sf-role="primary"\]\s*\{([^}]+)\}/);
  if (!rule) return false;
  return /appearance:\s*none/.test(rule[1]) && /(?:keycap|bezel)\.svg/.test(rule[1]);
}

function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.split('\n').map((line) => {
    let out = '';
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (quote) {
        out += c;
        if (c === '\\') { i += 1; out += line[i] || ''; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
      if (c === '/' && line[i + 1] === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
}

function openingTags(src) {
  const tags = [];
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf('<button', i);
    if (at < 0) break;
    const boundary = src[at + 7];
    if (boundary && /[A-Za-z0-9-]/.test(boundary)) { i = at + 7; continue; }
    let j = at;
    let expr = 0;
    let quote = null;
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === '\\') { j += 2; continue; }
        if (c === quote) quote = null;
        j += 1;
        continue;
      }
      if (expr === 0 && (c === '"' || c === "'" || c === '`')) { quote = c; j += 1; continue; }
      if (c === '$' && src[j + 1] === '{') { expr += 1; j += 2; continue; }
      if (expr > 0 && c === '{') { expr += 1; j += 1; continue; }
      if (expr > 0 && c === '}') { expr -= 1; j += 1; continue; }
      if (expr === 0 && c === '>') { j += 1; break; }
      j += 1;
    }
    tags.push(src.slice(at, j));
    i = j;
  }
  return tags;
}

function controlCalls(tag) {
  const needle = 'mapControlAttrs(';
  const calls = [];
  let i = 0;
  while (i < tag.length) {
    const at = tag.indexOf(needle, i);
    if (at < 0) break;
    let j = at + needle.length;
    let depth = 1;
    let quote = null;
    const start = j;
    while (j < tag.length && depth > 0) {
      const c = tag[j];
      if (quote) {
        if (c === '\\') { j += 2; continue; }
        if (c === quote) quote = null;
        j += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; j += 1; continue; }
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      if (depth > 0) j += 1;
      else break;
    }
    calls.push(tag.slice(start, j));
    i = j + 1;
  }
  return calls;
}

function staticClass(tag) {
  const match = /class="([^"]*)"/.exec(tag);
  if (!match) return '';
  let out = '';
  let i = 0;
  const value = match[1];
  while (i < value.length) {
    if (value[i] === '$' && value[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < value.length && depth > 0) {
        if (value[i] === '{') depth += 1;
        else if (value[i] === '}') depth -= 1;
        i += 1;
      }
      continue;
    }
    out += value[i];
    i += 1;
  }
  return out;
}

function isPrimaryTag(tag) {
  return /\b(?:k-word--primary|fh-key--primary|dp-key--primary)\b/.test(staticClass(tag))
    || /data-sf-role="primary"/.test(tag);
}

function wiresPrimary(tag) {
  if (/data-sf-role="primary"/.test(tag)) return true;
  const calls = controlCalls(tag);
  if (!calls.length) return false;
  return calls.every((arg) => {
    const quotes = [...arg.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    const ids = quotes.filter((quote) => Object.hasOwn(MAP_CONTROLS, quote));
    if (/primary:\s*true/.test(arg)) return true;
    if (!ids.length) return true;
    return ids.every((id) => MAP_CONTROLS[id].role === 'primary');
  });
}

function mapSources() {
  const files = [join(ROOT, 'src', 'ui', 'galaxyMap.js')];
  const dir = join(ROOT, 'src', 'ui', 'map');
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.js')) files.push(next);
    }
  };
  walk(dir);
  return files;
}

const plotted = { nav: { route: { legs: [{ from: 'helios', to: 'ceres' }] }, executor: null } };

test('the map workbench has one lamp accent and a machined bezel', () => {
  assert.deepEqual(accentViolations(MAP_WORKBENCH_CSS), []);
  assert.ok(accentViolations('#sf-galaxymap { --sf-accent: #7dffb3; --sf-map-accent: var(--dp-lamp); }').some((item) => /second accent/.test(item)));
  assert.match(MAP_WORKBENCH_CSS, /border-image:\s*url\("\/assets\/ui\/deckplate\/hw\/bezel\.svg"\)/);
  assert.match(MAP_WORKBENCH_CSS, /border-radius:\s*0/);
  assert.doesNotMatch(MAP_WORKBENCH_CSS, /\.card\b|data-sf-card|sf-card/);
  assert.match(read('src/ui/galaxyMap.js'), /MAP_WORKBENCH_CSS/);
});

test('a raw button is not the primary map control', () => {
  assert.equal(workbenchCoversPrimary(MAP_WORKBENCH_CSS), true);
  assert.equal(isPrimaryTag('<button type="button" class="k-word--primary">Go</button>') && !wiresPrimary('<button type="button" class="k-word--primary">Go</button>'), true);
  const machined = `<button type="button" ${mapControlAttrs('plot')} class="k-word--primary">Plot Course</button>`;
  assert.equal(wiresPrimary(machined), true);
  assert.equal(workbenchCoversPrimary(MAP_WORKBENCH_CSS) && wiresPrimary(machined), true);
});

test('every map control label comes from the binding map', () => {
  for (const [id, row] of Object.entries(MAP_CONTROLS)) {
    assert.equal(mapControlLabel(id), row.label);
  }
  assert.throws(() => mapControlLabel('not-a-control'), /no binding-map label/);
  assert.throws(() => bindMapMarkup('<button type="button" class="mystery">Go</button>'), /no binding-map label/);

  for (const abs of mapSources()) {
    const rel = abs.slice(ROOT.length).replaceAll('\\', '/');
    const src = stripComments(readFileSync(abs, 'utf8'));
    for (const tag of openingTags(src)) {
      const calls = controlCalls(tag);
      assert.ok(calls.length > 0, `${rel} control has no binding-map label: ${tag.slice(0, 160)}`);
      for (const arg of calls) {
        const quotes = [...arg.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        const ids = quotes.filter((quote) => Object.hasOwn(MAP_CONTROLS, quote));
        const dynamic = /[A-Za-z_]/.test(arg.replace(/'[^']*'/g, '').replace(/[{}(),?:.\s]/g, ''));
        assert.ok(ids.length > 0 || dynamic, `${rel} control has no binding-map label: ${arg}`);
        for (const id of ids) assert.ok(mapControlLabel(id));
      }
      if (isPrimaryTag(tag)) {
        assert.equal(wiresPrimary(tag) && workbenchCoversPrimary(MAP_WORKBENCH_CSS), true, `${rel} raw button is the primary control`);
      }
    }
  }

  const frame = bindMapMarkup(navigationFrameHtml());
  assert.match(frame, /data-map-control="engage"[^>]*data-control-label="Engage Route"/);
  assert.match(frame, /data-map-control="engage"[^>]*data-sf-role="primary"/);
  assert.match(frame, /data-pad-action="accept"/);
  assert.match(frame, /data-binding-key="G"/);
  assert.match(frame, /data-map-control="plot"[^>]*data-sf-role="primary"/);
});

test('route engage is reachable from the keyboard and the pad', () => {
  const bus = { events: [], emit(name) { this.events.push(name); } };
  assert.equal(resolveRouteEngageAction(plotted).enabled, true);
  assert.equal(applyMapEngage({ key: 'g', state: plotted, bus }), true);
  assert.deepEqual(bus.events, ['nav:engageRoute']);

  const screenBus = { events: [], emit(name) { this.events.push(name); } };
  const handled = galaxyMapScreen.onKey(
    { key: 'g', target: { tagName: 'DIV' }, preventDefault() {} },
    { state: plotted, bus: screenBus },
  );
  assert.equal(handled, true);
  assert.deepEqual(screenBus.events, ['nav:engageRoute']);

  const padBus = { events: [], emit(name) { this.events.push(name); } };
  assert.equal(applyMapEngage({ pad: 'accept', state: plotted, bus: padBus }), true);
  assert.deepEqual(padBus.events, ['nav:engageRoute']);
  assert.equal(applyMapEngage({ pad: 'cancel', state: plotted, bus: padBus }), false);

  const button = {
    tagName: 'BUTTON',
    disabled: false,
    hidden: false,
    parentNode: null,
    getAttribute() { return null; },
  };
  const root = { querySelectorAll() { return [button]; } };
  button.parentNode = root;
  assert.ok(listGamepadFocusables(root).includes(button), 'an enabled engage button is in the pad focus set');
});
