// Story-seam rows: one opening for three routes, one ending that stays filed,
// new-game-plus knowledge without copied property, and one simTime clock.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { livingHullScars } from '../src/core/livingHull.js';
import {
  buildNewGamePlusCandidate,
  buildNewGamePlusOverlay,
} from '../src/core/newGamePlus.js';
import { STORY_ENTRY_CONTACT } from '../src/data/narrative.js';
import { failEncounter } from '../src/story/campaign47a/index.js';
import { continuationJobPermitted } from '../src/story/endings/continuationAccess.js';
import { evaluateEndingEligibility } from '../src/story/endings/index.js';
import { story as storyProto } from '../src/systems/story.js';

function harness(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 0;
  state.meta.seed = seed;
  state.settings.gameplay.tutorialHints = true;
  state.onboarding = { active: true, finished: false };
  const bus = createBus();
  const comms = [];
  const access = [];
  const heatClears = [];
  const grants = [];
  const archives = [];
  const confirms = [];
  bus.on('comms:popup', (payload) => comms.push(payload));
  bus.on('story:continuationAccess', (payload) => access.push(payload));
  bus.on('heat:clear', (payload) => heatClears.push(payload));
  bus.on('economy:grantCredits', (payload) => grants.push(payload));
  bus.on('endgame:archive', (payload) => archives.push(payload));
  bus.on('endgame:confirmRequired', (payload) => confirms.push(payload));
  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    registry: { get() { return null; } },
    helpers: { voice: { say: () => true } },
  });
  return { state, bus, story, comms, access, heatClears, grants, archives, confirms };
}

function ids(comms, id) {
  return comms.filter((row) => row && row.id === id);
}

function finishTutorial(h) {
  h.state.onboarding = { active: false, finished: true };
  h.bus.emit('tutorial:finished');
}

test('trader, fighter, and salvager reach one Helios opening and a lull does not drop it', () => {
  const trader = harness(4242);
  trader.state.player.stats.lifetimeProfit = 100000;
  trader.bus.emit('game:started', {});
  trader.bus.emit('economy:tradeCompleted', { stationId: 'station_helios', commodityId: 'cmdty_ore', qty: 2, side: 'sell' });
  assert.equal(ids(trader.comms, 'cold_friend').length, 0, 'tutorial holds the opening');
  assert.equal(ids(trader.comms, 'story_vale_profit_100k').length, 0, 'early profit waits');
  assert.equal(trader.state.story.beatIndex, 0);
  finishTutorial(trader);
  assert.equal(ids(trader.comms, 'cold_friend').length, 1);
  assert.equal(ids(trader.comms, 'story_vale_profit_100k').length, 1, 'the earned margin is still eligible');
  assert.equal(trader.state.story.storyEntry.route, 'trade');
  assert.equal(trader.state.story.storyEntry.contactId, STORY_ENTRY_CONTACT.id);
  trader.state.simTime = 20;
  trader.story.update(0, trader.state);
  const traderBerth = ids(trader.comms, 'cold_next_berth');
  assert.equal(traderBerth.length, 1);
  assert.match(traderBerth[0].text, /Helios Station/);
  assert.equal(STORY_ENTRY_CONTACT.stationId, 'station_helios');
  finishTutorial(trader);
  trader.bus.emit('save:loaded');
  trader.story.update(5000, trader.state);
  assert.equal(ids(trader.comms, 'cold_friend').length, 1, 'Continue does not replay the opening');
  assert.equal(trader.state.story.beatIndex, 0, 'the opening is not free story progress');

  const fighter = harness(4243);
  fighter.bus.emit('game:started', {});
  fighter.bus.emit('combat:fire', { ownerId: fighter.state.playerId, targetId: 9 });
  finishTutorial(fighter);
  assert.equal(ids(fighter.comms, 'cold_friend').length, 0, 'a live fight holds the line');
  assert.equal(fighter.state.story.storyEntry.pending, true, 'the fight does not erase eligibility');
  fighter.story.update(1000, fighter.state);
  assert.equal(ids(fighter.comms, 'cold_friend').length, 0, 'a dt jump is not the clock');
  fighter.state.simTime = fighter.state.story.narrativeCalmUntilS;
  fighter.story.update(0, fighter.state);
  assert.equal(ids(fighter.comms, 'cold_friend').length, 1);
  assert.equal(fighter.state.story.storyEntry.route, 'combat');
  fighter.state.simTime += 20;
  fighter.story.update(0, fighter.state);
  assert.equal(ids(fighter.comms, 'cold_next_berth')[0].text, traderBerth[0].text);
  assert.equal(fighter.state.story.beatIndex, 0);

  const salvager = harness(4244);
  salvager.state.claims = { bodies: [{ id: 'wreck_1', name: 'Wreck 1' }] };
  salvager.bus.emit('game:started', {});
  salvager.bus.emit('claim:claimed', { body: { id: 'wreck_1', name: 'Wreck 1' } });
  salvager.bus.emit('salvage:completed', { salvageId: 'wreck_1' });
  assert.equal(ids(salvager.comms, 'cold_friend').length, 0);
  assert.equal(ids(salvager.comms, 'story_vale_claim_charter').length, 0);
  finishTutorial(salvager);
  assert.equal(ids(salvager.comms, 'cold_friend').length, 1);
  assert.match(ids(salvager.comms, 'story_vale_claim_charter')[0].text, /Wreck 1/);
  assert.equal(salvager.state.story.storyEntry.route, 'salvage');
  salvager.state.simTime = 20;
  salvager.story.update(0, salvager.state);
  assert.equal(ids(salvager.comms, 'cold_next_berth')[0].text, traderBerth[0].text);
  assert.equal(salvager.state.story.beatIndex, 0);
});

test('a filed ending changes the dock, the job, and the return without paying twice', () => {
  const h = harness(4701);
  h.state.simTime = 1000;
  h.state.player.credits = 100000;
  h.state.player.heat = 0.4;
  h.state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  h.state.claims = { bodies: [{ id: 'claim_keep', name: 'Keep' }] };
  h.state.factions = {
    faction_scn: { rep: 50 },
    faction_mts: { rep: 0 },
    faction_free: { rep: 0 },
  };
  h.state.careers = { origins: { hunter: { status: 'completed', acceptedAtS: 1 } } };
  h.state.world.currentSectorId = 'sector_ashfall_reach';
  h.state.missions = { active: [], boards: {}, completedLog: [] };
  h.state.story.beatIndex = 7;
  h.state.story.branch = 'patrol';
  h.state.story.flags = {
    deep_reach_operation_complete: true,
    ashfall_visited: true,
    kurtz_desk_opened: true,
    record_expunged: false,
  };
  h.state.story.endgameChoice = null;
  h.state.story.endgameResolved = false;
  h.state.story.endgameOffered = true;
  const elig = evaluateEndingEligibility(h.state, 'A');
  assert.equal(elig.eligible, true, (elig.unmet || []).map((row) => row.text).join('; '));
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(h.state.story.endgameChoice, 'A');
  assert.equal(h.state.story.endgameResolved, true);
  assert.equal(h.state.story.flags.record_expunged, true);
  assert.equal(h.heatClears.length, 1);
  assert.equal(h.grants.length, 0, 'this ending does not pay credits');
  assert.equal(ids(h.comms, 'finale_announced').length, 1);
  assert.match(ids(h.comms, 'finale_announced')[0].text, /CLEAN UNIFORM/);
  assert.match(ids(h.comms, 'finale_announced')[0].text, /not be offered again/);

  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  h.bus.emit('ui:endingArchiveOpen');
  h.bus.emit('ui:endingArchiveOpen');
  assert.equal(h.heatClears.length, 1, 'archive and a second ask do not replay the effect');
  assert.equal(h.confirms.length, 0, 'a filed ending is not a new confirmation');
  assert.equal(h.archives.length, 2);
  assert.equal(h.archives[0].choiceId, 'A');
  assert.equal(h.grants.length, 0);

  const credits = h.state.player.credits;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const station = ids(h.comms, 'ending_station_A_station_helios');
  assert.equal(station.length, 1);
  assert.match(station[0].text, /Auxiliary watch/);
  assert.match(station[0].text, /not offered again/);

  h.bus.emit('mission:completed', { missionId: 'job_patrol_1', type: 'patrol_clear' });
  assert.equal(h.access.at(-1).permitted, true);
  assert.equal(h.state.story.postEnding.progress, 1);
  h.bus.emit('mission:completed', { missionId: 'job_haul_1', type: 'bulk_trade' });
  assert.equal(h.access.at(-1).permitted, false);
  assert.equal(continuationJobPermitted('A', { type: 'bulk_trade' }), false);
  assert.equal(h.state.story.postEnding.progress, 1, 'a closed service does not count');
  h.bus.emit('mission:completed', { missionId: 'job_patrol_1', type: 'patrol_clear' });
  assert.equal(h.state.story.postEnding.progress, 1, 'the same job cannot pay the watch twice');

  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach' });
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach' });
  assert.equal(ids(h.comms, 'ending_return_A').length, 1);
  assert.match(ids(h.comms, 'ending_return_A')[0].text, /expunged/);
  assert.equal(h.state.story.endgameChoice, 'A');
  assert.equal(h.state.story.flags.record_expunged, true);
  assert.equal(h.state.claims.bodies[0].id, 'claim_keep');
  assert.equal(h.state.player.credits, credits);
  assert.equal(h.heatClears.length, 1);
  assert.equal(ids(h.comms, 'finale_announced').length, 1);

  h.bus.emit('save:loaded');
  assert.equal(ids(h.comms, 'finale_announced').length, 1, 'Continue does not announce the filed ending again');
  assert.equal(h.confirms.length, 0);
});

test('new game plus keeps declared knowledge and does not copy property or multiply it', () => {
  const source = {
    player: {
      credits: 3,
      moduleInventory: [{ instanceId: 'spare', defId: 'mod_market_data_s' }],
      ownedShips: [],
    },
    missions: { story: { endgameChoice: 'E', endgameResolved: true, flags: { contract_47b_pending: true } } },
  };
  const before = JSON.stringify(source);
  const candidate = buildNewGamePlusCandidate(source, { slot: 'done' });
  const overlay = buildNewGamePlusOverlay(source, { keepsakeId: 'mod_market_data_s' }, { slot: 'done' });
  assert.equal(JSON.stringify(source), before, 'preview and cancel leave the completed save unchanged');
  assert.ok(candidate);
  assert.equal(overlay.keepsake.defId, 'mod_market_data_s');

  const h = harness(4801);
  h.state.onboarding = { active: false, finished: true };
  h.state.player.credits = 40;
  h.state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], livingHull: null }];
  h.state.claims = { bodies: [{ id: 'claim_keep', name: 'Keep' }] };
  const carried = {
    ...overlay,
    player: { credits: 999999, cargo: { cmdty_stolen_from_old_run: 4 } },
    claims: [{ id: 'claim_old' }],
    entities: { 77: { id: 77 } },
    injected: 'not a field',
    worldFacts: {
      ...(overlay.worldFacts || {}),
      flags: [...((overlay.worldFacts && overlay.worldFacts.flags) || []), 'injected_flag'],
    },
  };
  h.bus.emit('game:started', { newGamePlus: carried });
  const record = h.state.story.newGamePlus;
  assert.equal(record.keepsakeId, 'mod_market_data_s');
  assert.equal(record.sourceEnding, 'E');
  assert.equal(Object.hasOwn(record, 'player'), false);
  assert.equal(Object.hasOwn(record, 'entities'), false);
  assert.equal(Object.hasOwn(record, 'injected'), false);
  assert.equal(h.state.player.credits, 40);
  assert.equal(h.state.player.cargo.items.cmdty_stolen_from_old_run, undefined);
  assert.equal(h.state.claims.bodies[0].id, 'claim_keep');
  assert.equal(h.state.story.flags.injected_flag, undefined);
  const line = ids(h.comms, 'ngplus_consequence')[0];
  assert.ok(line);
  assert.match(line.text, /mod_market_data_s|Market/i);
  assert.match(line.text, /claims/i);
  assert.match(line.text, /not copied/i);
  assert.doesNotMatch(line.text, /keep your cargo|keep your claims/i);
  assert.equal(livingHullScars(h.state.player.ownedShips[0].livingHull).length, overlay.scars.length);

  h.bus.emit('game:started', { newGamePlus: carried });
  assert.equal(h.state.story.newGamePlus.keepsakeId, 'mod_market_data_s');
  assert.equal(livingHullScars(h.state.player.ownedShips[0].livingHull).length, overlay.scars.length);
  assert.equal(h.state.player.credits, 40);

  const invalid = harness(4802);
  invalid.state.player.credits = 40;
  invalid.state.claims = { bodies: [{ id: 'claim_keep' }] };
  invalid.bus.emit('game:started', {
    newGamePlus: { schema: 'spaceface.newGamePlus.v1', sourceEnding: 'E', keepsake: { defId: 'not_a_module' }, player: { credits: 9 } },
  });
  assert.equal(invalid.state.story.newGamePlus, null);
  assert.equal(invalid.state.player.credits, 40);
  assert.equal(invalid.state.claims.bodies[0].id, 'claim_keep');
});

test('story facts, recovery, and the schedule share state.simTime', () => {
  const h = harness(4242);
  h.state.onboarding = { active: false, finished: true };
  h.state.simTime = 100;
  h.bus.emit('game:started', {});
  assert.equal(ids(h.comms, 'cold_friend').length, 1);
  assert.equal(ids(h.comms, 'cold_registry').length, 0);
  const ambientBefore = h.comms.filter((row) => String(row.id).startsWith('amb_')).length;
  const ambientAt = h.state.story.ambientNextAtS;
  h.story.update(10000, h.state);
  assert.equal(ids(h.comms, 'cold_registry').length, 0, 'a long dt does not release a future stamp');
  assert.equal(h.comms.filter((row) => String(row.id).startsWith('amb_')).length, ambientBefore);
  h.state.simTime = 108;
  h.story.update(0, h.state);
  assert.equal(ids(h.comms, 'cold_registry').length, 1);
  h.state.simTime = ambientAt;
  h.story.update(0, h.state);
  assert.equal(h.comms.filter((row) => String(row.id).startsWith('amb_')).length, ambientBefore + 1);

  h.state.simTime = 4242;
  h.bus.emit('story:playerChoiceRecorded', {
    encounterId: 'enc_1', choiceId: 'spare_the_hauler', line: 'Let the hauler go', t: Date.now(),
  });
  h.bus.emit('story:playerChoiceRecorded', {
    encounterId: 'enc_1', choiceId: 'spare_the_hauler', line: 'Let the hauler go',
  });
  const choice = h.state.story.facts.find((row) => row.id === 'choice:enc_1:spare_the_hauler');
  assert.equal(choice.atS, 4242, 'the fact uses the sim clock, not the payload wall time');
  assert.match(h.story.recallFact(choice.id), /spare_the_hauler|Let the hauler go/);
  assert.match(h.story.recallFact(choice.id), /4242|choice:spare_the_hauler/);

  h.bus.emit('career:origin:offered', { careerId: 'hauler' });
  h.bus.emit('career:origin:declined', { careerId: 'hauler' });
  h.bus.emit('career:origins:accepted', { careerId: 'hunter' });
  h.bus.emit('career:ladder:stepDone', { careerId: 'prospector', stepId: 'tow_salvage' });
  const careers = h.state.story.facts.filter((row) => row.kind === 'career');
  assert.equal(careers.length, 3);
  assert.match(careers.find((row) => row.id === 'career:hauler:road').text, /offered and declined/);
  assert.equal(careers.find((row) => row.id === 'career:hauler:road').atS, 4242);

  h.state.story.beatIndex = 5;
  h.state.simTime = 5000;
  failEncounter(h.state, 'chain_failed', 5000);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.comms.filter((row) => row.text === 'Chain interrupted. Re-offer the next proving leg.').length, 0);
  h.state.simTime = 5012;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const recovery = h.state.story.facts.find((row) => row.id === 'story_recovery_5_1');
  assert.ok(recovery);
  assert.equal(recovery.atS, 5012);
  assert.equal(h.comms.filter((row) => row.id === 'story_recovery_5_1').length, 1);
  assert.equal(h.state.story.beatIndex, 5);

  const savedFacts = JSON.parse(JSON.stringify(h.state.story.facts));
  h.bus.emit('story:playerChoiceRecorded', {
    encounterId: 'enc_1', choiceId: 'spare_the_hauler', line: 'Let the hauler go',
  });
  h.bus.emit('career:origin:declined', { careerId: 'hauler' });
  h.bus.emit('career:ladder:stepDone', { careerId: 'prospector', stepId: 'tow_salvage' });
  assert.equal(h.state.story.facts.length, savedFacts.length, 'a repeated event does not duplicate the fact');
});
