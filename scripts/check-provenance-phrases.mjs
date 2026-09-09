import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAUSES_WITHOUT_REP,
  REASON_TO_CAUSE,
  REP_REASON_LABELS,
} from '../src/data/repReasons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'src');
const SYSTEMS_DIR = path.join(SRC_DIR, 'systems');
const LAW_SECURITY_FILE = path.join(SYSTEMS_DIR, 'lawSecurity.js');
const FACTIONS_FILE = path.join(SYSTEMS_DIR, 'factions.js');

testApplyRepReasonsHaveLabels();
testLabelsAreProducible();
testLawReceiptCausesArePinned();

console.log('Provenance phrase checks OK');

function testApplyRepReasonsHaveLabels() {
  const labels = new Set(Object.keys(REP_REASON_LABELS));
  const applyReasons = collectApplyRepReasonCalls();
  assert.ok(applyReasons.length >= 8,
    `expected real applyRep coverage under src/systems (got ${applyReasons.length})`);
  for (const entry of applyReasons) {
    assert.ok(labels.has(entry.reason),
      `missing REP_REASON_LABELS entry for applyRep reason "${entry.reason}" in ${entry.file}:${entry.line}`);
  }
}

function testLabelsAreProducible() {
  const labels = Object.keys(REP_REASON_LABELS);
  const produced = new Set();
  for (const entry of collectApplyRepReasonCalls()) produced.add(entry.reason);
  for (const reason of collectFactionsProducerReasons()) produced.add(reason);
  for (const label of labels) {
    assert.ok(produced.has(label),
      `REP_REASON_LABELS.${label} has no live producer in src/systems`);
  }
}

function testLawReceiptCausesArePinned() {
  const mapped = new Set();
  for (const causes of Object.values(REASON_TO_CAUSE || {})) {
    for (const cause of Array.isArray(causes) ? causes : []) mapped.add(cause);
  }
  const allow = new Set(CAUSES_WITHOUT_REP || []);
  const discovered = collectLawReceiptCauses();
  assert.ok(discovered.size >= 8,
    `expected real law cause coverage from lawSecurity/reportIncident call sites (got ${discovered.size})`);
  for (const causeRaw of discovered) {
    const cause = normalizeCause(causeRaw);
    assert.ok(mapped.has(cause) || allow.has(cause),
      `law receipt cause "${cause}" must exist in REASON_TO_CAUSE or CAUSES_WITHOUT_REP`);
  }
}

function collectApplyRepReasonCalls() {
  const out = [];
  const files = listFiles(SYSTEMS_DIR, '.js');
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const calls = extractCallArgumentLists(src, /applyRep\s*\(/g);
    for (const call of calls) {
      const args = splitTopLevelComma(call.args);
      if (args.length < 3) continue;
      const reason = extractExactStringLiteral(args[2].trim());
      if (!reason) continue;
      out.push({
        reason,
        file: toRepoPath(file),
        line: lineNumberAt(src, call.index),
      });
    }
  }
  return out;
}

function collectFactionsProducerReasons() {
  const src = readFileSync(FACTIONS_FILE, 'utf8');
  const reasons = new Set();
  for (const m of src.matchAll(/lastDelta:\s*\{[^}]*\breason:\s*'([a-z0-9_:-]+)'/gs)) {
    reasons.add(m[1]);
  }
  for (const call of extractCallArgumentLists(src, /_setRepDirect\s*\(/g)) {
    const args = splitTopLevelComma(call.args);
    if (args.length < 4) continue;
    const reason = extractExactStringLiteral(args[3].trim());
    if (reason) reasons.add(reason);
  }
  return reasons;
}

function collectLawReceiptCauses() {
  const causes = new Set();
  const lawSrc = readFileSync(LAW_SECURITY_FILE, 'utf8');

  for (const call of extractCallArgumentLists(lawSrc, /_recordReceipt\s*\(/g)) {
    const objectBody = extractObjectBody(call.args.trim());
    if (!objectBody) continue;
    const expr = extractObjectPropertyExpression(objectBody, 'cause');
    for (const literal of extractStringLiterals(expr)) causes.add(literal);
  }

  for (const call of extractCallArgumentLists(lawSrc, /_openIncident\s*\(/g)) {
    const args = splitTopLevelComma(call.args);
    if (args.length < 4) continue;
    for (const literal of extractStringLiterals(args[3])) causes.add(literal);
  }

  for (const cause of extractAggressionCauses(lawSrc)) causes.add(cause);
  for (const cause of collectReportIncidentKinds()) causes.add(cause);

  return causes;
}

function collectReportIncidentKinds() {
  const kinds = new Set();
  const files = listFiles(SRC_DIR, '.js');
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const constStrings = extractConstStringLiterals(src);
    for (const call of extractCallArgumentLists(src, /reportIncident\s*\(/g)) {
      const objectBody = extractObjectBody(call.args.trim());
      if (!objectBody) continue;
      const kindExpr = extractObjectPropertyExpression(objectBody, 'kind');
      if (!kindExpr) continue;
      const literals = extractStringLiterals(kindExpr);
      if (literals.length) {
        for (const value of literals) kinds.add(value);
        continue;
      }
      const key = kindExpr.trim();
      if (constStrings.has(key)) kinds.add(constStrings.get(key));
    }
  }
  return kinds;
}

function extractAggressionCauses(lawSrc) {
  const out = new Set();
  const start = lawSrc.indexOf('function aggressionCauseFor');
  if (start < 0) return out;
  const end = lawSrc.indexOf('\nfunction ', start + 1);
  const body = lawSrc.slice(start, end > start ? end : undefined);
  for (const m of body.matchAll(/return\s+'([a-z0-9_:-]+)'/g)) out.add(m[1]);
  return out;
}

function extractConstStringLiterals(src) {
  const map = new Map();
  for (const m of src.matchAll(/\bconst\s+([A-Z0-9_]+)\s*=\s*'([a-z0-9_:-]+)'/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function extractObjectBody(expr) {
  const text = expr.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  return text.slice(1, -1);
}

function extractObjectPropertyExpression(objectBody, propertyName) {
  const entries = splitTopLevelComma(objectBody);
  for (const entry of entries) {
    const m = entry.match(new RegExp(`^\\s*${propertyName}\\s*:\\s*([\\s\\S]+)$`));
    if (m) return m[1].trim();
  }
  return '';
}

function normalizeCause(cause) {
  const raw = String(cause || '').trim();
  if (!raw) return raw;
  return raw.startsWith('spillover:') ? raw.slice('spillover:'.length) : raw;
}

function extractExactStringLiteral(expr) {
  const text = String(expr || '').trim();
  if (/^'[^']+'$/.test(text)) return text.slice(1, -1);
  if (/^"[^"]+"$/.test(text)) return text.slice(1, -1);
  return '';
}

function extractStringLiterals(expr) {
  const out = [];
  if (!expr) return out;
  for (const m of String(expr).matchAll(/'([a-z0-9_:-]+)'|"([a-z0-9_:-]+)"/g)) {
    out.push(m[1] || m[2]);
  }
  return out;
}

function extractCallArgumentLists(src, callRegex) {
  const results = [];
  const re = new RegExp(callRegex.source, callRegex.flags.includes('g') ? callRegex.flags : callRegex.flags + 'g');
  let match;
  while ((match = re.exec(src))) {
    const open = src.indexOf('(', match.index);
    if (open < 0) continue;
    const close = findMatchingParen(src, open);
    if (close < 0) continue;
    results.push({
      index: match.index,
      args: src.slice(open + 1, close),
    });
    re.lastIndex = close + 1;
  }
  return results;
}

function splitTopLevelComma(input) {
  const out = [];
  let depth = 0;
  let quote = '';
  let escaped = false;
  let tokenStart = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === ',' && depth === 0) {
      out.push(input.slice(tokenStart, i));
      tokenStart = i + 1;
    }
  }
  out.push(input.slice(tokenStart));
  return out;
}

function findMatchingParen(src, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function listFiles(dir, ext = '') {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, ext));
    else if (!ext || entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function lineNumberAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (src.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function toRepoPath(absPath) {
  return path.relative(ROOT, absPath).replaceAll('\\', '/');
}
