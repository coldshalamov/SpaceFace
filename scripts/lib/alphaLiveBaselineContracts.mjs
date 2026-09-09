import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCallback);
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render|microsoft basic|softpipe|mesa offscreen|apple software|\bwarp\b/i;
const GENERIC_GPU_IDENTITY = /^(?:webgl|webkit|webkit webgl|angle|unknown|generic|gpu|renderer|adapter|google inc\.?|google)$/i;
const GENERIC_GPU_RENDERER = /^(?:webgl|webkit|webkit webgl|angle|unknown|generic|gpu|renderer|adapter|google inc\.?|google|nvidia|intel|amd|ati|geforce|radeon)$/i;
const STATION_FRAME_FLOOR = 30;
const COMPUTED_ROLE_BOUNDARIES = Object.freeze(['before-settlement', 'after-settlement']);
const DIAGNOSTIC_NAME_SOURCES = new Set(['none', 'aria-labelledby', 'aria-label', 'visible-text', 'text-content', 'title']);

export function classifyHardwareGpu(observation = {}) {
  const hasContext = observation.hasContext === true;
  const debugExtensionAvailable = observation.debugExtensionAvailable === true;
  const unmaskedVendor = cleanText(observation.unmaskedVendor);
  const unmaskedRenderer = cleanText(observation.unmaskedRenderer);
  const maskedVendor = cleanText(observation.maskedVendor);
  const maskedRenderer = cleanText(observation.maskedRenderer);
  const runtimeGpu = observation.runtimeGpu && typeof observation.runtimeGpu === 'object'
    ? {
      vendor: cleanText(observation.runtimeGpu.vendor),
      renderer: cleanText(observation.runtimeGpu.renderer),
      tier: cleanText(observation.runtimeGpu.tier).toLowerCase(),
      software: typeof observation.runtimeGpu.software === 'boolean' ? observation.runtimeGpu.software : null,
    }
    : null;
  const failures = [];

  if (!hasContext) failures.push('canonical flight canvas has no WebGL context');
  if (!debugExtensionAvailable) failures.push('WEBGL debug renderer extension is unavailable');
  if (!unmaskedVendor) failures.push('unmasked WebGL vendor identity is empty');
  if (!unmaskedRenderer) failures.push('unmasked WebGL renderer identity is empty');
  if (!maskedVendor) failures.push('masked WebGL vendor value is empty');
  if (!maskedRenderer) failures.push('masked WebGL renderer value is empty');
  if (unmaskedVendor && GENERIC_GPU_IDENTITY.test(unmaskedVendor)) {
    failures.push(`unmasked WebGL vendor identity is generic: ${unmaskedVendor}`);
  }
  if (unmaskedRenderer && GENERIC_GPU_IDENTITY.test(unmaskedRenderer)) {
    failures.push(`unmasked WebGL renderer identity is generic: ${unmaskedRenderer}`);
  }

  const browserIdentity = `${unmaskedVendor} / ${unmaskedRenderer}`.trim();
  const allIdentityText = [unmaskedVendor, unmaskedRenderer, runtimeGpu?.vendor, runtimeGpu?.renderer].filter(Boolean).join(' / ');
  if (SOFTWARE_RENDERER.test(allIdentityText)) {
    failures.push(`software renderer identity is forbidden: ${allIdentityText}`);
  }

  if (!runtimeGpu) {
    failures.push('runtime GPU state is missing');
  } else {
    if (!runtimeGpu.vendor || !runtimeGpu.renderer) failures.push('runtime GPU identity is incomplete');
    if (runtimeGpu.vendor && GENERIC_GPU_IDENTITY.test(runtimeGpu.vendor)) {
      failures.push(`generic runtime GPU vendor is forbidden: ${runtimeGpu.vendor}`);
    }
    if (runtimeGpu.renderer && GENERIC_GPU_RENDERER.test(runtimeGpu.renderer)) {
      failures.push(`generic runtime GPU renderer is forbidden: ${runtimeGpu.renderer}`);
    }
    if (!['integrated', 'discrete'].includes(runtimeGpu.tier)) {
      failures.push(`runtime GPU tier must be integrated or discrete, got ${runtimeGpu.tier || 'missing'}`);
    }
    if (runtimeGpu.software !== false) failures.push('runtime GPU state classified the renderer as software');
    if (unmaskedRenderer && runtimeGpu.renderer
      && !gpuRendererModelsAreConsistent(unmaskedRenderer, runtimeGpu.renderer)) {
      failures.push(`runtime GPU identity is not consistent with unmasked WebGL identity: ${runtimeGpu.vendor} / ${runtimeGpu.renderer}`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    hasContext,
    debugExtensionAvailable,
    unmaskedVendor,
    unmaskedRenderer,
    maskedVendor,
    maskedRenderer,
    runtimeGpu,
    identity: browserIdentity,
    softwarePattern: SOFTWARE_RENDERER.source,
  };
}

export function validateStationFrameSequence(frames, { minFrames = STATION_FRAME_FLOOR } = {}) {
  const sequence = Array.isArray(frames) ? frames.map(cloneStationFrame) : [];
  const requirement = stationFrameRequirement(minFrames);
  const failures = requirement.failure ? [requirement.failure] : [];
  if (sequence.length < requirement.minimum) {
    failures.push(`station settlement requires at least ${requirement.minimum} consecutive requestAnimationFrame observations, got ${sequence.length}`);
  }

  const first = sequence[0] || null;
  const expectedStationId = cleanText(first?.stationId);
  const expectedTabs = normalizeLabels(first?.visibleTabLabels);
  const expectedFingerprint = cleanText(first?.contentFingerprint);
  for (let index = 0; index < sequence.length; index += 1) {
    const frame = sequence[index];
    const label = `station frame ${index + 1}`;
    if (frame.source !== 'requestAnimationFrame') failures.push(`${label} was not sourced from requestAnimationFrame`);
    if (!Number.isFinite(frame.index) || !Number.isInteger(frame.index)) {
      failures.push(`${label} must carry a finite integer index`);
    } else if (index > 0 && Number.isInteger(sequence[index - 1].index)
      && frame.index !== sequence[index - 1].index + 1) {
      failures.push(`${label} is not consecutive with the preceding requestAnimationFrame observation`);
    }
    validateBooleanField(frame, 'docked', label, failures);
    if (frame.docked !== true) failures.push(`${label} lost docked state`);
    if (!cleanText(frame.stationId)) failures.push(`${label} has no station identity`);
    else if (expectedStationId && cleanText(frame.stationId) !== expectedStationId) {
      failures.push(`${label} changed station identity from ${expectedStationId} to ${cleanText(frame.stationId)}`);
    }
    const rect = frame.screenRect || {};
    validateBooleanField(frame, 'screenVisible', label, failures);
    validateVisibilityDiagnostics(rect, `${label} station screen`, failures);
    if (frame.screenVisible !== true) {
      failures.push(`${label} did not visibly render the station screen`);
    }
    const labels = normalizeLabels(frame.visibleTabLabels);
    if (labels.length === 0) failures.push(`${label} exposed no visible station tabs`);
    else if (expectedTabs.length > 0 && JSON.stringify(labels) !== JSON.stringify(expectedTabs)) {
      failures.push(`${label} changed visible station tab labels`);
    }
    const fingerprint = cleanText(frame.contentFingerprint);
    if (!fingerprint) failures.push(`${label} has no visible content fingerprint`);
    else if (expectedFingerprint && fingerprint !== expectedFingerprint) {
      failures.push(`${label} changed visible content fingerprint`);
    }
    if (!(Number(frame.contentLength) > 0)) failures.push(`${label} exposed no visible station content`);
    const undockAction = frame.undockAction && typeof frame.undockAction === 'object'
      ? frame.undockAction
      : {};
    if (cleanText(undockAction.selector) !== 'button.st-undock') {
      failures.push(`${label} did not retain the canonical Undock action identity button.st-undock`);
    }
    validateCountField(undockAction, 'canonicalMatchCount', `${label} canonical match count`, failures);
    if (Number.isInteger(undockAction.canonicalMatchCount) && undockAction.canonicalMatchCount !== 1) {
      failures.push(`${label} requires exactly one canonical Undock match, got ${String(undockAction.canonicalMatchCount)}`);
    }
    validateCountField(undockAction, 'visibleCanonicalMatchCount', `${label} visible canonical match count`, failures);
    if (Number.isInteger(undockAction.visibleCanonicalMatchCount) && undockAction.visibleCanonicalMatchCount !== 1) {
      failures.push(`${label} requires exactly one visible canonical Undock match, got ${String(undockAction.visibleCanonicalMatchCount)}`);
    }
    for (const field of [
      'present',
      'visible',
      'isConnected',
      'containedByStationScreen',
      'effectiveAriaHidden',
      'effectiveInert',
      'effectiveAriaDisabled',
      'disabled',
    ]) {
      validateBooleanField(undockAction, field, `${label} canonical Undock action`, failures);
    }
    validateBooleanField(frame, 'undockVisible', label, failures);
    validateVisibilityDiagnostics(undockAction.visibilityDiagnostics, `${label} canonical Undock action`, failures);
    if (undockAction.present !== true) failures.push(`${label} did not contain the canonical Undock action`);
    if (frame.undockVisible !== true || undockAction.visible !== true) {
      failures.push(`${label} hid the visible canonical Undock action`);
    }
    if (undockAction.isConnected !== true) failures.push(`${label} canonical Undock action was not connected to the document`);
    if (undockAction.containedByStationScreen !== true) {
      failures.push(`${label} canonical Undock action was not contained by the station screen`);
    }

    validateAccessibilityAncestry(undockAction, label, failures);
    validateDiagnosticNameTelemetry(undockAction, label, failures);
    if (undockAction.disabled !== false) failures.push(`${label} canonical Undock action is native disabled or missing enabled state`);
    if (!(undockAction.ariaDisabled === null || typeof undockAction.ariaDisabled === 'string')) {
      failures.push(`${label} canonical Undock ariaDisabled provenance must be string or null`);
    }
    if (cleanText(undockAction.ariaDisabled).toLowerCase() === 'true') {
      failures.push(`${label} canonical Undock action has aria-disabled=true on the selected control`);
    }
    if (undockAction.effectiveAriaDisabled !== false) {
      failures.push(`${label} canonical Undock action has effective aria-disabled=true ancestry or missing state`);
    }
    if (!isOverlayVisuallyHidden(frame.overlay)) {
      failures.push(`${label} retained an overlay that was visually present`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    minimumRequiredFrames: requirement.minimum,
    consecutiveFrameCount: sequence.length,
    stationId: expectedStationId || null,
    visibleTabLabels: expectedTabs,
    contentFingerprint: expectedFingerprint || null,
    overlayDiagnostics: sequence.map((frame) => ({
      index: frame.index,
      visuallyHidden: isOverlayVisuallyHidden(frame.overlay),
      overlay: frame.overlay || { present: false },
    })),
    sequence,
  };
}

export function validateFinalStationFrameSuffix(frames, { minFrames = STATION_FRAME_FLOOR } = {}) {
  const observations = Array.isArray(frames) ? frames : [];
  const requirement = stationFrameRequirement(minFrames);
  const suffixStartIndex = Math.max(0, observations.length - requirement.minimum);
  const suffix = observations.slice(suffixStartIndex);
  const validation = validateStationFrameSequence(suffix, { minFrames: requirement.minimum });
  const failures = requirement.failure ? [requirement.failure, ...validation.failures] : validation.failures;
  return {
    ...validation,
    pass: failures.length === 0,
    failures,
    observationCount: observations.length,
    suffixStartIndex,
    suffixEndIndex: observations.length > 0 ? observations.length - 1 : null,
    selectionPolicy: `final contiguous ${requirement.minimum}-frame suffix only`,
  };
}

export function validateComputedUndockRoleProofs(proofs) {
  const sequence = Array.isArray(proofs) ? proofs.map((proof) => ({ ...proof })) : [];
  const failures = [];
  if (sequence.length !== COMPUTED_ROLE_BOUNDARIES.length) {
    failures.push(`computed role/name authority requires ${COMPUTED_ROLE_BOUNDARIES.length} bracket proofs, got ${sequence.length}`);
  }
  for (const boundary of COMPUTED_ROLE_BOUNDARIES) {
    const matches = sequence.filter((proof) => cleanText(proof.boundary) === boundary);
    if (matches.length !== 1) {
      failures.push(`computed role/name authority requires exactly one ${boundary} proof, got ${matches.length}`);
    }
  }
  for (let index = 0; index < sequence.length; index += 1) {
    const proof = sequence[index];
    const label = `computed Undock proof ${index + 1} (${cleanText(proof.boundary) || 'missing boundary'})`;
    if (cleanText(proof.selector) !== 'button.st-undock') failures.push(`${label} lost the canonical selector`);
    validateCountField(proof, 'canonicalCount', `${label} document-wide canonical count`, failures);
    validateCountField(proof, 'computedRoleCount', `${label} global computed role/name count`, failures);
    validateCountField(proof, 'identityBoundCount', `${label} identity-bound canonical role/name count`, failures);
    if (Number.isInteger(proof.canonicalCount) && proof.canonicalCount !== 1) {
      failures.push(`${label} document-wide canonical count must be exactly one, got ${proof.canonicalCount}`);
    }
    if (Number.isInteger(proof.identityBoundCount) && proof.identityBoundCount !== 1) {
      failures.push(`${label} identity-bound canonical role/name count must be exactly one, got ${proof.identityBoundCount}`);
    }
    if (Number.isInteger(proof.computedRoleCount) && Number.isInteger(proof.identityBoundCount)
      && proof.computedRoleCount < proof.identityBoundCount) {
      failures.push(`${label} global computed role/name count cannot be lower than identity-bound canonical count`);
    }
    for (const field of ['canonicalVisible', 'canonicalEnabled']) {
      validateBooleanField(proof, field, label, failures);
      if (proof[field] !== true) failures.push(`${label} ${field} must be true`);
    }
    if (typeof proof.ariaSnapshot !== 'string' || !cleanText(proof.ariaSnapshot)) {
      failures.push(`${label} Playwright ARIA snapshot is missing`);
    }
  }
  return {
    pass: failures.length === 0,
    failures,
    requiredBoundaries: COMPUTED_ROLE_BOUNDARIES.slice(),
    sequence,
  };
}

export function isOverlayVisuallyHidden(overlay) {
  if (!overlay || overlay.present !== true) return true;
  if (overlay.hidden === true) return true;
  if (cleanText(overlay.display).toLowerCase() === 'none') return true;
  if (['hidden', 'collapse'].includes(cleanText(overlay.visibility).toLowerCase())) return true;
  const opacity = Number(overlay.opacity);
  if (Number.isFinite(opacity) && opacity <= 0.01) return true;
  const width = Number(overlay.width);
  const height = Number(overlay.height);
  if (Number.isFinite(width) && Number.isFinite(height) && Math.max(0, width) * Math.max(0, height) <= 1) return true;
  return false;
}

export async function worktreeFingerprint(root, {
  execFileImpl = execFileAsync,
  lstatImpl = lstat,
  readFileImpl = readFile,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const commands = [
    ['rev-parse', 'HEAD'],
    ['branch', '--show-current'],
    ['status', '--porcelain=v2', '-z', '--untracked-files=no'],
    ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.'],
    ['diff', '--binary', '--no-ext-diff', '--cached', 'HEAD', '--', '.'],
    ['ls-files', '--stage', '-z'],
  ];
  const hash = createHash('sha256');
  const outputs = [];
  for (const args of commands) {
    const result = await execFileImpl('git', args, {
      cwd: resolvedRoot,
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
    });
    const stdout = toBuffer(result?.stdout);
    outputs.push(stdout);
    hash.update(`git ${args.join(' ')}\0`);
    hash.update(stdout);
    hash.update('\0');
  }

  const untrackedArgs = ['ls-files', '--others', '--exclude-standard', '-z'];
  const untrackedResult = await execFileImpl('git', untrackedArgs, {
    cwd: resolvedRoot,
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  const untrackedNamesBuffer = toBuffer(untrackedResult?.stdout);
  const untrackedPaths = untrackedNamesBuffer.toString('utf8').split('\0').filter(Boolean).sort();
  const untracked = await fingerprintUntrackedFiles(resolvedRoot, untrackedPaths, { lstatImpl, readFileImpl });
  hash.update(`git ${untrackedArgs.join(' ')}\0`);
  hash.update(untrackedNamesBuffer);
  hash.update('\0untracked-content\0');
  hash.update(untracked.digest);
  hash.update('\0');

  const head = outputs[0].toString('utf8').trim();
  const branch = outputs[1].toString('utf8').trim() || 'detached';
  const dirty = outputs.slice(2).some((output) => output.length > 0) || untracked.entries.length > 0;
  const digest = hash.digest('hex');
  return {
    branch,
    head,
    dirty,
    digest,
    id: `${branch}@${head.slice(0, 8)}${dirty ? '+dirty' : ''}#${digest.slice(0, 12)}`,
    untrackedPolicy: 'git ls-files --others --exclude-standard -z; no additional exclusions',
    untracked: {
      count: untracked.entries.length,
      digest: untracked.digest,
      entries: untracked.entries,
    },
  };
}

export async function fingerprintUntrackedFiles(root, relativePaths, {
  lstatImpl = lstat,
  readFileImpl = readFile,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const names = [...new Set(Array.isArray(relativePaths) ? relativePaths : [])].sort();
  const hash = createHash('sha256');
  const entries = [];
  for (const gitPath of names) {
    if (!gitPath || path.isAbsolute(gitPath)) throw new Error(`untracked path must be a nonempty relative path: ${gitPath}`);
    const resolved = path.resolve(resolvedRoot, gitPath.split('/').join(path.sep));
    assertStrictDescendant(resolvedRoot, resolved, 'untracked path');
    const metadata = await lstatImpl(resolved);
    if (metadata.isSymbolicLink?.()) {
      throw new Error(`untracked symbolic link or reparse entry is not an ordinary file: ${gitPath}`);
    }
    if (!metadata.isFile?.()) throw new Error(`untracked entry is not an ordinary file: ${gitPath}`);
    const contents = toBuffer(await readFileImpl(resolved));
    if (Number.isFinite(metadata.size) && metadata.size !== contents.length) {
      throw new Error(`untracked file changed while fingerprinting: ${gitPath}`);
    }
    const entry = {
      path: gitPath,
      type: 'ordinary-file',
      mode: Number(metadata.mode) || 0,
      size: contents.length,
      contentSha256: createHash('sha256').update(contents).digest('hex'),
    };
    entries.push(entry);
    hash.update(`${entry.path}\0${entry.type}\0${entry.mode}\0${entry.size}\0${entry.contentSha256}\0`);
  }
  return { digest: hash.digest('hex'), entries };
}

export async function publishAcceptedArtifacts({
  alphaRoot,
  historyRoot,
  stagingRoot,
  acceptedRoot,
  renameImpl = rename,
  mkdirImpl = mkdir,
  statImpl = stat,
  now = () => new Date(),
} = {}) {
  const roots = validatePublicationPaths({ alphaRoot, historyRoot, stagingRoot, acceptedRoot });
  const hadAccepted = await pathExists(roots.acceptedRoot, statImpl);
  let historyPath = null;
  let priorMovedToHistory = false;
  if (hadAccepted) {
    const taskHistoryRoot = path.join(roots.historyRoot, path.basename(roots.acceptedRoot));
    assertStrictDescendant(roots.historyRoot, taskHistoryRoot, 'task history path');
    await mkdirImpl(taskHistoryRoot, { recursive: true });
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    historyPath = path.join(taskHistoryRoot, `${stamp}-${process.pid}-${randomBytes(4).toString('hex')}`);
    assertStrictDescendant(taskHistoryRoot, historyPath, 'versioned history path');
    await renameImpl(roots.acceptedRoot, historyPath);
    priorMovedToHistory = true;
  }

  try {
    await renameImpl(roots.stagingRoot, roots.acceptedRoot);
  } catch (promotionError) {
    if (priorMovedToHistory) {
      try {
        await renameImpl(historyPath, roots.acceptedRoot);
      } catch (rollbackError) {
        throw new AggregateError(
          [promotionError, rollbackError],
          'accepted evidence promotion and guarded rollback both failed',
          { cause: promotionError },
        );
      }
    }
    throw promotionError;
  }

  return {
    pass: true,
    acceptedRoot: roots.acceptedRoot,
    historyRoot: roots.historyRoot,
    historyPath,
    priorAcceptedRetained: hadAccepted,
  };
}

export function inspectCanonicalRootUrl(actualUrl, expectedRootUrl) {
  const actual = new URL(actualUrl);
  const expected = new URL(expectedRootUrl);
  const failures = [];
  if (expected.pathname !== '/') failures.push(`expected root pathname must be /, got ${expected.pathname}`);
  if (expected.search !== '') failures.push(`expected root search must be empty, got ${expected.search}`);
  if (expected.hash !== '') failures.push(`expected root hash must be empty, got ${expected.hash}`);
  if (actual.origin !== expected.origin) failures.push(`origin changed from ${expected.origin} to ${actual.origin}`);
  if (actual.pathname !== expected.pathname) failures.push(`pathname changed from ${expected.pathname} to ${actual.pathname}`);
  if (actual.search !== '') failures.push(`search became ${actual.search}`);
  if (actual.hash !== '') failures.push(`hash became ${actual.hash}`);
  return {
    pass: failures.length === 0,
    expected: expected.href,
    actual: actual.href,
    origin: actual.origin,
    pathname: actual.pathname,
    search: actual.search,
    hash: actual.hash,
    failures,
  };
}

export function evaluateCanonicalUrlAcceptance({
  expectedRootUrl,
  observations,
  postFingerprintUrlCheck,
  precloseUrlCheck,
} = {}) {
  const failures = [];
  const checkedObservations = [];
  if (!expectedRootUrl) failures.push('expected canonical root URL is missing');
  if (!Array.isArray(observations) || observations.length === 0) {
    failures.push('main-frame event/poll observations are missing');
  } else if (expectedRootUrl) {
    for (const observation of observations) {
      const actual = observation?.actual || observation?.url || '';
      let check;
      try {
        check = inspectCanonicalRootUrl(actual, expectedRootUrl);
      } catch (error) {
        check = { pass: false, actual, failures: [`invalid observed URL: ${error.message}`] };
      }
      const checked = {
        sequence: observation?.sequence ?? checkedObservations.length + 1,
        source: observation?.source || 'unknown',
        at: observation?.at || null,
        ...check,
      };
      checkedObservations.push(checked);
      if (!checked.pass) failures.push(`${checked.source} observation ${checked.sequence} drifted: ${checked.failures.join('; ')}`);
    }
    if (!checkedObservations.some((observation) => observation.source === 'framenavigated')) {
      failures.push('main-frame framenavigated observation is missing');
    }
    if (!checkedObservations.some((observation) => observation.source === 'node-live-url-poll')) {
      failures.push('Node-side live URL poll observation is missing');
    }
  }

  const postFingerprint = checkRequiredLiveUrl(postFingerprintUrlCheck, 'post-worktree-fingerprint-live', expectedRootUrl, failures);
  const preclose = checkRequiredLiveUrl(precloseUrlCheck, 'immediately-preclose-live', expectedRootUrl, failures);
  return {
    pass: failures.length === 0,
    failures,
    expectedRootUrl: expectedRootUrl ? new URL(expectedRootUrl).href : null,
    observationCount: checkedObservations.length,
    observations: checkedObservations,
    postFingerprintUrlCheck: postFingerprint,
    precloseUrlCheck: preclose,
  };
}

export function createCanonicalUrlTracker(targetPage, expectedRootUrl, options = {}) {
  const pollIntervalMs = typeof options === 'number' ? options : Number(options.pollIntervalMs || 75);
  const observations = [];
  const bootstrapObservations = [];
  const trackerErrors = [];
  const startedAt = new Date().toISOString();
  let sequence = 0;
  let enforcementStarted = false;
  let canonicalSeen = false;
  let stopping = false;
  let stoppedAt = null;

  const record = (source, url) => {
    const actual = String(url || '');
    const at = new Date().toISOString();
    if (!enforcementStarted && actual === 'about:blank') {
      const bootstrap = { sequence: ++sequence, source, at, actual, enforced: false };
      bootstrapObservations.push(bootstrap);
      return bootstrap;
    }
    enforcementStarted = true;
    let check;
    try {
      check = inspectCanonicalRootUrl(actual, expectedRootUrl);
    } catch (error) {
      check = { pass: false, actual, failures: [`invalid observed URL: ${error.message}`] };
    }
    if (check.pass) canonicalSeen = true;
    const observation = { sequence: ++sequence, source, at, enforced: true, ...check };
    observations.push(observation);
    return observation;
  };

  const onFrameNavigated = (frame) => {
    if (frame === targetPage.mainFrame()) {
      record('framenavigated', typeof frame?.url === 'function' ? frame.url() : targetPage.url());
    }
  };
  targetPage.on('framenavigated', onFrameNavigated);
  record('page-created', targetPage.url());

  const pollPromise = (async () => {
    while (!stopping) {
      await delay(pollIntervalMs);
      if (stopping || targetPage.isClosed()) continue;
      record('node-live-url-poll', targetPage.url());
    }
  })().catch((error) => trackerErrors.push(serializeError(error)));

  const report = () => {
    const violations = observations.filter((observation) => observation.pass !== true);
    const eventObservationCount = observations.filter((observation) => observation.source === 'framenavigated').length;
    const pollObservationCount = observations.filter((observation) => observation.source === 'node-live-url-poll').length;
    return {
      schema: 'spaceface.canonicalUrlLifecycle.v1',
      expectedRootUrl: new URL(expectedRootUrl).href,
      startedAt,
      stoppedAt,
      pollIntervalMs,
      bootstrapObservations: bootstrapObservations.slice(),
      enforcementStarted,
      canonicalSeen,
      observationCount: observations.length,
      eventObservationCount,
      pollObservationCount,
      observations: observations.slice(),
      violations,
      trackerErrors: trackerErrors.slice(),
      pageClosedWhenStopped: targetPage.isClosed(),
      pass: enforcementStarted && canonicalSeen && eventObservationCount > 0 && pollObservationCount > 0
        && violations.length === 0 && trackerErrors.length === 0 && targetPage.isClosed(),
    };
  };

  return {
    observeNow(source) {
      if (targetPage.isClosed()) return null;
      return record(source, targetPage.url());
    },
    async stopAfterPageClose() {
      stopping = true;
      await pollPromise;
      targetPage.off('framenavigated', onFrameNavigated);
      stoppedAt = new Date().toISOString();
      return report();
    },
    report,
  };
}

export async function closeOwnedResources(resources, {
  fetchImpl = globalThis.fetch,
  timeoutSignalFactory = (milliseconds) => AbortSignal.timeout(milliseconds),
} = {}) {
  const report = {
    pass: false,
    closed: [],
    serverReleased: false,
    browserServerClosed: resources.browserServer ? false : true,
    browserProcessExited: resources.browserServer ? false : true,
    browserProcessPid: null,
    failures: [],
    precloseUrlCheck: null,
    urlTracker: null,
  };
  if (resources.page && !resources.page.isClosed() && resources.canonicalUrlTracker) {
    report.precloseUrlCheck = resources.canonicalUrlTracker.observeNow('immediately-preclose-live');
    if (!report.precloseUrlCheck || report.precloseUrlCheck.pass !== true) {
      report.failures.push({
        name: 'immediately-preclose-live-url',
        error: { message: `canonical preclose observation failed: ${JSON.stringify(report.precloseUrlCheck)}` },
      });
    }
  } else {
    report.failures.push({
      name: 'immediately-preclose-live-url',
      error: { message: 'live page or canonical URL tracker was unavailable immediately before page close' },
    });
  }

  for (const [name, resource] of [
    ['page', resources.page],
    ['context', resources.context],
    ['browser', resources.browser],
    ['browserServer', resources.browserServer],
    ['server', resources.server],
  ]) {
    if (!resource || typeof resource.close !== 'function') {
      report.closed.push({ name, present: false, closed: true });
      continue;
    }
    try {
      await resource.close();
      report.closed.push({ name, present: true, closed: true });
    } catch (error) {
      report.closed.push({ name, present: true, closed: false });
      report.failures.push({ name, error: serializeError(error) });
    }
  }

  const browserChildProcess = resources.browserChildProcess
    || resources.browserServer?.process?.()
    || null;
  report.browserServerClosed = report.closed.find((item) => item.name === 'browserServer')?.closed === true;
  report.browserProcessPid = Number.isSafeInteger(Number(browserChildProcess?.pid))
    ? Number(browserChildProcess.pid)
    : null;
  report.browserProcessExited = !resources.browserServer
    || browserChildProcess?.exitCode != null
    || browserChildProcess?.signalCode != null;
  if (resources.browserServer && report.browserProcessPid == null) {
    report.failures.push({
      name: 'browser-process-ownership',
      error: { message: 'owned browser server did not expose its exact child process' },
    });
  }
  if (resources.browserServer && report.browserProcessExited !== true) {
    report.failures.push({
      name: 'browser-process-exit',
      error: { message: 'owned browser child process had not exited after BrowserServer.close()' },
    });
  }

  if (resources.canonicalUrlTracker) {
    try {
      report.urlTracker = await resources.canonicalUrlTracker.stopAfterPageClose();
      if (!report.urlTracker.pass) {
        report.failures.push({
          name: 'canonical-url-lifecycle',
          error: { message: `URL lifecycle tracker failed: ${JSON.stringify(report.urlTracker.violations || report.urlTracker.trackerErrors)}` },
        });
      }
    } catch (error) {
      report.failures.push({ name: 'canonical-url-lifecycle', error: serializeError(error) });
    }
  } else {
    report.failures.push({ name: 'canonical-url-lifecycle', error: { message: 'canonical URL tracker was not created' } });
  }

  if (resources.server?.server) {
    report.serverReleased = resources.server.server.listening === false;
    if (report.serverReleased && resources.server.baseUrl && typeof fetchImpl === 'function') {
      try {
        await fetchImpl(resources.server.baseUrl, { signal: timeoutSignalFactory(1_000) });
        report.serverReleased = false;
        report.failures.push({ name: 'server-release', error: { message: 'owned URL remained reachable after close' } });
      } catch (_) {
        report.serverReleased = true;
      }
    }
  } else {
    report.serverReleased = true;
  }

  report.pageClosed = resources.page ? resources.page.isClosed() : true;
  report.contextClosed = report.closed.find((item) => item.name === 'context')?.closed === true;
  report.browserDisconnected = resources.browser ? !resources.browser.isConnected() : true;
  const assessment = assessOwnedResourceCleanup({
    pageClosed: report.pageClosed,
    contextClosed: report.contextClosed,
    browserDisconnected: report.browserDisconnected,
    serverReleased: report.serverReleased,
    trackerStoppedAfterPageClose: report.urlTracker?.pageClosedWhenStopped === true,
    precloseUrlCheck: report.precloseUrlCheck,
    browserServerClosed: report.browserServerClosed,
    browserProcessExited: report.browserProcessExited,
    errors: report.failures,
  });
  for (const failure of assessment.failures) {
    if (!report.failures.some((item) => item.error?.message === failure)) {
      report.failures.push({ name: 'cleanup-assessment', error: { message: failure } });
    }
  }
  report.assessment = assessment;
  report.pass = assessment.pass && report.closed.every((item) => item.closed);
  if (!report.pass) {
    const error = new AggregateError(
      report.failures.map((failure) => new Error(`${failure.name}: ${failure.error.message}`)),
      'owned runtime cleanup failed',
    );
    error.cleanupReport = report;
    throw error;
  }
  return report;
}

export function assessOwnedResourceCleanup({
  pageClosed,
  contextClosed,
  browserDisconnected,
  serverReleased,
  trackerStoppedAfterPageClose,
  precloseUrlCheck,
  browserServerClosed = true,
  browserProcessExited = true,
  errors = [],
} = {}) {
  const failures = [];
  if (pageClosed !== true) failures.push('page remained open');
  if (contextClosed !== true) failures.push('browser context did not close cleanly');
  if (browserDisconnected !== true) failures.push('browser remained connected');
  if (serverReleased !== true) failures.push('owned server listener remained active');
  if (trackerStoppedAfterPageClose !== true) failures.push('canonical URL tracker did not stop after page close');
  if (precloseUrlCheck?.pass !== true) failures.push('immediately-preclose live URL check is missing or failed');
  if (browserServerClosed !== true) failures.push('owned browser server did not close cleanly');
  if (browserProcessExited !== true) failures.push('owned browser child process exit was not confirmed');
  if (Array.isArray(errors) && errors.length > 0) failures.push(`${errors.length} owned resource close operation(s) failed`);
  return { pass: failures.length === 0, failures };
}

function validatePublicationPaths({ alphaRoot, historyRoot, stagingRoot, acceptedRoot }) {
  const resolved = {
    alphaRoot: path.resolve(String(alphaRoot || '')),
    historyRoot: path.resolve(String(historyRoot || '')),
    stagingRoot: path.resolve(String(stagingRoot || '')),
    acceptedRoot: path.resolve(String(acceptedRoot || '')),
  };
  if (!alphaRoot || !historyRoot || !stagingRoot || !acceptedRoot) throw new Error('publication paths are required');
  assertDirectChild(resolved.alphaRoot, resolved.stagingRoot, 'staging root');
  assertDirectChild(resolved.alphaRoot, resolved.acceptedRoot, 'accepted root');
  if (!path.basename(resolved.stagingRoot).startsWith('.')) throw new Error('guarded staging root must be hidden');
  if (path.basename(resolved.acceptedRoot).startsWith('.')) throw new Error('guarded accepted root must not be hidden');
  if (resolved.stagingRoot === resolved.acceptedRoot) throw new Error('staging and accepted roots must differ');
  if (path.dirname(resolved.historyRoot) !== path.dirname(resolved.alphaRoot)
    || path.basename(resolved.historyRoot) !== `${path.basename(resolved.alphaRoot)}-history`) {
    throw new Error('guarded history root must be the alpha-history sibling outside alpha');
  }
  const historyRelativeToAlpha = path.relative(resolved.alphaRoot, resolved.historyRoot);
  if (!historyRelativeToAlpha.startsWith(`..${path.sep}`)) {
    throw new Error('guarded history root must remain outside recursively scanned alpha evidence');
  }
  return resolved;
}

function checkRequiredLiveUrl(observation, requiredSource, expectedRootUrl, failures) {
  if (!observation) {
    failures.push(`${requiredSource} observation is missing`);
    return null;
  }
  if (observation.source !== requiredSource) failures.push(`${requiredSource} observation has wrong source ${observation.source || 'missing'}`);
  if (!expectedRootUrl) return { ...observation, pass: false };
  let check;
  try {
    check = inspectCanonicalRootUrl(observation.actual || observation.url || '', expectedRootUrl);
  } catch (error) {
    check = { pass: false, actual: observation.actual || observation.url || '', failures: [`invalid live URL: ${error.message}`] };
  }
  if (!check.pass) failures.push(`${requiredSource} drifted: ${check.failures.join('; ')}`);
  return { ...observation, ...check };
}

function gpuRendererModelsAreConsistent(unmaskedRenderer, runtimeRenderer) {
  const unmasked = normalizeGpuRendererModel(unmaskedRenderer);
  const runtime = normalizeGpuRendererModel(runtimeRenderer);
  if (!unmasked || !runtime) return false;
  if (unmasked === runtime) return true;
  const [shorter, longer] = unmasked.length <= runtime.length ? [unmasked, runtime] : [runtime, unmasked];
  if (shorter.length < 8 || !longer.includes(shorter)) return false;
  const meaningfulTokens = shorter.split(' ').filter((token) => (
    token.length >= 2
    && !['angle', 'd3d11', 'd3d12', 'direct3d', 'opengl', 'vulkan'].includes(token)
  ));
  return meaningfulTokens.length >= 3;
}

function normalizeGpuRendererModel(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\((?:r|tm)\)/g, '')
    .replace(/\b(?:d3d\d+|direct3d\d*|opengl(?:\s+es)?|vulkan)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneStationFrame(frame) {
  const undockAction = frame?.undockAction && typeof frame.undockAction === 'object'
    ? frame.undockAction
    : null;
  return {
    ...frame,
    screenRect: frame?.screenRect ? { ...frame.screenRect } : null,
    visibleTabLabels: Array.isArray(frame?.visibleTabLabels) ? frame.visibleTabLabels.slice() : [],
    undockAction: undockAction ? {
      ...undockAction,
      visibilityDiagnostics: undockAction.visibilityDiagnostics
        ? { ...undockAction.visibilityDiagnostics }
        : undockAction.visibilityDiagnostics,
      ariaHiddenAncestry: Array.isArray(undockAction.ariaHiddenAncestry)
        ? undockAction.ariaHiddenAncestry.slice()
        : undockAction.ariaHiddenAncestry,
      inertAncestry: Array.isArray(undockAction.inertAncestry)
        ? undockAction.inertAncestry.slice()
        : undockAction.inertAncestry,
      ariaDisabledAncestry: Array.isArray(undockAction.ariaDisabledAncestry)
        ? undockAction.ariaDisabledAncestry.slice()
        : undockAction.ariaDisabledAncestry,
      labelledByIds: Array.isArray(undockAction.labelledByIds)
        ? undockAction.labelledByIds.slice()
        : undockAction.labelledByIds,
    } : null,
    overlay: frame?.overlay ? { ...frame.overlay } : { present: false },
  };
}

function stationFrameRequirement(requested) {
  const valid = Number.isFinite(requested) && Number.isInteger(requested) && requested >= STATION_FRAME_FLOOR;
  return {
    minimum: valid ? requested : STATION_FRAME_FLOOR,
    failure: valid
      ? null
      : `station settlement minFrames must be a finite integer at or above the program floor ${STATION_FRAME_FLOOR}, got ${String(requested)}`,
  };
}

function validateCountField(owner, field, label, failures) {
  const value = owner?.[field];
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    failures.push(`${label} must be a nonnegative finite integer`);
  }
}

function validateBooleanField(owner, field, label, failures) {
  if (typeof owner?.[field] !== 'boolean') failures.push(`${label} ${field} must be boolean`);
}

function validateVisibilityDiagnostics(diagnostics, label, failures) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    failures.push(`${label} visibility diagnostics are missing`);
    return;
  }
  const numericFields = [
    'width',
    'height',
    'intersectionWidth',
    'intersectionHeight',
    'intersectionArea',
    'viewportWidth',
    'viewportHeight',
    'effectiveOpacity',
  ];
  const allNumbersFinite = numericFields.every((field) => Number.isFinite(diagnostics[field]));
  for (const field of numericFields) {
    if (!Number.isFinite(diagnostics[field])) failures.push(`${label} visibility ${field} must be finite`);
  }
  if (typeof diagnostics.hiddenByAncestor !== 'boolean') {
    failures.push(`${label} visibility hiddenByAncestor must be boolean`);
  }
  if (allNumbersFinite && (!(diagnostics.width > 1) || !(diagnostics.height > 1)
    || !(diagnostics.intersectionWidth > 1) || !(diagnostics.intersectionHeight > 1)
    || !(diagnostics.intersectionArea > 1) || !(diagnostics.viewportWidth > 1)
    || !(diagnostics.viewportHeight > 1) || !(diagnostics.effectiveOpacity > 0.01)
    || diagnostics.hiddenByAncestor !== false)) {
    failures.push(`${label} visibility diagnostics do not prove effective viewport visibility`);
  }
}

function validateDiagnosticNameTelemetry(undockAction, label, failures) {
  const rawName = undockAction.accessibleName;
  const rawSource = undockAction.accessibleNameSource;
  if (typeof rawName !== 'string') failures.push(`${label} canonical Undock diagnostic name must be string`);
  if (typeof rawSource !== 'string') failures.push(`${label} canonical Undock diagnostic name source must be string`);
  const name = typeof rawName === 'string' ? cleanText(rawName) : '';
  const source = typeof rawSource === 'string' ? cleanText(rawSource) : '';
  if (!source) {
    failures.push(`${label} canonical Undock diagnostic name source is missing`);
  } else if (!DIAGNOSTIC_NAME_SOURCES.has(source)) {
    failures.push(`${label} canonical Undock diagnostic name source is unknown: ${source}`);
  }
  if ((name.length > 0) !== (source !== '' && source !== 'none')) {
    failures.push(`${label} canonical Undock diagnostic name and source contradict each other`);
  }
  if (!Array.isArray(undockAction.labelledByIds)) {
    failures.push(`${label} canonical Undock aria-labelledby provenance is missing`);
  } else {
    const validIds = undockAction.labelledByIds.every((id) => typeof id === 'string' && cleanText(id));
    if (!validIds) failures.push(`${label} canonical Undock aria-labelledby referenced IDs must be nonblank strings`);
    if (source === 'aria-labelledby' && undockAction.labelledByIds.length === 0) {
      failures.push(`${label} canonical Undock aria-labelledby source requires referenced IDs`);
    }
  }
}

function validateAccessibilityAncestry(undockAction, label, failures) {
  const ariaHiddenAncestry = undockAction.ariaHiddenAncestry;
  if (!Array.isArray(ariaHiddenAncestry)) {
    failures.push(`${label} canonical Undock aria-hidden ancestry telemetry is missing`);
  } else if (undockAction.effectiveAriaHidden !== false || ariaHiddenAncestry.length > 0) {
    failures.push(`${label} canonical Undock action has effective aria-hidden ancestry`);
  }

  const inertAncestry = undockAction.inertAncestry;
  if (!Array.isArray(inertAncestry)) {
    failures.push(`${label} canonical Undock inert ancestry telemetry is missing`);
  } else if (undockAction.effectiveInert !== false || inertAncestry.length > 0) {
    failures.push(`${label} canonical Undock action has effective inert ancestry`);
  }

  const ariaDisabledAncestry = undockAction.ariaDisabledAncestry;
  if (!Array.isArray(ariaDisabledAncestry)) {
    failures.push(`${label} canonical Undock aria-disabled ancestry telemetry is missing`);
  } else if (undockAction.effectiveAriaDisabled === false && ariaDisabledAncestry.length > 0) {
    failures.push(`${label} canonical Undock aria-disabled ancestry contradicts its effective state`);
  }
}

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : []).map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function assertStrictDescendant(parent, candidate, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escaped its guarded parent: ${path.resolve(candidate)}`);
  }
}

function assertDirectChild(parent, candidate, label) {
  assertStrictDescendant(parent, candidate, label);
  if (path.dirname(path.resolve(candidate)) !== path.resolve(parent)) {
    throw new Error(`${label} must be a direct child inside alpha: ${path.resolve(candidate)}`);
  }
}

async function pathExists(candidate, statImpl) {
  try {
    await statImpl(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value == null) return Buffer.alloc(0);
  return Buffer.from(String(value), 'utf8');
}

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
