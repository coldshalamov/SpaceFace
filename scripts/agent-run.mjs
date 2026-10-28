#!/usr/bin/env node
// Hidden, timed launcher for terminal agents. MSYS `timeout.exe` (or a raw .cmd/.bat) starting a
// native Windows console app makes Windows allocate a NEW visible console per launch — dozens of
// windows titled cursor-agent/codex/claude pop up on the owner's desktop. Spawning the real binary
// with `shell:false, windowsHide:true` never creates one.
//
//   node scripts/agent-run.mjs --log <path> [--timeout <seconds, default 3600>] [--stdin <file>] -- <command> [args...]
//
// Resolution: known shims are mapped to their real binary — cursor-agent to the newest
// %LOCALAPPDATA%\cursor-agent\versions\*\node.exe index.js (same as the lane's audit-runner);
// codex/opencode/claude .cmd shims are parsed for the JS or .exe they point at; a plain .exe or a
// PATH-resolvable .exe is spawned directly; any other .cmd/.bat falls back to cmd.exe /d /s /c
// under windowsHide. Log is truncated/created; --stdin pipes that file into the child's stdin.
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, readdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';

const IS_WIN = process.platform === 'win32';
const argv = process.argv.slice(2);
let logPath = null, timeoutS = 3600, stdinFile = null, dash = -1;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--') { dash = i; break; }
  if (argv[i] === '--log') { logPath = argv[++i]; continue; }
  if (argv[i] === '--timeout') { timeoutS = Number(argv[++i]) || 3600; continue; }
  if (argv[i] === '--stdin') { stdinFile = argv[++i]; continue; }
}
if (dash < 0 || !logPath) {
  console.error('usage: node scripts/agent-run.mjs --log <path> [--timeout <s>] [--stdin <file>] -- <command> [args...]');
  process.exit(2);
}
const rawCmd = argv[dash + 1], cmdArgs = argv.slice(dash + 2);
if (!rawCmd) { console.error('agent-run: no command after --'); process.exit(2); }

const NPM_BIN = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm');
const CURSOR_HOME = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'cursor-agent');

// Parse a standard npm .cmd shim: its payload is one JS entry (or an .exe) under "%~dp0\node_modules".
function parseNpmShim(cmdPath) {
  try {
    const text = readFileSync(cmdPath, 'utf8');
    const exe = text.match(/"%~dp0\\([^"]*?\.exe)"/i) || text.match(/%dp0%\\([^\s"']+?\.exe)/i);
    if (exe) return { type: 'exe', exe: join(dirname(cmdPath), exe[1].replace(/\\/g, '\\')) };
    const js = text.match(/"%~dp0\\([^"]*?\.js)"/i) || text.match(/%dp0%\\([^\s"']+?\.js)/i);
    if (js) {
      const entry = join(dirname(cmdPath), js[1]);
      if (existsSync(entry)) return { type: 'js', exe: process.execPath, args: [entry] };
    }
    return null;
  } catch { return null; }
}

function cursorAgent() {
  const verDir = join(CURSOR_HOME, 'versions');
  if (!existsSync(verDir)) return null;
  const candidates = readdirSync(verDir)
    .filter((n) => /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+$/.test(n))
    .sort().reverse();
  // Exact version dirs first; `.previous` backups of the same install are the fallback.
  const loose = readdirSync(verDir)
    .filter((n) => /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+/.test(n)
      && !candidates.includes(n))
    .sort().reverse();
  for (const name of [...candidates, ...loose]) {
    const node = join(verDir, name, 'node.exe');
    const index = join(verDir, name, 'index.js');
    if (existsSync(node) && existsSync(index)) return { exe: node, args: [index] };
  }
  return null;
}

function which(name) {
  const out = spawnSync(IS_WIN ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true });
  if (out.status !== 0) return null;
  return out.stdout.trim().split(/\r?\n/)[0];
}

function resolveCommand(cmd, args) {
  const base = basename(cmd).toLowerCase();
  const stripped = base.replace(/\.(cmd|bat|exe)$/, '');
  if (IS_WIN && (stripped === 'cursor-agent')) {
    const resolved = cursorAgent();
    if (resolved) return { exe: resolved.exe, args: [...resolved.args, ...args] };
  }
  if (IS_WIN && base.endsWith('.exe')) {
    const exe = isAbsolute(cmd) ? cmd : (existsSync(cmd) ? cmd : which(base));
    if (exe) return { exe, args };
  }
  // .cmd/.bat or bare name with an npm shim on PATH.
  const shim = base.endsWith('.cmd') || base.endsWith('.bat')
    ? (existsSync(cmd) ? cmd : join(NPM_BIN, base))
    : join(NPM_BIN, `${stripped}.cmd`);
  if (existsSync(shim) && /\.(cmd|bat)$/i.test(shim)) {
    const parsed = parseNpmShim(shim);
    if (parsed) {
      if (parsed.type === 'exe') return { exe: parsed.exe, args };
      return { exe: parsed.exe, args: [...parsed.args, ...args] };
    }
    return { exe: 'cmd.exe', args: ['/d', '/s', '/c', shim, ...args] };
  }
  // Bare name — try .exe on PATH, else pass through with shell so PATH resolution still works.
  const onPath = which(cmd);
  if (onPath) return { exe: onPath, args };
  return { exe: cmd, args, shell: true };
}

const { exe, args, shell = false } = resolveCommand(rawCmd, cmdArgs);
const logFd = openSync(logPath, 'w');
const stdinFd = stdinFile ? openSync(stdinFile, 'r') : 'ignore';
const child = spawn(exe, args, {
  windowsHide: true,
  shell,
  stdio: [stdinFd, logFd, logFd],
  cwd: process.cwd(),
});
const note = (line) => { console.log(line); try { appendFileSync(logPath, line + '\n'); } catch { } };
note(`[agent-run] pid=${child.pid} cmd=${exe} log=${logPath}`);

let timedOut = false;
const killTree = () => {
  if (IS_WIN) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else try { child.kill('SIGKILL'); } catch { }
};
const timer = timeoutS > 0 && setTimeout(() => {
  timedOut = true;
  killTree();
}, timeoutS * 1000);
const onSignal = (sig) => () => { killTree(); process.exitCode = 124; };
process.on('SIGINT', onSignal('SIGINT'));
process.on('SIGTERM', onSignal('SIGTERM'));

child.on('exit', (code) => {
  if (timer) clearTimeout(timer);
  closeSync(logFd);
  if (typeof stdinFd === 'number') closeSync(stdinFd);
  if (timedOut) {
    note(`[agent-run] timed out after ${timeoutS}s`);
    process.exitCode = 124;
  } else {
    note(`[agent-run] exit code=${code ?? 1}`);
    process.exitCode = code == null ? 1 : code;
  }
});
child.on('error', (err) => {
  if (timer) clearTimeout(timer);
  closeSync(logFd);
  note(`[agent-run] spawn error: ${err.message}`);
  process.exitCode = 1;
});
