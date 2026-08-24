#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DONOR = 'refs/remotes/origin/codex/tactical-map-second-generation';
const MASTER = 'refs/remotes/origin/master';
const MERGED_PATHS = new Set(['src/ui/radar.js', 'src/ui/screenManager.js']);
const COPY_PREFIXES = [
  'src/ui/map/tacticalMapGrammar.js',
  'src/ui/map/mapParityBridge.js',
  'test/tactical-map-second-generation.test.mjs',
  'design/TACTICAL_MAP_SECOND_GENERATION.md',
  'design/map-research/TACTICAL_MAP_RESEARCH.md',
  'design/map-research/TACTICAL_MAP_OPTIONS.md',
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(args, options = {}) {
  const result = run('git', args, options);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function show(ref, path, binary = false) {
  return git(['show', `${ref}:${path}`], { binary });
}

function existsAt(ref, path) {
  return run('git', ['cat-file', '-e', `${ref}:${path}`]).status === 0;
}

function mergeText(path, base) {
  const current = readFileSync(path, 'utf8');
  const ancestor = String(show(base, path));
  const donor = String(show(DONOR, path));
  const result = run('git', ['merge-file', '-p', '--diff3', '/dev/stdin', '/dev/stdin', '/dev/stdin']);
  // `git merge-file` cannot receive three independent stdin streams, so use temporary files.
  const token = `${process.pid}-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  const currentPath = `/tmp/${token}-current`;
  const basePath = `/tmp/${token}-base`;
  const donorPath = `/tmp/${token}-donor`;
  writeFileSync(currentPath, current);
  writeFileSync(basePath, ancestor);
  writeFileSync(donorPath, donor);
  const merged = run('git', ['merge-file', '-p', '--diff3', currentPath, basePath, donorPath]);
  const output = String(merged.stdout || '');
  if (merged.status !== 0 || /^(?:<{7}|={7}|>{7})/m.test(output)) {
    throw new Error(`semantic three-way merge conflicts in ${path}`);
  }
  writeFileSync(path, output);
}

const base = String(git(['merge-base', MASTER, DONOR])).trim();
if (!base) throw new Error('map donor has no merge base with master');

for (const path of MERGED_PATHS) {
  if (!existsSync(path) || !existsAt(base, path) || !existsAt(DONOR, path)) {
    throw new Error(`required three-way path missing: ${path}`);
  }
  mergeText(path, base);
}

for (const path of COPY_PREFIXES) {
  if (!existsAt(DONOR, path)) throw new Error(`scoped donor path missing: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, show(DONOR, path, true));
}

for (const path of [...MERGED_PATHS, ...COPY_PREFIXES]) {
  const source = readFileSync(path, path.endsWith('.png') ? null : 'utf8');
  if (typeof source === 'string' && /^(?:<{7}|={7}|>{7})/m.test(source)) {
    throw new Error(`conflict marker survived in ${path}`);
  }
}

console.log(JSON.stringify({ donor: DONOR, base, merged: [...MERGED_PATHS], copied: COPY_PREFIXES }, null, 2));
