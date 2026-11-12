import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { strictWorktreeFingerprint } from './releaseSoakContracts.mjs';
import { readConsumedClaimLedgerEntry } from './validationBroker.mjs';
import { loadValidationManifestById } from './validationManifestRegistry.mjs';

export const PERFORMANCE_ELECTRON_MODERNIZATION_ACCEPTANCE_SCHEMA =
  'spaceface.performanceElectronModernizationAcceptance.v1';

const RUNTIMES = Object.freeze(['browser', 'electron']);
const MANIFEST_PREFIX = 'performance-electron-modernization-';

export function evaluateElectronModernizationPair({
  browserEvidence,
  electronEvidence,
  browserLedger,
  electronLedger,
  currentFingerprint,
} = {}) {
  const failures = [];
  validateRuntimeEvidence('browser', browserEvidence, browserLedger, currentFingerprint, failures);
  validateRuntimeEvidence('electron', electronEvidence, electronLedger, currentFingerprint, failures);

  const browserSource = browserEvidence?.sourceCandidateDigest;
  const electronSource = electronEvidence?.sourceCandidateDigest;
  if (!digest(browserSource) || !digest(electronSource) || browserSource !== electronSource) {
    failures.push('Browser and Electron must share one sourceCandidateDigest');
  }
  const browserCandidate = browserEvidence?.candidateDigest;
  const electronCandidate = electronEvidence?.candidateDigest;
  if (!digest(browserCandidate) || !digest(electronCandidate) || browserCandidate === electronCandidate) {
    failures.push('Browser and Electron must retain distinct runtime candidate digests');
  }

  const packagedStartup = electronEvidence?.packagedStartup;
  if (packagedStartup?.schema !== 'spaceface.electronPackagedStartupSubreceipt.v1'
      || packagedStartup?.pass !== true) {
    failures.push('Electron evidence requires a passing packaged-startup subreceipt');
  } else {
    if (packagedStartup.claimId !== electronEvidence.claimId) {
      failures.push('packaged-startup subreceipt must bind the Electron consumed claim');
    }
    for (const [label, value] of [
      ['packaged-startup report digest', packagedStartup.report?.sha256],
      ['packaged executable digest', packagedStartup.packageIdentity?.executable?.sha256],
      ['packaged app archive digest', packagedStartup.packageIdentity?.appArchive?.sha256],
    ]) {
      if (!digest(value)) failures.push(`${label} is required`);
    }
    if (!Number.isInteger(packagedStartup.report?.bytes) || packagedStartup.report.bytes < 1) {
      failures.push('packaged-startup report byte count is required');
    }
  }

  const browserP95 = finite(browserEvidence?.performance?.frameMs?.p95);
  const electronP95 = finite(electronEvidence?.performance?.frameMs?.p95);
  if (browserP95 == null || electronP95 == null) {
    failures.push('both runtimes must report finite steady-route p95 frame time');
  }
  const delta = browserP95 == null || electronP95 == null
    ? null
    : Number((electronP95 - browserP95).toFixed(6));

  return {
    schema: PERFORMANCE_ELECTRON_MODERNIZATION_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    sourceCandidateDigest: browserSource === electronSource ? browserSource : null,
    runtimeCandidateDigests: {
      browser: browserCandidate || null,
      electron: electronCandidate || null,
    },
    performance: {
      disposition: 'neutral-reporting',
      browserP95Ms: browserP95,
      electronP95Ms: electronP95,
      electronMinusBrowserP95Ms: delta,
      speedupRequired: false,
    },
    packagedStartup: packagedStartup || null,
    failures: [...new Set(failures)],
  };
}

export async function checkElectronModernizationEvidence({ root } = {}) {
  const repoRoot = path.resolve(root || '.');
  const currentFingerprint = await strictWorktreeFingerprint(repoRoot);
  const loaded = [];
  for (const runtimeKind of RUNTIMES) {
    loaded.push(await loadRuntimeEvidence({ root: repoRoot, runtimeKind }));
  }
  const missing = loaded.filter((entry) => entry.missing);
  if (missing.length) {
    return {
      status: 'pending',
      currentWorktreeId: currentFingerprint.id,
      currentWorktreeDigest: currentFingerprint.digest,
      runtimes: loaded.map(toRuntimeStatus),
      failures: missing.map((entry) => `${entry.runtime}: modernization evidence is absent`),
      comparison: null,
    };
  }

  const comparison = evaluateElectronModernizationPair({
    browserEvidence: loaded[0].evidence,
    electronEvidence: loaded[1].evidence,
    browserLedger: loaded[0].ledger,
    electronLedger: loaded[1].ledger,
    currentFingerprint,
  });
  const failures = [...loaded.flatMap((entry) => entry.failures), ...comparison.failures];
  const pass = failures.length === 0;
  return {
    status: pass ? 'pass' : 'fail',
    currentWorktreeId: currentFingerprint.id,
    currentWorktreeDigest: currentFingerprint.digest,
    runtimes: loaded.map((entry) => ({
      runtime: entry.runtime,
      status: pass && entry.failures.length === 0 ? 'pass' : 'fail',
      evidencePath: entry.evidencePath,
      worktreeId: entry.evidence?.worktreeId || null,
      worktreeDigest: entry.evidence?.worktreeDigest || null,
      claimId: entry.evidence?.claimId || null,
      failures: entry.failures,
    })),
    failures: [...new Set(failures)],
    comparison,
  };
}

async function loadRuntimeEvidence({ root, runtimeKind }) {
  const manifestId = `${MANIFEST_PREFIX}${runtimeKind}`;
  const manifest = await loadValidationManifestById({ root, id: manifestId });
  const artifactRoot = path.resolve(root, manifest.artifactRoot);
  const evidencePath = path.join(artifactRoot, runtimeKind, 'evidence.json');
  let evidenceBytes;
  try {
    evidenceBytes = await readFile(evidencePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { runtime: runtimeKind, evidencePath, missing: true, failures: [] };
    throw error;
  }
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  const ledgerEntry = await readConsumedClaimLedgerEntry(artifactRoot, evidence.claimId);
  const ledgerPath = evidence.claimId
    ? path.join(artifactRoot, 'broker-claims', '.consumed', `${safeClaimId(evidence.claimId)}.json`)
    : null;
  let ledgerBytes = null;
  if (ledgerEntry && ledgerPath) ledgerBytes = await readFile(ledgerPath);
  const ledger = ledgerEntry && ledgerBytes ? {
    entry: ledgerEntry,
    path: relativeTo(root, ledgerPath),
    sha256: sha256(ledgerBytes),
  } : null;
  const failures = [];
  if (runtimeKind === 'electron') {
    const reportPath = resolveContained(root, evidence.packagedStartup?.report?.path);
    if (!reportPath) {
      failures.push('Electron packaged-startup report path is missing or escapes the repository');
    } else {
      try {
        const reportBytes = await readFile(reportPath);
        if (reportBytes.length !== evidence.packagedStartup?.report?.bytes
            || sha256(reportBytes) !== evidence.packagedStartup?.report?.sha256) {
          failures.push('Electron packaged-startup report content binding failed');
        }
      } catch (error) {
        failures.push(`Electron packaged-startup report is unreadable: ${error?.code || error?.message || error}`);
      }
    }
  }
  return { runtime: runtimeKind, evidencePath, evidence, ledger, missing: false, failures };
}

function validateRuntimeEvidence(runtimeKind, evidence, ledger, currentFingerprint, failures) {
  const prefix = runtimeKind === 'browser' ? 'Browser' : 'Electron';
  if (evidence?.schema !== 'spaceface.releaseSoak.v1') failures.push(`${prefix} release-soak schema is invalid`);
  if (evidence?.pass !== true || evidence?.primaryAcceptance !== true) {
    failures.push(`${prefix} evidence must be passing primary acceptance`);
  }
  if (evidence?.runtimeKind !== runtimeKind) failures.push(`${prefix} runtime identity is invalid`);
  if (evidence?.manifestId !== `${MANIFEST_PREFIX}${runtimeKind}`) {
    failures.push(`${prefix} manifest identity is invalid`);
  }
  if (!evidence?.claimId) failures.push(`${prefix} consumed claim id is required`);
  if (!digest(evidence?.sourceCandidateDigest) || !digest(evidence?.candidateDigest)) {
    failures.push(`${prefix} source and runtime candidate digests are required`);
  }
  if (evidence?.digests?.sourceCandidateDigest !== evidence?.sourceCandidateDigest
      || evidence?.digests?.candidateDigest !== evidence?.candidateDigest) {
    failures.push(`${prefix} evidence digests do not bind its broker claim`);
  }
  if (!ledger?.entry || ledger.entry.claimId !== evidence?.claimId
      || ledger.entry.runtimeKind !== runtimeKind || ledger.entry.mode !== 'acceptance'
      || ledger.entry.candidateDigest !== evidence?.candidateDigest) {
    failures.push(`${prefix} claim does not resolve against the consumed-claim ledger`);
  }
  if (evidence?.consumedClaim?.claimId !== evidence?.claimId
      || evidence?.consumedClaim?.path !== ledger?.path
      || evidence?.consumedClaim?.sha256 !== ledger?.sha256) {
    failures.push(`${prefix} evidence does not content-bind its consumed-claim ledger entry`);
  }
  if (evidence?.worktreeId !== currentFingerprint?.id
      || evidence?.worktreeDigest !== currentFingerprint?.digest) {
    failures.push(`${prefix} evidence is not bound to the current worktree`);
  }
  if (evidence?.quality?.settingsPass !== true
      || stableJson(evidence?.quality?.startSettings) !== stableJson(evidence?.quality?.endSettings)) {
    failures.push(`${prefix} default quality/settings were not preserved`);
  }
}

function toRuntimeStatus(entry) {
  return {
    runtime: entry.runtime,
    status: entry.missing ? 'pending' : 'fail',
    evidencePath: entry.missing ? null : entry.evidencePath,
    failures: entry.failures,
  };
}

function resolveContained(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : resolved;
}

function safeClaimId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '');
}

function relativeTo(root, filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function digest(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
