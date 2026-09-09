/**
 * Story weak-point fix: B0 mass paperwork + 3.1kg fragment + B2 Elroy residue.
 * Run: node --test test/story-weakpoints-b0-b2-spine.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CONTRACT_47A_B0_BODY,
  THREAD_B_FRAGMENT_ID,
  GRAFFITI,
  ENDING_AIRLOCK_GRAFFITI,
  HELIOS_BAY7,
} from '../src/data/narrative.js';
import {
  CONTRACT_47A_B0_TAG,
  CONTRACT_47A_SAMPLE_ID,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { isUnsellableCargo, removeCargo } from '../src/systems/cargo.js';

function harness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const asteroid = { id: 2, type: 'asteroid', alive: true, pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: -420, z: 100 }, data: { stationId: 'station_helios', name: 'Helios Station' } };
  state.entities.set(2, asteroid);
  state.entities.set(3, station);
  state.entityList.push(asteroid, station);
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const events = { hudPhase: [], tagFlicker: [], graffiti: [], comms: [], toasts: [] };
  bus.on('hud:phase', (p) => events.hudPhase.push(p));
  bus.on('hud:tagFlicker', (p) => events.tagFlicker.push(p));
  bus.on('graffiti:show', (p) => events.graffiti.push(p));
  bus.on('comms:popup', (p) => events.comms.push(p));
  bus.on('toast', (p) => events.toasts.push(p));

  const helpers = {
    voice: { say: () => true },
    mulberry32: (value) => {
      let a = value >>> 0;
      return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296);
    },
  };
  const registry = { get: () => null };
  const missions = Object.assign({}, missionsProto);
  const story = Object.assign({}, storyProto);
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  bus.emit('game:started', {});
  return { state, bus, missions, story, asteroid, station, events };
}

test('B0 contract body exposes 12.4t mass and VALE / REF 44-C authorization', () => {
  const h = harness();
  const mission = h.state.missions.active.find((m) => m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(mission);
  assert.match(mission.title, /47-A/);
  assert.match(String(mission.summary || ''), /12\.4t/);
  assert.match(String(mission.summary || ''), /REF 44-C|VALE/);
  assert.equal(mission.params.massAcceptT, 12.4);
  assert.equal(mission.params.authorization, CONTRACT_47A_B0_BODY.authorization);
  assert.match(String(mission.description || ''), /VALE-ALA-47A|12\.4t|REF 44-C/);
});

test('New Game injects Thread-B 3.1kg fragment as unsellable personal effects', () => {
  const h = harness(49);
  assert.equal(h.state.player.cargo.items[THREAD_B_FRAGMENT_ID], 1);
  assert.ok(h.state.story.persistentCargo.includes(THREAD_B_FRAGMENT_ID));
  assert.equal(isUnsellableCargo(h.state, THREAD_B_FRAGMENT_ID), true);
  assert.equal(removeCargo(h.state, THREAD_B_FRAGMENT_ID, 1), 0);
});

test('B0 delivery: payment withheld, STABLE LOAD, THEY KNEW THE MASS', () => {
  const h = harness(50);
  const mission = h.state.missions.active.find((m) => m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(mission);

  h.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos },
  });
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], 1);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  assert.equal(h.state.story.flags.contract_47a_payment_withheld, true);
  assert.equal(h.state.story.flags.contract_47a_pending, true);
  assert.ok(h.events.toasts.some((t) => /PAYMENT WITHHELD/i.test(t.text)));
  assert.ok(h.events.comms.some((c) => /PAYMENT WITHHELD|STATUS: PENDING/i.test(c.text)));
  assert.ok(
    h.events.hudPhase.some((p) => p.lie === 'stable_load'),
    'STABLE LOAD hud lie fires on B0 completion',
  );
  assert.ok(
    h.events.graffiti.some((g) => g.line === GRAFFITI.THEY_KNEW_THE_MASS),
    'THEY KNEW THE MASS airlock graffiti',
  );
  // Fragment remains after assay delivery
  assert.equal(h.state.player.cargo.items[THREAD_B_FRAGMENT_ID], 1);
});

test('B2 Elroy resolve: civilian flicker + medicine graffiti + sealed REF log', () => {
  const h = harness(51);
  // Jump to B2 with an active Elroy mission
  h.state.story.beatIndex = 2;
  h.state.story.flags = h.state.story.flags || {};
  const offer = {
    id: 'contract_47a_b2_elroy',
    type: 'bounty_hunt',
    stationId: 'station_tethys',
    factionId: 'faction_scn',
    params: { clearCount: 1, investigationStage: 'identified' },
    reward_cr: 800,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: 'station_expanse',
    destSectorId: 'sector_charon_expanse',
    distance: 800,
    storyTag: 'campaign47a:b2:elroy',
    campaign47aBeat: 2,
    title: '47-A Investigation',
    storyTarget: {
      id: 'npc_elroy', name: 'Elroy', label: 'UNKNOWN',
      archetype: 'reaver_pirate', factionId: 'faction_free',
      zoneId: 'zone_charon_ambush', registry: 'CIVILIAN VESSEL — REGISTERED',
    },
  };
  const m = h.missions._instanceFromOffer(offer);
  m.targetEntityIds = [99];
  h.state.missions.active = [m];
  h.state.entities.set(99, {
    id: 99, type: 'ship', alive: true, team: 1,
    pos: { x: 10, z: 10 }, data: { storyTargetId: 'npc_elroy' },
  });

  h.missions._resolveContract47aB2(m, 0, 'force', 99);
  assert.ok(h.events.tagFlicker.some((t) => /CIVILIAN/i.test(t.tag)));
  assert.ok(h.events.graffiti.some((g) => g.line === GRAFFITI.THEY_WERE_CARRYING_MEDICINE));
  assert.ok(h.events.comms.some((c) => /REF 44-C/i.test(c.text) && /SEALED/i.test(c.text)));
  assert.equal(h.state.story.flags.elroy_outcome, 'force');
});

test('ending airlock graffiti table covers A–E', () => {
  assert.equal(ENDING_AIRLOCK_GRAFFITI.A, GRAFFITI.CLEAN_UNIFORM_AIRLOCK);
  assert.equal(ENDING_AIRLOCK_GRAFFITI.E, GRAFFITI.NEXT_RUN_HOME);
  assert.equal(ENDING_AIRLOCK_GRAFFITI.C, GRAFFITI.THEY_KNEW_THE_MASS);
  assert.match(HELIOS_BAY7.scanLine, /Y3-C2/);
  assert.equal(HELIOS_BAY7.massT, 12.4);
});
