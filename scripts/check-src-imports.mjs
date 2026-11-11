#!/usr/bin/env node
// Source import lint.
//
// A sibling of check-src-syntax: that gate parses every module, but a specifier can be legal
// syntax and still brick the boot. src/core/newGamePlus.js shipped
// `import { pluralWord } from './/numberFormat.js'` (committed 448fef14e300, fixed 5cb38b86aedf):
// the dev server served the file, yet the browser kept the empty segment in the module's base
// URL, so numberFormat's own `../localization/sourceText.js` resolved to
// /src/core/localization/sourceText.js → 404 → "Failed to fetch dynamically imported module:
// /src/main.js" — every boot dead. A plain "does the file exist" scan cannot catch that:
// on-disk resolution normalizes `//` away.
//
// This script walks every src/**/*.js|.mjs module and fails when a relative specifier
//   1. does not start with './' or '../',
//   2. splits on '/' into an empty or '.' segment after the first, or contains '\', or
//   3. resolves verbatim to no existing file — browsers fetch the specifier exactly as
//      written, so nothing is appended (the real '.json' imports must stay legal).
// Bare specifiers (three, @elemaudio/*, node:*, event strings) are the importmap's job —
// sync-modulepreload.mjs guards that list — and non-literal import() arguments are ignored.
//
// Comments are stripped before scanning: a doc line like `... come from".` otherwise reads as
// `from "<prose>"` and fakes a specifier (a real hit that fired on src/core/livingHull.js).
// Quoted text inside real strings still scans — same posture as the sibling checks.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');

// from 'x' | import 'x' | import('x') | export * from 'x' — same pattern as
// check-src-reachability.mjs; a non-literal import() argument never matches.
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)['"]([^'"]+)['"]/g;
const RELATIVE_START = /^\.{1,2}\//;

const IDENT_CHAR = /[\w$]/;
// Tokens after which `/` opens a regex rather than dividing (the identifier-ish cases only;
// punctuation cases live in the char set inside stripComments).
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof',
  'do', 'else', 'yield', 'await', 'throw', 'extends',
]);

/**
 * Remove // and block comments without mangling the code around them. Strings and template
 * literal text are copied verbatim; ${ } regions inside a template drop back into code mode so
 * an import() written there is still seen. Regex literals are guessed from the previous
 * significant char/token — a misguess can hide a match but never invents one.
 */
export function stripComments(src) {
  const out = [];
  let state = 'code';
  let i = 0;
  const n = src.length;
  let depth = 0;             // {} depth inside a template ${ } region
  const tplReturn = [];      // depths where `}` returns to template text
  let inClass = false;       // [...] inside a regex literal
  let lastChar = '';         // last non-whitespace char emitted in code state
  let lastToken = '';        // last identifier-ish token emitted in code state
  const codeChar = (c) => {
    out.push(c);
    if (!/\s/.test(c)) {
      lastChar = c;
      lastToken = IDENT_CHAR.test(c) ? lastToken + c : '';
    }
  };
  const slashStartsRegex = () => {
    if (!lastChar) return true;
    if ('([{=,:;!&|?+-*~^<>%'.includes(lastChar)) return true;
    if (IDENT_CHAR.test(lastChar) || lastChar === ')' || lastChar === ']') {
      return REGEX_KEYWORDS.has(lastToken);
    }
    if (['\'', '"', '`', '/'].includes(lastChar)) return false; // right after a literal: division
    return true;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out.push(c); }
      i++;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { i += 2; state = 'code'; continue; }
      if (c === '\n') out.push(c);
      i++;
      continue;
    }
    if (state === 'sq' || state === 'dq' || state === 'tpl') {
      if (c === '\\') { out.push(c); if (d != null) out.push(d); i += 2; continue; }
      out.push(c);
      i++;
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"')
          || (state === 'tpl' && c === '`')) {
        state = 'code';
        lastChar = c;
        lastToken = '';
      } else if (state === 'tpl' && c === '$' && d === '{') {
        out.push(d);
        i++;
        tplReturn.push(depth);
        depth = 0;
        state = 'code';
        lastChar = '{';
        lastToken = '';
      }
      continue;
    }
    if (state === 'regex') {
      if (c === '\\') { out.push(c); if (d != null) out.push(d); i += 2; continue; }
      if (c === '\n') { state = 'code'; continue; } // a real regex cannot span lines
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { state = 'code'; lastChar = '/'; lastToken = ''; }
      out.push(c);
      i++;
      continue;
    }
    // code state
    if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
    if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
    if (c === "'") { state = 'sq'; out.push(c); i++; continue; }
    if (c === '"') { state = 'dq'; out.push(c); i++; continue; }
    if (c === '`') { state = 'tpl'; out.push(c); i++; continue; }
    if (c === '/' && slashStartsRegex()) { state = 'regex'; inClass = false; out.push(c); i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth > 0) depth--;
      else if (tplReturn.length) { depth = tplReturn.pop(); out.push(c); state = 'tpl'; i++; continue; }
    }
    codeChar(c);
    i++;
  }
  return out.join('');
}

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

/** Problems with the written form of a relative specifier; [] when canonical. */
export function canonicalProblems(spec) {
  const problems = [];
  if (!RELATIVE_START.test(spec)) {
    problems.push(`does not start with './' or '../'`);
  } else {
    for (const segment of spec.split('/').slice(1)) {
      if (segment === '') { problems.push(`empty path segment ('//')`); break; }
      if (segment === '.') { problems.push(`mid-path '.' segment`); break; }
    }
  }
  if (spec.includes('\\')) problems.push(`contains a backslash`);
  return problems;
}

/** Scan every module for relative specifiers that do not survive verbatim into a browser URL. */
export function findImportFailures(dir) {
  const failures = [];
  let specifierCount = 0;
  for (const file of listModuleFiles(dir)) {
    const src = stripComments(readFileSync(file, 'utf8'));
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // bare specifier — the importmap's job
      specifierCount++;
      const name = relative(ROOT, file);
      const problems = canonicalProblems(spec);
      if (problems.length) {
        failures.push({ file: name, specifier: spec,
          reason: `non-canonical specifier (${problems.join('; ')}) — the browser keeps it verbatim in the module base URL` });
        continue;
      }
      const target = resolve(dirname(file), spec);
      try {
        if (!statSync(target).isFile()) throw new Error('not a file');
      } catch {
        failures.push({ file: name, specifier: spec, reason: `no file at ${target}` });
      }
    }
  }
  return { failures, specifierCount };
}

function main(argv) {
  let dir = SRC;
  const rootIndex = argv.indexOf('--root');
  if (rootIndex !== -1) {
    if (!argv[rootIndex + 1]) {
      console.error('check-src-imports: --root needs a directory');
      return 2;
    }
    dir = resolve(argv[rootIndex + 1]);
    statSync(dir); // throws if missing — a mistyped root must not read as "all clean"
  }
  const { failures, specifierCount } = findImportFailures(dir);
  if (!failures.length) {
    console.log(`check-src-imports: OK — ${listModuleFiles(dir).length} modules, ${specifierCount} relative specifiers resolve`);
    return 0;
  }
  console.error(`check-src-imports: ${failures.length} relative import specifier(s) will not resolve in the browser:`);
  for (const f of failures) console.error(`  ${f.file} → '${f.specifier}'\n    ${f.reason}`);
  console.error('The browser fetches a specifier verbatim and keeps it in the module base URL — '
    + 'a specifier that only resolves on disk turns nested imports into 404s and the boot dies '
    + 'at "Failed to fetch dynamically imported module". The `.//numberFormat.js` form of this '
    + 'bricked every boot once already.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
