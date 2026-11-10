import assert from 'node:assert/strict';
import test from 'node:test';

import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import {
  disposeAuthoredAssetRuntime,
  getAuthoredAssetDiagnostic,
  invalidateFailedAuthoredAssets,
  loadAuthoredPart,
} from '../src/render/assetLoader.js';

// Synthetic released-part URL: inside release/parts/ (so the source-route guard applies) but
// never backed by a render-package pilot or the allowlist. Synthetic on purpose — keying this
// on a real file (pelican.glb, wasp.glb) would silently stop covering the seam the day that
// file gains a package.
const UNPACKAGED_URL = 'assets/ships/release/parts/wholeships/sf_unpackaged_coverage_fixture.glb';
const SLOT = 'hull';

test('an unpackaged release part resolves null, records the refusal, and stays retry-visible', async () => {
  assert.equal(renderPackagePilotForSourceUrl(UNPACKAGED_URL), null,
    'the fixture URL must have no pilot or this exercises the package lane instead of the refusal');

  const renderer = {};
  try {
    // The load contract is resolve-null-on-failure: the caller's procedural fallback or
    // marker stays authoritative and the boundary never dies on a rejected promise. A thrown
    // AssetContractError also used to skip every later file in a serial plan decode.
    const record = await loadAuthoredPart(UNPACKAGED_URL, {
      renderer,
      slot: SLOT,
      optional: true,
      isResidencyOwnerActive: () => true,
    });
    assert.equal(record, null, 'the refusal resolves null; it must not reject the caller');

    // The refusal must land in the same failure ledger as decode/contract failures, or
    // getAuthoredAssetDiagnostic reports "nothing wrong" over an invisible entity and the
    // invalidateFailedAuthoredAssets retry sweep can never reach the part.
    const diagnostic = await getAuthoredAssetDiagnostic(renderer, UNPACKAGED_URL, SLOT);
    assert.ok(diagnostic instanceof Error, 'the refusal must be recorded for diagnostics');
    assert.match(String(diagnostic.message), /no render package|source route/i);

    const cleared = await invalidateFailedAuthoredAssets(renderer);
    assert.ok(cleared >= 1, 'the recorded refusal is reachable by the recovery sweep');
    assert.equal(await getAuthoredAssetDiagnostic(renderer, UNPACKAGED_URL, SLOT), null,
      'invalidation clears the record so a re-admission can retry cleanly');

    // After recovery the contract still holds: resolve null again, re-record the still-broken
    // package coverage — never wedge or throw.
    const retry = await loadAuthoredPart(UNPACKAGED_URL, {
      renderer,
      slot: SLOT,
      optional: true,
      isResidencyOwnerActive: () => true,
    });
    assert.equal(retry, null);
    assert.ok(await getAuthoredAssetDiagnostic(renderer, UNPACKAGED_URL, SLOT) instanceof Error,
      'a still-unpackaged part re-records its refusal after the sweep');
  } finally {
    await disposeAuthoredAssetRuntime(renderer);
  }
});
