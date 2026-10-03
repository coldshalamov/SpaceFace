#!/usr/bin/env node
/** Conservative, dependency-free installer. Dry-run is the default.
 * Applies uniquely matching context hunks, not entire old registry/world files.
 * All conflicts are checked before any game source is changed. Crash recovery uses
 * a persisted backup receipt; ordinary write errors trigger best-effort rollback.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (v) => createHash('sha256').update(v).digest('hex');
const modulePaths = ['src/ai/tensionWindow.js', 'src/ai/tensionPolicy.js', 'src/ai/tensionDirector.js', 'src/systems/tensionDirector.js'];
const patches = { 'src/core/registry.js': 'registry.patch', 'src/systems/encounterDirector.js': 'encounter-consumer.patch' };
const manifestPath = 'src/runtime/authoritativeSystemManifest.js';
const manifestArrays = ['PRODUCTION_INIT_ORDER', 'PRODUCTION_UPDATE_ORDER', 'CALENDAR_CLOCK_IDS'];

function positions(text, needle) {
  const hits = []; let cursor = 0;
  while (needle && (cursor = text.indexOf(needle, cursor)) !== -1) { hits.push(cursor); cursor += needle.length; }
  return hits;
}
export function applyContextPatch(input, patch) {
  const crlf = input.includes('\r\n');
  let result = input.replace(/\r\n/g, '\n');
  const chunks = patch.replace(/\r\n/g, '\n').split(/^@@[^\n]*\n/m).slice(1);
  if (!chunks.length) throw new Error('Patch contains no context hunks');
  for (const [index, chunk] of chunks.entries()) {
    const lines = chunk.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const before = [], after = [];
    for (const line of lines) {
      if (line.startsWith(' ')) { before.push(line.slice(1)); after.push(line.slice(1)); }
      else if (line.startsWith('-')) before.push(line.slice(1));
      else if (line.startsWith('+')) after.push(line.slice(1));
      else if (line.startsWith('\\')) continue;
      else throw new Error(`Unsupported patch line in hunk ${index + 1}`);
    }
    const oldText = before.join('\n') + '\n', newText = after.join('\n') + '\n';
    const oldHits = positions(result, oldText), newHits = positions(result, newText);
    if (oldHits.length === 1 && newHits.length === 0) {
      const at = oldHits[0]; result = result.slice(0, at) + newText + result.slice(at + oldText.length);
    } else if (oldHits.length === 0 && newHits.length === 1) { /* already applied */ }
    else throw new Error(`Hunk ${index + 1}: unique context not found (old=${oldHits.length}, new=${newHits.length}). Merge this file manually; no blind overwrite.`);
  }
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}

export function wireManifest(input) {
  let result = input;
  for (const name of manifestArrays) {
    const pattern = new RegExp(`(export\\s+const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\[)([\\s\\S]*?)(\\]\\);)`);
    const match = result.match(pattern);
    if (!match) throw new Error(`Cannot locate manifest array ${name}; integrate its order manually.`);
    const body = match[2];
    const encounter = [...body.matchAll(/['"]encounterDirector['"]/g)];
    const tension = [...body.matchAll(/['"]tensionDirector['"]/g)];
    if (encounter.length !== 1 || tension.length > 1) throw new Error(`Ambiguous membership in ${name}`);
    if (tension.length === 1) {
      const ids = [...body.matchAll(/['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]);
      if (ids.indexOf('tensionDirector') + 1 !== ids.indexOf('encounterDirector')) {
        throw new Error(`Existing tensionDirector is not immediately before encounterDirector in ${name}`);
      }
      continue;
    }
    const at = encounter[0].index;
    const modified = body.slice(0, at) + "'tensionDirector', " + body.slice(at);
    result = result.replace(pattern, () => match[1] + modified + match[3]);
  }
  return result;
}

async function maybeRead(file) {
  try { return await fs.readFile(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function checkedPath(target, relative) {
  const file = path.resolve(target, relative);
  if (!file.startsWith(target + path.sep)) throw new Error('Path escaped checkout');
  // Reject symlinked source paths: a checkout must not redirect installation elsewhere.
  let ancestor = file;
  while (ancestor !== target) {
    try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error(`Refusing symlink: ${ancestor}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    ancestor = path.dirname(ancestor);
  }
  return file;
}
export async function planInstall(checkout) {
  const target = await fs.realpath(path.resolve(checkout));
  const plan = [];
  for (const relative of [...modulePaths, ...Object.keys(patches), manifestPath]) {
    const file = await checkedPath(target, relative), before = await maybeRead(file);
    let after;
    if (modulePaths.includes(relative)) {
      after = await fs.readFile(path.join(root, 'repo', relative), 'utf8');
      if (before !== null && before.replace(/\r\n/g, '\n') !== after) {
        throw new Error(`${relative}: a different implementation already exists; reconcile before installation`);
      }
      if (before !== null) after = before;
    } else {
      if (before === null) throw new Error(`Required source missing: ${relative}`);
      try {
        after = relative === manifestPath ? wireManifest(before)
          : applyContextPatch(before, await fs.readFile(path.join(root, 'patches', patches[relative]), 'utf8'));
      } catch (error) { throw new Error(`${relative}: ${error.message}`); }
    }
    plan.push({ relative, before, after, changed: before !== after });
  }
  return { target, plan };
}
async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tension-tmp-${process.pid}`;
  try { await fs.writeFile(temporary, text, { flag: 'wx' }); await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
}
export async function applyInstall(preflight) {
  const { target, plan } = preflight, changed = plan.filter((r) => r.changed);
  if (!changed.length) return { changed: 0, backup: null };
  // Recheck all source files immediately before committing a previously computed plan.
  for (const row of plan) {
    const current = await maybeRead(await checkedPath(target, row.relative));
    if (current !== row.before) throw new Error(`${row.relative}: checkout changed after preflight; run again`);
  }
  const backup = await fs.mkdtemp(path.join(target, '.tension-director-backup-'));
  const receipt = { schema: 'spaceface.tension.install.v1', checkout: target,
    files: changed.map((r) => ({ path: r.relative, existed: r.before !== null,
      beforeSha256: r.before === null ? null : hash(r.before), afterSha256: hash(r.after) })) };
  for (const row of changed) if (row.before !== null) {
    const file = path.join(backup, row.relative); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, row.before);
  }
  await fs.writeFile(path.join(backup, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  const written = [];
  try {
    for (const row of changed) { await atomicWrite(path.join(target, row.relative), row.after); written.push(row); }
  } catch (error) {
    const failures = [];
    for (const row of written.reverse()) try {
      if (row.before === null) await fs.rm(path.join(target, row.relative), { force: true });
      else await atomicWrite(path.join(target, row.relative), row.before);
    } catch (rollbackError) { failures.push(`${row.relative}: ${rollbackError.message}`); }
    throw new Error(`Install failed: ${error.message}. Backup: ${backup}. Rollback errors: ${failures.join('; ') || 'none'}`);
  }
  return { changed: changed.length, backup };
}
export async function rollbackInstall(backupDirectory) {
  const backup = await fs.realpath(path.resolve(backupDirectory));
  const receipt = JSON.parse(await fs.readFile(path.join(backup, 'receipt.json'), 'utf8'));
  const expectedPaths = new Set([...modulePaths, ...Object.keys(patches), manifestPath]);
  if (receipt.schema !== 'spaceface.tension.install.v1' || !Array.isArray(receipt.files)
    || receipt.files.length > expectedPaths.size || new Set(receipt.files.map((r) => r.path)).size !== receipt.files.length) {
    throw new Error('Invalid rollback receipt');
  }
  const target = await fs.realpath(receipt.checkout), plan = [];
  if (path.dirname(backup) !== target) throw new Error('Backup must be inside its recorded checkout');
  for (const row of receipt.files) {
    if (!expectedPaths.has(row.path)) throw new Error(`Unknown rollback path: ${row.path}`);
    const file = await checkedPath(target, row.path), current = await maybeRead(file);
    if (current === null || hash(current) !== row.afterSha256) throw new Error(`${row.path}: changed since install; refusing destructive rollback`);
    const before = row.existed ? await fs.readFile(path.join(backup, row.path), 'utf8') : null;
    if (before !== null && hash(before) !== row.beforeSha256) throw new Error(`Damaged backup: ${row.path}`);
    plan.push({ file, before });
  }
  for (const row of plan) {
    if (row.before === null) await fs.rm(row.file); else await atomicWrite(row.file, row.before);
  }
  return { restored: plan.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--rollback' && args.length === 2) {
      console.log(JSON.stringify(await rollbackInstall(args[1]), null, 2));
    } else {
      const checkout = args[0], apply = args.includes('--apply');
      if (!checkout || args.slice(1).some((a) => a !== '--apply')) throw new Error('Usage: node tools/install.mjs CHECKOUT [--apply] | --rollback BACKUP_DIRECTORY');
      const preflight = await planInstall(checkout);
      for (const row of preflight.plan) console.log(`${row.changed ? 'CHANGE' : 'UNCHANGED'} ${row.relative}`);
      console.log(apply ? JSON.stringify(await applyInstall(preflight), null, 2) : 'Dry-run only. Add --apply to write these changes with backups.');
      console.log('Node-only lookup and save schema are host-owned; complete the explicit checks in INTEGRATION-NOTES.md.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
