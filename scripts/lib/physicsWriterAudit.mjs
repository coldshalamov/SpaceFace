const AUTHORITY_PATHS = new Set([
  'src/core/physics.js',
  'src/core/sg02DynamicBodyOwner.js',
]);

const COMPATIBILITY_PATHS = new Set([
  'src/core/flightDynamics.js',
  'src/systems/flight.js',
]);

const DIRECT_WRITE = /\b[$A-Z_a-z][$\w]*(?:\?\.|\.|\[[^\]]+\])*\.(?:(?:pos|vel)\.(?:x|y|z)|rot|angVel)\s*(?:[+*/-]?=|\+\+|--)/;

/**
 * Produce a review queue of direct transform writes. Static source cannot know
 * whether a value is a Rapier-owned body, a projectile, or spawn initialization,
 * so this report deliberately does not return a pass/fail verdict.
 */
export function scanPhysicsWriterCandidates(files) {
  const normalizedFiles = [...files]
    .map((file) => ({ path: normalizePath(file.path), source: String(file.source || '') }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const candidates = [];

  for (const file of normalizedFiles) {
    const category = AUTHORITY_PATHS.has(file.path)
      ? 'authority'
      : COMPATIBILITY_PATHS.has(file.path)
        ? 'compatibility'
        : 'review';
    const lines = file.source.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const code = line.replace(/\/\/.*$/, '').trim();
      const match = code.match(DIRECT_WRITE);
      if (!match) continue;
      candidates.push({
        path: file.path,
        line: index + 1,
        category,
        expression: match[0],
      });
    }
  }

  return {
    schemaVersion: 1,
    verdict: 'diagnostic-only',
    limitation: 'Each review candidate needs entity-kind and backend-path proof before enforcement.',
    summary: {
      files: normalizedFiles.length,
      candidates: candidates.length,
      authority: candidates.filter((candidate) => candidate.category === 'authority').length,
      compatibility: candidates.filter((candidate) => candidate.category === 'compatibility').length,
      review: candidates.filter((candidate) => candidate.category === 'review').length,
    },
    candidates,
  };
}

function normalizePath(path) {
  return String(path || '').replaceAll('\\', '/').replace(/^\.\//, '');
}
