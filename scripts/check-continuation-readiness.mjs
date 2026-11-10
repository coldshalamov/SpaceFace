#!/usr/bin/env node
// Diagnostic only: no network, login, credential reads, package execution, or writes.
import { statSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export const DEFAULT_SOURCES = ['package.json', 'src/core/gameState.js', 'src/core/registry.js'];
export const DEFAULT_DEPENDENCIES = ['three', '@dimforge/rapier3d-compat'];
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const command = (root, args) => `git -C ${quote(root)} ${args}`;
const within = (root, path) => {
  const part = relative(root, path);
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};

// Pure classification. A CLI-auth observation is evidence about that CLI only.
export function classifyReadiness(probes, cliAuth = 'not_probed') {
  const failures = probes.filter(probe => probe.status === 'failed');
  const operation = kinds => {
    const relevant = failures.filter(probe => kinds.includes(probe.kind));
    return { status: relevant.length ? 'needs_local_action' : 'prerequisites_present',
      failedProbes: relevant.map(probe => probe.id) };
  };
  return {
    localImplementation: operation(['checkout', 'head', 'branch', 'source']),
    localValidation: operation(['checkout', 'head', 'branch', 'source', 'dependency']),
    publicRepositoryRead: { status: 'not_probed', reason: 'Local absence does not establish public repository availability.' },
    connectorRead: { status: 'not_probed', reason: 'Requires an independent operation-specific connector probe.' },
    connectorWrite: { status: 'not_probed', reason: 'Requires an independently authorized operation-specific connector action.' },
    cliAuthentication: { status: cliAuth, reason: 'CLI authentication does not establish local or connector access.' },
  };
}

export function probeReadiness({ root = process.cwd(), sources = DEFAULT_SOURCES,
  dependencies = DEFAULT_DEPENDENCIES, operation = 'continue local implementation',
  now = () => new Date().toISOString() } = {}) {
  root = resolve(root);
  const checkedAt = now();
  const probes = [];
  const add = (kind, target, status, detail, nextCommand = null) => {
    const probe = { id: `${kind}:${target}`, kind, target, status, detail, checkedAt, nextCommand };
    probes.push(probe);
    return probe;
  };
  const git = args => {
    const result = spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return { ok: result.status === 0 && !result.error,
      output: result.stdout?.trim() || '',
      error: result.error?.message || result.stderr?.trim() || `git exited ${result.status}` };
  };
  let directory = false;
  try { directory = statSync(root).isDirectory(); } catch { /* Report below. */ }
  const top = directory ? git(['rev-parse', '--show-toplevel']) : null;
  let isRoot = false;
  try { isRoot = top?.ok && realpathSync(top.output) === realpathSync(root); } catch { /* Report below. */ }
  add('checkout', root, isRoot ? 'passed' : 'failed',
    !directory ? 'Local directory is absent or unreadable; remote availability is unknown.'
      : isRoot ? 'Verified the requested path is the checkout root.'
        : top?.ok ? `Requested path belongs to ancestor checkout ${top.output}; select its root explicitly.` : top.error,
    isRoot ? null : `ls -ld -- ${quote(directory ? root : dirname(root))}`);
  let head = null;
  let branch = null;
  if (isRoot) {
    const revision = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    head = revision.ok ? revision.output : null;
    add('head', 'HEAD', revision.ok ? 'passed' : 'failed', head || revision.error,
      revision.ok ? null : command(root, 'log -1 --oneline'));
    const branchResult = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    // Detached HEAD is a usable checkout, not an authentication or implementation failure.
    const detached = !branchResult.ok && revision.ok && git(['rev-parse', '--abbrev-ref', 'HEAD']).output === 'HEAD';
    branch = branchResult.ok ? branchResult.output : detached ? '(detached)' : null;
    add('branch', 'HEAD', branch ? 'passed' : 'failed', branch || branchResult.error,
      branch ? null : command(root, 'symbolic-ref --short HEAD'));
  }
  for (const source of sources) {
    const path = resolve(root, source);
    let inside = within(root, path);
    let present = false;
    try {
      if (inside) inside = within(realpathSync(root), realpathSync(path));
      present = inside && statSync(path).isFile();
    } catch { /* Report missing files below. */ }
    add('source', source, present ? 'passed' : 'failed', present ? path
      : inside ? 'Required local file is absent or unreadable; this says nothing about a remote copy.'
        : 'Required source must resolve inside the selected checkout, including symlink targets.',
    present ? null : command(root, `ls-files -- ${quote(source)}`));
  }
  const require = createRequire(pathToFileURL(resolve(root, 'package.json')));
  for (const specifier of dependencies) {
    try {
      const resolved = require.resolve(specifier);
      add('dependency', specifier, 'passed', `Resolved without execution: ${resolved}`);
    } catch (error) {
      const expression = `require.resolve(${JSON.stringify(specifier)})`;
      add('dependency', specifier, 'failed', `${error.code || error.name}: cannot resolve this dependency from ${root}`,
        `cd ${quote(root)} && node -p ${quote(expression)}`);
    }
  }
  return { schemaVersion: 1, checkedAt, operation, root, head, branch,
    scope: 'Local diagnostic snapshot only. Resolution uses Node require conditions; it does not execute imports, prove browser/ESM compatibility, run tests, check write permission, or authorize an action. Re-run after local changes.',
    requirements: { sources, dependencies }, probes, readiness: classifyReadiness(probes),
    nextLocalActions: probes.filter(probe => probe.status === 'failed').map(probe => ({
      failedProbe: probe.id, step: probe.detail, command: probe.nextCommand,
    })) };
}

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') return { help: true };
    if (!['--root', '--source', '--dependency', '--operation'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--source' || flag === '--dependency') {
      const key = flag === '--source' ? 'sources' : 'dependencies';
      (options[key] ??= []).push(value);
    } else options[flag.slice(2)] = value;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/check-continuation-readiness.mjs [--root PATH] [--operation NAME] [--source FILE]... [--dependency IMPORT]...\nExplicit sources/dependencies replace their defaults. Dependencies are resolved, never executed. Output is JSON; exit 1 means a named local prerequisite failed, not global access failure.');
    } else {
      const report = probeReadiness(options);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.nextLocalActions.length ? 1 : 0;
    }
  } catch (error) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), failedProbe: 'arguments',
      step: error.message, nextCommand: 'node scripts/check-continuation-readiness.mjs --help' }, null, 2));
    process.exitCode = 2;
  }
}
