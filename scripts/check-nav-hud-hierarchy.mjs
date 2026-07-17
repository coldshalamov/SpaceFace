#!/usr/bin/env node
// check-nav-hud-hierarchy.mjs — lightweight source/contract gate for W3 NAV-HUD hierarchy.
//
// Pins presentation + one-surface law without launching the game:
//   1. Flight HUD declares one-objective-one-action-one-threat hierarchy.
//   2. Active objective owns attention (legacy multi-mission list + duplicate nav readout yield).
//   3. Tracker lines expose primary / secondary / meta tiers; soft mode for untracked guidance.
//   4. CSS keeps primary objective larger/bolder than title/meta (including narrow layouts).
//   5. Contact roster + lead-threat emphasis remain wired (roster is not removed).
//   6. One-voice alert floor order and station shell ownership stay untouched by this slice.
//
// Does NOT rewrite goldens, touch input.js, thrusters, or station shell redesign.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const hud = read('src/ui/hud.js');
const uiRoot = read('src/ui/uiRoot.js');
const uiCss = read('styles/ui.css');
const alerts = read('src/ui/alerts.js');

let n = 0;
function ok(label) {
  n += 1;
  console.log(`  PASS  ${label}`);
}

// ── 1. Declared hierarchy contract ────────────────────────────────────────────
assert.match(
  hud,
  /dataset\.objectiveHierarchy\s*=\s*['"]one-objective-one-action-one-threat['"]/,
  'HUD root must declare one-objective-one-action-one-threat',
);
assert.match(hud, /sf-mission-tracker/, 'mission tracker remains the primary command surface');
ok('declared hierarchy + mission tracker surface');

// ── 2. De-dupe / attention ownership (already shipped; must stay) ─────────────
assert.match(
  hud,
  /__active-objective-owns-attention__[\s\S]{0,240}setDisplay\(objWrap,\s*false\)/,
  'active objective must clear/hide the legacy multi-mission .sf-objectives stack',
);
assert.match(
  hud,
  /setDisplay\(elNavReadout,\s*!objectiveOwnsAttention\)/,
  'duplicate nav readout must yield while an objective owns attention',
);
assert.match(
  hud,
  /!combatRelevant\s*&&\s*!miningRelevant/,
  'route attention must not suppress combat/mining target cards',
);
ok('objective owns attention without killing combat/mining targeting');

// ── 3. Tracker line tiers + soft/primary modes ───────────────────────────────
assert.match(hud, /data-hud-tier="primary"/, 'objective verb must mark data-hud-tier=primary');
assert.match(hud, /data-hud-tier="secondary"/, 'title eyebrow must mark data-hud-tier=secondary');
assert.match(hud, /data-hud-tier="meta"/, 'distance/ETA line must mark data-hud-tier=meta');
assert.match(hud, /sf-mission-tracker--soft/, 'untracked next-action guidance uses soft mode');
assert.match(hud, /sf-mission-tracker--primary/, 'tracked/waypoint objective uses primary mode');
assert.match(
  hud,
  /setAttribute\('role',\s*'region'\)/,
  'tracker remains a labelled region (not a per-frame live status spam)',
);
assert.doesNotMatch(
  hud.slice(
    hud.indexOf("missionTracker.className = 'sf-mission-tracker'"),
    hud.indexOf('leftContext.appendChild(missionTracker)'),
  ),
  /aria-live|role',\s*'status'/,
  'tracker setup must not re-announce changing distance as a live status',
);
ok('tracker primary/secondary/meta tiers + soft mode');

// ── 4. CSS hierarchy: primary > secondary/meta (desktop + narrow) ─────────────
assert.match(uiRoot, /\.sf-mt-obj\s*\{[^}]*font-size:\s*14px/s, 'primary objective desktop size is 14px');
assert.match(uiRoot, /\.sf-mt-obj\s*\{[^}]*font-weight:\s*700/s, 'primary objective is bold');
assert.match(uiRoot, /\.sf-mt-title\s*\{[^}]*font-size:\s*9px/s, 'title eyebrow is smaller than primary');
assert.match(uiRoot, /\.sf-mt-title\s*\{[^}]*opacity:\s*\.72/s, 'title eyebrow is quieter');
assert.match(uiRoot, /\.sf-mt-time\s*\{[^}]*color:\s*var\(--text-secondary\)/s, 'meta line uses secondary text');
assert.match(
  uiRoot,
  /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.sf-mt-obj\s*\{\s*font-size:\s*12px/,
  'narrow layout keeps primary obj at 12px',
);
assert.match(
  uiRoot,
  /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.sf-mt-title\s*\{\s*font-size:\s*8px/,
  'narrow layout keeps title smaller than primary (hierarchy not inverted)',
);
assert.doesNotMatch(
  uiRoot,
  /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.sf-mt-obj\s*\{\s*font-size:\s*9px/,
  'narrow layout must not shrink primary below title (old inverted hierarchy)',
);
assert.match(uiRoot, /\.sf-mission-tracker--soft\s+\.sf-mt-obj/, 'soft mode quiets the primary verb');
ok('CSS primary prominence + non-inverted narrow hierarchy');

// ── 5. Contact roster preserved + lead-threat ranking ─────────────────────────
assert.match(hud, /sf-overview/, 'contact roster overview strip remains mounted');
assert.match(hud, /createTargetPanel\(ctx\)/, 'target panel remains reachable');
assert.match(hud, /createRadar\(ctx\)/, 'radar remains reachable');
assert.match(hud, /sf-overview-row--threat/, 'hostile roster rows mark threat tier class');
assert.match(hud, /sf-overview-row--lead-threat/, 'first hostile is the lead threat');
assert.match(uiCss, /\.sf-overview-row--lead-threat/, 'lead-threat visual style lives in styles/ui.css');
assert.match(uiCss, /\.sf-overview-row--threat/, 'threat-row visual style lives in styles/ui.css');
// Ensure we did not delete roster machinery for "clean hierarchy".
assert.match(hud, /contactOverflowSummary/, 'roster overflow summary remains');
assert.match(hud, /contactDisplayLimit/, 'roster display limit remains');
ok('contact roster + radar + lead-threat emphasis intact');

// ── 6. One-voice / station fences ─────────────────────────────────────────────
assert.match(alerts, /VOICE_OWNED_ALERT_TEXTS/, 'alerts one-voice ownership list remains');
assert.match(uiRoot, /\.sf-alert--floor\s*\{\s*order:\s*-1/, 'one-voice floor stays top of #alerts stack');
// Station shell files must not be part of this NAV-HUD presentation slice.
const stationShell = read('src/ui/station/stationApp.js');
assert.ok(stationShell.length > 100, 'station shell file still present (not redesigned away)');
assert.doesNotMatch(
  hud,
  /stationApp|stationHub\.open|redesignStation/,
  'flight HUD hierarchy polish must not reach into station shell redesign',
);
ok('one-voice floor + station shell fence');

console.log(`\nNAV-HUD hierarchy checks OK (${n} groups).`);
