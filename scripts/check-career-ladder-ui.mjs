#!/usr/bin/env node
/**
 * CL-UI-04 static seam gate — career ladder UI integration.
 *
 * Fail-closed: any missing presenter import, RECOVER bus seam, station rail,
 * mission-log chip, Hauler/Hunter choice ids, step_failed abandon, mapAuthority
 * map path, owner-field write, or visor/portrait motif fails the check.
 *
 * Does not edit package/production. Does not inspect SAFE-001.
 *
 * Run: node scripts/check-career-ladder-ui.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const PATHS = Object.freeze({
  presenter: 'src/ui/careerLadderView.js',
  stationHub: 'src/ui/screens/stationHub.js',
  missionLog: 'src/ui/screens/missionLog.js',
  ladderShared: 'src/careers/ladders/ladderShared.js',
  careerLadders: 'src/careers/ladders/careerLadders.js',
  haulerDefs: 'src/careers/ladders/haulerLadderDefs.js',
  hunterDefs: 'src/careers/ladders/hunterLadderDefs.js',
  mapAuthority: 'src/ui/mapAuthority.js',
});

const HAULER_CHOICES = Object.freeze(['pay_toll', 'run_guns', 'veer_slip']);
const HUNTER_CAPTURE_CHOICES = Object.freeze(['capture', 'execute']);
const HUNTER_LEDGER_CHOICES = Object.freeze(['file_law', 'sell_dark']);

const LADDER_MUTATION_EVENTS = Object.freeze([
  'career:ladder:accept',
  'career:ladder:decline',
  'career:ladder:abandon',
  'career:ladder:choose',
  'career:ladder:recover',
]);

const FORBIDDEN_VISOR = Object.freeze([
  'visor',
  'helmet-avatar',
  'pilot-portrait',
  'cockpit-arc',
  'hud-avatar',
  'screen-edge-arc',
]);

// Assignment-only patterns (reads like state.player.cargo.items are allowed).
const FORBIDDEN_OWNER_WRITES = Object.freeze([
  /state\.careers\.ladders\s*=/,
  /state\.careers\.ladders(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=/,
  /state\.player\.credits\s*[+\-*/]?=/,
  /state\.player\.heat\s*[+\-*/]?=/,
  /state\.player\.cargo\s*=/,
  /state\.player\.cargo\.[A-Za-z_$][\w$]*\s*[+\-*/]?=/,
  /state\.factions\[[^\]]+\]\.rep\s*[+\-*/]?=/,
  /state\.story\.beatIndex\s*[+\-*/]?=/,
]);

const failures = [];

function rel(p) {
  return path.join(ROOT, p);
}

function read(relPath) {
  const abs = rel(relPath);
  assert.ok(existsSync(abs), `missing required file: ${relPath}`);
  return readFileSync(abs, 'utf8');
}

function fail(msg) {
  failures.push(msg);
}

function mustMatch(src, re, label) {
  if (!re.test(src)) fail(label);
}

function mustNotMatch(src, re, label) {
  if (re.test(src)) fail(label);
}

function stripCommentsAndStrings(src) {
  // Lightweight strip so CSS/comments do not create false owner-write hits.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
}

// ── load sources ─────────────────────────────────────────────────────────────
const presenter = read(PATHS.presenter);
const stationHub = read(PATHS.stationHub);
const missionLog = read(PATHS.missionLog);
const ladderShared = read(PATHS.ladderShared);
const careerLadders = read(PATHS.careerLadders);
const haulerDefs = read(PATHS.haulerDefs);
const hunterDefs = read(PATHS.hunterDefs);
const mapAuthority = read(PATHS.mapAuthority);

const stationCode = stripCommentsAndStrings(stationHub);
const missionCode = stripCommentsAndStrings(missionLog);
const presenterCode = stripCommentsAndStrings(presenter);

// ── 1) Presenter imports ─────────────────────────────────────────────────────
mustMatch(
  stationHub,
  /import\s*\{\s*buildLadderRailModel\s*\}\s*from\s*['"]\.\.\/careerLadderView\.js['"]/,
  'stationHub must import buildLadderRailModel from careerLadderView.js',
);
mustMatch(
  missionLog,
  /import\s*\{\s*buildMissionLogCareerChip\s*\}\s*from\s*['"]\.\.\/careerLadderView\.js['"]/,
  'missionLog must import buildMissionLogCareerChip from careerLadderView.js',
);
mustMatch(
  presenter,
  /export\s+function\s+buildLadderRailModel\s*\(/,
  'careerLadderView must export buildLadderRailModel',
);
mustMatch(
  presenter,
  /export\s+function\s+buildMissionLogCareerChip\s*\(/,
  'careerLadderView must export buildMissionLogCareerChip',
);
mustMatch(
  presenter,
  /export\s+function\s+buildLadderMapAction\s*\(/,
  'careerLadderView must export buildLadderMapAction',
);
mustMatch(
  presenter,
  /from\s*['"]\.\/mapAuthority\.js['"]/,
  'presenter must import mapAuthority for map handoffs',
);

// ── 2) RECOVER bus seam ──────────────────────────────────────────────────────
mustMatch(
  ladderShared,
  /RECOVER\s*:\s*['"]career:ladder:recover['"]/,
  'ladderShared CAREER_LADDER_EVENTS.RECOVER must be career:ladder:recover',
);
mustMatch(
  careerLadders,
  /CAREER_LADDER_EVENTS\.RECOVER/,
  'careerLadders must reference CAREER_LADDER_EVENTS.RECOVER',
);
mustMatch(
  careerLadders,
  /this\.recover\s*\(\s*payload\.careerId/,
  'careerLadders RECOVER listener must forward to this.recover(careerId)',
);
mustMatch(
  stationHub,
  /career:ladder:recover/,
  'stationHub must emit career:ladder:recover',
);
mustMatch(
  missionLog,
  /career:ladder:recover/,
  'missionLog must emit career:ladder:recover when recover is ready',
);

// ── 3) Station rail + Mission Log chip testids ───────────────────────────────
mustMatch(
  stationHub,
  /setAttribute\(\s*['"]data-testid['"]\s*,\s*['"]career-ladder-rail['"]\s*\)|data-testid\s*=\s*['"]career-ladder-rail['"]/,
  'stationHub must mount data-testid=career-ladder-rail',
);
mustMatch(
  stationHub,
  /className\s*=\s*['"]st-ladder-rail['"]|class="st-ladder-rail"/,
  'stationHub rail root must use st-ladder-rail class',
);
mustMatch(
  stationHub,
  /data-testid\s*=\s*['"]career-ladder-accept['"]/,
  'stationHub must expose career-ladder-accept',
);
mustMatch(
  missionLog,
  /data-testid\s*=\s*['"]mission-log-career-chip['"]/,
  'missionLog must mount data-testid=mission-log-career-chip',
);
mustMatch(
  missionLog,
  /sf-mlog-career/,
  'missionLog career chip must use sf-mlog-career class',
);

// ── 4) All Hauler / Hunter player choices reachable in defs + UI surface ─────
for (const id of HAULER_CHOICES) {
  mustMatch(haulerDefs, new RegExp(`id:\\s*['"]${id}['"]`), `hauler defs must define choice ${id}`);
}
mustMatch(haulerDefs, /id:\s*['"]risk_lane_tax['"]/, 'hauler defs must define risk_lane_tax step');
for (const id of HUNTER_CAPTURE_CHOICES) {
  mustMatch(hunterDefs, new RegExp(`id:\\s*['"]${id}['"]`), `hunter defs must define capture choice ${id}`);
}
for (const id of HUNTER_LEDGER_CHOICES) {
  mustMatch(hunterDefs, new RegExp(`id:\\s*['"]${id}['"]`), `hunter defs must define ledger choice ${id}`);
}
mustMatch(hunterDefs, /id:\s*['"]capture_window['"]/, 'hunter defs must define capture_window');
mustMatch(hunterDefs, /id:\s*['"]ledger_choice['"]/, 'hunter defs must define ledger_choice');

// UI path-choice surface (station rail renders choice ids from presenter/defs)
mustMatch(
  stationHub,
  /data-ladder-choice|data-testid="career-ladder-path-choice-/,
  'stationHub must render path choice buttons with data-ladder-choice',
);
mustMatch(
  stationHub,
  /career:ladder:choose/,
  'stationHub must emit career:ladder:choose for path decisions',
);
mustMatch(
  missionLog,
  /career:ladder:choose|data-career-act="choose"|data-choice-id/,
  'missionLog must surface choice CTAs via career:ladder:choose',
);

// Presenter must surface def choice labels (not invent progression)
mustMatch(
  presenter,
  /stepDef\.choices|buildChoices/,
  'presenter must build choices from step definitions',
);

// Static proof that all choice ids appear in defs consumed by UI chain
const allChoiceIds = [...HAULER_CHOICES, ...HUNTER_CAPTURE_CHOICES, ...HUNTER_LEDGER_CHOICES];
for (const id of allChoiceIds) {
  const inHauler = haulerDefs.includes(`'${id}'`) || haulerDefs.includes(`"${id}"`);
  const inHunter = hunterDefs.includes(`'${id}'`) || hunterDefs.includes(`"${id}"`);
  if (!inHauler && !inHunter) fail(`choice id ${id} missing from branch defs`);
}

// ── 5) step_failed abandon ───────────────────────────────────────────────────
mustMatch(
  ladderShared,
  /function\s+transitionAbandon[\s\S]*?LADDER_STATUS\.STEP_FAILED/,
  'transitionAbandon must allow STEP_FAILED status',
);
mustMatch(
  presenter,
  /ABANDONABLE[\s\S]*?STEP_FAILED|STEP_FAILED[\s\S]*?canAbandon|canAbandon[\s\S]*?STEP_FAILED/,
  'presenter canAbandon must include step_failed / STEP_FAILED',
);
// Explicit set membership is the live presenter contract
mustMatch(
  presenter,
  /const\s+ABANDONABLE\s*=\s*new\s+Set\s*\(\s*\[[\s\S]*?STEP_FAILED[\s\S]*?\]\s*\)/,
  'presenter ABANDONABLE set must include LADDER_STATUS.STEP_FAILED',
);
mustMatch(
  stationHub,
  /canAbandon/,
  'stationHub must gate abandon button on canAbandon',
);
mustMatch(
  missionLog,
  /canAbandon/,
  'missionLog must gate abandon CTA on canAbandon',
);

// ── 6) mapAuthority-only route ───────────────────────────────────────────────
mustMatch(
  mapAuthority,
  /export\s+function\s+openGalaxyMap\s*\(/,
  'mapAuthority must export openGalaxyMap',
);
mustMatch(
  stationHub,
  /import\s*\{[^}]*openGalaxyMap[^}]*\}\s*from\s*['"]\.\.\/mapAuthority\.js['"]/,
  'stationHub must import openGalaxyMap from mapAuthority',
);
mustMatch(
  missionLog,
  /import\s*\{[^}]*openGalaxyMap[^}]*\}\s*from\s*['"]\.\.\/mapAuthority\.js['"]/,
  'missionLog must import openGalaxyMap from mapAuthority',
);
mustMatch(
  stationHub,
  /openGalaxyMap\s*\(\s*ctx/,
  'stationHub ladder map CTA must call openGalaxyMap(ctx, …)',
);
mustMatch(
  missionLog,
  /openGalaxyMap\s*\(\s*ctx|openMapScreen\s*\(/,
  'missionLog map path must use openGalaxyMap / openMapScreen map authority helper',
);

// Forbidden: normal-player pushScreen to legacy map ids from ladder UI files
mustNotMatch(
  stationCode,
  /pushScreen\s*\(\s*['"]localmap['"]\s*\)/,
  'stationHub must not pushScreen(localmap) for ladder map',
);
mustNotMatch(
  stationCode,
  /pushScreen\s*\(\s*['"]starmap['"]\s*\)/,
  'stationHub must not pushScreen(starmap) for ladder map',
);
mustNotMatch(
  missionCode,
  /pushScreen\s*\(\s*['"]localmap['"]\s*\)/,
  'missionLog must not pushScreen(localmap)',
);
mustNotMatch(
  missionCode,
  /pushScreen\s*\(\s*['"]starmap['"]\s*\)/,
  'missionLog must not pushScreen(starmap)',
);
mustNotMatch(
  presenterCode,
  /pushScreen\s*\(/,
  'presenter must not push screens (map handoff shapes only)',
);

// ── 7) No direct owner writes from UI surfaces ───────────────────────────────
for (const [label, src] of [
  ['stationHub', stationCode],
  ['missionLog', missionCode],
  ['careerLadderView', presenterCode],
]) {
  for (const re of FORBIDDEN_OWNER_WRITES) {
    if (re.test(src)) fail(`${label} must not directly write owner fields (${re})`);
  }
}

// Ladder mutations from stationHub must be bus intents only
for (const ev of LADDER_MUTATION_EVENTS) {
  if (ev === 'career:ladder:accept' || ev === 'career:ladder:decline') {
    // accept/decline preferred at station only
    mustMatch(stationHub, new RegExp(ev.replace(/:/g, '\\:')), `stationHub must emit ${ev}`);
  }
}
mustMatch(stationHub, /career:ladder:abandon/, 'stationHub must emit career:ladder:abandon');
mustMatch(stationHub, /career:ladder:choose/, 'stationHub must emit career:ladder:choose');

// missionLog must not accept/decline ladders (station owns start)
mustNotMatch(
  missionLog,
  /career:ladder:accept/,
  'missionLog must not emit career:ladder:accept (station owns start)',
);
mustNotMatch(
  missionLog,
  /career:ladder:decline/,
  'missionLog must not emit career:ladder:decline',
);

// Presenter must not emit bus events
mustNotMatch(presenterCode, /\.emit\s*\(/, 'presenter must not emit bus events');
mustNotMatch(presenter, /Math\.random\s*\(/, 'presenter must not use Math.random');
mustNotMatch(presenter, /Date\.now\s*\(/, 'presenter must not use Date.now');

// ── 8) No visor / portrait motifs ────────────────────────────────────────────
for (const [label, src] of [
  ['stationHub', stationHub],
  ['missionLog', missionLog],
  ['careerLadderView', presenter],
]) {
  for (const token of FORBIDDEN_VISOR) {
    // Allow documentary comments that forbid the motif (e.g. "no visor/portrait")
    const re = new RegExp(
      `(?<![\\w-])${token.replace(/-/g, '[-_]?')}(?![\\w-])`,
      'i',
    );
    const matches = src.match(new RegExp(`.{0,40}${token}.{0,40}`, 'gi')) || [];
    const bad = matches.filter((m) => {
      const lower = m.toLowerCase();
      // Documentary forbids are OK
      if (/\bno\b.*visor|visor.*forbid|not.*visor|without.*visor|no visor|no pilot|no portrait|non-diegetic/i.test(lower)) {
        return false;
      }
      if (/\/\*|\/\//.test(m) && /no|forbid|never|avoid|without/i.test(lower)) return false;
      return re.test(m);
    });
    // Stronger: class / id / data attributes using forbidden tokens
    if (new RegExp(`(?:class|id|data-[\\w-]+)\\s*[=:]\\s*['"\`][^'"\`]*${token}`, 'i').test(src)) {
      fail(`${label} must not use visor/portrait class/id/data attribute containing "${token}"`);
    }
    // CSS selectors that introduce visor chrome
    if (new RegExp(`\\.${token}|#${token}`, 'i').test(src)
      && !/no visor|no pilot|no portrait|non-diegetic/i.test(src)) {
      fail(`${label} must not define visor/portrait selector for "${token}"`);
    }
    if (bad.length) {
      fail(`${label} contains forbidden player-facing ${token} motif: ${bad[0]}`);
    }
  }
}

// Explicit positive non-diegetic markers expected by taste contract comments
mustMatch(
  stationHub,
  /no visor|non-diegetic|Professional ladder rail/i,
  'stationHub ladder CSS/comments must keep non-diegetic / no-visor stance',
);
mustMatch(
  missionLog,
  /no visor|non-diegetic|Career ladder chip/i,
  'missionLog career chip CSS/comments must keep non-diegetic / no-visor stance',
);

// ── 9) Gamepad tabbability of career branch controls ─────────────────────────
// Non-selected branch buttons must NOT use tabindex=-1; gamepad D-pad focus
// traversal only sees tabbable controls. Selected state is aria-pressed only.
mustMatch(
  stationHub,
  /data-ladder-career[\s\S]{0,320}tabindex="0"/,
  'stationHub career branch controls must expose tabindex=0 for gamepad reachability',
);
mustNotMatch(
  stationHub,
  /tabindex="' \+ \(selected \? '0' : '-1'\)|tabindex="\$\{selected \? ['"]0['"] : ['"]-1['"]\}/,
  'stationHub must not set non-selected career branch controls to tabindex=-1',
);
mustNotMatch(
  stationHub,
  /data-ladder-career[\s\S]{0,400}tabindex="' \+ \(selected/,
  'stationHub career branch template must not use selected-conditional tabindex',
);
// Selected state still required for AT / keyboard
mustMatch(
  stationHub,
  /aria-pressed="' \+ \(selected \? 'true' : 'false'\)|aria-pressed="\$\{selected/,
  'stationHub career branch controls must keep aria-pressed selected state',
);
mustMatch(
  stationHub,
  /ArrowLeft[\s\S]*?Home[\s\S]*?End|_onLadderRailKeydown[\s\S]*?Home/,
  'stationHub must retain keyboard Arrow/Home/End career branch navigation',
);

// ── 10) Focus preservation across ladder rail repaint ────────────────────────
mustMatch(
  stationHub,
  /_captureLadderFocusToken\s*\(/,
  'stationHub must capture ladder focus token before rail repaint',
);
mustMatch(
  stationHub,
  /_restoreLadderFocusToken\s*\(/,
  'stationHub must restore ladder focus token after rail repaint',
);
mustMatch(
  stationHub,
  /_refreshLadderRail\s*\(\s*\)\s*\{[\s\S]*?_captureLadderFocusToken[\s\S]*?_restoreLadderFocusToken/,
  'stationHub _refreshLadderRail must capture then restore focus token around repaint',
);
mustMatch(
  stationHub,
  /kind:\s*['"]career['"][\s\S]*?kind:\s*['"]choice['"]|kind:\s*['"]career['"][\s\S]*?kind:\s*['"]action['"]/,
  'stationHub focus token must cover career/action/choice kinds',
);
// Must not steal focus when it was outside the rail
mustMatch(
  stationHub,
  /_captureLadderFocusToken[\s\S]*?contains\(active\)[\s\S]*?return null/,
  'stationHub focus capture must return null when focus is outside the ladder rail',
);

// ── 11) MissionLog periodic no-op + career CTA focus preserve ────────────────
mustMatch(
  missionLog,
  /refresh\s*\(\s*ctx\s*,\s*options\s*=\s*\{\s*\}\s*\)|refresh\s*\(\s*ctx\s*,\s*options\s*\)/,
  'missionLog refresh must accept options (for periodic no-op)',
);
mustMatch(
  missionLog,
  /options\.periodic|options\s*&&\s*options\.periodic/,
  'missionLog refresh must read options.periodic',
);
mustMatch(
  missionLog,
  /if\s*\(\s*options\s*&&\s*options\.periodic\s*\)\s*return|if\s*\(\s*options\.periodic\s*\)\s*return/,
  'missionLog periodic refresh must no-op without full repaint',
);
mustMatch(
  missionLog,
  /_captureCareerFocusToken\s*\(/,
  'missionLog must capture career CTA focus token before chip repaint',
);
mustMatch(
  missionLog,
  /_restoreCareerFocusToken\s*\(/,
  'missionLog must restore career CTA focus after chip repaint when action still exists',
);
mustMatch(
  missionLog,
  /_renderCareerChip\s*\(\s*state\s*\)\s*\{[\s\S]*?_captureCareerFocusToken[\s\S]*?_restoreCareerFocusToken/,
  'missionLog _renderCareerChip must preserve focused career CTA across event-driven repaint',
);

// Station mission-log CTA: canonical nested push only (no invented authority)
mustMatch(
  stationHub,
  /pushScreen\s*\(\s*['"]missionLog['"]\s*\)/,
  'stationHub mission-log CTA must use canonical pushScreen(missionLog)',
);

// ── 12) Fail closed summary ──────────────────────────────────────────────────
if (failures.length) {
  console.error('[check-career-ladder-ui] FAIL_CLOSED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  gate: 'check-career-ladder-ui',
  proves: [
    'presenter_imports',
    'recover_seam',
    'station_rail',
    'mission_log_chip',
    'hauler_hunter_choices',
    'step_failed_abandon',
    'mapAuthority_only_route',
    'no_direct_owner_writes',
    'no_visor_portrait',
    'gamepad_tabbability',
    'ladder_focus_preserve',
    'missionlog_periodic_noop',
    'missionlog_career_focus_preserve',
    'station_missionlog_canonical_push',
  ],
  files: PATHS,
  choiceIds: {
    hauler_risk_lane_tax: HAULER_CHOICES,
    hunter_capture_window: HUNTER_CAPTURE_CHOICES,
    hunter_ledger_choice: HUNTER_LEDGER_CHOICES,
  },
}, null, 2));
console.log('[check-career-ladder-ui] PASS');
