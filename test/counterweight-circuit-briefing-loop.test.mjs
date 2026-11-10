import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERWEIGHT_EVENTS, COUNTERWEIGHT_EVENT_BY_ID, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { createAttemptState } from '../src/features/counterweightCircuit/attempt.js';
import { eventPreviewSpec, resultOfferSpec, attemptProgressSpec } from '../src/features/counterweightCircuit/readModel.js';
import { freshCounterweightCircuitState, normalizeCounterweightCircuitState } from '../src/features/counterweightCircuit/persistence.js';
import { projectCounterweightHandling } from '../src/features/counterweightCircuit/handlingReadout.js';
import { createCounterweightCircuitPromptSystem } from '../src/features/counterweightCircuit/prompts.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { createBus } from '../src/core/eventBus.js';

function bareState() {
  return { mode: 'flight', simTime: 10, playerId: 99,
    entities: new Map([[99, { id: 99, pos: { x: 0, z: 0 } }]]),
    world: { currentSectorId: VENUE_SECTOR_ID, counterweightCircuit: freshCounterweightCircuitState() } };
}

test('each authored preview shows its real thresholds and locked prerequisites', () => {
  const state = bareState();
  for (const def of COUNTERWEIGHT_EVENTS) {
    const offer = eventPreviewSpec(state, def.id);
    assert.ok(offer.detail.includes(def.briefing.question));
    for (const [medal, seconds] of Object.entries(def.medals)) {
      assert.match(offer.detail, new RegExp(`${medal[0].toUpperCase()}${medal.slice(1)} ${seconds}s`));
    }
    assert.match(offer.detail, /Practice: no payout; completions and records count/);
    if (def.requires?.length) {
      assert.equal(offer.statusFlag, 'locked');
      for (const required of def.requires) assert.ok(offer.detail.includes(COUNTERWEIGHT_EVENT_BY_ID[required].title));
      assert.ok(!offer.choices.some(choice => choice.id.startsWith('attempt:')));
    } else assert.equal(offer.statusFlag, 'ready');
  }
  assert.match(eventPreviewSpec(state, 'soft_berth').detail, /open mouth.*whole load.*support.*4 u\/s/);
  assert.match(eventPreviewSpec(state, 'split_decision').detail, /95%.*80%/);
});

test('result compares only real completed receipts and describes actual limitations', () => {
  const result = { eventId: 'soft_berth', outcome: 'complete', timeS: 55, medal: 'silver', reason: 'time' };
  assert.match(resultOfferSpec({ ...result, previousBestTimeS: null }).detail, /First recorded finish/);
  assert.match(resultOfferSpec({ ...result, previousBestTimeS: 60 }).detail, /5\.0s faster/);
  assert.match(resultOfferSpec({ ...result, previousBestTimeS: 50 }).detail, /5\.0s behind/);
  assert.match(resultOfferSpec({ ...result, previousBestTimeS: 55.01 }).detail, /New personal best/);
  assert.doesNotMatch(resultOfferSpec(result).detail, /first recorded|previous best|faster|behind/i);
  assert.doesNotMatch(resultOfferSpec({ ...result, previousBestTimeS: Infinity }).detail, /previous best/);
  const capped = resultOfferSpec({ ...result, eventId: 'fragile_freight', reason: 'pod_damage', reasonDetail: .7 });
  assert.match(capped.detail, /^70% condition · medal limited to Silver/);
  assert.doesNotMatch(capped.detail, /Next:/);
  const cancel = resultOfferSpec({ ...result, outcome: 'cancelled', reason: 'admission_unconfirmed', previousBestTimeS: 80 });
  assert.match(cancel.detail, /preparation did not complete.*No run result was earned/i);
  assert.doesNotMatch(cancel.detail, /faster|behind|first recorded/i);
  assert.match(resultOfferSpec({ ...result, outcome: 'failed', reason: 'load_destroyed' }).detail, /Load destroyed/);
  assert.match(resultOfferSpec({ ...result, outcome: 'failed', reason: 'unexpected_reason' }).detail, /unexpected_reason/);
  assert.ok(resultOfferSpec(result, { canReview: true }).choices.some(c => c.id === 'preview:soft_berth'));
  assert.ok(!resultOfferSpec(result, { canReview: false }).choices.some(c => c.id.startsWith('preview:')));
});

test('existing prompt adapter routes the review choice and rejects stale cards', () => {
  const bus = createBus(), received = [];
  const prompt = createCounterweightCircuitPromptSystem();
  let card;
  setPromptDeck({ offerDecision(spec) { card = spec; return true; },
    hasDecision() { return false; }, resolveDecision() {} });
  bus.on('counterweightCircuit:action', value => received.push(value));
  try {
    prompt.init({ bus });
    const offer = { ...resultOfferSpec({ eventId: 'soft_berth', outcome: 'failed', reason: 'load_destroyed' }, { canReview: true }), generation: 7 };
    bus.emit('counterweightCircuit:offer', offer);
    assert.equal(card.onChoose('preview:soft_berth'), true);
    assert.deepEqual(received, [{ action: 'preview', eventId: 'soft_berth', offerId: offer.id, generation: 7 }]);
    const stale = card;
    bus.emit('counterweightCircuit:offer', { ...offer, generation: 8 });
    assert.equal(stale.onChoose('preview:soft_berth'), false);
    assert.equal(received.length, 1);
  } finally { prompt.destroy(); setPromptDeck(null); }
});

test('saved result comparison validates bounds and keeps legacy absence distinct', () => {
  const r = freshCounterweightCircuitState();
  r.lastResult = { outcome: 'complete', previousBestTimeS: 75.5 };
  r.records.soft_berth = { completions: 1, lastResult: { ...r.lastResult } };
  let restored = normalizeCounterweightCircuitState(JSON.parse(JSON.stringify(r)));
  assert.equal(restored.lastResult.previousBestTimeS, 75.5);
  assert.equal(restored.records.soft_berth.lastResult.previousBestTimeS, 75.5);
  for (const bad of [-1, Infinity, Number.MAX_SAFE_INTEGER + 1, '42']) {
    r.lastResult.previousBestTimeS = bad; r.records.soft_berth.lastResult.previousBestTimeS = bad;
    restored = normalizeCounterweightCircuitState(r);
    assert.equal('previousBestTimeS' in restored.lastResult, false);
    assert.equal('previousBestTimeS' in restored.records.soft_berth.lastResult, false);
  }
  r.lastResult = { outcome: 'complete' };
  assert.equal('previousBestTimeS' in normalizeCounterweightCircuitState(r).lastResult, false);
});

test('progress consumes only the matching live handling witness, including shared dwell', () => {
  const state = bareState(), def = COUNTERWEIGHT_EVENT_BY_ID.split_decision;
  const fsm = createAttemptState(def, { attemptId: 1 });
  fsm.phase = 'running'; fsm.legIndex = 0; fsm.armedAt = 8;
  const attempt = { eventId: def.id, attemptId: 1, fsm, admissionPending: false };
  state.world.counterweightCircuit.attempt = attempt;
  const load = { id: 1, occupantGeneration: 3, alive: true }, receiver = { id: 2, occupantGeneration: 4, alive: true };
  state.entities.set(1, load); state.entities.set(2, receiver);
  fsm.mem.attachSeen.load_a = true;
  const body = { id: 1, occupantGeneration: 3, alive: true, pos: { x: 0, z: 0 }, vel: { x: 2, z: 0 }, radius: 5 };
  const shelf = { id: 2, occupantGeneration: 4, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 32, rot: 0 };
  const observation = { mode: 'flight', playerAlive: true, playerId: 99, simTime: 10,
    bodies: { load_a: body, shelf_a: shelf }, lines: [{ id: 'line-1', role: 'load_a', aId: 99, bId: 1 }],
    receivers: { 'load_a:shelf_a': { handlingSupported: true, bodyId: 1, bodyGeneration: 3,
      receiverId: 2, receiverGeneration: 4, relativeVelocity: { x: 2, z: 0 }, relativeSpeed: 2,
      speedLimit: 4, relativeSpin: 0, spinLimit: .25, firstUnmet: null, stable: true } } };
  const handling = projectCounterweightHandling({ def, fsm, observation,
    currentLives: { load_a: { id: 1, generation: 3 }, shelf_a: { id: 2, generation: 4 } },
    admitted: true, inFlight: true, inVenueSector: true, eventId: def.id, attemptId: 1 });
  assert.ok(handling, 'consumer receives the actual producer DTO');
  state.counterweightCircuitView = { eventId: def.id, attemptId: 1, phase: 'running', admission: null,
    journal: { attempt: { legIndex: 0 } }, handling };
  const progress = () => attemptProgressSpec(state, { attempt, simTime: state.simTime });
  assert.match(progress().detail, /Selected load stable · park both.*both: 0%/);
  handling.firstUnmet = 'mouth'; handling.stable = false;
  assert.match(progress().detail, /Enter through the mouth.*2\.0\/4\.0 u\/s/);
  receiver.occupantGeneration++;
  assert.doesNotMatch(progress().detail, /Enter through the mouth/);
  receiver.occupantGeneration--;
  state.simTime = 11;
  assert.doesNotMatch(progress().detail, /Enter through the mouth/);
  attempt.admissionPending = true;
  assert.match(progress().detail, /Preparing course/);
  assert.doesNotMatch(progress().detail, /Park each load/);
});
