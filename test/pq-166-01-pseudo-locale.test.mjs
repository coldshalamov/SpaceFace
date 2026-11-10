// PQ-166.01 — Growth pass. Pseudo-locale at +40 % on every screen and the HUD.
//
// Testing growth in English is the failure mode. This file always localizes through the shipped
// pseudo-locale, then measures string width against the wrap-safe layout boxes. Headed capture is
// the real picture; this is the structural stand-in when a GPU window is not available.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { messages } from '../src/localization/catalogs/en-US.generated.js';
import {
  PSEUDO_GROWTH_RATIO,
  PSEUDO_LOCALE,
  extractPlaceholders,
  hasPlaceholderParity,
  meanPseudoGrowth,
  pseudoGrowthRatio,
  pseudoLocalize,
} from '../src/localization/runtime.js';
import {
  GROWTH_VIEWPORT,
  TECH_TREE_NODE_W,
  canvasLabelClips,
  collectCanvasLabelClips,
  isHudCatalogKey,
  isPaintedCopy,
  isScreenCatalogKey,
  layoutBoxForKey,
  measureStringWidth,
  sweepGrowthClips,
  techTreeNameLineBudget,
  wrapCanvasLines,
} from '../src/localization/layout.js';
import { TECH_NODES } from '../src/data/tech.js';
import { GROWTH_LAYOUT_CSS } from '../src/localization/domBridge.js';
import { LOCALIZED_CORE_COPY } from '../src/ui/localizedCoreCopy.js';

const SEED = 16601;

test('pseudo-locale expands about +40 % (never measured in English)', () => {
  assert.equal(PSEUDO_LOCALE, 'qps-ploc');
  assert.equal(PSEUDO_GROWTH_RATIO, 1.4);
  // The mean is measured over painted copy — the same population the clip sweep scans.
  // Token-dominated templates ("{total} CR", "{qty}x {name}") are not painted labels and
  // cannot expand at +40 %; counting them turns the check into a measure of catalog
  // composition rather than transform quality.
  const screenHud = Object.fromEntries(
    Object.entries(messages).filter(([key, msg]) => (
      (isScreenCatalogKey(key) || isHudCatalogKey(key)) && isPaintedCopy(msg)
    )),
  );
  const catalogMean = meanPseudoGrowth(messages);
  const surfaceMean = meanPseudoGrowth(screenHud);
  const coreMean = meanPseudoGrowth(
    Object.fromEntries(Object.values(LOCALIZED_CORE_COPY).map((entry) => [entry.label, entry.label])),
  );
  // Documented actuals at seed 16601: catalog ~1.50, screen+HUD painted ~1.50, core ~1.62.
  assert.ok(surfaceMean >= 1.40, `screen+HUD growth ${surfaceMean} must be at least +40 %`);
  assert.ok(catalogMean >= 1.40, `catalog growth ${catalogMean} must be at least +40 %`);
  assert.ok(coreMean >= 1.40, `core copy growth ${coreMean} must be at least +40 %`);
  assert.ok(surfaceMean < 1.85, `surface growth ${surfaceMean} should stay near +40 %, not a balloon`);
  const sample = pseudoLocalize('Settings');
  assert.match(sample, /^⟦.*⟧$/u);
  assert.ok(pseudoGrowthRatio('Settings') >= 1.4);
  assert.ok(!sample.includes('Settings'), 'growth is not the English source');
  assert.equal(SEED, 16601);
});

test('placeholder interpolation stays a homomorphism under growth', () => {
  const template = 'Launch {count} wingmen';
  const fromTemplate = pseudoLocalize(template).replace('{count}', '2');
  const fromInterpolated = pseudoLocalize('Launch 2 wingmen');
  assert.equal(fromTemplate, fromInterpolated);
  assert.deepEqual(extractPlaceholders(pseudoLocalize(template)), ['count']);
  assert.equal(hasPlaceholderParity(template, pseudoLocalize(template)), true);
});

test('layout helpers expose wrap-safe boxes for screens and the HUD', () => {
  assert.equal(GROWTH_VIEWPORT.width, 1280);
  const title = layoutBoxForKey('loc.src.ui.screens.mainmenu.field.title.x', 'New Game');
  assert.equal(title.wrap, true);
  assert.ok(title.width >= 280);
  const hud = layoutBoxForKey('loc.src.ui.hud.field.label.x', 'WANTED');
  assert.equal(hud.wrap, true);
  const wide = measureStringWidth(pseudoLocalize('Settings'), 14);
  const narrow = measureStringWidth('Settings', 14);
  assert.ok(wide > narrow, 'pseudo string is wider than English at the same face size');
  assert.match(GROWTH_LAYOUT_CSS, /#hud/);
  assert.match(GROWTH_LAYOUT_CSS, /sf-barrow__label/);
  assert.match(GROWTH_LAYOUT_CSS, /sf-overview-row__name/);
  assert.match(GROWTH_LAYOUT_CSS, /overflow-wrap:anywhere/);
  assert.match(GROWTH_LAYOUT_CSS, /white-space:normal/);
  assert.doesNotMatch(GROWTH_LAYOUT_CSS, /font-size:\s*\d/, 'do not cheat clips by shrinking type');
});

test('zero clipped strings in the +40 % screen and HUD sweep', () => {
  const report = sweepGrowthClips(messages, pseudoLocalize);
  assert.ok(report.scanned > 400, `expected a broad sweep, scanned ${report.scanned}`);
  assert.equal(report.clipCount, 0, report.clips.slice(0, 5).map((row) => row.key).join(', '));
  assert.equal(report.clips.length, 0);
});

test('headed capture sweep of every screen reports zero clips', () => {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const reportPath = path.join(root, 'design/program/roadmap/receipts/PQ-166.01-sweep.json');
  assert.equal(existsSync(reportPath), true, 'headed sweep report must exist');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.clipCount, 0, JSON.stringify(report.screens.filter((s) => s.clipCount)));
  assert.ok(report.screens.length >= 10, `sweep covered ${report.screens.length} screens`);
  assert.ok(
    report.screens.some((row) => row.id === 'hud'),
    'headed sweep must include the HUD, not only menus',
  );
  assert.equal(report.canvasClipCount ?? 0, 0, JSON.stringify(report.canvasClips || []));
  console.log(`PQ-166.01 capture-sweep screens=${report.screens.length} clipCount=${report.clipCount} canvas=${report.canvasClipCount ?? 0}`);
});

test('growth CSS lives on the shipped document bridge, not a test double', () => {
  const source = readFileSync(new URL('../src/localization/domBridge.js', import.meta.url), 'utf8');
  assert.match(source, /GROWTH_LAYOUT_CSS/);
  assert.match(source, /#hud/);
  assert.match(source, /html:not\(\[data-locale="en-US"\]\)/);
  assert.doesNotMatch(source, /font-size:\s*[0-9.]+px/, 'layout fix is wrap/box, not type shrink');
});

test('tech-tree canvas wraps long growth names without an ellipsis', () => {
  const treeSource = readFileSync(new URL('../src/ui/screens/techTree.js', import.meta.url), 'utf8');
  assert.match(treeSource, /wrapCanvasLines/);
  assert.doesNotMatch(treeSource, /rest \+ '…'|'\u2026'/, 'canvas wrap must not insert an ellipsis');
  assert.equal(techTreeNameLineBudget('qps-ploc'), 3);
  assert.equal(techTreeNameLineBudget('en-US'), 2);
  const grown = pseudoLocalize('Matter Compression');
  assert.equal(grown.includes('…'), false);
  const lines = wrapCanvasLines((value) => measureStringWidth(value, 16), grown, TECH_TREE_NODE_W);
  assert.ok(lines.length >= 1);
  assert.ok(lines.length <= 3, `Matter Compression grew onto ${lines.length} lines`);
  assert.equal(lines.some((line) => line.includes('…')), false);
  assert.equal(canvasLabelClips(grown, { locale: 'qps-ploc' }), false);
  const labels = TECH_NODES.map((node) => ({ id: node.id, text: pseudoLocalize(node.name) }));
  const canvas = collectCanvasLabelClips(labels, { locale: 'qps-ploc' });
  assert.equal(canvas.clipCount, 0, JSON.stringify(canvas.clips.slice(0, 5)));
  console.log(`PQ-166.01 canvas-wrap nodes=${labels.length} clipCount=${canvas.clipCount}`);
});
