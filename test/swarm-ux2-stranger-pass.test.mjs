// DEMO-SWARM-UX-2 — what a stranger misreads in a Swarm fight (words, summary, shares).
// Swarm stranger pass, owner demo 2026-11-23. Pure rules only: the DOM lanes are proved in
// test/swarm-hud-2.test.mjs and test/pq-160-02-share-code.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextFlightDecision } from '../src/ui/orrery/nextDecision.js';
import { swarmRoundTally } from '../src/data/swarmJuice.js';
import { buildShareBand } from '../src/ui/screens/crucible.js';
import { causalSurvivorPodsGatedOut } from '../src/systems/survivorPod.js';
import { selfSlingCalloutText } from '../src/ui/stuntCallout.js';

test('the round tally reads as plain counts, never a multiplier or a duplicated row', () => {
  const rows = swarmRoundTally({ flawless: true, durationS: 20, kills: 40, bestChain: 44 });
  assert.deepEqual(rows.map((r) => r.label), ['Flawless', 'Cleared in', 'Room kills', 'Best chain']);
  assert.deepEqual(rows.map((r) => r.value), ['no hull lost', '20 s', '40', '44']);
  assert.equal(new Set(rows.map((r) => r.label)).size, rows.length, 'each line once');
});

test('a Swarm hull warning does not order a disengage the arena cannot offer', () => {
  const model = { hull: 20, hullMax: 100, shield: 40, shieldMax: 50, heat: 0.2 };
  assert.equal(nextFlightDecision(model, { swarm: true }), 'Hull critical');
  assert.equal(nextFlightDecision(model), nextFlightDecision(model, {}), 'Adventure keeps its own line');
});

test('a self-sling never prints a zero reward', () => {
  assert.equal(selfSlingCalloutText(0), '');
  assert.equal(selfSlingCalloutText(-2), '');
});

test('no settled record means no run code to contradict "no flight record"', () => {
  assert.equal(buildShareBand(null), null);
});

test('a live Swarm run has no rescue economy, so no mayday pod', () => {
  assert.equal(causalSurvivorPodsGatedOut({ run: { kind: 'survival', ruleset: 'swarm' } }), true);
  assert.equal(causalSurvivorPodsGatedOut({ run: { kind: 'survival', ruleset: 'gauntlet' } }), false);
});
