import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import { messages } from '../src/localization/catalogs/en-US.generated.js';
import {
  LANGUAGE_OPTIONS,
  gameLocalization,
  localizeText,
  resolveStartupLocale,
  setGameLocale,
  startupLocale,
} from '../src/localization/gameLocalization.js';
import { LOCALIZED_CORE_COPY } from '../src/ui/localizedCoreCopy.js';
import { extractPlaceholders, hasPlaceholderParity, meanPseudoGrowth, pseudoLocalize } from '../src/localization/runtime.js';
import {
  CLIP_SWEEP_SEED,
  CLIP_SWEEP_SELECTORS,
  captureSweepReport,
  collectDomClips,
  isElementClipped,
  isHudCatalogKey,
  isScreenCatalogKey,
  sweepGrowthClips,
} from '../src/localization/layout.js';
import { GROWTH_LAYOUT_CSS } from '../src/localization/domBridge.js';

const messageSet = new Set(Object.values(messages));

test('default player route remains English and any chosen locale is opt-in', () => {
  assert.equal(startupLocale, 'en-US');
  assert.equal(gameLocalization.locale, 'en-US');
  assert.equal(resolveStartupLocale(''), 'en-US');
  assert.equal(resolveStartupLocale('?locale=!!'), 'en-US');
  assert.equal(resolveStartupLocale('?locale=fr-FR'), 'fr-FR');
  assert.equal(resolveStartupLocale('?locale=qps-ploc'), 'qps-ploc');
});

test('settings language choice is live-applied and English is the default option', () => {
  assert.equal(LANGUAGE_OPTIONS[0].id, 'en-US', 'English must be the default picker option');
  const original = gameLocalization.locale;
  try {
    assert.equal(setGameLocale('qps-ploc'), 'qps-ploc');
    assert.equal(gameLocalization.locale, 'qps-ploc');
    assert.equal(setGameLocale('en-US'), 'en-US');
    assert.equal(gameLocalization.locale, 'en-US');
  } finally {
    gameLocalization.setLocale(original);
  }
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
  assert.match(gameSource, /setGameLocale/);
  assert.match(gameSource, /LANGUAGE_OPTIONS/);
  assert.match(bridgeSource, /MutationObserver/);
  assert.match(bridgeSource, /attributeFilter: LOCALIZED_ATTRIBUTES/);
  assert.match(bridgeSource, /CanvasRenderingContext2D/);
  assert.match(bridgeSource, /localizedMeasureText/);
  assert.match(bridgeSource, /data-localization-skip/);
  assert.match(bridgeSource, /activeTranslate/);
  assert.doesNotMatch(bridgeSource, /requestAnimationFrame|setInterval|setTimeout/);

  for (const id of ['settings', 'help', 'saveLoad', 'missionLog', 'galaxyMap', 'codex', 'gameOver']) {
    assert.match(browserSource, new RegExp(`\\['${id}'|showScreen\\('${id}'`), `${id} browser coverage`);
  }
  assert.match(browserSource, /englishLeaks/);
  assert.match(browserSource, /evidence\.json/);
});

test('readiness checker recognizes the canonical document bridge adoption route', () => {
  const probe = spawnSync(process.execPath, ['scripts/check-localization-readiness.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(probe.error, undefined, 'readiness checker should execute');
  const report = JSON.parse(probe.stdout);
  assert.equal(report.runtimeAdoption.documentBridgeInstalled, true,
    'readiness must recognize the public document-boundary localization route');
  assert.equal(report.runtimeAdoption.status, 'document_bridge');
  assert.equal(report.runtimeAdoption.estimatedSurfacePercent, 100,
    'a whole-document bridge should not be reported as zero direct-call adoption');
});

function mockLabel({ text, clientWidth, scrollWidth, clientHeight = 20, scrollHeight = 20, overflow = 'hidden', tag = 'BUTTON' }) {
  return {
    tagName: tag,
    id: '',
    className: '',
    textContent: text,
    clientWidth,
    scrollWidth,
    clientHeight,
    scrollHeight,
    style: { overflow, overflowX: overflow, overflowY: overflow },
  };
}

function mockRoot(elements) {
  return {
    querySelectorAll(selector) {
      assert.match(CLIP_SWEEP_SELECTORS, /button/);
      assert.equal(typeof selector, 'string');
      return elements;
    },
  };
}

test('PQ-166.01 pseudo-locale grows screen and HUD copy at least +40 % (seed 16601)', () => {
  assert.equal(CLIP_SWEEP_SEED, 16601);
  const screenHud = Object.fromEntries(
    Object.entries(messages).filter(([key]) => isScreenCatalogKey(key) || isHudCatalogKey(key)),
  );
  const surfaceMean = meanPseudoGrowth(screenHud);
  const catalogMean = meanPseudoGrowth(messages);
  assert.ok(surfaceMean >= 1.40, `screen+HUD growth ${surfaceMean} must be at least +40 %`);
  assert.ok(catalogMean >= 1.40, `catalog growth ${catalogMean} must be at least +40 %`);
  const grown = pseudoLocalize('Settings');
  assert.match(grown, /^⟦.*⟧$/u);
  assert.ok(!grown.includes('Settings'), 'growth is never tested in English');
});

test('PQ-166.01 structural sweep of every screen and HUD key reports zero clips', () => {
  const report = sweepGrowthClips(messages, pseudoLocalize);
  assert.ok(report.scanned > 400, `expected a broad sweep, scanned ${report.scanned}`);
  assert.equal(report.clipCount, 0, report.clips.slice(0, 5).map((row) => row.key).join(', '));
});

test('PQ-166.01 captureSweepReport imports the shipped DOM clip detector', () => {
  const clipped = mockLabel({ text: '⟦Šëëŧŧïïñğš⟧', clientWidth: 40, scrollWidth: 120, overflow: 'hidden' });
  const wrapped = mockLabel({ text: '⟦Šëëŧŧïïñğš⟧', clientWidth: 40, scrollWidth: 120, overflow: 'visible' });
  assert.equal(isElementClipped(clipped), true);
  assert.equal(isElementClipped(wrapped), false, 'overflow:visible is wrap, not a clip');
  const dirty = collectDomClips(mockRoot([clipped, wrapped]));
  assert.equal(dirty.present, true);
  assert.equal(dirty.clipCount, 1);
  assert.equal(dirty.clips[0].text.includes('Šëëŧ'), true);
  const report = captureSweepReport({
    hud: mockRoot([wrapped]),
    mainMenu: mockRoot([wrapped]),
    settings: mockRoot([wrapped]),
  });
  assert.equal(report.seed, 16601);
  assert.equal(report.clipCount, 0);
  assert.equal(report.screens.length, 3);
  assert.ok(report.screens.some((row) => row.id === 'hud'));
  assert.match(GROWTH_LAYOUT_CSS, /sf-wpn-heat/);
  assert.match(GROWTH_LAYOUT_CSS, /overflow-wrap:anywhere/);
  assert.doesNotMatch(GROWTH_LAYOUT_CSS, /font-size:\s*[0-9.]+px/, 'layout fix is wrap/box, not type shrink');
});
