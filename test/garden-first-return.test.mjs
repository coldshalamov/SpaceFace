import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { missions } from '../src/systems/missions.js';
import { understoryGardens, spawnGarden } from '../src/systems/faction_understory.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { UNDERSTORY_RECEIVER, receiverPosition, firstPlayerGardenGrowth } from '../src/data/understoryReceiver.js';
import { nestApproach } from '../src/data/nestVisit.js';

function fixture({ cinder = true } = {}) {
  const state = createGameState(47), bus = createBus(), messages = [], credits = [];
  state.run = { kind: 'adventure' }; state.mode = 'flight';
  state.world.currentSectorId = UNDERSTORY_RECEIVER.sectorId;
  state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
  // An already-settled prior contract, not a new payment or synthetic growth receipt.
  state.story.campaign47a.stepProgress = { 2: { completed: cinder ? ['cinder_board'] : [], updatedAtS: 0 } };
  state.onboarding = { active: false, finished: true };
  let next = 100;
  const helpers = { voice: { say: () => true }, spawnEntity(spec) {
    const e = makeEntity({ ...spec, id: next++ }); stampOccupantGeneration(state, e);
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  }, removeEntity(id) { const e = state.entities.get(id); if(e) e.alive = false;
    state.entities.delete(id); state.entityList = state.entityList.filter(e => e.id !== id); } };
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true, team: 1, pos: receiverPosition(),
    mass: 18, radius: 12, hull: 100 }); state.playerId = player.id;
  const owner = Object.create(missions), gardenOwner = Object.create(understoryGardens);
  const registry = { get: id => id === 'missions' ? owner : id === 'understoryGardens' ? gardenOwner : null };
  owner.init({ state, bus, helpers, registry }); gardenOwner.init({ state, bus, helpers, registry });
  bus.on('comms:popup', p => messages.push(structuredClone(p)));
  bus.on('economy:grantCredits', p => credits.push(structuredClone(p)));
  const garden = spawnGarden(state, helpers, { ...receiverPosition(), sectorId: UNDERSTORY_RECEIVER.sectorId,
    biomass: 52, gardenId: UNDERSTORY_RECEIVER.gardenId, authoredReceiver: true });
  const handoffs = () => messages.filter(p => p.id === 'b2_compost_nest_handoff');
  function feed(mass) {
    const prey = helpers.spawnEntity({ type: 'payload', mass, radius: 2, hull: 10,
      pos: { ...garden.pos }, data: { lastThrowerId: player.id } });
    gardenOwner._digest(garden, state.understory.gardens[garden.data.gardenId], prey);
    assert.equal(prey.alive, false); return prey;
  }
  return { state, bus, owner, gardenOwner, garden, player, messages, credits, handoffs, feed };
}

test('real first growth hands the player from the optional paid run to the existing Nest route', () => {
  const h = fixture(); h.feed(4);
  assert.equal(h.handoffs().length, 0, 'partial food is not visible growth');
  h.feed(10);
  assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board', 'compost']);
  assert.equal(h.garden.data.compostFedMass, 14); assert.equal(h.garden.data.compostRunComplete, undefined);
  assert.equal(h.credits.length, 0, 'handoff does not pay the optional run');
  const [line] = h.handoffs(); assert.ok(line); assert.equal(h.handoffs().length, 1);
  assert.equal(line.sender, 'ROOK'); assert.equal(line.persist, true); assert.equal(line.category, 'story');
  assert.match(line.text, /240t run is optional/); assert.match(line.text, /Approach from the east/);
  assert.match(line.text, /fight or withdraw alive/);
  assert.deepEqual(h.owner._storyWaypointForBeat({ beat: 2 }).pos, nestApproach());
});

test('duplicate growth, later feed, saved progress and restore reconciliation do not repeat the handoff', () => {
  const h = fixture(); h.feed(14); const receipt = firstPlayerGardenGrowth(h.state);
  for(let n = 0; n < 3; n++) h.bus.emit('understory:playerGrowth', receipt);
  h.feed(1);
  h.state.story.campaign47a = structuredClone(h.state.story.campaign47a);
  h.owner._reconcileCompostGrowth(); h.gardenOwner._announceStoredGrowth();
  assert.equal(h.handoffs().length, 1); assert.equal(h.credits.length, 0);
});

test('stored real growth reconciles before physical return, with recorded-history rather than present-delivery wording', () => {
  const h = fixture({ cinder: false }); h.feed(14);
  assert.equal(h.handoffs().length, 0, 'out-of-order growth does not speak for a completed Compost step');
  h.state.story.campaign47a.stepProgress['2'].completed.push('cinder_board');
  h.state.world.currentSectorId = 'sector_tethys_junction';
  h.player.pos = { x: 0, z: 0 };
  assert.equal(h.owner._reconcileCompostGrowth(), true);
  assert.equal(h.handoffs().length, 1); assert.match(h.handoffs()[0].text, /growth is on the books/);
  assert.doesNotMatch(h.handoffs()[0].text, /here|just|unlocked|paid you|safe/i);
  assert.equal(h.owner._reconcileCompostGrowth(), false); assert.equal(h.handoffs().length, 1);
});

test('forged receipt and missing physical growth do not manufacture character contact', () => {
  const h = fixture(); h.bus.emit('understory:playerGrowth', { byPlayer: true, stage: 2, gardenId: UNDERSTORY_RECEIVER.gardenId });
  assert.equal(h.handoffs().length, 0); assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board']);
  h.feed(4); assert.equal(h.handoffs().length, 0);
});
