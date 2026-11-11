#!/usr/bin/env node
// One-shot codemod for the "counts and plurals" class (test/player-counts.test.mjs).
// Rewrites noun-plural glue to counted()/pluralWord() from src/core/numberFormat.js and inserts
// the import. Prints per-file change counts and any sites it refused to touch.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const HELPER = join(SRC, 'core', 'numberFormat.js');
const APPLY = process.argv.includes('--apply');

// Ternaries that pick state/idiom words, not noun plurals — left untouched and allowlisted in the lint.
const SKIP_ARMS = new Set([
  'down|up', 'pirate|civilian', 'economyContract|encounterAftermath', 'asteroid|wreck',
  'asteroid|debris', 'success|encore', 'triangle|square', 'hot|cold', 'inbound|outbound',
]);

function pluralOf(word, suffix) {
  if (/[bcdfghjklmnpqrstvwxz]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return word + suffix;
}

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'catalogs') continue;
      yield* jsFiles(path);
    } else if (/\.(js|mjs|cjs)$/.test(name) && !name.endsWith('.generated.js')) yield path;
  }
}

// `${X} word${X === 1 ? '' : 's'}` / !== 1 / > 1 variants — same expression on both sides.
const GLUE_A = /\$\{([^{}]+)\}\s*([A-Za-z][A-Za-z0-9 ]*?)\$\{\s*\1\s*===\s*1\s*\?\s*''\s*:\s*'(s|es|S|ES)'\s*\}/g;
const GLUE_B = /\$\{([^{}]+)\}\s*([A-Za-z][A-Za-z0-9 ]*?)\$\{\s*\1\s*(?:!==|!=|>)\s*1\s*\?\s*'(s|es|S|ES)'\s*:\s*''\s*\}/g;
// `word${X === 1 ? '' : 's'}` — bare template text glued to a suffix hole (number lives elsewhere).
const GLUE_C = /([A-Za-z][A-Za-z0-9 ]*)\$\{\s*([^{}]+?)\s*===\s*1\s*\?\s*''\s*:\s*'(s|es|S|ES)'\s*\}/g;
const GLUE_D = /([A-Za-z][A-Za-z0-9 ]*)\$\{\s*([^{}]+?)\s*(?:!==|!=|>)\s*1\s*\?\s*'(s|es|S|ES)'\s*:\s*''\s*\}/g;
// `${X === 1 ? 'word' : 'words'}` inside a template hole.
const TERNARY_TEMPLATE = /\$\{([^{}]*?)\s*={2,3}\s*1\s*\?\s*'([A-Za-z][A-Za-z ]*)'\s*:\s*'([A-Za-z][A-Za-z ]*)'\s*\}/g;
// `X === 1 ? 'word' : 'words'` in plain code (no template hole).
const TERNARY_PLAIN = /([\w.$[\]()]+)\s*={2,3}\s*1\s*\?\s*'([A-Za-z][A-Za-z-]*)'\s*:\s*'([A-Za-z][A-Za-z-]*)'/g;

const report = [];
for (const file of jsFiles(SRC)) {
  if (file === HELPER) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let text = readFileSync(file, 'utf8');
  let countedUsed = false;
  let pluralUsed = false;
  let n = 0;

  const glueSub = (re) => {
    text = text.replace(re, (m, x, word, suf) => {
      n += 1; countedUsed = true;
      const w = word.trim();
      return `\${counted(${x.trim()}, '${w}', '${pluralOf(w, suf)}')}`;
    });
  };
  glueSub(GLUE_A); glueSub(GLUE_B);
  const glueBare = (re) => {
    text = text.replace(re, (m, word, x, suf) => {
      n += 1; pluralUsed = true;
      const w = word.trim();
      return `\${pluralWord(${x.trim()}, '${w}', '${pluralOf(w, suf)}')}`;
    });
  };
  glueBare(GLUE_C); glueBare(GLUE_D);

  text = text.replace(TERNARY_TEMPLATE, (m, x, a, b) => {
    if (SKIP_ARMS.has(`${a}|${b}`)) return m;
    n += 1; pluralUsed = true;
    return `\${pluralWord(${x.trim()}, '${a}', '${b}')}`;
  });
  text = text.replace(TERNARY_PLAIN, (m, x, a, b) => {
    if (SKIP_ARMS.has(`${a}|${b}`)) return m;
    n += 1; pluralUsed = true;
    return `pluralWord(${x.trim()}, '${a}', '${b}')`;
  });

  if (n === 0) continue;
  const needed = [countedUsed && 'counted', pluralUsed && 'pluralWord'].filter(Boolean);
  const missing = needed.filter((name) => !new RegExp(`\\b${name}\\s*[(,}]|\\b${name}\\b.*from`).test(text) || !text.includes(`${name}`));
  const lacks = needed.filter((name) => !new RegExp(`(import[^;]*\\b${name}\\b[^;]*from|const[^;]*\\b${name}\\b[^;]*=)`).test(text));
  if (lacks.length) {
    const importPath = rel.startsWith('src/ui/')
      ? `${relative(dirname(file), join(SRC, 'ui')).replace(/\\/g, '/') || '.'}/numberFormat.js`.replace(/^\.\.\/numberFormat/, '../numberFormat')
      : `${relative(dirname(file), join(SRC, 'core')).replace(/\\/g, '/')}/numberFormat.js`;
    const imp = `import { ${lacks.join(', ')} } from '${importPath.startsWith('.') ? importPath : `./${importPath}`}';\n`;
    const importIdx = (() => {
      const matches = [...text.matchAll(/^import[^;]+;$/gm)];
      return matches.length ? matches[matches.length - 1].index + matches[matches.length - 1][0].length : 0;
    })();
    text = `${text.slice(0, importIdx)}${importIdx ? '\n' : ''}${imp}${text.slice(importIdx)}`;
  }
  report.push(`${rel}: ${n} sites${lacks.length ? ` (+import ${lacks.join(',')})` : ''}`);
  if (APPLY) writeFileSync(file, text);
}

console.log(report.join('\n'));
console.log(`\n${report.length} files, ${APPLY ? 'applied' : 'DRY-RUN — pass --apply to write'}`);
