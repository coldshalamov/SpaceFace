// SEED-PC-06 — each gate scene type has at least six comm lines. The decision table is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planGateScene } from '../src/data/gateControl.js';

const SEED = 4242;

function scene(type, day, extra = {}) {
  const base = {
    mts_toll: { factionId: 'faction_mts', security: 0.5, wanted: false },
    scn_scan: { factionId: 'faction_scn', security: 0.85, wanted: false },
    queue: { factionId: 'faction_free', security: 0.7, wanted: false },
    hostile: { factionId: 'faction_mts', security: 0.5, wanted: true },
  };
  return planGateScene(SEED, 'sector_gate', 'sector_next', day, { ...base[type], ...extra });
}

test('each gate scene type speaks at least six lines on seed 4242', () => {
  for (const type of ['mts_toll', 'scn_scan', 'queue', 'hostile']) {
    const lines = new Set();
    for (let day = 0; day < 480; day++) {
      const row = scene(type, day);
      assert.equal(row.type, type);
      if (row.comms) lines.add(row.comms);
    }
    assert.ok(lines.size >= 6, `${type} spoke ${lines.size} lines`);
  }
});

test('the gate decision table still picks the same scene kinds', () => {
  assert.equal(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_mts', security: 0.5, wanted: false }).type, 'mts_toll');
  assert.equal(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_scn', security: 0.85, wanted: false }).type, 'scn_scan');
  assert.equal(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_free', security: 0.7, wanted: false }).type, 'queue');
  assert.equal(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_free', security: 0.2, wanted: false }).type, 'silent');
  assert.equal(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_mts', security: 0.5, wanted: true }).type, 'hostile');
  assert.notEqual(planGateScene(SEED, 's', 't', 1, { factionId: 'faction_mts', security: 0.9, wanted: false }).type, 'mts_toll');
  const toll = planGateScene(SEED, 's', 't', 3, { factionId: 'faction_mts', security: 0.5, wanted: false });
  assert.equal(toll.tollAmount >= 40 && toll.tollAmount <= 85 && toll.tollAmount % 15 === 10, true);
});
