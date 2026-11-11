#!/usr/bin/env node
// Fleet runner: hand one packet to one outside agent, headless, and keep its log.
//
//   node scripts/fleet/run.mjs <PACKET-ID> <backend> [--timeout-min=90]
//   node scripts/fleet/run.mjs --list            (packets and their queue status)
//
// Backends:
//   devin1 | devin2 | devin3   Devin CLI, SWE-2 Max, one Windows profile each (acct1..acct3)
//   deepseek                   OpenCode 2.x, opencode-go/deepseek-v4.1-flash#max
//   flash                      Antigravity (agy), gemini-3.8-flash-high
//
// Each run writes .devshots/fleet/runs/<PACKET-ID>.<backend>.<stamp>/ (git-ignored):
//   PROMPT.txt  run.log  RECEIPT.md (written by the worker)  EXIT.json  CHANGED.txt
// Launch it in the background; it exits when the worker exits.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, createWriteStream, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKETS = join(REPO, 'design', 'program', 'fleet', 'packets');
const RUNS = join(REPO, '.devshots', 'fleet', 'runs');
const HOME = process.env.USERPROFILE || 'C:\\Users\\93rob';
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const OPENCODE = join(HOME, 'AppData', 'Roaming', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
const AGY = join(HOME, 'AppData', 'Local', 'agy', 'bin', 'agy.exe');

const args = process.argv.slice(2);
if (args[0] === '--list') {
  for (const f of readdirSync(PACKETS).filter((n) => n.endsWith('.md')).sort()) console.log(f.replace(/\.md$/, ''));
  process.exit(0);
}
const [packetId, backend] = args;
const timeoutMin = Number((args.find((a) => a.startsWith('--timeout-min=')) || '=90').split('=')[1]);
if (!packetId || !backend) {
  console.error('usage: node scripts/fleet/run.mjs <PACKET-ID> <devin1|devin2|devin3|deepseek|flash> [--timeout-min=90]');
  process.exit(2);
}
const packetPath = join(PACKETS, `${packetId}.md`);
if (!existsSync(packetPath)) { console.error(`no packet ${packetPath}`); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = join(RUNS, `${packetId}.${backend}.${stamp}`);
mkdirSync(runDir, { recursive: true });
const receiptRel = `.devshots/fleet/runs/${packetId}.${backend}.${stamp}/RECEIPT.md`;

const prompt = [
  `You are a worker on the SpaceFace game repository (current folder).`,
  `Step 1: read design/program/fleet/PROTOCOL.md in full and obey it.`,
  `Step 2: read design/program/fleet/packets/${packetId}.md in full. It is your whole job: do all of it.`,
  `Step 3: write your receipt to ${receiptRel} using the protocol's headings.`,
  `Work until the packet is finished or genuinely blocked. Do not ask questions; nobody will answer.`,
].join('\n');
writeFileSync(join(runDir, 'PROMPT.txt'), prompt);

function gitStatus() {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }); } catch { return ''; }
}
function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const before = gitStatus();
const headBefore = gitHead();

let cmd; let cmdArgs; const env = { ...process.env, FLEET_PROMPT: prompt };
const devin = /^devin([1-4])$/.exec(backend);
if (devin) {
  cmd = BASH;
  cmdArgs = ['-lc', `devin-acct acct${devin[1]} -p "$FLEET_PROMPT" --model swe-2-max --permission-mode dangerous --respect-workspace-trust false --export "$FLEET_EXPORT"`];
  env.FLEET_EXPORT = join(runDir, 'transcript.md');
} else if (backend === 'deepseek') {
  cmd = OPENCODE;
  cmdArgs = ['run', '-m', 'opencode-go/deepseek-v4.1-flash#max', '--auto', prompt];
} else if (backend === 'flash') {
  cmd = AGY;
  cmdArgs = ['--print', prompt, '--model', 'gemini-3.8-flash-high', '--dangerously-skip-permissions', '--output-format', 'text'];
} else {
  console.error(`unknown backend ${backend}`); process.exit(2);
}

const log = createWriteStream(join(runDir, 'run.log'));
const t0 = Date.now();
const child = spawn(cmd, cmdArgs, { cwd: REPO, env, windowsHide: true });
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
const timer = setTimeout(() => { log.write(`\n[fleet] timeout after ${timeoutMin} min\n`); child.kill(); }, timeoutMin * 60_000);
console.log(`[fleet] ${packetId} on ${backend} -> ${runDir}`);

child.on('close', (code) => {
  clearTimeout(timer);
  const after = gitStatus();
  const headAfter = gitHead();
  let commits = '';
  try {
    commits = headBefore && headAfter !== headBefore
      ? execFileSync('git', ['log', '--format=%h %s', `${headBefore}..${headAfter}`], { cwd: REPO, encoding: 'utf8' })
      : '';
  } catch { /* ignore */ }
  const beforeSet = new Set(before.split('\n'));
  const newDirt = after.split('\n').filter((l) => l && !beforeSet.has(l)).join('\n');
  writeFileSync(join(runDir, 'CHANGED.txt'),
    `commits since start (anyone's):\n${commits}\nnew working-tree changes (anyone's):\n${newDirt}\n`);
  const receipt = join(runDir, 'RECEIPT.md');
  const exit = { packetId, backend, code, minutes: +((Date.now() - t0) / 60000).toFixed(1), receipt: existsSync(receipt) };
  writeFileSync(join(runDir, 'EXIT.json'), JSON.stringify(exit, null, 2));
  log.end();
  console.log(`[fleet] done ${JSON.stringify(exit)}`);
  if (existsSync(receipt)) console.log(readFileSync(receipt, 'utf8').split('\n').slice(0, 6).join('\n'));
});
