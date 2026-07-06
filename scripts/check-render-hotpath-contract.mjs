#!/usr/bin/env node
// Contract check: render draw hot path must not re-sync post options every frame.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RENDERER = join(ROOT, 'src', 'render', 'renderer.js');
const BLOOM = join(ROOT, 'src', 'render', 'bloom.js');
const RENDER_GRAPH = join(ROOT, 'src', 'render', 'post', 'spaceRenderGraph.js');
const POST_TELEMETRY = join(ROOT, 'src', 'render', 'postTelemetry.js');
const PROBE = join(ROOT, 'scripts', 'probe-performance-profile.mjs');
const MATERIAL_SHARING = join(ROOT, 'scripts', 'check-ship-material-sharing-contract.mjs');
const PARTS_LIBRARY = join(ROOT, 'src', 'render', 'partsLibrary.js');
const source = readFileSync(RENDERER, 'utf8');
const bloomSource = readFileSync(BLOOM, 'utf8');
const renderGraphSource = readFileSync(RENDER_GRAPH, 'utf8');
const postTelemetrySource = readFileSync(POST_TELEMETRY, 'utf8');
const probeSource = readFileSync(PROBE, 'utf8');
const materialSharingSource = readFileSync(MATERIAL_SHARING, 'utf8');
const partsLibrarySource = readFileSync(PARTS_LIBRARY, 'utf8');

function extractMethodBody(name) {
  const patterns = [
    new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`${name}\\([^)]*\\)\\s*\\{`),
  ];
  let start = -1;
  for (const pattern of patterns) {
    start = source.search(pattern);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `${name}() should exist in renderer.js`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  assert.fail(`${name}() body should close`);
}

const drawBody = extractMethodBody('drawPreparedFrame');
const syncBody = extractMethodBody('_syncPostOptions');

assert.doesNotMatch(
  drawBody,
  /_syncPostOptions\s*\(/,
  'drawPreparedFrame() must not call _syncPostOptions() on every render',
);

assert.match(
  source,
  /settings:changed[\s\S]*_syncPostOptions\s*\(/,
  'video settings changes should still route through _syncPostOptions()',
);

assert.match(
  syncBody,
  /_postOptionsSig|_invalidatePostOptionsCache/,
  '_syncPostOptions() should cache or invalidate video post signatures',
);

assert.match(
  source,
  /_ensureRenderGraph[\s\S]*_syncPostOptions\s*\(\s*true\s*\)/,
  'render graph creation should force-apply current post options once',
);

assert.match(
  source,
  /_getPostDiagnostics/,
  'renderer should expose unified post diagnostics',
);

assert.match(
  source,
  /resetPostTelemetrySample/,
  'renderer should expose post render-target sample counter reset',
);

assert.match(
  bloomSource,
  /recordPostRenderTargetAllocation/,
  'bloom should record post render-target allocations',
);

assert.doesNotMatch(
  bloomSource,
  /outRT\.setSize\s*\(/,
  'bloom upsample path must not resize render targets every frame',
);

assert.match(
  renderGraphSource,
  /recordPostRenderTargetAllocation/,
  'render graph should record post render-target allocations',
);

assert.match(
  postTelemetrySource,
  /renderTargetAllocationsDuringSample/,
  'post telemetry should track allocations during perf sample window',
);

assert.match(
  probeSource,
  /post\.renderTargetAllocationsDuringSample\.max/,
  'perf probe should budget zero post render-target allocations during sample',
);

assert.match(
  probeSource,
  /resetPostTelemetrySample/,
  'perf probe should reset post render-target sample counter before sampling',
);

assert.match(
  partsLibrarySource,
  /function materialShareSignature\(/,
  'partsLibrary should canonicalize immutable share signatures',
);

assert.match(
  materialSharingSource,
  /runMaterialSharingContractProbe/,
  'ship material sharing contract should exercise partsLibrary sharing probe',
);

console.log('Render hot-path contract OK');