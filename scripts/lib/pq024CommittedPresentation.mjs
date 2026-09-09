export const PQ024_COMMITTED_PRESENTATION_SCHEMA =
  'spaceface.pq024-committed-presentation.v1';
export const PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA =
  'spaceface.pq024-committed-transition-route.v1';
export const PQ024_COMMITTED_TRANSITION_SEMANTICS_SCHEMA =
  'spaceface.pq024-committed-transition-semantics.v1';

const IDENTITY_DIGEST_KEYS = Object.freeze([
  'candidateDigest',
  'sourceCandidateDigest',
  'routeDigest',
  'regressionDigest',
  'profileDigest',
  'manifestDigest',
]);

/**
 * Fail-closed contract for the player-visible state immediately after a Massline Core commits the
 * active assay. The Browser/Electron actor supplies a DOM snapshot; this pure check keeps the
 * acceptance predicate seconds-scale and gives stale transition frames causal diagnostics.
 *
 * PQ-130.06/.09 RE-AIM: the four assertions that read `.ast-inspector` (kicker "Site overview",
 * title "Anchored claim", the "Survey record:" body and its "Awaiting first real output"
 * consequence) are GONE, because the context bay they read is gone — design law §10 deleted it and
 * §6.4 replaced it with a hover-only cursor lens that is closed in this frame by construction.
 * Kept as-is they would have gone on passing against `''` forever. The committed truth now lives
 * where a player can actually see it: the crest chips. The fifth assertion (no stale
 * occupied-placement error) is re-aimed at the crest's one alert slot, which is where the
 * pre-commit warning "Unanchored — install a Core before leaving" really is — an assertion with a
 * live counter-example instead of a regex that can never match.
 */
export function assessPq024CommittedPresentation(snapshot, { expectedSiteId = null } = {}) {
  const failures = [];
  const row = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const owner = row.owner && typeof row.owner === 'object' ? row.owner : {};
  const siteId = text(owner.siteId);
  const wantedSiteId = expectedSiteId == null ? null : text(expectedSiteId);
  const cells = Number(owner.cells);
  const claimText = text(row.claimText);
  const assayText = text(row.assayText);
  const alertText = text(row.alertText);

  if (!siteId) failures.push('owner site id is missing');
  if (wantedSiteId && siteId !== wantedSiteId) {
    failures.push(`owner site id is "${siteId}", expected "${wantedSiteId}"`);
  }
  if (owner.anchored !== true) failures.push('owner site is not anchored');
  if (owner.lifecycle !== 'committed') {
    failures.push(`owner lifecycle is "${text(owner.lifecycle)}", expected "committed"`);
  }
  if (!(Number.isInteger(cells) && cells > 0)) {
    failures.push(`owner committed cell count is invalid: ${String(owner.cells)}`);
  }
  if (claimText !== 'Anchored') {
    failures.push(`claim chip is "${claimText}", expected "Anchored"`);
  }
  const expectedAssay = Number.isInteger(cells) && cells > 0 ? `Assay ${cells} cells` : null;
  if (!expectedAssay || assayText !== expectedAssay) {
    failures.push(`assay chip is "${assayText}", expected "${expectedAssay || 'Assay <cells> cells'}"`);
  }
  if (/unanchored/i.test(alertText)) {
    failures.push(`crest alert still warns the claim is unanchored: "${alertText}"`);
  }

  return {
    schema: PQ024_COMMITTED_PRESENTATION_SCHEMA,
    pass: failures.length === 0,
    failures,
  };
}

/**
 * Normalize the broker identity fields that bind the committed-transition Browser receipt to the
 * exact manifest candidate Electron is about to replay. Missing fields remain null so comparisons
 * fail closed instead of silently narrowing the identity boundary.
 */
export function projectPq024CommittedIdentityDigests(digests) {
  const row = digests && typeof digests === 'object' ? digests : {};
  return Object.fromEntries(IDENTITY_DIGEST_KEYS.map((key) => [key, text(row[key]) || null]));
}

/**
 * Validate and normalize only the public route through the committed Core presentation. The raw
 * selected/Core asteroid ids must agree inside each receipt, then collapse to sameAsteroid so
 * cross-host semantics exclude transient ids and image bytes. Every owner and visible-state claim
 * required by the screenshot is revalidated here.
 */
export function assessPq024CommittedTransitionReceipt(receipt, {
  expectedFixedSeed = null,
  expectedManifestId = 'pq024-committed-transition',
  expectedRuntime = null,
} = {}) {
  const failures = [];
  const row = receipt && typeof receipt === 'object' ? receipt : {};
  const observations = row.observations && typeof row.observations === 'object'
    ? row.observations
    : {};
  const cargo = Array.isArray(observations.cargo) ? observations.cargo : [];
  const presentation = observations.committedPresentation
    && typeof observations.committedPresentation === 'object'
    ? observations.committedPresentation
    : {};
  const core = observations.core && typeof observations.core === 'object'
    ? observations.core
    : {};
  const survey = observations.surveyReveal && typeof observations.surveyReveal === 'object'
    ? observations.surveyReveal
    : {};
  const fixedSeed = finiteOrNull(row.fixedSeed);
  const recordedSeed = finiteOrNull(row.recordedSeed);
  const surveyRevealed = integerOrNull(survey.revealed);
  const surveyCells = integerOrNull(survey.cells);
  const coreSiteId = text(core.siteId) || null;
  const selectedAsteroidId = integerOrNull(observations.asteroid?.targetEntityId);
  const coreAsteroidId = integerOrNull(core.asteroidId);
  const sameAsteroid = selectedAsteroidId != null
    && coreAsteroidId != null
    && selectedAsteroidId === coreAsteroidId;
  const presentationAssessment = assessPq024CommittedPresentation(presentation, {
    expectedSiteId: coreSiteId,
  });

  if (row.schema !== PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA) {
    failures.push(`route schema is "${text(row.schema)}"`);
  }
  if (row.disposition !== 'PASS') failures.push('route disposition is not PASS');
  const wantedRuntime = text(expectedRuntime);
  if (!wantedRuntime) failures.push('expected runtime is required');
  else if (text(row.runtime) !== wantedRuntime) {
    failures.push(`runtime is "${text(row.runtime)}", expected "${wantedRuntime}"`);
  }
  if (text(row.brokerManifestId) !== expectedManifestId) {
    failures.push(`broker manifest is "${text(row.brokerManifestId)}"`);
  }
  if (expectedFixedSeed != null && fixedSeed !== Number(expectedFixedSeed)) {
    failures.push(`fixed seed is ${String(fixedSeed)}, expected ${String(expectedFixedSeed)}`);
  }
  if (fixedSeed == null || recordedSeed !== fixedSeed) {
    failures.push(`recorded seed ${String(recordedSeed)} does not match fixed seed ${String(fixedSeed)}`);
  }
  if (!sameAsteroid) {
    failures.push(`selected/Core asteroid identity mismatch: ${String(selectedAsteroidId)} / ${String(coreAsteroidId)}`);
  }
  if (!coreSiteId) failures.push('Core site identity is missing');
  if (core.anchored !== true || core.lifecycle !== 'committed') {
    failures.push('Core owner state is not anchored/committed');
  }
  if (integerOrNull(core.cell?.col) == null || integerOrNull(core.cell?.row) == null) {
    failures.push('Core cell is not an integer coordinate');
  }
  if (!(surveyRevealed > 0 && surveyCells > 0 && surveyRevealed <= surveyCells)) {
    failures.push(`survey reveal is invalid: ${String(surveyRevealed)}/${String(surveyCells)}`);
  }
  if (integerOrNull(presentation.owner?.cells) !== surveyCells) {
    failures.push('visible committed assay cell count does not match the public survey');
  }
  for (const failure of presentationAssessment.failures) {
    failures.push(`committed presentation: ${failure}`);
  }
  if (cargo.length === 0 || cargo.some((item) => (
    !text(item?.commodityId)
    || !(finiteOrNull(item?.qty) > 0)
    || !(differenceOrNull(item?.after?.owned, item?.before?.owned) > 0)
  ))) {
    failures.push('public construction-cargo acquisition is missing or invalid');
  }

  const screenshots = Array.isArray(row.screenshots) ? row.screenshots : [];
  if (screenshots.length !== 1) failures.push(`expected one retained screenshot, got ${screenshots.length}`);
  const screenshot = screenshots[0] || {};
  if (!/03-core-committed\.png$/i.test(text(screenshot.path).replace(/\\/g, '/'))) {
    failures.push('retained screenshot is not 03-core-committed.png');
  }
  if (!(finiteOrNull(screenshot.bytes) > 0) || !/^[0-9a-f]{64}$/i.test(text(screenshot.sha256))) {
    failures.push('retained screenshot metadata is invalid');
  }
  for (const downstream of [
    'extractor', 'production', 'relay', 'saved', 'continued',
    'restoredAsteroid', 'reentered', 'restoredRelay',
  ]) {
    if (Object.prototype.hasOwnProperty.call(observations, downstream)) {
      failures.push(`downstream observation is present: ${downstream}`);
    }
  }

  const projection = {
    schema: PQ024_COMMITTED_TRANSITION_SEMANTICS_SCHEMA,
    fixedSeed,
    recordedSeed,
    cargo: cargo.map((item) => ({
      commodityId: text(item?.commodityId) || null,
      requested: finiteOrNull(item?.qty),
      acquired: differenceOrNull(item?.after?.owned, item?.before?.owned),
    })),
    sameAsteroid,
    survey: { revealed: surveyRevealed, cells: surveyCells },
    core: {
      siteId: coreSiteId,
      anchored: core.anchored === true,
      lifecycle: text(core.lifecycle) || null,
      cell: {
        col: integerOrNull(core.cell?.col),
        row: integerOrNull(core.cell?.row),
      },
    },
    presentation: {
      owner: {
        siteId: text(presentation.owner?.siteId) || null,
        anchored: presentation.owner?.anchored === true,
        lifecycle: text(presentation.owner?.lifecycle) || null,
        cells: integerOrNull(presentation.owner?.cells),
      },
      claimText: text(presentation.claimText),
      assayText: text(presentation.assayText),
      alertText: text(presentation.alertText),
    },
  };

  return {
    schema: 'spaceface.pq024-committed-transition-validation.v1',
    pass: failures.length === 0,
    failures,
    projection,
  };
}

/**
 * Pure Electron prelaunch gate for the retained Browser evidence. Nothing host-specific may start
 * until this proves the complete committed semantic receipt and its exact current broker identity.
 */
export function assessPq024CommittedElectronPrelaunch(browserReceipt, {
  expectedFixedSeed = null,
  expectedManifestId = 'pq024-committed-transition',
  currentDigests = null,
} = {}) {
  const failures = [];
  const semantic = assessPq024CommittedTransitionReceipt(browserReceipt, {
    expectedFixedSeed,
    expectedManifestId,
    expectedRuntime: 'browser-chromium-headed',
  });
  for (const failure of semantic.failures) failures.push(`Browser receipt: ${failure}`);

  const broker = browserReceipt?.broker && typeof browserReceipt.broker === 'object'
    ? browserReceipt.broker
    : {};
  if (broker.primaryAcceptance !== true) {
    failures.push('Browser receipt is not primary acceptance evidence');
  }
  if (text(broker.manifestId) !== expectedManifestId) {
    failures.push(`Browser broker manifest is "${text(broker.manifestId)}"`);
  }

  const actualDigestRow = broker.digests && typeof broker.digests === 'object'
    ? broker.digests
    : {};
  const currentDigestRow = currentDigests && typeof currentDigests === 'object'
    ? currentDigests
    : {};
  for (const key of IDENTITY_DIGEST_KEYS) {
    const currentPresent = Object.prototype.hasOwnProperty.call(currentDigestRow, key);
    const actualPresent = Object.prototype.hasOwnProperty.call(actualDigestRow, key);
    if (!currentPresent) failures.push(`current digest is missing ${key}`);
    if (!actualPresent) failures.push(`Browser receipt digest is missing ${key}`);
    if (currentPresent && actualPresent) {
      const expected = text(currentDigestRow[key]) || null;
      const actual = text(actualDigestRow[key]) || null;
      if (actual !== expected) failures.push(`Browser receipt digest is stale for ${key}`);
    }
  }

  return {
    schema: 'spaceface.pq024-committed-electron-prelaunch.v1',
    pass: failures.length === 0,
    failures,
    projection: semantic.projection,
    browserDigests: projectPq024CommittedIdentityDigests(actualDigestRow),
    currentDigests: projectPq024CommittedIdentityDigests(currentDigestRow),
  };
}

function text(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function finiteOrNull(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = finiteOrNull(value);
  return Number.isInteger(number) ? number : null;
}

function differenceOrNull(after, before) {
  const right = finiteOrNull(after);
  const left = finiteOrNull(before);
  return right == null || left == null ? null : right - left;
}
