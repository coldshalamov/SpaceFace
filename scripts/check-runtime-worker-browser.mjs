// Isolated real-Worker integration test; not a replacement for the full-game launch probe.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright';
import { resolveWorkerContractUrls, runMobileWorkerContract } from './lib/mobileWorkerContract.mjs';
const url = new URL(process.env.MOBILE_PROBE_URL || 'http://127.0.0.1:8765/');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
const out = `.devshots/mobile-workers/${engine}`;
await mkdir(out, { recursive: true });
const browser = await ({ chromium, webkit }[engine]).launch();
try {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  // Test-only same-origin empty document. Production game acceptance never routes or mocks assets.
  await page.route('**/__worker_contract__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker contract fixture</title>' }));
  await page.goto(new URL('__worker_contract__', url).href);
  const releaseBase = process.env.MOBILE_WORKER_RELEASE_BASE || '';
  const mode = process.env.MOBILE_WORKER_MODE || (releaseBase ? 'pinned' : 'retail');
  if (!['raw', 'retail', 'pinned'].includes(mode)) throw new Error(`Unknown MOBILE_WORKER_MODE: ${mode}`);
  if (mode === 'pinned' && !releaseBase) throw new Error('Pinned worker mode requires MOBILE_WORKER_RELEASE_BASE');
  const workerUrls = resolveWorkerContractUrls({ moduleUrl: url.href, production: mode !== 'raw',
    documentBase: url.href, releaseBase: mode === 'pinned' ? releaseBase : '' });
  const result = await runMobileWorkerContract(page, { workerUrls });
  assert.equal(result.digest.hex, result.digest.expectedHex);
  assert.equal(result.digest.returnedText, 'SpaceFace mobile worker contract');
  assert.equal(result.digest.detached, true); assert.equal(result.prepass.ok, true);
  assert.equal(result.prepass.glbMatches, true); assert.equal(result.prepass.detached, true);
  await writeFile(`${out}/report.json`, JSON.stringify({ engine, passed: true, ...result }, null, 2));
  console.log(JSON.stringify({ engine, workerRoundTrips: 'PASS', workerUrls, capabilities: result.capabilities }));
} finally { await browser.close(); }
