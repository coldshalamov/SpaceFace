#!/usr/bin/env node
// PQ-023 H1 — broker-owned headed Browser motion capture.
//
// The established combat-VFX acceptance harness already owns the normal-camera projectile,
// destruction, reduced-profile, dense-scene, video, pool-cleanup, and authored-player contracts.
// PQ-023 mode adds the flak/autocannon temporal comparison plus real asteroidSites-owned Wreck
// Cathedral recovery/failure sequences. This wrapper supplies the one-use broker boundary.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import {
  createPq023CorridorCuesManifest,
  PQ023_CORRIDOR_CUES_FIXED_SEED,
} from './validation-manifests/pq023-corridor-cues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq023-corridor-cues');
const DIAGNOSTIC = process.argv.includes('--diagnostic');

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq023CorridorCuesManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq023-corridor-cues] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq023-corridor-cues] invoke via: node scripts/validation-broker-cli.mjs --manifest pq023-corridor-cues');
  console.error('[pq023-corridor-cues] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

process.env.SF_PQ023_H1 = '1';
process.env.SF_COMBAT_CAPTURE_DIR = '.devshots/pq023-corridor-cues';
process.env.SF_PROBE_SEED = String(PQ023_CORRIDOR_CUES_FIXED_SEED);

await import('./capture-combat-vfx-acceptance.mjs');
