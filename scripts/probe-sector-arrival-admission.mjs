#!/usr/bin/env node
// Sector arrival admission probe.
//
// The player jumps Helios -> Ceres through the real gate seam and the arriving sector's authored
// bodies must publish. Before this probe existed, the live-sector cook re-armed the opening's two
// publication guards (`firstFlightHandoffHold` + `openingGraphPublicationFrozen`) on a path that
// never returns to `loading`, so nothing at the destination ever reached
// `presentationAdmission: 'ready'` — the station 207 WU from the arrival point stayed `pending`
// for the whole session and the player arrived at an empty field of rock.
//
// Contract asserted here: every entity within RANGE_WU of the player that entered the authored
// admission path is `ready` by ARRIVE_BUDGET_S seconds of sim time after arrival.
//
//   node scripts/probe-sector-arrival-admission.mjs                 # gate jump, headed (real GPU)
//   node scripts/probe-sector-arrival-admission.mjs --teleport      # world.enterSector directly
//   node scripts/probe-sector-arrival-admission.mjs --continue      # F9 save at Ceres, then load
//   node scripts/probe-sector-arrival-admission.mjs --diagnose      # dump the render hold flags
//   node scripts/probe-sector-arrival-admission.mjs --shot out.png  # still at the shipping camera
//
// Headed is the default because the admission machinery only runs with a real
// `state.render.scene`; `--headless` is available for triage, not for proof.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SECTOR = 'sector_ceres_belt';
const RANGE_WU = 340;
/** Sim seconds after arrival the census is read at. The first is the goal, the last is the alarm. */
const SAMPLE_SECONDS = [5, 20, 45, 60, 90, 120];

const argv = process.argv.slice(2);
const readOption = (flag, fallback = null) => {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
};
/**
 * Sim seconds after arrival by which every admitted body must be published.
 *
 * The defect this guards is categorical — before the fix the arriving sector published NOTHING for
 * the rest of the session — so the budget is set where a slow machine still passes and a broken
 * release still fails. The arriving sector publishes as one certified set (the prewarm's population
 * fixpoint) and authored admission is serial in flight, so on the reference Intel iGPU a gate jump
 * lands the whole Ceres population between +60 s and +90 s (`--teleport` +45 s, Continue +5 s). The
 * probe stops at the sample it lands on and prints it, so a speed regression is visible in the log
 * even while the assertion passes; pass `--budget` to hold a faster machine to a tighter number.
 */
const ARRIVE_BUDGET_S = Math.max(1, Number(readOption('--budget', '120')) || 120);
const HEADLESS = argv.includes('--headless');
const VIA_TELEPORT = argv.includes('--teleport');
const VIA_CONTINUE = argv.includes('--continue');
const DIAGNOSE = argv.includes('--diagnose');
const SHOT = readOption('--shot');
const SEED = Number(readOption('--seed', '4242')) || 4242;
const EXPLICIT_URL = readOption('--url', '');
/**
 * Sim seconds of ordinary flight before the jump is requested. The default is the player route:
 * you spawn at Helios and fly to the gate, which cannot happen inside the opening's 20 s
 * first-flight settle window. `--jump-at 0` jumps on the first flight frame — the stress row that
 * lands the arrival inside that window.
 */
const JUMP_AT_SIM_S = Math.max(0, Number(readOption('--jump-at', '25')) || 0);

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => existsSync(candidate));

const t0 = Date.now();
const stamp = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const server = await acquireVisualProbeServer({ explicitUrl: EXPLICIT_URL, root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  ...(browserPath ? { executablePath: browserPath } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const logs = [];
page.on('console', (message) => {
  const text = message.text();
  if (/opening|cook|admission|sector|pending|prewarm|prepare/i.test(text)) logs.push(text.slice(0, 240));
});

const censusScript = (range) => {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const rows = (state.entityList || [])
    .filter((entity) => entity
      && entity.alive !== false
      && entity.id !== state.playerId
      && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= range)
    .map((entity) => ({
      id: entity.id,
      type: entity.type,
      d: Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)),
      adm: entity.presentationAdmission ?? null,
      authored: (entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredAssetState) || null,
      // The prewarm staging filter reads exactly these three; a body materialized without one of
      // them is invisible to the arriving sector's prepare-then-publish contract.
      sec: entity.homeSectorId || (entity.data && (entity.data.homeSectorId || entity.data.sectorId)) || null,
      tier: (entity.activity && entity.activity.presentationTier) || null,
      place: (entity.data && (entity.data.placeId || entity.data.stationId || entity.data.archetypeGlb)) || null,
    }));
  const tally = {};
  for (const row of rows) {
    const key = `${row.type}:${row.adm}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  // Sector-wide, so a body just outside the ranged census still shows whether the arriving
  // sector publishes at all. `pending` (the assertion set) stays ranged.
  const sectorTally = {};
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.presentationAdmission == null) continue;
    const key = `${entity.type}:${entity.presentationAdmission}`;
    sectorTally[key] = (sectorTally[key] || 0) + 1;
  }
  return {
    simTime: state.simTime,
    sector: state.world.currentSectorId,
    playerAdm: player.presentationAdmission ?? null,
    pending: rows.filter((row) => row.adm != null && row.adm !== 'ready'),
    tally,
    sectorTally,
    rows,
  };
};

const diagnoseScript = () => {
  const render = window.SF.state.render || {};
  const scene = render.scene;
  const queue = scene && scene.userData && scene.userData.authoredUpgradeDiagnostics;
  let system = null;
  try { system = window.SF.registry.get('render'); } catch { system = null; }
  const prewarm = (record) => (record
    ? {
      sectorId: record.sectorId,
      active: record.active === true,
      requests: (record.requests || []).length,
      boundaryRecords: record.boundaryRecords ? record.boundaryRecords.size : 0,
      liveBoundaryPromises: record.liveBoundaryPromises ? record.liveBoundaryPromises.size : 0,
      populationSeeded: record.populationSeeded === true,
    }
    : null);
  return {
    authoredSectorPrewarmPendingId: system ? (system._authoredSectorPrewarmPendingId ?? null) : 'no-system',
    incomingSectorPrewarm: system ? prewarm(system._incomingSectorPrewarm) : null,
    currentSectorPrewarm: system ? prewarm(system._currentSectorPrewarm) : null,
    pendingSectorPrewarm: system ? prewarm(system._authoredSectorPrewarmPending) : null,
    boundaryPreparations: system && system._sectorBoundaryPreparations
      ? system._sectorBoundaryPreparations.inspect()
      : null,
    boundaryFailures: system && system._sectorBoundaryPreparations
      ? system._sectorBoundaryPreparations.inspectFailures().slice(-6)
      : null,
    meshCount: system && system._meshes ? system._meshes.size : null,
    openingGraphPublicationFrozen: render.openingGraphPublicationFrozen === true,
    hasPublicationGate: typeof render.waitForOpeningGraphPublicationRelease === 'function',
    deferNoncriticalMeshStreaming: render.deferNoncriticalMeshStreaming === true,
    sectorShellAdmission: render.sectorShellAdmission === true,
    liveSectorGpuAdmission: render.liveSectorGpuAdmission === true,
    firstFlightResidencyHoldUntil: render.firstFlightResidencyHoldUntil ?? null,
    firstFlightDeferredHoldUntil: render.firstFlightDeferredHoldUntil ?? null,
    // Publication is only half of "the arriving sector draws". These say whether the pose mirror
    // kept up with the entity table the jump replaced.
    presentationDuplicateIdRejects: render.presentationWorld?.duplicateIdRejects ?? null,
    presentationStaleHandleRejects: render.presentationWorld?.staleHandleRejects ?? null,
    presentationActive: render.presentationWorld?.active ?? null,
    sessionLiveSectorCookedId: render.sessionLiveSectorCookedId ?? null,
    upgradeQueue: queue
      ? {
        activeJobs: queue.activeJobs,
        jobs: (queue.jobs || []).map((job) => `${job.key}:${job.status}`),
      }
      : null,
  };
};

let failure = null;
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180_000 });
  stamp('flight');
  await page.waitForFunction(() => {
    const state = window.SF.state;
    return state.entities.get(state.playerId)?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });
  stamp('player admitted at the origin sector');

  const gpu = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (error) { return String(error); }
  });
  console.log('GPU:', gpu, '| seed:', await page.evaluate(() => window.SF.state.meta.seed));
  const origin = await page.evaluate(censusScript, RANGE_WU);
  console.log('ORIGIN census within', RANGE_WU, 'WU:', JSON.stringify(origin.tally),
    '| sector-wide:', JSON.stringify(origin.sectorTally));
  if (DIAGNOSE) console.log('  diagnose origin:', JSON.stringify(await page.evaluate(diagnoseScript)));

  if (JUMP_AT_SIM_S > 0) {
    await page.waitForFunction((target) => window.SF.state.simTime >= target,
      JUMP_AT_SIM_S, { timeout: 300_000 });
    stamp(`flew ${JUMP_AT_SIM_S}s of sim before requesting the jump`);
  }

  if (VIA_TELEPORT) {
    await page.evaluate((sectorId) => window.SF.registry.get('world').enterSector(sectorId), TARGET_SECTOR);
    stamp('teleport enterSector requested');
  } else {
    await page.evaluate((sectorId) => window.SF.bus.emit('world:requestJump', {
      targetSectorId: sectorId,
      via: 'gate',
    }), TARGET_SECTOR);
    stamp('world:requestJump emitted');
  }
  await page.waitForFunction((sectorId) => window.SF.state.world.currentSectorId === sectorId
    && window.SF.state.mode === 'flight', TARGET_SECTOR, { timeout: 240_000 });
  stamp(`arrived in ${TARGET_SECTOR}`);

  if (VIA_CONTINUE) {
    // Save in the destination sector, then reload the page and Continue into it. The load path
    // must publish the same bodies the jump path does.
    await page.waitForFunction(() => window.SF.state.simTime > 0, null, { timeout: 30_000 });
    // The F5 keybinding's own event. `save:request` does not exist; emitting it wrote nothing and
    // the reload then Continued into the ORIGIN sector, which is a silent false pass.
    await page.evaluate(() => window.SF.bus.emit('game:save', { slot: 'quick' }));
    const savedSector = await page.waitForFunction(() => {
      const raw = localStorage.getItem('sf.save.quick');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.data?.world?.currentSectorId || parsed?.world?.currentSectorId || 'unknown';
      } catch { return 'unparsed'; }
    }, null, { timeout: 30_000 }).then((handle) => handle.jsonValue());
    assert.equal(savedSector, TARGET_SECTOR,
      `the quick save must be written in ${TARGET_SECTOR}, not ${savedSector}`);
    stamp(`quick save written at the destination (${savedSector})`);
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: /^Continue$/i }).click({ timeout: 30_000 });
    await page.waitForFunction((sectorId) => window.SF.state.mode === 'flight'
      && window.SF.state.world.currentSectorId === sectorId, TARGET_SECTOR, { timeout: 240_000 });
    stamp('continued into the destination sector');
  }

  const simArrive = await page.evaluate(() => window.SF.state.simTime);
  const samples = [];
  for (const wait of SAMPLE_SECONDS) {
    if (wait > ARRIVE_BUDGET_S) break;
    await page.waitForFunction((target) => window.SF.state.simTime >= target,
      simArrive + wait, { timeout: 300_000 });
    const census = await page.evaluate(censusScript, RANGE_WU);
    samples.push({ wait, census });
    console.log(`ARRIVAL +${wait}s sim (player ${census.playerAdm}):`, JSON.stringify(census.tally),
      '| sector-wide:', JSON.stringify(census.sectorTally));
    if (DIAGNOSE) {
      console.log(`  diagnose +${wait}s:`, JSON.stringify(await page.evaluate(diagnoseScript)));
    }
    // Stop at the sample it lands on: the landing sample IS the number, and waiting past it only
    // burns CI wall clock.
    if (census.pending.length === 0) break;
  }
  const last = samples[samples.length - 1].census;
  console.log('rows:', JSON.stringify(last.rows));

  if (SHOT) {
    mkdirSync(path.dirname(path.resolve(SHOT)), { recursive: true });
    await page.screenshot({ path: path.resolve(SHOT) });
    stamp(`still written to ${path.resolve(SHOT)}`);
  }

  const withinBudget = samples.filter((sample) => sample.wait <= ARRIVE_BUDGET_S);
  const budget = withinBudget[withinBudget.length - 1] || samples[samples.length - 1];
  const stranded = budget.census.pending;
  assert.equal(
    stranded.length,
    0,
    `authored bodies must publish within ${ARRIVE_BUDGET_S}s of arriving in ${TARGET_SECTOR}; `
      + `still unpublished: ${JSON.stringify(stranded)}`,
  );
  const published = samples.find((sample) => sample.census.pending.length === 0)
    || samples[samples.length - 1];
  console.log(`PUBLISHED at +${published.wait}s sim (budget ${ARRIVE_BUDGET_S}s)`);
  if (published.wait > 20) {
    // The assert guards the categorical regression (the arriving sector publishes NOTHING, for the
    // session). This line is the speed number: the whole authored population publishes as one
    // certified set and admission is serial in flight, so it scales with the machine. Watch the
    // sample it lands on — a jump from +45 to +90 is a real slowdown even while the assert passes.
    console.log(`WARN sector arrival published at +${published.wait}s, past the 20s bar`);
  }
  console.log('PASS sector arrival publishes the destination');
} catch (error) {
  failure = error;
  console.error('PROBE FAIL', error?.stack || error);
  console.log('--- console tail ---');
  for (const line of logs.slice(-30)) console.log('  ', line);
  process.exitCode = 1;
} finally {
  if (!failure && DIAGNOSE) {
    console.log('--- console tail ---');
    for (const line of logs.slice(-30)) console.log('  ', line);
  }
  await browser.close().catch(() => {});
  if (typeof server.close === 'function') await server.close().catch(() => {});
}
