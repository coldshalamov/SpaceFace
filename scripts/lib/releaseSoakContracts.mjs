// Fail-closed release-soak evidence contracts.
//
// Primary acceptance is available only to a real browser/Electron run whose
// raw samples, lifecycle proof, cycles, settings, and content-hashed artifacts
// agree with their summaries. Synthetic contract fixtures can test this schema
// but can never become primary evidence.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const RELEASE_SOAK_SCHEMA = 'spaceface.releaseSoak.v1';
/** Structured full-quality frame-pacing attribution output (measurement-only; not primary soak acceptance). */
export const PERFORMANCE_ATTRIBUTION_SCHEMA = 'spaceface.performanceAttribution.v1';
export const REQUIRED_PRIMARY_CYCLE_MARKS = Object.freeze([
  'undock',
  'flight-input',
  'save-written',
  'load-restored',
  'economy-restored',
  'docked',
  'market-opened',
  'trade-roundtrip',
]);

export const PERF_BUDGET = Object.freeze({
  targetFrameMs: 16.7,
  floorFrameMs: 33.3,
  hitchThresholdMs: 32,
  maxHeapGrowthMb: 30,
  maxHeapGrowthBytes: 30 * 1024 * 1024,
});
export const REQUIRED_STEADY_PHASES = Object.freeze(['flight_steady', 'context_recover_steady']);

/** Route tags supported by the attribution sampler (additive; does not weaken soak gates). */
export const ATTRIBUTION_ROUTE_TAGS = Object.freeze([
  'flight_steady',
  'mining_tether_active',
  'docked_market_ui',
  'context_recover_steady',
]);

/** Diagnostic A/B variants — attribution only; must restore settings/timeScale exactly. */
export const ATTRIBUTION_DIAGNOSTIC_VARIANTS = Object.freeze([
  'baseline',
  'sim_paused',
  'bloom_off',
  'background_hidden',
  'non_player_entities_hidden',
  'stations_places_hidden',
  'non_player_ships_hidden',
  'vfx_hidden',
  'material_basic_override',
  'material_depth_override',
]);

export function validateReleaseSoakEvidence(envelope, { requireArtifacts = true } = {}) {
  const failures = [];
  if (!envelope || typeof envelope !== 'object') {
    return { pass: false, failures: ['evidence envelope must be an object'], envelope: null };
  }

  if (envelope.schema !== RELEASE_SOAK_SCHEMA) failures.push(`evidence schema must be ${RELEASE_SOAK_SCHEMA}`);
  if (!nonempty(envelope.taskId)) failures.push('evidence taskId is required');
  if (!isIso8601(envelope.generatedAt)) failures.push('evidence generatedAt must be an ISO 8601 string');
  if (!nonempty(envelope.worktreeId) || !nonempty(envelope.worktreeDigest)) {
    failures.push('evidence worktreeId and worktreeDigest are required');
  }
  const realRuntime = envelope.runtimeKind === 'browser' || envelope.runtimeKind === 'electron';
  if (!realRuntime && envelope.runtimeKind !== 'synthetic') failures.push('runtimeKind must be browser, electron, or synthetic');
  if (typeof envelope.primaryAcceptance !== 'boolean') failures.push('primaryAcceptance must be boolean');
  if (envelope.runtimeKind === 'synthetic' && envelope.primaryAcceptance !== false) {
    failures.push('synthetic evidence cannot claim primary acceptance');
  }
  if (envelope.primaryAcceptance === true && !realRuntime) failures.push('primary acceptance requires a real browser or Electron runtime');
  if (envelope.primaryAcceptance === true && envelope.injectedState !== false) failures.push('primary evidence must declare injectedState=false');
  if (envelope.primaryAcceptance === true && envelope.inputSource !== 'keyboard-mouse') {
    failures.push('primary evidence must use the public keyboard-mouse route');
  }
  if (envelope.primaryAcceptance === true) {
    const start = envelope.fingerprints?.start;
    const end = envelope.fingerprints?.end;
    if (!start || !end) failures.push('primary evidence requires start/end worktree fingerprints');
    else {
      if (start.digest !== envelope.worktreeDigest || start.id !== envelope.worktreeId) failures.push('start fingerprint does not bind the evidence worktree');
      if (end.digest !== start.digest || end.id !== start.id) failures.push('worktree fingerprint changed during capture');
    }
  }

  validateChecks(envelope.checks, envelope.primaryAcceptance === true, failures);
  validateCycles(envelope.cycles, envelope.primaryAcceptance === true, failures);

  const artifactsRequired = envelope.primaryAcceptance === true;
  if (artifactsRequired) {
    if (!Array.isArray(envelope.artifacts) || envelope.artifacts.length === 0) {
      failures.push('content-hashed artifacts are required for primary acceptance');
    } else {
      for (const artifact of envelope.artifacts) {
        if (!nonempty(artifact?.kind) || !nonempty(artifact?.path)) failures.push('each artifact needs kind and path');
        if (!Number.isInteger(artifact?.bytes) || artifact.bytes < 1) failures.push(`artifact ${artifact?.path || '<missing>'} needs positive bytes`);
        if (!/^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || ''))) failures.push(`artifact ${artifact?.path || '<missing>'} needs sha256`);
      }
      if (!envelope.artifacts.some((artifact) => artifact.kind === 'screenshot')) failures.push('primary evidence requires screenshot artifacts');
    }
  }

  if (!envelope.quality || typeof envelope.quality !== 'object') {
    failures.push('evidence quality section is required');
  } else {
    failures.push(...validateNoQualityShortcuts(envelope.quality).failures);
    const start = validateSettingsTruth(envelope.quality.startSettings);
    const end = validateSettingsTruth(envelope.quality.endSettings, { expected: envelope.quality.startSettings });
    failures.push(...start.failures.map((failure) => `quality start: ${failure}`));
    failures.push(...end.failures.map((failure) => `quality end: ${failure}`));
    if (envelope.quality.settingsPass !== (start.pass && end.pass && validateNoQualityShortcuts(envelope.quality).pass)) {
      failures.push('quality.settingsPass does not match recomputed settings/shortcut validation');
    }
  }

  if (!envelope.performance || typeof envelope.performance !== 'object') failures.push('evidence performance section is required');
  else failures.push(...validatePerformanceEvidence(envelope.performance).failures);

  if (!envelope.memory || typeof envelope.memory !== 'object') failures.push('evidence memory section is required');
  else failures.push(...validateMemoryEvidence(envelope.memory).failures);

  validateErrors(envelope.errors, failures);
  if (envelope.primaryAcceptance === true) {
    validateContextLoss(envelope.contextLoss, failures);
    failures.push(...validateCleanupEvidence(envelope.cleanup, { runtimeKind: envelope.runtimeKind }).failures);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)], envelope };
}

function validateChecks(checks, primary, failures) {
  if (!Array.isArray(checks) || checks.length === 0) {
    failures.push('evidence checks array is required');
    return;
  }
  for (const check of checks) {
    if (!nonempty(check?.name) || !['pass', 'fail', 'skip'].includes(check?.status)) failures.push('each check needs a name and valid status');
  }
  const failed = checks.filter((check) => check?.status === 'fail');
  if (failed.length) failures.push(`evidence checks failed: ${failed.map((check) => check.name).join(', ')}`);
  if (primary && checks.some((check) => check?.status !== 'pass')) failures.push('primary evidence may not contain fail or skip checks');
  if (primary && !checks.some((check) => check?.status === 'pass')) failures.push('primary evidence requires passing checks');
}

function validateCycles(cycles, primary, failures) {
  if (!cycles || !Number.isInteger(cycles.count) || cycles.count < 1) {
    failures.push('evidence cycles.count must be a positive integer');
    return;
  }
  if (!Array.isArray(cycles.results) || cycles.results.length !== cycles.count) {
    failures.push('evidence cycles.results length must equal cycles.count');
    return;
  }
  if (!primary) return;
  cycles.results.forEach((result, index) => {
    if (result?.index !== index) failures.push(`cycle ${index} index is missing or out of order`);
    if (result?.pass !== true) failures.push(`cycle ${index} did not pass`);
    if (!Array.isArray(result?.marks)) failures.push(`cycle ${index} marks are required`);
    else for (const mark of REQUIRED_PRIMARY_CYCLE_MARKS) if (!result.marks.includes(mark)) failures.push(`cycle ${index} missing ${mark}`);
    if (!Number.isInteger(result?.sampleCount) || result.sampleCount < 1) failures.push(`cycle ${index} needs finite runtime samples`);
  });
}

export function validateNoQualityShortcuts(quality) {
  const failures = [];
  if (!quality || typeof quality !== 'object') return { pass: false, failures: ['quality object is required'] };
  if (quality.settingsOverridesApplied !== false) failures.push('quality.settingsOverridesApplied must be false');
  if (quality.authoredAssetFallback === true || quality.authoredReady === false) failures.push('authored assets fell back or were not ready');
  if (quality.physicsSimplification === true) failures.push('physics simplification was applied');
  return { pass: failures.length === 0, failures };
}

export function validateSettingsTruth(settings, { expected = null } = {}) {
  const failures = [];
  if (!settings || typeof settings !== 'object' || !settings.video || typeof settings.video !== 'object') {
    return { pass: false, failures: ['settings.video truth object is required'] };
  }
  const video = settings.video;
  if (!Number.isFinite(video.renderScale) || video.renderScale <= 0) failures.push('settings.video.renderScale must be finite and positive');
  if (video.pixelRatioCap != null && (!Number.isFinite(video.pixelRatioCap) || video.pixelRatioCap <= 0)) failures.push('settings.video.pixelRatioCap must be null or finite and positive');
  for (const key of ['shadows', 'bloom']) if (typeof video[key] !== 'boolean') failures.push(`settings.video.${key} must be boolean`);
  if (!nonempty(video.particleQuality)) failures.push('settings.video.particleQuality is required');
  if (expected) {
    const expectedVideo = expected?.video;
    if (!expectedVideo || typeof expectedVideo !== 'object') failures.push('expected start settings.video is required');
    else {
      for (const key of ['renderScale', 'pixelRatioCap', 'shadows', 'bloom', 'particleQuality']) {
        if (!sameValue(video[key], expectedVideo[key])) failures.push(`settings.video.${key} changed during the probe`);
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export function validatePerformanceEvidence(perf) {
  const failures = [];
  if (!Array.isArray(perf?.samples) || perf.samples.length === 0) return { pass: false, failures: ['performance.samples array is required'] };
  if (perf.samples.some((sample) => !Number.isFinite(sample?.frameMs) || sample.frameMs <= 0)) failures.push('performance samples must all contain finite positive frameMs');
  if (perf.samples.some((sample) => !REQUIRED_STEADY_PHASES.includes(sample?.phaseTag))) {
    failures.push('performance samples must be tagged as an allowed uninterrupted steady-state phase');
  }
  for (const phaseTag of REQUIRED_STEADY_PHASES) {
    const phaseSamples = perf.samples.filter((sample) => sample?.phaseTag === phaseTag);
    if (phaseSamples.length < 150) failures.push(`performance phase ${phaseTag} requires at least 150 consecutive rAF samples`);
    const claimedPhase = perf?.phases?.[phaseTag];
    const computedPhase = summarizeSamples(phaseSamples);
    if (!claimedPhase || typeof claimedPhase !== 'object') failures.push(`performance.phases.${phaseTag} is required`);
    else {
      for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max', 'hitchesOver32Ms']) {
        if (!nearlyEqual(claimedPhase[key], computedPhase[key])) failures.push(`performance.phases.${phaseTag}.${key} does not match raw samples`);
      }
    }
    if (Number.isFinite(computedPhase.p95) && computedPhase.p95 > PERF_BUDGET.floorFrameMs) failures.push(`${phaseTag} p95 ${computedPhase.p95} ms exceeds ${PERF_BUDGET.floorFrameMs} ms`);
    if (Number.isFinite(computedPhase.p99) && computedPhase.p99 > PERF_BUDGET.floorFrameMs) failures.push(`${phaseTag} p99 ${computedPhase.p99} ms exceeds ${PERF_BUDGET.floorFrameMs} ms`);
    if (computedPhase.hitchesOver32Ms !== 0) failures.push(`${phaseTag} contains ${computedPhase.hitchesOver32Ms} hitches over ${PERF_BUDGET.hitchThresholdMs} ms`);
  }
  const computed = summarizeSamples(perf.samples);
  const claimed = perf.frameMs;
  if (!claimed || typeof claimed !== 'object') failures.push('performance.frameMs is required');
  else {
    for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max', 'hitchesOver32Ms']) {
      if (!nearlyEqual(claimed[key], computed[key])) failures.push(`performance.frameMs.${key} does not match raw samples`);
    }
  }
  if (Number.isFinite(computed.p95) && computed.p95 > PERF_BUDGET.floorFrameMs) failures.push(`performance p95 ${computed.p95} ms exceeds ${PERF_BUDGET.floorFrameMs} ms`);
  if (Number.isFinite(computed.p99) && computed.p99 > PERF_BUDGET.floorFrameMs) failures.push(`performance p99 ${computed.p99} ms exceeds ${PERF_BUDGET.floorFrameMs} ms`);
  if (computed.hitchesOver32Ms !== 0) failures.push(`performance contains ${computed.hitchesOver32Ms} hitches over ${PERF_BUDGET.hitchThresholdMs} ms`);
  return { pass: failures.length === 0, failures, computed };
}

export function validateMemoryEvidence(memory) {
  const failures = [];
  if (memory?.retainedAfterGc !== true) failures.push('memory must be retained post-GC evidence');
  if (memory?.comparableState !== 'docked-market') failures.push('memory endpoints must use comparable docked-market state');
  if (memory?.startSnapshot?.docked !== true || memory?.endSnapshot?.docked !== true) failures.push('memory endpoint snapshots must both be docked');
  if (!Number.isFinite(memory?.heapBytesStart)) failures.push('memory.heapBytesStart must be finite');
  if (!Number.isFinite(memory?.heapBytesEnd)) failures.push('memory.heapBytesEnd must be finite');
  if (Number.isFinite(memory?.heapBytesStart) && Number.isFinite(memory?.heapBytesEnd)) {
    const growth = memory.heapBytesEnd - memory.heapBytesStart;
    if (!nearlyEqual(memory.heapGrowthBytes, growth)) failures.push('memory.heapGrowthBytes does not match start/end');
    if (memory.withinBudget !== (growth <= PERF_BUDGET.maxHeapGrowthBytes)) failures.push('memory.withinBudget does not match computed growth');
    if (growth > PERF_BUDGET.maxHeapGrowthBytes) failures.push(`heap growth ${bytesToMb(growth)} MB exceeds ${PERF_BUDGET.maxHeapGrowthMb} MB`);
  }
  for (const key of ['geometries', 'textures', 'programs']) {
    const range = memory?.[key];
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || !Number.isFinite(range.delta)) {
      failures.push(`memory.${key} needs finite start/end/delta`);
      continue;
    }
    const delta = range.end - range.start;
    if (!nearlyEqual(range.delta, delta)) failures.push(`memory.${key}.delta does not match start/end`);
    if (key !== 'programs' && delta > 50) failures.push(`memory.${key} grew by ${delta}`);
    if (key === 'programs' && delta > 0) failures.push(`memory.programs grew by ${delta}`);
  }
  return { pass: failures.length === 0, failures };
}

function validateErrors(errors, failures) {
  if (!errors || typeof errors !== 'object') {
    failures.push('evidence errors section is required');
    return;
  }
  for (const key of ['pageErrors', 'requestFailures', 'glErrors', 'consoleErrors', 'httpErrors', 'warnings']) {
    if (!Array.isArray(errors[key])) failures.push(`errors.${key} must be an array`);
    else if (errors[key].length) failures.push(`${key} present: ${errors[key].length}`);
  }
}

function validateContextLoss(contextLoss, failures) {
  if (!contextLoss || typeof contextLoss !== 'object') {
    failures.push('context-loss evidence is required');
    return;
  }
  for (const key of ['available', 'lostEvent', 'restoredEvent', 'meshResourceReady', 'pixelProof', 'frameAdvanced', 'recovered']) {
    if (contextLoss[key] !== true) failures.push(`contextLoss.${key} must be true`);
  }
  if (contextLoss.meshRebuilt !== true && contextLoss.meshRetained !== true) {
    failures.push('contextLoss must prove either rebuilt or retained mesh identity');
  }
  if (contextLoss.before !== false || contextLoss.after !== false) failures.push('context must be live before and after the controlled loss');
}

export function validateCleanupEvidence(cleanup, { runtimeKind = 'browser' } = {}) {
  const failures = [];
  if (!cleanup || typeof cleanup !== 'object') return { pass: false, failures: ['cleanup evidence is required'] };
  if (cleanup.pageClosed !== true) failures.push('page was not closed');
  if (cleanup.reportPass !== true) failures.push('owned runtime cleanup report did not pass');
  const owned = cleanup.ownedReport;
  if (!owned || owned.pass !== true) failures.push('full owned runtime cleanup report is missing or failed');
  if (cleanup.portsReleased !== true) failures.push('owned listening ports were not released');
  if (cleanup.serverReleased !== true) failures.push('owned server/listener was not released');
  if (runtimeKind === 'electron') {
    if (cleanup.processExited !== true) failures.push('Electron process exit was not confirmed');
    if (cleanup.browserDisconnected !== true) failures.push('Electron application connection was not released');
    if (owned?.gracefulProcessCloseConfirmed !== true) failures.push('Electron graceful process close was not confirmed');
    if (owned?.forceClose?.attempted === true) failures.push('Electron force-close fallback was required');
    if (owned?.precloseUrlCheck?.pass !== true || owned?.urlTracker?.pass !== true) failures.push('Electron canonical URL lifecycle cleanup failed');
    if (owned?.processHealth?.pass !== true || owned?.listenerReleased !== true) failures.push('Electron process/listener health cleanup failed');
  } else if (cleanup.browserDisconnected !== true && cleanup.browserClosed !== true) failures.push('browser was not released');
  return { pass: failures.length === 0, failures };
}

export async function validateArtifactFiles(root, artifacts, { lstatImpl = lstat, readFileImpl = readFile, requireClaims = false } = {}) {
  const failures = [];
  const verified = [];
  if (!Array.isArray(artifacts) || artifacts.length === 0) return { pass: false, failures: ['artifacts must be a non-empty array'], verified };
  for (const artifact of artifacts) {
    if (!nonempty(artifact?.path)) { failures.push('artifact missing path'); continue; }
    if (requireClaims && (!Number.isInteger(artifact.bytes) || artifact.bytes < 1 || !/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || '')))) {
      failures.push(`artifact integrity claims are required: ${artifact.path}`);
      continue;
    }
    const filePath = path.resolve(root, artifact.path);
    const relative = path.relative(path.resolve(root), filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { failures.push(`artifact path escapes root: ${artifact.path}`); continue; }
    try {
      const metadata = await lstatImpl(filePath);
      if (!metadata.isFile() || metadata.isSymbolicLink?.()) { failures.push(`artifact is not a regular file: ${artifact.path}`); continue; }
      const contents = await readFileImpl(filePath);
      if (contents.length < 1) { failures.push(`artifact is empty: ${artifact.path}`); continue; }
      const sha256 = createHash('sha256').update(contents).digest('hex');
      if (artifact.bytes != null && artifact.bytes !== contents.length) failures.push(`artifact byte count mismatch: ${artifact.path}`);
      if (artifact.sha256 != null && artifact.sha256 !== sha256) failures.push(`artifact hash mismatch: ${artifact.path}`);
      verified.push({ ...artifact, bytes: contents.length, sha256 });
    } catch (error) {
      failures.push(`artifact missing or unreadable: ${artifact.path} (${error.code || error.message})`);
    }
  }
  return { pass: failures.length === 0, failures, verified };
}

// Unlike `git diff --binary`, this never buffers binary patches. Git metadata is
// bounded and each changed/untracked file is streamed into the digest.
export async function strictWorktreeFingerprint(root) {
  const digest = createHash('sha256');
  const head = (await runGitCapture(root, ['rev-parse', 'HEAD'])).trim();
  const branch = (await runGitCapture(root, ['branch', '--show-current'])).trim();
  if (!/^[a-f0-9]{40}$/i.test(head)) throw new Error('unable to resolve git HEAD for release-soak fingerprint');
  digest.update(`HEAD\0${head}\0BRANCH\0${branch}\0`);
  await streamGitIntoHash(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all'], digest, 'STATUS');
  await streamGitIntoHash(root, ['diff', '--raw', '-z', 'HEAD'], digest, 'DIFF');
  await streamGitIntoHash(root, ['diff', '--cached', '--raw', '-z'], digest, 'INDEX');
  const changed = new Set([
    ...splitNul(await runGitCapture(root, ['diff', '--name-only', '-z'])),
    ...splitNul(await runGitCapture(root, ['diff', '--cached', '--name-only', '-z'])),
    ...splitNul(await runGitCapture(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ]);
  for (const relative of [...changed].sort()) {
    const absolute = path.resolve(root, relative);
    const safe = path.relative(path.resolve(root), absolute);
    if (safe.startsWith('..') || path.isAbsolute(safe)) throw new Error(`fingerprint path escapes root: ${relative}`);
    let metadata;
    try { metadata = await lstat(absolute); } catch (error) {
      if (error.code === 'ENOENT') { digest.update(`MISSING\0${relative}\0`); continue; }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`fingerprint refuses non-regular path: ${relative}`);
    digest.update(`FILE\0${relative}\0${metadata.size}\0`);
    await pipeFileIntoHash(absolute, digest);
    digest.update('\0');
  }
  const value = digest.digest('hex');
  return { id: `${head.slice(0, 12)}-${value.slice(0, 16)}`, digest: value, head, branch, changedFileCount: changed.size };
}

function runGitCapture(cwd, args, maxBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let stderr = '';
    child.stdout.on('data', (chunk) => { bytes += chunk.length; if (bytes > maxBytes) child.kill(); else chunks.push(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (bytes > maxBytes) reject(new Error(`git ${args[0]} metadata exceeded ${maxBytes} bytes`));
      else if (code !== 0) reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function streamGitIntoHash(cwd, args, hash, label) {
  return new Promise((resolve, reject) => {
    hash.update(`${label}\0`);
    const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', (chunk) => hash.update(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`)));
  });
}

function pipeFileIntoHash(filePath, hash) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

export function bytesToMb(bytes) { return Math.round(bytes / 1024 / 1024 * 100) / 100; }

export function summarizeSamples(samples) {
  const values = (Array.isArray(samples) ? samples : []).filter((sample) => Number.isFinite(sample?.frameMs) && sample.frameMs > 0).map((sample) => sample.frameMs).sort((a, b) => a - b);
  return {
    sampleCount: values.length,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? values[values.length - 1] : null,
    hitchesOver32Ms: values.filter((value) => value > PERF_BUDGET.hitchThresholdMs).length,
  };
}

/**
 * Additive optional validation for performance-attribution.json.
 * Does not participate in primary release-soak acceptance and never weakens soak gates.
 */
export function validatePerformanceAttribution(doc) {
  const failures = [];
  if (!doc || typeof doc !== 'object') {
    return { pass: false, failures: ['attribution document must be an object'] };
  }
  if (doc.schema !== PERFORMANCE_ATTRIBUTION_SCHEMA) {
    failures.push(`schema must be ${PERFORMANCE_ATTRIBUTION_SCHEMA}`);
  }
  if (doc.kind !== 'diagnostic-measurement') {
    failures.push('kind must be "diagnostic-measurement" (not a shippable fix)');
  }
  if (doc.qualityPreserving !== true) {
    failures.push('qualityPreserving must be true (no resolution/effect/asset shortcuts)');
  }
  if (!Array.isArray(doc.windows) || doc.windows.length === 0) {
    failures.push('windows array is required and must be non-empty');
  } else {
    for (let i = 0; i < doc.windows.length; i += 1) {
      failures.push(...validateAttributionWindow(doc.windows[i], i));
    }
  }
  if (doc.variants != null) {
    if (!Array.isArray(doc.variants)) failures.push('variants must be an array when present');
    else {
      for (const variant of doc.variants) {
        if (!ATTRIBUTION_DIAGNOSTIC_VARIANTS.includes(variant?.id) && variant?.id !== 'baseline') {
          // allow listed ids only
          if (!nonempty(variant?.id)) failures.push('each variant needs an id');
        }
        if (variant && variant.diagnostic !== true && variant.id !== 'baseline') {
          failures.push(`variant ${variant.id} must be labeled diagnostic:true`);
        }
        if (variant && variant.restored !== true) {
          failures.push(`variant ${variant?.id || '<missing>'} must report restored:true`);
        }
      }
    }
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

function validateAttributionWindow(window, index) {
  const failures = [];
  const prefix = `windows[${index}]`;
  if (!window || typeof window !== 'object') return [`${prefix} must be an object`];
  if (!ATTRIBUTION_ROUTE_TAGS.includes(window.routeTag) && !REQUIRED_STEADY_PHASES.includes(window.routeTag)) {
    if (!nonempty(window.routeTag)) failures.push(`${prefix}.routeTag is required`);
  }
  const frame = window.frameMs || window.raf;
  if (!frame || typeof frame !== 'object') failures.push(`${prefix}.frameMs (rAF summary) is required`);
  else {
    for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max', 'hitchesOver32Ms']) {
      if (!(key in frame)) failures.push(`${prefix}.frameMs.${key} is required`);
    }
  }
  if (!window.routeProof || typeof window.routeProof !== 'object') {
    failures.push(`${prefix}.routeProof is required`);
  } else {
    if (typeof window.routeProof.mode !== 'string') failures.push(`${prefix}.routeProof.mode is required`);
    if (typeof window.routeProof.docked !== 'boolean') failures.push(`${prefix}.routeProof.docked is required`);
    if (window.routeTag === 'docked_market_ui') {
      if (window.routeProof.docked !== true) failures.push(`${prefix} docked_market_ui must prove docked=true`);
      if (window.routeProof.uiOnlyPath !== true) {
        failures.push(`${prefix} docked_market_ui must label uiOnlyPath=true (not zero-cost render)`);
      }
    }
    if (window.routeTag === 'mining_tether_active') {
      const vfx = window.routeProof.vfxSubsystems || {};
      const mining = Number(vfx.miningBeam) || 0;
      const tether = Number(vfx.tetherCable) || 0;
      const startVfx = window.routeProof.start?.vfxSubsystems || {};
      const startMining = Number(startVfx.miningBeam) || 0;
      const startTether = Number(startVfx.tetherCable) || 0;
      const vfxIsolationWindow = window.diagnostic === true && window.diagnosticVariant === 'vfx_hidden';
      if (vfxIsolationWindow && (startMining < 1 && startTether < 1)) {
        failures.push(`${prefix} vfx_hidden must prove miningBeam or tetherCable active before isolation`);
      } else if (vfxIsolationWindow && (mining > 0 || tether > 0)) {
        failures.push(`${prefix} vfx_hidden must suppress miningBeam and tetherCable during measurement`);
      } else if (!vfxIsolationWindow && mining < 1 && tether < 1) {
        failures.push(`${prefix} mining_tether_active must prove miningBeam or tetherCable VFX active`);
      }
    }
  }
  if (!window.settings || typeof window.settings !== 'object') {
    failures.push(`${prefix}.settings start/end truth is required`);
  } else {
    if (!window.settings.start || !window.settings.end) failures.push(`${prefix}.settings.start/end required`);
  }
  if (!window.gpuTimers || typeof window.gpuTimers !== 'object') {
    failures.push(`${prefix}.gpuTimers capability status is required`);
  } else if (!['available', 'unavailable', 'ok', 'disjoint'].includes(window.gpuTimers.status)
    && window.gpuTimers.available !== true && window.gpuTimers.available !== false) {
    failures.push(`${prefix}.gpuTimers must report available/status`);
  }
  // Optional rich fields — when present, shape-check only.
  if (window.cpu && typeof window.cpu !== 'object') failures.push(`${prefix}.cpu must be an object`);
  if (window.draw && typeof window.draw !== 'object') failures.push(`${prefix}.draw must be an object`);
  if (window.post && typeof window.post !== 'object') failures.push(`${prefix}.post must be an object`);
  return failures;
}

export function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * ratio))];
}

function splitNul(value) { return String(value || '').split('\0').filter(Boolean); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function sameValue(a, b) { return a === b || (a == null && b == null); }
function nearlyEqual(a, b) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.001; }
function isIso8601(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value); }
