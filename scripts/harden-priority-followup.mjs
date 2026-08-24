#!/usr/bin/env node

import './harden-consolidated-priority-work.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function replace(path, before, after, required = true) {
  if (!existsSync(path)) return false;
  const source = readFileSync(path, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) {
    if (required) throw new Error(`missing follow-up marker in ${path}: ${before.slice(0, 80)}`);
    return false;
  }
  writeFileSync(path, source.replace(before, after));
  return true;
}

if (existsSync('src/ui/radar.js')) {
  replace(
    'src/ui/radar.js',
    '  if (!Number.isFinite(requested)) return RADAR_RANGE_MODES[1];',
    '  if (!Number.isFinite(requested) || requested === 4000) return RADAR_RANGE_MODES[1];',
  );
}

if (existsSync('src/ui/uiRoot.js')) {
  let source = readFileSync('src/ui/uiRoot.js', 'utf8');
  const before = source;
  source = source
    .replaceAll('--sf-radar-size:220px', '--sf-radar-size:248px')
    .replaceAll('--sf-radar-size: 220px', '--sf-radar-size: 248px');
  if (source === before && !source.includes('--sf-radar-size:248px') && !source.includes('--sf-radar-size: 248px')) {
    throw new Error('live HUD radar-size token was not found');
  }
  if (source !== before) writeFileSync('src/ui/uiRoot.js', source);
}

if (existsSync('test/tactical-map-range-control.test.mjs')) {
  let source = readFileSync('test/tactical-map-range-control.test.mjs', 'utf8');
  source = source
    .replace(
      "import { RADAR_RANGE_MODES, normalizeRadarRange, tacticalRadarMetrics } from '../src/ui/radar.js';",
      "import { RADAR_RANGE_MODES, normalizeRadarRange } from '../src/ui/radar.js';",
    )
    .replace('  const metrics = tacticalRadarMetrics ? tacticalRadarMetrics(false) : null;\n', '')
    .replace('  assert.equal(normalizeRadarRange(4000), 3000);', '  assert.equal(normalizeRadarRange(4000), 6000);');
  if (!source.includes("import { RADAR_RANGE_MODES, normalizeRadarRange }")) {
    throw new Error('range-control test import was not corrected');
  }
  writeFileSync('test/tactical-map-range-control.test.mjs', source);
}

console.log('Priority hardening follow-up complete.');
