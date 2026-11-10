#!/usr/bin/env node
// DEEP-STATE FIXTURE CAPTURE driver (packets G02 / G03).
//
// Usage:
//   node scripts/check-deep-state-capture.mjs --fixture=fresh-start [--career=hauler]
//        [--timeout-scale=2] [--headless] [--write-manifest]
//
// Drives the G01 public pilot core to the fixture's route stop, exports the EXACT save envelope
// the game wrote, proves the artifact restores through the public Continue path in a fresh
// context, writes artifact + capture/restore receipts under test/fixtures/deep-state-ladder/
// (durable, meant to be committed), and — with --write-manifest (integrator only) — promotes the
// fixture row to 'captured'. Screenshots/log evidence stay ignored under .devshots/deep-state/.
//
// A failed route still writes its evidence and exits 1 with an exact stage; that is a successful
// harness run of a failing route, not a capture.

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import {
  captureDeepStateFixture,
  CAPTURE_PLANS,
  DEEP_STATE_FIXTURE_DIR,
} from './lib/deepStateFixtureCapture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function parseArgs(argv) {
  const out = { fixture: null, career: 'hauler', timeoutScale: 1, headless: false, writeManifest: false, ok: true, errors: [] };
  for (const arg of argv) {
    if (arg.startsWith('--fixture=')) out.fixture = arg.slice('--fixture='.length);
    else if (arg.startsWith('--career=')) out.career = arg.slice('--career='.length);
    else if (arg.startsWith('--timeout-scale=')) out.timeoutScale = Number(arg.slice('--timeout-scale='.length)) || 1;
    else if (arg === '--headless') out.headless = true;
    else if (arg === '--write-manifest') out.writeManifest = true;
    else { out.ok = false; out.errors.push(`unknown argument: ${arg}`); }
  }
  if (!out.fixture || !CAPTURE_PLANS[out.fixture]) {
    out.ok = false;
    out.errors.push(`--fixture must be one of: ${Object.keys(CAPTURE_PLANS).join(', ')}`);
  }
  return out;
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return null;
}

const options = parseArgs(process.argv.slice(2));
if (!options.ok) {
  for (const error of options.errors) console.error(`[deep-state-capture] ${error}`);
  process.exit(2);
}

const OUT_ROOT = path.join(ROOT, '.devshots', 'deep-state');
const ACCEPTED = path.join(OUT_ROOT, options.fixture);
const STAGING = path.join(OUT_ROOT, `.tmp-${options.fixture}-${process.pid}-${randomBytes(4).toString('hex')}`);

const LOG = [];
const log = (message) => { LOG.push(message); console.log(message); };

let server = null;
let browser = null;
let context = null;
let page = null;
let exitCode = 1;

try {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  await mkdir(STAGING, { recursive: true });

  server = await acquireVisualProbeServer({ root: ROOT });
  const rootUrl = server.baseUrl;
  log(`[deep-state-capture] server ${rootUrl}`);

  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  if (!executablePath) throw new Error('no system Chrome/Edge found for the capture route');
  browser = await chromium.launch({ headless: options.headless, executablePath });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  // The pilot core observes an ALREADY-NAVIGATED page (the driver owns navigation, like
  // check-gold-corridor-public-pilot.mjs does).
  await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const result = await captureDeepStateFixture({
    fixtureId: options.fixture,
    page,
    context,
    browser,
    rootUrl,
    root: ROOT,
    career: options.career,
    timeoutScale: options.timeoutScale,
    commit,
    outputDir: STAGING,
    log,
  });

  await writeFile(path.join(STAGING, 'capture-run.json'), `${JSON.stringify({
    fixture: options.fixture, career: options.career, commit, rootUrl,
    ok: result.ok, stage: result.stage,
    claims: result.claims || [],
    artifact: result.artifactRel || null,
    artifactSha256: result.artifactSha || null,
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');

  if (result.ok && options.writeManifest) {
    const manifestPath = path.join(ROOT, DEEP_STATE_FIXTURE_DIR, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const row = manifest.fixtures.find((f) => f.id === options.fixture);
    if (!row) throw new Error(`fixture '${options.fixture}' not in manifest`);
    Object.assign(row, result.manifestPatch);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    log(`[deep-state-capture] manifest row '${options.fixture}' -> captured`);
  }

  if (result.ok) {
    log(`[deep-state-capture] CAPTURED ${options.fixture} sha256=${result.artifactSha}`);
    exitCode = 0;
  } else {
    log(`[deep-state-capture] FAILED at stage=${result.stage}`);
    if (result.claims) {
      for (const c of result.claims) log(`  claim ${c.ok ? 'ok ' : 'RED'}: ${c.text}`);
    }
  }
} catch (error) {
  log(`[deep-state-capture] error: ${error && error.message}`);
} finally {
  try { if (page) await page.close(); } catch (_) { /* teardown */ }
  try { if (context) await context.close(); } catch (_) { /* teardown */ }
  try { if (browser) await browser.close(); } catch (_) { /* teardown */ }
  try { if (server) await server.close(); } catch (_) { /* teardown */ }
  try {
    await rm(ACCEPTED, { recursive: true, force: true });
    await rename(STAGING, ACCEPTED);
  } catch (_) { /* evidence staging best-effort */ }
}

process.exit(exitCode);
