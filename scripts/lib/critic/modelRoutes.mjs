// scripts/lib/critic/modelRoutes.mjs — Model execution routes for critic.
//
// Routes:
// 1. agy (default) — Gemini 3.8 Flash High.
//    agy --model gemini-3.8-flash-high --effort high --output-format text -p "<prompt>"
// 2. kimi — opencode Kimi K3 xhigh.
//    ~/.opencode/bin/opencode.exe run --dir <repo> --model <route> --variant xhigh "<prompt>"
//    Rotates: opencode-go/kimi-k3, cline-pass/cline-pass/kimi-k3, command-code/moonshotai/Kimi-K3.
//    Stdin must be closed (stdio: ['ignore', 'pipe', 'pipe']). Timeout 25 minutes.
// 3. manual — writes prompt bundle to disk and exits 0.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../../');

export const KIMI_ROTATION_ROUTES = Object.freeze([
  'opencode-go/kimi-k3',
  'cline-pass/cline-pass/kimi-k3',
  'command-code/moonshotai/Kimi-K3',
]);

// MEASURED: agy answers a ONE-image probe in ~35 s. A rubric pass opens a dozen images and writes
// a structured verdict, so three minutes was a timeout dressed up as a limit.
export const DEFAULT_AGY_TIMEOUT_MS = 900000; // 15 minutes
export const DEFAULT_KIMI_TIMEOUT_MS = 1500000; // 25 minutes

/**
 * Runs a child process with closed stdin and collects stdout/stderr.
 */
function runProcess(cmd, args, { cwd = ROOT, timeoutMs = 180000, verbose = false, log = () => {} } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (verbose) {
      log(`[spawn] ${cmd} ${args.map((a) => (a.length > 60 ? `${a.slice(0, 57)}...` : a)).join(' ')}`);
    }

    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat')),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectPromise(new Error(`Command timed out after ${timeoutMs} ms`));
      } else {
        resolvePromise({ code, stdout, stderr });
      }
    });
  });
}

/**
 * The agy command line. Exported so the two facts that bit this route can be pinned by a test:
 * agy's print mode has its OWN five-minute timeout, separate from the harness's, so the harness
 * budget must be handed down or the model is cut off mid-verdict; and agy reads files only inside
 * its workspace, so a strip that lives outside the tree the critic runs in (the pre-fix clone's
 * frames live in the primary's .devshots) must be added with --add-dir or the model never sees a
 * picture and grades from the numbers.
 *
 * @param {string} prompt
 * @param {{ timeoutMs?: number, addDirs?: string[] }} [options]
 */
export function buildAgyArgs(prompt, { timeoutMs = DEFAULT_AGY_TIMEOUT_MS, addDirs = [], newProject = false } = {}) {
  const minutes = Math.max(1, Math.ceil((Number(timeoutMs) || DEFAULT_AGY_TIMEOUT_MS) / 60000));
  const args = [
    '--model', 'gemini-3.8-flash-high',
    '--effort', 'high',
    '--output-format', 'text',
    '--print-timeout', `${minutes}m`,
  ];
  // MEASURED 2026-09-05: two verdicts on one strip, minutes apart, one with the repo in the
  // workspace and one with nothing but the frames, came back byte-identical — including a file
  // name and a constant the second run could not have seen. agy keeps a project memory across
  // conversations; a frames-only review starts a new project so nothing is remembered into it.
  if (newProject) args.push('--new-project');
  for (const dir of Array.isArray(addDirs) ? addDirs : []) {
    if (typeof dir === 'string' && dir.trim()) args.push('--add-dir', dir);
  }
  args.push('-p', prompt);
  return args;
}

/**
 * Executes agy (Gemini 3.8 Flash High).
 */
export async function executeAgyRoute(prompt, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_AGY_TIMEOUT_MS;
  const verbose = !!options.verbose;
  const log = options.log || console.log;

  // Locate agy executable
  let agyCmd = 'agy';
  if (process.platform === 'win32') {
    const localAgy = join(homedir(), 'AppData/Local/agy/bin/agy.exe');
    if (existsSync(localAgy)) {
      agyCmd = localAgy;
    }
  }

  const args = buildAgyArgs(prompt, { timeoutMs, addDirs: options.addDirs, newProject: options.newProject === true });

  const startTime = Date.now();
  const { code, stdout, stderr } = await runProcess(agyCmd, args, {
    cwd: options.repoDir || ROOT,
    timeoutMs,
    verbose,
    log,
  });

  const wallMs = Date.now() - startTime;
  if (code !== 0) {
    throw new Error(`agy exited with code ${code}: ${stderr || stdout}`);
  }

  return {
    rawOutput: stdout,
    wallMs,
    route: 'agy/gemini-3.8-flash-high',
    label: 'Gemini 3.8 Flash High',
  };
}

/**
 * Executes Kimi via opencode with route rotation.
 */
export async function executeKimiRoute(prompt, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_KIMI_TIMEOUT_MS;
  const verbose = !!options.verbose;
  const log = options.log || console.log;
  const repoDir = options.repoDir || ROOT;

  let opencodeCmd = 'opencode';
  if (process.platform === 'win32') {
    const localOpencode = join(homedir(), '.opencode', 'bin', 'opencode.exe');
    if (existsSync(localOpencode)) {
      opencodeCmd = localOpencode;
    }
  }

  const errors = [];
  for (const route of KIMI_ROTATION_ROUTES) {
    if (verbose) log(`Attempting kimi route: ${route}`);
    const args = ['run', '--dir', repoDir, '--model', route, '--variant', 'xhigh', prompt];

    const startTime = Date.now();
    try {
      const { code, stdout, stderr } = await runProcess(opencodeCmd, args, {
        cwd: repoDir,
        timeoutMs,
        verbose,
        log,
      });
      const wallMs = Date.now() - startTime;

      if (code === 0 && stdout.trim().length > 0) {
        return {
          rawOutput: stdout,
          wallMs,
          route: `kimi/${route}`,
          label: `Kimi K3 xhigh (${route})`,
        };
      }
      errors.push(`Route ${route} exited with code ${code}: ${stderr || stdout}`);
    } catch (err) {
      errors.push(`Route ${route} error: ${err.message}`);
    }
  }

  throw new Error(`All kimi routes failed:\n${errors.join('\n')}`);
}

/**
 * Executes manual route (writes prompt to disk and exits).
 */
export async function executeManualRoute(prompt, manifest, options = {}) {
  const stripName = options.stripName || `${manifest?.bench || 'bench'}-${manifest?.scenarioId || 'scenario'}-s${manifest?.seed || 0}`;
  const defaultPath = join(ROOT, 'design/program/roadmap/receipts/fun-loop/critic', stripName, 'manual-prompt.md');
  const outPath = options.manualOutPath || defaultPath;

  mkdirSync(dirname(outPath), { recursive: true });

  const content = [
    '# Manual Fun Critic Review Prompt',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Strip: ${stripName}`,
    `- Manifest: ${options.manifestPath || 'provisional'}`,
    '',
    '## Instructions',
    'Inspect the frame files listed below and answer the 10-question rubric.',
    'Every answer to questions 1-9 MUST provide the integer frameIndex from the strip that proves it.',
    'Question 10 (the fundamental) must name the rule, the file, what it does, the vision sentence it breaks, and the frameIndex.',
    'The count of good answers is coverage, never the verdict. The verdict has three parts: the seven blockers (each a boolean, true = blocked, with evidence), the intent result (does the strip show the declared claim, and which tradeoff was spent), and the play judgment (perceive / decide / execute / friction / falsifier). One raised blocker fails the bench.',
    'The critic proposes a rule change, never more stuff. Do not propose more enemies, ships, weapons, missions, particles, camera shake, or health.',
    'Your response must be strictly the JSON result document.',
    '',
    '---',
    '',
    prompt,
    '',
  ].join('\n');

  writeFileSync(outPath, content, 'utf8');

  return {
    rawOutput: JSON.stringify({ manualPromptPath: outPath }, null, 2),
    wallMs: 0,
    route: 'manual',
    label: 'Manual Review Prompt',
    manual: true,
    manualPromptPath: outPath,
  };
}

/**
 * Dispatches prompt execution to the named model route.
 */
export async function executeModelRoute(modelName, prompt, manifest, options = {}) {
  const norm = String(modelName || 'agy').trim().toLowerCase();
  switch (norm) {
    case 'agy':
      return executeAgyRoute(prompt, options);
    case 'kimi':
      return executeKimiRoute(prompt, options);
    case 'manual':
      return executeManualRoute(prompt, manifest, options);
    default:
      throw new Error(`Unknown model route: '${modelName}'. Supported routes: agy, kimi, manual`);
  }
}
