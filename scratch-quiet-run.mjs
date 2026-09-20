import { inspectPerformanceActivity } from './scripts/lib/releaseSoakProbe.mjs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const MAIN_ROOT = fileURLToPath(new URL('.', import.meta.url));
const WT_ROOT = path.join(MAIN_ROOT, '.worktrees', 'pq040-acceptance');
const POLLS = Number(process.env.POLLS || 180);
const POLL_MS = 20_000;

function gitWt(args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: WT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

async function syncWorktreeToMaster() {
  // Certify the freshest committed candidate: fast-forward the detached worktree to
  // master right before launch. Only changed files are rewritten; the junctioned
  // node_modules is untouched. Skips the sync when already at master.
  const head = (await gitWt(['rev-parse', 'HEAD'])).out.trim();
  const master = (await gitWt(['rev-parse', 'master'])).out.trim();
  if (head === master) return true;
  const res = await gitWt(['merge', '--ff-only', 'master']);
  if (res.code !== 0) {
    console.log(`[watcher] worktree ff to master failed: ${res.out.trim().split('\n').pop()}`);
    return false;
  }
  console.log(`[watcher] worktree fast-forwarded ${head.slice(0, 9)} -> ${master.slice(0, 9)}`);
  return true;
}

function runBroker(manifest) {
  return new Promise((resolve) => {
    console.log(`[watcher] ${new Date().toISOString()} quiet - launching ${manifest} in worktree`);
    const child = spawn('node', ['scripts/validation-broker-cli.mjs', '--manifest', manifest], {
      cwd: WT_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => {
      console.log(`[watcher] ${manifest} exited ${code}\n${out.split('\n').slice(-15).join('\n')}`);
      resolve(code);
    });
  });
}

let doneBrowser = false;
let doneElectron = false;
for (let i = 0; i < POLLS; i++) {
  try {
    const a = await inspectPerformanceActivity(WT_ROOT, { settleTransientProcessChurn: false });
    const c = a.contaminatingProcesses || {};
    console.log(`[watcher] ${new Date().toISOString()} active=${a.active} aggFrac=${c.aggregateCpuCoreFraction}`);
    // Once a runtime has passed, pin the pair: do not fast-forward again or the
    // second runtime would certify a different candidate than the first.
    if (a.active === false && (doneBrowser || doneElectron || await syncWorktreeToMaster())) {
      if (!doneBrowser) {
        const code = await runBroker('performance-dirty-ranges-browser');
        if (code === 0) doneBrowser = true;
      }
      if (doneBrowser && !doneElectron) {
        const code2 = await runBroker('performance-dirty-ranges-electron');
        console.log(`[watcher] electron exit ${code2}`);
        if (code2 === 0) { doneElectron = true; process.exit(0); }
      } else if (!doneElectron) {
        const code2 = await runBroker('performance-dirty-ranges-electron');
        console.log(`[watcher] electron exit ${code2}`);
        if (code2 === 0) { doneElectron = true; }
      }
      if (doneBrowser && doneElectron) process.exit(0);
    }
  } catch (e) {
    console.log(`[watcher] ERROR ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log('[watcher] poll budget exhausted');
process.exit(3);
