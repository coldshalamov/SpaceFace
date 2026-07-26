#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluatePq018CoordinateReservation,
} from './lib/pq018CoordinateReservation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const receipt = evaluatePq018CoordinateReservation();
if (process.argv.includes('--write')) {
  const output = path.join(
    root,
    '.devshots',
    'pq018-wreck-cathedral',
    'coordinate-reservation.json',
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(`[pq018-coordinate] receipt: ${path.relative(root, output)}`);
}
if (!receipt.pass) {
  console.error(JSON.stringify(receipt));
  process.exit(1);
}
console.log(JSON.stringify({
  pass: receipt.pass,
  local: receipt.local,
  global: receipt.global,
  envelopeRadius: receipt.envelopeRadius,
  minimumClearance: receipt.minimumClearance,
  minimumConstraint: receipt.minimumConstraint,
  receiptDigest: receipt.receiptDigest,
}));
