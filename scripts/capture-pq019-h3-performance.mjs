#!/usr/bin/env node

// Keep the already-proven PQ-019 actor and its live mission/facility seams authoritative. This
// entrypoint selects its H3 branch while the tracked manifest supplies the one-use broker claim.
if (!process.argv.includes('--h3-performance')) process.argv.push('--h3-performance');
await import('./probe-pq019-surface-heist.mjs');
