// AL-LG-12 — hours 11–15 of the verb ladder.
// Authored rows, not a seeded shuffle: the table does not read a seed.
// Seeds 4242 and 15510 are pinned to show they see the same five verbs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  LATE_HOUR_VERBS,
  HOUR_VERB_CURVE_THROUGH_15,
  classifyTechNode,
  hourVerbCurveGaps,
  verbForNodeId,
} from '../src/data/techVerbLadder.js';
import { classifyModule, classifyWeapon } from '../scripts/check-progression-verb-audit.mjs';

const STAT_PERCENT = /%/;

const EXPECTED = Object.freeze([
  Object.freeze({ hour: 11, nodeId: 'tech_payload_conduction', moduleId: 'mod_gravity_tag', verbKey: 'gravityTag', label: 'Gravity-tag a payload' }),
  Object.freeze({ hour: 12, nodeId: 'tech_orbit_cryo', moduleId: 'mod_cryo_gyros', verbKey: 'cryoOrbit', label: 'Lock a target in a cryo orbit' }),
  Object.freeze({ hour: 13, nodeId: 'tech_capital_weapons', moduleId: 'wpn_heavy_beam_l', verbKey: 'heavyBeam', label: 'Fire a heavy beam' }),
  Object.freeze({ hour: 14, nodeId: 'tech_capital_weapons', moduleId: 'wpn_torpedo_l', verbKey: 'torpedo', label: 'Fire a torpedo' }),
  Object.freeze({ hour: 15, nodeId: 'tech_flagship_command', moduleId: 'wpn_siege_lance_l', verbKey: 'siegeLance', label: 'Fire the siege lance' }),
]);

test('hours 11-15 are authored verbs, not stat percents', () => {
  assert.deepEqual(LATE_HOUR_VERBS, EXPECTED);
  assert.deepEqual(
    HOUR_VERB_CURVE_THROUGH_15.filter((row) => row.hour >= 11),
    EXPECTED,
  );
  assert.deepEqual(
    HOUR_VERB_CURVE_THROUGH_15.map((row) => row.hour),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  );
  const gaps = hourVerbCurveGaps();
  assert.deepEqual(gaps, [], gaps.join('; '));

  const moduleById = new Map(MODULES.map((mod) => [mod.id, mod]));
  const weaponById = new Map(WEAPONS.map((wpn) => [wpn.id, wpn]));
  const nodeById = new Map(TECH_NODES.map((node) => [node.id, node]));
  for (const row of EXPECTED) {
    assert.equal(STAT_PERCENT.test(row.label), false, row.label);
    const verb = verbForNodeId(row.nodeId);
    assert.equal(STAT_PERCENT.test(verb), false, verb);
    const node = nodeById.get(row.nodeId);
    assert.ok(node, row.nodeId);
    assert.equal(classifyTechNode(node, 'strict'), 'verb', row.nodeId);
    assert.equal(classifyTechNode(node, 'broad'), 'verb', row.nodeId);
    assert.equal(node.unlocks && node.unlocks.efficiency, undefined, row.nodeId);
    const mod = moduleById.get(row.moduleId);
    const wpn = weaponById.get(row.moduleId);
    if (mod) {
      assert.equal(classifyModule(mod).primary, 'verb', row.moduleId);
      assert.equal(mod.requiresTech, row.nodeId);
    } else {
      assert.ok(wpn, row.moduleId);
      assert.equal(classifyWeapon(wpn).primary, 'verb', row.moduleId);
      assert.equal(wpn.requiresTech, row.nodeId);
    }
  }
});

test('seeds 4242 and 15510 see the same authored hours 11-15', () => {
  for (const seed of [4242, 15510]) {
    const state = createGameState(seed);
    assert.equal(state.meta.seed, seed);
    assert.deepEqual(
      HOUR_VERB_CURVE_THROUGH_15.filter((row) => row.hour >= 11),
      EXPECTED,
    );
  }
});
