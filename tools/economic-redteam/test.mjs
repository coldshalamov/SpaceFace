// Economic red team proofs.
//   node --test tools/economic-redteam/test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTRABAND_ARTIFACT, FAMILY_IDS, probeFamilies } from './families.mjs';
import { ACTION_IDS, buy, completeFactionMissions, dock, runKillRecipe, saveContinue, sell, service } from './grammar.mjs';
import {
  bayCashVerdict,
  closedWashVerdict,
  replayVerdict,
  stockFloorVerdict,
} from './invariants.mjs';
import { runSearch } from './search.mjs';
import { runStrategies } from './strategies.mjs';
import { HOME_FACTION, bootRedTeam, restoreFeatureMaps } from './runtime.mjs';

test('closed wash, bay launder, stock floor, and replay invariants', () => {
  assert.equal(closedWashVerdict({ creditsDelta: 16, stockDelta: 0, cargoDelta: 0 }).exploit, true);
  assert.equal(closedWashVerdict({ creditsDelta: -40, stockDelta: 0, cargoDelta: 0 }).exploit, false);
  assert.equal(closedWashVerdict({ creditsDelta: 100, stockDelta: 5, cargoDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 33, legality: 'legal', fineDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 193, legality: 'contraband', fineDelta: 0 }).exploit, true);
  assert.equal(bayCashVerdict({ creditsDelta: -400, legality: 'contraband', fineDelta: -400 }).exploit, false);
  assert.equal(stockFloorVerdict(1).exploit, false);
  assert.equal(stockFloorVerdict(0.2).exploit, true);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 0 }).exploit, false);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 5 }).exploit, true);
});

test('action grammar names player verbs and labels the missing ones', () => {
  for (const id of ['buy', 'sell', 'accept_mission', 'loot_drop', 'save_continue', 'fit_module', 'tow', 'source_fit', 'ship_loss']) {
    assert.ok(ACTION_IDS.includes(id), id);
  }
});

test('production runtime reports the repaired loops through real player transactions', { timeout: 180000 }, () => {
  try {
    const families = probeFamilies(1845);
    assert.equal(families.length, 12);
    assert.deepEqual(families.map((family) => family.id), FAMILY_IDS);

    const wash = families.find((family) => family.id === 'zero_spread_trade_cycles');
    assert.equal(wash.status, 'tested-not-broken');
    const allied = wash.traces.find((trace) => trace.name === 'allied_minimized');
    assert.ok(allied.missionCompletions > 0);
    assert.equal(allied.commands.some((command) => String(command).includes('faction:repDelta')), false);
    assert.equal(allied.repFromWriter, allied.repAfter);
    // Sum of mission-receipt repDelta from the missions writer on seed 1846.
    // The old allied wash band was 200. This completion set does not reach it.
    assert.equal(allied.repFromWriter, 33);
    assert.equal(allied.alliedBand, 200);
    assert.ok(allied.repFromWriter < allied.alliedBand);
    assert.equal(allied.creditPath, 'economy.quote -> economy.execute trade:buy/trade:sell');
    assert.equal(allied.reachesCreditPrint, false);
    assert.ok(allied.buyTotal > allied.sellTotal);
    assert.ok(allied.creditsDelta <= 0, `allied wash delta ${allied.creditsDelta}`);
    assert.ok(Math.abs(allied.stockDelta || 0) < 1e-6);
    assert.ok(allied.before && allied.after, 'before/after ledger');
    assert.ok(allied.after.credits <= allied.before.credits);
    assert.ok(Array.isArray(allied.credits) && allied.credits.length > 0);
    assert.ok(allied.credits.some((row) => String(row.reason).startsWith('trade:buy:')));
    assert.ok(allied.credits.some((row) => String(row.reason).startsWith('trade:sell:')));
    const neutral = wash.controls.find((control) => control.name === 'neutral_standing_is_not_a_wash');
    assert.equal(neutral.pass, true);
    assert.ok(neutral.creditsDelta <= 0);
    const earned = wash.controls.find((control) => control.name === 'standing_came_from_mission_completion');
    assert.equal(earned.pass, true);

    const bay = families.find((family) => family.id === 'contraband_relabel');
    assert.equal(bay.status, 'tested-not-broken', bay.summary);
    const stolen = bay.traces.find((trace) => trace.name === 'bay_stolen_goods');
    assert.ok(stolen.recipeId);
    assert.equal(stolen.commands.some((command) => String(command).includes('cmdty_stolen_goods')), false);
    assert.equal(stolen.bay.cmdty_scrap_metal, 52);
    assert.equal(stolen.bay.cmdty_salvage_electronics, 14);
    assert.equal(stolen.bay.cmdty_alloys, 13);
    assert.equal(stolen.bay.cmdty_comp_hullplate, 1);
    assert.equal(stolen.bay.cmdty_munitions, 9);
    assert.equal(stolen.unpaid.cmdty_munitions, 9);
    assert.ok(stolen.restricted.includes('cmdty_munitions'));
    assert.equal(stolen.bayAfterDock.cmdty_munitions, 9);
    assert.equal(stolen.bayAfterSecondDock.cmdty_munitions, 9);
    assert.equal(stolen.legalCashIn.lots.some((lot) => lot.commodityId === 'cmdty_munitions'), false);
    assert.equal(stolen.legalCashIn.credits, stolen.creditsDelta);
    assert.ok(stolen.commands.length >= 4);
    assert.equal(stolen.secondDockDelta, 0);
    assert.equal(stolen.reachesIllicitPay, false);
    assert.ok(stolen.creditsDelta > 0);
    const artifact = JSON.parse(readFileSync(CONTRABAND_ARTIFACT, 'utf8'));
    assert.deepEqual(artifact.commands, stolen.commands);
    assert.equal(artifact.qty, stolen.qty);
    assert.equal(artifact.ticks, stolen.ticks);
    for (const control of bay.controls) assert.equal(control.pass, true, `${control.name} ${JSON.stringify(control)}`);

    const underflow = families.find((family) => family.id === 'station_stock_underflow');
    assert.equal(underflow.status, 'clean');
    assert.ok(underflow.traces[0].stockAfter >= 1);

    const fit = families.find((family) => family.id === 'ship_fit_capacity');
    assert.equal(fit.status, 'unavailable');
    assert.equal(fit.traces[0].unavailableVerbs.tow, 'no_player_tow_verb');
    assert.equal(fit.traces[0].unavailableVerbs.source_fit, 'no_player_source_fit_verb');
    assert.equal(fit.traces[0].unavailableVerbs.ship_loss, 'no_player_ship_loss_verb');

    const seal = families.find((family) => family.id === 'sealed_refinery_inputs');
    assert.ok(seal.status === 'clean' || seal.status === 'unavailable');
    const delivery = families.find((family) => family.id === 'delivery_and_resale');
    assert.ok(delivery.status === 'clean' || delivery.status === 'unavailable');
  } finally {
    restoreFeatureMaps();
  }
});

test('a real mission completion and a real kill recipe are not confirmed exploits', { timeout: 120000 }, () => {
  try {
    const killed = runKillRecipe(501);
    assert.equal(killed.ok, true, killed.reason);
    assert.ok(killed.recipeId);
    assert.ok(killed.unpaid.cmdty_munitions > 0);
    assert.ok(killed.restricted.includes('cmdty_munitions'));
    const cashed = dock(killed.sim, 'station_helios');
    const reasons = (cashed.detail && cashed.detail.reasons) || [];
    assert.equal(reasons.includes('salvage:bay_sale'), true);
    const held = Math.floor(Number(killed.sim.state.player.salvageBay.items.cmdty_munitions) || 0);
    assert.equal(held, killed.unpaid.cmdty_munitions);
    const continued = saveContinue(killed.sim, 'ert-patch-bay');
    assert.equal(continued.result.ok, true, continued.result.reason);
    const again = dock(continued.sim, 'station_helios');
    assert.equal(again.creditsDelta, 0);
    const heldAgain = Math.floor(Number(continued.sim.state.player.salvageBay.items.cmdty_munitions) || 0);
    assert.equal(heldAgain, killed.unpaid.cmdty_munitions);

    const washSim = bootRedTeam(502);
    const earned = completeFactionMissions(washSim, HOME_FACTION);
    assert.ok(earned.completed > 0);
    assert.equal(earned.repFromWriter, earned.repAfter);
    assert.equal(earned.alliedBand, 200);
    assert.ok(earned.repFromWriter < earned.alliedBand);
    service(washSim, 'loan');
    const before = washSim.state.player.credits;
    const bought = buy(washSim, 'cmdty_ore_iron', 5);
    assert.equal(bought.ok, true, bought.reason);
    const ironHeld = washSim.state.player.cargo.items.cmdty_ore_iron;
    const sold = sell(washSim, 'cmdty_ore_iron', ironHeld);
    assert.equal(sold.ok, true, sold.reason);
    assert.ok(washSim.state.player.credits - before <= 0, `mission standing wash ${washSim.state.player.credits - before}`);
    const saved = saveContinue(washSim, 'ert-patch-wash');
    assert.equal(saved.result.ok, true, saved.result.reason);
    assert.equal(saved.result.detail.after.credits, washSim.state.player.credits);
  } finally {
    restoreFeatureMaps();
  }
});

test('search resumes, mutates recorded commands, and runs held-out seeds', { timeout: 180000 }, () => {
  try {
    const receiptPath = fileURLToPath(new URL('../../.devshots/economic-redteam/search-resume.json', import.meta.url));
    const partial = runSearch({
      seed: 11,
      sequences: 4,
      receiptPath,
      timeBudgetMs: 1,
      skipHeldOut: true,
    });
    assert.equal(partial.resumable, true);
    assert.ok(partial.sequencesCompleted > 0 && partial.sequencesCompleted < 4);
    assert.equal(partial.reset, 'reboot');
    assert.equal(partial.walletWrites, 0);
    const finished = runSearch({
      seed: 11,
      sequences: 4,
      receiptPath,
      timeBudgetMs: 120000,
      skipHeldOut: true,
    });
    assert.equal(finished.sequencesCompleted, 4);
    assert.equal(finished.traces.length, 4);
    assert.equal(finished.resumable, false);
  } finally {
    restoreFeatureMaps();
  }
});

test('search runs at least 500 varied traces', { timeout: 180000 }, () => {
  try {
    const search = runSearch({
      seed: 77061,
      sequences: 500,
      receiptPath: fileURLToPath(new URL('../../.devshots/economic-redteam/search-receipt.json', import.meta.url)),
    });
    assert.equal(search.sequencesCompleted, 500);
    assert.equal(search.traces.length, 500);
    const exploits = search.traces.filter(row => row.classification.startsWith('exploit_'));
    if (exploits.length) assert.ok(search.mutationCount > 0, 'an observed exploit must be minimized');
    else assert.equal(search.mutationCount, 0, 'repaired production loops produce no fabricated shrink');
    assert.ok(search.heldOutRuns.length > 0);
    assert.ok(search.commandCoverage.raise_standing > 0);
    assert.ok(search.commandCoverage.loot_stolen > 0);
    for (const id of FAMILY_IDS) assert.ok(search.coverage[id] > 0, id);
  } finally {
    restoreFeatureMaps();
  }
});

test('four honest strategies compare earnings and only flag a feedback loop', { timeout: 120000 }, () => {
  try {
    const strategies = runStrategies(4242);
    assert.deepEqual(strategies.rows.map((row) => row.id), [
      'legal_trader',
      'miner_refiner',
      'pirate_salvager',
      'careful_smuggler',
    ]);
    assert.equal(strategies.degenerate.includes('pirate_salvager'), false);
    assert.equal(strategies.rows.find((row) => row.id === 'legal_trader').degenerate, false);
    assert.equal(strategies.rows.find((row) => row.id === 'careful_smuggler').degenerate, false);
    assert.equal(strategies.rows.find((row) => row.id === 'miner_refiner').degenerate, false);
  } finally {
    restoreFeatureMaps();
  }
});
