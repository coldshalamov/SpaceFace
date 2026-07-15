#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO_ID = 'scenario.47a.mass-discrepancy';
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const REMOTE_ROLES = new Set(['remote_contact']);
const AUTHORED_START_TIMEOUT_MS = 90000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.goto(withDebugFlight(server.baseUrl), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.eventTrace, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.SF.eventTrace.clear();
    window.SF.bus.emit('game:new', { name: '47-A Live Cold Open Check', seed: 47 });
  });
  await page.waitForFunction(
    (scenarioId) => {
      const sf = window.SF;
      return sf && sf.state
        && sf.state.mode === 'flight'
        && sf.state.scenario
        && sf.state.scenario.active
        && sf.state.scenario.active.id === scenarioId;
    },
    SCENARIO_ID,
    { timeout: AUTHORED_START_TIMEOUT_MS },
  );
  await page.waitForFunction(
    () => window.SF.eventTrace.snapshot().some((record) => record.type === 'presentation:cueApplied'),
    null,
    { timeout: 20000 },
  );

  const report = await page.evaluate(({ scenarioId, scenarioPath }) => {
    const sf = window.SF;
    const state = sf.state;
    const contract = sf.helpers.scenarioContract;
    const trace = sf.eventTrace.snapshot();
    const actors = (contract.actors || []).map((actor) => {
      const binding = state.scenario.actorBindings[actor.id] || null;
      const entity = binding && binding.entityId != null ? state.entities.get(binding.entityId) : null;
      const player = state.entities.get(state.playerId);
      const dx = entity && player ? entity.pos.x - player.pos.x : null;
      const dz = entity && player ? entity.pos.z - player.pos.z : null;
      return {
        id: actor.id,
        role: actor.role,
        required: actor.required === true,
        status: binding && binding.status || 'missing',
        entityId: binding && binding.entityId != null ? binding.entityId : null,
        entityExists: !!entity,
        entityType: entity && entity.type || null,
        entityActorId: entity && entity.data && entity.data.scenarioActorId || null,
        team: entity && entity.team != null ? entity.team : null,
        factionId: entity && entity.factionId || null,
        aiPassive: !!(entity && entity.data && entity.data.ai && entity.data.ai.passive),
        liveColdStartSafe: !!(entity && entity.data && entity.data.ai && entity.data.ai.liveColdStartSafe),
        targetId: entity && entity.data && entity.data.combat ? entity.data.combat.targetId ?? null : null,
        distanceToPlayer: dx == null || dz == null ? null : Math.hypot(dx, dz),
        sourceKind: binding && binding.source && binding.source.kind || null,
      };
      });
    const player = state.entities.get(state.playerId);
    const playerTeam = player && player.team != null ? player.team : 0;
    const coldOpenShips = state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.id !== state.playerId)
      .map((entity) => {
        const dx = player ? entity.pos.x - player.pos.x : null;
        const dz = player ? entity.pos.z - player.pos.z : null;
        const ai = entity.data && entity.data.ai || {};
        const combat = entity.data && entity.data.combat || {};
        const intent = entity.data && entity.data.intent || {};
        const weapons = entity.data && entity.data.weapons || [];
        return {
          id: entity.id,
          actorId: entity.data && entity.data.scenarioActorId || null,
          team: entity.team != null ? entity.team : null,
          factionId: entity.factionId || null,
          aiPassive: ai.passive === true,
          hasCombatAi: !!entity.data && !!entity.data.ai,
          hasWeapons: Array.isArray(weapons) && weapons.length > 0,
          distanceToPlayer: dx == null || dz == null ? null : Math.hypot(dx, dz),
          targetId: combat.targetId ?? null,
          lockTarget: combat.lockTarget ?? null,
          lockProgress: combat.lockProgress ?? 0,
          firing: intent.fire === true,
          fireGroup: intent.fireGroup ?? null,
        };
    });
    const byType = {};
    for (const record of trace) byType[record.type] = (byType[record.type] || 0) + 1;
    const ambientGateProbe = 'COLD-OPEN AMBIENT GATE PROBE';
    sf.bus.emit('comms:popup', { sender: 'TEST CARRIER', category: 'ambient', text: ambientGateProbe });
    return {
      mode: state.mode,
      playerId: state.playerId,
      playerTeam,
      helperContractId: contract && contract.id,
      helperContractPath: sf.helpers.scenarioContractPath,
      helperContractHash: sf.helpers.scenarioContractHash,
      active: state.scenario.active,
      unresolvedActorIds: state.scenario.unresolvedActorIds.slice(),
      enteredBeatIds: state.scenario.enteredBeatIds.slice(),
      actors,
      coldOpenShips,
      traceCount: trace.length,
      byType,
      hasKesslerDialogue: trace.some((record) =>
        record.type === 'scenario:dialogueLine'
        && record.payload
        && record.payload.speakerActorId === 'contact_kessler'
        && /that pulse is the job/i.test(record.payload.text || '')),
      hasSignalCue: trace.some((record) =>
        record.type === 'presentation:cue' && record.payload && record.payload.id === 'scenario.signal.pulse'),
      hasSignalCueApplied: trace.some((record) =>
        record.type === 'presentation:cueApplied' && record.payload && record.payload.id === 'scenario.signal.pulse'),
      kesslerCommsVisible: /Kestrel, that pulse is the job/i.test(document.body.textContent || ''),
      onboardingGateActive: !!(state.onboarding && state.onboarding.active && !state.onboarding.finished),
      ambientGateProbeVisible: (document.body.textContent || '').includes(ambientGateProbe),
      scenarioId,
      scenarioPath,
    };
  }, { scenarioId: SCENARIO_ID, scenarioPath: SCENARIO_PATH });

  assert.equal(report.mode, 'flight', 'New Game should enter flight mode');
  assert.equal(report.helperContractId, SCENARIO_ID, 'browser helpers should load the canonical 47-A contract');
  assert.equal(report.helperContractPath, SCENARIO_PATH, 'browser helpers should report the canonical contract path');
  assert.match(report.helperContractHash, /^[0-9a-f]{64}$/, 'browser helpers should publish the contract sha256');
  assert.equal(report.active.id, SCENARIO_ID, 'scenario runtime should activate 47-A in the live browser game');
  assert.equal(report.active.contractPath, SCENARIO_PATH, 'active scenario should retain the canonical contract path');
  assert.equal(report.active.contractHash, report.helperContractHash, 'active scenario hash should match browser helper hash');
  assert.equal(report.active.activeBeatId, 'drop_wreck_field', 'live cold open should enter the first 47-A beat');
  assert.deepEqual(report.unresolvedActorIds, [], 'live cold open should bind every required 47-A actor');
  assert(report.enteredBeatIds.includes('drop_wreck_field'), 'live cold open should record first beat entry');
  assert(report.traceCount > 0, 'event trace should capture live scenario evidence');
  assert.equal(report.byType['scenario:loaded'], 1, 'live cold open should emit scenario:loaded once');
  assert.equal(report.byType['scenario:actorBindings'], 1, 'live cold open should emit actor binding evidence once');
  assert(report.byType['scenario:beatEntered'] >= 1, 'live cold open should emit beat entry evidence');
  assert(report.hasKesslerDialogue, 'live cold open should emit Kessler scenario dialogue');
  assert(report.hasSignalCue, 'live cold open should emit the first signal presentation cue');
  assert(report.hasSignalCueApplied, 'live cold open should apply the first signal presentation cue');
  assert(report.kesslerCommsVisible, 'live cold open should render Kessler dialogue in the comms feed');
  assert.equal(report.onboardingGateActive, true, 'cold-open comms proof must exercise the active onboarding gate');
  assert.equal(report.ambientGateProbeVisible, false,
    'ordinary ambient chatter should remain held while authored scenario dialogue bypasses the onboarding gate');

  const missing = report.actors.filter((actor) => actor.required && actor.status !== 'bound');
  assert.deepEqual(missing, [], 'all required scenario actors should bind');
  const missingEntities = report.actors.filter((actor) =>
    actor.required
    && !REMOTE_ROLES.has(actor.role)
    && (!actor.entityExists || actor.entityActorId !== actor.id));
  assert.deepEqual(missingEntities, [], 'all required physical scenario actors should have live entities');
  assert.equal(report.actors.find((actor) => actor.id === 'contact_kessler')?.sourceKind, 'narrativeFigure',
    'Kessler should bind through the narrative figure catalog');
  for (const id of ['scavenger_interceptor', 'scavenger_harasser', 'scavenger_thief', 'official_recovery_tug']) {
    const actor = report.actors.find((entry) => entry.id === id);
    assert(actor, `${id} actor should exist in live cold-open report`);
    assert.equal(actor.team, 0, `${id} should be neutral before its scenario beat`);
    assert.equal(actor.factionId, 'faction_free', `${id} should not present as an immediate hostile faction`);
    assert.equal(actor.aiPassive, true, `${id} should be passive before its scenario beat`);
    assert.equal(actor.liveColdStartSafe, true, `${id} should be marked as live cold-start safe`);
    assert.equal(actor.targetId, null, `${id} should not target the player in the cold open`);
    assert(actor.distanceToPlayer >= 1500, `${id} should hold outside the spawn threat bubble`);
  }
  const hostileShips = report.coldOpenShips.filter((ship) => ship.team != null && ship.team !== report.playerTeam);
  const activeAttackers = hostileShips.filter((ship) =>
    (ship.hasCombatAi && !ship.aiPassive && ship.hasWeapons)
    || ship.targetId === report.playerId
    || ship.lockTarget === report.playerId
    || ship.firing
    || ship.fireGroup != null);
  assert.deepEqual(activeAttackers.filter((ship) => ship.distanceToPlayer < 1500), [],
    'live cold open should not contain a close hostile attacker near the player');
  assert.deepEqual(hostileShips.filter((ship) => ship.targetId === report.playerId || ship.lockTarget === report.playerId), [],
    'live cold open should not contain a hostile target lock on the player');
  assert.deepEqual(hostileShips.filter((ship) => ship.firing || ship.fireGroup != null), [],
    'live cold open should not contain a hostile firing intent during the first window');
  assert.deepEqual(issues.errorIssues(), [], 'browser cold-open check should not record page errors');

  console.log(`47-A live cold open OK (${report.actors.length} actors bound, ${report.traceCount} trace records)`);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8124);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 60; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for 47-A live cold-open check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}
