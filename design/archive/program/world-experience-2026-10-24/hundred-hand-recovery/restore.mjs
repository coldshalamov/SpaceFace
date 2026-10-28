import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') ||
      value.split('/').some(p => !p || p === '.' || p === '..') || /^[A-Za-z]:/.test(value)) {
    throw new Error('unsafe recovery path');
  }
  return value;
}
export function applyPatch(base, patch) {
  const groups = []; let group = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) { group = []; groups.push(group); }
    else if (group && /^[ +\-]/.test(line)) group.push(line);
  }
  if (!groups.length) throw new Error('empty patch');
  let source = base.replace(/\r\n/g, '\n');
  for (const lines of groups) {
    const before = lines.filter(l => l[0] !== '+').map(l => l.slice(1)).join('\n') + '\n';
    const after = lines.filter(l => l[0] !== '-').map(l => l.slice(1)).join('\n') + '\n';
    if (source.split(before).length !== 2) throw new Error('patch context absent or ambiguous');
    source = source.replace(before, () => after);
  }
  return source;
}
export function reconstruct(recipe, additions, readBase, hash) {
  if (recipe.schema !== 'spaceface-exact-public-source-recovery-v1' ||
      additions.schema !== 'spaceface-recovery-new-files-v1') throw new Error('unknown recipe');
  const result = {};
  const checkedBase = (name, expected) => {
    safeRelative(name); const source = readBase(name);
    if (hash(source) !== expected) throw new Error('wrong base: ' + name);
    return source;
  };
  for (const [name, item] of Object.entries(recipe.shared)) {
    const base = checkedBase(name, item.baseSha256);
    const normalized = applyPatch(base, item.patch);
    result[name] = item.lineEnding === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized;
  }
  for (const [name, source] of Object.entries(additions.files)) {
    safeRelative(name); if (name in result || typeof source !== 'string') throw new Error('duplicate new file');
    result[name] = source;
  }
  for (const [name, item] of Object.entries(recipe.operations)) {
    let source = checkedBase(name, item.baseSha256);
    for (const edit of item.edits) {
      if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.remove) ||
          edit.start < 0 || edit.remove < 0 || edit.start + edit.remove > source.length ||
          source.slice(edit.start, edit.start + edit.remove) !== edit.before) throw new Error('edit mismatch');
      source = source.slice(0, edit.start) + edit.insert + source.slice(edit.start + edit.remove);
    }
    result[name] = source;
  }
  const generated = recipe.generatedCensus;
  const oldGenerated = checkedBase(generated.path, generated.baseSha256);
  if (!oldGenerated.startsWith(generated.prefix)) throw new Error('generated prefix mismatch');
  result[generated.path] = generated.prefix + JSON.stringify(result[generated.source]) + ';\n';
  const expectedNames = Object.keys(recipe.expected).sort();
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(expectedNames)) throw new Error('path set mismatch');
  for (const [name, spec] of Object.entries(recipe.expected)) {
    if (unescape(encodeURIComponent(result[name])).length !== spec.bytes || hash(result[name]) !== spec.sha256) throw new Error('reconstructed source mismatch: ' + name);
  }
  return result;
}
export function verifyBytes(bytes, spec, hash) {
  if (bytes.length !== spec.bytes || hash(bytes) !== spec.sha256) throw new Error('byte identity mismatch');
}
const INDEX_SHA256 = '5a1fa12f15d854609d34e030e2e09298da7c23d9c6cdb6584b5859e202b5d308';
function assertNoSymlink(filename) {
  const absolute = path.resolve(filename), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('symlink component refused');
  }
}
const isWithin = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function readSafe(root, relative) {
  safeRelative(relative);
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) throw new Error('path escaped root');
  assertNoSymlink(filename);
  const actual = fs.realpathSync(filename);
  if (!actual.startsWith(root + path.sep)) throw new Error('symlink escaped root');
  return fs.readFileSync(actual);
}
function main() {
  const args = process.argv.slice(2);
  const take = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : null; };
  const baseArg = take('--base'), outputArg = take('--output');
  if (!baseArg || (!outputArg && !args.includes('--verify-only'))) throw new Error('use --base EXACT_CHECKOUT --output NEW_DIRECTORY or --verify-only');
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  assertNoSymlink(scriptDir); assertNoSymlink(baseArg);
  const root = fs.realpathSync(scriptDir);
  const base = fs.realpathSync(baseArg);
  const indexBytes = readSafe(root, 'index.json');
  if (sha256(indexBytes) !== INDEX_SHA256) throw new Error('index identity mismatch');
  const index = JSON.parse(indexBytes);
  const recipeBytes = readSafe(root, 'source-reconstruction.json');
  const additionBytes = readSafe(root, 'new-files.json');
  verifyBytes(recipeBytes, index.recipe, sha256); verifyBytes(additionBytes, index.newFiles, sha256);
  const recipe = JSON.parse(recipeBytes), additions = JSON.parse(additionBytes);
  const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' };
  const head = execFileSync('git', ['-C', base, 'rev-parse', 'HEAD'], { env, encoding: 'utf8' }).trim();
  if (head !== recipe.baseCommit) throw new Error('checkout HEAD is not the exact public base');
  const source = reconstruct(recipe, additions, name => readSafe(base, name).toString('utf8'), sha256);
  for (const name of Object.keys(additions.files)) {
    if (fs.existsSync(path.resolve(base, name))) throw new Error('new path already exists in base: ' + name);
  }
  const assets = new Map();
  for (const item of index.assets) {
    safeRelative(item.path);
    if (assets.has(item.path)) throw new Error('duplicate asset path');
    if (fs.existsSync(path.resolve(base, item.path))) throw new Error('asset path already exists in base');
    const stored = readSafe(root, item.storage.path); verifyBytes(stored, item.storage, sha256);
    let raw;
    if (item.storage.encoding === 'raw') raw = stored;
    else if (item.storage.encoding === 'gzip') raw = gunzipSync(stored, { maxOutputLength: item.bytes });
    else if (item.storage.encoding === 'xz') {
      raw = execFileSync('python3', ['-I', '-S', '-c', 'import sys,lzma;limit=int(sys.argv[1]);d=lzma.LZMADecompressor();b=d.decompress(sys.stdin.buffer.read(),max_length=limit+1);assert len(b)==limit and d.eof and not d.unused_data;sys.stdout.buffer.write(b)', String(item.bytes)],
        { input: stored, maxBuffer: item.bytes + 1024 });
    } else throw new Error('unknown recovery encoding');
    verifyBytes(raw, item, sha256);
    const git = crypto.createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex');
    if (git !== item.git) throw new Error('asset Git identity mismatch');
    assets.set(item.path, raw);
  }
  if (assets.size !== 44) throw new Error('expected 44 original asset paths');
  if (args.includes('--verify-only')) {
    console.log(JSON.stringify({ sourcePaths: Object.keys(source).length, assetPaths: assets.size, verified: true }));
    return;
  }
  const requested = path.resolve(outputArg);
  assertNoSymlink(path.dirname(requested));
  const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
  if (isWithin(output, base) || isWithin(output, root)) throw new Error('output cannot modify base or recovery tree');
  if (fs.lstatSync(output, { throwIfNoEntry: false })) throw new Error('output must not already exist');
  // This is an overlay, not a replacement checkout. No base files are modified.
  // Every source and asset is validated before the first output write.
  fs.mkdirSync(output, { recursive: false });
  for (const [name, value] of [...Object.entries(source), ...assets]) {
    safeRelative(name); const target = path.resolve(output, name);
    if (!target.startsWith(output + path.sep)) throw new Error('output path escaped');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    assertNoSymlink(path.dirname(target));
    fs.writeFileSync(target, value, { flag: 'wx' });
  }
  console.log(JSON.stringify({ overlay: output, sourcePaths: Object.keys(source).length, assetPaths: assets.size }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
