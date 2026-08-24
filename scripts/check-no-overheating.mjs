#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as babelParser from '@babel/parser';

const ROOTS = ['src', 'test', 'styles'];
const EXTRA = ['index.html', 'package.json'];
const TEXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|html|css|json)$/i;
const OWNED = /overheat|overheated|weaponHeat|weapon_?heat|heatPerShot|heatCapacity|heatLimit|heatMax|maxHeat|coolRate|venting|vented|ventCooldown|thermalSink|miningHeat|beamHeat|drillHeat/i;
const USER_COPY = /overheat|overheated|vent(?:ing|ed)?|thermal sink|weapon heat|mining beam heat|drill heat/i;
const ENVIRONMENTAL = /heatZone|reentry|re-entry|atmospher|thermalDamage|heatHaze|heatSignature|temperature|exhaust|enginePlume/i;
const SELF = new Set([
  'scripts/audit-overheating-removal.mjs',
  'scripts/remove-overheating-systems.mjs',
  'scripts/check-no-overheating.mjs',
]);

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const path = join(dir, name).replaceAll('\\', '/');
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (TEXT.test(name)) out.push(path);
  }
  return out;
}

function parse(source) {
  return babelParser.parse(source, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    plugins: [
      'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods',
      'dynamicImport', 'importMeta', 'optionalChaining', 'nullishCoalescingOperator',
      'topLevelAwait', 'objectRestSpread', 'numericSeparator', 'logicalAssignment',
    ],
  });
}

function scanAst(node, path, findings) {
  if (!node || typeof node !== 'object') return;
  const values = [];
  if (node.type === 'Identifier') values.push(node.name);
  if (typeof node.value === 'string') values.push(node.value);
  if (typeof node.raw === 'string') values.push(node.raw);
  if (node.type === 'TemplateElement') values.push(node.value?.raw, node.value?.cooked);
  for (const value of values.filter(Boolean)) {
    if ((OWNED.test(value) || USER_COPY.test(value)) && !ENVIRONMENTAL.test(value)) {
      findings.push({ path, type: node.type, value: String(value).slice(0, 240), line: node.loc?.start?.line || null });
    }
  }
  if (Array.isArray(node.comments)) {
    for (const comment of node.comments) {
      const value = String(comment.value || '');
      if ((OWNED.test(value) || USER_COPY.test(value)) && !ENVIRONMENTAL.test(value)) {
        findings.push({ path, type: 'Comment', value: value.slice(0, 240), line: comment.loc?.start?.line || null });
      }
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'comments') continue;
    if (Array.isArray(value)) for (const child of value) scanAst(child, path, findings);
    else if (value && typeof value === 'object') scanAst(value, path, findings);
  }
}

const files = [...ROOTS.flatMap((root) => walk(root)), ...EXTRA.filter(existsSync)]
  .filter((path) => !SELF.has(path));
const findings = [];
for (const path of files) {
  const source = readFileSync(path, 'utf8');
  if (/\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(path)) {
    try { scanAst(parse(source), path, findings); }
    catch (error) { findings.push({ path, type: 'ParseError', value: error.message, line: null }); }
  } else {
    source.split(/\r?\n/).forEach((line, index) => {
      if ((OWNED.test(line) || USER_COPY.test(line)) && !ENVIRONMENTAL.test(line)) {
        findings.push({ path, type: 'Text', value: line.trim().slice(0, 240), line: index + 1 });
      }
    });
  }
}

if (findings.length) {
  console.error(`FAIL — ${findings.length} active overheating reference(s) remain.`);
  for (const row of findings.slice(0, 80)) {
    console.error(`  ${row.path}${row.line ? `:${row.line}` : ''} [${row.type}] ${row.value}`);
  }
  process.exit(1);
}
console.log('No active weapon, mining-beam, or drill overheating references remain. Environmental heat owners are intact.');
