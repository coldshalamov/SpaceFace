import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export async function loadPlaywright() {
  const attempts = [];

  try {
    return withMutedAutomationLaunches(await import('playwright'));
  } catch (err) {
    attempts.push(describeFailure('project dependency', err));
  }

  for (const entrypoint of bundledPlaywrightEntrypoints()) {
    try {
      const require = createRequire(entrypoint);
      return withMutedAutomationLaunches(require('playwright'));
    } catch (err) {
      attempts.push(describeFailure(entrypoint, err));
    }
  }

  throw new Error(`Unable to load Playwright for browser probes.\n${attempts.join('\n')}`);
}

const AUTOMATION_MUTE_SWITCH = '--mute-audio';

/**
 * Automation owns shell isolation, including the host audio device. Keep that safety outside the
 * game settings path so a loaded save or an explicit player preference can never make a probe
 * audible. The returned launchers clone options and leave Playwright's other APIs untouched.
 */
export function withMutedAutomationLaunches(playwright) {
  if (!playwright || typeof playwright !== 'object') return playwright;
  const wrapped = Object.create(playwright);
  if (playwright.chromium) {
    Object.defineProperty(wrapped, 'chromium', {
      configurable: true,
      enumerable: true,
      value: wrapLauncher(playwright.chromium, true),
    });
  }
  if (playwright._electron) {
    Object.defineProperty(wrapped, '_electron', {
      configurable: true,
      enumerable: true,
      value: wrapLauncher(playwright._electron, false),
    });
  }
  return wrapped;
}

function wrapLauncher(launcher, supportsPersistentContext) {
  const wrapped = Object.create(launcher);
  if (typeof launcher.launch === 'function') {
    Object.defineProperty(wrapped, 'launch', {
      configurable: true,
      enumerable: true,
      value: (options) => launcher.launch(mutedLaunchOptions(options)),
    });
  }
  if (supportsPersistentContext && typeof launcher.launchPersistentContext === 'function') {
    Object.defineProperty(wrapped, 'launchPersistentContext', {
      configurable: true,
      enumerable: true,
      value: (userDataDir, options) => launcher.launchPersistentContext(
        userDataDir,
        mutedLaunchOptions(options),
      ),
    });
  }
  return wrapped;
}

function mutedLaunchOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  const args = Array.isArray(source.args) ? source.args.slice() : [];
  if (!args.includes(AUTOMATION_MUTE_SWITCH)) args.unshift(AUTOMATION_MUTE_SWITCH);
  return { ...source, args };
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
