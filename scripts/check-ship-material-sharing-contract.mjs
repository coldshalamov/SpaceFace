#!/usr/bin/env node
// Contract check: authored ship material sharing must canonicalize opaque hull variants and
// must not regress crowded-flight visible material-key count recorded in the perf profile.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { runMaterialSharingContractProbe } from '../src/render/partsLibrary.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PARTS_LIBRARY = join(ROOT, 'src', 'render', 'partsLibrary.js');
const PERF_PROFILE = join(ROOT, '.devshots', 'perf', 'performance-profile.json');

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

if (existsSync(PERF_PROFILE)) {
  const report = JSON.parse(readFileSync(PERF_PROFILE, 'utf8'));
  const scenario = (report.scenarios || []).find((entry) => entry.name === 'crowded-flight');
  const offenders = (scenario && scenario.sceneStats && scenario.sceneStats.visibleMaterialKeys) || [];
  let materialKeys = scenario && scenario.sceneStats && scenario.sceneStats.visibleMaterialKeyCount;
  if (Array.isArray(offenders) && offenders.length) {
    materialKeys = new Set(offenders.map(programFamilyMaterialKey)).size;
  }
  if (Number.isFinite(materialKeys)) {
    assert.ok(
      materialKeys <= MATERIAL_KEY_CEILING,
      `crowded-flight visible material keys ${materialKeys} regressed above ceiling ${MATERIAL_KEY_CEILING} — inspect sceneStats.visibleMaterialKeys in ${PERF_PROFILE}`,
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
  } else {
    console.log('warn  performance profile present but crowded-flight material key count missing');
  }
} else {
  console.log('warn  no .devshots/perf/performance-profile.json — skipping live material-key ceiling check');
}

console.log('ok    runMaterialSharingContractProbe hull/canopy/readability sharing and semantic tint routing');
console.log('PASS  check:ship-material-sharing');
