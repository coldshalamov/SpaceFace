#!/usr/bin/env node
// Broker-owned Browser continuation for the final three PQ-023 small-destruction cells.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import {
  createPq023SmallDestructionSalienceManifest,
  PQ023_SMALL_DESTRUCTION_SALIENCE_FIXED_SEED,
} from './validation-manifests/pq023-small-destruction-salience.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq023-small-destruction-salience');
const DIAGNOSTIC = process.argv.includes('--diagnostic');

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq023SmallDestructionSalienceManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq023-small-destruction-salience] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq023-small-destruction-salience] invoke via: node scripts/validation-broker-cli.mjs --manifest pq023-small-destruction-salience');
  console.error('[pq023-small-destruction-salience] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

process.env.SF_PQ023_H1 = '1';
process.env.SF_PQ023_SMALL_DESTRUCTION_SALIENCE = '1';
process.env.SF_COMBAT_CAPTURE_DIR = '.devshots/pq023-small-destruction-salience';
process.env.SF_PROBE_SEED = String(PQ023_SMALL_DESTRUCTION_SALIENCE_FIXED_SEED);

await import('./capture-combat-vfx-acceptance.mjs');
