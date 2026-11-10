import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SHIPS } from '../src/data/ships.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runBenchmark(minutes) {
  const stdout = execFileSync(process.execPath, [
    'scripts/check-career-earnings-benchmark.mjs',
    '--minutes', String(minutes),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const marker = '{\n  "gate": "check-career-earnings-benchmark"';
  const start = stdout.indexOf(marker);
  assert.notEqual(start, -1, 'benchmark must print its JSON receipt');
  const end = stdout.indexOf('\n[check-career-earnings-benchmark] PASS', start);
  assert.notEqual(end, -1, 'benchmark JSON must be followed by a passing gate');
  return JSON.parse(stdout.slice(start, end));
}

function units(items) {
  return Object.values(items || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

test('Pelican is the 15,000-credit first physical Prospector upgrade', () => {
  const pelican = SHIPS.find((ship) => ship.id === 'ship_pelican');
  assert.ok(pelican);
  assert.equal(pelican.price, 15_000);
});

test('30-minute Prospector remains on Hitch with its owned Mining Laser S', () => {
  const report = runBenchmark(30);
  const prospector = report.careers.prospector;

  assert.equal(prospector.ok, true);
  assert.equal(prospector.equipment.activePhase, 'starter');
  assert.equal(prospector.equipment.currentShipId, 'ship_kestrel');
  assert.deepEqual(prospector.equipment.ownedMiningModules, ['mod_mining_laser_s']);
  assert.deepEqual(prospector.equipment.purchases, []);
  assert.equal(prospector.equipment.beamM.acquired, false);
  assert.equal(prospector.equipment.beamM.granted, false);
});

test('90-minute Prospector buys one Pelican through capital and keeps the starter laser', () => {
  const report = runBenchmark(90);
  const prospector = report.careers.prospector;
  const hullPurchases = prospector.equipment.purchases.filter((purchase) => purchase.kind === 'ship');

  assert.equal(prospector.ok, true);
  assert.equal(prospector.equipment.activePhase, 'pelican');
  assert.equal(prospector.equipment.currentShipId, 'ship_pelican');
  assert.equal(prospector.shipName, 'Pelican');
  assert.deepEqual(prospector.equipment.ownedMiningModules, ['mod_mining_laser_s']);
  assert.equal(hullPurchases.length, 1);
  assert.deepEqual(hullPurchases[0], {
    kind: 'ship',
    id: 'ship_pelican',
    price: 15_000,
    reason: 'shipyard:ship_pelican',
    atS: hullPurchases[0].atS,
    creditsBefore: hullPurchases[0].creditsBefore,
    creditsAfter: hullPurchases[0].creditsAfter,
  });
  assert.ok(hullPurchases[0].atS > 30 * 60, 'Pelican must not arrive during the starter half-hour');
  assert.ok(hullPurchases[0].atS <= 85 * 60, 'Pelican must arrive by minute 85');
  assert.equal(hullPurchases[0].creditsBefore - hullPurchases[0].creditsAfter, 15_000);
  assert.equal(prospector.purchaseSpend, 15_000);

  assert.equal(prospector.equipment.beamM.acquired, false);
  assert.equal(prospector.equipment.beamM.granted, false);
  assert.equal(prospector.equipment.beamM.price, 22_000);
  assert.deepEqual(prospector.equipment.beamM.researchGates.map((gate) => gate.techId), [
    'tech_focused_extraction',
  ]);

  assert.ok(prospector.fieldRotations.length >= 1, 'depleted mining fields must rotate');
  const expectedEnd = units(prospector.ownedInventoryStart)
    + prospector.inventoryCreated - prospector.inventoryRemoved;
  assert.equal(units(prospector.ownedInventoryEnd), expectedEnd, 'mined inventory must conserve exactly');
  assert.equal(report.beforeTuning.cross.ok, true, 'cross-career income band must remain healthy');
});
