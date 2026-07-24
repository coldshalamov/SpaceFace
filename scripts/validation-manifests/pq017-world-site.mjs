// PQ-017 world-site validation manifest (Phase 1).
// Source path lists remain authoritative in pq017ProbeIterationGuard.mjs for
// digest + source-pattern compatibility; this module re-exports the broker shape.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPq017ValidationManifest,
  REGRESSION_SOURCES,
  ROUTE_SOURCES,
} from '../lib/pq017ProbeIterationGuard.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function createPq017WorldSiteManifest(overrides = {}) {
  return buildPq017ValidationManifest({
    artifactRoot: path.join('.devshots', 'pq017-world-site'),
    ...overrides,
  });
}

export const pq017WorldSiteManifest = createPq017WorldSiteManifest();

export {
  REGRESSION_SOURCES as regressionSourcePaths,
  ROUTE_SOURCES as productionSourcePaths,
  ROOT,
};

export default pq017WorldSiteManifest;
