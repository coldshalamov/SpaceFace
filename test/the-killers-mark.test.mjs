// THE KILLER'S MARK — the hostile that puts the player's hull in the drift is minted into a
// durable named pilot carrying the `downed_you` boast: the record rides the same promoted-return
// queue as the fled-pirate ledger, the return speaks a "I already put you down once" line, and a
// second loss to the same pilot climbs the count. Named aces record the win in their last-fight
// memory; the nemesis, lawful hulls, civilians, scripted ships, environment and self kills mint
// nothing, and an ironman (non-recoverable) death never schedules a return. Headless; fixed seeds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { chronicler } from '../src/systems/chronicler.js';
import { promotedPilotIdFor, promotedPilotIdentity, lastFightLineFor } from '../src/data/pilotCallsigns.js';
import { aceById, ACE_GRUDGE_HUNT_AT } from '../src/data/namedAces.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, aceMemory, pirateDisengage, chronicler],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;

  const voiceLines = [];
  const aceSystem = sim.registry.get('aceMemory');
  aceSystem.helpers = {
    ...aceSystem.helpers,
    voice: {
      say(payload) {
        voiceLines.push(payload);
        return true;
      },
    },
  };
  const events = [];
  for (const name of [
    'aceMemory:pilotPromoted', 'aceMemory:transition', 'aceMemory:returnSpawned',
    'aceMemory:voice', 'toast',
  ]) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, voiceLines, events, aceSystem };
}

function spawnPirate(t, opts = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: opts.team ?? 1,
    pos: opts.pos || { x: 400, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 60,
    hull: opts.hull ?? 100,
    hullMax: opts.hullMax ?? 100,
    data: {
      enemyTypeId: 'corsair_raider',
      level: 4,
      intent: {},
      ai: {
        archetype: 'pirate_raider',
        squadId: opts.squadId || 'sq_test',
        forcePlayerTarget: true,
        hostileTeams: [0],
        ...(opts.ai || {}),
      },
      ...(opts.data || {}),
    },
  });
}

function emitPlayerDeath(t, killerId, extra = {}) {
  t.bus.emit('player:death', {
    killerId,
    recoverable: true,
    t: t.state.simTime,
    ...extra,
  });
}

function emitFled(t, entity, extra = {}) {
  t.bus.emit('pirateDisengage:triggered', {
    squadId: (entity.data && entity.data.ai && entity.data.ai.squadId) || 'sq_test',
    patrolId: null,
    memberIds: [entity.id],
    reason: 'damage-retreat',
    outcome: 'fled',
    t: t.state.simTime,
    ...extra,
  });
}

function promotedRecords(memory) {
  return Object.values(memory)
    .filter((rec) => rec && typeof rec === 'object' && rec.promoted === true);
}

function advanceTo(t, target) {
  if (t.state.simTime < target) t.state.simTime = target;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
}

test('the pirate that downs the player is minted into a named pilot with a hunting return', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);

  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  assert.ok(rec, 'a promoted record exists under the deterministic pilot id');
  assert.equal(rec.promoted, true);
  assert.equal(rec.grudgeKey, 'downed_you', 'the grudge names what the pilot did');
  assert.equal(rec.grudgeLabel, 'put you in the drift');
  assert.equal(rec.lastOutcome, 'downed');
  assert.equal(rec.downedCount, 1);
  assert.equal(rec.returnScheduled, true);
  assert.ok(Number.isFinite(rec.returnAt) && rec.returnAt > t.state.simTime,
    'the return is scheduled in the future');
  assert.ok(rec.grudge >= ACE_GRUDGE_HUNT_AT, 'a winning killer always hunts');
  assert.equal(rec.fled, false, 'a winner never fled — fledAt only anchors the expiry clock');
  assert.equal(rec.fleeCount, 0);
  assert.equal(rec.sourceEntityId, pirate.id);
  assert.equal(rec.signatureBark.includes('tide'), true, 'the mark carries a boast, not the got-away bark');

  const identity = promotedPilotIdentity(SEED, pirate.id);
  assert.equal(rec.name, identity.name);
  assert.equal(rec.crew, identity.crew);
  assert.equal(pirate.data.ai.name, identity.name, 'the hull wears the minted name at once');
  assert.equal(pirate.data.callsign, identity.name);
  assert.equal(pirate.data.promotedPilot.id, pilotId);
  assert.equal(pirate.data.promotedPilot.grudgeKey, 'downed_you');

  const promoted = t.events.find((row) => row.name === 'aceMemory:pilotPromoted');
  assert.ok(promoted, 'aceMemory:pilotPromoted fires');
  assert.equal(promoted.payload.aceId, pilotId);
  assert.equal(promoted.payload.reason, 'player_downed');
  assert.equal(promoted.payload.grudgeKey, 'downed_you');
  const downed = t.events.find((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === pilotId && row.payload.transition === 'downed');
  assert.ok(downed, 'the downed transition fires through the shared ace ledger');
  assert.ok(t.events.some((row) => row.name === 'toast' && row.payload.text.includes(identity.name)),
    'the mark is announced with the pilot name');

  // The chronicler holds the downed fact.
  const fact = t.state.chronicler.pending.find((f) => f.stage === 'ace'
    && f.subject && f.subject.id === pilotId && f.details.transition === 'downed');
  assert.ok(fact, 'chronicler captured the mark');
});

test('the marked pilot returns hunting and speaks the downed boast', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  const identity = promotedPilotIdentity(SEED, pirate.id);

  // The return is a later meeting — it defers while the marked hull is still physically
  // present. The player respawns at the recovery dock; once the killer is gone from the
  // field, the hunting return can fire.
  pirate.alive = false;
  advanceTo(t, rec.returnAt + 1);

  assert.equal(rec.stance, 'hunts');
  const spawned = t.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the marked return fires through the existing spawn path');
  const boss = t.state.entities.get(spawned.payload.spawnedIds[0]);
  assert.ok(boss && boss.alive !== false, 'the returning pilot is a live body');
  assert.equal(boss.data.aceMemory.aceId, pilotId);
  assert.equal(boss.data.aceMemory.promoted, true);
  assert.equal(boss.data.aceMemory.grudgeKey, 'downed_you');
  assert.equal(boss.data.ai.name, identity.name);
  assert.equal(boss.data.ai.forcePlayerTarget, true, 'the boast return is hostile');

  // First words: the last fight named — the raider-register downed line names the sector.
  const lastFight = t.events.find((row) => row.name === 'aceMemory:voice'
    && row.payload.aceId === pilotId && row.payload.situation === 'last-fight');
  assert.ok(lastFight, 'the return opens with the last-fight line');
  assert.ok(lastFight.payload.text.includes('Helios Prime'),
    `the downed boast names where it happened: ${lastFight.payload.text}`);
  // The "you again" beat: the grudge's own return line, naming the pilot.
  const taunt = t.events.find((row) => row.name === 'aceMemory:voice'
    && row.payload.aceId === pilotId && row.payload.situation === 'return-promoted');
  assert.ok(taunt, 'the promoted return line speaks');
  assert.ok(taunt.payload.text.includes(identity.name),
    `the boast names the pilot: ${taunt.payload.text}`);
});

test('a second loss to the same pilot climbs the count and the tier', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);
  t.state.simTime += 1;
  emitPlayerDeath(t, pirate.id);

  const promoted = promotedRecords(t.state.aceMemory);
  assert.equal(promoted.length, 1, 'the same hull marks one record');
  assert.equal(promoted[0].downedCount, 2, 'the second loss is counted');
  assert.equal(promoted[0].returnTier, 2, 'the return climbs a tier');
  assert.equal(promoted[0].grudgeKey, 'downed_you');
});

test('a marked pilot who later flees keeps the boast, not the fled grudge', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  emitFled(t, pirate);

  assert.equal(rec.grudgeKey, 'downed_you', 'the kill supersedes — the boast stays');
  assert.equal(rec.lastOutcome, 'downed', 'the flight record still reads the win');
  assert.equal(rec.fleeCount, 1, 'the escape is counted on top of the mark');
  assert.equal(rec.returnScheduled, true);
});

test('a named ace records the win and speaks the register line — no pilot minted', () => {
  const t = boot();
  const aceHull = spawnPirate(t, {
    squadId: 'sq_ace',
    data: { namedAceId: 'ace_maw_rake_veyra' },
    ai: { namedAceId: 'ace_maw_rake_veyra', encounterRole: 'boss' },
  });
  emitPlayerDeath(t, aceHull.id);

  const ace = aceById('ace_maw_rake_veyra');
  const rec = t.state.aceMemory[ace.id];
  assert.ok(rec, 'the ace record exists');
  assert.equal(rec.lastOutcome, 'downed', 'the win is on the last-fight record');
  assert.equal(rec.downedCount, 1);
  assert.equal(rec.encountered, true);
  assert.notEqual(rec.returnScheduled, true,
    'no return is armed — the ace is still physically present');
  assert.equal(promotedRecords(t.state.aceMemory).length, 0, 'no promoted pilot was minted');
  assert.equal(aceHull.data.promotedPilot, undefined, 'the named hull wears no pilot stamp');

  const line = lastFightLineFor(ace, rec, 7, 'Helios Prime');
  assert.ok(line.includes('Helios Prime'), `the register line names the place: ${line}`);

  const downed = t.events.find((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === ace.id && row.payload.transition === 'downed');
  assert.ok(downed, 'the ace win files a downed transition');
});

test('environment, self, lawful, scripted and non-recoverable deaths mint nothing', () => {
  const t = boot();
  const lawful = spawnPirate(t, { squadId: 'sq_law', ai: { lawful: true } });
  const scripted = spawnPirate(t, { squadId: 'sq_script', data: { missionTag: 'm_guard' } });
  const civilian = spawnPirate(t, { squadId: 'sq_civ', team: 2 });
  const rival = spawnPirate(t, { squadId: 'sq_rival', ai: { name: 'Sile Orra' } });
  const ordinary = spawnPirate(t, { squadId: 'sq_iron' });

  emitPlayerDeath(t, null);                                  // environment
  emitPlayerDeath(t, t.player.id);                           // self-kill
  emitPlayerDeath(t, lawful.id);                             // lawful patrol
  emitPlayerDeath(t, scripted.id);                           // mission-scripted hull
  emitPlayerDeath(t, civilian.id);                           // civilian traffic
  emitPlayerDeath(t, rival.id);                              // the nemesis owns its own arc
  emitPlayerDeath(t, ordinary.id, { recoverable: false });   // ironman — no return exists

  assert.equal(promotedRecords(t.state.aceMemory).length, 0,
    'no promoted record for any of these killers');
  assert.equal(t.state.aceMemory.ace_sile_orra, undefined,
    'the nemesis record is not touched by the shared ledger mark');
  assert.ok(!t.events.some((row) => row.name === 'aceMemory:transition'
    && row.payload.transition === 'downed'), 'no downed transition fired');
});

test('marked records round-trip a save/load and still return with the same boast', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  const snapshot = JSON.parse(JSON.stringify(t.aceSystem.serialize()));

  const t2 = boot();
  t2.aceSystem.deserialize(snapshot);
  const restored = t2.state.aceMemory[pilotId];
  assert.ok(restored && restored.promoted === true, 'the marked record survives the load');
  assert.equal(restored.name, rec.name);
  assert.equal(restored.grudgeKey, 'downed_you');
  assert.equal(restored.lastOutcome, 'downed');
  assert.equal(restored.downedCount, 1);
  assert.equal(restored.returnAt, rec.returnAt);
  assert.equal(restored.returnScheduled, true);

  advanceTo(t2, restored.returnAt + 1);
  const spawned = t2.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the reloaded mark still returns');
  const boss = t2.state.entities.get(spawned.payload.spawnedIds[0]);
  assert.ok(boss, 'the return body exists after load');
  assert.equal(boss.data.aceMemory.grudgeKey, 'downed_you');
  assert.equal(boss.data.ai.name, rec.name);
});

test('a marked pilot that is later killed by the player settles like any rival', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitPlayerDeath(t, pirate.id);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];

  t.bus.emit('entity:killed', { id: pirate.id, killerId: t.player.id, type: 'ship' });
  assert.equal(rec.defeated, true, 'killing the marked pilot settles the record');
  assert.equal(rec.returnScheduled, false);
  const defeated = t.events.find((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === pilotId && row.payload.transition === 'defeated');
  assert.ok(defeated, 'the defeat is a chronicled transition');
});
