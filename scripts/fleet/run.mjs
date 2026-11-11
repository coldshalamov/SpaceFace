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
const deadline = t0 + timeoutMin * 60_000;
const MAX_ATTEMPTS = 12;
let attempt = 0;
let tail = '';

// Devin (and the others) hit short provider rate limits. On a retryable failure, wait and resume
// the same conversation (devin --continue) instead of losing the worker's progress.
function launch(resume) {
  attempt += 1;
  let a = cmdArgs;
  if (resume && devin) {
    a = ['-lc', `devin-acct acct${devin[1]} -c -p "Continue the packet exactly where you left off. Finish it, then write the receipt." --model swe-2-max --permission-mode dangerous --respect-workspace-trust false --export "$FLEET_EXPORT"`];
  } else if (resume && backend === 'deepseek') {
    a = ['run', '-m', 'opencode-go/deepseek-v4.1-flash#max', '--auto', '--continue', 'Continue the packet exactly where you left off. Finish it, then write the receipt.'];
  }
  log.write(`
[fleet] attempt ${attempt}${resume ? ' (resume)' : ''} at ${new Date().toISOString()}
`);
  const child = spawn(cmd, a, { cwd: REPO, env, windowsHide: true });
  const onData = (d) => { log.write(d); tail = (tail + d.toString()).slice(-4000); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const timer = setTimeout(() => { log.write(`
[fleet] timeout after ${timeoutMin} min
`); child.kill(); }, Math.max(1000, deadline - Date.now()));
  child.on('close', (code) => {
    clearTimeout(timer);
    const limited = /rate limit|retryable"?\s*:\s*true|429|overloaded|try again/i.test(tail);
    const receiptDone = existsSync(join(runDir, 'RECEIPT.md'));
    if (code !== 0 && limited && !receiptDone && attempt < MAX_ATTEMPTS && Date.now() + 120_000 < deadline) {
      const waitS = Math.min(300, 45 * attempt);
      log.write(`
[fleet] rate limited; resuming in ${waitS}s
`);
      setTimeout(() => launch(true), waitS * 1000);
      return;
    }
    finish(code);
  });
}
console.log(`[fleet] ${packetId} on ${backend} -> ${runDir}`);
launch(false);

function finish(code) {

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
  const exit = { packetId, backend, code, attempts: attempt, minutes: +((Date.now() - t0) / 60000).toFixed(1), receipt: existsSync(receipt) };
  writeFileSync(join(runDir, 'EXIT.json'), JSON.stringify(exit, null, 2));
  log.end();
  console.log(`[fleet] done ${JSON.stringify(exit)}`);
  if (existsSync(receipt)) console.log(readFileSync(receipt, 'utf8').split('\n').slice(0, 6).join('\n'));
}
