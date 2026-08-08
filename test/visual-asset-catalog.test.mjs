import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildVisualAssetCatalog,
  renderVisualAssetCatalogMarkdown,
  validateVisualAssetCatalog,
} from '../tools/art/build_visual_asset_catalog.mjs';

const JSON_PATH = new URL('../design/graphics-sprints/VISUAL_ASSET_CATALOG.json', import.meta.url);
const MARKDOWN_PATH = new URL('../design/graphics-sprints/VISUAL_ASSET_CATALOG.md', import.meta.url);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('visual asset catalog covers the exact release manifest without confusing packaging and selection', () => {
  const catalog = buildVisualAssetCatalog();

  assert.equal(validateVisualAssetCatalog(catalog), true);
  assert.equal(catalog.manifestCensus.releaseManifest.total, 83);
  assert.deepEqual(catalog.manifestCensus.releaseManifest.byKind, {
    'part:cockpits': 3,
    'part:engines': 6,
    'part:fins': 6,
    'part:gear': 2,
    'part:greebles': 7,
    'part:hulls': 10,
    'part:places': 29,
    'part:pods': 3,
    'part:weapons': 6,
    'part:wholeships': 10,
    'ship-reference': 1,
  });
  assert.equal(catalog.manifestCensus.releaseAssets.length, 83);
  assert.equal(new Set(catalog.manifestCensus.releaseAssets.map((row) => row.id)).size, 83);
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
  for (const id of ['ashline_v2_dart', 'ashline_v2_lode', 'ashline_v2_rig']) {
    const row = catalog.rankedTopFive.find((candidate) => candidate.id === id);
    const sourceBytes = readFileSync(new URL(`../${row.source}`, import.meta.url));
    const candidateBytes = readFileSync(new URL(`../${row.candidate}`, import.meta.url));
    assert.equal(row.sourceBytes, sourceBytes.length, `${id} source bytes`);
    assert.equal(row.candidateBytes, candidateBytes.length, `${id} candidate bytes`);
    assert.equal(row.sourceSha256, sha256(sourceBytes), `${id} source sha256`);
    assert.equal(row.candidateSha256, sha256(candidateBytes), `${id} candidate sha256`);
  }
  const rig = catalog.rankedTopFive.find((row) => row.id === 'ashline_v2_rig');
  assert.equal(rig.sourceCandidateMirror, true);
  assert.equal(rig.sourceSha256, 'e46aafcb5a5beb40b24918248a03704ffaef10d342324c3d0e02893898b7b892');
  assert.equal(rig.sourceBytes, 3610796);
  assert.match(rig.currentState, /G5\/G6\/G7/);
  assert.match(rig.currentState, /Reaver\/Corsair identity split remain open/);
});

test('legacy recovery is tracked as a donor and the corrupt foreign clone remains protected', () => {
  const catalog = buildVisualAssetCatalog();
  const lark = catalog.candidatesAndLegacyDonors.find((row) => row.id === 'helios_lark_stopped_remaster');
  const grok = catalog.unsafeForeign.find((row) => row.id === 'stopped_grok_worktree');

  assert.equal(lark.historicalTip, 'd538a583b673c61051e305963254f6de83d871d0');
  assert.ok(lark.recovery.some((step) => step.includes('Do not replace')));
  assert.equal(lark.blendSha256, '2e2a7b454a9705e89085c9358682ec962c686d3ae5ee090d3b0a3d917b2aecee');
  assert.equal(lark.blendBytes, 9442638);
  assert.equal(lark.sourceSha256, 'e16c6a28692d209319d710c5ee4b11b6b2fabb7a669848f205711ae1a09cc866');
  assert.equal(lark.sourceBytes, 11390796);
  const larkBlend = readFileSync(new URL(`../${lark.blend}`, import.meta.url));
  const larkSource = readFileSync(new URL(`../${lark.source}`, import.meta.url));
  assert.equal(larkBlend.length, lark.blendBytes);
  assert.equal(larkSource.length, lark.sourceBytes);
  assert.equal(sha256(larkBlend), lark.blendSha256);
  assert.equal(sha256(larkSource), lark.sourceSha256);
  assert.equal(grok.lifecycle, 'unsafe-foreign');
  assert.match(grok.action, /Preserve read-only/);
  assert.match(grok.action, /REC-GROK-KES-SALVAGE/);
  assert.match(grok.finding, /independent corrupt\/incomplete clone/);
  assert.match(grok.finding, /237 unique targeted Kestrel\/asset paths/);
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
