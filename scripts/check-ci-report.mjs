#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 180000;
const LONG_TIMEOUT_MS = 420000;
const TAIL_LIMIT = 1600;

const SMOKE_COMMANDS = [
  cmd('ui-screen-imports', 'node scripts/check-ui-screen-imports.mjs'),
  cmd('47a-compare', 'npm run check:sim:compare'),
  cmd('47a-live-cold-open', 'npm run check:47a:live-cold-open', LONG_TIMEOUT_MS),
  cmd('first-15-runtime', 'npm run check:first-15-runtime', LONG_TIMEOUT_MS),
  cmd('market-first-loop', 'npm run check:market-first-loop', LONG_TIMEOUT_MS),
  cmd('claim-base', 'npm run check:claim-base'),
  cmd('flight-clean', 'npm run check:flight:clean', LONG_TIMEOUT_MS),
  cmd('save-schema', 'npm run check:save-schema'),
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}

async function runCli() {
  const failFast = process.argv.includes('--fail-fast');
  const smoke = process.argv.includes('--smoke');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const completeCheckCommand = [packageJson.scripts?.precheck, packageJson.scripts?.check]
    .filter(Boolean)
    .join(' && ');
  const commands = smoke
    ? SMOKE_COMMANDS
    : buildCommandMatrix(completeCheckCommand, packageJson.scripts || {});
  if (commands.length === 0) throw new Error('No commands found in the package check matrix');
  const startedAt = new Date().toISOString();
  const artifactRoot = buildArtifactRoot(startedAt);
  const results = [];

  for (const command of commands) {
    const result = await run(command, {
      artifactPath: buildArtifactPath(startedAt, command.id),
    });
    results.push(result);
    if (!result.ok && failFast) break;
  }

  const report = buildCiReport({
    startedAt,
    finishedAt: new Date().toISOString(),
    failFast,
    artifactRoot,
    matrixSource: smoke ? 'smoke' : 'package:scripts.precheck+check',
    results,
  });

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

export function buildCommandMatrix(checkCommand = '', scripts = {}) {
  const commands = expandCompositeCommands(checkCommand, scripts);
  const seenIds = new Map();
  return commands.map((command, index) => {
    const npmScript = command.match(/^npm\s+run\s+([\w:@.-]+)/)?.[1];
    const nodeTarget = command.match(/^node\s+(?:--test\s+)?([^\s]+)/)?.[1];
    const rawId = npmScript
      ? `check-${npmScript.replace(/^check:?/, '')}`
      : nodeTarget
        ? nodeTarget.split(/[\\/]/).pop().replace(/\.(?:c|m)?js$/i, '')
        : `matrix-step-${index + 1}`;
    const baseId = sanitizeArtifactSegment(rawId.replaceAll(':', '-'), `matrix-step-${index + 1}`);
    const occurrence = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, occurrence);
    const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
    const timeoutMs = /(?:^|:)(?:long|browser|electron)(?:$|:)|flight:clean|check:art\b|check:bundle\b|playwright|\b(?:probe|capture|soak|performance)\b/i.test(command)
      ? LONG_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;
    return cmd(id, command, timeoutMs);
  });
}

function expandCompositeCommands(command, scripts, stack = []) {
  return splitCommandChain(command).flatMap((segment) => {
    const npmScript = segment.match(/^npm\s+run\s+([\w:@.-]+)$/)?.[1];
    if (!npmScript || typeof scripts[npmScript] !== 'string' || stack.includes(npmScript)) {
      return [segment];
    }
    const nested = expandCompositeCommands(scripts[npmScript], scripts, [...stack, npmScript]);
    return nested.length > 1 ? nested : [segment];
  });
}

function splitCommandChain(command) {
  return String(command)
    .split(/\s*&&\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildArtifactPath(startedAt, commandId) {
  return `${buildArtifactRoot(startedAt)}/${sanitizeArtifactSegment(commandId, 'command')}.log`;
}

export function createCommandResult({
  def,
  code = 1,
  signal = null,
  timedOut = false,
  durationMs = 0,
  stdout = '',
  stderr = '',
  structured = null,
  attempts = null,
  artifactPath = null,
} = {}) {
  const parsedStructured = structured || extractStructuredResult(`${stdout}\n${stderr}`);
  const normalizedDurationMs = Number.isFinite(durationMs)
    ? Math.max(0, Math.round(durationMs))
    : 0;
  const classification = classifyCommandResult({
    id: def?.id,
    command: def?.command,
    code,
    signal,
    timedOut,
    stdout,
    stderr,
    structured: parsedStructured,
    attempts: attempts || parsedStructured?.attempts || null,
  });
  const ok = classification.category === 'passed';

  return {
    id: def?.id || 'unknown',
    command: def?.command || '',
    ok,
    code,
    signal,
    timedOut,
    durationMs: normalizedDurationMs,
    reason: summarizeReason({ code, signal, timedOut, stdout, stderr, structured: parsedStructured }),
    classification,
    artifactPath,
    structured: summarizeStructured(parsedStructured),
    stdoutTail: trimTail(stdout),
    stderrTail: trimTail(stderr),
  };
}

export function buildCiReport({
  startedAt,
  finishedAt,
  failFast = false,
  artifactRoot = null,
  matrixSource = 'unspecified',
  results = [],
} = {}) {
  const failed = results.filter((result) => !result.ok);
  const classificationCounts = {};
  for (const result of results) {
    const category = result.classification?.category || 'unclassified';
    classificationCounts[category] = (classificationCounts[category] || 0) + 1;
  }

  return {
    schema: 'spaceface.ciReport.v2',
    ok: failed.length === 0,
    startedAt,
    finishedAt,
    failFast,
    executionMode: failFast ? 'fail_fast' : 'complete_matrix',
    matrixSource,
    artifactRoot,
    commandCount: results.length,
    failingCount: failed.length,
    classificationCounts,
    failing: failed.map(({
      id,
      command,
      code,
      signal,
      timedOut,
      durationMs,
      reason,
      artifactPath,
      classification,
    }) => ({
      id,
      command,
      code,
      signal,
      timedOut,
      durationMs,
      reason,
      artifactPath,
      classification,
    })),
    results,
  };
}

export function classifyCommandResult(input = {}) {
  const {
    id = '',
    command = '',
    code = 1,
    signal = null,
    timedOut = false,
    stdout = '',
    stderr = '',
    structured = null,
    attempts = null,
  } = input;
  const flake = classifyFlakeEvidence(attempts);
  const base = classifyBaseFailure({
    id,
    command,
    code,
    signal,
    timedOut,
    stdout,
    stderr,
    structured,
  });

  if (flake.status === 'observed') {
    return {
      category: 'flake',
      underlyingCategory: base.category,
      confidence: 'high',
      evidence: `${flake.failedAttempts} failed and ${flake.passedAttempts} passed attempts`,
      flake,
    };
  }

  return { ...base, flake };
}

function classifyBaseFailure({ id, command, code, signal, timedOut, stdout, stderr, structured }) {
  const text = `${stderr || ''}\n${stdout || ''}`.replace(/\r/g, '').trim();
  const context = `${id || ''} ${command || ''} ${text}`;

  if (timedOut) {
    return diagnostic('timeout', 'high', 'runner timeout elapsed before command completion');
  }
  if (signal) {
    return diagnostic('child_signal', 'high', `child exited by signal ${signal}`, { signal });
  }
  if (isStaleGolden(structured, text)) {
    return diagnostic(
      'stale_golden',
      'high',
      matchingEvidence(text, /stale|golden|baseline|snapshot|re-?record/i)
      || 'candidate runs agree, but the expected envelope contains differences',
    );
  }
  if (code === 0) {
    return diagnostic('passed', 'high', 'command exited with code 0');
  }
  if (/(?:stale|out[- ]of[- ]date)\s+(?:source\s+)?pin\b|\bsource pin\b.*(?:stale|mismatch|does not match)|\b(?:commit|source) pin\b.*(?:stale|mismatch|does not match)/i.test(text)) {
    return diagnostic('stale_source_pin', 'high', matchingEvidence(text, /source pin|commit pin|stale/i));
  }
  if (/(?:ECONNRESET|ERR_CONNECTION_RESET|connection (?:was )?reset)/i.test(text) && /electron/i.test(context)) {
    return diagnostic('electron_connection_reset', 'high', matchingEvidence(text, /ECONNRESET|ERR_CONNECTION_RESET|connection (?:was )?reset/i));
  }
  if (/browserType\.launch|failed to launch (?:the )?browser|browser launch (?:failed|failure)|executable (?:does not|doesn't) exist.*(?:chromium|chrome|firefox|webkit)|could not find (?:chromium|chrome)/i.test(text)) {
    return diagnostic('browser_launch_failure', 'high', matchingEvidence(text, /browserType\.launch|failed to launch|browser launch|executable|could not find/i));
  }
  if (/TimeoutError|Timeout \d+ms exceeded|timed out|timeout exceeded/i.test(text)) {
    return diagnostic('timeout', 'medium', matchingEvidence(text, /TimeoutError|Timeout \d+ms exceeded|timed out|timeout exceeded/i));
  }
  if (/\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b|terminated by signal/i.test(text)) {
    const textSignal = text.match(/\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b/i)?.[0]?.toUpperCase() || null;
    return diagnostic('child_signal', 'medium', matchingEvidence(text, /\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b|terminated by signal/i), { signal: textSignal });
  }
  if (/performance regression|(?:frame|render|gpu|cpu|raf|callback|latency|duration|p\d{2})[^\n]*(?:exceeds?|above|over)[^\n]*(?:budget|threshold)|(?:fps|frames per second)[^\n]*(?:below|under)[^\n]*(?:budget|threshold)/i.test(text)) {
    return diagnostic('performance_regression', 'high', matchingEvidence(text, /performance regression|budget|threshold/i));
  }
  if (/missing (?:required )?evidence|required evidence (?:is )?(?:missing|not found)|evidence (?:file|artifact)[^\n]*(?:missing|not found)|(?:ENOENT|not found)[^\n]*(?:evidence|artifact)/i.test(text)) {
    return diagnostic('missing_evidence', 'high', matchingEvidence(text, /missing|required evidence|not found|ENOENT/i));
  }
  if (/orphan(?:ed)? (?:child )?process|(?:residual|leaked) (?:browser|electron|child|process)|process leak detected|left [^\n]* process running/i.test(text)) {
    return diagnostic('orphan_process', 'high', matchingEvidence(text, /orphan|residual|leaked|process leak|process running/i));
  }
  if (/AssertionError|ERR_ASSERTION/i.test(text)) {
    return diagnostic('assertion_failure', 'high', matchingEvidence(text, /AssertionError|ERR_ASSERTION/i));
  }

  return diagnostic(
    'generic_nonzero',
    'low',
    trimEvidence(firstNonEmptyLine(text) || `exited with code ${code}`),
  );
}

function classifyFlakeEvidence(attempts) {
  const validAttempts = Array.isArray(attempts)
    ? attempts.filter((attempt) => attempt && typeof attempt.ok === 'boolean')
    : [];
  if (validAttempts.length < 2) {
    return {
      status: 'unknown',
      attemptsObserved: validAttempts.length || 1,
      passedAttempts: validAttempts.filter((attempt) => attempt.ok).length,
      failedAttempts: validAttempts.filter((attempt) => !attempt.ok).length,
    };
  }

  const passedAttempts = validAttempts.filter((attempt) => attempt.ok).length;
  const failedAttempts = validAttempts.length - passedAttempts;
  return {
    status: passedAttempts > 0 && failedAttempts > 0 ? 'observed' : 'not_observed',
    attemptsObserved: validAttempts.length,
    passedAttempts,
    failedAttempts,
  };
}

function isStaleGolden(structured, text) {
  if (structured?.schema === 'spaceface.sfSimCompareResult.v1') {
    const comparison = structured.comparison;
    if (
      comparison?.hashEqual === true
      && comparison.firstDivergentTick == null
      && Array.isArray(comparison.diffs)
      && comparison.diffs.length > 0
    ) {
      return true;
    }
  }
  return /(?:stale|out[- ]of[- ]date)\s+(?:golden|baseline|snapshot|expected (?:fixture|envelope|telemetry))|(?:golden|baseline|snapshot)\s+(?:is\s+)?(?:stale|out[- ]of[- ]date)|re-?record[^\n]*(?:golden|baseline|snapshot|expected)/i.test(text);
}

function diagnostic(category, confidence, evidence, extra = {}) {
  return {
    category,
    confidence,
    evidence: trimEvidence(evidence),
    ...extra,
  };
}

function matchingEvidence(text, pattern) {
  const line = String(text || '')
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => pattern.test(candidate));
  return trimEvidence(line || '');
}

function trimEvidence(value) {
  const text = String(value || '').trim();
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function buildArtifactRoot(startedAt) {
  return `scratch/check-ci-report/${sanitizeArtifactSegment(startedAt, 'unknown-run')}`;
}

function sanitizeArtifactSegment(value, fallback) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function cmd(id, command, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return { id, command, timeoutMs };
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try { process.kill(pid, 'SIGKILL'); } catch (_) {}
}

function run(def, { artifactPath }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(def.command, {
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, def.timeoutMs);

    const finishOnce = async (code, signal, finalStderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = createCommandResult({
        def,
        code,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr: finalStderr,
        artifactPath,
      });
      try {
        await writeDiagnosticArtifact(artifactPath, result, stdout, finalStderr);
        result.artifactAvailable = true;
      } catch (error) {
        result.artifactAvailable = false;
        result.artifactError = error instanceof Error ? error.message : String(error);
      }
      resolve(result);
    };

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      void finishOnce(-1, null, `${stderr}\n${error.message}`);
    });
    child.on('close', (code, signal) => {
      void finishOnce(code, signal, stderr);
    });
  });
}

async function writeDiagnosticArtifact(artifactPath, result, stdout, stderr) {
  const absolutePath = resolve(artifactPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const contents = [
    JSON.stringify({
      schema: 'spaceface.ciCommandDiagnostic.v1',
      id: result.id,
      command: result.command,
      ok: result.ok,
      code: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      reason: result.reason,
      classification: result.classification,
      artifactPath: result.artifactPath,
      structured: result.structured,
    }, null, 2),
    '\n--- stdout ---\n',
    stdout || '(empty)',
    '\n--- stderr ---\n',
    stderr || '(empty)',
    '\n',
  ].join('');
  await writeFile(absolutePath, contents, 'utf8');
}

function summarizeReason({ code, signal, timedOut, stdout, stderr, structured }) {
  if (timedOut) return 'timed out';
  const text = `${stderr || ''}\n${stdout || ''}`.replace(/\r/g, '').trim();
  if (isStaleGolden(structured, text)) {
    const comparison = structured.comparison || {};
    const diffs = Array.isArray(comparison.diffs)
      ? comparison.diffs.map((diff) => `${diff.path || diff.kind}: expected ${diff.expected}, actual ${diff.actual}`).join('; ')
      : 'no diff detail';
    return `sf-sim compare found a stale expected envelope; hashEqual=${comparison.hashEqual === true}; ${diffs}`;
  }
  if (code === 0) return 'passed';
  if (structured && structured.schema === 'spaceface.sfSimCompareResult.v1') {
    const comparison = structured.comparison || {};
    const diffs = Array.isArray(comparison.diffs)
      ? comparison.diffs.map((diff) => `${diff.path || diff.kind}: expected ${diff.expected}, actual ${diff.actual}`).join('; ')
      : 'no diff detail';
    return `sf-sim compare failed; hashEqual=${comparison.hashEqual === true}; ${diffs}`;
  }
  const primaryText = String(stderr || stdout || '').replace(/\r/g, '').trim();
  if (/EADDRINUSE/.test(primaryText)) return 'port already in use';
  if (/TimeoutError|Timeout \d+ms exceeded|Timed out/i.test(primaryText)) return firstMatchingLine(primaryText, /TimeoutError|Timeout \d+ms exceeded|Timed out/i);
  if (/AssertionError/i.test(primaryText)) return firstMatchingLine(primaryText, /AssertionError/i);
  if (signal) return `exited by signal ${signal}`;
  return firstNonEmptyLine(primaryText) || `exited with code ${code}`;
}

function summarizeStructured(structured) {
  if (!structured || typeof structured !== 'object') return null;
  if (structured.schema === 'spaceface.sfSimCompareResult.v1') {
    return {
      schema: structured.schema,
      ok: structured.ok === true,
      deterministic: structured.deterministic === true,
      scenario: structured.scenario,
      seed: structured.seed,
      ticks: structured.ticks,
      flightSystem: structured.flightSystem,
      expectedTelemetry: structured.expectedTelemetry,
      baselineHash: structured.baseline && structured.baseline.sha256,
      candidateHash: structured.candidate && structured.candidate.sha256,
      comparison: structured.comparison ? {
        ok: structured.comparison.ok === true,
        mode: structured.comparison.mode,
        reloadAt: structured.comparison.reloadAt,
        hashEqual: structured.comparison.hashEqual === true,
        firstDivergentTick: structured.comparison.firstDivergentTick,
        diffs: structured.comparison.diffs || [],
      } : null,
    };
  }
  return structured;
}

function extractStructuredResult(text) {
  const parsed = extractLastJsonObject(text);
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.schema === 'string') return parsed;
  return null;
}

function extractLastJsonObject(text) {
  const source = String(text || '');
  for (let start = source.lastIndexOf('\n{'); start >= 0; start = source.lastIndexOf('\n{', start - 1)) {
    const objectText = balancedObject(source.slice(start + 1));
    if (!objectText) continue;
    try { return JSON.parse(objectText); } catch (_) {}
  }
  if (source.trimStart().startsWith('{')) {
    const objectText = balancedObject(source.trimStart());
    if (objectText) {
      try { return JSON.parse(objectText); } catch (_) {}
    }
  }
  return null;
}

function balancedObject(text) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return null;
}

function trimTail(text) {
  const value = String(text || '');
  return value.length > TAIL_LIMIT ? value.slice(value.length - TAIL_LIMIT) : value;
}

function firstMatchingLine(text, pattern) {
  return String(text || '').split('\n').map((line) => line.trim()).find((line) => pattern.test(line)) || 'failed';
}

function firstNonEmptyLine(text) {
  return String(text || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
}
