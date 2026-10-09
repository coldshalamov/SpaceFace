// FB-127 — career origin and ladder decisions stand in the ship's own ledger.
//
// Ownership: the career systems emit outcome events; the story owner turns them into durable
// story facts (`state.story.facts`, kind 'career'); the ship ledger — a read-only projection —
// projects each fact as a `career` row from its authored template bank. This test drives the
// REAL emitters (the origins bundle offer and the framework ladder transitions, dispatched the
// same way the ladders system dispatches them) so the receipts, dedupe, and ledger rows are
// the running game's, not a mock's.
//
// Run: node --test test/fb-career-ledger.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { story as storyProto } from '../src/systems/story.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { validateShipLedgerTemplates } from '../src/data/shipLedgerTemplates.js';
import { offerCareerOriginsInFlight } from '../src/careers/origins/careerOrigins.js';
import {
  ensureLadderLeaf,
  ensureCareerLaddersState,
} from '../src/careers/ladders/ladderSchema.js';
import {
  transitionOffer,
  transitionAccept,
  transitionDecline,
  transitionAbandon,
  transitionCompleteStep,
  transitionFailStep,
  transitionRecoverStep,
  transitionResolveChoice,
} from '../src/careers/ladders/ladderShared.js';
import { HAULER_LADDER_DEF } from '../src/careers/ladders/haulerLadderDefs.js';
import { HUNTER_LADDER_DEF } from '../src/careers/ladders/hunterLadderDefs.js';

const SEED = 4242;

function makeHarness(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.playerId = 1;
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {} });
  const bus = createBus();
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, story };
}

function careerFacts(state) {
  return (state.story.facts || []).filter((f) => f.kind === 'career');
}
function careerRows(state) {
  return buildShipLedger(state, { pageSize: 24 }).entries.filter((e) => e.type === 'career');
}

/** The same fan-out careerLadders.dispatchResult performs on a transition's outcome events. */
function dispatch(h, result) {
  assert.ok(result && result.ok !== false, `transition must succeed: ${result && result.reason}`);
  for (const ev of result.events || []) if (ev && ev.event) h.bus.emit(ev.event, ev.payload);
  for (const i of result.intents || []) if (i && i.event) h.bus.emit(i.event, i.payload);
  return result;
}

test('FB-127: origin offers and declines land as ledger rows, one line per road', () => {
  const h = makeHarness();

  // The real bundle offer — same code the dock/flight seam calls.
  offerCareerOriginsInFlight(h.state, {}, h.bus);
  const offered = careerFacts(h.state).filter((f) => f.id.endsWith(':road'));
  assert.ok(offered.length >= 1, 'at least one live origin offer is recorded');
  assert.ok(offered.some((f) => f.id === 'career:hauler:road'), 'the hauler offer is on record');
  assert.ok(offered.every((f) => /was offered$/.test(f.text)), 'offers read as offers');

  let rows = careerRows(h.state);
  assert.ok(rows.length >= 1, 'the ledger carries a career row');
  assert.ok(rows.every((r) => r.sourceKind === 'story.facts.career'),
    'ledger rows cite the story-fact source, not a parallel writer');
  assert.ok(rows.some((r) => /Hauler/.test(r.text) || /hauler was offered/.test(r.text)),
    `ledger row reads the offer: ${rows.map((r) => r.text)}`);

  // Declining rewrites the same fact id — the ledger keeps ONE "road not taken" line.
  h.bus.emit('career:origins:declined', { careerId: 'hunter', nonBinding: true });
  h.bus.emit('career:origin:offered', { careerId: 'hunter' });
  h.bus.emit('career:origin:declined', { careerId: 'hunter', nonBinding: true });
  const road = careerFacts(h.state).find((f) => f.id === 'career:hunter:road');
  assert.ok(road, 'the hunter road is on record');
  assert.equal(road.text, 'hunter was offered and declined');
  const hunterRows = careerRows(h.state).filter((r) => r.sourceId === 'career:career:hunter:road');
  assert.equal(hunterRows.length, 1, 'offered + declined still read as one ledger row');
  assert.ok(/offered and declined/.test(hunterRows[0].text),
    `the row says the road was declined: ${hunterRows[0].text}`);
});

test('FB-127: the full ladder lifecycle — offered, chosen, steps, choice, recovery, completion', () => {
  const h = makeHarness();
  ensureCareerLaddersState(h.state);
  const own = ensureLadderLeaf(h.state, HAULER_LADDER_DEF);
  const t = () => h.state.simTime;

  dispatch(h, transitionOffer(own, HAULER_LADDER_DEF, t()));
  dispatch(h, transitionAccept(own, HAULER_LADDER_DEF, t()));
  assert.equal(own.stepIndex, 0);

  // Steps 0-1 complete; step 2 carries the authored lane-toll choice.
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));
  assert.equal(own.stepId, 'risk_lane_tax');
  dispatch(h, transitionResolveChoice(own, HAULER_LADDER_DEF, t(), 'pay_toll'));

  // A failed step recovers through the framework cooldown path.
  dispatch(h, transitionFailStep(own, HAULER_LADDER_DEF, t()));
  h.state.simTime += 40;
  dispatch(h, transitionRecoverStep(own, HAULER_LADDER_DEF, t(), { force: true }));

  // Finish the remaining steps — the ladder completes.
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));
  dispatch(h, transitionCompleteStep(own, HAULER_LADDER_DEF, t()));

  const ids = new Set(careerFacts(h.state).map((f) => f.id));
  for (const expected of [
    'career:hauler:road',            // offered
    'career:hauler:chosen',          // accepted (first stepActive)
    'career:hauler:broker_desk',     // a finished step
    'career:hauler:risk_lane_tax:pay_toll', // the step choice
    'career:hauler:risk_lane_tax:recovered',
    'career:hauler:complete',
  ]) {
    assert.ok(ids.has(expected), `missing career fact ${expected}`);
  }

  const rows = careerRows(h.state);
  const texts = rows.map((r) => r.text).join('\n');
  for (const needle of ['was offered', 'was chosen', 'finished broker_desk',
    'chose pay_toll', 'recovered risk_lane_tax', 'ladder was finished']) {
    assert.ok(texts.includes(needle), `ledger missing "${needle}" — got:\n${texts}`);
  }
});

test('FB-127: decline, re-offer, and abandon stay ledger-visible', () => {
  const h = makeHarness();
  ensureCareerLaddersState(h.state);
  const hunter = ensureLadderLeaf(h.state, HUNTER_LADDER_DEF);

  dispatch(h, transitionOffer(hunter, HUNTER_LADDER_DEF, h.state.simTime));
  dispatch(h, transitionDecline(hunter, HUNTER_LADDER_DEF, h.state.simTime));
  let road = careerFacts(h.state).find((f) => f.id === 'career:hunter:road');
  assert.equal(road.text, 'hunter was offered and declined');

  // A taken-up-then-abandoned run is its own row — the ledger does not hide regret.
  const hauler = ensureLadderLeaf(h.state, HAULER_LADDER_DEF);
  dispatch(h, transitionOffer(hauler, HAULER_LADDER_DEF, h.state.simTime));
  dispatch(h, transitionAccept(hauler, HAULER_LADDER_DEF, h.state.simTime));
  dispatch(h, transitionAbandon(hauler, HAULER_LADDER_DEF, h.state.simTime));
  assert.ok(careerFacts(h.state).some((f) => f.id === 'career:hauler:abandoned'));
  assert.ok(careerFacts(h.state).some((f) => f.id === 'career:hauler:chosen'));

  const texts = careerRows(h.state).map((r) => r.text).join('\n');
  assert.ok(/offered and declined/.test(texts), 'the declined road is in the ledger');
  assert.ok(/taken up and later let go/.test(texts), 'the abandoned run is in the ledger');
});

test('FB-127: career ledger rows survive save/load through the story fact list', () => {
  const h = makeHarness();
  h.bus.emit('career:origins:declined', { careerId: 'hunter', nonBinding: true });
  h.bus.emit('career:ladder:stepDone', { careerId: 'hauler', stepId: 'broker_desk' });
  h.bus.emit('career:ladder:completed', { careerId: 'hauler', receiptId: 'ladder_done:hauler' });
  assert.ok(careerFacts(h.state).length >= 3);
  const before = careerRows(h.state).map((r) => r.sourceId).sort();

  const blob = JSON.parse(JSON.stringify(h.story.serialize()));
  const h2 = makeHarness();
  h2.story.deserialize(blob);

  assert.deepEqual(
    careerFacts(h2.state).map((f) => f.id).sort(),
    careerFacts(h.state).map((f) => f.id).sort(),
    'the fact list round-trips',
  );
  assert.deepEqual(careerRows(h2.state).map((r) => r.sourceId).sort(), before,
    'the ledger projects the same rows after load');
});

test('FB-127: the career template bank satisfies the ledger schema contract', () => {
  const result = validateShipLedgerTemplates();
  assert.equal(result.ok, true, result.errors.join('; '));
});
