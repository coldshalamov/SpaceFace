// C1 — the station uses the flight HUD structural kit.
// Fails if a second accent or a raw button is the primary control, and if a control
// has no binding-map label. Same shape as the flight-HUD pin: bezel, one accent, no
// default button chrome.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BINDINGS } from '../src/ui/bindings.js';
import { stationFrameHtml, shipworksFrameHtml } from '../src/ui/views/stationFrames.js';
import { marketBrowserHtml, marketTradeHtml } from '../src/ui/views/marketPresentation.js';
import { commitWordHtml, contractDossierView } from '../src/ui/views/contractPresentation.js';
import {
  bindStationMarkup,
  STATION_CONTROLS,
  stationControlAttrs,
  stationControlLabel,
} from '../src/ui/station/stationBindingMap.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const LAMP_ACCENT = new Set(['var(--dp-lamp)', 'var(--sf-station-accent)', '242 185 80']);

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
        if (c === '\\') {
          i += 1;
          out += line[i] || '';
          continue;
        }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        out += c;
        continue;
      }
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
    if (boundary && /[A-Za-z0-9-]/.test(boundary)) {
      i = at + 7;
      continue;
    }
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
      if (expr === 0 && (c === '"' || c === "'" || c === '`')) {
        quote = c;
        j += 1;
        continue;
      }
      if (c === '$' && src[j + 1] === '{') {
        expr += 1;
        j += 2;
        continue;
      }
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
  const needle = 'stationControlAttrs(';
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
  return /\b(?:k-word--primary|fh-key--primary|sx-btn-primary|dp-key--primary)\b/.test(staticClass(tag))
    || /data-sf-role="primary"/.test(tag);
}

function boundIds(tag) {
  const ids = [];
  for (const arg of controlCalls(tag)) {
    for (const match of arg.matchAll(/'([^']+)'/g)) {
      if (Object.hasOwn(STATION_CONTROLS, match[1])) ids.push(match[1]);
    }
  }
  return ids;
}

function wiresPrimary(tag) {
  if (/data-sf-role="primary"/.test(tag)) return true;
  const calls = controlCalls(tag);
  if (!calls.length) return false;
  return calls.every((arg) => {
    const quotes = [...arg.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    const ids = quotes.filter((quote) => Object.hasOwn(STATION_CONTROLS, quote));
    if (/primary:\s*true/.test(arg)) return ids.every((id) => STATION_CONTROLS[id]);
    if (!ids.length) return true;
    return ids.every((id) => STATION_CONTROLS[id].role === 'primary');
  });
}

function primaryTagIsMachined(tag, css) {
  if (!isPrimaryTag(tag)) return true;
  return workbenchCoversPrimary(css) && wiresPrimary(tag);
}

function stationSources() {
  const dir = join(ROOT, 'src', 'ui', 'station');
  const files = [];
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

function buttonInner(html, id) {
  const match = new RegExp(`<button\\b[^>]*data-station-control="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
  assert.ok(match, `missing station control ${id}`);
  return match[1].replace(/<[^>]+>/g, '');
}

const css = read('styles/station-workbench.css');

test('the station workbench has one lamp accent and a machined bezel', () => {
  assert.deepEqual(accentViolations(css), []);
  assert.ok(accentViolations('#hud { --sf-accent: #7dffb3; --sf-station-accent: var(--dp-lamp); }').some((item) => /second accent/.test(item)));
  assert.match(css, /border-image:\s*url\("\/assets\/ui\/deckplate\/hw\/bezel\.svg"\)/);
  assert.match(css, /border-radius:\s*0/);
  assert.doesNotMatch(css, /\.card\b|data-sf-card|sf-card/);
});

test('a raw button is not the primary station control', () => {
  assert.equal(workbenchCoversPrimary(css), true);
  assert.equal(primaryTagIsMachined('<button type="button" class="k-word--primary">Go</button>', css), false);
  const machined = `<button type="button" ${stationControlAttrs('undock')} class="k-word--primary">Undock</button>`;
  assert.equal(primaryTagIsMachined(machined, css), true);
});

test('every station control label comes from the binding map', () => {
  for (const [id, row] of Object.entries(STATION_CONTROLS)) {
    assert.equal(stationControlLabel(id), row.label);
    assert.ok(row.label.trim(), `${id} has no binding-map label`);
    if (row.binding) assert.ok(BINDINGS[row.binding] && BINDINGS[row.binding].label, id);
  }
  assert.throws(() => stationControlLabel('not-a-control'), /no binding-map label/);
  assert.throws(() => bindStationMarkup('<button type="button" class="mystery">Go</button>'), /no binding-map label/);

  for (const abs of stationSources()) {
    const rel = abs.slice(ROOT.length).replaceAll('\\', '/');
    const src = stripComments(readFileSync(abs, 'utf8'));
    for (const tag of openingTags(src)) {
      const calls = controlCalls(tag);
      assert.ok(calls.length > 0, `${rel} control has no binding-map label: ${tag.slice(0, 160)}`);
      for (const arg of calls) {
        const quotes = [...arg.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        const ids = quotes.filter((quote) => Object.hasOwn(STATION_CONTROLS, quote));
        const dynamic = /[A-Za-z_]/.test(arg.replace(/'[^']*'/g, '').replace(/[{}(),?:.\s]/g, ''));
        assert.ok(ids.length > 0 || dynamic, `${rel} control has no binding-map label: ${arg}`);
        for (const id of ids) assert.ok(stationControlLabel(id), id);
      }
      assert.equal(primaryTagIsMachined(tag, css), true, `${rel} raw button is the primary control: ${tag.slice(0, 180)}`);
    }
    const creates = src.split("createElement('button')").length - 1;
    if (creates) {
      assert.ok(src.includes('markStationControl('), `${rel} created button has no binding-map label`);
      for (const match of src.matchAll(/markStationControl\(\s*\w+\s*,\s*'([^']+)'/g)) {
        assert.ok(stationControlLabel(match[1]), match[1]);
      }
    }
  }
});

test('station shell, market, shipworks, and accept controls resolve through the map', () => {
  const shell = bindStationMarkup(stationFrameHtml());
  for (const id of ['find', 'comms', 'help', 'undock']) {
    assert.match(shell, new RegExp(`data-station-control="${id}"`));
    assert.match(shell, new RegExp(`data-control-label="${stationControlLabel(id)}"`));
    assert.ok(buttonInner(shell, id).includes(stationControlLabel(id)), id);
  }
  assert.match(shell, /data-station-control="undock"[^>]*data-sf-role="primary"/);
  assert.match(shell, /data-binding-key="E"/);
  assert.match(shell, /data-binding-key="L"/);

  const browser = bindStationMarkup(marketBrowserHtml());
  assert.match(browser, /data-station-control="market-filter"/);
  assert.match(browser, /data-control-label="Filter"/);

  const trade = bindStationMarkup(marketTradeHtml({
    mode: 'buy', qty: 2, canAct: true, receiptHtml: '', totalLabel: 'Total', totalText: '0', note: '',
  }));
  assert.match(trade, /data-station-control="buy"[^>]*data-sf-role="primary"/);
  assert.match(trade, /data-control-label="Fewer"/);
  assert.match(trade, /data-control-label="More"/);
  assert.match(trade, /data-control-label="Max"/);
  assert.match(trade, /data-station-control="sell"/);
  assert.doesNotMatch(trade, /data-station-control="sell"[^>]*data-sf-role="primary"/);

  const ships = bindStationMarkup(shipworksFrameHtml());
  for (const id of ['fleet', 'for-sale', 'previous-ships', 'next-ships', 'rotate-left', 'center-view', 'rotate-right']) {
    assert.match(ships, new RegExp(`data-station-control="${id}"`));
    assert.match(ships, new RegExp(`data-control-label="${stationControlLabel(id)}"`));
  }

  const accept = bindStationMarkup(commitWordHtml({
    id: 'm1', ready: true, readyLabel: 'Accept', blockedLabel: 'Wait', aria: 'Accept', focus: false, reason: '',
  }));
  assert.match(accept, /data-station-control="accept-mission"/);
  assert.match(accept, /data-sf-role="primary"/);
  assert.match(accept, /data-control-label="Accept"/);

  const dossier = bindStationMarkup(contractDossierView({
    typeName: 'Haul', titleHtml: 'Job', clientHtml: 'Client', reward: '10', summary: '',
    routeHtml: 'a', riskHtml: 'b', termsHtml: '',
    action: { id: 'm1', ready: true, readyLabel: 'Accept', blockedLabel: 'Wait', aria: 'Accept', focus: false, reason: '' },
  }));
  assert.match(dossier, /data-station-control="accept-mission"/);

  const app = read('src/ui/station/stationApp.js');
  assert.match(app, /bindStationMarkup\(\s*stationFrameHtml\(\)/);
  const styles = app.slice(app.indexOf('STATION_STYLES'), app.indexOf('];'));
  assert.ok(styles.indexOf('station-workbench.css') > styles.indexOf('/styles/station.css'));
  assert.match(read('src/ui/station/screens/market.js'), /bindStationMarkup\(\s*marketBrowserHtml\(\)/);
  assert.match(read('src/ui/station/screens/market.js'), /bindStationMarkup\(\s*marketTradeHtml\(/);
  assert.match(read('src/ui/station/screens/shipworks.js'), /bindStationMarkup\(\s*shipworksFrameHtml\(\)/);
  assert.match(read('src/ui/station/screens/contracts.js'), /bindStationMarkup\(\s*contractDossierView\(/);
  assert.match(read('src/ui/station/screens/contracts.js'), /return bindStationMarkup\(/);
});
