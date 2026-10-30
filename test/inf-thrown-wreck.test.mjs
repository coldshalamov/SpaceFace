// The ricochet gets noticed (seed: "a kill that ricochets into a second kill and the game
// noticing"). The credit chain already existed — collisionConsequences re-stamps the original
// thrower's provenance onto the struck hull — but nothing told the player the world saw it. Now
// a collision kill whose fresh impact link classifies as the player's own indirect cause records
// a Thrown-wreck deed and emits the seam a surviving wingmate speaks on. Driven through the real
// deedRecord system and the real bark bank.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { deedRecord, DEED_KINDS, peekDeedRecord } from '../src/systems/deedRecord.js';
import { thrownWreckBarkFor } from '../src/data/barks.js';

function killPayload({ cause = 'terrain_collision', actorId = 'player', tag = 'massline_throw',
  impactorId = null, killerId = 'player', victimId = 'raider-2' } = {}) {
  return {
    id: victimId,
    killerId,
    type: 'ship',
    pos: { x: 100, z: -40 },
    factionId: 'faction_raider',
    factionLawful: false,
    targetHostileToPlayer: true,
    victimClass: 'raider',
    impactorId,
    presentation: {
      version: 1,
      cause,
      surface: cause === 'terrain_collision' ? 'terrain' : 'craft',
      playerCaused: killerId === 'player',
      // applied 60 ticks before the kill, hold still live — a fresh chain stamp, the shape
      // collisionConsequences writes when the thrown hull strikes its second victim.
      impactLink: { actorId, tag, appliedTick: 1340, holdUntilTick: 1460 },
    },
  };
}

function system() {
  const state = { playerId: 'player', tick: 1400, simTime: 30, world: { currentSectorId: 'sector_helios_prime' } };
  const bus = createBus();
  const events = [];
  const sys = Object.create(deedRecord);
  sys.init({ state, bus, registry: null });
  // capture the seam without instantiating the whole bark director
  bus.on('combat:thrownWreck', (p) => events.push(p));
  return { sys, state, bus, events };
}

test('the ricochet deed lands and the seam fires for a thrown-hull collision kill', () => {
  const { sys, state, events } = system();
  sys._onKilled(killPayload());
  const deeds = peekDeedRecord(state).deeds;
  const thrown = deeds.find((d) => d.kind === 'kill_thrown');
  assert.ok(thrown, 'the Thrown-wreck deed is recorded');
  assert.equal(thrown.id, 'kill_thrown:raider-2');
  assert.equal(thrown.detail.cause, 'terrain_collision');
  assert.ok(events.length === 1, `one seam event, got ${events.length}`);
  assert.equal(events[0].victimId, 'raider-2');
  assert.equal(events[0].cause, 'terrain_collision');
});

test('the underlying kill still records its own lawful/outlaw weight beside it', () => {
  const { sys, state } = system();
  sys._onKilled(killPayload());
  const kinds = peekDeedRecord(state).deeds.map((d) => d.kind);
  assert.ok(kinds.includes('kill_outlaw'), 'the hostile kill keeps its civic deed');
  assert.ok(kinds.includes('kill_thrown'));
});

test('a hull they shot down is not a thrown wreck: no link, no seam', () => {
  const { sys, events } = system();
  sys._onKilled(killPayload({ cause: 'kinetic', actorId: null, impactorId: null }));
  assert.equal(events.length, 0);
  const record = peekDeedRecord(sys.state);
  assert.ok(!record.deeds.some((d) => d.kind === 'kill_thrown'));
});

test('someone else\'s ricochet is not yours: accidental class stays silent', () => {
  const { sys, events } = system();
  sys._onKilled(killPayload({ actorId: 'npc-shooter', tag: 'direct_contact' }));
  assert.equal(events.length, 0);
  assert.ok(!peekDeedRecord(sys.state).deeds.some((d) => d.kind === 'kill_thrown'));
});

test('a stale link is not a claim: the window gate holds', () => {
  const { sys, events } = system();
  sys.state.tick = 1400 + 200; // the chain stamp is 260 ticks old, its hold long lapsed
  sys._onKilled(killPayload({ tag: 'environment', actorId: 'player' }));
  assert.equal(events.length, 0);
  assert.ok(!peekDeedRecord(sys.state).deeds.some((d) => d.kind === 'kill_thrown'));
});

test('the thrown-wreck kind reads as street credit, not a crime', () => {
  const spec = DEED_KINDS.kill_thrown;
  assert.equal(spec.law, 0);
  assert.equal(spec.street, 1);
});

test('the witness bank speaks the physics, in one register', () => {
  const lines = new Set([0, 1, 2, 3, 4].map((i) => thrownWreckBarkFor(i * 7919)));
  assert.ok(lines.size >= 1 && [ ...lines ].every((l) => typeof l === 'string' && l.length > 8));
  assert.ok([ ...lines ].some((l) => /threw|sent in|collision|moving/.test(l)),
    'the lines name the physics, not a grudge');
});
