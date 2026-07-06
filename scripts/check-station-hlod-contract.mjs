#!/usr/bin/env node
// Contract check: far station HLOD proxy must swap at lod2 without touching gameplay collision.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { runStationHlodContractProbe } from '../src/render/hlod.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HLOD = join(ROOT, 'src', 'render', 'hlod.js');
const RENDERER = join(ROOT, 'src', 'render', 'renderer.js');
const VISUAL_FACTORY = join(ROOT, 'src', 'render', 'visualFactory.js');

const hlodSource = readFileSync(HLOD, 'utf8');
const rendererSource = readFileSync(RENDERER, 'utf8');
const factorySource = readFileSync(VISUAL_FACTORY, 'utf8');

assert.match(hlodSource, /export function attachStationHlod\(/, 'hlod.js should export attachStationHlod()');
assert.match(hlodSource, /spacefaceHlodProxy/, 'hlod.js should tag proxy meshes');
assert.match(rendererSource, /_publishHlodDiagnostics/, 'renderer should publish hlod diagnostics');
assert.match(rendererSource, /hlodDetailedVisible/, 'renderer diagnostics should track detailed visibility');
assert.match(factorySource, /attachStationHlod/, 'visualFactory should wrap stations with HLOD');

const probe = runStationHlodContractProbe(THREE);
assert.equal(probe.hasLodState, true, 'station HLOD wrapper should attach lod state');
assert.equal(probe.proxyShownAtLod2, true, 'lod2 should show the proxy group');
assert.equal(probe.detailedHiddenAtLod2, true, 'lod2 should hide the detailed group');
assert.equal(probe.detailedMeshCount, 1, 'detailed subtree mesh count should remain unchanged after swap');
assert.ok(probe.proxyMeshCount >= 3, `proxy should use a small mesh count, got ${probe.proxyMeshCount}`);
assert.equal(probe.diagnostics.swapped, true, 'hlod diagnostics should record proxy swap');

console.log('PASS  check:station-hlod');