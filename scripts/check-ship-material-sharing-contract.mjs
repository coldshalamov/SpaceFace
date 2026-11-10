#!/usr/bin/env node
// Contract check: authored ship material sharing must canonicalize opaque hull variants and
// must not regress crowded-flight visible material-key count recorded in the perf profile.
//
// Two halves:
//   synthetic — always runs, hard-fail. Instantiates runMaterialSharingContractProbe.
//   live      — crowded-flight ceiling from a performance profile. Default invocation SKIPS
//               loudly when the profile/metric is missing (clean checkout stays green).
//               Fail-closed form: `--live` / `--require-live-profile` (optional `--profile path`).

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { runMaterialSharingContractProbe } from '../src/render/partsLibrary.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PARTS_LIBRARY = join(ROOT, 'src', 'render', 'partsLibrary.js');
const DEFAULT_PERF_PROFILE = join(ROOT, '.devshots', 'perf', 'performance-profile.json');

function parseArgs(argv) {
  const out = { live: false, profile: DEFAULT_PERF_PROFILE };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--live' || arg === '--require-live-profile') out.live = true;
    else if (arg === '--profile') {
      const value = argv[++i];
      assert.ok(value, '--profile requires a path');
      out.profile = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const source = readFileSync(PARTS_LIBRARY, 'utf8');

assert.match(source, /function materialShareSignature\(/, 'partsLibrary should define materialShareSignature()');
assert.match(source, /function normalizeTintHex\(/, 'partsLibrary should define normalizeTintHex()');
assert.match(source, /sharedReadabilityShellVariants/, 'partsLibrary should pool readability shell materials');

const probe = runMaterialSharingContractProbe(THREE);
assert.equal(probe.hullShareMerged, true, 'opaque hull variants with negligible emissive deltas should share one material');
assert.equal(probe.maplessHullCanonicalized, true, 'mapless hull tint variants should resolve to the textured hull canonical');
assert.equal(probe.canopyShareMerged, true, 'canopy glass should stay on one shared variant');
assert.equal(probe.readabilityShellMerged, true, 'readability shells with same palette should share one material');
assert.equal(probe.geologyPreservesAuthoredColor, true, 'authored geology should not inherit hull tint or fake emissive');
assert.equal(probe.warningPreservesAuthoredColor, true, 'authored warning/paint colors should not inherit faction accent');
assert.equal(probe.mechanicalUsesDarkPalette, true, 'authored machinery should retain the structural dark palette role');
assert.equal(probe.hullProgramFamilyShared, true, 'hull color variants should share one program-family name with distinct color uniforms');
assert.equal(probe.mechanicalProgramFamilyShared, true, 'mechanical color variants should share one program-family name');
// Probe uses two palettes now (family-name proof), so instance count is higher than the single-palette era.
assert.ok(probe.sharedVariantCount <= 10, `expected <=10 shared variants in probe, got ${probe.sharedVariantCount}`);
console.log('ok    runMaterialSharingContractProbe hull/canopy/readability sharing and semantic tint routing');
console.log('ran   synthetic material-sharing contract (hard)');

// Ceiling counts program-family keys (spacefaceProgramFamily / SF_Shared_* without per-tint hex),
// not every palette color instance. Per-color hull/mechanical/accent variants share one compiled
// program with different material.color uniforms; scenario glow/standard props share SF_Scenario_*
// families. Raise only with a written justification naming newly authored distinct shading roles.
const MATERIAL_KEY_CEILING = 49;

/** Collapse legacy tinted SF_Shared_*_RRGGBB keys to the live program-family identity. */
function programFamilyMaterialKey(entry) {
  const raw = typeof entry === 'string' ? entry : (entry && entry.key) || '';
  return String(raw).replace(/(SF_Shared_[A-Za-z0-9_]+?)_[0-9a-f]{6}(?=:|$)/gi, '$1');
}

function relPath(filePath) {
  const rel = relative(ROOT, filePath);
  return rel && !rel.startsWith('..') ? rel.replaceAll('\\', '/') : filePath;
}

function liveFail(message) {
  assert.fail(message);
}

function skipLive(reason, hint) {
  console.log('');
  console.log(`SKIP  live crowded-flight material-key ceiling did not run: ${reason}`);
  console.log(`      ${hint}`);
  console.log('      Fail-closed form: node scripts/check-ship-material-sharing-contract.mjs --live');
  console.log('');
  return 'skipped';
}

function runLiveCeiling({ required, profilePath }) {
  const shown = relPath(profilePath);
  if (!existsSync(profilePath)) {
    const reason = `no performance profile at ${shown}`;
    if (required) {
      liveFail(`live material-key ceiling requires a fresh performance profile at ${shown}`);
    }
    return skipLive(reason, 'On a clean checkout this half is not evidence of crowded-flight sharing.');
  }

  const report = JSON.parse(readFileSync(profilePath, 'utf8'));
  const scenario = (report.scenarios || []).find((entry) => entry.name === 'crowded-flight');
  if (!scenario) {
    const reason = `${shown} has no crowded-flight scenario`;
    if (required) liveFail(`live material-key ceiling requires a crowded-flight scenario in ${shown}`);
    return skipLive(reason, 'The live gate needs the crowded-flight scenario the perf controller writes.');
  }

  const offenders = (scenario.sceneStats && scenario.sceneStats.visibleMaterialKeys) || [];
  let materialKeys = scenario.sceneStats && scenario.sceneStats.visibleMaterialKeyCount;
  if (Array.isArray(offenders) && offenders.length) {
    materialKeys = new Set(offenders.map(programFamilyMaterialKey)).size;
  }

  if (!Number.isFinite(materialKeys)) {
    const reason = `${shown} crowded-flight visibleMaterialKeyCount is absent (and visibleMaterialKeys is empty)`;
    if (required) {
      liveFail(`live material-key ceiling requires a fresh crowded-flight material-key metric in ${shown}`);
    }
    return skipLive(reason, 'A stale or incomplete profile is not a pass.');
  }

  assert.ok(
    materialKeys <= MATERIAL_KEY_CEILING,
    `crowded-flight visible material keys ${materialKeys} regressed above ceiling ${MATERIAL_KEY_CEILING} — inspect sceneStats.visibleMaterialKeys in ${shown}`,
  );
  console.log(`ok    crowded-flight material keys ${materialKeys} <= ceiling ${MATERIAL_KEY_CEILING}`);
  // Mapless family is SF_Shared_hull_hull (optionally with legacy _<hex> suffix). Textured is
  // SF_Shared_hull_textured_hull — do not treat the textured family as mapless.
  const maplessHull = offenders.find((entry) => {
    const key = programFamilyMaterialKey(entry);
    return key.includes('SF_Shared_hull_hull') && !key.includes('SF_Shared_hull_textured_hull');
  });
  assert.equal(maplessHull, undefined, 'mapless hull material keys should canonicalize into textured hull variants');
  console.log('ok    no mapless SF_Shared_hull_hull keys in crowded-flight profile');
  console.log('ran   live crowded-flight material-key ceiling (hard)');
  return 'ran';
}

const liveStatus = runLiveCeiling({ required: args.live, profilePath: args.profile });
if (args.live) {
  console.log('mode  live-gated (synthetic + live ceiling both hard)');
} else {
  console.log('mode  default aggregate (synthetic hard; live skippable)');
}
console.log(`half  synthetic-contract: ran`);
console.log(`half  live-ceiling: ${liveStatus}`);
if (liveStatus === 'ran') {
  console.log('PASS  check:ship-material-sharing [synthetic + live]');
} else {
  console.log('PASS  check:ship-material-sharing [synthetic only; live skipped]');
}
