#!/usr/bin/env node
// check:agent-code-packet-selection — print selected tracked-source bytes for the
// agent-code-packet artifact and fail when they exceed the 256 MiB ceiling.
//
// Uses scripts/lib/agent_code_packet_selection.py (same policy as the workflow).
// Does not raise the ceiling; tighten DENIED_* in that module instead.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = path.join(root, 'scripts/lib/agent_code_packet_selection.py');
const ref = process.argv[2] || 'HEAD';

const ls = spawnSync('git', ['ls-tree', '-r', '-l', ref], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (ls.status !== 0) {
  console.error(ls.stderr || ls.stdout || 'git ls-tree failed');
  process.exit(ls.status || 1);
}

const check = spawnSync('python3', [py, '--git-ls-tree'], {
  cwd: root,
  input: ls.stdout,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (check.stdout) process.stdout.write(check.stdout);
if (check.stderr) process.stderr.write(check.stderr);
process.exit(check.status == null ? 1 : check.status);
