import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export async function loadPlaywright() {
  const attempts = [];

  try {
    return await import('playwright');
  } catch (err) {
    attempts.push(describeFailure('project dependency', err));
  }

  for (const entrypoint of bundledPlaywrightEntrypoints()) {
    try {
      const require = createRequire(entrypoint);
      return require('playwright');
    } catch (err) {
      attempts.push(describeFailure(entrypoint, err));
    }
  }

  throw new Error(`Unable to load Playwright for browser probes.\n${attempts.join('\n')}`);
}

function bundledPlaywrightEntrypoints() {
  const bundledNodeModules = join(
    process.env.USERPROFILE || '',
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'node',
    'node_modules',
  );
  const pnpmRoot = join(bundledNodeModules, '.pnpm');
  const entries = [];

  if (existsSync(pnpmRoot)) {
    for (const dirent of readdirSync(pnpmRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory() || !/^playwright@/.test(dirent.name)) continue;
      entries.push(join(pnpmRoot, dirent.name, 'node_modules', 'playwright', 'index.js'));
    }
  }

  entries.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
  entries.push(join(bundledNodeModules, 'playwright', 'index.js'));
  return entries.filter((entrypoint, index, all) =>
    existsSync(entrypoint) && all.indexOf(entrypoint) === index);
}

function describeFailure(source, err) {
  const message = err && err.message ? err.message : String(err);
  return `- ${source}: ${message}`;
}
