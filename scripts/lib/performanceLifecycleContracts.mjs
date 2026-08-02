export const PERFORMANCE_LIFECYCLE_SCHEMA = 'spaceface.performanceLifecycleAcceptance.v1';
export const PERFORMANCE_LIFECYCLE_FIXED_SEED = 35035;
export const PERFORMANCE_LIFECYCLE_MAX_CATCHUP_STEPS = 4;
export const PERFORMANCE_LIFECYCLE_LAUNCH_POLICY_SCHEMA = 'spaceface.performanceLifecycleLaunchPolicy.v1';
export const PERFORMANCE_LIFECYCLE_MIN_FOREGROUND_FRAMES = 20;

const PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]);

const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software raster|software renderer/i;

const DELTA_FIELDS = Object.freeze([
  ['executedFrames', ['loop', 'executedFrames']],
  ['renderUpdates', ['loop', 'renderUpdates']],
  ['simulationCompletedTicks', ['simulation', 'completedSequence']],
  ['stateTicks', ['tick']],
  ['simTime', ['simTime']],
  ['gpuSubmissions', ['gpuSubmissions']],
  ['suspendCount', ['loop', 'suspendCount']],
]);

function finiteAt(value, path) {
  let current = value;
  for (const key of path) current = current && current[key];
  const number = Number(current);
  return Number.isFinite(number) ? number : 0;
}

export function summarizeLifecycleDelta(before, after) {
  return Object.fromEntries(DELTA_FIELDS.map(([name, path]) => [
    name,
    finiteAt(after, path) - finiteAt(before, path),
  ]));
}

export function foregroundWindowsComparable(previous, current, {
  minFrames = PERFORMANCE_LIFECYCLE_MIN_FOREGROUND_FRAMES,
  minRatio = 0.8,
  maxRatio = 1.25,
} = {}) {
  const previousFrames = Number(previous?.executedFrames);
  const currentFrames = Number(current?.executedFrames);
  if (!Number.isFinite(previousFrames) || !Number.isFinite(currentFrames)
    || previousFrames < minFrames || currentFrames < minFrames) return false;
  const cadenceRatio = currentFrames / previousFrames;
  return cadenceRatio >= minRatio && cadenceRatio <= maxRatio;
}

function requireDigest(failures, value, label) {
  if (!DIGEST_PATTERN.test(String(value || ''))) failures.push(`${label} must be a SHA-256 digest`);
}

function requirePositiveWindow(failures, window, label) {
  for (const field of ['executedFrames', 'renderUpdates', 'simulationCompletedTicks', 'stateTicks', 'gpuSubmissions']) {
    if (!(Number(window?.[field]) > 0)) failures.push(`${label} ${field} must be positive`);
  }
}

function validateTransition(failures, transition, runtimeKind, index) {
  const label = transition?.id || `${runtimeKind}-transition-${index + 1}`;
  if (!transition || typeof transition !== 'object') {
    failures.push(`${label} transition is required`);
    return;
  }
  if (transition.native !== true) failures.push(`${label} must use a native lifecycle transition`);
  if (transition.hiddenState !== 'hidden-or-minimized') {
    failures.push(`${label} did not reach hidden-or-minimized`);
  }
  if (!(Number(transition.hiddenDurationMs) >= 500)) failures.push(`${label} hidden duration is too short`);
  if (runtimeKind === 'browser' && transition.documentVisibilityDuring !== 'hidden') {
    failures.push(`${label} did not observe document.hidden`);
  }
  if (runtimeKind === 'electron') {
    if (transition.nativeWindowBefore?.available !== true
      || transition.nativeWindowBefore?.hidden !== false
      || transition.nativeWindowDuring?.available !== true
      || transition.nativeWindowDuring?.hidden !== true
      || transition.nativeWindowAfter?.available !== true
      || transition.nativeWindowAfter?.hidden !== false) {
      failures.push(`${label} native BrowserWindow lifecycle state is incomplete`);
    }
  }
  for (const field of [
    'executedFrames',
    'renderUpdates',
    'simulationCompletedTicks',
    'stateTicks',
    'simTime',
    'gpuSubmissions',
  ]) {
    if (Number(transition.hiddenDelta?.[field]) !== 0) {
      failures.push(`${label} hidden ${field} must be zero`);
    }
  }
  if (Number(transition.suspendDelta) !== 1) failures.push(`${label} must suspend exactly once`);
  if (Number(transition.resumeDelta) !== 1) failures.push(`${label} must resume exactly once`);
  if (Number(transition.restoreFrameDelta) !== 1) failures.push(`${label} requires exactly one restore frame`);
  if (!(Number(transition.timestampResetDelta) >= 1)) failures.push(`${label} restore did not reset time ownership`);
  if (Number(transition.postRestoreFrameDelta) !== 1) {
    failures.push(`${label} requires exactly one measured post-restore frame`);
  }
  if (Number(transition.postRestoreShedBacklogDelta) !== 0) {
    failures.push(`${label} first post-restore frame shed backlog`);
  }
  const postRestoreMaxSteps = Number(transition.postRestoreMaxStepsAfter);
  if (!Number.isFinite(postRestoreMaxSteps) || postRestoreMaxSteps < 0
    || postRestoreMaxSteps > PERFORMANCE_LIFECYCLE_MAX_CATCHUP_STEPS) {
    failures.push(`${label} exceeded the four-step cap`);
  }
  if (transition.input?.heldBefore !== true) failures.push(`${label} did not begin with a held public input`);
  if (transition.input?.neutralWhileHidden !== true) failures.push(`${label} input was not neutral while hidden`);
  if (transition.input?.neutralAfterRestore !== true) failures.push(`${label} input was not neutral after restore`);
  if (transition.audio?.contextWasRunning !== true) failures.push(`${label} did not establish a running audio context`);
  if (transition.audio?.lifecycleSuspendedWhileHidden !== true) failures.push(`${label} audio did not enter lifecycle suspension`);
  if (transition.audio?.frameOwnerWhileHidden !== false) failures.push(`${label} audio frame owner survived hidden state`);
  if (transition.audio?.contextSuspendedWhileHidden !== true) failures.push(`${label} audio context did not suspend`);
  if (transition.audio?.lifecycleSuspendedAfterRestore !== false) failures.push(`${label} audio lifecycle flag did not clear`);
  if (transition.audio?.contextRunningAfterRestore !== true) failures.push(`${label} audio context did not restore`);
}

export function validatePerformanceLifecycleEvidence(evidence, {
  runtimeKind = evidence?.runtimeKind,
  requirePrimaryAcceptance = true,
} = {}) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object') {
    return { pass: false, failures: ['lifecycle evidence object is required'] };
  }
  if (evidence.schema !== PERFORMANCE_LIFECYCLE_SCHEMA) failures.push('lifecycle evidence schema mismatch');
  if (!COMMIT_PATTERN.test(String(evidence.candidateCommit || ''))) failures.push('candidateCommit must be a full Git commit');
  if (!['browser', 'electron'].includes(runtimeKind)) failures.push('runtimeKind must be browser or electron');
  if (evidence.runtimeKind !== runtimeKind) failures.push('runtimeKind does not match the claimed cell');
  if (evidence.fixedSeed !== PERFORMANCE_LIFECYCLE_FIXED_SEED) failures.push('fixed lifecycle seed mismatch');
  if (requirePrimaryAcceptance && evidence.primaryAcceptance !== true) failures.push('primary broker acceptance is required');

  if (requirePrimaryAcceptance) {
    if (!evidence.claim?.claimId) failures.push('broker claim id is required');
    requireDigest(failures, evidence.claim?.candidateDigest, 'candidateDigest');
    requireDigest(failures, evidence.claim?.sourceCandidateDigest, 'sourceCandidateDigest');
    requireDigest(failures, evidence.claim?.routeDigest, 'routeDigest');
    requireDigest(failures, evidence.claim?.regressionDigest, 'regressionDigest');
  }

  if (evidence.route?.canonicalRoot !== true) failures.push('canonical root route was not preserved');
  if (evidence.route?.mode !== 'flight') failures.push('ordinary public route did not reach flight');
  if (evidence.route?.seed !== PERFORMANCE_LIFECYCLE_FIXED_SEED) failures.push('ordinary public route seed mismatch');
  if (evidence.route?.defaultSettings !== true) failures.push('default video/settings profile was not retained');
  if (evidence.route?.authoredVisualReady !== true) failures.push('authored visual readiness was not retained');
  requireDigest(failures, evidence.route?.signatureBefore, 'route signature before lifecycle');
  requireDigest(failures, evidence.route?.signatureAfter, 'route signature after lifecycle');
  if (evidence.route?.signatureBefore !== evidence.route?.signatureAfter) failures.push('route signature changed across lifecycle');

  const gpu = evidence.gpu || {};
  if (gpu.hasContext !== true || gpu.source !== 'game-renderer') failures.push('game renderer GPU context is required');
  if (!gpu.vendor || !gpu.renderer || gpu.software !== false || SOFTWARE_RENDERER_PATTERN.test(String(gpu.renderer || ''))) {
    failures.push('hardware GPU identity is required');
  }

  const launchPolicy = evidence.launchPolicy || {};
  if (launchPolicy.schema !== PERFORMANCE_LIFECYCLE_LAUNCH_POLICY_SCHEMA) {
    failures.push('native lifecycle launch policy schema mismatch');
  }
  if (!Array.isArray(launchPolicy.presentBefore)
    || launchPolicy.presentBefore.some((entry) => !PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES.includes(entry))) {
    failures.push('native lifecycle launch policy pre-state is invalid');
  }
  if (JSON.stringify(launchPolicy.forbiddenSwitches) !== JSON.stringify(PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES)) {
    failures.push('native lifecycle launch policy switch set mismatch');
  }
  if (launchPolicy.observedCommandLine !== true || launchPolicy.appliedBeforeAppReady !== true) {
    failures.push('native lifecycle launch policy was not observed before application readiness');
  }
  if (launchPolicy.focusEmulationDisabled !== true) {
    failures.push('Playwright focus emulation still masks native lifecycle visibility');
  }
  if (launchPolicy.productRuntimeOverride !== false) {
    failures.push('native lifecycle evidence cannot depend on a product runtime override');
  }
  if (launchPolicy.nativeDefaultsRestored !== true || !Array.isArray(launchPolicy.presentAfter)
    || launchPolicy.presentAfter.length > 0) {
    failures.push('Playwright background execution switches survived native lifecycle launch');
  }
  const expectedLaunchDriver = runtimeKind === 'browser'
    ? 'owned-chrome-raw-cdp'
    : 'harness-electron-preload-remove-switch';
  if (launchPolicy.driver !== expectedLaunchDriver) failures.push(`${runtimeKind} lifecycle launch driver mismatch`);

  if (evidence.driver?.synthetic !== false) failures.push('synthetic lifecycle driver is not acceptance evidence');
  if (runtimeKind === 'browser') {
    if (evidence.driver?.kind !== 'browser-window-minimize' || evidence.driver?.observedDocumentHidden !== true) {
      failures.push('Browser cell must observe document.hidden through native window minimize');
    }
  } else if (evidence.driver?.kind !== 'electron-browser-window'
    || evidence.driver?.observedNativeWindowState !== true) {
    failures.push('Electron cell must observe native BrowserWindow state');
  }

  requirePositiveWindow(failures, evidence.foreground?.baseline, 'baseline foreground');
  requirePositiveWindow(failures, evidence.foreground?.resumed, 'resumed foreground');
  if (!(Number(evidence.foreground?.sampleMs) >= 500)) {
    failures.push('foreground cadence sample is too short');
  }
  if (!(Number(evidence.foreground?.warmupMs) >= 5_000)) {
    failures.push('baseline foreground requires at least 5000 ms of route warmup');
  }
  const settleWindows = Array.isArray(evidence.foreground?.settleWindows)
    ? evidence.foreground.settleWindows
    : [];
  if (settleWindows.length < 2
    || !foregroundWindowsComparable(settleWindows.at(-2), settleWindows.at(-1))) {
    failures.push('baseline foreground did not reach two comparable settled windows');
  }
  if (Number(settleWindows.at(-1)?.executedFrames) !== Number(evidence.foreground?.baseline?.executedFrames)) {
    failures.push('baseline foreground is not the final settled window');
  }
  if (!(Number(evidence.foreground?.resumed?.executedFrames) > 0)) {
    failures.push('resumed foreground executed no frames');
  }
  const cadenceRatio = Number(evidence.foreground?.cadenceRatio);
  const recomputedCadenceRatio = Number(evidence.foreground?.resumed?.executedFrames)
    / Number(evidence.foreground?.baseline?.executedFrames);
  if (!Number.isFinite(recomputedCadenceRatio)
    || Math.abs(cadenceRatio - recomputedCadenceRatio) > 1e-12) {
    failures.push('foreground cadence ratio does not match frame counters');
  }
  if (!Number.isFinite(cadenceRatio) || cadenceRatio < 0.5 || cadenceRatio > 1.5) {
    failures.push(`foreground cadence ratio ${cadenceRatio} is outside 0.5..1.5`);
  }

  const transitions = Array.isArray(evidence.transitions) ? evidence.transitions : [];
  const requiredTriggers = runtimeKind === 'browser'
    ? ['document-visibility']
    : ['window-minimize', 'window-hide'];
  for (const trigger of requiredTriggers) {
    if (!transitions.some((transition) => transition?.trigger === trigger)) {
      failures.push(`${runtimeKind} lifecycle trigger ${trigger} is missing`);
    }
  }
  transitions.forEach((transition, index) => validateTransition(failures, transition, runtimeKind, index));

  if (runtimeKind === 'electron') {
    const occlusion = evidence.occlusion;
    if (occlusion?.trigger !== 'window-blur' || occlusion?.native !== true
      || occlusion?.state !== 'foreground-occluded'
      || occlusion?.restoredState !== 'foreground-visible'
      || occlusion?.nativeWindowDuring?.visible !== true
      || occlusion?.nativeWindowDuring?.focused !== false
      || occlusion?.nativeWindowDuring?.hidden !== false) {
      failures.push('Electron blur/focus occlusion evidence is incomplete');
    }
    for (const field of ['executedFrames', 'renderUpdates', 'simulationCompletedTicks']) {
      if (!(Number(occlusion?.[field]) > 0)) failures.push(`Electron occlusion ${field} must continue`);
    }
  }

  const soak = evidence.soak || {};
  if (!(Number(soak.cycles) >= 4)) failures.push('repeated lifecycle soak requires at least four cycles');
  if (transitions.length !== Number(soak.cycles)) failures.push('transition count does not match soak cycles');
  for (const field of ['duplicateShellCommandDelta', 'staleShellCommandDelta', 'invalidShellCommandDelta']) {
    if (Number(soak[field]) !== 0) failures.push(`soak observed ${field.replace('Delta', '').replace(/([A-Z])/g, ' $1').toLowerCase()}s`);
  }
  if (Number(soak.postRestoreShedBacklogDelta) !== 0) failures.push('soak first post-restore frames shed backlog');
  const soakPostRestoreMaxSteps = Number(soak.postRestoreMaxStepsAfter);
  if (!Number.isFinite(soakPostRestoreMaxSteps) || soakPostRestoreMaxSteps < 0
    || soakPostRestoreMaxSteps > PERFORMANCE_LIFECYCLE_MAX_CATCHUP_STEPS) {
    failures.push('soak exceeded four-step cap');
  }
  if (Number(soak.suspendDelta) !== Number(soak.cycles)) failures.push('soak suspend count does not match cycles');
  if (Number(soak.resumeDelta) !== Number(soak.cycles)) failures.push('soak resume count does not match cycles');
  if (Number(soak.restoreFrameDelta) !== Number(soak.cycles)) failures.push('soak restore-frame count does not match cycles');
  if (Number(soak.postRestoreFrameDelta) !== Number(soak.cycles)) {
    failures.push('soak post-restore frame count does not match cycles');
  }
  for (const [field, soakField] of [
    ['suspendDelta', 'suspendDelta'],
    ['resumeDelta', 'resumeDelta'],
    ['restoreFrameDelta', 'restoreFrameDelta'],
    ['postRestoreFrameDelta', 'postRestoreFrameDelta'],
    ['postRestoreShedBacklogDelta', 'postRestoreShedBacklogDelta'],
  ]) {
    const transitionTotal = transitions.reduce((sum, transition) => sum + Number(transition?.[field] || 0), 0);
    if (transitionTotal !== Number(soak[soakField])) {
      failures.push(`soak ${soakField} does not equal transition total`);
    }
  }

  const physicalPower = evidence.physicalPower || {};
  if (physicalPower.claimed === true) {
    if (physicalPower.synthetic === true || !/^native-os-/.test(String(physicalPower.driver || ''))) {
      failures.push('physical power evidence cannot be synthetic');
    }
  } else if (!physicalPower.reason) {
    failures.push('unclaimed physical power boundary requires an exact reason');
  }

  if (!Array.isArray(evidence.errors) || evidence.errors.length > 0) failures.push('runtime errors must be empty');
  const cleanup = evidence.cleanup || {};
  const cleanupFields = runtimeKind === 'browser'
    ? ['pass', 'pageClosed', 'contextClosed', 'runtimeClosed', 'serverClosed', 'profileRemoved', 'windowDriverClosed']
    : ['pass', 'pageClosed', 'runtimeClosed', 'listenerClosed', 'profileRemoved'];
  if (cleanupFields.some((field) => cleanup[field] !== true)) failures.push('owned runtime cleanup is incomplete');

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}
