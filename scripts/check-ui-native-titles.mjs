#!/usr/bin/env node
// check-ui-native-titles.mjs — no OS tooltips on live instrument surfaces.
//
// PACKET TITLE-SWEEP. A native `title=` is hover-only, unstyled, ~1 s slow, absent on touch, and
// unreachable by keyboard focus. This check bans it from the NAMED live files below so it cannot
// creep back onto a converted surface, and pins the converted `[data-why]` wiring (hover AND
// keyboard focus, through the one shared reveal in whyReveal.js — never a second tooltip).
//
// NOT a blanket repo ban, on purpose. 38 further native titles live in the UNMOUNTED legacy
// station-hub chain (screens/stationHub.js and the create*Panel bodies only it ever called:
// market/outfitting/services/shipyard/manufacture/factions in src/ui/screens/). They render for no
// player. If any of those files returns to the live route, ADD IT HERE the same day — that is the
// price of staying out of the ban list.
//
// ALLOWLIST (one file, two entries): shipworks rail rows keep a native title because the visible
// ship name is ellipsized by design (station-workbench.css .sx-sw-row__name: nowrap + ellipsis).
// That is a LAYOUT bug wearing a tooltip — recorded here as open debt, not blessed. The entries are
// pinned by exact string: fix the truncation and this check goes red telling you to drop the shim
// from ALLOWLIST, so the list cannot rot.
//
// Run: node scripts/check-ui-native-titles.mjs   (wired as npm run check:ui:native-titles)
// Tests: test/native-title-sweep.test.mjs (regex unit proofs + keyboard-focus proof through the
// REAL whyReveal module). This check runs them as a subprocess — only its exit code is a signal.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// A native title in markup: `title="…"` / `title='…'` with an unspaced equals (the HTML form —
// JS assignments like `title = 'Open Star Map'` have spaces and are covered by the property form
// below). The lookbehind rejects `data-career-title=` and prefixed/property reads; the packet's
// 66-count included exactly one such false positive (data-career-title in missionLog.js); the real
// count was 65.
export const NATIVE_TITLE_RE = /(?<![\w.-])title=(?=['"])/;

// The same OS tooltip delivered as a DOM property: `el.title = '…'`. Clearing writes
// (null / undefined / '' / ``) are legitimate teardown and are exempt — the RHS is inspected per
// match because a pure negative-lookahead regex backtracks past the exemption (`= ''` matched by
// shrinking the trailing \s*). This is the form the packet's grep could not see — a second
// population of ~48 sites lives in files outside this sweep's ban list (bar, hud, radar, comms,
// menus, crucible); banned files must stay clean of BOTH forms.
export const NATIVE_TITLE_PROP_RE = /\.title\s*=\s*/g;
const TITLE_CLEAR_RE = /^(?:null\b|undefined\b|''|""|``)/;

/** Non-clearing `.title =` writes in `body`, as { line, rhs } — the real defect set. */
export function nativeTitlePropWrites(body) {
  const out = [];
  for (const m of body.matchAll(NATIVE_TITLE_PROP_RE)) {
    const rhs = body.slice(m.index + m[0].length, m.index + m[0].length + 48).trim();
    if (TITLE_CLEAR_RE.test(rhs)) continue;
    const line = body.slice(0, m.index).split('\n').length;
    out.push({ line, rhs });
  }
  return out;
}

// Files on the live route that must carry zero native titles. Liveness was established per file:
// registered screens in uiRoot.js SCREEN_MODULES, the live station chain
// (stationScreen → stationApp → dock + station/screens/*), the flight HUD, and galaxyMap.
export const BANNED_FILES = [
  'src/ui/galaxyMap.js',
  'src/ui/targetPanel.js',
  'src/ui/station/dock.js',
  'src/ui/station/stationApp.js',
  'src/ui/station/screens/market.js',
  'src/ui/station/screens/contracts.js',
  'src/ui/screens/footprint.js',
  'src/ui/screens/automationPanel.js',
  'src/ui/screens/techTree.js',
  'src/ui/screens/missionLog.js',
  'src/ui/screens/localmap.js',
];

// The two pinned truncation shims in shipworks (see header). Exact strings, no wildcards.
export const ALLOWLIST = {
  'src/ui/station/screens/shipworks.js': [
    'title="${escapeHtml(def.name || s.defId)}"',
    'title="${escapeHtml(s.name)} · ${escapeHtml(s.role || \'ship\')}"',
  ],
};

// Named wiring for converted carriers: the data-why write AND its keyboard seat, pinned in source
// like check-tier2-why pins its named set. `count` > 1 pins a repeated family of writers.
export const WIRED_SITES = [
  {
    file: 'src/ui/galaxyMap.js',
    label: 'place + ribbon action reasons — unavailable actions keep a focus seat (aria-disabled, not disabled)',
    needles: [
      ['data-why="${escapeMapHtml(a.reason)}"', 2],
      ['${a.available ? \'\' : \'tabindex="0"\'}', 2],
    ],
    forbids: ["${a.available ? '' : 'disabled'}"],
  },
  {
    file: 'src/ui/targetPanel.js',
    label: 'VULN triangle E/K/X — focusable segments, enumerated one-word whys',
    needles: [
      ['aria-label="Vulnerability to energy weapons" data-why="Energy"', 1],
      ['aria-label="Vulnerability to kinetic weapons" data-why="Kinetic"', 1],
      ['aria-label="Vulnerability to explosives" data-why="Explosive"', 1],
    ],
  },
  {
    file: 'src/ui/station/stationApp.js',
    label: 'station shell — help glyph, handoff steps, vital-act quote reasons',
    needles: [
      ['data-why="Context help"', 1],
      ['` data-why="${escapeHtml(st.text)}" aria-label=', 1],
      ['cost.title ? ` data-why="${escapeHtml(cost.title)}"` : \'\'', 1],
    ],
  },
  {
    file: 'src/ui/screens/automationPanel.js',
    label: 'automation purchase/next-action reasons on every buy surface',
    needles: [
      ['data-why="${escapeHtml(purchase.title)}"', 3],
      ['data-why="${escapeHtml(actionTitle)}"', 1],
    ],
  },
  {
    file: 'src/ui/screens/techTree.js',
    label: 'locked-node reasons — aria-disabled keeps the why keyboard-reachable',
    needles: [
      ['aria-disabled="true" tabindex="0" data-why=', 1],
      ['data-act="unlock" data-why="${escapeHtml(readiness.actionTitle)}"', 1],
    ],
    forbids: ['<button disabled title='],
  },
  {
    file: 'src/ui/screens/missionLog.js',
    label: 'recommended-action map whys (body phrase first, title as fallback)',
    needles: [
      ['data-why="\' + escapeHtml(action.mapAction.body', 1],
      ['data-why="\' + escapeHtml(a.mapAction.body', 1],
    ],
  },
];

export function auditNativeTitles({ files = BANNED_FILES, allowlist = ALLOWLIST, wired = WIRED_SITES } = {}) {
  const failures = [];
  const notes = [];

  for (const rel of files) {
    const body = src(rel);
    const attrHits = [...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))];
    const propHits = nativeTitlePropWrites(body);
    if (attrHits.length || propHits.length) {
      const parts = [];
      if (attrHits.length) parts.push(`${attrHits.length} title= attribute write(s)`);
      if (propHits.length) parts.push(`${propHits.length} .title property write(s): line ${propHits.map((p) => p.line).join(', ')}`);
      failures.push(`${rel}: ${parts.join(' + ')}`);
    } else {
      notes.push(`${rel} — clean (attribute + property forms)`);
    }
  }

  for (const [rel, shims] of Object.entries(allowlist)) {
    const body = src(rel);
    const attrCount = [...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))].length;
    const unexpected = attrCount - shims.length + nativeTitlePropWrites(body).length;
    if (unexpected > 0) {
      failures.push(`${rel}: native titles beyond the pinned truncation shims (${unexpected})`);
    }
    for (const shim of shims) {
      if (!body.includes(shim)) {
        failures.push(`${rel}: pinned shim gone — if the ellipsis truncation was fixed, remove it from ALLOWLIST in scripts/check-ui-native-titles.mjs`);
      } else {
        notes.push(`${rel} — pinned layout-bug shim present (open debt: .sx-sw-row__name ellipsis)`);
      }
    }
  }

  for (const site of wired) {
    const body = src(site.file);
    for (const [needle, count] of site.needles) {
      const found = body.split(needle).length - 1;
      if (found < count) {
        failures.push(`${site.file}: wired site lost its seat — expected ≥${count} of ${JSON.stringify(needle)} (label: ${site.label})`);
      }
    }
    for (const bad of site.forbids || []) {
      if (body.includes(bad)) failures.push(`${site.file}: forbidden pattern returned — ${JSON.stringify(bad)}`);
    }
  }

  return { failures, notes };
}

function runCli() {
  const { failures, notes } = auditNativeTitles();
  for (const n of notes) console.log(`ok   ${n}`);
  for (const f of failures) console.error(`FAIL ${f}`);

  // The functional suite as a subprocess: importing a node:test file registers its tests but a
  // failing assertion does not reject the import — only the child's exit code is a real signal
  // (verified by mutation in check-tier2-why.mjs on 2026-08-23; same rule here).
  const suite = spawnSync(process.execPath, ['--test', join(ROOT, 'test/native-title-sweep.test.mjs')], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (suite.status !== 0) {
    const out = String(suite.stdout || '') + String(suite.stderr || '');
    const detail = out.split('\n').filter((l) => /^not ok|Error:|AssertionError/.test(l.trim())).slice(0, 6).join('; ');
    console.error(`FAIL functional suite — node --test exited ${suite.status}${detail ? ` :: ${detail}` : ''}`);
    failures.push('functional suite');
  } else {
    console.log('ok   functional suite (test/native-title-sweep.test.mjs)');
  }

  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} rule(s) broken.`);
    process.exit(1);
  }
  console.log('\nNative-title sweep OK — no OS tooltips on the live instrument surfaces; converted whys keep a keyboard seat.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
