import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureWholeshipAssetContractMetadata } from '../scripts/lib/wholeshipAssetIdentity.mjs';

function carrier(extras = {}) {
  return {
    extras,
    getExtras() { return this.extras; },
  };
}

function documentWith({ contract, duplicate = false, nested = false, assetContract = null } = {}) {
  const canonical = carrier(contract ? { spacefaceAsset: structuredClone(contract) } : {});
  const other = carrier(duplicate ? { spacefaceAsset: structuredClone(contract) } : {});
  const scene = { listChildren: () => nested ? [other] : [canonical] };
  const asset = { extras: assetContract ? { spacefaceAsset: structuredClone(assetContract) } : { keep: true } };
  return {
    asset,
    canonical,
    document: {
      getRoot: () => ({
        getAsset: () => asset,
        listScenes: () => [scene],
        listNodes: () => [canonical, other],
      }),
    },
  };
}

const CONTRACT = Object.freeze({
  assetId: 'SF_IRONBACK_PRODUCTION_V1',
  partId: 'ironback_production_v1',
  lod: 'lod0',
  slot: 'hull',
  category: 'wholeships',
  forward: '+X',
  embeddedPlume: false,
});

test('hydrates only the in-memory release asset from one canonical scene-root contract', () => {
  const h = documentWith({ contract: CONTRACT });
  assert.deepEqual(
    ensureWholeshipAssetContractMetadata(h.document),
    { source: 'canonical-scene-root' },
  );
  assert.deepEqual(h.asset.extras, { keep: true, spacefaceAsset: CONTRACT });
  assert.deepEqual(h.canonical.getExtras(), { spacefaceAsset: CONTRACT });
  assert.deepEqual(ensureWholeshipAssetContractMetadata(h.document), { source: 'asset' });
});

test('fails closed on ambiguous, nested, or malformed whole-ship identity', () => {
  assert.throws(
    () => ensureWholeshipAssetContractMetadata(documentWith({ contract: CONTRACT, duplicate: true }).document),
    /exactly one scene-root/,
  );
  assert.throws(
    () => ensureWholeshipAssetContractMetadata(documentWith({ contract: CONTRACT, nested: true }).document),
    /exactly one scene-root/,
  );
  assert.throws(
    () => ensureWholeshipAssetContractMetadata(documentWith({
      contract: { ...CONTRACT, slot: 'place' },
    }).document),
    /slot=hull and category=wholeships/,
  );
  assert.throws(
    () => ensureWholeshipAssetContractMetadata(documentWith({
      contract: { ...CONTRACT, lod: 'lod9' },
    }).document),
    /requires lod0, lod1, or lod2/,
  );
});

test('preserves a pre-existing asset-level identity without consulting node carriers', () => {
  const h = documentWith({ assetContract: CONTRACT });
  assert.deepEqual(ensureWholeshipAssetContractMetadata(h.document), { source: 'asset' });
  assert.deepEqual(h.asset.extras.spacefaceAsset, CONTRACT);
});
