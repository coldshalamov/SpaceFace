import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { recordNestOutcome } from '../src/systems/nestVisit.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { NEST_VISIT, nestPosition } from '../src/data/nestVisit.js';

function fixture({ compost = true } = {}) {
  const state = createGameState(47), bus = createBus(), messages = [], credits = [];
  state.run = { kind: 'adventure' }; state.mode = 'flight';
  state.world.currentSectorId = NEST_VISIT.sectorId;
  state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
  state.story.campaign47a.stepProgress = { 2: { completed: ['cinder_board', ...(compost ? ['compost'] : [])], updatedAtS: 0 } };
  state.onboarding = { active: false, finished: true };
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  bus.on('comms:popup', p => messages.push(structuredClone(p)));
  bus.on('economy:grantCredits', p => credits.push(structuredClone(p)));
  const live = { id: NEST_VISIT.encounterId, shapeId: 'the_nest', sectorId: NEST_VISIT.sectorId,
    anchor: nestPosition(), data: { nest: { contactEstablished: true, terminalOutcome: null } } };
  state.encounterDirector = { live: { [live.id]: live } };
  const director = { state, now: () => 12 };
  function record(outcome) {
    live.data.nest.terminalOutcome = outcome;
    return recordNestOutcome(director, live, outcome);
  }
  function emit(outcome) {
    bus.emit('encounter:resolved', { encounterId: live.id, shape: 'the_nest', outcome, sectorId: live.sectorId, t: 12 });
  }
  return { state, bus, owner, live, director, credits, record, emit,
    handoffs: () => messages.filter(p => p.id === 'b2_nest_registry_handoff') };
}

for (const [outcome, text] of Object.entries({
  carrier_down: /carrier went down/,
  carrier_gutted: /launch couplings were breached/,
  nest_emptied: /launched its last Wasp; both blast baffles were torn/,
  carrier_escapes: /surviving carrier remains a Reach threat/,
})) test(`accepted encounter-owner ${outcome} gives the truthful Registry handoff`, () => {
  const h = fixture(); assert.equal(h.record(outcome), true); h.emit(outcome);
  assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board', 'compost', 'nest']);
  assert.equal(h.handoffs().length, 1); const [line] = h.handoffs();
  assert.match(line.text, text); assert.match(line.text, /Tethys has the Registry Writ/);
  assert.match(line.text, /scan the named ship before choosing force or custody/);
  assert.equal(line.sender, 'ROOK'); assert.equal(line.persist, true);
  assert.equal(h.credits.length, 0); assert.equal(h.state.story.beatIndex, 2);
  assert.equal(h.owner._storyWaypointForBeat({ beat: 2 }).label, 'Tethys board — Registry Writ');
  if (outcome === 'carrier_escapes') assert.doesNotMatch(line.text, /won|victory|destroyed|cleared|you withdrew/i);
  if (outcome === 'nest_emptied') assert.doesNotMatch(line.text, /destroyed|killed|all dead/i);
});

test('duplicates, restored progress and later reconciliation retain one contact', () => {
  const h = fixture(); h.record('carrier_down'); h.emit('carrier_down');
  h.emit('carrier_down'); h.state.story.campaign47a = structuredClone(h.state.story.campaign47a);
  h.state.encounterDirector.nestVisit = structuredClone(h.state.encounterDirector.nestVisit);
  assert.equal(h.owner._reconcileNestOutcome(), false);
  assert.equal(h.handoffs().length, 1); assert.equal(h.credits.length, 0);
});

test('retained terminal outcome can be reconciled later without claiming a fresh local victory', () => {
  const h = fixture({ compost: false }); h.record('carrier_escapes'); h.emit('carrier_escapes');
  assert.equal(h.handoffs().length, 0);
  h.state.story.campaign47a.stepProgress['2'].completed.push('compost');
  h.state.world.currentSectorId = 'sector_tethys_junction';
  assert.equal(h.owner._reconcileNestOutcome(), true);
  assert.equal(h.handoffs().length, 1); assert.match(h.handoffs()[0].text, /Contact broke/);
  assert.doesNotMatch(h.handoffs()[0].text, /just|here|safe|paid/i);
});

test('raw, mismatched and unqualified terminal signals cannot fabricate contact', () => {
  const h = fixture(); h.emit('carrier_down'); assert.equal(h.handoffs().length, 0);
  h.live.data.nest.contactEstablished = false;
  assert.equal(h.record('carrier_down'), false); h.emit('carrier_down');
  assert.equal(h.handoffs().length, 0);
  h.live.data.nest.contactEstablished = true; assert.equal(h.record('carrier_escapes'), true);
  h.emit('carrier_down'); assert.equal(h.handoffs().length, 0);
  h.emit('carrier_escapes'); assert.equal(h.handoffs().length, 1);
});
