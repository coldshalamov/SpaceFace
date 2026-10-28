#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateProgram, taskBrief, safeRepoPath } from './lib/strategicChaosProgram.mjs';
import { auditB12Report, compareStrategyTrials } from './lib/strategicChaosEvidence.mjs';
import { installBuildMap } from './lib/strategicChaosMap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROGRAM = 'design/program/strategic-chaos/program.json';
const LIMIT = 8 * 1024 * 1024;
function json(path) {
  if (statSync(path).size > LIMIT) throw new Error('Input exceeds the 8 MiB diagnostic limit.');
  return JSON.parse(readFileSync(path, 'utf8'));
}
const print = value => console.log(JSON.stringify(value, null, 2));
export function main(args = process.argv.slice(2), root = ROOT) {
  const [command = 'help', ...rest] = args;
  if (command === 'help' && rest.length === 0) {
    console.log(`SpaceFace Strategic Chaos — existing owners, no new dispatcher
  validate [--bundle]       Validate task contracts, docs, links and existing owner paths.
                            --bundle explicitly skips source paths in a source-only delivery.
  brief SC-01              Print a complete scoped commission; never claim or launch it.
  map [--apply]            Preview/add the small build-map link. No commits or pushes.
  proof                    Execute the EXISTING full five-seed B12 suite with a bounded child.
  audit REPORT.json        Inspect imported B12 JSON; always diagnostic exit 4.
  compare A.json B.json    Compare matching strategy trials; always diagnostic exit 4.
Exit codes: 0 static checks/native B12 criterion met; 1 measured B12 miss;
2 invalid/blocked/incomplete; 4 diagnostic-only. No command grants game acceptance.`);
    return 0;
  }
  if (command === 'validate') {
    if (rest.some(arg => arg !== '--bundle') || rest.length > 1) throw new Error('Only --bundle is supported for validate.');
    const program = json(join(root, PROGRAM));
    const report = validateProgram(program);
    const bundle = rest.includes('--bundle');
    if (report.ok) for (const task of program.tasks) {
      const docPath = join(root, task.document);
      if (!existsSync(docPath)) { report.issues.push({ path: task.document, message: 'Missing task document.' }); continue; }
      const text = readFileSync(docPath, 'utf8');
      if (!text.includes(task.id)) report.issues.push({ path: task.document, message: 'Document identifies a different packet.' });
      // Verify repository-relative Markdown links within the new documentation, not external URLs.
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        const linked = resolve(dirname(docPath), target);
        if (relative(root, linked) === '..' || relative(root, linked).startsWith('..' + sep) || isAbsolute(relative(root, linked)) || !existsSync(linked)) report.issues.push({ path: task.document, message: `Broken or escaping link: ${target}` });
      }
      if (!bundle) for (const owner of task.ownerPaths) if (!safeRepoPath(owner) || !existsSync(join(root, owner))) report.issues.push({ path: owner, message: 'Live-owner path is absent. Refresh the source crosswalk.' });
    }
    report.ok = report.issues.length === 0;
    print({ ...report, sourcePathCheck: bundle ? 'NOT_RUN_SOURCE_ONLY_BUNDLE' : 'checked', acceptanceGranted: false });
    return report.ok ? 0 : 2;
  }
  if (command === 'brief' && rest.length === 1) {
    const program = json(join(root, PROGRAM));
    const validation = validateProgram(program);
    if (!validation.ok) throw new Error('Invalid program; run validate.');
    const task = program.tasks.find(row => row.id === rest[0]);
    if (!task) throw new Error('Unknown packet. Use a documented SC label.');
    console.log(taskBrief(program, task.id, readFileSync(join(root, task.document), 'utf8')));
    return 0;
  }
  if (command === 'map' && (rest.length === 0 || (rest.length === 1 && rest[0] === '--apply'))) {
    print(installBuildMap(root, { apply: rest.includes('--apply') })); return 0;
  }
  if (command === 'audit' && rest.length === 1) {
    const report = json(resolve(rest[0]));
    print(auditB12Report(report.suite || report)); return 4;
  }
  if (command === 'compare' && rest.length === 2) {
    print(compareStrategyTrials(json(resolve(rest[0])), json(resolve(rest[1])))); return 4;
  }
  if (command === 'proof' && rest.length === 0) {
    if (!existsSync(join(root, 'src/testing/lab/proofSixtySeconds.js'))) throw new Error('Native proof source is absent. This bundle is not a complete game checkout.');
    const directory = join(root, '.devshots/strategic-chaos'); mkdirSync(directory, { recursive: true });
    // Unique result name prevents an old successful report surviving a failed current run.
    const runDirectory = mkdtempSync(join(directory, 'b12-'));
    const resultPath = join(runDirectory, 'report.json');
    const child = spawnSync(process.execPath, [join(root, 'scripts/lib/strategicChaosNative.mjs'), root, resultPath], {
      cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: LIMIT,
      env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
    });
    writeFileSync(join(runDirectory, 'runner.log'), (child.stdout || '') + (child.stderr || ''));
    if (child.error || child.signal || !existsSync(resultPath)) {
      print({ verdict: 'INCOMPLETE', acceptanceGranted: false, reason: child.error?.message || child.signal || 'Native runner did not produce current evidence.' });
      return 2;
    }
    const result = json(resultPath);
    print({ report: resultPath, source: result.source, ...result.audit });
    return [0, 1, 2, 4].includes(child.status) ? child.status : 2;
  }
  throw new Error('Unknown command or unsupported flags. Run: node scripts/strategic-chaos.mjs help');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`Strategic Chaos: ${error.message}`); process.exitCode = 2; }
}
