#!/usr/bin/env node
// Lightweight shared-checkout progress checkpoints.
//
// Checkpoints are deliberately event-based, not heartbeats: agents update one when they
// start, finish a bounded todo, adopt stale work, or finish. The file is local control state
// under .codex/agent-checkpoints/ and is intentionally excluded from Git by .git/info/exclude.
//
// Usage:
//   node scripts/agent-checkpoint.mjs start --task PQ-XXX.01 --owner THREAD --path src/file.js \
//     --todo "preflight" --todo "implement" --todo "verify" --reserve PQ-XXX.02 --reserve PQ-XXX.03
//   node scripts/agent-checkpoint.mjs check --file .codex/agent-checkpoints/PQ-XXX.01.json --todo 1
//   node scripts/agent-checkpoint.mjs note --file .codex/agent-checkpoints/PQ-XXX.01.json --next "verify"
//   node scripts/agent-checkpoint.mjs plan --file .codex/agent-checkpoints/PQ-XXX.01.json --reserve PQ-XXX.02
//   node scripts/agent-checkpoint.mjs adopt --file .codex/agent-checkpoints/PQ-XXX.01.json --owner THREAD
//   node scripts/agent-checkpoint.mjs finish --file .codex/agent-checkpoints/PQ-XXX.01.json

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT_DIR = resolve(ROOT, '.codex', 'agent-checkpoints');

function usage() {
  console.log(`Usage:
  node scripts/agent-checkpoint.mjs start --task TASK --owner OWNER --path PATH [--path PATH ...]
    --todo "bounded step" [--todo "bounded step" ...] [--reserve TASK ...] [--next "next step"]
  node scripts/agent-checkpoint.mjs check --file FILE --todo N [--next "next step"]
  node scripts/agent-checkpoint.mjs note --file FILE --next "next step"
  node scripts/agent-checkpoint.mjs plan --file FILE [--reserve TASK ...]
  node scripts/agent-checkpoint.mjs adopt --file FILE --owner OWNER [--next "next step"]
  node scripts/agent-checkpoint.mjs finish --file FILE

Reserve the current task plus at most four next tasks. Reservations are a soft lookahead, not a
permanent lease; they expire with the checkpoint's 90-minute liveness window. Use check only at a
meaningful todo boundary. It is not a heartbeat.`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const equals = token.indexOf('=');
    const key = equals === -1 ? token.slice(2) : token.slice(2, equals);
    const inline = equals === -1 ? undefined : token.slice(equals + 1);
    const value = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    if (result[key] === undefined) result[key] = value;
    else result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
  }
  return result;
}

function fail(message) {
  console.error(`agent-checkpoint: ${message}`);
  process.exit(1);
}

function one(value, name) {
  if (value === undefined || value === true || value === '') fail(`--${name} is required`);
  return Array.isArray(value) ? value.at(-1) : value;
}

function many(value) {
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}

function taskId(value, label = 'task') {
  const id = String(value);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) fail(`--${label} contains unsupported characters: ${id}`);
  return id;
}

function plannedTasks(currentTask, values) {
  const future = many(values).map((value) => taskId(value, 'reserve'));
  const result = [currentTask, ...future.filter((id) => id !== currentTask)];
  if (result.length > 5) fail('a checkpoint may reserve at most five tasks including its current task');
  return result;
}

function checkpointPath(value, task) {
  const requested = value === undefined ? resolve(CHECKPOINT_DIR, `${task}.json`) : resolve(ROOT, value);
  const rel = relative(CHECKPOINT_DIR, requested);
  if (rel.startsWith('..') || rel.includes(':') || rel === '') {
    fail(`checkpoint must live under .codex/agent-checkpoints/: ${value || requested}`);
  }
  return requested;
}

function repoPath(value) {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')
      || normalized.includes('/../')) {
    fail(`--path must be a repository-relative path: ${value}`);
  }
  return normalized;
}

function timestamp() {
  return new Date().toISOString();
}

function readCheckpoint(file) {
  if (!existsSync(file)) fail(`checkpoint does not exist: ${file}`);
  let value;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`checkpoint is not valid JSON: ${file} (${error.message})`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`checkpoint must be an object: ${file}`);
  if (!Array.isArray(value.todos)) fail(`checkpoint has no todos array: ${file}`);
  return value;
}

function writeCheckpoint(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}

function nextOpenTodo(todos) {
  return todos.find((todo) => todo.state !== 'done')?.text || null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help || args.h) {
    usage();
    return;
  }

  if (command === 'start') {
    const task = one(args.task, 'task');
    const owner = one(args.owner, 'owner');
    taskId(task);
    const todos = many(args.todo).map((text) => ({ text: String(text), state: 'open', completedAt: null }));
    if (todos.length < 1 || todos.length > 12) fail('start requires 1-12 bounded --todo entries');
    const paths = many(args.path).map(repoPath);
    if (!paths.length) fail('start requires at least one exact --path');
    const file = checkpointPath(args.file, task);
    if (existsSync(file)) fail(`checkpoint already exists; inspect it or adopt it instead of overwriting: ${file}`);
    const now = timestamp();
    const checkpoint = {
      schema: 1,
      task,
      owner,
      state: 'MUTATING',
      startedAt: now,
      lastProgressAt: now,
      next: args.next === undefined ? todos[0].text : one(args.next, 'next'),
      reservedTasks: plannedTasks(task, args.reserve),
      reservationsUpdatedAt: now,
      paths,
      todos,
    };
    writeCheckpoint(file, checkpoint);
    console.log(`started ${task}; checkpoint ${file}`);
    return;
  }

  const file = checkpointPath(one(args.file, 'file'));
  const checkpoint = readCheckpoint(file);
  const now = timestamp();

  if (command === 'check') {
    const index = Number.parseInt(one(args.todo, 'todo'), 10);
    if (!Number.isInteger(index) || index < 1 || index > checkpoint.todos.length) {
      fail(`--todo must be a 1-based index from 1 to ${checkpoint.todos.length}`);
    }
    const todo = checkpoint.todos[index - 1];
    if (todo.state === 'done') fail(`todo ${index} is already checked off`);
    todo.state = 'done';
    todo.completedAt = now;
    checkpoint.lastProgressAt = now;
    checkpoint.next = args.next === undefined ? nextOpenTodo(checkpoint.todos) : one(args.next, 'next');
    writeCheckpoint(file, checkpoint);
    console.log(`checked ${checkpoint.task} todo ${index}; next: ${checkpoint.next || 'none'}`);
    return;
  }

  if (command === 'note') {
    checkpoint.lastProgressAt = now;
    checkpoint.next = one(args.next, 'next');
    writeCheckpoint(file, checkpoint);
    console.log(`progress noted for ${checkpoint.task}; next: ${checkpoint.next}`);
    return;
  }

  if (command === 'plan') {
    checkpoint.reservedTasks = plannedTasks(checkpoint.task, args.reserve);
    checkpoint.reservationsUpdatedAt = now;
    writeCheckpoint(file, checkpoint);
    console.log(`planned ${checkpoint.task} lookahead: ${checkpoint.reservedTasks.join(', ')}`);
    return;
  }

  if (command === 'adopt') {
    checkpoint.previousOwner = checkpoint.owner;
    checkpoint.owner = one(args.owner, 'owner');
    checkpoint.adoptedAt = now;
    checkpoint.lastProgressAt = now;
    checkpoint.state = 'MUTATING';
    if (args.next !== undefined) checkpoint.next = one(args.next, 'next');
    writeCheckpoint(file, checkpoint);
    console.log(`adopted ${checkpoint.task}; owner: ${checkpoint.owner}`);
    return;
  }

  if (command === 'finish') {
    const open = checkpoint.todos.filter((todo) => todo.state !== 'done');
    if (open.length) fail(`cannot finish with open todos: ${open.map((todo) => todo.text).join('; ')}`);
    checkpoint.state = 'DONE';
    checkpoint.next = null;
    checkpoint.completedAt = now;
    checkpoint.lastProgressAt = now;
    writeCheckpoint(file, checkpoint);
    console.log(`finished ${checkpoint.task}; remove its NOW row`);
    return;
  }

  fail(`unknown command: ${command}`);
}

main();
