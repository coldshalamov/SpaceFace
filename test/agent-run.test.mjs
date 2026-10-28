import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AGENT_RUN = new URL('../scripts/agent-run.mjs', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');
const dir = mkdtempSync(join(tmpdir(), 'agent-run-'));

function run(args, opts = {}) {
  return spawnSync(process.execPath, [AGENT_RUN, ...args], {
    encoding: 'utf8', timeout: 30000, windowsHide: true, ...opts,
  });
}

test('missing usage args exits 2 with usage on stderr', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node scripts\/agent-run\.mjs/);
});

test('timeout kills the child tree, logs the line, exits 124', () => {
  const log = join(dir, 't1.log');
  const r = run(['--log', log, '--timeout', '2', '--',
    process.execPath, '-e', 'setTimeout(()=>{},60000)']);
  assert.equal(r.status, 124);
  const text = readFileSync(log, 'utf8');
  assert.match(text, /\[agent-run] pid=\d+/);
  assert.match(text, /\[agent-run] timed out after 2s/);
});

test('a successful child forwards its exit code and output to the log', () => {
  const log = join(dir, 't2.log');
  const r = run(['--log', log, '--',
    process.execPath, '-e', 'console.log("inner-out"); process.exit(7)']);
  assert.equal(r.status, 7);
  const text = readFileSync(log, 'utf8');
  assert.match(text, /inner-out/);
  assert.match(text, /\[agent-run] exit code=7/);
});

test('--stdin pipes the file into the child', () => {
  const src = join(dir, 'src.txt');
  writeFileSync(src, 'pipe-marker-42');
  const log = join(dir, 't3.log');
  const r = run(['--log', log, '--stdin', src, '--',
    process.execPath, '-e', 'process.stdin.pipe(process.stdout)']);
  assert.equal(r.status, 0);
  assert.match(readFileSync(log, 'utf8'), /pipe-marker-42/);
});
