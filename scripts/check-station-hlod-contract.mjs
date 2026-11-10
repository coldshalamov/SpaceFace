#!/usr/bin/env node
// Contract check: station LOD requests retain one stable authored identity and transform root.

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
assert.match(hlodSource, /stable-authored-identity/, 'hlod.js should state why generic proxy swapping is disabled');
// The renderer publishes hlod diagnostics by assigning this._hlodDiagnostics onto
// state.render.hlod and updating the same object every frame — there is no
// _publishHlodDiagnostics() method; pin the actual publish site instead.
assert.match(rendererSource, /state\.render\.hlod\s*=\s*(this\._hlodDiagnostics|hlodDiagnostics)/,
  'renderer should publish hlod diagnostics onto state.render.hlod');
assert.match(rendererSource, /hlodDetailedVisible/, 'renderer diagnostics should track detailed visibility');
assert.match(rendererSource, /userData\.hlod && Number\(userData\.hlod\.visualRadius\)/,
  'renderer should select station HLOD from the visible authored envelope, not collision radius');
assert.match(factorySource, /attachStationHlod/, 'visualFactory should wrap stations with HLOD');

const probe = runStationHlodContractProbe(THREE);
assert.equal(probe.hasLodState, true, 'station root should attach lod state');
assert.equal(probe.rootStableAtLod2, true, 'lod2 request must preserve the entity root');
assert.equal(probe.detailedVisibleAtLod2, true, 'lod2 request must not blank the detailed station');
assert.equal(probe.detailedMeshCount, probe.beforeMeshCount, 'lod2 request must not replace the detailed subtree');
assert.equal(probe.proxyMeshCount, 0, 'generic station proxy must not be mounted');
assert.equal(probe.diagnostics.visualRadius, 72, 'HLOD should publish the station visual radius for projected sizing');
assert.equal(probe.diagnostics.swapped, false, 'hlod diagnostics must report no identity swap');
assert.equal(probe.diagnostics.proxyDisabledReason, 'stable-authored-identity');

console.log('PASS  check:station-hlod');
