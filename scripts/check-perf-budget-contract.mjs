#!/usr/bin/env node
// Contract check: design/PERF_BUDGET.md must stay aligned with live perf code and doctrine.
// Prevents stale MAX_STEPS claims, legacy spatial-hash descriptions, and missing quality bars.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOC = join(ROOT, 'design', 'PERF_BUDGET.md');

const text = readFileSync(DOC, 'utf8');
const lower = text.toLowerCase();

const required = [
  {
    label: 'MAX_CATCHUP_STEPS = 4 (current loop catch-up cap)',
    test: () => /MAX_CATCHUP_STEPS\s*=\s*4/.test(text),
  },
  {
    label: 'quality-preserving optimization doctrine',
    test: () => lower.includes('quality-preserving'),
  },
  {
    label: 'p95 or p99 frame-time measurement bar',
    test: () => /\bp95\b/i.test(text) || /\bp99\b/i.test(text),
  },
  {
    label: 'transform-only moving DOM/HUD overlays',
    test: () => /transform/i.test(text) && (/DOM|HUD|overlay/i.test(text)),
  },
  {
    label: 'forbidden default quality reduction (renderScale/bloom/etc.)',
    test: () => lower.includes('renderscale') && lower.includes('bloom') && lower.includes('diagnostic-only'),
  },
  {
    label: 'layered spatial hash (not legacy string-key design)',
    test: () => /rebuildLayers|static layer|dynamic layer/i.test(text) && /stamp|_queryStamp|_seenIds/i.test(text),
  },
  {
    label: 'active-list VFX integration (not full-cap particle scan)',
    test: () => /_activeParticles|active-list|_liveCount/i.test(text),
  },
  {
    label: 'check:perf-budget script reference',
    test: () => text.includes('check:perf-budget'),
  },
  {
    label: 'check:spatial-hash script reference',
    test: () => text.includes('check:spatial-hash'),
  },
  {
    label: 'check:runtime-assets script reference',
    test: () => text.includes('check:runtime-assets'),
  },
];

const forbidden = [
  {
    label: 'stale MAX_STEPS = 8 claim',
    test: () => !/MAX_STEPS\s*=\s*8/.test(text),
  },
  {
    label: 'legacy spatial hash string-key claim',
    test: () => !/string keys/i.test(text) && !/cx\s*\+\s*['"],\s*['"]\s*\+\s*cz/.test(text),
  },
  {
    label: 'legacy per-query Set dedupe claim',
    test: () => !/lazily allocates a [`']?set[`']? for dedupe/i.test(text),
  },
  {
    label: 'full pool cap scan every frame (particles)',
    test: () => !/entire pool cap every frame/i.test(text),
  },
];

let failed = 0;

for (const item of required) {
  if (!item.test()) {
    console.error(`FAIL  missing required: ${item.label}`);
    failed++;
  } else {
    console.log(`ok    ${item.label}`);
  }
}

for (const item of forbidden) {
  if (!item.test()) {
    console.error(`FAIL  forbidden content present: ${item.label}`);
    failed++;
  } else {
    console.log(`ok    no ${item.label}`);
  }
}

if (failed) {
  console.error(`\n${failed} perf-budget contract violation(s) in ${DOC}`);
  process.exit(1);
}

console.log(`\nPERF_BUDGET contract OK (${required.length} required, ${forbidden.length} forbidden checks)`);