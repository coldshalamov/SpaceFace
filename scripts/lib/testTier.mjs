// Shared implementation for scripts/test-tier.mjs.
//
// A tier file is a plain line list: `#` comments, blank lines, test paths, npm commands and
// node commands. The runner validates every entry before running anything so a moved test or
// a renamed npm script fails as drift instead of silently shrinking coverage.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TIER_NAMES = Object.freeze(['fast', 'route', 'reference']);
export const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE = 4 * 1024 * 1024;

export function parseTierText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const quoted = /^(['"])(.*)\1$/.exec(line);
      return quoted ? quoted[2] : line;
    });
}

export function readTierFile(root, tier) {
  const file = resolve(root, 'test/tiers', `${tier}.txt`);
  if (!existsSync(file)) throw new Error(`missing tier file: ${file}`);
  return { file, entries: parseTierText(readFileSync(file, 'utf8')) };
}

export function packageScripts(root) {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return pkg.scripts || {};
}

function splitCommand(line) {
  return line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
}

function isTestPath(value) {
  return /\.(?:test|spec)\.[cm]?js$/i.test(value) && !/\s/.test(value);
}

function isBarePath(value) {
  return !/^[a-z]+:\/\//i.test(value) && !/\s/.test(value) && /[/\\.]/.test(value);
}

/**
 * Turn one manifest line into an executable entry. Throws when the line has no valid shape;
 * callers collect the error as tier drift.
 */
export function classifyEntry(line, { root = process.cwd(), scripts = packageScripts(root) } = {}) {
  if (line.startsWith('npm run ')) {
    const name = line.slice('npm run '.length).trim().split(/\s+/)[0];
    if (!name || !scripts[name]) throw new Error(`unknown npm script in tier: ${name}`);
    return { line, kind: 'npm', command: line, script: name };
  }
  if (line.startsWith('npm ')) {
    return { line, kind: 'npm', command: line, script: null };
  }
  if (line.startsWith('node ')) {
    const tokens = splitCommand(line);
    if (tokens[1] === '--test' || tokens[1].startsWith('--test')) {
      const testPaths = tokens.slice(2).filter((token) => !token.startsWith('--') && !token.includes('='));
      if (!testPaths.length) throw new Error(`node --test entry names no test file: ${line}`);
      for (const testPath of testPaths) {
        if (!existsSync(resolve(root, testPath))) throw new Error(`missing test file in tier: ${testPath}`);
      }
      return { line, kind: 'node-test', command: line };
    }
    const script = tokens[1];
    if (script && !script.startsWith('-') && !existsSync(resolve(root, script))) {
      throw new Error(`missing node script in tier: ${script}`);
    }
    return { line, kind: 'node', command: line };
  }
  if (isTestPath(line)) {
    if (!existsSync(resolve(root, line))) throw new Error(`missing test file in tier: ${line}`);
    return { line, kind: 'test', command: `node --test ${line}`, path: line };
  }
  if (isBarePath(line)) {
    if (!existsSync(resolve(root, line))) throw new Error(`missing file in tier: ${line}`);
    return { line, kind: 'node', command: `node ${line}`, path: line };
  }
  throw new Error(`unrecognised tier entry: ${line}`);
}

export function shardEntries(entries, index, count) {
  const n = Number(count);
  const i = Number(index);
  if (!Number.isInteger(n) || n < 1) throw new Error('--shard count must be a positive integer');
  if (!Number.isInteger(i) || i < 1 || i > n) throw new Error('--shard index must be 1..N');
  if (n === 1) return entries.slice();
  return entries.filter((_, position) => position % n === i - 1);
}

function parseShard(value) {
  if (value == null) return null;
  const match = /^(\d+)\/(\d+)$/.exec(String(value));
  if (!match) throw new Error('--shard must look like i/N (1-based)');
  return { index: Number(match[1]), count: Number(match[2]) };
}

export function parseRunnerArgs(argv) {
  const options = { tier: null, shard: null, json: false, timeoutMs: DEFAULT_TIMEOUT_MS, list: false, failFast: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--fail-fast') options.failFast = true;
    else if (arg === '--shard') options.shard = parseShard(argv[++i]);
    else if (arg.startsWith('--shard=')) options.shard = parseShard(arg.slice('--shard='.length));
    else if (arg === '--timeout') options.timeoutMs = readTimeout(argv[++i]);
    else if (arg.startsWith('--timeout=')) options.timeoutMs = readTimeout(arg.slice('--timeout='.length));
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else if (!options.tier) options.tier = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!options.tier) throw new Error('usage: node scripts/test-tier.mjs <fast|route|reference|all> [--shard=i/N] [--json] [--timeout=seconds]');
  if (options.tier !== 'all' && !TIER_NAMES.includes(options.tier)) {
    throw new Error(`unknown tier: ${options.tier} (expected fast, route, reference or all)`);
  }
  return options;
}

function readTimeout(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--timeout must be a positive number of seconds');
  return Math.round(seconds * 1000);
}

function runChild(command, { cwd, timeoutMs, shell }) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = shell
      ? spawn(command, { cwd, shell: true, windowsHide: true, env: process.env })
      : spawn(process.execPath, command.slice(1), { cwd, windowsHide: true, env: process.env });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const append = (current, chunk) => (current.length >= MAX_CAPTURE ? current : current + chunk.toString());
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ code, signal, timedOut, durationMs: Date.now() - started, stdout, stderr });
    };
    child.on('error', (error) => {
      stderr = append(stderr, String(error && error.stack || error));
      finish(null, null);
    });
    child.on('close', finish);
  });
}

export async function runEntries(entries, {
  root = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, json = false, failFast = false,
  log = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const results = [];
  for (const entry of entries) {
    const command = entry.command;
    const display = command;
    if (!json) log(`\n$ ${display}`);
    else log(`run ${display}`);
    const run = await runChild(command, { cwd: root, timeoutMs, shell: true });
    const ok = !run.timedOut && run.code === 0;
    results.push({ ...entry, ...run, ok });
    if (!json) {
      log(`${ok ? 'PASS' : 'FAIL'}  ${(run.durationMs / 1000).toFixed(1)}s  ${display}`);
      if (!ok) printFailureTail(log, run);
    }
    if (!ok && failFast) break;
  }
  return results;
}

function printFailureTail(log, run) {
  const text = `${run.stdout || ''}\n${run.stderr || ''}`.trim();
  if (!text) return;
  const lines = text.split(/\r?\n/);
  const tail = lines.slice(-40);
  log('  --- failure tail ---');
  for (const line of tail) log(`  ${line}`);
  log('  --- end failure tail ---');
}

export function summarize(results) {
  const failures = results.filter((result) => !result.ok);
  return {
    schema: 'spaceface.testTierResult.v1',
    ok: failures.length === 0,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    durationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    failures: failures.map((result) => ({
      line: result.line, command: result.command, timedOut: result.timedOut,
      code: result.code, signal: result.signal, durationMs: result.durationMs,
    })),
  };
}

export function formatSummary(summary, { tier = null, shard = null } = {}) {
  const scope = [tier, shard ? `shard ${shard.index}/${shard.count}` : null].filter(Boolean).join(' ');
  const lines = [
    '',
    `test tier${scope ? ` (${scope})` : ''}`,
    `  ${summary.passed}/${summary.total} passed in ${(summary.durationMs / 1000).toFixed(1)}s`,
  ];
  if (summary.failed) {
    lines.push(`  ${summary.failed} failed:`);
    for (const failure of summary.failures) {
      lines.push(`    - ${failure.command}${failure.timedOut ? ' (timeout)' : ` (exit ${failure.code})`}`);
    }
  }
  return lines.join('\n');
}
