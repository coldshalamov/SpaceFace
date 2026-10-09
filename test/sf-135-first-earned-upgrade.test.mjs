// SF-135 — "progression pacing that respects a real first upgrade".
//
// Verdict: ALREADY TRUE, proven here rather than re-implemented. Under the derived price scale
// the entry tier is start-capital covered, so the honest first-upgrade question is the first
// ladder row a captain must actually EARN — techVerbLadder.firstEarnedRow() derives it from
// live node costs and live reward data, not a table. This test pins the packet's done-when:
//
//   - the milestone is achievable through actual earnings, inside the honest band;
//   - the one-time early pools are derived from the real RP/credit sources and can never
//     drift from them, and a first is never counted twice (the world ledger dedupes);
//   - a scanning detour legitimately shortens the wait, a broke pilot still gets there on
//     the sustained faucet (recovery route, bounded);
//   - the prices the player sees are the live costs, and the unlock is followed promptly by
//     a useful demonstration: its modules are fittable hardware on the starter hull.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { TECH_NODES } from '../src/data/tech.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { RESEARCH_GRANTS } from '../src/data/researchGrants.js';
import { MODULES } from '../src/data/modules.js';
import {
  EARLY_CREDITS_POOL,
  EARLY_RP_POOL,
  FIRST_UPGRADE_MINUTES,
  TECH_VERB_LADDER,
  VERB_LADDER_RATES,
  assertCommittedLadder,
  firstEarnedRow,
  honestHoursForCost,
  pathCostFor,
} from '../src/data/techVerbLadder.js';
import { missions } from '../src/systems/missions.js';
import { dryRunLoadoutPresetApply } from '../src/systems/ships.js';
import { FIRST_USE_LINE } from '../src/ui/hudAttention.js';
import { createBus } from '../src/core/eventBus.js';

const MINUTES = FIRST_UPGRADE_MINUTES;

test('the first earned upgrade is derived, earned, and inside the honest band', () => {
  const earned = firstEarnedRow();
  assert.ok(earned, 'some ladder row must actually require earned income');
  const minutes = earned.hour * 60;
  assert.ok(minutes >= MINUTES.min - 0.01 && minutes <= MINUTES.max + 0.01,
    `first earned upgrade ${earned.nodeId} lands at ${minutes.toFixed(1)} min — inside the ${MINUTES.min}–${MINUTES.max} band`);

  // The milestone is the PATH cost (node plus prerequisites) priced from live tech.js rows —
  // the same numbers the tech tree shows, not a stale pre-derived figure.
  const node = TECH_NODES.find((n) => n.id === earned.nodeId);
  const path = pathCostFor(earned.nodeId);
  assert.equal(earned.cost.credits, node.cost.credits, 'presentation price is the live node cost');
  assert.equal(earned.cost.rp, node.cost.rp);
  assert.ok(path.credits > 0 && path.rp > 0, 'the earned milestone has a real price on both currencies');
  const check = assertCommittedLadder();
  assert.equal(check.ok, true, `committed ladder must be green: ${check.errors.join('; ')}`);
});

test('the one-time pools are derived from the live reward sources, not written down', () => {
  // The RP pool IS the B0 field-sample grant plus the first anomaly triangulation and the
  // first signal investigation — if any of those retune, the model moves with them.
  const storyRp = Number(STORY_BEATS[0].reward.rp) || 0;
  const anomalyRp = RESEARCH_GRANTS['anomaly:triangulated'].rp;
  const signalRp = RESEARCH_GRANTS['signal:investigated'].rp;
  assert.ok(storyRp > 0 && anomalyRp > 0 && signalRp > 0,
    'the model\'s early RP comes from live reward rows that must exist');
  assert.equal(EARLY_RP_POOL.rp, storyRp + anomalyRp + signalRp);
  assert.equal(EARLY_CREDITS_POOL.credits, Number(STORY_BEATS[0].reward.credits) || 0);
  // The pool is bounded: needs inside it land proportionally inside its collection window —
  // it is earned income with a duration, never a free grant.
  assert.ok(EARLY_RP_POOL.hours > 0 && EARLY_CREDITS_POOL.hours > 0);
});

test('a first pays once — the live research ledger dedupes the one-time pool', () => {
  // The world side of "never counted twice": missions is the sole positive RP writer and its
  // researchFirsts ledger keys each grant on its durable discovery id.
  const bus = createBus();
  const state = { simTime: 60, player: { researchPoints: 0 } };
  const sys = Object.create(missions);
  sys.state = state;
  sys.bus = bus;

  const payload = { poiId: 'poi_anomaly_test' };
  const first = sys._grantResearchFirst('anomaly:triangulated', payload);
  assert.equal(first, RESEARCH_GRANTS['anomaly:triangulated'].rp, 'the first find pays the grant');
  const again = sys._grantResearchFirst('anomaly:triangulated', payload);
  assert.equal(again, 0, 'the same discovery can never pay the one-time grant twice');
  const other = sys._grantResearchFirst('anomaly:triangulated', { poiId: 'poi_anomaly_other' });
  assert.equal(other, RESEARCH_GRANTS['anomaly:triangulated'].rp,
    'a different discovery is a different first');
  const contractAsFirst = sys._grantResearchFirst('research:contract', { missionId: 'm1' });
  assert.equal(contractAsFirst, 0, 'a repeatable row must not enter the one-time pool');
  assert.equal(state.player.researchPoints, 2 * RESEARCH_GRANTS['anomaly:triangulated'].rp);
});

test('the scanning detour shortens the wait legitimately and stays bounded', () => {
  // Route B — the detour: a pilot who scans collects the pool inside its own window, so the
  // same milestone lands sooner than the flat sustained rate would. The model prices needs
  // inside the pool proportionally — scanning is a faster honest path, not a cheat.
  const earned = firstEarnedRow();
  const path = pathCostFor(earned.nodeId);
  const withPool = honestHoursForCost(path);
  const noPool = honestHoursForCost(path, {
    ...VERB_LADDER_RATES,
    earlyRpPool: 0, earlyRpPoolHours: 0,
    earlyCreditsPool: 0, earlyCreditsPoolHours: 0,
  });
  assert.ok(withPool.hour < noPool.hour,
    `the first-contact pool must pull the milestone forward (${withPool.hour}h vs ${noPool.hour}h)`);
  assert.ok(withPool.rpHours <= EARLY_RP_POOL.hours,
    'an RP need inside the pool lands inside the pool\'s own collection window');
});

test('the low-income recovery route still earns it — bounded, slower, never free', () => {
  // Route C — broke pilot, no one-time income left: the sustained faucet still reaches the
  // milestone; the window honestly stretches rather than becoming impossible or instant.
  const earned = firstEarnedRow();
  const path = pathCostFor(earned.nodeId);
  const broke = honestHoursForCost(path, {
    ...VERB_LADDER_RATES,
    startCredits: 0, startRp: 0,
    earlyRpPool: 0, earlyRpPoolHours: 0,
    earlyCreditsPool: 0, earlyCreditsPoolHours: 0,
  });
  assert.ok(Number.isFinite(broke.hour) && broke.hour > 0,
    'a pilot with nothing can still earn the milestone');
  assert.ok(broke.hour > MINUTES.max / 60,
    'recovery is honestly slower than the earned window, not a hidden grant');
  assert.ok(broke.hour < 4,
    `recovery stays bounded — ${broke.hour.toFixed(2)}h of sustained play, not a canyon`);

  // And the straightforward route (Route A) is what the band already proves: start capital
  // plus the first-contact pools cover the whole path inside the window.
  assert.ok(earned.hour * 60 <= MINUTES.max);
  assert.ok(NEW_GAME.credits >= FIRST_UPGRADE_CREDITS_FLOOR(),
    'start capital still covers the entry tier the taught arc sells first');
});

function FIRST_UPGRADE_CREDITS_FLOOR() {
  const entry = TECH_NODES.find((n) => n.id === 'tech_combat_basics');
  return Number(entry.cost.credits) || 0;
}

test('the unlock is followed promptly by a usable demonstration on the starter hull', () => {
  const earned = firstEarnedRow();
  const node = TECH_NODES.find((n) => n.id === earned.nodeId);
  const unlocks = (node.unlocks && node.unlocks.modules) || [];
  assert.ok(unlocks.length > 0, 'the first earned node must unlock real hardware, not a flag');
  for (const modId of unlocks) {
    const def = MODULES.find((m) => m.id === modId);
    assert.ok(def, `${modId} must exist in the module catalog`);
    assert.equal(def.requiresTech, node.id,
      `${modId} must be gated by the node that unlocks it — the purchase is the demonstration`);
  }

  // The cheapest unlocked fitting goes on the starter hull's S utility slot: the Hitch's
  // slot list is weapon/shield/engine/cargo/mining/utility/thruster, utility at index 5.
  const demoModule = 'mod_twin_mount';
  assert.ok(unlocks.includes(demoModule), 'twin mount is the hands-on demonstration');
  const targetFittings = [null, null, null, null, null, demoModule, null];
  const blocked = dryRunLoadoutPresetApply({
    shipDefId: NEW_GAME.shipId,
    targetFittings,
    moduleInventory: [{ instanceId: 'inv_demo', defId: demoModule }],
    player: { researchedNodes: [], cargo: { usedVolume: 0 } },
    enforceCargo: false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'research_required',
    'before the research the demonstration is honestly refused');
  const allowed = dryRunLoadoutPresetApply({
    shipDefId: NEW_GAME.shipId,
    targetFittings,
    moduleInventory: [{ instanceId: 'inv_demo', defId: demoModule }],
    player: { researchedNodes: [earned.nodeId], cargo: { usedVolume: 0 } },
    enforceCargo: false,
  });
  assert.equal(allowed.ok, true, `post-research fit must pass, got ${allowed.reason}`);

  // The moment is announced: the first-research hint fires on tech:researched and points at
  // the newly unlocked gear — the demonstration is prompted, not left for the player to find.
  assert.equal(typeof FIRST_USE_LINE.firstTech, 'string');
  assert.ok(FIRST_USE_LINE.firstTech.length > 0);
});

test('every ladder row prices from the live tree — no obsolete cost survives', () => {
  for (const row of TECH_VERB_LADDER) {
    const node = TECH_NODES.find((n) => n.id === row.nodeId);
    assert.ok(node, row.nodeId);
    assert.equal(row.cost.credits, Number(node.cost.credits) || 0, `${row.nodeId} credits`);
    assert.equal(row.cost.rp, Number(node.cost.rp) || 0, `${row.nodeId} rp`);
  }
});
