const CHECK_PREFIX = 'check:';

/** Return unique `npm run` dependency edges in command order. */
export function extractNpmDependencies(command = '') {
  const found = [];
  const seen = new Set();
  const pattern = /(?:^|[;&|]\s*)npm\s+run\s+([\w:@.-]+)/g;
  for (const match of String(command).matchAll(pattern)) {
    const dependency = match[1];
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    found.push(dependency);
  }
  return found;
}

/**
 * Infer only mechanically observable properties. These labels describe how a
 * command runs; they never claim that the route or product behavior passed.
 */
export function classifyCheck(id, command = '') {
  const text = `${id} ${command}`.toLowerCase();
  const dependencies = extractNpmDependencies(command);
  const runtimeHint = text.includes('electron')
    ? 'electron'
    : text.includes('browser') || text.includes('playwright')
      ? 'browser'
      : text.includes('webgl') || text.includes('visual') || text.includes('capture')
        ? 'render'
        : text.includes('sim') || text.includes('replay')
          ? 'simulation'
          : 'node';
  const routeHint = /public[-: ]route|player[-: ]route|normal[-: ]route/.test(text)
    ? 'public-player-route'
    : 'structural';
  const ignoredFocusTokens = new Set([
    'check', 'browser', 'electron', 'contracts', 'contract', 'public', 'player',
    'route', 'live', 'headed', 'structural',
  ]);
  const focusHint = String(id)
    .split(':')
    .map((token) => token.trim())
    .find((token) => token && !ignoredFocusTokens.has(token)) || 'general';

  return {
    kind: dependencies.length > 0 ? 'composite' : 'leaf',
    runtimeHint,
    routeHint,
    focusHint,
    classificationMethod: 'id-command-heuristic',
  };
}

export function buildCheckCatalog(packageJson = {}) {
  const scripts = packageJson.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts
    : {};
  const checkIds = Object.keys(scripts)
    .filter((id) => id === 'check' || id.startsWith(CHECK_PREFIX))
    .sort();
  const checkSet = new Set(checkIds);
  const checks = checkIds.map((id) => {
    const command = String(scripts[id] || '');
    return {
      id,
      command,
      dependencies: extractNpmDependencies(command),
      ...classifyCheck(id, command),
    };
  });
  const missingDependencies = checks
    .flatMap((entry) => entry.dependencies
      .filter((dependency) => !Object.hasOwn(scripts, dependency))
      .map((dependency) => ({ check: entry.id, dependency })))
    .sort((a, b) => a.check.localeCompare(b.check) || a.dependency.localeCompare(b.dependency));
  const adjacency = new Map(checks.map((entry) => [
    entry.id,
    entry.dependencies.filter((dependency) => checkSet.has(dependency)).sort(),
  ]));
  const cycles = findCycles(adjacency);

  return {
    schemaVersion: 1,
    package: String(packageJson.name || ''),
    classification: {
      status: 'hint-only',
      method: 'id-command-heuristic',
      limitation: 'Runtime and route hints are not import-graph or execution proof.',
    },
    summary: {
      checks: checks.length,
      leaves: checks.filter((entry) => entry.kind === 'leaf').length,
      composites: checks.filter((entry) => entry.kind === 'composite').length,
      missingDependencies: missingDependencies.length,
      cycleWitnesses: cycles.length,
    },
    cycleAnalysis: {
      method: 'deterministic-depth-first-search',
      limitation: 'Reported paths are representative cycle witnesses, not an exhaustive elementary-cycle enumeration.',
    },
    missingDependencies,
    cycles,
    checks,
  };
}

function findCycles(adjacency) {
  const cyclesByKey = new Map();
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const canonical = canonicalCycle(cycle);
      cyclesByKey.set(canonical.join('\u0000'), canonical);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of adjacency.get(id) || []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of [...adjacency.keys()].sort()) visit(id);
  return [...cyclesByKey.values()].sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
}

function canonicalCycle(cycle) {
  const ring = cycle.slice(0, -1);
  const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)]);
  rotations.sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
  return [...rotations[0], rotations[0][0]];
}
