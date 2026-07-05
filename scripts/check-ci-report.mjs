#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 180000;
const LONG_TIMEOUT_MS = 420000;
const TAIL_LIMIT = 1600;

const failFast = process.argv.includes('--fail-fast');
const commands = [
  cmd('ui-screen-imports', 'node scripts/check-ui-screen-imports.mjs'),
  cmd('47a-compare', 'npm run check:sim:compare'),
  cmd('47a-live-cold-open', 'npm run check:47a:live-cold-open', LONG_TIMEOUT_MS),
  cmd('first-15-runtime', 'npm run check:first-15-runtime', LONG_TIMEOUT_MS),
  cmd('market-first-loop', 'npm run check:market-first-loop', LONG_TIMEOUT_MS),
  cmd('claim-base', 'npm run check:claim-base'),
  cmd('flight-clean', 'npm run check:flight:clean', LONG_TIMEOUT_MS),
  cmd('save-schema', 'npm run check:save-schema'),
];

const startedAt = new Date().toISOString();
const results = [];

for (const command of commands) {
  const result = await run(command);
  results.push(result);
  if (!result.ok && failFast) break;
}

const failed = results.filter((result) => !result.ok);
const report = {
  schema: 'spaceface.ciReport.v1',
  ok: failed.length === 0,
  startedAt,
  finishedAt: new Date().toISOString(),
  failFast,
  commandCount: results.length,
  failingCount: failed.length,
  failing: failed.map(({ id, command, code, signal, timedOut, reason }) => ({
    id,
    command,
    code,
    signal,
    timedOut,
    reason,
  })),
  results,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);

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

function run(def) {
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
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, def.timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(finish(def, started, stdout, stderr + '\n' + error.message, -1, null, timedOut));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(finish(def, started, stdout, stderr, code, signal, timedOut));
    });
  });
}

function finish(def, started, stdout, stderr, code, signal, timedOut) {
  const structured = extractStructuredResult(stdout + '\n' + stderr);
  return {
    id: def.id,
    command: def.command,
    ok: code === 0 && !timedOut,
    code,
    signal,
    timedOut,
    durationMs: Date.now() - started,
    reason: summarizeReason({ code, signal, timedOut, stdout, stderr, structured }),
    structured: summarizeStructured(structured),
    stdoutTail: trimTail(stdout),
    stderrTail: trimTail(stderr),
  };
}

function summarizeReason({ code, signal, timedOut, stdout, stderr, structured }) {
  if (timedOut) return 'timed out';
  if (code === 0) return 'passed';
  if (structured && structured.schema === 'spaceface.sfSimCompareResult.v1') {
    const comparison = structured.comparison || {};
    const diffs = Array.isArray(comparison.diffs)
      ? comparison.diffs.map((diff) => `${diff.path || diff.kind}: expected ${diff.expected}, actual ${diff.actual}`).join('; ')
      : 'no diff detail';
    return `sf-sim compare failed; hashEqual=${comparison.hashEqual === true}; ${diffs}`;
  }
  const text = String(stderr || stdout || '').replace(/\r/g, '').trim();
  if (/EADDRINUSE/.test(text)) return 'port already in use';
  if (/TimeoutError|Timeout \d+ms exceeded|Timed out/i.test(text)) return firstMatchingLine(text, /TimeoutError|Timeout \d+ms exceeded|Timed out/i);
  if (/AssertionError/i.test(text)) return firstMatchingLine(text, /AssertionError/i);
  if (signal) return `exited by signal ${signal}`;
  return firstNonEmptyLine(text) || `exited with code ${code}`;
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
