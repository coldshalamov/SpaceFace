import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { messages } from '../src/localization/catalogs/en-US.generated.js';
import {
  gameLocalization,
  localizeText,
  resolveStartupLocale,
  startupLocale,
} from '../src/localization/gameLocalization.js';
import { LOCALIZED_CORE_COPY } from '../src/ui/localizedCoreCopy.js';
import { extractPlaceholders, hasPlaceholderParity } from '../src/localization/runtime.js';

const messageSet = new Set(Object.values(messages));

test('default player route remains English and pseudo locale is opt-in', () => {
  assert.equal(startupLocale, 'en-US');
  assert.equal(gameLocalization.locale, 'en-US');
  assert.equal(resolveStartupLocale(''), 'en-US');
  assert.equal(resolveStartupLocale('?locale=fr-FR'), 'en-US');
  assert.equal(resolveStartupLocale('?locale=qps-ploc'), 'qps-ploc');
});

test('core first-hour copy is owned by the generated English catalog', () => {
  for (const [id, entry] of Object.entries(LOCALIZED_CORE_COPY)) {
    assert.ok(messageSet.has(entry.label), `${id} missing from generated catalog`);
  }
});

test('pseudo locale expands core copy and preserves placeholders', async () => {
  const original = gameLocalization.locale;
  gameLocalization.setLocale('qps-ploc');
  try {
    for (const entry of Object.values(LOCALIZED_CORE_COPY)) {
      const rendered = localizeText(entry.label);
      assert.ok(rendered.startsWith('⟦') && rendered.endsWith('⟧'), entry.label);
      assert.ok(rendered.length > entry.label.length, entry.label);
      assert.equal(hasPlaceholderParity(entry.label, rendered), true, entry.label);
      assert.deepEqual(extractPlaceholders(rendered), extractPlaceholders(entry.label));
    }
    assert.match(localizeText('Continue: {summary}', { summary: 'Helios' }), /Helios/);
    assert.equal(localizeText('Unknown {pilot}', { pilot: 'Wren' }).includes('Wren'), true);
  } finally {
    gameLocalization.setLocale(original);
  }
});

test('public route surfaces use the shared localization adapter', () => {
  const files = [
    'src/ui/screens/mainMenu.js',
    'src/ui/screens/newGame.js',
    'src/ui/screens/pause.js',
    'src/ui/hud.js',
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /localizedCoreCopy\.js/);
    assert.match(source, /coreText\(/);
  }
});


test('pseudo locale installs one dynamic DOM bridge while default play remains observer-free', () => {
  const gameSource = fs.readFileSync('src/localization/gameLocalization.js', 'utf8');
  const bridgeSource = fs.readFileSync('src/localization/domBridge.js', 'utf8');
  const browserSource = fs.readFileSync('scripts/check-localization-reachability.mjs', 'utf8');

  assert.match(gameSource, /startupLocale !== DEFAULT_LOCALE/);
  assert.match(gameSource, /installLocalizedDocumentBridge/);
  assert.match(bridgeSource, /MutationObserver/);
  assert.match(bridgeSource, /attributeFilter: LOCALIZED_ATTRIBUTES/);
  assert.match(bridgeSource, /CanvasRenderingContext2D/);
  assert.match(bridgeSource, /localizedMeasureText/);
  assert.match(bridgeSource, /data-localization-skip/);
  assert.doesNotMatch(bridgeSource, /requestAnimationFrame|setInterval|setTimeout/);

  for (const id of ['settings', 'help', 'saveLoad', 'missionLog', 'galaxyMap', 'codex', 'gameOver']) {
    assert.match(browserSource, new RegExp(`\\['${id}'|showScreen\\('${id}'`), `${id} browser coverage`);
  }
  assert.match(browserSource, /englishLeaks/);
  assert.match(browserSource, /evidence\.json/);
});
