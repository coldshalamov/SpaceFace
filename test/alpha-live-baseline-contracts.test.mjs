import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import * as alphaContracts from '../scripts/lib/alphaLiveBaselineContracts.mjs';

import {
  assessOwnedResourceCleanup,
  classifyHardwareGpu,
  closeOwnedResources,
  createCanonicalUrlTracker,
  evaluateCanonicalUrlAcceptance,
  fingerprintUntrackedFiles,
  publishAcceptedArtifacts,
  validateFinalStationFrameSuffix,
  validateStationFrameSequence,
  worktreeFingerprint,
} from '../scripts/lib/alphaLiveBaselineContracts.mjs';

const execFile = promisify(execFileCallback);

function testHardwareClassifier() {
  const hardware = {
    hasContext: true,
    debugExtensionAvailable: true,
    unmaskedVendor: 'Google Inc. (NVIDIA)',
    unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090, D3D11)',
    maskedVendor: 'WebKit',
    maskedRenderer: 'WebKit WebGL',
    runtimeGpu: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'NVIDIA GeForce RTX 4090',
      tier: 'discrete',
      software: false,
    },
  };
  assert.deepEqual(classifyHardwareGpu(hardware).failures, [],
    'debug extension plus consistent non-software runtime GPU is affirmative hardware proof');

  const generic = classifyHardwareGpu({
    debugExtensionAvailable: false,
    unmaskedVendor: '',
    unmaskedRenderer: '',
    maskedVendor: 'WebKit',
    maskedRenderer: 'WebGL',
    runtimeGpu: null,
  });
  assert.equal(generic.pass, false, 'generic masked WebGL identity without debug extension/runtime state must fail');
  assert(generic.failures.some((failure) => /debug renderer extension/i.test(failure)));
  assert(generic.failures.some((failure) => /runtime GPU/i.test(failure)));

  const software = classifyHardwareGpu({
    ...hardware,
    unmaskedRenderer: 'ANGLE (Google, SwiftShader Device, Vulkan)',
    runtimeGpu: { vendor: 'Google', renderer: 'SwiftShader Device', tier: 'integrated', software: false },
  });
  assert.equal(software.pass, false, 'software renderer language must fail even when runtime software flag lies');
  assert(software.failures.some((failure) => /software renderer/i.test(failure)));

  const unknownTier = classifyHardwareGpu({
    ...hardware,
    runtimeGpu: { ...hardware.runtimeGpu, tier: 'unknown' },
  });
  assert.equal(unknownTier.pass, false, 'unknown runtime tier must fail affirmative hardware proof');

  const missingSoftwareClassification = classifyHardwareGpu({
    ...hardware,
    runtimeGpu: { ...hardware.runtimeGpu, software: undefined },
  });
  assert.equal(missingSoftwareClassification.pass, false,
    'missing runtime software classification cannot be coerced into an affirmative false');

  const inconsistent = classifyHardwareGpu({
    ...hardware,
    runtimeGpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'NVIDIA GeForce GTX 1050', tier: 'discrete', software: false },
  });
  assert.equal(inconsistent.pass, false,
    'RTX 4090 and GTX 1050 must fail despite sharing NVIDIA/GeForce family tokens');
  assert(inconsistent.failures.some((failure) => /consistent/i.test(failure)));

  const unknownRuntime = classifyHardwareGpu({
    ...hardware,
    runtimeGpu: { vendor: 'unknown', renderer: 'unknown', tier: 'discrete', software: false },
  });
  assert.equal(unknownRuntime.pass, false, 'generic unknown runtime vendor/renderer must fail');
  assert(unknownRuntime.failures.some((failure) => /generic runtime/i.test(failure)));

  const webkitRuntime = classifyHardwareGpu({
    ...hardware,
    runtimeGpu: { vendor: 'WebKit', renderer: 'WebGL', tier: 'discrete', software: false },
  });
  assert.equal(webkitRuntime.pass, false, 'generic WebKit/WebGL runtime identity must fail');
  assert(webkitRuntime.failures.some((failure) => /generic runtime GPU vendor/i.test(failure)));
  assert(webkitRuntime.failures.some((failure) => /generic runtime GPU renderer/i.test(failure)));
}

function testStationSequenceValidator() {
  const stable = Array.from({ length: 30 }, (_, index) => stationFrame(index));
  const accepted = validateStationFrameSequence(stable);
  assert.equal(accepted.pass, true, 'thirty consecutive rendered station frames pass');
  assert.equal(accepted.consecutiveFrameCount, 30);
  assert.equal(accepted.stationId, 'helios-station');
  assert.deepEqual(accepted.visibleTabLabels, ['Market', 'Shipyard', 'Missions']);
  assert.equal(accepted.contentFingerprint, 'station-content-v1');
  assert.deepEqual(accepted.sequence[0].undockAction, {
    selector: 'button.st-undock',
    canonicalMatchCount: 1,
    visibleCanonicalMatchCount: 1,
    present: true,
    visible: true,
    visibilityDiagnostics: {
      width: 180,
      height: 44,
      intersectionWidth: 180,
      intersectionHeight: 44,
      intersectionArea: 7920,
      viewportWidth: 1440,
      viewportHeight: 900,
      effectiveOpacity: 1,
      hiddenByAncestor: false,
    },
    isConnected: true,
    containedByStationScreen: true,
    effectiveAriaHidden: false,
    effectiveInert: false,
    effectiveAriaDisabled: false,
    ariaHiddenAncestry: [],
    inertAncestry: [],
    ariaDisabledAncestry: [],
    accessibleName: '⏏ UNDOCK · READY',
    accessibleNameSource: 'visible-text',
    labelledByIds: [],
    label: '⏏ UNDOCK · READY',
    normalizedLabel: '⏏ undock · ready',
    readiness: 'ready',
    disabled: false,
    ariaDisabled: null,
  }, 'accepted telemetry preserves decorated label and readiness/disabled diagnostics');

  const looseCopyMatch = stable.map((frame) => ({
    ...frame,
    undockAction: {
      ...frame.undockAction,
      selector: 'button.random-action',
      label: 'Click to Undock now',
      normalizedLabel: 'click to undock now',
    },
  }));
  const looseCopyResult = validateStationFrameSequence(looseCopyMatch);
  assert.equal(looseCopyResult.pass, false,
    'arbitrary visible button copy containing undock cannot satisfy the canonical action identity');
  assert(looseCopyResult.failures.some((failure) => /canonical Undock action identity/i.test(failure)),
    'noncanonical action failure identifies the structural contract');

  const decoratedVariants = stationFramesWithAction(stable, {
    accessibleName: '⏏ Undock · Check',
    accessibleNameSource: 'visible-text',
    label: '⏏ Undock · Check',
    normalizedLabel: '⏏ undock · check',
    readiness: 'check',
  });
  assert.equal(validateStationFrameSequence(decoratedVariants).pass, true,
    'decorative glyphs, case, and readiness suffix do not replace structural identity or semantic action name');

  assert.equal(validateStationFrameSequence(stationFramesWithAction(stable, {
    accessibleName: '',
    accessibleNameSource: 'none',
  })).pass, true,
  'consistent blank diagnostic name does not impersonate Playwright computed-name authority');
  assert.equal(validateStationFrameSequence(stationFramesWithAction(stable, {
    accessibleName: 'Departure Check: READY',
    accessibleNameSource: 'aria-label',
  })).pass, true,
  'consistent unrelated diagnostic name remains diagnostic while computed role proof owns acceptance');
  assertStationActionRejected(stable, { disabled: true },
    /native disabled/i,
    'native-disabled canonical action rejects settlement');
  assertStationActionRejected(stable, {
    ariaDisabled: 'true',
    effectiveAriaDisabled: true,
    ariaDisabledAncestry: ['button.st-undock'],
  }, /effective aria-disabled/i,
  'effective aria-disabled canonical action rejects settlement');
  assertStationActionRejected(stable, { ariaDisabled: 'true' },
    /aria-disabled/i,
    'direct aria-disabled=true cannot pass through inconsistent effective-state telemetry');
  assertStationActionRejected(stable, {
    canonicalMatchCount: 2,
    visibleCanonicalMatchCount: 1,
  }, /exactly one canonical Undock match/i,
  'a hidden duplicate canonical action rejects settlement despite one visible match');
  assertStationActionRejected(stable, { isConnected: false },
    /not connected/i,
    'detached canonical action rejects settlement');
  assertStationActionRejected(stable, { containedByStationScreen: false },
    /not contained by the station screen/i,
    'canonical action outside the station screen rejects settlement');
  assertStationActionRejected(stable, {
    effectiveAriaHidden: true,
    ariaHiddenAncestry: ['div[aria-hidden="true"]'],
  }, /aria-hidden ancestry/i,
  'aria-hidden canonical action ancestry rejects settlement');
  assertStationActionRejected(stable, {
    effectiveInert: true,
    inertAncestry: ['div[inert]'],
  }, /inert ancestry/i,
  'inert canonical action ancestry rejects settlement');
  assertStationActionRejected(stable, {
    visibleCanonicalMatchCount: 0,
    visible: false,
  }, /exactly one visible canonical Undock match/i,
  'hidden canonical action rejects settlement');

  const belowFloor = validateStationFrameSequence(stable, { minFrames: 1 });
  assert.equal(belowFloor.pass, false, 'caller cannot lower the station settlement floor below thirty frames');
  assert.equal(belowFloor.minimumRequiredFrames, 30, 'reported minimum remains the program floor');
  assert(belowFloor.failures.some((failure) => /program floor.*30/i.test(failure)),
    'below-floor configuration failure is explicit');
  assert.equal(validateFinalStationFrameSuffix(stable, { minFrames: 1 }).pass, false,
    'final-suffix selection cannot bypass the thirty-frame program floor');

  for (const [message, patch, expectedFailure] of [
    ['missing frame index', { index: undefined }, /finite integer index/i],
    ['fractional frame index', { index: 10.5 }, /finite integer index/i],
    ['nonconsecutive frame index', { index: 99 }, /not consecutive/i],
  ]) {
    const frames = stable.map((frame, index) => index === 10 ? { ...frame, ...patch } : frame);
    const result = validateStationFrameSequence(frames);
    assert.equal(result.pass, false, `${message} rejects settlement`);
    assert(result.failures.some((failure) => expectedFailure.test(failure)),
      `${message} emits strict index-schema diagnostics`);
  }

  assertStationActionRejected(stable, { canonicalMatchCount: '1' },
    /canonical match count.*integer/i,
    'string canonical match count rejects strict telemetry');
  assertStationActionRejected(stable, { visibleCanonicalMatchCount: 1.5 },
    /visible canonical match count.*integer/i,
    'fractional visible canonical match count rejects strict telemetry');
  assertStationActionRejected(stable, { isConnected: 'true' },
    /isConnected.*boolean/i,
    'string provenance boolean rejects strict telemetry');
  assertStationActionRejected(stable, { ariaDisabled: false },
    /ariaDisabled.*string or null/i,
    'non-string aria-disabled provenance rejects strict telemetry');
  assertStationActionRejected(stable, {
    visibilityDiagnostics: { ...stable[0].undockAction.visibilityDiagnostics, effectiveOpacity: '1' },
  }, /visibility effectiveOpacity.*finite/i,
  'string visibility number rejects strict telemetry');
  assertStationActionRejected(stable, { accessibleName: '', accessibleNameSource: 'aria-label' },
    /name.*source.*contradict/i,
    'blank name with non-none source rejects contradictory telemetry');
  assertStationActionRejected(stable, { accessibleNameSource: 'none' },
    /name.*source.*contradict/i,
    'nonblank name with none source rejects contradictory telemetry');
  assertStationActionRejected(stable, { accessibleName: '', accessibleNameSource: '' },
    /name source.*missing/i,
    'empty diagnostic name source rejects strict telemetry even when the name is blank');
  assertStationActionRejected(stable, { accessibleNameSource: 'aria-labelledby', labelledByIds: [] },
    /aria-labelledby.*referenced IDs/i,
    'aria-labelledby diagnostic source requires referenced IDs');

  const opaqueAriaHidden = stable.map((frame) => ({
    ...frame,
    overlay: {
      present: true,
      hidden: false,
      display: 'block',
      visibility: 'visible',
      opacity: 1,
      width: 1440,
      height: 900,
      ariaHidden: 'true',
      pointerEvents: 'none',
    },
  }));
  const opaqueResult = validateStationFrameSequence(opaqueAriaHidden);
  assert.equal(opaqueResult.pass, false,
    'aria-hidden plus pointer-events none cannot excuse an opaque full-screen overlay');
  assert(opaqueResult.failures.some((failure) => /overlay.*visually present/i.test(failure)));

  const identityDrift = stable.map((frame, index) => ({
    ...frame,
    stationId: index === 16 ? 'other-station' : frame.stationId,
  }));
  assert.equal(validateStationFrameSequence(identityDrift).pass, false, 'station identity drift rejects settlement');

  const contentDrift = stable.map((frame, index) => ({
    ...frame,
    contentFingerprint: index === 20 ? 'station-content-v2' : frame.contentFingerprint,
  }));
  assert.equal(validateStationFrameSequence(contentDrift).pass, false, 'visible content drift rejects settlement');

  assert.equal(validateStationFrameSequence(stable.slice(0, 29)).pass, false,
    'fewer than thirty requestAnimationFrame observations cannot certify settlement');

  const stableThenOpaque = Array.from({ length: 90 }, (_, index) => stationFrame(index));
  for (let index = 30; index < stableThenOpaque.length; index += 1) {
    stableThenOpaque[index].overlay = opaqueOverlay();
  }
  assert.equal(validateFinalStationFrameSuffix(stableThenOpaque).pass, false,
    'an early stable window cannot hide sixty opaque final frames');

  const lateDrift = Array.from({ length: 90 }, (_, index) => stationFrame(index));
  lateDrift[89].stationId = 'late-station-drift';
  lateDrift[88].contentFingerprint = 'late-content-drift';
  assert.equal(validateFinalStationFrameSuffix(lateDrift).pass, false,
    'late station/content drift after an early stable window rejects final settlement');

  const finalStable = Array.from({ length: 90 }, (_, index) => stationFrame(index));
  for (let index = 0; index < 60; index += 1) finalStable[index].overlay = opaqueOverlay();
  const finalSuffix = validateFinalStationFrameSuffix(finalStable);
  assert.equal(finalSuffix.pass, true, 'the final thirty contiguous stable frames pass');
  assert.equal(finalSuffix.suffixStartIndex, 60);
  assert.equal(finalSuffix.suffixEndIndex, 89);
}

function testComputedUndockRoleProofs() {
  assert.equal(typeof alphaContracts.validateComputedUndockRoleProofs, 'function',
    'computed role/name proof validator is exported');
  if (typeof alphaContracts.validateComputedUndockRoleProofs !== 'function') return;

  const accepted = [
    computedUndockRoleProof('before-settlement', { computedRoleCount: 3 }),
    computedUndockRoleProof('after-settlement', { computedRoleCount: 3 }),
  ];
  assert.equal(alphaContracts.validateComputedUndockRoleProofs(accepted).pass, true,
    'three global Undock descriptions pass when exactly one is the enabled canonical intersection');

  for (const [message, snapshot] of [
    ['blank computed name', '- button ""'],
    ['unrelated computed name', '- button "Departure Check: READY"'],
  ]) {
    const rejected = accepted.map((proof) => ({
      ...proof,
      computedRoleCount: 0,
      identityBoundCount: 0,
      ariaSnapshot: snapshot,
    }));
    const result = alphaContracts.validateComputedUndockRoleProofs(rejected);
    assert.equal(result.pass, false, `${message} rejects overall station acceptance`);
    assert(result.failures.some((failure) => /identity-bound canonical role\/name/i.test(failure)),
      `${message} failure names the canonical computed-name intersection authority`);
  }

  const differentButton = accepted.map((proof) => ({ ...proof, identityBoundCount: 0 }));
  assert.equal(alphaContracts.validateComputedUndockRoleProofs(differentButton).pass, false,
    'arbitrary explanatory Undock buttons cannot satisfy canonical identity binding');
  assert(alphaContracts.validateComputedUndockRoleProofs(differentButton).failures
    .some((failure) => /identity-bound/i.test(failure)));

  const duplicateCanonicalIntersection = accepted.map((proof) => ({ ...proof, identityBoundCount: 2 }));
  assert.equal(alphaContracts.validateComputedUndockRoleProofs(duplicateCanonicalIntersection).pass, false,
    'two canonical identity intersections reject computed semantic authority');
  assert(alphaContracts.validateComputedUndockRoleProofs(duplicateCanonicalIntersection).failures
    .some((failure) => /identity-bound.*exactly one/i.test(failure)));

  const impossibleGlobalCount = accepted.map((proof) => ({ ...proof, computedRoleCount: 0 }));
  assert.equal(alphaContracts.validateComputedUndockRoleProofs(impossibleGlobalCount).pass, false,
    'global computed role count cannot be lower than its canonical identity intersection');
  assert(alphaContracts.validateComputedUndockRoleProofs(impossibleGlobalCount).failures
    .some((failure) => /global computed role\/name count.*identity-bound/i.test(failure)));

  assert.equal(alphaContracts.validateComputedUndockRoleProofs([accepted[0]]).pass, false,
    'one-time role/name proof cannot certify the final settled state');
}

async function testWorktreeFingerprint() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-alpha-fingerprint-'));
  try {
    await git(root, ['init']);
    await writeFile(path.join(root, '.gitignore'), '.devshots/\n', 'utf8');
    await writeFile(path.join(root, 'tracked.txt'), 'tracked-v1\n', 'utf8');
    await git(root, ['add', '.gitignore', 'tracked.txt']);
    await git(root, ['-c', 'user.name=SpaceFace Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'baseline']);

    const baseline = await worktreeFingerprint(root);
    assert.equal(baseline.untrackedPolicy,
      'git ls-files --others --exclude-standard -z; no additional exclusions',
      'fingerprint explicitly narrows untracked exclusions to Git ignore rules');

    await writeFile(path.join(root, 'loose.txt'), 'loose-v1\n', 'utf8');
    const created = await worktreeFingerprint(root);
    assert.notEqual(created.digest, baseline.digest, 'ordinary untracked creation changes the digest');

    await writeFile(path.join(root, 'loose.txt'), 'loose-v2\n', 'utf8');
    const edited = await worktreeFingerprint(root);
    assert.notEqual(edited.digest, created.digest, 'ordinary untracked content changes the digest');

    await rename(path.join(root, 'loose.txt'), path.join(root, 'renamed.txt'));
    const renamed = await worktreeFingerprint(root);
    assert.notEqual(renamed.digest, edited.digest, 'ordinary untracked rename changes the digest');

    await rm(path.join(root, 'renamed.txt'));
    const removed = await worktreeFingerprint(root);
    assert.equal(removed.digest, baseline.digest, 'ordinary untracked removal returns to the baseline digest');

    await mkdir(path.join(root, '.devshots', 'alpha', '.ignored-task-staging'), { recursive: true });
    await writeFile(path.join(root, '.devshots', 'alpha', '.ignored-task-staging', 'evidence.json'), '{}\n', 'utf8');
    const ignored = await worktreeFingerprint(root);
    assert.equal(ignored.digest, baseline.digest, 'Git-ignored task artifacts do not perturb the digest');

    await writeFile(path.join(root, 'tracked.txt'), 'tracked-v2\n', 'utf8');
    assert.notEqual((await worktreeFingerprint(root)).digest, baseline.digest, 'tracked edits remain covered');
    await git(root, ['checkout', '--', 'tracked.txt']);

    await writeFile(path.join(root, 'staged.txt'), 'staged\n', 'utf8');
    await git(root, ['add', 'staged.txt']);
    assert.notEqual((await worktreeFingerprint(root)).digest, baseline.digest, 'staged additions remain covered');
    await git(root, ['reset', '--', 'staged.txt']);
    await rm(path.join(root, 'staged.txt'));

    await writeFile(path.join(root, 'intent.txt'), 'intent\n', 'utf8');
    await git(root, ['add', '-N', 'intent.txt']);
    assert.notEqual((await worktreeFingerprint(root)).digest, baseline.digest, 'intent-to-add contents remain covered');

    await assert.rejects(
      fingerprintUntrackedFiles(root, ['link.bin'], {
        lstatImpl: async () => fakeStats({ symbolicLink: true }),
        readFileImpl: async () => Buffer.from('target'),
      }),
      /ordinary file|symbolic link|reparse/i,
      'symbolic links/reparse entries cannot silently pass as ordinary untracked files',
    );
    await assert.rejects(
      fingerprintUntrackedFiles(root, ['directory-entry'], {
        lstatImpl: async () => fakeStats({ directory: true }),
        readFileImpl: async () => Buffer.alloc(0),
      }),
      /ordinary file/i,
      'directory entries cannot silently pass as ordinary untracked files',
    );
  } finally {
    await removeTempFixture(root, 'sf-alpha-fingerprint-');
  }
}

async function testAcceptedPublicationTransaction() {
  await publicationFailureRestoresPriorAccepted();
  await publicationSuccessRetainsVersionedHistory();
  await publicationRollbackFailureIsAggregate();
  await publicationPathEscapeIsRejectedBeforeMutation();
}

async function publicationFailureRestoresPriorAccepted() {
  const paths = await publicationFixture('promotion-failure');
  try {
    const injectedRename = async (from, to) => {
      if (path.resolve(from) === path.resolve(paths.stagingRoot)) throw new Error('injected promotion failure');
      return rename(from, to);
    };
    await assert.rejects(
      publishAcceptedArtifacts({ ...paths, renameImpl: injectedRename }),
      /injected promotion failure/,
    );
    assert.equal(await readFile(path.join(paths.acceptedRoot, 'prior.txt'), 'utf8'), 'prior\n',
      'prior accepted evidence is restored untouched when promotion fails');
    assert.equal(await readFile(path.join(paths.stagingRoot, 'new.txt'), 'utf8'), 'new\n',
      'complete staged evidence remains available after promotion failure');
  } finally {
    await removeTempFixture(paths.root, 'sf-alpha-publish-promotion-failure-');
  }
}

async function publicationSuccessRetainsVersionedHistory() {
  const paths = await publicationFixture('success');
  try {
    const result = await publishAcceptedArtifacts(paths);
    assert.equal(await readFile(path.join(paths.acceptedRoot, 'new.txt'), 'utf8'), 'new\n',
      'successful promotion installs complete new accepted evidence');
    assert.equal(await readFile(path.join(paths.acceptedRoot, 'nested', 'complete.txt'), 'utf8'), 'complete\n',
      'successful promotion preserves the complete staged directory tree');
    assert.equal(await readFile(path.join(result.historyPath, 'prior.txt'), 'utf8'), 'prior\n',
      'successful promotion retains prior evidence in guarded versioned history');
    const relativeHistory = path.relative(paths.alphaRoot, result.historyPath);
    assert(relativeHistory.startsWith(`..${path.sep}`), 'retained history lives outside recursively scanned alpha evidence');
  } finally {
    await removeTempFixture(paths.root, 'sf-alpha-publish-success-');
  }
}

async function publicationRollbackFailureIsAggregate() {
  const paths = await publicationFixture('rollback-failure');
  try {
    let historyDestination = null;
    const injectedRename = async (from, to) => {
      if (path.resolve(from) === path.resolve(paths.acceptedRoot)) {
        historyDestination = to;
        return rename(from, to);
      }
      if (path.resolve(from) === path.resolve(paths.stagingRoot)) throw new Error('injected promotion failure');
      if (historyDestination && path.resolve(from) === path.resolve(historyDestination)) {
        throw new Error('injected rollback failure');
      }
      return rename(from, to);
    };
    let error = null;
    try {
      await publishAcceptedArtifacts({ ...paths, renameImpl: injectedRename });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof AggregateError,
      'promotion plus rollback failure is surfaced as AggregateError');
    assert.equal(error.errors.length, 2, 'AggregateError retains promotion and rollback causes');
    assert.match(error.errors[0].message, /promotion failure/);
    assert.match(error.errors[1].message, /rollback failure/);
    assert.equal(await readFile(path.join(historyDestination, 'prior.txt'), 'utf8'), 'prior\n',
      'failed rollback leaves the untouched history copy intact rather than partially restoring it');
  } finally {
    await removeTempFixture(paths.root, 'sf-alpha-publish-rollback-failure-');
  }
}

async function publicationPathEscapeIsRejectedBeforeMutation() {
  const paths = await publicationFixture('path-escape');
  try {
    let renameCalls = 0;
    const outside = path.join(paths.root, 'outside-staging');
    await mkdir(outside, { recursive: true });
    await assert.rejects(
      publishAcceptedArtifacts({
        ...paths,
        stagingRoot: outside,
        renameImpl: async () => { renameCalls += 1; },
      }),
      /escaped|inside alpha|guard/i,
    );
    assert.equal(renameCalls, 0, 'path guard rejects escape before any mutation');
    assert.equal(await readFile(path.join(paths.acceptedRoot, 'prior.txt'), 'utf8'), 'prior\n');
  } finally {
    await removeTempFixture(paths.root, 'sf-alpha-publish-path-escape-');
  }
}

async function testUrlLifecycleTracker() {
  const canonical = 'http://127.0.0.1:54321/';
  const page = new FakePage(canonical);
  const tracker = createCanonicalUrlTracker(page, canonical, { pollIntervalMs: 2 });
  page.navigate(canonical);
  await delay(8);
  page.replaceUrl(`${canonical}?late=1`);
  await delay(8);
  page.closed = true;
  const snapshot = await tracker.stopAfterPageClose();
  assert(snapshot.observations.some((entry) => entry.source === 'framenavigated'),
    'fake-page main-frame navigation is behaviorally observed');
  assert(snapshot.observations.some((entry) => entry.source === 'node-live-url-poll' && entry.actual.includes('?late=1')),
    'Node polling behavior catches same-document URL drift without a navigation event');

  const acceptance = evaluateCanonicalUrlAcceptance({
    expectedRootUrl: canonical,
    observations: snapshot.observations,
    postFingerprintUrlCheck: { source: 'post-worktree-fingerprint-live', actual: canonical },
    precloseUrlCheck: { source: 'immediately-preclose-live', actual: canonical },
  });
  assert.equal(acceptance.pass, false, 'fake-page query drift rejects lifecycle acceptance');
  assert(acceptance.failures.some((failure) => /search became/.test(failure)));
}

async function testOwnedResourceCleanupBehavior() {
  const canonical = 'http://127.0.0.1:54321/';
  const page = new FakePage(canonical);
  const tracker = createCanonicalUrlTracker(page, canonical, { pollIntervalMs: 2 });
  page.navigate(canonical);
  await delay(8);
  const context = { closed: false, async close() { this.closed = true; } };
  const browser = {
    connected: true,
    async close() { this.connected = false; },
    isConnected() { return this.connected; },
  };
  const browserChildProcess = { pid: 8080, exitCode: null, signalCode: null };
  const browserServer = {
    process() { return browserChildProcess; },
    async close() { browserChildProcess.exitCode = 0; },
  };
  const listener = { listening: true };
  const server = {
    baseUrl: canonical,
    server: listener,
    async close() { listener.listening = false; },
  };
  const report = await closeOwnedResources(
    { page, context, browser, browserServer, browserChildProcess, server, canonicalUrlTracker: tracker },
    { fetchImpl: async () => { throw new Error('connection refused'); } },
  );
  assert.equal(report.pass, true, 'fake owned resources close in order and certify release');
  assert.equal(report.precloseUrlCheck.source, 'immediately-preclose-live');
  assert.equal(report.urlTracker.pageClosedWhenStopped, true, 'tracker remains active through fake page closure');
  assert.equal(context.closed, true);
  assert.equal(browser.connected, false);
  assert.equal(report.browserServerClosed, true);
  assert.equal(report.browserProcessPid, 8080);
  assert.equal(report.browserProcessExited, true,
    'BrowserServer.close must confirm the exact owned Chrome process before cleanup returns');
  assert.deepEqual(report.closed.map((entry) => entry.name), ['page', 'context', 'browser', 'browserServer', 'server']);
  assert.equal(listener.listening, false);
}

function testResourceCleanupAssessment() {
  assert.equal(assessOwnedResourceCleanup({
    pageClosed: true,
    contextClosed: true,
    browserDisconnected: true,
    serverReleased: true,
    trackerStoppedAfterPageClose: true,
    precloseUrlCheck: { pass: true },
    errors: [],
  }).pass, true, 'fully awaited owned-resource cleanup passes');

  const incomplete = assessOwnedResourceCleanup({
    pageClosed: true,
    contextClosed: true,
    browserDisconnected: false,
    serverReleased: true,
    trackerStoppedAfterPageClose: false,
    precloseUrlCheck: null,
    errors: [],
  });
  assert.equal(incomplete.pass, false, 'connected browser/still-running tracker cannot pass cleanup assessment');
  assert(incomplete.failures.some((failure) => /browser/i.test(failure)));
  assert(incomplete.failures.some((failure) => /tracker/i.test(failure)));
  assert(incomplete.failures.some((failure) => /preclose/i.test(failure)));

  const processPending = assessOwnedResourceCleanup({
    pageClosed: true,
    contextClosed: true,
    browserDisconnected: true,
    browserServerClosed: true,
    browserProcessExited: false,
    serverReleased: true,
    trackerStoppedAfterPageClose: true,
    precloseUrlCheck: { pass: true },
    errors: [],
  });
  assert.equal(processPending.pass, false);
  assert.match(processPending.failures.join('\n'), /browser child process exit/i);
}

function stationFrame(index) {
  return {
    index,
    source: 'requestAnimationFrame',
    docked: true,
    stationId: 'helios-station',
    screenVisible: true,
    screenRect: {
      width: 1120,
      height: 760,
      intersectionWidth: 1120,
      intersectionHeight: 760,
      intersectionArea: 851200,
      viewportWidth: 1440,
      viewportHeight: 900,
      effectiveOpacity: 1,
      hiddenByAncestor: false,
    },
    visibleTabLabels: ['Market', 'Shipyard', 'Missions'],
    contentFingerprint: 'station-content-v1',
    contentLength: 120,
    undockVisible: true,
    undockAction: {
      selector: 'button.st-undock',
      canonicalMatchCount: 1,
      visibleCanonicalMatchCount: 1,
      present: true,
      visible: true,
      visibilityDiagnostics: {
        width: 180,
        height: 44,
        intersectionWidth: 180,
        intersectionHeight: 44,
        intersectionArea: 7920,
        viewportWidth: 1440,
        viewportHeight: 900,
        effectiveOpacity: 1,
        hiddenByAncestor: false,
      },
      isConnected: true,
      containedByStationScreen: true,
      effectiveAriaHidden: false,
      effectiveInert: false,
      effectiveAriaDisabled: false,
      ariaHiddenAncestry: [],
      inertAncestry: [],
      ariaDisabledAncestry: [],
      accessibleName: '⏏ UNDOCK · READY',
      accessibleNameSource: 'visible-text',
      labelledByIds: [],
      label: '⏏ UNDOCK · READY',
      normalizedLabel: '⏏ undock · ready',
      readiness: 'ready',
      disabled: false,
      ariaDisabled: null,
    },
    overlay: { present: false },
  };
}

function computedUndockRoleProof(boundary, patch = {}) {
  return {
    boundary,
    selector: 'button.st-undock',
    canonicalCount: 1,
    computedRoleCount: 1,
    identityBoundCount: 1,
    canonicalVisible: true,
    canonicalEnabled: true,
    ariaSnapshot: '- button "⏏ UNDOCK · READY"',
    ...patch,
  };
}

function stationFramesWithAction(frames, patch) {
  return frames.map((frame) => ({
    ...frame,
    undockAction: { ...frame.undockAction, ...patch },
  }));
}

function assertStationActionRejected(frames, patch, expectedFailure, message) {
  const result = validateStationFrameSequence(stationFramesWithAction(frames, patch));
  assert.equal(result.pass, false, message);
  assert(result.failures.some((failure) => expectedFailure.test(failure)),
    `${message}: expected failure ${expectedFailure}, got ${JSON.stringify(result.failures)}`);
}

function opaqueOverlay() {
  return {
    present: true,
    hidden: false,
    display: 'block',
    visibility: 'visible',
    opacity: 1,
    width: 1440,
    height: 900,
    ariaHidden: 'true',
    pointerEvents: 'none',
  };
}

function fakeStats({ symbolicLink = false, directory = false } = {}) {
  return {
    mode: 0o100644,
    size: 6,
    isSymbolicLink: () => symbolicLink,
    isDirectory: () => directory,
    isFile: () => !symbolicLink && !directory,
  };
}

async function publicationFixture(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `sf-alpha-publish-${name}-`));
  const alphaRoot = path.join(root, '.devshots', 'alpha');
  const historyRoot = path.join(root, '.devshots', 'alpha-history');
  const acceptedRoot = path.join(alphaRoot, 'm0-live-baseline-browser');
  const stagingRoot = path.join(alphaRoot, '.m0-live-baseline-browser.staging-test');
  await mkdir(acceptedRoot, { recursive: true });
  await mkdir(path.join(stagingRoot, 'nested'), { recursive: true });
  await writeFile(path.join(acceptedRoot, 'prior.txt'), 'prior\n', 'utf8');
  await writeFile(path.join(stagingRoot, 'new.txt'), 'new\n', 'utf8');
  await writeFile(path.join(stagingRoot, 'nested', 'complete.txt'), 'complete\n', 'utf8');
  return { root, alphaRoot, historyRoot, acceptedRoot, stagingRoot };
}

async function git(cwd, args) {
  return execFile('git', args, { cwd, encoding: 'utf8' });
}

async function removeTempFixture(candidate, requiredPrefix) {
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `refusing recursive fixture cleanup outside the exact temp root: ${resolved}`);
  assert.equal(path.dirname(resolved), tempRoot,
    `refusing recursive fixture cleanup outside a direct mkdtemp child: ${resolved}`);
  assert(path.basename(resolved).startsWith(requiredPrefix),
    `refusing recursive fixture cleanup without prefix ${requiredPrefix}: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
}

class FakePage extends EventEmitter {
  constructor(url) {
    super();
    this.currentUrl = url;
    this.closed = false;
    this.frame = {};
  }

  url() { return this.currentUrl; }
  mainFrame() { return this.frame; }
  isClosed() { return this.closed; }
  navigate(url) {
    this.currentUrl = url;
    this.emit('framenavigated', this.frame);
  }
  replaceUrl(url) { this.currentUrl = url; }
  async close() { this.closed = true; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

testHardwareClassifier();
testStationSequenceValidator();
testComputedUndockRoleProofs();
await testWorktreeFingerprint();
await testAcceptedPublicationTransaction();
await testUrlLifecycleTracker();
await testOwnedResourceCleanupBehavior();
testResourceCleanupAssessment();

console.log('PASS alpha live baseline behavioral contracts');
