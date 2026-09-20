// PQ-155.00 — verb ladder: hour → verb → cost → gate; leftover stat-only ≤ 12.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  BROAD_PASSIVE_IDS,
  FIRST_UPGRADE,
  FIRST_UPGRADE_MINUTES,
  FOLDED_TECH_NODES,
  STAT_ONLY_JUSTIFICATIONS,
  STRICT_STAT_ONLY_IDS,
  TARGET_FIRST_UPGRADE_MINUTES,
  TECH_VERB_LADDER,
  VERB_LADDER_RATES,
  classifyTechNode,
  countVerbVsStatOnly,
  firstEarnedRow,
  honestHoursForCost,
  isHullLicenseOnly,
  nodeUnlocksShipOrModule,
  pathCostFor,
} from '../src/data/techVerbLadder.js';

const MAX_STAT_ONLY = 12;

test('PQ-155.00: 32 tech nodes, every node has one ladder row', () => {
  assert.equal(TECH_NODES.length, 32);
  assert.equal(TECH_VERB_LADDER.length, 32);
  const nodeIds = TECH_NODES.map((node) => node.id).sort();
  const rowIds = TECH_VERB_LADDER.map((row) => row.nodeId).sort();
  assert.deepEqual(rowIds, nodeIds);
});

test('PQ-155.00: each row is hour → verb → cost → gate', () => {
  for (const node of TECH_NODES) {
    const row = TECH_VERB_LADDER.find((entry) => entry.nodeId === node.id);
    assert.ok(row, node.id);
    assert.equal(typeof row.hour, 'number');
    // hour >= 0: entry-tier rows sit honestly at 0 under the derived price scale
    // (start capital covers them — see the FIRST_UPGRADE ruling).
    assert.ok(row.hour >= 0, `${node.id} hour`);
    assert.equal(typeof row.verb, 'string');
    assert.ok(row.verb.length > 0, `${node.id} verb`);
    assert.equal(row.cost.credits, node.cost.credits);
    assert.equal(row.cost.rp, node.cost.rp);
    assert.ok(row.gate);
    assert.deepEqual(row.gate.prereqs.slice().sort(), (node.prereqs || []).slice().sort());
    assert.ok(row.gate.bottleneck === 'rp' || row.gate.bottleneck === 'credits');
  }
});

test('PQ-155.00: strict 29 verb / 3 stat-only; each leftover justified', () => {
  const counts = countVerbVsStatOnly(TECH_NODES, 'strict');
  assert.equal(counts.total, 32);
  assert.equal(counts.verb, 29);
  assert.equal(counts.statOnly, 3);
  assert.ok(counts.statOnly <= MAX_STAT_ONLY);
  assert.deepEqual(counts.statOnlyIds.slice().sort(), STRICT_STAT_ONLY_IDS.slice().sort());
  for (const id of STRICT_STAT_ONLY_IDS) {
    const node = TECH_NODES.find((entry) => entry.id === id);
    assert.ok(node, id);
    assert.equal(nodeUnlocksShipOrModule(node), false, id);
    assert.equal(classifyTechNode(node, 'strict'), 'stat-only');
    assert.ok(STAT_ONLY_JUSTIFICATIONS[id], `${id} justification`);
  }
});

test('PQ-155.00: broad 23 verb / 9 stat-only; each leftover justified', () => {
  const counts = countVerbVsStatOnly(TECH_NODES, 'broad');
  assert.equal(counts.verb, 23);
  assert.equal(counts.statOnly, 9);
  assert.ok(counts.statOnly <= MAX_STAT_ONLY);
  const hullLicenses = TECH_NODES.filter(isHullLicenseOnly).map((node) => node.id).sort();
  assert.deepEqual(hullLicenses, [
    'tech_capital_hulls',
    'tech_industrial_mining',
    'tech_strike_craft',
    'tech_warship_license',
  ]);
  const expected = [
    ...STRICT_STAT_ONLY_IDS,
    ...hullLicenses,
    ...BROAD_PASSIVE_IDS,
  ].slice().sort();
  assert.deepEqual(counts.statOnlyIds.slice().sort(), expected);
  for (const id of expected) {
    assert.ok(STAT_ONLY_JUSTIFICATIONS[id], `${id} justification`);
  }
});

test('PQ-155.00: the entry tier is start-capital covered; the first earned upgrade is windowed', () => {
  // Ruling 2026-09-19 (owner-delegated): the derived price scale put the entry node
  // inside start capital, so the wallet no longer gates the first purchase — the
  // taught arc does. The honest saving window moves to the first row that must be
  // earned (firstEarnedRow), bracketed at 10–30 min by the Foothold characterization.
  assert.equal(NEW_GAME.credits, 5000);
  assert.equal(NEW_GAME.researchPoints, 0);
  assert.equal(FIRST_UPGRADE.nodeId, 'tech_combat_basics');
  assert.equal(FIRST_UPGRADE.cost.credits, 1200);
  assert.equal(FIRST_UPGRADE.cost.rp, 0);
  assert.equal(FIRST_UPGRADE.shortfallCredits, 0);
  assert.equal(FIRST_UPGRADE.shortfallRp, 0);
  assert.equal(FIRST_UPGRADE.hour, 0, 'start capital covers the entry tier outright');
  assert.equal(FIRST_UPGRADE.hourMinutes.min, 10);
  assert.equal(FIRST_UPGRADE.hourMinutes.max, 30);
  assert.equal(FIRST_UPGRADE.targetMinutes, 20);

  const earned = firstEarnedRow();
  assert.ok(earned, 'some ladder row must require earned income');
  assert.equal(earned.nodeId, 'tech_attack_topology');
  assert.ok(earned.hour * 60 >= FIRST_UPGRADE_MINUTES.min - 0.01,
    `first earned upgrade at ${earned.hour * 60} min`);
  assert.ok(earned.hour * 60 <= FIRST_UPGRADE_MINUTES.max + 0.01,
    `first earned upgrade at ${earned.hour * 60} min`);

  const combat = TECH_NODES.find((node) => node.id === 'tech_combat_basics');
  const live = honestHoursForCost(pathCostFor(combat.id));
  assert.equal(live.hour, 0, 'live characterization keeps the entry tier covered');
});

test('PQ-155.00: the early pool buys the first earned upgrade; flat rates alone still cannot', () => {
  // Anti-fake guard (re-pointed at the earned row by the 2026-09-19 ruling): the
  // canyon must be closed by real one-time early income (field sample + discovery
  // firsts + B0 settlement), never by a sustained rate that would make the window
  // trivially true.
  const earned = firstEarnedRow();
  const minutes = TARGET_FIRST_UPGRADE_MINUTES;
  const flatRp = VERB_LADDER_RATES.startRp
    + VERB_LADDER_RATES.rpPerHour * (minutes / 60);
  assert.ok(flatRp < earned.cost.rp,
    'sustained RP alone must not reach the first earned node inside the window');
  const pooledRp = VERB_LADDER_RATES.startRp + VERB_LADDER_RATES.earlyRpPool
    + VERB_LADDER_RATES.rpPerHour * (FIRST_UPGRADE_MINUTES.midpoint / 60);
  const pooledCredits = VERB_LADDER_RATES.startCredits + VERB_LADDER_RATES.earlyCreditsPool
    + VERB_LADDER_RATES.creditsPerHour * (FIRST_UPGRADE_MINUTES.midpoint / 60);
  assert.ok(pooledRp >= earned.cost.rp,
    'early pool + sustained RP must reach the first earned node inside the window');
  assert.ok(pooledCredits >= earned.cost.credits,
    'early pool + sustained credits must reach the first earned node inside the window');
  assert.equal(FOLDED_TECH_NODES.length, 1);
  assert.equal(FOLDED_TECH_NODES[0].id, 'tech_advanced_navigation');
  assert.ok(!TECH_NODES.some((node) => node.id === 'tech_advanced_navigation'));
});
