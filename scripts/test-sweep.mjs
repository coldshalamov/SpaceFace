#!/usr/bin/env node
// Run every unit test file, one `node --test` per file, and print the red list with each file's first
// failing assertion. Read-only. Test files that can boot a browser, Electron or the game are left out
// (those need the game lock); a file slower than the timeout is reported as a timeout, not guessed at.
//
//   node scripts/test-sweep.mjs                        every unit test file, 8 at a time
//   node scripts/test-sweep.mjs --conc=12 --timeout=90
//   node scripts/test-sweep.mjs --head                 the same files, but every tracked file that is
//                                                      modified in the working tree runs with its
//                                                      committed content: "is this red on master?"
//   node scripts/test-sweep.mjs --red-from=<results>   only the files that were red or timed out before
//   node scripts/test-sweep.mjs --resume=<results>     continue an interrupted run
//   node scripts/test-sweep.mjs --only=<substring>     a quick trial on a few files
//
// Results go to .devshots/test-sweep/<stamp>-results.json (rewritten every 250 files, so a killed run
// loses nothing that finished) and the red list to <stamp>-red.txt. Numbers taken while other agents
// are using the machine are not comparable: run it on a quiet machine.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../', import.meta.url)));
const OUTDIR = join(REPO, '.devshots', 'test-sweep');
const HOOK = join(REPO, 'scripts', 'lib', 'headModeHook.mjs');
const BROWSER = /playwright|puppeteer|load-playwright|quietLaunch|chromium|game-lock|launch-electron|webdriver|selenium/;

const options = { conc: 8, timeout: 120, head: false, 'red-from': '', resume: '', only: '' };
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!match || !(match[1] in options)) {
    console.error(`usage: node scripts/test-sweep.mjs [--conc=N] [--timeout=S] [--head] [--red-from=<results.json>] [--resume=<results.json>] [--only=<substring>]\nunknown argument: ${arg}`);
    process.exit(2);
  }
  const value = match[2] === undefined ? true : match[2];
  options[match[1]] = typeof options[match[1]] === 'number' ? Number(value) : value;
}
const PER_FILE_MS = options.timeout * 1000;

function previous(file) {
  if (!file) return [];
  return JSON.parse(readFileSync(resolve(file), 'utf8')).results || [];
}

// The committed text of each modified tracked file, written once to a folder outside the repo.
function buildHeadMirror() {
  const mirror = join(tmpdir(), 'spaceface-head-mirror');
  rmSync(mirror, { recursive: true, force: true });
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--no-renames', '-z'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
  let count = 0;
  for (const entry of status.split('\0')) {
    if (!entry) continue;
    const rel = entry.slice(3);
    let text;
    try {
      text = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { continue; }
    mkdirSync(dirname(join(mirror, rel)), { recursive: true });
    writeFileSync(join(mirror, rel), text);
    count += 1;
  }
  return { mirror, count };
}

const all = readdirSync(join(REPO, 'test')).filter((f) => f.endsWith('.test.mjs')).sort();
const skipped = { browser: [] };
let wanted = [];
for (const f of all) {
  if (options.only && !f.includes(options.only)) continue;
  if (BROWSER.test(readFileSync(join(REPO, 'test', f), 'utf8'))) { skipped.browser.push(f); continue; }
  wanted.push(f);
}
const earlier = previous(options['red-from']);
if (options['red-from']) {
  const red = new Set(earlier.filter((r) => r.timedOut || r.code !== 0).map((r) => r.file));
  wanted = wanted.filter((f) => red.has(f));
}
const results = options.resume ? previous(options.resume) : [];
const done = new Set(results.map((r) => r.file));
const pending = wanted.filter((f) => !done.has(f));

const childEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
if (options.head) {
  const { mirror, count } = buildHeadMirror();
  childEnv.NODE_OPTIONS = `${childEnv.NODE_OPTIONS || ''} --import=${pathToFileURL(HOOK).href}`.trim();
  childEnv.SPACEFACE_HEAD_REPO = REPO;
  childEnv.SPACEFACE_HEAD_MIRROR = mirror;
  console.log(`head mode: committed content for ${count} modified files`);
}

mkdirSync(OUTDIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const resultsFile = options.resume ? resolve(options.resume) : join(OUTDIR, `${stamp}-results.json`);
const redFile = resultsFile.replace(/\.json$/, '').replace(/-results$/, '') + '-red.txt';
const flush = () => writeFileSync(resultsFile, JSON.stringify({ mode: options.head ? 'head' : 'working-tree', results }, null, 0));

console.log(`test files: ${all.length}  skipped (can boot a browser): ${skipped.browser.length}  to run: ${pending.length}  already done: ${results.length}  at a time: ${options.conc}`);

let next = 0;
const started = Date.now();

function runOne(file) {
  return new Promise((resolveRun) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ['--test', `test/${file}`], { cwd: REPO, windowsHide: true, shell: false, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const keep = (chunk) => { if (out.length < 600000) out += chunk; };
    child.stdout.on('data', (d) => keep(d.toString()));
    child.stderr.on('data', (d) => keep(d.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGKILL');
    }, PER_FILE_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      results.push({ file, ms: Date.now() - t0, code: -1, timedOut: false, tests: null, pass: null, fail: null, failLines: [], err: String(error) });
      resolveRun();
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/);
      const count = (label) => { const m = out.match(new RegExp(`(?:\u2139|#)\\s*${label}\\s+(\\d+)`)); return m ? Number(m[1]) : null; };
      const failLines = lines.filter((l) => /^\s*(\u2716|not ok)\s/.test(l) && !/failing tests:/.test(l))
        .slice(0, 6).map((l) => l.trim().replace(/^(\u2716|not ok)\s+/, '').slice(0, 220));
      const errLine = lines.find((l) => /^\s*(AssertionError|ReferenceError|TypeError|SyntaxError|RangeError|Error)\b/.test(l));
      results.push({ file, ms: Date.now() - t0, code, signal: signal || null, timedOut, tests: count('tests'), pass: count('pass'), fail: count('fail'), failLines, err: errLine ? errLine.trim().slice(0, 260) : null });
      if (results.length % 250 === 0) {
        flush();
        console.log(`  ${results.length} done, ${Math.round((Date.now() - started) / 60000)} min`);
      }
      resolveRun();
    });
  });
}

async function worker() {
  while (next < pending.length) { const f = pending[next++]; await runOne(f); }
}
await Promise.all(Array.from({ length: Math.max(1, options.conc) }, worker));
flush();

const bad = results.filter((r) => r.timedOut || r.code !== 0);
const summary = {
  mode: options.head ? 'head (committed content for modified files)' : 'working tree',
  testFiles: all.length, skippedBrowser: skipped.browser.length,
  ran: results.length, green: results.length - bad.length,
  red: bad.filter((r) => !r.timedOut).length, timeouts: bad.filter((r) => r.timedOut).length,
  failingSubtests: results.reduce((sum, r) => sum + (r.fail || 0), 0),
  minutes: Math.round((Date.now() - started) / 60000),
};
console.log(JSON.stringify(summary));
const redLines = [`# ${summary.mode} — ${summary.red} red, ${summary.timeouts} timed out, of ${summary.ran} run (${summary.green} green). ${summary.failingSubtests} failing sub-tests.`];
for (const r of bad) {
  const label = r.timedOut ? 'TIMEOUT' : 'RED';
  const line = `${label}\t${r.file}\t${Math.round(r.ms / 1000)}s\tsubtests failed=${r.fail}`;
  console.log(`${label} ${r.file}  (${Math.round(r.ms / 1000)}s, subtests failed=${r.fail})`);
  redLines.push(line + (r.failLines[0] ? `\t${r.failLines[0]}` : ''));
  for (const l of r.failLines.slice(0, 2)) console.log(`      ${l}`);
}
writeFileSync(redFile, redLines.join('\n') + '\n');
console.log(`results: ${resultsFile}\nred list: ${redFile}`);
