import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const runtimeUrl = new URL('../src/localization/runtime.js', import.meta.url);
assert.ok(existsSync(runtimeUrl), 'src/localization/runtime.js must exist');

const {
  createLocalizationRuntime,
  extractPlaceholders,
  hasPlaceholderParity,
  localeFallbackChain,
  pseudoLocalize,
} = await import(runtimeUrl);

test('fallback chain is exact locale, base locale, then en-US without duplicates', () => {
  assert.deepEqual(localeFallbackChain('fr-CA'), ['fr-CA', 'fr', 'en-US']);
  assert.deepEqual(localeFallbackChain('en-US'), ['en-US']);
  assert.deepEqual(localeFallbackChain('fr'), ['fr', 'en-US']);
});

test('runtime resolves locale to base to en-US to call fallback to visible key', () => {
  const runtime = createLocalizationRuntime({
    locale: 'fr-CA',
    catalogs: {
      'fr-CA': { exact: 'Québec' },
      fr: { base: 'Français' },
      'en-US': { english: 'English', templated: 'Cargo: {count}' },
    },
  });
  assert.equal(runtime.t('exact'), 'Québec');
  assert.equal(runtime.t('base'), 'Français');
  assert.equal(runtime.t('english'), 'English');
  assert.equal(runtime.t('templated', { count: 4 }), 'Cargo: 4');
  assert.equal(runtime.t('call', {}, 'Call fallback'), 'Call fallback');
  assert.equal(runtime.t('missing'), 'missing');
});

test('placeholder extraction, parity, interpolation, and malformed translation fallback are fail-closed', () => {
  assert.deepEqual(extractPlaceholders('Hello {pilot}, {count} × {count}'), ['count', 'pilot']);
  assert.equal(hasPlaceholderParity('Hello {pilot}', 'Bonjour {pilot}'), true);
  assert.equal(hasPlaceholderParity('Hello {pilot}', 'Bonjour {name}'), false);
  const issues = [];
  const runtime = createLocalizationRuntime({
    locale: 'es-MX',
    catalogs: {
      es: { hail: 'Hola {name}', broken: 'Carga {amount}' },
      'en-US': { hail: 'Hello {name}', broken: 'Cargo {count}' },
    },
    onMissing: (issue) => issues.push(issue),
  });
  assert.equal(runtime.t('hail', { name: 'Rook' }), 'Hola Rook');
  assert.equal(runtime.t('broken', { count: 9 }), 'Cargo 9');
  assert.equal(issues.filter((issue) => issue.reason === 'placeholder_mismatch').length, 1);
});

test('missing telemetry is deduplicated and contains no wall-clock fields', () => {
  const issues = [];
  const runtime = createLocalizationRuntime({ locale: 'de-DE', catalogs: {}, onMissing: (issue) => issues.push(issue) });
  runtime.t('ui.target.missing');
  runtime.t('ui.target.missing');
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0], {
    locale: 'de-DE',
    key: 'ui.target.missing',
    reason: 'missing_key',
  });
});

test('pseudo locale is deterministic, visible, and preserves placeholders', () => {
  const source = 'Launch {count} wingmen';
  const a = pseudoLocalize(source);
  const b = pseudoLocalize(source);
  assert.equal(a, b);
  assert.match(a, /^⟦.*⟧$/u);
  assert.ok(a.length > source.length);
  assert.deepEqual(extractPlaceholders(a), ['count']);
  const runtime = createLocalizationRuntime({
    locale: 'qps-ploc',
    catalogs: { 'en-US': { launch: source } },
  });
  assert.equal(runtime.t('launch', { count: 2 }), pseudoLocalize('Launch 2 wingmen'));
});

test('runtime is platform-pure and contains no browser, sim, RNG, or clock dependency', () => {
  const source = readFileSync(runtimeUrl, 'utf8');
  assert.doesNotMatch(source, /\b(?:window|document|navigator|GameState|Math\.random|Date\.|performance\.|setTimeout|setInterval)\b/);
});

test('lexical inventory extracts visible copy sinks while excluding code and CSS', async () => {
  const { inventoryText, makeLocalizationKey } = await import('../scripts/lib/localizationInventory.mjs');
  const config = {
    recognizedCopyFields: ['name', 'label'],
    domTextProperties: ['textContent', 'innerText'],
    htmlAttributes: ['aria-label', 'title'],
  };
  const source = `
    const ship = { name: 'Pelican', code: 'ignore-me' };
    title.textContent = 'Launch';
    notice.textContent = 'Need ' + credits + ' credits';
    node.setAttribute('aria-label', 'Dock safely');
    style.textContent = \`.x { color: red; }\`;
    panel.innerHTML = \`<button title="Trade goods">Open Market</button>\`;
  `;
  const entries = inventoryText({ path: 'src/ui/example.js', source, kind: 'js', config });
  assert.deepEqual(entries.map((entry) => entry.message).sort(), [
    'Dock safely', 'Launch', 'Need {credits} credits', 'Open Market', 'Pelican', 'Trade goods',
  ]);
  assert.ok(entries.every((entry) => entry.key === makeLocalizationKey(entry.path, entry.sink, entry.message)));
  assert.deepEqual(inventoryText({ path: 'src/ui/example.js', source, kind: 'js', config }), entries,
    'lexical inventory is deterministic');
});

test('localization inventory includes live story/career roots and authored prose fields', () => {
  const surfaces = JSON.parse(readFileSync(new URL('../scripts/localization-surfaces.json', import.meta.url), 'utf8'));
  const roots = surfaces.roots.map((row) => typeof row === 'string' ? row : row.path);
  assert.ok(roots.includes('src/story'));
  assert.ok(roots.includes('src/careers'));
  for (const field of ['entryLine', 'identityLine', 'blurb', 'prose']) {
    assert.ok(surfaces.recognizedCopyFields.includes(field), `copy field ${field} is inventoried`);
  }
});
