// M3 Hunter live balance — contract economics, exclusive settlement, retry haircut, RP path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { MISSION_TUNING, MISSION_TYPES, OFFER_MIX } from '../src/data/missions.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import {
  CAREER_ORIGIN_CONTRACTS,
  HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  buildOriginContractOffer,
} from '../src/careers/origins/careerOriginContracts.js';
import { HUNTER_ORIGIN_REWARD } from '../src/careers/origins/hunterOriginData.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import {
  blockNondeterminism,
  restoreNondeterminism,
  runCareerStrategy,
  CAREER_BANDS,
} from '../src/balance/careerCohorts.js';
import {
  HUNTER_HEALTHY_CR_PER_MIN,
  HUNTER_HEALTHY_UPPER_CR_PER_MIN,
} from '../src/balance/hunterPublicRoute.js';

test('bounty_hunt BASE and formula string agree; intentional combat pay above dead freight floor', () => {
  assert.equal(MISSION_TUNING.BASE.bounty_hunt, 110);
  const def = MISSION_TYPES.find((row) => row.type === 'bounty_hunt');
  assert.ok(def);
  assert.deepEqual(def.riskTierRange, [1, 4]);
  const leading = /round\(\s*(\d+)/.exec(def.rewardFormula || '');
  assert.ok(leading);
  assert.equal(Number(leading[1]), MISSION_TUNING.BASE.bounty_hunt);
  // Combat single-target writs stay below mining quota and multi-kill patrol pay.
  assert.ok(MISSION_TUNING.BASE.bounty_hunt < MISSION_TUNING.BASE.mining_quota);
  assert.ok(MISSION_TUNING.BASE.bounty_hunt < MISSION_TUNING.BASE.patrol_clear);
  assert.ok(MISSION_TUNING.BASE.bounty_hunt > 80, 'must exceed the pre-repair underpay constant');
});

test('civilian boards carry a denser bounty column so Hunter is not refresh-idle starved', () => {
  // [cargo, trade, bounty, mining, salvage, escort, patrol, smuggling, passenger, recon]
  assert.ok(OFFER_MIX.trade_hub[2] >= 2);
  assert.ok(OFFER_MIX.refinery[2] >= 2);
  assert.ok(OFFER_MIX.military[2] >= 4);
});

test('origin clean envelope stays cash-only and retry haircuts are strictly worse than success', () => {
  const writSum = CAREER_ORIGIN_CONTRACTS.hunter.reduce((sum, def) => sum + def.rewardCr, 0);
  assert.equal(writSum + HUNTER_ORIGIN_REWARD.credits, HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR);
  const state = { meta: { seed: 0xC0B0_B091 }, seed: 0xC0B0_B091 };
  for (const [index, def] of CAREER_ORIGIN_CONTRACTS.hunter.entries()) {
    const clean = buildOriginContractOffer(state, 'hunter', index, 0);
    const retry = buildOriginContractOffer(state, 'hunter', index, 1);
    assert.equal(clean.reward_cr, def.rewardCr);
    assert.ok(retry.reward_cr < clean.reward_cr, `${def.id} attempt haircut`);
    assert.ok(retry.reward_cr >= Math.round(def.rewardCr * 0.7), `${def.id} floor 0.7×`);
  }
});

test('board bounty settles once through missions without stacked ambient bounty/loot', () => {
  const sim = createSimulation({ seed: 0x47b0_b091, systems: [economy, missions, combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  registry.get('economy').newGame();
  state.player.credits = 0;
  state.player.researchPoints = 0;

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const boardMissionId = 'board_writ_balance';
  const boardTarget = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 20, z: 0 },
    hull: 40, hullMax: 40,
    data: {
      bountyCr: 220,
      missionId: boardMissionId,
      missionTag: boardMissionId,
      missionPinned: true,
      loot: { creditsRange: [90, 90], guaranteed: [], drops: [] },
    },
  });

  state.missions.active.push({
    id: boardMissionId,
    title: 'Board Writ',
    type: 'bounty_hunt',
    status: 'active',
    targetEntityIds: [boardTarget.id],
    objectiveProgress: 0,
    objectiveTarget: 1,
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 2,
    factionId: 'faction_scn',
    params: {},
    clauses: [],
  });

  const creditEvents = [];
  bus.on('credits:changed', (payload) => creditEvents.push(structuredClone(payload)));

  registry.get('combat').kill(boardTarget, player.id);
  assert.equal(state.player.credits, 900, 'board mission pays contract reward only');
  assert.equal(state.player.researchPoints, 0, 'bounty does not fabricate combat RP');
  assert.deepEqual(
    creditEvents.map((e) => e.reason),
    [`mission:${boardMissionId}`],
    'no stacked ambient bounty/loot on contract target',
  );
  assert.equal(state.missions.active.length, 0);
  assert.equal(state.missions.completedLog[0]?.success, 1);

  sim.dispose();
});

test('cohort Hunter 30/60/90 clear the healthy band with costs and a mid progression path', () => {
  blockNondeterminism();
  try {
    const band = CAREER_BANDS.hunter;
    assert.equal(band.lo, HUNTER_HEALTHY_CR_PER_MIN);
    // Both the insurance-taxed cohort and denser public-route adapter retain the existing ceiling.
    assert.ok(band.hi <= HUNTER_HEALTHY_UPPER_CR_PER_MIN);
    assert.equal(HUNTER_HEALTHY_UPPER_CR_PER_MIN, 400);

    const cells = [30, 60, 90].map((minutes) => runCareerStrategy('hunter', {
      horizonMin: minutes,
      forceDeathAtLoop: 6,
    }));
    for (const cell of cells) {
      assert.ok(cell.creditsPerMin >= band.lo,
        `${cell.horizonMin}m ${cell.creditsPerMin} < healthy floor ${band.lo}`);
      assert.ok(cell.creditsPerMin <= band.hi,
        `${cell.horizonMin}m ${cell.creditsPerMin} > healthy ceiling ${band.hi}`);
      assert.ok(cell.repairCost > 0, `${cell.horizonMin}m must charge repair`);
      assert.ok(cell.tollCost > 0, `${cell.horizonMin}m must pay travel tolls`);
      assert.ok(cell.failedContracts > 0, `${cell.horizonMin}m must keep failure economics`);
      assert.ok(cell.missionProceeds > 0);
      // Death insurance must not be free recovery.
      if (cell.deaths > 0) assert.ok((cell.insuranceCost || 0) > 0);
    }
    // Independent horizons still progress.
    assert.ok(cells[2].earnedValue > cells[0].earnedValue);
    assert.ok(cells[2].completedContracts > cells[0].completedContracts);

    // Meaningful next-hull/module point inside the M3 envelope: Combat Basics + Wasp capital path.
    const late = cells[2];
    const canAffordTech = (late.endingCapital + (late.researchSpend || 0)) >= 6000
      || (late.researchedNodes || []).includes('tech_combat_basics')
      || (late.researchUnlocks || []).some((u) => u.techId === 'tech_combat_basics');
    const canAffordWaspPath = late.endingCapital >= 15_000
      || late.shipId === 'ship_wasp'
      || (late.equipment && late.equipment.activePhase === 'wasp')
      || (late.firstShipReadyMin != null && late.firstShipReadyMin <= 90);
    assert.ok(canAffordTech, '90m Hunter should unlock or bank Combat Basics capital/RP path');
    assert.ok(canAffordWaspPath
      || late.creditsPerMin >= 120,
    '90m Hunter should approach Wasp capital or hold a strong mid-band rate toward it');

    // Sanity: starter bank still NEW_GAME default in this harness.
    assert.equal(NEW_GAME.credits, 5000);
  } finally {
    restoreNondeterminism();
  }
});
