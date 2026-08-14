#!/usr/bin/env node
// PQ-061 tabletop census: glass vs runway vs beyond from the same policy the
// live renderer uses. Writes JSON. Does not change the picture.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TABLE_REFERENCE_SPEED_WU,
  authoredImmediateRadius,
  authoredPrefetchRadius,
  censusTableBands,
  glassHalfExtents,
  residencyEvictRadius,
  residencyPrefetchRadius,
  submitCullHalfExtents,
  submitRunwayWu,
  tableShadowCastRadius,
} from '../src/render/tabletopPolicy.js';

const outPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '../.devshots/tabletop-census.json');

const zooms = [144, 220, 330];
const aspect = 16 / 9;
const fov = 50;

function crowd(n, spread) {
  const entities = [{ id: 1, type: 'ship', pos: { x: 0, z: 0 }, radius: 6 }];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const dist = 40 + (i % 12) * (spread / 12);
    entities.push({
      id: i + 2,
      type: i % 9 === 0 ? 'station' : 'ship',
      pos: { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist },
      radius: i % 9 === 0 ? 40 : 6,
    });
  }
  return entities;
}

const report = {
  schema: 'spaceface.tabletopCensus.v1',
  speedWu: TABLE_REFERENCE_SPEED_WU,
  policy: {
    submitRunwayWu: submitRunwayWu(),
    prefetchRadius: residencyPrefetchRadius(),
    evictRadius: residencyEvictRadius(),
    authoredImmediate: authoredImmediateRadius(),
    authoredPrefetch: authoredPrefetchRadius(),
  },
  zooms: {},
};

const entities = crowd(94, 5200);
for (const zoom of zooms) {
  const glass = glassHalfExtents(zoom, fov, aspect);
  const submit = submitCullHalfExtents(zoom, fov, aspect);
  const census = censusTableBands(entities, {
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: submit.runway,
    originX: 0,
    originZ: 0,
    playerId: 1,
    residentIds: new Set(entities.filter((e) => {
      const d = Math.hypot(e.pos.x, e.pos.z);
      return d <= residencyPrefetchRadius();
    }).map((e) => e.id)),
  });
  report.zooms[zoom] = {
    glass,
    submit,
    shadowRadius: tableShadowCastRadius(zoom, fov, aspect),
    oldFakeVisibleHalf: Math.max(900, zoom * 8) + glass.halfX,
    census,
  };
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${outPath}\n`);
process.stdout.write(`${JSON.stringify(report.zooms[144].census)}\n`);
