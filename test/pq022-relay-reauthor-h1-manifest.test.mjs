// PQ-022 revised relay — static Browser/Electron broker and parity readiness.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';
import {
  assertCurrentPq022RelayBrowserReceipt,
  normalizePq022RelayReauthorReceipt,
} from '../scripts/lib/pq022RelayReauthorParity.mjs';
import browserManifest, {
  createPq022RelayReauthorBrowserManifest,
} from '../scripts/validation-manifests/pq022-relay-reauthor-browser.mjs';
import electronManifest from '../scripts/validation-manifests/pq022-relay-reauthor-electron.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROBE = readFileSync(new URL('../scripts/probe-pq022-corridor-asset-leaves.mjs', import.meta.url), 'utf8');
const REQUIRED_PRODUCTION_PATHS = Object.freeze([
  'assets/ships/parts/places/place_claim_outpost_relay.glb',
  'assets/ships/release/parts/places/place_claim_outpost_relay.glb',
  'assets/ships/parts/parts_manifest.json',
  'assets/ships/release/release_manifest.json',
]);

test('paired relay manifests grant one distinct launch per runtime and bind the encoded selector', () => {
  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.id, `pq022-relay-reauthor-${manifest.runtimeKind}`);
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 47);
    assert.deepEqual(manifest.commandArgs, [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=relay-collar',
      `--runtime=${manifest.runtimeKind}`,
    ]);
    for (const relative of REQUIRED_PRODUCTION_PATHS) {
      assert.ok(manifest.productionSourcePaths.includes(relative), relative);
      assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), relative);
    }
  }
  assert.notEqual(browserManifest.artifactRoot, electronManifest.artifactRoot);
  assert.match(browserManifest.artifactRoot.replace(/\\/g, '/'), /\/browser$/);
  assert.match(electronManifest.artifactRoot.replace(/\\/g, '/'), /\/electron$/);
});

test('both paired relay manifests resolve from the tracked registry', async () => {
  for (const expected of [browserManifest, electronManifest]) {
    const registered = await loadValidationManifestById({ root: ROOT, id: expected.id });
    assert.equal(registered.id, expected.id);
    assert.equal(registered.runtimeKind, expected.runtimeKind);
    assert.equal(registered.__trackedManifest.mode, '100644');
  }
});

test('manifest commandArgs alter the broker input and candidate digests', async () => {
  const base = createPq022RelayReauthorBrowserManifest();
  const changed = createPq022RelayReauthorBrowserManifest({
    commandArgs: [...base.commandArgs, '--unexpected-selector-change'],
  });
  const [baseDigests, changedDigests] = await Promise.all([
    computeGateDigestsFromManifest({ root: ROOT, manifest: base }),
    computeGateDigestsFromManifest({ root: ROOT, manifest: changed }),
  ]);
  assert.notEqual(baseDigests.inputDigest, changedDigests.inputDigest);
  assert.notEqual(baseDigests.manifestDigest, changedDigests.manifestDigest);
  assert.notEqual(baseDigests.candidateDigest, changedDigests.candidateDigest);
});

test('Electron accepts only current primary Browser evidence backed by the consumed-claim ledger', () => {
  const digests = {
    candidateDigest: 'candidate-current',
    manifestDigest: 'manifest-current',
    inputDigest: 'input-current',
  };
  const receipt = {
    disposition: 'PASS',
    brokerManifestId: 'pq022-relay-reauthor-browser',
    broker: {
      diagnostic: false,
      primaryAcceptance: true,
      claimId: 'claim-current',
      mode: 'acceptance',
      runtimeKind: 'browser',
      ...digests,
    },
  };
  const consumedClaim = {
    claimId: 'claim-current',
    mode: 'acceptance',
    runtimeKind: 'browser',
    candidateDigest: digests.candidateDigest,
    digests: { ...digests },
  };
  assert.equal(assertCurrentPq022RelayBrowserReceipt({ receipt, digests, consumedClaim }), true);
  assert.throws(() => assertCurrentPq022RelayBrowserReceipt({
    receipt: { ...receipt, broker: { ...receipt.broker, diagnostic: true, primaryAcceptance: false } },
    digests,
    consumedClaim,
  }), /diagnostic Browser evidence/);
  assert.throws(() => assertCurrentPq022RelayBrowserReceipt({
    receipt,
    digests: { ...digests, candidateDigest: 'candidate-new' },
    consumedClaim,
  }), /candidateDigest is stale/);
  assert.throws(() => assertCurrentPq022RelayBrowserReceipt({
    receipt,
    digests,
    consumedClaim: null,
  }), /no matching consumed-claim ledger entry/);
});

test('the relay selector retains only three prescribed shots and gates each runtime before launch', () => {
  for (const required of [
    "const ONLY = readEncodedOption('--only')",
    "ONLY === 'relay-collar'",
    "ASSETS.filter((row) => row.key === 'relay-collar')",
    "SHOT_PLAN.filter((row) => row.key === 'relay-collar')",
    "'01-relay-close.png'",
    "'02-relay-default.png'",
    "'03-relay-far.png'",
    'if (!RELAY_ONLY)',
    'browser-receipt-prerequisite',
    'readConsumedClaimLedgerEntry',
    'assertCurrentPq022RelayBrowserReceipt',
    'normalizePq022RelayReauthorReceipt(browserReport)',
    'assert.deepEqual(normalizedElectron, normalizedBrowser',
  ]) assert.ok(PROBE.includes(required), required);
  assert.equal((PROBE.match(/chromium\.launch\(/g) || []).length, 1);
  assert.equal((PROBE.match(/electron\.launch\(/g) || []).length, 1);
  assert.ok(PROBE.indexOf('requireBrokerClaimOrDiagnostic') < PROBE.indexOf('chromium.launch('));
  assert.ok(PROBE.indexOf('browser-receipt-prerequisite') < PROBE.indexOf('electron.launch('));
});

test('cross-runtime projection ignores ids and loopback origins but detects placement drift', () => {
  const makeReceipt = ({ relayId, rockId, origin, contactRingDistance = 12.3456784 }) => ({
    fixedSeed: 47,
    recordedSeed: 47,
    manifestIdentity: [{
      key: 'relay-collar',
      assetId: 'place_claim_outpost_relay',
      manifestId: 'place_claim_outpost_relay',
      family: 'relay-collar',
      source: 'assets/ships/parts/places/place_claim_outpost_relay.glb',
      release: 'assets/ships/release/parts/places/place_claim_outpost_relay.glb',
      sourceSha256: 'a'.repeat(64),
      releaseSha256: 'b'.repeat(64),
      sourceBytes: 100,
      releaseBytes: 80,
      sourceManifestFile: 'places/place_claim_outpost_relay.glb',
    }],
    relayPlacement: {
      relayId,
      rockId,
      sectorId: 'sector_helios_prime',
      placeId: 'place_claim_outpost_relay',
      placeScale: 1,
      worldDressing: true,
      collides: false,
      rockRadius: 8,
      contactRingDistance,
    },
    captures: ['close', 'default', 'far'].map((framing, index) => ({
      subjectKey: 'relay-collar',
      assetId: 'place_claim_outpost_relay',
      manifestId: 'place_claim_outpost_relay',
      family: 'relay-collar',
      framing,
      requestedLod: `lod${index}`,
      sectorId: 'sector_helios_prime',
      entityId: relayId,
      runtimeIdentity: { placeId: 'place_claim_outpost_relay' },
      presentationAdmission: 'ready',
      authoredAssetState: 'authored',
      authoredAssetMode: 'release',
      authoredReadableFallbackRetained: false,
      authoredCompositionId: 'place_claim_outpost_relay',
      authoredSlots: { place: [`${origin}/assets/ships/release/parts/places/place_claim_outpost_relay.glb`] },
    })),
  });
  const browser = normalizePq022RelayReauthorReceipt(makeReceipt({
    relayId: 101,
    rockId: 9,
    origin: 'http://127.0.0.1:4173',
  }));
  const electron = normalizePq022RelayReauthorReceipt(makeReceipt({
    relayId: 501,
    rockId: 22,
    origin: 'http://127.0.0.1:49152',
  }));
  assert.deepEqual(electron, browser);
  assert.notDeepEqual(normalizePq022RelayReauthorReceipt(makeReceipt({
    relayId: 501,
    rockId: 22,
    origin: 'http://127.0.0.1:49152',
    contactRingDistance: 13,
  })), browser);
});
