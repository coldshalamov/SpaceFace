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
assert.ok(probe.sharedVariantCount <= 3, `expected <=3 shared variants in probe, got ${probe.sharedVariantCount}`);

const MATERIAL_KEY_CEILING = 49;
if (existsSync(PERF_PROFILE)) {
  const report = JSON.parse(readFileSync(PERF_PROFILE, 'utf8'));
  const scenario = (report.scenarios || []).find((entry) => entry.name === 'crowded-flight');
  const materialKeys = scenario && scenario.sceneStats && scenario.sceneStats.visibleMaterialKeyCount;
  if (Number.isFinite(materialKeys)) {
    assert.ok(
      materialKeys <= MATERIAL_KEY_CEILING,
      `crowded-flight visible material keys ${materialKeys} regressed above ceiling ${MATERIAL_KEY_CEILING} — inspect sceneStats.visibleMaterialKeys in ${PERF_PROFILE}`,
    );
    console.log(`ok    crowded-flight material keys ${materialKeys} <= ceiling ${MATERIAL_KEY_CEILING}`);
    const offenders = scenario.sceneStats.visibleMaterialKeys || [];
    const maplessHull = offenders.find((entry) => String(entry.key || '').includes('SF_Shared_hull_hull_'));
    assert.equal(maplessHull, undefined, 'mapless hull material keys should canonicalize into textured hull variants');
    console.log('ok    no mapless SF_Shared_hull_hull_* keys in crowded-flight profile');
  } else {
    console.log('warn  performance profile present but crowded-flight material key count missing');
  }
} else {
  console.log('warn  no .devshots/perf/performance-profile.json — skipping live material-key ceiling check');
}

console.log('ok    runMaterialSharingContractProbe hull/canopy/readability sharing');
console.log('PASS  check:ship-material-sharing');