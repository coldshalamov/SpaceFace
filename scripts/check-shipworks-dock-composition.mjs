#!/usr/bin/env node

import { evaluateShipworksDockComposition } from './lib/shipworksDockComposition.mjs';

try {
  const receipt = await evaluateShipworksDockComposition();
  const prefix = receipt.pass ? 'PASS' : 'FAIL';
  console.log(`[check-shipworks-dock-composition] ${prefix} ${JSON.stringify(receipt)}`);
  process.exitCode = receipt.pass ? 0 : 1;
} catch (error) {
  console.error(
    `[check-shipworks-dock-composition] FAIL ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exitCode = 1;
}
