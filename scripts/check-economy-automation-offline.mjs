#!/usr/bin/env node
// ECON-P5 acceptance gate: automation offline catch-up receipts + deterministic cap accounting.
// Runs the focused unit suite and a thin static invariant pass over automation.js.
// Does not touch package.json (lane forbid); invoke via:
//   node scripts/check-economy-automation-offline.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  automation,
  clampOfflineEff,
  resolveOfflineElapsed,
  offlineCapBudgetForElapsed,
  settleOfflinePassive,
  buildOfflineReceipt,
  passiveCapPerMinForTier,
  OFFLINE_RECEIPT_SCHEMA_ID,
  OFFLINE_EFF_MAX,
} from '../src/systems/automation.js';
import { AUTO_BALANCE } from '../src/data/automation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const autoSrc = readFileSync(path.join(root, 'src/systems/automation.js'), 'utf8');

function runUnitTests() {
  const r = spawnSync(
    process.execPath,
    ['--test', 'test/economy-automation-offline.test.mjs'],
    { cwd: root, encoding: 'utf8' },
  );
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  assert.equal(r.status, 0, 'economy-automation-offline unit tests must pass');
}

function staticInvariants() {
  // Grant/charge intents only — no direct credits mutation in automation.js
  assert.equal(
    /player\.credits\s*=/.test(autoSrc),
    false,
    'automation.js must never assign player.credits (economy sole writer)',
  );
  // Offline method body only (not earlier bus wiring or live trader paths).
  const offlineStart = autoSrc.indexOf('runOfflineCatchup(opts');
  const offlineEnd = autoSrc.indexOf('offscreenRiskPass(', offlineStart);
  assert.ok(offlineStart >= 0 && offlineEnd > offlineStart, 'runOfflineCatchup body located');
  const offlineSlice = autoSrc.slice(offlineStart, offlineEnd);
  // Comments may mention the forbidden event; only live emit/call sites fail the gate.
  assert.equal(
    /(?:emit\s*\(\s*['"]economy:applyTradePressure['"]|_applyTradePressure\s*\()/.test(offlineSlice),
    false,
    'runOfflineCatchup must not emit/apply trade pressure (owner-safe)',
  );
  // Must emit offline summary receipt
  assert.ok(autoSrc.includes('automation:offlineSummary'));
  assert.ok(autoSrc.includes(OFFLINE_RECEIPT_SCHEMA_ID) || autoSrc.includes('OFFLINE_RECEIPT_SCHEMA_ID'));
  // Must use grant/charge intents
  assert.ok(autoSrc.includes("economy:grantCredits"));
  assert.ok(autoSrc.includes("economy:chargeCredits"));
  assert.ok(autoSrc.includes('lastOfflineWindowStart'));
}

function pureAccountingSmoke() {
  assert.ok(AUTO_BALANCE.offlineEff < 1);
  assert.equal(AUTO_BALANCE.offlineCapSec, 14400);
  assert.ok(clampOfflineEff(1) < 1);
  assert.equal(clampOfflineEff(1), OFFLINE_EFF_MAX);

  const neg = resolveOfflineElapsed(1000, 500, 14400);
  assert.equal(neg.failClosed, 'negative_wall');
  assert.equal(neg.elapsedSec, 0);

  const long = resolveOfflineElapsed(0, 0, 14400);
  // last=0 is no_baseline
  assert.equal(resolveOfflineElapsed(0, 99999, 14400).failClosed, 'no_baseline');

  const capMin = passiveCapPerMinForTier(AUTO_BALANCE, 1);
  const budget = offlineCapBudgetForElapsed(capMin, 14400);
  assert.equal(budget, capMin * 240);

  const settled = settleOfflinePassive({ grossCr: 10_000, offlineEff: 0.6, capBudget: budget });
  assert.ok(settled.credited <= budget);
  assert.ok(settled.offlineEff < 1);
  assert.ok(settled.presenceAdvantage);

  const receipt = buildOfflineReceipt({
    elapsedSec: 14400, credited: settled.credited, offlineEff: settled.offlineEff,
    capBudgetCr: budget, grantIntentsOnly: true, ownerSafePressure: true,
  });
  assert.equal(receipt.schemaId, OFFLINE_RECEIPT_SCHEMA_ID);
  JSON.parse(JSON.stringify(receipt)); // serializable
  assert.equal(receipt.tradePressureEvents, 0);
}

function liveCatchupSmoke() {
  const state = {
    simTime: 0,
    meta: { seed: 7 },
    playerId: 1,
    player: { credits: 20_000, droneTierCap: 1, stats: {}, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 }, ownedShips: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
  };
  const emitLog = [];
  const bus = {
    on() {},
    off() {},
    emit(evt, payload) { emitLog.push({ evt, payload }); },
  };
  const inst = Object.create(automation);
  inst.init({ state, bus, helpers: {}, registry: null });
  inst.newGame();
  inst._orePrice = () => 28;

  // Plant drone without purchase path
  state.automation.drones.push({
    id: 'au_chk', defId: 'drone_mk1', count: 1, tier: 1,
    sectorId: 'sector_helios_prime', buffer: 0, bufferCap: 60,
    fuel: 240, fuelMax: 240, durability: 40, status: 'mining',
    oreType: 'cmdty_ore_iron', entityIds: [],
  });

  const t0 = 9_000_000_000_000;
  state.automation.meta.lastTickTime = t0;
  state.automation.meta.lastOfflineWindowStart = 0;
  const r1 = inst.runOfflineCatchup({ nowMs: t0 + 5 * 3600 * 1000 });
  assert.equal(r1.elapsedSec, 14400);
  assert.equal(r1.elapsedCapped, true);
  assert.ok(r1.offlineEff < 1);
  assert.equal(r1.ownerSafePressure, true);
  assert.equal(r1.grantIntentsOnly, true);
  assert.ok(emitLog.some((e) => e.evt === 'automation:offlineSummary'));
  assert.ok(!emitLog.some((e) => e.evt === 'economy:applyTradePressure'));
  const grants = emitLog.filter((e) => e.evt === 'economy:grantCredits');
  for (const g of grants) assert.match(g.payload.reason, /^automation:/);

  // Credits unchanged without economy handler
  assert.equal(state.player.credits, 20_000);

  // Idempotent second call with same window
  state.automation.meta.lastTickTime = t0;
  emitLog.length = 0;
  const r2 = inst.runOfflineCatchup({ nowMs: t0 + 5 * 3600 * 1000 });
  assert.equal(r2.skipped, true);
  assert.equal(r2.skipReason, 'idempotent');
  assert.equal(emitLog.filter((e) => e.evt === 'economy:grantCredits').length, 0);
}

console.log('check-economy-automation-offline: unit tests…');
runUnitTests();
console.log('check-economy-automation-offline: static invariants…');
staticInvariants();
console.log('check-economy-automation-offline: pure accounting…');
pureAccountingSmoke();
console.log('check-economy-automation-offline: live catch-up smoke…');
liveCatchupSmoke();
console.log('check-economy-automation-offline: PASS');
