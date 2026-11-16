#!/usr/bin/env node
// Evidence-based classification for `unused/unresolved` coverage records.
// Read-only analysis: resolves each coverage group against the release manifest,
// runtime package manifest, Ruckus mesh registry, parts manifest, render-package
// build inputs, the runtime import graph, and literal path scans of the code
// trees. Filename similarity is never treated as proof of use.
//
//   node scripts/fleet/identity-resolve.mjs [--json=<path>] [--md=<path>] [--quiet]
//
// Default outputs: .devshots/fleet/dispatch-20261116/identity-resolution.{json,md}

import { existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_PACKAGE_PILOTS } from '../../src/render/renderPackageManifest.js';
import { RUCKUS_MESH_ASSETS } from '../../src/render/characters/ruckusMeshData.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COVERAGE = 'design/program/fleet/graphics-asset-review/coverage-status.json';
const RELEASE_MANIFEST = 'assets/ships/release/release_manifest.json';
const PARTS_MANIFEST = 'assets/ships/parts/parts_manifest.json';
const PACKAGE_INPUTS_DIR = 'assets/ships/render-packages/inputs';
const FORGE_FLEET = 'tools/blender/forge/fleet.json';
const RUCKUS_MANIFEST = 'assets/characters/ruckus/manifest.json';
const OUT_DIR = '.devshots/fleet/dispatch-20261116';
const MODEL_EXT = /\.(?:glb|gltf|blend\d*|fbx|obj|dae|ply|stl|usd|usda|usdc|usdz|3ds|x3d|3mf)$/i;
const SCAN_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|json|html|css|py|yml|yaml|toml|sh|ps1|bat)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.cache', '.devshots', 'dist', 'build']);
const RUNTIME_ROOTS = ['src/ui/bootEntry.js', 'src/main.js', 'index.html', 'electron/main.cjs', 'electron/main.js', 'server.js'];
const STEM_RE = /(?:_|-)lod\d+$/i;
const PATH_TOKEN_RE = /((?:assets|third_party|vendor|tools|src)\/[A-Za-z0-9_\-./[\] ()%]+?\.(?:glb|gltf|blend\d*|fbx|obj|dae|ply|stl|usd|usda|usdc|usdz|3ds|x3d|3mf|json|png|jpe?g|webp|ktx2|bin|hdr|exr))/g;
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const rel = (abs) => relative(REPO, abs).replace(/\\/g, '/');
const abs = (p) => join(REPO, p);
const normRel = (p) => {
  const stack = [];
  for (const seg of p.split('/')) {
    if (seg === '..') stack.pop(); else if (seg && seg !== '.') stack.push(seg);
  }
  return stack.join('/');
};
const readJson = (p) => JSON.parse(readFileSync(abs(p), 'utf8'));
const stem = (p) => basename(p, extname(p)).replace(STEM_RE, '');

function walk(dir, test, out = []) {
  const absDir = abs(dir);
  if (!existsSync(absDir)) return out;
  const stack = [absDir];
  while (stack.length) {
    const current = stack.pop();
    for (const item of readdirSync(current, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (!SKIP_DIRS.has(item.name)) stack.push(join(current, item.name));
      } else if (item.isFile() && test.test(item.name)) {
        out.push(rel(join(current, item.name)));
      }
    }
  }
  return out;
}

function hashFile(path) {
  const fd = openSync(abs(path), 'r');
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    let count;
    while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

// ---------------------------------------------------------------- authorities

const release = readJson(RELEASE_MANIFEST);
const releaseByRelease = new Map(); // release path -> row
const releaseBySource = new Map();  // source path -> row
const knownHash = new Map();        // sha256 -> {path, authority}
for (const row of release.assets) {
  releaseByRelease.set(row.release, row);
  releaseBySource.set(row.source, row);
  if (row.sourceSha256) knownHash.set(row.sourceSha256, { path: row.source, authority: `release-manifest.source:${row.id}` });
  if (row.releaseSha256) knownHash.set(row.releaseSha256, { path: row.release, authority: `release-manifest.release:${row.id}` });
}

const pilotBySourceUrl = new Map(); // release GLB -> pilot
const pilotKeys = new Set();
for (const pilot of RENDER_PACKAGE_PILOTS) {
  pilotBySourceUrl.set(pilot.sourceUrl, pilot);
  pilotKeys.add(pilot.key);
  if (pilot.sourceSha256) knownHash.set(pilot.sourceSha256, { path: pilot.sourceUrl, authority: `render-package-pilot:${pilot.key}` });
}
const packagedRelease = new Set(pilotBySourceUrl.keys()); // release GLBs a runtime package consumes

const ruckusPaths = new Map(Object.entries(RUCKUS_MESH_ASSETS).map(([k, v]) => [v, `ruckus-mesh-registry:${k}`]));
if (existsSync(abs(RUCKUS_MANIFEST))) {
  const manifest = readJson(RUCKUS_MANIFEST);
  for (const value of JSON.stringify(manifest).match(/assets\/[A-Za-z0-9_\-./[\] ()%]+?\.glb/g) || []) {
    if (!ruckusPaths.has(value)) ruckusPaths.set(value, 'ruckus-manifest');
  }
}

const parts = readJson(PARTS_MANIFEST);
const partsFile = new Map(); // full path -> {kind:'part'|'runtimeSlot', id}
for (const part of parts.parts || []) {
  if (part.file) partsFile.set(`assets/ships/parts/${part.file}`, { kind: 'part', id: part.id });
}
for (const [slot, files] of Object.entries(parts.runtimeSlots || {})) {
  for (const file of files) {
    const path = `assets/ships/parts/${file}`;
    if (!partsFile.has(path) || partsFile.get(path).kind !== 'runtimeSlot') {
      partsFile.set(path, { kind: 'runtimeSlot', id: `runtimeSlot:${slot}` });
    }
  }
}

const packageInputs = new Map(); // normalized path -> {input, key}
if (existsSync(abs(PACKAGE_INPUTS_DIR))) {
  for (const name of readdirSync(abs(PACKAGE_INPUTS_DIR)).filter((n) => n.endsWith('.json'))) {
    const inputPath = `${PACKAGE_INPUTS_DIR}/${name}`;
    const doc = readJson(inputPath);
    const key = doc?.pilot?.key || name.replace(/\.json$/, '');
    for (const match of JSON.stringify(doc).matchAll(PATH_TOKEN_RE)) {
      if (!packageInputs.has(match[1])) packageInputs.set(match[1], { input: inputPath, key });
    }
    // Inputs also name release ids; map release row source/release for this key.
    const releaseId = doc?.pilot?.releaseAssetId || doc?.releaseRow?.id;
    const row = releaseId && release.assets.find((asset) => asset.id === releaseId);
    for (const p of [row?.source, row?.release].filter(Boolean)) {
      if (!packageInputs.has(p)) packageInputs.set(p, { input: inputPath, key });
    }
  }
}

const forgeFiles = new Map(); // assets/ships/forge/preview/<file>.glb and tools/blender/forge/ships/<ship>.py
if (existsSync(abs(FORGE_FLEET))) {
  const fleet = readJson(FORGE_FLEET);
  for (const [ship, row] of Object.entries(fleet.ships || {})) {
    forgeFiles.set(`tools/blender/forge/ships/${ship}.py`, `forge-fleet:${ship}`);
    if (row.file) forgeFiles.set(`assets/ships/forge/preview/${row.file}.glb`, `forge-fleet:${ship}->${row.file}`);
  }
}

// ------------------------------------------------------------- import graph

const SRC_FILES = new Set(walk('src', SCAN_EXT));
function resolveSpecifier(spec, importer) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = dirname(importer);
  const cands = [`${base}/${spec}`];
  const out = [];
  for (let cand of cands) {
    cand = cand.replace(/\\/g, '/');
    while (cand.includes('/./')) cand = cand.replace('/./', '/');
    const parts = cand.split('/');
    const stack = [];
    for (const seg of parts) {
      if (seg === '..') stack.pop(); else if (seg !== '.') stack.push(seg);
    }
    cand = stack.join('/');
    out.push(cand, `${cand}.js`, `${cand}.mjs`, `${cand}.json`, `${cand}/index.js`);
  }
  return out.find((p) => SRC_FILES.has(p)) || null;
}

const reachable = new Set();
{
  const queue = RUNTIME_ROOTS.filter((p) => existsSync(abs(p)) && p.startsWith('src/'));
  for (const entry of queue) reachable.add(entry);
  while (queue.length) {
    const file = queue.pop();
    let text;
    try { text = readFileSync(abs(file), 'utf8'); } catch { continue; }
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] || match[2];
      const target = spec && resolveSpecifier(spec, file);
      if (target && !reachable.has(target)) { reachable.add(target); queue.push(target); }
    }
  }
}

// ------------------------------------------------------------- literal scan

// token -> {runtime:Set<ref>, authoring:Set<ref>}
const tokenRefs = new Map();
const dirScan = new Map();   // repo dir -> Set<referrer> (build write/enumerate root)
const docRefs = new Map();   // token -> Set<doc file> (informational only)
const GENERIC_SCAN_DIRS = new Set(['assets', 'tools', 'src', 'scripts', 'test', 'tests', 'docs', 'design',
  'assets/ships', 'assets/models', 'assets/third_party', 'assets/works', 'assets/ships/parts', 'tools/blender']);
function addRef(token, referrer) {
  const norm = token.replace(/\\/g, '/').replace(/^\.\//, '');
  let entry = tokenRefs.get(norm);
  if (!entry) { entry = { runtime: new Set(), authoring: new Set() }; tokenRefs.set(norm, entry); }
  (reachable.has(referrer) || referrer === 'index.html' || /^electron\//.test(referrer) || referrer === 'server.js'
    ? entry.runtime : entry.authoring).add(referrer);
}
{
  const scanFiles = [...walk('src', SCAN_EXT), ...walk('scripts', SCAN_EXT), ...walk('tools', SCAN_EXT),
    ...walk('electron', SCAN_EXT), ...walk('test', SCAN_EXT), 'index.html', 'package.json', 'server.js']
    .filter((p) => existsSync(abs(p)));
  for (const file of scanFiles) {
    let text;
    try { text = readFileSync(abs(file), 'utf8'); } catch { continue; }
    for (const match of text.matchAll(PATH_TOKEN_RE)) addRef(match[1], file);
    // partsLibrary-style suffixes: quoted '<category>/<file>.glb' under PART_ROOT
    if (file === 'src/render/partsLibrary.js') {
      for (const match of text.matchAll(/['"]([a-z0-9_]+\/[a-z0-9_\-/]+?\.glb)['"]/gi)) {
        addRef(`assets/ships/parts/${match[1]}`, file);
      }
    }
  }
  // Path-chain resolution for Python/JS builders. Scripts construct paths as
  // `ROOT / "assets" / "works" / "kit"` or `os.path.join(ROOT, 'assets', ...)`;
  // f-string/dynamic filename segments mark a directory as a build write root,
  // and directories enumerated via glob/iterdir/listdir/walk are scan roots.
  const ROOT_IDENTS = new Set(['ROOT', 'REPO', 'REPO_ROOT', 'BASE', 'BASE_DIR', 'PROJECT_ROOT', 'REPOSITORY_ROOT', 'REPO_DIR', 'ROOT_DIR']);
  const SEG_RE = /^(?:f|fr|rf)?["'](.*)["']$/;
  const parseSeg = (s) => {
    const q = SEG_RE.exec(s.trim());
    return q ? { lit: q[1] } : /^[A-Za-z_]\w*$/.test(s.trim()) ? { ident: s.trim() } : null;
  };
  const CHAIN_RE = /(?:[A-Za-z_]\w*|"[^"\n]+"|'[^'\n]+'|f"[^"\n]*"|f'[^'\n]*')(?:\s*\/\s*(?:[A-Za-z_]\w*|"[^"\n]+"|'[^'\n]+'|f"[^"\n]*"|f'[^'\n]*'))+/g;
  const JOIN_RE = /(?:os\.path\.join|posixpath\.join|ntpath\.join|path\.join|Path|join|resolve)\(((?:[^()]|\([^()]*\))*)\)/g;
  // A join-arg segment may itself be dirname()/abspath()/Path()/x.parent — unwrap to
  // {lit}|{ident} plus a dirname depth to apply to the resolved base.
  const argSeg = (a) => {
    a = a.trim();
    let depth = 0;
    for (;;) {
      const pm = /\.(parents?)(?:\[(\d+)\])?\s*$/.exec(a);
      if (pm) { depth += pm[1] === 'parents' ? (parseInt(pm[2] || '0', 10) + 1) : 1; a = a.slice(0, pm.index); continue; }
      const rm = /\.(resolve|absolute|abspath|normpath|realpath)\s*\(\s*\)\s*$/.exec(a);
      if (rm) { a = a.slice(0, rm.index); continue; }
      break;
    }
    const dm = /^(?:os\.path\.)?dirname\((.*)\)$/.exec(a);
    if (dm) { const inner = argSeg(dm[1]); return inner ? { ...inner, depth: (inner.depth || 0) + 1 } : null; }
    const am = /^(?:os\.path\.)?(?:abspath|normpath|realpath)\((.*)\)$/.exec(a)
      || /^Path\((.*)\)$/.exec(a) || /^str\((.*)\)$/.exec(a);
    if (am) return argSeg(am[1]);
    if (/\(\s*.*,.*\)$/.test(a) || /\.\w+\s*\(/.test(a)) return null; // nested call — unresolvable
    const seg = parseSeg(a);
    return seg ? { ...seg, depth } : null;
  };
  const splitTopArgs = (s) => {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  };
  // Split a slash-chain on '/' separators that sit OUTSIDE string quotes —
  // plain split('/') would break quoted segments like 'source_assets/splitter_a6'.
  const splitChain = (s) => {
    const out = []; let cur = '', q = null;
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '/') { if (cur.trim()) out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  };
  const ASSIGN_RE = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/gm;
  const SCANNER_RE = /([A-Za-z_]\w*)\s*\.\s*(glob|rglob|iterdir)\s*\(\s*(?:(?:f|fr|rf)?["']([^"']*)["'])?|((?:os\.)?walk|listdir|scandir|readdirSync|readdir|opendir)\s*\(\s*([A-Za-z_]\w*)/g;
  const MODEL_GLOB_RE = /glb|gltf|blend|fbx|obj|dae|ply|stl|usd|3ds|x3d|3mf/i;

  function resolveSegs(segs, vars) {
    let bases = [''];
    let dynamic = false, partial = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!s) return null;
      if (s.lit !== undefined) {
        if (s.lit.includes('{') || s.lit.includes('${')) { dynamic = true; continue; }
        bases = bases.map((b) => `${b}${b ? '/' : ''}${s.lit}`);
      } else {
        const bound = vars.get(s.ident) || (ROOT_IDENTS.has(s.ident) ? new Set(['']) : null);
        if (!bound || !bound.size) {
          // Unresolvable segment: keep the resolved prefix as a partial dynamic path.
          return { paths: bases.filter(Boolean), dynamic: true, partial: true };
        }
        const next = [];
        for (const b of bases) for (const v of bound) next.push(`${b}${b ? '/' : ''}${v}`);
        bases = next;
      }
      for (let i = 0; i < (s.depth || 0); i++) bases = bases.map((b) => dirname(b));
    }
    return { paths: bases, dynamic, partial };
  }

  function exprPaths(expr, vars) {
    const out = [];
    for (const m of expr.matchAll(CHAIN_RE)) {
      const segs = splitChain(m[0]).map(parseSeg);
      const r = resolveSegs(segs, vars);
      if (r) for (const p of r.paths) out.push({ path: p, dynamic: r.dynamic, partial: r.partial });
    }
    for (const m of expr.matchAll(JOIN_RE)) {
      const segs = splitTopArgs(m[1]).map(argSeg);
      const r = resolveSegs(segs, vars);
      if (r) for (const p of r.paths) out.push({ path: p, dynamic: r.dynamic, partial: r.partial });
    }
    return out;
  }

  const REPO_PREFIX = /^(?:assets|third_party|vendor|tools|src|scripts|test|tests|docs|design|electron)\//;
  for (const file of scanFiles.filter((f) => /\.(?:py|mjs|js|cjs|ts)$/i.test(f))) {
    let text;
    try { text = readFileSync(abs(file), 'utf8'); } catch { continue; }
    const vars = new Map([['__file__', new Set([file])]]);
    // `NAME = ...__file__...` binds NAME to the script's directory (depth from
    // dirname(/.parent/.parents[N] on the right-hand side). Statement lists
    // joined by ';' are truncated so depth counts only the first statement.
    for (const sm of text.matchAll(/([A-Za-z_]\w*)\s*=\s*([^\n]*__file__[^\n]*)/g)) {
      const rhs = sm[2].split(';')[0];
      if (!rhs.includes('__file__')) continue;
      const depth = (rhs.match(/dirname\s*\(/g) || []).length
        + (rhs.match(/\.parent\b/g) || []).length
        + [...rhs.matchAll(/\.parents\[(\d+)\]/g)].reduce((s, m) => s + parseInt(m[1], 10) + 1, 0);
      let dir = file;
      for (let i = 0; i < depth; i++) dir = dirname(dir);
      vars.set(sm[1], new Set([dir]));
    }
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      // `a=1;b=2` on one line: evaluate each statement separately.
      const statements = [];
      for (const m of text.matchAll(ASSIGN_RE)) for (const stmt of m[0].split(';')) statements.push(stmt);
      for (const stmt of statements) {
        const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/.exec(stmt);
        if (!m) continue;
        const bound = vars.get(m[1]) || new Set();
        for (const { path: p } of exprPaths(m[2], vars)) {
          if (p && !bound.has(p)) { bound.add(p); changed = true; }
        }
        // `x = IDENT.parent` / `x = IDENT.parents[N]` / `x = dirname(IDENT)`
        const par = /^\s*([A-Za-z_]\w*)\s*\.\s*(parent|parents)\s*(?:\[(\d+)\])?\s*$/.exec(m[2])
          || /^(?:os\.path\.)?dirname\(\s*([A-Za-z_]\w*)\s*\)\s*$/.exec(m[2]);
        if (par) {
          const n = par[2] === 'parents' ? (parseInt(par[3] || '0', 10) + 1) : 1;
          for (const b of vars.get(par[1]) || []) {
            let d = b;
            for (let i = 0; i < n; i++) d = dirname(d);
            if (!bound.has(d)) { bound.add(d); changed = true; }
          }
        }
        // Ternary/fallback bindings: `x = cond ? A : B` or `x = f() or DEFAULT` —
        // bind x to any resolvable bare identifier on the right-hand side.
        for (const fm of m[2].matchAll(/(?:else|or|\?|:)\s+([A-Za-z_]\w*)\b/g)) {
          for (const p of vars.get(fm[1]) || []) if (!bound.has(p)) { bound.add(p); changed = true; }
        }
        const bare = /^\s*([A-Za-z_]\w*)\s*$/.exec(m[2]);
        if (bare) for (const p of vars.get(bare[1]) || []) if (!bound.has(p)) { bound.add(p); changed = true; }
        // `NAME = 'literal'` binds the string itself (filename/id constants used as path parts).
        const bareLit = SEG_RE.exec(m[2].trim());
        if (bareLit && !bound.has(bareLit[1])) { bound.add(bareLit[1]); changed = true; }
        if (bound.size) vars.set(m[1], bound);
      }
      if (!changed) break;
    }
    const found = exprPaths(text, vars);
    // Directory enumeration roots. Method globs count only when the pattern can
    // match model files; glob/iterdir/listdir are shallow, rglob/walk recursive.
    const markDir = (dir, referrer, recursive) => {
      const d = normRel(dir);
      if (!d || !REPO_PREFIX.test(d) || GENERIC_SCAN_DIRS.has(d)) return;
      const entry = dirScan.get(d) || { refs: new Set(), recursive: false };
      entry.refs.add(referrer);
      entry.recursive = entry.recursive || recursive;
      dirScan.set(d, entry);
    };
    for (const m of text.matchAll(SCANNER_RE)) {
      if (m[2]) { // VAR.glob/rglob/iterdir
        const method = m[2], pattern = m[3] ?? '*';
        if (method === 'iterdir' || MODEL_GLOB_RE.test(pattern) || /^\*\*?$/.test(pattern)) {
          const recursive = method === 'rglob' || pattern.includes('**');
          for (const dir of vars.get(m[1]) || []) markDir(dir, `${file} (${method} ${JSON.stringify(pattern)})`, recursive);
        }
      } else if (m[5]) { // walk/listdir/readdir(VAR)
        const recursive = /walk$/.test(m[4]);
        for (const dir of vars.get(m[5]) || []) markDir(dir, `${file} (${m[4]})`, recursive);
      }
    }
    for (const { path: p, dynamic, partial } of found) {
      const norm = normRel(p);
      if (!norm || !REPO_PREFIX.test(norm)) continue;
      if (MODEL_EXT.test(norm)) {
        addRef(norm, file);
      } else if (dynamic) {
        // Dynamic filename writes/reads under this dir make it a build pipeline root.
        // A partial (unresolved mid-chain) path could expand deeper — mark recursive.
        const dir = extname(norm) ? dirname(norm) : norm;
        markDir(dir, `${file} (dynamic write/read)`, partial);
      }
    }
  }

  // Documentation references (informational only — campaign rule: suggestions, not proof).
  for (const file of [...walk('docs', /\.(?:md|json)$/i), 'needed-assets.md', 'README.md', 'GOAL_PROMPT.txt']) {
    if (!existsSync(abs(file))) continue;
    let text;
    try { text = readFileSync(abs(file), 'utf8'); } catch { continue; }
    for (const match of text.matchAll(PATH_TOKEN_RE)) {
      const norm = match[1];
      const set = docRefs.get(norm) || new Set(); set.add(file); docRefs.set(norm, set);
    }
  }

  // In-tree JSON manifests (asset-bank sidecars, kitgen reports, manifests): strings that are
  // model filenames/subpaths resolve relative to the manifest's directory. These are
  // authoring-level references only — directory-scanned libraries, never shipped directly.
  for (const file of walk('assets', /\.json$/i)) {
    let doc;
    try { doc = JSON.parse(readFileSync(abs(file), 'utf8')); } catch { continue; }
    const dir = dirname(file);
    const seen = new Set();
    const visit = (value) => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(PATH_TOKEN_RE)) seen.add(match[1]);
        if (/^[A-Za-z0-9_\-./[\] ()%]+(?:\.(?:glb|gltf|blend\d*|fbx|obj|dae|ply|stl|usd|usda|usdc|usdz|3ds|x3d|3mf))$/i.test(value)
          && !value.startsWith('/') && !/^(?:assets|third_party|vendor|tools|src)\//.test(value)) {
          const resolved = `${dir}/${value}`.replace(/\\/g, '/');
          const stack = [];
          for (const seg of resolved.split('/')) {
            if (seg === '..') stack.pop(); else if (seg !== '.') stack.push(seg);
          }
          seen.add(stack.join('/'));
        }
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(doc);
    for (const token of seen) {
      const entry = tokenRefs.get(token) || { runtime: new Set(), authoring: new Set() };
      entry.authoring.add(file);
      tokenRefs.set(token, entry);
    }
  }
}

// --------------------------------------------------------------- candidates

const coverage = readJson(COVERAGE);
const unresolved = Object.entries(coverage.models).filter(([, m]) => m.status === 'unused/unresolved');

const hashCache = new Map();
const hashOf = (path) => {
  if (!hashCache.has(path)) {
    try { hashCache.set(path, existsSync(abs(path)) && statSync(abs(path)).isFile() ? hashFile(path) : null); }
    catch { hashCache.set(path, null); }
  }
  return hashCache.get(path);
};

// candidate file -> sibling alternate-format key (kit dirs like "GLB format", extracted/)
const altFormatKey = (p) => p
  .replace(/\/(?:extracted|selected_support|selected)\//g, '/')
  .replace(/\/(?:GLB|OBJ|FBX|DAE|glTF|gltf) format\//gi, '/')
  .replace(/\/(?:GLB|OBJ|FBX|DAE)(?:\/|$)/g, '/')
  .replace(MODEL_EXT, '').toLowerCase();

// Known-id stems for name-suggestion hints (never used for classification).
const knownStems = new Map();
const stemKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
for (const row of release.assets) {
  knownStems.set(stemKey(row.id), `release:${row.id}`);
  knownStems.set(stemKey(stem(row.source)), `release:${row.id}`);
}
for (const part of parts.parts || []) knownStems.set(stemKey(part.id), `part:${part.id}`);
for (const pilot of RENDER_PACKAGE_PILOTS) {
  knownStems.set(stemKey(pilot.runtimeAssetId), `pilot:${pilot.key}`);
  knownStems.set(stemKey(pilot.key), `pilot:${pilot.key}`);
}

const fileEvidence = new Map(); // path -> [{kind, refs[]|detail}]
function pushEvidence(path, kind, detail) {
  const list = fileEvidence.get(path) || [];
  list.push({ kind, detail });
  fileEvidence.set(path, list);
}
function fileBasis(path) {
  const ev = [];
  const refs = tokenRefs.get(path);
  if (releaseBySource.has(path)) {
    const row = releaseBySource.get(path);
    ev.push(packagedRelease.has(row.release)
      ? { kind: 'release-source-packaged', detail: `${RELEASE_MANIFEST}#${row.id} -> pilot:${pilotBySourceUrl.get(row.release).key}` }
      : { kind: 'release-source-unmapped', detail: `${RELEASE_MANIFEST}#${row.id} (release not packaged)` });
  }
  if (releaseByRelease.has(path)) {
    const row = releaseByRelease.get(path);
    ev.push(packagedRelease.has(path)
      ? { kind: 'release-artifact-packaged', detail: `pilot:${pilotBySourceUrl.get(path).key}` }
      : { kind: 'release-artifact-unmapped', detail: `${RELEASE_MANIFEST}#${row.id} (not consumed by a runtime package)` });
  }
  for (const pilot of RENDER_PACKAGE_PILOTS) {
    if (path === `assets/ships/release/render-packages/${pilot.key}/render.glb`
      || path === pilot.metadataUrl) {
      ev.push({ kind: 'runtime-package', detail: `renderPackageManifest.js pilot:${pilot.key}` });
    }
  }
  if (ruckusPaths.has(path)) ev.push({ kind: 'ruckus-registry', detail: ruckusPaths.get(path) });
  if (partsFile.has(path)) {
    const p = partsFile.get(path);
    ev.push({ kind: p.kind === 'runtimeSlot' ? 'parts-runtime-slot' : 'parts-manifest', detail: `${PARTS_MANIFEST}#${p.id}` });
  }
  if (packageInputs.has(path)) {
    const input = packageInputs.get(path);
    ev.push(pilotKeys.has(input.key)
      ? { kind: 'package-input-packaged', detail: `${input.input} -> pilot:${input.key}` }
      : { kind: 'package-input-unbuilt', detail: `${input.input} (key ${input.key} not in runtime manifest)` });
  }
  if (forgeFiles.has(path)) ev.push({ kind: 'forge-registry', detail: `${FORGE_FLEET}#${forgeFiles.get(path)}` });
  if (refs) {
    if (refs.runtime.size) ev.push({ kind: 'runtime-src-reference', detail: [...refs.runtime].slice(0, 8).join(', ') });
    if (refs.authoring.size) ev.push({ kind: 'authoring-reference', detail: [...refs.authoring].slice(0, 8).join(', ') });
  }
  const sha = hashOf(path);
  if (sha && knownHash.has(sha) && knownHash.get(sha).path !== path) {
    ev.push({ kind: 'byte-identical', detail: `${knownHash.get(sha).authority} bytes at ${knownHash.get(sha).path}` });
  }
  // Build-pipeline directory roots: a script writes into or enumerates the file's dir.
  if (MODEL_EXT.test(path)) {
    const parent = dirname(path);
    let dir = parent;
    while (dir && dir !== '.' && !GENERIC_SCAN_DIRS.has(dir) && dir.split('/').length >= 3) {
      const scan = dirScan.get(dir);
      if (scan && (scan.recursive || dir === parent)) {
        ev.push({ kind: 'authoring-dir-scan', detail: [...scan.refs].slice(0, 4).join('; ') });
        break;
      }
      const next = dirname(dir);
      if (next === dir) break;
      dir = next;
    }
  }
  if (docRefs.has(path)) {
    ev.push({ kind: 'doc-reference', detail: [...docRefs.get(path)].slice(0, 4).join(', ') });
  }
  if (!ev.length && knownStems.has(stem(path).toLowerCase().replace(/[^a-z0-9]+/g, '_'))) {
    ev.push({ kind: 'name-suggestion', detail: `stem matches known id ${knownStems.get(stem(path).toLowerCase().replace(/[^a-z0-9]+/g, '_'))} (filename similarity only — unverified)` });
  }
  if (path.startsWith('src/')) {
    ev.push(existsSync(abs(path))
      ? reachable.has(path)
        ? { kind: 'src-module-reachable', detail: `imported in runtime graph from ${RUNTIME_ROOTS.join(', ')}` }
        : { kind: 'src-module-unreachable', detail: 'exists but not reachable from runtime entry imports' }
      : { kind: 'src-module-missing', detail: 'builder file missing on disk' });
  }
  return ev;
}

// precompute per-file evidence for every path named by an unresolved record
const candidatePaths = new Set();
for (const [, model] of unresolved) for (const v of model.version || []) if (v.path) candidatePaths.add(v.path);
for (const path of candidatePaths) fileEvidence.set(path, fileBasis(path));

// alternate-format kit duplicates: share altFormatKey with a runtime/authoring-evidenced file
{
  const byKey = new Map();
  for (const path of candidatePaths) {
    if (!MODEL_EXT.test(path)) continue;
    const key = altFormatKey(path);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(path);
  }
  // also index known referenced paths so candidates can match shipped/used siblings
  const knownFiles = new Set([...releaseByRelease.keys(), ...releaseBySource.keys(),
    ...ruckusPaths.keys(), ...partsFile.keys(), ...tokenRefs.keys()].filter((p) => MODEL_EXT.test(p)));
  const knownByKey = new Map();
  for (const path of knownFiles) {
    const key = altFormatKey(path);
    if (!knownByKey.has(key)) knownByKey.set(key, path);
  }
  for (const [key, paths] of byKey) {
    const donor = knownByKey.get(key);
    for (const path of paths) {
      const ev = fileEvidence.get(path) || [];
      if (donor && donor !== path && !ev.some((e) => e.kind === 'byte-identical' || e.kind === 'alt-format-sibling')) {
        pushEvidence(path, 'alt-format-sibling', `same normalized kit model key as ${donor}`);
      }
    }
  }
}

// ---------------------------------------------------------------- classify

const RUNTIME_KINDS = new Set(['release-source-packaged', 'release-artifact-packaged', 'runtime-package',
  'ruckus-registry', 'parts-runtime-slot', 'package-input-packaged', 'runtime-src-reference', 'src-module-reachable']);
const AUTHORING_KINDS = new Set(['release-source-unmapped', 'parts-manifest',
  'package-input-unbuilt', 'forge-registry', 'authoring-reference', 'authoring-dir-scan', 'src-module-unreachable']);
const DUP_KINDS = new Set(['byte-identical', 'alt-format-sibling']);

function classifyFile(path, role) {
  const ev = fileEvidence.get(path) || [];
  const kinds = new Set(ev.map((e) => e.kind));
  for (const k of kinds) if (RUNTIME_KINDS.has(k)) return { cls: 'runtime-reachable', ev };
  // byte-identical matches a release-manifest/pilot hash — the file's exact
  // bytes are a listed model, so it outranks "never shipped" authoring refs.
  if (kinds.has('byte-identical')) return { cls: 'duplicate-of', ev };
  for (const k of kinds) if (AUTHORING_KINDS.has(k)) return { cls: 'authoring-only', ev };
  if (kinds.has('alt-format-sibling')) return { cls: 'duplicate-of', ev };
  return { cls: 'ambiguous', ev };
}

const groups = [];
for (const [id, model] of unresolved) {
  const versions = model.version || [];
  const perFile = versions.map((v) => ({ path: v.path, role: v.role, ...classifyFile(v.path, v.role),
    exists: existsSync(abs(v.path)) }));
  const order = { 'runtime-reachable': 0, 'authoring-only': 1, 'duplicate-of': 2, ambiguous: 3 };
  let cls = 'ambiguous';
  if (perFile.length) cls = perFile.map((f) => f.cls).sort((a, b) => order[a] - order[b])[0];

  const evidence = new Set();
  for (const f of perFile) {
    for (const e of f.ev) {
      if (e.kind === 'runtime-src-reference' || e.kind === 'authoring-reference') {
        for (const refPath of e.detail.split(', ')) evidence.add(refPath);
      } else evidence.add(e.detail.split(' -> ')[0]);
    }
  }
  const strongest = perFile.find((f) => f.cls === cls);
  const notes = [];
  if (cls === 'runtime-reachable') {
    const kinds = [...new Set((strongest?.ev || []).filter((e) => RUNTIME_KINDS.has(e.kind)).map((e) => e.kind))];
    notes.push(`Reachable via ${kinds.join(', ')}; promote candidate for review.`);
  } else if (cls === 'authoring-only') {
    const kinds = [...new Set((strongest?.ev || []).filter((e) => AUTHORING_KINDS.has(e.kind)).map((e) => e.kind))];
    notes.push(`Referenced only by authoring/build path (${kinds.join(', ')}); no shipped-form evidence.`);
  } else if (cls === 'duplicate-of') {
    const dup = (strongest?.ev || []).find((e) => DUP_KINDS.has(e.kind));
    notes.push(`Duplicate: ${dup?.detail || 'matched file bytes'}.`);
  } else {
    const unmapped = perFile.flatMap((f) => f.ev).find((e) => e.kind === 'release-artifact-unmapped');
    notes.push(unmapped
      ? 'Present in the release manifest but no runtime package consumes it; authored and shipped forms unresolved.'
      : 'No path reference found in manifests, build inputs, runtime imports, or scanned code.');
  }
  if (id.startsWith('procedural:')) notes.push('Procedural/code-native group; individual model identities still need expansion.');
  if (perFile.some((f) => !f.exists)) notes.push(`Missing on disk: ${perFile.filter((f) => !f.exists).map((f) => f.path).join(', ')}`);
  const mixed = new Set(perFile.map((f) => f.cls));
  if (mixed.size > 1) notes.push(`Mixed group: ${[...mixed].map((c) => `${c} x${perFile.filter((f) => f.cls === c).length}`).join(', ')}.`);
  groups.push({ id, classification: cls, evidence: [...evidence].slice(0, 12), note: notes.join(' '),
    files: perFile.map((f) => ({ path: f.path, role: f.role, classification: f.cls, exists: f.exists,
      basis: f.ev.map((e) => `${e.kind}: ${e.detail}`) })) });
}

const byCls = {};
for (const g of groups) byCls[g.classification] = (byCls[g.classification] || 0) + 1;
const byPrefix = {};
for (const g of groups) {
  const p = g.id.startsWith('source-candidate:') ? 'source-candidate' : g.id.split(':')[0];
  (byPrefix[p] ||= {});
  byPrefix[p][g.classification] = (byPrefix[p][g.classification] || 0) + 1;
}
const byRoot = {};
for (const g of groups) {
  const firstPath = g.files[0]?.path || '';
  const root = (firstPath || g.id).split('/').slice(0, firstPath.startsWith('assets/') ? 3 : 2).join('/');
  (byRoot[root] ||= {});
  byRoot[root][g.classification] = (byRoot[root][g.classification] || 0) + 1;
}

const output = {
  schema: 'spaceface.identityResolution.v1',
  generatedAt: new Date().toISOString(),
  note: 'Analysis only: classifies `unused/unresolved` coverage records by traced evidence. runtime-reachable = cited by a manifest/build input/import graph reaching shipped forms; authoring-only = referenced but never shipped; duplicate-of = byte-identical or alternate-format sibling of a linked file; ambiguous = unproven. Does not modify coverage-status.json and authorizes no deletion.',
  basis: { coverage: COVERAGE, releaseManifest: RELEASE_MANIFEST, runtimeManifest: 'src/render/renderPackageManifest.js',
    ruckusRegistry: 'src/render/characters/ruckusMeshData.js', partsManifest: PARTS_MANIFEST,
    packageInputs: PACKAGE_INPUTS_DIR, forgeFleet: FORGE_FLEET,
    importRoots: RUNTIME_ROOTS.filter((p) => existsSync(abs(p))),
    scannedRoots: ['src', 'scripts', 'tools', 'electron', 'test', 'index.html', 'package.json', 'server.js'] },
  totals: {
    records: unresolved.length,
    resolved: groups.filter((g) => g.classification !== 'ambiguous').length,
    unresolvedAmbiguous: byCls.ambiguous || 0,
    byClassification: byCls,
    byPrefix,
    reachableSrcModules: reachable.size,
    scannedPathTokens: tokenRefs.size,
    buildPipelineDirs: dirScan.size,
    docRefTokens: docRefs.size,
  },
  groups,
};

// ------------------------------------------------------------- markdown out

function md() {
  const lines = [];
  lines.push('# Identity resolution — unused/unresolved coverage records', '');
  lines.push(`Generated ${output.generatedAt} by \`scripts/fleet/identity-resolve.mjs\`. Analysis only; no ledger changes.`, '');
  lines.push('## Totals', '');
  lines.push(`- Records analyzed: **${output.totals.records}**`);
  for (const [cls, n] of Object.entries(byCls).sort((a, b) => b[1] - a[1])) lines.push(`- ${cls}: **${n}**`);
  lines.push(`- Resolved (non-ambiguous): **${output.totals.resolved}**`, '');
  lines.push('## By record prefix', '');
  lines.push('| prefix | runtime-reachable | authoring-only | duplicate-of | ambiguous |', '|---|---|---|---|---|');
  for (const [p, row] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${p} | ${row['runtime-reachable'] || 0} | ${row['authoring-only'] || 0} | ${row['duplicate-of'] || 0} | ${row.ambiguous || 0} |`);
  }
  lines.push('', '## By top-level directory', '');
  lines.push('| root | runtime-reachable | authoring-only | duplicate-of | ambiguous | total |', '|---|---|---|---|---|---|');
  for (const [r, row] of Object.entries(byRoot).sort((a, b) => (Object.values(b[1]).reduce((s, n) => s + n, 0)) - (Object.values(a[1]).reduce((s, n) => s + n, 0))).slice(0, 40)) {
    const t = Object.values(row).reduce((s, n) => s + n, 0);
    lines.push(`| ${r} | ${row['runtime-reachable'] || 0} | ${row['authoring-only'] || 0} | ${row['duplicate-of'] || 0} | ${row.ambiguous || 0} | ${t} |`);
  }
  lines.push('', '## Most consequential findings', '');
  const reach = groups.filter((g) => g.classification === 'runtime-reachable');
  const dups = groups.filter((g) => g.classification === 'duplicate-of');
  lines.push(`### Runtime-reachable groups (${reach.length}) — candidates to promote to pending review`, '');
  for (const g of reach.slice(0, 60)) lines.push(`- \`${g.id}\` — ${g.evidence.slice(0, 3).join('; ')}`);
  if (reach.length > 60) lines.push(`- … ${reach.length - 60} more in JSON`);
  lines.push('', `### Duplicate groups (${dups.length})`, '');
  for (const g of dups.slice(0, 60)) lines.push(`- \`${g.id}\` — ${g.note}`);
  if (dups.length > 60) lines.push(`- … ${dups.length - 60} more in JSON`);
  const amb = groups.filter((g) => g.classification === 'ambiguous');
  lines.push('', `### Ambiguous (${amb.length})`, '');
  const ambRoots = {};
  for (const g of amb) { const r = (g.files[0]?.path || g.id).split('/').slice(0, 4).join('/'); ambRoots[r] = (ambRoots[r] || 0) + 1; }
  for (const [r, n] of Object.entries(ambRoots).sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`- ${r}: ${n}`);
  return `${lines.join('\n')}\n`;
}

const jsonPath = process.argv.find((a) => a.startsWith('--json='))?.slice(7) || `${OUT_DIR}/identity-resolution.json`;
const mdPath = process.argv.find((a) => a.startsWith('--md='))?.slice(5) || `${OUT_DIR}/identity-resolution.md`;
mkdirSync(abs(dirname(jsonPath)), { recursive: true });
mkdirSync(abs(dirname(mdPath)), { recursive: true });
writeFileSync(abs(jsonPath), `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(abs(mdPath), md());
if (!process.argv.includes('--quiet')) {
  console.log(JSON.stringify({ json: jsonPath, md: mdPath, totals: output.totals }, null, 2));
}
