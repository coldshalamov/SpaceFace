// ciGateGraph.mjs — ONE definition of "what does npm script R actually execute, and how many times
// does it execute gate G".
//
// Why this file exists
// --------------------
// `check:ci` is not an `&&` chain. It is a one-line delegation:
//
//     "check:ci"        : "npm run check:ci:report"
//     "check:ci:report" : "node scripts/check-ci-report.mjs"
//
// and `scripts/check-ci-report.mjs` builds its matrix by expanding
// `[scripts.precheck, scripts.check]`. So the aggregate `check:ci` really does run every gate in
// `check` — but a walker that only follows `npm run X` strings through package.json falls off the
// cliff at `node scripts/check-ci-report.mjs` and reports ZERO. Five separate gates had grown their
// own private copy of that walker, four of them with the cliff, and those four went red while
// `check-gate-reachability.mjs`, `check-ci-report.mjs` and `check-m1-tether-mass-grounding.mjs`
// stayed green asking the same question a different way.
//
// Five subtly different walkers is how that class of bug survives. There is now one, here.
// Everything that needs to answer "is gate G reachable from root R" imports from this module.
//
// The three moving parts a caller can need:
//   * `resolveAggregateSource` / `resolveAggregateCommand` — follow a root through delegation until
//     you reach the real `&&` chain. `check:ci` resolves to the `check` chain, via the ci-report
//     runner's own matrix source. Assertions written against a chain keep working unchanged.
//   * `countGateInvocations` — transitive count of `npm run G` executions under root R, following
//     nested scripts AND the ci-report delegation. This is the honest "exactly once" primitive.
//   * `collectReachable` / `directNpmDependencies` — the set/edge primitives the reachability audit
//     needs. Re-exported by `scripts/check-gate-reachability.mjs` for its existing importers.

// The matrix source `scripts/check-ci-report.mjs` expands for a non-smoke run. This is the single
// declaration of that list: check-ci-report.mjs, check-gate-reachability.mjs and
// check-m1-tether-mass-grounding.mjs all read it from here instead of restating it. `precheck` was
// deleted on 2026-07-27 (it was an npm LIFECYCLE hook, so a red link in it aborted `npm run check`
// before link 1); the name stays in the list on purpose, so that reintroducing a pre/post lifecycle
// script cannot silently drop gates out of every reachability answer at once.
export const CI_MATRIX_ROOT_SCRIPTS = ['precheck', 'check'];

// A bare `node scripts/check-ci-report.mjs`. Deliberately end-anchored: `--smoke` runs a small
// hard-coded command list, NOT the package matrix, so it must not resolve to the `check` chain.
const CI_REPORT_RUNNER = /^node\s+(?:\.[\\/])?scripts[\\/]check-ci-report\.mjs$/;
// Matches the leading `npm run <name>` of a segment, allowing trailing arguments.
const NPM_RUN_PREFIX = /^npm\s+run\s+([\w:@.-]+)/;
// Matches a segment that is *only* `npm run <name>` — a pure delegation, nothing else in it.
const NPM_RUN_EXACT = /^npm\s+run\s+([\w:@.-]+)$/;
// Stack sentinel for "we are already inside the ci-report matrix expansion", so a package.json that
// routed `check` back through `check:ci` would raise a cycle error instead of hanging.
const CI_REPORT_FRAME = '(check-ci-report matrix)';

export function splitCommandChain(command) {
  return String(command ?? '')
    .split(/\s*&&\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The command string `scripts/check-ci-report.mjs` expands for a non-smoke run. */
export function ciMatrixSourceCommand(scripts = {}) {
  return CI_MATRIX_ROOT_SCRIPTS
    .map((name) => scripts?.[name])
    .filter((body) => typeof body === 'string' && body.trim())
    .join(' && ');
}

/** The subset of CI_MATRIX_ROOT_SCRIPTS that package.json actually declares. */
export function ciMatrixRootNames(scripts = {}) {
  return CI_MATRIX_ROOT_SCRIPTS.filter(
    (name) => typeof scripts?.[name] === 'string' && scripts[name].trim(),
  );
}

/**
 * Follow a root script through pure delegation until it reaches the `&&` chain it really runs.
 *
 * A root is "delegating" when its body is a single segment that is either exactly `npm run X` or the
 * bare ci-report runner. Anything else — a multi-link chain, or a segment carrying arguments — is
 * the terminal chain and is returned as written. This is what lets a gate keep asserting against a
 * chain body while `check:ci` stays the one-line delegator that `check-m1-tether-mass-grounding.mjs`
 * pins it to.
 *
 * @returns {{ name: string, command: string, via: string[] }}
 */
export function resolveAggregateSource(scripts = {}, rootName, stack = []) {
  const body = scripts?.[rootName];
  if (typeof body !== 'string' || !body.trim()) {
    throw new Error(
      `package.json does not declare a runnable script "${rootName}"`
      + (stack.length ? ` (reached via ${stack.join(' -> ')})` : ''),
    );
  }
  if (stack.includes(rootName)) {
    throw new Error(`npm script delegation cycle: ${[...stack, rootName].join(' -> ')}`);
  }

  const segments = splitCommandChain(body);
  if (segments.length === 1) {
    const delegate = segments[0].match(NPM_RUN_EXACT);
    if (delegate) return resolveAggregateSource(scripts, delegate[1], [...stack, rootName]);

    if (CI_REPORT_RUNNER.test(segments[0])) {
      const names = ciMatrixRootNames(scripts);
      if (!names.length) {
        throw new Error(
          `${rootName} delegates to scripts/check-ci-report.mjs, but package.json declares none of `
          + `its matrix roots [${CI_MATRIX_ROOT_SCRIPTS.join(', ')}] — the CI matrix would be empty`,
        );
      }
      return {
        name: names.join(' + '),
        command: ciMatrixSourceCommand(scripts),
        via: [...stack, rootName],
      };
    }
  }

  return { name: rootName, command: body, via: stack };
}

/** The `&&` chain a root aggregate really executes. See resolveAggregateSource. */
export function resolveAggregateCommand(scripts = {}, rootName) {
  return resolveAggregateSource(scripts, rootName).command;
}

/**
 * How many times root `rootName` transitively executes `npm run targetName`.
 *
 * Follows nested npm scripts and the ci-report delegation, so `countGateInvocations(scripts,
 * 'check:ci', G)` and `countGateInvocations(scripts, 'check', G)` agree — which is the actual truth
 * about what CI runs. Throws on a script cycle rather than looping.
 */
export function countGateInvocations(scripts = {}, rootName, targetName) {
  if (rootName === targetName) return 1;
  return countInCommand(scripts, resolveAggregateCommand(scripts, rootName), targetName, [rootName]);
}

function countInCommand(scripts, command, target, stack) {
  let total = 0;
  for (const segment of splitCommandChain(command)) {
    const run = segment.match(NPM_RUN_PREFIX);
    if (run) {
      total += countInScript(scripts, run[1], target, stack);
      continue;
    }
    if (CI_REPORT_RUNNER.test(segment)) {
      if (stack.includes(CI_REPORT_FRAME)) {
        throw new Error(`npm script cycle through the CI matrix: ${[...stack, CI_REPORT_FRAME].join(' -> ')}`);
      }
      total += countInCommand(scripts, ciMatrixSourceCommand(scripts), target, [...stack, CI_REPORT_FRAME]);
    }
  }
  return total;
}

function countInScript(scripts, name, target, stack) {
  if (name === target) return 1;
  if (stack.includes(name)) {
    throw new Error(`npm script cycle: ${[...stack, name].join(' -> ')}`);
  }
  return countInCommand(scripts, scripts?.[name], target, [...stack, name]);
}

/** The npm scripts a single command body invokes directly (one hop, no expansion). */
export function directNpmDependencies(body) {
  if (typeof body !== 'string') return [];
  const names = [];
  for (const segment of splitCommandChain(body)) {
    const match = segment.match(NPM_RUN_PREFIX);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * Every `check:`-prefixed script reachable from `roots`, following nested npm scripts and the
 * ci-report delegation. Defaults to the CI matrix roots, i.e. exactly the set `npm run check:ci`
 * executes.
 */
export function collectReachable(scripts = {}, roots = CI_MATRIX_ROOT_SCRIPTS) {
  const seen = new Set();
  const walkCommand = (command) => {
    for (const segment of splitCommandChain(command)) {
      const run = segment.match(NPM_RUN_PREFIX);
      if (run) {
        walk(run[1]);
        continue;
      }
      if (CI_REPORT_RUNNER.test(segment) && !seen.has(CI_REPORT_FRAME)) {
        seen.add(CI_REPORT_FRAME);
        walkCommand(ciMatrixSourceCommand(scripts));
      }
    }
  };
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    walkCommand(scripts?.[name]);
  };
  for (const root of roots) walk(root);
  return new Set([...seen].filter((name) => name.startsWith('check:')));
}
