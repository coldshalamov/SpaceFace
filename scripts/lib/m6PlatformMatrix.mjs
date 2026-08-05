import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { checkElectronModernizationEvidence } from './performanceElectronModernizationAcceptance.mjs';
import { strictWorktreeFingerprint } from './releaseSoakContracts.mjs';
import { createValidationBroker } from './validationBroker.mjs';
import { loadValidationManifestById } from './validationManifestRegistry.mjs';

const execFileAsync = promisify(execFile);

export const M6_PLATFORM_MATRIX_SCHEMA = 'spaceface.m6PlatformMatrix.v1';

export const M6_PLATFORM_WAVES = Object.freeze([
  Object.freeze({
    id: 'wave-1-platform-route',
    title: 'Canonical browser and Electron route parity',
    requiresHeadedEvidence: true,
    commands: Object.freeze([
      command('launch-policy', 'scripts/check-launch-policy.mjs'),
    ]),
  }),
  Object.freeze({
    id: 'wave-2-input-accessibility',
    title: 'Keyboard, pointer, accessibility, and contrast',
    commands: Object.freeze([
      command('input-modalities', 'scripts/check-input-modalities.mjs'),
      command('ui-a11y', 'scripts/check-ui-a11y.mjs'),
      command('wcag-contrast', 'scripts/check-wcag-contrast.mjs'),
    ]),
  }),
  Object.freeze({
    id: 'wave-3-persistence-soak',
    title: 'Deterministic session, save, corruption, and recovery',
    commands: Object.freeze([
      command('release-soak-quick', 'scripts/check-release-soak.mjs', ['--quick']),
      command('corrupt-save-recovery', null, ['--test', 'test/m6-corrupt-save-recovery.test.mjs']),
      command('save-load-slot-trust', 'scripts/check-save-load-slot-trust.mjs'),
      command('settings-profile-persistence', 'scripts/check-settings-profile-persistence.mjs'),
    ]),
  }),
  Object.freeze({
    id: 'wave-4-capture-packaging',
    title: 'Evidence-bound capture and desktop packaging parity',
    commands: Object.freeze([
      command('release-capture-accepted', 'scripts/check-release-capture.mjs'),
      command('release-capture-contract', 'scripts/check-release-capture.mjs', ['--self-test']),
      command('packaging-parity', null, ['--test', 'test/m6-packaging-parity.test.mjs']),
    ]),
  }),
  Object.freeze({
    id: 'wave-5-release-floor',
    title: 'Quality-preserving render, bundle, and asset reachability floor',
    commands: Object.freeze([
      command('render-hotpath', 'scripts/check-render-hotpath-contract.mjs'),
      command('ship-material-sharing', 'scripts/check-ship-material-sharing-contract.mjs'),
      command('bundle', 'scripts/check-bundle.mjs'),
      command('asset-reachability', 'scripts/check-asset-reachability.mjs'),
    ]),
  }),
]);

export async function runM6PlatformMatrix({
  root,
  captureHeaded = false,
  log = () => {},
  headedEvidenceChecker = defaultHeadedEvidenceChecker,
  headedCaptureRunner = captureHeadedReleaseSoaks,
  commandRunner = runNodeCommand,
  fingerprintReader = strictWorktreeFingerprint,
} = {}) {
  if (!root) throw new Error('runM6PlatformMatrix requires root');

  const startFingerprint = await fingerprintReader(root);
  let capture = { requested: false, pass: true, runtimes: [], failures: [] };
  if (captureHeaded) {
    try {
      capture = await headedCaptureRunner({ root, log });
    } catch (error) {
      capture = {
        requested: true,
        pass: false,
        runtimes: [],
        failures: [`fresh headed capture threw: ${error?.message || String(error)}`],
      };
    }
  }
  let headed;
  try {
    headed = await headedEvidenceChecker({ root });
  } catch (error) {
    headed = {
      status: 'fail',
      runtimes: [],
      failures: [`headed evidence validation threw: ${error?.message || String(error)}`],
    };
  }
  const headedBinding = validateHeadedFingerprintBinding(headed, startFingerprint);

  // The five waves are an ordered acceptance sequence. Running every check in one
  // Promise.all made bundle, asset, capture, and persistence publishers compete for
  // the same machine and could manufacture false reds. Execute in canonical order;
  // the checks themselves retain their own internal safe parallelism.
  const commandResults = [];
  for (const wave of M6_PLATFORM_WAVES) {
    log(`[m6-platform] ${wave.id}: ${wave.title}`);
    for (const spec of wave.commands) {
      let raw;
      try {
        raw = await commandRunner({ root, spec, log });
      } catch (error) {
        raw = {
          id: spec.id,
          pass: false,
          exitCode: 1,
          stdout: '',
          stderr: `command runner threw: ${error?.message || String(error)}`,
        };
      }
      commandResults.push({ waveId: wave.id, ...normalizeCommandResult(spec, raw) });
    }
  }
  const endFingerprint = await fingerprintReader(root);
  const worktreeStable = startFingerprint.digest === endFingerprint.digest;

  const waves = M6_PLATFORM_WAVES.map((wave) => {
    const checks = commandResults.filter((result) => result.waveId === wave.id);
    if (wave.requiresHeadedEvidence) {
      checks.unshift({
        id: 'headed-browser-electron-evidence',
        pass: headed?.status === 'pass' && headedBinding.pass && (!captureHeaded || capture.pass === true),
        exitCode: headed?.status === 'pass' && headedBinding.pass && (!captureHeaded || capture.pass === true) ? 0 : 1,
        stdout: summarizeHeadedEvidence(headed),
        stderr: [...(capture.failures || []), ...(headed?.failures || []), ...headedBinding.failures].join('\n'),
      });
    }
    if (wave.id === 'wave-5-release-floor') {
      checks.push({
        id: 'worktree-stable',
        pass: worktreeStable,
        exitCode: worktreeStable ? 0 : 1,
        stdout: `${startFingerprint.id}\n${endFingerprint.id}`,
        stderr: worktreeStable ? '' : 'worktree changed during the five-wave acceptance run',
      });
    }
    return {
      id: wave.id,
      title: wave.title,
      pass: checks.length > 0 && checks.every((check) => check.pass === true),
      checks: checks.map(withoutInternalFields),
    };
  });

  const result = {
    schema: M6_PLATFORM_MATRIX_SCHEMA,
    captureMode: captureHeaded ? 'fresh-headed' : 'existing-headed',
    pass: waves.every((wave) => wave.pass),
    waves,
    headed: normalizeHeadedEvidence(headed),
    capture: normalizeCapture(capture),
    fingerprints: { start: startFingerprint, end: endFingerprint },
    failures: collectFailures(waves),
  };
  result.matrixDigest = digestMatrix(result);
  return result;
}

export function validateM6PlatformMatrix(result) {
  const failures = [];
  const waves = Array.isArray(result?.waves) ? result.waves : [];
  const headedEntries = Array.isArray(result?.headed?.runtimes) ? result.headed.runtimes : [];
  const captureEntries = Array.isArray(result?.capture?.runtimes) ? result.capture.runtimes : [];
  if (result?.schema !== M6_PLATFORM_MATRIX_SCHEMA) failures.push(`schema must be ${M6_PLATFORM_MATRIX_SCHEMA}`);
  if (!['existing-headed', 'fresh-headed'].includes(result?.captureMode)) failures.push('captureMode must be existing-headed or fresh-headed');
  if (waves.length !== 5) failures.push('matrix must contain exactly five waves');
  const expectedIds = M6_PLATFORM_WAVES.map((wave) => wave.id);
  const actualIds = waves.map((wave) => wave?.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) failures.push('wave ids/order do not match the canonical five-wave matrix');
  for (const [index, wave] of waves.entries()) {
    if (!Array.isArray(wave?.checks) || wave.checks.length === 0) failures.push(`${wave?.id || 'unknown wave'} has no checks`);
    const definition = M6_PLATFORM_WAVES[index];
    const expectedChecks = [
      ...(definition?.requiresHeadedEvidence ? ['headed-browser-electron-evidence'] : []),
      ...(definition?.commands || []).map((check) => check.id),
      ...(definition?.id === 'wave-5-release-floor' ? ['worktree-stable'] : []),
    ];
    const actualChecks = (wave?.checks || []).map((check) => check?.id);
    if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) {
      failures.push(`${wave?.id || 'unknown wave'} check ids/order do not match the canonical matrix`);
    }
    for (const check of wave?.checks || []) {
      if (typeof check?.pass !== 'boolean') failures.push(`${wave?.id || 'unknown wave'}/${check?.id || 'unknown check'} pass must be boolean`);
      if (!Number.isInteger(check?.exitCode)) failures.push(`${wave?.id || 'unknown wave'}/${check?.id || 'unknown check'} exitCode must be an integer`);
      if (check?.pass === true && check?.exitCode !== 0) failures.push(`${wave?.id || 'unknown wave'}/${check?.id || 'unknown check'} passing check must exit 0`);
      if (check?.pass === false && check?.exitCode === 0) failures.push(`${wave?.id || 'unknown wave'}/${check?.id || 'unknown check'} failing check must exit nonzero`);
    }
    const computedPass = Array.isArray(wave?.checks) && wave.checks.length > 0 && wave.checks.every((check) => check?.pass === true);
    if (wave?.pass !== computedPass) failures.push(`${wave?.id || 'unknown wave'} pass does not match its checks`);
  }
  const computedOverall = waves.length === 5 && waves.every((wave) => wave?.pass === true);
  if (result?.pass !== computedOverall) failures.push('matrix pass does not match its waves');
  if (result?.matrixDigest !== digestMatrix(result)) failures.push('matrixDigest does not bind the ordered wave/check outcomes');
  const headedRuntimes = headedEntries.map((runtime) => runtime?.runtime);
  if (JSON.stringify(headedRuntimes) !== JSON.stringify(['browser', 'electron'])) {
    failures.push('headed evidence must contain browser then Electron');
  }
  if (result?.headed?.status === 'pass' && headedEntries.some((runtime) => runtime?.status !== 'pass' || !runtime?.evidencePath)) {
    failures.push('passing headed evidence requires passing browser and Electron evidence paths');
  }
  const headedBinding = validateHeadedFingerprintBinding(result?.headed, result?.fingerprints?.start);
  if (result?.headed?.status === 'pass' && !headedBinding.pass) failures.push(...headedBinding.failures);
  if (result?.pass === true && (result?.headed?.status !== 'pass' || headedEntries.some((runtime) => runtime?.status !== 'pass'))) {
    failures.push('passing matrix requires passing browser and Electron headed evidence');
  }
  if (result?.captureMode === 'fresh-headed') {
    const captureRuntimes = captureEntries.map((runtime) => runtime?.runtime);
    if (result?.capture?.requested !== true || JSON.stringify(captureRuntimes) !== JSON.stringify(['browser', 'electron'])) {
      failures.push('fresh-headed mode must capture browser then Electron');
    }
    if (result?.capture?.pass === true && captureEntries.some((runtime) => !runtime?.evidencePath || !/^[a-f0-9]{64}$/i.test(runtime?.evidenceSha256 || ''))) {
      failures.push('passing fresh-headed capture requires evidence path and SHA-256 for both runtimes');
    }
    if (result?.pass === true && result?.capture?.pass !== true) failures.push('passing fresh-headed matrix requires passing capture');
  } else if (result?.capture?.requested !== false || captureEntries.length !== 0) {
    failures.push('existing-headed mode must not claim a fresh capture');
  }
  if (!/^[a-f0-9]{64}$/i.test(result?.fingerprints?.start?.digest || '') || !/^[a-f0-9]{64}$/i.test(result?.fingerprints?.end?.digest || '')) {
    failures.push('matrix requires start/end worktree fingerprints');
  }
  if (result?.pass === true && result?.fingerprints?.start?.digest !== result?.fingerprints?.end?.digest) {
    failures.push('passing matrix requires a stable worktree fingerprint');
  }
  return { pass: failures.length === 0, failures };
}

export async function captureHeadedReleaseSoaks({
  root,
  log = () => {},
  soakRunner = runElectronModernizationCapture,
} = {}) {
  const runtimes = [];
  for (const runtime of ['browser', 'electron']) {
    log(`[m6-platform] capturing ${runtime} public route`);
    let result;
    try {
      result = await soakRunner({
        runtime,
        root,
        argv: ['--cycles=1'],
        log,
      });
    } catch (error) {
      result = { pass: false, failures: [`owned ${runtime} capture threw: ${error?.message || String(error)}`], receipt: null };
    }
    const receiptValid = Boolean(
      result?.receipt?.evidencePath
      && /^[a-f0-9]{64}$/i.test(result?.receipt?.evidenceSha256 || ''),
    );
    const failures = [...(result?.failures || [])];
    if (result?.pass === true && !receiptValid) failures.push(`${runtime} capture did not publish a content-bound receipt`);
    runtimes.push({
      runtime,
      pass: result?.pass === true && receiptValid,
      failures,
      receipt: result?.receipt || null,
    });
  }
  const failures = runtimes.flatMap((runtime) => runtime.failures.map((failure) => `${runtime.runtime}: ${failure}`));
  if (runtimes.length !== 2) failures.push('fresh headed capture did not reach both browser and Electron');
  return {
    requested: true,
    pass: runtimes.length === 2 && runtimes.every((runtime) => runtime.pass),
    runtimes,
    failures,
  };
}

export async function runNodeCommand({ root, spec, log = () => {}, timeoutMs = 900_000 } = {}) {
  const args = spec.script ? [spec.script, ...spec.args] : [...spec.args];
  log(`[m6-platform] ${spec.id}: ${process.execPath} ${args.join(' ')}`);
  try {
    const { stdout = '', stderr = '' } = await execFileAsync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
    });
    return { id: spec.id, pass: true, exitCode: 0, stdout: tail(stdout), stderr: tail(stderr) };
  } catch (error) {
    return {
      id: spec.id,
      pass: false,
      exitCode: Number.isInteger(error?.code) ? error.code : 1,
      stdout: tail(error?.stdout || ''),
      stderr: tail(error?.stderr || error?.message || ''),
    };
  }
}

async function defaultHeadedEvidenceChecker({ root }) {
  return checkElectronModernizationEvidence({ root });
}

async function runElectronModernizationCapture({ runtime, root, log = () => {} }) {
  const manifestId = `performance-electron-modernization-${runtime}`;
  const manifest = await loadValidationManifestById({ root, id: manifestId });
  const outputRoot = path.resolve(root, manifest.artifactRoot);
  const broker = createValidationBroker(manifest, { root, outputRoot });
  const result = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  if (result.status !== 'pass' || result.launched !== true || result.exitCode !== 0) {
    return {
      pass: false,
      failures: [
        `${manifestId}: ${result.reason || result.status || 'broker run failed'}`,
        result.stderr || null,
      ].filter(Boolean),
      receipt: null,
    };
  }
  const evidencePath = path.join(outputRoot, runtime, 'evidence.json');
  const evidenceBytes = await readFile(evidencePath);
  const evidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');
  log(`[m6-platform] ${runtime} broker evidence ${evidencePath}`);
  return {
    pass: true,
    failures: [],
    receipt: { evidencePath, evidenceSha256 },
  };
}

function command(id, script, args = []) {
  return Object.freeze({ id, script, args: Object.freeze([...args]) });
}

function normalizeHeadedEvidence(headed) {
  const runtimes = Array.isArray(headed?.runtimes) ? headed.runtimes : [];
  return {
    status: headed?.status || 'fail',
    currentWorktreeId: headed?.currentWorktreeId || null,
    currentWorktreeDigest: headed?.currentWorktreeDigest || null,
    runtimes: runtimes.map((runtime) => ({
      runtime: runtime.runtime,
      status: runtime.status,
      evidencePath: runtime.evidencePath || null,
      failures: runtime.failures || [],
    })),
    failures: headed?.failures || [],
  };
}

function normalizeCapture(capture) {
  const runtimes = Array.isArray(capture?.runtimes) ? capture.runtimes : [];
  return {
    requested: capture?.requested === true,
    pass: capture?.pass === true,
    runtimes: runtimes.map((runtime) => ({
      runtime: runtime.runtime,
      pass: runtime.pass === true,
      evidencePath: runtime.receipt?.evidencePath || null,
      evidenceSha256: runtime.receipt?.evidenceSha256 || null,
      failures: runtime.failures || [],
    })),
    failures: capture?.failures || [],
  };
}

function normalizeCommandResult(spec, result) {
  const failures = [];
  if (result?.id !== spec.id) failures.push(`command result id ${String(result?.id)} does not match ${spec.id}`);
  const reportedExitCode = Number.isInteger(result?.exitCode) ? result.exitCode : 1;
  const pass = result?.id === spec.id && result?.pass === true && reportedExitCode === 0;
  const exitCode = pass ? 0 : (reportedExitCode === 0 ? 1 : reportedExitCode);
  return {
    id: spec.id,
    pass,
    exitCode,
    stdout: tail(result?.stdout || ''),
    stderr: [tail(result?.stderr || ''), ...failures].filter(Boolean).join('\n'),
  };
}

function validateHeadedFingerprintBinding(headed, fingerprint) {
  const failures = [];
  if (!fingerprint?.id || !/^[a-f0-9]{64}$/i.test(fingerprint?.digest || '')) {
    failures.push('headed evidence cannot bind an invalid matrix start fingerprint');
  } else if (
    headed?.currentWorktreeId !== fingerprint.id
    || headed?.currentWorktreeDigest !== fingerprint.digest
  ) {
    failures.push('headed browser/Electron evidence is not bound to the matrix start revision');
  }
  return { pass: failures.length === 0, failures };
}

function summarizeHeadedEvidence(headed) {
  const runtimes = Array.isArray(headed?.runtimes) ? headed.runtimes : [];
  return runtimes.map((runtime) =>
    `${runtime.runtime}:${runtime.status}${runtime.evidencePath ? `:${runtime.evidencePath}` : ''}`).join('\n');
}

function collectFailures(waves) {
  return waves.flatMap((wave) => wave.checks
    .filter((check) => check.pass !== true)
    .map((check) => `${wave.id}/${check.id}: ${check.stderr || check.stdout || `exit ${check.exitCode}`}`));
}

function withoutInternalFields(result) {
  const { waveId: _waveId, ...publicResult } = result;
  return publicResult;
}

function digestMatrix(result) {
  const waves = Array.isArray(result?.waves) ? result.waves : [];
  const headedRuntimes = Array.isArray(result?.headed?.runtimes) ? result.headed.runtimes : [];
  const captureRuntimes = Array.isArray(result?.capture?.runtimes) ? result.capture.runtimes : [];
  const canonical = {
    schema: result?.schema,
    captureMode: result?.captureMode,
    pass: result?.pass,
    waves: waves.map((wave) => ({
      id: wave?.id,
      pass: wave?.pass,
      checks: (Array.isArray(wave?.checks) ? wave.checks : []).map((check) => ({ id: check?.id, pass: check?.pass, exitCode: check?.exitCode })),
    })),
    headed: {
      status: result?.headed?.status,
      currentWorktreeId: result?.headed?.currentWorktreeId,
      currentWorktreeDigest: result?.headed?.currentWorktreeDigest,
      runtimes: headedRuntimes.map((runtime) => ({ runtime: runtime?.runtime, status: runtime?.status, evidencePath: runtime?.evidencePath })),
    },
    capture: {
      requested: result?.capture?.requested,
      pass: result?.capture?.pass,
      runtimes: captureRuntimes.map((runtime) => ({ runtime: runtime?.runtime, pass: runtime?.pass, evidenceSha256: runtime?.evidenceSha256 })),
    },
    fingerprints: {
      start: result?.fingerprints?.start?.digest,
      end: result?.fingerprints?.end?.digest,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function tail(value, limit = 8_000) {
  const text = String(value || '').trim();
  return text.length <= limit ? text : text.slice(text.length - limit);
}
