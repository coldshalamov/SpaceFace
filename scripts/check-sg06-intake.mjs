import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const REQUIRED_MODULES = Object.freeze([
  'src/ai/contracts.js',
  'src/ai/director.js',
  'src/ai/inspection.js',
  'src/ai/maneuver.js',
  'src/ai/perception.js',
  'src/ai/shipDecision.js',
  'src/ai/sg03ActionPort.js',
  'src/ai/squad.js',
  'src/ai/stack.js',
  'src/ai/trace.js',
]);

const REQUIRED_FULL_HANDOFF = Object.freeze([
  'docs/handoffs/SG-06_LAYERED_AI_HANDOFF.md',
  'third_party/reference-ledger-sg06.yml',
  'scripts/check-sg06-layered-ai.mjs',
  'scripts/check-sg06-action-port.mjs',
  'scripts/check-sg06-seed-suite.mjs',
]);

const PRODUCTION_CLAIM_MARKERS = Object.freeze([
  'src/ai/index.js',
  'src/systems/tacticalAI.js',
  'docs/handoffs/SG-06_LAYERED_AI_HANDOFF.md',
]);

const packageJson = json('package.json');
const scripts = packageJson.scripts || {};

assert(exists('docs/handoffs/SG-06_LAYERED_AI_INTAKE.md'), 'SG-06 intake guard requires docs/handoffs/SG-06_LAYERED_AI_INTAKE.md');
const intake = read('docs/handoffs/SG-06_LAYERED_AI_INTAKE.md');
assert(intake.includes('c543cfb'), 'SG-06 intake doc must record the latest inspected remote SHA');
assert(intake.includes('Not accepted'), 'SG-06 intake doc must clearly mark the current artifact as not accepted');
assert(scripts['check:sg06:intake'], 'package.json must expose check:sg06:intake');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:intake'),
  'package.json check:sg06 must include the SG-06 intake guard');

const hasProductionClaim = PRODUCTION_CLAIM_MARKERS.some(exists) || systemImportsSg06();

if (exists('src/ai/index.js')) {
  assertNoDanglingExports('src/ai/index.js');
  for (const rel of REQUIRED_MODULES) assert(exists(rel), `SG-06 production AI export requires ${rel}`);
}

if (hasProductionClaim) {
  for (const rel of REQUIRED_FULL_HANDOFF) {
    assert(exists(rel), `SG-06 production landing requires ${rel}`);
  }
  assert(hasFixtureFiles('test/sg06'), 'SG-06 production landing requires at least one test/sg06 fixture');
  assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check-sg06-layered-ai'),
    'SG-06 production landing requires check:sg06 to run the layered AI acceptance suite');
  assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check-sg06-action-port'),
    'SG-06 production landing requires check:sg06 to prove SG-03 ActionDef parity');
  assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check-sg06-seed-suite'),
    'SG-06 production landing requires check:sg06 to run the seeded tactics suite');
  assertAiActionPort();
  assertNoPrivilegedAiMutation();
}

console.log('SG-06 intake checks OK');

function assertNoDanglingExports(rel) {
  for (const specifier of exportSpecifiers(read(rel))) {
    const target = `src/ai/${specifier}.js`;
    assert(exists(target), `${rel} re-exports missing module ${target}`);
  }
}

function exportSpecifiers(source) {
  const out = [];
  const re = /export\s+\*\s+from\s+['"]\.\/([^'"]+)\.js['"]/g;
  let match;
  while ((match = re.exec(source))) out.push(match[1]);
  return out;
}

function systemImportsSg06() {
  for (const rel of ['src/systems/ai.js', 'src/systems/tacticalAI.js']) {
    if (!exists(rel)) continue;
    const text = read(rel);
    if (text.includes('../ai/') || text.includes("from './tacticalAI") || text.includes('TacticalAIStack')) return true;
  }
  return false;
}

function assertAiActionPort() {
  const rel = 'src/ai/sg03ActionPort.js';
  assert(exists(rel), 'SG-06 production landing requires src/ai/sg03ActionPort.js');
  const text = read(rel);
  assert(text.includes('requestAction'), 'SG-06 ActionDef port must submit through the SG-03 requestAction path');
  assert(text.includes('source') && text.includes('ai'), 'SG-06 ActionDef port must stamp source.kind=ai trace metadata');
}

function assertNoPrivilegedAiMutation() {
  for (const rel of existingFiles(['src/ai', 'src/systems/tacticalAI.js'])) {
    const text = stripComments(read(rel));
    assert(!/\brouteDamage\s*\(/.test(text), `${rel} must not call combat damage routing directly`);
    assert(!/\.hp\s*(?:=|\+=|-=|--|\+\+)/.test(text), `${rel} must not mutate HP directly`);
    assert(!/\bintent\s*\.\s*(?:fire|fireGroup)\s*=/.test(text), `${rel} must not use legacy intent fire shortcuts`);
    assert(!/\bstate\s*\.\s*player\b/.test(text), `${rel} must not read hidden player state directly`);
  }
}

function existingFiles(relOrFiles) {
  const roots = Array.isArray(relOrFiles) ? relOrFiles : [relOrFiles];
  const out = [];
  for (const rel of roots) {
    if (!exists(rel)) continue;
    if (!isDirectory(rel)) out.push(rel);
    else walk(rel, (file) => {
      if (file.endsWith('.js') || file.endsWith('.mjs')) out.push(file);
    });
  }
  return out;
}

function hasFixtureFiles(rel) {
  if (!exists(rel) || !isDirectory(rel)) return false;
  return readdirSync(abs(rel), { withFileTypes: true }).some((entry) => entry.isFile());
}

function walk(rel, visit) {
  for (const entry of readdirSync(abs(rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(child, visit);
    else visit(child);
  }
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function json(rel) {
  return JSON.parse(read(rel));
}

function read(rel) {
  return readFileSync(abs(rel), 'utf8');
}

function exists(rel) {
  return existsSync(abs(rel));
}

function isDirectory(rel) {
  try {
    return readdirSync(abs(rel), { withFileTypes: true }) && true;
  } catch (_) {
    return false;
  }
}

function abs(rel) {
  return resolve(ROOT, rel);
}
