// Stable cross-runtime projection for the revised PQ-022 relay presentation cell.
// Runtime entity ids, loopback origins, screenshot hashes, and renderer-specific diagnostics are
// deliberately excluded. Browser and Electron must agree on identity, admission, and placement.

const RELAY_KEY = 'relay-collar';

export function normalizePq022RelayReauthorReceipt(receipt) {
  const identity = receipt?.manifestIdentity?.find((row) => row?.key === RELAY_KEY) || null;
  const placement = receipt?.relayPlacement || null;
  const captures = (receipt?.captures || [])
    .filter((row) => row?.subjectKey === RELAY_KEY)
    .map((row) => ({
      subjectKey: row.subjectKey,
      assetId: row.assetId ?? null,
      manifestId: row.manifestId ?? null,
      family: row.family ?? null,
      framing: row.framing ?? null,
      requestedLod: row.requestedLod ?? null,
      sectorId: row.sectorId ?? null,
      runtimeIdentity: {
        placeId: row.runtimeIdentity?.placeId ?? null,
      },
      presentationAdmission: row.presentationAdmission ?? null,
      authoredAssetState: row.authoredAssetState ?? null,
      authoredAssetMode: row.authoredAssetMode ?? null,
      authoredReadableFallbackRetained: row.authoredReadableFallbackRetained ?? null,
      authoredCompositionId: row.authoredCompositionId ?? null,
      authoredSlots: normalizeAuthoredSlots(row.authoredSlots),
    }));

  return {
    schema: 'spaceface.pq022-relay-reauthor-parity.v1',
    fixedSeed: receipt?.fixedSeed ?? null,
    recordedSeed: receipt?.recordedSeed ?? null,
    identity: identity ? {
      key: identity.key,
      assetId: identity.assetId,
      manifestId: identity.manifestId,
      family: identity.family,
      source: normalizePath(identity.source),
      release: normalizePath(identity.release),
      sourceSha256: identity.sourceSha256,
      releaseSha256: identity.releaseSha256,
      sourceBytes: identity.sourceBytes,
      releaseBytes: identity.releaseBytes,
      sourceManifestFile: normalizePath(identity.sourceManifestFile),
    } : null,
    placement: placement ? {
      sectorId: placement.sectorId ?? null,
      placeId: placement.placeId ?? null,
      placeScale: finiteNumber(placement.placeScale),
      worldDressing: placement.worldDressing === true,
      collides: placement.collides === true,
      rockRadius: finiteNumber(placement.rockRadius),
      contactRingDistance: finiteNumber(placement.contactRingDistance),
    } : null,
    admission: captures,
  };
}

export function assertCurrentPq022RelayBrowserReceipt({ receipt, digests, consumedClaim }) {
  invariant(receipt?.disposition === 'PASS', 'paired Browser receipt must pass');
  invariant(
    receipt?.brokerManifestId === 'pq022-relay-reauthor-browser',
    'paired Browser receipt manifest identity drifted',
  );
  const broker = receipt?.broker;
  invariant(broker?.diagnostic === false, 'diagnostic Browser evidence cannot authorize Electron');
  invariant(broker?.primaryAcceptance === true, 'Browser evidence must be primary acceptance');
  invariant(broker?.mode === 'acceptance', 'Browser broker claim must use acceptance mode');
  invariant(broker?.runtimeKind === 'browser', 'Browser broker claim runtime kind drifted');
  invariant(typeof broker?.claimId === 'string' && broker.claimId.length > 0,
    'Browser receipt must carry its consumed broker claim id');
  for (const key of ['candidateDigest', 'manifestDigest', 'inputDigest']) {
    invariant(typeof digests?.[key] === 'string' && digests[key].length > 0,
      `current Browser ${key} is required`);
    invariant(broker?.[key] === digests[key], `Browser receipt ${key} is stale`);
  }
  invariant(consumedClaim?.claimId === broker.claimId,
    'Browser receipt claim id has no matching consumed-claim ledger entry');
  invariant(consumedClaim?.mode === 'acceptance', 'Browser consumed claim was not acceptance mode');
  invariant(consumedClaim?.runtimeKind === 'browser', 'Browser consumed claim runtime kind drifted');
  for (const key of ['candidateDigest', 'manifestDigest', 'inputDigest']) {
    const ledgerValue = key === 'candidateDigest'
      ? consumedClaim?.candidateDigest ?? consumedClaim?.digests?.candidateDigest
      : consumedClaim?.digests?.[key];
    invariant(ledgerValue === digests[key], `Browser consumed claim ${key} is stale`);
  }
  return true;
}

function normalizeAuthoredSlots(slots) {
  return Object.fromEntries(Object.entries(slots || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, urls]) => [slot, [].concat(urls || []).map(normalizeAssetUrl).sort()]));
}

function normalizeAssetUrl(value) {
  const normalized = normalizePath(value);
  const assetIndex = normalized.indexOf('/assets/');
  return assetIndex >= 0 ? normalized.slice(assetIndex + 1) : normalized.replace(/^\/+/, '');
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(6)) : null;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
