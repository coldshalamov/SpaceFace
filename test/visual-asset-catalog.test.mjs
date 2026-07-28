import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildVisualAssetCatalog,
  renderVisualAssetCatalogMarkdown,
  validateVisualAssetCatalog,
} from '../tools/art/build_visual_asset_catalog.mjs';

const JSON_PATH = new URL('../design/graphics-sprints/VISUAL_ASSET_CATALOG.json', import.meta.url);
const MARKDOWN_PATH = new URL('../design/graphics-sprints/VISUAL_ASSET_CATALOG.md', import.meta.url);

test('visual asset catalog covers the exact release manifest without confusing packaging and selection', () => {
  const catalog = buildVisualAssetCatalog();

  assert.equal(validateVisualAssetCatalog(catalog), true);
  assert.equal(catalog.manifestCensus.releaseManifest.total, 82);
  assert.deepEqual(catalog.manifestCensus.releaseManifest.byKind, {
    'part:cockpits': 3,
    'part:engines': 6,
    'part:fins': 6,
    'part:gear': 2,
    'part:greebles': 7,
    'part:hulls': 10,
    'part:places': 28,
    'part:pods': 3,
    'part:weapons': 6,
    'part:wholeships': 10,
    'ship-reference': 1,
  });
  assert.equal(catalog.manifestCensus.releaseAssets.length, 82);
  assert.equal(new Set(catalog.manifestCensus.releaseAssets.map((row) => row.id)).size, 82);
  assert.match(catalog.coverage.glbInternals, /not complete/);
  assert.equal(catalog.coverage.visualAcceptance, 'none assigned by this catalog');
  assert.ok(catalog.manifestCensus.sourceOnlyIds.includes('wholeship_pelican'));
  assert.ok(catalog.manifestCensus.sourceOnlyIds.includes('wholeship_wasp'));
  assert.deepEqual(
    catalog.manifestCensus.releaseOnlyIds,
    ['ship_kestrel_reference', 'wholeship_kestrel_lod1', 'wholeship_kestrel_lod2'],
  );
});

test('top five has honest states, ordered gates, and no visual-acceptance fabrication', () => {
  const catalog = buildVisualAssetCatalog();

  assert.deepEqual(
    catalog.rankedTopFive.map((row) => row.id),
    [
      'kestrel_die_laughing_stencil',
      'ashline_v2_dart',
      'ashline_v2_lode',
      'ashline_v2_rig',
      'place_claim_outpost_relay',
    ],
  );
  assert.deepEqual(
    catalog.rankedTopFive.map((row) => row.lifecycle),
    ['candidate', 'candidate', 'candidate', 'candidate', 'live'],
  );
  for (const row of catalog.rankedTopFive) {
    assert.ok(row.gates.length >= 5);
    assert.ok(row.gates.some((gate) => gate.includes('human-eye')));
    assert.doesNotMatch(row.currentState, /\b(?:accepted|complete|passed)\b/i);
  }
});

test('legacy recovery is selective and unsafe worktrees remain protected', () => {
  const catalog = buildVisualAssetCatalog();
  const lark = catalog.candidatesAndLegacyDonors.find((row) => row.id === 'helios_lark_stopped_remaster');
  const grok = catalog.unsafeForeign.find((row) => row.id === 'stopped_grok_worktree');

  assert.equal(lark.tip, 'd538a583b673c61051e305963254f6de83d871d0');
  assert.equal(lark.uniqueCommitsVsMasterAtAudit, 16);
  assert.ok(lark.recovery.some((step) => step.includes('Do not merge')));
  assert.equal(lark.stoppedRefHashes.blend, '2e2a7b454a9705e89085c9358682ec962c686d3ae5ee090d3b0a3d917b2aecee');
  assert.equal(grok.lifecycle, 'unsafe-foreign');
  assert.match(grok.action, /Preserve read-only/);
  assert.match(grok.finding, /byte-identical/);
});

test('tracked catalog artifacts are deterministic products of current manifests and routing facts', () => {
  const catalog = buildVisualAssetCatalog();
  const expectedJson = `${JSON.stringify(catalog, null, 2)}\n`;
  const expectedMarkdown = renderVisualAssetCatalogMarkdown(catalog);

  assert.equal(readFileSync(JSON_PATH, 'utf8'), expectedJson);
  assert.equal(readFileSync(MARKDOWN_PATH, 'utf8'), expectedMarkdown);
  for (const path of catalog.runtime.codeNativeVisuals) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  }
});
