#!/usr/bin/env node
// A read-only front door to the requested living-world authoring package.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_NOTICE, LIVING_WORLD_ROOT, LIVING_WORLD_PLAN_DIR,
  readLivingWorldPlan, validateLivingWorldPlan, readyLivingWorldTasks,
  livingWorldDistrictBrief, renderLivingWorldDistrictBrief,
} from './lib/livingWorldPlan.mjs';

const HELP = `Living-world authoring reader\n\n${AUTHORING_NOTICE}\n\n` +
  'node scripts/living-world.mjs --validate [--json]\n' +
  'node scripts/living-world.mjs --district=<id> [--json]\n' +
  'node scripts/living-world.mjs --task=<id> [--json]\n' +
  'node scripts/living-world.mjs --next [--json]\n\n' +
  '--next lists dependency-ready planned tasks in this package. It neither claims\n' +
  'work nor replaces build_map.md or the existing INFERENCE/FINISH work selection.\n';

export function parseLivingWorldArgs(args) {
  const out = { action: null, id: null, json: false };
  const select = (action, id = null) => {
    if (out.action) throw new Error('Choose one of --validate, --district, --task, or --next.');
    if ((action === 'district' || action === 'task') && (!id || id.startsWith('--'))) throw new Error(`--${action} requires an ID.`);
    out.action = action; out.id = id;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') select('help');
    else if (arg === '--validate') select('validate');
    else if (arg === '--next') select('next');
    else if (arg === '--district' || arg === '--task') select(arg.slice(2), args[++i]);
    else if (arg.startsWith('--district=') || arg.startsWith('--task=')) {
      const equal = arg.indexOf('='); select(arg.slice(2, equal), arg.slice(equal + 1));
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  out.action ||= 'help';
  return out;
}

export function runLivingWorld(args, { root = LIVING_WORLD_ROOT, write = value => process.stdout.write(value), error = value => process.stderr.write(value) } = {}) {
  let options;
  try { options = parseLivingWorldArgs(args); }
  catch (e) { error(`${e.message}\n${HELP}`); return 2; }
  if (options.action === 'help') { write(HELP); return 0; }
  const printJson = value => write(`${JSON.stringify(value, null, 2)}\n`);
  try {
    const { districts, program } = readLivingWorldPlan(root);
    const validation = validateLivingWorldPlan(districts, program, { root });
    if (!validation.ok) {
      if (options.json) printJson(validation);
      else {
        error(`${AUTHORING_NOTICE}\nValidation failed:\n`);
        for (const issue of validation.issues) error(`- ${issue.path}: ${issue.message} [${issue.code}]\n`);
      }
      return 1;
    }
    if (options.action === 'validate') {
      if (options.json) printJson(validation);
      else write(`${AUTHORING_NOTICE}\nAuthoring validation passed: ${validation.counts.districts} districts, ${validation.counts.routines} routines, ${validation.counts.opportunities} opportunities, ${validation.counts.tasks} tasks.\n`);
    } else if (options.action === 'district') {
      const district = districts.districts.find(row => row.id === options.id);
      if (!district) throw new Error(`Unknown district: ${options.id}`);
      const brief = livingWorldDistrictBrief(district, program);
      if (options.json) printJson(brief); else write(renderLivingWorldDistrictBrief(brief));
    } else if (options.action === 'task') {
      const task = program.tasks.find(row => row.id === options.id);
      if (!task) throw new Error(`Unknown task: ${options.id}`);
      const packet = readFileSync(resolve(root, LIVING_WORLD_PLAN_DIR, task.packet), 'utf8');
      const dependsOn = task.dependsOn.map(id => { const row = program.tasks.find(t => t.id === id); return { id, status: row.status, title: row.title }; });
      if (options.json) printJson({ notice: AUTHORING_NOTICE, task, dependencies: dependsOn, packet });
      else write(`${AUTHORING_NOTICE}\n\n# ${task.id}: ${task.title}\nStatus: ${task.status}\nOutcome: ${task.outcome}\nDepends on: ${dependsOn.map(row => `${row.id} (${row.status})`).join(', ') || 'nothing'}\nOwners:\n${task.ownerPaths.map(path => `- ${path}`).join('\n')}\nChecks:\n${task.checks.map(check => `- ${check}`).join('\n')}\n\n${packet}\n`);
    } else {
      const tasks = readyLivingWorldTasks(program);
      if (options.json) printJson({ notice: AUTHORING_NOTICE, readiness: 'manifest_dependencies_only', tasks });
      else write(`${AUTHORING_NOTICE}\n\nDependency-ready in this package (${tasks.length}):\n${tasks.map(task => `- ${task.id}: ${task.title}\n  ${task.outcome}\n  Read: node scripts/living-world.mjs --task=${task.id}`).join('\n') || 'No planned task has all manifest dependencies implemented.'}\n`);
    }
    return 0;
  } catch (e) {
    if (options.json) printJson({ ok: false, notice: AUTHORING_NOTICE, error: e.message });
    else error(`living-world: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = runLivingWorld(process.argv.slice(2));
