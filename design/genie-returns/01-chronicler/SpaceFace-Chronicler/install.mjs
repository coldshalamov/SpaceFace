/** Safe addition-only installer. No registry, manifest, package.json, or save-schema edits. */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('./repo/', import.meta.url));
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage: node install.mjs "/path/to/SpaceFace" [--apply]\nDefault: validate and preview only. Different existing files are never overwritten.');
  process.exit(0);
}
if (args.slice(1).some(a => a !== '--apply')) throw new Error('Unknown option; only --apply is accepted.');
const target = realpathSync(resolve(args[0]));
if (!existsSync(join(target, 'package.json')) || !existsSync(join(target, 'src/core/eventBus.js'))) {
  throw new Error('Target must be an existing SpaceFace root containing package.json and src/core/eventBus.js.');
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .flatMap(e => {
      if (e.isSymbolicLink()) throw new Error('Source symlinks are not allowed');
      return e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)];
    });
}
const plan = files(source).map(path => {
  const rel = relative(source, path), dest = resolve(target, rel);
  if (!dest.startsWith(target + sep)) throw new Error('Invalid destination');
  let current = target;
  for (const component of rel.split(sep)) {
    current = join(current, component);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Refusing destination symlink: ${current}`);
    // lstat also finds a dangling symlink, which existsSync intentionally does not follow.
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Refusing destination symlink: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const bytes = readFileSync(path);
  if (existsSync(dest) && (!lstatSync(dest).isFile() || !readFileSync(dest).equals(bytes))) {
    throw new Error(`Conflict: ${rel}. Nothing was written. Review/merge this path manually.`);
  }
  return { rel, dest, bytes, exists: existsSync(dest) };
});
const additions = plan.filter(p => !p.exists);
for (const p of plan) console.log(`${p.exists ? 'IDENTICAL' : 'ADD'} ${p.rel}`);
if (!args.includes('--apply')) {
  console.log(`\nPreview only: ${additions.length} additions. Re-run with --apply to copy. Registry and save wiring remain explicit.`);
} else {
  const created = [];
  try {
    for (const p of additions) {
      mkdirSync(dirname(p.dest), { recursive: true });
      writeFileSync(p.dest, p.bytes, { flag: 'wx' }); created.push(p);
    }
  } catch (error) {
    // Remove only byte-identical files created by this invocation; never delete edited content.
    for (const p of created.reverse()) if (existsSync(p.dest) && readFileSync(p.dest).equals(p.bytes)) unlinkSync(p.dest);
    throw error;
  }
  console.log(`\nCopied ${created.length} additions; ${plan.length - additions.length} already identical. No existing files changed.`);
  console.log('Next: follow INTEGRATION-NOTES.md to register the owner, save field, consumers and optional provenance producers.');
}
