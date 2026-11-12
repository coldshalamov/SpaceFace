#!/usr/bin/env node
// Source syntax gate.
//
// The game boots from the raw module graph: index.html modulepreloads ~2,100 src/ files and
// bootEntry imports src/main.js. A single malformed file — a truncated paste, a half-written
// agent edit, a stray artifact line — fails that import and the player gets "Startup could not
// finish" with a bare "Unexpected token" and no filename. On 2026-10-20 a truncated diff preview
// ("... [truncated for diff preview]") was written into the tail of src/render/vfx.js and bricked
// the whole game — twice in one day, because nothing parsed the tree.
//
// check-src-reachability.mjs regex-scans import statements but never asks V8 to parse the files,
// so this class of damage passed every gate. This script parses every src module with the real
// engine (vm.SourceTextModule — parse only, nothing executes) and names each file that fails.
//
// Requires --experimental-vm-modules (npm script check:src-syntax supplies it).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');

export function listModuleFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|mjs)$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Parse each module without executing it; return [{ file, error }] for files V8 rejects. */
export function findSyntaxFailures(dir) {
  const failures = [];
  for (const file of listModuleFiles(dir)) {
    try {
      new vm.SourceTextModule(readFileSync(file, 'utf8'), { identifier: file });
    } catch (error) {
      failures.push({ file: relative(ROOT, file), error: `${error.name}: ${error.message}` });
    }
  }
  return failures;
}

function main(argv) {
  if (typeof vm.SourceTextModule !== 'function') {
    console.error('check-src-syntax: vm.SourceTextModule unavailable — run with --experimental-vm-modules');
    return 2;
  }
  let dir = SRC;
  const rootIndex = argv.indexOf('--root');
  if (rootIndex !== -1) {
    if (!argv[rootIndex + 1]) {
      console.error('check-src-syntax: --root needs a directory');
      return 2;
    }
    dir = resolve(argv[rootIndex + 1]);
    statSync(dir); // throws if missing — a mistyped root must not read as "all clean"
  }
  const failures = findSyntaxFailures(dir);
  if (!failures.length) {
    console.log(`check-src-syntax: OK — ${listModuleFiles(dir).length} modules parse clean`);
    return 0;
  }
  console.error(`check-src-syntax: ${failures.length} module(s) fail to parse:`);
  for (const f of failures) console.error(`  ${f.file}\n    ${f.error}`);
  console.error('A module that cannot parse fails the boot import and shows the player '
    + '"Startup could not finish". Restore the file or finish the edit before landing.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
