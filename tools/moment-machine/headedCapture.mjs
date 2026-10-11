// One attempt to record the live Three.js view of a logged moment.
// A menu load, a screenshot, or a refused socket is not that playback.
// videoVerified stays false unless frames of the logged tape are encoded,
// which this attempt does not claim: the Adventure tape stores no positions.

import { spawn } from 'node:child_process';
import { once } from 'node:events';

const CHROME = '/usr/bin/google-chrome';

function spawnCollect(command, args, { timeoutMs, env }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      if (stdout.length > 30) stdout.shift();
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      if (stderr.length > 40) stderr.shift();
    });
    let timer = null;
    let settled = false;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ...extra,
        stdout: Buffer.concat(stdout).toString('utf8').slice(-2000),
        stderr: Buffer.concat(stderr).toString('utf8').slice(-2000),
      });
    };
    child.on('error', (error) => finish({ code: 127, error: String(error.message), killed: false }));
    child.on('close', (code) => finish({ code: code == null ? 1 : code, error: null, killed: false }));
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: 124, error: `timed out after ${timeoutMs}ms`, killed: true });
    }, timeoutMs);
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      if (response) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
}

async function probePage(port) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { code: 127, error: message, stderr: message };
  }
  const notes = [];
  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('pageerror', (error) => {
      notes.push(`pageerror: ${error && error.message ? error.message : error}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') notes.push(`console: ${msg.text()}`);
    });
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    });
    const status = response ? response.status() : 0;
    const view = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      let renderer = null;
      if (canvas) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'webgl';
        }
      }
      return {
        title: document.title || '',
        canvas: !!canvas,
        width: canvas ? canvas.width : 0,
        height: canvas ? canvas.height : 0,
        renderer,
      };
    });
    notes.unshift(
      `http ${status}; title=${JSON.stringify(view.title)}; canvas=${view.canvas}; `
      + `${view.width}x${view.height}; renderer=${view.renderer || 'none'}`,
    );
    notes.push('no Adventure-tape position samples, so this page is not playback of a logged moment');
    return { code: 0, error: null, stderr: notes.join('\n').slice(-2500) };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    notes.push(message);
    return { code: 1, error: message, stderr: notes.join('\n').slice(-2500) };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Start the game server and open it in Chrome. The returned error is the run's
 * own output. videoVerified is false: a loaded page is not a clip of the tape.
 */
export async function attemptHeadedPlayback(options = {}) {
  const port = options.port || 8766;
  const server = spawn(process.execPath, ['server.js', String(port)], {
    cwd: options.cwd,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverErr = [];
  server.stderr.on('data', (chunk) => {
    serverErr.push(chunk);
    if (serverErr.length > 20) serverErr.shift();
  });
  server.stdout.on('data', () => {});
  server.on('error', () => {});
  let serverError = null;
  try {
    const up = await waitForPort(port, 8000);
    if (!up) {
      serverError = Buffer.concat(serverErr).toString('utf8').slice(-1500)
        || 'game server did not accept a connection';
    }
    const chrome = up
      ? await probePage(port)
      : await spawnCollect(CHROME, ['--headless=new', '--no-sandbox', '--timeout=4000', `http://127.0.0.1:${port}/`], { timeoutMs: 8000 });
    const stderr = [serverError, chrome.stderr, chrome.error].filter(Boolean).join('\n').slice(-2500);
    return {
      attempted: true,
      ok: false,
      videoVerified: false,
      producedVideo: false,
      chrome: CHROME,
      port,
      serverUp: up,
      chromeCode: chrome.code,
      error: stderr || serverError || 'headed chrome produced no playback video',
      stderr,
    };
  } finally {
    server.kill('SIGKILL');
    await once(server, 'close').catch(() => {});
  }
}
