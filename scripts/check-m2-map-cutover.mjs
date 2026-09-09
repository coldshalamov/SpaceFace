#!/usr/bin/env node
// M2-C4 map/travel cutover contract gate (fail-closed).
//
// Proves / rejects:
//   - one public map authority (mapAuthority → galaxyMap)
//   - waypoint/autopilot arming via world-owned ui:setCourse / world:requestRoute
//   - reciprocal 24-region route truth
//   - continuous corridor vs intentional gate semantics
//   - scanner/local tactical without a second world authority
//   - map discovery/fog truth
//   - save/Continue route identity
//   - dual-primary callers and phantom scripts
//
// Run: node scripts/check-m2-map-cutover.mjs
//      npm run check:m2:map-cutover
// Also: node --test test/m2-map-cutover.test.mjs test/m2-map-travel-semantics.test.mjs
//
// Executable gate for one public map authority cutover (GAP-11 package wiring included).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const DEFECTS = {
  PAUSE_DUAL_PRIMARY: 'DEF-C4-01_PAUSE_DUAL_PRIMARY',
  LEGACY_REGISTERED: 'DEF-C4-02_LEGACY_MAP_SCREENS_REGISTERED',
  PACKAGE_UNWIRED: 'DEF-C4-03_PACKAGE_JSON_MAP_CUTOVER_UNWIRED',
};

const results = [];
let hardFail = 0;
let cutoverRed = 0;

function section(name) {
  console.log(`\n== ${name} ==`);
}

function record(id, status, detail = '') {
  results.push({ id, status, detail });
  const mark = status === 'PASS' ? 'PASS' : status === 'RED' ? 'RED ' : 'FAIL';
  console.log(`  [${mark}] ${id}${detail ? ` — ${detail}` : ''}`);
  if (status === 'FAIL') hardFail += 1;
  if (status === 'RED') cutoverRed += 1;
}

function runNodeTest(files) {
  const args = ['--test', ...files.map((f) => join(ROOT, f))];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function runCmd(label, command, args) {
  // Never enable shell for node paths — "C:\Program Files\..." breaks on spaces under cmd.
  // On Windows, npm is npm.cmd; resolve via shell only for that case.
  const isNpm = command === 'npm' || command === 'npm.cmd';
  const exe = isNpm && process.platform === 'win32' ? 'npm.cmd' : command;
  const r = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    shell: isNpm && process.platform === 'win32',
    windowsHide: true,
  });
  return {
    label,
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message || r.error) : '',
  };
}

// ── Static fail-closed seams ────────────────────────────────────────────────

section('static: public map authority + dual-primary rejection');

assert.ok(existsSync(join(ROOT, 'src/ui/mapAuthority.js')), 'mapAuthority.js must exist');
assert.ok(existsSync(join(ROOT, 'src/ui/galaxyMap.js')), 'galaxyMap.js must exist');
assert.ok(existsSync(join(ROOT, 'test/m2-map-cutover.test.mjs')), 'cutover test must exist');
assert.ok(existsSync(join(ROOT, 'test/m2-map-travel-semantics.test.mjs')), 'travel test must exist');

const mapAuthority = read('src/ui/mapAuthority.js');
const uiInput = read('src/ui/input.js');
const uiRoot = read('src/ui/uiRoot.js');
const pause = read('src/ui/screens/pause.js');
const missionLog = read('src/ui/screens/missionLog.js');
const stationHub = read('src/ui/station/stationApp.js') + read('src/ui/station/screens/contracts.js');
const galaxyMap = read('src/ui/galaxyMap.js');
const world = read('src/systems/world.js');
const pkg = JSON.parse(read('package.json'));

// Sibling UIUX gate: if present must import live mapAuthority seams (not an empty stub).
const mapAuthRel = 'scripts/check-map-authority.mjs';
if (existsSync(join(ROOT, mapAuthRel))) {
  const body = read(mapAuthRel);
  if (body.length > 200 && /mapAuthority\.js/.test(body) && /openGalaxyMap|MAP_SCREEN_ID/.test(body)) {
    record('sibling-check-map-authority', 'PASS', 'UIUX check-map-authority.mjs imports live mapAuthority seams');
  } else {
    record('sibling-check-map-authority', 'FAIL', 'check-map-authority.mjs exists but is a phantom/stub');
  }
} else {
  record('sibling-check-map-authority', 'PASS', 'no check-map-authority.mjs (optional sibling gate)');
}

// Reject package.json phantom script entries that point at missing files.
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (!/map-authority|map-cutover|m2:map|m2-map/i.test(name) && !/map-authority|map-cutover|m2-map-cutover/i.test(String(cmd))) {
    continue;
  }
  const m = String(cmd).match(/node\s+([^\s&|;]+)/);
  if (!m) continue;
  const rel = m[1].replace(/^\.\//, '');
  if (!existsSync(join(ROOT, rel))) {
    record(`phantom-npm-${name}`, 'FAIL', `package.json script points at missing ${rel}`);
  }
}

assert.match(mapAuthority, /export const MAP_SCREEN_ID = 'galaxyMap'/);
assert.match(mapAuthority, /export function openGalaxyMap/);
assert.match(uiInput, /openGalaxyMap/);
assert.match(missionLog, /openGalaxyMap|mapHandoffAction/);
assert.match(stationHub, /openGalaxyMap/);
assert.match(uiRoot, /isMapScreenId/);
assert.match(uiRoot, /openGalaxyMap/);
assert.match(galaxyMap, /ui:setCourse/);
assert.match(galaxyMap, /world:requestRoute/);
assert.doesNotMatch(galaxyMap, /state\.nav\.route\s*=/);
assert.match(world, /computeRoute\(/);
assert.match(world, /bus\.on\(\s*['"]ui:setCourse['"]/);
assert.match(world, /placePlayer = !noTeleport/);
record('static-openers-world-route', 'PASS', 'openGalaxyMap + world route ownership seams present');

// Dual-primary: fail-closed — any normal-player opener still targeting legacy screens is RED.
const pauseDual =
  /screenId:\s*['"]localmap['"]/.test(pause)
  || /screenId:\s*['"]starmap['"]/.test(pause)
  || /pushScreen\(\s*['"]localmap['"]\s*\)/.test(pause)
  || /pushScreen\(\s*['"]starmap['"]\s*\)/.test(pause);
const inputDual =
  /pushScreen\(\s*['"]localmap['"]\s*\)/.test(uiInput)
  || /pushScreen\(\s*['"]starmap['"]\s*\)/.test(uiInput);
const missionLogDual =
  /screenId:\s*['"]localmap['"]/.test(missionLog)
  || /screenId:\s*['"]starmap['"]/.test(missionLog)
  || (/pushScreen\(\s*['"]localmap['"]\s*\)/.test(missionLog) && !/openGalaxyMap/.test(missionLog))
  || (/pushScreen\(\s*['"]starmap['"]\s*\)/.test(missionLog) && !/openGalaxyMap/.test(missionLog));
const stationDual =
  /pushScreen\(\s*['"]localmap['"]\s*\)/.test(stationHub)
  || /pushScreen\(\s*['"]starmap['"]\s*\)/.test(stationHub);
// Canonical openers must all route through openGalaxyMap (not dual-primary legacy push).
const openersCanonical =
  /openGalaxyMap/.test(uiInput)
  && /openGalaxyMap/.test(missionLog)
  && /openGalaxyMap/.test(stationHub)
  && /openGalaxyMap/.test(pause)  && /isMapScreenId/.test(uiRoot)
  && /openGalaxyMap/.test(uiRoot)
  && !pauseDual
  && !inputDual
  && !stationDual
  && !(/screenId:\s*['"]localmap['"]/.test(missionLog) || /screenId:\s*['"]starmap['"]/.test(missionLog));

if (pauseDual || inputDual || stationDual || missionLogDual) {
  const who = [
    pauseDual ? 'pause' : null,
    inputDual ? 'ui/input' : null,
    stationDual ? 'stationHub' : null,
    missionLogDual ? 'missionLog' : null,
  ].filter(Boolean).join(', ');
  record(
    DEFECTS.PAUSE_DUAL_PRIMARY,
    'RED',
    `normal-player dual-primary still present (${who}); expected mapHandoffAction/openGalaxyMap → galaxyMap + MAP_FOCUS only`,
  );
} else {
  record(DEFECTS.PAUSE_DUAL_PRIMARY, 'PASS', 'pause/input/missionLog/stationHub no longer dual-primary legacy map screens');
}

// Legacy starmap/localmap registration is compatibility/tool-only.
// PASS only when every normal-player opener is proven canonical galaxyMap; otherwise RED.
const legacyRegistered =
  /name:\s*['"]starmapScreen['"]/.test(uiRoot)
  || /name:\s*['"]localmapScreen['"]/.test(uiRoot)
  || /starmapScreen|localmapScreen/.test(uiRoot);
if (!legacyRegistered) {
  record(DEFECTS.LEGACY_REGISTERED, 'PASS', 'legacy map screens no longer registered');
} else if (openersCanonical) {
  record(
    DEFECTS.LEGACY_REGISTERED,
    'PASS',
    'legacy starmap/localmap still registered as tools/checks only; all normal-player openers proven canonical galaxyMap',
  );
} else {
  record(
    DEFECTS.LEGACY_REGISTERED,
    'RED',
    'legacy starmap/localmap still registered while a normal-player opener is not yet canonical galaxyMap',
  );
}

// package wiring (C5)
const wired = !!(pkg.scripts && (pkg.scripts['check:m2:map-cutover'] || pkg.scripts['check:m2-map-cutover']));
if (!wired) {
  record(
    DEFECTS.PACKAGE_UNWIRED,
    'RED',
    'package.json does not register check:m2:map-cutover (M2-C5 / GAP-11); run via node scripts/check-m2-map-cutover.mjs',
  );
} else {
  record(DEFECTS.PACKAGE_UNWIRED, 'PASS', 'npm script registered');
}

// ── Unit / integration contract tests ───────────────────────────────────────

section('node --test m2-map-cutover + m2-map-travel-semantics');

const unit = runNodeTest([
  'test/m2-map-cutover.test.mjs',
  'test/m2-map-travel-semantics.test.mjs',
]);
// Parse fail-closed cutover assertions vs hard failures.
const unitOut = `${unit.stdout}\n${unit.stderr}`;
const pauseFail = /DEF-C4-01_PAUSE_DUAL_PRIMARY/.test(unitOut) || /pauseMapAction\.screenId must be/.test(unitOut);
const hardUnitNoise = unit.ok ? false : !pauseFail;

if (unit.ok) {
  record('unit-contracts', 'PASS', 'all m2-map-* tests green');
} else if (pauseFail) {
  // Expected honest red while pause dual-primary remains.
  record(
    'unit-contracts',
    'RED',
    'm2-map-cutover fail-closed on DEF-C4-01 pause dual-primary (other contracts may still pass — see node --test detail)',
  );
  // Re-run excluding the two pause dual-primary tests to confirm foundation green.
  // node:test has no easy exclude; instead run travel-only + rely on static sections.
  const travelOnly = runNodeTest(['test/m2-map-travel-semantics.test.mjs']);
  if (travelOnly.ok) {
    record('unit-travel-semantics', 'PASS', 'm2-map-travel-semantics all green');
  } else {
    record('unit-travel-semantics', 'FAIL', travelOnly.stderr.slice(0, 500) || travelOnly.stdout.slice(-500));
  }
} else {
  record('unit-contracts', 'FAIL', unitOut.slice(-1200));
}

// ── Existing M2b / map geography gates ──────────────────────────────────────

section('existing M2b map/graph/geography checks');

const existing = [
  { label: 'check-m2b-sector-graph', cmd: process.execPath, args: [join(ROOT, 'scripts/check-m2b-sector-graph.mjs')] },
  { label: 'check-m2b-region-data', cmd: process.execPath, args: [join(ROOT, 'scripts/check-m2b-region-data.mjs')] },
  { label: 'test-m2b-map-route', cmd: process.execPath, args: ['--test', join(ROOT, 'test/m2b-map-route.test.mjs')] },
  { label: 'test-m2b-sector-graph', cmd: process.execPath, args: ['--test', join(ROOT, 'test/m2b-sector-graph.test.mjs')] },
  { label: 'check-map-confidence', cmd: process.execPath, args: [join(ROOT, 'scripts/check-map-confidence.mjs')] },
  { label: 'check-galaxy-map-inspector', cmd: process.execPath, args: [join(ROOT, 'test/galaxy-map-inspector-stability.test.mjs')] },
  { label: 'check-mission-log-map-handoff', cmd: process.execPath, args: [join(ROOT, 'scripts/check-mission-log-map-handoff.mjs')] },
  { label: 'check-sector-geography', cmd: 'npm', args: ['run', 'check:sector-geography'] },
];

for (const step of existing) {
  if (step.cmd === process.execPath && step.args[0] && !existsSync(step.args[0]) && !step.args.includes('--test')) {
    // for --test form, file is last arg
  }
  const fileArg = step.args.find((a) => typeof a === 'string' && (a.endsWith('.mjs') || a.endsWith('.js')));
  if (fileArg && !existsSync(fileArg) && step.cmd === process.execPath) {
    record(step.label, 'FAIL', `missing ${fileArg}`);
    continue;
  }
  const r = runCmd(step.label, step.cmd, step.args);
  if (r.ok) {
    record(step.label, 'PASS');
  } else {
    // sector-geography has historical reds; treat as RED not hard FAIL when exit non-zero known P1
    if (step.label === 'check-sector-geography') {
      record(step.label, 'RED', (r.stderr || r.stdout).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 400));
    } else {
      record(step.label, 'FAIL', (r.stderr || r.stdout).split('\n').filter(Boolean).slice(-6).join(' | ').slice(0, 500));
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

section('summary');

const summary = {
  schema: 'spaceface.m2c4.mapCutoverCheck.v1',
  generatedAt: new Date().toISOString(),
  packet: 'M2-C4',
  hardFail,
  cutoverRed,
  results,
  defects: Object.values(DEFECTS),
  exitPolicy: {
    0: 'full green — cutover contract + existing gates pass',
    1: 'hard failure — foundation broken or unexpected test failure',
    2: 'honest red — cutover incomplete (known DEF-C4-*) or pre-existing geography red; foundation otherwise sound',
  },
};

const reportDir = join(ROOT, '.campaign', 'M2-C4-MAP-TRAVEL-CONTRACT-OPENCODE-001');
try {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, 'check-report.json'), JSON.stringify(summary, null, 2));
} catch (err) {
  console.warn('[check-m2-map-cutover] could not write campaign report:', err.message);
}

const passCount = results.filter((r) => r.status === 'PASS').length;
const redCount = results.filter((r) => r.status === 'RED').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n[check-m2-map-cutover] PASS=${passCount} RED=${redCount} FAIL=${failCount}`);

if (failCount > 0 || hardFail > 0) {
  console.error('[check-m2-map-cutover] HARD FAIL');
  process.exit(1);
}
if (redCount > 0 || cutoverRed > 0) {
  console.error('[check-m2-map-cutover] HONEST RED — cutover incomplete (see DEF-C4-* and check-report.json)');
  process.exit(2);
}
console.log('[check-m2-map-cutover] PASS — full cutover contract green');
process.exit(0);
