#!/usr/bin/env node
// Distinct Electron host for the bounded committed-transition actor. The shared probe verifies the
// exact Browser manifest/digest and normalized committed presentation before Electron can launch.

if (!process.argv.includes('--committed-transition')) process.argv.push('--committed-transition');
if (!process.argv.includes('--electron-parity')) process.argv.push('--electron-parity');
await import('./probe-pq024-asteroid-claim.mjs');
