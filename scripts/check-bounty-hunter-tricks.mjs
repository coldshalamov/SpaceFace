#!/usr/bin/env node
// BP-13/B17 Hunter's Signature Trick.
//
// Each hunter gets one authored trick with a readable telegraph, one existing verb mapping, and a
// deterministic counter-window before activation. This is headless: no render/flight/combat edits.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  HUNTER_TRICKS,
  HUNTER_TRICK_IDS,
  hunterTrickForContract,
} from '../src/data/hunterTricks.js';
import {
  bountyHunt,
  bountyHunterTrickStateFor,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../src/systems/bountyHunt.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in bounty hunter trick path'); };
  Date.now = () => { throw new Error('Date.now in bounty hunter trick path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testTrickCatalog);
guarded(testEmergencyJumpTelegraphsBeforeActivation);
guarded(testSeededRunsAreIdentical);

console.log(`[check-bounty-hunter-tricks] PASS - ${sections} sections green`);

function boot(seed = 1717) {
  const voiceLines = [];
  const sim = createSimulation({
    seed,
    systems: [bountyHunt],
    helpers: {
      voice: {
        say(payload) {
          voiceLines.push(payload);
          return true;
        },
      },
    },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 0;
  const events = { telegraphs: [], activations: [], voiceLines };
  bus.on('bountyHunt:trickTelegraph', (p) => events.telegraphs.push(p));
  bus.on('bountyHunt:trickActivated', (p) => events.activations.push(p));
  return { sim, state, sys: sim.registry.get('bountyHunt'), events };
}

function setupHunter(t, {
  contractId = 'contract-trick',
  trick = 'emergency-jump-spool',
  hunterPos = { x: 0, z: 0 },
  quarryPos = { x: 180, z: 0 },
} = {}) {
  const quarry = t.sim.spawn(makeBountyQuarrySpec({
    contractId,
    pos: quarryPos,
  }));
  const hunter = t.sim.spawn(makeBountyHunterSpec({
    contractId,
    contractTargetId: quarry.id,
    trick,
    pos: hunterPos,
  }));
  t.sys.update(0.1, t.state);
  return { hunter, quarry };
}

function testTrickCatalog() {
  assert.deepEqual(HUNTER_TRICK_IDS, [
    'tether-cutter',
    'mine-dropper',
    'phase-jammer',
    'shield-turtle',
    'ram-plate',
    'decoy-clone',
    'emergency-jump-spool',
  ], 'catalog contains the seven spec tricks in stable order');

  const verbKinds = new Set();
  for (const id of HUNTER_TRICK_IDS) {
    const trick = HUNTER_TRICKS[id];
    assert.equal(trick.id, id, `${id} is keyed by id`);
    assert.equal(typeof trick.telegraph, 'string', `${id} has a telegraph string`);
    assert.match(trick.telegraph, /\S/, `${id} telegraph is non-empty`);
    assert.equal(Number.isFinite(trick.counterWindowS), true, `${id} has a numeric counter window`);
    assert.ok(trick.counterWindowS >= 0.75, `${id} counter window is readable`);
    assert.equal(typeof trick.verb, 'object', `${id} maps to one existing verb object`);
    assert.equal(Object.keys(trick.verb).length, 2, `${id} verb mapping stays singular`);
    assert.equal(typeof trick.verb.kind, 'string', `${id} verb has a kind`);
    assert.equal(typeof trick.verb.event, 'string', `${id} verb has an event`);
    verbKinds.add(trick.verb.kind);
  }
  assert.equal(verbKinds.size, HUNTER_TRICK_IDS.length, 'each trick maps to its own existing verb kind');
  ok('hunter trick catalog has telegraphs and one existing verb per trick');
}

function testEmergencyJumpTelegraphsBeforeActivation() {
  const t = boot();
  const { hunter } = setupHunter(t);

  const first = bountyHunterTrickStateFor(t.state, hunter.id);
  assert.equal(first.trickId, 'emergency-jump-spool', 'hunter carries the explicit emergency jump trick');
  assert.equal(first.phase, 'telegraphing', 'first update starts telegraph before activation');
  assert.equal(t.events.telegraphs.length, 1, 'one trick telegraph event emitted');
  assert.equal(t.events.activations.length, 0, 'no activation happens during the counter window');
  assert.equal(t.events.voiceLines.length, 1, 'one telegraph bark sent through voice helper');
  assert.match(t.events.voiceLines[0].text, /jump spool/i, 'telegraph bark names the trick');

  const beforeJump = hunter.pos && { x: hunter.pos.x, z: hunter.pos.z };
  t.state.simTime += Math.max(first.counterWindowS - 0.1, 0.01);
  t.sys.update(0.1, t.state);
  assert.equal(t.events.activations.length, 0, 'counter-window still prevents early activation');

  t.state.simTime += 0.2;
  t.sys.update(0.1, t.state);
  const after = bountyHunterTrickStateFor(t.state, hunter.id);
  assert.equal(after.phase, 'cooldown', 'hunter enters cooldown after activation');
  assert.equal(t.events.activations.length, 1, 'activation event emitted after counter window');
  assert.equal(t.events.activations[0].verb.kind, 'emergency_jump', 'activation uses the emergency jump verb');
  assert.notDeepEqual({ x: hunter.pos.x, z: hunter.pos.z }, beforeJump, 'existing jump-position verb moves the hunter');
  ok('emergency jump telegraphs before activating');
}

function testSeededRunsAreIdentical() {
  const a = runDeterministicTrace(4242);
  const b = runDeterministicTrace(4242);
  assert.deepEqual(a, b, 'same seed and contract produce identical trick trace');
  assert.equal(hunterTrickForContract('contract-seeded', 4242).id, a.assignedTrick, 'pure assignment matches runtime');
  ok('hunter trick assignment and activation are deterministic');
}

function runDeterministicTrace(seed) {
  const t = boot(seed);
  const { hunter } = setupHunter(t, {
    contractId: 'contract-seeded',
    trick: null,
    hunterPos: { x: -40, z: 20 },
    quarryPos: { x: 80, z: 20 },
  });
  const first = bountyHunterTrickStateFor(t.state, hunter.id);
  t.state.simTime += first.counterWindowS + 0.05;
  t.sys.update(0.1, t.state);
  const after = bountyHunterTrickStateFor(t.state, hunter.id);
  return {
    assignedTrick: first.trickId,
    phase: after.phase,
    activation: t.events.activations[0],
    pos: { x: round(hunter.pos.x), z: round(hunter.pos.z) },
  };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
