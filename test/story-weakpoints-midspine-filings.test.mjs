/**
 * Mid-spine paperwork: B4 admin field, B5 Vale Holdings salvage, B6 remittance.
 * Run: node --test test/story-weakpoints-midspine-filings.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';

function harness(seed = 88) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 50;
  state.playerId = 1;
  state.player.credits = 50_000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0 });
  state.entityList = [...state.entities.values()];
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 40 };
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 40 };
  state.factions.faction_free = { ...(state.factions.faction_free || {}), rep: 40 };

  const bus = createBus();
  const events = { comms: [], remittance: [] };
  bus.on('comms:popup', (p) => events.comms.push(p));

  let nextId = 200;
  const helpers = {
    hash32,
    mulberry32,
    voice: { say: () => true },
    player: () => state.entities.get(1),
    spawnEntity: (spec) => {
      const entity = {
        ...spec,
        id: nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: spec.vel || { x: 0, z: 0 },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  const story = Object.assign({}, storyProto);
  const registry = {
    get(name) {
      if (name === 'missions') return missions;
      if (name === 'story') return story;
      return null;
    },
  };
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  return { state, bus, missions, story, helpers, events };
}

test('B4 branch intro offer carries V. DIRECTOR admin field / REF 44-C', () => {
  const h = harness(90);
  h.state.story.beatIndex = 4;
  h.state.story.branch = null;
  h.state.story.flags = { elroy_outcome: 'force' };
  // Meridian/Tethys stake for force outcome traders
  const board = h.missions.ensureBoard('station_tethys');
  const intro = (board.slots || []).find((row) => row && row.storyTag === STORY_BRANCH_INTRO_TAG);
  assert.ok(intro, 'branch intro posted on stake station');
  assert.match(String(intro.adminField || ''), /V\.\s*DIRECTOR|REF 44-C/i);
  assert.match(String(intro.authorization || intro.adminField || ''), /REF 44-C/i);
});

test('B5 proving-chain hostiles stamp VALE HOLDINGS LLC salvage fields', async () => {
  const h = harness(91);
  h.state.story.beatIndex = 5;
  h.state.story.branch = 'patrol';
  h.state.story.chainProgress = 0;
  h.state.story.flags = { elroy_outcome: 'custody', pick_a_side_stake: 'evidence_patrol' };
  h.state.world.currentSectorId = 'sector_charon_expanse';

  // Real embodied path: buildMissionBoardContract attaches named-captain storyTarget for patrol.
  const { buildMissionBoardContract } = await import('../src/story/campaign47a/embodiedMissions.js');
  const offer = buildMissionBoardContract(5, {
    seed: 91,
    epoch: 1,
    branch: 'patrol',
    chainStep: 0,
  });
  assert.ok(offer, 'embodied B5 patrol offer exists');
  assert.match(String(offer.storyTag || ''), /^campaign47a:b5:patrol:/);
  assert.ok(offer.storyTarget, 'shipped patrol offer includes named-captain storyTarget');
  assert.equal(offer.storyTarget.lastRegisteredOwner, 'VALE HOLDINGS LLC');
  assert.match(String(offer.storyTarget.salvageCargo || ''), /ADMINISTRATIVE RECORDS/i);

  const m = h.missions._instanceFromOffer(offer);
  assert.ok(m.storyTarget, 'mission instance keeps storyTarget');
  h.state.missions.active = [m];
  h.state.world.currentSectorId = m.destSectorId || 'sector_charon_expanse';
  h.missions._spawnTargetsFor(m);
  assert.ok((m.targetEntityIds || []).length >= 1, 'spawned at least one target');
  const target = h.state.entities.get(m.targetEntityIds[0]);
  assert.ok(target && target.data);
  assert.equal(target.data.lastRegisteredOwner, 'VALE HOLDINGS LLC');
  assert.match(String(target.data.salvageCargo || ''), /ADMINISTRATIVE RECORDS/i);
  // Captain identity still present (not overwritten into anonymous VALE registry).
  assert.ok(target.data.storyTargetId || target.data.name);
});

test('first automation remittance notes VALE HOLDINGS LLC in story secondary log', () => {
  const h = harness(92);
  h.state.story.beatIndex = 6;
  h.state.story.flags = {};
  h.bus.emit('asset:deployed', { kind: 'drone', id: 'd1', defId: 'drone_mk1' });
  assert.equal(h.state.story.flags.vale_remittance_armed, true);
  h.bus.emit('economy:grantCredits', { amount: 12, reason: 'automation:passive' });
  assert.equal(h.state.story.flags.vale_remittance_noted, true);
  assert.ok(Array.isArray(h.state.story.transactionLog));
  assert.ok(h.state.story.transactionLog.some((row) => /VALE HOLDINGS LLC/i.test(row.note)));
  assert.ok(h.events.comms.some((c) => /VALE HOLDINGS LLC/i.test(c.text)));
  // Second remittance does not re-note
  h.bus.emit('economy:grantCredits', { amount: 5, reason: 'automation:passive' });
  assert.equal(h.state.story.transactionLog.filter((row) => /VALE HOLDINGS/i.test(row.note)).length, 1);
});
