#!/usr/bin/env node
// PQ-014 player-route evidence — natural NPC miner/hauler/patrol jobs in the FULL game.
//
// Boots the canonical New Game route (full registry + render), lets ambient traffic spawn and the
// npcJobsRuntime adapter naturally adopt miner/hauler/patrol hulls, then captures: the populated
// sector with live job hulls, the job-bag census (kind/phase/loopCount per job = a numbered route
// log), and a save -> Continue pair proving the jobs persist and resume coherently.
//
// This is CONFIRMATION of what the node census/convergence/continuity suites already prove
// deterministically; it exercises the same behavior through the real registry + browser runtime.
//
// GPU-mutex: only run this once the PQ-012 browser-free flag has been observed (see REPORT.md).

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq014-npc-jobs');
const MANIFEST = path.join(OUT, 'pq014-npc-jobs-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x50513134; // "PQ14"
const START_TIMEOUT_MS = Number(process.env.SF_PQ014_START_TIMEOUT_MS) || 180_000;
const JOBS_TIMEOUT_MS = Number(process.env.SF_PQ014_JOBS_TIMEOUT_MS) || 120_000;
const MIN_PNG_BYTES = 15_000;

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((c) => existsSync(c)) || null;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function waitForVisible(page, selector, label, timeout = 30_000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0 && rect.width > 20 && rect.height > 10;
  }, selector, { timeout }).catch(() => { throw new Error(`${label} (${selector}) never became visible`); });
}

async function screenshot(page, name, label) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'png' });
  const info = await stat(file);
  assert(info.isFile() && info.size >= MIN_PNG_BYTES, `${relative(file)} too small (${info.size} bytes)`);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be PNG`);
  return { file: relative(file), label, bytes: info.size };
}

// A plain-object census of the live job bag (kind/phase/loopCount/materialized per job).
function censusScript() {
  const state = window.SF.state;
  const byId = (state.npcJobs && state.npcJobs.byId) || {};
  const jobs = Object.keys(byId).map((id) => {
    const e = byId[id];
    return {
      id,
      kind: e.kind,
      phase: e.job && e.job.phase,
      loopCount: e.job && e.job.loopCount,
      routeIndex: e.job && e.job.routeIndex,
      materialized: e.job && e.job.materialized,
      entityLinked: e.entityId != null,
      sectorId: e.sectorId,
    };
  });
  const kinds = {};
  for (const j of jobs) kinds[j.kind] = (kinds[j.kind] || 0) + 1;
  return { count: jobs.length, kinds, sectorId: state.world && state.world.currentSectorId, jobs };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  const probe = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PQ014_URL || '', root: ROOT });
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: process.env.SF_PQ014_HEADED !== '1',
      ...(executablePath ? { executablePath } : {}),
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));

    // ── boot the canonical full-game flight route ──
    const response = await page.goto(probe.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert(response && response.ok(), 'game root must return OK');
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry),
      null, { timeout: 30_000 });
    await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);
    await page.evaluate((seed) => {
      window.SF.bus.emit('game:new', { seed, name: 'PQ-014 Evidence Pilot', shipId: 'ship_kestrel', difficulty: 'standard' });
    }, CAPTURE_SEED);
    await page.waitForFunction(() => {
      const s = window.SF && window.SF.state;
      const p = s && s.entities && s.entities.get(s.playerId);
      return !!(s && s.mode === 'flight' && p && p.alive !== false && p.hull > 0);
    }, null, { timeout: START_TIMEOUT_MS });

    // ── wait for ambient traffic to naturally produce jobs, and for them to advance ──
    await page.waitForFunction(() => {
      const byId = window.SF.state.npcJobs && window.SF.state.npcJobs.byId;
      return byId && Object.keys(byId).length > 0;
    }, null, { timeout: JOBS_TIMEOUT_MS }).catch(() => { throw new Error('no natural NPC jobs arose in the start sector within the timeout'); });
    // let the jobs run a while so miners work/cycle and patrols hold (real-time rAF)
    await page.waitForTimeout(15_000);

    const beforeCensus = await page.evaluate(censusScript);
    assert(beforeCensus.count > 0, 'the full game must carry live natural NPC jobs');
    const shotPopulated = await screenshot(page, '01-populated-sector.png', `populated sector ${beforeCensus.sectorId} with ${beforeCensus.count} live NPC jobs`);

    // ── save -> Continue: the jobs must persist and resume ──
    const saved = await page.evaluate(() => {
      const env = window.SF.registry.get('save').serialize('pq014-evidence');
      const bag = (env.data && env.data.npcJobs && env.data.npcJobs.byId) || {};
      return { version: env.version, jobKeys: Object.keys(bag), env };
    });
    assert(saved.version === 12, 'save envelope is v12');
    assert(saved.jobKeys.length > 0, 'the save envelope persists the live jobs');

    const continued = await page.evaluate((env) => {
      const ok = window.SF.registry.get('save').loadEnvelope(env, 'pq014-continue');
      return ok;
    }, saved.env);
    assert(continued === true, 'Continue (loadEnvelope) succeeds');
    await page.waitForTimeout(6_000); // let the sector re-populate + jobs re-link
    const afterCensus = await page.evaluate(censusScript);
    assert(afterCensus.count > 0, 'jobs survive Continue (bag non-empty after load)');
    const shotContinue = await screenshot(page, '02-after-continue.png', `after save -> Continue: ${afterCensus.count} jobs resumed`);

    // ── numbered route log ──
    const routeLog = beforeCensus.jobs.map((j, i) =>
      `${String(i + 1).padStart(2, '0')}. ${j.kind} ${j.id} phase=${j.phase} loop=${j.loopCount} materialized=${j.materialized}`);

    const evidence = {
      packet: 'PQ-014',
      schema: 'spaceface.pq014.npcJobsRouteEvidence.v1',
      seed: CAPTURE_SEED,
      pageErrors,
      startSector: beforeCensus.sectorId,
      before: { count: beforeCensus.count, kinds: beforeCensus.kinds },
      save: { version: saved.version, persistedJobKeys: saved.jobKeys },
      afterContinue: { count: afterCensus.count, kinds: afterCensus.kinds },
      routeLog,
      captures: [shotPopulated, shotContinue],
    };
    assert.equal(pageErrors.length, 0, `no page errors:\n${pageErrors.join('\n')}`);
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`PQ-014 route evidence OK: ${beforeCensus.count} jobs (${JSON.stringify(beforeCensus.kinds)}), Continue kept ${afterCensus.count}`);
    console.log(`Captures: ${shotPopulated.file}, ${shotContinue.file}`);
    console.log(`Manifest: ${relative(MANIFEST)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('PQ-014 route capture FAILED:', err && err.stack || err);
  process.exitCode = 1;
});
