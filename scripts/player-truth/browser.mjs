// Chromium for the harness: Playwright's bundled build first, then a system Chrome
// (CHROME_PATH, /opt/google/chrome/chrome, google-chrome/chromium on PATH). One-line install of
// the bundled build: `npx playwright install chromium`.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function systemChromeCandidates(env = process.env) {
  const onPath = (bin) => { try { return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0] || null; } catch { return null; } };
  const windows = process.platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
    .filter(Boolean).flatMap(base => [path.join(base, 'Google/Chrome/Application/chrome.exe'),
      path.join(base, 'Microsoft/Edge/Application/msedge.exe')]) : [];
  const list = [env.CHROME_PATH, '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    env.HOME ? path.join(env.HOME, '.local/bin/google-chrome') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    ...windows, onPath(process.platform === 'win32' ? 'chrome.exe' : 'google-chrome'), onPath('chromium')];
  return [...new Set(list.filter((p) => p && existsSync(p)))];
}

/** Launch Chromium; returns { browser, executable } where executable is 'playwright-bundled' or the system path used. */
export async function launchChromium(chromium, options) {
  try {
    return { browser: await chromium.launch(options), executable: 'playwright-bundled' };
  } catch (err) {
    if (!/Executable doesn't exist|playwright install/i.test(String(err && err.message))) throw err;
  }
  for (const exe of systemChromeCandidates()) {
    try { return { browser: await chromium.launch({ ...options, executablePath: exe }), executable: exe }; } catch { /* next */ }
  }
  throw new Error('player-truth: no Chromium found. Run `npx playwright install chromium` or set CHROME_PATH=/path/to/chrome');
}
