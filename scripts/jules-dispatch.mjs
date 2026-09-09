#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(SCRIPT_DIR, '..');
export const DEFAULT_BANK_PATH = resolve(ROOT, 'design/program/jules/task-bank.json');

const MODEL_ALIASES = new Map([
  ['flash', 'gemini-3.6-flash'],
  ['gemini-flash', 'gemini-3.6-flash'],
  ['gemini-3.6-flash', 'gemini-3.6-flash'],
  ['pro', 'gemini-3.1-pro'],
  ['gemini-pro', 'gemini-3.1-pro'],
  ['gemini-3.1-pro', 'gemini-3.1-pro'],
]);
const VALID_RESULTS = new Set(['PR_READY', 'NO_CHANGE', 'BLOCKED']);
const RISK_RANK = new Map([['low', 0], ['medium', 1], ['high', 2], ['critical', 3]]);
const SIZE_RANK = new Map([['xs', 0], ['s', 1], ['m', 2], ['l', 3]]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadBank(path = DEFAULT_BANK_PATH) {
  return readJson(path);
}

function countBy(items, field) {
  const out = {};
  for (const item of items) out[item[field]] = (out[item[field]] ?? 0) + 1;
  return out;
}

function sameCounts(actual, declared) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(declared ?? {})]);
  return [...keys].every((key) => actual[key] === declared?.[key]);
}

export function validateBank(bank) {
  const errors = [];
  if (!bank || typeof bank !== 'object') {
    return { ok: false, errors: ['Bank is not an object.'], stats: {} };
  }

  const tasks = Array.isArray(bank.tasks) ? bank.tasks : [];
  const lanes = Array.isArray(bank.lanes) ? bank.lanes : [];
  const laneIds = new Set(lanes.map((lane) => lane.id));
  const requiredStrings = [
    'id', 'title', 'slug', 'lane', 'model', 'mode', 'risk', 'expectedSize',
    'collisionKey', 'branchHint', 'objective', 'context', 'negativeResult', 'localMergeGate',
  ];
  const requiredArrays = [
    'inspectPaths', 'readFirst', 'work', 'acceptance', 'suggestedChecks', 'tags', 'allowedResults',
  ];
  const seen = {
    id: new Set(),
    title: new Set(),
    slug: new Set(),
    branchHint: new Set(),
    objective: new Set(),
  };
  const protectedScopes = [
    /^design\/program\/jules(?:\/|$)/,
    /^design\/program\/NOW\.md$/,
    /^design\/program\/roadmap\/program-queue\.json$/,
    /^test\/.*\.expected\.json$/,
  ];

  if (bank.schemaVersion !== 1) errors.push(`schemaVersion must be 1; got ${bank.schemaVersion}.`);
  if (tasks.length !== 1000) errors.push(`Expected exactly 1000 tasks; got ${tasks.length}.`);
  if (lanes.length !== 10) errors.push(`Expected exactly 10 lanes; got ${lanes.length}.`);

  tasks.forEach((task, index) => {
    const where = `tasks[${index}]`;
    const expectedId = `JULES-${String(index + 1).padStart(4, '0')}`;
    if (task?.id !== expectedId) errors.push(`${where}.id must be contiguous ${expectedId}; got ${task?.id}.`);

    for (const field of requiredStrings) {
      if (typeof task?.[field] !== 'string' || task[field].trim() === '') {
        errors.push(`${where}.${field} must be a non-empty string.`);
      }
    }
    if (!Number.isInteger(task?.priority) || task.priority < 1 || task.priority > 4) {
      errors.push(`${where}.priority must be an integer from 1 to 4.`);
    }
    for (const field of requiredArrays) {
      if (!Array.isArray(task?.[field]) || task[field].length === 0) {
        errors.push(`${where}.${field} must be a non-empty array.`);
      }
    }
    if ((task?.work?.length ?? 0) < 4) errors.push(`${where}.work must contain at least four executable steps.`);
    if ((task?.acceptance?.length ?? 0) < 4) errors.push(`${where}.acceptance must contain at least four criteria.`);
    if (!laneIds.has(task?.lane)) errors.push(`${where}.lane is not declared: ${task?.lane}.`);
    if (!['gemini-3.6-flash', 'gemini-3.1-pro'].includes(task?.model)) {
      errors.push(`${where}.model is invalid: ${task?.model}.`);
    }
    if (!RISK_RANK.has(task?.risk)) errors.push(`${where}.risk is invalid: ${task?.risk}.`);
    if (!SIZE_RANK.has(task?.expectedSize)) errors.push(`${where}.expectedSize is invalid: ${task?.expectedSize}.`);
    if (JSON.stringify(task?.allowedResults) !== JSON.stringify(['PR_READY', 'NO_CHANGE', 'BLOCKED'])) {
      errors.push(`${where}.allowedResults must be PR_READY, NO_CHANGE, BLOCKED in that order.`);
    }
    if (!task?.branchHint?.startsWith(`jules/${task.id.toLowerCase()}-`)) {
      errors.push(`${where}.branchHint must begin with jules/${task?.id?.toLowerCase()}-.`);
    }

    for (const field of Object.keys(seen)) {
      const value = task?.[field];
      if (seen[field].has(value)) errors.push(`${where}.${field} duplicates another task: ${value}.`);
      seen[field].add(value);
    }
    for (const path of task?.inspectPaths ?? []) {
      if (protectedScopes.some((pattern) => pattern.test(path))) {
        errors.push(`${where}.inspectPaths includes bank/control/golden mutation scope: ${path}.`);
      }
    }
  });

  const actualByLane = countBy(tasks, 'lane');
  const actualByModel = countBy(tasks, 'model');
  const actualByRisk = countBy(tasks, 'risk');
  const actualBySize = countBy(tasks, 'expectedSize');
  const declaredLaneCounts = Object.fromEntries(lanes.map((lane) => [lane.id, lane.count]));

  if (!sameCounts(actualByLane, bank.counts?.byLane ?? {})) errors.push('counts.byLane does not match tasks.');
  if (!sameCounts(actualByLane, declaredLaneCounts)) errors.push('lanes[].count does not match tasks.');
  if (!sameCounts(actualByModel, bank.counts?.byModel ?? {})) errors.push('counts.byModel does not match tasks.');
  if (!sameCounts(actualByRisk, bank.counts?.byRisk ?? {})) errors.push('counts.byRisk does not match tasks.');
  if (!sameCounts(actualBySize, bank.counts?.byExpectedSize ?? {})) errors.push('counts.byExpectedSize does not match tasks.');
  if (bank.counts?.total !== tasks.length) errors.push('counts.total does not match tasks.');

  const collisionCounts = countBy(tasks, 'collisionKey');
  const malformedCollisions = Object.entries(collisionCounts).filter(([, count]) => count !== 5);
  if (malformedCollisions.length) {
    errors.push(`Every collisionKey must own exactly five facets; malformed: ${JSON.stringify(malformedCollisions.slice(0, 10))}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      total: tasks.length,
      byLane: actualByLane,
      byModel: actualByModel,
      byRisk: actualByRisk,
      byExpectedSize: actualBySize,
      collisionKeys: Object.keys(collisionCounts).length,
    },
  };
}

function splitList(value) {
  if (value == null || value === true) return [];
  return String(value).split(',').map((part) => part.trim()).filter(Boolean);
}

export function normalizeModels(value) {
  return splitList(value).map((model) => {
    const normalized = MODEL_ALIASES.get(model.toLowerCase());
    if (!normalized) throw new Error(`Unknown model alias: ${model}`);
    return normalized;
  });
}

function deterministicNumber(seed, value) {
  const digest = createHash('sha256').update(`${seed}\0${value}`).digest();
  return digest.readUInt32BE(0);
}

function taskRank(task, seed) {
  return [
    Number(task.priority ?? 4),
    RISK_RANK.get(task.risk) ?? 99,
    SIZE_RANK.get(task.expectedSize) ?? 99,
    deterministicNumber(seed, task.id),
  ];
}

function compareRank(a, b, seed) {
  const ar = taskRank(a, seed);
  const br = taskRank(b, seed);
  for (let index = 0; index < ar.length; index += 1) {
    if (ar[index] !== br[index]) return ar[index] - br[index];
  }
  return a.id.localeCompare(b.id);
}

export function selectTasks(bank, options = {}, state = { tasks: {} }) {
  const seed = String(options.seed ?? 'spaceface-jules');
  const wantedModels = new Set(options.models ?? []);
  const wantedLanes = new Set(options.lanes ?? []);
  const wantedRisks = new Set(options.risks ?? []);
  const wantedSizes = new Set(options.sizes ?? []);
  const wantedPriorities = new Set((options.priorities ?? []).map(Number));
  const requiredTags = new Set(options.tags ?? []);
  const excludedTags = new Set(options.excludeTags ?? []);
  const count = Math.max(1, Number(options.count ?? 1));
  const maxPerCollision = Math.max(1, Number(options.maxPerCollision ?? 1));
  const maxPerLane = options.maxPerLane == null ? Infinity : Math.max(1, Number(options.maxPerLane));
  const maxPriority = options.maxPriority == null ? Infinity : Number(options.maxPriority);
  const query = String(options.search ?? '').trim().toLowerCase();
  const includeDispatched = options.includeDispatched === true;

  const records = state?.tasks ?? {};
  const activeCollisionCounts = {};
  for (const [id, record] of Object.entries(records)) {
    if (record?.status !== 'claimed') continue;
    const task = bank.tasks.find((candidate) => candidate.id === id);
    if (task) activeCollisionCounts[task.collisionKey] = (activeCollisionCounts[task.collisionKey] ?? 0) + 1;
  }

  const candidates = bank.tasks.filter((task) => {
    const record = records[task.id];
    if (!includeDispatched && record && ['claimed', 'completed', 'blocked'].includes(record.status)) return false;
    if (wantedModels.size && !wantedModels.has(task.model)) return false;
    if (wantedLanes.size && !wantedLanes.has(task.lane)) return false;
    if (wantedRisks.size && !wantedRisks.has(task.risk)) return false;
    if (wantedSizes.size && !wantedSizes.has(task.expectedSize)) return false;
    if (wantedPriorities.size && !wantedPriorities.has(Number(task.priority))) return false;
    if (Number(task.priority) > maxPriority) return false;
    if ([...requiredTags].some((tag) => !task.tags.includes(tag))) return false;
    if ([...excludedTags].some((tag) => task.tags.includes(tag))) return false;
    if (query) {
      const haystack = [
        task.id, task.title, task.lane, task.model, task.objective, task.context,
        ...task.inspectPaths, ...task.tags,
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const groups = new Map();
  for (const task of candidates) {
    const list = groups.get(task.collisionKey) ?? [];
    list.push(task);
    groups.set(task.collisionKey, list);
  }
  for (const list of groups.values()) list.sort((a, b) => compareRank(a, b, seed));

  const orderedGroups = [...groups.entries()].sort((a, b) => {
    const first = compareRank(a[1][0], b[1][0], seed);
    if (first !== 0) return first;
    return deterministicNumber(seed, a[0]) - deterministicNumber(seed, b[0]);
  });

  const selected = [];
  const selectedByCollision = {};
  const selectedByLane = {};
  let progress = true;

  while (selected.length < count && progress) {
    progress = false;
    for (const [collisionKey, queue] of orderedGroups) {
      if (selected.length >= count) break;
      const used = (activeCollisionCounts[collisionKey] ?? 0) + (selectedByCollision[collisionKey] ?? 0);
      if (used >= maxPerCollision || queue.length === 0) continue;

      const taskIndex = queue.findIndex((task) => (selectedByLane[task.lane] ?? 0) < maxPerLane);
      if (taskIndex < 0) continue;
      const [task] = queue.splice(taskIndex, 1);
      selected.push(task);
      selectedByCollision[collisionKey] = (selectedByCollision[collisionKey] ?? 0) + 1;
      selectedByLane[task.lane] = (selectedByLane[task.lane] ?? 0) + 1;
      progress = true;
    }
  }

  return selected;
}

export function formatTaskPrompt(bank, task) {
  const contract = bank.globalContract;
  const bullets = (items) => items.map((item) => `- ${item}`).join('\n');
  const numbered = (items) => items.map((item, index) => `${index + 1}. ${item}`).join('\n');

  return `Execute exactly ${task.id} in SpaceFace. One task, one branch, one PR; do not begin another task.

TASK
ID: ${task.id}
TITLE: ${task.title}
RECOMMENDED MODEL: ${task.model}
MODE: ${task.mode}
PRIORITY: P${task.priority}
RISK: ${task.risk}
EXPECTED SIZE: ${task.expectedSize}
COLLISION KEY: ${task.collisionKey}
BRANCH HINT: ${task.branchHint}

START
${numbered(contract.readBeforeMutation)}

READ FIRST
${bullets(task.readFirst)}

INSPECT SCOPE
${bullets(task.inspectPaths)}

CONTEXT
${task.context}

OBJECTIVE
${task.objective}

WORK
${numbered(task.work)}

ACCEPTANCE
${bullets(task.acceptance)}

SUGGESTED PROOF
Run the narrowest directly relevant command first. These are starting points, not permission to run an unchanged failure repeatedly:
${bullets(task.suggestedChecks)}

NON-NEGOTIABLE REPOSITORY LAW
${bullets(contract.forbiddenBehavior)}

DO NOT EDIT
${bullets(contract.forbiddenEdits)}

HONEST NEGATIVE RESULT
${task.negativeResult}

DELIVERY
- Rebase or start from current master and record the actual BASE_SHA; the bank's generation SHA is historical context, not permission to work from stale code.
- Keep the diff limited to the smallest current owners and focused tests required by this task.
- Open a PR only for a coherent reviewed commit. Do not merge it.
- NO_CHANGE means no empty commit and no empty PR. Return exact evidence instead.
- BLOCKED means one concrete external/environmental blocker or exact live-path collision, not uncertainty or a failed first attempt.
- Visual claims require representative player-route evidence when the environment can produce it; otherwise label the broader visual claim unproven.
- ${task.localMergeGate}

FINAL RESPONSE
${contract.requiredTerminalReport.map((field) => `${field}:`).join('\n')}
`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) throw new Error(`Unexpected positional argument: ${raw}`);
    const equals = raw.indexOf('=');
    let key;
    let value;
    if (equals >= 0) {
      key = raw.slice(2, equals);
      value = raw.slice(equals + 1);
    } else {
      key = raw.slice(2);
      const next = argv[index + 1];
      if (next != null && !next.startsWith('--')) {
        value = next;
        index += 1;
      } else {
        value = true;
      }
    }
    args[key] = value;
  }
  return args;
}

function defaultStatePath() {
  try {
    const gitPath = execFileSync('git', ['rev-parse', '--git-path', 'jules-dispatch-state.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return resolve(ROOT, gitPath);
  } catch {
    return resolve(ROOT, '.jules-dispatch-state.json');
  }
}

export function loadState(path = defaultStatePath()) {
  if (!existsSync(path)) {
    return { schemaVersion: 1, updatedAt: null, tasks: {} };
  }
  const state = readJson(path);
  if (state.schemaVersion !== 1 || typeof state.tasks !== 'object' || state.tasks == null) {
    throw new Error(`Invalid Jules dispatch state: ${path}`);
  }
  return state;
}

export function saveState(state, path = defaultStatePath()) {
  mkdirSync(dirname(path), { recursive: true });
  state.updatedAt = new Date().toISOString();
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

function findTask(bank, id) {
  const normalized = String(id).toUpperCase();
  const task = bank.tasks.find((candidate) => candidate.id === normalized);
  if (!task) throw new Error(`Unknown task id: ${id}`);
  return task;
}

export function claimTasks(bank, state, tasks, worker, force = false, maxPerCollision = 1) {
  const now = new Date().toISOString();
  const cap = Math.max(1, Number(maxPerCollision));
  const activeCollisionCounts = new Map();
  const activeCollisionIds = new Map();
  for (const [id, record] of Object.entries(state.tasks)) {
    if (record.status !== 'claimed') continue;
    const task = bank.tasks.find((candidate) => candidate.id === id);
    if (!task) continue;
    activeCollisionCounts.set(task.collisionKey, (activeCollisionCounts.get(task.collisionKey) ?? 0) + 1);
    const ids = activeCollisionIds.get(task.collisionKey) ?? [];
    ids.push(id);
    activeCollisionIds.set(task.collisionKey, ids);
  }

  for (const task of tasks) {
    const current = state.tasks[task.id];
    if (!force && current && ['claimed', 'completed', 'blocked'].includes(current.status)) {
      throw new Error(`${task.id} is already ${current.status}. Use --force only after inspecting state.`);
    }
    const used = activeCollisionCounts.get(task.collisionKey) ?? 0;
    if (!force && used >= cap) {
      const owners = (activeCollisionIds.get(task.collisionKey) ?? []).join(', ');
      throw new Error(
        `${task.id} exceeds collision cap ${cap} on ${task.collisionKey}` +
        `${owners ? `; active: ${owners}` : ''}.`,
      );
    }
    state.tasks[task.id] = {
      status: 'claimed',
      worker: worker || 'unspecified',
      claimedAt: now,
      branchHint: task.branchHint,
      collisionKey: task.collisionKey,
    };
    activeCollisionCounts.set(task.collisionKey, used + 1);
    const ids = activeCollisionIds.get(task.collisionKey) ?? [];
    ids.push(task.id);
    activeCollisionIds.set(task.collisionKey, ids);
  }
}

function completeTask(bank, state, id, args) {
  const task = findTask(bank, id);
  const result = String(args.result ?? '').toUpperCase();
  if (!VALID_RESULTS.has(result)) {
    throw new Error('--complete requires --result PR_READY|NO_CHANGE|BLOCKED.');
  }
  if (result === 'PR_READY' && !args.pr && !args.commit) {
    throw new Error('PR_READY completion requires --pr or --commit.');
  }
  state.tasks[task.id] = {
    ...(state.tasks[task.id] ?? {}),
    status: result === 'BLOCKED' ? 'blocked' : 'completed',
    result,
    completedAt: new Date().toISOString(),
    pr: args.pr === true ? null : (args.pr ?? null),
    commit: args.commit === true ? null : (args.commit ?? null),
    note: args.note === true ? null : (args.note ?? null),
    collisionKey: task.collisionKey,
  };
}

function stateStats(bank, state) {
  const byStatus = countBy(Object.values(state.tasks), 'status');
  const byResult = countBy(Object.values(state.tasks).filter((record) => record.result), 'result');
  const active = Object.entries(state.tasks)
    .filter(([, record]) => record.status === 'claimed')
    .map(([id, record]) => ({ id, worker: record.worker, collisionKey: record.collisionKey, claimedAt: record.claimedAt }));
  return {
    bank: validateBank(bank).stats,
    statePath: null,
    tracked: Object.keys(state.tasks).length,
    byStatus,
    byResult,
    active,
  };
}

function outputTasks(bank, tasks, format) {
  switch (format) {
    case 'ids':
      process.stdout.write(`${tasks.map((task) => task.id).join('\n')}${tasks.length ? '\n' : ''}`);
      break;
    case 'json':
      process.stdout.write(`${JSON.stringify(tasks, null, 2)}\n`);
      break;
    case 'ndjson':
      process.stdout.write(`${tasks.map((task) => JSON.stringify(task)).join('\n')}${tasks.length ? '\n' : ''}`);
      break;
    case 'prompt':
      process.stdout.write(`${tasks.map((task) => formatTaskPrompt(bank, task)).join('\n\n--- JULES TASK BOUNDARY ---\n\n')}${tasks.length ? '\n' : ''}`);
      break;
    default:
      throw new Error(`Unknown --format ${format}; use prompt|json|ndjson|ids.`);
  }
}

function printHelp() {
  process.stdout.write(`SpaceFace Jules task-bank dispatcher

Validate and inspect:
  node scripts/jules-dispatch.mjs --validate
  node scripts/jules-dispatch.mjs --stats
  node scripts/jules-dispatch.mjs --id JULES-0001 --format prompt

Select:
  node scripts/jules-dispatch.mjs --next [filters]
  --count N                  number of tasks (default 1)
  --model flash,pro          model alias filter
  --lane lane-a,lane-b       lane filter
  --risk low,medium,high     risk filter
  --size xs,s,m              expected-size filter
  --priority 1,2             exact priority filter
  --max-priority N           inclusive priority ceiling
  --tag tag-a,tag-b          require all tags
  --exclude-tag tag-a        reject any matching tag
  --search text              search task text and paths
  --seed text                deterministic tie-break seed
  --max-per-collision N      active+selected cap (default 1)
  --max-per-lane N           selection cap per lane
  --format prompt|json|ndjson|ids
  --include-dispatched       include claimed/completed/blocked tasks
  --claim-selected           atomically claim selected tasks in local state
  --worker name              worker label for claims
  --state path               override state path

State:
  node scripts/jules-dispatch.mjs --claim JULES-0001 --worker jules-01
  node scripts/jules-dispatch.mjs --complete JULES-0001 --result PR_READY --pr <url>
  node scripts/jules-dispatch.mjs --complete JULES-0001 --result NO_CHANGE --note "..."
  node scripts/jules-dispatch.mjs --release JULES-0001
`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    printHelp();
    return 0;
  }

  const bankPath = args.bank === true ? DEFAULT_BANK_PATH : resolve(ROOT, args.bank ?? DEFAULT_BANK_PATH);
  const bank = loadBank(bankPath);
  const validation = validateBank(bank);
  if (!validation.ok) {
    for (const error of validation.errors) process.stderr.write(`ERROR: ${error}\n`);
    return 1;
  }

  if (args.validate) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...validation.stats }, null, 2)}\n`);
    return 0;
  }

  const statePath = args.state === true ? defaultStatePath() : resolve(ROOT, args.state ?? defaultStatePath());
  const state = loadState(statePath);

  if (args.claim) {
    const task = findTask(bank, args.claim);
    claimTasks(bank, state, [task], args.worker === true ? null : args.worker, args.force === true, args['max-per-collision'] ?? 1);
    saveState(state, statePath);
    process.stdout.write(`CLAIMED ${task.id} ${task.collisionKey}\n`);
    return 0;
  }

  if (args.complete) {
    completeTask(bank, state, args.complete, args);
    saveState(state, statePath);
    process.stdout.write(`RECORDED ${String(args.complete).toUpperCase()} ${String(args.result).toUpperCase()}\n`);
    return 0;
  }

  if (args.release) {
    const task = findTask(bank, args.release);
    delete state.tasks[task.id];
    saveState(state, statePath);
    process.stdout.write(`RELEASED ${task.id}\n`);
    return 0;
  }

  if (args.stats) {
    const stats = stateStats(bank, state);
    stats.statePath = statePath;
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
    return 0;
  }

  let selected;
  if (args.id) {
    selected = splitList(args.id).map((id) => findTask(bank, id));
  } else {
    selected = selectTasks(bank, {
      count: args.count,
      models: normalizeModels(args.model),
      lanes: splitList(args.lane),
      risks: splitList(args.risk),
      sizes: splitList(args.size),
      priorities: splitList(args.priority),
      maxPriority: args['max-priority'],
      tags: splitList(args.tag),
      excludeTags: splitList(args['exclude-tag']),
      search: args.search === true ? '' : args.search,
      seed: args.seed === true ? 'spaceface-jules' : args.seed,
      maxPerCollision: args['max-per-collision'],
      maxPerLane: args['max-per-lane'],
      includeDispatched: args['include-dispatched'] === true,
    }, state);
  }

  if (args['claim-selected']) {
    claimTasks(bank, state, selected, args.worker === true ? null : args.worker, args.force === true, args['max-per-collision'] ?? 1);
    saveState(state, statePath);
  }

  const requested = Math.max(1, Number(args.count ?? (args.id ? selected.length : 1)));
  if (!args.id && selected.length < requested) {
    process.stderr.write(`NOTICE: requested ${requested}, selected ${selected.length} after filters, state, and collision caps.\n`);
  }
  if (selected.length === 0) {
    process.stderr.write('No matching unclaimed tasks.\n');
    return 2;
  }

  outputTasks(bank, selected, String(args.format ?? 'prompt'));
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`ERROR: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
