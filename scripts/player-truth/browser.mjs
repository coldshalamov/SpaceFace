// Chromium for the harness: Playwright's bundled build first, then a system Chrome
// (CHROME_PATH, /opt/google/chrome/chrome, google-chrome/chromium on PATH). One-line install of
// the bundled build: `npx playwright install chromium`.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

export function systemChromeCandidates(env = process.env) {
  const onPath = (bin) => { try { return execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; } catch { return null; } };
  const list = [env.CHROME_PATH, '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    env.HOME ? path.join(env.HOME, '.local/bin/google-chrome') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    onPath('google-chrome'), onPath('chromium')];
  return [...new Set(list.filter((p) => p && existsSync(p)))];
}

/** Launch Chromium; returns { browser, executable } where executable is 'playwright-bundled' or the system path used. */
export async function launchChromium(chromium, options) {
  if (process.env.CHROME_PATH) return { browser: await chromium.launch({ ...options, executablePath: process.env.CHROME_PATH }), executable: process.env.CHROME_PATH };
  try {
    return { browser: await chromium.launch(options), executable: 'playwright-bundled' };
  } catch (err) {
    if (!/Executable doesn't exist|playwright install/i.test(String(err && err.message))) throw err;
    for (const exe of systemChromeCandidates()) {
      try { return { browser: await chromium.launch({ ...options, executablePath: exe }), executable: exe }; } catch { /* next */ }
    }
    throw new Error('player-truth: no Chromium found. Run `npx playwright install chromium` or set CHROME_PATH=/path/to/chrome');
  }
}
