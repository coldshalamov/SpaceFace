import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../assets/models/asset-bank/', import.meta.url));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const slash = p => p.split(path.sep).join('/');
function requireFact(value, message) { if (!value) throw new Error(message); }
function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 &&
    !/[\\:\x00-\x1f]/.test(value) && !value.startsWith('/') &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}

/** Discover exported authoring candidates; this is not a runtime registry or GLB validator. */
export async function listAssetBank(root = defaultRoot, filters = {}) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await lstat(absoluteRoot);
  requireFact(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'Root must be a real directory');
  const boundary = await realpath(absoluteRoot);
  const files = [];
  let entriesSeen = 0;
  async function visit(dir, depth = 0) {
    requireFact(depth <= 8, 'Catalog depth limit exceeded (8)');
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      requireFact(++entriesSeen <= 20000, 'Catalog entry limit exceeded (20000)');
      if (entry.name === 'evidence') continue;
      const filename = path.join(dir, entry.name);
      requireFact(!entry.isSymbolicLink(), `Symlinks are not supported: ${filename}`);
      if (entry.isDirectory()) await visit(filename, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(filename);
    }
  }
  await visit(boundary);
  const result = [];
  const ids = new Set();
  for (const filename of files.sort(compare)) {
    const metadataPath = slash(path.relative(boundary, filename));
    const check = (value, message) => requireFact(value, `${metadataPath}: ${message}`);
    check((await lstat(filename)).size <= 2 * 1024 * 1024, 'metadata exceeds 2 MiB');
    const row = JSON.parse(await readFile(filename, 'utf8'));
    // Batch manifests and review receipts are not individual model sidecars.
    if (!row || typeof row !== 'object' || !Object.hasOwn(row, 'assetId')) continue;
    check(typeof row.assetId === 'string' && /^[a-z0-9_-]+$/.test(row.assetId), 'invalid asset ID');
    check(!ids.has(row.assetId), `duplicate asset ID ${row.assetId}`);
    ids.add(row.assetId);
    check(typeof row.category === 'string' && /^[a-z0-9_-]+$/.test(row.category), 'invalid category');
    check(safeRelative(row.source), 'unsafe source path');
    check(vector(row.bounds?.min) && vector(row.bounds?.max) &&
      row.bounds.min.every((v, i) => v <= row.bounds.max[i]), 'invalid bounds');
    check(typeof row.unit === 'string' && row.unit.length > 0, 'missing unit');
    check(Array.isArray(row.sockets) && row.sockets.every(s => typeof s?.name === 'string' && s.name.length), 'invalid sockets');
    check(row.tags === undefined || (Array.isArray(row.tags) && row.tags.every(t => typeof t === 'string')), 'invalid tags');
    check(Array.isArray(row.lods) && row.lods.length > 0, 'missing exported LODs');
    const levels = new Set();
    const lods = [];
    for (const lod of row.lods) {
      check(safeRelative(lod.file) && !lod.file.includes('/') && lod.file.endsWith('.glb'), 'unsafe LOD path');
      check(Number.isSafeInteger(lod.level) && lod.level >= 0 && !levels.has(lod.level), 'invalid or duplicate LOD level');
      levels.add(lod.level);
      check(['triangles', 'draws', 'bytes'].every(k => Number.isSafeInteger(lod[k]) && lod[k] >= 0), 'invalid LOD costs');
      const glb = path.join(path.dirname(filename), lod.file);
      const stat = await lstat(glb);
      check(stat.isFile() && !stat.isSymbolicLink(), 'LOD must be a real file');
      lods.push({ level: lod.level, path: slash(path.relative(boundary, glb)),
        triangles: lod.triangles, draws: lod.draws, bytes: lod.bytes });
    }
    result.push({ assetId: row.assetId, category: row.category,
      description: row.description ?? '', kind: 'authoring-library candidate',
      runtimeStatus: row.runtimeStatus ?? 'not established by this catalog',
      unit: row.unit, dimensions: row.bounds.max.map((v, i) => v - row.bounds.min[i]),
      bounds: row.bounds, socketNames: row.sockets.map(s => s.name).sort(compare),
      tags: [...new Set(row.tags ?? [])].sort(compare), source: row.source,
      metadataPath, lods: lods.sort((a, b) => a.level - b.level) });
  }
  // Validate the whole selected root before filtering: duplicates cannot hide behind a filter.
  return result.filter(row => (!filters.category || row.category === filters.category) &&
    (!filters.id || row.assetId === filters.id) && (!filters.tag || row.tags.includes(filters.tag)))
    .sort((a, b) => compare(a.category, b.category) || compare(a.assetId, b.assetId));
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const [flag, ...rest] = args[i].split('=');
    if (flag === '--help' && rest.length === 0) {
      console.log('Usage: node scripts/list-asset-bank.mjs [--root DIRECTORY] [--category NAME] [--id ID] [--tag TAG] [--json]\nExact, case-sensitive filters combine with AND. Paths in output are relative to root; source is repository-relative.');
      return;
    }
    if (flag === '--json' && rest.length === 0) { options.json = true; continue; }
    requireFact(['--root', '--category', '--id', '--tag'].includes(flag), `Unknown argument: ${args[i]}`);
    const value = rest.length ? rest.join('=') : args[++i];
    requireFact(value && !value.startsWith('--'), `Missing value for ${flag}`);
    requireFact(options[flag.slice(2)] === undefined, `Repeated argument: ${flag}`);
    options[flag.slice(2)] = value;
  }
  const rows = await listAssetBank(options.root, options);
  if (options.json) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log(`${rows.length} exported authoring-library candidates (not runtime registration)`);
  for (const row of rows) {
    console.log(`\n${row.category}/${row.assetId}: ${row.description}`);
    console.log(`  dimensions XYZ: ${row.dimensions.map(n => Number(n.toFixed(4))).join(' × ')} ${row.unit}`);
    console.log(`  sockets: ${row.socketNames.join(', ') || '(none)'}; tags: ${row.tags.join(', ') || '(none)'}`);
    console.log(`  source: ${row.source}; metadata: ${row.metadataPath}`);
    for (const lod of row.lods) console.log(`  LOD${lod.level}: ${lod.triangles} triangles, ${lod.draws} draws, ${lod.bytes} bytes; ${lod.path}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Asset bank catalog: ${error.message}`); process.exitCode = 1; });
}
