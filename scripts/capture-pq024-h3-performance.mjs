#!/usr/bin/env node

// PQ-024 H3 reuses the accepted public asteroid-claim actor. The explicit mode flag keeps the
// functional Browser/Electron H1 path and the one-use matched performance cell on one route owner.
if (!process.argv.includes('--h3-performance')) process.argv.push('--h3-performance');
await import('./probe-pq024-asteroid-claim.mjs');
