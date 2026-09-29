// Read-only inspection helper for the FABLE planning pass.
// Usage: node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/inspect.mjs <seams|data|both>
// Walks src/ (and test/, scripts/ for cross-reference) and reports:
//   seams : event names emitted somewhere in src/ but listened nowhere in src/ (and vice versa)
//   data  : src/data/*.js modules that no file under src/ imports (unwired catalogs)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const mode = process.argv[2] || 'both';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (/node_modules|\.git$|vendor|third_party|dist|build$/.test(p)) continue;
      walk(p, out);
    } else if (/\.(mjs|js|cjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const srcFiles = walk(path.join(ROOT, 'src'));
const testFiles = fs.existsSync(path.join(ROOT, 'test')) ? walk(path.join(ROOT, 'test')) : [];
const scriptFiles = fs.existsSync(path.join(ROOT, 'scripts')) ? walk(path.join(ROOT, 'scripts')) : [];
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const EMIT_RE = /\.(?:emit|publish|dispatch)\(\s*['"`]([a-zA-Z0-9_-]+:[a-zA-Z0-9_:.-]+)['"`]/g;
const ON_RE = /\.(?:on|once|subscribe|addListener|listen)\(\s*['"`]([a-zA-Z0-9_-]+:[a-zA-Z0-9_:.-]+)['"`]/g;

function collect(files) {
  const emits = new Map();
  const listens = new Map();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(EMIT_RE)) {
        const k = m[1];
        if (!emits.has(k)) emits.set(k, []);
        emits.get(k).push(`${rel(f)}:${i + 1}`);
      }
      for (const m of line.matchAll(ON_RE)) {
        const k = m[1];
        if (!listens.has(k)) listens.set(k, []);
        listens.get(k).push(`${rel(f)}:${i + 1}`);
      }
    });
  }
  return { emits, listens };
}

if (mode === 'seams' || mode === 'both') {
  const src = collect(srcFiles);
  const tst = collect(testFiles.concat(scriptFiles));
  // Literal-mention check: an event name that appears in NO src file other than the ones that
  // emit it (or listen to it) is dead beyond doubt — constant-named wiring and bare on() calls
  // would still mention the literal somewhere.
  const srcText = new Map();
  for (const f of srcFiles) srcText.set(rel(f), fs.readFileSync(f, 'utf8'));
  const mentionFiles = (name) => {
    const out = [];
    for (const [f, text] of srcText) if (text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(`\`${name}\``)) out.push(f);
    return out;
  };
  const trulyDeadEmits = [];
  for (const [k, where] of src.emits) {
    if (src.listens.has(k)) continue;
    const emitterFiles = new Set(where.map((w) => w.split(':')[0]));
    const others = mentionFiles(k).filter((f) => !emitterFiles.has(f));
    if (others.length === 0) trulyDeadEmits.push({ k, where, testListens: (tst.listens.get(k) || []).length });
  }
  const trulyDeadListens = [];
  for (const [k, where] of src.listens) {
    if (src.emits.has(k)) continue;
    const listenerFiles = new Set(where.map((w) => w.split(':')[0]));
    const others = mentionFiles(k).filter((f) => !listenerFiles.has(f));
    if (others.length === 0) trulyDeadListens.push({ k, where, testEmits: (tst.emits.get(k) || []).length });
  }
  console.log(`# STRICT — emitted, and the literal appears in NO other src file (${trulyDeadEmits.length})`);
  for (const e of trulyDeadEmits.sort((a, b) => a.k.localeCompare(b.k))) {
    console.log(`- ${e.k}  [tests listening: ${e.testListens}]  ← ${e.where.slice(0, 2).join(', ')}`);
  }
  console.log(`\n# STRICT — listened, and the literal appears in NO other src file (${trulyDeadListens.length})`);
  for (const e of trulyDeadListens.sort((a, b) => a.k.localeCompare(b.k))) {
    console.log(`- ${e.k}  [tests emitting: ${e.testEmits}]  ← ${e.where.slice(0, 2).join(', ')}`);
  }
  console.log('');
  const emittedNoListener = [];
  for (const [k, where] of src.emits) {
    if (!src.listens.has(k)) {
      emittedNoListener.push({ k, where, testListens: (tst.listens.get(k) || []).length });
    }
  }
  const listenedNoEmitter = [];
  for (const [k, where] of src.listens) {
    if (!src.emits.has(k)) listenedNoEmitter.push({ k, where, testEmits: (tst.emits.get(k) || []).length });
  }
  emittedNoListener.sort((a, b) => a.k.localeCompare(b.k));
  listenedNoEmitter.sort((a, b) => a.k.localeCompare(b.k));
  console.log(`# SEAMS — ${src.emits.size} distinct events emitted in src/, ${src.listens.size} distinct listened`);
  console.log(`\n## Emitted in src/ with NO listener in src/ (${emittedNoListener.length})`);
  for (const e of emittedNoListener) {
    console.log(`- ${e.k}  [tests/scripts listening: ${e.testListens}]  ← ${e.where.slice(0, 3).join(', ')}${e.where.length > 3 ? ` (+${e.where.length - 3})` : ''}`);
  }
  console.log(`\n## Listened in src/ with NO emitter in src/ (${listenedNoEmitter.length})`);
  for (const e of listenedNoEmitter) {
    console.log(`- ${e.k}  [tests/scripts emitting: ${e.testEmits}]  ← ${e.where.slice(0, 3).join(', ')}${e.where.length > 3 ? ` (+${e.where.length - 3})` : ''}`);
  }
}

if (mode === 'data' || mode === 'both') {
  const dataDir = path.join(ROOT, 'src', 'data');
  const dataFiles = fs.readdirSync(dataDir).filter((n) => /\.js$/.test(n));
  const allText = new Map();
  for (const f of srcFiles) allText.set(f, fs.readFileSync(f, 'utf8'));
  const tstText = new Map();
  for (const f of testFiles.concat(scriptFiles)) tstText.set(f, fs.readFileSync(f, 'utf8'));
  console.log(`\n# DATA — src/data catalogs and their importers under src/`);
  const rows = [];
  for (const name of dataFiles) {
    const base = name.replace(/\.js$/, '');
    const needle = new RegExp(`data/${base}(?:\\.js)?['"\`]`);
    const importers = [];
    for (const [f, text] of allText) {
      if (f.endsWith(path.join('data', name))) continue;
      if (needle.test(text)) importers.push(rel(f));
    }
    let tstCount = 0;
    for (const [, text] of tstText) if (needle.test(text)) tstCount++;
    rows.push({ name, importers, tstCount });
  }
  rows.sort((a, b) => a.importers.length - b.importers.length || a.name.localeCompare(b.name));
  for (const r of rows) {
    if (r.importers.length <= 1) {
      console.log(`- src/data/${r.name}  importers=${r.importers.length}  tests/scripts=${r.tstCount}  ${r.importers.join(', ')}`);
    }
  }
}
