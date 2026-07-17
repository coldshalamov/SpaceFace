#!/usr/bin/env node
// check-contracts-board-polish.mjs — tiny source gate for Small Contracts board polish.
//
// Pins presentation hierarchy only (no station shell redesign):
//   1. contracts.js still marks board rows + Accept commit with is-attention.
//   2. station.css strengthens .sx-ct-row.is-attention (rail + glow, beats active).
//   3. station.css primary Accept hierarchy: span label > em readiness; disabled quiet.
//   4. Attention Accept glow reserved for ready CTAs (not disabled).
//   5. Shell destinations / stationApp wiring stay present (no redesign in this slice).
//   6. Dossier renders authored summary/description under title via .sx-dossier__summary.
//
// Does NOT launch the game or rewrite goldens.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const contracts = read('src/ui/station/screens/contracts.js');
const stationCss = read('styles/station.css');
const stationApp = read('src/ui/station/stationApp.js');

let n = 0;
function ok(label) {
  n += 1;
  console.log(`  PASS  ${label}`);
}

// ── 1. Live wiring: attention row + Accept CTA ────────────────────────────────
assert.match(contracts, /is-attention/, 'contracts screen marks attention state');
assert.match(
  contracts,
  /class="sx-ct-row\$\{active\}\$\{needs\}"/,
  'board rows compose is-active + is-attention classes',
);
assert.match(
  contracts,
  /sx-ct-row__flag">ACT</,
  'attention board rows expose an ACT flag',
);
assert.match(
  contracts,
  /sx-btn-primary sx-ct-commit\$\{focusAccept && ready \? ' is-attention' : ''\}/,
  'Accept commit gets is-attention only when focus + ready',
);
assert.match(contracts, /ui:acceptMission/, 'accept still emits canonical ui:acceptMission');
ok('contracts.js attention row + Accept wiring');

// ── 2. Attention row visual strength in station.css ───────────────────────────
assert.match(
  stationCss,
  /\.sx-ct-row\.is-attention\s*\{[^}]*inset\s+3px\s+0\s+0/s,
  'attention row uses a left inset rail',
);
assert.match(
  stationCss,
  /\.sx-ct-row\.is-attention\s*\{[^}]*box-shadow:/s,
  'attention row carries a glow box-shadow',
);
assert.match(
  stationCss,
  /\.sx-ct-row\.is-active\.is-attention\s*\{/s,
  'active+attention compound selector keeps attention dominant over plain active',
);
assert.match(
  stationCss,
  /\.sx-ct-row\.is-attention\s+\.sx-ct-row__title\s*\{[^}]*font-weight:\s*600/s,
  'attention title is weighted for scan priority',
);
ok('station.css attention row hierarchy');

// ── 3. Primary Accept button hierarchy ────────────────────────────────────────
assert.match(
  stationCss,
  /\.sx-ct-commit\s*\{[^}]*display:\s*grid/s,
  'commit button lays out as a grid (label vs readiness)',
);
assert.match(
  stationCss,
  /\.sx-ct-commit\s*>\s*span\s*\{[^}]*font-size:\s*15px/s,
  'primary Accept label is 15px',
);
assert.match(
  stationCss,
  /\.sx-ct-commit\s*>\s*em\s*\{[^}]*font-size:\s*11px/s,
  'readiness meta is smaller than the Accept label',
);
assert.match(
  stationCss,
  /\.sx-ct-commit\s*>\s*em\s*\{[^}]*text-transform:\s*none/s,
  'readiness meta is not shout-cased like the primary verb',
);
assert.match(
  stationCss,
  /\.sx-btn-primary:disabled(?::hover)?[\s\S]{0,120}box-shadow:\s*none/s,
  'disabled primary Accept is quiet (no glow)',
);
ok('station.css Accept label > readiness hierarchy');

// ── 4. Ready-only attention pulse / glow ──────────────────────────────────────
assert.match(
  stationCss,
  /\.sx-dossier\.is-attention\s+\.sx-ct-commit:not\(:disabled\)/s,
  'dossier attention glow targets ready (not disabled) commit',
);
assert.match(
  stationCss,
  /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*?\.sx-btn-primary\.is-attention/,
  'commit pulse respects reduced-motion preference',
);
assert.match(stationCss, /@keyframes\s+sx-ct-commit-pulse/, 'commit pulse keyframes remain');
ok('ready Accept attention glow + reduced-motion');

// ── 5. Shell fence — polish only ──────────────────────────────────────────────
assert.match(stationApp, /id:\s*['"]contracts['"]/, 'station still exposes contracts/Missions destination');
assert.match(stationApp, /createContractsScreen/, 'station shell still hosts createContractsScreen');
assert.match(stationApp, /missionDockAttention/, 'dock attention handoff remains wired');
assert.doesNotMatch(
  stationCss,
  /\.sx-app\s*\{[^}]{0,40}display:\s*none/s,
  'station.css polish must not hide the station shell',
);
ok('station shell fence (no redesign)');

// ── 6. Authored mission summary on live dossier ────────────────────────────────
// Narrative body sits under the title header and before reward/risk stats.
assert.match(
  contracts,
  /m\.summary\s*\|\|\s*m\.description/,
  'dossier narrative prefers authored summary then description',
);
assert.match(
  contracts,
  /class="sx-dossier__summary"/,
  'dossier renders narrative under sx-dossier__summary',
);
assert.match(
  contracts,
  /<\/header>`\s*\+\s*\(narrative[\s\S]*?sx-dossier__summary[\s\S]*?sx-dossier__topline/,
  'summary render path is under title header and before topline stats',
);
assert.match(
  stationCss,
  /\.sx-dossier__summary\s*\{/,
  'station.css styles .sx-dossier__summary',
);
ok('dossier authored summary render path');

console.log(`\nContracts board polish checks OK (${n} groups).`);
