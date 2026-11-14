#!/usr/bin/env node
// Fleet stability gate — one command that says "the game still works".
//
//   npm run gate               all four steps, stopping at the first failure
//   npm run gate -- --quick    steps 1–2 only (import lint + Adventure boot)
//   npm run gate -- --budget-scale=N   multiply every readiness wait (and the gate wall budget)
//                                      by N — reads "slow" instead of "broken" on a loaded box
//
//   1. import-lint     npm run check:src-imports  every relative src/ specifier is canonical
//                                               and resolves verbatim — the `.//` boot brick
//   2. boot-adventure  npm run check:playable     real-route boot: menu, launch, hull, ship
//                                               mesh, world, controls, no exception/shader error
//   3. boot-swarm      npm run player-truth -- --mode=swarm --rounds=1 --duration=10   headless Swarm boot: 10 sim-s of live play (a whole round is too slow under software GL)
//   4. sim-47a         npm run check:sim          deterministic 47-A replay
//
// Prints one line per step (PASS boot-adventure 74s / FAIL boot-swarm: <first error line>),
// then GATE PASS or GATE FAIL, writes the same to .devshots/fleet/gate-last.txt, and exits
// 0/1. Each step's full output lands in .devshots/fleet/gate-<step>.log. Total budget 20 min.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(REPO, '.devshots', 'fleet');
const BUDGET_MS = 20 * 60 * 1000;

// --budget-scale=N multiplies every readiness wait in the step children (through
// SF_CHECK_BUDGET_SCALE, the same knob check-game-playable.mjs and player-truth/routes.mjs read)
// and this gate's own wall budget, so a loaded machine reads "slow", not "broken". The scale is
// printed on the first line and lands in gate-last.txt so a scaled pass is never mistaken for a
// quiet-machine pass.
const argv = process.argv.slice(2);
const scaleArg = argv.find((a) => a.startsWith('--budget-scale='));
const BUDGET_SCALE = Math.max(1, Number(scaleArg ? scaleArg.split('=')[1] : process.env.SF_CHECK_BUDGET_SCALE) || 1);
const GATE_BUDGET_MS = BUDGET_MS * BUDGET_SCALE;

const SWARM_BOOT_CRITICAL = ['route', 'player_ship', 'player_control', 'spawn_motion', 'crucible_realm', 'sim_stalled', 'play_interrupted'];
const PLAYER_TRUTH_VERDICTS = ['PASS', 'FAIL', 'INCOMPLETE'];

function judgeSwarmBoot(result, outDir) {
  const overall = PLAYER_TRUTH_VERDICTS[result.code];
  if (!overall) {
    const detail = result.out?.trim() ? ` (${firstErrorLine(result.out)})` : '';
    return `player-truth exited ${result.code}${detail}`;
  }

  let verdict;
  try {
    verdict = JSON.parse(readFileSync(join(outDir, 'verdict.json'), 'utf8'));
  } catch (e) { return `no readable verdict: ${e.message}`; }
  if (verdict?.meta?.mode !== 'swarm' || verdict.overall !== overall || !Array.isArray(verdict.results)) {
    return 'invalid Swarm verdict for the completed player-truth run';
  }
  const bad = SWARM_BOOT_CRITICAL.filter((id) => {
    const rows = verdict.results.filter((row) => row?.id === id);
    return rows.length !== 1 || rows[0].status !== 'PASS';
  });
  return bad.length ? `boot-critical checks not PASS: ${bad.join(', ')}` : null;
}

export function createSwarmBootStep(outputRoot) {
  // Player-truth can fail preflight before it touches its output directory.
  // Only the verdict from this child invocation can judge this boot.
  const outDir = mkdtempSync(join(outputRoot, 'gate-swarm-'));
  return {
    name: 'boot-swarm',
    args: ['run', 'player-truth', '--', '--mode=swarm', '--rounds=1', '--duration=10', `--out=${outDir}`],
    // A finished route may fail or be incomplete on noncritical checks such
    // as loadout polish. Still require each boot-critical row to pass.
    judge: (result) => judgeSwarmBoot(result, outDir),
  };
}

function npmCommand() {
  const inheritedCli = process.env.npm_execpath;
  if (inheritedCli) return { file: process.execPath, base: [inheritedCli] };
  if (process.platform !== 'win32') return { file: 'npm', base: [] };

  // Windows cannot spawn the batch shim directly. Run the same JS entry with
  // Node and keep each argument separate, including the generated output path.
  const directories = [dirname(process.execPath), ...(process.env.PATH || '').split(delimiter)];
  for (const directory of directories) {
    const root = directory.trim().replace(/^"(.*)"$/, '$1');
    if (!root) continue;
    const cli = resolve(root, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (existsSync(cli)) return { file: process.execPath, base: [cli] };
  }
  throw new Error('npm-cli.js was not found beside Node or in an npm installation on PATH');
}

const ERRORISH = /\bFAIL\b|\berror\b|exception|assert|ENVIRONMENT|could not run|timed out|not ok|✗|✘/i;

function firstErrorLine(out) {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => ERRORISH.test(l));
  return (hit || lines[lines.length - 1] || 'no output').slice(0, 220);
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function runStep(step, timeoutMs) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      const { file, base } = npmCommand();
      child = spawn(file, [...base, ...step.args], {
        cwd: REPO, env: { ...process.env, SF_CHECK_BUDGET_SCALE: String(BUDGET_SCALE) },
        detached: process.platform !== 'win32', // own process group so killTree works on POSIX
        windowsHide: true,
      });
    } catch (error) {
      resolvePromise({ code: -1, out: `spawn error: ${error.message}`, timedOut: false });
      return;
    }
    let out = '';
    const onData = (d) => {
      out += d.toString();
      if (out.length > 8_000_000) out = `${out.slice(0, 4_000_000)}\n...[gate: middle of log truncated]...\n${out.slice(-2_000_000)}`;
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, Math.max(1000, timeoutMs));
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, out, timedOut });
    };
    child.on('error', (err) => { out += `\nspawn error: ${err.message}`; done(-1); });
    child.on('close', (code) => done(code ?? -1));
  });
}

async function main(quick) {
  mkdirSync(OUT_DIR, { recursive: true });
  const steps = [
    { name: 'import-lint', args: ['run', 'check:src-imports'] },
    { name: 'boot-adventure', args: ['run', 'check:playable'] },
  ];
  if (!quick) steps.push(createSwarmBootStep(OUT_DIR), { name: 'sim-47a', args: ['run', 'check:sim'] });
  const lines = [];
  const emit = (l) => { lines.push(l); console.log(l); };
  emit(`budget scale ${BUDGET_SCALE}`);
  const deadline = Date.now() + GATE_BUDGET_MS;
  let gateOk = true;

  for (const step of steps) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      emit(`FAIL ${step.name}: gate time budget (${Math.round(GATE_BUDGET_MS / 60000)}m) already spent`);
      gateOk = false;
      break;
    }
    const t0 = Date.now();
    const r = await runStep(step, remaining);
    const secs = Math.round((Date.now() - t0) / 1000);
    writeFileSync(join(OUT_DIR, `gate-${step.name}.log`), r.out);
    const judged = step.judge && !r.timedOut ? step.judge(r) : undefined;
    if (!r.timedOut && (step.judge ? judged === null : r.code === 0)) {
      emit(`PASS ${step.name} ${secs}s`);
    } else {
      const detail = r.timedOut ? `timed out at ${secs}s (gate budget ${Math.round(GATE_BUDGET_MS / 60000)}m)` : (judged || firstErrorLine(r.out));
      emit(`FAIL ${step.name}: ${detail}`);
      emit(`  log: .devshots/fleet/gate-${step.name}.log (${secs}s)`);
      gateOk = false;
      break;
    }
  }

  emit(gateOk ? 'GATE PASS' : 'GATE FAIL');
  writeFileSync(join(OUT_DIR, 'gate-last.txt'), lines.join('\n') + '\n');
  return gateOk ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2).includes('--quick'));
}
