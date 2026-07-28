import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePq020CeresTopology } from './lib/pq020CeresTopology.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receipt = await evaluatePq020CeresTopology();

if (process.argv.includes('--write')) {
  const outDir = path.join(rootDir, '.devshots', 'pq020-ceres-topology');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'headless-evidence.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
}

if (!receipt.pass) {
  console.error(JSON.stringify({
    check: 'pq020-ceres-topology',
    status: 'FAIL',
    ...receipt,
  }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    check: 'pq020-ceres-topology',
    status: 'PASS',
    schema: receipt.schema,
    sectorId: receipt.sectorId,
    cathedral: receipt.cathedral,
    route: receipt.route,
    structuralCost: receipt.structuralCost,
    requiresHeaded: receipt.requiresHeaded,
    structuralCostDigest: receipt.structuralCostDigest,
    receiptDigest: receipt.receiptDigest,
  }));
}
