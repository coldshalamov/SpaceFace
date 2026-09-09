#!/usr/bin/env node
// Distinct Electron host for the shared PQ-024 public route actor. The probe itself refuses this
// mode until a passing Browser receipt exists and then compares the normalized route semantics.

if (!process.argv.includes('--electron-parity')) process.argv.push('--electron-parity');
await import('./probe-pq024-asteroid-claim.mjs');
