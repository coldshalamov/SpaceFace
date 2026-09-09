#!/usr/bin/env node
// BP-13/B16 Bounty Hunter Neutrality contract.
//
// Hunters are hostile to the player only when the player is the contract target. Otherwise they
// pursue an NPC quarry and the player can interfere to change the recorded outcome.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  bountyHunt,
  bountyHunterOutcomeForContract,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../src/systems/bountyHunt.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.notEqual(BOUNTY_HUNTER_NEUTRAL_CONTEXT, 'bounty_hunter',
  'neutral hunters must not use the scanner force-hostile context');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in bounty hunter path'); };
  Date.now = () => { throw new Error('Date.now in bounty hunter path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testNeutralHunterPursuesNpc);
guarded(testPlayerTargetFlipsHostile);
guarded(testInterferenceRecordsOutcome);

console.log(`[check-bounty-hunter-neutrality] PASS - ${sections} sections green`);

function boot(seed = 1616) {
  const sim = createSimulation({ seed, systems: [bountyHunt] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  state.world.sectors[state.world.currentSectorId] = {
    ...(state.world.sectors[state.world.currentSectorId] || {}),
    security: 0.9,
    tier: 1,
  };
  const log = { outcomes: [] };
  bus.on('bountyHunt:outcome', (p) => log.outcomes.push(p));
  return { sim, state, bus, log, sys: sim.registry.get('bountyHunt') };
}

function setupContract(t, contractId = 'contract-neutral') {
  const quarry = t.sim.spawn(makeBountyQuarrySpec({
    contractId,
    pos: { x: 250, z: 0 },
  }));
  const hunter = t.sim.spawn(makeBountyHunterSpec({
    contractId,
    contractTargetId: quarry.id,
    pos: { x: -250, z: 0 },
  }));
  t.sys.update(0.1, t.state);
  return { hunter, quarry };
}

function testNeutralHunterPursuesNpc() {
  const t = boot();
  const { hunter, quarry } = setupContract(t);
  assert.equal(isHostileToPlayer(hunter, 0, t.state), false, 'hunter with NPC target is scanner-neutral to player');
  assert.equal(hunter.data.ai.spawnContext, BOUNTY_HUNTER_NEUTRAL_CONTEXT, 'neutral hunter uses neutral context');
  assert.equal(hunter.data.ai.forcePlayerTarget, false, 'neutral hunter does not force player target');
  assert.equal(hunter.data.bountyHunt.targetId, quarry.id, 'hunter records NPC quarry target');
  assert.equal(hunter.data.bountyHunt.pursuing, true, 'hunter is actively pursuing quarry');
  ok('bounty hunter with NPC quarry stays neutral to player and pursues the quarry');
}

function testPlayerTargetFlipsHostile() {
  const t = boot(1617);
  const { hunter } = setupContract(t, 'contract-player');
  hunter.data.contractTargetId = t.state.playerId;
  t.sys.update(0.1, t.state);
  assert.equal(isHostileToPlayer(hunter, 0, t.state), true, 'hunter flips hostile when player is target');
  assert.equal(hunter.data.ai.forcePlayerTarget, true, 'player-target hunter explicitly targets player');
  assert.ok(hunter.data.ai.hostileTeams.includes(0), 'player-target hunter marks player team hostile');
  ok('setting contractTargetId to player flips scanner hostility');
}

function testInterferenceRecordsOutcome() {
  const help = boot(1618);
  const helped = setupContract(help, 'contract-helped');
  help.bus.emit('entity:killed', { id: helped.quarry.id, killerId: help.state.playerId, type: 'ship', pos: helped.quarry.pos });
  const helpedOutcome = bountyHunterOutcomeForContract(help.state, 'contract-helped');
  assert.equal(helpedOutcome.outcome, 'player_helped_hunter', 'killing quarry records player helped hunter');

  const defend = boot(1618);
  const defended = setupContract(defend, 'contract-defended');
  defend.bus.emit('entity:killed', { id: defended.hunter.id, killerId: defend.state.playerId, type: 'ship', pos: defended.hunter.pos });
  const defendedOutcome = bountyHunterOutcomeForContract(defend.state, 'contract-defended');
  assert.equal(defendedOutcome.outcome, 'player_defended_quarry', 'killing hunter records player defended quarry');
  assert.equal(help.log.outcomes.length, 1, 'help outcome emits once');
  assert.equal(defend.log.outcomes.length, 1, 'defend outcome emits once');
  ok('player interference changes bounty outcome deterministically');
}
