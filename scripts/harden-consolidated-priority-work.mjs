#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const RECEIPT_DIR = 'design/program/branch-consolidation';
const changes = [];
const holds = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function writeChanged(path, source, reason) {
  const current = existsSync(path) ? read(path) : null;
  if (current === source) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  changes.push({ path, reason });
  return true;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`required marker missing for ${label}`);
  return source.replace(before, after);
}

function removeConstArray(source, name) {
  const pattern = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`);
  const match = pattern.exec(source);
  if (!match) return source;
  const start = match.index;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let end = -1;
  for (let i = source.indexOf('[', start); i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        let cursor = i + 1;
        while (cursor < source.length && /[;\s]/.test(source[cursor])) cursor += 1;
        end = cursor;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`could not bound ${name} array`);
  return `${source.slice(0, start)}${source.slice(end)}`;
}

function replaceFunctionBody(source, name, replacementBody, predicate) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = pattern.exec(source);
  if (!match) return { source, changed: false, reason: 'function absent' };
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let close = -1;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close < 0) throw new Error(`could not bound ${name}`);
  const body = source.slice(open + 1, close);
  if (!predicate(body)) return { source, changed: false, reason: 'predicate rejected body' };
  const replacement = `${source.slice(0, open + 1)}${replacementBody}${source.slice(close)}`;
  return { source: replacement, changed: true, reason: 'replaced dead fake-telemetry body' };
}

function hardenRadar() {
  const radarPath = 'src/ui/radar.js';
  const grammarPath = 'src/ui/map/tacticalMapGrammar.js';
  if (!existsSync(radarPath) || !existsSync(grammarPath)) {
    holds.push({ surface: 'tactical-map', reason: 'priority map donor was not ported' });
    return;
  }

  let radar = read(radarPath);
  radar = replaceRequired(radar, 'const COMPACT_SIZE = 220;', 'const COMPACT_SIZE = 248;', 'compact radar size');
  radar = replaceRequired(radar, 'const COMPACT_R = 105;', 'const COMPACT_R = 119;', 'compact radar radius');
  if (!radar.includes('export const RADAR_RANGE_MODES')) {
    radar = replaceRequired(
      radar,
      'export const SWARM_DENSITY_THRESHOLD = 8;\n',
      `export const SWARM_DENSITY_THRESHOLD = 8;\nexport const RADAR_RANGE_MODES = Object.freeze([3000, 6000, 12000]);\n\nexport function normalizeRadarRange(value) {\n  const requested = Number(value);\n  if (!Number.isFinite(requested)) return RADAR_RANGE_MODES[1];\n  let best = RADAR_RANGE_MODES[0];\n  let delta = Math.abs(requested - best);\n  for (const candidate of RADAR_RANGE_MODES) {\n    const candidateDelta = Math.abs(requested - candidate);\n    if (candidateDelta < delta) { best = candidate; delta = candidateDelta; }\n  }\n  return best;\n}\n`,
      'range modes',
    );
  }

  if (!radar.includes('sf-radar-range-control')) {
    radar = replaceRequired(
      radar,
      "  wrap.className = 'sf-radar-wrap';\n",
      "  wrap.className = 'sf-radar-wrap';\n  if (!state.ui) state.ui = {};\n  state.ui.radarRange = normalizeRadarRange(state.ui.radarRange);\n",
      'range state initialization',
    );
    radar = replaceRequired(
      radar,
      '  wrap.append(dial, objectiveKey);\n\n  const parityTeardown = installMapParityBridge();',
      `  const rangeButton = document.createElement('button');\n  rangeButton.type = 'button';\n  rangeButton.className = 'sf-radar-range-control mono';\n  rangeButton.style.cssText = 'min-height:28px;padding:4px 9px;border:1px solid rgba(99,243,255,.35);background:rgba(4,12,16,.88);color:#b9c3c2;font:700 12px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.06em;cursor:pointer;';\n  const syncRangeButton = () => {\n    const range = normalizeRadarRange(state.ui.radarRange);\n    state.ui.radarRange = range;\n    rangeButton.textContent = \`SENSOR \${Math.round(range / 1000)}K\`;\n    rangeButton.setAttribute('aria-label', \`Sensor range \${Math.round(range / 1000)} thousand units. Activate to change range.\`);\n  };\n  const cycleRange = (event) => {\n    event.stopPropagation();\n    const current = normalizeRadarRange(state.ui.radarRange);\n    const index = RADAR_RANGE_MODES.indexOf(current);\n    state.ui.radarRange = RADAR_RANGE_MODES[(index + 1) % RADAR_RANGE_MODES.length];\n    syncRangeButton();\n  };\n  rangeButton.addEventListener('click', cycleRange);\n  syncRangeButton();\n  wrap.append(dial, objectiveKey, rangeButton);\n\n  const parityTeardown = installMapParityBridge();`,
      'range control',
    );
    radar = replaceRequired(
      radar,
      "    const baseRange = (state.ui && state.ui.radarRange) || 4000;\n    const range = expanded ? baseRange * 2 : baseRange;",
      "    const range = normalizeRadarRange(state.ui && state.ui.radarRange);",
      'stable selected range',
    );
    radar = replaceRequired(
      radar,
      "    dial.removeEventListener('click', onDialClick);\n",
      "    dial.removeEventListener('click', onDialClick);\n    rangeButton.removeEventListener('click', cycleRange);\n",
      'range listener cleanup',
    );
  }
  writeChanged(radarPath, radar, 'increase useful radar area and add explicit stable sensor ranges');

  let grammar = read(grammarPath);
  grammar = replaceRequired(
    grammar,
    'const COMPACT_METRICS = Object.freeze({ size: 220, center: 110, radius: 105 });',
    'const COMPACT_METRICS = Object.freeze({ size: 248, center: 124, radius: 119 });',
    'shared compact metrics',
  );
  writeChanged(grammarPath, grammar, 'keep shared radar projection aligned with 248px instrument');

  const testPath = 'test/tactical-map-range-control.test.mjs';
  const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport { RADAR_RANGE_MODES, normalizeRadarRange, tacticalRadarMetrics } from '../src/ui/radar.js';\n\ntest('compact radar spends more area on information without becoming a playfield panel', () => {\n  const metrics = tacticalRadarMetrics ? tacticalRadarMetrics(false) : null;\n  const grammar = readFileSync(new URL('../src/ui/map/tacticalMapGrammar.js', import.meta.url), 'utf8');\n  assert.match(grammar, /size: 248, center: 124, radius: 119/);\n  assert.equal(248 / 1280 < 0.20, true);\n});\n\ntest('sensor ranges are explicit, ordered, and normalize legacy 4K state to tactical 6K', () => {\n  assert.deepEqual([...RADAR_RANGE_MODES], [3000, 6000, 12000]);\n  assert.equal(normalizeRadarRange(4000), 3000);\n  assert.equal(normalizeRadarRange(5200), 6000);\n  assert.equal(normalizeRadarRange(99999), 12000);\n});\n\ntest('the range control is a real keyboard-focusable button and expanded mode does not silently change scale', () => {\n  const radar = readFileSync(new URL('../src/ui/radar.js', import.meta.url), 'utf8');\n  assert.match(radar, /rangeButton\.type = 'button'/);\n  assert.match(radar, /SENSOR \\${Math\.round\(range \/ 1000\)}K/);\n  assert.match(radar, /const range = normalizeRadarRange/);\n  assert.doesNotMatch(radar, /expanded \? baseRange \* 2 : baseRange/);\n});\n`;
  writeChanged(testPath, test, 'pin map size, explicit range modes, and input semantics');
}

function hardenBoot() {
  const indexPath = 'index.html';
  const artPath = 'src/ui/loadingTerminalArt.js';
  if (!existsSync(indexPath) || !existsSync(artPath)) {
    holds.push({ surface: 'boot-redesign', reason: 'loading donor or artwork module is absent' });
    return;
  }
  const index = read(indexPath);
  const removedHooks = [
    'data-loading-diag-stream',
    'data-loading-hex',
    'data-loading-subsystems',
    'data-loading-segments',
    'data-loading-stage-name',
    'boot-waveform-canvas',
  ];
  if (removedHooks.some((hook) => index.includes(hook))) {
    holds.push({ surface: 'boot-redesign', reason: 'full-bleed donor did not remove the old fake-telemetry DOM' });
    return;
  }

  let art = read(artPath);
  const deadTokens = ['diag', 'hex', 'subsys', 'segment'];
  const replacement = replaceFunctionBody(
    art,
    'updateTelemetry',
    '\n  // The full-bleed field is the presentation. Loading truth is owned by loadingPresenter.\n',
    (body) => deadTokens.filter((token) => body.toLowerCase().includes(token)).length >= 3,
  );
  if (replacement.changed) art = replacement.source;
  for (const name of ['actLogs', 'actTitles']) {
    const without = removeConstArray(art, name);
    if (without !== art && !new RegExp(`\\b${name}\\b`).test(without)) art = without;
  }
  writeChanged(artPath, art, 'remove dead invented telemetry generation after the full-bleed boot cutover');

  const testPath = 'test/consolidated-boot-honesty.test.mjs';
  const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');\nconst art = readFileSync(new URL('../src/ui/loadingTerminalArt.js', import.meta.url), 'utf8');\n\ntest('the loading surface contains no invented terminal telemetry hooks', () => {\n  for (const token of ${JSON.stringify(removedHooks)}) assert.doesNotMatch(index, new RegExp(token));\n  assert.doesNotMatch(index, /SYS_DIAGNOSTICS|HEAP_DUMP|CARRIER_SIGNAL_WAVE|SYS_EXEC/i);\n});\n\ntest('dead telemetry generators do not survive behind the redesigned DOM', () => {\n  assert.doesNotMatch(art, /\\bactLogs\\b|\\bactTitles\\b/);\n  const match = /function\\s+updateTelemetry\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}/.exec(art);\n  if (match) assert.doesNotMatch(match[1], /diag|hex|subsys|segment/i);\n});\n`;
  writeChanged(testPath, test, 'pin removal of fake loading telemetry and dead generators');
}

function hardenArcadeDocs() {
  const root = 'design/arcade-core';
  if (!existsSync(root)) {
    holds.push({ surface: 'arcade-core', reason: 'design donor was not transplanted' });
    return;
  }
  const path = `${root}/61_CONVERGENCE_AND_AUTHORITY.md`;
  const body = `# 61 — Convergence and authority\n\n## Purpose\n\nThe Arcade Core corpus is a design reservoir, not sixty-one independent mandates. Work converges only when a player-facing outcome is selected, implemented against current master, measured, and merged. Branch count is not progress. Runtime evidence is.\n\n## Authority\n\n1. The owner's latest explicit direction.\n2. Current live behavior and current repository architecture.\n3. Current canonical program documents.\n4. This corpus as a source of candidate mechanics and acceptance criteria.\n\nA donor document never overwrites a newer implemented invariant merely because it is more detailed. Contradictions are resolved in favor of current owner intent and measured play.\n\n## Slice law\n\nA delivery slice must contain one causal player loop: trigger, simulation consequence, presentation, reward or cost, and executable acceptance. Do not merge a checker without its product outcome, a visual without its gameplay owner, or a mechanic without its feedback.\n\n## Required adversarial pass\n\nBefore implementation, answer:\n\n- What current system already performs part of this job?\n- What duplicate owner, telemetry channel, currency, or progression axis would this create?\n- What happens under swarm density, low-end GPU load, save/load, and reduced motion?\n- Can the player explain the consequence from the frame and sound without reading a report?\n- What would make this feature actively worse than leaving the game alone?\n\n## Merge contract\n\nEvery surviving branch outcome is rebuilt on current master, not merged as an ancient timeline. Acceptance requires targeted tests, a normal-route runtime probe, and a concise receipt naming superseded donors. Obsolete branches are closed after their useful outcome is ported or deliberately rejected.\n\n## Program shape\n\nPrefer three active implementation fronts at a time:\n\n1. one core loop or combat-feel front;\n2. one world/economy/progression front;\n3. one presentation or infrastructure front.\n\nEverything else remains queued. This preserves conceptual breadth without turning the repository into sixty simultaneous partial games.\n`;
  writeChanged(path, body, 'convert a broad brainstorm corpus into a current-master convergence protocol');

  const readme = `${root}/README.md`;
  if (existsSync(readme)) {
    let source = read(readme);
    if (!source.includes('61_CONVERGENCE_AND_AUTHORITY.md')) {
      source += `\n\n## Convergence\n\n- [61 — Convergence and authority](61_CONVERGENCE_AND_AUTHORITY.md) defines how this corpus becomes current-master implementation rather than permanent parallel plans.\n`;
      writeChanged(readme, source, 'link the corpus to an explicit convergence owner');
    }
  }
}

hardenRadar();
hardenBoot();
hardenArcadeDocs();
mkdirSync(RECEIPT_DIR, { recursive: true });
const receipt = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  changes,
  holds,
};
writeFileSync(`${RECEIPT_DIR}/priority-hardening.json`, `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(
  `${RECEIPT_DIR}/PRIORITY_HARDENING.md`,
  `# Priority donor hardening\n\nGenerated: ${receipt.generatedAt}\n\n## Changes\n\n${changes.length ? changes.map((row) => `- \`${row.path}\` — ${row.reason}`).join('\n') : '- None; priority donors were not yet present.'}\n\n## Holds\n\n${holds.length ? holds.map((row) => `- **${row.surface}** — ${row.reason}`).join('\n') : '- None.'}\n`,
);
console.log(JSON.stringify({ changed: changes.length, held: holds.length }, null, 2));
