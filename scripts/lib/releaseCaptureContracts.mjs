import { createHash } from 'node:crypto';
import path from 'node:path';

export const RELEASE_CAPTURE_SCHEMA = 'spaceface.releaseCapture.v1';
export const RELEASE_CAPTURE_RECEIPT_SCHEMA = 'spaceface.releaseCaptureReceipt.v1';

export const MONEY_MOMENTS = Object.freeze([
  Object.freeze({ id: 'tether-slingshot-mid-arc', predicateId: 'tether_slingshot_mid_arc' }),
  Object.freeze({ id: 'seam-lit-asteroid-under-beam', predicateId: 'seam_lit_asteroid_under_beam' }),
  Object.freeze({ id: 'station-approach-core-palette', predicateId: 'station_approach_core_palette' }),
  Object.freeze({ id: 'wedge-formation-telegraphing', predicateId: 'wedge_formation_telegraphing' }),
  Object.freeze({ id: 'cruise-streaks', predicateId: 'cruise_streaks' }),
  Object.freeze({ id: 'capital-kill-bloom', predicateId: 'capital_kill_bloom' }),
]);

export const GAMEPLAY_MILESTONES = Object.freeze([
  'launch', 'scan', 'mine', 'interdiction', 'slingshot_escape', 'dock',
]);

export const MOMENT_BINDING_CONTRACTS = Object.freeze({
  'tether-slingshot-mid-arc': Object.freeze({ targetKind: 'tether_anchor', evidenceId: 'tether:attached', cueId: 'tether.attach' }),
  'seam-lit-asteroid-under-beam': Object.freeze({ targetKind: 'asteroid', evidenceId: 'mining:tick', cueId: 'mining.seam.quality' }),
  'station-approach-core-palette': Object.freeze({ targetKind: 'station', evidenceId: 'dock:range', cueId: 'hud.dock.prompt' }),
  'wedge-formation-telegraphing': Object.freeze({ targetKind: 'hostile_squad', evidenceId: 'ai:telegraph', cueId: 'combat.doctrine.telegraph' }),
  'cruise-streaks': Object.freeze({ targetKind: 'player_ship', evidenceId: 'cruise:engaged', cueId: 'travel.cruise.engaged' }),
  'capital-kill-bloom': Object.freeze({ targetKind: 'capital_ship', evidenceId: 'entity:killed', cueId: 'combat.player.kill' }),
});

export const APPROVED_RELEASE_CAPTURE_ENTRYPOINTS = Object.freeze([
  'scripts/capture-capsule-shots.mjs',
  'scripts/capture-gameplay-60s.mjs',
]);
export const APPROVED_RELEASE_CAPTURE_RUNNER = 'scripts/lib/releaseCaptureRunner.mjs';

const HASH_RE = /^[a-f0-9]{64}$/;
const HEAD_RE = /^[a-f0-9]{40}$/;
const PUBLIC_ACTION_KINDS = new Set(['keyboard', 'pointer', 'settings_click', 'settings_control']);

export function artifactClaimFromBytes(artifactPath, bytes) {
  const body = toBuffer(bytes);
  return {
    path: normalizeArtifactPath(artifactPath),
    bytes: body.length,
    sha256: sha256(body),
  };
}

export function canonicalCaptureJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function artifactSetSha256(artifacts) {
  const rows = (Array.isArray(artifacts) ? artifacts : [])
    .map((artifact) => `${normalizeArtifactPath(artifact?.path || '')}\0${artifact?.bytes}\0${artifact?.sha256}`)
    .sort(codeUnitCompare);
  return sha256(Buffer.from(`${rows.join('\n')}\n`));
}

export function validateReleaseCaptureManifest(manifest, {
  verifiedArtifacts = [],
  verifiedMedia = null,
  acceptedTreeFiles = [],
} = {}) {
  const issues = [];
  if (!plainObject(manifest)) return result(['manifest must be an object']);
  if (manifest.schema !== RELEASE_CAPTURE_SCHEMA) issues.push(`schema must equal ${RELEASE_CAPTURE_SCHEMA}`);
  if (!nonempty(manifest.captureId)) issues.push('captureId is required');
  if (manifest.runtime !== 'browser') issues.push('runtime must be browser');
  validateCanonicalRoot(manifest.canonicalUrl, issues);
  validateCandidate(manifest.candidate, issues);
  validatePolicy(manifest.policy, issues);
  validateSettings(manifest.settings, issues);
  validateWorktree(manifest.worktree, manifest.candidate, issues);
  validateRoute(manifest.route, issues);
  validateProducer(manifest.producer, issues);
  validateCleanup(manifest.cleanup, issues);
  validateShots(manifest.shots, issues);
  validateVideo(manifest.video, issues);
  validateVerifiedMedia(manifest.video, verifiedMedia, issues);
  validateArtifacts(manifest, verifiedArtifacts, acceptedTreeFiles, issues);
  return result(issues);
}

export function buildReleaseCaptureReceipt({
  manifestBytes,
  manifest,
  verifiedArtifacts,
  verifiedMedia,
  acceptedTreeFiles,
} = {}) {
  const bytes = toBuffer(manifestBytes);
  const validation = validateReleaseCaptureManifest(manifest, { verifiedArtifacts, verifiedMedia, acceptedTreeFiles });
  if (!validation.ok) throw new Error(`release capture manifest invalid:\n${validation.issues.join('\n')}`);
  return {
    schema: RELEASE_CAPTURE_RECEIPT_SCHEMA,
    captureId: manifest.captureId,
    manifestPath: 'manifest.json',
    manifestBytes: bytes.length,
    manifestSha256: sha256(bytes),
    artifactCount: verifiedArtifacts.length,
    artifactSetSha256: artifactSetSha256(verifiedArtifacts),
    candidateHead: manifest.candidate.head,
    worktreeDigest: manifest.worktree.beforeDigest,
    selectionDigest: manifest.candidate.selectionDigest,
    moneyMomentIds: MONEY_MOMENTS.map((moment) => moment.id),
    gameplayVideoSha256: manifest.video.sha256,
    cleanupSha256: sha256(Buffer.from(canonicalCaptureJson(manifest.cleanup))),
    producerEntrypoint: manifest.producer.entrypoint,
    producerRunner: manifest.producer.runner,
    acceptedTreeSetSha256: stringSetSha256(acceptedTreeFiles),
    independentMediaSha256: sha256(Buffer.from(canonicalCaptureJson(verifiedMedia))),
    pass: true,
  };
}

export function validateReleaseCaptureReceipt(receipt, {
  manifestBytes,
  manifest,
  verifiedArtifacts = [],
  verifiedMedia = null,
  acceptedTreeFiles = [],
} = {}) {
  const issues = [];
  const manifestValidation = validateReleaseCaptureManifest(manifest, { verifiedArtifacts, verifiedMedia, acceptedTreeFiles });
  issues.push(...manifestValidation.issues.map((issue) => `manifest: ${issue}`));
  if (!plainObject(receipt)) return result([...issues, 'receipt must be an object']);
  const bytes = toBuffer(manifestBytes);
  if (receipt.schema !== RELEASE_CAPTURE_RECEIPT_SCHEMA) issues.push('receipt schema mismatch');
  if (receipt.captureId !== manifest?.captureId) issues.push('receipt captureId mismatch');
  if (receipt.manifestPath !== 'manifest.json') issues.push('receipt manifestPath must be manifest.json');
  if (receipt.manifestBytes !== bytes.length) issues.push('receipt manifest byte count mismatch');
  if (receipt.manifestSha256 !== sha256(bytes)) issues.push('receipt manifest hash mismatch');
  if (receipt.artifactCount !== verifiedArtifacts.length) issues.push('receipt artifact count mismatch');
  if (receipt.artifactSetSha256 !== artifactSetSha256(verifiedArtifacts)) issues.push('receipt artifact set hash mismatch');
  if (receipt.candidateHead !== manifest?.candidate?.head) issues.push('receipt candidate HEAD mismatch');
  if (receipt.worktreeDigest !== manifest?.worktree?.beforeDigest) issues.push('receipt worktree mismatch');
  if (receipt.selectionDigest !== manifest?.candidate?.selectionDigest) issues.push('receipt selection mismatch');
  if (canonicalCaptureJson(receipt.moneyMomentIds) !== canonicalCaptureJson(MONEY_MOMENTS.map((moment) => moment.id))) {
    issues.push('receipt money moment set mismatch');
  }
  if (receipt.gameplayVideoSha256 !== manifest?.video?.sha256) issues.push('receipt gameplay video mismatch');
  if (receipt.cleanupSha256 !== sha256(Buffer.from(canonicalCaptureJson(manifest?.cleanup || null)))) issues.push('receipt cleanup mismatch');
  if (receipt.producerEntrypoint !== manifest?.producer?.entrypoint) issues.push('receipt producer entrypoint mismatch');
  if (receipt.producerRunner !== manifest?.producer?.runner) issues.push('receipt producer runner mismatch');
  if (receipt.acceptedTreeSetSha256 !== stringSetSha256(acceptedTreeFiles)) issues.push('receipt accepted tree mismatch');
  if (receipt.independentMediaSha256 !== sha256(Buffer.from(canonicalCaptureJson(verifiedMedia)))) issues.push('receipt independent media mismatch');
  if (receipt.pass !== true) issues.push('receipt pass must be true');
  return result(issues);
}

function validateProducer(value, issues) {
  if (!plainObject(value)) { issues.push('approved producer receipt is required'); return; }
  if (!APPROVED_RELEASE_CAPTURE_ENTRYPOINTS.includes(value.entrypoint)) {
    issues.push(`unapproved release capture entrypoint: ${value.entrypoint}`);
  }
  if (value.runner !== APPROVED_RELEASE_CAPTURE_RUNNER) issues.push('unapproved release capture runner');
}

function validateCleanup(value, issues) {
  if (!plainObject(value)) { issues.push('owned cleanup receipt is required'); return; }
  for (const key of [
    'completedBeforeManifest', 'shotPageClosed', 'shotContextClosed', 'videoPageClosed',
    'videoContextClosed', 'browserClosed', 'serverClosed', 'canonicalTrackersPassed',
  ]) if (value[key] !== true) issues.push(`cleanup.${key} must be true before manifest creation`);
}

function validateCandidate(value, issues) {
  if (!plainObject(value)) { issues.push('candidate is required'); return; }
  if (!HEAD_RE.test(String(value.head || ''))) issues.push('candidate.head must be 40 lowercase hex');
  for (const key of ['worktreeDigest', 'selectionDigest']) {
    if (!HASH_RE.test(String(value[key] || ''))) issues.push(`candidate.${key} must be sha256`);
  }
}

function validatePolicy(value, issues) {
  if (!plainObject(value)) { issues.push('policy is required'); return; }
  for (const key of [
    'canonicalRootOnly', 'visibleKeyboardMouseOnly', 'noInjection', 'authoredAssetsRequired',
    'hudRequired', 'noSubstitutions',
  ]) if (value[key] !== true) issues.push(`policy.${key} must be true`);
}

function validateSettings(value, issues) {
  if (!plainObject(value)) { issues.push('settings proof is required'); return; }
  if (value.changedOnlyThroughVisibleUi !== true) issues.push('quality must change only through visible Settings UI');
  if (value.maximumPresetVerified !== true) issues.push('maximum release-exposed quality was not verified');
  for (const key of ['originalSha256', 'captureSha256', 'restoredSha256']) {
    if (!HASH_RE.test(String(value[key] || ''))) issues.push(`settings.${key} must be sha256`);
  }
  if (value.originalSha256 !== value.restoredSha256 || value.restored !== true) issues.push('settings were not restored');
  if (!Array.isArray(value.visibleActions) || value.visibleActions.length < 5) issues.push('visible Settings UI action receipts are required');
}

function validateWorktree(value, candidate, issues) {
  if (!plainObject(value)) { issues.push('worktree proof is required'); return; }
  for (const key of ['beforeDigest', 'afterDigest']) {
    if (!HASH_RE.test(String(value[key] || ''))) issues.push(`worktree.${key} must be sha256`);
  }
  if (value.beforeDigest !== value.afterDigest || value.unchanged !== true) issues.push('worktree changed during capture');
  if (candidate && value.beforeDigest !== candidate.worktreeDigest) issues.push('candidate/worktree digest mismatch');
}

function validateRoute(value, issues) {
  if (!plainObject(value)) { issues.push('route proof is required'); return; }
  if (value.reusedVisualProbeServer !== true) issues.push('visualProbeServer reuse is required');
  if (value.reusedAlphaLiveBaseline !== true) issues.push('alphaLiveBaseline route reuse is required');
  if (!Array.isArray(value.browserIssues)) issues.push('browserIssues must be an array');
  else if (value.browserIssues.length) issues.push('browser route contains console/network/page errors');
  if (!Array.isArray(value.publicActions) || value.publicActions.length < 2) {
    issues.push('public keyboard/mouse action receipts are required');
  } else {
    let expectedSeq = 1;
    let hasKeyboard = false;
    let hasPointer = false;
    for (const action of value.publicActions) {
      if (action.seq !== expectedSeq) issues.push('public action sequence is not contiguous');
      expectedSeq += 1;
      if (!PUBLIC_ACTION_KINDS.has(action.kind)) issues.push(`forbidden public action kind ${action.kind}`);
      if (action.kind === 'keyboard') hasKeyboard = true;
      if (action.kind === 'pointer' || action.kind === 'settings_click') hasPointer = true;
    }
    if (!hasKeyboard || !hasPointer) issues.push('both visible keyboard and pointer actions are required');
  }
}

function validateShots(shots, issues) {
  if (!Array.isArray(shots) || shots.length !== MONEY_MOMENTS.length) {
    issues.push(`exactly ${MONEY_MOMENTS.length} money moments are required`);
    return;
  }
  for (let index = 0; index < MONEY_MOMENTS.length; index += 1) {
    const shot = shots[index];
    const expected = MONEY_MOMENTS[index];
    const pathLabel = `shots[${index}]`;
    if (!plainObject(shot)) { issues.push(`${pathLabel} must be an object`); continue; }
    if (shot.momentId !== expected.id) issues.push(`${pathLabel}.momentId must equal ${expected.id}; no substitutions`);
    if (shot.predicateId !== expected.predicateId) issues.push(`${pathLabel}.predicateId mismatch`);
    if (shot.reached !== true) issues.push(`${pathLabel} predicate was unreachable`);
    if (shot.width !== 2560 || shot.height !== 1440) issues.push(`${pathLabel} must be exactly 2560x1440`);
    if (shot.hudVisible !== true) issues.push(`${pathLabel} HUD must remain visible`);
    if (shot.authoredAssetsReady !== true) issues.push(`${pathLabel} authored assets are required`);
    if (shot.canonicalRoot !== true) issues.push(`${pathLabel} left canonical root`);
    if (!Number.isInteger(shot.publicActionCount) || shot.publicActionCount < 1) issues.push(`${pathLabel} lacks public actions`);
    validateArtifactClaim(shot, pathLabel, issues);
    validateMomentBinding(shot, expected, pathLabel, issues);
  }
}

function validateMomentBinding(shot, expected, label, issues) {
  const binding = shot.binding;
  const contract = MOMENT_BINDING_CONTRACTS[expected.id];
  if (!plainObject(binding)) { issues.push(`${label} exact target/event/cue/frame binding is required`); return; }
  if (!nonempty(binding.targetId)) issues.push(`${label}.binding.targetId is required`);
  if (binding.targetKind !== contract.targetKind) issues.push(`${label}.binding.targetKind mismatch`);
  if (binding.evidenceId !== contract.evidenceId) issues.push(`${label}.binding.evidenceId mismatch`);
  if (binding.cueId !== contract.cueId) issues.push(`${label}.binding.cueId mismatch`);
  if (!Number.isInteger(binding.capturedTick) || binding.capturedTick < 0) issues.push(`${label}.binding.capturedTick is invalid`);
  if (binding.frameSha256 !== shot.sha256) issues.push(`${label}.binding frame is not the captured screenshot`);
}

function validateVideo(video, issues) {
  if (!plainObject(video)) { issues.push('gameplay video proof is required'); return; }
  validateArtifactClaim(video, 'video', issues);
  if (video.container !== 'webm') issues.push('gameplay video container must be webm');
  if (!Number.isFinite(video.durationS) || video.durationS < 58 || video.durationS > 65) issues.push('gameplay video duration must be 58-65 seconds');
  if (!Number.isInteger(video.width) || video.width < 1920 || !Number.isInteger(video.height) || video.height < 1080) {
    issues.push('gameplay video must be at least 1920x1080');
  }
  if (video.hudVisibleThroughout !== true) issues.push('gameplay video HUD proof is required');
  if (video.authoredAssetsThroughout !== true) issues.push('gameplay video authored-asset proof is required');
  if (!Array.isArray(video.runtimeSamples) || video.runtimeSamples.length < 20) {
    issues.push('gameplay video requires at least 20 live HUD/authored-asset samples');
  } else {
    let previousAt = -1;
    for (let index = 0; index < video.runtimeSamples.length; index += 1) {
      const sample = video.runtimeSamples[index];
      if (!Number.isFinite(sample?.atS) || sample.atS < previousAt || sample.atS < 0 || sample.atS > video.durationS) {
        issues.push(`video.runtimeSamples[${index}].atS is invalid`);
      }
      previousAt = Number(sample?.atS);
      if (sample?.hudVisible !== true) issues.push(`video.runtimeSamples[${index}] lost HUD visibility`);
      if (sample?.authoredAssetsReady !== true || !Number.isInteger(sample?.shipCount) || sample.shipCount < 1) {
        issues.push(`video.runtimeSamples[${index}] lost authored ship readiness`);
      }
    }
    const firstSampleAt = Number(video.runtimeSamples[0]?.atS);
    const lastSampleAt = Number(video.runtimeSamples.at(-1)?.atS);
    if (!(firstSampleAt <= 10)) issues.push('runtime HUD/asset sampling began too late');
    if (!(lastSampleAt >= video.durationS - 2)) issues.push('runtime HUD/asset sampling ended too early');
  }
  if (!Array.isArray(video.decodedFrames) || video.decodedFrames.length < 3
    || video.decodedFrameCount !== video.decodedFrames.length) {
    issues.push('at least three decoded-frame proofs are required');
  } else {
    let previousAt = -1;
    for (let index = 0; index < video.decodedFrames.length; index += 1) {
      const frame = video.decodedFrames[index];
      if (!Number.isFinite(frame.atS) || frame.atS <= previousAt || frame.atS < 0 || frame.atS > video.durationS) {
        issues.push(`video.decodedFrames[${index}].atS is invalid`);
      }
      previousAt = frame.atS;
      if (frame.width < 1920 || frame.height < 1080) issues.push(`video.decodedFrames[${index}] resolution is too low`);
      validateArtifactClaim(frame, `video.decodedFrames[${index}]`, issues);
    }
  }
  if (!Array.isArray(video.milestones) || video.milestones.length !== GAMEPLAY_MILESTONES.length) {
    issues.push('gameplay route milestone set is incomplete');
  } else {
    let previousAt = -1;
    for (let index = 0; index < GAMEPLAY_MILESTONES.length; index += 1) {
      const milestone = video.milestones[index];
      if (milestone.id !== GAMEPLAY_MILESTONES[index]) issues.push(`video milestone ${index} cannot be substituted`);
      if (milestone.reached !== true) issues.push(`video milestone ${GAMEPLAY_MILESTONES[index]} was unreachable`);
      if (!Number.isFinite(milestone.atS) || milestone.atS < previousAt || milestone.atS < 0 || milestone.atS > video.durationS) {
        issues.push(`video milestone ${GAMEPLAY_MILESTONES[index]} timestamp is invalid`);
      }
      previousAt = milestone.atS;
    }
  }
}

function validateVerifiedMedia(video, verifiedMedia, issues) {
  if (!plainObject(verifiedMedia) || !plainObject(verifiedMedia.video)) {
    issues.push('independent ffprobe/ffmpeg media verification is required');
    return;
  }
  const actual = verifiedMedia.video;
  for (const key of ['path', 'bytes', 'sha256', 'container', 'durationS', 'width', 'height']) {
    if (actual[key] !== video?.[key]) issues.push(`independent media video.${key} mismatch`);
  }
  if (actual.magicVerified !== true || actual.ffprobeVerified !== true) issues.push('independent WebM magic/ffprobe proof is required');
  if (!Array.isArray(verifiedMedia.decodedFrames) || verifiedMedia.decodedFrames.length !== video?.decodedFrames?.length) {
    issues.push('independent decoded-frame set mismatch');
    return;
  }
  for (let index = 0; index < verifiedMedia.decodedFrames.length; index += 1) {
    const expected = video.decodedFrames[index];
    const frame = verifiedMedia.decodedFrames[index];
    for (const key of ['atS', 'path', 'bytes', 'sha256', 'width', 'height']) {
      if (frame?.[key] !== expected?.[key]) issues.push(`independent decoded frame ${index}.${key} mismatch`);
    }
    if (frame?.magicVerified !== true || frame?.decodedFromVideoSha256 !== video?.sha256) {
      issues.push(`independent decoded frame ${index} lacks source/magic binding`);
    }
  }
}

function validateArtifacts(manifest, verifiedArtifacts, acceptedTreeFiles, issues) {
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 10) {
    issues.push('exact ten-artifact claim set is required');
    return;
  }
  const declared = new Map();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    validateArtifactClaim(artifact, `artifacts[${index}]`, issues);
    if (declared.has(artifact.path)) issues.push(`duplicate artifact path ${artifact.path}`);
    declared.set(artifact.path, artifact);
  }
  const verified = new Map((Array.isArray(verifiedArtifacts) ? verifiedArtifacts : []).map((artifact) => [artifact.path, artifact]));
  for (const [artifactPath, claim] of declared) {
    const actual = verified.get(artifactPath);
    if (!actual) { issues.push(`artifact was not independently verified: ${artifactPath}`); continue; }
    if (actual.bytes !== claim.bytes || actual.sha256 !== claim.sha256) issues.push(`artifact verification mismatch: ${artifactPath}`);
  }
  if (verified.size !== declared.size) issues.push('verified artifact set differs from declared artifact set');
  const requiredPaths = [
    ...(Array.isArray(manifest.shots) ? manifest.shots.map((shot) => shot.path) : []),
    manifest.video && manifest.video.path,
    ...(Array.isArray(manifest.video && manifest.video.decodedFrames) ? manifest.video.decodedFrames.map((frame) => frame.path) : []),
  ].filter(Boolean);
  for (const requiredPath of requiredPaths) if (!declared.has(requiredPath)) issues.push(`required artifact missing from set: ${requiredPath}`);
  if (requiredPaths.length !== declared.size || requiredPaths.some((requiredPath) => !declared.has(requiredPath))) {
    issues.push('declared artifact set contains substitutions or extras');
  }
  const expectedTree = [...declared.keys(), 'manifest.json', 'receipt.json'].sort(codeUnitCompare);
  const actualTree = Array.isArray(acceptedTreeFiles)
    ? [...new Set(acceptedTreeFiles.map((entry) => normalizeArtifactPath(entry)))].sort(codeUnitCompare)
    : [];
  if (canonicalCaptureJson(actualTree) !== canonicalCaptureJson(expectedTree)) {
    issues.push('accepted tree differs from exact declared artifact allowlist');
  }
}

function validateArtifactClaim(value, label, issues) {
  if (!plainObject(value)) { issues.push(`${label} artifact claim is required`); return; }
  try {
    if (normalizeArtifactPath(value.path) !== value.path) issues.push(`${label}.path must be normalized relative path`);
  } catch (error) { issues.push(`${label}.path ${error.message}`); }
  if (!Number.isInteger(value.bytes) || value.bytes < 1) issues.push(`${label}.bytes must be positive integer`);
  if (!HASH_RE.test(String(value.sha256 || ''))) issues.push(`${label}.sha256 must be sha256`);
}

function validateCanonicalRoot(value, issues) {
  try {
    const url = new URL(value);
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') issues.push('canonicalUrl must lock normal / route without query/hash');
    if (!/^https?:$/.test(url.protocol)) issues.push('canonicalUrl must use http(s)');
  } catch (_error) { issues.push('canonicalUrl must be a valid URL'); }
}

function normalizeArtifactPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('must remain inside capture root');
  }
  const clean = path.posix.normalize(normalized);
  if (clean === '.' || clean.startsWith('../')) throw new Error('must remain inside capture root');
  return clean;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!plainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort(codeUnitCompare)) out[key] = sortKeys(value[key]);
  return out;
}

function codeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stringSetSha256(values) {
  const rows = Array.isArray(values) ? [...new Set(values.map(String))].sort(codeUnitCompare) : [];
  return sha256(Buffer.from(`${rows.join('\n')}\n`));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(String(value == null ? '' : value));
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function result(issues) {
  return { ok: issues.length === 0, issues };
}
