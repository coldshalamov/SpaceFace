#!/usr/bin/env node
// Broker-owned Browser continuation for the five PQ-023 combat-readability cells revised after H2.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import {
  createPq023CombatReadabilityManifest,
  PQ023_COMBAT_READABILITY_FIXED_SEED,
} from './validation-manifests/pq023-combat-readability.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq023-combat-readability');
const DIAGNOSTIC = process.argv.includes('--diagnostic');

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq023CombatReadabilityManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq023-combat-readability] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq023-combat-readability] invoke via: node scripts/validation-broker-cli.mjs --manifest pq023-combat-readability');
  console.error('[pq023-combat-readability] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

process.env.SF_PQ023_H1 = '1';
process.env.SF_PQ023_COMBAT_READABILITY = '1';
process.env.SF_COMBAT_CAPTURE_DIR = '.devshots/pq023-combat-readability';
process.env.SF_PROBE_SEED = String(PQ023_COMBAT_READABILITY_FIXED_SEED);

await import('./capture-combat-vfx-acceptance.mjs');
