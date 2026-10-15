#!/usr/bin/env node
// Flatten the repo's text content into one LLM-consumable file.
//
//   node scripts/flatten-repo.mjs                    # preset=game -> .devshots/flatten/spaceface-game.txt
//   node scripts/flatten-repo.mjs --preset=dev       # game + scripts/test/tools/docs
//   node scripts/flatten-repo.mjs --preset=all       # every text file outside the policy ignore list
//   node scripts/flatten-repo.mjs --list             # sizes only, write nothing
//   node scripts/flatten-repo.mjs --stdout > x.txt   # stream instead of a file
//   extra: --out=<file> --include=<root> (repeatable) --exclude=<substr> (repeatable)
//          --max-kb=<n> --no-toc
//
// Every omission (binary, generated dump, over the size cap) is recorded in the
// export's OMITTED MANIFEST so a reader knows what exists but is not present.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function parseArgs(argv) {
  const flags = { include: [], exclude: [], preset: 'game', list: false, stdout: false, toc: true };
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw new Error(`unrecognized argument: ${arg}`);
    const [, key, raw] = m;
    const value = raw === undefined ? true : raw;
    if (key === 'include' || key === 'exclude') flags[key].push(String(value));
    else if (key === 'list' || key === 'stdout') flags[key] = value !== 'false';
    else if (key === 'toc') flags[key] = value !== 'false';
    else flags[key] = value;
  }
  if (!['game', 'dev', 'all'].includes(flags.preset)) {
    throw new Error(`--preset must be game | dev | all (got ${flags.preset})`);
  }
  flags.maxKb = flags['max-kb'] === undefined ? 2048 : Number(flags['max-kb']);
  if (!Number.isFinite(flags.maxKb) || flags.maxKb <= 0) throw new Error('--max-kb must be a positive number');
  return flags;
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.jsonc', '.md', '.mdx', '.txt', '.html',
  '.htm', '.css', '.scss', '.glsl', '.vert', '.frag', '.wgsl', '.svg', '.xml', '.yml', '.yaml',
  '.toml', '.ini', '.cfg', '.py', '.ps1', '.sh', '.bat', '.cmd', '.sql', '.csv', '.tsv',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.tga', '.psd', '.dds', '.ktx', '.ktx2',
  '.basis', '.hdr', '.exr', '.glb', '.gltf', '.obj', '.fbx', '.dae', '.blend', '.blend1', '.stl',
  '.mp3', '.ogg', '.wav', '.flac', '.m4a', '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.wasm', '.exe', '.dll', '.node', '.pdb', '.bin', '.dat', '.pak',
  '.zip', '.gz', '.bz2', '.7z', '.tar', '.rar', '.jar',
  '.pyc', '.pyd', '.so', '.dylib', '.class',
  '.pdf', '.docx', '.xlsx', '.pptx', '.db', '.sqlite', '.sqlite3',
  '.bak', '.locked', '.prev', '.rewrite', '.repair', '.pre_repair_bak', '.pyo',
]);

// Data dumps and lockfiles: exist in the tree but are noise for a code reader.
const SKIP_NAME_PATTERNS = [
  /(^|\/)[^/]*\.generated\.(js|json)$/,      // build outputs: *.generated.js / *.generated.json
  /(^|\/)modelTruthCensus\./,                // generated census + its json twin
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)[^/]*\.min\.js$/,
];

// Mesh/vertex dumps live under directories whose name ends in MeshData.
const SKIP_DIR_PATTERNS = [/(^|\/)[^/]*MeshData(\/|$)/, /(^|\/)densityVolumeData(\/|$)/];

// Directories never flattened under any preset (machine scratch, deps, exports).
const ALWAYS_SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.devshots', '.dev', '.tmp', '.campaign', '.worktrees',
  '.vesper-backups', '.cursor', '.serena', '.zcode', '.grok', '.codex', '.devin-tmp',
  '.spaceface-boot-backup', '.github', 'scratch', 'terminals', 'agent-tools', 'advisor-artifacts',
  '__pycache__', 'vendor', 'mcps', 'skills', 'user-content', '-', '.vscode',
]);

// Root-level scratch files (repo .gitignore policy: /.tmp*, %TEMP% droppings, nul).
const ROOT_FILE_SKIP = [/^\./, /^%TEMP%/, /^nul$/i, /^_/];

// Bulk evidence/history trees the repo's own .ignore policy keeps out of search.
const POLICY_SKIP_DIR_PATTERNS = [
  /(^|\/)receipts(\/|$)/,
  /(^|\/)evidence(\/|$)/,
  /(^|\/)artifacts(\/|$)/,
  /(^|\/)_ARCHIVE(\/|$)/,
  /(^|\/)_history(\/|$)/,
  /(^|\/)production(\/|$)/,
  /(^|\/)graphics-sprints(\/|$)/,
  /(^|\/)handoffs(\/|$)/,
];

const PRESETS = {
  game: { roots: ['src', 'styles', 'electron', 'schemas'], includeRootFiles: true },
  dev: {
    roots: ['src', 'styles', 'electron', 'schemas', 'scripts', 'test', 'tests', 'tools', 'docs'],
    includeRootFiles: true,
  },
  all: { roots: ['.'], includeRootFiles: true },
};

let maxKbValue = 2048;
const maxKbBytes = () => maxKbValue * 1024;

function* listDir(absDir, relBase) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield { rel, abs: path.join(absDir, entry.name), isDir: true };
    else if (entry.isFile()) yield { rel, abs: path.join(absDir, entry.name), isDir: false };
  }
}

function collectFiles(preset, extraIncludes, extraExcludes) {
  const spec = PRESETS[preset];
  const roots = [...spec.roots];
  for (const inc of extraIncludes) {
    const normalized = inc.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (normalized && !roots.includes(normalized)) roots.push(normalized);
  }

  const files = [];
  const skipReason = new Map();
  const markSkip = (rel, reason) => {
    if (!skipReason.has(rel)) skipReason.set(rel, reason);
  };

  const dirExcluded = (relDir) => {
    const top = relDir.split('/')[0];
    if (ALWAYS_SKIP_DIRS.has(top)) {
      markSkip(`${relDir}/`, 'scratch/deps/export directory');
      return true;
    }
    if (preset !== 'all' && !roots.includes(top)) {
      markSkip(`${relDir}/`, 'outside preset roots');
      return true;
    }
    for (const ex of extraExcludes) {
      if (relDir.includes(ex)) {
        markSkip(`${relDir}/`, `excluded by --exclude=${ex}`);
        return true;
      }
    }
    for (const pattern of POLICY_SKIP_DIR_PATTERNS) {
      if (pattern.test(relDir)) {
        markSkip(`${relDir}/`, 'policy skip (evidence/receipts/archive tree)');
        return true;
      }
    }
    for (const pattern of SKIP_DIR_PATTERNS) {
      if (pattern.test(`${relDir}/`)) {
        markSkip(`${relDir}/`, 'generated mesh/volume data directory');
        return true;
      }
    }
    return false;
  };

  const considerFile = (rel, abs) => {
    const name = rel.split('/').pop();
    const ext = path.extname(name).toLowerCase();
    if (preset !== 'all' && !rel.includes('/')) {
      if (ROOT_FILE_SKIP.some((p) => p.test(name))) {
        markSkip(rel, 'root scratch file');
        return;
      }
    }
    if (SKIP_NAME_PATTERNS.some((p) => p.test(rel))) {
      markSkip(rel, 'generated data dump / lockfile pattern');
      return;
    }
    if (BINARY_EXTENSIONS.has(ext)) {
      markSkip(rel, `binary/asset extension ${ext}`);
      return;
    }
    if (!TEXT_EXTENSIONS.has(ext)) {
      markSkip(rel, `unrecognized extension ${ext || '(none)'}`);
      return;
    }
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      markSkip(rel, 'stat failed');
      return;
    }
    if (stat.size > maxKbBytes()) {
      markSkip(rel, `size ${(stat.size / 1024).toFixed(0)} KB exceeds --max-kb=${maxKbValue}`);
      return;
    }
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      markSkip(rel, 'unreadable as text');
      return;
    }
    if (content.includes('\u0000')) {
      markSkip(rel, 'binary content (NUL byte)');
      return;
    }
    files.push({ rel, abs, size: stat.size, content });
  };

  const walkTree = (relBase, absDir) => {
    for (const entry of listDir(absDir, relBase)) {
      if (entry.isDir) {
        if (dirExcluded(entry.rel)) continue;
        walkTree(entry.rel, entry.abs);
        continue;
      }
      considerFile(entry.rel, entry.abs);
    }
  };

  if (preset === 'all') {
    walkTree('', REPO_ROOT);
  } else {
    for (const root of roots) {
      const absRoot = path.join(REPO_ROOT, root);
      if (!fs.existsSync(absRoot)) continue;
      walkTree(root, absRoot);
    }
    if (spec.includeRootFiles) {
      for (const entry of listDir(REPO_ROOT, '')) {
        if (!entry.isDir) considerFile(entry.rel, entry.abs);
      }
    }
  }

  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, skipReason };
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  maxKbValue = flags.maxKb;
  const { files, skipReason } = collectFiles(flags.preset, flags.include, flags.exclude);

  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const totalLines = files.reduce((s, f) => s + f.content.split('\n').length, 0);

  const byRoot = new Map();
  for (const f of files) {
    const root = f.rel.includes('/') ? f.rel.split('/')[0] : '(repo root)';
    const cur = byRoot.get(root) || { files: 0, bytes: 0 };
    cur.files += 1;
    cur.bytes += f.size;
    byRoot.set(root, cur);
  }

  console.log(`flatten-repo: preset=${flags.preset} max-kb=${flags.maxKb}`);
  for (const [root, s] of [...byRoot.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${root.padEnd(12)} ${String(s.files).padStart(5)} files  ${formatBytes(s.bytes).padStart(9)}`);
  }
  console.log(
    `  ${'TOTAL'.padEnd(12)} ${String(files.length).padStart(5)} files  ${formatBytes(totalBytes).padStart(9)}` +
      `  ~${totalLines.toLocaleString('en-US')} lines  ~${Math.round(totalBytes / 4).toLocaleString('en-US')} tokens (est. chars/4)`,
  );

  const skippedFiles = [...skipReason.entries()].filter(([rel]) => !rel.endsWith('/'));
  const skippedDirs = [...skipReason.entries()].filter(([rel]) => rel.endsWith('/'));
  console.log(`  omitted: ${skippedFiles.length} files, ${skippedDirs.length} directories (recorded in the export manifest)`);

  if (flags.list) {
    for (const [rel, reason] of skippedFiles.slice(0, 40)) console.log(`    SKIP ${rel} — ${reason}`);
    if (skippedFiles.length > 40) console.log(`    … and ${skippedFiles.length - 40} more`);
    return;
  }

  const chunks = [];
  chunks.push('# SpaceFace flattened repo export');
  chunks.push(`# preset=${flags.preset} maxKb=${flags.maxKb} files=${files.length} bytes=${totalBytes} lines=${totalLines}`);
  chunks.push(`# generated=${new Date().toISOString()}`);
  chunks.push('# Binary assets (GLB/PNG/audio under assets/, design media, captures) are excluded by policy.');
  if (flags.toc) {
    chunks.push('');
    chunks.push('## TABLE OF CONTENTS');
    for (const f of files) chunks.push(`- ${f.rel} (${formatBytes(f.size)})`);
  }
  for (const f of files) {
    const lines = f.content.split('\n').length;
    chunks.push('');
    chunks.push('='.repeat(100));
    chunks.push(`== FILE: ${f.rel}  (${formatBytes(f.size)}, ${lines} lines)`);
    chunks.push('='.repeat(100));
    chunks.push(`${f.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '')}\n`);
  }
  chunks.push('');
  chunks.push('='.repeat(100));
  chunks.push('== OMITTED MANIFEST (files present in the repo but not in this export)');
  chunks.push('='.repeat(100));
  for (const [rel, reason] of skippedFiles) chunks.push(`- ${rel} — ${reason}`);
  for (const [rel, reason] of skippedDirs) chunks.push(`- ${rel} — ${reason}`);
  const out = `${chunks.join('\n')}\n`;

  if (flags.stdout) {
    process.stdout.write(out);
    return;
  }
  const outFile = flags.out || path.join(REPO_ROOT, '.devshots', 'flatten', `spaceface-${flags.preset}.txt`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);
  console.log(`  wrote ${outFile} (${formatBytes(Buffer.byteLength(out))})`);
}

main();
