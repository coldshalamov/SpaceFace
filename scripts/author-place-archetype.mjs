#!/usr/bin/env node
// Author one place archetype: Blender build -> finalize_part -> authoring.json provenance.
//
// Usage:
//   node scripts/author-place-archetype.mjs place_station_refinery
//   node scripts/author-place-archetype.mjs place_station_refinery --blender="C:/Program Files/Blender Foundation/Blender 4.2/blender.exe"
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const BUILDER = resolve(ROOT, 'tools/art/blender/author_place_archetype.py');
const FINALIZE = resolve(ROOT, 'tools/art/finalize_part.mjs');

const argv = process.argv.slice(2);
const partId = argv.find((a) => !a.startsWith('--'));
const blenderFlag = argv.find((a) => a.startsWith('--blender='));
const blenderExe = blenderFlag?.split('=').slice(1).join('=')
  || process.env.BLENDER_EXE
  || 'blender';

if (!partId) {
  console.error('usage: author-place-archetype.mjs <place_id> [--blender=path/to/blender.exe]');
  process.exit(2);
}

if (!existsSync(AUTHORING_PATH)) {
  console.error(`missing authoring sidecar: ${AUTHORING_PATH}`);
  process.exit(2);
}

const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
const entry = authoring.entries?.[partId];
if (!entry) {
  console.error(`part '${partId}' not listed in authoring.json entries`);
  process.exit(2);
}

function run(cmd, args, label) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`FAIL ${label} (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  return result;
}

console.log(`[author] building ${partId} via Blender...`);
run(blenderExe, ['--background', '--python', BUILDER, '--', partId], 'blender build');

const glbPath = resolve(ROOT, 'assets/ships/parts/places', `${partId}.glb`);
if (!existsSync(glbPath)) {
  console.error(`expected exported GLB missing: ${glbPath}`);
  process.exit(1);
}

console.log(`[author] finalizing ${partId}...`);
run(process.execPath, [FINALIZE, glbPath, partId, '--method=blender_mcp'], 'finalize_part');

entry.method = 'bootstrap_pending';
entry.blend_path = `assets/ships/parts/blender/${partId}.blend`;
writeFileSync(AUTHORING_PATH, `${JSON.stringify(authoring, null, 2)}\n`);
console.log(`[author] updated authoring.json: ${partId} -> bootstrap_pending`);
console.log(`[author] run: node scripts/promote-place-archetype.mjs ${partId}`);