#!/usr/bin/env node
// One GPU, sequential real-game probes. No automatic source edits or quality changes.
// --diagnose profiles the worst measured cell with CPU/worker/CDP/GPU attribution.
// --verify runs the four affected public-route player-truth gates.
// --frame-solid checks streaming/presentation; --soak checks repeated lifecycle residency.
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { comparePerformanceRuns, selectPerformanceDiagnostic } from './lib/performanceCampaignComparison.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const value = key => process.argv.find(a => a.startsWith(key + '='))?.slice(key.length + 1);
const label = value('--label');
if (!label || !/^[a-z0-9-]{1,24}$/.test(label)) throw new Error('--label=<unique lowercase name, max 24 chars> required');
const out = path.join(root, '.devshots', 'performance-campaign', label);
// Refuse to overwrite a baseline. A repeat must have an explicit new identity.
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const baseline = value('--baseline');
if (baseline && !/^[a-z0-9-]{1,24}$/.test(baseline)) throw new Error('Invalid baseline label');
if (process.argv.includes('--require-target') && !baseline) throw new Error('--require-target needs --baseline');
const cells = [
  { id: 'adventure-early', args: [] },
  { id: 'adventure-settled', args: ['--settle-ms=25000'] },
  { id: 'swarm-early', args: ['--crucible'] },
  { id: 'swarm-settled', args: ['--crucible', '--settle-ms=25000'] },
  { id: 'gauntlet-early', args: ['--gauntlet'] },
  { id: 'racing-early', args: ['--racing'] },
  { id: 'adventure-travel', args: ['--travel-ms=90000'] },
  { id: 'racing-travel', args: ['--racing', '--travel-ms=90000'] },
];
const requested = value('--cells')?.split(',');
if (requested?.some(id => !cells.some(c => c.id === id))) throw new Error('Unknown cell');
const results = [];
async function execute(id, args, timeoutMs = 300_000, executable = process.execPath) {
  console.log(`[performance-campaign] ${id}`);
  const log = [];
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      else child.kill();
    }, timeoutMs);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { process.stdout.write(data); log.push(data.toString()); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve(code); });
  });
  await writeFile(path.join(out, id + '.log'), log.join(''));
  return exit;
}
for (const cell of cells.filter(c => !requested || requested.includes(c.id))) {
  const probeLabel = label + '-' + cell.id;
  const exit = await execute(cell.id, ['scripts/probe-main-thread-profile.mjs', '--cadence-only', '--ms=20000', '--label=' + probeLabel, ...cell.args]);
  if (exit !== 0) {
    results.push({ cell: cell.id, status: 'probe-failed', exit });
    await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    continue;
  }
  const run = JSON.parse(await readFile(path.join(root, '.devshots', 'main-thread-profile', probeLabel, 'cadence.json'), 'utf8'));
  await writeFile(path.join(out, cell.id + '.json'), JSON.stringify(run, null, 1));
  let prior = null, baselineError = null;
  if (baseline) try {
    prior = JSON.parse(await readFile(path.join(root, '.devshots', 'performance-campaign', baseline, cell.id + '.json'), 'utf8'));
  } catch (error) { baselineError = error.message; }
  results.push({ cell: cell.id, metadata: run.metadata, summary: run.summary,
    baselineError, comparison: prior ? comparePerformanceRuns(prior, run) : null });
  await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
}
const workflow = [];
if (process.argv.includes('--spector')) workflow.push({ kind: 'spector',
  exit: await execute('spector', ['scripts/capture-spector-frame.mjs', '--headful',
    '--out=' + path.relative(root, path.join(out, 'spector'))], 600_000) });
if (process.argv.includes('--diagnose')) {
  const worst = selectPerformanceDiagnostic(results);
  if (worst) {
    const cell = cells.find(c => c.id === worst.cell);
    const exit = await execute('diagnose-' + cell.id, ['scripts/probe-main-thread-profile.mjs',
      '--ms=20000', '--sampling-us=4000', '--trace', '--gpu-timers', '--worker-profile',
      '--worker-cost', '--label=' + label + '-diagnose', ...cell.args]);
    workflow.push({ kind: 'attribution', cell: cell.id, exit,
      output: path.join('.devshots/main-thread-profile', label + '-diagnose'),
      authority: 'diagnostic; profiling changes timing, do not compare with cadence-only' });
    if (exit === 0) {
      const wrapper = path.join(root, '.devshots/tools/perfetto/trace_processor');
      const processor = value('--trace-processor');
      if (processor || existsSync(wrapper)) {
        const trace = path.join(root, '.devshots/main-thread-profile', label + '-diagnose', 'trace.json');
        // Inclusive slices overlap and must not be summed as a wall-time budget.
        // Import-health warnings remain in the log rather than being discarded.
        const sql = 'SELECT name, COUNT(*) AS slices, ROUND(MAX(dur)/1e6,3) AS max_ms, '
          + 'ROUND(SUM(dur)/1e6,3) AS inclusive_ms FROM slice WHERE dur>0 GROUP BY name '
          + 'ORDER BY MAX(dur) DESC LIMIT 30';
        const exit = await execute('perfetto-slices', processor ? ['query', trace, sql]
          : [wrapper, 'query', trace, sql], 120_000, processor || 'python');
        workflow.push({ kind: 'perfetto-slices', exit, output: path.relative(root, path.join(out, 'perfetto-slices.log')),
          authority: 'overlapping diagnostic slices; inspect import health and CPU profile for attribution' });
      } else workflow.push({ kind: 'perfetto-slices', exit: 2,
        output: 'Install the official Perfetto trace processor or pass --trace-processor=<executable>.' });
    }
  }
}
if (process.argv.includes('--frame-solid')) workflow.push({ kind: 'frame-solid',
  exit: await execute('frame-solid', ['scripts/probe-frame-solid.mjs'], 600_000) });
if (process.argv.includes('--soak')) workflow.push({ kind: 'lifecycle-soak',
  exit: await execute('soak', ['scripts/check-release-soak-electron.mjs', '--cycles=4',
    '--cycle-screenshots=false', '--output-root=' + path.relative(root, out), '--task-id=soak'], 1_800_000) });
if (process.argv.includes('--verify')) for (const mode of ['adventure', 'swarm', 'gauntlet', 'racing']) {
  workflow.push({ kind: 'player-truth', mode, exit: await execute('truth-' + mode,
    ['scripts/player-truth/run.mjs', '--mode=' + mode, '--gate', '--headed',
      '--out=' + path.relative(root, path.join(out, 'player-truth', mode))], 1_800_000) });
}
await writeFile(path.join(out, 'workflow.json'), JSON.stringify(workflow, null, 2));
const digests = new Set(results.map(r => r.metadata?.sourceDigest).filter(Boolean));
const coherentCandidate = digests.size === 1 && results.every(r => r.metadata?.sourceDigest);
const targetMet = !!baseline && coherentCandidate && results.length > 0 && results.every(r => r.comparison?.targetMet);
await writeFile(path.join(out, 'report.md'), '# Performance campaign: ' + label
  + `\n\nTarget: ${baseline ? targetMet ? 'MET in every measured cell' : 'NOT MET' : 'UNMEASURED; baseline required'}.\n\n`
  + `Candidate across cells: ${coherentCandidate ? 'one source digest' : 'CHANGED or unobserved; matrix is diagnostic only'}.\n\n`
  + results.map(r => `- ${r.cell}: ${r.status || `${r.summary.worldSubmitFps?.toFixed(1)} world submissions/s; p95 ${r.summary.submissionGaps?.p95?.toFixed(1)} ms; p99 ${r.summary.callbackGaps.p99?.toFixed(1)} ms; >50 ms ${r.summary.callbackGaps.over50}; frozen callback samples ${r.summary.healthyCallbacksFrozenWorld}; stale simulation samples ${r.summary.healthyCallbacksFrozenSimulation}`}${r.baselineError ? `; baseline unavailable: ${r.baselineError}` : ''}${r.comparison ? `; 3x ${r.comparison.targetMet ? 'MET' : 'NOT MET'}; ${r.comparison.failures.join(', ')}` : ''}`).join('\n')
  + '\n\n' + workflow.map(r => `- ${r.kind}${r.mode ? ' ' + r.mode : ''}: exit ${r.exit}${r.output ? '; ' + r.output : ''}`).join('\n') + '\n');
if (!coherentCandidate || results.some(r => r.status || r.baselineError || r.comparison?.failures.length)
    || workflow.some(r => r.exit !== 0) || (process.argv.includes('--require-target') && !targetMet)) process.exitCode = 1;
console.log(`[performance-campaign] report ${path.join(out, 'report.md')}`);
